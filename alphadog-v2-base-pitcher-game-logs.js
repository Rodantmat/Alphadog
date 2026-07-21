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

const ACTIVE_CURSOR_KEY = "base_pitcher_game_logs_active_cursor";
const DELTA_CURSOR_KEY = "delta_pitcher_game_logs_active_cursor";
let LOCKED_BASE_BATCH_ID = "PENDING_FIRST_REAL_BASE_BACKFILL_COMPLETION";

// STUB_MARKER_BUILD_IN_PROGRESS_VIA_PATCHES

function nowUtc() { return new Date().toISOString(); }

export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, status: "STUB_UNDER_CONSTRUCTION", worker_name: WORKER_NAME, version: VERSION, timestamp_utc: nowUtc() }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
