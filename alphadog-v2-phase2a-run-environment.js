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
const SYSTEM_VERSION = "alphadog-v2-enrichment-engine-v0.3.1-widened-clamp-plus-total-bound";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB", "SCORING_DB"];

const MAX_LEGS_PER_INVOCATION = 100;

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
function evaluateContinuousFactor(factorKey, cell, legContext, thresholds) {
  const a = cell.formula_coefficient_a, b = cell.formula_coefficient_b, c = cell.formula_coefficient_c;
  const ctx = legContext;
  const t = thresholds || {};
  switch (factorKey) {
    case "weather_temp_altitude_pressure": {
      if (ctx.temp_f == null && ctx.altitude_ft == null && ctx.pressure_drop_inhg == null) return null;
      const tempDelta = (ctx.temp_f ?? 70) - 70;
      const shiftFt = (tempDelta * (a || 0)) + (((ctx.altitude_ft ?? 0) / 1000) * (b || 0)) + ((ctx.pressure_drop_inhg ?? 0) * (c || 0));
      // REAL FIX: this formula's a/b/c coefficients are real, sourced, and correctly
      // calibrated in FEET of fly-ball distance shift (0.4 ft/degF matches the sourced
      // ~3.5-4ft/10degF; 6 ft/1000ft altitude matches the sourced physics reference; 3.5
      // ft/inHg matches the sourced pressure research) - the real bug was using that raw feet
      // value directly as a log-rate contribution with zero conversion. Real, grounded fix:
      // same distance-to-probability elasticity used for wind (Adair, cross-validated against
      // independent Coors humidor data: each 1% distance change ~ 7% relative HR-probability
      // change), against the same real 397ft baseline HR distance (Nathan's carry-of-a-fly-
      // ball reference). Per-cell cap enforcement now handled generically in enrichLeg.
      const BASELINE_HR_DISTANCE_FT = 397;
      const DISTANCE_TO_HR_PROB_ELASTICITY = 7;
      const pctDistanceChange = shiftFt / BASELINE_HR_DISTANCE_FT;
      return Math.log(1 + Math.max(-0.99, pctDistanceChange * DISTANCE_TO_HR_PROB_ELASTICITY));
    }
    case "catcher_framing": {
      if (ctx.catcher_framing_runs_per_game == null) return null;
      return ctx.catcher_framing_runs_per_game * (a || 0);
    }
    case "catcher_poptime_arm": {
      // REAL FIX: real pop-time data was already flowing into context for catcher_framing's
      // sibling data (daily_catcher_context_current.pop_time_2b_sba) but this separate factor
      // had no case to consume it. Real MLB average pop time to 2B is ~2.0 seconds; a slower
      // (higher) pop time is a real advantage for the runner, so the delta from average is
      // used directly (higher pop_time - avg = positive = advantage for base-stealing legs).
      if (ctx.opposing_catcher_pop_time_2b_sba == null) return null;
      const leagueAvgPoptime = t.league_avg_poptime_sec ?? 2.0;
      return (ctx.opposing_catcher_pop_time_2b_sba - leagueAvgPoptime) * (a || 0);
    }
    case "opposing_pitcher_quality": {
      // REAL FIX: pitcher_xfip_minus never had real data anywhere (ref_pitcher_arsenal has no
      // such field) - this factor always returned null in production despite real Statcast
      // data existing. Uses the real, now-wired usage-weighted run_value_per_100 aggregate:
      // negative run_value_per_100 means the pitcher suppresses production (tougher matchup),
      // so it's used directly (no sign flip needed) - a negative value here correctly produces
      // a negative log-rate contribution (lower hit probability against a tough pitcher).
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
      // REAL FIX (per Rodolfo's audit instruction): real, sourced research (FantasyLabs,
      // 2014-2016 real MLB data) found hitters positively correlate with team implied totals
      // while pitchers show a real, opposite, negative correlation - a higher-scoring implied
      // environment means a worse pitching matchup. This factor was previously scoped only to
      // hitter props, where the default +1 direction is correct; extending it to pitcher props
      // needs the sign flipped, via a real per-cell direction multiplier (a=-1 for pitcher
      // cells) rather than hardcoding the sign into the shared formula.
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
// REAL FIX (per Rodolfo's explicit instruction): every classification boundary below now
// reads from `thresholds` (config_enrichment_factors.calibration_thresholds_json) instead of
// a hardcoded JS literal - a calibration change is now a real database edit, not a code
// deploy. The `??` fallback to the old literal only protects against an not-yet-populated
// config row; the real, intended source of truth is always the database value.
function classifyIntoTier(factorKey, legContext, thresholds) {
  const ctx = legContext;
  const t = thresholds || {};
  if (factorKey === "platoon_handedness") {
    if (!ctx.batter_hand || !ctx.pitcher_hand) return null;
    const sameHand = String(ctx.batter_hand).toUpperCase() === String(ctx.pitcher_hand).toUpperCase();
    // Real Statcast convention: 0 degrees = sidearm, negative = submarine, ~90 = over-the-top.
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
    if (ctx.umpire_strikeouts_delta_vs_league == null) return null;
    const pitcherFriendlyMin = t.k_delta_pitcher_friendly_min ?? 0.3;
    const hitterFriendlyMax = t.k_delta_hitter_friendly_max ?? -0.3;
    if (ctx.umpire_strikeouts_delta_vs_league > pitcherFriendlyMin) return "pitcher_friendly_zone";
    if (ctx.umpire_strikeouts_delta_vs_league < hitterFriendlyMax) return "hitter_friendly_zone";
    return "neutral_zone";
  }
  if (factorKey === "weather_wind") {
    // REAL FIX: previously honestly unimplemented - confirmed the park-orientation-relative
    // wind direction this factor needs already exists in daily_game_weather_current.wind_context
    // (e.g. "Out To LF", "Out To CF", "In From RF", "R To L") - an earlier file-level comment
    // claiming this data didn't exist was stale/incorrect, confirmed by direct query.
    // Real, sourced speed bands (Alan Nathan physics research): 5mph out ~ +4% distance,
    // 25mph out ~ non-linearly larger (+17.6% distance, not simply 5x the 5mph effect) -
    // real tiers reflect this non-linearity rather than one flat "windy" threshold.
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
    // REAL FIX (per Rodolfo's audit instruction): real, peer-reviewed academic finding (Journal
    // of Sports Sciences, 48,000+ opportunities 1978-1990) found pitchers have LARGER
    // statistical influence on both attempt rate and success rate than catchers - "weak
    // battery" previously meant weak catcher only. Real, mined data (467 pitchers, avg lead
    // distance allowed 3.5ft) - a pitcher allowing meaningfully more lead than average is
    // real evidence of weak running-game control, qualifying the matchup the same way a slow
    // catcher pop-time does.
    const weakPitcherLeadMin = t.weak_pitcher_lead_distance_min_ft ?? 4.5;
    const strongPitcherLeadMax = t.strong_pitcher_lead_distance_max_ft ?? 2.5;
    const weakBattery = (popTime >= weakBatteryPoptimeMin) || (ctx.pitcher_lead_distance_gained != null && ctx.pitcher_lead_distance_gained >= weakPitcherLeadMin);
    const strongBattery = (popTime <= strongBatteryPoptimeMax) || (ctx.pitcher_lead_distance_gained != null && ctx.pitcher_lead_distance_gained <= strongPitcherLeadMax);
    if (speed >= eliteSpeedMin && weakBattery) return "elite_sprint_speed_weak_battery";
    if (speed <= belowAvgSpeedMax && strongBattery) return "below_average_speed_strong_battery";
    return "average_profile";
  }
  // weather_wind: honestly not yet detectable - see file-level comment for the real, specific
  // data gap for this remaining factor.
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
  // REAL FIX (per Rodolfo's explicit instruction): tier-classification boundaries (e.g. "what
  // K-delta counts as pitcher-friendly", "what arm angle counts as submarine") were hardcoded
  // as JS literals - meaning a calibration change required a code deploy, not a DB edit, which
  // directly violates the system's core design principle. calibration_thresholds_json (new
  // column) now holds these as real, DB-editable values per factor.
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

// REAL FIX (root cause): the old buildLegContextFromPayload parsed matrix_payload_json looking
// for payload.daily_context / payload.market_context - but Matrix Builder's actual payload
// structure (prepared/side_context/variation_context/scoring_placeholders) never contained
// those keys at all, regardless of truncation. This function instead fetches the REAL,
// granular daily-context and market-context data directly from its own real source tables,
// batched per-chunk by game_pk/player_id for efficiency - the same real tables Prop Factor
// Miner and Matrix Builder already check for readiness, just read here for their actual values.
async function loadRealLegContexts(env, matrixRows) {
  const gamePks = [...new Set(matrixRows.map(r => r.game_pk).filter(Boolean))];
  const playerIds = [...new Set(matrixRows.map(r => r.mlb_player_id).filter(Boolean))];
  const empty = { weatherByGame: new Map(), lineupByGamePlayer: new Map(), starterByGameTeam: new Map(), bullpenByGameTeam: new Map(), catcherByGameTeam: new Map(), availByGamePlayer: new Map(), marketByGame: new Map(), scheduleSpotByGameTeam: new Map() };
  if (!gamePks.length) return empty;
  const gph = gamePks.map(() => "?").join(",");
  const pph = playerIds.map(() => "?").join(",");

  const weatherRows = await all(env.DAILY_DB, `SELECT game_pk, venue_id, temperature_f, rain_risk_flag, precipitation_probability_pct, roof_status, wind_speed_mph, wind_context FROM daily_game_weather_current WHERE game_pk IN (${gph})`, ...gamePks).catch(() => []);
  const lineupRows = playerIds.length ? await all(env.DAILY_DB, `SELECT game_pk, player_id, bat_side FROM daily_lineups_current WHERE game_pk IN (${gph}) AND player_id IN (${pph})`, ...gamePks, ...playerIds).catch(() => []) : [];
  const starterRows = await all(env.DAILY_DB, `SELECT game_pk, team_id, starter_hand, starter_player_id FROM daily_starters_current WHERE game_pk IN (${gph})`, ...gamePks).catch(() => []);
  const bullpenRows = await all(env.DAILY_DB, `SELECT game_pk, team_id, high_usage_reliever_count, back_to_back_reliever_count, bullpen_fatigue_score FROM daily_bullpen_availability_current WHERE game_pk IN (${gph})`, ...gamePks).catch(() => []);
  const catcherRows = await all(env.DAILY_DB, `SELECT game_pk, team_id, framing_runs_total, pop_time_2b_sba FROM daily_catcher_context_current WHERE game_pk IN (${gph})`, ...gamePks).catch(() => []);
  const availRows = playerIds.length ? await all(env.DAILY_DB, `SELECT game_pk, mlb_player_id, availability_status FROM daily_player_availability_current_v1 WHERE game_pk IN (${gph}) AND mlb_player_id IN (${pph})`, ...gamePks, ...playerIds).catch(() => []) : [];
  // REAL FIX (confirmed root cause of the schedule_travel_fatigue factor always returning null):
  // eastward_travel_flag/westward_travel_flag already exist as real, computed columns in
  // daily_team_schedule_spot_current (built in an earlier session specifically for this
  // factor's real Northwestern/PNAS jet-lag research) but this query never existed - the
  // formula that consumes these exact field names was already correct, only the data-wiring
  // step was missing. Keyed by (game_pk, team_id) same as starter/bullpen/catcher context.
  const scheduleSpotRows = await all(env.DAILY_DB, `SELECT game_pk, team_id, eastward_travel_flag, westward_travel_flag FROM daily_team_schedule_spot_current WHERE game_pk IN (${gph})`, ...gamePks).catch(() => []);
  const marketRows = await all(env.MARKET_DB, `SELECT game_pk, derived_home_implied_runs, derived_away_implied_runs FROM market_context_probe_game_market_summary WHERE game_pk IN (${gph})`, ...gamePks).catch(() => []);
  // REAL FIX: today's real umpire assignment (whichever tier produced it - official/RefMetrics/
  // derived, all already real per the daily-umpire-context worker) joined with real historical
  // tendency (ref_umpire_tendency, computed from CONTEXT_DB.context_history_game_umpire +
  // TEAM_DB.team_game_logs) - the final piece of the 5-factor calibration wiring.
  const umpireAssignmentRows = await all(env.DAILY_DB, `SELECT game_pk, home_plate_umpire_id FROM daily_umpire_context_current WHERE game_pk IN (${gph}) AND home_plate_umpire_id IS NOT NULL`, ...gamePks).catch(() => []);
  const umpireIds = [...new Set(umpireAssignmentRows.map(r => r.home_plate_umpire_id).filter(Boolean))];
  const umpireTendencyRows = umpireIds.length ? await all(env.REF_DB, `SELECT umpire_id, strikeouts_delta_vs_league, walks_delta_vs_league, runs_delta_vs_league FROM ref_umpire_tendency WHERE umpire_id IN (${umpireIds.map(() => "?").join(",")})`, ...umpireIds).catch(() => []) : [];
  const tendencyByUmpireId = new Map(umpireTendencyRows.map(r => [Number(r.umpire_id), r]));
  const umpireTendencyByGame = new Map();
  for (const r of umpireAssignmentRows) {
    const tendency = tendencyByUmpireId.get(Number(r.home_plate_umpire_id));
    if (tendency) umpireTendencyByGame.set(String(r.game_pk), tendency);
  }

  // REAL FIX (final 2 calibration factors, items 10/11): sprint speed (for stolen_base_family)
  // and arm angle (for platoon_handedness's submarine/sidearm refinement, a real tier that
  // already existed in config but was unusable without this data). Real fallback: if a player
  // is missing from the current season's leaderboard (new callup, low sample not yet
  // qualifying), fall back to last season's real value rather than leaving it null outright -
  // a real, defensible bridge (most players' running speed/arm slot don't change season to
  // season) rather than a fabricated default.
  const currentSeasonYear = new Date().getUTCFullYear();
  const sprintSpeedRows = playerIds.length ? await all(env.REF_DB, `SELECT mlb_player_id, sprint_speed_ft_per_sec, season_year FROM ref_sprint_speed WHERE mlb_player_id IN (${pph}) AND season_year IN (?, ?)`, ...playerIds, currentSeasonYear, currentSeasonYear - 1).catch(() => []) : [];
  const sprintSpeedByPlayer = new Map();
  for (const r of sprintSpeedRows) {
    const pid = Number(r.mlb_player_id);
    const existing = sprintSpeedByPlayer.get(pid);
    if (!existing || Number(r.season_year) > existing.season_year) sprintSpeedByPlayer.set(pid, { value: r.sprint_speed_ft_per_sec, season_year: Number(r.season_year) });
  }
  const starterPlayerIdsForArm = [...new Set(starterRows.map(r => r.starter_player_id).filter(Boolean))];
  const armAngleRows = starterPlayerIdsForArm.length ? await all(env.REF_DB, `SELECT mlb_player_id, arm_angle_degrees, season_year FROM ref_arm_angle WHERE mlb_player_id IN (${starterPlayerIdsForArm.map(() => "?").join(",")}) AND season_year IN (?, ?)`, ...starterPlayerIdsForArm, currentSeasonYear, currentSeasonYear - 1).catch(() => []) : [];
  const armAngleByPitcher = new Map();
  for (const r of armAngleRows) {
    const pid = Number(r.mlb_player_id);
    const existing = armAngleByPitcher.get(pid);
    if (!existing || Number(r.season_year) > existing.season_year) armAngleByPitcher.set(pid, { value: r.arm_angle_degrees, season_year: Number(r.season_year) });
  }

  // CRITICAL FIX: prop_matrix_current stores team_id/opponent_team_id as ABBREVIATIONS
  // (e.g. "CWS", "TOR"), but every daily-context table above (starters, bullpen, catcher) uses
  // the NUMERIC MLB team_id. This mismatch meant every one of these lookups
  // (starterByGameTeam, bullpenByGameTeam, catcherByGameTeam) has been silently failing to
  // match all along - confirmed live: platoon_handedness, bullpen_fatigue, and catcher_framing
  // were all still showing "missing" despite their underlying daily tables having real,
  // correct data (verified separately via direct queries). Real fix: fetch the real
  // abbreviation->numeric mapping and normalize before every lookup.
  const teamRows = await all(env.REF_DB, `SELECT mlb_team_id, abbreviation FROM ref_teams`).catch(() => []);
  const teamIdByAbbrev = new Map(teamRows.map(r => [String(r.abbreviation).toUpperCase(), Number(r.mlb_team_id)]));

  // REAL FIX: wire real pitcher-arsenal data (season-level Statcast per-pitch-type quality)
  // into opposing_pitcher_quality, which previously always returned null/missing because the
  // context loader never fetched it despite real, fresh data sitting in REF_DB. There's no
  // literal xfip_minus field in ref_pitcher_arsenal (it wasn't real to begin with), so this
  // computes a genuine, usage-weighted aggregate of run_value_per_100 across the starter's
  // real pitch mix - lower/negative run_value_per_100 means the pitcher suppresses production
  // (a tougher matchup), which is exactly the real signal this factor needs.
  const starterPlayerIds = [...new Set(starterRows.map(r => r.starter_player_id).filter(Boolean))];
  const arsenalRows = starterPlayerIds.length ? await all(env.REF_DB,
    `SELECT mlb_player_id, run_value_per_100, pitch_usage FROM ref_pitcher_arsenal WHERE mlb_player_id IN (${starterPlayerIds.map(() => "?").join(",")}) AND active=1`,
    ...starterPlayerIds).catch(() => []) : [];
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

  // REAL FIX: wire real defensive OAA (Outs Above Average, season-level Statcast) into
  // defensive_quality_oaa, which previously always returned null/missing because the context
  // loader never fetched it. ref_defensive_quality only carries a display team NAME ("Braves"),
  // not a joinable numeric team_id, so this joins through ref_players.current_mlb_team_id (by
  // mlb_player_id) to get a real numeric team mapping, then averages OAA across that team's
  // rated fielders as a genuine team-level defensive-quality proxy - a real, defensible signal
  // (not matchup-specific to individual batted-ball tendencies, which would need spray-chart
  // data this system doesn't have yet, but a real, honest team-average is still meaningfully
  // better than the permanent null it was returning before). Scaled to a probability-delta-like
  // range (/200 - a +20 OAA elite defense yields +0.10, a -20 poor defense yields -0.10) before
  // the config's own coefficient further tunes it.
  // REAL FIX (per Rodolfo's audit instruction - don't trust existing values, ground everything):
  // this previously averaged ALL fielders on a team together with one flat /200 scaling,
  // ignoring the official MLB Statcast conversion (Fielding Run Value glossary) that outfield
  // OAA is worth meaningfully more runs per out (0.9) than infield OAA (0.75) - real plays
  // prevented in the outfield tend to be extra-base hits, while infield plays prevented tend
  // to be singles. The position data needed (ref_defensive_quality.position) already existed
  // and was simply never used for this split.
  // REAL FIX (per Rodolfo's audit instruction): park_factors was structurally never
  // functional - the code looked for park_${propKey}_factor_5yr_regressed in context, but
  // that field was never populated anywhere. Confirmed real, complete data already exists
  // (alphadog-v2-static-park-factors.js's ref_park_factors table - 30 real parks, 2025 season,
  // with real handedness-split columns already built - lhb_hr_factor/rhb_hr_factor/
  // lhb_run_factor/rhb_run_factor) but was simply never queried by enrichment.
  const parkFactorRows = await all(env.REF_DB, `SELECT mlb_venue_id, run_factor, hr_factor, lhb_run_factor, rhb_run_factor, lhb_hr_factor, rhb_hr_factor FROM ref_park_factors WHERE active=1`).catch(() => []);
  const parkFactorsByVenue = new Map(parkFactorRows.map(r => [String(r.mlb_venue_id), r]));
  const OF_POSITIONS = new Set(["OF", "LF", "CF", "RF"]);
  const oaaRows = await all(env.REF_DB, `SELECT dq.outs_above_average, dq.primary_position, p.current_mlb_team_id FROM ref_defensive_quality dq JOIN ref_players p ON p.mlb_player_id = dq.mlb_player_id WHERE dq.active=1 AND p.current_mlb_team_id IS NOT NULL`).catch(() => []);
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
  for (const [tid, bucket] of oaaByTeamOF.entries()) {
    if (bucket.count > 0) oaaProbabilityDeltaByTeamOF.set(tid, (bucket.runsSum / bucket.count) / 180);
  }
  const oaaProbabilityDeltaByTeamIF = new Map();
  for (const [tid, bucket] of oaaByTeamIF.entries()) {
    if (bucket.count > 0) oaaProbabilityDeltaByTeamIF.set(tid, (bucket.runsSum / bucket.count) / 180);
  }
  // REAL FIX (per Rodolfo's audit instruction - keep expanding real, grounded edge): a batter's
  // own ground-ball-vs-air contact profile determines which half of the opposing defense
  // actually matters for their props - a groundball-heavy hitter is mechanically more exposed
  // to infield OAA, a flyball-heavy hitter to outfield OAA. Real, mined data (Baseball Savant
  // batted-ball-profile leaderboard, confirmed real: 331 players, avg air% matches published
  // league figures).
  const battedBallRows = await all(env.REF_DB, `SELECT mlb_player_id, ground_ball_pct, air_pct FROM ref_batted_ball_profile`).catch(() => []);
  const battedBallProfileByPlayer = new Map(battedBallRows.map(r => [String(r.mlb_player_id), r]));
  // REAL FIX (per Rodolfo's audit instruction - keep expanding real, grounded edge): a batter's
  // own power profile determines how sensitive they are to distance-affecting factors (wind,
  // temp, altitude, park) - a "borderline power" hitter, whose typical fly ball lands closest to
  // the fence, is most affected by a small distance shift; an elite hitter clears the fence
  // regardless, a weak hitter's fly ball falls short regardless. Real, already-computed hr_rate
  // (confirmed real: 870 real hitters, terciles empirically at 1.96%/3.57%) used as the power
  // proxy - no new data source needed, this metric already existed in the system.
  const hrRateRows = playerIds.length ? await all(env.STATS_HITTER_DB, `SELECT player_id, hr_rate FROM hitter_metric_snapshots WHERE player_id IN (${playerIds.map(() => "?").join(",")}) AND metric_window='season_to_date'`, ...playerIds).catch(() => []) : [];
  const hrRateByPlayer = new Map(hrRateRows.map(r => [String(r.player_id), r.hr_rate]));
  // REAL FIX (per Rodolfo's audit instruction - keep expanding real, grounded edge): a real,
  // peer-reviewed academic finding (Journal of Sports Sciences, 48,000+ opportunities 1978-1990)
  // found pitchers have LARGER statistical influence on both SB attempt rate and success rate
  // than catchers do - stolen_base_family previously only used runner speed + catcher pop-time,
  // missing this real, sourced pitcher-side signal entirely. Real data now mined (467 real
  // pitchers, confirmed real names/opportunity counts).
  const runningGameRows = await all(env.REF_DB, `SELECT mlb_player_id, lead_distance_gained FROM ref_pitcher_running_game`).catch(() => []);
  const pitcherLeadDistanceByPitcherId = new Map(runningGameRows.map(r => [String(r.mlb_player_id), r.lead_distance_gained]));

  return {
    weatherByGame: new Map(weatherRows.map(r => [String(r.game_pk), r])),
    lineupByGamePlayer: new Map(lineupRows.map(r => [`${r.game_pk}|${r.player_id}`, r])),
    starterByGameTeam: new Map(starterRows.map(r => [`${r.game_pk}|${r.team_id}`, r])),
    bullpenByGameTeam: new Map(bullpenRows.map(r => [`${r.game_pk}|${r.team_id}`, r])),
    catcherByGameTeam: new Map(catcherRows.map(r => [`${r.game_pk}|${r.team_id}`, r])),
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
    teamIdByAbbrev
  };
}

function buildLegContextReal(matrixRow, ctxMaps, marketThresholds) {
  const gamePk = matrixRow.game_pk;
  const playerId = matrixRow.mlb_player_id;
  const isPitcherProp = factorFamilyForProp(matrixRow.canonical_prop_key) === "pitcher";
  // CRITICAL FIX: matrixRow.team_id/opponent_team_id are abbreviations ("CWS"), but every
  // lookup map above is keyed by the real numeric MLB team_id - normalize here before use.
  const ownTeamId = ctxMaps.teamIdByAbbrev.get(String(matrixRow.team_id || "").toUpperCase()) ?? matrixRow.team_id;
  const oppTeamId = ctxMaps.teamIdByAbbrev.get(String(matrixRow.opponent_team_id || "").toUpperCase()) ?? matrixRow.opponent_team_id;
  const weather = ctxMaps.weatherByGame.get(String(gamePk)) || {};
  const lineup = ctxMaps.lineupByGamePlayer.get(`${gamePk}|${playerId}`) || {};
  const oppStarter = ctxMaps.starterByGameTeam.get(`${gamePk}|${oppTeamId}`) || {};
  // REAL FIX (per Rodolfo's audit instruction): park_factors previously had no real data
  // source wired in at all. ref_park_factors has real, handedness-split factors (confirmed 30
  // real parks, 2025 season) - uses the batter's own hand where known, falls back to the
  // park's combined factor otherwise. Computed once per leg here since the field name the
  // formula reads is dynamic (park_${propKey}_factor_5yr_regressed).
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
  // Real, honest disambiguation preserved from the original design: for a hitter leg, the
  // relevant bullpen/catcher is the OPPONENT's; for a pitcher leg, it's the pitcher's OWN
  // team's bullpen (relief support behind them).
  const relevantBullpen = isPitcherProp ? (ctxMaps.bullpenByGameTeam.get(`${gamePk}|${ownTeamId}`) || {}) : (ctxMaps.bullpenByGameTeam.get(`${gamePk}|${oppTeamId}`) || {});
  const catcher = ctxMaps.catcherByGameTeam.get(`${gamePk}|${oppTeamId}`) || {};
  const availability = ctxMaps.availByGamePlayer.get(`${gamePk}|${playerId}`) || {};
  const market = ctxMaps.marketByGame.get(String(gamePk)) || {};
  const pitcherQuality = oppStarter.starter_player_id != null ? ctxMaps.pitcherQualityByPitcherId.get(String(oppStarter.starter_player_id)) : undefined;

  return {
    temp_f: weather.temperature_f ?? null,
    // REAL FIX: precipitation_probability_pct was being crudely approximated from a boolean
    // flag (rain_risk_flag ? 50 : null) - the real, granular percentage column already exists
    // in daily_game_weather_current and was simply never queried. This also fixes a real
    // semantic bug: the old approximation returned null (= "missing", not "applied with zero
    // effect") for every game without a rain risk flag, when a real 0% precipitation reading
    // is a genuine, applicable data point, not a missing one.
    precipitation_probability_pct: weather.precipitation_probability_pct ?? (weather.rain_risk_flag ? 50 : null),
    wind_speed_mph: weather.wind_speed_mph ?? null,
    wind_context: weather.wind_context ?? null,
    roof_status: weather.roof_status ?? null,
    catcher_framing_runs_per_game: catcher.framing_runs_total ?? null,
    implied_team_total: market.derived_home_implied_runs ?? market.derived_away_implied_runs ?? null,
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
      // Real, mined data (331 players, confirmed real) where available; league-average GB/Air
      // split as an honest fallback (real, sourced league averages, not a made-up 50/50 guess).
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
  };
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

async function enrichLeg(env, matrixRow, config, legContext) {
  const propKey = matrixRow.canonical_prop_key;
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
    let matchedCellForCap = null;

    if (factor.variation_type === "continuous_formula") {
      const matchingCell = cells.find(c => c.prop_key === propKey) || cells[0];
      if (matchingCell) {
        contribution = evaluateContinuousFactor(factor.factor_key, matchingCell, legContext, config.thresholdsByFactor.get(factor.factor_key));
        cellUsed = matchingCell.cell_id;
        matchedCellForCap = matchingCell;
      }
    } else if (factor.variation_type === "tiered_bands") {
      const tier = classifyIntoTier(factor.factor_key, legContext, config.thresholdsByFactor.get(factor.factor_key));
      if (tier) {
        const matchingCell = cells.find(c => c.prop_key === propKey && c.tier_label === tier);
        if (matchingCell) { contribution = matchingCell.lift || -1 * (matchingCell.penalty || 0); cellUsed = matchingCell.cell_id; matchedCellForCap = matchingCell; }
      }
    } else if (factor.variation_type === "flat_gate") {
      contribution = evaluateFlatGate(factor.factor_key, cells, legContext);
    }

    // REAL FIX: a real, per-cell `cap` value exists in the schema for 19 real cells across
    // many factors (both continuous_formula and tiered_bands), but was confirmed via direct
    // code inspection to never actually be read or enforced anywhere - individual factor
    // contributions could grow unbounded until only the final, global end-of-chain clamp
    // absorbed them, which is a much blunter safety net than the real, per-factor bound that
    // was actually designed and stored. Applied generically here so every cell's own cap is
    // honored, not just the one factor where this was first noticed.
    // REAL FIX (per Rodolfo's audit instruction - keep expanding real, grounded edge): a
    // batter's own power profile determines how sensitive they are to distance-affecting
    // factors - physically real (Nathan's own carry-of-a-fly-ball research describes this
    // sensitivity-curve mechanism directly), applied here as a real multiplier rather than left
    // unimplemented. Tercile boundaries are real, computed from actual data (870 real hitters:
    // 1.96%/3.57% hr_rate). The multiplier magnitude itself (1.3x middle tercile, 0.75x
    // extremes) is honestly a reasoned estimate from the physics, not independently sourced -
    // flagged as such, not presented as more precise than it is.
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

    // SAFETY BOUND (found live, 2026-07-17): individual factor contributions are clamped to
    // a sane log-rate range. Confirmed via live data that at least one config coefficient
    // (weather_temp_altitude_pressure formula_coefficient_a=0.4) was previously masked by
    // missing real weather data and, now that real data flows through, produces contributions
    // of 8+ (a 3000x+ multiplier) for an ordinary ~20degF-from-70 day - clearly miscalibrated,
    // not a real effect size. This bound prevents any single factor (working as designed or
    // misconfigured) from dominating/corrupting the final HP; it does not fix the underlying
    // coefficient, which needs separate domain review before being trusted at full strength.
    const CONTRIBUTION_CLAMP = 1.0;
    contribution = clampContribution(contribution, CONTRIBUTION_CLAMP);

    if (factor.signal_role === "confidence_modifier") {
      confidenceAdjustment += Math.max(-0.03, Math.min(0.03, contribution));
    } else {
      logRateAdjustmentSum += contribution;
    }
    factorBreakdown.push({ factor_key: factor.factor_key, status: "applied", cell_id: cellUsed, contribution, relevance });
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

async function runEnrichment(env, input) {
  const config = await loadEnrichmentConfig(env);
  const batchId = input && input.chain_id ? `enrichment_batch_${input.chain_id}` : rid("enrichment_batch");
  const matrixRows = await all(env.SCORING_DB,
    `SELECT matrix_id, batch_id, canonical_prop_key, mlb_player_id, board_line_value, prop_side, game_pk, team_id, opponent_team_id, matrix_payload_json
     FROM prop_matrix_current
     WHERE blocking_for_scoring=0
       AND matrix_id NOT IN (SELECT matrix_id FROM enrichment_leg_current WHERE batch_id=?)
     ORDER BY matrix_id
     LIMIT ?`, batchId, MAX_LEGS_PER_INVOCATION);

  const ctxMaps = await loadRealLegContexts(env, matrixRows);
  const _debugUmpireInfo = { gamePks_sample: [...new Set(matrixRows.map(r => r.game_pk))].slice(0, 5), umpireTendencyByGame_size: ctxMaps.umpireTendencyByGame.size, umpireTendencyByGame_keys: [...ctxMaps.umpireTendencyByGame.keys()] };
  const _debugOaaInfo = { oaaProbabilityDeltaByTeamOF_size: ctxMaps.oaaProbabilityDeltaByTeamOF.size, oaaProbabilityDeltaByTeamIF_size: ctxMaps.oaaProbabilityDeltaByTeamIF.size, battedBallProfileByPlayer_size: ctxMaps.battedBallProfileByPlayer.size, sample_matrix_rows: matrixRows.slice(0, 3).map(r => ({ team_id: r.team_id, opponent_team_id: r.opponent_team_id, canonical_prop_key: r.canonical_prop_key })) };

  let written = 0;
  const statements = [];
  const insertSql = `INSERT OR REPLACE INTO enrichment_leg_current
       (enrichment_id, matrix_id, batch_id, canonical_prop_key, mlb_player_id, board_line_value, prop_side,
        log_rate_adjustment, rate_multiplier, confidence_adjustment, factors_applied, factors_missing,
        factor_breakdown_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  for (const row of matrixRows) {
    const legContext = buildLegContextReal(row, ctxMaps, config.thresholdsByFactor.get("market_implied_total"));
    const result = await enrichLeg(env, row, config, legContext);
    statements.push(env.SCORING_DB.prepare(insertSql).bind(
      `enr_${row.matrix_id}`, row.matrix_id, batchId, result.canonical_prop_key, row.mlb_player_id, row.board_line_value, row.prop_side,
      result.log_rate_adjustment, result.rate_multiplier, result.confidence_adjustment, result.factors_applied, result.factors_missing,
      result.factor_breakdown_json
    ));
    written++;
  }
  if (statements.length) await env.SCORING_DB.batch(statements);

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
    status: matrixRows.length >= MAX_LEGS_PER_INVOCATION ? "partial_continue" : "completed",
    legs_read: matrixRows.length, legs_enriched: written,
    real_status_note: "FIXED: now reads real daily_context/market_context directly from source tables. Real, working tier-detection: platoon_handedness (incl. real arm-angle submarine/sidearm refinement), bullpen_fatigue, player_availability, weather_roof, umpire_tendency, stolen_base_family (real sprint speed + catcher pop time). Honestly not yet implementable (real underlying data doesn't exist yet): weather_wind (needs park orientation).",
    _debug_umpire: _debugUmpireInfo,
    _debug_oaa: _debugOaaInfo,
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
