// alphadog-v2-master-runner.js
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

async function tryAcquireLock(env) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    const rows = await client`SELECT pg_try_advisory_lock(hashtext(${MASTER_LOCK_KEY})) as acquired`;
    return { acquired: !!(rows && rows[0] && rows[0].acquired), client };
  } catch (err) {
    try { await client.end({ timeout: 1 }); } catch (_) {}
    return { acquired: false, client: null, error: String(err && err.message ? err.message : err) };
  }
}

async function releaseLock(client) {
  if (!client) return;
  try {
    await client`SELECT pg_advisory_unlock(hashtext(${MASTER_LOCK_KEY}))`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}
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

async function callRunner(binding, bindingName, input) {
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
      elapsed_ms: Date.now() - started
    };
  } catch (err) {
    return {
      runner: bindingName,
      ok: false,
      data_ok: false,
      error: String(err && err.message ? err.message : err),
      elapsed_ms: Date.now() - started
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

  const lock = await tryAcquireLock(env);
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
      runners: []
    };
  }

  try {
    return await runMasterFullRunLocked(env, input, runId, startedAt);
  } finally {
    await releaseLock(lock.client);
  }
}

async function runMasterFullRunLocked(env, input, runId, startedAt) {
  const runners = [];

  for (const r of RUNNERS) {
    const result = await callRunner(env[r.bindingKey], r.bindingName, { request_id: `${runId}_${r.bindingName}`, chain_id: runId, trigger: "master_runner" });
    runners.push(result);
  }

  const allOk = runners.every(r => r.ok);
  const lastOk = runners.length && runners[runners.length - 1].ok;

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
      const result = await runMasterFullRun(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
