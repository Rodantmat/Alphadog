const WORKER_NAME = "alphadog-v2-base-starter-history";
const VERSION = "alphadog-v2-base-starter-history-v0.1.0-schema-source-lock-probe";
const JOB_KEY = "base-starter-history";

const DEFAULT_SAMPLE_DATE = "2026-05-18";
const DEFAULT_SAMPLE_LIMIT = 3;
const DEFAULT_BASE_CUTOFF_DATE = "2026-05-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-05-19";
const SOURCE_KEY = "mlb_statsapi_schedule_boxscore_feed_starter_probe_v0_1_0";
const SOURCE_CONFIDENCE = "SOURCE_PROBE_ONLY_NOT_BASE_LOCKED";

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
    status: "SCHEMA_SOURCE_LOCK_PROBE_READY",
    timestamp_utc: nowUtc(),
    phase: "starter-history-v0.1.0-probe-only",
    notes: [
      "v0.1.0 is schema/source-lock probe only.",
      "Allowed writes: additive TEAM_DB lifecycle schema and probe rows only.",
      "Forbidden in this version: live starter_history promotion, full base backfill, delta_update execution, scoring, ranking, board mutation, and browser pump.",
      "The worker classifies starter_history as game-log style, snapshot style, or hybrid based on official completed-game sample evidence."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets)
    }
  };
}

async function ensureSchema(env) {
  const db = env.TEAM_DB;
  const statements = [
    `CREATE TABLE IF NOT EXISTS team_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`,
    `CREATE TABLE IF NOT EXISTS starter_history (
      starter_key TEXT PRIMARY KEY,
      player_id INTEGER,
      team_id TEXT,
      game_date TEXT,
      game_pk INTEGER,
      starter_json TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS starter_history_batches (
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
      actual_starter_identification_path TEXT,
      safest_key_model TEXT,
      expected_game_count INTEGER DEFAULT 0,
      expected_starter_rows INTEGER DEFAULT 0,
      staged_starter_rows INTEGER DEFAULT 0,
      duplicate_stage_keys INTEGER DEFAULT 0,
      final_games_sampled INTEGER DEFAULT 0,
      games_with_two_actual_starters INTEGER DEFAULT 0,
      missing_actual_starter_games INTEGER DEFAULT 0,
      probable_only_games INTEGER DEFAULT 0,
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
    `CREATE TABLE IF NOT EXISTS starter_history_stage (
      stage_id TEXT PRIMARY KEY,
      starter_key TEXT,
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
      starter_player_id INTEGER,
      starter_name TEXT,
      throws TEXT,
      started_game INTEGER,
      starter_source_path TEXT,
      starter_source_type TEXT,
      innings_pitched TEXT,
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
      wins INTEGER,
      losses INTEGER,
      no_decision INTEGER,
      days_rest INTEGER,
      days_rest_is_derived INTEGER DEFAULT 0,
      season_stat_context_json TEXT,
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
    `CREATE TABLE IF NOT EXISTS starter_history_outcomes (
      outcome_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      game_pk INTEGER,
      game_date TEXT,
      season INTEGER,
      team_id TEXT,
      opponent_team_id TEXT,
      starter_player_id INTEGER,
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
    `CREATE TABLE IF NOT EXISTS starter_history_cursor (
      cursor_key TEXT PRIMARY KEY,
      worker_name TEXT,
      version TEXT,
      ingestion_mode TEXT,
      status TEXT,
      source_shape_classification TEXT,
      base_backfill_cutoff_date TEXT,
      delta_reserved_start_date TEXT,
      last_probe_date TEXT,
      last_completed_game_date TEXT,
      last_batch_id TEXT,
      last_run_id TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS starter_history_certifications (
      certification_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      worker_name TEXT,
      version TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      source_shape_classification TEXT,
      actual_starter_identification_path TEXT,
      safest_key_model TEXT,
      expected_game_count INTEGER,
      expected_starter_rows INTEGER,
      staged_starter_rows INTEGER,
      duplicate_stage_keys INTEGER,
      missing_required_identity_count INTEGER,
      source_error_count INTEGER,
      unclear_count INTEGER,
      no_live_promotion INTEGER DEFAULT 1,
      full_base_backfill_blocked INTEGER DEFAULT 1,
      delta_update_blocked INTEGER DEFAULT 1,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_starter_history_stage_batch ON starter_history_stage(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_starter_history_stage_game_team ON starter_history_stage(game_pk, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_starter_history_stage_pitcher_date ON starter_history_stage(starter_player_id, game_date)`,
    `CREATE INDEX IF NOT EXISTS idx_starter_history_outcomes_batch ON starter_history_outcomes(batch_id, outcome_category)`,
    `CREATE INDEX IF NOT EXISTS idx_starter_history_batches_status ON starter_history_batches(status, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_starter_history_game_team ON starter_history(game_pk, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_starter_history_player_date ON starter_history(player_id, game_date)`,
    `INSERT OR IGNORE INTO team_schema_migrations (migration_key, package_version, notes) VALUES ('starter_history_v0_1_0_schema_source_lock_probe', '${VERSION}', 'Additive starter history lifecycle schema for source-lock probe only; no live promotion')`
  ];

  const alterStatements = [
    `ALTER TABLE starter_history ADD COLUMN season INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN game_type TEXT`,
    `ALTER TABLE starter_history ADD COLUMN game_status TEXT`,
    `ALTER TABLE starter_history ADD COLUMN opponent_team_id TEXT`,
    `ALTER TABLE starter_history ADD COLUMN is_home INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN venue_id INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN starter_name TEXT`,
    `ALTER TABLE starter_history ADD COLUMN throws TEXT`,
    `ALTER TABLE starter_history ADD COLUMN source_key TEXT`,
    `ALTER TABLE starter_history ADD COLUMN source_endpoint TEXT`,
    `ALTER TABLE starter_history ADD COLUMN source_confidence TEXT`,
    `ALTER TABLE starter_history ADD COLUMN data_feed_key TEXT`,
    `ALTER TABLE starter_history ADD COLUMN source_season INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN source_game_type TEXT`,
    `ALTER TABLE starter_history ADD COLUMN ingestion_mode TEXT`,
    `ALTER TABLE starter_history ADD COLUMN batch_id TEXT`,
    `ALTER TABLE starter_history ADD COLUMN run_id TEXT`,
    `ALTER TABLE starter_history ADD COLUMN certification_status TEXT`,
    `ALTER TABLE starter_history ADD COLUMN certification_grade TEXT`,
    `ALTER TABLE starter_history ADD COLUMN source_snapshot_date TEXT`,
    `ALTER TABLE starter_history ADD COLUMN raw_json TEXT`,
    `ALTER TABLE starter_history ADD COLUMN created_at TEXT`,
    `ALTER TABLE starter_history ADD COLUMN certified_at TEXT`,
    `ALTER TABLE starter_history ADD COLUMN promoted_at TEXT`
  ];

  const applied = [];
  const skipped = [];
  const failures = [];
  for (const sql of statements) {
    try { await run(db, sql); applied.push(sql.split("\n")[0].slice(0, 120)); }
    catch (err) { failures.push({ sql: sql.slice(0, 180), error: String(err && err.message ? err.message : err) }); }
  }
  for (const sql of alterStatements) {
    try { await run(db, sql); applied.push(sql); }
    catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (msg.toLowerCase().includes("duplicate column")) skipped.push(sql);
      else failures.push({ sql, error: msg });
    }
  }
  return { ok: failures.length === 0, applied_count: applied.length, skipped_existing_column_count: skipped.length, applied, skipped_existing_columns: skipped, failures };
}

function mlbBaseUrl(env) {
  return String((env && env.MLB_API_BASE_URL) || "https://statsapi.mlb.com").replace(/\/$/, "");
}
async function fetchMlbJson(env, endpoint) {
  const url = endpoint.startsWith("http") ? endpoint : `${mlbBaseUrl(env)}${endpoint}`;
  const headers = { "accept": "application/json", "user-agent": String((env && env.MLB_API_USER_AGENT) || "AlphaDog-v2-starter-history-probe/0.1.0") };
  const resp = await fetch(url, { headers });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = { parse_error: true, preview: text.slice(0, 500) }; }
  return { url, endpoint: url.replace(mlbBaseUrl(env), ""), http_status: resp.status, ok: resp.ok, json };
}
function isFinalStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "final" || s === "game over" || s === "completed early";
}
function teamBox(boxscore, side) { return boxscore && boxscore.teams && boxscore.teams[side] ? boxscore.teams[side] : null; }
function teamIdFromGame(game, side) { return game && game.teams && game.teams[side] && game.teams[side].team ? num(game.teams[side].team.id) : null; }
function teamNameFromGame(game, side) { return game && game.teams && game.teams[side] && game.teams[side].team ? str(game.teams[side].team.name) : null; }
function findStarterFromBoxTeam(teamNode) {
  const players = (teamNode && teamNode.players) || {};
  for (const [playerKey, playerNode] of Object.entries(players)) {
    const pitching = playerNode && playerNode.stats && playerNode.stats.pitching ? playerNode.stats.pitching : null;
    if (pitching && Number(pitching.gamesStarted || 0) === 1) {
      return { player_key: playerKey, player_node: playerNode, source_path: `boxscore.teams.{side}.players.${playerKey}.stats.pitching.gamesStarted`, source_type: "official_final_boxscore_games_started" };
    }
  }
  const pitcherIds = Array.isArray(teamNode && teamNode.pitchers) ? teamNode.pitchers : [];
  if (pitcherIds.length > 0) {
    const firstId = pitcherIds[0];
    const playerKey = `ID${firstId}`;
    return { player_key: playerKey, player_node: players[playerKey] || null, fallback_pitcher_id: num(firstId), source_path: "boxscore.teams.{side}.pitchers[0]", source_type: "boxscore_pitcher_order_fallback_not_locked" };
  }
  return null;
}
function extractPitchingLine(playerNode) {
  const p = playerNode && playerNode.stats && playerNode.stats.pitching ? playerNode.stats.pitching : {};
  return {
    innings_pitched: str(p.inningsPitched),
    outs_recorded: num(p.outs),
    batters_faced: num(p.battersFaced),
    pitches: num(p.numberOfPitches || p.pitches),
    strikes: num(p.strikes),
    hits_allowed: num(p.hits),
    runs_allowed: num(p.runs),
    earned_runs: num(p.earnedRuns),
    walks_allowed: num(p.baseOnBalls),
    strikeouts: num(p.strikeOuts),
    home_runs_allowed: num(p.homeRuns),
    wins: num(p.wins),
    losses: num(p.losses)
  };
}
function playerIdFromStarter(starter) {
  if (!starter) return null;
  if (starter.player_node && starter.player_node.person && starter.player_node.person.id != null) return num(starter.player_node.person.id);
  if (starter.fallback_pitcher_id != null) return num(starter.fallback_pitcher_id);
  const m = String(starter.player_key || "").match(/ID(\d+)/);
  return m ? num(m[1]) : null;
}
function playerNameFromStarter(starter) {
  return starter && starter.player_node && starter.player_node.person ? str(starter.player_node.person.fullName) : null;
}
function throwsFromStarter(starter) {
  const pp = starter && starter.player_node && starter.player_node.person && starter.player_node.person.pitchHand ? starter.player_node.person.pitchHand : null;
  return pp ? str(pp.code || pp.description) : null;
}

async function insertOutcome(env, row) {
  await run(env.TEAM_DB, `INSERT INTO starter_history_outcomes (
    outcome_id, batch_id, run_id, request_id, game_pk, game_date, season, team_id, opponent_team_id, starter_player_id,
    outcome_level, outcome_category, status, reason, source_endpoint, source_key, source_confidence, source_snapshot_date, details_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rid("starter_outcome"), row.batch_id, row.run_id, row.request_id, row.game_pk || null, row.game_date || null, row.season || null,
    row.team_id == null ? null : String(row.team_id), row.opponent_team_id == null ? null : String(row.opponent_team_id), row.starter_player_id || null,
    row.outcome_level, row.outcome_category, row.status, row.reason || null, row.source_endpoint || null, SOURCE_KEY, SOURCE_CONFIDENCE, row.source_snapshot_date || null, safeJson(row.details || {})
  );
}
async function insertStage(env, row) {
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_stage (
    stage_id, starter_key, game_pk, game_date, season, game_type, game_status, team_id, team_name, opponent_team_id, opponent_team_name, is_home, venue_id,
    starter_player_id, starter_name, throws, started_game, starter_source_path, starter_source_type,
    innings_pitched, outs_recorded, batters_faced, pitches, strikes, hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed, wins, losses, no_decision, days_rest, days_rest_is_derived,
    season_stat_context_json, data_feed_key, source_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id, request_id,
    certification_status, certification_grade, source_confidence, source_snapshot_date, raw_json, certified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    rid("starter_stage"), row.starter_key, row.game_pk, row.game_date, row.season, row.game_type, row.game_status, String(row.team_id), row.team_name, String(row.opponent_team_id), row.opponent_team_name, row.is_home ? 1 : 0, row.venue_id,
    row.starter_player_id, row.starter_name, row.throws, 1, row.starter_source_path, row.starter_source_type,
    row.innings_pitched, row.outs_recorded, row.batters_faced, row.pitches, row.strikes, row.hits_allowed, row.runs_allowed, row.earned_runs, row.walks_allowed, row.strikeouts, row.home_runs_allowed, row.wins, row.losses, null, null, 0,
    null, "starter_history_actual_start_event", SOURCE_KEY, row.source_endpoint, row.season, row.game_type, "source_lock_probe", row.batch_id, row.run_id, row.request_id,
    "STARTER_HISTORY_SOURCE_PROBE_CERTIFIED", "PROBE_ONLY", SOURCE_CONFIDENCE, row.game_date, safeJson(row.raw_json)
  );
}

async function runSourceProbe(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, status: "schema_failed", certification: "STARTER_HISTORY_SCHEMA_FAILED", schema, rows_read: 0, rows_written: 0, external_calls_performed: 0 };

  const requestId = input.request_id || rid("starter_probe_req");
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid("starter_probe_run");
  const batchId = rid("starter_probe_batch");
  const sampleDate = ymd((input.input_json && input.input_json.sample_date) || input.sample_date || DEFAULT_SAMPLE_DATE);
  const sampleLimit = Math.max(1, Math.min(8, Number((input.input_json && input.input_json.sample_limit) || input.sample_limit || DEFAULT_SAMPLE_LIMIT) || DEFAULT_SAMPLE_LIMIT));
  const season = seasonFromDate(sampleDate);
  const scheduleEndpoint = `/api/v1/schedule?sportId=1&gameTypes=R&startDate=${sampleDate}&endDate=${sampleDate}&hydrate=team,venue`;

  await run(env.TEAM_DB, `INSERT INTO starter_history_batches (
    batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type,
    base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, sample_limit, status, certification_status, certification_grade
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'source_lock_probe', 1, ?, ?, ?, 'R', ?, ?, ?, ?, ?, 'RUNNING_SOURCE_PROBE', 'STARTER_HISTORY_SOURCE_PROBE_RUNNING', 'PROBE_ONLY')`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, sampleDate, sampleDate, sampleLimit
  );

  let externalCalls = 0;
  const schedule = await fetchMlbJson(env, scheduleEndpoint); externalCalls += 1;
  if (!schedule.ok) {
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, outcome_level: "SOURCE", outcome_category: "SOURCE_ERROR", status: "SOURCE_ERROR", reason: "schedule_http_error", source_endpoint: schedule.endpoint, details: { http_status: schedule.http_status } });
  }

  const gamesRaw = [];
  for (const dateNode of (schedule.json && schedule.json.dates ? schedule.json.dates : [])) {
    for (const game of (dateNode.games || [])) gamesRaw.push(game);
  }
  const finalGames = gamesRaw.filter(g => isFinalStatus(g && g.status && (g.status.detailedState || g.status.abstractGameState))).slice(0, sampleLimit);
  let stagedRows = 0;
  let gamesWithTwoStarters = 0;
  let missingActualStarterGames = 0;
  let probableOnlyGames = 0;
  let sourceErrors = schedule.ok ? 0 : 1;
  let unclear = 0;
  const probeGames = [];

  for (const game of finalGames) {
    const gamePk = num(game.gamePk);
    const gameDate = ymd(game.gameDate || sampleDate);
    const gameStatus = str(game.status && (game.status.detailedState || game.status.abstractGameState));
    const gameType = str(game.gameType || "R");
    const venueId = game.venue ? num(game.venue.id) : null;
    const boxEndpoint = `/api/v1/game/${gamePk}/boxscore`;
    const feedEndpoint = `/api/v1.1/game/${gamePk}/feed/live`;
    const box = await fetchMlbJson(env, boxEndpoint); externalCalls += 1;
    let feed = null;
    const gameProbe = { game_pk: gamePk, game_date: gameDate, game_status: gameStatus, boxscore_http_status: box.http_status, feed_http_status: null, starters: [] };
    if (!box.ok) {
      sourceErrors += 1;
      await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: "GAME", outcome_category: "SOURCE_ERROR", status: "SOURCE_ERROR", reason: "boxscore_http_error", source_endpoint: box.endpoint, details: { http_status: box.http_status } });
      probeGames.push(gameProbe);
      continue;
    }
    const sides = ["away", "home"];
    let officialStarterCount = 0;
    for (const side of sides) {
      const otherSide = side === "away" ? "home" : "away";
      const teamNode = teamBox(box.json, side);
      let starter = findStarterFromBoxTeam(teamNode);
      const starterSourceType = starter ? starter.source_type : null;
      if (!starter || starterSourceType !== "official_final_boxscore_games_started") {
        if (!feed) { feed = await fetchMlbJson(env, feedEndpoint); externalCalls += 1; gameProbe.feed_http_status = feed.http_status; }
      }
      const playerId = playerIdFromStarter(starter);
      const teamId = teamIdFromGame(game, side);
      const opponentTeamId = teamIdFromGame(game, otherSide);
      const probable = game && game.teams && game.teams[side] ? game.teams[side].probablePitcher : null;
      const probableId = probable ? num(probable.id) : null;
      if (probableId && (!playerId || probableId !== playerId)) probableOnlyGames += 1;
      if (!starter || !playerId || starterSourceType !== "official_final_boxscore_games_started") {
        unclear += 1;
        await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId, outcome_level: "STARTER", outcome_category: "UNCLEAR", status: "UNCLEAR", reason: "actual_starter_not_confirmed_by_boxscore_gamesStarted", source_endpoint: box.endpoint, details: { side, probable_id: probableId, fallback_player_id: playerId, starter_source_type: starterSourceType } });
        gameProbe.starters.push({ side, team_id: teamId, player_id: playerId, starter_source_type: starterSourceType, confirmed_actual: false, probable_id: probableId });
        continue;
      }
      officialStarterCount += 1;
      const line = extractPitchingLine(starter.player_node);
      const starterKey = `${gamePk}_${teamId}`;
      const stageRow = {
        batch_id: batchId, run_id: runId, request_id: requestId, starter_key: starterKey, game_pk: gamePk, game_date: gameDate, season, game_type: gameType, game_status: gameStatus,
        team_id: teamId, team_name: teamNameFromGame(game, side), opponent_team_id: opponentTeamId, opponent_team_name: teamNameFromGame(game, otherSide), is_home: side === "home", venue_id: venueId,
        starter_player_id: playerId, starter_name: playerNameFromStarter(starter), throws: throwsFromStarter(starter), starter_source_path: starter.source_path.replace("{side}", side), starter_source_type: starter.source_type,
        source_endpoint: box.endpoint, raw_json: { side, game_summary: game, starter_player_node: starter.player_node, pitching_line: line, probable_pitcher_from_schedule: probable || null }, ...line
      };
      await insertStage(env, stageRow);
      await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId, outcome_level: "STARTER", outcome_category: "PROMOTED_ROWS", status: "STAGED_PROBE_ONLY", reason: "official_final_boxscore_gamesStarted_identified_actual_starter", source_endpoint: box.endpoint, details: { side, starter_key: starterKey, starter_source_path: stageRow.starter_source_path, no_live_promotion: true } });
      stagedRows += 1;
      gameProbe.starters.push({ side, team_id: teamId, player_id: playerId, starter_name: stageRow.starter_name, starter_source_type: starter.source_type, starter_source_path: stageRow.starter_source_path, confirmed_actual: true, probable_id: probableId, pitching_line_fields_present: Object.fromEntries(Object.entries(line).map(([k, v]) => [k, v !== null && v !== undefined])) });
    }
    if (officialStarterCount === 2) {
      gamesWithTwoStarters += 1;
      await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: "GAME", outcome_category: "GAME_PROMOTED", status: "GAME_STAGED_PROBE_ONLY", reason: "two_actual_starters_identified_from_final_boxscore", source_endpoint: box.endpoint, details: { no_live_promotion: true } });
    } else {
      missingActualStarterGames += 1;
      await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: "GAME", outcome_category: "GAME_UNCLEAR", status: "GAME_UNCLEAR", reason: "not_exactly_two_actual_starters_identified", source_endpoint: box.endpoint, details: { official_starter_count: officialStarterCount } });
    }
    probeGames.push(gameProbe);
  }

  const duplicate = await first(env.TEAM_DB, "SELECT COUNT(*) AS duplicate_stage_keys FROM (SELECT starter_key, COUNT(*) c FROM starter_history_stage WHERE batch_id=? GROUP BY starter_key HAVING c > 1)", batchId);
  const missingIdentity = await first(env.TEAM_DB, "SELECT COUNT(*) AS missing_required_identity_count FROM starter_history_stage WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL)", batchId);
  const duplicateStageKeys = num(duplicate && duplicate.duplicate_stage_keys) || 0;
  const missingRequiredIdentityCount = num(missingIdentity && missingIdentity.missing_required_identity_count) || 0;

  const expectedGameCount = finalGames.length;
  const expectedStarterRows = expectedGameCount * 2;
  let sourceShapeClassification = "AMBIGUOUS";
  let certificationStatus = "STARTER_HISTORY_SOURCE_PROBE_AMBIGUOUS_RESEARCH_REQUIRED";
  let certificationGrade = "PROBE_AMBIGUOUS";
  let actualStarterIdentificationPath = "UNLOCKED";
  let safestKeyModel = "UNLOCKED";
  const allTwoStarters = expectedGameCount > 0 && gamesWithTwoStarters === expectedGameCount && stagedRows === expectedStarterRows && duplicateStageKeys === 0 && missingRequiredIdentityCount === 0 && sourceErrors === 0;
  if (allTwoStarters) {
    sourceShapeClassification = "GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS";
    certificationStatus = "STARTER_HISTORY_SOURCE_PROBE_GAME_LOG_STYLE_READY_FOR_STAGE_ONLY_BASE_DESIGN";
    certificationGrade = "PROBE_PASS";
    actualStarterIdentificationPath = "MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1";
    safestKeyModel = "game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation";
  } else if (stagedRows === 0 && probableOnlyGames > 0) {
    sourceShapeClassification = "SNAPSHOT_OR_PROBABLE_ONLY_NOT_ACTUAL_HISTORY";
    certificationStatus = "STARTER_HISTORY_SOURCE_PROBE_NOT_SAFE_FOR_HISTORICAL_ACTUAL_STARTERS";
    certificationGrade = "PROBE_BLOCKED";
  } else if (stagedRows > 0) {
    sourceShapeClassification = "HYBRID_OR_PARTIAL_GAME_LOG_STYLE_REQUIRES_RESEARCH";
    certificationStatus = "STARTER_HISTORY_SOURCE_PROBE_PARTIAL_HYBRID_RESEARCH_REQUIRED";
    certificationGrade = "PROBE_PARTIAL";
  }

  const output = {
    source_shape_classification: sourceShapeClassification,
    actual_starter_identification_path: actualStarterIdentificationPath,
    actual_starter_source_official_final: sourceShapeClassification === "GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS",
    schedule_endpoint_tested: schedule.endpoint,
    boxscore_endpoint_pattern_tested: "/api/v1/game/{gamePk}/boxscore",
    feed_endpoint_pattern_tested_if_needed: "/api/v1.1/game/{gamePk}/feed/live",
    completed_game_sample_date: sampleDate,
    completed_games_sampled: expectedGameCount,
    expected_starter_rows: expectedStarterRows,
    staged_starter_rows: stagedRows,
    games_with_two_actual_starters: gamesWithTwoStarters,
    missing_actual_starter_games: missingActualStarterGames,
    probable_only_mismatch_or_context_count: probableOnlyGames,
    duplicate_stage_keys: duplicateStageKeys,
    missing_required_identity_count: missingRequiredIdentityCount,
    source_error_count: sourceErrors,
    unclear_count: unclear,
    safest_key_model: safestKeyModel,
    fields_confirmed: {
      game_pk: stagedRows > 0,
      game_date: stagedRows > 0,
      season: stagedRows > 0,
      team_id: stagedRows > 0,
      opponent_team_id: stagedRows > 0,
      is_home: stagedRows > 0,
      starter_player_id: stagedRows > 0,
      starter_name: stagedRows > 0,
      throws: stagedRows > 0,
      pitching_line_from_boxscore_stats_pitching: stagedRows > 0,
      days_rest: false,
      win_loss_no_decision_locked: false
    },
    lifecycle_recommendation_if_approved_next: sourceShapeClassification === "GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS" ? "v0.2.0 base_backfill stage-only can follow Team Game Logs/Hitter-Pitcher Game Logs pattern: base through 2026-05-18, delta from 2026-05-19, retained delta stage, no-op by latest completed final date, scoped repair by game/team starter key." : "Do not build base_backfill yet; research source ambiguity first.",
    no_live_promotion: true,
    full_base_backfill_blocked: true,
    delta_update_blocked: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true,
    probe_games: probeGames.slice(0, 5)
  };

  await run(env.TEAM_DB, `UPDATE starter_history_batches SET
    source_shape_classification=?, actual_starter_identification_path=?, safest_key_model=?, expected_game_count=?, expected_starter_rows=?, staged_starter_rows=?, duplicate_stage_keys=?, final_games_sampled=?, games_with_two_actual_starters=?, missing_actual_starter_games=?, probable_only_games=?, source_error_count=?, unclear_count=?, status='COMPLETED_SOURCE_PROBE_ONLY_NO_PROMOTION', certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`,
    sourceShapeClassification, actualStarterIdentificationPath, safestKeyModel, expectedGameCount, expectedStarterRows, stagedRows, duplicateStageKeys, expectedGameCount, gamesWithTwoStarters, missingActualStarterGames, probableOnlyGames, sourceErrors, unclear, certificationStatus, certificationGrade, safeJson(output), batchId
  );
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_source_lock_probe', ?, ?, 'source_lock_probe', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, sourceShapeClassification, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, sampleDate, sampleDate, batchId, runId, safeJson(output)
  );
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?)`,
    rid("starter_cert"), batchId, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade, sourceShapeClassification, actualStarterIdentificationPath, safestKeyModel,
    expectedGameCount, expectedStarterRows, stagedRows, duplicateStageKeys, missingRequiredIdentityCount, sourceErrors, unclear, safeJson(output)
  );

  return {
    ok: true,
    data_ok: certificationGrade === "PROBE_PASS",
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    run_id: runId,
    batch_id: batchId,
    status: "completed_source_probe_only_no_promotion",
    certification: certificationStatus,
    certification_grade: certificationGrade,
    rows_read: expectedGameCount,
    rows_written: stagedRows,
    rows_promoted: 0,
    external_calls_performed: externalCalls,
    schema,
    output_json: output,
    source_shape_classification: sourceShapeClassification,
    actual_starter_identification_path: actualStarterIdentificationPath,
    safest_key_model: safestKeyModel,
    next_action: certificationGrade === "PROBE_PASS" ? "APPROVE_V0_2_0_BASE_BACKFILL_STAGE_ONLY_DESIGN" : "STOP_FOR_SOURCE_RESEARCH_BEFORE_BASE_BACKFILL",
    no_live_promotion: true,
    no_full_base_backfill: true,
    no_delta_update_execution: true,
    no_browser_pump: true,
    timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") {
      return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, REQUIRED_SECRETS) }, safe_secret_note: "Secret values are intentionally never printed." });
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, diagnostics: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, REQUIRED_SECRETS) }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const mode = String((input.input_json && input.input_json.mode) || input.mode || "source_lock_probe");
      if (mode === "delta_update") return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "delta_update_blocked_in_v0_1_0", certification: "STARTER_HISTORY_DELTA_UPDATE_BLOCKED_UNTIL_BASE_SOURCE_LOCKED", no_live_promotion: true, no_delta_update_execution: true }, 409);
      return jsonResponse(await runSourceProbe(env, input));
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
