const WORKER_NAME = "alphadog-v2-daily-bullpen-availability";
const VERSION = "alphadog-v2-daily-bullpen-availability-v0.1.0-internal-bullpen-history-context";
const JOB_KEY = "daily-bullpen-availability";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB"];
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
function placeholders(n) { return Array.from({ length: n }, () => "?").join(","); }
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
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
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
function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY_DAILY_BULLPEN_AVAILABILITY_CONTEXT",
    timestamp_utc: nowUtc(),
    phase: "daily-context-phase-5-bullpen-availability",
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) },
    source_stack_locked: {
      primary_truth: "TEAM_DB.bullpen_history",
      game_team_anchor: "TEAM_DB.mlb_game_calendar",
      prepared_board_relevance: "SCORE_DB.score_board_prepared_current",
      optional_sidecar: "DAILY_DB.daily_starters_current",
      external_sources_used: false
    },
    guardrails: {
      anchors_to_mlb_game_calendar_game_pk: true,
      prepared_board_relevance_only: true,
      current_retention_today_tomorrow_only: true,
      internal_source_only_v0_1: true,
      no_external_depth_chart_truth: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_dependency: true,
      no_score_db_mutation: true,
      no_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true
    }
  };
}
async function ensureSchema(env) {
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_bullpen_availability_batches (
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
    pitcher_rows_written INTEGER DEFAULT 0,
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
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_bullpen_availability_current (
    bullpen_availability_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    game_time_utc TEXT,
    team_id INTEGER,
    team_name TEXT,
    opponent_team_id INTEGER,
    opponent_team_name TEXT,
    is_home INTEGER,
    prepared_board_relevant INTEGER DEFAULT 0,
    prepared_board_pickable_rows INTEGER DEFAULT 0,
    bullpen_status TEXT,
    bullpen_confidence TEXT,
    availability_grade TEXT,
    recent_games_window_start TEXT,
    recent_games_window_end TEXT,
    games_checked INTEGER DEFAULT 0,
    games_played_last_1_day INTEGER DEFAULT 0,
    games_played_last_2_days INTEGER DEFAULT 0,
    games_played_last_3_days INTEGER DEFAULT 0,
    bullpen_pitchers_used_last_1_day INTEGER DEFAULT 0,
    bullpen_pitchers_used_last_2_days INTEGER DEFAULT 0,
    bullpen_pitchers_used_last_3_days INTEGER DEFAULT 0,
    bullpen_pitches_last_1_day INTEGER DEFAULT 0,
    bullpen_pitches_last_2_days INTEGER DEFAULT 0,
    bullpen_pitches_last_3_days INTEGER DEFAULT 0,
    bullpen_outs_last_1_day INTEGER DEFAULT 0,
    bullpen_outs_last_2_days INTEGER DEFAULT 0,
    bullpen_outs_last_3_days INTEGER DEFAULT 0,
    high_usage_reliever_count INTEGER DEFAULT 0,
    back_to_back_reliever_count INTEGER DEFAULT 0,
    likely_unavailable_reliever_count INTEGER DEFAULT 0,
    rested_reliever_count INTEGER DEFAULT 0,
    unknown_reliever_count INTEGER DEFAULT 0,
    closer_recent_usage_flag INTEGER DEFAULT 0,
    setup_recent_usage_flag INTEGER DEFAULT 0,
    doubleheader_recent_flag INTEGER DEFAULT 0,
    extra_innings_recent_flag INTEGER DEFAULT 0,
    bullpen_fatigue_score INTEGER DEFAULT 0,
    bullpen_risk_level TEXT,
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
  await run(env.DAILY_DB, `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_bullpen_current_game_team ON daily_bullpen_availability_current(official_date, game_pk, team_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_bullpen_current_status ON daily_bullpen_availability_current(bullpen_status, bullpen_risk_level)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_bullpen_current_date ON daily_bullpen_availability_current(official_date)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_bullpen_pitcher_availability_current (
    pitcher_availability_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    team_id INTEGER,
    pitcher_id INTEGER,
    pitcher_name TEXT,
    pitcher_hand TEXT,
    role_hint TEXT,
    active_roster_flag INTEGER,
    availability_status TEXT,
    availability_confidence TEXT,
    pitches_last_1_day INTEGER DEFAULT 0,
    pitches_last_2_days INTEGER DEFAULT 0,
    pitches_last_3_days INTEGER DEFAULT 0,
    outs_last_1_day INTEGER DEFAULT 0,
    outs_last_2_days INTEGER DEFAULT 0,
    outs_last_3_days INTEGER DEFAULT 0,
    appearances_last_1_day INTEGER DEFAULT 0,
    appearances_last_2_days INTEGER DEFAULT 0,
    appearances_last_3_days INTEGER DEFAULT 0,
    back_to_back_flag INTEGER DEFAULT 0,
    high_pitch_recent_flag INTEGER DEFAULT 0,
    likely_unavailable_flag INTEGER DEFAULT 0,
    notes TEXT,
    source_snapshot_at TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_bullpen_pitcher_current_team_pitcher ON daily_bullpen_pitcher_availability_current(official_date, team_id, pitcher_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_bullpen_pitcher_current_status ON daily_bullpen_pitcher_availability_current(availability_status)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_bullpen_availability_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    team_id INTEGER,
    bullpen_status TEXT,
    availability_grade TEXT,
    bullpen_fatigue_score INTEGER,
    bullpen_risk_level TEXT,
    source_snapshot_at TEXT,
    details_json TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_bullpen_snap_batch ON daily_bullpen_availability_snapshots(batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_bullpen_snap_date ON daily_bullpen_availability_snapshots(official_date)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_bullpen_availability_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    team_id INTEGER,
    pitcher_id INTEGER,
    issue_status TEXT,
    issue_type TEXT,
    severity TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_bullpen_issues_batch ON daily_bullpen_availability_issues(batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_bullpen_issues_date ON daily_bullpen_availability_issues(official_date)`);
  await run(env.DAILY_DB, `INSERT OR IGNORE INTO daily_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('daily_bullpen_availability_v0_1_0', ?, CURRENT_TIMESTAMP, 'Daily Context Phase 5 bullpen availability internal-source tables')`, VERSION);
}
async function pruneRetention(env, retention) {
  const current = await run(env.DAILY_DB, `DELETE FROM daily_bullpen_availability_current WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const pitcher = await run(env.DAILY_DB, `DELETE FROM daily_bullpen_pitcher_availability_current WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const snapshots = await run(env.DAILY_DB, `DELETE FROM daily_bullpen_availability_snapshots WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const issues = await run(env.DAILY_DB, `DELETE FROM daily_bullpen_availability_issues WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  return {
    current_deleted: current && current.meta ? current.meta.changes : null,
    pitcher_current_deleted: pitcher && pitcher.meta ? pitcher.meta.changes : null,
    snapshots_deleted: snapshots && snapshots.meta ? snapshots.meta.changes : null,
    issues_deleted: issues && issues.meta ? issues.meta.changes : null,
    retention_date_start: retention.start,
    retention_date_end: retention.end
  };
}
async function getPreparedTeamRows(env, retention) {
  return all(env.SCORE_DB, `SELECT
      official_game_pk,
      official_game_time_utc,
      official_date,
      team_full_name,
      opponent_full_name,
      COUNT(*) AS prepared_board_pickable_rows
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND official_date IN (?, ?)
    GROUP BY official_game_pk, official_game_time_utc, official_date, team_full_name, opponent_full_name
    ORDER BY official_game_time_utc, official_game_pk, team_full_name`, retention.start, retention.end);
}
async function getCalendar(env, gamePks) {
  if (!gamePks.length) return [];
  return all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, detailed_state, abstract_game_state, is_scheduled, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled, doubleheader, game_number, series_game_number, updated_at, source_snapshot_at FROM mlb_game_calendar WHERE game_pk IN (${placeholders(gamePks.length)})`, ...gamePks);
}
async function getBullpenRows(env, teamIds, startDate, endDate) {
  if (!teamIds.length) return [];
  return all(env.TEAM_DB, `SELECT game_date, game_pk, team_id, opponent_team_id, is_home, pitcher_id, pitcher_name, pitcher_hand, pitcher_role, relief_classification, relief_appearance, games_started, games_pitched, innings_pitched, innings_pitched_decimal, outs_recorded, batters_faced, pitches, hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, inherited_runners, inherited_runners_scored, holds, saves, blown_saves, updated_at, source_key, source_endpoint, batch_id FROM bullpen_history WHERE relief_appearance = 1 AND date(game_date) BETWEEN date(?) AND date(?) AND team_id IN (${placeholders(teamIds.length)})`, startDate, endDate, ...teamIds.map(String));
}
async function getRecentCalendarRows(env, teamIds, startDate, endDate) {
  if (!teamIds.length) return [];
  return all(env.TEAM_DB, `SELECT game_pk, official_date, home_team_id, away_team_id, doubleheader, game_number, is_final, detailed_state, abstract_game_state FROM mlb_game_calendar WHERE date(official_date) BETWEEN date(?) AND date(?) AND (home_team_id IN (${placeholders(teamIds.length)}) OR away_team_id IN (${placeholders(teamIds.length)}))`, startDate, endDate, ...teamIds, ...teamIds);
}
function makeTargets(preparedRows, calendars) {
  const calByPk = new Map(calendars.map(c => [Number(c.game_pk), c]));
  const rowsByGameTeamName = new Map();
  for (const r of preparedRows) {
    const key = `${Number(r.official_game_pk)}|${String(r.team_full_name || "")}`;
    rowsByGameTeamName.set(key, Number(rowsByGameTeamName.get(key) || 0) + Number(r.prepared_board_pickable_rows || 0));
  }
  const targets = [];
  for (const gamePk of [...new Set(preparedRows.map(r => Number(r.official_game_pk)).filter(Boolean))]) {
    const cal = calByPk.get(gamePk);
    if (!cal) continue;
    const homeRows = Number(rowsByGameTeamName.get(`${gamePk}|${String(cal.home_team_name || "")}`) || 0);
    const awayRows = Number(rowsByGameTeamName.get(`${gamePk}|${String(cal.away_team_name || "")}`) || 0);
    targets.push({
      game_pk: gamePk,
      official_date: dateOnly(cal.official_date),
      game_time_utc: cal.game_time_utc,
      team_id: toInt(cal.home_team_id),
      team_name: cal.home_team_name,
      opponent_team_id: toInt(cal.away_team_id),
      opponent_team_name: cal.away_team_name,
      is_home: 1,
      prepared_board_pickable_rows: homeRows,
      calendar: cal
    });
    targets.push({
      game_pk: gamePk,
      official_date: dateOnly(cal.official_date),
      game_time_utc: cal.game_time_utc,
      team_id: toInt(cal.away_team_id),
      team_name: cal.away_team_name,
      opponent_team_id: toInt(cal.home_team_id),
      opponent_team_name: cal.home_team_name,
      is_home: 0,
      prepared_board_pickable_rows: awayRows,
      calendar: cal
    });
  }
  return targets.filter(t => t.team_id && t.game_pk && t.official_date);
}
function rowsInWindow(rows, teamId, endDate, days) {
  const start = addDays(endDate, -days);
  const endExclusive = endDate;
  return rows.filter(r => String(r.team_id) === String(teamId) && dateOnly(r.game_date) >= start && dateOnly(r.game_date) < endExclusive);
}
function distinctCount(rows, field) { return new Set(rows.map(r => r[field]).filter(v => v !== undefined && v !== null && String(v).length)).size; }
function sumRows(rows, field) { return rows.reduce((n, r) => n + toNum(r[field]), 0); }
function relieverMetrics(rows, teamId, officialDate, pitcherId) {
  const one = rowsInWindow(rows, teamId, officialDate, 1).filter(r => Number(r.pitcher_id) === Number(pitcherId));
  const two = rowsInWindow(rows, teamId, officialDate, 2).filter(r => Number(r.pitcher_id) === Number(pitcherId));
  const three = rowsInWindow(rows, teamId, officialDate, 3).filter(r => Number(r.pitcher_id) === Number(pitcherId));
  const dates = new Set(three.map(r => dateOnly(r.game_date)).filter(Boolean));
  const yesterday = addDays(officialDate, -1);
  const twoBack = addDays(officialDate, -2);
  return {
    pitches1: sumRows(one, "pitches"), pitches2: sumRows(two, "pitches"), pitches3: sumRows(three, "pitches"),
    outs1: sumRows(one, "outs_recorded"), outs2: sumRows(two, "outs_recorded"), outs3: sumRows(three, "outs_recorded"),
    app1: distinctCount(one, "game_pk"), app2: distinctCount(two, "game_pk"), app3: distinctCount(three, "game_pk"),
    backToBack: dates.has(yesterday) && dates.has(twoBack) ? 1 : 0,
    highPitch: sumRows(one, "pitches") >= 25 || sumRows(two, "pitches") >= 35 ? 1 : 0,
    likelyUnavailable: (dates.has(yesterday) && dates.has(twoBack)) || sumRows(one, "pitches") >= 35 || sumRows(two, "pitches") >= 45 || distinctCount(three, "game_pk") >= 3 ? 1 : 0,
    dates: Array.from(dates).sort()
  };
}
function classifyTarget(target, bullpenRows, recentCalendarRows) {
  const one = rowsInWindow(bullpenRows, target.team_id, target.official_date, 1);
  const two = rowsInWindow(bullpenRows, target.team_id, target.official_date, 2);
  const three = rowsInWindow(bullpenRows, target.team_id, target.official_date, 3);
  const recentCal = recentCalendarRows.filter(r => {
    const d = dateOnly(r.official_date);
    return d >= addDays(target.official_date, -3) && d < target.official_date && (Number(r.home_team_id) === Number(target.team_id) || Number(r.away_team_id) === Number(target.team_id));
  });
  const finalRecentGames = recentCal.filter(r => Number(r.is_final) === 1 || String(r.abstract_game_state || "").toLowerCase() === "final");
  const games1 = distinctCount(one, "game_pk");
  const games2 = distinctCount(two, "game_pk");
  const games3 = distinctCount(three, "game_pk");
  const pitches1 = sumRows(one, "pitches");
  const pitches2 = sumRows(two, "pitches");
  const pitches3 = sumRows(three, "pitches");
  const outs1 = sumRows(one, "outs_recorded");
  const outs2 = sumRows(two, "outs_recorded");
  const outs3 = sumRows(three, "outs_recorded");
  const pitchers1 = distinctCount(one, "pitcher_id");
  const pitchers2 = distinctCount(two, "pitcher_id");
  const pitchers3 = distinctCount(three, "pitcher_id");
  const pitcherIds = Array.from(new Set(three.map(r => Number(r.pitcher_id)).filter(Boolean)));
  const pitcherRisk = pitcherIds.map(pid => ({ pitcher_id: pid, row: three.find(r => Number(r.pitcher_id) === pid), metrics: relieverMetrics(bullpenRows, target.team_id, target.official_date, pid) }));
  const highUsage = pitcherRisk.filter(p => p.metrics.highPitch).length;
  const backToBack = pitcherRisk.filter(p => p.metrics.backToBack).length;
  const likelyUnavailable = pitcherRisk.filter(p => p.metrics.likelyUnavailable).length;
  const doubleheaderRecent = recentCal.some(r => String(r.doubleheader || "").toUpperCase() !== "N" || Number(r.game_number || 1) > 1) ? 1 : 0;
  const issues = [];
  if (games3 === 0 && finalRecentGames.length === 0) {
    issues.push({ severity: "info", issue_type: "no_recent_games", reason: "No recent final calendar games or bullpen usage found in the 3-day lookback; bullpen treated as rested/normal from off-days." });
  }
  if (games3 === 0 && finalRecentGames.length > 0) {
    issues.push({ severity: "blocker", issue_type: "missing_bullpen_history", reason: "Recent final calendar games exist for this team, but no bullpen_history relief rows were found in the lookback." });
  }
  if (pitches1 >= 80) issues.push({ severity: "warning", issue_type: "bullpen_taxed_yesterday", reason: "Team bullpen pitches last 1 day reached warning threshold." });
  if (pitches2 >= 130) issues.push({ severity: "warning", issue_type: "bullpen_high_risk_two_day_load", reason: "Team bullpen pitches last 2 days reached high-risk threshold." });
  if (highUsage > 0) issues.push({ severity: "warning", issue_type: "high_usage_relievers", reason: "One or more relievers reached conservative recent pitch-load thresholds." });
  if (backToBack > 0) issues.push({ severity: "warning", issue_type: "back_to_back_relievers", reason: "One or more relievers appeared on back-to-back recent dates." });
  if (doubleheaderRecent) issues.push({ severity: "warning", issue_type: "doubleheader_recent", reason: "Recent calendar rows indicate doubleheader context." });
  let score = 0;
  if (pitches1 >= 80) score += 35;
  else if (pitches1 >= 60) score += 22;
  else if (pitches1 >= 40) score += 10;
  if (pitches2 >= 130) score += 30;
  else if (pitches2 >= 100) score += 18;
  if (pitches3 >= 180) score += 15;
  score += Math.min(20, highUsage * 5);
  score += Math.min(20, backToBack * 8);
  score += Math.min(15, likelyUnavailable * 5);
  if (doubleheaderRecent) score += 10;
  score = Math.max(0, Math.min(100, score));
  const blockers = issues.filter(i => i.severity === "blocker").length;
  let status = "normal";
  let risk = "low";
  let grade = "PASS";
  let confidence = "HIGH_RECENT_HISTORY_COMPLETE";
  if (blockers) { status = "blocked"; risk = "blocked"; grade = "FAIL"; confidence = "BLOCKED_NO_RECENT_HISTORY"; }
  else if (score >= 75) { status = "depleted"; risk = "severe"; grade = "PASS_WITH_WARNINGS"; confidence = "WARNING_BULLPEN_TAXED"; }
  else if (score >= 55) { status = "high_risk"; risk = "high"; grade = "PASS_WITH_WARNINGS"; confidence = "WARNING_BULLPEN_TAXED"; }
  else if (score >= 30) { status = "taxed"; risk = "medium"; grade = "PASS_WITH_WARNINGS"; confidence = "WARNING_BULLPEN_TAXED"; }
  else if (games3 === 0) { status = "rested"; risk = "low"; grade = "PASS"; confidence = "MEDIUM_RECENT_HISTORY_OFFDAY_CONTEXT"; }
  return {
    games1, games2, games3, pitches1, pitches2, pitches3, outs1, outs2, outs3, pitchers1, pitchers2, pitchers3,
    highUsage, backToBack, likelyUnavailable, doubleheaderRecent,
    restedRelieverCount: Math.max(0, pitcherIds.length - likelyUnavailable), unknownRelieverCount: 0,
    fatigueScore: score, status, risk, grade, confidence, issues, pitcherRisk
  };
}
async function writeIssue(env, batchId, target, issue, pitcherId = null) {
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_bullpen_availability_issues (issue_id, batch_id, official_date, game_pk, team_id, pitcher_id, issue_status, issue_type, severity, reason, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    rid("bullpen_issue"), batchId, target.official_date, target.game_pk, target.team_id, pitcherId, issue.issue_type || "unknown", issue.severity || "warning", issue.reason || "", safeJson({ target, issue }, 4000));
}
async function writeTarget(env, batchId, target, classified, sourceSnapshotAt) {
  const key = `${target.official_date}_${target.game_pk}_${target.team_id}`;
  const old = await first(env.DAILY_DB, `SELECT bullpen_availability_key, raw_json FROM daily_bullpen_availability_current WHERE official_date=? AND game_pk=? AND team_id=?`, target.official_date, target.game_pk, target.team_id);
  const raw = safeJson({ target, classified, thresholds: { pitcher_high_1_day: 25, pitcher_high_2_day: 35, team_taxed_1_day: 80, team_high_risk_2_day: 130 } }, 12000);
  const changedAt = old && old.raw_json === raw ? null : nowUtc();
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_bullpen_availability_current (
    bullpen_availability_key, batch_id, official_date, game_pk, game_time_utc, team_id, team_name, opponent_team_id, opponent_team_name, is_home, prepared_board_relevant, prepared_board_pickable_rows, bullpen_status, bullpen_confidence, availability_grade, recent_games_window_start, recent_games_window_end, games_checked, games_played_last_1_day, games_played_last_2_days, games_played_last_3_days, bullpen_pitchers_used_last_1_day, bullpen_pitchers_used_last_2_days, bullpen_pitchers_used_last_3_days, bullpen_pitches_last_1_day, bullpen_pitches_last_2_days, bullpen_pitches_last_3_days, bullpen_outs_last_1_day, bullpen_outs_last_2_days, bullpen_outs_last_3_days, high_usage_reliever_count, back_to_back_reliever_count, likely_unavailable_reliever_count, rested_reliever_count, unknown_reliever_count, closer_recent_usage_flag, setup_recent_usage_flag, doubleheader_recent_flag, extra_innings_recent_flag, bullpen_fatigue_score, bullpen_risk_level, source_key, source_endpoint, source_snapshot_at, first_seen_at, last_seen_at, changed_at, details_json, raw_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, 'team_db_bullpen_history', 'TEAM_DB.bullpen_history + TEAM_DB.mlb_game_calendar + SCORE_DB.score_board_prepared_current', ?, COALESCE((SELECT first_seen_at FROM daily_bullpen_availability_current WHERE official_date=? AND game_pk=? AND team_id=?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, COALESCE(?, (SELECT changed_at FROM daily_bullpen_availability_current WHERE official_date=? AND game_pk=? AND team_id=?)), ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    key, batchId, target.official_date, target.game_pk, target.game_time_utc, target.team_id, target.team_name, target.opponent_team_id, target.opponent_team_name, target.is_home, Number(target.prepared_board_pickable_rows || 0), classified.status, classified.confidence, classified.grade, addDays(target.official_date, -3), addDays(target.official_date, -1), classified.games3, classified.games1, classified.games2, classified.games3, classified.pitchers1, classified.pitchers2, classified.pitchers3, classified.pitches1, classified.pitches2, classified.pitches3, classified.outs1, classified.outs2, classified.outs3, classified.highUsage, classified.backToBack, classified.likelyUnavailable, classified.restedRelieverCount, classified.unknownRelieverCount, classified.doubleheaderRecent, classified.fatigueScore, classified.risk, sourceSnapshotAt, target.official_date, target.game_pk, target.team_id, changedAt, target.official_date, target.game_pk, target.team_id, safeJson({ issues: classified.issues, pitcher_count: classified.pitcherRisk.length }, 4000), raw);
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_bullpen_availability_snapshots (snapshot_id, batch_id, official_date, game_pk, team_id, bullpen_status, availability_grade, bullpen_fatigue_score, bullpen_risk_level, source_snapshot_at, details_json, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    rid("bullpen_snap"), batchId, target.official_date, target.game_pk, target.team_id, classified.status, classified.grade, classified.fatigueScore, classified.risk, sourceSnapshotAt, safeJson({ target, issues: classified.issues }, 4000), raw);
  for (const issue of classified.issues) await writeIssue(env, batchId, target, issue, null);
  return { current_written: 1, snapshot_written: 1, issues_written: classified.issues.length };
}
async function writePitchers(env, batchId, target, classified, sourceSnapshotAt) {
  let written = 0;
  for (const p of classified.pitcherRisk) {
    const row = p.row || {};
    const m = p.metrics;
    const status = m.likelyUnavailable ? "likely_unavailable" : (m.highPitch || m.backToBack ? "limited" : "available");
    const confidence = m.likelyUnavailable ? "WARNING_HIGH_PITCH_RECENT" : (m.highPitch ? "WARNING_HIGH_PITCH_RECENT" : (m.backToBack ? "WARNING_BACK_TO_BACK_USAGE" : "HIGH_RECENT_HISTORY_COMPLETE"));
    const key = `${target.official_date}_${target.team_id}_${p.pitcher_id}`;
    await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_bullpen_pitcher_availability_current (pitcher_availability_key, batch_id, official_date, team_id, pitcher_id, pitcher_name, pitcher_hand, role_hint, active_roster_flag, availability_status, availability_confidence, pitches_last_1_day, pitches_last_2_days, pitches_last_3_days, outs_last_1_day, outs_last_2_days, outs_last_3_days, appearances_last_1_day, appearances_last_2_days, appearances_last_3_days, back_to_back_flag, high_pitch_recent_flag, likely_unavailable_flag, notes, source_snapshot_at, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      key, batchId, target.official_date, target.team_id, p.pitcher_id, row.pitcher_name || null, row.pitcher_hand || null, row.pitcher_role || row.relief_classification || "reliever", status, confidence, m.pitches1, m.pitches2, m.pitches3, m.outs1, m.outs2, m.outs3, m.app1, m.app2, m.app3, m.backToBack, m.highPitch, m.likelyUnavailable, m.dates.join(","), sourceSnapshotAt, safeJson({ target_game_pk: target.game_pk, team_name: target.team_name, dates_used: m.dates }, 3000));
    written += 1;
  }
  return written;
}
async function runBullpen(env, input) {
  await ensureSchema(env);
  const requestId = input.request_id || rid("daily_bullpen_req");
  const batchId = rid("daily_bullpen_batch");
  const sourceSnapshotAt = nowUtc();
  const retention = retentionWindowPt();
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_bullpen_availability_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_bullpen_availability_refresh_window", retention.start, retention.end, sourceSnapshotAt);
  const prePrune = await pruneRetention(env, retention);
  const prepared = await getPreparedTeamRows(env, retention);
  const gamePks = [...new Set(prepared.map(r => Number(r.official_game_pk)).filter(Boolean))];
  const calendars = await getCalendar(env, gamePks);
  const targets = makeTargets(prepared, calendars).filter(t => Number(t.prepared_board_pickable_rows || 0) > 0);
  const teamIds = [...new Set(targets.map(t => Number(t.team_id)).filter(Boolean))];
  const minDate = targets.length ? targets.map(t => addDays(t.official_date, -3)).sort()[0] : addDays(retention.start, -3);
  const maxDate = targets.length ? targets.map(t => addDays(t.official_date, -1)).sort().slice(-1)[0] : retention.end;
  const bullpenRows = await getBullpenRows(env, teamIds, minDate, maxDate);
  const recentCalendarRows = await getRecentCalendarRows(env, teamIds, minDate, maxDate);
  let currentWritten = 0, snapshotWritten = 0, issuesWritten = 0, pitcherWritten = 0;
  const summaries = [];
  for (const target of targets) {
    const classified = classifyTarget(target, bullpenRows, recentCalendarRows);
    const writes = await writeTarget(env, batchId, target, classified, sourceSnapshotAt);
    const pitcherRows = await writePitchers(env, batchId, target, classified, sourceSnapshotAt);
    currentWritten += writes.current_written;
    snapshotWritten += writes.snapshot_written;
    issuesWritten += writes.issues_written;
    pitcherWritten += pitcherRows;
    summaries.push({ game_pk: target.game_pk, team_id: target.team_id, team_name: target.team_name, status: classified.status, risk: classified.risk, score: classified.fatigueScore, pitches_last_1_day: classified.pitches1, pitches_last_2_days: classified.pitches2, relievers_last_3_days: classified.pitchers3, high_usage_relievers: classified.highUsage, back_to_back_relievers: classified.backToBack, likely_unavailable_relievers: classified.likelyUnavailable, issues: classified.issues.length });
  }
  const postPrune = await pruneRetention(env, retention);
  const blockerCount = summaries.reduce((n, s) => n + (s.status === "blocked" ? 1 : 0), 0);
  const warningCount = await first(env.DAILY_DB, `SELECT COUNT(*) AS c FROM daily_bullpen_availability_issues WHERE batch_id=? AND severity='warning'`, batchId);
  const warningN = Number(warningCount && warningCount.c || 0);
  const highRiskTeamCount = summaries.filter(s => ["high", "severe"].includes(s.risk)).length;
  const unknownTeamCount = summaries.filter(s => ["unknown", "blocked"].includes(s.risk)).length;
  const noPickableSlate = prepared.length === 0 || targets.length === 0;
  const coverageOk = noPickableSlate || (currentWritten === targets.length && snapshotWritten === targets.length);
  const dataOk = noPickableSlate || (coverageOk && blockerCount === 0);
  const certification = noPickableSlate ? "DAILY_BULLPEN_NO_PICKABLE_SAFE_GAMES_IN_WINDOW" : (dataOk ? (warningN ? "DAILY_BULLPEN_CERTIFIED_WITH_WARNINGS" : "DAILY_BULLPEN_CERTIFIED_READY") : "DAILY_BULLPEN_FAILED_BLOCKERS_OR_COVERAGE");
  const grade = noPickableSlate ? "VALID_ZERO" : (dataOk ? (warningN ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL");
  const status = dataOk ? "completed" : "failed_blockers_or_coverage";
  const output = {
    ok: dataOk,
    data_ok: dataOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    batch_id: batchId,
    status,
    certification,
    certification_grade: grade,
    certification_reason: noPickableSlate ? "No prepared-board pickable_safe games exist for today/tomorrow retention window." : (dataOk ? "Every prepared-board relevant team received bullpen availability current and snapshot rows; warnings are sidecar issues." : "One or more prepared-board relevant teams had blockers or coverage gaps."),
    window_start: retention.start,
    window_end: retention.end,
    calendar_games_checked: calendars.length,
    prepared_games_checked: gamePks.length,
    prepared_rows_read: prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0),
    teams_checked: targets.length,
    team_rows_written: currentWritten,
    pitcher_rows_written: pitcherWritten,
    snapshot_rows_written: snapshotWritten,
    issues_written: issuesWritten,
    source_failures: 0,
    blocker_count: blockerCount,
    warning_count: warningN,
    high_risk_team_count: highRiskTeamCount,
    unknown_team_count: unknownTeamCount,
    team_summaries: summaries,
    retention_policy: "current_pitcher_snapshots_issues_today_tomorrow_only_batches_retained_for_audit",
    retention_pre_prune: prePrune,
    retention_post_prune: postPrune,
    sidecar_tables: ["daily_bullpen_availability_current", "daily_bullpen_pitcher_availability_current", "daily_bullpen_availability_snapshots", "daily_bullpen_availability_batches", "daily_bullpen_availability_issues"],
    source_tables_read_only: ["TEAM_DB.bullpen_history", "TEAM_DB.mlb_game_calendar", "SCORE_DB.score_board_prepared_current"],
    optional_tables_not_required: ["DAILY_DB.daily_starters_current", "DAILY_DB.daily_player_availability_current", "STATS_PITCHER_DB.pitcher_game_logs"],
    no_external_calls: true,
    external_calls_performed: 0,
    no_score_db_mutation: true,
    no_board_mutation: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_daily_lineups_duplication: true,
    no_daily_player_availability_dependency: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    timestamp_utc: nowUtc()
  };
  await run(env.DAILY_DB, `UPDATE daily_bullpen_availability_batches SET status=?, calendar_games_checked=?, prepared_games_checked=?, prepared_rows_read=?, teams_checked=?, team_rows_written=?, pitcher_rows_written=?, snapshot_rows_written=?, source_failures=?, blocker_count=?, warning_count=?, high_risk_team_count=?, unknown_team_count=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, calendars.length, gamePks.length, output.prepared_rows_read, targets.length, currentWritten, pitcherWritten, snapshotWritten, 0, blockerCount, warningN, highRiskTeamCount, unknownTeamCount, certification, grade, output.certification_reason, safeJson(output, 14000), nowUtc(), batchId);
  return output;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS) } });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null } });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        return jsonResponse(await runBullpen(env, input));
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_BULLPEN_EXCEPTION", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_external_calls: true }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
