// alphadog-v2-market-runner.js
// [2026-07-28: re-enabled own independent cron trigger, T+10 - see generate_wrangler_configs.py]
// Simple, single-request market-full-run runner - same design as board-runner and
// daily-context-runner. One request, sequential awaited service-binding calls to the 5 existing,
// already-tested stage workers, in the exact order the old orchestrator's MARKET_FULL_RUN_STAGES
// used. No queue table, no lock table, no cross-request resume state.

import postgres from "postgres";

const MARKET_LOCK_KEY = "alphadog_market_full_run";
const LOCK_HOLD_MINUTES = 10;

async function selfCleanupAfterPhase(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  const result = { terminated_connections: 0, cleared_locks: [], reset_batches: 0 };
  try {
    const idleConns = await client`
      SELECT pid FROM pg_stat_activity
      WHERE state = 'idle' AND pid != pg_backend_pid() AND state_change < now() - interval '2 minutes'`.catch(() => []);
    for (const row of idleConns) {
      try { await client`SELECT pg_terminate_backend(${row.pid})`; result.terminated_connections++; } catch (_) {}
    }
    await client`CREATE TABLE IF NOT EXISTS control.runner_locks (lock_key TEXT PRIMARY KEY, locked_until TIMESTAMPTZ, holder TEXT, acquired_at TIMESTAMPTZ)`;
    const stale = await client`SELECT lock_key, holder FROM control.runner_locks WHERE locked_until IS NOT NULL AND locked_until < now()`;
    if (stale.length) {
      await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE locked_until IS NOT NULL AND locked_until < now()`;
      result.cleared_locks = stale.map(r => ({ lock_key: r.lock_key, prior_holder: r.holder }));
    }
    const staleTables = [
      { schema: "scoring", table: "prop_matrix_batches" },
      { schema: "scoring", table: "prop_factor_batches" },
      { schema: "score", table: "hp_board_batches" }
    ];
    for (const t of staleTables) {
      try {
        const res = await client.unsafe(`UPDATE ${t.schema}.${t.table} SET status='abandoned_stale_cleanup_after_phase', updated_at=now() WHERE status LIKE 'running%' AND updated_at < now() - interval '10 minutes'`);
        result.reset_batches += res.count || 0;
      } catch (_) {}
    }
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
  return result;
}

async function tryAcquireLock(env, holderId) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`CREATE TABLE IF NOT EXISTS control.runner_locks (lock_key TEXT PRIMARY KEY, locked_until TIMESTAMPTZ, holder TEXT, acquired_at TIMESTAMPTZ)`;
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${MARKET_LOCK_KEY}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${MARKET_LOCK_KEY} AND (locked_until IS NULL OR locked_until < now())
      RETURNING lock_key`;
    return { acquired: rows.length > 0, client };
  } catch (err) {
    try { await client.end({ timeout: 1 }); } catch (_) {}
    return { acquired: false, client: null, error: String(err && err.message ? err.message : err) };
  }
}

async function releaseLock(client, holderId) {
  if (!client) return;
  try {
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${MARKET_LOCK_KEY} AND holder = ${holderId}`;
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

  const lock = await tryAcquireLock(env, runId);
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
    await releaseLock(lock.client, runId);
  }
}

async function runMarketFullRunLocked(env, input, runId, startedAt) {
  const stages = [];

  for (const s of STAGES) {
    const result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}_${s.mode}`, trigger: "market_runner" });
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
    certification: allOk ? "MARKET_FULL_RUN_COMPLETE" : (lastStageOk ? "MARKET_FULL_RUN_PARTIAL_NONCRITICAL_FAILURE" : "MARKET_FULL_RUN_FAILED"),
    stages
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMarketFullRun(env, { trigger: "cron", cron: event.cron }).finally(() => selfCleanupAfterPhase(env)));
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
      const workPromise = runMarketFullRun(env, input);
      ctx.waitUntil(workPromise.catch(() => {}).finally(() => selfCleanupAfterPhase(env)));
      const result = await workPromise;
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
