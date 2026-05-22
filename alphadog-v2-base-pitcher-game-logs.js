const WORKER_NAME = "alphadog-v2-base-pitcher-game-logs";
const VERSION = "alphadog-v2-base-pitcher-game-logs-v0.4.3-scoped-repair-live-column-align-fix";
const JOB_KEY = "base-pitcher-game-logs";
const GROUP_TYPE = "pitching";
const SOURCE_KEY = "mlb_statsapi_pitcher_game_logs_v0_2_0";
const PROBE_DATA_FEED_KEY = "mlb_statsapi_pitcher_game_logs_2026_source_probe_v0_2_0";
const BASE_STAGE_DATA_FEED_KEY = "mlb_statsapi_pitcher_game_logs_2026_base_v0_2_0_stage_only";
const SOURCE_ENDPOINT_TEMPLATE = "https://statsapi.mlb.com/api/v1/people/{playerId}/stats?stats=gameLog&group=pitching&season={season}";
const DEFAULT_SEASON = 2026;
const DEFAULT_BASE_CUTOFF = "2026-05-18";
const DEFAULT_DELTA_START = "2026-05-19";
const NO_DATA_PROBE_SEASON = 1901;
const DEFAULT_MAX_API_CALLS_PER_TICK = 8;
const DEFAULT_MAX_STAGE_ROWS_PER_TICK = 1000;
const DEFAULT_MAX_PROMOTE_ROWS_PER_TICK = 500;
const DEFAULT_DELTA_LOOKBACK_DAYS = 7;
const BASE_LIVE_DATA_FEED_KEY = "mlb_statsapi_pitcher_game_logs_2026_base_v0_3_1_promoted";
const DELTA_DATA_FEED_KEY = "mlb_statsapi_pitcher_game_logs_2026_delta_v0_4_3_scoped_repair";

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
      delta_end_date TEXT,
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
    )`,
    `CREATE TABLE IF NOT EXISTS pitcher_game_log_repair_registry (
      registry_key TEXT PRIMARY KEY,
      target_batch_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      game_pk INTEGER NOT NULL,
      season INTEGER NOT NULL,
      group_type TEXT NOT NULL DEFAULT 'pitching',
      game_date TEXT,
      source_endpoint TEXT,
      status TEXT,
      created_by_version TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    "ALTER TABLE pitcher_game_logs ADD COLUMN group_type TEXT DEFAULT 'pitching'",
    "ALTER TABLE pitcher_game_logs ADD COLUMN player_name TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN opponent_team TEXT",
    "ALTER TABLE pitcher_game_logs ADD COLUMN innings_pitched_decimal REAL",
    "ALTER TABLE pitcher_game_logs ADD COLUMN balls INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN strikes INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN wins INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN losses INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN saves INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN holds INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN blown_saves INTEGER",
    "ALTER TABLE pitcher_game_logs ADD COLUMN stat_shape_json TEXT",
    "ALTER TABLE pitcher_game_log_batches ADD COLUMN delta_end_date TEXT",
    "ALTER TABLE pitcher_game_log_cursors ADD COLUMN cursor_json TEXT"
  ];
  for (const sql of alterStatements) ddlResults.push(await tryRun(db, sql));

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_batches_status ON pitcher_game_log_batches(status, mode)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_stage_batch ON pitcher_game_log_stage(batch_id, player_id, game_date)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_stage_key ON pitcher_game_log_stage(player_id, game_pk, group_type)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_outcomes_batch ON pitcher_game_log_player_outcomes(batch_id, outcome_category)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_cursors_status ON pitcher_game_log_cursors(status, mode)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_logs_lineage ON pitcher_game_logs(data_feed_key, batch_id, ingestion_mode)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_logs_group_key ON pitcher_game_logs(player_id, game_pk, group_type)",
    "CREATE INDEX IF NOT EXISTS idx_pitcher_logs_batch_promoted ON pitcher_game_logs(batch_id, data_feed_key, game_date)"
  ];
  for (const sql of indexes) ddlResults.push(await tryRun(db, sql));

  await tryRun(db,
    "INSERT OR REPLACE INTO pitcher_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('pitcher_game_logs_lifecycle_v0_4_0_delta_update_retained_stage', ?, CURRENT_TIMESTAMP, 'Additive pitcher game-log lifecycle schema, base promotion, and delta_update retained-stage support')",
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
    data_feed_key: PROBE_DATA_FEED_KEY,
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


async function getPitcherUniverseRows(env, limit = 10000, offset = 0) {
  const audit = await auditPitcherUniverse(env);
  if (!audit.ok || !audit.source_proven) return { audit, rows: [] };
  const rosterCols = await tableColumns(env.REF_DB, "ref_rosters");
  const playerCols = await tableColumns(env.REF_DB, "ref_players");
  if (audit.source === "REF_DB.ref_rosters.role") {
    const activeRosterFilter = has(rosterCols, "active") ? "AND COALESCE(r.active,1)=1" : "";
    const activePlayerFilter = has(playerCols, "active") ? "AND COALESCE(p.active,1)=1" : "";
    const rows = await all(env.REF_DB, `SELECT DISTINCT r.player_id, COALESCE(p.player_name,r.player_name,'') AS player_name, r.team_id, r.role AS role, 'ref_rosters.role' AS role_source FROM ref_rosters r LEFT JOIN ref_players p ON p.player_id=r.player_id WHERE r.player_id IS NOT NULL ${activeRosterFilter} ${activePlayerFilter} AND ${pitcherRoleWhere("r")} ORDER BY r.player_id LIMIT ? OFFSET ?`, limit, offset);
    return { audit, rows };
  }
  if (audit.source === "REF_DB.ref_players.primary_role") {
    const activePlayerFilter = has(playerCols, "active") ? "AND COALESCE(active,1)=1" : "";
    const rows = await all(env.REF_DB, `SELECT DISTINCT player_id, COALESCE(player_name,'') AS player_name, primary_team_id AS team_id, primary_role AS role, 'ref_players.primary_role' AS role_source FROM ref_players WHERE player_id IS NOT NULL ${activePlayerFilter} AND (LOWER(COALESCE(primary_role,'')) LIKE '%pitch%' OR UPPER(COALESCE(primary_role,'')) IN ('P','SP','RP','CP','LHP','RHP')) ORDER BY player_id LIMIT ? OFFSET ?`, limit, offset);
    return { audit, rows };
  }
  if (audit.source === "REF_DB.ref_rosters.raw_json") {
    const activeRosterFilter = has(rosterCols, "active") ? "AND COALESCE(r.active,1)=1" : "";
    const activePlayerFilter = has(playerCols, "active") ? "AND COALESCE(p.active,1)=1" : "";
    const rawWhere = `(LOWER(COALESCE(r.raw_json,'')) LIKE '%pitcher%' OR COALESCE(r.raw_json,'') LIKE '%\"abbreviation\":\"P\"%' OR COALESCE(r.raw_json,'') LIKE '%\"type\":\"Pitcher\"%')`;
    const rows = await all(env.REF_DB, `SELECT DISTINCT r.player_id, COALESCE(p.player_name,r.player_name,'') AS player_name, r.team_id, 'raw_json_pitcher_match' AS role, 'ref_rosters.raw_json' AS role_source FROM ref_rosters r LEFT JOIN ref_players p ON p.player_id=r.player_id WHERE r.player_id IS NOT NULL ${activeRosterFilter} ${activePlayerFilter} AND ${rawWhere} ORDER BY r.player_id LIMIT ? OFFSET ?`, limit, offset);
    return { audit, rows };
  }
  return { audit, rows: [] };
}

function stageRowForMode(row, opts) {
  return {
    ...row,
    stage_id: `${opts.batchId}_${row.player_id}_${row.game_pk || rid("no_game_pk")}_${GROUP_TYPE}`,
    data_feed_key: opts.dataFeedKey,
    source_key: SOURCE_KEY,
    source_endpoint: opts.sourceEndpoint,
    source_season: Number(opts.season),
    source_game_type: "R",
    ingestion_mode: opts.ingestionMode,
    batch_id: opts.batchId,
    run_id: opts.runId,
    certification_status: opts.certificationStatus,
    certification_grade: opts.certificationGrade || null,
    source_confidence: opts.sourceConfidence
  };
}

function extractStageRowForMode(split, sample, season, batchId, runId, sourceEndpoint, mode) {
  const base = extractStageRow(split, sample, season, batchId, runId, sourceEndpoint);
  let opts;
  if (mode === "base_backfill") {
    opts = { batchId, runId, season, sourceEndpoint, dataFeedKey: BASE_STAGE_DATA_FEED_KEY, ingestionMode: "base_backfill", certificationStatus: "BASE_STAGE_ONLY_NOT_CERTIFIED_FOR_PROMOTION", certificationGrade: "STAGE_ONLY", sourceConfidence: "HIGH" };
  } else if (mode === "delta_update") {
    opts = { batchId, runId, season, sourceEndpoint, dataFeedKey: DELTA_DATA_FEED_KEY, ingestionMode: "delta_update", certificationStatus: "DELTA_STAGE_CERTIFIED_READY_FOR_PROMOTION", certificationGrade: "DELTA_PASS", sourceConfidence: "HIGH" };
  } else {
    opts = { batchId, runId, season, sourceEndpoint, dataFeedKey: PROBE_DATA_FEED_KEY, ingestionMode: "source_probe", certificationStatus: "SOURCE_PROBE_ONLY_NOT_CERTIFIED_FOR_PROMOTION", certificationGrade: null, sourceConfidence: "SOURCE_PROBE_ONLY" };
  }
  return stageRowForMode(base, opts);
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
    batchId, runId, mode, VERSION, PROBE_DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_TEMPLATE, season, GROUP_TYPE, DEFAULT_BASE_CUTOFF, DEFAULT_DELTA_START,
    universeAudit.expected_pitcher_universe_count || 0, Number(liveBefore && liveBefore.c ? liveBefore.c : 0), JSON.stringify(universeAudit)
  );

  if (!universeAudit.ok || !universeAudit.sample_players.length) {
    const output = { ok: false, data_ok: false, status: "BLOCKED_NO_SOURCE_PROVEN_PITCHER_UNIVERSE", certification: "PITCHER_SOURCE_PROBE_BLOCKED_NO_SOURCE_PROVEN_UNIVERSE", batch_id: batchId, run_id: runId, universe_audit: universeAudit, schema_status: schema, rows_read: 0, rows_written: 1, external_calls_performed: 0 };
    await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_batches SET status='BLOCKED_NO_SOURCE_PROVEN_PITCHER_UNIVERSE', certification_status=?, certification_grade='BLOCKED', error_json=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", output.certification, JSON.stringify(output), batchId);
    return output;
  }

  const sample = universeAudit.sample_players[0];
  let sourceCall = null, noDataCall = null, stageRows = [], stageWritten = 0, sourceOutcome = "UNCLEAR", noDataBehavior = "NOT_RUN", sourceError = null, noDataError = null;
  try {
    sourceCall = await fetchStatsApi(env, sample.player_id, season);
    const splits = getSplits(sourceCall.json);
    if (sourceCall.ok && splits.length > 0) {
      const maxRows = Math.max(1, Math.min(Number(input.max_probe_rows || 3), 3));
      stageRows = splits.slice(0, maxRows).map(split => extractStageRowForMode(split, sample, season, batchId, runId, sourceCall.endpoint, "source_probe"));
      stageWritten = await insertStageRows(env, stageRows);
      sourceOutcome = "PROMOTED_ROWS";
    } else if (sourceCall.ok && splits.length === 0) sourceOutcome = "TRUE_NO_DATA";
    else { sourceOutcome = "SOURCE_ERROR"; sourceError = `HTTP_${sourceCall.http_status}`; }
    await insertOutcome(env, batchId, runId, mode, sample, sourceOutcome, stageRows.length, sourceCall.http_status, season, sourceCall.endpoint, sourceError, { source_probe: true, split_count: splits.length, response_preview: sourceCall.text_preview });
    noDataCall = await fetchStatsApi(env, sample.player_id, NO_DATA_PROBE_SEASON);
    const noDataSplits = getSplits(noDataCall.json);
    if (noDataCall.ok && noDataSplits.length === 0) noDataBehavior = "TRUE_NO_DATA_CLEAN_EMPTY_SPLITS";
    else if (noDataCall.ok) { noDataBehavior = "NO_DATA_PROBE_RETURNED_ROWS_UNEXPECTED_REVIEW_REQUIRED"; noDataError = "no_data_probe_returned_rows"; }
    else { noDataBehavior = "NO_DATA_PROBE_HTTP_ERROR_REVIEW_REQUIRED"; noDataError = `HTTP_${noDataCall.http_status}`; }
  } catch (err) { sourceOutcome = "SOURCE_ERROR"; sourceError = String(err && err.message ? err.message : err); }

  const liveAfter = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs");
  const confirmedFields = confirmedFieldsFromRows(stageRows);
  const sourceProbeJson = { sample_player: sample, endpoint: sourceCall ? sourceCall.endpoint : null, http_status: sourceCall ? sourceCall.http_status : null, source_ok: sourceCall ? sourceCall.ok : false, split_count: sourceCall && sourceCall.json ? getSplits(sourceCall.json).length : 0, staged_sample_rows: stageRows.length, confirmed_fields: confirmedFields, first_stage_row_preview: stageRows[0] || null, source_shape_probe_only: true, no_live_promotion: true };
  const noDataProbeJson = { endpoint: noDataCall ? noDataCall.endpoint : null, http_status: noDataCall ? noDataCall.http_status : null, behavior: noDataBehavior, error: noDataError, no_data_probe_season: NO_DATA_PROBE_SEASON };
  const dataOk = sourceOutcome !== "SOURCE_ERROR" && sourceOutcome !== "UNCLEAR" && noDataBehavior === "TRUE_NO_DATA_CLEAN_EMPTY_SPLITS" && Number(liveBefore && liveBefore.c ? liveBefore.c : 0) === Number(liveAfter && liveAfter.c ? liveAfter.c : 0);
  const finalStatus = dataOk ? "SOURCE_PROBE_COMPLETED_NO_PROMOTION" : "SOURCE_PROBE_COMPLETED_REVIEW_REQUIRED";
  const certification = dataOk ? "PITCHER_GAME_LOGS_SOURCE_PROBE_COMPLETED_NO_PROMOTION" : "PITCHER_GAME_LOGS_SOURCE_PROBE_REVIEW_REQUIRED";

  await run(env.STATS_PITCHER_DB,
    `UPDATE pitcher_game_log_batches SET status=?, certification_status=?, certification_grade=?, expected_pitcher_universe_count=?, outcome_rows=(SELECT COUNT(*) FROM pitcher_game_log_player_outcomes WHERE batch_id=?), source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, rows_promoted=0, live_rows_after=?, source_probe_json=?, no_data_probe_json=?, error_json=?, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    finalStatus, certification, dataOk ? "PROBE_PASS" : "PROBE_REVIEW", universeAudit.expected_pitcher_universe_count || 0, batchId, sourceCall && noDataCall ? 2 : (sourceCall ? 1 : 0), sourceOutcome === "PROMOTED_ROWS" || sourceOutcome === "TRUE_NO_DATA" ? 1 : 0, noDataBehavior === "TRUE_NO_DATA_CLEAN_EMPTY_SPLITS" ? 1 : 0, sourceOutcome === "SOURCE_ERROR" ? 1 : 0, stageWritten, Number(liveAfter && liveAfter.c ? liveAfter.c : 0), JSON.stringify(sourceProbeJson), JSON.stringify(noDataProbeJson), sourceError ? JSON.stringify({ source_error: sourceError, no_data_error: noDataError }) : null, batchId);
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id, run_id, mode, status, expected_pitcher_universe_count, cursor_offset, current_player_id, max_api_calls_per_tick, max_rows_per_tick, continuation_required, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 2, 3, 0, CURRENT_TIMESTAMP)`, batchId, runId, mode, finalStatus, universeAudit.expected_pitcher_universe_count || 0, sample.player_id);
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_certifications (certification_id, batch_id, run_id, mode, status, certification_status, certification_grade, check_key, check_status, expected_value, actual_value, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'v0_2_0_source_probe_no_promotion', ?, ?, ?, ?, CURRENT_TIMESTAMP)`, `${batchId}_source_probe`, batchId, runId, mode, finalStatus, certification, dataOk ? "PROBE_PASS" : "PROBE_REVIEW", dataOk ? "PASS" : "REVIEW", String(Number(liveBefore && liveBefore.c ? liveBefore.c : 0)), String(Number(liveAfter && liveAfter.c ? liveAfter.c : 0)), JSON.stringify({ universe_audit: universeAudit, source_probe: sourceProbeJson, no_data_probe: noDataProbeJson }));

  return { ok: true, data_ok: dataOk, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: finalStatus, certification, certification_grade: dataOk ? "PROBE_PASS" : "PROBE_REVIEW", mode, batch_id: batchId, run_id: runId, rows_read: stageRows.length, rows_written: 1 + stageWritten + 1 + 1 + 1, rows_staged: stageWritten, rows_promoted: 0, live_rows_before: Number(liveBefore && liveBefore.c ? liveBefore.c : 0), live_rows_after: Number(liveAfter && liveAfter.c ? liveAfter.c : 0), external_calls_performed: sourceCall && noDataCall ? 2 : (sourceCall ? 1 : 0), schema_status: schema, pitcher_universe_audit: universeAudit, source_probe_result: sourceProbeJson, no_data_behavior: noDataProbeJson, confirmed_fields: confirmedFields, no_promotion: true, no_full_base_backfill: true, no_delta: true, no_hitter_mutation: true, no_market_mutation: true, no_scoring: true };
}

async function latestBaseStageBatch(env) {
  return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE mode='base_backfill' AND data_feed_key=? ORDER BY datetime(created_at) DESC LIMIT 1", BASE_STAGE_DATA_FEED_KEY);
}

async function createBaseStageBatch(env, input, universeAudit, liveBefore) {
  const season = Number(input.source_season || input.season || env.ACTIVE_SEASON || DEFAULT_SEASON);
  const batchId = `pitcher_base_backfill_stage_batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const runId = input.run_id || rid("run_pitcher_base_stage");
  await run(env.STATS_PITCHER_DB,
    `INSERT INTO pitcher_game_log_batches (batch_id, run_id, mode, status, certification_status, certification_grade, worker_version, data_feed_key, source_key, source_endpoint, source_season, source_game_type, group_type, base_backfill_cutoff_date, delta_start_date, expected_pitcher_universe_count, live_rows_before, universe_audit_json, started_at, updated_at)
     VALUES (?, ?, 'base_backfill', 'RUNNING_BASE_BACKFILL_STAGE_ONLY', 'BASE_STAGE_ONLY_NOT_CERTIFIED_FOR_PROMOTION', 'STAGE_ONLY', ?, ?, ?, ?, ?, 'R', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, runId, VERSION, BASE_STAGE_DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_TEMPLATE, season, GROUP_TYPE, input.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF, DEFAULT_DELTA_START, universeAudit.expected_pitcher_universe_count || 0, Number(liveBefore && liveBefore.c ? liveBefore.c : 0), JSON.stringify(universeAudit)
  );
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id, run_id, mode, status, expected_pitcher_universe_count, cursor_offset, max_api_calls_per_tick, max_rows_per_tick, continuation_required, created_at, updated_at) VALUES (?, ?, 'base_backfill', 'RUNNING_BASE_BACKFILL_STAGE_ONLY', ?, 0, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, runId, universeAudit.expected_pitcher_universe_count || 0, Number(input.max_api_calls_per_tick || DEFAULT_MAX_API_CALLS_PER_TICK), Number(input.max_rows_per_tick || DEFAULT_MAX_STAGE_ROWS_PER_TICK));
  return await latestBaseStageBatch(env);
}

async function finalizeBaseStageOnly(env, batch, input, universeAudit) {
  const batchId = batch.batch_id;
  const liveAfter = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs");
  const stageCount = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=?", batchId);
  const outcomeCount = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_player_outcomes WHERE batch_id=?", batchId);
  const dupOut = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, COUNT(*) n FROM pitcher_game_log_player_outcomes WHERE batch_id=? GROUP BY player_id HAVING n>1)", batchId);
  const byOutcome = await all(env.STATS_PITCHER_DB, "SELECT outcome_category, COUNT(*) AS c, COALESCE(SUM(row_count),0) AS rows FROM pitcher_game_log_player_outcomes WHERE batch_id=? GROUP BY outcome_category ORDER BY outcome_category", batchId);
  const badStage = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND (player_id IS NULL OR game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR source_endpoint IS NULL OR raw_json IS NULL)", batchId);
  const dupStage = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, group_type, COUNT(*) n FROM pitcher_game_log_stage WHERE batch_id=? GROUP BY player_id, game_pk, group_type HAVING n>1)", batchId);
  const afterCutoff = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND date(game_date) > date(?)", batchId, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF);
  const sourceErrors = byOutcome.find(r => r.outcome_category === "SOURCE_ERROR");
  const repair = byOutcome.find(r => r.outcome_category === "REPAIR_REQUIRED");
  const unclear = byOutcome.find(r => r.outcome_category === "UNCLEAR");
  const expected = Number(batch.expected_pitcher_universe_count || universeAudit.expected_pitcher_universe_count || 0);
  const liveBefore = Number(batch.live_rows_before || 0);
  const liveNow = Number(liveAfter && liveAfter.c ? liveAfter.c : 0);
  const checks = {
    stage_rows_gt_zero: Number(stageCount && stageCount.c ? stageCount.c : 0) > 0,
    outcome_rows_equal_universe: Number(outcomeCount && outcomeCount.c ? outcomeCount.c : 0) === expected,
    duplicate_outcome_rows_zero: Number(dupOut && dupOut.c ? dupOut.c : 0) === 0,
    source_error_zero: Number(sourceErrors && sourceErrors.c ? sourceErrors.c : 0) === 0,
    repair_required_zero: Number(repair && repair.c ? repair.c : 0) === 0,
    unclear_zero: Number(unclear && unclear.c ? unclear.c : 0) === 0,
    duplicate_stage_keys_zero: Number(dupStage && dupStage.c ? dupStage.c : 0) === 0,
    rows_after_cutoff_zero: Number(afterCutoff && afterCutoff.c ? afterCutoff.c : 0) === 0,
    missing_required_stage_fields_zero: Number(badStage && badStage.c ? badStage.c : 0) === 0,
    live_rows_unchanged: liveBefore === liveNow
  };
  const pass = Object.values(checks).every(Boolean);
  const status = pass ? "BASE_BACKFILL_STAGE_ONLY_COMPLETED_NO_PROMOTION" : "BASE_BACKFILL_STAGE_ONLY_REVIEW_REQUIRED_NO_PROMOTION";
  const certification = pass ? "PITCHER_GAME_LOGS_BASE_BACKFILL_STAGE_ONLY_CERTIFIED_NO_PROMOTION" : "PITCHER_GAME_LOGS_BASE_BACKFILL_STAGE_ONLY_REVIEW_REQUIRED_NO_PROMOTION";
  const grade = pass ? "STAGE_PASS" : "STAGE_REVIEW";
  const finalOutcomeRows = Number(outcomeCount && outcomeCount.c ? outcomeCount.c : 0);
  const finalDuplicateOutcomeRows = Number(dupOut && dupOut.c ? dupOut.c : 0);
  const finalSourceRequestCount = finalOutcomeRows;
  const finalSourceSuccessCount = byOutcome
    .filter(r => ["PROMOTED_ROWS", "FILTERED_AFTER_CUTOFF"].includes(String(r.outcome_category || "")))
    .reduce((a, r) => a + Number(r.c || 0), 0);
  const finalSourceNoDataCount = byOutcome
    .filter(r => String(r.outcome_category || "") === "TRUE_NO_DATA")
    .reduce((a, r) => a + Number(r.c || 0), 0);
  const finalSourceErrorCount = Number(sourceErrors && sourceErrors.c ? sourceErrors.c : 0);
  await run(env.STATS_PITCHER_DB,
    `UPDATE pitcher_game_log_batches SET status=?, certification_status=?, certification_grade=?, outcome_rows=?, duplicate_outcome_rows=?, source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, rows_promoted=0, rows_after_cutoff=?, duplicate_stage_keys=?, live_rows_after=?, certified_at=CURRENT_TIMESTAMP, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, certification, grade, finalOutcomeRows, finalDuplicateOutcomeRows, finalSourceRequestCount, finalSourceSuccessCount, finalSourceNoDataCount, finalSourceErrorCount, Number(stageCount && stageCount.c ? stageCount.c : 0), Number(afterCutoff && afterCutoff.c ? afterCutoff.c : 0), Number(dupStage && dupStage.c ? dupStage.c : 0), liveNow, batchId);
  await run(env.STATS_PITCHER_DB,
    `UPDATE pitcher_game_log_stage
       SET certification_status=?, certification_grade=?, certified_at=COALESCE(certified_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?
       AND ingestion_mode='base_backfill'
       AND (certification_grade IS NULL OR certification_grade='')`,
    certification, grade, batchId);
  await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_cursors SET status=?, cursor_offset=?, continuation_required=0, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", status, expected, batchId);
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_certifications (certification_id, batch_id, run_id, mode, status, certification_status, certification_grade, check_key, check_status, expected_value, actual_value, details_json, created_at) VALUES (?, ?, ?, 'base_backfill', ?, ?, ?, 'v0_2_1_counter_finalization_no_promotion', ?, ?, ?, ?, CURRENT_TIMESTAMP)`, `${batchId}_stage_only_final`, batchId, batch.run_id, status, certification, grade, pass ? "PASS" : "REVIEW", JSON.stringify({ expected_pitcher_universe_count: expected }), JSON.stringify({ stage_rows: Number(stageCount && stageCount.c ? stageCount.c : 0), outcome_rows: Number(outcomeCount && outcomeCount.c ? outcomeCount.c : 0), live_rows_after: liveNow }), JSON.stringify({ checks, by_outcome: byOutcome }));
  return { pass, status, certification, certification_grade: grade, checks, by_outcome: byOutcome, stage_rows: Number(stageCount && stageCount.c ? stageCount.c : 0), outcome_rows: Number(outcomeCount && outcomeCount.c ? outcomeCount.c : 0), live_rows_before: liveBefore, live_rows_after: liveNow };
}

async function runBaseBackfillStageOnly(env, input) {
  const schema = await ensureSchema(env);
  const universeResult = await getPitcherUniverseRows(env, 3, 0);
  const universeAudit = universeResult.audit;
  const season = Number(input.source_season || input.season || env.ACTIVE_SEASON || DEFAULT_SEASON);
  const cutoff = input.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF;
  const liveBefore = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs");
  if (!universeAudit.ok || !universeAudit.source_proven || Number(universeAudit.expected_pitcher_universe_count || 0) <= 0) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BLOCKED_NO_SOURCE_PROVEN_PITCHER_UNIVERSE", certification: "PITCHER_BASE_STAGE_BLOCKED_NO_SOURCE_PROVEN_UNIVERSE", mode: "base_backfill", schema_status: schema, pitcher_universe_audit: universeAudit, rows_promoted: 0, external_calls_performed: 0 };
  }

  let batch = await latestBaseStageBatch(env);
  if (batch && ["BASE_BACKFILL_STAGE_ONLY_COMPLETED_NO_PROMOTION","BASE_BACKFILL_STAGE_ONLY_REVIEW_REQUIRED_NO_PROMOTION"].includes(String(batch.status || ""))) {
    const final = await finalizeBaseStageOnly(env, batch, input, universeAudit);
    return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "NOOP_BASE_STAGE_BATCH_ALREADY_EXISTS_NO_PROMOTION", certification: final.certification, certification_grade: final.certification_grade, mode: "base_backfill", batch_id: batch.batch_id, run_id: batch.run_id, rows_read: 0, rows_written: 0, rows_staged: final.stage_rows, rows_promoted: 0, live_rows_before: final.live_rows_before, live_rows_after: final.live_rows_after, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, pitcher_universe_audit: universeAudit, final_stage_certification: final, no_live_promotion: true };
  }
  if (!batch) batch = await createBaseStageBatch(env, { ...input, source_season: season, base_backfill_cutoff_date: cutoff }, universeAudit, liveBefore);

  let cursor = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_cursors WHERE batch_id=?", batch.batch_id);
  if (!cursor) {
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id, run_id, mode, status, expected_pitcher_universe_count, cursor_offset, max_api_calls_per_tick, max_rows_per_tick, continuation_required, created_at, updated_at) VALUES (?, ?, 'base_backfill', 'RUNNING_BASE_BACKFILL_STAGE_ONLY', ?, 0, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batch.batch_id, batch.run_id, universeAudit.expected_pitcher_universe_count || 0, Number(input.max_api_calls_per_tick || DEFAULT_MAX_API_CALLS_PER_TICK), Number(input.max_rows_per_tick || DEFAULT_MAX_STAGE_ROWS_PER_TICK));
    cursor = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_cursors WHERE batch_id=?", batch.batch_id);
  }

  const offset = Number(cursor.cursor_offset || 0);
  const expected = Number(universeAudit.expected_pitcher_universe_count || batch.expected_pitcher_universe_count || 0);
  const maxCalls = Math.max(1, Math.min(Number(input.max_api_calls_per_tick || cursor.max_api_calls_per_tick || DEFAULT_MAX_API_CALLS_PER_TICK), 20));
  const universePage = await getPitcherUniverseRows(env, maxCalls, offset);
  const players = universePage.rows || [];
  let externalCalls = 0, stageWritten = 0, rowsRead = 0, sourceErrors = 0;
  let currentPlayerId = null;
  const tickOutcomes = [];

  for (const player of players) {
    currentPlayerId = Number(player.player_id);
    let outcome = "UNCLEAR", filteredAfterCutoff = 0, stagedRows = [], err = null, call = null, splitCount = 0;
    try {
      call = await fetchStatsApi(env, player.player_id, season);
      externalCalls++;
      const splits = getSplits(call.json);
      splitCount = splits.length;
      if (call.ok && splits.length > 0) {
        const usable = [];
        for (const split of splits) {
          const row = extractStageRowForMode(split, player, season, batch.batch_id, batch.run_id, call.endpoint, "base_backfill");
          if (row.game_date && String(row.game_date).slice(0,10) > cutoff) filteredAfterCutoff++;
          else usable.push(row);
        }
        if (usable.length > 0) {
          stagedRows = usable;
          stageWritten += await insertStageRows(env, usable);
          rowsRead += usable.length;
          outcome = "PROMOTED_ROWS";
        } else {
          outcome = filteredAfterCutoff > 0 ? "FILTERED_AFTER_CUTOFF" : "TRUE_NO_DATA";
        }
      } else if (call.ok && splits.length === 0) outcome = "TRUE_NO_DATA";
      else { outcome = "SOURCE_ERROR"; err = `HTTP_${call.http_status}`; sourceErrors++; }
    } catch (e) { outcome = "SOURCE_ERROR"; err = String(e && e.message ? e.message : e); sourceErrors++; }
    await insertOutcome(env, batch.batch_id, batch.run_id, "base_backfill", player, outcome, stagedRows.length, call ? call.http_status : null, season, call ? call.endpoint : sourceEndpoint(env, player.player_id, season), err, { base_backfill_stage_only: true, split_count: splitCount, filtered_after_cutoff_count: filteredAfterCutoff, source_error: err, cutoff });
    if (filteredAfterCutoff > 0) {
      await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_player_outcomes SET filtered_after_cutoff_count=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND player_id=?", filteredAfterCutoff, batch.batch_id, Number(player.player_id));
    }
    tickOutcomes.push({ player_id: Number(player.player_id), player_name: player.player_name || null, outcome, staged_rows: stagedRows.length, filtered_after_cutoff: filteredAfterCutoff, split_count: splitCount });
  }

  const newOffset = Math.min(expected, offset + players.length);
  const remaining = Math.max(0, expected - newOffset);
  const continuation = remaining > 0 && players.length > 0;
  const liveAfter = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs");
  await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_cursors SET status=?, cursor_offset=?, current_player_id=?, continuation_required=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", continuation ? "RUNNING_BASE_BACKFILL_STAGE_ONLY" : "FINALIZING_BASE_BACKFILL_STAGE_ONLY", newOffset, currentPlayerId, continuation ? 1 : 0, batch.batch_id);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_game_log_batches SET status=?, expected_pitcher_universe_count=?, source_request_count=COALESCE(source_request_count,0)+?, source_error_count=COALESCE(source_error_count,0)+?, rows_staged=(SELECT COUNT(*) FROM pitcher_game_log_stage WHERE batch_id=?), outcome_rows=(SELECT COUNT(*) FROM pitcher_game_log_player_outcomes WHERE batch_id=?), rows_promoted=0, live_rows_after=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, continuation ? "RUNNING_BASE_BACKFILL_STAGE_ONLY" : "FINALIZING_BASE_BACKFILL_STAGE_ONLY", expected, externalCalls, sourceErrors, batch.batch_id, batch.batch_id, Number(liveAfter && liveAfter.c ? liveAfter.c : 0), batch.batch_id);

  if (continuation) {
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_BASE_PITCHER_GAME_LOGS", certification: "PITCHER_GAME_LOGS_BASE_BACKFILL_STAGE_ONLY_PARTIAL_CONTINUE", certification_grade: "PARTIAL", mode: "base_backfill", batch_id: batch.batch_id, run_id: batch.run_id, cursor_offset_before: offset, cursor_offset_after: newOffset, expected_pitcher_universe_count: expected, players_processed_this_tick: players.length, players_remaining: remaining, rows_read: rowsRead, rows_written: stageWritten + players.length + 2, rows_staged_this_tick: stageWritten, rows_promoted: 0, live_rows_before: Number(batch.live_rows_before || 0), live_rows_after: Number(liveAfter && liveAfter.c ? liveAfter.c : 0), external_calls_performed: externalCalls, tick_outcomes: tickOutcomes, continuation_required: true, orchestrator_should_self_continue: true, no_live_promotion: true, no_delta: true, no_hitter_mutation: true, no_market_mutation: true };
  }

  const finalBatch = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE batch_id=?", batch.batch_id);
  const final = await finalizeBaseStageOnly(env, finalBatch || batch, input, universeAudit);
  return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: final.status, certification: final.certification, certification_grade: final.certification_grade, mode: "base_backfill", batch_id: batch.batch_id, run_id: batch.run_id, cursor_offset_before: offset, cursor_offset_after: newOffset, expected_pitcher_universe_count: expected, players_processed_this_tick: players.length, players_remaining: 0, rows_read: rowsRead, rows_written: stageWritten + players.length + 3, rows_staged_this_tick: stageWritten, rows_staged: final.stage_rows, rows_promoted: 0, live_rows_before: final.live_rows_before, live_rows_after: final.live_rows_after, external_calls_performed: externalCalls, tick_outcomes: tickOutcomes, final_stage_certification: final, continuation_required: false, orchestrator_should_self_continue: false, no_live_promotion: true, next_safe_step: final.pass ? "Review stage-only outputs. v0.3.0 promotion/certification gates can be designed only after approval." : "Review failed stage-only gates before any promotion design." };
}


async function latestPromotionCandidateBatch(env) {
  return await first(env.STATS_PITCHER_DB,
    "SELECT * FROM pitcher_game_log_batches WHERE mode='base_backfill' AND data_feed_key=? ORDER BY datetime(created_at) DESC LIMIT 1",
    BASE_STAGE_DATA_FEED_KEY
  );
}

async function promotionGate(env, batch) {
  const batchId = batch && batch.batch_id;
  if (!batchId) return { pass: false, reason: "NO_BASE_STAGE_BATCH", checks: {} };
  const stageCount = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=?", batchId);
  const outcomeCount = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_player_outcomes WHERE batch_id=?", batchId);
  const dupOut = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, COUNT(*) n FROM pitcher_game_log_player_outcomes WHERE batch_id=? GROUP BY player_id HAVING n>1)", batchId);
  const badOut = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_player_outcomes WHERE batch_id=? AND outcome_category IN ('SOURCE_ERROR','REPAIR_REQUIRED','UNCLEAR')", batchId);
  const dupStage = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, COALESCE(group_type,'pitching') AS g, COUNT(*) n FROM pitcher_game_log_stage WHERE batch_id=? GROUP BY player_id, game_pk, COALESCE(group_type,'pitching') HAVING n>1)", batchId);
  const missing = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND (player_id IS NULL OR game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR source_endpoint IS NULL OR raw_json IS NULL OR data_feed_key IS NULL OR batch_id IS NULL OR run_id IS NULL OR certification_status IS NULL OR certification_grade IS NULL OR source_confidence IS NULL)", batchId);
  const afterCutoff = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND date(game_date) > date(?)", batchId, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF);
  const badStats = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND (
    COALESCE(strikeouts,0) < 0 OR COALESCE(walks_allowed,0) < 0 OR COALESCE(hits_allowed,0) < 0 OR COALESCE(runs_allowed,0) < 0 OR COALESCE(earned_runs,0) < 0 OR COALESCE(home_runs_allowed,0) < 0 OR COALESCE(outs_recorded,0) < 0 OR COALESCE(batters_faced,0) < 0 OR COALESCE(pitches,0) < 0 OR COALESCE(strikes,0) < 0 OR (strikes > pitches AND pitches IS NOT NULL AND strikes IS NOT NULL) OR (earned_runs > runs_allowed AND earned_runs IS NOT NULL AND runs_allowed IS NOT NULL)
  )`, batchId);
  const liveExisting = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? OR data_feed_key=?", batchId, BASE_LIVE_DATA_FEED_KEY);
  const expected = Number(batch.expected_pitcher_universe_count || 0);
  const checks = {
    stage_batch_status_safe: ["BASE_BACKFILL_STAGE_ONLY_COMPLETED_NO_PROMOTION", "PROMOTING_BASE_BACKFILL_MICROPHASE", "BASE_BACKFILL_PROMOTION_REVIEW_REQUIRED"].includes(String(batch.status || "")),
    stage_certified: (
      (String(batch.certification_status || "") === "PITCHER_GAME_LOGS_BASE_BACKFILL_STAGE_ONLY_CERTIFIED_NO_PROMOTION" && String(batch.certification_grade || "") === "STAGE_PASS") ||
      (String(batch.certification_status || "") === "PITCHER_GAME_LOGS_BASE_PROMOTION_MICROPHASE" && String(batch.certification_grade || "") === "PROMOTION_RUNNING")
    ),
    stage_rows_gt_zero: Number(stageCount && stageCount.c || 0) > 0,
    outcome_rows_equal_universe: Number(outcomeCount && outcomeCount.c || 0) === expected,
    duplicate_outcome_rows_zero: Number(dupOut && dupOut.c || 0) === 0,
    bad_outcomes_zero: Number(badOut && badOut.c || 0) === 0,
    duplicate_stage_keys_zero: Number(dupStage && dupStage.c || 0) === 0,
    missing_required_stage_fields_zero: Number(missing && missing.c || 0) === 0,
    rows_after_cutoff_zero: Number(afterCutoff && afterCutoff.c || 0) === 0,
    bad_stat_sanity_rows_zero: Number(badStats && badStats.c || 0) === 0,
    no_unexpected_prior_live_rows: Number(liveExisting && liveExisting.c || 0) === 0 || String(batch.status || "") === "PROMOTING_BASE_BACKFILL_MICROPHASE"
  };
  const pass = Object.values(checks).every(Boolean);
  return {
    pass,
    reason: pass ? "PROMOTION_GATE_PASS" : "PROMOTION_GATE_FAIL",
    checks,
    counts: {
      stage_rows: Number(stageCount && stageCount.c || 0),
      outcome_rows: Number(outcomeCount && outcomeCount.c || 0),
      duplicate_outcome_rows: Number(dupOut && dupOut.c || 0),
      bad_outcomes: Number(badOut && badOut.c || 0),
      duplicate_stage_keys: Number(dupStage && dupStage.c || 0),
      missing_required_stage_fields: Number(missing && missing.c || 0),
      rows_after_cutoff: Number(afterCutoff && afterCutoff.c || 0),
      bad_stat_sanity_rows: Number(badStats && badStats.c || 0),
      prior_live_rows_for_batch_or_feed: Number(liveExisting && liveExisting.c || 0)
    }
  };
}

async function promotePitcherStageChunk(env, batch, chunkSize) {
  const safeChunkSize = Math.max(1, Math.min(Number(chunkSize || DEFAULT_MAX_PROMOTE_ROWS_PER_TICK), DEFAULT_MAX_PROMOTE_ROWS_PER_TICK));
  const pending = await first(env.STATS_PITCHER_DB,
    `SELECT COUNT(*) AS c FROM (
       SELECT stage_id
       FROM pitcher_game_log_stage
       WHERE batch_id=? AND ingestion_mode='base_backfill' AND promoted_at IS NULL
       ORDER BY player_id, game_date, game_pk
       LIMIT ?
     )`,
    batch.batch_id, safeChunkSize
  );
  const promoteCount = Number(pending && pending.c || 0);
  if (promoteCount <= 0) return { promoted_this_tick: 0, remaining_after: 0 };

  await run(env.STATS_PITCHER_DB,
    `INSERT OR REPLACE INTO pitcher_game_logs (
      player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
      innings_pitched, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
      walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, updated_at,
      data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id,
      certification_status, certification_grade, certified_at, promoted_at, created_at, group_type,
      player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
    )
    SELECT
      player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
      innings_pitched_decimal, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
      walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, CURRENT_TIMESTAMP,
      ?, source_endpoint, source_season, source_game_type, 'base_backfill', batch_id, run_id,
      'PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED', 'BASE_PASS', COALESCE(certified_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(group_type,'pitching'),
      player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
    FROM pitcher_game_log_stage
    WHERE stage_id IN (
      SELECT stage_id
      FROM pitcher_game_log_stage
      WHERE batch_id=? AND ingestion_mode='base_backfill' AND promoted_at IS NULL
      ORDER BY player_id, game_date, game_pk
      LIMIT ?
    )`,
    BASE_LIVE_DATA_FEED_KEY, batch.batch_id, safeChunkSize
  );

  await run(env.STATS_PITCHER_DB,
    `UPDATE pitcher_game_log_stage
     SET promoted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
     WHERE stage_id IN (
       SELECT stage_id
       FROM pitcher_game_log_stage
       WHERE batch_id=? AND ingestion_mode='base_backfill' AND promoted_at IS NULL
       ORDER BY player_id, game_date, game_pk
       LIMIT ?
     )`,
    batch.batch_id, safeChunkSize
  );

  const remaining = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='base_backfill' AND promoted_at IS NULL", batch.batch_id);
  return { promoted_this_tick: promoteCount, remaining_after: Number(remaining && remaining.c || 0) };
}

async function finalizePromotionAndClean(env, batch, gate) {
  const batchId = batch.batch_id;
  const stageRowsBeforeClean = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=?", batchId);
  const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND data_feed_key=?", batchId, BASE_LIVE_DATA_FEED_KEY);
  const dupLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, COALESCE(group_type,'pitching') AS g, COUNT(*) n FROM pitcher_game_logs WHERE batch_id=? AND data_feed_key=? GROUP BY player_id, game_pk, COALESCE(group_type,'pitching') HAVING n>1)", batchId, BASE_LIVE_DATA_FEED_KEY);
  const afterCutoffLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND data_feed_key=? AND date(game_date) > date(?)", batchId, BASE_LIVE_DATA_FEED_KEY, batch.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF);
  const missingLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND data_feed_key=? AND (player_id IS NULL OR game_pk IS NULL OR game_date IS NULL OR team_id IS NULL OR source_endpoint IS NULL OR raw_json IS NULL OR certification_grade IS NULL OR certification_status IS NULL)", batchId, BASE_LIVE_DATA_FEED_KEY);
  const expectedRows = Number(batch.rows_staged || (gate && gate.counts && gate.counts.stage_rows) || stageRowsBeforeClean && stageRowsBeforeClean.c || 0);
  const checks = {
    live_rows_match_stage_rows: Number(liveRows && liveRows.c || 0) === expectedRows,
    duplicate_live_keys_zero: Number(dupLive && dupLive.c || 0) === 0,
    live_rows_after_cutoff_zero: Number(afterCutoffLive && afterCutoffLive.c || 0) === 0,
    missing_required_live_fields_zero: Number(missingLive && missingLive.c || 0) === 0
  };
  const pass = Object.values(checks).every(Boolean);
  if (!pass) {
    await run(env.STATS_PITCHER_DB,
      "UPDATE pitcher_game_log_batches SET status='BASE_BACKFILL_PROMOTION_REVIEW_REQUIRED', certification_status='PITCHER_GAME_LOGS_BASE_PROMOTION_REVIEW_REQUIRED', certification_grade='PROMOTION_REVIEW', rows_promoted=?, live_rows_after=?, error_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
      Number(liveRows && liveRows.c || 0), Number(liveRows && liveRows.c || 0), JSON.stringify({ checks, gate }), batchId
    );
    return { pass: false, status: "BASE_BACKFILL_PROMOTION_REVIEW_REQUIRED", certification: "PITCHER_GAME_LOGS_BASE_PROMOTION_REVIEW_REQUIRED", certification_grade: "PROMOTION_REVIEW", checks, stage_rows_after_clean: Number(stageRowsBeforeClean && stageRowsBeforeClean.c || 0), live_rows: Number(liveRows && liveRows.c || 0) };
  }
  await run(env.STATS_PITCHER_DB, "DELETE FROM pitcher_game_log_stage WHERE batch_id=?", batchId);
  const stageAfterClean = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=?", batchId);
  await run(env.STATS_PITCHER_DB,
    `UPDATE pitcher_game_log_batches SET
      status='COMPLETED_PROMOTED_CLEANED',
      certification_status='BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED',
      certification_grade='BASE_PASS',
      rows_promoted=?,
      live_rows_after=?,
      duplicate_stage_keys=0,
      rows_after_cutoff=0,
      promoted_at=CURRENT_TIMESTAMP,
      cleaned_at=CURRENT_TIMESTAMP,
      finished_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`,
    Number(liveRows && liveRows.c || 0), Number(liveRows && liveRows.c || 0), batchId
  );
  await run(env.STATS_PITCHER_DB,
    "UPDATE pitcher_game_log_cursors SET status='COMPLETED_PROMOTED_CLEANED', continuation_required=0, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
    batchId
  );
  await run(env.STATS_PITCHER_DB,
    `INSERT OR REPLACE INTO pitcher_game_log_certifications (certification_id, batch_id, run_id, mode, status, certification_status, certification_grade, check_key, check_status, expected_value, actual_value, details_json, created_at)
     VALUES (?, ?, ?, 'base_backfill', 'COMPLETED_PROMOTED_CLEANED', 'BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED', 'BASE_PASS', 'v0_3_0_base_promotion_and_cleanup', 'PASS', ?, ?, ?, CURRENT_TIMESTAMP)`,
    `${batchId}_base_promotion_cleaned`, batchId, batch.run_id, String(expectedRows), String(Number(liveRows && liveRows.c || 0)), JSON.stringify({ checks, gate, stage_rows_before_clean: expectedRows, stage_rows_after_clean: Number(stageAfterClean && stageAfterClean.c || 0) })
  );
  return { pass: true, status: "COMPLETED_PROMOTED_CLEANED", certification: "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED", certification_grade: "BASE_PASS", checks, stage_rows_after_clean: Number(stageAfterClean && stageAfterClean.c || 0), live_rows: Number(liveRows && liveRows.c || 0) };
}

async function runBasePromotionMicrophase(env, input) {
  const schema = await ensureSchema(env);
  const batch = await latestPromotionCandidateBatch(env);
  if (!batch) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BLOCKED_NO_CERTIFIED_STAGE_BATCH", certification: "BASE_PITCHER_GAME_LOGS_PROMOTION_BLOCKED_NO_STAGE_BATCH", mode: "base_backfill", rows_promoted: 0, external_calls_performed: 0, schema_status: schema };
  }
  if (String(batch.status || "") === "COMPLETED_PROMOTED_CLEANED") {
    const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND data_feed_key=?", batch.batch_id, BASE_LIVE_DATA_FEED_KEY);
    const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=?", batch.batch_id);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "NOOP_BASE_ALREADY_PROMOTED_CLEANED", certification: "BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED", certification_grade: "BASE_PASS", mode: "base_backfill", batch_id: batch.batch_id, run_id: batch.run_id, rows_read: 0, rows_written: 0, rows_promoted: Number(liveRows && liveRows.c || 0), live_rows_after: Number(liveRows && liveRows.c || 0), stage_rows_after_clean: Number(stageRows && stageRows.c || 0), external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false };
  }
  const gate = await promotionGate(env, batch);
  if (!gate.pass) {
    await run(env.STATS_PITCHER_DB,
      "UPDATE pitcher_game_log_batches SET status='BASE_BACKFILL_PROMOTION_BLOCKED_GATE_FAIL', certification_status='PITCHER_GAME_LOGS_BASE_PROMOTION_GATE_FAILED', certification_grade='PROMOTION_BLOCKED', error_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
      JSON.stringify(gate), batch.batch_id
    );
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BASE_BACKFILL_PROMOTION_BLOCKED_GATE_FAIL", certification: "PITCHER_GAME_LOGS_BASE_PROMOTION_GATE_FAILED", certification_grade: "PROMOTION_BLOCKED", mode: "base_backfill", batch_id: batch.batch_id, run_id: batch.run_id, promotion_gate: gate, rows_promoted: 0, external_calls_performed: 0, no_mlb_calls: true };
  }

  await run(env.STATS_PITCHER_DB,
    "UPDATE pitcher_game_log_batches SET status='PROMOTING_BASE_BACKFILL_MICROPHASE', certification_status='PITCHER_GAME_LOGS_BASE_PROMOTION_MICROPHASE', certification_grade='PROMOTION_RUNNING', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
    batch.batch_id
  );
  const chunkSize = Math.max(1, Math.min(Number(input.max_promote_rows_per_tick || DEFAULT_MAX_PROMOTE_ROWS_PER_TICK), DEFAULT_MAX_PROMOTE_ROWS_PER_TICK));
  const beforeRemaining = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='base_backfill' AND promoted_at IS NULL", batch.batch_id);
  const promoted = await promotePitcherStageChunk(env, batch, chunkSize);
  const liveRowsNow = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND data_feed_key=?", batch.batch_id, BASE_LIVE_DATA_FEED_KEY);
  await run(env.STATS_PITCHER_DB,
    "UPDATE pitcher_game_log_batches SET rows_promoted=?, live_rows_after=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
    Number(liveRowsNow && liveRowsNow.c || 0), Number(liveRowsNow && liveRowsNow.c || 0), batch.batch_id
  );
  if (promoted.remaining_after > 0) {
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_BASE_PITCHER_GAME_LOGS_PROMOTION", certification: "PITCHER_GAME_LOGS_BASE_PROMOTION_MICROPHASE", certification_grade: "PROMOTION_RUNNING", mode: "base_backfill", batch_id: batch.batch_id, run_id: batch.run_id, rows_read: promoted.promoted_this_tick, rows_written: promoted.promoted_this_tick, rows_promoted: Number(liveRowsNow && liveRowsNow.c || 0), promoted_this_tick: promoted.promoted_this_tick, remaining_unpromoted_stage_rows_before: Number(beforeRemaining && beforeRemaining.c || 0), remaining_unpromoted_stage_rows_after: promoted.remaining_after, live_rows_after: Number(liveRowsNow && liveRowsNow.c || 0), external_calls_performed: 0, continuation_required: true, orchestrator_should_self_continue: true, no_mlb_calls: true, no_delta: true, no_hitter_mutation: true, no_market_mutation: true };
  }
  const freshBatch = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE batch_id=?", batch.batch_id);
  const final = await finalizePromotionAndClean(env, freshBatch || batch, gate);
  return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: final.status, certification: final.certification, certification_grade: final.certification_grade, mode: "base_backfill", batch_id: batch.batch_id, run_id: batch.run_id, rows_read: promoted.promoted_this_tick, rows_written: promoted.promoted_this_tick + 3, rows_promoted: final.live_rows, promoted_this_tick: promoted.promoted_this_tick, live_rows_after: final.live_rows, stage_rows_after_clean: final.stage_rows_after_clean, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, final_promotion_verification: final, promotion_gate: gate, no_mlb_calls: true, no_delta: true, no_hitter_mutation: true, no_market_mutation: true, next_safe_step: final.pass ? "Base pitcher game logs locked. Delta design can be audited next, but do not build delta without approval." : "Review promotion verification failure before any cleanup or delta." };
}


function isoDateOnly(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(String(dateStr) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return isoDateOnly(d);
}
function todayUtcDate() { return isoDateOnly(new Date()); }
function isFinalMlbGame(game) {
  const status = game && game.status ? game.status : {};
  const abstractState = String(status.abstractGameState || "").toLowerCase();
  const detailed = String(status.detailedState || "").toLowerCase();
  const coded = String(status.codedGameState || "").toUpperCase();
  return abstractState === "final" || coded === "F" || detailed === "final" || detailed === "game over" || detailed === "completed early";
}
async function fetchJsonEndpoint(env, endpoint) {
  const resp = await fetch(endpoint, { headers: env.MLB_API_USER_AGENT ? { "user-agent": String(env.MLB_API_USER_AGENT) } : {} });
  const text = await resp.text();
  let body = null;
  try { body = JSON.parse(text || "{}"); } catch (err) { return { ok: false, endpoint, http_status: resp.status, error: `json_parse_failed:${String(err && err.message ? err.message : err)}`, text_preview: String(text || "").slice(0, 500), json: null }; }
  return { ok: resp.ok, endpoint, http_status: resp.status, error: resp.ok ? null : `HTTP_${resp.status}`, text_preview: String(text || "").slice(0, 500), json: body };
}
async function determineLatestCompleteGameDate(env, deltaFloorDate) {
  const today = todayUtcDate();
  const endpoint = `${mlbBaseUrl(env)}/schedule?sportId=1&gameTypes=R&startDate=${encodeURIComponent(deltaFloorDate)}&endDate=${encodeURIComponent(today)}`;
  const out = await fetchJsonEndpoint(env, endpoint);
  if (!out.ok) return { ok: false, endpoint, error: out.error || `HTTP_${out.http_status}`, today_utc: today };
  let latest = null;
  for (const d of (Array.isArray(out.json && out.json.dates) ? out.json.dates : [])) {
    const dateStr = String((d && d.date) || "");
    const games = Array.isArray(d && d.games) ? d.games : [];
    if (!dateStr || games.length === 0) continue;
    if (games.every(isFinalMlbGame) && (!latest || dateStr > latest)) latest = dateStr;
  }
  if (!latest) return { ok: false, endpoint, error: "NO_COMPLETE_FINAL_MLB_GAME_DATE_IN_DELTA_RANGE", today_utc: today };
  return { ok: true, endpoint, latest_complete_game_date: latest, today_utc: today };
}
async function completedGamesInWindow(env, startDate, endDate) {
  const endpoint = `${mlbBaseUrl(env)}/schedule?sportId=1&gameTypes=R&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  const out = await fetchJsonEndpoint(env, endpoint);
  if (!out.ok) return { ok: false, endpoint, error: out.error || `HTTP_${out.http_status}`, games: [], external_calls: 1 };
  const games = [];
  for (const d of (Array.isArray(out.json && out.json.dates) ? out.json.dates : [])) {
    const dateStr = String((d && d.date) || "");
    for (const g of (Array.isArray(d && d.games) ? d.games : [])) {
      if (isFinalMlbGame(g) && g && g.gamePk) games.push({ game_pk: Number(g.gamePk), game_date: dateStr });
    }
  }
  return { ok: true, endpoint, games, external_calls: 1 };
}
function addBoxscorePitcherTarget(targets, player, teamId, gamePk, gameDate) {
  if (!player || !player.person || !player.person.id) return;
  const stats = player.stats && player.stats.pitching ? player.stats.pitching : null;
  if (!stats || typeof stats !== "object" || Object.keys(stats).length === 0) return;
  const pid = Number(player.person.id);
  if (!pid || targets.has(pid)) return;
  targets.set(pid, {
    player_id: pid,
    player_name: String(player.person.fullName || player.person.full_name || ""),
    team_id: teamId === null || teamId === undefined ? null : String(teamId),
    role: "P",
    role_source: "mlb_schedule_boxscore_pitching_stats",
    first_seen_game_pk: gamePk,
    first_seen_game_date: gameDate
  });
}
async function discoverScopedPitcherDeltaTargets(env, startDate, endDate) {
  const schedule = await completedGamesInWindow(env, startDate, endDate);
  if (!schedule.ok) return { ok: false, error: schedule.error, schedule_endpoint: schedule.endpoint, target_pitchers: [], games: [], external_calls: schedule.external_calls || 1 };
  const targets = new Map();
  let externalCalls = schedule.external_calls || 1;
  const boxscores = [];
  for (const game of schedule.games) {
    const endpoint = `${mlbBaseUrl(env)}/game/${game.game_pk}/boxscore`;
    const box = await fetchJsonEndpoint(env, endpoint);
    externalCalls++;
    boxscores.push({ game_pk: game.game_pk, game_date: game.game_date, ok: box.ok, endpoint, error: box.error || null });
    if (!box.ok) continue;
    const teams = box.json && box.json.teams ? box.json.teams : {};
    for (const side of ["away", "home"]) {
      const team = teams && teams[side] ? teams[side] : null;
      const teamId = team && team.team && team.team.id ? team.team.id : null;
      const players = team && team.players ? team.players : {};
      for (const p of Object.values(players)) addBoxscorePitcherTarget(targets, p, teamId, game.game_pk, game.game_date);
    }
  }
  const target_pitchers = Array.from(targets.values()).sort((a,b) => Number(a.player_id)-Number(b.player_id));
  return { ok: true, schedule_endpoint: schedule.endpoint, games: schedule.games, boxscores, target_pitchers, targeted_pitcher_count: target_pitchers.length, external_calls: externalCalls, scope: "completed_games_boxscore_pitchers_only", no_full_universe_sweep: true };
}
async function latestCompletedBaseBatch(env) {
  return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE mode='base_backfill' AND status='COMPLETED_PROMOTED_CLEANED' AND certification_status='BASE_PITCHER_GAME_LOGS_BASE_BACKFILL_CERTIFIED' AND certification_grade='BASE_PASS' ORDER BY datetime(finished_at) DESC LIMIT 1");
}
async function pitcherDeltaBaseGate(env) {
  const base = await latestCompletedBaseBatch(env);
  if (!base) return { pass: false, reason: "NO_COMPLETED_PROMOTED_CLEANED_BASE_BATCH" };
  const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='base_backfill'", base.batch_id);
  const dupLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, COALESCE(group_type,'pitching') g, COUNT(*) n FROM pitcher_game_logs WHERE batch_id=? GROUP BY player_id, game_pk, COALESCE(group_type,'pitching') HAVING n>1)", base.batch_id);
  const afterCutoff = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND date(game_date) > date(?)", base.batch_id, base.base_backfill_cutoff_date || DEFAULT_BASE_CUTOFF);
  const outcomeRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_player_outcomes WHERE batch_id=?", base.batch_id);
  const expectedRows = Number(base.rows_promoted || base.live_rows_after || 0);
  const expectedUniverse = Number(base.expected_pitcher_universe_count || 0);
  const checks = {
    base_status_locked: true,
    live_rows_match_base: Number(liveRows && liveRows.c || 0) === expectedRows && expectedRows > 0,
    duplicate_live_keys_zero: Number(dupLive && dupLive.c || 0) === 0,
    base_rows_after_cutoff_zero: Number(afterCutoff && afterCutoff.c || 0) === 0,
    outcome_rows_match_universe: Number(outcomeRows && outcomeRows.c || 0) === expectedUniverse && expectedUniverse > 0
  };
  return { pass: Object.values(checks).every(Boolean), base_batch: base, checks, counts: { live_rows: Number(liveRows && liveRows.c || 0), expected_rows: expectedRows, duplicate_live_keys: Number(dupLive && dupLive.c || 0), base_rows_after_cutoff: Number(afterCutoff && afterCutoff.c || 0), outcome_rows: Number(outcomeRows && outcomeRows.c || 0), expected_pitcher_universe_count: expectedUniverse } };
}
async function latestRetainedPitcherDelta(env) {
  return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE mode='delta_update' AND status='COMPLETED_PROMOTED_STAGE_RETAINED' ORDER BY datetime(finished_at) DESC LIMIT 1");
}
async function retainedDeltaParity(env, batch) {
  if (!batch || !batch.batch_id) return { pass: false, reason: "NO_DELTA_BATCH" };
  const stage = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c, MIN(game_date) AS min_date, MAX(game_date) AS max_date FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update'", batch.batch_id);
  const live = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c, MIN(game_date) AS min_date, MAX(game_date) AS max_date FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update'", batch.batch_id);
  const missing = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage s WHERE s.batch_id=? AND s.ingestion_mode='delta_update' AND NOT EXISTS (SELECT 1 FROM pitcher_game_logs l WHERE l.batch_id=s.batch_id AND l.player_id=s.player_id AND l.game_pk=s.game_pk AND COALESCE(l.group_type,'pitching')=COALESCE(s.group_type,'pitching'))", batch.batch_id);
  const dupLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, COALESCE(group_type,'pitching') g, COUNT(*) n FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update' GROUP BY player_id, game_pk, COALESCE(group_type,'pitching') HAVING n>1)", batch.batch_id);
  return { pass: Number(missing && missing.c || 0) === 0 && Number(dupLive && dupLive.c || 0) === 0 && Number(stage && stage.c || 0) === Number(live && live.c || 0), batch_id: batch.batch_id, stage_rows: Number(stage && stage.c || 0), live_rows: Number(live && live.c || 0), missing_live_rows: Number(missing && missing.c || 0), duplicate_live_keys: Number(dupLive && dupLive.c || 0), stage_min_game_date: stage && stage.min_date, stage_max_game_date: stage && stage.max_date, live_min_game_date: live && live.min_date, live_max_game_date: live && live.max_date };
}
async function createPitcherDeltaBatch(env, input, targetAudit, windowInfo) {
  const batchId = input.preserved_batch_id && input.extend_retained_batch ? String(input.preserved_batch_id) : rid("pitcher_delta_update_batch");
  const runId = input.run_id || rid("run_delta_pitcher_logs");
  const existing = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE batch_id=?", batchId);
  const liveBefore = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs");
  if (!existing) {
    await run(env.STATS_PITCHER_DB,
      `INSERT INTO pitcher_game_log_batches (batch_id, run_id, mode, status, certification_status, certification_grade, worker_version, data_feed_key, source_key, source_endpoint, source_season, source_game_type, group_type, base_backfill_cutoff_date, delta_start_date, delta_end_date, expected_pitcher_universe_count, live_rows_before, universe_audit_json, started_at, updated_at)
       VALUES (?, ?, 'delta_update', 'DELTA_RUNNING_SCOPED_TARGETS', 'DELTA_PITCHER_GAME_LOGS_SCOPED_TARGETS_PARTIAL_CONTINUE', 'DELTA_RUNNING', ?, ?, ?, ?, ?, 'R', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      batchId, runId, VERSION, DELTA_DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_TEMPLATE, Number(input.source_season || input.season || env.ACTIVE_SEASON || DEFAULT_SEASON), GROUP_TYPE, DEFAULT_BASE_CUTOFF, windowInfo.delta_start_date, windowInfo.delta_end_date, targetAudit.targeted_pitcher_count || 0, Number(liveBefore && liveBefore.c || 0), JSON.stringify({ targetAudit, windowInfo })
    );
  } else {
    await run(env.STATS_PITCHER_DB,
      "UPDATE pitcher_game_log_batches SET run_id=?, worker_version=?, delta_end_date=?, expected_pitcher_universe_count=?, universe_audit_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?",
      runId, VERSION, windowInfo.delta_end_date, Math.max(Number(existing.expected_pitcher_universe_count || 0), Number(targetAudit.targeted_pitcher_count || 0)), JSON.stringify({ targetAudit, windowInfo, retained_extension: true }), batchId
    );
  }
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id, run_id, mode, status, expected_pitcher_universe_count, cursor_offset, max_api_calls_per_tick, max_rows_per_tick, continuation_required, created_at, updated_at) VALUES (?, ?, 'delta_update', 'DELTA_RUNNING_SCOPED_TARGETS', ?, 0, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, batchId, runId, targetAudit.targeted_pitcher_count || 0, DEFAULT_MAX_API_CALLS_PER_TICK, DEFAULT_MAX_STAGE_ROWS_PER_TICK);
  return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE batch_id=?", batchId);
}
async function activePitcherDeltaBatch(env) {
  const cursor = await first(env.STATS_PITCHER_DB, "SELECT batch_id FROM pitcher_game_log_cursors WHERE mode='delta_update' AND continuation_required=1 ORDER BY datetime(updated_at) DESC LIMIT 1");
  if (cursor && cursor.batch_id) return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE batch_id=?", cursor.batch_id);
  return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE mode='delta_update' AND status IN ('DELTA_RUNNING_SCOPED_TARGETS','DELTA_RUNNING','PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS','DELTA_STAGED_READY_FOR_CERTIFICATION','DELTA_PROMOTING') ORDER BY datetime(created_at) DESC LIMIT 1");
}
function splitDate(split) { return statVal(split, ["date", "gameDate"]); }
async function processPitcherDeltaPlayer(env, sample, season, batchId, runId, startDate, endDate, maxRows) {
  const call = await fetchStatsApi(env, sample.player_id, season);
  const splits = getSplits(call.json);
  let filtered = 0;
  const rows = [];
  if (call.ok) {
    for (const split of splits) {
      const d = splitDate(split);
      if (!d || d < startDate || d > endDate) { filtered++; continue; }
      if (rows.length < maxRows) rows.push(extractStageRowForMode(split, sample, season, batchId, runId, call.endpoint, "delta_update"));
    }
  }
  return { call, splits_count: splits.length, rows, filtered_outside_window_count: filtered };
}
async function finalizeDeltaStageAndPromote(env, batch) {
  const batchId = batch.batch_id;
  const expected = Number(batch.expected_pitcher_universe_count || 0);
  const outcomeCount = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_player_outcomes WHERE batch_id=?", batchId);
  const badOut = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_player_outcomes WHERE batch_id=? AND outcome_category IN ('SOURCE_ERROR','REPAIR_REQUIRED','UNCLEAR')", batchId);
  const dupStage = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, COALESCE(group_type,'pitching') g, COUNT(*) n FROM pitcher_game_log_stage WHERE batch_id=? GROUP BY player_id, game_pk, COALESCE(group_type,'pitching') HAVING n>1)", batchId);
  const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update'", batchId);
  const outside = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND (date(game_date)<date(?) OR date(game_date)>date(?))", batchId, batch.delta_start_date || DEFAULT_DELTA_START, batch.delta_end_date || DEFAULT_DELTA_START);
  const gatePass = Number(outcomeCount && outcomeCount.c || 0) >= expected && Number(badOut && badOut.c || 0) === 0 && Number(dupStage && dupStage.c || 0) === 0 && Number(outside && outside.c || 0) === 0;
  if (!gatePass) {
    return { pass: false, done: true, status: "DELTA_CERTIFICATION_FAILED", certification: "DELTA_PITCHER_GAME_LOGS_CERTIFICATION_FAILED", certification_grade: "DELTA_FAIL", rows_promoted: 0, details: { outcomeCount, badOut, dupStage, stageRows, outside, expected } };
  }
  const promoteChunk = DEFAULT_MAX_PROMOTE_ROWS_PER_TICK;
  const pending = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update' AND promoted_at IS NULL", batchId);
  const pendingCount = Number(pending && pending.c || 0);
  if (pendingCount > 0) {
    await run(env.STATS_PITCHER_DB,
      `INSERT OR REPLACE INTO pitcher_game_logs (
        player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
        innings_pitched, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
        walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, updated_at,
        data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id,
        certification_status, certification_grade, certified_at, promoted_at, created_at, group_type,
        player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
      )
      SELECT
        player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
        innings_pitched_decimal, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
        walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, CURRENT_TIMESTAMP,
        data_feed_key, source_endpoint, source_season, source_game_type, 'delta_update', batch_id, run_id,
        'DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', 'DELTA_PASS', COALESCE(certified_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(group_type,'pitching'),
        player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
      FROM pitcher_game_log_stage
      WHERE stage_id IN (SELECT stage_id FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update' AND promoted_at IS NULL ORDER BY player_id, game_date, game_pk LIMIT ?)`,
      batchId, promoteChunk
    );
    await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_stage SET promoted_at=CURRENT_TIMESTAMP, certification_status='DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', updated_at=CURRENT_TIMESTAMP WHERE stage_id IN (SELECT stage_id FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update' AND promoted_at IS NULL ORDER BY player_id, game_date, game_pk LIMIT ?)", batchId, promoteChunk);
  }
  const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update'", batchId);
  const remaining = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update' AND promoted_at IS NULL", batchId);
  await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_batches SET status=?, certification_status=?, certification_grade=?, rows_staged=?, rows_promoted=?, live_rows_after=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", Number(remaining && remaining.c || 0) > 0 ? "DELTA_PROMOTING" : "COMPLETED_PROMOTED_STAGE_RETAINED", Number(remaining && remaining.c || 0) > 0 ? "DELTA_PITCHER_GAME_LOGS_PROMOTION_MICROPHASE" : "DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED", Number(remaining && remaining.c || 0) > 0 ? "PROMOTION_RUNNING" : "DELTA_PASS", Number(stageRows && stageRows.c || 0), Number(liveRows && liveRows.c || 0), Number(liveRows && liveRows.c || 0), batchId);
  if (Number(remaining && remaining.c || 0) > 0) return { pass: true, done: false, status: "PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS", certification: "DELTA_PITCHER_GAME_LOGS_PROMOTION_MICROPHASE", certification_grade: "PROMOTION_RUNNING", rows_promoted: Number(liveRows && liveRows.c || 0), remaining_unpromoted: Number(remaining && remaining.c || 0), stage_rows: Number(stageRows && stageRows.c || 0) };
  const dupLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, COALESCE(group_type,'pitching') g, COUNT(*) n FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update' GROUP BY player_id, game_pk, COALESCE(group_type,'pitching') HAVING n>1)", batchId);
  await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_batches SET status='COMPLETED_PROMOTED_STAGE_RETAINED', certification_status='DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', rows_staged=?, rows_promoted=?, live_rows_after=?, duplicate_stage_keys=?, promoted_at=CURRENT_TIMESTAMP, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", Number(stageRows && stageRows.c || 0), Number(liveRows && liveRows.c || 0), Number(liveRows && liveRows.c || 0), Number(dupLive && dupLive.c || 0), batchId);
  await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_cursors SET status='COMPLETED_PROMOTED_STAGE_RETAINED', continuation_required=0, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_certifications (certification_id, batch_id, run_id, mode, status, certification_status, certification_grade, check_key, check_status, expected_value, actual_value, details_json, created_at) VALUES (?, ?, ?, 'delta_update', 'COMPLETED_PROMOTED_STAGE_RETAINED', 'DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', 'DELTA_PASS', 'v0_4_1_scoped_delta_retained_stage_certification', 'PASS', ?, ?, ?, CURRENT_TIMESTAMP)`, `${batchId}_delta_retained_cert`, batchId, batch.run_id, String(Number(stageRows && stageRows.c || 0)), String(Number(liveRows && liveRows.c || 0)), JSON.stringify({ outcomeCount, badOut, dupStage, outside, liveRows, retained_stage: true, scoped_delta: true }));
  return { pass: true, done: true, status: "COMPLETED_PROMOTED_STAGE_RETAINED", certification: "DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED", certification_grade: "DELTA_PASS", rows_promoted: Number(liveRows && liveRows.c || 0), live_rows: Number(liveRows && liveRows.c || 0), stage_rows: Number(stageRows && stageRows.c || 0), duplicate_live_keys: Number(dupLive && dupLive.c || 0), retained_stage: true };
}

function pglInt(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function pglText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }

async function currentPitcherLiveTruth(env) {
  const row = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS live_rows,
      COUNT(DISTINCT player_id || '|' || game_pk || '|' || COALESCE(group_type,'pitching')) AS distinct_live_keys
    FROM pitcher_game_logs`);
  const dup = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (
      SELECT player_id, game_pk, COALESCE(group_type,'pitching') AS g, COUNT(*) AS n
      FROM pitcher_game_logs
      GROUP BY player_id, game_pk, COALESCE(group_type,'pitching')
      HAVING n > 1
    )`);
  return { live_rows: pglInt(row && row.live_rows, 0), distinct_live_keys: pglInt(row && row.distinct_live_keys, 0), duplicate_live_keys: pglInt(dup && dup.c, 0) };
}

async function livePitcherKeyCount(env, batchId, playerId, gamePk, groupType) {
  const row = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND player_id=? AND game_pk=? AND COALESCE(group_type,'pitching')=?`, batchId, playerId, gamePk, groupType || GROUP_TYPE);
  return pglInt(row && row.c, 0);
}

async function stagePitcherKeyCount(env, batchId, playerId, gamePk, groupType) {
  const row = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND player_id=? AND game_pk=? AND COALESCE(group_type,'pitching')=?`, batchId, playerId, gamePk, groupType || GROUP_TYPE);
  return pglInt(row && row.c, 0);
}

async function createOrRefreshPitcherRepairAnchor(env, latest) {
  const existing = await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_game_log_repair_registry WHERE registry_key='pitcher_game_logs_delta_repair_anchor_1'`);
  if (existing) return { created: false, registry: existing };
  const anchor = await first(env.STATS_PITCHER_DB, `SELECT
      s.batch_id AS target_batch_id,
      s.player_id,
      s.game_pk,
      s.season,
      COALESCE(s.group_type,'pitching') AS group_type,
      s.game_date,
      s.source_endpoint
    FROM pitcher_game_log_stage s
    JOIN pitcher_game_logs h
      ON h.batch_id=s.batch_id
     AND h.player_id=s.player_id
     AND h.game_pk=s.game_pk
     AND COALESCE(h.group_type,'pitching')=COALESCE(s.group_type,'pitching')
    WHERE s.batch_id=? AND s.ingestion_mode='delta_update'
    ORDER BY s.game_date, s.player_id, s.game_pk
    LIMIT 1`, latest.batch_id);
  if (!anchor) return { created: false, registry: null, reason: "no_joined_live_stage_anchor_available" };
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_repair_registry
    (registry_key,target_batch_id,player_id,game_pk,season,group_type,game_date,source_endpoint,status,created_by_version,notes,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    'pitcher_game_logs_delta_repair_anchor_1', anchor.target_batch_id, anchor.player_id, anchor.game_pk, anchor.season, anchor.group_type || GROUP_TYPE, anchor.game_date, anchor.source_endpoint,
    'REPAIR_ANCHOR_RETAINED_FROM_LOCKED_LIVE_AND_STAGE', VERSION, 'Controlled incremental repair anchor. Live may be deleted; retained stage restores. If both live and stage are deleted, worker scoped re-fetches this player/game key only.'
  );
  const registry = await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_game_log_repair_registry WHERE registry_key='pitcher_game_logs_delta_repair_anchor_1'`);
  return { created: true, registry };
}

async function insertOrReplaceLivePitcherRowFromStageKey(env, batchId, playerId, gamePk, groupType, grade) {
  const safeGroupType = COALESCE_GROUP_TYPE(groupType);
  const r = await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_game_log_stage
    WHERE batch_id=? AND player_id=? AND game_pk=? AND COALESCE(group_type,'pitching')=?
    LIMIT 1`, batchId, playerId, gamePk, safeGroupType);
  if (!r) return { restored: 0, reason: "stage_row_not_found" };

  // v0.4.3 safety cleanup: remove malformed scoped-repair live rows for the same player/game
  // before inserting the certified row from retained stage. This prevents a previous bad repair
  // row with updated_at accidentally stored in group_type from surviving as an orphan key.
  await run(env.STATS_PITCHER_DB, `DELETE FROM pitcher_game_logs
    WHERE batch_id=?
      AND player_id=?
      AND game_pk=?
      AND COALESCE(group_type,'pitching') <> ?`, batchId, playerId, gamePk, safeGroupType);

  // v0.4.3 column-aligned repair promotion: use INSERT ... SELECT from the retained stage row
  // instead of a long JS bind list, so group_type, created_at, promoted_at, and updated_at cannot shift.
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_logs (
      player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
      innings_pitched, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
      walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, updated_at,
      data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id,
      certification_status, certification_grade, certified_at, promoted_at, created_at, group_type,
      player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
    )
    SELECT
      player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
      innings_pitched, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
      walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, CURRENT_TIMESTAMP,
      data_feed_key, source_endpoint, source_season, source_game_type, 'delta_update', batch_id, run_id,
      'DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(group_type,'pitching'),
      player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
    FROM pitcher_game_log_stage
    WHERE stage_id=? AND batch_id=?`, grade || 'DELTA_REPAIR_PASS', r.stage_id, batchId);

  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_game_log_stage
    SET certification_status='DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade=?, promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
    WHERE stage_id=? AND batch_id=?`, grade || 'DELTA_REPAIR_PASS', r.stage_id, batchId);
  return { restored: 1, row: r };
}
function COALESCE_GROUP_TYPE(v) { return v || GROUP_TYPE; }

async function scopedReminePitcherGameLogKey(env, registry, input) {
  const batchId = registry.target_batch_id;
  const runId = pglText(input.run_id || rid("run_pitcher_logs_scoped_repair"), rid("run_pitcher_logs_scoped_repair"));
  const playerId = pglInt(registry.player_id, 0);
  const gamePk = pglInt(registry.game_pk, 0);
  const season = pglInt(registry.season, DEFAULT_SEASON);
  const groupType = pglText(registry.group_type, GROUP_TYPE);
  const gameDate = pglText(registry.game_date, null);
  if (!playerId || !gamePk || !gameDate) return { ok: false, error: "registry_missing_required_key", external_calls: 0, rows_staged: 0, rows_promoted: 0 };
  const call = await fetchStatsApi(env, playerId, season);
  if (!call.ok) return { ok: false, error: `HTTP_${call.http_status}`, endpoint: call.endpoint, external_calls: 1, rows_staged: 0, rows_promoted: 0 };
  const splits = getSplits(call.json);
  const matched = [];
  for (const split of splits) {
    const g = split && split.game ? split.game : {};
    const gp = Number(statVal(g, ["gamePk", "pk"]));
    if (gp === gamePk) matched.push(split);
  }
  if (!matched.length) return { ok: false, error: "target_game_not_returned_by_player_game_log", endpoint: call.endpoint, external_calls: 1, raw_split_count: splits.length, matched_raw_splits: 0, rows_staged: 0, rows_promoted: 0 };
  let rowsStaged = 0;
  let rowsPromoted = 0;
  for (const split of matched.slice(0, 1)) {
    const row = extractStageRowForMode(split, { player_id: playerId, player_name: null, team_id: null, role: "P", role_source: "scoped_repair_registry" }, season, batchId, runId, call.endpoint, "delta_update");
    row.stage_id = `${batchId}_${playerId}_${gamePk}_pitching_delta_scoped_repair`;
    row.group_type = groupType;
    row.game_date = gameDate;
    row.certification_status = "delta_update_scoped_repair_certified";
    row.certification_grade = "DELTA_REPAIR_PASS";
    rowsStaged += await insertStageRows(env, [row]);
  }
  const restored = await insertOrReplaceLivePitcherRowFromStageKey(env, batchId, playerId, gamePk, groupType, "DELTA_REPAIR_PASS");
  rowsPromoted += pglInt(restored.restored, 0);
  const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update'", batchId);
  const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update'", batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_game_log_batches
    SET rows_staged=?, rows_promoted=?, live_rows_after=?, certification_status='DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`, pglInt(stageRows && stageRows.c, 0), pglInt(liveRows && liveRows.c, 0), pglInt(liveRows && liveRows.c, 0), batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_game_log_repair_registry
    SET status='REPAIR_ANCHOR_RETAINED_FROM_SCOPED_REPAIR', source_endpoint=?, created_by_version=?, updated_at=CURRENT_TIMESTAMP
    WHERE registry_key='pitcher_game_logs_delta_repair_anchor_1'`, call.endpoint, VERSION);
  return { ok: rowsStaged > 0 && rowsPromoted > 0, endpoint: call.endpoint, external_calls: 1, raw_split_count: splits.length, matched_raw_splits: matched.length, rows_staged: rowsStaged, rows_promoted: rowsPromoted, player_id: playerId, game_pk: gamePk, game_date: gameDate };
}

async function shouldBypassPitcherAnchorNoopForNewFinalDate(env, latestGuard) {
  const retainedMax = [latestGuard && latestGuard.stage_max_game_date, latestGuard && latestGuard.live_max_game_date].filter(Boolean).sort().pop();
  const sourceFinal = await determineLatestCompleteGameDate(env, DEFAULT_DELTA_START);
  if (sourceFinal.ok && retainedMax && sourceFinal.latest_complete_game_date > retainedMax) return { bypass: true, reason: "NEW_FINAL_DATE_AVAILABLE", source_final_date_check: sourceFinal, retained_max_game_date: retainedMax };
  return { bypass: false, source_final_date_check: sourceFinal, retained_max_game_date: retainedMax || null };
}

async function runPitcherGameLogsGoldRepairGate(env, input, baseGate) {
  const latest = await latestRetainedPitcherDelta(env);
  if (!latest) return { handled: false, reason: "no_retained_delta" };
  const latestGuard = await retainedDeltaParity(env, latest);
  const registry = await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_game_log_repair_registry WHERE registry_key='pitcher_game_logs_delta_repair_anchor_1'`);
  const liveTruthBefore = await currentPitcherLiveTruth(env);
  if (registry) {
    const batchId = registry.target_batch_id;
    const playerId = pglInt(registry.player_id, 0);
    const gamePk = pglInt(registry.game_pk, 0);
    const groupType = pglText(registry.group_type, GROUP_TYPE);
    const liveCount = await livePitcherKeyCount(env, batchId, playerId, gamePk, groupType);
    const stageCount = await stagePitcherKeyCount(env, batchId, playerId, gamePk, groupType);
    if (liveCount <= 0 && stageCount > 0) {
      const restored = await insertOrReplaceLivePitcherRowFromStageKey(env, batchId, playerId, gamePk, groupType, "DELTA_REPAIR_PASS");
      const liveTruthAfter = await currentPitcherLiveTruth(env);
      const cursorJson = { locked_delta_batch_id: batchId, registry_key: registry.registry_key, restored_rows: pglInt(restored.restored, 0), restored_player_id: playerId, restored_game_pk: gamePk, live_rows_after: liveTruthAfter.live_rows, distinct_live_keys_after: liveTruthAfter.distinct_live_keys, duplicate_live_keys: liveTruthAfter.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_new_batch: true, no_stage_writes: true, restored_from_retained_stage_before_queue: true };
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id,run_id,mode,status,expected_pitcher_universe_count,cursor_offset,current_player_id,max_api_calls_per_tick,max_rows_per_tick,continuation_required,cursor_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, input.run_id || rid("run_delta_pitcher_restore"), "delta_update", "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", 1, 1, playerId, 0, 0, 0, JSON.stringify(cursorJson));
      return { handled: true, output: { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification: "PITCHER_GAME_LOGS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", certification_grade: "DELTA_REPAIR_PASS", restored_rows: pglInt(restored.restored, 0), queued: false, request_id_created: null, no_mlb_calls: true, no_stage_writes: true, no_full_sweep: true, no_new_batch: true, rows_read: 1, rows_written: pglInt(restored.restored, 0), rows_promoted: pglInt(restored.restored, 0), external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, delta_restore_gate: cursorJson, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowIso() } };
    }
    if (liveCount <= 0 && stageCount <= 0) {
      const repair = await scopedReminePitcherGameLogKey(env, registry, input);
      const liveTruthAfter = await currentPitcherLiveTruth(env);
      const cursorJson = { locked_delta_batch_id: batchId, missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, scoped_expected_game_key: { target_batch_id: batchId, player_id: playerId, game_pk: gamePk, season: pglInt(registry.season, DEFAULT_SEASON), group_type: groupType, game_date: registry.game_date, source_endpoint: registry.source_endpoint || sourceEndpoint(env, playerId, pglInt(registry.season, DEFAULT_SEASON)) }, external_calls_performed: pglInt(repair.external_calls, 0), no_full_sweep: true, rows_staged: pglInt(repair.rows_staged, 0), rows_promoted: pglInt(repair.rows_promoted, 0), live_rows_after: liveTruthAfter.live_rows, distinct_live_keys_after: liveTruthAfter.distinct_live_keys, duplicate_live_keys: liveTruthAfter.duplicate_live_keys, stage_retained_for_repair: true, repair_ok: repair.ok === true, repair_error: repair.error || null };
      const status = repair.ok ? "DELTA_PITCHER_GAME_LOGS_SCOPED_REPAIR_COMPLETED" : "DELTA_PITCHER_GAME_LOGS_SCOPED_REPAIR_FAILED";
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id,run_id,mode,status,expected_pitcher_universe_count,cursor_offset,current_player_id,max_api_calls_per_tick,max_rows_per_tick,continuation_required,cursor_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, input.run_id || rid("run_delta_pitcher_scoped_repair"), "delta_update", status, 1, 1, playerId, pglInt(repair.external_calls, 0), 1, 0, JSON.stringify(cursorJson));
      return { handled: true, output: { ok: repair.ok === true, data_ok: repair.ok === true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status, certification: repair.ok ? "DELTA_PITCHER_GAME_LOGS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED" : "DELTA_PITCHER_GAME_LOGS_SCOPED_REPAIR_FAILED", certification_grade: repair.ok ? "DELTA_REPAIR_PASS" : "DELTA_REPAIR_FAIL", missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, no_full_sweep: true, rows_read: pglInt(repair.external_calls, 0), rows_written: pglInt(repair.rows_staged, 0) + pglInt(repair.rows_promoted, 0), rows_staged: pglInt(repair.rows_staged, 0), rows_promoted: pglInt(repair.rows_promoted, 0), external_calls_performed: pglInt(repair.external_calls, 0), continuation_required: false, orchestrator_should_self_continue: false, delta_scoped_repair_gate: cursorJson, repair, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowIso() } };
    }
    if (liveCount > 0 && stageCount <= 0) {
      const repair = await scopedReminePitcherGameLogKey(env, registry, input);
      const liveTruthAfter = await currentPitcherLiveTruth(env);
      const cursorJson = { locked_delta_batch_id: batchId, retained_stage_missing_for_anchor: true, live_row_already_present: true, scoped_players_to_refetch: 1, external_calls_performed: pglInt(repair.external_calls, 0), no_full_sweep: true, rows_staged: pglInt(repair.rows_staged, 0), rows_promoted: 0, live_rows_after: liveTruthAfter.live_rows, duplicate_live_keys: liveTruthAfter.duplicate_live_keys, stage_retained_for_repair: repair.ok === true };
      const status = repair.ok ? "DELTA_PITCHER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIRED" : "DELTA_PITCHER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIR_FAILED";
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id,run_id,mode,status,expected_pitcher_universe_count,cursor_offset,current_player_id,max_api_calls_per_tick,max_rows_per_tick,continuation_required,cursor_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, input.run_id || rid("run_delta_pitcher_stage_scoped_repair"), "delta_update", status, 1, 1, playerId, pglInt(repair.external_calls, 0), 1, 0, JSON.stringify(cursorJson));
      return { handled: true, output: { ok: repair.ok === true, data_ok: repair.ok === true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status, certification: repair.ok ? "DELTA_PITCHER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIR_CERTIFIED" : "DELTA_PITCHER_GAME_LOGS_RETAINED_STAGE_SCOPED_REPAIR_FAILED", certification_grade: repair.ok ? "DELTA_REPAIR_PASS" : "DELTA_REPAIR_FAIL", scoped_players_to_refetch: 1, no_full_sweep: true, rows_read: pglInt(repair.external_calls, 0), rows_written: pglInt(repair.rows_staged, 0), rows_staged: pglInt(repair.rows_staged, 0), rows_promoted: 0, external_calls_performed: pglInt(repair.external_calls, 0), continuation_required: false, orchestrator_should_self_continue: false, delta_stage_repair_gate: cursorJson, repair, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowIso() } };
    }
    const newFinalDateGate = await shouldBypassPitcherAnchorNoopForNewFinalDate(env, latestGuard);
    if (newFinalDateGate.bypass) return { handled: false, reason: newFinalDateGate.reason, retained_delta_guard: latestGuard, source_final_date_check: newFinalDateGate.source_final_date_check, retained_max_game_date: newFinalDateGate.retained_max_game_date };
    const cursorJson = { locked_delta_batch_id: batchId, repair_registry_key: registry.registry_key, anchor_player_id: playerId, anchor_game_pk: gamePk, anchor_game_date: registry.game_date, live_rows: liveTruthBefore.live_rows, distinct_live_keys: liveTruthBefore.distinct_live_keys, duplicate_live_keys: liveTruthBefore.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, repair_anchor_present: true, source_final_date_gate: newFinalDateGate, next_test: "delete this exact live key only to test retained-stage restore; delete live and retained stage key to test scoped re-fetch" };
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id,run_id,mode,status,expected_pitcher_universe_count,cursor_offset,current_player_id,max_api_calls_per_tick,max_rows_per_tick,continuation_required,cursor_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, input.run_id || rid("run_delta_pitcher_anchor_noop"), "delta_update", "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", 1, liveTruthBefore.live_rows, playerId, 0, 0, 0, JSON.stringify(cursorJson));
    return { handled: true, output: { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", certification: "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", certification_grade: "DELTA_ANCHOR_PASS", rows_read: liveTruthBefore.live_rows, rows_written: 1, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, repair_anchor: cursorJson, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowIso() } };
  }
  if (latestGuard.pass) {
    const newFinalDateGate = await shouldBypassPitcherAnchorNoopForNewFinalDate(env, latestGuard);
    if (newFinalDateGate.bypass) return { handled: false, reason: newFinalDateGate.reason, retained_delta_guard: latestGuard, source_final_date_check: newFinalDateGate.source_final_date_check, retained_max_game_date: newFinalDateGate.retained_max_game_date };
    const anchor = await createOrRefreshPitcherRepairAnchor(env, latest);
    const reg = anchor.registry;
    const cursorJson = { locked_delta_batch_id: latest.batch_id, repair_registry_key: reg ? reg.registry_key : null, anchor_player_id: reg ? pglInt(reg.player_id, null) : null, anchor_game_pk: reg ? pglInt(reg.game_pk, null) : null, anchor_game_date: reg ? reg.game_date : null, live_rows: liveTruthBefore.live_rows, distinct_live_keys: liveTruthBefore.distinct_live_keys, duplicate_live_keys: liveTruthBefore.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, repair_anchor_created: !!(anchor.created), anchor_reason: anchor.reason || null, source_final_date_gate: newFinalDateGate };
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_game_log_cursors (batch_id,run_id,mode,status,expected_pitcher_universe_count,cursor_offset,current_player_id,max_api_calls_per_tick,max_rows_per_tick,continuation_required,cursor_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, latest.batch_id, input.run_id || rid("run_delta_pitcher_anchor_create"), "delta_update", "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP", 1, liveTruthBefore.live_rows, reg ? pglInt(reg.player_id, 0) : null, 0, 0, 0, JSON.stringify(cursorJson));
    return { handled: true, output: { ok: !!reg, data_ok: !!reg, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: reg ? "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP" : "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_CREATE_FAILED", certification: reg ? "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_RETAINED_NOOP" : "DELTA_PITCHER_GAME_LOGS_REPAIR_ANCHOR_CREATE_FAILED", certification_grade: reg ? "DELTA_ANCHOR_PASS" : "DELTA_ANCHOR_FAIL", rows_read: liveTruthBefore.live_rows, rows_written: reg ? 2 : 1, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, repair_anchor: cursorJson, base_integrity_gate: baseGate, retained_delta_guard: latestGuard, timestamp_utc: nowIso() } };
  }
  return { handled: false, reason: "retained_delta_not_clean_or_no_registry", retained_delta_guard: latestGuard };
}

async function runDeltaUpdate(env, input) {
  const schema = await ensureSchema(env);
  const season = Number(input.source_season || input.season || env.ACTIVE_SEASON || DEFAULT_SEASON);
  const baseGate = await pitcherDeltaBaseGate(env);
  if (!baseGate.pass) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BASE_INTEGRITY_FAIL_BEFORE_DELTA", certification: "DELTA_PITCHER_GAME_LOGS_BASE_INTEGRITY_FAIL", certification_grade: "DELTA_BLOCKED", mode: "delta_update", base_integrity_gate: baseGate, rows_read: 0, rows_written: 0, external_calls_performed: 0, schema_status: schema };
  const goldGate = await runPitcherGameLogsGoldRepairGate(env, input, baseGate);
  if (goldGate && goldGate.handled) return goldGate.output;

  const retained = await latestRetainedPitcherDelta(env);
  let batch = await activePitcherDeltaBatch(env);
  let windowInfo = null;
  let targetAudit = null;

  if (!batch) {
    const deltaFloor = String(input.delta_start_date || DEFAULT_DELTA_START);
    const schedule = await determineLatestCompleteGameDate(env, deltaFloor);
    if (!schedule.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_FINAL_DATE_DISCOVERY_FAILED", certification: "DELTA_PITCHER_GAME_LOGS_FINAL_DATE_DISCOVERY_FAILED", certification_grade: "DELTA_BLOCKED", mode: "delta_update", source_final_date_check: schedule, rows_read: 0, rows_written: 0, external_calls_performed: 1, continuation_required: false };
    let start = deltaFloor;
    if (retained) {
      const parity = await retainedDeltaParity(env, retained);
      const retainedMax = [parity.stage_max_game_date, parity.live_max_game_date].filter(Boolean).sort().pop();
      if (parity.pass && retainedMax && schedule.latest_complete_game_date <= retainedMax) {
        return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "NOOP_ALREADY_CURRENT_RETAINED_FULL_REFRESH_DELTA", certification: "DELTA_PITCHER_GAME_LOGS_REPEAT_FULL_REFRESH_BLOCKED", certification_grade: "NOOP_PASS", mode: "delta_update", preserved_batch_id: retained.batch_id, retained_stage_rows: parity.stage_rows, live_rows_for_delta_batch: parity.live_rows, retained_max_game_date: retainedMax, source_final_date_check: schedule, no_new_batch: true, no_stage_writes: true, no_promotion: true, no_cleanup: true, no_mining_calls: true, rows_read: 0, rows_written: 0, external_calls_performed: 1, continuation_required: false, orchestrator_should_self_continue: false };
      }
      if (retainedMax) start = addDays(retainedMax, 1);
    }
    const requestedEnd = String(input.delta_end_date || schedule.latest_complete_game_date);
    windowInfo = { delta_start_date: start, delta_end_date: requestedEnd, delta_floor_date: deltaFloor, latest_complete_game_date: schedule.latest_complete_game_date, schedule_endpoint: schedule.endpoint, scoped_delta: true, no_full_universe_sweep: true, target_source: "MLB schedule completed games + game boxscore pitching stats" };
    targetAudit = await discoverScopedPitcherDeltaTargets(env, windowInfo.delta_start_date, windowInfo.delta_end_date);
    if (!targetAudit.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_TARGET_DISCOVERY_FAILED", certification: "DELTA_PITCHER_GAME_LOGS_TARGET_DISCOVERY_FAILED", certification_grade: "DELTA_BLOCKED", mode: "delta_update", target_discovery: targetAudit, source_final_date_check: schedule, rows_read: 0, rows_written: 0, external_calls_performed: 1 + Number(targetAudit.external_calls || 0), continuation_required: false };
    batch = await createPitcherDeltaBatch(env, input, targetAudit, windowInfo);
  } else {
    const parsed = (() => { try { return JSON.parse(batch.universe_audit_json || "{}"); } catch (_) { return {}; } })();
    targetAudit = parsed.targetAudit || (parsed.universeAudit && parsed.universeAudit.target_pitchers ? parsed.universeAudit : null);
    windowInfo = parsed.windowInfo || { delta_start_date: batch.delta_start_date || DEFAULT_DELTA_START, delta_end_date: batch.delta_end_date || batch.delta_start_date || DEFAULT_DELTA_START, scoped_delta: true };
  }

  const targets = Array.isArray(targetAudit && targetAudit.target_pitchers) ? targetAudit.target_pitchers : [];
  const cursor = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_cursors WHERE batch_id=?", batch.batch_id);
  const offset = Number(cursor && cursor.cursor_offset || 0);
  const expected = targets.length;
  if (expected === 0) {
    await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_batches SET status='COMPLETED_PROMOTED_STAGE_RETAINED', certification_status='DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', rows_staged=0, rows_promoted=0, live_rows_after=(SELECT COUNT(*) FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update'), promoted_at=CURRENT_TIMESTAMP, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batch.batch_id, batch.batch_id);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "COMPLETED_PROMOTED_STAGE_RETAINED", certification: "DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED", certification_grade: "DELTA_PASS", mode: "delta_update", batch_id: batch.batch_id, run_id: batch.run_id, delta_window: windowInfo, scoped_delta_targets: 0, rows_read: 0, rows_written: 1, rows_promoted: 0, external_calls_performed: 0, retained_stage: true, no_full_universe_sweep: true, continuation_required: false, orchestrator_should_self_continue: false };
  }
  const maxRequests = Math.max(1, Math.min(Number(input.max_api_calls_per_tick || DEFAULT_MAX_API_CALLS_PER_TICK), DEFAULT_MAX_API_CALLS_PER_TICK));
  const maxRows = Math.max(1, Math.min(Number(input.max_rows_per_tick || DEFAULT_MAX_STAGE_ROWS_PER_TICK), DEFAULT_MAX_STAGE_ROWS_PER_TICK));
  const players = targets.slice(offset, offset + maxRequests);
  let rowsStaged = 0, externalCalls = 0, rowsRead = 0;
  const outcomes = [];
  for (const p of players) {
    const remainingRows = Math.max(1, maxRows - rowsStaged);
    const result = await processPitcherDeltaPlayer(env, p, season, batch.batch_id, batch.run_id, windowInfo.delta_start_date, windowInfo.delta_end_date, remainingRows);
    externalCalls++; rowsRead++;
    let category = "UNCLEAR";
    if (!result.call.ok) category = "SOURCE_ERROR";
    else if (result.rows.length > 0) category = "PROMOTED_ROWS";
    else if (result.splits_count === 0) category = "TRUE_NO_DATA_FOR_WINDOW";
    else category = "FILTERED_OUTSIDE_WINDOW";
    if (result.rows.length) rowsStaged += await insertStageRows(env, result.rows);
    await insertOutcome(env, batch.batch_id, batch.run_id, "delta_update", p, category, result.rows.length, result.call.http_status, season, result.call.endpoint, result.call.ok ? null : `HTTP_${result.call.http_status}`, { delta_update: true, scoped_delta: true, split_count: result.splits_count, filtered_outside_window_count: result.filtered_outside_window_count, window_start: windowInfo.delta_start_date, window_end: windowInfo.delta_end_date, target_source: p.role_source || "boxscore" });
    outcomes.push({ player_id: p.player_id, outcome_category: category, rows: result.rows.length });
  }
  const newOffset = offset + players.length;
  const continuation = newOffset < expected;
  const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=?", batch.batch_id);
  const outcomeRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_game_log_player_outcomes WHERE batch_id=?", batch.batch_id);
  await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_cursors SET status=?, expected_pitcher_universe_count=?, cursor_offset=?, current_player_id=?, continuation_required=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", continuation ? "PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS" : "DELTA_STAGED_READY_FOR_CERTIFICATION", expected, newOffset, players.length ? Number(players[players.length-1].player_id) : null, continuation ? 1 : 0, batch.batch_id);
  await run(env.STATS_PITCHER_DB, "UPDATE pitcher_game_log_batches SET status=?, certification_status=?, certification_grade=?, expected_pitcher_universe_count=?, outcome_rows=?, source_request_count=?, source_success_count=(SELECT COUNT(*) FROM pitcher_game_log_player_outcomes WHERE batch_id=? AND outcome_category IN ('PROMOTED_ROWS','FILTERED_OUTSIDE_WINDOW')), source_no_data_count=(SELECT COUNT(*) FROM pitcher_game_log_player_outcomes WHERE batch_id=? AND outcome_category='TRUE_NO_DATA_FOR_WINDOW'), source_error_count=(SELECT COUNT(*) FROM pitcher_game_log_player_outcomes WHERE batch_id=? AND outcome_category='SOURCE_ERROR'), rows_staged=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", continuation ? "PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS" : "DELTA_STAGED_READY_FOR_CERTIFICATION", continuation ? "DELTA_PITCHER_GAME_LOGS_PARTIAL_CONTINUE" : "DELTA_PITCHER_GAME_LOGS_STAGED_READY_FOR_CERTIFICATION", continuation ? "PARTIAL" : "DELTA_STAGE_READY", expected, Number(outcomeRows && outcomeRows.c || 0), Number(outcomeRows && outcomeRows.c || 0), batch.batch_id, batch.batch_id, batch.batch_id, Number(stageRows && stageRows.c || 0), batch.batch_id);
  if (continuation) return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "PARTIAL_CONTINUE_DELTA_PITCHER_GAME_LOGS", certification: "DELTA_PITCHER_GAME_LOGS_PARTIAL_CONTINUE", certification_grade: "PARTIAL", mode: "delta_update", batch_id: batch.batch_id, run_id: batch.run_id, delta_window: windowInfo, scoped_delta_targets: expected, base_integrity_gate: baseGate, cursor_offset_before: offset, cursor_offset_after: newOffset, players_total: expected, players_remaining: Math.max(0, expected-newOffset), rows_read: rowsRead, rows_written: rowsStaged + players.length, rows_staged_this_tick: rowsStaged, rows_staged_total: Number(stageRows && stageRows.c || 0), rows_promoted: 0, external_calls_performed: externalCalls, tick_outcomes: outcomes, continuation_required: true, orchestrator_should_self_continue: true, no_full_universe_sweep: true, no_hitter_mutation: true, no_market_mutation: true, no_scoring: true };
  const finalBatch = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_game_log_batches WHERE batch_id=?", batch.batch_id);
  const final = await finalizeDeltaStageAndPromote(env, finalBatch || batch);
  return { ok: final.pass, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: final.status, certification: final.certification, certification_grade: final.certification_grade, mode: "delta_update", batch_id: batch.batch_id, run_id: batch.run_id, delta_window: windowInfo, scoped_delta_targets: expected, base_integrity_gate: baseGate, cursor_offset_before: offset, cursor_offset_after: newOffset, players_total: expected, players_remaining: 0, rows_read: rowsRead, rows_written: rowsStaged + (final.rows_promoted || 0), rows_staged_this_tick: rowsStaged, rows_staged_total: final.stage_rows, rows_promoted: final.rows_promoted, live_rows_after: final.live_rows || final.rows_promoted || 0, external_calls_performed: externalCalls, final_delta_certification: final, continuation_required: !final.done, orchestrator_should_self_continue: !final.done, retained_stage: true, no_full_universe_sweep: true, no_hitter_mutation: true, no_market_mutation: true, no_scoring: true };
}

function identity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BASE_AND_HITTER_EQUIVALENT_SCOPED_DELTA_READY", timestamp_utc: nowIso(), source_endpoint_template: SOURCE_ENDPOINT_TEMPLATE, base_backfill_cutoff_date_reserved: DEFAULT_BASE_CUTOFF, delta_start_date_reserved: DEFAULT_DELTA_START, active_scope: "base_backfill locked plus hitter-equivalent pitcher delta: control-room retained restore/no-op and scoped boxscore-targeted delta; no hitter/market/scoring mutation", hard_blocks: ["delta requires completed promoted cleaned base", "retained delta stage is preserved after promotion", "normal daily delta scopes to completed-game boxscore pitchers, not full pitcher universe", "no hitter mutation", "no market mutation", "no scoring/ranking/final board"], binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) }, bindings: db, vars };
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
      const requestedMode = String(embedded.mode || input.mode || "base_backfill_stage_only");
      const mergedInput = { ...embedded, ...input };
      if (["source_probe", "base_backfill_probe"].includes(requestedMode)) {
        const out = await runSourceProbe(env, { ...mergedInput, mode: "source_probe" });
        return jsonResponse({ ...out, request_id: input.request_id || null, chain_id: input.chain_id || null, orchestrator_should_self_continue: false, continuation_required: false });
      }
      if (["base_backfill", "base_backfill_stage_only", "base_backfill_promote", "base_promotion_microphase", "orchestrator_exact_base_pitcher_game_logs_base_backfill_stage_only_dispatch"].includes(requestedMode)) {
        const out = await runBasePromotionMicrophase(env, { ...mergedInput, mode: "base_backfill" });
        return jsonResponse({ ...out, request_id: input.request_id || null, chain_id: input.chain_id || null });
      }
      if (["delta_update", "pitcher_delta_update", "delta_pitcher_game_logs"].includes(requestedMode)) {
        const out = await runDeltaUpdate(env, { ...mergedInput, mode: "delta_update" });
        return jsonResponse({ ...out, request_id: input.request_id || null, chain_id: input.chain_id || null });
      }
      return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BLOCKED_MODE_NOT_ENABLED_IN_V0_4_1", certification: "PITCHER_GAME_LOGS_V0_4_1_BASE_OR_SCOPED_DELTA_ONLY", requested_mode: requestedMode, enabled_modes: ["source_probe", "base_backfill_promote", "base_promotion_microphase", "base_backfill", "delta_update"], rows_promoted: 0, external_calls_performed: 0 }, 200);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /diagnostic", "POST /run"] }, 404);
  }
};
