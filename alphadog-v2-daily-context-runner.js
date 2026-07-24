// alphadog-v2-daily-context-runner.js
// Simple, single-request daily-context-full-run runner - same design as alphadog-v2-board-runner.js.
// One request, sequential awaited service-binding calls to the 9 existing, already-tested stage
// workers, in the exact order the old orchestrator's DAILY_CONTEXT_FULL_RUN_STAGES used. No queue
// table, no lock table, no cross-request resume state. Callable directly via run_job (not
// cron-dependent) or by its own cron trigger once the schedule is finalized.

const WORKER_NAME = "alphadog-v2-daily-context-runner";
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

async function callStage(binding, bindingName, mode, input) {
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
      elapsed_ms: Date.now() - started
    };
  } catch (err) {
    return {
      stage: bindingName,
      mode,
      ok: false,
      data_ok: false,
      error: String(err && err.message ? err.message : err),
      elapsed_ms: Date.now() - started
    };
  }
}

// Same order as the old orchestrator's DAILY_CONTEXT_FULL_RUN_STAGES.
const STAGES = [
  { bindingKey: "DAILY_CERTIFIER_WORKER", bindingName: "daily-certifier", mode: "daily_context_full_run_certifier_first_pass" },
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
  const stages = [];

  for (const s of STAGES) {
    const result = await callStage(env[s.bindingKey], s.bindingName, s.mode, { request_id: `${runId}_${s.bindingName}`, trigger: "daily_context_runner" });
    stages.push(result);
    // Not last-stage-blocking: a non-final stage failing doesn't stop the rest, same philosophy
    // as board-runner - later stages should still run on whatever data is already current.
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
      const result = await runDailyContextFullRun(env, input);
      return jsonResponse(result, result.ok ? 200 : 207);
    }

    return jsonResponse({ ok: false, error: "not_found", worker_name: WORKER_NAME }, 404);
  }
};
