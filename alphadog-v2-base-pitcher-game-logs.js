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

async function acquireBatchLock(sql, batchId, owner, staleSeconds) {
  const rows = await sql`SELECT locked_by, lock_acquired_at, lock_expires_at FROM stats_pitcher.game_log_batches WHERE batch_id=${batchId}`;
  const row = rows[0] || null;
  const nowMs = Date.now();
  const lockedBy = row && row.locked_by ? String(row.locked_by) : null;
  const lockAcquiredMs = row && row.lock_acquired_at ? new Date(row.lock_acquired_at).getTime() : NaN;
  const lockExpiresMs = row && row.lock_expires_at ? new Date(row.lock_expires_at).getTime() : NaN;
  const sameOwner = !!(lockedBy && lockedBy === owner);
  const expired = !Number.isFinite(lockExpiresMs) || lockExpiresMs <= nowMs;
  const staleByAge = Number.isFinite(lockAcquiredMs) && (nowMs - lockAcquiredMs >= staleSeconds * 1000);
  if (lockedBy && !expired && !(sameOwner && staleByAge)) {
    return { ok: false, reason: sameOwner ? "same_owner_lock_not_stale_yet" : "batch_lock_busy", locked_by: lockedBy, lock_acquired_at: row.lock_acquired_at || null, lock_expires_at: row.lock_expires_at || null, same_owner: sameOwner, stale_seconds: staleSeconds, retry_after_seconds: sameOwner ? 20 : Math.max(15, Math.min(90, Math.ceil((lockExpiresMs - nowMs) / 1000))) };
  }
  await sql`UPDATE stats_pitcher.game_log_batches SET locked_by=${owner}, lock_acquired_at=now(), lock_expires_at=now() + make_interval(secs => ${staleSeconds}), stale_recovery_count=CASE WHEN locked_by IS NOT NULL THEN COALESCE(stale_recovery_count,0)+1 ELSE COALESCE(stale_recovery_count,0) END, updated_at=now() WHERE batch_id=${batchId}`;
  return { ok: true, owner, stale_seconds: staleSeconds, recovered_previous_lock: !!lockedBy };
}
async function releaseBatchLock(sql, batchId, owner) {
  await sql`UPDATE stats_pitcher.game_log_batches SET locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=now() WHERE batch_id=${batchId} AND locked_by=${owner}`;
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
  } finally { clearTimeout(timer); }
}

async function adoptExistingCoverageIfPresent(sql, batchId, runId, grade, p, cutoffDate) {
  const existingRows = await sql`
    SELECT COUNT(*)::int AS c, MIN(game_date) AS first_date, MAX(game_date) AS last_date
    FROM stats_pitcher.game_logs
    WHERE player_id=${p.player_id} AND game_date::date <= ${cutoffDate}::date
  `;
  const existing = existingRows[0] || {};
  const count = asInt(existing.c, 0);
  if (count <= 0) return null;
  await sql`
    UPDATE stats_pitcher.game_logs
    SET batch_id=${batchId}, run_id=${runId}, ingestion_mode='base_backfill',
        certification_status='base_backfill_certified_promoted', certification_grade=${grade},
        source_key=COALESCE(source_key, ${SOURCE_KEY}), certified_at=now(), promoted_at=now(), updated_at=now()
    WHERE player_id=${p.player_id} AND game_date::date <= ${cutoffDate}::date
  `;
  await sql`
    INSERT INTO stats_pitcher.game_log_player_outcomes (
      batch_id,run_id,player_id,player_name,primary_position,cursor_offset,source_endpoint,source_http_status,source_ok,
      raw_payload_split_count,rows_before_cutoff,rows_filtered_after_cutoff,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,
      first_raw_game_date,last_raw_game_date,first_promoted_game_date,last_promoted_game_date,certification_status,certification_grade,updated_at
    ) VALUES (
      ${batchId}, ${runId}, ${asInt(p.player_id, 0)}, ${asText(p.player_name, null)}, ${asText(p.primary_position, null)}, 0, 'adopted_from_existing_backfill', NULL, 1,
      0, 0, 0, 0, ${count}, 'PROMOTED_ROWS',
      'Adopted real, already-mined rows from prior backfill into this batch - no new MLB fetch needed, no duplication.', NULL,
      ${existing.first_date}, ${existing.last_date}, ${existing.first_date}, ${existing.last_date},
      'player_outcome_unverified', NULL, now()
    )
    ON CONFLICT (batch_id, player_id) DO UPDATE SET
      run_id=excluded.run_id, promoted_row_count=excluded.promoted_row_count, terminal_category=excluded.terminal_category,
      category_reason=excluded.category_reason, first_promoted_game_date=excluded.first_promoted_game_date,
      last_promoted_game_date=excluded.last_promoted_game_date, updated_at=now()
  `;
  return { player_id: p.player_id, player_name: p.player_name, status: "adopted", adopted_row_count: count, first_promoted_game_date: existing.first_date, last_promoted_game_date: existing.last_date, terminal_category: "PROMOTED_ROWS" };
}

async function processPlayer(env, sql, p, sourceSeason, batchId, runId, cutoffDate, maxRowsRemaining, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const endpoint = endpointFor(env, p.player_id, sourceSeason);
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-pitcher-game-logs/1.0.0") } }, fetchTimeoutMs);
  if (!fetched.ok) return { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: fetched.timed_out ? "fetch_timeout" : "fetch_exception", error: fetched.error, rows_staged: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, source_endpoint: endpoint, retry_same_player: true };
  const resp = fetched.resp, text = fetched.text || "";
  if (!resp.ok) return { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: "http_error", http_status: resp.status, rows_staged: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, source_endpoint: endpoint, preview: text.slice(0, 240), retry_same_player: true };
  let body;
  try { body = JSON.parse(text); }
  catch (err) { return { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: "json_parse_error", error: String(err && err.message ? err.message : err), rows_staged: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, source_endpoint: endpoint, retry_same_player: true }; }
  const splits = body && body.stats && body.stats[0] && Array.isArray(body.stats[0].splits) ? body.stats[0].splits : [];
  const rawDates = splits.map(splitGameDate).filter(Boolean).sort();
  const rawSplitCount = splits.length;
  if (!rawSplitCount) return { player_id: p.player_id, player_name: p.player_name, status: "no_data", http_status: resp.status, split_count: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, rows_staged: 0, source_endpoint: endpoint };
  let inserted = 0, beforeCutoff = 0, filteredAfterCutoff = 0, invalidBeforeCutoff = 0;
  const stagedDates = [];
  for (const split of splits) {
    if (inserted >= maxRowsRemaining) break;
    const gameDate = splitGameDate(split);
    if (cutoffDate && gameDate && gameDate > cutoffDate) { filteredAfterCutoff++; continue; }
    beforeCutoff++;
    const row = parsePitcherSplit(split, p.player_id, p.player_name, sourceSeason, batchId, runId, "base_backfill", endpoint, cutoffDate);
    if (!row) { invalidBeforeCutoff++; continue; }
    await insertStageRow(sql, row);
    stagedDates.push(row.game_date);
    inserted++;
  }
  let status = "success";
  if (inserted <= 0 && filteredAfterCutoff > 0 && beforeCutoff === 0) status = "filtered_after_cutoff";
  else if (inserted <= 0) status = "repair_required";
  return { player_id: p.player_id, player_name: p.player_name, status, http_status: resp.status, split_count: rawSplitCount, raw_payload_split_count: rawSplitCount, rows_before_cutoff: beforeCutoff, rows_filtered_after_cutoff: filteredAfterCutoff, invalid_before_cutoff_rows: invalidBeforeCutoff, rows_staged: inserted, source_endpoint: endpoint, first_raw_game_date: rawDates[0] || null, last_raw_game_date: rawDates[rawDates.length - 1] || null, first_promoted_game_date: stagedDates[0] || null, last_promoted_game_date: stagedDates[stagedDates.length - 1] || null };
}

async function promoteStageRowsChunk(sql, batchId, grade, limit) {
  const safeLimit = cap(limit || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 300);
  const rows = await sql`
    SELECT
      s.stage_id,s.player_id,s.game_pk,s.season,s.game_date,s.team_id,s.opponent_team_id,s.opponent_abbr,s.is_home,s.role,
      s.innings_pitched_decimal,s.outs_recorded,s.batters_faced,s.hits_allowed,s.runs_allowed,s.earned_runs,s.walks_allowed,s.strikeouts,s.home_runs_allowed,
      s.pitches,s.balls,s.strikes,s.wins,s.losses,s.saves,s.holds,s.blown_saves,
      s.raw_json,s.source_key,s.source_confidence,s.group_type,s.data_feed_key,s.source_endpoint,s.source_season,s.source_game_type,s.ingestion_mode,s.batch_id,s.run_id
    FROM stats_pitcher.game_logs_stage s
    WHERE s.batch_id=${batchId} AND s.row_status != 'promoted'
    ORDER BY s.stage_id
    LIMIT ${safeLimit}
  `;
  if (!rows.length) {
    const remainingNoneRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs_stage s WHERE s.batch_id=${batchId} AND s.row_status != 'promoted'`;
    return { promoted_this_tick: 0, remaining_unpromoted: asInt(remainingNoneRows[0] && remainingNoneRows[0].c, 0), promote_limit: safeLimit, insert_mode: "postgres_on_conflict_log_id" };
  }
  let promotedThisTick = 0;
  for (const r of rows) {
    const logId = `${r.player_id}_${r.game_pk}_pitching`;
    // Sticky-ownership pattern applied from the start (same grounded fix as hitter): real DATA
    // always overwrites with fresh truth; batch OWNERSHIP/certification lineage stays with
    // whichever batch first claimed the row, via COALESCE(existing, new) instead of blind excluded.col.
    await sql`
      INSERT INTO stats_pitcher.game_logs (
        log_id,player_id,game_pk,season,game_date,team_id,opponent_team_id,opponent_abbr,is_home,
        innings_pitched_decimal,outs_recorded,batters_faced,hits_allowed,runs_allowed,earned_runs,walks_allowed,strikeouts,home_runs_allowed,
        pitches,balls,strikes,wins,losses,saves,holds,blown_saves,
        raw_json,source_key,source_confidence,updated_at,group_type,data_feed_key,source_endpoint,source_season,source_game_type,ingestion_mode,batch_id,run_id,
        certification_status,certification_grade,certified_at,promoted_at,created_at,role,player_name
      ) VALUES (
        ${logId},${r.player_id},${r.game_pk},${r.season},${r.game_date},${r.team_id},${r.opponent_team_id},${r.opponent_abbr},${r.is_home},
        ${r.innings_pitched_decimal},${r.outs_recorded},${r.batters_faced},${r.hits_allowed},${r.runs_allowed},${r.earned_runs},${r.walks_allowed},${r.strikeouts},${r.home_runs_allowed},
        ${r.pitches},${r.balls},${r.strikes},${r.wins},${r.losses},${r.saves},${r.holds},${r.blown_saves},
        ${r.raw_json},${r.source_key},${r.source_confidence}, now(), ${r.group_type},${r.data_feed_key},${r.source_endpoint},${r.source_season},${r.source_game_type},${r.ingestion_mode},${r.batch_id},${r.run_id},
        ${r.ingestion_mode === 'delta_update' ? 'delta_update_certified_promoted' : 'base_backfill_certified_promoted'}, ${grade}, now(), now(), now(), ${r.role}, NULL
      )
      ON CONFLICT (log_id) DO UPDATE SET
        game_date=excluded.game_date, team_id=excluded.team_id, opponent_team_id=excluded.opponent_team_id, opponent_abbr=excluded.opponent_abbr, is_home=excluded.is_home,
        innings_pitched_decimal=excluded.innings_pitched_decimal, outs_recorded=excluded.outs_recorded, batters_faced=excluded.batters_faced, hits_allowed=excluded.hits_allowed,
        runs_allowed=excluded.runs_allowed, earned_runs=excluded.earned_runs, walks_allowed=excluded.walks_allowed, strikeouts=excluded.strikeouts, home_runs_allowed=excluded.home_runs_allowed,
        pitches=excluded.pitches, balls=excluded.balls, strikes=excluded.strikes, wins=excluded.wins, losses=excluded.losses, saves=excluded.saves, holds=excluded.holds, blown_saves=excluded.blown_saves,
        raw_json=excluded.raw_json, role=excluded.role, season=excluded.season,
        batch_id=COALESCE(stats_pitcher.game_logs.batch_id, excluded.batch_id),
        run_id=COALESCE(stats_pitcher.game_logs.run_id, excluded.run_id),
        group_type=excluded.group_type, data_feed_key=excluded.data_feed_key, source_endpoint=excluded.source_endpoint,
        source_season=excluded.source_season, source_game_type=excluded.source_game_type,
        ingestion_mode=COALESCE(stats_pitcher.game_logs.ingestion_mode, excluded.ingestion_mode), source_key=excluded.source_key, source_confidence=excluded.source_confidence,
        certification_status=COALESCE(stats_pitcher.game_logs.certification_status, excluded.certification_status),
        certification_grade=COALESCE(stats_pitcher.game_logs.certification_grade, excluded.certification_grade),
        promoted_at=now(), updated_at=now()
    `;
    await sql`UPDATE stats_pitcher.game_logs_stage SET row_status='promoted', certification_status='base_backfill_certified', certification_grade=${grade}, promoted_at=now(), updated_at=now() WHERE stage_id=${r.stage_id} AND batch_id=${batchId}`;
    promotedThisTick += 1;
  }
  const remainingRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs_stage s WHERE s.batch_id=${batchId} AND s.row_status != 'promoted'`;
  return { promoted_this_tick: promotedThisTick, remaining_unpromoted: asInt(remainingRows[0] && remainingRows[0].c, 0), promote_limit: safeLimit, insert_mode: "postgres_on_conflict_log_id" };
}

async function cleanStageRowsChunk(sql, batchId, limit) {
  const safeLimit = cap(limit || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 8000);
  const res = await sql`DELETE FROM stats_pitcher.game_logs_stage WHERE ctid IN (SELECT ctid FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId} LIMIT ${safeLimit})`;
  const cleaned = Number(res.count || 0);
  const probablyDone = cleaned < safeLimit;
  return { cleaned_this_tick: cleaned, stage_rows_after_clean: probablyDone ? 0 : null, cleanup_done: probablyDone, clean_limit: safeLimit, delete_mode: "ctid_subquery_limit_no_count" };
}

function classifyPlayerOutcome(result) {
  if (!result || result.status === "source_error") return "SOURCE_ERROR";
  if (asInt(result.raw_payload_split_count, 0) === 0) return "TRUE_NO_DATA";
  if (asInt(result.rows_staged, 0) > 0) return "PROMOTED_ROWS";
  if (asInt(result.rows_filtered_after_cutoff, 0) > 0 && asInt(result.rows_before_cutoff, 0) === 0) return "FILTERED_AFTER_CUTOFF";
  return "REPAIR_REQUIRED";
}
function outcomeReason(result, category) {
  if (category === "PROMOTED_ROWS") return "Source returned regular-season pitching rows within the base cutoff and rows were staged for promotion.";
  if (category === "TRUE_NO_DATA") return "MLB StatsAPI returned zero pitching game-log splits for this player and season.";
  if (category === "FILTERED_AFTER_CUTOFF") return "MLB StatsAPI returned pitching game-log splits, but every split was after the base cutoff date and belongs to delta.";
  if (category === "SOURCE_ERROR") return result && result.error_type ? `Source request failed: ${result.error_type}` : "Source request failed.";
  return "Source returned data but no rows were staged inside the base cutoff; transformation/cutoff parsing must be repaired before delta opens.";
}

async function upsertPlayerOutcome(sql, batchId, runId, p, cursorOffset, result, endpoint) {
  const category = classifyPlayerOutcome(result);
  await sql`
    INSERT INTO stats_pitcher.game_log_player_outcomes (
      batch_id,run_id,player_id,player_name,primary_position,cursor_offset,source_endpoint,source_http_status,source_ok,
      raw_payload_split_count,rows_before_cutoff,rows_filtered_after_cutoff,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,
      first_raw_game_date,last_raw_game_date,first_promoted_game_date,last_promoted_game_date,certification_status,certification_grade,updated_at
    ) VALUES (
      ${batchId}, ${runId}, ${asInt(p && p.player_id, 0)}, ${asText((p && p.player_name) || (result && result.player_name), null)}, ${asText(p && p.primary_position, null)},
      ${asInt(cursorOffset, 0)}, ${endpoint || (result && result.source_endpoint) || null},
      ${result && result.http_status !== undefined ? asInt(result.http_status, null) : null}, ${category === "SOURCE_ERROR" ? 0 : 1},
      ${asInt(result && result.raw_payload_split_count, 0)}, ${asInt(result && result.rows_before_cutoff, 0)}, ${asInt(result && result.rows_filtered_after_cutoff, 0)}, ${asInt(result && result.rows_staged, 0)}, 0,
      ${category}, ${outcomeReason(result, category)}, ${result && result.error ? String(result.error).slice(0, 900) : null},
      ${result && result.first_raw_game_date ? result.first_raw_game_date : null}, ${result && result.last_raw_game_date ? result.last_raw_game_date : null},
      ${result && result.first_promoted_game_date ? result.first_promoted_game_date : null}, ${result && result.last_promoted_game_date ? result.last_promoted_game_date : null},
      'player_outcome_unverified', NULL, now()
    )
    ON CONFLICT (batch_id, player_id) DO UPDATE SET
      run_id=excluded.run_id, player_name=excluded.player_name, primary_position=excluded.primary_position, cursor_offset=excluded.cursor_offset,
      source_endpoint=excluded.source_endpoint, source_http_status=excluded.source_http_status, source_ok=excluded.source_ok,
      raw_payload_split_count=excluded.raw_payload_split_count, rows_before_cutoff=excluded.rows_before_cutoff, rows_filtered_after_cutoff=excluded.rows_filtered_after_cutoff,
      rows_staged=excluded.rows_staged, promoted_row_count=excluded.promoted_row_count, terminal_category=excluded.terminal_category,
      category_reason=excluded.category_reason, source_error=excluded.source_error, first_raw_game_date=excluded.first_raw_game_date,
      last_raw_game_date=excluded.last_raw_game_date, first_promoted_game_date=excluded.first_promoted_game_date, last_promoted_game_date=excluded.last_promoted_game_date,
      certification_status=excluded.certification_status, certification_grade=excluded.certification_grade, updated_at=now()
  `;
  return category;
}

async function rebuildMissingOutcomeRowsFromCursor(sql, batchId, runId) {
  const cursorRows = await sql`SELECT cursor_json FROM stats_pitcher.game_log_cursor WHERE batch_id=${batchId} OR cursor_key=${ACTIVE_CURSOR_KEY} ORDER BY updated_at DESC LIMIT 1`;
  const cursor = cursorRows[0] || null;
  let players = [];
  try { players = JSON.parse((cursor && cursor.cursor_json) || "{}").players || []; } catch (_) { players = []; }
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const existingRows = await sql`SELECT player_id FROM stats_pitcher.game_log_player_outcomes WHERE batch_id=${batchId} AND player_id=${asInt(p.player_id, 0)}`;
    if (existingRows[0]) continue;
    await sql`
      INSERT INTO stats_pitcher.game_log_player_outcomes (batch_id,run_id,player_id,player_name,primary_position,cursor_offset,source_ok,raw_payload_split_count,rows_before_cutoff,rows_filtered_after_cutoff,rows_staged,promoted_row_count,terminal_category,category_reason,certification_status,updated_at)
      VALUES (${batchId}, ${runId}, ${asInt(p.player_id, 0)}, ${asText(p.player_name, null)}, ${asText(p.primary_position, null)}, ${i}, 0, 0, 0, 0, 0, 0, 'UNCLEAR', 'Player existed in cursor but no per-player source outcome was recorded; rerun/repair required before delta.', 'player_outcome_unverified', now())
      ON CONFLICT (batch_id, player_id) DO UPDATE SET run_id=excluded.run_id, player_name=excluded.player_name, primary_position=excluded.primary_position, cursor_offset=excluded.cursor_offset, terminal_category=excluded.terminal_category, category_reason=excluded.category_reason, certification_status=excluded.certification_status, updated_at=now()
    `;
  }
}

async function certifyPlayerOutcomeUniverse(sql, batchId, runId, cutoffDate) {
  await rebuildMissingOutcomeRowsFromCursor(sql, batchId, runId);
  const cursorRows = await sql`SELECT players_total FROM stats_pitcher.game_log_cursor WHERE batch_id=${batchId} OR cursor_key=${ACTIVE_CURSOR_KEY} ORDER BY updated_at DESC LIMIT 1`;
  const playersTotal = asInt(cursorRows[0] && cursorRows[0].players_total, 0);
  const totalsRows = await sql`
    SELECT
      COUNT(*)::int AS outcome_total, COUNT(DISTINCT player_id)::int AS distinct_outcome_players,
      (COUNT(*) - COUNT(DISTINCT player_id))::int AS duplicate_outcome_rows,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END)::int AS promoted_players,
      SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END)::int AS true_no_data_players,
      SUM(CASE WHEN terminal_category='FILTERED_AFTER_CUTOFF' THEN 1 ELSE 0 END)::int AS filtered_after_cutoff_players,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END)::int AS source_error_players,
      SUM(CASE WHEN terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END)::int AS repair_required_players,
      SUM(CASE WHEN terminal_category='UNCLEAR' THEN 1 ELSE 0 END)::int AS unclear_players,
      SUM(CASE WHEN terminal_category NOT IN ('PROMOTED_ROWS','TRUE_NO_DATA','FILTERED_AFTER_CUTOFF','SOURCE_ERROR','REPAIR_REQUIRED','UNCLEAR') THEN 1 ELSE 0 END)::int AS invalid_category_players,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' AND COALESCE(rows_staged,0) <= 0 AND COALESCE(promoted_row_count,0) <= 0 THEN 1 ELSE 0 END)::int AS promoted_without_rows,
      SUM(CASE WHEN terminal_category!='PROMOTED_ROWS' AND (COALESCE(rows_staged,0) > 0 OR COALESCE(promoted_row_count,0) > 0) THEN 1 ELSE 0 END)::int AS non_promoted_with_rows,
      SUM(COALESCE(rows_before_cutoff,0))::int AS rows_before_cutoff, SUM(COALESCE(rows_staged,0))::int AS rows_staged
    FROM stats_pitcher.game_log_player_outcomes WHERE batch_id=${batchId}
  `;
  const totals = totalsRows[0] || {};
  const categoryTotal = asInt(totals.promoted_players, 0) + asInt(totals.true_no_data_players, 0) + asInt(totals.filtered_after_cutoff_players, 0) + asInt(totals.source_error_players, 0) + asInt(totals.repair_required_players, 0) + asInt(totals.unclear_players, 0);
  const pass = playersTotal > 0 && asInt(totals.outcome_total, 0) === playersTotal && asInt(totals.distinct_outcome_players, 0) === playersTotal && asInt(totals.duplicate_outcome_rows, 0) === 0 && categoryTotal === playersTotal && asInt(totals.source_error_players, 0) === 0 && asInt(totals.repair_required_players, 0) === 0 && asInt(totals.unclear_players, 0) === 0 && asInt(totals.invalid_category_players, 0) === 0 && asInt(totals.promoted_without_rows, 0) === 0 && asInt(totals.non_promoted_with_rows, 0) === 0;
  const summary = { version: VERSION, batch_id: batchId, run_id: runId, cutoff_date: cutoffDate, players_total: playersTotal, category_total: categoryTotal, pass, delta_gate_open: pass, ...totals };
  await sql`UPDATE stats_pitcher.game_log_player_outcomes SET certification_status=${pass ? "player_outcome_certified" : "player_outcome_certification_failed"}, certification_grade=${pass ? "BASE_PASS" : "BASE_FAIL"}, updated_at=now() WHERE batch_id=${batchId}`;
  return summary;
}

async function deriveSourceCountersFromOutcomes(sql, batchId) {
  const rows = await sql`
    SELECT COUNT(*)::int AS outcome_total, COUNT(DISTINCT player_id)::int AS distinct_outcome_players,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END)::int AS promoted_players,
      SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END)::int AS true_no_data_players,
      SUM(CASE WHEN terminal_category='FILTERED_AFTER_CUTOFF' THEN 1 ELSE 0 END)::int AS filtered_after_cutoff_players,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END)::int AS source_error_players,
      SUM(CASE WHEN terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END)::int AS repair_required_players,
      SUM(CASE WHEN terminal_category='UNCLEAR' THEN 1 ELSE 0 END)::int AS unclear_players
    FROM stats_pitcher.game_log_player_outcomes WHERE batch_id=${batchId}
  `;
  const row = rows[0] || {};
  const promotedPlayers = asInt(row.promoted_players, 0), filteredAfterCutoffPlayers = asInt(row.filtered_after_cutoff_players, 0);
  return {
    outcome_total: asInt(row.outcome_total, 0), distinct_outcome_players: asInt(row.distinct_outcome_players, 0),
    promoted_players: promotedPlayers, true_no_data_players: asInt(row.true_no_data_players, 0),
    filtered_after_cutoff_players: filteredAfterCutoffPlayers, source_error_players: asInt(row.source_error_players, 0),
    repair_required_players: asInt(row.repair_required_players, 0), unclear_players: asInt(row.unclear_players, 0),
    source_request_count: asInt(row.outcome_total, 0), source_success_count: promotedPlayers + filteredAfterCutoffPlayers,
    source_no_data_count: asInt(row.true_no_data_players, 0), source_error_count: asInt(row.source_error_players, 0),
    source_success_definition: "PROMOTED_ROWS + FILTERED_AFTER_CUTOFF; both are successful 200/source payload terminal outcomes. TRUE_NO_DATA is a terminal empty source outcome, not success."
  };
}
async function freezeSourceCountersFromOutcomes(sql, batchId) {
  const c = await deriveSourceCountersFromOutcomes(sql, batchId);
  await sql`UPDATE stats_pitcher.game_log_batches SET source_request_count=${c.source_request_count}, source_success_count=${c.source_success_count}, source_no_data_count=${c.source_no_data_count}, source_error_count=${c.source_error_count}, updated_at=now() WHERE batch_id=${batchId}`;
  return c;
}

async function isFinalizationOnlyReady(sql, batchId, expectedPlayers) {
  const rows = await sql`
    SELECT b.status, b.cursor_offset, c.current_player_offset, c.players_total,
      COUNT(o.player_id)::int AS outcome_total, COUNT(DISTINCT o.player_id)::int AS distinct_outcome_players,
      SUM(CASE WHEN o.terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END)::int AS source_error_players,
      SUM(CASE WHEN o.terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END)::int AS repair_required_players,
      SUM(CASE WHEN o.terminal_category='UNCLEAR' THEN 1 ELSE 0 END)::int AS unclear_players
    FROM stats_pitcher.game_log_batches b
    LEFT JOIN stats_pitcher.game_log_cursor c ON c.batch_id=b.batch_id
    LEFT JOIN stats_pitcher.game_log_player_outcomes o ON o.batch_id=b.batch_id
    WHERE b.batch_id=${batchId}
    GROUP BY b.batch_id, b.status, b.cursor_offset, c.current_player_offset, c.players_total
  `;
  const row = rows[0] || null;
  const total = asInt((row && row.players_total) || expectedPlayers, 0);
  const cursorDone = total > 0 && asInt(row && row.cursor_offset, 0) >= total && asInt(row && row.current_player_offset, 0) >= total;
  const outcomesDone = total > 0 && asInt(row && row.outcome_total, 0) === total && asInt(row && row.distinct_outcome_players, 0) === total;
  const unresolved = asInt(row && row.source_error_players, 0) + asInt(row && row.repair_required_players, 0) + asInt(row && row.unclear_players, 0);
  const status = String((row && row.status) || "");
  const finalizationStatuses = new Set(["BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION", "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", "BASE_BACKFILL_PROMOTING", "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN", "BASE_BACKFILL_CLEANING", "CERTIFICATION_FAILED", "COMPLETED_PROMOTED_CLEANED"]);
  return { ready: (cursorDone && outcomesDone && unresolved === 0) || finalizationStatuses.has(status), status, players_total: total, cursor_done: cursorDone, outcomes_done: outcomesDone, unresolved_players: unresolved };
}

async function buildPrePromotionChecks(sql, batchId, runId, cutoffDate) {
  const summaryRows = await sql`
    SELECT COUNT(*)::int AS rows_staged, COUNT(DISTINCT player_id)::int AS distinct_players, COUNT(DISTINCT game_pk)::int AS distinct_games,
      MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date,
      SUM(CASE WHEN player_id IS NULL OR game_pk IS NULL OR season IS NULL OR game_date IS NULL OR source_key IS NULL OR source_endpoint IS NULL THEN 1 ELSE 0 END)::int AS missing_required,
      SUM(CASE WHEN group_type!='pitching' THEN 1 ELSE 0 END)::int AS non_pitching_rows,
      SUM(CASE WHEN game_date > ${cutoffDate} THEN 1 ELSE 0 END)::int AS after_cutoff_rows,
      SUM(CASE WHEN COALESCE(strikeouts,0)<0 OR COALESCE(walks_allowed,0)<0 OR COALESCE(hits_allowed,0)<0 OR COALESCE(runs_allowed,0)<0 OR COALESCE(earned_runs,0)<0 OR COALESCE(home_runs_allowed,0)<0 OR COALESCE(outs_recorded,0)<0 OR COALESCE(batters_faced,0)<0 OR (earned_runs>runs_allowed AND earned_runs IS NOT NULL AND runs_allowed IS NOT NULL) THEN 1 ELSE 0 END)::int AS bad_math_rows
    FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId}
  `;
  const summary = summaryRows[0] || {};
  const dupRows = await sql`SELECT COUNT(*)::int AS duplicate_count FROM (SELECT player_id, game_pk, group_type, COUNT(*) AS c FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId} GROUP BY player_id, game_pk, group_type HAVING COUNT(*) > 1) sub`;
  const dup = dupRows[0] || {};
  const outcomeSummary = await certifyPlayerOutcomeUniverse(sql, batchId, runId, cutoffDate);
  const sourceTruth = await freezeSourceCountersFromOutcomes(sql, batchId);
  const rowsStaged = asInt(summary.rows_staged, 0);
  const duplicateCount = asInt(dup.duplicate_count, 0);
  const stageMatchesOutcomeRows = rowsStaged === asInt(outcomeSummary.rows_before_cutoff, 0);
  const pass = rowsStaged > 0 && asInt(sourceTruth.source_request_count, 0) === asInt(outcomeSummary.players_total, 0) && asInt(sourceTruth.source_success_count, 0) > 0 && asInt(sourceTruth.source_error_count, 0) === 0 && duplicateCount === 0 && asInt(summary.missing_required, 0) === 0 && asInt(summary.non_pitching_rows, 0) === 0 && asInt(summary.after_cutoff_rows, 0) === 0 && asInt(summary.bad_math_rows, 0) === 0 && stageMatchesOutcomeRows && outcomeSummary.pass === true;
  const grade = pass ? "BASE_PASS" : "BASE_FAIL";
  const certification = pass ? "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED" : "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED";
  const checks = { version: VERSION, cutoff_date: cutoffDate, rows_staged: rowsStaged, duplicate_count: duplicateCount, missing_required: asInt(summary.missing_required, 0), non_pitching_rows: asInt(summary.non_pitching_rows, 0), after_cutoff_rows: asInt(summary.after_cutoff_rows, 0), bad_math_rows: asInt(summary.bad_math_rows, 0), stage_matches_outcome_rows: stageMatchesOutcomeRows, player_outcome_universe: outcomeSummary, pass, no_scoring: true, no_ranking: true, no_board_mutation: true };
  return { pass, certification, grade, checks, duplicateCount, rowsStaged, sourceTruth };
}

async function certifyAndPromoteIfClean(sql, batchId, runId, cutoffDate, options = {}) {
  const promoteLimit = cap(options.promote_rows_per_tick || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 800);
  const cleanLimit = cap(options.clean_rows_per_tick || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 8000);
  const batchRows = await sql`SELECT * FROM stats_pitcher.game_log_batches WHERE batch_id=${batchId}`;
  let batch = batchRows[0] || null;
  let status = batch && batch.status ? String(batch.status) : "";
  let stageCountCached = null;
  async function getStageCount() { if (stageCountCached !== null) return stageCountCached; const rows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId}`; stageCountCached = asInt(rows[0] && rows[0].c, 0); return stageCountCached; }

  if (status === "COMPLETED_PROMOTED_CLEANED") {
    const liveRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs WHERE batch_id=${batchId} AND certification_status='base_backfill_certified_promoted'`;
    const sourceTruth = await freezeSourceCountersFromOutcomes(sql, batchId);
    return { pass: true, done: true, continuation_required: false, status, certification: batch.certification_status || "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED", grade: batch.certification_grade || "BASE_PASS", checks: { version: VERSION, already_completed: true, source_counters_from_outcomes: sourceTruth }, rows_promoted: asInt(liveRows[0] && liveRows[0].c, 0), stage_rows_after_clean: await getStageCount() };
  }
  if (status === "CERTIFICATION_FAILED" && (asInt(batch && batch.rows_staged, 0) > 0 || await getStageCount() > 0)) {
    await sql`UPDATE stats_pitcher.game_log_batches SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', certification_status='pending_batch_certification', certification_grade=NULL, locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=now() WHERE batch_id=${batchId}`;
    await sql`UPDATE stats_pitcher.game_log_cursor SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', last_error=NULL, next_run_after=now(), updated_at=now() WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
    status = "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION";
  }

  const liveRowsEarlyRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs WHERE batch_id=${batchId} AND certification_status='base_backfill_certified_promoted'`;
  const rowsPromotedEarly = asInt(liveRowsEarlyRows[0] && liveRowsEarlyRows[0].c, 0);
  const expectedRowsEarly = asInt(batch && batch.rows_staged, 0) || await getStageCount();
  if (expectedRowsEarly > 0 && rowsPromotedEarly >= expectedRowsEarly) {
    const grade = batch.certification_grade || "BASE_PASS";
    const cleaned = await cleanStageRowsChunk(sql, batchId, cleanLimit);
    if (cleaned.cleanup_done !== true) {
      await sql`UPDATE stats_pitcher.game_log_batches SET status='BASE_BACKFILL_CLEANING', rows_promoted=${rowsPromotedEarly}, promoted_at=COALESCE(promoted_at,now()), updated_at=now() WHERE batch_id=${batchId}`;
      return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CLEANING", certification: "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CLEAN_MICROPHASE", grade, checks: { cleaned }, rows_promoted: rowsPromotedEarly, stage_rows_after_clean: cleaned.stage_rows_after_clean };
    }
    const sourceTruth = await deriveSourceCountersFromOutcomes(sql, batchId);
    const unresolved = asInt(sourceTruth.source_error_players, 0) + asInt(sourceTruth.repair_required_players, 0) + asInt(sourceTruth.unclear_players, 0);
    const finalPass = rowsPromotedEarly >= expectedRowsEarly && sourceTruth.outcome_total > 0 && sourceTruth.outcome_total === sourceTruth.distinct_outcome_players && unresolved === 0;
    const cert = finalPass ? "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED" : "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED";
    const finalChecks = { version: VERSION, rows_promoted: rowsPromotedEarly, expected_promoted_rows: expectedRowsEarly, source_counters_from_outcomes: sourceTruth, pass: finalPass };
    await sql`UPDATE stats_pitcher.game_log_batches SET status=CASE WHEN ${finalPass} THEN 'COMPLETED_PROMOTED_CLEANED' ELSE 'CERTIFICATION_FAILED' END, rows_promoted=${rowsPromotedEarly}, certification_status=${cert}, certification_grade=CASE WHEN ${finalPass} THEN ${grade} ELSE 'BASE_FAIL' END, certification_json=${JSON.stringify(finalChecks)}, finished_at=now(), promoted_at=COALESCE(promoted_at,now()), cleaned_at=CASE WHEN ${finalPass} THEN now() ELSE cleaned_at END, locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=now() WHERE batch_id=${batchId}`;
    await sql`UPDATE stats_pitcher.game_log_cursor SET status=${finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED"}, players_processed=players_total, next_run_after=NULL, updated_at=now() WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
    return { pass: finalPass, done: true, continuation_required: false, status: finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED", certification: cert, grade: finalPass ? grade : "BASE_FAIL", checks: finalChecks, rows_promoted: rowsPromotedEarly, stage_rows_after_clean: 0 };
  }

  if (status === "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION" || status === "BASE_BACKFILL_RUNNING" || status === "PARTIAL_CONTINUE_BASE_PITCHER_GAME_LOGS") {
    const pre = await buildPrePromotionChecks(sql, batchId, runId, cutoffDate);
    const checksJson = JSON.stringify(pre.checks);
    await sql`
      INSERT INTO stats_pitcher.game_log_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,created_at)
      VALUES (${`cert_${batchId}`}, ${batchId}, ${runId}, 'base_backfill', ${pre.certification}, ${pre.grade}, ${checksJson}, ${pre.rowsStaged}, 0, ${pre.duplicateCount}, ${asInt(pre.sourceTruth.source_no_data_count,0)}, ${asInt(pre.sourceTruth.source_error_count,0)}, now())
      ON CONFLICT (certification_id) DO UPDATE SET certification_status=excluded.certification_status, certification_grade=excluded.certification_grade, checks_json=excluded.checks_json, rows_staged=excluded.rows_staged
    `;
    if (!pre.pass) {
      await sql`UPDATE stats_pitcher.game_log_batches SET status='CERTIFICATION_FAILED', certification_status=${pre.certification}, certification_grade=${pre.grade}, certification_json=${checksJson}, duplicate_count=${pre.duplicateCount}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
      await sql`UPDATE stats_pitcher.game_log_cursor SET status='CERTIFICATION_FAILED', last_error='base backfill certification failed', next_run_after=NULL, updated_at=now() WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
      return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: pre.certification, grade: pre.grade, checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
    }
    await sql`UPDATE stats_pitcher.game_log_batches SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', certification_status=${pre.certification}, certification_grade=${pre.grade}, certification_json=${checksJson}, duplicate_count=${pre.duplicateCount}, certified_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
    await sql`UPDATE stats_pitcher.game_log_cursor SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', next_run_after=now(), last_error=NULL, updated_at=now() WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
    return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", certification: "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", grade: pre.grade, checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
  }

  if (status === "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE" || status === "BASE_BACKFILL_PROMOTING") {
    const grade = batch.certification_grade || "BASE_PASS";
    const promoted = await promoteStageRowsChunk(sql, batchId, grade, promoteLimit);
    const liveRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs WHERE batch_id=${batchId} AND certification_status='base_backfill_certified_promoted'`;
    const rowsPromoted = asInt(liveRows[0] && liveRows[0].c, 0);
    const expectedPromotedRows = asInt(batch && batch.rows_staged, 0) || await getStageCount();
    const promotionComplete = promoted.remaining_unpromoted === 0 && rowsPromoted >= expectedPromotedRows;
    const nextStatus = promotionComplete ? "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" : "BASE_BACKFILL_PROMOTING";
    await sql`UPDATE stats_pitcher.game_log_batches SET status=${nextStatus}, rows_promoted=${rowsPromoted}, updated_at=now() WHERE batch_id=${batchId}`;
    await sql`UPDATE stats_pitcher.game_log_cursor SET status=${nextStatus}, next_run_after=now(), updated_at=now() WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
    return { pass: true, done: false, continuation_required: true, status: nextStatus, certification: "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_PROMOTE_MICROPHASE", grade, checks: { promoted, rows_promoted: rowsPromoted, expected_promoted_rows: expectedPromotedRows, promotion_complete: promotionComplete }, rows_promoted: rowsPromoted, stage_rows_after_clean: await getStageCount() };
  }

  if (status === "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" || status === "BASE_BACKFILL_CLEANING") {
    const liveRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs WHERE batch_id=${batchId} AND certification_status='base_backfill_certified_promoted'`;
    const rowsPromoted = asInt(liveRows[0] && liveRows[0].c, 0);
    const expectedRowsBeforeClean = asInt(batch && batch.rows_staged, 0) || await getStageCount();
    if (rowsPromoted < expectedRowsBeforeClean) {
      await sql`UPDATE stats_pitcher.game_log_batches SET status='BASE_BACKFILL_PROMOTING', rows_promoted=${rowsPromoted}, updated_at=now() WHERE batch_id=${batchId}`;
      return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_PROMOTING", certification: "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_PROMOTION_COUNT_GUARD", grade: batch.certification_grade || "BASE_PASS", checks: { rows_promoted: rowsPromoted, expected_promoted_rows: expectedRowsBeforeClean }, rows_promoted: rowsPromoted, stage_rows_after_clean: await getStageCount() };
    }
    const cleaned = await cleanStageRowsChunk(sql, batchId, cleanLimit);
    if (cleaned.cleanup_done !== true) {
      await sql`UPDATE stats_pitcher.game_log_batches SET status='BASE_BACKFILL_CLEANING', rows_promoted=${rowsPromoted}, updated_at=now() WHERE batch_id=${batchId}`;
      return { pass: true, done: false, continuation_required: true, status: "BASE_BACKFILL_CLEANING", certification: "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CLEAN_MICROPHASE", grade: batch.certification_grade || "BASE_PASS", checks: { cleaned }, rows_promoted: rowsPromoted, stage_rows_after_clean: cleaned.stage_rows_after_clean };
    }
    const outcomeSummary = await certifyPlayerOutcomeUniverse(sql, batchId, runId, cutoffDate);
    const sourceTruth = await freezeSourceCountersFromOutcomes(sql, batchId);
    const expectedPromotedRows = asInt(batch && batch.rows_staged, 0) || asInt(outcomeSummary && outcomeSummary.rows_before_cutoff, 0);
    const cert = batch.certification_status || "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED";
    const grade = batch.certification_grade || "BASE_PASS";
    const finalPass = outcomeSummary.pass === true && rowsPromoted > 0 && rowsPromoted >= expectedPromotedRows;
    const finalChecks = { version: VERSION, rows_promoted: rowsPromoted, expected_promoted_rows: expectedPromotedRows, source_counters_from_outcomes: sourceTruth, player_outcome_universe: outcomeSummary, pass: finalPass };
    await sql`UPDATE stats_pitcher.game_log_batches SET status=CASE WHEN ${finalPass} THEN 'COMPLETED_PROMOTED_CLEANED' ELSE 'CERTIFICATION_FAILED' END, rows_promoted=${rowsPromoted}, certification_status=CASE WHEN ${finalPass} THEN ${cert} ELSE 'BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED' END, certification_grade=CASE WHEN ${finalPass} THEN ${grade} ELSE 'BASE_FAIL' END, certification_json=${JSON.stringify(finalChecks)}, finished_at=now(), promoted_at=CASE WHEN ${finalPass} THEN COALESCE(promoted_at,now()) ELSE promoted_at END, cleaned_at=CASE WHEN ${finalPass} THEN now() ELSE cleaned_at END, updated_at=now() WHERE batch_id=${batchId}`;
    await sql`UPDATE stats_pitcher.game_log_cursor SET status=${finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED"}, players_processed=players_total, next_run_after=NULL, updated_at=now() WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
    return { pass: finalPass, done: true, continuation_required: false, status: finalPass ? "COMPLETED_PROMOTED_CLEANED" : "CERTIFICATION_FAILED", certification: finalPass ? cert : "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED", grade: finalPass ? grade : "BASE_FAIL", checks: finalChecks, rows_promoted: rowsPromoted, stage_rows_after_clean: 0 };
  }
  return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: "BASE_PITCHER_GAME_LOGS_UNKNOWN_FINALIZATION_STATUS", grade: "BASE_FAIL", checks: { status, batch_id: batchId }, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
}

async function getLockedBaseIntegrity(sql) {
  const batchRows = await sql`SELECT batch_id,status,rows_promoted,certification_status,certification_grade,cleaned_at FROM stats_pitcher.game_log_batches WHERE batch_id=${LOCKED_BASE_BATCH_ID} LIMIT 1`;
  const batch = batchRows[0] || null;
  const liveRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs WHERE batch_id=${LOCKED_BASE_BATCH_ID}`;
  const outcomeRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_log_player_outcomes WHERE batch_id=${LOCKED_BASE_BATCH_ID}`;
  const dupRows = await sql`SELECT COUNT(*)::int AS c FROM (SELECT player_id, game_pk, group_type, COUNT(*) AS n FROM stats_pitcher.game_logs WHERE batch_id=${LOCKED_BASE_BATCH_ID} GROUP BY player_id, game_pk, group_type HAVING COUNT(*) > 1) sub`;
  const afterRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs WHERE batch_id=${LOCKED_BASE_BATCH_ID} AND game_date::date > ${DEFAULT_BASE_BACKFILL_CUTOFF_DATE}::date`;
  const live = liveRows[0] || {}, outcomes = outcomeRows[0] || {}, dup = dupRows[0] || {}, after = afterRows[0] || {};
  const pass = !!batch && String(batch.status) === "COMPLETED_PROMOTED_CLEANED" && asInt(dup.c, 0) === 0 && asInt(after.c, 0) === 0 && asInt(live.c, 0) > 0 && asInt(live.c, 0) === asInt(batch.rows_promoted, 0) && asInt(outcomes.c, 0) > 0;
  return { pass, required_base_batch_id: LOCKED_BASE_BATCH_ID, status: batch ? batch.status : null, rows_promoted: batch ? asInt(batch.rows_promoted, 0) : 0, live_base_rows: asInt(live.c, 0), base_outcome_rows: asInt(outcomes.c, 0), duplicate_base_live_keys: asInt(dup.c, 0), base_rows_after_cutoff: asInt(after.c, 0), cutoff_date: DEFAULT_BASE_BACKFILL_CUTOFF_DATE, cleaned_at: batch ? batch.cleaned_at : null };
}

async function getOrCreateBaseBackfillState(env, sql, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const existingRows = await sql`
    SELECT * FROM stats_pitcher.game_log_cursor
    WHERE cursor_key=${ACTIVE_CURSOR_KEY} AND mode='base_backfill'
      AND status IN ('BASE_BACKFILL_RUNNING','PARTIAL_CONTINUE_BASE_PITCHER_GAME_LOGS','BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION','BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE','BASE_BACKFILL_PROMOTING','BASE_BACKFILL_PROMOTED_READY_TO_CLEAN','BASE_BACKFILL_CLEANING','CERTIFICATION_FAILED','COMPLETED_PROMOTED_CLEANED')
  `;
  const existing = existingRows[0] || null;
  if (existing) {
    const batchRows = await sql`SELECT * FROM stats_pitcher.game_log_batches WHERE batch_id=${existing.batch_id}`;
    const batch = batchRows[0] || null;
    let players = [];
    try { players = JSON.parse(existing.cursor_json || "{}").players || []; } catch (_) { players = []; }
    if (batch && players.length) return { is_new: false, cursor: existing, batch, players, input_json: inputJson };
  }
  const runId = asText(input.run_id, rid("run_base_pitcher_backfill"));
  const batchId = asText(inputJson.batch_id, rid("pitcher_base_backfill_batch"));
  const cutoffDate = asText(inputJson.base_backfill_cutoff_date, DEFAULT_BASE_BACKFILL_CUTOFF_DATE);
  const sourceSeason = asInt(inputJson.source_season || env.ACTIVE_SEASON, DEFAULT_SOURCE_SEASON);
  const chunkSize = cap(inputJson.chunk_size_players || inputJson.max_requests_per_tick || env.MAX_API_CALLS_PER_TICK || DEFAULT_CHUNK_SIZE_PLAYERS, 1, 100);
  const maxRequests = cap(inputJson.max_requests_per_tick || env.MAX_API_CALLS_PER_TICK || DEFAULT_MAX_REQUESTS_PER_TICK, 1, 100);
  const maxRows = cap(inputJson.max_rows_per_tick || env.MAX_ROWS_PER_TICK || DEFAULT_MAX_ROWS_PER_TICK, 100, DEFAULT_MAX_ROWS_PER_TICK);
  const players = await chooseAllPitcherPlayers(sql, inputJson);
  await sql`DELETE FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId}`;
  const cursorJson = JSON.stringify({ version: VERSION, mode: "base_backfill", players, source_season: sourceSeason, base_backfill_cutoff_date: cutoffDate, delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE });
  await sql`
    INSERT INTO stats_pitcher.game_log_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_endpoint, source_season, base_backfill_cutoff_date, delta_start_date, cursor_offset, cursor_state_json, chunk_size_players, max_requests_per_tick, max_rows_per_tick, certification_status, source_confidence, notes, updated_at)
    VALUES (${batchId}, ${runId}, ${WORKER_NAME}, ${VERSION}, 'base_backfill', 'BASE_BACKFILL_RUNNING', ${DATA_FEED_KEY}, ${SOURCE_KEY}, ${LOCKED_SOURCE_ENDPOINT_PATTERN}, ${sourceSeason}, ${cutoffDate}, ${DEFAULT_DELTA_RESERVED_START_DATE}, 0, ${cursorJson}, ${chunkSize}, ${maxRequests}, ${maxRows}, 'not_certified', 'SOURCE_LOCKED_STATSAPI_GAMELOG_PITCHING', ${"Postgres-native build, base fills only through " + cutoffDate}, now())
    ON CONFLICT (batch_id) DO UPDATE SET run_id=excluded.run_id, status=excluded.status, cursor_state_json=excluded.cursor_state_json, updated_at=now()
  `;
  await sql`
    INSERT INTO stats_pitcher.game_log_cursor (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,next_run_after,cursor_json,updated_at)
    VALUES (${ACTIVE_CURSOR_KEY}, ${batchId}, ${runId}, 'base_backfill', 'BASE_BACKFILL_RUNNING', ${sourceSeason}, ${cutoffDate}, ${DEFAULT_DELTA_RESERVED_START_DATE}, 0, ${players.length}, 0, 0, now(), ${cursorJson}, now())
    ON CONFLICT (cursor_key) DO UPDATE SET batch_id=excluded.batch_id, run_id=excluded.run_id, mode=excluded.mode, status=excluded.status, source_season=excluded.source_season, base_backfill_cutoff_date=excluded.base_backfill_cutoff_date, delta_start_date=excluded.delta_start_date, current_player_offset=excluded.current_player_offset, players_total=excluded.players_total, players_processed=excluded.players_processed, requests_done=excluded.requests_done, next_run_after=excluded.next_run_after, cursor_json=excluded.cursor_json, updated_at=now()
  `;
  const cursorRows = await sql`SELECT * FROM stats_pitcher.game_log_cursor WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
  const batchRows = await sql`SELECT * FROM stats_pitcher.game_log_batches WHERE batch_id=${batchId}`;
  return { is_new: true, cursor: cursorRows[0] || null, batch: batchRows[0] || null, players, input_json: inputJson };
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
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-pitcher-game-logs/1.0.0") } }, fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  if (!fetched.ok || !fetched.resp || !fetched.resp.ok) return { ok: false, endpoint, error: fetched.error || (fetched.resp ? `HTTP_${fetched.resp.status}` : "schedule_fetch_failed") };
  let body;
  try { body = JSON.parse(fetched.text || "{}"); } catch (err) { return { ok: false, endpoint, error: `schedule_json_parse_failed:${String(err && err.message ? err.message : err)}` }; }
  const dates = Array.isArray(body.dates) ? body.dates : [];
  let latest = null;
  for (const d of dates) {
    const dateStr = asText(d && d.date, null);
    const games = Array.isArray(d && d.games) ? d.games : [];
    if (!dateStr || !games.length) continue;
    if (games.every(isFinalMlbGame) && (!latest || dateStr > latest)) latest = dateStr;
  }
  if (!latest) return { ok: false, endpoint, error: "NO_COMPLETE_FINAL_MLB_GAME_DATE_IN_DELTA_RANGE", today_utc: today };
  return { ok: true, endpoint, latest_complete_game_date: latest, today_utc: today };
}

async function getDeltaWindow(env, sql, inputJson, fetchTimeoutMs) {
  // GROUNDED FROM THE START (same real research as hitter's fix - not rediscovered here): real
  // MLB corrections land days after a game; the rolling repair window genuinely extends
  // DEFAULT_DELTA_LOOKBACK_DAYS back once prior delta history exists - no artificial floor at
  // the reserved start date. First-ever delta run stays narrow (only the immediate post-base gap).
  const deltaFloor = asText(inputJson.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE);
  const schedule = await determineLatestCompleteGameDate(env, deltaFloor, fetchTimeoutMs);
  if (!schedule.ok) return { ok: false, ...schedule, delta_start_date: deltaFloor };
  const latest = schedule.latest_complete_game_date;
  const existingDeltaLiveRows = await sql`SELECT MAX(game_date) AS max_delta_game_date FROM stats_pitcher.game_logs WHERE ingestion_mode='delta_update' AND game_date::date >= ${deltaFloor}::date`;
  const maxDeltaGameDate = asText(existingDeltaLiveRows[0] && existingDeltaLiveRows[0].max_delta_game_date, null);
  const hasPriorDeltaLive = !!(maxDeltaGameDate && maxDeltaGameDate >= deltaFloor);
  const lookbackStart = addDays(latest, -(DEFAULT_DELTA_LOOKBACK_DAYS - 1));
  let start = hasPriorDeltaLive ? lookbackStart : deltaFloor;
  const failedRows = await sql`
    SELECT MIN(delta_start_date) AS min_start FROM stats_pitcher.game_log_batches
    WHERE mode='delta_update' AND status IN ('CERTIFICATION_FAILED','PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS','DELTA_RUNNING','DELTA_STAGED_READY_FOR_CERTIFICATION','DELTA_CERTIFIED_READY_TO_PROMOTE','DELTA_PROMOTING','DELTA_PROMOTED_READY_TO_CLEAN','DELTA_CLEANING') AND delta_start_date IS NOT NULL
  `;
  const failedStart = asText(failedRows[0] && failedRows[0].min_start, null);
  if (failedStart && failedStart >= deltaFloor && failedStart < start) start = failedStart;
  return { ok: true, delta_start_date: start, delta_end_date: latest, delta_floor_date: deltaFloor, latest_complete_game_date: latest, repair_lookback_days: DEFAULT_DELTA_LOOKBACK_DAYS, initial_full_delta_catchup: !hasPriorDeltaLive, prior_delta_live_max_game_date: maxDeltaGameDate, schedule_endpoint: schedule.endpoint };
}

function parsePitcherSplitForWindow(split, playerId, playerName, season, batchId, runId, mode, endpoint, windowStart, windowEnd) {
  const gameDate = splitGameDate(split);
  if (!gameDate || gameDate < windowStart || gameDate > windowEnd) return null;
  const row = parsePitcherSplit(split, playerId, playerName, season, batchId, runId, mode, endpoint, null);
  if (!row) return null;
  row.stage_id = `${batchId}_${playerId}_${row.game_pk}_pitching_delta`;
  row.ingestion_mode = "delta_update";
  row.certification_status = "delta_update_staged_unverified";
  return row;
}

async function processPlayerDelta(env, sql, p, sourceSeason, batchId, runId, windowStart, windowEnd, maxRowsRemaining, fetchTimeoutMs) {
  const endpoint = endpointFor(env, p.player_id, sourceSeason);
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-pitcher-game-logs/1.0.0") } }, fetchTimeoutMs);
  if (!fetched.ok) return { player_id: p.player_id, player_name: p.player_name, status: "source_error", error_type: fetched.timed_out ? "fetch_timeout" : "fetch_exception", error: fetched.error, rows_staged: 0, raw_payload_split_count: 0, rows_before_cutoff: 0, rows_filtered_after_cutoff: 0, source_endpoint: endpoint, retry_same_player: true };
  const resp = fetched.resp, text = fetched.text || "";
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
    const row = parsePitcherSplitForWindow(split, p.player_id, p.player_name, sourceSeason, batchId, runId, "delta_update", endpoint, windowStart, windowEnd);
    if (!row) { invalidInWindow++; continue; }
    await insertStageRow(sql, row);
    stagedDates.push(row.game_date);
    inserted++;
  }
  let status = "success";
  if (inserted <= 0 && inWindow === 0 && outsideWindow > 0) status = "filtered_outside_window";
  else if (inserted <= 0 && inWindow > 0) status = "repair_required";
  return { player_id: p.player_id, player_name: p.player_name, status, http_status: resp.status, raw_payload_split_count: splits.length, rows_before_cutoff: inWindow, rows_filtered_after_cutoff: outsideWindow, rows_staged: inserted, invalid_before_cutoff_rows: invalidInWindow, source_endpoint: endpoint, first_raw_game_date: rawDates[0] || null, last_raw_game_date: rawDates[rawDates.length - 1] || null, first_promoted_game_date: stagedDates[0] || null, last_promoted_game_date: stagedDates[stagedDates.length - 1] || null };
}

function classifyDeltaOutcome(result) {
  if (!result || result.status === "source_error") return "SOURCE_ERROR";
  if (asInt(result.raw_payload_split_count, 0) === 0) return "TRUE_NO_DATA";
  if (asInt(result.rows_staged, 0) > 0) return "PROMOTED_ROWS";
  if (result.status === "filtered_outside_window") return "FILTERED_OUTSIDE_WINDOW";
  return "REPAIR_REQUIRED";
}
function deltaOutcomeReason(result, category, windowStart, windowEnd) {
  if (category === "PROMOTED_ROWS") return `Source returned regular-season pitching rows inside certified delta window ${windowStart} through ${windowEnd}, and rows were staged for promotion.`;
  if (category === "TRUE_NO_DATA") return `MLB StatsAPI returned zero 2026 pitching game-log splits for this player during delta certification.`;
  if (category === "FILTERED_OUTSIDE_WINDOW") return `MLB StatsAPI returned pitching game-log splits, but none were inside certified delta window ${windowStart} through ${windowEnd}.`;
  if (category === "SOURCE_ERROR") return result && result.error_type ? `Source request failed: ${result.error_type}` : "Source request failed.";
  return `Source indicated in-window data but no rows were staged; repair required before delta can certify.`;
}

async function upsertDeltaPlayerOutcome(sql, batchId, runId, p, cursorOffset, result, endpoint, windowStart, windowEnd) {
  const category = classifyDeltaOutcome(result);
  await sql`
    INSERT INTO stats_pitcher.game_log_player_outcomes (
      batch_id,run_id,player_id,player_name,primary_position,cursor_offset,source_endpoint,source_http_status,source_ok,
      raw_payload_split_count,rows_before_cutoff,rows_filtered_after_cutoff,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,
      first_raw_game_date,last_raw_game_date,first_promoted_game_date,last_promoted_game_date,certification_status,certification_grade,updated_at
    ) VALUES (
      ${batchId}, ${runId}, ${asInt(p && p.player_id, 0)}, ${asText((p && p.player_name) || (result && result.player_name), null)}, ${asText(p && p.primary_position, null)},
      ${asInt(cursorOffset, 0)}, ${endpoint || (result && result.source_endpoint) || null},
      ${result && result.http_status !== undefined ? asInt(result.http_status, null) : null}, ${category === "SOURCE_ERROR" ? 0 : 1},
      ${asInt(result && result.raw_payload_split_count, 0)}, ${asInt(result && result.rows_before_cutoff, 0)}, ${asInt(result && result.rows_filtered_after_cutoff, 0)}, ${asInt(result && result.rows_staged, 0)}, 0,
      ${category}, ${deltaOutcomeReason(result, category, windowStart, windowEnd)}, ${result && result.error ? String(result.error).slice(0, 900) : null},
      ${result && result.first_raw_game_date ? result.first_raw_game_date : null}, ${result && result.last_raw_game_date ? result.last_raw_game_date : null},
      ${result && result.first_promoted_game_date ? result.first_promoted_game_date : null}, ${result && result.last_promoted_game_date ? result.last_promoted_game_date : null},
      'player_outcome_unverified', NULL, now()
    )
    ON CONFLICT (batch_id, player_id) DO UPDATE SET
      run_id=excluded.run_id, player_name=excluded.player_name, primary_position=excluded.primary_position, cursor_offset=excluded.cursor_offset,
      source_endpoint=excluded.source_endpoint, source_http_status=excluded.source_http_status, source_ok=excluded.source_ok,
      raw_payload_split_count=excluded.raw_payload_split_count, rows_before_cutoff=excluded.rows_before_cutoff, rows_filtered_after_cutoff=excluded.rows_filtered_after_cutoff,
      rows_staged=excluded.rows_staged, promoted_row_count=excluded.promoted_row_count, terminal_category=excluded.terminal_category,
      category_reason=excluded.category_reason, source_error=excluded.source_error, first_raw_game_date=excluded.first_raw_game_date,
      last_raw_game_date=excluded.last_raw_game_date, first_promoted_game_date=excluded.first_promoted_game_date, last_promoted_game_date=excluded.last_promoted_game_date,
      certification_status=excluded.certification_status, certification_grade=excluded.certification_grade, updated_at=now()
  `;
  return category;
}

async function getOrCreateDeltaState(env, sql, input, inputJson, windowInfo) {
  const existingRows = await sql`
    SELECT * FROM stats_pitcher.game_log_cursor
    WHERE cursor_key=${DELTA_CURSOR_KEY} AND mode='delta_update'
      AND status IN ('DELTA_RUNNING','PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS','DELTA_STAGED_READY_FOR_CERTIFICATION','DELTA_CERTIFIED_READY_TO_PROMOTE','DELTA_PROMOTING','DELTA_PROMOTED_READY_TO_CLEAN','DELTA_CLEANING')
  `;
  const existing = existingRows[0] || null;
  if (existing) {
    const batchRows = await sql`SELECT * FROM stats_pitcher.game_log_batches WHERE batch_id=${existing.batch_id}`;
    const batch = batchRows[0] || null;
    let players = [];
    try { players = JSON.parse(existing.cursor_json || "{}").players || []; } catch (_) { players = []; }
    if (batch && players.length) return { is_new: false, cursor: existing, batch, players, input_json: inputJson };
  }
  const runId = asText(input.run_id, rid("run_delta_pitcher_logs"));
  const batchId = rid("pitcher_delta_update_batch");
  const sourceSeason = asInt(inputJson.source_season || env.ACTIVE_SEASON || DEFAULT_SOURCE_SEASON, DEFAULT_SOURCE_SEASON);
  const players = await chooseAllPitcherPlayers(sql, inputJson);
  const cursorJson = { version: VERSION, mode: "delta_update", source_season: sourceSeason, delta_start_date: windowInfo.delta_start_date, delta_end_date: windowInfo.delta_end_date, players };
  await sql`
    INSERT INTO stats_pitcher.game_log_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_endpoint,source_season,source_game_type,base_backfill_cutoff_date,delta_start_date,cursor_offset,cursor_state_json,chunk_size_players,max_requests_per_tick,max_rows_per_tick,certification_status,notes,updated_at)
    VALUES (${batchId}, ${runId}, ${WORKER_NAME}, ${VERSION}, 'delta_update', 'DELTA_RUNNING', ${DATA_FEED_KEY}, ${SOURCE_KEY}, ${LOCKED_SOURCE_ENDPOINT_PATTERN}, ${sourceSeason}, 'R', ${DEFAULT_BASE_BACKFILL_CUTOFF_DATE}, ${windowInfo.delta_start_date}, 0, ${JSON.stringify(cursorJson)}, ${DEFAULT_CHUNK_SIZE_PLAYERS}, ${DEFAULT_MAX_REQUESTS_PER_TICK}, ${DEFAULT_MAX_ROWS_PER_TICK}, 'not_certified', ${`delta_update window ${windowInfo.delta_start_date} through ${windowInfo.delta_end_date}; base batch ${LOCKED_BASE_BATCH_ID} gate required`}, now())
    ON CONFLICT (batch_id) DO UPDATE SET run_id=excluded.run_id, status=excluded.status, cursor_state_json=excluded.cursor_state_json, updated_at=now()
  `;
  await sql`
    INSERT INTO stats_pitcher.game_log_cursor (cursor_key,batch_id,run_id,mode,status,source_season,base_backfill_cutoff_date,delta_start_date,current_player_offset,players_total,players_processed,requests_done,next_run_after,cursor_json,updated_at)
    VALUES (${DELTA_CURSOR_KEY}, ${batchId}, ${runId}, 'delta_update', 'DELTA_RUNNING', ${sourceSeason}, ${DEFAULT_BASE_BACKFILL_CUTOFF_DATE}, ${windowInfo.delta_start_date}, 0, ${players.length}, 0, 0, now(), ${JSON.stringify(cursorJson)}, now())
    ON CONFLICT (cursor_key) DO UPDATE SET batch_id=excluded.batch_id, run_id=excluded.run_id, mode=excluded.mode, status=excluded.status, source_season=excluded.source_season, base_backfill_cutoff_date=excluded.base_backfill_cutoff_date, delta_start_date=excluded.delta_start_date, current_player_offset=excluded.current_player_offset, players_total=excluded.players_total, players_processed=excluded.players_processed, requests_done=excluded.requests_done, next_run_after=excluded.next_run_after, cursor_json=excluded.cursor_json, updated_at=now()
  `;
  const cursorRows = await sql`SELECT * FROM stats_pitcher.game_log_cursor WHERE cursor_key=${DELTA_CURSOR_KEY}`;
  const batchRows = await sql`SELECT * FROM stats_pitcher.game_log_batches WHERE batch_id=${batchId}`;
  return { is_new: true, cursor: cursorRows[0] || null, batch: batchRows[0] || null, players, input_json: inputJson };
}

async function certifyDeltaOutcomeUniverse(sql, batchId, expectedPlayers) {
  const totalsRows = await sql`
    SELECT COUNT(*)::int AS outcome_total, COUNT(DISTINCT player_id)::int AS distinct_outcome_players,
      (COUNT(*) - COUNT(DISTINCT player_id))::int AS duplicate_outcome_rows,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END)::int AS source_error_players,
      SUM(CASE WHEN terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END)::int AS repair_required_players,
      SUM(CASE WHEN terminal_category='UNCLEAR' THEN 1 ELSE 0 END)::int AS unclear_players,
      SUM(CASE WHEN terminal_category NOT IN ('PROMOTED_ROWS','TRUE_NO_DATA','FILTERED_OUTSIDE_WINDOW','SOURCE_ERROR','REPAIR_REQUIRED','UNCLEAR') THEN 1 ELSE 0 END)::int AS invalid_category_players,
      SUM(COALESCE(rows_staged,0))::int AS rows_staged
    FROM stats_pitcher.game_log_player_outcomes WHERE batch_id=${batchId}
  `;
  const totals = totalsRows[0] || {};
  const pass = asInt(totals.outcome_total, 0) === expectedPlayers && asInt(totals.distinct_outcome_players, 0) === expectedPlayers && asInt(totals.duplicate_outcome_rows, 0) === 0 && asInt(totals.source_error_players, 0) === 0 && asInt(totals.repair_required_players, 0) === 0 && asInt(totals.unclear_players, 0) === 0 && asInt(totals.invalid_category_players, 0) === 0;
  await sql`UPDATE stats_pitcher.game_log_player_outcomes SET certification_status=${pass ? "delta_player_outcome_certified" : "delta_player_outcome_certification_failed"}, certification_grade=${pass ? "DELTA_PASS" : "DELTA_FAIL"}, updated_at=now() WHERE batch_id=${batchId}`;
  return { version: VERSION, pass, players_total: expectedPlayers, ...totals };
}

async function buildDeltaPrePromotionChecks(sql, batchId, runId, windowInfo, playersTotal, baseGate) {
  const summaryRows = await sql`
    SELECT COUNT(*)::int AS rows_staged, COUNT(DISTINCT player_id)::int AS distinct_players, COUNT(DISTINCT game_pk)::int AS distinct_games,
      MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date,
      SUM(CASE WHEN player_id IS NULL OR game_pk IS NULL OR season IS NULL OR game_date IS NULL OR source_key IS NULL OR source_endpoint IS NULL THEN 1 ELSE 0 END)::int AS missing_required,
      SUM(CASE WHEN group_type!='pitching' THEN 1 ELSE 0 END)::int AS non_pitching_rows,
      SUM(CASE WHEN game_date::date < ${windowInfo.delta_start_date}::date OR game_date::date > ${windowInfo.delta_end_date}::date THEN 1 ELSE 0 END)::int AS outside_window_rows,
      SUM(CASE WHEN COALESCE(strikeouts,0)<0 OR COALESCE(walks_allowed,0)<0 OR COALESCE(hits_allowed,0)<0 OR COALESCE(runs_allowed,0)<0 OR COALESCE(earned_runs,0)<0 OR COALESCE(home_runs_allowed,0)<0 OR (earned_runs>runs_allowed AND earned_runs IS NOT NULL AND runs_allowed IS NOT NULL) THEN 1 ELSE 0 END)::int AS bad_math_rows
    FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId}
  `;
  const summary = summaryRows[0] || {};
  const dupRows = await sql`SELECT COUNT(*)::int AS duplicate_count FROM (SELECT player_id, game_pk, group_type, COUNT(*) AS c FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId} GROUP BY player_id, game_pk, group_type HAVING COUNT(*) > 1) sub`;
  const dup = dupRows[0] || {};
  const outcomeSummary = await certifyDeltaOutcomeUniverse(sql, batchId, playersTotal);
  const rowsStaged = asInt(summary.rows_staged, 0);
  const pass = baseGate.pass === true && outcomeSummary.pass === true && asInt(dup.duplicate_count, 0) === 0 && asInt(summary.missing_required, 0) === 0 && asInt(summary.non_pitching_rows, 0) === 0 && asInt(summary.outside_window_rows, 0) === 0 && asInt(summary.bad_math_rows, 0) === 0;
  const checks = { version: VERSION, lifecycle: "delta_update_stage_player_outcomes_certify_promote_clean", base_integrity_gate: baseGate, delta_window: windowInfo, rows_staged: rowsStaged, duplicate_count: asInt(dup.duplicate_count, 0), missing_required: asInt(summary.missing_required, 0), non_pitching_rows: asInt(summary.non_pitching_rows, 0), outside_window_rows: asInt(summary.outside_window_rows, 0), bad_math_rows: asInt(summary.bad_math_rows, 0), player_outcome_universe: outcomeSummary, pass, no_scoring: true, no_ranking: true, no_board_mutation: true };
  await sql`UPDATE stats_pitcher.game_logs_stage SET certification_status=${pass ? "delta_update_certified" : "delta_update_certification_failed"}, certification_grade=${pass ? "DELTA_PASS" : "DELTA_FAIL"}, certified_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
  await sql`
    INSERT INTO stats_pitcher.game_log_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,created_at)
    VALUES (${`cert_${batchId}`}, ${batchId}, ${runId}, 'delta_update', ${pass ? "DELTA_PITCHER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE" : "DELTA_PITCHER_GAME_LOGS_CERTIFICATION_FAILED"}, ${pass ? "DELTA_PASS" : "DELTA_FAIL"}, ${JSON.stringify(checks)}, ${rowsStaged}, 0, ${asInt(dup.duplicate_count, 0)}, ${asInt(outcomeSummary.true_no_data_players, 0)}, ${asInt(outcomeSummary.source_error_players, 0)}, now())
    ON CONFLICT (certification_id) DO UPDATE SET certification_status=excluded.certification_status, certification_grade=excluded.certification_grade, checks_json=excluded.checks_json, rows_staged=excluded.rows_staged
  `;
  await sql`UPDATE stats_pitcher.game_log_batches SET rows_staged=${rowsStaged}, duplicate_count=${asInt(dup.duplicate_count, 0)}, certification_status=${pass ? "DELTA_PITCHER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE" : "DELTA_PITCHER_GAME_LOGS_CERTIFICATION_FAILED"}, certification_grade=${pass ? "DELTA_PASS" : "DELTA_FAIL"}, certification_json=${JSON.stringify(checks)}, certified_at=CASE WHEN ${pass} THEN now() ELSE certified_at END, status=CASE WHEN ${pass} THEN 'DELTA_CERTIFIED_READY_TO_PROMOTE' ELSE 'CERTIFICATION_FAILED' END, updated_at=now() WHERE batch_id=${batchId}`;
  return { pass, grade: pass ? "DELTA_PASS" : "DELTA_FAIL", checks, rows_staged: rowsStaged };
}

async function deriveDeltaSourceCounters(sql, batchId) {
  const rows = await sql`
    SELECT COUNT(*)::int AS outcome_total,
      SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END)::int AS promoted_players,
      SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END)::int AS true_no_data_players,
      SUM(CASE WHEN terminal_category='FILTERED_OUTSIDE_WINDOW' THEN 1 ELSE 0 END)::int AS filtered_outside_window_players,
      SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END)::int AS source_error_players
    FROM stats_pitcher.game_log_player_outcomes WHERE batch_id=${batchId}
  `;
  const row = rows[0] || {};
  return { source_request_count: asInt(row.outcome_total, 0), source_success_count: asInt(row.promoted_players, 0) + asInt(row.filtered_outside_window_players, 0), source_no_data_count: asInt(row.true_no_data_players, 0), source_error_count: asInt(row.source_error_players, 0), source_success_definition: "PROMOTED_ROWS + FILTERED_OUTSIDE_WINDOW; both are successful source responses. TRUE_NO_DATA is a terminal empty source outcome." };
}

async function finalizeDeltaIfReady(sql, batchId, runId, windowInfo, playersTotal, baseGate, options = {}) {
  const promoteLimit = cap(options.promote_rows_per_tick || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 800);
  const cleanLimit = cap(options.clean_rows_per_tick || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 8000);
  const batchRows = await sql`SELECT * FROM stats_pitcher.game_log_batches WHERE batch_id=${batchId}`;
  const batch = batchRows[0] || null;
  let status = batch && batch.status ? String(batch.status) : "";
  let stageCountCached = null;
  async function getStageCount() { if (stageCountCached !== null) return stageCountCached; const rows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId}`; stageCountCached = asInt(rows[0] && rows[0].c, 0); return stageCountCached; }

  if (status === "COMPLETED_PROMOTED_CLEANED") {
    const sourceTruth = await deriveDeltaSourceCounters(sql, batchId);
    return { pass: true, done: true, continuation_required: false, status, certification: batch.certification_status || "DELTA_PITCHER_GAME_LOGS_CERTIFIED", grade: batch.certification_grade || "DELTA_PASS", checks: { version: VERSION, already_completed: true, source_counters_from_outcomes: sourceTruth }, rows_promoted: asInt(batch.rows_promoted, 0), stage_rows_after_clean: await getStageCount() };
  }

  if (status === "DELTA_RUNNING" || status === "PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS") {
    const pre = await buildDeltaPrePromotionChecks(sql, batchId, runId, windowInfo, playersTotal, baseGate);
    if (!pre.pass) {
      return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: "DELTA_PITCHER_GAME_LOGS_CERTIFICATION_FAILED", grade: "DELTA_FAIL", checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
    }
    return { pass: true, done: false, continuation_required: true, status: "DELTA_CERTIFIED_READY_TO_PROMOTE", certification: "DELTA_PITCHER_GAME_LOGS_CERTIFIED_READY_TO_PROMOTE", grade: "DELTA_PASS", checks: pre.checks, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
  }

  if (status === "DELTA_CERTIFIED_READY_TO_PROMOTE" || status === "DELTA_PROMOTING") {
    const grade = batch.certification_grade || "DELTA_PASS";
    // Sticky-ownership aware: rely on remaining_unpromoted / stage row_status (the exact fix
    // already grounded and proven for hitter), never on a batch-scoped live-row COUNT that
    // sticky ownership can legitimately leave lower than rows_staged.
    const promoted = await promoteStageRowsChunk(sql, batchId, grade, promoteLimit);
    const nextStatus = promoted.remaining_unpromoted === 0 ? "DELTA_PROMOTED_READY_TO_CLEAN" : "DELTA_PROMOTING";
    await sql`UPDATE stats_pitcher.game_log_batches SET status=${nextStatus}, rows_promoted=rows_promoted + ${promoted.promoted_this_tick}, updated_at=now() WHERE batch_id=${batchId}`;
    await sql`UPDATE stats_pitcher.game_log_cursor SET status=${nextStatus}, next_run_after=now(), updated_at=now() WHERE cursor_key=${DELTA_CURSOR_KEY}`;
    return { pass: true, done: false, continuation_required: true, status: nextStatus, certification: "DELTA_PITCHER_GAME_LOGS_PROMOTE_MICROPHASE", grade, checks: { promoted }, rows_promoted: promoted.promoted_this_tick, stage_rows_after_clean: await getStageCount() };
  }

  if (status === "DELTA_PROMOTED_READY_TO_CLEAN" || status === "DELTA_CLEANING") {
    const remainingRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.game_logs_stage WHERE batch_id=${batchId} AND row_status != 'promoted'`;
    if (asInt(remainingRows[0] && remainingRows[0].c, 0) > 0) {
      await sql`UPDATE stats_pitcher.game_log_batches SET status='DELTA_PROMOTING', updated_at=now() WHERE batch_id=${batchId}`;
      return { pass: true, done: false, continuation_required: true, status: "DELTA_PROMOTING", certification: "DELTA_PITCHER_GAME_LOGS_PROMOTION_COUNT_GUARD", grade: batch.certification_grade || "DELTA_PASS", checks: { remaining_unpromoted: asInt(remainingRows[0] && remainingRows[0].c, 0) }, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
    }
    const cleaned = await cleanStageRowsChunk(sql, batchId, cleanLimit);
    if (cleaned.cleanup_done !== true) {
      await sql`UPDATE stats_pitcher.game_log_batches SET status='DELTA_CLEANING', updated_at=now() WHERE batch_id=${batchId}`;
      return { pass: true, done: false, continuation_required: true, status: "DELTA_CLEANING", certification: "DELTA_PITCHER_GAME_LOGS_CLEAN_MICROPHASE", grade: batch.certification_grade || "DELTA_PASS", checks: { cleaned }, rows_promoted: 0, stage_rows_after_clean: cleaned.stage_rows_after_clean };
    }
    const sourceTruth = await deriveDeltaSourceCounters(sql, batchId);
    const cert = batch.certification_status || "DELTA_PITCHER_GAME_LOGS_CERTIFIED";
    const grade = batch.certification_grade || "DELTA_PASS";
    const finalChecks = { version: VERSION, source_counters_from_outcomes: sourceTruth, pass: true };
    await sql`UPDATE stats_pitcher.game_log_batches SET status='COMPLETED_PROMOTED_CLEANED', certification_status=${cert}, certification_grade=${grade}, certification_json=${JSON.stringify(finalChecks)}, finished_at=now(), cleaned_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
    await sql`UPDATE stats_pitcher.game_log_cursor SET status='COMPLETED_PROMOTED_CLEANED', players_processed=players_total, next_run_after=NULL, updated_at=now() WHERE cursor_key=${DELTA_CURSOR_KEY}`;
    return { pass: true, done: true, continuation_required: false, status: "COMPLETED_PROMOTED_CLEANED", certification: cert, grade, checks: finalChecks, rows_promoted: asInt(batch.rows_promoted, 0), stage_rows_after_clean: 0 };
  }

  return { pass: false, done: true, continuation_required: false, status: "CERTIFICATION_FAILED", certification: "DELTA_PITCHER_GAME_LOGS_UNKNOWN_FINALIZATION_STATUS", grade: "DELTA_FAIL", checks: { status, batch_id: batchId }, rows_promoted: 0, stage_rows_after_clean: await getStageCount() };
}

async function runBaseBackfillTick(env, sql, input, startedAtMs) {
  const state = await getOrCreateBaseBackfillState(env, sql, input);
  const batchId = state.batch.batch_id;
  const runId = state.batch.run_id;
  const cutoffDate = state.batch.base_backfill_cutoff_date;
  const owner = asText(input.owner, rid("owner"));
  const staleSeconds = asInt(env.LOCK_STALE_SECONDS, DEFAULT_LOCK_STALE_SECONDS);
  const status = String(state.batch.status || "");

  const finalizationOnlyStatuses = new Set(["BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION", "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", "BASE_BACKFILL_PROMOTING", "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN", "BASE_BACKFILL_CLEANING", "CERTIFICATION_FAILED", "COMPLETED_PROMOTED_CLEANED"]);
  if (finalizationOnlyStatuses.has(status)) {
    const lock = await acquireBatchLock(sql, batchId, owner, staleSeconds);
    if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, run_id: runId, lock };
    try {
      const result = await certifyAndPromoteIfClean(sql, batchId, runId, cutoffDate, { promote_rows_per_tick: env.MAX_ROWS_PER_TICK ? cap(env.MAX_ROWS_PER_TICK, 1, 800) : DEFAULT_PROMOTE_ROWS_PER_TICK, clean_rows_per_tick: DEFAULT_CLEAN_ROWS_PER_TICK });
      return { ok: true, data_ok: result.pass, mode: "base_backfill", phase: "finalization", batch_id: batchId, run_id: runId, ...result };
    } finally { await releaseBatchLock(sql, batchId, owner); }
  }

  const lock = await acquireBatchLock(sql, batchId, owner, staleSeconds);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, run_id: runId, lock };
  try {
    const players = state.players;
    const cursorOffset = asInt(state.cursor.current_player_offset, 0);
    const chunkSize = asInt(state.batch.chunk_size_players, DEFAULT_CHUNK_SIZE_PLAYERS);
    const maxRows = asInt(state.batch.max_rows_per_tick, DEFAULT_MAX_ROWS_PER_TICK);
    const fetchTimeoutMs = asInt(env.FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
    const maxTickRuntimeMs = asInt(env.MAX_TICK_RUNTIME_MS, DEFAULT_MAX_TICK_RUNTIME_MS);
    const grade = "BASE_PASS";

    let offset = cursorOffset, rowsThisTick = 0, processedThisTick = 0;
    const perPlayerResults = [];
    while (offset < players.length && processedThisTick < chunkSize && rowsThisTick < maxRows && (Date.now() - startedAtMs) < maxTickRuntimeMs) {
      const p = players[offset];
      const adopted = await adoptExistingCoverageIfPresent(sql, batchId, runId, grade, p, cutoffDate);
      if (adopted) {
        perPlayerResults.push(adopted);
      } else {
        const result = await processPlayer(env, sql, p, state.batch.source_season, batchId, runId, cutoffDate, maxRows - rowsThisTick, fetchTimeoutMs);
        await upsertPlayerOutcome(sql, batchId, runId, p, offset, result, result.source_endpoint);
        rowsThisTick += asInt(result.rows_staged, 0);
        perPlayerResults.push(result);
      }
      offset += 1;
      processedThisTick += 1;
    }

    const cursorJson = JSON.stringify({ version: VERSION, mode: "base_backfill", players, source_season: state.batch.source_season, base_backfill_cutoff_date: cutoffDate, delta_reserved_start_date: DEFAULT_DELTA_RESERVED_START_DATE });
    const doneScanning = offset >= players.length;
    const nextStatus = doneScanning ? "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION" : "BASE_BACKFILL_RUNNING";
    await sql`UPDATE stats_pitcher.game_log_cursor SET status=${nextStatus}, current_player_offset=${offset}, players_processed=${offset}, requests_done=requests_done + ${processedThisTick}, cursor_json=${cursorJson}, next_run_after=now(), updated_at=now() WHERE cursor_key=${ACTIVE_CURSOR_KEY}`;
    await sql`UPDATE stats_pitcher.game_log_batches SET status=${nextStatus}, cursor_offset=${offset}, updated_at=now() WHERE batch_id=${batchId}`;

    let finalization = null;
    if (doneScanning) {
      finalization = await certifyAndPromoteIfClean(sql, batchId, runId, cutoffDate, { promote_rows_per_tick: DEFAULT_PROMOTE_ROWS_PER_TICK, clean_rows_per_tick: DEFAULT_CLEAN_ROWS_PER_TICK });
    }
    return { ok: true, data_ok: true, mode: "base_backfill", phase: doneScanning ? "mining_complete_finalization_started" : "mining", batch_id: batchId, run_id: runId, status: finalization ? finalization.status : nextStatus, players_total: players.length, players_processed: offset, processed_this_tick: processedThisTick, rows_staged_this_tick: rowsThisTick, per_player_results: perPlayerResults, finalization };
  } finally { await releaseBatchLock(sql, batchId, owner); }
}

async function runDeltaUpdateTick(env, sql, input, startedAtMs) {
  const baseGate = await getLockedBaseIntegrity(sql);
  if (!baseGate.pass) return { ok: true, data_ok: false, mode: "delta_update", status: "BASE_INTEGRITY_GATE_CLOSED", base_integrity_gate: baseGate };

  const fetchTimeoutMs = asInt(env.FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const windowInfo = await getDeltaWindow(env, sql, inputJson, fetchTimeoutMs);
  if (!windowInfo.ok) return { ok: true, data_ok: false, mode: "delta_update", status: "DELTA_WINDOW_UNAVAILABLE", window_error: windowInfo };

  const state = await getOrCreateDeltaState(env, sql, input, inputJson, windowInfo);
  const batchId = state.batch.batch_id;
  const runId = state.batch.run_id;
  const owner = asText(input.owner, rid("owner"));
  const staleSeconds = asInt(env.LOCK_STALE_SECONDS, DEFAULT_LOCK_STALE_SECONDS);
  const status = String(state.batch.status || "");

  const finalizationOnlyStatuses = new Set(["DELTA_STAGED_READY_FOR_CERTIFICATION", "DELTA_CERTIFIED_READY_TO_PROMOTE", "DELTA_PROMOTING", "DELTA_PROMOTED_READY_TO_CLEAN", "DELTA_CLEANING", "CERTIFICATION_FAILED", "COMPLETED_PROMOTED_CLEANED"]);
  if (finalizationOnlyStatuses.has(status)) {
    const lock = await acquireBatchLock(sql, batchId, owner, staleSeconds);
    if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, run_id: runId, lock };
    try {
      const result = await finalizeDeltaIfReady(sql, batchId, runId, windowInfo, state.players.length, baseGate, { promote_rows_per_tick: DEFAULT_PROMOTE_ROWS_PER_TICK, clean_rows_per_tick: DEFAULT_CLEAN_ROWS_PER_TICK });
      return { ok: true, data_ok: result.pass, mode: "delta_update", phase: "finalization", batch_id: batchId, run_id: runId, delta_window: windowInfo, ...result };
    } finally { await releaseBatchLock(sql, batchId, owner); }
  }

  const lock = await acquireBatchLock(sql, batchId, owner, staleSeconds);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, run_id: runId, lock };
  try {
    const players = state.players;
    const cursorOffset = asInt(state.cursor.current_player_offset, 0);
    const chunkSize = asInt(state.batch.chunk_size_players, DEFAULT_CHUNK_SIZE_PLAYERS);
    const maxRows = asInt(state.batch.max_rows_per_tick, DEFAULT_MAX_ROWS_PER_TICK);
    const maxTickRuntimeMs = asInt(env.MAX_TICK_RUNTIME_MS, DEFAULT_MAX_TICK_RUNTIME_MS);

    let offset = cursorOffset, rowsThisTick = 0, processedThisTick = 0;
    const perPlayerResults = [];
    while (offset < players.length && processedThisTick < chunkSize && rowsThisTick < maxRows && (Date.now() - startedAtMs) < maxTickRuntimeMs) {
      const p = players[offset];
      const result = await processPlayerDelta(env, sql, p, state.batch.source_season, batchId, runId, windowInfo.delta_start_date, windowInfo.delta_end_date, maxRows - rowsThisTick, fetchTimeoutMs);
      await upsertDeltaPlayerOutcome(sql, batchId, runId, p, offset, result, result.source_endpoint, windowInfo.delta_start_date, windowInfo.delta_end_date);
      rowsThisTick += asInt(result.rows_staged, 0);
      perPlayerResults.push(result);
      offset += 1;
      processedThisTick += 1;
    }

    const cursorJson = { version: VERSION, mode: "delta_update", source_season: state.batch.source_season, delta_start_date: windowInfo.delta_start_date, delta_end_date: windowInfo.delta_end_date, players };
    const doneScanning = offset >= players.length;
    const nextStatus = doneScanning ? "DELTA_STAGED_READY_FOR_CERTIFICATION" : "DELTA_RUNNING";
    await sql`UPDATE stats_pitcher.game_log_cursor SET status=${nextStatus}, current_player_offset=${offset}, players_processed=${offset}, requests_done=requests_done + ${processedThisTick}, cursor_json=${JSON.stringify(cursorJson)}, next_run_after=now(), updated_at=now() WHERE cursor_key=${DELTA_CURSOR_KEY}`;
    await sql`UPDATE stats_pitcher.game_log_batches SET status=${nextStatus}, cursor_offset=${offset}, updated_at=now() WHERE batch_id=${batchId}`;

    let finalization = null;
    if (doneScanning) {
      finalization = await finalizeDeltaIfReady(sql, batchId, runId, windowInfo, players.length, baseGate, { promote_rows_per_tick: DEFAULT_PROMOTE_ROWS_PER_TICK, clean_rows_per_tick: DEFAULT_CLEAN_ROWS_PER_TICK });
    }
    return { ok: true, data_ok: true, mode: "delta_update", phase: doneScanning ? "mining_complete_finalization_started" : "mining", batch_id: batchId, run_id: runId, status: finalization ? finalization.status : nextStatus, delta_window: windowInfo, players_total: players.length, players_processed: offset, processed_this_tick: processedThisTick, rows_staged_this_tick: rowsThisTick, per_player_results: perPlayerResults, finalization };
  } finally { await releaseBatchLock(sql, batchId, owner); }
}

// STUB_MARKER_FETCHHANDLER_NEXT

export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, status: "STUB_UNDER_CONSTRUCTION", worker_name: WORKER_NAME, version: VERSION, timestamp_utc: nowUtc() }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
