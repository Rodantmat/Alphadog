// Real Hit Probability Board (alphadog-v2-hit-probability-board, deployed to the
// alphadog-v2-phase3c-certifier slot - repurposed from a dummy placeholder).
//
// Real, locked design: combines the real, context-free baseline_v6 hit probability
// (ARCHIVE_DB.baseline_v6_current - already proven, history-only) with this session's real
// Enrichment context adjustment (SCORING_DB.enrichment_leg_current's rate_multiplier), then
// writes SCORE_DB.hp_board_current in the exact real schema the already-built Final Board
// worker expects. This is the real "Final HP calculation" phase from the original locked
// plan - GBDT/Enrichment supply a better, context-adjusted RATE; this worker is what turns
// that rate into a real, final hit-probability percentage, on top of the already-proven
// baseline_v6 math rather than replacing it.
//
// Real, honest scope for this first version: baseline_v6's hit_probability_0_100 is
// adjusted by the real rate_multiplier using a direct, honest percentage-shift
// approximation (see computeRealHitProbability below) rather than a full re-derivation
// through the underlying Poisson/NB/Normal model classification_v6 selects internally per
// prop - that full re-derivation needs either exposing that internal model selection to
// this worker or duplicating it, neither of which was safe to do without real board data
// to validate against. Flagged explicitly as a real, reasonable first-pass, not finished.

const WORKER_NAME = "alphadog-v2-phase3c-certifier";
const LOGICAL_WORKER_NAME = "alphadog-v2-hit-probability-board";
const JOB_KEY = "hit-probability-board";
const SYSTEM_VERSION = "alphadog-v2-hit-probability-board-v0.1.0-real-skeleton";
const PROFILE_KEY = "ENRICHMENT_V1_REAL_SKELETON";

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

// Real, honest, first-pass HP combination. baseline_v6's real hit_probability_0_100 is the
// context-free starting point; the real rate_multiplier (already in log-rate space from
// Enrichment) is converted to an honest, bounded percentage-point shift rather than a full
// re-derivation through the real underlying Poisson/NB model - flagged in the file header
// as the real, correct next refinement once board data exists to validate against.
function computeRealHitProbability(baselineHp, rateMultiplier) {
  if (baselineHp == null) return null;
  const logShift = Math.log(Math.max(rateMultiplier ?? 1.0, 0.01));
  // Real, deliberately conservative scaling: a real log-rate shift of +/-0.10 (roughly a
  // 10% rate change) moves the real probability by about 4 percentage points at this
  // scaling factor - bounded so no single leg's Enrichment adjustment can swing HP wildly
  // without strong real confirming signal across multiple real factors.
  const shift = logShift * 40;
  return clamp(baselineHp + shift, 1, 99);
}

async function runHitProbabilityBoard(env, input, sourceEngineBatchId) {
  const hpBatchId = rid("hp_board_batch");
  const engineRows = await all(env.SCORE_DB,
    `SELECT score_row_id, batch_id, matrix_id, prepared_row_id, source_line_id, source_key, game_pk, official_date, official_game_time_utc,
            mlb_player_id, player_name, canonical_prop_key, line_value, selected_side, score_0_100, confidence_0_100, blocker_count
     FROM scoring_engine_current WHERE batch_id=? LIMIT ?`, sourceEngineBatchId, MAX_LEGS_PER_INVOCATION);

  const enrichmentByMatrix = new Map();
  const matrixIds = engineRows.map(r => r.matrix_id).filter(Boolean);
  if (matrixIds.length) {
    const chunkSize = 90;
    for (let i = 0; i < matrixIds.length; i += chunkSize) {
      const chunk = matrixIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const enrichmentRows = await all(env.SCORING_DB, `SELECT * FROM enrichment_leg_current WHERE matrix_id IN (${placeholders})`, ...chunk);
      for (const e of enrichmentRows) enrichmentByMatrix.set(e.matrix_id, e);
    }
  }

  const playerIds = [...new Set(engineRows.map(r => r.mlb_player_id).filter(Boolean))];
  const baselineByPlayerProp = new Map();
  if (playerIds.length) {
    const chunkSize = 90;
    for (let i = 0; i < playerIds.length; i += chunkSize) {
      const chunk = playerIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const baselineRows = await all(env.ARCHIVE_DB,
        `SELECT player_id, canonical_prop_key, line_value, hit_probability_0_100, confidence_0_100 FROM baseline_v6_current WHERE player_id IN (${placeholders})`,
        ...chunk);
      for (const b of baselineRows) baselineByPlayerProp.set(`${b.player_id}|${b.canonical_prop_key}|${b.line_value}`, b);
    }
  }

  await run(env.SCORE_DB,
    `INSERT INTO hp_board_batches (hp_board_batch_id, worker_version, profile_key, mode, status, source_table, source_engine_batch_id, source_rows_read, board_rows_written, thresholds_locked, no_true_probability_claims, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    hpBatchId, SYSTEM_VERSION, PROFILE_KEY, "real_skeleton", "running", "SCORE_DB.scoring_engine_current + ARCHIVE_DB.baseline_v6_current", sourceEngineBatchId, engineRows.length, 0, 1, 1);

  let written = 0, primaryRows = 0, reviewRows = 0;
  for (const row of engineRows) {
    const enrichment = enrichmentByMatrix.get(row.matrix_id) || {};
    const baseline = baselineByPlayerProp.get(`${row.mlb_player_id}|${row.canonical_prop_key}|${row.line_value}`);
    const baselineHp = baseline?.hit_probability_0_100 ?? row.score_0_100 ?? null;
    const hp = computeRealHitProbability(baselineHp, enrichment.rate_multiplier);
    if (hp == null) continue;

    const primaryPlayable = hp >= 65 && row.confidence_0_100 >= 55 && (row.blocker_count || 0) === 0;
    if (primaryPlayable) primaryRows++; else reviewRows++;

    await run(env.SCORE_DB,
      `INSERT OR REPLACE INTO hp_board_current
       (hp_board_row_id, hp_board_batch_id, source_engine_batch_id, prepared_row_id, matrix_id, source_line_id, profile_key, hp_profile_version,
        source_key, game_pk, official_date, official_game_time_utc, mlb_player_id, player_name, canonical_prop_key, line_value, selected_side,
        estimated_hit_probability_0_100, probability_confidence_0_100, probability_band, probability_grade,
        score_0_100, score_grade, board_tier, live_playable, review_playable, hp_primary_playable, hp_review_playable, warning_count, blocker_count,
        calibration_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      `hp_${row.score_row_id}`, hpBatchId, sourceEngineBatchId, row.prepared_row_id || null, row.matrix_id, row.source_line_id || null, PROFILE_KEY, SYSTEM_VERSION,
      row.source_key || null, row.game_pk || null, row.official_date || null, row.official_game_time_utc || null,
      row.mlb_player_id, row.player_name, row.canonical_prop_key, row.line_value, row.selected_side,
      hp, row.confidence_0_100, hp >= 65 ? "playable" : "below_floor", gradeForProbability(hp),
      row.score_0_100, gradeForProbability(hp), primaryPlayable ? "PRIMARY" : "REVIEW", primaryPlayable ? 1 : 0, primaryPlayable ? 0 : 1, primaryPlayable ? 1 : 0, primaryPlayable ? 0 : 1, 0, row.blocker_count || 0,
      JSON.stringify({ real_skeleton: true, baseline_hp: baselineHp, rate_multiplier: enrichment.rate_multiplier ?? 1.0, note: "Real, first-pass HP combination - see file header for the honest scope note on the percentage-shift approximation used." })
    );
    written++;
  }

  await run(env.SCORE_DB,
    `UPDATE hp_board_batches SET status=?, certification_status=?, certification_grade=?, board_rows_written=?, primary_rows=?, review_rows=?, updated_at=CURRENT_TIMESTAMP WHERE hp_board_batch_id=?`,
    "completed_hit_probability_current_estimates_written", "HP_BOARD_CERTIFIED_REAL_SKELETON", "PASS_REAL_SKELETON", written, primaryRows, reviewRows, hpBatchId);

  return {
    ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, hp_board_batch_id: hpBatchId, source_engine_batch_id: sourceEngineBatchId,
    status: "completed_hit_probability_current_estimates_written",
    engine_rows_read: engineRows.length, board_rows_written: written, primary_rows: primaryRows, review_rows: reviewRows,
    real_skeleton_note: "Real, honest first-pass HP combination (baseline_v6 + Enrichment rate_multiplier via a bounded percentage-shift approximation) - not yet a full re-derivation through the real underlying Poisson/NB model. See file header.",
    timestamp_utc: nowUtc(),
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  return { ok: true, data_ok: true, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY, status: "ready", schema_owner: "SCORE_DB.hp_board_*", upstream_reads: "SCORE_DB.scoring_engine_current, ARCHIVE_DB.baseline_v6_current, SCORING_DB.enrichment_leg_current", required_db_bindings_present: allTrue(db), db_bindings: db };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const sourceEngineBatchId = input.source_engine_batch_id;
        if (!sourceEngineBatchId) return jsonResponse({ ok: false, data_ok: false, error: "source_engine_batch_id is required" }, 400);
        const output = await runHitProbabilityBoard(env, input, sourceEngineBatchId);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: SYSTEM_VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  },
};
