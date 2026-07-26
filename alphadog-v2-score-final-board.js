import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-score-final-board";
const VERSION = "alphadog-v2-score-final-board-v0.2.0-postgres-rewire";
const JOB_KEY = "score-final-board";
const PRIMARY_PROFILE = "STRICT_C_HP_FIRST_TRUST_V4_1";

function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false }); }
function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
function safeJson(v) { try { return JSON.stringify(v == null ? {} : v); } catch (_) { return "{}"; } }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function norm(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
function parseJsonObject(value) { try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" ? parsed : {}; } catch (_) { return {}; } }
function getPath(obj, path) { let cur = obj; for (const part of path) { if (cur == null || typeof cur !== "object") return null; cur = cur[part]; } return cur == null ? null : cur; }
const PRIMARY_THRESHOLD_SCORE = 88;
const PRIMARY_THRESHOLD_CONFIDENCE = 85;
const FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL = 7;
const FINAL_BOARD_DEDUPE_SOURCE_MARKET_CLUSTER = true;
const FINAL_BOARD_PROP_FLOOR_PER_PROP = 5;
const FINAL_BOARD_PROP_LINE_FLOOR_PER_PROP_LINE = 5;
const FINAL_BOARD_SOURCE_FLOOR_PER_APP = 20;
const FINAL_BOARD_VARIANT_FLOORS = { demon: 10, regular: 20, goblin: 20 };
const FINAL_BOARD_SIDE_FLOORS = { more: 20, less: 20 };
const FINAL_BOARD_QUOTA_RESERVE_MIN_HP = 70;
const FINAL_BOARD_QUOTA_RESERVE_MIN_SCORE = 50;

function directEvidenceInfoFromBoardRow(row) {
  const calc = parseJsonObject(row.calculation_json);
  if (calc && calc.direct_prop_evidence_bucket) {
    const rowCount = Math.max(0, Math.trunc(num(calc.direct_prop_evidence_row_count, 0)));
    const coverageCount = Math.max(0, Math.trunc(num(calc.market_coverage_row_count, 0)));
    return { rowCount, coverageCount, bucket: String(calc.direct_prop_evidence_bucket), present: rowCount > 0 || calc.direct_prop_evidence_present === true };
  }
  const details = parseJsonObject(row.details_json_snapshot || row.details_json);
  const propEvidence = getPath(details, ["market_context", "prop_evidence"]) || {};
  const rowCount = Math.max(0, Math.trunc(num(propEvidence.row_count, 0)));
  const coverageRows = getPath(details, ["market_context", "coverage_rows"]);
  const coverageCount = Array.isArray(coverageRows) ? coverageRows.length : 0;
  let bucket = "direct_prop_evidence_rows_unknown";
  if (rowCount <= 0) bucket = coverageCount > 0 ? "direct_prop_evidence_rows_0_with_coverage" : "direct_prop_evidence_rows_0_no_coverage";
  else if (rowCount === 1) bucket = "direct_prop_evidence_rows_1";
  else if (rowCount <= 4) bucket = "direct_prop_evidence_rows_2_to_4";
  else bucket = "direct_prop_evidence_rows_gte_5";
  return { rowCount, coverageCount, bucket, present: rowCount > 0 };
}

function gradeForScore(score) {
  if (score == null) return "BIN_0_NULL";
  if (score >= 90) return "BIN_ELITE";
  if (score >= 84) return "BIN_STRONG";
  if (score >= 76) return "BIN_QUALIFIED";
  if (score >= 70) return "BIN_ARCHIVE";
  return "BIN_REJECT";
}

async function ensureSchema(pgClient) {
  await pgClient`SELECT 1`;
}

async function latestCompletedEngineBatch(pgClient, requestedBatchId) {
  if (requestedBatchId) {
    const rows = await pgClient`SELECT batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, started_at, finished_at
      FROM score.scoring_engine_batches WHERE batch_id = ${requestedBatchId} LIMIT 1`;
    return rows[0] || null;
  }
  const rows = await pgClient`SELECT batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, started_at, finished_at
    FROM score.scoring_engine_batches
    WHERE status = 'completed_scoring_current_rows_written' AND certification = 'SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS' AND certification_grade LIKE 'PASS%'
    ORDER BY finished_at DESC NULLS LAST, started_at DESC LIMIT 1`;
  return rows[0] || null;
}
async function latestEngineBatchAnyStatus(pgClient) {
  const rows = await pgClient`SELECT batch_id, worker_version, status, certification, certification_grade, matrix_rows_read, score_rows_written, archive_rows_written, started_at, finished_at
    FROM score.scoring_engine_batches ORDER BY COALESCE(finished_at, started_at) DESC NULLS LAST, started_at DESC LIMIT 1`;
  return rows[0] || null;
}
function isCompletedCertifiedEngineBatch(engine) {
  return !!(engine && engine.status === 'completed_scoring_current_rows_written' && engine.certification === 'SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS' && String(engine.certification_grade || '').startsWith('PASS'));
}

async function writeIssue(pgClient, batchId, sourceBatchId, key, severity, count, payload) {
  await pgClient`INSERT INTO score.final_board_issues (issue_id, final_board_batch_id, source_simulation_batch_id, source_engine_batch_id, issue_key, severity, issue_count, issue_json, created_at)
    VALUES (${`issue|${batchId}|${key}`}, ${batchId}, NULL, ${sourceBatchId || null}, ${key}, ${severity}, ${Number(count || 0)}, ${safeJson(payload)}, now())
    ON CONFLICT (issue_id) DO UPDATE SET issue_count=EXCLUDED.issue_count, issue_json=EXCLUDED.issue_json`;
}

function rowId(batchId, rank, row) {
  const tier = row.board_tier || "PRIMARY";
  return `final|${batchId}|${row.profile_key || PRIMARY_PROFILE}|${tier}|${String(rank).padStart(4, "0")}|${row.matrix_id || row.prepared_row_id || row.source_line_id || rank}`;
}

async function resolveEngineProfileKey(pgClient, engineBatchId) {
  if (!engineBatchId) return PRIMARY_PROFILE;
  try {
    const rows = await pgClient`SELECT profile_key, COUNT(*) AS rows FROM score.scoring_engine_current
      WHERE batch_id = ${engineBatchId} AND profile_key IS NOT NULL AND TRIM(profile_key) <> ''
      GROUP BY profile_key ORDER BY rows DESC LIMIT 1`;
    return rows[0] && rows[0].profile_key ? String(rows[0].profile_key) : PRIMARY_PROFILE;
  } catch (_) {
    return PRIMARY_PROFILE;
  }
}

async function latestHpBoardBatchForEngine(pgClient, sourceEngineBatchId) {
  if (!sourceEngineBatchId) return null;
  const dataRows = await pgClient`SELECT hp_board_batch_id, source_hp_batch_id, source_engine_batch_id,
      COUNT(*) AS rows, SUM(CASE WHEN estimated_hit_probability_0_100 >= 60 AND COALESCE(blocker_count,0)=0 THEN 1 ELSE 0 END) AS eligible_rows, MAX(updated_at) AS max_created_at
    FROM score.hp_board_current WHERE source_engine_batch_id = ${sourceEngineBatchId}
    GROUP BY hp_board_batch_id, source_hp_batch_id, source_engine_batch_id ORDER BY MAX(updated_at) DESC LIMIT 1`;
  if (dataRows[0] && dataRows[0].hp_board_batch_id) return dataRows[0];
  const batchRows = await pgClient`SELECT hp_board_batch_id, source_hp_batch_id, source_engine_batch_id FROM score.hp_board_batches
    WHERE source_engine_batch_id = ${sourceEngineBatchId} AND status = 'completed_hit_probability_current_estimates_written'
    ORDER BY updated_at DESC LIMIT 1`;
  if (!batchRows[0] || !batchRows[0].hp_board_batch_id) return null;
  return { hp_board_batch_id: batchRows[0].hp_board_batch_id, source_hp_batch_id: batchRows[0].source_hp_batch_id, source_engine_batch_id: batchRows[0].source_engine_batch_id, rows: 0, eligible_rows: 0, max_created_at: null };
}

async function fetchHpFinalBoardCandidateRows(pgClient, sourceEngineBatchId, pageSize = 500) {
  const rows = [];
  const limit = Math.max(1, Math.min(1000, Math.trunc(pageSize)));
  let offset = 0;
  let pages = 0;
  const hpSource = await latestHpBoardBatchForEngine(pgClient, sourceEngineBatchId);
  if (!hpSource || !hpSource.hp_board_batch_id) return { rows, pages: 0, page_size: limit, pagination_mode: "hp_current_limit_offset", hp_source: null };

  while (true) {
    const page = await pgClient`
      SELECT
        h.hp_board_row_id, h.hp_board_batch_id, h.source_hp_batch_id, h.source_engine_batch_id,
        h.hp_rank, h.hp_lane, h.hp_lane_rank, h.hp_sort_0_100,
        h.estimated_hit_probability_0_100, h.probability_confidence_0_100, h.probability_band, h.probability_grade,
        h.empirical_hit_rate_0_1, h.reliability_0_1, h.sample_size, h.non_push_sample, h.hit_count, h.miss_count, h.push_count, h.push_risk_0_1,
        h.board_tier AS hp_source_board_tier,
        (CASE WHEN h.board_tier='PRIMARY' THEN 1 ELSE 0 END) AS hp_live_playable,
        (CASE WHEN h.board_tier='REVIEW' THEN 1 ELSE 0 END) AS hp_review_playable_source,
        (CASE WHEN h.board_tier='PRIMARY' THEN 1 ELSE 0 END) AS hp_primary_playable,
        (CASE WHEN h.board_tier='REVIEW' THEN 1 ELSE 0 END) AS hp_review_playable,
        0 AS hp_fade_flag,
        h.warning_count AS hp_warning_count, h.blocker_count AS hp_blocker_count,
        h.lane_reason AS hp_source_lane_reason, h.calibration_json AS hp_calibration_json, NULL AS hp_profile_key,
        h.source_key, h.game_pk, h.official_date, h.official_game_time_utc, h.prepared_row_id, h.matrix_id, h.source_line_id,
        h.mlb_player_id, h.player_name, h.canonical_prop_key, h.line_value, h.selected_side,
        h.score_0_100, h.score_grade, h.is_goblin, h.is_demon, h.more_only,
        e.profile_key, NULL AS source_scoring_worker_version, e.confidence_0_100, e.score_sort_0_100 AS engine_score_sort_0_100,
        e.factor_status, e.market_prop_context_status, e.daily_readiness_status, e.side_mode, e.odds_type, e.payout_variant, e.archive_eligible,
        e.calculation_json AS engine_calculation_json, e.matrix_payload_json_snapshot, e.details_json_snapshot,
        e.blocking_for_scoring, e.blocker_count AS engine_blocker_count, e.warning_count AS engine_warning_count
      FROM score.hp_board_current h
      LEFT JOIN score.scoring_engine_current e
        ON e.batch_id = h.source_engine_batch_id AND e.prepared_row_id = h.prepared_row_id AND e.source_line_id = h.source_line_id
      WHERE h.hp_board_batch_id = ${hpSource.hp_board_batch_id}
        AND h.source_engine_batch_id = ${sourceEngineBatchId}
        AND COALESCE(h.blocker_count, 0) = 0
        AND h.score_0_100 IS NOT NULL AND h.selected_side IS NOT NULL AND h.line_value IS NOT NULL
        AND h.player_name IS NOT NULL AND h.canonical_prop_key IS NOT NULL AND h.source_key IS NOT NULL AND h.mlb_player_id IS NOT NULL
      ORDER BY COALESCE(h.hp_sort_0_100, (0.72 * COALESCE(h.estimated_hit_probability_0_100,0)) + (0.28 * COALESCE(h.score_0_100,0))) DESC,
               h.estimated_hit_probability_0_100 DESC, h.score_0_100 DESC, h.probability_confidence_0_100 DESC, h.hp_rank ASC NULLS LAST, h.hp_board_row_id ASC
      LIMIT ${limit} OFFSET ${offset}`;
    pages += 1;
    if (!page.length) break;
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
    if (pages > 1000) throw new Error("score_final_board_hp_current_pagination_guard_exceeded");
  }
  return { rows, pages, page_size: limit, pagination_mode: "hp_current_limit_offset_all_nonblocked_hp_sort_for_quota_reserve", hp_source: hpSource };
}

function finalBoardStableTieHash(row) {
  const key = [row && row.prepared_row_id, row && row.source_line_id, row && row.source_key, row && row.player_name, row && row.canonical_prop_key, row && row.line_value, row && row.selected_side].map(v => String(v == null ? "" : v)).join("|");
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000000;
}
function finalBoardSortFromHp(row) {
  const hpSort = num(row && row.hp_sort_0_100, NaN);
  if (Number.isFinite(hpSort)) return Math.round((hpSort + finalBoardStableTieHash(row)) * 1000000) / 1000000;
  const hp = num(row.estimated_hit_probability_0_100, 0);
  const score = num(row.score_0_100, 0);
  return Math.round(((0.72 * hp + 0.28 * score) + finalBoardStableTieHash(row)) * 1000000) / 1000000;
}
function scoreEngineGradeRank(row) {
  const grade = norm(row.score_grade);
  if (grade === "bin_strong") return 4;
  if (grade === "bin_qualified") return 3;
  if (grade === "bin_archive") return 2;
  if (grade === "bin_reject") return 1;
  return 0;
}

function mapHpCurrentRowToFinalBoardRow(rawRow, activeProfileKey) {
  const hp = Math.round(clamp(num(rawRow.estimated_hit_probability_0_100, 0), 0, 100) * 10) / 10;
  const score = Math.round(clamp(num(rawRow.score_0_100, 0), 0, 100));
  const confidence = Math.round(clamp(num(rawRow.probability_confidence_0_100, rawRow.confidence_0_100 == null ? 0 : rawRow.confidence_0_100), 0, 100));
  const boardSort = finalBoardSortFromHp(rawRow);
  const primary = Number(rawRow.hp_primary_playable || 0) === 1;
  const boardTier = primary ? "PRIMARY" : "REVIEW";
  const engineCalc = parseJsonObject(rawRow.engine_calculation_json);
  const hpCal = parseJsonObject(rawRow.hp_calibration_json);
  const calc = {
    ...engineCalc,
    final_board_hp_first_source: {
      enabled: true, version: VERSION, source_table: "hp_board_current", hp_board_batch_id: rawRow.hp_board_batch_id || null,
      source_hp_batch_id: rawRow.source_hp_batch_id || null, source_engine_batch_id: rawRow.source_engine_batch_id || null,
      estimated_hit_probability_0_100: hp, probability_confidence_0_100: confidence, hp_lane: rawRow.hp_lane || null,
      hp_rank: rawRow.hp_rank == null ? null : Number(rawRow.hp_rank), hp_sort_0_100: rawRow.hp_sort_0_100 == null ? null : Number(rawRow.hp_sort_0_100),
      score_is_trust_score: true, score_0_100: score, board_sort_formula: "0.72*estimated_hit_probability_0_100 + 0.28*score_0_100", board_sort_0_100: boardSort,
      eligibility_rule: "Base visibility is HP >= 60, no HP blocker, visible in HP board. Quota reserve can include lower-HP rows as REVIEW only when needed to preserve prop/source/payout-variant representation; HP is never inflated.",
      score_policy: "Preserve Engine score as system-trust/support score; do not translate HP into score."
    }
  };
  const calibration = {
    version: VERSION, policy: "hp_first_final_board_from_hp_board_current", source_table: "score.hp_board_current",
    hp_board_batch_id: rawRow.hp_board_batch_id || null, source_engine_batch_id: rawRow.source_engine_batch_id || null, board_tier: boardTier,
    estimated_hit_probability_0_100: hp, probability_confidence_0_100: confidence, score_0_100: score, score_is_trust_score: true,
    score_grade: rawRow.score_grade || gradeForScore(score), board_sort_0_100: boardSort, hp_lane: rawRow.hp_lane || null,
    hp_rank: rawRow.hp_rank == null ? null : Number(rawRow.hp_rank), hp_source_board_tier: rawRow.hp_source_board_tier || null,
    hp_source_lane_reason: rawRow.hp_source_lane_reason || null, hp_calibration_json: hpCal,
    note: "Final Board consumes locked HP Board output. HP is the reality gate; score remains Engine trust/support score. Quota reserve rows preserve visibility only and stay REVIEW unless HP board marked them PRIMARY."
  };
  return {
    ...rawRow, profile_key: activeProfileKey || rawRow.profile_key || rawRow.hp_profile_key || PRIMARY_PROFILE, board_tier: boardTier,
    live_playable: primary ? 1 : 0, review_playable: primary ? 0 : 1, raw_score_0_100: score, raw_confidence_0_100: confidence,
    score_0_100: score, confidence_0_100: confidence, score_grade: rawRow.score_grade || gradeForScore(score), score_sort_0_100: boardSort,
    archive_eligible: 1, factor_status: rawRow.factor_status || null, market_prop_context_status: rawRow.market_prop_context_status || null,
    daily_readiness_status: rawRow.daily_readiness_status || null, side_mode: (hpCal && hpCal.side_mode) || rawRow.side_mode || null,
    is_goblin: Boolean(hpCal && hpCal.is_goblin) ? 1 : 0, is_demon: Boolean(hpCal && hpCal.is_demon) ? 1 : 0, more_only: Boolean(hpCal && hpCal.more_only) ? 1 : 0,
    odds_type: rawRow.odds_type || null, payout_variant: rawRow.payout_variant || null, calculation_json: safeJson(calc), calibration_json: safeJson(calibration),
    matrix_payload_json_snapshot: rawRow.matrix_payload_json_snapshot || null, details_json_snapshot: rawRow.details_json_snapshot || null,
    hp_source_board_tier: rawRow.hp_source_board_tier || null, hp_source_lane_reason: rawRow.hp_source_lane_reason || null,
    final_board_candidate_grade_rank: scoreEngineGradeRank(rawRow), source_candidate_tier: "HP_FIRST_ELIGIBLE"
  };
}

function annotateCorrelation(rows) {
  const counts = new Map();
  for (const r of rows) { const key = String(r.mlb_player_id || ""); if (!key) continue; counts.set(key, (counts.get(key) || 0) + 1); }
  for (const r of rows) { const count = counts.get(String(r.mlb_player_id || "")) || 0; r.cluster_player_count = count; r.correlation_risk_tier = count >= 3 ? "HIGH" : count === 2 ? "MED" : "LOW"; }
  return rows;
}

function finalBoardCandidateComparator(a, b) {
  const tierA = String(a.board_tier || "REVIEW") === "PRIMARY" ? 1 : 0;
  const tierB = String(b.board_tier || "REVIEW") === "PRIMARY" ? 1 : 0;
  const hpSortA = num(a.hp_sort_0_100, num(a.score_sort_0_100, finalBoardSortFromHp(a)));
  const hpSortB = num(b.hp_sort_0_100, num(b.score_sort_0_100, finalBoardSortFromHp(b)));
  return (tierB - tierA) || (hpSortB - hpSortA) ||
    (num(b.estimated_hit_probability_0_100, 0) - num(a.estimated_hit_probability_0_100, 0)) ||
    (num(b.score_0_100, 0) - num(a.score_0_100, 0)) ||
    (num(b.probability_confidence_0_100, num(b.confidence_0_100, 0)) - num(a.probability_confidence_0_100, num(a.confidence_0_100, 0))) ||
    (num(a.hp_rank, 999999) - num(b.hp_rank, 999999)) ||
    String(a.source_key || "").localeCompare(String(b.source_key || "")) ||
    String(a.prepared_row_id || a.source_line_id || "").localeCompare(String(b.prepared_row_id || b.source_line_id || ""));
}
function finalBoardDisplayComparator(a, b) {
  const tierA = String(a.board_tier || "REVIEW") === "PRIMARY" ? 0 : 1;
  const tierB = String(b.board_tier || "REVIEW") === "PRIMARY" ? 0 : 1;
  const hpSortA = num(a.hp_sort_0_100, num(a.score_sort_0_100, finalBoardSortFromHp(a)));
  const hpSortB = num(b.hp_sort_0_100, num(b.score_sort_0_100, finalBoardSortFromHp(b)));
  return (tierA - tierB) || (hpSortB - hpSortA) ||
    (num(b.estimated_hit_probability_0_100, 0) - num(a.estimated_hit_probability_0_100, 0)) ||
    (num(b.score_0_100, 0) - num(a.score_0_100, 0)) ||
    (num(b.probability_confidence_0_100, num(b.confidence_0_100, 0)) - num(a.probability_confidence_0_100, num(a.confidence_0_100, 0))) ||
    (num(a.hp_rank, 999999) - num(b.hp_rank, 999999)) ||
    String(a.player_name || "").localeCompare(String(b.player_name || "")) ||
    String(a.canonical_prop_key || "").localeCompare(String(b.canonical_prop_key || "")) ||
    String(a.source_key || "").localeCompare(String(b.source_key || "")) ||
    String(a.prepared_row_id || a.source_line_id || "").localeCompare(String(b.prepared_row_id || b.source_line_id || ""));
}

function sourceMarketClusterKey(row) {
  const source = String(row.source_key || "UNKNOWN_SOURCE").toLowerCase();
  const player = String(row.mlb_player_id || row.player_name || "UNKNOWN_PLAYER");
  const prop = String(row.canonical_prop_key || "UNKNOWN_PROP").toLowerCase();
  const line = row.line_value == null ? "NULL_LINE" : String(Number(row.line_value));
  const side = String(row.selected_side || "UNKNOWN_SIDE").toLowerCase();
  return `${source}|${player}|${prop}|${line}|${side}`;
}
function playerExposureKey(row) { return String(row.mlb_player_id || row.player_name || "UNKNOWN_PLAYER"); }

function appendFinalBoardPolicyAdjustment(row, adjustment) {
  let payload = {};
  try { payload = row.calibration_json ? JSON.parse(row.calibration_json) : {}; } catch (_) { payload = {}; }
  if (!Array.isArray(payload.final_board_adjustments)) payload.final_board_adjustments = [];
  payload.final_board_adjustments.push(adjustment);
  row.calibration_json = safeJson(payload);
  return row;
}

function dedupeSourceMarketClusters(rows) {
  const groups = new Map();
  for (const row of rows || []) { const key = sourceMarketClusterKey(row); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  const kept = [];
  const dropped = [];
  let duplicateClusterCount = 0;
  let crossSourceDuplicateClusterCount = 0;
  for (const [clusterKey, clusterRows] of groups.entries()) {
    const sorted = [...clusterRows].sort(finalBoardCandidateComparator);
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const sources = [...new Set(clusterRows.map(r => String(r.source_key || "unknown")))].sort();
    if (clusterRows.length > 1) duplicateClusterCount += 1;
    if (sources.length > 1) crossSourceDuplicateClusterCount += 1;
    if (winner) {
      appendFinalBoardPolicyAdjustment(winner, { key: "source_market_cluster_kept_best_row", cluster_key: clusterKey, cluster_rows_seen: clusterRows.length, cluster_sources: sources, dropped_cluster_rows: losers.length, policy: "Keep one Final Board row per app/source + player + prop + line + side; cross-app mirrors are preserved when present so app floors are not falsely cut." });
      kept.push(winner);
    }
    for (const loser of losers) {
      appendFinalBoardPolicyAdjustment(loser, { key: "source_market_cluster_dropped_duplicate", cluster_key: clusterKey, cluster_rows_seen: clusterRows.length, cluster_sources: sources, kept_prepared_row_id: winner && winner.prepared_row_id || null, kept_source_key: winner && winner.source_key || null, policy: "Dropped from Final Board only; source/prepared/scoring/HP rows remain untouched." });
      dropped.push(loser);
    }
  }
  return { rows: kept.sort(finalBoardDisplayComparator), droppedRows: dropped, rowsBeforeDedupe: rows.length, rowsAfterDedupe: kept.length, droppedBySourceMarketCluster: dropped.length, duplicateClusterCount, crossSourceDuplicateClusterCount };
}

function applyGlobalPlayerExposureCap(rows, maxRowsPerPlayer = FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL) {
  const byPlayer = new Map();
  for (const row of rows || []) { const key = playerExposureKey(row); if (!byPlayer.has(key)) byPlayer.set(key, []); byPlayer.get(key).push(row); }
  const kept = [];
  const overCapRows = [];
  let cappedPlayerCount = 0;
  for (const [playerKey, playerRows] of byPlayer.entries()) {
    const primary = playerRows.filter(r => String(r.board_tier || "REVIEW") === "PRIMARY").sort(finalBoardCandidateComparator);
    const review = playerRows.filter(r => String(r.board_tier || "REVIEW") !== "PRIMARY").sort(finalBoardCandidateComparator);
    const orderedForExposure = [...primary, ...review];
    if (orderedForExposure.length > maxRowsPerPlayer) cappedPlayerCount += 1;
    orderedForExposure.forEach((row, idx) => {
      const playerFinalBoardRank = idx + 1;
      const overSoftCap = idx >= maxRowsPerPlayer;
      appendFinalBoardPolicyAdjustment(row, { key: overSoftCap ? "player_global_exposure_soft_cap_overflow_kept" : "player_global_exposure_soft_cap_kept", player_key: playerKey, player_final_board_rank: playerFinalBoardRank, soft_cap_reference_rows_per_player: maxRowsPerPlayer, cut_applied: false, policy: "Exposure cap is only a late tiebreaker/ledger warning. Rows are not removed merely because one player has many good legs." });
      if (overSoftCap) overCapRows.push(row);
      kept.push(row);
    });
  }
  return { rows: kept.sort(finalBoardDisplayComparator), droppedRows: [], overCapRows, rowsBeforePlayerCap: rows.length, rowsAfterPlayerCap: kept.length, droppedByPlayerCap: 0, cappedPlayerCount, maxTotalRowsPerPlayer: maxRowsPerPlayer };
}

function finalBoardRowKey(row) {
  return String(row.prepared_row_id || row.source_line_id || row.matrix_id || row.hp_board_row_id || row.probability_row_id || [row.source_key, row.mlb_player_id, row.canonical_prop_key, row.line_value, row.selected_side].join('|'));
}
function finalBoardVariant(row) {
  const p = norm(row && row.payout_variant);
  const line = norm(row && row.source_line_id);
  const odds = norm(row && row.odds_type);
  if (p.includes('demon') || line.includes('demon') || odds.includes('demon')) return 'demon';
  if (p.includes('goblin') || line.includes('goblin') || odds.includes('goblin')) return 'goblin';
  return 'regular';
}
function forceReviewQuotaReserveRow(row, reasonKey) {
  row.board_tier = "REVIEW"; row.live_playable = 0; row.review_playable = 1; row.source_candidate_tier = "HP_FIRST_QUOTA_RESERVE_REVIEW";
  appendFinalBoardPolicyAdjustment(row, { key: "quota_reserve_review_included", quota_reason: reasonKey, cut_applied: false, hp_preserved: row.estimated_hit_probability_0_100 == null ? null : Number(row.estimated_hit_probability_0_100), policy: "Quota reserve preserves representation for prop/app/payout variant floors. It never inflates HP, never promotes to PRIMARY, and remains REVIEW unless independently qualified by HP board." });
  return row;
}

function addQuotaReserveRows(mappedRows, baseRows) {
  const selected = new Map();
  const addedRows = [];
  for (const row of baseRows || []) selected.set(finalBoardRowKey(row), row);
  const pool = (mappedRows || []).filter(r => !selected.has(finalBoardRowKey(r))).filter(r => num(r.estimated_hit_probability_0_100, 0) >= FINAL_BOARD_QUOTA_RESERVE_MIN_HP).filter(r => num(r.score_0_100, 0) >= FINAL_BOARD_QUOTA_RESERVE_MIN_SCORE).sort(finalBoardCandidateComparator);
  const addBest = (predicate, needed, reasonKey) => {
    let added = 0;
    if (needed <= 0) return 0;
    for (const row of pool) {
      if (added >= needed) break;
      const key = finalBoardRowKey(row);
      if (selected.has(key)) continue;
      if (!predicate(row)) continue;
      const reserve = forceReviewQuotaReserveRow(row, reasonKey);
      selected.set(key, reserve);
      addedRows.push(reserve);
      added += 1;
    }
    return added;
  };
  const diagnostics = [];
  const countSelected = (predicate) => Array.from(selected.values()).filter(predicate).length;
  const countAvailable = (predicate) => (mappedRows || []).filter(predicate).length;
  const props = [...new Set((mappedRows || []).map(r => String(r.canonical_prop_key || '')).filter(Boolean))].sort();
  for (const prop of props) {
    const predicate = r => String(r.canonical_prop_key || '') === prop;
    const available = countAvailable(predicate);
    const target = Math.min(FINAL_BOARD_PROP_FLOOR_PER_PROP, available);
    const before = countSelected(predicate);
    const added = addBest(predicate, Math.max(0, target - before), `prop_floor:${prop}`);
    diagnostics.push({ floor_type: 'prop', key: prop, target, available, before, added, after: countSelected(predicate) });
  }
  const sources = [...new Set((mappedRows || []).map(r => String(r.source_key || '')).filter(Boolean))].sort();
  for (const source of sources) {
    const predicate = r => String(r.source_key || '') === source;
    const available = countAvailable(predicate);
    const target = Math.min(FINAL_BOARD_SOURCE_FLOOR_PER_APP, available);
    const before = countSelected(predicate);
    const added = addBest(predicate, Math.max(0, target - before), `source_floor:${source}`);
    diagnostics.push({ floor_type: 'source', key: source, target, available, before, added, after: countSelected(predicate) });
  }
  for (const [variant, floor] of Object.entries(FINAL_BOARD_VARIANT_FLOORS)) {
    const predicate = r => finalBoardVariant(r) === variant;
    const available = countAvailable(predicate);
    const target = Math.min(floor, available);
    const before = countSelected(predicate);
    const added = addBest(predicate, Math.max(0, target - before), `variant_floor:${variant}`);
    diagnostics.push({ floor_type: 'variant', key: variant, target, available, before, added, after: countSelected(predicate) });
  }
  return { rows: Array.from(selected.values()).sort(finalBoardDisplayComparator), addedRows, rowsBeforeQuota: (baseRows || []).length, rowsAfterQuota: selected.size, quotaRowsAdded: addedRows.length, diagnostics };
}

function boardRowValues(batchId, sourceEngineBatchId, rank, row, id) {
  return {
    final_board_row_id: id, final_board_batch_id: batchId, source_simulation_batch_id: null, source_engine_batch_id: sourceEngineBatchId,
    profile_key: row.profile_key || PRIMARY_PROFILE, rank_order: rank, board_tier: row.board_tier || "PRIMARY", review_playable: Number(row.review_playable || 0),
    source_key: row.source_key || null, game_pk: row.game_pk || null, official_date: row.official_date || null, official_game_time_utc: row.official_game_time_utc || null,
    prepared_row_id: row.prepared_row_id || null, matrix_id: row.matrix_id || null, source_line_id: row.source_line_id || null,
    mlb_player_id: row.mlb_player_id || null, player_name: row.player_name || null, canonical_prop_key: row.canonical_prop_key || null,
    line_value: row.line_value == null ? null : Number(row.line_value), selected_side: row.selected_side || null,
    raw_score_0_100: row.raw_score_0_100 == null ? null : Number(row.raw_score_0_100), raw_confidence_0_100: row.raw_confidence_0_100 == null ? null : Number(row.raw_confidence_0_100),
    score_0_100: row.score_0_100 == null ? null : Number(row.score_0_100), confidence_0_100: row.confidence_0_100 == null ? null : Number(row.confidence_0_100),
    score_grade: row.score_grade || null, score_sort_0_100: row.score_sort_0_100 == null ? null : Number(row.score_sort_0_100), factor_status: row.factor_status || null,
    market_prop_context_status: row.market_prop_context_status || null, daily_readiness_status: row.daily_readiness_status || null, side_mode: row.side_mode || null,
    odds_type: row.odds_type || null, payout_variant: row.payout_variant || null, archive_eligible: Number(row.archive_eligible || 0), live_playable: Number(row.live_playable || 0),
    cluster_player_count: row.cluster_player_count == null ? null : Number(row.cluster_player_count), correlation_risk_tier: row.correlation_risk_tier || null,
    calibration_json: row.calibration_json || null, calculation_json: row.calculation_json || null, matrix_payload_json_snapshot: row.matrix_payload_json_snapshot || null,
    details_json_snapshot: row.details_json_snapshot || null, hp_board_batch_id: row.hp_board_batch_id || null, source_hp_batch_id: row.source_hp_batch_id || null,
    estimated_hit_probability_0_100: row.estimated_hit_probability_0_100 == null ? null : Number(row.estimated_hit_probability_0_100),
    probability_confidence_0_100: row.probability_confidence_0_100 == null ? null : Number(row.probability_confidence_0_100),
    probability_band: row.probability_band || null, probability_grade: row.probability_grade || null, hp_lane: row.hp_lane || null,
    hp_rank: row.hp_rank == null ? null : Number(row.hp_rank), hp_sort_0_100: row.hp_sort_0_100 == null ? null : Number(row.hp_sort_0_100),
    sample_size: row.sample_size == null ? null : Number(row.sample_size), non_push_sample: row.non_push_sample == null ? null : Number(row.non_push_sample),
    hit_count: row.hit_count == null ? null : Number(row.hit_count), miss_count: row.miss_count == null ? null : Number(row.miss_count), push_count: row.push_count == null ? null : Number(row.push_count),
    hp_source_board_tier: row.hp_source_board_tier || null, hp_source_lane_reason: row.hp_source_lane_reason || null,
    is_goblin: Number(row.is_goblin || 0), is_demon: Number(row.is_demon || 0), is_more_only: Number(row.more_only || 0)
  };
}

const BOARD_ROW_COLS = ["final_board_row_id", "final_board_batch_id", "source_simulation_batch_id", "source_engine_batch_id", "profile_key", "rank_order", "board_tier", "review_playable", "source_key", "game_pk", "official_date", "official_game_time_utc", "prepared_row_id", "matrix_id", "source_line_id", "mlb_player_id", "player_name", "canonical_prop_key", "line_value", "selected_side", "raw_score_0_100", "raw_confidence_0_100", "score_0_100", "confidence_0_100", "score_grade", "score_sort_0_100", "factor_status", "market_prop_context_status", "daily_readiness_status", "side_mode", "odds_type", "payout_variant", "archive_eligible", "live_playable", "cluster_player_count", "correlation_risk_tier", "calibration_json", "calculation_json", "matrix_payload_json_snapshot", "details_json_snapshot", "hp_board_batch_id", "source_hp_batch_id", "estimated_hit_probability_0_100", "probability_confidence_0_100", "probability_band", "probability_grade", "hp_lane", "hp_rank", "hp_sort_0_100", "sample_size", "non_push_sample", "hit_count", "miss_count", "push_count", "hp_source_board_tier", "hp_source_lane_reason", "is_goblin", "is_demon", "is_more_only"];

async function insertBoardRowsBatched(pgClient, table, batchId, sourceEngineBatchId, rows, chunkSize = 150) {
  let rank = 0;
  let written = 0;
  const updateSet = BOARD_ROW_COLS.filter(c => c !== "final_board_row_id" && c !== "final_board_batch_id" && c !== "source_simulation_batch_id")
    .map(c => `${c}=EXCLUDED.${c}`).join(", ");
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.map(row => { rank += 1; const id = rowId(batchId, rank, row); return boardRowValues(batchId, sourceEngineBatchId, rank, row, id); });
    await pgClient`INSERT INTO ${pgClient.unsafe(table)} ${pgClient(values, ...BOARD_ROW_COLS)}
      ON CONFLICT (final_board_row_id) DO UPDATE SET ${pgClient.unsafe(updateSet)}, updated_at=now()`;
    written += chunk.length;
  }
  return written;
}

async function copyHistoryToCurrent(pgClient, batchId) {
  const cols = BOARD_ROW_COLS.join(", ");
  await pgClient`DELETE FROM score.final_board_current`;
  await pgClient`INSERT INTO score.final_board_current (${pgClient.unsafe(cols)})
    SELECT ${pgClient.unsafe(cols)} FROM score.final_board_history WHERE final_board_batch_id = ${batchId}
    ON CONFLICT (final_board_row_id) DO NOTHING`;
  return { ok: true };
}

async function reconcileStaleRunningFinalBoard(pgClient, input, engine, started) {
  if (!engine || !engine.batch_id) return null;
  const staleRows = await pgClient`SELECT final_board_batch_id, worker_version, source_engine_batch_id, source_scoring_worker_version, profile_key, started_at
    FROM score.final_board_batches WHERE source_engine_batch_id = ${engine.batch_id} AND status = 'running' AND finished_at IS NULL
    ORDER BY started_at DESC LIMIT 1`;
  const stale = staleRows[0];
  if (!stale || !stale.final_board_batch_id) return null;
  const staleBatchId = stale.final_board_batch_id;
  const historyRows = await pgClient`SELECT COUNT(*) AS rows FROM score.final_board_history WHERE final_board_batch_id = ${staleBatchId}`;
  const historyCount = Number(historyRows[0] && historyRows[0].rows || 0);
  if (historyCount <= 0) return null;
  await copyHistoryToCurrent(pgClient, staleBatchId);
  const currentRows = await pgClient`SELECT COUNT(*) AS rows FROM score.final_board_current WHERE final_board_batch_id = ${staleBatchId}`;
  const currentCount = Number(currentRows[0] && currentRows[0].rows || 0);
  if (currentCount <= 0 || currentCount !== historyCount) return null;
  const byTierSource = await pgClient`SELECT board_tier, review_playable, source_key, COUNT(*) AS rows, COUNT(DISTINCT canonical_prop_key) AS prop_families, COUNT(DISTINCT mlb_player_id) AS players, MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score, AVG(score_0_100) AS avg_score
    FROM score.final_board_current WHERE final_board_batch_id = ${staleBatchId} GROUP BY board_tier, review_playable, source_key ORDER BY board_tier, rows DESC`;
  const output = {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: input.run_id || null,
    status: "completed_final_board_current_reconciled_after_timeout", certification: "SCORE_FINAL_BOARD_CERTIFIED_CURRENT_RECONCILED_AFTER_TIMEOUT", certification_grade: "PASS_WITH_REVIEW_WARNINGS",
    final_board_batch_id: staleBatchId, source_engine_batch_id: engine.batch_id, source_scoring_worker_version: engine.worker_version, profile_key: PRIMARY_PROFILE,
    matrix_rows_read: Number(engine.matrix_rows_read || 0), live_rows_read: currentCount, final_rows_written: historyCount, current_rows_written: currentCount,
    stale_running_batch_reconciled: true, copied_history_to_current: true, by_tier_source: byTierSource, no_external_calls: true, no_source_board_mutation: true, no_simulation_shadow_mutation: true,
    elapsed_ms: Date.now() - started, timestamp_utc: nowUtc()
  };
  await writeIssue(pgClient, staleBatchId, engine.batch_id, "SERVICE_BINDING_TIMEOUT_RECONCILED", "WARNING", 1, { note: "Prior invocation wrote history/current evidence but timed out before finalizing the batch row. Rebuilt current from history, verified invariants, and finalized the batch." });
  await pgClient`UPDATE score.final_board_batches SET worker_version=${VERSION}, source_simulation_batch_id=NULL, source_engine_batch_id=${engine.batch_id}, source_scoring_worker_version=${engine.worker_version}, profile_key=${PRIMARY_PROFILE}, status=${output.status}, certification=${output.certification}, certification_grade=${output.certification_grade}, matrix_rows_read=${output.matrix_rows_read}, live_rows_read=${output.live_rows_read}, final_rows_written=${output.final_rows_written}, current_rows_written=${output.current_rows_written}, finished_at=now(), output_json=${safeJson(output)} WHERE final_board_batch_id=${staleBatchId}`;
  return output;
}

async function generateFinalBoard(pgClient, input) {
  await ensureSchema(pgClient);
  const started = Date.now();
  const batchId = rid("score_final_board_batch");
  const requestId = input.request_id || null;
  const runId = input.run_id || null;
  const requestedEngineBatchId = input.source_engine_batch_id || input.scoring_engine_batch_id || null;

  if (input.requires_real_engine_scoring_batch === true && !requestedEngineBatchId) {
    await pgClient`INSERT INTO score.final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
      VALUES (${batchId}, ${VERSION}, ${JOB_KEY}, NULL, NULL, NULL, ${PRIMARY_PROFILE}, 'blocked_missing_explicit_engine_batch', 'SCORE_FINAL_BOARD_BLOCKED_MISSING_EXPLICIT_ENGINE_BATCH', 'BLOCKED', now())`;
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "blocked_missing_explicit_engine_batch", certification: "SCORE_FINAL_BOARD_BLOCKED_MISSING_EXPLICIT_ENGINE_BATCH", certification_grade: "BLOCKED", final_board_batch_id: batchId, reason: "Market Full must pass the same-chain terminal scoring_engine batch_id; Final Board is not allowed to fall back to an old completed batch." };
    await writeIssue(pgClient, batchId, null, "MISSING_EXPLICIT_ENGINE_BATCH", "BLOCKER", 1, output);
    await pgClient`UPDATE score.final_board_batches SET output_json=${safeJson(output)}, finished_at=now() WHERE final_board_batch_id=${batchId}`;
    return output;
  }

  const newestEngine = requestedEngineBatchId ? await latestCompletedEngineBatch(pgClient, requestedEngineBatchId) : await latestEngineBatchAnyStatus(pgClient);
  const engine = requestedEngineBatchId ? newestEngine : (isCompletedCertifiedEngineBatch(newestEngine) ? newestEngine : await latestCompletedEngineBatch(pgClient, null));

  if (!isCompletedCertifiedEngineBatch(newestEngine)) {
    await pgClient`INSERT INTO score.final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
      VALUES (${batchId}, ${VERSION}, ${JOB_KEY}, NULL, ${newestEngine && newestEngine.batch_id || null}, ${newestEngine && newestEngine.worker_version || null}, ${PRIMARY_PROFILE}, 'blocked_latest_engine_batch_not_terminal', 'SCORE_FINAL_BOARD_BLOCKED_LATEST_ENGINE_BATCH_NOT_TERMINAL', 'BLOCKED', now())`;
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "blocked_latest_engine_batch_not_terminal", certification: "SCORE_FINAL_BOARD_BLOCKED_LATEST_ENGINE_BATCH_NOT_TERMINAL", certification_grade: "BLOCKED", final_board_batch_id: batchId, requested_engine_batch_id: requestedEngineBatchId, latest_engine_batch_id: newestEngine && newestEngine.batch_id || null, latest_engine_status: newestEngine && newestEngine.status || null, latest_engine_certification: newestEngine && newestEngine.certification || null, latest_engine_score_rows_written: newestEngine && newestEngine.score_rows_written || 0, reason: "The newest Scoring Engine batch is not terminal/certified. Final Board refused to fall back to an older completed scoring batch." };
    await writeIssue(pgClient, batchId, newestEngine && newestEngine.batch_id || null, "LATEST_ENGINE_BATCH_NOT_TERMINAL", "BLOCKER", 1, output);
    await pgClient`UPDATE score.final_board_batches SET status=${output.status}, certification=${output.certification}, certification_grade=${output.certification_grade}, finished_at=now(), output_json=${safeJson(output)} WHERE final_board_batch_id=${batchId}`;
    return output;
  }

  if (!engine || engine.status !== "completed_scoring_current_rows_written" || engine.certification !== "SCORING_ENGINE_CURRENT_CERTIFIED_SCORED_ROWS") {
    await pgClient`INSERT INTO score.final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
      VALUES (${batchId}, ${VERSION}, ${JOB_KEY}, NULL, ${engine && engine.batch_id || null}, ${engine && engine.worker_version || null}, ${PRIMARY_PROFILE}, 'running', 'SCORE_FINAL_BOARD_STARTED', 'RUNNING', now())`;
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "blocked_no_completed_engine_scoring_batch", certification: "SCORE_FINAL_BOARD_BLOCKED_NO_COMPLETED_ENGINE_SCORING", certification_grade: "BLOCKED", final_board_batch_id: batchId, requested_engine_batch_id: requestedEngineBatchId };
    await writeIssue(pgClient, batchId, engine && engine.batch_id || null, "NO_COMPLETED_ENGINE_SCORING_BATCH", "BLOCKER", 1, output);
    await pgClient`UPDATE score.final_board_batches SET status=${output.status}, certification=${output.certification}, certification_grade=${output.certification_grade}, finished_at=now(), output_json=${safeJson(output)} WHERE final_board_batch_id=${batchId}`;
    return output;
  }

  const reconciled = await reconcileStaleRunningFinalBoard(pgClient, input, engine, started);
  if (reconciled) return reconciled;

  const simBatchId = engine.batch_id;
  const activeProfileKey = await resolveEngineProfileKey(pgClient, simBatchId);

  await pgClient`INSERT INTO score.final_board_batches (final_board_batch_id, worker_version, job_key, source_simulation_batch_id, source_engine_batch_id, source_scoring_worker_version, profile_key, status, certification, certification_grade, started_at)
    VALUES (${batchId}, ${VERSION}, ${JOB_KEY}, NULL, ${simBatchId}, ${engine.worker_version || null}, ${activeProfileKey}, 'running', 'SCORE_FINAL_BOARD_STARTED', 'RUNNING', now())`;

  const hpRead = await fetchHpFinalBoardCandidateRows(pgClient, simBatchId, 500);
  const hpSource = hpRead.hp_source;
  if (!hpSource || !hpSource.hp_board_batch_id) {
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "blocked_no_hp_board_for_engine_batch", certification: "SCORE_FINAL_BOARD_BLOCKED_NO_HP_BOARD_FOR_ENGINE_BATCH", certification_grade: "BLOCKED", final_board_batch_id: batchId, source_engine_batch_id: simBatchId, reason: "Final Board requires the locked HP Board output for the same completed Engine batch. Run Hit Probability after Engine before Final Board." };
    await writeIssue(pgClient, batchId, simBatchId, "NO_HP_BOARD_FOR_ENGINE_BATCH", "BLOCKER", 1, output);
    await pgClient`UPDATE score.final_board_batches SET status=${output.status}, certification=${output.certification}, certification_grade=${output.certification_grade}, finished_at=now(), output_json=${safeJson(output)} WHERE final_board_batch_id=${batchId}`;
    return output;
  }

  const hpAllRaw = hpRead.rows;
  const mappedRows = annotateCorrelation(hpAllRaw.map(r => mapHpCurrentRowToFinalBoardRow(r, activeProfileKey)));
  const baseVisibleRows = mappedRows.filter(r =>
    num(r.estimated_hit_probability_0_100, 0) >= 60
    && (Number(r.hp_review_playable || 0) === 1 || Number(r.hp_primary_playable || 0) === 1 || String(r.board_tier || "") === "PRIMARY" || String(r.board_tier || "") === "REVIEW")
  ).sort(finalBoardDisplayComparator);
  const quotaReserveResult = addQuotaReserveRows(mappedRows, baseVisibleRows);
  const sourceMarketClusterResult = dedupeSourceMarketClusters(quotaReserveResult.rows);
  const playerExposureCapResult = applyGlobalPlayerExposureCap(sourceMarketClusterResult.rows, FINAL_BOARD_MAX_ROWS_PER_PLAYER_TOTAL);
  const rows = playerExposureCapResult.rows;
  const primaryRows = rows.filter(r => r.board_tier === "PRIMARY");
  const reviewRows = rows.filter(r => r.board_tier === "REVIEW");

  if (!rows.length) {
    await pgClient`DELETE FROM score.final_board_current`;
    const output = { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "completed_no_final_rows_after_calibration", certification: "SCORE_FINAL_BOARD_CERTIFIED_NO_ELIGIBLE_ROWS", certification_grade: "NO_DATA_PASS", final_board_batch_id: batchId, source_engine_batch_id: simBatchId, profile_key: activeProfileKey, primary_rows_after_calibration: primaryRows.length, review_rows_after_calibration: reviewRows.length, reason: "No eligible engine/HP rows to place on the final board (e.g. no games scheduled today)." };
    await pgClient`UPDATE score.final_board_batches SET status=${output.status}, certification=${output.certification}, certification_grade=${output.certification_grade}, finished_at=now(), output_json=${safeJson(output)} WHERE final_board_batch_id=${batchId}`;
    return output;
  }

  await insertBoardRowsBatched(pgClient, "score.final_board_history", batchId, simBatchId, rows, 150);
  await pgClient`DELETE FROM score.final_board_current`;
  await insertBoardRowsBatched(pgClient, "score.final_board_current", batchId, simBatchId, rows, 150);

  const byTierSource = await pgClient`SELECT board_tier, review_playable, source_key, COUNT(*) AS rows, COUNT(DISTINCT canonical_prop_key) AS prop_families, COUNT(DISTINCT mlb_player_id) AS players, MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score, AVG(score_0_100) AS avg_score
    FROM score.final_board_current WHERE final_board_batch_id = ${batchId} GROUP BY board_tier, review_playable, source_key ORDER BY board_tier, rows DESC`;
  const bySourcePropSide = await pgClient`SELECT board_tier, source_key, canonical_prop_key, selected_side, COUNT(*) AS rows, MIN(score_0_100) AS min_score, MAX(score_0_100) AS max_score, AVG(score_0_100) AS avg_score
    FROM score.final_board_current WHERE final_board_batch_id = ${batchId} GROUP BY board_tier, source_key, canonical_prop_key, selected_side ORDER BY board_tier, rows DESC, max_score DESC`;

  const dupCheck = await pgClient`SELECT COUNT(*) AS duplicate_source_market_clusters FROM (
      SELECT source_key, mlb_player_id, canonical_prop_key, line_value, selected_side, COUNT(*) AS rows
      FROM score.final_board_current WHERE final_board_batch_id = ${batchId}
      GROUP BY source_key, mlb_player_id, canonical_prop_key, line_value, selected_side HAVING COUNT(*) > 1
    ) t`;
  const duplicateSourceMarketClusters = Number(dupCheck[0] && dupCheck[0].duplicate_source_market_clusters || 0);
  if (duplicateSourceMarketClusters > 0) {
    const output = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId, status: "blocked_source_market_cluster_dedupe_failure", certification: "SCORE_FINAL_BOARD_BLOCKED_SOURCE_MARKET_CLUSTER_DEDUPE_FAILURE", certification_grade: "BLOCKED", final_board_batch_id: batchId, source_engine_batch_id: simBatchId, duplicate_source_market_clusters: duplicateSourceMarketClusters };
    await writeIssue(pgClient, batchId, simBatchId, "SOURCE_MARKET_CLUSTER_DEDUPE_FAILURE", "BLOCKER", duplicateSourceMarketClusters, output);
    await pgClient`UPDATE score.final_board_batches SET status=${output.status}, certification=${output.certification}, certification_grade=${output.certification_grade}, finished_at=now(), output_json=${safeJson(output)} WHERE final_board_batch_id=${batchId}`;
    return output;
  }

  const output = {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, run_id: runId,
    status: "completed_final_board_current_replaced_from_hp_current", certification: "SCORE_FINAL_BOARD_CERTIFIED_CURRENT_REPLACED_FROM_HP_CURRENT", certification_grade: "PASS_WITH_REVIEW_WARNINGS",
    final_board_batch_id: batchId, source_engine_batch_id: simBatchId, source_scoring_worker_version: engine.worker_version,
    source_hp_board_batch_id: hpSource && hpSource.hp_board_batch_id || null, source_hp_batch_id: hpSource && hpSource.source_hp_batch_id || null,
    hp_current_rows_read: hpAllRaw.length, hp_current_read_pages: hpRead.pages, hp_current_page_size: hpRead.page_size, hp_current_pagination_mode: hpRead.pagination_mode,
    hp_first_final_board_source_active: true, profile_key: activeProfileKey, matrix_rows_read: Number(engine.matrix_rows_read || 0),
    hp_source_rows_read: hpAllRaw.length, base_visible_rows_before_quota: baseVisibleRows.length,
    quota_reserve_active: true, quota_reserve_min_hp: FINAL_BOARD_QUOTA_RESERVE_MIN_HP, quota_reserve_min_score: FINAL_BOARD_QUOTA_RESERVE_MIN_SCORE,
    quota_reserve_rows_added: quotaReserveResult.quotaRowsAdded, quota_reserve_diagnostics: quotaReserveResult.diagnostics,
    source_market_cluster_dedupe_active: FINAL_BOARD_DEDUPE_SOURCE_MARKET_CLUSTER, source_market_cluster_rows_before_dedupe: sourceMarketClusterResult.rowsBeforeDedupe,
    source_market_cluster_rows_after_dedupe: sourceMarketClusterResult.rowsAfterDedupe, source_market_cluster_dropped_rows: sourceMarketClusterResult.droppedBySourceMarketCluster,
    player_global_exposure_cap_active: false, player_global_exposure_soft_tiebreaker_active: true,
    player_global_exposure_cap_max_total_rows_per_player: playerExposureCapResult.maxTotalRowsPerPlayer,
    primary_rows_written: primaryRows.length, review_rows_written: reviewRows.length,
    live_rows_read: primaryRows.length, final_rows_written: rows.length, current_rows_written: rows.length,
    table_for_final_ui: "score.final_board_current", history_table: "score.final_board_history",
    no_external_calls: true, no_source_board_mutation: true, no_simulation_shadow_mutation: true,
    primary_threshold_score: PRIMARY_THRESHOLD_SCORE, primary_threshold_confidence: PRIMARY_THRESHOLD_CONFIDENCE,
    by_tier_source: byTierSource, by_source_prop_side: bySourcePropSide, elapsed_ms: Date.now() - started, timestamp_utc: nowUtc()
  };

  await writeIssue(pgClient, batchId, simBatchId, "REVIEW_TIER_INCLUDED", "WARNING", reviewRows.length, { note: "Review tier rows are intentionally included as safe soft rows.", review_rows_written: reviewRows.length });
  await writeIssue(pgClient, batchId, simBatchId, "HP_FIRST_SOURCE_INCLUDED", "INFO", rows.length, { note: "Final Board writes base HP >= 60 rows from hp_board_current, then adds REVIEW-only quota reserve rows when needed.", hp_board_batch_id: hpSource && hpSource.hp_board_batch_id || null, hp_rows_read: hpAllRaw.length });
  await writeIssue(pgClient, batchId, simBatchId, "SOURCE_MARKET_CLUSTER_DEDUPE_APPLIED", sourceMarketClusterResult.droppedBySourceMarketCluster ? "WARNING" : "INFO", sourceMarketClusterResult.droppedBySourceMarketCluster, { rows_before_dedupe: sourceMarketClusterResult.rowsBeforeDedupe, rows_after_dedupe: sourceMarketClusterResult.rowsAfterDedupe });
  await writeIssue(pgClient, batchId, simBatchId, "HP_FIRST_SOURCE_LOCKED", "INFO", rows.length, { note: "Final Board consumes locked hp_board_current directly, applies same-app dedupe, adds quota reserve review rows.", hp_board_batch_id: hpSource && hpSource.hp_board_batch_id || null, final_rows_written: rows.length, primary_rows_written: primaryRows.length, review_rows_written: reviewRows.length });

  await pgClient`UPDATE score.final_board_batches SET status=${output.status}, certification=${output.certification}, certification_grade=${output.certification_grade}, matrix_rows_read=${output.matrix_rows_read}, live_rows_read=${output.live_rows_read}, final_rows_written=${output.final_rows_written}, current_rows_written=${output.current_rows_written}, finished_at=now(), output_json=${safeJson(output)} WHERE final_board_batch_id=${batchId}`;
  return output;
}

function baseIdentity() {
  return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "READY", timestamp_utc: nowUtc(), purpose: "Generate score.final_board_current from locked score.hp_board_current for the latest completed real Scoring Engine batch. HP is the reality gate; Engine score is preserved as trust/support score." };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(baseIdentity());
    if (method === "POST" && path === "/diagnostic") {
      return jsonResponse({ ...baseIdentity(), route: "/diagnostic", bindings: { HYPERDRIVE: !!(env && env.HYPERDRIVE) }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const pgClient = pg(env);
      try {
        const output = await generateFinalBoard(pgClient, input || {});
        output.request_id = output.request_id || input.request_id || null;
        output.run_id = output.run_id || input.run_id || null;
        return jsonResponse(output, output.ok !== false ? 200 : 500);
      } catch (err) {
        const failOutput = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: input.run_id || null, status: "score_final_board_exception", certification: "SCORE_FINAL_BOARD_EXCEPTION", certification_grade: "FAILED", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc() };
        try {
          await pgClient`UPDATE score.final_board_batches SET status='failed_runtime_exception', certification='SCORE_FINAL_BOARD_EXCEPTION', certification_grade='FAILED', finished_at=COALESCE(finished_at, now()), output_json=${safeJson(failOutput)}
            WHERE final_board_batch_id IN (SELECT final_board_batch_id FROM score.final_board_batches WHERE status='running' AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1)`.catch(() => {});
        } catch (_) {}
        return jsonResponse(failOutput, 500);
      } finally {
        await pgClient.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
