const WORKER_NAME = "alphadog-v2-daily-schedule";
const VERSION = "alphadog-v2-daily-schedule-v0.1.4-prewrite-replace-postwrite-retention-fix";
const JOB_KEY = "daily-team-schedule-spot";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB", "REF_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });
}
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function all(db, sql, ...binds) { const s = db.prepare(sql); const r = binds.length ? await s.bind(...binds).all() : await s.all(); return r.results || []; }
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
function safeJson(value, max = 14000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); }
  catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function toInt(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function dateOnly(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function addDays(dateText, days) {
  const d = new Date(`${dateText}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function diffDays(a, b) {
  const da = new Date(`${a}T12:00:00Z`);
  const db = new Date(`${b}T12:00:00Z`);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
function todayPt() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}
function retentionWindowPt() {
  const today = todayPt();
  const tomorrow = addDays(today, 1);
  return { start: today, end: tomorrow, dates: [today, tomorrow] };
}
function localHour(iso, timezone) {
  if (!iso || !timezone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).formatToParts(d);
    const h = Number((parts.find(p => p.type === "hour") || {}).value);
    return Number.isFinite(h) ? h : null;
  } catch (_) { return null; }
}

function timeZoneOffsetMinutes(iso, timezone) {
  if (!iso || !timezone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(d);
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    const y = Number(m.year);
    const mo = Number(m.month);
    const day = Number(m.day);
    let h = Number(m.hour);
    const mi = Number(m.minute || 0);
    const se = Number(m.second || 0);
    if (![y, mo, day, h, mi, se].every(Number.isFinite)) return null;
    if (h === 24) h = 0;
    const localAsUtc = Date.UTC(y, mo - 1, day, h, mi, se);
    return Math.round((localAsUtc - d.getTime()) / 60000);
  } catch (_) {
    return null;
  }
}

function hoursBetween(a, b) {
  const da = new Date(a || "");
  const db = new Date(b || "");
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return (db.getTime() - da.getTime()) / 3600000;
}
function normText(s) { return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function haversineMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = toNum(a.latitude), lon1 = toNum(a.longitude), lat2 = toNum(b.latitude), lon2 = toNum(b.longitude);
  if ([lat1, lon1, lat2, lon2].some(x => x === null)) return null;
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
function distanceBucket(miles) {
  if (miles === null || miles === undefined) return "unknown";
  if (miles < 5) return "same_metro";
  if (miles < 350) return "short";
  if (miles < 900) return "medium";
  if (miles < 1700) return "long";
  return "cross_country";
}
function sideForTeam(game, teamId) {
  const t = String(teamId);
  if (String(game.home_team_id) === t) return { is_home: 1, opponent_team_id: toInt(game.away_team_id), opponent_team_name: game.away_team_name, team_name: game.home_team_name };
  if (String(game.away_team_id) === t) return { is_home: 0, opponent_team_id: toInt(game.home_team_id), opponent_team_name: game.home_team_name, team_name: game.away_team_name };
  return null;
}
function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY_DAILY_TEAM_SCHEDULE_SPOT_CONTEXT",
    timestamp_utc: nowUtc(),
    phase: "daily-context-phase-6-team-schedule-spot",
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) },
    source_stack_locked: {
      schedule_truth: "TEAM_DB.mlb_game_calendar",
      team_history: "TEAM_DB.team_game_logs",
      prepared_board_relevance: "SCORE_DB.score_board_prepared_current",
      team_identity: "REF_DB.ref_teams",
      venue_travel_context: "REF_DB.ref_stadiums",
      external_sources_used: false
    },
    guardrails: {
      anchors_to_mlb_game_calendar_game_pk: true,
      prepared_board_relevance_only: true,
      current_snapshot_issue_retention_today_tomorrow_only: true,
    current_snapshot_issue_run_replacement_cleanup: true,
    prewrite_window_replacement_postwrite_retention_fix_v0_1_4: true,
      batches_retained_for_audit: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_daily_weather_duplication: true,
      no_daily_bullpen_duplication: true,
      no_score_db_mutation: true,
      no_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true
    }
  };
}
async function ensureSchema(env) {
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_team_schedule_spot_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    worker_name TEXT,
    worker_version TEXT,
    job_key TEXT,
    mode TEXT,
    status TEXT,
    window_start TEXT,
    window_end TEXT,
    calendar_games_checked INTEGER DEFAULT 0,
    prepared_games_checked INTEGER DEFAULT 0,
    prepared_rows_read INTEGER DEFAULT 0,
    teams_checked INTEGER DEFAULT 0,
    team_rows_written INTEGER DEFAULT 0,
    snapshot_rows_written INTEGER DEFAULT 0,
    source_failures INTEGER DEFAULT 0,
    blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    high_risk_team_count INTEGER DEFAULT 0,
    unknown_team_count INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    certification_reason TEXT,
    output_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_team_schedule_spot_current (
    schedule_spot_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    game_time_utc TEXT,
    team_id INTEGER,
    team_name TEXT,
    opponent_team_id INTEGER,
    opponent_team_name TEXT,
    is_home INTEGER,
    venue_id INTEGER,
    venue_name TEXT,
    prepared_board_relevant INTEGER DEFAULT 0,
    prepared_board_pickable_rows INTEGER DEFAULT 0,
    schedule_spot_status TEXT,
    schedule_spot_confidence TEXT,
    days_rest INTEGER,
    games_last_1_day INTEGER DEFAULT 0,
    games_last_2_days INTEGER DEFAULT 0,
    games_last_3_days INTEGER DEFAULT 0,
    games_last_5_days INTEGER DEFAULT 0,
    played_yesterday_flag INTEGER DEFAULT 0,
    back_to_back_flag INTEGER DEFAULT 0,
    three_in_four_flag INTEGER DEFAULT 0,
    four_in_six_flag INTEGER DEFAULT 0,
    doubleheader_today_flag INTEGER DEFAULT 0,
    doubleheader_yesterday_flag INTEGER DEFAULT 0,
    doubleheader_recent_flag INTEGER DEFAULT 0,
    series_game_number INTEGER,
    series_position_label TEXT,
    getaway_day_flag INTEGER DEFAULT 0,
    road_trip_game_number INTEGER,
    homestand_game_number INTEGER,
    travel_required_flag INTEGER DEFAULT 0,
    travel_distance_miles INTEGER,
    travel_distance_bucket TEXT,
    timezone_transition_flag INTEGER DEFAULT 0,
    prior_timezone TEXT,
    current_timezone TEXT,
    away_to_home_transition_flag INTEGER DEFAULT 0,
    home_to_away_transition_flag INTEGER DEFAULT 0,
    away_to_away_transition_flag INTEGER DEFAULT 0,
    late_night_previous_game_flag INTEGER DEFAULT 0,
    early_after_night_flag INTEGER DEFAULT 0,
    schedule_fatigue_score INTEGER DEFAULT 0,
    schedule_risk_level TEXT,
    source_key TEXT,
    source_endpoint TEXT,
    source_snapshot_at TEXT,
    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    changed_at TEXT,
    details_json TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_team_schedule_spot_current_game_team ON daily_team_schedule_spot_current(official_date, game_pk, team_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_team_schedule_spot_current_status ON daily_team_schedule_spot_current(schedule_spot_status, schedule_risk_level)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_team_schedule_spot_current_date ON daily_team_schedule_spot_current(official_date)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_team_schedule_spot_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    team_id INTEGER,
    schedule_spot_status TEXT,
    schedule_spot_confidence TEXT,
    schedule_fatigue_score INTEGER DEFAULT 0,
    schedule_risk_level TEXT,
    source_snapshot_at TEXT,
    details_json TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_team_schedule_spot_snapshots_date ON daily_team_schedule_spot_snapshots(official_date)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_team_schedule_spot_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    team_id INTEGER,
    issue_status TEXT,
    issue_type TEXT,
    severity TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_team_schedule_spot_issues_date ON daily_team_schedule_spot_issues(official_date)`);
}
async function applyRetention(env, window) {
  // Volatile context tables are run-replacement tables, not forever history.
  // Each refresh clears prior current/snapshot/issue rows for the active PT today+tomorrow window
  // and also removes any rows outside that window. Batch rows remain retained for small audit metadata.
  for (const table of ["daily_team_schedule_spot_current", "daily_team_schedule_spot_snapshots", "daily_team_schedule_spot_issues"]) {
    await run(env.DAILY_DB, `DELETE FROM ${table} WHERE official_date IS NULL OR official_date IN (?, ?) OR official_date NOT IN (?, ?)`, window.start, window.end, window.start, window.end);
  }
}
async function loadSources(env, window) {
  const lookbackStart = addDays(window.start, -7);
  const lookaheadEnd = addDays(window.end, 1);
  const calendarWindow = await all(env.TEAM_DB, `SELECT game_pk, season, game_type, official_date, game_time_utc, game_time_pt, status_code, abstract_game_state, detailed_state, is_scheduled, is_pregame, is_live, is_final, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, doubleheader, game_number, series_game_number, source_key, source_endpoint, source_snapshot_at, raw_json FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ? ORDER BY official_date, game_time_utc, game_pk`, window.start, window.end);
  const calendarContext = await all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, home_team_id, away_team_id, venue_id, venue_name, doubleheader, game_number, series_game_number FROM mlb_game_calendar WHERE official_date BETWEEN ? AND ? ORDER BY official_date, game_time_utc, game_pk`, lookbackStart, lookaheadEnd);
  const teamLogs = await all(env.TEAM_DB, `SELECT team_game_key, game_pk, game_date, team_id, opponent_team_id, is_home, venue_id, game_status, source_key, source_endpoint, source_game_type, certification_status, certification_grade, raw_json FROM team_game_logs WHERE game_date BETWEEN ? AND ? ORDER BY game_date, game_pk, team_id`, lookbackStart, window.end);
  const preparedRows = await all(env.SCORE_DB, `SELECT official_date, official_game_pk, official_game_time_utc, team, team_full_name, opponent, opponent_full_name, pickable_safe, matchup_status, player_match_status FROM score_board_prepared_current WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched' AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL AND official_date IN (?, ?)`, window.start, window.end);
  const teams = await all(env.REF_DB, `SELECT team_id, mlb_team_id, abbreviation, full_name, nickname, location_name, short_name, team_code, file_code, active FROM ref_teams WHERE active = 1`);
  const stadiums = await all(env.REF_DB, `SELECT stadium_id, team_id, stadium_name, city, state, latitude, longitude, roof_type, turf_type, mlb_venue_id, timezone, active FROM ref_stadiums WHERE active = 1`);
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
      const ga = gameByPk.get(String(a.game_pk));
      const gb = gameByPk.get(String(b.game_pk));
      const ta = String((ga && ga.game_time_utc) || `${a.game_date}T00:00:00Z`);
      const tb = String((gb && gb.game_time_utc) || `${b.game_date}T00:00:00Z`);
      return ta.localeCompare(tb) || String(a.game_pk).localeCompare(String(b.game_pk));
    });
  }
  return { gameByPk, stadiumByVenue, teamById, teamKeyToMlbId, logsByTeam };
}
function resolvePreparedTeamId(row, maps, game) {
  const candidates = [row.team, row.team_full_name].map(normText).filter(Boolean);
  for (const c of candidates) {
    const id = maps.teamKeyToMlbId.get(c);
    if (id && (String(id) === String(game.home_team_id) || String(id) === String(game.away_team_id))) return id;
  }
  if (normText(row.team_full_name) === normText(game.home_team_name)) return toInt(game.home_team_id);
  if (normText(row.team_full_name) === normText(game.away_team_name)) return toInt(game.away_team_id);
  return null;
}
function buildPreparedRelevance(sources, maps) {
  const byGameTeam = new Map();
  const byGame = new Map();
  const unresolved = [];
  for (const p of sources.preparedRows) {
    const game = maps.gameByPk.get(String(p.official_game_pk));
    if (!game) continue;
    const id = resolvePreparedTeamId(p, maps, game);
    if (!id) {
      unresolved.push(p);
      continue;
    }
    const key = `${p.official_game_pk}_${id}`;
    byGameTeam.set(key, (byGameTeam.get(key) || 0) + 1);
    byGame.set(String(p.official_game_pk), (byGame.get(String(p.official_game_pk)) || 0) + 1);
  }
  return { byGameTeam, byGame, unresolved };
}
function countLogsBetween(priorLogs, startDate, endDate) {
  return priorLogs.filter(l => l.game_date >= startDate && l.game_date <= endDate).length;
}
function currentAndPriorLogsForTeam(maps, teamId, game) {
  const logs = maps.logsByTeam.get(String(teamId)) || [];
  const currentTime = String(game.game_time_utc || "");
  const currentDate = String(game.official_date || "");
  const prior = logs.filter(l => {
    if (String(l.game_pk) === String(game.game_pk)) return false;
    if (String(l.game_date) < currentDate) return true;
    if (String(l.game_date) > currentDate) return false;
    const lg = maps.gameByPk.get(String(l.game_pk));
    return !!(lg && lg.game_time_utc && currentTime && String(lg.game_time_utc) < currentTime);
  });
  prior.sort((a, b) => {
    const ga = maps.gameByPk.get(String(a.game_pk));
    const gb = maps.gameByPk.get(String(b.game_pk));
    const ta = String((ga && ga.game_time_utc) || `${a.game_date}T00:00:00Z`);
    const tb = String((gb && gb.game_time_utc) || `${b.game_date}T00:00:00Z`);
    return ta.localeCompare(tb) || String(a.game_pk).localeCompare(String(b.game_pk));
  });
  return prior;
}
function countTeamCalendarGames(calendarRows, teamId, date) {
  return calendarRows.filter(g => String(g.official_date) === String(date) && (String(g.home_team_id) === String(teamId) || String(g.away_team_id) === String(teamId))).length;
}
function nextCalendarGame(calendarRows, teamId, game) {
  const curTime = String(game.game_time_utc || `${game.official_date}T00:00:00Z`);
  return calendarRows.find(g => String(g.game_pk) !== String(game.game_pk) && (String(g.home_team_id) === String(teamId) || String(g.away_team_id) === String(teamId)) && String(g.game_time_utc || `${g.official_date}T00:00:00Z`) > curTime) || null;
}
function consecutiveSiteGameNumber(priorLogs, currentIsHome) {
  let n = 1;
  for (let i = priorLogs.length - 1; i >= 0; i--) {
    if (Number(priorLogs[i].is_home) === Number(currentIsHome)) n += 1;
    else break;
  }
  return n;
}
function deriveSpot({ game, teamId, side, preparedRows, maps, sources, batchId, sourceSnapshotAt }) {
  const issues = [];
  const priorLogs = currentAndPriorLogsForTeam(maps, teamId, game);
  const lastLog = priorLogs.length ? priorLogs[priorLogs.length - 1] : null;
  const yesterday = addDays(game.official_date, -1);
  const last2Start = addDays(game.official_date, -2);
  const last3Start = addDays(game.official_date, -3);
  const last5Start = addDays(game.official_date, -5);
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
  if (timezoneTransition) fatigue += 1;
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
    prior_game_pk: lastLog ? toInt(lastLog.game_pk) : null,
    prior_game_date: lastLog ? lastLog.game_date : null,
    prior_game_time_utc: priorGame ? priorGame.game_time_utc : null,
    prior_venue_id: priorGame ? toInt(priorGame.venue_id) : null,
    prior_is_home: priorIsHome,
    prior_local_hour: priorHour,
    current_local_hour: currentHour,
    timezone_name_changed_flag: timezoneNameChanged,
    timezone_name_changed_audit_only: true,
    prior_timezone_offset_minutes: priorTimezoneOffsetMinutes,
    current_timezone_offset_minutes: currentTimezoneOffsetMinutes,
    gap_hours_since_prior_game: gapHours,
    next_game_pk: nextGame ? toInt(nextGame.game_pk) : null,
    next_game_date: nextGame ? nextGame.official_date : null,
    prepared_board_pickable_rows: preparedRows,
    warning_types: issues.map(x => x.type),
    source_notes: {
      calendar_is_live_not_used_for_status: true,
      today_in_progress_or_unstarted_team_logs_not_required: true,
      travel_is_derived_from_internal_ref_stadiums_only: true
    }
  };
  return {
    row: {
      schedule_spot_key: `${game.official_date}_${game.game_pk}_${teamId}`,
      batch_id: batchId,
      official_date: game.official_date,
      game_pk: toInt(game.game_pk),
      game_time_utc: game.game_time_utc,
      team_id: toInt(teamId),
      team_name: side.team_name,
      opponent_team_id: side.opponent_team_id,
      opponent_team_name: side.opponent_team_name,
      is_home: side.is_home,
      venue_id: toInt(game.venue_id),
      venue_name: game.venue_name,
      prepared_board_relevant: 1,
      prepared_board_pickable_rows: preparedRows,
      schedule_spot_status: status,
      schedule_spot_confidence: confidence,
      days_rest: daysRest,
      games_last_1_day: gamesLast1,
      games_last_2_days: gamesLast2,
      games_last_3_days: gamesLast3,
      games_last_5_days: gamesLast5,
      played_yesterday_flag: playedYesterday,
      back_to_back_flag: playedYesterday,
      three_in_four_flag: threeInFour,
      four_in_six_flag: fourInSix,
      doubleheader_today_flag: doubleheaderToday,
      doubleheader_yesterday_flag: doubleheaderYesterday ? 1 : 0,
      doubleheader_recent_flag: doubleheaderRecent ? 1 : 0,
      series_game_number: seriesN,
      series_position_label: seriesLabel,
      getaway_day_flag: getaway ? 1 : 0,
      road_trip_game_number: roadTripGameNumber,
      homestand_game_number: homestandGameNumber,
      travel_required_flag: venueChanged ? 1 : 0,
      travel_distance_miles: travelMiles,
      travel_distance_bucket: bucket,
      timezone_transition_flag: timezoneTransition,
      prior_timezone: priorStadium ? priorStadium.timezone : null,
      current_timezone: currentStadium ? currentStadium.timezone : null,
      away_to_home_transition_flag: awayToHome,
      home_to_away_transition_flag: homeToAway,
      away_to_away_transition_flag: awayToAway,
      late_night_previous_game_flag: lateNightPrev,
      early_after_night_flag: earlyAfterNight,
      schedule_fatigue_score: fatigue,
      schedule_risk_level: risk,
      source_key: "internal_calendar_team_logs_ref_stadiums_v0_1_0",
      source_endpoint: "TEAM_DB.mlb_game_calendar|TEAM_DB.team_game_logs|SCORE_DB.score_board_prepared_current|REF_DB.ref_stadiums",
      source_snapshot_at: sourceSnapshotAt,
      details_json: safeJson(details),
      raw_json: safeJson({ calendar_game: game, prior_team_log: lastLog, prior_calendar_game: priorGame })
    },
    issues
  };
}
async function writeCurrentRow(env, row) {
  const cols = [
    "schedule_spot_key","batch_id","official_date","game_pk","game_time_utc","team_id","team_name","opponent_team_id","opponent_team_name","is_home","venue_id","venue_name","prepared_board_relevant","prepared_board_pickable_rows","schedule_spot_status","schedule_spot_confidence","days_rest","games_last_1_day","games_last_2_days","games_last_3_days","games_last_5_days","played_yesterday_flag","back_to_back_flag","three_in_four_flag","four_in_six_flag","doubleheader_today_flag","doubleheader_yesterday_flag","doubleheader_recent_flag","series_game_number","series_position_label","getaway_day_flag","road_trip_game_number","homestand_game_number","travel_required_flag","travel_distance_miles","travel_distance_bucket","timezone_transition_flag","prior_timezone","current_timezone","away_to_home_transition_flag","home_to_away_transition_flag","away_to_away_transition_flag","late_night_previous_game_flag","early_after_night_flag","schedule_fatigue_score","schedule_risk_level","source_key","source_endpoint","source_snapshot_at","last_seen_at","changed_at","details_json","raw_json","updated_at"
  ];
  const values = cols.map(c => (c === "last_seen_at" || c === "changed_at" || c === "updated_at") ? nowUtc() : row[c]);
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_team_schedule_spot_current (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...values);
}
async function writeSnapshot(env, row, batchId) {
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_team_schedule_spot_snapshots (snapshot_id,batch_id,official_date,game_pk,team_id,schedule_spot_status,schedule_spot_confidence,schedule_fatigue_score,schedule_risk_level,source_snapshot_at,details_json,raw_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    rid("schedule_spot_snapshot"), batchId, row.official_date, row.game_pk, row.team_id, row.schedule_spot_status, row.schedule_spot_confidence, row.schedule_fatigue_score, row.schedule_risk_level, row.source_snapshot_at, row.details_json, row.raw_json);
}
async function writeIssue(env, issue, batchId, row) {
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_team_schedule_spot_issues (issue_id,batch_id,official_date,game_pk,team_id,issue_status,issue_type,severity,reason,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    rid("schedule_spot_issue"), batchId, row ? row.official_date : null, row ? row.game_pk : null, row ? row.team_id : null, issue.status || "open", issue.type, issue.severity, issue.reason, safeJson(issue.details || {}));
}
async function refreshWindow(env, input) {
  await ensureSchema(env);
  const started = nowUtc();
  const window = retentionWindowPt();
  const batchId = rid("daily_team_schedule_spot_batch");
  const runId = input.run_id || rid("run");
  await clearVolatileWindowBeforeWrite(env, window);
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_team_schedule_spot_batches (batch_id,request_id,run_id,worker_name,worker_version,job_key,mode,status,window_start,window_end,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, batchId, input.request_id || null, runId, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_team_schedule_spot_refresh_window", "running", window.start, window.end, started);
  const sources = await loadSources(env, window);
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
      if (!side) {
        allIssues.push({ row: { official_date: game.official_date, game_pk: toInt(game.game_pk), team_id: teamId }, issue: { type: "calendar_team_side_mismatch", severity: "blocker", reason: "Prepared-board relevant team could not be matched to calendar home/away side." } });
        continue;
      }
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
  for (const row of rowsToWrite) {
    await writeCurrentRow(env, row);
    await writeSnapshot(env, row, batchId);
  }
  for (const x of allIssues) await writeIssue(env, x.issue, batchId, x.row);
  await applyPostWriteRetention(env, window);
  const blockerCount = allIssues.filter(x => x.issue.severity === "blocker").length;
  const warningCount = allIssues.filter(x => x.issue.severity !== "blocker").length;
  const highRisk = rowsToWrite.filter(r => r.schedule_risk_level === "high").length;
  const unknown = rowsToWrite.filter(r => String(r.schedule_spot_confidence || "").startsWith("LOW_")).length;
  const dataOk = blockerCount === 0;
  const certification = noPickableSlate ? "DAILY_TEAM_SCHEDULE_SPOT_NO_PICKABLE_SAFE_GAMES_IN_WINDOW" : (dataOk ? (warningCount ? "DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_WITH_WARNINGS" : "DAILY_TEAM_SCHEDULE_SPOT_CERTIFIED_READY") : "DAILY_TEAM_SCHEDULE_SPOT_FAILED_BLOCKERS_OR_COVERAGE");
  const grade = noPickableSlate ? "NO_PICKABLE_SLATE" : (dataOk ? (warningCount ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL");
  const output = {
    ok: true,
    data_ok: dataOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input.request_id || null,
    run_id: runId,
    batch_id: batchId,
    mode: input.mode || "daily_team_schedule_spot_refresh_window",
    status: dataOk ? "completed" : "completed_with_blockers",
    certification,
    certification_grade: grade,
    window_start: window.start,
    window_end: window.end,
    calendar_games_checked: calendarGamesChecked,
    prepared_games_checked: preparedGamesChecked,
    prepared_rows_read: preparedRowsRead,
    teams_checked: rowsToWrite.length,
    team_rows_written: rowsToWrite.length,
    snapshot_rows_written: rowsToWrite.length,
    source_failures: 0,
    blocker_count: blockerCount,
    warning_count: warningCount,
    high_risk_team_count: highRisk,
    unknown_team_count: unknown,
    external_calls: 0,
    current_snapshot_issue_retention_today_tomorrow_only: true,
    current_snapshot_issue_run_replacement_cleanup: true,
    prewrite_window_replacement_postwrite_retention_fix_v0_1_4: true,
    batches_retained_for_audit: true,
    no_score_db_mutation: true,
    no_board_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    notes: [
      "Calendar is_live flag is intentionally not used for schedule/live interpretation.",
      "Today/tomorrow volatile rows are cleared before write, then post-write retention only prunes rows outside today/tomorrow; batches remain audit metadata.",
      "Travel context is derived only from internal REF_DB.ref_stadiums latitude/longitude/timezone.",
      "Timezone transition risk is based on actual UTC offset difference, not IANA timezone-name difference."
    ],
    timestamp_utc: nowUtc()
  };
  await run(env.DAILY_DB, `UPDATE daily_team_schedule_spot_batches SET status=?, calendar_games_checked=?, prepared_games_checked=?, prepared_rows_read=?, teams_checked=?, team_rows_written=?, snapshot_rows_written=?, source_failures=0, blocker_count=?, warning_count=?, high_risk_team_count=?, unknown_team_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    output.status, calendarGamesChecked, preparedGamesChecked, preparedRowsRead, rowsToWrite.length, rowsToWrite.length, rowsToWrite.length, blockerCount, warningCount, highRisk, unknown, certification, grade, dataOk ? "No blockers" : "One or more blockers", safeJson(output), batchId);
  return output;
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return jsonResponse({ ok: true, version: VERSION });
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS) }, safe_secret_note: "Secret values are intentionally never printed." });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const out = await refreshWindow(env, input || {});
        return jsonResponse(out, out.data_ok ? 200 : 200);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_TEAM_SCHEDULE_SPOT_EXCEPTION", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_external_calls: true }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
