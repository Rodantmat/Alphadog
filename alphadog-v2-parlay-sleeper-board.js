const WORKER_NAME = "alphadog-v2-parlay-sleeper-board";
const VERSION = "alphadog-v2-parlay-sleeper-board-v0.1.0-source-probe-readiness";
const JOB_KEY = "parlay-sleeper-board";
const SOURCE_KEY = "parlay_sleeper";
const MAX_PREVIEW_CHARS = 900;
const MAX_TEXT_CHARS = 120000;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "MARKET_DB"];
const REQUIRED_SECRET_KEYS = ["PARLAY_API_KEY"];
const CONFIG_KEYS = [
  "PARLAY_API_BASE_URL",
  "PARLAY_SLEEPER_PROBE_ENDPOINT",
  "PARLAY_API_SLEEPER_ENDPOINT",
  "PARLAY_API_AUTH_HEADER_NAME",
  "PARLAY_API_AUTH_HEADER_PREFIX"
];

const EXPECTED_SLEEPER_STAGE_COLUMNS = ["stage_id", "batch_id", "source_key", "slate_date", "fetched_at", "staged_at", "source_event_id", "source_line_id", "source_player_id", "player_name", "team", "opponent", "league", "sport", "source_stat_name", "canonical_prop_key", "line_value", "side", "price", "decimal_price", "is_pickable", "start_time", "raw_line_json", "parse_status", "parse_error", "certification_status", "created_at"];
const EXPECTED_SLEEPER_BATCH_COLUMNS = ["batch_id", "source_key", "slate_date", "fetched_at", "staged_at", "certified_at", "source_base_url", "source_endpoint", "source_http_status", "source_size_bytes", "top_level_shape", "total_rows", "staged_rows", "valid_rows", "invalid_rows", "unmapped_stat_types", "certification_status", "certification_reason", "certification_json", "promoted_at", "cleaned_at", "created_at", "updated_at"];
const EXPECTED_SLEEPER_CURRENT_COLUMNS = ["current_row_id", "batch_id", "source_key", "slate_date", "source_event_id", "source_line_id", "source_player_id", "player_name", "team", "opponent", "league", "sport", "source_stat_name", "canonical_prop_key", "line_value", "side", "price", "decimal_price", "is_pickable", "start_time", "raw_line_json", "row_payload_json", "promoted_at", "updated_at"];
const EXPECTED_SLEEPER_ACTIVE_COLUMNS = ["source_key", "slate_date", "active_batch_id", "certification_status", "row_count", "valid_rows", "activated_at", "updated_at"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

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

function safeString(value, max = MAX_PREVIEW_CHARS) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

function present(env, key) {
  return !!(env && env[key] !== undefined && env[key] !== null && String(env[key]).trim().length > 0);
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function valuePresence(env, names) {
  const out = {};
  for (const name of names) out[name] = present(env, name);
  return out;
}

function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

async function ensureSleeperSchema(env) {
  if (!env.MARKET_DB) return { ok: false, reason: "missing_MARKET_DB_binding", ddl_applied: false };

  await env.MARKET_DB.batch([
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS sleeper_board_stage (
      stage_id TEXT PRIMARY KEY,
      batch_id TEXT,
      source_key TEXT,
      slate_date TEXT,
      fetched_at TEXT,
      staged_at TEXT DEFAULT CURRENT_TIMESTAMP,
      source_event_id TEXT,
      source_line_id TEXT,
      source_player_id TEXT,
      player_name TEXT,
      team TEXT,
      opponent TEXT,
      league TEXT,
      sport TEXT,
      source_stat_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      side TEXT,
      price REAL,
      decimal_price REAL,
      is_pickable INTEGER DEFAULT 0,
      start_time TEXT,
      raw_line_json TEXT,
      parse_status TEXT,
      parse_error TEXT,
      certification_status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS sleeper_board_batches (
      batch_id TEXT PRIMARY KEY,
      source_key TEXT,
      slate_date TEXT,
      fetched_at TEXT,
      staged_at TEXT,
      certified_at TEXT,
      source_base_url TEXT,
      source_endpoint TEXT,
      source_http_status INTEGER,
      source_size_bytes INTEGER,
      top_level_shape TEXT,
      total_rows INTEGER DEFAULT 0,
      staged_rows INTEGER DEFAULT 0,
      valid_rows INTEGER DEFAULT 0,
      invalid_rows INTEGER DEFAULT 0,
      unmapped_stat_types INTEGER DEFAULT 0,
      certification_status TEXT,
      certification_reason TEXT,
      certification_json TEXT,
      promoted_at TEXT,
      cleaned_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS sleeper_board_current (
      current_row_id TEXT PRIMARY KEY,
      batch_id TEXT,
      source_key TEXT,
      slate_date TEXT,
      source_event_id TEXT,
      source_line_id TEXT,
      source_player_id TEXT,
      player_name TEXT,
      team TEXT,
      opponent TEXT,
      league TEXT,
      sport TEXT,
      source_stat_name TEXT,
      canonical_prop_key TEXT,
      line_value REAL,
      side TEXT,
      price REAL,
      decimal_price REAL,
      is_pickable INTEGER DEFAULT 0,
      start_time TEXT,
      raw_line_json TEXT,
      row_payload_json TEXT,
      promoted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS sleeper_board_active_batches (
      source_key TEXT,
      slate_date TEXT,
      active_batch_id TEXT,
      certification_status TEXT,
      row_count INTEGER DEFAULT 0,
      valid_rows INTEGER DEFAULT 0,
      activated_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_key, slate_date)
    )`),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_sleeper_board_stage_batch ON sleeper_board_stage(batch_id)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_sleeper_board_stage_source_slate ON sleeper_board_stage(source_key, slate_date)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_sleeper_board_stage_stat ON sleeper_board_stage(source_stat_name, canonical_prop_key)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_sleeper_board_batches_source_slate ON sleeper_board_batches(source_key, slate_date)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_sleeper_board_batches_cert ON sleeper_board_batches(certification_status)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_sleeper_board_current_source_slate_batch ON sleeper_board_current(source_key, slate_date, batch_id)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_sleeper_board_current_player_prop ON sleeper_board_current(player_name, canonical_prop_key)"),
    env.MARKET_DB.prepare("INSERT OR REPLACE INTO market_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('schema_market_db_sleeper_board_v0_1_0', ?, CURRENT_TIMESTAMP, 'Additive Sleeper board lifecycle tables only. No PrizePicks table changes.')").bind(VERSION)
  ]);

  const validation = await validateSleeperSchema(env);
  return { ok: validation.ok, ddl_applied: true, validation };
}

async function tableColumns(env, tableName) {
  const rows = await all(env.MARKET_DB, `PRAGMA table_info(${tableName})`);
  return rows.map(r => String(r.name || ""));
}

async function validateTable(env, tableName, expected) {
  if (!env.MARKET_DB) return { ok: false, table: tableName, missing_columns: expected, columns_present: [] };
  const columns = await tableColumns(env, tableName);
  const missing = expected.filter(c => !columns.includes(c));
  return { ok: missing.length === 0, table: tableName, columns_present: columns, required_columns: expected, missing_columns: missing };
}

async function validateSleeperSchema(env) {
  const stage = await validateTable(env, "sleeper_board_stage", EXPECTED_SLEEPER_STAGE_COLUMNS);
  const batches = await validateTable(env, "sleeper_board_batches", EXPECTED_SLEEPER_BATCH_COLUMNS);
  const current = await validateTable(env, "sleeper_board_current", EXPECTED_SLEEPER_CURRENT_COLUMNS);
  const active = await validateTable(env, "sleeper_board_active_batches", EXPECTED_SLEEPER_ACTIVE_COLUMNS);
  return { ok: stage.ok && batches.ok && current.ok && active.ok, sleeper_board_stage: stage, sleeper_board_batches: batches, sleeper_board_current: current, sleeper_board_active_batches: active };
}

function configuredEndpoint(env, input = {}) {
  const rawEndpoint = String(
    input.source_endpoint ||
    input.probe_endpoint ||
    env.PARLAY_SLEEPER_PROBE_ENDPOINT ||
    env.PARLAY_API_SLEEPER_ENDPOINT ||
    ""
  ).trim();
  const baseUrl = String(env.PARLAY_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, reason: "PARLAY_API_BASE_URL_missing", base_url_present: false, endpoint_present: !!rawEndpoint };
  if (!rawEndpoint) return { ok: false, reason: "PARLAY_SLEEPER_PROBE_ENDPOINT_missing", base_url_present: true, endpoint_present: false, base_url_host: safeHost(baseUrl) };
  if (/^https?:\/\//i.test(rawEndpoint)) return { ok: true, url: rawEndpoint, base_url_present: true, endpoint_present: true, endpoint_mode: "absolute", base_url_host: safeHost(baseUrl), endpoint_preview: safeEndpoint(rawEndpoint) };
  const cleanEndpoint = rawEndpoint.startsWith("/") ? rawEndpoint : `/${rawEndpoint}`;
  return { ok: true, url: `${baseUrl}${cleanEndpoint}`, base_url_present: true, endpoint_present: true, endpoint_mode: "base_plus_endpoint", base_url_host: safeHost(baseUrl), endpoint_preview: cleanEndpoint };
}

function safeHost(urlText) {
  try { return new URL(urlText).host; } catch (_) { return "invalid_url"; }
}

function safeEndpoint(urlOrPath) {
  const text = String(urlOrPath || "");
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      return `${u.origin}${u.pathname}`;
    } catch (_) {
      return "invalid_url";
    }
  }
  return text.split("?")[0];
}

function authConfig(env) {
  const headerName = String(env.PARLAY_API_AUTH_HEADER_NAME || "").trim();
  const headerPrefix = String(env.PARLAY_API_AUTH_HEADER_PREFIX || "").trim();
  const keyPresent = present(env, "PARLAY_API_KEY");
  return {
    ok: keyPresent && !!headerName,
    key_present: keyPresent,
    header_name_present: !!headerName,
    header_prefix_present: !!headerPrefix,
    header_name: headerName || null,
    block_reason: !keyPresent ? "PARLAY_API_KEY_missing" : (!headerName ? "PARLAY_API_AUTH_HEADER_NAME_missing" : null),
    apply(headers, envRef) {
      if (!keyPresent || !headerName) return headers;
      headers.set(headerName, headerPrefix ? `${headerPrefix} ${envRef.PARLAY_API_KEY}` : String(envRef.PARLAY_API_KEY));
      return headers;
    }
  };
}

function detectShape(json) {
  const topType = Array.isArray(json) ? "array" : typeof json;
  const topKeys = json && !Array.isArray(json) && typeof json === "object" ? Object.keys(json).slice(0, 40) : [];
  const candidates = [];
  if (Array.isArray(json)) candidates.push({ path: "$", rows: json });
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const key of ["data", "items", "props", "projections", "markets", "lines", "events"]) {
      if (Array.isArray(json[key])) candidates.push({ path: key, rows: json[key] });
    }
    if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
      for (const key of ["items", "props", "projections", "markets", "lines", "events"]) {
        if (Array.isArray(json.data[key])) candidates.push({ path: `data.${key}`, rows: json.data[key] });
      }
    }
  }
  const best = candidates.sort((a, b) => b.rows.length - a.rows.length)[0] || null;
  const sampleRows = best ? best.rows.slice(0, 5).map(r => sanitizeSampleRow(r)) : [];
  return {
    top_level_type: topType,
    top_level_keys: topKeys,
    detected_rows_path: best ? best.path : null,
    detected_row_count: best ? best.rows.length : 0,
    sample_rows: sampleRows,
    source_stat_names: extractStatNames(best ? best.rows : [])
  };
}

function sanitizeSampleRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = {};
  for (const [key, value] of Object.entries(row).slice(0, 40)) {
    if (/key|token|secret|auth|password/i.test(key)) out[key] = "REDACTED_FIELD";
    else if (value && typeof value === "object") out[key] = Array.isArray(value) ? `array(${value.length})` : `object(${Object.keys(value).length})`;
    else out[key] = value;
  }
  return out;
}

function extractStatNames(rows) {
  const keys = ["stat_type", "statType", "stat", "market", "market_name", "marketName", "type", "prop", "prop_type", "propType", "name", "category"];
  const found = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim()) found.add(String(value).trim());
    }
    if (row.attributes && typeof row.attributes === "object") {
      for (const key of keys) {
        const value = row.attributes[key];
        if (value !== undefined && value !== null && String(value).trim()) found.add(String(value).trim());
      }
    }
  }
  return Array.from(found).sort().slice(0, 80);
}

async function safeProbe(env, input = {}) {
  const schema = await ensureSleeperSchema(env);
  const endpoint = configuredEndpoint(env, input);
  const auth = authConfig(env);
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const secrets = valuePresence(env, REQUIRED_SECRET_KEYS);
  const cfg = valuePresence(env, CONFIG_KEYS);

  const readiness = {
    db_bindings_present: db,
    required_db_bindings_present: allTrue(db),
    secrets_present_only: secrets,
    config_present: cfg,
    schema
  };

  if (!schema.ok) {
    return blockedProbe("SCHEMA_NOT_READY", "sleeper_schema_missing_or_invalid", readiness, endpoint, auth);
  }
  if (!endpoint.ok) {
    return blockedProbe("SOURCE_ENDPOINT_UNCONFIGURED", endpoint.reason, readiness, endpoint, auth);
  }
  if (!auth.ok) {
    return blockedProbe("SOURCE_AUTH_CONFIG_UNVERIFIED", auth.block_reason, readiness, endpoint, auth);
  }

  const headers = new Headers({ "accept": "application/json", "user-agent": "AlphaDog-v2-Parlay-Sleeper-Probe/0.1.0" });
  auth.apply(headers, env);

  const started = Date.now();
  let response;
  let text = "";
  try {
    response = await fetch(endpoint.url, { method: "GET", headers });
    text = await response.text();
  } catch (err) {
    return {
      ok: true,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      source_key: SOURCE_KEY,
      status: "blocked_source_probe_fetch_exception",
      certification: "PARLAY_SLEEPER_SOURCE_PROBE_FETCH_EXCEPTION",
      block_downstream_reason: safeString(err && err.message ? err.message : err, 500),
      readiness,
      source_config: safeSourceConfig(endpoint, auth),
      rows_read: 0,
      rows_written: 0,
      promoted_rows_written: 0,
      external_calls_performed: 1,
      elapsed_ms: Date.now() - started,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_prizepicks_mutation: true,
      no_promotion: true
    };
  }

  let parsed = null;
  let parseError = null;
  const boundedText = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
  try { parsed = JSON.parse(boundedText); } catch (err) { parseError = safeString(err && err.message ? err.message : err, 500); }
  const shape = parsed ? detectShape(parsed) : null;
  const rowsRead = shape ? Number(shape.detected_row_count || 0) : 0;

  return {
    ok: true,
    data_ok: response.ok && !!parsed && !!shape,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    source_key: SOURCE_KEY,
    status: response.ok && parsed ? "source_probe_completed_shape_captured" : "source_probe_completed_shape_unverified",
    certification: response.ok && parsed ? "PARLAY_SLEEPER_SOURCE_PROBE_SHAPE_CAPTURED_NO_PROMOTION" : "PARLAY_SLEEPER_SOURCE_PROBE_SHAPE_UNVERIFIED_NO_PROMOTION",
    block_downstream_reason: response.ok && parsed ? "promotion_blocked_until_source_stat_aliases_are_reviewed_and_approved" : "source_response_not_verified_json_shape",
    readiness,
    source_config: safeSourceConfig(endpoint, auth),
    source_response: {
      http_status: response.status,
      ok: response.ok,
      content_type: response.headers.get("content-type") || null,
      size_bytes: text.length,
      text_truncated_for_parse: text.length > MAX_TEXT_CHARS,
      parse_error: parseError,
      preview: safeString(text, MAX_PREVIEW_CHARS)
    },
    shape_summary: shape,
    source_stat_names: shape ? shape.source_stat_names : [],
    rows_read: rowsRead,
    rows_written: 0,
    promoted_rows_written: 0,
    external_calls_performed: 1,
    elapsed_ms: Date.now() - started,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_prizepicks_mutation: true,
    no_promotion: true,
    next_required_approval: "Review real source_stat_names, add source-proven REF_DB.ref_prop_aliases rows, then approve parse/stage/certify build."
  };
}

function safeSourceConfig(endpoint, auth) {
  return {
    source_key: SOURCE_KEY,
    base_url_present: !!endpoint.base_url_present,
    base_url_host: endpoint.base_url_host || null,
    endpoint_present: !!endpoint.endpoint_present,
    endpoint_preview: endpoint.endpoint_preview || null,
    endpoint_mode: endpoint.endpoint_mode || null,
    secret_value_printed: false,
    api_key_present: !!auth.key_present,
    auth_header_name_present: !!auth.header_name_present,
    auth_header_name: auth.header_name || null,
    auth_header_prefix_present: !!auth.header_prefix_present
  };
}

function blockedProbe(certSuffix, reason, readiness, endpoint, auth) {
  return {
    ok: true,
    data_ok: false,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    source_key: SOURCE_KEY,
    status: "blocked_source_probe_readiness",
    certification: `PARLAY_SLEEPER_${certSuffix}`,
    block_downstream_reason: reason,
    readiness,
    source_config: safeSourceConfig(endpoint, auth),
    rows_read: 0,
    rows_written: 0,
    promoted_rows_written: 0,
    external_calls_performed: 0,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_prizepicks_mutation: true,
    no_promotion: true,
    next_required_proof: "Configure an explicit Sleeper/Parlay probe endpoint and explicit auth header config, then rerun source probe."
  };
}

function baseIdentity(env, extra = {}) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const secrets = valuePresence(env, REQUIRED_SECRET_KEYS);
  const cfg = valuePresence(env, CONFIG_KEYS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    source_key: SOURCE_KEY,
    status: "SOURCE_PROBE_READY",
    timestamp_utc: nowUtc(),
    phase: "parlay_sleeper_board_probe_readiness_v0_1_0",
    notes: [
      "Probe-readiness worker only.",
      "Creates/validates additive Sleeper lifecycle schema when /run executes.",
      "Performs a safe source-shape probe only when explicit endpoint and auth header config are present.",
      "Does not parse into current, certify aliases, promote rows, score, rank, write final board, or mutate PrizePicks."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      parlay_api_key_present: !!secrets.PARLAY_API_KEY,
      config_present: cfg,
      secret_values_printed: false
    },
    ...extra
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return jsonResponse({ ok: true, version: VERSION });

    if (method === "GET" && path === "/") {
      return jsonResponse(baseIdentity(env));
    }

    if (method === "GET" && path === "/health") {
      return jsonResponse(baseIdentity(env, {
        route: "/health",
        safe_secret_note: "Secret values are intentionally never printed."
      }));
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      const schema = env.MARKET_DB ? await validateSleeperSchema(env) : { ok: false, reason: "missing_MARKET_DB_binding" };
      return jsonResponse(baseIdentity(env, {
        route: "/diagnostic",
        input_echo_safe: {
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          job_key: input.job_key || null,
          mode: input.mode || null
        },
        schema_validation: schema,
        writes_performed: 0,
        external_calls_performed: 0
      }));
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await safeProbe(env, {
        ...(input || {}),
        ...((input && input.input_json && typeof input.input_json === "object") ? input.input_json : {})
      });
      return jsonResponse({
        ...output,
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        trigger: input.trigger || null,
        timestamp_utc: nowUtc()
      });
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
