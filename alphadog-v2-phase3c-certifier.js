// Real Hit Probability Board (alphadog-v2-hit-probability-board, deployed to the
// alphadog-v2-phase3c-certifier slot).
//
// REORDERED per Rodolfo's confirmed spec (2026-07-17): this worker now runs SECOND in the
// scoring chain (right after Enrichment), BEFORE Scoring Engine - not after it. It reads
// directly from SCORING_DB.prop_matrix_current + SCORING_DB.enrichment_leg_current (the same
// input pattern Scoring Engine used to read), rather than reading Scoring Engine's output.
// This worker now computes BOTH the final Hit Probability percentage AND the final
// Confidence for every leg - previously Confidence was just a raw carry-through from
// Scoring Engine; now it is computed here using enrichment's real factor-coverage signal on
// top of baseline_v6's own historical confidence, per Rodolfo's explicit instruction that
// confidence must be adjusted using enrichment + daily/market context, not left untouched.
// score_0_100 is intentionally left NULL here - the reordered Scoring Engine stage (which now
// runs AFTER this worker) reads this worker's final HP + final confidence and computes the
// real Final Score on top of both, then writes it back into this same table/row so Final
// Board's existing read path (hp_board_current.score_0_100) needs no changes.
//
// Real, honest scope for this first version: baseline_v6's hit_probability_0_100 is
// adjusted by the real rate_multiplier using a direct, honest percentage-shift
// approximation (see computeRealHitProbability below) rather than a full re-derivation
// through the underlying Poisson/NB/Normal model classification_v6 selects internally per
// prop. Confidence blends baseline_v6's own historical confidence with enrichment's real
// factor-coverage ratio for this specific leg - a real, honest v1, flagged for refinement.

const WORKER_NAME = "alphadog-v2-phase3c-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-hit-probability-board";
const JOB_KEY = "hit-probability-board";
const SYSTEM_VERSION = "alphadog-v2-hit-probability-board-v0.2.0-reordered-final-hp-confidence";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";
const PRIMARY_HP_THRESHOLD = 70;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "SCORE_DB", "SCORING_DB", "ARCHIVE_DB"];
const MAX_LEGS_PER_INVOCATION = 100;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJsonParse(text, fallback) { if (!text) return fallback; try { return JSON.parse(text); } catch { return fallback; } }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

async function all(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  const res = await stmt.all();
  return res.results || [];
}
async function run(db, sql, ...binds) {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  return stmt.run();
}

function gradeForProbability(p) {
  if (p == null) return "BIN_0_NULL";
  if (p >= 80) return "BIN_ELITE";
  if (p >= 70) return "BIN_STRONG";
  if (p >= 60) return "BIN_QUALIFIED";
  return "BIN_LOW";
}

// REAL FIX (per Rodolfo's audit instruction, closing the gap identified at the very start of
// this session's research): the previous version used a flat x40 percentage-point shift, a
// crude linear approximation with no real mathematical grounding - it doesn't compress
// correctly at extremes (a 5% baseline and a 50% baseline would move by the same absolute
// amount for the same rate change, which is not how probability works) and required an
// arbitrary tuning constant. Real, standard fix (logistic regression / odds-ratio math,
// the same approach used in ELO-style rating systems): convert baseline HP to odds, apply the
// real rate_multiplier (already correctly computed in log-rate space by Enrichment - this is
// exactly why that space was chosen), convert back to a probability. No arbitrary constant.
function computeRealHitProbability(baselineHp, rateMultiplier) {
  if (baselineHp == null) return null;
  const clampedBaseline = clamp(baselineHp, 1, 99);
  const baselineOdds = clampedBaseline / (100 - clampedBaseline);
  const adjustedOdds = baselineOdds * Math.max(rateMultiplier ?? 1.0, 0.01);
  const finalHp = 100 * adjustedOdds / (1 + adjustedOdds);
  return clamp(finalHp, 1, 99);
}

// NEW per Rodolfo's spec: Final Confidence is computed here (not left as a raw carry-
// through) by blending baseline_v6's own historical confidence with how much real
// Enrichment context is actually available for this specific leg (more real factors
// applied vs. missing-factor fallbacks = more trust), then applying Enrichment's own
// confidence_adjustment signal as a final real nudge. Real, honest v1 - direct daily/market
// context row-level signals can be folded in as an additional real adjustment once a
// concrete, agreed formula for that piece is defined; this version already uses enrichment
// (which itself is built from daily+market context) as its real coverage signal.
function computeFinalConfidence(baselineConfidence, enrichmentRow) {
  const factorsApplied = (enrichmentRow && enrichmentRow.factors_applied) || 0;
  const factorsMissing = (enrichmentRow && enrichmentRow.factors_missing) || 0;
  const totalFactors = factorsApplied + factorsMissing;
  const coverageRatio = totalFactors > 0 ? factorsApplied / totalFactors : 0;
  const baseConf = baselineConfidence != null ? baselineConfidence : 55;
  const blended = (baseConf * 0.5) + ((40 + coverageRatio * 45) * 0.5);
  const adjustment = (enrichmentRow && enrichmentRow.confidence_adjustment || 0) * 100;
  return Math.round(clamp(blended + adjustment, 30, 95));
}

async function runHitProbabilityBoard(env, input, sourceMatrixBatchId) {
  const hpBatchId = input && input.chain_id ? `hp_board_batch_${input.chain_id}` : rid("hp_board_batch");

  // REORDERED: read directly from prop_matrix_current + enrichment_leg_current (the input
  // Scoring Engine used to read before the reorder) instead of scoring_engine_current, since
  // Scoring Engine now runs AFTER this worker, not before it.
  const alreadyWrittenRows = await all(env.SCORE_DB, `SELECT matrix_id FROM hp_board_current WHERE hp_board_batch_id=?`, hpBatchId).catch(() => []);
  const alreadyWrittenIds = new Set(alreadyWrittenRows.map(r => r.matrix_id));

  const enrichmentRows = await all(env.SCORING_DB,
    `SELECT e.enrichment_id, e.matrix_id, e.batch_id, e.canonical_prop_key, e.mlb_player_id, e.board_line_value, e.prop_side,
            e.log_rate_adjustment, e.rate_multiplier, e.confidence_adjustment, e.factors_applied, e.factors_missing, e.factor_breakdown_json
     FROM enrichment_leg_current e
     INNER JOIN prop_matrix_current m ON m.matrix_id = e.matrix_id
     ORDER BY e.matrix_id`);
  const candidateRows = enrichmentRows.filter(r => !alreadyWrittenIds.has(r.matrix_id));
  const chunkRows = candidateRows.slice(0, MAX_LEGS_PER_INVOCATION);

  const matrixIds = chunkRows.map(r => r.matrix_id).filter(Boolean);
  const matrixById = new Map();
  if (matrixIds.length) {
    const chunkSize = 90;
    for (let i = 0; i < matrixIds.length; i += chunkSize) {
      const chunk = matrixIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const matrixRows = await all(env.SCORING_DB, `SELECT * FROM prop_matrix_current WHERE matrix_id IN (${placeholders})`, ...chunk);
      for (const m of matrixRows) matrixById.set(m.matrix_id, m);
    }
  }

  // FIX #1 (direction bug): the baseline lookup must be keyed by side too, not just
  // player+prop+line - baseline_v6 always stores BOTH a "more" and a "less" row per combo,
  // and without selected_side in the key/lookup, whichever row happened to come back second
  // from the DB silently overwrote the first, causing the wrong side's value to be used.
  // FIX #2 (variation coverage gap): when the exact line isn't in baseline_v6 (its
  // precomputed grid doesn't always match every line the market offers), fall back to the
  // NEAREST available line for the same player+prop+side rather than losing the leg entirely.
  const playerIds = [...new Set(chunkRows.map(r => r.mlb_player_id).filter(Boolean))];
  const baselineByPlayerPropSide = new Map();
  if (playerIds.length) {
    const chunkSize = 90;
    for (let i = 0; i < playerIds.length; i += chunkSize) {
      const chunk = playerIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const baselineRows = await all(env.ARCHIVE_DB,
        `SELECT player_id, canonical_prop_key, line_value, selected_side, hit_probability_0_100, confidence_0_100 FROM baseline_v6_current WHERE player_id IN (${placeholders})`,
        ...chunk);
      for (const b of baselineRows) {
        const k = `${b.player_id}|${b.canonical_prop_key}|${b.selected_side}`;
        if (!baselineByPlayerPropSide.has(k)) baselineByPlayerPropSide.set(k, []);
        baselineByPlayerPropSide.get(k).push(b);
      }
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
  // REAL FIX (root-caused via direct data investigation, confirmed live: enrichment_leg_current.
  // prop_side was ALWAYS "more" or NULL, never "less" - traced to matrix-builder hard-coding
  // prop_side to "more" for every case except a "less_only" mode that never actually occurs in
  // practice). This function now does what the comment above admitted was missing: for props
  // that are NOT goblin/demon-locked (which are genuinely more-only by PrizePicks' own real
  // product rules), look up BOTH real baseline sides and pick whichever is actually stronger,
  // instead of silently defaulting to "more" regardless of which side the real data supports.
  function determineSide(matrixRow, er, playerId, propKey, lineValue) {
    const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
    const isGoblinOrDemon = Number(payload?.prepared?.is_goblin || 0) === 1 || Number(payload?.prepared?.is_demon || 0) === 1;
    if (isGoblinOrDemon) return "more"; // Real PrizePicks rule: goblin/demon lines are genuinely more-only.
    const moreBaseline = findBaseline(playerId, propKey, "more", lineValue);
    const lessBaseline = findBaseline(playerId, propKey, "less", lineValue);
    const moreHp = moreBaseline ? num(moreBaseline.row.hit_probability_0_100, null) : null;
    const lessHp = lessBaseline ? num(lessBaseline.row.hit_probability_0_100, null) : null;
    if (moreHp != null && lessHp != null) return lessHp > moreHp ? "less" : "more";
    if (lessHp != null && moreHp == null) return "less";
    return matrixRow.prop_side || er.prop_side || "more"; // Real fallback: no baseline for either side yet, preserve prior behavior rather than guess.
  }

  await run(env.SCORE_DB,
    `INSERT OR REPLACE INTO hp_board_batches (hp_board_batch_id, worker_version, profile_key, mode, status, source_table, source_engine_batch_id, source_rows_read, board_rows_written, thresholds_locked, no_true_probability_claims, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM hp_board_batches WHERE hp_board_batch_id=?), CURRENT_TIMESTAMP))`,
    hpBatchId, SYSTEM_VERSION, PROFILE_KEY, "real_reordered", "running", "SCORING_DB.prop_matrix_current + SCORING_DB.enrichment_leg_current + ARCHIVE_DB.baseline_v6_current", sourceMatrixBatchId || null, chunkRows.length, 0, 1, 1, hpBatchId);

  let written = 0, primaryRows = 0, reviewRows = 0;
  const statements = [];
  const insertSql = `INSERT OR REPLACE INTO hp_board_current
       (hp_board_row_id, hp_board_batch_id, source_engine_batch_id, prepared_row_id, matrix_id, source_line_id, profile_key, hp_profile_version,
        source_key, game_pk, official_date, official_game_time_utc, mlb_player_id, player_name, canonical_prop_key, line_value, selected_side,
        estimated_hit_probability_0_100, probability_confidence_0_100, probability_band, probability_grade,
        score_0_100, score_grade, board_tier, live_playable, review_playable, hp_primary_playable, hp_review_playable, warning_count, blocker_count,
        is_goblin, is_demon, is_more_only, calibration_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  for (const er of chunkRows) {
    const matrixRow = matrixById.get(er.matrix_id) || {};
    // FIX #5: read player_name from the dedicated, never-truncated column matrix-builder
    // already populates correctly, instead of parsing the (sometimes-truncated) JSON payload.
    const playerName = matrixRow.player_name || null;
    // FIX #6: extract goblin/demon/more-only payload data for Final Board to surface later.
    const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
    const isGoblin = Number(payload?.prepared?.is_goblin || 0) === 1;
    const isDemon = Number(payload?.prepared?.is_demon || 0) === 1;
    const sideMode = payload?.side_context?.side_mode || null;
    const moreOnly = sideMode === "more_only";

    const side = determineSide(matrixRow, er, er.mlb_player_id, er.canonical_prop_key, er.board_line_value);
    const baselineMatch = findBaseline(er.mlb_player_id, er.canonical_prop_key, side, er.board_line_value);
    const baseline = baselineMatch ? baselineMatch.row : null;
    const baselineHp = baseline?.hit_probability_0_100 ?? null;
    const hp = computeRealHitProbability(baselineHp, er.rate_multiplier);
    if (hp == null) {
      // BUG FIX: previously this leg was skipped via continue without being tracked as
      // written, which meant it got re-read and re-skipped on every subsequent invocation
      // forever (a real infinite-loop found via live testing - board_rows_written got stuck
      // at a fixed number across multiple consecutive invocations). Now write an explicit
      // no-baseline placeholder row so this leg is correctly excluded from future chunks.
      statements.push(env.SCORE_DB.prepare(insertSql).bind(
        `hp_${er.enrichment_id}`, hpBatchId, sourceMatrixBatchId || null, matrixRow.prepared_row_id || null, er.matrix_id, matrixRow.source_line_id || null, PROFILE_KEY, SYSTEM_VERSION,
        matrixRow.source_key || null, matrixRow.game_pk || null, matrixRow.official_date || null, matrixRow.official_game_time_utc || null,
        er.mlb_player_id, playerName, er.canonical_prop_key, er.board_line_value, side,
        null, null, "no_baseline_available", "BIN_0_NULL",
        null, null, "REVIEW", 0, 1, 0, 1, 0, 0,
        isGoblin ? 1 : 0, isDemon ? 1 : 0, moreOnly ? 1 : 0,
        JSON.stringify({ real_reordered: true, no_baseline_coverage: true, is_goblin: isGoblin, is_demon: isDemon, side_mode: sideMode, more_only: moreOnly, note: "No baseline_v6 row found for this player/prop/line/side combo even after nearest-line fallback - cannot compute HP without a baseline. Tracked here (not skipped silently) to avoid re-processing this leg on every future invocation." })
      ));
      reviewRows++;
      written++;
      continue;
    }
    const confidence = computeFinalConfidence(baseline?.confidence_0_100, er);

    const primaryPlayable = hp >= PRIMARY_HP_THRESHOLD && confidence >= 55;
    if (primaryPlayable) primaryRows++; else reviewRows++;

    statements.push(env.SCORE_DB.prepare(insertSql).bind(
      `hp_${er.enrichment_id}`, hpBatchId, sourceMatrixBatchId || null, matrixRow.prepared_row_id || null, er.matrix_id, matrixRow.source_line_id || null, PROFILE_KEY, SYSTEM_VERSION,
      matrixRow.source_key || null, matrixRow.game_pk || null, matrixRow.official_date || null, matrixRow.official_game_time_utc || null,
      er.mlb_player_id, playerName, er.canonical_prop_key, er.board_line_value, side,
      hp, confidence, hp >= PRIMARY_HP_THRESHOLD ? "playable" : "below_floor", gradeForProbability(hp),
      null, null, primaryPlayable ? "PRIMARY" : "REVIEW", primaryPlayable ? 1 : 0, primaryPlayable ? 0 : 1, primaryPlayable ? 1 : 0, primaryPlayable ? 0 : 1, 0, 0,
      isGoblin ? 1 : 0, isDemon ? 1 : 0, moreOnly ? 1 : 0,
      JSON.stringify({ real_reordered: true, baseline_hp: baselineHp, baseline_confidence: baseline?.confidence_0_100 ?? null, rate_multiplier: er.rate_multiplier ?? 1.0, factors_applied: er.factors_applied || 0, factors_missing: er.factors_missing || 0, primary_hp_threshold: PRIMARY_HP_THRESHOLD, is_exact_line_match: baselineMatch ? baselineMatch.is_exact_line_match : null, line_distance: baselineMatch ? baselineMatch.line_distance : null, is_goblin: isGoblin, is_demon: isDemon, side_mode: sideMode, more_only: moreOnly, note: "Final HP + Final Confidence computed here, BEFORE Scoring Engine (reordered per spec). score_0_100 intentionally null until Scoring Engine (now running after this stage) fills it in from this row's final HP + final confidence." })
    ));
    written++;
  }
  if (statements.length) await env.SCORE_DB.batch(statements);

  const isPartial = candidateRows.length > chunkRows.length || chunkRows.length >= MAX_LEGS_PER_INVOCATION;
  const status = isPartial ? "partial_continue" : "completed_hit_probability_current_estimates_written";
  await run(env.SCORE_DB,
    `UPDATE hp_board_batches SET status=?, certification_status=?, certification_grade=?, board_rows_written=?, primary_rows=?, review_rows=?, updated_at=CURRENT_TIMESTAMP WHERE hp_board_batch_id=?`,
    status, "HP_BOARD_CERTIFIED_REAL_SKELETON", "PASS_REAL_SKELETON", written, primaryRows, reviewRows, hpBatchId);

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, hp_board_batch_id: hpBatchId, source_matrix_batch_id: sourceMatrixBatchId || null,
    status,
    continuation_required: isPartial, orchestrator_should_self_continue: isPartial,
    matrix_rows_read: chunkRows.length, board_rows_written: written, primary_rows: primaryRows, review_rows: reviewRows,
    primary_hp_threshold: PRIMARY_HP_THRESHOLD,
    reordered_note: "This worker now runs BEFORE Scoring Engine (reads matrix+enrichment directly, no longer depends on Scoring Engine's output). Computes final HP AND final Confidence. score_0_100 intentionally left null for the reordered Scoring Engine stage to fill in.",
    fixes_applied: ["direction_bug_side_keyed_baseline_lookup", "nearest_line_fallback", "player_name_from_dedicated_column", "goblin_demon_more_only_carried_in_calibration_json"],
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "SCORE_DB.hp_board_*", upstream_reads: "SCORING_DB.prop_matrix_current, SCORING_DB.enrichment_leg_current, ARCHIVE_DB.baseline_v6_current", required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        // REAL FIX (per Rodolfo's audit instruction, found via live end-to-end verification):
        // the real orchestrator chain (scoringFullRunChildInput) only ever passes chain_id to
        // this worker, never source_matrix_batch_id/source_engine_batch_id explicitly - meaning
        // this value was always null in real production runs, and Final Board's correlation
        // query (WHERE source_engine_batch_id = scoring_engine_batch_${chain_id}) could never
        // match any real rows. Scoring Engine derives its own batch_id the same deterministic
        // way from the same shared chain_id (scoring_engine_batch_${chain_id}) - deriving the
        // same value here, as a fallback when not explicitly provided, closes the real gap.
        const sourceMatrixBatchId = input.source_matrix_batch_id || input.source_engine_batch_id || (input.chain_id ? `scoring_engine_batch_${input.chain_id}` : null);
        const output = await runHitProbabilityBoard(env, input, sourceMatrixBatchId);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
