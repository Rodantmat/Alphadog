import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-starter-history";
const VERSION = "alphadog-v2-base-starter-history-postgres-v1.0.0-direct-port";
const JOB_KEY = "base-starter-history";
const DATA_FEED_KEY = "starter_history";
const SOURCE_KEY = "mlb_statsapi_schedule_probable_pitcher_v0_1_0";
const LOCKED_SOURCE_ENDPOINT_PATTERN = "/api/v1/schedule?sportId=1&gameTypes=R&startDate={start}&endDate={end}&hydrate=probablePitcher,linescore";
const DEFAULT_SEASON_START_DATE = "2026-03-25";
const DEFAULT_BASE_BACKFILL_CUTOFF_DATE = "2026-07-18";
const DEFAULT_DELTA_RESERVED_START_DATE = "2026-07-19";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_GAMES = 750;
const DEFAULT_MAX_TICK_RUNTIME_MS = 90000;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
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
    CREATE TABLE IF NOT EXISTS team.starter_history_stage (
      stage_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      team_id TEXT,
      game_pk BIGINT,
      game_date DATE,
      mlb_player_id BIGINT,
      opponent_team_id TEXT,
      is_home INTEGER,
      raw_json JSONB,
      ingestion_mode TEXT,
      source_key TEXT,
      source_confidence TEXT,
      source_endpoint TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      row_status TEXT DEFAULT 'staged',
      certification_status TEXT,
      certification_grade TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS team.starter_history_batches (
      batch_id TEXT PRIMARY KEY,
      run_id TEXT,
      worker_name TEXT,
      worker_version TEXT,
      mode TEXT,
      status TEXT,
      data_feed_key TEXT,
      source_key TEXT,
      source_endpoint TEXT,
      source_season INTEGER,
      source_game_type TEXT,
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
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_starter_history_pk ON team.starter_history (history_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_starter_history_batch ON team.starter_history (batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_starter_history_stage_batch ON team.starter_history_stage (batch_id)`;
  return { ok: true };
}
// STUB_MARKER_FETCH_HELPERS_NEXT
async function fetchTextWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), Math.max(1000, Number(timeoutMs || DEFAULT_FETCH_TIMEOUT_MS)));
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    const text = await resp.text();
    return { ok: true, resp, text, timed_out: false };
  } catch (err) {
    return { ok: false, resp: null, text: "", timed_out: String(err && err.name ? err.name : err).includes("Abort"), error: String(err && err.message ? err.message : err) };
  } finally { clearTimeout(timer); }
}
function isFinalMlbGame(g) { return String(g && g.status && g.status.abstractGameState) === "Final" || String(g && g.status && g.status.detailedState) === "Final"; }
async function fetchScheduleRange(env, startDate, endDate, fetchTimeoutMs) {
  const baseUrl = asText(env.MLB_API_BASE_URL, "https://statsapi.mlb.com").replace(/\/$/, "");
  const endpoint = `${baseUrl}/schedule?sportId=1&gameTypes=R&startDate=${startDate}&endDate=${endDate}&hydrate=probablePitcher,linescore`;
  const r = await fetchTextWithTimeout(endpoint, { headers: { "User-Agent": asText(env.MLB_API_USER_AGENT, "AlphaDogV2/1.0") } }, fetchTimeoutMs);
  if (!r.ok || !r.resp || !r.resp.ok) return { ok: false, endpoint, http_status: r.resp ? r.resp.status : null, error: r.error || "fetch_failed" };
  let json;
  try { json = JSON.parse(r.text); } catch (_) { return { ok: false, endpoint, error: "json_parse_failed" }; }
  const dates = Array.isArray(json.dates) ? json.dates : [];
  const rows = [];
  let finalGameCount = 0;
  for (const d of dates) {
    const games = Array.isArray(d.games) ? d.games : [];
    for (const g of games) {
      if (!isFinalMlbGame(g)) continue;
      finalGameCount += 1;
      const gamePk = asInt(g.gamePk, 0);
      const gameDate = asText(d.date, null);
      const home = g.teams && g.teams.home;
      const away = g.teams && g.teams.away;
      if (!home || !away || !gamePk || !gameDate) continue;
      const homeTeamId = asText(home.team && home.team.id, null);
      const awayTeamId = asText(away.team && away.team.id, null);
      const homeStarterId = asInt(home.probablePitcher && home.probablePitcher.id, 0);
      const awayStarterId = asInt(away.probablePitcher && away.probablePitcher.id, 0);
      if (!homeTeamId || !awayTeamId) continue;
      if (homeStarterId) rows.push({ team_id: homeTeamId, opponent_team_id: awayTeamId, game_pk: gamePk, game_date: gameDate, is_home: 1, mlb_player_id: homeStarterId, raw_json: g });
      if (awayStarterId) rows.push({ team_id: awayTeamId, opponent_team_id: homeTeamId, game_pk: gamePk, game_date: gameDate, is_home: 0, mlb_player_id: awayStarterId, raw_json: g });
    }
  }
  return { ok: true, endpoint, rows, final_game_count: finalGameCount, dates_seen: dates.length };
}
async function insertStageRowsBulk(sql, batchId, runId, mode, sourceSeason, rows) {
  if (!rows.length) return { inserted: 0 };
  const seen = new Set();
  const dedupedRows = [];
  for (const r of rows) {
    const key = `${r.team_id}_${r.game_pk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRows.push(r);
  }
  const values = dedupedRows.map(r => ({
    stage_id: `${batchId}_${r.team_id}_${r.game_pk}_starter`,
    batch_id: batchId, run_id: runId,
    team_id: r.team_id, game_pk: r.game_pk, game_date: r.game_date,
    mlb_player_id: r.mlb_player_id, opponent_team_id: r.opponent_team_id, is_home: r.is_home,
    raw_json: JSON.stringify(r.raw_json),
    ingestion_mode: mode, source_key: SOURCE_KEY, source_confidence: "SOURCE_LOCKED_STATSAPI_SCHEDULE_PROBABLE_PITCHER",
    source_endpoint: LOCKED_SOURCE_ENDPOINT_PATTERN, source_season: sourceSeason, source_game_type: "R",
    row_status: "staged"
  }));
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    await sql`
      INSERT INTO team.starter_history_stage ${sql(slice, "stage_id","batch_id","run_id","team_id","game_pk","game_date","mlb_player_id","opponent_team_id","is_home","raw_json","ingestion_mode","source_key","source_confidence","source_endpoint","source_season","source_game_type","row_status")}
      ON CONFLICT (stage_id) DO UPDATE SET
        mlb_player_id=excluded.mlb_player_id, raw_json=excluded.raw_json,
        row_status='staged', updated_at=now()
    `;
    inserted += slice.length;
  }
  return { inserted };
}
// STUB_MARKER_PROMOTE_CLEAN_NEXT
export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, status: "stub_not_yet_built" }), { headers: { "content-type": "application/json" } });
  }
};
