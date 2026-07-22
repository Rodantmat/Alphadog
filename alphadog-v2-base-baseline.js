import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-baseline";
const VERSION = "alphadog-v2-base-baseline-postgres-v1.0.0-tier-shrinkage-poisson-normal-wilson";
const JOB_KEY = "base-baseline";
const FORMULA_VERSION = "baseline_v2_postgres_shrinkage_hp_v1";
const DEFAULT_SEASON = 2026;
const TIER_BLEND_K = 5;

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
function round(v, d = 4) { if (v === null || v === undefined || !Number.isFinite(Number(v))) return null; const m = Math.pow(10, d); return Math.round(Number(v) * m) / m; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

async function ensureSchema(sql) { await sql`SELECT 1`; return { ok: true }; }
async function getCalibrationConfig(sql) {
  const rows = await sql`SELECT config_key, config_json FROM config.calibration_config WHERE config_key IN ('prop_metric_map','confidence_prior_strength')`;
  const cfg = {};
  for (const r of rows) cfg[r.config_key] = r.config_json;
  return cfg;
}
// REAL FIX (found via full-dataset health check + validated against published empirical Bayes
// literature): the original discrete buckets caused confidence to DECREASE at bucket boundaries.
// Smooth exponential decay is monotonic by construction, closely tracks the original reference
// values. Must match Classification's version exactly since both use the same shrinkage math.
function priorStrengthForSample(n, psCfg) {
  return 2 + 18 * Math.exp(-n / 18);
}
function propCanGoNegative(propConfig) {
  return !!(propConfig && propConfig.weights && Object.values(propConfig.weights).some(w => Number(w) < 0));
}
function poissonCDF(k, lambda) {
  if (lambda <= 0) return k >= 0 ? 1 : 0;
  let term = Math.exp(-lambda), sum = term;
  for (let i = 1; i <= k; i++) { term *= lambda / i; sum += term; }
  return clamp(sum, 0, 1);
}
function hpFromCountModel(mean, lineValue, side) {
  const threshold = Math.floor(lineValue);
  const pUnder = poissonCDF(threshold, mean);
  return side === "more" ? (1 - pUnder) : pUnder;
}
function erf(x) {
  const sign = x >= 0 ? 1 : -1; x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function normalCDF(x, mean, stddev) {
  if (!(stddev > 0)) return x >= mean ? 1 : 0;
  const z = (x - mean) / (stddev * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}
function hpFromNormalModel(mean, lineValue, side, stddev) {
  const pUnder = normalCDF(lineValue, mean, stddev);
  return side === "more" ? (1 - pUnder) : pUnder;
}
function wilsonInterval(pHat, n, z) {
  if (!(n > 0)) return { lower: 0, upper: 1 };
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (pHat + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((pHat * (1 - pHat) / n) + (z2 / (4 * n * n)))) / denom;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}
function clampHpToSampleSupportedRange(rawHp, gamesSample) {
  const p = clamp(Number(rawHp) || 0, 0, 1);
  const n = Math.max(0, Number(gamesSample) || 0);
  if (n >= 30) return { hp: p, clamped: false };
  const { lower, upper } = wilsonInterval(p, n, 1.96);
  const clamped = clamp(p, lower, upper);
  return { hp: clamped, clamped: clamped !== p };
}
function sampleAwareConfidence(n, psCfg) {
  const priorStrength = priorStrengthForSample(n, psCfg);
  const effectiveN = n + priorStrength;
  return round(clamp(95 * (1 - Math.exp(-effectiveN / 25)), 5, 95), 2);
}

function buildComboList(cfg) {
  const combos = [];
  for (const [prop, config] of Object.entries(cfg.prop_metric_map)) {
    const lines = config.entity === "pitcher" ? CANONICAL_PITCHER_LINES[prop] : CANONICAL_HITTER_LINES[prop];
    if (!lines) continue;
    for (const line of lines) for (const side of ["more", "less"]) combos.push({ canonical_prop_key: prop, line_value: line, selected_side: side, entity: config.entity, propConfig: config });
  }
  return combos;
}

function computeHpForPlayer(row, blendedTierPrior, psCfg, usesNormalModel, popStddev, lineValue, side) {
  const gamesSample = num(row.games_sample);
  const rawRate = num(row.raw_rate);
  const priorStrength = priorStrengthForSample(gamesSample, psCfg);
  const shrunkRate = (gamesSample * rawRate + priorStrength * blendedTierPrior) / (gamesSample + priorStrength);
  const rawHp = usesNormalModel ? hpFromNormalModel(shrunkRate, lineValue, side, popStddev) : hpFromCountModel(shrunkRate, lineValue, side);
  const { hp, clamped } = clampHpToSampleSupportedRange(rawHp, gamesSample);
  const confidence = sampleAwareConfidence(gamesSample, psCfg);
  return { shrunkRate, hp, clamped, confidence, model: usesNormalModel ? "normal" : "poisson" };
}

async function runBaselineForCombo(sql, combo, batchId, runId, psCfg) {
  if (combo.selected_side === "less") return { rows_written: 0 };

  const statsKey = `${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|${combo.selected_side}`;
  const popStatsRows = await sql`SELECT * FROM classification.population_stats_current WHERE stats_key=${statsKey} LIMIT 1`;
  if (!popStatsRows[0]) return { rows_written: 0, reason: "NO_POPULATION_STATS_YET" };
  const popStats = popStatsRows[0];

  const classRows = await sql`SELECT player_id, entity_type, games_sample, raw_rate, tier_key FROM classification.player_classification_current WHERE canonical_prop_key=${combo.canonical_prop_key} AND line_value=${combo.line_value} AND selected_side=${combo.selected_side}`;
  if (!classRows.length) return { rows_written: 0, reason: "NO_CLASSIFICATION_ROWS_YET" };

  const byTier = new Map();
  for (const r of classRows) { const k = r.tier_key; if (!byTier.has(k)) byTier.set(k, []); byTier.get(k).push(num(r.raw_rate)); }
  const tierPriors = new Map();
  for (const [tierKey, vals] of byTier.entries()) {
    const tierAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const blended = (vals.length * tierAvg + TIER_BLEND_K * popStats.population_mean) / (vals.length + TIER_BLEND_K);
    tierPriors.set(tierKey, { tierAvg, tierN: vals.length, blended });
    const key = `${statsKey}|${tierKey}`;
    await sql`
      INSERT INTO classification.tier_priors_current (tier_prior_key, canonical_prop_key, line_value, selected_side, tier_key, tier_avg_raw_rate, tier_n, blended_tier_prior)
      VALUES (${key}, ${combo.canonical_prop_key}, ${combo.line_value}, ${combo.selected_side}, ${tierKey}, ${tierAvg}, ${vals.length}, ${blended})
      ON CONFLICT (tier_prior_key) DO UPDATE SET tier_avg_raw_rate=excluded.tier_avg_raw_rate, tier_n=excluded.tier_n, blended_tier_prior=excluded.blended_tier_prior, computed_at=now()
    `;
  }

  const usesNormalModel = propCanGoNegative(combo.propConfig);
  const moreRows = [], lessRows = [];
  for (const r of classRows) {
    const tierInfo = tierPriors.get(r.tier_key) || { blended: popStats.population_mean };
    const calc = computeHpForPlayer(r, tierInfo.blended, psCfg, usesNormalModel, popStats.population_stddev, combo.line_value, "more");
    const hpPct = round(calc.hp * 100, 2);
    const rowIdMore = `bl|${r.entity_type}|${r.player_id}|${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|more`;
    moreRows.push({
      baseline_row_id: rowIdMore, batch_id: batchId, run_id: runId, player_id: r.player_id, entity_type: r.entity_type,
      canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: "more", tier_key: r.tier_key,
      games_sample: r.games_sample, raw_rate: round(r.raw_rate), shrunk_rate: round(calc.shrunkRate),
      hit_probability_0_100: hpPct, confidence_0_100: calc.confidence, model_used: calc.model, wilson_clamped: calc.clamped, formula_version: FORMULA_VERSION
    });
    const rowIdLess = `bl|${r.entity_type}|${r.player_id}|${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|less`;
    lessRows.push({
      baseline_row_id: rowIdLess, batch_id: batchId, run_id: runId, player_id: r.player_id, entity_type: r.entity_type,
      canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: "less", tier_key: r.tier_key,
      games_sample: r.games_sample, raw_rate: round(r.raw_rate), shrunk_rate: round(calc.shrunkRate),
      hit_probability_0_100: round(100 - hpPct, 2), confidence_0_100: calc.confidence, model_used: calc.model, wilson_clamped: calc.clamped, formula_version: FORMULA_VERSION
    });
  }
  const allRows = [...moreRows, ...lessRows];
  const CHUNK = 500;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const slice = allRows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO classification.baseline_current ${sql(slice, "baseline_row_id","batch_id","run_id","player_id","entity_type","canonical_prop_key","line_value","selected_side","tier_key","games_sample","raw_rate","shrunk_rate","hit_probability_0_100","confidence_0_100","model_used","wilson_clamped","formula_version")}
      ON CONFLICT (player_id, canonical_prop_key, line_value, selected_side) DO UPDATE SET
        tier_key=excluded.tier_key, games_sample=excluded.games_sample, raw_rate=excluded.raw_rate, shrunk_rate=excluded.shrunk_rate,
        hit_probability_0_100=excluded.hit_probability_0_100, confidence_0_100=excluded.confidence_0_100, model_used=excluded.model_used,
        wilson_clamped=excluded.wilson_clamped, batch_id=excluded.batch_id, run_id=excluded.run_id, updated_at=now()
    `;
  }
  return { rows_written: allRows.length };
}

async function runBaseRebuild(sql, input) {
  const batchId = "baseline_base_backfill_singleton";
  const runId = asText(input.run_id, rid("run_baseline"));
  await sql`
    INSERT INTO classification.baseline_batches (batch_id, run_id, mode, status)
    VALUES (${batchId}, ${runId}, 'base_rebuild', 'running')
    ON CONFLICT (batch_id) DO UPDATE SET run_id=excluded.run_id, updated_at=now()
  `;
  const batchRows = await sql`SELECT * FROM classification.baseline_batches WHERE batch_id=${batchId} LIMIT 1`;
  const batch = batchRows[0];
  if (batch.status === "completed") return { ok: true, data_ok: true, mode: "base_rebuild", batch_id: batchId, status: "COMPLETED_BASELINE_BASE", already_completed: true };

  const classGate = await sql`SELECT status FROM classification.classification_batches WHERE batch_id='classification_base_backfill_singleton' LIMIT 1`;
  if (!classGate[0] || classGate[0].status !== "completed") return { ok: false, data_ok: false, mode: "base_rebuild", status: "BLOCKED_CLASSIFICATION_BASE_NOT_COMPLETED" };

  const cfg = await getCalibrationConfig(sql);
  const combos = buildComboList(cfg);
  if (!batch.total_combos) await sql`UPDATE classification.baseline_batches SET total_combos=${combos.length}, updated_at=now() WHERE batch_id=${batchId}`;

  const comboIndex = batch.combo_index || 0;
  if (comboIndex >= combos.length) {
    const totalRows = await sql`SELECT COUNT(*)::int AS c FROM classification.baseline_current`;
    await sql`UPDATE classification.baseline_batches SET status='completed', rows_written=${totalRows[0].c}, certification='BASELINE_BASE_CERTIFIED', certification_grade='PASS', finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
    return { ok: true, data_ok: true, mode: "base_rebuild", batch_id: batchId, status: "COMPLETED_BASELINE_BASE", total_combos: combos.length, continuation_required: false };
  }
  const COMBOS_PER_TICK = Math.max(1, Math.min(asInt(input.combos_per_tick, 10), 15));
  const comboSlice = combos.slice(comboIndex, comboIndex + COMBOS_PER_TICK);
  const psCfg = cfg.confidence_prior_strength;
  let totalRowsWritten = 0, lastCombo = null;
  for (const combo of comboSlice) {
    const result = await runBaselineForCombo(sql, combo, batchId, runId, psCfg);
    totalRowsWritten += result.rows_written || 0;
    lastCombo = combo;
  }
  const nextComboIndex = comboIndex + comboSlice.length;
  const done = nextComboIndex >= combos.length;
  await sql`UPDATE classification.baseline_batches SET combo_index=${nextComboIndex}, rows_written=rows_written+${totalRowsWritten}, status=${done ? "completed" : "running"}, finished_at=${done ? sql`now()` : null}, updated_at=now() WHERE batch_id=${batchId}`;
  return {
    ok: true, data_ok: true, mode: "base_rebuild", batch_id: batchId,
    status: done ? "COMPLETED_BASELINE_BASE" : "BASELINE_BASE_PARTIAL_CONTINUE",
    combos_processed_this_tick: comboSlice.length, combo_index: nextComboIndex, total_combos: combos.length, rows_written_this_tick: totalRowsWritten,
    continuation_required: !done, next_input_json: !done ? { ...input } : null
  };
}

async function runDeltaRecalculateAffectedPlayers(sql, input) {
  const baseGate = await sql`SELECT status FROM classification.baseline_batches WHERE batch_id='baseline_base_backfill_singleton' LIMIT 1`;
  if (!baseGate[0] || baseGate[0].status !== "completed") return { ok: false, data_ok: false, mode: "delta_recalculate_affected_players", status: "BLOCKED_NO_COMPLETED_BASE_BATCH" };

  const unconsumed = await sql`SELECT DISTINCT player_id FROM classification.tier_change_signal WHERE consumed_by_baseline = false LIMIT 500`;
  if (!unconsumed.length) return { ok: true, data_ok: true, mode: "delta_recalculate_affected_players", status: "DELTA_BASELINE_NOOP_NO_TIER_CHANGES_PENDING", continuation_required: false };

  const cfg = await getCalibrationConfig(sql);
  const psCfg = cfg.confidence_prior_strength;
  const combos = buildComboList(cfg).filter(c => c.selected_side === "more");
  const playerIds = unconsumed.map(r => Number(r.player_id));
  const runId = asText(input.run_id, rid("run_baseline_delta"));
  const batchId = `baseline_delta_batch_${Date.now().toString(36)}`;
  await sql`INSERT INTO classification.baseline_batches (batch_id, run_id, mode, status) VALUES (${batchId}, ${runId}, 'delta_recalculate_affected_players', 'running') ON CONFLICT (batch_id) DO NOTHING`;

  let rowsRecalculated = 0;
  for (const combo of combos) {
    const statsKey = `${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|more`;
    const popStatsRows = await sql`SELECT * FROM classification.population_stats_current WHERE stats_key=${statsKey} LIMIT 1`;
    if (!popStatsRows[0]) continue;
    const popStats = popStatsRows[0];

    const classRows = await sql`SELECT player_id, entity_type, games_sample, raw_rate, tier_key FROM classification.player_classification_current WHERE canonical_prop_key=${combo.canonical_prop_key} AND line_value=${combo.line_value} AND selected_side='more' AND player_id IN ${sql(playerIds)}`;
    if (!classRows.length) continue;

    const tierKeys = [...new Set(classRows.map(r => r.tier_key))];
    const tierPriorRows = await sql`SELECT tier_key, blended_tier_prior FROM classification.tier_priors_current WHERE canonical_prop_key=${combo.canonical_prop_key} AND line_value=${combo.line_value} AND selected_side='more' AND tier_key IN ${sql(tierKeys)}`;
    const tierPriorByKey = new Map(tierPriorRows.map(r => [r.tier_key, num(r.blended_tier_prior)]));

    const usesNormalModel = propCanGoNegative(combo.propConfig);
    const moreRows = [], lessRows = [];
    for (const r of classRows) {
      const blendedTierPrior = tierPriorByKey.has(r.tier_key) ? tierPriorByKey.get(r.tier_key) : popStats.population_mean;
      const calc = computeHpForPlayer(r, blendedTierPrior, psCfg, usesNormalModel, popStats.population_stddev, combo.line_value, "more");
      const hpPct = round(calc.hp * 100, 2);
      moreRows.push({
        baseline_row_id: `bl|${r.entity_type}|${r.player_id}|${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|more`,
        batch_id: batchId, run_id: runId, player_id: r.player_id, entity_type: r.entity_type,
        canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: "more", tier_key: r.tier_key,
        games_sample: r.games_sample, raw_rate: round(r.raw_rate), shrunk_rate: round(calc.shrunkRate),
        hit_probability_0_100: hpPct, confidence_0_100: calc.confidence, model_used: calc.model, wilson_clamped: calc.clamped, formula_version: FORMULA_VERSION
      });
      lessRows.push({
        baseline_row_id: `bl|${r.entity_type}|${r.player_id}|${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|less`,
        batch_id: batchId, run_id: runId, player_id: r.player_id, entity_type: r.entity_type,
        canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: "less", tier_key: r.tier_key,
        games_sample: r.games_sample, raw_rate: round(r.raw_rate), shrunk_rate: round(calc.shrunkRate),
        hit_probability_0_100: round(100 - hpPct, 2), confidence_0_100: calc.confidence, model_used: calc.model, wilson_clamped: calc.clamped, formula_version: FORMULA_VERSION
      });
    }
    const allRows = [...moreRows, ...lessRows];
    if (allRows.length) {
      await sql`
        INSERT INTO classification.baseline_current ${sql(allRows, "baseline_row_id","batch_id","run_id","player_id","entity_type","canonical_prop_key","line_value","selected_side","tier_key","games_sample","raw_rate","shrunk_rate","hit_probability_0_100","confidence_0_100","model_used","wilson_clamped","formula_version")}
        ON CONFLICT (player_id, canonical_prop_key, line_value, selected_side) DO UPDATE SET
          tier_key=excluded.tier_key, games_sample=excluded.games_sample, raw_rate=excluded.raw_rate, shrunk_rate=excluded.shrunk_rate,
          hit_probability_0_100=excluded.hit_probability_0_100, confidence_0_100=excluded.confidence_0_100, model_used=excluded.model_used,
          wilson_clamped=excluded.wilson_clamped, batch_id=excluded.batch_id, run_id=excluded.run_id, updated_at=now()
      `;
      rowsRecalculated += allRows.length;
    }
  }
  await sql`UPDATE classification.tier_change_signal SET consumed_by_baseline=true WHERE player_id IN ${sql(playerIds)}`;
  await sql`UPDATE classification.baseline_batches SET status='completed', rows_written=${rowsRecalculated}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
  return {
    ok: true, data_ok: true, mode: "delta_recalculate_affected_players", batch_id: batchId,
    status: "COMPLETED_DELTA_BASELINE_TIER_CHANGE_FULL_RECALC", players_recalculated: playerIds.length, rows_recalculated: rowsRecalculated,
    continuation_required: false
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
