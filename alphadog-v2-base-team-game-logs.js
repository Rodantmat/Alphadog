import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-team-game-logs";
const VERSION = "alphadog-v2-base-team-game-logs-postgres-v1.0.0-direct-port";
const JOB_KEY = "base-team-game-logs";
const DATA_FEED_KEY = "team_game_logs";
const SOURCE_KEY = "mlb_statsapi_schedule_team_totals_v0_1_0";
const LOCKED_SOURCE_ENDPOINT_PATTERN = "/api/v1/schedule?sportId=1&gameTypes=R&startDate={start}&endDate={end}";
const DEFAULT_SEASON_START_DATE = "2026-03-25";
const DEFAULT_BASE_BACKFILL_CUTOFF_DATE = "2026-07-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-07-19";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_GAMES = 3;
const DEFAULT_MAX_TICK_RUNTIME_MS = 20000;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_PROMOTE_ROWS_PER_TICK = 25;
const DEFAULT_CLEAN_ROWS_PER_TICK = 500;
const DEFAULT_LOCK_STALE_SECONDS = 60;
const DEFAULT_DELTA_LOOKBACK_DAYS = 7;
let LOCKED_BASE_BATCH_ID = "PENDING_FIRST_REAL_BASE_BACKFILL_COMPLETION";
const ACTIVE_CURSOR_KEY = "base_team_game_logs_active_cursor";
const DELTA_CURSOR_KEY = "delta_team_game_logs_active_cursor";

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
export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, status: "stub_not_yet_built" }), { headers: { "content-type": "application/json" } });
  }
};
