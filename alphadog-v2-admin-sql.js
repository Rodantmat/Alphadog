import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-admin-sql";
const VERSION = "alphadog-v2-admin-sql-mcp-bridge-v3.1-scoring-runner-binding";
const JOB_KEY = "admin-sql-mcp-bridge";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB", "SCORING_DB"];
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

async function toolRunPostgres(env, args) {
  // Read-only-by-default Postgres query tool via Hyperdrive, mirroring toolRunSql's D1 safety
  // pattern exactly (SELECT/WITH always allowed, anything else needs allow_write:true).
  // prepare:false is mandatory here - see ALPHADOG_DOS_AND_DONTS.md - without it, postgres.js's
  // prepared-statement mode silently masks real Postgres errors as generic "connection lost".
  const { sql: sqlText, params, max_rows, allow_write } = args || {};
  if (!env.HYPERDRIVE) {
    return { ok: false, error: "HYPERDRIVE binding is not present on this worker." };
  }
  if (!sqlText || typeof sqlText !== "string") {
    return { ok: false, error: "Missing sql string." };
  }
  if (isWriteStatement(sqlText) && !allow_write) {
    return { ok: false, error: "This looks like a write statement (not SELECT/WITH). Re-call with allow_write:true if that's intended." };
  }

  const cap = Math.min(Number(max_rows) > 0 ? Number(max_rows) : HARD_MAX_ROWS, HARD_MAX_ROWS);
  const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
  try {
    const rows = Array.isArray(params) && params.length
      ? await sql.unsafe(sqlText, params)
      : await sql.unsafe(sqlText);
    const list = Array.from(rows || []);
    const trimmed = list.slice(0, cap);
    return {
      ok: true,
      row_count_returned: trimmed.length,
      row_count_total_from_driver: list.length,
      truncated: list.length > trimmed.length,
      rows: trimmed
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    try { await sql.end({ timeout: 5 }); } catch (_) { /* best-effort close */ }
  }
}

async function toolRunJob(env, args) {
  const { job, extra, target } = args || {};
  if (!job || typeof job !== "string") {
    return { ok: false, error: "Missing job string." };
  }
  if (job === "market_source_probe_raw") {
    // Real diagnostic: direct, raw fetch against a market/odds provider using this worker's
    // already-bound real credentials (ODDS_API_KEY / PARLAY_API_KEY), bypassing all pipeline
    // parsing/staging logic entirely. Used to compare providers' real, live game-level and
    // player-prop-level coverage before deciding which one the Market phase should mine from.
    const provider = String((extra && extra.provider) || "parlay").toLowerCase();
    const path = String((extra && extra.path) || "").trim();
    if (!path) return { ok: false, error: "extra.path is required, e.g. '/sports/baseball_mlb/odds?regions=us&markets=h2h'" };
    let baseUrl, headers;
    if (provider === "parlay") {
      if (!env.PARLAY_API_KEY) return { ok: false, error: "PARLAY_API_KEY not present on this worker's environment." };
      baseUrl = String(env.PARLAY_API_BASE_URL || "https://parlay-api.com/v1").replace(/\/+$/, "");
      headers = { "X-API-Key": env.PARLAY_API_KEY, "accept": "application/json" };
    } else if (provider === "oddsapi") {
      if (!env.ODDS_API_KEY) return { ok: false, error: "ODDS_API_KEY not present on this worker's environment." };
      baseUrl = String(env.ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4").replace(/\/+$/, "");
      const sep = path.includes("?") ? "&" : "?";
      headers = { "accept": "application/json" };
      // OddsAPI uses an apiKey query param rather than a header.
      const fullUrl = `${baseUrl}${path}${sep}apiKey=${encodeURIComponent(env.ODDS_API_KEY)}`;
      try {
        const resp = await fetch(fullUrl, { method: "GET", headers });
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { ok: resp.ok, http_status: resp.status, provider, path, body_preview: json ? JSON.stringify(json).slice(0, 6000) : text.slice(0, 3000), array_length: Array.isArray(json) ? json.length : null };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    } else if (provider === "oddspapi") {
      const credRow = await env.CONFIG_DB.prepare("SELECT password FROM config_external_credentials WHERE credential_key='oddspapi_api_key'").first();
      const apiKey = credRow && credRow.password;
      if (!apiKey) return { ok: false, error: "oddspapi_api_key not present in CONFIG_DB.config_external_credentials." };
      baseUrl = "https://api.oddspapi.io/v4";
      const sep = path.includes("?") ? "&" : "?";
      const fullUrl = `${baseUrl}${path}${sep}apiKey=${encodeURIComponent(apiKey)}`;
      try {
        const resp = await fetch(fullUrl, { method: "GET", headers: { "accept": "application/json" } });
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        const headerDump = {};
        for (const [k, v] of resp.headers.entries()) headerDump[k] = v;
        return { ok: resp.ok, http_status: resp.status, provider, path, body_preview: json ? JSON.stringify(json).slice(0, 6000) : text.slice(0, 3000), array_length: Array.isArray(json) ? json.length : null, headers: headerDump };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    } else {
      return { ok: false, error: "extra.provider must be 'parlay', 'oddsapi', or 'oddspapi'" };
    }
    const fullUrl = `${baseUrl}${path}`;
    try {
      const resp = await fetch(fullUrl, { method: "GET", headers });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      const headerDump = {};
      for (const [k, v] of resp.headers.entries()) headerDump[k] = v;
      return { ok: resp.ok, http_status: resp.status, provider, path, body_preview: json ? JSON.stringify(json).slice(0, 6000) : text.slice(0, 3000), array_length: Array.isArray(json) ? json.length : null, headers: headerDump };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  if (job === "worker_invocation_logs") {
    // Real diagnostic: Cloudflare's GraphQL Analytics API (workersInvocationsAdaptive dataset)
    // records the actual outcome of every Worker invocation - including exceededCpu, canceled,
    // exception, scriptNotFound - which lets us confirm or rule out a platform-level kill during
    // the daily-context-full-run freezes, instead of inferring it from silence alone.
    const token = env.CLOUDFLARE_API_TOKEN;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !accountId) {
      return { ok: false, error: "CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not present on this worker's environment yet." };
    }
    const scriptName = (extra && extra.script_name) || "alphadog-v2-orchestrator";
    const minutesBack = Number((extra && extra.minutes_back) || 30);
    const limit = Number((extra && extra.limit) || 100);
    const now = new Date();
    const start = new Date(now.getTime() - minutesBack * 60000);
    const query = `
      query WorkerLogs($accountTag: string!, $scriptName: string!, $start: Time!, $end: Time!, $limit: Int!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            workersInvocationsAdaptive(
              limit: $limit,
              filter: { scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end }
              orderBy: [datetime_DESC]
            ) {
              dimensions {
                datetime
                scriptName
                status
              }
              sum {
                requests
                errors
              }
              quantiles {
                cpuTimeP50
                cpuTimeP99
              }
            }
          }
        }
      }`;
    const variables = { accountTag: accountId, scriptName, start: start.toISOString(), end: now.toISOString(), limit };
    try {
      const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables })
      });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      if (!resp.ok) return { ok: false, http_status: resp.status, body: text.slice(0, 2000) };
      const rows = json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || null;
      return { ok: true, script_name: scriptName, window_start: start.toISOString(), window_end: now.toISOString(), row_count: rows ? rows.length : 0, rows, raw_errors: json?.errors || null };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  if (job === "direct_worker_probe") {
    // TEMPORARY diagnostic - direct fetch to a worker's public workers.dev URL, bypassing
    // the orchestrator's queue/dedup entirely, to isolate whether a stall is inside the
    // worker itself or inside the orchestrator's dispatch/response-handling.
    const url2 = extra && extra.url;
    if (!url2) return { ok: false, error: "Missing extra.url" };
    const method = (extra && extra.method) || "GET";
    const body = extra && extra.body;
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("probe_timeout"), Number(extra.timeout_ms || 40000));
      const resp = await fetch(url2, { method, headers: { "content-type": "application/json" }, body, signal: controller.signal });
      clearTimeout(timer);
      const text = await resp.text();
      return { ok: resp.ok, http_status: resp.status, elapsed_ms: Date.now() - started, body: text.slice(0, 3000) };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started };
    }
  }
  const bindingMap = { CONTROL_ROOM: env.CONTROL_ROOM, PHASE3A_WORKER: env.PHASE3A_WORKER, ORCHESTRATOR_WORKER: env.ORCHESTRATOR_WORKER, BASE_HITTER_GAME_LOGS_WORKER: env.BASE_HITTER_GAME_LOGS_WORKER, BOARD_RUNNER_WORKER: env.BOARD_RUNNER_WORKER, DAILY_CONTEXT_RUNNER_WORKER: env.DAILY_CONTEXT_RUNNER_WORKER, MARKET_RUNNER_WORKER: env.MARKET_RUNNER_WORKER, SCORING_RUNNER_WORKER: env.SCORING_RUNNER_WORKER, MASTER_RUNNER_WORKER: env.MASTER_RUNNER_WORKER };
  const bindingName = target && bindingMap[target] !== undefined ? target : "CONTROL_ROOM";
  const binding = bindingMap[bindingName];
  if (!binding) {
    return { ok: false, error: `${bindingName} service binding is not configured on this worker.` };
  }

  let body, path;
  if (bindingName === "PHASE3A_WORKER") {
    body = { mode: job, ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal/run";
  } else if (bindingName === "ORCHESTRATOR_WORKER") {
    body = { max_jobs: 5, ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal/tick";
  } else if (bindingName === "BASE_HITTER_GAME_LOGS_WORKER") {
    // Direct call, bypasses control_job_queue + orchestrator entirely - no shared lock
    // contention with other real production jobs. For one-time base/mining workers only;
    // delta_update-style periodic jobs should keep going through the orchestrator.
    body = { mode: job, ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal/run";
  } else if (bindingName === "BOARD_RUNNER_WORKER") {
    // Direct, on-demand call to the new standalone board-full-run worker's /run endpoint.
    // No queue table, no lock table involved - triggers the exact same code path its own
    // cron trigger calls, just synchronously and on demand instead of waiting for a schedule.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.board-runner/run";
  } else if (bindingName === "DAILY_CONTEXT_RUNNER_WORKER") {
    // Same pattern as BOARD_RUNNER_WORKER, for the new standalone daily-context-full-run worker.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.daily-context-runner/run";
  } else if (bindingName === "MARKET_RUNNER_WORKER") {
    // Same pattern, for the new standalone market-full-run worker.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.market-runner/run";
  } else if (bindingName === "SCORING_RUNNER_WORKER") {
    // Same pattern, for the new standalone scoring-full-run worker.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.scoring-runner/run";
  } else if (bindingName === "MASTER_RUNNER_WORKER") {
    // Same pattern, for the new master runner chaining all four full-runs in sequence.
    body = { ...(extra && typeof extra === "object" ? extra : {}) };
    path = "https://internal.master-runner/run";
  } else {
    body = {
      job,
      slate_mode: "AUTO_BY_GAME_DATE_TIME",
      backend_only: true,
      source: "claude_mcp_bridge",
      ...(extra && typeof extra === "object" ? extra : {})
    };
    path = "https://internal/tasks/run";
  }

  try {
    const resp = await binding.fetch(path, {
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

async function toolGithubPatchFile(env, args) {
  const { path, old_str, new_str, message } = args || {};
  if (!path || old_str === undefined || new_str === undefined) {
    return { ok: false, error: "Missing path, old_str, or new_str." };
  }
  const current = await toolGithubGetFile(env, { path });
  if (!current.ok) return { ok: false, error: "Could not read current file.", details: current };

  const content = current.content || "";
  const occurrences = content.split(old_str).length - 1;
  if (occurrences === 0) {
    return { ok: false, error: "old_str not found in file. No changes made." };
  }
  if (occurrences > 1) {
    return { ok: false, error: `old_str matches ${occurrences} times, must be unique. No changes made.` };
  }

  const updatedContent = content.replace(old_str, new_str);
  return await toolGithubPutFile(env, {
    path,
    content: updatedContent,
    message: message || `Patch ${path} via Claude MCP bridge (server-side find/replace)`,
    sha: current.sha
  });
}

async function toolGithubGrepFile(env, args) {
  const { path, pattern, context_lines, max_matches } = args || {};
  if (!path || !pattern) return { ok: false, error: "Missing path or pattern." };
  const current = await toolGithubGetFile(env, { path });
  if (!current.ok) return { ok: false, error: "Could not read file.", details: current };
  if (!current.content) return { ok: false, error: "File has no content or is empty." };

  const lines = current.content.split("\n");
  const ctx = Math.max(0, Number(context_lines) || 3);
  const maxMatches = Math.max(1, Math.min(Number(max_matches) || 20, 50));

  let regex;
  try { regex = new RegExp(pattern); } catch (e) { return { ok: false, error: `Invalid regex pattern: ${e.message}` }; }

  const matches = [];
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    if (regex.test(lines[i])) {
      const start = Math.max(0, i - ctx);
      const end = Math.min(lines.length, i + ctx + 1);
      matches.push({
        matched_line_number: i + 1,
        snippet: lines.slice(start, end).map((l, idx) => `${start + idx + 1}: ${l}`).join("\n")
      });
    }
  }

  return {
    ok: true,
    path,
    file_size: current.size,
    total_lines: lines.length,
    pattern,
    match_count: matches.length,
    truncated_at_max_matches: matches.length >= maxMatches,
    matches
  };
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

// ---- GitHub file read/write, using the GITHUB_TOKEN secret already on this worker ----

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function b64DecodeUtf8(b64) {
  const binary = atob(String(b64 || "").replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeRepoPath(path) {
  return String(path || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

async function githubRequest(env, method, path, body) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return { ok: false, status: 0, data: { error: "GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured on this worker." } };
  }
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "Alphadog-MCP-Bridge",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await resp.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: resp.status, ok: resp.ok, data: parsed };
}

async function toolGithubGetFile(env, args) {
  const { path } = args || {};
  if (!path) return { ok: false, error: "Missing path." };
  const branch = env.GITHUB_BRANCH || "main";
  const r = await githubRequest(env, "GET", `/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data };
  if (Array.isArray(r.data)) return { ok: false, error: "That path is a directory, not a file. Use github_list_dir instead." };

  // Contents API caps out around 1MB and returns content:null for larger files.
  // Fall back to the Git Blobs API, which supports much larger files, using the sha we already have.
  if (!r.data.content && r.data.sha) {
    const blob = await githubRequest(env, "GET", `/git/blobs/${r.data.sha}`);
    if (!blob.ok) return { ok: false, status: blob.status, error: blob.data, note: "Contents API returned null content and Blobs API fallback also failed." };
    const content = blob.data.content ? b64DecodeUtf8(blob.data.content) : null;
    return { ok: true, path, sha: r.data.sha, size: r.data.size, content, fetched_via: "git_blobs_api_fallback" };
  }

  const content = r.data.content ? b64DecodeUtf8(r.data.content) : null;
  return { ok: true, path, sha: r.data.sha, size: r.data.size, content };
}

async function toolGithubPutFileViaGitDataApi(env, args) {
  const { path, content, message } = args;
  const branch = env.GITHUB_BRANCH || "main";

  const refResp = await githubRequest(env, "GET", `/git/refs/heads/${encodeURIComponent(branch)}`);
  if (!refResp.ok) return { ok: false, status: refResp.status, error: refResp.data, stage: "get_ref" };
  const commitSha = refResp.data.object.sha;

  const commitResp = await githubRequest(env, "GET", `/git/commits/${commitSha}`);
  if (!commitResp.ok) return { ok: false, status: commitResp.status, error: commitResp.data, stage: "get_commit" };
  const baseTreeSha = commitResp.data.tree.sha;

  const blobResp = await githubRequest(env, "POST", `/git/blobs`, { content: b64EncodeUtf8(content), encoding: "base64" });
  if (!blobResp.ok) return { ok: false, status: blobResp.status, error: blobResp.data, stage: "create_blob" };
  const blobSha = blobResp.data.sha;

  const treeResp = await githubRequest(env, "POST", `/git/trees`, {
    base_tree: baseTreeSha,
    tree: [{ path, mode: "100644", type: "blob", sha: blobSha }]
  });
  if (!treeResp.ok) return { ok: false, status: treeResp.status, error: treeResp.data, stage: "create_tree" };
  const newTreeSha = treeResp.data.sha;

  const newCommitResp = await githubRequest(env, "POST", `/git/commits`, {
    message: message || `Update ${path} via Claude MCP bridge (large file, Git Data API)`,
    tree: newTreeSha,
    parents: [commitSha]
  });
  if (!newCommitResp.ok) return { ok: false, status: newCommitResp.status, error: newCommitResp.data, stage: "create_commit" };
  const newCommitSha = newCommitResp.data.sha;

  const updateRefResp = await githubRequest(env, "PATCH", `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: newCommitSha });
  if (!updateRefResp.ok) return { ok: false, status: updateRefResp.status, error: updateRefResp.data, stage: "update_ref" };

  return {
    ok: true,
    status: 200,
    commit_sha: newCommitSha,
    file_sha: blobSha,
    note: "Pushed via Git Data API (large file path). Your existing GitHub Actions auto-deploy will now run.",
    fetched_via: "git_data_api"
  };
}

async function toolGithubPutFile(env, args) {
  const { path, content, message, sha } = args || {};
  if (!path || content === undefined) return { ok: false, error: "Missing path or content." };

  // Contents API has roughly the same ~1MB practical ceiling on both read and write.
  // Above that, use the Git Data API (blob -> tree -> commit -> ref) instead.
  if (content.length > 900000) {
    return await toolGithubPutFileViaGitDataApi(env, { path, content, message });
  }

  const branch = env.GITHUB_BRANCH || "main";

  let existingSha = sha;
  if (!existingSha) {
    const existing = await githubRequest(env, "GET", `/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`);
    if (existing.ok && existing.data && existing.data.sha) existingSha = existing.data.sha;
  }

  const body = {
    message: message || `Update ${path} via Claude MCP bridge`,
    content: b64EncodeUtf8(content),
    branch
  };
  if (existingSha) body.sha = existingSha;

  const r = await githubRequest(env, "PUT", `/contents/${encodeRepoPath(path)}`, body);
  return {
    ok: r.ok,
    status: r.status,
    commit_sha: r.data && r.data.commit ? r.data.commit.sha : null,
    file_sha: r.data && r.data.content ? r.data.content.sha : null,
    note: r.ok ? "Pushed to branch. Your existing GitHub Actions auto-deploy will now run." : null,
    response: r.ok ? undefined : r.data
  };
}

async function toolGithubListDir(env, args) {
  const path = (args && args.path) || "";
  const branch = env.GITHUB_BRANCH || "main";
  const r = await githubRequest(env, "GET", `/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data };
  const entries = Array.isArray(r.data)
    ? r.data.map((e) => ({ name: e.name, path: e.path, type: e.type, size: e.size }))
    : [{ name: r.data.name, path: r.data.path, type: r.data.type, size: r.data.size }];
  return { ok: true, path: path || "/", entries };
}

async function toolGithubListWorkflowRuns(env, args) {
  const perPage = (args && args.per_page) || 5;
  const r = await githubRequest(env, "GET", `/actions/runs?per_page=${encodeURIComponent(perPage)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data };
  const runs = (r.data.workflow_runs || []).map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    conclusion: w.conclusion,
    head_branch: w.head_branch,
    head_sha: w.head_sha,
    created_at: w.created_at,
    html_url: w.html_url
  }));
  return { ok: true, runs };
}

async function toolGithubGetWorkflowRunLog(env, args) {
  const runId = args && args.run_id;
  if (!runId) return { ok: false, error: "Missing run_id. Get one from github_list_workflow_runs." };

  const jobsResp = await githubRequest(env, "GET", `/actions/runs/${encodeURIComponent(runId)}/jobs`);
  if (!jobsResp.ok) return { ok: false, status: jobsResp.status, error: jobsResp.data };
  const jobs = jobsResp.data.jobs || [];
  if (!jobs.length) return { ok: false, error: "No jobs found for this run_id.", run_id: runId };

  const jobIndex = Number.isInteger(args && args.job_index) ? args.job_index : 0;
  const job = jobs[jobIndex] || jobs[0];

  // GitHub's /logs endpoint 302-redirects to a plain-text blob URL; fetch() follows
  // redirects by default, so githubRequest's existing fetch already lands on the raw text.
  const logResp = await githubRequest(env, "GET", `/actions/jobs/${encodeURIComponent(job.id)}/logs`);
  if (!logResp.ok) {
    return { ok: false, status: logResp.status, error: "Could not fetch log text (link may have expired, or run is too old).", job: { id: job.id, name: job.name, conclusion: job.conclusion } };
  }
  const logText = typeof logResp.data === "string" ? logResp.data : JSON.stringify(logResp.data);
  const allLines = logText.split("\n");

  let selectedLines = allLines;
  const pattern = args && args.grep;
  if (pattern) {
    try {
      const re = new RegExp(pattern, "i");
      const matched = [];
      allLines.forEach((line, i) => {
        if (re.test(line)) matched.push(...allLines.slice(Math.max(0, i - 3), i + 4), "---");
      });
      if (matched.length) selectedLines = matched;
    } catch (_) { /* invalid regex: fall through to tail behavior */ }
  }

  const tailLines = (args && args.tail_lines) || 200;
  const finalLines = selectedLines.slice(-tailLines);

  return {
    ok: true,
    run_id: runId,
    job: {
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      steps: (job.steps || []).map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion }))
    },
    total_log_lines: allLines.length,
    returned_lines: finalLines.length,
    grep_applied: pattern || null,
    log_text: finalLines.join("\n")
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
      "run_sql_postgres",
      "Read-only-by-default query against the new DigitalOcean Postgres database via Hyperdrive (the Postgres migration target). SELECT/WITH always allowed; anything else requires allow_write=true. Use this to check what tables/schemas/rows already exist on Postgres before porting or backfilling a worker, so existing work isn't redone.",
      {
        sql: z.string().describe("The SQL statement to run against Postgres. One statement at a time."),
        params: z.array(z.any()).optional().describe("Optional positional bind parameters ($1, $2, ...)."),
        max_rows: z.number().optional().describe(`Max rows to return (capped at ${HARD_MAX_ROWS}).`),
        allow_write: z.boolean().optional().describe("Must be true to run anything other than a SELECT/WITH statement.")
      },
      async (args) => {
        const result = await toolRunPostgres(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "run_job",
      "Enqueue a job on the AlphaDog orchestrator via the Control Room, the same way its dashboard buttons do. Set target='PHASE3A_WORKER' to call the phase3a-first-inning-pitcher-context worker directly instead (useful for testing modes not yet registered in Control Room's job registry). Set target='BASE_HITTER_GAME_LOGS_WORKER' to call alphadog-v2-base-hitter-game-logs directly, bypassing control_job_queue and the shared orchestrator lock entirely - use this for one-time base/mining work; keep delta_update-style periodic jobs on the orchestrator. Returns the immediate response, not the finished job result — use run_sql afterward to check status/output tables.",
      {
        job: z.string().describe("The job key (Control Room) or mode string (direct worker call)."),
        extra: z.record(z.any()).optional().describe("Optional extra fields merged into the request body."),
        target: z.enum(["CONTROL_ROOM", "PHASE3A_WORKER", "ORCHESTRATOR_WORKER", "BASE_HITTER_GAME_LOGS_WORKER", "BOARD_RUNNER_WORKER", "DAILY_CONTEXT_RUNNER_WORKER", "MARKET_RUNNER_WORKER", "SCORING_RUNNER_WORKER", "MASTER_RUNNER_WORKER"]).optional().describe("Which service to call. Defaults to CONTROL_ROOM.")
      },
      async (args) => {
        const result = await toolRunJob(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_get_file",
      "Read a file's current content from the repo (branch = GITHUB_BRANCH secret, default 'main').",
      {
        path: z.string().describe("File path within the repo, e.g. 'alphadog-v2-admin-sql.js'.")
      },
      async (args) => {
        const result = await toolGithubGetFile(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_put_file",
      "Create or update a file in the repo and commit it directly to the branch. This will trigger the existing GitHub Actions auto-deploy workflow, same as a manual commit would.",
      {
        path: z.string().describe("File path within the repo to write."),
        content: z.string().describe("Full new text content of the file."),
        message: z.string().optional().describe("Commit message. Defaults to a generic one if omitted."),
        sha: z.string().optional().describe("Blob sha of the file being replaced, if known. If omitted, it's looked up automatically.")
      },
      async (args) => {
        const result = await toolGithubPutFile(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_list_dir",
      "List files in a directory of the repo (or the repo root if path is omitted).",
      {
        path: z.string().optional().describe("Directory path within the repo. Omit for repo root.")
      },
      async (args) => {
        const result = await toolGithubListDir(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_list_workflow_runs",
      "Check the status of recent GitHub Actions workflow runs (deploys), most recent first.",
      {
        per_page: z.number().optional().describe("How many recent runs to return. Defaults to 5.")
      },
      async (args) => {
        const result = await toolGithubListWorkflowRuns(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_get_workflow_run_log",
      "Fetch the actual plain-text log for a failed (or any) GitHub Actions workflow run, using the run_id from github_list_workflow_runs. Use this instead of asking the user to paste deploy errors. Returns per-step status plus the tail of the log text (or, if 'grep' is given, only the matching lines with context) - use grep for something like 'ERROR|Uncaught|Error:' to jump straight to the failure instead of reading the whole log.",
      {
        run_id: z.number().describe("The workflow run ID, from github_list_workflow_runs."),
        job_index: z.number().optional().describe("Which job within the run to fetch, 0-indexed. Defaults to 0 (most workflows here have a single job)."),
        tail_lines: z.number().optional().describe("How many lines from the end (or from the grep matches) to return. Defaults to 200."),
        grep: z.string().optional().describe("Optional case-insensitive regex. If given, only lines matching it (plus 3 lines of surrounding context) are returned, instead of the plain tail.")
      },
      async (args) => {
        const result = await toolGithubGetWorkflowRunLog(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_patch_file",
      "Find-and-replace inside a repo file entirely server-side (the old and new content never pass through the calling context). Use this instead of github_get_file + github_put_file for files too large to round-trip through a chat context. old_str must match exactly once in the current file.",
      {
        path: z.string().describe("File path within the repo to patch."),
        old_str: z.string().describe("Exact string to find. Must be unique in the file."),
        new_str: z.string().describe("String to replace it with."),
        message: z.string().optional().describe("Commit message.")
      },
      async (args) => {
        const result = await toolGithubPatchFile(this.env, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result.ok === false
        };
      }
    );

    this.server.tool(
      "github_grep_file",
      "Search inside a repo file server-side, returning only matching lines plus surrounding context — never the whole file. Use this for files too large to ever safely return in full (multi-hundred-KB+ files). pattern is a JS regex string.",
      {
        path: z.string().describe("File path within the repo to search."),
        pattern: z.string().describe("Regex pattern to search for (JS regex syntax, no slashes)."),
        context_lines: z.number().optional().describe("Lines of context before/after each match. Default 3."),
        max_matches: z.number().optional().describe("Max matches to return. Default 20, capped at 50.")
      },
      async (args) => {
        const result = await toolGithubGrepFile(this.env, args);
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
