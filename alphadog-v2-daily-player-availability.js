const WORKER_NAME = "alphadog-v2-daily-player-availability";
const VERSION = "alphadog-v2-daily-player-availability-v0.1.0-official-roster-sidecar";
const JOB_KEY = "daily-player-availability";
const SOURCE_KEY = "official_mlb_statsapi_roster_transactions_v1";
const MAX_PREPARED_PLAYERS = 500;
const PEOPLE_BATCH_SIZE = 50;
const FETCH_TIMEOUT_MS = 12000;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL"];

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
async function first(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).first() : await s.first(); }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
function placeholders(n) { return Array.from({ length: n }, () => "?").join(","); }
function safeJson(value, max = 12000) {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "READY_OFFICIAL_ROSTER_SIDEcar",
    timestamp_utc: nowUtc(),
    phase: "daily-context-phase-3-player-availability",
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) },
    guardrails: {
      sidecar_tables_only: true,
      legacy_stub_untouched: true,
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      no_score_db_mutation: true,
      no_calendar_rebuild: true,
      no_daily_starters_duplication: true,
      no_daily_lineups: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true
    }
  };
}
function sourceBase(env) {
  const raw = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  if (raw.endsWith("/api/v1")) return raw;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}/api/v1`;
  } catch (_) {
    return "https://statsapi.mlb.com/api/v1";
  }
}
function requestHeaders(env) {
  return { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-Daily-Player-Availability/0.1") };
}
async function fetchJson(url, env, optional = false) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
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
    id: tx.id || null,
    person: tx.person ? { id: tx.person.id || null, fullName: tx.person.fullName || null } : null,
    team: tx.team ? { id: tx.team.id || null, name: tx.team.name || null } : null,
    date: tx.date || null,
    effectiveDate: tx.effectiveDate || null,
    typeCode: tx.typeCode || null,
    typeDesc: tx.typeDesc || null,
    description: tx.description || null,
    fromTeam: tx.fromTeam ? { id: tx.fromTeam.id || null, name: tx.fromTeam.name || null } : null,
    toTeam: tx.toTeam ? { id: tx.toTeam.id || null, name: tx.toTeam.name || null } : null
  };
}
function compactPeople(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    fullName: row.fullName || null,
    active: row.active === true,
    currentTeam: row.currentTeam ? { id: row.currentTeam.id || null } : null,
    primaryPosition: row.primaryPosition ? { abbreviation: row.primaryPosition.abbreviation || null } : null,
    batSide: row.batSide ? { code: row.batSide.code || null } : null,
    pitchHand: row.pitchHand ? { code: row.pitchHand.code || null } : null
  };
}

async function ensureSchema(env) {
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_player_availability_batches_v1 (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    job_key TEXT,
    worker_name TEXT,
    worker_version TEXT,
    mode TEXT,
    status TEXT,
    window_start TEXT,
    window_end TEXT,
    prepared_games_checked INTEGER DEFAULT 0,
    prepared_rows_read INTEGER DEFAULT 0,
    prepared_players_checked INTEGER DEFAULT 0,
    teams_checked INTEGER DEFAULT 0,
    active_roster_players_found INTEGER DEFAULT 0,
    injured_list_players_found INTEGER DEFAULT 0,
    forty_man_players_found INTEGER DEFAULT 0,
    unavailable_players_found INTEGER DEFAULT 0,
    unknown_players_found INTEGER DEFAULT 0,
    rows_written INTEGER DEFAULT 0,
    snapshot_rows_written INTEGER DEFAULT 0,
    source_failures INTEGER DEFAULT 0,
    hard_source_failures INTEGER DEFAULT 0,
    blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
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
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_player_availability_current_v1 (
    availability_key TEXT PRIMARY KEY,
    batch_id TEXT,
    source_key TEXT,
    source_snapshot_at TEXT,
    official_date TEXT,
    game_pk INTEGER,
    game_time_utc TEXT,
    player_id INTEGER,
    mlb_player_id INTEGER,
    player_name TEXT,
    team_abbreviation TEXT,
    team_id TEXT,
    team_mlb_id INTEGER,
    opponent_abbreviation TEXT,
    opponent_mlb_id INTEGER,
    availability_status TEXT,
    roster_status TEXT,
    availability_confidence TEXT,
    active_roster_flag INTEGER DEFAULT 0,
    injured_list_flag INTEGER DEFAULT 0,
    forty_man_flag INTEGER DEFAULT 0,
    transaction_warning_flag INTEGER DEFAULT 0,
    transaction_block_flag INTEGER DEFAULT 0,
    team_mismatch_flag INTEGER DEFAULT 0,
    source_missing_flag INTEGER DEFAULT 0,
    prepared_board_relevant INTEGER DEFAULT 1,
    prepared_board_pickable_rows INTEGER DEFAULT 0,
    source_endpoints_json TEXT,
    transaction_summary TEXT,
    transaction_date TEXT,
    reason TEXT,
    evaluation_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(official_date, game_pk, mlb_player_id, team_mlb_id)
  )`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_player_availability_snapshots_v1 (
    snapshot_id TEXT PRIMARY KEY,
    batch_id TEXT,
    availability_key TEXT,
    official_date TEXT,
    game_pk INTEGER,
    mlb_player_id INTEGER,
    team_mlb_id INTEGER,
    availability_status TEXT,
    roster_status TEXT,
    availability_confidence TEXT,
    source_key TEXT,
    source_snapshot_at TEXT,
    source_payload_snippets TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_player_availability_issues_v1 (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    mlb_player_id INTEGER,
    team_mlb_id INTEGER,
    issue_type TEXT,
    issue_severity TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_dpav1_current_game ON daily_player_availability_current_v1 (official_date, game_pk)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_dpav1_current_player ON daily_player_availability_current_v1 (mlb_player_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_dpav1_current_status ON daily_player_availability_current_v1 (availability_status)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_dpav1_snap_batch ON daily_player_availability_snapshots_v1 (batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_dpav1_issues_batch ON daily_player_availability_issues_v1 (batch_id)`);
  await run(env.DAILY_DB, `CREATE INDEX IF NOT EXISTS idx_dpav1_issues_severity ON daily_player_availability_issues_v1 (issue_severity)`);
  await run(env.DAILY_DB, `INSERT OR IGNORE INTO daily_schema_migrations (migration_key, package_version, notes) VALUES ('schema_daily_player_availability_v1_sidecar', ?, 'Additive Daily Player Availability v1 sidecar tables; legacy daily_player_availability stub untouched')`, VERSION);
}

async function getPreparedPlayers(env) {
  return await all(env.SCORE_DB, `
    SELECT
      official_game_pk,
      official_date,
      official_game_time_utc,
      team,
      opponent,
      resolved_player_id,
      resolved_mlb_player_id,
      MIN(player_name) AS player_name,
      COUNT(*) AS prepared_board_pickable_rows,
      GROUP_CONCAT(DISTINCT source_key) AS sources,
      GROUP_CONCAT(DISTINCT canonical_prop_key) AS prop_keys
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
      AND resolved_mlb_player_id IS NOT NULL
    GROUP BY official_game_pk, official_date, official_game_time_utc, team, opponent, resolved_player_id, resolved_mlb_player_id
    ORDER BY official_game_time_utc, official_game_pk, team, player_name
    LIMIT ${MAX_PREPARED_PLAYERS}
  `);
}
async function getCalendar(env, gamePks) {
  if (!gamePks.length) return [];
  return await all(env.TEAM_DB, `
    SELECT game_pk, official_date, game_time_utc, home_team_id, away_team_id, home_team_name, away_team_name, status_code, abstract_game_state, detailed_state, is_postponed, is_suspended, is_cancelled
    FROM mlb_game_calendar
    WHERE game_pk IN (${placeholders(gamePks.length)})
  `, ...gamePks);
}
async function getTeams(env, teamAbbrs) {
  if (!teamAbbrs.length) return [];
  return await all(env.REF_DB, `
    SELECT team_id, mlb_team_id, abbreviation, full_name, active
    FROM ref_teams
    WHERE abbreviation IN (${placeholders(teamAbbrs.length)})
  `, ...teamAbbrs);
}
async function getStaticPlayers(env, ids) {
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 90) chunks.push(ids.slice(i, i + 90));
  const out = [];
  for (const chunk of chunks) {
    const rows = await all(env.REF_DB, `
      SELECT player_id, mlb_player_id, player_name, full_name, current_team_id, current_mlb_team_id, active
      FROM ref_players
      WHERE mlb_player_id IN (${placeholders(chunk.length)})
    `, ...chunk);
    out.push(...rows);
  }
  return out;
}
function rosterMap(resp) {
  const m = new Map();
  const rows = resp && resp.ok && resp.json && Array.isArray(resp.json.roster) ? resp.json.roster : [];
  for (const row of rows) {
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
    for (const row of rows) {
      const id = intOrNull(row.id);
      if (id !== null) m.set(id, row);
    }
  }
  return m;
}
async function fetchSources(env, teamIds, playerIds, startDate, endDate) {
  const base = sourceBase(env);
  const sourceFailures = [];
  const activeByTeam = new Map();
  const fortyByTeam = new Map();
  const ilByTeam = new Map();
  const txByTeam = new Map();
  const endpointLog = [];
  let externalCalls = 0;
  for (const teamId of teamIds) {
    const active = await fetchJson(`${base}/teams/${teamId}/roster?rosterType=active`, env, false); externalCalls++; endpointLog.push({ teamId, endpoint: "active", ok: active.ok, status: active.status });
    const forty = await fetchJson(`${base}/teams/${teamId}/roster?rosterType=40Man`, env, true); externalCalls++; endpointLog.push({ teamId, endpoint: "40Man", ok: forty.ok, status: forty.status });
    const il = await fetchJson(`${base}/teams/${teamId}/roster?rosterType=injuredList`, env, true); externalCalls++; endpointLog.push({ teamId, endpoint: "injuredList", ok: il.ok, status: il.status });
    const tx = await fetchJson(`${base}/transactions?teamId=${encodeURIComponent(String(teamId))}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, env, true); externalCalls++; endpointLog.push({ teamId, endpoint: "transactions", ok: tx.ok, status: tx.status });
    if (!active.ok) sourceFailures.push({ teamId, endpoint: "active", hard: true, status: active.status, error: active.error || active.text_preview || null });
    if (!forty.ok) sourceFailures.push({ teamId, endpoint: "40Man", hard: false, status: forty.status, error: forty.error || forty.text_preview || null });
    if (!il.ok) sourceFailures.push({ teamId, endpoint: "injuredList", hard: false, status: il.status, error: il.error || il.text_preview || null });
    if (!tx.ok) sourceFailures.push({ teamId, endpoint: "transactions", hard: false, status: tx.status, error: tx.error || tx.text_preview || null });
    activeByTeam.set(teamId, rosterMap(active));
    fortyByTeam.set(teamId, rosterMap(forty));
    ilByTeam.set(teamId, rosterMap(il));
    txByTeam.set(teamId, txMap(tx));
  }
  const peopleResponses = [];
  for (let i = 0; i < playerIds.length; i += PEOPLE_BATCH_SIZE) {
    const ids = playerIds.slice(i, i + PEOPLE_BATCH_SIZE);
    const resp = await fetchJson(`${base}/people?personIds=${encodeURIComponent(ids.join(","))}`, env, true); externalCalls++; endpointLog.push({ endpoint: "people", ids: ids.length, ok: resp.ok, status: resp.status });
    if (!resp.ok) sourceFailures.push({ endpoint: "people", hard: false, status: resp.status, error: resp.error || resp.text_preview || null });
    peopleResponses.push(resp);
  }
  return { activeByTeam, fortyByTeam, ilByTeam, txByTeam, people: peopleMap(peopleResponses), sourceFailures, endpointLog, externalCalls };
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

  let availability_status = "unknown";
  let roster_status = "unknown";
  let availability_confidence = "LOW_SOURCE_AMBIGUOUS";
  let reason = "No deterministic availability rule matched.";
  const issues = [];
  let transaction_warning_flag = 0;
  let transaction_block_flag = 0;
  let team_mismatch_flag = 0;
  let source_missing_flag = 0;

  if (!teamMlbId || !context.calendarTeamMatch) {
    availability_status = "team_mismatch";
    roster_status = "unknown";
    availability_confidence = "BLOCKED_TEAM_MISMATCH";
    reason = "Prepared-board team does not map cleanly to the official game calendar team IDs.";
    team_mismatch_flag = 1;
    issues.push({ issue_type: "team_mismatch", issue_severity: "blocker", reason });
  } else if (context.activeSourceFailed) {
    availability_status = "source_missing";
    roster_status = "unknown";
    availability_confidence = "BLOCKED_SOURCE_MISSING";
    reason = "Official active roster source failed for expected team.";
    source_missing_flag = 1;
    issues.push({ issue_type: "active_roster_source_failed", issue_severity: "blocker", reason });
  } else if (peopleTeam && peopleTeam !== teamMlbId && !activeFlag) {
    availability_status = "team_mismatch";
    roster_status = "unknown";
    availability_confidence = "BLOCKED_TEAM_MISMATCH";
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
    availability_status = "active_available";
    roster_status = "active_roster";
    availability_confidence = "HIGH_OFFICIAL_ACTIVE_ROSTER";
    reason = "Player appears on official MLB active roster for expected team.";
    if (latestTx && (latestTxClass.warning || latestTxClass.hard_block)) {
      transaction_warning_flag = 1;
      availability_confidence = latestTxClass.hard_block && sameDayTx ? "WARNING_TRANSACTION_CONFLICT_ACTIVE_ROSTER_WINS" : "WARNING_RECENT_TRANSACTION_ACTIVE";
      issues.push({ issue_type: "recent_transaction_active", issue_severity: "warning", reason: "Recent transaction exists but active roster confirms player on expected team.", details: compactTx(latestTx) });
    }
  } else if (latestTx && latestTxClass.hard_block) {
    availability_status = latestTxClass.kind === "outrighted" ? "optioned" : latestTxClass.kind;
    roster_status = "not_active_roster";
    availability_confidence = "BLOCKED_OFFICIAL_TRANSACTION";
    reason = "Official MLB transaction indicates player is unavailable and active roster does not confirm availability.";
    transaction_block_flag = 1;
    issues.push({ issue_type: "blocking_transaction", issue_severity: "blocker", reason, details: compactTx(latestTx) });
  } else if (fortyFlag) {
    availability_status = "inactive_not_active_roster";
    roster_status = "forty_man_not_active";
    availability_confidence = "BLOCKED_NOT_ACTIVE";
    reason = "Player appears on 40-man roster but not active roster for expected team.";
    issues.push({ issue_type: "not_active_roster", issue_severity: "blocker", reason });
    if (latestTx && latestTxClass.warning) {
      transaction_warning_flag = 1;
      issues.push({ issue_type: "recent_transaction_not_active", issue_severity: "warning", reason: "Recent transaction exists while player is not on active roster.", details: compactTx(latestTx) });
    }
  } else {
    availability_status = "source_missing";
    roster_status = "unknown";
    availability_confidence = "BLOCKED_SOURCE_MISSING";
    reason = "Player is absent from active, injuredList, and 40-man endpoints for expected team.";
    source_missing_flag = 1;
    issues.push({ issue_type: "missing_roster_record", issue_severity: "blocker", reason });
  }

  const evaluation = {
    player_id: playerId,
    team_mlb_id: teamMlbId,
    active_roster_hit: activeFlag,
    injured_list_hit: ilFlag,
    forty_man_hit: fortyFlag,
    people_current_team_id: peopleTeam,
    latest_transaction: compactTx(latestTx),
    transaction_classification: latestTx ? latestTxClass : null,
    endpoints,
    source_snippets: { active: compactRosterRow(active), injured_list: compactRosterRow(il), forty_man: compactRosterRow(forty), people: compactPeople(people) }
  };

  return {
    availability_status, roster_status, availability_confidence, reason,
    flags: {
      active_roster_flag: activeFlag ? 1 : 0,
      injured_list_flag: ilFlag ? 1 : 0,
      forty_man_flag: fortyFlag ? 1 : 0,
      transaction_warning_flag,
      transaction_block_flag,
      team_mismatch_flag,
      source_missing_flag
    },
    latestTx,
    issues,
    evaluation
  };
}
async function writeResults(env, batchId, rows) {
  let current = 0;
  let snapshots = 0;
  let issues = 0;
  for (const item of rows) {
    const r = item.row;
    const c = item.classification;
    await run(env.DAILY_DB, `INSERT INTO daily_player_availability_current_v1 (
      availability_key, batch_id, source_key, source_snapshot_at, official_date, game_pk, game_time_utc,
      player_id, mlb_player_id, player_name, team_abbreviation, team_id, team_mlb_id, opponent_abbreviation, opponent_mlb_id,
      availability_status, roster_status, availability_confidence,
      active_roster_flag, injured_list_flag, forty_man_flag, transaction_warning_flag, transaction_block_flag, team_mismatch_flag, source_missing_flag,
      prepared_board_relevant, prepared_board_pickable_rows, source_endpoints_json, transaction_summary, transaction_date, reason, evaluation_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(official_date, game_pk, mlb_player_id, team_mlb_id) DO UPDATE SET
      availability_key=excluded.availability_key,
      batch_id=excluded.batch_id,
      source_key=excluded.source_key,
      source_snapshot_at=excluded.source_snapshot_at,
      game_time_utc=excluded.game_time_utc,
      player_id=excluded.player_id,
      player_name=excluded.player_name,
      team_abbreviation=excluded.team_abbreviation,
      team_id=excluded.team_id,
      opponent_abbreviation=excluded.opponent_abbreviation,
      opponent_mlb_id=excluded.opponent_mlb_id,
      availability_status=excluded.availability_status,
      roster_status=excluded.roster_status,
      availability_confidence=excluded.availability_confidence,
      active_roster_flag=excluded.active_roster_flag,
      injured_list_flag=excluded.injured_list_flag,
      forty_man_flag=excluded.forty_man_flag,
      transaction_warning_flag=excluded.transaction_warning_flag,
      transaction_block_flag=excluded.transaction_block_flag,
      team_mismatch_flag=excluded.team_mismatch_flag,
      source_missing_flag=excluded.source_missing_flag,
      prepared_board_pickable_rows=excluded.prepared_board_pickable_rows,
      source_endpoints_json=excluded.source_endpoints_json,
      transaction_summary=excluded.transaction_summary,
      transaction_date=excluded.transaction_date,
      reason=excluded.reason,
      evaluation_json=excluded.evaluation_json,
      updated_at=CURRENT_TIMESTAMP`,
      item.availability_key, batchId, SOURCE_KEY, item.source_snapshot_at, r.official_date, r.official_game_pk, r.official_game_time_utc,
      intOrNull(r.resolved_player_id), intOrNull(r.resolved_mlb_player_id), r.player_name || null, normTeam(r.team), item.team_id || null, item.team_mlb_id, normTeam(r.opponent), item.opponent_mlb_id,
      c.availability_status, c.roster_status, c.availability_confidence,
      c.flags.active_roster_flag, c.flags.injured_list_flag, c.flags.forty_man_flag, c.flags.transaction_warning_flag, c.flags.transaction_block_flag, c.flags.team_mismatch_flag, c.flags.source_missing_flag,
      Number(r.prepared_board_pickable_rows || 0), safeJson(item.source_endpoints, 3000), c.latestTx ? `${c.latestTx.typeCode || ""} ${c.latestTx.typeDesc || ""}: ${c.latestTx.description || ""}`.slice(0, 900) : null, c.latestTx ? (c.latestTx.date || c.latestTx.effectiveDate || null) : null, c.reason, safeJson(c.evaluation, 9000)
    );
    current++;
    const snapshotId = rid("dpav1_snapshot");
    await run(env.DAILY_DB, `INSERT INTO daily_player_availability_snapshots_v1 (snapshot_id, batch_id, availability_key, official_date, game_pk, mlb_player_id, team_mlb_id, availability_status, roster_status, availability_confidence, source_key, source_snapshot_at, source_payload_snippets) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshotId, batchId, item.availability_key, r.official_date, r.official_game_pk, intOrNull(r.resolved_mlb_player_id), item.team_mlb_id, c.availability_status, c.roster_status, c.availability_confidence, SOURCE_KEY, item.source_snapshot_at, safeJson(c.evaluation.source_snippets, 7000)
    );
    snapshots++;
    for (const issue of c.issues) {
      await run(env.DAILY_DB, `INSERT INTO daily_player_availability_issues_v1 (issue_id, batch_id, official_date, game_pk, mlb_player_id, team_mlb_id, issue_type, issue_severity, reason, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rid("dpav1_issue"), batchId, r.official_date, r.official_game_pk, intOrNull(r.resolved_mlb_player_id), item.team_mlb_id, issue.issue_type, issue.issue_severity, issue.reason || c.reason, safeJson(issue.details || c.evaluation, 5000)
      );
      issues++;
    }
  }
  return { rows_written: current, snapshot_rows_written: snapshots, issues_written: issues };
}
async function runAvailability(env, input) {
  const startedAt = nowUtc();
  const batchId = rid("daily_player_availability_batch");
  const requestId = input.request_id || batchId;
  const runId = input.run_id || null;
  await ensureSchema(env);
  await run(env.DAILY_DB, `INSERT INTO daily_player_availability_batches_v1 (batch_id, request_id, run_id, job_key, worker_name, worker_version, mode, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)`, batchId, requestId, runId, input.job_key || JOB_KEY, WORKER_NAME, VERSION, input.mode || "daily_player_availability_refresh_window", startedAt);

  const prepared = await getPreparedPlayers(env);
  const gamePks = [...new Set(prepared.map((r) => intOrNull(r.official_game_pk)).filter((v) => v !== null))];
  const teamAbbrs = [...new Set(prepared.flatMap((r) => [normTeam(r.team), normTeam(r.opponent)]).filter(Boolean))];
  const playerIds = [...new Set(prepared.map((r) => intOrNull(r.resolved_mlb_player_id)).filter((v) => v !== null))];
  const calendars = await getCalendar(env, gamePks);
  const calendarByGame = new Map(calendars.map((r) => [intOrNull(r.game_pk), r]));
  const teamRows = await getTeams(env, teamAbbrs);
  const teamByAbbr = new Map(teamRows.map((r) => [normTeam(r.abbreviation), r]));
  const staticPlayers = await getStaticPlayers(env, playerIds);
  const staticByMlbId = new Map(staticPlayers.map((r) => [intOrNull(r.mlb_player_id), r]));
  const officialDates = prepared.map((r) => r.official_date).filter(Boolean).sort();
  const windowStart = addDays(officialDates[0] || todayPt(), -7);
  const windowEnd = officialDates[officialDates.length - 1] || todayPt();
  const teamIds = [...new Set(teamRows.map((r) => intOrNull(r.mlb_team_id)).filter((v) => v !== null))];
  const sources = await fetchSources(env, teamIds, playerIds, windowStart, windowEnd);
  const sourceSnapshotAt = nowUtc();

  const results = [];
  const activeTeamFailures = new Set(sources.sourceFailures.filter((f) => f.hard).map((f) => intOrNull(f.teamId)).filter((v) => v !== null));
  for (const row of prepared) {
    const team = teamByAbbr.get(normTeam(row.team));
    const opp = teamByAbbr.get(normTeam(row.opponent));
    const teamMlbId = team ? intOrNull(team.mlb_team_id) : null;
    const calendar = calendarByGame.get(intOrNull(row.official_game_pk));
    const calendarTeamMatch = !!(calendar && teamMlbId && (intOrNull(calendar.home_team_id) === teamMlbId || intOrNull(calendar.away_team_id) === teamMlbId));
    const context = {
      teamMlbId,
      calendarTeamMatch,
      activeSourceFailed: teamMlbId ? activeTeamFailures.has(teamMlbId) : true,
      activeMap: teamMlbId ? sources.activeByTeam.get(teamMlbId) : null,
      fortyMap: teamMlbId ? sources.fortyByTeam.get(teamMlbId) : null,
      ilMap: teamMlbId ? sources.ilByTeam.get(teamMlbId) : null,
      txMap: teamMlbId ? sources.txByTeam.get(teamMlbId) : null,
      peopleMap: sources.people,
      staticPlayer: staticByMlbId.get(intOrNull(row.resolved_mlb_player_id)) || null
    };
    const classification = classify(row, context);
    const key = `dpav1_${row.official_date}_${row.official_game_pk}_${row.resolved_mlb_player_id}_${teamMlbId || "unknown"}`;
    results.push({
      row,
      classification,
      availability_key: key,
      source_snapshot_at: sourceSnapshotAt,
      team_id: team ? team.team_id : null,
      team_mlb_id: teamMlbId,
      opponent_mlb_id: opp ? intOrNull(opp.mlb_team_id) : null,
      source_endpoints: sources.endpointLog.filter((e) => !e.teamId || e.teamId === teamMlbId)
    });
  }
  const written = await writeResults(env, batchId, results);
  const blockerCount = results.reduce((n, r) => n + r.classification.issues.filter((i) => i.issue_severity === "blocker").length, 0);
  const warningCount = results.reduce((n, r) => n + r.classification.issues.filter((i) => i.issue_severity === "warning").length, 0);
  const hardSourceFailures = sources.sourceFailures.filter((f) => f.hard).length;
  const sourceFailures = sources.sourceFailures.length;
  const counts = {
    prepared_games_checked: gamePks.length,
    prepared_rows_read: prepared.reduce((n, r) => n + Number(r.prepared_board_pickable_rows || 0), 0),
    prepared_players_checked: results.length,
    teams_checked: teamIds.length,
    active_roster_players_found: results.filter((r) => r.classification.flags.active_roster_flag).length,
    injured_list_players_found: results.filter((r) => r.classification.flags.injured_list_flag).length,
    forty_man_players_found: results.filter((r) => r.classification.flags.forty_man_flag).length,
    unavailable_players_found: results.filter((r) => !["active_available"].includes(r.classification.availability_status)).length,
    unknown_players_found: results.filter((r) => r.classification.availability_status === "unknown" || r.classification.availability_status === "source_missing").length,
    rows_written: written.rows_written,
    snapshot_rows_written: written.snapshot_rows_written,
    issues_written: written.issues_written,
    source_failures: sourceFailures,
    hard_source_failures: hardSourceFailures,
    blocker_count: blockerCount,
    warning_count: warningCount,
    external_calls: sources.externalCalls
  };
  const coverageOk = results.length > 0 && written.rows_written === results.length && written.snapshot_rows_written === results.length;
  const dataOk = coverageOk && hardSourceFailures === 0;
  const certification = dataOk ? (blockerCount ? "DAILY_PLAYER_AVAILABILITY_CERTIFIED_WITH_PLAYER_BLOCKERS" : "DAILY_PLAYER_AVAILABILITY_CERTIFIED_READY") : "DAILY_PLAYER_AVAILABILITY_FAILED_SOURCE_OR_COVERAGE";
  const grade = dataOk ? (blockerCount || warningCount ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL";
  const status = dataOk ? "completed" : "failed_source_or_coverage";
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
    certification_reason: dataOk ? "Every prepared-board relevant player received a v1 current and snapshot row; source blockers/warnings are recorded as sidecar issues." : "One or more hard active-roster source failures or coverage gaps occurred.",
    ...counts,
    window_start: windowStart,
    window_end: windowEnd,
    source_failures_detail: sources.sourceFailures.slice(0, 25),
    no_score_db_mutation: true,
    no_calendar_rebuild: true,
    no_lineups: true,
    no_starters_duplication: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    sidecar_tables: ["daily_player_availability_current_v1", "daily_player_availability_snapshots_v1", "daily_player_availability_batches_v1", "daily_player_availability_issues_v1"],
    legacy_stub_untouched: "daily_player_availability",
    timestamp_utc: nowUtc()
  };
  await run(env.DAILY_DB, `UPDATE daily_player_availability_batches_v1 SET status=?, window_start=?, window_end=?, prepared_games_checked=?, prepared_rows_read=?, prepared_players_checked=?, teams_checked=?, active_roster_players_found=?, injured_list_players_found=?, forty_man_players_found=?, unavailable_players_found=?, unknown_players_found=?, rows_written=?, snapshot_rows_written=?, source_failures=?, hard_source_failures=?, blocker_count=?, warning_count=?, external_calls=?, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, windowStart, windowEnd, counts.prepared_games_checked, counts.prepared_rows_read, counts.prepared_players_checked, counts.teams_checked, counts.active_roster_players_found, counts.injured_list_players_found, counts.forty_man_players_found, counts.unavailable_players_found, counts.unknown_players_found, counts.rows_written, counts.snapshot_rows_written, counts.source_failures, counts.hard_source_failures, counts.blocker_count, counts.warning_count, counts.external_calls, certification, grade, output.certification_reason, safeJson(output, 12000), nowUtc(), batchId
  );
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
        return jsonResponse(await runAvailability(env, input));
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "exception", certification: "DAILY_PLAYER_AVAILABILITY_EXCEPTION", error: String(err && err.stack ? err.stack : err), timestamp_utc: nowUtc(), no_score_db_mutation: true }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
