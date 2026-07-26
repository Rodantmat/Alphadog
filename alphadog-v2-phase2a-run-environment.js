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
      if (ctx.temp_f == null && ctx.altitude_ft == null && ctx.pressure_drop_inhg == null) return null;
      const tempDelta = (ctx.temp_f ?? 70) - 70;
      const shiftFt = (tempDelta * (a || 0)) + (((ctx.altitude_ft ?? 0) / 1000) * (b || 0)) + ((ctx.pressure_drop_inhg ?? 0) * (c || 0));
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
    case "weather_precip": {
      if (ctx.precipitation_probability_pct == null) return null;
      return ctx.precipitation_probability_pct * (a || 0);
    }
    case "batter_quality_of_contact": {
      const leagueAvgXwoba = t.league_avg_xwoba ?? 0.320;
      const leagueAvgXwobacon = t.league_avg_xwobacon ?? 0.369;
      const leagueAvgSweetSpot = t.league_avg_sweet_spot_pct ?? 32.5;
      const leagueAvgBarrel = t.league_avg_barrel_pct ?? 7.5;
      if (cell.prop_key === "doubles") {
        if (ctx.batter_sweet_spot_percent == null) return null;
        return (ctx.batter_sweet_spot_percent - leagueAvgSweetSpot) * (a || 0);
      }
      if (cell.prop_key === "total_bases") {
        if (ctx.batter_xwobacon == null) return null;
        return (ctx.batter_xwobacon - leagueAvgXwobacon) * (a || 0);
      }
      if (cell.prop_key === "home_runs") {
        if (ctx.batter_xwoba == null && ctx.batter_barrel_batted_rate == null) return null;
        const xwobaTerm = ctx.batter_xwoba != null ? (ctx.batter_xwoba - leagueAvgXwoba) * (a || 0) : 0;
        const barrelTerm = ctx.batter_barrel_batted_rate != null ? (ctx.batter_barrel_batted_rate - leagueAvgBarrel) * (b || 0) : 0;
        return xwobaTerm + barrelTerm;
      }
      // hits_runs_rbis and partial-relevance props (hits, runs, rbis) all use plain xwOBA deviation
      if (ctx.batter_xwoba == null) return null;
      return (ctx.batter_xwoba - leagueAvgXwoba) * (a || 0);
    }
    default:
      return null;
  }
}

function classifyIntoTier(factorKey, legContext, thresholds) {
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
    if (ctx.umpire_strikeouts_delta_vs_league == null) return null;
    const pitcherFriendlyMin = t.k_delta_pitcher_friendly_min ?? 0.3;
    const hitterFriendlyMax = t.k_delta_hitter_friendly_max ?? -0.3;
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
  const marketRows = await pgClient`SELECT game_pk, derived_home_implied_runs, derived_away_implied_runs FROM market.context_probe_game_market_summary WHERE game_pk = ANY(${gpkLit}::bigint[])`.catch(() => []);
  const umpireAssignmentRows = await pgClient`SELECT game_pk, home_plate_umpire_id FROM daily.umpire_context_current WHERE game_pk = ANY(${gpkLit}::bigint[]) AND home_plate_umpire_id IS NOT NULL`.catch(() => []);
  const umpireIds = [...new Set(umpireAssignmentRows.map(r => r.home_plate_umpire_id).filter(Boolean))];
  const umpireTendencyRows = umpireIds.length ? await pgClient`SELECT umpire_id, strikeouts_delta_vs_league, walks_delta_vs_league, runs_delta_vs_league FROM ref.umpire_tendency WHERE umpire_id = ANY(${"{" + umpireIds.join(",") + "}"}::bigint[])`.catch(() => []) : [];
  const tendencyByUmpireId = new Map(umpireTendencyRows.map(r => [Number(r.umpire_id), r]));
  const umpireTendencyByGame = new Map();
  for (const r of umpireAssignmentRows) {
    const tendency = tendencyByUmpireId.get(Number(r.home_plate_umpire_id));
    if (tendency) umpireTendencyByGame.set(String(r.game_pk), tendency);
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

  const teamRows = await pgClient`SELECT mlb_team_id, abbreviation FROM ref.teams`.catch(() => []);
  const teamIdByAbbrev = new Map(teamRows.map(r => [String(r.abbreviation).toUpperCase(), Number(r.mlb_team_id)]));

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

  const battedBallRows = await pgClient`SELECT mlb_player_id, ground_ball_pct, air_pct FROM ref.batted_ball_profile`.catch(() => []);
  const battedBallProfileByPlayer = new Map(battedBallRows.map(r => [String(r.mlb_player_id), r]));

  const hrRateRows = playerIds.length ? await pgClient`SELECT player_id, hr_rate FROM stats_hitter.metric_snapshots WHERE player_id = ANY(${pidLit}::bigint[]) AND metric_window='season_to_date'`.catch(() => []) : [];
  const hrRateByPlayer = new Map(hrRateRows.map(r => [String(r.player_id), r.hr_rate]));

  const runningGameRows = await pgClient`SELECT mlb_player_id, lead_distance_gained FROM ref.pitcher_running_game`.catch(() => []);
  const pitcherLeadDistanceByPitcherId = new Map(runningGameRows.map(r => [String(r.mlb_player_id), r.lead_distance_gained]));

  const qocRows = playerIds.length ? await pgClient`SELECT mlb_player_id, xwoba, xwobacon, sweet_spot_percent, barrel_batted_rate, season_year FROM ref.batter_quality_of_contact WHERE mlb_player_id = ANY(${pidLit}::bigint[]) AND active=1 ORDER BY season_year DESC`.catch(() => []) : [];
  const qocByPlayer = new Map();
  for (const r of qocRows) {
    const pid = Number(r.mlb_player_id);
    const existing = qocByPlayer.get(pid);
    if (!existing || Number(r.season_year) > existing.season_year) qocByPlayer.set(pid, { xwoba: r.xwoba, xwobacon: r.xwobacon, sweet_spot_percent: r.sweet_spot_percent, barrel_batted_rate: r.barrel_batted_rate, season_year: Number(r.season_year) });
  }

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
    qocByPlayer
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
async function enrichLeg(matrixRow, config, legContext) {
  const propKey = matrixRow.canonical_prop_key;
  const roofClosed = legContext.roof_status && String(legContext.roof_status).toLowerCase().includes("closed");

  let logRateAdjustmentSum = 0;
  let confidenceAdjustment = 0;
  const factorBreakdown = [];
  const missingFactors = [];

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
    logRateAdjustmentSum += contribution;
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

async function runEnrichment(pgClient, input) {
  const config = await loadEnrichmentConfig(pgClient);
  const batchId = input && input.chain_id ? `enrichment_batch_${input.chain_id}` : rid("enrichment_batch");
  const matrixRows = await pgClient`SELECT matrix_id, batch_id, canonical_prop_key, mlb_player_id, board_line_value, prop_side, game_pk, team_id, opponent_team_id, matrix_payload_json
     FROM score.prop_matrix_current
     WHERE blocking_for_scoring=0
       AND matrix_id NOT IN (SELECT matrix_id FROM scoring.enrichment_leg_current WHERE batch_id=${batchId})
     ORDER BY matrix_id
     LIMIT ${MAX_LEGS_PER_INVOCATION}`.catch(() => []);

  const ctxMaps = await loadRealLegContexts(pgClient, matrixRows);

  let written = 0;
  const insertRows = [];
  for (const row of matrixRows) {
    const legContext = buildLegContextReal(row, ctxMaps, config.thresholdsByFactor.get("market_implied_total"));
    const result = await enrichLeg(row, config, legContext);
    insertRows.push({
      enrichment_id: `enr_${row.matrix_id}`, matrix_id: row.matrix_id, batch_id: batchId, canonical_prop_key: result.canonical_prop_key,
      mlb_player_id: row.mlb_player_id, board_line_value: row.board_line_value, prop_side: row.prop_side,
      log_rate_adjustment: result.log_rate_adjustment, rate_multiplier: result.rate_multiplier, confidence_adjustment: result.confidence_adjustment,
      factors_applied: result.factors_applied, factors_missing: result.factors_missing, factor_breakdown_json: result.factor_breakdown_json
    });
    written++;
  }
  const insertCols = ["enrichment_id", "matrix_id", "batch_id", "canonical_prop_key", "mlb_player_id", "board_line_value", "prop_side", "log_rate_adjustment", "rate_multiplier", "confidence_adjustment", "factors_applied", "factors_missing", "factor_breakdown_json"];
  if (insertRows.length) {
    const CHUNK = 150;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      await pgClient`INSERT INTO scoring.enrichment_leg_current ${pgClient(insertRows.slice(i, i + CHUNK), ...insertCols)}
        ON CONFLICT (enrichment_id) DO UPDATE SET batch_id=EXCLUDED.batch_id, log_rate_adjustment=EXCLUDED.log_rate_adjustment, rate_multiplier=EXCLUDED.rate_multiplier, confidence_adjustment=EXCLUDED.confidence_adjustment, factors_applied=EXCLUDED.factors_applied, factors_missing=EXCLUDED.factors_missing, factor_breakdown_json=EXCLUDED.factor_breakdown_json, updated_at=now()`;
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
