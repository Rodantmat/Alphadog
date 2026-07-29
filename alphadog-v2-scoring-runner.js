// alphadog-v2-scoring-runner.js  -- PART 1 of 2
// [2026-07-29: split from the original single 9-stage scoring-runner after its cron-triggered
// invocation was confirmed to exceed Cloudflare's hard 15-minute cron wall-clock ceiling on a
// heavy day - it completed matrix-builder but died mid-scoring-engine, never reaching
// final-board. This is Part 1: certifier-first-pass, prop-factor-miner (hitter+pitcher),
// matrix-builder - the heaviest, most variable stages, ending at the natural boundary where the
// candidate/matrix data is fully built. Part 2 (alphadog-v2-scoring-runner-part2.js) picks up
// from here: enrichment, hp-board, scoring-engine, final-board, certifier-last-pass. Part 2
// verifies this part actually completed fresh before proceeding, so the overall cascade is still
// strictly ordered and dependable - just split across two scheduled workers instead of one.]
// Simple, single-request runner - same design as board/daily-context/market runners. One
// request, sequential awaited service-binding calls, in the exact stage order the old
// orchestrator's SCORING_FULL_RUN_STAGES used.
//
// This chain has real inter-stage dependencies (each stage reads what the previous one wrote),
// so stages run strictly in sequence and a failure is reported clearly per-stage rather than
// silently continuing past a broken dependency.

import postgres from "postgres";

const SCORING_LOCK_KEY = "alphadog_scoring_full_run_part1";
const LOCK_HOLD_MINUTES = 15;

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

// Part 1 stages only: certifier-first-pass, prop-factor-miner (hitter+pitcher), matrix-builder.
const STAGES = [
  { bindingKey: "SCORING_CERTIFIER_WORKER", bindingName: "scoring-full-run-certifier", mode: "scoring_full_run_certifier_first_pass" },
  { bindingKey: "PROP_FACTOR_MINER_WORKER", bindingName: "prop-factor-miner", mode: "hitter_prop_factor_mining" },
  { bindingKey: "PROP_FACTOR_MINER_WORKER", bindingName: "prop-factor-miner", mode: "pitcher_prop_factor_mining" },
  { bindingKey: "MATRIX_BUILDER_WORKER", bindingName: "prop-matrix-builder", mode: "matrix_build" }
];

async function runScoringFullRun(env, input) {
  const runId = `scoring_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      certification: "SCORING_FULL_RUN_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      stages: []
    };
  }

  try {
    return await runScoringFullRunLocked(env, input, runId, startedAt);
  } finally {
    await releaseLock(lock.client, runId);
  }
}

const MAX_PAGINATION_ITERATIONS_PER_STAGE = 20; // safety bound: 20 * 500-per-invocation = 10,000 rows headroom

async function runScoringFullRunLocked(env, input, runId, startedAt) {
  const stages = [];

  for (const s of STAGES) {
    let result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}_${s.mode}`, chain_id: runId, trigger: "scoring_runner" });
    let iterations = 1;
    // Some stages (enrichment-engine confirmed) paginate internally and report certification
    // 'partial_continue' when more rows remain. Re-call with the SAME chain_id so the stage's own
    // batch_id-exclusion filter makes real forward progress, instead of silently moving on with the
    // tail of the data left stale/unenriched.
    while (result.ok && result.certification === "partial_continue" && iterations < MAX_PAGINATION_ITERATIONS_PER_STAGE) {
      result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}_${s.mode}_p${iterations}`, chain_id: runId, trigger: "scoring_runner" });
      iterations++;
    }
    result.pagination_iterations = iterations;
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
      const workPromise = runScoringFullRun(env, input);
      ctx.waitUntil(workPromise.catch(() => {}));
      const result = await workPromise;
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
