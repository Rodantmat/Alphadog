import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-pitcher-game-logs";
const VERSION = "alphadog-v2-base-pitcher-game-logs-postgres-v1.0.0-direct-port";
const JOB_KEY = "base-pitcher-game-logs";

const LOCKED_SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=gameLog&group=pitching&season={season}";
const SOURCE_KEY = "mlb_statsapi_people_gameLog_pitching_v0_1_0";
const DATA_FEED_KEY = "base_pitcher_game_logs";
const GROUP_TYPE = "pitching";

const DEFAULT_BASE_BACKFILL_CUTOFF_DATE = "2026-07-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-07-19";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_PLAYERS = 3;
const DEFAULT_MAX_REQUESTS_PER_TICK = 3;
const DEFAULT_MAX_ROWS_PER_TICK = 450;
const DEFAULT_LOCK_STALE_SECONDS = 60;
const DEFAULT_MAX_TICK_RUNTIME_MS = 20000;
const DEFAULT_FETCH_TIMEOUT_MS = 7000;
const DEFAULT_PROMOTE_ROWS_PER_TICK = 25;
const DEFAULT_CLEAN_ROWS_PER_TICK = 500;
const DEFAULT_DELTA_LOOKBACK_DAYS = 7;

const ACTIVE_CURSOR_KEY = "base_pitcher_game_logs_active_cursor";
const DELTA_CURSOR_KEY = "delta_pitcher_game_logs_active_cursor";
let LOCKED_BASE_BATCH_ID = "PENDING_FIRST_REAL_BASE_BACKFILL_COMPLETION";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_PITCHER_DB"];
const EXPECTED_VARS = ["MLB_API_BASE_URL", "ACTIVE_SEASON", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_SECONDS", "MAX_TICK_RUNTIME_MS", "FETCH_TIMEOUT_MS"];
const EXPECTED_SECRETS = ["MLB_API_USER_AGENT"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function cap(n, min, max) { return Math.max(min, Math.min(max, Number(n || 0))); }

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

function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = !!(env && env[n]); return out; }
function varPresence(env, names) { const out = {}; for (const n of names) out[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0; return out; }

function baseIdentity(env, extra = {}) {
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: "BASE_PITCHER_GAME_LOGS_READY", timestamp_utc: nowUtc(),
    locked_source: { source_key: SOURCE_KEY, data_feed_key: DATA_FEED_KEY, endpoint_pattern: LOCKED_SOURCE_ENDPOINT_PATTERN, group_type: GROUP_TYPE },
    mode_design: { base_backfill: "enabled_stage_certify_promote_clean", delta_update: "enabled_certifying_repair_engine_with_widened_rolling_lookback", default_base_backfill_cutoff_date: DEFAULT_BASE_BACKFILL_CUTOFF_DATE, delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE },
    binding_summary: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, EXPECTED_SECRETS) },
    ...extra
  };
}

async function parseJson(request) { try { return await request.json(); } catch (_) { return {}; } }

async function ensureSchema(sql) {
  const results = [];
  const exec = async (label, ddl) => {
    try { await sql.unsafe(ddl); results.push({ label, ok: true, error: null }); return { ok: true }; }
    catch (err) { const error = String(err && err.message ? err.message : err); results.push({ label, ok: false, error }); return { ok: false, error }; }
  };

  await exec("create_stats_pitcher_schema_migrations", `CREATE TABLE IF NOT EXISTS stats_pitcher.schema_migrations (
    migration_key TEXT PRIMARY KEY, package_version TEXT, applied_at TIMESTAMPTZ DEFAULT now(), notes TEXT
  )`);

  await exec("create_stats_pitcher_game_logs_stage", `CREATE TABLE IF NOT EXISTS stats_pitcher.game_logs_stage (
    stage_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id BIGINT NOT NULL,
    player_name TEXT,
    game_pk BIGINT,
    season INTEGER NOT NULL,
    game_date TEXT,
    team_id TEXT,
    opponent_team_id TEXT,
    opponent_abbr TEXT,
    is_home INTEGER,
    role TEXT,
    innings_pitched_decimal DOUBLE PRECISION,
    outs_recorded INTEGER,
    batters_faced INTEGER,
    hits_allowed INTEGER,
    runs_allowed INTEGER,
    earned_runs INTEGER,
    walks_allowed INTEGER,
    strikeouts INTEGER,
    home_runs_allowed INTEGER,
    pitches INTEGER,
    balls INTEGER,
    strikes INTEGER,
    wins INTEGER,
    losses INTEGER,
    saves INTEGER,
    holds INTEGER,
    blown_saves INTEGER,
    group_type TEXT NOT NULL DEFAULT 'pitching',
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_endpoint TEXT NOT NULL,
    source_season INTEGER NOT NULL,
    source_game_type TEXT,
    ingestion_mode TEXT NOT NULL,
    certification_status TEXT DEFAULT 'staged_unverified',
    certification_grade TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_GAMELOG_PITCHING',
    certified_at TIMESTAMPTZ,
    promoted_at TIMESTAMPTZ,
    raw_json TEXT,
    row_status TEXT DEFAULT 'staged',
    row_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(batch_id, player_id, game_pk, group_type)
  )`);

  await exec("create_stats_pitcher_game_log_batches", `CREATE TABLE IF NOT EXISTS stats_pitcher.game_log_batches (
    batch_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_endpoint TEXT NOT NULL,
    source_season INTEGER,
    source_game_type TEXT,
    base_backfill_cutoff_date TEXT,
    delta_start_date TEXT,
    cursor_player_id BIGINT,
    cursor_season INTEGER,
    cursor_offset INTEGER DEFAULT 0,
    cursor_state_json TEXT,
    chunk_size_players INTEGER DEFAULT 12,
    max_requests_per_tick INTEGER DEFAULT 12,
    max_rows_per_tick INTEGER DEFAULT 1200,
    source_request_count INTEGER DEFAULT 0,
    source_success_count INTEGER DEFAULT 0,
    source_no_data_count INTEGER DEFAULT 0,
    source_error_count INTEGER DEFAULT 0,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    certification_status TEXT DEFAULT 'not_certified',
    certification_grade TEXT,
    certification_json TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_GAMELOG_PITCHING',
    locked_by TEXT,
    lock_acquired_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    stale_recovery_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ,
    certified_at TIMESTAMPTZ,
    promoted_at TIMESTAMPTZ,
    cleaned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    notes TEXT
  )`);

  await exec("create_stats_pitcher_game_log_cursor", `CREATE TABLE IF NOT EXISTS stats_pitcher.game_log_cursor (
    cursor_key TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    source_season INTEGER,
    base_backfill_cutoff_date TEXT,
    delta_start_date TEXT,
    current_player_id BIGINT,
    current_player_offset INTEGER DEFAULT 0,
    players_total INTEGER DEFAULT 0,
    players_processed INTEGER DEFAULT 0,
    requests_done INTEGER DEFAULT 0,
    next_run_after TIMESTAMPTZ,
    last_error TEXT,
    cursor_json TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`);

  await exec("create_stats_pitcher_game_log_certifications", `CREATE TABLE IF NOT EXISTS stats_pitcher.game_log_certifications (
    certification_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    certification_status TEXT NOT NULL,
    certification_grade TEXT,
    checks_json TEXT NOT NULL,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    no_data_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);

  await exec("create_stats_pitcher_game_log_player_outcomes", `CREATE TABLE IF NOT EXISTS stats_pitcher.game_log_player_outcomes (
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id BIGINT NOT NULL,
    player_name TEXT,
    primary_position TEXT,
    cursor_offset INTEGER,
    source_endpoint TEXT,
    source_http_status INTEGER,
    source_ok INTEGER DEFAULT 0,
    raw_payload_split_count INTEGER DEFAULT 0,
    rows_before_cutoff INTEGER DEFAULT 0,
    rows_filtered_after_cutoff INTEGER DEFAULT 0,
    rows_staged INTEGER DEFAULT 0,
    promoted_row_count INTEGER DEFAULT 0,
    terminal_category TEXT NOT NULL,
    category_reason TEXT,
    source_error TEXT,
    first_raw_game_date TEXT,
    last_raw_game_date TEXT,
    first_promoted_game_date TEXT,
    last_promoted_game_date TEXT,
    certification_status TEXT DEFAULT 'player_outcome_unverified',
    certification_grade TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (batch_id, player_id)
  )`);

  const liveAdds = [
    ["group_type", "TEXT DEFAULT 'pitching'"], ["data_feed_key", "TEXT"], ["source_endpoint", "TEXT"],
    ["source_season", "INTEGER"], ["source_game_type", "TEXT"], ["ingestion_mode", "TEXT"],
    ["batch_id", "TEXT"], ["run_id", "TEXT"], ["certification_status", "TEXT"], ["certification_grade", "TEXT"],
    ["certified_at", "TIMESTAMPTZ"], ["promoted_at", "TIMESTAMPTZ"], ["source_confidence", "TEXT"],
    ["player_name", "TEXT"], ["role", "TEXT"], ["runs_allowed", "INTEGER"], ["pitches", "INTEGER"],
    ["balls", "INTEGER"], ["strikes", "INTEGER"], ["wins", "INTEGER"], ["losses", "INTEGER"],
    ["saves", "INTEGER"], ["holds", "INTEGER"], ["blown_saves", "INTEGER"]
  ];
  for (const [col, def] of liveAdds) {
    await exec(`alter_stats_pitcher_game_logs_add_${col}`, `ALTER TABLE stats_pitcher.game_logs ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }

  const indexes = [
    ["idx_pitcher_stage_batch", "CREATE INDEX IF NOT EXISTS idx_pitcher_stage_batch ON stats_pitcher.game_logs_stage(batch_id, row_status)"],
    ["idx_pitcher_stage_player_season", "CREATE INDEX IF NOT EXISTS idx_pitcher_stage_player_season ON stats_pitcher.game_logs_stage(player_id, season, game_date)"],
    ["idx_pitcher_batches_status", "CREATE INDEX IF NOT EXISTS idx_pitcher_batches_status ON stats_pitcher.game_log_batches(status, mode, updated_at)"],
    ["idx_pitcher_batches_lock", "CREATE INDEX IF NOT EXISTS idx_pitcher_batches_lock ON stats_pitcher.game_log_batches(locked_by, lock_expires_at)"],
    ["idx_pitcher_cursor_status", "CREATE INDEX IF NOT EXISTS idx_pitcher_cursor_status ON stats_pitcher.game_log_cursor(status, mode, updated_at)"],
    ["idx_pitcher_logs_batch", "CREATE INDEX IF NOT EXISTS idx_pitcher_logs_batch ON stats_pitcher.game_logs(batch_id, certification_status)"],
    ["idx_pitcher_logs_source", "CREATE INDEX IF NOT EXISTS idx_pitcher_logs_source ON stats_pitcher.game_logs(source_key, source_season, game_date)"],
    ["idx_pitcher_outcomes_batch_category", "CREATE INDEX IF NOT EXISTS idx_pitcher_outcomes_batch_category ON stats_pitcher.game_log_player_outcomes(batch_id, terminal_category)"]
  ];
  for (const [label, ddl] of indexes) await exec(label, ddl);

  await exec("record_schema_migration", `INSERT INTO stats_pitcher.schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_pitcher_game_logs_postgres_v1_0_0_direct_build', '${VERSION}', now(), 'Built directly for Postgres from the start.') ON CONFLICT (migration_key) DO UPDATE SET package_version=excluded.package_version, applied_at=now(), notes=excluded.notes`);

  return { attempted: results.length, failed: results.filter(r => !r.ok).length, results };
}

async function schemaStatus(sql) {
  const tables = await sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema='stats_pitcher' AND (table_name LIKE 'game_log%' OR table_name='game_logs') ORDER BY table_name`;
  const liveCols = await sql`SELECT column_name AS name FROM information_schema.columns WHERE table_schema='stats_pitcher' AND table_name='game_logs' ORDER BY ordinal_position`;
  return { tables: tables.map(r => r.name), pitcher_game_logs_columns: liveCols.map(r => r.name) };
}

function endpointFor(env, playerId, season) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  return `${base}/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=pitching&season=${encodeURIComponent(season)}`;
}

function statVal(stat, keys) { for (const k of keys) { if (stat && stat[k] !== undefined && stat[k] !== null && stat[k] !== "") return stat[k]; } return null; }
function toInt(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : null; }
function parseOuts(innings) {
  if (innings === null || innings === undefined || innings === "") return null;
  const s = String(innings);
  const [wholeRaw, fracRaw = "0"] = s.split(".");
  const whole = Number(wholeRaw), frac = Number(fracRaw);
  if (!Number.isFinite(whole)) return null;
  if (frac === 0) return whole * 3;
  if (frac === 1 || frac === 2) return whole * 3 + frac;
  const decimal = Number(s);
  return Number.isFinite(decimal) ? Math.round(decimal * 3) : null;
}
function inningsDecimal(innings) { const outs = parseOuts(innings); return outs === null ? null : outs / 3; }
function splitGameDate(split) { const game = split && split.game ? split.game : {}; return asText(game.gameDate || split.date || split.gameDate, null); }

function parsePitcherSplit(split, playerId, playerName, season, batchId, runId, mode, endpoint, cutoffDate) {
  const stat = split && split.stat ? split.stat : {};
  const game = split && split.game ? split.game : {};
  const team = split && split.team ? split.team : {};
  const opponent = split && split.opponent ? split.opponent : {};
  const gamePk = asInt(game.gamePk || game.pk || split.gamePk, 0);
  const gameDate = splitGameDate(split);
  if (!gamePk || !gameDate) return null;
  if (cutoffDate && gameDate > cutoffDate) return null;
  const innings = statVal(stat, ["inningsPitched"]);
  return {
    stage_id: `${batchId}_${playerId}_${gamePk}_pitching`,
    batch_id: batchId, run_id: runId, player_id: asInt(playerId), player_name: playerName || null,
    game_pk: gamePk, season: asInt(season), game_date: gameDate,
    team_id: team && team.id !== undefined ? String(team.id) : null,
    opponent_team_id: opponent && opponent.id !== undefined ? String(opponent.id) : null,
    opponent_abbr: statVal(opponent, ["abbreviation", "name"]),
    is_home: split && split.isHome !== undefined ? (split.isHome ? 1 : 0) : null,
    role: "P",
    innings_pitched_decimal: inningsDecimal(innings),
    outs_recorded: parseOuts(innings),
    batters_faced: toInt(statVal(stat, ["battersFaced"])),
    hits_allowed: toInt(statVal(stat, ["hits"])),
    runs_allowed: toInt(statVal(stat, ["runs"])),
    earned_runs: toInt(statVal(stat, ["earnedRuns"])),
    walks_allowed: toInt(statVal(stat, ["baseOnBalls", "walks"])),
    strikeouts: toInt(statVal(stat, ["strikeOuts", "strikeouts"])),
    home_runs_allowed: toInt(statVal(stat, ["homeRuns"])),
    pitches: toInt(statVal(stat, ["numberOfPitches", "pitches"])),
    balls: toInt(statVal(stat, ["balls"])),
    strikes: toInt(statVal(stat, ["strikes"])),
    wins: toInt(statVal(stat, ["wins"])),
    losses: toInt(statVal(stat, ["losses"])),
    saves: toInt(statVal(stat, ["saves"])),
    holds: toInt(statVal(stat, ["holds"])),
    blown_saves: toInt(statVal(stat, ["blownSaves"])),
    group_type: GROUP_TYPE, data_feed_key: DATA_FEED_KEY, source_key: SOURCE_KEY, source_endpoint: endpoint,
    source_season: asInt(season), source_game_type: asText(split && split.gameType, null), ingestion_mode: mode,
    certification_status: "base_backfill_staged_unverified", certification_grade: null,
    source_confidence: "SOURCE_LOCKED_STATSAPI_GAMELOG_PITCHING", raw_json: JSON.stringify(split)
  };
}

async function insertStageRow(sql, row) {
  await sql`
    INSERT INTO stats_pitcher.game_logs_stage (
      stage_id,batch_id,run_id,player_id,player_name,game_pk,season,game_date,team_id,opponent_team_id,opponent_abbr,is_home,role,
      innings_pitched_decimal,outs_recorded,batters_faced,hits_allowed,runs_allowed,earned_runs,walks_allowed,strikeouts,home_runs_allowed,
      pitches,balls,strikes,wins,losses,saves,holds,blown_saves,
      group_type,data_feed_key,source_key,source_endpoint,source_season,source_game_type,ingestion_mode,certification_status,certification_grade,source_confidence,raw_json,updated_at
    ) VALUES (
      ${row.stage_id},${row.batch_id},${row.run_id},${row.player_id},${row.player_name},${row.game_pk},${row.season},${row.game_date},${row.team_id},${row.opponent_team_id},${row.opponent_abbr},${row.is_home},${row.role},
      ${row.innings_pitched_decimal},${row.outs_recorded},${row.batters_faced},${row.hits_allowed},${row.runs_allowed},${row.earned_runs},${row.walks_allowed},${row.strikeouts},${row.home_runs_allowed},
      ${row.pitches},${row.balls},${row.strikes},${row.wins},${row.losses},${row.saves},${row.holds},${row.blown_saves},
      ${row.group_type},${row.data_feed_key},${row.source_key},${row.source_endpoint},${row.source_season},${row.source_game_type},${row.ingestion_mode},${row.certification_status},${row.certification_grade},${row.source_confidence},${row.raw_json}, now()
    )
    ON CONFLICT (stage_id) DO UPDATE SET
      batch_id=excluded.batch_id, run_id=excluded.run_id, player_id=excluded.player_id, player_name=excluded.player_name,
      game_pk=excluded.game_pk, season=excluded.season, game_date=excluded.game_date, team_id=excluded.team_id, opponent_team_id=excluded.opponent_team_id, opponent_abbr=excluded.opponent_abbr,
      is_home=excluded.is_home, role=excluded.role, innings_pitched_decimal=excluded.innings_pitched_decimal, outs_recorded=excluded.outs_recorded,
      batters_faced=excluded.batters_faced, hits_allowed=excluded.hits_allowed, runs_allowed=excluded.runs_allowed, earned_runs=excluded.earned_runs,
      walks_allowed=excluded.walks_allowed, strikeouts=excluded.strikeouts, home_runs_allowed=excluded.home_runs_allowed,
      pitches=excluded.pitches, balls=excluded.balls, strikes=excluded.strikes, wins=excluded.wins, losses=excluded.losses, saves=excluded.saves, holds=excluded.holds, blown_saves=excluded.blown_saves,
      group_type=excluded.group_type, data_feed_key=excluded.data_feed_key, source_key=excluded.source_key, source_endpoint=excluded.source_endpoint, source_season=excluded.source_season,
      source_game_type=excluded.source_game_type, ingestion_mode=excluded.ingestion_mode, certification_status=excluded.certification_status,
      certification_grade=excluded.certification_grade, source_confidence=excluded.source_confidence, raw_json=excluded.raw_json, updated_at=now()
  `;
}

async function chooseAllPitcherPlayers(sql, inputJson) {
  const explicit = inputJson && Array.isArray(inputJson.player_ids) ? inputJson.player_ids.map(x => asInt(x, 0)).filter(Boolean) : [];
  if (explicit.length) return explicit.map(player_id => ({ player_id, player_name: null, primary_position: null, source: "input_json.player_ids" }));

  const pitcherRoles = ["P", "SP", "RP", "CP", "LHP", "RHP"];
  const rows = await sql`
    SELECT mlb_player_id AS player_id, full_name AS player_name, primary_position, current_team_id
    FROM ref.players
    WHERE COALESCE(active,1)=1
      AND mlb_player_id IS NOT NULL
      AND UPPER(COALESCE(primary_position, primary_role, '')) IN ${sql(pitcherRoles)}
    ORDER BY current_team_id IS NULL, current_team_id, full_name
  `;
  return rows.map(r => ({
    player_id: asInt(r.player_id, 0), player_name: r.player_name || null, primary_position: r.primary_position || null,
    source: "ref.players_pitcher_role_filter"
  })).filter(r => r.player_id);
}

// STUB_MARKER_LOCKS_MINING_NEXT

export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, status: "STUB_UNDER_CONSTRUCTION", worker_name: WORKER_NAME, version: VERSION, timestamp_utc: nowUtc() }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
