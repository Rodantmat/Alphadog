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
let LOCKED_BASE_BATCH_ID = "starter_history_base_backfill_batch_mrvd36qf_tjgyjq";

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
async function promoteStageRowsChunk(sql, batchId, grade, limit) {
  const safeLimit = cap(limit || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 2000);
  const rows = await sql`
    SELECT stage_id, team_id, game_pk, game_date, mlb_player_id, opponent_team_id, is_home, raw_json,
           batch_id, run_id, ingestion_mode, source_key, source_confidence, source_endpoint, source_season, source_game_type
    FROM team.starter_history_stage
    WHERE batch_id=${batchId} AND row_status != 'promoted'
    LIMIT ${safeLimit}
  `;
  let promotedThisTick = 0;
  for (const r of rows) {
    const historyId = `${r.team_id}_${r.game_pk}_starter`;
    await sql`
      INSERT INTO team.starter_history (
        history_id, team_id, game_pk, game_date, mlb_player_id, opponent_team_id, is_home, raw_json,
        ingestion_mode, batch_id, run_id, certification_status, certification_grade, source_key, source_confidence,
        source_endpoint, source_season, source_game_type, certified_at, promoted_at, created_at, updated_at
      ) VALUES (
        ${historyId}, ${r.team_id}, ${r.game_pk}, ${r.game_date}, ${r.mlb_player_id}, ${r.opponent_team_id}, ${r.is_home}, ${r.raw_json},
        ${r.ingestion_mode}, ${r.batch_id}, ${r.run_id}, 'certified_promoted', ${grade}, ${r.source_key}, ${r.source_confidence},
        ${r.source_endpoint}, ${r.source_season}, ${r.source_game_type}, now(), now(), now(), now()
      )
      ON CONFLICT (history_id) DO UPDATE SET
        game_date=excluded.game_date, mlb_player_id=excluded.mlb_player_id, opponent_team_id=excluded.opponent_team_id, is_home=excluded.is_home, raw_json=excluded.raw_json,
        source_key=excluded.source_key, source_confidence=excluded.source_confidence, source_endpoint=excluded.source_endpoint,
        source_season=excluded.source_season, source_game_type=excluded.source_game_type,
        batch_id=COALESCE(team.starter_history.batch_id, excluded.batch_id),
        run_id=COALESCE(team.starter_history.run_id, excluded.run_id),
        ingestion_mode=COALESCE(team.starter_history.ingestion_mode, excluded.ingestion_mode),
        certification_status=COALESCE(team.starter_history.certification_status, excluded.certification_status),
        certification_grade=COALESCE(team.starter_history.certification_grade, excluded.certification_grade),
        promoted_at=now(), updated_at=now()
    `;
    await sql`UPDATE team.starter_history_stage SET row_status='promoted', updated_at=now() WHERE stage_id=${r.stage_id}`;
    promotedThisTick += 1;
  }
  const remainingRows = await sql`SELECT COUNT(*)::int AS c FROM team.starter_history_stage WHERE batch_id=${batchId} AND row_status != 'promoted'`;
  return { promoted_this_tick: promotedThisTick, remaining_unpromoted: asInt(remainingRows[0] && remainingRows[0].c, 0), promote_limit: safeLimit, insert_mode: "postgres_on_conflict_history_id" };
}
async function cleanStageRowsChunk(sql, batchId, limit) {
  const safeLimit = cap(limit || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 8000);
  const res = await sql`DELETE FROM team.starter_history_stage WHERE ctid IN (SELECT ctid FROM team.starter_history_stage WHERE batch_id=${batchId} LIMIT ${safeLimit})`;
  const cleaned = Number(res.count || 0);
  const remainRows = await sql`SELECT COUNT(*)::int AS c FROM team.starter_history_stage WHERE batch_id=${batchId}`;
  const remain = asInt(remainRows[0] && remainRows[0].c, 0);
  return { cleaned_this_tick: cleaned, stage_rows_after_clean: remain, cleanup_done: remain === 0, clean_limit: safeLimit };
}
// STUB_MARKER_STATE_MACHINE_NEXT
async function acquireBatchLock(sql, batchId, owner, staleSeconds) {
  const rows = await sql`SELECT locked_by, lock_acquired_at, lock_expires_at FROM team.starter_history_batches WHERE batch_id=${batchId} LIMIT 1`;
  const row = rows[0] || null;
  const nowMs = Date.now();
  const lockedBy = row && row.locked_by ? String(row.locked_by) : null;
  const lockExpiresMs = row && row.lock_expires_at ? new Date(row.lock_expires_at).getTime() : NaN;
  const expired = !Number.isFinite(lockExpiresMs) || lockExpiresMs <= nowMs;
  if (lockedBy && !expired && lockedBy !== owner) {
    return { ok: false, reason: "batch_lock_busy", locked_by: lockedBy, retry_after_seconds: 20 };
  }
  await sql`UPDATE team.starter_history_batches SET locked_by=${owner}, lock_acquired_at=now(), lock_expires_at=now() + make_interval(secs => ${staleSeconds}), updated_at=now() WHERE batch_id=${batchId}`;
  return { ok: true, owner };
}
async function releaseBatchLock(sql, batchId, owner) {
  await sql`UPDATE team.starter_history_batches SET locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=now() WHERE batch_id=${batchId} AND locked_by=${owner}`;
}
async function buildPrePromotionChecks(sql, batchId) {
  const dupRows = await sql`SELECT COUNT(*)::int AS c FROM (SELECT team_id, game_pk, COUNT(*) AS n FROM team.starter_history_stage WHERE batch_id=${batchId} GROUP BY team_id, game_pk HAVING COUNT(*) > 1) sub`;
  const missingRows = await sql`SELECT COUNT(*)::int AS c FROM team.starter_history_stage WHERE batch_id=${batchId} AND (team_id IS NULL OR game_pk IS NULL OR game_date IS NULL OR mlb_player_id IS NULL)`;
  const totalRows = await sql`SELECT COUNT(*)::int AS c FROM team.starter_history_stage WHERE batch_id=${batchId}`;
  const duplicateCount = asInt(dupRows[0] && dupRows[0].c, 0);
  const missing = asInt(missingRows[0] && missingRows[0].c, 0);
  const total = asInt(totalRows[0] && totalRows[0].c, 0);
  const pass = duplicateCount === 0 && missing === 0 && total > 0;
  return { pass, checks: { duplicate_count: duplicateCount, missing_required: missing, rows_staged: total } };
}
async function getOrCreateBaseBackfillState(env, sql, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const existingRows = await sql`SELECT * FROM team.starter_history_batches WHERE mode='base_backfill' AND status != 'CERTIFICATION_FAILED' ORDER BY started_at DESC LIMIT 1`;
  if (existingRows[0]) return { is_new: false, batch: existingRows[0] };
  const runId = asText(input.run_id, rid("run_base_starter_backfill"));
  const batchId = asText(inputJson.batch_id, rid("starter_history_base_backfill_batch"));
  const cutoffDate = asText(inputJson.base_backfill_cutoff_date, DEFAULT_BASE_BACKFILL_CUTOFF_DATE);
  const sourceSeason = asInt(inputJson.source_season || env.ACTIVE_SEASON, DEFAULT_SOURCE_SEASON);
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_GAMES, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
  await sql`
    INSERT INTO team.starter_history_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_endpoint, source_season, source_game_type, base_backfill_cutoff_date, delta_start_date, promote_rows_per_tick, certification_status, source_confidence, notes, started_at, updated_at)
    VALUES (${batchId}, ${runId}, ${WORKER_NAME}, ${VERSION}, 'base_backfill', 'BASE_BACKFILL_MINING', ${DATA_FEED_KEY}, ${SOURCE_KEY}, ${LOCKED_SOURCE_ENDPOINT_PATTERN}, ${sourceSeason}, 'R', ${cutoffDate}, ${DEFAULT_DELTA_RESERVED_START_DATE}, ${tickConfig.promote_rows_per_tick}, 'not_certified', 'SOURCE_LOCKED_STATSAPI_SCHEDULE_PROBABLE_PITCHER', ${"Postgres-native build, base fills only through " + cutoffDate}, now(), now())
  `;
  const rows = await sql`SELECT * FROM team.starter_history_batches WHERE batch_id=${batchId} LIMIT 1`;
  return { is_new: true, batch: rows[0] };
}
async function runBaseBackfillTick(env, sql, input) {
  const state = await getOrCreateBaseBackfillState(env, sql, input);
  const batch = state.batch;
  const batchId = batch.batch_id;
  const runId = batch.run_id;
  const owner = asText(input.owner, rid("owner"));
  const staleSeconds = DEFAULT_LOCK_STALE_SECONDS;
  const lock = await acquireBatchLock(sql, batchId, owner, staleSeconds);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, lock };
  try {
    const freshRows = await sql`SELECT status FROM team.starter_history_batches WHERE batch_id=${batchId} LIMIT 1`;
    const status = String((freshRows[0] && freshRows[0].status) || "");
    if (status === "COMPLETED_PROMOTED_CLEANED") {
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status, already_completed: true };
    }
    if (status === "BASE_BACKFILL_MINING") {
      const fetchTimeoutMs = asInt(env.FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
      const schedule = await fetchScheduleRange(env, DEFAULT_SEASON_START_DATE, batch.base_backfill_cutoff_date, fetchTimeoutMs);
      if (!schedule.ok) {
        await sql`UPDATE team.starter_history_batches SET status='SOURCE_ERROR', updated_at=now() WHERE batch_id=${batchId}`;
        return { ok: true, data_ok: false, mode: "base_backfill", batch_id: batchId, status: "SOURCE_ERROR", schedule };
      }
      const ins = await insertStageRowsBulk(sql, batchId, runId, "base_backfill", batch.source_season, schedule.rows);
      await sql`UPDATE team.starter_history_batches SET status='BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION', rows_staged=${ins.inserted}, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION", final_game_count: schedule.final_game_count, rows_staged: ins.inserted, continuation_required: true };
    }
    if (status === "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION") {
      const pre = await buildPrePromotionChecks(sql, batchId);
      if (!pre.pass) {
        await sql`UPDATE team.starter_history_batches SET status='CERTIFICATION_FAILED', certification_status='BASE_STARTER_HISTORY_CERTIFICATION_FAILED', certification_grade='BASE_FAIL', certification_json=${JSON.stringify(pre.checks)}, updated_at=now() WHERE batch_id=${batchId}`;
        return { ok: true, data_ok: false, mode: "base_backfill", batch_id: batchId, status: "CERTIFICATION_FAILED", checks: pre.checks };
      }
      await sql`UPDATE team.starter_history_batches SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', certification_status='BASE_STARTER_HISTORY_CERTIFIED', certification_grade='BASE_PASS', certification_json=${JSON.stringify(pre.checks)}, certified_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", checks: pre.checks, continuation_required: true };
    }
    if (status === "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE" || status === "BASE_BACKFILL_PROMOTING") {
      const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_GAMES, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
      const promoted = await promoteStageRowsChunk(sql, batchId, "BASE_PASS", tickConfig.promote_rows_per_tick);
      const nextStatus = promoted.remaining_unpromoted === 0 ? "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" : "BASE_BACKFILL_PROMOTING";
      await sql`UPDATE team.starter_history_batches SET status=${nextStatus}, rows_promoted=rows_promoted + ${promoted.promoted_this_tick}, promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: nextStatus, promoted, continuation_required: true };
    }
    if (status === "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" || status === "BASE_BACKFILL_CLEANING") {
      const cleaned = await cleanStageRowsChunk(sql, batchId, DEFAULT_CLEAN_ROWS_PER_TICK);
      const nextStatus = cleaned.cleanup_done ? "COMPLETED_PROMOTED_CLEANED" : "BASE_BACKFILL_CLEANING";
      await sql`UPDATE team.starter_history_batches SET status=${nextStatus}, cleaned_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE cleaned_at END, finished_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE finished_at END, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: nextStatus, cleaned, done: cleaned.cleanup_done, continuation_required: !cleaned.cleanup_done };
    }
    return { ok: true, data_ok: false, mode: "base_backfill", batch_id: batchId, status: "UNKNOWN_STATUS", real_status: status };
  } finally { await releaseBatchLock(sql, batchId, owner); }
}
// STUB_MARKER_DELTA_NEXT
async function getLockedBaseIntegrity(sql) {
  const batchRows = await sql`SELECT batch_id, status, rows_promoted, base_backfill_cutoff_date, cleaned_at FROM team.starter_history_batches WHERE batch_id=${LOCKED_BASE_BATCH_ID} LIMIT 1`;
  const batch = batchRows[0] || null;
  const liveRows = await sql`SELECT COUNT(*)::int AS c FROM team.starter_history WHERE batch_id=${LOCKED_BASE_BATCH_ID}`;
  const dupRows = await sql`SELECT COUNT(*)::int AS c FROM (SELECT team_id, game_pk, COUNT(*) AS n FROM team.starter_history WHERE batch_id=${LOCKED_BASE_BATCH_ID} GROUP BY team_id, game_pk HAVING COUNT(*) > 1) sub`;
  const cutoffDate = batch ? batch.base_backfill_cutoff_date : DEFAULT_BASE_BACKFILL_CUTOFF_DATE;
  const live = liveRows[0] || {}, dup = dupRows[0] || {};
  const pass = !!batch && String(batch.status) === "COMPLETED_PROMOTED_CLEANED" && asInt(dup.c, 0) === 0 && asInt(live.c, 0) > 0;
  return { pass, required_base_batch_id: LOCKED_BASE_BATCH_ID, status: batch ? batch.status : null, rows_promoted: batch ? asInt(batch.rows_promoted, 0) : 0, live_base_rows: asInt(live.c, 0), duplicate_base_live_keys: asInt(dup.c, 0), cutoff_date: cutoffDate, cleaned_at: batch ? batch.cleaned_at : null };
}
async function determineLatestCompleteGameDate(env, deltaFloor, fetchTimeoutMs) {
  const today = new Date().toISOString().slice(0, 10);
  const schedule = await fetchScheduleRange(env, deltaFloor, today, fetchTimeoutMs);
  if (!schedule.ok) return { ok: false, ...schedule };
  const dates = [...new Set(schedule.rows.map(r => r.game_date))].sort();
  const latest = dates.length ? dates[dates.length - 1] : null;
  if (!latest) return { ok: false, endpoint: schedule.endpoint, error: "NO_COMPLETE_FINAL_MLB_GAME_DATE_IN_DELTA_RANGE" };
  return { ok: true, endpoint: schedule.endpoint, latest_complete_game_date: latest };
}
function addDays(dateStr, days) { const d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
async function getDeltaWindow(env, sql, inputJson, fetchTimeoutMs) {
  const deltaFloor = asText(inputJson.delta_start_date || DEFAULT_DELTA_RESERVED_START_DATE, DEFAULT_DELTA_RESERVED_START_DATE);
  const schedule = await determineLatestCompleteGameDate(env, deltaFloor, fetchTimeoutMs);
  if (!schedule.ok) return { ok: false, ...schedule, delta_start_date: deltaFloor };
  const latest = schedule.latest_complete_game_date;
  const existingDeltaLiveRows = await sql`SELECT MAX(game_date) AS max_delta_game_date FROM team.starter_history WHERE ingestion_mode='delta_update' AND game_date::date >= ${deltaFloor}::date`;
  const maxDeltaGameDate = asText(existingDeltaLiveRows[0] && existingDeltaLiveRows[0].max_delta_game_date, null);
  const hasPriorDeltaLive = !!(maxDeltaGameDate && maxDeltaGameDate >= deltaFloor);
  const lookbackStart = addDays(latest, -(DEFAULT_DELTA_LOOKBACK_DAYS - 1));
  const start = hasPriorDeltaLive ? lookbackStart : deltaFloor;
  return { ok: true, delta_start_date: start, delta_end_date: latest, delta_floor_date: deltaFloor, latest_complete_game_date: latest, repair_lookback_days: DEFAULT_DELTA_LOOKBACK_DAYS, initial_full_delta_catchup: !hasPriorDeltaLive, prior_delta_live_max_game_date: maxDeltaGameDate, schedule_endpoint: schedule.endpoint };
}
async function getOrCreateDeltaState(env, sql, input, windowInfo) {
  const activeStatuses = ["DELTA_MINING", "DELTA_STAGED_READY_FOR_CERTIFICATION", "DELTA_CERTIFIED_READY_TO_PROMOTE", "DELTA_PROMOTING", "DELTA_PROMOTED_READY_TO_CLEAN", "DELTA_CLEANING"];
  const existingRows = await sql`SELECT * FROM team.starter_history_batches WHERE mode='delta_update' AND status IN ${sql(activeStatuses)} AND delta_start_date=${windowInfo.delta_start_date} ORDER BY started_at DESC LIMIT 1`;
  if (existingRows[0]) return { is_new: false, batch: existingRows[0] };
  const runId = asText(input.run_id, rid("run_delta_starter_history"));
  const batchId = rid("starter_history_delta_update_batch");
  const sourceSeason = DEFAULT_SOURCE_SEASON;
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_GAMES, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
  await sql`
    INSERT INTO team.starter_history_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_endpoint, source_season, source_game_type, base_backfill_cutoff_date, delta_start_date, promote_rows_per_tick, certification_status, notes, started_at, updated_at)
    VALUES (${batchId}, ${runId}, ${WORKER_NAME}, ${VERSION}, 'delta_update', 'DELTA_MINING', ${DATA_FEED_KEY}, ${SOURCE_KEY}, ${LOCKED_SOURCE_ENDPOINT_PATTERN}, ${sourceSeason}, 'R', ${DEFAULT_BASE_BACKFILL_CUTOFF_DATE}, ${windowInfo.delta_start_date}, ${tickConfig.promote_rows_per_tick}, 'not_certified', ${`delta_update window ${windowInfo.delta_start_date} through ${windowInfo.delta_end_date}; base batch ${LOCKED_BASE_BATCH_ID} gate required`}, now(), now())
  `;
  const rows = await sql`SELECT * FROM team.starter_history_batches WHERE batch_id=${batchId} LIMIT 1`;
  return { is_new: true, batch: rows[0] };
}
async function runDeltaUpdateTick(env, sql, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const baseGate = await getLockedBaseIntegrity(sql);
  if (!baseGate.pass) return { ok: true, data_ok: false, mode: "delta_update", status: "BASE_INTEGRITY_GATE_CLOSED", base_integrity_gate: baseGate };
  const fetchTimeoutMs = asInt(env.FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
  const windowInfo = await getDeltaWindow(env, sql, inputJson, fetchTimeoutMs);
  if (!windowInfo.ok) return { ok: true, data_ok: false, mode: "delta_update", status: "DELTA_WINDOW_ERROR", delta_window: windowInfo };
  const state = await getOrCreateDeltaState(env, sql, input, windowInfo);
  const batch = state.batch;
  const batchId = batch.batch_id;
  const runId = batch.run_id;
  const owner = asText(input.owner, rid("owner"));
  const lock = await acquireBatchLock(sql, batchId, owner, DEFAULT_LOCK_STALE_SECONDS);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, lock };
  try {
    const freshRows = await sql`SELECT status FROM team.starter_history_batches WHERE batch_id=${batchId} LIMIT 1`;
    const status = String((freshRows[0] && freshRows[0].status) || "");
    if (status === "COMPLETED_PROMOTED_CLEANED") {
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status, delta_window: windowInfo, already_completed: true };
    }
    if (status === "DELTA_MINING") {
      const schedule = await fetchScheduleRange(env, windowInfo.delta_start_date, windowInfo.delta_end_date, fetchTimeoutMs);
      if (!schedule.ok) {
        await sql`UPDATE team.starter_history_batches SET status='SOURCE_ERROR', updated_at=now() WHERE batch_id=${batchId}`;
        return { ok: true, data_ok: false, mode: "delta_update", batch_id: batchId, status: "SOURCE_ERROR", schedule };
      }
      const ins = await insertStageRowsBulk(sql, batchId, runId, "delta_update", batch.source_season, schedule.rows);
      await sql`UPDATE team.starter_history_batches SET status='DELTA_STAGED_READY_FOR_CERTIFICATION', rows_staged=${ins.inserted}, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: "DELTA_STAGED_READY_FOR_CERTIFICATION", delta_window: windowInfo, final_game_count: schedule.final_game_count, rows_staged: ins.inserted, continuation_required: true };
    }
    if (status === "DELTA_STAGED_READY_FOR_CERTIFICATION") {
      const pre = await buildPrePromotionChecks(sql, batchId);
      if (!pre.pass) {
        await sql`UPDATE team.starter_history_batches SET status='CERTIFICATION_FAILED', certification_status='DELTA_STARTER_HISTORY_CERTIFICATION_FAILED', certification_grade='DELTA_FAIL', certification_json=${JSON.stringify(pre.checks)}, updated_at=now() WHERE batch_id=${batchId}`;
        return { ok: true, data_ok: false, mode: "delta_update", batch_id: batchId, status: "CERTIFICATION_FAILED", checks: pre.checks };
      }
      await sql`UPDATE team.starter_history_batches SET status='DELTA_CERTIFIED_READY_TO_PROMOTE', certification_status='DELTA_STARTER_HISTORY_CERTIFIED', certification_grade='DELTA_PASS', certification_json=${JSON.stringify(pre.checks)}, certified_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: "DELTA_CERTIFIED_READY_TO_PROMOTE", delta_window: windowInfo, checks: pre.checks, continuation_required: true };
    }
    if (status === "DELTA_CERTIFIED_READY_TO_PROMOTE" || status === "DELTA_PROMOTING") {
      const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_GAMES, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
      const promoted = await promoteStageRowsChunk(sql, batchId, "DELTA_PASS", tickConfig.promote_rows_per_tick);
      const nextStatus = promoted.remaining_unpromoted === 0 ? "DELTA_PROMOTED_READY_TO_CLEAN" : "DELTA_PROMOTING";
      await sql`UPDATE team.starter_history_batches SET status=${nextStatus}, rows_promoted=rows_promoted + ${promoted.promoted_this_tick}, promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: nextStatus, delta_window: windowInfo, promoted, continuation_required: true };
    }
    if (status === "DELTA_PROMOTED_READY_TO_CLEAN" || status === "DELTA_CLEANING") {
      const cleaned = await cleanStageRowsChunk(sql, batchId, DEFAULT_CLEAN_ROWS_PER_TICK);
      const nextStatus = cleaned.cleanup_done ? "COMPLETED_PROMOTED_CLEANED" : "DELTA_CLEANING";
      await sql`UPDATE team.starter_history_batches SET status=${nextStatus}, cleaned_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE cleaned_at END, finished_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE finished_at END, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: nextStatus, delta_window: windowInfo, cleaned, done: cleaned.cleanup_done, continuation_required: !cleaned.cleanup_done };
    }
    return { ok: true, data_ok: false, mode: "delta_update", batch_id: batchId, status: "UNKNOWN_STATUS", real_status: status };
  } finally { await releaseBatchLock(sql, batchId, owner); }
}
// STUB_MARKER_HANDLER_NEXT
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, job_key: JOB_KEY, timestamp_utc: nowUtc() }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/schema") {
        const result = await ensureSchema(sql);
        return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, schema: result }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/run" && request.method === "POST") {
        await ensureSchema(sql);
        let input = {};
        try { input = await request.json(); } catch (_) { input = {}; }
        const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
        const mode = asText(inputJson.mode || input.mode, "base_backfill");
        const result = mode === "delta_update" ? await runDeltaUpdateTick(env, sql, input) : await runBaseBackfillTick(env, sql, input);
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found", path: url.pathname }), { status: 404, headers: { "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : "") }), { status: 500, headers: { "content-type": "application/json" } });
    } finally {
      try { await sql.end(); } catch (_) {}
    }
  }
};

