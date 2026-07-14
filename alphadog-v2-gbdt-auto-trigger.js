// Real, minimal, standalone auto-trigger for the GBDT training GitHub Actions workflow -
// built specifically for testing convenience, per explicit instruction: "so you don't
// depend on me to trigger it, at least on this testing times." Easily switchable on/off
// via a single DB flag (CONFIG_DB.config_gbdt_auto_trigger_switch), no redeploy needed
// to toggle - the cron keeps ticking cheaply (one read-only SQL check) when disabled.

const WORKER_NAME = "alphadog-v2-gbdt-auto-trigger";
const VERSION = "alphadog-v2-gbdt-auto-trigger-v0.1.0";
const GITHUB_OWNER = "Rodantmat";
const GITHUB_REPO = "Alphadog";
const WORKFLOW_FILE = "gbdt-training.yml";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

async function isEnabled(env) {
  const row = await env.CONFIG_DB.prepare(
    "SELECT enabled FROM config_gbdt_auto_trigger_switch WHERE id=1"
  ).first();
  return !!(row && Number(row.enabled) === 1);
}

async function findPendingRequest(env) {
  return env.CONTROL_DB.prepare(
    "SELECT request_id, season FROM control_gbdt_training_requests WHERE status='pending' ORDER BY requested_at ASC LIMIT 1"
  ).first();
}

async function resolveGithubPat(env) {
  try {
    const row = await env.CONFIG_DB.prepare(
      "SELECT password FROM config_external_credentials WHERE credential_key='gbdt_auto_trigger_github_pat'"
    ).first();
    if (row && row.password) return row.password;
  } catch (_) {
    // CONFIG_DB read failed - fall through to env secret below rather than hard-failing.
  }
  return env.GBDT_AUTO_TRIGGER_GITHUB_PAT || null;
}

async function dispatchWorkflow(env, season) {
  const pat = await resolveGithubPat(env);
  if (!pat || pat === "DISABLED") {
    return { ok: false, error: "No GitHub PAT available (checked CONFIG_DB.config_external_credentials, then env secret)" };
  }
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "AlphaDog-GBDT-AutoTrigger",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { season: String(season) } }),
  });
  if (resp.status === 204) return { ok: true };
  const text = await resp.text().catch(() => "");
  return { ok: false, error: `github_api_status_${resp.status}`, detail: text.slice(0, 500) };
}

async function tick(env) {
  const enabled = await isEnabled(env);
  if (!enabled) return { ok: true, status: "auto_trigger_disabled", checked_at: new Date().toISOString() };

  const pending = await findPendingRequest(env);
  if (!pending) return { ok: true, status: "no_pending_requests", checked_at: new Date().toISOString() };

  const result = await dispatchWorkflow(env, pending.season);
  if (result.ok) {
    await env.CONTROL_DB.prepare(
      "UPDATE control_gbdt_training_requests SET status='dispatched', dispatched_at=CURRENT_TIMESTAMP WHERE request_id=?"
    ).bind(pending.request_id).run();
    return { ok: true, status: "dispatched", request_id: pending.request_id, season: pending.season };
  }
  await env.CONTROL_DB.prepare(
    "UPDATE control_gbdt_training_requests SET status='failed', error_message=? WHERE request_id=?"
  ).bind(String(result.error || "unknown_error").slice(0, 900), pending.request_id).run();
  return { ok: false, status: "dispatch_failed", request_id: pending.request_id, error: result.error, detail: result.detail };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      const enabled = await isEnabled(env);
      return jsonResponse({ ok: true, version: VERSION, worker_name: WORKER_NAME, auto_trigger_enabled: enabled });
    }

    // Convenience manual endpoints - equivalent to running the same SQL directly,
    // provided so the on/off switch and enqueue can be done via a simple request too.
    if (request.method === "POST" && path === "/toggle") {
      const body = await request.json().catch(() => ({}));
      const enabled = body.enabled ? 1 : 0;
      await env.CONFIG_DB.prepare(
        "UPDATE config_gbdt_auto_trigger_switch SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1"
      ).bind(enabled).run();
      return jsonResponse({ ok: true, auto_trigger_enabled: !!enabled });
    }

    if (request.method === "POST" && path === "/enqueue") {
      const body = await request.json().catch(() => ({}));
      const season = Number(body.season || 2025);
      const requestId = rid("gbdt_train_req");
      await env.CONTROL_DB.prepare(
        "INSERT INTO control_gbdt_training_requests (request_id, season, status) VALUES (?, ?, 'pending')"
      ).bind(requestId, season).run();
      return jsonResponse({ ok: true, request_id: requestId, season });
    }

    if (request.method === "POST" && path === "/tick") {
      const output = await tick(env);
      return jsonResponse(output, output.ok ? 200 : 500);
    }

    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /toggle", "POST /enqueue", "POST /tick"] }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};
