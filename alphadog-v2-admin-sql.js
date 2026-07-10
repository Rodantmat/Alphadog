import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const WORKER_NAME = "alphadog-v2-admin-sql";
const VERSION = "alphadog-v2-admin-sql-mcp-bridge-v2.0-sdk";
const JOB_KEY = "admin-sql-mcp-bridge";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "ODDS_API_KEY", "PARLAY_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH", "MLB_API_USER_AGENT"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE", "DEFAULT_SLATE_MODE", "ODDS_API_BASE_URL", "PARLAY_API_BASE_URL", "MLB_API_BASE_URL", "PRIZEPICKS_SOURCE_MODE", "MAX_TICK_MS", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES", "WORKER_SAFE_MODE", "DEBUG_MODE", "MANUAL_SQL_ENABLED", "CONFIG_PHASE"];

const HARD_MAX_ROWS = 500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id"
};

function nowUtc() {
  return new Date().toISOString();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS
    }
  });
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) {
  return Object.values(obj).every(Boolean);
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  const secrets = varPresence(env, REQUIRED_SECRETS);

  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "MCP_BRIDGE_ACTIVE",
    timestamp_utc: nowUtc(),
    phase: "alphadog-v2-mcp-bridge",
    notes: [
      "This worker is the MCP bridge for Claude, built on Cloudflare's official agents/MCP SDK.",
      "GET /health and POST /diagnostic still report binding/secret presence.",
      "POST /mcp is handled by the McpAgent Durable Object, not hand-rolled JSON-RPC.",
      "OAuth endpoints below are a minimal single-user auto-approve flow, not a real login system."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets),
      control_room_service_binding_present: Boolean(env && env.CONTROL_ROOM)
    }
  };
}

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isAuthorized(request, env) {
  const auth = request.headers.get("authorization") || "";
  const headerToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") || "";
  const token = headerToken || queryToken;
  return Boolean(env.ALPHADOG_ADMIN_TOKEN) && token === env.ALPHADOG_ADMIN_TOKEN;
}

function isWriteStatement(sql) {
  const head = String(sql || "").trim().slice(0, 12).toUpperCase();
  return !head.startsWith("SELECT") && !head.startsWith("WITH") && !head.startsWith("PRAGMA");
}

async function toolRunSql(env, args) {
  const { database, sql, params, max_rows, allow_write } = args || {};

  if (!database || !REQUIRED_DB_BINDINGS.includes(database)) {
    return { ok: false, error: `Unknown or missing database. Must be one of: ${REQUIRED_DB_BINDINGS.join(", ")}` };
  }
  if (!env[database]) {
    return { ok: false, error: `Binding ${database} is not present on this worker.` };
  }
  if (!sql || typeof sql !== "string") {
    return { ok: false, error: "Missing sql string." };
  }
  if (isWriteStatement(sql) && !allow_write) {
    return { ok: false, error: "This looks like a write statement (not SELECT/WITH/PRAGMA). Re-call with allow_write:true if that's intended." };
  }

  const cap = Math.min(Number(max_rows) > 0 ? Number(max_rows) : HARD_MAX_ROWS, HARD_MAX_ROWS);

  try {
    const stmt = env[database].prepare(sql);
    const bound = Array.isArray(params) && params.length ? stmt.bind(...params) : stmt;
    const result = await bound.all();
    const rows = (result.results || []).slice(0, cap);
    return {
      ok: true,
      database,
      row_count_returned: rows.length,
      row_count_total_from_driver: (result.results || []).length,
      truncated: (result.results || []).length > rows.length,
      rows,
      meta: result.meta || null
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function toolRunJob(env, args) {
  const { job, extra } = args || {};
  if (!job || typeof job !== "string") {
    return { ok: false, error: "Missing job string." };
  }
  if (!env.CONTROL_ROOM) {
    return { ok: false, error: "CONTROL_ROOM service binding is not configured on this worker. Add a service binding named CONTROL_ROOM pointing at alphadog-v2-control-room in wrangler config." };
  }

  const body = {
    job,
    slate_mode: "AUTO_BY_GAME_DATE_TIME",
    backend_only: true,
    source: "claude_mcp_bridge",
    ...(extra && typeof extra === "object" ? extra : {})
  };

  try {
    const resp = await env.CONTROL_ROOM.fetch("https://internal/tasks/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, http_status: resp.status, response: parsed };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function toolCheckBindings(env) {
  return {
    ok: true,
    db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
    vars_present: varPresence(env, EXPECTED_VARS),
    secrets_present_only: varPresence(env, REQUIRED_SECRETS),
    control_room_service_binding_present: Boolean(env.CONTROL_ROOM)
  };
}

// ---- The actual MCP server, built on Cloudflare's official SDK ----------

export class AlphadogMcp extends McpAgent {
  server = new McpServer({ name: WORKER_NAME, version: VERSION });

  async init() {
    this.server.tool(
      "check_bindings",
      "Report which D1 database bindings, secrets, and vars are present on this bridge worker, without exposing any secret values.",
      {},
      async () => {
        const result = await toolCheckBindings(this.env);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "run_sql",
      "Run a SQL statement against one of the AlphaDog D1 databases and return the rows. SELECT is always allowed. Writes (INSERT/UPDATE/DELETE/CREATE/DROP/ALTER) require allow_write=true.",
      {
        database: z.enum(REQUIRED_DB_BINDINGS).describe("Which D1 database binding to run against."),
        sql: z.string().describe("The SQL statement to run. One statement at a time."),
        params: z.array(z.any()).optional().describe("Optional positional bind parameters."),
        max_rows: z.number().optional().describe(`Max rows to return (capped at ${HARD_MAX_ROWS}).`),
        allow_write: z.boolean().optional().describe("Must be true to run anything other than a SELECT statement.")
      },
      async (args) => {
        const result = await toolRunSql(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "run_job",
      "Enqueue a job on the AlphaDog orchestrator via the Control Room, the same way its dashboard buttons do. Returns the immediate response, not the finished job result — use run_sql afterward to check status/output tables.",
      {
        job: z.string().describe("The job key exactly as used by the Control Room buttons, e.g. 'orchestrator_enqueue_score_prep'."),
        extra: z.record(z.any()).optional().describe("Optional extra fields merged into the request body sent to /tasks/run.")
      },
      async (args) => {
        const result = await toolRunJob(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );
  }
}

// ---- Minimal auto-approving OAuth (single-user, no real login) ----------

async function handleOAuthAndAdminRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (method === "GET" && path === "/") {
    return jsonResponse(baseIdentity(env));
  }

  if (method === "GET" && path === "/health") {
    return jsonResponse({
      ...baseIdentity(env),
      route: "/health",
      checks: {
        db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
        vars: varPresence(env, EXPECTED_VARS),
        secrets_present_only: varPresence(env, REQUIRED_SECRETS)
      },
      safe_secret_note: "Secret values are intentionally never printed."
    });
  }

  if (method === "POST" && path === "/diagnostic") {
    const input = await readJsonSafe(request);
    return jsonResponse({
      ...baseIdentity(env),
      route: "/diagnostic",
      input_echo_safe: {
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        job_key: input.job_key || null,
        mode: input.mode || null
      },
      diagnostics: {
        db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
        vars: varPresence(env, EXPECTED_VARS),
        secrets_present_only: varPresence(env, REQUIRED_SECRETS)
      },
      writes_performed: 0,
      external_calls_performed: 0
    });
  }

  if (method === "GET" && path === "/debug-auth") {
    const authOk = isAuthorized(request, env);
    const queryToken = url.searchParams.get("token") || "";
    return jsonResponse({
      authorized: authOk,
      token_provided: Boolean(queryToken),
      token_provided_length: queryToken.length,
      admin_token_secret_present: Boolean(env.ALPHADOG_ADMIN_TOKEN),
      admin_token_secret_length: env.ALPHADOG_ADMIN_TOKEN ? env.ALPHADOG_ADMIN_TOKEN.length : 0
    });
  }

  if (method === "GET" && path === "/.well-known/oauth-protected-resource") {
    return jsonResponse({
      resource: `${url.origin}/mcp`,
      authorization_servers: [url.origin]
    });
  }

  if (method === "GET" && path === "/.well-known/oauth-authorization-server") {
    return jsonResponse({
      issuer: url.origin,
      authorization_endpoint: `${url.origin}/authorize`,
      token_endpoint: `${url.origin}/token`,
      registration_endpoint: `${url.origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256", "plain"]
    });
  }

  if (method === "POST" && path === "/register") {
    const input = await readJsonSafe(request);
    return jsonResponse({
      client_id: "alphadog-bridge-client",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: input.redirect_uris || [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    }, 201);
  }

  if (method === "GET" && path === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") || "";
    if (!redirectUri) {
      return jsonResponse({ ok: false, error: "Missing redirect_uri" }, 400);
    }
    const code = btoa(env.ALPHADOG_ADMIN_TOKEN || "");
    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);
    return Response.redirect(redirect.toString(), 302);
  }

  if (method === "POST" && path === "/token") {
    const contentType = request.headers.get("content-type") || "";
    let params;
    if (contentType.includes("application/json")) {
      params = await readJsonSafe(request);
    } else {
      const text = await request.text();
      params = Object.fromEntries(new URLSearchParams(text));
    }
    const grantType = params.grant_type;
    let accessToken = null;

    if (grantType === "authorization_code" && params.code) {
      try { accessToken = atob(params.code); } catch { accessToken = null; }
    } else if (grantType === "refresh_token" && params.refresh_token) {
      try { accessToken = atob(params.refresh_token); } catch { accessToken = null; }
    }

    if (!accessToken || accessToken !== env.ALPHADOG_ADMIN_TOKEN) {
      return jsonResponse({ error: "invalid_grant" }, 400);
    }

    return jsonResponse({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 31536000,
      refresh_token: btoa(env.ALPHADOG_ADMIN_TOKEN || "")
    });
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    const handled = await handleOAuthAndAdminRoutes(request, env);
    if (handled) return handled;

    if (path === "/mcp") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
      }
      return AlphadogMcp.serve("/mcp").fetch(request, env, ctx);
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /diagnostic", "GET /debug-auth", "POST /mcp"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
