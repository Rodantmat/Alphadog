const WORKER_NAME = "alphadog-v2-market-line-shape-classifier";
const VERSION = "alphadog-v2-market-line-shape-classifier-v0.2.1-parlay-player-team-resolver";
const JOB_KEY = "market-line-shape-classifier";
const MODE = "market_hitter_prop_line_context";
const PARLAY_SOURCE_KEY = "parlay_api_sleeper_hitter_props";
const MAX_PREPARED_ROWS = 9000;
const MAX_PARLAY_ROWS = 20000;
const DEFAULT_PARLAY_API_BASE_URL = "https://parlay-api.com/v1";
const DEFAULT_PARLAY_SLEEPER_PROPS_ENDPOINT = "/sports/baseball_mlb/props?bookmakers=sleeper&limit=10000&dfsOdds=effective";

const REQUIRED_DB_BINDINGS = ["MARKET_DB", "SCORE_DB", "TEAM_DB", "REF_DB", "CONTROL_DB"];
const OPTIONAL_DB_BINDINGS = ["CONFIG_DB"];
const EXPECTED_SECRETS = ["PARLAY_API_KEY"];
const HITTER_PROP_KEYS = ["doubles", "hits", "hits_runs_rbis", "hitter_strikeouts", "home_runs", "rbis", "runs", "singles", "stolen_bases", "total_bases", "triples", "walks"];
const HITTER_MARKET_KEY_TO_PROP = {
  player_hits: "hits",
  hits: "hits",
  player_rbis: "rbis",
  player_rbi: "rbis",
  rbis: "rbis",
  player_runs: "runs",
  runs: "runs",
  player_singles: "singles",
  singles: "singles",
  player_doubles: "doubles",
  doubles: "doubles",
  player_triples: "triples",
  triples: "triples",
  player_home_runs: "home_runs",
  home_runs: "home_runs",
  player_total_bases: "total_bases",
  total_bases: "total_bases",
  player_hits_runs_rbis: "hits_runs_rbis",
  hits_runs_rbis: "hits_runs_rbis",
  hitter_strikeouts: "hitter_strikeouts",
  player_hitter_strikeouts: "hitter_strikeouts",
  player_bat_strike_outs: "hitter_strikeouts",
  player_stolen_bases: "stolen_bases",
  stolen_bases: "stolen_bases",
  player_walks: "walks",
  player_bat_walks: "walks",
  walks: "walks"
};

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" } });
}
function safeText(value, max = 900) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function safeJson(value, max = 7000) {
  const text = JSON.stringify(value === undefined ? null : value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}
function sourceHas(env, key) { return !!(env && env[key] !== undefined && env[key] !== null && String(env[key]).trim().length > 0); }
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
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
async function batchRun(db, sql, bindRows, chunkSize = 75) {
  const rows = Array.isArray(bindRows) ? bindRows : [];
  if (!rows.length) return { batches: 0, statements: 0 };
  let batches = 0;
  let statements = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db.batch(chunk.map(binds => db.prepare(sql).bind(...binds)));
    batches += 1;
    statements += chunk.length;
  }
  return { batches, statements };
}
function ptDate(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const base = new Date(Date.now() + offsetDays * 86400000);
  return fmt.format(base);
}
function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normalizedMarket(value) {
  return normalizeText(value).replace(/ /g, "_");
}
function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function americanToDecimal(american) {
  const n = numberOrNull(american);
  if (n === null || n === 0) return null;
  return n > 0 ? Number((1 + n / 100).toFixed(4)) : Number((1 + 100 / Math.abs(n)).toFixed(4));
}
function parseObjectSafe(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch (_) { return {}; } }
  return {};
}
function compactRawJson(value) { return safeJson(value, 6500); }
function baseIdentity(env, extra = {}) {
  const required = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const optional = bindingPresence(env, OPTIONAL_DB_BINDINGS);
  const missingDb = Object.entries(required).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    ok: true,
    data_ok: missingDb.length === 0,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: missingDb.length ? "BLOCKED_MISSING_DB_BINDINGS" : "READY",
    phase: MODE,
    selected_dummy_slot_audit: {
      selected_worker_slot: WORKER_NAME,
      original_source_status: "dummy_only_alphadog_v2_dummy_workers_v0_1",
      reason_selected: "closest unused Market-family dummy with line/shape semantics; not locked to Teams, Board, Daily Context, Calendar, Score Prep, scoring, or scheduled full runs"
    },
    bindings: { required, optional },
    secrets_present_only: { PARLAY_API_KEY: sourceHas(env, "PARLAY_API_KEY") },
    boundaries: { hitter_player_props_only: true, no_pitcher_props: true, no_teams_game_odds: true, no_market_current_lines: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_matrix: true, no_final_board: true },
    timestamp_utc: nowUtc(),
    ...extra
  };
}
async function ensureSchema(env) {
  await env.MARKET_DB.batch([
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_batches (batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_name TEXT, worker_version TEXT, mode TEXT, slate_window_key TEXT, window_start_date TEXT, window_end_date TEXT, status TEXT, prepared_rows_read INTEGER DEFAULT 0, prepared_games_checked INTEGER DEFAULT 0, prepared_players_checked INTEGER DEFAULT 0, prepared_prop_keys_checked INTEGER DEFAULT 0, odds_api_config_present INTEGER DEFAULT 0, odds_api_events_seen INTEGER DEFAULT 0, odds_api_events_mapped INTEGER DEFAULT 0, odds_api_game_odds_rows INTEGER DEFAULT 0, parlay_inventory_rows_seen INTEGER DEFAULT 0, parlay_props_mapped_to_prepared INTEGER DEFAULT 0, parlay_coverage_grade TEXT, warning_count INTEGER DEFAULT 0, blocker_count INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_player_props (probe_row_id TEXT PRIMARY KEY, batch_id TEXT, slate_window_key TEXT, official_date TEXT, prepared_row_id TEXT, source_key TEXT, source_event_id TEXT, source_line_id TEXT, game_pk INTEGER, resolved_mlb_player_id INTEGER, source_player_name TEXT, canonical_prop_key TEXT, source_market_key TEXT, line_value REAL, price_american REAL, price_decimal REAL, outcome_side TEXT, mapping_status TEXT, coverage_status TEXT, raw_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_coverage (coverage_row_id TEXT PRIMARY KEY, batch_id TEXT, slate_window_key TEXT, official_date TEXT, prepared_row_id TEXT, source_key TEXT, game_pk INTEGER, resolved_mlb_player_id INTEGER, canonical_prop_key TEXT, board_line_value REAL, game_market_status TEXT, player_prop_market_status TEXT, market_context_status TEXT, coverage_grade TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare(`CREATE TABLE IF NOT EXISTS market_context_probe_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, slate_window_key TEXT, official_date TEXT, severity TEXT, issue_type TEXT, game_pk INTEGER, prepared_row_id TEXT, source_key TEXT, reason TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_market_context_player_props_mode ON market_context_probe_player_props(slate_window_key, official_date, source_key)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_market_context_coverage_batch ON market_context_probe_coverage(batch_id, slate_window_key)"),
    env.MARKET_DB.prepare("CREATE INDEX IF NOT EXISTS idx_market_context_batches_mode ON market_context_probe_batches(mode, slate_window_key)")
  ]);
}
async function schemaStatus(env) {
  const out = {};
  for (const t of ["market_context_probe_batches", "market_context_probe_player_props", "market_context_probe_coverage", "market_context_probe_issues"]) {
    try { out[t] = (await all(env.MARKET_DB, `PRAGMA table_info(${t})`)).map(r => r.name); } catch (err) { out[t] = { error: safeText(err && err.message ? err.message : err) }; }
  }
  return out;
}
async function getConfigValue(env, key) {
  if (!env.CONFIG_DB) return null;
  const table = await first(env.CONFIG_DB, "SELECT name FROM sqlite_master WHERE type='table' AND name='config_system_settings'");
  if (!table) return null;
  const cols = (await all(env.CONFIG_DB, "PRAGMA table_info(config_system_settings)")).map(r => String(r.name || ""));
  const keyCol = cols.includes("setting_key") ? "setting_key" : (cols.includes("config_key") ? "config_key" : (cols.includes("key") ? "key" : null));
  const valueCol = cols.includes("setting_value") ? "setting_value" : (cols.includes("config_value") ? "config_value" : (cols.includes("value") ? "value" : null));
  if (!keyCol || !valueCol) return null;
  const row = await first(env.CONFIG_DB, `SELECT ${valueCol} AS value FROM config_system_settings WHERE ${keyCol} = ? LIMIT 1`, key);
  return row && row.value !== undefined && row.value !== null ? String(row.value) : null;
}
async function configuredParlayEndpoint(env, input = {}) {
  const baseFromConfig = await getConfigValue(env, "PARLAY_API_BASE_URL");
  const endpointFromConfig = await getConfigValue(env, "PARLAY_SLEEPER_PROBE_ENDPOINT") || await getConfigValue(env, "PARLAY_API_SLEEPER_ENDPOINT");
  const baseUrl = String(input.parlay_api_base_url || baseFromConfig || env.PARLAY_API_BASE_URL || DEFAULT_PARLAY_API_BASE_URL).trim().replace(/\/+$/, "");
  const endpoint = String(input.parlay_endpoint || input.source_endpoint || endpointFromConfig || env.PARLAY_SLEEPER_PROPS_ENDPOINT || env.PARLAY_SLEEPER_PROBE_ENDPOINT || env.PARLAY_API_SLEEPER_ENDPOINT || DEFAULT_PARLAY_SLEEPER_PROPS_ENDPOINT).trim();
  if (!baseUrl || !endpoint) return { ok: false, reason: "PARLAY_API_BASE_URL_OR_ENDPOINT_MISSING", base_url_present: !!baseUrl, endpoint_present: !!endpoint };
  const url = /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;
  return { ok: true, url, endpoint_preview: safeEndpoint(url), base_url_host: safeHost(baseUrl) };
}
function safeHost(urlText) { try { return new URL(urlText).host; } catch (_) { return "invalid_url"; } }
function safeEndpoint(urlText) { try { const u = new URL(urlText); return `${u.origin}${u.pathname}`; } catch (_) { return String(urlText || "").split("?")[0]; } }
function authHeaders(env) {
  const headers = new Headers({ "accept": "application/json", "user-agent": "AlphaDog-v2-market-hitter-prop-context/0.2.1" });
  const headerName = String(env.PARLAY_API_AUTH_HEADER_NAME || "X-API-Key").trim();
  const prefix = String(env.PARLAY_API_AUTH_HEADER_PREFIX || "").trim();
  if (sourceHas(env, "PARLAY_API_KEY") && headerName) headers.set(headerName, prefix ? `${prefix} ${env.PARLAY_API_KEY}` : String(env.PARLAY_API_KEY));
  return headers;
}
function findArraysDeep(value, path = "$", out = [], depth = 0) {
  if (depth > 5 || !value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    if (value.some(x => x && typeof x === "object" && !Array.isArray(x))) out.push({ path, rows: value });
    for (let i = 0; i < Math.min(value.length, 5); i++) findArraysDeep(value[i], `${path}[${i}]`, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(value)) findArraysDeep(v, `${path}.${k}`, out, depth + 1);
  return out;
}
function extractRawRows(json) {
  const arrays = findArraysDeep(json).sort((a, b) => b.rows.length - a.rows.length);
  const best = arrays[0] || { path: null, rows: [] };
  return { path: best.path, rows: best.rows.slice(0, MAX_PARLAY_ROWS), candidates: arrays.slice(0, 8).map(a => ({ path: a.path, rows: a.rows.length })) };
}
function getDeep(obj, keys) {
  for (const key of keys) {
    if (!key) continue;
    const parts = key.split(".");
    let cur = obj;
    let ok = true;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null && String(cur).trim() !== "") return cur;
  }
  return null;
}
function firstPrice(obj, side) {
  const keys = side === "over"
    ? ["over_price", "overPrice", "prices.over", "price_over", "outcomes.over.price", "over.price", "over.american", "over_price_american"]
    : ["under_price", "underPrice", "prices.under", "price_under", "outcomes.under.price", "under.price", "under.american", "under_price_american"];
  return numberOrNull(getDeep(obj, keys));
}
function normalizeParlayRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const marketRaw = getDeep(row, ["market_key", "marketKey", "market", "market_name", "marketName", "source_market", "source_market_key", "stat", "stat_type", "statType", "prop", "prop_type", "type", "name"]);
  const marketKey = normalizedMarket(marketRaw);
  const canonical = HITTER_MARKET_KEY_TO_PROP[marketKey] || HITTER_MARKET_KEY_TO_PROP[normalizeText(marketRaw).replace(/ /g, "_")] || null;
  if (!canonical || !HITTER_PROP_KEYS.includes(canonical)) return null;
  const playerName = getDeep(row, ["player", "player_name", "playerName", "participant.name", "selection_name", "description.player", "description.player_name", "athlete.name", "competitor.name"]);
  const lineValue = numberOrNull(getDeep(row, ["line_value", "line", "points", "point", "handicap", "line_score", "value"]));
  const eventId = getDeep(row, ["event_id", "eventId", "source_event_id", "game_id", "gameId", "match_id", "fixture_id"]);
  const lineId = getDeep(row, ["line_id", "lineId", "source_line_id", "id", "selection_id", "outcome_id"]);
  const commenceTime = getDeep(row, ["commence_time", "commenceTime", "start_time", "startTime", "game_time", "event.start_time"]);
  const homeTeam = getDeep(row, ["home_team", "homeTeam", "event.home_team", "teams.home", "home.name"]);
  const awayTeam = getDeep(row, ["away_team", "awayTeam", "event.away_team", "teams.away", "away.name"]);
  const bookmaker = getDeep(row, ["bookmaker", "bookmaker_key", "bookmakerKey", "sportsbook", "book"]);
  const overPrice = firstPrice(row, "over");
  const underPrice = firstPrice(row, "under");
  const side = normalizeText(getDeep(row, ["side", "outcome", "label", "name"])) || null;
  const directPrice = numberOrNull(getDeep(row, ["price", "american_price", "americanPrice", "odds", "price_american"]));
  return { raw: row, market_key: marketKey || String(marketRaw || ""), canonical_prop_key: canonical, player_name: playerName ? String(playerName) : null, player_name_normalized: normalizeText(playerName), line_value: lineValue, source_event_id: eventId ? String(eventId) : null, source_line_id: lineId ? String(lineId) : null, commence_time: commenceTime ? String(commenceTime) : null, home_team: homeTeam ? String(homeTeam) : null, away_team: awayTeam ? String(awayTeam) : null, bookmaker: bookmaker ? String(bookmaker) : "sleeper", over_price: overPrice, under_price: underPrice, side, price_american: directPrice };
}
async function fetchParlayHitterProps(env, input = {}) {
  const endpoint = await configuredParlayEndpoint(env, input);
  if (!endpoint.ok) return { ok: false, external_calls: 0, missing_config: true, rows: [], normalized: [], endpoint };
  if (!sourceHas(env, "PARLAY_API_KEY")) return { ok: false, external_calls: 0, missing_key: true, rows: [], normalized: [], endpoint };
  try {
    const resp = await fetch(endpoint.url, { method: "GET", headers: authHeaders(env) });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { return { ok: false, external_calls: 1, http_status: resp.status, non_json: true, response_preview: safeText(text), rows: [], normalized: [], endpoint }; }
    const extracted = extractRawRows(json);
    const normalized = extracted.rows.map(normalizeParlayRow).filter(Boolean);
    return { ok: resp.ok, external_calls: 1, http_status: resp.status, endpoint, detected_rows_path: extracted.path, detected_array_candidates: extracted.candidates, rows_seen: extracted.rows.length, normalized_hitter_rows: normalized.length, rows: extracted.rows, normalized };
  } catch (err) {
    return { ok: false, external_calls: 1, error: safeText(err && err.message ? err.message : err), rows: [], normalized: [], endpoint };
  }
}
async function loadPreparedHitterRows(env, today, tomorrow) {
  const ph = HITTER_PROP_KEYS.map(() => "?").join(",");
  return all(env.SCORE_DB, `SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id, player_name, player_name_normalized, resolved_player_id, resolved_mlb_player_id, team, opponent, team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date, source_start_time, row_payload_json FROM score_board_prepared_current WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched' AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL AND official_date IN (?, ?) AND canonical_prop_key IN (${ph}) AND player_name NOT LIKE '% + %' ORDER BY official_game_time_utc, official_game_pk, source_key, canonical_prop_key, player_name, line_value LIMIT ${MAX_PREPARED_ROWS}`, today, tomorrow, ...HITTER_PROP_KEYS);
}
function lineEqual(a, b) {
  const na = numberOrNull(a);
  const nb = numberOrNull(b);
  if (na === null || nb === null) return false;
  return Math.abs(na - nb) < 0.001;
}
function mapPush(map, key, row) {
  if (!key || key.includes("undefined")) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}
function lineKey(value) {
  const n = numberOrNull(value);
  return n === null ? "" : String(Number(n.toFixed(3)));
}
function teamPairKey(a, b) {
  const aa = normalizeText(a).toUpperCase();
  const bb = normalizeText(b).toUpperCase();
  if (!aa || !bb) return "";
  return [aa, bb].sort().join("|");
}
function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const id = String(row.prepared_row_id || `${row.official_game_pk}|${row.source_key}|${row.player_name}|${row.canonical_prop_key}|${row.line_value}`);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}
function choosePreparedCandidate(rows, sourceRow, statusBase) {
  const allRows = dedupeRows(rows);
  if (!allRows.length) return { status: "no_prepared_match", row: null, rows: [], candidates: 0, choice_reason: "no_candidates" };
  let candidates = allRows;
  const sourceBook = normalizeText(sourceRow.bookmaker);
  const bookMatched = candidates.filter(r => normalizeText(r.source_key) === sourceBook);
  if (bookMatched.length) candidates = bookMatched;
  const line = numberOrNull(sourceRow.line_value);
  if (line !== null) {
    const lineMatched = candidates.filter(r => lineEqual(r.line_value, line));
    if (lineMatched.length) candidates = lineMatched;
  }
  if (candidates.length === 1) {
    return { status: statusBase, row: candidates[0], rows: allRows, candidates: allRows.length, choice_reason: bookMatched.length ? "preferred_source_book" : "unique_candidate" };
  }
  const uniqueGamePlayerPropLine = new Map();
  for (const r of candidates) uniqueGamePlayerPropLine.set(`${r.official_game_pk}|${r.resolved_mlb_player_id}|${r.canonical_prop_key}|${lineKey(r.line_value)}`, r);
  if (uniqueGamePlayerPropLine.size === 1) {
    const first = [...uniqueGamePlayerPropLine.values()][0];
    return { status: `${statusBase}_multiple_board_rows`, row: first, rows: allRows, candidates: allRows.length, choice_reason: "same_game_player_prop_line_multiple_board_sources" };
  }
  return { status: `ambiguous_${statusBase}`, row: null, rows: allRows, candidates: allRows.length, choice_reason: "multiple_distinct_candidates" };
}
function buildPreparedIndex(rows) {
  const maps = {
    teamPairNamePropLine: new Map(), teamPairNameProp: new Map(),
    teamPairPlayerIdPropLine: new Map(), teamPairPlayerIdProp: new Map(),
    namePropLine: new Map(), nameProp: new Map(),
    playerIdPropLine: new Map(), playerIdProp: new Map()
  };
  for (const row of rows) {
    const name = normalizeText(row.player_name_normalized || row.player_name);
    const prop = String(row.canonical_prop_key || "");
    const line = lineKey(row.line_value);
    const pair = teamPairKey(row.team, row.opponent);
    const pid = String(row.resolved_mlb_player_id || row.resolved_player_id || "");
    row.__norm_name = name;
    row.__team_pair_key = pair;
    row.__line_key = line;
    row.__player_id_key = pid;
    mapPush(maps.namePropLine, `${name}|${prop}|${line}`, row);
    mapPush(maps.nameProp, `${name}|${prop}`, row);
    if (pid) {
      mapPush(maps.playerIdPropLine, `${pid}|${prop}|${line}`, row);
      mapPush(maps.playerIdProp, `${pid}|${prop}`, row);
    }
    if (pair) {
      mapPush(maps.teamPairNamePropLine, `${pair}|${name}|${prop}|${line}`, row);
      mapPush(maps.teamPairNameProp, `${pair}|${name}|${prop}`, row);
      if (pid) {
        mapPush(maps.teamPairPlayerIdPropLine, `${pair}|${pid}|${prop}|${line}`, row);
        mapPush(maps.teamPairPlayerIdProp, `${pair}|${pid}|${prop}`, row);
      }
    }
  }
  return maps;
}
async function loadTeamAliasMap(env) {
  const out = new Map();
  try {
    const teams = await all(env.REF_DB, "SELECT team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code FROM ref_teams WHERE active = 1");
    for (const t of teams) {
      const values = [t.team_id, t.abbreviation, t.full_name, t.nickname, t.location_name, t.short_name, t.team_code, t.file_code];
      for (const v of values) if (v !== undefined && v !== null && String(v).trim()) out.set(normalizeText(v), String(t.abbreviation || t.team_id || "").toUpperCase());
    }
  } catch (_) {}
  try {
    const aliases = await all(env.REF_DB, "SELECT a.team_id, t.abbreviation, a.alias_value, a.alias_normalized FROM ref_team_aliases a LEFT JOIN ref_teams t ON t.team_id = a.team_id WHERE a.active = 1");
    for (const a of aliases) {
      const id = String(a.abbreviation || a.team_id || "").toUpperCase();
      if (!id) continue;
      if (a.alias_normalized) out.set(normalizeText(a.alias_normalized), id);
      if (a.alias_value) out.set(normalizeText(a.alias_value), id);
    }
  } catch (_) {}
  return out;
}
async function loadPlayerAliasMap(env) {
  const out = new Map();
  try {
    const cols = (await all(env.REF_DB, "PRAGMA table_info(ref_player_aliases)")).map(r => String(r.name || ""));
    if (!cols.includes("player_id")) return out;
    const aliasCol = cols.includes("alias_normalized") ? "alias_normalized" : (cols.includes("alias_name") ? "alias_name" : null);
    if (!aliasCol) return out;
    const aliases = await all(env.REF_DB, `SELECT player_id, ${aliasCol} AS alias_value FROM ref_player_aliases WHERE ${aliasCol} IS NOT NULL LIMIT 20000`);
    for (const a of aliases) {
      const key = normalizeText(a.alias_value);
      const pid = numberOrNull(a.player_id);
      if (!key || pid === null) continue;
      if (!out.has(key)) out.set(key, new Set());
      out.get(key).add(Number(pid));
    }
  } catch (_) {}
  return out;
}
function enrichParlayRows(rows, teamAliases, playerAliases) {
  const out = [];
  for (const row of rows || []) {
    const homeId = teamAliases.get(normalizeText(row.home_team)) || null;
    const awayId = teamAliases.get(normalizeText(row.away_team)) || null;
    const aliasPlayers = playerAliases.get(row.player_name_normalized) || new Set();
    out.push({
      ...row,
      home_team_id: homeId,
      away_team_id: awayId,
      source_team_pair_key: teamPairKey(homeId, awayId),
      alias_player_ids: [...aliasPlayers]
    });
  }
  return out;
}
function bestPreparedMatch(sourceRow, index) {
  const name = sourceRow.player_name_normalized;
  const prop = sourceRow.canonical_prop_key;
  if (!name || !prop) return { status: "unmatched_missing_player_or_prop", row: null, rows: [], candidates: 0, choice_reason: "missing_player_or_prop" };
  const line = lineKey(sourceRow.line_value);
  const pair = sourceRow.source_team_pair_key || "";
  const playerIds = (sourceRow.alias_player_ids || []).map(x => String(x)).filter(Boolean);
  const attempts = [];
  if (pair) {
    for (const pid of playerIds) attempts.push([index.teamPairPlayerIdPropLine, `${pair}|${pid}|${prop}|${line}`, "matched_prepared_team_pair_player_alias_prop_line"]);
    attempts.push([index.teamPairNamePropLine, `${pair}|${name}|${prop}|${line}`, "matched_prepared_team_pair_player_prop_line"]);
    for (const pid of playerIds) attempts.push([index.teamPairPlayerIdProp, `${pair}|${pid}|${prop}`, "matched_prepared_team_pair_player_alias_prop"]);
    attempts.push([index.teamPairNameProp, `${pair}|${name}|${prop}`, "matched_prepared_team_pair_player_prop"]);
  }
  for (const pid of playerIds) attempts.push([index.playerIdPropLine, `${pid}|${prop}|${line}`, "matched_prepared_player_alias_prop_line"]);
  attempts.push([index.namePropLine, `${name}|${prop}|${line}`, "matched_prepared_player_prop_line"]);
  for (const pid of playerIds) attempts.push([index.playerIdProp, `${pid}|${prop}`, "matched_prepared_player_alias_prop"]);
  attempts.push([index.nameProp, `${name}|${prop}`, "matched_prepared_player_prop"]);
  for (const [map, key, status] of attempts) {
    const rows = map.get(key) || [];
    if (rows.length) return choosePreparedCandidate(rows, sourceRow, status);
  }
  return { status: pair ? "no_prepared_match_after_team_pair_player_prop_resolver" : "no_prepared_match_no_resolved_team_pair", row: null, rows: [], candidates: 0, choice_reason: pair ? "team_pair_resolved_but_no_player_prop_match" : "raw_team_pair_unresolved_or_absent" };
}
async function pruneHitterRows(env, today, tomorrow, slateWindowKey) {
  const deleted = {};
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_player_props WHERE source_key = ? AND (slate_window_key <> ? OR official_date NOT IN (?, ?))", PARLAY_SOURCE_KEY, slateWindowKey, today, tomorrow);
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_player_props WHERE source_key = ? AND slate_window_key = ?", PARLAY_SOURCE_KEY, slateWindowKey);
  deleted.market_context_probe_player_props = "deleted_hitter_parlay_source_rows_outside_or_current_today_tomorrow_window";
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_coverage WHERE (coverage_grade LIKE 'HITTER_PROP_%' OR details_json LIKE ?) AND (slate_window_key <> ? OR official_date NOT IN (?, ?))", `%"mode":"${MODE}"%`, slateWindowKey, today, tomorrow);
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_coverage WHERE (coverage_grade LIKE 'HITTER_PROP_%' OR details_json LIKE ?) AND slate_window_key = ?", `%"mode":"${MODE}"%`, slateWindowKey);
  deleted.market_context_probe_coverage = "deleted_only_hitter_prop_context_rows_no_teams_coverage_wipe";
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_issues WHERE issue_type LIKE 'HITTER_PROP_%' AND (slate_window_key <> ? OR official_date NOT IN (?, ?))", slateWindowKey, today, tomorrow);
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_issues WHERE issue_type LIKE 'HITTER_PROP_%' AND slate_window_key = ?", slateWindowKey);
  deleted.market_context_probe_issues = "deleted_only_hitter_prop_issues";
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_batches WHERE mode = ? AND (slate_window_key <> ? OR window_start_date NOT IN (?, ?) OR window_end_date NOT IN (?, ?))", MODE, slateWindowKey, today, tomorrow, today, tomorrow);
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_batches WHERE mode = ? AND slate_window_key = ?", MODE, slateWindowKey);
  deleted.market_context_probe_batches = "deleted_hitter_prop_batches_outside_or_current_today_tomorrow_window";
  return deleted;
}
async function writeIssue(env, issueRows, batchId, slateWindowKey, officialDate, severity, issueType, gamePk, preparedRowId, sourceKey, reason, details) {
  issueRows.push([rid("issue_hitter_prop"), batchId, slateWindowKey, officialDate, severity, issueType, gamePk || null, preparedRowId || null, sourceKey || PARLAY_SOURCE_KEY, safeText(reason, 900), safeJson({ mode: MODE, ...details }, 3000)]);
}
async function runHitterContext(env, input = {}) {
  const startedMs = Date.now();
  const requestId = input.request_id || rid("market_hitters");
  const runId = input.run_id || rid("run");
  const batchId = rid("market_hitter_props_batch");
  const today = ptDate(0);
  const tomorrow = ptDate(1);
  const slateWindowKey = `${today}_${tomorrow}`;
  const retention = { today, tomorrow, slate_window_key: slateWindowKey, policy: "only_today_tomorrow_rows_kept_for_hitter_prop_line_context" };
  const required = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const missingDb = Object.entries(required).filter(([, ok]) => !ok).map(([name]) => name);
  if (missingDb.length) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, mode: MODE, status: "blocked_missing_db_bindings", certification: "MARKET_HITTER_PROP_CONTEXT_BLOCKED_MISSING_DB_BINDINGS", certification_grade: "BLOCKED", missing_db_bindings: missingDb, rows_read: 0, rows_written: 0, external_calls_performed: 0, retention, timestamp_utc: nowUtc() };
  await ensureSchema(env);
  const prune = await pruneHitterRows(env, today, tomorrow, slateWindowKey);
  const preparedRows = await loadPreparedHitterRows(env, today, tomorrow);
  const gamePks = [...new Set(preparedRows.map(r => Number(r.official_game_pk)).filter(Number.isFinite))];
  const playerIds = [...new Set(preparedRows.map(r => Number(r.resolved_mlb_player_id)).filter(Number.isFinite))];
  const propKeys = [...new Set(preparedRows.map(r => String(r.canonical_prop_key || "")).filter(Boolean))];
  const issues = [];
  let blockerCount = 0;
  let warningCount = 0;

  if (!preparedRows.length) {
    blockerCount += 1;
    const output = { retention, prune, reason: "No prepared-safe hitter prop rows found for today/tomorrow." };
    await run(env.MARKET_DB, `INSERT INTO market_context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, parlay_coverage_grade, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, runId, WORKER_NAME, VERSION, MODE, slateWindowKey, today, tomorrow, "blocked_no_prepared_safe_hitter_rows", 0, 0, 0, 0, sourceHas(env, "ODDS_API_KEY") ? 1 : 0, 0, 0, "NO_PREPARED_ROWS", warningCount, blockerCount, "MARKET_HITTER_PROP_CONTEXT_NO_PREPARED_SAFE_ROWS", "BLOCKED", safeJson(output, 9000));
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, mode: MODE, status: "blocked_no_prepared_safe_hitter_rows", certification: "MARKET_HITTER_PROP_CONTEXT_NO_PREPARED_SAFE_ROWS", certification_grade: "BLOCKED", rows_read: 0, rows_written: 1, external_calls_performed: 0, retention, prune, timestamp_utc: nowUtc() };
  }

  const parlay = await fetchParlayHitterProps(env, input);
  const externalCalls = parlay.external_calls || 0;
  const teamAliases = await loadTeamAliasMap(env);
  const playerAliases = await loadPlayerAliasMap(env);
  const enrichedParlayRows = enrichParlayRows(parlay.normalized || [], teamAliases, playerAliases);
  if (!parlay.ok) {
    if (parlay.missing_key || parlay.missing_config) blockerCount += 1; else warningCount += 1;
    await writeIssue(env, issues, batchId, slateWindowKey, today, parlay.missing_key || parlay.missing_config ? "BLOCKER" : "WARNING", parlay.missing_key ? "HITTER_PROP_PARLAY_API_KEY_MISSING" : (parlay.missing_config ? "HITTER_PROP_PARLAY_API_CONFIG_MISSING" : "HITTER_PROP_PARLAY_API_FETCH_FAILED"), null, null, PARLAY_SOURCE_KEY, "Parlay API hitter prop fetch did not return usable data", { parlay_status: parlay });
  }

  const index = buildPreparedIndex(preparedRows);
  const propRows = [];
  const matchedPrepared = new Map();
  let matched = 0;
  let noMatch = 0;
  let ambiguous = 0;
  let sourceRowsWithOverUnder = 0;
  for (const sourceRow of enrichedParlayRows) {
    const match = bestPreparedMatch(sourceRow, index);
    const matchedRow = match.row;
    if (match.status.startsWith("matched")) matched += 1;
    else if (match.status.startsWith("ambiguous")) ambiguous += 1;
    else noMatch += 1;
    for (const r of (match.rows || (matchedRow ? [matchedRow] : []))) matchedPrepared.set(r.prepared_row_id, true);
    const sides = [];
    if (sourceRow.over_price !== null) sides.push({ side: "over", price: sourceRow.over_price });
    if (sourceRow.under_price !== null) sides.push({ side: "under", price: sourceRow.under_price });
    if (!sides.length && sourceRow.price_american !== null) sides.push({ side: sourceRow.side || "listed", price: sourceRow.price_american });
    if (sides.length) sourceRowsWithOverUnder += 1;
    if (!sides.length) sides.push({ side: "line_present_price_missing", price: null });
    for (const s of sides) {
      propRows.push([rid("mcp_hitter_prop"), batchId, slateWindowKey, matchedRow ? matchedRow.official_date : today, matchedRow ? matchedRow.prepared_row_id : null, PARLAY_SOURCE_KEY, sourceRow.source_event_id, sourceRow.source_line_id, matchedRow ? Number(matchedRow.official_game_pk) : null, matchedRow ? Number(matchedRow.resolved_mlb_player_id) : null, sourceRow.player_name, sourceRow.canonical_prop_key, sourceRow.market_key, sourceRow.line_value, s.price, americanToDecimal(s.price), s.side, match.status, matchedRow ? "parlay_hitter_prop_line_matched_to_prepared" : "parlay_hitter_prop_line_not_matched_to_prepared", compactRawJson({ mode: MODE, parlay: { ...sourceRow, raw: undefined }, resolver: { raw_home_team: sourceRow.home_team, raw_away_team: sourceRow.away_team, home_team_id: sourceRow.home_team_id, away_team_id: sourceRow.away_team_id, source_team_pair_key: sourceRow.source_team_pair_key, alias_player_ids: sourceRow.alias_player_ids || [], candidates: match.candidates || 0, choice_reason: match.choice_reason || null, matched_prepared_row_count: (match.rows || []).length }, prepared_match: matchedRow ? { prepared_row_id: matchedRow.prepared_row_id, source_key: matchedRow.source_key, player_name: matchedRow.player_name, canonical_prop_key: matchedRow.canonical_prop_key, line_value: matchedRow.line_value, game_pk: matchedRow.official_game_pk, official_game_time_utc: matchedRow.official_game_time_utc, team: matchedRow.team, opponent: matchedRow.opponent } : null, raw_source_row: sourceRow.raw })]);
    }
  }

  if (parlay.ok && (parlay.normalized || []).length === 0) {
    warningCount += 1;
    await writeIssue(env, issues, batchId, slateWindowKey, today, "WARNING", "HITTER_PROP_PARLAY_API_NO_HITTER_MARKETS_NORMALIZED", null, null, PARLAY_SOURCE_KEY, "Parlay API returned rows but no supported hitter markets normalized", { rows_seen: parlay.rows_seen || 0, detected_rows_path: parlay.detected_rows_path, candidates: parlay.detected_array_candidates });
  }
  if (parlay.ok && matched === 0 && (parlay.normalized || []).length > 0) {
    warningCount += 1;
    await writeIssue(env, issues, batchId, slateWindowKey, today, "WARNING", "HITTER_PROP_PARLAY_API_NO_PREPARED_MATCHES", null, null, PARLAY_SOURCE_KEY, "Parlay API hitter prop rows normalized but did not match prepared-safe board rows", { normalized_hitter_rows: parlay.normalized_hitter_rows, prepared_rows: preparedRows.length, stored_player_name_fix_active: true, team_aliases_loaded: teamAliases.size, player_aliases_loaded: playerAliases.size, enriched_rows: enrichedParlayRows.length });
  }

  const coverageRows = [];
  for (const row of preparedRows) {
    const has = matchedPrepared.has(row.prepared_row_id);
    coverageRows.push([rid("mcp_hitter_cov"), batchId, slateWindowKey, row.official_date, row.prepared_row_id, row.source_key, Number(row.official_game_pk), Number(row.resolved_mlb_player_id), row.canonical_prop_key, numberOrNull(row.line_value), "TEAMS_GAME_ODDS_NOT_IN_HITTER_PROP_SCOPE", has ? "PARLAY_HITTER_PROP_REFERENCE_MATCHED" : "PARLAY_HITTER_PROP_REFERENCE_NOT_MATCHED", has ? "HITTER_PROP_LINE_CONTEXT_PRESENT" : "HITTER_PROP_LINE_CONTEXT_NOT_FOUND", has ? "HITTER_PROP_PARLAY_REFERENCE_MATCHED" : "HITTER_PROP_PARLAY_REFERENCE_MISSING", safeJson({ mode: MODE, source_worker: WORKER_NAME, source_key: row.source_key, source_prop_name: row.source_prop_name, line_value: row.line_value, official_game_time_utc: row.official_game_time_utc, no_teams_game_odds: true, no_market_current_lines: true }, 3000)]);
  }

  await batchRun(env.MARKET_DB, `INSERT INTO market_context_probe_player_props (probe_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, source_event_id, source_line_id, game_pk, resolved_mlb_player_id, source_player_name, canonical_prop_key, source_market_key, line_value, price_american, price_decimal, outcome_side, mapping_status, coverage_status, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, propRows, 75);
  await batchRun(env.MARKET_DB, `INSERT INTO market_context_probe_coverage (coverage_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key, board_line_value, game_market_status, player_prop_market_status, market_context_status, coverage_grade, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, coverageRows, 75);
  await batchRun(env.MARKET_DB, `INSERT INTO market_context_probe_issues (issue_id, batch_id, slate_window_key, official_date, severity, issue_type, game_pk, prepared_row_id, source_key, reason, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, issues, 75);

  const coverageGrade = blockerCount ? "BLOCKED" : (matched > 0 ? (matched < preparedRows.length ? "PARTIAL_PARLAY_MATCH" : "FULL_PARLAY_MATCH") : ((parlay.normalized || []).length > 0 ? "PARLAY_NORMALIZED_RESOLVER_UNMATCHED" : "PARLAY_NO_SUPPORTED_HITTER_MARKETS"));
  const certification = blockerCount ? "MARKET_HITTER_PROP_CONTEXT_BLOCKED" : "MARKET_HITTER_PROP_CONTEXT_EVIDENCE_WRITTEN";
  const certificationGrade = blockerCount ? "BLOCKED" : (warningCount ? "PASS_WITH_WARNINGS" : "PASS");
  const status = blockerCount ? "completed_hitter_prop_context_blocked" : "completed_hitter_prop_context_evidence_written";
  const output = {
    retention,
    prune,
    selected_worker_slot: WORKER_NAME,
    mode: MODE,
    read_scope: "SCORE_DB.score_board_prepared_current prepared-safe hitter rows + Parlay API Sleeper props",
    write_scope: "MARKET_DB evidence tables only: market_context_probe_player_props, market_context_probe_coverage, market_context_probe_issues, market_context_probe_batches",
    prepared_rows_read: preparedRows.length,
    prepared_games_checked: gamePks.length,
    prepared_players_checked: playerIds.length,
    prepared_prop_keys_checked: propKeys.length,
    parlay_api: { config_present: !!(parlay.endpoint && parlay.endpoint.ok), key_present: sourceHas(env, "PARLAY_API_KEY"), fetch_ok: !!parlay.ok, http_status: parlay.http_status || null, endpoint_preview: parlay.endpoint && parlay.endpoint.endpoint_preview || null, detected_rows_path: parlay.detected_rows_path || null, rows_seen: parlay.rows_seen || 0, normalized_hitter_rows: parlay.normalized_hitter_rows || 0, enriched_hitter_rows: enrichedParlayRows.length, rows_with_price_context: sourceRowsWithOverUnder, matched_to_prepared: matched, no_prepared_match: noMatch, ambiguous_prepared_match: ambiguous, resolver_audit: { team_aliases_loaded: teamAliases.size, player_aliases_loaded: playerAliases.size, raw_player_column_persisted: true, raw_commence_time_not_trusted_as_primary_match_key: true, team_pair_calendar_prepared_resolver_enabled: true } },
    rows_written_detail: { player_prop_rows: propRows.length, coverage_rows: coverageRows.length, issue_rows: issues.length, batch_rows: 1 },
    coverage_grade: coverageGrade,
    warning_count: warningCount,
    blocker_count: blockerCount,
    boundaries: { no_teams_game_odds: true, no_pitcher_props: true, no_internal_hitter_factors: true, no_market_current_lines: true, no_prepared_board_mutation: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_matrix: true, no_final_board: true, no_old_production_touch: true }
  };
  await run(env.MARKET_DB, `INSERT INTO market_context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, odds_api_events_seen, odds_api_events_mapped, odds_api_game_odds_rows, parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, parlay_coverage_grade, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, runId, WORKER_NAME, VERSION, MODE, slateWindowKey, today, tomorrow, status, preparedRows.length, gamePks.length, playerIds.length, propKeys.length, sourceHas(env, "ODDS_API_KEY") ? 1 : 0, 0, 0, 0, parlay.rows_seen || 0, matched, coverageGrade, warningCount, blockerCount, certification, certificationGrade, safeJson(output, 9000));
  const rowsWritten = propRows.length + coverageRows.length + issues.length + 1;
  return { ok: true, data_ok: blockerCount === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, mode: MODE, status, certification, certification_grade: certificationGrade, rows_read: preparedRows.length, rows_written: rowsWritten, external_calls_performed: externalCalls, prepared_rows_read: preparedRows.length, prepared_games_checked: gamePks.length, prepared_players_checked: playerIds.length, prepared_prop_keys_checked: propKeys.length, parlay_inventory_rows_seen: parlay.rows_seen || 0, parlay_props_mapped_to_prepared: matched, parlay_coverage_grade: coverageGrade, warning_count: warningCount, blocker_count: blockerCount, retention, output_json: output, no_teams_game_odds: true, no_pitcher_props: true, no_market_current_lines_writes: true, no_score_db_mutation: true, no_scoring: true, no_ranking: true, no_matrix_builder: true, no_final_board: true, elapsed_ms: Date.now() - startedMs, timestamp_utc: nowUtc() };
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
      try { schema = await schemaStatus(env); } catch (err) { schema = { error: safeText(err && err.message ? err.message : err) }; }
      return jsonResponse(baseIdentity(env, { route: "/health", schema, today: ptDate(0), tomorrow: ptDate(1), safe_secret_note: "Secret values are intentionally never printed." }));
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      let schema = null;
      try { schema = await schemaStatus(env); } catch (err) { schema = { error: safeText(err && err.message ? err.message : err) }; }
      return jsonResponse(baseIdentity(env, { route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, mode: input.mode || null }, schema, writes_performed: 0, external_calls_performed: 0 }));
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      if (input.mode && input.mode !== MODE) return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "unsupported_mode", supported_mode: MODE, received_mode: input.mode }, 400);
      return jsonResponse(await runHitterContext(env, input));
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
