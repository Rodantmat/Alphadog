// alphadog-v2-scoring-runner-matrix.js  -- PART 1b [retry deploy touch 2]
// Confirmed live (2026-07-29): matrix-builder is the real bottleneck in the scoring chain - even
// paired with just certifier-first-pass + prop-factor-miner, the combination exceeded a
// 15-minute window on a heavy real-data day, with matrix-builder itself making zero progress for
// 20+ minutes before the invocation was killed. This worker exists solely to give matrix-builder
// its own fully isolated 15-minute budget, with nothing else competing for it.
//
// DEPENDABILITY / CASCADE: only proceeds if Part 1's output (prop-factor packets) is genuinely
// fresh. Checks both scoring.prop_factor_hitter_packets and scoring.prop_factor_pitcher_packets.
// If Part 1 hasn't finished recently, this returns a clear "skipped, waiting for part1" result
// rather than running on stale data.

import postgres from "postgres";

const LOCK_KEY = "alphadog_scoring_full_run_part1b_matrix";
const LOCK_HOLD_MINUTES = 15;
const MAX_PACKET_STALENESS_MINUTES = 20; // Part 1 fires 8 min before this worker in the schedule.

async function selfCleanupAfterPhase(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  const result = { terminated_connections: 0, cleared_locks: [], reset_batches: 0 };
  try {
    // Terminate genuinely idle Postgres backend connections older than 2 minutes - the real
    // target per direct clarification: stale connections are what actually strain Postgres and
    // compound into cascading slowness across every downstream stage. A process should clean up
    // after itself so stale state is never generated in the first place, rather than relying on
    // the next run to discover and clear it. Never touches this connection's own backend.
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
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${LOCK_KEY}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${LOCK_KEY} AND (locked_until IS NULL OR locked_until < now())
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
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${LOCK_KEY} AND holder = ${holderId}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function checkPart1Freshness(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    const rows = await client`SELECT
      (SELECT MAX(updated_at) FROM scoring.prop_factor_hitter_packets) AS hitter_last,
      (SELECT MAX(updated_at) FROM scoring.prop_factor_pitcher_packets) AS pitcher_last`;
    const hitterLast = rows[0] && rows[0].hitter_last;
    const pitcherLast = rows[0] && rows[0].pitcher_last;
    const oldest = [hitterLast, pitcherLast].filter(Boolean).sort()[0];
    if (!oldest) return { fresh: false, reason: "no_packet_data_at_all" };
    const ageMinutes = (Date.now() - new Date(oldest).getTime()) / 60000;
    return { fresh: ageMinutes <= MAX_PACKET_STALENESS_MINUTES, reason: ageMinutes <= MAX_PACKET_STALENESS_MINUTES ? "fresh" : "stale", hitter_last: hitterLast, pitcher_last: pitcherLast, age_minutes: Math.round(ageMinutes * 10) / 10 };
  } catch (err) {
    return { fresh: false, reason: "check_failed", error: String(err && err.message ? err.message : err) };
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

const WORKER_NAME = "alphadog-v2-scoring-runner-matrix";
const VERSION = "v1.0.0";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function nowIso() { return new Date().toISOString(); }

async function callStage(binding, bindingName, mode, input, attempt = 1) {
  const started = Date.now();
  if (!binding || typeof binding.fetch !== "function") {
    return { stage: bindingName, ok: false, data_ok: false, error: `missing_service_binding_${bindingName}`, elapsed_ms: Date.now() - started };
  }
  try {
    const resp = await binding.fetch(`https://internal.${bindingName}/run`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, ...(input || {}) })
    });
    let output;
    try { output = await resp.json(); } catch (parseErr) { output = { ok: false, data_ok: false, error: "non_json_response", parse_error: String(parseErr) }; }
    return {
      stage: bindingName, mode, ok: !!output.ok, data_ok: !!output.data_ok, http_status: resp.status,
      certification: output.certification || output.status || null,
      rows_read: output.rows_read ?? null, rows_written: output.rows_written ?? null,
      error: output.ok ? null : (output.error || output.certification || "stage_failed"),
      elapsed_ms: Date.now() - started, attempts: attempt
    };
  } catch (err) {
    if (attempt < 2) return await callStage(binding, bindingName, mode, input, attempt + 1);
    return { stage: bindingName, mode, ok: false, data_ok: false, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started, attempts: attempt };
  }
}

async function runMatrixStage(env, input) {
  const runId = `scoring_matrix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = nowIso();
  const preflight = await selfCleanupAfterPhase(env);

  let freshness = await checkPart1Freshness(env);
  let freshnessRetries = 0;
  // Rather than padding the schedule to cover Part 1's rare worst-case duration, wait and
  // recheck here instead - this is genuinely just waiting on upstream data, not doing real work,
  // so a few minutes of in-invocation delay is cheap and keeps the typical-day schedule tight.
  while (!freshness.fresh && !input.skip_freshness_check && freshnessRetries < 2) {
    await new Promise(r => setTimeout(r, 3 * 60 * 1000));
    freshness = await checkPart1Freshness(env);
    freshnessRetries++;
  }
  if (!freshness.fresh && !input.skip_freshness_check) {
    return {
      ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, run_id: runId,
      started_at: startedAt, finished_at: nowIso(),
      certification: "SCORING_FULL_RUN_MATRIX_SKIPPED_PART1_NOT_FRESH", skipped: true,
      freshness_wait_retries: freshnessRetries,
      part1_freshness: freshness, preflight, stages: []
    };
  }

  const lock = await tryAcquireLock(env, runId);
  if (!lock.acquired) {
    return {
      ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, run_id: runId,
      started_at: startedAt, finished_at: nowIso(),
      certification: "SCORING_FULL_RUN_MATRIX_SKIPPED_ALREADY_RUNNING", skipped: true,
      lock_error: lock.error || null, preflight, stages: []
    };
  }

  try {
    let result = await callStage(env.MATRIX_BUILDER_WORKER, "prop-matrix-builder", "matrix_build", { request_id: `${runId}_matrix`, chain_id: runId, trigger: "scoring_runner_matrix" });
    let iterations = 1;
    const MAX_ITER = 20;
    while (result.ok && (result.certification === "running_chunked" || result.certification === "partial_continue") && iterations < MAX_ITER) {
      result = await callStage(env.MATRIX_BUILDER_WORKER, "prop-matrix-builder", "matrix_build", { request_id: `${runId}_matrix_p${iterations}`, chain_id: runId, trigger: "scoring_runner_matrix" });
      iterations++;
    }
    result.pagination_iterations = iterations;
    return {
      ok: result.ok, data_ok: result.ok, version: VERSION, worker_name: WORKER_NAME, run_id: runId,
      started_at: startedAt, finished_at: nowIso(),
      certification: result.ok ? "SCORING_FULL_RUN_MATRIX_COMPLETE" : "SCORING_FULL_RUN_MATRIX_FAILED",
      part1_freshness: freshness, preflight, stages: [result]
    };
  } finally {
    await releaseLock(lock.client, runId);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMatrixStage(env, { trigger: "cron", cron: event.cron }).finally(() => selfCleanupAfterPhase(env)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, max_packet_staleness_minutes: MAX_PACKET_STALENESS_MINUTES, bindings_present: { MATRIX_BUILDER_WORKER: !!env.MATRIX_BUILDER_WORKER } });
    }
    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const workPromise = runMatrixStage(env, input);
      ctx.waitUntil(workPromise.catch(() => {}).finally(() => selfCleanupAfterPhase(env)));
      const result = await workPromise;
      return jsonResponse(result, result.ok ? 200 : 207);
    }
    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
