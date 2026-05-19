const WORKER_NAME = "alphadog-v2-prizepicks-github-board";
const VERSION = "alphadog-v2-prizepicks-github-board-v0.1.1-d1-safe-source-shape-staging";
const JOB_KEY = "prizepicks-github-board";
const SOURCE_KEY = "prizepicks_github";
const RAW_SNAPSHOT_STATUS_OK = "source_shape_staged";
const MAX_RAW_JSON_CHARS = 180000;
const MAX_HEALTH_JSON_CHARS = 7000;
const MAX_OUTPUT_PREVIEW_CHARS = 900;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "MARKET_DB"];
const REQUIRED_CONFIG_VALUES = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH"];
const EXPECTED_MARKET_RAW_SNAPSHOTS_COLUMNS = ["snapshot_id", "source_key", "slate_date", "fetched_at", "raw_json", "row_count", "status", "error"];
const EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS = ["source_key", "status", "last_success_at", "last_error_at", "last_error", "rows_last_fetch", "health_json", "updated_at"];

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

function safeString(value, max = MAX_OUTPUT_PREVIEW_CHARS) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

function safeJson(value, max = MAX_HEALTH_JSON_CHARS) {
  const text = JSON.stringify(value || {}, null, 2);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}

function safeMiniJson(value, maxChars = 9000) {
  const text = JSON.stringify(value || {}, null, 0);
  return text.length > maxChars ? JSON.parse(text.slice(0, maxChars).replace(/[,\[{][^,\[{]*$/, "null")) : value;
}

function boundedRawJson(value) {
  const fullText = JSON.stringify(value || {}, null, 0);
  const detected = detectArray(value);
  const rows = detected.rows || [];
  const firstRows = rows.slice(0, 5).map((row) => {
    const text = JSON.stringify(row || {}, null, 0);
    if (text.length <= 9000) return row;
    return { alphadog_row_preview_truncated: true, original_chars: text.length, preview: text.slice(0, 9000) };
  });
  const envelope = {
    alphadog_bounded_source_snapshot: true,
    storage_reason: "d1_text_cell_size_guard",
    source_shape_only: true,
    original_chars: fullText.length,
    detected_rows_key: detected.key,
    detected_row_count: rows.length,
    top_level_type: Array.isArray(value) ? "array" : typeof value,
    top_level_keys: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).slice(0, 80) : [],
    included_count: value && Array.isArray(value.included) ? value.included.length : 0,
    first_rows_sample_count: firstRows.length,
    first_rows_sample: firstRows,
    note: "Full raw PrizePicks JSON remains in GitHub prizepicks_mlb_current.json. D1 stores bounded source-shape staging only to avoid SQLITE_TOOBIG. No scoring, no ranking, no market_current_lines write."
  };
  let text = JSON.stringify(envelope, null, 0);
  if (text.length > MAX_RAW_JSON_CHARS) {
    const smaller = {
      alphadog_bounded_source_snapshot: true,
      storage_reason: "d1_text_cell_size_guard",
      original_chars: fullText.length,
      detected_rows_key: detected.key,
      detected_row_count: rows.length,
      top_level_type: Array.isArray(value) ? "array" : typeof value,
      top_level_keys: envelope.top_level_keys,
      included_count: envelope.included_count,
      first_rows_sample_count: 1,
      first_rows_sample_preview: JSON.stringify(rows[0] || {}).slice(0, 45000),
      note: envelope.note
    };
    text = JSON.stringify(smaller, null, 0);
  }
  if (text.length > MAX_RAW_JSON_CHARS) {
    text = JSON.stringify({
      alphadog_bounded_source_snapshot: true,
      storage_reason: "d1_text_cell_size_guard",
      original_chars: fullText.length,
      detected_rows_key: detected.key,
      detected_row_count: rows.length,
      truncated_to_chars: MAX_RAW_JSON_CHARS,
      preview: text.slice(0, MAX_RAW_JSON_CHARS - 500),
      note: envelope.note
    });
  }
  return {
    text,
    truncated: true,
    original_chars: fullText.length,
    stored_chars: text.length
  };
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}

function valuePresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) { return Object.values(obj).every(Boolean); }

async function readJsonSafe(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function first(db, sql, ...binds) {
  const rows = await all(db, sql, ...binds);
  return rows[0] || null;
}

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function baseIdentity(env, extra = {}) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const cfg = valuePresence(env, REQUIRED_CONFIG_VALUES);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    source_key: SOURCE_KEY,
    status: "READY",
    timestamp_utc: nowUtc(),
    phase: "prizepicks_github_board_source_shape_staging_v0_1_0",
    notes: [
      "Reads the configured PrizePicks GitHub JSON source.",
      "Parses JSON and inspects source shape only.",
      "Writes only MARKET_DB.market_raw_snapshots and MARKET_DB.market_source_health.",
      "No market_current_lines writes, no normalization, no scoring, no ranking, no final board."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      required_config_values_present: allTrue(cfg)
    },
    ...extra
  };
}

async function validateTableColumns(env, tableName, expectedColumns) {
  if (!env.MARKET_DB) return { ok: false, table: tableName, reason: "missing_MARKET_DB_binding", columns_present: [], missing_columns: expectedColumns };
  const cols = await all(env.MARKET_DB, `PRAGMA table_info(${tableName})`);
  const names = cols.map(c => String(c.name || ""));
  const missing = expectedColumns.filter(c => !names.includes(c));
  return { ok: missing.length === 0, table: tableName, columns_present: names, required_columns: expectedColumns, missing_columns: missing };
}

async function validateWriteSchema(env) {
  const raw = await validateTableColumns(env, "market_raw_snapshots", EXPECTED_MARKET_RAW_SNAPSHOTS_COLUMNS);
  const health = await validateTableColumns(env, "market_source_health", EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS);
  return { ok: raw.ok && health.ok, market_raw_snapshots: raw, market_source_health: health };
}

async function readConfigSystemSettings(env, keys) {
  const out = {};
  if (!env.CONFIG_DB) return out;
  try {
    const placeholders = keys.map(() => "?").join(",");
    const rows = await all(env.CONFIG_DB, `SELECT setting_key, setting_value FROM config_system_settings WHERE setting_key IN (${placeholders})`, ...keys);
    for (const row of rows) if (row && row.setting_key) out[String(row.setting_key)] = row.setting_value;
  } catch (err) {
    out.__config_read_error = safeString(err && err.message ? err.message : err, 500);
  }
  return out;
}

function buildRawGithubUrl(owner, repo, branch, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}

async function githubSourceConfig(env) {
  const keys = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH"];
  const dbSettings = await readConfigSystemSettings(env, keys);
  const owner = String(dbSettings.GITHUB_OWNER || env.GITHUB_OWNER || "Rodantmat").trim();
  const repo = String(dbSettings.GITHUB_REPO || env.GITHUB_REPO || "Alphadog").trim();
  const branch = String(dbSettings.GITHUB_BRANCH || env.GITHUB_BRANCH || "main").trim();
  const path = String(dbSettings.GITHUB_PRIZEPICKS_PATH || env.GITHUB_PRIZEPICKS_PATH || "prizepicks_mlb_current.json").replace(/^\/+/, "").trim();
  return {
    owner,
    repo,
    branch,
    path,
    url: buildRawGithubUrl(owner, repo, branch, path),
    config_resolution: {
      source: dbSettings.GITHUB_PRIZEPICKS_PATH ? "CONFIG_DB.config_system_settings" : "worker_vars_fallback",
      config_db_read_error: dbSettings.__config_read_error || null,
      db_keys_present: {
        GITHUB_OWNER: dbSettings.GITHUB_OWNER !== undefined,
        GITHUB_REPO: dbSettings.GITHUB_REPO !== undefined,
        GITHUB_BRANCH: dbSettings.GITHUB_BRANCH !== undefined,
        GITHUB_PRIZEPICKS_PATH: dbSettings.GITHUB_PRIZEPICKS_PATH !== undefined
      },
      worker_var_keys_present: valuePresence(env, keys)
    }
  };
}

function looksLikeAlphaDogWorkerScript(text) {
  const body = String(text || "");
  return body.includes("export default") && body.includes("WORKER_NAME") && body.includes("JOB_KEY");
}

function extractConst(text, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*[\"']([^\"']+)[\"']`);
  const match = String(text || "").match(re);
  return match ? match[1] : null;
}

function summarizeWorkerScript(text) {
  const body = String(text || "");
  return {
    file_type: "javascript_worker_script",
    worker_name: extractConst(body, "WORKER_NAME"),
    version: extractConst(body, "VERSION"),
    job_key: extractConst(body, "JOB_KEY"),
    has_export_default: body.includes("export default"),
    size_bytes_estimate: new TextEncoder().encode(body).length,
    line_count_estimate: body ? body.split(/\r?\n/).length : 0
  };
}

function detectArray(json) {
  if (Array.isArray(json)) return { key: "root_array", rows: json };
  if (!json || typeof json !== "object") return { key: "non_object", rows: [] };
  const candidates = ["data", "projections", "lines", "items", "rows", "entries", "results"];
  for (const key of candidates) if (Array.isArray(json[key])) return { key, rows: json[key] };
  if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
    for (const key of candidates) if (Array.isArray(json.data[key])) return { key: `data.${key}`, rows: json.data[key] };
  }
  if (json.payload && typeof json.payload === "object" && !Array.isArray(json.payload)) {
    for (const key of candidates) if (Array.isArray(json.payload[key])) return { key: `payload.${key}`, rows: json.payload[key] };
  }
  return { key: "no_known_array", rows: [] };
}

function getDeepValue(obj, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in cur)) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null && String(cur).length > 0) return cur;
  }
  return null;
}

function includedLeagueMap(json) {
  const map = new Map();
  const included = json && Array.isArray(json.included) ? json.included : [];
  for (const item of included) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.type || "").toLowerCase();
    if (!type.includes("league") && !type.includes("sport")) continue;
    const id = String(item.id || "");
    const attrs = item.attributes || {};
    const name = String(attrs.name || attrs.display_name || attrs.league || attrs.sport || attrs.abbreviation || "").toLowerCase();
    if (id) map.set(id, name);
  }
  return map;
}

function rowLooksMlb(row, leagueMap) {
  if (!row || typeof row !== "object") return false;
  const haystackValues = [
    getDeepValue(row, ["league", "sport", "sport_name", "league_name", "attributes.league", "attributes.sport", "attributes.sport_name", "attributes.league_name", "attributes.league_abbreviation"]),
    getDeepValue(row, ["attributes.stat_type", "attributes.description", "attributes.name"])
  ].filter(Boolean).map(v => String(v).toLowerCase());

  if (haystackValues.some(v => v === "mlb" || v.includes("major league baseball") || v.includes("baseball"))) return true;

  const leagueId = getDeepValue(row, ["relationships.league.data.id", "league_id", "attributes.league_id"]);
  if (leagueId && leagueMap.has(String(leagueId))) {
    const name = leagueMap.get(String(leagueId));
    if (name === "mlb" || name.includes("major league baseball") || name.includes("baseball")) return true;
  }
  return false;
}

function findFreshness(json) {
  if (!json || typeof json !== "object") return null;
  const locations = [json, json.meta, json.metadata, json.status, json.source, json.payload].filter(Boolean);
  const keys = ["fetched_at", "updated_at", "generated_at", "created_at", "scraped_at", "timestamp", "last_update", "last_updated"];
  for (const obj of locations) {
    if (!obj || typeof obj !== "object") continue;
    for (const key of keys) if (obj[key]) return { field: key, value: String(obj[key]).slice(0, 120) };
  }
  return null;
}

function currentPtDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}

function slateDateFromJson(json, input) {
  if (input && input.slate_date) return String(input.slate_date).slice(0, 40);
  const value = findFreshness(json);
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value.value)) return value.value.slice(0, 10);
  return currentPtDate();
}

function summarizeJsonShape(json) {
  const detected = detectArray(json);
  const rows = detected.rows || [];
  const leagueMap = includedLeagueMap(json);
  const mlbRows = rows.filter(row => rowLooksMlb(row, leagueMap));
  const firstRow = rows[0] && typeof rows[0] === "object" ? rows[0] : null;
  return {
    top_level_type: Array.isArray(json) ? "array" : typeof json,
    top_level_keys: json && typeof json === "object" && !Array.isArray(json) ? Object.keys(json).slice(0, 40) : [],
    detected_rows_key: detected.key,
    detected_row_count: rows.length,
    likely_mlb_row_count: mlbRows.length,
    included_count: json && Array.isArray(json.included) ? json.included.length : 0,
    included_league_map_size: leagueMap.size,
    first_row_type: firstRow ? String(firstRow.type || "") : null,
    first_row_keys: firstRow ? Object.keys(firstRow).slice(0, 40) : [],
    first_row_attribute_keys: firstRow && firstRow.attributes && typeof firstRow.attributes === "object" ? Object.keys(firstRow.attributes).slice(0, 40) : [],
    freshness_signal: findFreshness(json)
  };
}

async function writeHealth(env, status, rowsLastFetch, health, errorText = null) {
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
  return { wrote_table: "market_source_health", source_key: SOURCE_KEY };
}

async function writeRawSnapshot(env, parsedJson, rowCount, slateDate, status, errorText = null) {
  const snapshotId = rid("pp_raw");
  const bounded = boundedRawJson(parsedJson);
  await run(env.MARKET_DB,
    "INSERT INTO market_raw_snapshots (snapshot_id, source_key, slate_date, fetched_at, raw_json, row_count, status, error) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)",
    snapshotId, SOURCE_KEY, slateDate, bounded.text, rowCount, status, errorText
  );
  return {
    wrote_table: "market_raw_snapshots",
    snapshot_id: snapshotId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    row_count: rowCount,
    status,
    raw_json_truncated: bounded.truncated,
    raw_json_original_chars: bounded.original_chars,
    raw_json_stored_chars: bounded.stored_chars
  };
}

async function runBoardSourceShape(env, input = {}) {
  const started = Date.now();
  const requestId = input.request_id || null;
  const chainId = input.chain_id || null;
  const schema = await validateWriteSchema(env);
  if (!schema.ok) {
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      status: "blocked_schema_mismatch",
      certification: "SCHEMA_NOT_SAFE_TO_WRITE",
      schema,
      rows_read: 0,
      rows_written: 0,
      external_calls_performed: 0,
      error: "MARKET_DB schema is missing required first-build write columns. Stop and patch schema only after review.",
      timestamp_utc: nowUtc()
    };
  }

  const source = await githubSourceConfig(env);
  const fetchStarted = nowUtc();
  let response;
  let text = "";

  try {
    const headers = {
      "user-agent": "AlphaDog-v2 PrizePicks GitHub Board Worker",
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
      source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution },
      fetch_started_at: fetchStarted,
      checked_at: nowUtc(),
      reachable: false,
      http_status: null,
      json_parse_ok: false,
      error,
      no_market_current_lines_write: true,
      no_scoring: true
    };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_UNREACHABLE", rows_read: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
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
      source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution },
      fetch_started_at: fetchStarted,
      checked_at: nowUtc(),
      reachable: false,
      http_status: httpStatus,
      content_type: contentType,
      response_size_bytes: sizeBytes,
      json_parse_ok: false,
      error,
      response_preview: safeString(text, 500),
      no_market_current_lines_write: true,
      no_scoring: true
    };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_HTTP_ERROR", rows_read: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const pathLower = String(source.path || "").toLowerCase();
  const isJavascriptSource = pathLower.endsWith(".js") || String(contentType || "").includes("javascript") || looksLikeAlphaDogWorkerScript(text);
  if (isJavascriptSource) {
    const scriptShape = summarizeWorkerScript(text);
    const error = "Configured PrizePicks path reached a Worker script, not the real PrizePicks JSON board dump.";
    const health = {
      version: VERSION,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution },
      fetch_started_at: fetchStarted,
      checked_at: nowUtc(),
      reachable: true,
      http_status: httpStatus,
      content_type: contentType,
      response_size_bytes: sizeBytes,
      json_parse_ok: false,
      source_file_mode: "javascript_worker_script",
      script_shape: scriptShape,
      error,
      no_market_current_lines_write: true,
      no_scoring: true,
      no_final_board_write: true
    };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_IS_WORKER_SCRIPT_NOT_BOARD_JSON", rows_read: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  let parsed;
  let parseError = null;
  try { parsed = JSON.parse(text); } catch (err) { parseError = safeString(err && err.message ? err.message : err); }
  if (parseError) {
    const health = {
      version: VERSION,
      request_id: requestId,
      chain_id: chainId,
      source_key: SOURCE_KEY,
      source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution },
      fetch_started_at: fetchStarted,
      checked_at: nowUtc(),
      reachable: true,
      http_status: httpStatus,
      content_type: contentType,
      response_size_bytes: sizeBytes,
      json_parse_ok: false,
      error: parseError,
      response_preview: safeString(text, 500),
      no_market_current_lines_write: true,
      no_scoring: true
    };
    const write = await writeHealth(env, "error", 0, health, parseError);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "JSON_PARSE_FAILED", rows_read: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const shape = summarizeJsonShape(parsed);
  const slateDate = slateDateFromJson(parsed, input);
  const rawWrite = await writeRawSnapshot(env, parsed, shape.detected_row_count, slateDate, RAW_SNAPSHOT_STATUS_OK, null);
  const healthy = shape.detected_row_count > 0;
  const healthStatus = healthy ? "healthy" : "warning";
  const certification = healthy ? "PRIZEPICKS_JSON_SOURCE_SHAPE_STAGED" : "PRIZEPICKS_JSON_PARSED_NO_ROWS_DETECTED";
  const health = {
    version: VERSION,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution },
    fetch_started_at: fetchStarted,
    checked_at: nowUtc(),
    reachable: true,
    http_status: httpStatus,
    content_type: contentType,
    response_size_bytes: sizeBytes,
    json_parse_ok: true,
    slate_date: slateDate,
    shape,
    raw_snapshot: rawWrite,
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  };
  const healthWrite = await writeHealth(env, healthStatus, shape.detected_row_count, health, healthy ? null : "JSON parsed but no known row array detected");

  return {
    ok: true,
    data_ok: healthy,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    status: healthStatus,
    certification,
    rows_read: shape.detected_row_count,
    rows_written: 2,
    external_calls_performed: 1,
    elapsed_ms: Date.now() - started,
    source_config_safe: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution },
    shape,
    writes: { raw_snapshot: rawWrite, source_health: healthWrite },
    output_cap_note: "Response contains shape/status only. Full raw JSON stays in GitHub; MARKET_DB.market_raw_snapshots stores bounded source-shape staging only to avoid D1 SQLITE_TOOBIG.",
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return jsonResponse({ ok: true });

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));

    if (method === "GET" && path === "/health") {
      let schema = null;
      let source = null;
      try { schema = await validateWriteSchema(env); } catch (err) { schema = { ok: false, error: safeString(err && err.message ? err.message : err) }; }
      try { source = await githubSourceConfig(env); } catch (err) { source = { ok: false, error: safeString(err && err.message ? err.message : err) }; }
      return jsonResponse({
        ...baseIdentity(env),
        route: "/health",
        checks: {
          db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
          config_values_present: valuePresence(env, REQUIRED_CONFIG_VALUES),
          write_schema: schema,
          github_source_config: source
        },
        safe_secret_note: "Secret/config values are presence-checked only. GitHub token value is never printed."
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
          config_values_present: valuePresence(env, REQUIRED_CONFIG_VALUES),
          write_schema: await validateWriteSchema(env),
          github_source_config: await githubSourceConfig(env)
        },
        writes_performed: 0,
        external_calls_performed: 0
      });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await runBoardSourceShape(env, input);
      return jsonResponse(output, 200);
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
