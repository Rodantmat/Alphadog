import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-daily-certifier";
const VERSION = "alphadog-v2-daily-certifier-v0.2.1-postgres-rewire-redeploy";
const JOB_KEY = "daily-certifier";

const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE"];

function pgClient(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false, prepare: false });
}

function toPgPlaceholders(sqlText) {
  let i = 0;
  return String(sqlText).replace(/\?/g, () => "$" + (++i));
}

async function all(pg, sqlText, binds = []) {
  return await pg.unsafe(toPgPlaceholders(sqlText), binds);
}

async function first(pg, sqlText, binds = []) {
  const rows = await all(pg, sqlText, binds);
  return rows[0] || null;
}

function nowUtc() { return new Date().toISOString(); }
function pgArrayLiteral(arr, isText = true) {
  return "{" + (arr || []).map(v => isText ? `"${String(v).replace(/"/g, '\\"')}"` : String(v)).join(",") + "}";
}
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
  const db = { HYPERDRIVE: Boolean(env && env.HYPERDRIVE), CONTROL_DB: Boolean(env && env.CONTROL_DB) };
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
  if (Number(game.is_cancelled) === 1 || Number(game.is_postponed) === 1 || Number(game.is_final) === 1) return true;
  return false;
}
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
function determineSlateShape(todayGameCount, tomorrowGameCount) {
  if (todayGameCount > 0 && tomorrowGameCount > 0) return "split_today_tomorrow";
  if (todayGameCount > 0 && tomorrowGameCount === 0) return "same_day_only";
  if (todayGameCount === 0 && tomorrowGameCount > 0) return "next_day_only";
  return "no_games";
}
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

async function writeTally(pg, batchId, officialDate, slateShape, layerKey, tally) {
  const tallyKey = `${officialDate}|${layerKey}`;
  await pg.unsafe(
    `INSERT INTO context_cert.tally_current (tally_key,batch_id,official_date,slate_shape,layer_key,expected_units,real_units,derived_units,temporary_units,unclassified_units,missing_units,complete_flag,last_computed_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())
     ON CONFLICT (tally_key) DO UPDATE SET batch_id=excluded.batch_id, official_date=excluded.official_date, slate_shape=excluded.slate_shape,
       expected_units=excluded.expected_units, real_units=excluded.real_units, derived_units=excluded.derived_units,
       temporary_units=excluded.temporary_units, unclassified_units=excluded.unclassified_units, missing_units=excluded.missing_units,
       complete_flag=excluded.complete_flag, last_computed_at=excluded.last_computed_at, updated_at=now()`,
    [tallyKey, batchId, officialDate, slateShape, layerKey, tally.expected_units, tally.real_units, tally.derived_units, tally.temporary_units, tally.unclassified_units, tally.missing_units, tally.complete_flag, nowUtc()]
  );
}

async function purgeExpiredGameLayers(pg, expiredGamePks) {
  if (!expiredGamePks.length) return { purged_game_count: 0, per_table: {} };
  const tables = ["daily.probable_pitchers", "daily.lineups_current", "daily.player_availability_current", "daily.game_weather_current", "daily.bullpen_availability_current", "daily.team_schedule_spot_current", "daily.umpire_context_current"];
  const perTable = {};
  for (const t of tables) {
    try {
      const res = await pg.unsafe(`DELETE FROM ${t} WHERE game_pk = ANY($1::bigint[])`, [pgArrayLiteral(expiredGamePks, false)]);
      perTable[t] = res && res.count !== undefined ? res.count : null;
    } catch (e) { perTable[t] = { error: String(e && e.message ? e.message : e) }; }
  }
  return { purged_game_count: expiredGamePks.length, per_table: perTable };
}

async function ensureSchema(pg) {
  await pg.unsafe(`
CREATE SCHEMA IF NOT EXISTS context_cert;
CREATE TABLE IF NOT EXISTS context_cert.readiness_batches (
  batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, worker_name TEXT, worker_version TEXT, job_key TEXT, mode TEXT, status TEXT,
  window_start TEXT, window_end TEXT, prepared_rows_read INTEGER DEFAULT 0, prepared_games_checked INTEGER DEFAULT 0,
  current_rows_written INTEGER DEFAULT 0, issue_rows_written INTEGER DEFAULT 0, hard_blocker_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0, enrichment_gap_count INTEGER DEFAULT 0, ready_full_context_count INTEGER DEFAULT 0,
  ready_with_warnings_count INTEGER DEFAULT 0, ready_partial_enrichment_count INTEGER DEFAULT 0, waiting_late_context_count INTEGER DEFAULT 0,
  blocked_count INTEGER DEFAULT 0, not_applicable_count INTEGER DEFAULT 0, retention_violations INTEGER DEFAULT 0, schema_failures INTEGER DEFAULT 0,
  certification_status TEXT, certification_grade TEXT, certification_reason TEXT, output_json JSONB,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS context_cert.readiness_current (
  readiness_key TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, game_time_utc TIMESTAMPTZ, prepared_row_id TEXT,
  source_key TEXT, source_row_id TEXT, projection_id TEXT, player_id BIGINT, player_name TEXT, team_id BIGINT, opponent_team_id BIGINT,
  canonical_prop_key TEXT, prepared_board_relevant INTEGER DEFAULT 1, pickable_safe INTEGER DEFAULT 0, context_status TEXT, context_grade TEXT,
  hard_blocker_count INTEGER DEFAULT 0, warning_count INTEGER DEFAULT 0, enrichment_gap_count INTEGER DEFAULT 0, available_context_count INTEGER DEFAULT 0,
  expected_context_count INTEGER DEFAULT 7, starter_context_status TEXT, lineup_context_status TEXT, player_availability_status TEXT,
  weather_context_status TEXT, bullpen_context_status TEXT, schedule_spot_context_status TEXT, umpire_context_status TEXT,
  hard_block_reasons_json JSONB, warning_reasons_json JSONB, enrichment_gaps_json JSONB, details_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS context_cert.readiness_issues (
  issue_id TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, game_pk BIGINT, prepared_row_id TEXT, player_id BIGINT, team_id BIGINT,
  layer_key TEXT, issue_class TEXT, severity TEXT, issue_type TEXT, reason TEXT, details_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS context_cert.tally_current (
  tally_key TEXT PRIMARY KEY, batch_id TEXT, official_date TEXT, slate_shape TEXT, layer_key TEXT, expected_units INTEGER DEFAULT 0,
  real_units INTEGER DEFAULT 0, derived_units INTEGER DEFAULT 0, temporary_units INTEGER DEFAULT 0, unclassified_units INTEGER DEFAULT 0,
  missing_units INTEGER DEFAULT 0, complete_flag INTEGER DEFAULT 0, last_computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS context_cert.slate_current (
  slate_date TEXT PRIMARY KEY, batch_id TEXT, slate_shape TEXT, game_count INTEGER DEFAULT 0, expired_game_count INTEGER DEFAULT 0,
  purged_game_count INTEGER DEFAULT 0, computed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_readiness_current_game ON context_cert.readiness_current(official_date, game_pk);
CREATE INDEX IF NOT EXISTS idx_readiness_current_status ON context_cert.readiness_current(context_status, context_grade);
CREATE INDEX IF NOT EXISTS idx_readiness_current_player ON context_cert.readiness_current(player_id, game_pk);
CREATE INDEX IF NOT EXISTS idx_readiness_issues_batch ON context_cert.readiness_issues(batch_id);
CREATE INDEX IF NOT EXISTS idx_readiness_issues_date ON context_cert.readiness_issues(official_date);
CREATE INDEX IF NOT EXISTS idx_tally_current_date ON context_cert.tally_current(official_date, layer_key);`);
}

async function readPreparedRows(pg) {
  return await pg.unsafe(`SELECT prepared_row_id, prep_batch_id, source_key, source_row_id, projection_id, player_name, resolved_mlb_player_id, player_match_status, team, opponent, team_full_name, opponent_full_name, canonical_prop_key, source_prop_name, line_value, official_game_pk, official_game_time_utc, official_date, matchup_status, pickable_safe, prep_status, block_reason
    FROM score.board_prepared_current
    WHERE pickable_safe = 1
      AND matchup_status = 'calendar_matched'
      AND player_match_status = 'matched'
      AND official_game_pk IS NOT NULL
      AND official_game_time_utc IS NOT NULL
    ORDER BY official_game_time_utc, prepared_row_id`);
}
async function readLatestBatchMap(pg) {
  const specs = [
    ["starters", "daily.starters_batches"], ["lineups", "daily.lineups_batches"], ["player_availability", "daily.player_availability_batches"], ["weather", "daily.game_weather_batches"], ["bullpen", "daily.bullpen_availability_batches"], ["schedule_spot", "daily.team_schedule_spot_batches"], ["umpire", "daily.umpire_context_batches"]
  ];
  const out = {};
  for (const [key, table] of specs) {
    try { const rows = await pg.unsafe(`SELECT * FROM ${table} ORDER BY COALESCE(updated_at, completed_at, created_at) DESC LIMIT 1`); out[key] = rows[0] || null; }
    catch (e) { out[key] = { error: String(e && e.message ? e.message : e) }; }
  }
  return out;
}

async function runCertifier(env, input) {
  const startedAt = nowUtc();
  const batchId = rid("daily_context_readiness_batch");
  const pg = pgClient(env);
  try {
    await ensureSchema(pg);

    const preparedAllDates = await readPreparedRows(pg);
    const gamePksAllDates = [...new Set(preparedAllDates.map(r => r.official_game_pk).filter(v => v !== null && v !== undefined))];
    const gamesAllDates = gamePksAllDates.length ? await pg.unsafe(`SELECT game_pk, official_date, game_time_utc, is_pregame, is_live, is_final, is_postponed, is_cancelled, home_team_id, away_team_id, home_team_name, away_team_name, venue_id, venue_name, detailed_state FROM calendar.game_calendar WHERE game_pk = ANY($1::bigint[])`, [pgArrayLiteral(gamePksAllDates, false)]) : [];
    const gameMapAllDates = new Map(gamesAllDates.map(g => [String(g.game_pk), g]));
    const nowIsoForStartCheck = nowUtc();
    function gameHasStarted(gamePk) {
      const g = gameMapAllDates.get(String(gamePk));
      if (!g) return false;
      if (Number(g.is_final) === 1 || Number(g.is_postponed) === 1 || Number(g.is_cancelled) === 1) return true;
      if (g.game_time_utc && new Date(g.game_time_utc).toISOString() <= nowIsoForStartCheck) return true;
      return false;
    }
    const notYetStartedDates = [...new Set(preparedAllDates.filter(r => !gameHasStarted(r.official_game_pk)).map(r => r.official_date).filter(Boolean))];
    const boardWindowDates = [...new Set([...notYetStartedDates, ptDate(0), ptDate(1)])].sort();
    const boardWindowDatesLiteral = pgArrayLiteral(boardWindowDates, true);

    await pg.unsafe(
      `INSERT INTO context_cert.readiness_batches (batch_id,request_id,run_id,worker_name,worker_version,job_key,mode,status,window_start,window_end,started_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())`,
      [batchId, input.request_id || null, input.run_id || null, WORKER_NAME, VERSION, JOB_KEY, input.mode || "daily_context_readiness_refresh_window", "running", boardWindowDates[0], boardWindowDates[boardWindowDates.length - 1], startedAt]
    );

    await pg.unsafe(`DELETE FROM context_cert.readiness_current WHERE official_date <> ALL($1::text[])`, [boardWindowDatesLiteral]);
    await pg.unsafe(`DELETE FROM context_cert.readiness_issues WHERE official_date <> ALL($1::text[])`, [boardWindowDatesLiteral]);
    await pg.unsafe(`DELETE FROM context_cert.readiness_current WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]);
    await pg.unsafe(`DELETE FROM context_cert.readiness_issues WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]);

    const prepared = preparedAllDates.filter(r => !gameHasStarted(r.official_game_pk));
    const skippedAlreadyStartedRows = preparedAllDates.length - prepared.length;
    const gamePks = [...new Set(prepared.map(r => r.official_game_pk).filter(v => v !== null && v !== undefined))];
    const games = gamesAllDates.filter(g => gamePks.includes(g.game_pk));
    const gameMap = gameMapAllDates;

    const starters = await pg.unsafe(`SELECT starter_player_id AS player_id, starter_name AS player_name, game_pk, official_date, batch_id, tbd_flag, hand_missing_flag, starter_status, data_source_level, is_temporary_derived FROM daily.probable_pitchers WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]).catch(() => []);
    const lineups = await pg.unsafe(`SELECT * FROM daily.lineups_current WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]).catch(() => []);
    const availability = await pg.unsafe(`SELECT * FROM daily.player_availability_current WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]).catch(() => []);
    const weather = await pg.unsafe(`SELECT * FROM daily.game_weather_current WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]).catch(() => []);
    const bullpen = await pg.unsafe(`SELECT * FROM daily.bullpen_availability_current WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]).catch(() => []);
    const schedule = await pg.unsafe(`SELECT * FROM daily.team_schedule_spot_current WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]).catch(() => []);
    const umpire = await pg.unsafe(`SELECT * FROM daily.umpire_context_current WHERE official_date = ANY($1::text[])`, [boardWindowDatesLiteral]).catch(() => []);
    const batches = await readLatestBatchMap(pg);

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
        await writeTally(pg, batchId, targetDate, slateShape, spec.key, t);
        tallies[spec.key] = t;
      }
      return tallies;
    }
    const tallyByDate = {};
    for (const d of boardWindowDates) {
      tallyByDate[d] = await tallyForDate(d);
      await pg.unsafe(
        `INSERT INTO context_cert.slate_current (slate_date,batch_id,slate_shape,game_count,computed_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,now(),now())
         ON CONFLICT (slate_date) DO UPDATE SET batch_id=excluded.batch_id, slate_shape=excluded.slate_shape, game_count=excluded.game_count, computed_at=excluded.computed_at, updated_at=now()`,
        [d, batchId, slateShape, (gamePkSetByDate.get(d) || new Set()).size, nowUtc()]
      );
    }

    const expiredGamePks = games.filter(g => isGameStartedExpiredOrUnavailable(g, null)).map(g => g.game_pk);
    const purgeResult = await purgeExpiredGameLayers(pg, expiredGamePks);

    const starterByGame = mapBy(starters, r => String(r.game_pk));
    const lineupByPlayerGame = mapBy(lineups, r => `${r.game_pk}:${r.player_id}`);
    const availByPlayerGame = mapBy(availability, r => `${r.game_pk}:${r.mlb_player_id || r.player_id}`);
    const weatherByGame = new Map(weather.map(r => [String(r.game_pk), r]));
    const bullpenByGameTeam = new Map(bullpen.map(r => [`${r.game_pk}:${r.team_id}`, r]));
    const scheduleByGameTeam = new Map(schedule.map(r => [`${r.game_pk}:${r.team_id}`, r]));
    const umpireByGame = new Map(umpire.map(r => [String(r.game_pk), r]));

    const counts = { hard: 0, warning: 0, gap: 0, rows: 0, issues: 0, ready_full: 0, ready_warnings: 0, ready_partial: 0, waiting: 0, blocked: 0, not_applicable: 0 };
    const currentRows = [];
    const issueMap = new Map();

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

      if (!game) hard.push({ layer: "calendar", type: "missing_calendar_anchor", reason: "Prepared row game_pk not found in calendar.game_calendar" });
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

      currentRows.push({
        readiness_key: `ctx_${p.prepared_row_id}`, batch_id: batchId, official_date: p.official_date, game_pk: p.official_game_pk,
        game_time_utc: p.official_game_time_utc, prepared_row_id: p.prepared_row_id, source_key: p.source_key, source_row_id: p.source_row_id,
        projection_id: p.projection_id, player_id: playerId, player_name: p.player_name, team_id: teamId, opponent_team_id: opponentTeamId,
        canonical_prop_key: p.canonical_prop_key, prepared_board_relevant: 1, pickable_safe: p.pickable_safe, context_status: contextStatus,
        context_grade: contextGrade, hard_blocker_count: effectiveHard.length, warning_count: warnings.length, enrichment_gap_count: gaps.length,
        available_context_count: availableContext, expected_context_count: 7, starter_context_status: starterStatus, lineup_context_status: lineupStatus,
        player_availability_status: availabilityStatus, weather_context_status: weatherStatus, bullpen_context_status: bullpenStatus,
        schedule_spot_context_status: scheduleStatus, umpire_context_status: umpireStatus,
        hard_block_reasons_json: safeJson(effectiveHard), warning_reasons_json: safeJson(warnings), enrichment_gaps_json: safeJson(gaps),
        details_json: safeJson({ team_abbreviation: p.team, opponent: p.opponent, game_calendar: game ? { home_team_id: game.home_team_id, away_team_id: game.away_team_id, detailed_state: game.detailed_state, is_live: game.is_live, is_final: game.is_final, is_postponed: game.is_postponed, is_cancelled: game.is_cancelled, time_guard_reached_start: gameHasReachedStart(game, p.official_game_time_utc) } : null, sidecar_batch_ids: { starters: stRows[0]?.batch_id || null, lineups: lineup?.batch_id || null, player_availability: av?.batch_id || null, weather: w?.batch_id || null, bullpen: bp?.batch_id || null, schedule_spot: ss?.batch_id || null, umpire: u?.batch_id || null } })
      });
    }

    const currentCols = ["readiness_key", "batch_id", "official_date", "game_pk", "game_time_utc", "prepared_row_id", "source_key", "source_row_id", "projection_id", "player_id", "player_name", "team_id", "opponent_team_id", "canonical_prop_key", "prepared_board_relevant", "pickable_safe", "context_status", "context_grade", "hard_blocker_count", "warning_count", "enrichment_gap_count", "available_context_count", "expected_context_count", "starter_context_status", "lineup_context_status", "player_availability_status", "weather_context_status", "bullpen_context_status", "schedule_spot_context_status", "umpire_context_status", "hard_block_reasons_json", "warning_reasons_json", "enrichment_gaps_json", "details_json"];
    const CHUNK = 500;
    for (let i = 0; i < currentRows.length; i += CHUNK) {
      const chunk = currentRows.slice(i, i + CHUNK);
      await pg`INSERT INTO context_cert.readiness_current ${pg(chunk, ...currentCols)}
        ON CONFLICT (readiness_key) DO UPDATE SET batch_id=excluded.batch_id, official_date=excluded.official_date, game_pk=excluded.game_pk,
        game_time_utc=excluded.game_time_utc, context_status=excluded.context_status, context_grade=excluded.context_grade,
        hard_blocker_count=excluded.hard_blocker_count, warning_count=excluded.warning_count, enrichment_gap_count=excluded.enrichment_gap_count,
        available_context_count=excluded.available_context_count, starter_context_status=excluded.starter_context_status,
        lineup_context_status=excluded.lineup_context_status, player_availability_status=excluded.player_availability_status,
        weather_context_status=excluded.weather_context_status, bullpen_context_status=excluded.bullpen_context_status,
        schedule_spot_context_status=excluded.schedule_spot_context_status, umpire_context_status=excluded.umpire_context_status,
        hard_block_reasons_json=excluded.hard_block_reasons_json, warning_reasons_json=excluded.warning_reasons_json,
        enrichment_gaps_json=excluded.enrichment_gaps_json, details_json=excluded.details_json, updated_at=now()`;
    }

    const issueRows = [];
    for (const row of issueMap.values()) {
      counts.issues++;
      issueRows.push({
        issue_id: row.issue_id, batch_id: row.batch_id, official_date: row.official_date, game_pk: row.game_pk, prepared_row_id: row.prepared_row_id,
        player_id: row.player_id, team_id: row.team_id, layer_key: row.layer_key, issue_class: row.issue_class, severity: row.severity,
        issue_type: row.issue_type, reason: row.reason, details_json: safeJson({ occurrence_count: row.count, sample_prepared_row_ids: row.samples, aggregate_issue: true })
      });
    }
    const issueCols = ["issue_id", "batch_id", "official_date", "game_pk", "prepared_row_id", "player_id", "team_id", "layer_key", "issue_class", "severity", "issue_type", "reason", "details_json"];
    for (let i = 0; i < issueRows.length; i += CHUNK) {
      const chunk = issueRows.slice(i, i + CHUNK);
      await pg`INSERT INTO context_cert.readiness_issues ${pg(chunk, ...issueCols)} ON CONFLICT (issue_id) DO NOTHING`;
    }

    const output = { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, run_id: input.run_id || null, batch_id: batchId, status: "completed", certification: "DAILY_CONTEXT_READINESS_CERTIFIED_ENRICHMENT_LEDGER_WRITTEN", certification_grade: counts.hard ? "PASS_WITH_HARD_BLOCKERS" : (counts.not_applicable ? "PASS_WITH_NOT_APPLICABLE" : (counts.warning || counts.gap ? "PASS_WITH_WARNINGS" : "PASS")), window_start: boardWindowDates[0], window_end: boardWindowDates[boardWindowDates.length - 1], board_window_dates: boardWindowDates, slate_shape: slateShape, layer_tally: tallyByDate, already_started_rows_skipped_from_mining: skippedAlreadyStartedRows, expired_games_purged: purgeResult, prepared_rows_read: prepared.length, prepared_games_checked: gamePks.length, current_rows_written: counts.rows, issue_rows_written: counts.issues, hard_blocker_count: counts.hard, warning_count: counts.warning, enrichment_gap_count: counts.gap, ready_full_context_count: counts.ready_full, ready_with_warnings_count: counts.ready_warnings, ready_partial_enrichment_count: counts.ready_partial, waiting_late_context_count: counts.waiting, blocked_count: counts.blocked, not_applicable_count: counts.not_applicable, external_calls: 0, external_calls_performed: 0, rows_read: prepared.length, rows_written: counts.rows, sidecar_latest_batches: batches, retention_policy: "current_and_issues_rebuilt_for_board_scoped_window_not_yet_started_games_only_batches_retained_for_audit", tally_policy: "per_layer_per_date_real_derived_temporary_unclassified_missing_tracked_via_data_source_level_column", purge_policy: "expired_games_purged_precisely_by_game_pk_across_all_7_layer_tables_each_run", issue_write_policy: "aggregated_by_game_player_team_layer_type_to_avoid_timeout", guardrails: baseIdentity(env).guardrails, completed_at: nowUtc() };

    await pg.unsafe(
      `UPDATE context_cert.readiness_batches SET status='completed', prepared_rows_read=$1, prepared_games_checked=$2, current_rows_written=$3, issue_rows_written=$4, hard_blocker_count=$5, warning_count=$6, enrichment_gap_count=$7, ready_full_context_count=$8, ready_with_warnings_count=$9, ready_partial_enrichment_count=$10, waiting_late_context_count=$11, blocked_count=$12, not_applicable_count=$13, retention_violations=0, schema_failures=0, certification_status=$14, certification_grade=$15, certification_reason=$16, output_json=$17, completed_at=$18, updated_at=now() WHERE batch_id=$19`,
      [prepared.length, gamePks.length, counts.rows, counts.issues, counts.hard, counts.warning, counts.gap, counts.ready_full, counts.ready_warnings, counts.ready_partial, counts.waiting, counts.blocked, counts.not_applicable, output.certification, output.certification_grade, "Daily context readiness/enrichment ledger written; started/expired games are not_applicable, missing late context is warning/gap unless true integrity or availability blocker", safeJson(output), output.completed_at, batchId]
    );
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
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: { HYPERDRIVE: Boolean(env.HYPERDRIVE), CONTROL_DB: Boolean(env.CONTROL_DB) }, vars: varPresence(env, EXPECTED_VARS) } });
    if (method === "POST" && path === "/diagnostic") return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", writes_performed: 0, external_calls_performed: 0 });
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const HARD_DEADLINE_MS = 18500;
      const TIMEOUT_SENTINEL = { __hard_deadline_timeout__: true };
      try {
        const out = await withDeadline(runCertifier(env, input), HARD_DEADLINE_MS, TIMEOUT_SENTINEL);
        if (out === TIMEOUT_SENTINEL) {
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
