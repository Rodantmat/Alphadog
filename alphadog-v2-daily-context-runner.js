// alphadog-v2-daily-context-runner.js
// Simple, single-request daily-context-full-run runner - same design as alphadog-v2-board-runner.js.
// One request, sequential awaited service-binding calls to the 9 existing, already-tested stage
// workers, in the exact order the old orchestrator's DAILY_CONTEXT_FULL_RUN_STAGES used. No queue
// table, no lock table, no cross-request resume state. Callable directly via run_job (not
// cron-dependent) or by its own cron trigger once the schedule is finalized.

import postgres from "postgres";

const DAILY_CONTEXT_LOCK_KEY = "alphadog_daily_context_full_run";
const LOCK_HOLD_MINUTES = 10;

async function tryAcquireLock(env, holderId) {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 });
  try {
    await client`CREATE TABLE IF NOT EXISTS control.runner_locks (lock_key TEXT PRIMARY KEY, locked_until TIMESTAMPTZ, holder TEXT, acquired_at TIMESTAMPTZ)`;
    await client`INSERT INTO control.runner_locks (lock_key, locked_until, holder) VALUES (${DAILY_CONTEXT_LOCK_KEY}, NULL, NULL) ON CONFLICT (lock_key) DO NOTHING`;
    const rows = await client`
      UPDATE control.runner_locks
      SET locked_until = now() + (${LOCK_HOLD_MINUTES} || ' minutes')::interval, holder = ${holderId}, acquired_at = now()
      WHERE lock_key = ${DAILY_CONTEXT_LOCK_KEY} AND (locked_until IS NULL OR locked_until < now())
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
    await client`UPDATE control.runner_locks SET locked_until = NULL, holder = NULL WHERE lock_key = ${DAILY_CONTEXT_LOCK_KEY} AND holder = ${holderId}`;
  } catch (_) {
  } finally {
    try { await client.end({ timeout: 1 }); } catch (_) {}
  }
}

const WORKER_NAME = "alphadog-v2-daily-context-runner";
const VERSION = "v1.0.1";

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

// Same order as the old orchestrator's DAILY_CONTEXT_FULL_RUN_STAGES.
const STAGES = [
  { bindingKey: "DAILY_CERTIFIER_WORKER", bindingName: "daily-certifier", mode: "daily_context_full_run_certifier_first_pass" },
  { bindingKey: "DAILY_GAMES_STATUS_WORKER", bindingName: "daily-games-status", mode: "daily_context_full_run_games_status" },
  { bindingKey: "DAILY_PROBABLE_PITCHERS_WORKER", bindingName: "daily-probable-pitchers", mode: "daily_context_full_run_starters" },
  { bindingKey: "DAILY_LINEUPS_WORKER", bindingName: "daily-lineups", mode: "daily_context_full_run_lineups" },
  { bindingKey: "DAILY_PLAYER_AVAILABILITY_WORKER", bindingName: "daily-player-availability", mode: "daily_context_full_run_player_availability" },
  { bindingKey: "DAILY_WEATHER_WORKER", bindingName: "daily-weather", mode: "daily_context_full_run_weather_roof" },
  { bindingKey: "DAILY_BULLPEN_AVAILABILITY_WORKER", bindingName: "daily-bullpen-availability", mode: "daily_context_full_run_bullpen" },
  { bindingKey: "DAILY_SCHEDULE_WORKER", bindingName: "daily-team-schedule-spot", mode: "daily_context_full_run_team_schedule_spot" },
  { bindingKey: "DAILY_USAGE_PULSE_WORKER", bindingName: "daily-umpire-context", mode: "daily_context_full_run_umpire" },
  { bindingKey: "DAILY_CERTIFIER_WORKER", bindingName: "daily-certifier", mode: "daily_context_full_run_certifier" }
];

async function runDailyContextFullRun(env, input) {
  const runId = `daily_context_runner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      certification: "DAILY_CONTEXT_FULL_RUN_SKIPPED_ALREADY_RUNNING",
      skipped: true,
      lock_error: lock.error || null,
      stages: []
    };
  }

  try {
    return await runDailyContextFullRunLocked(env, input, runId, startedAt);
  } finally {
    await releaseLock(lock.client, runId);
  }
}

async function runDailyContextFullRunLocked(env, input, runId, startedAt) {
  const stages = [];

  for (const s of STAGES) {
    const result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}`, trigger: "daily_context_runner" });
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
    certification: allOk ? "DAILY_CONTEXT_FULL_RUN_COMPLETE" : (lastStageOk ? "DAILY_CONTEXT_FULL_RUN_PARTIAL_NONCRITICAL_FAILURE" : "DAILY_CONTEXT_FULL_RUN_FAILED"),
    stages
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyContextFullRun(env, { trigger: "cron", cron: event.cron }));
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
      const workPromise = runDailyContextFullRun(env, input);
      ctx.waitUntil(workPromise.catch(() => {}));
      const result = await workPromise;
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
