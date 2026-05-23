const WORKER_NAME = "alphadog-v2-base-bullpen-history";
const VERSION = "alphadog-v2-base-bullpen-history-v0.4.3-delta-enddate-build-fix";
const JOB_KEY = "base-bullpen-history";

const DEFAULT_SAMPLE_DATE = "2026-05-18";
const DEFAULT_SAMPLE_LIMIT = 3;
const DEFAULT_BASE_CUTOFF_DATE = "2026-05-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-05-19";
const DEFAULT_BASE_START_DATE = "2026-03-01";
const DEFAULT_BASE_CHUNK_GAMES = 20;
const SOURCE_KEY = "mlb_statsapi_schedule_boxscore_bullpen_history_v0_2_0";
const SOURCE_CONFIDENCE = "SOURCE_LOCKED_OFFICIAL_FINAL_BOXSCORE_GAME_LOG_STYLE";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "ODDS_API_KEY", "PARLAY_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH", "MLB_API_USER_AGENT"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE", "DEFAULT_SLATE_MODE", "ODDS_API_BASE_URL", "PARLAY_API_BASE_URL", "MLB_API_BASE_URL", "PRIZEPICKS_SOURCE_MODE", "MAX_TICK_MS", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES", "WORKER_SAFE_MODE", "DEBUG_MODE", "MANUAL_SQL_ENABLED", "CONFIG_PHASE"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJson(value) { try { return JSON.stringify(value == null ? null : value); } catch { return JSON.stringify({ serialization_error: true }); } }
function str(value) { return value == null ? null : String(value); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function ymd(value) { return String(value || "").slice(0, 10); }
function seasonFromDate(value) { return Number(String(value || DEFAULT_SAMPLE_DATE).slice(0, 4)) || 2026; }
function asInt(value) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : null; }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
async function run(db, sql, ...binds) { const stmt = db.prepare(sql); return binds.length ? stmt.bind(...binds).run() : stmt.run(); }
async function all(db, sql, ...binds) { const stmt = db.prepare(sql); const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all(); return res.results || []; }
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }

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
    status: "BULLPEN_HISTORY_SCHEMA_SOURCE_LOCK_PROBE_READY",
    timestamp_utc: nowUtc(),
    phase: "bullpen-history-v0.4.0-delta-update-retained-repair",
    notes: [
      "v0.4.0 supports source-lock probe, base_backfill_stage_only, base_promote_clean, and delta_update with no-op, retained-stage restore, and scoped source repair readiness.",
      "Allowed writes: TEAM_DB bullpen_history live promotion from certified stage, batch/certification metadata, and stage cleanup after live verification.",
      "Forbidden in this version: Daily Bullpen Availability, scoring, ranking, final board, PrizePicks/Sleeper mutation, and browser pump. Delta update is allowed only for completed final regular-season games after the certified base cutoff.",
      "Classification target is GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS if official completed MLB boxscore exposes relief pitchers through gamesStarted == 0. Daily Bullpen Availability remains a later derived worker."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets)
    }
  };
}

async function tableColumns(db, tableName) {
  try {
    const rows = await all(db, `PRAGMA table_info(${tableName})`);
    return new Set(rows.map(r => String(r.name)));
  } catch {
    return new Set();
  }
}

async function addColumnIfMissing(db, tableName, columnName, columnDef) {
  const cols = await tableColumns(db, tableName);
  if (cols.has(columnName)) return { column: columnName, added: false, reason: "already_exists" };
  await run(db, `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  return { column: columnName, added: true };
}

async function ensureSchema(env) {
  const db = env.TEAM_DB;
  const schemaActions = [];
  const statements = [
    `CREATE TABLE IF NOT EXISTS team_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`,
    `CREATE TABLE IF NOT EXISTS bullpen_history (
      bullpen_key TEXT PRIMARY KEY,
      team_id TEXT,
      game_date TEXT,
      game_pk INTEGER,
      usage_json TEXT,
      availability_json TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS bullpen_history_batches (
      batch_id TEXT PRIMARY KEY,
      run_id TEXT,
      request_id TEXT,
      chain_id TEXT,
      job_key TEXT,
      worker_name TEXT,
      version TEXT,
      ingestion_mode TEXT,
      probe_only INTEGER DEFAULT 1,
      source_key TEXT,
      source_confidence TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      base_backfill_cutoff_date TEXT,
      delta_reserved_start_date TEXT,
      sample_start_date TEXT,
      sample_end_date TEXT,
      sample_limit INTEGER,
      source_shape_classification TEXT,
      relief_identification_path TEXT,
      starter_exclusion_path TEXT,
      safest_key_model TEXT,
      expected_game_count INTEGER DEFAULT 0,
      expected_bullpen_rows INTEGER DEFAULT 0,
      staged_bullpen_rows INTEGER DEFAULT 0,
      duplicate_stage_keys INTEGER DEFAULT 0,
      final_games_sampled INTEGER DEFAULT 0,
      teams_with_zero_bullpen_rows INTEGER DEFAULT 0,
      games_with_zero_bullpen_team INTEGER DEFAULT 0,
      games_started_zero_reliever_rows INTEGER DEFAULT 0,
      games_started_missing_rows INTEGER DEFAULT 0,
      opener_bulk_edge_case_count INTEGER DEFAULT 0,
      source_error_count INTEGER DEFAULT 0,
      unclear_count INTEGER DEFAULT 0,
      status TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      certified_at TEXT,
      promoted_at TEXT,
      cleaned_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS bullpen_history_stage (
      stage_id TEXT PRIMARY KEY,
      bullpen_key TEXT,
      game_pk INTEGER,
      game_date TEXT,
      season INTEGER,
      game_type TEXT,
      game_status TEXT,
      team_id TEXT,
      team_name TEXT,
      opponent_team_id TEXT,
      opponent_team_name TEXT,
      is_home INTEGER,
      venue_id INTEGER,
      pitcher_id INTEGER,
      pitcher_name TEXT,
      pitcher_hand TEXT,
      pitcher_role TEXT,
      relief_classification TEXT,
      relief_appearance INTEGER,
      games_started INTEGER,
      games_pitched INTEGER,
      pitcher_order_index INTEGER,
      bullpen_appearance_index INTEGER,
      innings_pitched TEXT,
      innings_pitched_decimal REAL,
      outs_recorded INTEGER,
      batters_faced INTEGER,
      pitches INTEGER,
      strikes INTEGER,
      hits_allowed INTEGER,
      runs_allowed INTEGER,
      earned_runs INTEGER,
      walks_allowed INTEGER,
      strikeouts INTEGER,
      home_runs_allowed INTEGER,
      inherited_runners INTEGER,
      inherited_runners_scored INTEGER,
      holds INTEGER,
      saves INTEGER,
      blown_saves INTEGER,
      field_map_json TEXT,
      source_path TEXT,
      data_feed_key TEXT,
      source_key TEXT,
      source_endpoint TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      ingestion_mode TEXT,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      source_confidence TEXT,
      source_snapshot_date TEXT,
      raw_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      certified_at TEXT,
      promoted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS bullpen_history_outcomes (
      outcome_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      game_pk INTEGER,
      game_date TEXT,
      season INTEGER,
      team_id TEXT,
      opponent_team_id TEXT,
      pitcher_id INTEGER,
      bullpen_key TEXT,
      outcome_level TEXT,
      outcome_category TEXT,
      status TEXT,
      reason TEXT,
      source_endpoint TEXT,
      source_key TEXT,
      source_confidence TEXT,
      source_snapshot_date TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS bullpen_history_cursor (
      cursor_key TEXT PRIMARY KEY,
      ingestion_mode TEXT,
      source_key TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      base_backfill_cutoff_date TEXT,
      delta_reserved_start_date TEXT,
      last_sample_date TEXT,
      last_game_pk INTEGER,
      last_batch_id TEXT,
      last_request_id TEXT,
      status TEXT,
      cursor_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS bullpen_history_certifications (
      certification_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      expected_game_count INTEGER DEFAULT 0,
      expected_bullpen_rows INTEGER DEFAULT 0,
      staged_bullpen_rows INTEGER DEFAULT 0,
      rows_promoted INTEGER DEFAULT 0,
      duplicate_stage_keys INTEGER DEFAULT 0,
      non_final_games INTEGER DEFAULT 0,
      source_error_count INTEGER DEFAULT 0,
      repair_required_count INTEGER DEFAULT 0,
      unclear_count INTEGER DEFAULT 0,
      missing_game_pk INTEGER DEFAULT 0,
      missing_game_date INTEGER DEFAULT 0,
      missing_team_id INTEGER DEFAULT 0,
      missing_opponent_team_id INTEGER DEFAULT 0,
      missing_pitcher_id INTEGER DEFAULT 0,
      starter_rows_included INTEGER DEFAULT 0,
      invalid_relief_classification INTEGER DEFAULT 0,
      raw_json_missing INTEGER DEFAULT 0,
      lineage_missing_count INTEGER DEFAULT 0,
      source_shape_classification TEXT,
      relief_identification_path TEXT,
      starter_exclusion_path TEXT,
      safest_key_model TEXT,
      field_map_json TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bullpen_history_stage_batch ON bullpen_history_stage(batch_id, game_pk, team_id, pitcher_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bullpen_history_stage_game_team ON bullpen_history_stage(game_pk, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bullpen_history_outcomes_batch ON bullpen_history_outcomes(batch_id, outcome_category)`,
    `CREATE INDEX IF NOT EXISTS idx_bullpen_history_batches_status ON bullpen_history_batches(status, updated_at)`
  ];
  for (const sql of statements) {
    try { await run(db, sql); schemaActions.push({ action: "run", ok: true, sql_preview: sql.slice(0, 80) }); }
    catch (err) { schemaActions.push({ action: "run", ok: false, sql_preview: sql.slice(0, 80), error: String(err && err.message ? err.message : err) }); throw err; }
  }

  const liveColumns = [
    ["game_type", "TEXT"], ["game_status", "TEXT"], ["season", "INTEGER"], ["opponent_team_id", "TEXT"], ["is_home", "INTEGER"], ["venue_id", "INTEGER"],
    ["pitcher_id", "INTEGER"], ["pitcher_name", "TEXT"], ["pitcher_hand", "TEXT"], ["pitcher_role", "TEXT"], ["relief_classification", "TEXT"], ["relief_appearance", "INTEGER"], ["games_started", "INTEGER"], ["games_pitched", "INTEGER"], ["pitcher_order_index", "INTEGER"], ["bullpen_appearance_index", "INTEGER"],
    ["innings_pitched", "TEXT"], ["innings_pitched_decimal", "REAL"], ["outs_recorded", "INTEGER"], ["batters_faced", "INTEGER"], ["pitches", "INTEGER"], ["strikes", "INTEGER"], ["hits_allowed", "INTEGER"], ["runs_allowed", "INTEGER"], ["earned_runs", "INTEGER"], ["walks_allowed", "INTEGER"], ["strikeouts", "INTEGER"], ["home_runs_allowed", "INTEGER"],
    ["inherited_runners", "INTEGER"], ["inherited_runners_scored", "INTEGER"], ["holds", "INTEGER"], ["saves", "INTEGER"], ["blown_saves", "INTEGER"], ["field_map_json", "TEXT"], ["source_path", "TEXT"],
    ["data_feed_key", "TEXT"], ["raw_json", "TEXT"], ["source_key", "TEXT"], ["source_endpoint", "TEXT"], ["source_season", "INTEGER"], ["source_game_type", "TEXT"], ["ingestion_mode", "TEXT"], ["batch_id", "TEXT"], ["run_id", "TEXT"], ["certification_status", "TEXT"], ["certification_grade", "TEXT"], ["source_confidence", "TEXT"], ["source_snapshot_date", "TEXT"], ["certified_at", "TEXT"], ["promoted_at", "TEXT"], ["created_at", "TEXT"]
  ];
  for (const [name, def] of liveColumns) {
    try { schemaActions.push({ action: "add_column_if_missing", table: "bullpen_history", ...(await addColumnIfMissing(db, "bullpen_history", name, def)) }); }
    catch (err) { schemaActions.push({ action: "add_column_if_missing", table: "bullpen_history", column: name, added: false, error: String(err && err.message ? err.message : err) }); }
  }

  for (const liveIndexSql of [
    `CREATE INDEX IF NOT EXISTS idx_bullpen_history_game_team_pitcher ON bullpen_history(game_pk, team_id, pitcher_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bullpen_history_batch ON bullpen_history(batch_id)`
  ]) {
    try { await run(db, liveIndexSql); schemaActions.push({ action: "run_live_index_after_columns", ok: true, sql_preview: liveIndexSql.slice(0, 100) }); }
    catch (err) { schemaActions.push({ action: "run_live_index_after_columns", ok: false, sql_preview: liveIndexSql.slice(0, 100), error: String(err && err.message ? err.message : err) }); }
  }

  const batchColumns = [
    ["stage_only", "INTEGER DEFAULT 1"], ["rows_promoted", "INTEGER DEFAULT 0"], ["schedule_start_date", "TEXT"], ["schedule_end_date", "TEXT"],
    ["total_game_count", "INTEGER DEFAULT 0"], ["processed_game_count", "INTEGER DEFAULT 0"], ["remaining_game_count", "INTEGER DEFAULT 0"],
    ["last_processed_game_pk", "INTEGER"], ["partial_continue_count", "INTEGER DEFAULT 0"], ["finalization_only", "INTEGER DEFAULT 0"]
  ];
  for (const [name, def] of batchColumns) {
    try { schemaActions.push({ action: "add_column_if_missing", table: "bullpen_history_batches", ...(await addColumnIfMissing(db, "bullpen_history_batches", name, def)) }); }
    catch (err) { schemaActions.push({ action: "add_column_if_missing", table: "bullpen_history_batches", column: name, added: false, error: String(err && err.message ? err.message : err) }); }
  }

  await run(db, `INSERT OR REPLACE INTO team_schema_migrations (migration_key, package_version, notes) VALUES ('bullpen_history_v0_4_0_delta_update_retained_repair', ?, 'v0.4.0 adds delta_update with retained-stage restore, scoped source repair, no-op current-state, and backend continuation readiness')`, VERSION);
  return schemaActions;
}

async function insertOutcome(env, row) {
  await run(env.TEAM_DB,
    `INSERT INTO bullpen_history_outcomes (outcome_id,batch_id,run_id,request_id,game_pk,game_date,season,team_id,opponent_team_id,pitcher_id,bullpen_key,outcome_level,outcome_category,status,reason,source_endpoint,source_key,source_confidence,source_snapshot_date,details_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    rid("bh_outcome"), row.batch_id || null, row.run_id || null, row.request_id || null, row.game_pk || null, row.game_date || null, row.season || null, row.team_id == null ? null : String(row.team_id), row.opponent_team_id == null ? null : String(row.opponent_team_id), row.pitcher_id || null, row.bullpen_key || null,
    row.outcome_level || null, row.outcome_category || null, row.status || null, row.reason || null, row.source_endpoint || null, row.source_key || SOURCE_KEY, row.source_confidence || SOURCE_CONFIDENCE, row.source_snapshot_date || ymd(nowUtc()), safeJson(row.details || null)
  );
}

function scheduleEndpointCandidates(sampleDate) {
  const d = ymd(sampleDate || DEFAULT_SAMPLE_DATE);
  return [
    `/api/v1/schedule?sportId=1&gameType=R&startDate=${d}&endDate=${d}`,
    `/api/v1/schedule?sportId=1&startDate=${d}&endDate=${d}`,
    `/api/v1/schedule?sportId=1&date=${d}`,
    `/api/v1/schedule?sportId=1&gameTypes=R&startDate=${d}&endDate=${d}`
  ];
}
function mlbBase(env) {
  let base = String((env && env.MLB_API_BASE_URL) || "https://statsapi.mlb.com").replace(/\/+$/, "");
  // Some deployed environments store MLB_API_BASE_URL as https://statsapi.mlb.com/api/v1.
  // This worker keeps endpoint paths in official /api/v1/... form, so normalize the base
  // back to the StatsAPI origin to avoid api/v1/api/v1 double-prefix 404s.
  base = base.replace(/\/api\/v1$/i, "");
  return base || "https://statsapi.mlb.com";
}
function normalizeMlbEndpoint(endpoint) {
  const e = String(endpoint || "");
  return e.startsWith("/") ? e : `/${e}`;
}
async function fetchMlbJson(env, endpoint) {
  const normalizedEndpoint = normalizeMlbEndpoint(endpoint);
  const url = `${mlbBase(env)}${normalizedEndpoint}`;
  const headers = { "accept": "application/json" };
  if (env && env.MLB_API_USER_AGENT) headers["user-agent"] = String(env.MLB_API_USER_AGENT);
  try {
    const resp = await fetch(url, { headers });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: resp.ok && !!json, http_status: resp.status, endpoint: normalizedEndpoint, url, json, text_preview: text.slice(0, 500) };
  } catch (err) {
    return { ok: false, http_status: 0, endpoint: normalizedEndpoint, url, json: null, text_preview: String(err && err.message ? err.message : err).slice(0, 500) };
  }
}
async function fetchScheduleWithFallbacks(env, sampleDate) {
  const attempts = [];
  for (const endpoint of scheduleEndpointCandidates(sampleDate)) {
    const res = await fetchMlbJson(env, endpoint);
    attempts.push({ endpoint, ok: res.ok && res.json && Array.isArray(res.json.dates), http_status: res.http_status, has_dates_array: !!(res.json && Array.isArray(res.json.dates)), text_preview: res.text_preview });
    if (res.ok && res.json && Array.isArray(res.json.dates)) return { ok: true, endpoint, json: res.json, attempts };
  }
  return { ok: false, endpoint: attempts.length ? attempts[attempts.length - 1].endpoint : null, json: null, attempts };
}
function isFinalRegularSeasonGame(game) {
  const status = game && game.status ? game.status : {};
  const detailed = String(status.detailedState || "").toLowerCase();
  const coded = String(status.statusCode || status.codedGameState || "").toUpperCase();
  const gameType = String(game && game.gameType || "").toUpperCase();
  const isFinal = coded === "F" || detailed === "final" || detailed === "game over" || detailed.includes("final");
  return isFinal && (!gameType || gameType === "R");
}
function teamBox(boxscore, side) { return boxscore && boxscore.teams && boxscore.teams[side] ? boxscore.teams[side] : null; }
function teamIdFromBox(box) { return box && box.team && box.team.id != null ? String(box.team.id) : null; }
function playerNodeByPitcherId(box, pitcherId) {
  const players = (box && box.players) || {};
  const direct = players[`ID${pitcherId}`];
  if (direct) return direct;
  for (const key of Object.keys(players)) {
    const p = players[key];
    if (p && p.person && String(p.person.id) === String(pitcherId)) return p;
  }
  return null;
}
function statLine(playerNode) { return playerNode && playerNode.stats && playerNode.stats.pitching ? playerNode.stats.pitching : {}; }
function inningsToDecimal(ip, outs) {
  if (outs != null) return Number((Number(outs) / 3).toFixed(3));
  const text = String(ip || "");
  if (!text) return null;
  const parts = text.split(".");
  const whole = Number(parts[0] || 0);
  const fracOuts = Number(parts[1] || 0);
  if (!Number.isFinite(whole) || !Number.isFinite(fracOuts)) return null;
  return Number((whole + fracOuts / 3).toFixed(3));
}
function fieldPresence(line) {
  const fields = ["gamesStarted", "gamesPitched", "inningsPitched", "outs", "battersFaced", "numberOfPitches", "strikes", "hits", "runs", "earnedRuns", "baseOnBalls", "strikeOuts", "homeRuns", "holds", "saves", "blownSaves", "inheritedRunners", "inheritedRunnersScored"];
  const out = {};
  for (const f of fields) out[f] = Object.prototype.hasOwnProperty.call(line || {}, f);
  return out;
}
function bullpenStageRowFromPitcher({ game, boxscore, side, pitcherId, pitcherOrderIndex, bullpenIndex, batchId, runId, requestId, endpoint, ingestionMode = "source_lock_probe", certificationStatus = "BULLPEN_HISTORY_SOURCE_PROBE_ONLY", certificationGrade = "PROBE_ONLY" }) {
  const box = teamBox(boxscore, side);
  const oppSide = side === "home" ? "away" : "home";
  const oppBox = teamBox(boxscore, oppSide);
  const player = playerNodeByPitcherId(box, pitcherId);
  const line = statLine(player);
  const teamId = teamIdFromBox(box);
  const oppId = teamIdFromBox(oppBox);
  const gamePk = num(game.gamePk);
  const gameDate = ymd(game.officialDate || game.gameDate);
  const season = seasonFromDate(gameDate);
  const gamesStarted = line.gamesStarted == null ? null : asInt(line.gamesStarted);
  const bullpenKey = `${gamePk}_${teamId}_${pitcherId}`;
  const outs = line.outs == null ? null : asInt(line.outs);
  const fieldMap = fieldPresence(line);
  return {
    stage_id: `bh_stage_${batchId}_${bullpenKey}`,
    bullpen_key: bullpenKey,
    game_pk: gamePk,
    game_date: gameDate,
    season,
    game_type: str(game.gameType || "R"),
    game_status: str(game.status && (game.status.detailedState || game.status.statusCode)),
    team_id: teamId,
    team_name: str(box && box.team && box.team.name),
    opponent_team_id: oppId,
    opponent_team_name: str(oppBox && oppBox.team && oppBox.team.name),
    is_home: side === "home" ? 1 : 0,
    venue_id: game.venue && game.venue.id != null ? num(game.venue.id) : null,
    pitcher_id: num(pitcherId),
    pitcher_name: str(player && player.person && player.person.fullName),
    pitcher_hand: str(player && player.person && player.person.pitchHand && player.person.pitchHand.code),
    pitcher_role: "reliever",
    relief_classification: gamesStarted === 0 ? "official_boxscore_gamesStarted_0" : "unlocked_missing_or_nonzero_gamesStarted",
    relief_appearance: gamesStarted === 0 ? 1 : 0,
    games_started: gamesStarted,
    games_pitched: line.gamesPitched == null ? null : asInt(line.gamesPitched),
    pitcher_order_index: pitcherOrderIndex,
    bullpen_appearance_index: bullpenIndex,
    innings_pitched: str(line.inningsPitched),
    innings_pitched_decimal: inningsToDecimal(line.inningsPitched, outs),
    outs_recorded: outs,
    batters_faced: line.battersFaced == null ? null : asInt(line.battersFaced),
    pitches: line.numberOfPitches == null ? null : asInt(line.numberOfPitches),
    strikes: line.strikes == null ? null : asInt(line.strikes),
    hits_allowed: line.hits == null ? null : asInt(line.hits),
    runs_allowed: line.runs == null ? null : asInt(line.runs),
    earned_runs: line.earnedRuns == null ? null : asInt(line.earnedRuns),
    walks_allowed: line.baseOnBalls == null ? null : asInt(line.baseOnBalls),
    strikeouts: line.strikeOuts == null ? null : asInt(line.strikeOuts),
    home_runs_allowed: line.homeRuns == null ? null : asInt(line.homeRuns),
    inherited_runners: line.inheritedRunners == null ? null : asInt(line.inheritedRunners),
    inherited_runners_scored: line.inheritedRunnersScored == null ? null : asInt(line.inheritedRunnersScored),
    holds: line.holds == null ? null : asInt(line.holds),
    saves: line.saves == null ? null : asInt(line.saves),
    blown_saves: line.blownSaves == null ? null : asInt(line.blownSaves),
    field_map_json: safeJson(fieldMap),
    source_path: `boxscore.teams.${side}.players.ID${pitcherId}.stats.pitching`,
    data_feed_key: "bullpen_history_relief_appearance",
    source_key: SOURCE_KEY,
    source_endpoint: endpoint,
    source_season: season,
    source_game_type: str(game.gameType || "R"),
    ingestion_mode: ingestionMode,
    batch_id: batchId,
    run_id: runId,
    request_id: requestId,
    certification_status: certificationStatus,
    certification_grade: certificationGrade,
    source_confidence: SOURCE_CONFIDENCE,
    source_snapshot_date: gameDate,
    raw_json: safeJson({ side, game_summary: game, pitcher_id: pitcherId, player_node: player, pitching_line: line })
  };
}
async function insertStageRow(env, row) {
  // v0.2.2: make staging idempotent by bullpen_key, not only stage_id.
  // This protects active/resumed batches that still contain pre-v0.2.1 random stage_id rows.
  await run(env.TEAM_DB, `DELETE FROM bullpen_history_stage WHERE batch_id=? AND bullpen_key=?`, row.batch_id, row.bullpen_key);
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO bullpen_history_stage (
      stage_id,bullpen_key,game_pk,game_date,season,game_type,game_status,team_id,team_name,opponent_team_id,opponent_team_name,is_home,venue_id,pitcher_id,pitcher_name,pitcher_hand,pitcher_role,relief_classification,relief_appearance,games_started,games_pitched,pitcher_order_index,bullpen_appearance_index,innings_pitched,innings_pitched_decimal,outs_recorded,batters_faced,pitches,strikes,hits_allowed,runs_allowed,earned_runs,walks_allowed,strikeouts,home_runs_allowed,inherited_runners,inherited_runners_scored,holds,saves,blown_saves,field_map_json,source_path,data_feed_key,source_key,source_endpoint,source_season,source_game_type,ingestion_mode,batch_id,run_id,request_id,certification_status,certification_grade,source_confidence,source_snapshot_date,raw_json,created_at,updated_at,certified_at,promoted_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,NULL)`,
    row.stage_id,row.bullpen_key,row.game_pk,row.game_date,row.season,row.game_type,row.game_status,row.team_id,row.team_name,row.opponent_team_id,row.opponent_team_name,row.is_home,row.venue_id,row.pitcher_id,row.pitcher_name,row.pitcher_hand,row.pitcher_role,row.relief_classification,row.relief_appearance,row.games_started,row.games_pitched,row.pitcher_order_index,row.bullpen_appearance_index,row.innings_pitched,row.innings_pitched_decimal,row.outs_recorded,row.batters_faced,row.pitches,row.strikes,row.hits_allowed,row.runs_allowed,row.earned_runs,row.walks_allowed,row.strikeouts,row.home_runs_allowed,row.inherited_runners,row.inherited_runners_scored,row.holds,row.saves,row.blown_saves,row.field_map_json,row.source_path,row.data_feed_key,row.source_key,row.source_endpoint,row.source_season,row.source_game_type,row.ingestion_mode,row.batch_id,row.run_id,row.request_id,row.certification_status,row.certification_grade,row.source_confidence,row.source_snapshot_date,row.raw_json
  );
}



async function repairDuplicateStageKeysForBatch(env, batchId) {
  const before = await first(env.TEAM_DB, `SELECT COALESCE(SUM(c-1),0) AS duplicate_count FROM (SELECT bullpen_key, COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? GROUP BY bullpen_key HAVING COUNT(*)>1)`, batchId);
  const beforeCount = Number(before && before.duplicate_count || 0);
  if (beforeCount > 0) {
    await run(env.TEAM_DB,
      `DELETE FROM bullpen_history_stage
       WHERE batch_id=?
         AND rowid NOT IN (
           SELECT MIN(rowid)
           FROM bullpen_history_stage
           WHERE batch_id=?
           GROUP BY bullpen_key
         )`,
      batchId, batchId
    );
  }
  const after = await first(env.TEAM_DB, `SELECT COALESCE(SUM(c-1),0) AS duplicate_count FROM (SELECT bullpen_key, COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? GROUP BY bullpen_key HAVING COUNT(*)>1)`, batchId);
  return { before: beforeCount, after: Number(after && after.duplicate_count || 0), repaired: Math.max(0, beforeCount - Number(after && after.duplicate_count || 0)) };
}
async function ensureStageUniqueIndexIfClean(env, batchId) {
  const dup = await first(env.TEAM_DB, `SELECT COALESCE(SUM(c-1),0) AS duplicate_count FROM (SELECT bullpen_key, COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? GROUP BY bullpen_key HAVING COUNT(*)>1)`, batchId);
  if (Number(dup && dup.duplicate_count || 0) === 0) {
    await run(env.TEAM_DB, `CREATE UNIQUE INDEX IF NOT EXISTS idx_bullpen_history_stage_batch_key_unique ON bullpen_history_stage(batch_id,bullpen_key)`);
    return true;
  }
  return false;
}

async function fetchScheduleRange(env, startDate, endDate) {
  const endpoint = `/api/v1/schedule?sportId=1&gameType=R&startDate=${ymd(startDate)}&endDate=${ymd(endDate)}`;
  const res = await fetchMlbJson(env, endpoint);
  if (!(res.ok && res.json && Array.isArray(res.json.dates))) return { ok: false, endpoint, json: null, http_status: res.http_status, text_preview: res.text_preview };
  return { ok: true, endpoint, json: res.json, http_status: res.http_status };
}
function finalGamesFromSchedule(scheduleJson) {
  const games = [];
  for (const dateNode of ((scheduleJson && scheduleJson.dates) || [])) {
    for (const game of (dateNode.games || [])) if (isFinalRegularSeasonGame(game)) games.push(game);
  }
  games.sort((a,b) => String(a.officialDate || a.gameDate || '').localeCompare(String(b.officialDate || b.gameDate || '')) || Number(a.gamePk||0)-Number(b.gamePk||0));
  return games;
}
async function processedGamePkSet(env, batchId) {
  const rows = await all(env.TEAM_DB, `SELECT DISTINCT game_pk FROM bullpen_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status IN ('GAME_STAGED_STAGE_ONLY','GAME_ZERO_BULLPEN_ROWS_REPRESENTED')`, batchId);
  return new Set(rows.map(r => Number(r.game_pk)).filter(Number.isFinite));
}
async function processBullpenGameToStage(env, { game, batchId, runId, requestId, endpoint, season, ingestionMode }) {
  const gamePk = num(game.gamePk);
  const gameDate = ymd(game.officialDate || game.gameDate);
  const box = await fetchMlbJson(env, endpoint);
  let sourceErrors = 0, unclear = 0, stagedRows = 0, zeroBullpenTeams = 0, gamesStartedZeroRows = 0, gamesStartedMissingRows = 0, openerBulkEdgeCases = 0;
  const fieldSeen = {};
  if (!box.ok || !box.json) {
    sourceErrors += 1;
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: "GAME", outcome_category: "SOURCE_ERROR", status: "SOURCE_ERROR", reason: "boxscore_http_error", source_endpoint: endpoint, details: { http_status: box.http_status, text_preview: box.text_preview } });
    return { sourceErrors, unclear, stagedRows, zeroBullpenTeams, gamesStartedZeroRows, gamesStartedMissingRows, openerBulkEdgeCases, fieldSeen, externalCalls: 1 };
  }
  for (const side of ["away", "home"]) {
    const boxSide = teamBox(box.json, side);
    const oppSide = side === "home" ? "away" : "home";
    const oppBox = teamBox(box.json, oppSide);
    const teamId = teamIdFromBox(boxSide);
    const oppId = teamIdFromBox(oppBox);
    const pitchers = Array.isArray(boxSide && boxSide.pitchers) ? boxSide.pitchers.map(x => num(x)).filter(x => x != null) : [];
    let starters = 0, relievers = 0, missingGs = 0, bullpenIndex = 0;
    for (let i = 0; i < pitchers.length; i++) {
      const pitcherId = pitchers[i];
      const player = playerNodeByPitcherId(boxSide, pitcherId);
      const line = statLine(player);
      const fp = fieldPresence(line);
      for (const [k, v] of Object.entries(fp)) fieldSeen[k] = Boolean(fieldSeen[k] || v);
      const gs = line.gamesStarted == null ? null : asInt(line.gamesStarted);
      if (gs === 1) { starters += 1; continue; }
      if (gs === 0) {
        relievers += 1;
        gamesStartedZeroRows += 1;
        const stageRow = bullpenStageRowFromPitcher({ game, boxscore: box.json, side, pitcherId, pitcherOrderIndex: i, bullpenIndex, batchId, runId, requestId, endpoint, ingestionMode, certificationStatus: "BULLPEN_HISTORY_BASE_BACKFILL_STAGE_ONLY", certificationGrade: "STAGE_ONLY" });
        bullpenIndex += 1;
        await insertStageRow(env, stageRow); stagedRows += 1;
        await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, pitcher_id: pitcherId, bullpen_key: stageRow.bullpen_key, outcome_level: "BULLPEN_APPEARANCE", outcome_category: "STAGED_ROWS", status: "STAGED_BASE_ONLY", reason: "official_final_boxscore_gamesStarted_0_identified_relief_pitcher_appearance_base_stage_only", source_endpoint: endpoint, details: { side, bullpen_key: stageRow.bullpen_key, no_live_promotion: true, field_presence: fp } });
      } else {
        missingGs += 1; gamesStartedMissingRows += 1; unclear += 1;
        await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, pitcher_id: pitcherId, outcome_level: "BULLPEN_APPEARANCE", outcome_category: "UNCLEAR", status: "UNCLEAR", reason: "pitcher_gamesStarted_missing_cannot_classify_as_relief_without_guessing", source_endpoint: endpoint, details: { side, pitcher_id: pitcherId, pitcher_order_index: i, line_keys: Object.keys(line || {}) } });
      }
    }
    if (starters !== 1 && pitchers.length > 0) openerBulkEdgeCases += 1;
    if (relievers === 0) zeroBullpenTeams += 1;
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, outcome_level: "TEAM", outcome_category: relievers > 0 ? "TEAM_BULLPEN_ROWS_STAGED" : "TRUE_NO_DATA", status: relievers > 0 ? "TEAM_STAGED_BASE_ONLY" : "TEAM_ZERO_BULLPEN_ROWS_REPRESENTED", reason: relievers > 0 ? "team_relief_pitcher_appearances_staged_from_final_boxscore_base_stage_only" : "zero_relief_pitchers_in_final_boxscore_represented_without_false_failure", source_endpoint: endpoint, details: { side, starters, relievers, missingGs, pitcher_count: pitchers.length, no_live_promotion: true } });
  }
  await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: "GAME", outcome_category: "GAME_SOURCE_PROBED", status: "GAME_STAGED_STAGE_ONLY", reason: "completed_final_game_boxscore_staged_for_variable_bullpen_appearance_rows_base_stage_only", source_endpoint: endpoint, details: { no_live_promotion: true, variable_bullpen_rows: true } });
  return { sourceErrors, unclear, stagedRows, zeroBullpenTeams, gamesStartedZeroRows, gamesStartedMissingRows, openerBulkEdgeCases, fieldSeen, externalCalls: 1 };
}
async function summarizeBatch(env, batchId) {
  const dup = await first(env.TEAM_DB, `SELECT COALESCE(SUM(c-1),0) AS duplicate_count FROM (SELECT bullpen_key, COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? GROUP BY bullpen_key HAVING COUNT(*)>1)`, batchId);
  const stage = await first(env.TEAM_DB, `SELECT COUNT(*) AS rows FROM bullpen_history_stage WHERE batch_id=?`, batchId);
  const games = await first(env.TEAM_DB, `SELECT COUNT(DISTINCT game_pk) AS games FROM bullpen_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status IN ('GAME_STAGED_STAGE_ONLY','GAME_STAGED_DELTA_ONLY')`, batchId);
  const errors = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_outcomes WHERE batch_id=? AND outcome_category='SOURCE_ERROR'`, batchId);
  const unclear = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_outcomes WHERE batch_id=? AND outcome_category='UNCLEAR'`, batchId);
  const zeroTeams = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_outcomes WHERE batch_id=? AND outcome_level='TEAM' AND outcome_category='TRUE_NO_DATA'`, batchId);
  const missing = await first(env.TEAM_DB, `SELECT
    SUM(CASE WHEN game_pk IS NULL THEN 1 ELSE 0 END) AS missing_game_pk,
    SUM(CASE WHEN game_date IS NULL OR game_date='' THEN 1 ELSE 0 END) AS missing_game_date,
    SUM(CASE WHEN team_id IS NULL OR team_id='' THEN 1 ELSE 0 END) AS missing_team_id,
    SUM(CASE WHEN opponent_team_id IS NULL OR opponent_team_id='' THEN 1 ELSE 0 END) AS missing_opponent_team_id,
    SUM(CASE WHEN pitcher_id IS NULL THEN 1 ELSE 0 END) AS missing_pitcher_id,
    SUM(CASE WHEN relief_appearance<>1 OR games_started<>0 THEN 1 ELSE 0 END) AS invalid_relief_classification,
    SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS raw_json_missing,
    SUM(CASE WHEN data_feed_key IS NULL OR source_key IS NULL OR source_endpoint IS NULL OR ingestion_mode IS NULL OR batch_id IS NULL OR run_id IS NULL THEN 1 ELSE 0 END) AS lineage_missing_count
    FROM bullpen_history_stage WHERE batch_id=?`, batchId);
  return {
    staged_bullpen_rows: Number(stage && stage.rows || 0),
    processed_game_count: Number(games && games.games || 0),
    duplicate_stage_keys: Number(dup && dup.duplicate_count || 0),
    source_error_count: Number(errors && errors.c || 0),
    unclear_count: Number(unclear && unclear.c || 0),
    teams_with_zero_bullpen_rows: Number(zeroTeams && zeroTeams.c || 0),
    missing: missing || {}
  };
}
async function runBaseBackfillStageOnly(env, input = {}) {
  const schemaActions = await ensureSchema(env);
  const requestId = input.request_id || rid("bullpen_base_stage_request");
  const chainId = input.chain_id || rid("bullpen_base_stage_chain");
  const runId = input.run_id || rid("bullpen_base_stage_run");
  const startDate = ymd(input.base_backfill_start_date || input.start_date || DEFAULT_BASE_START_DATE);
  const cutoffDate = ymd(input.base_backfill_cutoff_date || input.cutoff_date || DEFAULT_BASE_CUTOFF_DATE);
  const season = seasonFromDate(cutoffDate);
  const chunkGames = Math.max(1, Math.min(Number(input.max_games_per_tick || input.chunk_games || DEFAULT_BASE_CHUNK_GAMES), 35));
  let externalCalls = 0;
  let batch = await first(env.TEAM_DB, `SELECT * FROM bullpen_history_batches WHERE request_id=? AND ingestion_mode='base_backfill_stage_only' ORDER BY datetime(created_at) DESC LIMIT 1`, requestId);
  const batchId = batch && batch.batch_id ? batch.batch_id : (input.batch_id || rid("bullpen_base_stage_batch"));
  if (!batch) {
    await run(env.TEAM_DB,
      `INSERT OR REPLACE INTO bullpen_history_batches (batch_id,run_id,request_id,chain_id,job_key,worker_name,version,ingestion_mode,probe_only,stage_only,rows_promoted,source_key,source_confidence,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,schedule_start_date,schedule_end_date,status,certification_status,certification_grade,output_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,'base_backfill_stage_only',0,1,0,?,?,?,'R',?,?,?,?, 'RUNNING_BASE_BACKFILL_STAGE_ONLY','BASE_BULLPEN_HISTORY_BASE_STAGE_ONLY_RUNNING','STAGE_ONLY',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, cutoffDate, DEFAULT_DELTA_RESERVED_START_DATE, startDate, cutoffDate
    );
  } else {
    await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET run_id=?, version=?, status='RUNNING_BASE_BACKFILL_STAGE_ONLY', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, runId, VERSION, batchId);
  }

  const duplicateRepairAtStart = await repairDuplicateStageKeysForBatch(env, batchId);
  const uniqueStageIndexReady = await ensureStageUniqueIndexIfClean(env, batchId);

  const schedule = await fetchScheduleRange(env, startDate, cutoffDate); externalCalls += 1;
  if (!schedule.ok) {
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_date: cutoffDate, season, outcome_level: "SOURCE", outcome_category: "SOURCE_ERROR", status: "SCHEDULE_RANGE_FAILED", reason: "schedule_range_endpoint_failed", source_endpoint: schedule.endpoint, details: schedule });
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, batch_id: batchId, status: "BASE_BACKFILL_STAGE_ONLY_BLOCKED_SCHEDULE", certification: "BASE_BULLPEN_HISTORY_STAGE_ONLY_SCHEDULE_FAILED", external_calls_performed: externalCalls, no_live_promotion: true };
    await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET status='FAILED_BASE_STAGE_SCHEDULE', certification_status='BASE_BULLPEN_HISTORY_STAGE_ONLY_SCHEDULE_FAILED', certification_grade='STAGE_BLOCKED', source_error_count=source_error_count+1, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, safeJson(output), batchId);
    return output;
  }
  const finalGames = finalGamesFromSchedule(schedule.json);
  await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_date: cutoffDate, season, outcome_level: "SOURCE", outcome_category: "SOURCE_PROBE", status: "SCHEDULE_RANGE_ENDPOINT_OK", reason: "schedule_range_endpoint_returned_final_regular_season_games", source_endpoint: schedule.endpoint, details: { start_date: startDate, cutoff_date: cutoffDate, final_games: finalGames.length } });
  const processed = await processedGamePkSet(env, batchId);
  const todo = finalGames.filter(g => !processed.has(Number(g.gamePk))).slice(0, chunkGames);
  let tickStagedRows = 0, tickSourceErrors = 0, tickUnclear = 0, tickZeroTeams = 0, tickGamesStartedMissing = 0, tickRelievers = 0, tickOpenerBulk = 0;
  const fieldsSeen = {};
  for (const game of todo) {
    const gamePk = num(game.gamePk);
    const endpoint = `/api/v1/game/${gamePk}/boxscore`;
    const res = await processBullpenGameToStage(env, { game, batchId, runId, requestId, endpoint, season, ingestionMode: "base_backfill_stage_only" });
    externalCalls += res.externalCalls || 0;
    tickStagedRows += res.stagedRows || 0;
    tickSourceErrors += res.sourceErrors || 0;
    tickUnclear += res.unclear || 0;
    tickZeroTeams += res.zeroBullpenTeams || 0;
    tickGamesStartedMissing += res.gamesStartedMissingRows || 0;
    tickRelievers += res.gamesStartedZeroRows || 0;
    tickOpenerBulk += res.openerBulkEdgeCases || 0;
    for (const [k,v] of Object.entries(res.fieldSeen || {})) fieldsSeen[k] = Boolean(fieldsSeen[k] || v);
  }
  const duplicateRepairAfterTick = await repairDuplicateStageKeysForBatch(env, batchId);
  const uniqueStageIndexReadyAfterTick = await ensureStageUniqueIndexIfClean(env, batchId);
  const summary = await summarizeBatch(env, batchId);
  const processedNow = await processedGamePkSet(env, batchId);
  const remaining = Math.max(0, finalGames.length - processedNow.size);
  const missing = summary.missing || {};
  const requiredCoreOk = summary.staged_bullpen_rows > 0 && summary.duplicate_stage_keys === 0 && summary.source_error_count === 0 && summary.unclear_count === 0 && Number(missing.invalid_relief_classification || 0) === 0 && Number(missing.raw_json_missing || 0) === 0 && Number(missing.lineage_missing_count || 0) === 0;
  const complete = remaining === 0;
  const status = complete ? (requiredCoreOk ? "BASE_BACKFILL_STAGE_ONLY_CERTIFIED" : "BASE_BACKFILL_STAGE_ONLY_REVIEW_REQUIRED") : "PARTIAL_CONTINUE";
  const certification = complete ? (requiredCoreOk ? "BASE_BULLPEN_HISTORY_BASE_STAGE_ONLY_CERTIFIED_READY_FOR_PROMOTION_REVIEW" : "BASE_BULLPEN_HISTORY_BASE_STAGE_ONLY_REVIEW_REQUIRED") : "BASE_BULLPEN_HISTORY_BASE_STAGE_ONLY_PARTIAL_CONTINUE";
  const grade = complete ? (requiredCoreOk ? "STAGE_PASS" : "STAGE_REVIEW") : "STAGE_PARTIAL";
  const output = {
    ok: true,
    data_ok: complete ? requiredCoreOk : true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    run_id: runId,
    batch_id: batchId,
    mode: "base_backfill_stage_only",
    status,
    certification,
    certification_grade: grade,
    source_shape_classification: "GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS",
    schedule_endpoint_selected: schedule.endpoint,
    base_backfill_start_date: startDate,
    base_backfill_cutoff_date: cutoffDate,
    delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
    total_final_regular_season_games: finalGames.length,
    games_processed_total: processedNow.size,
    games_processed_this_tick: todo.length,
    remaining_game_count: remaining,
    chunk_games: chunkGames,
    expected_game_count: finalGames.length,
    expected_bullpen_rows: summary.staged_bullpen_rows,
    staged_bullpen_rows: summary.staged_bullpen_rows,
    tick_staged_bullpen_rows: tickStagedRows,
    duplicate_stage_keys: summary.duplicate_stage_keys,
    source_error_count: summary.source_error_count,
    unclear_count: summary.unclear_count,
    games_started_missing_rows: Number(missing.invalid_relief_classification || 0),
    teams_with_zero_bullpen_rows: summary.teams_with_zero_bullpen_rows,
    missing,
    rows_read: todo.length,
    rows_written: tickStagedRows,
    writes_performed: tickStagedRows,
    rows_promoted: 0,
    external_calls_performed: externalCalls,
    continuation_required: !complete,
    orchestrator_should_self_continue: !complete,
    no_live_promotion: true,
    no_delta_update_execution: true,
    no_daily_bullpen_availability: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_board_mutation: true,
    next_safe_step: complete && requiredCoreOk ? "v0.2.1_or_v0.3.0_promotion_design_after_user_review" : "continue_backend_until_stage_only_complete",
    timestamp_utc: nowUtc()
  };
  await run(env.TEAM_DB,
    `UPDATE bullpen_history_batches SET source_shape_classification='GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS', relief_identification_path=?, starter_exclusion_path=?, safest_key_model=?, expected_game_count=?, expected_bullpen_rows=?, staged_bullpen_rows=?, duplicate_stage_keys=?, final_games_sampled=?, teams_with_zero_bullpen_rows=?, games_started_zero_reliever_rows=games_started_zero_reliever_rows+?, games_started_missing_rows=?, opener_bulk_edge_case_count=opener_bulk_edge_case_count+?, source_error_count=?, unclear_count=?, status=?, certification_status=?, certification_grade=?, output_json=?, total_game_count=?, processed_game_count=?, remaining_game_count=?, last_processed_game_pk=?, partial_continue_count=partial_continue_count+?, rows_promoted=0, stage_only=1, finalization_only=?, certified_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE certified_at END, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    "MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.pitchers[] -> players.ID*.stats.pitching.gamesStarted == 0",
    "Exclude actual starters using final boxscore stats.pitching.gamesStarted == 1; opener/bulk labels are not guessed in base history.",
    "game_pk + team_id + pitcher_id",
    finalGames.length, summary.staged_bullpen_rows, summary.staged_bullpen_rows, summary.duplicate_stage_keys, processedNow.size, summary.teams_with_zero_bullpen_rows,
    tickRelievers, Number(missing.invalid_relief_classification || 0), tickOpenerBulk, summary.source_error_count, summary.unclear_count, status, certification, grade, safeJson(output), finalGames.length, processedNow.size, remaining, todo.length ? num(todo[todo.length-1].gamePk) : null, complete ? 0 : 1, complete ? 1 : 0, complete ? 1 : 0, batchId
  );
  if (complete) {
    await run(env.TEAM_DB,
      `INSERT OR REPLACE INTO bullpen_history_certifications (certification_id,batch_id,run_id,request_id,certification_status,certification_grade,expected_game_count,expected_bullpen_rows,staged_bullpen_rows,rows_promoted,duplicate_stage_keys,non_final_games,source_error_count,repair_required_count,unclear_count,missing_game_pk,missing_game_date,missing_team_id,missing_opponent_team_id,missing_pitcher_id,starter_rows_included,invalid_relief_classification,raw_json_missing,lineage_missing_count,source_shape_classification,relief_identification_path,starter_exclusion_path,safest_key_model,field_map_json,details_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,?,0,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      rid("bh_cert"), batchId, runId, requestId, certification, grade, finalGames.length, summary.staged_bullpen_rows, summary.staged_bullpen_rows, summary.duplicate_stage_keys, summary.source_error_count, summary.unclear_count,
      missing.missing_game_pk || 0, missing.missing_game_date || 0, missing.missing_team_id || 0, missing.missing_opponent_team_id || 0, missing.missing_pitcher_id || 0, 0, missing.invalid_relief_classification || 0, missing.raw_json_missing || 0, missing.lineage_missing_count || 0,
      "GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS", "boxscore gamesStarted == 0", "boxscore gamesStarted == 1 excluded", "game_pk + team_id + pitcher_id", safeJson(fieldsSeen), safeJson(output)
    );
  }
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO bullpen_history_cursor (cursor_key,ingestion_mode,source_key,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,last_sample_date,last_game_pk,last_batch_id,last_request_id,status,cursor_json,created_at,updated_at)
     VALUES ('bullpen_history_base_backfill_stage_only_cursor','base_backfill_stage_only',?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    SOURCE_KEY, season, "R", cutoffDate, DEFAULT_DELTA_RESERVED_START_DATE, cutoffDate, todo.length ? num(todo[todo.length-1].gamePk) : null, batchId, requestId, status, safeJson({ total_game_count: finalGames.length, processed_game_count: processedNow.size, remaining_game_count: remaining, no_live_promotion: true })
  );
  return output;
}

async function runSourceProbe(env, input = {}) {
  const schemaActions = await ensureSchema(env);
  const requestId = input.request_id || rid("bullpen_probe_request");
  const chainId = input.chain_id || rid("bullpen_probe_chain");
  const runId = input.run_id || rid("bullpen_probe_run");
  const batchId = input.batch_id || rid("bullpen_probe_batch");
  const sampleDate = ymd(input.sample_date || input.sample_start_date || DEFAULT_SAMPLE_DATE);
  const sampleLimit = Math.max(1, Math.min(Number(input.sample_limit || DEFAULT_SAMPLE_LIMIT), 5));
  const season = seasonFromDate(sampleDate);
  const scheduleEndpointsAttempted = scheduleEndpointCandidates(sampleDate);
  let externalCalls = 0;

  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO bullpen_history_batches (batch_id,run_id,request_id,chain_id,job_key,worker_name,version,ingestion_mode,probe_only,source_key,source_confidence,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,sample_start_date,sample_end_date,sample_limit,status,certification_status,certification_grade,output_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'source_lock_probe',1,?,?,?,'R',?,?,?,?,?,'RUNNING_SOURCE_PROBE','BULLPEN_HISTORY_SOURCE_PROBE_RUNNING','PROBE_ONLY',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, sampleDate, sampleDate, sampleLimit
  );

  const schedule = await fetchScheduleWithFallbacks(env, sampleDate); externalCalls += schedule.attempts.length;
  for (const attempt of schedule.attempts) {
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_date: sampleDate, season, outcome_level: "SOURCE", outcome_category: attempt.ok ? "SOURCE_PROBE" : "SOURCE_ERROR", status: attempt.ok ? "SCHEDULE_ENDPOINT_OK" : "SCHEDULE_ENDPOINT_FAILED", reason: attempt.ok ? "schedule_endpoint_returned_usable_dates_array" : "schedule_endpoint_http_or_shape_error", source_endpoint: attempt.endpoint, details: attempt });
  }
  if (!schedule.ok) {
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "SOURCE_PROBE_BLOCKED_SCHEDULE", certification: "BULLPEN_HISTORY_SOURCE_PROBE_SCHEDULE_FAILED", schedule_endpoints_attempted: scheduleEndpointsAttempted, schedule_attempts: schedule.attempts, no_live_promotion: true, rows_written: 0, external_calls_performed: externalCalls, schema_actions: schemaActions };
    await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET status='FAILED_SOURCE_PROBE_SCHEDULE', certification_status='BULLPEN_HISTORY_SOURCE_PROBE_SCHEDULE_FAILED', certification_grade='PROBE_BLOCKED', source_error_count=1, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, safeJson(output), batchId);
    return output;
  }

  const games = [];
  for (const dateNode of (schedule.json && schedule.json.dates ? schedule.json.dates : [])) {
    for (const game of (dateNode.games || [])) if (isFinalRegularSeasonGame(game)) games.push(game);
  }
  const sampleGames = games.slice(0, sampleLimit);
  let sourceErrors = 0, unclear = 0, stagedRows = 0, zeroBullpenTeams = 0, gamesWithZeroBullpenTeam = 0, gamesStartedZeroRows = 0, gamesStartedMissingRows = 0, openerBulkEdgeCases = 0;
  const fieldSeen = {};
  const gameProbes = [];

  for (const game of sampleGames) {
    const gamePk = num(game.gamePk);
    const gameDate = ymd(game.officialDate || game.gameDate || sampleDate);
    const boxEndpoint = `/api/v1/game/${gamePk}/boxscore`;
    const box = await fetchMlbJson(env, boxEndpoint); externalCalls += 1;
    const gameProbe = { game_pk: gamePk, game_date: gameDate, game_status: game.status || null, boxscore_http_status: box.http_status, teams: [] };
    if (!box.ok || !box.json) {
      sourceErrors += 1;
      await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: "GAME", outcome_category: "SOURCE_ERROR", status: "SOURCE_ERROR", reason: "boxscore_http_error", source_endpoint: boxEndpoint, details: { http_status: box.http_status, text_preview: box.text_preview } });
      continue;
    }
    let gameHadZeroBullpenTeam = false;
    for (const side of ["away", "home"]) {
      const boxSide = teamBox(box.json, side);
      const oppSide = side === "home" ? "away" : "home";
      const oppBox = teamBox(box.json, oppSide);
      const teamId = teamIdFromBox(boxSide);
      const oppId = teamIdFromBox(oppBox);
      const pitchers = Array.isArray(boxSide && boxSide.pitchers) ? boxSide.pitchers.map(x => num(x)).filter(x => x != null) : [];
      let starters = 0, relievers = 0, missingGs = 0, bullpenIndex = 0;
      for (let i = 0; i < pitchers.length; i++) {
        const pitcherId = pitchers[i];
        const player = playerNodeByPitcherId(boxSide, pitcherId);
        const line = statLine(player);
        const fp = fieldPresence(line);
        for (const [k, v] of Object.entries(fp)) fieldSeen[k] = Boolean(fieldSeen[k] || v);
        const gs = line.gamesStarted == null ? null : asInt(line.gamesStarted);
        if (gs === 1) { starters += 1; continue; }
        if (gs === 0) {
          relievers += 1;
          gamesStartedZeroRows += 1;
          const stageRow = bullpenStageRowFromPitcher({ game, boxscore: box.json, side, pitcherId, pitcherOrderIndex: i, bullpenIndex, batchId, runId, requestId, endpoint: boxEndpoint });
          bullpenIndex += 1;
          await insertStageRow(env, stageRow); stagedRows += 1;
          await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, pitcher_id: pitcherId, bullpen_key: stageRow.bullpen_key, outcome_level: "BULLPEN_APPEARANCE", outcome_category: "STAGED_ROWS", status: "STAGED_PROBE_ONLY", reason: "official_final_boxscore_gamesStarted_0_identified_relief_pitcher_appearance", source_endpoint: boxEndpoint, details: { side, bullpen_key: stageRow.bullpen_key, no_live_promotion: true, field_presence: fp } });
        } else {
          missingGs += 1; gamesStartedMissingRows += 1; unclear += 1;
          await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, pitcher_id: pitcherId, outcome_level: "BULLPEN_APPEARANCE", outcome_category: "UNCLEAR", status: "UNCLEAR", reason: "pitcher_gamesStarted_missing_cannot_classify_as_relief_without_guessing", source_endpoint: boxEndpoint, details: { side, pitcher_id: pitcherId, pitcher_order_index: i, line_keys: Object.keys(line || {}) } });
        }
      }
      if (starters !== 1 && pitchers.length > 0) openerBulkEdgeCases += 1;
      if (relievers === 0) { zeroBullpenTeams += 1; gameHadZeroBullpenTeam = true; }
      gameProbe.teams.push({ side, team_id: teamId, opponent_team_id: oppId, pitcher_count: pitchers.length, official_starters_gamesStarted_1: starters, official_relievers_gamesStarted_0: relievers, gamesStarted_missing_pitchers: missingGs, zero_bullpen_rows: relievers === 0, complete_game_or_no_relief_possible: relievers === 0 && starters === 1 });
      await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, outcome_level: "TEAM", outcome_category: relievers > 0 ? "TEAM_BULLPEN_ROWS_STAGED" : "TRUE_NO_DATA", status: relievers > 0 ? "TEAM_STAGED_PROBE_ONLY" : "TEAM_ZERO_BULLPEN_ROWS_REPRESENTED", reason: relievers > 0 ? "team_relief_pitcher_appearances_staged_from_final_boxscore" : "zero_relief_pitchers_in_final_boxscore_represented_without_false_failure", source_endpoint: boxEndpoint, details: { side, starters, relievers, missingGs, pitcher_count: pitchers.length, no_live_promotion: true } });
    }
    if (gameHadZeroBullpenTeam) gamesWithZeroBullpenTeam += 1;
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: "GAME", outcome_category: "GAME_SOURCE_PROBED", status: "GAME_PROBED_STAGE_ONLY", reason: "completed_final_game_boxscore_probed_for_variable_bullpen_appearance_rows", source_endpoint: boxEndpoint, details: { no_live_promotion: true, variable_bullpen_rows: true } });
    gameProbes.push(gameProbe);
  }

  const dup = await first(env.TEAM_DB, `SELECT COALESCE(SUM(c-1),0) AS duplicate_count FROM (SELECT bullpen_key, COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? GROUP BY bullpen_key HAVING COUNT(*)>1)`, batchId);
  const duplicateStageKeys = Number(dup && dup.duplicate_count ? dup.duplicate_count : 0);
  const missing = await first(env.TEAM_DB, `SELECT
    SUM(CASE WHEN game_pk IS NULL THEN 1 ELSE 0 END) AS missing_game_pk,
    SUM(CASE WHEN game_date IS NULL OR game_date='' THEN 1 ELSE 0 END) AS missing_game_date,
    SUM(CASE WHEN team_id IS NULL OR team_id='' THEN 1 ELSE 0 END) AS missing_team_id,
    SUM(CASE WHEN opponent_team_id IS NULL OR opponent_team_id='' THEN 1 ELSE 0 END) AS missing_opponent_team_id,
    SUM(CASE WHEN pitcher_id IS NULL THEN 1 ELSE 0 END) AS missing_pitcher_id,
    SUM(CASE WHEN relief_appearance<>1 OR games_started<>0 THEN 1 ELSE 0 END) AS invalid_relief_classification,
    SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS raw_json_missing,
    SUM(CASE WHEN data_feed_key IS NULL OR source_key IS NULL OR source_endpoint IS NULL OR ingestion_mode IS NULL OR batch_id IS NULL OR run_id IS NULL THEN 1 ELSE 0 END) AS lineage_missing_count
    FROM bullpen_history_stage WHERE batch_id=?`, batchId);

  const requiredFieldsConfirmed = ["gamesStarted", "inningsPitched", "outs", "battersFaced", "numberOfPitches", "strikes", "hits", "runs", "earnedRuns", "baseOnBalls", "strikeOuts", "homeRuns"].every(k => !!fieldSeen[k]);
  const optionalDecision = {
    holds: fieldSeen.holds ? "source_field_present_in_sample" : "unlocked_not_required_for_v0_1_0_source_lock",
    saves: fieldSeen.saves ? "source_field_present_in_sample" : "unlocked_not_required_for_v0_1_0_source_lock",
    blown_saves: fieldSeen.blownSaves ? "source_field_present_in_sample" : "unlocked_not_required_for_v0_1_0_source_lock",
    inherited_runners: fieldSeen.inheritedRunners ? "source_field_present_in_sample" : "unlocked_not_required_for_v0_1_0_source_lock",
    inherited_runners_scored: fieldSeen.inheritedRunnersScored ? "source_field_present_in_sample" : "unlocked_not_required_for_v0_1_0_source_lock"
  };
  const classificationLocked = sampleGames.length > 0 && stagedRows > 0 && gamesStartedMissingRows === 0 && duplicateStageKeys === 0 && sourceErrors === 0 && requiredFieldsConfirmed;
  const sourceShapeClassification = classificationLocked ? "GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS" : "HYBRID_OR_UNCLEAR_NEEDS_REVIEW";
  const certification = classificationLocked ? "BULLPEN_HISTORY_SOURCE_LOCK_PROBE_PASSED_GAME_LOG_STYLE" : "BULLPEN_HISTORY_SOURCE_LOCK_PROBE_REVIEW_REQUIRED";
  const grade = classificationLocked ? "PROBE_PASS" : "PROBE_REVIEW";
  const status = classificationLocked ? "SOURCE_LOCK_PROBE_PASSED" : "SOURCE_LOCK_PROBE_REVIEW_REQUIRED";
  const reliefPath = "MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.pitchers[] -> players.ID*.stats.pitching.gamesStarted == 0";
  const starterPath = "Exclude actual starters using MLB StatsAPI final boxscore stats.pitching.gamesStarted == 1; opener/bulk role labels are not guessed in base history.";
  const safestKey = duplicateStageKeys === 0 ? "game_pk + team_id + pitcher_id" : "game_pk + team_id + pitcher_id + bullpen_appearance_index_REQUIRED_REVIEW";
  const output = {
    ok: true,
    data_ok: classificationLocked,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    run_id: runId,
    batch_id: batchId,
    status,
    certification,
    certification_grade: grade,
    source_shape_classification: sourceShapeClassification,
    hybrid_note: "Raw bullpen appearance rows are game-log style. Daily Bullpen Availability/workload is derived later and is not built here.",
    source_endpoints_tested: { schedule_endpoint_selected: schedule.endpoint, schedule_endpoints_attempted: scheduleEndpointsAttempted, boxscore_endpoint_pattern_tested: "/api/v1/game/{gamePk}/boxscore" },
    sample: { sample_date: sampleDate, sample_limit: sampleLimit, final_regular_season_games_found: games.length, final_games_sampled: sampleGames.length, game_pks_sampled: sampleGames.map(g => g.gamePk) },
    relief_starter_classification: { relief_identification_path: reliefPath, starter_exclusion_path: starterPath, gamesStarted_zero_reliever_rows: gamesStartedZeroRows, gamesStarted_missing_rows: gamesStartedMissingRows, opener_bulk_edge_case_count: openerBulkEdgeCases, complete_game_zero_bullpen_team_cases_represented: zeroBullpenTeams },
    fields_confirmed: fieldSeen,
    optional_fields_decision: optionalDecision,
    safest_key_model: safestKey,
    counts: { expected_game_count: sampleGames.length, expected_bullpen_rows: stagedRows, staged_bullpen_rows: stagedRows, duplicate_stage_keys: duplicateStageKeys, source_error_count: sourceErrors, unclear_count: unclear, teams_with_zero_bullpen_rows: zeroBullpenTeams, games_with_zero_bullpen_team: gamesWithZeroBullpenTeam },
    certification_checks: { required_core_pitching_fields_confirmed: requiredFieldsConfirmed, missing, no_live_promotion: true, no_full_base_backfill: true, no_delta_update_execution: true, no_daily_bullpen_availability: true, no_scoring: true, no_ranking: true, no_final_board: true, no_board_mutation: true, variable_bullpen_row_model: true },
    game_probes: gameProbes,
    schema_actions: schemaActions,
    rows_read: sampleGames.length,
    rows_written: stagedRows,
    writes_performed: stagedRows,
    external_calls_performed: externalCalls,
    no_live_promotion: true,
    next_safe_step: classificationLocked ? "v0.2.0_base_backfill_stage_only_is_safe_to_design_next_but_not_built_here" : "review_probe_output_before_v0_2_0",
    gemini_source_research_needed: classificationLocked ? false : true,
    timestamp_utc: nowUtc()
  };

  await run(env.TEAM_DB,
    `UPDATE bullpen_history_batches SET source_shape_classification=?, relief_identification_path=?, starter_exclusion_path=?, safest_key_model=?, expected_game_count=?, expected_bullpen_rows=?, staged_bullpen_rows=?, duplicate_stage_keys=?, final_games_sampled=?, teams_with_zero_bullpen_rows=?, games_with_zero_bullpen_team=?, games_started_zero_reliever_rows=?, games_started_missing_rows=?, opener_bulk_edge_case_count=?, source_error_count=?, unclear_count=?, status=?, certification_status=?, certification_grade=?, output_json=?, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    sourceShapeClassification, reliefPath, starterPath, safestKey, sampleGames.length, stagedRows, stagedRows, duplicateStageKeys, sampleGames.length, zeroBullpenTeams, gamesWithZeroBullpenTeam, gamesStartedZeroRows, gamesStartedMissingRows, openerBulkEdgeCases, sourceErrors, unclear, status, certification, grade, safeJson(output), batchId
  );
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO bullpen_history_certifications (certification_id,batch_id,run_id,request_id,certification_status,certification_grade,expected_game_count,expected_bullpen_rows,staged_bullpen_rows,rows_promoted,duplicate_stage_keys,non_final_games,source_error_count,repair_required_count,unclear_count,missing_game_pk,missing_game_date,missing_team_id,missing_opponent_team_id,missing_pitcher_id,starter_rows_included,invalid_relief_classification,raw_json_missing,lineage_missing_count,source_shape_classification,relief_identification_path,starter_exclusion_path,safest_key_model,field_map_json,details_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,?,0,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    rid("bh_cert"), batchId, runId, requestId, certification, grade, sampleGames.length, stagedRows, stagedRows, duplicateStageKeys, sourceErrors, unclear,
    missing && missing.missing_game_pk || 0, missing && missing.missing_game_date || 0, missing && missing.missing_team_id || 0, missing && missing.missing_opponent_team_id || 0, missing && missing.missing_pitcher_id || 0, 0, missing && missing.invalid_relief_classification || 0, missing && missing.raw_json_missing || 0, missing && missing.lineage_missing_count || 0,
    sourceShapeClassification, reliefPath, starterPath, safestKey, safeJson(fieldSeen), safeJson(output)
  );
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO bullpen_history_cursor (cursor_key,ingestion_mode,source_key,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,last_sample_date,last_game_pk,last_batch_id,last_request_id,status,cursor_json,created_at,updated_at)
     VALUES ('bullpen_history_source_lock_probe_cursor','source_lock_probe',?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    SOURCE_KEY, season, "R", DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, sampleDate, sampleGames.length ? num(sampleGames[sampleGames.length - 1].gamePk) : null, batchId, requestId, status, safeJson({ source_shape_classification: sourceShapeClassification, field_seen: fieldSeen, safest_key_model: safestKey, no_live_promotion: true })
  );

  return output;
}


const CERTIFIED_BASE_STAGE_BATCH_ID = "bullpen_base_stage_batch_mphjoj0p_rwldp7";
const CERTIFIED_BASE_STAGE_EXPECTED_ROWS = 4621;
const DEFAULT_PROMOTION_CHUNK_ROWS = 500;

async function liveDuplicateCountForBatch(env, batchId) {
  const row = await first(env.TEAM_DB, `SELECT COALESCE(SUM(c-1),0) AS duplicate_count FROM (SELECT bullpen_key, COUNT(*) AS c FROM bullpen_history WHERE batch_id=? GROUP BY bullpen_key HAVING COUNT(*)>1)`, batchId);
  return Number(row && row.duplicate_count || 0);
}

async function stageRowsAfterClean(env, batchId) {
  const row = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=?`, batchId);
  return Number(row && row.c || 0);
}

async function promoteBullpenStageChunk(env, batchId, limit) {
  await run(env.TEAM_DB,
    `WITH promote_keys AS (
       SELECT stage_id
       FROM bullpen_history_stage
       WHERE batch_id=? AND promoted_at IS NULL
       ORDER BY game_date, game_pk, team_id, pitcher_id
       LIMIT ?
     )
     INSERT OR REPLACE INTO bullpen_history (
       bullpen_key, team_id, game_date, game_pk, usage_json, availability_json, updated_at,
       game_type, game_status, season, opponent_team_id, is_home, venue_id,
       pitcher_id, pitcher_name, pitcher_hand, pitcher_role, relief_classification,
       relief_appearance, games_started, games_pitched, pitcher_order_index, bullpen_appearance_index,
       innings_pitched, innings_pitched_decimal, outs_recorded, batters_faced, pitches, strikes,
       hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed,
       inherited_runners, inherited_runners_scored,
       holds, saves, blown_saves,
       field_map_json, source_path, data_feed_key, raw_json,
       source_key, source_endpoint, source_season, source_game_type, ingestion_mode,
       batch_id, run_id, certification_status, certification_grade, source_confidence, source_snapshot_date,
       certified_at, promoted_at, created_at
     )
     SELECT
       s.bullpen_key, s.team_id, s.game_date, s.game_pk, NULL, NULL, CURRENT_TIMESTAMP,
       s.game_type, s.game_status, s.season, s.opponent_team_id, s.is_home, s.venue_id,
       s.pitcher_id, s.pitcher_name, s.pitcher_hand, s.pitcher_role, s.relief_classification,
       s.relief_appearance, s.games_started, s.games_pitched, s.pitcher_order_index, s.bullpen_appearance_index,
       s.innings_pitched, s.innings_pitched_decimal, s.outs_recorded, s.batters_faced, s.pitches, s.strikes,
       s.hits_allowed, s.runs_allowed, s.earned_runs, s.walks_allowed, s.strikeouts, s.home_runs_allowed,
       s.inherited_runners, s.inherited_runners_scored,
       s.holds, s.saves, s.blown_saves,
       s.field_map_json, s.source_path, s.data_feed_key, s.raw_json,
       s.source_key, s.source_endpoint, s.source_season, s.source_game_type, 'base_backfill',
       s.batch_id, s.run_id, 'BASE_BULLPEN_HISTORY_BASE_PROMOTED_FROM_CERTIFIED_STAGE', 'BASE_PASS', s.source_confidence, s.source_snapshot_date,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE(s.created_at, CURRENT_TIMESTAMP)
     FROM bullpen_history_stage s
     WHERE s.stage_id IN (SELECT stage_id FROM promote_keys)`,
    batchId, limit
  );
  await run(env.TEAM_DB,
    `UPDATE bullpen_history_stage
     SET promoted_at=CURRENT_TIMESTAMP,
         certification_status='BASE_BULLPEN_HISTORY_BASE_PROMOTED_FROM_CERTIFIED_STAGE',
         certification_grade='BASE_PASS',
         updated_at=CURRENT_TIMESTAMP
     WHERE stage_id IN (
       SELECT stage_id FROM (
         SELECT stage_id
         FROM bullpen_history_stage
         WHERE batch_id=? AND promoted_at IS NULL
         ORDER BY game_date, game_pk, team_id, pitcher_id
         LIMIT ?
       )
     )`,
    batchId, limit
  );
}

async function runBasePromoteClean(env, input = {}) {
  await ensureSchema(env);
  const requestId = input.request_id || rid("bullpen_base_promote_request");
  const chainId = input.chain_id || rid("bullpen_base_promote_chain");
  const runId = input.run_id || rid("bullpen_base_promote_run");
  const batchId = String(input.batch_id || CERTIFIED_BASE_STAGE_BATCH_ID);
  const limit = Math.max(25, Math.min(Number(input.max_rows_per_tick || input.chunk_rows || DEFAULT_PROMOTION_CHUNK_ROWS), 750));

  if (batchId !== CERTIFIED_BASE_STAGE_BATCH_ID) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: "BLOCKED_WRONG_BATCH", certification: "BASE_BULLPEN_HISTORY_PROMOTION_BLOCKED_WRONG_BATCH", certification_grade: "BLOCKED", expected_batch_id: CERTIFIED_BASE_STAGE_BATCH_ID, no_mining: true, external_calls_performed: 0 };
  }

  const batch = await first(env.TEAM_DB, `SELECT * FROM bullpen_history_batches WHERE batch_id=?`, batchId);
  if (!batch) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: "BLOCKED_BATCH_NOT_FOUND", certification: "BASE_BULLPEN_HISTORY_PROMOTION_BLOCKED_BATCH_NOT_FOUND", certification_grade: "BLOCKED", no_mining: true, external_calls_performed: 0 };
  }
  const batchStatus = String(batch.status || "");
  const batchCert = String(batch.certification_status || "");
  const batchGrade = String(batch.certification_grade || "");
  const certifiedOrPromoting = (
    (batchStatus === "BASE_BACKFILL_STAGE_ONLY_CERTIFIED" && batchCert === "BASE_BULLPEN_HISTORY_BASE_STAGE_ONLY_CERTIFIED_READY_FOR_PROMOTION_REVIEW" && batchGrade === "STAGE_PASS") ||
    (batchStatus === "PROMOTING_BASE_BACKFILL" && batchCert === "BASE_BULLPEN_HISTORY_BASE_PROMOTION_PARTIAL_CONTINUE" && batchGrade === "PROMOTION_PARTIAL")
  );
  if (!certifiedOrPromoting) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: "BLOCKED_BATCH_NOT_CERTIFIED_FOR_PROMOTION", certification: "BASE_BULLPEN_HISTORY_PROMOTION_BLOCKED_STAGE_NOT_CERTIFIED", certification_grade: "BLOCKED", current_batch_status: batch.status, current_certification_status: batch.certification_status, current_certification_grade: batch.certification_grade, no_mining: true, external_calls_performed: 0 };
  }

  const stageBefore = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=?`, batchId);
  const stageCount = Number(stageBefore && stageBefore.c || 0);
  const stageDup = await first(env.TEAM_DB, `SELECT COALESCE(SUM(c-1),0) AS duplicate_count FROM (SELECT bullpen_key, COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? GROUP BY bullpen_key HAVING COUNT(*)>1)`, batchId);
  const duplicateStageKeys = Number(stageDup && stageDup.duplicate_count || 0);
  const invalid = await first(env.TEAM_DB,
    `SELECT
       SUM(CASE WHEN relief_appearance<>1 OR games_started<>0 THEN 1 ELSE 0 END) AS invalid_relief,
       SUM(CASE WHEN game_pk IS NULL THEN 1 ELSE 0 END) AS missing_game_pk,
       SUM(CASE WHEN game_date IS NULL OR game_date='' THEN 1 ELSE 0 END) AS missing_game_date,
       SUM(CASE WHEN team_id IS NULL OR team_id='' THEN 1 ELSE 0 END) AS missing_team_id,
       SUM(CASE WHEN opponent_team_id IS NULL OR opponent_team_id='' THEN 1 ELSE 0 END) AS missing_opponent_team_id,
       SUM(CASE WHEN pitcher_id IS NULL THEN 1 ELSE 0 END) AS missing_pitcher_id,
       SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS raw_json_missing
     FROM bullpen_history_stage WHERE batch_id=?`, batchId);
  const invalidCount = Number(invalid && (invalid.invalid_relief || invalid.missing_game_pk || invalid.missing_game_date || invalid.missing_team_id || invalid.missing_opponent_team_id || invalid.missing_pitcher_id || invalid.raw_json_missing) || 0);

  if (stageCount !== CERTIFIED_BASE_STAGE_EXPECTED_ROWS || duplicateStageKeys !== 0 || invalidCount !== 0) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: "BLOCKED_STAGE_QUALITY_GATE_FAILED", certification: "BASE_BULLPEN_HISTORY_PROMOTION_BLOCKED_STAGE_QUALITY_GATE_FAILED", certification_grade: "BLOCKED", stage_count: stageCount, expected_stage_count: CERTIFIED_BASE_STAGE_EXPECTED_ROWS, duplicate_stage_keys: duplicateStageKeys, invalid_summary: invalid, no_mining: true, external_calls_performed: 0 };
  }

  const remainingBefore = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? AND promoted_at IS NULL`, batchId);
  const remaining = Number(remainingBefore && remainingBefore.c || 0);
  if (remaining > 0) {
    await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET status='PROMOTING_BASE_BACKFILL', certification_status='BASE_BULLPEN_HISTORY_BASE_PROMOTION_PARTIAL_CONTINUE', certification_grade='PROMOTION_PARTIAL', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, batchId);
    await promoteBullpenStageChunk(env, batchId, limit);
  }

  const promotedStage = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? AND promoted_at IS NOT NULL`, batchId);
  const remainingAfter = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? AND promoted_at IS NULL`, batchId);
  const live = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history WHERE batch_id=?`, batchId);
  const liveRows = Number(live && live.c || 0);
  const promotedStageRows = Number(promotedStage && promotedStage.c || 0);
  const remainingRows = Number(remainingAfter && remainingAfter.c || 0);
  const duplicateLiveKeys = await liveDuplicateCountForBatch(env, batchId);
  const partial = remainingRows > 0;

  if (partial) {
    const output = {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      chain_id: chainId,
      run_id: runId,
      batch_id: batchId,
      mode: "base_promote_clean",
      status: "PARTIAL_CONTINUE",
      certification: "BASE_BULLPEN_HISTORY_BASE_PROMOTION_PARTIAL_CONTINUE",
      certification_grade: "PROMOTION_PARTIAL",
      rows_read: stageCount,
      rows_written: promotedStageRows,
      rows_promoted: liveRows,
      live_rows_for_batch: liveRows,
      promoted_stage_rows: promotedStageRows,
      remaining_stage_rows_to_promote: remainingRows,
      duplicate_live_keys: duplicateLiveKeys,
      no_mining: true,
      external_calls_performed: 0,
      continuation_required: true,
      orchestrator_should_self_continue: true,
      no_delta_update_execution: true,
      no_daily_bullpen_availability: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true
    };
    await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET rows_promoted=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, liveRows, safeJson(output), batchId);
    return output;
  }

  if (liveRows !== CERTIFIED_BASE_STAGE_EXPECTED_ROWS || duplicateLiveKeys !== 0) {
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, mode: "base_promote_clean", status: "BLOCKED_LIVE_VERIFICATION_FAILED", certification: "BASE_BULLPEN_HISTORY_PROMOTION_BLOCKED_LIVE_VERIFICATION_FAILED", certification_grade: "BLOCKED", rows_promoted: liveRows, live_rows_for_batch: liveRows, expected_live_rows: CERTIFIED_BASE_STAGE_EXPECTED_ROWS, duplicate_live_keys: duplicateLiveKeys, stage_rows_before_clean: stageCount, no_cleanup: true, no_mining: true, external_calls_performed: 0 };
    await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET status=?, certification_status=?, certification_grade=?, rows_promoted=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, output.status, output.certification, output.certification_grade, liveRows, safeJson(output), batchId);
    return output;
  }

  await run(env.TEAM_DB, `DELETE FROM bullpen_history_stage WHERE batch_id=?`, batchId);
  const stageAfterClean = await stageRowsAfterClean(env, batchId);
  if (stageAfterClean !== 0) {
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, mode: "base_promote_clean", status: "BLOCKED_STAGE_CLEANUP_FAILED", certification: "BASE_BULLPEN_HISTORY_PROMOTION_BLOCKED_STAGE_CLEANUP_FAILED", certification_grade: "BLOCKED", rows_promoted: liveRows, live_rows_for_batch: liveRows, duplicate_live_keys: duplicateLiveKeys, stage_rows_after_clean: stageAfterClean, no_mining: true, external_calls_performed: 0 };
    await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET status=?, certification_status=?, certification_grade=?, rows_promoted=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, output.status, output.certification, output.certification_grade, liveRows, safeJson(output), batchId);
    return output;
  }

  const output = {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    run_id: runId,
    batch_id: batchId,
    mode: "base_promote_clean",
    status: "COMPLETED_PROMOTED_CLEANED",
    certification: "BASE_BULLPEN_HISTORY_BASE_PROMOTED_CLEANED_CERTIFIED",
    certification_status: "BASE_BULLPEN_HISTORY_BASE_PROMOTED_CLEANED_CERTIFIED",
    certification_grade: "BASE_PASS",
    source_shape_classification: "GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS",
    rows_read: stageCount,
    rows_written: liveRows,
    rows_promoted: liveRows,
    live_rows_for_batch: liveRows,
    expected_live_rows: CERTIFIED_BASE_STAGE_EXPECTED_ROWS,
    duplicate_live_keys: duplicateLiveKeys,
    stage_rows_after_clean: stageAfterClean,
    saves_holds_blown_saves_field_rule: "stored_as_source_provided_advisory_fields_not_hard_certified_core_fields",
    no_mining: true,
    external_calls_performed: 0,
    no_new_batch: true,
    no_source_calls: true,
    no_delta_update_execution: true,
    no_daily_bullpen_availability: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    timestamp_utc: nowUtc()
  };

  await run(env.TEAM_DB,
    `UPDATE bullpen_history_batches
     SET status='COMPLETED_PROMOTED_CLEANED',
         certification_status='BASE_BULLPEN_HISTORY_BASE_PROMOTED_CLEANED_CERTIFIED',
         certification_grade='BASE_PASS',
         rows_promoted=?,
         stage_only=0,
         probe_only=0,
         promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP),
         cleaned_at=CURRENT_TIMESTAMP,
         output_json=?,
         updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?`,
    liveRows, safeJson(output), batchId
  );

  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO bullpen_history_certifications (certification_id,batch_id,run_id,request_id,certification_status,certification_grade,expected_game_count,expected_bullpen_rows,staged_bullpen_rows,rows_promoted,duplicate_stage_keys,non_final_games,source_error_count,repair_required_count,unclear_count,missing_game_pk,missing_game_date,missing_team_id,missing_opponent_team_id,missing_pitcher_id,starter_rows_included,invalid_relief_classification,raw_json_missing,lineage_missing_count,source_shape_classification,relief_identification_path,starter_exclusion_path,safest_key_model,field_map_json,details_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    rid("bh_cert"), batchId, runId, requestId, 'BASE_BULLPEN_HISTORY_BASE_PROMOTED_CLEANED_CERTIFIED', 'BASE_PASS', Number(batch.total_game_count || 712), CERTIFIED_BASE_STAGE_EXPECTED_ROWS, 0, liveRows, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS', batch.relief_identification_path || 'MLB StatsAPI final boxscore gamesStarted == 0', batch.starter_exclusion_path || 'Exclude gamesStarted == 1', batch.safest_key_model || 'game_pk + team_id + pitcher_id', safeJson({ advisory_fields: ['holds','saves','blown_saves'] }), safeJson(output)
  );

  return output;
}



const DEFAULT_DELTA_CHUNK_GAMES = 12;
const DEFAULT_DELTA_PROMOTE_ROWS = 300;
function addDaysYmd(d, days) {
  const dt = new Date(`${ymd(d)}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}
function todayYmdUtc() { return new Date().toISOString().slice(0, 10); }
function compareYmd(a, b) { return String(a || '').localeCompare(String(b || '')); }
async function liveMaxGameDate(env) {
  const row = await first(env.TEAM_DB, `SELECT MAX(game_date) AS max_game_date FROM bullpen_history WHERE source_key=? AND source_game_type='R'`, SOURCE_KEY);
  return row && row.max_game_date ? String(row.max_game_date).slice(0,10) : null;
}
async function verifiedBaseComplete(env) {
  const row = await first(env.TEAM_DB, `SELECT batch_id,status,certification_status,certification_grade,rows_promoted FROM bullpen_history_batches WHERE batch_id=?`, CERTIFIED_BASE_STAGE_BATCH_ID);
  return !!(row && row.status === 'COMPLETED_PROMOTED_CLEANED' && row.certification_status === 'BASE_BULLPEN_HISTORY_BASE_PROMOTED_CLEANED_CERTIFIED' && row.certification_grade === 'BASE_PASS' && Number(row.rows_promoted || 0) === CERTIFIED_BASE_STAGE_EXPECTED_ROWS);
}
async function promoteDeltaUnpromotedStageRows(env, batchId, limit) {
  await run(env.TEAM_DB,
    `WITH promote_keys AS (
       SELECT stage_id
       FROM bullpen_history_stage
       WHERE batch_id=? AND ingestion_mode='delta_update' AND promoted_at IS NULL
       ORDER BY game_date, game_pk, team_id, pitcher_id
       LIMIT ?
     )
     INSERT OR REPLACE INTO bullpen_history (
       bullpen_key, team_id, game_date, game_pk, usage_json, availability_json, updated_at,
       game_type, game_status, season, opponent_team_id, is_home, venue_id,
       pitcher_id, pitcher_name, pitcher_hand, pitcher_role, relief_classification,
       relief_appearance, games_started, games_pitched, pitcher_order_index, bullpen_appearance_index,
       innings_pitched, innings_pitched_decimal, outs_recorded, batters_faced, pitches, strikes,
       hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed,
       inherited_runners, inherited_runners_scored,
       holds, saves, blown_saves,
       field_map_json, source_path, data_feed_key, raw_json,
       source_key, source_endpoint, source_season, source_game_type, ingestion_mode,
       batch_id, run_id, certification_status, certification_grade, source_confidence, source_snapshot_date,
       certified_at, promoted_at, created_at
     )
     SELECT
       s.bullpen_key, s.team_id, s.game_date, s.game_pk, NULL, NULL, CURRENT_TIMESTAMP,
       s.game_type, s.game_status, s.season, s.opponent_team_id, s.is_home, s.venue_id,
       s.pitcher_id, s.pitcher_name, s.pitcher_hand, s.pitcher_role, s.relief_classification,
       s.relief_appearance, s.games_started, s.games_pitched, s.pitcher_order_index, s.bullpen_appearance_index,
       s.innings_pitched, s.innings_pitched_decimal, s.outs_recorded, s.batters_faced, s.pitches, s.strikes,
       s.hits_allowed, s.runs_allowed, s.earned_runs, s.walks_allowed, s.strikeouts, s.home_runs_allowed,
       s.inherited_runners, s.inherited_runners_scored,
       s.holds, s.saves, s.blown_saves,
       s.field_map_json, s.source_path, s.data_feed_key, s.raw_json,
       s.source_key, s.source_endpoint, s.source_season, s.source_game_type, 'delta_update',
       s.batch_id, s.run_id, 'DELTA_BULLPEN_HISTORY_PROMOTED_STAGE_RETAINED', 'DELTA_PASS', s.source_confidence, s.source_snapshot_date,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE(s.created_at, CURRENT_TIMESTAMP)
     FROM bullpen_history_stage s
     WHERE s.stage_id IN (SELECT stage_id FROM promote_keys)`, batchId, limit);
  await run(env.TEAM_DB,
    `UPDATE bullpen_history_stage
     SET promoted_at=CURRENT_TIMESTAMP,
         certification_status='DELTA_BULLPEN_HISTORY_PROMOTED_STAGE_RETAINED',
         certification_grade='DELTA_PASS',
         updated_at=CURRENT_TIMESTAMP
     WHERE stage_id IN (
       SELECT stage_id FROM (
         SELECT stage_id
         FROM bullpen_history_stage
         WHERE batch_id=? AND ingestion_mode='delta_update' AND promoted_at IS NULL
         ORDER BY game_date, game_pk, team_id, pitcher_id
         LIMIT ?
       )
     )`, batchId, limit);
}
async function restoreMissingLiveFromRetainedDeltaStage(env, requestId, runId, limit=200) {
  const before = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage s LEFT JOIN bullpen_history l ON l.bullpen_key=s.bullpen_key WHERE s.ingestion_mode='delta_update' AND s.promoted_at IS NOT NULL AND l.bullpen_key IS NULL`);
  const missing = Number(before && before.c || 0);
  if (!missing) return null;
  await run(env.TEAM_DB,
    `WITH restore_keys AS (
       SELECT s.stage_id
       FROM bullpen_history_stage s
       LEFT JOIN bullpen_history l ON l.bullpen_key=s.bullpen_key
       WHERE s.ingestion_mode='delta_update' AND s.promoted_at IS NOT NULL AND l.bullpen_key IS NULL
       ORDER BY s.game_date, s.game_pk, s.team_id, s.pitcher_id
       LIMIT ?
     )
     UPDATE bullpen_history_stage
     SET promoted_at=NULL, updated_at=CURRENT_TIMESTAMP
     WHERE stage_id IN (SELECT stage_id FROM restore_keys)`, limit);
  const batch = await first(env.TEAM_DB, `SELECT batch_id FROM bullpen_history_stage WHERE ingestion_mode='delta_update' AND promoted_at IS NULL ORDER BY datetime(updated_at) DESC LIMIT 1`);
  if (batch && batch.batch_id) await promoteDeltaUnpromotedStageRows(env, batch.batch_id, limit);
  const after = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage s LEFT JOIN bullpen_history l ON l.bullpen_key=s.bullpen_key WHERE s.ingestion_mode='delta_update' AND s.promoted_at IS NOT NULL AND l.bullpen_key IS NULL`);
  const remaining = Number(after && after.c || 0);
  const restored = Math.max(0, missing - remaining);
  return { ok:true, data_ok:true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, mode:'delta_update', status:'REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', certification:'DELTA_BULLPEN_HISTORY_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', certification_grade:'DELTA_REPAIR_PASS', restored_rows: restored, remaining_missing_live_rows: remaining, queued:false, request_id_created:null, no_new_batch:true, no_stage_writes:true, no_full_sweep:true, no_cleanup:true, no_mining_calls:true, external_calls_performed:0, no_daily_bullpen_availability:true, no_scoring:true };
}
async function promoteDeltaStageRowsForBatch(env, batchId) {
  let promoted = 0;
  for (let i=0; i<10; i++) {
    const remaining = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history_stage WHERE batch_id=? AND ingestion_mode='delta_update' AND promoted_at IS NULL`, batchId);
    if (!Number(remaining && remaining.c || 0)) break;
    await promoteDeltaUnpromotedStageRows(env, batchId, DEFAULT_DELTA_PROMOTE_ROWS);
    const live = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history WHERE batch_id=?`, batchId);
    promoted = Number(live && live.c || 0);
  }
  return promoted;
}
async function processDeltaGameToStage(env, { game, batchId, runId, requestId, endpoint, season }) {
  const gamePk = num(game.gamePk);
  const gameDate = ymd(game.officialDate || game.gameDate);
  const box = await fetchMlbJson(env, endpoint);
  let sourceErrors = 0, unclear = 0, stagedRows = 0, zeroBullpenTeams = 0, gamesStartedZeroRows = 0, gamesStartedMissingRows = 0, openerBulkEdgeCases = 0;
  if (!box.ok || !box.json) {
    sourceErrors += 1;
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: 'GAME', outcome_category: 'SOURCE_ERROR', status: 'SOURCE_ERROR', reason: 'delta_boxscore_http_error', source_endpoint: endpoint, details: { http_status: box.http_status, text_preview: box.text_preview } });
    return { sourceErrors, unclear, stagedRows, zeroBullpenTeams, gamesStartedZeroRows, gamesStartedMissingRows, openerBulkEdgeCases, externalCalls: 1 };
  }
  for (const side of ['away','home']) {
    const boxSide = teamBox(box.json, side);
    const oppSide = side === 'home' ? 'away' : 'home';
    const oppBox = teamBox(box.json, oppSide);
    const teamId = teamIdFromBox(boxSide);
    const oppId = teamIdFromBox(oppBox);
    const pitchers = Array.isArray(boxSide && boxSide.pitchers) ? boxSide.pitchers.map(x => num(x)).filter(x => x != null) : [];
    let starters = 0, relievers = 0, missingGs = 0, bullpenIndex = 0;
    for (let i=0; i<pitchers.length; i++) {
      const pitcherId = pitchers[i];
      const player = playerNodeByPitcherId(boxSide, pitcherId);
      const line = statLine(player);
      const fp = fieldPresence(line);
      const gs = line.gamesStarted == null ? null : asInt(line.gamesStarted);
      if (gs === 1) { starters += 1; continue; }
      if (gs === 0) {
        relievers += 1; gamesStartedZeroRows += 1;
        const stageRow = bullpenStageRowFromPitcher({ game, boxscore: box.json, side, pitcherId, pitcherOrderIndex: i, bullpenIndex, batchId, runId, requestId, endpoint, ingestionMode: 'delta_update', certificationStatus: 'DELTA_BULLPEN_HISTORY_STAGED_PENDING_PROMOTION', certificationGrade: 'DELTA_STAGE' });
        bullpenIndex += 1;
        await insertStageRow(env, stageRow); stagedRows += 1;
        await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, pitcher_id: pitcherId, bullpen_key: stageRow.bullpen_key, outcome_level: 'BULLPEN_APPEARANCE', outcome_category: 'STAGED_ROWS', status: 'STAGED_DELTA_ONLY', reason: 'official_final_boxscore_gamesStarted_0_identified_relief_pitcher_appearance_delta_update', source_endpoint: endpoint, details: { side, bullpen_key: stageRow.bullpen_key, retained_stage_after_promotion: true, field_presence: fp } });
      } else {
        missingGs += 1; gamesStartedMissingRows += 1; unclear += 1;
        await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, pitcher_id: pitcherId, outcome_level: 'BULLPEN_APPEARANCE', outcome_category: 'UNCLEAR', status: 'UNCLEAR', reason: 'delta_pitcher_gamesStarted_missing_cannot_classify_without_guessing', source_endpoint: endpoint, details: { side, pitcher_id: pitcherId, pitcher_order_index: i, line_keys: Object.keys(line || {}) } });
      }
    }
    if (starters !== 1 && pitchers.length > 0) openerBulkEdgeCases += 1;
    if (relievers === 0) zeroBullpenTeams += 1;
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: oppId, outcome_level: 'TEAM', outcome_category: relievers > 0 ? 'TEAM_BULLPEN_ROWS_STAGED' : 'TRUE_NO_DATA', status: relievers > 0 ? 'TEAM_STAGED_DELTA_ONLY' : 'TEAM_ZERO_BULLPEN_ROWS_REPRESENTED', reason: relievers > 0 ? 'team_relief_pitcher_appearances_staged_from_final_boxscore_delta_update' : 'zero_relief_pitchers_in_final_boxscore_represented_without_false_failure_delta_update', source_endpoint: endpoint, details: { side, starters, relievers, missingGs, pitcher_count: pitchers.length, retained_stage_after_promotion: true } });
  }
  await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: 'GAME', outcome_category: 'GAME_SOURCE_PROBED', status: 'GAME_STAGED_DELTA_ONLY', reason: 'completed_final_game_boxscore_staged_for_variable_bullpen_appearance_rows_delta_update', source_endpoint: endpoint, details: { variable_bullpen_rows: true, retained_stage_after_promotion: true } });
  return { sourceErrors, unclear, stagedRows, zeroBullpenTeams, gamesStartedZeroRows, gamesStartedMissingRows, openerBulkEdgeCases, externalCalls: 1 };
}
async function scopedSourceRepairFromDeltaOutcomes(env, requestId, runId, limit=3) {
  const rows = await all(env.TEAM_DB,
    `SELECT o.batch_id,o.game_pk,o.game_date,o.team_id,o.opponent_team_id,o.pitcher_id,o.bullpen_key,o.source_endpoint
     FROM bullpen_history_outcomes o
     JOIN bullpen_history_batches b ON b.batch_id=o.batch_id
     LEFT JOIN bullpen_history l ON l.bullpen_key=o.bullpen_key
     LEFT JOIN bullpen_history_stage s ON s.batch_id=o.batch_id AND s.bullpen_key=o.bullpen_key
     WHERE b.ingestion_mode='delta_update'
       AND o.outcome_level='BULLPEN_APPEARANCE'
       AND o.bullpen_key IS NOT NULL
       AND l.bullpen_key IS NULL
       AND s.bullpen_key IS NULL
     ORDER BY o.game_date,o.game_pk,o.team_id,o.pitcher_id
     LIMIT ?`, limit);
  if (!rows.length) return null;
  let repaired = 0, externalCalls = 0;
  for (const miss of rows) {
    const endpoint = miss.source_endpoint || `/api/v1/game/${miss.game_pk}/boxscore`;
    const scheduleGame = { gamePk: miss.game_pk, officialDate: miss.game_date, gameDate: miss.game_date, gameType:'R', status:{detailedState:'Final',statusCode:'F'} };
    const box = await fetchMlbJson(env, endpoint); externalCalls += 1;
    if (!box.ok || !box.json) continue;
    for (const side of ['away','home']) {
      const boxSide = teamBox(box.json, side);
      const pitchers = Array.isArray(boxSide && boxSide.pitchers) ? boxSide.pitchers.map(x => num(x)).filter(x => x != null) : [];
      for (let i=0, bullpenIndex=0; i<pitchers.length; i++) {
        const pitcherId = pitchers[i];
        const player = playerNodeByPitcherId(boxSide, pitcherId);
        const line = statLine(player);
        const gs = line.gamesStarted == null ? null : asInt(line.gamesStarted);
        if (gs !== 0) continue;
        const row = bullpenStageRowFromPitcher({ game: scheduleGame, boxscore: box.json, side, pitcherId, pitcherOrderIndex: i, bullpenIndex, batchId: miss.batch_id, runId, requestId, endpoint, ingestionMode:'delta_update', certificationStatus:'DELTA_BULLPEN_HISTORY_SCOPED_SOURCE_REPAIR_STAGED', certificationGrade:'DELTA_REPAIR' });
        bullpenIndex += 1;
        if (row.bullpen_key === miss.bullpen_key) { await insertStageRow(env, row); repaired += 1; }
      }
    }
  }
  if (repaired) await promoteDeltaStageRowsForBatch(env, rows[0].batch_id);
  return { ok:true, data_ok:true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, mode:'delta_update', status:'DELTA_BULLPEN_HISTORY_SCOPED_REPAIR_COMPLETED', certification:'DELTA_BULLPEN_HISTORY_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED', certification_grade:'DELTA_REPAIR_PASS', missing_live_rows_detected: rows.length, missing_stage_rows_detected: rows.length, scoped_team_game_keys_to_refetch: rows.length, rows_promoted: repaired, external_calls_performed: externalCalls, no_full_sweep:true, no_new_batch:true, stage_retained:true, no_daily_bullpen_availability:true, no_scoring:true };
}
async function runDeltaUpdate(env, input={}) {
  await ensureSchema(env);
  const requestId = input.request_id || rid('bullpen_delta_request');
  const chainId = input.chain_id || rid('bullpen_delta_chain');
  const runId = input.run_id || rid('bullpen_delta_run');
  if (!(await verifiedBaseComplete(env))) return { ok:false, data_ok:false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id:requestId, chain_id:chainId, run_id:runId, mode:'delta_update', status:'BLOCKED_BASE_NOT_PROMOTED_CLEANED', certification:'DELTA_BULLPEN_HISTORY_BLOCKED_BASE_NOT_READY', certification_grade:'BLOCKED', no_mining_calls:true, external_calls_performed:0 };
  const retained = await restoreMissingLiveFromRetainedDeltaStage(env, requestId, runId, Number(input.restore_limit || 200));
  if (retained) return retained;
  const scoped = await scopedSourceRepairFromDeltaOutcomes(env, requestId, runId, Number(input.repair_limit || 3));
  if (scoped) return scoped;
  const maxLive = await liveMaxGameDate(env) || DEFAULT_BASE_CUTOFF_DATE;
  let startDate = input.start_date || input.schedule_start_date || addDaysYmd(maxLive, 1);
  if (compareYmd(startDate, DEFAULT_DELTA_RESERVED_START_DATE) < 0) startDate = DEFAULT_DELTA_RESERVED_START_DATE;
  let endDate = input.end_date || input.schedule_end_date || todayYmdUtc();
  if (compareYmd(startDate, endDate) > 0) {
    const output = { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, run_id:runId, mode:'delta_update', status:'DELTA_BULLPEN_HISTORY_NOOP_CURRENT', certification:'DELTA_BULLPEN_HISTORY_NOOP_LIVE_CURRENT', certification_grade:'DELTA_NOOP_PASS', source_shape_classification:'GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS', max_live_game_date:maxLive, schedule_start_date:startDate, schedule_end_date:endDate, no_new_batch:true, no_mining_calls:true, external_calls_performed:0, no_daily_bullpen_availability:true, no_scoring:true };
    await run(env.TEAM_DB, `INSERT OR REPLACE INTO bullpen_history_cursor (cursor_key,ingestion_mode,source_key,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,last_sample_date,last_batch_id,last_request_id,status,cursor_json,created_at,updated_at) VALUES ('bullpen_history_delta_update_cursor','delta_update',?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, SOURCE_KEY, seasonFromDate(endDate), 'R', DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, maxLive, null, null, requestId, output.status, safeJson(output));
    return output;
  }
  const schedule = await fetchScheduleRange(env, startDate, endDate);
  if (!schedule.ok) return { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, run_id:runId, mode:'delta_update', status:'DELTA_SCHEDULE_FAILED', certification:'DELTA_BULLPEN_HISTORY_SCHEDULE_FAILED', certification_grade:'BLOCKED', schedule_start_date:startDate, schedule_end_date:endDate, external_calls_performed:1, error_preview:schedule.text_preview };
  const finalGamesAll = finalGamesFromSchedule(schedule.json);
  const openBatch = await first(env.TEAM_DB, `SELECT * FROM bullpen_history_batches WHERE ingestion_mode='delta_update' AND status IN ('PARTIAL_CONTINUE','RUNNING_DELTA_UPDATE') ORDER BY datetime(created_at) DESC LIMIT 1`);
  let candidates;
  if (openBatch && openBatch.batch_id) {
    startDate = openBatch.schedule_start_date || startDate;
    endDate = openBatch.schedule_end_date || endDate;
    candidates = finalGamesAll;
  } else {
    const liveGamesRows = await all(env.TEAM_DB, `SELECT DISTINCT game_pk FROM bullpen_history WHERE game_date>=? AND game_date<=?`, startDate, endDate);
    const liveGames = new Set(liveGamesRows.map(r=>Number(r.game_pk)).filter(Number.isFinite));
    candidates = finalGamesAll.filter(g => !liveGames.has(Number(g.gamePk)));
  }
  if (!candidates.length) {
    const output = { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, run_id:runId, mode:'delta_update', status:'DELTA_BULLPEN_HISTORY_NOOP_CURRENT', certification:'DELTA_BULLPEN_HISTORY_NOOP_LIVE_CURRENT', certification_grade:'DELTA_NOOP_PASS', source_shape_classification:'GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS', schedule_start_date:startDate, schedule_end_date:endDate, final_games_seen:finalGamesAll.length, candidate_new_games:0, no_new_batch:true, no_mining_calls:true, external_calls_performed:1, no_daily_bullpen_availability:true, no_scoring:true };
    await run(env.TEAM_DB, `INSERT OR REPLACE INTO bullpen_history_cursor (cursor_key,ingestion_mode,source_key,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,last_sample_date,last_batch_id,last_request_id,status,cursor_json,created_at,updated_at) VALUES ('bullpen_history_delta_update_cursor','delta_update',?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, SOURCE_KEY, seasonFromDate(endDate), 'R', DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, maxLive, null, null, requestId, output.status, safeJson(output));
    return output;
  }
  let batch = openBatch || await first(env.TEAM_DB, `SELECT * FROM bullpen_history_batches WHERE request_id=? AND ingestion_mode='delta_update' ORDER BY datetime(created_at) DESC LIMIT 1`, requestId);
  const batchId = batch && batch.batch_id ? batch.batch_id : (input.batch_id || rid('bullpen_delta_batch'));
  if (!batch) {
    await run(env.TEAM_DB, `INSERT OR REPLACE INTO bullpen_history_batches (batch_id,run_id,request_id,chain_id,job_key,worker_name,version,ingestion_mode,probe_only,stage_only,source_key,source_confidence,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,schedule_start_date,schedule_end_date,total_game_count,processed_game_count,remaining_game_count,status,certification_status,certification_grade,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'delta_update',0,0,?,?,?,?,?,?,?,?,?,0,?,'RUNNING_DELTA_UPDATE','DELTA_BULLPEN_HISTORY_DELTA_UPDATE_PARTIAL_CONTINUE','DELTA_PARTIAL',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, seasonFromDate(startDate), 'R', DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, startDate, endDate, candidates.length, candidates.length);
  }
  const processedRows = await all(env.TEAM_DB, `SELECT DISTINCT game_pk FROM bullpen_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status='GAME_STAGED_DELTA_ONLY'`, batchId);
  const processed = new Set(processedRows.map(r=>Number(r.game_pk)).filter(Number.isFinite));
  const todo = candidates.filter(g => !processed.has(Number(g.gamePk))).slice(0, Math.max(1, Math.min(Number(input.max_games_per_tick || DEFAULT_DELTA_CHUNK_GAMES), 20)));
  let sourceErrors=0, unclear=0, stagedRows=0, zeroTeams=0, gsZero=0, gsMissing=0, opener=0, externalCalls=1;
  for (const game of todo) {
    const endpoint = `/api/v1/game/${num(game.gamePk)}/boxscore`;
    const r = await processDeltaGameToStage(env, { game, batchId, runId, requestId, endpoint, season: seasonFromDate(startDate) });
    sourceErrors += r.sourceErrors; unclear += r.unclear; stagedRows += r.stagedRows; zeroTeams += r.zeroBullpenTeams; gsZero += r.gamesStartedZeroRows; gsMissing += r.gamesStartedMissingRows; opener += r.openerBulkEdgeCases; externalCalls += r.externalCalls;
  }
  await promoteDeltaStageRowsForBatch(env, batchId);
  const summary = await summarizeBatch(env, batchId);
  const live = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM bullpen_history WHERE batch_id=?`, batchId);
  const liveRows = Number(live && live.c || 0);
  const duplicateLiveKeys = await liveDuplicateCountForBatch(env, batchId);
  const processedCount = summary.processed_game_count;
  const remainingCount = Math.max(0, candidates.length - processedCount);
  const complete = remainingCount === 0;
  const pass = complete && summary.duplicate_stage_keys === 0 && duplicateLiveKeys === 0 && summary.source_error_count === 0 && summary.unclear_count === 0 && liveRows === summary.staged_bullpen_rows;
  const status = complete ? (pass ? 'COMPLETED_PROMOTED_STAGE_RETAINED' : 'DELTA_UPDATE_REVIEW_REQUIRED') : 'PARTIAL_CONTINUE';
  const cert = complete ? (pass ? 'DELTA_BULLPEN_HISTORY_CERTIFIED_PROMOTED_STAGE_RETAINED' : 'DELTA_BULLPEN_HISTORY_REVIEW_REQUIRED') : 'DELTA_BULLPEN_HISTORY_DELTA_UPDATE_PARTIAL_CONTINUE';
  const grade = complete ? (pass ? 'DELTA_PASS' : 'DELTA_REVIEW') : 'DELTA_PARTIAL';
  const output = { ok: pass || !complete, data_ok: pass || !complete, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, run_id:runId, batch_id:batchId, mode:'delta_update', status, certification:cert, certification_grade:grade, source_shape_classification:'GAME_LOG_STYLE_BULLPEN_APPEARANCE_ROWS', schedule_start_date:startDate, schedule_end_date:endDate, total_game_count:candidates.length, processed_game_count:processedCount, remaining_game_count:remainingCount, expected_bullpen_rows:summary.staged_bullpen_rows, staged_bullpen_rows:summary.staged_bullpen_rows, live_rows_for_batch:liveRows, rows_promoted:liveRows, duplicate_stage_keys:summary.duplicate_stage_keys, duplicate_live_keys:duplicateLiveKeys, source_error_count:summary.source_error_count, unclear_count:summary.unclear_count, teams_with_zero_bullpen_rows:summary.teams_with_zero_bullpen_rows, rows_read:todo.length, rows_written:stagedRows, external_calls_performed:externalCalls, stage_retained:true, no_full_sweep:true, continuation_required:!complete, orchestrator_should_self_continue:!complete, no_daily_bullpen_availability:true, no_scoring:true, no_ranking:true, no_final_board:true };
  await run(env.TEAM_DB, `UPDATE bullpen_history_batches SET expected_game_count=?, expected_bullpen_rows=?, staged_bullpen_rows=?, duplicate_stage_keys=?, teams_with_zero_bullpen_rows=?, games_started_zero_reliever_rows=games_started_zero_reliever_rows+?, games_started_missing_rows=games_started_missing_rows+?, opener_bulk_edge_case_count=opener_bulk_edge_case_count+?, source_error_count=?, unclear_count=?, status=?, certification_status=?, certification_grade=?, output_json=?, processed_game_count=?, remaining_game_count=?, rows_promoted=?, partial_continue_count=partial_continue_count+?, certified_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE certified_at END, promoted_at=CASE WHEN ?=1 THEN COALESCE(promoted_at,CURRENT_TIMESTAMP) ELSE promoted_at END, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, candidates.length, summary.staged_bullpen_rows, summary.staged_bullpen_rows, summary.duplicate_stage_keys, summary.teams_with_zero_bullpen_rows, gsZero, gsMissing, opener, summary.source_error_count, summary.unclear_count, status, cert, grade, safeJson(output), processedCount, remainingCount, liveRows, complete ? 0 : 1, complete ? 1 : 0, complete ? 1 : 0, batchId);
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO bullpen_history_cursor (cursor_key,ingestion_mode,source_key,source_season,source_game_type,base_backfill_cutoff_date,delta_reserved_start_date,last_sample_date,last_game_pk,last_batch_id,last_request_id,status,cursor_json,created_at,updated_at) VALUES ('bullpen_history_delta_update_cursor','delta_update',?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, SOURCE_KEY, seasonFromDate(endDate), 'R', DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, endDate, candidates.length ? num(candidates[candidates.length-1].gamePk) : null, batchId, requestId, status, safeJson(output));
  return output;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") {
      const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      const secrets = varPresence(env, REQUIRED_SECRETS);
      return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: db, vars, secrets_present_only: secrets }, safe_secret_note: "Secret values are intentionally never printed." });
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const mode = String(input.mode || (input.input_json && input.input_json.mode) || "source_lock_probe");
      if (mode === "source_lock_probe") return jsonResponse(await runSourceProbe(env, input));
      if (mode === "base_backfill_stage_only" || mode === "base_backfill") return jsonResponse(await runBaseBackfillStageOnly(env, input));
      if (mode === "base_promote_clean" || mode === "base_backfill_promote_clean") return jsonResponse(await runBasePromoteClean(env, input));
      if (mode === "delta_update") return jsonResponse(await runDeltaUpdate(env, input));
      return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "unsupported_mode_v0_4_0", mode, allowed_modes: ["source_lock_probe","base_backfill_stage_only","base_promote_clean","delta_update"], blocked_reason: "v0.4.0 forbids Daily Bullpen Availability, scoring, ranking, and final board.", no_daily_bullpen_availability: true }, 400);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
