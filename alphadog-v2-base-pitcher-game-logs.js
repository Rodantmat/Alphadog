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

// STUB_MARKER_SCHEMA_NEXT

export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, status: "STUB_UNDER_CONSTRUCTION", worker_name: WORKER_NAME, version: VERSION, timestamp_utc: nowUtc() }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
