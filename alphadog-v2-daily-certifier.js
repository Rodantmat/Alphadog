const WORKER_NAME = "alphadog-v2-daily-certifier";
const VERSION = "alphadog-v2-daily-certifier-v0.1.4-time-bound-not-applicable";
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
function isPitcherProp(prop) { const p = normalizeProp(prop); return p.includes("pitcher") || p.includes("earned_runs") || p.includes("hits_allowed") || p.includes("walks_allowed") || p.includes("runs_allowed"); }
function isHitterProp(prop) { return !isPitcherProp(prop); }
function layerStatus(value, fallback = "missing") { return value ? String(value) : fallback; }
function isUnavailableAvailability(a) {
  if (!a) return false;
  const s = String(a.availability_status || a.roster_status || "").toLowerCase();
  return a.transaction_block_flag === 1 || a.injured_list_flag === 1 || s.includes("optioned") || s.includes("inactive") || s.includes("injured") || s.includes("blocked") || s.includes("unavailable") || s.includes("not_active");
}
function isGameStartedExpiredOrUnavailable(game, preparedGameTimeUtc) {
  if (!game) return false;
  // Requirement 8 means a game whose window has passed - i.e. it's actually over
  // (final/postponed/cancelled). A live, in-progress game is the opposite of expired -
  // it's exactly when daily context data matters most. The prior version also purged any
  // game that was live and past its start time, which is true of every live game by
  // definition (a game can't be live before it starts) - this wiped real, needed data for
  // every in-progress game the moment it went live. Fixed: only genuinely-finished games
  // are purged now.
  if (Number(game.is_cancelled) === 1 || Number(game.is_postponed) === 1 || Number(game.is_final) === 1) return true;
  return false;
}
// Purely informational (used only in a diagnostic details_json field below, never in any
// purge/expiry decision) - whether a game's scheduled start time has passed.
function gameHasReachedStart(game, preparedGameTimeUtc) {
  const rawTime = preparedGameTimeUtc || (game && game.game_time_utc) || null;
  const startMs = rawTime ? new Date(rawTime).getTime() : NaN;
  if (!Number.isFinite(startMs)) return false;
  return Date.now() >= (startMs - 15 * 60 * 1000);
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

// Requirement 4: a slate can be entirely today, split across today+tomorrow, or entirely
// tomorrow (e.g. an off-day today, or very late games effectively belonging to tomorrow's
// context-mining window). Classified from the real, calendar-verified prepared-board games,
// not a naive date lookup.
function determineSlateShape(todayGameCount, tomorrowGameCount) {
  if (todayGameCount > 0 && tomorrowGameCount > 0) return "split_today_tomorrow";
  if (todayGameCount > 0 && tomorrowGameCount === 0) return "same_day_only";
  if (todayGameCount === 0 && tomorrowGameCount > 0) return "next_day_only";
  return "no_games";
}

// Requirement 3: per-layer tally of real/derived/temporary/missing coverage against the
// expected unit count for that layer on that date. "Expected units" differs by layer scope:
// game-scoped layers (weather, umpire) expect one row per distinct game_pk; team-scoped
// layers (bullpen, schedule spot) expect one row per distinct team appearance (2 per game);
// player-scoped layers (starters, lineups, availability) expect one row per relevant player
// or per starter slot. This function is intentionally generic over any row array + expected
// key set, since each layer's own key shape differs.
function computeLayerTally(rows, expectedKeys, keyFn) {
  const rowByKey = new Map();
  for (const r of rows) rowByKey.set(keyFn(r), r);
  let real = 0, derived = 0, temporary = 0, unclassified = 0, missing = 0;
  for (const k of expectedKeys) {
    const r = rowByKey.get(k);
    if (!r) { missing++; continue; }
    const level = String(r.data_source_level || "unknown").toLowerCase();
    if (Number(r.is_temporary_derived) === 1) temporary++;
    if (level === "real") real++;
    else if (level === "derived") derived++;
    else unclassified++;
  }
  return {
    expected_units: expectedKeys.length, real_units: real, derived_units: derived,
    temporary_units: temporary, unclassified_units: unclassified, missing_units: missing,
    complete_flag: (missing === 0 && unclassified === 0) ? 1 : 0
  };
}

async function writeTally(env, batchId, officialDate, slateShape, layerKey, tally) {
  const tallyKey = `${officialDate}|${layerKey}`;
  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_context_tally_current (tally_key,batch_id,official_date,slate_shape,layer_key,expected_units,real_units,derived_units,temporary_units,unclassified_units,missing_units,complete_flag,last_computed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM daily_context_tally_current WHERE tally_key=?), CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)`,
    tallyKey, batchId, officialDate, slateShape, layerKey, tally.expected_units, tally.real_units, tally.derived_units, tally.temporary_units, tally.unclassified_units, tally.missing_units, tally.complete_flag, nowUtc(), tallyKey);
}

// Requirement 8: single active set only, no stale data. A game whose window has passed
// (final/postponed/cancelled, or live and past its calendar-verified start) must have its
// per-layer context rows purged, not retained. This purges precisely by game_pk across all
// 7 real layer tables, rather than relying only on each worker's own broader date-window
// retention - a game can go final mid-window (e.g. an early getaway-day game) well before the
// date itself rolls out of the today/tomorrow retention window.
async function purgeExpiredGameLayers(env, expiredGamePks) {
  if (!expiredGamePks.length) return { purged_game_count: 0, per_table: {} };
  const ph = expiredGamePks.map(() => "?").join(",");
  const tables = ["daily_starters_current", "daily_lineups_current", "daily_player_availability_current_v1", "daily_game_weather_current", "daily_bullpen_availability_current", "daily_team_schedule_spot_current", "daily_umpire_context_current"];
  const perTable = {};
  for (const t of tables) {
    try {
      const res = await run(env.DAILY_DB, `DELETE FROM ${t} WHERE game_pk IN (${ph})`, ...expiredGamePks);
      perTable[t] = res && res.meta ? res.meta.changes : null;
    } catch (e) { perTable[t] = { error: String(e && e.message ? e.message : e) }; }
  }
  return { purged_game_count: expiredGamePks.length, per_table: perTable };
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
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_context_tally_current (
    tally_key TEXT PRIMARY KEY,
    batch_id TEXT,
    official_date TEXT,
    slate_shape TEXT,
    layer_key TEXT,
    expected_units INTEGER DEFAULT 0,
    real_units INTEGER DEFAULT 0,
    derived_units INTEGER DEFAULT 0,
    temporary_units INTEGER DEFAULT 0,
    unclassified_units INTEGER DEFAULT 0,
    missing_units INTEGER DEFAULT 0,
    complete_flag INTEGER DEFAULT 0,
    last_computed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, `CREATE TABLE IF NOT EXISTS daily_context_slate_current (
    slate_date TEXT PRIMARY KEY,
    batch_id TEXT,
    slate_shape TEXT,
    game_count INTEGER DEFAULT 0,
    expired_game_count INTEGER DEFAULT 0,
    purged_game_count INTEGER DEFAULT 0,
    computed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.DAILY_DB, "CREATE INDEX IF NOT EXISTS idx_daily_context_tally_current_date ON daily_context_tally_current(official_date, layer_key)");
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
  await ensureSchema(env);

  // Fix (2026-07-15): the readiness window was hardcoded to exactly today+tomorrow
  // (ptDate(0)/ptDate(1)), and every run actively purged readiness data for any other
  // date. That silently broke whenever the real next games were more than 1 day out
  // (e.g. All-Star break). The window must follow the real board: derive it from the
  // actual distinct dates present in the prepared board, with today/tomorrow kept as a
  // safety floor so a genuine no-games day still gets a ledger entry instead of going
  // completely silent.
  const preparedAllDates = await readPreparedRows(env);
  const gamePksAllDates = [...new Set(preparedAllDates.map(r => r.official_game_pk).filter(v => v !== null && v !== undefined))];
  const gamesAllDates = gamePksAllDates.length ? await all(env.TEAM_DB, `SELECT game_pk, official_date, game_time_utc, is_pregame, is_live, is_final, is_postponed, is_cancelled, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, detailed_state FROM mlb_game_calendar WHERE game_pk IN (${gamePksAllDates.map(() => "?").join(",")})`, ...gamePksAllDates) : [];
  const gameMapAllDates = new Map(gamesAllDates.map(g => [String(g.game_pk), g]));
  const nowIsoForStartCheck = nowUtc();
  function gameHasStarted(gamePk) {
    const g = gameMapAllDates.get(String(gamePk));
    if (!g) return false;
    if (Number(g.is_live) === 1 || Number(g.is_final) === 1 || Number(g.is_postponed) === 1 || Number(g.is_cancelled) === 1) return true;
    if (g.game_time_utc && String(g.game_time_utc) <= nowIsoForStartCheck) return true;
    return false;
  }
  const notYetStartedDates = [...new Set(preparedAllDates.filter(r => !gameHasStarted(r.official_game_pk)).map(r => r.official_date).filter(Boolean))];
  const boardWindowDates = [...new Set([...notYetStartedDates, ptDate(0), ptDate(1)])].sort();
  const today = boardWindowDates[0];
  const tomorrow = boardWindowDates.length > 1 ? boardWindowDates[1] : ptDate(1);
  const windowInClause = boardWindowDates.map(() => "?").join(",");

  await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_context_readiness_batches (batch_id,request_id,run_id,worker_name,worker_version,job_key,mode,status,window_start,window_end,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, batchId, input.request_id || null, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_context_readiness_refresh_window", "running", boardWindowDates[0], boardWindowDates[boardWindowDates.length - 1], startedAt);

  await run(env.DAILY_DB, `DELETE FROM daily_context_readiness_current WHERE official_date NOT IN (${windowInClause})`, ...boardWindowDates);
  await run(env.DAILY_DB, `DELETE FROM daily_context_readiness_issues WHERE official_date NOT IN (${windowInClause})`, ...boardWindowDates);
  await run(env.DAILY_DB, `DELETE FROM daily_context_readiness_current WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  await run(env.DAILY_DB, `DELETE FROM daily_context_readiness_issues WHERE official_date IN (${windowInClause})`, ...boardWindowDates);

  const prepared = preparedAllDates.filter(r => !gameHasStarted(r.official_game_pk));
  const skippedAlreadyStartedRows = preparedAllDates.length - prepared.length;
  const gamePks = [...new Set(prepared.map(r => r.official_game_pk).filter(v => v !== null && v !== undefined))];
  const games = gamesAllDates.filter(g => gamePks.includes(g.game_pk));
  const gameMap = gameMapAllDates;

  const starters = await all(env.DAILY_DB, `SELECT * FROM daily_starters_current WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  const lineups = await all(env.DAILY_DB, `SELECT * FROM daily_lineups_current WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  const availability = await all(env.DAILY_DB, `SELECT * FROM daily_player_availability_current_v1 WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  const weather = await all(env.DAILY_DB, `SELECT * FROM daily_game_weather_current WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  const bullpen = await all(env.DAILY_DB, `SELECT * FROM daily_bullpen_availability_current WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  const schedule = await all(env.DAILY_DB, `SELECT * FROM daily_team_schedule_spot_current WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  const umpire = await all(env.DAILY_DB, `SELECT * FROM daily_umpire_context_current WHERE official_date IN (${windowInClause})`, ...boardWindowDates);
  const batches = await readLatestBatchMap(env);

  // Requirement 4/3: classify the real slate shape from calendar-verified prepared-board
  // games (not a naive date lookup), then compute a real/derived/temporary/missing tally per
  // layer per date, and purge any game whose window has already passed (Requirement 8).
  const gamePkSetByDate = new Map(boardWindowDates.map(d => [d, new Set(prepared.filter(r => r.official_date === d).map(r => String(r.official_game_pk)))]));
  const totalBoardGameCount = new Set(prepared.map(r => String(r.official_game_pk))).size;
  const slateShape = totalBoardGameCount > 0 ? "board_scoped_multi_date" : "no_games";

  async function tallyForDate(targetDate) {
    const preparedForDate = prepared.filter(r => r.official_date === targetDate);
    const gamesForDate = games.filter(g => g.official_date === targetDate);
    const gamePksForDate = [...new Set(preparedForDate.map(r => String(r.official_game_pk)))];
    const teamKeysForDate = [];
    for (const g of gamesForDate) { teamKeysForDate.push(`${g.game_pk}:${g.home_team_id}`); teamKeysForDate.push(`${g.game_pk}:${g.away_team_id}`); }
    const playerKeysForDate = [...new Set(preparedForDate.filter(r => r.resolved_mlb_player_id).map(r => `${r.official_game_pk}:${r.resolved_mlb_player_id}`))];
    // Bug fix: the lineups layer only ever writes rows for the 9 starting batters per team -
    // it never covers pitchers (Starters covers those) or bench/relief players not in today's
    // starting 9. Reusing the full playerKeysForDate (which includes pitcher-prop players) as
    // the lineups denominator overstated "missing" by exactly the pitcher count on the board.
    // hitterKeysForDate excludes pitcher-only prop rows so the lineups tally is measured
    // against what the layer can actually cover. player_availability legitimately covers both
    // hitters and pitchers, so it correctly keeps using the full playerKeysForDate.
    const hitterKeysForDate = [...new Set(preparedForDate.filter(r => r.resolved_mlb_player_id && isHitterProp(r.canonical_prop_key)).map(r => `${r.official_game_pk}:${r.resolved_mlb_player_id}`))];
    const layerSpecs = [
      { key: "starters", rows: starters.filter(r => r.official_date === targetDate), expected: gamePksForDate, keyFn: r => String(r.game_pk) },
      { key: "weather", rows: weather.filter(r => r.official_date === targetDate), expected: gamePksForDate, keyFn: r => String(r.game_pk) },
      { key: "umpire", rows: umpire.filter(r => r.official_date === targetDate), expected: gamePksForDate, keyFn: r => String(r.game_pk) },
      { key: "bullpen", rows: bullpen.filter(r => r.official_date === targetDate), expected: teamKeysForDate, keyFn: r => `${r.game_pk}:${r.team_id}` },
      { key: "schedule_spot", rows: schedule.filter(r => r.official_date === targetDate), expected: teamKeysForDate, keyFn: r => `${r.game_pk}:${r.team_id}` },
      { key: "lineups", rows: lineups.filter(r => r.official_date === targetDate), expected: hitterKeysForDate, keyFn: r => `${r.game_pk}:${r.player_id}` },
      { key: "player_availability", rows: availability.filter(r => r.official_date === targetDate), expected: playerKeysForDate, keyFn: r => `${r.game_pk}:${r.mlb_player_id || r.player_id}` }
    ];
    const tallies = {};
    for (const spec of layerSpecs) {
      const t = computeLayerTally(spec.rows, spec.expected, spec.keyFn);
      await writeTally(env, batchId, targetDate, slateShape, spec.key, t);
      tallies[spec.key] = t;
    }
    return tallies;
  }
  const tallyByDate = {};
  for (const d of boardWindowDates) {
    tallyByDate[d] = await tallyForDate(d);
    await run(env.DAILY_DB, `INSERT OR REPLACE INTO daily_context_slate_current (slate_date,batch_id,slate_shape,game_count,computed_at,created_at,updated_at) VALUES (?,?,?,?,?,COALESCE((SELECT created_at FROM daily_context_slate_current WHERE slate_date=?), CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)`, d, batchId, slateShape, (gamePkSetByDate.get(d) || new Set()).size, nowUtc(), d);
  }

  const expiredGamePks = games.filter(g => isGameStartedExpiredOrUnavailable(g, null)).map(g => g.game_pk);
  const purgeResult = await purgeExpiredGameLayers(env, expiredGamePks);

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
    const gameStartedOrExpired = isGameStartedExpiredOrUnavailable(game, p.official_game_time_utc);
    const notApplicableReasons = [];
    if (gameStartedOrExpired) notApplicableReasons.push({ layer: "calendar", type: "started_or_expired", reason: "Calendar/time guard says game is live/final/postponed/cancelled or within 15 minutes of official start; daily context is not applicable for pickability after start" });

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
    currentStatements.push(env.DAILY_DB.prepare(insertCurrentSql).bind(readinessKey, batchId, p.official_date, p.official_game_pk, p.official_game_time_utc, p.prepared_row_id, p.source_key, p.source_row_id, p.projection_id, playerId, p.player_name, teamId, opponentTeamId, p.canonical_prop_key, 1, p.pickable_safe, contextStatus, contextGrade, effectiveHard.length, warnings.length, gaps.length, availableContext, 7, starterStatus, lineupStatus, availabilityStatus, weatherStatus, bullpenStatus, scheduleStatus, umpireStatus, safeJson(effectiveHard), safeJson(warnings), safeJson(gaps), safeJson({ team_abbreviation: p.team, opponent: p.opponent, game_calendar: game ? { home_team_id: game.home_team_id, away_team_id: game.away_team_id, detailed_state: game.detailed_state, is_live: game.is_live, is_final: game.is_final, is_postponed: game.is_postponed, is_cancelled: game.is_cancelled, time_guard_reached_start: gameHasReachedStart(game, p.official_game_time_utc) } : null, sidecar_batch_ids: { starters: stRows[0]?.batch_id || null, lineups: lineup?.batch_id || null, player_availability: av?.batch_id || null, weather: w?.batch_id || null, bullpen: bp?.batch_id || null, schedule_spot: ss?.batch_id || null, umpire: u?.batch_id || null } })));
  }

  await batchRun(env.DAILY_DB, currentStatements, 80);
  const issueStatements = [];
  const insertIssueSql = `INSERT OR REPLACE INTO daily_context_readiness_issues (issue_id,batch_id,official_date,game_pk,prepared_row_id,player_id,team_id,layer_key,issue_class,severity,issue_type,reason,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`;
  for (const row of issueMap.values()) {
    counts.issues++;
    issueStatements.push(env.DAILY_DB.prepare(insertIssueSql).bind(row.issue_id, row.batch_id, row.official_date, row.game_pk, row.prepared_row_id, row.player_id, row.team_id, row.layer_key, row.issue_class, row.severity, row.issue_type, row.reason, safeJson({ occurrence_count: row.count, sample_prepared_row_ids: row.samples, aggregate_issue: true })));
  }
  await batchRun(env.DAILY_DB, issueStatements, 80);

  const output = { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: input.run_id || null, batch_id: batchId, status: "completed", certification: "DAILY_CONTEXT_READINESS_CERTIFIED_ENRICHMENT_LEDGER_WRITTEN", certification_grade: counts.hard ? "PASS_WITH_HARD_BLOCKERS" : (counts.not_applicable ? "PASS_WITH_NOT_APPLICABLE" : (counts.warning || counts.gap ? "PASS_WITH_WARNINGS" : "PASS")), window_start: boardWindowDates[0], window_end: boardWindowDates[boardWindowDates.length - 1], board_window_dates: boardWindowDates, slate_shape: slateShape, layer_tally: tallyByDate, already_started_rows_skipped_from_mining: skippedAlreadyStartedRows, expired_games_purged: purgeResult, prepared_rows_read: prepared.length, prepared_games_checked: gamePks.length, current_rows_written: counts.rows, issue_rows_written: counts.issues, hard_blocker_count: counts.hard, warning_count: counts.warning, enrichment_gap_count: counts.gap, ready_full_context_count: counts.ready_full, ready_with_warnings_count: counts.ready_warnings, ready_partial_enrichment_count: counts.ready_partial, waiting_late_context_count: counts.waiting, blocked_count: counts.blocked, not_applicable_count: counts.not_applicable, external_calls: 0, external_calls_performed: 0, rows_read: prepared.length, rows_written: counts.rows, sidecar_latest_batches: batches, retention_policy: "current_and_issues_rebuilt_for_board_scoped_window_not_yet_started_games_only_batches_retained_for_audit", tally_policy: "per_layer_per_date_real_derived_temporary_unclassified_missing_tracked_via_data_source_level_column", purge_policy: "expired_games_purged_precisely_by_game_pk_across_all_7_layer_tables_each_run", issue_write_policy: "aggregated_by_game_player_team_layer_type_to_avoid_timeout", guardrails: baseIdentity(env).guardrails, completed_at: nowUtc() };

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
      const HARD_DEADLINE_MS = 40000;
      const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
      try {
        const out = await withDeadline(runCertifier(env, input), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
        if (out === TIMEOUT_SENTINEL) {
          // Real fix (same class found live in daily-schedule.js): a genuine internal hang -
          // likely a stalled D1 call - previously had no safety net inside this worker. The
          // certifier runs twice per full-run chain, so this matters doubly here.
          return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "hard_deadline_timeout", certification: "DAILY_CERTIFIER_HARD_DEADLINE_TIMEOUT", error: `Worker exceeded its own ${HARD_DEADLINE_MS}ms internal deadline`, hard_deadline_ms: HARD_DEADLINE_MS, timestamp_utc: nowUtc() }, 200);
        }
        return jsonResponse(out);
      }
      catch (e) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "failed", certification: "DAILY_CONTEXT_READINESS_FAILED", error: String(e && e.message ? e.message : e), stack_preview: String(e && e.stack ? e.stack : "").slice(0, 900), external_calls: 0, external_calls_performed: 0 }, 500);
      }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
