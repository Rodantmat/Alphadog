import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-daily-player-availability";
const VERSION = "alphadog-v2-daily-player-availability-v0.2.1-postgres-rewire-redeploy";
const JOB_KEY = "daily-player-availability";
const SOURCE_KEY = "official_mlb_statsapi_roster_transactions_v1";
const MAX_PREPARED_PLAYERS = 500;
const PEOPLE_BATCH_SIZE = 50;
const FETCH_TIMEOUT_MS = 5000;
const FETCH_CONCURRENCY = 8;
const SOURCE_DEADLINE_MS = 11000;
const WRITE_BATCH_ROW_LIMIT = 500;
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL"];

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false, connect_timeout: 8 });
}

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
function safeJson(value, max = 12000) {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function baseIdentity(env) {
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "READY_OFFICIAL_ROSTER_SIDEcar", timestamp_utc: nowUtc(),
    phase: "daily-context-phase-3-player-availability",
    binding_summary: { required_db_bindings_present: Boolean(env && env.HYPERDRIVE), expected_vars_present: allTrue(vars) },
    guardrails: { sidecar_tables_only: true, prepared_board_relevance_only: true, retention_today_tomorrow_only: true, current_table_latest_run_only: true, anchors_to_mlb_game_calendar_game_pk: true, no_score_db_mutation: true, no_calendar_rebuild: true, no_daily_starters_duplication: true, no_daily_lineups: true, no_scoring: true, no_ranking: true, no_final_board: true }
  };
}
function sourceBase(env) {
  const raw = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  if (raw.endsWith("/api/v1")) return raw;
  try { const u = new URL(raw); return `${u.protocol}//${u.host}/api/v1`; } catch (_) { return "https://statsapi.mlb.com/api/v1"; }
}
function requestHeaders(env) {
  return { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-Daily-Player-Availability/0.2") };
}
async function fetchJson(url, env, optional = false, timeoutMs = FETCH_TIMEOUT_MS) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), Math.max(750, Number(timeoutMs) || FETCH_TIMEOUT_MS));
  try {
    const resp = await fetch(url, { headers: requestHeaders(env), signal: controller.signal });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: resp.ok, optional, status: resp.status, url, json, text_preview: text.slice(0, 700), elapsed_ms: Date.now() - started };
  } catch (err) {
    return { ok: false, optional, status: null, url, json: null, error: String(err && err.message ? err.message : err), elapsed_ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
  async function worker() { while (next < items.length) { const idx = next++; out[idx] = await fn(items[idx], idx); } }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
}
async function withDeadline(promise, ms, fallbackFactory) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(typeof fallbackFactory === "function" ? fallbackFactory() : fallbackFactory), Math.max(1000, Number(ms) || 1000)); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function deadlineFallbackSources(teamIds, playerIds, startDate, endDate) {
  const sourceFailures = [];
  const endpointLog = [];
  for (const teamId of teamIds || []) {
    sourceFailures.push({ teamId, endpoint: "active", hard: true, status: "deadline_timeout", error: "Daily Player Availability source deadline reached before active roster source completed." });
    endpointLog.push({ teamId, endpoint: "active", ok: false, status: "deadline_timeout", elapsed_ms: SOURCE_DEADLINE_MS });
  }
  return {
    activeByTeam: new Map(), fortyByTeam: new Map(), ilByTeam: new Map(), txByTeam: new Map(), people: new Map(),
    sourceFailures, endpointLog, externalCalls: 0, fetch_concurrency: FETCH_CONCURRENCY, fetch_timeout_ms: FETCH_TIMEOUT_MS,
    source_deadline_ms: SOURCE_DEADLINE_MS, source_deadline_hit: true, source_deadline_window: { startDate, endDate, teams: (teamIds || []).length, players: (playerIds || []).length }
  };
}
async function preserveBatchRowsForTerminalFailure(pg, batchId) {
  if (!batchId) return { preserved: false, current_rows: null, snapshots: null, issues: null };
  const current = await pg`SELECT COUNT(*) AS c FROM daily.player_availability_current WHERE batch_id=${batchId}`;
  const snapshots = await pg`SELECT COUNT(*) AS c FROM daily.player_availability_snapshots WHERE batch_id=${batchId}`;
  const issues = await pg`SELECT COUNT(*) AS c FROM daily.player_availability_issues WHERE batch_id=${batchId}`;
  return { preserved: true, current_rows: Number(current[0]?.c || 0), snapshots: Number(snapshots[0]?.c || 0), issues: Number(issues[0]?.c || 0) };
}
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
  const dates = [...new Set([today, tomorrow, ...(extraDates || []).map(d => d instanceof Date ? d.toISOString().slice(0, 10) : dateOnly(d)).filter(Boolean)])].sort();
  return { start: dates[0], end: dates[dates.length - 1], dates };
}
function intOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function normTeam(value) { return String(value || "").trim().toUpperCase(); }
function txText(tx) { return `${tx?.typeCode || ""} ${tx?.typeDesc || ""} ${tx?.description || ""}`.toLowerCase(); }
function classifyTransaction(tx) {
  const code = String(tx?.typeCode || "").toUpperCase();
  const desc = txText(tx);
  if (code === "OPT" || /\boptioned\b/.test(desc)) return { kind: "optioned", hard_block: true, warning: false };
  if (code === "DES" || /designated for assignment/.test(desc)) return { kind: "dfa", hard_block: true, warning: false };
  if (code === "REL" || /\breleased\b/.test(desc)) return { kind: "released", hard_block: true, warning: false };
  if (code === "OUT" || /\boutrighted\b/.test(desc)) return { kind: "outrighted", hard_block: true, warning: false };
  if (code === "SC" && /placed\b.*\binjured list|placed\b.*\bpaternity list|placed\b.*\bbereavement list|placed\b.*\brestricted list|\bsuspended\b/.test(desc)) return { kind: "status_change_block", hard_block: true, warning: false };
  if (code === "CU" || /\brecalled\b|\bcalled up\b/.test(desc)) return { kind: "recalled", hard_block: false, warning: true };
  if (code === "SE" || /selected the contract|contract selected/.test(desc)) return { kind: "selected_contract", hard_block: false, warning: true };
  if (code === "SC" && /activated|reinstated/.test(desc)) return { kind: "activated", hard_block: false, warning: true };
  if (code === "ASG" || /assigned|rehab assignment/.test(desc)) return { kind: "assigned_warning", hard_block: false, warning: true };
  return { kind: code ? `transaction_${code.toLowerCase()}` : "transaction_unknown", hard_block: false, warning: !!code };
}
function compactRosterRow(row) {
  if (!row) return null;
  return {
    person: row.person ? { id: row.person.id || null, fullName: row.person.fullName || null } : null,
    jerseyNumber: row.jerseyNumber || null,
    position: row.position ? { code: row.position.code || null, abbreviation: row.position.abbreviation || null, name: row.position.name || null, type: row.position.type || null } : null,
    status: row.status ? { code: row.status.code || null, description: row.status.description || null } : null,
    parentTeamId: row.parentTeamId || null
  };
}
function compactTx(tx) {
  if (!tx) return null;
  return {
    id: tx.id || null, person: tx.person ? { id: tx.person.id || null, fullName: tx.person.fullName || null } : null,
    team: tx.team ? { id: tx.team.id || null, name: tx.team.name || null } : null, date: tx.date || null, effectiveDate: tx.effectiveDate || null,
    typeCode: tx.typeCode || null, typeDesc: tx.typeDesc || null, description: tx.description || null,
    fromTeam: tx.fromTeam ? { id: tx.fromTeam.id || null, name: tx.fromTeam.name || null } : null,
    toTeam: tx.toTeam ? { id: tx.toTeam.id || null, name: tx.toTeam.name || null } : null
  };
}
function compactPeople(row) {
  if (!row) return null;
  return {
    id: row.id || null, fullName: row.fullName || null, active: row.active === true,
    currentTeam: row.currentTeam ? { id: row.currentTeam.id || null } : null,
    primaryPosition: row.primaryPosition ? { abbreviation: row.primaryPosition.abbreviation || null } : null,
    batSide: row.batSide ? { code: row.batSide.code || null } : null, pitchHand: row.pitchHand ? { code: row.pitchHand.code || null } : null
  };
}

async function ensureSchema(pg) {
  await pg.unsafe(`
CREATE TABLE IF NOT EXISTS daily.player_availability_batches (
  batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, job_key TEXT, worker_name TEXT, worker_version TEXT, mode TEXT, status TEXT,
  window_start TEXT, window_end TEXT, prepared_games_checked INTEGER DEFAULT 0, prepared_rows_read INTEGER DEFAULT 0,
  prepared_players_checked INTEGER DEFAULT 0, teams_checked INTEGER DEFAULT 0, active_roster_players_found INTEGER DEFAULT 0,
  injured_list_players_found INTEGER DEFAULT 0, forty_man_players_found INTEGER DEFAULT 0, unavailable_players_found INTEGER DEFAULT 0,
  unknown_players_found INTEGER DEFAULT 0, rows_written INTEGER DEFAULT 0, snapshot_rows_written INTEGER DEFAULT 0, source_failures INTEGER DEFAULT 0,
  hard_source_failures INTEGER DEFAULT 0, blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, external_calls INTEGER DEFAULT 0,
  certification_status TEXT, certification_grade TEXT, certification_reason TEXT, output_json JSONB,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.player_availability_snapshots (
  snapshot_id TEXT PRIMARY KEY, batch_id TEXT, availability_key TEXT, official_date TEXT, game_pk BIGINT, mlb_player_id BIGINT,
  team_mlb_id BIGINT, availability_status TEXT, roster_status TEXT, availability_confidence TEXT, source_key TEXT,
  source_snapshot_at TIMESTAMPTZ, source_payload_snippets JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily.player_availability_issues (
  issue_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, mlb_player_id BIGINT, team_mlb_id BIGINT,
  issue_type TEXT, issue_severity TEXT, reason TEXT, details_json JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avail_snap_batch ON daily.player_availability_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_avail_issues_batch ON daily.player_availability_issues(batch_id);
CREATE INDEX IF NOT EXISTS idx_avail_issues_severity ON daily.player_availability_issues(issue_severity);
CREATE TABLE IF NOT EXISTS archive.player_availability_history (
  availability_key TEXT PRIMARY KEY, official_date DATE, game_pk BIGINT, mlb_player_id BIGINT, player_name TEXT, team_abbreviation TEXT,
  team_mlb_id INTEGER, availability_status TEXT, roster_status TEXT, availability_confidence TEXT, active_roster_flag INTEGER,
  injured_list_flag INTEGER, transaction_summary TEXT, reason TEXT, data_source_level TEXT, captured_at TIMESTAMPTZ DEFAULT now()
);`);
  await pg.unsafe(`ALTER TABLE daily.player_availability_current ADD CONSTRAINT uq_player_availability_key UNIQUE (availability_key)`).catch(() => {});
}

async function permanentlyRecordPlayerAvailability(pg) {
  const rows = await pg`SELECT availability_key, official_date, game_pk, mlb_player_id, player_name, team_abbreviation, team_mlb_id, availability_status, roster_status, availability_confidence, active_roster_flag, injured_list_flag, transaction_summary, reason, data_source_level FROM daily.player_availability_current`.catch(() => []);
  if (!rows.length) return { copied: 0, checked: 0 };
  const cols = ["availability_key", "official_date", "game_pk", "mlb_player_id", "player_name", "team_abbreviation", "team_mlb_id", "availability_status", "roster_status", "availability_confidence", "active_roster_flag", "injured_list_flag", "transaction_summary", "reason", "data_source_level"];
  const CHUNK = 300;
  let copied = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await pg`INSERT INTO archive.player_availability_history ${pg(chunk, ...cols)} ON CONFLICT (availability_key) DO NOTHING`;
    copied += chunk.length;
  }
  return { copied, checked: rows.length };
}

async function pruneAvailabilityRetention(pg, retention, latestBatchId = null) {
  const out = [];
  const permanentBackfill = await permanentlyRecordPlayerAvailability(pg).catch(() => ({ copied: 0, checked: 0, error: true }));
  out.push({ table: "archive_player_availability_history_permanent_backfill", changes: permanentBackfill.copied });
  const keepDatesLiteral = "{" + retention.dates.map(d => `"${d}"`).join(",") + "}";
  async function del(table, sqlText, params) {
    const r = await pg.unsafe(sqlText, params);
    out.push({ table, changes: r.count ?? null });
  }
  await del("daily_player_availability_current_old_dates", `DELETE FROM daily.player_availability_current WHERE official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  await del("daily_player_availability_snapshots_old_dates", `DELETE FROM daily.player_availability_snapshots WHERE official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  await del("daily_player_availability_issues_old_dates", `DELETE FROM daily.player_availability_issues WHERE official_date <> ALL($1::text[])`, [keepDatesLiteral]);
  if (latestBatchId) {
    await del("daily_player_availability_current_previous_batches", `DELETE FROM daily.player_availability_current WHERE batch_id IS NULL OR batch_id <> $1`, [latestBatchId]);
  }
  await del("daily_player_availability_batches_orphaned", `DELETE FROM daily.player_availability_batches
    WHERE batch_id NOT IN (
      SELECT batch_id FROM daily.player_availability_current WHERE batch_id IS NOT NULL
      UNION SELECT batch_id FROM daily.player_availability_snapshots WHERE batch_id IS NOT NULL
      UNION SELECT batch_id FROM daily.player_availability_issues WHERE batch_id IS NOT NULL
    )`, []);
  return out;
}

async function getPreparedPlayers(pg, retention) {
  return await pg`SELECT official_game_pk, official_date::text AS official_date, official_game_time_utc, team, opponent, resolved_player_id, resolved_mlb_player_id,
      MIN(player_name) AS player_name, COUNT(*) AS prepared_board_pickable_rows,
      string_agg(DISTINCT source_key, ',') AS sources, string_agg(DISTINCT canonical_prop_key, ',') AS prop_keys
    FROM score.board_prepared_current
    WHERE pickable_safe = 1 AND matchup_status = 'calendar_matched' AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL AND official_game_time_utc IS NOT NULL AND resolved_mlb_player_id IS NOT NULL
      AND official_date IN ${pg(retention.dates)}
    GROUP BY official_game_pk, official_date, official_game_time_utc, team, opponent, resolved_player_id, resolved_mlb_player_id
    ORDER BY official_game_time_utc, official_game_pk, team, player_name
    LIMIT ${MAX_PREPARED_PLAYERS}`;
}
async function getCalendar(pg, gamePks) {
  if (!gamePks.length) return [];
  return await pg`SELECT game_pk, official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, status_code, abstract_game_state, detailed_state, is_postponed, is_suspended, is_cancelled
    FROM calendar.game_calendar WHERE game_pk IN ${pg(gamePks)}`;
}
async function getTeams(pg, teamAbbrs) {
  if (!teamAbbrs.length) return [];
  return await pg`SELECT team_id, mlb_team_id, abbreviation, full_name, active FROM ref.teams WHERE abbreviation IN ${pg(teamAbbrs)}`;
}
async function getStaticPlayers(pg, ids) {
  if (!ids.length) return [];
  return await pg`SELECT player_id, mlb_player_id, player_name, full_name, current_team_id, current_mlb_team_id, active FROM ref.players WHERE mlb_player_id IN ${pg(ids)}`;
}
function rosterStatusCode(row) { return String(row?.status?.code || "").trim().toUpperCase(); }
function rosterStatusDesc(row) { return String(row?.status?.description || "").trim().toLowerCase(); }
function isActiveRosterRow(row) { const code = rosterStatusCode(row); const desc = rosterStatusDesc(row); return code === "A" || desc === "active"; }
function isInjuredListRosterRow(row) { const code = rosterStatusCode(row); const desc = rosterStatusDesc(row); return code.startsWith("I") || /\binjured\b|\bil\b|\bday il\b/.test(desc); }
function rosterMap(resp, expectedKind = "any") {
  const m = new Map();
  const rows = resp && resp.ok && resp.json && Array.isArray(resp.json.roster) ? resp.json.roster : [];
  for (const row of rows) {
    if (expectedKind === "active" && !isActiveRosterRow(row)) continue;
    if (expectedKind === "injuredList" && !isInjuredListRosterRow(row)) continue;
    const id = intOrNull(row?.person?.id);
    if (id !== null) m.set(id, row);
  }
  return m;
}
function txMap(resp) {
  const m = new Map();
  const rows = resp && resp.ok && resp.json && Array.isArray(resp.json.transactions) ? resp.json.transactions : [];
  for (const tx of rows) {
    const id = intOrNull(tx?.person?.id);
    if (id === null) continue;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(tx);
  }
  for (const arr of m.values()) arr.sort((a, b) => String(b.date || b.effectiveDate || "").localeCompare(String(a.date || a.effectiveDate || "")));
  return m;
}
function peopleMap(responses) {
  const m = new Map();
  for (const resp of responses) {
    const rows = resp && resp.ok && resp.json && Array.isArray(resp.json.people) ? resp.json.people : [];
    for (const row of rows) { const id = intOrNull(row.id); if (id !== null) m.set(id, row); }
  }
  return m;
}
async function fetchSources(env, teamIds, playerIds, startDate, endDate, options = {}) {
  const base = sourceBase(env);
  const sourceFailures = [];
  const activeByTeam = new Map(), fortyByTeam = new Map(), ilByTeam = new Map(), txByTeam = new Map();
  const endpointLog = [];
  let externalCalls = 0;
  const masterChainSourceBudget = options.masterChainSourceBudget === true;
  const fetchTimeoutMs = masterChainSourceBudget ? 2500 : FETCH_TIMEOUT_MS;

  const activeResults = await mapLimit(teamIds, FETCH_CONCURRENCY, async (teamId) => {
    const active = await fetchJson(`${base}/teams/${teamId}/roster/active`, env, false, fetchTimeoutMs);
    return { teamId, active };
  });
  for (const item of activeResults) {
    const { teamId, active } = item;
    externalCalls++;
    endpointLog.push({ teamId, endpoint: "active", ok: active.ok, status: active.status, elapsed_ms: active.elapsed_ms });
    if (!active.ok) sourceFailures.push({ teamId, endpoint: "active", hard: true, status: active.status, error: active.error || active.text_preview || null });
    activeByTeam.set(teamId, rosterMap(active, "active"));
  }

  const peopleBatches = [];
  for (let i = 0; i < playerIds.length; i += PEOPLE_BATCH_SIZE) peopleBatches.push(playerIds.slice(i, i + PEOPLE_BATCH_SIZE));
  const peopleResponses = await mapLimit(peopleBatches, FETCH_CONCURRENCY, async (ids) => {
    return await fetchJson(`${base}/people?personIds=${encodeURIComponent(ids.join(","))}`, env, true, fetchTimeoutMs);
  });
  for (let i = 0; i < peopleResponses.length; i++) {
    const resp = peopleResponses[i];
    const ids = peopleBatches[i] || [];
    externalCalls++;
    endpointLog.push({ endpoint: "people", ids: ids.length, ok: resp.ok, status: resp.status, elapsed_ms: resp.elapsed_ms });
    if (!resp.ok) sourceFailures.push({ endpoint: "people", hard: false, status: resp.status, error: resp.error || resp.text_preview || null });
  }

  if (!masterChainSourceBudget) {
    const secondaryResults = await mapLimit(teamIds, FETCH_CONCURRENCY, async (teamId) => {
      const [forty, il, tx] = await Promise.all([
        fetchJson(`${base}/teams/${teamId}/roster/40Man`, env, true),
        fetchJson(`${base}/teams/${teamId}/roster/injuredList`, env, true),
        fetchJson(`${base}/transactions?teamId=${encodeURIComponent(String(teamId))}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, env, true)
      ]);
      return { teamId, forty, il, tx };
    });
    for (const item of secondaryResults) {
      const { teamId, forty, il, tx } = item;
      externalCalls += 3;
      endpointLog.push({ teamId, endpoint: "40Man", ok: forty.ok, status: forty.status, elapsed_ms: forty.elapsed_ms });
      endpointLog.push({ teamId, endpoint: "injuredList", ok: il.ok, status: il.status, elapsed_ms: il.elapsed_ms });
      endpointLog.push({ teamId, endpoint: "transactions", ok: tx.ok, status: tx.status, elapsed_ms: tx.elapsed_ms });
      if (!forty.ok) sourceFailures.push({ teamId, endpoint: "40Man", hard: false, status: forty.status, error: forty.error || forty.text_preview || null });
      if (!il.ok) sourceFailures.push({ teamId, endpoint: "injuredList", hard: false, status: il.status, error: il.error || il.text_preview || null });
      if (!tx.ok) sourceFailures.push({ teamId, endpoint: "transactions", hard: false, status: tx.status, error: tx.error || tx.text_preview || null });
      fortyByTeam.set(teamId, rosterMap(forty, "any"));
      ilByTeam.set(teamId, rosterMap(il, "injuredList"));
      txByTeam.set(teamId, txMap(tx));
    }
  } else {
    for (const teamId of teamIds) {
      endpointLog.push({ teamId, endpoint: "40Man", ok: false, status: "skipped_master_chain_source_budget", elapsed_ms: 0 });
      endpointLog.push({ teamId, endpoint: "injuredList", ok: false, status: "skipped_master_chain_source_budget", elapsed_ms: 0 });
      endpointLog.push({ teamId, endpoint: "transactions", ok: false, status: "skipped_master_chain_source_budget", elapsed_ms: 0 });
    }
  }

  return { activeByTeam, fortyByTeam, ilByTeam, txByTeam, people: peopleMap(peopleResponses), sourceFailures, endpointLog, externalCalls, fetch_concurrency: FETCH_CONCURRENCY, fetch_timeout_ms: fetchTimeoutMs, master_chain_source_budget: masterChainSourceBudget };
}
function isFortyManActiveFallback(forty, people, expectedTeamMlbId) {
  if (!forty) return false;
  const fortyTeam = intOrNull(forty.parentTeamId);
  const fortyStatusCode = rosterStatusCode(forty);
  const fortyStatusDesc = rosterStatusDesc(forty);
  const fortyActive = fortyStatusCode === "A" || fortyStatusDesc === "active";
  if (!fortyActive || fortyTeam !== expectedTeamMlbId) return false;
  const peopleTeam = intOrNull(people?.currentTeam?.id);
  if (peopleTeam && peopleTeam !== expectedTeamMlbId) return false;
  if (people && people.active === false) return false;
  return true;
}
async function loadRecentAppearances(pg, playerIds, beforeDate) {
  const ids = [...new Set((playerIds || []).filter(Boolean).map(Number))];
  const set = new Set();
  if (!ids.length) return set;
  const lookbackStart = addDays(beforeDate || todayPt(), -10);
  const bd = beforeDate || todayPt();
  try {
    const hitterRows = await pg`SELECT DISTINCT player_id FROM stats_hitter.game_logs WHERE player_id IN ${pg(ids)} AND game_date >= ${lookbackStart} AND game_date < ${bd}`;
    for (const r of hitterRows) set.add(Number(r.player_id));
  } catch (_) {}
  try {
    const pitcherRows = await pg`SELECT DISTINCT player_id FROM stats_pitcher.game_logs WHERE player_id IN ${pg(ids)} AND game_date >= ${lookbackStart} AND game_date < ${bd}`;
    for (const r of pitcherRows) set.add(Number(r.player_id));
  } catch (_) {}
  return set;
}

function classify(row, context) {
  const playerId = intOrNull(row.resolved_mlb_player_id);
  const teamMlbId = context.teamMlbId;
  const active = context.activeMap ? context.activeMap.get(playerId) : null;
  const forty = context.fortyMap ? context.fortyMap.get(playerId) : null;
  const il = context.ilMap ? context.ilMap.get(playerId) : null;
  const txs = context.txMap && context.txMap.get(playerId) ? context.txMap.get(playerId) : [];
  const people = context.peopleMap ? context.peopleMap.get(playerId) : null;
  const latestTx = txs[0] || null;
  const latestTxClass = classifyTransaction(latestTx);
  const sameDayTx = latestTx && dateOnly(latestTx.date || latestTx.effectiveDate) === row.official_date;
  const peopleTeam = intOrNull(people?.currentTeam?.id);
  const activeFlag = !!active;
  const ilFlag = !!il;
  const fortyFlag = !!forty;
  const endpoints = { active_roster: !!context.activeMap, forty_man: !!context.fortyMap, injured_list: !!context.ilMap, transactions: !!context.txMap, people: !!people };

  let availability_status = "unknown", roster_status = "unknown", availability_confidence = "LOW_SOURCE_AMBIGUOUS", reason = "No deterministic availability rule matched.";
  const issues = [];
  let transaction_warning_flag = 0, transaction_block_flag = 0, team_mismatch_flag = 0, source_missing_flag = 0;

  if (!teamMlbId || !context.calendarTeamMatch) {
    availability_status = "team_mismatch"; roster_status = "unknown"; availability_confidence = "BLOCKED_TEAM_MISMATCH";
    reason = "Prepared-board team does not map cleanly to the official game calendar team IDs.";
    team_mismatch_flag = 1;
    issues.push({ issue_type: "team_mismatch", issue_severity: "blocker", reason });
  } else if (context.activeSourceFailed) {
    const fortyManActiveFallback = isFortyManActiveFallback(forty, people, teamMlbId);
    if (fortyManActiveFallback) {
      availability_status = "active_available"; roster_status = "forty_man_active_fallback"; availability_confidence = "WARNING_FORTY_MAN_ACTIVE_FALLBACK";
      reason = "Official active roster source failed, but official 40-man roster status is Active for the expected team and People endpoint is not contradictory.";
      issues.push({ issue_type: "active_roster_gap_forty_man_active_confirmed", issue_severity: "warning", reason, details: { active_roster_source_failed: true, forty_man_active: true, forty_man_parent_team_id: intOrNull(forty?.parentTeamId), people_active: people ? people.active === true : null, people_current_team_id: peopleTeam } });
      if (latestTx && (latestTxClass.warning || latestTxClass.hard_block)) { transaction_warning_flag = 1; issues.push({ issue_type: "recent_transaction_active", issue_severity: "warning", reason: "Recent transaction exists but 40-man active fallback confirms player on expected team.", details: compactTx(latestTx) }); }
    } else if (context.recentAppearanceConfirmed) {
      availability_status = "active_available"; roster_status = "derived_recent_appearance"; availability_confidence = "LOW_DERIVED_RECENT_APPEARANCE_FALLBACK";
      reason = "Official active roster source failed and no 40-man active fallback confirmed availability, but the player has a real, recent game-log appearance for this team within the last 10 days.";
      issues.push({ issue_type: "active_roster_gap_recent_appearance_confirmed", issue_severity: "warning", reason });
    } else {
      availability_status = "source_missing"; roster_status = "unknown"; availability_confidence = "BLOCKED_SOURCE_MISSING";
      reason = "Official active roster source failed for expected team and no safe 40-man active fallback or recent game-log appearance confirmed availability.";
      source_missing_flag = 1;
      issues.push({ issue_type: "active_roster_source_failed", issue_severity: "blocker", reason });
    }
  } else if (peopleTeam && peopleTeam !== teamMlbId && !activeFlag) {
    availability_status = "team_mismatch"; roster_status = "unknown"; availability_confidence = "BLOCKED_TEAM_MISMATCH";
    reason = "People endpoint currentTeam conflicts with prepared-board team and active roster does not confirm prepared team.";
    team_mismatch_flag = 1;
    issues.push({ issue_type: "team_mismatch", issue_severity: "blocker", reason, details: { people_current_team_id: peopleTeam, prepared_team_id: teamMlbId } });
  } else if (ilFlag) {
    availability_status = "injured_list";
    roster_status = String(il?.status?.description || il?.status?.code || "injured_list").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "injured_list";
    availability_confidence = "BLOCKED_OFFICIAL_IL";
    reason = "Player appears on official MLB injuredList roster endpoint for expected team.";
    issues.push({ issue_type: "official_injured_list", issue_severity: "blocker", reason });
  } else if (activeFlag) {
    availability_status = "active_available"; roster_status = "active_roster"; availability_confidence = "HIGH_OFFICIAL_ACTIVE_ROSTER";
    reason = "Player appears on official MLB active roster for expected team.";
    if (latestTx && (latestTxClass.warning || latestTxClass.hard_block)) {
      transaction_warning_flag = 1;
      availability_confidence = latestTxClass.hard_block && sameDayTx ? "WARNING_TRANSACTION_CONFLICT_ACTIVE_ROSTER_WINS" : "WARNING_RECENT_TRANSACTION_ACTIVE";
      issues.push({ issue_type: "recent_transaction_active", issue_severity: "warning", reason: "Recent transaction exists but active roster confirms player on expected team.", details: compactTx(latestTx) });
    }
  } else if (latestTx && latestTxClass.hard_block) {
    availability_status = latestTxClass.kind === "outrighted" ? "optioned" : latestTxClass.kind;
    roster_status = "not_active_roster"; availability_confidence = "BLOCKED_OFFICIAL_TRANSACTION";
    reason = "Official MLB transaction indicates player is unavailable and active roster does not confirm availability.";
    transaction_block_flag = 1;
    issues.push({ issue_type: "blocking_transaction", issue_severity: "blocker", reason, details: compactTx(latestTx) });
  } else if (fortyFlag) {
    availability_status = "inactive_not_active_roster"; roster_status = "forty_man_not_active"; availability_confidence = "BLOCKED_NOT_ACTIVE";
    reason = "Player appears on 40-man roster but not active roster for expected team.";
    issues.push({ issue_type: "not_active_roster", issue_severity: "blocker", reason });
    if (latestTx && latestTxClass.warning) { transaction_warning_flag = 1; issues.push({ issue_type: "recent_transaction_not_active", issue_severity: "warning", reason: "Recent transaction exists while player is not on active roster.", details: compactTx(latestTx) }); }
  } else if (context.recentAppearanceConfirmed) {
    availability_status = "active_available"; roster_status = "derived_recent_appearance"; availability_confidence = "LOW_DERIVED_RECENT_APPEARANCE_FALLBACK";
    reason = "Player is absent from active, injuredList, and 40-man endpoints for expected team, but has a real, recent game-log appearance for this team within the last 10 days.";
    issues.push({ issue_type: "missing_roster_record_recent_appearance_confirmed", issue_severity: "warning", reason });
  } else {
    availability_status = "source_missing"; roster_status = "unknown"; availability_confidence = "BLOCKED_SOURCE_MISSING";
    reason = "Player is absent from active, injuredList, and 40-man endpoints for expected team, and has no recent game-log appearance to fall back on.";
    source_missing_flag = 1;
    issues.push({ issue_type: "missing_roster_record", issue_severity: "blocker", reason });
  }

  const evaluation = {
    player_id: playerId, team_mlb_id: teamMlbId, active_roster_hit: activeFlag, injured_list_hit: ilFlag, forty_man_hit: fortyFlag,
    people_current_team_id: peopleTeam, latest_transaction: compactTx(latestTx), transaction_classification: latestTx ? latestTxClass : null,
    endpoints, source_snippets: { active: compactRosterRow(active), injured_list: compactRosterRow(il), forty_man: compactRosterRow(forty), people: compactPeople(people) }
  };

  const isDerivedTier = roster_status === "forty_man_active_fallback" || roster_status === "derived_recent_appearance";
  const dataSourceLevel = availability_status === "source_missing" ? "unknown" : (isDerivedTier ? "derived" : "real");
  return {
    availability_status, roster_status, availability_confidence, reason, data_source_level: dataSourceLevel, is_temporary_derived: isDerivedTier ? 1 : 0,
    flags: { active_roster_flag: activeFlag ? 1 : 0, injured_list_flag: ilFlag ? 1 : 0, forty_man_flag: fortyFlag ? 1 : 0, transaction_warning_flag, transaction_block_flag, team_mismatch_flag, source_missing_flag },
    latestTx, issues, evaluation
  };
}

async function writeResults(pg, batchId, rows) {
  if (!rows.length) return { rows_written: 0, snapshot_rows_written: 0, issues_written: 0, write_batch_row_limit: WRITE_BATCH_ROW_LIMIT };
  const currentRows = rows.map(item => {
    const r = item.row, c = item.classification;
    return {
      availability_id: item.availability_key, availability_key: item.availability_key, batch_id: batchId, source_key: SOURCE_KEY, source_snapshot_at: item.source_snapshot_at,
      official_date: r.official_date, game_pk: r.official_game_pk, game_time_utc: r.official_game_time_utc,
      player_id: intOrNull(r.resolved_player_id), mlb_player_id: intOrNull(r.resolved_mlb_player_id), player_name: r.player_name || null,
      team_abbreviation: normTeam(r.team), team_id: item.team_id || null, team_mlb_id: item.team_mlb_id,
      opponent_abbreviation: normTeam(r.opponent), opponent_mlb_id: item.opponent_mlb_id,
      availability_status: c.availability_status, roster_status: c.roster_status, availability_confidence: c.availability_confidence,
      active_roster_flag: c.flags.active_roster_flag, injured_list_flag: c.flags.injured_list_flag, forty_man_flag: c.flags.forty_man_flag,
      transaction_warning_flag: c.flags.transaction_warning_flag, transaction_block_flag: c.flags.transaction_block_flag,
      team_mismatch_flag: c.flags.team_mismatch_flag, source_missing_flag: c.flags.source_missing_flag,
      data_source_level: c.data_source_level, is_temporary_derived: c.is_temporary_derived, prepared_board_relevant: 1,
      prepared_board_pickable_rows: Number(r.prepared_board_pickable_rows || 0), source_endpoints_json: safeJson(item.source_endpoints, 3000),
      transaction_summary: c.latestTx ? `${c.latestTx.typeCode || ""} ${c.latestTx.typeDesc || ""}: ${c.latestTx.description || ""}`.slice(0, 900) : null,
      transaction_date: c.latestTx ? (c.latestTx.date || c.latestTx.effectiveDate || null) : null, reason: c.reason, evaluation_json: safeJson(c.evaluation, 9000)
    };
  });
  const currentCols = ["availability_id", "availability_key", "batch_id", "source_key", "source_snapshot_at", "official_date", "game_pk", "game_time_utc", "player_id", "mlb_player_id", "player_name", "team_abbreviation", "team_id", "team_mlb_id", "opponent_abbreviation", "opponent_mlb_id", "availability_status", "roster_status", "availability_confidence", "active_roster_flag", "injured_list_flag", "forty_man_flag", "transaction_warning_flag", "transaction_block_flag", "team_mismatch_flag", "source_missing_flag", "data_source_level", "is_temporary_derived", "prepared_board_relevant", "prepared_board_pickable_rows", "source_endpoints_json", "transaction_summary", "transaction_date", "reason", "evaluation_json"];
  for (let i = 0; i < currentRows.length; i += WRITE_BATCH_ROW_LIMIT) {
    const chunk = currentRows.slice(i, i + WRITE_BATCH_ROW_LIMIT);
    await pg`INSERT INTO daily.player_availability_current ${pg(chunk, ...currentCols)}
      ON CONFLICT (availability_key) DO UPDATE SET batch_id=excluded.batch_id, source_snapshot_at=excluded.source_snapshot_at, game_time_utc=excluded.game_time_utc,
      player_id=excluded.player_id, player_name=excluded.player_name, team_abbreviation=excluded.team_abbreviation, team_id=excluded.team_id,
      opponent_abbreviation=excluded.opponent_abbreviation, opponent_mlb_id=excluded.opponent_mlb_id, availability_status=excluded.availability_status,
      roster_status=excluded.roster_status, availability_confidence=excluded.availability_confidence, active_roster_flag=excluded.active_roster_flag,
      injured_list_flag=excluded.injured_list_flag, forty_man_flag=excluded.forty_man_flag, transaction_warning_flag=excluded.transaction_warning_flag,
      transaction_block_flag=excluded.transaction_block_flag, team_mismatch_flag=excluded.team_mismatch_flag, source_missing_flag=excluded.source_missing_flag,
      data_source_level=excluded.data_source_level, is_temporary_derived=excluded.is_temporary_derived, prepared_board_pickable_rows=excluded.prepared_board_pickable_rows,
      source_endpoints_json=excluded.source_endpoints_json, transaction_summary=excluded.transaction_summary, transaction_date=excluded.transaction_date,
      reason=excluded.reason, evaluation_json=excluded.evaluation_json, updated_at=now()`;
  }
  const snapshotRows = rows.map(item => ({ snapshot_id: rid("dpav1_snapshot"), batch_id: batchId, availability_key: item.availability_key, official_date: item.row.official_date, game_pk: item.row.official_game_pk, mlb_player_id: intOrNull(item.row.resolved_mlb_player_id), team_mlb_id: item.team_mlb_id, availability_status: item.classification.availability_status, roster_status: item.classification.roster_status, availability_confidence: item.classification.availability_confidence, source_key: SOURCE_KEY, source_snapshot_at: item.source_snapshot_at, source_payload_snippets: safeJson(item.classification.evaluation.source_snippets, 7000) }));
  const snapshotCols = ["snapshot_id", "batch_id", "availability_key", "official_date", "game_pk", "mlb_player_id", "team_mlb_id", "availability_status", "roster_status", "availability_confidence", "source_key", "source_snapshot_at", "source_payload_snippets"];
  for (let i = 0; i < snapshotRows.length; i += WRITE_BATCH_ROW_LIMIT) {
    await pg`INSERT INTO daily.player_availability_snapshots ${pg(snapshotRows.slice(i, i + WRITE_BATCH_ROW_LIMIT), ...snapshotCols)}`;
  }
  const issueRows = [];
  for (const item of rows) {
    for (const issue of item.classification.issues) {
      issueRows.push({ issue_id: rid("dpav1_issue"), batch_id: batchId, official_date: item.row.official_date, game_pk: item.row.official_game_pk, mlb_player_id: intOrNull(item.row.resolved_mlb_player_id), team_mlb_id: item.team_mlb_id, issue_type: issue.issue_type, issue_severity: issue.issue_severity, reason: issue.reason || item.classification.reason, details_json: safeJson(issue.details || item.classification.evaluation, 5000) });
    }
  }
  const issueCols = ["issue_id", "batch_id", "official_date", "game_pk", "mlb_player_id", "team_mlb_id", "issue_type", "issue_severity", "reason", "details_json"];
  for (let i = 0; i < issueRows.length; i += WRITE_BATCH_ROW_LIMIT) {
    await pg`INSERT INTO daily.player_availability_issues ${pg(issueRows.slice(i, i + WRITE_BATCH_ROW_LIMIT), ...issueCols)}`;
  }
  return { rows_written: currentRows.length, snapshot_rows_written: snapshotRows.length, issues_written: issueRows.length, write_batch_row_limit: WRITE_BATCH_ROW_LIMIT };
}

async function runAvailability(env, input) {
  const _t0 = Date.now();
  const startedAt = nowUtc();
  const batchId = input && input.chain_id ? `daily_player_availability_batch_${input.chain_id}` : rid("daily_player_availability_batch");
  const requestId = input.request_id || batchId;
  const runId = input.run_id || null;
  const pg = pgClient(env);
  try {
    await ensureSchema(pg);
    const nowIsoForWindow = new Date().toISOString();
    const realBoardDateRows = await pg.unsafe(`SELECT DISTINCT official_date FROM score.board_prepared_current WHERE pickable_safe = 1 AND official_game_time_utc IS NOT NULL AND official_game_time_utc > $1`, [nowIsoForWindow]);
    const realBoardDates = realBoardDateRows.map(r => r.official_date).filter(Boolean);
    const retention = retentionWindowPt(realBoardDates);
    const preRetentionPrune = await pruneAvailabilityRetention(pg, retention, null);
    await pg.unsafe(
      `INSERT INTO daily.player_availability_batches (batch_id, request_id, run_id, job_key, worker_name, worker_version, mode, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', COALESCE((SELECT started_at FROM daily.player_availability_batches WHERE batch_id=$1), $8))
       ON CONFLICT (batch_id) DO UPDATE SET status='running', updated_at=now()`,
      [batchId, requestId, runId, input.job_key || JOB_KEY, WORKER_NAME, VERSION, input.mode || "daily_player_availability_refresh_window", startedAt]
    );

    const prepared = await getPreparedPlayers(pg, retention);
    const gamePks = [...new Set(prepared.map((r) => intOrNull(r.official_game_pk)).filter((v) => v !== null))];
    const teamAbbrs = [...new Set(prepared.flatMap((r) => [normTeam(r.team), normTeam(r.opponent)]).filter(Boolean))];
    const playerIds = [...new Set(prepared.map((r) => intOrNull(r.resolved_mlb_player_id)).filter((v) => v !== null))];
    await pg.unsafe(`UPDATE daily.player_availability_batches SET window_start=$1, window_end=$2, prepared_games_checked=$3, prepared_rows_read=$4, prepared_players_checked=$5, status='running_prepared_loaded', updated_at=now() WHERE batch_id=$6`,
      [retention.start, retention.end, gamePks.length, prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0), playerIds.length, batchId]);

    const calendars = await getCalendar(pg, gamePks);
    const calendarByGame = new Map(calendars.map((r) => [intOrNull(r.game_pk), r]));
    const teamRows = await getTeams(pg, teamAbbrs);
    const teamByAbbr = new Map(teamRows.map((r) => [normTeam(r.abbreviation), r]));
    const staticPlayers = await getStaticPlayers(pg, playerIds);
    const staticByMlbId = new Map(staticPlayers.map((r) => [intOrNull(r.mlb_player_id), r]));
    const masterChainSourceBudget = input.daily_context_full_run_child === true || input.full_daily_master_run === true || input.backend_chain_only === true || String(input.mode || "").includes("daily_context_full_run");
    const windowStart = retention.start;
    const windowEnd = retention.end;
    const teamIds = [...new Set(teamRows.map((r) => intOrNull(r.mlb_team_id)).filter((v) => v !== null))];
    const MAX_TEAMS_PER_INVOCATION = 10;
    const alreadyDoneTeams = await pg`SELECT DISTINCT team_mlb_id FROM daily.player_availability_current WHERE batch_id=${batchId}`.catch(() => []);
    const alreadyDoneTeamIds = new Set(alreadyDoneTeams.map(r => Number(r.team_mlb_id)));
    const remainingTeamIds = teamIds.filter(id => !alreadyDoneTeamIds.has(id));
    const totalRemainingTeamsBeforeChunk = remainingTeamIds.length;
    const chunkTeamIds = remainingTeamIds.slice(0, MAX_TEAMS_PER_INVOCATION);
    const isPartial = totalRemainingTeamsBeforeChunk > chunkTeamIds.length;
    const chunkTeamIdSet = new Set(chunkTeamIds);
    const preparedChunk = prepared.filter(r => { const t = teamByAbbr.get(normTeam(r.team)); const tid = t ? intOrNull(t.mlb_team_id) : null; return tid !== null && chunkTeamIdSet.has(tid); });
    const playerIdsChunk = [...new Set(preparedChunk.map((r) => intOrNull(r.resolved_mlb_player_id)).filter((v) => v !== null))];
    await pg.unsafe(`UPDATE daily.player_availability_batches SET window_start=$1, window_end=$2, teams_checked=$3, status='running_sources_started', updated_at=now() WHERE batch_id=$4`, [windowStart, windowEnd, teamIds.length, batchId]);

    const sources = await withDeadline(
      fetchSources(env, chunkTeamIds, playerIdsChunk, windowStart, windowEnd, { masterChainSourceBudget }),
      masterChainSourceBudget ? 14000 : SOURCE_DEADLINE_MS,
      () => deadlineFallbackSources(chunkTeamIds, playerIdsChunk, windowStart, windowEnd)
    );
    await pg.unsafe(`UPDATE daily.player_availability_batches SET source_failures=$1, external_calls=$2, status=$3, updated_at=now() WHERE batch_id=$4`,
      [(sources.sourceFailures || []).length, Number(sources.externalCalls || 0), sources.source_deadline_hit ? 'running_source_deadline_fallback' : 'running_sources_completed', batchId]);
    const sourceSnapshotAt = nowUtc();

    const recentAppearanceMap = await loadRecentAppearances(pg, playerIdsChunk, windowStart);
    const results = [];
    const activeTeamFailures = new Set(sources.sourceFailures.filter((f) => f.hard).map((f) => intOrNull(f.teamId)).filter((v) => v !== null));
    for (const row of preparedChunk) {
      const team = teamByAbbr.get(normTeam(row.team));
      const opp = teamByAbbr.get(normTeam(row.opponent));
      const teamMlbId = team ? intOrNull(team.mlb_team_id) : null;
      const calendar = calendarByGame.get(intOrNull(row.official_game_pk));
      const calendarTeamMatch = !!(calendar && teamMlbId && (intOrNull(calendar.home_team_id) === teamMlbId || intOrNull(calendar.away_team_id) === teamMlbId));
      const context = {
        teamMlbId, calendarTeamMatch, activeSourceFailed: teamMlbId ? activeTeamFailures.has(teamMlbId) : true,
        activeMap: teamMlbId ? sources.activeByTeam.get(teamMlbId) : null, fortyMap: teamMlbId ? sources.fortyByTeam.get(teamMlbId) : null,
        ilMap: teamMlbId ? sources.ilByTeam.get(teamMlbId) : null, txMap: teamMlbId ? sources.txByTeam.get(teamMlbId) : null,
        peopleMap: sources.people, staticPlayer: staticByMlbId.get(intOrNull(row.resolved_mlb_player_id)) || null,
        recentAppearanceConfirmed: recentAppearanceMap.has(intOrNull(row.resolved_mlb_player_id))
      };
      const classification = classify(row, context);
      const key = `dpav1_${row.official_date}_${row.official_game_pk}_${row.resolved_mlb_player_id}_${teamMlbId || "unknown"}`;
      results.push({ row, classification, availability_key: key, source_snapshot_at: sourceSnapshotAt, team_id: team ? team.team_id : null, team_mlb_id: teamMlbId, opponent_mlb_id: opp ? intOrNull(opp.mlb_team_id) : null, source_endpoints: sources.endpointLog.filter((e) => !e.teamId || e.teamId === teamMlbId) });
    }
    const written = await writeResults(pg, batchId, results);
    const postRetentionPrune = await pruneAvailabilityRetention(pg, retention, batchId);
    const blockerCount = results.reduce((n, r) => n + r.classification.issues.filter((i) => i.issue_severity === "blocker").length, 0);
    const warningCount = results.reduce((n, r) => n + r.classification.issues.filter((i) => i.issue_severity === "warning").length, 0);
    const rawHardSourceFailures = sources.sourceFailures.filter((f) => f.hard).length;
    const unresolvedHardSourceFailures = results.reduce((n, r) => n + r.classification.issues.filter((i) => i.issue_type === "active_roster_source_failed" && i.issue_severity === "blocker").length, 0);
    const sourceFailures = sources.sourceFailures.length;
    const counts = {
      prepared_games_checked: gamePks.length, prepared_rows_read: prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0),
      prepared_players_checked: results.length, teams_checked: teamIds.length,
      active_roster_players_found: results.filter((r) => r.classification.flags.active_roster_flag).length,
      injured_list_players_found: results.filter((r) => r.classification.flags.injured_list_flag).length,
      forty_man_players_found: results.filter((r) => r.classification.flags.forty_man_flag).length,
      unavailable_players_found: results.filter((r) => !["active_available"].includes(r.classification.availability_status)).length,
      unknown_players_found: results.filter((r) => r.classification.availability_status === "unknown" || r.classification.availability_status === "source_missing").length,
      rows_written: written.rows_written, snapshot_rows_written: written.snapshot_rows_written, issues_written: written.issues_written,
      source_failures: sourceFailures, hard_source_failures: unresolvedHardSourceFailures, blocker_count: blockerCount, warning_count: warningCount, external_calls: sources.externalCalls
    };
    const coverageOk = results.length > 0 && written.rows_written === results.length && written.snapshot_rows_written === results.length;
    const dataOk = coverageOk && unresolvedHardSourceFailures === 0;
    const certification = dataOk ? (blockerCount ? "DAILY_PLAYER_AVAILABILITY_CERTIFIED_WITH_PLAYER_BLOCKERS" : "DAILY_PLAYER_AVAILABILITY_CERTIFIED_READY") : "DAILY_PLAYER_AVAILABILITY_FAILED_SOURCE_OR_COVERAGE";
    const grade = dataOk ? (blockerCount || warningCount ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL";
    const status = isPartial ? "partial_continue" : (dataOk ? "completed" : "failed_source_or_coverage");
    const output = {
      ok: isPartial ? true : dataOk, data_ok: isPartial ? true : dataOk, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, batch_id: batchId, status,
      continuation_required: isPartial, orchestrator_should_self_continue: isPartial, teams_remaining_after_chunk: Math.max(0, totalRemainingTeamsBeforeChunk - chunkTeamIds.length),
      certification, certification_grade: grade,
      certification_reason: dataOk ? "Every prepared-board relevant player received a v1 current and snapshot row; source blockers/warnings are recorded as sidecar issues." : "One or more hard active-roster source failures or coverage gaps occurred.",
      ...counts, window_start: windowStart, window_end: windowEnd, retention_policy: "board_scoped_not_yet_started_games_only_current_latest_batch",
      retention_date_start: retention.start, retention_date_end: retention.end, retention_pre_prune: preRetentionPrune, retention_post_prune: postRetentionPrune,
      source_failures_detail: sources.sourceFailures.slice(0, 25), raw_hard_source_failures: rawHardSourceFailures, unresolved_hard_source_failures: unresolvedHardSourceFailures,
      fetch_concurrency: sources.fetch_concurrency || FETCH_CONCURRENCY, fetch_timeout_ms: sources.fetch_timeout_ms || FETCH_TIMEOUT_MS,
      source_deadline_ms: sources.source_deadline_ms || (masterChainSourceBudget ? 14000 : SOURCE_DEADLINE_MS), source_deadline_hit: sources.source_deadline_hit === true,
      master_chain_source_budget: sources.master_chain_source_budget === true, source_deadline_window: sources.source_deadline_window || null,
      write_batch_row_limit: written.write_batch_row_limit || WRITE_BATCH_ROW_LIMIT,
      no_score_db_mutation: true, no_calendar_rebuild: true, no_lineups: true, no_starters_duplication: true, no_scoring: true, no_ranking: true, no_final_board: true,
      sidecar_tables: ["daily.player_availability_current", "daily.player_availability_snapshots", "daily.player_availability_batches", "daily.player_availability_issues"],
      timestamp_utc: nowUtc()
    };
    await pg.unsafe(
      `UPDATE daily.player_availability_batches SET status=$1, window_start=$2, window_end=$3, prepared_games_checked=$4, prepared_rows_read=$5, prepared_players_checked=$6, teams_checked=$7,
       active_roster_players_found=$8, injured_list_players_found=$9, forty_man_players_found=$10, unavailable_players_found=$11, unknown_players_found=$12, rows_written=$13, snapshot_rows_written=$14,
       source_failures=$15, hard_source_failures=$16, blocker_count=$17, warning_count=$18, external_calls=$19, certification_status=$20, certification_grade=$21, certification_reason=$22, output_json=$23,
       completed_at=now(), updated_at=now() WHERE batch_id=$24`,
      [status, windowStart, windowEnd, counts.prepared_games_checked, counts.prepared_rows_read, counts.prepared_players_checked, counts.teams_checked, counts.active_roster_players_found,
        counts.injured_list_players_found, counts.forty_man_players_found, counts.unavailable_players_found, counts.unknown_players_found, counts.rows_written, counts.snapshot_rows_written,
        counts.source_failures, counts.hard_source_failures, counts.blocker_count, counts.warning_count, counts.external_calls, certification, grade, output.certification_reason,
        JSON.stringify(output).slice(0, 12000), batchId]
    );
    return output;
  } catch (err) {
    const message = String(err && err.stack ? err.stack : err);
    let cleanup = null;
    try {
      const runningRows = await pg`SELECT batch_id, status FROM daily.player_availability_batches WHERE request_id=${input.request_id || null} AND status LIKE 'running%'`;
      for (const row of runningRows) {
        const oneCleanup = await preserveBatchRowsForTerminalFailure(pg, row.batch_id);
        cleanup = cleanup || [];
        cleanup.push({ batch_id: row.batch_id, previous_status: row.status, ...oneCleanup });
      }
      await pg.unsafe(
        `UPDATE daily.player_availability_batches SET status='failed_exception_terminalized', certification_status='DAILY_PLAYER_AVAILABILITY_EXCEPTION_TERMINALIZED_RUNNING_STATE', certification_grade='FAIL', certification_reason=$1, output_json=$2, completed_at=now(), updated_at=now() WHERE request_id=$3 AND status LIKE 'running%'`,
        [message.slice(0, 900), JSON.stringify({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_PLAYER_AVAILABILITY_EXCEPTION_TERMINALIZED_RUNNING_STATE", error: message, preserved_sidecars: cleanup, timestamp_utc: nowUtc() }).slice(0, 12000), input.request_id || null]
      );
    } catch (_) {}
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_PLAYER_AVAILABILITY_EXCEPTION_TERMINALIZED_RUNNING_STATE", error: message, cleanup, timestamp_utc: nowUtc(), no_score_db_mutation: true, __exception__: true };
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
      const out = await runAvailability(env, input);
      if (out.__exception__) return jsonResponse(out, 500);
      return jsonResponse(out);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
