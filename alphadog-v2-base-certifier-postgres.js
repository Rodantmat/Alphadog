import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-certifier-postgres";
const VERSION = "alphadog-v2-base-certifier-postgres-v1.0.0-full-chain-coverage";
const JOB_KEY = "base-certifier-postgres";
const DEFAULT_SEASON = 2026;

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }

function dateOnlyForTimeZone(date = new Date(), timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).reduce((acc, part) => { if (part.type !== "literal") acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Real, unified per-date coverage check across the whole real Postgres-native chain: game
// calendar -> hitter/pitcher metrics -> classification -> baseline. A date is only "fully
// certified" once every real layer's watermark has reached (or passed) it. This mirrors the
// real D1 certifier's coverage-matrix design in spirit, scoped to what's genuinely built in
// Postgres today (no D1 anywhere).
async function checkDateCoverage(sql, officialDate) {
  const calRows = await sql`SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_available_for_stats OR is_postponed OR is_suspended OR is_cancelled THEN 1 ELSE 0 END)::int AS ready FROM calendar.game_calendar WHERE official_date=${officialDate}`;
  const cal = calRows[0];
  const calendarTotal = Number(cal?.total || 0);
  const calendarReady = Number(cal?.ready || 0);
  const calendarComplete = calendarTotal > 0 && calendarTotal === calendarReady;

  const hitterWm = await sql`SELECT delta_watermark_date FROM stats_hitter.metric_batches WHERE batch_id='hitter_metrics_base_backfill_singleton' LIMIT 1`;
  const pitcherWm = await sql`SELECT delta_watermark_date FROM stats_pitcher.metric_batches WHERE batch_id='pitcher_metrics_base_backfill_singleton' LIMIT 1`;
  const classWm = await sql`SELECT delta_watermark_date FROM classification.classification_batches WHERE batch_id='classification_base_backfill_singleton' LIMIT 1`;
  const unconsumedTierChanges = await sql`SELECT COUNT(*)::int AS c FROM classification.tier_change_signal WHERE consumed_by_baseline = false`.catch(() => [{ c: 0 }]);

  const hitterReady = !!(hitterWm[0] && hitterWm[0].delta_watermark_date && String(hitterWm[0].delta_watermark_date).slice(0, 10) >= officialDate);
  const pitcherReady = !!(pitcherWm[0] && pitcherWm[0].delta_watermark_date && String(pitcherWm[0].delta_watermark_date).slice(0, 10) >= officialDate);
  const classificationReady = !!(classWm[0] && classWm[0].delta_watermark_date && String(classWm[0].delta_watermark_date).slice(0, 10) >= officialDate);
  const baselineReady = classificationReady && Number(unconsumedTierChanges[0]?.c || 0) === 0;

  const blockingReasons = [];
  if (!calendarComplete) blockingReasons.push(calendarTotal === 0 ? "NO_CALENDAR_DATA_FOR_DATE" : "GAMES_NOT_YET_FINAL_OR_EXCEPTION");
  if (!hitterReady) blockingReasons.push("HITTER_METRICS_WATERMARK_NOT_YET_ADVANCED");
  if (!pitcherReady) blockingReasons.push("PITCHER_METRICS_WATERMARK_NOT_YET_ADVANCED");
  if (!classificationReady) blockingReasons.push("CLASSIFICATION_WATERMARK_NOT_YET_ADVANCED");
  if (!baselineReady) blockingReasons.push(classificationReady ? "BASELINE_TIER_CHANGE_SIGNALS_NOT_YET_CONSUMED" : "BASELINE_BLOCKED_ON_CLASSIFICATION");

  const fullyCertified = calendarComplete && hitterReady && pitcherReady && classificationReady && baselineReady;
  return {
    official_date: officialDate, calendar_ready: calendarComplete, calendar_total_games: calendarTotal, calendar_ready_games: calendarReady,
    hitter_metrics_ready: hitterReady, pitcher_metrics_ready: pitcherReady, classification_ready: classificationReady, baseline_ready: baselineReady,
    fully_certified: fullyCertified, certification_grade: fullyCertified ? "FULL_CHAIN_CERTIFIED_COMPLETE" : "FULL_CHAIN_PARTIAL_OR_BLOCKED",
    blocking_reasons: blockingReasons
  };
}

async function runCheckDate(sql, input) {
  const officialDate = asText(input.official_date, dateOnlyForTimeZone(new Date(), "America/Los_Angeles"));
  const result = await checkDateCoverage(sql, officialDate);
  await sql`
    INSERT INTO certifier.date_coverage (official_date, calendar_ready, calendar_total_games, calendar_ready_games, hitter_metrics_ready, pitcher_metrics_ready, classification_ready, baseline_ready, fully_certified, certification_grade, blocking_reasons, checked_at)
    VALUES (${officialDate}, ${result.calendar_ready}, ${result.calendar_total_games}, ${result.calendar_ready_games}, ${result.hitter_metrics_ready}, ${result.pitcher_metrics_ready}, ${result.classification_ready}, ${result.baseline_ready}, ${result.fully_certified}, ${result.certification_grade}, ${JSON.stringify(result.blocking_reasons)}, now())
    ON CONFLICT (official_date) DO UPDATE SET
      calendar_ready=excluded.calendar_ready, calendar_total_games=excluded.calendar_total_games, calendar_ready_games=excluded.calendar_ready_games,
      hitter_metrics_ready=excluded.hitter_metrics_ready, pitcher_metrics_ready=excluded.pitcher_metrics_ready, classification_ready=excluded.classification_ready,
      baseline_ready=excluded.baseline_ready, fully_certified=excluded.fully_certified, certification_grade=excluded.certification_grade,
      blocking_reasons=excluded.blocking_reasons, checked_at=now()
  `;
  return { ok: true, data_ok: true, mode: "check_date", ...result };
}

async function runCheckWindow(sql, input) {
  const currentPt = dateOnlyForTimeZone(new Date(), "America/Los_Angeles");
  const startDate = asText(input.start_date, currentPt);
  const endDate = asText(input.end_date, currentPt);
  const dateRows = await sql`SELECT DISTINCT official_date::text AS d FROM calendar.game_calendar WHERE official_date BETWEEN ${startDate} AND ${endDate} ORDER BY d`;
  const results = [];
  for (const row of dateRows) {
    const r = await runCheckDate(sql, { official_date: row.d });
    results.push(r);
  }
  return { ok: true, data_ok: true, mode: "check_window", start_date: startDate, end_date: endDate, dates_checked: results.length, results };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sql = postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false });
    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(JSON.stringify({ ok: true, worker_name: WORKER_NAME, version: VERSION, job_key: JOB_KEY, timestamp_utc: nowUtc() }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/run" && request.method === "POST") {
        let input = {};
        try { input = await request.json(); } catch (_) { input = {}; }
        const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
        const merged = { ...inputJson, ...input };
        const mode = asText(merged.mode, "check_date");
        let result;
        if (mode === "check_window") result = await runCheckWindow(sql, merged);
        else result = await runCheckDate(sql, merged);
        return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found", path: url.pathname }), { status: 404, headers: { "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : "") }), { status: 500, headers: { "content-type": "application/json" } });
    } finally {
      try { await sql.end(); } catch (_) {}
    }
  }
};
