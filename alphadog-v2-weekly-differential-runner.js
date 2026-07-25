// alphadog-v2-weekly-differential-runner.js
// Simple, single-request weekly-static-differential runner - same design as board/daily-context/
// market/scoring runners: preflight cleanup, atomic table-based lock (Hyperdrive-safe, not
// session-scoped advisory locks), retry-on-network-exception. No D1, no orchestrator dependency.
//
// Unlike the four daily runners (which chain several distinct workers), this chain is a single
// worker (alphadog-v2-phase3a-first-inning-pitcher-context) with its own internal 13-step
// sequence (teams, players, stadiums, rosters, aliases, park factors, sprint speed, quality of
// contact, batted ball profile, defensive quality, catcher framing, pitcher running game, arm
// angle, pitcher arsenal), one step per invocation by that worker's own design. This runner loops,
// calling it again with resume_from_step until the whole sequence reports complete.

import postgres from "postgres";

const WEEKLY_LOCK_KEY = "alphadog_weekly_differential_full_run";
const LOCK_HOLD_MINUTES = 20;
const MAX_STEP_CALLS = 30; // safety ceiling - real chain is 13 steps, this allows headroom

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
    return { ok: true, connections_terminated: killedRows.length, terminated_pids: killedRows.map(r => r.pid), locks_cleared: clearedLocks.map(r => r.lock_key) };
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
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${WEEKLY_LOCK_KEY}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${WEEKLY_LOCK_KEY} AND (locked_until IS NULL OR locked_until < now())
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
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${WEEKLY_LOCK_KEY} AND holder = ${holderId}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

const WORKER_NAME = "alphadog-v2-weekly-differential-runner";
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

async function callStep(binding, input, attempt = 1) {
  const started = Date.now();
  if (!binding || typeof binding.fetch !== "function") {
    return { ok: false, error: "missing_service_binding_PHASE3A_WORKER", elapsed_ms: Date.now() - started };
  }
  try {
    const resp = await binding.fetch("https://internal.phase3a-first-inning-pitcher-context/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    let output;
    try {
      output = await resp.json();
    } catch (parseErr) {
      output = { ok: false, error: "non_json_response", parse_error: String(parseErr) };
    }
    return { ...output, http_status: resp.status, elapsed_ms: Date.now() - started, attempts: attempt };
  } catch (err) {
    if (attempt < 2) {
      return await callStep(binding, input, attempt + 1);
    }
    return { ok: false, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started, attempts: attempt };
  }
}

async function runWeeklyDifferentialFullRun(env, input) {
  const runId = `weekly_differential_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      certification: "WEEKLY_DIFFERENTIAL_FULL_RUN_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      preflight,
      steps: []
    };
  }

  try {
    const result = await runWeeklyDifferentialFullRunLocked(env, input, runId, startedAt);
    return { ...result, preflight };
  } finally {
    await releaseLock(lock.client, runId);
  }
}

async function runWeeklyDifferentialFullRunLocked(env, input, runId, startedAt) {
  const steps = [];
  let resumeFromStep = 0;
  let calls = 0;
  let complete = false;
  let failed = false;

  while (calls < MAX_STEP_CALLS) {
    calls++;
    const result = await callStep(env.PHASE3A_WORKER, {
      mode: "weekly_static_differential_full_run_postgres",
      request_id: `${runId}_call_${calls}`,
      season: input.season,
      resume_from_step: resumeFromStep
    });
    steps.push(result);
    if (!result.ok) { failed = true; break; }
    if (result.partial === false) { complete = true; break; }
    if (typeof result.next_resume_from_step === "number") {
      resumeFromStep = result.next_resume_from_step;
    } else {
      // Defensive: if the worker ever stops reporting next_resume_from_step, don't loop forever.
      failed = true;
      break;
    }
  }

  const certification = complete
    ? "WEEKLY_DIFFERENTIAL_FULL_RUN_COMPLETE"
    : (failed ? "WEEKLY_DIFFERENTIAL_FULL_RUN_FAILED" : "WEEKLY_DIFFERENTIAL_FULL_RUN_INCOMPLETE_MAX_CALLS_REACHED");

  return {
    ok: complete,
    data_ok: complete,
    version: VERSION,
    worker_name: WORKER_NAME,
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(),
    certification,
    total_calls: calls,
    steps
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWeeklyDifferentialFullRun(env, { trigger: "cron", cron: event.cron }));
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
        bindings_present: { PHASE3A_WORKER: !!env.PHASE3A_WORKER }
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const result = await runWeeklyDifferentialFullRun(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
