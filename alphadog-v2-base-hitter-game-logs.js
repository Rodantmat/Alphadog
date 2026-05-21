const WORKER_NAME = "alphadog-v2-base-hitter-game-logs";
const VERSION = "alphadog-v2-base-hitter-game-logs-v1.5.30-cleanup-only-state-machine";
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
const DEFAULT_CLEAN_ROWS_PER_TICK = 25;
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
      delta_update: "schema_prepared_but_runtime_blocked_until_base_certified_and_user_approved",
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

  await exec("record_schema_migration", "INSERT OR REPLACE INTO hitter_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_hitter_game_logs_v1_5_30_cleanup_only_state_machine', ?, CURRENT_TIMESTAMP, 'Base Hitter Game Logs cleanup-only state machine: skips promotion when live count already complete, deletes stage rows in tiny primary-key chunks, no source calls, no new batch, counters frozen from outcomes')", VERSION);

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
    return { promoted_this_tick: 0, remaining_unpromoted: asInt(remainingNone && remainingNone.c, 0), sql_variable_safe: true, promote_limit: safeLimit, insert_mode: "single_row_variable_clamp" };
  }

  let promotedThisTick = 0;
  for (const r of rows) {
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_logs (
      player_id,game_pk,season,game_date,team_id,opponent_team_id,is_home,batting_order,
      pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
      raw_json,source_key,source_confidence,updated_at,group_type,data_feed_key,source_endpoint,source_season,source_game_type,ingestion_mode,batch_id,run_id,certification_status,certification_grade,certified_at,promoted_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      r.player_id, r.game_pk, r.season, r.game_date, r.team_id, r.opponent_team_id, r.is_home, r.batting_order,
      r.pa, r.ab, r.hits, r.singles, r.doubles, r.triples, r.home_runs, r.runs, r.rbi, r.walks, r.strikeouts, r.stolen_bases, r.total_bases,
      r.raw_json, r.source_key, r.source_confidence, r.group_type, r.data_feed_key, r.source_endpoint, r.source_season, r.source_game_type, r.ingestion_mode, r.batch_id, r.run_id, 'base_backfill_certified_promoted', grade
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
  return { promoted_this_tick: promotedThisTick, remaining_unpromoted: asInt(remaining && remaining.c, 0), sql_variable_safe: true, promote_limit: safeLimit, insert_mode: "single_row_variable_clamp", max_bound_variables_per_insert: 34 };
}

async function cleanStageRowsChunk(env, batchId, limit) {
  const safeLimit = cap(limit || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 25);
  const rows = await all(env.STATS_HITTER_DB, `SELECT stage_id
    FROM hitter_game_logs_stage
    WHERE batch_id=?
    ORDER BY stage_id
    LIMIT ${safeLimit}`, batchId);
  if (!rows.length) return { cleaned_this_tick: 0, stage_rows_after_clean: 0, sql_variable_safe: true, clean_limit: safeLimit, delete_mode: "single_stage_id_rows" };
  let cleaned = 0;
  for (const r of rows) {
    await run(env.STATS_HITTER_DB, "DELETE FROM hitter_game_logs_stage WHERE batch_id=? AND stage_id=?", batchId, r.stage_id);
    cleaned += 1;
  }
  const remaining = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
  return { cleaned_this_tick: cleaned, stage_rows_after_clean: asInt(remaining && remaining.c, 0), sql_variable_safe: true, clean_limit: safeLimit, delete_mode: "single_stage_id_rows", max_bound_variables_per_delete: 2 };
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
  const cleanLimit = cap(options.clean_rows_per_tick || DEFAULT_CLEAN_ROWS_PER_TICK, 25, 300);
  let batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  let status = batch && batch.status ? String(batch.status) : "";
  const stageRowsNow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
  const stageCount = asInt(stageRowsNow && stageRowsNow.c, 0);

  if (status === "COMPLETED_PROMOTED_CLEANED") {
    const liveRows = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
    const sourceTruth = await freezeSourceCountersFromOutcomes(env, batchId);
    return { pass: true, done: true, continuation_required: false, status, certification: batch.certification_status || "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED", grade: batch.certification_grade || "BASE_PASS", checks: { version: VERSION, finalization_only: true, already_completed: true, source_counters_from_outcomes: sourceTruth }, rows_promoted: asInt(liveRows && liveRows.c, 0), stage_rows_after_clean: stageCount };
  }

  if (status === "CERTIFICATION_FAILED" && stageCount > 0) {
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', certification_status='pending_batch_certification', certification_grade=NULL, locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', last_error=NULL, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
    status = "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION";
  }

  // v1.5.30 hard repair: if the live table already has the full promoted base batch,
  // never re-enter promotion or expensive NOT EXISTS scans. This is cleanup-only mode.
  const liveRowsEarly = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
  const rowsPromotedEarly = asInt(liveRowsEarly && liveRowsEarly.c, 0);
  const expectedRowsEarly = asInt(batch && batch.rows_staged, 0) || stageCount;
  if (expectedRowsEarly > 0 && rowsPromotedEarly === expectedRowsEarly) {
    const grade = batch.certification_grade || "BASE_PASS";
    if (stageCount > 0) {
      const cleaned = await cleanStageRowsChunk(env, batchId, cleanLimit);
      const cleaningDone = cleaned.stage_rows_after_clean === 0;
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
      return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: pre.certification, grade: pre.grade, checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: stageCount };
    }
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', certification_status=?, certification_grade=?, certification_json=?, duplicate_count=?, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", pre.certification, pre.grade, checksJson, pre.duplicateCount, batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', next_run_after=CURRENT_TIMESTAMP, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
    return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", grade: pre.grade, checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: stageCount };
  }

  if (status === "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE" || status === "BASE_BACKFILL_PROMOTING") {
    const grade = batch.certification_grade || "BASE_PASS";
    const promoted = await promoteStageRowsChunk(env, batchId, grade, promoteLimit);
    const liveRows = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
    const rowsPromoted = asInt(liveRows && liveRows.c, 0);
    const expectedPromotedRows = asInt(batch && batch.rows_staged, 0) || stageCount;
    const promotionComplete = promoted.remaining_unpromoted === 0 && rowsPromoted === expectedPromotedRows;
    const nextStatus = promotionComplete ? "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" : "BASE_BACKFILL_PROMOTING";
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status=?, rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", nextStatus, rowsPromoted, batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status=?, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", nextStatus, ACTIVE_CURSOR_KEY);
    if (promotionComplete) {
      await syncOutcomePromotedCountsFromLive(env, batchId);
      await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_player_outcomes
        SET certification_status='player_outcome_certified',
            certification_grade='BASE_PASS',
            updated_at=CURRENT_TIMESTAMP
        WHERE batch_id=?`, batchId);
    }
    return { pass: true, done: false, continuation_required: true, status: nextStatus, certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_PROMOTE_MICROPHASE", grade, checks: { promoted, rows_promoted: rowsPromoted, expected_promoted_rows: expectedPromotedRows, promotion_complete: promotionComplete, promote_limit: promoteLimit, no_cleanup_until_live_count_matches_stage: true }, rows_promoted: rowsPromoted, stage_rows_after_clean: stageCount };
  }

  if (status === "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" || status === "BASE_BACKFILL_CLEANING") {
    const liveRows = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
    const rowsPromoted = asInt(liveRows && liveRows.c, 0);
    const expectedRowsBeforeClean = asInt(batch && batch.rows_staged, 0) || stageCount;
    if (rowsPromoted !== expectedRowsBeforeClean) {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_PROMOTING', rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromoted, batchId);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_PROMOTING', next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
      return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_PROMOTING", certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_PROMOTION_COUNT_GUARD", grade: batch.certification_grade || "BASE_PASS", checks: { rows_promoted: rowsPromoted, expected_promoted_rows: expectedRowsBeforeClean, cleanup_blocked_until_live_count_matches_stage: true }, rows_promoted: rowsPromoted, stage_rows_after_clean: stageCount };
    }
    const cleaned = await cleanStageRowsChunk(env, batchId, cleanLimit);
    if (cleaned.stage_rows_after_clean > 0) {
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_CLEANING', rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromoted, batchId);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_CLEANING', next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
      return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CLEANING", certification: "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CLEAN_MICROPHASE", grade: batch.certification_grade || "BASE_PASS", checks: { cleaned, rows_promoted: rowsPromoted, clean_limit: cleanLimit }, rows_promoted: rowsPromoted, stage_rows_after_clean: cleaned.stage_rows_after_clean };
    }

    await syncOutcomePromotedCountsFromLive(env, batchId);
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

  return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: "BASE_HITTER_GAME_LOGS_UNKNOWN_FINALIZATION_STATUS", grade: "BASE_FAIL", checks: { status, batch_id: batchId }, rows_promoted: 0, stage_rows_after_clean: stageCount };
}

async function runBaseBackfillTick(env, input) {
  await ensureSchema(env);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const requestedMode = asText(inputJson.mode || input.mode, "base_backfill");
  if (requestedMode === "delta_update") {
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "DELTA_UPDATE_BLOCKED_UNTIL_BASE_CERTIFIED_AND_USER_APPROVED",
      certification: "DELTA_BLOCKED_BY_DESIGN_IN_V0_2_0",
      rows_read: 0,
      rows_written: 0,
      external_calls_performed: 0,
      no_live_promotion: true
    };
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
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', last_error=?, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", errText, ACTIVE_CURSOR_KEY);
      await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', certification_status='pending_batch_certification', locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
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
