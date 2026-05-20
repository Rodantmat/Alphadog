const WORKER_NAME = "alphadog-v2-base-hitter-game-logs";
const VERSION = "alphadog-v2-base-hitter-game-logs-v0.2.3-self-owned-lock-recovery";
const JOB_KEY = "base-hitter-game-logs";

const LOCKED_SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=gameLog&group=hitting&season={season}";
const SOURCE_KEY = "mlb_statsapi_people_gameLog_hitting_v0_1_0";
const DATA_FEED_KEY = "base_hitter_game_logs";
const GROUP_TYPE = "hitting";
const DEFAULT_BASE_BACKFILL_CUTOFF_DATE = "2026-05-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-05-19";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_PLAYERS = 6;
const DEFAULT_MAX_REQUESTS_PER_TICK = 6;
const DEFAULT_MAX_ROWS_PER_TICK = 750;
const DEFAULT_LOCK_STALE_SECONDS = 90;
const DEFAULT_MAX_TICK_RUNTIME_MS = 30000;
const ACTIVE_CURSOR_KEY = "base_hitter_game_logs_active_cursor";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB"];
const EXPECTED_VARS = ["MLB_API_BASE_URL", "ACTIVE_SEASON", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES", "MAX_TICK_RUNTIME_MS"];
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
    ["idx_hitter_logs_source", "CREATE INDEX IF NOT EXISTS idx_hitter_logs_source ON hitter_game_logs(source_key, source_season, game_date)"]
  ];
  for (const [label, sql] of indexes) await exec(label, sql);

  await exec("record_schema_migration", "INSERT OR REPLACE INTO hitter_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_hitter_game_logs_v0_2_3_self_owned_lock_recovery', ?, CURRENT_TIMESTAMP, 'Base Hitter Game Logs self-owned stale batch lock recovery and fast bounded ticks')", VERSION);

  return { attempted: results.length, failed: results.filter(r => !r.ok).length, results };
}

async function schemaStatus(env) {
  const tables = await all(env.STATS_HITTER_DB, "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'hitter_game_log%' OR name='hitter_game_logs') ORDER BY name");
  const liveCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_logs)");
  const stageCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_logs_stage)");
  const batchCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_log_batches)");
  const cursorCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_log_cursor)");
  return {
    tables: tables.map(r => r.name),
    hitter_game_logs_columns: liveCols.map(r => r.name),
    hitter_game_logs_stage_columns: stageCols.map(r => r.name),
    hitter_game_log_batches_columns: batchCols.map(r => r.name),
    hitter_game_log_cursor_columns: cursorCols.map(r => r.name)
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
  const existing = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_game_log_cursor WHERE cursor_key=? AND mode='base_backfill' AND status IN ('BASE_BACKFILL_RUNNING','PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS')`, ACTIVE_CURSOR_KEY);
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
    "v0.2.3 self-owned stale lock recovery + fast bounded backend ticks. Base fills only through 2026-05-18. Delta remains blocked. No scoring/ranking/board mutation."
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

async function processPlayer(env, p, sourceSeason, batchId, runId, cutoffDate, maxRowsRemaining) {
  const endpoint = endpointFor(env, p.player_id, sourceSeason);
  const resp = await fetch(endpoint, {
    method: "GET",
    headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/0.2.0") }
  });
  const text = await resp.text();
  if (!resp.ok) return { player_id: p.player_id, player_name: p.player_name, status: "source_error", http_status: resp.status, rows_staged: 0, preview: text.slice(0, 240) };
  const body = JSON.parse(text);
  const splits = body && body.stats && body.stats[0] && Array.isArray(body.stats[0].splits) ? body.stats[0].splits : [];
  if (!splits.length) return { player_id: p.player_id, player_name: p.player_name, status: "no_data", split_count: 0, rows_staged: 0 };
  let inserted = 0;
  for (const split of splits) {
    if (inserted >= maxRowsRemaining) break;
    const row = parseHitterSplit(split, p.player_id, p.player_name, sourceSeason, batchId, runId, "base_backfill", endpoint, cutoffDate);
    if (!row) continue;
    await insertStageRow(env, row);
    inserted++;
  }
  return { player_id: p.player_id, player_name: p.player_name, status: "success", split_count: splits.length, rows_staged: inserted };
}

async function certifyAndPromoteIfClean(env, batchId, runId, cutoffDate) {
  const summary = await first(env.STATS_HITTER_DB, `SELECT
      COUNT(*) AS rows_staged,
      COUNT(DISTINCT player_id) AS distinct_players,
      COUNT(DISTINCT game_pk) AS distinct_games,
      MIN(game_date) AS min_game_date,
      MAX(game_date) AS max_game_date,
      SUM(CASE WHEN player_id IS NULL OR game_pk IS NULL OR season IS NULL OR game_date IS NULL OR source_key IS NULL OR source_endpoint IS NULL THEN 1 ELSE 0 END) AS missing_required,
      SUM(CASE WHEN group_type!='hitting' THEN 1 ELSE 0 END) AS non_hitting_rows,
      SUM(CASE WHEN game_date > ? THEN 1 ELSE 0 END) AS after_cutoff_rows
    FROM hitter_game_logs_stage WHERE batch_id=?`, cutoffDate, batchId);

  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS duplicate_count FROM (
      SELECT player_id, game_pk, group_type, COUNT(*) AS c
      FROM hitter_game_logs_stage
      WHERE batch_id=?
      GROUP BY player_id, game_pk, group_type
      HAVING COUNT(*) > 1
    )`, batchId);

  const batch = await first(env.STATS_HITTER_DB, "SELECT source_request_count, source_success_count, source_no_data_count, source_error_count FROM hitter_game_log_batches WHERE batch_id=?", batchId);
  const rowsStaged = asInt(summary && summary.rows_staged, 0);
  const duplicateCount = asInt(dup && dup.duplicate_count, 0);
  const sourceErrors = asInt(batch && batch.source_error_count, 0);
  const sourceSuccess = asInt(batch && batch.source_success_count, 0);
  const missingRequired = asInt(summary && summary.missing_required, 0);
  const nonHittingRows = asInt(summary && summary.non_hitting_rows, 0);
  const afterCutoffRows = asInt(summary && summary.after_cutoff_rows, 0);

  const pass = rowsStaged > 0 && sourceSuccess > 0 && duplicateCount === 0 && sourceErrors === 0 && missingRequired === 0 && nonHittingRows === 0 && afterCutoffRows === 0;
  const certification = pass ? "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFIED" : "BASE_HITTER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED";
  const grade = pass ? "BASE_PASS" : "BASE_FAIL";
  const checks = {
    version: VERSION,
    lifecycle: "fetch_mine_stage_certify_promote_clean_final_verify",
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
    missing_required: missingRequired,
    non_hitting_rows: nonHittingRows,
    after_cutoff_rows: afterCutoffRows,
    pass,
    no_scoring: true,
    no_ranking: true,
    no_board_mutation: true
  };
  const checksJson = JSON.stringify(checks);

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_certifications (
    certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    `cert_${batchId}`, batchId, runId, "base_backfill", certification, grade, checksJson, rowsStaged, 0, duplicateCount, asInt(batch && batch.source_no_data_count, 0), sourceErrors
  );

  if (!pass) {
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='CERTIFICATION_FAILED', certification_status=?, certification_grade=?, certification_json=?, duplicate_count=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", certification, grade, checksJson, duplicateCount, batchId);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='CERTIFICATION_FAILED', last_error='base backfill certification failed', updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
    return { pass, certification, grade, checks, rows_promoted: 0, stage_rows_after_clean: rowsStaged };
  }

  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_logs_stage SET certification_status='base_backfill_certified', certification_grade=?, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", grade, batchId);

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_logs (
    player_id,game_pk,season,game_date,team_id,opponent_team_id,is_home,batting_order,
    pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
    raw_json,source_key,source_confidence,updated_at,group_type,data_feed_key,source_endpoint,source_season,source_game_type,ingestion_mode,batch_id,run_id,certification_status,certification_grade,certified_at,promoted_at,created_at
  )
  SELECT
    player_id,game_pk,season,game_date,team_id,opponent_team_id,is_home,batting_order,
    pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
    raw_json,source_key,source_confidence,CURRENT_TIMESTAMP,group_type,data_feed_key,source_endpoint,source_season,source_game_type,ingestion_mode,batch_id,run_id,'base_backfill_certified_promoted',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  FROM hitter_game_logs_stage WHERE batch_id=?`, grade, batchId);

  const promoted = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs WHERE batch_id=? AND certification_status='base_backfill_certified_promoted'", batchId);
  const rowsPromoted = asInt(promoted && promoted.c, 0);

  await run(env.STATS_HITTER_DB, "DELETE FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
  const stageAfter = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_game_logs_stage WHERE batch_id=?", batchId);
  const stageRowsAfterClean = asInt(stageAfter && stageAfter.c, 0);

  const finalChecks = { ...checks, rows_promoted: rowsPromoted, stage_rows_after_clean: stageRowsAfterClean, clean_pass: stageRowsAfterClean === 0 };
  const finalChecksJson = JSON.stringify(finalChecks);
  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_certifications SET rows_promoted=?, checks_json=? WHERE certification_id=?", rowsPromoted, finalChecksJson, `cert_${batchId}`);
  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='COMPLETED_PROMOTED_CLEANED', rows_promoted=?, duplicate_count=?, certification_status=?, certification_grade=?, certification_json=?, finished_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, promoted_at=CURRENT_TIMESTAMP, cleaned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromoted, duplicateCount, certification, grade, finalChecksJson, batchId);
  const completedCursor = await first(env.STATS_HITTER_DB, "SELECT cursor_json FROM hitter_game_log_cursor WHERE cursor_key=?", ACTIVE_CURSOR_KEY);
  let completedCursorJson = {};
  try { completedCursorJson = JSON.parse((completedCursor && completedCursor.cursor_json) || "{}"); } catch (_) { completedCursorJson = {}; }
  completedCursorJson.completed_at = nowUtc();
  completedCursorJson.final_certification = certification;
  completedCursorJson.rows_promoted = rowsPromoted;
  await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='COMPLETED_PROMOTED_CLEANED', players_processed=players_total, next_run_after=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", JSON.stringify(completedCursorJson), ACTIVE_CURSOR_KEY);

  return { pass, certification, grade, checks: finalChecks, rows_promoted: rowsPromoted, stage_rows_after_clean: stageRowsAfterClean };
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
  const maxTickRuntimeMs = cap(inputJson.max_tick_runtime_ms || env.MAX_TICK_RUNTIME_MS || DEFAULT_MAX_TICK_RUNTIME_MS, 10000, 45000);
  const tickStartedAtMs = Date.now();
  let cursorJsonObj = {};
  try { cursorJsonObj = JSON.parse(cursor.cursor_json || "{}"); } catch (_) { cursorJsonObj = {}; }
  const perTickPlayers = Math.min(maxRequests, chunkSize);
  const offset = asInt(cursor.current_player_offset, 0);
  const total = players.length;
  const owner = asText(input.request_id, rid("base_hitter_owner"));
  const staleSeconds = cap(inputJson.lock_stale_seconds || env.LOCK_STALE_SECONDS || DEFAULT_LOCK_STALE_SECONDS, 30, 120);
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

  try {
    const slice = players.slice(offset, Math.min(offset + perTickPlayers, total));
    for (const p of slice) {
      if (rowsStagedThisTick >= maxRows) break;
      if (Date.now() - tickStartedAtMs >= maxTickRuntimeMs) {
        stoppedByRuntimeBudget = true;
        break;
      }
      sourceRequestCount++;
      let result;
      try {
        result = await processPlayer(env, p, sourceSeason, batchId, runId, cutoffDate, Math.max(1, maxRows - rowsStagedThisTick));
      } catch (err) {
        result = { player_id: p.player_id, player_name: p.player_name, status: "source_error", rows_staged: 0, error: String(err && err.message ? err.message : err) };
      }
      if (result.status === "success") sourceSuccessCount++;
      else if (result.status === "no_data") sourceNoDataCount++;
      else sourceErrorCount++;
      rowsStagedThisTick += asInt(result.rows_staged, 0);
      processedPlayers.push(result);
      nextOffset++;
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
      status: cert.pass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED",
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
      continuation_required: false,
      orchestrator_should_self_continue: false,
      cron_role: "rescue_fallback_only",
      manual_wake_required: false,
      fast_bounded_tick: true,
      tick_elapsed_ms: Date.now() - tickStartedAtMs,
      tick_runtime_budget_ms: maxTickRuntimeMs,
      tick_stopped_by_runtime_budget: stoppedByRuntimeBudget,
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
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_cursor SET status='PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS', last_error=?, next_run_after=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", String(err && err.message ? err.message : err).slice(0, 900), ACTIVE_CURSOR_KEY);
    await run(env.STATS_HITTER_DB, "UPDATE hitter_game_log_batches SET status='PARTIAL_CONTINUE_BASE_HITTER_GAME_LOGS', source_error_count=COALESCE(source_error_count,0)+1, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
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
      continuation_required: true,
      orchestrator_should_self_continue: true,
      manual_wake_required: false,
      fast_bounded_tick: true,
      tick_elapsed_ms: Date.now() - tickStartedAtMs,
      tick_runtime_budget_ms: maxTickRuntimeMs,
      tick_stopped_by_runtime_budget: stoppedByRuntimeBudget,
      effective_max_requests_per_tick: maxRequests,
      no_browser_pump: true,
      rows_read: sourceRequestCount,
      rows_written: rowsStagedThisTick,
      external_calls_performed: sourceRequestCount,
      fast_bounded_tick: true,
      tick_elapsed_ms: Date.now() - tickStartedAtMs,
      tick_runtime_budget_ms: maxTickRuntimeMs
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
