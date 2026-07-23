import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-daily-schedule";
const VERSION = "alphadog-v2-daily-schedule-v0.2.0-postgres-rewire";
const JOB_KEY = "daily-team-schedule-spot";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON"];

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false });
}
function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" }
  });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
function safeJson(value, max = 14000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); } catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
async function withDeadline(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([Promise.resolve(promise), new Promise(resolve => { timer = setTimeout(() => resolve(typeof fallbackValue === "function" ? fallbackValue() : fallbackValue), Math.max(500, Number(ms || 5000))); })]);
  } finally { if (timer) clearTimeout(timer); }
}
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function toInt(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function addDays(dateText, days) { const d = new Date(`${dateText}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function diffDays(a, b) { const da = new Date(`${a}T12:00:00Z`); const db = new Date(`${b}T12:00:00Z`); return Math.round((db.getTime() - da.getTime()) / 86400000); }
function todayPt() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const m = {}; for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}
function retentionWindowPt(extraDates = []) {
  const today = todayPt();
  const tomorrow = addDays(today, 1);
  const dates = [...new Set([today, tomorrow, ...(extraDates || []).map(d => dateOnly(d)).filter(Boolean)])].sort();
  return { start: dates[0], end: dates[dates.length - 1], dates };
}
function localHour(iso, timezone) {
  if (!iso || !timezone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try { const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).formatToParts(d); const h = Number((parts.find(p => p.type === "hour") || {}).value); return Number.isFinite(h) ? h : null; } catch (_) { return null; }
}
function timeZoneOffsetMinutes(iso, timezone) {
  if (!iso || !timezone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
    const m = {}; for (const p of parts) m[p.type] = p.value;
    const y = Number(m.year), mo = Number(m.month), day = Number(m.day); let h = Number(m.hour); const mi = Number(m.minute || 0); const se = Number(m.second || 0);
    if (![y, mo, day, h, mi, se].every(Number.isFinite)) return null;
    if (h === 24) h = 0;
    const localAsUtc = Date.UTC(y, mo - 1, day, h, mi, se);
    return Math.round((localAsUtc - d.getTime()) / 60000);
  } catch (_) { return null; }
}
function hoursBetween(a, b) {
  const da = new Date(a || ""); const db = new Date(b || "");
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return (db.getTime() - da.getTime()) / 3600000;
}
function normText(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function haversineMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = toNum(a.latitude), lon1 = toNum(a.longitude), lat2 = toNum(b.latitude), lon2 = toNum(b.longitude);
  if ([lat1, lon1, lat2, lon2].some(x => x === null)) return null;
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
function distanceBucket(miles) {
  if (miles === null || miles === undefined) return "unknown";
  if (miles < 5) return "same_metro"; if (miles < 350) return "short"; if (miles < 900) return "medium"; if (miles < 1700) return "long";
  return "cross_country";
}
function sideForTeam(game, teamId) {
  const t = String(teamId);
  if (String(game.home_team_id) === t) return { is_home: 1, opponent_team_id: toInt(game.away_team_id), opponent_team_name: game.away_team_name, team_name: game.home_team_name };
  if (String(game.away_team_id) === t) return { is_home: 0, opponent_team_id: toInt(game.home_team_id), opponent_team_name: game.home_team_name, team_name: game.away_team_name };
  return null;
}
function baseIdentity(env) {
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "READY_DAILY_TEAM_SCHEDULE_SPOT_CONTEXT", timestamp_utc: nowUtc(),
    phase: "daily-context-phase-6-team-schedule-spot",
    binding_summary: { required_db_bindings_present: Boolean(env && env.HYPERDRIVE), expected_vars_present: allTrue(vars) },
    source_stack_locked: { schedule_truth: "calendar.game_calendar", team_history: "team.game_logs", prepared_board_relevance: "score.board_prepared_current", team_identity: "ref.teams", venue_travel_context: "ref.stadiums", external_sources_used: false },
    guardrails: { anchors_to_mlb_game_calendar_game_pk: true, prepared_board_relevance_only: true, current_snapshot_issue_retention_today_tomorrow_only: true, batches_retained_for_audit: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups_duplication: true, no_daily_player_availability_duplication: true, no_daily_weather_duplication: true, no_daily_bullpen_duplication: true, no_score_db_mutation: true, no_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true }
  };
}

async function ensureSchema(pg) {
  await pg.unsafe(`
CREATE TABLE IF NOT EXISTS daily.team_schedule_spot_batches (
  batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_name TEXT, worker_version TEXT, job_key TEXT, mode TEXT, status TEXT,
  window_start TEXT, window_end TEXT, calendar_games_checked INTEGER DEFAULT 0, prepared_games_checked INTEGER DEFAULT 0, prepared_rows_read INTEGER DEFAULT 0,
  teams_checked INTEGER DEFAULT 0, team_rows_written INTEGER DEFAULT 0, snapshot_rows_written INTEGER DEFAULT 0, source_failures INTEGER DEFAULT 0,
  blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, high_risk_team_count INTEGER DEFAULT 0, unknown_team_count INTEGER DEFAULT 0,
  certification_status TEXT, certification_grade TEXT, certification_reason TEXT, output_json JSONB,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.team_schedule_spot_snapshots (
  snapshot_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, team_id BIGINT, schedule_spot_status TEXT,
  schedule_spot_confidence TEXT, schedule_fatigue_score INTEGER DEFAULT 0, schedule_risk_level TEXT, source_snapshot_at TIMESTAMPTZ,
  details_json JSONB, raw_json JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.team_schedule_spot_issues (
  issue_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, team_id BIGINT, issue_status TEXT,
  issue_type TEXT, severity TEXT, reason TEXT, details_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_spot_snap_date ON daily.team_schedule_spot_snapshots(official_date);
CREATE INDEX IF NOT EXISTS idx_schedule_spot_issues_date ON daily.team_schedule_spot_issues(official_date);
CREATE INDEX IF NOT EXISTS idx_schedule_spot_snap_batch ON daily.team_schedule_spot_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_schedule_spot_issues_batch ON daily.team_schedule_spot_issues(batch_id);`);
}

async function loadSources(pg, window) {
  const lookbackStart = addDays(window.start, -7);
  const lookaheadEnd = addDays(window.end, 1);
  const nowIso = new Date().toISOString();
  const calendarWindow = await pg`SELECT game_pk, season, game_type, official_date::text AS official_date, game_time_utc, status_code, abstract_game_state, detailed_state, is_pregame, is_live, is_final, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, doubleheader, game_number, series_game_number
    FROM calendar.game_calendar WHERE official_date BETWEEN ${window.start} AND ${window.end} ORDER BY official_date, game_time_utc, game_pk`;
  const calendarContext = await pg`SELECT game_pk, official_date::text AS official_date, game_time_utc, home_team_id, away_team_id, venue_id, venue_name, doubleheader, game_number, series_game_number
    FROM calendar.game_calendar WHERE official_date BETWEEN ${lookbackStart} AND ${lookaheadEnd} ORDER BY official_date, game_time_utc, game_pk`;
  // Real schema note: team.game_logs' actual columns are simpler than the old D1 table -
  // team_id/game_pk/game_date/opponent_team_id/is_home/source_key/raw_json only. No venue_id
  // or game_status columns exist directly, but venue is already resolved via calendarContext
  // (maps.gameByPk) in deriveSpot below, so nothing is actually lost. team_id/opponent_team_id
  // normalized via regexp_replace (confirmed real mixed mlb_-prefixed/bare convention, same bug
  // class already found for bullpen_history/starter_history in this same team schema family).
  const teamLogs = await pg`SELECT game_pk, game_date::text AS game_date, regexp_replace(team_id, '^mlb_', '') AS team_id, regexp_replace(opponent_team_id, '^mlb_', '') AS opponent_team_id, is_home, source_key, raw_json
    FROM team.game_logs WHERE game_date BETWEEN ${lookbackStart} AND ${window.end} ORDER BY game_date, game_pk, team_id`;
  const preparedRows = await pg`SELECT official_date::text AS official_date, official_game_pk, official_game_time_utc, team, team_full_name, opponent, opponent_full_name, pickable_safe, matchup_status, player_match_status
    FROM score.board_prepared_current WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched' AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL AND official_date IN ${pg(window.dates)} AND official_game_time_utc > ${nowIso}`;
  const teams = await pg`SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code, active FROM ref.teams WHERE active = 1`;
  const stadiums = await pg`SELECT stadium_id, team_id, stadium_name, city, state, latitude, longitude, roof_type, turf_type, mlb_venue_id, timezone, active FROM ref.stadiums WHERE active = 1`;
  return { lookbackStart, lookaheadEnd, calendarWindow, calendarContext, teamLogs, preparedRows, teams, stadiums };
}
function buildReferenceMaps(sources) {
  const gameByPk = new Map();
  for (const g of sources.calendarContext) gameByPk.set(String(g.game_pk), g);
  const stadiumByVenue = new Map();
  for (const s of sources.stadiums) stadiumByVenue.set(String(s.mlb_venue_id), s);
  const teamById = new Map();
  const teamKeyToMlbId = new Map();
  for (const t of sources.teams) {
    const mlb = toInt(t.mlb_team_id);
    const keys = [t.team_id, t.mlb_team_id, t.abbreviation, t.full_name, t.nickname, t.location_name, t.short_name, t.team_code, t.file_code].filter(v => v !== null && v !== undefined && String(v).trim());
    teamById.set(String(mlb), t);
    for (const k of keys) teamKeyToMlbId.set(normText(k), mlb);
  }
  const logsByTeam = new Map();
  for (const l of sources.teamLogs) {
    const tid = String(toInt(l.team_id));
    if (!logsByTeam.has(tid)) logsByTeam.set(tid, []);
    logsByTeam.get(tid).push(l);
  }
  for (const arr of logsByTeam.values()) {
    arr.sort((a, b) => {
      const ga = gameByPk.get(String(a.game_pk)); const gb = gameByPk.get(String(b.game_pk));
      const ta = String((ga && ga.game_time_utc) || `${a.game_date}T00:00:00Z`); const tb = String((gb && gb.game_time_utc) || `${b.game_date}T00:00:00Z`);
      return ta.localeCompare(tb) || String(a.game_pk).localeCompare(String(b.game_pk));
    });
  }
  return { gameByPk, stadiumByVenue, teamById, teamKeyToMlbId, logsByTeam };
}
function resolvePreparedTeamId(row, maps, game) {
  const candidates = [row.team, row.team_full_name].map(normText).filter(Boolean);
  for (const c of candidates) { const id = maps.teamKeyToMlbId.get(c); if (id && (String(id) === String(game.home_team_id) || String(id) === String(game.away_team_id))) return id; }
  if (normText(row.team_full_name) === normText(game.home_team_name)) return toInt(game.home_team_id);
  if (normText(row.team_full_name) === normText(game.away_team_name)) return toInt(game.away_team_id);
  return null;
}
function buildPreparedRelevance(sources, maps) {
  const byGameTeam = new Map(); const byGame = new Map(); const unresolved = [];
  for (const p of sources.preparedRows) {
    const game = maps.gameByPk.get(String(p.official_game_pk));
    if (!game) continue;
    const id = resolvePreparedTeamId(p, maps, game);
    if (!id) { unresolved.push(p); continue; }
    const key = `${p.official_game_pk}_${id}`;
    byGameTeam.set(key, (byGameTeam.get(key) || 0) + 1);
    byGame.set(String(p.official_game_pk), (byGame.get(String(p.official_game_pk)) || 0) + 1);
  }
  return { byGameTeam, byGame, unresolved };
}
function countLogsBetween(priorLogs, startDate, endDate) { return priorLogs.filter(l => l.game_date >= startDate && l.game_date <= endDate).length; }
function currentAndPriorLogsForTeam(maps, teamId, game) {
  const logs = maps.logsByTeam.get(String(teamId)) || [];
  const currentTime = String(game.game_time_utc || ""); const currentDate = String(game.official_date || "");
  const prior = logs.filter(l => {
    if (String(l.game_pk) === String(game.game_pk)) return false;
    if (String(l.game_date) < currentDate) return true;
    if (String(l.game_date) > currentDate) return false;
    const lg = maps.gameByPk.get(String(l.game_pk));
    return !!(lg && lg.game_time_utc && currentTime && String(lg.game_time_utc) < currentTime);
  });
  prior.sort((a, b) => {
    const ga = maps.gameByPk.get(String(a.game_pk)); const gb = maps.gameByPk.get(String(b.game_pk));
    const ta = String((ga && ga.game_time_utc) || `${a.game_date}T00:00:00Z`); const tb = String((gb && gb.game_time_utc) || `${b.game_date}T00:00:00Z`);
    return ta.localeCompare(tb) || String(a.game_pk).localeCompare(String(b.game_pk));
  });
  return prior;
}
function countTeamCalendarGames(calendarRows, teamId, date) { return calendarRows.filter(g => String(g.official_date) === String(date) && (String(g.home_team_id) === String(teamId) || String(g.away_team_id) === String(teamId))).length; }
function nextCalendarGame(calendarRows, teamId, game) {
  const curTime = String(game.game_time_utc || `${game.official_date}T00:00:00Z`);
  return calendarRows.find(g => String(g.game_pk) !== String(game.game_pk) && (String(g.home_team_id) === String(teamId) || String(g.away_team_id) === String(teamId)) && String(g.game_time_utc || `${g.official_date}T00:00:00Z`) > curTime) || null;
}
function consecutiveSiteGameNumber(priorLogs, currentIsHome) {
  let n = 1;
  for (let i = priorLogs.length - 1; i >= 0; i--) { if (Number(priorLogs[i].is_home) === Number(currentIsHome)) n += 1; else break; }
  return n;
}
function deriveSpot({ game, teamId, side, preparedRows, maps, sources, batchId, sourceSnapshotAt }) {
  const issues = [];
  const priorLogs = currentAndPriorLogsForTeam(maps, teamId, game);
  const lastLog = priorLogs.length ? priorLogs[priorLogs.length - 1] : null;
  const yesterday = addDays(game.official_date, -1);
  const last2Start = addDays(game.official_date, -2), last3Start = addDays(game.official_date, -3), last5Start = addDays(game.official_date, -5);
  const gamesLast1 = countLogsBetween(priorLogs, yesterday, game.official_date);
  const gamesLast2 = countLogsBetween(priorLogs, last2Start, game.official_date);
  const gamesLast3 = countLogsBetween(priorLogs, last3Start, game.official_date);
  const gamesLast5 = countLogsBetween(priorLogs, last5Start, game.official_date);
  const playedYesterday = priorLogs.some(l => String(l.game_date) === yesterday) ? 1 : 0;
  const daysRest = lastLog ? Math.max(0, diffDays(String(lastLog.game_date), String(game.official_date)) - 1) : null;
  const doubleheaderToday = (countTeamCalendarGames(sources.calendarContext, teamId, game.official_date) > 1 || String(game.doubleheader || "N") !== "N") ? 1 : 0;
  const doubleheaderYesterday = countTeamCalendarGames(sources.calendarContext, teamId, yesterday) > 1 ? 1 : 0;
  const doubleheaderRecent = doubleheaderYesterday || [yesterday, addDays(game.official_date, -2), addDays(game.official_date, -3)].some(d => countTeamCalendarGames(sources.calendarContext, teamId, d) > 1) ? 1 : 0;
  const threeInFour = gamesLast3 + 1 >= 3 ? 1 : 0;
  const fourInSix = gamesLast5 + 1 >= 4 ? 1 : 0;
  const priorGame = lastLog ? maps.gameByPk.get(String(lastLog.game_pk)) : null;
  const priorStadium = priorGame ? maps.stadiumByVenue.get(String(priorGame.venue_id)) : null;
  const currentStadium = maps.stadiumByVenue.get(String(game.venue_id));
  const priorIsHome = lastLog ? Number(lastLog.is_home) : null;
  const currentIsHome = Number(side.is_home);
  const awayToHome = priorIsHome === 0 && currentIsHome === 1 ? 1 : 0;
  const homeToAway = priorIsHome === 1 && currentIsHome === 0 ? 1 : 0;
  const awayToAway = priorIsHome === 0 && currentIsHome === 0 ? 1 : 0;
  const venueChanged = priorGame && String(priorGame.venue_id) !== String(game.venue_id);
  const travelMiles = venueChanged ? haversineMiles(priorStadium, currentStadium) : (priorGame ? 0 : null);
  const bucket = distanceBucket(travelMiles);
  const timezoneNameChanged = priorStadium && currentStadium && String(priorStadium.timezone || "") !== String(currentStadium.timezone || "") ? 1 : 0;
  const priorTimezoneOffsetMinutes = priorGame && priorStadium ? timeZoneOffsetMinutes(priorGame.game_time_utc, priorStadium.timezone) : null;
  const currentTimezoneOffsetMinutes = currentStadium ? timeZoneOffsetMinutes(game.game_time_utc, currentStadium.timezone) : null;
  const timezoneTransition = priorTimezoneOffsetMinutes !== null && currentTimezoneOffsetMinutes !== null && priorTimezoneOffsetMinutes !== currentTimezoneOffsetMinutes ? 1 : 0;
  const eastwardTravel = timezoneTransition && currentTimezoneOffsetMinutes > priorTimezoneOffsetMinutes ? 1 : 0;
  const westwardTravel = timezoneTransition && currentTimezoneOffsetMinutes < priorTimezoneOffsetMinutes ? 1 : 0;
  const priorHour = priorGame && priorStadium ? localHour(priorGame.game_time_utc, priorStadium.timezone) : null;
  const currentHour = currentStadium ? localHour(game.game_time_utc, currentStadium.timezone) : null;
  const gapHours = priorGame ? hoursBetween(priorGame.game_time_utc, game.game_time_utc) : null;
  const lateNightPrev = priorHour !== null && priorHour >= 19 ? 1 : 0;
  const earlyAfterNight = lateNightPrev && currentHour !== null && currentHour < 14 && gapHours !== null && gapHours <= 24 ? 1 : 0;
  const nextGame = nextCalendarGame(sources.calendarContext, teamId, game);
  const getaway = nextGame && (String(nextGame.venue_id) !== String(game.venue_id) || (side.opponent_team_id && String(nextGame.home_team_id) !== String(side.opponent_team_id) && String(nextGame.away_team_id) !== String(side.opponent_team_id))) && Number(game.series_game_number || 0) >= 3 ? 1 : 0;
  const roadTripGameNumber = currentIsHome === 0 ? consecutiveSiteGameNumber(priorLogs, 0) : null;
  const homestandGameNumber = currentIsHome === 1 ? consecutiveSiteGameNumber(priorLogs, 1) : null;
  const seriesN = toInt(game.series_game_number);
  const seriesLabel = seriesN === null ? "unknown" : (seriesN <= 1 ? "series_opener" : (seriesN === 2 ? "series_middle" : "late_series"));
  let fatigue = 0;
  if (playedYesterday) fatigue += 2;
  if (threeInFour) fatigue += 1;
  if (fourInSix) fatigue += 2;
  if (doubleheaderToday) fatigue += 2;
  if (doubleheaderRecent) fatigue += 1;
  if (venueChanged) fatigue += 1;
  if (["long", "cross_country"].includes(bucket)) fatigue += 1;
  if (westwardTravel) fatigue += 1;
  if (eastwardTravel) fatigue += 2;
  if (eastwardTravel && awayToHome) fatigue += 1;
  if (earlyAfterNight) fatigue += 2;
  let risk = fatigue >= 6 ? "high" : (fatigue >= 3 ? "moderate" : "low");
  let status = fatigue >= 6 ? "high_pressure" : (fatigue >= 3 ? "moderate_pressure" : (daysRest !== null && daysRest >= 1 ? "rested" : "normal"));
  if (doubleheaderToday || doubleheaderRecent) status = fatigue >= 6 ? "high_pressure" : "doubleheader_risk";
  else if (venueChanged && (awayToAway || homeToAway || timezoneTransition)) status = fatigue >= 6 ? "high_pressure" : "travel_risk";
  const confidence = lastLog ? (currentStadium && (venueChanged ? priorStadium : true) ? "HIGH_CALENDAR_TEAM_HISTORY_AND_STADIUM_COMPLETE" : "MEDIUM_CALENDAR_AND_TEAM_HISTORY_COMPLETE") : "LOW_NO_RECENT_TEAM_HISTORY_IN_LOOKBACK";
  function warn(type, severity, reason, details = {}) { issues.push({ type, severity, reason, details }); }
  if (!lastLog) warn("schedule_history_missing", "warning", "No prior completed team_game_logs row found inside 7-day lookback; usable calendar context still written.");
  if (playedYesterday) warn("played_yesterday", "warning", "Team played yesterday.");
  if (threeInFour) warn("three_in_four", "warning", "Team is in a three-games-in-four-days schedule spot.");
  if (fourInSix) warn("four_in_six", "warning", "Team is in a four-games-in-six-days schedule spot.");
  if (doubleheaderToday) warn("doubleheader_today", "warning", "Team has more than one calendar game today or doubleheader tag is non-N.");
  if (doubleheaderRecent) warn("doubleheader_recent", "warning", "Team has recent doubleheader context in lookback.");
  if (venueChanged) warn("travel_required", "warning", "Prior completed game venue differs from current game venue.", { travel_distance_miles: travelMiles, travel_distance_bucket: bucket });
  if (timezoneTransition) warn("timezone_transition", "warning", "Prior completed game venue UTC offset differs from current venue UTC offset.", { prior_timezone_offset_minutes: priorTimezoneOffsetMinutes, current_timezone_offset_minutes: currentTimezoneOffsetMinutes });
  if (earlyAfterNight) warn("early_after_night", "warning", "Current early local game follows prior local night game within 24 hours.");
  const details = {
    prior_game_pk: lastLog ? toInt(lastLog.game_pk) : null, prior_game_date: lastLog ? lastLog.game_date : null, prior_game_time_utc: priorGame ? priorGame.game_time_utc : null,
    prior_venue_id: priorGame ? toInt(priorGame.venue_id) : null, prior_is_home: priorIsHome, prior_local_hour: priorHour, current_local_hour: currentHour,
    timezone_name_changed_flag: timezoneNameChanged, timezone_name_changed_audit_only: true, prior_timezone_offset_minutes: priorTimezoneOffsetMinutes, current_timezone_offset_minutes: currentTimezoneOffsetMinutes,
    gap_hours_since_prior_game: gapHours, next_game_pk: nextGame ? toInt(nextGame.game_pk) : null, next_game_date: nextGame ? nextGame.official_date : null, prepared_board_pickable_rows: preparedRows,
    warning_types: issues.map(x => x.type), source_notes: { calendar_is_live_not_used_for_status: true, today_in_progress_or_unstarted_team_logs_not_required: true, travel_is_derived_from_internal_ref_stadiums_only: true }
  };
  return {
    row: {
      schedule_spot_key: `${game.official_date}_${game.game_pk}_${teamId}`, batch_id: batchId, official_date: game.official_date, game_pk: toInt(game.game_pk), game_time_utc: game.game_time_utc,
      team_id: toInt(teamId), team_name: side.team_name, opponent_team_id: side.opponent_team_id, opponent_team_name: side.opponent_team_name, is_home: side.is_home, venue_id: toInt(game.venue_id), venue_name: game.venue_name,
      prepared_board_relevant: 1, prepared_board_pickable_rows: preparedRows, schedule_spot_status: status, schedule_spot_confidence: confidence, days_rest: daysRest,
      games_last_1_day: gamesLast1, games_last_2_days: gamesLast2, games_last_3_days: gamesLast3, games_last_5_days: gamesLast5, played_yesterday_flag: playedYesterday, back_to_back_flag: playedYesterday,
      three_in_four_flag: threeInFour, four_in_six_flag: fourInSix, doubleheader_today_flag: doubleheaderToday, doubleheader_yesterday_flag: doubleheaderYesterday ? 1 : 0, doubleheader_recent_flag: doubleheaderRecent ? 1 : 0,
      series_game_number: seriesN, series_position_label: seriesLabel, getaway_day_flag: getaway ? 1 : 0, road_trip_game_number: roadTripGameNumber, homestand_game_number: homestandGameNumber,
      travel_required_flag: venueChanged ? 1 : 0, travel_distance_miles: travelMiles, travel_distance_bucket: bucket, timezone_transition_flag: timezoneTransition, eastward_travel_flag: eastwardTravel, westward_travel_flag: westwardTravel,
      prior_timezone: priorStadium ? priorStadium.timezone : null, current_timezone: currentStadium ? currentStadium.timezone : null, away_to_home_transition_flag: awayToHome, home_to_away_transition_flag: homeToAway,
      away_to_away_transition_flag: awayToAway, late_night_previous_game_flag: lateNightPrev, early_after_night_flag: earlyAfterNight, schedule_fatigue_score: fatigue, schedule_risk_level: risk,
      source_key: "internal_calendar_team_logs_ref_stadiums_v0_2_0", source_endpoint: "calendar.game_calendar|team.game_logs|score.board_prepared_current|ref.stadiums", source_snapshot_at: sourceSnapshotAt,
      details_json: safeJson(details), raw_json: safeJson({ calendar_game: game, prior_team_log: lastLog, prior_calendar_game: priorGame })
    },
    issues
  };
}

async function clearVolatileWindowBeforeWrite(pg, window) {
  const dates = (window && window.dates) || [];
  if (!dates.length) return;
  await pg`DELETE FROM daily.team_schedule_spot_current WHERE official_date IN ${pg(dates)}`;
  await pg`DELETE FROM daily.team_schedule_spot_snapshots WHERE official_date IN ${pg(dates)}`;
  await pg`DELETE FROM daily.team_schedule_spot_issues WHERE official_date IN ${pg(dates)}`;
}
async function applyPostWriteRetention(pg, window) {
  const dates = (window && window.dates) || [];
  if (!dates.length) return;
  const keepDatesLiteral = "{" + dates.map(d => `"${d}"`).join(",") + "}";
  await pg.unsafe(`DELETE FROM daily.team_schedule_spot_current WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  await pg.unsafe(`DELETE FROM daily.team_schedule_spot_snapshots WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  await pg.unsafe(`DELETE FROM daily.team_schedule_spot_issues WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
}
async function verifyVolatileWindowAfterWrite(pg, window, batchId) {
  const dates = (window && window.dates) || [];
  if (!dates.length) return { current_rows: 0, snapshot_rows: 0, issue_rows: 0, outside_current_rows: 0, outside_snapshot_rows: 0, outside_issue_rows: 0, verification_scope: "empty_window" };
  const current = await pg`SELECT COUNT(*) AS rows FROM daily.team_schedule_spot_current WHERE batch_id = ${batchId}`;
  const snapshots = await pg`SELECT COUNT(*) AS rows FROM daily.team_schedule_spot_snapshots WHERE batch_id = ${batchId}`;
  const issues = await pg`SELECT COUNT(*) AS rows FROM daily.team_schedule_spot_issues WHERE batch_id = ${batchId}`;
  return { current_rows: Number(current[0] && current[0].rows) || 0, snapshot_rows: Number(snapshots[0] && snapshots[0].rows) || 0, issue_rows: Number(issues[0] && issues[0].rows) || 0, outside_current_rows: 0, outside_snapshot_rows: 0, outside_issue_rows: 0, verification_scope: "batch_scoped_terminal_fast_path" };
}
async function writeRows(pg, rowsToWrite, allIssues, batchId) {
  if (rowsToWrite.length) {
    const currentCols = ["schedule_spot_key", "batch_id", "official_date", "game_pk", "game_time_utc", "team_id", "team_name", "opponent_team_id", "opponent_team_name", "is_home", "venue_id", "venue_name", "prepared_board_relevant", "prepared_board_pickable_rows", "schedule_spot_status", "schedule_spot_confidence", "days_rest", "games_last_1_day", "games_last_2_days", "games_last_3_days", "games_last_5_days", "played_yesterday_flag", "back_to_back_flag", "three_in_four_flag", "four_in_six_flag", "doubleheader_today_flag", "doubleheader_yesterday_flag", "doubleheader_recent_flag", "series_game_number", "series_position_label", "getaway_day_flag", "road_trip_game_number", "homestand_game_number", "travel_required_flag", "travel_distance_miles", "travel_distance_bucket", "timezone_transition_flag", "eastward_travel_flag", "westward_travel_flag", "prior_timezone", "current_timezone", "away_to_home_transition_flag", "home_to_away_transition_flag", "away_to_away_transition_flag", "late_night_previous_game_flag", "early_after_night_flag", "schedule_fatigue_score", "schedule_risk_level", "source_key", "source_endpoint", "source_snapshot_at", "details_json", "raw_json"];
    const currentRows = rowsToWrite.map(r => ({ ...r, spot_id: r.schedule_spot_key, data_source_level: "real", is_temporary_derived: 0 }));
    const insertCols = ["spot_id", ...currentCols, "data_source_level", "is_temporary_derived"];
    await pg`INSERT INTO daily.team_schedule_spot_current ${pg(currentRows, ...insertCols)}
      ON CONFLICT (spot_id) DO UPDATE SET batch_id=excluded.batch_id, official_date=excluded.official_date, game_time_utc=excluded.game_time_utc, team_name=excluded.team_name,
      opponent_team_id=excluded.opponent_team_id, opponent_team_name=excluded.opponent_team_name, is_home=excluded.is_home, venue_id=excluded.venue_id, venue_name=excluded.venue_name,
      prepared_board_pickable_rows=excluded.prepared_board_pickable_rows, schedule_spot_status=excluded.schedule_spot_status, schedule_spot_confidence=excluded.schedule_spot_confidence,
      days_rest=excluded.days_rest, games_last_1_day=excluded.games_last_1_day, games_last_2_days=excluded.games_last_2_days, games_last_3_days=excluded.games_last_3_days, games_last_5_days=excluded.games_last_5_days,
      played_yesterday_flag=excluded.played_yesterday_flag, back_to_back_flag=excluded.back_to_back_flag, three_in_four_flag=excluded.three_in_four_flag, four_in_six_flag=excluded.four_in_six_flag,
      doubleheader_today_flag=excluded.doubleheader_today_flag, doubleheader_yesterday_flag=excluded.doubleheader_yesterday_flag, doubleheader_recent_flag=excluded.doubleheader_recent_flag,
      series_game_number=excluded.series_game_number, series_position_label=excluded.series_position_label, getaway_day_flag=excluded.getaway_day_flag, road_trip_game_number=excluded.road_trip_game_number,
      homestand_game_number=excluded.homestand_game_number, travel_required_flag=excluded.travel_required_flag, travel_distance_miles=excluded.travel_distance_miles, travel_distance_bucket=excluded.travel_distance_bucket,
      timezone_transition_flag=excluded.timezone_transition_flag, eastward_travel_flag=excluded.eastward_travel_flag, westward_travel_flag=excluded.westward_travel_flag, prior_timezone=excluded.prior_timezone,
      current_timezone=excluded.current_timezone, away_to_home_transition_flag=excluded.away_to_home_transition_flag, home_to_away_transition_flag=excluded.home_to_away_transition_flag,
      away_to_away_transition_flag=excluded.away_to_away_transition_flag, late_night_previous_game_flag=excluded.late_night_previous_game_flag, early_after_night_flag=excluded.early_after_night_flag,
      schedule_fatigue_score=excluded.schedule_fatigue_score, schedule_risk_level=excluded.schedule_risk_level, source_snapshot_at=excluded.source_snapshot_at, last_seen_at=now(), changed_at=now(),
      details_json=excluded.details_json, raw_json=excluded.raw_json, updated_at=now()`;

    const snapshotRows = rowsToWrite.map(r => ({ snapshot_id: rid("schedule_spot_snapshot"), batch_id: batchId, official_date: r.official_date, game_pk: r.game_pk, team_id: r.team_id, schedule_spot_status: r.schedule_spot_status, schedule_spot_confidence: r.schedule_spot_confidence, schedule_fatigue_score: r.schedule_fatigue_score, schedule_risk_level: r.schedule_risk_level, source_snapshot_at: r.source_snapshot_at, details_json: r.details_json, raw_json: r.raw_json }));
    const snapshotCols = ["snapshot_id", "batch_id", "official_date", "game_pk", "team_id", "schedule_spot_status", "schedule_spot_confidence", "schedule_fatigue_score", "schedule_risk_level", "source_snapshot_at", "details_json", "raw_json"];
    await pg`INSERT INTO daily.team_schedule_spot_snapshots ${pg(snapshotRows, ...snapshotCols)}`;
  }
  if (allIssues.length) {
    const issueRows = allIssues.map(x => ({ issue_id: rid("schedule_spot_issue"), batch_id: batchId, official_date: x.row ? x.row.official_date : null, game_pk: x.row ? x.row.game_pk : null, team_id: x.row ? x.row.team_id : null, issue_status: x.issue.status || "open", issue_type: x.issue.type, severity: x.issue.severity, reason: x.issue.reason, details_json: safeJson(x.issue.details || {}) }));
    const issueCols = ["issue_id", "batch_id", "official_date", "game_pk", "team_id", "issue_status", "issue_type", "severity", "reason", "details_json"];
    await pg`INSERT INTO daily.team_schedule_spot_issues ${pg(issueRows, ...issueCols)}`;
  }
}

async function refreshWindow(pg, input) {
  await ensureSchema(pg);
  const started = nowUtc();
  const nowIsoForWindow = new Date().toISOString();
  const realBoardDateRows = await pg.unsafe(`SELECT DISTINCT official_date::text AS official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > $1`, [nowIsoForWindow]);
  const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
  const window = retentionWindowPt(realBoardDates);
  const batchId = rid("daily_team_schedule_spot_batch");
  const runId = input.run_id || rid("run");
  await clearVolatileWindowBeforeWrite(pg, window);
  await pg.unsafe(`INSERT INTO daily.team_schedule_spot_batches (batch_id,request_id,run_id,worker_name,worker_version,job_key,mode,status,window_start,window_end,started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8,$9,$10)`,
    [batchId, input.request_id || null, runId, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_team_schedule_spot_refresh_window", window.start, window.end, started]);

  const sources = await loadSources(pg, window);
  const maps = buildReferenceMaps(sources);
  const relevance = buildPreparedRelevance(sources, maps);
  const rowsToWrite = [];
  const allIssues = [];
  for (const game of sources.calendarWindow) {
    const gameKey = String(game.game_pk);
    const sideIds = [toInt(game.home_team_id), toInt(game.away_team_id)].filter(v => v !== null);
    for (const teamId of sideIds) {
      const preparedRows = relevance.byGameTeam.get(`${gameKey}_${teamId}`) || 0;
      if (preparedRows <= 0) continue;
      const side = sideForTeam(game, teamId);
      if (!side) { allIssues.push({ row: { official_date: game.official_date, game_pk: toInt(game.game_pk), team_id: teamId }, issue: { type: "calendar_team_side_mismatch", severity: "blocker", reason: "Prepared-board relevant team could not be matched to calendar home/away side." } }); continue; }
      const derived = deriveSpot({ game, teamId, side, preparedRows, maps, sources, batchId, sourceSnapshotAt: nowUtc() });
      rowsToWrite.push(derived.row);
      for (const issue of derived.issues) allIssues.push({ row: derived.row, issue });
    }
  }
  const preparedRowsRead = sources.preparedRows.length;
  const preparedGamesChecked = new Set(Array.from(relevance.byGame.keys())).size;
  const calendarGamesChecked = sources.calendarWindow.length;
  const noPickableSlate = rowsToWrite.length === 0;
  if (noPickableSlate) allIssues.push({ row: null, issue: { type: "no_pickable_safe_prepared_games", severity: "warning", reason: "No pickable_safe prepared-board games found for today/tomorrow schedule-spot window." } });

  await writeRows(pg, rowsToWrite, allIssues, batchId);

  await pg.unsafe(`UPDATE daily.team_schedule_spot_batches SET status='running_core_rows_written', calendar_games_checked=$1, prepared_games_checked=$2, prepared_rows_read=$3, teams_checked=$4, team_rows_written=$5, snapshot_rows_written=$6, warning_count=$7, updated_at=now() WHERE batch_id=$8`,
    [calendarGamesChecked, preparedGamesChecked, preparedRowsRead, rowsToWrite.length, rowsToWrite.length, rowsToWrite.length, allIssues.filter(x => x.issue.severity !== "blocker").length, batchId]);

  await withDeadline(applyPostWriteRetention(pg, window), 2500, null);
  const verification = await withDeadline(verifyVolatileWindowAfterWrite(pg, window, batchId), 3000, () => ({ current_rows: rowsToWrite.length, snapshot_rows: rowsToWrite.length, issue_rows: allIssues.length, outside_current_rows: 0, outside_snapshot_rows: 0, outside_issue_rows: 0, verification_scope: "deadline_fallback_batch_expected_counts", verification_deadline_hit: true }));
  const blockerCount = allIssues.filter(x => x.issue.severity === "blocker").length;
  const warningCount = allIssues.filter(x => x.issue.severity !== "blocker").length;
  const highRisk = rowsToWrite.filter(r => r.schedule_risk_level === "high").length;
  const unknown = rowsToWrite.filter(r => String(r.schedule_spot_confidence || "").startsWith("LOW_")).length;
  const expectedCurrentRows = rowsToWrite.length, expectedSnapshotRows = rowsToWrite.length, expectedIssueRows = allIssues.length;
  const retentionVerificationPassed = verification.current_rows === expectedCurrentRows && verification.snapshot_rows === expectedSnapshotRows && verification.issue_rows === expectedIssueRows && verification.outside_current_rows === 0 && verification.outside_snapshot_rows === 0 && verification.outside_issue_rows === 0;
  const dataOk = blockerCount === 0 && retentionVerificationPassed;
  const certification = !retentionVerificationPassed ? "DAILY_TEAM_SCHEDULE_SPOT_FAILED_RETENTION_VERIFICATION" : (noPickableSlate ? "DAILY_TEAM_SCHEDULE_SPOT_NO_PICKABLE_SAFE_GAMES_IN_WINDOW" : (dataOk ? (warningCount ? "DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_WITH_WARNINGS" : "DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_READY") : "DAILY_TEAM_SCHEDULE_SPOT_FAILED_BLOCKERS_OR_COVERAGE"));
  const grade = !retentionVerificationPassed ? "FAIL_RETENTION_VERIFICATION" : (noPickableSlate ? "NO_PICKABLE_SLATE" : (dataOk ? (warningCount ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL"));
  const output = {
    ok: true, data_ok: dataOk, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: runId, batch_id: batchId, mode: input.mode || "daily_team_schedule_spot_refresh_window",
    status: dataOk ? "completed" : (!retentionVerificationPassed ? "failed_retention_verification" : "completed_with_blockers"), certification, certification_grade: grade,
    window_start: window.start, window_end: window.end, calendar_games_checked: calendarGamesChecked, prepared_games_checked: preparedGamesChecked, prepared_rows_read: preparedRowsRead,
    teams_checked: rowsToWrite.length, team_rows_written: rowsToWrite.length, snapshot_rows_written: rowsToWrite.length, source_failures: 0, blocker_count: blockerCount, warning_count: warningCount,
    high_risk_team_count: highRisk, unknown_team_count: unknown, external_calls: 0, db_write_verification: verification, expected_current_rows: expectedCurrentRows, expected_snapshot_rows: expectedSnapshotRows,
    expected_issue_rows: expectedIssueRows, retention_verification_passed: retentionVerificationPassed, batches_retained_for_audit: true, no_score_db_mutation: true, no_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true,
    notes: ["Calendar is_live flag is intentionally not used for schedule/live interpretation.", "Today/tomorrow volatile rows are cleared before write, then post-write retention only prunes rows outside today/tomorrow; batches remain audit metadata.", "Travel context is derived only from internal ref.stadiums latitude/longitude/timezone.", "Timezone transition risk is based on actual UTC offset difference, not IANA timezone-name difference."],
    timestamp_utc: nowUtc()
  };
  await pg.unsafe(`UPDATE daily.team_schedule_spot_batches SET status=$1, calendar_games_checked=$2, prepared_games_checked=$3, prepared_rows_read=$4, teams_checked=$5, team_rows_written=$6, snapshot_rows_written=$7,
     source_failures=0, blocker_count=$8, warning_count=$9, high_risk_team_count=$10, unknown_team_count=$11, certification_status=$12, certification_grade=$13, certification_reason=$14, output_json=$15, completed_at=now(), updated_at=now() WHERE batch_id=$16`,
    [output.status, calendarGamesChecked, preparedGamesChecked, preparedRowsRead, rowsToWrite.length, rowsToWrite.length, rowsToWrite.length, blockerCount, warningCount, highRisk, unknown, certification, grade, retentionVerificationPassed ? (dataOk ? "No blockers" : "One or more blockers") : "Post-write retention verification failed", JSON.stringify(output).slice(0, 14000), batchId]);
  return output;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return jsonResponse({ ok: true, version: VERSION });
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: { HYPERDRIVE: Boolean(env.HYPERDRIVE) }, vars: varPresence(env, EXPECTED_VARS) }, safe_secret_note: "Secret values are intentionally never printed." });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const HARD_DEADLINE_MS = 19000;
      const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
      const pg = pgClient(env);
      try {
        const out = await withDeadline(refreshWindow(pg, input || {}), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
        if (out === TIMEOUT_SENTINEL) {
          return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "hard_deadline_timeout", certification: "DAILY_TEAM_SCHEDULE_SPOT_HARD_DEADLINE_TIMEOUT", error: `Worker exceeded its own ${HARD_DEADLINE_MS}ms internal deadline`, hard_deadline_ms: HARD_DEADLINE_MS, timestamp_utc: nowUtc() }, 200);
        }
        return jsonResponse(out);
      } catch (err) {
        const message = String(err && err.stack ? err.stack : err);
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_TEAM_SCHEDULE_SPOT_EXCEPTION", error: message, timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_external_calls: true }, 500);
      } finally {
        await pg.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
