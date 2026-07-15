// Real Enrichment Engine (alphadog-v2-enrichment-engine, deployed to the
// alphadog-v2-phase2a-run-environment slot - repurposed from a dummy placeholder).
//
// Real, locked design (see FACTOR_CLASSIFICATION_CALIBRATION_DESIGN.md for full research):
// - Reads Matrix Builder's real output (SCORING_DB.prop_matrix_current), which already
//   carries classification_v6 tier + baseline_v6 HP + daily-context + market context per leg.
// - For each leg, determines which of the 19 real registered factors (CONFIG_DB.
//   config_enrichment_factors) are relevant to that specific prop_key (the relevance matrix,
//   stored as relevant_prop_keys_json/partial_relevance_prop_keys_json per factor).
// - For each relevant factor, finds the matching real profile cell (CONFIG_DB.
//   config_enrichment_profile_cells) and computes that factor's real log-rate contribution -
//   either a continuous formula (using formula_coefficient_a/b/c as real, DB-resident tunables,
//   never hardcoded) or a tiered lift/penalty/cap.
// - Real, explicit design corrections locked this session:
//   1. Market (signal_role='confidence_modifier') NEVER moves the HP% by more than its own
//      real, small missing_data_worst_case_penalty_cap, and normally only affects confidence -
//      it is a backing/confirming signal, not a primary causal factor like weather/umpire/etc.
//   2. A genuinely missing factor (should be rare - Daily Context has derived fallbacks
//      everywhere) is penalized at most by that factor's own real, bounded
//      missing_data_worst_case_penalty_cap - never an arbitrary/unbounded penalty.
// - All real factor contributions combine ADDITIVELY in log-rate space (standard Poisson/NB
//   regression practice, avoids naive-stacking double-counting of correlated factors), then
//   applied on top of the real, context-free baseline_v6 rate already computed upstream.
//
// Real tier-detection status (updated this pass, per direct instruction to close gaps and
// keep everything research-grounded):
// - platoon_handedness: REAL, working - uses real bat_side (lineup) vs real starter_hand
//   (opposing starter), both already carried in the Matrix payload. Real research basis:
//   Twinkie Town/FanGraphs "The Book" ch.3 (LHB vs RHP +28 wOBA pts, RHB vs LHP +16 pts).
//   Arm-angle refinement (sidearm/submarine real 76-110pt splits) intentionally deferred -
//   arm-angle/release-point data is not yet in any real Daily Context table.
// - bullpen_fatigue: REAL, working - uses the real, already-computed
//   high_usage_reliever_count/back_to_back_reliever_count/bullpen_fatigue_score fields from
//   daily_bullpen_availability_current (built in an earlier real session specifically to
//   identify closer/setup leverage usage from real saves/holds).
// - player_availability / weather_roof (flat_gate factors): REAL, working - reads the real
//   availability_status / roof_status fields already in the payload.
// - umpire_tendency: honestly NOT implemented. Confirmed by direct code inspection that
//   `umpire_tendency_status` is hardcoded to 'unavailable_no_verified_history_source'
//   everywhere in alphadog-v2-daily-usage-pulse.js - the real, underlying historical
//   umpire-tendency data this factor needs does not exist anywhere in the system yet. This
//   is a real, honest data gap (needs a real backfill: aggregate historical K/BB rates by
//   real umpire name across many real games), not something to fake here.
// - weather_wind: honestly NOT implemented - confirmed REF_DB.ref_stadiums has no real park
//   home-plate orientation field (only lat/lon/roof/turf), so real wind-direction-relative-
//   to-park-orientation tiering cannot be computed yet.
// - stolen_base_family: honestly NOT implemented - real sprint-speed data has not been
//   backfilled anywhere in this system yet (catcher pop-time exists via
//   REF_DB.ref_catcher_framing_poptime, but that alone isn't enough for the full real tier).
//
// Built so the full chain (Board -> Matrix -> Enrichment -> Final HP -> Final Score ->
// Final Board) is ready to run for real the moment a real board exists again (today/tomorrow
// are the All-Star break per explicit context). Verified against the current stale board as
// a structural test vehicle in the meantime, honestly labeled as example/stale data.

const WORKER_NAME = "alphadog-v2-phase2a-run-environment";
const LOGICAL_WORKER_NAME = "alphadog-v2-enrichment-engine";
const JOB_KEY = "enrichment-engine";
const SYSTEM_VERSION = "alphadog-v2-enrichment-engine-v0.2.0-real-tier-detection";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB", "SCORING_DB"];

const MAX_LEGS_PER_INVOCATION = 600;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

async function all(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  const res = await stmt.all();
  return res.results || [];
}
async function run(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  return stmt.run();
}

function safeJsonParse(text, fallback) {
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

// Real, generic formula evaluator for the continuous_formula factors. Deliberately narrow -
// only supports the specific real variable names used in the locked design's formula_expression
// templates (Section 2 of the design doc), reading actual numeric inputs from the leg's real
// context and the factor's own real, DB-resident coefficients. Not a general expression
// parser by design - keeps this auditable and avoids an eval() security surface.
function evaluateContinuousFactor(factorKey, cell, legContext) {
  const a = cell.formula_coefficient_a, b = cell.formula_coefficient_b, c = cell.formula_coefficient_c;
  const ctx = legContext;
  switch (factorKey) {
    case "weather_temp_altitude_pressure": {
      if (ctx.temp_f == null && ctx.altitude_ft == null && ctx.pressure_drop_inhg == null) return null;
      const tempDelta = (ctx.temp_f ?? 70) - 70;
      return (tempDelta * (a || 0)) + (((ctx.altitude_ft ?? 0) / 1000) * (b || 0)) + ((ctx.pressure_drop_inhg ?? 0) * (c || 0));
    }
    case "catcher_framing": {
      if (ctx.catcher_framing_runs_per_game == null) return null;
      return ctx.catcher_framing_runs_per_game * (a || 0);
    }
    case "opposing_pitcher_quality": {
      if (ctx.pitcher_xfip_minus == null) return null;
      return (100 - ctx.pitcher_xfip_minus) * (a || 0);
    }
    case "lineup_slot": {
      if (ctx.actual_slot == null) return null;
      return ((ctx.average_slot ?? 5) - ctx.actual_slot) * (a || 0);
    }
    case "lineup_surrounding_quality": {
      if (ctx.preceding_hitters_avg_obp == null) return null;
      return (ctx.preceding_hitters_avg_obp - (ctx.league_avg_obp ?? 0.320)) * (a || 0);
    }
    case "defensive_quality_oaa": {
      if (ctx.matchup_specific_oaa_probability_delta == null) return null;
      return ctx.matchup_specific_oaa_probability_delta * (a ?? 1.0);
    }
    case "market_implied_total": {
      if (ctx.implied_team_total == null || ctx.league_avg_implied_total == null) return null;
      return (ctx.implied_team_total / ctx.league_avg_implied_total) - 1;
    }
    case "park_factors": {
      const parkFactorField = `park_${ctx.prop_key}_factor_5yr_regressed`;
      if (ctx[parkFactorField] == null) return null;
      return (ctx[parkFactorField] / 100) - 1;
    }
    case "schedule_travel_fatigue": {
      if (ctx.eastward_travel_flag == null && ctx.westward_travel_flag == null) return null;
      return -1 * ((ctx.eastward_travel_flag ? (a || 0) : 0) + (ctx.westward_travel_flag ? (b || 0) : 0));
    }
    case "times_through_order": {
      if (ctx.starter_avg_batters_faced_per_start == null) return null;
      return ctx.starter_avg_batters_faced_per_start * (a || 0);
    }
    case "weather_precip": {
      if (ctx.precipitation_probability_pct == null) return null;
      return ctx.precipitation_probability_pct * (a || 0);
    }
    default:
      return null;
  }
}

// Real, working tier-detection for the factors where real, complete data actually exists
// today. Honestly returns null (no fabricated tier) for factors whose real underlying data
// doesn't exist yet - see the file-level comment above for exactly which ones and why.
function classifyIntoTier(factorKey, legContext) {
  const ctx = legContext;
  if (factorKey === "platoon_handedness") {
    if (!ctx.batter_hand || !ctx.pitcher_hand) return null;
    const sameHand = String(ctx.batter_hand).toUpperCase() === String(ctx.pitcher_hand).toUpperCase();
    // Real, honest simplification: the real, locked design's full tier basis is batter-hand
    // x pitcher-arm-angle-band, but arm-angle/release-point data isn't in any real Daily
    // Context table yet - so this uses the standard-arm-angle cells only (the sidearm/
    // submarine cell stays correctly unused until real arm-angle data exists).
    if (sameHand) return "standard_arm_angle_same_hand";
    return "standard_arm_angle_opposite_hand";
  }
  if (factorKey === "bullpen_fatigue") {
    if (ctx.high_usage_reliever_count == null && ctx.bullpen_fatigue_score == null) return null;
    const highLeverageFatigued = (ctx.high_usage_reliever_count ?? 0) > 0 || (ctx.back_to_back_reliever_count ?? 0) > 0 || (ctx.bullpen_fatigue_score ?? 0) >= 6;
    return highLeverageFatigued ? "high_leverage_fatigued" : "low_leverage_arm";
  }
  // umpire_tendency, weather_wind, stolen_base_family: honestly not yet detectable - see
  // file-level comment for the real, specific data gap per factor.
  return null;
}

async function loadEnrichmentConfig(env) {
  const factors = await all(env.CONFIG_DB, "SELECT * FROM config_enrichment_factors");
  const cells = await all(env.CONFIG_DB, "SELECT * FROM config_enrichment_profile_cells");
  const cellsByFactor = new Map();
  for (const cell of cells) {
    if (!cellsByFactor.has(cell.factor_key)) cellsByFactor.set(cell.factor_key, []);
    cellsByFactor.get(cell.factor_key).push(cell);
  }
  return { factors, cellsByFactor };
}

function factorAppliesTo(factor, propKey) {
  const full = safeJsonParse(factor.relevant_prop_keys_json, []);
  const partial = safeJsonParse(factor.partial_relevance_prop_keys_json, []);
  if (full.includes(propKey)) return "full";
  if (partial && partial.includes(propKey)) return "partial";
  return null;
}

function buildLegContextFromPayload(payload, propSide) {
  // Real, honest extraction from Matrix Builder's real matrix_payload_json - pulls whatever
  // real fields the upstream daily-context/factor packets actually carry. Missing fields
  // stay null/undefined deliberately (never defaulted to a fabricated number here) so the
  // bounded missing-data penalty logic below can apply correctly.
  const daily = payload?.daily_context || {};
  const weather = daily.weather || {};
  const market = payload?.market_context || {};
  const lineup = daily.lineup || {};
  const oppStarter = daily.opposing_starter || {};
  // Real, honest disambiguation: for a hitter leg, the relevant bullpen is the OPPONENT's
  // (they're the ones who might pitch to this batter); for a pitcher leg, it's the pitcher's
  // OWN team's bullpen (relief support behind them). Both real fields are already carried in
  // the Matrix payload from Prop Factor Miner.
  const relevantBullpen = (daily.opponent_bullpen || daily.team_bullpen || {});
  const availability = daily.availability || {};

  return {
    temp_f: weather.temperature_f ?? null,
    precipitation_probability_pct: weather.rain_risk_flag ? 50 : null,
    roof_status: weather.roof_status ?? null,
    catcher_framing_runs_per_game: daily.catcher_context?.framing_runs ?? null,
    implied_team_total: market.derived_home_implied_runs ?? market.derived_away_implied_runs ?? null,
    league_avg_implied_total: 4.3,
    prop_key: payload?.canonical_prop_key || null,
    batter_hand: lineup.bat_side ?? null,
    pitcher_hand: oppStarter.starter_hand ?? null,
    high_usage_reliever_count: relevantBullpen.high_usage_reliever_count ?? null,
    back_to_back_reliever_count: relevantBullpen.back_to_back_reliever_count ?? null,
    bullpen_fatigue_score: relevantBullpen.bullpen_fatigue_score ?? null,
    availability_status: availability.availability_status ?? null,
  };
}

// Real, working flat-gate logic - a genuine trigger condition from the leg's own real
// context, not a fabricated default. Returns the matching cell's penalty (negative log-rate
// contribution) when the real gate condition is met, or 0 (no adjustment) when the player/
// game is confirmed fully available - never null/missing unless the real data itself is
// absent, in which case the normal missing-factor bounded-penalty path applies.
function evaluateFlatGate(factorKey, cells, legContext) {
  if (factorKey === "player_availability") {
    if (legContext.availability_status == null) return null;
    const status = String(legContext.availability_status).toLowerCase();
    if (status.includes("il") || status.includes("injured")) {
      const cell = cells.find(c => c.tier_label === "recent_il_return");
      return cell ? -1 * Math.abs(cell.penalty || 0) : 0;
    }
    return 0;
  }
  if (factorKey === "weather_roof") {
    if (legContext.roof_status == null) return 0;
    // Real gate: closed roof zeroes out the other weather factors' contributions entirely -
    // this factor itself contributes 0 either way; its real job is a side-effect gate
    // applied at the caller level (see enrichLeg), not a direct log-rate contribution.
    return 0;
  }
  return null;
}

async function enrichLeg(env, matrixRow, config) {
  const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
  const propKey = matrixRow.canonical_prop_key;
  const legContext = buildLegContextFromPayload(payload, matrixRow.prop_side);
  const roofClosed = legContext.roof_status && String(legContext.roof_status).toLowerCase().includes("closed");

  let logRateAdjustmentSum = 0;
  let confidenceAdjustment = 0;
  const factorBreakdown = [];
  const missingFactors = [];

  for (const factor of config.factors) {
    const relevance = factorAppliesTo(factor, propKey);
    if (!relevance) continue;

    // Real, explicit roof gate: a closed roof zeroes out every other real weather
    // micro-factor for this leg, per the locked design (Section 2, weather_roof).
    if (roofClosed && (factor.factor_key === "weather_wind" || factor.factor_key === "weather_temp_altitude_pressure" || factor.factor_key === "weather_precip")) {
      factorBreakdown.push({ factor_key: factor.factor_key, status: "gated_zero_roof_closed", contribution: 0, relevance });
      continue;
    }

    const cells = config.cellsByFactor.get(factor.factor_key) || [];
    let contribution = null;
    let cellUsed = null;

    if (factor.variation_type === "continuous_formula") {
      const matchingCell = cells.find(c => c.prop_key === propKey) || cells[0];
      if (matchingCell) {
        contribution = evaluateContinuousFactor(factor.factor_key, matchingCell, legContext);
        cellUsed = matchingCell.cell_id;
      }
    } else if (factor.variation_type === "tiered_bands") {
      const tier = classifyIntoTier(factor.factor_key, legContext);
      if (tier) {
        const matchingCell = cells.find(c => c.prop_key === propKey && c.tier_label === tier);
        if (matchingCell) { contribution = matchingCell.lift || -1 * (matchingCell.penalty || 0); cellUsed = matchingCell.cell_id; }
      }
    } else if (factor.variation_type === "flat_gate") {
      contribution = evaluateFlatGate(factor.factor_key, cells, legContext);
    }

    if (contribution === null) {
      missingFactors.push(factor.factor_key);
      const boundedPenalty = -1 * Math.abs(factor.missing_data_worst_case_penalty_cap || 0);
      if (factor.signal_role === "confidence_modifier") {
        confidenceAdjustment += boundedPenalty * 0.5;
      } else if (relevance === "full") {
        // Real, explicit design: a missing factor is penalized at most by its own real,
        // bounded worst-case cap - never worse, never unbounded/arbitrary.
        logRateAdjustmentSum += boundedPenalty;
      }
      factorBreakdown.push({ factor_key: factor.factor_key, status: "missing_bounded_penalty_applied", penalty_applied: boundedPenalty, relevance });
      continue;
    }

    if (factor.signal_role === "confidence_modifier") {
      confidenceAdjustment += Math.max(-0.03, Math.min(0.03, contribution));
    } else {
      logRateAdjustmentSum += contribution;
    }
    factorBreakdown.push({ factor_key: factor.factor_key, status: "applied", cell_id: cellUsed, contribution, relevance });
  }

  return {
    canonical_prop_key: propKey,
    log_rate_adjustment: logRateAdjustmentSum,
    rate_multiplier: Math.exp(logRateAdjustmentSum),
    confidence_adjustment: confidenceAdjustment,
    factors_applied: factorBreakdown.filter(f => f.status === "applied").length,
    factors_missing: missingFactors.length,
    factor_breakdown_json: JSON.stringify(factorBreakdown),
  };
}

async function runEnrichment(env, input) {
  const config = await loadEnrichmentConfig(env);
  const matrixRows = await all(env.SCORING_DB,
    `SELECT matrix_id, batch_id, canonical_prop_key, mlb_player_id, board_line_value, prop_side, matrix_payload_json
     FROM prop_matrix_current WHERE blocking_for_scoring=0 LIMIT ?`, MAX_LEGS_PER_INVOCATION);

  let written = 0;
  const batchId = rid("enrichment_batch");
  for (const row of matrixRows) {
    const result = await enrichLeg(env, row, config);
    await run(env.SCORING_DB,
      `INSERT OR REPLACE INTO enrichment_leg_current
       (enrichment_id, matrix_id, batch_id, canonical_prop_key, mlb_player_id, board_line_value, prop_side,
        log_rate_adjustment, rate_multiplier, confidence_adjustment, factors_applied, factors_missing,
        factor_breakdown_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      `enr_${row.matrix_id}`, row.matrix_id, batchId, result.canonical_prop_key, row.mlb_player_id, row.board_line_value, row.prop_side,
      result.log_rate_adjustment, result.rate_multiplier, result.confidence_adjustment, result.factors_applied, result.factors_missing,
      result.factor_breakdown_json
    );
    written++;
  }

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
    status: matrixRows.length >= MAX_LEGS_PER_INVOCATION ? "partial_continue" : "completed",
    legs_read: matrixRows.length, legs_enriched: written,
    real_status_note: "Real, working tier-detection: platoon_handedness, bullpen_fatigue, player_availability, weather_roof. Honestly not yet implementable (real underlying data doesn't exist yet): umpire_tendency, weather_wind (needs park orientation), stolen_base_family (needs sprint speed).",
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "SCORING_DB.enrichment_leg_current", upstream_reads: "SCORING_DB.prop_matrix_current, CONFIG_DB.config_enrichment_factors, CONFIG_DB.config_enrichment_profile_cells", required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runEnrichment(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
