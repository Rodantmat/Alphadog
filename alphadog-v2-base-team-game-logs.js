const WORKER_NAME = "alphadog-v2-base-team-game-logs";
const VERSION = "alphadog-v2-base-team-game-logs-v0.1.0-schema-source-lock-probe";
const JOB_KEY = "base-team-game-logs";
const DEFAULT_SAMPLE_DATE = "2026-05-18";
const SOURCE_KEY = "mlb_statsapi_schedule_boxscore_team_totals_probe_v0_1_0";
const SOURCE_CONFIDENCE = "PROBE_ONLY_NOT_PROMOTION_LOCKED";

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
  await tryRun(db, "INSERT OR REPLACE INTO team_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('team_game_logs_v0_1_0_schema_source_lock_probe', ?, CURRENT_TIMESTAMP, 'Additive lifecycle schema for probe-only team game logs source lock')", VERSION);
  return { ok: failures.length === 0, applied_count: applied.length, failure_count: failures.length, failures: failures.slice(0, 10) };
}

function getBaseUrl(env) { return String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com").replace(/\/$/, ""); }
async function fetchJson(url, env) {
  const headers = {};
  if (env.MLB_API_USER_AGENT) headers["user-agent"] = String(env.MLB_API_USER_AGENT);
  const resp = await fetch(url, { headers });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { ok: resp.ok && !!json, http_status: resp.status, url, json, text_preview: text.slice(0, 500) };
}
function gameIsFinal(game) {
  const detailed = String(game?.status?.detailedState || "").toLowerCase();
  const abstract = String(game?.status?.abstractGameState || "").toLowerCase();
  const coded = String(game?.status?.codedGameState || "").toUpperCase();
  return detailed === "final" || detailed === "game over" || abstract === "final" || coded === "F";
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
      return jsonResponse(await runProbe(env, input));
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
