import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-bullpen-history";
const VERSION = "alphadog-v2-base-bullpen-history-postgres-v1.0.0-derived";
const JOB_KEY = "base-bullpen-history";
const DATA_FEED_KEY = "bullpen_history";
const SOURCE_KEY = "derived_from_stats_pitcher_game_logs_and_starter_history_v0_1_0";
const DEFAULT_BASE_BACKFILL_CUTOFF_DATE = "2026-07-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-07-19";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_GAMES = 750;
const DEFAULT_MAX_TICK_RUNTIME_MS = 90000;
const DEFAULT_PROMOTE_ROWS_PER_TICK = 750;
const DEFAULT_CLEAN_ROWS_PER_TICK = 500;
const DEFAULT_LOCK_STALE_SECONDS = 60;
const DEFAULT_DELTA_LOOKBACK_DAYS = 7;
let LOCKED_BASE_BATCH_ID = "PENDING_FIRST_REAL_BASE_BACKFILL_COMPLETION";

function nowUtc() { return new Date().toISOString(); }
async function getWorkerTickConfig(sql, workerName, fallbackChunk, fallbackTickMs, fallbackPromote) {
  try {
    const rows = await sql`SELECT chunk_size_players, max_tick_runtime_ms, promote_rows_per_tick FROM config.worker_tick_settings WHERE worker_name=${workerName} LIMIT 1`;
    const row = rows[0];
    if (!row) return { chunk_size_players: fallbackChunk, max_tick_runtime_ms: fallbackTickMs, promote_rows_per_tick: fallbackPromote };
    return { chunk_size_players: asInt(row.chunk_size_players, fallbackChunk), max_tick_runtime_ms: asInt(row.max_tick_runtime_ms, fallbackTickMs), promote_rows_per_tick: asInt(row.promote_rows_per_tick, fallbackPromote) };
  } catch (_) {
    return { chunk_size_players: fallbackChunk, max_tick_runtime_ms: fallbackTickMs, promote_rows_per_tick: fallbackPromote };
  }
}
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function cap(n, min, max) { return Math.max(min, Math.min(max, Number(n || 0))); }

// STUB_MARKER_SCHEMA_NEXT
async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS team.bullpen_history_stage (
      stage_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      team_id TEXT,
      game_pk BIGINT,
      game_date DATE,
      player_id BIGINT,
      opponent_team_id TEXT,
      is_home INTEGER,
      innings_pitched_decimal DOUBLE PRECISION,
      earned_runs INTEGER,
      hits_allowed INTEGER,
      walks_allowed INTEGER,
      strikeouts INTEGER,
      raw_json JSONB,
      ingestion_mode TEXT,
      source_key TEXT,
      source_confidence TEXT,
      source_season INTEGER,
      row_status TEXT DEFAULT 'staged',
      certification_status TEXT,
      certification_grade TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS team.bullpen_history_batches (
      batch_id TEXT PRIMARY KEY,
      run_id TEXT,
      worker_name TEXT,
      worker_version TEXT,
      mode TEXT,
      status TEXT,
      data_feed_key TEXT,
      source_key TEXT,
      source_season INTEGER,
      base_backfill_cutoff_date TEXT,
      delta_start_date TEXT,
      promote_rows_per_tick INTEGER DEFAULT 25,
      rows_staged INTEGER DEFAULT 0,
      rows_promoted INTEGER DEFAULT 0,
      certification_status TEXT DEFAULT 'not_certified',
      certification_grade TEXT,
      certification_json JSONB,
      source_confidence TEXT,
      locked_by TEXT,
      lock_acquired_at TIMESTAMPTZ,
      lock_expires_at TIMESTAMPTZ,
      notes TEXT,
      started_at TIMESTAMPTZ DEFAULT now(),
      finished_at TIMESTAMPTZ,
      certified_at TIMESTAMPTZ,
      promoted_at TIMESTAMPTZ,
      cleaned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_bullpen_history_pk ON team.bullpen_history (history_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bullpen_history_batch ON team.bullpen_history (batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bullpen_history_stage_batch ON team.bullpen_history_stage (batch_id)`;
  return { ok: true };
}
// STUB_MARKER_MINING_NEXT
async function deriveBullpenStageRows(sql, batchId, runId, mode, sourceSeason, startDate, endDate) {
  const res = await sql`
    INSERT INTO team.bullpen_history_stage (
      stage_id, batch_id, run_id, team_id, game_pk, game_date, player_id, opponent_team_id, is_home,
      innings_pitched_decimal, earned_runs, hits_allowed, walks_allowed, strikeouts, raw_json,
      ingestion_mode, source_key, source_confidence, source_season, row_status
    )
    SELECT
      ${batchId} || '_' || p.team_id || '_' || p.game_pk || '_' || p.player_id || '_bullpen',
      ${batchId}, ${runId}, p.team_id, p.game_pk, p.game_date, p.player_id, p.opponent_team_id, p.is_home,
      p.innings_pitched_decimal, p.earned_runs, p.hits_allowed, p.walks_allowed, p.strikeouts, p.raw_json,
      ${mode}, ${SOURCE_KEY}, 'DERIVED_FROM_PITCHER_GAME_LOGS_AND_STARTER_HISTORY', ${sourceSeason}, 'staged'
    FROM stats_pitcher.game_logs p
    LEFT JOIN team.starter_history s ON s.team_id = p.team_id AND s.game_pk = p.game_pk
    WHERE p.game_date BETWEEN ${startDate}::date AND ${endDate}::date
      AND (s.mlb_player_id IS NULL OR s.mlb_player_id != p.player_id)
    ON CONFLICT (stage_id) DO UPDATE SET
      innings_pitched_decimal=excluded.innings_pitched_decimal, earned_runs=excluded.earned_runs,
      hits_allowed=excluded.hits_allowed, walks_allowed=excluded.walks_allowed, strikeouts=excluded.strikeouts,
      raw_json=excluded.raw_json, row_status='staged', updated_at=now()
  `;
  const countRows = await sql`SELECT COUNT(*)::int AS c FROM team.bullpen_history_stage WHERE batch_id=${batchId}`;
  return { inserted: asInt(countRows[0] && countRows[0].c, 0) };
}
// STUB_MARKER_PROMOTE_CLEAN_NEXT
async function promoteStageRowsChunk(sql, batchId, grade, limit) {
  const safeLimit = cap(limit || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 2000);
  const rows = await sql`
    SELECT stage_id, team_id, game_pk, game_date, player_id, opponent_team_id, is_home,
           innings_pitched_decimal, earned_runs, hits_allowed, walks_allowed, strikeouts, raw_json,
           batch_id, run_id, ingestion_mode, source_key, source_confidence, source_season
    FROM team.bullpen_history_stage
    WHERE batch_id=${batchId} AND row_status != 'promoted'
    LIMIT ${safeLimit}
  `;
  let promotedThisTick = 0;
  for (const r of rows) {
    const historyId = `${r.team_id}_${r.game_pk}_${r.player_id}_bullpen`;
    await sql`
      INSERT INTO team.bullpen_history (
        history_id, team_id, game_pk, game_date, player_id, opponent_team_id, is_home,
        innings_pitched_decimal, earned_runs, hits_allowed, walks_allowed, strikeouts, raw_json,
        ingestion_mode, batch_id, run_id, certification_status, certification_grade, source_key, source_confidence,
        source_season, certified_at, promoted_at, created_at, updated_at
      ) VALUES (
        ${historyId}, ${r.team_id}, ${r.game_pk}, ${r.game_date}, ${r.player_id}, ${r.opponent_team_id}, ${r.is_home},
        ${r.innings_pitched_decimal}, ${r.earned_runs}, ${r.hits_allowed}, ${r.walks_allowed}, ${r.strikeouts}, ${r.raw_json},
        ${r.ingestion_mode}, ${r.batch_id}, ${r.run_id}, 'certified_promoted', ${grade}, ${r.source_key}, ${r.source_confidence},
        ${r.source_season}, now(), now(), now(), now()
      )
      ON CONFLICT (history_id) DO UPDATE SET
        game_date=excluded.game_date, opponent_team_id=excluded.opponent_team_id, is_home=excluded.is_home,
        innings_pitched_decimal=excluded.innings_pitched_decimal, earned_runs=excluded.earned_runs, hits_allowed=excluded.hits_allowed,
        walks_allowed=excluded.walks_allowed, strikeouts=excluded.strikeouts, raw_json=excluded.raw_json,
        source_key=excluded.source_key, source_confidence=excluded.source_confidence, source_season=excluded.source_season,
        batch_id=COALESCE(team.bullpen_history.batch_id, excluded.batch_id),
        run_id=COALESCE(team.bullpen_history.run_id, excluded.run_id),
        ingestion_mode=COALESCE(team.bullpen_history.ingestion_mode, excluded.ingestion_mode),
        certification_status=COALESCE(team.bullpen_history.certification_status, excluded.certification_status),
        certification_grade=COALESCE(team.bullpen_history.certification_grade, excluded.certification_grade),
        promoted_at=now(), updated_at=now()
    `;
    await sql`UPDATE team.bullpen_history_stage SET row_status='promoted', updated_at=now() WHERE stage_id=${r.stage_id}`;
    promotedThisTick += 1;
  }
  const remainingRows = await sql`SELECT COUNT(*)::int AS c FROM team.bullpen_history_stage WHERE batch_id=${batchId} AND row_status != 'promoted'`;
  return { promoted_this_tick: promotedThisTick, remaining_unpromoted: asInt(remainingRows[0] && remainingRows[0].c, 0), promote_limit: safeLimit, insert_mode: "postgres_on_conflict_history_id" };
}
async function cleanStageRowsChunk(sql, batchId, limit) {
  const safeLimit = cap(limit || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 8000);
  const res = await sql`DELETE FROM team.bullpen_history_stage WHERE ctid IN (SELECT ctid FROM team.bullpen_history_stage WHERE batch_id=${batchId} LIMIT ${safeLimit})`;
  const cleaned = Number(res.count || 0);
  const remainRows = await sql`SELECT COUNT(*)::int AS c FROM team.bullpen_history_stage WHERE batch_id=${batchId}`;
  const remain = asInt(remainRows[0] && remainRows[0].c, 0);
  return { cleaned_this_tick: cleaned, stage_rows_after_clean: remain, cleanup_done: remain === 0, clean_limit: safeLimit };
}
// STUB_MARKER_STATE_MACHINE_NEXT
export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, status: "stub_not_yet_built" }), { headers: { "content-type": "application/json" } });
  }
};
