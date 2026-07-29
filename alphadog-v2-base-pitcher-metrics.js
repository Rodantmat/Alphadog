import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-pitcher-metrics";
const VERSION = "alphadog-v2-base-pitcher-metrics-postgres-v1.0.0-day-by-day-watermark";
const JOB_KEY = "base-pitcher-metrics";
const PROFILE_ID = "pitcher_metrics_neutral_v0_3_0_base_stage";
const FORMULA_VERSION = "pitcher_metrics_formula_v0_3_0_base_stage";
const DEFAULT_SOURCE_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_PLAYERS = 50;
const DEFAULT_LOCK_STALE_SECONDS = 60;
const SNAPSHOT_CORE_WINDOWS = ["last_3_games", "last_5_games", "last_10_games", "last_20_games", "season_to_date"];
const WINDOWS = [
  { window_key: "last_3_games", window_type: "last_n_games", window_size: 3 },
  { window_key: "last_5_games", window_type: "last_n_games", window_size: 5 },
  { window_key: "last_10_games", window_type: "last_n_games", window_size: 10 },
  { window_key: "last_20_games", window_type: "last_n_games", window_size: 20 },
  { window_key: "season_to_date", window_type: "season_to_date", window_size: null }
];
// Real thresholds ported exactly from the live D1 worker's seeded config.
const THRESHOLDS = {
  minimum_batters_faced_for_ready_rate_label: 100,
  minimum_outs_recorded_for_ready_ip_rate_label: 81,
  minimum_pitches_for_ready_pitch_rate_label: 100,
  minimum_appearances_for_ready_label: 5,
  minimum_split_batters_faced_for_ready_label: 30
};

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function round(v) { return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(Number(v).toFixed(6)); }

async function getWorkerTickConfig(sql, workerName, fallbackChunk) {
  try {
    const rows = await sql`SELECT chunk_size_players FROM config.worker_tick_settings WHERE worker_name=${workerName} LIMIT 1`;
    const row = rows[0];
    return { chunk_size_players: row ? asInt(row.chunk_size_players, fallbackChunk) : fallbackChunk };
  } catch (_) { return { chunk_size_players: fallbackChunk }; }
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS stats_pitcher.metric_batches (
      batch_id TEXT PRIMARY KEY, run_id TEXT, mode TEXT, status TEXT,
      source_season INTEGER, players_total INTEGER DEFAULT 0, players_processed INTEGER DEFAULT 0,
      cursor_player_id BIGINT, rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0,
      duplicate_count INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT,
      certification_json JSONB, input_latest_game_date DATE, delta_watermark_date DATE,
      locked_by TEXT, lock_acquired_at TIMESTAMPTZ, lock_expires_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT now(), notes TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stats_pitcher.metric_stage (
      stage_id TEXT PRIMARY KEY, batch_id TEXT, run_id TEXT, player_id BIGINT, season INTEGER,
      metric_window TEXT, metric_key TEXT, metric_family TEXT, metric_value DOUBLE PRECISION, metric_text_value TEXT,
      numerator DOUBLE PRECISION, denominator DOUBLE PRECISION, source_start_date DATE, source_end_date DATE,
      input_log_row_count INTEGER, input_split_row_count INTEGER, input_latest_game_date DATE,
      reliability_label TEXT, missing_data_reason TEXT, row_status TEXT, ingestion_mode TEXT,
      raw_input_summary_json JSONB, metric_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(batch_id, player_id, season, metric_window, metric_key)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stats_pitcher.metric_snapshot_batches (
      snapshot_batch_id TEXT PRIMARY KEY, source_metric_batch_id TEXT, run_id TEXT, mode TEXT, status TEXT,
      source_stage_rows INTEGER DEFAULT 0, source_stage_players INTEGER DEFAULT 0, snapshot_rows INTEGER DEFAULT 0,
      rows_promoted INTEGER DEFAULT 0, duplicate_count INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT,
      certification_json JSONB, started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ, promoted_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT now(), notes TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stats_pitcher.metric_snapshot_stage (
      snapshot_id TEXT PRIMARY KEY, snapshot_batch_id TEXT, source_metric_batch_id TEXT, run_id TEXT,
      player_id BIGINT, season INTEGER, metric_window TEXT, config_profile_id TEXT, formula_version TEXT,
      games_count DOUBLE PRECISION, appearances_count DOUBLE PRECISION, starts_count DOUBLE PRECISION,
      innings_pitched_sum DOUBLE PRECISION, outs_recorded_sum DOUBLE PRECISION, batters_faced_sum DOUBLE PRECISION,
      pitches_sum DOUBLE PRECISION, strikes_sum DOUBLE PRECISION, hits_allowed_sum DOUBLE PRECISION,
      runs_allowed_sum DOUBLE PRECISION, earned_runs_sum DOUBLE PRECISION, walks_allowed_sum DOUBLE PRECISION,
      strikeouts_sum DOUBLE PRECISION, home_runs_allowed_sum DOUBLE PRECISION,
      era_calculated DOUBLE PRECISION, whip_calculated DOUBLE PRECISION, k_rate_calculated DOUBLE PRECISION,
      bb_rate_calculated DOUBLE PRECISION, hr_rate_calculated DOUBLE PRECISION, k_minus_bb_rate_calculated DOUBLE PRECISION,
      pitches_per_out_calculated DOUBLE PRECISION, strikes_per_pitch_calculated DOUBLE PRECISION, innings_per_appearance_calculated DOUBLE PRECISION,
      sample_size_label TEXT, vl_json JSONB, vr_json JSONB, metrics_json JSONB, metadata_json JSONB, review_flags_json JSONB, lineage_json JSONB,
      row_status TEXT, certification_status TEXT, certification_grade TEXT, promoted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pitcher_metric_stage_batch ON stats_pitcher.metric_stage (batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pitcher_metric_snapshot_stage_batch ON stats_pitcher.metric_snapshot_stage (snapshot_batch_id)`;
  return { ok: true };
}

// ---- Real pitcher formulas, ported exactly from the live D1 worker ----
function reliability(denom, threshold) {
  if (denom !== null && denom === 0) return "ZERO_DENOMINATOR";
  if (denom !== null && threshold !== null && denom < threshold) return "LOW_SAMPLE";
  return "READY";
}
function sampleBucket(appearancesCount, startsCount, outsRecordedSum) {
  const apps = Math.max(1, appearancesCount);
  const opa = outsRecordedSum / apps;
  if (startsCount > 0 || opa >= 15) return "high_opa_or_start_sample";
  if (opa < 9) return "low_opa_reliever_like_sample";
  return "middle_opa_swing_review_sample";
}
function windowRowsFor(logRowsAsc, window) {
  if (window.window_type === "season_to_date") return logRowsAsc.slice();
  const size = Number(window.window_size || 0);
  if (!size) return logRowsAsc.slice();
  return logRowsAsc.slice(Math.max(0, logRowsAsc.length - size));
}
function aggregateLogs(rows) {
  const a = { appearances_count: rows.length, starts_count: 0, outs_recorded_sum: 0, batters_faced_sum: 0, pitches_sum: 0, strikes_sum: 0, hits_allowed_sum: 0, runs_allowed_sum: 0, earned_runs_sum: 0, walks_allowed_sum: 0, strikeouts_sum: 0, home_runs_allowed_sum: 0, rfi_hit_count_sum: 0, rfi_games_with_data: 0 };
  for (const r of rows) {
    a.starts_count += String(r.role || "").toLowerCase().includes("start") ? 1 : 0;
    a.outs_recorded_sum += num(r.outs_recorded); a.batters_faced_sum += num(r.batters_faced);
    a.pitches_sum += num(r.pitches); a.strikes_sum += num(r.strikes); a.hits_allowed_sum += num(r.hits_allowed);
    a.runs_allowed_sum += num(r.runs_allowed); a.earned_runs_sum += num(r.earned_runs); a.walks_allowed_sum += num(r.walks_allowed);
    a.strikeouts_sum += num(r.strikeouts); a.home_runs_allowed_sum += num(r.home_runs_allowed);
    if (r.rfi_hit !== undefined && r.rfi_hit !== null) { a.rfi_hit_count_sum += num(r.rfi_hit); a.rfi_games_with_data += 1; }
  }
  a.games_count = rows.length;
  a.innings_pitched_sum = a.outs_recorded_sum / 3;
  return a;
}
function metricRowsForWindow(playerId, season, windowKey, rows, splitByKey, latestGameDate, batchId, runId, sourceStartDate, sourceEndDate, ingestionMode) {
  const a = aggregateLogs(rows);
  const bucket = sampleBucket(a.appearances_count, a.starts_count, a.outs_recorded_sum);
  const baseMeta = { batch_id: batchId, run_id: runId, player_id: playerId, season, metric_window: windowKey, source_start_date: sourceStartDate, source_end_date: sourceEndDate, input_log_row_count: rows.length, input_latest_game_date: latestGameDate, ingestion_mode: ingestionMode };
  const out = [];
  function add(metric_key, family, value, numerator = null, denominator = null, extra = {}) {
    out.push({ ...baseMeta, metric_key, metric_family: family, metric_value: round(value), metric_text_value: extra.metric_text_value || null, numerator: round(numerator), denominator: round(denominator), reliability_label: extra.reliability_label || "READY", missing_data_reason: extra.missing_data_reason || (rows.length === 0 ? "NO_LOG_ROWS_IN_WINDOW" : null), row_status: extra.row_status || (extra.missing_data_reason ? "review_flag" : "base_stage_staged"), raw_input_summary_json: { sample_bucket: bucket, games_count: a.games_count }, metric_json: { ...extra } });
  }
  add("games_count", "direct_aggregate", a.games_count, a.games_count, null);
  add("appearances_count", "direct_aggregate", a.appearances_count, a.appearances_count, null);
  add("starts_count", "role_readiness", a.starts_count, a.starts_count, null);
  add("innings_pitched_sum", "direct_aggregate", a.innings_pitched_sum, a.outs_recorded_sum, 3);
  for (const key of ["outs_recorded_sum", "batters_faced_sum", "pitches_sum", "strikes_sum", "hits_allowed_sum", "runs_allowed_sum", "earned_runs_sum", "walks_allowed_sum", "strikeouts_sum", "home_runs_allowed_sum", "rfi_hit_count_sum", "rfi_games_with_data"]) add(key, "direct_aggregate", a[key], a[key], null, a[key] === undefined ? {} : (key === "rfi_hit_count_sum" || key === "rfi_games_with_data" ? { missing_data_reason: a.rfi_games_with_data <= 0 ? "NO_EXPANSION_FIRST_INNING_CONTEXT_MINED_YET" : null, row_status: a.rfi_games_with_data <= 0 ? "review_flag" : "base_stage_staged" } : {}));
  const bfLabel = reliability(a.batters_faced_sum, THRESHOLDS.minimum_batters_faced_for_ready_rate_label);
  const outsLabel = reliability(a.outs_recorded_sum, THRESHOLDS.minimum_outs_recorded_for_ready_ip_rate_label);
  const pitchLabel = reliability(a.pitches_sum, THRESHOLDS.minimum_pitches_for_ready_pitch_rate_label);
  const appLabel = reliability(a.appearances_count, THRESHOLDS.minimum_appearances_for_ready_label);
  add("era_calculated", "denominator_safe_rate", a.outs_recorded_sum ? (a.earned_runs_sum * 27) / a.outs_recorded_sum : null, a.earned_runs_sum * 27, a.outs_recorded_sum, { reliability_label: outsLabel, missing_data_reason: a.outs_recorded_sum <= 0 ? "ZERO_DENOMINATOR_OUTS_RECORDED" : null });
  add("whip_calculated", "denominator_safe_rate", a.innings_pitched_sum ? (a.walks_allowed_sum + a.hits_allowed_sum) / a.innings_pitched_sum : null, a.walks_allowed_sum + a.hits_allowed_sum, a.innings_pitched_sum, { reliability_label: outsLabel, missing_data_reason: a.outs_recorded_sum <= 0 ? "ZERO_DENOMINATOR_OUTS_RECORDED" : null });
  add("k_rate_calculated", "denominator_safe_rate", a.batters_faced_sum ? a.strikeouts_sum / a.batters_faced_sum : null, a.strikeouts_sum, a.batters_faced_sum, { reliability_label: bfLabel, missing_data_reason: a.batters_faced_sum <= 0 ? "ZERO_DENOMINATOR_BATTERS_FACED" : null });
  add("bb_rate_calculated", "denominator_safe_rate", a.batters_faced_sum ? a.walks_allowed_sum / a.batters_faced_sum : null, a.walks_allowed_sum, a.batters_faced_sum, { reliability_label: bfLabel, missing_data_reason: a.batters_faced_sum <= 0 ? "ZERO_DENOMINATOR_BATTERS_FACED" : null });
  add("hr_rate_calculated", "denominator_safe_rate", a.batters_faced_sum ? a.home_runs_allowed_sum / a.batters_faced_sum : null, a.home_runs_allowed_sum, a.batters_faced_sum, { reliability_label: bfLabel, missing_data_reason: a.batters_faced_sum <= 0 ? "ZERO_DENOMINATOR_BATTERS_FACED" : null });
  add("k_minus_bb_rate_calculated", "denominator_safe_rate", a.batters_faced_sum ? (a.strikeouts_sum - a.walks_allowed_sum) / a.batters_faced_sum : null, a.strikeouts_sum - a.walks_allowed_sum, a.batters_faced_sum, { reliability_label: bfLabel, missing_data_reason: a.batters_faced_sum <= 0 ? "ZERO_DENOMINATOR_BATTERS_FACED" : null });
  add("pitches_per_out_calculated", "denominator_safe_rate", a.outs_recorded_sum ? a.pitches_sum / a.outs_recorded_sum : null, a.pitches_sum, a.outs_recorded_sum, { reliability_label: outsLabel, missing_data_reason: a.outs_recorded_sum <= 0 ? "ZERO_DENOMINATOR_OUTS_RECORDED" : null });
  add("strikes_per_pitch_calculated", "denominator_safe_rate", a.pitches_sum ? a.strikes_sum / a.pitches_sum : null, a.strikes_sum, a.pitches_sum, { reliability_label: pitchLabel, missing_data_reason: a.pitches_sum <= 0 ? "ZERO_DENOMINATOR_PITCHES" : null });
  add("innings_per_appearance_calculated", "denominator_safe_rate", a.appearances_count ? a.innings_pitched_sum / a.appearances_count : null, a.innings_pitched_sum, a.appearances_count, { reliability_label: appLabel, missing_data_reason: a.appearances_count <= 0 ? "ZERO_DENOMINATOR_APPEARANCES" : null });
  add("role_sample_bucket", "role_readiness", null, a.appearances_count, null, { metric_text_value: bucket, reliability_label: "REVIEW_ONLY", row_status: "review_flag", missing_data_reason: "ROLE_BUCKET_SAMPLE_METADATA_ONLY" });
  add("sample_size_label", "sample_label", null, a.games_count, null, { metric_text_value: bucket });
  // Split pass-through: only fields that genuinely exist on stats_pitcher.splits (no era/whip/earned_runs at split level — honestly not fabricated).
  for (const side of ["vl", "vr"]) {
    const sp = splitByKey[side];
    const splitBf = sp ? num(sp.batters_faced) : null;
    const splitLabel = sp ? (splitBf < THRESHOLDS.minimum_split_batters_faced_for_ready_label ? "LOW_SAMPLE" : "SOURCE_PASS_THROUGH") : "MISSING_INPUT";
    for (const [key, col] of [["ops_against", "ops_against"], ["avg_against", "avg_against"], ["obp_against", "obp_against"], ["slg_against", "slg_against"]]) {
      add(`${side}_${key}`, "split_pass_through", sp ? (sp[col] === null || sp[col] === undefined ? null : Number(sp[col])) : null, splitBf, null, { reliability_label: splitLabel, missing_data_reason: sp ? null : `MISSING_SPLIT_SIDE_${side}`, row_status: sp ? "base_stage_staged" : "review_flag" });
    }
  }
  return out;
}

async function getPlayerUniverse(sql, season) {
  const rows = await sql`SELECT DISTINCT player_id FROM stats_pitcher.game_logs WHERE season=${season} ORDER BY player_id`;
  return rows.map(r => Number(r.player_id));
}
async function loadChunkSourceRows(sql, playerIds, season) {
  if (!playerIds.length) return { logsByPlayer: new Map(), splitsByPlayer: new Map() };
  const logRows = await sql`SELECT * FROM stats_pitcher.game_logs WHERE season=${season} AND player_id IN ${sql(playerIds)} ORDER BY player_id ASC, game_date ASC, game_pk ASC`;
  const splitRows = await sql`SELECT * FROM stats_pitcher.splits WHERE season=${season} AND split_key IN ('vl','vr') AND ingestion_mode IS NOT NULL AND player_id IN ${sql(playerIds)} ORDER BY player_id ASC, split_key ASC`;
  const rfiRows = await sql`SELECT pitcher_id, game_pk, rfi_sl_more_hit FROM context.first_inning_pitcher WHERE pitcher_id IN ${sql(playerIds)}`; // retry deploy touch 2
  const rfiByKey = new Map();
  for (const r of rfiRows) rfiByKey.set(`${r.pitcher_id}|${r.game_pk}`, r.rfi_sl_more_hit);
  for (const r of logRows) { const key = `${r.player_id}|${r.game_pk}`; if (rfiByKey.has(key)) r.rfi_hit = rfiByKey.get(key); }
  const logsByPlayer = new Map(), splitsByPlayer = new Map();
  for (const r of logRows) { const k = Number(r.player_id); if (!logsByPlayer.has(k)) logsByPlayer.set(k, []); logsByPlayer.get(k).push(r); }
  for (const r of splitRows) { const k = Number(r.player_id); if (!splitsByPlayer.has(k)) splitsByPlayer.set(k, {}); splitsByPlayer.get(k)[r.split_key] = r; }
  return { logsByPlayer, splitsByPlayer };
}

async function insertStageRowsBulk(sql, batchId, runId, ingestionMode, rows) {
  if (!rows.length) return 0;
  const seen = new Set();
  const dedupedRows = [];
  for (const r of rows) {
    const key = `${r.player_id}_${r.season}_${r.metric_window}_${r.metric_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRows.push(r);
  }
  const values = dedupedRows.map(r => ({
    stage_id: `${batchId}_${r.player_id}_${r.season}_${r.metric_window}_${r.metric_key}`,
    batch_id: batchId, run_id: runId, player_id: r.player_id, season: r.season, metric_window: r.metric_window, metric_key: r.metric_key,
    metric_family: r.metric_family, metric_value: r.metric_value, metric_text_value: r.metric_text_value, numerator: r.numerator, denominator: r.denominator,
    source_start_date: r.source_start_date || null, source_end_date: r.source_end_date || null,
    input_log_row_count: r.input_log_row_count, input_split_row_count: r.input_split_row_count || 0, input_latest_game_date: r.input_latest_game_date || null,
    reliability_label: r.reliability_label, missing_data_reason: r.missing_data_reason, row_status: r.row_status, ingestion_mode: r.ingestion_mode,
    raw_input_summary_json: JSON.stringify(r.raw_input_summary_json), metric_json: JSON.stringify(r.metric_json)
  }));
  const CHUNK = 300;
  let inserted = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    await sql`
      INSERT INTO stats_pitcher.metric_stage ${sql(slice, "stage_id","batch_id","run_id","player_id","season","metric_window","metric_key","metric_family","metric_value","metric_text_value","numerator","denominator","source_start_date","source_end_date","input_log_row_count","input_split_row_count","input_latest_game_date","reliability_label","missing_data_reason","row_status","ingestion_mode","raw_input_summary_json","metric_json")}
      ON CONFLICT (batch_id, player_id, season, metric_window, metric_key) DO UPDATE SET
        metric_value=excluded.metric_value, metric_text_value=excluded.metric_text_value, numerator=excluded.numerator, denominator=excluded.denominator,
        reliability_label=excluded.reliability_label, missing_data_reason=excluded.missing_data_reason, row_status=excluded.row_status,
        raw_input_summary_json=excluded.raw_input_summary_json, metric_json=excluded.metric_json, updated_at=now()
    `;
    inserted += slice.length;
  }
  return inserted;
}

async function acquireBatchLock(sql, table, idCol, batchId, owner, staleSeconds) {
  const rows = await sql`SELECT locked_by, lock_expires_at FROM ${sql(table)} WHERE ${sql(idCol)}=${batchId} LIMIT 1`;
  const row = rows[0] || null;
  const nowMs = Date.now();
  const lockedBy = row && row.locked_by ? String(row.locked_by) : null;
  const expMs = row && row.lock_expires_at ? new Date(row.lock_expires_at).getTime() : NaN;
  const expired = !Number.isFinite(expMs) || expMs <= nowMs;
  if (lockedBy && !expired && lockedBy !== owner) return { ok: false, reason: "batch_lock_busy", locked_by: lockedBy };
  await sql`UPDATE ${sql(table)} SET locked_by=${owner}, lock_acquired_at=now(), lock_expires_at=now() + make_interval(secs => ${staleSeconds}), updated_at=now() WHERE ${sql(idCol)}=${batchId}`;
  return { ok: true };
}
async function releaseBatchLock(sql, table, idCol, batchId, owner) {
  await sql`UPDATE ${sql(table)} SET locked_by=NULL, lock_acquired_at=NULL, lock_expires_at=NULL WHERE ${sql(idCol)}=${batchId} AND locked_by=${owner}`;
}

function buildWindowRows(playerId, season, logs, splitByKey, latestGameDate, batchId, runId, ingestionMode) {
  const stageRows = [];
  for (const w of WINDOWS) {
    const wRows = windowRowsFor(logs, w);
    const startDate = wRows.length ? wRows[0].game_date : null;
    const endDate = wRows.length ? wRows[wRows.length - 1].game_date : null;
    stageRows.push(...metricRowsForWindow(playerId, season, w.window_key, wRows, w.window_key === "season_to_date" ? splitByKey : {}, latestGameDate, batchId, runId, startDate, endDate, ingestionMode));
  }
  return stageRows;
}

// ---- Mode 1: base_rebuild_stage_only ----
async function runBaseRebuildStageOnly(sql, input) {
  const season = asInt(input.source_season, DEFAULT_SOURCE_SEASON);
  const batchId = "pitcher_metrics_base_backfill_singleton";
  const runId = asText(input.run_id, rid("run_pitcher_metrics_base"));
  const owner = asText(input.owner, rid("owner"));
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_PLAYERS);

  await sql`
    INSERT INTO stats_pitcher.metric_batches (batch_id, run_id, mode, status, source_season, notes)
    VALUES (${batchId}, ${runId}, 'base_rebuild_stage_only', 'MINING', ${season}, 'Postgres-native base rebuild stage-only; stage rows are permanent, never drained.')
    ON CONFLICT (batch_id) DO NOTHING
  `;
  const lock = await acquireBatchLock(sql, "stats_pitcher.metric_batches", "batch_id", batchId, owner, DEFAULT_LOCK_STALE_SECONDS);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId };
  try {
    const freshRows = await sql`SELECT * FROM stats_pitcher.metric_batches WHERE batch_id=${batchId} LIMIT 1`;
    const batch = freshRows[0];
    if (batch.status === "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") {
      return { ok: true, data_ok: true, mode: "base_rebuild_stage_only", batch_id: batchId, status: batch.status, already_completed: true };
    }
    let universe;
    if (batch.players_total && Number(batch.players_total) > 0) {
      universe = await getPlayerUniverse(sql, season);
    } else {
      universe = await getPlayerUniverse(sql, season);
      await sql`UPDATE stats_pitcher.metric_batches SET players_total=${universe.length}, updated_at=now() WHERE batch_id=${batchId}`;
    }
    const cursor = batch.cursor_player_id ? Number(batch.cursor_player_id) : 0;
    const remaining = universe.filter(pid => pid > cursor);
    const chunk = remaining.slice(0, tickConfig.chunk_size_players);
    let stagedThisTick = 0, lastPid = cursor;
    if (chunk.length > 0) {
      const { logsByPlayer, splitsByPlayer } = await loadChunkSourceRows(sql, chunk, season);
      const stageRows = [];
      for (const playerId of chunk) {
        const logs = logsByPlayer.get(playerId) || [];
        const splitByKey = splitsByPlayer.get(playerId) || {};
        const latestGameDate = logs.length ? logs[logs.length - 1].game_date : null;
        stageRows.push(...buildWindowRows(playerId, season, logs, splitByKey, latestGameDate, batchId, runId, "base_rebuild_stage_only"));
        lastPid = playerId;
      }
      stagedThisTick = await insertStageRowsBulk(sql, batchId, runId, "base_rebuild_stage_only", stageRows);
    }
    const newOffset = chunk.length ? lastPid : cursor;
    const done = remaining.length <= chunk.length;
    const stagedTotalRows = await sql`SELECT COUNT(*)::int AS c FROM stats_pitcher.metric_stage WHERE batch_id=${batchId}`;
    const nextStatus = done ? "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION" : "MINING";
    if (done) {
      const cutoffRows = await sql`SELECT MAX(game_date) AS d FROM stats_pitcher.game_logs WHERE season=${season}`;
      const cutoffDate = cutoffRows[0].d;
      await sql`UPDATE stats_pitcher.metric_batches SET status=${nextStatus}, cursor_player_id=${newOffset}, players_processed=players_processed + ${chunk.length}, rows_staged=${stagedTotalRows[0].c}, input_latest_game_date=${cutoffDate}, delta_watermark_date=${cutoffDate}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
    } else {
      await sql`UPDATE stats_pitcher.metric_batches SET status=${nextStatus}, cursor_player_id=${newOffset}, players_processed=players_processed + ${chunk.length}, rows_staged=${stagedTotalRows[0].c}, updated_at=now() WHERE batch_id=${batchId}`;
    }
    return { ok: true, data_ok: true, mode: "base_rebuild_stage_only", batch_id: batchId, status: nextStatus, players_this_tick: chunk.length, rows_staged_this_tick: stagedThisTick, rows_staged_total: stagedTotalRows[0].c, players_total: universe.length, continuation_required: !done };
  } finally { await releaseBatchLock(sql, "stats_pitcher.metric_batches", "batch_id", batchId, owner); }
}

function compactStageRows(stageRows) {
  const baseByKey = new Map(), splitByPlayer = new Map();
  for (const r of stageRows) {
    const playerId = Number(r.player_id), season = Number(r.season);
    const m = String(r.metric_key || "");
    const side = m.startsWith("vl_") ? "vl" : (m.startsWith("vr_") ? "vr" : null);
    if (side) {
      const key = `${playerId}|${season}`;
      if (!splitByPlayer.has(key)) splitByPlayer.set(key, { vl: {}, vr: {}, flags: [] });
      const ps = splitByPlayer.get(key);
      const stripped = m.replace(/^vl_/, "").replace(/^vr_/, "");
      ps[side][stripped] = r.metric_value;
      if (r.row_status === "review_flag") ps.flags.push({ metric_key: r.metric_key, missing_data_reason: r.missing_data_reason });
      continue;
    }
    if (!SNAPSHOT_CORE_WINDOWS.includes(String(r.metric_window))) continue;
    const key = `${playerId}|${season}|${r.metric_window}`;
    if (!baseByKey.has(key)) baseByKey.set(key, { player_id: playerId, season, metric_window: String(r.metric_window), metrics: {}, flags: [], metadata: { input_latest_game_date: r.input_latest_game_date, source_start_date: r.source_start_date, source_end_date: r.source_end_date, input_log_row_count: r.input_log_row_count } });
    const b = baseByKey.get(key);
    b.metrics[r.metric_key] = r.metric_text_value !== null && r.metric_text_value !== undefined ? r.metric_text_value : r.metric_value;
    if (r.row_status === "review_flag") b.flags.push({ metric_key: r.metric_key, missing_data_reason: r.missing_data_reason });
  }
  const rowsOut = [];
  for (const b of baseByKey.values()) {
    const split = splitByPlayer.get(`${b.player_id}|${b.season}`) || { vl: {}, vr: {}, flags: [] };
    const flags = [...b.flags, ...(split.flags || [])];
    const m = b.metrics;
    rowsOut.push({
      player_id: b.player_id, season: b.season, metric_window: b.metric_window,
      games_count: m.games_count ?? null, appearances_count: m.appearances_count ?? null, starts_count: m.starts_count ?? null,
      innings_pitched_sum: m.innings_pitched_sum ?? null, outs_recorded_sum: m.outs_recorded_sum ?? null, batters_faced_sum: m.batters_faced_sum ?? null,
      pitches_sum: m.pitches_sum ?? null, strikes_sum: m.strikes_sum ?? null, hits_allowed_sum: m.hits_allowed_sum ?? null,
      runs_allowed_sum: m.runs_allowed_sum ?? null, earned_runs_sum: m.earned_runs_sum ?? null, walks_allowed_sum: m.walks_allowed_sum ?? null,
      strikeouts_sum: m.strikeouts_sum ?? null, home_runs_allowed_sum: m.home_runs_allowed_sum ?? null, rfi_hit_count_sum: m.rfi_hit_count_sum ?? null, rfi_games_with_data: m.rfi_games_with_data ?? null,
      era_calculated: m.era_calculated ?? null, whip_calculated: m.whip_calculated ?? null, k_rate_calculated: m.k_rate_calculated ?? null,
      bb_rate_calculated: m.bb_rate_calculated ?? null, hr_rate_calculated: m.hr_rate_calculated ?? null, k_minus_bb_rate_calculated: m.k_minus_bb_rate_calculated ?? null,
      pitches_per_out_calculated: m.pitches_per_out_calculated ?? null, strikes_per_pitch_calculated: m.strikes_per_pitch_calculated ?? null, innings_per_appearance_calculated: m.innings_per_appearance_calculated ?? null,
      sample_size_label: m.sample_size_label || null, vl_json: JSON.stringify(split.vl || {}), vr_json: JSON.stringify(split.vr || {}),
      metrics_json: JSON.stringify(m), metadata_json: JSON.stringify(b.metadata), review_flags_json: JSON.stringify(flags),
      row_status: flags.length ? "snapshot_stage_review" : "snapshot_stage_staged"
    });
  }
  return rowsOut;
}

// ---- Mode 2: snapshot_prep_stage_only ----
async function runSnapshotPrepStageOnly(sql, input) {
  const baseBatch = await sql`SELECT * FROM stats_pitcher.metric_batches WHERE batch_id='pitcher_metrics_base_backfill_singleton' LIMIT 1`;
  if (!baseBatch[0] || baseBatch[0].status !== "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") {
    return { ok: false, data_ok: false, mode: "snapshot_prep_stage_only", status: "BLOCKED_SOURCE_BASE_STAGE_NOT_COMPLETED" };
  }
  const sourceMetricBatchId = baseBatch[0].batch_id;
  const runId = asText(input.run_id, rid("run_pitcher_metrics_snapshot_prep"));
  const snapshotBatchId = "pitcher_metrics_snapshot_prep_singleton";
  await sql`
    INSERT INTO stats_pitcher.metric_snapshot_batches (snapshot_batch_id, source_metric_batch_id, run_id, mode, status, notes)
    VALUES (${snapshotBatchId}, ${sourceMetricBatchId}, ${runId}, 'snapshot_prep_stage_only', 'RUNNING', 'Compacted rows only; stage retained permanently for repair.')
    ON CONFLICT (snapshot_batch_id) DO NOTHING
  `;
  const stageRows = await sql`SELECT * FROM stats_pitcher.metric_stage WHERE batch_id=${sourceMetricBatchId} ORDER BY player_id, season, metric_window, metric_key`;
  const compacted = compactStageRows(stageRows);
  const snapshotRows = compacted.map(r => ({
    snapshot_id: rid("pitcher_metric_snapshot"), snapshot_batch_id: snapshotBatchId, source_metric_batch_id: sourceMetricBatchId, run_id: runId,
    config_profile_id: PROFILE_ID, formula_version: FORMULA_VERSION,
    lineage_json: JSON.stringify({ source_metric_batch_id: sourceMetricBatchId, snapshot_batch_id: snapshotBatchId, worker_version: VERSION, no_live_promotion: true }),
    certification_status: "snapshot_stage_not_promoted", certification_grade: "SNAPSHOT_STAGE", ...r
  }));
  const CHUNK = 250;
  let written = 0;
  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    const slice = snapshotRows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO stats_pitcher.metric_snapshot_stage ${sql(slice, "snapshot_id","snapshot_batch_id","source_metric_batch_id","run_id","player_id","season","metric_window","config_profile_id","formula_version","games_count","appearances_count","starts_count","innings_pitched_sum","outs_recorded_sum","batters_faced_sum","pitches_sum","strikes_sum","hits_allowed_sum","runs_allowed_sum","earned_runs_sum","walks_allowed_sum","strikeouts_sum","home_runs_allowed_sum","rfi_hit_count_sum","rfi_games_with_data","era_calculated","whip_calculated","k_rate_calculated","bb_rate_calculated","hr_rate_calculated","k_minus_bb_rate_calculated","pitches_per_out_calculated","strikes_per_pitch_calculated","innings_per_appearance_calculated","sample_size_label","vl_json","vr_json","metrics_json","metadata_json","review_flags_json","lineage_json","row_status","certification_status","certification_grade")}
      ON CONFLICT (snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version) DO UPDATE SET
        games_count=excluded.games_count, era_calculated=excluded.era_calculated, whip_calculated=excluded.whip_calculated,
        k_rate_calculated=excluded.k_rate_calculated, bb_rate_calculated=excluded.bb_rate_calculated, hr_rate_calculated=excluded.hr_rate_calculated,
        rfi_hit_count_sum=excluded.rfi_hit_count_sum, rfi_games_with_data=excluded.rfi_games_with_data,
        sample_size_label=excluded.sample_size_label, vl_json=excluded.vl_json, vr_json=excluded.vr_json,
        metrics_json=excluded.metrics_json, metadata_json=excluded.metadata_json, review_flags_json=excluded.review_flags_json, row_status=excluded.row_status, updated_at=now()
    `;
    written += slice.length;
  }
  const dup = await sql`SELECT COUNT(*)::int AS c FROM (SELECT player_id, season, metric_window, config_profile_id, formula_version, COUNT(*) n FROM stats_pitcher.metric_snapshot_stage WHERE snapshot_batch_id=${snapshotBatchId} GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1) sub`;
  const status = dup[0].c > 0 ? "BLOCKED_SNAPSHOT_PREP_DUPLICATE_KEYS" : "COMPLETED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION";
  await sql`UPDATE stats_pitcher.metric_snapshot_batches SET status=${status}, source_stage_rows=${stageRows.length}, snapshot_rows=${written}, duplicate_count=${dup[0].c}, finished_at=now(), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId}`;
  return { ok: dup[0].c === 0, data_ok: dup[0].c === 0, mode: "snapshot_prep_stage_only", snapshot_batch_id: snapshotBatchId, source_metric_batch_id: sourceMetricBatchId, status, snapshot_rows: written, duplicate_count: dup[0].c };
}

const LIVE_COLS = ["player_id","season","metric_window","games_count","appearances_count","starts_count","innings_pitched_sum","outs_recorded_sum","batters_faced_sum","pitches_sum","strikes_sum","hits_allowed_sum","runs_allowed_sum","earned_runs_sum","walks_allowed_sum","strikeouts_sum","home_runs_allowed_sum","rfi_hit_count_sum","rfi_games_with_data","era_calculated","whip_calculated","k_rate_calculated","bb_rate_calculated","hr_rate_calculated","k_minus_bb_rate_calculated","pitches_per_out_calculated","strikes_per_pitch_calculated","innings_per_appearance_calculated","sample_size_label","snapshot_batch_id","source_metric_batch_id","config_profile_id","formula_version","vl_json","vr_json","metrics_json","metadata_json","review_flags_json"];

// ---- Mode 3: snapshot_delta_gate — bulk first-promote + ongoing repair, no clean ----
async function runSnapshotDeltaGate(sql, input) {
  const snapshotBatchId = input.snapshot_batch_id || "pitcher_metrics_snapshot_prep_singleton";
  const batch = await sql`SELECT * FROM stats_pitcher.metric_snapshot_batches WHERE snapshot_batch_id=${snapshotBatchId} LIMIT 1`;
  if (!batch[0] || !String(batch[0].status).startsWith("COMPLETED")) {
    return { ok: false, data_ok: false, mode: "snapshot_delta_gate", status: "BLOCKED_SNAPSHOT_STAGE_BATCH_NOT_COMPLETED" };
  }
  const missingCountRows = await sql`
    SELECT COUNT(*)::int AS c FROM stats_pitcher.metric_snapshot_stage s
    LEFT JOIN stats_pitcher.metric_snapshots l ON l.player_id=s.player_id AND l.season=s.season AND l.metric_window=s.metric_window AND l.config_profile_id=s.config_profile_id AND l.formula_version=s.formula_version
    WHERE s.snapshot_batch_id=${snapshotBatchId} AND l.snapshot_id IS NULL
  `;
  const missingBefore = missingCountRows[0].c;
  let rowsPromoted = 0;
  if (missingBefore > 0) {
    const colsCsv = LIVE_COLS.join(", ");
    const selectCols = LIVE_COLS.map(c => "s." + c).join(", ");
    const res = await sql.unsafe(`
      INSERT INTO stats_pitcher.metric_snapshots (snapshot_id, ${colsCsv}, certification_status, certification_grade, promoted_at, created_at, updated_at)
      SELECT s.snapshot_id, ${selectCols}, 'snapshot_live_promoted_from_certified_stage', 'SNAPSHOT_PROMOTION_PASS', now(), now(), now()
      FROM stats_pitcher.metric_snapshot_stage s
      LEFT JOIN stats_pitcher.metric_snapshots l ON l.player_id=s.player_id AND l.season=s.season AND l.metric_window=s.metric_window AND l.config_profile_id=s.config_profile_id AND l.formula_version=s.formula_version
      WHERE s.snapshot_batch_id=$1 AND l.snapshot_id IS NULL
      ON CONFLICT (player_id, season, metric_window, config_profile_id, formula_version) DO NOTHING
      RETURNING 1
    `, [snapshotBatchId]);
    rowsPromoted = res.length;
    await sql`UPDATE stats_pitcher.metric_snapshot_stage SET promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId} AND promoted_at IS NULL`;
  }
  const missingAfterRows = await sql`
    SELECT COUNT(*)::int AS c FROM stats_pitcher.metric_snapshot_stage s
    LEFT JOIN stats_pitcher.metric_snapshots l ON l.player_id=s.player_id AND l.season=s.season AND l.metric_window=s.metric_window AND l.config_profile_id=s.config_profile_id AND l.formula_version=s.formula_version
    WHERE s.snapshot_batch_id=${snapshotBatchId} AND l.snapshot_id IS NULL
  `;
  const missingAfter = missingAfterRows[0].c;
  const status = missingBefore === 0 ? "DELTA_PITCHER_METRICS_SNAPSHOT_NOOP_CURRENT" : (missingAfter === 0 ? "DELTA_PITCHER_METRICS_SNAPSHOT_REPAIRED_FROM_RETAINED_STAGE" : "DELTA_PITCHER_METRICS_SNAPSHOT_REPAIR_INCOMPLETE");
  await sql`UPDATE stats_pitcher.metric_snapshot_batches SET rows_promoted=rows_promoted + ${rowsPromoted}, promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId}`;
  return { ok: missingAfter === 0, data_ok: missingAfter === 0, mode: "snapshot_delta_gate", snapshot_batch_id: snapshotBatchId, status, missing_live_rows_before: missingBefore, missing_live_rows_after: missingAfter, rows_promoted: rowsPromoted };
}

// ---- Mode 4: delta_recalculate_affected_players — day-by-day watermark advancement, one real day per tick ----
// Real, explicit day-completeness gate: identical to hitter-metrics' fix - a candidate date is
// only eligible once every real game on it is genuinely final/available_for_stats (or a
// legitimate exception - postponed/suspended/cancelled). Replaces the old naive MAX(game_date)
// check, which only confirmed *some* data existed, not that the whole day was done.
async function isDateCertifiedComplete(sql, officialDate) {
  const rows = await sql`SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_available_for_stats OR is_postponed OR is_suspended OR is_cancelled THEN 1 ELSE 0 END)::int AS ready FROM calendar.game_calendar WHERE official_date=${officialDate}`;
  const r = rows[0];
  if (!r || Number(r.total) === 0) return { ready: false, reason: "NO_CALENDAR_DATA_FOR_DATE" };
  return { ready: Number(r.total) === Number(r.ready || 0), reason: null, total: Number(r.total), ready_games: Number(r.ready || 0) };
}
async function isUpstreamMiningComplete(sql) {
  // Real cascade guard: verifies no pitcher game-log mining batch is stuck mid-progress before
  // metrics trusts MAX(game_date) as proof a date is fully, safely available. This is the exact
  // gap that let pitcher-metrics advance to a date using only ~47% of that day's pitchers mined.
  const rows = await sql`SELECT COUNT(*)::int AS c, array_agg(batch_id) FILTER (WHERE true) AS batch_ids, array_agg(status) FILTER (WHERE true) AS statuses FROM stats_pitcher.game_log_batches WHERE status NOT IN ('COMPLETED_PROMOTED_CLEANED')`;
  const r = rows[0];
  return { ready: Number(r.c) === 0, non_terminal_batch_count: Number(r.c), non_terminal_batch_ids: r.batch_ids || [], non_terminal_statuses: r.statuses || [] };
}
async function getNextDeltaDay(sql, season) {
  const baseBatch = await sql`SELECT delta_watermark_date FROM stats_pitcher.metric_batches WHERE batch_id='pitcher_metrics_base_backfill_singleton' LIMIT 1`;
  const watermark = baseBatch[0] ? baseBatch[0].delta_watermark_date : null;
  if (!watermark) return { ok: false, reason: "NO_WATERMARK_BASE_NOT_COMPLETED" };
  const miningGate = await isUpstreamMiningComplete(sql);
  if (!miningGate.ready) return { ok: true, no_data_yet: true, watermark, blocked_reason: "UPSTREAM_PITCHER_GAME_LOG_MINING_NOT_TERMINAL", mining_gate: miningGate };
  const latestRows = await sql`SELECT MAX(game_date) AS d FROM stats_pitcher.game_logs WHERE season=${season}`;
  const latestAvailable = latestRows[0].d;
  const nextDateRows = await sql`SELECT (${watermark}::date + interval '1 day')::date AS d`;
  const nextDate = nextDateRows[0].d;
  if (!latestAvailable || nextDate > latestAvailable) return { ok: true, no_data_yet: true, watermark, next_date: nextDate, latest_available: latestAvailable };
  const completeness = await isDateCertifiedComplete(sql, nextDate);
  if (!completeness.ready) return { ok: true, no_data_yet: true, watermark, next_date: nextDate, latest_available: latestAvailable, blocked_reason: completeness.reason || "GAMES_NOT_YET_FINAL_OR_EXCEPTION", calendar_check: completeness };
  return { ok: true, no_data_yet: false, watermark, next_date: nextDate, latest_available: latestAvailable, calendar_check: completeness };
}
async function getPlayersForDay(sql, season, dayDate) {
  const ids = new Set();
  const logPlayers = await sql`SELECT DISTINCT player_id FROM stats_pitcher.game_logs WHERE season=${season} AND game_date=${dayDate}`;
  for (const row of logPlayers) ids.add(Number(row.player_id));
  const splitPlayers = await sql`SELECT DISTINCT player_id FROM stats_pitcher.splits WHERE season=${season} AND ingestion_mode IS NOT NULL AND updated_at::date=${dayDate}`;
  for (const row of splitPlayers) ids.add(Number(row.player_id));
  return Array.from(ids).sort((a, b) => a - b);
}

async function runDeltaRecalculateAffectedPlayers(sql, input) {
  const season = asInt(input.source_season, DEFAULT_SOURCE_SEASON);
  const baseGate = await sql`SELECT status FROM stats_pitcher.metric_batches WHERE batch_id='pitcher_metrics_base_backfill_singleton' LIMIT 1`;
  if (!baseGate[0] || baseGate[0].status !== "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") {
    return { ok: false, data_ok: false, mode: "delta_recalculate_affected_players", status: "BLOCKED_NO_COMPLETED_BASE_BATCH" };
  }
  const dayInfo = await getNextDeltaDay(sql, season);
  if (!dayInfo.ok) return { ok: false, data_ok: false, mode: "delta_recalculate_affected_players", status: "BLOCKED_NO_WATERMARK" };
  if (dayInfo.no_data_yet) {
    return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", status: "DELTA_PITCHER_METRICS_NOOP_NO_NEW_DAY_AVAILABLE", watermark: dayInfo.watermark, next_date: dayInfo.next_date, latest_available: dayInfo.latest_available, continuation_required: false };
  }
  const dayDate = dayInfo.next_date;
  const runId = asText(input.run_id, rid("run_pitcher_metrics_delta"));
  const batchId = `pitcher_metrics_delta_batch_${dayDate}`;
  const snapshotBatchId = `pitcher_metrics_delta_snapshot_${dayDate}`;
  const affectedIds = await getPlayersForDay(sql, season, dayDate);

  if (!affectedIds.length) {
    await sql`UPDATE stats_pitcher.metric_batches SET delta_watermark_date=${dayDate}, updated_at=now() WHERE batch_id='pitcher_metrics_base_backfill_singleton'`;
    return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", status: "DELTA_PITCHER_METRICS_NOOP_NO_PLAYERS_FOR_DAY", day_processed: dayDate, affected_player_count: 0, watermark_advanced_to: dayDate, continuation_required: dayInfo.latest_available > dayDate };
  }

  await sql`
    INSERT INTO stats_pitcher.metric_batches (batch_id, run_id, mode, status, source_season, notes)
    VALUES (${batchId}, ${runId}, 'delta_recalculate_affected_players', 'RUNNING', ${season}, ${`day-by-day delta for ${dayDate}; permanent stage retention`})
    ON CONFLICT (batch_id) DO NOTHING
  `;
  const { logsByPlayer, splitsByPlayer } = await loadChunkSourceRows(sql, affectedIds, season);
  const stageRows = [];
  for (const playerId of affectedIds) {
    const logs = logsByPlayer.get(playerId) || [];
    const splitByKey = splitsByPlayer.get(playerId) || {};
    const latestGameDate = logs.length ? logs[logs.length - 1].game_date : null;
    stageRows.push(...buildWindowRows(playerId, season, logs, splitByKey, latestGameDate, batchId, runId, "delta_recalculate_affected_players"));
  }
  const staged = await insertStageRowsBulk(sql, batchId, runId, "delta_recalculate_affected_players", stageRows);

  const sourceRows = await sql`SELECT * FROM stats_pitcher.metric_stage WHERE batch_id=${batchId} ORDER BY player_id, season, metric_window, metric_key`;
  const compacted = compactStageRows(sourceRows);
  const snapshotRows = compacted.map(r => ({
    snapshot_id: rid("pitcher_metric_snapshot"), snapshot_batch_id: snapshotBatchId, source_metric_batch_id: batchId, run_id: runId,
    config_profile_id: PROFILE_ID, formula_version: FORMULA_VERSION,
    lineage_json: JSON.stringify({ source_metric_batch_id: batchId, snapshot_batch_id: snapshotBatchId, worker_version: VERSION, mode: "delta_recalculate_affected_players" }),
    certification_status: "delta_recalc_snapshot_stage_not_promoted", certification_grade: "DELTA_RECALC_STAGE", ...r
  }));
  await sql`INSERT INTO stats_pitcher.metric_snapshot_batches (snapshot_batch_id, source_metric_batch_id, run_id, mode, status, notes) VALUES (${snapshotBatchId}, ${batchId}, ${runId}, 'delta_recalculate_affected_players', 'RUNNING', 'day-by-day delta snapshot') ON CONFLICT (snapshot_batch_id) DO NOTHING`;
  const CHUNK = 250;
  let snapshotWritten = 0;
  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    const slice = snapshotRows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO stats_pitcher.metric_snapshot_stage ${sql(slice, "snapshot_id","snapshot_batch_id","source_metric_batch_id","run_id","player_id","season","metric_window","config_profile_id","formula_version","games_count","appearances_count","starts_count","innings_pitched_sum","outs_recorded_sum","batters_faced_sum","pitches_sum","strikes_sum","hits_allowed_sum","runs_allowed_sum","earned_runs_sum","walks_allowed_sum","strikeouts_sum","home_runs_allowed_sum","rfi_hit_count_sum","rfi_games_with_data","era_calculated","whip_calculated","k_rate_calculated","bb_rate_calculated","hr_rate_calculated","k_minus_bb_rate_calculated","pitches_per_out_calculated","strikes_per_pitch_calculated","innings_per_appearance_calculated","sample_size_label","vl_json","vr_json","metrics_json","metadata_json","review_flags_json","lineage_json","row_status","certification_status","certification_grade")}
      ON CONFLICT (snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version) DO UPDATE SET metrics_json=excluded.metrics_json, updated_at=now()
    `;
    snapshotWritten += slice.length;
  }
  const colsCsv = LIVE_COLS.join(", ");
  const selectCols = LIVE_COLS.map(c => "s." + c).join(", ");
  const promoted = await sql.unsafe(`
    INSERT INTO stats_pitcher.metric_snapshots (snapshot_id, ${colsCsv}, certification_status, certification_grade, promoted_at, created_at, updated_at)
    SELECT s.snapshot_id, ${selectCols}, 'delta_recalculated_affected_player', 'DELTA_RECALC_PROMOTED_RETAINED_STAGE', now(), now(), now()
    FROM stats_pitcher.metric_snapshot_stage s WHERE s.snapshot_batch_id=$1
    ON CONFLICT (player_id, season, metric_window, config_profile_id, formula_version) DO UPDATE SET
      games_count=excluded.games_count, era_calculated=excluded.era_calculated, whip_calculated=excluded.whip_calculated,
      k_rate_calculated=excluded.k_rate_calculated, bb_rate_calculated=excluded.bb_rate_calculated, hr_rate_calculated=excluded.hr_rate_calculated,
      rfi_hit_count_sum=excluded.rfi_hit_count_sum, rfi_games_with_data=excluded.rfi_games_with_data,
      sample_size_label=excluded.sample_size_label, vl_json=excluded.vl_json, vr_json=excluded.vr_json,
      metrics_json=excluded.metrics_json, review_flags_json=excluded.review_flags_json, certification_status=excluded.certification_status, certification_grade=excluded.certification_grade,
      promoted_at=now(), updated_at=now()
    RETURNING 1
  `, [snapshotBatchId]);
  await sql`UPDATE stats_pitcher.metric_snapshot_stage SET promoted_at=COALESCE(promoted_at, now()) WHERE snapshot_batch_id=${snapshotBatchId}`;
  await sql`UPDATE stats_pitcher.metric_snapshot_batches SET status='COMPLETED_DELTA_PITCHER_METRICS_AFFECTED_RECALC', snapshot_rows=${snapshotWritten}, rows_promoted=${promoted.length}, finished_at=now(), promoted_at=now(), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId}`;
  await sql`UPDATE stats_pitcher.metric_batches SET status='COMPLETED_DELTA_PITCHER_METRICS_AFFECTED_RECALC', rows_staged=${staged}, rows_promoted=${promoted.length}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
  await sql`UPDATE stats_pitcher.metric_batches SET delta_watermark_date=${dayDate}, updated_at=now() WHERE batch_id='pitcher_metrics_base_backfill_singleton'`;
  return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", batch_id: batchId, snapshot_batch_id: snapshotBatchId, status: "COMPLETED_DELTA_PITCHER_METRICS_AFFECTED_RECALC", day_processed: dayDate, watermark_advanced_to: dayDate, affected_player_count: affectedIds.length, rows_staged: staged, rows_promoted: promoted.length, continuation_required: dayInfo.latest_available > dayDate };
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
        const mode = asText(inputJson.mode || input.mode, "base_rebuild_stage_only");
        let result;
        if (mode === "snapshot_prep_stage_only") result = await runSnapshotPrepStageOnly(sql, input);
        else if (mode === "snapshot_delta_gate") result = await runSnapshotDeltaGate(sql, input);
        else if (mode === "delta_recalculate_affected_players") result = await runDeltaRecalculateAffectedPlayers(sql, input);
        else result = await runBaseRebuildStageOnly(sql, input);
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
