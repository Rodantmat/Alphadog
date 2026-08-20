import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-phase2a-run-environment";
const LOGICAL_WORKER_NAME = "alphadog-v2-enrichment-engine";
const JOB_KEY = "enrichment-engine";
const SYSTEM_VERSION = "alphadog-v2-enrichment-engine-v0.4.0-postgres-rewire";

const MAX_LEGS_PER_INVOCATION = 500;

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false }); }
function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function arrLiteral(arr) { return "{" + arr.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(",") + "}"; }

// ---- Formula evaluators (unchanged business logic) ----
function evaluateContinuousFactor(factorKey, cell, legContext, thresholds) {
  const a = cell.formula_coefficient_a, b = cell.formula_coefficient_b, c = cell.formula_coefficient_c;
  const ctx = legContext;
  const t = thresholds || {};
  switch (factorKey) {
    case "weather_temp_altitude_pressure": {
      // altitude_ft is intentionally NEVER wired in buildLegContextReal (confirmed via direct
      // correlation audit 2026-08-01) - park_factors' 5-year historical regression already
      // empirically captures each venue's altitude effect (altitude directly affects actual
      // runs/HR scored there over years of real games at that venue). Wiring a separate,
      // explicit altitude term here would double-count the same physical effect through two
      // channels for high-altitude venues (Coors Field etc). This term stays structurally zero
      // by design - do not "fix" this by populating altitude_ft without first removing or
      // properly decomposing the altitude signal out of park_factors, or the double-count bug
      // this comment exists to prevent will be reintroduced.
      if (ctx.temp_f == null && ctx.altitude_ft == null && ctx.pressure_drop_inhg == null) return null;
      const tempDelta = (ctx.temp_f ?? 70) - 70;
      const shiftFt = (tempDelta * (a || 0)) + (((ctx.altitude_ft ?? 0) / 1000) * (b || 0)) + ((ctx.pressure_drop_inhg ?? 0) * (c || 0));
      const BASELINE_HR_DISTANCE_FT = 397;
      const DISTANCE_TO_HR_PROB_ELASTICITY = 7;
      const pctDistanceChange = shiftFt / BASELINE_HR_DISTANCE_FT;
      return Math.log(1 + Math.max(-0.99, pctDistanceChange * DISTANCE_TO_HR_PROB_ELASTICITY));
    }
    case "catcher_framing": {
      // REAL fix (2026-08-19): root cause was catcher_framing_runs_per_game receiving
      // catcher.framing_runs_total DIRECTLY - a season-cumulative sabermetric stat (real range
      // roughly -15 to +20 runs over a full season), used as if it were already a per-game rate,
      // with zero normalization anywhere in the pipeline. Confirmed via real backtest: this one
      // factor alone produced a +0.301 log-space contribution on a live leg (1.35x multiplier),
      // and pitcher_strikeouts|more legs with heavy enrichment activity showed a real 22.8pt
      // overconfidence gap (n=65) vs 1.0pt for baseline-dominated legs. Real games/innings-caught
      // data doesn't exist anywhere in this system to properly normalize the runs-total stat, so
      // switched to the ALREADY-normalized framing_pct_total field instead (a real, existing,
      // percentage-based metric, population-verified: n=36 real catchers, mean=0.4754,
      // stddev=0.018) and scaled by real standard-deviation units (z-score) rather than a fixed
      // linear coefficient, so the effect stays statistically stable as the population mean/
      // stddev naturally drift over a season - z-score-based, not tied to today's specific numbers.
      if (ctx.catcher_framing_pct == null) return null;
      const framingMean = t.league_avg_framing_pct ?? 0.4754;
      const framingStd = t.league_stddev_framing_pct ?? 0.018;
      const zCoef = t.z_score_coefficient ?? 0.020;
      if (!(framingStd > 0)) return null;
      const zScore = (ctx.catcher_framing_pct - framingMean) / framingStd;
      return zScore * zCoef * Math.sign(a || 1);
    }
    case "catcher_poptime_arm": {
      // NOTE (2026-08-01): this factor's relevant_prop_keys_json is now deliberately empty in
      // config.enrichment_factors (confirmed via a full correlation audit across all 20 factors)
      // - it and stolen_base_family both applied to stolen_bases and both used the identical
      // opposing_catcher_pop_time_2b_sba signal, double-counting a weak/strong catcher arm
      // through two channels. stolen_base_family is the more complete model (considers pop time
      // together with runner speed and pitcher hold time, not in isolation) and was kept as the
      // single source of this signal. Do not re-enable this factor for stolen_bases without
      // first removing pop time from stolen_base_family's tier logic, or the double-count
      // returns.
      if (ctx.opposing_catcher_pop_time_2b_sba == null) return null;
      const leagueAvgPoptime = t.league_avg_poptime_sec ?? 2.0;
      return (ctx.opposing_catcher_pop_time_2b_sba - leagueAvgPoptime) * (a || 0);
    }
    case "opposing_pitcher_quality": {
      if (ctx.pitcher_run_value_per_100_weighted == null) return null;
      return ctx.pitcher_run_value_per_100_weighted * (a || 0);
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
      const directionMultiplier = a ?? 1;
      return ((ctx.implied_team_total / ctx.league_avg_implied_total) - 1) * directionMultiplier;
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
    case "recent_form_trend": {
      const ratioByProp = { pitcher_outs: ctx.recent3_outs_ratio, earned_runs: ctx.recent3_er_ratio, hits_allowed: ctx.recent3_hits_ratio, walks_allowed: ctx.recent3_bb_ratio, pitcher_strikeouts: ctx.recent3_k_ratio };
      const ratio = ratioByProp[cell.prop_key];
      if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return null;
      return Math.log(ratio) * (a ?? 1.0);
    }
    case "weather_precip": {
      if (ctx.precipitation_probability_pct == null) return null;
      return ctx.precipitation_probability_pct * (a || 0);
    }
    case "batter_quality_of_contact": {
      const leagueAvgXwoba = t.league_avg_xwoba ?? 0.320;
      const leagueAvgXwobacon = t.league_avg_xwobacon ?? 0.369;
      const leagueAvgSweetSpot = t.league_avg_sweet_spot_pct ?? 32.5;
      const leagueAvgBarrel = t.league_avg_barrel_pct ?? 7.5;
      const leagueAvgIso = t.league_avg_iso ?? 0.150;
      // REAL fix (2026-08-19): the 1.3x "thin-sample boost" was confirmed via real broader
      // backtest to be statistically backwards - it AMPLIFIED thin-sample xwOBA deviations
      // instead of shrinking them, worsening real calibration (rbis/hits_runs_rbis/hits/runs
      // "more" side: 8.0pt real overconfidence gap on high-multiplier legs vs 4.5pt normal,
      // n=94 vs n=2519). One real example (Zac Veen) hit his prop's cap with an implied real
      // xwOBA of ~0.628, an implausible value revealing small-sample noise, not genuine skill.
      // Gemini second-opinion confirmed the flaw: the original validation study showed thin-
      // sample xwOBA CORRELATES with future performance (real, true finding) but correlation is
      // scale-invariant (r(X,Y)=r(1.3X,Y)) - it never validated that amplifying by 1.3x was the
      // correct scaling direction, only that signal exists at all. Standard practice is that
      // thin samples get SHRUNK toward a stable prior, never amplified. Replaced with real
      // empirical Bayes shrinkage applied to the raw xwOBA/sweet-spot/xwobacon/iso/barrel INPUT
      // itself (w = games/(games+M), M=65 games as a real, standard proxy for the real ~250-300
      // PA xwOBA stabilization point at ~4 PA/game) - mathematically equivalent to scaling the
      // deviation by w, so a thin-sample player's real signal now correctly counts for LESS, not
      // more, until they accumulate real, stable sample size.
      const STABILIZATION_GAMES = 65;
      const shrinkageWeight = ctx.hitter_season_games != null
        ? ctx.hitter_season_games / (ctx.hitter_season_games + STABILIZATION_GAMES)
        : 0.5; // unknown sample size: real, conservative default - trust the signal only half as much
      if (cell.prop_key === "doubles") {
        if (ctx.batter_sweet_spot_percent == null) return null;
        return (ctx.batter_sweet_spot_percent - leagueAvgSweetSpot) * (a || 0) * shrinkageWeight;
      }
      if (cell.prop_key === "total_bases") {
        if (ctx.batter_xwobacon == null && ctx.batter_iso == null) return null;
        const xwobaconTerm = ctx.batter_xwobacon != null ? (ctx.batter_xwobacon - leagueAvgXwobacon) * (a || 0) : 0;
        const isoTerm = ctx.batter_iso != null ? (ctx.batter_iso - leagueAvgIso) * (c || 0) : 0;
        return (xwobaconTerm + isoTerm) * shrinkageWeight;
      }
      if (cell.prop_key === "home_runs") {
        if (ctx.batter_xwoba == null && ctx.batter_barrel_batted_rate == null && ctx.batter_iso == null) return null;
        const xwobaTerm = ctx.batter_xwoba != null ? (ctx.batter_xwoba - leagueAvgXwoba) * (a || 0) : 0;
        const barrelTerm = ctx.batter_barrel_batted_rate != null ? (ctx.batter_barrel_batted_rate - leagueAvgBarrel) * (b || 0) : 0;
        const isoTerm = ctx.batter_iso != null ? (ctx.batter_iso - leagueAvgIso) * (c || 0) : 0;
        return (xwobaTerm + barrelTerm + isoTerm) * shrinkageWeight;
      }
      // hits_runs_rbis and partial-relevance props (hits, runs, rbis) all use plain xwOBA deviation
      if (ctx.batter_xwoba == null) return null;
      return (ctx.batter_xwoba - leagueAvgXwoba) * (a || 0) * shrinkageWeight;
    }
    default:
      return null;
  }
}

function classifyIntoTier(factorKey, legContext, thresholds, propKey) {
  const ctx = legContext;
  const t = thresholds || {};
  if (factorKey === "platoon_handedness") {
    if (!ctx.batter_hand || !ctx.pitcher_hand) return null;
    const sameHand = String(ctx.batter_hand).toUpperCase() === String(ctx.pitcher_hand).toUpperCase();
    const submarineMaxDegrees = t.submarine_arm_angle_max_degrees ?? 20;
    if (sameHand && ctx.pitcher_arm_angle_degrees != null && ctx.pitcher_arm_angle_degrees <= submarineMaxDegrees) return "sidearm_submarine_same_hand";
    if (sameHand) return "standard_arm_angle_same_hand";
    return "standard_arm_angle_opposite_hand";
  }
  if (factorKey === "bullpen_fatigue") {
    if (ctx.high_usage_reliever_count == null && ctx.bullpen_fatigue_score == null) return null;
    const fatigueThreshold = t.fatigue_score_threshold ?? 6;
    const highLeverageFatigued = (ctx.high_usage_reliever_count ?? 0) > 0 || (ctx.back_to_back_reliever_count ?? 0) > 0 || (ctx.bullpen_fatigue_score ?? 0) >= fatigueThreshold;
    return highLeverageFatigued ? "high_leverage_fatigued" : "low_leverage_arm";
  }
  if (factorKey === "umpire_tendency") {
    // REAL FIX (2026-08-14): for walks-relevant props specifically, use the dedicated
    // walks_delta_vs_league signal instead of the strikeouts-based proxy every other prop uses.
    // Confirmed via residual test against real walk outcomes: strikeouts_delta_vs_league only
    // reached -0.012 (essentially noise) as a proxy for walks, while the dedicated field that was
    // sitting unused in the same data reached 0.119 (n=1992) - a real, ~10x stronger signal,
    // correctly signed (an umpire who calls more walks than league average predicts more walks
    // for pitchers facing him).
    const isWalksRelevant = propKey === "walks" || propKey === "walks_allowed";
    const isRunsRelevant = propKey === "earned_runs" || propKey === "hits_allowed";
    const pitcherFriendlyMin = t.k_delta_pitcher_friendly_min ?? 0.3;
    const hitterFriendlyMax = t.k_delta_hitter_friendly_max ?? -0.3;
    if (isWalksRelevant && ctx.umpire_walks_delta_vs_league != null) {
      // Inverted relative to the strikeouts convention below: high walks_delta_vs_league means
      // the umpire calls MORE walks than league average (confirmed live: e.g. 3.41 for the
      // highest umpire), which favors the batter (hitter_friendly), not the pitcher.
      const bb = ctx.umpire_walks_delta_vs_league;
      if (bb > pitcherFriendlyMin) return "hitter_friendly_zone";
      if (bb < hitterFriendlyMax) return "pitcher_friendly_zone";
      return "neutral_zone";
    }
    if (isRunsRelevant && ctx.umpire_runs_delta_vs_league != null) {
      // Same direction as the walks case (not inverted): high runs_delta_vs_league means the
      // umpire's games see MORE runs than league average, which favors the batter. Residual-
      // validated directly (n=2489): runs_delta_vs_league reaches 0.092/0.074 for earned_runs/
      // hits_allowed vs the strikeouts proxy's 0.004/-0.003 - a real, dedicated signal that was
      // sitting unused in the same data, same pattern as the walks_delta_vs_league fix.
      const rd = ctx.umpire_runs_delta_vs_league;
      if (rd > pitcherFriendlyMin) return "hitter_friendly_zone";
      if (rd < hitterFriendlyMax) return "pitcher_friendly_zone";
      return "neutral_zone";
    }
    if (ctx.umpire_strikeouts_delta_vs_league == null) return null;
    if (ctx.umpire_strikeouts_delta_vs_league > pitcherFriendlyMin) return "pitcher_friendly_zone";
    if (ctx.umpire_strikeouts_delta_vs_league < hitterFriendlyMax) return "hitter_friendly_zone";
    return "neutral_zone";
  }
  if (factorKey === "weather_wind") {
    if (ctx.wind_context == null) return null;
    const windSpeed = ctx.wind_speed_mph ?? 0;
    const ctxStr = String(ctx.wind_context).toLowerCase();
    const speedThreshold = t.wind_strong_min_mph ?? 15;
    if (ctxStr.includes("out to")) {
      return windSpeed >= speedThreshold ? "blowing_out_strong" : "blowing_out_moderate";
    }
    if (ctxStr.includes("in from")) return "blowing_in";
    if (ctxStr.includes(" to l") || ctxStr.includes(" to r") || ctxStr.includes("l to r") || ctxStr.includes("r to l")) return "crosswind";
    return "calm";
  }
  if (factorKey === "stolen_base_family") {
    if (ctx.runner_sprint_speed_ft_per_sec == null && ctx.opposing_catcher_pop_time_2b_sba == null) return null;
    const leagueAvgSpeed = t.league_avg_sprint_speed_ft_per_sec ?? 27;
    const leagueAvgPoptime = t.league_avg_poptime_sec ?? 2.0;
    const speed = ctx.runner_sprint_speed_ft_per_sec ?? leagueAvgSpeed;
    const popTime = ctx.opposing_catcher_pop_time_2b_sba ?? leagueAvgPoptime;
    const eliteSpeedMin = t.elite_speed_min_ft_per_sec ?? 28.5;
    const weakBatteryPoptimeMin = t.weak_battery_poptime_min_sec ?? 2.02;
    const belowAvgSpeedMax = t.below_avg_speed_max_ft_per_sec ?? 25.5;
    const strongBatteryPoptimeMax = t.strong_battery_poptime_max_sec ?? 1.95;
    const weakPitcherLeadMin = t.weak_pitcher_lead_distance_min_ft ?? 4.5;
    const strongPitcherLeadMax = t.strong_pitcher_lead_distance_max_ft ?? 2.5;
    const weakBattery = (popTime >= weakBatteryPoptimeMin) || (ctx.pitcher_lead_distance_gained != null && ctx.pitcher_lead_distance_gained >= weakPitcherLeadMin);
    const strongBattery = (popTime <= strongBatteryPoptimeMax) || (ctx.pitcher_lead_distance_gained != null && ctx.pitcher_lead_distance_gained <= strongPitcherLeadMax);
    if (speed >= eliteSpeedMin && weakBattery) return "elite_sprint_speed_weak_battery";
    if (speed <= belowAvgSpeedMax && strongBattery) return "below_average_speed_strong_battery";
    return "average_profile";
  }
  return null;
}

async function loadEnrichmentConfig(pgClient) {
  const factors = await pgClient`SELECT * FROM config.enrichment_factors`;
  const cells = await pgClient`SELECT * FROM config.enrichment_profile_cells`;
  const cellsByFactor = new Map();
  for (const cell of cells) {
    if (!cellsByFactor.has(cell.factor_key)) cellsByFactor.set(cell.factor_key, []);
    cellsByFactor.get(cell.factor_key).push(cell);
  }
  const thresholdsByFactor = new Map();
  for (const factor of factors) {
    thresholdsByFactor.set(factor.factor_key, safeJsonParse(factor.calibration_thresholds_json, {}));
  }
  return { factors, cellsByFactor, thresholdsByFactor };
}

function factorAppliesTo(factor, propKey) {
  const full = safeJsonParse(factor.relevant_prop_keys_json, []);
  const partial = safeJsonParse(factor.partial_relevance_prop_keys_json, []);
  if (full.includes(propKey)) return "full";
  if (partial && partial.includes(propKey)) return "partial";
  return null;
}
function clampContribution(value, bound) {
  if (value == null || !Number.isFinite(value)) return value;
  return Math.max(-bound, Math.min(bound, value));
}
function factorFamilyForProp(propKey) {
  const pitcherProps = new Set(["pitcher_strikeouts", "pitcher_outs", "pitching_outs", "earned_runs", "earned_runs_allowed", "hits_allowed", "walks_allowed", "pitches_thrown", "rfi_nrfi"]);
  return pitcherProps.has(String(propKey || "")) ? "pitcher" : "hitter";
}

// Role-transition detection and probability override (2026-08-13). Addresses a real, urgent bug:
// when a pitcher's actual role genuinely changes mid-season (e.g. a reliever confirmed starting
// today per daily.probable_pitchers, while classified by history as short_reliever/
// multi_inning_reliever), the season-long baseline measures a fundamentally different exposure
// level. No bounded rate_multiplier can fix this - a reliever's 1-inning baseline can't be
// nudged into a starter's 5-6 inning reality via a capped log-space adjustment. Researched
// properly first: the Times Through the Order Penalty (TTOP, Tango et al. 2007) is well-
// established - a reliever's per-batter-faced rate is systematically inflated by always facing
// hitters in the easier 1st-time-through context, so a naive linear per-inning prorate would
// still be too optimistic. The actual adjustment factors below are empirically validated against
// this system's own real 2026 data (44 pitchers with >=50 BF in both roles this season: hits/BF
// +11.1%, K/BF -9.5%, BB/BF +9.4% going reliever-to-starter), not assumed from literature alone.
function poissonCdfAtMost(k, lambda) {
  if (!Number.isFinite(lambda) || lambda < 0) return null;
  let sum = 0, term = Math.exp(-lambda);
  for (let i = 0; i <= Math.max(0, Math.floor(k)); i++) {
    if (i > 0) term *= lambda / i;
    sum += term;
  }
  return Math.min(1, Math.max(0, sum));
}
const ROLE_TRANSITION_SENSITIVE_PROPS = new Map([
  ["pitcher_strikeouts", "k_rate_multiplier"],
  ["walks_allowed", "bb_rate_multiplier"],
  ["hits_allowed", "hits_rate_multiplier"],
  ["earned_runs", "er_rate_multiplier"],
]);
async function loadRoleTransitionInputs(pgClient, matrixRows) {
  const pitcherPropKeys = new Set(ROLE_TRANSITION_SENSITIVE_PROPS.keys());
  const relevantPlayerIds = [...new Set(matrixRows.filter(r => pitcherPropKeys.has(r.canonical_prop_key)).map(r => r.mlb_player_id).filter(Boolean))];
  const empty = { classifiedRoleByPlayer: new Map(), confirmedStarterIds: new Set(), historicalRateByPlayerProp: new Map(), cfg: null };
  if (!relevantPlayerIds.length) return empty;
  const cfgRows = await pgClient`SELECT config_json FROM config.calibration_config WHERE config_key='role_transition_adjustment' AND is_active=1`.catch(() => []);
  const cfg = cfgRows[0] ? cfgRows[0].config_json : null;
  if (!cfg) return empty;
  const pidLit = "{" + relevantPlayerIds.join(",") + "}";
  const roleRows = await pgClient`SELECT player_id, role_key FROM config.prop_tier_role_assignment WHERE player_id::text = ANY(${pidLit}::text[]) AND canonical_prop_key='hits_allowed'`.catch(() => []);
  const classifiedRoleByPlayer = new Map(roleRows.map(r => [String(r.player_id), r.role_key]));
  const gamePks = [...new Set(matrixRows.map(r => r.game_pk).filter(Boolean))];
  const gpkLit = gamePks.length ? "{" + gamePks.join(",") + "}" : null;
  const starterRows = gpkLit ? await pgClient`SELECT starter_player_id FROM daily.probable_pitchers WHERE game_pk = ANY(${gpkLit}::bigint[]) AND starter_player_id IS NOT NULL`.catch(() => []) : [];
  const confirmedStarterIds = new Set(starterRows.map(r => String(r.starter_player_id)));
  // Only relevant when a real mismatch exists (classified as a reliever role, confirmed starting today) -
  // avoids the cost of computing per-BF rates for every pitcher when almost none will need it.
  const mismatchedIds = relevantPlayerIds.filter(pid => confirmedStarterIds.has(String(pid)) && ["short_reliever", "multi_inning_reliever"].includes(classifiedRoleByPlayer.get(String(pid))));
  const historicalRateByPlayerProp = new Map();
  if (mismatchedIds.length) {
    const mLit = "{" + mismatchedIds.join(",") + "}";
    const rateRows = await pgClient`
      SELECT player_id, SUM(batters_faced) as bf, SUM(hits_allowed) as hits, SUM(strikeouts) as k, SUM(walks_allowed) as bb, SUM(earned_runs) as er
      FROM stats_pitcher.game_logs WHERE player_id::text = ANY(${mLit}::text[])
      GROUP BY player_id`.catch(() => []);
    for (const r of rateRows) {
      const bf = Number(r.bf) || 0;
      if (bf < Number(cfg.min_source_bf_required || 40)) continue;
      historicalRateByPlayerProp.set(String(r.player_id), {
        bf, hits_per_bf: Number(r.hits) / bf, k_per_bf: Number(r.k) / bf, bb_per_bf: Number(r.bb) / bf, er_per_bf: Number(r.er) / bf
      });
    }
  }
  return { classifiedRoleByPlayer, confirmedStarterIds, historicalRateByPlayerProp, cfg };
}
function computeRoleTransitionOverride(matrixRow, roleInputs) {
  const propKey = matrixRow.canonical_prop_key;
  const rateFieldKey = ROLE_TRANSITION_SENSITIVE_PROPS.get(propKey);
  if (!rateFieldKey || !roleInputs.cfg) return null;
  const pid = String(matrixRow.mlb_player_id);
  const classifiedRole = roleInputs.classifiedRoleByPlayer.get(pid);
  const isConfirmedStarterToday = roleInputs.confirmedStarterIds.has(pid);
  if (!isConfirmedStarterToday || !["short_reliever", "multi_inning_reliever"].includes(classifiedRole)) return null;
  const rates = roleInputs.historicalRateByPlayerProp.get(pid);
  if (!rates) return null;
  const cfg = roleInputs.cfg;
  const adj = cfg.reliever_to_starter || {};
  const perBfKey = propKey === "pitcher_strikeouts" ? "k_per_bf" : propKey === "walks_allowed" ? "bb_per_bf" : propKey === "hits_allowed" ? "hits_per_bf" : "er_per_bf";
  const sourceRate = rates[perBfKey];
  if (sourceRate == null || !Number.isFinite(sourceRate)) return null;
  const adjustedRate = sourceRate * Number(adj[rateFieldKey] ?? 1.0);
  const expectedBf = Number((cfg.expected_bf_by_role || {}).starter ?? 22);
  const projectedMean = adjustedRate * expectedBf;
  const threshold = Math.floor(Number(matrixRow.board_line_value));
  const pAtMost = poissonCdfAtMost(threshold, projectedMean);
  if (pAtMost == null) return null;
  const side = matrixRow.side || matrixRow.prop_side || "more";
  const hp = side === "more" ? (1 - pAtMost) * 100 : pAtMost * 100;
  return {
    override_hp: Math.max(1, Math.min(99, hp)),
    confidence_penalty: -1 * Math.abs(Number(cfg.confidence_penalty ?? 20)),
    detected: `${classifiedRole}_confirmed_starter_today_source_bf_${rates.bf}_projected_mean_${projectedMean.toFixed(2)}`
  };
}

async function loadRealLegContexts(pgClient, matrixRows) {
  const gamePks = [...new Set(matrixRows.map(r => r.game_pk).filter(Boolean))];
  const playerIds = [...new Set(matrixRows.map(r => r.mlb_player_id).filter(Boolean))];
  const empty = { weatherByGame: new Map(), lineupByGamePlayer: new Map(), starterByGameTeam: new Map(), bullpenByGameTeam: new Map(), catcherByGameTeam: new Map(), availByGamePlayer: new Map(), marketByGame: new Map(), scheduleSpotByGameTeam: new Map() };
  if (!gamePks.length) return empty;
  const gpkLit = "{" + gamePks.join(",") + "}";
  const pidLit = playerIds.length ? "{" + playerIds.join(",") + "}" : null;

  const weatherRows = await pgClient`SELECT game_pk, venue_id, temperature_f, rain_risk_flag, precipitation_probability_pct, roof_status, wind_speed_mph, wind_context FROM daily.game_weather_current WHERE game_pk = ANY(${gpkLit}::bigint[])`.catch(() => []);
  const lineupRows = pidLit ? await pgClient`SELECT game_pk, player_id, bat_side, lineup_slot FROM daily.lineups_current WHERE game_pk = ANY(${gpkLit}::bigint[]) AND player_id = ANY(${pidLit}::bigint[])`.catch(() => []) : [];
  const starterRows = await pgClient`SELECT game_pk, team_id, starter_hand, starter_player_id FROM daily.probable_pitchers WHERE game_pk = ANY(${gpkLit}::bigint[])`.catch(() => []);
  const bullpenRows = await pgClient`SELECT game_pk, team_id, high_usage_reliever_count, back_to_back_reliever_count, bullpen_fatigue_score FROM daily.bullpen_availability_current WHERE game_pk = ANY(${gpkLit}::bigint[])`.catch(() => []);
  const catcherRows = await pgClient`SELECT game_pk, team_id, framing_runs_total, pop_time_2b_sba FROM daily.catcher_context_current WHERE game_pk = ANY(${gpkLit}::bigint[])`.catch(() => []);
  const availRows = pidLit ? await pgClient`SELECT game_pk, mlb_player_id, availability_status FROM daily.player_availability_current WHERE game_pk = ANY(${gpkLit}::bigint[]) AND mlb_player_id = ANY(${pidLit}::bigint[])`.catch(() => []) : [];
  const scheduleSpotRows = await pgClient`SELECT game_pk, team_id, eastward_travel_flag, westward_travel_flag FROM daily.team_schedule_spot_current WHERE game_pk = ANY(${gpkLit}::bigint[])`.catch(() => []);
  const marketRows = await pgClient`SELECT game_pk, home_team, away_team, derived_home_implied_runs, derived_away_implied_runs FROM market.context_probe_game_market_summary WHERE game_pk = ANY(${gpkLit}::bigint[])`.catch(() => []);
  const umpireAssignmentRows = await pgClient`SELECT game_pk, home_plate_umpire_id FROM daily.umpire_context_current WHERE game_pk = ANY(${gpkLit}::bigint[]) AND home_plate_umpire_id IS NOT NULL`.catch(() => []);
  const umpireIds = [...new Set(umpireAssignmentRows.map(r => r.home_plate_umpire_id).filter(Boolean))];
  const umpireTendencyRows = umpireIds.length ? await pgClient`SELECT umpire_id, strikeouts_delta_vs_league, walks_delta_vs_league, runs_delta_vs_league FROM ref.umpire_tendency WHERE umpire_id = ANY(${"{" + umpireIds.join(",") + "}"}::bigint[])`.catch(() => []) : [];
  const tendencyByUmpireId = new Map(umpireTendencyRows.map(r => [Number(r.umpire_id), r]));
  const umpireTendencyByGame = new Map();
  for (const r of umpireAssignmentRows) {
    const tendency = tendencyByUmpireId.get(Number(r.home_plate_umpire_id));
    if (tendency) umpireTendencyByGame.set(String(r.game_pk), tendency);
  }
  // Umpire rotation predictor fallback (2026-08-14): for games with no confirmed umpire
  // assignment, predict via crew rotation - validated with a real backtest at 100% accuracy
  // (269/269) specifically for the exact scenario used here (a team's most recent home game was
  // exactly 1 day prior, meaning the same crew almost certainly continues). MLB crews rotate
  // positions in a fixed cycle for as long as they stay together, so this is a deterministic
  // rule within that scope, not a probabilistic signal - applied with full confidence, not
  // dampened, but strictly limited to days_since_prior_game=1 since larger gaps (where a new
  // crew may have started a different series) were never validated and shouldn't be assumed.
  const pendingGamePks = gamePks.filter(gp => !umpireTendencyByGame.has(String(gp)));
  if (pendingGamePks.length) {
    const pendingGpkLit = "{" + pendingGamePks.join(",") + "}";
    const pendingGameTeamRows = await pgClient`SELECT game_pk, home_team_id, official_date FROM daily.umpire_context_current WHERE game_pk = ANY(${pendingGpkLit}::bigint[]) AND home_team_id IS NOT NULL AND official_date IS NOT NULL`.catch(() => []);
    for (const g of pendingGameTeamRows) {
      const priorRows = await pgClient`
        SELECT official_date, crew_umpire_ids_json FROM context.history_game_umpire
        WHERE home_team_id = ${String(g.home_team_id)} AND official_date < ${g.official_date}
        ORDER BY official_date DESC LIMIT 1`.catch(() => []);
      if (!priorRows.length) continue;
      const prior = priorRows[0];
      const daysSince = Math.round((new Date(g.official_date) - new Date(prior.official_date)) / 86400000);
      if (daysSince !== 1) continue;
      let crewArr;
      try { crewArr = Array.isArray(prior.crew_umpire_ids_json) ? prior.crew_umpire_ids_json : JSON.parse(String(prior.crew_umpire_ids_json)); } catch (_) { continue; }
      if (!Array.isArray(crewArr) || crewArr.length < 2) continue;
      const predictedUmpireId = Number(crewArr[1]);
      const alreadyFetched = tendencyByUmpireId.get(predictedUmpireId);
      if (alreadyFetched) { umpireTendencyByGame.set(String(g.game_pk), alreadyFetched); continue; }
      const fetchedTendency = await pgClient`SELECT umpire_id, strikeouts_delta_vs_league, walks_delta_vs_league, runs_delta_vs_league FROM ref.umpire_tendency WHERE umpire_id = ${predictedUmpireId}`.catch(() => []);
      if (fetchedTendency.length) umpireTendencyByGame.set(String(g.game_pk), fetchedTendency[0]);
    }
  }

  const currentSeasonYear = new Date().getUTCFullYear();
  const seasonLit = "{" + currentSeasonYear + "," + (currentSeasonYear - 1) + "}";
  const sprintSpeedRows = pidLit ? await pgClient`SELECT mlb_player_id, sprint_speed_ft_per_sec, season_year FROM ref.sprint_speed WHERE mlb_player_id = ANY(${pidLit}::bigint[]) AND season_year = ANY(${seasonLit}::int[])`.catch(() => []) : [];
  const sprintSpeedByPlayer = new Map();
  for (const r of sprintSpeedRows) {
    const pid = Number(r.mlb_player_id);
    const existing = sprintSpeedByPlayer.get(pid);
    if (!existing || Number(r.season_year) > existing.season_year) sprintSpeedByPlayer.set(pid, { value: r.sprint_speed_ft_per_sec, season_year: Number(r.season_year) });
  }
  const starterPlayerIdsForArm = [...new Set(starterRows.map(r => r.starter_player_id).filter(Boolean))];
  const armLit = starterPlayerIdsForArm.length ? "{" + starterPlayerIdsForArm.join(",") + "}" : null;
  const armAngleRows = armLit ? await pgClient`SELECT mlb_player_id, arm_angle_degrees, season_year FROM ref.arm_angle WHERE mlb_player_id = ANY(${armLit}::bigint[]) AND season_year = ANY(${seasonLit}::int[])`.catch(() => []) : [];
  const armAngleByPitcher = new Map();
  for (const r of armAngleRows) {
    const pid = Number(r.mlb_player_id);
    const existing = armAngleByPitcher.get(pid);
    if (!existing || Number(r.season_year) > existing.season_year) armAngleByPitcher.set(pid, { value: r.arm_angle_degrees, season_year: Number(r.season_year) });
  }

  const teamRows = await pgClient`SELECT mlb_team_id, abbreviation, full_name FROM ref.teams`.catch(() => []);
  const teamIdByAbbrev = new Map(teamRows.map(r => [String(r.abbreviation).toUpperCase(), Number(r.mlb_team_id)]));
  const teamIdByFullName = new Map(teamRows.map(r => [String(r.full_name).toUpperCase(), Number(r.mlb_team_id)]));

  const arsenalRows = armLit ? await pgClient`SELECT mlb_player_id, run_value_per_100, pitch_usage FROM ref.pitcher_arsenal WHERE mlb_player_id = ANY(${armLit}::bigint[]) AND active=1`.catch(() => []) : [];
  const arsenalByPitcher = new Map();
  for (const r of arsenalRows) {
    const pid = String(r.mlb_player_id);
    if (!arsenalByPitcher.has(pid)) arsenalByPitcher.set(pid, []);
    arsenalByPitcher.get(pid).push(r);
  }
  const pitcherQualityByPitcherId = new Map();
  for (const [pid, rows] of arsenalByPitcher.entries()) {
    const totalUsage = rows.reduce((s, r) => s + (Number(r.pitch_usage) || 0), 0);
    if (totalUsage <= 0) continue;
    const weighted = rows.reduce((s, r) => s + ((Number(r.run_value_per_100) || 0) * (Number(r.pitch_usage) || 0)), 0) / totalUsage;
    pitcherQualityByPitcherId.set(pid, weighted);
  }

  const parkFactorRows = await pgClient`SELECT mlb_venue_id, run_factor, hr_factor, lhb_run_factor, rhb_run_factor, lhb_hr_factor, rhb_hr_factor FROM ref.park_factors WHERE active=1`.catch(() => []);
  const parkFactorsByVenue = new Map(parkFactorRows.map(r => [String(r.mlb_venue_id), r]));
  const OF_POSITIONS = new Set(["OF", "LF", "CF", "RF"]);
  const oaaRows = await pgClient`SELECT dq.outs_above_average, dq.primary_position, p.current_mlb_team_id FROM ref.defensive_quality dq JOIN ref.players p ON p.mlb_player_id = dq.mlb_player_id WHERE dq.active=1 AND p.current_mlb_team_id IS NOT NULL`.catch(() => []);
  const oaaByTeamOF = new Map();
  const oaaByTeamIF = new Map();
  for (const r of oaaRows) {
    const tid = String(r.current_mlb_team_id);
    const isOutfield = OF_POSITIONS.has(String(r.primary_position || "").toUpperCase());
    const bucketMap = isOutfield ? oaaByTeamOF : oaaByTeamIF;
    if (!bucketMap.has(tid)) bucketMap.set(tid, { runsSum: 0, count: 0 });
    const bucket = bucketMap.get(tid);
    const runsPerOut = isOutfield ? 0.9 : 0.75;
    bucket.runsSum += (Number(r.outs_above_average) || 0) * runsPerOut;
    bucket.count += 1;
  }
  const oaaProbabilityDeltaByTeamOF = new Map();
  for (const [tid, bucket] of oaaByTeamOF.entries()) if (bucket.count > 0) oaaProbabilityDeltaByTeamOF.set(tid, (bucket.runsSum / bucket.count) / 180);
  const oaaProbabilityDeltaByTeamIF = new Map();
  for (const [tid, bucket] of oaaByTeamIF.entries()) if (bucket.count > 0) oaaProbabilityDeltaByTeamIF.set(tid, (bucket.runsSum / bucket.count) / 180);

  const battedBallRows = await pgClient`SELECT DISTINCT ON (mlb_player_id) mlb_player_id, ground_ball_pct, air_pct FROM ref.batted_ball_profile ORDER BY mlb_player_id, season_year DESC`.catch(() => []);
  const battedBallProfileByPlayer = new Map(battedBallRows.map(r => [String(r.mlb_player_id), r]));

  const hrRateRows = playerIds.length ? await pgClient`SELECT player_id, hr_rate FROM stats_hitter.metric_snapshots WHERE player_id = ANY(${pidLit}::bigint[]) AND metric_window='season_to_date'`.catch(() => []) : [];
  const hrRateByPlayer = new Map(hrRateRows.map(r => [String(r.player_id), r.hr_rate]));

  // REAL FIX (2026-07-31): lineup_surrounding_quality was never wired - preceding_hitters_avg_obp
  // and league_avg_obp were referenced by the factor logic but never populated anywhere. OBP isn't
  // directly stored, but is directly computable from existing hits_sum/walks_sum/pa_sum data
  // (confirmed real, sensible league average ~0.299 when computed this way). Fetches the FULL
  // lineup for each game (not just this chunk's own players) so "who bats before this player" can
  // be answered even if that preceding player isn't otherwise being processed in this chunk.
  const fullLineupRows = gamePks.length ? await pgClient`
    SELECT l.game_pk, l.team_id, l.lineup_slot, l.player_id,
      (m.hits_sum + m.walks_sum)::float / NULLIF(m.pa_sum, 0) AS obp
    FROM daily.lineups_current l
    LEFT JOIN stats_hitter.metric_snapshots m ON m.player_id = l.player_id AND m.metric_window='season_to_date'
    WHERE l.game_pk = ANY(${gpkLit}::bigint[]) AND l.lineup_slot IS NOT NULL`.catch(() => []) : [];
  const lineupByGameTeamSorted = new Map();
  for (const r of fullLineupRows) {
    const k = `${r.game_pk}|${r.team_id}`;
    if (!lineupByGameTeamSorted.has(k)) lineupByGameTeamSorted.set(k, []);
    lineupByGameTeamSorted.get(k).push({ slot: Number(r.lineup_slot), obp: r.obp != null ? Number(r.obp) : null });
  }
  for (const arr of lineupByGameTeamSorted.values()) arr.sort((a, b) => a.slot - b.slot);
  const leagueAvgObpRow = await pgClient`SELECT AVG((hits_sum+walks_sum)::float/NULLIF(pa_sum,0)) AS avg_obp FROM stats_hitter.metric_snapshots WHERE metric_window='season_to_date' AND pa_sum > 50`.catch(() => []);
  const leagueAvgObp = leagueAvgObpRow[0] && leagueAvgObpRow[0].avg_obp != null ? Number(leagueAvgObpRow[0].avg_obp) : 0.320;

  const runningGameRows = await pgClient`SELECT DISTINCT ON (mlb_player_id) mlb_player_id, lead_distance_gained FROM ref.pitcher_running_game ORDER BY mlb_player_id, season_year DESC`.catch(() => []);
  const pitcherLeadDistanceByPitcherId = new Map(runningGameRows.map(r => [String(r.mlb_player_id), r.lead_distance_gained]));

  // REAL FIX (2026-07-31, corrected 2026-08-13): times_through_order was never wired - starter_avg_batters_faced_per_start
  // was referenced by the factor logic but never populated. Directly computable from existing
  // batters_faced_sum/starts_count already in stats_pitcher.metric_snapshots. CORRECTED 2026-08-13:
  // originally scoped to only opposing starters (starterIdsForBfp) under the assumption this signal
  // was about the opponent - confirmed live that was wrong, since this factor is used exclusively
  // for pitcher props about the leg's OWN player, never a hitter prop. Widened to cover every
  // player in this batch so the leg's own player_id is always found.
  const bfpLit = playerIds.length ? "{" + playerIds.join(",") + "}" : null;
  const batersFacedRows = bfpLit ? await pgClient`SELECT player_id, batters_faced_sum, starts_count FROM stats_pitcher.metric_snapshots WHERE player_id = ANY(${bfpLit}::bigint[]) AND metric_window='season_to_date'`.catch(() => []) : [];
  const avgBattersFacedByPitcher = new Map(batersFacedRows.filter(r => Number(r.starts_count) > 0).map(r => [String(r.player_id), Number(r.batters_faced_sum) / Number(r.starts_count)]));

  const qocRows = playerIds.length ? await pgClient`SELECT mlb_player_id, xwoba, xwobacon, sweet_spot_percent, barrel_batted_rate, iso, season_year FROM ref.batter_quality_of_contact WHERE mlb_player_id = ANY(${pidLit}::bigint[]) AND active=1 ORDER BY season_year DESC`.catch(() => []) : [];

  // Recent-form trend (2026-08-13): validated via direct correlation testing against real 2026
  // outcomes before building - pitcher's own recent-3-start average vs his own season average
  // correlates strongly with today's actual outcome across 5 props (outs 0.91, hits_allowed 0.70,
  // strikeouts 0.70, walks_allowed 0.47, earned_runs 0.46 - all measured overall, far stronger
  // than any opponent-side signal tested and rejected in the same investigation). BUT the
  // correlation is NOT uniform across pitchers - confirmed by splitting on season-long role
  // stability (avg outs/start): short/variable-role pitchers show the strongest signal (0.22-0.70
  // across props), while true workhorse starters (16+ outs/start average) show a much weaker one
  // (0.04-0.28) - a stable starter's outcome varies less game to game, so recent form carries less
  // information. A flat coefficient across all pitchers would misapply the short-role signal
  // strength to workhorses, which is exactly the failure mode that motivated this investigation.
  // Tier is computed once per pitcher (season_avg_outs >= 16 = workhorse, >= 12 = mid, else short)
  // and applied consistently across all 5 props' ratios below.
  const recentFormRows = playerIds.length ? await pgClient`
    WITH season_tier AS (
      SELECT player_id, AVG(outs_recorded) AS season_avg_outs, COUNT(*) AS season_starts
      FROM stats_pitcher.game_logs WHERE player_id = ANY(${pidLit}::bigint[]) AND innings_pitched_decimal >= 1
      GROUP BY player_id
    ),
    recent AS (
      SELECT gl.player_id, gl.game_date,
        AVG(gl.outs_recorded) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS recent3_outs,
        AVG(gl.earned_runs) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS recent3_er,
        AVG(gl.hits_allowed) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS recent3_hits,
        AVG(gl.walks_allowed) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS recent3_bb,
        AVG(gl.strikeouts) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS recent3_k,
        AVG(gl.outs_recorded) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS season_outs,
        AVG(gl.earned_runs) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS season_er,
        AVG(gl.hits_allowed) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS season_hits,
        AVG(gl.walks_allowed) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS season_bb,
        AVG(gl.strikeouts) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS season_k,
        COUNT(*) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS recent_n,
        COUNT(*) OVER (PARTITION BY gl.player_id ORDER BY gl.game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS season_n,
        ROW_NUMBER() OVER (PARTITION BY gl.player_id ORDER BY gl.game_date DESC) AS rn
      FROM stats_pitcher.game_logs gl WHERE gl.player_id = ANY(${pidLit}::bigint[]) AND gl.innings_pitched_decimal >= 1
    )
    SELECT r.player_id, r.recent3_outs, r.recent3_er, r.recent3_hits, r.recent3_bb, r.recent3_k,
      r.season_outs, r.season_er, r.season_hits, r.season_bb, r.season_k, r.recent_n, r.season_n,
      st.season_avg_outs
    FROM recent r JOIN season_tier st ON st.player_id = r.player_id
    WHERE r.rn = 1
  `.catch(() => []) : [];
  const recentFormByPlayer = new Map();
  for (const r of recentFormRows) {
    if (Number(r.recent_n) < 3 || Number(r.season_n) < 5) continue;
    const seasonAvgOuts = Number(r.season_avg_outs);
    const tier = seasonAvgOuts >= 16 ? "workhorse_16plus_outs" : seasonAvgOuts >= 12 ? "mid_12to16_outs" : "short_under12_outs";
    const ratio = (recentVal, seasonVal) => { const rv = Number(recentVal), sv = Number(seasonVal); return sv > 0 ? rv / sv : null; };
    recentFormByPlayer.set(String(r.player_id), {
      tier,
      outs_ratio: ratio(r.recent3_outs, r.season_outs),
      er_ratio: ratio(r.recent3_er, r.season_er),
      hits_ratio: ratio(r.recent3_hits, r.season_hits),
      bb_ratio: ratio(r.recent3_bb, r.season_bb),
      k_ratio: ratio(r.recent3_k, r.season_k)
    });
  }
  const qocByPlayer = new Map();
  for (const r of qocRows) {
    const pid = Number(r.mlb_player_id);
    const existing = qocByPlayer.get(pid);
    if (!existing || Number(r.season_year) > existing.season_year) qocByPlayer.set(pid, { xwoba: r.xwoba, xwobacon: r.xwobacon, sweet_spot_percent: r.sweet_spot_percent, barrel_batted_rate: r.barrel_batted_rate, iso: r.iso, season_year: Number(r.season_year) });
  }
  // Thin-sample tiering for batter_quality_of_contact (2026-08-14): validated via 3 independent
  // out-of-sample train/test splits (train-period rate predicts held-out test-period outcome,
  // partial correlation controlling for train rate) - ISO/xwOBA add real incremental value for
  // players with a thin season sample (0.205/0.426/0.615 across 3 splits, all positive and
  // strengthening with n), but essentially none for established players (15+ games, -0.030).
  // Consistent with Statcast contact-quality metrics stabilizing faster than counting stats.
  const seasonGamesRows = playerIds.length ? await pgClient`SELECT player_id, COUNT(*) AS games FROM stats_hitter.game_logs WHERE player_id = ANY(${pidLit}::bigint[]) GROUP BY player_id`.catch(() => []) : [];
  const seasonGamesByPlayer = new Map(seasonGamesRows.map(r => [Number(r.player_id), Number(r.games)]));

  return {
    weatherByGame: new Map(weatherRows.map(r => [String(r.game_pk), r])),
    lineupByGamePlayer: new Map(lineupRows.map(r => [`${r.game_pk}|${r.player_id}`, r])),
    starterByGameTeam: new Map(starterRows.map(r => [`${r.game_pk}|${r.team_id}`, r])),
    bullpenByGameTeam: new Map(bullpenRows.map(r => [`${r.game_pk}|${r.team_id}`, r])),
    catcherByGameTeam: new Map(catcherRows.map(r => [`${r.game_pk}|${r.team_id}`, r])),
    scheduleSpotByGameTeam: new Map(scheduleSpotRows.map(r => [`${r.game_pk}|${r.team_id}`, r])),
    availByGamePlayer: new Map(availRows.map(r => [`${r.game_pk}|${r.mlb_player_id}`, r])),
    marketByGame: new Map(marketRows.map(r => [String(r.game_pk), r])),
    pitcherQualityByPitcherId,
    oaaProbabilityDeltaByTeamOF,
    oaaProbabilityDeltaByTeamIF,
    battedBallProfileByPlayer,
    hrRateByPlayer,
    pitcherLeadDistanceByPitcherId,
    parkFactorsByVenue,
    umpireTendencyByGame,
    sprintSpeedByPlayer,
    armAngleByPitcher,
    teamIdByAbbrev,
    teamIdByFullName,
    qocByPlayer,
    lineupByGameTeamSorted,
    leagueAvgObp,
    avgBattersFacedByPitcher,
    recentFormByPlayer,
    seasonGamesByPlayer
  };
}

function buildLegContextReal(matrixRow, ctxMaps, marketThresholds) {
  const gamePk = matrixRow.game_pk;
  const playerId = matrixRow.mlb_player_id;
  const isPitcherProp = factorFamilyForProp(matrixRow.canonical_prop_key) === "pitcher";
  const ownTeamId = ctxMaps.teamIdByAbbrev.get(String(matrixRow.team_id || "").toUpperCase()) ?? matrixRow.team_id;
  const oppTeamId = ctxMaps.teamIdByAbbrev.get(String(matrixRow.opponent_team_id || "").toUpperCase()) ?? matrixRow.opponent_team_id;
  const weather = ctxMaps.weatherByGame.get(String(gamePk)) || {};
  const lineup = ctxMaps.lineupByGamePlayer.get(`${gamePk}|${playerId}`) || {};
  const oppStarter = ctxMaps.starterByGameTeam.get(`${gamePk}|${oppTeamId}`) || {};
  const parkFactorRow = ctxMaps.parkFactorsByVenue ? ctxMaps.parkFactorsByVenue.get(String(weather.venue_id || "")) : null;
  const parkFactorFields = {};
  if (parkFactorRow) {
    const batHand = String(lineup.bat_side || "").toUpperCase();
    const hrFactor = batHand === "L" ? (parkFactorRow.lhb_hr_factor ?? parkFactorRow.hr_factor) : batHand === "R" ? (parkFactorRow.rhb_hr_factor ?? parkFactorRow.hr_factor) : parkFactorRow.hr_factor;
    const runFactor = batHand === "L" ? (parkFactorRow.lhb_run_factor ?? parkFactorRow.run_factor) : batHand === "R" ? (parkFactorRow.rhb_run_factor ?? parkFactorRow.run_factor) : parkFactorRow.run_factor;
    if (hrFactor != null) parkFactorFields.park_home_runs_factor_5yr_regressed = hrFactor;
    if (runFactor != null) {
      parkFactorFields.park_runs_factor_5yr_regressed = runFactor;
      parkFactorFields.park_hits_factor_5yr_regressed = runFactor;
      parkFactorFields.park_total_bases_factor_5yr_regressed = runFactor;
    }
  }
  const relevantBullpen = isPitcherProp ? (ctxMaps.bullpenByGameTeam.get(`${gamePk}|${ownTeamId}`) || {}) : (ctxMaps.bullpenByGameTeam.get(`${gamePk}|${oppTeamId}`) || {});
  const catcher = ctxMaps.catcherByGameTeam.get(`${gamePk}|${oppTeamId}`) || {};
  const scheduleSpot = ctxMaps.scheduleSpotByGameTeam.get(`${gamePk}|${ownTeamId}`) || {};
  const availability = ctxMaps.availByGamePlayer.get(`${gamePk}|${playerId}`) || {};
  const market = ctxMaps.marketByGame.get(String(gamePk)) || {};
  const pitcherQuality = oppStarter.starter_player_id != null ? ctxMaps.pitcherQualityByPitcherId.get(String(oppStarter.starter_player_id)) : undefined;

  return {
    temp_f: weather.temperature_f ?? null,
    precipitation_probability_pct: weather.precipitation_probability_pct ?? (weather.rain_risk_flag ? 50 : null),
    wind_speed_mph: weather.wind_speed_mph ?? null,
    wind_context: weather.wind_context ?? null,
    roof_status: weather.roof_status ?? null,
    catcher_framing_pct: catcher.framing_pct_total ?? null,
    implied_team_total: (() => {
      const homeId = market.home_team ? ctxMaps.teamIdByFullName.get(String(market.home_team).toUpperCase()) : null;
      const awayId = market.away_team ? ctxMaps.teamIdByFullName.get(String(market.away_team).toUpperCase()) : null;
      if (homeId != null && Number(ownTeamId) === homeId) return market.derived_home_implied_runs ?? null;
      if (awayId != null && Number(ownTeamId) === awayId) return market.derived_away_implied_runs ?? null;
      // Fallback only if we couldn't confidently match the player's team to home/away (e.g. a
      // full-name lookup miss) - preserves the old behavior rather than dropping the signal.
      return market.derived_home_implied_runs ?? market.derived_away_implied_runs ?? null;
    })(),
    league_avg_implied_total: (marketThresholds && marketThresholds.league_avg_implied_total_runs) ?? 4.3,
    prop_key: matrixRow.canonical_prop_key || null,
    batter_hr_rate: ctxMaps.hrRateByPlayer ? (ctxMaps.hrRateByPlayer.get(String(playerId)) ?? null) : null,
    ...parkFactorFields,
    batter_hand: lineup.bat_side ?? null,
    pitcher_hand: oppStarter.starter_hand ?? null,
    pitcher_run_value_per_100_weighted: pitcherQuality ?? null,
    high_usage_reliever_count: relevantBullpen.high_usage_reliever_count ?? null,
    back_to_back_reliever_count: relevantBullpen.back_to_back_reliever_count ?? null,
    bullpen_fatigue_score: relevantBullpen.bullpen_fatigue_score ?? null,
    availability_status: availability.availability_status ?? null,
    matchup_specific_oaa_probability_delta: (() => {
      const ofDelta = ctxMaps.oaaProbabilityDeltaByTeamOF.get(String(oppTeamId));
      const ifDelta = ctxMaps.oaaProbabilityDeltaByTeamIF.get(String(oppTeamId));
      if (ofDelta == null && ifDelta == null) return null;
      const battedBall = ctxMaps.battedBallProfileByPlayer.get(String(playerId));
      const airPct = battedBall && battedBall.air_pct != null ? battedBall.air_pct : 0.575;
      const gbPct = battedBall && battedBall.ground_ball_pct != null ? battedBall.ground_ball_pct : 0.425;
      return ((ofDelta ?? 0) * airPct) + ((ifDelta ?? 0) * gbPct);
    })(),
    umpire_strikeouts_delta_vs_league: ctxMaps.umpireTendencyByGame.get(String(gamePk))?.strikeouts_delta_vs_league ?? null,
    umpire_walks_delta_vs_league: ctxMaps.umpireTendencyByGame.get(String(gamePk))?.walks_delta_vs_league ?? null,
    umpire_runs_delta_vs_league: ctxMaps.umpireTendencyByGame.get(String(gamePk))?.runs_delta_vs_league ?? null,
    runner_sprint_speed_ft_per_sec: ctxMaps.sprintSpeedByPlayer.get(Number(playerId))?.value ?? null,
    opposing_catcher_pop_time_2b_sba: catcher.pop_time_2b_sba ?? null,
    pitcher_lead_distance_gained: oppStarter.starter_player_id != null ? (ctxMaps.pitcherLeadDistanceByPitcherId.get(String(oppStarter.starter_player_id)) ?? null) : null,
    pitcher_arm_angle_degrees: oppStarter.starter_player_id != null ? (ctxMaps.armAngleByPitcher.get(Number(oppStarter.starter_player_id))?.value ?? null) : null,
    eastward_travel_flag: scheduleSpot.eastward_travel_flag ?? null,
    westward_travel_flag: scheduleSpot.westward_travel_flag ?? null,
    actual_slot: lineup.lineup_slot ?? null,
    batter_xwoba: ctxMaps.qocByPlayer.get(Number(playerId))?.xwoba ?? null,
    batter_xwobacon: ctxMaps.qocByPlayer.get(Number(playerId))?.xwobacon ?? null,
    batter_sweet_spot_percent: ctxMaps.qocByPlayer.get(Number(playerId))?.sweet_spot_percent ?? null,
    batter_barrel_batted_rate: ctxMaps.qocByPlayer.get(Number(playerId))?.barrel_batted_rate ?? null,
    batter_iso: ctxMaps.qocByPlayer.get(Number(playerId))?.iso ?? null,
    preceding_hitters_avg_obp: (() => {
      const teamLineup = ctxMaps.lineupByGameTeamSorted ? ctxMaps.lineupByGameTeamSorted.get(`${gamePk}|${ownTeamId}`) : null;
      if (!teamLineup || lineup.lineup_slot == null) return null;
      const mySlot = Number(lineup.lineup_slot);
      const preceding = teamLineup.filter(p => p.slot < mySlot && p.obp != null);
      if (!preceding.length) return null;
      return preceding.reduce((s, p) => s + p.obp, 0) / preceding.length;
    })(),
    league_avg_obp: ctxMaps.leagueAvgObp ?? 0.320,
    starter_avg_batters_faced_per_start: ctxMaps.avgBattersFacedByPitcher.get(String(playerId)) ?? null,
    pitcher_role_tier: ctxMaps.recentFormByPlayer.get(String(playerId))?.tier ?? null,
    recent3_outs_ratio: ctxMaps.recentFormByPlayer.get(String(playerId))?.outs_ratio ?? null,
    recent3_er_ratio: ctxMaps.recentFormByPlayer.get(String(playerId))?.er_ratio ?? null,
    recent3_hits_ratio: ctxMaps.recentFormByPlayer.get(String(playerId))?.hits_ratio ?? null,
    recent3_bb_ratio: ctxMaps.recentFormByPlayer.get(String(playerId))?.bb_ratio ?? null,
    recent3_k_ratio: ctxMaps.recentFormByPlayer.get(String(playerId))?.k_ratio ?? null,
    hitter_season_games: ctxMaps.seasonGamesByPlayer.get(Number(playerId)) ?? null,
  };
}

function evaluateFlatGate(factorKey, cells, legContext) {
  if (factorKey === "player_availability") {
    if (legContext.availability_status == null) return null;
    const status = String(legContext.availability_status).toLowerCase();
    const isInjuryStatus = /(^|_)il(_|\d|$)/.test(status) || /\binjured\b/.test(status);
    if (isInjuryStatus) {
      const cell = cells.find(c => c.tier_label === "recent_il_return");
      return cell ? -1 * Math.abs(cell.penalty || 0) : 0;
    }
    return 0;
  }
  if (factorKey === "weather_roof") {
    // RESEARCH-GROUNDED, DELIBERATE NO-OP (2026-08-14): checked real published research before
    // deciding, not left silent. Studies on roof-open vs roof-closed effects at retractable-roof
    // venues (Rogers Centre, Chase Field) show a real but small and CONFOUNDED effect - roofs get
    // closed BECAUSE of cold/windy/rainy conditions, and those conditions independently suppress
    // offense. Baseball Prospectus's more careful analysis of Rogers Centre found "almost no
    // roof-closed effect" once accounting for this. Since this system already has dedicated
    // weather_temp_altitude_pressure/weather_wind/weather_precip factors capturing those same
    // conditions directly, a naive "roof closed -> fewer HRs" coefficient would very likely
    // double-count the same underlying weather signal through a second channel - the same failure
    // mode the altitude term above is explicitly zeroed to avoid. No historical roof-status data
    // exists in this system either (context.history_game_weather's condition field, the only
    // source of real historical roof state, is null for every retractable-venue game on record),
    // so there's no way to empirically validate a coefficient even if one were attempted. Revisit
    // only if historical roof-status capture is built AND a way to properly isolate the roof
    // effect from the weather that caused the closure is designed - not with a guessed number.
    if (legContext.roof_status == null) return 0;
    return 0;
  }
  return null;
}

// RESEARCH-GROUNDED FIX (2026-07-26): missing full-relevance primary-factor data no longer applies a
// worst-case penalty directly to logRateAdjustmentSum (the rate itself). Standard risk-model practice
// (clinical prediction literature - APACHE-family scores etc.) imputes a neutral/zero value for missing
// predictors rather than assuming the worst, reflecting reduced information via confidence instead.
// This system already has a separate, correct mechanism for exactly that: computeFinalConfidence() in
// the phase3c certifier blends baseline confidence with a coverage-ratio term
// (factors_applied / (factors_applied + factors_missing)), which properly discounts confidence for legs
// with sparse factor coverage. Applying a SECOND penalty here, directly to the rate, double-penalized
// every prop with any missing data and was confirmed as the root cause of a system-wide downward bias
// (every one of 19 prop types showed avg_multiplier below 1.0; simulation against real production data
// confirmed removing this specific penalty brings every prop to a tight band around 1.0, with remaining
// variance reflecting real factor effects rather than missing-data artifacts).
// REAL fix (2026-08-19): confirmed via real backtest (total_bases|more: predicted 63.9% vs actual
// 45.0% real hit rate, n=40; predicted 26.7% vs actual 5.6%, n=18) and Gemini second-opinion audit
// that naive log-space summing double/triple-counts a real "favorable scoring environment" signal
// that weather_wind, weather_temp_altitude_pressure, opposing_pitcher_quality, and park_factors all
// independently measure - confirmed live: a single real leg (Griffin Conine, total_bases) had all
// four fire simultaneously, each individually under its own cap, compounding to a 1.63x multiplier.
// These four factors are grouped into a "macro environment cluster" and combined via root-sum-
// squares (L2 norm, sign-preserved) instead of naive addition: a single factor firing alone gets
// zero dampening (RSS of one term equals that term), but multiple correlated factors firing
// together get real, meaningful (not flat) dampening - e.g. 4 real factors summing to +0.253 in
// this leg RSS-combine to +0.1305, a ~48% reduction, without ever fully cancelling genuine signal.
// batter_quality_of_contact (the batter's own real skill - xwOBA/barrel rate), platoon_handedness,
// and bullpen_fatigue are NOT part of this cluster - they measure genuinely independent things
// (player skill, handedness matchup, reliever fatigue) unrelated to park/weather/pitcher-quality,
// and continue to sum normally alongside the cluster's combined contribution.
const MACRO_ENVIRONMENT_CLUSTER = new Set(["weather_wind", "weather_temp_altitude_pressure", "opposing_pitcher_quality", "park_factors"]);
async function enrichLeg(matrixRow, config, legContext) {
  const propKey = matrixRow.canonical_prop_key;
  const roofClosed = legContext.roof_status && String(legContext.roof_status).toLowerCase().includes("closed");

  let logRateAdjustmentSum = 0;
  let confidenceAdjustment = 0;
  const factorBreakdown = [];
  const missingFactors = [];
  const clusterContributions = [];

  for (const factor of config.factors) {
    const relevance = factorAppliesTo(factor, propKey);
    if (!relevance) continue;

    if (roofClosed && (factor.factor_key === "weather_wind" || factor.factor_key === "weather_temp_altitude_pressure" || factor.factor_key === "weather_precip")) {
      factorBreakdown.push({ factor_key: factor.factor_key, status: "gated_zero_roof_closed", contribution: 0, relevance });
      continue;
    }

    const cells = config.cellsByFactor.get(factor.factor_key) || [];
    let contribution = null;
    let cellUsed = null;
    let matchedCellForCap = null;

    if (factor.variation_type === "continuous_formula") {
      // Never fall back to an arbitrary array position - that silently applies an unrelated
      // prop's tuned coefficients (e.g. home_runs-specific barrel/xwoba weighting bleeding into
      // a hits calculation). Props without their own dedicated cell for this factor share the
      // hits_runs_rbis cell's coefficients by explicit design (see evaluateContinuousFactor's
      // own comment for batter_quality_of_contact); if even that doesn't exist, skip the factor.
      // recent_form_trend is a special case (2026-08-13): its coefficient must vary by
      // pitcher_role_tier, not just prop_key - confirmed the correlation this factor is built on
      // differs by 3-7x between workhorse starters and short/variable-role pitchers, so a single
      // flat cell per prop would misapply one role's signal strength to a completely different
      // role. Matches on (prop_key, tier_label) first; falls through to the generic match for
      // every other continuous_formula factor, unchanged.
      const matchingCell = factor.factor_key === "recent_form_trend"
        ? (cells.find(c => c.prop_key === propKey && c.tier_label === legContext.pitcher_role_tier) || null)
        : (cells.find(c => c.prop_key === propKey) || cells.find(c => c.prop_key === "hits_runs_rbis") || null);
      if (matchingCell) {
        contribution = evaluateContinuousFactor(factor.factor_key, matchingCell, legContext, config.thresholdsByFactor.get(factor.factor_key));
        cellUsed = matchingCell.cell_id;
        matchedCellForCap = matchingCell;
      }
    } else if (factor.variation_type === "tiered_bands") {
      const tier = classifyIntoTier(factor.factor_key, legContext, config.thresholdsByFactor.get(factor.factor_key), propKey);
      if (tier) {
        const matchingCell = cells.find(c => c.prop_key === propKey && c.tier_label === tier);
        if (matchingCell) { contribution = matchingCell.lift || -1 * (matchingCell.penalty || 0); cellUsed = matchingCell.cell_id; matchedCellForCap = matchingCell; }
      }
    } else if (factor.variation_type === "flat_gate") {
      contribution = evaluateFlatGate(factor.factor_key, cells, legContext);
    }

    const DISTANCE_SENSITIVE_FACTORS = new Set(["weather_wind", "weather_temp_altitude_pressure", "park_factors"]);
    if (contribution !== null && DISTANCE_SENSITIVE_FACTORS.has(factor.factor_key) && propKey === "home_runs" && legContext.batter_hr_rate != null) {
      const hrRate = legContext.batter_hr_rate;
      const sensitivityMultiplier = (hrRate >= 0.0196 && hrRate <= 0.0357) ? 1.3 : 0.75;
      contribution = contribution * sensitivityMultiplier;
    }

    if (contribution !== null && matchedCellForCap && matchedCellForCap.cap != null) {
      const capValue = Math.abs(matchedCellForCap.cap);
      contribution = Math.max(-capValue, Math.min(capValue, contribution));
    }

    if (contribution === null) {
      const boundedPenalty = -1 * Math.abs(factor.missing_data_worst_case_penalty_cap || 0);
      if (factor.signal_role === "confidence_modifier") {
        confidenceAdjustment += boundedPenalty * 0.5;
        // NOTE: confidence_modifier factors are intentionally excluded from missingFactors/coverage
        // tracking below - their entire designed effect flows through confidenceAdjustment alone.
        // Counting them here too would double-penalize confidence for the same missing signal.
        factorBreakdown.push({ factor_key: factor.factor_key, status: "missing_confidence_modifier_only", relevance });
        continue;
      }
      missingFactors.push(factor.factor_key);
      factorBreakdown.push({ factor_key: factor.factor_key, status: "missing_neutral_confidence_handled_downstream", relevance });
      continue;
    }

    const CONTRIBUTION_CLAMP = 1.0;
    contribution = clampContribution(contribution, CONTRIBUTION_CLAMP);

    if (factor.signal_role === "confidence_modifier") {
      confidenceAdjustment += Math.max(-0.03, Math.min(0.03, contribution));
      factorBreakdown.push({ factor_key: factor.factor_key, status: "applied_confidence_modifier_only", cell_id: cellUsed, contribution, relevance });
      continue;
    }
    if (MACRO_ENVIRONMENT_CLUSTER.has(factor.factor_key)) {
      clusterContributions.push(contribution);
      factorBreakdown.push({ factor_key: factor.factor_key, status: "applied_macro_cluster_member", cell_id: cellUsed, contribution, relevance });
      continue;
    }
    logRateAdjustmentSum += contribution;
    factorBreakdown.push({ factor_key: factor.factor_key, status: "applied", cell_id: cellUsed, contribution, relevance });
  }

  // Real RSS (root-sum-squares) combination of the macro environment cluster, sign-preserved: a
  // single member firing alone passes through with zero dampening (sqrt(x^2)=|x|), multiple
  // correlated members firing together get real, non-flat dampening. See comment above enrichLeg.
  if (clusterContributions.length) {
    const sumOfSquares = clusterContributions.reduce((s, x) => s + x * x, 0);
    const sumSigned = clusterContributions.reduce((s, x) => s + x, 0);
    const rss = Math.sqrt(sumOfSquares);
    const clusterCombined = sumSigned >= 0 ? rss : -rss;
    logRateAdjustmentSum += clusterCombined;
    factorBreakdown.push({ factor_key: "macro_environment_cluster_combined", status: "rss_combined", contribution: clusterCombined, member_count: clusterContributions.length, naive_sum_would_have_been: sumSigned });
  }

  return {
    canonical_prop_key: propKey,
    log_rate_adjustment: clampContribution(logRateAdjustmentSum, 2.0),
    rate_multiplier: Math.exp(clampContribution(logRateAdjustmentSum, 2.0)),
    confidence_adjustment: confidenceAdjustment,
    factors_applied: factorBreakdown.filter(f => f.status === "applied").length,
    factors_missing: missingFactors.length,
    factor_breakdown_json: JSON.stringify(factorBreakdown),
  };
}

async function runEnrichment(pgClient, input) {
  const config = await loadEnrichmentConfig(pgClient);
  const batchId = input && input.chain_id ? `enrichment_batch_${input.chain_id}` : rid("enrichment_batch");
  const matrixRows = await pgClient`SELECT matrix_id, batch_id, canonical_prop_key, mlb_player_id, board_line_value, prop_side, game_pk, team_id, opponent_team_id, matrix_payload_json
     FROM score.prop_matrix_current
     WHERE matrix_id NOT IN (SELECT matrix_id FROM scoring.enrichment_leg_current)
     ORDER BY matrix_id
     LIMIT ${MAX_LEGS_PER_INVOCATION}`.catch(() => []);

  const ctxMaps = await loadRealLegContexts(pgClient, matrixRows);
  const roleInputs = await loadRoleTransitionInputs(pgClient, matrixRows).catch(() => ({ classifiedRoleByPlayer: new Map(), confirmedStarterIds: new Set(), historicalRateByPlayerProp: new Map(), cfg: null }));

  let written = 0;
  const insertRows = [];
  for (const row of matrixRows) {
    const legContext = buildLegContextReal(row, ctxMaps, config.thresholdsByFactor.get("market_implied_total"));
    const result = await enrichLeg(row, config, legContext);
    const roleOverride = computeRoleTransitionOverride(row, roleInputs);
    insertRows.push({
      enrichment_id: `enr_${row.matrix_id}`, matrix_id: row.matrix_id, batch_id: batchId, canonical_prop_key: result.canonical_prop_key,
      mlb_player_id: row.mlb_player_id, board_line_value: row.board_line_value, prop_side: row.prop_side,
      log_rate_adjustment: result.log_rate_adjustment, rate_multiplier: result.rate_multiplier, confidence_adjustment: result.confidence_adjustment,
      factors_applied: result.factors_applied, factors_missing: result.factors_missing, factor_breakdown_json: result.factor_breakdown_json,
      role_transition_override_hp: roleOverride ? roleOverride.override_hp : null,
      role_transition_confidence_penalty: roleOverride ? roleOverride.confidence_penalty : null,
      role_transition_detected: roleOverride ? roleOverride.detected : null
    });
    written++;
  }
  const insertCols = ["enrichment_id", "matrix_id", "batch_id", "canonical_prop_key", "mlb_player_id", "board_line_value", "prop_side", "log_rate_adjustment", "rate_multiplier", "confidence_adjustment", "factors_applied", "factors_missing", "factor_breakdown_json", "role_transition_override_hp", "role_transition_confidence_penalty", "role_transition_detected"];
  if (insertRows.length) {
    const CHUNK = 150;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      await pgClient`INSERT INTO scoring.enrichment_leg_current ${pgClient(insertRows.slice(i, i + CHUNK), ...insertCols)}
        ON CONFLICT (enrichment_id) DO UPDATE SET batch_id=EXCLUDED.batch_id, log_rate_adjustment=EXCLUDED.log_rate_adjustment, rate_multiplier=EXCLUDED.rate_multiplier, confidence_adjustment=EXCLUDED.confidence_adjustment, factors_applied=EXCLUDED.factors_applied, factors_missing=EXCLUDED.factors_missing, factor_breakdown_json=EXCLUDED.factor_breakdown_json, role_transition_override_hp=EXCLUDED.role_transition_override_hp, role_transition_confidence_penalty=EXCLUDED.role_transition_confidence_penalty, role_transition_detected=EXCLUDED.role_transition_detected, updated_at=now()`;
    }
  }

  const cleanupResult = await pgClient`DELETE FROM scoring.enrichment_leg_current WHERE matrix_id NOT IN (SELECT matrix_id FROM score.prop_matrix_current)`.catch((e) => ({ count: null, error: String(e && e.message ? e.message : e) }));
  const staleRowsCleaned = cleanupResult && cleanupResult.count != null ? cleanupResult.count : null;

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
    status: matrixRows.length >= MAX_LEGS_PER_INVOCATION ? "partial_continue" : "completed",
    legs_read: matrixRows.length, legs_enriched: written,
    stale_rows_cleaned: staleRowsCleaned,
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, ["HYPERDRIVE"]);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "scoring.enrichment_leg_current", upstream_reads: "score.prop_matrix_current, config.enrichment_factors, config.enrichment_profile_cells", required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const pgClient = pg(env);
      try {
        const output = await runEnrichment(pgClient, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      } finally {
        await pgClient.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
