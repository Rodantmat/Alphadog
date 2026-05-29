const WORKER_NAME = "alphadog-v2-market-normalizer";
const VERSION = "alphadog-v2-market-normalizer-v0.1.5-game-market-mining-normalizer";
const JOB_KEY = "market-normalizer";
const PHASE_KEY = "market_context_source_probe";
const ODDS_API_SOURCE_KEY = "odds_api";
const SPORTSBOOK_REFERENCE_SOURCE_SCOPE = "odds_api_strong_sportsbooks_only";
const MAX_PREPARED_ROWS = 9000;
const TEAM_MATCH_TOLERANCE_MINUTES = 25;

const REQUIRED_DB_BINDINGS = ["MARKET_DB", "SCORE_DB", "TEAM_DB", "REF_DB", "CONTROL_DB"];
const OPTIONAL_DB_BINDINGS = ["CONFIG_DB"];
const EXPECTED_SECRETS = ["ODDS_API_KEY"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeText(value, max = 900) {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function safeJson(value, max = 7000) {
  const text = JSON.stringify(value === undefined ? null : value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
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
async function readJsonSafe(request) {
  try { return await request.json(); } catch (_) { return {}; }
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
function ptDate(offsetDays = 0) {
  const dt = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
  const o = {};
  for (const p of parts) if (p.type !== "literal") o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day}`;
}
function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(the)\b/gi, "")
    .replace(/\b(jr|sr|ii|iii|iv)\.?\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function normalizeProp(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function parseTime(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : null;
}
function minutesBetween(a, b) {
  if (a === null || b === null) return null;
  return Math.abs(a - b) / 60000;
}
function sourceHas(env, key) {
  if (!env || env[key] === undefined || env[key] === null) return false;
  const value = String(env[key]).trim();
  return value.length > 0 && value.toUpperCase() !== "DISABLED" && value.toUpperCase() !== "SET_ME";
}

function baseIdentity(env, extra = {}) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const optionalDb = bindingPresence(env, OPTIONAL_DB_BINDINGS);
  const secrets = valuePresence(env, EXPECTED_SECRETS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    phase_key: PHASE_KEY,
    status: "READY",
    timestamp_utc: nowUtc(),
    mode: "market_source_probe",
    slot_note: "Existing market-normalizer worker slot is used as the v0.1 Market Context Source Probe shell to avoid global manifest/deploy-script churn. v0.1.5 is sportsbook-reference-only and fully mines normalized game/team market context from Odds API game odds. It does not read Sleeper or PrizePicks board inventory as market context.",
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      optional_db_bindings: optionalDb,
      source_secret_presence_only: secrets
    },
    hard_boundaries: {
      writes_market_current_lines: false,
      mutates_score_board_prepared_current: false,
      scoring: false,
      ranking: false,
      final_board: false,
      matrix_builder: false,
      retention: "today_tomorrow_only_probe_and_normalized_market_tables"
    },
    ...extra
  };
}

async function ensureSchema(env) {
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    worker_name TEXT,
    worker_version TEXT,
    mode TEXT,
    slate_window_key TEXT,
    window_start_date TEXT,
    window_end_date TEXT,
    status TEXT,
    prepared_rows_read INTEGER DEFAULT 0,
    prepared_games_checked INTEGER DEFAULT 0,
    prepared_players_checked INTEGER DEFAULT 0,
    prepared_prop_keys_checked INTEGER DEFAULT 0,
    odds_api_config_present INTEGER DEFAULT 0,
    odds_api_events_seen INTEGER DEFAULT 0,
    odds_api_events_mapped INTEGER DEFAULT 0,
    odds_api_game_odds_rows INTEGER DEFAULT 0,
    parlay_inventory_rows_seen INTEGER DEFAULT 0,
    parlay_props_mapped_to_prepared INTEGER DEFAULT 0,
    parlay_coverage_grade TEXT,
    warning_count INTEGER DEFAULT 0,
    blocker_count INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    output_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_event_map (
    probe_row_id TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_window_key TEXT,
    official_date TEXT,
    game_pk INTEGER,
    source_key TEXT,
    source_event_id TEXT,
    source_commence_time_utc TEXT,
    source_home_team TEXT,
    source_away_team TEXT,
    mapping_status TEXT,
    mapping_confidence TEXT,
    mapping_reason TEXT,
    candidate_count INTEGER DEFAULT 0,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_game_odds (
    probe_row_id TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_window_key TEXT,
    official_date TEXT,
    game_pk INTEGER,
    source_key TEXT,
    source_event_id TEXT,
    source_commence_time_utc TEXT,
    source_home_team TEXT,
    source_away_team TEXT,
    bookmaker_key TEXT,
    bookmaker_title TEXT,
    market_key TEXT,
    market_last_update TEXT,
    outcome_name TEXT,
    outcome_side TEXT,
    price_american REAL,
    point REAL,
    mapping_status TEXT,
    mapping_confidence TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_player_props (
    probe_row_id TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_window_key TEXT,
    official_date TEXT,
    prepared_row_id TEXT,
    source_key TEXT,
    source_event_id TEXT,
    source_line_id TEXT,
    game_pk INTEGER,
    resolved_mlb_player_id INTEGER,
    source_player_name TEXT,
    canonical_prop_key TEXT,
    source_market_key TEXT,
    line_value REAL,
    price_american REAL,
    price_decimal REAL,
    outcome_side TEXT,
    mapping_status TEXT,
    coverage_status TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_coverage (
    coverage_row_id TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_window_key TEXT,
    official_date TEXT,
    prepared_row_id TEXT,
    source_key TEXT,
    game_pk INTEGER,
    resolved_mlb_player_id INTEGER,
    canonical_prop_key TEXT,
    board_line_value REAL,
    game_market_status TEXT,
    player_prop_market_status TEXT,
    market_context_status TEXT,
    coverage_grade TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_window_key TEXT,
    official_date TEXT,
    severity TEXT,
    issue_type TEXT,
    game_pk INTEGER,
    prepared_row_id TEXT,
    source_key TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_book_market_status (
    status_row_id TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_window_key TEXT,
    official_date TEXT,
    game_pk INTEGER,
    source_key TEXT,
    source_event_id TEXT,
    bookmaker_key TEXT,
    bookmaker_title TEXT,
    market_key TEXT,
    market_status TEXT,
    outcome_rows INTEGER DEFAULT 0,
    point_values_json TEXT,
    price_values_json TEXT,
    market_last_update TEXT,
    freshness_status TEXT,
    missing_reason TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, `CREATE TABLE IF NOT EXISTS market_context_probe_game_market_summary (
    summary_row_id TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_window_key TEXT,
    official_date TEXT,
    game_pk INTEGER,
    source_key TEXT,
    source_event_id TEXT,
    source_commence_time_utc TEXT,
    home_team TEXT,
    away_team TEXT,
    book_target_count INTEGER DEFAULT 0,
    book_available_count INTEGER DEFAULT 0,
    book_coverage_grade TEXT,
    freshness_status TEXT,
    oldest_market_update TEXT,
    newest_market_update TEXT,
    h2h_book_count INTEGER DEFAULT 0,
    home_ml_consensus REAL,
    away_ml_consensus REAL,
    home_ml_best REAL,
    away_ml_best REAL,
    moneyline_favorite_team TEXT,
    moneyline_favorite_price REAL,
    moneyline_underdog_team TEXT,
    moneyline_underdog_price REAL,
    runline_book_count INTEGER DEFAULT 0,
    home_runline_point REAL,
    home_runline_consensus_price REAL,
    home_runline_best_price REAL,
    away_runline_point REAL,
    away_runline_consensus_price REAL,
    away_runline_best_price REAL,
    total_book_count INTEGER DEFAULT 0,
    total_consensus_line REAL,
    over_consensus_price REAL,
    under_consensus_price REAL,
    over_best_price REAL,
    under_best_price REAL,
    total_line_min REAL,
    total_line_max REAL,
    total_line_range REAL,
    derived_home_implied_runs REAL,
    derived_away_implied_runs REAL,
    implied_runs_method TEXT,
    implied_runs_confidence TEXT,
    parse_status TEXT,
    warning_flags TEXT,
    summary_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_batches_window ON market_context_probe_batches(slate_window_key)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_event_map_batch ON market_context_probe_event_map(batch_id, game_pk)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_game_odds_batch_game ON market_context_probe_game_odds(batch_id, game_pk)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_player_props_batch_prepared ON market_context_probe_player_props(batch_id, prepared_row_id)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_coverage_batch_prepared ON market_context_probe_coverage(batch_id, prepared_row_id)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_issues_batch ON market_context_probe_issues(batch_id)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_book_market_status_batch_game ON market_context_probe_book_market_status(batch_id, game_pk, bookmaker_key, market_key)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_game_market_summary_batch_game ON market_context_probe_game_market_summary(batch_id, game_pk)");
}

async function pruneProbeWindow(env, today, tomorrow, slateWindowKey) {
  const tables = [
    "market_context_probe_game_odds",
    "market_context_probe_player_props",
    "market_context_probe_event_map",
    "market_context_probe_coverage",
    "market_context_probe_issues",
    "market_context_probe_book_market_status",
    "market_context_probe_game_market_summary"
  ];
  const deleted = {};
  for (const table of tables) {
    await run(env.MARKET_DB, `DELETE FROM ${table} WHERE slate_window_key <> ? OR official_date NOT IN (?, ?)`, slateWindowKey, today, tomorrow);
    await run(env.MARKET_DB, `DELETE FROM ${table} WHERE slate_window_key = ?`, slateWindowKey);
    deleted[table] = "pruned_outside_today_tomorrow_and_replaced_current_window";
  }
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_batches WHERE slate_window_key <> ?", slateWindowKey);
  await run(env.MARKET_DB, "DELETE FROM market_context_probe_batches WHERE slate_window_key = ?", slateWindowKey);
  deleted.market_context_probe_batches = "pruned_outside_today_tomorrow_and_replaced_current_window";
  return deleted;
}

async function schemaStatus(env) {
  const tables = [
    "market_context_probe_batches",
    "market_context_probe_event_map",
    "market_context_probe_game_odds",
    "market_context_probe_player_props",
    "market_context_probe_coverage",
    "market_context_probe_issues",
    "market_context_probe_book_market_status",
    "market_context_probe_game_market_summary"
  ];
  const out = {};
  for (const t of tables) {
    try {
      const rows = await all(env.MARKET_DB, `PRAGMA table_info(${t})`);
      out[t] = { exists: rows.length > 0, columns: rows.map(r => r.name) };
    } catch (err) {
      out[t] = { exists: false, error: safeText(err && err.message ? err.message : err, 500) };
    }
  }
  return out;
}

function preparedSelectColumns() {
  return `prepared_row_id,
      source_key,
      source_row_id,
      source_event_id,
      projection_id,
      player_name,
      player_name_normalized,
      resolved_player_id,
      resolved_mlb_player_id,
      player_match_status,
      player_match_confidence,
      team,
      opponent,
      team_full_name,
      opponent_full_name,
      canonical_prop_key,
      source_prop_name,
      line_value,
      official_game_pk,
      official_game_time_utc,
      official_date,
      source_start_time,
      source_time_status,
      start_time_confidence,
      matchup_status,
      matchup_confidence,
      source_pickable,
      pickable_safe,
      prep_status,
      block_reason`;
}

async function loadPreparedRows(env, today, tomorrow) {
  return all(env.SCORE_DB, `SELECT ${preparedSelectColumns()}
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND official_date IN (?, ?)
    ORDER BY official_game_time_utc, official_game_pk, source_key, canonical_prop_key, player_name
    LIMIT ${MAX_PREPARED_ROWS}`, today, tomorrow);
}

async function loadPreparedRowsAllForSource(env, today, tomorrow, sourceKey) {
  return all(env.SCORE_DB, `SELECT ${preparedSelectColumns()}
    FROM score_board_prepared_current
    WHERE source_key = ?
      AND (
        official_date IN (?, ?)
        OR substr(source_start_time, 1, 10) IN (?, ?)
        OR substr(created_at, 1, 10) IN (?, ?)
      )
    ORDER BY source_event_id, player_name, canonical_prop_key, line_value
    LIMIT 12000`, sourceKey, today, tomorrow, today, tomorrow, today, tomorrow);
}

async function loadCalendarGames(env, gamePks) {
  if (!gamePks.length) return [];
  const out = [];
  const chunkSize = 80;
  for (let i = 0; i < gamePks.length; i += chunkSize) {
    const chunk = gamePks.slice(i, i + chunkSize);
    const ph = chunk.map(() => "?").join(",");
    const rows = await all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, game_time_pt, status_code, abstract_game_state, detailed_state, is_scheduled, is_pregame, is_live, is_final, home_team_id, away_team_id, home_team_name, away_team_name, doubleheader, game_number, venue_name FROM mlb_game_calendar WHERE game_pk IN (${ph})`, ...chunk);
    out.push(...rows);
  }
  return out;
}

async function loadTeamAliases(env) {
  const rows = [];
  try {
    rows.push(...await all(env.REF_DB, "SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name FROM ref_teams WHERE active=1"));
  } catch (_) {}
  const aliases = [];
  try {
    aliases.push(...await all(env.REF_DB, "SELECT team_id, mlb_team_id, alias_value, alias_normalized FROM ref_team_aliases WHERE active=1"));
  } catch (_) {}
  const map = new Map();
  for (const r of rows) {
    const id = Number(r.mlb_team_id);
    for (const v of [r.abbreviation, r.full_name, r.nickname, r.location_name, r.short_name]) {
      const n = normalizeName(v);
      if (n && Number.isFinite(id)) map.set(n, id);
    }
  }
  for (const r of aliases) {
    const id = Number(r.mlb_team_id);
    for (const v of [r.alias_value, r.alias_normalized]) {
      const n = normalizeName(v);
      if (n && Number.isFinite(id)) map.set(n, id);
    }
  }
  map.set("oakland athletics", 133);
  map.set("athletics", 133);
  map.set("a s", 133);
  map.set("la angels", 108);
  map.set("los angeles angels", 108);
  map.set("la dodgers", 119);
  map.set("los angeles dodgers", 119);
  return map;
}

function buildGameMatcher(calendarRows, teamAliasMap) {
  const games = calendarRows.map(g => ({
    ...g,
    game_pk_num: Number(g.game_pk),
    home_id: Number(g.home_team_id),
    away_id: Number(g.away_team_id),
    game_time_ms: parseTime(g.game_time_utc),
    official_date_text: String(g.official_date || "")
  }));
  return function matchEvent(event) {
    const sourceHome = event.home_team || event.homeTeam || event.home || "";
    const sourceAway = event.away_team || event.awayTeam || event.away || "";
    const eventTime = parseTime(event.commence_time || event.start_time || event.startTime || event.game_time);
    const homeNorm = normalizeName(sourceHome);
    const awayNorm = normalizeName(sourceAway);
    const homeId = teamAliasMap.get(homeNorm) || null;
    const awayId = teamAliasMap.get(awayNorm) || null;
    const candidates = [];
    for (const g of games) {
      const delta = minutesBetween(eventTime, g.game_time_ms);
      if (delta === null || delta > TEAM_MATCH_TOLERANCE_MINUTES) continue;
      const exactIds = homeId && awayId && homeId === g.home_id && awayId === g.away_id;
      const reversedIds = homeId && awayId && homeId === g.away_id && awayId === g.home_id;
      const exactNames = normalizeName(g.home_team_name) === homeNorm && normalizeName(g.away_team_name) === awayNorm;
      const reversedNames = normalizeName(g.home_team_name) === awayNorm && normalizeName(g.away_team_name) === homeNorm;
      if (exactIds || exactNames) candidates.push({ game: g, reason: exactIds ? "team_ids_time_match" : "team_names_time_match", confidence: "high", reversed: false, delta_minutes: delta });
      else if (reversedIds || reversedNames) candidates.push({ game: g, reason: reversedIds ? "reversed_team_ids_time_match" : "reversed_team_names_time_match", confidence: "medium", reversed: true, delta_minutes: delta });
    }
    if (candidates.length === 1) {
      return { status: "mapped", game_pk: candidates[0].game.game_pk_num, official_date: candidates[0].game.official_date_text, confidence: candidates[0].confidence, reason: candidates[0].reason, candidate_count: 1, reversed: candidates[0].reversed };
    }
    if (candidates.length > 1) return { status: "ambiguous", game_pk: null, official_date: null, confidence: "none", reason: "multiple_calendar_candidates", candidate_count: candidates.length };
    return { status: "unmapped", game_pk: null, official_date: null, confidence: "none", reason: "no_calendar_candidate", candidate_count: 0 };
  };
}

async function writeIssue(env, batchId, slateWindowKey, officialDate, severity, type, gamePk, preparedRowId, sourceKey, reason, details) {
  await run(env.MARKET_DB, `INSERT INTO market_context_probe_issues (issue_id, batch_id, slate_window_key, official_date, severity, issue_type, game_pk, prepared_row_id, source_key, reason, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    rid("mcp_issue"), batchId, slateWindowKey, officialDate || null, severity, type, gamePk || null, preparedRowId || null, sourceKey || null, safeText(reason, 900), safeJson(details, 6000));
}

async function fetchOddsApiGameOdds(env) {
  if (!sourceHas(env, "ODDS_API_KEY")) return { ok: false, missing_key: true, events: [], external_calls: 0, error: "ODDS_API_KEY missing" };
  const base = String(env.ODDS_API_BASE_URL || "https://api.the-odds-api.com/v4").replace(/\/+$/, "");
  const url = new URL(`${base}/sports/baseball_mlb/odds`);
  url.searchParams.set("apiKey", String(env.ODDS_API_KEY));
  const bookmakerList = String(env.ODDS_API_BOOKMAKERS || "draftkings,fanduel,betmgm,caesars,espnbet,fanatics,bet365").replace(/\s+/g, "");
  if (bookmakerList) url.searchParams.set("bookmakers", bookmakerList);
  else url.searchParams.set("regions", String(env.ODDS_API_REGIONS || "us"));
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  const started = nowUtc();
  try {
    const resp = await fetch(url.toString(), { method: "GET", headers: { "accept": "application/json", "user-agent": "AlphaDog-v2 Market Context Source Probe" } });
    const text = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (err) { return { ok: false, external_calls: 1, http_status: resp.status, parse_error: safeText(err.message), response_preview: safeText(text, 700), events: [], error: "odds_api_json_parse_failed", started_at: started, finished_at: nowUtc() }; }
    if (!resp.ok) return { ok: false, external_calls: 1, http_status: resp.status, events: [], error: "odds_api_http_error", response_preview: safeText(text, 900), started_at: started, finished_at: nowUtc() };
    return { ok: true, external_calls: 1, http_status: resp.status, events: Array.isArray(parsed) ? parsed : [], bookmaker_targets: bookmakerList, endpoint_scope: "strong_sportsbook_reference_game_odds", started_at: started, finished_at: nowUtc() };
  } catch (err) {
    return { ok: false, external_calls: 1, events: [], error: "odds_api_fetch_exception", message: safeText(err && err.message ? err.message : err), started_at: started, finished_at: nowUtc() };
  }
}

function outcomeSide(marketKey, outcomeName, point) {
  const n = normalizeName(outcomeName);
  if (n === "over") return "over";
  if (n === "under") return "under";
  if (marketKey === "spreads") return point !== undefined && point !== null && Number(point) < 0 ? "favorite_spread" : "underdog_spread";
  if (marketKey === "h2h") return "moneyline";
  return n || null;
}

async function writeOddsApiEvidence(env, batchId, slateWindowKey, oddsEvents, matchEvent) {
  let eventRows = 0;
  let mappedEvents = 0;
  let gameOddsRows = 0;
  const normalizedRows = [];
  const mappedGameSet = new Set();
  for (const ev of oddsEvents) {
    const mapping = matchEvent(ev || {});
    eventRows += 1;
    if (mapping.status === "mapped") {
      mappedEvents += 1;
      mappedGameSet.add(String(mapping.game_pk));
    }
    await run(env.MARKET_DB, `INSERT INTO market_context_probe_event_map (probe_row_id, batch_id, slate_window_key, official_date, game_pk, source_key, source_event_id, source_commence_time_utc, source_home_team, source_away_team, mapping_status, mapping_confidence, mapping_reason, candidate_count, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      rid("mcp_event"), batchId, slateWindowKey, mapping.official_date, mapping.game_pk, ODDS_API_SOURCE_KEY, ev.id || null, ev.commence_time || null, ev.home_team || null, ev.away_team || null, mapping.status, mapping.confidence, mapping.reason, mapping.candidate_count, safeJson({ id: ev.id, commence_time: ev.commence_time, home_team: ev.home_team, away_team: ev.away_team }, 3000));
    if (mapping.status !== "mapped") continue;
    const bookmakers = Array.isArray(ev.bookmakers) ? ev.bookmakers : [];
    for (const book of bookmakers) {
      const markets = Array.isArray(book.markets) ? book.markets : [];
      for (const market of markets) {
        const key = String(market.key || "");
        if (!["h2h", "spreads", "totals"].includes(key)) continue;
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
        for (const out of outcomes) {
          const normalizedRow = { official_date: mapping.official_date, game_pk: mapping.game_pk, source_event_id: ev.id || null, source_commence_time_utc: ev.commence_time || null, source_home_team: ev.home_team || null, source_away_team: ev.away_team || null, bookmaker_key: book.key || null, bookmaker_title: book.title || null, market_key: key, market_last_update: market.last_update || null, outcome_name: out.name || null, outcome_side: outcomeSide(key, out.name, out.point), price_american: Number.isFinite(Number(out.price)) ? Number(out.price) : null, point: Number.isFinite(Number(out.point)) ? Number(out.point) : null, mapping_status: mapping.status, mapping_confidence: mapping.confidence };
          normalizedRows.push(normalizedRow);
          await run(env.MARKET_DB, `INSERT INTO market_context_probe_game_odds (probe_row_id, batch_id, slate_window_key, official_date, game_pk, source_key, source_event_id, source_commence_time_utc, source_home_team, source_away_team, bookmaker_key, bookmaker_title, market_key, market_last_update, outcome_name, outcome_side, price_american, point, mapping_status, mapping_confidence, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            rid("mcp_game_odds"), batchId, slateWindowKey, mapping.official_date, mapping.game_pk, ODDS_API_SOURCE_KEY, ev.id || null, ev.commence_time || null, ev.home_team || null, ev.away_team || null, book.key || null, book.title || null, key, market.last_update || null, out.name || null, outcomeSide(key, out.name, out.point), Number.isFinite(Number(out.price)) ? Number(out.price) : null, Number.isFinite(Number(out.point)) ? Number(out.point) : null, mapping.status, mapping.confidence, safeJson({ bookmaker_key: book.key, bookmaker_title: book.title, market_key: key, last_update: market.last_update, outcome: out }, 3000));
          gameOddsRows += 1;
        }
      }
    }
  }
  return { eventRows, mappedEvents, gameOddsRows, mappedGameSet, normalizedRows };
}


function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function round(value, places = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const m = Math.pow(10, places);
  return Math.round(n * m) / m;
}
function median(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}
function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function bestAmerican(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.max(...nums);
}
function americanToImplied(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p === 0) return null;
  return p > 0 ? 100 / (p + 100) : Math.abs(p) / (Math.abs(p) + 100);
}
function devigTwoWay(homePrice, awayPrice) {
  const hp = americanToImplied(homePrice);
  const ap = americanToImplied(awayPrice);
  if (hp === null || ap === null || hp + ap <= 0) return { home: null, away: null };
  return { home: hp / (hp + ap), away: ap / (hp + ap) };
}
function derivedImpliedRuns(totalLine, homeMl, awayMl) {
  const total = Number(totalLine);
  if (!Number.isFinite(total) || total <= 0) return { home: null, away: null, confidence: "NONE" };
  const p = devigTwoWay(homeMl, awayMl);
  if (p.home === null || p.away === null) return { home: round(total / 2, 3), away: round(total / 2, 3), confidence: "LOW_TOTAL_ONLY" };
  const edge = Math.max(-0.32, Math.min(0.32, p.home - 0.5));
  const adjustment = edge * total * 0.42;
  return { home: round((total / 2) + adjustment, 3), away: round((total / 2) - adjustment, 3), confidence: "DERIVED_MEDIUM_HEURISTIC" };
}
function freshnessFromUpdates(updates, nowMs, staleMinutes) {
  const times = updates.map(parseTime).filter(t => t !== null).sort((a, b) => a - b);
  if (!times.length) return { oldest: null, newest: null, status: "UNKNOWN_NO_LAST_UPDATE" };
  const newest = times[times.length - 1];
  const oldest = times[0];
  const ageMin = (nowMs - newest) / 60000;
  return { oldest: new Date(oldest).toISOString(), newest: new Date(newest).toISOString(), status: ageMin > staleMinutes ? "MARKET_STALE" : "MARKET_FRESH" };
}
function sideTeamRole(outcomeName, homeTeam, awayTeam) {
  const n = normalizeName(outcomeName);
  if (n && n === normalizeName(homeTeam)) return "home";
  if (n && n === normalizeName(awayTeam)) return "away";
  return null;
}
function compactPriceList(rows) {
  return rows.map(r => ({ book: r.bookmaker_key, price: r.price_american, point: r.point, side: r.outcome_side })).slice(0, 24);
}

async function writeNormalizedGameMarketMining(env, batchId, slateWindowKey, oddsRows, oddsEvents, matchEvent, bookmakerTargets) {
  const targetBooks = String(bookmakerTargets || "").split(",").map(s => s.trim()).filter(Boolean);
  const targetSet = new Set(targetBooks);
  const nowMs = Date.now();
  const staleMinutes = Number(env.ODDS_API_STALE_MINUTES || 30);
  const byGame = new Map();
  const mappedEvents = [];
  for (const ev of oddsEvents || []) {
    const mapping = matchEvent(ev || {});
    if (mapping.status !== "mapped") continue;
    mappedEvents.push({ ev, mapping });
    const key = String(mapping.game_pk);
    if (!byGame.has(key)) byGame.set(key, { event: ev, mapping, rows: [], present: new Map() });
  }
  for (const r of oddsRows) {
    const key = String(r.game_pk);
    if (!byGame.has(key)) continue;
    const g = byGame.get(key);
    g.rows.push(r);
    const statusKey = `${r.bookmaker_key || ""}|${r.market_key || ""}`;
    if (!g.present.has(statusKey)) g.present.set(statusKey, []);
    g.present.get(statusKey).push(r);
  }
  let statusRows = 0;
  let summaryRows = 0;
  for (const [, g] of byGame) {
    const ev = g.event;
    const rows = g.rows;
    const availableBooks = [...new Set(rows.map(r => r.bookmaker_key).filter(Boolean))];
    const bookLoop = targetBooks.length ? targetBooks : availableBooks;
    for (const book of bookLoop) {
      const title = rows.find(r => r.bookmaker_key === book)?.bookmaker_title || null;
      for (const market of ["h2h", "spreads", "totals"]) {
        const marketRows = rows.filter(r => r.bookmaker_key === book && r.market_key === market);
        const updates = marketRows.map(r => r.market_last_update).filter(Boolean);
        const fresh = freshnessFromUpdates(updates, nowMs, staleMinutes);
        const status = marketRows.length ? "MARKET_PRESENT" : "MARKET_MISSING";
        await run(env.MARKET_DB, `INSERT INTO market_context_probe_book_market_status (status_row_id, batch_id, slate_window_key, official_date, game_pk, source_key, source_event_id, bookmaker_key, bookmaker_title, market_key, market_status, outcome_rows, point_values_json, price_values_json, market_last_update, freshness_status, missing_reason, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          rid("mcp_bm_status"), batchId, slateWindowKey, g.mapping.official_date, g.mapping.game_pk, ODDS_API_SOURCE_KEY, ev.id || null, book, title, market, status, marketRows.length, safeJson([...new Set(marketRows.map(r => r.point).filter(v => v !== null && v !== undefined))], 1200), safeJson(compactPriceList(marketRows), 2200), fresh.newest, fresh.status, marketRows.length ? null : "book_market_not_returned_by_odds_api_payload", safeJson({ source_event_id: ev.id, bookmaker_key: book, market_key: market, outcome_rows: marketRows.length }, 2200));
        statusRows += 1;
      }
    }

    const h2h = rows.filter(r => r.market_key === "h2h");
    const spreads = rows.filter(r => r.market_key === "spreads");
    const totals = rows.filter(r => r.market_key === "totals");
    const homeMlRows = h2h.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "home");
    const awayMlRows = h2h.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "away");
    const homeSpreadRows = spreads.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "home");
    const awaySpreadRows = spreads.filter(r => sideTeamRole(r.outcome_name, ev.home_team, ev.away_team) === "away");
    const overRows = totals.filter(r => r.outcome_side === "over");
    const underRows = totals.filter(r => r.outcome_side === "under");
    const allUpdates = rows.map(r => r.market_last_update).filter(Boolean);
    const fresh = freshnessFromUpdates(allUpdates, nowMs, staleMinutes);
    const homeMlConsensus = round(median(homeMlRows.map(r => r.price_american)), 1);
    const awayMlConsensus = round(median(awayMlRows.map(r => r.price_american)), 1);
    const totalConsensus = round(median(totals.map(r => r.point)), 1);
    const implied = derivedImpliedRuns(totalConsensus, homeMlConsensus, awayMlConsensus);
    const warnings = [];
    const bookCoverageGrade = availableBooks.length >= Math.max(1, targetBooks.length) ? "FULL_TARGET_BOOK_COVERAGE" : (availableBooks.length >= 5 ? "STRONG_PARTIAL_BOOK_COVERAGE" : (availableBooks.length >= 3 ? "PARTIAL_BOOK_COVERAGE" : "BOOK_COVERAGE_THIN"));
    if (!h2h.length) warnings.push("MISSING_MONEYLINE");
    if (!spreads.length) warnings.push("MISSING_RUNLINE");
    if (!totals.length) warnings.push("MISSING_TOTAL");
    if (fresh.status === "MARKET_STALE") warnings.push("MARKET_STALE");
    const homeMlBest = bestAmerican(homeMlRows.map(r => r.price_american));
    const awayMlBest = bestAmerican(awayMlRows.map(r => r.price_american));
    const favHome = homeMlConsensus !== null && awayMlConsensus !== null ? homeMlConsensus < awayMlConsensus : null;
    const favTeam = favHome === null ? null : (favHome ? ev.home_team : ev.away_team);
    const dogTeam = favHome === null ? null : (favHome ? ev.away_team : ev.home_team);
    const favPrice = favHome === null ? null : (favHome ? homeMlConsensus : awayMlConsensus);
    const dogPrice = favHome === null ? null : (favHome ? awayMlConsensus : homeMlConsensus);
    const summary = {
      source_scope: SPORTSBOOK_REFERENCE_SOURCE_SCOPE,
      excluded_sources: ["sleeper", "prizepicks"],
      game_pk: g.mapping.game_pk,
      source_event_id: ev.id || null,
      home_team: ev.home_team || null,
      away_team: ev.away_team || null,
      books_available: availableBooks,
      books_targeted: targetBooks,
      moneyline: { home_consensus: homeMlConsensus, away_consensus: awayMlConsensus, home_best: homeMlBest, away_best: awayMlBest, favorite_team: favTeam, underdog_team: dogTeam },
      runline: { home_point: round(median(homeSpreadRows.map(r => r.point)), 1), away_point: round(median(awaySpreadRows.map(r => r.point)), 1), home_consensus_price: round(median(homeSpreadRows.map(r => r.price_american)), 1), away_consensus_price: round(median(awaySpreadRows.map(r => r.price_american)), 1), home_best_price: bestAmerican(homeSpreadRows.map(r => r.price_american)), away_best_price: bestAmerican(awaySpreadRows.map(r => r.price_american)) },
      total: { consensus_line: totalConsensus, over_consensus_price: round(median(overRows.map(r => r.price_american)), 1), under_consensus_price: round(median(underRows.map(r => r.price_american)), 1), over_best_price: bestAmerican(overRows.map(r => r.price_american)), under_best_price: bestAmerican(underRows.map(r => r.price_american)), min_line: round(Math.min(...totals.map(r => Number(r.point)).filter(Number.isFinite)), 1), max_line: round(Math.max(...totals.map(r => Number(r.point)).filter(Number.isFinite)), 1) },
      implied_runs: { home: implied.home, away: implied.away, method: "DERIVED_FROM_CONSENSUS_TOTAL_AND_DEVIG_CONSENSUS_MONEYLINE_HEURISTIC_NOT_DIRECT_TEAM_TOTAL", confidence: implied.confidence },
      freshness: fresh,
      warnings
    };
    const totalMin = summary.total.min_line;
    const totalMax = summary.total.max_line;
    await run(env.MARKET_DB, `INSERT INTO market_context_probe_game_market_summary (summary_row_id, batch_id, slate_window_key, official_date, game_pk, source_key, source_event_id, source_commence_time_utc, home_team, away_team, book_target_count, book_available_count, book_coverage_grade, freshness_status, oldest_market_update, newest_market_update, h2h_book_count, home_ml_consensus, away_ml_consensus, home_ml_best, away_ml_best, moneyline_favorite_team, moneyline_favorite_price, moneyline_underdog_team, moneyline_underdog_price, runline_book_count, home_runline_point, home_runline_consensus_price, home_runline_best_price, away_runline_point, away_runline_consensus_price, away_runline_best_price, total_book_count, total_consensus_line, over_consensus_price, under_consensus_price, over_best_price, under_best_price, total_line_min, total_line_max, total_line_range, derived_home_implied_runs, derived_away_implied_runs, implied_runs_method, implied_runs_confidence, parse_status, warning_flags, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      rid("mcp_gm_summary"), batchId, slateWindowKey, g.mapping.official_date, g.mapping.game_pk, ODDS_API_SOURCE_KEY, ev.id || null, ev.commence_time || null, ev.home_team || null, ev.away_team || null, targetBooks.length, availableBooks.length, bookCoverageGrade, fresh.status, fresh.oldest, fresh.newest, new Set(h2h.map(r => r.bookmaker_key)).size, homeMlConsensus, awayMlConsensus, homeMlBest, awayMlBest, favTeam, favPrice, dogTeam, dogPrice, new Set(spreads.map(r => r.bookmaker_key)).size, summary.runline.home_point, summary.runline.home_consensus_price, summary.runline.home_best_price, summary.runline.away_point, summary.runline.away_consensus_price, summary.runline.away_best_price, new Set(totals.map(r => r.bookmaker_key)).size, totalConsensus, summary.total.over_consensus_price, summary.total.under_consensus_price, summary.total.over_best_price, summary.total.under_best_price, totalMin, totalMax, (totalMin !== null && totalMax !== null ? round(totalMax - totalMin, 1) : null), implied.home, implied.away, summary.implied_runs.method, implied.confidence, warnings.length ? "PARSED_WITH_WARNINGS" : "PARSED_OK", safeJson(warnings, 1200), safeJson(summary, 6500));
    summaryRows += 1;
  }
  return { statusRows, summaryRows };
}

async function writeCoverage(env, batchId, slateWindowKey, preparedRows, oddsMappedGameSet) {
  let present = 0, missing = 0;
  for (const p of preparedRows) {
    const hasGame = oddsMappedGameSet.has(String(p.official_game_pk));
    const gameStatus = hasGame ? "SPORTSBOOK_GAME_MARKET_CONTEXT_PRESENT" : "MARKET_CONTEXT_MISSING";
    const propStatus = "PLAYER_PROP_REFERENCE_NOT_PROBED_GAME_MARKET_SCOPE";
    const status = hasGame ? "PARTIAL_MARKET_CONTEXT" : "MARKET_CONTEXT_MISSING";
    const grade = hasGame ? "GAME_ONLY_SPORTSBOOK_REFERENCE" : "NONE";
    if (hasGame) present += 1; else missing += 1;
    await run(env.MARKET_DB, `INSERT INTO market_context_probe_coverage (coverage_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key, board_line_value, game_market_status, player_prop_market_status, market_context_status, coverage_grade, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      rid("mcp_cov"), batchId, slateWindowKey, p.official_date, p.prepared_row_id, p.source_key, Number(p.official_game_pk), Number(p.resolved_mlb_player_id), p.canonical_prop_key, Number.isFinite(Number(p.line_value)) ? Number(p.line_value) : null, gameStatus, propStatus, status, grade, safeJson({ odds_api_sportsbook_game_context: hasGame, board_sources_used_as_market_reference: false, sleeper_used: false, prizepicks_used: false, player_prop_reference_probe: "not_in_v0_1_4", no_scoring: true }, 2200));
  }
  return { game_context_present: present, missing, rows: preparedRows.length };
}


async function runMarketSourceProbe(env, input = {}) {
  const startedMs = Date.now();
  const requestId = input.request_id || null;
  const runId = input.run_id || null;
  const today = ptDate(0);
  const tomorrow = ptDate(1);
  const slateWindowKey = `${today}_${tomorrow}`;
  const batchId = rid("market_context_probe_batch");
  let externalCalls = 0;
  let warningCount = 0;
  let blockerCount = 0;
  const retention = { today, tomorrow, slate_window_key: slateWindowKey };

  const required = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const missingDb = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missingDb.length) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "BLOCKED_MISSING_DB_BINDINGS", certification: "MARKET_CONTEXT_SOURCE_PROBE_BLOCKED_MISSING_DB_BINDINGS", missing_db_bindings: missingDb, rows_read: 0, rows_written: 0, external_calls_performed: 0, retention, timestamp_utc: nowUtc() };
  }

  await ensureSchema(env);
  const prune = await pruneProbeWindow(env, today, tomorrow, slateWindowKey);
  const preparedRows = await loadPreparedRows(env, today, tomorrow);
  const gamePks = [...new Set(preparedRows.map(r => Number(r.official_game_pk)).filter(Number.isFinite))];
  const playerIds = [...new Set(preparedRows.map(r => Number(r.resolved_mlb_player_id)).filter(Number.isFinite))];
  const propKeys = [...new Set(preparedRows.map(r => String(r.canonical_prop_key || "")).filter(Boolean))];
  const calendarRows = await loadCalendarGames(env, gamePks);
  const calendarGameSet = new Set(calendarRows.map(r => String(r.game_pk)));
  const missingCalendar = gamePks.filter(g => !calendarGameSet.has(String(g)));

  if (!preparedRows.length) {
    blockerCount += 1;
    await run(env.MARKET_DB, `INSERT INTO market_context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      batchId, requestId, runId, WORKER_NAME, VERSION, "market_source_probe", slateWindowKey, today, tomorrow, "blocked_no_prepared_safe_rows", 0, 0, 0, 0, sourceHas(env, "ODDS_API_KEY") ? 1 : 0, warningCount, blockerCount, "MARKET_CONTEXT_SOURCE_PROBE_NO_PREPARED_SAFE_ROWS", "BLOCKED", safeJson({ retention, prune }));
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, batch_id: batchId, status: "blocked_no_prepared_safe_rows", certification: "MARKET_CONTEXT_SOURCE_PROBE_NO_PREPARED_SAFE_ROWS", certification_grade: "BLOCKED", rows_read: 0, rows_written: 1, external_calls_performed: 0, retention, prune, elapsed_ms: Date.now() - startedMs, timestamp_utc: nowUtc() };
  }

  if (missingCalendar.length) {
    blockerCount += 1;
    await writeIssue(env, batchId, slateWindowKey, today, "BLOCKER", "CALENDAR_ROWS_MISSING_FOR_PREPARED_GAMES", null, null, "team_db", "Prepared safe rows referenced game_pk values not found in TEAM_DB.mlb_game_calendar", { missing_game_pks: missingCalendar });
  }

  const teamAliases = await loadTeamAliases(env);
  const matcher = buildGameMatcher(calendarRows, teamAliases);
  const odds = await fetchOddsApiGameOdds(env);
  externalCalls += odds.external_calls || 0;
  if (!odds.ok) {
    if (odds.missing_key) blockerCount += 1; else warningCount += 1;
    await writeIssue(env, batchId, slateWindowKey, today, odds.missing_key ? "BLOCKER" : "WARNING", odds.missing_key ? "ODDS_API_KEY_MISSING" : "ODDS_API_GAME_ODDS_FETCH_FAILED", null, null, ODDS_API_SOURCE_KEY, odds.error || "Odds API game odds fetch failed", odds);
  }
  const oddsWrite = odds.ok ? await writeOddsApiEvidence(env, batchId, slateWindowKey, odds.events, matcher) : { eventRows: 0, mappedEvents: 0, gameOddsRows: 0, mappedGameSet: new Set() };
  if (odds.ok && oddsWrite.mappedEvents === 0) {
    blockerCount += 1;
    await writeIssue(env, batchId, slateWindowKey, today, "BLOCKER", "ODDS_API_EVENTS_UNMAPPED", null, null, ODDS_API_SOURCE_KEY, "Odds API returned events but none mapped to prepared game_pk values", { odds_api_events_seen: oddsWrite.eventRows, prepared_game_pks: gamePks });
  }
  if (odds.ok && oddsWrite.mappedEvents < gamePks.length) {
    warningCount += 1;
    await writeIssue(env, batchId, slateWindowKey, today, "WARNING", "PARTIAL_ODDS_API_GAME_EVENT_MAPPING", null, null, ODDS_API_SOURCE_KEY, "Not every prepared game had mapped Odds API event context", { prepared_games_checked: gamePks.length, odds_api_events_mapped: oddsWrite.mappedEvents });
  }

  const normalizedMining = odds.ok ? await writeNormalizedGameMarketMining(env, batchId, slateWindowKey, oddsWrite.normalizedRows || [], odds.events || [], matcher, odds.bookmaker_targets || "") : { statusRows: 0, summaryRows: 0 };

  const boardSourceProbe = {
    sleeper_used: false,
    prizepicks_used: false,
    parlay_api_called: false,
    parlay_inventory_rows_seen: 0,
    parlay_props_mapped_to_prepared: 0,
    parlay_coverage_grade: "NOT_PROBED_BOARD_SOURCE_EXCLUDED",
    reason: "v0.1.4 is sportsbook-reference-only. Sleeper and PrizePicks are user board/source inventory and are not valid external reference books for Market Context."
  };
  const coverage = await writeCoverage(env, batchId, slateWindowKey, preparedRows, oddsWrite.mappedGameSet);

  const certificationGrade = blockerCount > 0 ? "BLOCKED" : (warningCount > 0 ? "PASS_WITH_WARNINGS" : "PASS");
  const certification = blockerCount > 0 ? "MARKET_CONTEXT_SOURCE_PROBE_BLOCKED_STRUCTURAL" : "MARKET_CONTEXT_SOURCE_PROBE_EVIDENCE_WRITTEN";
  const status = blockerCount > 0 ? "completed_blocked_structural" : "completed_probe_evidence_written";
  const rowsWritten = 1 + oddsWrite.eventRows + oddsWrite.gameOddsRows + normalizedMining.statusRows + normalizedMining.summaryRows + coverage.rows + warningCount + blockerCount;
  const output = {
    retention,
    prune,
    prepared_rows_read: preparedRows.length,
    prepared_games_checked: gamePks.length,
    prepared_players_checked: playerIds.length,
    prepared_prop_keys_checked: propKeys.length,
    calendar_games_loaded: calendarRows.length,
    odds_api: { config_present: sourceHas(env, "ODDS_API_KEY"), fetch_ok: odds.ok, http_status: odds.http_status || null, events_seen: oddsWrite.eventRows, events_mapped: oddsWrite.mappedEvents, game_odds_rows_written: oddsWrite.gameOddsRows, book_market_status_rows_written: normalizedMining.statusRows, game_market_summary_rows_written: normalizedMining.summaryRows, endpoint_mode: "baseball_mlb_odds_h2h_spreads_totals", bookmaker_targets: odds.bookmaker_targets || null, source_scope: "strong_sportsbook_reference_only", mined_scope: ["moneyline_home_away", "runline_home_away", "game_total_over_under", "book_coverage", "market_freshness", "derived_implied_team_runs"] },
    board_sources: { sleeper_used: false, prizepicks_used: false, parlay_api_called: false, purpose: "excluded_from_market_context_reference", reason: "Market Context now uses strong sportsbook reference books from Odds API only; board sources are not reference books." },
    coverage,
    boundaries: { market_current_lines_writes: 0, score_board_prepared_current_mutation: false, scoring: false, ranking: false, final_board: false, matrix_builder: false },
    odds_api_player_props_next: "PROBE_ODDS_API_EVENT_LEVEL_PLAYER_PROPS_FROM_STRONG_SPORTSBOOKS_ONLY"
  };

  await run(env.MARKET_DB, `INSERT INTO market_context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, odds_api_events_seen, odds_api_events_mapped, odds_api_game_odds_rows, parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, parlay_coverage_grade, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, requestId, runId, WORKER_NAME, VERSION, "market_source_probe", slateWindowKey, today, tomorrow, status, preparedRows.length, gamePks.length, playerIds.length, propKeys.length, sourceHas(env, "ODDS_API_KEY") ? 1 : 0, oddsWrite.eventRows, oddsWrite.mappedEvents, oddsWrite.gameOddsRows, 0, 0, "NOT_PROBED_BOARD_SOURCE_EXCLUDED", warningCount, blockerCount, certification, certificationGrade, safeJson(output, 9000));

  return {
    ok: true,
    data_ok: blockerCount === 0,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    run_id: runId,
    batch_id: batchId,
    mode: "market_source_probe",
    status,
    certification,
    certification_grade: certificationGrade,
    rows_read: preparedRows.length,
    rows_written: rowsWritten,
    external_calls_performed: externalCalls,
    prepared_rows_read: preparedRows.length,
    prepared_games_checked: gamePks.length,
    odds_api_events_seen: oddsWrite.eventRows,
    odds_api_events_mapped: oddsWrite.mappedEvents,
    odds_api_game_odds_rows: oddsWrite.gameOddsRows,
    odds_api_book_market_status_rows: normalizedMining.statusRows,
    odds_api_game_market_summary_rows: normalizedMining.summaryRows,
    parlay_inventory_rows_seen: 0,
    parlay_props_mapped_to_prepared: 0,
    parlay_source_rows_mapped_to_prepared_safe: 0,
    parlay_source_rows_mapped_to_prepared_blocked: 0,
    parlay_source_rows_no_prepared_match: 0,
    parlay_source_rows_ambiguous: 0,
    parlay_coverage_grade: "NOT_PROBED_BOARD_SOURCE_EXCLUDED",
    warning_count: warningCount,
    blocker_count: blockerCount,
    retention,
    output_json: output,
    elapsed_ms: Date.now() - startedMs,
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
      try { schema = await schemaStatus(env); } catch (err) { schema = { error: safeText(err && err.message ? err.message : err, 900) }; }
      return jsonResponse({ ...baseIdentity(env), route: "/health", schema, today: ptDate(0), tomorrow: ptDate(1), safe_secret_note: "Secret values are never printed; only presence is reported." });
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      let schema = null;
      try { schema = await schemaStatus(env); } catch (err) { schema = { error: safeText(err && err.message ? err.message : err, 900) }; }
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, mode: input.mode || null }, schema, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await runMarketSourceProbe(env, input);
      return jsonResponse(output, 200);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
