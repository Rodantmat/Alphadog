const WORKER_NAME = "alphadog-v2-base-hitter-game-logs";
const VERSION = "alphadog-v2-base-hitter-game-logs-v1.6.19-mining-only-no-tally-writes";
const JOB_KEY = "base-hitter-game-logs";

const LOCKED_SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=gameLog&group=hitting&season={season}";
const SOURCE_KEY = "mlb_statsapi_people_gameLog_hitting_v0_1_0";
const DATA_FEED_KEY = "base_hitter_game_logs";
const GROUP_TYPE = "hitting";
const DEFAULT_BASE_BACKFILL_CUTOFF_DATE = "2026-05-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-05-19";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_PLAYERS = 3;
const DEFAULT_MAX_REQUESTS_PER_TICK = 3;
const DEFAULT_MAX_ROWS_PER_TICK = 450;
const DEFAULT_LOCK_STALE_SECONDS = 60;
const DEFAULT_MAX_TICK_RUNTIME_MS = 20000;
const DEFAULT_FETCH_TIMEOUT_MS = 7000;
const DEFAULT_PROMOTE_ROWS_PER_TICK = 25;
const DEFAULT_CLEAN_ROWS_PER_TICK = 500;
const FINALIZATION_STATUSES = new Set([
  "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION",
  "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE",
  "BASE_BACKFILL_PROMOTING",
  "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN",
  "BASE_BACKFILL_CLEANING",
  "CERTIFICATION_FAILED",
  "COMPLETED_PROMOTED_CLEANED"
]);
const ACTIVE_CURSOR_KEY = "base_hitter_game_logs_active_cursor";
const DELTA_CURSOR_KEY = "delta_hitter_game_logs_active_cursor";
const LOCKED_BASE_BATCH_ID = "hitter_base_backfill_batch_mpelpq0t_akyyu3";
const DEFAULT_DELTA_LOOKBACK_DAYS = 7;
const DELTA_STATUSES = new Set([
  "DELTA_RUNNING",
  "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS",
  "DELTA_STAGED_READY_FOR_CERTIFICATION",
  "DELTA_CERTIFIED_READY_TO_PROMOTE",
  "DELTA_PROMOTING",
  "DELTA_PROMOTED_READY_TO_CLEAN",
  "DELTA_CLEANING",
  "DELTA_PROMOTED_STAGE_READY_TO_RETAIN"
]);

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB"];
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

async function tryRun(db, sql, ...binds) {
  try { await run(db, sql, ...binds); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err && err.message ? err.message : err), sql: sql.slice(0, 180) }; }
}

function bindingPresence(env, names) {
  const out = {};
  for (const n of names) out[n] = !!(env && env[n]);
  return out;
}

function varPresence(env, names) {
  const out = {};
  for (const n of names) out[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0;
  return out;
}

function baseIdentity(env, extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_READY",
    timestamp_utc: nowUtc(),
    locked_source: {
      source_key: SOURCE_KEY,
      data_feed_key: DATA_FEED_KEY,
      endpoint_pattern: LOCKED_SOURCE_ENDPOINT_PATTERN,
      group_type: GROUP_TYPE
    },
    mode_design: {
      base_backfill: "enabled_for_bounded_self_continuing_stage_certify_promote_clean",
      delta_update: "enabled_as_certifying_repair_update_engine_after_locked_base_gate",
      default_base_backfill_cutoff_date: DEFAULT_BASE_BACKFILL_CUTOFF_DATE,
      delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
      cutoff_date_configurable_per_batch: true
    },
    continuation_design: {
      owner: "orchestrator_owned_backend_self_continuation",
      cron_role: "rescue_fallback_only",
      manual_wake_role: "optional_test_tick_only",
      browser_pump: false,
      one_active_run: true,
      cursor_persisted_every_tick: true,
      partial_continue_status: "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS",
      fast_bounded_ticks: true,
      max_requests_per_tick_default: DEFAULT_MAX_REQUESTS_PER_TICK,
      max_tick_runtime_ms_default: DEFAULT_MAX_TICK_RUNTIME_MS,
      no_live_promotion_before_certification: true
    },
    binding_summary: {
      db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
      vars: varPresence(env, EXPECTED_VARS),
      secrets_present_only: varPresence(env, EXPECTED_SECRETS)
    },
    ...extra
  };
}

async function parseJson(request) { try { return await request.json(); } catch (_) { return {}; } }

async function ensureSchema(env) {
  const db = env.STATS_HITTER_DB;
  const results = [];
  const exec = async (label, sql, ...binds) => {
    const r = await tryRun(db, sql, ...binds);
    results.push({ label, ok: r.ok, error: r.ok ? null : r.error });
    return r;
  };

  await exec("create_hitter_schema_migrations", `CREATE TABLE IF NOT EXISTS hitter_schema_migrations (
    migration_key TEXT PRIMARY KEY,
    package_version TEXT,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`);

  await exec("create_hitter_game_log_repair_registry", `CREATE TABLE IF NOT EXISTS hitter_game_log_repair_registry (
    registry_key TEXT PRIMARY KEY,
    target_batch_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    game_pk INTEGER NOT NULL,
    season INTEGER NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'hitting',
    game_date TEXT,
    source_endpoint TEXT,
    status TEXT,
    created_by_version TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await exec("idx_hitter_game_log_repair_registry_target", "CREATE INDEX IF NOT EXISTS idx_hitter_game_log_repair_registry_target ON hitter_game_log_repair_registry(target_batch_id, player_id, game_pk, group_type)");

  await exec("create_hitter_game_logs_stage", `CREATE TABLE IF NOT EXISTS hitter_game_logs_stage (
    stage_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    game_pk INTEGER,
    season INTEGER NOT NULL,
    game_date TEXT,
    team_id TEXT,
    opponent_team_id TEXT,
    is_home INTEGER,
    batting_order INTEGER,
    pa INTEGER,
    ab INTEGER,
    hits INTEGER,
    singles INTEGER,
    doubles INTEGER,
    triples INTEGER,
    home_runs INTEGER,
    runs INTEGER,
    rbi INTEGER,
    walks INTEGER,
    strikeouts INTEGER,
    stolen_bases INTEGER,
    total_bases INTEGER,
    group_type TEXT NOT NULL DEFAULT 'hitting',
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_endpoint TEXT NOT NULL,
    source_season INTEGER NOT NULL,
    source_game_type TEXT,
    ingestion_mode TEXT NOT NULL,
    certification_status TEXT DEFAULT 'staged_unverified',
    certification_grade TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_GAMELOG_HITTING',
    certified_at TEXT,
    promoted_at TEXT,
    raw_json TEXT,
    row_status TEXT DEFAULT 'staged',
    row_error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(batch_id, player_id, game_pk, group_type)
  )`);

  await exec("create_hitter_game_log_batches", `CREATE TABLE IF NOT EXISTS hitter_game_log_batches (
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
    cursor_player_id INTEGER,
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
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_GAMELOG_HITTING',
    locked_by TEXT,
    lock_acquired_at TEXT,
    lock_expires_at TEXT,
    stale_recovery_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    certified_at TEXT,
    promoted_at TEXT,
    cleaned_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`);

  await exec("create_hitter_game_log_cursor", `CREATE TABLE IF NOT EXISTS hitter_game_log_cursor (
    cursor_key TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    source_season INTEGER,
    base_backfill_cutoff_date TEXT,
    delta_start_date TEXT,
    current_player_id INTEGER,
    current_player_offset INTEGER DEFAULT 0,
    players_total INTEGER DEFAULT 0,
    players_processed INTEGER DEFAULT 0,
    requests_done INTEGER DEFAULT 0,
    next_run_after TEXT,
    last_error TEXT,
    cursor_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await exec("create_hitter_game_log_certifications", `CREATE TABLE IF NOT EXISTS hitter_game_log_certifications (
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);


  await exec("create_hitter_game_log_player_outcomes", `CREATE TABLE IF NOT EXISTS hitter_game_log_player_outcomes (
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (batch_id, player_id)
  )`);

  const liveAdds = [
    ["group_type", "TEXT DEFAULT 'hitting'"],
    ["data_feed_key", "TEXT"],
    ["source_endpoint", "TEXT"],
    ["source_season", "INTEGER"],
    ["source_game_type", "TEXT"],
    ["ingestion_mode", "TEXT"],
    ["batch_id", "TEXT"],
    ["run_id", "TEXT"],
    ["certification_status", "TEXT"],
    ["certification_grade", "TEXT"],
    ["certified_at", "TEXT"],
    ["promoted_at", "TEXT"],
    ["created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"]
  ];
  for (const [col, def] of liveAdds) {
    const r = await tryRun(db, `ALTER TABLE hitter_game_logs ADD COLUMN ${col} ${def}`);
    results.push({ label: `alter_hitter_game_logs_add_${col}`, ok: r.ok || /duplicate column name/i.test(r.error || ""), error: r.ok ? null : r.error });
  }

  const indexes = [
    ["idx_hitter_stage_batch", "CREATE INDEX IF NOT EXISTS idx_hitter_stage_batch ON hitter_game_logs_stage(batch_id, row_status)"],
    ["idx_hitter_stage_player_season", "CREATE INDEX IF NOT EXISTS idx_hitter_stage_player_season ON hitter_game_logs_stage(player_id, season, game_date)"],
    ["idx_hitter_stage_cert", "CREATE INDEX IF NOT EXISTS idx_hitter_stage_cert ON hitter_game_logs_stage(certification_status, batch_id)"],
    ["idx_hitter_batches_status", "CREATE INDEX IF NOT EXISTS idx_hitter_batches_status ON hitter_game_log_batches(status, mode, updated_at)"],
    ["idx_hitter_batches_lock", "CREATE INDEX IF NOT EXISTS idx_hitter_batches_lock ON hitter_game_log_batches(locked_by, lock_expires_at)"],
    ["idx_hitter_cursor_status", "CREATE INDEX IF NOT EXISTS idx_hitter_cursor_status ON hitter_game_log_cursor(status, mode, updated_at)"],
    ["idx_hitter_logs_identity", "CREATE INDEX IF NOT EXISTS idx_hitter_logs_identity ON hitter_game_logs(player_id, game_pk, group_type)"],
    ["idx_hitter_logs_batch", "CREATE INDEX IF NOT EXISTS idx_hitter_logs_batch ON hitter_game_logs(batch_id, certification_status)"],
    ["idx_hitter_logs_source", "CREATE INDEX IF NOT EXISTS idx_hitter_logs_source ON hitter_game_logs(source_key, source_season, game_date)"],
    ["idx_hitter_outcomes_batch_category", "CREATE INDEX IF NOT EXISTS idx_hitter_outcomes_batch_category ON hitter_game_log_player_outcomes(batch_id, terminal_category)"],
    ["idx_hitter_outcomes_player", "CREATE INDEX IF NOT EXISTS idx_hitter_outcomes_player ON hitter_game_log_player_outcomes(player_id, batch_id)"]
  ];
  for (const [label, sql] of indexes) await exec(label, sql);

  await exec("record_schema_migration", "INSERT OR REPLACE INTO hitter_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_hitter_game_logs_v1_6_0_delta_certifying_repair_engine', ?, CURRENT_TIMESTAMP, 'Base Hitter Game Logs v1.6.0: delta_update certifying repair engine with locked base integrity gate, stage-certify-promote-clean lifecycle, SQL-safe microchunks, no scoring/no board mutation')", VERSION);

  return { attempted: results.length, failed: results.filter(r => !r.ok).length, results };
}

async function schemaStatus(env) {
  const tables = await all(env.STATS_HITTER_DB, "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'hitter_game_log%' OR name='hitter_game_logs') ORDER BY name");
  const liveCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_logs)");
  const stageCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_logs_stage)");
  const batchCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_log_batches)");
  const cursorCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_log_cursor)");
  const outcomeCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_log_player_outcomes)");
  return {
    tables: tables.map(r => r.name),
    hitter_game_logs_columns: liveCols.map(r => r.name),
    hitter_game_logs_stage_columns: stageCols.map(r => r.name),
    hitter_game_log_batches_columns: batchCols.map(r => r.name),
    hitter_game_log_cursor_columns: cursorCols.map(r => r.name),
    hitter_game_log_player_outcomes_columns: outcomeCols.map(r => r.name)
  };
}

function endpointFor(env, playerId, season) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  return `${base}/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=hitting&season=${encodeURIComponent(season)}`;
}

function parseHitterSplit(split, playerId, playerName, season, batchId, runId, mode, endpoint, cutoffDate) {
  const stat = split && split.stat ? split.stat : {};
  const game = split && split.game ? split.game : {};
  const team = split && split.team ? split.team : {};
  const opponent = split && split.opponent ? split.opponent : {};
  const gamePk = asInt(game.gamePk || game.pk || split.gamePk, 0);
  const gameDate = asText(game.gameDate || split.date || split.gameDate);
  if (!gamePk || !gameDate) return null;
  if (cutoffDate && gameDate > cutoffDate) return null;
  const hits = asInt(stat.hits, 0);
  const doubles = asInt(stat.doubles, 0);
  const triples = asInt(stat.triples, 0);
  const homeRuns = asInt(stat.homeRuns, 0);
  return {
    stage_id: `${batchId}_${playerId}_${gamePk}_hitting`,
    batch_id: batchId,
    run_id: runId,
    player_id: asInt(playerId),
    player_name: playerName || null,
    game_pk: gamePk,
    season: asInt(season),
    game_date: gameDate,
    team_id: team && team.id !== undefined ? String(team.id) : null,
    opponent_team_id: opponent && opponent.id !== undefined ? String(opponent.id) : null,
    is_home: split && split.isHome !== undefined ? (split.isHome ? 1 : 0) : null,
    batting_order: split && split.battingOrder !== undefined ? asInt(split.battingOrder, null) : null,
    pa: stat.plateAppearances !== undefined ? asInt(stat.plateAppearances, null) : null,
    ab: stat.atBats !== undefined ? asInt(stat.atBats, null) : null,
    hits,
    singles: Math.max(0, hits - doubles - triples - homeRuns),
    doubles,
    triples,
    home_runs: homeRuns,
    runs: stat.runs !== undefined ? asInt(stat.runs, null) : null,
    rbi: stat.rbi !== undefined ? asInt(stat.rbi, null) : null,
    walks: stat.baseOnBalls !== undefined ? asInt(stat.baseOnBalls, null) : null,
    strikeouts: stat.strikeOuts !== undefined ? asInt(stat.strikeOuts, null) : null,
    stolen_bases: stat.stolenBases !== undefined ? asInt(stat.stolenBases, null) : null,
    total_bases: stat.totalBases !== undefined ? asInt(stat.totalBases, null) : null,
    group_type: GROUP_TYPE,
    data_feed_key: DATA_FEED_KEY,
    source_key: SOURCE_KEY,
    source_endpoint: endpoint,
    source_season: asInt(season),
    source_game_type: asText(split && split.gameType, null),
    ingestion_mode: mode,
    certification_status: "base_backfill_staged_unverified",
    certification_grade: null,
    source_confidence: "SOURCE_LOCKED_STATSAPI_GAMELOG_HITTING",
    raw_json: JSON.stringify(split)
  };
}

async function insertStageRow(env, row) {
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_logs_stage (
    stage_id,batch_id,run_id,player_id,player_name,game_pk,season,game_date,team_id,opponent_team_id,is_home,batting_order,
    pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
    group_type,data_feed_key,source_key,source_endpoint,source_season,source_game_type,ingestion_mode,certification_status,certification_grade,source_confidence,raw_json,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    row.stage_id,row.batch_id,row.run_id,row.player_id,row.player_name,row.game_pk,row.season,row.game_date,row.team_id,row.opponent_team_id,row.is_home,row.batting_order,
    row.pa,row.ab,row.hits,row.singles,row.doubles,row.triples,row.home_runs,row.runs,row.rbi,row.walks,row.strikeouts,row.stolen_bases,row.total_bases,
    row.group_type,row.data_feed_key,row.source_key,row.source_endpoint,row.source_season,row.source_game_type,row.ingestion_mode,row.certification_status,row.certification_grade,row.source_confidence,row.raw_json
  );
}

async function chooseAllHitterPlayers(env, inputJson) {
  const explicit = inputJson && Array.isArray(inputJson.player_ids) ? inputJson.player_ids.map(x => asInt(x, 0)).filter(Boolean) : [];
  if (explicit.length) {
    return explicit.map(player_id => ({ player_id, player_name: null, primary_position: null, source: "input_json.player_ids" }));
  }

  const hitterPositions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"];
  const placeholders = hitterPositions.map(() => "?").join(",");
  let rows = await all(env.REF_DB, `
    SELECT
      COALESCE(mlb_player_id, player_id) AS player_id,
      COALESCE(full_name, player_name) AS player_name,
      primary_position,
      current_team_id
    FROM ref_players
    WHERE COALESCE(active,1)=1
      AND COALESCE(mlb_player_id, player_id) IS NOT NULL
      AND UPPER(COALESCE(primary_position, primary_role, '')) IN (${placeholders})
    ORDER BY current_team_id IS NULL, current_team_id, player_name`, ...hitterPositions);

  if (!rows.length) {
    rows = await all(env.REF_DB, `
      SELECT
        COALESCE(mlb_player_id, player_id) AS player_id,
        COALESCE(full_name, player_name) AS player_name,
        primary_position,
        current_team_id
      FROM ref_players
      WHERE COALESCE(active,1)=1
        AND COALESCE(mlb_player_id, player_id) IS NOT NULL
        AND UPPER(COALESCE(primary_position, primary_role, '')) NOT IN ('P', 'SP', 'RP', 'LHP', 'RHP', 'PITCHER')
      ORDER BY current_team_id IS NULL, current_team_id, player_name`);
  }

  return rows.map(r => ({
    player_id: asInt(r.player_id, 0),
    player_name: r.player_name || null,
    primary_position: r.primary_position || null,
    source: "REF_DB.ref_players_hitter_position_filter"
  })).filter(r => r.player_id);
}

async function getOrCreateBaseBackfillState(env, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const existing = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_game_log_cursor WHERE cursor_key=? AND mode='base_backfill' AND status IN ('BASE_BACKFILL_RUNNING','PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS','BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION','BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE','BASE_BACKFILL_PROMOTING','BASE_BACKFILL_PROMOTED_READY_TO_CLEAN','BASE_BACKFILL_CLEANING','CERTIFICATION_FAILED','COMPLETED_PROMOTED_CLEANED')`, ACTIVE_CURSOR_KEY);
  if (existing) {
    const batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", existing.batch_id);
    let players = [];
    try { players = JSON.parse(existing.cursor_json || "{}").players || []; } catch (_) { players = []; }
    if (batch && players.length) return { is_new: false, cursor: existing, batch, players, input_json: inputJson };
  }

  const runId = asText(input.run_id, rid("run_base_hitter_backfill"));
  const batchId = asText(inputJson.batch_id, rid("hitter_base_backfill_batch"));
  const cutoffDate = asText(inputJson.base_backfill_cutoff_date, DEFAULT_BASE_BACKFILL_CUTOFF_DATE);
  const sourceSeason = asInt(inputJson.source_season || env.ACTIVE_SEASON, DEFAULT_SOURCE_SEASON);
  const chunkSize = cap(inputJson.chunk_size_players || inputJson.max_requests_per_tick || env.MAX_API_CALLS_PER_TICK || DEFAULT_CHUNK_SIZE_PLAYERS, 1, DEFAULT_CHUNK_SIZE_PLAYERS);
  const maxRequests = cap(inputJson.max_requests_per_tick || env.MAX_API_CALLS_PER_TICK || DEFAULT_MAX_REQUESTS_PER_TICK, 1, DEFAULT_MAX_REQUESTS_PER_TICK);
  const maxRows = cap(inputJson.max_rows_per_tick || env.MAX_ROWS_PER_TICK || DEFAULT_MAX_ROWS_PER_TICK, 100, DEFAULT_MAX_ROWS_PER_TICK);
  const players = await chooseAllHitterPlayers(env, inputJson);

  await run(env.STATS_HITTER_DB, "DELETE FROM hitter_game_logs_stage WHERE batch_id LIKE 'hitter_base_probe_batch_%' OR certification_status='source_shape_probe_staged'");
  await run(env.STATS_HITTER_DB, "DELETE FROM hitter_game_logs_stage WHERE batch_id=?", batchId);

  const cursorJson = JSON.stringify({
    version: VERSION,
    mode: "base_backfill",
    players,
    player_source: players.length ? players[0].source : "none",
    source_season: sourceSeason,
    base_backfill_cutoff_date: cutoffDate,
    delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
    full_lifecycle: "stage_certify_promote_clean",
    no_browser_pump: true,
    backend_self_continuation_required: true
  });

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_batches (
    batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_endpoint, source_season,
    base_backfill_cutoff_date, delta_start_date, cursor_player_id, cursor_season, cursor_offset, cursor_state_json,
    chunk_size_players, max_requests_per_tick, max_rows_per_tick, certification_status, source_confidence, notes, updated_at
  ) VALUES (?, ?, ?, ?, 'base_backfill', 'BASE_BACKFILL_RUNNING', ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?, ?, ?, 'not_certified', 'SOURCE_LOCKED_STATSAPI_GAMELOG_HITTING', ?, CURRENT_TIMESTAMP)`,
    batchId, runId, WORKER_NAME, VERSION, DATA_FEED_KEY, SOURCE_KEY, LOCKED_SOURCE_ENDPOINT_PATTERN, sourceSeason,
    cutoffDate, DEFAULT_DELTA_RESERVED_START_DATE, sourceSeason, cursorJson, chunkSize, maxRequests, maxRows,
    "v0.2.8 finalization microphases. Base fills only through 2026-05-18, then certifies/promotes/cleans in D1-safe microticks. Delta remains blocked until every cursor player has one certified terminal category. No scoring/ranking/board mutation."
  );

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor (
    cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_id,current_player_offset,
    players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at
  ) VALUES (?, ?, ?, 'base_backfill', 'BASE_BACKFILL_RUNNING', ?, ?, ?, NULL, 0, ?, 0, 0, CURRENT_TIMESTAMP, NULL, ?, CURRENT_TIMESTAMP)`,
    ACTIVE_CURSOR_KEY, batchId, runId, sourceSeason, cutoffDate, DEFAULT_DELTA_RESERVED_START_DATE, players.length, cursorJson
  );

  const cursor = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_cursor WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
  const batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  return { is_new: true, cursor, batch, players, input_json: inputJson };
}

function parseSqliteUtcMs(value) {
  if (!value) return NaN;
  return new Date(String(value).replace(" ", "T") + "Z").getTime();
}

async function acquireBatchLock(env, batchId, owner, staleSeconds) {
  const row = await first(env.STATS_HITTER_DB, "SELECT locked_by, lock_acquired_at, lock_expires_at FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  const nowMs = Date.now();
  const lockedBy = row && row.locked_by ? String(row.locked_by) : null;
  const lockAcquiredMs = row && row.lock_acquired_at ? parseSqliteUtcMs(row.lock_acquired_at) : NaN;
  const lockExpiresMs = row && row.lock_expires_at ? parseSqliteUtcMs(row.lock_expires_at) : NaN;
  const sameOwner = !!(lockedBy && lockedBy === owner);
  const expired = !Number.isFinite(lockExpiresMs) || lockExpiresMs <= nowMs;
  const staleByAge = Number.isFinite(lockAcquiredMs) && (nowMs - lockAcquiredMs >= staleSeconds * 1000);

  if (lockedBy && !expired && !(sameOwner && staleByAge)) {
    return {
      ok: false,
      reason: sameOwner ? "same_owner_lock_not_stale_yet" : "batch_lock_busy",
      locked_by: lockedBy,
      lock_acquired_at: row.lock_acquired_at || null,
      lock_expires_at: row.lock_expires_at || null,
      same_owner: sameOwner,
      stale_seconds: staleSeconds,
      retry_after_seconds: sameOwner ? 20 : Math.max(15, Math.min(90, Math.ceil((lockExpiresMs - nowMs) / 1000)))
    };
  }

  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET locked_by=?, lock_acquired_at=CURRENT_TIMESTAMP, lock_expires_at=datetime('now', ?), stale_recovery_count=CASE WHEN locked_by IS NOT NULL THEN COALESCE(stale_recovery_count,0)+1 ELSE COALESCE(stale_recovery_count,0) END, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", owner, `+${staleSeconds} seconds`, batchId);
  return {
    ok: true,
    owner,
    stale_seconds: staleSeconds,
    recovered_previous_lock: !!lockedBy,
    recovered_same_owner_lock: !!(lockedBy && sameOwner),
    previous_locked_by: lockedBy,
    previous_lock_acquired_at: row && row.lock_acquired_at ? row.lock_acquired_at : null,
    previous_lock_expires_at: row && row.lock_expires_at ? row.lock_expires_at : null
  };
}

async function releaseBatchLock(env, batchId, owner) {
  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND locked_by=?", batchId, owner);
}

async function fetchTextWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), Math.max(1000, Number(timeoutMs || DEFAULT_FETCH_TIMEOUT_MS)));
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    const text = await resp.text();
    return { ok: true, resp, text, timed_out: false };
  } catch (err) {
    return { ok: false, resp: null, text: "", timed_out: String(err && err.name ? err.name : err).includes("Abort") || String(err).includes("timeout"), error: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

function splitGameDate(split) {
  const game = split && split.game ? split.game : {};
  return asText(game.gameDate || split.date || split.gameDate, null);
}

function classifyPlayerOutcome(result) {
  if (!result || result.status === "source_error") return "SOURCE_ERROR";
  if (asInt(result.raw_payload_split_count, 0) === 0) return "TRUE_NO_DATA";
  if (asInt(result.rows_staged, 0) > 0) return "PROMOTED_ROWS";
  if (asInt(result.rows_filtered_after_cutoff, 0) > 0 && asInt(result.rows_before_cutoff, 0) === 0) return "FILTERED_AFTER_CUTOFF";
  return "REPAIR_REQUIRED";
}

function outcomeReason(result, category) {
  if (category === "PROMOTED_ROWS") return "Source returned regular-season hitting rows within the base cutoff and rows were staged for promotion.";
  if (category === "TRUE_NO_DATA") return "MLB StatsAPI returned zero hitting game-log splits for this player and season.";
  if (category === "FILTERED_AFTER_CUTOFF") return "MLB StatsAPI returned hitting game-log splits, but every split was after the base cutoff date and belongs to delta.";
  if (category === "SOURCE_ERROR") return result && result.error_type ? `Source request failed: ${result.error_type}` : "Source request failed.";
  return "Source returned data but no rows were staged inside the base cutoff; transformation/cutoff parsing must be repaired before delta opens.";
}

async function upsertPlayerOutcome(env, batchId, runId, p, cursorOffset, result, endpoint) {
  const category = classifyPlayerOutcome(result);
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_player_outcomes (
    batch_id,run_id,player_id,player_name,primary_position,cursor_offset,source_endpoint,source_http_status,source_ok,
    raw_payload_split_count,rows_before_cutoff,rows_filtered_after_cutoff,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,
    first_raw_game_date,last_raw_game_date,first_promoted_game_date,last_promoted_game_date,certification_status,certification_grade,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    batchId,
    runId,
    asInt(p && p.player_id, 0),
    asText((p && p.player_name) || (result && result.player_name), null),
    asText(p && p.primary_position, null),
    asInt(cursorOffset, 0),
    endpoint || (result && result.source_endpoint) || null,
    result && result.http_status !== undefined ? asInt(result.http_status, null) : null,
    category === "SOURCE_ERROR" ? 0 : 1,
    asInt(result && result.raw_payload_split_count, 0),
    asInt(result && result.rows_before_cutoff, 0),
    asInt(result && result.rows_filtered_after_cutoff, 0),
    asInt(result && result.rows_staged, 0),
    0,
    category,
    outcomeReason(result, category),
    result && result.error ? String(result.error).slice(0, 900) : null,
    result && result.first_raw_game_date ? result.first_raw_game_date : null,
    result && result.last_raw_game_date ? result.last_raw_game_date : null,
    result && result.first_promoted_game_date ? result.first_promoted_game_date : null,
    result && result.last_promoted_game_date ? result.last_promoted_game_date : null,
    "player_outcome_unverified",
    null
  );
  return category;
}

async function rebuildMissingOutcomeRowsFromCursor(env, batchId, runId) {
  const cursor = await first(env.STATS_HITTER_DB, "SELECT cursor_json FROM hitter_game_log_cursor WHERE batch_id=? OR cursor_key=? ORDER BY updated_at DESC LIMIT 1", batchId, ACTIVE_CURSOR_KEY);
  let players = [];
  try { players = JSON.parse((cursor && cursor.cursor_json) || "{}").players || []; } catch (_) { players = []; }
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const existing = await first(env.STATS_HITTER_DB, "SELECT player_id FROM hitter_game_log_player_outcomes WHERE batch_id=? AND player_id=?", batchId, asInt(p.player_id, 0));
    if (existing) continue;
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_player_outcomes (
      batch_id,run_id,player_id,player_name,primary_position,cursor_offset,source_ok,raw_payload_split_count,rows_before_cutoff,rows_filtered_after_cutoff,rows_staged,promoted_row_count,terminal_category,category_reason,certification_status,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      batchId, runId, asInt(p.player_id, 0), asText(p.player_name, null), asText(p.primary_position, null), i, 0, 0, 0, 0, 0, 0, "UNCLEAR",
      "Player existed in cursor but no per-player source outcome was recorded; rerun/repair required before delta.", "player_outcome_unverified"
    );
  }
}

async function certifyPlayerOutcomeUniverse(env, batchId, runId, cutoffDate) {
  await rebuildMissingOutcomeRowsFromCursor(env, batchId, runId);

  const cursorRow = await first(env.STATS_HITTER_DB, "SELECT players_total FROM hitter_game_log_cursor WHERE batch_id=? OR cursor_key=? ORDER BY updated_at DESC LIMIT 1", batchId, ACTIVE_CURSOR_KEY);
  const playersTotal = asInt(cursorRow && cursorRow.players_total, 0);
  const totals = await first(env.STATS_HITTER_DB, `SELECT
      COUNT(*) AS outcome_total,
      COUNT(DISTINCT player_id) AS distinct_outcome_players,
      COUNT(*) - COUNT(DISTINCT player_id) AS duplicate_outcome_rows,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END) AS promoted_players,
      SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END) AS true_no_data_players,
      SUM(CASE WHEN terminal_category='FILTERED_AFTER_CUTOFF' THEN 1 ELSE 0 END) AS filtered_after_cutoff_players,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END) AS source_error_players,
      SUM(CASE WHEN terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END) AS repair_required_players,
      SUM(CASE WHEN terminal_category='UNCLEAR' THEN 1 ELSE 0 END) AS unclear_players,
      SUM(CASE WHEN terminal_category NOT IN ('PROMOTED_ROWS','TRUE_NO_DATA','FILTERED_AFTER_CUTOFF','SOURCE_ERROR','REPAIR_REQUIRED','UNCLEAR') THEN 1 ELSE 0 END) AS invalid_category_players,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' AND COALESCE(rows_staged,0) <= 0 AND COALESCE(promoted_row_count,0) <= 0 THEN 1 ELSE 0 END) AS promoted_without_rows,
      SUM(CASE WHEN terminal_category!='PROMOTED_ROWS' AND (COALESCE(rows_staged,0) > 0 OR COALESCE(promoted_row_count,0) > 0) THEN 1 ELSE 0 END) AS non_promoted_with_rows,
      SUM(COALESCE(raw_payload_split_count,0)) AS raw_payload_split_count,
      SUM(COALESCE(rows_before_cutoff,0)) AS rows_before_cutoff,
      SUM(COALESCE(rows_filtered_after_cutoff,0)) AS rows_filtered_after_cutoff,
      SUM(COALESCE(rows_staged,0)) AS rows_staged,
      SUM(COALESCE(promoted_row_count,0)) AS promoted_row_count
    FROM hitter_game_log_player_outcomes
    WHERE batch_id=?`, batchId);

  const categoryTotal = asInt(totals && totals.promoted_players, 0)
    + asInt(totals && totals.true_no_data_players, 0)
    + asInt(totals && totals.filtered_after_cutoff_players, 0)
    + asInt(totals && totals.source_error_players, 0)
    + asInt(totals && totals.repair_required_players, 0)
    + asInt(totals && totals.unclear_players, 0);
  const pass = playersTotal > 0
    && asInt(totals && totals.outcome_total, 0) === playersTotal
    && asInt(totals && totals.distinct_outcome_players, 0) === playersTotal
    && asInt(totals && totals.duplicate_outcome_rows, 0) === 0
    && categoryTotal === playersTotal
    && asInt(totals && totals.source_error_players, 0) === 0
    && asInt(totals && totals.repair_required_players, 0) === 0
    && asInt(totals && totals.unclear_players, 0) === 0
    && asInt(totals && totals.invalid_category_players, 0) === 0
    && asInt(totals && totals.promoted_without_rows, 0) === 0
    && asInt(totals && totals.non_promoted_with_rows, 0) === 0;

  const summary = {
    version: VERSION,
    batch_id: batchId,
    run_id: runId,
    cutoff_date: cutoffDate,
    players_total: playersTotal,
    outcome_total: asInt(totals && totals.outcome_total, 0),
    distinct_outcome_players: asInt(totals && totals.distinct_outcome_players, 0),
    duplicate_outcome_rows: asInt(totals && totals.duplicate_outcome_rows, 0),
    category_total: categoryTotal,
    promoted_players: asInt(totals && totals.promoted_players, 0),
    true_no_data_players: asInt(totals && totals.true_no_data_players, 0),
    filtered_after_cutoff_players: asInt(totals && totals.filtered_after_cutoff_players, 0),
    source_error_players: asInt(totals && totals.source_error_players, 0),
    repair_required_players: asInt(totals && totals.repair_required_players, 0),
    unclear_players: asInt(totals && totals.unclear_players, 0),
    invalid_category_players: asInt(totals && totals.invalid_category_players, 0),
    promoted_without_rows: asInt(totals && totals.promoted_without_rows, 0),
    non_promoted_with_rows: asInt(totals && totals.non_promoted_with_rows, 0),
    raw_payload_split_count: asInt(totals && totals.raw_payload_split_count, 0),
    rows_before_cutoff: asInt(totals && totals.rows_before_cutoff, 0),
    rows_filtered_after_cutoff: asInt(totals && totals.rows_filtered_after_cutoff, 0),
    rows_staged: asInt(totals && totals.rows_staged, 0),
    promoted_row_count: asInt(totals && totals.promoted_row_count, 0),
    pass,
    delta_gate_open: pass
  };

  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_player_outcomes SET certification_status=?, certification_grade=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
    pass ? "player_outcome_certified" : "player_outcome_certification_failed", pass ? "BASE_PASS" : "BASE_FAIL", batchId);

  return summary;
}


async function deriveSourceCountersFromOutcomes(env, batchId) {
  const row = await first(env.STATS_HITTER_DB, `SELECT
      COUNT(*) AS outcome_total,
      COUNT(DISTINCT player_id) AS distinct_outcome_players,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END) AS promoted_players,
      SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END) AS true_no_data_players,
      SUM(CASE WHEN terminal_category='FILTERED_AFTER_CUTOFF' THEN 1 ELSE 0 END) AS filtered_after_cutoff_players,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END) AS source_error_players,
      SUM(CASE WHEN terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END) AS repair_required_players,
      SUM(CASE WHEN terminal_category='UNCLEAR' THEN 1 ELSE 0 END) AS unclear_players
    FROM hitter_game_log_player_outcomes
    WHERE batch_id=?`, batchId);
  const promotedPlayers = asInt(row && row.promoted_players, 0);
  const trueNoDataPlayers = asInt(row && row.true_no_data_players, 0);
  const filteredAfterCutoffPlayers = asInt(row && row.filtered_after_cutoff_players, 0);
  const sourceErrorPlayers = asInt(row && row.source_error_players, 0);
  const repairRequiredPlayers = asInt(row && row.repair_required_players, 0);
  const unclearPlayers = asInt(row && row.unclear_players, 0);
  const outcomeTotal = asInt(row && row.outcome_total, 0);
  const distinctOutcomePlayers = asInt(row && row.distinct_outcome_players, 0);
  return {
    outcome_total: outcomeTotal,
    distinct_outcome_players: distinctOutcomePlayers,
    promoted_players: promotedPlayers,
    true_no_data_players: trueNoDataPlayers,
    filtered_after_cutoff_players: filteredAfterCutoffPlayers,
    source_error_players: sourceErrorPlayers,
    repair_required_players: repairRequiredPlayers,
    unclear_players: unclearPlayers,
    source_request_count: outcomeTotal,
    source_success_count: promotedPlayers + filteredAfterCutoffPlayers,
    source_no_data_count: trueNoDataPlayers,
    source_error_count: sourceErrorPlayers,
    source_success_definition: "PROMOTED_ROWS + FILTERED_AFTER_CUTOFF; both are successful 200/source payload terminal outcomes. TRUE_NO_DATA is a terminal empty source outcome, not success."
  };
}

async function freezeSourceCountersFromOutcomes(env, batchId) {
  const c = await deriveSourceCountersFromOutcomes(env, batchId);
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches
    SET source_request_count=?,
        source_success_count=?,
        source_no_data_count=?,
        source_error_count=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`,
    c.source_request_count,
    c.source_success_count,
    c.source_no_data_count,
    c.source_error_count,
    batchId
  );
  return c;
}

async function syncOutcomePromotedCountsFromLive(env, batchId) {
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_player_outcomes
    SET promoted_row_count=(
          SELECT COUNT(*)
          FROM hitter_game_logs h
          WHERE h.batch_id=hitter_game_log_player_outcomes.batch_id
            AND h.player_id=hitter_game_log_player_outcomes.player_id
            AND h.certification_status='base_backfill_certified_promoted'
        ),
        first_promoted_game_date=(
          SELECT MIN(game_date)
          FROM hitter_game_logs h
          WHERE h.batch_id=hitter_game_log_player_outcomes.batch_id
            AND h.player_id=hitter_game_log_player_outcomes.player_id
            AND h.certification_status='base_backfill_certified_promoted'
        ),
        last_promoted_game_date=(
          SELECT MAX(game_date)
          FROM hitter_game_logs h
          WHERE h.batch_id=hitter_game_log_player_outcomes.batch_id
            AND h.player_id=hitter_game_log_player_outcomes.player_id
            AND h.certification_status='base_backfill_certified_promoted'
        ),
        updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=? AND terminal_category='PROMOTED_ROWS'`, batchId);
}

async function isFinalizationOnlyReady(env, batchId, expectedPlayers) {
  const row = await first(env.STATS_HITTER_DB, `SELECT
      b.status,
      b.cursor_offset,
      c.current_player_offset,
      c.players_total,
      COUNT(o.player_id) AS outcome_total,
      COUNT(DISTINCT o.player_id) AS distinct_outcome_players,
      SUM(CASE WHEN o.terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END) AS source_error_players,
      SUM(CASE WHEN o.terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END) AS repair_required_players,
      SUM(CASE WHEN o.terminal_category='UNCLEAR' THEN 1 ELSE 0 END) AS unclear_players,
      (SELECT COUNT(*) FROM hitter_game_logs_stage s WHERE s.batch_id=b.batch_id) AS stage_rows,
      (SELECT COUNT(*) FROM hitter_game_logs h WHERE h.batch_id=b.batch_id AND h.certification_status='base_backfill_certified_promoted') AS live_rows
    FROM hitter_game_log_batches b
    LEFT JOIN hitter_game_log_cursor c ON c.batch_id=b.batch_id
    LEFT JOIN hitter_game_log_player_outcomes o ON o.batch_id=b.batch_id
    WHERE b.batch_id=?
    GROUP BY b.batch_id`, batchId);
  const total = asInt((row && row.players_total) || expectedPlayers, 0);
  const cursorDone = total > 0 && asInt(row && row.cursor_offset, 0) >= total && asInt(row && row.current_player_offset, 0) >= total;
  const outcomesDone = total > 0 && asInt(row && row.outcome_total, 0) === total && asInt(row && row.distinct_outcome_players, 0) === total;
  const unresolved = asInt(row && row.source_error_players, 0) + asInt(row && row.repair_required_players, 0) + asInt(row && row.unclear_players, 0);
  const status = String((row && row.status) || "");
  return {
    ready: (cursorDone && outcomesDone && unresolved === 0) || FINALIZATION_STATUSES.has(status),
    status,
    players_total: total,
    cursor_done: cursorDone,
    outcomes_done: outcomesDone,
    unresolved_players: unresolved,
    outcome_total: asInt(row && row.outcome_total, 0),
    stage_rows: asInt(row && row.stage_rows, 0),
    live_rows: asInt(row && row.live_rows, 0)
  };
}

async function processPlayer(env, p, sourceSeason, batchId, runId, cutoffDate, maxRowsRemaining, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const endpoint = endpointFor(env, p.player_id, sourceSeason);
  const fetched = await fetchTextWithTimeout(endpoint, {
    method: "GET",
    headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/1.5.28") }
  }, fetchTimeoutMs);
  if (!fetched.ok) {
    return {
      player_id: p.player_id,
      player_name: p.player_name,
      status: "source_error",
      error_type: fetched.timed_out ? "fetch_timeout" : "fetch_exception",
      error: fetched.error,
      rows_staged: 0,
      raw_payload_split_count: 0,
      rows_before_cutoff: 0,
      rows_filtered_after_cutoff: 0,
      source_endpoint: endpoint,
      retry_same_player: true
    };
  }
  const resp = fetched.resp;
  const text = fetched.text || "";
  if (!resp.ok) return {
    player_id: p.player_id,
    player_name: p.player_name,
    status: "source_error",
    error_type: "http_error",
    http_status: resp.status,
    rows_staged: 0,
    raw_payload_split_count: 0,
    rows_before_cutoff: 0,
    rows_filtered_after_cutoff: 0,
    source_endpoint: endpoint,
    preview: text.slice(0, 240),
    retry_same_player: true
  };
  let body;
  try { body = JSON.parse(text); }
  catch (err) { return {
    player_id: p.player_id,
    player_name: p.player_name,
    status: "source_error",
    error_type: "json_parse_error",
    error: String(err && err.message ? err.message : err),
    rows_staged: 0,
    raw_payload_split_count: 0,
    rows_before_cutoff: 0,
    rows_filtered_after_cutoff: 0,
    source_endpoint: endpoint,
    retry_same_player: true
  }; }

  const splits = body && body.stats && body.stats[0] && Array.isArray(body.stats[0].splits) ? body.stats[0].splits : [];
  const rawDates = splits.map(splitGameDate).filter(Boolean).sort();
  const rawSplitCount = splits.length;
  if (!rawSplitCount) return {
    player_id: p.player_id,
    player_name: p.player_name,
    status: "no_data",
    http_status: resp.status,
    split_count: 0,
    raw_payload_split_count: 0,
    rows_before_cutoff: 0,
    rows_filtered_after_cutoff: 0,
    rows_staged: 0,
    source_endpoint: endpoint
  };

  let inserted = 0;
  let beforeCutoff = 0;
  let filteredAfterCutoff = 0;
  let invalidBeforeCutoff = 0;
  for (const split of splits) {
    if (inserted >= maxRowsRemaining) break;
    const gameDate = splitGameDate(split);
    if (cutoffDate && gameDate && gameDate > cutoffDate) {
      filteredAfterCutoff++;
      continue;
    }
    beforeCutoff++;
    const row = parseHitterSplit(split, p.player_id, p.player_name, sourceSeason, batchId, runId, "base_backfill", endpoint, cutoffDate);
    if (!row) {
      invalidBeforeCutoff++;
      continue;
    }
    await insertStageRow(env, row);
    stagedDates.push(row.game_date);
    inserted++;
  }

  let status = "success";
  if (inserted <= 0 && filteredAfterCutoff > 0 && beforeCutoff === 0) status = "filtered_after_cutoff";
  else if (inserted <= 0) status = "repair_required";

  return {
    player_id: p.player_id,
    player_name: p.player_name,
    status,
    http_status: resp.status,
    split_count: rawSplitCount,
    raw_payload_split_count: rawSplitCount,
    rows_before_cutoff: beforeCutoff,
    rows_filtered_after_cutoff: filteredAfterCutoff,
    invalid_before_cutoff_rows: invalidBeforeCutoff,
    rows_staged: inserted,
    source_endpoint: endpoint,
    first_raw_game_date: rawDates[0] || null,
    last_raw_game_date: rawDates[rawDates.length - 1] || null,
    first_promoted_game_date: stagedDates[0] || null,
    last_promoted_game_date: stagedDates[stagedDates.length - 1] || null
  };
}

async function promoteStageRowsChunk(env, batchId, grade, limit) {
  const safeLimit = cap(limit || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 25);
  const rows = await all(env.STATS_HITTER_DB, `SELECT
      s.stage_id,
      s.player_id,s.game_pk,s.season,s.game_date,s.team_id,s.opponent_team_id,s.is_home,s.batting_order,
      s.pa,s.ab,s.hits,s.singles,s.doubles,s.triples,s.home_runs,s.runs,s.rbi,s.walks,s.strikeouts,s.stolen_bases,s.total_bases,
      s.raw_json,s.source_key,s.source_confidence,s.group_type,s.data_feed_key,s.source_endpoint,s.source_season,s.source_game_type,s.ingestion_mode,s.batch_id,s.run_id
    FROM hitter_game_logs_stage s
    WHERE s.batch_id=?
      AND NOT EXISTS (
        SELECT 1
        FROM hitter_game_logs h
        WHERE h.batch_id=s.batch_id
          AND h.player_id=s.player_id
          AND h.game_pk=s.game_pk
          AND h.group_type=s.group_type
      )
    ORDER BY s.stage_id
    LIMIT ${safeLimit}`, batchId);

  if (!rows.length) {
    const remainingNone = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c
      FROM hitter_game_logs_stage s
      WHERE s.batch_id=?
        AND NOT EXISTS (
          SELECT 1
          FROM hitter_game_logs h
          WHERE h.batch_id=s.batch_id
            AND h.player_id=s.player_id
            AND h.game_pk=s.game_pk
            AND h.group_type=s.group_type
        )`, batchId);
    return { promoted_this_tick: 0, remaining_unpromoted: asInt(remainingNone && remainingNone.c, 0), sql_variable_safe: true, promote_limit: safeLimit, insert_mode: "single_row_column_aligned_variable_clamp" };
  }

  let promotedThisTick = 0;
  for (const r of rows) {
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_logs (
      player_id,game_pk,season,game_date,team_id,opponent_team_id,is_home,batting_order,
      pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
      raw_json,source_key,source_confidence,updated_at,group_type,data_feed_key,source_endpoint,source_season,source_game_type,ingestion_mode,batch_id,run_id,certification_status,certification_grade,certified_at,promoted_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      r.player_id, r.game_pk, r.season, r.game_date, r.team_id, r.opponent_team_id, r.is_home, r.batting_order,
      r.pa, r.ab, r.hits, r.singles, r.doubles, r.triples, r.home_runs, r.runs, r.rbi, r.walks, r.strikeouts, r.stolen_bases, r.total_bases,
      r.raw_json, r.source_key, r.source_confidence, r.group_type, r.data_feed_key, r.source_endpoint, r.source_season, r.source_game_type, r.ingestion_mode, r.batch_id, r.run_id, r.ingestion_mode === 'delta_update' ? 'delta_update_certified_promoted' : 'base_backfill_certified_promoted', grade
    );
    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_logs_stage
      SET row_status='promoted', certification_status='base_backfill_certified', certification_grade=?, promoted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE stage_id=? AND batch_id=?`, grade, r.stage_id, batchId);
    promotedThisTick += 1;
  }

  const remaining = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c
    FROM hitter_game_logs_stage s
    WHERE s.batch_id=?
      AND NOT EXISTS (
        SELECT 1
        FROM hitter_game_logs h
        WHERE h.batch_id=s.batch_id
          AND h.player_id=s.player_id
          AND h.game_pk=s.game_pk
          AND h.group_type=s.group_type
      )`, batchId);
  return { promoted_this_tick: promotedThisTick, remaining_unpromoted: asInt(remaining && remaining.c, 0), sql_variable_safe: true, promote_limit: safeLimit, insert_mode: "single_row_column_aligned_variable_clamp", max_bound_variables_per_insert: 34 };
}

async function cleanStageRowsChunk(env, batchId, limit) {
  // v1.5.31: cleanup must be autonomous and D1-safe.
  // No full COUNT after every chunk, no stage_id VALUES list, no browser/manual ticking architecture.
  // Delete a bounded batch using rowid selected inside SQLite, then infer continuation from changes.
  const safeLimit = cap(limit || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 500);
  const res = await run(env.STATS_HITTER_DB, `DELETE FROM hitter_game_logs_stage
    WHERE rowid IN (
      SELECT rowid
      FROM hitter_game_logs_stage
      WHERE batch_id=?
      LIMIT ${safeLimit}
    )`, batchId);
  const rawChanges = res && res.meta && Number.isFinite(Number(res.meta.changes)) ? Number(res.meta.changes) : null;
  const cleaned = rawChanges === null ? 0 : Math.max(0, Math.trunc(rawChanges));
  const probablyDone = rawChanges !== null && cleaned < safeLimit;
  return {
    cleaned_this_tick: cleaned,
    stage_rows_after_clean: probablyDone ? 0 : null,
    cleanup_done: probablyDone,
    sql_variable_safe: true,
    clean_limit: safeLimit,
    delete_mode: "rowid_subquery_limit_no_count",
    bound_variables: 1,
    no_full_stage_count_after_chunk: true
  };
}

async function buildPrePromotionChecks(env, batchId, runId, cutoffDate) {
  const summary = await first(env.STATS_HITTER_DB, `SELECT
      COUNT(*) AS rows_staged,
      COUNT(DISTINCT player_id) AS distinct_players,
      COUNT(DISTINCT game_pk) AS distinct_games,
      MIN(game_date) AS min_game_date,
      MAX(game_date) AS max_game_date,
      SUM(CASE WHEN player_id IS NULL OR game_pk IS NULL OR season IS NULL OR game_date IS NULL OR source_key IS NULL OR source_endpoint IS NULL THEN 1 ELSE 0 END) AS missing_required,
      SUM(CASE WHEN group_type!='hitting' THEN 1 ELSE 0 END) AS non_hitting_rows,
      SUM(CASE WHEN game_date > ? THEN 1 ELSE 0 END) AS after_cutoff_rows,
      SUM(CASE WHEN hits < 0 OR doubles < 0 OR triples < 0 OR home_runs < 0 OR singles < 0 OR total_bases < 0 OR ab < 0 OR pa < 0 OR hits > ab OR singles != hits - doubles - triples - home_runs OR total_bases != singles + (2*doubles) + (3*triples) + (4*home_runs) THEN 1 ELSE 0 END) AS bad_math_rows
    FROM hitter_game_logs_stage WHERE batch_id=?`, cutoffDate, batchId);

  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS duplicate_count FROM (
      SELECT player_id, game_pk, group_type, COUNT(*) AS c
      FROM hitter_game_logs_stage
      WHERE batch_id=?
      GROUP BY player_id, game_pk, group_type
      HAVING COUNT(*) > 1
    )`, batchId);

  const outcomeSummary = await certifyPlayerOutcomeUniverse(env, batchId, runId, cutoffDate);
  const sourceTruth = await freezeSourceCountersFromOutcomes(env, batchId);
  const rowsStaged = asInt(summary && summary.rows_staged, 0);
  const duplicateCount = asInt(dup && dup.duplicate_count, 0);
  const sourceErrors = asInt(sourceTruth && sourceTruth.source_error_count, 0);
  const sourceSuccess = asInt(sourceTruth && sourceTruth.source_success_count, 0);
  const sourceNoData = asInt(sourceTruth && sourceTruth.source_no_data_count, 0);
  const sourceRequests = asInt(sourceTruth && sourceTruth.source_request_count, 0);
  const missingRequired = asInt(summary && summary.missing_required, 0);
  const nonHittingRows = asInt(summary && summary.non_hitting_rows, 0);
  const afterCutoffRows = asInt(summary && summary.after_cutoff_rows, 0);
  const badMathRows = asInt(summary && summary.bad_math_rows, 0);
  const stageMatchesOutcomeRows = rowsStaged === asInt(outcomeSummary && outcomeSummary.rows_before_cutoff, 0);
  const pass = rowsStaged > 0
    && sourceRequests === asInt(outcomeSummary && outcomeSummary.players_total, 0)
    && sourceSuccess > 0
    && sourceErrors === 0
    && duplicateCount === 0
    && missingRequired === 0
    && nonHittingRows === 0
    && afterCutoffRows === 0
    && badMathRows === 0
    && stageMatchesOutcomeRows
    && outcomeSummary.pass === true;
  const certification = pass ? "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED" : "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED";
  const grade = pass ? "BASE_PASS" : "BASE_FAIL";
  const checks = {
    version: VERSION,
    lifecycle: "fetch_mine_stage_player_outcomes_certify_promote_clean_microphases",
    cutoff_date: cutoffDate,
    delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
    rows_staged: rowsStaged,
    distinct_players: asInt(summary && summary.distinct_players, 0),
    distinct_games: asInt(summary && summary.distinct_games, 0),
    min_game_date: summary && summary.min_game_date,
    max_game_date: summary && summary.max_game_date,
    duplicate_count: duplicateCount,
    source_error_count: sourceErrors,
    source_success_count: sourceSuccess,
    source_no_data_count: sourceNoData,
    source_request_count: sourceRequests,
    source_success_definition: sourceTruth.source_success_definition,
    stage_matches_outcome_rows: stageMatchesOutcomeRows,
    missing_required: missingRequired,
    non_hitting_rows: nonHittingRows,
    after_cutoff_rows: afterCutoffRows,
    bad_math_rows: badMathRows,
    player_outcome_universe: outcomeSummary,
    delta_gate_open: false,
    pass,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true
  };
  return { pass, certification, grade, checks, duplicateCount, rowsStaged, sourceErrors, sourceNoData, sourceTruth };
}

async function certifyAndPromoteIfClean(env, batchId, runId, cutoffDate, options = {}) {
  const promoteLimit = cap(options.promote_rows_per_tick || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 25);
  const cleanLimit = cap(options.clean_rows_per_tick || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 500);
  let batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  let status = batch && batch.status ? String(batch.status) : "";
  let stageCountCached = null;
  async function getStageCount() {
    if (stageCountCached !== null) return stageCountCached;
    const row = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
    stageCountCached = asInt(row && row.c, 0);
    return stageCountCached;
  }

  if (status === "COMPLETED_PROMOTED_CLEANED") {
    const liveRows = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
    const sourceTruth = await freezeSourceCountersFromOutcomes(env, batchId);
    return { pass: true, done: true, continuation_required: false, status, certification: batch.certification_status || "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED", grade: batch.certification_grade || "BASE_PASS", checks: { version: VERSION, finalization_only: true, already_completed: true, source_counters_from_outcomes: sourceTruth }, rows_promoted: asInt(liveRows && liveRows.c, 0), stage_rows_after_clean: await getStageCount() };
  }

  if (status === "CERTIFICATION_FAILED" && (asInt(batch && batch.rows_staged, 0) > 0 || await getStageCount() > 0)) {
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', certification_status='pending_batch_certification', certification_grade=NULL, locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', last_error=NULL, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
    status = "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION";
  }

  // v1.5.31 hard repair: if the live table already has the full promoted base batch,
  // never re-enter promotion or expensive NOT EXISTS scans. This is autonomous cleanup-only mode.
  const liveRowsEarly = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
  const rowsPromotedEarly = asInt(liveRowsEarly && liveRowsEarly.c, 0);
  const expectedRowsEarly = asInt(batch && batch.rows_staged, 0) || await getStageCount();
  if (expectedRowsEarly > 0 && rowsPromotedEarly === expectedRowsEarly) {
    const grade = batch.certification_grade || "BASE_PASS";
    {
      const cleaned = await cleanStageRowsChunk(env, batchId, cleanLimit);
      const cleaningDone = cleaned.cleanup_done === true;
      if (!cleaningDone) {
        await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_CLEANING', rows_promoted=?, promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromotedEarly, batchId);
        await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_CLEANING', next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
        return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CLEANING", certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CLEAN_MICROPHASE", grade, checks: { version: VERSION, finalization_only: true, cleanup_only_state_machine: true, promotion_skipped_live_count_already_complete: true, cleaned, rows_promoted: rowsPromotedEarly, expected_promoted_rows: expectedRowsEarly, no_mlb_calls: true, no_outcome_rewrite: true, counters_frozen: true }, rows_promoted: rowsPromotedEarly, stage_rows_after_clean: cleaned.stage_rows_after_clean };
      }
    }
    const sourceTruth = await deriveSourceCountersFromOutcomes(env, batchId);
    const unresolved = asInt(sourceTruth.source_error_players, 0) + asInt(sourceTruth.repair_required_players, 0) + asInt(sourceTruth.unclear_players, 0);
    const finalPass = rowsPromotedEarly === expectedRowsEarly && sourceTruth.outcome_total > 0 && sourceTruth.outcome_total === sourceTruth.distinct_outcome_players && unresolved === 0;
    const cert = finalPass ? "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED" : "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED";
    const finalChecks = {
      version: VERSION,
      lifecycle: "cleanup_only_state_machine_final_marker",
      finalization_only: true,
      cleanup_only_state_machine: true,
      external_calls_performed: 0,
      cutoff_date: cutoffDate,
      rows_promoted: rowsPromotedEarly,
      expected_promoted_rows: expectedRowsEarly,
      stage_rows_after_clean: 0,
      source_counters_from_outcomes: sourceTruth,
      delta_gate_open: finalPass,
      pass: finalPass,
      no_mlb_calls: true,
      no_mining: true,
      no_new_batch: true,
      no_outcome_rewrite: true,
      no_scoring: true,
      no_ranking: true,
      no_board_mutation: true
    };
    const finalChecksJson = JSON.stringify(finalChecks);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_certifications SET rows_promoted=?, checks_json=? WHERE certification_id=?", rowsPromotedEarly, finalChecksJson, `cert_${batchId}`);
    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches SET
      status=CASE WHEN ? THEN 'COMPLETED_PROMOTED_CLEANED' ELSE 'CERTIFICATION_FAILED' END,
      rows_promoted=?,
      source_request_count=?,
      source_success_count=?,
      source_no_data_count=?,
      source_error_count=?,
      certification_status=?,
      certification_grade=CASE WHEN ? THEN ? ELSE 'BASE_FAIL' END,
      certification_json=?,
      finished_at=CURRENT_TIMESTAMP,
      promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP),
      cleaned_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE cleaned_at END,
      locked_by=NULL,
      lock_acquired_at=NULL,
      lock_expires_at=NULL,
      updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`,
      finalPass ? 1 : 0,
      rowsPromotedEarly,
      sourceTruth.source_request_count,
      sourceTruth.source_success_count,
      sourceTruth.source_no_data_count,
      sourceTruth.source_error_count,
      cert,
      finalPass ? 1 : 0,
      grade,
      finalChecksJson,
      finalPass ? 1 : 0,
      batchId
    );
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status=?, players_processed=players_total, next_run_after=NULL, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED", ACTIVE_CURSOR_KEY);
    return { pass: finalPass, done: true, continuation_required: false, status: finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED", certification: cert, grade: finalPass ? grade : "BASE_FAIL", checks: finalChecks, rows_promoted: rowsPromotedEarly, stage_rows_after_clean: 0 };
  }

  if (status === "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION" || status === "BASE_BACKFILL_RUNNING" || status === "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS") {
    const pre = await buildPrePromotionChecks(env, batchId, runId, cutoffDate);
    const checksJson = JSON.stringify(pre.checks);
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_certifications (
      certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      `cert_${batchId}`, batchId, runId, "base_backfill", pre.certification, pre.grade, checksJson, pre.rowsStaged, 0, pre.duplicateCount, pre.sourceNoData, pre.sourceErrors
    );
    if (!pre.pass) {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='CERTIFICATION_FAILED', certification_status=?, certification_grade=?, certification_json=?, duplicate_count=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", pre.certification, pre.grade, checksJson, pre.duplicateCount, batchId);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='CERTIFICATION_FAILED', last_error='base backfill certification failed', next_run_after=NULL, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
      return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: pre.certification, grade: pre.grade, checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
    }
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', certification_status=?, certification_grade=?, certification_json=?, duplicate_count=?, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", pre.certification, pre.grade, checksJson, pre.duplicateCount, batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', next_run_after=CURRENT_TIMESTAMP, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
    return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", grade: pre.grade, checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
  }

  if (status === "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE" || status === "BASE_BACKFILL_PROMOTING") {
    const grade = batch.certification_grade || "BASE_PASS";
    const promoted = await promoteStageRowsChunk(env, batchId, grade, promoteLimit);
    const liveRows = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
    const rowsPromoted = asInt(liveRows && liveRows.c, 0);
    const expectedPromotedRows = asInt(batch && batch.rows_staged, 0) || await getStageCount();
    const promotionComplete = promoted.remaining_unpromoted === 0 && rowsPromoted === expectedPromotedRows;
    const nextStatus = promotionComplete ? "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" : "BASE_BACKFILL_PROMOTING";
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status=?, rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", nextStatus, rowsPromoted, batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status=?, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", nextStatus, ACTIVE_CURSOR_KEY);
    if (promotionComplete) {
      // Do not rewrite player outcomes during finalization. Outcomes are the frozen audit truth.
    }
    return { pass: true, done: false, continuation_required: true, status: nextStatus, certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_PROMOTE_MICROPHASE", grade, checks: { promoted, rows_promoted: rowsPromoted, expected_promoted_rows: expectedPromotedRows, promotion_complete: promotionComplete, promote_limit: promoteLimit, no_cleanup_until_live_count_matches_stage: true }, rows_promoted: rowsPromoted, stage_rows_after_clean: await getStageCount() };
  }

  if (status === "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" || status === "BASE_BACKFILL_CLEANING") {
    const liveRows = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
    const rowsPromoted = asInt(liveRows && liveRows.c, 0);
    const expectedRowsBeforeClean = asInt(batch && batch.rows_staged, 0) || await getStageCount();
    if (rowsPromoted !== expectedRowsBeforeClean) {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_PROMOTING', rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromoted, batchId);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_PROMOTING', next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
      return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_PROMOTING", certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_PROMOTION_COUNT_GUARD", grade: batch.certification_grade || "BASE_PASS", checks: { rows_promoted: rowsPromoted, expected_promoted_rows: expectedRowsBeforeClean, cleanup_blocked_until_live_count_matches_stage: true }, rows_promoted: rowsPromoted, stage_rows_after_clean: await getStageCount() };
    }
    const cleaned = await cleanStageRowsChunk(env, batchId, cleanLimit);
    if (cleaned.cleanup_done !== true) {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_CLEANING', rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromoted, batchId);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_CLEANING', next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
      return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CLEANING", certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CLEAN_MICROPHASE", grade: batch.certification_grade || "BASE_PASS", checks: { cleaned, rows_promoted: rowsPromoted, clean_limit: cleanLimit }, rows_promoted: rowsPromoted, stage_rows_after_clean: cleaned.stage_rows_after_clean };
    }

    // Do not rewrite player outcomes during final cleanup. Outcomes are the frozen audit truth.
    const outcomeSummary = await certifyPlayerOutcomeUniverse(env, batchId, runId, cutoffDate);
    const sourceTruth = await freezeSourceCountersFromOutcomes(env, batchId);
    const expectedPromotedRows = asInt(batch && batch.rows_staged, 0) || asInt(outcomeSummary && outcomeSummary.rows_before_cutoff, 0);
    const cert = batch.certification_status || "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED";
    const grade = batch.certification_grade || "BASE_PASS";
    const finalPass = outcomeSummary.pass === true && rowsPromoted > 0 && rowsPromoted === expectedPromotedRows;
    const finalChecks = {
      version: VERSION,
      lifecycle: "finalization_only_repair_stage_player_outcomes_certify_promote_clean_final_verify",
      finalization_only: true,
      external_calls_performed: 0,
      cutoff_date: cutoffDate,
      delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
      rows_promoted: rowsPromoted,
      expected_promoted_rows: expectedPromotedRows,
      stage_rows_after_clean: 0,
      clean_pass: true,
      source_counters_from_outcomes: sourceTruth,
      player_outcome_universe: outcomeSummary,
      delta_gate_open: finalPass,
      pass: finalPass,
      no_scoring: true,
      no_ranking: true,
      no_board_mutation: true
    };
    const finalChecksJson = JSON.stringify(finalChecks);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_certifications SET rows_promoted=?, checks_json=? WHERE certification_id=?", rowsPromoted, finalChecksJson, `cert_${batchId}`);
    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches SET
      status=CASE WHEN ? THEN 'COMPLETED_PROMOTED_CLEANED' ELSE 'CERTIFICATION_FAILED' END,
      rows_promoted=?,
      source_request_count=?,
      source_success_count=?,
      source_no_data_count=?,
      source_error_count=?,
      certification_status=CASE WHEN ? THEN ? ELSE 'BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED' END,
      certification_grade=CASE WHEN ? THEN ? ELSE 'BASE_FAIL' END,
      certification_json=?,
      finished_at=CURRENT_TIMESTAMP,
      promoted_at=CASE WHEN ? THEN COALESCE(promoted_at,CURRENT_TIMESTAMP) ELSE promoted_at END,
      cleaned_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE cleaned_at END,
      updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`,
      finalPass ? 1 : 0,
      rowsPromoted,
      sourceTruth.source_request_count,
      sourceTruth.source_success_count,
      sourceTruth.source_no_data_count,
      sourceTruth.source_error_count,
      finalPass ? 1 : 0,
      cert,
      finalPass ? 1 : 0,
      grade,
      finalChecksJson,
      finalPass ? 1 : 0,
      finalPass ? 1 : 0,
      batchId
    );
    const completedCursor = await first(env.STATS_HITTER_DB, "SELECT cursor_json FROM hitter_game_log_cursor WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
    let completedCursorJson = {};
    try { completedCursorJson = JSON.parse((completedCursor && completedCursor.cursor_json) || "{}"); } catch (_) { completedCursorJson = {}; }
    completedCursorJson.completed_at = nowUtc();
    completedCursorJson.final_certification = cert;
    completedCursorJson.rows_promoted = rowsPromoted;
    completedCursorJson.finalization_microphases = true;
    completedCursorJson.finalization_only_repair = true;
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status=?, players_processed=players_total, next_run_after=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED", JSON.stringify(completedCursorJson), ACTIVE_CURSOR_KEY);
    return { pass: finalPass, done: true, continuation_required: false, status: finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED", certification: finalPass ? cert : "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED", grade: finalPass ? grade : "BASE_FAIL", checks: finalChecks, rows_promoted: rowsPromoted, stage_rows_after_clean: 0 };
  }

  return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: "BASE_HITTER_GAME_LOGS_UNKNOWN_FINALIZATION_STATUS", grade: "BASE_FAIL", checks: { status, batch_id: batchId }, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
}


async function getLockedBaseIntegrity(env) {
  const batch = await first(env.STATS_HITTER_DB, `SELECT batch_id,status,rows_promoted,certification_status,certification_grade,cleaned_at
    FROM hitter_game_log_batches WHERE batch_id=? LIMIT 1`, LOCKED_BASE_BATCH_ID);
  const live = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=?`, LOCKED_BASE_BATCH_ID);
  const outcomes = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM hitter_game_log_player_outcomes WHERE batch_id=?`, LOCKED_BASE_BATCH_ID);
  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (
      SELECT player_id, game_pk, group_type, COUNT(*) AS n
      FROM hitter_game_logs
      WHERE batch_id=?
      GROUP BY player_id, game_pk, group_type
      HAVING COUNT(*) > 1
    )`, LOCKED_BASE_BATCH_ID);
  const after = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND date(game_date) > date(?)`, LOCKED_BASE_BATCH_ID, DEFAULT_BASE_BACKFILL_CUTOFF_DATE);
  const pass = !!batch
    && String(batch.status) === "COMPLETED_PROMOTED_CLEANED"
    && asInt(batch.rows_promoted, 0) === 14717
    && asInt(live && live.c, 0) === 14717
    && asInt(outcomes && outcomes.c, 0) === 569
    && asInt(dup && dup.c, 0) === 0
    && asInt(after && after.c, 0) === 0;
  return {
    pass,
    required_base_batch_id: LOCKED_BASE_BATCH_ID,
    status: batch ? batch.status : null,
    rows_promoted: batch ? asInt(batch.rows_promoted, 0) : 0,
    live_base_rows: asInt(live && live.c, 0),
    base_outcome_rows: asInt(outcomes && outcomes.c, 0),
    duplicate_base_live_keys: asInt(dup && dup.c, 0),
    base_rows_after_cutoff: asInt(after && after.c, 0),
    cutoff_date: DEFAULT_BASE_BACKFILL_CUTOFF_DATE,
    cleaned_at: batch ? batch.cleaned_at : null
  };
}

function isoDateOnly(d) { return new Date(d).toISOString().slice(0, 10); }
function addDays(dateStr, days) { const d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return isoDateOnly(d); }
function todayUtcDate() { return isoDateOnly(Date.now()); }

function isFinalMlbGame(game) {
  const status = game && game.status ? game.status : {};
  const abstractState = String(status.abstractGameState || "").toLowerCase();
  const detailed = String(status.detailedState || "").toLowerCase();
  const coded = String(status.codedGameState || "").toUpperCase();
  return abstractState === "final" || coded === "F" || detailed === "final" || detailed === "game over" || detailed === "completed early";
}

async function determineLatestCompleteGameDate(env, deltaFloorDate, fetchTimeoutMs) {
  const today = todayUtcDate();
  const endpoint = `${String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "")}/schedule?sportId=1&gameTypes=R&startDate=${encodeURIComponent(deltaFloorDate)}&endDate=${encodeURIComponent(today)}`;
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/1.6.10") } }, fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  if (!fetched.ok || !fetched.resp || !fetched.resp.ok) {
    return { ok: false, endpoint, error: fetched.error || (fetched.resp ? `HTTP_${fetched.resp.status}` : "schedule_fetch_failed") };
  }
  let body;
  try { body = JSON.parse(fetched.text || "{}"); } catch (err) { return { ok: false, endpoint, error: `schedule_json_parse_failed:${String(err && err.message ? err.message : err)}` }; }
  const dates = Array.isArray(body.dates) ? body.dates : [];
  let latest = null;
  for (const d of dates) {
    const dateStr = asText(d && d.date, null);
    const games = Array.isArray(d && d.games) ? d.games : [];
    if (!dateStr || !games.length) continue;
    const allFinal = games.every(isFinalMlbGame);
    if (allFinal && (!latest || dateStr > latest)) latest = dateStr;
  }
  if (!latest) return { ok: false, endpoint, error: "NO_COMPLETE_FINAL_MLB_GAME_DATE_IN_DELTA_RANGE", today_utc: today };
  return { ok: true, endpoint, latest_complete_game_date: latest, today_utc: today };
}

async function getDeltaWindow(env, inputJson, fetchTimeoutMs) {
  const deltaFloor = asText(inputJson.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE);
  const schedule = await determineLatestCompleteGameDate(env, deltaFloor, fetchTimeoutMs);
  if (!schedule.ok) return { ok: false, ...schedule, delta_start_date: deltaFloor };
  const latest = schedule.latest_complete_game_date;

  // v1.6.2: first delta after locked base must not be capped to only the last 7 days.
  // It must catch up the full post-base window from 2026-05-19 through latest finalized MLB date.
  // After at least one certified/promoted/cleaned delta exists, normal repair-aware lookback applies.
  const existingDeltaLive = await first(env.STATS_HITTER_DB, `SELECT MAX(game_date) AS max_delta_game_date
    FROM hitter_game_logs
    WHERE ingestion_mode='delta_update'
      AND date(game_date) >= date(?)`, deltaFloor);
  const maxDeltaGameDate = asText(existingDeltaLive && existingDeltaLive.max_delta_game_date, null);
  const hasPriorDeltaLive = !!(maxDeltaGameDate && maxDeltaGameDate >= deltaFloor);

  const lookbackStart = addDays(latest, -(DEFAULT_DELTA_LOOKBACK_DAYS - 1));
  let start = hasPriorDeltaLive ? (lookbackStart < deltaFloor ? deltaFloor : lookbackStart) : deltaFloor;

  const failed = await first(env.STATS_HITTER_DB, `SELECT MIN(delta_start_date) AS min_start
    FROM hitter_game_log_batches
    WHERE mode='delta_update' AND status IN ('CERTIFICATION_FAILED','DELTA_FAILED','PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS','DELTA_RUNNING','DELTA_STAGED_READY_FOR_CERTIFICATION','DELTA_CERTIFIED_READY_TO_PROMOTE','DELTA_PROMOTING','DELTA_PROMOTED_READY_TO_CLEAN','DELTA_CLEANING')
      AND delta_start_date IS NOT NULL`);
  const failedStart = asText(failed && failed.min_start, null);
  if (failedStart && failedStart >= deltaFloor && failedStart < start) start = failedStart;
  return {
    ok: true,
    delta_start_date: start,
    delta_end_date: latest,
    delta_floor_date: deltaFloor,
    latest_complete_game_date: latest,
    repair_lookback_days: DEFAULT_DELTA_LOOKBACK_DAYS,
    initial_full_delta_catchup: !hasPriorDeltaLive,
    prior_delta_live_max_game_date: maxDeltaGameDate,
    schedule_endpoint: schedule.endpoint
  };
}

function parseHitterSplitForWindow(split, playerId, playerName, season, batchId, runId, mode, endpoint, windowStart, windowEnd) {
  const gameDate = splitGameDate(split);
  if (!gameDate || gameDate < windowStart || gameDate > windowEnd) return null;
  const row = parseHitterSplit(split, playerId, playerName, season, batchId, runId, mode, endpoint, null);
  if (!row) return null;
  row.stage_id = `${batchId}_${playerId}_${row.game_pk}_hitting_delta`;
  row.ingestion_mode = "delta_update";
  row.certification_status = "delta_update_staged_unverified";
  return row;
}

async function processPlayerDelta(env, p, sourceSeason, batchId, runId, windowStart, windowEnd, maxRowsRemaining, fetchTimeoutMs) {
  const endpoint = endpointFor(env, p.player_id, sourceSeason);
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/1.6.10") } }, fetchTimeoutMs);
  if (!fetched.ok) return { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: fetched.timed_out ? "fetch_timeout" : "fetch_exception", error: fetched.error, rows_staged: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, source_endpoint: endpoint, retry_same_player: true };
  const resp = fetched.resp;
  const text = fetched.text || "";
  if (!resp.ok) return { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: "http_error", http_status: resp.status, rows_staged: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, source_endpoint: endpoint, preview: text.slice(0, 240), retry_same_player: true };
  let body;
  try { body = JSON.parse(text); } catch (err) { return { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: "json_parse_error", error: String(err && err.message ? err.message : err), rows_staged: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, source_endpoint: endpoint, retry_same_player: true }; }
  const splits = body && body.stats && body.stats[0] && Array.isArray(body.stats[0].splits) ? body.stats[0].splits : [];
  const rawDates = splits.map(splitGameDate).filter(Boolean).sort();
  if (!splits.length) return { player_id: p.player_id, player_name: p.player_name, status: "no_data", http_status: resp.status, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, rows_staged: 0, source_endpoint: endpoint };
  let inserted = 0, inWindow = 0, outsideWindow = 0, invalidInWindow = 0;
  const stagedDates = [];
  for (const split of splits) {
    if (inserted >= maxRowsRemaining) break;
    const gameDate = splitGameDate(split);
    if (!gameDate || gameDate < windowStart || gameDate > windowEnd) { outsideWindow++; continue; }
    inWindow++;
    const row = parseHitterSplitForWindow(split, p.player_id, p.player_name, sourceSeason, batchId, runId, "delta_update", endpoint, windowStart, windowEnd);
    if (!row) { invalidInWindow++; continue; }
    await insertStageRow(env, row);
    stagedDates.push(row.game_date);
    inserted++;
  }
  let status = "success";
  if (inserted <= 0 && inWindow === 0 && outsideWindow > 0) status = "filtered_outside_window";
  else if (inserted <= 0 && inWindow > 0) status = "repair_required";
  return {
    player_id: p.player_id,
    player_name: p.player_name,
    status,
    http_status: resp.status,
    raw_payload_split_count: splits.length,
    rows_before_cutoff: inWindow,
    rows_filtered_after_cutoff: outsideWindow,
    rows_staged: inserted,
    invalid_before_cutoff_rows: invalidInWindow,
    source_endpoint: endpoint,
    first_raw_game_date: rawDates[0] || null,
    last_raw_game_date: rawDates[rawDates.length - 1] || null,
    first_promoted_game_date: stagedDates[0] || null,
    last_promoted_game_date: stagedDates[stagedDates.length - 1] || null
  };
}

function classifyDeltaOutcome(result) {
  if (!result || result.status === "source_error") return "SOURCE_ERROR";
  if (asInt(result.raw_payload_split_count, 0) === 0) return "TRUE_NO_DATA";
  if (asInt(result.rows_staged, 0) > 0) return "PROMOTED_ROWS";
  if (result.status === "filtered_outside_window") return "FILTERED_OUTSIDE_WINDOW";
  return "REPAIR_REQUIRED";
}

function deltaOutcomeReason(result, category, windowStart, windowEnd) {
  if (category === "PROMOTED_ROWS") return `Source returned regular-season hitting rows inside certified delta window ${windowStart} through ${windowEnd}, and rows were staged for promotion.`;
  if (category === "TRUE_NO_DATA") return `MLB StatsAPI returned zero 2026 hitting game-log splits for this player during delta certification.`;
  if (category === "FILTERED_OUTSIDE_WINDOW") return `MLB StatsAPI returned hitting game-log splits, but none were inside certified delta window ${windowStart} through ${windowEnd}.`;
  if (category === "SOURCE_ERROR") return result && result.error_type ? `Source request failed: ${result.error_type}` : "Source request failed.";
  return `Source indicated in-window data but no rows were staged; repair required before delta can certify.`;
}

async function upsertDeltaPlayerOutcome(env, batchId, runId, p, cursorOffset, result, endpoint, windowStart, windowEnd) {
  const category = classifyDeltaOutcome(result);
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_player_outcomes (
    batch_id,run_id,player_id,player_name,primary_position,cursor_offset,source_endpoint,source_http_status,source_ok,
    raw_payload_split_count,rows_before_cutoff,rows_filtered_after_cutoff,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,
    first_raw_game_date,last_raw_game_date,first_promoted_game_date,last_promoted_game_date,certification_status,certification_grade,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    batchId, runId, asInt(p && p.player_id, 0), asText((p && p.player_name) || (result && result.player_name), null), asText(p && p.primary_position, null), asInt(cursorOffset, 0), endpoint || (result && result.source_endpoint) || null,
    result && result.http_status !== undefined ? asInt(result.http_status, null) : null, category === "SOURCE_ERROR" ? 0 : 1,
    asInt(result && result.raw_payload_split_count, 0), asInt(result && result.rows_before_cutoff, 0), asInt(result && result.rows_filtered_after_cutoff, 0), asInt(result && result.rows_staged, 0), 0,
    category, deltaOutcomeReason(result, category, windowStart, windowEnd), result && result.error ? String(result.error).slice(0, 900) : null,
    result && result.first_raw_game_date ? result.first_raw_game_date : null, result && result.last_raw_game_date ? result.last_raw_game_date : null,
    result && result.first_promoted_game_date ? result.first_promoted_game_date : null, result && result.last_promoted_game_date ? result.last_promoted_game_date : null,
    "player_outcome_unverified", null);
  return category;
}

async function getOrCreateDeltaState(env, input, inputJson, windowInfo) {
  const existing = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_game_log_cursor WHERE cursor_key=? AND mode='delta_update' AND status IN ('DELTA_RUNNING','PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS','DELTA_STAGED_READY_FOR_CERTIFICATION','DELTA_CERTIFIED_READY_TO_PROMOTE','DELTA_PROMOTING','DELTA_PROMOTED_READY_TO_CLEAN','DELTA_CLEANING')`, DELTA_CURSOR_KEY);
  if (existing) {
    const batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", existing.batch_id);
    let players = [];
    try { players = JSON.parse(existing.cursor_json || "{}").players || []; } catch (_) { players = []; }
    if (batch && players.length) return { is_new: false, cursor: existing, batch, players, input_json: inputJson };
  }
  const runId = asText(input.run_id, rid("run_delta_hitter_logs"));
  const batchId = rid("hitter_delta_update_batch");
  const sourceSeason = asInt(inputJson.source_season || env.ACTIVE_SEASON || DEFAULT_SOURCE_SEASON, DEFAULT_SOURCE_SEASON);
  const players = await chooseAllHitterPlayers(env, inputJson);
  const cursorJson = {
    version: VERSION,
    created_at: nowUtc(),
    mode: "delta_update",
    source: "REF_DB.ref_players_hitter_position_filter",
    source_season: sourceSeason,
    delta_start_date: windowInfo.delta_start_date,
    delta_end_date: windowInfo.delta_end_date,
    latest_complete_game_date: windowInfo.latest_complete_game_date,
    repair_lookback_days: windowInfo.repair_lookback_days,
    schedule_endpoint: windowInfo.schedule_endpoint,
    players
  };
  await run(env.STATS_HITTER_DB, `INSERT INTO hitter_game_log_batches (
    batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_endpoint,source_season,source_game_type,
    base_backfill_cutoff_date,delta_start_date,cursor_offset,cursor_state_json,chunk_size_players,max_requests_per_tick,max_rows_per_tick,certification_status,notes
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    batchId, runId, WORKER_NAME, VERSION, "delta_update", "DELTA_RUNNING", DATA_FEED_KEY, SOURCE_KEY, LOCKED_SOURCE_ENDPOINT_PATTERN, sourceSeason, "R",
    DEFAULT_BASE_BACKFILL_CUTOFF_DATE, windowInfo.delta_start_date, 0, JSON.stringify(cursorJson), DEFAULT_CHUNK_SIZE_PLAYERS, DEFAULT_MAX_REQUESTS_PER_TICK, DEFAULT_MAX_ROWS_PER_TICK, "not_certified",
    `delta_update certifying repair/update window ${windowInfo.delta_start_date} through ${windowInfo.delta_end_date}; base batch ${LOCKED_BASE_BATCH_ID} gate required`);
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor (
    cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,next_run_after,cursor_json
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`,
    DELTA_CURSOR_KEY, batchId, runId, "delta_update", "DELTA_RUNNING", sourceSeason, DEFAULT_BASE_BACKFILL_CUTOFF_DATE, windowInfo.delta_start_date, 0, players.length, 0, 0, JSON.stringify(cursorJson));
  const cursor = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_cursor WHERE cursor_key=?", DELTA_CURSOR_KEY);
  const batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  return { is_new: true, cursor, batch, players, input_json: inputJson };
}

async function certifyDeltaOutcomeUniverse(env, batchId, expectedPlayers) {
  const totals = await first(env.STATS_HITTER_DB, `SELECT
      COUNT(*) AS outcome_total,
      COUNT(DISTINCT player_id) AS distinct_outcome_players,
      COUNT(*) - COUNT(DISTINCT player_id) AS duplicate_outcome_rows,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END) AS promoted_players,
      SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END) AS true_no_data_players,
      SUM(CASE WHEN terminal_category='FILTERED_OUTSIDE_WINDOW' THEN 1 ELSE 0 END) AS filtered_outside_window_players,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END) AS source_error_players,
      SUM(CASE WHEN terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END) AS repair_required_players,
      SUM(CASE WHEN terminal_category='UNCLEAR' THEN 1 ELSE 0 END) AS unclear_players,
      SUM(CASE WHEN terminal_category NOT IN ('PROMOTED_ROWS','TRUE_NO_DATA','FILTERED_OUTSIDE_WINDOW','SOURCE_ERROR','REPAIR_REQUIRED','UNCLEAR') THEN 1 ELSE 0 END) AS invalid_category_players,
      SUM(COALESCE(rows_staged,0)) AS rows_staged
    FROM hitter_game_log_player_outcomes WHERE batch_id=?`, batchId);
  const pass = asInt(totals && totals.outcome_total, 0) === expectedPlayers
    && asInt(totals && totals.distinct_outcome_players, 0) === expectedPlayers
    && asInt(totals && totals.duplicate_outcome_rows, 0) === 0
    && asInt(totals && totals.source_error_players, 0) === 0
    && asInt(totals && totals.repair_required_players, 0) === 0
    && asInt(totals && totals.unclear_players, 0) === 0
    && asInt(totals && totals.invalid_category_players, 0) === 0;
  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_player_outcomes SET certification_status=?, certification_grade=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", pass ? "delta_player_outcome_certified" : "delta_player_outcome_certification_failed", pass ? "DELTA_PASS" : "DELTA_FAIL", batchId);
  return { version: VERSION, pass, players_total: expectedPlayers, ...totals };
}

async function buildDeltaPrePromotionChecks(env, batchId, runId, windowInfo, playersTotal, baseGate) {
  const summary = await first(env.STATS_HITTER_DB, `SELECT
      COUNT(*) AS rows_staged,
      COUNT(DISTINCT player_id) AS distinct_players,
      COUNT(DISTINCT game_pk) AS distinct_games,
      MIN(game_date) AS min_game_date,
      MAX(game_date) AS max_game_date,
      SUM(CASE WHEN player_id IS NULL OR game_pk IS NULL OR season IS NULL OR game_date IS NULL OR source_key IS NULL OR source_endpoint IS NULL THEN 1 ELSE 0 END) AS missing_required,
      SUM(CASE WHEN group_type!='hitting' THEN 1 ELSE 0 END) AS non_hitting_rows,
      SUM(CASE WHEN date(game_date) < date(?) OR date(game_date) > date(?) THEN 1 ELSE 0 END) AS outside_window_rows,
      SUM(CASE WHEN hits < 0 OR doubles < 0 OR triples < 0 OR home_runs < 0 OR singles < 0 OR total_bases < 0 OR ab < 0 OR pa < 0 OR hits > ab OR singles != hits - doubles - triples - home_runs OR total_bases != singles + (2*doubles) + (3*triples) + (4*home_runs) THEN 1 ELSE 0 END) AS bad_math_rows
    FROM hitter_game_logs_stage WHERE batch_id=?`, windowInfo.delta_start_date, windowInfo.delta_end_date, batchId);
  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS duplicate_count FROM (
      SELECT player_id, game_pk, group_type, COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=? GROUP BY player_id, game_pk, group_type HAVING COUNT(*) > 1
    )`, batchId);
  const outcomeSummary = await certifyDeltaOutcomeUniverse(env, batchId, playersTotal);
  const rowsStaged = asInt(summary && summary.rows_staged, 0);
  const pass = baseGate.pass === true
    && outcomeSummary.pass === true
    && asInt(dup && dup.duplicate_count, 0) === 0
    && asInt(summary && summary.missing_required, 0) === 0
    && asInt(summary && summary.non_hitting_rows, 0) === 0
    && asInt(summary && summary.outside_window_rows, 0) === 0
    && asInt(summary && summary.bad_math_rows, 0) === 0;
  const checks = {
    version: VERSION,
    lifecycle: "delta_update_stage_player_outcomes_certify_promote_stage_retained",
    base_integrity_gate: baseGate,
    delta_window: windowInfo,
    rows_staged: rowsStaged,
    distinct_players: asInt(summary && summary.distinct_players, 0),
    distinct_games: asInt(summary && summary.distinct_games, 0),
    min_game_date: summary && summary.min_game_date,
    max_game_date: summary && summary.max_game_date,
    duplicate_count: asInt(dup && dup.duplicate_count, 0),
    missing_required: asInt(summary && summary.missing_required, 0),
    non_hitting_rows: asInt(summary && summary.non_hitting_rows, 0),
    outside_window_rows: asInt(summary && summary.outside_window_rows, 0),
    bad_math_rows: asInt(summary && summary.bad_math_rows, 0),
    player_outcome_universe: outcomeSummary,
    pass,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true
  };
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_logs_stage SET certification_status=?, certification_grade=?, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, pass ? "delta_update_certified" : "delta_update_certification_failed", pass ? "DELTA_PASS" : "DELTA_FAIL", batchId);
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, `cert_${batchId}`, batchId, runId, "delta_update", pass ? "DELTA_HITTER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE" : "DELTA_HITTER_GAME_LOGS_CERTIFICATION_FAILED", pass ? "DELTA_PASS" : "DELTA_FAIL", JSON.stringify(checks), rowsStaged, 0, asInt(dup && dup.duplicate_count, 0), asInt(outcomeSummary.true_no_data_players, 0), asInt(outcomeSummary.source_error_players, 0));
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches SET rows_staged=?, duplicate_count=?, certification_status=?, certification_grade=?, certification_json=?, certified_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE certified_at END, status=CASE WHEN ? THEN 'DELTA_CERTIFIED_READY_TO_PROMOTE' ELSE 'CERTIFICATION_FAILED' END, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, rowsStaged, asInt(dup && dup.duplicate_count, 0), pass ? "DELTA_HITTER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE" : "DELTA_HITTER_GAME_LOGS_CERTIFICATION_FAILED", pass ? "DELTA_PASS" : "DELTA_FAIL", JSON.stringify(checks), pass ? 1 : 0, pass ? 1 : 0, batchId);
  return { pass, grade: pass ? "DELTA_PASS" : "DELTA_FAIL", checks, rows_staged: rowsStaged };
}

async function deriveDeltaSourceCounters(env, batchId) {
  const row = await first(env.STATS_HITTER_DB, `SELECT
      COUNT(*) AS outcome_total,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END) AS promoted_players,
      SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END) AS true_no_data_players,
      SUM(CASE WHEN terminal_category='FILTERED_OUTSIDE_WINDOW' THEN 1 ELSE 0 END) AS filtered_outside_window_players,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END) AS source_error_players
    FROM hitter_game_log_player_outcomes WHERE batch_id=?`, batchId);
  return {
    source_request_count: asInt(row && row.outcome_total, 0),
    source_success_count: asInt(row && row.promoted_players, 0) + asInt(row && row.filtered_outside_window_players, 0),
    source_no_data_count: asInt(row && row.true_no_data_players, 0),
    source_error_count: asInt(row && row.source_error_players, 0),
    source_success_definition: "PROMOTED_ROWS + FILTERED_OUTSIDE_WINDOW; both are successful source responses. TRUE_NO_DATA is a terminal empty source outcome."
  };
}


function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function reconcileHitterGameLogCoverageFromLive(env, batchId, runId, opts = {}) {
  return {
    ok: true,
    skipped: true,
    disabled: true,
    version: VERSION,
    reason: "coverage_owned_by_delta_certifier_only",
    note: "Hitter game logs worker is mining-only. It does not write TEAM_DB coverage or gap tables. Run delta-certifier/calendar after mining to reconcile coverage.",
    updated_rows: 0,
    resolved_gap_rows: 0
  };
}

async function finalizeDeltaIfReady(env, batchId, runId, windowInfo, playersTotal, baseGate, opts = {}) {
  const batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  const status = String((batch && batch.status) || "");
  const grade = batch && batch.certification_grade ? batch.certification_grade : "DELTA_PASS";
  const getStageCount = async () => asInt((await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId))?.c, 0);
  const getLiveCount = async () => asInt((await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=?", batchId))?.c, 0);

  if (status === "DELTA_RUNNING" || status === "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS" || status === "DELTA_STAGED_READY_FOR_CERTIFICATION") {
    const pre = await buildDeltaPrePromotionChecks(env, batchId, runId, windowInfo, playersTotal, baseGate);
    return {
      pass: pre.pass,
      done: false,
      continuation_required: pre.pass,
      status: pre.pass ? "DELTA_CERTIFIED_READY_TO_PROMOTE" : "CERTIFICATION_FAILED",
      certification: pre.pass ? "DELTA_HITTER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE" : "DELTA_HITTER_GAME_LOGS_CERTIFICATION_FAILED",
      grade: pre.grade,
      checks: pre.checks,
      rows_promoted: 0,
      stage_rows_after_clean: await getStageCount(),
      stage_rows_retained: await getStageCount()
    };
  }

  if (status === "DELTA_CERTIFIED_READY_TO_PROMOTE" || status === "DELTA_PROMOTING") {
    const promoted = await promoteStageRowsChunk(env, batchId, grade, cap(opts.promote_rows_per_tick || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 25));
    const liveRows = await getLiveCount();
    const stageRows = await getStageCount();
    const complete = liveRows >= stageRows && promoted.remaining_unpromoted === 0;
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status=?, rows_promoted=?, promoted_at=CASE WHEN ? THEN COALESCE(promoted_at,CURRENT_TIMESTAMP) ELSE promoted_at END, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", complete ? "DELTA_PROMOTED_STAGE_READY_TO_RETAIN" : "DELTA_PROMOTING", liveRows, complete ? 1 : 0, batchId);
    return {
      pass: true,
      done: false,
      continuation_required: true,
      status: complete ? "DELTA_PROMOTED_STAGE_READY_TO_RETAIN" : "DELTA_PROMOTING",
      certification: "DELTA_HITTER_GAME_LOGS_PROMOTE_MICROPHASE",
      grade,
      checks: {
        promoted,
        live_rows_for_delta_batch: liveRows,
        stage_rows: stageRows,
        promotion_complete: complete,
        no_cleanup_until_live_count_matches_stage: true,
        delta_stage_retention_enabled: true
      },
      rows_promoted: liveRows,
      stage_rows_after_clean: stageRows,
      stage_rows_retained: stageRows
    };
  }

  if (status === "DELTA_PROMOTED_READY_TO_CLEAN" || status === "DELTA_CLEANING" || status === "DELTA_PROMOTED_STAGE_READY_TO_RETAIN" || status === "COMPLETED_PROMOTED_STAGE_RETAINED") {
    // v1.6.4: DELTA staging rows are intentionally retained as the certified 2026 repair-refresh snapshot.
    // Do NOT call cleanStageRowsChunk for delta batches. Base backfill cleanup remains unchanged.
    const liveRows = await getLiveCount();
    const retainedStageRows = await getStageCount();
    if (liveRows < retainedStageRows) {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='DELTA_PROMOTING', rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", liveRows, batchId);
      return {
        pass: true,
        done: false,
        continuation_required: true,
        status: "DELTA_PROMOTING",
        certification: "DELTA_HITTER_GAME_LOGS_PROMOTION_COUNT_GUARD",
        grade,
        checks: { liveRows, retainedStageRows, delta_stage_retention_enabled: true },
        rows_promoted: liveRows,
        stage_rows_after_clean: retainedStageRows,
        stage_rows_retained: retainedStageRows
      };
    }
    const dupLive = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, group_type, COUNT(*) AS n FROM hitter_game_logs GROUP BY player_id, game_pk, group_type HAVING COUNT(*) > 1)`);
    const afterWindow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND (date(game_date) < date(?) OR date(game_date) > date(?))", batchId, windowInfo.delta_start_date, windowInfo.delta_end_date);
    const sourceTruth = await deriveDeltaSourceCounters(env, batchId);
    const finalPass = baseGate.pass === true && retainedStageRows > 0 && liveRows >= retainedStageRows && asInt(dupLive && dupLive.c, 0) === 0 && asInt(afterWindow && afterWindow.c, 0) === 0;
    const checks = {
      version: VERSION,
      lifecycle: "delta_update_final_verify_stage_retained",
      base_integrity_gate: baseGate,
      delta_window: windowInfo,
      live_rows_for_delta_batch: liveRows,
      stage_rows_retained: retainedStageRows,
      stage_rows_after_clean: retainedStageRows,
      stage_retained_as_2026_repair_refresh_snapshot: true,
      cleanup_skipped_intentionally: true,
      duplicate_live_keys: asInt(dupLive && dupLive.c, 0),
      delta_rows_outside_window: asInt(afterWindow && afterWindow.c, 0),
      source_counters_from_outcomes: sourceTruth,
      pass: finalPass,
      no_scoring: true,
      no_ranking: true,
      no_board_mutation: true
    };
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_certifications SET rows_promoted=?, checks_json=? WHERE certification_id=?", liveRows, JSON.stringify(checks), `cert_${batchId}`);
    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches SET
      status=CASE WHEN ? THEN 'COMPLETED_PROMOTED_STAGE_RETAINED' ELSE 'CERTIFICATION_FAILED' END,
      rows_staged=?,
      rows_promoted=?,
      source_request_count=?,
      source_success_count=?,
      source_no_data_count=?,
      source_error_count=?,
      certification_status=CASE WHEN ? THEN 'DELTA_HITTER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED' ELSE 'DELTA_HITTER_GAME_LOGS_CERTIFICATION_FAILED' END,
      certification_grade=CASE WHEN ? THEN 'DELTA_PASS' ELSE 'DELTA_FAIL' END,
      certification_json=?,
      finished_at=CURRENT_TIMESTAMP,
      cleaned_at=cleaned_at,
      updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`, finalPass ? 1 : 0, retainedStageRows, liveRows, sourceTruth.source_request_count, sourceTruth.source_success_count, sourceTruth.source_no_data_count, sourceTruth.source_error_count, finalPass ? 1 : 0, finalPass ? 1 : 0, JSON.stringify(checks), batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status=?, next_run_after=NULL, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", finalPass ? "COMPLETED_PROMOTED_STAGE_RETAINED" : "CERTIFICATION_FAILED", DELTA_CURSOR_KEY);
    checks.coverage_reconcile = {
      skipped: true,
      disabled: true,
      reason: "coverage_owned_by_delta_certifier_only",
      note: "Run delta-certifier/calendar after hitter mining to reconcile TEAM_DB coverage and gaps."
    };
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_certifications SET checks_json=? WHERE certification_id=?", JSON.stringify(checks), `cert_${batchId}`);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", JSON.stringify(checks), batchId);
    return {
      pass: finalPass,
      done: true,
      continuation_required: false,
      status: finalPass ? "COMPLETED_PROMOTED_STAGE_RETAINED" : "CERTIFICATION_FAILED",
      certification: finalPass ? "DELTA_HITTER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED" : "DELTA_HITTER_GAME_LOGS_CERTIFICATION_FAILED",
      grade: finalPass ? "DELTA_PASS" : "DELTA_FAIL",
      checks,
      rows_promoted: liveRows,
      stage_rows_after_clean: retainedStageRows,
      stage_rows_retained: retainedStageRows
    };
  }
  return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: "DELTA_HITTER_GAME_LOGS_UNKNOWN_STATUS", grade: "DELTA_FAIL", checks: { status, batchId }, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
}


async function getCompletedRetainedDeltaGuard(env) {
  const latest = await first(env.STATS_HITTER_DB, `SELECT batch_id, run_id, mode, status, rows_staged, rows_promoted, certification_status, certification_grade,
      delta_start_date, promoted_at, cleaned_at, updated_at, source_season
    FROM hitter_game_log_batches
    WHERE mode='delta_update'
      AND status IN ('COMPLETED_PROMOTED_STAGE_RETAINED')
      AND certification_grade='DELTA_PASS'
      AND COALESCE(rows_promoted,0) > 0
      AND cleaned_at IS NULL
    ORDER BY datetime(created_at) DESC LIMIT 1`);
  if (!latest) return { pass: false, reason: "NO_COMPLETED_RETAINED_DELTA" };
  const stage = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs_stage WHERE batch_id=?", latest.batch_id);
  const live = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs WHERE batch_id=?", latest.batch_id);
  const missingLiveFromStage = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c
    FROM hitter_game_logs_stage s
    WHERE s.batch_id=?
      AND NOT EXISTS (
        SELECT 1 FROM hitter_game_logs h
        WHERE h.batch_id=s.batch_id AND h.player_id=s.player_id AND h.game_pk=s.game_pk AND h.group_type=s.group_type
      )`, latest.batch_id);
  const stageRows = asInt(stage && stage.c, 0);
  const liveRows = asInt(live && live.c, 0);
  const rowsStaged = asInt(latest.rows_staged, 0);
  const rowsPromoted = asInt(latest.rows_promoted, 0);
  const missingLiveRows = asInt(missingLiveFromStage && missingLiveFromStage.c, 0);
  const pass = stageRows > 0 && rowsStaged === stageRows && rowsPromoted === liveRows && liveRows > 0 && missingLiveRows === 0;
  let repairPlan = "NOOP_ALREADY_CURRENT";
  if (!pass) {
    if (stageRows > 0 && missingLiveRows > 0) repairPlan = "REPAIR_FROM_RETAINED_STAGE_ONLY";
    else if (stageRows < rowsStaged) repairPlan = "REPAIR_STAGE_FROM_FINAL_GAME_FEED_WINDOW";
    else repairPlan = "BLOCK_RETAINED_DELTA_INCONSISTENT_MANUAL_REVIEW";
  }
  return {
    pass,
    reason: pass ? "COMPLETED_RETAINED_FULL_REFRESH_DELTA_ALREADY_EXISTS" : "COMPLETED_DELTA_NEEDS_SURGICAL_GAP_REPAIR",
    repair_plan: repairPlan,
    latest_delta: latest,
    retained_stage_rows: stageRows,
    live_rows_for_delta_batch: liveRows,
    rows_staged_counter: rowsStaged,
    rows_promoted_counter: rowsPromoted,
    missing_live_rows_from_retained_stage: missingLiveRows,
    stage_min_game_date: stage && stage.min_game_date,
    stage_max_game_date: stage && stage.max_game_date,
    live_min_game_date: live && live.min_game_date,
    live_max_game_date: live && live.max_game_date,
    no_new_batch_safe: pass,
    no_mlb_calls_safe: pass,
    no_stage_write_safe: pass
  };
}

async function getRetainedDeltaCloseoutCandidate(env) {
  const latest = await first(env.STATS_HITTER_DB, `SELECT batch_id, run_id, mode, status, rows_staged, rows_promoted, certification_status, certification_grade,
      delta_start_date, promoted_at, cleaned_at, updated_at, source_season
    FROM hitter_game_log_batches
    WHERE mode='delta_update'
      AND status IN ('DELTA_CERTIFIED_READY_TO_PROMOTE','DELTA_PROMOTING','DELTA_PROMOTED_STAGE_READY_TO_RETAIN')
      AND certification_grade='DELTA_PASS'
      AND COALESCE(rows_staged,0) > 0
      AND cleaned_at IS NULL
    ORDER BY datetime(created_at) DESC LIMIT 1`);
  if (!latest) return { found: false, reason: "NO_DELTA_CLOSEOUT_CANDIDATE" };
  const stage = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs_stage WHERE batch_id=?", latest.batch_id);
  const live = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs WHERE batch_id=?", latest.batch_id);
  const stageRows = asInt(stage && stage.c, 0);
  const liveRows = asInt(live && live.c, 0);
  const rowsStaged = asInt(latest.rows_staged, 0);
  const rowsPromoted = asInt(latest.rows_promoted, 0);
  if (stageRows <= 0 || rowsStaged <= 0) return { found: false, reason: "CLOSEOUT_CANDIDATE_HAS_NO_STAGE_ROWS", latest_delta: latest, retained_stage_rows: stageRows, live_rows_for_delta_batch: liveRows };
  const maxDate = [stage && stage.max_game_date, live && live.max_game_date].map(v => asText(v, null)).filter(Boolean).sort().pop() || DEFAULT_DELTA_RESERVED_START_DATE;
  return {
    found: true,
    reason: "DELTA_CLOSEOUT_OR_PROMOTION_CANDIDATE_FOUND",
    latest_delta: latest,
    retained_stage_rows: stageRows,
    live_rows_for_delta_batch: liveRows,
    rows_staged_counter: rowsStaged,
    rows_promoted_counter: rowsPromoted,
    stage_min_game_date: stage && stage.min_game_date,
    stage_max_game_date: stage && stage.max_game_date,
    live_min_game_date: live && live.min_game_date,
    live_max_game_date: live && live.max_game_date,
    delta_start_date: asText(latest.delta_start_date, DEFAULT_DELTA_RESERVED_START_DATE),
    delta_end_date: maxDate
  };
}

function mlbApiBaseV1(env) {
  return String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
}
function mlbApiBaseV11(env) {
  const base = mlbApiBaseV1(env);
  return base.replace(/\/api\/v1$/i, "/api/v1.1");
}
function gameFeedEndpoint(env, gamePk) {
  return `${mlbApiBaseV11(env)}/game/${encodeURIComponent(gamePk)}/feed/live`;
}
function gameFeedFallbackEndpoint(env, gamePk) {
  return `${mlbApiBaseV1(env)}/game/${encodeURIComponent(gamePk)}/feed/live`;
}
function gameBoxscoreEndpoint(env, gamePk) {
  return `${mlbApiBaseV1(env)}/game/${encodeURIComponent(gamePk)}/boxscore`;
}
async function fetchJsonEndpoint(env, endpoint, fetchTimeoutMs, label) {
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/1.6.10") } }, fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  if (!fetched.ok || !fetched.resp || !fetched.resp.ok) {
    return { ok: false, endpoint, label, error: fetched.error || (fetched.resp ? `HTTP_${fetched.resp.status}` : `${label || "json"}_fetch_failed`), http_status: fetched.resp ? fetched.resp.status : null };
  }
  try {
    return { ok: true, endpoint, label, body: JSON.parse(fetched.text || "{}"), http_status: fetched.resp.status };
  } catch (err) {
    return { ok: false, endpoint, label, error: `${label || "json"}_json_parse_failed:${String(err && err.message ? err.message : err)}`, http_status: fetched.resp ? fetched.resp.status : null };
  }
}
async function fetchGameBoxscoreLikePayload(env, gamePk, fetchTimeoutMs) {
  const attempts = [];
  const endpoints = [
    { label: "feed_live_v1_1", endpoint: gameFeedEndpoint(env, gamePk) },
    { label: "feed_live_v1_fallback", endpoint: gameFeedFallbackEndpoint(env, gamePk) },
    { label: "boxscore_v1_fallback", endpoint: gameBoxscoreEndpoint(env, gamePk) }
  ];
  for (const candidate of endpoints) {
    const result = await fetchJsonEndpoint(env, candidate.endpoint, fetchTimeoutMs, candidate.label);
    attempts.push({ label: candidate.label, endpoint: candidate.endpoint, ok: result.ok, error: result.error || null, http_status: result.http_status || null });
    if (result.ok) return { ok: true, body: result.body, endpoint: candidate.endpoint, label: candidate.label, attempts };
  }
  return { ok: false, body: null, endpoint: endpoints[0].endpoint, label: "all_game_payload_attempts_failed", attempts, error: attempts.map(a => `${a.label}:${a.error || a.http_status || "failed"}`).join(" | ") };
}
function extractBoxscoreContextFromPayload(body, fallbackGamePk, fallbackGameDate) {
  const gameData = body && body.gameData ? body.gameData : {};
  const liveData = body && body.liveData ? body.liveData : {};
  const teamsData = gameData.teams || body.teams || {};
  const boxTeams = (liveData.boxscore && liveData.boxscore.teams) || body.teams || {};
  const gamePk = asInt((gameData.game && gameData.game.pk) || body.gamePk || fallbackGamePk, asInt(fallbackGamePk, 0));
  const gameDate = asText((gameData.datetime && (gameData.datetime.officialDate || gameData.datetime.originalDate)) || body.officialDate || fallbackGameDate, fallbackGameDate);
  const ids = {
    home: teamsData.home && teamsData.home.id !== undefined ? teamsData.home.id : null,
    away: teamsData.away && teamsData.away.id !== undefined ? teamsData.away.id : null
  };
  return { gamePk, gameDate, boxTeams, ids, has_boxscore_teams: !!(boxTeams && (boxTeams.home || boxTeams.away)) };
}

async function fetchFinalGamePksForDate(env, dateStr, fetchTimeoutMs) {
  const endpoint = `${String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "")}/schedule?sportId=1&gameTypes=R&startDate=${encodeURIComponent(dateStr)}&endDate=${encodeURIComponent(dateStr)}`;
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/1.6.10") } }, fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  if (!fetched.ok || !fetched.resp || !fetched.resp.ok) return { ok: false, endpoint, error: fetched.error || (fetched.resp ? `HTTP_${fetched.resp.status}` : "schedule_fetch_failed"), games: [] };
  let body;
  try { body = JSON.parse(fetched.text || "{}"); } catch (err) { return { ok: false, endpoint, error: `schedule_json_parse_failed:${String(err && err.message ? err.message : err)}`, games: [] }; }
  const games = [];
  for (const d of (Array.isArray(body.dates) ? body.dates : [])) {
    for (const g of (Array.isArray(d.games) ? d.games : [])) {
      if (isFinalMlbGame(g) && g && g.gamePk) games.push({ gamePk: asInt(g.gamePk, 0), gameDate: asText(d.date || g.officialDate || dateStr, dateStr) });
    }
  }
  return { ok: true, endpoint, games: games.filter(g => g.gamePk), final_game_count: games.length };
}

function parseFeedBoxscoreHitterRow(playerObj, side, teamId, opponentTeamId, gamePk, gameDate, season, batchId, runId, endpoint) {
  const person = playerObj && playerObj.person ? playerObj.person : {};
  const stats = playerObj && playerObj.stats && playerObj.stats.batting ? playerObj.stats.batting : null;
  const playerId = asInt(person.id || playerObj.id || String(playerObj.personId || "").replace(/^ID/, ""), 0);
  if (!playerId || !stats) return null;
  const statKeys = ["plateAppearances","atBats","hits","runs","rbi","baseOnBalls","strikeOuts","stolenBases","doubles","triples","homeRuns","totalBases"];
  if (!statKeys.some(k => stats[k] !== undefined && stats[k] !== null)) return null;
  const hits = asInt(stats.hits, 0);
  const doubles = asInt(stats.doubles, 0);
  const triples = asInt(stats.triples, 0);
  const homeRuns = asInt(stats.homeRuns, 0);
  const totalBases = stats.totalBases !== undefined ? asInt(stats.totalBases, null) : (hits + doubles + (2 * triples) + (3 * homeRuns));
  return {
    stage_id: `${batchId}_${playerId}_${gamePk}_hitting_delta`,
    batch_id: batchId,
    run_id: runId,
    player_id: playerId,
    player_name: asText(person.fullName || person.boxscoreName || null, null),
    game_pk: gamePk,
    season: asInt(season, DEFAULT_SOURCE_SEASON),
    game_date: gameDate,
    team_id: teamId !== undefined && teamId !== null ? String(teamId) : null,
    opponent_team_id: opponentTeamId !== undefined && opponentTeamId !== null ? String(opponentTeamId) : null,
    is_home: side === "home" ? 1 : 0,
    batting_order: playerObj.battingOrder !== undefined ? asInt(playerObj.battingOrder, null) : null,
    pa: stats.plateAppearances !== undefined ? asInt(stats.plateAppearances, null) : null,
    ab: stats.atBats !== undefined ? asInt(stats.atBats, null) : null,
    hits,
    singles: Math.max(0, hits - doubles - triples - homeRuns),
    doubles,
    triples,
    home_runs: homeRuns,
    runs: stats.runs !== undefined ? asInt(stats.runs, null) : null,
    rbi: stats.rbi !== undefined ? asInt(stats.rbi, null) : null,
    walks: stats.baseOnBalls !== undefined ? asInt(stats.baseOnBalls, null) : null,
    strikeouts: stats.strikeOuts !== undefined ? asInt(stats.strikeOuts, null) : null,
    stolen_bases: stats.stolenBases !== undefined ? asInt(stats.stolenBases, null) : null,
    total_bases: totalBases,
    group_type: GROUP_TYPE,
    data_feed_key: DATA_FEED_KEY,
    source_key: "mlb_statsapi_game_feed_live_hitting_repair_v0_1_0",
    source_endpoint: endpoint,
    source_season: asInt(season, DEFAULT_SOURCE_SEASON),
    source_game_type: "R",
    ingestion_mode: "delta_update",
    certification_status: "delta_update_surgical_gap_repair_staged_unverified",
    certification_grade: null,
    source_confidence: "SOURCE_LOCKED_STATSAPI_GAME_FEED_LIVE_HITTING_REPAIR",
    raw_json: JSON.stringify({ repair_source: "game_feed_live_boxscore", side, gamePk, gameDate, player: playerObj })
  };
}

async function stageDeltaRowsFromFinalGameFeedDate(env, batchId, runId, sourceSeason, dateStr, fetchTimeoutMs, maxRows = 1000) {
  const schedule = await fetchFinalGamePksForDate(env, dateStr, fetchTimeoutMs);
  if (!schedule.ok) return { ok: false, date: dateStr, schedule, external_calls: 1, rows_staged: 0, games_fetched: 0, error: schedule.error };
  let externalCalls = 1, gamesFetched = 0, rowsStaged = 0, rowsSeen = 0;
  const gameSummaries = [];
  const errors = [];
  for (const g of schedule.games) {
    if (rowsStaged >= maxRows) break;
    const payload = await fetchGameBoxscoreLikePayload(env, g.gamePk, fetchTimeoutMs);
    externalCalls += Array.isArray(payload.attempts) ? payload.attempts.length : 1;
    if (!payload.ok) {
      errors.push({ game_pk: g.gamePk, error: payload.error, attempts: payload.attempts });
      return { ok: false, date: dateStr, schedule, external_calls: externalCalls, rows_staged: rowsStaged, games_fetched: gamesFetched, error: payload.error || "game_payload_fetch_failed", failed_game_pk: g.gamePk, failed_attempts: payload.attempts, partial_rows_removed: false };
    }
    const ctx = extractBoxscoreContextFromPayload(payload.body, g.gamePk, g.gameDate || dateStr);
    if (!ctx.has_boxscore_teams) {
      errors.push({ game_pk: g.gamePk, error: "missing_boxscore_teams", endpoint: payload.endpoint, label: payload.label });
      return { ok: false, date: dateStr, schedule, external_calls: externalCalls, rows_staged: rowsStaged, games_fetched: gamesFetched, error: "missing_boxscore_teams", failed_game_pk: g.gamePk, source_endpoint: payload.endpoint, source_label: payload.label };
    }
    let gameRows = 0;
    for (const side of ["away", "home"]) {
      const teamBox = ctx.boxTeams[side] || {};
      const playersObj = teamBox.players || {};
      for (const key of Object.keys(playersObj)) {
        if (rowsStaged >= maxRows) break;
        rowsSeen++;
        const row = parseFeedBoxscoreHitterRow(playersObj[key], side, ctx.ids[side], side === "home" ? ctx.ids.away : ctx.ids.home, ctx.gamePk, ctx.gameDate, sourceSeason, batchId, runId, payload.endpoint);
        if (!row) continue;
        try {
          await insertStageRow(env, row);
        } catch (err) {
          return { ok: false, date: dateStr, schedule, external_calls: externalCalls, rows_staged: rowsStaged, games_fetched: gamesFetched, rows_seen: rowsSeen, error: `stage_insert_failed:${String(err && err.message ? err.message : err)}`, failed_game_pk: g.gamePk, source_endpoint: payload.endpoint, source_label: payload.label };
        }
        rowsStaged++;
        gameRows++;
      }
    }
    gamesFetched++;
    gameSummaries.push({ game_pk: ctx.gamePk, game_date: ctx.gameDate, source_label: payload.label, rows_staged: gameRows, attempts: payload.attempts });
  }
  return { ok: true, date: dateStr, schedule_endpoint: schedule.endpoint, final_game_count: schedule.final_game_count, games_fetched: gamesFetched, rows_seen: rowsSeen, rows_staged: rowsStaged, external_calls: externalCalls, game_summaries: gameSummaries.slice(0, 20), source: "schedule_final_games_then_game_feed_live_v1_1_or_boxscore_fallback", errors };
}

async function repairRetainedDeltaStageFromGameFeedWindow(env, latestDelta, fetchTimeoutMs) {
  const batchId = latestDelta.batch_id;
  const runId = latestDelta.run_id || rid("run_delta_retained_repair");
  const sourceSeason = asInt(latestDelta.source_season, DEFAULT_SOURCE_SEASON);
  const start = asText(latestDelta.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE);
  const existingDates = await all(env.STATS_HITTER_DB, "SELECT DISTINCT date(game_date) AS d FROM hitter_game_logs_stage WHERE batch_id=? ORDER BY d", batchId);
  const existingSet = new Set(existingDates.map(r => r.d).filter(Boolean));
  const liveDates = await all(env.STATS_HITTER_DB, "SELECT DISTINCT date(game_date) AS d FROM hitter_game_logs WHERE batch_id=? ORDER BY d", batchId);
  const liveSet = new Set(liveDates.map(r => r.d).filter(Boolean));
  const end = asText(latestDelta.stage_max_game_date || latestDelta.live_max_game_date || start, start);
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!existingSet.has(d) || !liveSet.has(d)) dates.push(d);
  }
  if (!dates.length && existingSet.size === 0) dates.push(start);
  const repairs = [];
  let externalCalls = 0, rowsStaged = 0;
  for (const d of dates) {
    const r = await stageDeltaRowsFromFinalGameFeedDate(env, batchId, runId, sourceSeason, d, fetchTimeoutMs, 1200);
    repairs.push(r);
    externalCalls += asInt(r.external_calls, 0);
    rowsStaged += asInt(r.rows_staged, 0);
    if (!r.ok) break;
  }
  const stage = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
  const stageRows = asInt(stage && stage.c, 0);
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches
    SET rows_staged=?, status='DELTA_PROMOTING', certification_status='DELTA_HITTER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE', certification_grade='DELTA_PASS', updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`, stageRows, batchId);
  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET batch_id=?, run_id=?, status='DELTA_PROMOTING', next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", batchId, runId, DELTA_CURSOR_KEY);
  return { ok: repairs.every(r => r.ok), dates_repaired: dates, rows_staged_this_repair: rowsStaged, retained_stage_rows_after_repair: stageRows, external_calls: externalCalls, repairs };
}


async function appendNewFinalDatesToRetainedDelta(env, retainedDeltaGuard, latestCompleteGameDate, fetchTimeoutMs) {
  const latest = retainedDeltaGuard.latest_delta;
  const batchId = latest.batch_id;
  const runId = latest.run_id || rid("run_delta_retained_increment");
  const sourceSeason = asInt(latest.source_season, DEFAULT_SOURCE_SEASON);
  const retainedMax = [retainedDeltaGuard.stage_max_game_date, retainedDeltaGuard.live_max_game_date]
    .map(v => asText(v, null))
    .filter(Boolean)
    .sort()
    .pop();
  if (!retainedMax || !latestCompleteGameDate || latestCompleteGameDate <= retainedMax) {
    return { ok: true, no_new_final_dates: true, retained_max_game_date: retainedMax, latest_complete_game_date: latestCompleteGameDate, dates_repaired: [], rows_staged_this_repair: 0, external_calls: 0 };
  }
  const dates = [];
  for (let d = addDays(retainedMax, 1); d <= latestCompleteGameDate; d = addDays(d, 1)) dates.push(d);

  const before = await first(env.STATS_HITTER_DB, "SELECT status, certification_status, certification_grade, rows_staged, rows_promoted FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  const repairs = [];
  let externalCalls = 0, rowsStaged = 0;
  for (const d of dates) {
    const r = await stageDeltaRowsFromFinalGameFeedDate(env, batchId, runId, sourceSeason, d, fetchTimeoutMs, 1200);
    repairs.push(r);
    externalCalls += asInt(r.external_calls, 0);
    rowsStaged += asInt(r.rows_staged, 0);
    if (!r.ok) {
      // Keep retained batch immutable on failed increment attempts. Remove only rows from dates attempted in this failed append.
      const placeholders = dates.map(() => "?").join(",");
      await run(env.STATS_HITTER_DB, `DELETE FROM hitter_game_logs_stage WHERE batch_id=? AND date(game_date) IN (${placeholders})`, batchId, ...dates);
      await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches
        SET status=?, certification_status=?, certification_grade=?, rows_staged=?, rows_promoted=?, updated_at=CURRENT_TIMESTAMP
        WHERE batch_id=?`,
        before && before.status ? before.status : 'COMPLETED_PROMOTED_STAGE_RETAINED',
        before && before.certification_status ? before.certification_status : 'DELTA_HITTER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED',
        before && before.certification_grade ? before.certification_grade : 'DELTA_PASS',
        asInt(before && before.rows_staged, retainedDeltaGuard.retained_stage_rows),
        asInt(before && before.rows_promoted, retainedDeltaGuard.live_rows_for_delta_batch),
        batchId
      );
      return { ok: false, repair_type: 'APPEND_NEW_FINAL_DATES_TO_RETAINED_DELTA', retained_batch_immutable_on_failure: true, retained_max_game_date: retainedMax, latest_complete_game_date: latestCompleteGameDate, dates_repaired: dates, rows_staged_this_repair: rowsStaged, external_calls: externalCalls, failed_repair: r, repairs };
    }
  }
  const stage = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
  const stageRows = asInt(stage && stage.c, 0);
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches
    SET rows_staged=?, status='DELTA_PROMOTING', certification_status='DELTA_HITTER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE', certification_grade='DELTA_PASS', updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`,
    stageRows,
    batchId
  );
  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET batch_id=?, run_id=?, status='DELTA_PROMOTING', next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", batchId, runId, DELTA_CURSOR_KEY);
  return { ok: true, repair_type: 'APPEND_NEW_FINAL_DATES_TO_RETAINED_DELTA', retained_max_game_date: retainedMax, latest_complete_game_date: latestCompleteGameDate, dates_repaired: dates, rows_staged_this_repair: rowsStaged, retained_stage_rows_after_repair: stageRows, retained_stage_min_game_date: stage && stage.min_game_date, retained_stage_max_game_date: stage && stage.max_game_date, external_calls: externalCalls, repairs };
}


async function getCalendarTallyHitterGapScope(env, inputJson = {}) {
  return {
    ok: true,
    disabled: true,
    version: VERSION,
    reason: "calendar_scope_removed_from_hitter_worker",
    source_table: null,
    gaps: [],
    total_gap_rows: 0,
    selected_games: 0,
    note: "Coverage/gap scope is owned by delta-certifier/calendar. This worker no longer reads tally tables to drive mining."
  };
}

async function stageDeltaRowsFromScopedGamePks(env, batchId, runId, sourceSeason, scope, fetchTimeoutMs, maxRows = 1200) {
  return {
    ok: true,
    disabled: true,
    version: VERSION,
    reason: "calendar_scoped_repair_removed_from_hitter_worker",
    external_calls: 0,
    rows_staged: 0,
    games_fetched: 0,
    note: "Hitter game logs mining uses its own delta windows only; calendar/tally-scoped repair is not performed inside this worker."
  };
}

async function runCalendarTallyScopedHitterRepairIfNeeded(env, input, inputJson, baseGate) {
  return null;
}

async function runRetainedDeltaNewFinalDateIncrement(env, retainedDeltaGuard, latestCompleteGameDate, input, inputJson, baseGate) {
  const latest = retainedDeltaGuard.latest_delta;
  const fetchTimeoutMs = cap(inputJson.fetch_timeout_ms || DEFAULT_FETCH_TIMEOUT_MS, 3000, 15000);
  const owner = asText(input.request_id, rid("delta_retained_increment_owner"));
  const lock = await acquireBatchLock(env, latest.batch_id, owner, DEFAULT_LOCK_STALE_SECONDS);
  if (!lock.ok) return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_RETAINED_INCREMENT_LOCK_BUSY", batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: retainedDeltaGuard, latest_complete_game_date: latestCompleteGameDate, continuation_required: true, orchestrator_should_self_continue: true, external_calls_performed: 0, rows_read: 0, rows_written: 0, lock };
  try {
    const append = await appendNewFinalDatesToRetainedDelta(env, retainedDeltaGuard, latestCompleteGameDate, fetchTimeoutMs);
    if (!append.ok) {
      await releaseBatchLock(env, latest.batch_id, owner);
      return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_RETAINED_INCREMENT_STAGE_REPAIR_FAILED_RETAINED_BATCH_UNCHANGED", certification: "DELTA_HITTER_GAME_LOGS_NEW_FINAL_DATE_STAGE_REPAIR_FAILED_RETAINED_BATCH_UNCHANGED", batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: retainedDeltaGuard, retained_batch_immutable_on_failure: true, new_final_date_increment: append, continuation_required: false, external_calls_performed: asInt(append.external_calls, 0), rows_read: asInt(append.external_calls, 0), rows_written: asInt(append.rows_staged_this_repair, 0) };
    }
    const windowInfo = {
      ok: true,
      delta_start_date: asText(latest.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE),
      delta_end_date: latestCompleteGameDate,
      latest_complete_game_date: latestCompleteGameDate,
      true_increment_date_discovery: true,
      repair_plan: "APPEND_NEW_FINAL_DATES_TO_RETAINED_DELTA",
      retained_previous_max_game_date: append.retained_max_game_date
    };
    const cert = await finalizeDeltaIfReady(env, latest.batch_id, latest.run_id || rid("run_delta_retained_increment"), windowInfo, 0, baseGate, { ...inputJson, request_id: input.request_id || null, chain_id: input.chain_id || null });
    await releaseBatchLock(env, latest.batch_id, owner);
    return { ok: cert.pass, data_ok: cert.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: cert.done ? cert.status : "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: cert.certification, certification_grade: cert.grade, batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: retainedDeltaGuard, true_increment_date_discovery: true, new_final_date_increment: append, rows_read: asInt(append.external_calls, 0), rows_written: asInt(append.rows_staged_this_repair, 0) + asInt(cert.rows_promoted, 0), rows_promoted: cert.rows_promoted || 0, stage_rows_after_clean: cert.stage_rows_after_clean, external_calls_performed: asInt(append.external_calls, 0), continuation_required: !cert.done, orchestrator_should_self_continue: !cert.done, manual_wake_required: false, no_browser_pump: true, final_checks: cert.checks, timestamp_utc: nowUtc() };
  } catch (err) {
    await releaseBatchLock(env, latest.batch_id, owner);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_RETAINED_INCREMENT_RETRYABLE", batch_id: latest.batch_id, mode: "delta_update", error: String(err && err.message ? err.message : err).slice(0, 900), continuation_required: true, orchestrator_should_self_continue: true, external_calls_performed: 0, rows_read: 0, rows_written: 0 };
  }
}

async function runRetainedDeltaSurgicalRepairIfNeeded(env, retainedDeltaGuard, input, inputJson, baseGate) {
  const latestBase = retainedDeltaGuard.latest_delta;
  if (!latestBase || !latestBase.batch_id) return null;
  const latest = { ...latestBase, stage_min_game_date: retainedDeltaGuard.stage_min_game_date, stage_max_game_date: retainedDeltaGuard.stage_max_game_date, live_min_game_date: retainedDeltaGuard.live_min_game_date, live_max_game_date: retainedDeltaGuard.live_max_game_date };
  const fetchTimeoutMs = cap(inputJson.fetch_timeout_ms || DEFAULT_FETCH_TIMEOUT_MS, 3000, 15000);
  const owner = asText(input.request_id, rid("delta_retained_repair_owner"));
  const lock = await acquireBatchLock(env, latest.batch_id, owner, DEFAULT_LOCK_STALE_SECONDS);
  if (!lock.ok) return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_RETAINED_REPAIR_LOCK_BUSY", batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: retainedDeltaGuard, continuation_required: true, orchestrator_should_self_continue: true, external_calls_performed: 0, rows_read: 0, rows_written: 0, lock };
  try {
    let stageRepair = null;
    if (retainedDeltaGuard.repair_plan === "REPAIR_STAGE_FROM_FINAL_GAME_FEED_WINDOW") {
      stageRepair = await repairRetainedDeltaStageFromGameFeedWindow(env, latest, fetchTimeoutMs);
      if (!stageRepair.ok) {
        await releaseBatchLock(env, latest.batch_id, owner);
        return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_RETAINED_STAGE_REPAIR_FAILED", certification: "DELTA_HITTER_GAME_LOGS_SURGICAL_STAGE_REPAIR_FAILED", batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: retainedDeltaGuard, stage_repair: stageRepair, continuation_required: false, external_calls_performed: asInt(stageRepair.external_calls, 0), rows_read: asInt(stageRepair.external_calls, 0), rows_written: asInt(stageRepair.rows_staged_this_repair, 0) };
      }
    } else {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='DELTA_PROMOTING', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", latest.batch_id);
    }
    const batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", latest.batch_id);
    const windowInfo = {
      ok: true,
      delta_start_date: asText(batch && batch.delta_start_date, DEFAULT_DELTA_RESERVED_START_DATE),
      delta_end_date: asText(retainedDeltaGuard.stage_max_game_date || retainedDeltaGuard.live_max_game_date || (batch && batch.delta_start_date) || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE),
      surgical_gap_repair: true,
      repair_plan: retainedDeltaGuard.repair_plan
    };
    const cert = await finalizeDeltaIfReady(env, latest.batch_id, latest.run_id || (batch && batch.run_id) || rid("run_delta_retained_repair"), windowInfo, 0, baseGate, { ...inputJson, request_id: input.request_id || null, chain_id: input.chain_id || null });
    await releaseBatchLock(env, latest.batch_id, owner);
    return { ok: cert.pass, data_ok: cert.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: cert.done ? cert.status : "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: cert.certification, certification_grade: cert.grade, batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: retainedDeltaGuard, surgical_gap_repair: true, stage_repair: stageRepair, rows_read: stageRepair ? asInt(stageRepair.external_calls, 0) : 0, rows_written: (stageRepair ? asInt(stageRepair.rows_staged_this_repair, 0) : 0) + asInt(cert.rows_promoted, 0), rows_promoted: cert.rows_promoted || 0, stage_rows_after_clean: cert.stage_rows_after_clean, external_calls_performed: stageRepair ? asInt(stageRepair.external_calls, 0) : 0, continuation_required: !cert.done, orchestrator_should_self_continue: !cert.done, manual_wake_required: false, no_browser_pump: true, final_checks: cert.checks, timestamp_utc: nowUtc() };
  } catch (err) {
    await releaseBatchLock(env, latest.batch_id, owner);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_SURGICAL_REPAIR_RETRYABLE", batch_id: latest.batch_id, mode: "delta_update", error: String(err && err.message ? err.message : err).slice(0, 900), continuation_required: true, orchestrator_should_self_continue: true, external_calls_performed: 0, rows_read: 0, rows_written: 0 };
  }
}


async function insertOrReplaceLiveHitterRowFromStageKey(env, batchId, playerId, gamePk, groupType, grade) {
  const r = await first(env.STATS_HITTER_DB, `SELECT
      s.stage_id,
      s.player_id,s.game_pk,s.season,s.game_date,s.team_id,s.opponent_team_id,s.is_home,s.batting_order,
      s.pa,s.ab,s.hits,s.singles,s.doubles,s.triples,s.home_runs,s.runs,s.rbi,s.walks,s.strikeouts,s.stolen_bases,s.total_bases,
      s.raw_json,s.source_key,s.source_confidence,s.group_type,s.data_feed_key,s.source_endpoint,s.source_season,s.source_game_type,s.ingestion_mode,s.batch_id,s.run_id
    FROM hitter_game_logs_stage s
    WHERE s.batch_id=? AND s.player_id=? AND s.game_pk=? AND s.group_type=?
    LIMIT 1`, batchId, playerId, gamePk, groupType || GROUP_TYPE);
  if (!r) return { restored: 0, reason: "stage_row_not_found" };
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_logs (
      player_id,game_pk,season,game_date,team_id,opponent_team_id,is_home,batting_order,
      pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
      raw_json,source_key,source_confidence,updated_at,group_type,data_feed_key,source_endpoint,source_season,source_game_type,ingestion_mode,batch_id,run_id,certification_status,certification_grade,certified_at,promoted_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      r.player_id, r.game_pk, r.season, r.game_date, r.team_id, r.opponent_team_id, r.is_home, r.batting_order,
      r.pa, r.ab, r.hits, r.singles, r.doubles, r.triples, r.home_runs, r.runs, r.rbi, r.walks, r.strikeouts, r.stolen_bases, r.total_bases,
      r.raw_json, r.source_key, r.source_confidence, r.group_type, r.data_feed_key, r.source_endpoint, r.source_season, r.source_game_type, r.ingestion_mode, r.batch_id, r.run_id, 'delta_update_certified_promoted', grade || 'DELTA_REPAIR_PASS'
  );
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_logs_stage
    SET row_status='promoted', certification_status='delta_update_certified', certification_grade=?, promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
    WHERE stage_id=? AND batch_id=?`, grade || 'DELTA_REPAIR_PASS', r.stage_id, batchId);
  return { restored: 1, row: r };
}

async function liveHitterKeyCount(env, batchId, playerId, gamePk, groupType) {
  const row = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND player_id=? AND game_pk=? AND group_type=?`, batchId, playerId, gamePk, groupType || GROUP_TYPE);
  return asInt(row && row.c, 0);
}

async function stageHitterKeyCount(env, batchId, playerId, gamePk, groupType) {
  const row = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=? AND player_id=? AND game_pk=? AND group_type=?`, batchId, playerId, gamePk, groupType || GROUP_TYPE);
  return asInt(row && row.c, 0);
}

async function currentHitterLiveTruth(env) {
  const row = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS live_rows,
      COUNT(DISTINCT player_id || '|' || game_pk || '|' || group_type) AS distinct_live_keys
    FROM hitter_game_logs`);
  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (
      SELECT player_id, game_pk, group_type, COUNT(*) AS n
      FROM hitter_game_logs
      GROUP BY player_id, game_pk, group_type
      HAVING n > 1
    )`);
  return { live_rows: asInt(row && row.live_rows, 0), distinct_live_keys: asInt(row && row.distinct_live_keys, 0), duplicate_live_keys: asInt(dup && dup.c, 0) };
}

async function createOrRefreshHitterRepairAnchor(env, latest) {
  const existing = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_game_log_repair_registry WHERE registry_key='hitter_game_logs_delta_repair_anchor_1'`);
  if (existing) return { created: false, registry: existing };
  const anchor = await first(env.STATS_HITTER_DB, `SELECT
      s.batch_id AS target_batch_id,
      s.player_id,
      s.game_pk,
      s.season,
      s.group_type,
      s.game_date,
      s.source_endpoint
    FROM hitter_game_logs_stage s
    JOIN hitter_game_logs h
      ON h.batch_id=s.batch_id
     AND h.player_id=s.player_id
     AND h.game_pk=s.game_pk
     AND h.group_type=s.group_type
    WHERE s.batch_id=?
    ORDER BY s.game_date, s.player_id, s.game_pk
    LIMIT 1`, latest.batch_id);
  if (!anchor) return { created: false, registry: null, reason: "no_joined_live_stage_anchor_available" };
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_repair_registry
    (registry_key,target_batch_id,player_id,game_pk,season,group_type,game_date,source_endpoint,status,created_by_version,notes,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    'hitter_game_logs_delta_repair_anchor_1', anchor.target_batch_id, anchor.player_id, anchor.game_pk, anchor.season, anchor.group_type || GROUP_TYPE, anchor.game_date, anchor.source_endpoint,
    'REPAIR_ANCHOR_RETAINED_FROM_LOCKED_LIVE_AND_STAGE', VERSION, 'Controlled incremental repair anchor. Main/live may be deleted; retained stage restores. If both live and stage are deleted, worker scoped re-fetches this player/game key only.'
  );
  const registry = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_game_log_repair_registry WHERE registry_key='hitter_game_logs_delta_repair_anchor_1'`);
  return { created: true, registry };
}

async function scopedRemineHitterGameLogKey(env, registry, input, fetchTimeoutMs) {
  const batchId = registry.target_batch_id;
  const runId = asText(input.run_id || rid("run_hitter_logs_scoped_repair"), rid("run_hitter_logs_scoped_repair"));
  const playerId = asInt(registry.player_id, 0);
  const gamePk = asInt(registry.game_pk, 0);
  const season = asInt(registry.season, DEFAULT_SOURCE_SEASON);
  const groupType = asText(registry.group_type, GROUP_TYPE);
  const gameDate = asText(registry.game_date, null);
  const endpoint = endpointFor(env, playerId, season);
  if (!playerId || !gamePk || !gameDate) return { ok: false, error: "registry_missing_required_key", external_calls: 0, rows_staged: 0, rows_promoted: 0 };

  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/1.6.13") } }, fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  if (!fetched.ok || !fetched.resp || !fetched.resp.ok) {
    return { ok: false, error: fetched.error || (fetched.resp ? `HTTP_${fetched.resp.status}` : "fetch_failed"), endpoint, external_calls: 1, rows_staged: 0, rows_promoted: 0 };
  }
  let body;
  try { body = JSON.parse(fetched.text || "{}"); } catch (err) { return { ok: false, error: `json_parse_failed:${String(err && err.message ? err.message : err)}`, endpoint, external_calls: 1, rows_staged: 0, rows_promoted: 0 }; }
  const splits = body && body.stats && body.stats[0] && Array.isArray(body.stats[0].splits) ? body.stats[0].splits : [];
  let staged = 0;
  let matchedRawSplits = 0;
  for (const split of splits) {
    const row = parseHitterSplitForWindow(split, playerId, null, season, batchId, runId, "delta_update", endpoint, gameDate, gameDate);
    if (!row || asInt(row.game_pk, 0) !== gamePk || row.group_type !== groupType) continue;
    row.stage_id = `${batchId}_${playerId}_${gamePk}_hitting_delta_scoped_repair`;
    row.certification_status = "delta_update_scoped_repair_certified";
    row.certification_grade = "DELTA_REPAIR_PASS";
    row.source_confidence = "SOURCE_LOCKED_STATSAPI_GAMELOG_HITTING_SCOPED_REPAIR";
    await insertStageRow(env, row);
    staged += 1;
    matchedRawSplits += 1;
    break;
  }
  if (staged <= 0) return { ok: false, error: "scoped_key_not_returned_by_source", endpoint, external_calls: 1, raw_split_count: splits.length, matched_raw_splits: matchedRawSplits, rows_staged: 0, rows_promoted: 0 };
  const restored = await insertOrReplaceLiveHitterRowFromStageKey(env, batchId, playerId, gamePk, groupType, "DELTA_REPAIR_PASS");
  const promoted = asInt(restored.restored, 0);
  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_repair_registry
    SET source_endpoint=?, status='REPAIR_ANCHOR_RETAINED_FROM_SCOPED_REPAIR', created_by_version=?, updated_at=CURRENT_TIMESTAMP
    WHERE registry_key='hitter_game_logs_delta_repair_anchor_1'`, endpoint, VERSION);
  return { ok: promoted === 1, endpoint, external_calls: 1, raw_split_count: splits.length, matched_raw_splits: matchedRawSplits, rows_staged: staged, rows_promoted: promoted, player_id: playerId, game_pk: gamePk, game_date: gameDate };
}


async function shouldBypassHitterAnchorNoopForNewFinalDate(env, latestGuard, inputJson) {
  if (!latestGuard || !latestGuard.pass || !latestGuard.latest_delta) {
    return { bypass: false, reason: "retained_delta_not_clean" };
  }
  const latest = latestGuard.latest_delta;
  const retainedMax = [latestGuard.stage_max_game_date, latestGuard.live_max_game_date]
    .map(v => asText(v, null))
    .filter(Boolean)
    .sort()
    .pop();
  if (!retainedMax) return { bypass: false, reason: "no_retained_max_game_date" };
  const timeoutMs = cap((inputJson && (inputJson.fetch_timeout_ms || inputJson.FETCH_TIMEOUT_MS)) || DEFAULT_FETCH_TIMEOUT_MS, 1500, 10000);
  const sourceWindow = await determineLatestCompleteGameDate(
    env,
    asText(latest.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE),
    timeoutMs
  );
  if (sourceWindow && sourceWindow.ok && sourceWindow.latest_complete_game_date > retainedMax) {
    return {
      bypass: true,
      reason: "NEW_FINAL_DATE_AVAILABLE_BYPASS_REPAIR_ANCHOR_NOOP",
      retained_max_game_date: retainedMax,
      source_final_date_check: sourceWindow
    };
  }
  return {
    bypass: false,
    reason: sourceWindow && sourceWindow.ok ? "NO_NEW_FINAL_DATE" : "SOURCE_FINAL_DATE_CHECK_UNAVAILABLE_NO_MUTATION_FROM_ANCHOR_GATE",
    retained_max_game_date: retainedMax,
    source_final_date_check: sourceWindow
  };
}

async function runHitterGameLogsGoldRepairGate(env, input, inputJson, baseGate) {
  const latestGuard = await getCompletedRetainedDeltaGuard(env);
  if (!latestGuard.latest_delta) return { handled: false, reason: "no_completed_retained_delta_available" };
  const latest = latestGuard.latest_delta;
  const fetchTimeoutMs = cap(inputJson.fetch_timeout_ms || env.FETCH_TIMEOUT_MS || DEFAULT_FETCH_TIMEOUT_MS, 1500, 10000);
  const liveTruthBefore = await currentHitterLiveTruth(env);
  const registry = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_game_log_repair_registry WHERE registry_key='hitter_game_logs_delta_repair_anchor_1'`);

  if (registry) {
    const batchId = registry.target_batch_id;
    const playerId = asInt(registry.player_id, 0);
    const gamePk = asInt(registry.game_pk, 0);
    const groupType = asText(registry.group_type, GROUP_TYPE);
    const liveCount = await liveHitterKeyCount(env, batchId, playerId, gamePk, groupType);
    const stageCount = await stageHitterKeyCount(env, batchId, playerId, gamePk, groupType);
    if (liveCount <= 0 && stageCount > 0) {
      const restored = await insertOrReplaceLiveHitterRowFromStageKey(env, batchId, playerId, gamePk, groupType, "DELTA_REPAIR_PASS");
      const liveTruthAfter = await currentHitterLiveTruth(env);
      const cursorJson = { locked_delta_batch_id: batchId, registry_key: registry.registry_key, restored_rows: asInt(restored.restored, 0), restored_player_id: playerId, restored_game_pk: gamePk, live_rows_after: liveTruthAfter.live_rows, distinct_live_keys_after: liveTruthAfter.distinct_live_keys, duplicate_live_keys: liveTruthAfter.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_new_batch: true, no_stage_writes: true, restored_from_retained_stage_before_queue: true };
      await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor
        (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,cursor_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, DELTA_CURSOR_KEY, batchId, input.run_id || rid("run_delta_hitter_restore"), "delta_update", "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", asInt(registry.season, DEFAULT_SOURCE_SEASON), DEFAULT_BASE_BACKFILL_CUTOFF_DATE, registry.game_date || DEFAULT_DELTA_RESERVED_START_DATE, 1, 1, 1, 0, JSON.stringify(cursorJson));
      return { handled: true, output: { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification: "HITTER_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification_grade: "DELTA_REPAIR_PASS", restored_rows: asInt(restored.restored, 0), queued: false, request_id_created: null, no_mlb_calls: true, no_stage_writes: true, no_full_sweep: true, no_new_batch: true, rows_read: 1, rows_written: asInt(restored.restored, 0), rows_promoted: asInt(restored.restored, 0), external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, delta_restore_gate: cursorJson, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowUtc() } };
    }
    if (liveCount <= 0 && stageCount <= 0) {
      const repair = await scopedRemineHitterGameLogKey(env, registry, input, fetchTimeoutMs);
      const liveTruthAfter = await currentHitterLiveTruth(env);
      const cursorJson = { locked_delta_batch_id: batchId, missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, scoped_expected_game_key: { target_batch_id: batchId, player_id: playerId, game_pk: gamePk, season: asInt(registry.season, DEFAULT_SOURCE_SEASON), group_type: groupType, game_date: registry.game_date, source_endpoint: registry.source_endpoint || endpointFor(env, playerId, asInt(registry.season, DEFAULT_SOURCE_SEASON)) }, external_calls_performed: asInt(repair.external_calls, 0), no_full_sweep: true, rows_staged: asInt(repair.rows_staged, 0), rows_promoted: asInt(repair.rows_promoted, 0), live_rows_after: liveTruthAfter.live_rows, distinct_live_keys_after: liveTruthAfter.distinct_live_keys, duplicate_live_keys: liveTruthAfter.duplicate_live_keys, stage_retained_for_repair: true, repair_ok: repair.ok === true, repair_error: repair.error || null };
      const status = repair.ok ? "DELTA_HITTER_GAME_LOGS_SCOPED_REPAIR_COMPLETED" : "DELTA_HITTER_GAME_LOGS_SCOPED_REPAIR_FAILED";
      await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor
        (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,cursor_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, DELTA_CURSOR_KEY, batchId, input.run_id || rid("run_delta_hitter_scoped_repair"), "delta_update", status, asInt(registry.season, DEFAULT_SOURCE_SEASON), DEFAULT_BASE_BACKFILL_CUTOFF_DATE, registry.game_date || DEFAULT_DELTA_RESERVED_START_DATE, 1, 1, 1, asInt(repair.external_calls, 0), JSON.stringify(cursorJson));
      return { handled: true, output: { ok: repair.ok === true, data_ok: repair.ok === true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status, certification: repair.ok ? "DELTA_HITTER_GAME_LOGS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED" : "DELTA_HITTER_GAME_LOGS_SCOPED_REPAIR_FAILED", certification_grade: repair.ok ? "DELTA_REPAIR_PASS" : "DELTA_REPAIR_FAIL", missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, no_full_sweep: true, rows_read: asInt(repair.external_calls, 0), rows_written: asInt(repair.rows_staged, 0) + asInt(repair.rows_promoted, 0), rows_staged: asInt(repair.rows_staged, 0), rows_promoted: asInt(repair.rows_promoted, 0), external_calls_performed: asInt(repair.external_calls, 0), continuation_required: false, orchestrator_should_self_continue: false, delta_scoped_repair_gate: cursorJson, repair, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowUtc() } };
    }
    if (liveCount > 0 && stageCount <= 0) {
      const repair = await scopedRemineHitterGameLogKey(env, registry, input, fetchTimeoutMs);
      const liveTruthAfter = await currentHitterLiveTruth(env);
      const cursorJson = { locked_delta_batch_id: batchId, retained_stage_missing_for_anchor: true, live_row_already_present: true, scoped_players_to_refetch: 1, external_calls_performed: asInt(repair.external_calls, 0), no_full_sweep: true, rows_staged: asInt(repair.rows_staged, 0), rows_promoted: 0, live_rows_after: liveTruthAfter.live_rows, duplicate_live_keys: liveTruthAfter.duplicate_live_keys, stage_retained_for_repair: repair.ok === true };
      const status = repair.ok ? "DELTA_HITTER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIRED" : "DELTA_HITTER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIR_FAILED";
      await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor
        (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,cursor_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, DELTA_CURSOR_KEY, batchId, input.run_id || rid("run_delta_hitter_stage_scoped_repair"), "delta_update", status, asInt(registry.season, DEFAULT_SOURCE_SEASON), DEFAULT_BASE_BACKFILL_CUTOFF_DATE, registry.game_date || DEFAULT_DELTA_RESERVED_START_DATE, 1, 1, 1, asInt(repair.external_calls, 0), JSON.stringify(cursorJson));
      return { handled: true, output: { ok: repair.ok === true, data_ok: repair.ok === true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status, certification: repair.ok ? "DELTA_HITTER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIR_CERTIFIED" : "DELTA_HITTER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIR_FAILED", certification_grade: repair.ok ? "DELTA_REPAIR_PASS" : "DELTA_REPAIR_FAIL", scoped_players_to_refetch: 1, no_full_sweep: true, rows_read: asInt(repair.external_calls, 0), rows_written: asInt(repair.rows_staged, 0), rows_staged: asInt(repair.rows_staged, 0), rows_promoted: 0, external_calls_performed: asInt(repair.external_calls, 0), continuation_required: false, orchestrator_should_self_continue: false, delta_stage_repair_gate: cursorJson, repair, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowUtc() } };
    }
    const newFinalDateGate = await shouldBypassHitterAnchorNoopForNewFinalDate(env, latestGuard, inputJson || {});
    if (newFinalDateGate.bypass) {
      return { handled: false, reason: newFinalDateGate.reason, retained_delta_guard: latestGuard, source_final_date_check: newFinalDateGate.source_final_date_check, retained_max_game_date: newFinalDateGate.retained_max_game_date };
    }
    const cursorJson = { locked_delta_batch_id: batchId, repair_registry_key: registry.registry_key, anchor_player_id: playerId, anchor_game_pk: gamePk, anchor_game_date: registry.game_date, live_rows: liveTruthBefore.live_rows, distinct_live_keys: liveTruthBefore.distinct_live_keys, duplicate_live_keys: liveTruthBefore.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, repair_anchor_present: true, source_final_date_gate: newFinalDateGate, next_test: "delete this exact live key only to test retained-stage restore; delete live and retained stage key to test scoped re-fetch" };
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor
      (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,cursor_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, DELTA_CURSOR_KEY, batchId, input.run_id || rid("run_delta_hitter_anchor_noop"), "delta_update", "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", asInt(registry.season, DEFAULT_SOURCE_SEASON), DEFAULT_BASE_BACKFILL_CUTOFF_DATE, registry.game_date || DEFAULT_DELTA_RESERVED_START_DATE, 1, liveTruthBefore.live_rows, liveTruthBefore.live_rows, 0, JSON.stringify(cursorJson));
    return { handled: true, output: { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", certification: "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", certification_grade: "DELTA_ANCHOR_PASS", rows_read: liveTruthBefore.live_rows, rows_written: 1, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, repair_anchor: cursorJson, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowUtc() } };
  }

  if (latestGuard.pass) {
    const newFinalDateGate = await shouldBypassHitterAnchorNoopForNewFinalDate(env, latestGuard, inputJson || {});
    if (newFinalDateGate.bypass) {
      return { handled: false, reason: newFinalDateGate.reason, retained_delta_guard: latestGuard, source_final_date_check: newFinalDateGate.source_final_date_check, retained_max_game_date: newFinalDateGate.retained_max_game_date };
    }
    const anchor = await createOrRefreshHitterRepairAnchor(env, latest);
    const reg = anchor.registry;
    const cursorJson = { locked_delta_batch_id: latest.batch_id, repair_registry_key: reg ? reg.registry_key : null, anchor_player_id: reg ? asInt(reg.player_id, null) : null, anchor_game_pk: reg ? asInt(reg.game_pk, null) : null, anchor_game_date: reg ? reg.game_date : null, live_rows: liveTruthBefore.live_rows, distinct_live_keys: liveTruthBefore.distinct_live_keys, duplicate_live_keys: liveTruthBefore.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, repair_anchor_created: !!(anchor.created), anchor_reason: anchor.reason || null, source_final_date_gate: newFinalDateGate };
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor
      (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,cursor_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, DELTA_CURSOR_KEY, latest.batch_id, input.run_id || rid("run_delta_hitter_anchor_create"), "delta_update", "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", asInt(latest.source_season, DEFAULT_SOURCE_SEASON), DEFAULT_BASE_BACKFILL_CUTOFF_DATE, latest.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, 1, liveTruthBefore.live_rows, liveTruthBefore.live_rows, 0, JSON.stringify(cursorJson));
    return { handled: true, output: { ok: !!reg, data_ok: !!reg, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: reg ? "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP" : "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_CREATE_FAILED", certification: reg ? "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP" : "DELTA_HITTER_GAME_LOGS_REPAIR_ANCHOR_CREATE_FAILED", certification_grade: reg ? "DELTA_ANCHOR_PASS" : "DELTA_ANCHOR_FAIL", rows_read: liveTruthBefore.live_rows, rows_written: reg ? 2 : 1, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, repair_anchor: cursorJson, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowUtc() } };
  }

  return { handled: false, reason: "retained_delta_not_clean_or_no_registry", retained_delta_guard: latestGuard };
}

async function runDeltaUpdateTick(env, input, inputJson) {
  const baseGate = await getLockedBaseIntegrity(env);
  if (!baseGate.pass) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BASE_INTEGRITY_FAIL", certification: "DELTA_BLOCKED_BASE_INTEGRITY_FAIL", base_integrity_gate: baseGate, rows_read: 0, rows_written: 0, external_calls_performed: 0, continuation_required: false, no_live_mutation: true };
  }
  const allowRepeatFullRefresh = inputJson.force_full_delta_refresh === true || inputJson.allow_repeat_full_delta_refresh === true;
  if (!allowRepeatFullRefresh) {
    const preAnchorRetainedDeltaGuard = await getCompletedRetainedDeltaGuard(env);
    if (preAnchorRetainedDeltaGuard.latest_delta && ["REPAIR_FROM_RETAINED_STAGE_ONLY","REPAIR_STAGE_FROM_FINAL_GAME_FEED_WINDOW"].includes(preAnchorRetainedDeltaGuard.repair_plan)) {
      const repaired = await runRetainedDeltaSurgicalRepairIfNeeded(env, preAnchorRetainedDeltaGuard, input, inputJson, baseGate);
      if (repaired) {
        return {
          ...repaired,
          retained_stage_promotion_before_anchor_noop_v1_6_15: true,
          anchor_noop_blocked_until_retained_stage_live_parity: true
        };
      }
    }
    if (preAnchorRetainedDeltaGuard.latest_delta && preAnchorRetainedDeltaGuard.repair_plan === "BLOCK_RETAINED_DELTA_INCONSISTENT_MANUAL_REVIEW") {
      return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_RETAINED_GAP_REPAIR_BLOCKED", certification: "DELTA_HITTER_GAME_LOGS_RETAINED_DELTA_INCONSISTENT_MANUAL_REVIEW", mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: preAnchorRetainedDeltaGuard, no_new_batch: true, no_mlb_calls: true, no_live_mutation: true, anchor_noop_blocked_until_retained_stage_live_parity: true, continuation_required: false };
    }
  }
  const goldGate = await runHitterGameLogsGoldRepairGate(env, input, inputJson || {}, baseGate);
  if (goldGate && goldGate.handled) return goldGate.output;
  if (!allowRepeatFullRefresh) {
    const calendarScopedRepair = await runCalendarTallyScopedHitterRepairIfNeeded(env, input, inputJson || {}, baseGate);
    if (calendarScopedRepair) return calendarScopedRepair;
  }
  if (!allowRepeatFullRefresh) {
    const closeoutCandidate = await getRetainedDeltaCloseoutCandidate(env);
    if (closeoutCandidate.found) {
      const latest = closeoutCandidate.latest_delta;
      const owner = asText(input.request_id, rid("delta_closeout_owner"));
      const lock = await acquireBatchLock(env, latest.batch_id, owner, DEFAULT_LOCK_STALE_SECONDS);
      if (!lock.ok) {
        return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_CLOSEOUT_LOCK_BUSY", certification_grade: "DELTA_PASS", batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, closeout_candidate: closeoutCandidate, continuation_required: true, orchestrator_should_self_continue: true, external_calls_performed: 0, rows_read: 0, rows_written: 0, lock };
      }
      try {
        const windowInfo = {
          ok: true,
          delta_start_date: closeoutCandidate.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE,
          delta_end_date: closeoutCandidate.delta_end_date || closeoutCandidate.stage_max_game_date || closeoutCandidate.live_max_game_date || DEFAULT_DELTA_RESERVED_START_DATE,
          latest_complete_game_date: closeoutCandidate.delta_end_date || closeoutCandidate.stage_max_game_date || closeoutCandidate.live_max_game_date || DEFAULT_DELTA_RESERVED_START_DATE,
          retained_status_closeout: true,
          repair_plan: "FINAL_RETAINED_STATUS_CLOSEOUT"
        };
        const cert = await finalizeDeltaIfReady(env, latest.batch_id, latest.run_id || rid("run_delta_closeout"), windowInfo, 0, baseGate, { ...inputJson, request_id: input.request_id || null, chain_id: input.chain_id || null });
        await releaseBatchLock(env, latest.batch_id, owner);
        return { ok: cert.pass, data_ok: cert.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: cert.done ? cert.status : "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", finalization_status: cert.status, certification: cert.certification, certification_grade: cert.grade, batch_id: latest.batch_id, mode: "delta_update", base_integrity_gate: baseGate, closeout_candidate: closeoutCandidate, rows_read: 0, rows_written: cert.rows_promoted || 0, rows_promoted: cert.rows_promoted || 0, stage_rows_after_clean: cert.stage_rows_after_clean, external_calls_performed: 0, continuation_required: !cert.done, orchestrator_should_self_continue: !cert.done, manual_wake_required: false, no_browser_pump: true, final_checks: cert.checks, timestamp_utc: nowUtc() };
      } catch (err) {
        await releaseBatchLock(env, latest.batch_id, owner);
        return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_CLOSEOUT_RETRYABLE", batch_id: latest.batch_id, mode: "delta_update", error: String(err && err.message ? err.message : err).slice(0, 900), continuation_required: true, orchestrator_should_self_continue: true, external_calls_performed: 0, rows_read: 0, rows_written: 0 };
      }
    }
    const retainedDeltaGuard = await getCompletedRetainedDeltaGuard(env);
    if (retainedDeltaGuard.pass) {
      const guardFetchTimeoutMs = cap(inputJson.fetch_timeout_ms || env.FETCH_TIMEOUT_MS || DEFAULT_FETCH_TIMEOUT_MS, 1500, 10000);
      const sourceWindow = await determineLatestCompleteGameDate(env, asText(retainedDeltaGuard.latest_delta.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE), guardFetchTimeoutMs);
      const retainedMax = [retainedDeltaGuard.stage_max_game_date, retainedDeltaGuard.live_max_game_date].map(v => asText(v, null)).filter(Boolean).sort().pop();
      if (sourceWindow.ok && retainedMax && sourceWindow.latest_complete_game_date > retainedMax) {
        return await runRetainedDeltaNewFinalDateIncrement(env, retainedDeltaGuard, sourceWindow.latest_complete_game_date, input, inputJson, baseGate);
      }
      return {
        ok: true,
        data_ok: true,
        version: VERSION,
        worker_name: WORKER_NAME,
        job_key: JOB_KEY,
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        status: "NOOP_ALREADY_CURRENT_RETAINED_FULL_REFRESH_DELTA",
        certification: "DELTA_HITTER_GAME_LOGS_REPEAT_FULL_REFRESH_BLOCKED",
        certification_grade: "NOOP_PASS",
        mode: "delta_update",
        base_integrity_gate: baseGate,
        repeat_full_delta_guard: retainedDeltaGuard,
        source_final_date_check: sourceWindow,
        retained_max_game_date: retainedMax,
        preserved_batch_id: retainedDeltaGuard.latest_delta.batch_id,
        retained_stage_rows: retainedDeltaGuard.retained_stage_rows,
        live_rows_for_delta_batch: retainedDeltaGuard.live_rows_for_delta_batch,
        rows_read: sourceWindow.ok ? 1 : 0,
        rows_written: 0,
        external_calls_performed: sourceWindow.ok ? 1 : 0,
        continuation_required: false,
        orchestrator_should_self_continue: false,
        manual_wake_required: false,
        no_browser_pump: true,
        no_new_batch: true,
        no_mlb_calls: sourceWindow.ok ? false : true,
        no_stage_writes: true,
        no_promotion: true,
        no_cleanup: true,
        note: "Blocked repeat full-refresh delta because retained stage/live are healthy and no newer final MLB game date was discovered. If source_final_date_check is unavailable, no live mutation is allowed."
      };
    }
    if (retainedDeltaGuard.latest_delta && ["REPAIR_FROM_RETAINED_STAGE_ONLY","REPAIR_STAGE_FROM_FINAL_GAME_FEED_WINDOW"].includes(retainedDeltaGuard.repair_plan)) {
      const repaired = await runRetainedDeltaSurgicalRepairIfNeeded(env, retainedDeltaGuard, input, inputJson, baseGate);
      if (repaired) return repaired;
    }
    if (retainedDeltaGuard.latest_delta && retainedDeltaGuard.repair_plan === "BLOCK_RETAINED_DELTA_INCONSISTENT_MANUAL_REVIEW") {
      return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_RETAINED_GAP_REPAIR_BLOCKED", certification: "DELTA_HITTER_GAME_LOGS_RETAINED_DELTA_INCONSISTENT_MANUAL_REVIEW", mode: "delta_update", base_integrity_gate: baseGate, repeat_full_delta_guard: retainedDeltaGuard, no_new_batch: true, no_mlb_calls: true, no_live_mutation: true, continuation_required: false };
    }
  }
  const fetchTimeoutMs = cap(inputJson.fetch_timeout_ms || env.FETCH_TIMEOUT_MS || DEFAULT_FETCH_TIMEOUT_MS, 1500, 10000);
  let windowInfo = await getDeltaWindow(env, inputJson, fetchTimeoutMs);
  if (!windowInfo.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_SOURCE_WINDOW_UNAVAILABLE", certification: "DELTA_BLOCKED_NO_COMPLETE_FINAL_GAME_DATE", base_integrity_gate: baseGate, window_error: windowInfo, rows_read: 0, rows_written: 0, external_calls_performed: 1, continuation_required: false, no_live_mutation: true };
  const state = await getOrCreateDeltaState(env, input, inputJson, windowInfo);
  if (!state.is_new) {
    try {
      const lockedWindow = JSON.parse((state.cursor && state.cursor.cursor_json) || "{}");
      if (lockedWindow.delta_start_date && lockedWindow.delta_end_date) {
        windowInfo = { ...windowInfo, delta_start_date: lockedWindow.delta_start_date, delta_end_date: lockedWindow.delta_end_date, latest_complete_game_date: lockedWindow.latest_complete_game_date || lockedWindow.delta_end_date, schedule_endpoint: lockedWindow.schedule_endpoint || windowInfo.schedule_endpoint, reused_locked_delta_window: true };
      }
    } catch (_) {}
  }
  const cursor = state.cursor, batch = state.batch, players = state.players;
  const batchId = batch.batch_id, runId = batch.run_id, sourceSeason = asInt(batch.source_season, DEFAULT_SOURCE_SEASON);
  const owner = asText(input.request_id, rid("delta_hitter_owner"));
  const staleSeconds = cap(inputJson.lock_stale_seconds || env.LOCK_STALE_SECONDS || DEFAULT_LOCK_STALE_SECONDS, 20, 90);
  const lock = await acquireBatchLock(env, batchId, owner, staleSeconds);
  if (!lock.ok) return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_BATCH_LOCK_BUSY_RETRY", batch_id: batchId, run_id: runId, rows_read: 0, rows_written: 0, external_calls_performed: 0, continuation_required: true, orchestrator_should_self_continue: true, lock };
  const maxRequests = cap(inputJson.max_requests_per_tick || batch.max_requests_per_tick || env.MAX_API_CALLS_PER_TICK || DEFAULT_MAX_REQUESTS_PER_TICK, 1, DEFAULT_MAX_REQUESTS_PER_TICK);
  const maxRows = cap(inputJson.max_rows_per_tick || batch.max_rows_per_tick || env.MAX_ROWS_PER_TICK || DEFAULT_MAX_ROWS_PER_TICK, 100, DEFAULT_MAX_ROWS_PER_TICK);
  const maxTickRuntimeMs = cap(inputJson.max_tick_runtime_ms || env.MAX_TICK_RUNTIME_MS || DEFAULT_MAX_TICK_RUNTIME_MS, 8000, 30000);
  const tickStartedAtMs = Date.now();
  let sourceRequestCount = 0, sourceSuccessCount = 0, sourceNoDataCount = 0, sourceErrorCount = 0, rowsStagedThisTick = 0;
  let nextOffset = asInt(cursor.current_player_offset, 0);
  const processedPlayers = [];
  let didFetchThisTick = false;
  try {
    if (DELTA_STATUSES.has(String(batch.status)) && String(batch.status).includes("READY") || ["DELTA_CERTIFIED_READY_TO_PROMOTE","DELTA_PROMOTING","DELTA_PROMOTED_READY_TO_CLEAN","DELTA_CLEANING","DELTA_PROMOTED_STAGE_READY_TO_RETAIN","COMPLETED_PROMOTED_STAGE_RETAINED"].includes(String(batch.status))) {
      const cert = await finalizeDeltaIfReady(env, batchId, runId, windowInfo, players.length, baseGate, { ...inputJson, request_id: input.request_id || null, chain_id: input.chain_id || null });
      await releaseBatchLock(env, batchId, owner);
      return { ok: cert.pass, data_ok: cert.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: cert.done ? cert.status : "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", finalization_status: cert.status, certification: cert.certification, certification_grade: cert.grade, batch_id: batchId, run_id: runId, mode: "delta_update", base_integrity_gate: baseGate, delta_window: windowInfo, rows_read: 0, rows_written: cert.rows_promoted || 0, rows_promoted: cert.rows_promoted || 0, stage_rows_after_clean: cert.stage_rows_after_clean, external_calls_performed: 0, continuation_required: !cert.done, orchestrator_should_self_continue: !cert.done, manual_wake_required: false, no_browser_pump: true, final_checks: cert.checks, timestamp_utc: nowUtc() };
    }
    for (const p of players.slice(nextOffset, Math.min(nextOffset + maxRequests, players.length))) {
      if (Date.now() - tickStartedAtMs >= maxTickRuntimeMs || rowsStagedThisTick >= maxRows) break;
      sourceRequestCount++; didFetchThisTick = true;
      let result;
      try { result = await processPlayerDelta(env, p, sourceSeason, batchId, runId, windowInfo.delta_start_date, windowInfo.delta_end_date, Math.max(1, maxRows - rowsStagedThisTick), fetchTimeoutMs); }
      catch (err) { result = { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: "process_player_delta_exception", rows_staged: 0, error: String(err && err.message ? err.message : err), retry_same_player: true }; }
      const category = await upsertDeltaPlayerOutcome(env, batchId, runId, p, nextOffset, result, result.source_endpoint || endpointFor(env, p.player_id, sourceSeason), windowInfo.delta_start_date, windowInfo.delta_end_date);
      result.terminal_category = category;
      if (category === "SOURCE_ERROR") { sourceErrorCount++; processedPlayers.push(result); break; }
      if (category === "TRUE_NO_DATA") sourceNoDataCount++; else sourceSuccessCount++;
      rowsStagedThisTick += asInt(result.rows_staged, 0);
      processedPlayers.push(result);
      nextOffset++;
    }
    const stageCount = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
    const totalStageRows = asInt(stageCount && stageCount.c, 0);
    const partial = nextOffset < players.length;
    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches SET status=?, cursor_offset=?, source_request_count=COALESCE(source_request_count,0)+?, source_success_count=COALESCE(source_success_count,0)+?, source_no_data_count=COALESCE(source_no_data_count,0)+?, source_error_count=COALESCE(source_error_count,0)+?, rows_staged=?, certification_status=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, partial ? "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS" : "DELTA_STAGED_READY_FOR_CERTIFICATION", nextOffset, sourceRequestCount, sourceSuccessCount, sourceNoDataCount, sourceErrorCount, totalStageRows, partial ? "not_certified" : "pending_delta_certification", batchId);
    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_cursor SET status=?, current_player_offset=?, players_processed=?, requests_done=COALESCE(requests_done,0)+?, next_run_after=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?`, partial ? "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS" : "DELTA_STAGED_READY_FOR_CERTIFICATION", nextOffset, nextOffset, sourceRequestCount, partial ? 1 : 0, DELTA_CURSOR_KEY);
    if (partial) {
      await releaseBatchLock(env, batchId, owner);
      return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_PARTIAL_CONTINUE", batch_id: batchId, run_id: runId, mode: "delta_update", base_integrity_gate: baseGate, delta_window: windowInfo, rows_read: sourceRequestCount, rows_written: rowsStagedThisTick, rows_staged_total: totalStageRows, external_calls_performed: sourceRequestCount, current_player_offset: nextOffset, players_total: players.length, players_remaining: Math.max(0, players.length - nextOffset), continuation_required: true, orchestrator_should_self_continue: true, manual_wake_required: false, no_browser_pump: true, processed_players: processedPlayers.slice(0, 10), timestamp_utc: nowUtc() };
    }
    const cert = await finalizeDeltaIfReady(env, batchId, runId, windowInfo, players.length, baseGate, { ...inputJson, request_id: input.request_id || null, chain_id: input.chain_id || null });
    await releaseBatchLock(env, batchId, owner);
    return { ok: cert.pass, data_ok: cert.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: cert.done ? cert.status : "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: cert.certification, certification_grade: cert.grade, batch_id: batchId, run_id: runId, mode: "delta_update", base_integrity_gate: baseGate, delta_window: windowInfo, rows_read: sourceRequestCount, rows_written: rowsStagedThisTick + (cert.rows_promoted || 0), rows_promoted: cert.rows_promoted || 0, stage_rows_after_clean: cert.stage_rows_after_clean, external_calls_performed: sourceRequestCount, continuation_required: !cert.done, orchestrator_should_self_continue: !cert.done, manual_wake_required: false, no_browser_pump: true, final_checks: cert.checks, timestamp_utc: nowUtc() };
  } catch (err) {
    const errText = String(err && err.message ? err.message : err).slice(0, 900);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS', last_error=?, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", errText, DELTA_CURSOR_KEY);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS', locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
    await releaseBatchLock(env, batchId, owner);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_HITTER_GAME_LOGS", certification: "DELTA_HITTER_GAME_LOGS_TICK_ERROR_RETRYABLE", batch_id: batchId, run_id: runId, mode: "delta_update", error: errText, finalization_only: !didFetchThisTick, external_calls_performed: didFetchThisTick ? sourceRequestCount : 0, continuation_required: true, orchestrator_should_self_continue: true, manual_wake_required: false, no_browser_pump: true, rows_read: didFetchThisTick ? sourceRequestCount : 0, rows_written: rowsStagedThisTick };
  }
}

async function runBaseBackfillTick(env, input) {
  await ensureSchema(env);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const requestedMode = asText(inputJson.mode || input.mode, "base_backfill");
  if (requestedMode === "delta_update") {
    return await runDeltaUpdateTick(env, input, inputJson);
  }

  const state = await getOrCreateBaseBackfillState(env, input);
  const cursor = state.cursor;
  const batch = state.batch;
  const players = state.players;
  const batchId = batch.batch_id;
  const runId = batch.run_id;
  const cutoffDate = batch.base_backfill_cutoff_date || DEFAULT_BASE_BACKFILL_CUTOFF_DATE;
  const sourceSeason = asInt(batch.source_season, DEFAULT_SOURCE_SEASON);
  const requestedMaxRequests = inputJson.max_requests_per_tick || batch.max_requests_per_tick || env.MAX_API_CALLS_PER_TICK || DEFAULT_MAX_REQUESTS_PER_TICK;
  const requestedChunkSize = inputJson.chunk_size_players || batch.chunk_size_players || requestedMaxRequests || DEFAULT_CHUNK_SIZE_PLAYERS;
  const maxRequests = cap(requestedMaxRequests, 1, DEFAULT_MAX_REQUESTS_PER_TICK);
  const chunkSize = cap(requestedChunkSize, 1, DEFAULT_CHUNK_SIZE_PLAYERS);
  const maxRows = cap(inputJson.max_rows_per_tick || batch.max_rows_per_tick || env.MAX_ROWS_PER_TICK || DEFAULT_MAX_ROWS_PER_TICK, 100, DEFAULT_MAX_ROWS_PER_TICK);
  const maxTickRuntimeMs = cap(inputJson.max_tick_runtime_ms || env.MAX_TICK_RUNTIME_MS || DEFAULT_MAX_TICK_RUNTIME_MS, 8000, 30000);
  const fetchTimeoutMs = cap(inputJson.fetch_timeout_ms || env.FETCH_TIMEOUT_MS || DEFAULT_FETCH_TIMEOUT_MS, 1500, 10000);
  const tickStartedAtMs = Date.now();
  let cursorJsonObj = {};
  try { cursorJsonObj = JSON.parse(cursor.cursor_json || "{}"); } catch (_) { cursorJsonObj = {}; }
  const perTickPlayers = Math.min(maxRequests, chunkSize);
  const offset = asInt(cursor.current_player_offset, 0);
  const total = players.length;
  const owner = asText(input.request_id, rid("base_hitter_owner"));
  const staleSeconds = cap(inputJson.lock_stale_seconds || env.LOCK_STALE_SECONDS || DEFAULT_LOCK_STALE_SECONDS, 20, 90);
  const lock = await acquireBatchLock(env, batchId, owner, staleSeconds);
  if (!lock.ok) {
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS",
      certification: "BASE_HITTER_GAME_LOGS_BATCH_LOCK_BUSY_RETRY",
      batch_id: batchId,
      run_id: runId,
      rows_read: 0,
      rows_written: 0,
      external_calls_performed: 0,
      continuation_required: true,
      lock
    };
  }

  let sourceRequestCount = 0;
  let sourceSuccessCount = 0;
  let sourceNoDataCount = 0;
  let sourceErrorCount = 0;
  let rowsStagedThisTick = 0;
  const processedPlayers = [];
  let nextOffset = offset;
  let stoppedByRuntimeBudget = false;
  let stoppedBySourceError = false;
  let didFetchThisTick = false;
  let finalizationOnlyMode = false;

  try {
    const finalizationReady = await isFinalizationOnlyReady(env, batchId, total);
    if (finalizationReady.ready) {
      finalizationOnlyMode = true;
      const cert = await certifyAndPromoteIfClean(env, batchId, runId, cutoffDate, {
        promote_rows_per_tick: inputJson.promote_rows_per_tick,
        clean_rows_per_tick: inputJson.clean_rows_per_tick
      });
      const sourceTruth = await deriveSourceCountersFromOutcomes(env, batchId);
      await releaseBatchLock(env, batchId, owner);
      return {
        ok: cert.pass,
        data_ok: cert.pass,
        version: VERSION,
        worker_name: WORKER_NAME,
        job_key: JOB_KEY,
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        status: cert.done ? cert.status : "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS",
        finalization_status: cert.status,
        certification: cert.certification,
        certification_grade: cert.grade,
        batch_id: batchId,
        run_id: runId,
        rows_read: 0,
        rows_written: cert.rows_promoted || 0,
        rows_staged_this_tick: 0,
        rows_promoted: cert.rows_promoted || 0,
        stage_rows_after_clean: cert.stage_rows_after_clean,
        external_calls_performed: 0,
        source_request_count: sourceTruth.source_request_count,
        source_success_count: sourceTruth.source_success_count,
        source_no_data_count: sourceTruth.source_no_data_count,
        source_error_count: sourceTruth.source_error_count,
        source_success_definition: sourceTruth.source_success_definition,
        current_player_offset: finalizationReady.players_total || total,
        players_total: finalizationReady.players_total || total,
        players_remaining: 0,
        base_backfill_cutoff_date: cutoffDate,
        delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
        continuation_required: !cert.done,
        orchestrator_should_self_continue: !cert.done,
        manual_wake_required: false,
        fast_bounded_tick: true,
        finalization_only: true,
        finalization_only_gate: finalizationReady,
        finalization_microphase: true,
        no_browser_pump: true,
        no_scoring: true,
        no_ranking: true,
        no_final_board: true,
        no_prizepicks_board_mutation: true,
        no_sleeper_board_mutation: true,
        final_checks: cert.checks,
        timestamp_utc: nowUtc()
      };
    }
    const slice = players.slice(offset, Math.min(offset + perTickPlayers, total));
    for (const p of slice) {
      if (rowsStagedThisTick >= maxRows) break;
      if (Date.now() - tickStartedAtMs >= maxTickRuntimeMs) {
        stoppedByRuntimeBudget = true;
        break;
      }
      sourceRequestCount++;
      didFetchThisTick = true;
      let result;
      try {
        result = await processPlayer(env, p, sourceSeason, batchId, runId, cutoffDate, Math.max(1, maxRows - rowsStagedThisTick), fetchTimeoutMs);
      } catch (err) {
        result = { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: "process_player_exception", rows_staged: 0, error: String(err && err.message ? err.message : err), retry_same_player: true };
      }
      const category = await upsertPlayerOutcome(env, batchId, runId, p, nextOffset, result, result.source_endpoint || endpointFor(env, p.player_id, sourceSeason));
      result.terminal_category = category;
      if (result.status === "success" || result.status === "filtered_after_cutoff") {
        sourceSuccessCount++;
        rowsStagedThisTick += asInt(result.rows_staged, 0);
        processedPlayers.push(result);
        nextOffset++;
      } else if (result.status === "no_data") {
        sourceNoDataCount++;
        rowsStagedThisTick += asInt(result.rows_staged, 0);
        processedPlayers.push(result);
        nextOffset++;
      } else if (result.status === "repair_required") {
        sourceSuccessCount++;
        rowsStagedThisTick += asInt(result.rows_staged, 0);
        stoppedBySourceError = true;
        processedPlayers.push(result);
        nextOffset++;
        break;
      } else {
        sourceErrorCount++;
        stoppedBySourceError = true;
        processedPlayers.push(result);
        break;
      }
    }

    const stageCount = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
    const totalStageRows = asInt(stageCount && stageCount.c, 0);
    const currentPlayer = nextOffset > 0 && players[nextOffset - 1] ? players[nextOffset - 1].player_id : null;
    const partial = nextOffset < total;

    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches SET
      status=?, cursor_player_id=?, cursor_season=?, cursor_offset=?, source_request_count=COALESCE(source_request_count,0)+?,
      source_success_count=COALESCE(source_success_count,0)+?, source_no_data_count=COALESCE(source_no_data_count,0)+?, source_error_count=COALESCE(source_error_count,0)+?,
      rows_staged=?, certification_status=?, certification_grade=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`,
      partial ? "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS" : "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION",
      currentPlayer, sourceSeason, nextOffset, sourceRequestCount, sourceSuccessCount, sourceNoDataCount, sourceErrorCount,
      totalStageRows, partial ? "not_certified" : "pending_batch_certification", batchId
    );

    cursorJsonObj.last_tick_at = nowUtc();
    cursorJsonObj.last_tick_processed_players = processedPlayers.slice(0, 20);
    cursorJsonObj.last_tick_rows_staged = rowsStagedThisTick;
    cursorJsonObj.last_tick_elapsed_ms = Date.now() - tickStartedAtMs;
    cursorJsonObj.last_tick_runtime_budget_ms = maxTickRuntimeMs;
    cursorJsonObj.last_tick_stopped_by_runtime_budget = stoppedByRuntimeBudget;
    cursorJsonObj.last_tick_stopped_by_source_error = stoppedBySourceError;
    cursorJsonObj.last_tick_fetch_timeout_ms = fetchTimeoutMs;
    cursorJsonObj.last_tick_max_requests = maxRequests;
    cursorJsonObj.current_player_offset = nextOffset;
    await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_cursor SET
      status=?, current_player_id=?, current_player_offset=?, players_total=?, players_processed=?, requests_done=COALESCE(requests_done,0)+?,
      next_run_after=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,
      cursor_json=?,
      updated_at=CURRENT_TIMESTAMP
      WHERE cursor_key=?`,
      partial ? "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS" : "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION",
      currentPlayer, nextOffset, total, nextOffset, sourceRequestCount, partial ? 1 : 0, JSON.stringify(cursorJsonObj), ACTIVE_CURSOR_KEY
    );

    if (partial) {
      await releaseBatchLock(env, batchId, owner);
      return {
        ok: true,
        data_ok: true,
        version: VERSION,
        worker_name: WORKER_NAME,
        job_key: JOB_KEY,
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        status: "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS",
        certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_PARTIAL_CONTINUE",
        batch_id: batchId,
        run_id: runId,
        is_new_batch: state.is_new,
        rows_read: sourceRequestCount,
        rows_written: rowsStagedThisTick,
        rows_staged_this_tick: rowsStagedThisTick,
        rows_staged_total: totalStageRows,
        rows_promoted: 0,
        external_calls_performed: sourceRequestCount,
        source_request_count: sourceRequestCount,
        source_success_count: sourceSuccessCount,
        source_no_data_count: sourceNoDataCount,
        source_error_count: sourceErrorCount,
        current_player_offset: nextOffset,
        players_total: total,
        players_remaining: Math.max(0, total - nextOffset),
        base_backfill_cutoff_date: cutoffDate,
        delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
        continuation_required: true,
        orchestrator_should_self_continue: true,
        cron_role: "rescue_fallback_only",
        manual_wake_required: false,
        fast_bounded_tick: true,
        self_owned_lock_recovery: true,
        lock,
        tick_elapsed_ms: Date.now() - tickStartedAtMs,
        tick_runtime_budget_ms: maxTickRuntimeMs,
        tick_stopped_by_runtime_budget: stoppedByRuntimeBudget,
        tick_stopped_by_source_error: stoppedBySourceError,
        fetch_timeout_ms: fetchTimeoutMs,
        effective_max_requests_per_tick: maxRequests,
        no_browser_pump: true,
        no_scoring: true,
        no_ranking: true,
        no_final_board: true,
        no_prizepicks_board_mutation: true,
        no_sleeper_board_mutation: true,
        processed_players: processedPlayers.slice(0, 20),
        timestamp_utc: nowUtc()
      };
    }

    const cert = await certifyAndPromoteIfClean(env, batchId, runId, cutoffDate);
    await releaseBatchLock(env, batchId, owner);
    return {
      ok: cert.pass,
      data_ok: cert.pass,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: input.request_id || null,
      chain_id: input.chain_id || null,
      status: cert.done ? cert.status : "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS",
      finalization_status: cert.status,
      certification: cert.certification,
      certification_grade: cert.grade,
      batch_id: batchId,
      run_id: runId,
      rows_read: sourceRequestCount,
      rows_written: rowsStagedThisTick + cert.rows_promoted,
      rows_staged_this_tick: rowsStagedThisTick,
      rows_staged_total: totalStageRows,
      rows_promoted: cert.rows_promoted,
      stage_rows_after_clean: cert.stage_rows_after_clean,
      external_calls_performed: sourceRequestCount,
      source_request_count: sourceRequestCount,
      source_success_count: sourceSuccessCount,
      source_no_data_count: sourceNoDataCount,
      source_error_count: sourceErrorCount,
      current_player_offset: nextOffset,
      players_total: total,
      players_remaining: 0,
      base_backfill_cutoff_date: cutoffDate,
      delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE,
      continuation_required: !cert.done,
      orchestrator_should_self_continue: !cert.done,
      cron_role: "rescue_fallback_only",
      manual_wake_required: false,
      fast_bounded_tick: true,
      finalization_microphase: true,
      tick_elapsed_ms: Date.now() - tickStartedAtMs,
      tick_runtime_budget_ms: maxTickRuntimeMs,
      tick_stopped_by_runtime_budget: stoppedByRuntimeBudget,
      tick_stopped_by_source_error: stoppedBySourceError,
      fetch_timeout_ms: fetchTimeoutMs,
      effective_max_requests_per_tick: maxRequests,
      no_browser_pump: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_prizepicks_board_mutation: true,
      no_sleeper_board_mutation: true,
      final_checks: cert.checks,
      timestamp_utc: nowUtc()
    };
  } catch (err) {
    const errText = String(err && err.message ? err.message : err).slice(0, 900);
    if (finalizationOnlyMode || !didFetchThisTick) {
      await freezeSourceCountersFromOutcomes(env, batchId);
      let recoveryStatus = 'BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION';
      try {
        const b = await first(env.STATS_HITTER_DB, "SELECT status, rows_staged, rows_promoted, certification_status FROM hitter_game_log_batches WHERE batch_id=?", batchId);
        const promoted = asInt(b && b.rows_promoted, 0);
        const staged = asInt(b && b.rows_staged, 0);
        const bs = String((b && b.status) || '');
        if (bs === 'BASE_BACKFILL_CLEANING' || (staged > 0 && promoted >= staged)) recoveryStatus = 'BASE_BACKFILL_CLEANING';
        else if (bs === 'BASE_BACKFILL_PROMOTED_READY_TO_CLEAN') recoveryStatus = 'BASE_BACKFILL_PROMOTED_READY_TO_CLEAN';
        else if (bs === 'BASE_BACKFILL_PROMOTING') recoveryStatus = 'BASE_BACKFILL_PROMOTING';
        else if (String((b && b.certification_status) || '').includes('CERTIFIED')) recoveryStatus = 'BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE';
      } catch (_) {}
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status=?, last_error=?, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", recoveryStatus, errText, ACTIVE_CURSOR_KEY);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status=?, locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", recoveryStatus, batchId);
    } else {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS', last_error=?, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", errText, ACTIVE_CURSOR_KEY);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS', source_error_count=COALESCE(source_error_count,0)+1, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
    }
    await releaseBatchLock(env, batchId, owner);
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS",
      certification: "BASE_HITTER_GAME_LOGS_TICK_ERROR_RETRYABLE",
      batch_id: batchId,
      run_id: runId,
      error: String(err && err.message ? err.message : err),
      finalization_only: finalizationOnlyMode || !didFetchThisTick,
      external_calls_performed: didFetchThisTick ? sourceRequestCount : 0,
      continuation_required: true,
      orchestrator_should_self_continue: true,
      manual_wake_required: false,
      fast_bounded_tick: true,
      tick_elapsed_ms: Date.now() - tickStartedAtMs,
      tick_runtime_budget_ms: maxTickRuntimeMs,
      tick_stopped_by_runtime_budget: stoppedByRuntimeBudget,
      tick_stopped_by_source_error: stoppedBySourceError,
      fetch_timeout_ms: fetchTimeoutMs,
      effective_max_requests_per_tick: maxRequests,
      no_browser_pump: true,
      rows_read: didFetchThisTick ? sourceRequestCount : 0,
      rows_written: rowsStagedThisTick
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return jsonResponse({ ok: true });
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse(baseIdentity(env, { route: "/health" }));

    if (method === "GET" && path === "/schema") {
      const schema = await schemaStatus(env).catch(err => ({ error: String(err && err.message ? err.message : err) }));
      return jsonResponse(baseIdentity(env, { route: "/schema", schema }));
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await parseJson(request);
      const ensured = await ensureSchema(env);
      const schema = await schemaStatus(env);
      return jsonResponse(baseIdentity(env, {
        route: "/diagnostic",
        input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null },
        ensure_schema: ensured,
        schema,
        writes_performed: ensured.failed === 0 ? "schema_ddl_only" : "schema_ddl_attempted_with_errors",
        external_calls_performed: 0
      }));
    }

    if (method === "POST" && path === "/run") {
      const input = await parseJson(request);
      const output = await runBaseBackfillTick(env, input);
      return jsonResponse(output, 200);
    }

    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "GET /schema", "POST /diagnostic", "POST /run"], timestamp_utc: nowUtc() }, 404);
  }
};
