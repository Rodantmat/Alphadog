// alphadog-v2-market-runner.js
// Simple, single-request market-full-run runner - same design as board-runner and
// daily-context-runner. One request, sequential awaited service-binding calls to the 5 existing,
// already-tested stage workers, in the exact order the old orchestrator's MARKET_FULL_RUN_STAGES
// used. No queue table, no lock table, no cross-request resume state.

import postgres from "postgres";

const MARKET_LOCK_KEY = "alphadog_market_full_run";

async function tryAcquireLock(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    let rows = await client`SELECT pg_try_advisory_lock(hashtext(${MARKET_LOCK_KEY})) as acquired`;
    if (!(rows && rows[0] && rows[0].acquired)) {
      const holders = await client`
        SELECT a.pid, a.state, EXTRACT(EPOCH FROM (now() - a.state_change))::int as idle_seconds
        FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory' AND l.objid = hashtext(${MARKET_LOCK_KEY})`;
      const staleHolders = (holders || []).filter(h => h.state === "idle" && Number(h.idle_seconds || 0) > 90);
      if (staleHolders.length) {
        for (const h of staleHolders) {
          await client`SELECT pg_terminate_backend(${h.pid})`.catch(() => {});
        }
        rows = await client`SELECT pg_try_advisory_lock(hashtext(${MARKET_LOCK_KEY})) as acquired`;
      }
    }
    return { acquired: !!(rows && rows[0] && rows[0].acquired), client };
  } catch (err) {
    try { await client.end({ timeout: 1 }); } catch (_) {}
    return { acquired: false, client: null, error: String(err && err.message ? err.message : err) };
  }
}

async function releaseLock(client) {
  if (!client) return;
  try {
    await client`SELECT pg_advisory_unlock(hashtext(${MARKET_LOCK_KEY}))`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

const WORKER_NAME = "alphadog-v2-market-runner";
const VERSION = "v1.0.0";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function callStage(binding, bindingName, mode, input) {
  const started = Date.now();
  if (!binding || typeof binding.fetch !== "function") {
    return {
      stage: bindingName,
      ok: false,
      data_ok: false,
      error: `missing_service_binding_${bindingName}`,
      elapsed_ms: Date.now() - started
    };
  }
  try {
    const resp = await binding.fetch(`https://internal.${bindingName}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, ...(input || {}) })
    });
    let output;
    try {
      output = await resp.json();
    } catch (parseErr) {
      output = { ok: false, data_ok: false, error: "non_json_response", parse_error: String(parseErr) };
    }
    return {
      stage: bindingName,
      mode,
      ok: !!output.ok,
      data_ok: !!output.data_ok,
      http_status: resp.status,
      certification: output.certification || output.status || null,
      rows_read: output.rows_read ?? null,
      rows_written: output.rows_written ?? null,
      error: output.ok ? null : (output.error || output.certification || "stage_failed"),
      elapsed_ms: Date.now() - started
    };
  } catch (err) {
    return {
      stage: bindingName,
      mode,
      ok: false,
      data_ok: false,
      error: String(err && err.message ? err.message : err),
      elapsed_ms: Date.now() - started
    };
  }
}

// Same order as the old orchestrator's MARKET_FULL_RUN_STAGES.
const STAGES = [
  { bindingKey: "MARKET_CERTIFIER_WORKER", bindingName: "market-certifier", mode: "market_full_run_certifier_first_pass" },
  { bindingKey: "MARKET_NORMALIZER_WORKER", bindingName: "market-normalizer", mode: "market_teams_game_odds" },
  { bindingKey: "MARKET_LINE_SHAPE_CLASSIFIER_WORKER", bindingName: "market-line-shape-classifier", mode: "market_hitter_prop_line_context" },
  { bindingKey: "MARKET_LINE_SHAPE_CLASSIFIER_WORKER", bindingName: "market-line-shape-classifier", mode: "market_pitcher_prop_line_context" },
  { bindingKey: "MARKET_CERTIFIER_WORKER", bindingName: "market-certifier", mode: "market_full_run_certifier_last_pass" }
];

async function runMarketFullRun(env, input) {
  const runId = `market_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = nowIso();

  const lock = await tryAcquireLock(env);
  if (!lock.acquired) {
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      run_id: runId,
      started_at: startedAt,
      finished_at: nowIso(),
      certification: "MARKET_FULL_RUN_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      stages: []
    };
  }

  try {
    return await runMarketFullRunLocked(env, input, runId, startedAt);
  } finally {
    await releaseLock(lock.client);
  }
}

async function runMarketFullRunLocked(env, input, runId, startedAt) {
  const stages = [];

  for (const s of STAGES) {
    const result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}_${s.mode}`, trigger: "market_runner" });
    stages.push(result);
  }

  const allOk = stages.every(s => s.ok);
  const lastStageOk = stages.length && stages[stages.length - 1].ok;

  return {
    ok: allOk,
    data_ok: lastStageOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(),
    certification: allOk ? "MARKET_FULL_RUN_COMPLETE" : (lastStageOk ? "MARKET_FULL_RUN_PARTIAL_NONCRITICAL_FAILURE" : "MARKET_FULL_RUN_FAILED"),
    stages
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMarketFullRun(env, { trigger: "cron", cron: event.cron }));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "GET" && path === "/health") {
      return jsonResponse({
        ok: true,
        worker_name: WORKER_NAME,
        version: VERSION,
        bindings_present: {
          MARKET_CERTIFIER_WORKER: !!env.MARKET_CERTIFIER_WORKER,
          MARKET_NORMALIZER_WORKER: !!env.MARKET_NORMALIZER_WORKER,
          MARKET_LINE_SHAPE_CLASSIFIER_WORKER: !!env.MARKET_LINE_SHAPE_CLASSIFIER_WORKER
        }
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const result = await runMarketFullRun(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
