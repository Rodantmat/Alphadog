const WORKER_NAME = "alphadog-v2-daily-certifier";
const VERSION = "alphadog-v2-daily-certifier-v0.1.3-started-not-applicable-fix";
const JOB_KEY = "daily-certifier";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "TEAM_DB", "DAILY_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE"];

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
async function batchRun(db, statements, chunkSize = 80) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    if (chunk.length) await db.batch(chunk);
  }
}
function safeJson(value, max = 10000) {
  if (value === undefined || value === null) return null;
  let text;
  try { text = typeof value === "string" ? value : JSON.stringify(value); } catch (_) { text = String(value); }
  return text.length > max ? text.slice(0, max) + "...TRUNCATED" : text;
}
function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
function ptDate(offsetDays = 0) {
  const base = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const m = {}; parts.forEach(p => { m[p.type] = p.value; });
  const d = new Date(`${m.year}-${m.month}-${m.day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
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
    status: "READY_DAILY_CONTEXT_READINESS_ENRICHMENT_CERTIFIER",
    timestamp_utc: nowUtc(),
    phase: "daily-context-readiness-enrichment-certifier",
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) },
    guardrails: {
      readiness_enrichment_only: true,
      not_strict_all_context_enforcement: true,
      no_external_calls: true,
      no_sidecar_repair: true,
      no_board_mutation: true,
      no_score_db_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      volatile_current_issue_retention_today_tomorrow_only: true,
      batches_retained_for_small_audit_metadata: true
    }
  };
}
function mapBy(rows, keyFn) { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }
function one(map, key) { const v = map.get(String(key)); return v && v.length ? v[0] : null; }
function normalizeProp(prop) { return String(prop || "").toLowerCase(); }
function isPitcherProp(prop) { const p = normalizeProp(prop); return p.includes("pitcher") || p.includes("strikeouts") || p.includes("outs") || p.includes("earned_runs") || p.includes("hits_allowed") || p.includes("walks_allowed") || p.includes("runs_allowed"); }
function isHitterProp(prop) { return !isPitcherProp(prop); }
function layerStatus(value, fallback = "missing") { return value ? String(value) : fallback; }
function isUnavailableAvailability(a) {
  if (!a) return false;
  const s = String(a.availability_status || a.roster_status || "").toLowerCase();
  return a.transaction_block_flag === 1 || a.injured_list_flag === 1 || s.includes("optioned") || s.includes("inactive") || s.includes("injured") || s.includes("blocked") || s.includes("unavailable") || s.includes("not_active");
}
function addIssueAggregate(issueMap, batchId, p, teamId, issue, cls, sev) {
  const key = [p.official_date, p.official_game_pk, teamId || "", p.resolved_mlb_player_id || "", issue.layer || "unknown", cls, sev, issue.type || "unknown"].join("|");
  let row = issueMap.get(key);
  if (!row) {
    row = {
      issue_id: rid("ctx_issue"), batch_id: batchId, official_date: p.official_date, game_pk: p.official_game_pk,
      prepared_row_id: null, player_id: p.resolved_mlb_player_id || null, team_id: teamId || null,
      layer_key: issue.layer || "unknown", issue_class: cls, severity: sev, issue_type: issue.type || "unknown",
      reason: issue.reason || "", count: 0, samples: []
    };
    issueMap.set(key, row);
  }
  row.count += 1;
  if (row.samples.length < 8 && p.prepared_row_id) row.samples.push(p.prepared_row_id);
}

async function ensureSchema(env) {
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_context_readiness_batches (
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
    prepared_rows_read INTEGER DEFAULT 0,
    prepared_games_checked INTEGER DEFAULT 0,
    current_rows_written INTEGER DEFAULT 0,
    issue_rows_written INTEGER DEFAULT 0,
    hard_blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    enrichment_gap_count INTEGER DEFAULT 0,
    ready_full_context_count INTEGER DEFAULT 0,
    ready_with_warnings_count INTEGER DEFAULT 0,
    ready_partial_enrichment_count INTEGER DEFAULT 0,
    waiting_late_context_count INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,
    not_applicable_count INTEGER DEFAULT 0,
    retention_violations INTEGER DEFAULT 0,
    schema_failures INTEGER DEFAULT 0,
    certification_status TEXT,
    certification_grade TEXT,
    certification_reason TEXT,
    output_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_context_readiness_current (
    readiness_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    game_time_utc TEXT,
    prepared_row_id TEXT,
    source_key TEXT,
    source_row_id TEXT,
    projection_id TEXT,
    player_id INTEGER,
    player_name TEXT,
    team_id INTEGER,
    opponent_team_id INTEGER,
    canonical_prop_key TEXT,
    prepared_board_relevant INTEGER DEFAULT 1,
    pickable_safe INTEGER DEFAULT 0,
    context_status TEXT,
    context_grade TEXT,
    hard_blocker_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    enrichment_gap_count INTEGER DEFAULT 0,
    available_context_count INTEGER DEFAULT 0,
    expected_context_count INTEGER DEFAULT 7,
    starter_context_status TEXT,
    lineup_context_status TEXT,
    player_availability_status TEXT,
    weather_context_status TEXT,
    bullpen_context_status TEXT,
    schedule_spot_context_status TEXT,
    umpire_context_status TEXT,
    hard_block_reasons_json TEXT,
    warning_reasons_json TEXT,
    enrichment_gaps_json TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_context_readiness_issues (
    issue_id TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    game_pk INTEGER,
    prepared_row_id TEXT,
    player_id INTEGER,
    team_id INTEGER,
    layer_key TEXT,
    issue_class TEXT,
    severity TEXT,
    issue_type TEXT,
    reason TEXT,
    details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, "CREATE INDEX IF NOT EXISTS idx_daily_context_readiness_current_game ON daily_context_readiness_current(official_date, game_pk)");
  await run(env.DAILY_DB, "CREATE INDEX IF NOT EXISTS idx_daily_context_readiness_current_status ON daily_context_readiness_current(context_status, context_grade)");
  await run(env.DAILY_DB, "CREATE INDEX IF NOT EXISTS idx_daily_context_readiness_current_player ON daily_context_readiness_current(player_id, game_pk)");
  await run(env.DAILY_DB, "CREATE INDEX IF NOT EXISTS idx_daily_context_readiness_issues_batch ON daily_context_readiness_issues(batch_id)");
  await run(env.DAILY_DB, "CREATE INDEX IF NOT EXISTS idx_daily_context_readiness_issues_date ON daily_context_readiness_issues(official_date)");
}

async function readPreparedRows(env) {
  return await all(env.SCORE_DB, `SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, projection_id, player_name, resolved_mlb_player_id, player_match_status, team, opponent, team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date, matchup_status, pickable_safe, prep_status, block_reason
    FROM score_board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
    ORDER BY official_game_time_utc, prepared_row_id`);
}
async function readLatestBatchMap(env) {
  const specs = [
    ["starters", "daily_starters_batches"], ["lineups", "daily_lineups_batches"], ["player_availability", "daily_player_availability_batches_v1"], ["weather", "daily_game_weather_batches"], ["bullpen", "daily_bullpen_availability_batches"], ["schedule_spot", "daily_team_schedule_spot_batches"], ["umpire", "daily_umpire_context_batches"]
  ];
  const out = {};
  for (const [key, table] of specs) {
    try { out[key] = await first(env.DAILY_DB, `SELECT * FROM ${table} ORDER BY datetime(COALESCE(updated_at, completed_at, created_at)) DESC LIMIT 1`); }
    catch (e) { out[key] = { error: String(e && e.message ? e.message : e) }; }
  }
  return out;
}

async function runCertifier(env, input) {
  const startedAt = nowUtc();
  const batchId = rid("daily_context_readiness_batch");
  const today = ptDate(0);
  const tomorrow = ptDate(1);
  await ensureSchema(env);

  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_context_readiness_batches (batch_id,request_id,run_id,worker_name,worker_version,job_key,mode,status,window_start,window_end,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, batchId, input.request_id || null, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_context_readiness_refresh_window", "running", today, tomorrow, startedAt);

  await run(env.DAILY_DB, "DELETE FROM daily_context_readiness_current WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.DAILY_DB, "DELETE FROM daily_context_readiness_issues WHERE official_date NOT IN (?, ?)", today, tomorrow);
  await run(env.DAILY_DB, "DELETE FROM daily_context_readiness_current WHERE official_date IN (?, ?)", today, tomorrow);
  await run(env.DAILY_DB, "DELETE FROM daily_context_readiness_issues WHERE official_date IN (?, ?)", today, tomorrow);

  const prepared = await readPreparedRows(env);
  const gamePks = [...new Set(prepared.map(r => r.official_game_pk).filter(v => v !== null && v !== undefined))];
  const games = gamePks.length ? await all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, is_pregame, is_live, is_final, is_postponed, is_cancelled, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, detailed_state FROM mlb_game_calendar WHERE game_pk IN (${gamePks.map(() => "?").join(",")})`, ...gamePks) : [];
  const gameMap = new Map(games.map(g => [String(g.game_pk), g]));

  const starters = await all(env.DAILY_DB, "SELECT * FROM daily_starters_current WHERE official_date IN (?, ?)", today, tomorrow);
  const lineups = await all(env.DAILY_DB, "SELECT * FROM daily_lineups_current WHERE official_date IN (?, ?)", today, tomorrow);
  const availability = await all(env.DAILY_DB, "SELECT * FROM daily_player_availability_current_v1 WHERE official_date IN (?, ?)", today, tomorrow);
  const weather = await all(env.DAILY_DB, "SELECT * FROM daily_game_weather_current WHERE official_date IN (?, ?)", today, tomorrow);
  const bullpen = await all(env.DAILY_DB, "SELECT * FROM daily_bullpen_availability_current WHERE official_date IN (?, ?)", today, tomorrow);
  const schedule = await all(env.DAILY_DB, "SELECT * FROM daily_team_schedule_spot_current WHERE official_date IN (?, ?)", today, tomorrow);
  const umpire = await all(env.DAILY_DB, "SELECT * FROM daily_umpire_context_current WHERE official_date IN (?, ?)", today, tomorrow);
  const batches = await readLatestBatchMap(env);

  const starterByGame = mapBy(starters, r => String(r.game_pk));
  const lineupByPlayerGame = mapBy(lineups, r => `${r.game_pk}:${r.player_id}`);
  const availByPlayerGame = mapBy(availability, r => `${r.game_pk}:${r.mlb_player_id || r.player_id}`);
  const weatherByGame = new Map(weather.map(r => [String(r.game_pk), r]));
  const bullpenByGameTeam = new Map(bullpen.map(r => [`${r.game_pk}:${r.team_id}`, r]));
  const scheduleByGameTeam = new Map(schedule.map(r => [`${r.game_pk}:${r.team_id}`, r]));
  const umpireByGame = new Map(umpire.map(r => [String(r.game_pk), r]));

  const counts = { hard: 0, warning: 0, gap: 0, rows: 0, issues: 0, ready_full: 0, ready_warnings: 0, ready_partial: 0, waiting: 0, blocked: 0, not_applicable: 0 };
  const currentStatements = [];
  const issueMap = new Map();
  const insertCurrentSql = `INSERT OR REPLACE INTO daily_context_readiness_current (readiness_key,batch_id,official_date,game_pk,game_time_utc,prepared_row_id,source_key,source_row_id,projection_id,player_id,player_name,team_id,opponent_team_id,canonical_prop_key,prepared_board_relevant,pickable_safe,context_status,context_grade,hard_blocker_count,warning_count,enrichment_gap_count,available_context_count,expected_context_count,starter_context_status,lineup_context_status,player_availability_status,weather_context_status,bullpen_context_status,schedule_spot_context_status,umpire_context_status,hard_block_reasons_json,warning_reasons_json,enrichment_gaps_json,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;

  for (const p of prepared) {
    const game = gameMap.get(String(p.official_game_pk));
    const playerId = p.resolved_mlb_player_id;
    const av = one(availByPlayerGame, `${p.official_game_pk}:${playerId}`);
    const teamId = av ? (av.team_mlb_id || Number(av.team_id) || null) : null;
    const opponentTeamId = av ? av.opponent_mlb_id : null;
    const lineup = one(lineupByPlayerGame, `${p.official_game_pk}:${playerId}`);
    const stRows = starterByGame.get(String(p.official_game_pk)) || [];
    const w = weatherByGame.get(String(p.official_game_pk));
    const bp = teamId ? bullpenByGameTeam.get(`${p.official_game_pk}:${teamId}`) : null;
    const ss = teamId ? scheduleByGameTeam.get(`${p.official_game_pk}:${teamId}`) : null;
    const u = umpireByGame.get(String(p.official_game_pk));
    const hard = [], warnings = [], gaps = [];
    let availableContext = 0;

    if (!game) hard.push({ layer: "calendar", type: "missing_calendar_anchor", reason: "Prepared row game_pk not found in mlb_game_calendar" });
    if (!p.official_game_pk) hard.push({ layer: "prepared_board", type: "missing_game_pk", reason: "Prepared row lacks official_game_pk" });
    if (!p.official_game_time_utc) hard.push({ layer: "prepared_board", type: "missing_game_time", reason: "Prepared row lacks official_game_time_utc" });
    if (!playerId) hard.push({ layer: "prepared_board", type: "missing_player_id", reason: "Prepared row lacks resolved_mlb_player_id" });
    const gameStartedOrExpired = Boolean(game && (Number(game.is_live) === 1 || Number(game.is_final) === 1 || Number(game.is_cancelled) === 1 || Number(game.is_postponed) === 1));
    const notApplicableReasons = [];
    if (gameStartedOrExpired) notApplicableReasons.push({ layer: "calendar", type: "started_or_expired", reason: "Calendar says game is live/final/postponed/cancelled; daily context is not applicable for pickability after start" });

    const starterStatus = stRows.length ? "available" : "missing";
    if (stRows.length) availableContext++; else gaps.push({ layer: "starters", type: "missing_starter_context", reason: "No starter rows found for game in today/tomorrow current table" });
    for (const sr of stRows) {
      if (sr.tbd_flag === 1 || String(sr.starter_status || "").toLowerCase().includes("tbd")) warnings.push({ layer: "starters", type: "starter_tbd", reason: "Starter is TBD/probable context incomplete" });
      if (sr.hand_missing_flag === 1) warnings.push({ layer: "starters", type: "starter_hand_missing", reason: "Starter hand is missing but starter identity exists" });
    }

    let lineupStatus = "not_applicable";
    if (isHitterProp(p.canonical_prop_key)) {
      if (lineup) { lineupStatus = layerStatus(lineup.lineup_status, "posted_lineup"); availableContext++; }
      else { lineupStatus = "not_posted_or_player_not_in_lineup"; gaps.push({ layer: "lineups", type: "lineup_not_posted_or_player_not_found", reason: "Lineup context missing for hitter/player row" }); }
    }

    let availabilityStatus = "missing";
    if (av) {
      availabilityStatus = layerStatus(av.availability_status, "available");
      availableContext++;
      if (isUnavailableAvailability(av)) hard.push({ layer: "player_availability", type: "player_unavailable", reason: av.reason || av.transaction_summary || "Player availability current marks player unavailable/blocked" });
      else if (av.transaction_warning_flag === 1) warnings.push({ layer: "player_availability", type: "recent_transaction_warning", reason: av.transaction_summary || "Recent transaction warning but player not hard-blocked" });
    } else hard.push({ layer: "player_availability", type: "missing_player_availability", reason: "No current availability row for prepared player/game" });

    let weatherStatus = "missing";
    if (w) {
      weatherStatus = layerStatus(w.weather_status, "available"); availableContext++;
      if (w.rain_risk_flag === 1) warnings.push({ layer: "weather", type: "rain_risk", reason: "Rain risk flag present" });
      if (w.delay_risk_flag === 1) warnings.push({ layer: "weather", type: "delay_risk", reason: "Delay risk flag present" });
      if (w.retractable_roof_flag === 1 && String(w.roof_status || "").toLowerCase().includes("unknown")) warnings.push({ layer: "weather", type: "roof_unknown", reason: "Retractable roof status unknown" });
    } else gaps.push({ layer: "weather", type: "missing_weather_context", reason: "No weather/roof current row for game" });

    let bullpenStatus = "missing";
    if (bp) { bullpenStatus = layerStatus(bp.bullpen_status, "available"); availableContext++; if (String(bp.bullpen_risk_level || "").toLowerCase().includes("high") || Number(bp.bullpen_fatigue_score || 0) >= 4) warnings.push({ layer: "bullpen", type: "bullpen_risk", reason: `Bullpen risk ${bp.bullpen_risk_level || "unknown"}` }); }
    else gaps.push({ layer: "bullpen", type: "missing_team_bullpen_context", reason: teamId ? "No bullpen team context for prepared row team" : "Could not resolve row team for bullpen context" });

    let scheduleStatus = "missing";
    if (ss) {
      scheduleStatus = layerStatus(ss.schedule_spot_status, "available"); availableContext++;
      if (ss.played_yesterday_flag === 1) warnings.push({ layer: "schedule_spot", type: "played_yesterday", reason: "Team played yesterday" });
      if (ss.three_in_four_flag === 1) warnings.push({ layer: "schedule_spot", type: "three_in_four", reason: "Team is in three-in-four schedule spot" });
      if (ss.four_in_six_flag === 1) warnings.push({ layer: "schedule_spot", type: "four_in_six", reason: "Team is in four-in-six schedule spot" });
      if (ss.travel_required_flag === 1) warnings.push({ layer: "schedule_spot", type: "travel_required", reason: "Team travel required" });
    } else gaps.push({ layer: "schedule_spot", type: "missing_team_schedule_context", reason: teamId ? "No team schedule spot context for prepared row team" : "Could not resolve row team for schedule context" });

    let umpireStatus = "missing";
    if (u) { umpireStatus = layerStatus(u.umpire_context_status, "available"); availableContext++; if (u.assignment_pending_flag === 1 || u.assignment_missing_flag === 1 || u.unknown_umpire_flag === 1) warnings.push({ layer: "umpire", type: "umpire_pending_or_missing", reason: "Umpire assignment pending/missing/unknown" }); if (u.source_failure_flag === 1) warnings.push({ layer: "umpire", type: "umpire_source_failure_warning", reason: "Umpire source failure warning" }); }
    else gaps.push({ layer: "umpire", type: "missing_umpire_context", reason: "No umpire current row for game" });

    let contextStatus = "ready";
    let contextGrade = "READY_FULL_CONTEXT";
    if (gameStartedOrExpired) { contextStatus = "not_applicable"; contextGrade = "NOT_APPLICABLE_STARTED_OR_EXPIRED"; counts.not_applicable++; }
    else if (hard.length) { contextStatus = "blocked"; contextGrade = isUnavailableAvailability(av) ? "BLOCKED_PLAYER_UNAVAILABLE" : "BLOCKED_HARD_INTEGRITY"; counts.blocked++; }
    else if (gaps.length) { contextStatus = "partial_enrichment"; contextGrade = "READY_PARTIAL_ENRICHMENT"; counts.ready_partial++; }
    else if (warnings.length) { contextStatus = "ready_with_warnings"; contextGrade = "READY_WITH_WARNINGS"; counts.ready_warnings++; }
    else { counts.ready_full++; }

    const effectiveHard = gameStartedOrExpired ? [] : hard;
    counts.hard += effectiveHard.length; counts.warning += warnings.length; counts.gap += gaps.length; counts.rows++;
    for (const h of effectiveHard) addIssueAggregate(issueMap, batchId, p, teamId, h, "hard_blocker", "hard_blocker");
    for (const n of notApplicableReasons) addIssueAggregate(issueMap, batchId, p, teamId, n, "not_applicable", "not_applicable");
    for (const wng of warnings) addIssueAggregate(issueMap, batchId, p, teamId, wng, "warning", "warning");
    for (const gap of gaps) addIssueAggregate(issueMap, batchId, p, teamId, gap, "enrichment_gap", "gap");

    const readinessKey = `ctx_${p.prepared_row_id}`;
    currentStatements.push(env.DAILY_DB.prepare(insertCurrentSql).bind(readinessKey, batchId, p.official_date, p.official_game_pk, p.official_game_time_utc, p.prepared_row_id, p.source_key, p.source_row_id, p.projection_id, playerId, p.player_name, teamId, opponentTeamId, p.canonical_prop_key, 1, p.pickable_safe, contextStatus, contextGrade, effectiveHard.length, warnings.length, gaps.length, availableContext, 7, starterStatus, lineupStatus, availabilityStatus, weatherStatus, bullpenStatus, scheduleStatus, umpireStatus, safeJson(effectiveHard), safeJson(warnings), safeJson(gaps), safeJson({ team_abbreviation: p.team, opponent: p.opponent, game_calendar: game ? { home_team_id: game.home_team_id, away_team_id: game.away_team_id, detailed_state: game.detailed_state } : null, sidecar_batch_ids: { starters: stRows[0]?.batch_id || null, lineups: lineup?.batch_id || null, player_availability: av?.batch_id || null, weather: w?.batch_id || null, bullpen: bp?.batch_id || null, schedule_spot: ss?.batch_id || null, umpire: u?.batch_id || null } })));
  }

  await batchRun(env.DAILY_DB, currentStatements, 80);
  const issueStatements = [];
  const insertIssueSql = `INSERT OR REPLACE INTO daily_context_readiness_issues (issue_id,batch_id,official_date,game_pk,prepared_row_id,player_id,team_id,layer_key,issue_class,severity,issue_type,reason,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  for (const row of issueMap.values()) {
    counts.issues++;
    issueStatements.push(env.DAILY_DB.prepare(insertIssueSql).bind(row.issue_id, row.batch_id, row.official_date, row.game_pk, row.prepared_row_id, row.player_id, row.team_id, row.layer_key, row.issue_class, row.severity, row.issue_type, row.reason, safeJson({ occurrence_count: row.count, sample_prepared_row_ids: row.samples, aggregate_issue: true })));
  }
  await batchRun(env.DAILY_DB, issueStatements, 80);

  const output = { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: input.run_id || null, batch_id: batchId, status: "completed", certification: "DAILY_CONTEXT_READINESS_CERTIFIED_ENRICHMENT_LEDGER_WRITTEN", certification_grade: counts.hard ? "PASS_WITH_HARD_BLOCKERS" : (counts.not_applicable ? "PASS_WITH_NOT_APPLICABLE" : (counts.warning || counts.gap ? "PASS_WITH_WARNINGS" : "PASS")), window_start: today, window_end: tomorrow, prepared_rows_read: prepared.length, prepared_games_checked: gamePks.length, current_rows_written: counts.rows, issue_rows_written: counts.issues, hard_blocker_count: counts.hard, warning_count: counts.warning, enrichment_gap_count: counts.gap, ready_full_context_count: counts.ready_full, ready_with_warnings_count: counts.ready_warnings, ready_partial_enrichment_count: counts.ready_partial, waiting_late_context_count: counts.waiting, blocked_count: counts.blocked, not_applicable_count: counts.not_applicable, external_calls: 0, external_calls_performed: 0, rows_read: prepared.length, rows_written: counts.rows, sidecar_latest_batches: batches, retention_policy: "current_and_issues_rebuilt_for_today_tomorrow_only_batches_retained_for_audit", issue_write_policy: "aggregated_by_game_player_team_layer_type_to_avoid_timeout", guardrails: baseIdentity(env).guardrails, completed_at: nowUtc() };

  await run(env.DAILY_DB, `UPDATE daily_context_readiness_batches SET status='completed', prepared_rows_read=?, prepared_games_checked=?, current_rows_written=?, issue_rows_written=?, hard_blocker_count=?, warning_count=?, enrichment_gap_count=?, ready_full_context_count=?, ready_with_warnings_count=?, ready_partial_enrichment_count=?, waiting_late_context_count=?, blocked_count=?, not_applicable_count=?, retention_violations=0, schema_failures=0, certification_status=?, certification_grade=?, certification_reason=?, output_json=?, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, prepared.length, gamePks.length, counts.rows, counts.issues, counts.hard, counts.warning, counts.gap, counts.ready_full, counts.ready_warnings, counts.ready_partial, counts.waiting, counts.blocked, counts.not_applicable, output.certification, output.certification_grade, "Daily context readiness/enrichment ledger written; started/expired games are not_applicable, missing late context is warning/gap unless true integrity or availability blocker", safeJson(output), output.completed_at, batchId);
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
    if (method === "POST" && path === "/diagnostic") return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", writes_performed: 0, external_calls_performed: 0 });
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runCertifier(env, input)); }
      catch (e) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "failed", certification: "DAILY_CONTEXT_READINESS_FAILED", error: String(e && e.message ? e.message : e), stack_preview: String(e && e.stack ? e.stack : "").slice(0, 900), external_calls: 0, external_calls_performed: 0 }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
