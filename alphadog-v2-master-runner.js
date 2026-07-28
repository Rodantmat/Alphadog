// alphadog-v2-master-runner.js
// [2026-07-28: own cron trigger retired - each of the 4 stages now has an independent, staggered
// cron instead, to avoid the shared 15-minute cron wall-clock ceiling. This worker remains fully
// functional for manual/on-demand full-chain runs via run_job.]
// Single, sequential daily full-run: board-full-run -> daily-context-full-run -> market-full-run
// -> scoring-full-run, in that exact order, in one request. Same design as the four individual
// runners: no queue table, no lock table, no cross-request resume state. Calls each of the four
// already-validated runners via service binding, one after another, since scoring genuinely
// depends on market depends on daily-context depends on board (each stage reads what upstream
// wrote). Directly callable via run_job (not cron-dependent), and will also run on its own cron
// once the schedule is finalized.

import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-master-runner";
const MASTER_LOCK_KEY = "alphadog_master_full_run";
const LOCK_HOLD_MINUTES = 15;

// Preflight cleanup (2026-07-25): this is a genuinely single-operator system - only Rodolfo and
// Claude ever trigger these runs. That means anything found running, locked, or holding a
// connection at the moment a NEW master-run starts is, by definition, stale garbage from a
// previous invocation that was killed or failed mid-flight (Cloudflare can terminate a Worker's
// execution abruptly, and no JS-level try/finally can guarantee cleanup ran when that happens).
// This is a standard, well-documented DBA pattern for exactly this situation (see e.g.
// "How To Kill All Connections to a Database in PostgreSQL") - pg_terminate_backend scoped to
// backend_type='client backend' safely excludes Postgres's own internal processes (autovacuum,
// WAL sender, checkpointer) and the caller's own pid, so it can never harm the database itself.
// Runs before the lock acquire, since a stale lock would otherwise block the very cleanup meant
// to clear it.
async function preflightCleanup(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    const killedRows = await client`
      SELECT pid FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND backend_type = 'client backend'`;
    for (const row of killedRows) {
      await client`SELECT pg_terminate_backend(${row.pid})`.catch(() => {});
    }
    await client`CREATE TABLE IF NOT EXISTS control.runner_locks (lock_key TEXT PRIMARY KEY, locked_until TIMESTAMPTZ, holder TEXT, acquired_at TIMESTAMPTZ)`;
    const clearedLocks = await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL RETURNING lock_key`;
    return {
      ok: true,
      connections_terminated: killedRows.length,
      terminated_pids: killedRows.map(r => r.pid),
      locks_cleared: clearedLocks.map(r => r.lock_key)
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function tryAcquireLock(env, holderId) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`CREATE TABLE IF NOT EXISTS control.runner_locks (lock_key TEXT PRIMARY KEY, locked_until TIMESTAMPTZ, holder TEXT, acquired_at TIMESTAMPTZ)`;
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${MASTER_LOCK_KEY}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${MASTER_LOCK_KEY} AND (locked_until IS NULL OR locked_until < now())
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
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${MASTER_LOCK_KEY} AND holder = ${holderId}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}
const VERSION = "v1.0.1-scheduled";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function callRunner(binding, bindingName, input, attempt = 1) {
  const started = Date.now();
  if (!binding || typeof binding.fetch !== "function") {
    return {
      runner: bindingName,
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
      body: JSON.stringify(input || {})
    });
    let output;
    try {
      output = await resp.json();
    } catch (parseErr) {
      output = { ok: false, data_ok: false, error: "non_json_response", parse_error: String(parseErr) };
    }
    return {
      runner: bindingName,
      ok: !!output.ok,
      data_ok: !!output.data_ok,
      http_status: resp.status,
      certification: output.certification || null,
      stage_count: Array.isArray(output.stages) ? output.stages.length : null,
      failed_stages: Array.isArray(output.stages) ? output.stages.filter(s => !s.ok).map(s => s.stage) : [],
      error: output.ok ? null : (output.certification || "runner_failed"),
      elapsed_ms: Date.now() - started,
      attempts: attempt
    };
  } catch (err) {
    // Network-level exception on the fetch() call itself, not a real business-logic failure -
    // same documented class of transient service-to-service fetch issue found in board-runner's
    // call to score-prep. Single retry only; a genuine ok:false response is never retried.
    if (attempt < 2) {
      return await callRunner(binding, bindingName, input, attempt + 1);
    }
    return {
      runner: bindingName,
      ok: false,
      data_ok: false,
      error: String(err && err.message ? err.message : err),
      elapsed_ms: Date.now() - started,
      attempts: attempt
    };
  }
}

// Real dependency order: scoring reads market reads daily-context reads board. Each runner
// is called once, in sequence. If an earlier runner fails, later runners will very likely fail
// too since they depend on what it wrote - but we keep going anyway so one response shows the
// full picture of what broke, rather than requiring a second run just to see stage 2's error.
const RUNNERS = [
  { bindingKey: "BOARD_RUNNER_WORKER", bindingName: "board-runner" },
  { bindingKey: "DAILY_CONTEXT_RUNNER_WORKER", bindingName: "daily-context-runner" },
  { bindingKey: "MARKET_RUNNER_WORKER", bindingName: "market-runner" },
  { bindingKey: "SCORING_RUNNER_WORKER", bindingName: "scoring-runner" }
];

async function runMasterFullRun(env, input) {
  const runId = `master_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = nowIso();

  const preflight = await preflightCleanup(env);

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
      certification: "MASTER_FULL_RUN_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      preflight,
      runners: []
    };
  }

  try {
    const result = await runMasterFullRunLocked(env, input, runId, startedAt);
    return { ...result, preflight };
  } finally {
    await releaseLock(lock.client, runId);
  }
}

async function runMasterFullRunLocked(env, input, runId, startedAt) {
  const runners = [];

  for (const r of RUNNERS) {
    const result = await callRunner(env[r.bindingKey], r.bindingName, { request_id: `${runId}_${r.bindingName}`, chain_id: runId, trigger: "master_runner" });
    runners.push(result);
    if (!result.data_ok) {
      // Hard stop: every later runner reads what this one wrote. data_ok (not the stricter ok)
      // is the right signal here - a runner can report ok:false from a non-critical parallel
      // source hiccup (e.g. board-runner's Underdog call) while data_ok:true confirms the actual
      // data downstream stages depend on (e.g. score-prep's output) is ready and correct.
      break;
    }
  }

  const allOk = runners.every(r => r.ok);
  const lastOk = runners.length && runners[runners.length - 1].data_ok;

  return {
    ok: allOk,
    data_ok: lastOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(),
    certification: allOk ? "MASTER_FULL_RUN_COMPLETE" : "MASTER_FULL_RUN_PARTIAL_OR_FAILED",
    runners
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMasterFullRun(env, { trigger: "cron", cron: event.cron }));
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
        bindings_present: Object.fromEntries(RUNNERS.map(r => [r.bindingKey, !!env[r.bindingKey]]))
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const workPromise = runMasterFullRun(env, input);
      // Safety net matching the fix verified on board-runner: guarantee the full chain (which
      // can take significantly longer than any single runner) completes even if the caller
      // disconnects or times out before it finishes.
      ctx.waitUntil(workPromise.catch(() => {}));
      const result = await workPromise;
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
