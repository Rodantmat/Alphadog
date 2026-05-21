const WORKER_NAME = "alphadog-v2-base-pitcher-game-logs";
const VERSION = "alphadog-v2-base-pitcher-game-logs-v0.1.1-certification-bind-fix";
const JOB_KEY = "base-pitcher-game-logs";
const GROUP_TYPE = "pitching";
const SOURCE_KEY = "mlb_statsapi_pitcher_game_logs_v0_1_0";
const DATA_FEED_KEY = "mlb_statsapi_pitcher_game_logs_2026_source_probe_v0_1_0";
const SOURCE_ENDPOINT_TEMPLATE = "https://statsapi.mlb.com/api/v1/people/{playerId}/stats?stats=gameLog&group=pitching&season={season}";
const DEFAULT_SEASON = 2026;
const DEFAULT_BASE_CUTOFF = "2026-05-18";
const DEFAULT_DELTA_START = "2026-05-19";
const NO_DATA_PROBE_SEASON = 1901;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_PITCHER_DB"];
const EXPECTED_VARS = ["ACTIVE_SEASON", "MLB_API_BASE_URL", "MLB_API_USER_AGENT", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK"];

function nowIso() { return new Date().toISOString(); }
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

async function readJsonSafe(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = !!(env && env[name]);
  return out;
}

function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0;
  return out;
}

function allTrue(obj) { return Object.values(obj).every(Boolean); }

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res.results || [];
}

async function first(db, sql, ...binds) {
  const rows = await all(db, sql, ...binds);
  return rows[0] || null;
}

async function tryRun(db, sql, ...binds) {
  try {
    await run(db, sql, ...binds);
    return { ok: true, sql: sql.slice(0, 120) };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.toLowerCase().includes("duplicate column")) return { ok: true, duplicate_column: true, sql: sql.slice(0, 120) };
    return { ok: false, error: msg, sql: sql.slice(0, 180) };
  }
}

async function tableColumns(db, tableName) {
  try {
    const rows = await all(db, `PRAGMA table_info(${tableName})`);
    return rows.map(r => String(r.name || ""));
  } catch (_) {
    return [];
  }
}

function has(cols, name) { return cols.includes(name); }

async function ensureSchema(env) {
  const db = env.STATS_PITCHER_DB;
  const ddlResults = [];

  const ddl = [
    `CREATE TABLE IF NOT EXISTS pitcher_game_log_batches (
      batch_id TEXT PRIMARY KEY,
      run_id TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      certification_status TEXT,
      certification_grade TEXT,
      worker_version TEXT,
      data_feed_key TEXT,
      source_key TEXT,
      source_endpoint TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      group_type TEXT,
      base_backfill_cutoff_date TEXT,
      delta_start_date TEXT,
      expected_pitcher_universe_count INTEGER DEFAULT 0,
      outcome_rows INTEGER DEFAULT 0,
      duplicate_outcome_rows INTEGER DEFAULT 0,
      source_request_count INTEGER DEFAULT 0,
      source_success_count INTEGER DEFAULT 0,
      source_no_data_count INTEGER DEFAULT 0,
      source_error_count INTEGER DEFAULT 0,
      rows_staged INTEGER DEFAULT 0,
      rows_promoted INTEGER DEFAULT 0,
      rows_after_cutoff INTEGER DEFAULT 0,
      duplicate_stage_keys INTEGER DEFAULT 0,
      live_rows_before INTEGER DEFAULT 0,
      live_rows_after INTEGER DEFAULT 0,
      universe_audit_json TEXT,
      source_probe_json TEXT,
      no_data_probe_json TEXT,
      error_json TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      certified_at TEXT,
      promoted_at TEXT,
      cleaned_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pitcher_game_log_stage (
      stage_id TEXT PRIMARY KEY,
      player_id INTEGER NOT NULL,
      player_name TEXT,
      game_pk INTEGER,
      season INTEGER NOT NULL,
      game_date TEXT,
      team_id TEXT,
      opponent_team_id TEXT,
      opponent_team TEXT,
      is_home INTEGER,
      group_type TEXT DEFAULT 'pitching',
      role TEXT,
      innings_pitched TEXT,
      innings_pitched_decimal REAL,
      outs_recorded INTEGER,
      batters_faced INTEGER,
      hits_allowed INTEGER,
      runs_allowed INTEGER,
      earned_runs INTEGER,
      walks_allowed INTEGER,
      strikeouts INTEGER,
      home_runs_allowed INTEGER,
      pitches INTEGER,
      balls INTEGER,
      strikes INTEGER,
      wins INTEGER,
      losses INTEGER,
      saves INTEGER,
      holds INTEGER,
      blown_saves INTEGER,
      stat_shape_json TEXT,
      raw_json TEXT,
      data_feed_key TEXT,
      source_key TEXT,
      source_endpoint TEXT,
      source_season INTEGER,
      source_game_type TEXT,
      ingestion_mode TEXT,
      batch_id TEXT NOT NULL,
      run_id TEXT,
      certification_status TEXT,
      certification_grade TEXT,
      source_confidence TEXT,
      certified_at TEXT,
      promoted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, player_id, game_pk, group_type)
    )`,
    `CREATE TABLE IF NOT EXISTS pitcher_game_log_player_outcomes (
      outcome_key TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      run_id TEXT,
      mode TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      player_name TEXT,
      team_id TEXT,
      role_source TEXT,
      outcome_category TEXT NOT NULL,
      row_count INTEGER DEFAULT 0,
      filtered_after_cutoff_count INTEGER DEFAULT 0,
      source_http_status INTEGER,
      source_season INTEGER,
      source_endpoint TEXT,
      source_error TEXT,
      source_response_preview TEXT,
      raw_outcome_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, player_id)
    )`,
    `CREATE TABLE IF NOT EXISTS pitcher_game_log_cursors (
      batch_id TEXT PRIMARY KEY,
      run_id TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      expected_pitcher_universe_count INTEGER DEFAULT 0,
      cursor_offset INTEGER DEFAULT 0,
      current_player_id INTEGER,
      max_api_calls_per_tick INTEGER DEFAULT 0,
      max_rows_per_tick INTEGER DEFAULT 0,
      continuation_required INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pitcher_game_log_certifications (
      certification_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      run_id TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      certification_status TEXT,
      certification_grade TEXT,
      check_key TEXT,
      check_status TEXT,
      expected_value TEXT,
      actual_value TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of ddl) ddlResults.push(await tryRun(db, sql));

  const alterStatements = [
    "ALTER TABLE pitcher_game_logs ADD COLUMN data_feed_key TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN source_endpoint TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN source_season INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN source_game_type TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN ingestion_mode TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN batch_id TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN run_id TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN certification_status TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN certification_grade TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN certified_at TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN promoted_at TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN created_at TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN group_type TEXT DEFAULT 'pitching'"
  ];
  for (const sql of alterStatements) ddlResults.push(await tryRun(db, sql));

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_batches_status ON pitcher_game_log_batches(status, mode)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_stage_batch ON pitcher_game_log_stage(batch_id, player_id, game_date)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_stage_key ON pitcher_game_log_stage(player_id, game_pk, group_type)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_outcomes_batch ON pitcher_game_log_player_outcomes(batch_id, outcome_category)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_cursors_status ON pitcher_game_log_cursors(status, mode)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_logs_lineage ON pitcher_game_logs(data_feed_key, batch_id, ingestion_mode)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_logs_group_key ON pitcher_game_logs(player_id, game_pk, group_type)"
  ];
  for (const sql of indexes) ddlResults.push(await tryRun(db, sql));

  await tryRun(db,
    "INSERT OR REPLACE INTO pitcher_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('pitcher_game_logs_lifecycle_v0_1_0', ?, CURRENT_TIMESTAMP, 'Additive pitcher game-log lifecycle schema and live lineage columns; source-probe only, no promotion')",
    VERSION
  );

  const tables = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pitcher_game_log%' ORDER BY name");
  const liveColumns = await tableColumns(db, "pitcher_game_logs");
  return { ddl_results: ddlResults, lifecycle_tables: tables.map(r => r.name), pitcher_game_logs_columns: liveColumns };
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function pitcherRoleWhere(alias) {
  const c = alias ? `${alias}.role` : "role";
  return `(LOWER(COALESCE(${c},'')) LIKE '%pitch%' OR UPPER(COALESCE(${c},'')) IN ('P','SP','RP','CP','LHP','RHP'))`;
}

async function auditPitcherUniverse(env) {
  const rosterCols = await tableColumns(env.REF_DB, "ref_rosters");
  const playerCols = await tableColumns(env.REF_DB, "ref_players");
  const result = {
    ok: false,
    source: null,
    source_proven: false,
    expected_pitcher_universe_count: 0,
    sample_players: [],
    ref_rosters_columns: rosterCols,
    ref_players_columns: playerCols,
    notes: []
  };

  if (rosterCols.length === 0 || playerCols.length === 0) {
    result.notes.push("REF_DB ref_rosters/ref_players unavailable or schema not deployed.");
    return result;
  }

  if (has(rosterCols, "role") && has(rosterCols, "player_id")) {
    const activeRosterFilter = has(rosterCols, "active") ? "AND COALESCE(r.active,1)=1" : "";
    const activePlayerFilter = has(playerCols, "active") ? "AND COALESCE(p.active,1)=1" : "";
    const count = await first(env.REF_DB, `SELECT COUNT(DISTINCT r.player_id) AS c FROM ref_rosters r LEFT JOIN ref_players p ON p.player_id=r.player_id WHERE r.player_id IS NOT NULL ${activeRosterFilter} ${activePlayerFilter} AND ${pitcherRoleWhere("r")}`);
    const c = Number(count && count.c ? count.c : 0);
    if (c > 0) {
      const rows = await all(env.REF_DB, `SELECT DISTINCT r.player_id, COALESCE(p.player_name,'') AS player_name, r.team_id, r.role AS role, 'ref_rosters.role' AS role_source FROM ref_rosters r LEFT JOIN ref_players p ON p.player_id=r.player_id WHERE r.player_id IS NOT NULL ${activeRosterFilter} ${activePlayerFilter} AND ${pitcherRoleWhere("r")} ORDER BY r.player_id LIMIT 3`);
      result.ok = true;
      result.source = "REF_DB.ref_rosters.role";
      result.source_proven = true;
      result.expected_pitcher_universe_count = c;
      result.sample_players = rows;
      result.notes.push("Pitcher universe found from source-proven REF_DB.ref_rosters.role.");
      return result;
    }
    result.notes.push("REF_DB.ref_rosters.role exists but produced zero pitcher-role rows.");
  }

  if (has(playerCols, "primary_role") && has(playerCols, "player_id")) {
    const activePlayerFilter = has(playerCols, "active") ? "AND COALESCE(active,1)=1" : "";
    const count = await first(env.REF_DB, `SELECT COUNT(DISTINCT player_id) AS c FROM ref_players WHERE player_id IS NOT NULL ${activePlayerFilter} AND (LOWER(COALESCE(primary_role,'')) LIKE '%pitch%' OR UPPER(COALESCE(primary_role,'')) IN ('P','SP','RP','CP','LHP','RHP'))`);
    const c = Number(count && count.c ? count.c : 0);
    if (c > 0) {
      const rows = await all(env.REF_DB, `SELECT DISTINCT player_id, COALESCE(player_name,'') AS player_name, primary_team_id AS team_id, primary_role AS role, 'ref_players.primary_role' AS role_source FROM ref_players WHERE player_id IS NOT NULL ${activePlayerFilter} AND (LOWER(COALESCE(primary_role,'')) LIKE '%pitch%' OR UPPER(COALESCE(primary_role,'')) IN ('P','SP','RP','CP','LHP','RHP')) ORDER BY player_id LIMIT 3`);
      result.ok = true;
      result.source = "REF_DB.ref_players.primary_role";
      result.source_proven = true;
      result.expected_pitcher_universe_count = c;
      result.sample_players = rows;
      result.notes.push("Pitcher universe found from source-proven REF_DB.ref_players.primary_role.");
      return result;
    }
    result.notes.push("REF_DB.ref_players.primary_role exists but produced zero pitcher-role rows.");
  }

  if (has(rosterCols, "raw_json") && has(rosterCols, "player_id")) {
    const activeRosterFilter = has(rosterCols, "active") ? "AND COALESCE(r.active,1)=1" : "";
    const activePlayerFilter = has(playerCols, "active") ? "AND COALESCE(p.active,1)=1" : "";
    const rawWhere = `(LOWER(COALESCE(r.raw_json,'')) LIKE '%pitcher%' OR COALESCE(r.raw_json,'') LIKE '%\"abbreviation\":\"P\"%' OR COALESCE(r.raw_json,'') LIKE '%\"type\":\"Pitcher\"%')`;
    const count = await first(env.REF_DB, `SELECT COUNT(DISTINCT r.player_id) AS c FROM ref_rosters r LEFT JOIN ref_players p ON p.player_id=r.player_id WHERE r.player_id IS NOT NULL ${activeRosterFilter} ${activePlayerFilter} AND ${rawWhere}`);
    const c = Number(count && count.c ? count.c : 0);
    if (c > 0) {
      const rows = await all(env.REF_DB, `SELECT DISTINCT r.player_id, COALESCE(p.player_name,'') AS player_name, r.team_id, 'raw_json_pitcher_match' AS role, 'ref_rosters.raw_json' AS role_source FROM ref_rosters r LEFT JOIN ref_players p ON p.player_id=r.player_id WHERE r.player_id IS NOT NULL ${activeRosterFilter} ${activePlayerFilter} AND ${rawWhere} ORDER BY r.player_id LIMIT 3`);
      result.ok = true;
      result.source = "REF_DB.ref_rosters.raw_json";
      result.source_proven = true;
      result.expected_pitcher_universe_count = c;
      result.sample_players = rows;
      result.notes.push("Pitcher universe found from source raw_json text in REF_DB.ref_rosters; acceptable for v0.1.0 probe only, not final base certification without review.");
      return result;
    }
    result.notes.push("REF_DB.ref_rosters.raw_json fallback produced zero pitcher-role rows.");
  }

  result.notes.push("No source-proven pitcher universe could be established. Probe blocked before MLB calls.");
  return result;
}

function mlbBaseUrl(env) {
  return String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
}

function sourceEndpoint(env, playerId, season) {
  return `${mlbBaseUrl(env)}/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=pitching&season=${encodeURIComponent(season)}`;
}

async function fetchStatsApi(env, playerId, season) {
  const endpoint = sourceEndpoint(env, playerId, season);
  const headers = {};
  if (env.MLB_API_USER_AGENT) headers["user-agent"] = String(env.MLB_API_USER_AGENT);
  const started = Date.now();
  const resp = await fetch(endpoint, { headers });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return {
    endpoint,
    http_status: resp.status,
    ok: resp.ok,
    elapsed_ms: Date.now() - started,
    json,
    text_preview: text.slice(0, 900)
  };
}

function getSplits(payload) {
  const stats = payload && payload.stats && Array.isArray(payload.stats) ? payload.stats : [];
  for (const s of stats) {
    if (s && Array.isArray(s.splits)) return s.splits;
  }
  return [];
}

function statVal(stat, keys) {
  for (const k of keys) {
    if (stat && stat[k] !== undefined && stat[k] !== null && stat[k] !== "") return stat[k];
  }
  return null;
}

function toInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseOuts(innings) {
  if (innings === null || innings === undefined || innings === "") return null;
  const s = String(innings);
  const [wholeRaw, fracRaw = "0"] = s.split(".");
  const whole = Number(wholeRaw);
  const frac = Number(fracRaw);
  if (!Number.isFinite(whole)) return null;
  if (frac === 0) return whole * 3;
  if (frac === 1 || frac === 2) return whole * 3 + frac;
  const decimal = Number(s);
  return Number.isFinite(decimal) ? Math.round(decimal * 3) : null;
}

function inningsDecimal(innings) {
  const outs = parseOuts(innings);
  return outs === null ? null : outs / 3;
}

function extractStageRow(split, sample, season, batchId, runId, sourceEndpoint) {
  const stat = split && split.stat ? split.stat : {};
  const game = split && split.game ? split.game : {};
  const team = split && split.team ? split.team : {};
  const opponent = split && split.opponent ? split.opponent : {};
  const innings = statVal(stat, ["inningsPitched"]);
  const gamePk = statVal(game, ["gamePk", "pk"]);
  const fieldKeys = Object.keys(stat || {}).sort();
  const rawShape = {
    split_keys: Object.keys(split || {}).sort(),
    stat_keys: fieldKeys,
    game_keys: Object.keys(game || {}).sort(),
    team_keys: Object.keys(team || {}).sort(),
    opponent_keys: Object.keys(opponent || {}).sort()
  };
  return {
    stage_id: `${batchId}_${sample.player_id}_${gamePk || rid("no_game_pk")}_${GROUP_TYPE}`,
    player_id: Number(sample.player_id),
    player_name: sample.player_name || null,
    game_pk: gamePk === null ? null : Number(gamePk),
    season: Number(season),
    game_date: statVal(split, ["date", "gameDate"]),
    team_id: statVal(team, ["id"]),
    opponent_team_id: statVal(opponent, ["id"]),
    opponent_team: statVal(opponent, ["name", "abbreviation"]),
    is_home: split && split.isHome !== undefined ? (split.isHome ? 1 : 0) : null,
    group_type: GROUP_TYPE,
    role: sample.role || null,
    innings_pitched: innings === null ? null : String(innings),
    innings_pitched_decimal: inningsDecimal(innings),
    outs_recorded: parseOuts(innings),
    batters_faced: toInt(statVal(stat, ["battersFaced"])),
    hits_allowed: toInt(statVal(stat, ["hits"])),
    runs_allowed: toInt(statVal(stat, ["runs"])),
    earned_runs: toInt(statVal(stat, ["earnedRuns"])),
    walks_allowed: toInt(statVal(stat, ["baseOnBalls", "walks"])),
    strikeouts: toInt(statVal(stat, ["strikeOuts", "strikeouts"])),
    home_runs_allowed: toInt(statVal(stat, ["homeRuns"])),
    pitches: toInt(statVal(stat, ["numberOfPitches", "pitches"])),
    balls: toInt(statVal(stat, ["balls"])),
    strikes: toInt(statVal(stat, ["strikes"])),
    wins: toInt(statVal(stat, ["wins"])),
    losses: toInt(statVal(stat, ["losses"])),
    saves: toInt(statVal(stat, ["saves"])),
    holds: toInt(statVal(stat, ["holds"])),
    blown_saves: toInt(statVal(stat, ["blownSaves"])),
    stat_shape_json: JSON.stringify(rawShape),
    raw_json: JSON.stringify(split),
    data_feed_key: DATA_FEED_KEY,
    source_key: SOURCE_KEY,
    source_endpoint: sourceEndpoint,
    source_season: Number(season),
    source_game_type: "R",
    ingestion_mode: "source_probe",
    batch_id: batchId,
    run_id: runId,
    certification_status: "SOURCE_PROBE_ONLY_NOT_CERTIFIED_FOR_PROMOTION",
    certification_grade: null,
    source_confidence: "SOURCE_PROBE_ONLY"
  };
}

async function insertStageRows(env, rows) {
  let written = 0;
  for (const r of rows) {
    await run(env.STATS_PITCHER_DB,
      `INSERT OR REPLACE INTO pitcher_game_log_stage (
        stage_id, player_id, player_name, game_pk, season, game_date, team_id, opponent_team_id, opponent_team, is_home, group_type, role,
        innings_pitched, innings_pitched_decimal, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed,
        pitches, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json, raw_json, data_feed_key, source_key, source_endpoint, source_season,
        source_game_type, ingestion_mode, batch_id, run_id, certification_status, certification_grade, source_confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      r.stage_id, r.player_id, r.player_name, r.game_pk, r.season, r.game_date, r.team_id, r.opponent_team_id, r.opponent_team, r.is_home, r.group_type, r.role,
      r.innings_pitched, r.innings_pitched_decimal, r.outs_recorded, r.batters_faced, r.hits_allowed, r.runs_allowed, r.earned_runs, r.walks_allowed, r.strikeouts, r.home_runs_allowed,
      r.pitches, r.balls, r.strikes, r.wins, r.losses, r.saves, r.holds, r.blown_saves, r.stat_shape_json, r.raw_json, r.data_feed_key, r.source_key, r.source_endpoint, r.source_season,
      r.source_game_type, r.ingestion_mode, r.batch_id, r.run_id, r.certification_status, r.certification_grade, r.source_confidence
    );
    written++;
  }
  return written;
}

async function insertOutcome(env, batchId, runId, mode, sample, outcome, rowCount, httpStatus, season, endpoint, error, raw) {
  await run(env.STATS_PITCHER_DB,
    `INSERT OR REPLACE INTO pitcher_game_log_player_outcomes (
      outcome_key, batch_id, run_id, mode, player_id, player_name, team_id, role_source, outcome_category, row_count, source_http_status, source_season, source_endpoint, source_error, source_response_preview, raw_outcome_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    `${batchId}_${sample.player_id}`, batchId, runId, mode, Number(sample.player_id), sample.player_name || null, sample.team_id || null, sample.role_source || null, outcome, rowCount, httpStatus, season, endpoint, error, raw ? JSON.stringify(raw).slice(0, 900) : null, raw ? JSON.stringify(raw) : null
  );
}

function confirmedFieldsFromRows(rows) {
  const confirmed = new Set();
  for (const r of rows) {
    for (const [key, value] of Object.entries(r)) {
      if (["stage_id", "player_name", "stat_shape_json", "raw_json", "data_feed_key", "source_key", "source_endpoint", "ingestion_mode", "batch_id", "run_id", "certification_status", "certification_grade", "source_confidence"].includes(key)) continue;
      if (value !== null && value !== undefined && value !== "") confirmed.add(key);
    }
  }
  return Array.from(confirmed).sort();
}

async function runSourceProbe(env, input) {
  const schema = await ensureSchema(env);
  const universeAudit = await auditPitcherUniverse(env);
  const season = Number(input.source_season || input.season || env.ACTIVE_SEASON || DEFAULT_SEASON);
  const batchId = `pitcher_source_probe_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const runId = input.run_id || rid("run_pitcher_probe");
  const mode = "source_probe";
  const liveBefore = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs");

  await run(env.STATS_PITCHER_DB,
    `INSERT INTO pitcher_game_log_batches (
      batch_id, run_id, mode, status, certification_status, certification_grade, worker_version, data_feed_key, source_key, source_endpoint, source_season, source_game_type, group_type,
      base_backfill_cutoff_date, delta_start_date, expected_pitcher_universe_count, live_rows_before, universe_audit_json, started_at, updated_at
    ) VALUES (?, ?, ?, 'RUNNING_SOURCE_PROBE', 'SOURCE_PROBE_ONLY_NOT_CERTIFIED_FOR_PROMOTION', 'PROBE_ONLY', ?, ?, ?, ?, ?, 'R', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, runId, mode, VERSION, DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_TEMPLATE, season, GROUP_TYPE, DEFAULT_BASE_CUTOFF, DEFAULT_DELTA_START,
    universeAudit.expected_pitcher_universe_count || 0, Number(liveBefore && liveBefore.c ? liveBefore.c : 0), JSON.stringify(universeAudit)
  );

  if (!universeAudit.ok || !universeAudit.sample_players.length) {
    const output = {
      ok: false,
      data_ok: false,
      status: "BLOCKED_NO_SOURCE_PROVEN_PITCHER_UNIVERSE",
      certification: "PITCHER_SOURCE_PROBE_BLOCKED_NO_SOURCE_PROVEN_UNIVERSE",
      batch_id: batchId,
      run_id: runId,
      universe_audit: universeAudit,
      schema_status: schema,
      rows_read: 0,
      rows_written: 1,
      external_calls_performed: 0
    };
    await run(env.STATS_PITCHER_DB,
      "UPDATE pitcher_game_log_batches SET status='BLOCKED_NO_SOURCE_PROVEN_PITCHER_UNIVERSE', certification_status=?, certification_grade='BLOCKED', error_json=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
      output.certification, JSON.stringify(output), batchId
    );
    return output;
  }

  const sample = universeAudit.sample_players[0];
  let sourceCall = null;
  let noDataCall = null;
  let stageRows = [];
  let stageWritten = 0;
  let sourceOutcome = "UNCLEAR";
  let noDataBehavior = "NOT_RUN";
  let sourceError = null;
  let noDataError = null;

  try {
    sourceCall = await fetchStatsApi(env, sample.player_id, season);
    const splits = getSplits(sourceCall.json);
    if (sourceCall.ok && splits.length > 0) {
      const maxRows = Math.max(1, Math.min(Number(input.max_probe_rows || 3), 3));
      stageRows = splits.slice(0, maxRows).map(split => extractStageRow(split, sample, season, batchId, runId, sourceCall.endpoint));
      stageWritten = await insertStageRows(env, stageRows);
      sourceOutcome = "PROMOTED_ROWS"; // outcome category mirror means source returned usable rows; v0.1.0 does not promote live.
    } else if (sourceCall.ok && splits.length === 0) {
      sourceOutcome = "TRUE_NO_DATA";
    } else {
      sourceOutcome = "SOURCE_ERROR";
      sourceError = `HTTP_${sourceCall.http_status}`;
    }
    await insertOutcome(env, batchId, runId, mode, sample, sourceOutcome, stageRows.length, sourceCall.http_status, season, sourceCall.endpoint, sourceError, { source_probe: true, split_count: splits.length, response_preview: sourceCall.text_preview });

    noDataCall = await fetchStatsApi(env, sample.player_id, NO_DATA_PROBE_SEASON);
    const noDataSplits = getSplits(noDataCall.json);
    if (noDataCall.ok && noDataSplits.length === 0) {
      noDataBehavior = "TRUE_NO_DATA_CLEAN_EMPTY_SPLITS";
    } else if (noDataCall.ok) {
      noDataBehavior = "NO_DATA_PROBE_RETURNED_ROWS_UNEXPECTED_REVIEW_REQUIRED";
      noDataError = "no_data_probe_returned_rows";
    } else {
      noDataBehavior = "NO_DATA_PROBE_HTTP_ERROR_REVIEW_REQUIRED";
      noDataError = `HTTP_${noDataCall.http_status}`;
    }
  } catch (err) {
    sourceOutcome = "SOURCE_ERROR";
    sourceError = String(err && err.message ? err.message : err);
  }

  const liveAfter = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs");
  const confirmedFields = confirmedFieldsFromRows(stageRows);
  const sourceProbeJson = {
    sample_player: sample,
    endpoint: sourceCall ? sourceCall.endpoint : null,
    http_status: sourceCall ? sourceCall.http_status : null,
    source_ok: sourceCall ? sourceCall.ok : false,
    split_count: sourceCall && sourceCall.json ? getSplits(sourceCall.json).length : 0,
    staged_sample_rows: stageRows.length,
    confirmed_fields: confirmedFields,
    first_stage_row_preview: stageRows[0] || null,
    source_shape_probe_only: true,
    no_live_promotion: true
  };
  const noDataProbeJson = {
    endpoint: noDataCall ? noDataCall.endpoint : null,
    http_status: noDataCall ? noDataCall.http_status : null,
    behavior: noDataBehavior,
    error: noDataError,
    no_data_probe_season: NO_DATA_PROBE_SEASON
  };

  const dataOk = sourceOutcome !== "SOURCE_ERROR" && sourceOutcome !== "UNCLEAR" && noDataBehavior === "TRUE_NO_DATA_CLEAN_EMPTY_SPLITS" && Number(liveBefore && liveBefore.c ? liveBefore.c : 0) === Number(liveAfter && liveAfter.c ? liveAfter.c : 0);
  const finalStatus = dataOk ? "SOURCE_PROBE_COMPLETED_NO_PROMOTION" : "SOURCE_PROBE_COMPLETED_REVIEW_REQUIRED";
  const certification = dataOk ? "PITCHER_GAME_LOGS_SOURCE_PROBE_COMPLETED_NO_PROMOTION" : "PITCHER_GAME_LOGS_SOURCE_PROBE_REVIEW_REQUIRED";

  await run(env.STATS_PITCHER_DB,
    `UPDATE pitcher_game_log_batches SET
      status=?, certification_status=?, certification_grade=?, expected_pitcher_universe_count=?, outcome_rows=(SELECT COUNT(*) FROM pitcher_game_log_player_outcomes WHERE batch_id=?),
      source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, rows_promoted=0,
      live_rows_after=?, source_probe_json=?, no_data_probe_json=?, error_json=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?`,
    finalStatus, certification, dataOk ? "PROBE_PASS" : "PROBE_REVIEW", universeAudit.expected_pitcher_universe_count || 0, batchId,
    sourceCall && noDataCall ? 2 : (sourceCall ? 1 : 0), sourceOutcome === "PROMOTED_ROWS" || sourceOutcome === "TRUE_NO_DATA" ? 1 : 0, noDataBehavior === "TRUE_NO_DATA_CLEAN_EMPTY_SPLITS" ? 1 : 0, sourceOutcome === "SOURCE_ERROR" ? 1 : 0, stageWritten,
    Number(liveAfter && liveAfter.c ? liveAfter.c : 0), JSON.stringify(sourceProbeJson), JSON.stringify(noDataProbeJson), sourceError ? JSON.stringify({ source_error: sourceError, no_data_error: noDataError }) : null, batchId
  );

  await run(env.STATS_PITCHER_DB,
    `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id, run_id, mode, status, expected_pitcher_universe_count, cursor_offset, current_player_id, max_api_calls_per_tick, max_rows_per_tick, continuation_required, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, 2, 3, 0, CURRENT_TIMESTAMP)`,
    batchId, runId, mode, finalStatus, universeAudit.expected_pitcher_universe_count || 0, sample.player_id
  );

  await run(env.STATS_PITCHER_DB,
    `INSERT OR REPLACE INTO pitcher_game_log_certifications (certification_id, batch_id, run_id, mode, status, certification_status, certification_grade, check_key, check_status, expected_value, actual_value, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'v0_1_0_source_probe_no_promotion', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    `${batchId}_source_probe`, batchId, runId, mode, finalStatus, certification, dataOk ? "PROBE_PASS" : "PROBE_REVIEW", dataOk ? "PASS" : "REVIEW", String(Number(liveBefore && liveBefore.c ? liveBefore.c : 0)), String(Number(liveAfter && liveAfter.c ? liveAfter.c : 0)), JSON.stringify({ universe_audit: universeAudit, source_probe: sourceProbeJson, no_data_probe: noDataProbeJson })
  );

  return {
    ok: true,
    data_ok: dataOk,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: finalStatus,
    certification,
    certification_grade: dataOk ? "PROBE_PASS" : "PROBE_REVIEW",
    mode,
    batch_id: batchId,
    run_id: runId,
    rows_read: stageRows.length,
    rows_written: 1 + stageWritten + 1 + 1 + 1,
    rows_staged: stageWritten,
    rows_promoted: 0,
    live_rows_before: Number(liveBefore && liveBefore.c ? liveBefore.c : 0),
    live_rows_after: Number(liveAfter && liveAfter.c ? liveAfter.c : 0),
    external_calls_performed: sourceCall && noDataCall ? 2 : (sourceCall ? 1 : 0),
    schema_status: schema,
    pitcher_universe_audit: universeAudit,
    source_probe_result: sourceProbeJson,
    no_data_behavior: noDataProbeJson,
    confirmed_fields: confirmedFields,
    no_promotion: true,
    no_full_base_backfill: true,
    no_delta: true,
    no_hitter_mutation: true,
    no_market_mutation: true,
    no_scoring: true,
    next_safe_step: dataOk ? "v0.2.0_base_backfill_stage_only_can_be_designed_after_review" : "review_v0.1.0_probe_output_before_v0.2.0"
  };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "SOURCE_LOCK_PROBE_READY",
    timestamp_utc: nowIso(),
    source_endpoint_template: SOURCE_ENDPOINT_TEMPLATE,
    base_backfill_cutoff_date_reserved: DEFAULT_BASE_CUTOFF,
    delta_start_date_reserved: DEFAULT_DELTA_START,
    active_scope: "schema + pitcher universe audit + source-shape probe only",
    hard_blocks: [
      "no live promotion",
      "no full pitcher base backfill",
      "no delta execution",
      "no hitter mutation",
      "no market mutation",
      "no scoring/ranking/final board"
    ],
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars)
    },
    bindings: db,
    vars
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return jsonResponse({ ok: true });
    if (method === "GET" && (path === "/" || path === "/health")) return jsonResponse(identity(env));

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...identity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, writes_performed: 0, external_calls_performed: 0 });
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const embedded = input && input.input_json && typeof input.input_json === "object" ? input.input_json : {};
      const mode = String(embedded.mode || input.mode || "source_probe");
      if (mode !== "source_probe" && mode !== "base_backfill_probe") {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: JOB_KEY,
          status: "BLOCKED_MODE_NOT_ENABLED_IN_V0_1_0",
          certification: "PITCHER_GAME_LOGS_V0_1_0_SOURCE_PROBE_ONLY",
          requested_mode: mode,
          enabled_modes: ["source_probe", "base_backfill_probe"],
          rows_promoted: 0,
          external_calls_performed: 0
        }, 200);
      }

      const mergedInput = { ...embedded, ...input, mode: "source_probe" };
      const out = await runSourceProbe(env, mergedInput);
      return jsonResponse({
        ...out,
        request_id: input.request_id || null,
        chain_id: input.chain_id || null,
        orchestrator_should_self_continue: false,
        continuation_required: false
      });
    }

    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /diagnostic", "POST /run"] }, 404);
  }
};
