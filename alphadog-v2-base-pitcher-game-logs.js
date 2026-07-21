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

// STUB_MARKER_MINING_NEXT

export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, status: "STUB_UNDER_CONSTRUCTION", worker_name: WORKER_NAME, version: VERSION, timestamp_utc: nowUtc() }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
