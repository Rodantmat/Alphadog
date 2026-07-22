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
export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, status: "stub_not_yet_built" }), { headers: { "content-type": "application/json" } });
  }
};
