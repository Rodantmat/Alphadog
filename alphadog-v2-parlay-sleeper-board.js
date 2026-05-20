const WORKER_NAME = "alphadog-v2-parlay-sleeper-board";
const VERSION = "alphadog-v2-parlay-sleeper-board-v0.2.0-stage-only-no-promotion";
const JOB_KEY = "parlay-sleeper-board";
const SOURCE_KEY = "parlay_sleeper";
const MAX_PREVIEW_CHARS = 900;

// Safe public ParlayAPI probe defaults. These are endpoint/header names only, never secret values.
// They are intentionally coded as fallback defaults because Cloudflare/GitHub deploys may not apply wrangler var-only edits reliably.
const DEFAULT_PARLAY_API_BASE_URL = "https://parlay-api.com/v1";
const DEFAULT_PARLAY_SLEEPER_PROBE_ENDPOINT = "/sports/baseball_mlb/props?bookmakers=sleeper&limit=10000&dfsOdds=effective";
const DEFAULT_PARLAY_API_AUTH_HEADER_NAME = "X-API-Key";
const DEFAULT_PARLAY_API_AUTH_HEADER_PREFIX = "";

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
    DEFAULT_PARLAY_SLEEPER_PROBE_ENDPOINT ||
    ""
  ).trim();
  const baseUrl = String(env.PARLAY_API_BASE_URL || DEFAULT_PARLAY_API_BASE_URL || "").trim().replace(/\/+$/, "");
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
  const headerName = String(env.PARLAY_API_AUTH_HEADER_NAME || DEFAULT_PARLAY_API_AUTH_HEADER_NAME || "").trim();
  const headerPrefix = String(env.PARLAY_API_AUTH_HEADER_PREFIX || DEFAULT_PARLAY_API_AUTH_HEADER_PREFIX || "").trim();
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
    for (const key of ["data", "results", "items", "props", "projections", "markets", "lines", "events"]) {
      if (Array.isArray(json[key])) candidates.push({ path: key, rows: json[key] });
    }
    if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
      for (const key of ["results", "items", "props", "projections", "markets", "lines", "events"]) {
        if (Array.isArray(json.data[key])) candidates.push({ path: `data.${key}`, rows: json.data[key] });
      }
    }
  }
  const best = candidates.sort((a, b) => b.rows.length - a.rows.length)[0] || null;
  const rows = best ? best.rows : [];
  const sampleRows = rows.slice(0, 5).map(r => sanitizeSampleRow(r));
  return {
    top_level_type: topType,
    top_level_keys: topKeys,
    detected_rows_path: best ? best.path : null,
    detected_row_count: rows.length,
    row_field_names: detectRowFields(rows),
    market_key_distribution: valueDistribution(rows, "market_key"),
    market_distribution: valueDistribution(rows, "market"),
    bookmaker_distribution: valueDistribution(rows, "bookmaker"),
    sport_key_distribution: valueDistribution(rows, "sport_key"),
    game_date_distribution: valueDistribution(rows, "game_date"),
    sample_rows: sampleRows,
    source_stat_names: extractStatNames(rows),
    source_market_keys: extractUniqueValues(rows, "market_key", 120)
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

function detectRowFields(rows) {
  const found = new Set();
  for (const row of (rows || []).slice(0, 50)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) found.add(key);
  }
  return Array.from(found).sort().slice(0, 120);
}

function extractUniqueValues(rows, key, limit = 80) {
  const found = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) found.add(String(value).trim());
    if (found.size >= limit) break;
  }
  return Array.from(found).sort();
}

function valueDistribution(rows, key, limit = 80) {
  const counts = new Map();
  for (const row of rows || []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const raw = row[key];
    const value = raw === undefined || raw === null || String(raw).trim() === "" ? "__MISSING__" : String(raw).trim();
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function extractStatNames(rows) {
  const keys = ["market_key", "stat_type", "statType", "stat", "market", "market_name", "marketName", "type", "prop", "prop_type", "propType", "name", "category"];
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
  return Array.from(found).sort().slice(0, 120);
}


function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveSlateDate(row) {
  return normalizeText(row && row.game_date) || (normalizeText(row && row.commence_time) || nowUtc()).slice(0, 10);
}

function deriveSourceLineId(row) {
  const parts = [
    normalizeText(row && row.id),
    normalizeText(row && row.event_id),
    normalizeText(row && row.canonical_event_id),
    normalizeText(row && row.player),
    normalizeText(row && row.market_key),
    normalizeText(row && row.market),
    normalizeText(row && row.line)
  ].filter(Boolean);
  return safeString(parts.join("|"), 500) || rid("sleeper_source_line");
}

function rowRequiredAudit(row) {
  const missing = [];
  if (!normalizeText(row && row.player)) missing.push("player");
  if (!normalizeText(row && row.market_key)) missing.push("market_key");
  if (numberOrNull(row && row.line) === null) missing.push("line");
  if (!normalizeText(row && (row.event_id || row.canonical_event_id))) missing.push("event_id_or_canonical_event_id");
  return { ok: missing.length === 0, missing };
}

function isFuturePickable(row) {
  const required = rowRequiredAudit(row).ok;
  const start = normalizeText(row && row.commence_time);
  if (!required) return 0;
  if (!start) return 0;
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return 0;
  return t > Date.now() ? 1 : 0;
}

function toStageRow(row, batchId, fetchedAt) {
  const required = rowRequiredAudit(row);
  const sourceStatName = normalizeText(row && row.market_key) || normalizeText(row && row.market);
  return {
    stage_id: rid("sleeper_stage"),
    batch_id: batchId,
    source_key: SOURCE_KEY,
    slate_date: deriveSlateDate(row || {}),
    fetched_at: fetchedAt,
    source_event_id: normalizeText(row && (row.event_id || row.canonical_event_id)),
    source_line_id: deriveSourceLineId(row || {}),
    source_player_id: normalizeText(row && (row.player_id || row.playerId || row.athlete_id || row.athleteId)),
    player_name: normalizeText(row && row.player),
    team: normalizeText(row && row.team),
    opponent: normalizeText(row && row.opponent),
    league: "MLB",
    sport: normalizeText(row && row.sport_key),
    source_stat_name: sourceStatName,
    canonical_prop_key: null,
    line_value: numberOrNull(row && row.line),
    side: null,
    price: null,
    decimal_price: null,
    is_pickable: isFuturePickable(row || {}),
    start_time: normalizeText(row && row.commence_time),
    raw_line_json: safeString(JSON.stringify(row || {}), 3000),
    parse_status: required.ok ? "parsed_stage_only_alias_unreviewed" : "invalid_missing_required_fields",
    parse_error: required.ok ? null : `missing:${required.missing.join(",")}`,
    certification_status: "STAGE_ONLY_NO_PROMOTION_ALIAS_UNREVIEWED"
  };
}

async function clearUnpromotedSleeperStage(env) {
  await run(env.MARKET_DB, "DELETE FROM sleeper_board_stage WHERE source_key = ?", SOURCE_KEY);
  await run(env.MARKET_DB, "DELETE FROM sleeper_board_batches WHERE source_key = ? AND promoted_at IS NULL", SOURCE_KEY);
}

async function insertStageRows(env, stageRows) {
  const chunkSize = 80;
  for (let i = 0; i < stageRows.length; i += chunkSize) {
    const chunk = stageRows.slice(i, i + chunkSize);
    await env.MARKET_DB.batch(chunk.map(row => env.MARKET_DB.prepare(`INSERT INTO sleeper_board_stage (
      stage_id, batch_id, source_key, slate_date, fetched_at, source_event_id, source_line_id, source_player_id,
      player_name, team, opponent, league, sport, source_stat_name, canonical_prop_key, line_value, side, price,
      decimal_price, is_pickable, start_time, raw_line_json, parse_status, parse_error, certification_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        row.stage_id, row.batch_id, row.source_key, row.slate_date, row.fetched_at, row.source_event_id, row.source_line_id, row.source_player_id,
        row.player_name, row.team, row.opponent, row.league, row.sport, row.source_stat_name, row.canonical_prop_key, row.line_value, row.side, row.price,
        row.decimal_price, row.is_pickable, row.start_time, row.raw_line_json, row.parse_status, row.parse_error, row.certification_status
      )));
  }
}

async function stageOnlyRows(env, rows, sourceMeta, shape) {
  const fetchedAt = nowUtc();
  const batchId = rid("sleeper_batch");
  const sourceRows = Array.isArray(rows) ? rows : [];
  const filtered = sourceRows.filter(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    return String(row.bookmaker || "").toLowerCase() === "sleeper" && String(row.sport_key || "").toLowerCase() === "baseball_mlb";
  });
  const stageRows = filtered.map(row => toStageRow(row, batchId, fetchedAt));
  const validRows = stageRows.filter(row => row.parse_status === "parsed_stage_only_alias_unreviewed").length;
  const invalidRows = stageRows.length - validRows;
  const slateDates = Array.from(new Set(stageRows.map(row => row.slate_date).filter(Boolean))).sort();
  const pickableRows = stageRows.filter(row => row.is_pickable === 1).length;

  await clearUnpromotedSleeperStage(env);
  await run(env.MARKET_DB, `INSERT INTO sleeper_board_batches (
    batch_id, source_key, slate_date, fetched_at, staged_at, source_base_url, source_endpoint, source_http_status,
    source_size_bytes, top_level_shape, total_rows, staged_rows, valid_rows, invalid_rows, unmapped_stat_types,
    certification_status, certification_reason, certification_json
  ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    batchId,
    SOURCE_KEY,
    slateDates.length === 1 ? slateDates[0] : (slateDates[0] || null),
    fetchedAt,
    sourceMeta.base_url_host || null,
    sourceMeta.endpoint_preview || null,
    sourceMeta.http_status || null,
    sourceMeta.size_bytes || null,
    shape ? shape.top_level_type : null,
    sourceRows.length,
    stageRows.length,
    validRows,
    invalidRows,
    stageRows.length,
    "STAGE_ONLY_NO_PROMOTION_ALIAS_UNREVIEWED",
    "Rows parsed into Sleeper staging only. Promotion blocked until source-scoped prop aliases are reviewed and certified.",
    JSON.stringify({
      no_promotion: true,
      no_current_write: true,
      no_prizepicks_mutation: true,
      source_market_keys: shape ? shape.source_market_keys : [],
      market_key_distribution: shape ? shape.market_key_distribution : [],
      bookmaker_distribution: shape ? shape.bookmaker_distribution : [],
      sport_key_distribution: shape ? shape.sport_key_distribution : [],
      slate_dates: slateDates,
      pickable_rows: pickableRows
    })
  );
  await insertStageRows(env, stageRows);

  return {
    batch_id: batchId,
    source_total_rows: sourceRows.length,
    sleeper_baseball_rows: filtered.length,
    staged_rows: stageRows.length,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    pickable_rows: pickableRows,
    slate_dates: slateDates,
    certification_status: "STAGE_ONLY_NO_PROMOTION_ALIAS_UNREVIEWED",
    current_rows_written: 0,
    active_batch_rows_written: 0
  };
}

async function safeProbe(env, input = {}) {
  const schema = await ensureSleeperSchema(env);
  const endpoint = configuredEndpoint(env, input);
  const auth = authConfig(env);
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const secrets = valuePresence(env, REQUIRED_SECRET_KEYS);
  const cfg = valuePresence(env, CONFIG_KEYS);
  const effective_config_defaults_used = {
    PARLAY_API_BASE_URL: !present(env, "PARLAY_API_BASE_URL"),
    PARLAY_SLEEPER_PROBE_ENDPOINT: !present(env, "PARLAY_SLEEPER_PROBE_ENDPOINT") && !present(env, "PARLAY_API_SLEEPER_ENDPOINT"),
    PARLAY_API_AUTH_HEADER_NAME: !present(env, "PARLAY_API_AUTH_HEADER_NAME"),
    PARLAY_API_AUTH_HEADER_PREFIX: !present(env, "PARLAY_API_AUTH_HEADER_PREFIX")
  };

  const readiness = {
    db_bindings_present: db,
    required_db_bindings_present: allTrue(db),
    secrets_present_only: secrets,
    config_present: cfg,
    effective_config_defaults_used,
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

  const headers = new Headers({ "accept": "application/json", "user-agent": "AlphaDog-v2-Parlay-Sleeper-StageOnly/0.2.0" });
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
  try { parsed = JSON.parse(text); } catch (err) { parseError = safeString(err && err.message ? err.message : err, 500); }
  const shape = parsed ? detectShape(parsed) : null;
  const rows = shape && shape.detected_rows_path === "$" && Array.isArray(parsed) ? parsed : [];
  const rowsRead = shape ? Number(shape.detected_row_count || 0) : 0;
  let stageResult = null;
  let stageError = null;

  if (response.ok && parsed && shape && shape.top_level_type === "array" && Array.isArray(rows)) {
    try {
      stageResult = await stageOnlyRows(env, rows, {
        base_url_host: endpoint.base_url_host || null,
        endpoint_preview: endpoint.endpoint_preview || null,
        http_status: response.status,
        size_bytes: text.length
      }, shape);
    } catch (err) {
      stageError = safeString(err && err.message ? err.message : err, 800);
    }
  }

  const stagedOk = !!stageResult && !stageError;

  return {
    ok: true,
    data_ok: response.ok && !!parsed && !!shape && stagedOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    source_key: SOURCE_KEY,
    status: stagedOk ? "stage_only_completed_no_promotion" : (response.ok && parsed ? "source_probe_completed_shape_captured_stage_blocked" : "source_probe_completed_shape_unverified"),
    certification: stagedOk ? "PARLAY_SLEEPER_STAGE_ONLY_PARSED_NO_PROMOTION_ALIAS_REVIEW_REQUIRED" : (response.ok && parsed ? "PARLAY_SLEEPER_SOURCE_PROBE_SHAPE_CAPTURED_STAGE_BLOCKED" : "PARLAY_SLEEPER_SOURCE_PROBE_SHAPE_UNVERIFIED_NO_PROMOTION"),
    block_downstream_reason: stagedOk ? "promotion_blocked_until_source_scoped_aliases_are_reviewed_and_certified" : (stageError || "source_response_not_verified_json_shape"),
    readiness,
    source_config: safeSourceConfig(endpoint, auth),
    source_response: {
      http_status: response.status,
      ok: response.ok,
      content_type: response.headers.get("content-type") || null,
      size_bytes: text.length,
      full_body_parsed_before_preview: !!parsed,
      preview_truncated: text.length > MAX_PREVIEW_CHARS,
      parse_error: parseError,
      preview: safeString(text, MAX_PREVIEW_CHARS)
    },
    shape_summary: shape,
    source_stat_names: shape ? shape.source_stat_names : [],
    source_market_keys: shape ? shape.source_market_keys : [],
    stage_only_result: stageResult,
    stage_error: stageError,
    rows_read: rowsRead,
    rows_written: stagedOk ? ((stageResult.staged_rows || 0) + 1) : 0,
    promoted_rows_written: 0,
    current_rows_written: 0,
    active_batch_rows_written: 0,
    external_calls_performed: 1,
    elapsed_ms: Date.now() - started,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_prizepicks_mutation: true,
    no_promotion: true,
    next_required_approval: "Review staged Sleeper market_key values, add source-proven REF_DB.ref_prop_aliases rows, then approve stage+certify build."
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
    phase: "parlay_sleeper_board_stage_only_v0_2_0",
    notes: [
      "Stage-only worker with safe public endpoint/header fallbacks and full-body JSON parsing before bounded preview slicing.",
      "Creates/validates additive Sleeper lifecycle schema when /run executes.",
      "Performs safe source fetch and writes parsed rows to Sleeper staging tables only when source shape is captured.",
      "Does not write current board, certify aliases, promote rows, score, rank, write final board, or mutate PrizePicks."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      parlay_api_key_present: !!secrets.PARLAY_API_KEY,
      config_present: cfg,
      effective_default_config_available: {
        PARLAY_API_BASE_URL: true,
        PARLAY_SLEEPER_PROBE_ENDPOINT: true,
        PARLAY_API_AUTH_HEADER_NAME: true,
        PARLAY_API_AUTH_HEADER_PREFIX: true
      },
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
