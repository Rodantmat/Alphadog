import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-phase3c-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-hit-probability-board";
const JOB_KEY = "hit-probability-board";
const SYSTEM_VERSION = "alphadog-v2-hit-probability-board-v0.3.0-postgres-rewire";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";
const PRIMARY_HP_THRESHOLD = 70;
const MAX_LEGS_PER_INVOCATION = 2500;

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8, connection: { statement_timeout: 240000, idle_in_transaction_session_timeout: 240000 } }); }
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
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function gradeForProbability(p) {
  if (p == null) return "BIN_0_NULL";
  if (p >= 80) return "BIN_ELITE";
  if (p >= 70) return "BIN_STRONG";
  if (p >= 60) return "BIN_QUALIFIED";
  return "BIN_LOW";
}

// Convert baseline HP to odds, apply the real rate_multiplier (already computed in
// log-rate space by Enrichment), convert back to a probability. No arbitrary constant.
function computeRealHitProbability(baselineHp, rateMultiplier) {
  if (baselineHp == null) return null;
  const clampedBaseline = clamp(baselineHp, 1, 99);
  const baselineOdds = clampedBaseline / (100 - clampedBaseline);
  const adjustedOdds = baselineOdds * Math.max(rateMultiplier ?? 1.0, 0.01);
  const finalHp = 100 * adjustedOdds / (1 + adjustedOdds);
  return clamp(finalHp, 1, 99);
}

// Calibration correction (2026-07-25): loads the empirically-fit correction map built from
// walk-forward backtesting (real historical game outcomes, not future data - see
// score.calibration_correction_map). Applied as a conservative, sample-size-gated post-hoc
// adjustment: only bins with enough backtest games to trust (>=100) are ever applied, so this
// can never move a prediction based on noise from a handful of games. Props/bins with no fitted
// correction, or insufficient sample size, pass through completely unchanged.
// DISABLED 2026-07-25: this correction map was empirically fit against the old, broken
// prior_strength formula (2/6 for large/medium samples). That root cause has since been fixed
// (prior_strength corrected to 40/13, confirmed via fresh backtest to achieve near-perfect
// calibration on its own for the most-affected prop). Applying these old deltas now would layer
// stale corrections on top of an already-fixed baseline they were never fit against. Raising the
// sample gate to an unreachable threshold disables application while preserving the historical
// bins and methodology notes for future reference or re-fitting against the new baseline.
// Re-enabled 2026-07-25 after root-cause fix + reconciliation: only bins explicitly validated
// against the corrected shrinkage formula (methodology containing 'post_rootfix') are ever
// applied. The original 18-prop bins (methodology 'walk_forward_backtest_v1' /
// '..._pav_smoothed_v2') were fit against the old, broken prior_strength values and are
// preserved in the table for reference/audit trail, but stay permanently inert unless
// explicitly re-validated and re-tagged - reapplying them now would layer stale corrections on
// top of a baseline they were never fit against.
const CALIBRATION_MIN_SAMPLE_GAMES = 100;
async function loadCalibrationMap(pgClient) {
  const rows = await pgClient`SELECT canonical_prop_key, selected_side, tier_key, variant_key, raw_p_bin_low, raw_p_bin_high, correction_delta, n_test_games FROM score.calibration_correction_map WHERE n_test_games >= ${CALIBRATION_MIN_SAMPLE_GAMES} AND methodology LIKE '%post_rootfix%'`.catch(() => []);
  const map = new Map();
  for (const r of rows) {
    const key = `${r.canonical_prop_key}|${r.selected_side || ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}
// Tier-aware lookup (2026-08-13): a tier-specific bin (tier_key matches the player's own
// baseline_v6 tier) is preferred over a prop-level bin (tier_key IS NULL) when both exist for the
// same raw-probability range. This is additive only - every prop with only prop-level rows (the
// entire pre-existing correction map) behaves identically to before, since those rows all have
// tier_key IS NULL and are only ever reached via the fallback branch below.
function applyCalibrationCorrection(propKey, side, rawHpPct, calibrationMap, playerTierKey, playerVariantKey) {
  if (rawHpPct == null || !calibrationMap) return { correctedHp: rawHpPct, applied: false };
  const bins = calibrationMap.get(`${propKey}|${side || ""}`);
  if (!bins || !bins.length) return { correctedHp: rawHpPct, applied: false };
  const rawP = rawHpPct / 100;
  let bin = null;
  if (playerVariantKey) bin = bins.find(b => b.variant_key === playerVariantKey && !b.tier_key && rawP >= Number(b.raw_p_bin_low) && rawP < Number(b.raw_p_bin_high));
  if (!bin && playerTierKey) bin = bins.find(b => b.tier_key === playerTierKey && !b.variant_key && rawP >= Number(b.raw_p_bin_low) && rawP < Number(b.raw_p_bin_high));
  if (!bin) bin = bins.find(b => !b.tier_key && !b.variant_key && rawP >= Number(b.raw_p_bin_low) && rawP < Number(b.raw_p_bin_high));
  if (!bin) return { correctedHp: rawHpPct, applied: false };
  const corrected = clamp(rawHpPct + Number(bin.correction_delta) * 100, 1, 99);
  return { correctedHp: corrected, applied: true, delta_applied: Number(bin.correction_delta) * 100, bin_n_test_games: bin.n_test_games, tier_specific: Boolean(bin.tier_key), variant_specific: Boolean(bin.variant_key) };
}

// Second-stage residual correction, applied AFTER the first stage above, operating directly on
// the already-corrected displayed value rather than trying to infer the first stage's raw input
// (confirmed unreliable - reversing the first-stage delta at the top buckets produced impossible
// raw values exceeding 100%). Grounded in real, deduplicated outcome data measured directly
// against the CURRENT displayed output for props found to still have a genuine gap after the
// first correction. Kept as a small, explicit, auditable table rather than folded into the main
// correction map, since it operates on a different input (displayed, not raw).
//
// Some entries are SOURCE-SPECIFIC (keyed by prop|side|source instead of just prop|side) -
// confirmed live that PrizePicks and Underdog can show meaningfully different miscalibration for
// the same prop (fantasy_score-less: PP consistently 7-10+ points worse than UD at every
// comparable bucket; hits_runs_rbis-less: PP 31.8pt gap vs UD 12.9pt vs Sleeper 20.3pt). This is
// NOT applied as a blanket assumption - pitcher_fantasy_score was checked the same way and found
// to NOT diverge by source (PP 13.3pt vs UD 13.9pt, essentially identical), so it stays
// source-agnostic. Each entry here reflects what the real data actually showed for that specific
// prop, not an assumed pattern.
// Residual correction bins now live in config.residual_correction_bins (2026-08-12) - previously
// a hardcoded JS object, which meant any adjustment (including deactivating a prop once a more
// accurate baseline superseded it, as happened for 'hits' this same night) required a full
// redeploy. Loaded once per invocation, same pattern as loadCalibrationMap below.
async function loadResidualCorrectionMap(pgClient) {
  const rows = await pgClient`SELECT canonical_prop_key, selected_side, source_key, lo_bound, hi_bound, delta FROM config.residual_correction_bins WHERE is_active = true`.catch(() => []);
  const map = new Map();
  for (const r of rows) {
    const sourceSpecificKey = r.source_key ? `${r.canonical_prop_key}|${r.selected_side || ""}|${r.source_key}` : null;
    const genericKey = `${r.canonical_prop_key}|${r.selected_side || ""}`;
    const key = sourceSpecificKey || genericKey;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ lo: Number(r.lo_bound), hi: Number(r.hi_bound), delta: Number(r.delta) });
  }
  return map;
}
function applyResidualCorrection(propKey, side, sourceKey, displayedHpPct, residualMap) {
  if (displayedHpPct == null) return { correctedHp: displayedHpPct, applied: false };
  const sourceSpecificBins = residualMap.get(`${propKey}|${side || ""}|${sourceKey || ""}`);
  const bins = sourceSpecificBins || residualMap.get(`${propKey}|${side || ""}`);
  if (!bins) return { correctedHp: displayedHpPct, applied: false };
  const bin = bins.find(b => displayedHpPct >= b.lo && displayedHpPct < b.hi);
  if (!bin) return { correctedHp: displayedHpPct, applied: false };
  const corrected = clamp(displayedHpPct + bin.delta, 1, 99);
  return { correctedHp: corrected, applied: true, residual_delta_applied: bin.delta, source_specific: Boolean(sourceSpecificBins) };
}

// Player-specific market-odds confidence signal (2026-08-13). Genuinely new integration - not
// duplicating market_implied_total (that's team-level game totals only, and already correctly
// confidence-only per the same principle applied here). Researched and validated first against
// real graded outcomes before writing any code: joining score.prop_outcome_history to
// archive.market_prop_context_history showed model/market agreement within 10pp genuinely
// predicts BETTER real accuracy (73.3% real hit rate vs the model's own stated 66.0%, n=86),
// while divergence >20pp predicts real overconfidence (50% real vs 76.2% stated, n=4). Grounded
// in the explicit architectural principle: market reflects aggregate information (what real
// sportsbooks, sharp money, and information the model may not have all imply), not a causal
// mechanism like weather/lineup/bullpen that literally changes what happens on the field - so
// this must only ever adjust confidence, never the rate/probability itself. Confirmed via full
// pipeline search this data was previously unused anywhere except as coverage-count metadata in
// the matrix builder (context_probe_player_props row counts, never the actual price/odds values).
async function loadPlayerMarketOddsMap(pgClient, playerIds, dates) {
  if (!playerIds.length || !dates.length) return new Map();
  const playerLiteral = "{" + playerIds.join(",") + "}";
  const datesLiteral = "{" + dates.map(d => `"${d}"`).join(",") + "}";
  const rows = await pgClient`
    WITH over_avg AS (
      SELECT resolved_mlb_player_id, canonical_prop_key, line_value, official_date::date AS official_date,
        AVG(CASE WHEN price_american>0 THEN 100.0/(price_american+100)*100 ELSE ABS(price_american)::float/(ABS(price_american)+100)*100 END) AS over_implied,
        COUNT(*) AS n_books
      FROM market.context_probe_player_props
      WHERE resolved_mlb_player_id = ANY(${playerLiteral}::bigint[]) AND official_date::date = ANY(${datesLiteral}::date[]) AND outcome_side='over'
      GROUP BY resolved_mlb_player_id, canonical_prop_key, line_value, official_date::date
    ),
    under_avg AS (
      SELECT resolved_mlb_player_id, canonical_prop_key, line_value, official_date::date AS official_date,
        AVG(CASE WHEN price_american>0 THEN 100.0/(price_american+100)*100 ELSE ABS(price_american)::float/(ABS(price_american)+100)*100 END) AS under_implied,
        COUNT(*) AS n_books
      FROM market.context_probe_player_props
      WHERE resolved_mlb_player_id = ANY(${playerLiteral}::bigint[]) AND official_date::date = ANY(${datesLiteral}::date[]) AND outcome_side='under'
      GROUP BY resolved_mlb_player_id, canonical_prop_key, line_value, official_date::date
    )
    SELECT o.resolved_mlb_player_id, o.canonical_prop_key, o.line_value, o.official_date,
      o.over_implied/(o.over_implied+u.under_implied)*100 AS mkt_over,
      u.under_implied/(o.over_implied+u.under_implied)*100 AS mkt_under,
      LEAST(o.n_books, u.n_books) AS n_books
    FROM over_avg o JOIN under_avg u ON u.resolved_mlb_player_id=o.resolved_mlb_player_id AND u.canonical_prop_key=o.canonical_prop_key
      AND u.line_value=o.line_value AND u.official_date=o.official_date`.catch(() => []);
  const map = new Map();
  for (const r of rows) {
    const key = `${r.resolved_mlb_player_id}|${r.canonical_prop_key}|${Number(r.line_value)}`;
    map.set(key, { mktOver: Number(r.mkt_over), mktUnder: Number(r.mkt_under), nBooks: Number(r.n_books) });
  }
  return map;
}
function computeMarketAgreementAdjustment(modelP, side, marketOddsRow, cfg) {
  if (modelP == null || !marketOddsRow) return { delta: 0, applied: false };
  if (Number(marketOddsRow.nBooks) < Number(cfg.min_books_required || 1)) return { delta: 0, applied: false };
  const marketP = side === "more" ? marketOddsRow.mktOver : marketOddsRow.mktUnder;
  if (!Number.isFinite(marketP)) return { delta: 0, applied: false };
  const diff = Math.abs(modelP - marketP);
  let delta;
  if (diff <= Number(cfg.agree_threshold_pp ?? 10)) delta = Number(cfg.agree_confidence_delta ?? 5);
  else if (diff <= Number(cfg.moderate_threshold_pp ?? 20)) delta = Number(cfg.moderate_confidence_delta ?? -5);
  else delta = Number(cfg.diverge_confidence_delta ?? -12);
  return { delta, applied: true, market_p: marketP, diff_pp: diff };
}

function computeFinalConfidence(baselineConfidence, enrichmentRow, lineDistance, penaltyConfig, marketAgreementDelta) {
  const factorsApplied = (enrichmentRow && enrichmentRow.factors_applied) || 0;
  const factorsMissing = (enrichmentRow && enrichmentRow.factors_missing) || 0;
  const totalFactors = factorsApplied + factorsMissing;
  const baseConf = baselineConfidence != null ? baselineConfidence : 55;
  const adjustment = (enrichmentRow && enrichmentRow.confidence_adjustment || 0) * 100;
  // Distance penalty thresholds are DB-configurable (config.calibration_config,
  // key='line_distance_confidence_penalty') - not hardcoded, per explicit requirement that all
  // tunable values live in the database for easy adjustment without a code deploy. Falls back to
  // these defaults only if the DB read fails, never silently changing behavior otherwise.
  const cfg = penaltyConfig || { free_tolerance_units: 2, penalty_per_unit: 3, max_penalty: 30 };
  const dist = Number(lineDistance) || 0;
  const distancePenalty = dist > cfg.free_tolerance_units ? Math.min(cfg.max_penalty, (dist - cfg.free_tolerance_units) * cfg.penalty_per_unit) : 0;
  let result;
  if (totalFactors === 0) {
    // No enrichment factors are configured for this prop type at all (e.g. rfi_nrfi) - this is
    // a design fact, not a coverage gap, and should not be penalized as if factors were missing.
    // Use baseline confidence directly rather than blending with a zero-coverage term.
    result = baseConf + adjustment;
  } else {
    const coverageRatio = factorsApplied / totalFactors;
    result = (baseConf * 0.5) + ((40 + coverageRatio * 45) * 0.5) + adjustment;
  }
  result += Number(marketAgreementDelta || 0);
  return Math.round(clamp(result - distancePenalty, 30, 95));
}

async function runHitProbabilityBoardFastLoop(pgClient, input, sourceMatrixBatchId) {
  const startMs = Date.now();
  const timeBudgetMs = 24000;
  let lastOutput = null;
  let tickCount = 0;
  while (Date.now() - startMs < timeBudgetMs) {
    lastOutput = await runHitProbabilityBoard(pgClient, input, sourceMatrixBatchId);
    tickCount++;
    if (!lastOutput.ok || !lastOutput.continuation_required) {
      return { ...lastOutput, fast_loop_tick_count: tickCount, fast_loop_wall_ms: Date.now() - startMs };
    }
  }
  return { ...lastOutput, fast_loop_tick_count: tickCount, fast_loop_wall_ms: Date.now() - startMs };
}

async function runHitProbabilityBoard(pgClient, input, sourceMatrixBatchId) {
  const hpBatchId = input && input.chain_id ? `hp_board_batch_${input.chain_id}` : rid("hp_board_batch");
  const penaltyConfigRows = await pgClient`SELECT config_json FROM config.calibration_config WHERE config_key='line_distance_confidence_penalty' AND is_active=1`.catch(() => []);
  const penaltyConfig = penaltyConfigRows[0] ? penaltyConfigRows[0].config_json : { free_tolerance_units: 2, penalty_per_unit: 3, max_penalty: 30 };
  const marketAgreementCfgRows = await pgClient`SELECT config_json FROM config.calibration_config WHERE config_key='market_agreement_confidence' AND is_active=1`.catch(() => []);
  const marketAgreementCfg = marketAgreementCfgRows[0] ? marketAgreementCfgRows[0].config_json : null;

  const alreadyWrittenRows = await pgClient`SELECT matrix_id FROM score.hp_board_current WHERE hp_board_batch_id=${hpBatchId}`.catch(() => []);
  const alreadyWrittenIds = new Set(alreadyWrittenRows.map(r => r.matrix_id));

  const enrichmentRows = await pgClient`SELECT e.enrichment_id, e.matrix_id, e.batch_id, e.canonical_prop_key, e.mlb_player_id, e.board_line_value, e.prop_side,
            e.log_rate_adjustment, e.rate_multiplier, e.confidence_adjustment, e.factors_applied, e.factors_missing, e.factor_breakdown_json,
            e.role_transition_override_hp, e.role_transition_confidence_penalty, e.role_transition_detected
     FROM scoring.enrichment_leg_current e
     INNER JOIN score.prop_matrix_current m ON m.matrix_id = e.matrix_id
     ORDER BY e.matrix_id`;
  const candidateRows = enrichmentRows.filter(r => !alreadyWrittenIds.has(r.matrix_id));
  const chunkRows = candidateRows.slice(0, MAX_LEGS_PER_INVOCATION);

  const matrixIds = chunkRows.map(r => r.matrix_id).filter(Boolean);
  const matrixById = new Map();
  if (matrixIds.length) {
    const matrixLiteral = "{" + matrixIds.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(",") + "}";
    const matrixRows = await pgClient`SELECT * FROM score.prop_matrix_current WHERE matrix_id = ANY(${matrixLiteral}::text[])`;
    for (const m of matrixRows) matrixById.set(m.matrix_id, m);
  }

  const playerIds = [...new Set(chunkRows.map(r => r.mlb_player_id).filter(Boolean))];
  const baselineByPlayerPropSide = new Map();
  if (playerIds.length) {
    const playerLiteral = "{" + playerIds.join(",") + "}";
    const baselineRows = await pgClient`SELECT player_id, canonical_prop_key, line_value, selected_side, tier_key, hit_probability_0_100, confidence_0_100 FROM classification.baseline_v6_current WHERE player_id::text = ANY(${playerLiteral}::text[])`;
    for (const b of baselineRows) {
      const k = `${b.player_id}|${b.canonical_prop_key}|${b.selected_side}`;
      if (!baselineByPlayerPropSide.has(k)) baselineByPlayerPropSide.set(k, []);
      baselineByPlayerPropSide.get(k).push(b);
    }
  }
  function findBaseline(playerId, propKey, side, lineValue) {
    const list = baselineByPlayerPropSide.get(`${playerId}|${propKey}|${side}`);
    if (!list || !list.length) return null;
    let best = null, bestDist = Infinity;
    for (const b of list) {
      const dist = Math.abs(Number(b.line_value) - Number(lineValue));
      if (dist < bestDist) { bestDist = dist; best = b; }
    }
    return best ? { row: best, is_exact_line_match: bestDist === 0, line_distance: bestDist } : null;
  }
  function determineSide(matrixRow, er, playerId, propKey, lineValue) {
    // REAL ARCHITECTURAL FIX (2026-08-11): the matrix builder now emits one matrix row per real
    // side for genuinely two-sided lines (side_context.explicit_side_assigned=true), each already
    // representing its own specific side by construction. Use that assignment directly rather than
    // re-deriving side via the baseline comparison below - re-deriving could independently pick
    // the same side for both of the two rows (e.g. both landing on 'more'), silently duplicating
    // one side and never producing the other, exactly the bug this fix addresses.
    const explicitSideCheck = safeJsonParse(matrixRow.matrix_payload_json, {});
    if (explicitSideCheck?.side_context?.explicit_side_assigned && (explicitSideCheck?.side_context?.selected_side === "more" || explicitSideCheck?.side_context?.selected_side === "less")) {
      return explicitSideCheck.side_context.selected_side;
    }
    // CONFIRMED PLATFORM-LEVEL MORE-ONLY PROPS (2026-08-07): verified via direct, real user
    // platform experience placing actual slips - these markets genuinely have no 'less' side to
    // pick on PrizePicks/Underdog/Sleeper at all, regardless of what the upstream side_mode flag
    // says (confirmed null/unset for these rows - a separate, real data gap in matrix-builder).
    // This is a real eligibility fact about what the platform offers, not a confidence/calibration
    // judgment - the same class of fix already applied once before for this exact prop
    // (Leody Taveras case, 2026-08-05) via the goblin/demon floor; this closes the remaining gap
    // for standard (non-goblin/demon) rows that floor never covered.
    const PLATFORM_CONFIRMED_MORE_ONLY_PROPS = new Set(["stolen_bases"]);
    if (PLATFORM_CONFIRMED_MORE_ONLY_PROPS.has(String(propKey))) return "more";
    const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
    const isGoblinOrDemon = Number(matrixRow.is_goblin ?? payload?.prepared?.is_goblin ?? 0) === 1 || Number(matrixRow.is_demon ?? payload?.prepared?.is_demon ?? 0) === 1;
    // FIXED 2026-08-05: this was the original, definitive bug - it unconditionally forced every
    // Goblin/Demon to 'more', completely ignoring side_mode, even after matrix-builder was fixed
    // to correctly set side_mode='two_sided' when PrizePicks' real allowed_wager_types data
    // genuinely allows both sides. Confirmed live this was still happening (Andre Pallante
    // pitcher_strikeouts 5.5: side_mode='two_sided' in the matrix, but still forced to 'more' at
    // only 23.2% HP when 'less' at ~76.8% should have clearly won). Now only forces 'more' when
    // side_mode is genuinely 'more_only' - otherwise falls through to the existing, already-
    // correct baseline-comparison logic below to genuinely evaluate both real probabilities.
    const realSideMode = payload?.side_context?.side_mode || null;
    if (isGoblinOrDemon && realSideMode === "more_only") return "more";
    if (isGoblinOrDemon && realSideMode !== "two_sided") return "more"; // conservative fallback: unknown/missing side_mode for a Goblin/Demon row defaults to the historically-safe more_only behavior rather than guessing.
    const sideMode = payload?.side_context?.side_mode || null;
    if (sideMode === "more_only" || Number(matrixRow.more_only ?? 0) === 1) return "more";
    if (sideMode === "less_only") return "less";
    const moreBaseline = findBaseline(playerId, propKey, "more", lineValue);
    const lessBaseline = findBaseline(playerId, propKey, "less", lineValue);
    const moreHp = moreBaseline && Number.isFinite(Number(moreBaseline.row.hit_probability_0_100)) ? Number(moreBaseline.row.hit_probability_0_100) : null;
    const lessHp = lessBaseline && Number.isFinite(Number(lessBaseline.row.hit_probability_0_100)) ? Number(lessBaseline.row.hit_probability_0_100) : null;
    // FIXED 2026-08-05: confirmed via real user-reported case (Leody Taveras stolen_bases 0.5:
    // more=0.91%, less=99.09%) that blindly picking whichever side has higher raw probability
    // breaks down for structurally rare-event props - 'more' is near-0% for almost every player
    // on these props regardless of matchup, so 'less' always trivially wins, flooding the board
    // with information-free 99% picks mislabeled as high-value Demon/Goblin recommendations.
    // A Goblin/Demon tag is fundamentally about the 'more' side (that's the side the elevated/
    // lowered threshold applies to) - only flip to 'less' when 'more' still shows genuine
    // two-sided uncertainty (>=15%), not when the comparison is really just exploiting a rare
    // event's trivial complement. Below the floor, keep 'more' - correctly reflecting that this
    // specific Demon/Goblin's real probability is genuinely low, which should mean REVIEW tier,
    // not a laundered PRIMARY pick via the rare event's safe-by-construction 'less' side.
    const MIN_MORE_HP_FOR_GOBLIN_DEMON_FLIP = 15;
    if (isGoblinOrDemon) {
      if (moreHp != null && lessHp != null) {
        if (moreHp < MIN_MORE_HP_FOR_GOBLIN_DEMON_FLIP) return "more";
        return lessHp > moreHp ? "less" : "more";
      }
      if (lessHp != null && moreHp == null) return "less";
      return matrixRow.side || er.prop_side || "more";
    }
    if (moreHp != null && lessHp != null) return lessHp > moreHp ? "less" : "more";
    if (lessHp != null && moreHp == null) return "less";
    return matrixRow.side || er.prop_side || "more";
  }

  const calibrationMap = await loadCalibrationMap(pgClient);
  const residualMap = await loadResidualCorrectionMap(pgClient);
  const relevantDates = [...new Set(matrixIds.map(id => matrixById.get(id)?.official_date).filter(Boolean).map(d => String(d).slice(0, 10)))];
  const marketOddsMap = marketAgreementCfg ? await loadPlayerMarketOddsMap(pgClient, playerIds, relevantDates) : new Map();

  const existingBatch = await pgClient`SELECT created_at FROM score.hp_board_batches WHERE hp_board_batch_id=${hpBatchId}`;
  const createdAt = existingBatch[0] && existingBatch[0].created_at ? existingBatch[0].created_at : new Date().toISOString();
  await pgClient`INSERT INTO score.hp_board_batches (hp_board_batch_id, worker_version, profile_key, mode, status, source_table, source_engine_batch_id, source_rows_read, board_rows_written, thresholds_locked, no_true_probability_claims, created_at)
     VALUES (${hpBatchId}, ${SYSTEM_VERSION}, ${PROFILE_KEY}, 'real_reordered', 'running', 'scoring.prop_matrix_current + scoring.enrichment_leg_current + classification.baseline_v6_current', ${sourceMatrixBatchId || null}, ${chunkRows.length}, 0, 1, 1, ${createdAt})
     ON CONFLICT (hp_board_batch_id) DO UPDATE SET status=EXCLUDED.status, source_rows_read=EXCLUDED.source_rows_read`;

  let written = 0, primaryRows = 0, reviewRows = 0;
  const insertRows = [];
  for (const er of chunkRows) {
    const matrixRow = matrixById.get(er.matrix_id) || {};
    const playerName = matrixRow.player_name || null;
    const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
    const side = determineSide(matrixRow, er, er.mlb_player_id, er.canonical_prop_key, er.board_line_value);
    // CONFIRMED PLATFORM RULE (2026-08-07), real user platform knowledge, not inferred: for
    // home_runs, 'less' is always goblin, never demon - a home run 'less' pick cannot structurally
    // be a demon. The raw is_goblin/is_demon flag from PrizePicks describes the 'more' side
    // specifically (the side the elevated/lowered threshold or payout actually applies to), and
    // was incorrectly carrying straight through to 'less' whenever 'less' got selected as the
    // side. This corrects it to be side-aware for this specific, confirmed prop.
    // GENERAL SIDE-AWARE GOBLIN/DEMON RULE (2026-08-07), confirmed via real, direct platform
    // experience across many props (home_runs, hits, walks, hits_allowed, walks_allowed, stolen_bases,
    // etc.), not a per-prop patch: PrizePicks' raw odds_type/is_goblin/is_demon flag describes the
    // difficulty of the 'more' side specifically - that's structurally the side the elevated
    // (demon) or lowered (goblin) threshold/payout actually applies to. When our system selects
    // 'less' instead of 'more' for that same projection, the badge must flip, not carry straight
    // through: if 'more' was made harder (demon), 'less' is structurally the easy, favorable side
    // (goblin) as its complement - and vice versa for goblin. Confirmed live: dozens of home_runs/
    // hits/walks/walks_allowed 'less' legs were showing demon when they were structurally goblin
    // by this exact mechanism, across many different players and props, not one prop in isolation.
    // ROOT CAUSE FIX (2026-08-11) WAS WRONG, REVERTED SAME NIGHT: verified directly against the
    // user's real, live PrizePicks app observations across multiple props (Doubles, Hits, Total
    // Bases, Hits+Runs+RBIs), cross-checked against the raw JSON feed itself. The raw odds_type
    // tag applies to whichever side PrizePicks originally set it for (confirmed directly in the
    // raw file: Total Bases 0.5 raw tag='goblin', Hits 0.5 raw tag='goblin') - and the OPPOSITE
    // side genuinely does get the complement on the real app (confirmed: Total Bases 0.5 shows
    // more=goblin/less=demon live, exactly matching raw tag='goblin' for 'more' with the flip
    // giving 'demon' for 'less'). The earlier removal was based on a single example (Sanoja
    // doubles) that only confirmed the raw tag matched what was already displayed - it never
    // checked whether the OPPOSITE, undisplayed side also correctly showed the flip, which is
    // what actually matters and is what the user's comprehensive real data now confirms.
    let isGoblin = Number(matrixRow.is_goblin ?? payload?.prepared?.is_goblin ?? 0) === 1;
    let isDemon = Number(matrixRow.is_demon ?? payload?.prepared?.is_demon ?? 0) === 1;
    // FIXED 2026-08-11: rows with an explicit pre-assigned side (the new dual-matrix-row
    // architecture) already carry the correctly-flipped is_goblin/is_demon baked in by the matrix
    // builder itself - applying this flip again here would double-flip and undo the correct value.
    // Only apply this flip to legacy single-row legs that don't already carry an explicit side.
    const hasExplicitSideAssignment = Boolean(payload?.side_context?.explicit_side_assigned);
    if (!hasExplicitSideAssignment && side === "less" && (isGoblin || isDemon)) {
      const wasDemon = isDemon;
      isDemon = isGoblin;
      isGoblin = wasDemon;
    }
    const moreOnly = Number(matrixRow.more_only ?? 0) === 1 || (payload?.side_context?.side_mode === "more_only");
    const sideMode = moreOnly ? "more_only" : (payload?.side_context?.side_mode || null);
    const baselineMatch = findBaseline(er.mlb_player_id, er.canonical_prop_key, side, er.board_line_value);
    const baseline = baselineMatch ? baselineMatch.row : null;
    const baselineHp = baseline?.hit_probability_0_100 ?? null;
    const hasRoleOverride = er.role_transition_override_hp != null;
    const rawHp = hasRoleOverride ? Number(er.role_transition_override_hp) : computeRealHitProbability(baselineHp, er.rate_multiplier);
    const playerVariantKey = isGoblin ? "goblin" : isDemon ? "demon" : "standard";
    const calibration = applyCalibrationCorrection(er.canonical_prop_key, side, rawHp, calibrationMap, baseline?.tier_key || null, playerVariantKey);
    const residual = applyResidualCorrection(er.canonical_prop_key, side, matrixRow.source_key, calibration.correctedHp, residualMap);
    const hp = residual.correctedHp;

    if (hp == null) {
      insertRows.push({
        hp_board_row_id: `hp_${er.enrichment_id}`, hp_board_batch_id: hpBatchId, source_engine_batch_id: sourceMatrixBatchId || null, prepared_row_id: matrixRow.prepared_row_id || null, matrix_id: er.matrix_id, source_line_id: matrixRow.source_line_id || null,
        source_key: matrixRow.source_key || null, game_pk: matrixRow.game_pk || null, official_date: matrixRow.official_date || null, official_game_time_utc: matrixRow.official_game_time_utc || null,
        mlb_player_id: er.mlb_player_id, player_name: playerName, canonical_prop_key: er.canonical_prop_key, line_value: er.board_line_value, selected_side: side,
        estimated_hit_probability_0_100: null, probability_confidence_0_100: null, board_tier: "REVIEW", live_playable: 0, review_playable: 1,
        is_goblin: isGoblin ? 1 : 0, is_demon: isDemon ? 1 : 0, more_only: moreOnly ? 1 : 0, source_variant_label: matrixRow.source_variant_label || null,
        score_grade: "BIN_0_NULL",
        calibration_json: JSON.stringify({ real_reordered: true, no_baseline_coverage: true, is_goblin: isGoblin, is_demon: isDemon, side_mode: sideMode, more_only: moreOnly, note: "No baseline_v6 row found for this player/prop/line/side combo even after nearest-line fallback - cannot compute HP without a baseline. Tracked here (not skipped silently) to avoid re-processing this leg on every future invocation." })
      });
      reviewRows++;
      written++;
      continue;
    }
    const marketOddsRow = marketAgreementCfg ? marketOddsMap.get(`${er.mlb_player_id}|${er.canonical_prop_key}|${Number(er.board_line_value)}`) : null;
    const marketAgreement = marketAgreementCfg ? computeMarketAgreementAdjustment(rawHp, side, marketOddsRow, marketAgreementCfg) : { delta: 0, applied: false };
    const confidence = computeFinalConfidence(baseline?.confidence_0_100, er, baselineMatch ? baselineMatch.line_distance : 0, penaltyConfig, marketAgreement.delta + (hasRoleOverride ? Number(er.role_transition_confidence_penalty || 0) : 0));
    const primaryPlayable = hp >= PRIMARY_HP_THRESHOLD && confidence >= 55;
    if (primaryPlayable) primaryRows++; else reviewRows++;

    insertRows.push({
      hp_board_row_id: `hp_${er.enrichment_id}`, hp_board_batch_id: hpBatchId, source_engine_batch_id: sourceMatrixBatchId || null, prepared_row_id: matrixRow.prepared_row_id || null, matrix_id: er.matrix_id, source_line_id: matrixRow.source_line_id || null,
      source_key: matrixRow.source_key || null, game_pk: matrixRow.game_pk || null, official_date: matrixRow.official_date || null, official_game_time_utc: matrixRow.official_game_time_utc || null,
      mlb_player_id: er.mlb_player_id, player_name: playerName, canonical_prop_key: er.canonical_prop_key, line_value: er.board_line_value, selected_side: side,
      estimated_hit_probability_0_100: hp, probability_confidence_0_100: confidence, board_tier: primaryPlayable ? "PRIMARY" : "REVIEW", live_playable: primaryPlayable ? 1 : 0, review_playable: primaryPlayable ? 0 : 1,
      is_goblin: isGoblin ? 1 : 0, is_demon: isDemon ? 1 : 0, more_only: moreOnly ? 1 : 0, source_variant_label: matrixRow.source_variant_label || null,
      score_grade: gradeForProbability(hp),
      calibration_json: JSON.stringify({ real_reordered: true, baseline_hp: baselineHp, baseline_confidence: baseline?.confidence_0_100 ?? null, rate_multiplier: er.rate_multiplier ?? 1.0, factors_applied: er.factors_applied || 0, factors_missing: er.factors_missing || 0, primary_hp_threshold: PRIMARY_HP_THRESHOLD, is_exact_line_match: baselineMatch ? baselineMatch.is_exact_line_match : null, line_distance: baselineMatch ? baselineMatch.line_distance : null, is_goblin: isGoblin, is_demon: isDemon, side_mode: sideMode, more_only: moreOnly, raw_hp_before_calibration: rawHp, calibration_correction_applied: calibration.applied, calibration_delta: calibration.applied ? calibration.delta_applied : null, calibration_bin_sample_games: calibration.applied ? calibration.bin_n_test_games : null, residual_correction_applied: residual.applied, residual_correction_delta: residual.applied ? residual.residual_delta_applied : null, residual_correction_source_specific: residual.applied ? residual.source_specific : null, market_agreement_applied: marketAgreement.applied, market_agreement_delta: marketAgreement.applied ? marketAgreement.delta : null, market_agreement_p: marketAgreement.applied ? marketAgreement.market_p : null, market_agreement_diff_pp: marketAgreement.applied ? marketAgreement.diff_pp : null, role_transition_override_applied: hasRoleOverride, role_transition_detail: hasRoleOverride ? er.role_transition_detected : null, role_transition_confidence_penalty: hasRoleOverride ? er.role_transition_confidence_penalty : null, note: "Final HP + Final Confidence computed here, BEFORE Scoring Engine (reordered per spec). score_0_100 intentionally null until Scoring Engine (now running after this stage) fills it in from this row's final HP + final confidence." })
    });
    written++;
  }
  const insertCols = ["hp_board_row_id", "hp_board_batch_id", "source_engine_batch_id", "prepared_row_id", "matrix_id", "source_line_id", "source_key", "game_pk", "official_date", "official_game_time_utc", "mlb_player_id", "player_name", "canonical_prop_key", "line_value", "selected_side", "estimated_hit_probability_0_100", "probability_confidence_0_100", "board_tier", "live_playable", "review_playable", "is_goblin", "is_demon", "more_only", "score_grade", "calibration_json", "source_variant_label"];
  if (insertRows.length) {
    const CHUNK = 900;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      await pgClient`INSERT INTO score.hp_board_current ${pgClient(insertRows.slice(i, i + CHUNK), ...insertCols)}
        ON CONFLICT (hp_board_row_id) DO UPDATE SET hp_board_batch_id=EXCLUDED.hp_board_batch_id, source_engine_batch_id=EXCLUDED.source_engine_batch_id, prepared_row_id=EXCLUDED.prepared_row_id, matrix_id=EXCLUDED.matrix_id, source_line_id=EXCLUDED.source_line_id, source_key=EXCLUDED.source_key, game_pk=EXCLUDED.game_pk, official_date=EXCLUDED.official_date, official_game_time_utc=EXCLUDED.official_game_time_utc, selected_side=EXCLUDED.selected_side, estimated_hit_probability_0_100=EXCLUDED.estimated_hit_probability_0_100, probability_confidence_0_100=EXCLUDED.probability_confidence_0_100, board_tier=EXCLUDED.board_tier, live_playable=EXCLUDED.live_playable, review_playable=EXCLUDED.review_playable, is_goblin=EXCLUDED.is_goblin, is_demon=EXCLUDED.is_demon, more_only=EXCLUDED.more_only, score_grade=EXCLUDED.score_grade, calibration_json=EXCLUDED.calibration_json, source_variant_label=EXCLUDED.source_variant_label, score_0_100=NULL, updated_at=now()`;
    }
  }

  const isPartial = candidateRows.length > chunkRows.length || chunkRows.length >= MAX_LEGS_PER_INVOCATION;
  const status = isPartial ? "partial_continue" : "completed_hit_probability_current_estimates_written";

  let subsetReconcile = null;
  let ladderReconcile = null;
  let cleanupOldBatches = null;
  if (!isPartial) {
    subsetReconcile = await reconcileHpBoardSubsetConstraints(pgClient, hpBatchId).catch((e) => ({ ok: false, error: String(e && e.message ? e.message : e) }));
    ladderReconcile = await reconcileHpBoardLadderMonotonicity(pgClient, hpBatchId).catch((e) => ({ ok: false, error: String(e && e.message ? e.message : e) }));
    // Real structural fix: hp_board_current previously had no cleanup at all, so every run's
    // batch accumulated alongside every previous run's batch forever. Scoring-engine correctly
    // scopes its read to this run's specific batch_id, so an uncleaned table meant it only ever
    // saw this run's own (often tiny, partial-looking) slice, starving the final board. Delete
    // everything except the batch that was just successfully, completely written.
    try {
      const deleted = await pgClient`DELETE FROM score.hp_board_current WHERE hp_board_batch_id <> ${hpBatchId}`;
      cleanupOldBatches = { ok: true, deleted_rows: deleted.count ?? null };
    } catch (e) {
      cleanupOldBatches = { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  await pgClient`UPDATE score.hp_board_batches SET status=${status}, certification_status='HP_BOARD_CERTIFIED_REAL_SKELETON', certification_grade='PASS_REAL_SKELETON', board_rows_written=${written}, primary_rows=${primaryRows}, review_rows=${reviewRows}, updated_at=now() WHERE hp_board_batch_id=${hpBatchId}`;

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, hp_board_batch_id: hpBatchId, source_matrix_batch_id: sourceMatrixBatchId || null,
    status,
    continuation_required: isPartial, orchestrator_should_self_continue: isPartial,
    matrix_rows_read: chunkRows.length, board_rows_written: written, primary_rows: primaryRows, review_rows: reviewRows,
    primary_hp_threshold: PRIMARY_HP_THRESHOLD,
    subset_constraint_reconcile: subsetReconcile,
    ladder_monotonicity_reconcile: ladderReconcile,
    cleanup_old_batches: cleanupOldBatches,
    timestamp_utc: nowUtc(),
  };
}

// Ladder hierarchy enforcement: a harder variation must never show a higher probability than an
// easier one for the same player/prop/side. Confirmed via real data (Sean Burke earned_runs) that
// the bucket-based residual correction, applied purely on displayed HP with no awareness of the
// line-value ladder, mechanically breaks monotonicity whenever two adjacent lines straddle
// different correction buckets - the raw baseline was genuinely correct and monotonic, the
// post-correction values weren't. Clamps each row to a running best-so-far in the correct
// direction for its side: 'more' must be non-increasing as line_value increases (a higher
// threshold can never show a higher probability); 'less' must be non-decreasing as line_value
// increases (a higher ceiling can never show a lower probability). A real, mechanical guarantee,
// not a heuristic - cannot be violated regardless of what any upstream correction did.
async function reconcileHpBoardLadderMonotonicity(pgClient, hpBatchId) {
  const moreRes = await pgClient`
    WITH ladder AS (
      SELECT hp_board_row_id,
        MIN(estimated_hit_probability_0_100) OVER (
          PARTITION BY source_key, mlb_player_id, canonical_prop_key, selected_side
          ORDER BY line_value ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS clamped_hp
      FROM score.hp_board_current
      WHERE hp_board_batch_id = ${hpBatchId} AND selected_side = 'more' AND estimated_hit_probability_0_100 IS NOT NULL
    )
    UPDATE score.hp_board_current h SET
      estimated_hit_probability_0_100 = l.clamped_hp,
      board_tier = CASE WHEN l.clamped_hp >= 70 AND h.probability_confidence_0_100 >= 55 THEN 'PRIMARY' ELSE 'REVIEW' END,
      live_playable = CASE WHEN l.clamped_hp >= 70 AND h.probability_confidence_0_100 >= 55 THEN 1 ELSE 0 END,
      review_playable = CASE WHEN l.clamped_hp >= 70 AND h.probability_confidence_0_100 >= 55 THEN 0 ELSE 1 END,
      score_grade = CASE WHEN l.clamped_hp >= 80 THEN 'BIN_ELITE' WHEN l.clamped_hp >= 70 THEN 'BIN_STRONG' WHEN l.clamped_hp >= 60 THEN 'BIN_QUALIFIED' ELSE 'BIN_LOW' END,
      calibration_json = COALESCE(h.calibration_json, '{}'::jsonb) || jsonb_build_object('ladder_monotonicity_clamp_applied', true, 'ladder_pre_clamp_hp', h.estimated_hit_probability_0_100)
    FROM ladder l
    WHERE h.hp_board_row_id = l.hp_board_row_id AND l.clamped_hp < h.estimated_hit_probability_0_100`;
  const lessRes = await pgClient`
    WITH ladder AS (
      SELECT hp_board_row_id,
        MAX(estimated_hit_probability_0_100) OVER (
          PARTITION BY source_key, mlb_player_id, canonical_prop_key, selected_side
          ORDER BY line_value ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS clamped_hp
      FROM score.hp_board_current
      WHERE hp_board_batch_id = ${hpBatchId} AND selected_side = 'less' AND estimated_hit_probability_0_100 IS NOT NULL
    )
    UPDATE score.hp_board_current h SET
      estimated_hit_probability_0_100 = l.clamped_hp,
      board_tier = CASE WHEN l.clamped_hp >= 70 AND h.probability_confidence_0_100 >= 55 THEN 'PRIMARY' ELSE 'REVIEW' END,
      live_playable = CASE WHEN l.clamped_hp >= 70 AND h.probability_confidence_0_100 >= 55 THEN 1 ELSE 0 END,
      review_playable = CASE WHEN l.clamped_hp >= 70 AND h.probability_confidence_0_100 >= 55 THEN 0 ELSE 1 END,
      score_grade = CASE WHEN l.clamped_hp >= 80 THEN 'BIN_ELITE' WHEN l.clamped_hp >= 70 THEN 'BIN_STRONG' WHEN l.clamped_hp >= 60 THEN 'BIN_QUALIFIED' ELSE 'BIN_LOW' END,
      calibration_json = COALESCE(h.calibration_json, '{}'::jsonb) || jsonb_build_object('ladder_monotonicity_clamp_applied', true, 'ladder_pre_clamp_hp', h.estimated_hit_probability_0_100)
    FROM ladder l
    WHERE h.hp_board_row_id = l.hp_board_row_id AND l.clamped_hp > h.estimated_hit_probability_0_100`;
  return { ok: true, more_rows_clamped: moreRes.count || 0, less_rows_clamped: lessRes.count || 0 };
}

async function reconcileHpBoardSubsetConstraints(pgClient, hpBatchId) {
  const aliasRows = await pgClient`SELECT config_json FROM config.calibration_config WHERE config_key='shared_threshold_aliases' AND is_active=1`;
  const aliasCfg = aliasRows[0] ? safeJsonParse(aliasRows[0].config_json, {}) : {};
  const cfgRows = await pgClient`SELECT config_json FROM config.calibration_config WHERE config_key='subset_of_constraints' AND is_active=1`;
  const constraints = cfgRows[0] ? safeJsonParse(cfgRows[0].config_json, {}) : {};
  let totalClamped = 0;
  const results = [];

  for (const [aliasKeySide, targetKeySide] of Object.entries(aliasCfg)) {
    const [aliasProp, aliasLineRaw, aliasSide] = aliasKeySide.split("|");
    const [targetProp, targetLineRaw, targetSide] = String(targetKeySide).split("|");
    const aliasLine = Number(aliasLineRaw), targetLine = Number(targetLineRaw);
    // Doubleheader fix (2026-08-17): these correlated subqueries matched player+prop+line+side+
    // source only, omitting game_pk. A player appearing in both games of a doubleheader (e.g.
    // Eugenio Suarez, CIN vs STL 2026-08-17) legitimately has two hp_board_current rows for the
    // same prop/line/side/source (one per game_pk), which made the bare (non-aggregate) scalar
    // subqueries below throw "more than one row returned by a subquery used as an expression".
    // Adding s.game_pk = h.game_pk restores the intended one-row-per-game correlation.
    const res = await pgClient`
      UPDATE score.hp_board_current AS h
      SET estimated_hit_probability_0_100 = (
        SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s
        WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
          AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
      ),
      probability_confidence_0_100 = (
        SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
        WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
          AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
      ),
      board_tier = CASE WHEN (
          SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
        ) >= 70 AND (
          SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
        ) >= 55 THEN 'PRIMARY' ELSE 'REVIEW' END,
      live_playable = CASE WHEN (
          SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
        ) >= 70 AND (
          SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
        ) >= 55 THEN 1 ELSE 0 END,
      review_playable = CASE WHEN (
          SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
        ) >= 70 AND (
          SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
        ) >= 55 THEN 0 ELSE 1 END,
      score_grade = CASE
          WHEN (SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk) >= 80 THEN 'BIN_ELITE'
          WHEN (SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk) >= 70 THEN 'BIN_STRONG'
          WHEN (SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk) >= 60 THEN 'BIN_QUALIFIED'
          ELSE 'BIN_LOW' END
      WHERE h.hp_board_batch_id = ${hpBatchId} AND h.canonical_prop_key = ${aliasProp} AND h.line_value = ${aliasLine} AND h.selected_side = ${aliasSide}
        AND EXISTS (
          SELECT 1 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key AND s.game_pk = h.game_pk
        )`;
    const changed = res.count || 0;
    totalClamped += changed;
    results.push({ alias: aliasKeySide, target: targetKeySide, rows_synced: changed });
    if (changed > 0) {
      await pgClient.unsafe(
        `UPDATE score.hp_board_current SET calibration_json = COALESCE(calibration_json, '{}'::jsonb) || jsonb_build_object('shared_threshold_alias_applied', true, 'shared_threshold_alias_target', $1::text) WHERE hp_board_batch_id = $2 AND canonical_prop_key = $3 AND line_value = $4 AND selected_side = $5`,
        [targetKeySide, hpBatchId, aliasProp, aliasLine, aliasSide]
      ).catch(() => {});
    }
  }
  for (const [subsetKey, supersetKeyOrArray] of Object.entries(constraints)) {
    const [subProp, subLineRaw, subSide] = subsetKey.split("|");
    const subLine = Number(subLineRaw);
    const targets = Array.isArray(supersetKeyOrArray) ? supersetKeyOrArray : [supersetKeyOrArray];
    const targetTriples = targets.map(t => { const [p, l, s] = String(t).split("|"); return { prop: p, line: Number(l), side: s, key: `${p}|${l}|${s}` }; });

    for (const t of targetTriples) {
      const res = await pgClient`
        UPDATE score.hp_board_current AS h
        SET estimated_hit_probability_0_100 = (
          SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
        ),
        probability_confidence_0_100 = (
          SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
          ORDER BY s.estimated_hit_probability_0_100 ASC LIMIT 1
        ),
        board_tier = CASE WHEN (
            SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s
            WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
              AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
          ) >= 70 AND (
            SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
            WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
              AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
            ORDER BY s.estimated_hit_probability_0_100 ASC LIMIT 1
          ) >= 55 THEN 'PRIMARY' ELSE 'REVIEW' END,
        live_playable = CASE WHEN (
            SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s
            WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
              AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
          ) >= 70 AND (
            SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
            WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
              AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
            ORDER BY s.estimated_hit_probability_0_100 ASC LIMIT 1
          ) >= 55 THEN 1 ELSE 0 END,
        review_playable = CASE WHEN (
            SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s
            WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
              AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
          ) >= 70 AND (
            SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
            WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
              AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
            ORDER BY s.estimated_hit_probability_0_100 ASC LIMIT 1
          ) >= 55 THEN 0 ELSE 1 END,
        score_grade = CASE
            WHEN (SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key) >= 80 THEN 'BIN_ELITE'
            WHEN (SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key) >= 70 THEN 'BIN_STRONG'
            WHEN (SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key) >= 60 THEN 'BIN_QUALIFIED'
            ELSE 'BIN_LOW' END
        WHERE h.hp_board_batch_id = ${hpBatchId} AND h.canonical_prop_key = ${subProp} AND h.line_value = ${subLine} AND h.selected_side = ${subSide}
          AND h.estimated_hit_probability_0_100 > (
            SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s
            WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
              AND s.canonical_prop_key = ${t.prop} AND s.line_value = ${t.line} AND s.selected_side = ${t.side} AND s.source_key = h.source_key
          )`;
      const changed = res.count || 0;
      totalClamped += changed;
      results.push({ subset: subsetKey, superset: `${t.prop}|${t.line}|${t.side}`, rows_clamped: changed });
      // Simple, separate follow-up audit-trail write - avoids adding calibration_json changes
      // inside the already-massive multi-subquery clamp statement above, which caused a
      // parameter type inference error when attempted inline.
      if (changed > 0) {
        await pgClient.unsafe(
          `UPDATE score.hp_board_current SET calibration_json = COALESCE(calibration_json, '{}'::jsonb) || jsonb_build_object('subset_constraint_clamp_applied', true, 'subset_constraint_clamped_to_superset', $1::text, 'subset_clamp_reason', 'This prop is logically a subset of the superset prop it was clamped to (e.g. hits is a subset of total_bases), so its probability cannot exceed the superset''s.') WHERE hp_board_batch_id = $2 AND canonical_prop_key = $3 AND line_value = $4 AND selected_side = $5`,
          [t.key, hpBatchId, subProp, subLine, subSide]
        ).catch(() => {});
      }
    }
  }
  return { ok: true, total_clamped: totalClamped, per_constraint: results };
}

function identity(env) {
  const db = bindingPresence(env, ["HYPERDRIVE"]);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "score.hp_board_*", upstream_reads: "score.prop_matrix_current, scoring.enrichment_leg_current, classification.baseline_v6_current", required_db_bindings_present: allTrue(db), db_bindings: db };
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
        const sourceMatrixBatchId = input.source_matrix_batch_id || input.source_engine_batch_id || (input.chain_id ? `scoring_engine_batch_${input.chain_id}` : null);
        const workPromise = runHitProbabilityBoardFastLoop(pgClient, input, sourceMatrixBatchId);
        ctx.waitUntil(workPromise.then(() => {}, () => {}));
        const output = await workPromise;
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      } finally {
        await pgClient.end({ timeout: 1 }).catch(() => {});
      }
    }
    if (request.method === "POST" && path === "/reconcile-subset-constraints") {
      const input = await readJsonSafe(request);
      const pgClient = pg(env);
      try {
        const result = await reconcileHpBoardSubsetConstraints(pgClient, input.hp_board_batch_id);
        return jsonResponse(result, result.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, error: String(err && err.stack ? err.stack : err) }, 500);
      } finally {
        await pgClient.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /reconcile-subset-constraints"] }, 404);
  },
};
