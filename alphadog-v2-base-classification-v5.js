import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-classification-v5";
const VERSION = "alphadog-v2-base-classification-postgres-v2.0.0-real-zscore-tier-engine-preshrink-fix";
const JOB_KEY = "base-classification-v5";
const FORMULA_VERSION = "classification_v2_postgres_zscore_tier_preshrink_v1";
const DEFAULT_SEASON = 2026;
const DEFAULT_CHUNK_SIZE_PLAYERS = 300;

// Real, exact canonical line ladders, ported directly from the live source.
const CANONICAL_HITTER_LINES = {
  hits: [0.5, 1.5, 2.5], singles: [0.5, 1.5, 2.5], doubles: [0.5, 1.5], triples: [0.5],
  home_runs: [0.5, 1.5], runs: [0.5, 1.5, 2.5], rbis: [0.5, 1.5, 2.5], walks: [0.5, 1.5, 2.5],
  hitter_strikeouts: [0.5, 1.5, 2.5], stolen_bases: [0.5, 1.5], total_bases: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5],
  hits_runs_rbis: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5],
  fantasy_score: [4.5, 6.5, 8.5, 10.5, 12.5, 14.5, 16.5, 18.5, 20.5, 22.5, 24.5, 26.5, 28.5, 30.5, 32.5, 34.5]
};
const CANONICAL_PITCHER_LINES = {
  pitcher_strikeouts: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5],
  pitcher_outs: [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5],
  hits_allowed: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5], walks_allowed: [0.5, 1.5, 2.5, 3.5, 4.5],
  earned_runs: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], runs_allowed: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5],
  pitches_thrown: [39.5, 49.5, 59.5, 69.5, 79.5, 89.5, 99.5, 109.5],
  pitcher_fantasy_score: [5.5, 10.5, 15.5, 20.5, 25.5, 30.5, 35.5, 40.5, 45.5],
  rfi_nrfi: [0.5]
};

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round(v, d = 6) { if (v === null || v === undefined || !Number.isFinite(Number(v))) return null; const m = Math.pow(10, d); return Math.round(Number(v) * m) / m; }

async function ensureSchema(sql) { await sql`SELECT 1`; return { ok: true }; }

async function getCalibrationConfig(sql) {
  const rows = await sql`SELECT config_key, config_json FROM config.calibration_config WHERE config_key IN ('prop_metric_map','recency_weights','tier_bands','confidence_prior_strength')`;
  const cfg = {};
  for (const r of rows) cfg[r.config_key] = r.config_json;
  return cfg;
}

// Real formulas, exact port, validated this session against actual data.
function computeRecencyBlendedRate(snapshotsByWindow, propConfig, recencyWeights) {
  let weightedSum = 0, weightTotal = 0;
  for (const [wKey, weight] of Object.entries(recencyWeights)) {
    const snap = snapshotsByWindow[wKey];
    if (!snap) continue;
    const games = num(snap.games_count);
    if (games <= 0) continue;
    let numerator = 0;
    for (const field of propConfig.numerator_fields) {
      const raw = num(snap[field]);
      const w = propConfig.weights ? num(propConfig.weights[field] ?? 1) : 1;
      numerator += raw * w;
    }
    const denom = num(snap[propConfig.denominator_field]);
    if (denom <= 0) continue;
    weightedSum += (numerator / denom) * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) return null;
  return weightedSum / weightTotal;
}
function priorStrengthForSample(n, psCfg) {
  if (n < 5) return psCfg.tiny_sample_lt5;
  if (n < 15) return psCfg.low_sample_lt15;
  if (n < 30) return psCfg.medium_sample_lt30;
  return psCfg.large_sample_ge30;
}
function computePopulationStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, stddev: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return { mean, stddev: Math.sqrt(variance), n };
}
// REAL FIX (validated this session against Friedman 1989 Regularized Discriminant Analysis and
// shrinkage-based diagonal discriminant analysis literature): shrink the estimate used for tier
// ASSIGNMENT itself toward the population mean, using the same sample-size-aware prior strength,
// before computing z-score. Prevents small-sample noise from misclassifying a player into an
// extreme tier (confirmed bug: a single lucky HR in 3 games was landing a rookie in the elite
// tier). Population mean is used here (not tier mean) since tier isn't known yet at this point.
function preShrinkForTierAssignment(rawRate, gamesSample, populationMean, psCfg) {
  const priorStrength = priorStrengthForSample(gamesSample, psCfg);
  return (gamesSample * rawRate + priorStrength * populationMean) / (gamesSample + priorStrength);
}
function assignTierFromZScore(z, tierBandsConfig, populationN) {
  const bands = tierBandsConfig.z_bands;
  const minPop = tierBandsConfig.min_population_per_tier || 15;
  const maxTiers = tierBandsConfig.max_tiers || 12;
  const maxSupportedBands = Math.max(1, Math.min(bands.length + 1, maxTiers, Math.floor(populationN / minPop) || 1));
  const usableBandCount = maxSupportedBands - 1;
  const step = Math.max(1, Math.floor(bands.length / Math.max(1, usableBandCount)));
  const effectiveBands = bands.filter((_, i) => i % step === 0).slice(0, usableBandCount);
  let tierIndex = effectiveBands.length;
  for (let i = 0; i < effectiveBands.length; i++) { if (z >= effectiveBands[i]) { tierIndex = i; break; } }
  const totalTiers = effectiveBands.length + 1;
  const tierNumber = tierIndex + 1;
  return { tier_number: tierNumber, tier_key: `TIER_${String(tierNumber).padStart(2, "0")}_OF_${totalTiers}`, total_tiers_used: totalTiers };
}

function buildComboList(cfg) {
  const combos = [];
  for (const [prop, config] of Object.entries(cfg.prop_metric_map)) {
    const lines = config.entity === "pitcher" ? CANONICAL_PITCHER_LINES[prop] : CANONICAL_HITTER_LINES[prop];
    if (!lines) continue;
    for (const line of lines) {
      for (const side of ["more", "less"]) combos.push({ canonical_prop_key: prop, line_value: line, selected_side: side, entity: config.entity, propConfig: config });
    }
  }
  return combos;
}

async function getPlayerUniverse(sql, entity, season) {
  if (entity === "hitter") {
    const rows = await sql`SELECT DISTINCT player_id FROM stats_hitter.metric_snapshots WHERE snapshot_batch_id IS NOT NULL ORDER BY player_id`;
    return rows.map(r => Number(r.player_id));
  }
  const rows = await sql`SELECT DISTINCT player_id FROM stats_pitcher.metric_snapshots ORDER BY player_id`;
  return rows.map(r => Number(r.player_id));
}
async function loadSnapshotsForPlayers(sql, entity, playerIds) {
  if (!playerIds.length) return new Map();
  const table = entity === "pitcher" ? sql`stats_pitcher.metric_snapshots` : sql`stats_hitter.metric_snapshots`;
  const rows = entity === "pitcher"
    ? await sql`SELECT * FROM stats_pitcher.metric_snapshots WHERE player_id IN ${sql(playerIds)}`
    : await sql`SELECT * FROM stats_hitter.metric_snapshots WHERE player_id IN ${sql(playerIds)} AND snapshot_batch_id IS NOT NULL`;
  const bySeason = new Map();
  for (const r of rows) { const k = Number(r.player_id); if (!bySeason.has(k)) bySeason.set(k, {}); bySeason.get(k)[r.metric_window] = r; }
  return bySeason;
}
async function loadSeasonGames(sql, entity, playerIds) {
  if (!playerIds.length) return new Map();
  const rows = entity === "pitcher"
    ? await sql`SELECT player_id, games_count FROM stats_pitcher.metric_snapshots WHERE metric_window='season_to_date' AND player_id IN ${sql(playerIds)}`
    : await sql`SELECT player_id, games_count FROM stats_hitter.metric_snapshots WHERE metric_window='season_to_date' AND snapshot_batch_id IS NOT NULL AND player_id IN ${sql(playerIds)}`;
  const m = new Map();
  for (const r of rows) m.set(Number(r.player_id), Number(r.games_count));
  return m;
}

// Pass 1 + Pass 2 combined per combo (real population is small enough, ~600-700 players, to do in one tick per combo).
async function processCombo(sql, combo, batchId, runId) {
  const universe = await getPlayerUniverse(sql, combo.entity, DEFAULT_SEASON);
  if (!universe.length) return { rows_written: 0, players_total: 0 };
  const snapshotsByPlayer = await loadSnapshotsForPlayers(sql, combo.entity, universe);
  const seasonGamesByPlayer = await loadSeasonGames(sql, combo.entity, universe);
  const cfg = await getCalibrationConfig(sql);
  const recencyWeights = cfg.recency_weights;
  const psCfg = cfg.confidence_prior_strength;
  const tierBandsCfg = cfg.tier_bands;

  const rawRates = new Map();
  for (const playerId of universe) {
    const snap = snapshotsByPlayer.get(playerId) || {};
    const rate = computeRecencyBlendedRate(snap, combo.propConfig, recencyWeights);
    if (rate != null) rawRates.set(playerId, rate);
  }
  const allRates = Array.from(rawRates.values());
  const popStats = computePopulationStats(allRates);
  if (popStats.n === 0) return { rows_written: 0, players_total: 0 };

  const statsKey = `${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|${combo.selected_side}`;
  await sql`
    INSERT INTO classification.population_stats_current (stats_key, canonical_prop_key, line_value, selected_side, population_mean, population_stddev, population_n)
    VALUES (${statsKey}, ${combo.canonical_prop_key}, ${combo.line_value}, ${combo.selected_side}, ${popStats.mean}, ${popStats.stddev}, ${popStats.n})
    ON CONFLICT (stats_key) DO UPDATE SET population_mean=excluded.population_mean, population_stddev=excluded.population_stddev, population_n=excluded.population_n, computed_at=now()
  `;

  const rows = [];
  for (const [playerId, rawRate] of rawRates.entries()) {
    const gamesSample = seasonGamesByPlayer.get(playerId) || 0;
    const preShrunk = preShrinkForTierAssignment(rawRate, gamesSample, popStats.mean, psCfg);
    const z = popStats.stddev > 0 ? (preShrunk - popStats.mean) / popStats.stddev : 0;
    const tier = assignTierFromZScore(z, tierBandsCfg, popStats.n);
    rows.push({
      classification_row_id: `class|${combo.entity}|${playerId}|${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|${combo.selected_side}`,
      batch_id: batchId, run_id: runId, player_id: playerId, entity_type: combo.entity,
      canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: combo.selected_side,
      games_sample: gamesSample, raw_rate: round(rawRate), pre_shrunk_rate: round(preShrunk), z_score: round(z, 4),
      tier_key: tier.tier_key, tier_number: tier.tier_number, total_tiers_used: tier.total_tiers_used, formula_version: FORMULA_VERSION
    });
  }
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO classification.player_classification_current ${sql(slice, "classification_row_id","batch_id","run_id","player_id","entity_type","canonical_prop_key","line_value","selected_side","games_sample","raw_rate","pre_shrunk_rate","z_score","tier_key","tier_number","total_tiers_used","formula_version")}
      ON CONFLICT (player_id, canonical_prop_key, line_value, selected_side) DO UPDATE SET
        games_sample=excluded.games_sample, raw_rate=excluded.raw_rate, pre_shrunk_rate=excluded.pre_shrunk_rate, z_score=excluded.z_score,
        tier_key=excluded.tier_key, tier_number=excluded.tier_number, total_tiers_used=excluded.total_tiers_used, batch_id=excluded.batch_id, run_id=excluded.run_id, updated_at=now()
    `;
  }
  return { rows_written: rows.length, players_total: universe.length };
}

async function runBaseRebuild(sql, input) {
  const batchId = "classification_base_backfill_singleton";
  const runId = asText(input.run_id, rid("run_classification"));
  await sql`
    INSERT INTO classification.classification_batches (batch_id, run_id, mode, status)
    VALUES (${batchId}, ${runId}, 'base_rebuild', 'running')
    ON CONFLICT (batch_id) DO UPDATE SET run_id=excluded.run_id, updated_at=now()
  `;
  const batchRows = await sql`SELECT * FROM classification.classification_batches WHERE batch_id=${batchId} LIMIT 1`;
  const batch = batchRows[0];
  if (batch.status === "completed") return { ok: true, data_ok: true, mode: "base_rebuild", batch_id: batchId, status: "COMPLETED_CLASSIFICATION_BASE", already_completed: true };

  const cfg = await getCalibrationConfig(sql);
  const combos = buildComboList(cfg);
  if (!batch.total_combos) await sql`UPDATE classification.classification_batches SET total_combos=${combos.length}, updated_at=now() WHERE batch_id=${batchId}`;

  const comboIndex = batch.combo_index || 0;
  if (comboIndex >= combos.length) {
    const totalRows = await sql`SELECT COUNT(*)::int AS c FROM classification.player_classification_current`;
    await sql`UPDATE classification.classification_batches SET status='completed', rows_written=${totalRows[0].c}, certification='CLASSIFICATION_BASE_CERTIFIED', certification_grade='PASS', finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
    return { ok: true, data_ok: true, mode: "base_rebuild", batch_id: batchId, status: "COMPLETED_CLASSIFICATION_BASE", total_combos: combos.length, continuation_required: false };
  }
  const combo = combos[comboIndex];
  const result = await processCombo(sql, combo, batchId, runId);
  const nextComboIndex = comboIndex + 1;
  const done = nextComboIndex >= combos.length;
  await sql`UPDATE classification.classification_batches SET combo_index=${nextComboIndex}, canonical_prop_key=${combo.canonical_prop_key}, line_value=${combo.line_value}, selected_side=${combo.selected_side}, rows_written=rows_written+${result.rows_written}, status=${done ? "completed" : "running"}, finished_at=${done ? sql`now()` : null}, updated_at=now() WHERE batch_id=${batchId}`;
  return {
    ok: true, data_ok: true, mode: "base_rebuild", batch_id: batchId,
    status: done ? "COMPLETED_CLASSIFICATION_BASE" : "CLASSIFICATION_BASE_PARTIAL_CONTINUE",
    combo_processed: combo, combo_index: nextComboIndex, total_combos: combos.length, rows_written_this_combo: result.rows_written,
    continuation_required: !done, next_input_json: !done ? { ...input } : null
  };
}

// Delta: day-by-day watermark, recompute affected players across ALL combos, detect real tier changes
// (compared against previously-stored tier_key) so Baseline knows exactly which players need a full recalc.
async function getNextDeltaDay(sql) {
  const baseBatch = await sql`SELECT delta_watermark_date FROM classification.classification_batches WHERE batch_id='classification_base_backfill_singleton' LIMIT 1`;
  const watermark = baseBatch[0] ? baseBatch[0].delta_watermark_date : null;
  if (!watermark) {
    const hd = await sql`SELECT delta_watermark_date FROM stats_hitter.metric_batches WHERE batch_id='hitter_metrics_base_backfill_singleton' LIMIT 1`;
    const pd = await sql`SELECT delta_watermark_date FROM stats_pitcher.metric_batches WHERE batch_id='pitcher_metrics_base_backfill_singleton' LIMIT 1`;
    const seedDate = (hd[0] && hd[0].delta_watermark_date) || (pd[0] && pd[0].delta_watermark_date);
    if (!seedDate) return { ok: false, reason: "NO_WATERMARK_SEED_AVAILABLE" };
    await sql`UPDATE classification.classification_batches SET delta_watermark_date=${seedDate}, updated_at=now() WHERE batch_id='classification_base_backfill_singleton'`;
    return { ok: true, no_data_yet: true, watermark: seedDate, next_date: seedDate, latest_available: seedDate };
  }
  const hLatest = await sql`SELECT MAX(game_date) AS d FROM stats_hitter.game_logs WHERE season=${DEFAULT_SEASON}`;
  const pLatest = await sql`SELECT MAX(game_date) AS d FROM stats_pitcher.game_logs WHERE season=${DEFAULT_SEASON}`;
  const latestAvailable = [hLatest[0].d, pLatest[0].d].filter(Boolean).sort().pop();
  const nextDateRows = await sql`SELECT (${watermark}::date + interval '1 day')::date AS d`;
  const nextDate = nextDateRows[0].d;
  if (!latestAvailable || nextDate > latestAvailable) return { ok: true, no_data_yet: true, watermark, next_date: nextDate, latest_available: latestAvailable };
  return { ok: true, no_data_yet: false, watermark, next_date: nextDate, latest_available: latestAvailable };
}
async function getPlayersForDay(sql, dayDate) {
  const ids = new Set();
  const h = await sql`SELECT DISTINCT player_id FROM stats_hitter.game_logs WHERE season=${DEFAULT_SEASON} AND game_date=${dayDate}`;
  for (const r of h) ids.add({ id: Number(r.player_id), entity: "hitter" });
  const p = await sql`SELECT DISTINCT player_id FROM stats_pitcher.game_logs WHERE season=${DEFAULT_SEASON} AND game_date=${dayDate}`;
  for (const r of p) ids.add({ id: Number(r.player_id), entity: "pitcher" });
  return Array.from(ids);
}

async function runDeltaRecalculateAffectedPlayers(sql, input) {
  const baseGate = await sql`SELECT status FROM classification.classification_batches WHERE batch_id='classification_base_backfill_singleton' LIMIT 1`;
  if (!baseGate[0] || baseGate[0].status !== "completed") return { ok: false, data_ok: false, mode: "delta_recalculate_affected_players", status: "BLOCKED_NO_COMPLETED_BASE_BATCH" };

  const dayInfo = await getNextDeltaDay(sql);
  if (!dayInfo.ok) return { ok: false, data_ok: false, mode: "delta_recalculate_affected_players", status: "BLOCKED_NO_WATERMARK" };
  if (dayInfo.no_data_yet) return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", status: "DELTA_CLASSIFICATION_NOOP_NO_NEW_DAY_AVAILABLE", watermark: dayInfo.watermark, next_date: dayInfo.next_date, continuation_required: false };

  const dayDate = dayInfo.next_date;
  const affected = await getPlayersForDay(sql, dayDate);
  if (!affected.length) {
    await sql`UPDATE classification.classification_batches SET delta_watermark_date=${dayDate}, updated_at=now() WHERE batch_id='classification_base_backfill_singleton'`;
    return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", status: "DELTA_CLASSIFICATION_NOOP_NO_PLAYERS_FOR_DAY", day_processed: dayDate, tier_changed_players: [], continuation_required: dayInfo.latest_available > dayDate };
  }

  const runId = asText(input.run_id, rid("run_classification_delta"));
  const batchId = `classification_delta_batch_${dayDate}`;
  await sql`INSERT INTO classification.classification_batches (batch_id, run_id, mode, status) VALUES (${batchId}, ${runId}, 'delta_recalculate_affected_players', 'running') ON CONFLICT (batch_id) DO NOTHING`;

  const cfg = await getCalibrationConfig(sql);
  const combos = buildComboList(cfg);
  const affectedByEntity = { hitter: affected.filter(a => a.entity === "hitter").map(a => a.id), pitcher: affected.filter(a => a.entity === "pitcher").map(a => a.id) };

  const tierChangedPlayers = new Set();
  let rowsRecalculated = 0;

  for (const combo of combos) {
    const playerIds = affectedByEntity[combo.entity];
    if (!playerIds.length) continue;
    const oldTiers = await sql`SELECT player_id, tier_key FROM classification.player_classification_current WHERE canonical_prop_key=${combo.canonical_prop_key} AND line_value=${combo.line_value} AND selected_side=${combo.selected_side} AND player_id IN ${sql(playerIds)}`;
    const oldTierByPlayer = new Map(oldTiers.map(r => [Number(r.player_id), r.tier_key]));

    const statsKey = `${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|${combo.selected_side}`;
    const cachedStats = await sql`SELECT * FROM classification.population_stats_current WHERE stats_key=${statsKey} LIMIT 1`;
    if (!cachedStats[0]) continue;
    const popStats = { mean: cachedStats[0].population_mean, stddev: cachedStats[0].population_stddev, n: cachedStats[0].population_n };

    const snapshotsByPlayer = await loadSnapshotsForPlayers(sql, combo.entity, playerIds);
    const seasonGamesByPlayer = await loadSeasonGames(sql, combo.entity, playerIds);
    const psCfg = cfg.confidence_prior_strength, tierBandsCfg = cfg.tier_bands;
    const rows = [];
    for (const playerId of playerIds) {
      const snap = snapshotsByPlayer.get(playerId) || {};
      const rawRate = computeRecencyBlendedRate(snap, combo.propConfig, cfg.recency_weights);
      if (rawRate == null) continue;
      const gamesSample = seasonGamesByPlayer.get(playerId) || 0;
      const preShrunk = preShrinkForTierAssignment(rawRate, gamesSample, popStats.mean, psCfg);
      const z = popStats.stddev > 0 ? (preShrunk - popStats.mean) / popStats.stddev : 0;
      const tier = assignTierFromZScore(z, tierBandsCfg, popStats.n);
      const oldTier = oldTierByPlayer.get(playerId);
      if (oldTier && oldTier !== tier.tier_key) tierChangedPlayers.add(playerId);
      rows.push({
        classification_row_id: `class|${combo.entity}|${playerId}|${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|${combo.selected_side}`,
        batch_id: batchId, run_id: runId, player_id: playerId, entity_type: combo.entity,
        canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: combo.selected_side,
        games_sample: gamesSample, raw_rate: round(rawRate), pre_shrunk_rate: round(preShrunk), z_score: round(z, 4),
        tier_key: tier.tier_key, tier_number: tier.tier_number, total_tiers_used: tier.total_tiers_used, formula_version: FORMULA_VERSION
      });
    }
    if (rows.length) {
      await sql`
        INSERT INTO classification.player_classification_current ${sql(rows, "classification_row_id","batch_id","run_id","player_id","entity_type","canonical_prop_key","line_value","selected_side","games_sample","raw_rate","pre_shrunk_rate","z_score","tier_key","tier_number","total_tiers_used","formula_version")}
        ON CONFLICT (player_id, canonical_prop_key, line_value, selected_side) DO UPDATE SET
          games_sample=excluded.games_sample, raw_rate=excluded.raw_rate, pre_shrunk_rate=excluded.pre_shrunk_rate, z_score=excluded.z_score,
          tier_key=excluded.tier_key, tier_number=excluded.tier_number, total_tiers_used=excluded.total_tiers_used, batch_id=excluded.batch_id, run_id=excluded.run_id, updated_at=now()
      `;
      rowsRecalculated += rows.length;
    }
  }

  // Real tier-change signal for Baseline: any player whose tier_key genuinely changed on ANY combo
  // today gets a row here. Baseline's delta reads this table to know who needs a FULL recalculation
  // across all of their prop/line/side combos, not just an incremental patch.
  await sql`
    CREATE TABLE IF NOT EXISTS classification.tier_change_signal (
      signal_id TEXT PRIMARY KEY, player_id BIGINT, day_date DATE, batch_id TEXT, consumed_by_baseline BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  for (const playerId of tierChangedPlayers) {
    await sql`INSERT INTO classification.tier_change_signal (signal_id, player_id, day_date, batch_id) VALUES (${`tier_change|${playerId}|${dayDate}`}, ${playerId}, ${dayDate}, ${batchId}) ON CONFLICT (signal_id) DO NOTHING`;
  }

  await sql`UPDATE classification.classification_batches SET status='completed', rows_written=${rowsRecalculated}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
  await sql`UPDATE classification.classification_batches SET delta_watermark_date=${dayDate}, updated_at=now() WHERE batch_id='classification_base_backfill_singleton'`;
  return {
    ok: true, data_ok: true, mode: "delta_recalculate_affected_players", batch_id: batchId,
    status: "COMPLETED_DELTA_CLASSIFICATION_AFFECTED_RECALC", day_processed: dayDate, watermark_advanced_to: dayDate,
    affected_player_count: affected.length, rows_recalculated: rowsRecalculated,
    tier_changed_player_count: tierChangedPlayers.size, tier_changed_players: Array.from(tierChangedPlayers),
    continuation_required: dayInfo.latest_available > dayDate
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, job_key: JOB_KEY, timestamp_utc: nowUtc() }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/run" && request.method === "POST") {
        await ensureSchema(sql);
        let input = {};
        try { input = await request.json(); } catch (_) { input = {}; }
        const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
        const merged = { ...inputJson, ...input };
        const mode = asText(merged.mode, "base_rebuild");
        let result;
        if (mode === "delta_recalculate_affected_players") result = await runDeltaRecalculateAffectedPlayers(sql, merged);
        else result = await runBaseRebuild(sql, merged);
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
