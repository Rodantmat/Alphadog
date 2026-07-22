import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-hitter-splits";
const VERSION = "alphadog-v2-base-hitter-splits-postgres-v1.0.0-per-player-fetch";
const JOB_KEY = "base-hitter-splits";
const DATA_FEED_KEY = "hitter_splits";
const SOURCE_KEY = "mlb_statsapi_statsplits_v0_1_0";
const LOCKED_SOURCE_ENDPOINT_PATTERN = "/api/v1/people/{playerId}/stats?stats=statSplits&sitCodes=vl,vr&group=hitting&season={season}&gameType=R";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_PLAYERS = 100;
const DEFAULT_MAX_TICK_RUNTIME_MS = 90000;
const DEFAULT_PROMOTE_ROWS_PER_TICK = 3000;
const DEFAULT_CLEAN_ROWS_PER_TICK = 3000;
const DEFAULT_LOCK_STALE_SECONDS = 60;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
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
function todayUtc() { return new Date().toISOString().slice(0, 10); }

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS stats_hitter.splits_stage (
      stage_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      player_id BIGINT,
      season INTEGER,
      split_key TEXT,
      pa INTEGER, ab INTEGER, hits INTEGER, doubles INTEGER, triples INTEGER, home_runs INTEGER,
      rbi INTEGER, walks INTEGER, strikeouts INTEGER, avg TEXT, obp TEXT, slg TEXT, ops TEXT, babip TEXT,
      raw_json JSONB,
      ingestion_mode TEXT,
      source_key TEXT,
      source_confidence TEXT,
      source_endpoint TEXT,
      source_season INTEGER,
      row_status TEXT DEFAULT 'staged',
      certification_status TEXT,
      certification_grade TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stats_hitter.splits_batches (
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
      promote_rows_per_tick INTEGER DEFAULT 3000,
      rows_staged INTEGER DEFAULT 0,
      rows_promoted INTEGER DEFAULT 0,
      players_total INTEGER DEFAULT 0,
      players_processed INTEGER DEFAULT 0,
      cursor_player_id BIGINT,
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
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_hitter_splits_pk ON stats_hitter.splits (split_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hitter_splits_batch ON stats_hitter.splits (batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hitter_splits_stage_batch ON stats_hitter.splits_stage (batch_id)`;
  return { ok: true };
}

async function fetchTextWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), Math.max(1000, Number(timeoutMs || DEFAULT_FETCH_TIMEOUT_MS)));
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    const text = await resp.text();
    return { ok: true, resp, text };
  } catch (err) {
    return { ok: false, resp: null, text: "", error: String(err && err.message ? err.message : err) };
  } finally { clearTimeout(timer); }
}

async function fetchPlayerSplits(env, playerId, season, fetchTimeoutMs) {
  const baseUrl = asText(env.MLB_API_BASE_URL, "https://statsapi.mlb.com").replace(/\/$/, "");
  const endpoint = `${baseUrl}/people/${playerId}/stats?stats=statSplits&sitCodes=vl,vr&group=hitting&season=${season}&gameType=R`;
  const r = await fetchTextWithTimeout(endpoint, { headers: { "User-Agent": asText(env.MLB_API_USER_AGENT, "AlphaDogV2/1.0") } }, fetchTimeoutMs);
  if (!r.ok || !r.resp || !r.resp.ok) return { ok: false, endpoint, error: r.error || "fetch_failed" };
  let json;
  try { json = JSON.parse(r.text); } catch (_) { return { ok: false, endpoint, error: "json_parse_failed" }; }
  const rows = [];
  const statsArr = Array.isArray(json.stats) ? json.stats : [];
  for (const statBlock of statsArr) {
    const splits = Array.isArray(statBlock.splits) ? statBlock.splits : [];
    for (const sp of splits) {
      const code = asText(sp.split && sp.split.code, null);
      if (code !== "vl" && code !== "vr") continue;
      const st = sp.stat || {};
      rows.push({
        player_id: playerId, season, split_key: code,
        pa: asInt(st.plateAppearances, null), ab: asInt(st.atBats, null), hits: asInt(st.hits, null),
        doubles: asInt(st.doubles, null), triples: asInt(st.triples, null), home_runs: asInt(st.homeRuns, null),
        rbi: asInt(st.rbi, null), walks: asInt(st.baseOnBalls, null), strikeouts: asInt(st.strikeOuts, null),
        avg: asText(st.avg, null), obp: asText(st.obp, null), slg: asText(st.slg, null), ops: asText(st.ops, null), babip: asText(st.babip, null),
        raw_json: sp
      });
    }
  }
  return { ok: true, endpoint, rows };
}

async function getPlayerUniverse(sql) {
  const rows = await sql`SELECT DISTINCT player_id FROM stats_hitter.game_logs ORDER BY player_id`;
  return rows.map(r => Number(r.player_id));
}

async function insertStageRowsBulk(sql, batchId, runId, mode, sourceSeason, rows) {
  if (!rows.length) return { inserted: 0 };
  const values = rows.map(r => ({
    stage_id: `${batchId}_${r.player_id}_${r.season}_${r.split_key}`,
    batch_id: batchId, run_id: runId,
    player_id: r.player_id, season: r.season, split_key: r.split_key,
    pa: r.pa, ab: r.ab, hits: r.hits, doubles: r.doubles, triples: r.triples, home_runs: r.home_runs,
    rbi: r.rbi, walks: r.walks, strikeouts: r.strikeouts, avg: r.avg, obp: r.obp, slg: r.slg, ops: r.ops, babip: r.babip,
    raw_json: JSON.stringify(r.raw_json),
    ingestion_mode: mode, source_key: SOURCE_KEY, source_confidence: "SOURCE_LOCKED_STATSAPI_STATSPLITS",
    source_endpoint: LOCKED_SOURCE_ENDPOINT_PATTERN, source_season: sourceSeason,
    row_status: "staged"
  }));
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    await sql`
      INSERT INTO stats_hitter.splits_stage ${sql(slice, "stage_id","batch_id","run_id","player_id","season","split_key","pa","ab","hits","doubles","triples","home_runs","rbi","walks","strikeouts","avg","obp","slg","ops","babip","raw_json","ingestion_mode","source_key","source_confidence","source_endpoint","source_season","row_status")}
      ON CONFLICT (stage_id) DO UPDATE SET
        pa=excluded.pa, ab=excluded.ab, hits=excluded.hits, doubles=excluded.doubles, triples=excluded.triples, home_runs=excluded.home_runs,
        rbi=excluded.rbi, walks=excluded.walks, strikeouts=excluded.strikeouts, avg=excluded.avg, obp=excluded.obp, slg=excluded.slg, ops=excluded.ops, babip=excluded.babip,
        raw_json=excluded.raw_json, row_status='staged', updated_at=now()
    `;
    inserted += slice.length;
  }
  return { inserted };
}

async function promoteStageRowsChunk(sql, batchId, grade, limit) {
  const safeLimit = cap(limit || DEFAULT_PROMOTE_ROWS_PER_TICK, 1, 5000);
  const result = await sql`
    WITH batch_rows AS (
      SELECT stage_id, player_id, season, split_key, pa, ab, hits, doubles, triples, home_runs,
             rbi, walks, strikeouts, avg, obp, slg, ops, babip, raw_json,
             batch_id, run_id, ingestion_mode, source_key, source_confidence, source_season
      FROM stats_hitter.splits_stage
      WHERE batch_id=${batchId} AND row_status != 'promoted'
      LIMIT ${safeLimit}
    ),
    ins AS (
      INSERT INTO stats_hitter.splits (
        split_id, player_id, season, split_key, pa, ab, hits, doubles, triples, home_runs,
        rbi, walks, strikeouts, avg, obp, slg, ops, babip, source_key, raw_json,
        ingestion_mode, batch_id, run_id, certification_status, certification_grade, source_confidence,
        source_endpoint, source_season, certified_at, promoted_at, created_at, updated_at
      )
      SELECT
        b.player_id || '_' || b.season || '_' || b.split_key,
        b.player_id, b.season, b.split_key, b.pa, b.ab, b.hits, b.doubles, b.triples, b.home_runs,
        b.rbi, b.walks, b.strikeouts, b.avg, b.obp, b.slg, b.ops, b.babip, b.source_key, b.raw_json,
        b.ingestion_mode, b.batch_id, b.run_id, 'certified_promoted', ${grade}, b.source_confidence,
        ${LOCKED_SOURCE_ENDPOINT_PATTERN}, b.source_season, now(), now(), now(), now()
      FROM batch_rows b
      ON CONFLICT (split_id) DO UPDATE SET
        pa=excluded.pa, ab=excluded.ab, hits=excluded.hits, doubles=excluded.doubles, triples=excluded.triples, home_runs=excluded.home_runs,
        rbi=excluded.rbi, walks=excluded.walks, strikeouts=excluded.strikeouts, avg=excluded.avg, obp=excluded.obp, slg=excluded.slg, ops=excluded.ops, babip=excluded.babip,
        source_key=excluded.source_key, raw_json=excluded.raw_json, source_confidence=excluded.source_confidence,
        source_endpoint=excluded.source_endpoint, source_season=excluded.source_season,
        batch_id=COALESCE(stats_hitter.splits.batch_id, excluded.batch_id),
        run_id=COALESCE(stats_hitter.splits.run_id, excluded.run_id),
        ingestion_mode=COALESCE(stats_hitter.splits.ingestion_mode, excluded.ingestion_mode),
        certification_status=COALESCE(stats_hitter.splits.certification_status, excluded.certification_status),
        certification_grade=COALESCE(stats_hitter.splits.certification_grade, excluded.certification_grade),
        promoted_at=now(), updated_at=now()
      RETURNING 1
    ),
    upd AS (
      UPDATE stats_hitter.splits_stage SET row_status='promoted', updated_at=now()
      WHERE stage_id IN (SELECT stage_id FROM batch_rows) AND (SELECT COUNT(*) FROM ins) >= 0
      RETURNING 1
    )
    SELECT COUNT(*)::int AS promoted_count FROM upd
  `;
  const promotedThisTick = asInt(result[0] && result[0].promoted_count, 0);
  const remainingRows = await sql`SELECT COUNT(*)::int AS c FROM stats_hitter.splits_stage WHERE batch_id=${batchId} AND row_status != 'promoted'`;
  return { promoted_this_tick: promotedThisTick, remaining_unpromoted: asInt(remainingRows[0] && remainingRows[0].c, 0), promote_limit: safeLimit, insert_mode: "postgres_bulk_cte_single_statement" };
}

async function cleanStageRowsChunk(sql, batchId, limit) {
  const safeLimit = cap(limit || DEFAULT_CLEAN_ROWS_PER_TICK, 1, 20000);
  const res = await sql`DELETE FROM stats_hitter.splits_stage WHERE ctid IN (SELECT ctid FROM stats_hitter.splits_stage WHERE batch_id=${batchId} LIMIT ${safeLimit})`;
  const cleaned = Number(res.count || 0);
  const remainRows = await sql`SELECT COUNT(*)::int AS c FROM stats_hitter.splits_stage WHERE batch_id=${batchId}`;
  const remain = asInt(remainRows[0] && remainRows[0].c, 0);
  return { cleaned_this_tick: cleaned, stage_rows_after_clean: remain, cleanup_done: remain === 0, clean_limit: safeLimit };
}

async function acquireBatchLock(sql, batchId, owner, staleSeconds) {
  const rows = await sql`SELECT locked_by, lock_acquired_at, lock_expires_at FROM stats_hitter.splits_batches WHERE batch_id=${batchId} LIMIT 1`;
  const row = rows[0] || null;
  const nowMs = Date.now();
  const lockedBy = row && row.locked_by ? String(row.locked_by) : null;
  const lockExpiresMs = row && row.lock_expires_at ? new Date(row.lock_expires_at).getTime() : NaN;
  const expired = !Number.isFinite(lockExpiresMs) || lockExpiresMs <= nowMs;
  if (lockedBy && !expired && lockedBy !== owner) {
    return { ok: false, reason: "batch_lock_busy", locked_by: lockedBy, retry_after_seconds: 20 };
  }
  await sql`UPDATE stats_hitter.splits_batches SET locked_by=${owner}, lock_acquired_at=now(), lock_expires_at=now() + make_interval(secs => ${staleSeconds}), updated_at=now() WHERE batch_id=${batchId}`;
  return { ok: true, owner };
}
async function releaseBatchLock(sql, batchId, owner) {
  await sql`UPDATE stats_hitter.splits_batches SET locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL, updated_at=now() WHERE batch_id=${batchId} AND locked_by=${owner}`;
}
async function buildPrePromotionChecks(sql, batchId) {
  const dupRows = await sql`SELECT COUNT(*)::int AS c FROM (SELECT player_id, season, split_key, COUNT(*) AS n FROM stats_hitter.splits_stage WHERE batch_id=${batchId} GROUP BY player_id, season, split_key HAVING COUNT(*) > 1) sub`;
  const missingRows = await sql`SELECT COUNT(*)::int AS c FROM stats_hitter.splits_stage WHERE batch_id=${batchId} AND (player_id IS NULL OR season IS NULL OR split_key IS NULL)`;
  const totalRows = await sql`SELECT COUNT(*)::int AS c FROM stats_hitter.splits_stage WHERE batch_id=${batchId}`;
  const duplicateCount = asInt(dupRows[0] && dupRows[0].c, 0);
  const missing = asInt(missingRows[0] && missingRows[0].c, 0);
  const total = asInt(totalRows[0] && totalRows[0].c, 0);
  const pass = duplicateCount === 0 && missing === 0 && total > 0;
  return { pass, checks: { duplicate_count: duplicateCount, missing_required: missing, rows_staged: total } };
}

async function getOrCreateBaseBackfillState(env, sql, input) {
  const batchId = "hitter_splits_base_backfill_singleton";
  const runId = asText(input.run_id, rid("run_base_hitter_splits_backfill"));
  const sourceSeason = DEFAULT_SOURCE_SEASON;
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_PLAYERS, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
  await sql`
    INSERT INTO stats_hitter.splits_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_endpoint, source_season, promote_rows_per_tick, certification_status, source_confidence, notes, started_at, updated_at)
    VALUES (${batchId}, ${runId}, ${WORKER_NAME}, ${VERSION}, 'base_backfill', 'BASE_BACKFILL_MINING', ${DATA_FEED_KEY}, ${SOURCE_KEY}, ${LOCKED_SOURCE_ENDPOINT_PATTERN}, ${sourceSeason}, ${tickConfig.promote_rows_per_tick}, 'not_certified', 'SOURCE_LOCKED_STATSAPI_STATSPLITS', 'Postgres-native per-player splits build', now(), now())
    ON CONFLICT (batch_id) DO NOTHING
  `;
  const rows = await sql`SELECT * FROM stats_hitter.splits_batches WHERE batch_id=${batchId} LIMIT 1`;
  return { is_new: true, batch: rows[0] };
}

async function runMiningTick(env, sql, batch, mode) {
  const batchId = batch.batch_id;
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_PLAYERS, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
  const fetchTimeoutMs = asInt(env.FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
  let universe;
  if (batch.players_total && Number(batch.players_total) > 0) {
    universe = await getPlayerUniverse(sql);
  } else {
    universe = await getPlayerUniverse(sql);
    await sql`UPDATE stats_hitter.splits_batches SET players_total=${universe.length}, updated_at=now() WHERE batch_id=${batchId}`;
  }
  const cursor = batch.cursor_player_id ? Number(batch.cursor_player_id) : 0;
  const remaining = universe.filter(pid => pid > cursor);
  const chunk = remaining.slice(0, tickConfig.chunk_size_players);
  if (chunk.length === 0) {
    return { done: true, players_this_tick: 0, rows_staged_this_tick: 0 };
  }
  let allRows = [];
  let lastPid = cursor;
  for (const pid of chunk) {
    const r = await fetchPlayerSplits(env, pid, batch.source_season || DEFAULT_SOURCE_SEASON, fetchTimeoutMs);
    if (r.ok) allRows = allRows.concat(r.rows);
    lastPid = pid;
  }
  const ins = allRows.length ? await insertStageRowsBulk(sql, batchId, batch.run_id, mode, batch.source_season || DEFAULT_SOURCE_SEASON, allRows) : { inserted: 0 };
  await sql`UPDATE stats_hitter.splits_batches SET cursor_player_id=${lastPid}, players_processed=players_processed + ${chunk.length}, rows_staged=rows_staged + ${ins.inserted}, updated_at=now() WHERE batch_id=${batchId}`;
  const done = remaining.length <= chunk.length;
  return { done, players_this_tick: chunk.length, rows_staged_this_tick: ins.inserted, players_total: universe.length };
}

async function runBaseBackfillTick(env, sql, input) {
  const state = await getOrCreateBaseBackfillState(env, sql, input);
  const batchId = state.batch.batch_id;
  const owner = asText(input.owner, rid("owner"));
  const lock = await acquireBatchLock(sql, batchId, owner, DEFAULT_LOCK_STALE_SECONDS);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, lock };
  try {
    const freshRows = await sql`SELECT * FROM stats_hitter.splits_batches WHERE batch_id=${batchId} LIMIT 1`;
    const batch = freshRows[0];
    const status = String(batch.status || "");
    if (status === "COMPLETED_PROMOTED_CLEANED") {
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status, already_completed: true };
    }
    if (status === "BASE_BACKFILL_MINING") {
      const mined = await runMiningTick(env, sql, batch, "base_backfill");
      const nextStatus = mined.done ? "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION" : "BASE_BACKFILL_MINING";
      await sql`UPDATE stats_hitter.splits_batches SET status=${nextStatus}, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: nextStatus, mined, continuation_required: true };
    }
    if (status === "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION") {
      const pre = await buildPrePromotionChecks(sql, batchId);
      if (!pre.pass) {
        await sql`UPDATE stats_hitter.splits_batches SET status='CERTIFICATION_FAILED', certification_status='BASE_HITTER_SPLITS_CERTIFICATION_FAILED', certification_grade='BASE_FAIL', certification_json=${JSON.stringify(pre.checks)}, updated_at=now() WHERE batch_id=${batchId}`;
        return { ok: true, data_ok: false, mode: "base_backfill", batch_id: batchId, status: "CERTIFICATION_FAILED", checks: pre.checks };
      }
      await sql`UPDATE stats_hitter.splits_batches SET status='BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE', certification_status='BASE_HITTER_SPLITS_CERTIFIED', certification_grade='BASE_PASS', certification_json=${JSON.stringify(pre.checks)}, certified_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE", checks: pre.checks, continuation_required: true };
    }
    if (status === "BASE_BACKFILL_CERTIFIED_READY_TO_PROMOTE" || status === "BASE_BACKFILL_PROMOTING") {
      const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_PLAYERS, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
      const promoted = await promoteStageRowsChunk(sql, batchId, "BASE_PASS", tickConfig.promote_rows_per_tick);
      const nextStatus = promoted.remaining_unpromoted === 0 ? "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" : "BASE_BACKFILL_PROMOTING";
      await sql`UPDATE stats_hitter.splits_batches SET status=${nextStatus}, rows_promoted=rows_promoted + ${promoted.promoted_this_tick}, promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: nextStatus, promoted, continuation_required: true };
    }
    if (status === "BASE_BACKFILL_PROMOTED_READY_TO_CLEAN" || status === "BASE_BACKFILL_CLEANING") {
      const cleaned = await cleanStageRowsChunk(sql, batchId, DEFAULT_CLEAN_ROWS_PER_TICK);
      const nextStatus = cleaned.cleanup_done ? "COMPLETED_PROMOTED_CLEANED" : "BASE_BACKFILL_CLEANING";
      await sql`UPDATE stats_hitter.splits_batches SET status=${nextStatus}, cleaned_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE cleaned_at END, finished_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE finished_at END, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "base_backfill", batch_id: batchId, status: nextStatus, cleaned, done: cleaned.cleanup_done, continuation_required: !cleaned.cleanup_done };
    }
    return { ok: true, data_ok: false, mode: "base_backfill", batch_id: batchId, status: "UNKNOWN_STATUS", real_status: status };
  } finally { await releaseBatchLock(sql, batchId, owner); }
}

async function getLockedBaseIntegrity(sql) {
  const batchRows = await sql`SELECT batch_id, status, rows_promoted, cleaned_at FROM stats_hitter.splits_batches WHERE batch_id=${LOCKED_BASE_BATCH_ID} LIMIT 1`;
  const batch = batchRows[0] || null;
  const liveRows = await sql`SELECT COUNT(*)::int AS c FROM stats_hitter.splits WHERE batch_id=${LOCKED_BASE_BATCH_ID}`;
  const dupRows = await sql`SELECT COUNT(*)::int AS c FROM (SELECT player_id, season, split_key, COUNT(*) AS n FROM stats_hitter.splits WHERE batch_id=${LOCKED_BASE_BATCH_ID} GROUP BY player_id, season, split_key HAVING COUNT(*) > 1) sub`;
  const live = liveRows[0] || {}, dup = dupRows[0] || {};
  const pass = !!batch && String(batch.status) === "COMPLETED_PROMOTED_CLEANED" && asInt(dup.c, 0) === 0 && asInt(live.c, 0) > 0;
  return { pass, required_base_batch_id: LOCKED_BASE_BATCH_ID, status: batch ? batch.status : null, rows_promoted: batch ? asInt(batch.rows_promoted, 0) : 0, live_base_rows: asInt(live.c, 0), duplicate_base_live_keys: asInt(dup.c, 0), cleaned_at: batch ? batch.cleaned_at : null };
}

async function getOrCreateDeltaState(env, sql, input) {
  const today = todayUtc();
  const batchId = `hitter_splits_delta_update_batch_${today}`;
  const existingRows = await sql`SELECT * FROM stats_hitter.splits_batches WHERE batch_id=${batchId} LIMIT 1`;
  if (existingRows[0]) return { is_new: false, batch: existingRows[0] };
  const runId = asText(input.run_id, rid("run_delta_hitter_splits"));
  const sourceSeason = DEFAULT_SOURCE_SEASON;
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_PLAYERS, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
  await sql`
    INSERT INTO stats_hitter.splits_batches (batch_id, run_id, worker_name, worker_version, mode, status, data_feed_key, source_key, source_endpoint, source_season, promote_rows_per_tick, certification_status, notes, started_at, updated_at)
    VALUES (${batchId}, ${runId}, ${WORKER_NAME}, ${VERSION}, 'delta_update', 'DELTA_MINING', ${DATA_FEED_KEY}, ${SOURCE_KEY}, ${LOCKED_SOURCE_ENDPOINT_PATTERN}, ${sourceSeason}, ${tickConfig.promote_rows_per_tick}, 'not_certified', ${`daily full-refresh delta for ${today}; base batch ${LOCKED_BASE_BATCH_ID} gate required`}, now(), now())
    ON CONFLICT (batch_id) DO NOTHING
  `;
  const rows = await sql`SELECT * FROM stats_hitter.splits_batches WHERE batch_id=${batchId} LIMIT 1`;
  return { is_new: true, batch: rows[0] };
}

async function runDeltaUpdateTick(env, sql, input) {
  const baseGate = await getLockedBaseIntegrity(sql);
  if (!baseGate.pass) return { ok: true, data_ok: false, mode: "delta_update", status: "BASE_INTEGRITY_GATE_CLOSED", base_integrity_gate: baseGate };
  const state = await getOrCreateDeltaState(env, sql, input);
  const batchId = state.batch.batch_id;
  const owner = asText(input.owner, rid("owner"));
  const lock = await acquireBatchLock(sql, batchId, owner, DEFAULT_LOCK_STALE_SECONDS);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId, lock };
  try {
    const freshRows = await sql`SELECT * FROM stats_hitter.splits_batches WHERE batch_id=${batchId} LIMIT 1`;
    const batch = freshRows[0];
    const status = String(batch.status || "");
    if (status === "COMPLETED_PROMOTED_CLEANED") {
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status, already_completed: true };
    }
    if (status === "DELTA_MINING") {
      const mined = await runMiningTick(env, sql, batch, "delta_update");
      const nextStatus = mined.done ? "DELTA_STAGED_READY_FOR_CERTIFICATION" : "DELTA_MINING";
      await sql`UPDATE stats_hitter.splits_batches SET status=${nextStatus}, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: nextStatus, mined, continuation_required: true };
    }
    if (status === "DELTA_STAGED_READY_FOR_CERTIFICATION") {
      const pre = await buildPrePromotionChecks(sql, batchId);
      if (!pre.pass) {
        await sql`UPDATE stats_hitter.splits_batches SET status='CERTIFICATION_FAILED', certification_status='DELTA_HITTER_SPLITS_CERTIFICATION_FAILED', certification_grade='DELTA_FAIL', certification_json=${JSON.stringify(pre.checks)}, updated_at=now() WHERE batch_id=${batchId}`;
        return { ok: true, data_ok: false, mode: "delta_update", batch_id: batchId, status: "CERTIFICATION_FAILED", checks: pre.checks };
      }
      await sql`UPDATE stats_hitter.splits_batches SET status='DELTA_CERTIFIED_READY_TO_PROMOTE', certification_status='DELTA_HITTER_SPLITS_CERTIFIED', certification_grade='DELTA_PASS', certification_json=${JSON.stringify(pre.checks)}, certified_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: "DELTA_CERTIFIED_READY_TO_PROMOTE", checks: pre.checks, continuation_required: true };
    }
    if (status === "DELTA_CERTIFIED_READY_TO_PROMOTE" || status === "DELTA_PROMOTING") {
      const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_PLAYERS, DEFAULT_MAX_TICK_RUNTIME_MS, DEFAULT_PROMOTE_ROWS_PER_TICK);
      const promoted = await promoteStageRowsChunk(sql, batchId, "DELTA_PASS", tickConfig.promote_rows_per_tick);
      const nextStatus = promoted.remaining_unpromoted === 0 ? "DELTA_PROMOTED_READY_TO_CLEAN" : "DELTA_PROMOTING";
      await sql`UPDATE stats_hitter.splits_batches SET status=${nextStatus}, rows_promoted=rows_promoted + ${promoted.promoted_this_tick}, promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: nextStatus, promoted, continuation_required: true };
    }
    if (status === "DELTA_PROMOTED_READY_TO_CLEAN" || status === "DELTA_CLEANING") {
      const cleaned = await cleanStageRowsChunk(sql, batchId, DEFAULT_CLEAN_ROWS_PER_TICK);
      const nextStatus = cleaned.cleanup_done ? "COMPLETED_PROMOTED_CLEANED" : "DELTA_CLEANING";
      await sql`UPDATE stats_hitter.splits_batches SET status=${nextStatus}, cleaned_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE cleaned_at END, finished_at=CASE WHEN ${cleaned.cleanup_done} THEN now() ELSE finished_at END, updated_at=now() WHERE batch_id=${batchId}`;
      return { ok: true, data_ok: true, mode: "delta_update", batch_id: batchId, status: nextStatus, cleaned, done: cleaned.cleanup_done, continuation_required: !cleaned.cleanup_done };
    }
    return { ok: true, data_ok: false, mode: "delta_update", batch_id: batchId, status: "UNKNOWN_STATUS", real_status: status };
  } finally { await releaseBatchLock(sql, batchId, owner); }
}

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
