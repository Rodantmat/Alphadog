// alphadog-v2-daily-delta-runner.js
// Simple, single-request daily-morning-delta runner - same design as board/daily-context/market/
// scoring/weekly-differential runners: preflight cleanup, atomic table-based lock (Hyperdrive-safe,
// not session-scoped advisory locks), retry-on-network-exception. No D1, no orchestrator dependency.
//
// Like the weekly-differential runner, this chain is a single worker
// (alphadog-v2-phase3a-first-inning-pitcher-context) with its own internal 6-step sequence
// (delta game logs, team game logs, starter history, bullpen history, hitter metric snapshots,
// pitcher metric snapshots), using an internal time budget so it may complete more than one step
// per invocation. This runner loops, calling it again with resume_from_step until the whole
// sequence reports complete.

import postgres from "postgres";

const DAILY_DELTA_LOCK_KEY = "alphadog_daily_delta_full_run";
const LOCK_HOLD_MINUTES = 15;
const MAX_STEP_CALLS = 20; // safety ceiling - real chain is 6 steps, this allows headroom

// Automated coverage audit (2026-07-25): built directly from the manual audit that found two real,
// silent gaps in this chain (starter_history/bullpen_history missing 2 full days of games due to
// a raw_json schema mismatch). Runs after every completed chain, comparing yesterday's real games
// (from team.game_logs, independently confirmed fully reliable) against starter_history and
// bullpen_history coverage. Any gap now surfaces immediately in the run's own response.
async function runCoverageAudit(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    const rows = await client`
      WITH yesterday_games AS (
        SELECT DISTINCT game_pk FROM team.game_logs WHERE game_date = (CURRENT_DATE - INTERVAL '1 day')::date
      )
      SELECT
        (SELECT COUNT(*) FROM yesterday_games) AS games_expected,
        (SELECT COUNT(DISTINCT game_pk) FROM team.starter_history WHERE game_pk IN (SELECT game_pk FROM yesterday_games)) AS games_in_starter_history,
        (SELECT COUNT(DISTINCT game_pk) FROM team.bullpen_history WHERE game_pk IN (SELECT game_pk FROM yesterday_games)) AS games_in_bullpen_history,
        (SELECT COUNT(*) FROM stats_hitter.game_logs WHERE game_date = (CURRENT_DATE - INTERVAL '1 day')::date AND game_date IS NULL) AS hitter_null_dates_yesterday,
        (SELECT COUNT(*) FROM stats_pitcher.game_logs WHERE game_date = (CURRENT_DATE - INTERVAL '1 day')::date AND game_date IS NULL) AS pitcher_null_dates_yesterday`;
    const r = rows[0] || {};
    const gamesExpected = Number(r.games_expected || 0);
    const gamesInStarter = Number(r.games_in_starter_history || 0);
    const gamesInBullpen = Number(r.games_in_bullpen_history || 0);
    const pass = gamesExpected === 0 || (gamesInStarter === gamesExpected && gamesInBullpen === gamesExpected);
    return {
      ok: true,
      pass,
      games_expected: gamesExpected,
      games_in_starter_history: gamesInStarter,
      games_in_bullpen_history: gamesInBullpen,
      starter_history_gap: Math.max(0, gamesExpected - gamesInStarter),
      bullpen_history_gap: Math.max(0, gamesExpected - gamesInBullpen),
      hitter_null_dates_yesterday: Number(r.hitter_null_dates_yesterday || 0),
      pitcher_null_dates_yesterday: Number(r.pitcher_null_dates_yesterday || 0),
      warning: pass ? null : "COVERAGE_GAP_DETECTED_starter_or_bullpen_history_missing_yesterdays_games"
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

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
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${DAILY_DELTA_LOCK_KEY}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${DAILY_DELTA_LOCK_KEY} AND (locked_until IS NULL OR locked_until < now())
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
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${DAILY_DELTA_LOCK_KEY} AND holder = ${holderId}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

const WORKER_NAME = "alphadog-v2-daily-delta-runner";
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

const MAX_STATEFUL_DELTA_CALLS = 200; // real backlog can span many days at 12 players/chunk; generous but bounded

async function runStatefulDeltaToCompletion(env, runId) {
  const calls = [];
  let nextInput = { mode: "baseline_v5_stateful_delta", request_id: `${runId}_stateful_delta_init` };
  let i = 0;
  let complete = false;
  let failed = false;
  while (i < MAX_STATEFUL_DELTA_CALLS) {
    i++;
    const result = await callStep(env.PHASE3A_WORKER, nextInput);
    calls.push({ call: i, status: result && result.status, hitter_cursor_offset: result && result.hitter_cursor_offset, ok: result && result.ok });
    if (!result || result.ok === false) { failed = true; break; }
    if (result.continuation_required !== true || !result.next_input_json) { complete = true; break; }
    nextInput = result.next_input_json;
  }
  return {
    ok: !failed,
    complete,
    total_calls: i,
    final_status: calls.length ? calls[calls.length - 1].status : null,
    calls_summary: calls.slice(-5) // keep the response compact; only the tail is diagnostic
  };
}

const MAX_CLASSIFICATION_V5_CALLS = 60; // day-by-day watermark; safe to resume next run regardless

async function runClassificationV5ToCompletion(env) {
  const calls = [];
  let i = 0;
  let complete = false;
  let failed = false;
  while (i < MAX_CLASSIFICATION_V5_CALLS) {
    i++;
    const result = await callStep(env.BASE_CLASSIFICATION_V5_WORKER, { mode: "delta_recalculate_affected_players" });
    calls.push({ call: i, status: result && result.status, day_processed: result && result.day_processed, ok: result && result.ok });
    if (!result || result.ok === false) { failed = true; break; }
    if (result.continuation_required !== true) { complete = true; break; }
  }
  return { ok: !failed, complete, total_calls: i, calls_summary: calls.slice(-5) };
}

async function runDailyDeltaFullRun(env, input) {
  const runId = `daily_delta_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      certification: "DAILY_DELTA_FULL_RUN_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      preflight,
      steps: []
    };
  }

  try {
    const result = await runDailyDeltaFullRunLocked(env, input, runId, startedAt);
    const statefulDelta = await runStatefulDeltaToCompletion(env, runId).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }));
    const classificationV5 = await runClassificationV5ToCompletion(env).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }));
    const coverageAudit = await runCoverageAudit(env);
    const coverageOk = coverageAudit.ok && coverageAudit.pass !== false;
    const finalCertification = !coverageOk && result.certification === "DAILY_DELTA_FULL_RUN_COMPLETE"
      ? "DAILY_DELTA_FULL_RUN_COMPLETE_BUT_COVERAGE_GAP_DETECTED"
      : result.certification;
    return {
      ...result,
      ok: result.ok && coverageOk,
      data_ok: result.data_ok && coverageOk,
      certification: finalCertification,
      coverage_audit: coverageAudit,
      stateful_delta: statefulDelta,
      classification_v5: classificationV5,
      preflight
    };
  } finally {
    await releaseLock(lock.client, runId);
  }
}

async function runDailyDeltaFullRunLocked(env, input, runId, startedAt) {
  const steps = [];
  let resumeFromStep = 0;
  let calls = 0;
  let complete = false;
  let failed = false;

  while (calls < MAX_STEP_CALLS) {
    calls++;
    const result = await callStep(env.PHASE3A_WORKER, {
      mode: "daily_morning_delta_full_run",
      request_id: `${runId}_call_${calls}`,
      resume_from_step: resumeFromStep
    });
    steps.push(result);
    if (!result.ok) { failed = true; break; }
    if (result.complete === true || result.partial === false) { complete = true; break; }
    if (typeof result.next_resume_from_step === "number") {
      resumeFromStep = result.next_resume_from_step;
    } else {
      // Defensive: if the worker ever stops reporting next_resume_from_step, don't loop forever.
      failed = true;
      break;
    }
  }

  const certification = (() => {
    if (failed) return "DAILY_DELTA_FULL_RUN_FAILED";
    if (!complete) return "DAILY_DELTA_FULL_RUN_INCOMPLETE_MAX_CALLS_REACHED";
    // The underlying function catches per-step errors and still reports ok:true/complete:true
    // at the top level, so check each individual step's own ok flag rather than trusting that.
    const allStepResults = steps.flatMap(s => Array.isArray(s.completed_steps) ? s.completed_steps : []);
    const failedSteps = allStepResults.filter(s => s && s.ok === false);
    if (failedSteps.length) return "DAILY_DELTA_FULL_RUN_PARTIAL_SOME_STEPS_FAILED";
    return "DAILY_DELTA_FULL_RUN_COMPLETE";
  })();
  const trueComplete = complete && certification === "DAILY_DELTA_FULL_RUN_COMPLETE";

  return {
    ok: trueComplete,
    data_ok: trueComplete,
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
    ctx.waitUntil(runDailyDeltaFullRun(env, { trigger: "cron", cron: event.cron }));
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
      const result = await runDailyDeltaFullRun(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
