// alphadog-v2-board-runner.js
// Simple, direct board-full-run pipeline. No queue table, no lock table, no cron-driven ticking.
// One request runs the whole thing: PrizePicks -> Sleeper -> Underdog -> Score-Prep, calling each
// stage worker directly via service binding and awaiting the result in sequence.
//
// Cloudflare CPU time (the only real platform limit, default 30s / configurable to 5 min) does NOT
// count time spent waiting on a sub-request or a database query - only actual computation counts.
// So this worker can safely await long-running sub-calls, and can loop calling the same stage again
// (with a short pause) if that stage reports it needs another pass, without ever approaching the
// CPU limit itself. That loop *is* the "worker stops, hands off, cools down, resumes" pattern -
// no separate relay worker is needed for this size of workload.
//
// Kept intentionally free of shared state: no job_queue rows, no lock table. If this is triggered
// twice at once, worst case is two full runs happening back to back - not corrupted shared state.

import postgres from "postgres";

const VERSION = "alphadog-v2-board-runner-v1.1.0";
const WORKER_NAME = "alphadog-v2-board-runner";

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: true, connect_timeout: 8, connection: { statement_timeout: 20000, idle_in_transaction_session_timeout: 20000 } });
}

async function log(env, requestId, event, detail) {
  try {
    const pg = pgClient(env);
    try {
      await pg.unsafe("INSERT INTO control.board_runner_log (request_id, event, detail) VALUES ($1, $2, $3)", [requestId, event, JSON.stringify(detail || {})]);
    } finally {
      await pg.end({ timeout: 3 }).catch(() => {});
    }
  } catch (_) {}
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWorker(binding, bindingName, input) {
  if (!binding || typeof binding.fetch !== "function") {
    return { ok: false, data_ok: false, error: `missing_service_binding_${bindingName}`, status: null };
  }
  const started = Date.now();
  try {
    const resp = await binding.fetch("https://internal.alphadog/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    const status = resp.status;
    let body = null;
    try { body = await resp.json(); } catch (_) { body = { ok: false, error: "non_json_response" }; }
    return { ...body, ok: body && body.ok !== false && status === 200, http_status: status, elapsed_ms: Date.now() - started };
  } catch (err) {
    return { ok: false, data_ok: false, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started };
  }
}

// Calls a stage once. If it reports continuation_required, calls it again (same worker, fresh
// invocation, fresh CPU budget) after a short cooldown, up to maxAttempts times, carrying forward
// whatever resume fields it returned.
async function runStageUntilDone(binding, bindingName, baseInput, opts = {}) {
  const maxAttempts = opts.maxAttempts || 40;
  const cooldownMs = opts.cooldownMs || 400;
  let attempt = 0;
  let input = { ...baseInput };
  let lastResult = null;
  const attemptLog = [];

  while (attempt < maxAttempts) {
    attempt += 1;
    const result = await callWorker(binding, bindingName, input);
    lastResult = result;
    attemptLog.push({
      attempt,
      ok: !!result.ok,
      data_ok: result.data_ok !== false,
      certification: result.certification || null,
      error: result.error || null,
      elapsed_ms: result.elapsed_ms
    });

    if (!result.ok) {
      // Real failure (not a "needs another pass" signal). Stop retrying blindly - surface it.
      break;
    }

    const needsContinuation = result.continuation_required === true;
    if (!needsContinuation) break;

    // Carry forward resume state for the next pass.
    input = {
      ...input,
      prep_batch_id: result.prep_batch_id || result.batch_id || input.prep_batch_id,
      batch_id: result.batch_id || result.prep_batch_id || input.batch_id,
      write_offset: result.next_write_offset ?? input.write_offset,
      score_prep_write_offset: result.next_write_offset ?? input.score_prep_write_offset
    };

    await sleep(cooldownMs);
  }

  return { final: lastResult, attempts: attempt, attempt_log: attemptLog };
}

async function runBoardFullRun(env, input) {
  const requestId = input.request_id || `board_run_${Date.now()}`;
  const started = Date.now();
  const stages = {};
  await log(env, requestId, "run_started", {});

  try {
    // 1. PrizePicks
    const prizepicks = await runStageUntilDone(env.PRIZEPICKS_GITHUB_BOARD_WORKER, "PRIZEPICKS_GITHUB_BOARD_WORKER",
      { request_id: `${requestId}_prizepicks`, chain_id: requestId, mode: "board_full_run_prizepicks_refresh" },
      { maxAttempts: 3, cooldownMs: 2000 });
    stages.prizepicks = { attempts: prizepicks.attempts, ok: !!(prizepicks.final && prizepicks.final.ok), certification: prizepicks.final && prizepicks.final.certification, error: prizepicks.final && prizepicks.final.error };
    await log(env, requestId, "stage_done_prizepicks", stages.prizepicks);

    // 2. Sleeper
    const sleeper = await runStageUntilDone(env.PARLAY_SLEEPER_BOARD_WORKER, "PARLAY_SLEEPER_BOARD_WORKER",
      { request_id: `${requestId}_sleeper`, chain_id: requestId, mode: "board_full_run_sleeper_refresh" },
      { maxAttempts: 3, cooldownMs: 2000 });
    stages.sleeper = { attempts: sleeper.attempts, ok: !!(sleeper.final && sleeper.final.ok), certification: sleeper.final && sleeper.final.certification, error: sleeper.final && sleeper.final.error };
    await log(env, requestId, "stage_done_sleeper", stages.sleeper);

    // 3. Underdog
    const underdog = await runStageUntilDone(env.PARLAY_UNDERDOG_BOARD_WORKER, "PARLAY_UNDERDOG_BOARD_WORKER",
      { request_id: `${requestId}_underdog`, chain_id: requestId, mode: "board_full_run_underdog_refresh" },
      { maxAttempts: 3, cooldownMs: 2000 });
    stages.underdog = { attempts: underdog.attempts, ok: !!(underdog.final && underdog.final.ok), certification: underdog.final && underdog.final.certification, error: underdog.final && underdog.final.error };
    await log(env, requestId, "stage_done_underdog", stages.underdog);

    // 4. Score-prep
    await log(env, requestId, "stage_starting_score_prep", {});
    const scorePrep = await runStageUntilDone(env.SCORE_PREP_WORKER, "SCORE_PREP_WORKER",
      { request_id: `${requestId}_score_prep`, chain_id: requestId, mode: "board_prep_enrichment" },
      { maxAttempts: 15, cooldownMs: 800 });
    stages.score_prep = {
      attempts: scorePrep.attempts,
      ok: !!(scorePrep.final && scorePrep.final.ok),
      certification: scorePrep.final && scorePrep.final.certification,
      rows_read: scorePrep.final && scorePrep.final.rows_read,
      inserted_current_rows: scorePrep.final && scorePrep.final.inserted_current_rows,
      error: scorePrep.final && scorePrep.final.error
    };
    await log(env, requestId, "stage_done_score_prep", stages.score_prep);

    const allOk = stages.prizepicks.ok && stages.sleeper.ok && stages.underdog.ok && stages.score_prep.ok;
    const output = {
      ok: allOk,
      data_ok: allOk,
      version: VERSION,
      worker_name: WORKER_NAME,
      request_id: requestId,
      status: allOk ? "BOARD_FULL_RUN_COMPLETE" : "BOARD_FULL_RUN_PARTIAL_FAILURE",
      elapsed_ms: Date.now() - started,
      stages,
      detail: {
        prizepicks: prizepicks.final,
        sleeper: sleeper.final,
        underdog: underdog.final,
        score_prep: scorePrep.final
      },
      timestamp_utc: nowIso()
    };
    await log(env, requestId, "run_complete", { ok: allOk, elapsed_ms: output.elapsed_ms });
    return output;
  } catch (err) {
    await log(env, requestId, "run_exception", { error: String(err && err.stack ? err.stack : err) });
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      request_id: requestId,
      status: "BOARD_FULL_RUN_EXCEPTION",
      error: String(err && err.message ? err.message : err),
      stages,
      elapsed_ms: Date.now() - started,
      timestamp_utc: nowIso()
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse({
        ok: true,
        version: VERSION,
        worker_name: WORKER_NAME,
        bindings: {
          PRIZEPICKS_GITHUB_BOARD_WORKER: !!env.PRIZEPICKS_GITHUB_BOARD_WORKER,
          PARLAY_SLEEPER_BOARD_WORKER: !!env.PARLAY_SLEEPER_BOARD_WORKER,
          PARLAY_UNDERDOG_BOARD_WORKER: !!env.PARLAY_UNDERDOG_BOARD_WORKER,
          SCORE_PREP_WORKER: !!env.SCORE_PREP_WORKER
        },
        purpose: "Simple, direct board-full-run: PrizePicks -> Sleeper -> Underdog -> Score-Prep, sequential, no queue, no lock table.",
        timestamp_utc: nowIso()
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      const input = await request.json().catch(() => ({}));
      const output = await runBoardFullRun(env, input);
      return jsonResponse(output, output.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", path }, 404);
  },

  async scheduled(event, env, ctx) {
    const output = await runBoardFullRun(env, { request_id: `board_run_cron_${Date.now()}` });
    console.log(JSON.stringify(output));
  }
};
