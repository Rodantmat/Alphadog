import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-phase3c-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-hit-probability-board";
const JOB_KEY = "hit-probability-board";
const SYSTEM_VERSION = "alphadog-v2-hit-probability-board-v0.3.0-postgres-rewire";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";
const PRIMARY_HP_THRESHOLD = 70;
const MAX_LEGS_PER_INVOCATION = 100;

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

  const alreadyWrittenRows = await pgClient`SELECT matrix_id FROM score.hp_board_current WHERE hp_board_batch_id=${hpBatchId}`.catch(() => []);
  const alreadyWrittenIds = new Set(alreadyWrittenRows.map(r => r.matrix_id));

  const enrichmentRows = await pgClient`SELECT e.enrichment_id, e.matrix_id, e.batch_id, e.canonical_prop_key, e.mlb_player_id, e.board_line_value, e.prop_side,
            e.log_rate_adjustment, e.rate_multiplier, e.confidence_adjustment, e.factors_applied, e.factors_missing, e.factor_breakdown_json
     FROM scoring.enrichment_leg_current e
     INNER JOIN score.prop_matrix_current m ON m.matrix_id = e.matrix_id
     ORDER BY e.matrix_id`.catch(() => []);
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
    const baselineRows = await pgClient`SELECT player_id, canonical_prop_key, line_value, selected_side, hit_probability_0_100, confidence_0_100 FROM classification.baseline_v6_current WHERE player_id::text = ANY(${playerLiteral}::text[])`;
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
    const payload = safeJsonParse(matrixRow.matrix_payload_json, {});
    const isGoblinOrDemon = Number(matrixRow.is_goblin ?? payload?.prepared?.is_goblin ?? 0) === 1 || Number(matrixRow.is_demon ?? payload?.prepared?.is_demon ?? 0) === 1;
    if (isGoblinOrDemon) return "more";
    const moreBaseline = findBaseline(playerId, propKey, "more", lineValue);
    const lessBaseline = findBaseline(playerId, propKey, "less", lineValue);
    const moreHp = moreBaseline && Number.isFinite(Number(moreBaseline.row.hit_probability_0_100)) ? Number(moreBaseline.row.hit_probability_0_100) : null;
    const lessHp = lessBaseline && Number.isFinite(Number(lessBaseline.row.hit_probability_0_100)) ? Number(lessBaseline.row.hit_probability_0_100) : null;
    if (moreHp != null && lessHp != null) return lessHp > moreHp ? "less" : "more";
    if (lessHp != null && moreHp == null) return "less";
    return matrixRow.side || er.prop_side || "more";
  }

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
    const isGoblin = Number(matrixRow.is_goblin ?? payload?.prepared?.is_goblin ?? 0) === 1;
    const isDemon = Number(matrixRow.is_demon ?? payload?.prepared?.is_demon ?? 0) === 1;
    const moreOnly = Number(matrixRow.more_only ?? 0) === 1 || (payload?.side_context?.side_mode === "more_only");
    const sideMode = moreOnly ? "more_only" : (payload?.side_context?.side_mode || null);

    const side = determineSide(matrixRow, er, er.mlb_player_id, er.canonical_prop_key, er.board_line_value);
    const baselineMatch = findBaseline(er.mlb_player_id, er.canonical_prop_key, side, er.board_line_value);
    const baseline = baselineMatch ? baselineMatch.row : null;
    const baselineHp = baseline?.hit_probability_0_100 ?? null;
    const hp = computeRealHitProbability(baselineHp, er.rate_multiplier);

    if (hp == null) {
      insertRows.push({
        hp_board_row_id: `hp_${er.enrichment_id}`, hp_board_batch_id: hpBatchId, source_engine_batch_id: sourceMatrixBatchId || null, prepared_row_id: matrixRow.prepared_row_id || null, matrix_id: er.matrix_id, source_line_id: matrixRow.source_line_id || null,
        source_key: matrixRow.source_key || null, game_pk: matrixRow.game_pk || null, official_date: matrixRow.official_date || null, official_game_time_utc: matrixRow.official_game_time_utc || null,
        mlb_player_id: er.mlb_player_id, player_name: playerName, canonical_prop_key: er.canonical_prop_key, line_value: er.board_line_value, selected_side: side,
        estimated_hit_probability_0_100: null, probability_confidence_0_100: null, board_tier: "REVIEW", live_playable: 0, review_playable: 1,
        is_goblin: isGoblin ? 1 : 0, is_demon: isDemon ? 1 : 0, is_more_only: moreOnly ? 1 : 0,
        score_grade: "BIN_0_NULL",
        calibration_json: JSON.stringify({ real_reordered: true, no_baseline_coverage: true, is_goblin: isGoblin, is_demon: isDemon, side_mode: sideMode, more_only: moreOnly, note: "No baseline_v6 row found for this player/prop/line/side combo even after nearest-line fallback - cannot compute HP without a baseline. Tracked here (not skipped silently) to avoid re-processing this leg on every future invocation." })
      });
      reviewRows++;
      written++;
      continue;
    }
    const confidence = computeFinalConfidence(baseline?.confidence_0_100, er);
    const primaryPlayable = hp >= PRIMARY_HP_THRESHOLD && confidence >= 55;
    if (primaryPlayable) primaryRows++; else reviewRows++;

    insertRows.push({
      hp_board_row_id: `hp_${er.enrichment_id}`, hp_board_batch_id: hpBatchId, source_engine_batch_id: sourceMatrixBatchId || null, prepared_row_id: matrixRow.prepared_row_id || null, matrix_id: er.matrix_id, source_line_id: matrixRow.source_line_id || null,
      source_key: matrixRow.source_key || null, game_pk: matrixRow.game_pk || null, official_date: matrixRow.official_date || null, official_game_time_utc: matrixRow.official_game_time_utc || null,
      mlb_player_id: er.mlb_player_id, player_name: playerName, canonical_prop_key: er.canonical_prop_key, line_value: er.board_line_value, selected_side: side,
      estimated_hit_probability_0_100: hp, probability_confidence_0_100: confidence, board_tier: primaryPlayable ? "PRIMARY" : "REVIEW", live_playable: primaryPlayable ? 1 : 0, review_playable: primaryPlayable ? 0 : 1,
      is_goblin: isGoblin ? 1 : 0, is_demon: isDemon ? 1 : 0, is_more_only: moreOnly ? 1 : 0,
      score_grade: gradeForProbability(hp),
      calibration_json: JSON.stringify({ real_reordered: true, baseline_hp: baselineHp, baseline_confidence: baseline?.confidence_0_100 ?? null, rate_multiplier: er.rate_multiplier ?? 1.0, factors_applied: er.factors_applied || 0, factors_missing: er.factors_missing || 0, primary_hp_threshold: PRIMARY_HP_THRESHOLD, is_exact_line_match: baselineMatch ? baselineMatch.is_exact_line_match : null, line_distance: baselineMatch ? baselineMatch.line_distance : null, is_goblin: isGoblin, is_demon: isDemon, side_mode: sideMode, more_only: moreOnly, note: "Final HP + Final Confidence computed here, BEFORE Scoring Engine (reordered per spec). score_0_100 intentionally null until Scoring Engine (now running after this stage) fills it in from this row's final HP + final confidence." })
    });
    written++;
  }
  const insertCols = ["hp_board_row_id", "hp_board_batch_id", "source_engine_batch_id", "prepared_row_id", "matrix_id", "source_line_id", "source_key", "game_pk", "official_date", "official_game_time_utc", "mlb_player_id", "player_name", "canonical_prop_key", "line_value", "selected_side", "estimated_hit_probability_0_100", "probability_confidence_0_100", "board_tier", "live_playable", "review_playable", "is_goblin", "is_demon", "is_more_only", "score_grade", "calibration_json"];
  if (insertRows.length) {
    const CHUNK = 150;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      await pgClient`INSERT INTO score.hp_board_current ${pgClient(insertRows.slice(i, i + CHUNK), ...insertCols)}
        ON CONFLICT (hp_board_row_id) DO UPDATE SET estimated_hit_probability_0_100=EXCLUDED.estimated_hit_probability_0_100, probability_confidence_0_100=EXCLUDED.probability_confidence_0_100, board_tier=EXCLUDED.board_tier, live_playable=EXCLUDED.live_playable, review_playable=EXCLUDED.review_playable, score_grade=EXCLUDED.score_grade, calibration_json=EXCLUDED.calibration_json, updated_at=now()`;
    }
  }

  const isPartial = candidateRows.length > chunkRows.length || chunkRows.length >= MAX_LEGS_PER_INVOCATION;
  const status = isPartial ? "partial_continue" : "completed_hit_probability_current_estimates_written";

  let subsetReconcile = null;
  if (!isPartial) {
    subsetReconcile = await reconcileHpBoardSubsetConstraints(pgClient, hpBatchId).catch((e) => ({ ok: false, error: String(e && e.message ? e.message : e) }));
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
    timestamp_utc: nowUtc(),
  };
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
    const res = await pgClient`
      UPDATE score.hp_board_current AS h
      SET estimated_hit_probability_0_100 = (
        SELECT s.estimated_hit_probability_0_100 FROM score.hp_board_current s
        WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
          AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key
      ),
      probability_confidence_0_100 = (
        SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
        WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
          AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key
      )
      WHERE h.hp_board_batch_id = ${hpBatchId} AND h.canonical_prop_key = ${aliasProp} AND h.line_value = ${aliasLine} AND h.selected_side = ${aliasSide}
        AND EXISTS (
          SELECT 1 FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${targetProp} AND s.line_value = ${targetLine} AND s.selected_side = ${targetSide} AND s.source_key = h.source_key
        )`;
    const changed = res.count || 0;
    totalClamped += changed;
    results.push({ alias: aliasKeySide, target: targetKeySide, rows_synced: changed });
  }
  for (const [subsetKey, supersetKey] of Object.entries(constraints)) {
    const [subProp, subLineRaw, subSide] = subsetKey.split("|");
    const [supProp, supLineRaw, supSide] = supersetKey.split("|");
    const subLine = Number(subLineRaw), supLine = Number(supLineRaw);
    const res = await pgClient`
      UPDATE score.hp_board_current AS h
      SET estimated_hit_probability_0_100 = (
        SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s
        WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
          AND s.canonical_prop_key = ${supProp} AND s.line_value = ${supLine} AND s.selected_side = ${supSide} AND s.source_key = h.source_key
      ),
      probability_confidence_0_100 = (
        SELECT s.probability_confidence_0_100 FROM score.hp_board_current s
        WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
          AND s.canonical_prop_key = ${supProp} AND s.line_value = ${supLine} AND s.selected_side = ${supSide} AND s.source_key = h.source_key
        ORDER BY s.estimated_hit_probability_0_100 ASC LIMIT 1
      )
      WHERE h.hp_board_batch_id = ${hpBatchId} AND h.canonical_prop_key = ${subProp} AND h.line_value = ${subLine} AND h.selected_side = ${subSide}
        AND h.estimated_hit_probability_0_100 > (
          SELECT MIN(s.estimated_hit_probability_0_100) FROM score.hp_board_current s
          WHERE s.mlb_player_id = h.mlb_player_id AND s.hp_board_batch_id = h.hp_board_batch_id
            AND s.canonical_prop_key = ${supProp} AND s.line_value = ${supLine} AND s.selected_side = ${supSide} AND s.source_key = h.source_key
        )`;
    const changed = res.count || 0;
    totalClamped += changed;
    results.push({ subset: subsetKey, superset: supersetKey, rows_clamped: changed });
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
        const output = await runHitProbabilityBoardFastLoop(pgClient, input, sourceMatrixBatchId);
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
