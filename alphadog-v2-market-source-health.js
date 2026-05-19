const WORKER_NAME = "alphadog-v2-market-source-health";
const VERSION = "alphadog-v2-market-source-health-v0.1";
const JOB_KEY = "market-source-health";
const SOURCE_KEY = "prizepicks_github";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "MARKET_DB"];
const REQUIRED_SECRETS = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH"];
const EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS = [
  "source_key",
  "status",
  "last_success_at",
  "last_error_at",
  "last_error",
  "rows_last_fetch",
  "health_json",
  "updated_at"
];

function nowUtc() {
  return new Date().toISOString();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });
}

function safeString(value, max = 900) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

function safeJson(value, max = 7000) {
  const text = JSON.stringify(value || {}, null, 2);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
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

function baseIdentity(env, extra = {}) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const secrets = varPresence(env, REQUIRED_SECRETS);

  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    source_key: SOURCE_KEY,
    status: "READY",
    timestamp_utc: nowUtc(),
    phase: "market_source_health_v0_1",
    notes: [
      "Bounded source-health worker only.",
      "Fetches configured PrizePicks GitHub JSON only.",
      "Writes only MARKET_DB.market_source_health.",
      "No normalization, no scoring, no final board writes."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      required_config_values_present: allTrue(secrets)
    },
    ...extra
  };
}

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

async function validateMarketSourceHealthSchema(env) {
  if (!env.MARKET_DB) {
    return { ok: false, reason: "missing_MARKET_DB_binding", columns: [] };
  }

  const cols = await all(env.MARKET_DB, "PRAGMA table_info(market_source_health)");
  const names = cols.map(c => String(c.name || ""));
  const missing = EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS.filter(c => !names.includes(c));

  return {
    ok: missing.length === 0,
    table: "market_source_health",
    columns_present: names,
    required_columns: EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS,
    missing_columns: missing
  };
}

function rawGithubUrl(env) {
  const owner = String(env.GITHUB_OWNER || "Rodantmat").trim();
  const repo = String(env.GITHUB_REPO || "Alphadog").trim();
  const branch = String(env.GITHUB_BRANCH || "main").trim();
  const path = String(env.GITHUB_PRIZEPICKS_PATH || "prizepicks_mlb_current.json").replace(/^\/+/, "").trim();
  return {
    owner,
    repo,
    branch,
    path,
    url: `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`
  };
}

function detectArray(json) {
  if (Array.isArray(json)) return { key: "root_array", rows: json };
  if (!json || typeof json !== "object") return { key: "non_object", rows: [] };

  const candidates = [
    "data",
    "projections",
    "lines",
    "items",
    "rows",
    "entries"
  ];

  for (const key of candidates) {
    if (Array.isArray(json[key])) return { key, rows: json[key] };
  }

  if (json.data && typeof json.data === "object") {
    for (const key of candidates) {
      if (Array.isArray(json.data[key])) return { key: `data.${key}`, rows: json.data[key] };
    }
  }

  return { key: "no_known_array", rows: [] };
}

function findFreshness(json) {
  if (!json || typeof json !== "object") return null;
  const locations = [json, json.meta, json.metadata, json.status, json.source, json.payload].filter(Boolean);
  const keys = ["fetched_at", "updated_at", "generated_at", "created_at", "scraped_at", "timestamp", "last_update", "last_updated"];

  for (const obj of locations) {
    if (!obj || typeof obj !== "object") continue;
    for (const key of keys) {
      if (obj[key]) return { field: key, value: String(obj[key]).slice(0, 120) };
    }
  }

  return null;
}

function summarizeJsonShape(json) {
  const type = Array.isArray(json) ? "array" : typeof json;
  const topKeys = json && typeof json === "object" && !Array.isArray(json) ? Object.keys(json).slice(0, 30) : [];
  const detected = detectArray(json);
  const rows = detected.rows || [];
  const sample = rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]).slice(0, 30) : [];

  return {
    top_level_type: type,
    top_level_keys: topKeys,
    detected_rows_key: detected.key,
    detected_row_count: rows.length,
    first_row_keys: sample,
    freshness_signal: findFreshness(json)
  };
}

async function writeHealth(env, status, rowsLastFetch, health, errorText = null) {
  const now = nowUtc();
  const healthJson = safeJson(health);

  if (status === "healthy") {
    await run(env.MARKET_DB,
      "INSERT INTO market_source_health (source_key, status, last_success_at, last_error_at, last_error, rows_last_fetch, health_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, NULL, NULL, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(source_key) DO UPDATE SET status=excluded.status, last_success_at=CURRENT_TIMESTAMP, last_error_at=NULL, last_error=NULL, rows_last_fetch=excluded.rows_last_fetch, health_json=excluded.health_json, updated_at=CURRENT_TIMESTAMP",
      SOURCE_KEY, status, rowsLastFetch, healthJson
    );
  } else {
    await run(env.MARKET_DB,
      "INSERT INTO market_source_health (source_key, status, last_success_at, last_error_at, last_error, rows_last_fetch, health_json, updated_at) VALUES (?, ?, NULL, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(source_key) DO UPDATE SET status=excluded.status, last_error_at=CURRENT_TIMESTAMP, last_error=excluded.last_error, rows_last_fetch=excluded.rows_last_fetch, health_json=excluded.health_json, updated_at=CURRENT_TIMESTAMP",
      SOURCE_KEY, status, safeString(errorText || status, 900), rowsLastFetch, healthJson
    );
  }

  return { wrote_table: "market_source_health", source_key: SOURCE_KEY, write_timestamp_utc: now };
}

async function runSourceHealth(env, input = {}) {
  const started = Date.now();
  const schema = await validateMarketSourceHealthSchema(env);
  if (!schema.ok) {
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      source_key: SOURCE_KEY,
      status: "blocked_schema_mismatch",
      certification: "SCHEMA_NOT_SAFE_TO_WRITE",
      schema,
      rows_read: 0,
      rows_written: 0,
      external_calls_performed: 0,
      error: "MARKET_DB.market_source_health is missing required columns. Stop and apply schema adjustment first.",
      timestamp_utc: nowUtc()
    };
  }

  const source = rawGithubUrl(env);
  const requestId = input.request_id || null;
  const chainId = input.chain_id || null;
  const fetchStarted = nowUtc();
  let response;
  let text = "";

  try {
    const headers = {
      "user-agent": "AlphaDog-v2 Market Source Health Worker",
      "accept": "application/json,text/plain,*/*"
    };
    if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;

    response = await fetch(source.url, { method: "GET", headers });
    text = await response.text();
  } catch (err) {
    const error = safeString(err && err.message ? err.message : err);
    const health = {
      version: VERSION,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path },
      fetch_started_at: fetchStarted,
      checked_at: nowUtc(),
      reachable: false,
      http_status: null,
      json_parse_ok: false,
      error
    };
    const write = await writeHealth(env, "error", 0, health, error);
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      status: "error",
      certification: "SOURCE_UNREACHABLE",
      rows_read: 0,
      rows_written: 1,
      external_calls_performed: 1,
      elapsed_ms: Date.now() - started,
      health,
      write,
      timestamp_utc: nowUtc()
    };
  }

  const httpStatus = response ? response.status : null;
  const contentType = response ? response.headers.get("content-type") : null;
  const sizeBytes = new TextEncoder().encode(text || "").length;

  if (!response || !response.ok) {
    const error = `GitHub raw fetch failed with HTTP ${httpStatus}`;
    const health = {
      version: VERSION,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path },
      fetch_started_at: fetchStarted,
      checked_at: nowUtc(),
      reachable: false,
      http_status: httpStatus,
      content_type: contentType,
      response_size_bytes: sizeBytes,
      json_parse_ok: false,
      error,
      response_preview: safeString(text, 500)
    };
    const write = await writeHealth(env, "error", 0, health, error);
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      status: "error",
      certification: "SOURCE_HTTP_ERROR",
      rows_read: 0,
      rows_written: 1,
      external_calls_performed: 1,
      elapsed_ms: Date.now() - started,
      health,
      write,
      timestamp_utc: nowUtc()
    };
  }

  let parsed;
  let parseError = null;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    parseError = safeString(err && err.message ? err.message : err);
  }

  if (parseError) {
    const health = {
      version: VERSION,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path },
      fetch_started_at: fetchStarted,
      checked_at: nowUtc(),
      reachable: true,
      http_status: httpStatus,
      content_type: contentType,
      response_size_bytes: sizeBytes,
      json_parse_ok: false,
      error: parseError,
      response_preview: safeString(text, 500)
    };
    const write = await writeHealth(env, "error", 0, health, parseError);
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      status: "error",
      certification: "JSON_PARSE_FAILED",
      rows_read: 0,
      rows_written: 1,
      external_calls_performed: 1,
      elapsed_ms: Date.now() - started,
      health,
      write,
      timestamp_utc: nowUtc()
    };
  }

  const shape = summarizeJsonShape(parsed);
  const healthy = shape.detected_row_count > 0;
  const status = healthy ? "healthy" : "warning";
  const certification = healthy ? "SOURCE_REACHABLE_JSON_ROWS_PRESENT" : "SOURCE_REACHABLE_JSON_NO_ROWS_DETECTED";
  const health = {
    version: VERSION,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path },
    fetch_started_at: fetchStarted,
    checked_at: nowUtc(),
    reachable: true,
    http_status: httpStatus,
    content_type: contentType,
    response_size_bytes: sizeBytes,
    json_parse_ok: true,
    shape,
    no_normalization: true,
    no_scoring: true,
    no_market_line_writes: true
  };

  const write = await writeHealth(env, status, shape.detected_row_count, health, healthy ? null : "JSON parsed but no known rows array detected");

  return {
    ok: true,
    data_ok: healthy,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    status,
    certification,
    rows_read: shape.detected_row_count,
    rows_written: 1,
    external_calls_performed: 1,
    elapsed_ms: Date.now() - started,
    health,
    write,
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return jsonResponse({ ok: true });

    if (method === "GET" && path === "/") {
      return jsonResponse(baseIdentity(env));
    }

    if (method === "GET" && path === "/health") {
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const secrets = varPresence(env, REQUIRED_SECRETS);
      let schema = null;
      try {
        schema = await validateMarketSourceHealthSchema(env);
      } catch (err) {
        schema = { ok: false, error: safeString(err && err.message ? err.message : err) };
      }

      return jsonResponse({
        ...baseIdentity(env),
        route: "/health",
        checks: {
          db_bindings: db,
          config_values_present: secrets,
          market_source_health_schema: schema
        },
        safe_secret_note: "Secret/config values are presence-checked only. Values are intentionally never printed."
      });
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const secrets = varPresence(env, REQUIRED_SECRETS);
      const schema = await validateMarketSourceHealthSchema(env);

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
          config_values_present: secrets,
          market_source_health_schema: schema,
          github_source_config: rawGithubUrl(env)
        },
        writes_performed: 0,
        external_calls_performed: 0
      });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await runSourceHealth(env, input);
      return jsonResponse(output, output.ok ? 200 : 200);
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
