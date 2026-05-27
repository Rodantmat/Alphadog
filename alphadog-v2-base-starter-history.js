const WORKER_NAME = "alphadog-v2-base-starter-history";
const VERSION = "alphadog-v2-base-starter-history-v0.4.7-live-source-gap-scheduled-wait-override";
const JOB_KEY = "base-starter-history";

const DEFAULT_SAMPLE_DATE = "2026-05-18";
const DEFAULT_SAMPLE_LIMIT = 3;
const DEFAULT_BASE_CUTOFF_DATE = "2026-05-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-05-19";
const DEFAULT_BASE_START_DATE = "2026-03-01";
const DEFAULT_BASE_MAX_GAMES_PER_TICK = 50;
const SOURCE_KEY = "mlb_statsapi_schedule_boxscore_starter_history_v0_2_0";
const SOURCE_CONFIDENCE = "OFFICIAL_FINAL_BOXSCORE_GAMES_STARTED_SOURCE_LOCKED";

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
    status: "BASE_STARTER_HISTORY_CALENDAR_TALLY_GAP_SCOPED_MINING",
    timestamp_utc: nowUtc(),
    phase: "starter-history-v0.4.7-live-source-gap-scheduled-wait-override",
    notes: [
      "v0.4.7 fixes calendar/tally scoped gap mining: starter_history blocking gaps in mlb_game_data_coverage are the first-class repair target before any legacy retained-stage noop path.",
      "Allowed writes: repair missing live + retained-stage delta keys by refetching only the affected game/key, rewriting the retained stage row, and promoting that key. No full sweep, no new batch.",
      "Forbidden in this version: full sweep, new batch, scoring, ranking, board mutation, and browser pump.",
      "Starter history is source-classified as GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS via official final boxscore gamesStarted == 1."
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
    `ALTER TABLE starter_history ADD COLUMN promoted_at TEXT`,
    `ALTER TABLE starter_history ADD COLUMN starter_player_id INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN started_game INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN starter_source_path TEXT`,
    `ALTER TABLE starter_history ADD COLUMN starter_source_type TEXT`,
    `ALTER TABLE starter_history ADD COLUMN innings_pitched TEXT`,
    `ALTER TABLE starter_history ADD COLUMN outs_recorded INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN batters_faced INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN pitches INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN strikes INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN hits_allowed INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN runs_allowed INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN earned_runs INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN walks_allowed INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN strikeouts INTEGER`,
    `ALTER TABLE starter_history ADD COLUMN home_runs_allowed INTEGER`,
    `ALTER TABLE starter_history_batches ADD COLUMN rows_promoted INTEGER DEFAULT 0`,
    `ALTER TABLE starter_history_batches ADD COLUMN stage_rows_after_clean INTEGER DEFAULT 0`,
    `ALTER TABLE starter_history_batches ADD COLUMN live_rows_for_batch INTEGER DEFAULT 0`,
    `ALTER TABLE starter_history_batches ADD COLUMN duplicate_live_keys INTEGER DEFAULT 0`,
    `ALTER TABLE starter_history_batches ADD COLUMN missing_live_identity_count INTEGER DEFAULT 0`
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
  // Normalize optional env override so both are safe:
  // - https://statsapi.mlb.com
  // - https://statsapi.mlb.com/api/v1
  // This worker passes endpoints beginning with /api/v1/... below.
  return String((env && env.MLB_API_BASE_URL) || "https://statsapi.mlb.com")
    .replace(/\/$/, "")
    .replace(/\/api\/v1$/i, "");
}
async function fetchMlbJson(env, endpoint) {
  const base = mlbBaseUrl(env);
  const url = endpoint.startsWith("http") ? endpoint : `${base}${endpoint}`;
  const headers = { "accept": "application/json", "user-agent": String((env && env.MLB_API_USER_AGENT) || "AlphaDog-v2-starter-history-base-stage/0.2.0") };
  const resp = await fetch(url, { headers });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = { parse_error: true, preview: text.slice(0, 500) }; }
  return { url, endpoint: url.replace(base, ""), http_status: resp.status, ok: resp.ok, json, text_preview: text.slice(0, 500) };
}
function scheduleEndpointCandidates(sampleDate) {
  const d = encodeURIComponent(sampleDate);
  return [
    `/api/v1/schedule?sportId=1&gameType=R&startDate=${d}&endDate=${d}`,
    `/api/v1/schedule?sportId=1&startDate=${d}&endDate=${d}`,
    `/api/v1/schedule?sportId=1&date=${d}`,
    `/api/v1/schedule?sportId=1&gameTypes=R&startDate=${d}&endDate=${d}`
  ];
}
async function fetchScheduleWithFallbacks(env, sampleDate) {
  const attempts = [];
  for (const endpoint of scheduleEndpointCandidates(sampleDate)) {
    const result = await fetchMlbJson(env, endpoint);
    const attempt = {
      endpoint: result.endpoint,
      url: result.url,
      http_status: result.http_status,
      ok: Boolean(result.ok && result.json && Array.isArray(result.json.dates)),
      text_preview: result.text_preview,
      has_dates_array: Boolean(result.json && Array.isArray(result.json.dates)),
      dates_count: result.json && Array.isArray(result.json.dates) ? result.json.dates.length : 0
    };
    attempts.push(attempt);
    if (attempt.ok) return { ...result, attempts };
  }
  const last = attempts[attempts.length - 1] || null;
  return { ok: false, endpoint: last ? last.endpoint : null, url: last ? last.url : null, http_status: last ? last.http_status : null, json: null, attempts, text_preview: last ? last.text_preview : null };
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
  const scheduleEndpointsAttempted = scheduleEndpointCandidates(sampleDate);

  await run(env.TEAM_DB, `INSERT INTO starter_history_batches (
    batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type,
    base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, sample_limit, status, certification_status, certification_grade
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'source_lock_probe', 1, ?, ?, ?, 'R', ?, ?, ?, ?, ?, 'RUNNING_SOURCE_PROBE', 'STARTER_HISTORY_SOURCE_PROBE_RUNNING', 'PROBE_ONLY')`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, sampleDate, sampleDate, sampleLimit
  );

  let externalCalls = 0;
  const schedule = await fetchScheduleWithFallbacks(env, sampleDate); externalCalls += schedule.attempts.length;
  for (const attempt of schedule.attempts) {
    await insertOutcome(env, {
      batch_id: batchId, run_id: runId, request_id: requestId, outcome_level: "SOURCE",
      outcome_category: attempt.ok ? "SOURCE_PROBE" : "SOURCE_ERROR",
      status: attempt.ok ? "SCHEDULE_ENDPOINT_OK" : "SCHEDULE_ENDPOINT_FAILED",
      reason: attempt.ok ? "schedule_endpoint_returned_usable_dates_array" : "schedule_endpoint_http_or_shape_error",
      source_endpoint: attempt.endpoint,
      details: { http_status: attempt.http_status, ok: attempt.ok, has_dates_array: attempt.has_dates_array, dates_count: attempt.dates_count, url: attempt.url, text_preview: attempt.text_preview }
    });
  }
  if (!schedule.ok) {
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, outcome_level: "SOURCE", outcome_category: "SOURCE_ERROR", status: "SOURCE_ERROR", reason: "all_schedule_endpoint_fallbacks_failed", source_endpoint: schedule.endpoint, details: { attempts: schedule.attempts } });
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
    schedule_endpoint_selected: schedule.endpoint,
    schedule_endpoints_attempted: scheduleEndpointsAttempted,
    schedule_attempts: schedule.attempts,
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


function baseRangeScheduleEndpoint(startDate, endDate) {
  const s = encodeURIComponent(startDate);
  const e = encodeURIComponent(endDate);
  return `/api/v1/schedule?sportId=1&gameType=R&startDate=${s}&endDate=${e}`;
}
function isTerminalBaseBatchStatus(status) {
  const s = String(status || "").toUpperCase();
  return s.startsWith("COMPLETED_") || s.startsWith("FAILED_") || s.includes("CERTIFIED_NO_PROMOTION") || s.includes("BLOCKED");
}
function isFinalizationOnlyStatus(status) {
  return String(status || "").toUpperCase() === "FINALIZATION_ONLY_READY";
}
async function loadActiveBaseBatch(env, requestId) {
  return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE request_id=? AND ingestion_mode='base_backfill_stage_only' AND status NOT LIKE 'COMPLETED_%' AND status NOT LIKE 'FAILED_%' ORDER BY datetime(created_at) DESC LIMIT 1`, requestId);
}
async function createBaseStageBatch(env, input, requestId, chainId, runId, baseStartDate, cutoffDate, season) {
  const batchId = rid("starter_base_stage_batch");
  await run(env.TEAM_DB, `INSERT INTO starter_history_batches (
    batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type,
    base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, sample_limit, source_shape_classification,
    actual_starter_identification_path, safest_key_model, status, certification_status, certification_grade, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'base_backfill_stage_only', 0, ?, ?, ?, 'R', ?, ?, ?, ?, NULL, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, 'RUNNING_BASE_BACKFILL_STAGE_ONLY_SEEDING', 'STARTER_HISTORY_BASE_STAGE_ONLY_RUNNING', 'STAGE_ONLY_IN_PROGRESS', ?)`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, cutoffDate, DEFAULT_DELTA_RESERVED_START_DATE,
    baseStartDate, cutoffDate,
    "MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1",
    "game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation",
    safeJson({ created_for: "stage_only_base_backfill", no_live_promotion: true, no_delta_update_execution: true })
  );
  return batchId;
}
async function seedBaseGameUniverse(env, batchId, runId, requestId, baseStartDate, cutoffDate, season) {
  const endpoint = baseRangeScheduleEndpoint(baseStartDate, cutoffDate);
  const schedule = await fetchMlbJson(env, endpoint);
  await insertOutcome(env, {
    batch_id: batchId, run_id: runId, request_id: requestId,
    outcome_level: "SOURCE",
    outcome_category: schedule.ok && schedule.json && Array.isArray(schedule.json.dates) ? "SOURCE_PROBE" : "SOURCE_ERROR",
    status: schedule.ok && schedule.json && Array.isArray(schedule.json.dates) ? "BASE_SCHEDULE_ENDPOINT_OK" : "BASE_SCHEDULE_ENDPOINT_FAILED",
    reason: schedule.ok && schedule.json && Array.isArray(schedule.json.dates) ? "base_backfill_schedule_returned_usable_dates_array" : "base_backfill_schedule_http_or_shape_error",
    source_endpoint: schedule.endpoint,
    details: { http_status: schedule.http_status, ok: schedule.ok, has_dates_array: Boolean(schedule.json && Array.isArray(schedule.json.dates)), url: schedule.url, text_preview: schedule.text_preview }
  });
  if (!schedule.ok || !schedule.json || !Array.isArray(schedule.json.dates)) {
    await run(env.TEAM_DB, `UPDATE starter_history_batches SET status='FAILED_BASE_SCHEDULE_SOURCE_ERROR', certification_status='STARTER_HISTORY_BASE_STAGE_ONLY_SCHEDULE_SOURCE_ERROR', certification_grade='STAGE_ONLY_BLOCKED', source_error_count=1, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, safeJson({ schedule_endpoint: endpoint, http_status: schedule.http_status, text_preview: schedule.text_preview }), batchId);
    return { ok: false, external_calls: 1, final_game_count: 0, non_final_count: 0, source_error_count: 1 };
  }
  const seen = new Set();
  let finalGameCount = 0;
  let nonFinalCount = 0;
  for (const dateNode of schedule.json.dates || []) {
    for (const game of dateNode.games || []) {
      const gamePk = num(game.gamePk);
      if (!gamePk || seen.has(gamePk)) continue;
      seen.add(gamePk);
      const gameDate = ymd(game.gameDate || dateNode.date || cutoffDate);
      const gameStatus = str(game.status && (game.status.detailedState || game.status.abstractGameState));
      const gameType = str(game.gameType || "R");
      const venueId = game.venue ? num(game.venue.id) : null;
      const homeTeamId = teamIdFromGame(game, "home");
      const awayTeamId = teamIdFromGame(game, "away");
      const details = {
        game_pk: gamePk,
        game_date: gameDate,
        game_status: gameStatus,
        game_type: gameType,
        venue_id: venueId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        link: game.link || null
      };
      if (isFinalStatus(gameStatus)) {
        finalGameCount += 1;
        await insertOutcome(env, {
          batch_id: batchId, run_id: runId, request_id: requestId,
          game_pk: gamePk, game_date: gameDate, season,
          outcome_level: "GAME",
          outcome_category: "GAME_PENDING",
          status: "PENDING_SOURCE",
          reason: "completed_final_regular_season_game_queued_for_starter_boxscore_stage_only",
          source_endpoint: endpoint,
          details
        });
      } else {
        nonFinalCount += 1;
        await insertOutcome(env, {
          batch_id: batchId, run_id: runId, request_id: requestId,
          game_pk: gamePk, game_date: gameDate, season,
          outcome_level: "GAME",
          outcome_category: "GAME_NOT_FINAL",
          status: "FILTERED_NON_FINAL_OR_NO_DATA",
          reason: "not_final_completed_game_not_part_of_base_starter_history_universe",
          source_endpoint: endpoint,
          details
        });
      }
    }
  }
  await run(env.TEAM_DB, `UPDATE starter_history_batches SET expected_game_count=?, expected_starter_rows=?, final_games_sampled=?, status='RUNNING_BASE_BACKFILL_STAGE_ONLY', certification_status='STARTER_HISTORY_BASE_STAGE_ONLY_RUNNING', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    finalGameCount, finalGameCount * 2, finalGameCount, safeJson({ base_start_date: baseStartDate, base_backfill_cutoff_date: cutoffDate, final_game_count: finalGameCount, expected_starter_rows: finalGameCount * 2, non_final_or_filtered_game_count: nonFinalCount, no_live_promotion: true }), batchId);
  return { ok: true, external_calls: 1, final_game_count: finalGameCount, non_final_count: nonFinalCount, source_error_count: 0 };
}
function gameDetailsFromOutcome(row) {
  try { return JSON.parse(row.details_json || "{}"); } catch (_) { return {}; }
}
async function processOneBaseGame(env, batch, gameRow, runId, requestId) {
  const details = gameDetailsFromOutcome(gameRow);
  const gamePk = num(gameRow.game_pk);
  const gameDate = ymd(gameRow.game_date || details.game_date);
  const season = seasonFromDate(gameDate);
  const gameStatus = str(details.game_status || "Final");
  const gameType = str(details.game_type || "R");
  const venueId = num(details.venue_id);
  const boxEndpoint = `/api/v1/game/${gamePk}/boxscore`;
  const box = await fetchMlbJson(env, boxEndpoint);
  if (!box.ok) {
    await run(env.TEAM_DB, `UPDATE starter_history_outcomes SET outcome_category='GAME_SOURCE_ERROR', status='GAME_SOURCE_ERROR', reason='boxscore_http_error', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND outcome_level='GAME' AND game_pk=? AND status='PENDING_SOURCE'`, box.endpoint, safeJson({ ...details, boxscore_http_status: box.http_status, text_preview: box.text_preview }), batch.batch_id, gamePk);
    return { rows_written: 0, source_error: 1, unclear: 0, games_with_two: 0, external_calls: 1 };
  }
  let officialStarterCount = 0;
  let rowsWritten = 0;
  let unclear = 0;
  const sides = ["away", "home"];
  for (const side of sides) {
    const otherSide = side === "away" ? "home" : "away";
    const teamNode = teamBox(box.json, side);
    const starter = findStarterFromBoxTeam(teamNode);
    const playerId = playerIdFromStarter(starter);
    const teamId = details[`${side}_team_id`] || teamIdFromGame(details, side) || null;
    const opponentTeamId = details[`${otherSide}_team_id`] || teamIdFromGame(details, otherSide) || null;
    if (!starter || !playerId || starter.source_type !== "official_final_boxscore_games_started" || !teamId || !opponentTeamId) {
      unclear += 1;
      await insertOutcome(env, { batch_id: batch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId, outcome_level: "STARTER", outcome_category: "UNCLEAR", status: "UNCLEAR", reason: "actual_starter_not_confirmed_by_boxscore_gamesStarted_during_base_stage_only", source_endpoint: box.endpoint, details: { side, player_id: playerId, starter_source_type: starter ? starter.source_type : null } });
      continue;
    }
    officialStarterCount += 1;
    const line = extractPitchingLine(starter.player_node);
    const starterKey = `${gamePk}_${teamId}`;
    const stageRow = {
      batch_id: batch.batch_id, run_id: runId, request_id: requestId, starter_key: starterKey, game_pk: gamePk, game_date: gameDate, season, game_type: gameType, game_status: gameStatus,
      team_id: teamId, team_name: null, opponent_team_id: opponentTeamId, opponent_team_name: null, is_home: side === "home", venue_id: venueId,
      starter_player_id: playerId, starter_name: playerNameFromStarter(starter), throws: throwsFromStarter(starter), starter_source_path: starter.source_path.replace("{side}", side), starter_source_type: starter.source_type,
      source_endpoint: box.endpoint, raw_json: { side, game_context: details, starter_player_node: starter.player_node, pitching_line: line, no_live_promotion: true }, ...line
    };
    await run(env.TEAM_DB, `DELETE FROM starter_history_stage WHERE batch_id=? AND starter_key=?`, batch.batch_id, starterKey);
    await insertStage(env, stageRow);
    await run(env.TEAM_DB, `UPDATE starter_history_stage SET ingestion_mode='base_backfill_stage_only', certification_status='STARTER_HISTORY_BASE_STAGE_ONLY_STAGED', certification_grade='STAGE_ONLY_IN_PROGRESS' WHERE batch_id=? AND starter_key=?`, batch.batch_id, starterKey);
    await insertOutcome(env, { batch_id: batch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId, outcome_level: "STARTER", outcome_category: "PROMOTED_ROWS", status: "STAGED_BASE_ONLY", reason: "official_final_boxscore_gamesStarted_identified_actual_starter_base_stage_only", source_endpoint: box.endpoint, details: { side, starter_key: starterKey, no_live_promotion: true } });
    rowsWritten += 1;
  }
  if (officialStarterCount === 2) {
    await run(env.TEAM_DB, `UPDATE starter_history_outcomes SET outcome_category='GAME_STAGED', status='GAME_STAGED_STAGE_ONLY', reason='two_actual_starters_staged_from_final_boxscore', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND outcome_level='GAME' AND game_pk=? AND status='PENDING_SOURCE'`, box.endpoint, safeJson({ ...details, official_starter_count: officialStarterCount, rows_written: rowsWritten, no_live_promotion: true }), batch.batch_id, gamePk);
    return { rows_written: rowsWritten, source_error: 0, unclear, games_with_two: 1, external_calls: 1 };
  }
  await run(env.TEAM_DB, `UPDATE starter_history_outcomes SET outcome_category='GAME_UNCLEAR', status='GAME_UNCLEAR', reason='not_exactly_two_actual_starters_identified_in_base_stage_only', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND outcome_level='GAME' AND game_pk=? AND status='PENDING_SOURCE'`, box.endpoint, safeJson({ ...details, official_starter_count: officialStarterCount, rows_written: rowsWritten, no_live_promotion: true }), batch.batch_id, gamePk);
  return { rows_written: rowsWritten, source_error: 0, unclear: unclear + 1, games_with_two: 0, external_calls: 1 };
}
async function finalizeBaseStageOnly(env, batch, runId, requestId) {
  const batchId = batch.batch_id;
  const counts = await first(env.TEAM_DB, `SELECT
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND outcome_category IN ('GAME_PENDING','GAME_STAGED','GAME_SOURCE_ERROR','GAME_UNCLEAR')) AS game_universe_rows,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status='PENDING_SOURCE') AS pending_games,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND outcome_category='GAME_STAGED') AS games_staged,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_category IN ('SOURCE_ERROR','GAME_SOURCE_ERROR')) AS source_error_count,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_category IN ('UNCLEAR','GAME_UNCLEAR')) AS unclear_count,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=?) AS staged_rows,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history_stage WHERE batch_id=? GROUP BY starter_key HAVING c > 1)) AS duplicate_stage_keys,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL)) AS missing_required_identity_count,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=? AND lower(COALESCE(game_status,'')) NOT IN ('final','game over','completed early')) AS non_final_games_in_stage,
    (SELECT COUNT(*) FROM starter_history WHERE batch_id=?) AS live_rows_with_batch`,
    batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId);
  const expectedGameCount = num(counts.game_universe_rows) || 0;
  const expectedStarterRows = expectedGameCount * 2;
  const stagedRows = num(counts.staged_rows) || 0;
  const duplicateStageKeys = num(counts.duplicate_stage_keys) || 0;
  const missingRequiredIdentityCount = num(counts.missing_required_identity_count) || 0;
  const sourceErrorCount = num(counts.source_error_count) || 0;
  const unclearCount = num(counts.unclear_count) || 0;
  const nonFinalGames = num(counts.non_final_games_in_stage) || 0;
  const liveRows = num(counts.live_rows_with_batch) || 0;
  const pass = expectedGameCount > 0 && stagedRows === expectedStarterRows && Number(counts.games_staged || 0) === expectedGameCount && duplicateStageKeys === 0 && missingRequiredIdentityCount === 0 && sourceErrorCount === 0 && unclearCount === 0 && nonFinalGames === 0 && liveRows === 0;
  const certificationStatus = pass ? "STARTER_HISTORY_BASE_STAGE_ONLY_CERTIFIED_NO_PROMOTION" : "STARTER_HISTORY_BASE_STAGE_ONLY_CERTIFICATION_BLOCKED";
  const certificationGrade = pass ? "BASE_STAGE_ONLY_PASS" : "BASE_STAGE_ONLY_BLOCKED";
  const status = pass ? "COMPLETED_STAGE_ONLY_CERTIFIED_NO_PROMOTION" : "COMPLETED_STAGE_ONLY_BLOCKED_NO_PROMOTION";
  const output = {
    source_shape_classification: "GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS",
    actual_starter_identification_path: "MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1",
    actual_starter_source_official_final: true,
    schedule_endpoint_selected: baseRangeScheduleEndpoint(batch.sample_start_date || DEFAULT_BASE_START_DATE, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE),
    base_backfill_cutoff_date: batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE,
    delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
    expected_game_count: expectedGameCount,
    expected_starter_rows: expectedStarterRows,
    staged_starter_rows: stagedRows,
    games_with_two_actual_starters: num(counts.games_staged) || 0,
    pending_games: num(counts.pending_games) || 0,
    duplicate_stage_keys: duplicateStageKeys,
    missing_required_identity_count: missingRequiredIdentityCount,
    source_error_count: sourceErrorCount,
    unclear_count: unclearCount,
    non_final_games_in_stage: nonFinalGames,
    live_rows_with_batch: liveRows,
    safest_key_model: "game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation",
    no_live_promotion: true,
    rows_promoted: 0,
    delta_update_blocked: true,
    stage_retained_for_review: true,
    next_action: pass ? "APPROVE_V0_2_1_BASE_STAGE_PROMOTION_MICROCHUNKS_AFTER_USER_REVIEW" : "INSPECT_OUTCOMES_BEFORE_PROMOTION"
  };
  await run(env.TEAM_DB, `UPDATE starter_history_batches SET expected_game_count=?, expected_starter_rows=?, staged_starter_rows=?, duplicate_stage_keys=?, games_with_two_actual_starters=?, missing_actual_starter_games=?, source_error_count=?, unclear_count=?, status=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    expectedGameCount, expectedStarterRows, stagedRows, duplicateStageKeys, num(counts.games_staged) || 0, Math.max(0, expectedGameCount - (num(counts.games_staged) || 0)), sourceErrorCount, unclearCount, status, certificationStatus, certificationGrade, safeJson(output), batchId);
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?)`,
    rid("starter_cert"), batchId, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade,
    output.actual_starter_identification_path, output.safest_key_model, expectedGameCount, expectedStarterRows, stagedRows, duplicateStageKeys, missingRequiredIdentityCount, sourceErrorCount, unclearCount, safeJson(output));
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_base_stage_only', ?, ?, 'base_backfill_stage_only', ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, batch.sample_start_date || DEFAULT_BASE_START_DATE, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE, batchId, runId, safeJson(output));
  return { pass, certificationStatus, certificationGrade, status, output };
}
async function runBaseBackfillStageOnly(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, status: "schema_failed", certification: "STARTER_HISTORY_SCHEMA_FAILED", schema, rows_read: 0, rows_written: 0, external_calls_performed: 0 };
  const requestId = input.request_id || rid("starter_base_req");
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid("starter_base_run");
  const rowInput = input.input_json || {};
  const cutoffDate = ymd(rowInput.base_backfill_cutoff_date || input.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE);
  const baseStartDate = ymd(rowInput.base_start_date || input.base_start_date || DEFAULT_BASE_START_DATE);
  const season = seasonFromDate(cutoffDate);
  const requestedMaxGames = Number(rowInput.max_games_per_tick || input.max_games_per_tick || DEFAULT_BASE_MAX_GAMES_PER_TICK) || DEFAULT_BASE_MAX_GAMES_PER_TICK;
  // v0.2.1: Starter History uses the same backend hot-continuation philosophy as the locked game-log workers.
  // Existing v0.2.0 queue rows may carry max_games_per_tick=15; raise them safely to the default so one backend pump can drain the stage-only backfill without repeated manual Wake taps.
  const maxGamesPerTick = Math.max(1, Math.min(60, Math.max(requestedMaxGames, DEFAULT_BASE_MAX_GAMES_PER_TICK)));
  let batch = await loadActiveBaseBatch(env, requestId);
  let batchId = batch && batch.batch_id;
  let externalCalls = 0;
  let rowsRead = 0;
  let rowsWritten = 0;
  if (!batch) {
    batchId = await createBaseStageBatch(env, input, requestId, chainId, runId, baseStartDate, cutoffDate, season);
    const seed = await seedBaseGameUniverse(env, batchId, runId, requestId, baseStartDate, cutoffDate, season);
    externalCalls += seed.external_calls || 0;
    batch = await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE batch_id=?`, batchId);
    if (!seed.ok) {
      return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: "failed_base_schedule_source_error", certification: "STARTER_HISTORY_BASE_STAGE_ONLY_SCHEDULE_SOURCE_ERROR", certification_grade: "STAGE_ONLY_BLOCKED", rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: externalCalls, schema, no_live_promotion: true, no_delta_update_execution: true };
    }
  }
  if (isFinalizationOnlyStatus(batch.status)) {
    const final = await finalizeBaseStageOnly(env, batch, runId, requestId);
    return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batch.batch_id, status: final.status.toLowerCase(), certification: final.certificationStatus, certification_grade: final.certificationGrade, rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, output_json: final.output, source_shape_classification: "GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS", no_live_promotion: true, no_delta_update_execution: true, finalization_only: true, timestamp_utc: nowUtc() };
  }
  const pending = await all(env.TEAM_DB, `SELECT * FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status='PENDING_SOURCE' ORDER BY date(game_date), game_pk LIMIT ?`, batch.batch_id, maxGamesPerTick);
  for (const gameRow of pending) {
    const res = await processOneBaseGame(env, batch, gameRow, runId, requestId);
    rowsRead += 1;
    rowsWritten += res.rows_written || 0;
    externalCalls += res.external_calls || 0;
  }
  const remaining = await first(env.TEAM_DB, `SELECT COUNT(*) AS remaining FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status='PENDING_SOURCE'`, batch.batch_id);
  const staged = await first(env.TEAM_DB, `SELECT COUNT(*) AS staged_rows FROM starter_history_stage WHERE batch_id=?`, batch.batch_id);
  const remainingGames = num(remaining && remaining.remaining) || 0;
  const stagedRows = num(staged && staged.staged_rows) || 0;
  if (remainingGames > 0) {
    const output = { batch_id: batch.batch_id, mode: "base_backfill_stage_only", base_start_date: batch.sample_start_date || baseStartDate, base_backfill_cutoff_date: batch.base_backfill_cutoff_date || cutoffDate, max_games_per_tick: maxGamesPerTick, rows_read_this_tick: rowsRead, rows_written_this_tick: rowsWritten, staged_rows_so_far: stagedRows, remaining_games: remainingGames, expected_game_count: batch.expected_game_count, expected_starter_rows: batch.expected_starter_rows, no_live_promotion: true, continuation_required: true };
    await run(env.TEAM_DB, `UPDATE starter_history_batches SET staged_starter_rows=?, status='PARTIAL_CONTINUE_BASE_BACKFILL_STAGE_ONLY', certification_status='STARTER_HISTORY_BASE_STAGE_ONLY_PARTIAL_CONTINUE', certification_grade='STAGE_ONLY_IN_PROGRESS', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, stagedRows, safeJson(output), batch.batch_id);
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batch.batch_id, status: "partial_continue_base_starter_history_stage_only", certification: "STARTER_HISTORY_BASE_STAGE_ONLY_PARTIAL_CONTINUE", certification_grade: "STAGE_ONLY_IN_PROGRESS", rows_read: rowsRead, rows_written: rowsWritten, rows_promoted: 0, external_calls_performed: externalCalls, schema, output_json: output, continuation_required: true, orchestrator_should_self_continue: true, no_live_promotion: true, no_delta_update_execution: true, no_browser_pump: true, timestamp_utc: nowUtc() };
  }
  const output = { batch_id: batch.batch_id, mode: "base_backfill_stage_only", rows_read_this_tick: rowsRead, rows_written_this_tick: rowsWritten, staged_rows_so_far: stagedRows, remaining_games: 0, finalization_only_required: true, no_live_promotion: true, note: "All queued final games processed. Next backend tick certifies from stage/outcomes with zero MLB calls." };
  await run(env.TEAM_DB, `UPDATE starter_history_batches SET staged_starter_rows=?, status='FINALIZATION_ONLY_READY', certification_status='STARTER_HISTORY_BASE_STAGE_ONLY_FINALIZATION_ONLY_READY', certification_grade='STAGE_ONLY_FINALIZATION_PENDING', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, stagedRows, safeJson(output), batch.batch_id);
  return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batch.batch_id, status: "partial_continue_base_starter_history_finalization_only", certification: "STARTER_HISTORY_BASE_STAGE_ONLY_FINALIZATION_ONLY_READY", certification_grade: "STAGE_ONLY_FINALIZATION_PENDING", rows_read: rowsRead, rows_written: rowsWritten, rows_promoted: 0, external_calls_performed: externalCalls, schema, output_json: output, continuation_required: true, orchestrator_should_self_continue: true, finalization_only_next: true, no_live_promotion: true, no_delta_update_execution: true, no_browser_pump: true, timestamp_utc: nowUtc() };
}


async function loadCertifiedBaseStageForPromotion(env, input) {
  const rowInput = input.input_json || {};
  const requestedBatchId = rowInput.batch_id || input.batch_id || rowInput.certified_stage_batch_id || input.certified_stage_batch_id || null;
  if (requestedBatchId) {
    return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE batch_id=? AND ingestion_mode='base_backfill_stage_only' LIMIT 1`, requestedBatchId);
  }
  return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE ingestion_mode='base_backfill_stage_only' AND status='COMPLETED_STAGE_ONLY_CERTIFIED_NO_PROMOTION' AND certification_status='STARTER_HISTORY_BASE_STAGE_ONLY_CERTIFIED_NO_PROMOTION' AND certification_grade='BASE_STAGE_ONLY_PASS' ORDER BY datetime(certified_at) DESC, datetime(updated_at) DESC LIMIT 1`);
}
async function livePromotionCounts(env, batchId) {
  return await first(env.TEAM_DB, `SELECT
    (SELECT COUNT(*) FROM starter_history WHERE batch_id=?) AS live_rows,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history WHERE batch_id=? GROUP BY starter_key HAVING c > 1)) AS duplicate_live_keys,
    (SELECT COUNT(*) FROM starter_history WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL OR starter_source_type IS NULL OR starter_source_path IS NULL)) AS missing_live_identity_count,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=?) AS stage_rows_after_clean
  `, batchId, batchId, batchId, batchId);
}
async function certifyStageReadyForPromotion(env, batch) {
  const batchId = batch.batch_id;
  const counts = await first(env.TEAM_DB, `SELECT
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND outcome_category='GAME_STAGED') AS games_staged,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=?) AS staged_rows,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history_stage WHERE batch_id=? GROUP BY starter_key HAVING c > 1)) AS duplicate_stage_keys,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL OR starter_source_type IS NULL OR starter_source_path IS NULL)) AS missing_stage_identity_count,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_category IN ('SOURCE_ERROR','GAME_SOURCE_ERROR')) AS source_error_count,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_category IN ('UNCLEAR','GAME_UNCLEAR')) AS unclear_count,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=? AND lower(COALESCE(game_status,'')) NOT IN ('final','game over','completed early')) AS non_final_stage_rows,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND outcome_category='GAME_NOT_FINAL' AND status='FILTERED_NON_FINAL_OR_NO_DATA') AS filtered_non_final_games,
    (SELECT COUNT(*) FROM starter_history_outcomes o LEFT JOIN starter_history_stage s ON s.batch_id=o.batch_id AND s.game_pk=o.game_pk WHERE o.batch_id=? AND o.outcome_level='GAME' AND o.outcome_category='GAME_NOT_FINAL' AND s.starter_key IS NOT NULL) AS filtered_games_with_stage_rows
  `, batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId);
  const expectedGameCount = num(batch.expected_game_count) || num(counts.games_staged) || 0;
  const expectedStarterRows = num(batch.expected_starter_rows) || expectedGameCount * 2;
  const stagedRows = num(counts.staged_rows) || 0;
  const pass = String(batch.status || '') === 'COMPLETED_STAGE_ONLY_CERTIFIED_NO_PROMOTION'
    && String(batch.certification_status || '') === 'STARTER_HISTORY_BASE_STAGE_ONLY_CERTIFIED_NO_PROMOTION'
    && String(batch.certification_grade || '') === 'BASE_STAGE_ONLY_PASS'
    && expectedGameCount > 0
    && stagedRows === expectedStarterRows
    && (num(counts.games_staged) || 0) === expectedGameCount
    && (num(counts.duplicate_stage_keys) || 0) === 0
    && (num(counts.missing_stage_identity_count) || 0) === 0
    && (num(counts.source_error_count) || 0) === 0
    && (num(counts.unclear_count) || 0) === 0
    && (num(counts.non_final_stage_rows) || 0) === 0
    && (num(counts.filtered_games_with_stage_rows) || 0) === 0;
  return { pass, expectedGameCount, expectedStarterRows, stagedRows, counts };
}
async function promoteCertifiedBaseStage(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'schema_failed', certification: 'STARTER_HISTORY_SCHEMA_FAILED', schema, rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  const requestId = input.request_id || rid('starter_promote_req');
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid('starter_promote_run');
  const batch = await loadCertifiedBaseStageForPromotion(env, input);
  if (!batch) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_no_certified_stage_batch', certification: 'STARTER_HISTORY_BASE_PROMOTION_BLOCKED_NO_CERTIFIED_STAGE_BATCH', certification_grade: 'PROMOTION_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, no_delta_update_execution: true, no_live_promotion: false };
  }
  const batchId = batch.batch_id;
  const ready = await certifyStageReadyForPromotion(env, batch);
  if (!ready.pass) {
    const output = { batch_id: batchId, stage_ready: false, expected_game_count: ready.expectedGameCount, expected_starter_rows: ready.expectedStarterRows, staged_rows: ready.stagedRows, counts: ready.counts, reason: 'certified_stage_pre_promotion_gate_failed' };
    await run(env.TEAM_DB, `UPDATE starter_history_batches SET status='BASE_PROMOTION_BLOCKED_STAGE_GATE_FAILED', certification_status='STARTER_HISTORY_BASE_PROMOTION_BLOCKED_STAGE_GATE_FAILED', certification_grade='PROMOTION_BLOCKED', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, safeJson(output), batchId);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: 'blocked_stage_gate_failed', certification: 'STARTER_HISTORY_BASE_PROMOTION_BLOCKED_STAGE_GATE_FAILED', certification_grade: 'PROMOTION_BLOCKED', rows_read: ready.stagedRows, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, output_json: output, no_delta_update_execution: true };
  }

  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history (
    starter_key, player_id, team_id, game_date, game_pk, starter_json, updated_at,
    season, game_type, game_status, opponent_team_id, is_home, venue_id, starter_name, throws,
    source_key, source_endpoint, source_confidence, data_feed_key, source_season, source_game_type, ingestion_mode, batch_id, run_id,
    certification_status, certification_grade, source_snapshot_date, raw_json, created_at, certified_at, promoted_at,
    starter_player_id, started_game, starter_source_path, starter_source_type, innings_pitched, outs_recorded, batters_faced, pitches, strikes,
    hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed
  )
  SELECT
    starter_key, starter_player_id, team_id, game_date, game_pk, raw_json, CURRENT_TIMESTAMP,
    season, game_type, game_status, opponent_team_id, is_home, venue_id, starter_name, throws,
    source_key, source_endpoint, source_confidence, data_feed_key, source_season, source_game_type, 'base_backfill_promoted', batch_id, ?,
    'STARTER_HISTORY_BASE_PROMOTED_CLEANED', 'BASE_PROMOTION_PASS', source_snapshot_date, raw_json, COALESCE(created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    starter_player_id, started_game, starter_source_path, starter_source_type, innings_pitched, outs_recorded, batters_faced, pitches, strikes,
    hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed
  FROM starter_history_stage
  WHERE batch_id=?`, runId, batchId);

  await run(env.TEAM_DB, `UPDATE starter_history_stage SET certification_status='STARTER_HISTORY_BASE_PROMOTED_TO_LIVE', certification_grade='BASE_PROMOTION_PASS', promoted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, batchId);
  const preClean = await livePromotionCounts(env, batchId);
  const liveRows = num(preClean.live_rows) || 0;
  const duplicateLiveKeys = num(preClean.duplicate_live_keys) || 0;
  const missingLiveIdentity = num(preClean.missing_live_identity_count) || 0;
  const expectedStarterRows = ready.expectedStarterRows;
  const livePass = liveRows === expectedStarterRows && duplicateLiveKeys === 0 && missingLiveIdentity === 0;
  if (!livePass) {
    const output = { batch_id: batchId, promoted_live_verification_pass: false, expected_starter_rows: expectedStarterRows, live_rows: liveRows, duplicate_live_keys: duplicateLiveKeys, missing_live_identity_count: missingLiveIdentity, stage_rows_retained: ready.stagedRows, no_cleanup: true };
    await run(env.TEAM_DB, `UPDATE starter_history_batches SET rows_promoted=?, live_rows_for_batch=?, duplicate_live_keys=?, missing_live_identity_count=?, status='BASE_PROMOTION_BLOCKED_LIVE_VERIFY_FAILED', certification_status='STARTER_HISTORY_BASE_PROMOTION_BLOCKED_LIVE_VERIFY_FAILED', certification_grade='PROMOTION_BLOCKED', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, liveRows, liveRows, duplicateLiveKeys, missingLiveIdentity, safeJson(output), batchId);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: 'blocked_live_verification_failed_stage_retained', certification: 'STARTER_HISTORY_BASE_PROMOTION_BLOCKED_LIVE_VERIFY_FAILED', certification_grade: 'PROMOTION_BLOCKED', rows_read: ready.stagedRows, rows_written: liveRows, rows_promoted: liveRows, external_calls_performed: 0, schema, output_json: output, stage_retained: true, no_delta_update_execution: true };
  }

  await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, outcome_level: 'BATCH', outcome_category: 'PROMOTED_ROWS', status: 'LIVE_PROMOTED_VERIFIED', reason: 'certified_base_stage_promoted_to_live_and_verified_before_cleanup', source_endpoint: 'starter_history_stage_to_live_insert_select', details: { expected_starter_rows: expectedStarterRows, live_rows: liveRows, duplicate_live_keys: duplicateLiveKeys, missing_live_identity_count: missingLiveIdentity } });
  await run(env.TEAM_DB, `DELETE FROM starter_history_stage WHERE batch_id=?`, batchId);
  const post = await livePromotionCounts(env, batchId);
  const stageAfterClean = num(post.stage_rows_after_clean) || 0;
  const finalPass = stageAfterClean === 0 && (num(post.live_rows) || 0) === expectedStarterRows && (num(post.duplicate_live_keys) || 0) === 0 && (num(post.missing_live_identity_count) || 0) === 0;
  const status = finalPass ? 'COMPLETED_PROMOTED_CLEANED' : 'BASE_PROMOTION_CLEANUP_VERIFY_FAILED';
  const certificationStatus = finalPass ? 'STARTER_HISTORY_BASE_PROMOTED_CLEANED' : 'STARTER_HISTORY_BASE_PROMOTION_CLEANUP_VERIFY_FAILED';
  const certificationGrade = finalPass ? 'BASE_PROMOTION_PASS' : 'PROMOTION_BLOCKED';
  const output = {
    source_shape_classification: 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS',
    actual_starter_identification_path: 'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    actual_starter_source_official_final: true,
    base_backfill_cutoff_date: batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE,
    delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
    expected_game_count: ready.expectedGameCount,
    expected_starter_rows: expectedStarterRows,
    rows_promoted: num(post.live_rows) || 0,
    live_rows_for_batch: num(post.live_rows) || 0,
    duplicate_live_keys: num(post.duplicate_live_keys) || 0,
    missing_live_identity_count: num(post.missing_live_identity_count) || 0,
    stage_rows_after_clean: stageAfterClean,
    cleaned_base_stage: stageAfterClean === 0,
    no_delta_update_execution: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true,
    next_action: finalPass ? 'BASE_PROMOTION_LOCKED_DELTA_DESIGN_ALLOWED_NEXT' : 'INSPECT_BEFORE_DELTA'
  };
  await run(env.TEAM_DB, `UPDATE starter_history_batches SET rows_promoted=?, live_rows_for_batch=?, duplicate_live_keys=?, missing_live_identity_count=?, stage_rows_after_clean=?, status=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP, promoted_at=CURRENT_TIMESTAMP, cleaned_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    output.rows_promoted, output.live_rows_for_batch, output.duplicate_live_keys, output.missing_live_identity_count, output.stage_rows_after_clean, status, certificationStatus, certificationGrade, safeJson(output), batchId);
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 1, ?)`,
    rid('starter_cert'), batchId, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade,
    output.actual_starter_identification_path, 'game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation', output.expected_game_count, output.expected_starter_rows, 0, safeJson(output));
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_base_promoted', ?, ?, 'base_promotion_stage_clean', ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, batch.sample_start_date || DEFAULT_BASE_START_DATE, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE, batchId, runId, safeJson(output));
  return { ok: finalPass, data_ok: finalPass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: status.toLowerCase(), certification: certificationStatus, certification_grade: certificationGrade, rows_read: ready.stagedRows, rows_written: output.rows_promoted, rows_promoted: output.rows_promoted, external_calls_performed: 0, schema, output_json: output, no_delta_update_execution: true, no_browser_pump: true, timestamp_utc: nowUtc() };
}


async function loadPromotedBaseBatch(env) {
  return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE ingestion_mode='base_backfill_stage_only' AND status='COMPLETED_PROMOTED_CLEANED' AND certification_status='STARTER_HISTORY_BASE_PROMOTED_CLEANED' AND certification_grade='BASE_PROMOTION_PASS' ORDER BY datetime(promoted_at) DESC, datetime(updated_at) DESC LIMIT 1`);
}

async function loadActiveDeltaBatch(env, requestId) {
  return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE ingestion_mode='delta_update' AND status IN ('RUNNING_DELTA_UPDATE_RETAINED_STAGE','PARTIAL_CONTINUE_DELTA_UPDATE_RETAINED_STAGE','FINALIZATION_ONLY_READY_DELTA_UPDATE') ORDER BY datetime(created_at) DESC LIMIT 1`);
}

async function createDeltaBatch(env, input, requestId, chainId, runId, deltaStartDate, deltaEndDate, season) {
  const batchId = rid('starter_delta_batch');
  await run(env.TEAM_DB, `INSERT INTO starter_history_batches (
    batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type,
    base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, sample_limit, source_shape_classification,
    actual_starter_identification_path, safest_key_model, status, certification_status, certification_grade, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'delta_update', 0, ?, ?, ?, 'R', ?, ?, ?, ?, 0, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, 'RUNNING_DELTA_UPDATE_RETAINED_STAGE', 'STARTER_HISTORY_DELTA_UPDATE_RUNNING', 'DELTA_IN_PROGRESS', ?)`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season,
    DEFAULT_BASE_CUTOFF_DATE, deltaStartDate, deltaStartDate, deltaEndDate,
    'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    'game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation',
    safeJson({ created_for: 'delta_update_retained_stage', delta_start_date: deltaStartDate, delta_end_date: deltaEndDate, stage_retained: true, no_delta_stage_cleanup: true })
  );
  return batchId;
}

async function seedDeltaGameUniverse(env, batchId, runId, requestId, deltaStartDate, deltaEndDate, season) {
  const endpoint = baseRangeScheduleEndpoint(deltaStartDate, deltaEndDate);
  const schedule = await fetchMlbJson(env, endpoint);
  if (!schedule.ok || !schedule.json || !Array.isArray(schedule.json.dates)) {
    await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, outcome_level: 'SOURCE', outcome_category: 'SOURCE_ERROR', status: 'SOURCE_ERROR', reason: 'delta_schedule_http_or_shape_error', source_endpoint: endpoint, details: { http_status: schedule.http_status, text_preview: schedule.text_preview } });
    await run(env.TEAM_DB, `UPDATE starter_history_batches SET source_error_count=1, status='DELTA_UPDATE_BLOCKED_SCHEDULE_SOURCE_ERROR', certification_status='STARTER_HISTORY_DELTA_UPDATE_BLOCKED_SCHEDULE_SOURCE_ERROR', certification_grade='DELTA_BLOCKED', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, batchId);
    return { ok: false, external_calls: 1, final_game_count: 0, non_final_count: 0, already_live_count: 0 };
  }
  await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, outcome_level: 'SOURCE', outcome_category: 'SOURCE_PROBE', status: 'DELTA_SCHEDULE_ENDPOINT_OK', reason: 'delta_schedule_endpoint_returned_usable_dates_array', source_endpoint: endpoint, details: { http_status: schedule.http_status, dates_count: schedule.json.dates.length, delta_start_date: deltaStartDate, delta_end_date: deltaEndDate } });
  let finalGameCount = 0;
  let nonFinalCount = 0;
  let alreadyLiveCount = 0;
  for (const dateNode of schedule.json.dates) {
    for (const game of (dateNode.games || [])) {
      const gamePk = num(game.gamePk);
      const gameDate = ymd(game.gameDate || dateNode.date || deltaStartDate);
      const status = str(game.status && (game.status.detailedState || game.status.abstractGameState));
      const gameType = str(game.gameType || 'R');
      const details = {
        game_pk: gamePk,
        game_date: gameDate,
        game_status: status,
        game_type: gameType,
        venue_id: game.venue ? num(game.venue.id) : null,
        home_team_id: teamIdFromGame(game, 'home'),
        away_team_id: teamIdFromGame(game, 'away'),
        link: game.link || null
      };
      if (!isFinalStatus(status) || gameType !== 'R') {
        nonFinalCount += 1;
        await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: 'GAME', outcome_category: 'GAME_NOT_FINAL', status: 'FILTERED_NON_FINAL_OR_NO_DATA', reason: 'not_final_completed_game_not_part_of_delta_starter_history_universe', source_endpoint: endpoint, details });
        continue;
      }
      const existing = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM starter_history WHERE game_pk=?`, gamePk);
      if ((num(existing && existing.c) || 0) >= 2) {
        alreadyLiveCount += 1;
        await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: 'GAME', outcome_category: 'GAME_ALREADY_LIVE', status: 'GAME_ALREADY_LIVE', reason: 'delta_final_game_already_has_two_live_starter_rows', source_endpoint: endpoint, details });
        continue;
      }
      finalGameCount += 1;
      await insertOutcome(env, { batch_id: batchId, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, outcome_level: 'GAME', outcome_category: 'GAME_PENDING', status: 'PENDING_SOURCE', reason: 'final_regular_season_game_pending_delta_starter_history_source', source_endpoint: endpoint, details });
    }
  }
  await run(env.TEAM_DB, `UPDATE starter_history_batches SET expected_game_count=?, expected_starter_rows=?, final_games_sampled=?, status='RUNNING_DELTA_UPDATE_RETAINED_STAGE', certification_status='STARTER_HISTORY_DELTA_UPDATE_RUNNING', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    finalGameCount, finalGameCount * 2, finalGameCount, safeJson({ delta_start_date: deltaStartDate, delta_end_date: deltaEndDate, final_game_count: finalGameCount, expected_starter_rows: finalGameCount * 2, non_final_or_filtered_game_count: nonFinalCount, already_live_game_count: alreadyLiveCount, stage_retained: true }), batchId);
  return { ok: true, external_calls: 1, final_game_count: finalGameCount, non_final_count: nonFinalCount, already_live_count: alreadyLiveCount };
}

async function promoteDeltaGameRows(env, batchId, runId, gamePk) {
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history (
    starter_key, player_id, team_id, game_date, game_pk, starter_json, updated_at,
    season, game_type, game_status, opponent_team_id, is_home, venue_id, starter_name, throws,
    source_key, source_endpoint, source_confidence, data_feed_key, source_season, source_game_type, ingestion_mode, batch_id, run_id,
    certification_status, certification_grade, source_snapshot_date, raw_json, created_at, certified_at, promoted_at,
    starter_player_id, started_game, starter_source_path, starter_source_type, innings_pitched, outs_recorded, batters_faced, pitches, strikes,
    hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed
  )
  SELECT
    starter_key, starter_player_id, team_id, game_date, game_pk, raw_json, CURRENT_TIMESTAMP,
    season, game_type, game_status, opponent_team_id, is_home, venue_id, starter_name, throws,
    source_key, source_endpoint, source_confidence, data_feed_key, source_season, source_game_type, 'delta_update_promoted', batch_id, ?,
    'STARTER_HISTORY_DELTA_PROMOTED_STAGE_RETAINED', 'DELTA_PASS', source_snapshot_date, raw_json, COALESCE(created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    starter_player_id, started_game, starter_source_path, starter_source_type, innings_pitched, outs_recorded, batters_faced, pitches, strikes,
    hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed
  FROM starter_history_stage
  WHERE batch_id=? AND game_pk=?`, runId, batchId, gamePk);
  await run(env.TEAM_DB, `UPDATE starter_history_stage SET certification_status='STARTER_HISTORY_DELTA_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', promoted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND game_pk=?`, batchId, gamePk);
}

async function processOneDeltaGame(env, batch, gameRow, runId, requestId) {
  const details = gameDetailsFromOutcome(gameRow);
  const gamePk = num(gameRow.game_pk);
  const gameDate = ymd(gameRow.game_date || details.game_date);
  const season = seasonFromDate(gameDate);
  const gameStatus = str(details.game_status || 'Final');
  const gameType = str(details.game_type || 'R');
  const venueId = num(details.venue_id);
  const boxEndpoint = `/api/v1/game/${gamePk}/boxscore`;
  const box = await fetchMlbJson(env, boxEndpoint);
  if (!box.ok) {
    await run(env.TEAM_DB, `UPDATE starter_history_outcomes SET outcome_category='GAME_SOURCE_ERROR', status='GAME_SOURCE_ERROR', reason='boxscore_http_error_delta_update', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND outcome_level='GAME' AND game_pk=? AND status='PENDING_SOURCE'`, box.endpoint, safeJson({ ...details, boxscore_http_status: box.http_status, text_preview: box.text_preview }), batch.batch_id, gamePk);
    return { rows_staged: 0, rows_promoted: 0, rows_written: 0, source_error: 1, unclear: 0, games_with_two: 0, external_calls: 1 };
  }
  let officialStarterCount = 0;
  let rowsStaged = 0;
  let unclear = 0;
  for (const side of ['away', 'home']) {
    const otherSide = side === 'away' ? 'home' : 'away';
    const teamNode = teamBox(box.json, side);
    const starter = findStarterFromBoxTeam(teamNode);
    const playerId = playerIdFromStarter(starter);
    const teamId = details[`${side}_team_id`] || null;
    const opponentTeamId = details[`${otherSide}_team_id`] || null;
    if (!starter || !playerId || starter.source_type !== 'official_final_boxscore_games_started' || !teamId || !opponentTeamId) {
      unclear += 1;
      await insertOutcome(env, { batch_id: batch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId, outcome_level: 'STARTER', outcome_category: 'UNCLEAR', status: 'UNCLEAR', reason: 'actual_starter_not_confirmed_by_boxscore_gamesStarted_during_delta_update', source_endpoint: box.endpoint, details: { side, player_id: playerId, starter_source_type: starter ? starter.source_type : null } });
      continue;
    }
    officialStarterCount += 1;
    const line = extractPitchingLine(starter.player_node);
    const starterKey = `${gamePk}_${teamId}`;
    const stageRow = {
      batch_id: batch.batch_id, run_id: runId, request_id: requestId, starter_key: starterKey, game_pk: gamePk, game_date: gameDate, season, game_type: gameType, game_status: gameStatus,
      team_id: teamId, team_name: null, opponent_team_id: opponentTeamId, opponent_team_name: null, is_home: side === 'home', venue_id: venueId,
      starter_player_id: playerId, starter_name: playerNameFromStarter(starter), throws: throwsFromStarter(starter), starter_source_path: starter.source_path.replace('{side}', side), starter_source_type: starter.source_type,
      source_endpoint: box.endpoint, raw_json: { side, game_context: details, starter_player_node: starter.player_node, pitching_line: line, delta_update: true, stage_retained: true }, ...line
    };
    await run(env.TEAM_DB, `DELETE FROM starter_history_stage WHERE batch_id=? AND starter_key=?`, batch.batch_id, starterKey);
    await insertStage(env, stageRow);
    await run(env.TEAM_DB, `UPDATE starter_history_stage SET ingestion_mode='delta_update', certification_status='STARTER_HISTORY_DELTA_STAGED', certification_grade='DELTA_IN_PROGRESS' WHERE batch_id=? AND starter_key=?`, batch.batch_id, starterKey);
    await insertOutcome(env, { batch_id: batch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season, team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId, outcome_level: 'STARTER', outcome_category: 'PROMOTED_ROWS', status: 'STAGED_DELTA_RETAINED', reason: 'official_final_boxscore_gamesStarted_identified_actual_starter_delta_update_stage_retained', source_endpoint: box.endpoint, details: { side, starter_key: starterKey, stage_retained: true } });
    rowsStaged += 1;
  }
  if (officialStarterCount === 2) {
    await promoteDeltaGameRows(env, batch.batch_id, runId, gamePk);
    await run(env.TEAM_DB, `UPDATE starter_history_outcomes SET outcome_category='GAME_STAGED_PROMOTED', status='GAME_STAGED_PROMOTED_DELTA_RETAINED', reason='two_actual_starters_staged_promoted_and_delta_stage_retained', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND outcome_level='GAME' AND game_pk=? AND status='PENDING_SOURCE'`, box.endpoint, safeJson({ ...details, official_starter_count: officialStarterCount, rows_staged: rowsStaged, rows_promoted: rowsStaged, stage_retained: true }), batch.batch_id, gamePk);
    return { rows_staged: rowsStaged, rows_promoted: rowsStaged, rows_written: rowsStaged * 2, source_error: 0, unclear, games_with_two: 1, external_calls: 1 };
  }
  await run(env.TEAM_DB, `UPDATE starter_history_outcomes SET outcome_category='GAME_UNCLEAR', status='GAME_UNCLEAR', reason='not_exactly_two_actual_starters_identified_in_delta_update', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND outcome_level='GAME' AND game_pk=? AND status='PENDING_SOURCE'`, box.endpoint, safeJson({ ...details, official_starter_count: officialStarterCount, rows_staged: rowsStaged, stage_retained: true }), batch.batch_id, gamePk);
  return { rows_staged: rowsStaged, rows_promoted: 0, rows_written: rowsStaged, source_error: 0, unclear: unclear + 1, games_with_two: 0, external_calls: 1 };
}

async function deltaCounts(env, batchId) {
  return await first(env.TEAM_DB, `SELECT
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status='PENDING_SOURCE') AS pending_games,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND outcome_category='GAME_STAGED_PROMOTED') AS games_staged_promoted,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=?) AS staged_rows,
    (SELECT COUNT(*) FROM starter_history WHERE batch_id=?) AS live_rows,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history_stage WHERE batch_id=? GROUP BY starter_key HAVING c>1)) AS duplicate_stage_keys,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history WHERE batch_id=? GROUP BY starter_key HAVING c>1)) AS duplicate_live_keys,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL)) AS missing_stage_identity,
    (SELECT COUNT(*) FROM starter_history WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL)) AS missing_live_identity,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level IN ('GAME','STARTER') AND outcome_category LIKE '%SOURCE_ERROR%') AS source_error_count,
    (SELECT COUNT(*) FROM starter_history_outcomes WHERE batch_id=? AND outcome_level IN ('GAME','STARTER') AND outcome_category='UNCLEAR') AS unclear_count,
    (SELECT MAX(game_date) FROM starter_history_stage WHERE batch_id=?) AS max_game_date
  `, batchId,batchId,batchId,batchId,batchId,batchId,batchId,batchId,batchId,batchId,batchId);
}

async function finalizeDeltaUpdate(env, batch, runId, requestId) {
  const batchId = batch.batch_id;
  const c = await deltaCounts(env, batchId);
  const expectedGameCount = num(batch.expected_game_count) || 0;
  const expectedStarterRows = num(batch.expected_starter_rows) || 0;
  const stagedRows = num(c.staged_rows) || 0;
  const liveRows = num(c.live_rows) || 0;
  const pendingGames = num(c.pending_games) || 0;
  const duplicateStageKeys = num(c.duplicate_stage_keys) || 0;
  const duplicateLiveKeys = num(c.duplicate_live_keys) || 0;
  const missingStageIdentity = num(c.missing_stage_identity) || 0;
  const missingLiveIdentity = num(c.missing_live_identity) || 0;
  const sourceErrorCount = num(c.source_error_count) || 0;
  const unclearCount = num(c.unclear_count) || 0;
  const pass = pendingGames === 0 && stagedRows === expectedStarterRows && liveRows === expectedStarterRows && duplicateStageKeys === 0 && duplicateLiveKeys === 0 && missingStageIdentity === 0 && missingLiveIdentity === 0 && sourceErrorCount === 0 && unclearCount === 0;
  const status = pass ? 'COMPLETED_PROMOTED_STAGE_RETAINED' : 'DELTA_UPDATE_CERTIFICATION_BLOCKED';
  const certificationStatus = pass ? 'STARTER_HISTORY_DELTA_CERTIFIED_PROMOTED_STAGE_RETAINED' : 'STARTER_HISTORY_DELTA_CERTIFICATION_BLOCKED';
  const certificationGrade = pass ? 'DELTA_PASS' : 'DELTA_BLOCKED';
  const output = {
    source_shape_classification: 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS',
    actual_starter_identification_path: 'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    delta_start_date: batch.sample_start_date,
    delta_end_date: batch.sample_end_date,
    latest_complete_game_date: c.max_game_date || batch.sample_end_date,
    expected_game_count: expectedGameCount,
    expected_starter_rows: expectedStarterRows,
    staged_starter_rows: stagedRows,
    rows_promoted: liveRows,
    live_rows_for_batch: liveRows,
    retained_stage_rows: stagedRows,
    stage_retained: true,
    stage_rows_after_clean: stagedRows,
    duplicate_stage_keys: duplicateStageKeys,
    duplicate_live_keys: duplicateLiveKeys,
    missing_stage_identity_count: missingStageIdentity,
    missing_live_identity_count: missingLiveIdentity,
    source_error_count: sourceErrorCount,
    unclear_count: unclearCount,
    no_full_sweep: true,
    no_delta_stage_cleanup: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true,
    next_action: pass ? 'DELTA_LOCKED_NOOP_RETAINED_RESTORE_SCOPED_REPAIR_ALLOWED_NEXT' : 'INSPECT_DELTA_OUTCOMES_BEFORE_REPAIR'
  };
  await run(env.TEAM_DB, `UPDATE starter_history_batches SET staged_starter_rows=?, rows_promoted=?, live_rows_for_batch=?, stage_rows_after_clean=?, duplicate_stage_keys=?, duplicate_live_keys=?, missing_live_identity_count=?, source_error_count=?, unclear_count=?, games_with_two_actual_starters=?, status=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, promoted_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    stagedRows, liveRows, liveRows, stagedRows, duplicateStageKeys, duplicateLiveKeys, missingLiveIdentity, sourceErrorCount, unclearCount, num(c.games_staged_promoted) || expectedGameCount, status, certificationStatus, certificationGrade, safeJson(output), batchId);
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?)`,
    rid('starter_cert'), batchId, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade, output.actual_starter_identification_path, 'game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation', expectedGameCount, expectedStarterRows, stagedRows, duplicateStageKeys, missingStageIdentity + missingLiveIdentity, sourceErrorCount, unclearCount, safeJson(output));
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_delta_update', ?, ?, 'delta_update', ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, batch.sample_start_date, output.latest_complete_game_date, batchId, runId, safeJson(output));
  return { pass, status, certificationStatus, certificationGrade, output };
}

async function runDeltaUpdateRetainedStage(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, status: 'schema_failed', certification: 'STARTER_HISTORY_SCHEMA_FAILED', schema, rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  const requestId = input.request_id || rid('starter_delta_req');
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid('starter_delta_run');
  const rowInput = input.input_json || {};
  const base = await loadPromotedBaseBatch(env);
  if (!base) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_base_not_promoted', certification: 'STARTER_HISTORY_DELTA_BLOCKED_BASE_NOT_PROMOTED', certification_grade: 'DELTA_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, no_delta_stage_cleanup: true };
  const deltaStartDate = ymd(rowInput.delta_start_date || rowInput.delta_reserved_start_date || input.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE);
  const deltaEndDate = ymd(rowInput.delta_end_date || input.delta_end_date || new Date().toISOString().slice(0,10));
  const season = seasonFromDate(deltaEndDate);
  const requestedMaxGames = Number(rowInput.max_games_per_tick || input.max_games_per_tick || 30) || 30;
  const maxGamesPerTick = Math.max(1, Math.min(40, requestedMaxGames));
  let batch = await loadActiveDeltaBatch(env, requestId);
  let batchId = batch && batch.batch_id;
  let externalCalls = 0, rowsRead = 0, rowsWritten = 0, rowsPromoted = 0;
  if (!batch) {
    batchId = await createDeltaBatch(env, input, requestId, chainId, runId, deltaStartDate, deltaEndDate, season);
    const seed = await seedDeltaGameUniverse(env, batchId, runId, requestId, deltaStartDate, deltaEndDate, season);
    externalCalls += seed.external_calls || 0;
    batch = await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE batch_id=?`, batchId);
    if (!seed.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: 'failed_delta_schedule_source_error', certification: 'STARTER_HISTORY_DELTA_UPDATE_SCHEDULE_SOURCE_ERROR', certification_grade: 'DELTA_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: externalCalls, schema, no_delta_stage_cleanup: true };
  }
  const pending = await all(env.TEAM_DB, `SELECT * FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status='PENDING_SOURCE' ORDER BY date(game_date), game_pk LIMIT ?`, batch.batch_id, maxGamesPerTick);
  for (const gameRow of pending) {
    const res = await processOneDeltaGame(env, batch, gameRow, runId, requestId);
    rowsRead += 1;
    rowsWritten += res.rows_written || 0;
    rowsPromoted += res.rows_promoted || 0;
    externalCalls += res.external_calls || 0;
  }
  const counts = await deltaCounts(env, batch.batch_id);
  const remainingGames = num(counts.pending_games) || 0;
  const stagedRows = num(counts.staged_rows) || 0;
  const liveRows = num(counts.live_rows) || 0;
  if (remainingGames > 0) {
    const output = { batch_id: batch.batch_id, mode: 'delta_update', delta_start_date: batch.sample_start_date || deltaStartDate, delta_end_date: batch.sample_end_date || deltaEndDate, max_games_per_tick: maxGamesPerTick, rows_read_this_tick: rowsRead, rows_written_this_tick: rowsWritten, rows_promoted_this_tick: rowsPromoted, staged_rows_so_far: stagedRows, live_rows_for_batch: liveRows, remaining_games: remainingGames, expected_game_count: batch.expected_game_count, expected_starter_rows: batch.expected_starter_rows, stage_retained: true, continuation_required: true };
    await run(env.TEAM_DB, `UPDATE starter_history_batches SET staged_starter_rows=?, rows_promoted=?, live_rows_for_batch=?, status='PARTIAL_CONTINUE_DELTA_UPDATE_RETAINED_STAGE', certification_status='STARTER_HISTORY_DELTA_UPDATE_PARTIAL_CONTINUE', certification_grade='DELTA_IN_PROGRESS', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, stagedRows, liveRows, liveRows, safeJson(output), batch.batch_id);
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batch.batch_id, status: 'partial_continue_base_starter_history_delta_update', certification: 'STARTER_HISTORY_DELTA_UPDATE_PARTIAL_CONTINUE', certification_grade: 'DELTA_IN_PROGRESS', rows_read: rowsRead, rows_written: rowsWritten, rows_promoted: rowsPromoted, external_calls_performed: externalCalls, schema, output_json: output, continuation_required: true, orchestrator_should_self_continue: true, stage_retained: true, no_delta_stage_cleanup: true, no_browser_pump: true, timestamp_utc: nowUtc() };
  }
  const final = await finalizeDeltaUpdate(env, batch, runId, requestId);
  return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batch.batch_id, status: final.status.toLowerCase(), certification: final.certificationStatus, certification_grade: final.certificationGrade, rows_read: rowsRead, rows_written: rowsWritten, rows_promoted: final.output.rows_promoted, external_calls_performed: externalCalls, schema, output_json: final.output, stage_retained: true, no_delta_stage_cleanup: true, no_browser_pump: true, timestamp_utc: nowUtc() };
}

async function latestCompleteStarterHistoryDateFromSchedule(env, startDate, endDate) {
  const endpoint = baseRangeScheduleEndpoint(startDate, endDate);
  const schedule = await fetchMlbJson(env, endpoint);
  if (!schedule.ok || !schedule.json || !Array.isArray(schedule.json.dates)) {
    return { ok: false, endpoint, http_status: schedule.http_status, text_preview: schedule.text_preview, latest_complete_game_date: null, final_game_count: 0, external_calls: 1 };
  }
  let latest = null;
  let finalCount = 0;
  let nonFinalCount = 0;
  for (const dateNode of schedule.json.dates) {
    for (const game of (dateNode.games || [])) {
      const gameType = str(game.gameType || 'R');
      const status = str(game.status && (game.status.detailedState || game.status.abstractGameState));
      const gameDate = ymd(game.gameDate || dateNode.date || startDate);
      if (gameType === 'R' && isFinalStatus(status)) {
        finalCount += 1;
        if (!latest || gameDate > latest) latest = gameDate;
      } else {
        nonFinalCount += 1;
      }
    }
  }
  return { ok: true, endpoint, http_status: schedule.http_status, latest_complete_game_date: latest, final_game_count: finalCount, non_final_count: nonFinalCount, external_calls: 1, dates_count: schedule.json.dates.length };
}

async function latestPromotedDeltaBatch(env) {
  return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE ingestion_mode='delta_update' AND status='COMPLETED_PROMOTED_STAGE_RETAINED' AND certification_status='STARTER_HISTORY_DELTA_CERTIFIED_PROMOTED_STAGE_RETAINED' AND certification_grade='DELTA_PASS' ORDER BY datetime(promoted_at) DESC, datetime(updated_at) DESC LIMIT 1`);
}

async function runDeltaNoopCurrentState(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'schema_failed', certification: 'STARTER_HISTORY_SCHEMA_FAILED', schema, rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  const requestId = input.request_id || rid('starter_delta_noop_req');
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid('starter_delta_noop_run');
  const rowInput = input.input_json || {};
  const base = await loadPromotedBaseBatch(env);
  if (!base) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_base_not_promoted', certification: 'STARTER_HISTORY_DELTA_NOOP_BLOCKED_BASE_NOT_PROMOTED', certification_grade: 'DELTA_NOOP_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, no_full_sweep: true, no_mining_calls: true, no_live_mutation: true };
  const deltaBatch = await latestPromotedDeltaBatch(env);
  if (!deltaBatch) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_no_promoted_retained_delta_batch', certification: 'STARTER_HISTORY_DELTA_NOOP_BLOCKED_NO_PROMOTED_RETAINED_DELTA_BATCH', certification_grade: 'DELTA_NOOP_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, no_full_sweep: true, no_mining_calls: true, no_live_mutation: true };
  const startDate = ymd(rowInput.delta_start_date || rowInput.delta_reserved_start_date || input.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE);
  const endDate = ymd(rowInput.delta_end_date || input.delta_end_date || new Date().toISOString().slice(0,10));
  const probe = await latestCompleteStarterHistoryDateFromSchedule(env, startDate, endDate);
  const retained = await first(env.TEAM_DB, `SELECT COUNT(DISTINCT starter_key) AS retained_stage_rows, COUNT(DISTINCT game_pk) AS retained_stage_games, MAX(game_date) AS retained_max_game_date FROM starter_history_stage WHERE batch_id=?`, deltaBatch.batch_id);
  const live = await first(env.TEAM_DB, `SELECT COUNT(DISTINCT starter_key) AS live_rows_for_batch, COUNT(DISTINCT game_pk) AS live_games_for_batch, MAX(game_date) AS live_max_game_date FROM starter_history WHERE batch_id=?`, deltaBatch.batch_id);
  const totalLive = await first(env.TEAM_DB, `SELECT COUNT(*) AS total_live_rows, COUNT(DISTINCT starter_key) AS distinct_starter_keys, COUNT(DISTINCT game_pk) AS distinct_games, SUM(CASE WHEN game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL THEN 1 ELSE 0 END) AS missing_critical_identity FROM starter_history`);
  const expectedRows = num(deltaBatch.expected_starter_rows) || 0;
  const retainedRows = num(retained && retained.retained_stage_rows) || 0;
  const liveRows = num(live && live.live_rows_for_batch) || 0;
  const retainedMax = ymd(retained && retained.retained_max_game_date);
  const liveMax = ymd(live && live.live_max_game_date);
  const latestComplete = ymd(probe.latest_complete_game_date || deltaBatch.sample_end_date || liveMax);
  const stageRetained = expectedRows > 0 && retainedRows === expectedRows;
  const liveParity = expectedRows > 0 && liveRows === expectedRows;
  const currentByDate = !!latestComplete && !!liveMax && liveMax >= latestComplete && !!retainedMax && retainedMax >= latestComplete;
  const liveIdentityOk = (num(totalLive && totalLive.missing_critical_identity) || 0) === 0 && (num(totalLive && totalLive.total_live_rows) || 0) === (num(totalLive && totalLive.distinct_starter_keys) || 0);
  const pass = !!probe.ok && currentByDate && stageRetained && liveParity && liveIdentityOk;
  const certificationStatus = pass ? 'STARTER_HISTORY_DELTA_NOOP_LIVE_RETAINED_CURRENT' : 'STARTER_HISTORY_DELTA_NOOP_BLOCKED_NOT_CURRENT';
  const certificationGrade = pass ? 'DELTA_NOOP_PASS' : 'DELTA_NOOP_BLOCKED';
  const status = pass ? 'DELTA_STARTER_HISTORY_NOOP_CURRENT_SOURCE_SNAPSHOT' : 'DELTA_STARTER_HISTORY_NOOP_BLOCKED_NOT_CURRENT';
  const output = {
    source_shape_classification: 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS',
    actual_starter_identification_path: 'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    source_final_date_check: probe,
    latest_complete_game_date: latestComplete || null,
    retained_delta_batch_id: deltaBatch.batch_id,
    retained_max_game_date: retainedMax || null,
    live_max_game_date: liveMax || null,
    expected_starter_rows: expectedRows,
    retained_stage_rows: retainedRows,
    live_rows_for_batch: liveRows,
    total_live_rows: num(totalLive && totalLive.total_live_rows) || 0,
    distinct_starter_keys: num(totalLive && totalLive.distinct_starter_keys) || 0,
    distinct_games: num(totalLive && totalLive.distinct_games) || 0,
    missing_critical_identity: num(totalLive && totalLive.missing_critical_identity) || 0,
    current_by_date: currentByDate,
    stage_retained: stageRetained,
    live_retained_parity: liveParity,
    no_full_sweep: true,
    no_mining_calls: true,
    no_live_mutation: true,
    no_stage_writes: true,
    no_new_batch: true,
    no_cleanup: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true,
    next_action: pass ? 'DELTA_NOOP_LOCKED_RETAINED_STAGE_RESTORE_TEST_ALLOWED_NEXT' : 'DO_NOT_REPAIR_UNTIL_NOT_CURRENT_REASON_IS_INSPECTED'
  };
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, 0, ?, 0, 0, 1, 1, 1, ?)`,
    rid('starter_cert'), deltaBatch.batch_id, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade,
    output.actual_starter_identification_path, 'game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation', num(deltaBatch.expected_game_count) || 0, expectedRows, retainedRows, output.missing_critical_identity, safeJson(output));
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_delta_noop_current_state', ?, ?, 'delta_noop_current_state', ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, startDate, latestComplete || liveMax || retainedMax || null, deltaBatch.batch_id, runId, safeJson(output));
  return { ok: true, data_ok: pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: deltaBatch.batch_id, status, certification: certificationStatus, certification_grade: certificationGrade, rows_read: output.total_live_rows, rows_written: 2, rows_promoted: 0, external_calls_performed: probe.external_calls || 1, schema, output_json: output, queued: false, no_full_sweep: true, no_mining_calls: true, no_live_mutation: true, no_stage_writes: true, no_new_batch: true, no_cleanup: true, no_browser_pump: true, timestamp_utc: nowUtc() };
}


async function restoreMissingLiveRowsFromRetainedDeltaStage(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'schema_failed', certification: 'STARTER_HISTORY_SCHEMA_FAILED', schema, rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  const requestId = input.request_id || rid('starter_delta_restore_req');
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid('starter_delta_restore_run');
  const rowInput = input.input_json || {};
  const base = await loadPromotedBaseBatch(env);
  if (!base) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_base_not_promoted', certification: 'STARTER_HISTORY_DELTA_RESTORE_BLOCKED_BASE_NOT_PROMOTED', certification_grade: 'DELTA_RESTORE_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, queued: false, no_new_batch: true, no_full_sweep: true };
  const deltaBatch = await latestPromotedDeltaBatch(env);
  if (!deltaBatch) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_no_promoted_retained_delta_batch', certification: 'STARTER_HISTORY_DELTA_RESTORE_BLOCKED_NO_PROMOTED_RETAINED_DELTA_BATCH', certification_grade: 'DELTA_RESTORE_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, queued: false, no_new_batch: true, no_full_sweep: true };

  const startDate = ymd(rowInput.delta_start_date || rowInput.delta_reserved_start_date || input.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE);
  const endDate = ymd(rowInput.delta_end_date || input.delta_end_date || new Date().toISOString().slice(0,10));
  const probe = await latestCompleteStarterHistoryDateFromSchedule(env, startDate, endDate);
  const before = await first(env.TEAM_DB, `SELECT
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history_stage WHERE batch_id=?) AS retained_stage_rows,
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history WHERE batch_id=?) AS live_rows_for_batch,
    (SELECT COUNT(*) FROM starter_history_stage s LEFT JOIN starter_history h ON h.starter_key=s.starter_key WHERE s.batch_id=? AND h.starter_key IS NULL) AS missing_live_rows_detected,
    (SELECT MAX(game_date) FROM starter_history_stage WHERE batch_id=?) AS retained_max_game_date,
    (SELECT MAX(game_date) FROM starter_history WHERE batch_id=?) AS live_max_game_date
  `, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id);
  const missingBefore = num(before && before.missing_live_rows_detected) || 0;
  const expectedRows = num(deltaBatch.expected_starter_rows) || 0;

  if (missingBefore > 0) {
    await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history (
      starter_key, player_id, team_id, game_date, game_pk, starter_json, updated_at,
      season, game_type, game_status, opponent_team_id, is_home, venue_id, starter_name, throws,
      source_key, source_endpoint, source_confidence, data_feed_key, source_season, source_game_type, ingestion_mode, batch_id, run_id,
      certification_status, certification_grade, source_snapshot_date, raw_json, created_at, certified_at, promoted_at,
      starter_player_id, started_game, starter_source_path, starter_source_type, innings_pitched, outs_recorded, batters_faced, pitches, strikes,
      hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed
    )
    SELECT
      s.starter_key, s.starter_player_id, s.team_id, s.game_date, s.game_pk, s.raw_json, CURRENT_TIMESTAMP,
      s.season, s.game_type, s.game_status, s.opponent_team_id, s.is_home, s.venue_id, s.starter_name, s.throws,
      s.source_key, s.source_endpoint, s.source_confidence, s.data_feed_key, s.source_season, s.source_game_type, 'delta_retained_stage_restore', s.batch_id, ?,
      'STARTER_HISTORY_DELTA_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', 'DELTA_REPAIR_PASS', s.source_snapshot_date, s.raw_json, COALESCE(s.created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
      s.starter_player_id, s.started_game, s.starter_source_path, s.starter_source_type, s.innings_pitched, s.outs_recorded, s.batters_faced, s.pitches, s.strikes,
      s.hits_allowed, s.runs_allowed, s.earned_runs, s.walks_allowed, s.strikeouts, s.home_runs_allowed
    FROM starter_history_stage s
    LEFT JOIN starter_history h ON h.starter_key=s.starter_key
    WHERE s.batch_id=? AND h.starter_key IS NULL`, runId, deltaBatch.batch_id);
  }

  const after = await first(env.TEAM_DB, `SELECT
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history_stage WHERE batch_id=?) AS retained_stage_rows,
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history WHERE batch_id=?) AS live_rows_for_batch,
    (SELECT COUNT(*) FROM starter_history_stage s LEFT JOIN starter_history h ON h.starter_key=s.starter_key WHERE s.batch_id=? AND h.starter_key IS NULL) AS missing_live_rows_after,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history WHERE batch_id=? GROUP BY starter_key HAVING c>1)) AS duplicate_live_keys,
    (SELECT COUNT(*) FROM starter_history WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL OR starter_source_type IS NULL OR starter_source_path IS NULL)) AS missing_live_identity_count,
    (SELECT COUNT(*) FROM starter_history) AS total_live_rows,
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history) AS distinct_starter_keys,
    (SELECT COUNT(DISTINCT game_pk) FROM starter_history) AS distinct_games,
    (SELECT MAX(game_date) FROM starter_history_stage WHERE batch_id=?) AS retained_max_game_date,
    (SELECT MAX(game_date) FROM starter_history WHERE batch_id=?) AS live_max_game_date
  `, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id);
  const liveRowsAfter = num(after && after.live_rows_for_batch) || 0;
  const retainedRows = num(after && after.retained_stage_rows) || 0;
  const missingAfter = num(after && after.missing_live_rows_after) || 0;
  const duplicateLiveKeys = num(after && after.duplicate_live_keys) || 0;
  const missingLiveIdentity = num(after && after.missing_live_identity_count) || 0;
  const pass = expectedRows > 0 && retainedRows === expectedRows && liveRowsAfter === expectedRows && missingAfter === 0 && duplicateLiveKeys === 0 && missingLiveIdentity === 0;
  const certificationStatus = pass ? (missingBefore > 0 ? 'STARTER_HISTORY_DELTA_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE' : 'STARTER_HISTORY_DELTA_RESTORE_NOOP_LIVE_RETAINED_ALREADY_CURRENT') : 'STARTER_HISTORY_DELTA_RESTORE_BLOCKED_VERIFY_FAILED';
  const certificationGrade = pass ? (missingBefore > 0 ? 'DELTA_REPAIR_PASS' : 'DELTA_NOOP_PASS') : 'DELTA_REPAIR_BLOCKED';
  const status = pass ? (missingBefore > 0 ? 'REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE' : 'DELTA_STARTER_HISTORY_RESTORE_NOOP_CURRENT') : 'DELTA_STARTER_HISTORY_RESTORE_VERIFY_FAILED';
  const output = {
    source_shape_classification: 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS',
    actual_starter_identification_path: 'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    source_final_date_check: probe,
    retained_delta_batch_id: deltaBatch.batch_id,
    expected_starter_rows: expectedRows,
    missing_live_rows_detected: missingBefore,
    restored_rows: missingBefore > 0 && pass ? missingBefore : 0,
    missing_live_rows_after: missingAfter,
    retained_stage_rows: retainedRows,
    live_rows_for_batch: liveRowsAfter,
    duplicate_live_keys: duplicateLiveKeys,
    missing_live_identity_count: missingLiveIdentity,
    total_live_rows: num(after && after.total_live_rows) || 0,
    distinct_starter_keys: num(after && after.distinct_starter_keys) || 0,
    distinct_games: num(after && after.distinct_games) || 0,
    retained_max_game_date: ymd(after && after.retained_max_game_date),
    live_max_game_date: ymd(after && after.live_max_game_date),
    queued: false,
    request_id_created: null,
    no_mining_calls: true,
    no_stage_writes: true,
    no_full_sweep: true,
    no_new_batch: true,
    no_cleanup: true,
    no_delta_stage_cleanup: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true,
    next_action: pass ? 'RETAINED_STAGE_RESTORE_LOCKED_SCOPED_SOURCE_REPAIR_ALLOWED_NEXT' : 'INSPECT_DELTA_RESTORE_VERIFY_FAILURE'
  };
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, 1, 1, ?)`,
    rid('starter_cert'), deltaBatch.batch_id, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade,
    output.actual_starter_identification_path, 'game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation', num(deltaBatch.expected_game_count) || 0, expectedRows, retainedRows, duplicateLiveKeys, missingLiveIdentity, safeJson(output));
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_delta_retained_stage_restore_before_queue', ?, ?, 'delta_retained_stage_restore_before_queue', ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, startDate, ymd(probe.latest_complete_game_date || after.live_max_game_date || after.retained_max_game_date), deltaBatch.batch_id, runId, safeJson(output));
  return { ok: pass, data_ok: pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: deltaBatch.batch_id, status, certification: certificationStatus, certification_grade: certificationGrade, rows_read: retainedRows, rows_written: missingBefore > 0 ? missingBefore : 2, rows_promoted: missingBefore > 0 && pass ? missingBefore : 0, external_calls_performed: probe.external_calls || 1, schema, output_json: output, restored_rows: output.restored_rows, queued: false, request_id_created: null, no_mining_calls: true, no_stage_writes: true, no_full_sweep: true, no_new_batch: true, no_cleanup: true, no_browser_pump: true, timestamp_utc: nowUtc() };
}



async function loadActiveCalendarGapStarterBatch(env, requestId) {
  return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches
    WHERE ingestion_mode='delta_calendar_gap_scoped_repair'
      AND request_id=?
      AND status IN ('RUNNING_CALENDAR_GAP_SCOPED_REPAIR','PARTIAL_CONTINUE_CALENDAR_GAP_SCOPED_REPAIR','FINALIZATION_ONLY_CALENDAR_GAP_SCOPED_REPAIR')
    ORDER BY datetime(created_at) DESC
    LIMIT 1`, requestId);
}

async function loadStarterHistoryCalendarGaps(env) {
  return await all(env.TEAM_DB, `SELECT
      g.game_pk,
      g.official_date AS game_date,
      COALESCE(cal.game_type, 'R') AS game_type,
      COALESCE(cal.detailed_state, cal.abstract_game_state, 'Final') AS game_status,
      cal.home_team_id AS home_team_id,
      cal.away_team_id AS away_team_id,
      cal.home_team_name AS home_team_name,
      cal.away_team_name AS away_team_name,
      cal.venue_id AS venue_id,
      g.coverage_status,
      g.coverage_grade,
      g.missing_reason,
      g.live_rows AS coverage_live_rows,
      g.stage_rows AS coverage_stage_rows,
      g.outcome_rows AS coverage_outcome_rows
    FROM mlb_game_data_coverage g
    LEFT JOIN mlb_game_calendar cal ON cal.game_pk = g.game_pk
    WHERE g.layer_key='starter_history'
      AND (
        g.blocking_for_full_run=1
        OR (
          g.coverage_status='scheduled_not_ready'
          AND EXISTS (
            SELECT 1
            FROM team_game_logs tgl
            WHERE tgl.game_pk = g.game_pk
              AND tgl.season = g.season
            LIMIT 1
          )
        )
      )
    ORDER BY g.official_date, g.game_pk`);
}

async function createCalendarGapStarterBatch(env, input, requestId, chainId, runId, gaps) {
  const batchId = rid('starter_calendar_gap_batch');
  const firstDate = ymd(gaps[0] && gaps[0].game_date);
  const lastDate = ymd(gaps[gaps.length - 1] && gaps[gaps.length - 1].game_date);
  const season = seasonFromDate(lastDate || firstDate || DEFAULT_SAMPLE_DATE);
  await run(env.TEAM_DB, `INSERT INTO starter_history_batches (
    batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type,
    base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, sample_limit, source_shape_classification,
    actual_starter_identification_path, safest_key_model, expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys,
    final_games_sampled, games_with_two_actual_starters, missing_actual_starter_games, probable_only_games, source_error_count, unclear_count,
    status, certification_status, certification_grade, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'delta_calendar_gap_scoped_repair', 0, ?, ?, ?, 'R', ?, ?, ?, ?, 0, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, 0, 0, ?, 0, 0, 0, 0, 0, 'RUNNING_CALENDAR_GAP_SCOPED_REPAIR', 'STARTER_HISTORY_CALENDAR_GAP_SCOPED_REPAIR_RUNNING', 'DELTA_IN_PROGRESS', ?)`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season,
    DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, firstDate, lastDate,
    'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    'calendar gap game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation',
    gaps.length, gaps.length * 2, gaps.length,
    safeJson({ calendar_gap_scoped_repair: true, layer_key: 'starter_history', gap_game_count: gaps.length, expected_starter_rows: gaps.length * 2, first_gap_date: firstDate, last_gap_date: lastDate, no_full_sweep: true, source: 'TEAM_DB.mlb_game_data_coverage blocking_for_full_run=1 OR scheduled_not_ready with live team_game_logs evidence' })
  );
  for (const gap of gaps) {
    const gamePk = num(gap.game_pk);
    const gameDate = ymd(gap.game_date);
    const details = {
      calendar_gap_scoped_repair: true,
      layer_key: 'starter_history',
      game_pk: gamePk,
      game_date: gameDate,
      game_status: str(gap.game_status || 'Final'),
      game_type: str(gap.game_type || 'R'),
      venue_id: num(gap.venue_id),
      home_team_id: num(gap.home_team_id),
      away_team_id: num(gap.away_team_id),
      home_team_name: str(gap.home_team_name),
      away_team_name: str(gap.away_team_name),
      coverage_status: str(gap.coverage_status),
      coverage_grade: str(gap.coverage_grade),
      missing_reason: str(gap.missing_reason),
      coverage_live_rows: num(gap.coverage_live_rows) || 0,
      coverage_stage_rows: num(gap.coverage_stage_rows) || 0,
      coverage_outcome_rows: num(gap.coverage_outcome_rows) || 0
    };
    await insertOutcome(env, {
      batch_id: batchId,
      run_id: runId,
      request_id: requestId,
      game_pk: gamePk,
      game_date: gameDate,
      season: seasonFromDate(gameDate),
      outcome_level: 'GAME',
      outcome_category: 'CALENDAR_GAP_PENDING',
      status: 'PENDING_SOURCE',
      reason: 'calendar_tally_blocking_gap_requires_exact_game_pk_starter_history_mining',
      source_endpoint: 'TEAM_DB.mlb_game_data_coverage + TEAM_DB.mlb_game_calendar',
      details
    });
  }
  return await first(env.TEAM_DB, `SELECT * FROM starter_history_batches WHERE batch_id=?`, batchId);
}

async function finalizeCalendarGapStarterBatch(env, batch, runId, requestId, extraOutput = {}) {
  const batchId = batch.batch_id;
  const c = await deltaCounts(env, batchId);
  const expectedGameCount = num(batch.expected_game_count) || 0;
  const expectedStarterRows = num(batch.expected_starter_rows) || 0;
  const stagedRows = num(c.staged_rows) || 0;
  const liveRows = num(c.live_rows) || 0;
  const pendingGames = num(c.pending_games) || 0;
  const duplicateStageKeys = num(c.duplicate_stage_keys) || 0;
  const duplicateLiveKeys = num(c.duplicate_live_keys) || 0;
  const missingStageIdentity = num(c.missing_stage_identity) || 0;
  const missingLiveIdentity = num(c.missing_live_identity) || 0;
  const sourceErrorCount = num(c.source_error_count) || 0;
  const unclearCount = num(c.unclear_count) || 0;
  const actualCoverageGapsAfter = await first(env.TEAM_DB, `SELECT
      COUNT(*) AS blocking_gap_count,
      COUNT(DISTINCT game_pk) AS blocking_gap_games
    FROM mlb_game_data_coverage
    WHERE layer_key='starter_history'
      AND blocking_for_full_run=1`);
  const batchLiveBad = await all(env.TEAM_DB, `SELECT game_pk, game_date, COUNT(*) AS starter_rows, COUNT(DISTINCT player_id) AS starters, COUNT(DISTINCT team_id) AS teams
    FROM starter_history
    WHERE batch_id=?
    GROUP BY game_pk, game_date
    HAVING starter_rows<>2 OR starters<>2 OR teams<>2
    ORDER BY game_date, game_pk
    LIMIT 20`, batchId);
  const pass = expectedGameCount > 0 && pendingGames === 0 && stagedRows === expectedStarterRows && liveRows === expectedStarterRows && duplicateStageKeys === 0 && duplicateLiveKeys === 0 && missingStageIdentity === 0 && missingLiveIdentity === 0 && sourceErrorCount === 0 && unclearCount === 0 && batchLiveBad.length === 0;
  const status = pass ? 'COMPLETED_CALENDAR_GAP_SCOPED_PROMOTED_STAGE_RETAINED' : 'CALENDAR_GAP_SCOPED_REPAIR_VERIFY_FAILED';
  const certificationStatus = pass ? 'STARTER_HISTORY_CALENDAR_GAP_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED' : 'STARTER_HISTORY_CALENDAR_GAP_SCOPED_REPAIR_BLOCKED_VERIFY_FAILED';
  const certificationGrade = pass ? 'DELTA_REPAIR_PASS' : 'DELTA_REPAIR_BLOCKED';
  const output = {
    calendar_gap_scoped_repair: true,
    layer_key: 'starter_history',
    target_source: 'TEAM_DB.mlb_game_data_coverage blocking_for_full_run=1 OR scheduled_not_ready with live team_game_logs evidence joined to TEAM_DB.mlb_game_calendar',
    source_shape_classification: 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS',
    actual_starter_identification_path: 'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    gap_game_count: expectedGameCount,
    targeted_game_count: expectedGameCount,
    calendar_gap_count: expectedGameCount,
    scoped_gap_count: expectedGameCount,
    expected_starter_rows: expectedStarterRows,
    staged_starter_rows: stagedRows,
    rows_promoted: liveRows,
    live_rows_for_batch: liveRows,
    retained_stage_rows: stagedRows,
    pending_games: pendingGames,
    duplicate_stage_keys: duplicateStageKeys,
    duplicate_live_keys: duplicateLiveKeys,
    missing_stage_identity_count: missingStageIdentity,
    missing_live_identity_count: missingLiveIdentity,
    source_error_count: sourceErrorCount,
    unclear_count: unclearCount,
    post_run_calendar_blocking_gap_count_before_calendar_refresh: num(actualCoverageGapsAfter && actualCoverageGapsAfter.blocking_gap_count) || 0,
    post_run_calendar_blocking_gap_games_before_calendar_refresh: num(actualCoverageGapsAfter && actualCoverageGapsAfter.blocking_gap_games) || 0,
    batch_live_bad_examples: batchLiveBad,
    no_full_sweep: true,
    no_new_universe_sweep: true,
    scoped_to_calendar_tally_gaps: true,
    stage_retained: true,
    no_delta_stage_cleanup: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true,
    ...extraOutput,
    next_action: pass ? 'RUN_DELTA_CALENDAR_TO_REFRESH_TALLY_AND_CONFIRM_ZERO_STARTER_HISTORY_GAPS' : 'DO_NOT_RUN_CALENDAR_UNTIL_STARTER_HISTORY_REPAIR_IS_FIXED'
  };
  await run(env.TEAM_DB, `UPDATE starter_history_batches SET staged_starter_rows=?, rows_promoted=?, live_rows_for_batch=?, stage_rows_after_clean=?, duplicate_stage_keys=?, duplicate_live_keys=?, missing_live_identity_count=?, source_error_count=?, unclear_count=?, games_with_two_actual_starters=?, status=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, promoted_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    stagedRows, liveRows, liveRows, stagedRows, duplicateStageKeys, duplicateLiveKeys, missingLiveIdentity, sourceErrorCount, unclearCount, expectedGameCount, status, certificationStatus, certificationGrade, safeJson(output), batchId);
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?)`,
    rid('starter_cert'), batchId, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade, output.actual_starter_identification_path, 'calendar gap game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation', expectedGameCount, expectedStarterRows, stagedRows, duplicateStageKeys, missingStageIdentity + missingLiveIdentity, sourceErrorCount, unclearCount, safeJson(output));
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_calendar_gap_scoped_repair', ?, ?, 'delta_calendar_gap_scoped_repair', ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, batch.sample_start_date, batch.sample_end_date, batchId, runId, safeJson(output));
  return { pass, status, certificationStatus, certificationGrade, output };
}

async function runCalendarGapScopedStarterMining(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, status: 'schema_failed', certification: 'STARTER_HISTORY_SCHEMA_FAILED', schema, rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  const requestId = input.request_id || rid('starter_calendar_gap_req');
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid('starter_calendar_gap_run');
  const rowInput = input.input_json || {};
  const maxGamesPerTick = Math.max(1, Math.min(40, Number(rowInput.max_games_per_tick || input.max_games_per_tick || 40) || 40));
  let batch = await loadActiveCalendarGapStarterBatch(env, requestId);
  let gaps = [];
  let createdNewBatch = false;
  let externalCalls = 0;
  let rowsRead = 0;
  let rowsWritten = 0;
  let rowsPromoted = 0;
  if (!batch) {
    gaps = await loadStarterHistoryCalendarGaps(env);
    if (gaps.length === 0) {
      const output = { calendar_gap_scoped_repair: true, layer_key: 'starter_history', gap_game_count: 0, targeted_game_count: 0, rows_promoted: 0, no_live_mutation: true, no_full_sweep: true, next_action: 'NO_STARTER_HISTORY_CALENDAR_GAPS_FOUND_SAFE_TO_RUN_CALENDAR_OR_MOVE_ON' };
      return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'STARTER_HISTORY_CALENDAR_GAP_SCOPED_NOOP_NO_GAPS', certification: 'STARTER_HISTORY_CALENDAR_GAP_SCOPED_NOOP_NO_GAPS', certification_grade: 'DELTA_NOOP_PASS', rows_read: 0, rows_written: 0, rows_staged: 0, rows_promoted: 0, external_calls_performed: 0, schema, output_json: output, no_browser_pump: true, timestamp_utc: nowUtc() };
    }
    batch = await createCalendarGapStarterBatch(env, input, requestId, chainId, runId, gaps);
    createdNewBatch = true;
  }
  const pending = await all(env.TEAM_DB, `SELECT * FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND status='PENDING_SOURCE' ORDER BY date(game_date), game_pk LIMIT ?`, batch.batch_id, maxGamesPerTick);
  for (const gameRow of pending) {
    const res = await processOneDeltaGame(env, batch, gameRow, runId, requestId);
    rowsRead += 1;
    rowsWritten += res.rows_written || 0;
    rowsPromoted += res.rows_promoted || 0;
    externalCalls += res.external_calls || 0;
  }
  const counts = await deltaCounts(env, batch.batch_id);
  const remainingGames = num(counts.pending_games) || 0;
  const stagedRows = num(counts.staged_rows) || 0;
  const liveRows = num(counts.live_rows) || 0;
  if (remainingGames > 0) {
    const output = { calendar_gap_scoped_repair: true, layer_key: 'starter_history', batch_id: batch.batch_id, gap_game_count: num(batch.expected_game_count) || null, targeted_game_count: num(batch.expected_game_count) || null, max_games_per_tick: maxGamesPerTick, rows_read_this_tick: rowsRead, rows_written_this_tick: rowsWritten, rows_promoted_this_tick: rowsPromoted, staged_rows_so_far: stagedRows, live_rows_for_batch: liveRows, remaining_games: remainingGames, expected_starter_rows: batch.expected_starter_rows, continuation_required: true, no_full_sweep: true, scoped_to_calendar_tally_gaps: true };
    await run(env.TEAM_DB, `UPDATE starter_history_batches SET staged_starter_rows=?, rows_promoted=?, live_rows_for_batch=?, status='PARTIAL_CONTINUE_CALENDAR_GAP_SCOPED_REPAIR', certification_status='STARTER_HISTORY_CALENDAR_GAP_SCOPED_REPAIR_PARTIAL_CONTINUE', certification_grade='DELTA_IN_PROGRESS', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, stagedRows, liveRows, liveRows, safeJson(output), batch.batch_id);
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batch.batch_id, status: 'partial_continue_starter_history_calendar_gap_scoped_repair', certification: 'STARTER_HISTORY_CALENDAR_GAP_SCOPED_REPAIR_PARTIAL_CONTINUE', certification_grade: 'DELTA_IN_PROGRESS', rows_read: rowsRead, rows_written: rowsWritten, rows_promoted: rowsPromoted, external_calls_performed: externalCalls, schema, output_json: output, continuation_required: true, orchestrator_should_self_continue: true, stage_retained: true, no_delta_stage_cleanup: true, no_browser_pump: true, timestamp_utc: nowUtc() };
  }
  const final = await finalizeCalendarGapStarterBatch(env, batch, runId, requestId, { created_new_batch: createdNewBatch, rows_read_this_tick: rowsRead, rows_written_this_tick: rowsWritten, rows_promoted_this_tick: rowsPromoted });
  return { ok: final.pass, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batch.batch_id, status: final.status, certification: final.certificationStatus, certification_grade: final.certificationGrade, rows_read: rowsRead, rows_written: rowsWritten, rows_staged: final.output.staged_starter_rows, rows_promoted: final.output.rows_promoted, external_calls_performed: externalCalls, schema, output_json: final.output, gap_game_count: final.output.gap_game_count, targeted_game_count: final.output.targeted_game_count, calendar_gap_count: final.output.calendar_gap_count, scoped_gap_count: final.output.scoped_gap_count, expected_starter_rows: final.output.expected_starter_rows, stage_retained: true, no_delta_stage_cleanup: true, no_full_sweep: true, no_browser_pump: true, timestamp_utc: nowUtc() };
}

async function scopedSourceRepairMissingDeltaKeys(env, input) {
  const schema = await ensureSchema(env);
  if (!schema.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'schema_failed', certification: 'STARTER_HISTORY_SCHEMA_FAILED', schema, rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  const requestId = input.request_id || rid('starter_delta_scoped_repair_req');
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid('starter_delta_scoped_repair_run');
  const rowInput = input.input_json || {};
  const base = await loadPromotedBaseBatch(env);
  if (!base) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_base_not_promoted', certification: 'STARTER_HISTORY_DELTA_SCOPED_REPAIR_BLOCKED_BASE_NOT_PROMOTED', certification_grade: 'DELTA_REPAIR_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, no_full_sweep: true, no_new_batch: true };
  const deltaBatch = await latestPromotedDeltaBatch(env);
  if (!deltaBatch) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, status: 'blocked_no_promoted_retained_delta_batch', certification: 'STARTER_HISTORY_DELTA_SCOPED_REPAIR_BLOCKED_NO_PROMOTED_RETAINED_DELTA_BATCH', certification_grade: 'DELTA_REPAIR_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, no_full_sweep: true, no_new_batch: true };

  const startDate = ymd(rowInput.delta_start_date || rowInput.delta_reserved_start_date || input.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE);
  const endDate = ymd(rowInput.delta_end_date || input.delta_end_date || new Date().toISOString().slice(0,10));
  const probe = await latestCompleteStarterHistoryDateFromSchedule(env, startDate, endDate);
  const targetLimit = Math.max(1, Math.min(3, Number(rowInput.scoped_repair_limit || input.scoped_repair_limit || 1) || 1));

  // Gold-standard game-log order: retained-stage restore must happen before scoped source repair.
  // If live is missing but retained delta stage still has the key, do not source-refetch.
  const retainedRestoreAvailable = await first(env.TEAM_DB, `SELECT COUNT(*) AS c
    FROM starter_history_stage s
    LEFT JOIN starter_history h ON h.starter_key = s.starter_key
    WHERE s.batch_id = ?
      AND h.starter_key IS NULL`, deltaBatch.batch_id);
  const retainedRestoreAvailableCount = num(retainedRestoreAvailable && retainedRestoreAvailable.c) || 0;
  if (retainedRestoreAvailableCount > 0) {
    const restoreInput = { ...input, input_json: { ...(input.input_json || {}), mode: 'delta_retained_stage_restore_before_queue' }, mode: 'delta_retained_stage_restore_before_queue' };
    const restored = await restoreMissingLiveRowsFromRetainedDeltaStage(env, restoreInput);
    return {
      ...restored,
      version: VERSION,
      status: restored.status,
      certification: restored.certification,
      certification_grade: restored.certification_grade,
      scoped_source_repair_bypassed_for_retained_restore: true,
      retained_restore_rows_available: retainedRestoreAvailableCount,
      correct_repair_order: true,
      no_source_refetch_when_stage_has_row: true
    };
  }

  const missingRows = await all(env.TEAM_DB, `SELECT
      o.game_pk,
      o.game_date,
      o.team_id,
      o.opponent_team_id,
      o.starter_player_id,
      o.details_json,
      o.source_endpoint,
      CAST(o.game_pk AS TEXT) || '_' || o.team_id AS starter_key
    FROM starter_history_outcomes o
    LEFT JOIN starter_history h
      ON h.starter_key = CAST(o.game_pk AS TEXT) || '_' || o.team_id
    LEFT JOIN starter_history_stage s
      ON s.batch_id = o.batch_id
     AND s.starter_key = CAST(o.game_pk AS TEXT) || '_' || o.team_id
    WHERE o.batch_id = ?
      AND o.outcome_level = 'STARTER'
      AND o.outcome_category = 'PROMOTED_ROWS'
      AND o.status IN ('STAGED_DELTA_RETAINED','STAGED_BASE_ONLY','STAGED_PROBE_ONLY')
      AND h.starter_key IS NULL
      AND s.starter_key IS NULL
    ORDER BY o.game_date DESC, o.game_pk DESC, o.team_id
    LIMIT ?`, deltaBatch.batch_id, targetLimit);

  const missingStageOnly = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM starter_history_outcomes o
    LEFT JOIN starter_history_stage s ON s.batch_id=o.batch_id AND s.starter_key=CAST(o.game_pk AS TEXT) || '_' || o.team_id
    WHERE o.batch_id=? AND o.outcome_level='STARTER' AND o.outcome_category='PROMOTED_ROWS' AND o.status IN ('STAGED_DELTA_RETAINED','STAGED_BASE_ONLY','STAGED_PROBE_ONLY') AND s.starter_key IS NULL`, deltaBatch.batch_id);
  const missingLiveOnly = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM starter_history_outcomes o
    LEFT JOIN starter_history h ON h.starter_key=CAST(o.game_pk AS TEXT) || '_' || o.team_id
    WHERE o.batch_id=? AND o.outcome_level='STARTER' AND o.outcome_category='PROMOTED_ROWS' AND o.status IN ('STAGED_DELTA_RETAINED','STAGED_BASE_ONLY','STAGED_PROBE_ONLY') AND h.starter_key IS NULL`, deltaBatch.batch_id);

  let externalCalls = probe.external_calls || 1;
  let scopedGamesRefetched = 0;
  let rowsStaged = 0;
  let rowsPromoted = 0;
  let sourceErrorCount = 0;
  let unclearCount = 0;
  const repairedKeys = [];
  const failedKeys = [];
  const seenGames = new Set();

  for (const miss of missingRows) {
    const gamePk = num(miss.game_pk);
    const targetTeamId = str(miss.team_id);
    const gameDate = ymd(miss.game_date);
    let starterDetails = {};
    try { starterDetails = JSON.parse(miss.details_json || '{}'); } catch (_) { starterDetails = {}; }
    let gameDetails = await first(env.TEAM_DB, `SELECT details_json FROM starter_history_outcomes WHERE batch_id=? AND outcome_level='GAME' AND game_pk=? ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC LIMIT 1`, deltaBatch.batch_id, gamePk);
    try { gameDetails = gameDetails ? JSON.parse(gameDetails.details_json || '{}') : {}; } catch (_) { gameDetails = {}; }
    const boxEndpoint = `/api/v1/game/${gamePk}/boxscore`;
    const box = await fetchMlbJson(env, boxEndpoint);
    externalCalls += 1;
    seenGames.add(gamePk);
    scopedGamesRefetched = seenGames.size;
    if (!box.ok) {
      sourceErrorCount += 1;
      failedKeys.push({ starter_key: miss.starter_key, reason: 'boxscore_http_error_scoped_repair', http_status: box.http_status });
      await insertOutcome(env, { batch_id: deltaBatch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season: seasonFromDate(gameDate), team_id: targetTeamId, opponent_team_id: miss.opponent_team_id, starter_player_id: miss.starter_player_id, outcome_level: 'STARTER', outcome_category: 'REPAIR_REQUIRED', status: 'SOURCE_ERROR', reason: 'boxscore_http_error_scoped_repair', source_endpoint: box.endpoint, details: { starter_key: miss.starter_key, http_status: box.http_status, text_preview: box.text_preview } });
      continue;
    }
    let side = starterDetails.side || null;
    if (!side) {
      const awayTeamNode = teamBox(box.json, 'away');
      const homeTeamNode = teamBox(box.json, 'home');
      const awayParent = awayTeamNode && awayTeamNode.team && awayTeamNode.team.id != null ? String(awayTeamNode.team.id) : null;
      const homeParent = homeTeamNode && homeTeamNode.team && homeTeamNode.team.id != null ? String(homeTeamNode.team.id) : null;
      if (awayParent === targetTeamId) side = 'away';
      if (homeParent === targetTeamId) side = 'home';
    }
    if (!side || !['away','home'].includes(side)) {
      unclearCount += 1;
      failedKeys.push({ starter_key: miss.starter_key, reason: 'target_side_unresolved_scoped_repair' });
      await insertOutcome(env, { batch_id: deltaBatch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season: seasonFromDate(gameDate), team_id: targetTeamId, opponent_team_id: miss.opponent_team_id, starter_player_id: miss.starter_player_id, outcome_level: 'STARTER', outcome_category: 'REPAIR_REQUIRED', status: 'UNCLEAR', reason: 'target_side_unresolved_scoped_repair', source_endpoint: box.endpoint, details: { starter_key: miss.starter_key, starter_details: starterDetails } });
      continue;
    }
    const otherSide = side === 'away' ? 'home' : 'away';
    const teamNode = teamBox(box.json, side);
    const starter = findStarterFromBoxTeam(teamNode);
    const playerId = playerIdFromStarter(starter);
    const teamId = targetTeamId;
    const opponentTeamId = str(miss.opponent_team_id || gameDetails[`${otherSide}_team_id`] || null);
    if (!starter || !playerId || starter.source_type !== 'official_final_boxscore_games_started' || String(playerId) !== String(miss.starter_player_id || playerId) || !teamId || !opponentTeamId) {
      unclearCount += 1;
      failedKeys.push({ starter_key: miss.starter_key, reason: 'actual_starter_not_confirmed_by_boxscore_gamesStarted_scoped_repair', player_id: playerId, expected_player_id: miss.starter_player_id });
      await insertOutcome(env, { batch_id: deltaBatch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season: seasonFromDate(gameDate), team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId || miss.starter_player_id, outcome_level: 'STARTER', outcome_category: 'REPAIR_REQUIRED', status: 'UNCLEAR', reason: 'actual_starter_not_confirmed_by_boxscore_gamesStarted_scoped_repair', source_endpoint: box.endpoint, details: { starter_key: miss.starter_key, side, player_id: playerId, expected_player_id: miss.starter_player_id, starter_source_type: starter ? starter.source_type : null } });
      continue;
    }
    const line = extractPitchingLine(starter.player_node);
    const starterKey = `${gamePk}_${teamId}`;
    const stageRow = {
      batch_id: deltaBatch.batch_id, run_id: runId, request_id: requestId, starter_key: starterKey, game_pk: gamePk, game_date: gameDate, season: seasonFromDate(gameDate), game_type: str(gameDetails.game_type || 'R'), game_status: str(gameDetails.game_status || 'Final'),
      team_id: teamId, team_name: null, opponent_team_id: opponentTeamId, opponent_team_name: null, is_home: side === 'home', venue_id: num(gameDetails.venue_id),
      starter_player_id: playerId, starter_name: playerNameFromStarter(starter), throws: throwsFromStarter(starter), starter_source_path: starter.source_path.replace('{side}', side), starter_source_type: starter.source_type,
      source_endpoint: box.endpoint, raw_json: { side, game_context: gameDetails, starter_player_node: starter.player_node, pitching_line: line, scoped_source_repair: true, stage_retained: true, repaired_starter_key: starterKey }, ...line
    };
    await insertStage(env, stageRow);
    await run(env.TEAM_DB, `UPDATE starter_history_stage SET ingestion_mode='delta_scoped_source_repair', certification_status='STARTER_HISTORY_DELTA_SCOPED_SOURCE_REPAIR_CERTIFIED_PROMOTED_RETAINED', certification_grade='DELTA_REPAIR_PASS', promoted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND starter_key=?`, deltaBatch.batch_id, starterKey);
    await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history (
      starter_key, player_id, team_id, game_date, game_pk, starter_json, updated_at,
      season, game_type, game_status, opponent_team_id, is_home, venue_id, starter_name, throws,
      source_key, source_endpoint, source_confidence, data_feed_key, source_season, source_game_type, ingestion_mode, batch_id, run_id,
      certification_status, certification_grade, source_snapshot_date, raw_json, created_at, certified_at, promoted_at,
      starter_player_id, started_game, starter_source_path, starter_source_type, innings_pitched, outs_recorded, batters_faced, pitches, strikes,
      hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed
    )
    SELECT
      starter_key, starter_player_id, team_id, game_date, game_pk, raw_json, CURRENT_TIMESTAMP,
      season, game_type, game_status, opponent_team_id, is_home, venue_id, starter_name, throws,
      source_key, source_endpoint, source_confidence, data_feed_key, source_season, source_game_type, 'delta_scoped_source_repair_promoted', batch_id, ?,
      'STARTER_HISTORY_DELTA_SCOPED_SOURCE_REPAIR_CERTIFIED_PROMOTED_RETAINED', 'DELTA_REPAIR_PASS', source_snapshot_date, raw_json, COALESCE(created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
      starter_player_id, started_game, starter_source_path, starter_source_type, innings_pitched, outs_recorded, batters_faced, pitches, strikes,
      hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed
    FROM starter_history_stage
    WHERE batch_id=? AND starter_key=?`, runId, deltaBatch.batch_id, starterKey);
    await insertOutcome(env, { batch_id: deltaBatch.batch_id, run_id: runId, request_id: requestId, game_pk: gamePk, game_date: gameDate, season: seasonFromDate(gameDate), team_id: teamId, opponent_team_id: opponentTeamId, starter_player_id: playerId, outcome_level: 'STARTER', outcome_category: 'REPAIR_REQUIRED', status: 'SCOPED_SOURCE_REPAIR_COMPLETED', reason: 'missing_live_and_retained_stage_key_refetched_from_official_boxscore', source_endpoint: box.endpoint, details: { starter_key: starterKey, side, no_full_sweep: true, no_new_batch: true, stage_retained: true } });
    rowsStaged += 1;
    rowsPromoted += 1;
    repairedKeys.push(starterKey);
  }

  const after = await first(env.TEAM_DB, `SELECT
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history_stage WHERE batch_id=?) AS retained_stage_rows,
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history WHERE batch_id=?) AS live_rows_for_batch,
    (SELECT COUNT(*) FROM starter_history_stage s LEFT JOIN starter_history h ON h.starter_key=s.starter_key WHERE s.batch_id=? AND h.starter_key IS NULL) AS missing_live_rows_after,
    (SELECT COUNT(*) FROM starter_history_outcomes o LEFT JOIN starter_history_stage s ON s.batch_id=o.batch_id AND s.starter_key=CAST(o.game_pk AS TEXT) || '_' || o.team_id WHERE o.batch_id=? AND o.outcome_level='STARTER' AND o.outcome_category='PROMOTED_ROWS' AND o.status IN ('STAGED_DELTA_RETAINED','STAGED_BASE_ONLY','STAGED_PROBE_ONLY') AND s.starter_key IS NULL) AS missing_stage_rows_after,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history WHERE batch_id=? GROUP BY starter_key HAVING c>1)) AS duplicate_live_keys,
    (SELECT COUNT(*) FROM (SELECT starter_key, COUNT(*) c FROM starter_history_stage WHERE batch_id=? GROUP BY starter_key HAVING c>1)) AS duplicate_stage_keys,
    (SELECT COUNT(*) FROM starter_history WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL OR starter_source_type IS NULL OR starter_source_path IS NULL)) AS missing_live_identity_count,
    (SELECT COUNT(*) FROM starter_history_stage WHERE batch_id=? AND (game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR opponent_team_id IS NULL OR starter_player_id IS NULL OR raw_json IS NULL OR starter_source_type IS NULL OR starter_source_path IS NULL)) AS missing_stage_identity_count,
    (SELECT COUNT(*) FROM starter_history) AS total_live_rows,
    (SELECT COUNT(DISTINCT starter_key) FROM starter_history) AS distinct_starter_keys,
    (SELECT COUNT(DISTINCT game_pk) FROM starter_history) AS distinct_games,
    (SELECT MAX(game_date) FROM starter_history_stage WHERE batch_id=?) AS retained_max_game_date,
    (SELECT MAX(game_date) FROM starter_history WHERE batch_id=?) AS live_max_game_date
  `, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id, deltaBatch.batch_id);
  const expectedRows = num(deltaBatch.expected_starter_rows) || 0;
  const retainedRows = num(after && after.retained_stage_rows) || 0;
  const liveRowsAfter = num(after && after.live_rows_for_batch) || 0;
  const missingStageAfter = num(after && after.missing_stage_rows_after) || 0;
  const missingLiveAfter = num(after && after.missing_live_rows_after) || 0;
  const duplicateLiveKeys = num(after && after.duplicate_live_keys) || 0;
  const duplicateStageKeys = num(after && after.duplicate_stage_keys) || 0;
  const missingLiveIdentity = num(after && after.missing_live_identity_count) || 0;
  const missingStageIdentity = num(after && after.missing_stage_identity_count) || 0;
  const missingBothBefore = missingRows.length;
  const repairPass = expectedRows > 0 && missingBothBefore > 0 && rowsPromoted === missingBothBefore && retainedRows === expectedRows && liveRowsAfter === expectedRows && missingStageAfter === 0 && missingLiveAfter === 0 && duplicateLiveKeys === 0 && duplicateStageKeys === 0 && missingLiveIdentity === 0 && missingStageIdentity === 0 && sourceErrorCount === 0 && unclearCount === 0;
  const noopPass = expectedRows > 0 && missingBothBefore === 0 && retainedRows === expectedRows && liveRowsAfter === expectedRows && missingStageAfter === 0 && missingLiveAfter === 0 && duplicateLiveKeys === 0 && duplicateStageKeys === 0 && missingLiveIdentity === 0 && missingStageIdentity === 0;
  const pass = repairPass || noopPass;
  const certificationStatus = repairPass ? 'STARTER_HISTORY_DELTA_SCOPED_SOURCE_REPAIR_CERTIFIED_PROMOTED_RETAINED' : (noopPass ? 'STARTER_HISTORY_DELTA_SCOPED_SOURCE_REPAIR_NOOP_NO_MISSING_KEYS' : 'STARTER_HISTORY_DELTA_SCOPED_SOURCE_REPAIR_BLOCKED_VERIFY_FAILED');
  const certificationGrade = repairPass ? 'DELTA_REPAIR_PASS' : (noopPass ? 'DELTA_NOOP_PASS' : 'DELTA_REPAIR_BLOCKED');
  const status = repairPass ? 'DELTA_STARTER_HISTORY_SCOPED_SOURCE_REPAIR_COMPLETED' : (noopPass ? 'DELTA_STARTER_HISTORY_SCOPED_REPAIR_NOOP_CURRENT' : 'DELTA_STARTER_HISTORY_SCOPED_SOURCE_REPAIR_VERIFY_FAILED');
  const output = {
    source_shape_classification: 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS',
    actual_starter_identification_path: 'MLB StatsAPI /api/v1/game/{gamePk}/boxscore -> teams.{away,home}.players.ID*.stats.pitching.gamesStarted == 1',
    source_final_date_check: probe,
    retained_delta_batch_id: deltaBatch.batch_id,
    expected_starter_rows: expectedRows,
    missing_live_rows_detected: num(missingLiveOnly && missingLiveOnly.c) || 0,
    missing_stage_rows_detected: num(missingStageOnly && missingStageOnly.c) || 0,
    retained_restore_rows_available: 0,
    scoped_starter_keys_to_refetch: missingBothBefore,
    scoped_games_refetched: scopedGamesRefetched,
    repaired_keys: repairedKeys,
    failed_keys: failedKeys,
    rows_staged: rowsStaged,
    rows_promoted: rowsPromoted,
    retained_stage_rows: retainedRows,
    live_rows_for_batch: liveRowsAfter,
    missing_stage_rows_after: missingStageAfter,
    missing_live_rows_after: missingLiveAfter,
    duplicate_stage_keys: duplicateStageKeys,
    duplicate_live_keys: duplicateLiveKeys,
    missing_stage_identity_count: missingStageIdentity,
    missing_live_identity_count: missingLiveIdentity,
    source_error_count: sourceErrorCount,
    unclear_count: unclearCount,
    total_live_rows: num(after && after.total_live_rows) || 0,
    distinct_starter_keys: num(after && after.distinct_starter_keys) || 0,
    distinct_games: num(after && after.distinct_games) || 0,
    retained_max_game_date: ymd(after && after.retained_max_game_date),
    live_max_game_date: ymd(after && after.live_max_game_date),
    no_full_sweep: true,
    no_new_batch: true,
    stage_retained: true,
    no_delta_stage_cleanup: true,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true,
    next_action: repairPass ? 'SCOPED_SOURCE_REPAIR_LOCKED_STARTER_HISTORY_INCREMENTAL_READY' : (noopPass ? 'NO_MISSING_KEYS_CURRENT_REPAIR_ORDER_OK' : 'INSPECT_SCOPED_SOURCE_REPAIR_FAILURE')
  };
  await run(env.TEAM_DB, `INSERT INTO starter_history_certifications (
    certification_id, batch_id, run_id, request_id, worker_name, version, certification_status, certification_grade, source_shape_classification, actual_starter_identification_path, safest_key_model,
    expected_game_count, expected_starter_rows, staged_starter_rows, duplicate_stage_keys, missing_required_identity_count, source_error_count, unclear_count, no_live_promotion, full_base_backfill_blocked, delta_update_blocked, output_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?)`,
    rid('starter_cert'), deltaBatch.batch_id, runId, requestId, WORKER_NAME, VERSION, certificationStatus, certificationGrade,
    output.actual_starter_identification_path, 'game_pk + team_id; pitcher_id + game_pk + team_id is secondary validation', num(deltaBatch.expected_game_count) || 0, expectedRows, retainedRows, duplicateStageKeys, missingStageIdentity, sourceErrorCount, unclearCount, safeJson(output));
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO starter_history_cursor (cursor_key, worker_name, version, ingestion_mode, status, source_shape_classification, base_backfill_cutoff_date, delta_reserved_start_date, last_probe_date, last_completed_game_date, last_batch_id, last_run_id, output_json, updated_at)
    VALUES ('starter_history_delta_scoped_source_repair', ?, ?, 'delta_scoped_source_repair', ?, 'GAME_LOG_STYLE_ACTUAL_START_EVENT_ROWS', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    WORKER_NAME, VERSION, certificationStatus, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_RESERVED_START_DATE, startDate, ymd(probe.latest_complete_game_date || after.live_max_game_date || after.retained_max_game_date), deltaBatch.batch_id, runId, safeJson(output));
  return { ok: pass, data_ok: pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: deltaBatch.batch_id, status, certification: certificationStatus, certification_grade: certificationGrade, rows_read: missingBothBefore, rows_written: rowsStaged + rowsPromoted + 2, rows_staged: rowsStaged, rows_promoted: rowsPromoted, external_calls_performed: externalCalls, schema, output_json: output, missing_live_rows_detected: output.missing_live_rows_detected, missing_stage_rows_detected: output.missing_stage_rows_detected, scoped_starter_keys_to_refetch: missingBothBefore, scoped_games_refetched: scopedGamesRefetched, repaired_keys: repairedKeys, no_full_sweep: true, no_new_batch: true, stage_retained: true, no_delta_stage_cleanup: true, no_browser_pump: true, timestamp_utc: nowUtc() };
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
      const mode = String((input.input_json && input.input_json.mode) || input.mode || "base_backfill_stage_only");
      if (mode === "delta_scoped_source_repair") return jsonResponse(await runCalendarGapScopedStarterMining(env, input));
      if (mode === "delta_legacy_scoped_source_repair") return jsonResponse(await scopedSourceRepairMissingDeltaKeys(env, input));
      if (mode === "delta_retained_stage_restore_before_queue") return jsonResponse(await restoreMissingLiveRowsFromRetainedDeltaStage(env, input));
      if (mode === "delta_noop_current_state") return jsonResponse(await runDeltaNoopCurrentState(env, input));
      if (mode === "delta_update") return jsonResponse(await runDeltaUpdateRetainedStage(env, input));
      if (mode === "source_lock_probe") return jsonResponse(await runSourceProbe(env, input));
      if (mode === "base_backfill" || mode === "base_backfill_stage_only") return jsonResponse(await runBaseBackfillStageOnly(env, input));
      if (mode === "base_promotion_stage_clean" || mode === "base_promotion") return jsonResponse(await promoteCertifiedBaseStage(env, input));
      return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "unsupported_mode", mode, allowed_modes: ["source_lock_probe", "base_backfill_stage_only", "base_promotion_stage_clean", "delta_update", "delta_noop_current_state", "delta_retained_stage_restore_before_queue", "delta_scoped_source_repair", "delta_legacy_scoped_source_repair"], no_live_promotion: true }, 400);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
