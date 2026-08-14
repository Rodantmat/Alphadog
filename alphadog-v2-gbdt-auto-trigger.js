import postgres from "postgres";

// PORTED FROM D1 TO POSTGRES 2026-08-14: the original D1-based version (CONFIG_DB, CONTROL_DB)
// was confirmed permanently broken - both D1 databases are physically deleted from Cloudflare
// (confirmed directly via query, not inferred), causing a hard runtime crash on every call.
// Chosen to port rather than tag dead, since this is a real, wanted feature (GBDT training
// auto-trigger), not superseded legacy - unlike score-audit.js, which was confirmed replaced by
// a newer system and left dead. Same logic, same behavior, same safe-disabled-by-default
// posture - only the storage layer changed. control.gbdt_auto_trigger_switch and
// control.gbdt_training_requests are the new Postgres homes for the old D1 tables' data;
// config.external_credentials (already existing, already used elsewhere tonight) replaces
// CONFIG_DB.config_external_credentials for the GitHub PAT lookup.

const WORKER_NAME = "alphadog-v2-gbdt-auto-trigger";
const VERSION = "alphadog-v2-gbdt-auto-trigger-v0.2.0-postgres-rewire";
const GITHUB_OWNER = "Rodantmat";
const GITHUB_REPO = "Alphadog";
const WORKFLOW_FILE = "gbdt-training.yml";

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 2, fetch_types: false, prepare: false, connect_timeout: 8 }); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS control.gbdt_auto_trigger_switch (id INT PRIMARY KEY DEFAULT 1, enabled INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now())`;
  await sql`INSERT INTO control.gbdt_auto_trigger_switch (id, enabled) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`;
  await sql`CREATE TABLE IF NOT EXISTS control.gbdt_training_requests (request_id TEXT PRIMARY KEY, season INT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', requested_at TIMESTAMPTZ DEFAULT now(), dispatched_at TIMESTAMPTZ, error_message TEXT)`;
}

async function isEnabled(sql) {
  const rows = await sql`SELECT enabled FROM control.gbdt_auto_trigger_switch WHERE id=1`;
  return !!(rows[0] && Number(rows[0].enabled) === 1);
}

async function findPendingRequest(sql) {
  const rows = await sql`SELECT request_id, season FROM control.gbdt_training_requests WHERE status='pending' ORDER BY requested_at ASC LIMIT 1`;
  return rows[0] || null;
}

async function resolveGithubPat(env, sql) {
  try {
    const rows = await sql`SELECT credential_value_encrypted FROM config.external_credentials WHERE credential_key='gbdt_auto_trigger_github_pat' LIMIT 1`;
    if (rows[0] && rows[0].credential_value_encrypted) {
      const raw = rows[0].credential_value_encrypted;
      try { const parsed = JSON.parse(raw); if (parsed && parsed.password) return String(parsed.password).trim(); } catch (_) {}
      if (String(raw).trim()) return String(raw).trim();
    }
  } catch (_) {
    // config.external_credentials read failed - fall through to env secret below rather than hard-failing.
  }
  return env.GBDT_AUTO_TRIGGER_GITHUB_PAT || null;
}

async function dispatchWorkflow(env, sql, season) {
  const pat = await resolveGithubPat(env, sql);
  if (!pat || pat === "DISABLED") {
    return { ok: false, error: "No GitHub PAT available (checked config.external_credentials, then env secret)" };
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
    body: JSON.stringify({ ref: "main", inputs: { seasons: String(season) } }),
  });
  if (resp.status === 204) return { ok: true };
  const text = await resp.text().catch(() => "");
  return { ok: false, error: `github_api_status_${resp.status}`, detail: text.slice(0, 500) };
}

async function tick(env) {
  const sql = pg(env);
  try {
    await ensureSchema(sql);
    const enabled = await isEnabled(sql);
    if (!enabled) return { ok: true, status: "auto_trigger_disabled", checked_at: new Date().toISOString() };

    const pending = await findPendingRequest(sql);
    if (!pending) return { ok: true, status: "no_pending_requests", checked_at: new Date().toISOString() };

    const result = await dispatchWorkflow(env, sql, pending.season);
    if (result.ok) {
      await sql`UPDATE control.gbdt_training_requests SET status='dispatched', dispatched_at=now() WHERE request_id=${pending.request_id}`;
      return { ok: true, status: "dispatched", request_id: pending.request_id, season: pending.season };
    }
    await sql`UPDATE control.gbdt_training_requests SET status='failed', error_message=${String(result.error || "unknown_error").slice(0, 900)} WHERE request_id=${pending.request_id}`;
    return { ok: false, status: "dispatch_failed", request_id: pending.request_id, error: result.error, detail: result.detail };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      const sql = pg(env);
      try {
        await ensureSchema(sql);
        const enabled = await isEnabled(sql);
        return jsonResponse({ ok: true, version: VERSION, worker_name: WORKER_NAME, auto_trigger_enabled: enabled });
      } finally {
        await sql.end({ timeout: 1 }).catch(() => {});
      }
    }

    // Convenience manual endpoints - equivalent to running the same SQL directly,
    // provided so the on/off switch and enqueue can be done via a simple request too.
    if (request.method === "POST" && path === "/toggle") {
      const body = await request.json().catch(() => ({}));
      const enabled = body.enabled ? 1 : 0;
      const sql = pg(env);
      try {
        await ensureSchema(sql);
        await sql`UPDATE control.gbdt_auto_trigger_switch SET enabled=${enabled}, updated_at=now() WHERE id=1`;
        return jsonResponse({ ok: true, auto_trigger_enabled: !!enabled });
      } finally {
        await sql.end({ timeout: 1 }).catch(() => {});
      }
    }

    if (request.method === "POST" && path === "/enqueue") {
      const body = await request.json().catch(() => ({}));
      const season = Number(body.season || 2025);
      const requestId = rid("gbdt_train_req");
      const sql = pg(env);
      try {
        await ensureSchema(sql);
        await sql`INSERT INTO control.gbdt_training_requests (request_id, season, status) VALUES (${requestId}, ${season}, 'pending')`;
        return jsonResponse({ ok: true, request_id: requestId, season });
      } finally {
        await sql.end({ timeout: 1 }).catch(() => {});
      }
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
