const WORKER_NAME = "alphadog-v2-daily-usage-pulse";
const VERSION = "alphadog-v2-daily-usage-pulse-v0.2.4-board-scoped-window";
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
async function withDeadline(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise(resolve => { timer = setTimeout(() => resolve(typeof fallbackValue === "function" ? fallbackValue() : fallbackValue), Math.max(500, Number(ms || 5000))); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
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
function retentionWindowPt(extraDates = []) {
  const today = todayPt();
  const tomorrow = addDays(today, 1);
  const dates = [...new Set([today, tomorrow, ...(extraDates || []).filter(Boolean)])].sort();
  return { start: dates[0], end: dates[dates.length - 1], dates };
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
      non_destructive_active_replacement: true,
      bounded_source_fetch_timeout_ms: 2500,
      per_game_heartbeat_progress: true,
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
  await env.DAILY_DB.batch([
    env.DAILY_DB.prepare(`CREATE TABLE IF NOT EXISTS daily_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`),
    env.DAILY_DB.prepare(`CREATE TABLE IF NOT EXISTS daily_umpire_context_batches (
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
  )`),
    env.DAILY_DB.prepare(`CREATE TABLE IF NOT EXISTS daily_umpire_context_current (
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
  )`),
    env.DAILY_DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_umpire_current_game ON daily_umpire_context_current(official_date, game_pk)`),
    env.DAILY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_umpire_current_status ON daily_umpire_context_current(umpire_context_status, umpire_context_confidence)`),
    env.DAILY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_umpire_current_date ON daily_umpire_context_current(official_date)`),
    env.DAILY_DB.prepare(`CREATE TABLE IF NOT EXISTS daily_umpire_context_snapshots (
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
  )`),
    env.DAILY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_umpire_snap_batch ON daily_umpire_context_snapshots(batch_id)`),
    env.DAILY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_umpire_snap_date ON daily_umpire_context_snapshots(official_date)`),
    env.DAILY_DB.prepare(`CREATE TABLE IF NOT EXISTS daily_umpire_context_issues (
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
  )`),
    env.DAILY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_umpire_issues_batch ON daily_umpire_context_issues(batch_id)`),
    env.DAILY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_umpire_issues_date ON daily_umpire_context_issues(official_date)`),
    env.DAILY_DB.prepare(`CREATE TABLE IF NOT EXISTS daily_umpire_assignment_history (
    history_key TEXT PRIMARY KEY,
    official_date TEXT,
    home_team_id INTEGER,
    venue_id INTEGER,
    game_pk INTEGER,
    home_plate_umpire_id INTEGER,
    home_plate_umpire_name TEXT,
    crew_umpire_ids_json TEXT,
    recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`),
    env.DAILY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_umpire_history_venue_date ON daily_umpire_assignment_history(home_team_id, official_date)`),
    env.DAILY_DB.prepare(`INSERT OR IGNORE INTO daily_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('daily_umpire_context_v0_1_0', ?, CURRENT_TIMESTAMP, 'Daily Context Phase 7 umpire context source-probe tables with today/tomorrow volatile retention')`).bind(VERSION)
  ]);
}
async function pruneAssignmentHistory(env) {
  const cutoff = addDays(todayPt(), -10);
  await run(env.DAILY_DB, `DELETE FROM daily_umpire_assignment_history WHERE official_date < ?`, cutoff);
}
async function recordAssignmentHistory(env, target, probe) {
  if (!probe.found || !probe.home_plate_umpire_id) return;
  const key = `${target.official_date}_${target.home_team_id}_${target.game_pk}`;
  const crewIds = (probe.officials_sample || []).map(o => o.id).filter(Boolean);
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_umpire_assignment_history (history_key, official_date, home_team_id, venue_id, game_pk, home_plate_umpire_id, home_plate_umpire_name, crew_umpire_ids_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    key, target.official_date, target.home_team_id, target.venue_id, target.game_pk, probe.home_plate_umpire_id, probe.home_plate_umpire_name, safeJson(crewIds, 500));
}
async function findRecentCrewForVenue(env, homeTeamId, beforeDate) {
  const lookbackStart = addDays(beforeDate, -4);
  const row = await first(env.DAILY_DB, `SELECT home_plate_umpire_id, home_plate_umpire_name, crew_umpire_ids_json, official_date FROM daily_umpire_assignment_history WHERE home_team_id = ? AND official_date >= ? AND official_date < ? ORDER BY official_date DESC LIMIT 1`,
    homeTeamId, lookbackStart, beforeDate);
  return row || null;
}

async function pruneRetention(env, retention) {
  const inClause = retention.dates.map(() => "?").join(",");
  const currentOutside = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_current WHERE official_date IS NULL OR official_date NOT IN (${inClause})`, ...retention.dates);
  const snapshotsOutside = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_snapshots WHERE official_date IS NULL OR official_date NOT IN (${inClause})`, ...retention.dates);
  const issuesOutside = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_issues WHERE official_date IS NULL OR official_date NOT IN (${inClause})`, ...retention.dates);
  return {
    current_outside_deleted: currentOutside && currentOutside.meta ? currentOutside.meta.changes : null,
    snapshots_outside_deleted: snapshotsOutside && snapshotsOutside.meta ? snapshotsOutside.meta.changes : null,
    issues_outside_deleted: issuesOutside && issuesOutside.meta ? issuesOutside.meta.changes : null,
    current_window_replaced: 0,
    snapshots_window_replaced: 0,
    issues_window_replaced: 0,
    non_destructive_window_replacement: true,
    retention_date_start: retention.start,
    retention_date_end: retention.end
  };
}
async function postPruneRetention(env, retention) {
  const inClause = retention.dates.map(() => "?").join(",");
  const current = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_current WHERE official_date IS NULL OR official_date NOT IN (${inClause})`, ...retention.dates);
  const snapshots = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_snapshots WHERE official_date IS NULL OR official_date NOT IN (${inClause})`, ...retention.dates);
  const issues = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_issues WHERE official_date IS NULL OR official_date NOT IN (${inClause})`, ...retention.dates);
  return {
    current_deleted: current && current.meta ? current.meta.changes : null,
    snapshots_deleted: snapshots && snapshots.meta ? snapshots.meta.changes : null,
    issues_deleted: issues && issues.meta ? issues.meta.changes : null,
    retention_date_start: retention.start,
    retention_date_end: retention.end
  };
}
async function finalizeWindowReplacement(env, retention, batchId) {
  const inClause = retention.dates.map(() => "?").join(",");
  const current = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_current WHERE official_date IN (${inClause}) AND (batch_id IS NULL OR batch_id <> ?)`, ...retention.dates, batchId);
  const snapshots = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_snapshots WHERE official_date IN (${inClause}) AND (batch_id IS NULL OR batch_id <> ?)`, ...retention.dates, batchId);
  const issues = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_issues WHERE official_date IN (${inClause}) AND (batch_id IS NULL OR batch_id <> ?)`, ...retention.dates, batchId);
  return {
    current_old_window_deleted_after_success: current && current.meta ? current.meta.changes : null,
    snapshots_old_window_deleted_after_success: snapshots && snapshots.meta ? snapshots.meta.changes : null,
    issues_old_window_deleted_after_success: issues && issues.meta ? issues.meta.changes : null,
    replacement_batch_id: batchId
  };
}
async function cleanupBatchSidecars(env, batchId) {
  // Non-destructive failure cleanup: do not delete current rows. INSERT OR REPLACE can replace
  // prior certified rows; deleting failed-batch current rows can leave the live layer empty.
  const snapshots = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_snapshots WHERE batch_id=?`, batchId);
  const issues = await run(env.DAILY_DB, `DELETE FROM daily_umpire_context_issues WHERE batch_id=?`, batchId);
  return {
    batch_id: batchId,
    current_deleted: 0,
    current_cleanup_policy: "non_destructive_keep_current_rows_on_failure",
    snapshots_deleted: snapshots && snapshots.meta ? snapshots.meta.changes : null,
    issues_deleted: issues && issues.meta ? issues.meta.changes : null
  };
}
async function heartbeatUmpireBatch(env, batchId, fields = {}) {
  await run(env.DAILY_DB, `UPDATE daily_umpire_context_batches SET calendar_games_checked=?, prepared_games_checked=?, prepared_rows_read=?, games_checked=?, game_rows_written=?, snapshot_rows_written=?, assignments_found=?, assignments_missing=?, assignments_pending=?, assignments_changed=?, source_failures=?, warning_count=?, unknown_umpire_count=?, external_calls=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    Number(fields.calendar_games_checked || 0), Number(fields.prepared_games_checked || 0), Number(fields.prepared_rows_read || 0), Number(fields.games_checked || 0), Number(fields.game_rows_written || 0), Number(fields.snapshot_rows_written || 0), Number(fields.assignments_found || 0), Number(fields.assignments_missing || 0), Number(fields.assignments_pending || 0), Number(fields.assignments_changed || 0), Number(fields.source_failures || 0), Number(fields.warning_count || 0), Number(fields.unknown_umpire_count || 0), Number(fields.external_calls || 0), batchId);
}

async function heartbeatUmpireQueue(env, requestId, batchId, step, fields = {}) {
  if (!requestId) return;
  const progress = safeJson({
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "RUNNING_DAILY_UMPIRE_PROGRESS",
    request_id: requestId,
    batch_id: batchId || null,
    step,
    ...fields,
    timestamp_utc: nowUtc(),
    root_cause_guard: "worker_updates_child_queue_heartbeat_so_parent_stale_guard_does_not_misclassify_legitimate_work"
  }, 3500);
  try {
    if (env && env.CONTROL_DB) {
      await run(env.CONTROL_DB,
        `UPDATE control_job_queue
         SET updated_at=CURRENT_TIMESTAMP,
             output_json=?
         WHERE request_id=?
           AND status='running'
           AND finished_at IS NULL`,
        progress, requestId);
    }
  } catch (_) {
    // Lifecycle heartbeat only; never let this break umpire sidecar generation.
  }
}

async function finalizeControlLifecycleUmpire(env, requestId, output, rowsRead, rowsWritten, externalCalls) {
  if (!requestId || !env || !env.CONTROL_DB || !output) return;
  const ok = output.ok === true;
  const isPartial = output.status === "partial_continue" || output.continuation_required === true;
  const queueStatus = isPartial ? "pending" : (ok ? "completed" : "failed");
  const runStatus = isPartial ? "partial_continue" : (ok ? "completed" : "failed");
  const cert = String(output.certification || output.certification_status || (ok ? "completed" : "failed")).slice(0, 120);
  const errCode = (ok || isPartial) ? null : "daily_umpire_context_worker_failed";
  const errMsg = (ok || isPartial) ? null : String(output.error || output.certification || output.status || "worker failed").slice(0, 900);
  const out = safeJson(output, 14000);
  try {
    await run(env.CONTROL_DB, "UPDATE control_job_queue SET status=?, finished_at=CASE WHEN ? THEN NULL ELSE CURRENT_TIMESTAMP END, updated_at=CURRENT_TIMESTAMP, output_json=?, error_code=?, error_message=? WHERE request_id=? AND status IN ('pending','running','queued','partial_continue') AND finished_at IS NULL", queueStatus, isPartial ? 1 : 0, out, errCode, errMsg, requestId);
    await run(env.CONTROL_DB, "UPDATE control_job_runs SET status=?, data_ok=?, certification_status=?, rows_read=?, rows_written=?, external_calls=?, finished_at=CURRENT_TIMESTAMP, elapsed_ms=CASE WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER) ELSE 0 END, output_json=?, error_code=?, error_message=? WHERE request_id=? AND status='running' AND finished_at IS NULL", runStatus, ok ? 1 : 0, cert, Number(rowsRead || 0), Number(rowsWritten || 0), Number(externalCalls || 0), out, errCode, errMsg, requestId);
  } catch (_) {
    // Best-effort terminal handoff. The worker response remains source of truth for orchestrator dispatch.
  }
}

async function markUmpireBatchFailed(env, batchId, certification, reason, output) {
  await run(env.DAILY_DB, `UPDATE daily_umpire_context_batches SET status='failed', certification_status=?, certification_grade='FAIL', certification_reason=?, output_json=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, certification, reason, safeJson(output, 14000), nowUtc(), batchId);
}
async function getPreviousCurrent(env, retention) {
  const rows = await all(env.DAILY_DB, `SELECT official_date, game_pk, home_plate_umpire_id, home_plate_umpire_name FROM daily_umpire_context_current WHERE official_date IN (?, ?)`, retention.start, retention.end);
  return new Map(rows.map(r => [`${dateOnly(r.official_date)}|${Number(r.game_pk)}`, r]));
}
async function getPreparedGameRows(env, retention) {
  const inClause = retention.dates.map(() => "?").join(",");
  return all(env.SCORE_DB, `SELECT official_game_pk, official_game_time_utc, official_date, COUNT(*) AS prepared_board_pickable_rows
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND official_date IN (${inClause})
      AND official_game_time_utc > ?
    GROUP BY official_game_pk, official_game_time_utc, official_date
    ORDER BY official_game_time_utc, official_game_pk`, ...retention.dates, new Date().toISOString());
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
  } finally {
    clearTimeout(timer);
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
const GEMINI_UMPIRE_MODEL = "gemini-2.5-flash";
const GEMINI_UMPIRE_TIMEOUT_MS = 6000;
const GEMINI_UMPIRE_MAX_CALLS_PER_RUN = 4;
async function deriveUmpireViaGeminiSearch(env, target) {
  // Tier-3 derived fallback (Requirement 2/9): when neither an official assignment nor our
  // own recent-crew-history derivation is available, ask Gemini (with Google Search grounding)
  // for a "most likely" umpire, sourced from real specialist umpire-tracking sites. Explicitly
  // a third-tier, low-confidence, temporary signal - never treated as real, never written to
  // daily_umpire_assignment_history (that table is reserved for confirmed real assignments only,
  // so LLM guesses can never contaminate the crew-rotation derivation used by other games/runs).
  if (!env.GEMINI_API_KEY) return { found: false, reason: "gemini_api_key_not_configured" };
  const prompt = `Who is the home plate umpire for the MLB game between the ${target.away_team_name} and the ${target.home_team_name} on ${target.official_date} at ${target.venue_name}? Search for the real, current, most likely umpire crew assignment (published crew rotation/schedule sites are useful even if not officially confirmed by MLB). Respond with ONLY a single JSON object, no other text, no markdown fences, in exactly this shape: {"umpire_name": string or null, "confidence": "anticipated" or "unconfirmed" or "unknown", "source_note": a short plain-text note on where this came from or why it's unknown}. If you cannot find any real, specific candidate name, set umpire_name to null and confidence to "unknown" rather than inventing a name.`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("gemini_umpire_fallback_timeout"), GEMINI_UMPIRE_TIMEOUT_MS);
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_UMPIRE_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
      signal: controller.signal
    });
    if (!resp.ok) return { found: false, reason: `gemini_http_${resp.status}` };
    const data = await resp.json();
    const cand = data && data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts && cand.content.parts[0] ? cand.content.parts[0].text : "";
    const cleaned = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (_) { return { found: false, reason: "gemini_response_not_parseable_json", raw_text: cleaned.slice(0, 500) }; }
    const name = parsed && typeof parsed.umpire_name === "string" ? parsed.umpire_name.trim() : null;
    if (!name || name.length < 3 || /unknown|null|n\/a/i.test(name)) {
      return { found: false, reason: "gemini_no_candidate_name", source_note: (parsed && parsed.source_note) || null };
    }
    const groundingChunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    return {
      found: true,
      umpire_name: name,
      confidence_label: parsed.confidence || "unconfirmed",
      source_note: parsed.source_note || null,
      grounding_source_count: groundingChunks.length,
      model: GEMINI_UMPIRE_MODEL
    };
  } catch (err) {
    return { found: false, reason: `gemini_exception_${String(err && err.message ? err.message : err).slice(0, 120)}` };
  } finally {
    clearTimeout(timer);
  }
}
const REFMETRICS_LOGIN_URL = "https://www.refmetrics.com/login";
const REFMETRICS_ASSIGNMENTS_URL = "https://www.refmetrics.com/baseball/mlb/umpire-assignments";
const REFMETRICS_USER_AGENT = "Mozilla/5.0 (compatible; AlphaDogBot/1.0)";
const REFMETRICS_FETCH_TIMEOUT_MS = 8000;
async function refMetricsFetch(url, opts) {
  // All external fetches in this file are timeout-bounded except this one was missed when
  // first built - fixed now for consistency, so a hung RefMetrics response can never block the
  // whole worker invocation the way the pre-existing starters-worker bug did.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("refmetrics_fetch_timeout"), REFMETRICS_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function extractSetCookieValue(setCookieHeader) {
  if (!setCookieHeader) return null;
  const m = setCookieHeader.match(/^([^;]+);/);
  return m ? m[1] : setCookieHeader;
}
async function getRefMetricsCredentials(env) {
  return await first(env.CONFIG_DB, `SELECT username, password FROM config_external_credentials WHERE credential_key='refmetrics_login'`);
}
async function getCachedRefMetricsSession(env) {
  const row = await first(env.CONFIG_DB, `SELECT cookie_value, expires_at FROM config_external_sessions WHERE site_key='refmetrics.com'`);
  if (!row || !row.cookie_value) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.cookie_value;
}
async function saveRefMetricsSession(env, cookieValue, expiresAt, ok, err) {
  await run(env.CONFIG_DB, `INSERT INTO config_external_sessions (site_key, cookie_value, obtained_at, expires_at, last_login_ok, last_error, updated_at) VALUES ('refmetrics.com', ?, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(site_key) DO UPDATE SET cookie_value=excluded.cookie_value, obtained_at=CURRENT_TIMESTAMP, expires_at=excluded.expires_at, last_login_ok=excluded.last_login_ok, last_error=excluded.last_error, updated_at=CURRENT_TIMESTAMP`,
    cookieValue, expiresAt, ok ? 1 : 0, err || null);
}
async function loginRefMetrics(env) {
  // Real, credentialed login (free account, stored in CONFIG_DB, never in source/repo). Uses a
  // Flask-style CSRF-protected login form: GET the login page for a session cookie + csrf_token,
  // then POST credentials with that same cookie. A successful login returns 302 with a new,
  // authenticated session cookie (observed to last ~30 days) which we cache to avoid re-logging
  // in on every run.
  const creds = await getRefMetricsCredentials(env);
  if (!creds || !creds.username || !creds.password) return { ok: false, reason: "no_credentials_configured" };
  try {
    const getResp = await refMetricsFetch(REFMETRICS_LOGIN_URL, { headers: { "user-agent": REFMETRICS_USER_AGENT } });
    const getHtml = await getResp.text();
    const initCookie = extractSetCookieValue(getResp.headers.get("set-cookie"));
    const csrfMatch = getHtml.match(/id="csrf_token"[^>]*value="([^"]+)"/);
    if (!initCookie || !csrfMatch) { await saveRefMetricsSession(env, null, null, false, "login_page_missing_cookie_or_csrf"); return { ok: false, reason: "login_page_missing_cookie_or_csrf" }; }
    const body = `csrf_token=${encodeURIComponent(csrfMatch[1])}&username_or_email=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&submit=Sign+In`;
    const postResp = await refMetricsFetch(REFMETRICS_LOGIN_URL, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", "cookie": initCookie, "user-agent": REFMETRICS_USER_AGENT },
      body
    });
    const newCookie = extractSetCookieValue(postResp.headers.get("set-cookie"));
    if (postResp.status !== 302 || !newCookie) {
      await saveRefMetricsSession(env, null, null, false, `login_failed_status_${postResp.status}`);
      return { ok: false, reason: `login_failed_status_${postResp.status}` };
    }
    const expiresAt = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
    await saveRefMetricsSession(env, newCookie, expiresAt, true, null);
    return { ok: true, cookie: newCookie };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err).slice(0, 200);
    await saveRefMetricsSession(env, null, null, false, msg);
    return { ok: false, reason: msg };
  }
}
async function fetchRefMetricsAssignmentsHtml(env) {
  let cookie = await getCachedRefMetricsSession(env);
  if (!cookie) {
    const loginResult = await loginRefMetrics(env);
    if (!loginResult.ok) return { ok: false, reason: loginResult.reason };
    cookie = loginResult.cookie;
  }
  const resp = await refMetricsFetch(REFMETRICS_ASSIGNMENTS_URL, { headers: { cookie, "user-agent": REFMETRICS_USER_AGENT } });
  const html = await resp.text();
  const looksLoggedOut = html.includes('auth-panel-title">Sign in');
  if (!resp.ok || looksLoggedOut) {
    const loginResult = await loginRefMetrics(env);
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
let refMetricsRunCache = null; // per-invocation cache so the page is fetched once per worker run, not once per game
let schemaEnsuredCache = false; // module-level cache so the 14 sequential CREATE TABLE/INDEX statements only run once per warm isolate, not on every single invocation
async function deriveUmpireViaRefMetrics(env, target) {
  try {
    if (refMetricsRunCache === null) {
      const result = await fetchRefMetricsAssignmentsHtml(env);
      refMetricsRunCache = result.ok ? parseRefMetricsAssignments(result.html) : [];
      if (!result.ok) return { found: false, reason: `refmetrics_fetch_failed_${result.reason}` };
    }
    const match = refMetricsRunCache.find(r => r.home === target.home_team_name && r.away === target.away_team_name);
    if (!match || !match.hp_name) return { found: false, reason: "refmetrics_no_assignment_listed" };
    return { found: true, umpire_name: match.hp_name };
  } catch (err) {
    return { found: false, reason: `refmetrics_exception_${String(err && err.message ? err.message : err).slice(0, 120)}` };
  }
}
function classifyTarget(target, probe, previous, recentCrew, geminiPrediction, refMetricsPrediction) {
  const cal = target.calendar || {};
  const pregame = String(cal.abstract_game_state || "").toLowerCase() === "preview" || String(cal.detailed_state || "").toLowerCase().includes("scheduled") || String(cal.status_code || "") === "S";
  const issues = [];
  let status, confidence, sourceStatus, assignmentStatus;
  let derivedUmpireId = null, derivedUmpireName = null, isDerived = 0;
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
  } else if (pregame && refMetricsPrediction && refMetricsPrediction.found) {
    // Tier 2 (new, real direct source): RefMetrics free-account umpire assignment board,
    // fetched and parsed directly (login handled server-side, credentials in CONFIG_DB, never
    // in source). This is a real, currently-listed assignment from a specialist site, not an
    // LLM guess - preferred over Gemini and over our own internal derivation. Still marked
    // derived/temporary since it's not our own official MLB source and could reflect a
    // pre-game-day projection rather than a locked assignment; always overwritten the instant
    // our own official MLB source reports it directly.
    status = "derived_from_refmetrics_direct";
    confidence = "MEDIUM_DERIVED_FROM_REFMETRICS_DIRECT";
    sourceStatus = "derived_from_refmetrics_direct";
    assignmentStatus = "derived";
    derivedUmpireId = null;
    derivedUmpireName = refMetricsPrediction.umpire_name;
    isDerived = 1;
    issues.push({ severity: "warning", issue_type: "umpire_derived_from_refmetrics", reason: "No official pregame source yet; derived from RefMetrics' current umpire assignment board (real, credentialed direct fetch, not an LLM guess)." });
  } else if (pregame && geminiPrediction && geminiPrediction.found) {
    // Requirement 2/9, tier 3 (per explicit instruction, checked before internal derived
    // history): no official assignment yet - fall back to a Gemini + Google Search grounded
    // "most likely" prediction (see deriveUmpireViaGeminiSearch above), since it can pull from
    // live, current specialist sources and is expected to be more precise than our own narrow
    // same-venue-recent-history heuristic. Explicitly low-confidence and temporary; never
    // written to daily_umpire_assignment_history; always overwritten the instant a real
    // assignment becomes available on a later run.
    status = "derived_likely_llm_search";
    confidence = "LOW_DERIVED_FROM_LLM_SEARCH_GROUNDING";
    sourceStatus = "derived_from_llm_search_grounding";
    assignmentStatus = "derived";
    derivedUmpireId = null;
    derivedUmpireName = geminiPrediction.umpire_name;
    isDerived = 1;
    issues.push({ severity: "warning", issue_type: "umpire_derived_from_llm_search", reason: `No official pregame source; derived via Gemini + Google Search grounding (${geminiPrediction.confidence_label || "unconfirmed"}${geminiPrediction.source_note ? ": " + geminiPrediction.source_note : ""}).` });
  } else if (pregame && recentCrew && recentCrew.home_plate_umpire_id) {
    // Requirement 2/9, tier 3 (last resort): no official assignment and Gemini didn't return a
    // usable candidate - fall back to our own internal crew-rotation-history derivation. MLB
    // umpire crews work an entire series together, rotating positions daily (well-documented
    // practice) - a recent real HP assignment for this same home venue is a genuine, if
    // imprecise, low-confidence signal. Always explicitly marked derived and low-confidence;
    // replaced the moment a real assignment is found.
    status = "derived_likely_crew";
    confidence = "LOW_DERIVED_FROM_RECENT_SERIES_CREW";
    sourceStatus = "derived_from_recent_series_crew";
    assignmentStatus = "derived";
    derivedUmpireId = recentCrew.home_plate_umpire_id;
    derivedUmpireName = recentCrew.home_plate_umpire_name;
    isDerived = 1;
    issues.push({ severity: "warning", issue_type: "umpire_derived_from_recent_crew", reason: `No official pregame source and no usable Gemini candidate; derived from this venue's most recent real assignment on ${recentCrew.official_date} based on the standard crew-rotation pattern.` });
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
    pending: probe.found || isDerived ? 0 : 1,
    missing: probe.found || isDerived ? 0 : 1,
    unknown: probe.found || isDerived ? 0 : 1,
    sourceFailure: probe.calls && probe.calls.length && probe.calls.every(c => !c.ok) ? 1 : 0,
    noOfficialPregame: status === "no_official_pregame_source" ? 1 : 0,
    derivedUmpireId, derivedUmpireName, isDerived,
    dataSourceLevel: probe.found ? "real" : (isDerived ? "derived" : "unknown")
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
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_umpire_context_current (umpire_context_key, batch_id, official_date, game_pk, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, prepared_board_relevant, prepared_board_pickable_rows, umpire_context_status, umpire_context_confidence, source_status, home_plate_umpire_id, home_plate_umpire_name, crew_chief_umpire_id, crew_chief_umpire_name, umpire_assignment_status, assignment_source_path, assignment_role_source, assignment_confirmed_flag, assignment_pending_flag, assignment_missing_flag, assignment_changed_flag, unknown_umpire_flag, no_official_pregame_source_flag, source_failure_flag, umpire_history_available_flag, umpire_tendency_status, strike_zone_context_status, run_environment_context_status, walk_context_status, strikeout_context_status, source_key, source_endpoint, source_snapshot_at, first_seen_at, last_seen_at, changed_at, details_json, raw_json, created_at, updated_at, data_source_level, is_temporary_derived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', 'unavailable_no_verified_history_source', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
    key, batchId, target.official_date, target.game_pk, target.game_time_utc, target.home_team_id, target.away_team_id, target.home_team_name, target.away_team_name, target.venue_id, target.venue_name, target.prepared_board_pickable_rows, classified.status, classified.confidence, classified.sourceStatus, (classified.isDerived ? classified.derivedUmpireId : probe.home_plate_umpire_id) || null, (classified.isDerived ? classified.derivedUmpireName : probe.home_plate_umpire_name) || null, probe.crew_chief_umpire_id || null, probe.crew_chief_umpire_name || null, classified.assignmentStatus, probe.path || null, probe.role_source || null, probe.found ? 1 : 0, classified.pending, classified.missing, classified.changed, classified.unknown, classified.noOfficialPregame, classified.sourceFailure, probe.source_key, probe.source_endpoint, sourceSnapshotAt, changedAt, details, raw, classified.dataSourceLevel, classified.isDerived);
  const snapshotId = rid(`daily_umpire_snapshot_${target.game_pk}`);
  await run(env.DAILY_DB, `INSERT INTO daily_umpire_context_snapshots (snapshot_id, batch_id, official_date, game_pk, home_plate_umpire_id, home_plate_umpire_name, umpire_context_status, umpire_context_confidence, source_status, assignment_source_path, source_snapshot_at, details_json, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    snapshotId, batchId, target.official_date, target.game_pk, probe.home_plate_umpire_id || null, probe.home_plate_umpire_name || null, classified.status, classified.confidence, classified.sourceStatus, probe.path || null, sourceSnapshotAt, details, raw);
  for (const issue of classified.issues) await writeIssue(env, batchId, target, issue);
  return { current_written: 1, snapshot_written: 1, issues_written: classified.issues.length };
}

async function runUmpireContext(env, input) {
  const _t0 = Date.now();
  const _timings = {};
  refMetricsRunCache = null;
  if (!schemaEnsuredCache) {
    await ensureSchema(env);
    schemaEnsuredCache = true;
  }
  _timings.after_ensure_schema_ms = Date.now() - _t0;
  const requestId = input.request_id || rid("daily_umpire_req");
  const batchId = input && input.chain_id ? `daily_umpire_batch_${input.chain_id}` : rid("daily_umpire_batch");
  const sourceSnapshotAt = nowUtc();
  const nowIsoForWindow = new Date().toISOString();
  const realBoardDateRows = await all(env.SCORE_DB, `SELECT DISTINCT official_date FROM score_board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > ?`, nowIsoForWindow);
  const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
  const retention = retentionWindowPt(realBoardDates);
  _timings.after_real_board_dates_ms = Date.now() - _t0;
  let batchStarted = false;
  let prePrune = null;
  let prepared = [];
  let gamePks = [];
  let calendars = [];
  let targets = [];
  let currentWritten = 0, snapshotWritten = 0, issuesWritten = 0, assignmentsFound = 0, assignmentsMissing = 0, assignmentsPending = 0, assignmentsChanged = 0, sourceFailures = 0, unknownUmpireCount = 0, externalCalls = 0, geminiCallsUsed = 0, geminiDerivedCount = 0, refMetricsDerivedCount = 0;
  const summaries = [];
  const results = [];
  try {
    await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_umpire_context_batches (batch_id, request_id, run_id, worker_name, worker_version, job_key, mode, status, window_start, window_end, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, requestId, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_umpire_context_refresh_window", retention.start, retention.end, sourceSnapshotAt);
    batchStarted = true;
    _timings.after_batch_insert_ms = Date.now() - _t0;
    await heartbeatUmpireQueue(env, requestId, batchId, "batch_created", { window_start: retention.start, window_end: retention.end, source_fetch_timeout_ms: 2500, timings_so_far: _timings });
    _timings.after_first_heartbeat_ms = Date.now() - _t0;
    const previous = await getPreviousCurrent(env, retention);
    _timings.after_get_previous_current_ms = Date.now() - _t0;
    prePrune = await pruneRetention(env, retention);
    _timings.after_prune_retention_ms = Date.now() - _t0;
    await pruneAssignmentHistory(env);
    _timings.after_prune_assignment_history_ms = Date.now() - _t0;
    prepared = await getPreparedGameRows(env, retention);
    _timings.after_get_prepared_game_rows_ms = Date.now() - _t0;
    gamePks = [...new Set(prepared.map(r => Number(r.official_game_pk)).filter(Boolean))];
    calendars = await getCalendar(env, gamePks);
    _timings.after_get_calendar_ms = Date.now() - _t0;
    targets = makeTargets(prepared, calendars);
    const MAX_GAMES_PER_INVOCATION = 30;
    const recentlyProcessed = await all(env.DAILY_DB,
      `SELECT game_pk FROM daily_umpire_context_current WHERE official_date IN (${retention.dates.map(() => "?").join(",")})`, ...retention.dates);
    _timings.after_recently_processed_query_ms = Date.now() - _t0;
    await heartbeatUmpireQueue(env, requestId, batchId, "pre_loop_timings", { timings_so_far: _timings, prepared_rows: prepared.length, game_pks: gamePks.length, targets_before_chunk: targets.length });
    const recentlyProcessedPks = new Set(recentlyProcessed.map(r => Number(r.game_pk)));
    const remainingTargets = targets.filter(t => !recentlyProcessedPks.has(Number(t.game_pk)));
    const totalRemainingBeforeChunk = remainingTargets.length;
    targets = remainingTargets.slice(0, MAX_GAMES_PER_INVOCATION);
    const isPartial = totalRemainingBeforeChunk > targets.length;
    const preparedRowsRead = prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0);
    await heartbeatUmpireBatch(env, batchId, { calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length, prepared_rows_read: preparedRowsRead });
    await heartbeatUmpireQueue(env, requestId, batchId, "targets_built", { calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length, prepared_rows_read: preparedRowsRead, games_checked: targets.length });

    for (const target of targets) {
      let probe;
      try {
        probe = await probeUmpireSource(target);
      } catch (err) {
        const errMsg = String(err && err.message ? err.message : err);
        probe = {
          found: false,
          available_no_plate: false,
          path: null,
          officials_count: 0,
          officials_sample: [],
          source_key: "mlb_statsapi_probe_exception",
          source_endpoint: `${MLB_LIVE_BASE}/${target.game_pk}/feed/live`,
          calls: [{ source_key: "mlb_statsapi_probe_exception", ok: false, status: null, url: `${MLB_LIVE_BASE}/${target.game_pk}/feed/live`, elapsed_ms: 0, error: errMsg }],
          source_failures: 1,
          raw: { exception: errMsg }
        };
      }
      externalCalls += probe.calls ? probe.calls.length : 0;
      sourceFailures += Number(probe.source_failures || 0);
      const prev = previous.get(`${target.official_date}|${target.game_pk}`) || null;
      const recentCrew = probe.found ? null : await findRecentCrewForVenue(env, target.home_team_id, target.official_date);
      // Tier order (per explicit instruction): MLB official -> Gemini search-grounded fallback
      // Tier order (per explicit instruction): MLB official -> RefMetrics direct (real,
      // credentialed fetch) -> Gemini search-grounded fallback -> internal crew-rotation-history
      // derivation last. RefMetrics is tried first since it's a real, currently-listed
      // assignment, not an LLM guess; Gemini only runs if RefMetrics has nothing for this game.
      const refMetricsPrediction = probe.found ? null : await deriveUmpireViaRefMetrics(env, target);
      const hoursUntilGame = target.game_time_utc ? (new Date(target.game_time_utc).getTime() - Date.now()) / 3600000 : 999;
      const needsGeminiFallback = !probe.found && !(refMetricsPrediction && refMetricsPrediction.found) && geminiCallsUsed < GEMINI_UMPIRE_MAX_CALLS_PER_RUN && hoursUntilGame <= 36;
      const geminiPrediction = needsGeminiFallback ? await deriveUmpireViaGeminiSearch(env, target) : null;
      if (needsGeminiFallback) { geminiCallsUsed += 1; externalCalls += 1; if (geminiPrediction && geminiPrediction.found) geminiDerivedCount += 1; }
      if (refMetricsPrediction && refMetricsPrediction.found) refMetricsDerivedCount += 1;
      const classified = classifyTarget(target, probe, prev, recentCrew, geminiPrediction, refMetricsPrediction);
      if (probe.found) { assignmentsFound += 1; await recordAssignmentHistory(env, target, probe); }
      if (classified.missing) assignmentsMissing += 1;
      if (classified.pending) assignmentsPending += 1;
      if (classified.changed) assignmentsChanged += 1;
      if (classified.unknown) unknownUmpireCount += 1;
      issuesWritten += classified.issues.length;
      results.push({ target, probe, classified });
      summaries.push({ game_pk: target.game_pk, official_date: target.official_date, home: target.home_team_name, away: target.away_team_name, prepared_rows: target.prepared_board_pickable_rows, status: classified.status, confidence: classified.confidence, source_status: classified.sourceStatus, home_plate_umpire_id: probe.home_plate_umpire_id || null, home_plate_umpire_name: probe.home_plate_umpire_name || null, assignment_source_path: probe.path || null, issues: classified.issues.length, calls: probe.calls ? probe.calls.map(c => ({ source_key: c.source_key, ok: c.ok, status: c.status, elapsed_ms: c.elapsed_ms, error: c.error || null })) : [] });
      await heartbeatUmpireBatch(env, batchId, { calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length, prepared_rows_read: preparedRowsRead, games_checked: results.length, game_rows_written: 0, snapshot_rows_written: 0, assignments_found: assignmentsFound, assignments_missing: assignmentsMissing, assignments_pending: assignmentsPending, assignments_changed: assignmentsChanged, source_failures: sourceFailures, warning_count: issuesWritten, unknown_umpire_count: unknownUmpireCount, external_calls: externalCalls });
      await heartbeatUmpireQueue(env, requestId, batchId, "probing_sources", { processed_games: results.length, total_games: targets.length, assignments_found: assignmentsFound, assignments_missing: assignmentsMissing, source_failures: sourceFailures, external_calls: externalCalls });
    }

    for (const result of results) {
      const writes = await writeTarget(env, batchId, result.target, result.probe, result.classified, sourceSnapshotAt);
      currentWritten += writes.current_written;
      snapshotWritten += writes.snapshot_written;
      await heartbeatUmpireBatch(env, batchId, { calendar_games_checked: calendars.length, prepared_games_checked: gamePks.length, prepared_rows_read: preparedRowsRead, games_checked: targets.length, game_rows_written: currentWritten, snapshot_rows_written: snapshotWritten, assignments_found: assignmentsFound, assignments_missing: assignmentsMissing, assignments_pending: assignmentsPending, assignments_changed: assignmentsChanged, source_failures: sourceFailures, warning_count: issuesWritten, unknown_umpire_count: unknownUmpireCount, external_calls: externalCalls });
      await heartbeatUmpireQueue(env, requestId, batchId, "writing_context", { game_rows_written: currentWritten, snapshot_rows_written: snapshotWritten, total_games: targets.length });
    }

    const replacementCleanup = await finalizeWindowReplacement(env, retention, batchId);
    await heartbeatUmpireQueue(env, requestId, batchId, "success_replacement_cleanup", { replacement_cleanup: replacementCleanup });
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
    const status = isPartial ? "partial_continue" : (dataOk ? "completed" : "failed_blockers_or_coverage");
    const output = {
      ok: isPartial ? true : dataOk,
      data_ok: isPartial ? true : dataOk,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      batch_id: batchId,
      status,
      continuation_required: isPartial,
      orchestrator_should_self_continue: isPartial,
      games_remaining_after_chunk: Math.max(0, totalRemainingBeforeChunk - targets.length),
      certification,
      certification_grade: grade,
      certification_reason: noPickableSlate ? "No prepared-board pickable_safe games exist for today/tomorrow retention window." : (dataOk ? "Every prepared-board relevant game received an umpire context current and snapshot row; missing/pending assignments are warning-only in v0.1." : "One or more prepared-board relevant games had coverage gaps or blockers."),
      window_start: retention.start,
      window_end: retention.end,
      calendar_games_checked: calendars.length,
      prepared_games_checked: gamePks.length,
      prepared_rows_read: preparedRowsRead,
      games_checked: targets.length,
      game_rows_written: currentWritten,
      rows_written: currentWritten,
      snapshot_rows_written: snapshotWritten,
      issues_written: warningN + blockerN,
      assignments_found: assignmentsFound,
      assignments_missing: assignmentsMissing,
      assignments_pending: assignmentsPending,
      assignments_changed: assignmentsChanged,
      gemini_fallback_calls_used: geminiCallsUsed,
      gemini_fallback_derived_count: geminiDerivedCount,
      refmetrics_derived_count: refMetricsDerivedCount,
      source_failures: sourceFailures,
      blocker_count: blockerN,
      warning_count: warningN,
      unknown_umpire_count: unknownUmpireCount,
      external_calls: externalCalls,
      external_calls_performed: externalCalls,
      game_summaries: summaries,
      retention_policy: "non_destructive_probe_then_atomic_window_replacement_today_tomorrow_batches_retained_for_audit",
      retention_pre_prune: prePrune,
      successful_window_replacement_cleanup: replacementCleanup,
      retention_post_prune: postPrune,
      source_fetch_timeout_ms: 2500,
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
      status, calendars.length, gamePks.length, preparedRowsRead, targets.length, currentWritten, snapshotWritten, assignmentsFound, assignmentsMissing, assignmentsPending, assignmentsChanged, sourceFailures, blockerN, warningN, unknownUmpireCount, externalCalls, certification, grade, output.certification_reason, safeJson(output, 14000), nowUtc(), batchId);
    await finalizeControlLifecycleUmpire(env, requestId, output, output.prepared_rows_read, output.game_rows_written, output.external_calls);
    return output;
  } catch (err) {
    const errorText = String(err && err.stack ? err.stack : err);
    let cleanup = null;
    if (batchStarted) cleanup = await cleanupBatchSidecars(env, batchId);
    const output = {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: requestId,
      batch_id: batchId,
      status: "failed_exception_terminal",
      certification: "DAILY_UMPIRE_FAILED_EXCEPTION_TERMINAL_CLEANED",
      certification_grade: "FAIL",
      certification_reason: "Daily Umpire failed inside bounded worker lifecycle; partial sidecars for this batch were cleaned and a terminal response was returned.",
      error: errorText,
      cleanup,
      window_start: retention.start,
      window_end: retention.end,
      calendar_games_checked: calendars.length,
      prepared_games_checked: gamePks.length,
      prepared_rows_read: prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0),
      games_checked: results.length,
      game_rows_written: 0,
      snapshot_rows_written: 0,
      source_fetch_timeout_ms: 2500,
      timestamp_utc: nowUtc(),
      no_score_db_mutation: true,
      no_board_mutation: true,
      no_scoring: true
    };
    if (batchStarted) await markUmpireBatchFailed(env, batchId, output.certification, output.certification_reason, output);
    await heartbeatUmpireQueue(env, requestId, batchId, "failed_exception_terminal", { certification: output.certification, error: errorText.slice(0, 500) });
    await finalizeControlLifecycleUmpire(env, requestId, output, output.prepared_rows_read, output.game_rows_written, output.external_calls);
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
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS) } });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null } });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const HARD_DEADLINE_MS = 15000;
        const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
        const out = await withDeadline(runUmpireContext(env, input), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
        if (out === TIMEOUT_SENTINEL) {
          // Real fix (same class found live in daily-schedule.js): a genuine internal hang -
          // likely a stalled D1 call - previously had no safety net inside this worker.
          return jsonResponse({ ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "partial_continue", continuation_required: true, orchestrator_should_self_continue: true, certification: "DAILY_UMPIRE_HARD_DEADLINE_TIMEOUT_SAFETY_NET_PARTIAL_CONTINUE", note: `Worker's own ${HARD_DEADLINE_MS}ms internal safety-net deadline fired before the external dispatch timeout - any progress already committed is real; the chain will re-invoke to continue.`, hard_deadline_ms: HARD_DEADLINE_MS, timestamp_utc: nowUtc() }, 200);
        }
        return jsonResponse(out);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_UMPIRE_EXCEPTION", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true, no_board_mutation: true, no_scoring: true }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
