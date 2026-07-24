// alphadog-v2-board-runner.js
// Simple, single-request board-full-run runner.
//
// Design rationale (2026-07-24): the old orchestrator's board-full-run chain used a persistent
// job-queue table, cross-tick resume state, and a lock table to coordinate work across MANY small
// invocations. That complexity existed to work around what looked like a Cloudflare execution-time
// limit. It wasn't a real limit: Cloudflare Workers have UNLIMITED wall-clock time for I/O-bound work
// (waiting on a database or an API call costs nothing against any real platform limit). Only actual
// CPU computation is capped, and that cap is configurable up to 5 minutes via wrangler `limits.cpu_ms`.
// Since PrizePicks/Sleeper/Underdog/score-prep are almost entirely I/O-bound (waiting on GitHub, the
// Parlay API, and Postgres), they can each run to completion in a single request with no chunking.
//
// This worker calls the four existing, already-tested sub-workers directly via service bindings,
// in plain sequence, in one request. No queue table. No lock table. No cross-request resume state.
// If you trigger this twice by accident, worst case is two full runs happen back to back - nothing
// corrupts, because each sub-worker's own writes are idempotent (upserts keyed by natural IDs).

const WORKER_NAME = "alphadog-v2-board-runner";
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

async function callStage(binding, bindingName, path, input) {
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
    const resp = await binding.fetch(`https://internal.${bindingName}${path}`, {
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
      stage: bindingName,
      ok: !!output.ok,
      data_ok: !!output.data_ok,
      http_status: resp.status,
      certification: output.certification || output.status || null,
      rows_read: output.rows_read ?? null,
      rows_written: output.rows_written ?? null,
      rows_promoted: output.rows_promoted ?? output.promoted_rows_written ?? null,
      error: output.ok ? null : (output.error || output.certification || "stage_failed"),
      elapsed_ms: Date.now() - started
    };
  } catch (err) {
    return {
      stage: bindingName,
      ok: false,
      data_ok: false,
      error: String(err && err.message ? err.message : err),
      elapsed_ms: Date.now() - started
    };
  }
}

async function runBoardFullRun(env, input) {
  const runId = `board_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = nowIso();
  const stages = [];

  // Stage 1: PrizePicks (GitHub-sourced). Not last, so a failure here doesn't block the rest -
  // score-prep will just run on whatever PrizePicks data is already current.
  const prizepicks = await callStage(env.PRIZEPICKS_GITHUB_BOARD_WORKER, "prizepicks-github-board", "/run", {
    request_id: `${runId}_prizepicks`, trigger: "board_runner", mode: "board_full_run_prizepicks_refresh"
  });
  stages.push(prizepicks);

  // Stage 2: Sleeper
  const sleeper = await callStage(env.PARLAY_SLEEPER_BOARD_WORKER, "parlay-sleeper-board", "/run", {
    request_id: `${runId}_sleeper`, trigger: "board_runner", mode: "board_full_run_sleeper_refresh"
  });
  stages.push(sleeper);

  // Stage 3: Underdog
  const underdog = await callStage(env.PARLAY_UNDERDOG_BOARD_WORKER, "parlay-underdog-board", "/run", {
    request_id: `${runId}_underdog`, trigger: "board_runner", mode: "board_full_run_underdog_refresh"
  });
  stages.push(underdog);

  // Stage 4: score-prep. Now processes its entire row set in one pass (no more 500-row chunking -
  // see alphadog-v2-score-prep.js WRITE_ROWS_PER_INVOCATION comment). Loop defensively in case a
  // future data volume spike ever does require more than one pass, but this should normally be exactly one call.
  let scorePrep = null;
  let scorePrepAttempts = 0;
  const MAX_SCORE_PREP_CALLS = 5; // safety ceiling, not a chunk-size mechanism
  let scorePrepInput = { request_id: `${runId}_score_prep`, trigger: "board_runner", mode: "board_prep_enrichment" };
  while (scorePrepAttempts < MAX_SCORE_PREP_CALLS) {
    scorePrepAttempts += 1;
    scorePrep = await callStage(env.SCORE_PREP_WORKER, "score-prep", "/run", scorePrepInput);
    if (scorePrep.ok && !scorePrep.certification?.includes?.("PARTIAL_CONTINUE")) break;
    if (!scorePrep.ok) break; // real failure, stop and report - don't mask it with silent retries
    // still partial (unexpected with the new unlimited-row-pass design, but handled just in case)
    scorePrepInput = { ...scorePrepInput, resume: true };
  }
  stages.push({ ...scorePrep, attempts: scorePrepAttempts });

  const allOk = stages.every(s => s.ok);
  const criticalOk = scorePrep && scorePrep.ok; // score-prep is the stage that actually matters most for correctness

  return {
    ok: allOk,
    data_ok: criticalOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    run_id: runId,
    started_at: startedAt,
    finished_at: nowIso(),
    certification: allOk ? "BOARD_FULL_RUN_COMPLETE" : (criticalOk ? "BOARD_FULL_RUN_PARTIAL_NONCRITICAL_FAILURE" : "BOARD_FULL_RUN_FAILED"),
    stages
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBoardFullRun(env, { trigger: "cron", cron: event.cron }));
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
          PRIZEPICKS_GITHUB_BOARD_WORKER: !!env.PRIZEPICKS_GITHUB_BOARD_WORKER,
          PARLAY_SLEEPER_BOARD_WORKER: !!env.PARLAY_SLEEPER_BOARD_WORKER,
          PARLAY_UNDERDOG_BOARD_WORKER: !!env.PARLAY_UNDERDOG_BOARD_WORKER,
          SCORE_PREP_WORKER: !!env.SCORE_PREP_WORKER
        }
      });
    }

    if (method === "POST" && (path === "/run" || path === "/")) {
      let input = {};
      try { input = await request.json(); } catch (_) {}
      const result = await runBoardFullRun(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
