const WORKER_NAME = "alphadog-v2-base-team-game-logs";
const VERSION = "alphadog-v2-base-team-game-logs-v0.3.4-calendar-gap-scoped-mining-only";
const JOB_KEY = "base-team-game-logs";
const DEFAULT_SAMPLE_DATE = "2026-05-18";
const SOURCE_KEY = "mlb_statsapi_schedule_boxscore_team_totals_probe_v0_1_0";
const SOURCE_CONFIDENCE = "SOURCE_LOCKED_BASE_BACKFILL_READY";
const BASE_CURSOR_KEY = "team_game_logs_base_backfill";
const DELTA_CURSOR_KEY = "team_game_logs_delta_update";
const DEFAULT_BASE_START_DATE = "2026-03-01";
const DEFAULT_BASE_CUTOFF_DATE = "2026-05-18";
const DEFAULT_DELTA_START_DATE = "2026-05-19";
const DEFAULT_GAMES_PER_TICK = 18;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "ODDS_API_KEY", "PARLAY_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH", "MLB_API_USER_AGENT"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "DEFAULT_DAY_SCOPE", "DEFAULT_SLATE_MODE", "ODDS_API_BASE_URL", "PARLAY_API_BASE_URL", "MLB_API_BASE_URL", "PRIZEPICKS_SOURCE_MODE", "MAX_TICK_MS", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES", "WORKER_SAFE_MODE", "DEBUG_MODE", "MANUAL_SQL_ENABLED", "CONFIG_PHASE", "MLB_API_BASE_URL"];

function nowUtc() { return new Date().toISOString(); }
function ymdToSeason(ymd) { return Number(String(ymd || "").slice(0, 4)) || 2026; }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function safeJson(value) { try { return JSON.stringify(value == null ? null : value); } catch { return JSON.stringify({ serialization_error: true }); } }
function parseIntSafe(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function str(v) { return v == null ? null : String(v); }
function normalizeDate(d) { return String(d || "").slice(0, 10); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}
function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}
function allTrue(obj) { return Object.values(obj).every(Boolean); }

async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
async function run(db, sql, ...binds) { const stmt = db.prepare(sql); return binds.length ? stmt.bind(...binds).run() : stmt.run(); }
async function all(db, sql, ...binds) { const stmt = db.prepare(sql); const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all(); return res.results || []; }
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }
async function tryAll(db, sql, ...binds) {
  try { return { ok: true, rows: await all(db, sql, ...binds) }; }
  catch (err) { return { ok: false, rows: [], error: String(err && err.message ? err.message : err) }; }
}

async function tryRun(db, sql, ...binds) {
  try { await run(db, sql, ...binds); return { ok: true, sql }; }
  catch (err) { return { ok: false, sql, error: String(err && err.message ? err.message : err) }; }
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  const secrets = varPresence(env, REQUIRED_SECRETS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "SOURCE_LOCK_PROBE_READY",
    timestamp_utc: nowUtc(),
    phase: "base-team-game-logs-v0.1.0-probe-only",
    notes: [
      "Probe-only worker. No live team_game_logs promotion.",
      "Allowed writes: TEAM_DB lifecycle schema, probe batch/outcome/stage/certification/cursor rows.",
      "Uses MLB StatsAPI schedule plus game boxscore for a tiny completed-game sample.",
      "Full base_backfill and delta_update remain blocked until source mapping is approved."
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets)
    }
  };
}

async function ensureSchema(env) {
  const db = env.TEAM_DB;
  const applied = [];
  const failures = [];
  const statements = [
    `CREATE TABLE IF NOT EXISTS team_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`,
    `CREATE TABLE IF NOT EXISTS team_game_logs (
      team_game_key TEXT PRIMARY KEY,
      game_pk INTEGER,
      season INTEGER,
      game_date TEXT,
      team_id TEXT,
      opponent_team_id TEXT,
      is_home INTEGER,
      runs INTEGER,
      hits INTEGER,
      errors INTEGER,
      plate_appearances INTEGER,
      at_bats INTEGER,
      walks INTEGER,
      strikeouts INTEGER,
      home_runs INTEGER,
      raw_json TEXT,
      source_key TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS team_game_log_batches (
      batch_id TEXT PRIMARY KEY,
      run_id TEXT,
      request_id TEXT,
      chain_id TEXT,
      job_key TEXT,
      worker_name TEXT,
      version TEXT,
      ingestion_mode TEXT,
      probe_only INTEGER DEFAULT 1,
      source_key TEXT,
      source_confidence TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      base_backfill_cutoff_date TEXT,
      delta_reserved_start_date TEXT,
      sample_start_date TEXT,
      sample_end_date TEXT,
      expected_game_count INTEGER DEFAULT 0,
      expected_team_game_rows INTEGER DEFAULT 0,
      staged_team_game_rows INTEGER DEFAULT 0,
      rows_promoted INTEGER DEFAULT 0,
      duplicate_stage_keys INTEGER DEFAULT 0,
      non_final_games INTEGER DEFAULT 0,
      source_error_count INTEGER DEFAULT 0,
      repair_required_count INTEGER DEFAULT 0,
      unclear_count INTEGER DEFAULT 0,
      status TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      output_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      certified_at TEXT,
      promoted_at TEXT,
      cleaned_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS team_game_log_stage (
      stage_id TEXT PRIMARY KEY,
      team_game_key TEXT,
      game_pk INTEGER,
      game_date TEXT,
      season INTEGER,
      team_id TEXT,
      team_name TEXT,
      opponent_team_id TEXT,
      opponent_team_name TEXT,
      is_home INTEGER,
      game_type TEXT,
      game_status TEXT,
      venue_id INTEGER,
      runs INTEGER,
      hits INTEGER,
      errors INTEGER,
      at_bats INTEGER,
      plate_appearances INTEGER,
      doubles INTEGER,
      triples INTEGER,
      home_runs INTEGER,
      walks INTEGER,
      strikeouts INTEGER,
      stolen_bases INTEGER,
      left_on_base INTEGER,
      total_bases INTEGER,
      rbi INTEGER,
      runs_allowed INTEGER,
      hits_allowed INTEGER,
      earned_runs_allowed INTEGER,
      walks_allowed INTEGER,
      strikeouts_pitched INTEGER,
      home_runs_allowed INTEGER,
      innings_pitched TEXT,
      outs_recorded INTEGER,
      batting_source_path TEXT,
      pitching_source_path TEXT,
      data_feed_key TEXT,
      source_key TEXT,
      source_endpoint TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      ingestion_mode TEXT,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      source_confidence TEXT,
      source_snapshot_date TEXT,
      raw_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      certified_at TEXT,
      promoted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS team_game_log_outcomes (
      outcome_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      game_pk INTEGER,
      game_date TEXT,
      season INTEGER,
      team_id TEXT,
      opponent_team_id TEXT,
      outcome_level TEXT,
      outcome_category TEXT,
      status TEXT,
      reason TEXT,
      source_endpoint TEXT,
      source_key TEXT,
      source_confidence TEXT,
      source_snapshot_date TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS team_game_log_cursor (
      cursor_key TEXT PRIMARY KEY,
      ingestion_mode TEXT,
      source_key TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      base_backfill_cutoff_date TEXT,
      delta_reserved_start_date TEXT,
      last_sample_date TEXT,
      last_game_pk INTEGER,
      last_batch_id TEXT,
      last_request_id TEXT,
      status TEXT,
      cursor_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS team_game_log_certifications (
      certification_id TEXT PRIMARY KEY,
      batch_id TEXT,
      run_id TEXT,
      request_id TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      expected_game_count INTEGER,
      expected_team_game_rows INTEGER,
      staged_team_game_rows INTEGER,
      rows_promoted INTEGER DEFAULT 0,
      duplicate_stage_keys INTEGER DEFAULT 0,
      non_final_games INTEGER DEFAULT 0,
      source_error_count INTEGER DEFAULT 0,
      repair_required_count INTEGER DEFAULT 0,
      unclear_count INTEGER DEFAULT 0,
      missing_game_pk INTEGER DEFAULT 0,
      missing_game_date INTEGER DEFAULT 0,
      missing_team_id INTEGER DEFAULT 0,
      missing_opponent_team_id INTEGER DEFAULT 0,
      bad_home_away_pair_count INTEGER DEFAULT 0,
      raw_json_missing INTEGER DEFAULT 0,
      lineage_missing_count INTEGER DEFAULT 0,
      source_field_map_json TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];
  for (const sql of statements) {
    const res = await tryRun(db, sql);
    (res.ok ? applied : failures).push(res);
  }
  const alterColumns = [
    ["data_feed_key", "TEXT"], ["source_endpoint", "TEXT"], ["source_season", "INTEGER"], ["source_game_type", "TEXT"],
    ["ingestion_mode", "TEXT"], ["batch_id", "TEXT"], ["run_id", "TEXT"], ["certification_status", "TEXT"],
    ["certification_grade", "TEXT"], ["source_confidence", "TEXT"], ["certified_at", "TEXT"], ["promoted_at", "TEXT"],
    ["created_at", "TEXT"], ["source_snapshot_date", "TEXT"], ["game_status", "TEXT"], ["venue_id", "INTEGER"],
    ["doubles", "INTEGER"], ["triples", "INTEGER"], ["stolen_bases", "INTEGER"], ["left_on_base", "INTEGER"], ["total_bases", "INTEGER"], ["rbi", "INTEGER"],
    ["runs_allowed", "INTEGER"], ["hits_allowed", "INTEGER"], ["earned_runs_allowed", "INTEGER"], ["walks_allowed", "INTEGER"], ["strikeouts_pitched", "INTEGER"], ["home_runs_allowed", "INTEGER"], ["innings_pitched", "TEXT"], ["outs_recorded", "INTEGER"]
  ];
  for (const [name, type] of alterColumns) {
    const res = await tryRun(db, `ALTER TABLE team_game_logs ADD COLUMN ${name} ${type}`);
    if (res.ok) applied.push({ ...res, additive_column: name });
    else if (/duplicate column/i.test(res.error || "")) applied.push({ ok: true, skipped_existing_column: name });
    else failures.push({ ...res, additive_column: name });
  }
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_team_game_logs_game_team ON team_game_logs(game_pk, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_game_logs_season_date_status ON team_game_logs(season, game_date, game_status)`,
    `CREATE INDEX IF NOT EXISTS idx_team_game_logs_batch ON team_game_logs(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_game_log_stage_batch ON team_game_log_stage(batch_id, game_pk, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_game_log_stage_game_team ON team_game_log_stage(game_pk, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_game_log_stage_season_date ON team_game_log_stage(season, game_date, game_status)`,
    `CREATE INDEX IF NOT EXISTS idx_team_game_log_outcomes_batch ON team_game_log_outcomes(batch_id, game_pk, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_game_log_batches_status ON team_game_log_batches(status, created_at)`
  ];
  for (const sql of indexes) {
    const res = await tryRun(db, sql);
    (res.ok ? applied : failures).push(res);
  }
  await tryRun(db, "INSERT OR REPLACE INTO team_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('team_game_logs_v0_2_0_base_backfill', ?, CURRENT_TIMESTAMP, 'Additive lifecycle schema for base team game logs base_backfill through 2026-05-18')", VERSION);
  return { ok: failures.length === 0, applied_count: applied.length, failure_count: failures.length, failures: failures.slice(0, 10) };
}

function getBaseUrl(env) {
  // Normalize optional env override so both of these are safe:
  // - https://statsapi.mlb.com
  // - https://statsapi.mlb.com/api/v1
  // Probe endpoints are appended with /api/v1/... below, so a pre-suffixed base must be trimmed.
  return String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com")
    .replace(/\/$/, "")
    .replace(/\/api\/v1$/i, "");
}
async function fetchJson(url, env) {
  const headers = {};
  if (env.MLB_API_USER_AGENT) headers["user-agent"] = String(env.MLB_API_USER_AGENT);
  const resp = await fetch(url, { headers });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { ok: resp.ok && !!json, http_status: resp.status, url, json, text_preview: text.slice(0, 500) };
}
function isTerminalGameStatusText(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return false;
  return s === "final" || s === "game over" || s.includes("final") || s.includes("game over") || s.includes("completed");
}
function isNonCompletedGameStatusText(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes("postponed") ||
    s.includes("scheduled") ||
    s.includes("pre-game") ||
    s.includes("pregame") ||
    s.includes("preview") ||
    s.includes("warmup") ||
    s.includes("in progress") ||
    s.includes("delayed") ||
    s.includes("suspended") ||
    s.includes("cancelled") ||
    s.includes("canceled") ||
    s.includes("manager challenge")
  );
}
function gameIsFinal(game) {
  const detailed = String(game?.status?.detailedState || "");
  const abstract = String(game?.status?.abstractGameState || "");
  const coded = String(game?.status?.codedGameState || "").toUpperCase();
  const combinedStatusText = `${detailed} ${abstract} ${coded}`;

  // Hard exclusion: schedule rows like Postponed can carry terminal-looking
  // coded status values from MLB StatsAPI, but they are not completed team-game data.
  // Exclude them before expected counts, boxscore fetches, staging, and promotion.
  if (isNonCompletedGameStatusText(combinedStatusText)) return false;

  if (isTerminalGameStatusText(detailed)) return true;
  if (isTerminalGameStatusText(abstract)) return true;

  // Do not accept codedGameState=F by itself. It is only a secondary confirmation
  // after a human-readable completed/final state is present.
  return coded === "F" && (isTerminalGameStatusText(detailed) || isTerminalGameStatusText(abstract));
}
function getTeamPairFromSchedule(game) {
  const away = game?.teams?.away?.team || {};
  const home = game?.teams?.home?.team || {};
  return {
    away_team_id: parseIntSafe(away.id), away_team_name: away.name || null,
    home_team_id: parseIntSafe(home.id), home_team_name: home.name || null
  };
}
function stat(source, keys) {
  for (const k of keys) {
    if (source && source[k] !== undefined && source[k] !== null && source[k] !== "") return source[k];
  }
  return null;
}
function buildTeamRow({ side, game, boxscore, schedulePair, batchId, runId, requestId, sourceEndpoint, sampleDate }) {
  const isHome = side === "home";
  const teamBox = boxscore?.teams?.[side] || {};
  const oppBox = boxscore?.teams?.[isHome ? "away" : "home"] || {};
  const batting = teamBox?.teamStats?.batting || {};
  const pitching = teamBox?.teamStats?.pitching || {};
  const oppBatting = oppBox?.teamStats?.batting || {};
  const team = teamBox.team || game?.teams?.[side]?.team || {};
  const opp = oppBox.team || game?.teams?.[isHome ? "away" : "home"]?.team || {};
  const teamId = parseIntSafe(team.id || (isHome ? schedulePair.home_team_id : schedulePair.away_team_id));
  const oppId = parseIntSafe(opp.id || (isHome ? schedulePair.away_team_id : schedulePair.home_team_id));
  const gameDate = normalizeDate(game.officialDate || game.gameDate || sampleDate);
  const gamePk = parseIntSafe(game.gamePk);
  const battingRuns = stat(batting, ["runs"]);
  const opponentRuns = stat(oppBatting, ["runs"]);
  return {
    stage_id: `${batchId}_${gamePk}_${teamId}`,
    team_game_key: `${gamePk}_${teamId}`,
    game_pk: gamePk,
    game_date: gameDate,
    season: ymdToSeason(gameDate),
    team_id: teamId == null ? null : String(teamId),
    team_name: team.name || (isHome ? schedulePair.home_team_name : schedulePair.away_team_name) || null,
    opponent_team_id: oppId == null ? null : String(oppId),
    opponent_team_name: opp.name || (isHome ? schedulePair.away_team_name : schedulePair.home_team_name) || null,
    is_home: isHome ? 1 : 0,
    game_type: game.gameType || "R",
    game_status: game?.status?.detailedState || game?.status?.abstractGameState || null,
    venue_id: parseIntSafe(game?.venue?.id),
    runs: parseIntSafe(battingRuns),
    hits: parseIntSafe(stat(batting, ["hits"])),
    errors: parseIntSafe(stat(batting, ["errors"])),
    at_bats: parseIntSafe(stat(batting, ["atBats", "at_bats"])),
    plate_appearances: parseIntSafe(stat(batting, ["plateAppearances", "plate_appearances"])),
    doubles: parseIntSafe(stat(batting, ["doubles"])),
    triples: parseIntSafe(stat(batting, ["triples"])),
    home_runs: parseIntSafe(stat(batting, ["homeRuns", "home_runs"])),
    walks: parseIntSafe(stat(batting, ["baseOnBalls", "walks"])),
    strikeouts: parseIntSafe(stat(batting, ["strikeOuts", "strikeouts"])),
    stolen_bases: parseIntSafe(stat(batting, ["stolenBases", "stolen_bases"])),
    left_on_base: parseIntSafe(stat(batting, ["leftOnBase", "left_on_base"])),
    total_bases: parseIntSafe(stat(batting, ["totalBases", "total_bases"])),
    rbi: parseIntSafe(stat(batting, ["rbi"])),
    runs_allowed: parseIntSafe(opponentRuns),
    hits_allowed: parseIntSafe(stat(oppBatting, ["hits"])),
    earned_runs_allowed: parseIntSafe(stat(pitching, ["earnedRuns", "earned_runs"])),
    walks_allowed: parseIntSafe(stat(pitching, ["baseOnBalls", "walks"])),
    strikeouts_pitched: parseIntSafe(stat(pitching, ["strikeOuts", "strikeouts"])),
    home_runs_allowed: parseIntSafe(stat(pitching, ["homeRuns", "home_runs"])),
    innings_pitched: str(stat(pitching, ["inningsPitched", "innings_pitched"])),
    outs_recorded: parseIntSafe(stat(pitching, ["outs", "outsRecorded", "outs_recorded"])),
    batting_source_path: `boxscore.teams.${side}.teamStats.batting`,
    pitching_source_path: `boxscore.teams.${side}.teamStats.pitching`,
    data_feed_key: SOURCE_KEY,
    source_key: SOURCE_KEY,
    source_endpoint: sourceEndpoint,
    source_season: ymdToSeason(gameDate),
    source_game_type: game.gameType || "R",
    ingestion_mode: "source_shape_probe",
    batch_id: batchId,
    run_id: runId,
    request_id: requestId,
    certification_status: "PROBE_STAGE_ONLY_NOT_PROMOTED",
    certification_grade: "PROBE_ONLY",
    source_confidence: SOURCE_CONFIDENCE,
    source_snapshot_date: sampleDate,
    raw_json: safeJson({ schedule_game: game, boxscore_team: teamBox, opponent_boxscore_team: oppBox })
  };
}

async function insertStageRow(env, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => "?").join(",");
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO team_game_log_stage (${cols.join(",")}) VALUES (${placeholders})`, ...cols.map(c => row[c]));
}
async function insertOutcome(env, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => "?").join(",");
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO team_game_log_outcomes (${cols.join(",")}) VALUES (${placeholders})`, ...cols.map(c => row[c]));
}


function parseJsonSafeText(text, fallback = {}) { try { return JSON.parse(text || "{}"); } catch (_) { return fallback; } }
function dateLeq(a, b) { return String(a || "") <= String(b || ""); }
function dateGte(a, b) { return String(a || "") >= String(b || ""); }

function addDaysYmd(ymd, days) {
  const d = new Date(String(ymd || "").slice(0,10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0,10);
}
function todayUtcYmd() { return new Date().toISOString().slice(0,10); }
async function determineLatestCompleteTeamGameDate(env, startDate, baseUrl) {
  const endDate = todayUtcYmd();
  const endpoint = `${baseUrl}/api/v1/schedule?sportId=1&gameTypes=R&startDate=${startDate}&endDate=${endDate}`;
  const schedule = await fetchJson(endpoint, env);
  if (!schedule.ok) return { ok:false, endpoint, http_status:schedule.http_status, text_preview:schedule.text_preview, start_date:startDate, end_date:endDate, latest_complete_game_date:null, final_game_count:0 };
  let latest = null;
  let finalCount = 0;
  const seen = new Set();
  for (const date of (schedule.json?.dates || [])) {
    for (const game of (date.games || [])) {
      const pk = String(game?.gamePk || "");
      if (!pk || seen.has(pk)) continue;
      seen.add(pk);
      const gd = normalizeDate(game.officialDate || game.gameDate);
      if (String(game.gameType || "") !== "R") continue;
      if (!gameIsFinal(game)) continue;
      if (!dateGte(gd, startDate) || !dateLeq(gd, endDate)) continue;
      finalCount += 1;
      if (!latest || gd > latest) latest = gd;
    }
  }
  return { ok:true, endpoint, start_date:startDate, end_date: endDate, latest_complete_game_date: latest, final_game_count: finalCount };
}
async function getCalendarTeamGameLogsGapPlan(env) {
  const out = {
    ok: false,
    source: "TEAM_DB.mlb_game_data_coverage",
    gaps_available: false,
    missing_game_pks: [],
    missing_games: [],
    min_official_date: null,
    max_official_date: null,
    error: null
  };
  const res = await tryAll(env.TEAM_DB, `
    SELECT game_pk, official_date
    FROM mlb_game_data_coverage
    WHERE layer_key = 'team_game_logs'
      AND coverage_status = 'missing'
      AND blocking_for_full_run = 1
    ORDER BY official_date, game_pk
    LIMIT 500
  `);
  if (!res.ok) {
    out.error = res.error;
    return out;
  }
  const seen = new Set();
  for (const row of res.rows || []) {
    const pk = parseIntSafe(row.game_pk);
    if (!pk || seen.has(String(pk))) continue;
    seen.add(String(pk));
    const officialDate = normalizeDate(row.official_date);
    out.missing_game_pks.push(pk);
    out.missing_games.push({ game_pk: pk, official_date: officialDate });
    if (officialDate && (!out.min_official_date || officialDate < out.min_official_date)) out.min_official_date = officialDate;
    if (officialDate && (!out.max_official_date || officialDate > out.max_official_date)) out.max_official_date = officialDate;
  }
  out.ok = true;
  out.gaps_available = out.missing_game_pks.length > 0;
  return out;
}

async function latestCompletedDeltaBatch(env) {
  return await first(env.TEAM_DB, "SELECT * FROM team_game_log_batches WHERE ingestion_mode='delta_update' AND status='COMPLETED_PROMOTED_STAGE_RETAINED' ORDER BY date(sample_end_date) DESC, datetime(created_at) DESC LIMIT 1");
}
async function retainedDeltaStageTruth(env, batchId) {
  const row = await first(env.TEAM_DB, `SELECT COUNT(*) AS stage_rows, COUNT(DISTINCT team_game_key) AS stage_keys, MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date FROM team_game_log_stage WHERE batch_id=?`, batchId);
  const live = await first(env.TEAM_DB, `SELECT COUNT(*) AS live_rows, COUNT(DISTINCT team_game_key) AS live_keys, MIN(game_date) AS live_min_game_date, MAX(game_date) AS live_max_game_date FROM team_game_logs WHERE batch_id=?`, batchId);
  const missing = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM team_game_log_stage s WHERE s.batch_id=? AND NOT EXISTS (SELECT 1 FROM team_game_logs l WHERE l.team_game_key=s.team_game_key)`, batchId);
  return {
    stage_rows:Number(row?.stage_rows || 0),
    stage_keys:Number(row?.stage_keys || 0),
    live_rows:Number(live?.live_rows || 0),
    live_keys:Number(live?.live_keys || 0),
    min_game_date:row?.min_game_date || null,
    max_game_date:row?.max_game_date || null,
    live_min_game_date:live?.live_min_game_date || null,
    live_max_game_date:live?.live_max_game_date || null,
    missing_live_rows:Number(missing?.c || 0)
  };
}


async function findMissingDeltaStageRows(env, batchId, limit = 4) {
  const res = await env.TEAM_DB.prepare(`
    SELECT
      o.game_pk,
      o.game_date,
      o.season,
      o.team_id,
      o.opponent_team_id,
      o.details_json
    FROM team_game_log_outcomes o
    WHERE o.batch_id=?
      AND o.outcome_level='team_game'
      AND o.team_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM team_game_log_stage s
        WHERE s.batch_id=o.batch_id
          AND s.game_pk=o.game_pk
          AND CAST(s.team_id AS TEXT)=CAST(o.team_id AS TEXT)
      )
    ORDER BY o.game_date, o.game_pk, o.team_id
    LIMIT ?
  `).bind(batchId, limit).all();
  return res.results || [];
}

async function scopedRepairMissingDeltaStageRows(env, { batch, truth, baseUrl, sourceWindow, requestId, chainId, runId }) {
  const batchId = batch.batch_id;
  const expectedRows = Number(batch.expected_team_game_rows || 0);
  const missingStageCount = Math.max(0, expectedRows - Number(truth.stage_rows || 0));
  const missingLiveCount = Math.max(0, expectedRows - Number(truth.live_rows || 0));
  const targets = await findMissingDeltaStageRows(env, batchId, Math.max(1, Math.min(4, missingStageCount || 1)));
  if (!targets.length) {
    return {
      ok:false,
      data_ok:false,
      version:VERSION,
      worker_name:WORKER_NAME,
      job_key:JOB_KEY,
      request_id:requestId,
      chain_id:chainId,
      batch_id:batchId,
      status:"DELTA_TEAM_GAME_LOGS_SCOPED_REPAIR_BLOCKED_NO_OUTCOME_ANCHOR",
      certification:"DELTA_TEAM_GAME_LOGS_SCOPED_REPAIR_BLOCKED_NO_OUTCOME_ANCHOR",
      certification_grade:"DELTA_REPAIR_BLOCKED",
      missing_stage_rows:missingStageCount,
      missing_live_rows:missingLiveCount,
      retained_restore_rows_available:Number(truth.missing_live_rows || 0),
      rows_read:0,
      rows_written:0,
      rows_promoted:0,
      external_calls_performed:1,
      no_full_sweep:true,
      source_final_date_check:sourceWindow
    };
  }

  let externalCalls = 1; // the final-date probe already happened before this repair gate
  let rowsWritten = 0;
  let scopedGamesRefetched = 0;
  const repairedKeys = [];
  for (const t of targets) {
    const gamePk = parseIntSafe(t.game_pk);
    const targetTeamId = String(t.team_id || "");
    const details = parseJsonSafeText(t.details_json, {});
    const boxscoreEndpoint = `${baseUrl}/api/v1/game/${gamePk}/boxscore`;
    const fetched = await fetchJson(boxscoreEndpoint, env);
    externalCalls += 1;
    if (!fetched.ok) {
      await insertOutcome(env, {
        outcome_id:`${batchId}_${gamePk}_${targetTeamId}_scoped_repair_source_error`,
        batch_id:batchId,
        run_id:runId,
        request_id:requestId,
        game_pk:gamePk,
        game_date:t.game_date,
        season:ymdToSeason(t.game_date),
        team_id:targetTeamId,
        opponent_team_id:t.opponent_team_id == null ? null : String(t.opponent_team_id),
        outcome_level:"team_game",
        outcome_category:"GAME_SOURCE_ERROR",
        status:"SCOPED_REPAIR_BOXSCORE_FETCH_FAILED",
        reason:"Scoped team game log repair could not fetch MLB boxscore for missing retained stage/live row.",
        source_endpoint:boxscoreEndpoint,
        source_key:SOURCE_KEY,
        source_confidence:SOURCE_CONFIDENCE,
        source_snapshot_date:sourceWindow?.latest_complete_game_date || t.game_date,
        details_json:safeJson({ http_status:fetched.http_status, text_preview:fetched.text_preview })
      });
      continue;
    }
    scopedGamesRefetched += 1;
    const homeTeam = fetched.json?.teams?.home?.team || {};
    const awayTeam = fetched.json?.teams?.away?.team || {};
    const schedulePair = {
      home_team_id:parseIntSafe(homeTeam.id),
      home_team_name:homeTeam.name || null,
      away_team_id:parseIntSafe(awayTeam.id),
      away_team_name:awayTeam.name || null
    };
    let side = null;
    if (String(homeTeam.id || "") === targetTeamId) side = "home";
    if (String(awayTeam.id || "") === targetTeamId) side = "away";
    if (!side && details && details.is_home !== undefined) side = Number(details.is_home) === 1 ? "home" : "away";
    if (!side) {
      await insertOutcome(env, {
        outcome_id:`${batchId}_${gamePk}_${targetTeamId}_scoped_repair_unclear_side`,
        batch_id:batchId,
        run_id:runId,
        request_id:requestId,
        game_pk:gamePk,
        game_date:t.game_date,
        season:ymdToSeason(t.game_date),
        team_id:targetTeamId,
        opponent_team_id:t.opponent_team_id == null ? null : String(t.opponent_team_id),
        outcome_level:"team_game",
        outcome_category:"GAME_UNCLEAR",
        status:"SCOPED_REPAIR_TEAM_SIDE_UNCLEAR",
        reason:"Scoped team game log repair could not determine whether missing team row was home or away.",
        source_endpoint:boxscoreEndpoint,
        source_key:SOURCE_KEY,
        source_confidence:SOURCE_CONFIDENCE,
        source_snapshot_date:sourceWindow?.latest_complete_game_date || t.game_date,
        details_json:safeJson({ home_team:homeTeam, away_team:awayTeam, target_team_id:targetTeamId, prior_details:details })
      });
      continue;
    }
    const game = {
      gamePk,
      officialDate:t.game_date,
      gameDate:t.game_date,
      gameType:"R",
      status:{ detailedState:"Final", abstractGameState:"Final", codedGameState:"F" },
      teams:{ home:{ team:homeTeam }, away:{ team:awayTeam } }
    };
    const row = buildTeamRow({ side, game, boxscore:fetched.json, schedulePair, batchId, runId, requestId, sourceEndpoint:boxscoreEndpoint, sampleDate:t.game_date });
    row.ingestion_mode = "delta_update";
    row.certification_status = "DELTA_SCOPED_REPAIR_STAGE_READY_FOR_PROMOTION";
    row.certification_grade = "DELTA_REPAIR_PASS";
    row.source_confidence = SOURCE_CONFIDENCE;
    row.source_snapshot_date = sourceWindow?.latest_complete_game_date || t.game_date;
    await insertStageRow(env, row);
    await insertOutcome(env, {
      outcome_id:`${batchId}_${row.game_pk}_${row.team_id}`,
      batch_id:batchId,
      run_id:runId,
      request_id:requestId,
      game_pk:row.game_pk,
      game_date:row.game_date,
      season:row.season,
      team_id:row.team_id,
      opponent_team_id:row.opponent_team_id,
      outcome_level:"team_game",
      outcome_category:"PROMOTED_ROWS",
      status:"SCOPED_REPAIR_STAGE_REWRITTEN_FOR_PROMOTION",
      reason:"Scoped source repair rewrote one missing retained-stage/live team-game key without a full sweep.",
      source_endpoint:boxscoreEndpoint,
      source_key:SOURCE_KEY,
      source_confidence:SOURCE_CONFIDENCE,
      source_snapshot_date:row.source_snapshot_date,
      details_json:safeJson({ team_game_key:row.team_game_key, is_home:row.is_home, scoped_repair:true })
    });
    rowsWritten += 2;
    repairedKeys.push(row.team_game_key);
  }

  const beforeLive = Number(truth.live_rows || 0);
  await promoteTeamStageRows(env, batchId, "DELTA_TEAM_GAME_LOGS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED", "DELTA_REPAIR_PASS", true);
  const afterTruth = await retainedDeltaStageTruth(env, batchId);
  const promotedRows = Math.max(0, afterTruth.live_rows - beforeLive);
  await run(env.TEAM_DB,
    "UPDATE team_game_log_batches SET version=?, status='COMPLETED_PROMOTED_STAGE_RETAINED', certification_status='DELTA_TEAM_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', staged_team_game_rows=?, rows_promoted=MAX(rows_promoted, ?), output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
    VERSION,
    afterTruth.stage_rows,
    afterTruth.live_rows,
    safeJson({ scoped_repair:true, repaired_keys:repairedKeys, missing_stage_rows_before:missingStageCount, missing_live_rows_before:missingLiveCount, retained_stage_rows_after:afterTruth.stage_rows, live_rows_after:afterTruth.live_rows, source_final_date_check:sourceWindow }),
    batchId
  );
  return {
    ok:true,
    data_ok:true,
    version:VERSION,
    worker_name:WORKER_NAME,
    job_key:JOB_KEY,
    request_id:requestId,
    chain_id:chainId,
    batch_id:batchId,
    status:"DELTA_TEAM_GAME_LOGS_SCOPED_REPAIR_COMPLETED",
    certification:"DELTA_TEAM_GAME_LOGS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED",
    certification_grade:"DELTA_REPAIR_PASS",
    missing_live_rows_detected:missingLiveCount,
    missing_stage_rows_detected:missingStageCount,
    retained_restore_rows_available:Number(truth.missing_live_rows || 0),
    scoped_team_game_keys_to_refetch:targets.length,
    scoped_games_refetched:scopedGamesRefetched,
    repaired_keys:repairedKeys,
    rows_read:targets.length,
    rows_written:rowsWritten + promotedRows + 1,
    rows_staged:afterTruth.stage_rows,
    rows_promoted:promotedRows,
    external_calls_performed:externalCalls,
    no_full_sweep:true,
    no_new_batch:true,
    stage_retained:true,
    live_rows_after:afterTruth.live_rows,
    retained_stage_rows_after:afterTruth.stage_rows,
    missing_stage_rows_after:Math.max(0, expectedRows - afterTruth.stage_rows),
    missing_live_rows_after:Math.max(0, expectedRows - afterTruth.live_rows),
    source_final_date_check:sourceWindow
  };
}


async function initializeBaseBackfill(env, input, requestId, chainId, runId, startDate, cutoffDate, season, baseUrl) {
  const batchId = rid("team_game_logs_base_backfill_batch");
  const scheduleEndpoint = `${baseUrl}/api/v1/schedule?sportId=1&gameTypes=R&startDate=${startDate}&endDate=${cutoffDate}`;
  const liveBefore = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_logs");
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_log_batches (batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type, base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, status, certification_status, certification_grade, output_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'base_backfill', 0, ?, ?, ?, 'R', ?, ?, ?, ?, 'BASE_BACKFILL_RUNNING', 'BASE_BACKFILL_RUNNING', 'BASE_PENDING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, cutoffDate, DEFAULT_DELTA_START_DATE, startDate, cutoffDate,
    safeJson({ schedule_endpoint: scheduleEndpoint, live_count_before: Number(liveBefore?.c || 0), base_backfill_cutoff_date: cutoffDate, delta_reserved_start_date: DEFAULT_DELTA_START_DATE })
  );

  let externalCalls = 0;
  const schedule = await fetchJson(scheduleEndpoint, env); externalCalls += 1;
  if (!schedule.ok) {
    await run(env.TEAM_DB, "UPDATE team_game_log_batches SET status='SOURCE_ERROR', certification_status='BASE_TEAM_GAME_LOGS_SCHEDULE_SOURCE_ERROR', source_error_count=1, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", safeJson({ schedule_endpoint: scheduleEndpoint, schedule_http_status: schedule.http_status, schedule_text_preview: schedule.text_preview }), batchId);
    await run(env.TEAM_DB,
      `INSERT OR REPLACE INTO team_game_log_cursor (cursor_key, ingestion_mode, source_key, source_season, source_game_type, base_backfill_cutoff_date, delta_reserved_start_date, last_batch_id, last_request_id, status, cursor_json, created_at, updated_at)
       VALUES (?, 'base_backfill', ?, ?, 'R', ?, ?, ?, ?, 'SOURCE_ERROR', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      BASE_CURSOR_KEY, SOURCE_KEY, season, cutoffDate, DEFAULT_DELTA_START_DATE, batchId, requestId, safeJson({ schedule_endpoint: scheduleEndpoint, schedule_http_status: schedule.http_status })
    );
    return { ok: false, data_ok: false, initialized: false, batch_id: batchId, external_calls_performed: externalCalls, status: "SOURCE_ERROR_SCHEDULE_FETCH_FAILED", certification: "BASE_TEAM_GAME_LOGS_SCHEDULE_SOURCE_ERROR", rows_read: 0, rows_written: 1, rows_promoted: 0 };
  }

  const allGames = [];
  for (const date of (schedule.json?.dates || [])) for (const game of (date.games || [])) allGames.push(game);
  const finalGamesRaw = allGames.filter(g => String(g.gameType || "") === "R" && gameIsFinal(g) && dateGte(normalizeDate(g.officialDate || g.gameDate), startDate) && dateLeq(normalizeDate(g.officialDate || g.gameDate), cutoffDate));
  // MLB schedule date-range responses can include duplicate gamePk rows for special/suspended/resumed listings.
  // Team game logs are keyed by game_pk + team_id, so the certifiable universe must be DISTINCT game_pk.
  const seenGamePks = new Set();
  const finalGames = [];
  for (const g of finalGamesRaw) {
    const pk = String(g?.gamePk || "");
    if (!pk || seenGamePks.has(pk)) continue;
    seenGamePks.add(pk);
    finalGames.push(g);
  }
  let written = 0;
  for (const game of finalGames) {
    const gameDate = normalizeDate(game.officialDate || game.gameDate);
    await insertOutcome(env, {
      outcome_id: `${batchId}_${game.gamePk}_game`, batch_id: batchId, run_id: runId, request_id: requestId,
      game_pk: parseIntSafe(game.gamePk), game_date: gameDate, season: ymdToSeason(gameDate), team_id: null, opponent_team_id: null,
      outcome_level: "game", outcome_category: "GAME_PENDING_BOXSCORE", status: "PENDING_BOXSCORE_STAGE",
      reason: "Completed final regular-season game inside base cutoff queued for team boxscore staging.",
      source_endpoint: scheduleEndpoint, source_key: SOURCE_KEY, source_confidence: SOURCE_CONFIDENCE, source_snapshot_date: cutoffDate,
      details_json: safeJson({ game })
    });
    written += 1;
  }
  await run(env.TEAM_DB,
    `UPDATE team_game_log_batches SET expected_game_count=?, expected_team_game_rows=?, staged_team_game_rows=0, rows_promoted=0, status='BASE_BACKFILL_RUNNING', certification_status='BASE_BACKFILL_RUNNING', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    finalGames.length, finalGames.length * 2, safeJson({ schedule_endpoint: scheduleEndpoint, games_read: allGames.length, final_regular_season_games_raw_through_cutoff: finalGamesRaw.length, distinct_final_regular_season_games_through_cutoff: finalGames.length, duplicate_schedule_game_rows_filtered: Math.max(0, finalGamesRaw.length - finalGames.length), expected_team_game_rows: finalGames.length * 2, live_count_before: Number(liveBefore?.c || 0) }), batchId
  );
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_log_cursor (cursor_key, ingestion_mode, source_key, source_season, source_game_type, base_backfill_cutoff_date, delta_reserved_start_date, last_batch_id, last_request_id, status, cursor_json, created_at, updated_at)
     VALUES (?, 'base_backfill', ?, ?, 'R', ?, ?, ?, ?, 'BASE_BACKFILL_RUNNING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    BASE_CURSOR_KEY, SOURCE_KEY, season, cutoffDate, DEFAULT_DELTA_START_DATE, batchId, requestId, safeJson({ start_date: startDate, cutoff_date: cutoffDate, schedule_endpoint: scheduleEndpoint, expected_game_count: finalGames.length, expected_team_game_rows: finalGames.length * 2, duplicate_schedule_game_rows_filtered: Math.max(0, finalGamesRaw.length - finalGames.length), games_per_tick: DEFAULT_GAMES_PER_TICK })
  );
  return { ok: true, data_ok: true, initialized: true, batch_id: batchId, external_calls_performed: externalCalls, rows_read: allGames.length, rows_written: written + 2, expected_game_count: finalGames.length, expected_team_game_rows: finalGames.length * 2 };
}

async function certifyAndPromoteBaseBackfill(env, batchId, runId, requestId, cutoffDate, externalCallsSoFar, rowsWrittenSoFar) {
  const batch = await first(env.TEAM_DB, "SELECT * FROM team_game_log_batches WHERE batch_id=?", batchId);
  // Certification derives expected volume from distinct game-level outcome truth, not raw schedule row count.
  // This lets failed v0.2.0 batches recover when the date-range schedule contained duplicate gamePk entries.
  const expectedTruth = await first(env.TEAM_DB, "SELECT COUNT(DISTINCT game_pk) AS games FROM team_game_log_outcomes WHERE batch_id=? AND outcome_level='game'", batchId);
  const expectedGames = Number(expectedTruth?.games || batch?.expected_game_count || 0);
  const expectedRows = expectedGames * 2;
  const staged = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_stage WHERE batch_id=?", batchId);
  const dup = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM (SELECT game_pk, team_id, COUNT(*) AS n FROM team_game_log_stage WHERE batch_id=? GROUP BY game_pk, team_id HAVING n>1)", batchId);
  const missing = await first(env.TEAM_DB, "SELECT SUM(CASE WHEN game_pk IS NULL THEN 1 ELSE 0 END) AS missing_game_pk, SUM(CASE WHEN game_date IS NULL OR game_date='' THEN 1 ELSE 0 END) AS missing_game_date, SUM(CASE WHEN team_id IS NULL OR team_id='' THEN 1 ELSE 0 END) AS missing_team_id, SUM(CASE WHEN opponent_team_id IS NULL OR opponent_team_id='' THEN 1 ELSE 0 END) AS missing_opponent_team_id, SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS raw_json_missing, SUM(CASE WHEN game_date > ? THEN 1 ELSE 0 END) AS after_cutoff_rows, SUM(CASE WHEN game_status IS NULL OR NOT (lower(trim(game_status)) LIKE '%final%' OR lower(trim(game_status)) LIKE '%game over%' OR lower(trim(game_status)) LIKE '%completed%') THEN 1 ELSE 0 END) AS non_final_rows FROM team_game_log_stage WHERE batch_id=?", cutoffDate, batchId);
  const sourceErrors = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_outcomes WHERE batch_id=? AND outcome_category IN ('GAME_SOURCE_ERROR','SOURCE_ERROR')", batchId);
  const badPairs = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM (
    SELECT game_pk,
      COUNT(*) AS row_count,
      SUM(CASE WHEN is_home=1 THEN 1 ELSE 0 END) AS home_rows,
      SUM(CASE WHEN is_home=0 THEN 1 ELSE 0 END) AS away_rows,
      COUNT(DISTINCT team_id) AS distinct_teams,
      COUNT(DISTINCT opponent_team_id) AS distinct_opponents
    FROM team_game_log_stage WHERE batch_id=? GROUP BY game_pk
    HAVING row_count != 2 OR home_rows != 1 OR away_rows != 1 OR distinct_teams != 2 OR distinct_opponents != 2
  )`, batchId);
  const stagedRows = Number(staged?.c || 0);
  const pass = expectedGames > 0 && stagedRows === expectedRows && Number(dup?.c || 0) === 0 && Number(sourceErrors?.c || 0) === 0 && Number(badPairs?.c || 0) === 0 && Number(missing?.missing_game_pk || 0) === 0 && Number(missing?.missing_game_date || 0) === 0 && Number(missing?.missing_team_id || 0) === 0 && Number(missing?.missing_opponent_team_id || 0) === 0 && Number(missing?.after_cutoff_rows || 0) === 0 && Number(missing?.non_final_rows || 0) === 0;
  const certification = pass ? "BASE_TEAM_GAME_LOGS_BASE_BACKFILL_CERTIFIED" : "BASE_TEAM_GAME_LOGS_BASE_BACKFILL_CERTIFICATION_FAILED";
  const grade = pass ? "BASE_PASS" : "BASE_FAIL";
  const fieldMap = {
    schedule_endpoint: "/api/v1/schedule?sportId=1&gameTypes=R&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD",
    boxscore_endpoint: "/api/v1/game/{gamePk}/boxscore",
    team_batting_source_path: "boxscore.teams.{home|away}.teamStats.batting",
    team_pitching_source_path: "boxscore.teams.{home|away}.teamStats.pitching",
    live_key: "team_game_key = game_pk + '_' + team_id",
    expected_rows_rule: "completed_final_regular_season_games * 2"
  };
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_log_certifications (certification_id, batch_id, run_id, request_id, certification_status, certification_grade, expected_game_count, expected_team_game_rows, staged_team_game_rows, rows_promoted, duplicate_stage_keys, non_final_games, source_error_count, repair_required_count, unclear_count, missing_game_pk, missing_game_date, missing_team_id, missing_opponent_team_id, bad_home_away_pair_count, raw_json_missing, lineage_missing_count, source_field_map_json, details_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    `${batchId}_base_cert`, batchId, runId, requestId, certification, grade, expectedGames, expectedRows, stagedRows, Number(dup?.c || 0), Number(missing?.non_final_rows || 0), Number(sourceErrors?.c || 0), Number(missing?.missing_game_pk || 0), Number(missing?.missing_game_date || 0), Number(missing?.missing_team_id || 0), Number(missing?.missing_opponent_team_id || 0), Number(badPairs?.c || 0), Number(missing?.raw_json_missing || 0), safeJson(fieldMap), safeJson({ cutoff_date: cutoffDate, after_cutoff_rows: Number(missing?.after_cutoff_rows || 0), pass })
  );
  if (!pass) {
    await run(env.TEAM_DB, "UPDATE team_game_log_batches SET version=?, status='CERTIFICATION_FAILED', certification_status=?, certification_grade=?, expected_game_count=?, expected_team_game_rows=?, staged_team_game_rows=?, duplicate_stage_keys=?, source_error_count=?, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP WHERE batch_id=?", VERSION, certification, grade, expectedGames, expectedRows, stagedRows, Number(dup?.c || 0), Number(sourceErrors?.c || 0), safeJson({ expected_game_count: expectedGames, expected_team_game_rows: expectedRows, staged_team_game_rows: stagedRows, duplicate_stage_keys: Number(dup?.c || 0), source_error_count: Number(sourceErrors?.c || 0), bad_home_away_pair_count: Number(badPairs?.c || 0), missing, terminal_status_fix_v0_2_2: true }), batchId);
    await run(env.TEAM_DB, "UPDATE team_game_log_cursor SET status='CERTIFICATION_FAILED', cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", safeJson({ batch_id: batchId, certification, grade }), BASE_CURSOR_KEY);
    return { ok: false, data_ok: false, status: "CERTIFICATION_FAILED", certification, certification_grade: grade, rows_read: 0, rows_written: rowsWrittenSoFar + 1, rows_promoted: 0, external_calls_performed: externalCallsSoFar, continuation_required: false };
  }
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_logs (
      team_game_key, game_pk, season, game_date, team_id, opponent_team_id, is_home,
      runs, hits, errors, plate_appearances, at_bats, walks, strikeouts, home_runs,
      raw_json, source_key, updated_at, data_feed_key, source_endpoint, source_season, source_game_type,
      ingestion_mode, batch_id, run_id, certification_status, certification_grade, source_confidence,
      certified_at, promoted_at, created_at, source_snapshot_date, game_status, venue_id, doubles, triples,
      stolen_bases, left_on_base, total_bases, rbi, runs_allowed, hits_allowed, earned_runs_allowed,
      walks_allowed, strikeouts_pitched, home_runs_allowed, innings_pitched, outs_recorded
    )
    SELECT
      team_game_key, game_pk, season, game_date, team_id, opponent_team_id, is_home,
      runs, hits, errors, plate_appearances, at_bats, walks, strikeouts, home_runs,
      raw_json, source_key, CURRENT_TIMESTAMP, data_feed_key, source_endpoint, source_season, source_game_type,
      ingestion_mode, batch_id, run_id, ?, ?, source_confidence,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE(created_at, CURRENT_TIMESTAMP), source_snapshot_date, game_status, venue_id, doubles, triples,
      stolen_bases, left_on_base, total_bases, rbi, runs_allowed, hits_allowed, earned_runs_allowed,
      walks_allowed, strikeouts_pitched, home_runs_allowed, innings_pitched, outs_recorded
    FROM team_game_log_stage WHERE batch_id=?`,
    certification, grade, batchId
  );
  const liveRows = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_logs WHERE batch_id=?", batchId);
  const rowsPromoted = Number(liveRows?.c || 0);
  if (rowsPromoted !== expectedRows) {
    await run(env.TEAM_DB, "UPDATE team_game_log_batches SET status='PROMOTION_VERIFY_FAILED', rows_promoted=?, certification_status='BASE_TEAM_GAME_LOGS_PROMOTION_VERIFY_FAILED', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromoted, safeJson({ expectedRows, rowsPromoted }), batchId);
    return { ok: false, data_ok: false, status: "PROMOTION_VERIFY_FAILED", certification: "BASE_TEAM_GAME_LOGS_PROMOTION_VERIFY_FAILED", rows_promoted: rowsPromoted, external_calls_performed: externalCallsSoFar, rows_written: rowsWrittenSoFar + rowsPromoted };
  }
  await run(env.TEAM_DB, "UPDATE team_game_log_certifications SET rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE certification_id=?", rowsPromoted, `${batchId}_base_cert`);
  await run(env.TEAM_DB, "DELETE FROM team_game_log_stage WHERE batch_id=?", batchId);
  const stageAfter = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_stage WHERE batch_id=?", batchId);
  await run(env.TEAM_DB, "UPDATE team_game_log_batches SET version=?, status='COMPLETED_PROMOTED_CLEANED', certification_status=?, certification_grade=?, expected_game_count=?, expected_team_game_rows=?, staged_team_game_rows=?, rows_promoted=?, duplicate_stage_keys=0, source_error_count=0, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=COALESCE(certified_at,CURRENT_TIMESTAMP), promoted_at=CURRENT_TIMESTAMP, cleaned_at=CURRENT_TIMESTAMP WHERE batch_id=?", VERSION, certification, grade, expectedGames, expectedRows, stagedRows, rowsPromoted, safeJson({ expected_game_count: expectedGames, expected_team_game_rows: expectedRows, rows_promoted: rowsPromoted, stage_rows_after_clean: Number(stageAfter?.c || 0), delta_reserved_start_date: DEFAULT_DELTA_START_DATE }), batchId);
  await run(env.TEAM_DB, "UPDATE team_game_log_cursor SET status='COMPLETED_PROMOTED_CLEANED', last_batch_id=?, last_request_id=?, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", batchId, requestId, safeJson({ batch_id: batchId, cutoff_date: cutoffDate, expected_game_count: expectedGames, expected_team_game_rows: expectedRows, rows_promoted: rowsPromoted, stage_rows_after_clean: Number(stageAfter?.c || 0), delta_reserved_start_date: DEFAULT_DELTA_START_DATE }), BASE_CURSOR_KEY);
  return { ok: true, data_ok: true, status: "COMPLETED_PROMOTED_CLEANED", certification, certification_grade: grade, rows_read: expectedGames, rows_written: rowsWrittenSoFar + rowsPromoted + 3, rows_promoted: rowsPromoted, external_calls_performed: externalCallsSoFar, expected_game_count: expectedGames, expected_team_game_rows: expectedRows, staged_team_game_rows: stagedRows, stage_rows_after_clean: Number(stageAfter?.c || 0), duplicate_stage_keys: Number(dup?.c || 0), bad_home_away_pair_count: Number(badPairs?.c || 0), continuation_required: false };
}

async function runBaseBackfill(env, input) {
  if (!env.TEAM_DB) return { ok: false, data_ok: false, status: "blocked_missing_team_db_binding", certification: "TEAM_DB_BINDING_MISSING" };
  const schema = await ensureSchema(env);
  const requestId = input.request_id || rid("team_logs_base_req");
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid("team_logs_base_run");
  const inputJson = input.input_json || input || {};
  const startDate = String(inputJson.base_backfill_start_date || DEFAULT_BASE_START_DATE).slice(0, 10);
  const cutoffDate = String(inputJson.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF_DATE).slice(0, 10);
  const season = ymdToSeason(cutoffDate);
  const baseUrl = getBaseUrl(env);
  let externalCalls = 0;
  let rowsWritten = 0;

  let cursor = await first(env.TEAM_DB, "SELECT * FROM team_game_log_cursor WHERE cursor_key=?", BASE_CURSOR_KEY);
  if (cursor && cursor.status === "COMPLETED_PROMOTED_CLEANED") {
    const batchIdDone = cursor.last_batch_id;
    const batchDone = await first(env.TEAM_DB, "SELECT * FROM team_game_log_batches WHERE batch_id=?", batchIdDone);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, batch_id: batchIdDone, status: "BASE_TEAM_GAME_LOGS_ALREADY_COMPLETED_NOOP", certification: batchDone?.certification_status || "BASE_TEAM_GAME_LOGS_ALREADY_COMPLETED", certification_grade: batchDone?.certification_grade || "BASE_PASS", rows_read: 0, rows_written: 0, rows_promoted: Number(batchDone?.rows_promoted || 0), external_calls_performed: 0, no_full_sweep: true, no_live_mutation: true, delta_reserved_start_date: DEFAULT_DELTA_START_DATE };
  }
  if (!cursor || !cursor.last_batch_id || !["BASE_BACKFILL_RUNNING", "PARTIAL_CONTINUE_BASE_TEAM_GAME_LOGS", "CERTIFICATION_FAILED", "SOURCE_ERROR"].includes(String(cursor.status || ""))) {
    const init = await initializeBaseBackfill(env, input, requestId, chainId, runId, startDate, cutoffDate, season, baseUrl);
    externalCalls += init.external_calls_performed || 0;
    rowsWritten += init.rows_written || 0;
    if (!init.ok) return { ...init, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, no_hitter_game_log_mutation: true, no_pitcher_game_log_mutation: true, no_splits_mutation: true, no_prizepicks_mutation: true, no_sleeper_mutation: true, no_scoring: true, no_ranking: true, no_browser_pump: true };
    cursor = await first(env.TEAM_DB, "SELECT * FROM team_game_log_cursor WHERE cursor_key=?", BASE_CURSOR_KEY);
  }
  const batchId = cursor.last_batch_id;
  const gamesPerTick = Math.max(1, Math.min(45, Number(inputJson.games_per_tick || DEFAULT_GAMES_PER_TICK)));
  const pending = await all(env.TEAM_DB, "SELECT outcome_id, game_pk, game_date, details_json FROM team_game_log_outcomes WHERE batch_id=? AND outcome_level='game' AND status='PENDING_BOXSCORE_STAGE' ORDER BY game_date, game_pk LIMIT ?", batchId, gamesPerTick);
  for (const g of pending) {
    const details = parseJsonSafeText(g.details_json, {});
    const game = details.game || { gamePk: g.game_pk, officialDate: g.game_date, teams: {} };
    const boxscoreEndpoint = `${baseUrl}/api/v1/game/${g.game_pk}/boxscore`;
    const fetchedBoxscore = await fetchJson(boxscoreEndpoint, env); externalCalls += 1;
    if (!fetchedBoxscore.ok) {
      await run(env.TEAM_DB, "UPDATE team_game_log_outcomes SET outcome_category='GAME_SOURCE_ERROR', status='SOURCE_ERROR_BOXSCORE_FETCH_FAILED', reason='Boxscore fetch failed during base_backfill', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE outcome_id=?", boxscoreEndpoint, safeJson({ game, boxscore_http_status: fetchedBoxscore.http_status, text_preview: fetchedBoxscore.text_preview }), g.outcome_id);
      rowsWritten += 1;
      continue;
    }
    const pair = getTeamPairFromSchedule(game);
    const rows = [
      buildTeamRow({ side: "away", game, boxscore: fetchedBoxscore.json, schedulePair: pair, batchId, runId, requestId, sourceEndpoint: boxscoreEndpoint, sampleDate: g.game_date }),
      buildTeamRow({ side: "home", game, boxscore: fetchedBoxscore.json, schedulePair: pair, batchId, runId, requestId, sourceEndpoint: boxscoreEndpoint, sampleDate: g.game_date })
    ];
    for (const r of rows) {
      r.ingestion_mode = "base_backfill";
      r.certification_status = "BASE_STAGE_READY_FOR_CERTIFICATION";
      r.certification_grade = null;
      r.source_confidence = SOURCE_CONFIDENCE;
      r.source_snapshot_date = cutoffDate;
      await insertStageRow(env, r);
      await insertOutcome(env, {
        outcome_id: `${batchId}_${r.game_pk}_${r.team_id}`, batch_id: batchId, run_id: runId, request_id: requestId,
        game_pk: r.game_pk, game_date: r.game_date, season: r.season, team_id: r.team_id, opponent_team_id: r.opponent_team_id,
        outcome_level: "team_game", outcome_category: "PROMOTED_ROWS", status: "STAGED_FOR_BASE_PROMOTION",
        reason: "Team row staged during base_backfill through cutoff; pending certification/promotion.",
        source_endpoint: boxscoreEndpoint, source_key: SOURCE_KEY, source_confidence: SOURCE_CONFIDENCE, source_snapshot_date: cutoffDate,
        details_json: safeJson({ team_game_key: r.team_game_key, is_home: r.is_home, batting_source_path: r.batting_source_path, pitching_source_path: r.pitching_source_path })
      });
    }
    await run(env.TEAM_DB, "UPDATE team_game_log_outcomes SET outcome_category='GAME_PROMOTED', status='STAGED_TEAM_ROWS', reason='Final regular-season game staged with exactly two team rows', source_endpoint=?, updated_at=CURRENT_TIMESTAMP WHERE outcome_id=?", boxscoreEndpoint, g.outcome_id);
    rowsWritten += 4;
  }
  const remaining = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_outcomes WHERE batch_id=? AND outcome_level='game' AND status='PENDING_BOXSCORE_STAGE'", batchId);
  const stagedNow = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_stage WHERE batch_id=?", batchId);
  const sourceErrorsNow = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_outcomes WHERE batch_id=? AND outcome_category='GAME_SOURCE_ERROR'", batchId);
  await run(env.TEAM_DB, "UPDATE team_game_log_batches SET staged_team_game_rows=?, source_error_count=?, status=?, certification_status=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", Number(stagedNow?.c || 0), Number(sourceErrorsNow?.c || 0), Number(remaining?.c || 0) > 0 ? "PARTIAL_CONTINUE_BASE_TEAM_GAME_LOGS" : "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION", Number(remaining?.c || 0) > 0 ? "BASE_BACKFILL_PARTIAL_CONTINUE" : "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION", safeJson({ remaining_games: Number(remaining?.c || 0), staged_team_game_rows: Number(stagedNow?.c || 0), games_processed_this_tick: pending.length, external_calls_this_tick: externalCalls }), batchId);
  await run(env.TEAM_DB, "UPDATE team_game_log_cursor SET status=?, last_batch_id=?, last_request_id=?, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", Number(remaining?.c || 0) > 0 ? "PARTIAL_CONTINUE_BASE_TEAM_GAME_LOGS" : "BASE_BACKFILL_STAGED_READY_FOR_CERTIFICATION", batchId, requestId, safeJson({ remaining_games: Number(remaining?.c || 0), staged_team_game_rows: Number(stagedNow?.c || 0), cutoff_date: cutoffDate, games_per_tick: gamesPerTick }), BASE_CURSOR_KEY);
  if (Number(remaining?.c || 0) > 0) {
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, status: "partial_continue_base_team_game_logs", certification: "BASE_TEAM_GAME_LOGS_PARTIAL_CONTINUE", certification_grade: "BASE_RUNNING", rows_read: pending.length, rows_written: rowsWritten + 2, rows_promoted: 0, external_calls_performed: externalCalls, continuation_required: true, orchestrator_should_self_continue: true, remaining_games: Number(remaining?.c || 0), staged_team_game_rows: Number(stagedNow?.c || 0), no_browser_pump: true, no_hitter_game_log_mutation: true, no_pitcher_game_log_mutation: true, no_splits_mutation: true, no_prizepicks_mutation: true, no_sleeper_mutation: true, no_scoring: true, no_ranking: true };
  }
  const cert = await certifyAndPromoteBaseBackfill(env, batchId, runId, requestId, cutoffDate, externalCalls, rowsWritten);
  return { ...cert, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, run_id: runId, batch_id: batchId, base_backfill_cutoff_date: cutoffDate, delta_reserved_start_date: DEFAULT_DELTA_START_DATE, no_browser_pump: true, no_hitter_game_log_mutation: true, no_pitcher_game_log_mutation: true, no_splits_mutation: true, no_prizepicks_mutation: true, no_sleeper_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true };
}


async function promoteTeamStageRows(env, batchId, certification, grade, onlyMissing = false) {
  const whereMissing = onlyMissing ? " AND NOT EXISTS (SELECT 1 FROM team_game_logs l WHERE l.team_game_key = team_game_log_stage.team_game_key)" : "";
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_logs (
      team_game_key, game_pk, season, game_date, team_id, opponent_team_id, is_home,
      runs, hits, errors, plate_appearances, at_bats, walks, strikeouts, home_runs,
      raw_json, source_key, updated_at, data_feed_key, source_endpoint, source_season, source_game_type,
      ingestion_mode, batch_id, run_id, certification_status, certification_grade, source_confidence,
      certified_at, promoted_at, created_at, source_snapshot_date, game_status, venue_id, doubles, triples,
      stolen_bases, left_on_base, total_bases, rbi, runs_allowed, hits_allowed, earned_runs_allowed,
      walks_allowed, strikeouts_pitched, home_runs_allowed, innings_pitched, outs_recorded
    )
    SELECT
      team_game_key, game_pk, season, game_date, team_id, opponent_team_id, is_home,
      runs, hits, errors, plate_appearances, at_bats, walks, strikeouts, home_runs,
      raw_json, source_key, CURRENT_TIMESTAMP, data_feed_key, source_endpoint, source_season, source_game_type,
      ingestion_mode, batch_id, run_id, ?, ?, source_confidence,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE(created_at, CURRENT_TIMESTAMP), source_snapshot_date, game_status, venue_id, doubles, triples,
      stolen_bases, left_on_base, total_bases, rbi, runs_allowed, hits_allowed, earned_runs_allowed,
      walks_allowed, strikeouts_pitched, home_runs_allowed, innings_pitched, outs_recorded
    FROM team_game_log_stage WHERE batch_id=?${whereMissing}`,
    certification, grade, batchId
  );
  const liveRows = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_logs WHERE batch_id=?", batchId);
  return Number(liveRows?.c || 0);
}

async function certifyDeltaBatch(env, batchId, runId, requestId, deltaStart, deltaEnd, externalCallsSoFar, rowsWrittenSoFar) {
  const expectedTruth = await first(env.TEAM_DB, "SELECT COUNT(DISTINCT game_pk) AS games FROM team_game_log_outcomes WHERE batch_id=? AND outcome_level='game'", batchId);
  const expectedGames = Number(expectedTruth?.games || 0);
  const expectedRows = expectedGames * 2;
  const staged = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_stage WHERE batch_id=?", batchId);
  const dup = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM (SELECT game_pk, team_id, COUNT(*) AS n FROM team_game_log_stage WHERE batch_id=? GROUP BY game_pk, team_id HAVING n>1)", batchId);
  const missing = await first(env.TEAM_DB, "SELECT SUM(CASE WHEN game_pk IS NULL THEN 1 ELSE 0 END) AS missing_game_pk, SUM(CASE WHEN game_date IS NULL OR game_date='' THEN 1 ELSE 0 END) AS missing_game_date, SUM(CASE WHEN team_id IS NULL OR team_id='' THEN 1 ELSE 0 END) AS missing_team_id, SUM(CASE WHEN opponent_team_id IS NULL OR opponent_team_id='' THEN 1 ELSE 0 END) AS missing_opponent_team_id, SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS raw_json_missing, SUM(CASE WHEN game_date < ? OR game_date > ? THEN 1 ELSE 0 END) AS outside_window_rows, SUM(CASE WHEN game_status IS NULL OR NOT (lower(trim(game_status)) LIKE '%final%' OR lower(trim(game_status)) LIKE '%game over%' OR lower(trim(game_status)) LIKE '%completed%') THEN 1 ELSE 0 END) AS non_final_rows FROM team_game_log_stage WHERE batch_id=?", deltaStart, deltaEnd, batchId);
  const sourceErrors = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_log_outcomes WHERE batch_id=? AND outcome_category IN ('GAME_SOURCE_ERROR','SOURCE_ERROR')", batchId);
  const badPairs = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM (
    SELECT game_pk, COUNT(*) AS row_count,
      SUM(CASE WHEN is_home=1 THEN 1 ELSE 0 END) AS home_rows,
      SUM(CASE WHEN is_home=0 THEN 1 ELSE 0 END) AS away_rows,
      COUNT(DISTINCT team_id) AS distinct_teams,
      COUNT(DISTINCT opponent_team_id) AS distinct_opponents
    FROM team_game_log_stage WHERE batch_id=? GROUP BY game_pk
    HAVING row_count != 2 OR home_rows != 1 OR away_rows != 1 OR distinct_teams != 2 OR distinct_opponents != 2
  )`, batchId);
  const stagedRows = Number(staged?.c || 0);
  const pass = expectedGames > 0 && stagedRows === expectedRows && Number(dup?.c || 0) === 0 && Number(sourceErrors?.c || 0) === 0 && Number(badPairs?.c || 0) === 0 && Number(missing?.missing_game_pk || 0) === 0 && Number(missing?.missing_game_date || 0) === 0 && Number(missing?.missing_team_id || 0) === 0 && Number(missing?.missing_opponent_team_id || 0) === 0 && Number(missing?.raw_json_missing || 0) === 0 && Number(missing?.outside_window_rows || 0) === 0 && Number(missing?.non_final_rows || 0) === 0;
  const certification = pass ? "DELTA_TEAM_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED" : "DELTA_TEAM_GAME_LOGS_CERTIFICATION_FAILED";
  const grade = pass ? "DELTA_PASS" : "DELTA_FAIL";
  const fieldMap = { schedule_endpoint:"/api/v1/schedule?sportId=1&gameTypes=R&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD", boxscore_endpoint:"/api/v1/game/{gamePk}/boxscore", expected_rows_rule:"completed_final_regular_season_games * 2", retained_stage:true };
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_log_certifications (certification_id, batch_id, run_id, request_id, certification_status, certification_grade, expected_game_count, expected_team_game_rows, staged_team_game_rows, rows_promoted, duplicate_stage_keys, non_final_games, source_error_count, repair_required_count, unclear_count, missing_game_pk, missing_game_date, missing_team_id, missing_opponent_team_id, bad_home_away_pair_count, raw_json_missing, lineage_missing_count, source_field_map_json, details_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    `${batchId}_delta_cert`, batchId, runId, requestId, certification, grade, expectedGames, expectedRows, stagedRows, Number(dup?.c || 0), Number(missing?.non_final_rows || 0), Number(sourceErrors?.c || 0), Number(missing?.missing_game_pk || 0), Number(missing?.missing_game_date || 0), Number(missing?.missing_team_id || 0), Number(missing?.missing_opponent_team_id || 0), Number(badPairs?.c || 0), Number(missing?.raw_json_missing || 0), safeJson(fieldMap), safeJson({ delta_start_date: deltaStart, delta_end_date: deltaEnd, outside_window_rows: Number(missing?.outside_window_rows || 0), pass, retained_stage: true })
  );
  if (!pass) {
    await run(env.TEAM_DB, "UPDATE team_game_log_batches SET version=?, status='DELTA_CERTIFICATION_FAILED', certification_status=?, certification_grade=?, expected_game_count=?, expected_team_game_rows=?, staged_team_game_rows=?, duplicate_stage_keys=?, source_error_count=?, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP WHERE batch_id=?", VERSION, certification, grade, expectedGames, expectedRows, stagedRows, Number(dup?.c || 0), Number(sourceErrors?.c || 0), safeJson({ expected_game_count: expectedGames, expected_team_game_rows: expectedRows, staged_team_game_rows: stagedRows, duplicate_stage_keys: Number(dup?.c || 0), source_error_count: Number(sourceErrors?.c || 0), bad_home_away_pair_count: Number(badPairs?.c || 0), missing }), batchId);
    await run(env.TEAM_DB, "UPDATE team_game_log_cursor SET status='DELTA_CERTIFICATION_FAILED', cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", safeJson({ batch_id: batchId, certification, grade }), DELTA_CURSOR_KEY);
    return { ok:false, data_ok:false, status:"DELTA_CERTIFICATION_FAILED", certification, certification_grade:grade, rows_read:0, rows_written:rowsWrittenSoFar+1, rows_promoted:0, external_calls_performed:externalCallsSoFar, continuation_required:false };
  }
  const rowsPromoted = await promoteTeamStageRows(env, batchId, certification, grade, false);
  if (rowsPromoted !== expectedRows) {
    await run(env.TEAM_DB, "UPDATE team_game_log_batches SET status='DELTA_PROMOTION_VERIFY_FAILED', rows_promoted=?, certification_status='DELTA_TEAM_GAME_LOGS_PROMOTION_VERIFY_FAILED', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", rowsPromoted, safeJson({ expectedRows, rowsPromoted }), batchId);
    return { ok:false, data_ok:false, status:"DELTA_PROMOTION_VERIFY_FAILED", certification:"DELTA_TEAM_GAME_LOGS_PROMOTION_VERIFY_FAILED", rows_promoted:rowsPromoted, external_calls_performed:externalCallsSoFar, rows_written:rowsWrittenSoFar+rowsPromoted };
  }
  await run(env.TEAM_DB, "UPDATE team_game_log_certifications SET rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE certification_id=?", rowsPromoted, `${batchId}_delta_cert`);
  await run(env.TEAM_DB, "UPDATE team_game_log_batches SET version=?, status='COMPLETED_PROMOTED_STAGE_RETAINED', certification_status=?, certification_grade=?, expected_game_count=?, expected_team_game_rows=?, staged_team_game_rows=?, rows_promoted=?, duplicate_stage_keys=0, source_error_count=0, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=COALESCE(certified_at,CURRENT_TIMESTAMP), promoted_at=CURRENT_TIMESTAMP WHERE batch_id=?", VERSION, certification, grade, expectedGames, expectedRows, stagedRows, rowsPromoted, safeJson({ delta_start_date: deltaStart, delta_end_date: deltaEnd, expected_game_count: expectedGames, expected_team_game_rows: expectedRows, rows_promoted: rowsPromoted, stage_retained: true }), batchId);
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO team_game_log_cursor (cursor_key, ingestion_mode, source_key, source_season, source_game_type, base_backfill_cutoff_date, delta_reserved_start_date, last_batch_id, last_request_id, status, cursor_json, created_at, updated_at) VALUES (?, 'delta_update', ?, ?, 'R', ?, ?, ?, ?, 'COMPLETED_PROMOTED_STAGE_RETAINED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, DELTA_CURSOR_KEY, SOURCE_KEY, ymdToSeason(deltaEnd), DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_START_DATE, batchId, requestId, safeJson({ batch_id: batchId, delta_start_date: deltaStart, delta_end_date: deltaEnd, expected_game_count: expectedGames, expected_team_game_rows: expectedRows, rows_promoted: rowsPromoted, stage_retained: true }));
  return { ok:true, data_ok:true, status:"COMPLETED_PROMOTED_STAGE_RETAINED", certification, certification_grade:grade, rows_read:expectedGames, rows_written:rowsWrittenSoFar+rowsPromoted+3, rows_promoted:rowsPromoted, external_calls_performed:externalCallsSoFar, expected_game_count:expectedGames, expected_team_game_rows:expectedRows, staged_team_game_rows:stagedRows, stage_retained:true, duplicate_stage_keys:Number(dup?.c || 0), bad_home_away_pair_count:Number(badPairs?.c || 0), continuation_required:false };
}

async function runDeltaUpdate(env, input) {
  if (!env.TEAM_DB) return { ok:false, data_ok:false, status:"blocked_missing_team_db_binding", certification:"TEAM_DB_BINDING_MISSING" };
  const schema = await ensureSchema(env);
  const requestId = input.request_id || rid("team_logs_delta_req");
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid("team_logs_delta_run");
  const deltaFloor = String(input?.input_json?.delta_start_date || input.delta_start_date || DEFAULT_DELTA_START_DATE).slice(0,10);
  const baseUrl = getBaseUrl(env);

  const baseGate = await first(env.TEAM_DB, "SELECT * FROM team_game_log_batches WHERE ingestion_mode='base_backfill' AND status='COMPLETED_PROMOTED_CLEANED' AND certification_status='BASE_TEAM_GAME_LOGS_BASE_BACKFILL_CERTIFIED' ORDER BY datetime(created_at) DESC LIMIT 1");
  if (!baseGate) return { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, status:"DELTA_BLOCKED_BASE_NOT_CERTIFIED", certification:"DELTA_TEAM_GAME_LOGS_BASE_GATE_FAILED", rows_read:0, rows_written:0, rows_promoted:0, external_calls_performed:0, no_full_sweep:true };

  const sourceWindow = await determineLatestCompleteTeamGameDate(env, deltaFloor, baseUrl);
  if (!sourceWindow.ok) return { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, status:"DELTA_SOURCE_ERROR_SCHEDULE_FINAL_DATE_PROBE_FAILED", certification:"DELTA_TEAM_GAME_LOGS_FINAL_DATE_PROBE_SOURCE_ERROR", rows_read:0, rows_written:0, rows_promoted:0, external_calls_performed:1, no_full_sweep:true, source_final_date_check:sourceWindow };
  if (!sourceWindow.latest_complete_game_date) return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, status:"DELTA_TEAM_GAME_LOGS_NOOP_NO_FINAL_GAMES_AVAILABLE", certification:"DELTA_TEAM_GAME_LOGS_NOOP_NO_FINAL_GAMES_AVAILABLE", certification_grade:"DELTA_NOOP_PASS", rows_read:0, rows_written:1, rows_promoted:0, external_calls_performed:1, queued:false, no_full_sweep:true, no_mlb_mining_calls:true, no_live_mutation:true, source_final_date_check:sourceWindow };

  const calendarGapPlan = await getCalendarTeamGameLogsGapPlan(env);
  const calendarGapPkSet = new Set((calendarGapPlan.missing_game_pks || []).map(v => String(v)));
  const hasCalendarGaps = calendarGapPlan.ok && calendarGapPkSet.size > 0;

  const retained = await latestCompletedDeltaBatch(env);
  if (!hasCalendarGaps && retained) {
    const truth = await retainedDeltaStageTruth(env, retained.batch_id);
    if (truth.missing_live_rows > 0) {
      const before = truth.live_rows;
      await promoteTeamStageRows(env, retained.batch_id, "DELTA_TEAM_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", "DELTA_REPAIR_PASS", true);
      const afterTruth = await retainedDeltaStageTruth(env, retained.batch_id);
      return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, batch_id:retained.batch_id, status:"REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification:"DELTA_TEAM_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification_grade:"DELTA_REPAIR_PASS", restored_rows:afterTruth.live_rows-before, rows_read:truth.missing_live_rows, rows_written:truth.missing_live_rows, rows_promoted:truth.missing_live_rows, external_calls_performed:1, queued:false, request_id_created:null, no_mining_calls:true, no_stage_writes:true, no_full_sweep:true, no_new_batch:true, no_cleanup:true, source_final_date_check:sourceWindow };
    }
    const retainedMax = truth.max_game_date || retained.sample_end_date || retained.delta_end_date || retained.sample_start_date;
    if (retainedMax && sourceWindow.latest_complete_game_date <= retainedMax && truth.stage_rows === truth.live_rows && truth.stage_rows === Number(retained.expected_team_game_rows || truth.stage_rows)) {
      return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, batch_id:retained.batch_id, status:"DELTA_TEAM_GAME_LOGS_NOOP_CURRENT_SOURCE_SNAPSHOT", certification:"DELTA_TEAM_GAME_LOGS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT", certification_grade:"DELTA_NOOP_PASS", rows_read:truth.stage_rows, rows_written:2, rows_promoted:0, external_calls_performed:1, queued:false, no_full_sweep:true, no_mining_calls:true, no_live_mutation:true, stage_retained:true, retained_max_game_date:retainedMax, latest_complete_game_date:sourceWindow.latest_complete_game_date, source_final_date_check:sourceWindow };
    }
  }

  const retainedTruth = retained ? await retainedDeltaStageTruth(env, retained.batch_id) : null;
  if (!hasCalendarGaps && retained && retainedTruth) {
    const expectedRows = Number(retained.expected_team_game_rows || retainedTruth.stage_rows || 0);
    if (expectedRows > 0 && (retainedTruth.stage_rows < expectedRows || retainedTruth.live_rows < expectedRows)) {
      if (retainedTruth.missing_live_rows > 0) {
        const before = retainedTruth.live_rows;
        await promoteTeamStageRows(env, retained.batch_id, "DELTA_TEAM_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", "DELTA_REPAIR_PASS", true);
        const afterTruth = await retainedDeltaStageTruth(env, retained.batch_id);
        return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, batch_id:retained.batch_id, status:"REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification:"DELTA_TEAM_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification_grade:"DELTA_REPAIR_PASS", restored_rows:afterTruth.live_rows-before, rows_read:retainedTruth.missing_live_rows, rows_written:retainedTruth.missing_live_rows, rows_promoted:retainedTruth.missing_live_rows, external_calls_performed:1, queued:false, request_id_created:null, no_mining_calls:true, no_stage_writes:true, no_full_sweep:true, no_new_batch:true, no_cleanup:true, source_final_date_check:sourceWindow };
      }
      return await scopedRepairMissingDeltaStageRows(env, { batch:retained, truth:retainedTruth, baseUrl, sourceWindow, requestId, chainId, runId });
    }
  }
  const retainedMaxDate = retainedTruth?.max_game_date || retained?.sample_end_date || null;
  const effectiveStart = hasCalendarGaps ? calendarGapPlan.min_official_date : (retainedMaxDate ? addDaysYmd(retainedMaxDate, 1) : deltaFloor);
  const effectiveEnd = hasCalendarGaps ? calendarGapPlan.max_official_date : sourceWindow.latest_complete_game_date;
  if (!effectiveStart || effectiveStart > effectiveEnd) {
    return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, status:"DELTA_TEAM_GAME_LOGS_NOOP_CURRENT_SOURCE_SNAPSHOT", certification:"DELTA_TEAM_GAME_LOGS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT", certification_grade:"DELTA_NOOP_PASS", rows_read:retainedTruth?.stage_rows || 0, rows_written:2, rows_promoted:0, external_calls_performed:1, queued:false, no_full_sweep:true, no_mining_calls:true, no_live_mutation:true, retained_max_game_date:retainedMaxDate, latest_complete_game_date:sourceWindow.latest_complete_game_date, source_final_date_check:sourceWindow, coverage_gap_plan:calendarGapPlan };
  }

  const deltaStart = effectiveStart;
  const deltaEnd = effectiveEnd;
  const season = ymdToSeason(deltaStart);
  const existingDelta = await first(env.TEAM_DB, "SELECT * FROM team_game_log_batches WHERE ingestion_mode='delta_update' AND sample_start_date=? AND sample_end_date=? ORDER BY datetime(created_at) DESC LIMIT 1", deltaStart, deltaEnd);
  if (!hasCalendarGaps && existingDelta && existingDelta.status === "COMPLETED_PROMOTED_STAGE_RETAINED") {
    const truth = await retainedDeltaStageTruth(env, existingDelta.batch_id);
    if (truth.missing_live_rows > 0) {
      const before = truth.live_rows;
      await promoteTeamStageRows(env, existingDelta.batch_id, "DELTA_TEAM_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", "DELTA_REPAIR_PASS", true);
      const afterTruth = await retainedDeltaStageTruth(env, existingDelta.batch_id);
      return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, batch_id:existingDelta.batch_id, status:"REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification:"DELTA_TEAM_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification_grade:"DELTA_REPAIR_PASS", restored_rows:afterTruth.live_rows-before, rows_read:truth.missing_live_rows, rows_written:truth.missing_live_rows, rows_promoted:truth.missing_live_rows, external_calls_performed:1, queued:false, request_id_created:null, no_mining_calls:true, no_stage_writes:true, no_full_sweep:true, no_new_batch:true, no_cleanup:true, source_final_date_check:sourceWindow };
    }
    const existingExpectedRows = Number(existingDelta.expected_team_game_rows || truth.stage_rows || 0);
    if (existingExpectedRows > 0 && (truth.stage_rows < existingExpectedRows || truth.live_rows < existingExpectedRows)) {
      return await scopedRepairMissingDeltaStageRows(env, { batch:existingDelta, truth, baseUrl, sourceWindow, requestId, chainId, runId });
    }
    if (truth.stage_rows === truth.live_rows && truth.stage_rows === Number(existingDelta.expected_team_game_rows || truth.stage_rows)) {
      return { ok:true, data_ok:true, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, batch_id:existingDelta.batch_id, status:"DELTA_TEAM_GAME_LOGS_NOOP_CURRENT_SOURCE_SNAPSHOT", certification:"DELTA_TEAM_GAME_LOGS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT", certification_grade:"DELTA_NOOP_PASS", rows_read:truth.stage_rows, rows_written:2, rows_promoted:0, external_calls_performed:1, queued:false, no_full_sweep:true, no_mining_calls:true, no_live_mutation:true, stage_retained:true, source_final_date_check:sourceWindow };
    }
  }

  const batchId = rid("team_game_logs_delta_update_batch");
  const scheduleEndpoint = `${baseUrl}/api/v1/schedule?sportId=1&gameTypes=R&startDate=${deltaStart}&endDate=${deltaEnd}`;
  await run(env.TEAM_DB, `INSERT OR REPLACE INTO team_game_log_batches (batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type, base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, status, certification_status, certification_grade, output_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'delta_update', 0, ?, ?, ?, 'R', ?, ?, ?, ?, 'DELTA_UPDATE_RUNNING', 'DELTA_UPDATE_RUNNING', 'DELTA_PENDING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, DEFAULT_BASE_CUTOFF_DATE, DEFAULT_DELTA_START_DATE, deltaStart, deltaEnd, safeJson({ schedule_endpoint: scheduleEndpoint, delta_start_date:deltaStart, delta_end_date:deltaEnd, latest_complete_game_date:sourceWindow.latest_complete_game_date, retained_prior_batch_id:retained?.batch_id || null, retained_prior_max_game_date:retainedMaxDate, calendar_gap_scoped_mining:hasCalendarGaps, calendar_gap_count:calendarGapPkSet.size, calendar_gap_sample:(calendarGapPlan.missing_game_pks || []).slice(0,25), no_full_sweep:true }));
  let externalCalls = 1, rowsWritten = 1;
  const schedule = await fetchJson(scheduleEndpoint, env); externalCalls += 1;
  if (!schedule.ok) {
    await run(env.TEAM_DB, "UPDATE team_game_log_batches SET status='DELTA_SOURCE_ERROR', certification_status='DELTA_TEAM_GAME_LOGS_SCHEDULE_SOURCE_ERROR', source_error_count=1, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", safeJson({ schedule_endpoint:scheduleEndpoint, schedule_http_status:schedule.http_status, schedule_text_preview:schedule.text_preview, source_final_date_check:sourceWindow }), batchId);
    return { ok:false, data_ok:false, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, batch_id:batchId, status:"DELTA_SOURCE_ERROR_SCHEDULE_FETCH_FAILED", certification:"DELTA_TEAM_GAME_LOGS_SCHEDULE_SOURCE_ERROR", rows_read:0, rows_written:rowsWritten, rows_promoted:0, external_calls_performed:externalCalls, no_full_sweep:true };
  }
  const allGames=[];
  for (const date of (schedule.json?.dates || [])) for (const game of (date.games || [])) allGames.push(game);
  const rawFinal=allGames.filter(g => String(g.gameType || "") === "R" && gameIsFinal(g) && dateGte(normalizeDate(g.officialDate || g.gameDate), deltaStart) && dateLeq(normalizeDate(g.officialDate || g.gameDate), deltaEnd));
  const seen=new Set(), finalGames=[];
  for (const g of rawFinal) {
    const pk=String(g?.gamePk || "");
    if(!pk || seen.has(pk)) continue;
    if (hasCalendarGaps && !calendarGapPkSet.has(pk)) continue;
    seen.add(pk);
    finalGames.push(g);
  }
  for (const game of finalGames) {
    const gameDate=normalizeDate(game.officialDate || game.gameDate);
    await insertOutcome(env,{ outcome_id:`${batchId}_${game.gamePk}_game`, batch_id:batchId, run_id:runId, request_id:requestId, game_pk:parseIntSafe(game.gamePk), game_date:gameDate, season:ymdToSeason(gameDate), team_id:null, opponent_team_id:null, outcome_level:"game", outcome_category:"GAME_PENDING_BOXSCORE", status:"PENDING_BOXSCORE_STAGE", reason:"Completed final regular-season game inside dynamic delta window queued for team boxscore staging.", source_endpoint:scheduleEndpoint, source_key:SOURCE_KEY, source_confidence:SOURCE_CONFIDENCE, source_snapshot_date:deltaEnd, details_json:safeJson({game}) });
    rowsWritten += 1;
  }
  await run(env.TEAM_DB, "UPDATE team_game_log_batches SET expected_game_count=?, expected_team_game_rows=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", finalGames.length, finalGames.length*2, safeJson({ schedule_endpoint:scheduleEndpoint, games_read:allGames.length, final_regular_season_games_raw:rawFinal.length, distinct_final_regular_season_games:finalGames.length, expected_team_game_rows:finalGames.length*2, delta_start_date:deltaStart, delta_end_date:deltaEnd, latest_complete_game_date:sourceWindow.latest_complete_game_date, retained_prior_batch_id:retained?.batch_id || null, retained_prior_max_game_date:retainedMaxDate, calendar_gap_scoped_mining:hasCalendarGaps, calendar_gap_count:calendarGapPkSet.size, calendar_gap_sample:(calendarGapPlan.missing_game_pks || []).slice(0,25), no_full_sweep:true }), batchId);
  for (const game of finalGames) {
    const gDate=normalizeDate(game.officialDate || game.gameDate);
    const pair=getTeamPairFromSchedule(game);
    const boxscoreEndpoint=`${baseUrl}/api/v1/game/${game.gamePk}/boxscore`;
    const fetched=await fetchJson(boxscoreEndpoint, env); externalCalls += 1;
    if(!fetched.ok){ await run(env.TEAM_DB,"UPDATE team_game_log_outcomes SET outcome_category='GAME_SOURCE_ERROR', status='SOURCE_ERROR_BOXSCORE_FETCH_FAILED', reason='Boxscore fetch failed during delta_update', source_endpoint=?, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE outcome_id=?", boxscoreEndpoint, safeJson({ game, boxscore_http_status:fetched.http_status, text_preview:fetched.text_preview }), `${batchId}_${game.gamePk}_game`); continue; }
    const rows=[buildTeamRow({ side:"away", game, boxscore:fetched.json, schedulePair:pair, batchId, runId, requestId, sourceEndpoint:boxscoreEndpoint, sampleDate:gDate }), buildTeamRow({ side:"home", game, boxscore:fetched.json, schedulePair:pair, batchId, runId, requestId, sourceEndpoint:boxscoreEndpoint, sampleDate:gDate })];
    for (const r of rows) { r.ingestion_mode="delta_update"; r.certification_status="DELTA_STAGE_READY_FOR_CERTIFICATION"; r.certification_grade=null; r.source_confidence=SOURCE_CONFIDENCE; r.source_snapshot_date=deltaEnd; await insertStageRow(env,r); await insertOutcome(env,{ outcome_id:`${batchId}_${r.game_pk}_${r.team_id}`, batch_id:batchId, run_id:runId, request_id:requestId, game_pk:r.game_pk, game_date:r.game_date, season:r.season, team_id:r.team_id, opponent_team_id:r.opponent_team_id, outcome_level:"team_game", outcome_category:"PROMOTED_ROWS", status:"STAGED_FOR_DELTA_PROMOTION", reason:"Team row staged during dynamic delta_update; pending certification/promotion with retained stage.", source_endpoint:boxscoreEndpoint, source_key:SOURCE_KEY, source_confidence:SOURCE_CONFIDENCE, source_snapshot_date:deltaEnd, details_json:safeJson({team_game_key:r.team_game_key,is_home:r.is_home}) }); }
    await run(env.TEAM_DB,"UPDATE team_game_log_outcomes SET outcome_category='GAME_PROMOTED', status='STAGED_TEAM_ROWS', reason='Final regular-season game staged with exactly two team rows', source_endpoint=?, updated_at=CURRENT_TIMESTAMP WHERE outcome_id=?", boxscoreEndpoint, `${batchId}_${game.gamePk}_game`);
    rowsWritten += 4;
  }
  const stagedNow=await first(env.TEAM_DB,"SELECT COUNT(*) AS c FROM team_game_log_stage WHERE batch_id=?",batchId);
  const sourceErrorsNow=await first(env.TEAM_DB,"SELECT COUNT(*) AS c FROM team_game_log_outcomes WHERE batch_id=? AND outcome_category='GAME_SOURCE_ERROR'",batchId);
  await run(env.TEAM_DB,"UPDATE team_game_log_batches SET staged_team_game_rows=?, source_error_count=?, status='DELTA_STAGED_READY_FOR_CERTIFICATION', certification_status='DELTA_STAGED_READY_FOR_CERTIFICATION', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",Number(stagedNow?.c || 0),Number(sourceErrorsNow?.c || 0),safeJson({staged_team_game_rows:Number(stagedNow?.c || 0),external_calls:externalCalls,delta_start_date:deltaStart,delta_end_date:deltaEnd,latest_complete_game_date:sourceWindow.latest_complete_game_date,calendar_gap_scoped_mining:hasCalendarGaps,calendar_gap_count:calendarGapPkSet.size,no_full_sweep:true}),batchId);
  const cert=await certifyDeltaBatch(env,batchId,runId,requestId,deltaStart,deltaEnd,externalCalls,rowsWritten);
  return { ...cert, version:VERSION, worker_name:WORKER_NAME, job_key:JOB_KEY, request_id:requestId, chain_id:chainId, run_id:runId, batch_id:batchId, delta_start_date:deltaStart, delta_end_date:deltaEnd, latest_complete_game_date:sourceWindow.latest_complete_game_date, retained_prior_batch_id:retained?.batch_id || null, retained_prior_max_game_date:retainedMaxDate, calendar_gap_scoped_mining:hasCalendarGaps, calendar_gap_count:calendarGapPkSet.size, processed_calendar_gap_game_pk_count:hasCalendarGaps ? finalGames.length : 0, calendar_gap_sample:(calendarGapPlan.missing_game_pks || []).slice(0,25), no_calendar_tally_writes:true, no_browser_pump:true, no_hitter_game_log_mutation:true, no_pitcher_game_log_mutation:true, no_splits_mutation:true, no_prizepicks_mutation:true, no_sleeper_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true };
}


async function runProbe(env, input) {
  if (!env.TEAM_DB) return { ok: false, data_ok: false, status: "blocked_missing_team_db_binding", certification: "TEAM_DB_BINDING_MISSING" };
  const schema = await ensureSchema(env);
  const requestId = input.request_id || rid("team_logs_probe_req");
  const chainId = input.chain_id || null;
  const runId = input.run_id || rid("team_logs_probe_run");
  const batchId = rid("team_game_logs_probe_batch");
  const sampleDate = String(input?.input_json?.sample_date || input.sample_date || DEFAULT_SAMPLE_DATE).slice(0, 10);
  const season = ymdToSeason(sampleDate);
  const baseUrl = getBaseUrl(env);
  const scheduleEndpoint = `${baseUrl}/api/v1/schedule?sportId=1&gameTypes=R&startDate=${sampleDate}&endDate=${sampleDate}`;
  const liveBefore = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_logs");

  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_log_batches (batch_id, run_id, request_id, chain_id, job_key, worker_name, version, ingestion_mode, probe_only, source_key, source_confidence, source_season, source_game_type, base_backfill_cutoff_date, delta_reserved_start_date, sample_start_date, sample_end_date, status, certification_status, certification_grade, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'source_shape_probe', 1, ?, ?, ?, 'R', '2026-05-18', '2026-05-19', ?, ?, 'RUNNING_SOURCE_SHAPE_PROBE', 'PROBE_RUNNING', 'PROBE_ONLY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, runId, requestId, chainId, JOB_KEY, WORKER_NAME, VERSION, SOURCE_KEY, SOURCE_CONFIDENCE, season, sampleDate, sampleDate
  );

  let externalCalls = 0;
  const schedule = await fetchJson(scheduleEndpoint, env); externalCalls += 1;
  if (!schedule.ok) {
    const output = { schedule_endpoint: scheduleEndpoint, schedule_http_status: schedule.http_status, schedule_text_preview: schedule.text_preview, rows_promoted: 0 };
    await run(env.TEAM_DB, "UPDATE team_game_log_batches SET status='SOURCE_ERROR', certification_status='PROBE_SOURCE_ERROR', source_error_count=1, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", safeJson(output), batchId);
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: requestId, chain_id: chainId, batch_id: batchId, status: "SOURCE_ERROR_SCHEDULE_FETCH_FAILED", certification: "TEAM_GAME_LOGS_PROBE_SCHEDULE_SOURCE_ERROR", rows_read: 0, rows_written: 1, rows_promoted: 0, external_calls_performed: externalCalls, no_live_promotion: true, live_count_before: liveBefore?.c || 0, output_json: output };
  }

  const games = [];
  for (const date of (schedule.json?.dates || [])) for (const game of (date.games || [])) games.push(game);
  const finalGames = games.filter(g => String(g.gameType || "") === "R" && gameIsFinal(g));
  const sampleGame = finalGames[0] || null;
  let rows = [];
  let boxscoreEndpoint = null;
  let boxscore = null;
  let outcomeCategory = "GAME_PROMOTED";
  let status = "PROBE_STAGE_ONLY_NOT_PROMOTED";
  let sourceErrorCount = 0;
  let unclearCount = 0;
  if (!sampleGame) {
    outcomeCategory = "TRUE_NO_DATA";
    status = "NO_FINAL_REGULAR_SEASON_GAME_ON_SAMPLE_DATE";
    unclearCount = games.length > 0 ? 1 : 0;
  } else {
    boxscoreEndpoint = `${baseUrl}/api/v1/game/${sampleGame.gamePk}/boxscore`;
    const fetchedBoxscore = await fetchJson(boxscoreEndpoint, env); externalCalls += 1;
    if (!fetchedBoxscore.ok) {
      sourceErrorCount = 1;
      outcomeCategory = "GAME_SOURCE_ERROR";
      status = "SOURCE_ERROR_BOXSCORE_FETCH_FAILED";
    } else {
      boxscore = fetchedBoxscore.json;
      const pair = getTeamPairFromSchedule(sampleGame);
      rows = [
        buildTeamRow({ side: "away", game: sampleGame, boxscore, schedulePair: pair, batchId, runId, requestId, sourceEndpoint: boxscoreEndpoint, sampleDate }),
        buildTeamRow({ side: "home", game: sampleGame, boxscore, schedulePair: pair, batchId, runId, requestId, sourceEndpoint: boxscoreEndpoint, sampleDate })
      ];
      for (const r of rows) await insertStageRow(env, r);
    }
  }

  if (sampleGame) {
    await insertOutcome(env, {
      outcome_id: `${batchId}_${sampleGame.gamePk}_game`, batch_id: batchId, run_id: runId, request_id: requestId,
      game_pk: parseIntSafe(sampleGame.gamePk), game_date: normalizeDate(sampleGame.officialDate || sampleGame.gameDate || sampleDate), season,
      team_id: null, opponent_team_id: null, outcome_level: "game", outcome_category: sourceErrorCount ? "GAME_SOURCE_ERROR" : "GAME_PROMOTED", status,
      reason: sourceErrorCount ? "Boxscore fetch failed during source-shape probe" : "Final regular-season game selected for two-team source-shape probe",
      source_endpoint: boxscoreEndpoint || scheduleEndpoint, source_key: SOURCE_KEY, source_confidence: SOURCE_CONFIDENCE, source_snapshot_date: sampleDate,
      details_json: safeJson({ game_status: sampleGame.status, expected_team_rows: sourceErrorCount ? 0 : 2, probe_only: true })
    });
    for (const r of rows) {
      await insertOutcome(env, {
        outcome_id: `${batchId}_${r.game_pk}_${r.team_id}`, batch_id: batchId, run_id: runId, request_id: requestId,
        game_pk: r.game_pk, game_date: r.game_date, season: r.season, team_id: r.team_id, opponent_team_id: r.opponent_team_id,
        outcome_level: "team_game", outcome_category: "PROMOTED_ROWS", status: "STAGED_PROBE_ONLY_NOT_PROMOTED",
        reason: "Team row was staged for source-shape proof only; live promotion is blocked in v0.1.0.",
        source_endpoint: boxscoreEndpoint, source_key: SOURCE_KEY, source_confidence: SOURCE_CONFIDENCE, source_snapshot_date: sampleDate,
        details_json: safeJson({ team_game_key: r.team_game_key, is_home: r.is_home, batting_source_path: r.batting_source_path, pitching_source_path: r.pitching_source_path })
      });
    }
  } else {
    await insertOutcome(env, { outcome_id: `${batchId}_no_final_game`, batch_id: batchId, run_id: runId, request_id: requestId, game_pk: null, game_date: sampleDate, season, team_id: null, opponent_team_id: null, outcome_level: "game", outcome_category: "TRUE_NO_DATA", status, reason: "No final regular-season games were found for sample date", source_endpoint: scheduleEndpoint, source_key: SOURCE_KEY, source_confidence: SOURCE_CONFIDENCE, source_snapshot_date: sampleDate, details_json: safeJson({ total_games_on_date: games.length, probe_only: true }) });
  }

  const expectedGameCount = sampleGame && !sourceErrorCount ? 1 : 0;
  const expectedRows = expectedGameCount * 2;
  const stagedRows = rows.length;
  const dup = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM (SELECT game_pk, team_id, COUNT(*) AS n FROM team_game_log_stage WHERE batch_id=? GROUP BY game_pk, team_id HAVING n>1)", batchId);
  const missing = await first(env.TEAM_DB, "SELECT SUM(CASE WHEN game_pk IS NULL THEN 1 ELSE 0 END) AS missing_game_pk, SUM(CASE WHEN game_date IS NULL OR game_date='' THEN 1 ELSE 0 END) AS missing_game_date, SUM(CASE WHEN team_id IS NULL OR team_id='' THEN 1 ELSE 0 END) AS missing_team_id, SUM(CASE WHEN opponent_team_id IS NULL OR opponent_team_id='' THEN 1 ELSE 0 END) AS missing_opponent_team_id, SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS raw_json_missing FROM team_game_log_stage WHERE batch_id=?", batchId);
  const liveAfter = await first(env.TEAM_DB, "SELECT COUNT(*) AS c FROM team_game_logs");
  const liveUnchanged = Number(liveBefore?.c || 0) === Number(liveAfter?.c || 0);
  const homeAwayOk = rows.length === 2 && rows.some(r => r.is_home === 1) && rows.some(r => r.is_home === 0) && rows[0].team_id !== rows[1].team_id && rows[0].opponent_team_id === rows[1].team_id && rows[1].opponent_team_id === rows[0].team_id;
  const fieldMap = {
    schedule_endpoint: "/api/v1/schedule?sportId=1&gameTypes=R&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD",
    boxscore_endpoint: "/api/v1/game/{gamePk}/boxscore",
    team_batting_source_path: "boxscore.teams.{home|away}.teamStats.batting",
    team_pitching_source_path: "boxscore.teams.{home|away}.teamStats.pitching",
    home_away_mapping_source_path: "schedule.game.teams.home/team and schedule.game.teams.away/team, verified against boxscore.teams.home/away.team.id",
    confirmed_batting_fields: rows.length ? Object.keys(boxscore?.teams?.away?.teamStats?.batting || {}).sort() : [],
    confirmed_pitching_fields: rows.length ? Object.keys(boxscore?.teams?.away?.teamStats?.pitching || {}).sort() : []
  };
  const certPass = schema.ok && sourceErrorCount === 0 && expectedRows === stagedRows && Number(dup?.c || 0) === 0 && homeAwayOk && liveUnchanged;
  const certification = certPass ? "TEAM_GAME_LOGS_SOURCE_SHAPE_PROBE_PASS_NO_LIVE_PROMOTION" : "TEAM_GAME_LOGS_SOURCE_SHAPE_PROBE_BLOCKED_REVIEW_REQUIRED";
  const grade = certPass ? "PROBE_PASS" : "PROBE_BLOCKED";

  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_log_certifications (certification_id, batch_id, run_id, request_id, certification_status, certification_grade, expected_game_count, expected_team_game_rows, staged_team_game_rows, rows_promoted, duplicate_stage_keys, non_final_games, source_error_count, repair_required_count, unclear_count, missing_game_pk, missing_game_date, missing_team_id, missing_opponent_team_id, bad_home_away_pair_count, raw_json_missing, lineage_missing_count, source_field_map_json, details_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    `${batchId}_cert`, batchId, runId, requestId, certification, grade, expectedGameCount, expectedRows, stagedRows, Number(dup?.c || 0), sourceErrorCount, unclearCount, Number(missing?.missing_game_pk || 0), Number(missing?.missing_game_date || 0), Number(missing?.missing_team_id || 0), Number(missing?.missing_opponent_team_id || 0), homeAwayOk ? 0 : 1, Number(missing?.raw_json_missing || 0), safeJson(fieldMap), safeJson({ live_count_before: liveBefore?.c || 0, live_count_after: liveAfter?.c || 0, live_count_unchanged: liveUnchanged, probe_only: true, full_base_backfill_blocked: true, delta_update_blocked: true })
  );
  await run(env.TEAM_DB,
    `UPDATE team_game_log_batches SET expected_game_count=?, expected_team_game_rows=?, staged_team_game_rows=?, rows_promoted=0, duplicate_stage_keys=?, source_error_count=?, unclear_count=?, status=?, certification_status=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    expectedGameCount, expectedRows, stagedRows, Number(dup?.c || 0), sourceErrorCount, unclearCount, certPass ? "COMPLETED_PROBE_ONLY_NO_PROMOTION" : "BLOCKED_PROBE_REVIEW_REQUIRED", certification, grade,
    safeJson({ fieldMap, homeAwayOk, liveUnchanged, sourceEndpoints: { scheduleEndpoint, boxscoreEndpoint }, sample_game_pk: sampleGame?.gamePk || null, no_live_promotion: true, rows_promoted: 0 }), batchId
  );
  await run(env.TEAM_DB,
    `INSERT OR REPLACE INTO team_game_log_cursor (cursor_key, ingestion_mode, source_key, source_season, source_game_type, base_backfill_cutoff_date, delta_reserved_start_date, last_sample_date, last_game_pk, last_batch_id, last_request_id, status, cursor_json, created_at, updated_at)
     VALUES ('team_game_logs_source_shape_probe', 'source_shape_probe', ?, ?, 'R', '2026-05-18', '2026-05-19', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    SOURCE_KEY, season, sampleDate, sampleGame?.gamePk || null, batchId, requestId, certPass ? "PROBE_PASS_NO_PROMOTION" : "PROBE_BLOCKED_REVIEW_REQUIRED", safeJson({ sample_date: sampleDate, sample_game_pk: sampleGame?.gamePk || null, expected_team_game_rows: expectedRows, rows_promoted: 0 })
  );

  return {
    ok: certPass,
    data_ok: certPass,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    chain_id: chainId,
    run_id: runId,
    batch_id: batchId,
    status: certPass ? "COMPLETED_PROBE_ONLY_NO_PROMOTION" : "BLOCKED_PROBE_REVIEW_REQUIRED",
    certification,
    certification_grade: grade,
    rows_read: games.length,
    rows_written: stagedRows + 3,
    rows_promoted: 0,
    external_calls_performed: externalCalls,
    no_live_promotion: true,
    no_full_base_backfill: true,
    no_delta_update_execution: true,
    no_hitter_game_log_mutation: true,
    no_pitcher_game_log_mutation: true,
    no_splits_mutation: true,
    no_prizepicks_mutation: true,
    no_sleeper_mutation: true,
    no_scoring: true,
    no_ranking: true,
    no_final_board: true,
    no_browser_pump: true,
    live_count_before: Number(liveBefore?.c || 0),
    live_count_after: Number(liveAfter?.c || 0),
    live_count_unchanged: liveUnchanged,
    sample_date: sampleDate,
    completed_final_regular_season_games_on_sample_date: finalGames.length,
    sampled_game_pk: sampleGame?.gamePk || null,
    expected_game_count: expectedGameCount,
    expected_team_game_rows: expectedRows,
    staged_team_game_rows: stagedRows,
    duplicate_stage_keys: Number(dup?.c || 0),
    home_away_opponent_mapping_source_proven: homeAwayOk,
    source_endpoints_used: { schedule_endpoint: scheduleEndpoint, boxscore_endpoint: boxscoreEndpoint },
    source_field_map: fieldMap,
    schema_result: schema,
    next_allowed_phase: certPass ? "v0.2.0_stage_only_design_after_user_approval" : "review_probe_output_before_any_stage_only_build"
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, REQUIRED_SECRETS) }, safe_secret_note: "Secret values are intentionally never printed." });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const inputJson = input.input_json || input || {};
      const mode = String(inputJson.mode || input.mode || "source_shape_probe");
      if (mode === "base_backfill") return jsonResponse(await runBaseBackfill(env, input));
      if (mode === "delta_update") return jsonResponse(await runDeltaUpdate(env, input));
      return jsonResponse(await runProbe(env, input));
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
