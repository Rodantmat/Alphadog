const WORKER_NAME = "alphadog-v2-base-hitter-game-logs";
const VERSION = "alphadog-v2-base-hitter-game-logs-v0.1.0-schema-source-lock-probe";
const JOB_KEY = "base-hitter-game-logs";

const LOCKED_SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=gameLog&group=hitting&season={season}";
const SOURCE_KEY = "mlb_statsapi_people_gameLog_hitting_v0_1_0";
const DATA_FEED_KEY = "base_hitter_game_logs";
const GROUP_TYPE = "hitting";
const DEFAULT_BASE_BACKFILL_CUTOFF_DATE = "2026-05-18";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_PROBE_PLAYER_LIMIT = 3;
const DEFAULT_PROBE_REQUEST_LIMIT = 3;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB"];
const EXPECTED_VARS = ["MLB_API_BASE_URL", "ACTIVE_SEASON", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES"];
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
  catch (err) { return { ok: false, error: String(err && err.message ? err.message : err), sql: sql.slice(0, 160) }; }
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
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  const secrets = varPresence(env, EXPECTED_SECRETS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "BASE_HITTER_GAME_LOGS_SCHEMA_SOURCE_LOCK_PROBE_READY",
    timestamp_utc: nowUtc(),
    locked_source: {
      source_key: SOURCE_KEY,
      data_feed_key: DATA_FEED_KEY,
      endpoint_pattern: LOCKED_SOURCE_ENDPOINT_PATTERN,
      group_type: GROUP_TYPE
    },
    mode_design: {
      base_backfill: "supported_for_schema_and_source_shape_probe_only_in_v0_1_0",
      delta_update: "schema_prepared_but_runtime_blocked_until_base_certified_and_user_approved",
      default_base_backfill_cutoff_date: DEFAULT_BASE_BACKFILL_CUTOFF_DATE,
      cutoff_date_configurable_per_batch: true
    },
    continuation_design: {
      owner: "backend_orchestrator_cron_state_machine",
      browser_pump: false,
      manual_wake_role: "testing_tick_only",
      one_active_run: true,
      cursor_persisted: true,
      partial_continue_status: true,
      no_live_promotion_before_certification: true
    },
    binding_summary: { db_bindings: db, vars, secrets_present_only: secrets },
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
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_PROBE',
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
    chunk_size_players INTEGER DEFAULT 3,
    max_requests_per_tick INTEGER DEFAULT 3,
    max_rows_per_tick INTEGER DEFAULT 250,
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
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_PROBE',
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

  await exec("record_schema_migration", "INSERT OR REPLACE INTO hitter_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_hitter_game_logs_v0_1_0_lifecycle_probe', ?, CURRENT_TIMESTAMP, 'Adds stage/batch/cursor/certification lifecycle for Base Hitter Game Logs source-lock probe')", VERSION);

  return { attempted: results.length, failed: results.filter(r => !r.ok).length, results };
}

async function schemaStatus(env) {
  const tables = await all(env.STATS_HITTER_DB, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'hitter_game_log%' OR name='hitter_game_logs' ORDER BY name");
  const liveCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_logs)");
  const stageCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_logs_stage)");
  const batchCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_game_log_batches)");
  return {
    tables: tables.map(r => r.name),
    hitter_game_logs_columns: liveCols.map(r => r.name),
    hitter_game_logs_stage_columns: stageCols.map(r => r.name),
    hitter_game_log_batches_columns: batchCols.map(r => r.name)
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
    batting_order: asInt(split && split.battingOrder, null),
    pa: asInt(stat.plateAppearances, null),
    ab: asInt(stat.atBats, null),
    hits,
    singles: Math.max(0, hits - doubles - triples - homeRuns),
    doubles,
    triples,
    home_runs: homeRuns,
    runs: asInt(stat.runs, null),
    rbi: asInt(stat.rbi, null),
    walks: asInt(stat.baseOnBalls, null),
    strikeouts: asInt(stat.strikeOuts, null),
    stolen_bases: asInt(stat.stolenBases, null),
    total_bases: asInt(stat.totalBases, null),
    group_type: GROUP_TYPE,
    data_feed_key: DATA_FEED_KEY,
    source_key: SOURCE_KEY,
    source_endpoint: endpoint,
    source_season: asInt(season),
    source_game_type: asText(split && split.gameType, null),
    ingestion_mode: mode,
    certification_status: "source_shape_probe_staged",
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

async function chooseProbePlayers(env, inputJson, limit) {
  const explicit = inputJson && Array.isArray(inputJson.player_ids) ? inputJson.player_ids.map(x => asInt(x, 0)).filter(Boolean) : [];
  if (explicit.length) return explicit.slice(0, limit).map(player_id => ({ player_id, player_name: null, source: "input_json.player_ids" }));
  let rows = await all(env.REF_DB, "SELECT player_id, player_name FROM ref_players WHERE active=1 AND player_id IS NOT NULL AND LOWER(COALESCE(primary_role,'')) NOT LIKE '%pitch%' ORDER BY player_id LIMIT ?", limit);
  if (!rows.length) rows = await all(env.REF_DB, "SELECT player_id, player_name FROM ref_players WHERE active=1 AND player_id IS NOT NULL ORDER BY player_id LIMIT ?", limit);
  return rows.map(r => ({ player_id: r.player_id, player_name: r.player_name || null, source: "REF_DB.ref_players" }));
}

async function runSourceShapeProbe(env, input) {
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
      certification: "DELTA_BLOCKED_BY_DESIGN_IN_V0_1_0",
      rows_read: 0,
      rows_written: 0,
      external_calls_performed: 0,
      no_live_promotion: true
    };
  }

  const runId = asText(input.run_id, rid("run_base_hitter_probe"));
  const batchId = asText(inputJson.batch_id, rid("hitter_base_probe_batch"));
  const cutoffDate = asText(inputJson.base_backfill_cutoff_date, DEFAULT_BASE_BACKFILL_CUTOFF_DATE);
  const sourceSeason = asInt(inputJson.source_season || env.ACTIVE_SEASON, DEFAULT_SOURCE_SEASON);
  const maxRequests = cap(inputJson.max_requests_per_tick || env.MAX_API_CALLS_PER_TICK || DEFAULT_PROBE_REQUEST_LIMIT, 1, 5);
  const playerLimit = cap(inputJson.probe_player_limit || inputJson.chunk_size_players || DEFAULT_PROBE_PLAYER_LIMIT, 1, maxRequests);
  const players = await chooseProbePlayers(env, inputJson, playerLimit);

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_batches (
    batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_endpoint, source_season,
    base_backfill_cutoff_date, chunk_size_players, max_requests_per_tick, max_rows_per_tick, certification_status, source_confidence,
    cursor_state_json, notes, updated_at
  ) VALUES (?, ?, ?, ?, 'base_backfill', 'SOURCE_SHAPE_PROBE_RUNNING', ?, ?, ?, ?, ?, ?, ?, ?, 'probe_not_promoted', 'SOURCE_LOCKED_PROBE', ?, ?, CURRENT_TIMESTAMP)`,
    batchId, runId, WORKER_NAME, VERSION, DATA_FEED_KEY, SOURCE_KEY, LOCKED_SOURCE_ENDPOINT_PATTERN, sourceSeason,
    cutoffDate, playerLimit, maxRequests, asInt(env.MAX_ROWS_PER_TICK, 250), JSON.stringify({ players, source_season: sourceSeason, cutoff_date: cutoffDate }),
    "v0.1.0 schema/source-lock probe only; no full historical backfill and no live promotion"
  );

  let sourceRequestCount = 0;
  let sourceSuccessCount = 0;
  let sourceNoDataCount = 0;
  let sourceErrorCount = 0;
  let rowsStaged = 0;
  const sampleShapes = [];
  const errors = [];

  for (const p of players.slice(0, maxRequests)) {
    const endpoint = endpointFor(env, p.player_id, sourceSeason);
    sourceRequestCount++;
    try {
      const resp = await fetch(endpoint, {
        method: "GET",
        headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-game-logs/0.1.0") }
      });
      const text = await resp.text();
      if (!resp.ok) {
        sourceErrorCount++;
        errors.push({ player_id: p.player_id, http_status: resp.status, preview: text.slice(0, 240) });
        continue;
      }
      const body = JSON.parse(text);
      const splits = body && body.stats && body.stats[0] && Array.isArray(body.stats[0].splits) ? body.stats[0].splits : [];
      if (!splits.length) {
        sourceNoDataCount++;
        sampleShapes.push({ player_id: p.player_id, player_name: p.player_name, split_count: 0, status: "NO_DATA_ALLOWED" });
        continue;
      }
      sourceSuccessCount++;
      let insertedForPlayer = 0;
      for (const split of splits) {
        const row = parseHitterSplit(split, p.player_id, p.player_name, sourceSeason, batchId, runId, "base_backfill", endpoint, cutoffDate);
        if (!row) continue;
        await insertStageRow(env, row);
        rowsStaged++;
        insertedForPlayer++;
        if (rowsStaged >= 50) break;
      }
      sampleShapes.push({
        player_id: p.player_id,
        player_name: p.player_name,
        split_count: splits.length,
        inserted_to_stage_for_probe: insertedForPlayer,
        first_split_keys: splits[0] ? Object.keys(splits[0]).slice(0, 20) : [],
        first_stat_keys: splits[0] && splits[0].stat ? Object.keys(splits[0].stat).slice(0, 30) : []
      });
    } catch (err) {
      sourceErrorCount++;
      errors.push({ player_id: p.player_id, error: String(err && err.message ? err.message : err) });
    }
  }

  const status = sourceErrorCount > 0 ? "SOURCE_SHAPE_PROBE_COMPLETED_WITH_ERRORS" : "SOURCE_SHAPE_PROBE_COMPLETED";
  const certification = sourceRequestCount > 0 && (sourceSuccessCount + sourceNoDataCount) > 0 ? "BASE_HITTER_GAME_LOGS_SOURCE_SHAPE_PROBE_STAGED_NO_PROMOTION" : "BASE_HITTER_GAME_LOGS_SOURCE_SHAPE_PROBE_INSUFFICIENT_DATA";
  const dataOk = certification === "BASE_HITTER_GAME_LOGS_SOURCE_SHAPE_PROBE_STAGED_NO_PROMOTION";

  await run(env.STATS_HITTER_DB, `UPDATE hitter_game_log_batches SET status=?, source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, certification_status=?, certification_grade=?, certification_json=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, sourceRequestCount, sourceSuccessCount, sourceNoDataCount, sourceErrorCount, rowsStaged, certification, dataOk ? "PROBE_PASS" : "PROBE_REVIEW", JSON.stringify({ sample_shapes: sampleShapes, errors, no_live_promotion: true }), batchId
  );

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_game_log_cursor (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,cursor_json,updated_at) VALUES ('base_hitter_game_logs_active_cursor',?,?,?,?,?,?,?,?,?,?,?,datetime('now','+5 minutes'),?,CURRENT_TIMESTAMP)`,
    batchId, runId, "base_backfill", "SOURCE_SHAPE_PROBE_COMPLETE_READY_FOR_SCHEMA_VALIDATION", sourceSeason, cutoffDate, players.length ? players[players.length - 1].player_id : null, players.length, players.length, sourceRequestCount, sourceRequestCount, JSON.stringify({ v0_1_0_probe_only: true, next_real_backfill_requires_user_approval: true })
  );

  return {
    ok: dataOk,
    data_ok: dataOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    status,
    certification,
    batch_id: batchId,
    run_id: runId,
    rows_read: sourceSuccessCount + sourceNoDataCount,
    rows_written: rowsStaged + 2,
    rows_staged: rowsStaged,
    rows_promoted: 0,
    external_calls_performed: sourceRequestCount,
    source_request_count: sourceRequestCount,
    source_success_count: sourceSuccessCount,
    source_no_data_count: sourceNoDataCount,
    source_error_count: sourceErrorCount,
    base_backfill_cutoff_date: cutoffDate,
    delta_reserved_start_date: "2026-05-19",
    no_live_promotion: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_prizepicks_board_mutation: true,
    no_sleeper_board_mutation: true,
    continuation_design_ready: true,
    next_status_for_future_full_backfill: "PARTIAL_CONTINUE",
    output_json: {
      source_shape_probe: true,
      sample_shapes: sampleShapes,
      errors,
      locked_endpoint_pattern: LOCKED_SOURCE_ENDPOINT_PATTERN,
      future_base_backfill_cutoff_date: cutoffDate,
      future_delta_start_date: "2026-05-19"
    },
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
      const output = await runSourceShapeProbe(env, input);
      return jsonResponse(output, output.ok ? 200 : 200);
    }

    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "GET /schema", "POST /diagnostic", "POST /run"], timestamp_utc: nowUtc() }, 404);
  }
};
