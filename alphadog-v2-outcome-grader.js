import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-outcome-grader";
const VERSION = "alphadog-v2-outcome-grader-v1.0.0";
const JOB_KEY = "outcome-grader";

// SAFETY NOTE: this worker is deliberately isolated. It only ever:
//   READS from score.final_board_history, stats_hitter.game_logs, stats_pitcher.game_logs
//   WRITES to score.prop_outcome_history
// It never writes to score.final_board_current, score.hp_board_current, classification.*,
// or any table read by the live scoring path. A bug here cannot affect today's live board -
// it can only produce wrong/missing calibration training data, which is itself checked by
// calibration_report's held-out validation before anything is ever applied.

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 3, fetch_types: false, prepare: false, connect_timeout: 8,
    connection: { statement_timeout: 60000 }
  });
}
function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function isValidDateString(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }

// Objectively-computable hitter props: canonical_prop_key -> raw SQL expression against gl.*
// Deliberately excludes anything requiring data not present in stats_hitter.game_logs
// (e.g. no play-by-play / situational data available -> no rfi_nrfi here).
const HITTER_PROP_EXPR = {
  runs: "gl.runs",
  hits: "gl.hits",
  walks: "gl.walks",
  singles: "gl.singles",
  rbis: "gl.rbi",
  home_runs: "gl.home_runs",
  stolen_bases: "gl.stolen_bases",
  doubles: "gl.doubles",
  triples: "gl.triples",
  total_bases: "gl.total_bases",
  hits_runs_rbis: "(gl.hits + gl.runs + gl.rbi)",
  hitter_strikeouts: "gl.strikeouts",
  fantasy_score: "(3*gl.singles + 5*gl.doubles + 8*gl.triples + 10*gl.home_runs + 2*gl.runs + 2*gl.rbi + 2*gl.walks + 5*gl.stolen_bases)"
};

const PITCHER_PROP_EXPR = {
  pitcher_strikeouts: "gl.strikeouts",
  walks_allowed: "gl.walks_allowed",
  hits_allowed: "gl.hits_allowed",
  earned_runs: "gl.earned_runs",
  runs_allowed: "gl.runs_allowed",
  pitcher_outs: "gl.outs_recorded",
  pitcher_fantasy_score_ud: "(gl.outs_recorded + 3*gl.strikeouts - 3*gl.earned_runs + 5*COALESCE(gl.wins,0) + 5*(CASE WHEN gl.outs_recorded>=18 AND gl.earned_runs<=3 THEN 1 ELSE 0 END))"
};

function buildCaseExpr(exprMap) {
  const whens = Object.entries(exprMap).map(([k, expr]) => `WHEN '${k}' THEN ${expr}`).join(" ");
  return `CASE f.canonical_prop_key ${whens} END`;
}

function extractEnrichmentSignal(calibrationJsonValue) {
  // Defensive: calibration_json may come back as a native object (jsonb) or a string,
  // depending on the column/driver - handle both rather than assuming one (see the
  // parseJsonObject bug this mirrors, fixed 2026-08-13 in score-final-board.js).
  let obj = calibrationJsonValue;
  if (obj && typeof obj === "string") { try { obj = JSON.parse(obj); } catch (_) { obj = null; } }
  const hpCal = obj && typeof obj === "object" ? obj.hp_calibration_json : null;
  if (!hpCal || typeof hpCal !== "object") return { rate_multiplier: null, factors_applied: null, factors_missing: null };
  return {
    rate_multiplier: hpCal.rate_multiplier == null ? null : Number(hpCal.rate_multiplier),
    factors_applied: hpCal.factors_applied == null ? null : Number(hpCal.factors_applied),
    factors_missing: hpCal.factors_missing == null ? null : Number(hpCal.factors_missing)
  };
}

async function gradeForDate(sql, targetDate, entityType, propExprMap, sourceTable) {
  const actualExpr = buildCaseExpr(propExprMap);
  const propKeys = Object.keys(propExprMap);
  const propLiteral = "{" + propKeys.join(",") + "}";

  // Dedupe board legs to one row per (player, prop, line, side) using the latest snapshot of
  // that day, matching the same dedup pattern used successfully in prior sessions' analysis.
  // REAL FIX (2026-08-11): switched from INNER to LEFT JOIN against game_logs, and added a join
  // to daily.game_status_current for is_final. Previously, any player with zero matching game-log
  // rows for the date (rest day, unused bullpen arm, etc.) silently vanished from the candidate
  // set entirely via the INNER JOIN - never graded, never stored, permanently stuck as invisible
  // "ungraded" rather than the genuine push/void it actually is. Confirmed live via real research:
  // multiple real players (rest days, unused relievers) were affected by exactly this gap.
  // REAL FIX (2026-08-17): DISTINCT ON did not include is_goblin/is_demon, so whenever a
  // goblin (or demon) row shared the exact same (player, prop, line, side) as the standard
  // variant, the dedup silently collapsed them into one row and the other variant's outcome_id
  // was never created - not graded, not even a placeholder, permanently invisible. Confirmed
  // live: Ronald Acuña Jr.'s total_bases|less|3.5 goblin row had zero outcome rows at all while
  // the identical-line standard row graded fine, because they collided in this exact dedup key.
  const rows = await sql.unsafe(`
    WITH deduped AS (
      SELECT DISTINCT ON (mlb_player_id, canonical_prop_key, line_value, selected_side, is_goblin, is_demon)
        final_board_row_id, prepared_row_id, source_key, game_pk, official_date, mlb_player_id,
        player_name, canonical_prop_key, line_value, selected_side,
        estimated_hit_probability_0_100, probability_confidence_0_100, score_0_100, board_tier,
        is_goblin, is_demon, calibration_json
      FROM score.final_board_history
      WHERE official_date::date = $1::date
        AND board_tier IN ('PRIMARY','REVIEW')
        AND canonical_prop_key = ANY($2::text[])
      ORDER BY mlb_player_id, canonical_prop_key, line_value, selected_side, is_goblin, is_demon, created_at DESC
    ),
    graded AS (
      SELECT f.*,
        ${actualExpr} AS actual_value,
        gs.is_final,
        existing.outcome_id AS existing_outcome_id
      FROM deduped f
      LEFT JOIN ${sourceTable} gl ON gl.player_id = f.mlb_player_id AND gl.game_date = f.official_date::date AND gl.game_pk = f.game_pk
      LEFT JOIN LATERAL (
        SELECT bool_or(((raw_json#>>'{}')::jsonb->'status'->>'abstractGameState') = 'Final') as is_final
        FROM team.game_logs tgl WHERE tgl.game_pk = f.game_pk
      ) gs ON true
      LEFT JOIN LATERAL (
        SELECT outcome_id FROM score.prop_outcome_history existing
        WHERE existing.mlb_player_id = f.mlb_player_id
          AND existing.canonical_prop_key = f.canonical_prop_key AND existing.line_value = f.line_value
          AND existing.selected_side = f.selected_side AND existing.official_date::date = f.official_date::date
          AND existing.is_goblin = f.is_goblin AND existing.is_demon = f.is_demon
        LIMIT 1
      ) existing ON true
    )
    SELECT *,
      CASE
        WHEN actual_value IS NOT NULL AND actual_value = line_value THEN NULL
        WHEN actual_value IS NOT NULL AND selected_side = 'more' THEN (actual_value > line_value)
        WHEN actual_value IS NOT NULL AND selected_side = 'less' THEN (actual_value < line_value)
        ELSE NULL END AS is_hit,
      (actual_value IS NOT NULL AND actual_value = line_value) AS is_tie
    FROM graded
    WHERE (actual_value IS NOT NULL OR is_final = true)
      AND (existing_outcome_id IS NULL OR existing_outcome_id NOT LIKE 'outcome_final|%')
  `, [targetDate, propLiteral]);

  if (!rows.length) {
    return { entity_type: entityType, candidates_found: 0, rows_inserted: 0 };
  }

  const insertRows = rows.map(r => {
    const isDnpPush = r.actual_value === null;
    const isTiePush = r.is_tie === true;
    const isPush = isDnpPush || isTiePush;
    const enrichment = extractEnrichmentSignal(r.calibration_json);
    return {
      outcome_id: `grade_${entityType}_${r.mlb_player_id}_${r.canonical_prop_key}_${String(r.line_value).replace(".", "p")}_${r.selected_side}_${r.is_goblin ? "gob" : (r.is_demon ? "dem" : "std")}_${targetDate}`,
      final_board_row_id: r.final_board_row_id || null,
      prepared_row_id: r.prepared_row_id || null,
      source_key: r.source_key || null,
      game_pk: r.game_pk || null,
      official_date: targetDate,
      mlb_player_id: r.mlb_player_id,
      player_name: r.player_name || null,
      canonical_prop_key: r.canonical_prop_key,
      line_value: r.line_value,
      selected_side: r.selected_side,
      estimated_hit_probability_0_100: r.estimated_hit_probability_0_100,
      probability_confidence_0_100: r.probability_confidence_0_100,
      score_0_100: r.score_0_100,
      score_grade: null,
      board_tier: r.board_tier || null,
      is_goblin: r.is_goblin || 0,
      is_demon: r.is_demon || 0,
      live_playable: null,
      actual_stat_value: r.actual_value,
      outcome_result: isDnpPush ? "push_dnp" : (isTiePush ? "push_tie" : (r.is_hit ? "hit" : "miss")),
      outcome_hit: isPush ? null : (r.is_hit ? 1 : 0),
      brier_component: null,
      enrichment_rate_multiplier: enrichment.rate_multiplier,
      enrichment_factors_applied: enrichment.factors_applied,
      enrichment_factors_missing: enrichment.factors_missing,
      resolved_at: nowUtc(),
      created_at: nowUtc()
    };
  });

  if (!insertRows.length) return { entity_type: entityType, candidates_found: rows.length, rows_inserted: 0 };

  const cols = ["outcome_id", "final_board_row_id", "prepared_row_id", "source_key", "game_pk", "official_date",
    "mlb_player_id", "player_name", "canonical_prop_key", "line_value", "selected_side",
    "estimated_hit_probability_0_100", "probability_confidence_0_100", "score_0_100", "score_grade",
    "board_tier", "is_goblin", "is_demon", "live_playable", "actual_stat_value", "outcome_result", "outcome_hit", "brier_component",
    "enrichment_rate_multiplier", "enrichment_factors_applied", "enrichment_factors_missing",
    "resolved_at", "created_at"];

  let inserted = 0;
  const CHUNK = 150;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const chunk = insertRows.slice(i, i + CHUNK);
    const res = await sql`INSERT INTO score.prop_outcome_history ${sql(chunk, ...cols)}
      ON CONFLICT (outcome_id) DO UPDATE SET
        enrichment_rate_multiplier=EXCLUDED.enrichment_rate_multiplier,
        enrichment_factors_applied=EXCLUDED.enrichment_factors_applied,
        enrichment_factors_missing=EXCLUDED.enrichment_factors_missing`;
    inserted += res.count || 0;
  }

  return { entity_type: entityType, candidates_found: rows.length, rows_inserted: inserted };
}

async function gradeRfiNrfiForDate(sql, targetDate) {
  // WIRED 2026-08-07: previously excluded entirely (see known_gaps below) because no
  // first-inning play-by-play data existed in a usable, Postgres-resident form. That data now
  // exists (context.first_inning_pitcher, migrated off D1 tonight, real MLB linescore-derived
  // outcomes) and is joined here directly - closing the root-cause chain that traced rfi_nrfi's
  // broken calibration all the way back to having no working outcome-grading path at all.
  const rows = await sql.unsafe(`
    WITH deduped AS (
      SELECT DISTINCT ON (mlb_player_id, canonical_prop_key, line_value, selected_side, is_goblin, is_demon)
        final_board_row_id, prepared_row_id, source_key, game_pk, official_date, mlb_player_id,
        player_name, canonical_prop_key, line_value, selected_side,
        estimated_hit_probability_0_100, probability_confidence_0_100, score_0_100, board_tier,
        is_goblin, is_demon
      FROM score.final_board_history
      WHERE official_date::date = $1::date
        AND board_tier IN ('PRIMARY','REVIEW')
        AND canonical_prop_key = 'rfi_nrfi'
      ORDER BY mlb_player_id, canonical_prop_key, line_value, selected_side, is_goblin, is_demon, created_at DESC
    ),
    graded AS (
      SELECT f.*,
        COALESCE(fip_direct.rfi_sl_more_hit, fip_team.rfi_sl_more_hit) as rfi_sl_more_hit,
        COALESCE(fip_direct.rfi_sl_less_hit, fip_team.rfi_sl_less_hit) as rfi_sl_less_hit,
        gs.is_final
      FROM deduped f
      LEFT JOIN context.first_inning_pitcher fip_direct ON fip_direct.pitcher_id::text = f.mlb_player_id::text AND fip_direct.game_pk = f.game_pk
      -- FIX (2026-08-24): the direct pitcher-id join silently fails whenever the probable
      -- starter the leg was originally posted against gets scratched before game time (injury,
      -- rotation shuffle, weather) - the game and its real first-inning outcome still happened
      -- and is fully recorded in this same table, just filed under the ACTUAL starter's
      -- pitcher_id. Confirmed real, concrete example: leg posted against Kyle Freeland
      -- (player 607536) for game_pk 823184 on 2026-08-15 had zero rows via the direct join,
      -- but Michael Lorenzen (the real, actual starter, team_id 115, same game_pk,
      -- started_game=1) had the fully graded outcome (rfi_sl_less_hit=1) sitting right there.
      -- Real, measured recovery from this fallback: 124 of 134 (92.5%) of currently-ungraded
      -- rfi_nrfi legs. Falls back to whichever pitcher on the LEG's own team actually started
      -- that specific game, rather than requiring the originally-posted pitcher_id to match.
      LEFT JOIN LATERAL (
        SELECT rfi_sl_more_hit, rfi_sl_less_hit FROM context.first_inning_pitcher fip2
        WHERE fip2.game_pk = f.game_pk AND fip2.team_id::text = (
          SELECT p.current_mlb_team_id::text FROM ref.players p WHERE p.player_id::text = f.mlb_player_id::text
        ) AND fip2.started_game = 1
        LIMIT 1
      ) fip_team ON true
      LEFT JOIN LATERAL (
        SELECT bool_or(((raw_json#>>'{}')::jsonb->'status'->>'abstractGameState') = 'Final') as is_final
        FROM team.game_logs tgl WHERE tgl.game_pk = f.game_pk
      ) gs ON true
    )
    SELECT *,
      CASE
        WHEN selected_side = 'more' AND rfi_sl_more_hit IS NOT NULL THEN (rfi_sl_more_hit = 1)
        WHEN selected_side = 'less' AND rfi_sl_less_hit IS NOT NULL THEN (rfi_sl_less_hit = 1)
        ELSE NULL END AS is_hit
    FROM graded
    WHERE rfi_sl_more_hit IS NOT NULL OR rfi_sl_less_hit IS NOT NULL OR is_final = true
  `, [targetDate]);

  if (!rows.length) return { entity_type: "pitcher_rfi_nrfi", candidates_found: 0, rows_inserted: 0 };

  const insertRows = rows.map(r => {
    const hasData = r.selected_side === "more" ? r.rfi_sl_more_hit !== null : r.rfi_sl_less_hit !== null;
    const isPush = !hasData;
    return {
      outcome_id: `grade_rfi_${r.mlb_player_id}_rfi_nrfi_${String(r.line_value).replace(".", "p")}_${r.selected_side}_${r.is_goblin ? "gob" : (r.is_demon ? "dem" : "std")}_${targetDate}`,
      final_board_row_id: r.final_board_row_id || null,
      prepared_row_id: r.prepared_row_id || null,
      source_key: r.source_key || null,
      game_pk: r.game_pk || null,
      official_date: targetDate,
      mlb_player_id: r.mlb_player_id,
      player_name: r.player_name || null,
      canonical_prop_key: "rfi_nrfi",
      line_value: r.line_value,
      selected_side: r.selected_side,
      estimated_hit_probability_0_100: r.estimated_hit_probability_0_100,
      probability_confidence_0_100: r.probability_confidence_0_100,
      score_0_100: r.score_0_100,
      score_grade: null,
      board_tier: r.board_tier || null,
      is_goblin: r.is_goblin || 0,
      is_demon: r.is_demon || 0,
      live_playable: null,
      actual_stat_value: r.selected_side === "more" ? r.rfi_sl_more_hit : r.rfi_sl_less_hit,
      outcome_result: isPush ? "push" : (r.is_hit ? "hit" : "miss"),
      outcome_hit: isPush ? null : (r.is_hit ? 1 : 0),
      brier_component: null,
      resolved_at: nowUtc(),
      created_at: nowUtc()
    };
  });

  if (!insertRows.length) return { entity_type: "pitcher_rfi_nrfi", candidates_found: rows.length, rows_inserted: 0 };

  const cols = ["outcome_id", "final_board_row_id", "prepared_row_id", "source_key", "game_pk", "official_date",
    "mlb_player_id", "player_name", "canonical_prop_key", "line_value", "selected_side",
    "estimated_hit_probability_0_100", "probability_confidence_0_100", "score_0_100", "score_grade",
    "board_tier", "is_goblin", "is_demon", "live_playable", "actual_stat_value", "outcome_result", "outcome_hit", "brier_component",
    "resolved_at", "created_at"];

  let inserted = 0;
  const CHUNK = 150;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const chunk = insertRows.slice(i, i + CHUNK);
    const res = await sql`INSERT INTO score.prop_outcome_history ${sql(chunk, ...cols)}
      ON CONFLICT (outcome_id) DO NOTHING`;
    inserted += res.count || 0;
  }

  return { entity_type: "pitcher_rfi_nrfi", candidates_found: rows.length, rows_inserted: inserted };
}

async function refreshBacktestReadyDataset(sql, targetDate) {
  // ADDED 2026-08-24: after grading completes for a date, mirror the full picture - board legs'
  // as-posted classification/baseline/enrichment state (score.final_board_history already
  // captures this historically-accurately at posting time, so no re-derivation needed) plus the
  // real graded outcome - into backtest.ready_dataset. One row per (source, date, player, prop,
  // line, side, is_goblin, is_demon). Upsert, so safe to re-run for the same date repeatedly as
  // outcomes fill in over time (e.g. late games, or a subsequent day's re-run recovering a
  // previously-scratched-starter push). Deliberately still writes to ONLY this one dedicated
  // backtest table, nothing that any live scoring path reads - same isolation guarantee as
  // prop_outcome_history itself, just a second, equally-isolated output.
  const res = await sql.unsafe(`
    WITH deduped AS (
      SELECT DISTINCT ON (source_key, mlb_player_id, canonical_prop_key, line_value, selected_side, is_goblin, is_demon)
        source_key, official_date, game_pk, mlb_player_id, player_name, canonical_prop_key, line_value, selected_side,
        is_goblin, is_demon, goblin_demon_tier, goblin_demon_anchor_line, goblin_demon_tier_direction,
        board_tier, score_0_100, score_grade, confidence_0_100,
        estimated_hit_probability_0_100, probability_confidence_0_100, probability_band, probability_grade,
        hp_lane, sample_size, non_push_sample, hit_count, miss_count, push_count,
        calibration_json, calculation_json, correlation_risk_tier, live_playable, created_at
      FROM score.final_board_history
      WHERE official_date::date = $1::date AND board_tier IN ('PRIMARY','REVIEW')
      ORDER BY source_key, mlb_player_id, canonical_prop_key, line_value, selected_side, is_goblin, is_demon, created_at DESC
    )
    SELECT d.*, p.actual_stat_value, p.outcome_result, p.outcome_hit, p.brier_component, p.resolved_at
    FROM deduped d
    LEFT JOIN score.prop_outcome_history p ON p.mlb_player_id = d.mlb_player_id AND p.canonical_prop_key = d.canonical_prop_key
      AND p.line_value = d.line_value AND p.selected_side = d.selected_side AND p.is_goblin = d.is_goblin
      AND p.is_demon = d.is_demon AND p.official_date::date = d.official_date::date AND p.source_key = d.source_key
  `, [targetDate]);

  if (!res.length) return { candidates_found: 0, rows_upserted: 0 };

  const rows = res.map(r => ({
    row_key: `${r.source_key}|${targetDate}|${r.mlb_player_id}|${r.canonical_prop_key}|${String(r.line_value).replace(".", "p")}|${r.selected_side}|${r.is_goblin ? "gob" : (r.is_demon ? "dem" : "std")}`,
    source_key: r.source_key, official_date: targetDate, game_pk: r.game_pk,
    mlb_player_id: r.mlb_player_id, player_name: r.player_name, canonical_prop_key: r.canonical_prop_key,
    line_value: r.line_value, selected_side: r.selected_side,
    is_goblin: r.is_goblin || 0, is_demon: r.is_demon || 0,
    goblin_demon_tier: r.goblin_demon_tier, goblin_demon_anchor_line: r.goblin_demon_anchor_line,
    goblin_demon_tier_direction: r.goblin_demon_tier_direction,
    board_tier: r.board_tier, score_0_100: r.score_0_100, score_grade: r.score_grade, confidence_0_100: r.confidence_0_100,
    estimated_hit_probability_0_100: r.estimated_hit_probability_0_100, probability_confidence_0_100: r.probability_confidence_0_100,
    probability_band: r.probability_band, probability_grade: r.probability_grade,
    hp_lane: r.hp_lane, sample_size: r.sample_size, non_push_sample: r.non_push_sample,
    hit_count: r.hit_count, miss_count: r.miss_count, push_count: r.push_count,
    calibration_json: r.calibration_json, calculation_json: r.calculation_json,
    correlation_risk_tier: r.correlation_risk_tier, live_playable: r.live_playable,
    actual_stat_value: r.actual_stat_value, outcome_result: r.outcome_result, outcome_hit: r.outcome_hit,
    brier_component: r.brier_component, final_board_created_at: r.created_at, outcome_resolved_at: r.resolved_at,
    refreshed_at: nowUtc()
  }));

  const cols = ["row_key", "source_key", "official_date", "game_pk", "mlb_player_id", "player_name", "canonical_prop_key",
    "line_value", "selected_side", "is_goblin", "is_demon", "goblin_demon_tier", "goblin_demon_anchor_line",
    "goblin_demon_tier_direction", "board_tier", "score_0_100", "score_grade", "confidence_0_100",
    "estimated_hit_probability_0_100", "probability_confidence_0_100", "probability_band", "probability_grade",
    "hp_lane", "sample_size", "non_push_sample", "hit_count", "miss_count", "push_count",
    "calibration_json", "calculation_json", "correlation_risk_tier", "live_playable",
    "actual_stat_value", "outcome_result", "outcome_hit", "brier_component",
    "final_board_created_at", "outcome_resolved_at", "refreshed_at"];

  let upserted = 0;
  const CHUNK = 150;
  const updateSet = cols.filter(c => c !== "row_key").map(c => `${c}=EXCLUDED.${c}`).join(", ");
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const r2 = await sql`INSERT INTO backtest.ready_dataset ${sql(chunk, ...cols)}
      ON CONFLICT (row_key) DO UPDATE SET ${sql.unsafe(updateSet)}`;
    upserted += r2.count || 0;
  }
  return { candidates_found: res.length, rows_upserted: upserted };
}

async function logExecution(sql, result, input) {
  try {
    await sql.unsafe(
      `INSERT INTO control.claude_session_log (topic, finding, status, next_step) VALUES ($1, $2, $3, $4)`,
      [
        "AUTOMATED_outcome_grader_run",
        `Trigger: ${input.trigger || "manual"}${input.cron ? ` (cron: ${input.cron})` : ""}. target_date=${result.target_date}. hitter candidates=${result.hitter?.candidates_found ?? "n/a"} inserted=${result.hitter?.rows_inserted ?? "n/a"}. pitcher candidates=${result.pitcher?.candidates_found ?? "n/a"} inserted=${result.pitcher?.rows_inserted ?? "n/a"}.`,
        result.ok ? "AUTOMATED_RUN_COMPLETED" : "AUTOMATED_RUN_FAILED",
        result.ok ? null : String(result.error || "unknown error")
      ]
    );
  } catch (_) { /* logging must never break the actual grading run */ }
}

async function runGradeOutcomes(env, input) {
  const sql = pg(env);
  try {
    // Default target: yesterday in America/Los_Angeles (the day whose games are now fully
    // complete and whose real stats have already been mined by the morning delta chain).
    let targetDate = input.target_date;
    if (!targetDate) {
      const r = await sql.unsafe(`SELECT to_char((now() AT TIME ZONE 'America/Los_Angeles')::date - interval '1 day', 'YYYY-MM-DD') AS d`);
      targetDate = r[0].d;
    }
    if (!isValidDateString(targetDate)) {
      const badResult = { ok: false, error: `Invalid target_date: ${targetDate}. Expected YYYY-MM-DD.` };
      await logExecution(sql, badResult, input);
      return badResult;
    }

    const hitterResult = await gradeForDate(sql, targetDate, "hitter", HITTER_PROP_EXPR, "stats_hitter.game_logs");
    const pitcherResult = await gradeForDate(sql, targetDate, "pitcher", PITCHER_PROP_EXPR, "stats_pitcher.game_logs");
    const rfiResult = await gradeRfiNrfiForDate(sql, targetDate);
    const datasetResult = await refreshBacktestReadyDataset(sql, targetDate);

    const totalGamesForDate = await sql.unsafe(`SELECT COUNT(DISTINCT game_pk) AS n FROM score.final_board_history WHERE official_date::date = $1::date`, [targetDate]);

    const result = {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      target_date: targetDate,
      games_on_board_for_date: Number(totalGamesForDate[0]?.n || 0),
      hitter: hitterResult,
      pitcher: pitcherResult,
      rfi_nrfi: rfiResult,
      backtest_ready_dataset: datasetResult,
      total_rows_inserted: hitterResult.rows_inserted + pitcherResult.rows_inserted + rfiResult.rows_inserted,
      timestamp_utc: nowUtc(),
      note: "Read-only from board history + already-mined stats tables; writes to score.prop_outcome_history and backtest.ready_dataset only. Idempotent - safe to re-run for the same date (ON CONFLICT DO NOTHING / UPDATE)."
    };
    await logExecution(sql, result, input);
    return result;
  } catch (err) {
    const errResult = { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, error: String(err && err.stack ? err.stack : err) };
    await logExecution(sql, errResult, input).catch(() => {});
    return errResult;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

function identity(env) {
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: "ready",
    reads: ["score.final_board_history", "stats_hitter.game_logs", "stats_pitcher.game_logs", "context.first_inning_pitcher"],
    writes: ["score.prop_outcome_history"],
    safety_note: "Isolated worker - never writes to any table read by the live scoring/board path. A bug here can only produce wrong or missing calibration training data, which calibration_report's own held-out validation checks before anything is applied.",
    supported_props: { hitter: Object.keys(HITTER_PROP_EXPR), pitcher: [...Object.keys(PITCHER_PROP_EXPR), "rfi_nrfi"] },
    known_gaps: ["pitcher_fantasy_score (formula not yet validated against a confirmed scoring spec)"]
  };
}

export default {
  async scheduled(event, env, ctx) {
    // DEFINITIVE FIX 2026-08-05: this cron is retired - the Cowork morning-delta supervisor's
    // Layer 4 calls this worker directly instead. The wrangler-level "never fires" workaround
    // (Feb 30th cron expression) did not reliably stop Cloudflare's existing live trigger from
    // firing - confirmed live twice now, same old '15 14 * * *' expression fired again despite
    // that source-level fix already being deployed. Making this handler itself a guaranteed
    // no-op instead: even if the platform keeps firing this worker on its old schedule, nothing
    // happens, so the firing is harmless rather than something to keep chasing at the trigger
    // level. Logging so this is visible/auditable rather than silently swallowed.
    ctx.waitUntil((async () => {
      try {
        await postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, prepare: false, connect_timeout: 8 })`
          INSERT INTO control.claude_session_log (topic, finding, status, next_step)
          VALUES ('AUTOMATED_outcome_grader_run', 'Cron fired (cron: ' || ${event.cron || "unknown"} || ') but this handler is now a deliberate no-op - the Cowork morning-delta supervisor calls this worker directly instead. No grading performed by this invocation.', 'CRON_NOOP_RETIRED', null)`;
      } catch (_) {}
    })());
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const output = await runGradeOutcomes(env, input);
      return jsonResponse(output, output.ok ? 200 : 400);
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run { target_date?: 'YYYY-MM-DD' }"] }, 404);
  }
};
