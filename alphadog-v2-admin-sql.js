const WORKER_NAME = "alphadog-v2-admin-sql";
const VERSION = "alphadog-v2-admin-sql-mcp-bridge-v1.0";
const JOB_KEY = "admin-sql-mcp-bridge";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "ODDS_API_KEY", "PARLAY_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH", "MLB_API_USER_AGENT"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE", "DEFAULT_SLATE_MODE", "ODDS_API_BASE_URL", "PARLAY_API_BASE_URL", "MLB_API_BASE_URL", "PRIZEPICKS_SOURCE_MODE", "MAX_TICK_MS", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES", "WORKER_SAFE_MODE", "DEBUG_MODE", "MANUAL_SQL_ENABLED", "CONFIG_PHASE"];

// Hard safety cap, independent of what the caller asks for.
const HARD_MAX_ROWS = 500;

function nowUtc() {
  return new Date().toISOString();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
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
      "This worker is now the MCP bridge for Claude.",
      "GET /health and POST /diagnostic still report binding/secret presence.",
      "POST /mcp is the JSON-RPC endpoint Claude's custom connector talks to.",
      "Real SQL and real job enqueue happen through /mcp only, and only with a valid bearer token."
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

// ---- MCP tool definitions -------------------------------------------------

const TOOLS = [
  {
    name: "run_sql",
    description: "Run a SQL statement against one of the AlphaDog D1 databases and return the rows. SELECT is always allowed. Writes (INSERT/UPDATE/DELETE/CREATE/DROP/ALTER) require allow_write=true.",
    inputSchema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          enum: REQUIRED_DB_BINDINGS,
          description: "Which D1 database binding to run against."
        },
        sql: { type: "string", description: "The SQL statement to run. One statement at a time." },
        params: {
          type: "array",
          items: {},
          description: "Optional positional bind parameters for the SQL statement."
        },
        max_rows: {
          type: "integer",
          description: `Max rows to return (capped at ${HARD_MAX_ROWS} regardless of what is requested).`
        },
        allow_write: {
          type: "boolean",
          description: "Must be true to run anything other than a SELECT statement."
        }
      },
      required: ["database", "sql"]
    }
  },
  {
    name: "run_job",
    description: "Enqueue a job on the AlphaDog orchestrator via the Control Room, the same way its dashboard buttons do (e.g. 'baseline_v5_stateful_delta', 'orchestrator_enqueue_score_prep', etc). Returns the Control Room's response, not the final job result — use run_sql afterward to check job status/output tables.",
    inputSchema: {
      type: "object",
      properties: {
        job: { type: "string", description: "The job key exactly as used by the Control Room buttons, e.g. 'orchestrator_enqueue_score_prep'." },
        extra: {
          type: "object",
          description: "Optional extra fields to merge into the request body sent to /tasks/run."
        }
      },
      required: ["job"]
    }
  },
  {
    name: "check_bindings",
    description: "Report which D1 database bindings, secrets, and vars are present on this bridge worker, without exposing any secret values.",
    inputSchema: { type: "object", properties: {} }
  }
];

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

// ---- Minimal JSON-RPC 2.0 / MCP handling ----------------------------------

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMcp(request, env) {
  if (!isAuthorized(request, env)) {
    return jsonResponse({ ok: false, error: "Unauthorized. Provide 'Authorization: Bearer <ALPHADOG_ADMIN_TOKEN>'." }, 401);
  }

  const body = await readJsonSafe(request);
  const { id, method, params } = body || {};

  if (method === "initialize") {
    return jsonResponse(rpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: WORKER_NAME, version: VERSION }
    }));
  }

  if (method === "notifications/initialized") {
    // Notifications have no id and expect no body reply in strict MCP, but
    // returning 202 with empty body is safe for HTTP transport.
    return new Response(null, { status: 202 });
  }

  if (method === "tools/list") {
    return jsonResponse(rpcResult(id, { tools: TOOLS }));
  }

  if (method === "tools/call") {
    const toolName = params && params.name;
    const args = (params && params.arguments) || {};
    let toolResult;

    if (toolName === "run_sql") toolResult = await toolRunSql(env, args);
    else if (toolName === "run_job") toolResult = await toolRunJob(env, args);
    else if (toolName === "check_bindings") toolResult = await toolCheckBindings(env);
    else return jsonResponse(rpcError(id, -32601, `Unknown tool: ${toolName}`));

    return jsonResponse(rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }],
      isError: toolResult && toolResult.ok === false
    }));
  }

  return jsonResponse(rpcError(id, -32601, `Unknown method: ${method}`));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") {
      return jsonResponse(baseIdentity(env));
    }

    if (method === "GET" && path === "/health") {
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      const secrets = varPresence(env, REQUIRED_SECRETS);

      return jsonResponse({
        ...baseIdentity(env),
        route: "/health",
        checks: {
          db_bindings: db,
          vars: vars,
          secrets_present_only: secrets
        },
        safe_secret_note: "Secret values are intentionally never printed."
      });
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      const secrets = varPresence(env, REQUIRED_SECRETS);

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
          db_bindings: db,
          vars: vars,
          secrets_present_only: secrets
        },
        writes_performed: 0,
        external_calls_performed: 0
      });
    }

    if (method === "POST" && (path === "/mcp" || path === "/")) {
      return handleMcp(request, env);
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /diagnostic", "POST /mcp"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
