const WORKER_NAME = "alphadog-v2-prizepicks-github-board";
const VERSION = "alphadog-v2-prizepicks-github-board-v0.1.6-github-sha-fetch-consumer-only";
const JOB_KEY = "prizepicks-github-board";
const SOURCE_KEY = "prizepicks_github";
const RAW_SNAPSHOT_STATUS_OK = "source_shape_staged";
const STAGE_CERT_PASS = "certified_ready_for_promotion";
const STAGE_CERT_FAIL = "failed_not_promoted";
const PROMOTION_CERT_PASS = "promoted_current_board";
const PROMOTION_CERT_FAIL = "promotion_failed_active_board_preserved";
const SOURCE_STALE_CERT = "PRIZEPICKS_SOURCE_STALE_NO_FUTURE_PICKABLE_ROWS";
const MAX_RAW_JSON_CHARS = 180000;
const MAX_HEALTH_JSON_CHARS = 7000;
const MAX_OUTPUT_PREVIEW_CHARS = 900;
const STAGE_INSERT_CHUNK_SIZE = 20;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "MARKET_DB"];
const REQUIRED_CONFIG_VALUES = ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH"];
const EXPECTED_MARKET_RAW_SNAPSHOTS_COLUMNS = ["snapshot_id", "source_key", "slate_date", "fetched_at", "raw_json", "row_count", "status", "error"];
const EXPECTED_MARKET_SOURCE_HEALTH_COLUMNS = ["source_key", "status", "last_success_at", "last_error_at", "last_error", "rows_last_fetch", "health_json", "updated_at"];
const EXPECTED_PP_STAGE_COLUMNS = ["stage_id", "batch_id", "source_key", "slate_date", "fetched_at", "staged_at", "projection_id", "player_id", "player_name", "team", "opponent", "league", "stat_type", "line_score", "description", "start_time", "raw_projection_json", "parse_status", "parse_error", "certification_status", "created_at"];
const EXPECTED_PP_BATCH_COLUMNS = ["batch_id", "source_key", "slate_date", "fetched_at", "staged_at", "certified_at", "source_path", "source_http_status", "source_size_bytes", "top_level_shape", "total_rows", "staged_rows", "mlb_rows", "valid_rows", "invalid_rows", "certification_status", "certification_reason", "certification_json", "promoted_at", "cleaned_at", "created_at", "updated_at"];
const EXPECTED_PP_CURRENT_COLUMNS = ["current_row_id", "batch_id", "source_key", "slate_date", "projection_id", "player_id", "player_name", "team", "opponent", "league", "stat_type", "line_score", "description", "start_time", "board_time", "end_time", "game_id", "event_type", "status", "projection_type", "odds_type", "source_line_type", "payout_variant", "is_goblin", "is_demon", "is_standard", "pickable_flag", "raw_projection_json", "row_payload_json", "promoted_at", "updated_at"];
const EXPECTED_PP_ACTIVE_COLUMNS = ["source_key", "slate_date", "active_batch_id", "certification_status", "row_count", "valid_rows", "activated_at", "updated_at"];

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

function safeCell(value, max = 900) {
  if (value === undefined || value === null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
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
    phase: "prizepicks_github_board_parse_stage_certify_promote_sha_fetch_v0_1_6",
    notes: [
      "Reads the configured PrizePicks GitHub JSON source.",
      "Parses JSON, stages PrizePicks rows into MARKET_DB.prizepicks_board_stage, and writes a batch certification row.",
      "Promotes only certified staged rows into MARKET_DB.prizepicks_board_current and flips MARKET_DB.prizepicks_board_active_batches after inserts succeed.",
      "No market_current_lines writes, no scoring, no ranking, no final board. If GitHub JSON is stale, dispatches the existing GitHub scraper workflow instead of promoting stale rows."
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
  const batches = await validateTableColumns(env, "prizepicks_board_batches", EXPECTED_PP_BATCH_COLUMNS);
  const stage = await validateTableColumns(env, "prizepicks_board_stage", EXPECTED_PP_STAGE_COLUMNS);
  const current = await validateTableColumns(env, "prizepicks_board_current", EXPECTED_PP_CURRENT_COLUMNS);
  const active = await validateTableColumns(env, "prizepicks_board_active_batches", EXPECTED_PP_ACTIVE_COLUMNS);
  return { ok: raw.ok && health.ok && batches.ok && stage.ok && current.ok && active.ok, market_raw_snapshots: raw, market_source_health: health, prizepicks_board_batches: batches, prizepicks_board_stage: stage, prizepicks_board_current: current, prizepicks_board_active_batches: active };
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

function buildGithubContentsApiUrl(owner, repo, branch, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
}

function buildRawGithubCommitUrl(owner, repo, commitish, path) {
  const cleanPath = String(path || "").replace(/^\/+/, "").trim();
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(commitish)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}

function buildGithubBlobApiUrl(owner, repo, sha) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`;
}

function decodeBase64Utf8(base64Text) {
  const compact = String(base64Text || "").replace(/\s+/g, "");
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function githubRepositoryDispatchUrl(owner, repo) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`;
}

function safeGithubToken(env) {
  const token = env && env.GITHUB_TOKEN ? String(env.GITHUB_TOKEN).trim() : "";
  if (!token || token === "DISABLED" || token === "SET_ME" || token === "undefined" || token === "null") return "";
  return token;
}

async function triggerPrizePicksSourceRefresh(env, source, input, reason) {
  const token = safeGithubToken(env);
  const dispatch = {
    attempted: false,
    ok: false,
    provider: "github_repository_dispatch",
    owner: source && source.owner ? source.owner : "Rodantmat",
    repo: source && source.repo ? source.repo : "Alphadog",
    branch: source && source.branch ? source.branch : "main",
    event_type: "alphadog_prizepicks_board",
    workflow_file: ".github/workflows/scrape.yml",
    reason: String(reason || "source_stale_no_future_pickable_rows"),
    request_id: input && input.request_id ? String(input.request_id) : null,
    chain_id: input && input.chain_id ? String(input.chain_id) : null,
    slate_date: input && input.slate_date ? String(input.slate_date).slice(0, 40) : currentPtDate(),
    token_present: Boolean(token),
    token_value_printed: false
  };
  if (!token) {
    return { ...dispatch, blocked: true, error: "missing_GITHUB_TOKEN_secret_for_worker_repository_dispatch" };
  }

  const url = githubRepositoryDispatchUrl(dispatch.owner, dispatch.repo);
  const body = {
    event_type: dispatch.event_type,
    client_payload: {
      dispatch_id: dispatch.request_id || rid("pp_scrape_dispatch"),
      request_id: dispatch.request_id || null,
      chain_id: dispatch.chain_id || null,
      slate_date: dispatch.slate_date,
      source: "alphadog-v2-prizepicks-github-board",
      source_worker_version: VERSION,
      reason: dispatch.reason,
      target_file: source && source.path ? source.path : "prizepicks_mlb_current.json"
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "AlphaDog-v2 PrizePicks Source Refresh Dispatcher",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    return {
      ...dispatch,
      attempted: true,
      ok: res.status === 204,
      http_status: res.status,
      response_preview: res.status === 204 ? "" : safeString(text, 700),
      note: res.status === 204
        ? "GitHub scrape workflow dispatch accepted. Run BOARD > PrizePicks again after the GitHub MLB Automatic Scraper workflow commits a fresh prizepicks_mlb_current.json."
        : "GitHub repository_dispatch failed; inspect token permissions and workflow availability."
    };
  } catch (err) {
    return {
      ...dispatch,
      attempted: true,
      ok: false,
      error: safeString(err && err.message ? err.message : err, 700)
    };
  }
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
    raw_branch_url: buildRawGithubUrl(owner, repo, branch, path),
    contents_api_url: buildGithubContentsApiUrl(owner, repo, branch, path),
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

function buildIncludedIndex(json) {
  const byKey = new Map();
  const byId = new Map();
  const included = json && Array.isArray(json.included) ? json.included : [];
  for (const item of included) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.type || "");
    const id = String(item.id || "");
    if (type && id) byKey.set(`${type}:${id}`, item);
    if (id && !byId.has(id)) byId.set(id, item);
  }
  return { byKey, byId };
}

function findRelationshipItem(row, index, relationshipNames) {
  const rels = row && row.relationships && typeof row.relationships === "object" ? row.relationships : {};
  for (const name of relationshipNames) {
    const rel = rels[name];
    const data = rel && rel.data;
    if (!data) continue;
    const candidate = Array.isArray(data) ? data[0] : data;
    if (!candidate) continue;
    const id = String(candidate.id || "");
    const type = String(candidate.type || "");
    if (type && id && index.byKey.has(`${type}:${id}`)) return index.byKey.get(`${type}:${id}`);
    if (id && index.byId.has(id)) return index.byId.get(id);
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
function parseStartTimeMs(value) {
  if (value === undefined || value === null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function isFutureStartTime(value, nowMs = Date.now()) {
  const ms = parseStartTimeMs(value);
  return ms !== null && ms > nowMs;
}

function buildBoardTimingSummary(rows, nowMs = Date.now()) {
  const validMlbRows = rows.filter(r => r && r.is_mlb && r.parse_status === "valid");
  const startTimes = validMlbRows.map(r => r.start_time).filter(Boolean);
  const parsedTimes = startTimes.map(parseStartTimeMs).filter(ms => ms !== null);
  const futurePickableRows = validMlbRows.filter(r => Number(r.pickable_flag || 0) === 1).length;
  const expiredOrStartedRows = validMlbRows.filter(r => {
    const ms = parseStartTimeMs(r.start_time);
    return ms !== null && ms <= nowMs;
  }).length;
  const missingStartTimeRows = validMlbRows.filter(r => !r.start_time).length;
  const invalidStartTimeRows = validMlbRows.filter(r => r.start_time && parseStartTimeMs(r.start_time) === null).length;
  return {
    checked_at_utc: new Date(nowMs).toISOString(),
    valid_mlb_rows: validMlbRows.length,
    future_pickable_rows: futurePickableRows,
    expired_or_started_rows: expiredOrStartedRows,
    missing_start_time_rows: missingStartTimeRows,
    invalid_start_time_rows: invalidStartTimeRows,
    min_start_time: startTimes.length ? startTimes.slice().sort()[0] : null,
    max_start_time: startTimes.length ? startTimes.slice().sort().slice(-1)[0] : null,
    min_start_time_utc: parsedTimes.length ? new Date(Math.min(...parsedTimes)).toISOString() : null,
    max_start_time_utc: parsedTimes.length ? new Date(Math.max(...parsedTimes)).toISOString() : null,
    all_valid_rows_started_or_expired: validMlbRows.length > 0 && futurePickableRows === 0
  };
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
    text = JSON.stringify({ alphadog_bounded_source_snapshot: true, storage_reason: "d1_text_cell_size_guard", original_chars: fullText.length, detected_rows_key: detected.key, detected_row_count: rows.length, preview: text.slice(0, MAX_RAW_JSON_CHARS - 500), note: envelope.note });
  }
  return { text, truncated: true, original_chars: fullText.length, stored_chars: text.length };
}

function parseProjectionRow(row, index, leagueMap, slateDate, fetchedAt, batchId) {
  const attrs = row && row.attributes && typeof row.attributes === "object" ? row.attributes : {};
  const projectionId = safeCell(row && row.id, 120);
  const playerItem = findRelationshipItem(row, index, ["new_player", "player", "participant", "players", "athlete"]);
  const playerAttrs = playerItem && playerItem.attributes && typeof playerItem.attributes === "object" ? playerItem.attributes : {};
  const statItem = findRelationshipItem(row, index, ["stat_type", "stat", "market", "projection_type"]);
  const statAttrs = statItem && statItem.attributes && typeof statItem.attributes === "object" ? statItem.attributes : {};
  const playerId = safeCell(playerItem && playerItem.id, 120) || safeCell(getDeepValue(row, ["relationships.new_player.data.id", "relationships.player.data.id", "player_id", "attributes.player_id"]), 120);
  const playerName = safeCell(playerAttrs.name || playerAttrs.display_name || playerAttrs.full_name || playerAttrs.player_name || attrs.player_name || attrs.name || attrs.description, 240);
  const team = safeCell(playerAttrs.team || playerAttrs.team_name || playerAttrs.team_abbreviation || playerAttrs.team_abbr || attrs.team || attrs.team_abbreviation, 120);
  const opponent = safeCell(attrs.opponent || attrs.opponent_team || attrs.game_opponent || attrs.away_team || null, 120);
  const leagueId = getDeepValue(row, ["relationships.league.data.id", "league_id", "attributes.league_id"]);
  const leagueFromMap = leagueId && leagueMap.has(String(leagueId)) ? leagueMap.get(String(leagueId)) : null;
  const league = safeCell(attrs.league || attrs.league_name || attrs.league_abbreviation || leagueFromMap || (rowLooksMlb(row, leagueMap) ? "mlb" : null), 80);
  const statType = safeCell(attrs.stat_type || attrs.stat_display_name || statAttrs.name || statAttrs.display_name || statAttrs.stat_type, 160);
  const lineRaw = attrs.line_score ?? attrs.flash_sale_line_score ?? attrs.score ?? attrs.line;
  const lineScore = lineRaw === undefined || lineRaw === null || lineRaw === "" ? null : Number(lineRaw);
  const description = safeCell(attrs.description || attrs.board_label || attrs.name, 400);
  const startTime = safeCell(attrs.start_time || attrs.board_time || attrs.end_time, 120);
  const boardTime = safeCell(attrs.board_time || attrs.start_time || null, 120);
  const endTime = safeCell(attrs.end_time || null, 120);
  const gameId = safeCell(attrs.game_id || getDeepValue(row, ["relationships.game.data.id", "game_id"]), 120);
  const eventType = safeCell(attrs.event_type || null, 120);
  const boardStatus = safeCell(attrs.status || null, 120);
  const projectionType = safeCell(attrs.projection_type || null, 120);
  const oddsType = safeCell(attrs.odds_type || null, 120);
  const variantHaystack = [attrs.projection_type, attrs.odds_type, attrs.description, attrs.stat_display_name, attrs.event_type, attrs.name].filter(Boolean).join(" ").toLowerCase();
  const isGoblin = variantHaystack.includes("goblin") ? 1 : 0;
  const isDemon = variantHaystack.includes("demon") ? 1 : 0;
  const isStandard = isGoblin || isDemon ? 0 : 1;
  const payoutVariant = safeCell(isGoblin ? "goblin" : isDemon ? "demon" : (attrs.odds_type || attrs.projection_type || "standard"), 120);
  const sourceLineType = safeCell(attrs.projection_type || attrs.odds_type || attrs.event_type || null, 120);
  const normalizedStatus = String(boardStatus || "").toLowerCase();
  const blockedByStatus = normalizedStatus === "removed" || normalizedStatus === "suspended";
  const startTimeMs = parseStartTimeMs(startTime);
  const blockedByStartTime = startTimeMs === null || startTimeMs <= Date.now();
  const pickableFlag = (!blockedByStatus && !blockedByStartTime) ? 1 : 0;
  const pickabilityReason = blockedByStatus ? `blocked_status_${normalizedStatus}` : (startTimeMs === null ? "blocked_missing_or_invalid_start_time" : (blockedByStartTime ? "blocked_started_or_expired" : "future_pickable"));
  const rowPayloadJson = JSON.stringify({
    projection_id: projectionId,
    player_id: playerId,
    player_name: playerName,
    team,
    opponent,
    league: league || (rowLooksMlb(row, leagueMap) ? "mlb" : null),
    stat_type: statType,
    line_score: lineScore === null || Number.isNaN(lineScore) ? null : lineScore,
    description,
    start_time: startTime,
    board_time: boardTime,
    end_time: endTime,
    game_id: gameId,
    event_type: eventType,
    status: boardStatus,
    projection_type: projectionType,
    odds_type: oddsType,
    source_line_type: sourceLineType,
    payout_variant: payoutVariant,
    is_goblin: isGoblin,
    is_demon: isDemon,
    is_standard: isStandard,
    pickable_flag: pickableFlag,
    pickability_reason: pickabilityReason,
    raw_type: row && row.type ? String(row.type) : null,
    relationship_keys: row && row.relationships && typeof row.relationships === "object" ? Object.keys(row.relationships).slice(0, 40) : []
  });
  const rawProjectionJson = JSON.stringify(row || {});
  const isMlb = rowLooksMlb(row, leagueMap) || String(league || "").toLowerCase().includes("mlb") || leagueMap.size === 1;
  const errors = [];
  if (!projectionId) errors.push("missing_projection_id");
  if (!playerName) errors.push("missing_player_name");
  if (!statType) errors.push("missing_stat_type");
  if (lineScore === null || Number.isNaN(lineScore)) errors.push("missing_or_invalid_line_score");
  if (!isMlb) errors.push("not_identified_as_mlb");
  const parseStatus = errors.length === 0 ? "valid" : "invalid";
  return {
    stage_id: rid("pp_stage"),
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    fetched_at: fetchedAt,
    projection_id: projectionId,
    player_id: playerId,
    player_name: playerName,
    team,
    opponent,
    league: league || (isMlb ? "mlb" : null),
    stat_type: statType,
    line_score: lineScore === null || Number.isNaN(lineScore) ? null : lineScore,
    description,
    start_time: startTime,
    board_time: boardTime,
    end_time: endTime,
    game_id: gameId,
    event_type: eventType,
    status: boardStatus,
    projection_type: projectionType,
    odds_type: oddsType,
    source_line_type: sourceLineType,
    payout_variant: payoutVariant,
    is_goblin: isGoblin,
    is_demon: isDemon,
    is_standard: isStandard,
    pickable_flag: pickableFlag,
    raw_projection_json: rawProjectionJson,
    row_payload_json: rowPayloadJson,
    parse_status: parseStatus,
    parse_error: errors.length ? errors.join(",") : null,
    certification_status: "pending",
    is_mlb: isMlb
  };
}

function buildCertification(shape, stagedRows, sourceSizeBytes, sourcePath) {
  const totalRows = shape.detected_row_count || 0;
  const mlbRows = stagedRows.filter(r => r.is_mlb).length;
  const validRows = stagedRows.filter(r => r.is_mlb && r.parse_status === "valid").length;
  const invalidRows = stagedRows.length - validRows;
  const validRate = mlbRows > 0 ? validRows / mlbRows : 0;
  const checks = {
    github_fetch_http_200: true,
    json_parse_ok: true,
    recognized_top_level_shape: shape.detected_rows_key === "data" || shape.detected_rows_key === "root_array" || shape.detected_row_count > 0,
    total_rows_gt_0: totalRows > 0,
    mlb_rows_min_100: mlbRows >= 100,
    valid_rate_min_90pct: validRate >= 0.90,
    source_size_gt_1000: sourceSizeBytes > 1000,
    not_worker_script: !String(sourcePath || "").toLowerCase().endsWith(".js")
  };
  const passed = Object.values(checks).every(Boolean);
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return {
    passed,
    certification_status: passed ? STAGE_CERT_PASS : STAGE_CERT_FAIL,
    certification_reason: passed ? "PrizePicks JSON parsed, staged, certified, and ready for current-board promotion." : `Certification failed: ${failed.join(",")}`,
    totalRows,
    stagedRows: stagedRows.length,
    mlbRows,
    validRows,
    invalidRows,
    validRate,
    checks,
    failed_checks: failed,
    no_market_current_lines_write: true,
    promotes_prizepicks_board_current_only: passed,
    no_scoring: true,
    manual_refresh_only: true
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
  return { wrote_table: "market_raw_snapshots", snapshot_id: snapshotId, source_key: SOURCE_KEY, slate_date: slateDate, row_count: rowCount, status, raw_json_truncated: bounded.truncated, raw_json_original_chars: bounded.original_chars, raw_json_stored_chars: bounded.stored_chars };
}

async function insertBatchPending(env, batchId, source, fetchedAt, slateDate, httpStatus, sizeBytes, shape) {
  await run(env.MARKET_DB,
    "INSERT INTO prizepicks_board_batches (batch_id, source_key, slate_date, fetched_at, staged_at, source_path, source_http_status, source_size_bytes, top_level_shape, total_rows, certification_status, certification_reason, certification_json, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'pending', 'stage_started', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    batchId, SOURCE_KEY, slateDate, fetchedAt, source.path, httpStatus, sizeBytes, JSON.stringify({ detected_rows_key: shape.detected_rows_key, top_level_keys: shape.top_level_keys }), shape.detected_row_count, safeJson({ phase: "stage_started", version: VERSION })
  );
  return { wrote_table: "prizepicks_board_batches", batch_id: batchId, status: "pending" };
}

async function stageRows(env, rows) {
  const sql = "INSERT INTO prizepicks_board_stage (stage_id, batch_id, source_key, slate_date, fetched_at, projection_id, player_id, player_name, team, opponent, league, stat_type, line_score, description, start_time, raw_projection_json, parse_status, parse_error, certification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  let inserted = 0;
  for (let i = 0; i < rows.length; i += STAGE_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + STAGE_INSERT_CHUNK_SIZE);
    const statements = chunk.map(r => env.MARKET_DB.prepare(sql).bind(r.stage_id, r.batch_id, r.source_key, r.slate_date, r.fetched_at, r.projection_id, r.player_id, r.player_name, r.team, r.opponent, r.league, r.stat_type, r.line_score, r.description, r.start_time, r.raw_projection_json, r.parse_status, r.parse_error, r.certification_status));
    await env.MARKET_DB.batch(statements);
    inserted += chunk.length;
  }
  return { wrote_table: "prizepicks_board_stage", inserted_rows: inserted, chunk_size: STAGE_INSERT_CHUNK_SIZE };
}

async function finalizeBatch(env, batchId, cert) {
  await run(env.MARKET_DB,
    "UPDATE prizepicks_board_batches SET certified_at=CURRENT_TIMESTAMP, staged_rows=?, mlb_rows=?, valid_rows=?, invalid_rows=?, certification_status=?, certification_reason=?, certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
    cert.stagedRows, cert.mlbRows, cert.validRows, cert.invalidRows, cert.certification_status, cert.certification_reason, safeJson(cert, 6000), batchId
  );
  await run(env.MARKET_DB,
    "UPDATE prizepicks_board_stage SET certification_status=? WHERE batch_id=?",
    cert.certification_status, batchId
  );
  return { wrote_table: "prizepicks_board_batches", updated_stage_table: "prizepicks_board_stage", batch_id: batchId, certification_status: cert.certification_status };
}

async function insertCurrentRows(env, rows, batchId, slateDate) {
  const validRows = rows.filter(r => r.is_mlb && r.parse_status === "valid");
  const sql = "INSERT INTO prizepicks_board_current (current_row_id, batch_id, source_key, slate_date, projection_id, player_id, player_name, team, opponent, league, stat_type, line_score, description, start_time, board_time, end_time, game_id, event_type, status, projection_type, odds_type, source_line_type, payout_variant, is_goblin, is_demon, is_standard, pickable_flag, raw_projection_json, row_payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  let inserted = 0;
  for (let i = 0; i < validRows.length; i += STAGE_INSERT_CHUNK_SIZE) {
    const chunk = validRows.slice(i, i + STAGE_INSERT_CHUNK_SIZE);
    const statements = chunk.map(r => env.MARKET_DB.prepare(sql).bind(
      `pp_current_${batchId}_${String(r.projection_id || r.stage_id).replace(/[^a-zA-Z0-9_\-]/g, "_")}`,
      batchId,
      SOURCE_KEY,
      slateDate,
      r.projection_id,
      r.player_id,
      r.player_name,
      r.team,
      r.opponent,
      r.league,
      r.stat_type,
      r.line_score,
      r.description,
      r.start_time,
      r.board_time,
      r.end_time,
      r.game_id,
      r.event_type,
      r.status,
      r.projection_type,
      r.odds_type,
      r.source_line_type,
      r.payout_variant,
      r.is_goblin,
      r.is_demon,
      r.is_standard,
      r.pickable_flag,
      r.raw_projection_json,
      r.row_payload_json
    ));
    await env.MARKET_DB.batch(statements);
    inserted += chunk.length;
  }
  return { wrote_table: "prizepicks_board_current", batch_id: batchId, slate_date: slateDate, inserted_rows: inserted, chunk_size: STAGE_INSERT_CHUNK_SIZE };
}

async function clearActivePrizePicksBoardForStaleSource(env, batchId, slateDate, cert, timing) {
  const certificationJson = safeJson({
    version: VERSION,
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    certification: SOURCE_STALE_CERT,
    reason: "Fetched PrizePicks source has no future pickable MLB rows. Active PrizePicks board cleared instead of promoting stale rows.",
    board_timing: timing,
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  }, 6000);

  await env.MARKET_DB.batch([
    env.MARKET_DB.prepare("DELETE FROM prizepicks_board_current WHERE source_key=?").bind(SOURCE_KEY),
    env.MARKET_DB.prepare("DELETE FROM prizepicks_board_active_batches WHERE source_key=?").bind(SOURCE_KEY),
    env.MARKET_DB.prepare("DELETE FROM prizepicks_board_stage WHERE source_key=?").bind(SOURCE_KEY),
    env.MARKET_DB.prepare("UPDATE prizepicks_board_batches SET certification_status=?, certification_reason=?, certification_json=?, cleaned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?").bind(SOURCE_STALE_CERT, "Fetched PrizePicks source has no future pickable MLB rows; active current board cleared and stale rows not promoted.", certificationJson, batchId)
  ]);

  return {
    promoted: false,
    source_stale_no_future_pickable: true,
    certification_status: SOURCE_STALE_CERT,
    reason: "Fetched PrizePicks source has no future pickable MLB rows; active current board cleared and stale rows not promoted.",
    batch_id: batchId,
    slate_date: slateDate,
    rows_promoted: 0,
    board_timing: timing,
    active_board_cleared: true,
    current_cleanup: { table: "prizepicks_board_current", source_key: SOURCE_KEY, cleared_all_for_source: true },
    active_pointer_cleanup: { table: "prizepicks_board_active_batches", source_key: SOURCE_KEY, cleared_all_for_source: true },
    stage_cleanup: { table: "prizepicks_board_stage", source_key: SOURCE_KEY, cleaned: true },
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  };
}

async function promoteCertifiedBatch(env, batchId, slateDate, cert, stagedRows, timing) {
  if (!cert.passed || cert.validRows !== cert.mlbRows || cert.validRows !== stagedRows.length) {
    return {
      promoted: false,
      certification_status: PROMOTION_CERT_FAIL,
      reason: "promotion_blocked_certification_or_row_count_mismatch",
      checks: {
        cert_passed: Boolean(cert.passed),
        valid_rows_equal_mlb_rows: cert.validRows === cert.mlbRows,
        valid_rows_equal_staged_rows: cert.validRows === stagedRows.length
      },
      active_board_preserved: true
    };
  }

  if (timing && timing.all_valid_rows_started_or_expired) {
    return await clearActivePrizePicksBoardForStaleSource(env, batchId, slateDate, cert, timing);
  }

  const inserted = await insertCurrentRows(env, stagedRows, batchId, slateDate);
  if (inserted.inserted_rows !== cert.validRows) {
    throw new Error(`promotion_insert_count_mismatch inserted=${inserted.inserted_rows} valid=${cert.validRows}`);
  }

  const promotionJson = safeJson({
    version: VERSION,
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: slateDate,
    inserted_rows: inserted.inserted_rows,
    certification: cert,
    board_timing: timing || null,
    active_pointer_switch_after_insert: true,
    old_current_cleanup_after_pointer_switch: true,
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  }, 6000);

  await env.MARKET_DB.batch([
    env.MARKET_DB.prepare("INSERT INTO prizepicks_board_active_batches (source_key, slate_date, active_batch_id, certification_status, row_count, valid_rows, activated_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(source_key, slate_date) DO UPDATE SET active_batch_id=excluded.active_batch_id, certification_status=excluded.certification_status, row_count=excluded.row_count, valid_rows=excluded.valid_rows, activated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP").bind(SOURCE_KEY, slateDate, batchId, PROMOTION_CERT_PASS, inserted.inserted_rows, cert.validRows),
    env.MARKET_DB.prepare("DELETE FROM prizepicks_board_active_batches WHERE source_key=? AND active_batch_id<>?").bind(SOURCE_KEY, batchId),
    env.MARKET_DB.prepare("UPDATE prizepicks_board_batches SET certification_status=?, certification_reason=?, certification_json=?, promoted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?").bind(PROMOTION_CERT_PASS, "Certified PrizePicks batch promoted to active current board.", promotionJson, batchId),
    env.MARKET_DB.prepare("DELETE FROM prizepicks_board_stage WHERE source_key=?").bind(SOURCE_KEY),
    env.MARKET_DB.prepare("UPDATE prizepicks_board_batches SET cleaned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?").bind(batchId),
    env.MARKET_DB.prepare("DELETE FROM prizepicks_board_current WHERE source_key=? AND batch_id<>?").bind(SOURCE_KEY, batchId)
  ]);

  return {
    promoted: true,
    certification_status: PROMOTION_CERT_PASS,
    batch_id: batchId,
    slate_date: slateDate,
    rows_promoted: inserted.inserted_rows,
    active_pointer: { wrote_table: "prizepicks_board_active_batches", source_key: SOURCE_KEY, slate_date: slateDate, active_batch_id: batchId },
    current_rows: inserted,
    old_current_cleanup: { table: "prizepicks_board_current", source_key: SOURCE_KEY, kept_batch_id: batchId, cleanup_scope: "all_prior_prizepicks_batches" },
    stale_active_batch_cleanup: { table: "prizepicks_board_active_batches", source_key: SOURCE_KEY, kept_batch_id: batchId, cleanup_scope: "all_prior_prizepicks_active_pointers" },
    stage_cleanup: { table: "prizepicks_board_stage", source_key: SOURCE_KEY, cleaned: true },
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true
  };
}

async function fetchGithubContentsMetadata(source, env) {
  const headers = {
    "accept": "application/vnd.github+json",
    "user-agent": "AlphaDog-v2 PrizePicks GitHub Board Worker",
    "x-github-api-version": "2022-11-28",
    "cache-control": "no-cache"
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(source.contents_api_url, { method: "GET", headers });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (_) {}
  const sha = parsed && parsed.sha ? String(parsed.sha) : null;
  const size = parsed && typeof parsed.size === "number" ? parsed.size : null;
  const htmlUrl = parsed && parsed.html_url ? String(parsed.html_url) : null;
  const gitUrl = parsed && parsed.git_url ? String(parsed.git_url) : null;
  return {
    ok: Boolean(res.ok && sha),
    http_status: res.status,
    content_type: res.headers.get("content-type"),
    sha,
    size,
    html_url: htmlUrl,
    git_url: gitUrl,
    response_preview: res.ok ? null : safeString(text, 700),
    api_url: source.contents_api_url
  };
}

async function fetchGithubJsonBySha(source, env) {
  const meta = await fetchGithubContentsMetadata(source, env);
  if (!meta.ok || !meta.sha) {
    return {
      ok: false,
      metadata: meta,
      url: source.contents_api_url,
      http_status: meta.http_status,
      content_type: meta.content_type,
      text: meta.response_preview || "",
      error: "GitHub Contents API did not return a usable blob sha for the configured PrizePicks JSON file."
    };
  }

  const blobUrl = meta.git_url || buildGithubBlobApiUrl(source.owner, source.repo, meta.sha);
  const headers = {
    "accept": "application/vnd.github+json",
    "user-agent": "AlphaDog-v2 PrizePicks GitHub Board Worker",
    "x-github-api-version": "2022-11-28",
    "cache-control": "no-cache, no-store, max-age=0",
    "pragma": "no-cache"
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(blobUrl, { method: "GET", headers });
  const body = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(body); } catch (_) {}
  let text = "";
  let decodeError = null;
  if (res.ok && parsed && parsed.encoding === "base64" && typeof parsed.content === "string") {
    try { text = decodeBase64Utf8(parsed.content); } catch (err) { decodeError = safeString(err && err.message ? err.message : err, 700); }
  }
  return {
    ok: Boolean(res.ok && text && !decodeError),
    metadata: meta,
    url: blobUrl,
    raw_branch_url: source.raw_branch_url || source.url,
    fetch_mode: "github_contents_api_blob_sha_fetch",
    http_status: res.status,
    content_type: res.headers.get("content-type"),
    blob_encoding: parsed && parsed.encoding ? String(parsed.encoding) : null,
    blob_size: parsed && typeof parsed.size === "number" ? parsed.size : null,
    text,
    error: res.ok ? (decodeError || (!text ? "GitHub blob API did not return decodable base64 content." : null)) : `GitHub blob API fetch failed with HTTP ${res.status}`,
    response_preview: res.ok ? null : safeString(body, 700)
  };
}

async function runBoardParseStageCertify(env, input = {}) {
  const started = Date.now();
  const requestId = input.request_id || null;
  const chainId = input.chain_id || null;
  const schema = await validateWriteSchema(env);
  if (!schema.ok) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "blocked_schema_mismatch", certification: "SCHEMA_NOT_SAFE_TO_PROMOTE", schema, rows_read: 0, rows_staged: 0, rows_written: 0, external_calls_performed: 0, error: "MARKET_DB schema is missing required v0.1.3 staging/current-board promotion columns. Stop and patch schema only after review.", timestamp_utc: nowUtc() };
  }

  const source = await githubSourceConfig(env);
  const fetchStarted = nowUtc();
  let sourceFetch;
  let text = "";
  try {
    sourceFetch = await fetchGithubJsonBySha(source, env);
    text = sourceFetch.text || "";
  } catch (err) {
    const error = safeString(err && err.message ? err.message : err);
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, raw_branch_url: source.raw_branch_url, contents_api_url: source.contents_api_url, config_resolution: source.config_resolution }, fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: false, http_status: null, json_parse_ok: false, error, fetch_mode: "github_contents_api_blob_sha_fetch", no_market_current_lines_write: true, no_scoring: true };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_UNREACHABLE", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const httpStatus = sourceFetch ? sourceFetch.http_status : null;
  const contentType = sourceFetch ? sourceFetch.content_type : null;
  const sizeBytes = new TextEncoder().encode(text || "").length;

  if (!sourceFetch || !sourceFetch.ok) {
    const error = sourceFetch && sourceFetch.error ? sourceFetch.error : `GitHub blob-sha source fetch failed with HTTP ${httpStatus}`;
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, raw_branch_url: source.raw_branch_url, contents_api_url: source.contents_api_url, config_resolution: source.config_resolution }, github_file_metadata: sourceFetch ? sourceFetch.metadata : null, fetched_url: sourceFetch ? sourceFetch.url : null, fetch_mode: sourceFetch ? sourceFetch.fetch_mode : "github_contents_api_blob_sha_fetch", fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: false, http_status: httpStatus, content_type: contentType, response_size_bytes: sizeBytes, json_parse_ok: false, error, response_preview: safeString(text, 500), no_market_current_lines_write: true, no_scoring: true };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_HTTP_ERROR", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: 2, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const pathLower = String(source.path || "").toLowerCase();
  const isJavascriptSource = pathLower.endsWith(".js") || String(contentType || "").includes("javascript") || looksLikeAlphaDogWorkerScript(text);
  if (isJavascriptSource) {
    const scriptShape = summarizeWorkerScript(text);
    const error = "Configured PrizePicks path reached a Worker script, not the real PrizePicks JSON board dump.";
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution }, fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: true, http_status: httpStatus, content_type: contentType, response_size_bytes: sizeBytes, json_parse_ok: false, source_file_mode: "javascript_worker_script", script_shape: scriptShape, error, no_market_current_lines_write: true, no_scoring: true, no_final_board_write: true };
    const write = await writeHealth(env, "error", 0, health, error);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "SOURCE_IS_WORKER_SCRIPT_NOT_BOARD_JSON", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  let parsed;
  let parseError = null;
  try { parsed = JSON.parse(text); } catch (err) { parseError = safeString(err && err.message ? err.message : err); }
  if (parseError) {
    const health = { version: VERSION, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution }, fetch_started_at: fetchStarted, checked_at: nowUtc(), reachable: true, http_status: httpStatus, content_type: contentType, response_size_bytes: sizeBytes, json_parse_ok: false, error: parseError, response_preview: safeString(text, 500), no_market_current_lines_write: true, no_scoring: true };
    const write = await writeHealth(env, "error", 0, health, parseError);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, source_key: SOURCE_KEY, status: "error", certification: "JSON_PARSE_FAILED", rows_read: 0, rows_staged: 0, rows_written: 1, external_calls_performed: 1, elapsed_ms: Date.now() - started, health, write, timestamp_utc: nowUtc() };
  }

  const shape = summarizeJsonShape(parsed);
  const detected = detectArray(parsed);
  const sourceRows = detected.rows || [];
  const slateDate = slateDateFromJson(parsed, input);
  const batchId = rid("pp_batch");
  const includedIndex = buildIncludedIndex(parsed);
  const leagueMap = includedLeagueMap(parsed);
  const stagedRows = sourceRows.map(row => parseProjectionRow(row, includedIndex, leagueMap, slateDate, fetchStarted, batchId));

  const rawWrite = await writeRawSnapshot(env, parsed, shape.detected_row_count, slateDate, RAW_SNAPSHOT_STATUS_OK, null);
  const batchPending = await insertBatchPending(env, batchId, source, fetchStarted, slateDate, httpStatus, sizeBytes, shape);
  const stageWrite = await stageRows(env, stagedRows);
  const cert = buildCertification(shape, stagedRows, sizeBytes, source.path);
  const boardTiming = buildBoardTimingSummary(stagedRows, Date.now());
  cert.board_timing = boardTiming;
  cert.future_pickable_rows = boardTiming.future_pickable_rows;
  cert.expired_or_started_rows = boardTiming.expired_or_started_rows;
  const batchFinalize = await finalizeBatch(env, batchId, cert);

  let promotion = { promoted: false, certification_status: cert.certification_status, reason: cert.passed ? "promotion_not_attempted" : cert.certification_reason, active_board_preserved: true };
  if (cert.passed) {
    try {
      promotion = await promoteCertifiedBatch(env, batchId, slateDate, cert, stagedRows, boardTiming);
    } catch (err) {
      const promotionError = safeString(err && err.message ? err.message : err, 900);
      promotion = { promoted: false, certification_status: PROMOTION_CERT_FAIL, reason: promotionError, active_board_preserved: true };
      await run(env.MARKET_DB,
        "UPDATE prizepicks_board_batches SET certification_status=?, certification_reason=?, certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
        PROMOTION_CERT_FAIL,
        `Promotion failed after successful staging/certification: ${promotionError}`,
        safeJson({ version: VERSION, batch_id: batchId, promotion_error: promotionError, active_board_preserved_until_pointer_switch: true, no_market_current_lines_write: true, no_scoring: true }, 6000),
        batchId
      );
    }
  }

  const sourceStaleHandled = Boolean(promotion && promotion.source_stale_no_future_pickable);
  const sourceRefreshDispatch = null;
  const finalPassed = cert.passed && promotion.promoted;
  const finalHandled = finalPassed || sourceStaleHandled;
  const finalCertification = finalPassed ? PROMOTION_CERT_PASS : (sourceStaleHandled ? SOURCE_STALE_CERT : (cert.passed ? PROMOTION_CERT_FAIL : cert.certification_status));
  const finalReason = finalPassed ? "Certified PrizePicks batch promoted to active current board." : (promotion.reason || cert.certification_reason);
  const healthStatus = finalPassed ? "healthy" : (sourceStaleHandled ? "source_stale_no_future_pickable_rows" : "warning");
  const health = {
    version: VERSION,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    source_config: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, raw_branch_url: source.raw_branch_url, contents_api_url: source.contents_api_url, config_resolution: source.config_resolution },
    github_file_metadata: sourceFetch ? sourceFetch.metadata : null,
    fetched_url: sourceFetch ? sourceFetch.url : null,
    fetch_mode: sourceFetch ? sourceFetch.fetch_mode : "github_contents_api_blob_sha_fetch",
    fetch_started_at: fetchStarted,
    checked_at: nowUtc(),
    reachable: true,
    http_status: httpStatus,
    content_type: contentType,
    response_size_bytes: sizeBytes,
    json_parse_ok: true,
    slate_date: slateDate,
    shape,
    batch: { batch_id: batchId, certification_status: finalCertification, certification_reason: finalReason, valid_rate: cert.validRate },
    board_timing: boardTiming,
    promotion,
    raw_snapshot: rawWrite,
    no_market_current_lines_write: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board_write: true,
    manual_refresh_only: true
  };
  const healthWrite = await writeHealth(env, healthStatus, cert.mlbRows || shape.detected_row_count, health, finalPassed ? null : finalReason);

  return {
    ok: finalHandled,
    data_ok: finalHandled,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    source_key: SOURCE_KEY,
    status: healthStatus,
    certification: finalCertification,
    certification_reason: finalReason,
    rows_read: shape.detected_row_count,
    rows_staged: stagedRows.length,
    rows_promoted: promotion.rows_promoted || 0,
    future_pickable_rows: boardTiming.future_pickable_rows,
    expired_or_started_rows: boardTiming.expired_or_started_rows,
    missing_start_time_rows: boardTiming.missing_start_time_rows,
    invalid_start_time_rows: boardTiming.invalid_start_time_rows,
    mlb_rows: cert.mlbRows,
    valid_rows: cert.validRows,
    invalid_rows: cert.invalidRows,
    valid_rate: Number(cert.validRate.toFixed(4)),
    rows_written: 5 + stagedRows.length + (promotion.rows_promoted || 0),
    external_calls_performed: 2,
    elapsed_ms: Date.now() - started,
    source_config_safe: { owner: source.owner, repo: source.repo, branch: source.branch, path: source.path, config_resolution: source.config_resolution },
    shape,
    batch: { batch_id: batchId, certification_status: finalCertification, certification_checks: cert.checks, failed_checks: cert.failed_checks },
    board_timing: boardTiming,
    promotion,
    source_refresh_dispatch: sourceRefreshDispatch,
    writes: { raw_snapshot: rawWrite, batch_pending: batchPending, stage: stageWrite, batch_finalize: batchFinalize, promotion, source_health: healthWrite },
    lifecycle_locked: {
      fetch_parse_stage_certify_promote_complete: finalPassed,
      source_stale_no_future_pickable_handled: sourceStaleHandled,
      active_pointer_table: "prizepicks_board_active_batches",
      current_board_table: "prizepicks_board_current",
      stage_cleaned_after_success: Boolean(promotion.stage_cleanup && promotion.stage_cleanup.cleaned),
      no_market_current_lines_write: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_scheduling_added: true,
      manual_buttons: ["BOARD > PrizePicks", "ORCHESTRATOR > Wake"]
    },
    output_cap_note: "Response contains promotion/certification only. Full raw JSON stays in GitHub. Active PrizePicks board is held in prizepicks_board_current behind prizepicks_board_active_batches. No market_current_lines, scoring, ranking, final board, or producer dispatch in v0.1.6.",
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
      return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), config_values_present: valuePresence(env, REQUIRED_CONFIG_VALUES), write_schema: schema, github_source_config: source }, safe_secret_note: "Secret/config values are presence-checked only. GitHub token value is never printed." });
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, diagnostics: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), config_values_present: valuePresence(env, REQUIRED_CONFIG_VALUES), write_schema: await validateWriteSchema(env), github_source_config: await githubSourceConfig(env) }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await runBoardParseStageCertify(env, input);
      return jsonResponse(output, 200);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
