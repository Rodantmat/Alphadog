const WORKER_NAME = "alphadog-v2-phase2b-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-prop-matrix-builder";
const JOB_KEY = "prop-matrix-builder";
const SYSTEM_VERSION = "alphadog-v2-prop-matrix-builder-v0.1.0-internal-matrix-certifier";
const DEPLOYED_SLOT_VERSION = "alphadog-v2-phase2b-certifier-v0.2.0-prop-matrix-builder";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "SCORE_DB"];

const HITTER_PROPS = new Set([
  "hits", "total_bases", "runs", "rbis", "singles", "doubles", "home_runs", "walks",
  "hitter_strikeouts", "hits_runs_rbis", "stolen_bases", "fantasy", "fantasy_score"
]);
const PITCHER_PROPS = new Set([
  "pitcher_strikeouts", "pitcher_outs", "pitching_outs", "earned_runs", "earned_runs_allowed",
  "hits_allowed", "walks_allowed"
]);
const DEFERRED_PROPS = new Set(["rfi_nrfi", "pitcher_strikeouts_combo"]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function nowIso() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJsonParse(s, fallback = null) { try { return s ? JSON.parse(s) : fallback; } catch (_) { return fallback; } }
function dateOnly(d) { return d.toISOString().slice(0, 10); }
function ptTodayTomorrow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const m = {}; for (const p of parts) m[p.type] = p.value;
  const today = `${m.year}-${m.month}-${m.day}`;
  const t = new Date(`${today}T12:00:00-07:00`);
  t.setDate(t.getDate() + 1);
  return [today, dateOnly(t)];
}
function reqDb(env) {
  const out = {};
  for (const k of REQUIRED_DB_BINDINGS) out[k] = !!env[k];
  return out;
}
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function key(...parts) { return parts.map(v => v === null || v === undefined ? "" : String(v)).join("|"); }
function pushMapArray(map, k, row) { if (!map.has(k)) map.set(k, []); map.get(k).push(row); }
function latestBy(rows, keyFn, dateField = "updated_at") {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const prev = m.get(k);
    if (!prev || String(r[dateField] || r.created_at || "") >= String(prev[dateField] || prev.created_at || "")) m.set(k, r);
  }
  return m;
}
async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res && res.results ? res.results : [];
}
async function first(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).first() : await stmt.first();
}
async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}
async function batch(db, statements, size = 40) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}
function classifyProp(propKey, sourcePropName) {
  const keyLc = String(propKey || "").toLowerCase();
  const sourceName = String(sourcePropName || "").toLowerCase();
  if (DEFERRED_PROPS.has(keyLc)) return { family: "deferred", normalized_lane: keyLc, supported: false, reason: "PROP_DEFERRED_PENDING_SEPARATE_DESIGN" };
  if (keyLc === "fantasy" && sourceName.includes("hitter")) return { family: "hitter", normalized_lane: "hitter_fantasy", supported: true };
  if (HITTER_PROPS.has(keyLc)) return { family: "hitter", normalized_lane: keyLc === "fantasy_score" ? "hitter_fantasy" : keyLc, supported: true };
  if (PITCHER_PROPS.has(keyLc)) {
    const lane = keyLc === "pitching_outs" ? "pitcher_outs" : (keyLc === "earned_runs_allowed" ? "earned_runs" : keyLc);
    return { family: "pitcher", normalized_lane: lane, supported: true };
  }
  return { family: "unknown", normalized_lane: keyLc || null, supported: false, reason: "UNSUPPORTED_PROP_KEY_PENDING_FACTOR_DESIGN" };
}
function isStale(batch, preparedMaxUpdatedAt) {
  if (!batch || !preparedMaxUpdatedAt) return true;
  return String(batch.updated_at || batch.created_at || "") < String(preparedMaxUpdatedAt || "");
}
function compactMarketPropRows(rows) {
  if (!rows || !rows.length) return { row_count: 0, present: false };
  const nums = rows.map(r => Number(r.price_american)).filter(n => Number.isFinite(n));
  const lines = rows.map(r => Number(r.line_value)).filter(n => Number.isFinite(n));
  return {
    row_count: rows.length,
    present: true,
    source_keys: [...new Set(rows.map(r => r.source_key).filter(Boolean))].slice(0, 12),
    source_markets: [...new Set(rows.map(r => r.source_market_key).filter(Boolean))].slice(0, 12),
    outcome_sides: [...new Set(rows.map(r => r.outcome_side).filter(Boolean))].slice(0, 8),
    min_line_value: lines.length ? Math.min(...lines) : null,
    max_line_value: lines.length ? Math.max(...lines) : null,
    min_price_american: nums.length ? Math.min(...nums) : null,
    max_price_american: nums.length ? Math.max(...nums) : null
  };
}
function cleanGameMarket(row) {
  if (!row) return null;
  return {
    game_pk: row.game_pk,
    batch_id: row.batch_id,
    book_coverage_grade: row.book_coverage_grade,
    freshness_status: row.freshness_status,
    h2h_book_count: row.h2h_book_count,
    runline_book_count: row.runline_book_count,
    total_book_count: row.total_book_count,
    home_ml_consensus: row.home_ml_consensus,
    away_ml_consensus: row.away_ml_consensus,
    home_runline_point: row.home_runline_point,
    away_runline_point: row.away_runline_point,
    total_consensus_line: row.total_consensus_line,
    derived_home_implied_runs: row.derived_home_implied_runs,
    derived_away_implied_runs: row.derived_away_implied_runs,
    implied_runs_method: row.implied_runs_method,
    parse_status: row.parse_status,
    warning_flags: row.warning_flags
  };
}

async function ensureSchema(env) {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS prop_matrix_batches (
      batch_id TEXT PRIMARY KEY,
      request_id TEXT,
      run_id TEXT,
      worker_name TEXT,
      worker_version TEXT,
      deployed_worker_slot TEXT,
      deployed_slot_version TEXT,
      mode TEXT,
      status TEXT,
      window_start TEXT,
      window_end TEXT,
      prepared_rows_read INTEGER DEFAULT 0,
      eligible_rows INTEGER DEFAULT 0,
      matrix_rows_written INTEGER DEFAULT 0,
      matrix_ready_rows INTEGER DEFAULT 0,
      matrix_ready_with_warnings_rows INTEGER DEFAULT 0,
      matrix_partial_context_rows INTEGER DEFAULT 0,
      matrix_blocked_rows INTEGER DEFAULT 0,
      matrix_deferred_rows INTEGER DEFAULT 0,
      issue_rows INTEGER DEFAULT 0,
      warning_rows INTEGER DEFAULT 0,
      blocker_rows INTEGER DEFAULT 0,
      missing_component_rows INTEGER DEFAULT 0,
      source_tables_checked_json TEXT,
      prerequisite_freshness_json TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_matrix_current (
      matrix_id TEXT PRIMARY KEY,
      batch_id TEXT,
      prepared_row_id TEXT,
      source_line_id TEXT,
      source_key TEXT,
      game_pk INTEGER,
      official_date TEXT,
      official_game_time_utc TEXT,
      mlb_player_id INTEGER,
      player_name TEXT,
      team_id TEXT,
      opponent_team_id TEXT,
      is_home INTEGER,
      canonical_prop_key TEXT,
      board_line_value REAL,
      prop_side TEXT,
      factor_family TEXT,
      factor_packet_id TEXT,
      factor_status TEXT,
      market_game_context_status TEXT,
      market_prop_context_status TEXT,
      daily_readiness_status TEXT,
      matrix_status TEXT,
      matrix_grade TEXT,
      blocking_for_scoring INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      blocker_count INTEGER DEFAULT 0,
      missing_component_count INTEGER DEFAULT 0,
      matrix_payload_json TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_matrix_issues (
      issue_id TEXT PRIMARY KEY,
      batch_id TEXT,
      matrix_id TEXT,
      prepared_row_id TEXT,
      game_pk INTEGER,
      mlb_player_id INTEGER,
      canonical_prop_key TEXT,
      severity TEXT,
      issue_type TEXT,
      reason TEXT,
      details_json TEXT,
      official_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prop_matrix_coverage_current (
      coverage_key TEXT PRIMARY KEY,
      prepared_row_id TEXT,
      matrix_id TEXT,
      matrix_status TEXT,
      matrix_grade TEXT,
      blocking_for_scoring INTEGER DEFAULT 0,
      latest_batch_id TEXT,
      latest_checked_at TEXT,
      missing_reason TEXT,
      details_json TEXT,
      official_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_batches_mode_date ON prop_matrix_batches(mode, window_start, window_end, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_current_prepared ON prop_matrix_current(prepared_row_id, official_date)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_current_status ON prop_matrix_current(official_date, matrix_status, matrix_grade)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_current_game_player ON prop_matrix_current(game_pk, mlb_player_id, canonical_prop_key)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_issues_batch ON prop_matrix_issues(batch_id, severity, issue_type)`,
    `CREATE INDEX IF NOT EXISTS idx_prop_matrix_coverage_date ON prop_matrix_coverage_current(official_date, matrix_status, matrix_grade)`
  ];
  await batch(env.SCORE_DB, ddl.map(sql => env.SCORE_DB.prepare(sql)), 10);
}
async function retentionCleanup(env, dates) {
  const [today, tomorrow] = dates;
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_current WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_issues WHERE official_date IS NOT NULL AND official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_coverage_current WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_batches WHERE window_start NOT IN (?, ?) AND window_end NOT IN (?, ?)", today, tomorrow, today, tomorrow);
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_batches WHERE window_start IN (?, ?) OR window_end IN (?, ?)", today, tomorrow, today, tomorrow);
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_current WHERE official_date IN (?, ?)", today, tomorrow);
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_issues WHERE official_date IN (?, ?)", today, tomorrow);
  await run(env.SCORE_DB, "DELETE FROM prop_matrix_coverage_current WHERE official_date IN (?, ?)", today, tomorrow);
}
async function getPreparedRows(env, dates) {
  return all(env.SCORE_DB, `SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, source_event_id, projection_id,
      player_name, resolved_player_id, resolved_mlb_player_id, player_match_status, team, opponent,
      team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk,
      official_game_time_utc, official_date, source_time_status, matchup_status, pickable_safe, prep_status, block_reason, row_payload_json,
      created_at, updated_at
    FROM score_board_prepared_current
    WHERE official_date IN (?, ?)
      AND pickable_safe=1
      AND matchup_status='calendar_matched'
      AND player_match_status='matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
    ORDER BY official_date, official_game_pk, resolved_mlb_player_id, canonical_prop_key, source_key`, dates[0], dates[1]);
}
async function loadPrerequisites(env, dates, preparedRows) {
  const [today, tomorrow] = dates;
  const preparedMaxUpdatedAt = preparedRows.reduce((m, r) => String(r.updated_at || "") > m ? String(r.updated_at || "") : m, "");
  const prepCount = preparedRows.length;
  const prepGames = new Set(preparedRows.map(r => r.official_game_pk)).size;
  const prepPlayers = new Set(preparedRows.map(r => r.resolved_mlb_player_id || r.resolved_player_id)).size;
  const prepPropKeys = new Set(preparedRows.map(r => r.canonical_prop_key)).size;

  const factorCoverageRows = await all(env.SCORE_DB, `SELECT coverage_key,factor_family,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,normalized_factor_lane,factor_status,factor_grade,packet_id,latest_batch_id,latest_checked_at,blocking_for_matrix,missing_reason,details_json,official_date,updated_at FROM prop_factor_coverage_current WHERE official_date IN (?, ?)`, today, tomorrow);
  const factorCoverage = latestBy(factorCoverageRows, r => key(r.prepared_row_id));
  const hitterPackets = latestBy(await all(env.SCORE_DB, `SELECT * FROM prop_factor_hitter_packets WHERE official_date IN (?, ?)`, today, tomorrow), r => key(r.packet_id));
  const pitcherPackets = latestBy(await all(env.SCORE_DB, `SELECT * FROM prop_factor_pitcher_packets WHERE official_date IN (?, ?)`, today, tomorrow), r => key(r.packet_id));
  const factorIssuesRows = await all(env.SCORE_DB, `SELECT * FROM prop_factor_issues WHERE official_date IN (?, ?)`, today, tomorrow);
  const factorIssues = new Map(); for (const r of factorIssuesRows) pushMapArray(factorIssues, key(r.prepared_row_id), r);

  const readiness = latestBy(await all(env.DAILY_DB, `SELECT readiness_key,batch_id,official_date,game_pk,game_time_utc,prepared_row_id,source_key,source_row_id,projection_id,player_id,player_name,team_id,opponent_team_id,canonical_prop_key,prepared_board_relevant,pickable_safe,context_status,context_grade,hard_blocker_count,warning_count,enrichment_gap_count,available_context_count,expected_context_count,starter_context_status,lineup_context_status,player_availability_status,weather_context_status,bullpen_context_status,schedule_spot_context_status,umpire_context_status,hard_block_reasons_json,warning_reasons_json,enrichment_gaps_json,details_json,updated_at FROM daily_context_readiness_current WHERE official_date IN (?, ?)`, today, tomorrow), r => key(r.prepared_row_id));
  const dailyBatches = await all(env.DAILY_DB, `SELECT batch_id,status,window_start,window_end,certification_status,certification_grade,prepared_rows_read,current_rows_written,blocked_count,ready_with_warnings_count,ready_partial_enrichment_count,created_at,updated_at FROM daily_context_readiness_batches WHERE window_start IN (?, ?) OR window_end IN (?, ?) ORDER BY datetime(updated_at) DESC LIMIT 5`, today, tomorrow, today, tomorrow);
  const latestDailyBatch = dailyBatches[0] || null;

  const marketBatches = await all(env.MARKET_DB, `SELECT batch_id,mode,slate_window_key,window_start_date,window_end_date,status,certification_status,certification_grade,prepared_rows_read,prepared_games_checked,prepared_players_checked,prepared_prop_keys_checked,created_at,updated_at FROM market_context_probe_batches WHERE window_start_date IN (?, ?) OR window_end_date IN (?, ?) ORDER BY datetime(updated_at) DESC`, today, tomorrow, today, tomorrow);
  const latestMarketByMode = latestBy(marketBatches, r => key(r.mode));
  const marketBatchIds = new Set([...latestMarketByMode.values()].map(r => r.batch_id).filter(Boolean));

  const marketCoverageRowsAll = await all(env.MARKET_DB, `SELECT coverage_row_id,batch_id,slate_window_key,official_date,prepared_row_id,source_key,game_pk,resolved_mlb_player_id,canonical_prop_key,board_line_value,game_market_status,player_prop_market_status,market_context_status,coverage_grade,details_json,created_at FROM market_context_probe_coverage WHERE official_date IN (?, ?)`, today, tomorrow);
  const marketCoverageRows = marketCoverageRowsAll.filter(r => marketBatchIds.has(r.batch_id));
  const marketCoverage = new Map(); for (const r of marketCoverageRows) pushMapArray(marketCoverage, key(r.prepared_row_id), r);

  const playerPropsRowsAll = await all(env.MARKET_DB, `SELECT probe_row_id,batch_id,slate_window_key,official_date,prepared_row_id,source_key,source_event_id,source_line_id,game_pk,resolved_mlb_player_id,source_player_name,canonical_prop_key,source_market_key,line_value,price_american,price_decimal,outcome_side,mapping_status,coverage_status,created_at FROM market_context_probe_player_props WHERE official_date IN (?, ?) AND prepared_row_id IS NOT NULL`, today, tomorrow);
  const playerPropsRows = playerPropsRowsAll.filter(r => marketBatchIds.has(r.batch_id));
  const playerProps = new Map(); for (const r of playerPropsRows) pushMapArray(playerProps, key(r.prepared_row_id), r);

  const gameMarketRowsAll = await all(env.MARKET_DB, `SELECT summary_row_id,batch_id,slate_window_key,official_date,game_pk,source_key,source_event_id,source_commence_time_utc,home_team,away_team,book_target_count,book_available_count,book_coverage_grade,freshness_status,oldest_market_update,newest_market_update,h2h_book_count,home_ml_consensus,away_ml_consensus,home_ml_best,away_ml_best,moneyline_favorite_team,moneyline_favorite_price,moneyline_underdog_team,moneyline_underdog_price,runline_book_count,home_runline_point,home_runline_consensus_price,home_runline_best_price,away_runline_point,away_runline_consensus_price,away_runline_best_price,total_book_count,total_consensus_line,over_consensus_price,under_consensus_price,over_best_price,under_best_price,total_line_min,total_line_max,total_line_range,derived_home_implied_runs,derived_away_implied_runs,implied_runs_method,parse_status,warning_flags,summary_json,created_at FROM market_context_probe_game_market_summary WHERE official_date IN (?, ?)`, today, tomorrow);
  const gameMarketRows = gameMarketRowsAll.filter(r => marketBatchIds.has(r.batch_id));
  const gameMarket = latestBy(gameMarketRows, r => key(r.game_pk), "created_at");

  const calendar = latestBy(await all(env.TEAM_DB, `SELECT game_pk,official_date,game_time_utc,status_code,abstract_game_state,detailed_state,is_pregame,is_live,is_final,home_team_id,away_team_id,home_team_name,away_team_name,venue_id,venue_name,updated_at FROM mlb_game_calendar WHERE official_date IN (?, ?)`, today, tomorrow), r => key(r.game_pk));

  const latestHitterBatch = await first(env.SCORE_DB, `SELECT * FROM prop_factor_batches WHERE factor_family='hitter' AND (window_start IN (?, ?) OR window_end IN (?, ?)) ORDER BY datetime(updated_at) DESC LIMIT 1`, today, tomorrow, today, tomorrow);
  const latestPitcherBatch = await first(env.SCORE_DB, `SELECT * FROM prop_factor_batches WHERE factor_family='pitcher' AND (window_start IN (?, ?) OR window_end IN (?, ?)) ORDER BY datetime(updated_at) DESC LIMIT 1`, today, tomorrow, today, tomorrow);

  const freshness = {
    prepared: { rows: prepCount, games: prepGames, players: prepPlayers, prop_keys: prepPropKeys, max_updated_at: preparedMaxUpdatedAt },
    daily_readiness: latestDailyBatch ? { batch_id: latestDailyBatch.batch_id, prepared_rows_read: latestDailyBatch.prepared_rows_read, current_rows_written: latestDailyBatch.current_rows_written, updated_at: latestDailyBatch.updated_at, stale: isStale(latestDailyBatch, preparedMaxUpdatedAt) || Number(latestDailyBatch.current_rows_written || 0) !== prepCount } : { missing: true, stale: true },
    factor_hitter: latestHitterBatch ? { batch_id: latestHitterBatch.batch_id, prepared_rows_read: latestHitterBatch.prepared_rows_read, eligible_rows: latestHitterBatch.eligible_rows, packets_written: latestHitterBatch.packets_written, updated_at: latestHitterBatch.updated_at, stale: isStale(latestHitterBatch, preparedMaxUpdatedAt) } : { missing: true, stale: true },
    factor_pitcher: latestPitcherBatch ? { batch_id: latestPitcherBatch.batch_id, prepared_rows_read: latestPitcherBatch.prepared_rows_read, eligible_rows: latestPitcherBatch.eligible_rows, packets_written: latestPitcherBatch.packets_written, blocked_rows: latestPitcherBatch.blocked_rows, updated_at: latestPitcherBatch.updated_at, stale: isStale(latestPitcherBatch, preparedMaxUpdatedAt) } : { missing: true, stale: true },
    market_batches: {}
  };
  for (const [mode, b] of latestMarketByMode.entries()) freshness.market_batches[mode] = { batch_id: b.batch_id, prepared_rows_read: b.prepared_rows_read, prepared_games_checked: b.prepared_games_checked, updated_at: b.updated_at, stale: isStale(b, preparedMaxUpdatedAt) };

  return { factorCoverage, hitterPackets, pitcherPackets, factorIssues, readiness, marketCoverage, playerProps, gameMarket, calendar, freshness };
}
function aggregateMarketCoverage(rows) {
  const out = {
    rows: rows || [],
    game_status: "market_game_context_missing",
    prop_status: "market_prop_context_missing",
    context_status: "market_context_missing",
    coverage_grade: "MARKET_CONTEXT_MISSING",
    has_game_context: false,
    has_prop_context: false,
    prop_missing: false,
    partial: false
  };
  if (!rows || !rows.length) return out;
  const statuses = rows.map(r => String(r.market_context_status || ""));
  const grades = rows.map(r => String(r.coverage_grade || ""));
  const gameStatuses = rows.map(r => String(r.game_market_status || ""));
  const propStatuses = rows.map(r => String(r.player_prop_market_status || ""));
  out.has_game_context = gameStatuses.some(s => s.includes("SPORTSBOOK_GAME_MARKET_CONTEXT_PRESENT") || s.includes("GAME_MARKET_CONTEXT_PRESENT"));
  out.has_prop_context = propStatuses.some(s => s.includes("PROP_LINE_CONTEXT_PRESENT") || s.includes("REFERENCE_MATCHED"));
  out.prop_missing = propStatuses.some(s => s.includes("NOT_FOUND") || s.includes("MISSING") || s.includes("NOT_MATCHED"));
  out.partial = statuses.some(s => s.includes("PARTIAL")) || !out.has_game_context || out.prop_missing;
  out.game_status = out.has_game_context ? "market_game_context_present" : "market_game_context_missing";
  out.prop_status = out.has_prop_context ? "market_prop_context_present" : (out.prop_missing ? "market_prop_context_not_found" : "market_prop_context_missing");
  out.context_status = out.partial ? "market_context_partial" : "market_context_ready";
  out.coverage_grade = [...new Set(grades.filter(Boolean))].join(",") || out.coverage_grade;
  return out;
}
function addIssue(issues, batchId, matrixId, row, severity, issueType, reason, details) {
  issues.push({ issue_id: rid("pmi"), batch_id: batchId, matrix_id: matrixId, prepared_row_id: row.prepared_row_id, game_pk: row.official_game_pk, mlb_player_id: row.resolved_mlb_player_id || row.resolved_player_id, canonical_prop_key: row.canonical_prop_key, severity, issue_type: issueType, reason, details: details || {}, official_date: row.official_date });
}
async function insertMatrixRows(env, matrixRows, issueRows, coverageRows) {
  await batch(env.SCORE_DB, matrixRows.map(r => env.SCORE_DB.prepare(`INSERT OR REPLACE INTO prop_matrix_current (matrix_id,batch_id,prepared_row_id,source_line_id,source_key,game_pk,official_date,official_game_time_utc,mlb_player_id,player_name,team_id,opponent_team_id,is_home,canonical_prop_key,board_line_value,prop_side,factor_family,factor_packet_id,factor_status,market_game_context_status,market_prop_context_status,daily_readiness_status,matrix_status,matrix_grade,blocking_for_scoring,warning_count,blocker_count,missing_component_count,matrix_payload_json,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
    r.matrix_id, r.batch_id, r.prepared_row_id, r.source_line_id || null, r.source_key, r.game_pk, r.official_date, r.official_game_time_utc, r.mlb_player_id, r.player_name, r.team_id || null, r.opponent_team_id || null, r.is_home === undefined ? null : r.is_home, r.canonical_prop_key, r.board_line_value, r.prop_side || null, r.factor_family, r.factor_packet_id || null, r.factor_status, r.market_game_context_status, r.market_prop_context_status, r.daily_readiness_status, r.matrix_status, r.matrix_grade, r.blocking_for_scoring ? 1 : 0, r.warning_count || 0, r.blocker_count || 0, r.missing_component_count || 0, JSON.stringify(r.matrix_payload || {}), JSON.stringify(r.details || {})
  )), 35);
  await batch(env.SCORE_DB, issueRows.map(i => env.SCORE_DB.prepare(`INSERT OR REPLACE INTO prop_matrix_issues (issue_id,batch_id,matrix_id,prepared_row_id,game_pk,mlb_player_id,canonical_prop_key,severity,issue_type,reason,details_json,official_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
    i.issue_id, i.batch_id, i.matrix_id, i.prepared_row_id, i.game_pk, i.mlb_player_id, i.canonical_prop_key, i.severity, i.issue_type, i.reason, JSON.stringify(i.details || {}), i.official_date
  )), 40);
  await batch(env.SCORE_DB, coverageRows.map(c => env.SCORE_DB.prepare(`INSERT OR REPLACE INTO prop_matrix_coverage_current (coverage_key,prepared_row_id,matrix_id,matrix_status,matrix_grade,blocking_for_scoring,latest_batch_id,latest_checked_at,missing_reason,details_json,official_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
    c.coverage_key, c.prepared_row_id, c.matrix_id, c.matrix_status, c.matrix_grade, c.blocking_for_scoring ? 1 : 0, c.latest_batch_id, c.latest_checked_at, c.missing_reason || null, JSON.stringify(c.details || {}), c.official_date
  )), 40);
}
async function runMatrixBuilder(request, env) {
  const input = await request.json().catch(() => ({}));
  const dates = Array.isArray(input.window_dates) && input.window_dates.length >= 2 ? input.window_dates.slice(0, 2) : ptTodayTomorrow();
  const dbPresence = reqDb(env);
  if (!allTrue(dbPresence)) return jsonResponse({ ok:false, data_ok:false, version:SYSTEM_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, status:"blocked_missing_db_binding", missing_bindings:Object.entries(dbPresence).filter(([,v])=>!v).map(([k])=>k) }, 500);

  await ensureSchema(env);
  await retentionCleanup(env, dates);
  const batchId = rid("prop_matrix_batch");
  const runId = input.run_id || rid("run");
  const sourceTables = { score_db:["score_board_prepared_current","prop_factor_coverage_current","prop_factor_hitter_packets","prop_factor_pitcher_packets","prop_factor_issues","prop_factor_batches"], market_db:["market_context_probe_batches","market_context_probe_coverage","market_context_probe_player_props","market_context_probe_game_market_summary"], daily_db:["daily_context_readiness_current","daily_context_readiness_batches"], team_db:["mlb_game_calendar"] };
  await run(env.SCORE_DB, `INSERT OR REPLACE INTO prop_matrix_batches (batch_id,request_id,run_id,worker_name,worker_version,deployed_worker_slot,deployed_slot_version,mode,status,window_start,window_end,source_tables_checked_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    batchId, input.request_id || null, runId, LOGICAL_WORKER_NAME, SYSTEM_VERSION, WORKER_NAME, DEPLOYED_SLOT_VERSION, "prop_matrix_build", "running", dates[0], dates[1], JSON.stringify(sourceTables));

  const prepared = await getPreparedRows(env, dates);
  const ctx = await loadPrerequisites(env, dates, prepared);
  const issues = [];
  const matrixRows = [];
  const coverageRows = [];

  for (const row of prepared) {
    const playerId = row.resolved_mlb_player_id || row.resolved_player_id;
    const matrixId = key("matrix", row.prepared_row_id);
    const classification = classifyProp(row.canonical_prop_key, row.source_prop_name);
    const factorCov = ctx.factorCoverage.get(key(row.prepared_row_id));
    const packetMap = factorCov && factorCov.factor_family === "pitcher" ? ctx.pitcherPackets : ctx.hitterPackets;
    const packet = factorCov && factorCov.packet_id ? packetMap.get(key(factorCov.packet_id)) : null;
    const readiness = ctx.readiness.get(key(row.prepared_row_id));
    const marketRows = ctx.marketCoverage.get(key(row.prepared_row_id)) || [];
    const market = aggregateMarketCoverage(marketRows);
    const propEvidence = compactMarketPropRows(ctx.playerProps.get(key(row.prepared_row_id)) || []);
    const gameMarket = cleanGameMarket(ctx.gameMarket.get(key(row.official_game_pk)));
    const game = ctx.calendar.get(key(row.official_game_pk));
    const rowIssuesBefore = issues.length;

    let matrixStatus = "matrix_ready";
    let matrixGrade = "PASS";
    let blocking = 0;
    let warningCount = 0;
    let blockerCount = 0;
    let missingComponentCount = 0;

    if (classification.family === "deferred" || String(row.canonical_prop_key || "").toLowerCase() === "rfi_nrfi") {
      matrixStatus = "matrix_deferred";
      matrixGrade = "DEFERRED_UNSUPPORTED_PROP";
      blocking = 1;
      blockerCount++;
      addIssue(issues, batchId, matrixId, row, "blocker", "deferred_prop", "PROP_DEFERRED_PENDING_SEPARATE_DESIGN", { classification, note:"RFI/NRFI is deferred by design and not a system error." });
    } else if (!classification.supported) {
      matrixStatus = "matrix_deferred";
      matrixGrade = "DEFERRED_UNSUPPORTED_PROP";
      blocking = 1;
      blockerCount++;
      addIssue(issues, batchId, matrixId, row, "blocker", "unsupported_prop", classification.reason || "UNSUPPORTED_PROP_KEY_PENDING_FACTOR_DESIGN", { classification });
    }

    if (!factorCov) {
      blocking = 1;
      blockerCount++;
      missingComponentCount++;
      if (matrixStatus !== "matrix_deferred") { matrixStatus = "matrix_source_missing"; matrixGrade = "BLOCKED_UNSAFE"; }
      addIssue(issues, batchId, matrixId, row, "blocker", "missing_factor_coverage", "FACTOR_COVERAGE_MISSING_FOR_SAFE_PREPARED_ROW", { expected_family: classification.family });
    } else if (Number(factorCov.blocking_for_matrix || 0) === 1 && matrixStatus !== "matrix_deferred") {
      blocking = 1;
      blockerCount++;
      matrixStatus = "matrix_blocked";
      matrixGrade = "BLOCKED_UNSAFE";
      addIssue(issues, batchId, matrixId, row, "blocker", "factor_blocking_for_matrix", factorCov.missing_reason || "FACTOR_PACKET_BLOCKED", { factor_status: factorCov.factor_status, factor_grade: factorCov.factor_grade, details: safeJsonParse(factorCov.details_json, {}) });
    }

    if (factorCov && factorCov.packet_id && !packet && matrixStatus !== "matrix_deferred") {
      blocking = 1;
      blockerCount++;
      missingComponentCount++;
      matrixStatus = "matrix_source_missing";
      matrixGrade = "BLOCKED_UNSAFE";
      addIssue(issues, batchId, matrixId, row, "blocker", "factor_packet_missing", "FACTOR_PACKET_ID_NOT_FOUND_IN_PACKET_TABLE", { factor_packet_id: factorCov.packet_id, factor_family: factorCov.factor_family });
    }

    if (!readiness) {
      blocking = 1;
      blockerCount++;
      missingComponentCount++;
      if (matrixStatus !== "matrix_deferred") { matrixStatus = "matrix_source_missing"; matrixGrade = "BLOCKED_UNSAFE"; }
      addIssue(issues, batchId, matrixId, row, "blocker", "daily_readiness_missing", "DAILY_CONTEXT_READINESS_MISSING_FOR_PREPARED_ROW", {});
    } else {
      const hard = Number(readiness.hard_blocker_count || 0);
      const warn = Number(readiness.warning_count || 0) + Number(readiness.enrichment_gap_count || 0);
      if (hard > 0 && matrixStatus !== "matrix_deferred") {
        blocking = 1;
        blockerCount += hard;
        matrixStatus = "matrix_blocked";
        matrixGrade = "BLOCKED_UNSAFE";
        addIssue(issues, batchId, matrixId, row, "blocker", "daily_readiness_hard_blocker", "DAILY_CONTEXT_READINESS_HARD_BLOCKER", { context_status: readiness.context_status, context_grade: readiness.context_grade, hard_block_reasons: safeJsonParse(readiness.hard_block_reasons_json, []) });
      }
      if (warn > 0) {
        warningCount += warn;
        addIssue(issues, batchId, matrixId, row, "warning", "daily_readiness_warning", "DAILY_CONTEXT_READINESS_WARNINGS_OR_GAPS_PRESENT", { context_status: readiness.context_status, context_grade: readiness.context_grade, warning_count: readiness.warning_count, enrichment_gap_count: readiness.enrichment_gap_count, warnings: safeJsonParse(readiness.warning_reasons_json, []), gaps: safeJsonParse(readiness.enrichment_gaps_json, []) });
      }
    }

    if (!gameMarket) {
      warningCount++;
      missingComponentCount++;
      addIssue(issues, batchId, matrixId, row, "warning", "market_game_context_missing", "MARKET_GAME_CONTEXT_MISSING_OR_NOT_REFRESHED", { game_pk: row.official_game_pk });
    }
    if (!marketRows.length) {
      warningCount++;
      missingComponentCount++;
      addIssue(issues, batchId, matrixId, row, "warning", "market_coverage_missing", "MARKET_CONTEXT_COVERAGE_MISSING_FOR_PREPARED_ROW", {});
    } else if (market.partial) {
      warningCount++;
      addIssue(issues, batchId, matrixId, row, "warning", "market_context_partial", "MARKET_CONTEXT_PARTIAL_OR_PROP_LINE_MISSING", { statuses: marketRows.map(r => ({ batch_id:r.batch_id, market_context_status:r.market_context_status, coverage_grade:r.coverage_grade, game_market_status:r.game_market_status, player_prop_market_status:r.player_prop_market_status })) });
    }

    const factorIssues = ctx.factorIssues.get(key(row.prepared_row_id)) || [];
    if (factorIssues.length) {
      for (const fi of factorIssues.slice(0, 6)) {
        const sev = String(fi.severity || "warning").toLowerCase() === "blocker" ? "blocker" : "warning";
        if (sev === "blocker") blockerCount++; else warningCount++;
        addIssue(issues, batchId, matrixId, row, sev, "carried_factor_issue", fi.reason || fi.issue_type || "FACTOR_ISSUE_CARRIED_FORWARD", { factor_issue_id: fi.issue_id, issue_type: fi.issue_type, factor_family: fi.factor_family, details: safeJsonParse(fi.details_json, {}) });
      }
    }

    if (!blocking) {
      if (market.partial || !marketRows.length || (readiness && String(readiness.context_status || "").includes("partial"))) {
        matrixStatus = "matrix_partial_context";
        matrixGrade = "PARTIAL_CONTEXT_PASS";
      } else if (warningCount > 0 || (packet && Number(packet.warning_count || 0) > 0)) {
        matrixStatus = "matrix_ready_with_warnings";
        matrixGrade = "PASS_WITH_WARNINGS";
      } else {
        matrixStatus = "matrix_ready";
        matrixGrade = "PASS";
      }
    }

    const packetDetails = packet ? { packet_id: packet.packet_id, batch_id: packet.batch_id, factor_status: packet.factor_status, factor_grade: packet.factor_grade, readiness_status: packet.readiness_status, market_context_status: packet.market_context_status, daily_context_status: packet.daily_context_status, base_metric_status: packet.base_metric_status, warning_count: packet.warning_count, blocker_count: packet.blocker_count, missing_factor_count: packet.missing_factor_count, factor_payload: safeJsonParse(packet.factor_payload_json, {}) } : null;
    const details = {
      classification,
      factor_coverage: factorCov ? { factor_family: factorCov.factor_family, factor_status: factorCov.factor_status, factor_grade: factorCov.factor_grade, blocking_for_matrix: factorCov.blocking_for_matrix, missing_reason: factorCov.missing_reason, latest_batch_id: factorCov.latest_batch_id } : null,
      daily_readiness: readiness ? { batch_id: readiness.batch_id, context_status: readiness.context_status, context_grade: readiness.context_grade, hard_blocker_count: readiness.hard_blocker_count, warning_count: readiness.warning_count, enrichment_gap_count: readiness.enrichment_gap_count, starter_context_status: readiness.starter_context_status, lineup_context_status: readiness.lineup_context_status, player_availability_status: readiness.player_availability_status, weather_context_status: readiness.weather_context_status, bullpen_context_status: readiness.bullpen_context_status, schedule_spot_context_status: readiness.schedule_spot_context_status, umpire_context_status: readiness.umpire_context_status } : null,
      market_context: { coverage_summary: { game_status: market.game_status, prop_status: market.prop_status, context_status: market.context_status, coverage_grade: market.coverage_grade, coverage_rows: market.rows.length }, player_prop_evidence: propEvidence, game_market: gameMarket },
      calendar: game ? { game_pk: game.game_pk, status_code: game.status_code, abstract_game_state: game.abstract_game_state, detailed_state: game.detailed_state, is_pregame: game.is_pregame, is_live: game.is_live, is_final: game.is_final } : null,
      row_issue_count: issues.length - rowIssuesBefore
    };
    const sourceLineId = packet && packet.source_line_id ? packet.source_line_id : (row.source_row_id || row.projection_id || row.source_event_id || null);
    const teamId = packet && packet.team_id ? packet.team_id : (readiness && readiness.team_id ? readiness.team_id : row.team || null);
    const opponentTeamId = packet && packet.opponent_team_id ? packet.opponent_team_id : (readiness && readiness.opponent_team_id ? readiness.opponent_team_id : row.opponent || null);
    const isHome = packet && packet.is_home !== null && packet.is_home !== undefined ? packet.is_home : null;
    matrixRows.push({
      matrix_id: matrixId, batch_id: batchId, prepared_row_id: row.prepared_row_id, source_line_id: sourceLineId, source_key: row.source_key, game_pk: row.official_game_pk, official_date: row.official_date, official_game_time_utc: row.official_game_time_utc, mlb_player_id: playerId, player_name: row.player_name, team_id: teamId, opponent_team_id: opponentTeamId, is_home: isHome, canonical_prop_key: row.canonical_prop_key, board_line_value: row.line_value, prop_side: null, factor_family: factorCov ? factorCov.factor_family : classification.family, factor_packet_id: factorCov && factorCov.packet_id ? factorCov.packet_id : null, factor_status: factorCov ? factorCov.factor_status : "factor_coverage_missing", market_game_context_status: market.game_status, market_prop_context_status: market.prop_status, daily_readiness_status: readiness ? readiness.context_status : "daily_readiness_missing", matrix_status: matrixStatus, matrix_grade: matrixGrade, blocking_for_scoring: blocking, warning_count: warningCount + (packet ? Number(packet.warning_count || 0) : 0), blocker_count: blockerCount, missing_component_count: missingComponentCount, matrix_payload: { prepared: { prepared_row_id: row.prepared_row_id, prep_batch_id: row.prep_batch_id, source_key: row.source_key, player_name: row.player_name, mlb_player_id: playerId, canonical_prop_key: row.canonical_prop_key, board_line_value: row.line_value, official_game_pk: row.official_game_pk, official_date: row.official_date, official_game_time_utc: row.official_game_time_utc }, factor_packet: packetDetails, market: details.market_context, daily_readiness: details.daily_readiness }, details });
    coverageRows.push({ coverage_key: key("matrix", row.prepared_row_id), prepared_row_id: row.prepared_row_id, matrix_id: matrixId, matrix_status: matrixStatus, matrix_grade: matrixGrade, blocking_for_scoring: blocking, latest_batch_id: batchId, latest_checked_at: nowIso(), missing_reason: blockerCount ? issues.slice(rowIssuesBefore).filter(i => i.severity === "blocker").map(i => i.reason).join(",") : null, details: { warning_count: warningCount, blocker_count: blockerCount, missing_component_count: missingComponentCount }, official_date: row.official_date });
  }

  await insertMatrixRows(env, matrixRows, issues, coverageRows);
  const statusCounts = matrixRows.reduce((m, r) => { m[r.matrix_status] = (m[r.matrix_status] || 0) + 1; return m; }, {});
  const warningRows = matrixRows.filter(r => Number(r.warning_count || 0) > 0).length;
  const blockerRows = matrixRows.filter(r => Number(r.blocker_count || 0) > 0 || r.blocking_for_scoring).length;
  const missingComponentRows = matrixRows.filter(r => Number(r.missing_component_count || 0) > 0).length;
  const noSilentDropOk = matrixRows.length === prepared.length;
  const status = noSilentDropOk ? "completed_with_certified_matrix_rows" : "failed_no_silent_drop_violation";
  const certification = noSilentDropOk ? "PROP_MATRIX_CERTIFIED_ONE_ROW_PER_SAFE_PREPARED_ROW" : "PROP_MATRIX_FAILED_ROW_PRESERVATION";
  const grade = !noSilentDropOk ? "FAILED_ROW_PRESERVATION" : (blockerRows > 0 ? "PASS_WITH_BLOCKED_OR_DEFERRED_ROWS" : (warningRows > 0 ? "PASS_WITH_WARNINGS" : "PASS"));
  const output = { ok:noSilentDropOk, data_ok:noSilentDropOk, version:SYSTEM_VERSION, deployed_slot_version:DEPLOYED_SLOT_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, mode:"prop_matrix_build", status, certification, certification_grade:grade, batch_id:batchId, run_id:runId, window_dates:dates, prepared_rows_read:prepared.length, eligible_rows:prepared.length, matrix_rows_written:matrixRows.length, matrix_ready_rows:statusCounts.matrix_ready || 0, matrix_ready_with_warnings_rows:statusCounts.matrix_ready_with_warnings || 0, matrix_partial_context_rows:statusCounts.matrix_partial_context || 0, matrix_blocked_rows:statusCounts.matrix_blocked || 0, matrix_deferred_rows:statusCounts.matrix_deferred || 0, matrix_source_missing_rows:statusCounts.matrix_source_missing || 0, issue_rows:issues.length, warning_rows:warningRows, blocker_rows:blockerRows, missing_component_rows:missingComponentRows, no_silent_drops:noSilentDropOk, one_matrix_row_per_safe_prepared_row:noSilentDropOk, prerequisite_freshness:ctx.freshness, retention_policy:"today_tomorrow_only_latest_matrix_current_issues_coverage_and_batch", internal_only:true, external_calls:0, no_external_api_calls:true, no_mlb_api_calls:true, no_odds_api_calls:true, no_parlay_api_calls:true, no_gemini_calls:true, no_probability:true, no_edge:true, no_value_rating:true, no_qualified_flag:true, no_rank:true, no_pick_recommendation:true, no_scoring:true, no_ranking:true, no_final_board:true };
  await run(env.SCORE_DB, `UPDATE prop_matrix_batches SET status=?, prepared_rows_read=?, eligible_rows=?, matrix_rows_written=?, matrix_ready_rows=?, matrix_ready_with_warnings_rows=?, matrix_partial_context_rows=?, matrix_blocked_rows=?, matrix_deferred_rows=?, issue_rows=?, warning_rows=?, blocker_rows=?, missing_component_rows=?, prerequisite_freshness_json=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, prepared.length, prepared.length, matrixRows.length, output.matrix_ready_rows, output.matrix_ready_with_warnings_rows, output.matrix_partial_context_rows, output.matrix_blocked_rows, output.matrix_deferred_rows, issues.length, warningRows, blockerRows, missingComponentRows, JSON.stringify(ctx.freshness), certification, grade, JSON.stringify(output), batchId);
  return jsonResponse(output);
}
function identity(env) {
  const db = reqDb(env);
  return { ok:true, data_ok:true, version:SYSTEM_VERSION, deployed_slot_version:DEPLOYED_SLOT_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, job_key:JOB_KEY, status:"ready", internal_only:true, no_external_calls:true, no_scoring:true, no_ranking:true, no_final_board:true, schema_owner:"SCORE_DB.prop_matrix_*", retention_policy:"today_tomorrow_only", required_db_bindings_present:allTrue(db), db_bindings:db };
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && (path === "/run" || path === "/build" || path === "/matrix")) {
      try { return await runMatrixBuilder(request, env); }
      catch (err) { return jsonResponse({ ok:false, data_ok:false, version:SYSTEM_VERSION, worker_name:LOGICAL_WORKER_NAME, deployed_worker_slot:WORKER_NAME, status:"prop_matrix_builder_exception", error:String(err && err.stack ? err.stack : err), external_calls:0, no_scoring:true, no_ranking:true, no_final_board:true }, 500); }
    }
    return jsonResponse({ ok:false, error:"not_found", version:SYSTEM_VERSION, path }, 404);
  }
};
