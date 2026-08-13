import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-phase3a-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-scoring-engine";
const JOB_KEY = "scoring-engine-shadow-v1";
const SYSTEM_VERSION = "alphadog-v2-scoring-engine-v0.3.0-postgres-rewire";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";
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
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function gradeForScore(score) {
  if (score == null) return "BIN_0_NULL";
  if (score >= 90) return "BIN_ELITE";
  if (score >= 84) return "BIN_STRONG";
  if (score >= 76) return "BIN_QUALIFIED";
  if (score >= 70) return "BIN_ARCHIVE";
  return "BIN_REJECT";
}

// Final Score is computed FROM final HP and final Confidence (both already finalized by
// the Hit Probability Board stage that runs before this one) - HP is the primary driver
// since it IS the actual prediction, Confidence tempers it. A modest multiplier-aware lift
// is then applied: a Goblin variant pays less for the same probability (worse value - same
// risk, smaller reward), so it gets a small downward adjustment; a Demon variant pays more
// for a harder line (better value if the probability still clears it), so it gets a small
// upward adjustment. This directly reflects that the same underlying prediction is not
// equally good value on every app/variant - a real gap confirmed live (identical scores
// showing for the same leg across apps with different payout structures).
const GOBLIN_SCORE_LIFT = -4;
const DEMON_SCORE_LIFT = 3;
function computeFinalScore(hp, confidence, isGoblin, isDemon) {
  if (hp == null) return null;
  const conf = confidence != null ? confidence : 55;
  let score = (hp * 0.65) + (conf * 0.35);
  if (isGoblin) score += GOBLIN_SCORE_LIFT;
  else if (isDemon) score += DEMON_SCORE_LIFT;
  return Math.round(clamp(score, 1, 99));
}

async function runScoringEngine(pgClient, input) {
  const hpBatchId = input && input.hp_board_batch_id
    ? input.hp_board_batch_id
    : (input && input.chain_id ? `hp_board_batch_${input.chain_id}` : null);
  if (!hpBatchId) {
    return { ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "blocked_missing_hp_board_batch_id", error: "hp_board_batch_id (or chain_id to derive it) is required now that this worker reads Hit Probability Board's finalized output" };
  }
  const batchId = input && input.chain_id ? `scoring_engine_batch_${input.chain_id}` : rid("scoring_engine_batch");

  const hpRows = await pgClient`SELECT hp_board_row_id, hp_board_batch_id, source_engine_batch_id, prepared_row_id, matrix_id, source_line_id,
            source_key, game_pk, official_date::text AS official_date, official_game_time_utc, mlb_player_id, player_name,
            canonical_prop_key, line_value, selected_side, estimated_hit_probability_0_100, probability_confidence_0_100,
            is_goblin, is_demon, calibration_json
     FROM score.hp_board_current
     WHERE hp_board_batch_id=${hpBatchId}
       AND score_0_100 IS NULL
       AND estimated_hit_probability_0_100 IS NOT NULL
     ORDER BY hp_board_row_id
     LIMIT ${MAX_LEGS_PER_INVOCATION}`;

  const existingStart = await pgClient`SELECT started_at FROM score.scoring_engine_batches WHERE batch_id=${batchId}`;
  const startedAt = existingStart[0] && existingStart[0].started_at ? existingStart[0].started_at : new Date().toISOString();
  await pgClient`INSERT INTO score.scoring_engine_batches (batch_id, profile_key, profile_version, worker_version, job_key, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, thresholds_locked, archive_score_threshold, started_at)
    VALUES (${batchId}, ${PROFILE_KEY}, ${SYSTEM_VERSION}, ${SYSTEM_VERSION}, ${JOB_KEY}, 'running', 'SCORING_ENGINE_STARTED', 'RUNNING', ${hpRows.length}, 0, 0, 1, 70, ${startedAt})
    ON CONFLICT (batch_id) DO UPDATE SET status=EXCLUDED.status, certification=EXCLUDED.certification, certification_grade=EXCLUDED.certification_grade, matrix_rows_read=EXCLUDED.matrix_rows_read`;

  let written = 0;
  const mirrorRows = [];
  const scoredRows = hpRows.map(row => {
    const hp = row.estimated_hit_probability_0_100;
    const confidence = row.probability_confidence_0_100;
    const rawScore = computeFinalScore(hp, confidence, row.is_goblin, row.is_demon);
    return { row, hp, confidence, rawScore, finalScore: rawScore, monotonicity_clamped: false };
  }).filter(r => r.rawScore != null);

  // Difficulty-monotonicity enforcement (2026-08-13): a leg with harder true difficulty (regardless
  // of goblin/demon/standard label) must never score higher than an easier leg for the same
  // player/prop/side/date - see commit message above for the confirmed real leak this closes.
  const groups = new Map();
  for (const r of scoredRows) {
    const key = `${r.row.mlb_player_id}|${r.row.canonical_prop_key}|${r.row.selected_side}|${r.row.official_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const side = group[0].row.selected_side;
    // Easiest first: for 'more', lower line is easier (ascending); for 'less', higher line is
    // easier (descending) - this is the true difficulty ordering, independent of goblin/demon label.
    group.sort((a, b) => side === "less"
      ? Number(b.row.line_value) - Number(a.row.line_value)
      : Number(a.row.line_value) - Number(b.row.line_value));
    for (let i = 1; i < group.length; i++) {
      const runningMin = Math.min(...group.slice(0, i).map(g => g.finalScore));
      if (group[i].finalScore > runningMin) {
        group[i].finalScore = runningMin;
        group[i].monotonicity_clamped = true;
      }
    }
  }

  for (const r of scoredRows) {
    const { row, hp, confidence, rawScore, finalScore, monotonicity_clamped } = r;
    const score = finalScore;
    const grade = gradeForScore(score);

    await pgClient`UPDATE score.hp_board_current SET score_0_100=${score}, score_grade=${grade}, updated_at=now() WHERE hp_board_row_id=${row.hp_board_row_id}`;

    const scoreRowId = rid("score_row");
    mirrorRows.push({
      score_row_id: scoreRowId, batch_id: batchId, matrix_id: row.matrix_id, prepared_row_id: row.prepared_row_id || null, source_line_id: row.source_line_id || null,
      source_key: row.source_key || null, game_pk: row.game_pk || null, official_date: row.official_date || null, official_game_time_utc: row.official_game_time_utc || null,
      mlb_player_id: row.mlb_player_id, player_name: row.player_name, canonical_prop_key: row.canonical_prop_key, line_value: row.line_value, side_mode: "two_sided", selected_side: row.selected_side || "more",
      more_score_0_100: score, less_score_0_100: score, score_0_100: score, score_status: "scored_from_final_hp_confidence_v1", score_grade: grade,
      side_eligibility_status: "side_ready", side_availability_status: "side_ready_two_sided", profile_key: PROFILE_KEY, profile_version: SYSTEM_VERSION, thresholds_locked: 1, archive_score_threshold: 70,
      archive_eligible: score >= 70 ? 1 : 0, archive_written: 0, calculation_json: JSON.stringify({ real_reordered: true, computed_from_final_hp: hp, computed_from_final_confidence: confidence, raw_score_before_monotonicity: rawScore, monotonicity_clamped, note: "Final Score computed FROM finalized HP + Confidence (reordered per spec), written back into hp_board_current.score_0_100 and mirrored here for audit/compatibility. Difficulty-monotonicity enforced across same player/prop/side/date group (2026-08-13 fix)." }), matrix_payload_json_snapshot: null,
      matrix_status: null, blocking_for_scoring: 0, warning_count: 0, missing_component_count: 0,
      confidence_0_100: confidence, confidence_status: confidence >= 55 ? "confidence_ok" : "confidence_low", live_playable: score >= 76 ? 1 : 0, model_deferred: 0, score_sort_0_100: score
    });
    written++;
  }
  const mirrorCols = ["score_row_id", "batch_id", "matrix_id", "prepared_row_id", "source_line_id", "source_key", "game_pk", "official_date", "official_game_time_utc", "mlb_player_id", "player_name", "canonical_prop_key", "line_value", "side_mode", "selected_side", "more_score_0_100", "less_score_0_100", "score_0_100", "score_status", "score_grade", "side_eligibility_status", "side_availability_status", "profile_key", "profile_version", "thresholds_locked", "archive_score_threshold", "archive_eligible", "archive_written", "calculation_json", "matrix_payload_json_snapshot", "matrix_status", "blocking_for_scoring", "warning_count", "missing_component_count", "confidence_0_100", "confidence_status", "live_playable", "model_deferred", "score_sort_0_100"];
  const MIRROR_INSERT_CHUNK_SIZE = 500;
  for (let i = 0; i < mirrorRows.length; i += MIRROR_INSERT_CHUNK_SIZE) {
    const chunk = mirrorRows.slice(i, i + MIRROR_INSERT_CHUNK_SIZE);
    await pgClient`INSERT INTO score.scoring_engine_current ${pgClient(chunk, ...mirrorCols)}`;
  }

  const remainingRows = await pgClient`SELECT COUNT(*) as cnt FROM score.hp_board_current WHERE hp_board_batch_id=${hpBatchId} AND score_0_100 IS NULL AND estimated_hit_probability_0_100 IS NOT NULL`;
  const stillRemaining = Number(remainingRows[0] && remainingRows[0].cnt || 0);
  const isPartial = stillRemaining > 0;
  const status = isPartial ? "partial_continue" : "completed_scoring_current_rows_written";
  await pgClient`UPDATE score.scoring_engine_batches SET status=${status}, certification='SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS', certification_grade='PASS_REAL_SKELETON', score_rows_written=${written}, finished_at=${isPartial ? null : new Date().toISOString()} WHERE batch_id=${batchId}`;

  // Real structural fix: scoring_engine_current previously had no cleanup at all, so every run's
  // batch accumulated alongside every previous run's forever. Delete everything except the batch
  // that was just successfully, completely written, matching the same fix applied to
  // hp_board_current.
  let cleanupOldBatches = null;
  let finalSweep = null;
  if (!isPartial) {
    try {
      const deleted = await pgClient`DELETE FROM score.scoring_engine_current WHERE batch_id <> ${batchId}`;
      cleanupOldBatches = { ok: true, deleted_rows: deleted.count ?? null };
    } catch (e) {
      cleanupOldBatches = { ok: false, error: String(e && e.message ? e.message : e) };
    }

    // Whole-batch monotonicity sweep (2026-08-13): closes the cross-tick gap the per-tick clamp
    // above cannot see - runs once, only when the entire hp_board_batch_id is confirmed complete
    // (isPartial === false), re-reading every scored row for this batch fresh from the database
    // (not the in-memory slice from any single tick) so tied-difficulty groups that happened to
    // split across separate ticks still get correctly clamped as one true group.
    try {
      const allScored = await pgClient`SELECT hp_board_row_id, matrix_id, mlb_player_id, canonical_prop_key, selected_side, official_date::text AS official_date, line_value, score_0_100
        FROM score.hp_board_current WHERE hp_board_batch_id=${hpBatchId} AND score_0_100 IS NOT NULL`;
      const sweepGroups = new Map();
      for (const r of allScored) {
        const key = `${r.mlb_player_id}|${r.canonical_prop_key}|${r.selected_side}|${r.official_date}`;
        if (!sweepGroups.has(key)) sweepGroups.set(key, []);
        sweepGroups.get(key).push(r);
      }
      const sweepUpdates = [];
      for (const group of sweepGroups.values()) {
        if (group.length < 2) continue;
        const side = group[0].selected_side;
        group.sort((a, b) => side === "less" ? Number(b.line_value) - Number(a.line_value) : Number(a.line_value) - Number(b.line_value));
        for (let i = 1; i < group.length; i++) {
          const runningMin = Math.min(...group.slice(0, i).map(g => g.score_0_100));
          if (group[i].score_0_100 > runningMin) {
            sweepUpdates.push({ hp_board_row_id: group[i].hp_board_row_id, matrix_id: group[i].matrix_id, new_score: runningMin });
            group[i].score_0_100 = runningMin;
          }
        }
      }
      for (const u of sweepUpdates) {
        const grade = gradeForScore(u.new_score);
        await pgClient`UPDATE score.hp_board_current SET score_0_100=${u.new_score}, score_grade=${grade}, updated_at=now() WHERE hp_board_row_id=${u.hp_board_row_id}`;
        if (u.matrix_id) {
          await pgClient`UPDATE score.scoring_engine_current SET score_0_100=${u.new_score}, more_score_0_100=${u.new_score}, less_score_0_100=${u.new_score}, score_grade=${grade}, score_sort_0_100=${u.new_score} WHERE batch_id=${batchId} AND matrix_id=${u.matrix_id}`.catch(() => {});
        }
      }
      finalSweep = { ok: true, rows_checked: allScored.length, groups_checked: sweepGroups.size, cross_tick_leaks_fixed: sweepUpdates.length };
    } catch (e) {
      finalSweep = { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId, hp_board_batch_id: hpBatchId,
    status, certification: "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS",
    continuation_required: isPartial, orchestrator_should_self_continue: isPartial,
    hp_rows_read: hpRows.length, score_rows_written: written, remaining_null_score_rows: stillRemaining,
    cleanup_old_batches: cleanupOldBatches, final_sweep: finalSweep,
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, ["HYPERDRIVE"]);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "score.hp_board_current.score_0_100 (write-back), score.scoring_engine_* (mirror)", upstream_reads: "score.hp_board_current (finalized HP + Confidence)", required_db_bindings_present: allTrue(db), db_bindings: db };
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
        const workPromise = runScoringEngine(pgClient, input);
        ctx.waitUntil(workPromise.then(() => {}, () => {}));
        const output = await workPromise;
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
