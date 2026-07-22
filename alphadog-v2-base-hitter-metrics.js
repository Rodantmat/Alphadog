import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-hitter-metrics";
const VERSION = "alphadog-v2-base-hitter-metrics-postgres-v1.0.0-5-stage-faithful-port";
const JOB_KEY = "base-hitter-metrics";
const PROFILE_ID = "hitter_metrics_neutral_v0_3_0_stage_only";
const FORMULA_VERSION = "hitter_metrics_formula_v0_3_0_stage_only";
const DATA_FEED_KEY = "derived_hitter_metrics_v0_3_1_base_stage_performance_tune";
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
const THRESHOLDS = {
  min_games_sample_strong: 10, min_games_sample_usable: 5, min_games_sample_thin: 3, min_games_sample_tiny: 1,
  split_pa_sample_strong: 50, split_pa_sample_usable: 25, split_pa_sample_tiny: 10
};

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function safeDivide(n, d) { const nn = Number(n), dd = Number(d); if (!Number.isFinite(nn) || !Number.isFinite(dd) || dd <= 0) return null; const out = nn / dd; return Number.isFinite(out) ? out : null; }
function todayUtc() { return new Date().toISOString().slice(0, 10); }

async function getWorkerTickConfig(sql, workerName, fallbackChunk) {
  try {
    const rows = await sql`SELECT chunk_size_players FROM config.worker_tick_settings WHERE worker_name=${workerName} LIMIT 1`;
    const row = rows[0];
    return { chunk_size_players: row ? asInt(row.chunk_size_players, fallbackChunk) : fallbackChunk };
  } catch (_) { return { chunk_size_players: fallbackChunk }; }
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS stats_hitter.metric_batches (
      batch_id TEXT PRIMARY KEY, run_id TEXT, mode TEXT, status TEXT,
      source_season INTEGER, players_total INTEGER DEFAULT 0, players_processed INTEGER DEFAULT 0,
      cursor_player_id BIGINT, rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0,
      duplicate_count INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT,
      certification_json JSONB, input_latest_game_date DATE, input_latest_split_snapshot_date DATE,
      locked_by TEXT, lock_acquired_at TIMESTAMPTZ, lock_expires_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT now(), notes TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stats_hitter.metric_stage (
      stage_id TEXT PRIMARY KEY, batch_id TEXT, run_id TEXT, player_id BIGINT, season INTEGER,
      metric_window TEXT, metric_key TEXT, metric_family TEXT, metric_value DOUBLE PRECISION, metric_text_value TEXT,
      numerator DOUBLE PRECISION, denominator DOUBLE PRECISION, source_start_date DATE, source_end_date DATE,
      source_snapshot_date DATE, input_log_row_count INTEGER, input_split_row_count INTEGER, input_latest_game_date DATE,
      reliability_label TEXT, missing_data_reason TEXT, row_status TEXT, ingestion_mode TEXT,
      raw_input_summary_json JSONB, metric_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(batch_id, player_id, season, metric_window, metric_key)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stats_hitter.metric_snapshot_batches (
      snapshot_batch_id TEXT PRIMARY KEY, source_metric_batch_id TEXT, run_id TEXT, mode TEXT, status TEXT,
      source_stage_rows INTEGER DEFAULT 0, source_stage_players INTEGER DEFAULT 0, snapshot_rows INTEGER DEFAULT 0,
      rows_promoted INTEGER DEFAULT 0, duplicate_count INTEGER DEFAULT 0, certification_status TEXT, certification_grade TEXT,
      certification_json JSONB, started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ, promoted_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT now(), notes TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS stats_hitter.metric_snapshot_stage (
      snapshot_id TEXT PRIMARY KEY, snapshot_batch_id TEXT, source_metric_batch_id TEXT, run_id TEXT,
      player_id BIGINT, season INTEGER, metric_window TEXT, config_profile_id TEXT, formula_version TEXT,
      games_count DOUBLE PRECISION, pa_sum DOUBLE PRECISION, ab_sum DOUBLE PRECISION, hits_sum DOUBLE PRECISION,
      singles_sum DOUBLE PRECISION, doubles_sum DOUBLE PRECISION, triples_sum DOUBLE PRECISION, home_runs_sum DOUBLE PRECISION,
      walks_sum DOUBLE PRECISION, strikeouts_sum DOUBLE PRECISION, runs_sum DOUBLE PRECISION, rbi_sum DOUBLE PRECISION,
      stolen_bases_sum DOUBLE PRECISION, total_bases_derived_sum DOUBLE PRECISION,
      batting_average DOUBLE PRECISION, slugging_percentage DOUBLE PRECISION, strikeout_rate DOUBLE PRECISION,
      walk_rate DOUBLE PRECISION, hr_rate DOUBLE PRECISION, tb_per_pa DOUBLE PRECISION, h_per_ab DOUBLE PRECISION,
      sample_size_label TEXT, vs_left_json JSONB, vs_right_json JSONB, metrics_json JSONB, audit_json JSONB,
      metadata_json JSONB, review_flags_json JSONB, lineage_json JSONB,
      row_status TEXT, certification_status TEXT, certification_grade TEXT, promoted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_hitter_metric_stage_batch ON stats_hitter.metric_stage (batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hitter_metric_snapshot_stage_batch ON stats_hitter.metric_snapshot_stage (snapshot_batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hitter_metric_snapshot_stage_lookup ON stats_hitter.metric_snapshot_stage (player_id, season, metric_window)`;
  return { ok: true };
}

// ---- Real formula logic, ported exactly from the live D1 worker ----
function sampleLabelFromGames(gamesCount) {
  if (gamesCount >= THRESHOLDS.min_games_sample_strong) return "sample_strong";
  if (gamesCount >= THRESHOLDS.min_games_sample_usable) return "sample_usable";
  if (gamesCount >= THRESHOLDS.min_games_sample_thin) return "sample_thin";
  if (gamesCount >= THRESHOLDS.min_games_sample_tiny) return "sample_tiny";
  return "sample_none";
}
function splitLabelFromPa(pa) {
  if (pa >= THRESHOLDS.split_pa_sample_strong) return "split_strong";
  if (pa >= THRESHOLDS.split_pa_sample_usable) return "split_usable";
  if (pa >= THRESHOLDS.split_pa_sample_tiny) return "split_tiny";
  return "split_none";
}
function windowRowsFor(logRowsAsc, window) {
  if (window.window_type === "season_to_date") return logRowsAsc.slice();
  const size = Number(window.window_size || 0);
  if (!size) return logRowsAsc.slice();
  return logRowsAsc.slice(Math.max(0, logRowsAsc.length - size));
}
function sumWindow(rows) {
  const s = { games: new Set(), pa: 0, ab: 0, hits: 0, singles: 0, doubles: 0, triples: 0, home_runs: 0, walks: 0, strikeouts: 0, runs: 0, rbi: 0, stolen_bases: 0, tb_source: 0, tb_derived: 0 };
  for (const r of rows) {
    if (r.game_pk !== null && r.game_pk !== undefined) s.games.add(String(r.game_pk));
    s.pa += num(r.pa); s.ab += num(r.ab); s.hits += num(r.hits);
    s.singles += num(r.singles); s.doubles += num(r.doubles); s.triples += num(r.triples);
    s.home_runs += num(r.home_runs); s.walks += num(r.walks); s.strikeouts += num(r.strikeouts);
    s.runs += num(r.runs); s.rbi += num(r.rbi); s.stolen_bases += num(r.stolen_bases);
    s.tb_source += num(r.total_bases);
    s.tb_derived += num(r.singles) + 2 * num(r.doubles) + 3 * num(r.triples) + 4 * num(r.home_runs);
  }
  return { games_count: s.games.size, pa_sum: s.pa, ab_sum: s.ab, hits_sum: s.hits, singles_sum: s.singles, doubles_sum: s.doubles, triples_sum: s.triples, home_runs_sum: s.home_runs, walks_sum: s.walks, strikeouts_sum: s.strikeouts, runs_sum: s.runs, rbi_sum: s.rbi, stolen_bases_sum: s.stolen_bases, total_bases_source_sum: s.tb_source, total_bases_derived_sum: s.tb_derived };
}
function metricRowsForWindow(playerId, season, windowKey, rows, splitRows, latestGameDate, batchId, runId, sourceStartDate, sourceEndDate, ingestionMode) {
  const s = sumWindow(rows);
  const rel = sampleLabelFromGames(s.games_count);
  const tbMismatch = Math.abs(s.total_bases_source_sum - s.total_bases_derived_sum) > 0.000001;
  const baseMeta = { batch_id: batchId, run_id: runId, player_id: playerId, season, metric_window: windowKey, source_start_date: sourceStartDate, source_end_date: sourceEndDate, input_log_row_count: rows.length, input_split_row_count: splitRows.length, input_latest_game_date: latestGameDate, ingestion_mode: ingestionMode, reliability_label: rel };
  const out = [];
  function add(metric_key, family, value, numerator = null, denominator = null, extra = {}) {
    const missing = extra.missing_data_reason || (rows.length === 0 ? "NO_LOG_ROWS_IN_WINDOW" : (tbMismatch && metric_key.includes("total_bases") ? "TOTAL_BASES_SOURCE_DERIVED_MISMATCH" : null));
    out.push({ ...baseMeta, metric_key, metric_family: family, metric_value: value, metric_text_value: extra.metric_text_value || null, numerator, denominator, missing_data_reason: missing, row_status: extra.row_status || (missing ? "review_flag" : "base_stage_staged"), raw_input_summary_json: { games_count: s.games_count, window_key: windowKey, tb_source_sum: s.total_bases_source_sum, tb_derived_sum: s.total_bases_derived_sum, tb_mismatch: tbMismatch }, metric_json: { ...extra, base_rebuild_stage_only: true } });
  }
  add("games_count", "sample_size", s.games_count, s.games_count, null);
  for (const key of ["pa_sum", "ab_sum", "hits_sum", "singles_sum", "doubles_sum", "triples_sum", "home_runs_sum", "walks_sum", "strikeouts_sum", "runs_sum", "rbi_sum", "stolen_bases_sum", "total_bases_source_sum", "total_bases_derived_sum"]) add(key, "direct_aggregate", s[key], s[key], null);
  add("batting_average", "rate", safeDivide(s.hits_sum, s.ab_sum), s.hits_sum, s.ab_sum, s.ab_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_AB", row_status: "review_flag" } : {});
  add("slugging_percentage", "rate", safeDivide(s.total_bases_derived_sum, s.ab_sum), s.total_bases_derived_sum, s.ab_sum, s.ab_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_AB", row_status: "review_flag" } : {});
  add("strikeout_rate", "rate", safeDivide(s.strikeouts_sum, s.pa_sum), s.strikeouts_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("walk_rate", "rate", safeDivide(s.walks_sum, s.pa_sum), s.walks_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("hr_rate", "rate", safeDivide(s.home_runs_sum, s.pa_sum), s.home_runs_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("tb_per_pa", "rate", safeDivide(s.total_bases_derived_sum, s.pa_sum), s.total_bases_derived_sum, s.pa_sum, s.pa_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_PA", row_status: "review_flag" } : {});
  add("h_per_ab", "rate", safeDivide(s.hits_sum, s.ab_sum), s.hits_sum, s.ab_sum, s.ab_sum <= 0 ? { missing_data_reason: "DENOMINATOR_ZERO_AB", row_status: "review_flag" } : {});
  add("h_bb_per_pa_proxy", "rate_proxy", safeDivide(s.hits_sum + s.walks_sum, s.pa_sum), s.hits_sum + s.walks_sum, s.pa_sum, { proxy_only: true, not_true_obp: true, missing_data_reason: s.pa_sum <= 0 ? "DENOMINATOR_ZERO_PA" : "H_BB_PER_PA_PROXY_NOT_TRUE_OBP", row_status: "review_flag" });
  add("sample_size_label", "sample_label", null, s.games_count, null, { metric_text_value: rel, row_status: "base_stage_staged" });
  return out;
}
function splitMetricRows(playerId, season, splitRows, logRowsLen, latestGameDate, batchId, runId, ingestionMode) {
  const out = [];
  const have = new Set(splitRows.map(r => String(r.split_key || "")));
  const missingSides = ["vl", "vr"].filter(s => !have.has(s));
  for (const split of splitRows.filter(r => ["vl", "vr"].includes(String(r.split_key)))) {
    const splitKey = String(split.split_key);
    const label = splitLabelFromPa(num(split.pa));
    const baseMeta = { batch_id: batchId, run_id: runId, player_id: playerId, season, metric_window: splitKey, input_log_row_count: logRowsLen, input_split_row_count: splitRows.length, input_latest_game_date: latestGameDate, ingestion_mode: ingestionMode, reliability_label: label };
    function add(metric_key, family, value, numerator = null, text = null) {
      out.push({ ...baseMeta, metric_key: `${splitKey}_${metric_key}`, metric_family: family, metric_value: value, metric_text_value: text, numerator, denominator: null, raw_input_summary_json: { split_key: splitKey, split_pa: num(split.pa), missing_sides: missingSides }, metric_json: { source_pass_through: true, base_rebuild_stage_only: true }, missing_data_reason: missingSides.length ? `MISSING_SPLIT_SIDE_${missingSides.join("_")}` : null, row_status: missingSides.length ? "review_flag" : "base_stage_staged" });
    }
    add("split_pa", "split_context", num(split.pa), num(split.pa));
    add("split_ab", "split_context", num(split.ab), num(split.ab));
    add("split_hits", "split_context", num(split.hits), num(split.hits));
    add("split_home_runs", "split_context", num(split.home_runs), num(split.home_runs));
    add("split_walks", "split_context", num(split.walks), num(split.walks));
    add("split_strikeouts", "split_context", num(split.strikeouts), num(split.strikeouts));
    add("split_avg", "split_context_source_rate", split.avg === null || split.avg === undefined ? null : Number(split.avg));
    add("split_obp", "split_context_source_rate", split.obp === null || split.obp === undefined ? null : Number(split.obp));
    add("split_slg", "split_context_source_rate", split.slg === null || split.slg === undefined ? null : Number(split.slg));
    add("split_ops", "split_context_source_rate", split.ops === null || split.ops === undefined ? null : Number(split.ops));
    add("split_babip", "split_context_source_rate", split.babip === null || split.babip === undefined ? null : Number(split.babip));
    add("split_sample_label", "sample_label", null, num(split.pa), label);
  }
  return out;
}

async function getPlayerUniverse(sql, season) {
  const rows = await sql`SELECT DISTINCT player_id FROM stats_hitter.game_logs WHERE season=${season} ORDER BY player_id`;
  return rows.map(r => Number(r.player_id));
}
async function loadChunkSourceRows(sql, playerIds, season) {
  if (!playerIds.length) return { logsByPlayer: new Map(), splitsByPlayer: new Map() };
  const logRows = await sql`SELECT * FROM stats_hitter.game_logs WHERE season=${season} AND player_id IN ${sql(playerIds)} ORDER BY player_id ASC, game_date ASC, game_pk ASC`;
  const splitRows = await sql`SELECT * FROM stats_hitter.splits WHERE season=${season} AND split_key IN ('vl','vr') AND ingestion_mode IS NOT NULL AND player_id IN ${sql(playerIds)} ORDER BY player_id ASC, split_key ASC`;
  const logsByPlayer = new Map(), splitsByPlayer = new Map();
  for (const r of logRows) { const k = Number(r.player_id); if (!logsByPlayer.has(k)) logsByPlayer.set(k, []); logsByPlayer.get(k).push(r); }
  for (const r of splitRows) { const k = Number(r.player_id); if (!splitsByPlayer.has(k)) splitsByPlayer.set(k, []); splitsByPlayer.get(k).push(r); }
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
    source_start_date: r.source_start_date || null, source_end_date: r.source_end_date || null, source_snapshot_date: null,
    input_log_row_count: r.input_log_row_count, input_split_row_count: r.input_split_row_count, input_latest_game_date: r.input_latest_game_date || null,
    reliability_label: r.reliability_label, missing_data_reason: r.missing_data_reason, row_status: r.row_status, ingestion_mode: r.ingestion_mode,
    raw_input_summary_json: JSON.stringify(r.raw_input_summary_json), metric_json: JSON.stringify(r.metric_json)
  }));
  const CHUNK = 300;
  let inserted = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    await sql`
      INSERT INTO stats_hitter.metric_stage ${sql(slice, "stage_id","batch_id","run_id","player_id","season","metric_window","metric_key","metric_family","metric_value","metric_text_value","numerator","denominator","source_start_date","source_end_date","source_snapshot_date","input_log_row_count","input_split_row_count","input_latest_game_date","reliability_label","missing_data_reason","row_status","ingestion_mode","raw_input_summary_json","metric_json")}
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

// ---- Mode 1: base_rebuild_stage_only — stages ALL players, never touches live table ----
async function runBaseRebuildStageOnly(sql, input) {
  const season = asInt(input.source_season, DEFAULT_SOURCE_SEASON);
  const batchId = "hitter_metrics_base_backfill_singleton";
  const runId = asText(input.run_id, rid("run_hitter_metrics_base"));
  const owner = asText(input.owner, rid("owner"));
  const tickConfig = await getWorkerTickConfig(sql, WORKER_NAME, DEFAULT_CHUNK_SIZE_PLAYERS);

  await sql`
    INSERT INTO stats_hitter.metric_batches (batch_id, run_id, mode, status, source_season, notes)
    VALUES (${batchId}, ${runId}, 'base_rebuild_stage_only', 'MINING', ${season}, 'Postgres-native base rebuild stage-only; stage rows are permanent, never drained.')
    ON CONFLICT (batch_id) DO NOTHING
  `;
  const lock = await acquireBatchLock(sql, "stats_hitter.metric_batches", "batch_id", batchId, owner, DEFAULT_LOCK_STALE_SECONDS);
  if (!lock.ok) return { ok: true, data_ok: false, status: "BATCH_LOCK_BUSY", batch_id: batchId };
  try {
    const freshRows = await sql`SELECT * FROM stats_hitter.metric_batches WHERE batch_id=${batchId} LIMIT 1`;
    const batch = freshRows[0];
    if (batch.status === "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") {
      return { ok: true, data_ok: true, mode: "base_rebuild_stage_only", batch_id: batchId, status: batch.status, already_completed: true };
    }
    let universe;
    if (batch.players_total && Number(batch.players_total) > 0) {
      universe = await getPlayerUniverse(sql, season);
    } else {
      universe = await getPlayerUniverse(sql, season);
      await sql`UPDATE stats_hitter.metric_batches SET players_total=${universe.length}, updated_at=now() WHERE batch_id=${batchId}`;
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
        const splits = splitsByPlayer.get(playerId) || [];
        const latestGameDate = logs.length ? logs[logs.length - 1].game_date : null;
        for (const w of WINDOWS) {
          const wRows = windowRowsFor(logs, w);
          const startDate = wRows.length ? wRows[0].game_date : null;
          const endDate = wRows.length ? wRows[wRows.length - 1].game_date : null;
          stageRows.push(...metricRowsForWindow(playerId, season, w.window_key, wRows, splits, latestGameDate, batchId, runId, startDate, endDate, "base_rebuild_stage_only"));
        }
        stageRows.push(...splitMetricRows(playerId, season, splits, logs.length, latestGameDate, batchId, runId, "base_rebuild_stage_only"));
        lastPid = playerId;
      }
      stagedThisTick = await insertStageRowsBulk(sql, batchId, runId, "base_rebuild_stage_only", stageRows);
    }
    const newOffset = chunk.length ? lastPid : cursor;
    const done = remaining.length <= chunk.length;
    const stagedTotalRows = await sql`SELECT COUNT(*)::int AS c FROM stats_hitter.metric_stage WHERE batch_id=${batchId}`;
    const nextStatus = done ? "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION" : "MINING";
    if (done) {
      const cutoffRows = await sql`SELECT MAX(game_date) AS d FROM stats_hitter.game_logs WHERE season=${season}`;
      const cutoffDate = cutoffRows[0].d;
      await sql`UPDATE stats_hitter.metric_batches SET status=${nextStatus}, cursor_player_id=${newOffset}, players_processed=players_processed + ${chunk.length}, rows_staged=${stagedTotalRows[0].c}, input_latest_game_date=${cutoffDate}, delta_watermark_date=${cutoffDate}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
    } else {
      await sql`UPDATE stats_hitter.metric_batches SET status=${nextStatus}, cursor_player_id=${newOffset}, players_processed=players_processed + ${chunk.length}, rows_staged=${stagedTotalRows[0].c}, updated_at=now() WHERE batch_id=${batchId}`;
    }
    return { ok: true, data_ok: true, mode: "base_rebuild_stage_only", batch_id: batchId, status: nextStatus, players_this_tick: chunk.length, rows_staged_this_tick: stagedThisTick, rows_staged_total: stagedTotalRows[0].c, players_total: universe.length, continuation_required: !done };
  } finally { await releaseBatchLock(sql, "stats_hitter.metric_batches", "batch_id", batchId, owner); }
}

// ---- Mode 2: snapshot_prep_stage_only — compacts base stage rows into one row per player/window ----
async function runSnapshotPrepStageOnly(sql, input) {
  const baseBatch = await sql`SELECT * FROM stats_hitter.metric_batches WHERE batch_id='hitter_metrics_base_backfill_singleton' LIMIT 1`;
  if (!baseBatch[0] || baseBatch[0].status !== "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") {
    return { ok: false, data_ok: false, mode: "snapshot_prep_stage_only", status: "BLOCKED_SOURCE_BASE_STAGE_NOT_COMPLETED" };
  }
  const sourceMetricBatchId = baseBatch[0].batch_id;
  const runId = asText(input.run_id, rid("run_hitter_metrics_snapshot_prep"));
  const snapshotBatchId = "hitter_metrics_snapshot_prep_singleton";
  await sql`
    INSERT INTO stats_hitter.metric_snapshot_batches (snapshot_batch_id, source_metric_batch_id, run_id, mode, status, notes)
    VALUES (${snapshotBatchId}, ${sourceMetricBatchId}, ${runId}, 'snapshot_prep_stage_only', 'RUNNING', 'Compacted rows only; stage retained permanently for repair.')
    ON CONFLICT (snapshot_batch_id) DO NOTHING
  `;
  const stageRows = await sql`SELECT * FROM stats_hitter.metric_stage WHERE batch_id=${sourceMetricBatchId} ORDER BY player_id, season, metric_window, metric_key`;
  const baseByKey = new Map(), splitByPlayer = new Map();
  for (const r of stageRows) {
    const playerId = Number(r.player_id), season = Number(r.season);
    const side = r.metric_window === "vl" || r.metric_window === "vr" ? r.metric_window : null;
    if (side) {
      const key = `${playerId}|${season}`;
      if (!splitByPlayer.has(key)) splitByPlayer.set(key, { vl: {}, vr: {}, flags: [] });
      const ps = splitByPlayer.get(key);
      const stripped = String(r.metric_key || "").replace(/^vl_/, "").replace(/^vr_/, "");
      ps[side][stripped] = r.metric_text_value !== null && r.metric_text_value !== undefined ? r.metric_text_value : r.metric_value;
      if (r.row_status === "review_flag" || r.missing_data_reason) ps.flags.push({ metric_window: r.metric_window, metric_key: r.metric_key, missing_data_reason: r.missing_data_reason });
      continue;
    }
    if (!SNAPSHOT_CORE_WINDOWS.includes(String(r.metric_window))) continue;
    const key = `${playerId}|${season}|${r.metric_window}`;
    if (!baseByKey.has(key)) baseByKey.set(key, { player_id: playerId, season, metric_window: String(r.metric_window), metrics: {}, flags: [], metadata: { input_latest_game_date: r.input_latest_game_date, source_start_date: r.source_start_date, source_end_date: r.source_end_date, input_log_row_count: r.input_log_row_count, input_split_row_count: r.input_split_row_count } });
    const b = baseByKey.get(key);
    b.metrics[r.metric_key] = r.metric_text_value !== null && r.metric_text_value !== undefined ? r.metric_text_value : r.metric_value;
    if (r.row_status === "review_flag" || r.missing_data_reason) b.flags.push({ metric_key: r.metric_key, missing_data_reason: r.missing_data_reason });
  }
  const snapshotRows = [];
  for (const b of baseByKey.values()) {
    const split = splitByPlayer.get(`${b.player_id}|${b.season}`) || { vl: {}, vr: {}, flags: [] };
    const flags = [...b.flags, ...(split.flags || [])];
    const m = b.metrics;
    snapshotRows.push({
      snapshot_id: rid("hitter_metric_snapshot"), snapshot_batch_id: snapshotBatchId, source_metric_batch_id: sourceMetricBatchId, run_id: runId,
      player_id: b.player_id, season: b.season, metric_window: b.metric_window, config_profile_id: PROFILE_ID, formula_version: FORMULA_VERSION,
      games_count: m.games_count ?? null, pa_sum: m.pa_sum ?? null, ab_sum: m.ab_sum ?? null, hits_sum: m.hits_sum ?? null, singles_sum: m.singles_sum ?? null,
      doubles_sum: m.doubles_sum ?? null, triples_sum: m.triples_sum ?? null, home_runs_sum: m.home_runs_sum ?? null, walks_sum: m.walks_sum ?? null,
      strikeouts_sum: m.strikeouts_sum ?? null, runs_sum: m.runs_sum ?? null, rbi_sum: m.rbi_sum ?? null, stolen_bases_sum: m.stolen_bases_sum ?? null,
      total_bases_derived_sum: m.total_bases_derived_sum ?? null, batting_average: m.batting_average ?? null, slugging_percentage: m.slugging_percentage ?? null,
      strikeout_rate: m.strikeout_rate ?? null, walk_rate: m.walk_rate ?? null, hr_rate: m.hr_rate ?? null, tb_per_pa: m.tb_per_pa ?? null, h_per_ab: m.h_per_ab ?? null,
      sample_size_label: m.sample_size_label || null, vs_left_json: JSON.stringify(split.vl || {}), vs_right_json: JSON.stringify(split.vr || {}),
      metrics_json: JSON.stringify(m), audit_json: JSON.stringify({ h_bb_per_pa_proxy: m.h_bb_per_pa_proxy ?? null, total_bases_source_sum: m.total_bases_source_sum ?? null }),
      metadata_json: JSON.stringify(b.metadata), review_flags_json: JSON.stringify(flags),
      lineage_json: JSON.stringify({ source_metric_batch_id: sourceMetricBatchId, snapshot_batch_id: snapshotBatchId, worker_version: VERSION, no_live_promotion: true }),
      row_status: flags.length ? "snapshot_stage_review" : "snapshot_stage_staged", certification_status: "snapshot_stage_not_promoted", certification_grade: "SNAPSHOT_STAGE"
    });
  }
  const CHUNK = 250;
  let written = 0;
  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    const slice = snapshotRows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO stats_hitter.metric_snapshot_stage ${sql(slice, "snapshot_id","snapshot_batch_id","source_metric_batch_id","run_id","player_id","season","metric_window","config_profile_id","formula_version","games_count","pa_sum","ab_sum","hits_sum","singles_sum","doubles_sum","triples_sum","home_runs_sum","walks_sum","strikeouts_sum","runs_sum","rbi_sum","stolen_bases_sum","total_bases_derived_sum","batting_average","slugging_percentage","strikeout_rate","walk_rate","hr_rate","tb_per_pa","h_per_ab","sample_size_label","vs_left_json","vs_right_json","metrics_json","audit_json","metadata_json","review_flags_json","lineage_json","row_status","certification_status","certification_grade")}
      ON CONFLICT (snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version) DO UPDATE SET
        games_count=excluded.games_count, pa_sum=excluded.pa_sum, ab_sum=excluded.ab_sum, hits_sum=excluded.hits_sum,
        batting_average=excluded.batting_average, slugging_percentage=excluded.slugging_percentage, strikeout_rate=excluded.strikeout_rate,
        walk_rate=excluded.walk_rate, hr_rate=excluded.hr_rate, tb_per_pa=excluded.tb_per_pa, h_per_ab=excluded.h_per_ab,
        sample_size_label=excluded.sample_size_label, vs_left_json=excluded.vs_left_json, vs_right_json=excluded.vs_right_json,
        metrics_json=excluded.metrics_json, audit_json=excluded.audit_json, metadata_json=excluded.metadata_json, review_flags_json=excluded.review_flags_json,
        row_status=excluded.row_status, updated_at=now()
    `;
    written += slice.length;
  }
  const dup = await sql`SELECT COUNT(*)::int AS c FROM (SELECT player_id, season, metric_window, config_profile_id, formula_version, COUNT(*) n FROM stats_hitter.metric_snapshot_stage WHERE snapshot_batch_id=${snapshotBatchId} GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1) sub`;
  const status = dup[0].c > 0 ? "BLOCKED_SNAPSHOT_PREP_DUPLICATE_KEYS" : "COMPLETED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION";
  await sql`UPDATE stats_hitter.metric_snapshot_batches SET status=${status}, source_stage_rows=${stageRows.length}, snapshot_rows=${written}, duplicate_count=${dup[0].c}, finished_at=now(), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId}`;
  return { ok: dup[0].c === 0, data_ok: dup[0].c === 0, mode: "snapshot_prep_stage_only", snapshot_batch_id: snapshotBatchId, source_metric_batch_id: sourceMetricBatchId, status, snapshot_rows: written, duplicate_count: dup[0].c };
}

// ---- Mode 3: snapshot_delta_gate — bulk first-promote (insert missing) + ongoing repair, no clean ----
async function runSnapshotDeltaGate(sql, input) {
  const snapshotBatchId = input.snapshot_batch_id || "hitter_metrics_snapshot_prep_singleton";
  const batch = await sql`SELECT * FROM stats_hitter.metric_snapshot_batches WHERE snapshot_batch_id=${snapshotBatchId} LIMIT 1`;
  if (!batch[0] || !String(batch[0].status).startsWith("COMPLETED")) {
    return { ok: false, data_ok: false, mode: "snapshot_delta_gate", status: "BLOCKED_SNAPSHOT_STAGE_BATCH_NOT_COMPLETED" };
  }
  const missingCountRows = await sql`
    SELECT COUNT(*)::int AS c FROM stats_hitter.metric_snapshot_stage s
    LEFT JOIN stats_hitter.metric_snapshots l ON l.player_id=s.player_id AND l.season=s.season AND l.metric_window=s.metric_window AND l.config_profile_id=s.config_profile_id AND l.formula_version=s.formula_version
    WHERE s.snapshot_batch_id=${snapshotBatchId} AND l.snapshot_id IS NULL
  `;
  const missingBefore = missingCountRows[0].c;
  let rowsPromoted = 0;
  if (missingBefore > 0) {
    const res = await sql`
      INSERT INTO stats_hitter.metric_snapshots (
        snapshot_id, player_id, season, metric_window, games_count, pa_sum, ab_sum, hits_sum, singles_sum, doubles_sum, triples_sum, home_runs_sum,
        runs_sum, rbi_sum, walks_sum, strikeouts_sum, stolen_bases_sum, total_bases_derived_sum, batting_average, slugging_percentage, strikeout_rate,
        walk_rate, hr_rate, tb_per_pa, h_per_ab, sample_size_label, snapshot_batch_id, source_metric_batch_id, config_profile_id, formula_version,
        review_flags_json, audit_json, metadata_json, metrics_json, certification_status, certification_grade, promoted_at, created_at, updated_at
      )
      SELECT s.snapshot_id, s.player_id, s.season, s.metric_window, s.games_count, s.pa_sum, s.ab_sum, s.hits_sum, s.singles_sum, s.doubles_sum, s.triples_sum, s.home_runs_sum,
        s.runs_sum, s.rbi_sum, s.walks_sum, s.strikeouts_sum, s.stolen_bases_sum, s.total_bases_derived_sum, s.batting_average, s.slugging_percentage, s.strikeout_rate,
        s.walk_rate, s.hr_rate, s.tb_per_pa, s.h_per_ab, s.sample_size_label, s.snapshot_batch_id, s.source_metric_batch_id, s.config_profile_id, s.formula_version,
        s.review_flags_json, s.audit_json, s.metadata_json, s.metrics_json, 'snapshot_live_promoted_from_certified_stage', 'SNAPSHOT_PROMOTION_PASS', now(), now(), now()
      FROM stats_hitter.metric_snapshot_stage s
      LEFT JOIN stats_hitter.metric_snapshots l ON l.player_id=s.player_id AND l.season=s.season AND l.metric_window=s.metric_window AND l.config_profile_id=s.config_profile_id AND l.formula_version=s.formula_version
      WHERE s.snapshot_batch_id=${snapshotBatchId} AND l.snapshot_id IS NULL
      ON CONFLICT (player_id, season, metric_window, config_profile_id, formula_version) DO NOTHING
      RETURNING 1
    `;
    rowsPromoted = res.length;
    await sql`UPDATE stats_hitter.metric_snapshot_stage SET promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId} AND promoted_at IS NULL`;
  }
  const missingAfterRows = await sql`
    SELECT COUNT(*)::int AS c FROM stats_hitter.metric_snapshot_stage s
    LEFT JOIN stats_hitter.metric_snapshots l ON l.player_id=s.player_id AND l.season=s.season AND l.metric_window=s.metric_window AND l.config_profile_id=s.config_profile_id AND l.formula_version=s.formula_version
    WHERE s.snapshot_batch_id=${snapshotBatchId} AND l.snapshot_id IS NULL
  `;
  const missingAfter = missingAfterRows[0].c;
  const status = missingBefore === 0 ? "DELTA_HITTER_METRICS_SNAPSHOT_NOOP_CURRENT" : (missingAfter === 0 ? "DELTA_HITTER_METRICS_SNAPSHOT_REPAIRED_FROM_RETAINED_STAGE" : "DELTA_HITTER_METRICS_SNAPSHOT_REPAIR_INCOMPLETE");
  await sql`UPDATE stats_hitter.metric_snapshot_batches SET rows_promoted=rows_promoted + ${rowsPromoted}, promoted_at=COALESCE(promoted_at, now()), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId}`;
  return { ok: missingAfter === 0, data_ok: missingAfter === 0, mode: "snapshot_delta_gate", snapshot_batch_id: snapshotBatchId, status, missing_live_rows_before: missingBefore, missing_live_rows_after: missingAfter, rows_promoted: rowsPromoted };
}

// ---- Mode 4: delta_recalculate_affected_players — day-by-day watermark advancement, one real day per tick ----
async function getNextDeltaDay(sql, season) {
  const baseBatch = await sql`SELECT delta_watermark_date FROM stats_hitter.metric_batches WHERE batch_id='hitter_metrics_base_backfill_singleton' LIMIT 1`;
  const watermark = baseBatch[0] ? baseBatch[0].delta_watermark_date : null;
  if (!watermark) return { ok: false, reason: "NO_WATERMARK_BASE_NOT_COMPLETED" };
  const latestRows = await sql`SELECT MAX(game_date) AS d FROM stats_hitter.game_logs WHERE season=${season}`;
  const latestAvailable = latestRows[0].d;
  const nextDateRows = await sql`SELECT (${watermark}::date + interval '1 day')::date AS d`;
  const nextDate = nextDateRows[0].d;
  if (!latestAvailable || nextDate > latestAvailable) return { ok: true, no_data_yet: true, watermark, next_date: nextDate, latest_available: latestAvailable };
  return { ok: true, no_data_yet: false, watermark, next_date: nextDate, latest_available: latestAvailable };
}
async function getPlayersForDay(sql, season, dayDate) {
  const ids = new Set();
  const logPlayers = await sql`SELECT DISTINCT player_id FROM stats_hitter.game_logs WHERE season=${season} AND game_date=${dayDate} AND (COALESCE(pa,0)>0 OR COALESCE(ab,0)>0)`;
  for (const row of logPlayers) ids.add(Number(row.player_id));
  const splitPlayers = await sql`SELECT DISTINCT player_id FROM stats_hitter.splits WHERE season=${season} AND updated_at::date=${dayDate}`;
  for (const row of splitPlayers) ids.add(Number(row.player_id));
  return Array.from(ids).sort((a, b) => a - b);
}

async function runDeltaRecalculateAffectedPlayers(sql, input) {
  const season = asInt(input.source_season, DEFAULT_SOURCE_SEASON);
  const baseGate = await sql`SELECT status FROM stats_hitter.metric_batches WHERE batch_id='hitter_metrics_base_backfill_singleton' LIMIT 1`;
  if (!baseGate[0] || baseGate[0].status !== "COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") {
    return { ok: false, data_ok: false, mode: "delta_recalculate_affected_players", status: "BLOCKED_NO_COMPLETED_BASE_BATCH" };
  }
  const dayInfo = await getNextDeltaDay(sql, season);
  if (!dayInfo.ok) return { ok: false, data_ok: false, mode: "delta_recalculate_affected_players", status: "BLOCKED_NO_WATERMARK" };
  if (dayInfo.no_data_yet) {
    return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", status: "DELTA_HITTER_METRICS_NOOP_NO_NEW_DAY_AVAILABLE", watermark: dayInfo.watermark, next_date: dayInfo.next_date, latest_available: dayInfo.latest_available, continuation_required: false };
  }
  const dayDate = dayInfo.next_date;
  const runId = asText(input.run_id, rid("run_hitter_metrics_delta"));
  const batchId = `hitter_metrics_delta_batch_${dayDate}`;
  const snapshotBatchId = `hitter_metrics_delta_snapshot_${dayDate}`;
  const affectedIds = await getPlayersForDay(sql, season, dayDate);

  if (!affectedIds.length) {
    // Real, genuine no-op for this specific day (e.g. off-day, no games) — advance watermark anyway, nothing to recompute.
    await sql`UPDATE stats_hitter.metric_batches SET delta_watermark_date=${dayDate}, updated_at=now() WHERE batch_id='hitter_metrics_base_backfill_singleton'`;
    return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", status: "DELTA_HITTER_METRICS_NOOP_NO_PLAYERS_FOR_DAY", day_processed: dayDate, affected_player_count: 0, watermark_advanced_to: dayDate, continuation_required: dayInfo.latest_available > dayDate };
  }

  await sql`
    INSERT INTO stats_hitter.metric_batches (batch_id, run_id, mode, status, source_season, notes)
    VALUES (${batchId}, ${runId}, 'delta_recalculate_affected_players', 'RUNNING', ${season}, ${`day-by-day delta for ${dayDate}; permanent stage retention`})
    ON CONFLICT (batch_id) DO NOTHING
  `;
  const { logsByPlayer, splitsByPlayer } = await loadChunkSourceRows(sql, affectedIds, season);
  const stageRows = [];
  for (const playerId of affectedIds) {
    const logs = logsByPlayer.get(playerId) || [];
    const splits = splitsByPlayer.get(playerId) || [];
    const latestGameDate = logs.length ? logs[logs.length - 1].game_date : null;
    for (const w of WINDOWS) {
      const wRows = windowRowsFor(logs, w);
      const startDate = wRows.length ? wRows[0].game_date : null;
      const endDate = wRows.length ? wRows[wRows.length - 1].game_date : null;
      stageRows.push(...metricRowsForWindow(playerId, season, w.window_key, wRows, splits, latestGameDate, batchId, runId, startDate, endDate, "delta_recalculate_affected_players"));
    }
    stageRows.push(...splitMetricRows(playerId, season, splits, logs.length, latestGameDate, batchId, runId, "delta_recalculate_affected_players"));
  }
  const staged = await insertStageRowsBulk(sql, batchId, runId, "delta_recalculate_affected_players", stageRows);

  const sourceRows = await sql`SELECT * FROM stats_hitter.metric_stage WHERE batch_id=${batchId} ORDER BY player_id, season, metric_window, metric_key`;
  const baseByKey = new Map(), splitByPlayer = new Map();
  for (const r of sourceRows) {
    const playerId = Number(r.player_id), pseason = Number(r.season);
    const side = r.metric_window === "vl" || r.metric_window === "vr" ? r.metric_window : null;
    if (side) {
      const key = `${playerId}|${pseason}`;
      if (!splitByPlayer.has(key)) splitByPlayer.set(key, { vl: {}, vr: {}, flags: [] });
      const ps = splitByPlayer.get(key);
      const stripped = String(r.metric_key || "").replace(/^vl_/, "").replace(/^vr_/, "");
      ps[side][stripped] = r.metric_text_value !== null && r.metric_text_value !== undefined ? r.metric_text_value : r.metric_value;
      continue;
    }
    if (!SNAPSHOT_CORE_WINDOWS.includes(String(r.metric_window))) continue;
    const key = `${playerId}|${pseason}|${r.metric_window}`;
    if (!baseByKey.has(key)) baseByKey.set(key, { player_id: playerId, season: pseason, metric_window: String(r.metric_window), metrics: {}, flags: [], metadata: { input_latest_game_date: r.input_latest_game_date } });
    const b = baseByKey.get(key);
    b.metrics[r.metric_key] = r.metric_text_value !== null && r.metric_text_value !== undefined ? r.metric_text_value : r.metric_value;
    if (r.row_status === "review_flag") b.flags.push({ metric_key: r.metric_key, missing_data_reason: r.missing_data_reason });
  }
  const snapshotRows = [];
  for (const b of baseByKey.values()) {
    const split = splitByPlayer.get(`${b.player_id}|${b.season}`) || { vl: {}, vr: {} };
    const m = b.metrics;
    snapshotRows.push({
      snapshot_id: rid("hitter_metric_snapshot"), snapshot_batch_id: snapshotBatchId, source_metric_batch_id: batchId, run_id: runId,
      player_id: b.player_id, season: b.season, metric_window: b.metric_window, config_profile_id: PROFILE_ID, formula_version: FORMULA_VERSION,
      games_count: m.games_count ?? null, pa_sum: m.pa_sum ?? null, ab_sum: m.ab_sum ?? null, hits_sum: m.hits_sum ?? null, singles_sum: m.singles_sum ?? null,
      doubles_sum: m.doubles_sum ?? null, triples_sum: m.triples_sum ?? null, home_runs_sum: m.home_runs_sum ?? null, walks_sum: m.walks_sum ?? null,
      strikeouts_sum: m.strikeouts_sum ?? null, runs_sum: m.runs_sum ?? null, rbi_sum: m.rbi_sum ?? null, stolen_bases_sum: m.stolen_bases_sum ?? null,
      total_bases_derived_sum: m.total_bases_derived_sum ?? null, batting_average: m.batting_average ?? null, slugging_percentage: m.slugging_percentage ?? null,
      strikeout_rate: m.strikeout_rate ?? null, walk_rate: m.walk_rate ?? null, hr_rate: m.hr_rate ?? null, tb_per_pa: m.tb_per_pa ?? null, h_per_ab: m.h_per_ab ?? null,
      sample_size_label: m.sample_size_label || null, vs_left_json: JSON.stringify(split.vl || {}), vs_right_json: JSON.stringify(split.vr || {}),
      metrics_json: JSON.stringify(m), audit_json: JSON.stringify({}), metadata_json: JSON.stringify(b.metadata), review_flags_json: JSON.stringify(b.flags),
      lineage_json: JSON.stringify({ source_metric_batch_id: batchId, snapshot_batch_id: snapshotBatchId, worker_version: VERSION, mode: "delta_recalculate_affected_players" }),
      row_status: b.flags.length ? "snapshot_stage_review" : "snapshot_stage_staged", certification_status: "delta_recalc_snapshot_stage_not_promoted", certification_grade: "DELTA_RECALC_STAGE"
    });
  }
  await sql`INSERT INTO stats_hitter.metric_snapshot_batches (snapshot_batch_id, source_metric_batch_id, run_id, mode, status, notes) VALUES (${snapshotBatchId}, ${batchId}, ${runId}, 'delta_recalculate_affected_players', 'RUNNING', 'affected-player delta snapshot') ON CONFLICT (snapshot_batch_id) DO NOTHING`;
  const CHUNK = 250;
  let snapshotWritten = 0;
  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    const slice = snapshotRows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO stats_hitter.metric_snapshot_stage ${sql(slice, "snapshot_id","snapshot_batch_id","source_metric_batch_id","run_id","player_id","season","metric_window","config_profile_id","formula_version","games_count","pa_sum","ab_sum","hits_sum","singles_sum","doubles_sum","triples_sum","home_runs_sum","walks_sum","strikeouts_sum","runs_sum","rbi_sum","stolen_bases_sum","total_bases_derived_sum","batting_average","slugging_percentage","strikeout_rate","walk_rate","hr_rate","tb_per_pa","h_per_ab","sample_size_label","vs_left_json","vs_right_json","metrics_json","audit_json","metadata_json","review_flags_json","lineage_json","row_status","certification_status","certification_grade")}
      ON CONFLICT (snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version) DO UPDATE SET metrics_json=excluded.metrics_json, updated_at=now()
    `;
    snapshotWritten += slice.length;
  }
  const promoted = await sql`
    INSERT INTO stats_hitter.metric_snapshots (
      snapshot_id, player_id, season, metric_window, games_count, pa_sum, ab_sum, hits_sum, singles_sum, doubles_sum, triples_sum, home_runs_sum,
      runs_sum, rbi_sum, walks_sum, strikeouts_sum, stolen_bases_sum, total_bases_derived_sum, batting_average, slugging_percentage, strikeout_rate,
      walk_rate, hr_rate, tb_per_pa, h_per_ab, sample_size_label, snapshot_batch_id, source_metric_batch_id, config_profile_id, formula_version,
      review_flags_json, audit_json, metadata_json, metrics_json, certification_status, certification_grade, promoted_at, created_at, updated_at
    )
    SELECT s.snapshot_id, s.player_id, s.season, s.metric_window, s.games_count, s.pa_sum, s.ab_sum, s.hits_sum, s.singles_sum, s.doubles_sum, s.triples_sum, s.home_runs_sum,
      s.runs_sum, s.rbi_sum, s.walks_sum, s.strikeouts_sum, s.stolen_bases_sum, s.total_bases_derived_sum, s.batting_average, s.slugging_percentage, s.strikeout_rate,
      s.walk_rate, s.hr_rate, s.tb_per_pa, s.h_per_ab, s.sample_size_label, s.snapshot_batch_id, s.source_metric_batch_id, s.config_profile_id, s.formula_version,
      s.review_flags_json, s.audit_json, s.metadata_json, s.metrics_json, 'delta_recalculated_affected_player', 'DELTA_RECALC_PROMOTED_RETAINED_STAGE', now(), now(), now()
    FROM stats_hitter.metric_snapshot_stage s WHERE s.snapshot_batch_id=${snapshotBatchId}
    ON CONFLICT (player_id, season, metric_window, config_profile_id, formula_version) DO UPDATE SET
      games_count=excluded.games_count, pa_sum=excluded.pa_sum, ab_sum=excluded.ab_sum, hits_sum=excluded.hits_sum, batting_average=excluded.batting_average,
      slugging_percentage=excluded.slugging_percentage, strikeout_rate=excluded.strikeout_rate, walk_rate=excluded.walk_rate, hr_rate=excluded.hr_rate,
      tb_per_pa=excluded.tb_per_pa, h_per_ab=excluded.h_per_ab, sample_size_label=excluded.sample_size_label, vs_left_json=excluded.vs_left_json, vs_right_json=excluded.vs_right_json,
      metrics_json=excluded.metrics_json, review_flags_json=excluded.review_flags_json, certification_status=excluded.certification_status, certification_grade=excluded.certification_grade,
      promoted_at=now(), updated_at=now()
    RETURNING 1
  `;
  await sql`UPDATE stats_hitter.metric_snapshot_stage SET promoted_at=COALESCE(promoted_at, now()) WHERE snapshot_batch_id=${snapshotBatchId}`;
  await sql`UPDATE stats_hitter.metric_snapshot_batches SET status='COMPLETED_DELTA_HITTER_METRICS_AFFECTED_RECALC', snapshot_rows=${snapshotWritten}, rows_promoted=${promoted.length}, finished_at=now(), promoted_at=now(), updated_at=now() WHERE snapshot_batch_id=${snapshotBatchId}`;
  await sql`UPDATE stats_hitter.metric_batches SET status='COMPLETED_DELTA_HITTER_METRICS_AFFECTED_RECALC', rows_staged=${staged}, rows_promoted=${promoted.length}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
  // Watermark only advances here, after the day's stage+promote fully succeeded (transactional pointer advancement).
  await sql`UPDATE stats_hitter.metric_batches SET delta_watermark_date=${dayDate}, updated_at=now() WHERE batch_id='hitter_metrics_base_backfill_singleton'`;
  return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", batch_id: batchId, snapshot_batch_id: snapshotBatchId, status: "COMPLETED_DELTA_HITTER_METRICS_AFFECTED_RECALC", day_processed: dayDate, watermark_advanced_to: dayDate, affected_player_count: affectedIds.length, rows_staged: staged, rows_promoted: promoted.length, continuation_required: dayInfo.latest_available > dayDate };
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
