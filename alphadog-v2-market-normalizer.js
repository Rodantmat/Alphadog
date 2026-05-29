const WORKER_NAME = "alphadog-v2-market-normalizer";
const VERSION = "alphadog-v2-market-normalizer-v0.1.2-score-prep-identity-join";
const JOB_KEY = "market-normalizer";
const PHASE_KEY = "market_context_source_probe";
const ODDS_API_SOURCE_KEY = "odds_api";
const PARLAY_INVENTORY_SOURCE_KEY = "parlay_sleeper";
const MAX_PREPARED_ROWS = 9000;
const TEAM_MATCH_TOLERANCE_MINUTES = 25;

const REQUIRED_DB_BINDINGS = ["MARKET_DB", "SCORE_DB", "TEAM_DB", "REF_DB", "CONTROL_DB"];
const OPTIONAL_DB_BINDINGS = ["CONFIG_DB"];
const EXPECTED_SECRETS = ["ODDS_API_KEY", "PARLAY_API_KEY"];

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
    slot_note: "Existing market-normalizer worker slot is used as the v0.1 Market Context Source Probe shell to avoid global manifest/deploy-script churn.",
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
      retention: "today_tomorrow_only_probe_tables"
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
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_batches_window ON market_context_probe_batches(slate_window_key)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_event_map_batch ON market_context_probe_event_map(batch_id, game_pk)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_game_odds_batch_game ON market_context_probe_game_odds(batch_id, game_pk)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_player_props_batch_prepared ON market_context_probe_player_props(batch_id, prepared_row_id)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_coverage_batch_prepared ON market_context_probe_coverage(batch_id, prepared_row_id)");
  await run(env.MARKET_DB, "CREATE INDEX IF NOT EXISTS idx_mcp_issues_batch ON market_context_probe_issues(batch_id)");
}

async function pruneProbeWindow(env, today, tomorrow, slateWindowKey) {
  const tables = [
    "market_context_probe_game_odds",
    "market_context_probe_player_props",
    "market_context_probe_event_map",
    "market_context_probe_coverage",
    "market_context_probe_issues"
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
    "market_context_probe_issues"
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
  url.searchParams.set("regions", "us");
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
    return { ok: true, external_calls: 1, http_status: resp.status, events: Array.isArray(parsed) ? parsed : [], started_at: started, finished_at: nowUtc() };
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
          await run(env.MARKET_DB, `INSERT INTO market_context_probe_game_odds (probe_row_id, batch_id, slate_window_key, official_date, game_pk, source_key, source_event_id, source_commence_time_utc, source_home_team, source_away_team, bookmaker_key, bookmaker_title, market_key, market_last_update, outcome_name, outcome_side, price_american, point, mapping_status, mapping_confidence, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            rid("mcp_game_odds"), batchId, slateWindowKey, mapping.official_date, mapping.game_pk, ODDS_API_SOURCE_KEY, ev.id || null, ev.commence_time || null, ev.home_team || null, ev.away_team || null, book.key || null, book.title || null, key, market.last_update || null, out.name || null, outcomeSide(key, out.name, out.point), Number.isFinite(Number(out.price)) ? Number(out.price) : null, Number.isFinite(Number(out.point)) ? Number(out.point) : null, mapping.status, mapping.confidence, safeJson({ bookmaker_key: book.key, bookmaker_title: book.title, market_key: key, last_update: market.last_update, outcome: out }, 3000));
          gameOddsRows += 1;
        }
      }
    }
  }
  return { eventRows, mappedEvents, gameOddsRows, mappedGameSet };
}

async function loadParlayInventory(env, today, tomorrow) {
  try {
    return await all(env.MARKET_DB, `SELECT current_row_id, batch_id, source_key, slate_date, source_event_id, source_line_id, source_player_id, player_name, team, opponent, league, sport, source_stat_name, canonical_prop_key, line_value, side, price, decimal_price, is_pickable, start_time, raw_line_json, row_payload_json FROM sleeper_board_current WHERE slate_date IN (?, ?) ORDER BY start_time, player_name, canonical_prop_key LIMIT 10000`, today, tomorrow);
  } catch (err) {
    return { __error: safeText(err && err.message ? err.message : err, 700) };
  }
}

function lineKeyValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 1000) / 1000);
}
function isPreparedSafe(p) {
  return p && Number(p.pickable_safe) === 1 && p.matchup_status === "calendar_matched" && p.player_match_status === "matched" && p.official_game_pk !== null && p.official_game_pk !== undefined && p.official_game_time_utc;
}
function addToIndex(map, key, row) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}
function choosePreparedCandidate(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return { row: null, ambiguous: false };
  const safe = candidates.filter(isPreparedSafe);
  if (safe.length === 1) return { row: safe[0], ambiguous: false };
  if (candidates.length === 1) return { row: candidates[0], ambiguous: false };
  const matched = candidates.filter(x => x.matchup_status === "calendar_matched" && x.player_match_status === "matched");
  if (matched.length === 1) return { row: matched[0], ambiguous: false };
  return { row: null, ambiguous: true, count: candidates.length, safe_count: safe.length, matched_count: matched.length };
}

function buildPreparedIndexes(preparedRows) {
  const bySourceRow = new Map();
  const bySourceEventPlayerPropLine = new Map();
  const safeByIdentityPropLine = new Map();
  for (const p of preparedRows) {
    const sourceKey = String(p.source_key || "");
    const name = normalizeName(p.player_name || p.player_name_normalized);
    const prop = normalizeProp(p.canonical_prop_key);
    const line = lineKeyValue(p.line_value);
    const event = String(p.source_event_id || "");
    const game = String(p.official_game_pk || "");
    const player = String(p.resolved_mlb_player_id || "");
    if (sourceKey === "sleeper") {
      addToIndex(bySourceRow, p.source_row_id ? String(p.source_row_id) : "", p);
      addToIndex(bySourceEventPlayerPropLine, `${event}|${name}|${prop}|${line}`, p);
      addToIndex(bySourceEventPlayerPropLine, `${event}|${name}|${prop}|`, p);
    }
    if (isPreparedSafe(p)) {
      addToIndex(safeByIdentityPropLine, `${game}|${player}|${prop}|${line}`, p);
      addToIndex(safeByIdentityPropLine, `${game}|${player}|${prop}|`, p);
    }
  }
  return { bySourceRow, bySourceEventPlayerPropLine, safeByIdentityPropLine };
}

async function writeParlayInventoryEvidence(env, batchId, slateWindowKey, today, tomorrow, safePreparedRows, allSleeperPreparedRows) {
  const inv = await loadParlayInventory(env, today, tomorrow);
  if (inv && inv.__error) {
    await writeIssue(env, batchId, slateWindowKey, null, "WARNING", "PARLAY_INVENTORY_READ_FAILED", null, null, PARLAY_INVENTORY_SOURCE_KEY, "Could not read sleeper_board_current as Parlay inventory source", inv);
    return { rowsSeen: 0, mappedSafeRows: 0, mappedBlockedRows: 0, noPreparedMatchRows: 0, ambiguousRows: 0, coveredSafePreparedSet: new Set(), readError: inv.__error };
  }
  const preparedIndex = buildPreparedIndexes([...safePreparedRows, ...allSleeperPreparedRows]);
  const coveredSafePreparedSet = new Set();
  let mappedSafeRows = 0;
  let mappedBlockedRows = 0;
  let noPreparedMatchRows = 0;
  let ambiguousRows = 0;
  let exactSourceRowMatches = 0;
  let compositeMatches = 0;
  let safeCoverageLinks = 0;

  for (const row of inv) {
    const prop = normalizeProp(row.canonical_prop_key || row.source_stat_name);
    const name = normalizeName(row.player_name);
    const line = lineKeyValue(row.line_value);
    const event = String(row.source_event_id || "");
    const exactCandidates = [
      ...(preparedIndex.bySourceRow.get(String(row.source_line_id || "")) || []),
      ...(preparedIndex.bySourceRow.get(String(row.current_row_id || "")) || [])
    ];
    let chosen = choosePreparedCandidate(exactCandidates);
    let matchPath = chosen.row ? "prepared_source_row_exact" : "none";
    if (chosen.ambiguous) {
      ambiguousRows += 1;
      matchPath = "prepared_source_row_ambiguous";
    }
    if (!chosen.row && !chosen.ambiguous) {
      const compositeCandidates = preparedIndex.bySourceEventPlayerPropLine.get(`${event}|${name}|${prop}|${line}`) || [];
      chosen = choosePreparedCandidate(compositeCandidates);
      if (chosen.row) matchPath = "prepared_event_player_prop_line_composite";
      else if (chosen.ambiguous) { ambiguousRows += 1; matchPath = "prepared_event_player_prop_line_ambiguous"; }
    }
    if (!chosen.row && !chosen.ambiguous) {
      const compositeCandidatesNoLine = preparedIndex.bySourceEventPlayerPropLine.get(`${event}|${name}|${prop}|`) || [];
      chosen = choosePreparedCandidate(compositeCandidatesNoLine);
      if (chosen.row) matchPath = "prepared_event_player_prop_composite_no_line";
      else if (chosen.ambiguous) { ambiguousRows += 1; matchPath = "prepared_event_player_prop_ambiguous_no_line"; }
    }

    const prepared = chosen.row || null;
    if (prepared && matchPath === "prepared_source_row_exact") exactSourceRowMatches += 1;
    if (prepared && matchPath.startsWith("prepared_event_player_prop")) compositeMatches += 1;

    const preparedSafe = prepared && isPreparedSafe(prepared);
    if (preparedSafe) mappedSafeRows += 1;
    else if (prepared) mappedBlockedRows += 1;
    else if (!chosen.ambiguous) noPreparedMatchRows += 1;

    const officialDate = prepared ? prepared.official_date : (row.slate_date || null);
    const gamePk = prepared && prepared.official_game_pk !== null && prepared.official_game_pk !== undefined ? Number(prepared.official_game_pk) : null;
    const resolvedMlbPlayerId = prepared && prepared.resolved_mlb_player_id !== null && prepared.resolved_mlb_player_id !== undefined ? Number(prepared.resolved_mlb_player_id) : null;
    const safeMatches = (gamePk && resolvedMlbPlayerId && prop) ? (preparedIndex.safeByIdentityPropLine.get(`${gamePk}|${resolvedMlbPlayerId}|${prop}|${line}`) || []) : [];
    const safeMatchesNoLine = (!safeMatches.length && gamePk && resolvedMlbPlayerId && prop) ? (preparedIndex.safeByIdentityPropLine.get(`${gamePk}|${resolvedMlbPlayerId}|${prop}|`) || []) : [];
    const contextSafeMatches = safeMatches.length ? safeMatches : safeMatchesNoLine;
    for (const sp of contextSafeMatches) {
      coveredSafePreparedSet.add(String(sp.prepared_row_id));
      safeCoverageLinks += 1;
    }

    let mappingStatus = "parlay_prop_no_prepared_match";
    let coverageStatus = "PARLAY_PROP_NO_PREPARED_MATCH";
    if (chosen.ambiguous && !prepared) {
      mappingStatus = "parlay_prop_ambiguous_prepared_match";
      coverageStatus = "PARLAY_PROP_AMBIGUOUS_PREPARED_MATCH";
    } else if (preparedSafe) {
      mappingStatus = "mapped_to_prepared_safe_row";
      coverageStatus = "PARLAY_PROP_MATCHED_PREPARED_SAFE_ROW";
    } else if (prepared) {
      mappingStatus = "mapped_to_prepared_blocked_row";
      coverageStatus = "PARLAY_PROP_MATCHED_PREPARED_BLOCKED_ROW";
    }

    await run(env.MARKET_DB, `INSERT INTO market_context_probe_player_props (probe_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, source_event_id, source_line_id, game_pk, resolved_mlb_player_id, source_player_name, canonical_prop_key, source_market_key, line_value, price_american, price_decimal, outcome_side, mapping_status, coverage_status, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      rid("mcp_prop"), batchId, slateWindowKey, officialDate, prepared ? prepared.prepared_row_id : null, PARLAY_INVENTORY_SOURCE_KEY, row.source_event_id || null, row.source_line_id || row.current_row_id || null, gamePk, resolvedMlbPlayerId, row.player_name || null, row.canonical_prop_key || null, row.source_stat_name || null, Number.isFinite(Number(row.line_value)) ? Number(row.line_value) : null, Number.isFinite(Number(row.price)) ? Number(row.price) : null, Number.isFinite(Number(row.decimal_price)) ? Number(row.decimal_price) : null, row.side || null, mappingStatus, coverageStatus, safeJson({ ...row, market_context_mapping_audit: { match_path: matchPath, prepared_pickable_safe: prepared ? Number(prepared.pickable_safe) : null, prepared_matchup_status: prepared ? prepared.matchup_status : null, prepared_player_match_status: prepared ? prepared.player_match_status : null, prepared_block_reason: prepared ? prepared.block_reason : null, same_identity_safe_prepared_rows_covered: contextSafeMatches.length } }, 6500));
  }
  return { rowsSeen: inv.length, mappedSafeRows, mappedBlockedRows, noPreparedMatchRows, ambiguousRows, exactSourceRowMatches, compositeMatches, safeCoverageLinks, coveredSafePreparedSet };
}

function coverageGrade(pct) {
  if (pct <= 0) return "NONE";
  if (pct < 35) return "THIN";
  if (pct < 75) return "PARTIAL";
  return "STRONG";
}

async function writeCoverage(env, batchId, slateWindowKey, preparedRows, oddsMappedGameSet, parlayPreparedSet) {
  let full = 0, partial = 0, missing = 0;
  for (const p of preparedRows) {
    const hasGame = oddsMappedGameSet.has(String(p.official_game_pk));
    const hasProp = parlayPreparedSet.has(String(p.prepared_row_id));
    const gameStatus = hasGame ? "GAME_MARKET_CONTEXT_PRESENT" : "MARKET_CONTEXT_MISSING";
    const propStatus = hasProp ? "PLAYER_PROP_MARKET_PRESENT" : "PLAYER_PROP_NOT_AVAILABLE";
    let status = "MARKET_CONTEXT_MISSING";
    let grade = "NONE";
    if (hasGame && hasProp) { status = "FULL_MARKET_CONTEXT"; grade = "STRONG"; full += 1; }
    else if (hasGame || hasProp) { status = "PARTIAL_MARKET_CONTEXT"; grade = hasGame ? "GAME_ONLY" : "PROP_ONLY"; partial += 1; }
    else { missing += 1; }
    await run(env.MARKET_DB, `INSERT INTO market_context_probe_coverage (coverage_row_id, batch_id, slate_window_key, official_date, prepared_row_id, source_key, game_pk, resolved_mlb_player_id, canonical_prop_key, board_line_value, game_market_status, player_prop_market_status, market_context_status, coverage_grade, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      rid("mcp_cov"), batchId, slateWindowKey, p.official_date, p.prepared_row_id, p.source_key, Number(p.official_game_pk), Number(p.resolved_mlb_player_id), p.canonical_prop_key, Number.isFinite(Number(p.line_value)) ? Number(p.line_value) : null, gameStatus, propStatus, status, grade, safeJson({ odds_api_game_context: hasGame, parlay_inventory_prop_context: hasProp, no_scoring: true }, 2000));
  }
  return { full, partial, missing, rows: preparedRows.length };
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
  const allSleeperPreparedRows = await loadPreparedRowsAllForSource(env, today, tomorrow, "sleeper");
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

  const parlay = await writeParlayInventoryEvidence(env, batchId, slateWindowKey, today, tomorrow, preparedRows, allSleeperPreparedRows);
  if (parlay.readError) warningCount += 1;
  const parlayPct = preparedRows.length ? (parlay.coveredSafePreparedSet.size / preparedRows.length) * 100 : 0;
  const parlayGrade = parlay.readError ? "SCHEMA_FAIL" : coverageGrade(parlayPct);
  if (["NONE", "THIN"].includes(parlayGrade)) warningCount += 1;
  const coverage = await writeCoverage(env, batchId, slateWindowKey, preparedRows, oddsWrite.mappedGameSet, parlay.coveredSafePreparedSet);

  const certificationGrade = blockerCount > 0 ? "BLOCKED" : (warningCount > 0 ? "PASS_WITH_WARNINGS" : "PASS");
  const certification = blockerCount > 0 ? "MARKET_CONTEXT_SOURCE_PROBE_BLOCKED_STRUCTURAL" : "MARKET_CONTEXT_SOURCE_PROBE_EVIDENCE_WRITTEN";
  const status = blockerCount > 0 ? "completed_blocked_structural" : "completed_probe_evidence_written";
  const rowsWritten = 1 + oddsWrite.eventRows + oddsWrite.gameOddsRows + parlay.rowsSeen + coverage.rows + warningCount + blockerCount;
  const output = {
    retention,
    prune,
    prepared_rows_read: preparedRows.length,
    prepared_games_checked: gamePks.length,
    prepared_players_checked: playerIds.length,
    prepared_prop_keys_checked: propKeys.length,
    calendar_games_loaded: calendarRows.length,
    odds_api: { config_present: sourceHas(env, "ODDS_API_KEY"), fetch_ok: odds.ok, http_status: odds.http_status || null, events_seen: oddsWrite.eventRows, events_mapped: oddsWrite.mappedEvents, game_odds_rows_written: oddsWrite.gameOddsRows, endpoint_mode: "baseball_mlb_odds_h2h_spreads_totals" },
    parlay_inventory: { source: "MARKET_DB.sleeper_board_current", coverage_test_only: true, direct_parlay_api_called: false, rows_seen: parlay.rowsSeen, source_rows_mapped_to_prepared_safe: parlay.mappedSafeRows, source_rows_mapped_to_prepared_blocked: parlay.mappedBlockedRows, source_rows_no_prepared_match: parlay.noPreparedMatchRows, source_rows_ambiguous: parlay.ambiguousRows, exact_source_row_matches: parlay.exactSourceRowMatches, composite_matches: parlay.compositeMatches, safe_prepared_rows_covered: parlay.coveredSafePreparedSet.size, safe_coverage_links: parlay.safeCoverageLinks, all_sleeper_prepared_rows_loaded: allSleeperPreparedRows.length, coverage_pct: Number(parlayPct.toFixed(2)), grade: parlayGrade, note: "v0.1.2 reuses Score Prep identity instead of remapping raw Sleeper rows from scratch; sportsbook-grade prop source is not locked." },
    coverage,
    boundaries: { market_current_lines_writes: 0, score_board_prepared_current_mutation: false, scoring: false, ranking: false, final_board: false, matrix_builder: false },
    odds_api_player_props_next: parlayGrade === "STRONG" ? "COMPARE_ODDS_API_PLAYER_PROPS_BEFORE_LOCKING_SOURCE" : "AFTER_PARLAY_MAPPING_AUDIT_DECIDE_WHETHER_TO_PROBE_ODDS_API_EVENT_LEVEL_PLAYER_PROPS"
  };

  await run(env.MARKET_DB, `INSERT INTO market_context_probe_batches (batch_id, request_id, run_id, worker_name, worker_version, mode, slate_window_key, window_start_date, window_end_date, status, prepared_rows_read, prepared_games_checked, prepared_players_checked, prepared_prop_keys_checked, odds_api_config_present, odds_api_events_seen, odds_api_events_mapped, odds_api_game_odds_rows, parlay_inventory_rows_seen, parlay_props_mapped_to_prepared, parlay_coverage_grade, warning_count, blocker_count, certification_status, certification_grade, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, requestId, runId, WORKER_NAME, VERSION, "market_source_probe", slateWindowKey, today, tomorrow, status, preparedRows.length, gamePks.length, playerIds.length, propKeys.length, sourceHas(env, "ODDS_API_KEY") ? 1 : 0, oddsWrite.eventRows, oddsWrite.mappedEvents, oddsWrite.gameOddsRows, parlay.rowsSeen, parlay.coveredSafePreparedSet.size, parlayGrade, warningCount, blockerCount, certification, certificationGrade, safeJson(output, 9000));

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
    parlay_inventory_rows_seen: parlay.rowsSeen,
    parlay_props_mapped_to_prepared: parlay.coveredSafePreparedSet.size,
    parlay_source_rows_mapped_to_prepared_safe: parlay.mappedSafeRows,
    parlay_source_rows_mapped_to_prepared_blocked: parlay.mappedBlockedRows,
    parlay_source_rows_no_prepared_match: parlay.noPreparedMatchRows,
    parlay_source_rows_ambiguous: parlay.ambiguousRows,
    parlay_coverage_grade: parlayGrade,
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
