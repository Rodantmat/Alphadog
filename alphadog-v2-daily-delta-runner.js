// alphadog-v2-daily-delta-runner.js
// Split into two independently-locked, independently-callable parts per explicit request
// (2026-08-02), so a stall/timeout in one half can never block or corrupt the other, and each
// gets its own stale-connection killer and lock rather than sharing one long-running invocation:
//   PART 1: mining chain through metrics (delta game logs, team game logs, starter history,
//           bullpen history, hitter metric snapshots, pitcher metric snapshots)
//   PART 2: everything else (quality-of-contact refresh, baseline v6 classification/baseline
//           looped to genuine completion, prop outcome resolution, stateful delta, old
//           classification v5, coverage audit, outcome grading)
// Both parts call the same underlying worker (alphadog-v2-phase3a-first-inning-pitcher-context)
// via PHASE3A_WORKER, using the stop_before_step/resume_from_step contract that worker already
// supports.

import postgres from "postgres";

const LOCK_HOLD_MINUTES = 15;
const MAX_STEP_CALLS = 20; // safety ceiling per part

function nowIso() { return new Date().toISOString(); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

// Generic, reusable per-part preflight/lock/release - each part gets its own lock_key so a stuck
// or slow part1 run can never block part2 (or vice versa) from acquiring its own lock.
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
    // FIXED (2026-08-02): previously cleared ALL locks indiscriminately, including locks owned
    // by entirely different workers (e.g. alphadog_baseline_v6_step, the phase3a worker's own
    // internal step lock) - confirmed live this was the real root cause of baseline_v6
    // reprocessing the same combos repeatedly, since clearing that lock let the inner worker's
    // own unreliable self-trigger race against this worker's explicit sequential calls. Now
    // scoped to only this worker's own two locks - never touch locks owned by other workers.
    const clearedLocks = await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key IN ('alphadog_daily_delta_part1', 'alphadog_daily_delta_part2') AND locked_until < now() RETURNING lock_key`;
    return { ok: true, connections_terminated: killedRows.length, terminated_pids: killedRows.map(r => r.pid), locks_cleared: clearedLocks.map(r => r.lock_key) };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function tryAcquireLock(env, lockKey, holderId) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`CREATE TABLE IF NOT EXISTS control.runner_locks (lock_key TEXT PRIMARY KEY, locked_until TIMESTAMPTZ, holder TEXT, acquired_at TIMESTAMPTZ)`;
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${lockKey}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${lockKey} AND (locked_until IS NULL OR locked_until < now())
      RETURNING lock_key`;
    return { acquired: rows.length > 0, client };
  } catch (err) {
    try { await client.end({ timeout: 1 }); } catch (_) {}
    return { acquired: false, client: null, error: String(err && err.message ? err.message : err) };
  }
}

async function releaseLock(client, lockKey, holderId) {
  if (!client) return;
  try {
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${lockKey} AND holder = ${holderId}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
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

const WORKER_NAME = "alphadog-v2-daily-delta-runner";
const VERSION = "v2.0.0-split-part1-part2";

// ============================= PART 1: mining through metrics =============================
// Steps 0-5 in the inner worker's fixed array: delta_game_logs, team_game_logs, starter_history,
// bullpen_history, hitter_metric_snapshots, pitcher_metric_snapshots. stop_before_step=6 ensures
// this NEVER spills into quality-of-contact/baseline/outcomes, even if a single call's internal
// 240s budget would otherwise have time to start them.
const PART1_LOCK_KEY = "alphadog_daily_delta_part1";
const PART1_STOP_BEFORE_STEP = 6;

async function runPart1Locked(env, input, runId, startedAt) {
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
      resume_from_step: resumeFromStep,
      stop_before_step: PART1_STOP_BEFORE_STEP
    });
    steps.push(result);
    if (!result.ok) { failed = true; break; }
    if (result.complete === true || result.partial === false) { complete = true; break; }
    if (typeof result.next_resume_from_step === "number") {
      resumeFromStep = result.next_resume_from_step;
    } else {
      failed = true;
      break;
    }
  }

  const certification = (() => {
    if (failed) return "DAILY_DELTA_PART1_FAILED";
    if (!complete) return "DAILY_DELTA_PART1_INCOMPLETE_MAX_CALLS_REACHED";
    const allStepResults = steps.flatMap(s => Array.isArray(s.completed_steps) ? s.completed_steps : []);
    const failedSteps = allStepResults.filter(s => s && s.ok === false);
    if (failedSteps.length) return "DAILY_DELTA_PART1_PARTIAL_SOME_STEPS_FAILED";
    return "DAILY_DELTA_PART1_COMPLETE";
  })();
  const trueComplete = complete && certification === "DAILY_DELTA_PART1_COMPLETE";

  return {
    ok: trueComplete,
    data_ok: trueComplete,
    version: VERSION,
    worker_name: WORKER_NAME,
    part: 1,
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(),
    certification,
    total_calls: calls,
    steps
  };
}

async function runDailyDeltaPart1(env, input) {
  const runId = `daily_delta_part1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = nowIso();
  const preflight = await preflightCleanup(env);
  const lock = await tryAcquireLock(env, PART1_LOCK_KEY, runId);
  if (!lock.acquired) {
    return {
      ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, part: 1,
      run_id: runId, started_at: startedAt, finished_at: nowIso(),
      certification: "DAILY_DELTA_PART1_SKIPPED_ALREADY_RUNNING", skipped: true,
      lock_error: lock.error || null, preflight, steps: []
    };
  }
  try {
    const result = await runPart1Locked(env, input, runId, startedAt);
    return { ...result, preflight };
  } finally {
    await releaseLock(lock.client, PART1_LOCK_KEY, runId);
    await preflightCleanup(env).catch(() => {});
  }
}

// ============================= PART 2: classification and baseline =============================
// Covers steps 6-8 of the inner worker (quality_of_contact_derived_fields_refresh,
// baseline_v6_full_run, resolve_prop_outcomes), plus the stateful delta, the old classification
// v5 pass, the coverage audit, and outcome grading. baseline_v6 is explicitly looped to genuine
// completion (244 combos) rather than called once as part of the 6-8 step range, since that
// single-call approach was confirmed to silently leave it partially done for days at a time.
const PART2_LOCK_KEY = "alphadog_daily_delta_part2";

const MAX_STATEFUL_DELTA_CALLS = 200;
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
  return { ok: !failed, complete, total_calls: i, final_status: calls.length ? calls[calls.length - 1].status : null, calls_summary: calls.slice(-5) };
}

// OLD VERSION - DO NOT TOUCH IT!!!! This calls the confirmed-dead base-classification-v5
// worker (see that file's own header). Does not affect real, live scoring. Left in place
// harmlessly rather than removed under time pressure.
const MAX_CLASSIFICATION_V5_CALLS = 60;
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

const MAX_BASELINE_V6_CALLS = 30; // 244 combos total, ~50-90 processed per 30s call - generous headroom
async function runBaselineV6ToCompletion(env, runId) {
  const calls = [];
  let nextInput = { mode: "classification_baseline_v6_to_postgres_full_run", request_id: `${runId}_baseline_v6_init` };
  let i = 0;
  let complete = false;
  let failed = false;
  let totalRowsWritten = 0;
  while (i < MAX_BASELINE_V6_CALLS) {
    i++;
    const result = await callStep(env.PHASE3A_WORKER, nextInput);
    calls.push({ call: i, combo_index: result && result.combo_index, combos_processed: result && result.combos_processed_this_call, ok: result && result.ok });
    if (!result || result.ok === false) { failed = true; break; }
    totalRowsWritten += Number(result.total_rows_written || 0);
    if (result.combo_done === true || result.partial_continue !== true) { complete = true; break; }
    nextInput = result.next_input_json || { mode: "classification_baseline_v6_to_postgres_full_run", combo_index: result.combo_index };
  }
  return { ok: !failed, complete, total_calls: i, total_rows_written: totalRowsWritten, calls_summary: calls.slice(-5) };
}

async function runOutcomeGrading(env, runId) {
  if (!env.OUTCOME_GRADER_WORKER || typeof env.OUTCOME_GRADER_WORKER.fetch !== "function") {
    return { ok: false, skipped: true, reason: "missing_service_binding_OUTCOME_GRADER_WORKER" };
  }
  try {
    const resp = await env.OUTCOME_GRADER_WORKER.fetch("https://internal.outcome-grader/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request_id: `${runId}_outcome_grading` })
    });
    const output = await resp.json().catch(() => ({ ok: false, error: "non_json_response" }));
    return { ...output, http_status: resp.status };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

// Coverage audit (2026-07-25, extended 2026-08-02 to also catch classification staleness):
// compares yesterday's real games (team.game_logs, independently reliable) against
// starter_history/bullpen_history coverage, and flags any classification_v6_current prop+side
// combo more than 36 hours stale.
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
    const staleClassification = await client`
      SELECT canonical_prop_key, selected_side, MAX(updated_at) as last_updated,
        EXTRACT(EPOCH FROM (now() - MAX(updated_at)))/3600 AS hours_stale
      FROM classification.classification_v6_current
      GROUP BY canonical_prop_key, selected_side
      HAVING now() - MAX(updated_at) > interval '36 hours'
      ORDER BY MAX(updated_at) ASC`;
    const r = rows[0] || {};
    const gamesExpected = Number(r.games_expected || 0);
    const gamesInStarter = Number(r.games_in_starter_history || 0);
    const gamesInBullpen = Number(r.games_in_bullpen_history || 0);
    const pass = (gamesExpected === 0 || (gamesInStarter === gamesExpected && gamesInBullpen === gamesExpected)) && staleClassification.length === 0;
    return {
      ok: true, pass,
      games_expected: gamesExpected,
      games_in_starter_history: gamesInStarter,
      games_in_bullpen_history: gamesInBullpen,
      starter_history_gap: Math.max(0, gamesExpected - gamesInStarter),
      bullpen_history_gap: Math.max(0, gamesExpected - gamesInBullpen),
      hitter_null_dates_yesterday: Number(r.hitter_null_dates_yesterday || 0),
      pitcher_null_dates_yesterday: Number(r.pitcher_null_dates_yesterday || 0),
      stale_classification_combos: staleClassification.map(row => ({ canonical_prop_key: row.canonical_prop_key, selected_side: row.selected_side, hours_stale: Math.round(Number(row.hours_stale)) })),
      warning: pass ? null : "COVERAGE_GAP_DETECTED_starter_bullpen_history_or_classification_staleness"
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function runPart2Locked(env, input, runId, startedAt) {
  // Step 6 only: quality_of_contact_derived_fields_refresh
  const qocResult = await callStep(env.PHASE3A_WORKER, {
    mode: "daily_morning_delta_full_run",
    request_id: `${runId}_qoc`,
    resume_from_step: 6,
    stop_before_step: 7
  });

  const baselineV6 = await runBaselineV6ToCompletion(env, runId).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }));

  // Step 8 only: resolve_prop_outcomes
  const resolveOutcomes = await callStep(env.PHASE3A_WORKER, {
    mode: "daily_morning_delta_full_run",
    request_id: `${runId}_resolve_outcomes`,
    resume_from_step: 8,
    stop_before_step: 9
  });

  const statefulDelta = await runStatefulDeltaToCompletion(env, runId).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }));
  const classificationV5 = await runClassificationV5ToCompletion(env).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }));
  const coverageAudit = await runCoverageAudit(env);
  const coverageOk = coverageAudit.ok && coverageAudit.pass !== false;

  const stepsOk = qocResult.ok && resolveOutcomes.ok;
  const chainFullySucceeded = stepsOk && baselineV6.ok && statefulDelta.ok && coverageOk;
  const outcomeGrading = chainFullySucceeded
    ? await runOutcomeGrading(env, runId).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }))
    : { ok: false, skipped: true, reason: "chain_did_not_fully_succeed_steps_ok=" + stepsOk + "_baseline_v6_ok=" + baselineV6.ok + "_stateful_delta_ok=" + statefulDelta.ok + "_coverage_ok=" + coverageOk };

  const certification = !stepsOk ? "DAILY_DELTA_PART2_FAILED"
    : (!baselineV6.complete ? "DAILY_DELTA_PART2_BASELINE_V6_INCOMPLETE"
    : (!coverageOk ? "DAILY_DELTA_PART2_COMPLETE_BUT_COVERAGE_GAP_DETECTED"
    : "DAILY_DELTA_PART2_COMPLETE"));

  return {
    ok: stepsOk && baselineV6.ok && coverageOk,
    data_ok: stepsOk && baselineV6.ok && coverageOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    part: 2,
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(),
    certification,
    quality_of_contact_refresh: qocResult,
    baseline_v6: baselineV6,
    resolve_prop_outcomes: resolveOutcomes,
    stateful_delta: statefulDelta,
    classification_v5: classificationV5,
    coverage_audit: coverageAudit,
    outcome_grading: outcomeGrading
  };
}

const PART2_SELF_URL = "https://alphadog-v2-daily-delta-runner.rodolfoaamattos.workers.dev/run-part2";
const PART2_PHASE_STATE_KEY = "daily_delta_part2_phase";
// Phases run in order; baseline_v6 is NOT a single phase - it re-enters this same phase
// repeatedly (self-chaining) until the underlying combo loop reports combo_done, since it alone
// can take several sequential calls.
// REMOVED 2026-08-02 (stateful_delta): confirmed via direct code investigation this phase wrote
// exclusively to env.SCORE_DB (D1, not Postgres) - a genuine violation of the "D1 is read-only
// reference, all writes go to Postgres" migration principle. Its output tables
// (player_baseline_v5_hp_state_current / player_baseline_v5_classification_state_current) never
// fed the real, live classification.classification_v6_current (Postgres) system, which is
// maintained correctly and separately by the baseline_v6 phase below. This also explains the
// 15-day backlog found the same day this was discovered - the phase was never load-bearing for
// real output, so removing it is safe.
const PART2_PHASES = ["quality_of_contact", "baseline_v6", "resolve_outcomes", "classification_v5", "finalize"];

async function getJsonState(env, key) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`CREATE TABLE IF NOT EXISTS control.worker_state_json (state_key TEXT PRIMARY KEY, value_json JSONB, updated_at TIMESTAMPTZ)`;
    const rows = await client`SELECT value_json FROM control.worker_state_json WHERE state_key = ${key}`;
    if (!rows.length) return null;
    const raw = rows[0].value_json;
    // Defensive: postgres.js should auto-parse jsonb columns to objects, but confirmed live
    // this can come back as a raw JSON string in some cases - explicitly parse if so, since
    // silently passing a string downstream causes a dangerous silent wrong-mode fallback rather
    // than a visible error.
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch (_) { return null; }
    }
    return raw;
  } catch (_) {
    return null;
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function setJsonState(env, key, value) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`CREATE TABLE IF NOT EXISTS control.worker_state_json (state_key TEXT PRIMARY KEY, value_json JSONB, updated_at TIMESTAMPTZ)`;
    await client`INSERT INTO control.worker_state_json (state_key, value_json, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (state_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function clearJsonState(env, key) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`DELETE FROM control.worker_state_json WHERE state_key = ${key}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function getPart2State(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`CREATE TABLE IF NOT EXISTS control.worker_state (state_key TEXT PRIMARY KEY, resume_index INTEGER, updated_at TIMESTAMPTZ)`;
    const rows = await client`SELECT resume_index FROM control.worker_state WHERE state_key = ${PART2_PHASE_STATE_KEY}`;
    return rows.length ? Number(rows[0].resume_index) : 0;
  } catch (_) {
    return 0;
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function setPart2State(env, phaseIndex) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`INSERT INTO control.worker_state (state_key, resume_index, updated_at) VALUES (${PART2_PHASE_STATE_KEY}, ${phaseIndex}, now())
      ON CONFLICT (state_key) DO UPDATE SET resume_index=excluded.resume_index, updated_at=excluded.updated_at`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function selfTriggerPart2Continuation(ctx) {
  ctx.waitUntil(fetch(PART2_SELF_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {}));
}

// Runs exactly ONE bounded unit of work for the current phase, then either advances to the next
// phase or (for baseline_v6 specifically) stays on the same phase until combo_done. Returns
// {phaseComplete, allComplete, phaseResult} - the caller decides whether to self-trigger again.
async function runPart2OneStep(env, input, runId) {
  const phaseIndex = await getPart2State(env);
  const phase = PART2_PHASES[phaseIndex] || "finalize";

  if (phase === "quality_of_contact") {
    const result = await callStep(env.PHASE3A_WORKER, { mode: "daily_morning_delta_full_run", request_id: `${runId}_qoc`, resume_from_step: 6, stop_before_step: 7 });
    await setPart2State(env, phaseIndex + 1);
    return { phase, phaseComplete: true, allComplete: false, result };
  }

  if (phase === "baseline_v6") {
    const persistedIndex = await getBaselineV6ComboIndexForPart2(env);
    const result = await callStep(env.PHASE3A_WORKER, persistedIndex > 0
      ? { mode: "classification_baseline_v6_to_postgres_full_run", request_id: `${runId}_baseline_v6`, combo_index: persistedIndex }
      : { mode: "classification_baseline_v6_to_postgres_full_run", request_id: `${runId}_baseline_v6_init` });
    const done = result && (result.combo_done === true || result.partial_continue !== true);
    if (done) await setPart2State(env, phaseIndex + 1);
    return { phase, phaseComplete: done, allComplete: false, result };
  }

  if (phase === "resolve_outcomes") {
    const result = await callStep(env.PHASE3A_WORKER, { mode: "daily_morning_delta_full_run", request_id: `${runId}_resolve_outcomes`, resume_from_step: 8, stop_before_step: 9 });
    await setPart2State(env, phaseIndex + 1);
    return { phase, phaseComplete: true, allComplete: false, result };
  }

  if (phase === "classification_v5") {
    const result = await runClassificationV5ToCompletion(env).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }));
    await setPart2State(env, phaseIndex + 1);
    return { phase, phaseComplete: true, allComplete: false, result };
  }

  // finalize: coverage audit + outcome grading, then reset phase to 0 for the next full daily run
  const coverageAudit = await runCoverageAudit(env);
  const coverageOk = coverageAudit.ok && coverageAudit.pass !== false;
  const outcomeGrading = coverageOk
    ? await runOutcomeGrading(env, runId).catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }))
    : { ok: false, skipped: true, reason: "coverage_gap_detected" };
  await setPart2State(env, 0);
  return { phase: "finalize", phaseComplete: true, allComplete: true, result: { coverage_audit: coverageAudit, outcome_grading: outcomeGrading } };
}

// baseline_v6's own combo_index isn't tracked by part2's phase state (it lives in the phase3a
// worker's own control.worker_state under 'baseline_v6_full_run') - read it directly so part2
// resumes from the right place across self-chained calls instead of restarting from 0 each time.
async function getBaselineV6ComboIndexForPart2(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    const rows = await client`SELECT resume_index FROM control.worker_state WHERE state_key = 'baseline_v6_full_run'`;
    return rows.length ? Number(rows[0].resume_index) : 0;
  } catch (_) {
    return 0;
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function runDailyDeltaPart2(env, ctx, input) {
  const runId = `daily_delta_part2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = nowIso();
  const preflight = await preflightCleanup(env);
  const lock = await tryAcquireLock(env, PART2_LOCK_KEY, runId);
  if (!lock.acquired) {
    return {
      ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, part: 2,
      run_id: runId, started_at: startedAt, finished_at: nowIso(),
      certification: "DAILY_DELTA_PART2_SKIPPED_ALREADY_RUNNING", skipped: true,
      lock_error: lock.error || null, preflight
    };
  }
  try {
    // FIXED 2026-08-03, grounded in Cloudflare's own docs: runs everything in ONE call now
    // (the pre-existing runPart2Locked function, previously unused) instead of one-phase-at-a-
    // time with external self-chaining. The wall-clock ceiling that motivated the state-machine
    // approach was a misapplied CRON-trigger-specific constraint - this worker is called via
    // direct HTTP, where the real limit is CPU time (5 min, already configured), and I/O wait
    // (Postgres queries, service-binding fetches - almost all of this worker's real work) does
    // not count toward it at all. Verified live: the identical fix let scoring-runner-part2's
    // previously-permanently-stuck pipeline complete fully in one 19-second call.
    const result = await runPart2Locked(env, input, runId, startedAt);
    return { ...result, preflight };
  } finally {
    await releaseLock(lock.client, PART2_LOCK_KEY, runId);
    await preflightCleanup(env).catch(() => {});
  }
}

export default {
  async scheduled(event, env, ctx) {
    // Multiple crons now fire for this worker (2026-08-02 fix): the first (14:00 UTC) runs the
    // full Part1+Part2 kickoff; the rest (14:10-14:50) call Part 2 ONLY, as an external,
    // independently-driven retry - confirmed live that Part 2's own internal self-chaining fetch
    // can stall without one, and this worker's lock + persisted phase state make repeated Part 2
    // calls safe (no-op if already done for the day, genuine continuation if it stalled).
    const cronStr = String(event.cron || "");
    const isKickoffCron = cronStr.startsWith("0 14");
    ctx.waitUntil((async () => {
      if (isKickoffCron) {
        await runDailyDeltaPart1(env, { trigger: "cron", cron: event.cron });
      }
      await runDailyDeltaPart2(env, ctx, { trigger: "cron", cron: event.cron });
    })());
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

    if (method === "POST" && path === "/run-part1") {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const result = await runDailyDeltaPart1(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    if (method === "POST" && path === "/run-part2") {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const result = await runDailyDeltaPart2(env, ctx, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    // Backward-compatible: /run or / now runs both parts, part1 synchronously (fast enough to
    // await directly) then part2 in the background via ctx.waitUntil (too long to await safely).
    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const part1 = await runDailyDeltaPart1(env, input);
      const part2FirstStep = await runDailyDeltaPart2(env, ctx, input);
      return jsonResponse({ ok: part1.ok, part1, part2_first_step: part2FirstStep }, part1.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
