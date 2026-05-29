const WORKER_NAME = "alphadog-v2-daily-usage-pulse";
const VERSION = "alphadog-v2-daily-usage-pulse-v0.2.0-daily-umpire-context-official-source-probe-retention";
const JOB_KEY = "daily-umpire-context";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON"];
const MLB_LIVE_BASE = "https://statsapi.mlb.com/api/v1.1/game";
const MLB_V1_BASE = "https://statsapi.mlb.com/api/v1";

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
function normRole(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function isPlateRole(role) {
  const r = normRole(role);
  return r === "home plate" || r === "plate" || r === "hp" || r.includes("home plate") || r.includes("plate umpire");
}
function isCrewChiefRole(role) { return normRole(role).includes("crew chief"); }
function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY_DAILY_UMPIRE_CONTEXT",
    timestamp_utc: nowUtc(),
    phase: "daily-context-phase-7-umpire-context",
    deployed_worker_slot: "alphadog-v2-daily-usage-pulse existing dummy slot reused to avoid worker_manifest/global deploy changes",
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) },
    source_stack_locked: {
      calendar_truth: "TEAM_DB.mlb_game_calendar",
      prepared_board_relevance: "SCORE_DB.score_board_prepared_current",
      primary_probe_source: "MLB StatsAPI live feed and boxscore",
      no_paid_sources: true,
      no_secondary_scrapers: true
    },
    guardrails: {
      anchors_to_mlb_game_calendar_game_pk: true,
      prepared_board_relevance_only: true,
      game_level_one_row_per_game_pk: true,
      current_snapshot_issue_retention_today_tomorrow_only: true,
      current_snapshot_issue_run_replacement_cleanup: true,
      batches_retained_for_audit: true,
      missing_assignment_warning_only_v0_1: true,
      no_umpire_tendencies_without_proven_history: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_daily_weather_duplication: true,
      no_daily_bullpen_duplication: true,
      no_daily_team_schedule_spot_duplication: true,
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
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_umpire_context_batches (
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
    games_checked INTEGER DEFAULT 0,
    game_rows_written INTEGER DEFAULT 0,
    snapshot_rows_written INTEGER DEFAULT 0,
    assignments_found INTEGER DEFAULT 0,
    assignments_missing INTEGER DEFAULT 0,
    assignments_pending INTEGER DEFAULT 0,
    assignments_changed INTEGER DEFAULT 0,
    source_failures INTEGER DEFAULT 0,
    blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    unknown_umpire_count INTEGER DEFAULT 0,
    external_calls INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    certification_reason TEXT,
    output_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_umpire_context_current (
    umpire_context_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    game_time_utc TEXT,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_name TEXT,
    away_team_name TEXT,
    venue_id INTEGER,
    venue_name TEXT,
    prepared_board_relevant INTEGER DEFAULT 0,
    prepared_board_pickable_rows INTEGER DEFAULT 0,
    umpire_context_status TEXT,
    umpire_context_confidence TEXT,
    source_status TEXT,
    home_plate_umpire_id INTEGER,
    home_plate_umpire_name TEXT,
    crew_chief_umpire_id INTEGER,
    crew_chief_umpire_name TEXT,
    umpire_assignment_status TEXT,
    assignment_source_path TEXT,
    assignment_role_source TEXT,
    assignment_confirmed_flag INTEGER DEFAULT 0,
    assignment_pending_flag INTEGER DEFAULT 0,
    assignment_missing_flag INTEGER DEFAULT 0,
    assignment_changed_flag INTEGER DEFAULT 0,
    unknown_umpire_flag INTEGER DEFAULT 0,
    no_official_pregame_source_flag INTEGER DEFAULT 0,
    source_failure_flag INTEGER DEFAULT 0,
    umpire_history_available_flag INTEGER DEFAULT 0,
    umpire_tendency_status TEXT,
    strike_zone_context_status TEXT,
    run_environment_context_status TEXT,
    walk_context_status TEXT,
    strikeout_context_status TEXT,
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
  await run(env.DAILY_DB, `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_umpire_current_game ON daily_umpire_context_current(official_date, game_pk)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_umpire_current_status ON daily_umpire_context_current(umpire_context_status, umpire_context_confidence)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_umpire_current_date ON daily_umpire_context_current(official_date)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_umpire_context_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    home_plate_umpire_id INTEGER,
    home_plate_umpire_name TEXT,
    umpire_context_status TEXT,
    umpire_context_confidence TEXT,
    source_status TEXT,
    assignment_source_path TEXT,
    source_snapshot_at TEXT,
    details_json TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_umpire_snap_batch ON daily_umpire_context_snapshots(batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_umpire_snap_date ON daily_umpire_context_snapshots(official_date)`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_umpire_context_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    issue_status TEXT,
    issue_type TEXT,
    severity TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_umpire_issues_batch ON daily_umpire_context_issues(batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_daily_umpire_issues_date ON daily_umpire_context_issues(official_date)`);
  await run(env.DAILY_DB, `INSERT OR IGNORE INTO daily_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('daily_umpire_context_v0_1_0', ?, CURRENT_TIMESTAMP, 'Daily Context Phase 7 umpire context source-probe tables with today/tomorrow volatile retention')`, VERSION);
}

async function pruneRetention(env, retention) {
  const currentOutside = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_current WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const snapshotsOutside = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_snapshots WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const issuesOutside = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_issues WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const currentWindow = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_current WHERE official_date IN (?, ?)`, retention.start, retention.end);
  const snapshotsWindow = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_snapshots WHERE official_date IN (?, ?)`, retention.start, retention.end);
  const issuesWindow = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_issues WHERE official_date IN (?, ?)`, retention.start, retention.end);
  return {
    current_outside_deleted: currentOutside && currentOutside.meta ? currentOutside.meta.changes : null,
    snapshots_outside_deleted: snapshotsOutside && snapshotsOutside.meta ? snapshotsOutside.meta.changes : null,
    issues_outside_deleted: issuesOutside && issuesOutside.meta ? issuesOutside.meta.changes : null,
    current_window_replaced: currentWindow && currentWindow.meta ? currentWindow.meta.changes : null,
    snapshots_window_replaced: snapshotsWindow && snapshotsWindow.meta ? snapshotsWindow.meta.changes : null,
    issues_window_replaced: issuesWindow && issuesWindow.meta ? issuesWindow.meta.changes : null,
    retention_date_start: retention.start,
    retention_date_end: retention.end
  };
}
async function postPruneRetention(env, retention) {
  const current = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_current WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const snapshots = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_snapshots WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  const issues = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_issues WHERE official_date IS NULL OR official_date NOT IN (?, ?)`, retention.start, retention.end);
  return {
    current_deleted: current && current.meta ? current.meta.changes : null,
    snapshots_deleted: snapshots && snapshots.meta ? snapshots.meta.changes : null,
    issues_deleted: issues && issues.meta ? issues.meta.changes : null,
    retention_date_start: retention.start,
    retention_date_end: retention.end
  };
}
async function getPreviousCurrent(env, retention) {
  const rows = await all(env.DAILY_DB, `SELECT official_date, game_pk, home_plate_umpire_id, home_plate_umpire_name FROM daily_umpire_context_current WHERE official_date IN (?, ?)`, retention.start, retention.end);
  return new Map(rows.map(r => [`${dateOnly(r.official_date)}|${Number(r.game_pk)}`, r]));
}
async function getPreparedGameRows(env, retention) {
  return all(env.SCORE_DB, `SELECT official_game_pk, official_game_time_utc, official_date, COUNT(*) AS prepared_board_pickable_rows
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND official_date IN (?, ?)
    GROUP BY official_game_pk, official_game_time_utc, official_date
    ORDER BY official_game_time_utc, official_game_pk`, retention.start, retention.end);
}
async function getCalendar(env, gamePks) {
  if (!gamePks.length) return [];
  return all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, status_code, abstract_game_state, detailed_state, is_scheduled, is_pregame, is_live, is_final, is_postponed, is_suspended, is_cancelled, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, source_snapshot_at, source_endpoint, updated_at FROM mlb_game_calendar WHERE game_pk IN (${placeholders(gamePks.length)})`, ...gamePks);
}
function makeTargets(preparedRows, calendars) {
  const calByPk = new Map(calendars.map(c => [Number(c.game_pk), c]));
  const preparedByGame = new Map();
  for (const r of preparedRows) {
    const pk = Number(r.official_game_pk);
    preparedByGame.set(pk, Number(preparedByGame.get(pk) || 0) + Number(r.prepared_board_pickable_rows || 0));
  }
  const targets = [];
  for (const gamePk of [...new Set(preparedRows.map(r => Number(r.official_game_pk)).filter(Boolean))]) {
    const cal = calByPk.get(gamePk);
    if (!cal) continue;
    const officialDate = dateOnly(cal.official_date);
    if (!officialDate) continue;
    targets.push({
      game_pk: gamePk,
      official_date: officialDate,
      game_time_utc: cal.game_time_utc,
      home_team_id: toInt(cal.home_team_id),
      away_team_id: toInt(cal.away_team_id),
      home_team_name: cal.home_team_name,
      away_team_name: cal.away_team_name,
      venue_id: toInt(cal.venue_id),
      venue_name: cal.venue_name,
      prepared_board_pickable_rows: Number(preparedByGame.get(gamePk) || 0),
      calendar: cal
    });
  }
  return targets.filter(t => t.game_pk && t.official_date && Number(t.prepared_board_pickable_rows || 0) > 0);
}
async function fetchJson(url) {
  const started = Date.now();
  try {
    const resp = await fetch(url, { method: "GET", headers: { "accept": "application/json", "user-agent": "AlphaDog-v2 Daily Umpire Context" } });
    const text = await resp.text();
    if (!resp.ok) return { ok: false, status: resp.status, url, elapsed_ms: Date.now() - started, error: `HTTP ${resp.status}`, text_preview: text.slice(0, 500) };
    try { return { ok: true, status: resp.status, url, elapsed_ms: Date.now() - started, json: JSON.parse(text) }; }
    catch (err) { return { ok: false, status: resp.status, url, elapsed_ms: Date.now() - started, error: "non_json_response", text_preview: text.slice(0, 500) }; }
  } catch (err) {
    return { ok: false, status: null, url, elapsed_ms: Date.now() - started, error: String(err && err.message ? err.message : err) };
  }
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
function officialId(obj) {
  if (!obj) return null;
  const raw = obj.id || (obj.official && obj.official.id) || (obj.umpire && obj.umpire.id) || (obj.person && obj.person.id);
  return toInt(raw);
}
function officialRole(obj) {
  if (!obj) return null;
  return obj.officialType || obj.role || obj.position || obj.assignment || obj.type || obj.job || null;
}
function arrayAtPath(root, path) {
  let cur = root;
  for (const p of path.split(".")) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return Array.isArray(cur) ? cur : null;
}
function extractFromJson(json, sourceLabel) {
  const paths = [
    "liveData.boxscore.officials",
    "boxscore.officials",
    "gameData.officials",
    "officials",
    "liveData.officials"
  ];
  const arrays = [];
  for (const path of paths) {
    const arr = arrayAtPath(json, path);
    if (arr && arr.length) arrays.push({ path, arr });
  }
  for (const candidate of arrays) {
    const normalized = candidate.arr.map(o => ({ raw: o, id: officialId(o), name: officialName(o), role: officialRole(o) })).filter(o => o.name || o.id || o.role);
    const plate = normalized.find(o => isPlateRole(o.role));
    const chief = normalized.find(o => isCrewChiefRole(o.role));
    if (plate) {
      return {
        found: true,
        path: `${sourceLabel}.${candidate.path}`,
        role_source: plate.role || null,
        home_plate_umpire_id: plate.id,
        home_plate_umpire_name: plate.name,
        crew_chief_umpire_id: chief ? chief.id : null,
        crew_chief_umpire_name: chief ? chief.name : null,
        officials_count: normalized.length,
        officials_sample: normalized.slice(0, 8).map(o => ({ id: o.id, name: o.name, role: o.role }))
      };
    }
    if (normalized.length) {
      return {
        found: false,
        available_no_plate: true,
        path: `${sourceLabel}.${candidate.path}`,
        officials_count: normalized.length,
        officials_sample: normalized.slice(0, 8).map(o => ({ id: o.id, name: o.name, role: o.role }))
      };
    }
  }
  return { found: false, available_no_plate: false, path: null, officials_count: 0, officials_sample: [] };
}
async function probeUmpireSource(target) {
  const liveUrl = `${MLB_LIVE_BASE}/${target.game_pk}/feed/live`;
  const boxUrl = `${MLB_V1_BASE}/game/${target.game_pk}/boxscore`;
  const calls = [];
  const live = await fetchJson(liveUrl);
  calls.push({ source_key: "mlb_statsapi_live_feed", ok: live.ok, status: live.status, url: live.url, elapsed_ms: live.elapsed_ms, error: live.error || null });
  if (live.ok) {
    const ext = extractFromJson(live.json, "live_feed");
    if (ext.found || ext.available_no_plate) return { ...ext, source_key: "mlb_statsapi_live_feed", source_endpoint: liveUrl, calls, source_failures: calls.filter(c => !c.ok).length, raw: { calls, extraction: ext } };
  }
  const box = await fetchJson(boxUrl);
  calls.push({ source_key: "mlb_statsapi_boxscore", ok: box.ok, status: box.status, url: box.url, elapsed_ms: box.elapsed_ms, error: box.error || null });
  if (box.ok) {
    const ext = extractFromJson(box.json, "boxscore");
    if (ext.found || ext.available_no_plate) return { ...ext, source_key: "mlb_statsapi_boxscore", source_endpoint: boxUrl, calls, source_failures: calls.filter(c => !c.ok).length, raw: { calls, extraction: ext } };
  }
  return { found: false, available_no_plate: false, path: null, officials_count: 0, officials_sample: [], source_key: calls.some(c => c.ok) ? "mlb_statsapi_official_probe" : "mlb_statsapi_source_unavailable", source_endpoint: liveUrl, calls, source_failures: calls.filter(c => !c.ok).length, raw: { calls } };
}
function classifyTarget(target, probe, previous) {
  const cal = target.calendar || {};
  const pregame = String(cal.abstract_game_state || "").toLowerCase() === "preview" || String(cal.detailed_state || "").toLowerCase().includes("scheduled") || String(cal.status_code || "") === "S";
  const issues = [];
  let status, confidence, sourceStatus, assignmentStatus;
  if (probe.found) {
    status = "assigned";
    confidence = "HIGH_OFFICIAL_ASSIGNED";
    sourceStatus = "official_assignment_found";
    assignmentStatus = "assigned";
  } else if (probe.available_no_plate) {
    status = "source_available_no_plate_path";
    confidence = "WARNING_ASSIGNMENT_MISSING";
    sourceStatus = "source_available_no_umpire_path";
    assignmentStatus = "missing";
    issues.push({ severity: "warning", issue_type: "source_available_no_umpire_path", reason: "Official MLB source returned an officials-like array, but no home plate umpire role was identified." });
  } else if (probe.calls && probe.calls.some(c => c.ok)) {
    status = pregame ? "no_official_pregame_source" : "pending_assignment";
    confidence = pregame ? "WARNING_NO_PREGAME_UMPIRE_SOURCE" : "LOW_PENDING_ASSIGNMENT";
    sourceStatus = pregame ? "no_official_pregame_source" : "source_missing_assignment";
    assignmentStatus = "pending";
    issues.push({ severity: "warning", issue_type: pregame ? "no_official_pregame_source" : "assignment_pending", reason: pregame ? "MLB source was reachable but did not expose a home plate umpire assignment for this pregame/scheduled game." : "MLB source was reachable but no home plate umpire assignment was present." });
  } else {
    status = "source_unavailable";
    confidence = "BLOCKED_SOURCE_FAILURE";
    sourceStatus = "source_failure";
    assignmentStatus = "unknown";
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
  return {
    status,
    confidence,
    sourceStatus,
    assignmentStatus,
    changed,
    issues,
    pending: probe.found ? 0 : 1,
    missing: probe.found ? 0 : 1,
    unknown: probe.found ? 0 : 1,
    sourceFailure: probe.calls && probe.calls.length && probe.calls.every(c => !c.ok) ? 1 : 0,
    noOfficialPregame: status === "no_official_pregame_source" ? 1 : 0
  };
}
async function writeIssue(env, batchId, target, issue) {
  const issueId = rid(`daily_umpire_issue_${target.game_pk}`);
  await run(env.DAILY_DB, `INSERT INTO daily_umpire_context_issues (issue_id, batch_id, official_date, game_pk, issue_status, issue_type, severity, reason, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    issueId, batchId, target.official_date, target.game_pk, issue.issue_type, issue.severity, issue.reason, safeJson({ game_pk: target.game_pk, home_team_name: target.home_team_name, away_team_name: target.away_team_name, ...issue }, 3000));
}
async function writeTarget(env, batchId, target, probe, classified, sourceSnapshotAt) {
  const key = `${target.official_date}_${target.game_pk}`;
  const changedAt = classified.changed ? sourceSnapshotAt : null;
  const raw = safeJson(probe.raw || { probe_summary: probe }, 8000);
  const details = safeJson({
    source_probe_paths_checked: ["liveData.boxscore.officials", "boxscore.officials", "gameData.officials", "officials", "liveData.officials"],
    extraction_path: probe.path || null,
    officials_count: probe.officials_count || 0,
    officials_sample: probe.officials_sample || [],
    calendar_status: { status_code: target.calendar.status_code, abstract_game_state: target.calendar.abstract_game_state, detailed_state: target.calendar.detailed_state },
    no_tendency_context_reason: "No reliable internal/historical umpire tendency source is verified in v0.1. Assignment/status sidecar only."
  }, 5000);
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_umpire_context_current (umpire_context_key, batch_id, official_date, game_pk, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, prepared_board_relevant, prepared_board_pickable_rows, umpire_context_status, umpire_context_confidence, source_status, home_plate_umpire_id, home_plate_umpire_name, crew_chief_umpire_id, crew_chief_umpire_name, umpire_assignment_status, assignment_source_path, assignment_role_source, assignment_confirmed_flag, assignment_pending_flag, assignment_missing_flag, assignment_changed_flag, unknown_umpire_flag, no_official_pregame_source_flag, source_failure_flag, umpire_history_available_flag, umpire_tendency_status, strike_zone_context_status, run_environment_context_status, walk_context_status, strikeout_context_status, source_key, source_endpoint, source_snapshot_at, first_seen_at, last_seen_at, changed_at, details_json, raw_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    key, batchId, target.official_date, target.game_pk, target.game_time_utc, target.home_team_id, target.away_team_id, target.home_team_name, target.away_team_name, target.venue_id, target.venue_name, target.prepared_board_pickable_rows, classified.status, classified.confidence, classified.sourceStatus, probe.home_plate_umpire_id || null, probe.home_plate_umpire_name || null, probe.crew_chief_umpire_id || null, probe.crew_chief_umpire_name || null, classified.assignmentStatus, probe.path || null, probe.role_source || null, probe.found ? 1 : 0, classified.pending, classified.missing, classified.changed, classified.unknown, classified.noOfficialPregame, classified.sourceFailure, probe.source_key, probe.source_endpoint, sourceSnapshotAt, changedAt, details, raw);
  const snapshotId = rid(`daily_umpire_snapshot_${target.game_pk}`);
  await run(env.DAILY_DB, `INSERT INTO daily_umpire_context_snapshots (snapshot_id, batch_id, official_date, game_pk, home_plate_umpire_id, home_plate_umpire_name, umpire_context_status, umpire_context_confidence, source_status, assignment_source_path, source_snapshot_at, details_json, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    snapshotId, batchId, target.official_date, target.game_pk, probe.home_plate_umpire_id || null, probe.home_plate_umpire_name || null, classified.status, classified.confidence, classified.sourceStatus, probe.path || null, sourceSnapshotAt, details, raw);
  for (const issue of classified.issues) await writeIssue(env, batchId, target, issue);
  return { current_written: 1, snapshot_written: 1, issues_written: classified.issues.length };
}

async function runUmpireContext(env, input) {
  await ensureSchema(env);
  const requestId = input.request_id || rid("daily_umpire_req");
  const batchId = rid("daily_umpire_batch");
  const sourceSnapshotAt = nowUtc();
  const retention = retentionWindowPt();
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_umpire_context_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_umpire_context_refresh_window", retention.start, retention.end, sourceSnapshotAt);
  const previous = await getPreviousCurrent(env, retention);
  const prePrune = await pruneRetention(env, retention);
  const prepared = await getPreparedGameRows(env, retention);
  const gamePks = [...new Set(prepared.map(r => Number(r.official_game_pk)).filter(Boolean))];
  const calendars = await getCalendar(env, gamePks);
  const targets = makeTargets(prepared, calendars);
  let currentWritten = 0, snapshotWritten = 0, issuesWritten = 0, assignmentsFound = 0, assignmentsMissing = 0, assignmentsPending = 0, assignmentsChanged = 0, sourceFailures = 0, unknownUmpireCount = 0, externalCalls = 0;
  const summaries = [];
  for (const target of targets) {
    const probe = await probeUmpireSource(target);
    externalCalls += probe.calls ? probe.calls.length : 0;
    sourceFailures += Number(probe.source_failures || 0);
    const prev = previous.get(`${target.official_date}|${target.game_pk}`) || null;
    const classified = classifyTarget(target, probe, prev);
    const writes = await writeTarget(env, batchId, target, probe, classified, sourceSnapshotAt);
    currentWritten += writes.current_written;
    snapshotWritten += writes.snapshot_written;
    issuesWritten += writes.issues_written;
    if (probe.found) assignmentsFound += 1;
    if (classified.missing) assignmentsMissing += 1;
    if (classified.pending) assignmentsPending += 1;
    if (classified.changed) assignmentsChanged += 1;
    if (classified.unknown) unknownUmpireCount += 1;
    summaries.push({ game_pk: target.game_pk, official_date: target.official_date, home: target.home_team_name, away: target.away_team_name, prepared_rows: target.prepared_board_pickable_rows, status: classified.status, confidence: classified.confidence, source_status: classified.sourceStatus, home_plate_umpire_id: probe.home_plate_umpire_id || null, home_plate_umpire_name: probe.home_plate_umpire_name || null, assignment_source_path: probe.path || null, issues: classified.issues.length });
  }
  const postPrune = await postPruneRetention(env, retention);
  const warningRow = await first(env.DAILY_DB, `SELECT COUNT(*) AS c FROM daily_umpire_context_issues WHERE batch_id=? AND severity='warning'`, batchId);
  const blockerRow = await first(env.DAILY_DB, `SELECT COUNT(*) AS c FROM daily_umpire_context_issues WHERE batch_id=? AND severity='blocker'`, batchId);
  const warningN = Number(warningRow && warningRow.c || 0);
  const blockerN = Number(blockerRow && blockerRow.c || 0);
  const noPickableSlate = prepared.length === 0 || targets.length === 0;
  const coverageOk = noPickableSlate || (currentWritten === targets.length && snapshotWritten === targets.length);
  const dataOk = noPickableSlate || (coverageOk && blockerN === 0);
  const certification = noPickableSlate ? "DAILY_UMPIRE_NO_PICKABLE_SAFE_GAMES_IN_WINDOW" : (dataOk ? (warningN ? "DAILY_UMPIRE_CERTIFIED_WITH_WARNINGS" : "DAILY_UMPIRE_CERTIFIED_READY") : "DAILY_UMPIRE_FAILED_BLOCKERS_OR_COVERAGE");
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
    certification_reason: noPickableSlate ? "No prepared-board pickable_safe games exist for today/tomorrow retention window." : (dataOk ? "Every prepared-board relevant game received an umpire context current and snapshot row; missing/pending assignments are warning-only in v0.1." : "One or more prepared-board relevant games had coverage gaps or blockers."),
    window_start: retention.start,
    window_end: retention.end,
    calendar_games_checked: calendars.length,
    prepared_games_checked: gamePks.length,
    prepared_rows_read: prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0),
    games_checked: targets.length,
    game_rows_written: currentWritten,
    rows_written: currentWritten,
    snapshot_rows_written: snapshotWritten,
    issues_written: issuesWritten,
    assignments_found: assignmentsFound,
    assignments_missing: assignmentsMissing,
    assignments_pending: assignmentsPending,
    assignments_changed: assignmentsChanged,
    source_failures: sourceFailures,
    blocker_count: blockerN,
    warning_count: warningN,
    unknown_umpire_count: unknownUmpireCount,
    external_calls: externalCalls,
    external_calls_performed: externalCalls,
    game_summaries: summaries,
    retention_policy: "current_snapshots_issues_today_tomorrow_only_batches_retained_for_audit",
    retention_pre_prune: prePrune,
    retention_post_prune: postPrune,
    sidecar_tables: ["daily_umpire_context_current", "daily_umpire_context_snapshots", "daily_umpire_context_batches", "daily_umpire_context_issues"],
    source_tables_read_only: ["TEAM_DB.mlb_game_calendar", "SCORE_DB.score_board_prepared_current"],
    source_endpoints_probed: ["MLB StatsAPI live feed", "MLB StatsAPI boxscore"],
    no_score_db_mutation: true,
    no_board_mutation: true,
    no_calendar_rebuild: true,
    no_daily_game_status_duplication: true,
    no_daily_starters_duplication: true,
    no_daily_lineups_duplication: true,
    no_daily_player_availability_duplication: true,
    no_daily_weather_duplication: true,
    no_daily_bullpen_duplication: true,
    no_daily_team_schedule_spot_duplication: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    timestamp_utc: nowUtc()
  };
  await run(env.DAILY_DB, `UPDATE daily_umpire_context_batches SET status=?, calendar_games_checked=?, prepared_games_checked=?, prepared_rows_read=?, games_checked=?, game_rows_written=?, snapshot_rows_written=?, assignments_found=?, assignments_missing=?, assignments_pending=?, assignments_changed=?, source_failures=?, blocker_count=?, warning_count=?, unknown_umpire_count=?, external_calls=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, calendars.length, gamePks.length, output.prepared_rows_read, targets.length, currentWritten, snapshotWritten, assignmentsFound, assignmentsMissing, assignmentsPending, assignmentsChanged, sourceFailures, blockerN, warningN, unknownUmpireCount, externalCalls, certification, grade, output.certification_reason, safeJson(output, 14000), nowUtc(), batchId);
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
        return jsonResponse(await runUmpireContext(env, input));
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_UMPIRE_EXCEPTION", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_scoring: true }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
