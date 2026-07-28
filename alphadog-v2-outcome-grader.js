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
  pitcher_outs: "gl.outs_recorded"
};

function buildCaseExpr(exprMap) {
  const whens = Object.entries(exprMap).map(([k, expr]) => `WHEN '${k}' THEN ${expr}`).join(" ");
  return `CASE f.canonical_prop_key ${whens} END`;
}

async function gradeForDate(sql, targetDate, entityType, propExprMap, sourceTable) {
  const actualExpr = buildCaseExpr(propExprMap);
  const propKeys = Object.keys(propExprMap);
  const propLiteral = "{" + propKeys.join(",") + "}";

  // Dedupe board legs to one row per (player, prop, line, side) using the latest snapshot of
  // that day, matching the same dedup pattern used successfully in prior sessions' analysis.
  const rows = await sql.unsafe(`
    WITH deduped AS (
      SELECT DISTINCT ON (mlb_player_id, canonical_prop_key, line_value, selected_side)
        final_board_row_id, prepared_row_id, source_key, game_pk, official_date, mlb_player_id,
        player_name, canonical_prop_key, line_value, selected_side,
        estimated_hit_probability_0_100, probability_confidence_0_100, score_0_100, board_tier
      FROM score.final_board_history
      WHERE official_date::date = $1::date
        AND board_tier IN ('PRIMARY','REVIEW')
        AND canonical_prop_key = ANY($2::text[])
      ORDER BY mlb_player_id, canonical_prop_key, line_value, selected_side, created_at DESC
    ),
    graded AS (
      SELECT f.*,
        ${actualExpr} AS actual_value
      FROM deduped f
      JOIN ${sourceTable} gl ON gl.player_id = f.mlb_player_id AND gl.game_date = f.official_date::date
    )
    SELECT *,
      CASE WHEN selected_side = 'more' THEN (actual_value > line_value)
           WHEN selected_side = 'less' THEN (actual_value < line_value)
           ELSE NULL END AS is_hit
    FROM graded
    WHERE actual_value IS NOT NULL
  `, [targetDate, propLiteral]);

  if (!rows.length) {
    return { entity_type: entityType, candidates_found: 0, rows_inserted: 0 };
  }

  const insertRows = rows.filter(r => r.is_hit !== null).map(r => ({
    outcome_id: `grade_${entityType}_${r.mlb_player_id}_${r.canonical_prop_key}_${String(r.line_value).replace(".", "p")}_${r.selected_side}_${targetDate}`,
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
    live_playable: null,
    actual_stat_value: r.actual_value,
    outcome_result: r.is_hit ? "hit" : "miss",
    outcome_hit: r.is_hit ? 1 : 0,
    brier_component: null,
    resolved_at: nowUtc(),
    created_at: nowUtc()
  }));

  if (!insertRows.length) return { entity_type: entityType, candidates_found: rows.length, rows_inserted: 0 };

  const cols = ["outcome_id", "final_board_row_id", "prepared_row_id", "source_key", "game_pk", "official_date",
    "mlb_player_id", "player_name", "canonical_prop_key", "line_value", "selected_side",
    "estimated_hit_probability_0_100", "probability_confidence_0_100", "score_0_100", "score_grade",
    "board_tier", "live_playable", "actual_stat_value", "outcome_result", "outcome_hit", "brier_component",
    "resolved_at", "created_at"];

  let inserted = 0;
  const CHUNK = 150;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const chunk = insertRows.slice(i, i + CHUNK);
    const res = await sql`INSERT INTO score.prop_outcome_history ${sql(chunk, ...cols)}
      ON CONFLICT (outcome_id) DO NOTHING`;
    inserted += res.count || 0;
  }

  return { entity_type: entityType, candidates_found: rows.length, rows_inserted: inserted };
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
      return { ok: false, error: `Invalid target_date: ${targetDate}. Expected YYYY-MM-DD.` };
    }

    const hitterResult = await gradeForDate(sql, targetDate, "hitter", HITTER_PROP_EXPR, "stats_hitter.game_logs");
    const pitcherResult = await gradeForDate(sql, targetDate, "pitcher", PITCHER_PROP_EXPR, "stats_pitcher.game_logs");

    const totalGamesForDate = await sql.unsafe(`SELECT COUNT(DISTINCT game_pk) AS n FROM score.final_board_history WHERE official_date::date = $1::date`, [targetDate]);

    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      target_date: targetDate,
      games_on_board_for_date: Number(totalGamesForDate[0]?.n || 0),
      hitter: hitterResult,
      pitcher: pitcherResult,
      total_rows_inserted: hitterResult.rows_inserted + pitcherResult.rows_inserted,
      timestamp_utc: nowUtc(),
      note: "Read-only from board history + already-mined stats tables; writes only to score.prop_outcome_history. Idempotent - safe to re-run for the same date (ON CONFLICT DO NOTHING)."
    };
  } catch (err) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, error: String(err && err.stack ? err.stack : err) };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

function identity(env) {
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY,
    status: "ready",
    reads: ["score.final_board_history", "stats_hitter.game_logs", "stats_pitcher.game_logs"],
    writes: ["score.prop_outcome_history"],
    safety_note: "Isolated worker - never writes to any table read by the live scoring/board path. A bug here can only produce wrong or missing calibration training data, which calibration_report's own held-out validation checks before anything is applied.",
    supported_props: { hitter: Object.keys(HITTER_PROP_EXPR), pitcher: Object.keys(PITCHER_PROP_EXPR) },
    known_gaps: ["rfi_nrfi (needs first-inning play-by-play, not present in game_logs)", "pitcher_fantasy_score (formula not yet validated against a confirmed scoring spec)"]
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runGradeOutcomes(env, { trigger: "cron", cron: event.cron }));
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
