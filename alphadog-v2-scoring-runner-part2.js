// alphadog-v2-scoring-runner-part2.js  -- PART 2 of 2 [retry deploy touch]
// Picks up where alphadog-v2-scoring-runner.js (Part 1) leaves off: enrichment-engine,
// hit-probability-board, scoring-engine-shadow-v1, score-final-board, certifier-last-pass.
//
// DEPENDABILITY / CASCADE: this only proceeds if Part 1's output (score.prop_matrix_current) is
// genuinely fresh - updated within the last MAX_MATRIX_STALENESS_MINUTES. This is a simple,
// robust check (not exact batch/chain-ID matching, which proved fragile during manual testing)
// that directly verifies the data this stage is about to enrich is actually current, rather than
// blindly running on a timer and silently working on stale data if Part 1 ran late or failed.
// If Part 1's data isn't fresh enough yet, this returns a clear "skipped, waiting for part1"
// result rather than erroring or proceeding incorrectly - the same fail-safe, ordered-cascade
// behavior as the original single-worker chain, just split across two scheduled workers.

import postgres from "postgres";

const SCORING_LOCK_KEY = "alphadog_scoring_full_run_part2";
const LOCK_HOLD_MINUTES = 30;
const MAX_MATRIX_STALENESS_MINUTES = 25; // Part 1 fires 8 min before Part 2 in the schedule;
// this generous window absorbs normal Part 1 runtime variance while still catching "Part 1
// never ran / failed silently" cases.

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
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${SCORING_LOCK_KEY}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${SCORING_LOCK_KEY} AND (locked_until IS NULL OR locked_until < now())
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
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${SCORING_LOCK_KEY} AND holder = ${holderId}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

async function checkPart1Freshness(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    const rows = await client`SELECT MAX(updated_at) AS last_update FROM score.prop_matrix_current`;
    const lastUpdate = rows[0] && rows[0].last_update;
    if (!lastUpdate) return { fresh: false, reason: "no_matrix_data_at_all", last_update: null };
    const ageMinutes = (Date.now() - new Date(lastUpdate).getTime()) / 60000;
    return { fresh: ageMinutes <= MAX_MATRIX_STALENESS_MINUTES, reason: ageMinutes <= MAX_MATRIX_STALENESS_MINUTES ? "fresh" : "stale", last_update: lastUpdate, age_minutes: Math.round(ageMinutes * 10) / 10 };
  } catch (err) {
    return { fresh: false, reason: "check_failed", error: String(err && err.message ? err.message : err) };
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

const WORKER_NAME = "alphadog-v2-scoring-runner-part2";
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

// Part 2 stages: enrichment, hp-board, scoring-engine, final-board, certifier-last-pass.
const STAGES = [
  { bindingKey: "ENRICHMENT_ENGINE_WORKER", bindingName: "enrichment-engine", mode: "enrichment_run" },
  { bindingKey: "HIT_PROBABILITY_BOARD_WORKER", bindingName: "hit-probability-board", mode: "hit_probability_board_run" },
  { bindingKey: "SCORING_ENGINE_WORKER", bindingName: "scoring-engine-shadow-v1", mode: "scoring_engine_run" },
  { bindingKey: "SCORE_FINAL_BOARD_WORKER", bindingName: "score-final-board", mode: "final_board_run" },
  { bindingKey: "SCORING_CERTIFIER_WORKER", bindingName: "scoring-full-run-certifier", mode: "scoring_full_run_certifier_last_pass" }
];

async function runScoringPart2(env, input) {
  const runId = `scoring_runner_part2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = nowIso();

  // Dependability check: only proceed if Part 1 genuinely finished recently. This is what keeps
  // the cascade strictly ordered across two separate scheduled workers, same as it was within
  // one worker before.
  let freshness = await checkPart1Freshness(env);
  let freshnessRetries = 0;
  while (!freshness.fresh && !input.skip_freshness_check && freshnessRetries < 2) {
    await new Promise(r => setTimeout(r, 3 * 60 * 1000));
    freshness = await checkPart1Freshness(env);
    freshnessRetries++;
  }
  if (!freshness.fresh && !input.skip_freshness_check) {
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      run_id: runId,
      started_at: startedAt,
      finished_at: nowIso(),
      certification: "SCORING_FULL_RUN_PART2_SKIPPED_PART1_NOT_FRESH",
      skipped: true,
      freshness_wait_retries: freshnessRetries,
      part1_freshness: freshness,
      stages: []
    };
  }

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
      certification: "SCORING_FULL_RUN_PART2_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      stages: []
    };
  }

  try {
    return await runScoringPart2Locked(env, input, runId, startedAt, freshness);
  } finally {
    await releaseLock(lock.client, runId);
  }
}

const MAX_PAGINATION_ITERATIONS_PER_STAGE = 20;
const SAFE_WALL_CLOCK_BUDGET_MS = 13 * 60 * 1000; // Cron Triggers have a hard 15-minute wall-clock
// ceiling (confirmed via Cloudflare docs and multiple independent sources) - this is separate
// from CPU time limits (cpu_ms), which exclude I/O wait entirely. Leaves a 2-minute buffer so the
// loop stops cleanly on its own terms rather than risking an abrupt platform-level kill mid-stage.

async function selfContinueIfNeeded(env, result, retryCount) {
  if (!result.stopped_for_wall_clock_budget_any_stage || retryCount >= 2) return;
  try {
    await fetch("https://alphadog-v2-scoring-runner-part2.rodolfoaamattos.workers.dev/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trigger: "self_continuation", self_continuation_retry_count: retryCount + 1 })
    }).catch(() => {});
  } catch (_) {}
}

async function runScoringPart2Locked(env, input, runId, startedAt, freshness) {
  const invocationDeadline = Date.now() + SAFE_WALL_CLOCK_BUDGET_MS;
  const stages = [];

  for (const s of STAGES) {
    let result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}_${s.mode}`, chain_id: runId, trigger: "scoring_runner_part2" });
    let iterations = 1;
    let stoppedForTimeBudget = false;
    while (result.ok && result.certification === "partial_continue" && iterations < MAX_PAGINATION_ITERATIONS_PER_STAGE) {
      if (Date.now() >= invocationDeadline) { stoppedForTimeBudget = true; break; }
      result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}_${s.mode}_p${iterations}`, chain_id: runId, trigger: "scoring_runner_part2" });
      iterations++;
    }
    result.pagination_iterations = iterations;
    result.stopped_for_wall_clock_budget = stoppedForTimeBudget;
    stages.push(result);
    if (!result.ok || stoppedForTimeBudget) break;
  }

  const allOk = stages.every(s => s.ok);
  const lastStageOk = stages.length && stages[stages.length - 1].ok;
  const timeBudgetStop = stages.some(s => s.stopped_for_wall_clock_budget);

  return {
    ok: allOk && !timeBudgetStop,
    data_ok: lastStageOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(),
    certification: timeBudgetStop ? "SCORING_FULL_RUN_PART2_STOPPED_FOR_WALL_CLOCK_BUDGET_NEEDS_RETRY" : (allOk ? "SCORING_FULL_RUN_PART2_COMPLETE" : (lastStageOk ? "SCORING_FULL_RUN_PART2_PARTIAL_NONCRITICAL_FAILURE" : "SCORING_FULL_RUN_PART2_FAILED")),
    stopped_for_wall_clock_budget_any_stage: timeBudgetStop,
    part1_freshness: freshness,
    stages
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScoringPart2(env, { trigger: "cron", cron: event.cron }).then(r => selfContinueIfNeeded(env, r, 0)).finally(() => selfCleanupAfterPhase(env)));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({
        ok: true,
        worker_name: WORKER_NAME,
        version: VERSION,
        max_matrix_staleness_minutes: MAX_MATRIX_STALENESS_MINUTES,
        bindings_present: Object.fromEntries(STAGES.map(s => [s.bindingKey, !!env[s.bindingKey]]))
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const retryCount = Number(input.self_continuation_retry_count || 0);
      const workPromise = runScoringPart2(env, input);
      ctx.waitUntil(workPromise.then(r => selfContinueIfNeeded(env, r, retryCount)).catch(() => {}).finally(() => selfCleanupAfterPhase(env)));
      const result = await workPromise;
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
