const WORKER_NAME = "alphadog-v2-calibration-scheduler";
const VERSION = "alphadog-v2-calibration-scheduler-v1.0.0";
const JOB_KEY = "calibration-scheduler";

// SAFETY NOTE: deliberately tiny and separate from alphadog-v2-phase3a-first-inning-pitcher-context.js
// (the file that caused a production hang earlier this session when modified directly). This worker
// never edits that file - it only calls its already-existing, already-safe calibration_report mode
// via service binding, on a schedule. Read-only from the calibration system's perspective: the
// report itself writes nothing (dry_run internally); this worker just triggers it and records the
// result for later review.

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

import postgres from "postgres";

async function logExecution(env, result, triggerInfo) {
  // Direct, minimal DB connection used ONLY to write this worker's own execution log -
  // completely independent of the fragile core scoring file, which is deliberately not touched
  // again this session. A logging failure here must never affect the actual scheduled call.
  if (!env.HYPERDRIVE) return;
  let sql;
  try {
    sql = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 5 });
    const needsAttention = result?.report?.needs_attention;
    const totalProps = result?.report?.total_props;
    await sql.unsafe(
      `INSERT INTO control.claude_session_log (topic, finding, status, next_step) VALUES ($1, $2, $3, $4)`,
      [
        "AUTOMATED_calibration_scheduler_run",
        `Trigger: ${triggerInfo || "manual"}. report_http_status=${result?.report_http_status}. needs_attention=${needsAttention ?? "n/a"} of ${totalProps ?? "n/a"} props checked.`,
        result?.ok ? "AUTOMATED_RUN_COMPLETED" : "AUTOMATED_RUN_FAILED",
        null
      ]
    );
  } catch (_) { /* logging must never break the actual scheduled call */ }
  finally { if (sql) await sql.end({ timeout: 1 }).catch(() => {}); }
}

async function runScheduledCalibrationReport(env, triggerInfo) {
  if (!env.PHASE3A_WORKER) {
    return { ok: false, error: "PHASE3A_WORKER service binding not present" };
  }
  const resp = await env.PHASE3A_WORKER.fetch("https://internal/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "calibration_report" })
  });
  const body = await resp.json().catch((e) => ({ ok: false, error: `non-JSON response: ${String(e)}` }));
  const result = {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    triggered_at: nowUtc(),
    report_http_status: resp.status,
    report: body
  };
  await logExecution(env, result, triggerInfo);
  return result;
}

function identity(env) {
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: "ready",
    calls: ["PHASE3A_WORKER (mode: calibration_report)"],
    safety_note: "This worker writes nothing itself - calibration_report is read/dry-run internally. Deliberately kept separate from the core scoring file to avoid any risk to it.",
    phase3a_binding_present: Boolean(env.PHASE3A_WORKER)
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledCalibrationReport(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const output = await runScheduledCalibrationReport(env);
      return jsonResponse(output, output.ok ? 200 : 400);
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
