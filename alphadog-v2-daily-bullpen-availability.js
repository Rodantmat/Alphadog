import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-daily-bullpen-availability";
const VERSION = "alphadog-v2-daily-bullpen-availability-v0.2.1-postgres-rewire-redeploy";
const JOB_KEY = "daily-bullpen-availability";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON"];
const RUN_DEADLINE_MS = 16000;
const MAX_PITCHER_DETAIL_ROWS_PER_TEAM = 4;

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8 });
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
async function withDeadline(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([Promise.resolve(promise), new Promise(resolve => { timer = setTimeout(() => resolve(typeof fallbackValue === "function" ? fallbackValue() : fallbackValue), Math.max(500, Number(ms || 5000))); })]);
  } finally { if (timer) clearTimeout(timer); }
}
function safeJson(value, max = 14000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); } catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function deadlineExceeded(startedMs) { return Date.now() - startedMs > RUN_DEADLINE_MS; }
function toInt(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function addDays(dateText, days) { const d = new Date(`${dateText}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
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
function baseIdentity(env) {
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "READY_DAILY_BULLPEN_AVAILABILITY_CONTEXT", timestamp_utc: nowUtc(),
    phase: "daily-context-phase-5-bullpen-availability",
    binding_summary: { required_db_bindings_present: Boolean(env && env.HYPERDRIVE), expected_vars_present: allTrue(vars) },
    source_stack_locked: { primary_truth: "team.bullpen_history", game_team_anchor: "calendar.game_calendar", prepared_board_relevance: "score.board_prepared_current", external_sources_used: false },
    guardrails: { anchors_to_mlb_game_calendar_game_pk: true, prepared_board_relevance_only: true, current_retention_today_tomorrow_only: true, internal_source_only: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups_duplication: true, no_daily_player_availability_dependency: true, no_score_db_mutation: true, no_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true }
  };
}

async function ensureSchema(pg) {
  await pg.unsafe(`
CREATE TABLE IF NOT EXISTS daily.bullpen_availability_batches (
  batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_name TEXT, worker_version TEXT, job_key TEXT, mode TEXT, status TEXT,
  window_start TEXT, window_end TEXT, calendar_games_checked INTEGER DEFAULT 0, prepared_games_checked INTEGER DEFAULT 0, prepared_rows_read INTEGER DEFAULT 0,
  teams_checked INTEGER DEFAULT 0, team_rows_written INTEGER DEFAULT 0, pitcher_rows_written INTEGER DEFAULT 0, snapshot_rows_written INTEGER DEFAULT 0,
  source_failures INTEGER DEFAULT 0, blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, high_risk_team_count INTEGER DEFAULT 0, unknown_team_count INTEGER DEFAULT 0,
  certification_status TEXT, certification_grade TEXT, certification_reason TEXT, output_json JSONB,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.bullpen_pitcher_availability_current (
  pitcher_availability_key TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, team_id BIGINT, pitcher_id BIGINT, pitcher_name TEXT,
  pitcher_hand TEXT, role_hint TEXT, active_roster_flag INTEGER, availability_status TEXT, availability_confidence TEXT,
  pitches_last_1_day INTEGER DEFAULT 0, pitches_last_2_days INTEGER DEFAULT 0, pitches_last_3_days INTEGER DEFAULT 0,
  outs_last_1_day INTEGER DEFAULT 0, outs_last_2_days INTEGER DEFAULT 0, outs_last_3_days INTEGER DEFAULT 0,
  appearances_last_1_day INTEGER DEFAULT 0, appearances_last_2_days INTEGER DEFAULT 0, appearances_last_3_days INTEGER DEFAULT 0,
  back_to_back_flag INTEGER DEFAULT 0, high_pitch_recent_flag INTEGER DEFAULT 0, likely_unavailable_flag INTEGER DEFAULT 0,
  notes TEXT, source_snapshot_at TIMESTAMPTZ, details_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.bullpen_availability_snapshots (
  snapshot_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, team_id BIGINT, bullpen_status TEXT,
  availability_grade TEXT, bullpen_fatigue_score INTEGER, bullpen_risk_level TEXT, source_snapshot_at TIMESTAMPTZ,
  details_json JSONB, raw_json JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.bullpen_availability_issues (
  issue_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, team_id BIGINT, pitcher_id BIGINT,
  issue_status TEXT, issue_type TEXT, severity TEXT, reason TEXT, details_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bullpen_pitcher_team ON daily.bullpen_pitcher_availability_current(official_date, team_id, pitcher_id);
CREATE INDEX IF NOT EXISTS idx_bullpen_snap_batch ON daily.bullpen_availability_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_bullpen_issues_batch ON daily.bullpen_availability_issues(batch_id);`);
}

async function pruneRetention(pg, retention) {
  const keepDatesLiteral = "{" + retention.dates.map(d => `"${d}"`).join(",") + "}";
  const current = await pg.unsafe(`DELETE FROM daily.bullpen_availability_current WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const pitcher = await pg.unsafe(`DELETE FROM daily.bullpen_pitcher_availability_current WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const snapshots = await pg.unsafe(`DELETE FROM daily.bullpen_availability_snapshots WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const issues = await pg.unsafe(`DELETE FROM daily.bullpen_availability_issues WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  return { current_deleted: current.count ?? null, pitcher_current_deleted: pitcher.count ?? null, snapshots_deleted: snapshots.count ?? null, issues_deleted: issues.count ?? null, retention_date_start: retention.start, retention_date_end: retention.end };
}
async function retirePriorOperationalCurrentForWindow(pg, retention, batchId) {
  const current = await pg.unsafe(`DELETE FROM daily.bullpen_availability_current WHERE official_date = ANY($1::text[]) AND (batch_id IS NULL OR batch_id <> $2)`, ["{" + retention.dates.map(d => `"${d}"`).join(",") + "}", batchId]);
  const pitcher = await pg.unsafe(`DELETE FROM daily.bullpen_pitcher_availability_current WHERE official_date = ANY($1::text[]) AND (batch_id IS NULL OR batch_id <> $2)`, ["{" + retention.dates.map(d => `"${d}"`).join(",") + "}", batchId]);
  return { current_deleted: current.count ?? null, pitcher_current_deleted: pitcher.count ?? null, retention_date_start: retention.start, retention_date_end: retention.end, policy: "retire_prior_current_only_after_new_batch_core_is_db_verified" };
}

async function getPreparedTeamRows(pg, retention) {
  return await pg`SELECT official_game_pk, official_game_time_utc, official_date::text AS official_date, team_full_name, opponent_full_name, COUNT(*) AS prepared_board_pickable_rows
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL AND official_date IN ${pg(retention.dates)}
    GROUP BY official_game_pk, official_game_time_utc, official_date, team_full_name, opponent_full_name
    ORDER BY official_game_time_utc, official_game_pk, team_full_name`;
}
async function getCalendar(pg, gamePks) {
  if (!gamePks.length) return [];
  return await pg`SELECT game_pk, official_date::text AS official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, detailed_state, abstract_game_state, is_pregame, is_live, is_final, is_postponed, is_cancelled, doubleheader, game_number
    FROM calendar.game_calendar WHERE game_pk IN ${pg(gamePks)}`;
}
// Real schema note: team.bullpen_history's real Postgres schema is much simpler than the old D1
// table - it stores only game_pk/team_id/player_id/is_home/innings_pitched_decimal/earned_runs/
// hits_allowed/walks_allowed/strikeouts as first-class columns, with the FULL original MLB
// boxscore stat line (pitches, outs, saves, holds, gamesStarted/gamesPitched) preserved inside
// raw_json->'stat' and the pitcher's name inside raw_json->'player'->>'fullName'. Extracting all
// needed fields from raw_json here rather than assuming columns that don't exist. Also
// normalizes team_id (confirmed real mixed mlb_-prefixed/bare convention, same bug class fixed
// for lineups/starters) via regexp_replace.
async function getBullpenRows(pg, teamIds, startDate, endDate) {
  if (!teamIds.length) return [];
  const teamIdStrs = teamIds.map(String);
  return await pg`SELECT
      game_date::text AS game_date, game_pk, regexp_replace(team_id, '^mlb_', '') AS team_id, regexp_replace(opponent_team_id, '^mlb_', '') AS opponent_team_id,
      is_home, player_id AS pitcher_id, raw_json->'player'->>'fullName' AS pitcher_name,
      NULLIF(raw_json->'stat'->>'gamesStarted','')::int AS games_started, NULLIF(raw_json->'stat'->>'gamesPitched','')::int AS games_pitched,
      NULLIF(raw_json->'stat'->>'outs','')::int AS outs_recorded, NULLIF(raw_json->'stat'->>'numberOfPitches','')::int AS pitches,
      NULLIF(raw_json->'stat'->>'battersFaced','')::int AS batters_faced, NULLIF(raw_json->'stat'->>'holds','')::int AS holds,
      NULLIF(raw_json->'stat'->>'saves','')::int AS saves, NULLIF(raw_json->'stat'->>'blownSaves','')::int AS blown_saves,
      NULLIF(raw_json->'stat'->>'inheritedRunners','')::int AS inherited_runners, NULLIF(raw_json->'stat'->>'inheritedRunnersScored','')::int AS inherited_runners_scored
    FROM team.bullpen_history
    WHERE game_date >= ${startDate} AND game_date <= ${endDate} AND regexp_replace(team_id, '^mlb_', '') IN ${pg(teamIdStrs)}
      AND COALESCE(NULLIF(raw_json->'stat'->>'gamesStarted','')::int, 0) = 0 AND COALESCE(NULLIF(raw_json->'stat'->>'gamesPitched','')::int, 0) > 0`;
}
async function getRecentCalendarRows(pg, teamIds, startDate, endDate) {
  if (!teamIds.length) return [];
  return await pg`SELECT game_pk, official_date::text AS official_date, home_team_id, away_team_id, doubleheader, game_number, is_final, abstract_game_state
    FROM calendar.game_calendar WHERE official_date >= ${startDate} AND official_date <= ${endDate} AND (home_team_id IN ${pg(teamIds)} OR away_team_id IN ${pg(teamIds)})`;
}
async function getPitcherHands(pg, playerIds) {
  const ids = [...new Set(playerIds.filter(Boolean).map(Number))];
  const map = new Map();
  if (!ids.length) return map;
  const rows = await pg`SELECT player_id, mlb_player_id, throw_side FROM ref.players WHERE player_id IN ${pg(ids)} OR mlb_player_id IN ${pg(ids)}`;
  for (const r of rows) {
    if (r.player_id !== null && r.player_id !== undefined) map.set(Number(r.player_id), r.throw_side || null);
    if (r.mlb_player_id !== null && r.mlb_player_id !== undefined) map.set(Number(r.mlb_player_id), r.throw_side || null);
  }
  return map;
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
    targets.push({ game_pk: gamePk, official_date: dateOnly(cal.official_date), game_time_utc: cal.game_time_utc, team_id: toInt(cal.home_team_id), team_name: cal.home_team_name, opponent_team_id: toInt(cal.away_team_id), opponent_team_name: cal.away_team_name, is_home: 1, prepared_board_pickable_rows: homeRows, calendar: cal });
    targets.push({ game_pk: gamePk, official_date: dateOnly(cal.official_date), game_time_utc: cal.game_time_utc, team_id: toInt(cal.away_team_id), team_name: cal.away_team_name, opponent_team_id: toInt(cal.home_team_id), opponent_team_name: cal.home_team_name, is_home: 0, prepared_board_pickable_rows: awayRows, calendar: cal });
  }
  return targets.filter(t => t.team_id && t.game_pk && t.official_date);
}
function lastNGameDates(rows, teamId, beforeDateExclusive, n) {
  const dates = [...new Set(rows.filter(r => String(r.team_id) === String(teamId) && dateOnly(r.game_date) < beforeDateExclusive).map(r => dateOnly(r.game_date)))];
  dates.sort((a, b) => b.localeCompare(a));
  return dates.slice(0, n);
}
function rowsInWindow(rows, teamId, endDate, days) {
  const recentDates = new Set(lastNGameDates(rows, teamId, endDate, days));
  return rows.filter(r => String(r.team_id) === String(teamId) && recentDates.has(dateOnly(r.game_date)));
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
  const recentSaves = sumRows(two, "saves");
  const recentHolds = sumRows(two, "holds");
  return {
    pitches1: sumRows(one, "pitches"), pitches2: sumRows(two, "pitches"), pitches3: sumRows(three, "pitches"),
    outs1: sumRows(one, "outs_recorded"), outs2: sumRows(two, "outs_recorded"), outs3: sumRows(three, "outs_recorded"),
    app1: distinctCount(one, "game_pk"), app2: distinctCount(two, "game_pk"), app3: distinctCount(three, "game_pk"),
    backToBack: dates.has(yesterday) && dates.has(twoBack) ? 1 : 0,
    highPitch: sumRows(one, "pitches") >= 25 || sumRows(two, "pitches") >= 35 ? 1 : 0,
    likelyUnavailable: (dates.has(yesterday) && dates.has(twoBack)) || sumRows(one, "pitches") >= 35 || sumRows(two, "pitches") >= 45 || distinctCount(three, "game_pk") >= 3 ? 1 : 0,
    recentSaves, recentHolds, isRecentCloser: recentSaves > 0 ? 1 : 0, isRecentSetup: recentHolds > 0 ? 1 : 0, dates: Array.from(dates).sort()
  };
}
function classifyTarget(target, bullpenRows, recentCalendarRows) {
  const one = rowsInWindow(bullpenRows, target.team_id, target.official_date, 1);
  const two = rowsInWindow(bullpenRows, target.team_id, target.official_date, 2);
  const three = rowsInWindow(bullpenRows, target.team_id, target.official_date, 3);
  const recentCal = recentCalendarRows.filter(r => { const d = dateOnly(r.official_date); return d >= addDays(target.official_date, -21) && d < target.official_date && (Number(r.home_team_id) === Number(target.team_id) || Number(r.away_team_id) === Number(target.team_id)); });
  const finalRecentGames = recentCal.filter(r => Number(r.is_final) === 1 || String(r.abstract_game_state || "").toLowerCase() === "final");
  const games1 = distinctCount(one, "game_pk"), games2 = distinctCount(two, "game_pk"), games3 = distinctCount(three, "game_pk");
  const pitches1 = sumRows(one, "pitches"), pitches2 = sumRows(two, "pitches"), pitches3 = sumRows(three, "pitches");
  const outs1 = sumRows(one, "outs_recorded"), outs2 = sumRows(two, "outs_recorded"), outs3 = sumRows(three, "outs_recorded");
  const pitchers1 = distinctCount(one, "pitcher_id"), pitchers2 = distinctCount(two, "pitcher_id"), pitchers3 = distinctCount(three, "pitcher_id");
  const pitcherIds = Array.from(new Set(three.map(r => Number(r.pitcher_id)).filter(Boolean)));
  const pitcherRisk = pitcherIds.map(pid => ({ pitcher_id: pid, row: three.find(r => Number(r.pitcher_id) === pid), metrics: relieverMetrics(bullpenRows, target.team_id, target.official_date, pid) }));
  const highUsage = pitcherRisk.filter(p => p.metrics.highPitch).length;
  const backToBack = pitcherRisk.filter(p => p.metrics.backToBack).length;
  const likelyUnavailable = pitcherRisk.filter(p => p.metrics.likelyUnavailable).length;
  const closerRecentUsage = pitcherRisk.some(p => p.metrics.isRecentCloser) ? 1 : 0;
  const setupRecentUsage = pitcherRisk.some(p => p.metrics.isRecentSetup) ? 1 : 0;
  const doubleheaderRecent = recentCal.some(r => String(r.doubleheader || "").toUpperCase() !== "N" || Number(r.game_number || 1) > 1) ? 1 : 0;
  const issues = [];
  if (games3 === 0 && finalRecentGames.length === 0) issues.push({ severity: "info", issue_type: "no_recent_games", reason: "No recent final calendar games or bullpen usage found in the 3-day lookback; bullpen treated as rested/normal from off-days." });
  if (games3 === 0 && finalRecentGames.length > 0) issues.push({ severity: "blocker", issue_type: "missing_bullpen_history", reason: "Recent final calendar games exist for this team, but no bullpen_history relief rows were found in the lookback." });
  if (pitches1 >= 80) issues.push({ severity: "warning", issue_type: "bullpen_taxed_yesterday", reason: "Team bullpen pitches last 1 day reached warning threshold." });
  if (pitches2 >= 130) issues.push({ severity: "warning", issue_type: "bullpen_high_risk_two_day_load", reason: "Team bullpen pitches last 2 days reached high-risk threshold." });
  if (highUsage > 0) issues.push({ severity: "warning", issue_type: "high_usage_relievers", reason: "One or more relievers reached conservative recent pitch-load thresholds." });
  if (backToBack > 0) issues.push({ severity: "warning", issue_type: "back_to_back_relievers", reason: "One or more relievers appeared on back-to-back recent dates." });
  if (closerRecentUsage) issues.push({ severity: "warning", issue_type: "closer_recent_usage", reason: "Team's closer recorded a save within the last 2 days and may be unavailable or a lower-leverage option today." });
  if (setupRecentUsage) issues.push({ severity: "warning", issue_type: "setup_recent_usage", reason: "A recent setup/hold reliever pitched within the last 2 days." });
  if (doubleheaderRecent) issues.push({ severity: "warning", issue_type: "doubleheader_recent", reason: "Recent calendar rows indicate doubleheader context." });
  let score = 0;
  if (pitches1 >= 80) score += 35; else if (pitches1 >= 60) score += 22; else if (pitches1 >= 40) score += 10;
  if (pitches2 >= 130) score += 30; else if (pitches2 >= 100) score += 18;
  if (pitches3 >= 180) score += 15;
  score += Math.min(20, highUsage * 5);
  score += Math.min(20, backToBack * 8);
  score += Math.min(15, likelyUnavailable * 5);
  if (closerRecentUsage) score += 12;
  if (setupRecentUsage) score += 6;
  if (doubleheaderRecent) score += 10;
  score = Math.max(0, Math.min(100, score));
  const blockers = issues.filter(i => i.severity === "blocker").length;
  let status = "normal", risk = "low", grade = "PASS", confidence = "HIGH_RECENT_HISTORY_COMPLETE";
  if (blockers) { status = "blocked"; risk = "blocked"; grade = "FAIL"; confidence = "BLOCKED_NO_RECENT_HISTORY"; }
  else if (score >= 75) { status = "depleted"; risk = "severe"; grade = "PASS_WITH_WARNINGS"; confidence = "WARNING_BULLPEN_TAXED"; }
  else if (score >= 55) { status = "high_risk"; risk = "high"; grade = "PASS_WITH_WARNINGS"; confidence = "WARNING_BULLPEN_TAXED"; }
  else if (score >= 30) { status = "taxed"; risk = "medium"; grade = "PASS_WITH_WARNINGS"; confidence = "WARNING_BULLPEN_TAXED"; }
  else if (games3 === 0) { status = "rested"; risk = "low"; grade = "PASS"; confidence = "MEDIUM_RECENT_HISTORY_OFFDAY_CONTEXT"; }
  return { games1, games2, games3, pitches1, pitches2, pitches3, outs1, outs2, outs3, pitchers1, pitchers2, pitchers3, highUsage, backToBack, likelyUnavailable, doubleheaderRecent, closerRecentUsage, setupRecentUsage, restedRelieverCount: Math.max(0, pitcherIds.length - likelyUnavailable), unknownRelieverCount: 0, fatigueScore: score, status, risk, grade, confidence, issues, pitcherRisk };
}
async function verifyCoreCoverage(pg, batchId, targets) {
  const currentRows = await pg`SELECT official_date, game_pk, team_id FROM daily.bullpen_availability_current WHERE batch_id=${batchId}`;
  const snapshotRows = await pg`SELECT official_date, game_pk, team_id FROM daily.bullpen_availability_snapshots WHERE batch_id=${batchId}`;
  const currentKeys = new Set(currentRows.map(r => `${dateOnly(r.official_date)}|${Number(r.game_pk)}|${Number(r.team_id)}`));
  const snapshotKeys = new Set(snapshotRows.map(r => `${dateOnly(r.official_date)}|${Number(r.game_pk)}|${Number(r.team_id)}`));
  const expectedKeys = targets.map(t => `${dateOnly(t.official_date)}|${Number(t.game_pk)}|${Number(t.team_id)}`);
  const missingCurrent = [], missingSnapshots = [];
  for (const t of targets) {
    const key = `${dateOnly(t.official_date)}|${Number(t.game_pk)}|${Number(t.team_id)}`;
    const row = { official_date: t.official_date, game_pk: t.game_pk, team_id: t.team_id, team_name: t.team_name, prepared_board_pickable_rows: Number(t.prepared_board_pickable_rows || 0) };
    if (!currentKeys.has(key)) missingCurrent.push(row);
    if (!snapshotKeys.has(key)) missingSnapshots.push(row);
  }
  return { expected_team_rows: expectedKeys.length, current_rows: currentRows.length, snapshot_rows: snapshotRows.length, unique_current_team_keys: currentKeys.size, unique_snapshot_team_keys: snapshotKeys.size, missing_current_count: missingCurrent.length, missing_snapshot_count: missingSnapshots.length, missing_current: missingCurrent.slice(0, 40), missing_snapshots: missingSnapshots.slice(0, 40), core_complete: expectedKeys.length === currentKeys.size && expectedKeys.length === snapshotKeys.size && missingCurrent.length === 0 && missingSnapshots.length === 0 };
}

async function writeCore(pg, batchId, classifiedTargets, sourceSnapshotAt) {
  if (!classifiedTargets.length) return { current_written: 0, snapshot_written: 0, issues_written: 0 };
  const currentRows = classifiedTargets.map(({ target, classified }) => {
    const key = `${target.official_date}_${target.game_pk}_${target.team_id}`;
    return {
      bullpen_id: key, batch_id: batchId, official_date: target.official_date, game_pk: target.game_pk, game_time_utc: target.game_time_utc, team_id: target.team_id, team_name: target.team_name,
      opponent_team_id: target.opponent_team_id, opponent_team_name: target.opponent_team_name, is_home: target.is_home, prepared_board_relevant: 1, prepared_board_pickable_rows: Number(target.prepared_board_pickable_rows || 0),
      bullpen_status: classified.status, bullpen_confidence: classified.confidence, availability_grade: classified.grade, recent_games_window_start: addDays(target.official_date, -3), recent_games_window_end: addDays(target.official_date, -1),
      games_checked: classified.games3, games_played_last_1_day: classified.games1, games_played_last_2_days: classified.games2, games_played_last_3_days: classified.games3,
      bullpen_pitchers_used_last_1_day: classified.pitchers1, bullpen_pitchers_used_last_2_days: classified.pitchers2, bullpen_pitchers_used_last_3_days: classified.pitchers3,
      bullpen_pitches_last_1_day: classified.pitches1, bullpen_pitches_last_2_days: classified.pitches2, bullpen_pitches_last_3_days: classified.pitches3,
      bullpen_outs_last_1_day: classified.outs1, bullpen_outs_last_2_days: classified.outs2, bullpen_outs_last_3_days: classified.outs3,
      high_usage_reliever_count: classified.highUsage, back_to_back_reliever_count: classified.backToBack, likely_unavailable_reliever_count: classified.likelyUnavailable,
      rested_reliever_count: classified.restedRelieverCount, unknown_reliever_count: classified.unknownRelieverCount, closer_recent_usage_flag: classified.closerRecentUsage,
      setup_recent_usage_flag: classified.setupRecentUsage, doubleheader_recent_flag: classified.doubleheaderRecent, extra_innings_recent_flag: 0, bullpen_fatigue_score: classified.fatigueScore,
      bullpen_risk_level: classified.risk, source_key: "team_db_bullpen_history", source_endpoint: "team.bullpen_history + calendar.game_calendar + score.board_prepared_current",
      source_snapshot_at: sourceSnapshotAt, data_source_level: "real", is_temporary_derived: 0,
      details_json: safeJson({ issues: classified.issues, pitcher_count: classified.pitcherRisk.length }, 4000),
      raw_json: safeJson({ target, classified, thresholds: { pitcher_high_1_day: 25, pitcher_high_2_day: 35, team_taxed_1_day: 80, team_high_risk_2_day: 130 } }, 12000)
    };
  });
  const currentCols = ["bullpen_id", "batch_id", "official_date", "game_pk", "game_time_utc", "team_id", "team_name", "opponent_team_id", "opponent_team_name", "is_home", "prepared_board_relevant", "prepared_board_pickable_rows", "bullpen_status", "bullpen_confidence", "availability_grade", "recent_games_window_start", "recent_games_window_end", "games_checked", "games_played_last_1_day", "games_played_last_2_days", "games_played_last_3_days", "bullpen_pitchers_used_last_1_day", "bullpen_pitchers_used_last_2_days", "bullpen_pitchers_used_last_3_days", "bullpen_pitches_last_1_day", "bullpen_pitches_last_2_days", "bullpen_pitches_last_3_days", "bullpen_outs_last_1_day", "bullpen_outs_last_2_days", "bullpen_outs_last_3_days", "high_usage_reliever_count", "back_to_back_reliever_count", "likely_unavailable_reliever_count", "rested_reliever_count", "unknown_reliever_count", "closer_recent_usage_flag", "setup_recent_usage_flag", "doubleheader_recent_flag", "extra_innings_recent_flag", "bullpen_fatigue_score", "bullpen_risk_level", "source_key", "source_endpoint", "source_snapshot_at", "data_source_level", "is_temporary_derived", "details_json", "raw_json"];
  await pg`INSERT INTO daily.bullpen_availability_current ${pg(currentRows, ...currentCols)}
    ON CONFLICT (bullpen_id) DO UPDATE SET batch_id=excluded.batch_id, game_time_utc=excluded.game_time_utc, team_name=excluded.team_name, opponent_team_id=excluded.opponent_team_id,
    opponent_team_name=excluded.opponent_team_name, is_home=excluded.is_home, prepared_board_pickable_rows=excluded.prepared_board_pickable_rows, bullpen_status=excluded.bullpen_status,
    bullpen_confidence=excluded.bullpen_confidence, availability_grade=excluded.availability_grade, recent_games_window_start=excluded.recent_games_window_start, recent_games_window_end=excluded.recent_games_window_end,
    games_checked=excluded.games_checked, games_played_last_1_day=excluded.games_played_last_1_day, games_played_last_2_days=excluded.games_played_last_2_days, games_played_last_3_days=excluded.games_played_last_3_days,
    bullpen_pitchers_used_last_1_day=excluded.bullpen_pitchers_used_last_1_day, bullpen_pitchers_used_last_2_days=excluded.bullpen_pitchers_used_last_2_days, bullpen_pitchers_used_last_3_days=excluded.bullpen_pitchers_used_last_3_days,
    bullpen_pitches_last_1_day=excluded.bullpen_pitches_last_1_day, bullpen_pitches_last_2_days=excluded.bullpen_pitches_last_2_days, bullpen_pitches_last_3_days=excluded.bullpen_pitches_last_3_days,
    bullpen_outs_last_1_day=excluded.bullpen_outs_last_1_day, bullpen_outs_last_2_days=excluded.bullpen_outs_last_2_days, bullpen_outs_last_3_days=excluded.bullpen_outs_last_3_days,
    high_usage_reliever_count=excluded.high_usage_reliever_count, back_to_back_reliever_count=excluded.back_to_back_reliever_count, likely_unavailable_reliever_count=excluded.likely_unavailable_reliever_count,
    rested_reliever_count=excluded.rested_reliever_count, unknown_reliever_count=excluded.unknown_reliever_count, closer_recent_usage_flag=excluded.closer_recent_usage_flag, setup_recent_usage_flag=excluded.setup_recent_usage_flag,
    doubleheader_recent_flag=excluded.doubleheader_recent_flag, bullpen_fatigue_score=excluded.bullpen_fatigue_score, bullpen_risk_level=excluded.bullpen_risk_level, source_snapshot_at=excluded.source_snapshot_at,
    last_seen_at=now(), details_json=excluded.details_json, raw_json=excluded.raw_json, updated_at=now()`;

  const snapshotRows = classifiedTargets.map(({ target, classified }) => ({ snapshot_id: rid("bullpen_snap"), batch_id: batchId, official_date: target.official_date, game_pk: target.game_pk, team_id: target.team_id, bullpen_status: classified.status, availability_grade: classified.grade, bullpen_fatigue_score: classified.fatigueScore, bullpen_risk_level: classified.risk, source_snapshot_at: sourceSnapshotAt, details_json: safeJson({ target, issues: classified.issues }, 4000), raw_json: safeJson({ target, classified }, 8000) }));
  const snapshotCols = ["snapshot_id", "batch_id", "official_date", "game_pk", "team_id", "bullpen_status", "availability_grade", "bullpen_fatigue_score", "bullpen_risk_level", "source_snapshot_at", "details_json", "raw_json"];
  await pg`INSERT INTO daily.bullpen_availability_snapshots ${pg(snapshotRows, ...snapshotCols)}`;

  const issueRows = [];
  for (const { target, classified } of classifiedTargets) {
    for (const issue of classified.issues) issueRows.push({ issue_id: rid("bullpen_issue"), batch_id: batchId, official_date: target.official_date, game_pk: target.game_pk, team_id: target.team_id, pitcher_id: null, issue_status: "active", issue_type: issue.issue_type || "unknown", severity: issue.severity || "warning", reason: issue.reason || "", details_json: safeJson({ target, issue }, 4000) });
  }
  if (issueRows.length) {
    const issueCols = ["issue_id", "batch_id", "official_date", "game_pk", "team_id", "pitcher_id", "issue_status", "issue_type", "severity", "reason", "details_json"];
    await pg`INSERT INTO daily.bullpen_availability_issues ${pg(issueRows, ...issueCols)}`;
  }
  return { current_written: currentRows.length, snapshot_written: snapshotRows.length, issues_written: issueRows.length };
}
async function writeIssue(pg, batchId, target, issue) {
  await pg`INSERT INTO daily.bullpen_availability_issues ${pg([{ issue_id: rid("bullpen_issue"), batch_id: batchId, official_date: target.official_date, game_pk: target.game_pk, team_id: target.team_id, pitcher_id: null, issue_status: "active", issue_type: issue.issue_type || "unknown", severity: issue.severity || "warning", reason: issue.reason || "", details_json: safeJson({ target, issue }, 4000) }], "issue_id", "batch_id", "official_date", "game_pk", "team_id", "pitcher_id", "issue_status", "issue_type", "severity", "reason", "details_json")}`;
}
async function writePitchers(pg, batchId, classifiedTargets, sourceSnapshotAt, pitcherHands) {
  const rows = [];
  for (const { target, classified } of classifiedTargets) {
    for (const p of classified.pitcherRisk.slice(0, MAX_PITCHER_DETAIL_ROWS_PER_TEAM)) {
      const row = p.row || {};
      const m = p.metrics;
      const status = m.likelyUnavailable ? "likely_unavailable" : (m.highPitch || m.backToBack ? "limited" : "available");
      const confidence = m.likelyUnavailable ? "WARNING_HIGH_PITCH_RECENT" : (m.highPitch ? "WARNING_HIGH_PITCH_RECENT" : (m.backToBack ? "WARNING_BACK_TO_BACK_USAGE" : "HIGH_RECENT_HISTORY_COMPLETE"));
      const key = `${target.official_date}_${target.team_id}_${p.pitcher_id}`;
      rows.push({ pitcher_availability_key: key, batch_id: batchId, official_date: target.official_date, team_id: target.team_id, pitcher_id: p.pitcher_id, pitcher_name: row.pitcher_name || null, pitcher_hand: pitcherHands.get(Number(p.pitcher_id)) || null, role_hint: "reliever", availability_status: status, availability_confidence: confidence, pitches_last_1_day: m.pitches1, pitches_last_2_days: m.pitches2, pitches_last_3_days: m.pitches3, outs_last_1_day: m.outs1, outs_last_2_days: m.outs2, outs_last_3_days: m.outs3, appearances_last_1_day: m.app1, appearances_last_2_days: m.app2, appearances_last_3_days: m.app3, back_to_back_flag: m.backToBack, high_pitch_recent_flag: m.highPitch, likely_unavailable_flag: m.likelyUnavailable, notes: m.dates.join(","), source_snapshot_at: sourceSnapshotAt, details_json: safeJson({ target_game_pk: target.game_pk, team_name: target.team_name, dates_used: m.dates }, 3000) });
    }
  }
  if (!rows.length) return 0;
  const cols = ["pitcher_availability_key", "batch_id", "official_date", "team_id", "pitcher_id", "pitcher_name", "pitcher_hand", "role_hint", "availability_status", "availability_confidence", "pitches_last_1_day", "pitches_last_2_days", "pitches_last_3_days", "outs_last_1_day", "outs_last_2_days", "outs_last_3_days", "appearances_last_1_day", "appearances_last_2_days", "appearances_last_3_days", "back_to_back_flag", "high_pitch_recent_flag", "likely_unavailable_flag", "notes", "source_snapshot_at", "details_json"];
  await pg`INSERT INTO daily.bullpen_pitcher_availability_current ${pg(rows, ...cols)}
    ON CONFLICT (pitcher_availability_key) DO UPDATE SET batch_id=excluded.batch_id, pitcher_name=excluded.pitcher_name, pitcher_hand=excluded.pitcher_hand, availability_status=excluded.availability_status,
    availability_confidence=excluded.availability_confidence, pitches_last_1_day=excluded.pitches_last_1_day, pitches_last_2_days=excluded.pitches_last_2_days, pitches_last_3_days=excluded.pitches_last_3_days,
    outs_last_1_day=excluded.outs_last_1_day, outs_last_2_days=excluded.outs_last_2_days, outs_last_3_days=excluded.outs_last_3_days, appearances_last_1_day=excluded.appearances_last_1_day,
    appearances_last_2_days=excluded.appearances_last_2_days, appearances_last_3_days=excluded.appearances_last_3_days, back_to_back_flag=excluded.back_to_back_flag, high_pitch_recent_flag=excluded.high_pitch_recent_flag,
    likely_unavailable_flag=excluded.likely_unavailable_flag, notes=excluded.notes, source_snapshot_at=excluded.source_snapshot_at, details_json=excluded.details_json, updated_at=now()`;
  return rows.length;
}

async function runBullpen(env, input) {
  const runStartedMs = Date.now();
  const pg = pgClient(env);
  try {
    await ensureSchema(pg);
    const requestId = input.request_id || rid("daily_bullpen_req");
    const batchId = rid("daily_bullpen_batch");
    const sourceSnapshotAt = nowUtc();
    const nowIsoForWindow = new Date().toISOString();
    const realBoardDateRows = await pg.unsafe(`SELECT DISTINCT official_date::text AS official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > $1`, [nowIsoForWindow]);
    const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
    const retention = retentionWindowPt(realBoardDates);
    await pg.unsafe(`INSERT INTO daily.bullpen_availability_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8,$9,$10)`,
      [batchId, requestId, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_bullpen_availability_refresh_window", retention.start, retention.end, sourceSnapshotAt]);

    const prePrune = await pruneRetention(pg, retention);
    let operationalCurrentRetire = null;
    const prepared = await getPreparedTeamRows(pg, retention);
    const gamePks = [...new Set(prepared.map(r => Number(r.official_game_pk)).filter(Boolean))];
    const calendars = await getCalendar(pg, gamePks);
    const targets = makeTargets(prepared, calendars).filter(t => Number(t.prepared_board_pickable_rows || 0) > 0);
    const teamIds = [...new Set(targets.map(t => Number(t.team_id)).filter(Boolean))];
    const minDate = targets.length ? targets.map(t => addDays(t.official_date, -21)).sort()[0] : addDays(retention.start, -21);
    const maxDate = targets.length ? targets.map(t => addDays(t.official_date, -1)).sort().slice(-1)[0] : retention.end;
    const bullpenRows = await getBullpenRows(pg, teamIds, minDate, maxDate);
    const recentCalendarRows = await getRecentCalendarRows(pg, teamIds, minDate, maxDate);
    let currentWritten = 0, snapshotWritten = 0, issuesWritten = 0, pitcherWritten = 0;
    let deadlineSoftStopped = false;
    const fullRunChild = Boolean(input && input.daily_context_full_run_child);
    const summaries = [];
    const classifiedTargets = targets.map(target => {
      const classified = classifyTarget(target, bullpenRows, recentCalendarRows);
      summaries.push({ game_pk: target.game_pk, team_id: target.team_id, team_name: target.team_name, status: classified.status, risk: classified.risk, score: classified.fatigueScore, pitches_last_1_day: classified.pitches1, pitches_last_2_days: classified.pitches2, relievers_last_3_days: classified.pitchers3, high_usage_relievers: classified.highUsage, back_to_back_relievers: classified.backToBack, likely_unavailable_relievers: classified.likelyUnavailable, issues: classified.issues.length });
      return { target, classified };
    });

    const coreWritten = await writeCore(pg, batchId, classifiedTargets, sourceSnapshotAt);
    currentWritten = coreWritten.current_written; snapshotWritten = coreWritten.snapshot_written; issuesWritten = coreWritten.issues_written;

    const coreCoverage = await verifyCoreCoverage(pg, batchId, targets);
    if (coreCoverage.core_complete) operationalCurrentRetire = await retirePriorOperationalCurrentForWindow(pg, retention, batchId);

    const pitcherDetailDeferred = fullRunChild || deadlineExceeded(runStartedMs);
    if (pitcherDetailDeferred && targets.length > 0) {
      deadlineSoftStopped = true;
      const issueTarget = targets[0] || { official_date: retention.start, game_pk: null, team_id: null };
      await writeIssue(pg, batchId, issueTarget, { severity: "warning", issue_type: "daily_bullpen_pitcher_detail_deferred_core_complete", reason: "Daily bullpen wrote and DB-verified complete team/snapshot core coverage first; pitcher detail rows are deferred in Full Run to stay under runtime budgets." });
      issuesWritten += 1;
    } else {
      const allPitcherIds = classifiedTargets.flatMap(({ classified }) => classified.pitcherRisk.slice(0, MAX_PITCHER_DETAIL_ROWS_PER_TEAM).map(p => p.pitcher_id));
      const pitcherHands = await getPitcherHands(pg, allPitcherIds);
      pitcherWritten = await writePitchers(pg, batchId, classifiedTargets, sourceSnapshotAt, pitcherHands);
    }
    if (!coreCoverage.core_complete && targets.length > 0) {
      const issueTarget = targets[0] || { official_date: retention.start, game_pk: null, team_id: null };
      await writeIssue(pg, batchId, issueTarget, { severity: "blocker", issue_type: "daily_bullpen_core_coverage_incomplete", reason: "Daily bullpen did not write one current and one snapshot row for every prepared-board relevant game/team target." });
      issuesWritten += 1;
    }
    const postPrune = await pruneRetention(pg, retention);
    const blockerCount = summaries.reduce((n, s) => n + (s.status === "blocked" ? 1 : 0), 0) + (coreCoverage.core_complete ? 0 : (targets.length > 0 ? 1 : 0));
    const warningRows = await pg`SELECT COUNT(*) AS c FROM daily.bullpen_availability_issues WHERE batch_id=${batchId} AND severity='warning'`;
    const warningN = Number(warningRows[0] && warningRows[0].c || 0);
    const highRiskTeamCount = summaries.filter(s => ["high", "severe"].includes(s.risk)).length;
    const unknownTeamCount = summaries.filter(s => ["unknown", "blocked"].includes(s.risk)).length;
    const noPickableSlate = prepared.length === 0 || targets.length === 0;
    const coverageOk = noPickableSlate || coreCoverage.core_complete;
    const dataOk = noPickableSlate || (coverageOk && blockerCount === 0);
    const certification = noPickableSlate ? "DAILY_BULLPEN_NO_PICKABLE_SAFE_GAMES_IN_WINDOW" : (dataOk ? (deadlineSoftStopped ? "DAILY_BULLPEN_CERTIFIED_CORE_COMPLETE_PITCHER_DETAIL_LIMITED" : (warningN ? "DAILY_BULLPEN_CERTIFIED_WITH_WARNINGS" : "DAILY_BULLPEN_CERTIFIED_READY")) : "DAILY_BULLPEN_FAILED_BLOCKERS_OR_COVERAGE");
    const grade = noPickableSlate ? "VALID_ZERO" : (dataOk ? (deadlineSoftStopped || warningN ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL");
    const status = dataOk ? "completed" : "failed_blockers_or_coverage";
    const output = {
      ok: dataOk, data_ok: dataOk, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, batch_id: batchId, status, certification, certification_grade: grade,
      certification_reason: noPickableSlate ? "No prepared-board pickable_safe games exist for today/tomorrow retention window." : (dataOk ? (deadlineSoftStopped ? "Every prepared-board relevant team was DB-verified with one bullpen current row and one snapshot row; pitcher detail rows may be limited by soft deadline." : "Every prepared-board relevant team was DB-verified with one bullpen current row and one snapshot row; warnings are sidecar issues.") : "One or more prepared-board relevant teams failed strict DB verification for core bullpen current/snapshot coverage, or real source blockers exist."),
      window_start: retention.start, window_end: retention.end, calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length,
      prepared_rows_read: prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0), teams_checked: targets.length, team_rows_written: currentWritten, pitcher_rows_written: pitcherWritten,
      snapshot_rows_written: snapshotWritten, issues_written: issuesWritten, source_failures: 0, blocker_count: blockerCount, warning_count: warningN, deadline_soft_stopped: deadlineSoftStopped,
      core_team_snapshot_coverage_complete: coverageOk, core_coverage_verification: coreCoverage, run_deadline_ms: RUN_DEADLINE_MS, max_pitcher_detail_rows_per_team: MAX_PITCHER_DETAIL_ROWS_PER_TEAM,
      high_risk_team_count: highRiskTeamCount, unknown_team_count: unknownTeamCount, team_summaries: summaries, retention_policy: "current_pitcher_snapshots_issues_today_tomorrow_only_batches_retained_for_audit",
      retention_pre_prune: prePrune, operational_current_retire_after_core_verified: operationalCurrentRetire, pitcher_detail_deferred_for_full_run_stability: pitcherDetailDeferred, retention_post_prune: postPrune,
      sidecar_tables: ["daily.bullpen_availability_current", "daily.bullpen_pitcher_availability_current", "daily.bullpen_availability_snapshots", "daily.bullpen_availability_batches", "daily.bullpen_availability_issues"],
      source_tables_read_only: ["team.bullpen_history", "calendar.game_calendar", "score.board_prepared_current"], no_external_calls: true, external_calls_performed: 0,
      no_score_db_mutation: true, no_board_mutation: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups_duplication: true, no_daily_player_availability_dependency: true,
      no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
    };
    await pg.unsafe(`UPDATE daily.bullpen_availability_batches SET status=$1, calendar_games_checked=$2, prepared_games_checked=$3, prepared_rows_read=$4, teams_checked=$5, team_rows_written=$6,
       pitcher_rows_written=$7, snapshot_rows_written=$8, source_failures=$9, blocker_count=$10, warning_count=$11, high_risk_team_count=$12, unknown_team_count=$13, certification_status=$14,
       certification_grade=$15, certification_reason=$16, output_json=$17, completed_at=now(), updated_at=now() WHERE batch_id=$18`,
      [status, calendars.length, gamePks.length, output.prepared_rows_read, targets.length, currentWritten, pitcherWritten, snapshotWritten, 0, blockerCount, warningN, highRiskTeamCount, unknownTeamCount, certification, grade, output.certification_reason, JSON.stringify(output).slice(0, 14000), batchId]);
    return output;
  } finally {
    await pg.end({ timeout: 1 }).catch(() => {});
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: { HYPERDRIVE: Boolean(env.HYPERDRIVE) }, vars: varPresence(env, EXPECTED_VARS) } });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null } });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const out = await runBullpen(env, input);
        return jsonResponse(out);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_BULLPEN_EXCEPTION", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_external_calls: true }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
