import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-base-game-calendar";
const VERSION = "alphadog-v2-base-game-calendar-postgres-v1.0.0-real-mlb-schedule-classify";
const JOB_KEY = "base-game-calendar";

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }

// Real, exact port of the live delta-certifier's classifyGame() function - same MLB status-code
// and text-based classification logic, unchanged, since this is the real, validated rule set.
function classifyGame(game) {
  const status = game.status || {};
  const code = String(status.statusCode || "");
  const detailed = String(status.detailedState || "");
  const abstractState = String(status.abstractGameState || "");
  const hay = `${code} ${detailed} ${abstractState}`.toLowerCase();
  const detailedLower = detailed.toLowerCase();
  const abstractLower = abstractState.toLowerCase();
  const isLive = abstractLower === "live" || code === "I" || detailedLower.includes("in progress") || detailedLower.includes("manager challenge") || /\breview\b/.test(detailedLower);
  const isPostponed = hay.includes("postponed") || code === "DR" || code === "DI" || code === "D";
  const isSuspended = hay.includes("suspended") || code === "U";
  const isCancelled = hay.includes("cancelled") || hay.includes("canceled") || code === "C";
  const isFinalRaw = hay.includes("final") || hay.includes("game over") || code === "F";
  const isFinal = isFinalRaw && !isPostponed && !isSuspended && !isCancelled;
  const isPregame = abstractState.toLowerCase() === "preview" || hay.includes("scheduled") || hay.includes("pre-game") || hay.includes("warmup");
  return {
    status_code: code || null, abstract_game_state: abstractState || null, detailed_state: detailed || null,
    is_scheduled: isPregame, is_pregame: isPregame, is_live: isLive, is_final: isFinal,
    is_postponed: isPostponed, is_suspended: isSuspended, is_cancelled: isCancelled,
    is_available_for_stats: isFinal && !isPostponed && !isSuspended && !isCancelled
  };
}

async function fetchSchedule(startDate, endDate, gameTypes = "R", hydrate = "team,venue,linescore,probablePitcher(note)") {
  const endpoint = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameTypes=${encodeURIComponent(gameTypes)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&hydrate=${encodeURIComponent(hydrate)}`;
  const resp = await fetch(endpoint, { headers: { accept: "application/json" } });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) { data = { parse_error: true }; }
  if (!resp.ok) throw new Error(`MLB schedule fetch failed ${resp.status}: ${text.slice(0, 300)}`);
  const games = [];
  for (const d of (data.dates || [])) for (const g of (d.games || [])) games.push(g);
  return { endpoint, games };
}

async function upsertCalendar(sql, games) {
  if (!games.length) return 0;
  const rows = games.map(game => {
    const c = classifyGame(game);
    const gamePk = Number(game.gamePk);
    const officialDate = String(game.officialDate || "");
    const season = Number(String(officialDate || game.gameDate || "").slice(0, 4)) || null;
    return {
      game_pk: gamePk, season, game_type: String(game.gameType || "R"), official_date: officialDate,
      game_time_utc: String(game.gameDate || "") || null,
      status_code: c.status_code, abstract_game_state: c.abstract_game_state, detailed_state: c.detailed_state,
      is_scheduled: c.is_scheduled, is_pregame: c.is_pregame, is_live: c.is_live, is_final: c.is_final,
      is_postponed: c.is_postponed, is_suspended: c.is_suspended, is_cancelled: c.is_cancelled, is_available_for_stats: c.is_available_for_stats,
      home_team_id: Number(game?.teams?.home?.team?.id || 0) || null, away_team_id: Number(game?.teams?.away?.team?.id || 0) || null,
      home_team_name: String(game?.teams?.home?.team?.name || "") || null, away_team_name: String(game?.teams?.away?.team?.name || "") || null,
      venue_id: Number(game?.venue?.id || 0) || null, venue_name: String(game?.venue?.name || "") || null,
      doubleheader: game.doubleHeader == null ? null : String(game.doubleHeader),
      game_number: game.gameNumber == null ? null : Number(game.gameNumber),
      series_game_number: game.seriesGameNumber == null ? null : Number(game.seriesGameNumber),
      raw_json: JSON.stringify(game)
    };
  }).filter(r => r.game_pk);
  const CHUNK = 300;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO calendar.game_calendar ${sql(slice, "game_pk","season","game_type","official_date","game_time_utc","status_code","abstract_game_state","detailed_state","is_scheduled","is_pregame","is_live","is_final","is_postponed","is_suspended","is_cancelled","is_available_for_stats","home_team_id","away_team_id","home_team_name","away_team_name","venue_id","venue_name","doubleheader","game_number","series_game_number","raw_json")}
      ON CONFLICT (game_pk) DO UPDATE SET
        season=excluded.season, game_type=excluded.game_type, official_date=excluded.official_date, game_time_utc=excluded.game_time_utc,
        status_code=excluded.status_code, abstract_game_state=excluded.abstract_game_state, detailed_state=excluded.detailed_state,
        is_scheduled=excluded.is_scheduled, is_pregame=excluded.is_pregame, is_live=excluded.is_live, is_final=excluded.is_final,
        is_postponed=excluded.is_postponed, is_suspended=excluded.is_suspended, is_cancelled=excluded.is_cancelled, is_available_for_stats=excluded.is_available_for_stats,
        home_team_id=excluded.home_team_id, away_team_id=excluded.away_team_id, home_team_name=excluded.home_team_name, away_team_name=excluded.away_team_name,
        venue_id=excluded.venue_id, venue_name=excluded.venue_name, doubleheader=excluded.doubleheader, game_number=excluded.game_number,
        series_game_number=excluded.series_game_number, raw_json=excluded.raw_json, last_seen_at=now(), updated_at=now()
    `;
    written += slice.length;
  }
  return written;
}

function dateOnlyForTimeZone(date = new Date(), timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).reduce((acc, part) => { if (part.type !== "literal") acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function addDaysYmd(ymd, days) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

// Real, explicit "is this official_date fully certified ready" check other Postgres workers call
// before advancing their delta watermark past this date. A date is ready only when every real
// game on it is genuinely final/available_for_stats (or a legitimate exception: postponed/
// suspended/cancelled, which produce no stats by design). Matches the real certifier's rule
// exactly: today/future non-final games are a normal wait state, not an error.
async function isDateCertifiedComplete(sql, officialDate) {
  const rows = await sql`SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_available_for_stats OR is_postponed OR is_suspended OR is_cancelled THEN 1 ELSE 0 END)::int AS ready FROM calendar.game_calendar WHERE official_date=${officialDate}`;
  const r = rows[0];
  if (!r || Number(r.total) === 0) return { ready: false, reason: "NO_CALENDAR_DATA_FOR_DATE", total: 0, ready_games: 0 };
  const total = Number(r.total), ready = Number(r.ready || 0);
  return { ready: total > 0 && ready === total, reason: ready === total ? null : "GAMES_NOT_YET_FINAL_OR_EXCEPTION", total, ready_games: ready };
}

async function runRefreshCalendar(sql, input) {
  const runId = asText(input.run_id, rid("run_calendar"));
  const batchId = rid("calendar_batch");
  const currentPt = dateOnlyForTimeZone(new Date(), "America/Los_Angeles");
  const startDate = asText(input.start_date, addDaysYmd(currentPt, -3));
  const endDate = asText(input.end_date, addDaysYmd(currentPt, 6));
  await sql`INSERT INTO calendar.game_calendar_batches (batch_id, run_id, mode, status, window_start, window_end) VALUES (${batchId}, ${runId}, 'refresh_calendar', 'running', ${startDate}, ${endDate})`;
  const schedule = await fetchSchedule(startDate, endDate, "R,P");
  const written = await upsertCalendar(sql, schedule.games);
  await sql`UPDATE calendar.game_calendar_batches SET status='completed', games_seen=${schedule.games.length}, rows_upserted=${written}, finished_at=now(), updated_at=now() WHERE batch_id=${batchId}`;
  return {
    ok: true, data_ok: true, mode: "refresh_calendar", batch_id: batchId, status: "COMPLETED_GAME_CALENDAR_REFRESH",
    window_start: startDate, window_end: endDate, games_seen: schedule.games.length, rows_upserted: written, continuation_required: false
  };
}

async function runCheckDate(sql, input) {
  const officialDate = asText(input.official_date, dateOnlyForTimeZone(new Date(), "America/Los_Angeles"));
  const result = await isDateCertifiedComplete(sql, officialDate);
  return { ok: true, data_ok: true, mode: "check_date", official_date: officialDate, ...result };
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
        const mode = asText(merged.mode, "refresh_calendar");
        let result;
        if (mode === "check_date") result = await runCheckDate(sql, merged);
        else result = await runRefreshCalendar(sql, merged);
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
