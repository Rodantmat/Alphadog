// alphadog-v2-scoring-runner.js
// Simple, single-request scoring-full-run runner - same design as board/daily-context/market
// runners. One request, sequential awaited service-binding calls to the 9 existing,
// already-tested stage workers, in the exact order the old orchestrator's SCORING_FULL_RUN_STAGES
// used (hit-probability-board runs before scoring-engine per the 2026-07-17 reorder). No queue
// table, no lock table, no cross-request resume state.
//
// This chain has real inter-stage dependencies (each stage reads what the previous one wrote),
// so stages run strictly in sequence and a failure is reported clearly per-stage rather than
// silently continuing past a broken dependency.

import postgres from "postgres";

const SCORING_LOCK_KEY = "alphadog_scoring_full_run";

async function tryAcquireLock(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    let rows = await client`SELECT pg_try_advisory_lock(hashtext(${SCORING_LOCK_KEY})) as acquired`;
    if (!(rows && rows[0] && rows[0].acquired)) {
      const holders = await client`
        SELECT a.pid, a.state, EXTRACT(EPOCH FROM (now() - a.state_change))::int as idle_seconds
        FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory' AND l.objid = hashtext(${SCORING_LOCK_KEY})`;
      const staleHolders = (holders || []).filter(h => h.state === "idle" && Number(h.idle_seconds || 0) > 90);
      if (staleHolders.length) {
        for (const h of staleHolders) {
          await client`SELECT pg_terminate_backend(${h.pid})`.catch(() => {});
        }
        rows = await client`SELECT pg_try_advisory_lock(hashtext(${SCORING_LOCK_KEY})) as acquired`;
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
    await client`SELECT pg_advisory_unlock(hashtext(${SCORING_LOCK_KEY}))`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

const WORKER_NAME = "alphadog-v2-scoring-runner";
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

async function callStage(binding, bindingName, mode, input, attempt = 1) {
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
      elapsed_ms: Date.now() - started,
      attempts: attempt
    };
  } catch (err) {
    if (attempt < 2) {
      return await callStage(binding, bindingName, mode, input, attempt + 1);
    }
    return {
      stage: bindingName,
      mode,
      ok: false,
      data_ok: false,
      error: String(err && err.message ? err.message : err),
      elapsed_ms: Date.now() - started,
      attempts: attempt
    };
  }
}

// Same order as the old orchestrator's SCORING_FULL_RUN_STAGES (post 2026-07-17 reorder:
// hit_probability_board before scoring_engine).
const STAGES = [
  { bindingKey: "SCORING_CERTIFIER_WORKER", bindingName: "scoring-full-run-certifier", mode: "scoring_full_run_certifier_first_pass" },
  { bindingKey: "PROP_FACTOR_MINER_WORKER", bindingName: "prop-factor-miner", mode: "hitter_prop_factor_mining" },
  { bindingKey: "PROP_FACTOR_MINER_WORKER", bindingName: "prop-factor-miner", mode: "pitcher_prop_factor_mining" },
  { bindingKey: "MATRIX_BUILDER_WORKER", bindingName: "prop-matrix-builder", mode: "matrix_build" },
  { bindingKey: "ENRICHMENT_ENGINE_WORKER", bindingName: "enrichment-engine", mode: "enrichment_run" },
  { bindingKey: "HIT_PROBABILITY_BOARD_WORKER", bindingName: "hit-probability-board", mode: "hit_probability_board_run" },
  { bindingKey: "SCORING_ENGINE_WORKER", bindingName: "scoring-engine-shadow-v1", mode: "scoring_engine_run" },
  { bindingKey: "SCORE_FINAL_BOARD_WORKER", bindingName: "score-final-board", mode: "final_board_run" },
  { bindingKey: "SCORING_CERTIFIER_WORKER", bindingName: "scoring-full-run-certifier", mode: "scoring_full_run_certifier_last_pass" }
];

async function runScoringFullRun(env, input) {
  const runId = `scoring_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      certification: "SCORING_FULL_RUN_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      stages: []
    };
  }

  try {
    return await runScoringFullRunLocked(env, input, runId, startedAt);
  } finally {
    await releaseLock(lock.client);
  }
}

async function runScoringFullRunLocked(env, input, runId, startedAt) {
  const stages = [];

  for (const s of STAGES) {
    const result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}_${s.mode}`, chain_id: runId, trigger: "scoring_runner" });
    stages.push(result);
    if (!result.ok) break; // every later stage reads what this one wrote - do not proceed on real failure
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
    certification: allOk ? "SCORING_FULL_RUN_COMPLETE" : (lastStageOk ? "SCORING_FULL_RUN_PARTIAL_NONCRITICAL_FAILURE" : "SCORING_FULL_RUN_FAILED"),
    stages
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScoringFullRun(env, { trigger: "cron", cron: event.cron }));
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
        bindings_present: Object.fromEntries(STAGES.map(s => [s.bindingKey, !!env[s.bindingKey]]))
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const result = await runScoringFullRun(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
