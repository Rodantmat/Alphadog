import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-daily-usage-pulse";
const VERSION = "alphadog-v2-daily-usage-pulse-v0.3.1-postgres-rewire-redeploy";
const JOB_KEY = "daily-umpire-context";
const MLB_LIVE_BASE = "https://statsapi.mlb.com/api/v1.1/game";
const MLB_V1_BASE = "https://statsapi.mlb.com/api/v1";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON"];

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
function toInt(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
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
function normRole(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function isPlateRole(role) { const r = normRole(role); return r === "home plate" || r === "plate" || r === "hp" || r.includes("home plate") || r.includes("plate umpire"); }
function isCrewChiefRole(role) { return normRole(role).includes("crew chief"); }
function baseIdentity(env) {
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "READY_DAILY_UMPIRE_CONTEXT", timestamp_utc: nowUtc(),
    phase: "daily-context-phase-7-umpire-context",
    binding_summary: { required_db_bindings_present: Boolean(env && env.HYPERDRIVE), expected_vars_present: allTrue(vars) },
    source_stack_locked: { calendar_truth: "calendar.game_calendar", prepared_board_relevance: "score.board_prepared_current", primary_probe_source: "MLB StatsAPI live feed and boxscore", secondary_source: "RefMetrics (credentialed direct fetch)", no_paid_sources: true },
    guardrails: { anchors_to_mlb_game_calendar_game_pk: true, prepared_board_relevance_only: true, game_level_one_row_per_game_pk: true, current_snapshot_issue_retention_today_tomorrow_only: true, non_destructive_active_replacement: true, bounded_source_fetch_timeout_ms: 2500, batches_retained_for_audit: true, missing_assignment_warning_only: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups_duplication: true, no_daily_player_availability_duplication: true, no_daily_weather_duplication: true, no_daily_bullpen_duplication: true, no_daily_team_schedule_spot_duplication: true, no_score_db_mutation: true, no_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true }
  };
}

async function ensureSchema(pg) {
  await pg.unsafe(`
CREATE TABLE IF NOT EXISTS daily.umpire_context_batches (
  batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_name TEXT, worker_version TEXT, job_key TEXT, mode TEXT, status TEXT,
  window_start TEXT, window_end TEXT, calendar_games_checked INTEGER DEFAULT 0, prepared_games_checked INTEGER DEFAULT 0, prepared_rows_read INTEGER DEFAULT 0,
  games_checked INTEGER DEFAULT 0, game_rows_written INTEGER DEFAULT 0, snapshot_rows_written INTEGER DEFAULT 0, assignments_found INTEGER DEFAULT 0,
  assignments_missing INTEGER DEFAULT 0, assignments_pending INTEGER DEFAULT 0, assignments_changed INTEGER DEFAULT 0, source_failures INTEGER DEFAULT 0,
  blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, unknown_umpire_count INTEGER DEFAULT 0, external_calls INTEGER DEFAULT 0,
  certification_status TEXT, certification_grade TEXT, certification_reason TEXT, output_json JSONB,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.umpire_context_snapshots (
  snapshot_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, home_plate_umpire_id BIGINT, home_plate_umpire_name TEXT,
  umpire_context_status TEXT, umpire_context_confidence TEXT, source_status TEXT, assignment_source_path TEXT, source_snapshot_at TIMESTAMPTZ,
  details_json JSONB, raw_json JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.umpire_context_issues (
  issue_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, issue_status TEXT, issue_type TEXT,
  severity TEXT, reason TEXT, details_json JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.umpire_assignment_history (
  history_key TEXT PRIMARY KEY, official_date TEXT, home_team_id BIGINT, venue_id BIGINT, game_pk BIGINT,
  home_plate_umpire_id BIGINT, home_plate_umpire_name TEXT, crew_umpire_ids_json JSONB, recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_umpire_snap_batch ON daily.umpire_context_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_umpire_issues_batch ON daily.umpire_context_issues(batch_id);
CREATE INDEX IF NOT EXISTS idx_umpire_history_venue_date ON daily.umpire_assignment_history(home_team_id, official_date);
CREATE TABLE IF NOT EXISTS config.external_sessions (
  site_key TEXT PRIMARY KEY, cookie_value TEXT, obtained_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  last_login_ok INTEGER, last_error TEXT, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS context.history_game_umpire (
  game_pk BIGINT PRIMARY KEY, official_date TEXT, venue_id BIGINT, home_team_id TEXT, home_plate_umpire_id BIGINT,
  home_plate_umpire_name TEXT, crew_umpire_ids_json JSONB, source_key TEXT, raw_json JSONB, captured_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE daily.umpire_context_current ADD COLUMN IF NOT EXISTS umpire_context_status TEXT;`);
}

async function pruneAssignmentHistory(pg) {
  const cutoff = addDays(todayPt(), -10);
  await pg`DELETE FROM daily.umpire_assignment_history WHERE official_date < ${cutoff}`;
}
async function recordAssignmentHistory(pg, target, probe) {
  if (!probe.found || !probe.home_plate_umpire_id) return;
  const key = `${target.official_date}_${target.home_team_id}_${target.game_pk}`;
  const crewIds = (probe.officials_sample || []).map(o => o.id).filter(Boolean);
  await pg`INSERT INTO daily.umpire_assignment_history ${pg([{ history_key: key, official_date: target.official_date, home_team_id: target.home_team_id, venue_id: target.venue_id, game_pk: target.game_pk, home_plate_umpire_id: probe.home_plate_umpire_id, home_plate_umpire_name: probe.home_plate_umpire_name, crew_umpire_ids_json: safeJson(crewIds, 500) }], "history_key", "official_date", "home_team_id", "venue_id", "game_pk", "home_plate_umpire_id", "home_plate_umpire_name", "crew_umpire_ids_json")}
    ON CONFLICT (history_key) DO UPDATE SET home_plate_umpire_id=excluded.home_plate_umpire_id, home_plate_umpire_name=excluded.home_plate_umpire_name, crew_umpire_ids_json=excluded.crew_umpire_ids_json, recorded_at=now()`;
}
async function findRecentCrewForVenue(pg, homeTeamId, beforeDate) {
  const lookbackStart = addDays(beforeDate, -4);
  const rows = await pg`SELECT home_plate_umpire_id, home_plate_umpire_name, crew_umpire_ids_json, official_date FROM daily.umpire_assignment_history WHERE home_team_id = ${homeTeamId} AND official_date >= ${lookbackStart} AND official_date < ${beforeDate} ORDER BY official_date DESC LIMIT 1`;
  return rows[0] || null;
}
async function permanentlyRecordConfirmedAssignments(pg) {
  const rows = await pg`SELECT game_pk, official_date, home_team_id, home_plate_umpire_id, home_plate_umpire_name, crew_umpire_ids_json FROM daily.umpire_assignment_history WHERE home_plate_umpire_id IS NOT NULL`.catch(() => []);
  if (!rows.length) return { copied: 0, checked: 0 };
  const insertRows = rows.map(r => ({ game_pk: r.game_pk, official_date: r.official_date, venue_id: null, home_team_id: String(r.home_team_id || ""), home_plate_umpire_id: r.home_plate_umpire_id, home_plate_umpire_name: r.home_plate_umpire_name, crew_umpire_ids_json: r.crew_umpire_ids_json, source_key: "daily_umpire_assignment_history_permanent_backfill_v0_2_0", raw_json: null }));
  const cols = ["game_pk", "official_date", "venue_id", "home_team_id", "home_plate_umpire_id", "home_plate_umpire_name", "crew_umpire_ids_json", "source_key", "raw_json"];
  await pg`INSERT INTO context.history_game_umpire ${pg(insertRows, ...cols)} ON CONFLICT (game_pk) DO NOTHING`;
  return { copied: insertRows.length, checked: rows.length };
}

async function pruneRetention(pg, retention) {
  const keepDatesLiteral = "{" + retention.dates.map(d => `"${d}"`).join(",") + "}";
  const current = await pg.unsafe(`DELETE FROM daily.umpire_context_current WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const snapshots = await pg.unsafe(`DELETE FROM daily.umpire_context_snapshots WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const issues = await pg.unsafe(`DELETE FROM daily.umpire_context_issues WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  return { current_outside_deleted: current.count ?? null, snapshots_outside_deleted: snapshots.count ?? null, issues_outside_deleted: issues.count ?? null, non_destructive_window_replacement: true, retention_date_start: retention.start, retention_date_end: retention.end };
}
async function postPruneRetention(pg, retention) {
  const keepDatesLiteral = "{" + retention.dates.map(d => `"${d}"`).join(",") + "}";
  const current = await pg.unsafe(`DELETE FROM daily.umpire_context_current WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const snapshots = await pg.unsafe(`DELETE FROM daily.umpire_context_snapshots WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  const issues = await pg.unsafe(`DELETE FROM daily.umpire_context_issues WHERE official_date IS NULL OR official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  return { current_deleted: current.count ?? null, snapshots_deleted: snapshots.count ?? null, issues_deleted: issues.count ?? null, retention_date_start: retention.start, retention_date_end: retention.end };
}
async function finalizeWindowReplacement(pg, retention, batchId) {
  const current = await pg.unsafe(`DELETE FROM daily.umpire_context_current WHERE official_date = ANY($1::text[]) AND (batch_id IS NULL OR batch_id <> $2)`, ["{" + retention.dates.map(d => `"${d}"`).join(",") + "}", batchId]);
  const snapshots = await pg.unsafe(`DELETE FROM daily.umpire_context_snapshots WHERE official_date = ANY($1::text[]) AND (batch_id IS NULL OR batch_id <> $2)`, ["{" + retention.dates.map(d => `"${d}"`).join(",") + "}", batchId]);
  const issues = await pg.unsafe(`DELETE FROM daily.umpire_context_issues WHERE official_date = ANY($1::text[]) AND (batch_id IS NULL OR batch_id <> $2)`, ["{" + retention.dates.map(d => `"${d}"`).join(",") + "}", batchId]);
  return { current_old_window_deleted_after_success: current.count ?? null, snapshots_old_window_deleted_after_success: snapshots.count ?? null, issues_old_window_deleted_after_success: issues.count ?? null, replacement_batch_id: batchId };
}
async function cleanupBatchSidecars(pg, batchId) {
  const snapshots = await pg`DELETE FROM daily.umpire_context_snapshots WHERE batch_id=${batchId}`;
  const issues = await pg`DELETE FROM daily.umpire_context_issues WHERE batch_id=${batchId}`;
  return { batch_id: batchId, current_deleted: 0, current_cleanup_policy: "non_destructive_keep_current_rows_on_failure", snapshots_deleted: snapshots.count ?? null, issues_deleted: issues.count ?? null };
}
async function getPreviousCurrent(pg, retention) {
  const rows = await pg`SELECT official_date, game_pk, home_plate_umpire_id, home_plate_umpire_name FROM daily.umpire_context_current WHERE official_date IN (${retention.start}, ${retention.end})`;
  return new Map(rows.map(r => [`${dateOnly(r.official_date)}|${Number(r.game_pk)}`, r]));
}
async function getPreparedGameRows(pg, retention) {
  const nowIso = new Date().toISOString();
  return await pg`SELECT official_game_pk, official_game_time_utc, official_date::text AS official_date, COUNT(*) AS prepared_board_pickable_rows
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched' AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL
      AND official_date IN ${pg(retention.dates)} AND official_game_time_utc > ${nowIso}
    GROUP BY official_game_pk, official_game_time_utc, official_date ORDER BY official_game_time_utc, official_game_pk`;
}
async function getCalendar(pg, gamePks) {
  if (!gamePks.length) return [];
  return await pg`SELECT game_pk, official_date::text AS official_date, game_time_utc, status_code, abstract_game_state, detailed_state, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name
    FROM calendar.game_calendar WHERE game_pk IN ${pg(gamePks)}`;
}
function makeTargets(preparedRows, calendars) {
  const calByPk = new Map(calendars.map(c => [Number(c.game_pk), c]));
  const preparedByGame = new Map();
  for (const r of preparedRows) { const pk = Number(r.official_game_pk); preparedByGame.set(pk, Number(preparedByGame.get(pk) || 0) + Number(r.prepared_board_pickable_rows || 0)); }
  const targets = [];
  for (const gamePk of [...new Set(preparedRows.map(r => Number(r.official_game_pk)).filter(Boolean))]) {
    const cal = calByPk.get(gamePk);
    if (!cal) continue;
    const officialDate = dateOnly(cal.official_date);
    if (!officialDate) continue;
    targets.push({ game_pk: gamePk, official_date: officialDate, game_time_utc: cal.game_time_utc, home_team_id: toInt(cal.home_team_id), away_team_id: toInt(cal.away_team_id), home_team_name: cal.home_team_name, away_team_name: cal.away_team_name, venue_id: toInt(cal.venue_id), venue_name: cal.venue_name, prepared_board_pickable_rows: Number(preparedByGame.get(gamePk) || 0), calendar: cal });
  }
  return targets.filter(t => t.game_pk && t.official_date && Number(t.prepared_board_pickable_rows || 0) > 0);
}
async function fetchJson(url, timeoutMs = 2500) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("daily_umpire_source_timeout"), timeoutMs);
  try {
    const resp = await fetch(url, { method: "GET", headers: { "accept": "application/json", "user-agent": "AlphaDog-v2 Daily Umpire Context" }, signal: controller.signal });
    const text = await resp.text();
    if (!resp.ok) return { ok: false, status: resp.status, url, elapsed_ms: Date.now() - started, error: `HTTP ${resp.status}`, text_preview: text.slice(0, 500), bounded_timeout_ms: timeoutMs };
    try { return { ok: true, status: resp.status, url, elapsed_ms: Date.now() - started, json: JSON.parse(text), bounded_timeout_ms: timeoutMs }; }
    catch (err) { return { ok: false, status: resp.status, url, elapsed_ms: Date.now() - started, error: "non_json_response", text_preview: text.slice(0, 500), bounded_timeout_ms: timeoutMs }; }
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    const isAbort = (err && err.name === "AbortError") || message.toLowerCase().includes("abort") || (Date.now() - started) >= timeoutMs;
    return { ok: false, status: null, url, elapsed_ms: Date.now() - started, error: isAbort ? "source_timeout" : message, bounded_timeout_ms: timeoutMs };
  } finally { clearTimeout(timer); }
}
function officialName(obj) {
  if (!obj) return null;
  if (obj.fullName) return String(obj.fullName);
  if (obj.name) return String(obj.name);
  if (obj.official && obj.official.fullName) return String(obj.official.fullName);
  if (obj.umpire && obj.umpire.fullName) return String(obj.umpire.fullName);
  if (obj.person && obj.person.fullName) return String(obj.person.fullName);
  return null;
}
function officialId(obj) { if (!obj) return null; const raw = obj.id || (obj.official && obj.official.id) || (obj.umpire && obj.umpire.id) || (obj.person && obj.person.id); return toInt(raw); }
function officialRole(obj) { if (!obj) return null; return obj.officialType || obj.role || obj.position || obj.assignment || obj.type || obj.job || null; }
function arrayAtPath(root, path) { let cur = root; for (const p of path.split(".")) { if (!cur || typeof cur !== "object") return null; cur = cur[p]; } return Array.isArray(cur) ? cur : null; }
function extractFromJson(json, sourceLabel) {
  const paths = ["liveData.boxscore.officials", "boxscore.officials", "gameData.officials", "officials", "liveData.officials"];
  const arrays = [];
  for (const path of paths) { const arr = arrayAtPath(json, path); if (arr && arr.length) arrays.push({ path, arr }); }
  for (const candidate of arrays) {
    const normalized = candidate.arr.map(o => ({ raw: o, id: officialId(o), name: officialName(o), role: officialRole(o) })).filter(o => o.name || o.id || o.role);
    const plate = normalized.find(o => isPlateRole(o.role));
    const chief = normalized.find(o => isCrewChiefRole(o.role));
    if (plate) return { found: true, path: `${sourceLabel}.${candidate.path}`, role_source: plate.role || null, home_plate_umpire_id: plate.id, home_plate_umpire_name: plate.name, crew_chief_umpire_id: chief ? chief.id : null, crew_chief_umpire_name: chief ? chief.name : null, officials_count: normalized.length, officials_sample: normalized.slice(0, 8).map(o => ({ id: o.id, name: o.name, role: o.role })) };
    if (normalized.length) return { found: false, available_no_plate: true, path: `${sourceLabel}.${candidate.path}`, officials_count: normalized.length, officials_sample: normalized.slice(0, 8).map(o => ({ id: o.id, name: o.name, role: o.role })) };
  }
  return { found: false, available_no_plate: false, path: null, officials_count: 0, officials_sample: [] };
}
async function probeUmpireSource(target) {
  const liveUrl = `${MLB_LIVE_BASE}/${target.game_pk}/feed/live`;
  const boxUrl = `${MLB_V1_BASE}/game/${target.game_pk}/boxscore`;
  const calls = [];
  const live = await fetchJson(liveUrl);
  calls.push({ source_key: "mlb_statsapi_live_feed", ok: live.ok, status: live.status, url: live.url, elapsed_ms: live.elapsed_ms, error: live.error || null });
  if (live.ok) { const ext = extractFromJson(live.json, "live_feed"); if (ext.found || ext.available_no_plate) return { ...ext, source_key: "mlb_statsapi_live_feed", source_endpoint: liveUrl, calls, source_failures: calls.filter(c => !c.ok).length, raw: { calls, extraction: ext } }; }
  const box = await fetchJson(boxUrl);
  calls.push({ source_key: "mlb_statsapi_boxscore", ok: box.ok, status: box.status, url: box.url, elapsed_ms: box.elapsed_ms, error: box.error || null });
  if (box.ok) { const ext = extractFromJson(box.json, "boxscore"); if (ext.found || ext.available_no_plate) return { ...ext, source_key: "mlb_statsapi_boxscore", source_endpoint: boxUrl, calls, source_failures: calls.filter(c => !c.ok).length, raw: { calls, extraction: ext } }; }
  return { found: false, available_no_plate: false, path: null, officials_count: 0, officials_sample: [], source_key: calls.some(c => c.ok) ? "mlb_statsapi_official_probe" : "mlb_statsapi_source_unavailable", source_endpoint: liveUrl, calls, source_failures: calls.filter(c => !c.ok).length, raw: { calls } };
}

const REFMETRICS_LOGIN_URL = "https://www.refmetrics.com/login";
const REFMETRICS_ASSIGNMENTS_URL = "https://www.refmetrics.com/baseball/mlb/umpire-assignments";
const REFMETRICS_USER_AGENT = "Mozilla/5.0 (compatible; AlphaDogBot/1.0)";
const REFMETRICS_FETCH_TIMEOUT_MS = 8000;
async function refMetricsFetch(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("refmetrics_fetch_timeout"), REFMETRICS_FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: controller.signal }); } finally { clearTimeout(timer); }
}
function decodeHtmlEntities(s) { return String(s || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function extractSetCookieValue(setCookieHeader) { if (!setCookieHeader) return null; const m = setCookieHeader.match(/^([^;]+);/); return m ? m[1] : setCookieHeader; }
async function getRefMetricsCredentials(pg) {
  const rows = await pg`SELECT credential_value_encrypted FROM config.external_credentials WHERE credential_key='refmetrics_login'`;
  if (!rows[0]) return null;
  try { const parsed = JSON.parse(rows[0].credential_value_encrypted); return { username: parsed.username, password: parsed.password }; } catch (_) { return null; }
}
async function getCachedRefMetricsSession(pg) {
  const rows = await pg`SELECT cookie_value, expires_at FROM config.external_sessions WHERE site_key='refmetrics.com'`;
  const row = rows[0];
  if (!row || !row.cookie_value) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.cookie_value;
}
async function saveRefMetricsSession(pg, cookieValue, expiresAt, ok, err) {
  await pg`INSERT INTO config.external_sessions ${pg([{ site_key: "refmetrics.com", cookie_value: cookieValue, obtained_at: nowUtc(), expires_at: expiresAt, last_login_ok: ok ? 1 : 0, last_error: err || null }], "site_key", "cookie_value", "obtained_at", "expires_at", "last_login_ok", "last_error")}
    ON CONFLICT (site_key) DO UPDATE SET cookie_value=excluded.cookie_value, obtained_at=excluded.obtained_at, expires_at=excluded.expires_at, last_login_ok=excluded.last_login_ok, last_error=excluded.last_error, updated_at=now()`;
}
async function loginRefMetrics(pg) {
  const creds = await getRefMetricsCredentials(pg);
  if (!creds || !creds.username || !creds.password) return { ok: false, reason: "no_credentials_configured" };
  try {
    const getResp = await refMetricsFetch(REFMETRICS_LOGIN_URL, { headers: { "user-agent": REFMETRICS_USER_AGENT } });
    const getHtml = await getResp.text();
    const initCookie = extractSetCookieValue(getResp.headers.get("set-cookie"));
    const csrfMatch = getHtml.match(/id="csrf_token"[^>]*value="([^"]+)"/);
    if (!initCookie || !csrfMatch) { await saveRefMetricsSession(pg, null, null, false, "login_page_missing_cookie_or_csrf"); return { ok: false, reason: "login_page_missing_cookie_or_csrf" }; }
    const body = `csrf_token=${encodeURIComponent(csrfMatch[1])}&username_or_email=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&submit=Sign+In`;
    const postResp = await refMetricsFetch(REFMETRICS_LOGIN_URL, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "cookie": initCookie, "user-agent": REFMETRICS_USER_AGENT }, body });
    const newCookie = extractSetCookieValue(postResp.headers.get("set-cookie"));
    if (postResp.status !== 302 || !newCookie) { await saveRefMetricsSession(pg, null, null, false, `login_failed_status_${postResp.status}`); return { ok: false, reason: `login_failed_status_${postResp.status}` }; }
    const expiresAt = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
    await saveRefMetricsSession(pg, newCookie, expiresAt, true, null);
    return { ok: true, cookie: newCookie };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).slice(0, 200);
    await saveRefMetricsSession(pg, null, null, false, msg);
    return { ok: false, reason: msg };
  }
}
async function fetchRefMetricsAssignmentsHtml(pg) {
  let cookie = await getCachedRefMetricsSession(pg);
  if (!cookie) { const loginResult = await loginRefMetrics(pg); if (!loginResult.ok) return { ok: false, reason: loginResult.reason }; cookie = loginResult.cookie; }
  const resp = await refMetricsFetch(REFMETRICS_ASSIGNMENTS_URL, { headers: { cookie, "user-agent": REFMETRICS_USER_AGENT } });
  const html = await resp.text();
  const looksLoggedOut = html.includes('auth-panel-title">Sign in');
  if (!resp.ok || looksLoggedOut) {
    const loginResult = await loginRefMetrics(pg);
    if (!loginResult.ok) return { ok: false, reason: `session_invalid_relogin_failed_${loginResult.reason}` };
    const retryResp = await refMetricsFetch(REFMETRICS_ASSIGNMENTS_URL, { headers: { cookie: loginResult.cookie, "user-agent": REFMETRICS_USER_AGENT } });
    return { ok: retryResp.ok, html: await retryResp.text() };
  }
  return { ok: true, html };
}
function parseRefMetricsAssignments(html) {
  const rows = [];
  const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRegex.exec(html))) {
    const block = m[1];
    const teamLinks = [...block.matchAll(/team-profiles\?team=[^"]+"[^>]*>([^<]+)<\/a>/g)];
    if (teamLinks.length < 2) continue;
    const home = decodeHtmlEntities(teamLinks[0][1].trim());
    const away = decodeHtmlEntities(teamLinks[1][1].trim());
    const umpMatch = block.match(/umpire-profiles\?official=[^"]+"[^>]*>([^<]+)<\/a>/);
    rows.push({ home, away, hp_name: umpMatch ? decodeHtmlEntities(umpMatch[1].trim()) : null });
  }
  return rows;
}
let refMetricsRunCache = null;
async function resolveUmpireIdByName(pg, name) {
  if (!name) return null;
  try {
    const rows = await pg`SELECT umpire_id FROM ref.umpire_tendency WHERE LOWER(umpire_name) = LOWER(${name}) LIMIT 1`;
    return rows[0] ? Number(rows[0].umpire_id) : null;
  } catch (_) {
    return null;
  }
}
async function deriveUmpireViaRefMetrics(pg, target) {
  try {
    if (refMetricsRunCache === null) {
      const result = await fetchRefMetricsAssignmentsHtml(pg);
      refMetricsRunCache = result.ok ? parseRefMetricsAssignments(result.html) : [];
      if (!result.ok) return { found: false, reason: `refmetrics_fetch_failed_${result.reason}` };
    }
    const match = refMetricsRunCache.find(r => r.home === target.home_team_name && r.away === target.away_team_name);
    if (!match || !match.hp_name) return { found: false, reason: "refmetrics_no_assignment_listed" };
    const resolvedId = await resolveUmpireIdByName(pg, match.hp_name);
    return { found: true, umpire_name: match.hp_name, umpire_id: resolvedId, name_resolved_to_id: resolvedId != null };
  } catch (err) {
    return { found: false, reason: `refmetrics_exception_${String(err && err.message ? err.message : err).slice(0, 120)}` };
  }
}

function classifyTarget(target, probe, previous, recentCrew, refMetricsPrediction) {
  const cal = target.calendar || {};
  const pregame = String(cal.abstract_game_state || "").toLowerCase() === "preview" || String(cal.detailed_state || "").toLowerCase().includes("scheduled") || String(cal.status_code || "") === "S";
  const issues = [];
  let status, confidence, sourceStatus, assignmentStatus;
  let derivedUmpireId = null, derivedUmpireName = null, isDerived = 0;
  if (probe.found) { status = "assigned"; confidence = "HIGH_OFFICIAL_ASSIGNED"; sourceStatus = "official_assignment_found"; assignmentStatus = "assigned"; }
  else if (probe.available_no_plate) { status = "source_available_no_plate_path"; confidence = "WARNING_ASSIGNMENT_MISSING"; sourceStatus = "source_available_no_umpire_path"; assignmentStatus = "missing"; issues.push({ severity: "warning", issue_type: "source_available_no_umpire_path", reason: "Official MLB source returned an officials-like array, but no home plate umpire role was identified." }); }
  else if (pregame && refMetricsPrediction && refMetricsPrediction.found) {
    status = "derived_from_refmetrics_direct"; confidence = "MEDIUM_DERIVED_FROM_REFMETRICS_DIRECT"; sourceStatus = "derived_from_refmetrics_direct"; assignmentStatus = "derived";
    derivedUmpireId = refMetricsPrediction.umpire_id || null; derivedUmpireName = refMetricsPrediction.umpire_name; isDerived = 1;
    issues.push({ severity: "warning", issue_type: "umpire_derived_from_refmetrics", reason: `No official pregame source yet; derived from RefMetrics' current umpire assignment board (real, credentialed direct fetch).${refMetricsPrediction.umpire_id ? "" : " Name found but could not be resolved to an internal umpire_id - tendency lookup will be unavailable for this leg."}` });
  } else if (pregame && recentCrew && recentCrew.home_plate_umpire_id) {
    status = "derived_likely_crew"; confidence = "LOW_DERIVED_FROM_RECENT_SERIES_CREW"; sourceStatus = "derived_from_recent_series_crew"; assignmentStatus = "derived";
    derivedUmpireId = recentCrew.home_plate_umpire_id; derivedUmpireName = recentCrew.home_plate_umpire_name; isDerived = 1;
    issues.push({ severity: "warning", issue_type: "umpire_derived_from_recent_crew", reason: `No official pregame source and no RefMetrics candidate; derived from this venue's most recent real assignment on ${recentCrew.official_date} based on the standard crew-rotation pattern.` });
  } else if (probe.calls && probe.calls.some(c => c.ok)) {
    status = pregame ? "no_official_pregame_source" : "pending_assignment"; confidence = pregame ? "WARNING_NO_PREGAME_UMPIRE_SOURCE" : "LOW_PENDING_ASSIGNMENT"; sourceStatus = pregame ? "no_official_pregame_source" : "source_missing_assignment"; assignmentStatus = "pending";
    issues.push({ severity: "warning", issue_type: pregame ? "no_official_pregame_source" : "assignment_pending", reason: pregame ? "MLB source was reachable but did not expose a home plate umpire assignment for this pregame/scheduled game." : "MLB source was reachable but no home plate umpire assignment was present." });
  } else {
    status = "source_unavailable"; confidence = "BLOCKED_SOURCE_FAILURE"; sourceStatus = "source_failure"; assignmentStatus = "unknown";
    issues.push({ severity: "warning", issue_type: "source_failure", reason: "MLB source probe failed for live feed and boxscore endpoints; umpire assignment remains unavailable." });
  }
  let changed = 0;
  if (probe.found && previous && (previous.home_plate_umpire_id || previous.home_plate_umpire_name)) {
    const oldId = previous.home_plate_umpire_id ? String(previous.home_plate_umpire_id) : "";
    const newId = probe.home_plate_umpire_id ? String(probe.home_plate_umpire_id) : "";
    const oldName = String(previous.home_plate_umpire_name || "").toLowerCase();
    const newName = String(probe.home_plate_umpire_name || "").toLowerCase();
    changed = (oldId && newId && oldId !== newId) || (!oldId && !newId && oldName && newName && oldName !== newName) ? 1 : 0;
    if (changed) issues.push({ severity: "warning", issue_type: "assignment_changed", reason: "Home plate umpire assignment changed since the prior current row." });
  }
  return { status, confidence, sourceStatus, assignmentStatus, changed, issues, pending: probe.found || isDerived ? 0 : 1, missing: probe.found || isDerived ? 0 : 1, unknown: probe.found || isDerived ? 0 : 1, sourceFailure: probe.calls && probe.calls.length && probe.calls.every(c => !c.ok) ? 1 : 0, noOfficialPregame: status === "no_official_pregame_source" ? 1 : 0, derivedUmpireId, derivedUmpireName, isDerived, dataSourceLevel: probe.found ? "real" : (isDerived ? "derived" : "unknown") };
}

async function writeTarget(pg, batchId, target, probe, classified, sourceSnapshotAt) {
  const key = `${target.official_date}_${target.game_pk}`;
  const changedAt = classified.changed ? sourceSnapshotAt : null;
  const raw = safeJson(probe.raw || { probe_summary: probe }, 8000);
  const details = safeJson({
    source_probe_paths_checked: ["liveData.boxscore.officials", "boxscore.officials", "gameData.officials", "officials", "liveData.officials"],
    extraction_path: probe.path || null, officials_count: probe.officials_count || 0, officials_sample: probe.officials_sample || [],
    calendar_status: { status_code: target.calendar.status_code, abstract_game_state: target.calendar.abstract_game_state, detailed_state: target.calendar.detailed_state },
    no_tendency_context_reason: "No reliable internal/historical umpire tendency source is verified in this version. Assignment/status sidecar only."
  }, 5000);
  const row = {
    umpire_ctx_id: key, batch_id: batchId, official_date: target.official_date, game_pk: target.game_pk, game_time_utc: target.game_time_utc,
    home_team_id: target.home_team_id, away_team_id: target.away_team_id, home_team_name: target.home_team_name, away_team_name: target.away_team_name,
    venue_id: target.venue_id, venue_name: target.venue_name, prepared_board_relevant: 1, prepared_board_pickable_rows: target.prepared_board_pickable_rows,
    umpire_context_status: classified.status, umpire_context_confidence: classified.confidence, source_status: classified.sourceStatus,
    home_plate_umpire_id: (classified.isDerived ? classified.derivedUmpireId : probe.home_plate_umpire_id) || null,
    home_plate_umpire_name: (classified.isDerived ? classified.derivedUmpireName : probe.home_plate_umpire_name) || null,
    crew_chief_umpire_id: probe.crew_chief_umpire_id || null, crew_chief_umpire_name: probe.crew_chief_umpire_name || null,
    umpire_assignment_status: classified.assignmentStatus, assignment_source_path: probe.path || null, assignment_role_source: probe.role_source || null,
    assignment_confirmed_flag: probe.found ? 1 : 0, assignment_pending_flag: classified.pending, assignment_missing_flag: classified.missing,
    assignment_changed_flag: classified.changed, unknown_umpire_flag: classified.unknown, no_official_pregame_source_flag: classified.noOfficialPregame,
    source_failure_flag: classified.sourceFailure, umpire_history_available_flag: 0,
    umpire_tendency_status: "unavailable_no_verified_history_source", strike_zone_context_status: "unavailable_no_verified_history_source",
    run_environment_context_status: "unavailable_no_verified_history_source", walk_context_status: "unavailable_no_verified_history_source",
    strikeout_context_status: "unavailable_no_verified_history_source", source_key: probe.source_key, source_endpoint: probe.source_endpoint,
    source_snapshot_at: sourceSnapshotAt, details_json: details, raw_json: raw, data_source_level: classified.dataSourceLevel, is_temporary_derived: classified.isDerived
  };
  const cols = ["umpire_ctx_id", "batch_id", "official_date", "game_pk", "game_time_utc", "home_team_id", "away_team_id", "home_team_name", "away_team_name", "venue_id", "venue_name", "prepared_board_relevant", "prepared_board_pickable_rows", "umpire_context_status", "umpire_context_confidence", "source_status", "home_plate_umpire_id", "home_plate_umpire_name", "crew_chief_umpire_id", "crew_chief_umpire_name", "umpire_assignment_status", "assignment_source_path", "assignment_role_source", "assignment_confirmed_flag", "assignment_pending_flag", "assignment_missing_flag", "assignment_changed_flag", "unknown_umpire_flag", "no_official_pregame_source_flag", "source_failure_flag", "umpire_history_available_flag", "umpire_tendency_status", "strike_zone_context_status", "run_environment_context_status", "walk_context_status", "strikeout_context_status", "source_key", "source_endpoint", "source_snapshot_at", "details_json", "raw_json", "data_source_level", "is_temporary_derived"];
  await pg`INSERT INTO daily.umpire_context_current ${pg([row], ...cols)}
    ON CONFLICT (umpire_ctx_id) DO UPDATE SET batch_id=excluded.batch_id, game_time_utc=excluded.game_time_utc, home_team_name=excluded.home_team_name, away_team_name=excluded.away_team_name,
    venue_id=excluded.venue_id, venue_name=excluded.venue_name, prepared_board_pickable_rows=excluded.prepared_board_pickable_rows, umpire_context_status=excluded.umpire_context_status,
    umpire_context_confidence=excluded.umpire_context_confidence, source_status=excluded.source_status, home_plate_umpire_id=excluded.home_plate_umpire_id, home_plate_umpire_name=excluded.home_plate_umpire_name,
    crew_chief_umpire_id=excluded.crew_chief_umpire_id, crew_chief_umpire_name=excluded.crew_chief_umpire_name, umpire_assignment_status=excluded.umpire_assignment_status,
    assignment_source_path=excluded.assignment_source_path, assignment_role_source=excluded.assignment_role_source, assignment_confirmed_flag=excluded.assignment_confirmed_flag,
    assignment_pending_flag=excluded.assignment_pending_flag, assignment_missing_flag=excluded.assignment_missing_flag, assignment_changed_flag=excluded.assignment_changed_flag,
    unknown_umpire_flag=excluded.unknown_umpire_flag, no_official_pregame_source_flag=excluded.no_official_pregame_source_flag, source_failure_flag=excluded.source_failure_flag,
    source_snapshot_at=excluded.source_snapshot_at, last_seen_at=now(), changed_at=${changedAt}, details_json=excluded.details_json, raw_json=excluded.raw_json,
    data_source_level=excluded.data_source_level, is_temporary_derived=excluded.is_temporary_derived, updated_at=now()`;

  const snapshotRow = { snapshot_id: rid(`daily_umpire_snapshot_${target.game_pk}`), batch_id: batchId, official_date: target.official_date, game_pk: target.game_pk, home_plate_umpire_id: probe.home_plate_umpire_id || null, home_plate_umpire_name: probe.home_plate_umpire_name || null, umpire_context_status: classified.status, umpire_context_confidence: classified.confidence, source_status: classified.sourceStatus, assignment_source_path: probe.path || null, source_snapshot_at: sourceSnapshotAt, details_json: details, raw_json: raw };
  await pg`INSERT INTO daily.umpire_context_snapshots ${pg([snapshotRow], "snapshot_id", "batch_id", "official_date", "game_pk", "home_plate_umpire_id", "home_plate_umpire_name", "umpire_context_status", "umpire_context_confidence", "source_status", "assignment_source_path", "source_snapshot_at", "details_json", "raw_json")}`;

  if (classified.issues.length) {
    const issueRows = classified.issues.map(issue => ({ issue_id: rid(`daily_umpire_issue_${target.game_pk}`), batch_id: batchId, official_date: target.official_date, game_pk: target.game_pk, issue_status: "active", issue_type: issue.issue_type, severity: issue.severity, reason: issue.reason, details_json: safeJson({ game_pk: target.game_pk, home_team_name: target.home_team_name, away_team_name: target.away_team_name, ...issue }, 3000) }));
    await pg`INSERT INTO daily.umpire_context_issues ${pg(issueRows, "issue_id", "batch_id", "official_date", "game_pk", "issue_status", "issue_type", "severity", "reason", "details_json")}`;
  }
  return { current_written: 1, snapshot_written: 1, issues_written: classified.issues.length };
}

async function runUmpireContext(pg, input) {
  refMetricsRunCache = null;
  await ensureSchema(pg);
  const requestId = input.request_id || rid("daily_umpire_req");
  const batchId = input && input.chain_id ? `daily_umpire_batch_${input.chain_id}` : rid("daily_umpire_batch");
  const sourceSnapshotAt = nowUtc();
  const nowIsoForWindow = new Date().toISOString();
  const realBoardDateRows = await pg.unsafe(`SELECT DISTINCT official_date::text AS official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > $1`, [nowIsoForWindow]);
  const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
  const retention = retentionWindowPt(realBoardDates);
  let batchStarted = false;
  let prePrune = null;
  let prepared = [], gamePks = [], calendars = [], targets = [];
  let currentWritten = 0, snapshotWritten = 0, issuesWritten = 0, assignmentsFound = 0, assignmentsMissing = 0, assignmentsPending = 0, assignmentsChanged = 0, sourceFailures = 0, unknownUmpireCount = 0, externalCalls = 0, refMetricsDerivedCount = 0;
  const summaries = [];
  const results = [];
  try {
    await pg.unsafe(`INSERT INTO daily.umpire_context_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8,$9,$10)`,
      [batchId, requestId, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_umpire_context_refresh_window", retention.start, retention.end, sourceSnapshotAt]);
    batchStarted = true;
    const previous = await getPreviousCurrent(pg, retention);
    prePrune = await pruneRetention(pg, retention);
    await pruneAssignmentHistory(pg);
    prepared = await getPreparedGameRows(pg, retention);
    gamePks = [...new Set(prepared.map(r => Number(r.official_game_pk)).filter(Boolean))];
    calendars = await getCalendar(pg, gamePks);
    targets = makeTargets(prepared, calendars);
    const MAX_GAMES_PER_INVOCATION = 30;
    const recentlyProcessed = await pg`SELECT game_pk FROM daily.umpire_context_current WHERE official_date IN ${pg(retention.dates)}`;
    const recentlyProcessedPks = new Set(recentlyProcessed.map(r => Number(r.game_pk)));
    const remainingTargets = targets.filter(t => !recentlyProcessedPks.has(Number(t.game_pk)));
    const totalRemainingBeforeChunk = remainingTargets.length;
    targets = remainingTargets.slice(0, MAX_GAMES_PER_INVOCATION);
    const isPartial = totalRemainingBeforeChunk > targets.length;
    const preparedRowsRead = prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0);

    for (const target of targets) {
      let probe;
      try { probe = await probeUmpireSource(target); }
      catch (err) {
        const errMsg = String(err && err.message ? err.message : err);
        probe = { found: false, available_no_plate: false, path: null, officials_count: 0, officials_sample: [], source_key: "mlb_statsapi_probe_exception", source_endpoint: `${MLB_LIVE_BASE}/${target.game_pk}/feed/live`, calls: [{ source_key: "mlb_statsapi_probe_exception", ok: false, status: null, url: `${MLB_LIVE_BASE}/${target.game_pk}/feed/live`, elapsed_ms: 0, error: errMsg }], source_failures: 1, raw: { exception: errMsg } };
      }
      externalCalls += probe.calls ? probe.calls.length : 0;
      sourceFailures += Number(probe.source_failures || 0);
      const prev = previous.get(`${target.official_date}|${target.game_pk}`) || null;
      const recentCrew = probe.found ? null : await findRecentCrewForVenue(pg, target.home_team_id, target.official_date);
      const refMetricsPrediction = probe.found ? null : await deriveUmpireViaRefMetrics(pg, target);
      if (refMetricsPrediction && refMetricsPrediction.found) refMetricsDerivedCount += 1;
      const classified = classifyTarget(target, probe, prev, recentCrew, refMetricsPrediction);
      if (probe.found) { assignmentsFound += 1; await recordAssignmentHistory(pg, target, probe); }
      if (classified.missing) assignmentsMissing += 1;
      if (classified.pending) assignmentsPending += 1;
      if (classified.changed) assignmentsChanged += 1;
      if (classified.unknown) unknownUmpireCount += 1;
      issuesWritten += classified.issues.length;
      results.push({ target, probe, classified });
      summaries.push({ game_pk: target.game_pk, official_date: target.official_date, home: target.home_team_name, away: target.away_team_name, prepared_rows: target.prepared_board_pickable_rows, status: classified.status, confidence: classified.confidence, source_status: classified.sourceStatus, home_plate_umpire_id: probe.home_plate_umpire_id || null, home_plate_umpire_name: probe.home_plate_umpire_name || null, assignment_source_path: probe.path || null, issues: classified.issues.length });
      const writes = await writeTarget(pg, batchId, target, probe, classified, sourceSnapshotAt);
      currentWritten += writes.current_written;
      snapshotWritten += writes.snapshot_written;
    }

    const replacementCleanup = targets.length > 0
      ? await finalizeWindowReplacement(pg, retention, batchId)
      : { skipped: true, reason: "zero_targets_this_run_preserving_existing_current_rows", current_old_window_deleted_after_success: 0, snapshots_old_window_deleted_after_success: 0, issues_old_window_deleted_after_success: 0, replacement_batch_id: batchId };
    const permanentBackfill = await permanentlyRecordConfirmedAssignments(pg).catch(() => ({ copied: 0, checked: 0, error: true }));
    const postPrune = await postPruneRetention(pg, retention);
    const warningRows = await pg`SELECT COUNT(*) AS c FROM daily.umpire_context_issues WHERE batch_id=${batchId} AND severity='warning'`;
    const blockerRows = await pg`SELECT COUNT(*) AS c FROM daily.umpire_context_issues WHERE batch_id=${batchId} AND severity='blocker'`;
    const warningN = Number(warningRows[0] && warningRows[0].c || 0);
    const blockerN = Number(blockerRows[0] && blockerRows[0].c || 0);
    const noPickableSlate = prepared.length === 0;
    const allAlreadyProcessed = prepared.length > 0 && totalRemainingBeforeChunk === 0;
    const coverageOk = noPickableSlate || allAlreadyProcessed || (currentWritten === targets.length && snapshotWritten === targets.length);
    const dataOk = noPickableSlate || allAlreadyProcessed || (coverageOk && blockerN === 0);
    const certification = noPickableSlate ? "DAILY_UMPIRE_NO_PICKABLE_SAFE_GAMES_IN_WINDOW" : (allAlreadyProcessed ? "DAILY_UMPIRE_ALL_GAMES_ALREADY_PROCESSED_THIS_WINDOW" : (dataOk ? (warningN ? "DAILY_UMPIRE_CERTIFIED_WITH_WARNINGS" : "DAILY_UMPIRE_CERTIFIED_READY") : "DAILY_UMPIRE_FAILED_BLOCKERS_OR_COVERAGE"));
    const grade = noPickableSlate ? "VALID_ZERO" : (dataOk ? (warningN ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL");
    const status = isPartial ? "partial_continue" : (dataOk ? "completed" : "failed_blockers_or_coverage");
    const output = {
      ok: isPartial ? true : dataOk, data_ok: isPartial ? true : dataOk, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, batch_id: batchId, status,
      continuation_required: isPartial, orchestrator_should_self_continue: isPartial, games_remaining_after_chunk: Math.max(0, totalRemainingBeforeChunk - targets.length),
      certification, certification_grade: grade,
      certification_reason: noPickableSlate ? "No prepared-board pickable_safe games exist for today/tomorrow retention window." : (allAlreadyProcessed ? "All prepared-board relevant games for this window were already correctly processed by a recent batch; existing current rows preserved untouched." : (dataOk ? "Every prepared-board relevant game received an umpire context current and snapshot row; missing/pending assignments are warning-only." : "One or more prepared-board relevant games had coverage gaps or blockers.")),
      window_start: retention.start, window_end: retention.end, calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length, prepared_rows_read: preparedRowsRead,
      games_checked: targets.length, game_rows_written: currentWritten, rows_written: currentWritten, snapshot_rows_written: snapshotWritten, issues_written: warningN + blockerN,
      assignments_found: assignmentsFound, assignments_missing: assignmentsMissing, assignments_pending: assignmentsPending, assignments_changed: assignmentsChanged,
      refmetrics_derived_count: refMetricsDerivedCount, source_failures: sourceFailures, blocker_count: blockerN, warning_count: warningN, unknown_umpire_count: unknownUmpireCount,
      external_calls: externalCalls, external_calls_performed: externalCalls, game_summaries: summaries,
      retention_policy: "non_destructive_probe_then_atomic_window_replacement_today_tomorrow_batches_retained_for_audit", retention_pre_prune: prePrune,
      successful_window_replacement_cleanup: replacementCleanup, permanent_history_backfill: permanentBackfill, retention_post_prune: postPrune, source_fetch_timeout_ms: 2500,
      sidecar_tables: ["daily.umpire_context_current", "daily.umpire_context_snapshots", "daily.umpire_context_batches", "daily.umpire_context_issues"],
      source_tables_read_only: ["calendar.game_calendar", "score.board_prepared_current"], source_endpoints_probed: ["MLB StatsAPI live feed", "MLB StatsAPI boxscore", "RefMetrics"],
      no_score_db_mutation: true, no_board_mutation: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true, no_daily_weather_duplication: true, no_daily_bullpen_duplication: true, no_daily_team_schedule_spot_duplication: true,
      no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
    };
    await pg.unsafe(`UPDATE daily.umpire_context_batches SET status=$1, calendar_games_checked=$2, prepared_games_checked=$3, prepared_rows_read=$4, games_checked=$5, game_rows_written=$6, snapshot_rows_written=$7,
       assignments_found=$8, assignments_missing=$9, assignments_pending=$10, assignments_changed=$11, source_failures=$12, blocker_count=$13, warning_count=$14, unknown_umpire_count=$15, external_calls=$16,
       certification_status=$17, certification_grade=$18, certification_reason=$19, output_json=$20, completed_at=now(), updated_at=now() WHERE batch_id=$21`,
      [status, calendars.length, gamePks.length, preparedRowsRead, targets.length, currentWritten, snapshotWritten, assignmentsFound, assignmentsMissing, assignmentsPending, assignmentsChanged, sourceFailures, blockerN, warningN, unknownUmpireCount, externalCalls, certification, grade, output.certification_reason, JSON.stringify(output).slice(0, 14000), batchId]);
    return output;
  } catch (err) {
    const errorText = String(err && err.stack ? err.stack : err);
    let cleanup = null;
    if (batchStarted) cleanup = await cleanupBatchSidecars(pg, batchId);
    const output = {
      ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, batch_id: batchId, status: "failed_exception_terminal",
      certification: "DAILY_UMPIRE_FAILED_EXCEPTION_TERMINAL_CLEANED", certification_grade: "FAIL",
      certification_reason: "Daily Umpire failed inside bounded worker lifecycle; partial sidecars for this batch were cleaned and a terminal response was returned.",
      error: errorText, cleanup, window_start: retention.start, window_end: retention.end, calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length,
      prepared_rows_read: prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0), games_checked: results.length, game_rows_written: 0, snapshot_rows_written: 0,
      source_fetch_timeout_ms: 2500, timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_scoring: true
    };
    if (batchStarted) {
      await pg.unsafe(`UPDATE daily.umpire_context_batches SET status='failed', certification_status=$1, certification_grade='FAIL', certification_reason=$2, output_json=$3, completed_at=now(), updated_at=now() WHERE batch_id=$4`,
        [output.certification, output.certification_reason, JSON.stringify(output).slice(0, 14000), batchId]).catch(() => {});
    }
    return output;
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
      const pg = pgClient(env);
      try {
        const out = await runUmpireContext(pg, input);
        return jsonResponse(out);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_UMPIRE_EXCEPTION", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_scoring: true }, 500);
      } finally {
        await pg.end({ timeout: 1 }).catch(() => {});
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
