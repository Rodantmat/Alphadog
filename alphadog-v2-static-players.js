const WORKER_NAME = "alphadog-v2-static-players";
const VERSION = "alphadog-v2-static-players-v0.1.9-stage-certify-promote-clean";
const JOB_KEY = "static-players";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];

const SOURCE_KEY = "mlb_statsapi_40man_roster_v0_1_0";
const DEFAULT_MAX_TEAMS_PER_RUN = 6;
const HARD_MAX_TEAMS_PER_RUN = 10;
const D1_BATCH_SIZE = 50;
const SOURCE_NAME = "MLB StatsAPI 40-man roster endpoint";
const ROSTER_TYPE = "40Man";
const RAW_JSON_LIMIT = 6000;

function nowUtc() { return new Date().toISOString(); }
function text(value) { return String(value === undefined || value === null ? "" : value).trim(); }
function numOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function boolOne(value) { return Number(value) === 1 ? 1 : 0; }
function normalize(value) { return text(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function compactJson(value, limit = RAW_JSON_LIMIT) { return JSON.stringify(value || {}).slice(0, limit); }
function unique(values) { return Array.from(new Set(values.filter(v => v !== null && v !== undefined && String(v).length > 0).map(v => String(v)))); }

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

async function readJsonSafe(request) {
  try { return await request.json(); } catch { return {}; }
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

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function base(env, extra = {}) {
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "STATIC_PLAYERS_WORKER_READY",
    timestamp_utc: nowUtc(),
    source_name: SOURCE_NAME,
    source_key: SOURCE_KEY,
    roster_type: ROSTER_TYPE,
    boundaries: {
      primary_team_source: "REF_DB.ref_teams active MLB teams",
      primary_player_source: "MLB StatsAPI /teams/{mlb_team_id}/roster/40Man",
      writes_only: ["REF_DB.ref_players_stage", "REF_DB.ref_player_aliases_stage", "REF_DB.ref_rosters_stage", "REF_DB.static_players_batches", "REF_DB.ref_players", "REF_DB.ref_player_aliases", "REF_DB.ref_rosters"],
      lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage",
      no_26man_only_scope: true,
      no_every_minor_leaguer_scope: true,
      no_person_detail_hydration_in_v0_1_0: true,
      no_prizepicks_board_mutation: true,
      no_prizepicks_alias_guessing: true,
      no_sleeper_alias_guessing: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board_write: true,
      no_old_production_touch: true,
      no_gemini_api: true
    },
    bindings: bindingPresence(env, REQUIRED_DB_BINDINGS),
    vars: varPresence(env, EXPECTED_VARS),
    ...extra
  };
}

async function ensureSchema(env) {
  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_schema_migrations (
    migration_key TEXT PRIMARY KEY,
    package_version TEXT,
    applied_at TEXT,
    notes TEXT
  )`);

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_players (
    player_id INTEGER PRIMARY KEY,
    player_name TEXT,
    primary_team_id TEXT,
    primary_role TEXT,
    bats TEXT,
    throws TEXT,
    active INTEGER DEFAULT 1,
    raw_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_player_aliases (
    alias_key TEXT PRIMARY KEY,
    player_id INTEGER,
    alias_name TEXT,
    source_key TEXT,
    confidence TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_rosters (
    roster_key TEXT PRIMARY KEY,
    slate_date TEXT,
    team_id TEXT,
    player_id INTEGER,
    roster_status TEXT,
    role TEXT,
    source_key TEXT,
    raw_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await addColumns(env.REF_DB, "ref_players", [
    ["mlb_player_id", "INTEGER"],
    ["full_name", "TEXT"],
    ["first_name", "TEXT"],
    ["last_name", "TEXT"],
    ["current_team_id", "TEXT"],
    ["current_mlb_team_id", "INTEGER"],
    ["primary_position", "TEXT"],
    ["bat_side", "TEXT"],
    ["throw_side", "TEXT"],
    ["source_key", "TEXT"],
    ["created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"],
    ["last_seen_request_id", "TEXT"],
    ["last_seen_at", "TEXT"]
  ]);

  await addColumns(env.REF_DB, "ref_player_aliases", [
    ["alias_type", "TEXT"],
    ["alias_normalized", "TEXT"],
    ["team_id", "TEXT"],
    ["mlb_team_id", "INTEGER"],
    ["active", "INTEGER DEFAULT 1"],
    ["raw_json", "TEXT"],
    ["created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"],
    ["last_seen_request_id", "TEXT"],
    ["last_seen_at", "TEXT"]
  ]);

  await addColumns(env.REF_DB, "ref_rosters", [
    ["snapshot_type", "TEXT"],
    ["mlb_team_id", "INTEGER"],
    ["player_name", "TEXT"],
    ["position_abbreviation", "TEXT"],
    ["roster_date", "TEXT"],
    ["active", "INTEGER DEFAULT 1"],
    ["created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"],
    ["last_seen_request_id", "TEXT"],
    ["last_seen_at", "TEXT"]
  ]);

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS static_players_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    chain_id TEXT,
    source_key TEXT,
    status TEXT,
    rows_fetched INTEGER DEFAULT 0,
    players_staged INTEGER DEFAULT 0,
    aliases_staged INTEGER DEFAULT 0,
    rosters_staged INTEGER DEFAULT 0,
    teams_covered INTEGER DEFAULT 0,
    duplicate_mlb_ids INTEGER DEFAULT 0,
    missing_mlb_player_id INTEGER DEFAULT 0,
    missing_name INTEGER DEFAULT 0,
    certification_status TEXT,
    processed_mlb_team_ids_json TEXT,
    error_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    promoted_at TEXT,
    cleaned_at TEXT
  )`);

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_players_stage (
    batch_id TEXT,
    player_id INTEGER,
    mlb_player_id INTEGER,
    player_name TEXT,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    primary_team_id TEXT,
    current_team_id TEXT,
    current_mlb_team_id INTEGER,
    primary_role TEXT,
    primary_position TEXT,
    bats TEXT,
    throws TEXT,
    bat_side TEXT,
    throw_side TEXT,
    active INTEGER DEFAULT 1,
    source_key TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_request_id TEXT,
    last_seen_at TEXT,
    PRIMARY KEY (batch_id, player_id)
  )`);

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_player_aliases_stage (
    batch_id TEXT,
    alias_key TEXT,
    player_id INTEGER,
    alias_name TEXT,
    alias_type TEXT,
    alias_normalized TEXT,
    team_id TEXT,
    mlb_team_id INTEGER,
    source_key TEXT,
    confidence TEXT,
    active INTEGER DEFAULT 1,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_request_id TEXT,
    last_seen_at TEXT,
    PRIMARY KEY (batch_id, alias_key)
  )`);

  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_rosters_stage (
    batch_id TEXT,
    roster_key TEXT,
    slate_date TEXT,
    roster_date TEXT,
    snapshot_type TEXT,
    team_id TEXT,
    mlb_team_id INTEGER,
    player_id INTEGER,
    player_name TEXT,
    roster_status TEXT,
    role TEXT,
    position_abbreviation TEXT,
    source_key TEXT,
    active INTEGER DEFAULT 1,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_request_id TEXT,
    last_seen_at TEXT,
    PRIMARY KEY (batch_id, roster_key)
  )`);

  await addColumns(env.REF_DB, "static_players_batches", [
    ["request_id", "TEXT"],
    ["chain_id", "TEXT"],
    ["source_key", "TEXT"],
    ["status", "TEXT"],
    ["rows_fetched", "INTEGER DEFAULT 0"],
    ["players_staged", "INTEGER DEFAULT 0"],
    ["aliases_staged", "INTEGER DEFAULT 0"],
    ["rosters_staged", "INTEGER DEFAULT 0"],
    ["teams_covered", "INTEGER DEFAULT 0"],
    ["duplicate_mlb_ids", "INTEGER DEFAULT 0"],
    ["missing_mlb_player_id", "INTEGER DEFAULT 0"],
    ["missing_name", "INTEGER DEFAULT 0"],
    ["certification_status", "TEXT"],
    ["processed_mlb_team_ids_json", "TEXT"],
    ["error_json", "TEXT"],
    ["created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"],
    ["updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP"],
    ["promoted_at", "TEXT"],
    ["cleaned_at", "TEXT"]
  ]);

  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_static_players_batches_source_status ON static_players_batches(source_key, status)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_players_stage_batch ON ref_players_stage(batch_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_players_stage_source_batch ON ref_players_stage(source_key, batch_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_player_aliases_stage_batch ON ref_player_aliases_stage(batch_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_rosters_stage_batch ON ref_rosters_stage(batch_id)");

  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_players_mlb_player_id ON ref_players(mlb_player_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_players_current_team_active ON ref_players(current_team_id, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_players_source_active ON ref_players(source_key, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_players_last_seen ON ref_players(source_key, last_seen_request_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_player_aliases_player ON ref_player_aliases(player_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_player_aliases_normalized ON ref_player_aliases(alias_normalized)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_player_aliases_source_active ON ref_player_aliases(source_key, active)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_player_aliases_last_seen ON ref_player_aliases(source_key, last_seen_request_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_rosters_source_snapshot ON ref_rosters(source_key, snapshot_type)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_rosters_last_seen ON ref_rosters(source_key, snapshot_type, last_seen_request_id)");
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_rosters_team_player ON ref_rosters(team_id, player_id)");

  await run(env.REF_DB, `INSERT OR REPLACE INTO ref_schema_migrations
    (migration_key, package_version, applied_at, notes)
    VALUES ('schema_ref_db_static_players_40man_v0_1_0', ?, CURRENT_TIMESTAMP, 'Additive REF_DB player identity/alias/static 40-man roster snapshot support; no scoring, no board mutation')`, VERSION);


  await run(env.REF_DB, `INSERT OR REPLACE INTO ref_schema_migrations
    (migration_key, package_version, applied_at, notes)
    VALUES ('schema_ref_db_static_players_stage_certify_promote_v0_1_9', ?, CURRENT_TIMESTAMP, 'Additive static players staging, batch certification, promoted-main replacement, and promoted-batch stage cleanup')`, VERSION);
}

async function addColumns(db, tableName, columns) {
  const existingRows = await all(db, `PRAGMA table_info(${tableName})`);
  const existing = new Set(existingRows.map(r => String(r.name || "").toLowerCase()));
  for (const [name, type] of columns) {
    if (!existing.has(String(name).toLowerCase())) {
      await run(db, `ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`);
    }
  }
}

async function readActiveTeams(env) {
  return await all(env.REF_DB, `SELECT
      team_id,
      mlb_team_id,
      abbreviation,
      full_name,
      active
    FROM ref_teams
    WHERE COALESCE(active,1)=1
      AND mlb_team_id IS NOT NULL
    ORDER BY abbreviation, team_id`);
}

function mlbBaseUrl(env) {
  return text(env.MLB_API_BASE_URL) || "https://statsapi.mlb.com/api/v1";
}

async function fetchRoster(env, mlbTeamId) {
  const url = `${mlbBaseUrl(env).replace(/\/$/, "")}/teams/${encodeURIComponent(String(mlbTeamId))}/roster/${ROSTER_TYPE}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "cache-control": "no-cache",
      "user-agent": text(env.MLB_API_USER_AGENT) || "AlphaDogV2StaticPlayers/0.1 (+controlled-reference-refresh)"
    }
  });
  const bodyText = await resp.text();
  let json = null;
  try { json = JSON.parse(bodyText); } catch (_) { json = null; }
  if (!resp.ok || !json || !Array.isArray(json.roster)) {
    throw new Error(`mlb_statsapi_40man_roster_fetch_failed_team_${mlbTeamId}_http_${resp.status}`);
  }
  return { url, http_status: resp.status, roster: json.roster, raw: json };
}

function extractNameParts(person, fullName) {
  const firstFromPayload = text(person.firstName || person.useName || "");
  const lastFromPayload = text(person.lastName || "");
  if (firstFromPayload && lastFromPayload) return { first_name: firstFromPayload, last_name: lastFromPayload, derived: "payload" };

  const parts = text(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 2 && /^[A-Za-z.'-]+$/.test(parts[0]) && /^[A-Za-z.'-]+$/.test(parts[1])) {
    return { first_name: parts[0], last_name: parts[1], derived: "safe_two_token_full_name" };
  }

  return { first_name: null, last_name: null, derived: "not_safely_available" };
}

function playerFromRosterEntry(entry, team) {
  const person = entry.person || {};
  const position = entry.position || {};
  const status = entry.status || {};
  const mlbPlayerId = numOrNull(person.id);
  const fullName = text(person.fullName || person.name || entry.personName || "");
  const names = extractNameParts(person, fullName);
  const batSide = text(person.batSide?.code || person.batSide?.description || entry.batSide?.code || "") || null;
  const throwSide = text(person.pitchHand?.code || person.pitchHand?.description || entry.pitchHand?.code || "") || null;
  const primaryPosition = text(position.abbreviation || position.code || position.name || "") || null;

  return {
    player_id: mlbPlayerId,
    mlb_player_id: mlbPlayerId,
    full_name: fullName || null,
    player_name: fullName || null,
    first_name: names.first_name,
    last_name: names.last_name,
    name_parts_source: names.derived,
    current_team_id: text(team.team_id) || null,
    current_mlb_team_id: numOrNull(team.mlb_team_id),
    primary_team_id: text(team.team_id) || null,
    primary_position: primaryPosition,
    primary_role: primaryPosition,
    bat_side: batSide,
    throw_side: throwSide,
    bats: batSide,
    throws: throwSide,
    roster_status: text(status.code || status.description || "40Man") || "40Man",
    position_abbreviation: primaryPosition,
    active: 1,
    source_key: SOURCE_KEY,
    raw_json: compactJson({ team, roster_entry: entry })
  };
}

function aliasKey(playerId, aliasType, aliasName, teamId = "") {
  return `${playerId}|${aliasType}|${normalize(aliasName)}|${normalize(teamId)}`.slice(0, 240);
}

function buildAliases(player) {
  const aliases = [];
  function add(aliasType, aliasName, confidence = "HIGH", teamScoped = false) {
    const name = text(aliasName);
    const norm = normalize(name);
    if (!name || !norm || !player.player_id) return;
    const teamId = teamScoped ? player.current_team_id : null;
    aliases.push({
      alias_key: aliasKey(player.player_id, aliasType, name, teamId || ""),
      player_id: player.player_id,
      alias_name: name,
      alias_type: aliasType,
      alias_normalized: norm,
      team_id: teamId,
      mlb_team_id: teamScoped ? player.current_mlb_team_id : null,
      source_key: SOURCE_KEY,
      confidence,
      active: 1,
      raw_json: compactJson({ alias_type: aliasType, alias_name: name, team_id: teamId, mlb_team_id: teamScoped ? player.current_mlb_team_id : null })
    });
  }

  add("full_name", player.full_name, "HIGH", false);
  add("normalized_full_name", normalize(player.full_name), "HIGH", false);
  if (player.first_name && player.last_name) add("last_first", `${player.last_name}, ${player.first_name}`, "HIGH", false);
  add("mlb_player_id", String(player.mlb_player_id), "HIGH", false);
  if (player.current_team_id && player.full_name) add("team_scoped_full_name", `${player.current_team_id}:${player.full_name}`, "HIGH", true);

  const seen = new Set();
  return aliases.filter(a => {
    if (seen.has(a.alias_key)) return false;
    seen.add(a.alias_key);
    return true;
  });
}

function batchIdFor(input, originalInput) {
  return text(originalInput.batch_id || input.batch_id || input.request_id || `static_players_batch_${Date.now()}`);
}

function stagePlayerStmt(env, player, requestId, batchId) {
  return env.REF_DB.prepare(`INSERT OR REPLACE INTO ref_players_stage
    (batch_id, player_id, mlb_player_id, player_name, full_name, first_name, last_name, primary_team_id, current_team_id, current_mlb_team_id, primary_role, primary_position, bats, throws, bat_side, throw_side, active, source_key, raw_json, updated_at, last_seen_request_id, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`).bind(
    batchId, player.player_id, player.mlb_player_id, player.player_name, player.full_name, player.first_name, player.last_name,
    player.primary_team_id, player.current_team_id, player.current_mlb_team_id, player.primary_role, player.primary_position,
    player.bats, player.throws, player.bat_side, player.throw_side, player.active, player.source_key, player.raw_json, requestId || null
  );
}

function stageAliasStmt(env, alias, requestId, batchId) {
  return env.REF_DB.prepare(`INSERT OR REPLACE INTO ref_player_aliases_stage
    (batch_id, alias_key, player_id, alias_name, alias_type, alias_normalized, team_id, mlb_team_id, source_key, confidence, active, raw_json, updated_at, last_seen_request_id, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`).bind(
    batchId, alias.alias_key, alias.player_id, alias.alias_name, alias.alias_type, alias.alias_normalized, alias.team_id, alias.mlb_team_id,
    alias.source_key, alias.confidence, alias.active, alias.raw_json, requestId || null
  );
}

function stageRosterStmt(env, player, team, requestId, batchId) {
  const rosterKey = `${SOURCE_KEY}|${team.team_id}|${player.player_id}`.slice(0, 240);
  return env.REF_DB.prepare(`INSERT OR REPLACE INTO ref_rosters_stage
    (batch_id, roster_key, slate_date, roster_date, snapshot_type, team_id, mlb_team_id, player_id, player_name, roster_status, role, position_abbreviation, source_key, active, raw_json, updated_at, last_seen_request_id, last_seen_at)
    VALUES (?, ?, NULL, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`).bind(
    batchId, rosterKey, "STATIC_40MAN_SNAPSHOT", team.team_id, numOrNull(team.mlb_team_id), player.player_id, player.full_name,
    player.roster_status, player.primary_position, player.position_abbreviation, SOURCE_KEY, player.raw_json, requestId || null
  );
}

async function runD1Batch(db, statements, size = D1_BATCH_SIZE) {
  let executed = 0;
  for (let i = 0; i < statements.length; i += size) {
    const chunk = statements.slice(i, i + size);
    if (chunk.length) {
      await db.batch(chunk);
      executed += chunk.length;
    }
  }
  return executed;
}

async function initializeStageBatch(env, batchId, input, originalInput) {
  await run(env.REF_DB, `INSERT OR REPLACE INTO static_players_batches
    (batch_id, request_id, chain_id, source_key, status, certification_status, processed_mlb_team_ids_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'collecting', 'STATIC_PLAYERS_STAGE_COLLECTING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    batchId, input.request_id || null, input.chain_id || null, SOURCE_KEY, JSON.stringify([]));

  await run(env.REF_DB, "DELETE FROM ref_players_stage WHERE batch_id=?", batchId);
  await run(env.REF_DB, "DELETE FROM ref_player_aliases_stage WHERE batch_id=?", batchId);
  await run(env.REF_DB, "DELETE FROM ref_rosters_stage WHERE batch_id=?", batchId);
}

async function updateStageBatchMetrics(env, batchId, processedMlbTeamIds, status, certificationStatus, errorJson = null) {
  const checks = await stageCertificationChecks(env, batchId);
  await run(env.REF_DB, `UPDATE static_players_batches
    SET status=?,
        rows_fetched=?,
        players_staged=?,
        aliases_staged=?,
        rosters_staged=?,
        teams_covered=?,
        duplicate_mlb_ids=?,
        missing_mlb_player_id=?,
        missing_name=?,
        certification_status=?,
        processed_mlb_team_ids_json=?,
        error_json=?,
        updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`,
    status,
    Number(checks.static_40man_roster_rows || 0),
    Number(checks.player_rows || 0),
    Number(checks.alias_rows || 0),
    Number(checks.static_40man_roster_rows || 0),
    Number(checks.active_roster_team_count || 0),
    Number(checks.duplicate_mlb_player_id_count || 0),
    Number(checks.missing_mlb_player_id || 0),
    Number(checks.missing_full_name_or_player_name || 0),
    certificationStatus,
    JSON.stringify(processedMlbTeamIds || []),
    errorJson ? JSON.stringify(errorJson).slice(0, RAW_JSON_LIMIT) : null,
    batchId
  );
  return checks;
}

async function promoteCertifiedStage(env, batchId, requestId) {
  await run(env.REF_DB, `UPDATE static_players_batches
    SET status='promoting', certification_status='STATIC_PLAYERS_STAGE_CERTIFIED_PROMOTING', updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=? AND source_key=? AND status IN ('certified','collecting')`, batchId, SOURCE_KEY);

  await run(env.REF_DB, `INSERT OR REPLACE INTO ref_players
    (player_id, mlb_player_id, player_name, full_name, first_name, last_name, primary_team_id, current_team_id, current_mlb_team_id, primary_role, primary_position, bats, throws, bat_side, throw_side, active, source_key, raw_json, updated_at, last_seen_request_id, last_seen_at)
    SELECT player_id, mlb_player_id, player_name, full_name, first_name, last_name, primary_team_id, current_team_id, current_mlb_team_id, primary_role, primary_position, bats, throws, bat_side, throw_side, 1, source_key, raw_json, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
    FROM ref_players_stage
    WHERE batch_id=? AND source_key=?`, requestId, batchId, SOURCE_KEY);

  await run(env.REF_DB, `INSERT OR REPLACE INTO ref_player_aliases
    (alias_key, player_id, alias_name, alias_type, alias_normalized, team_id, mlb_team_id, source_key, confidence, active, raw_json, updated_at, last_seen_request_id, last_seen_at)
    SELECT alias_key, player_id, alias_name, alias_type, alias_normalized, team_id, mlb_team_id, source_key, confidence, 1, raw_json, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
    FROM ref_player_aliases_stage
    WHERE batch_id=? AND source_key=?`, requestId, batchId, SOURCE_KEY);

  await run(env.REF_DB, `INSERT OR REPLACE INTO ref_rosters
    (roster_key, slate_date, roster_date, snapshot_type, team_id, mlb_team_id, player_id, player_name, roster_status, role, position_abbreviation, source_key, active, raw_json, updated_at, last_seen_request_id, last_seen_at)
    SELECT roster_key, slate_date, roster_date, snapshot_type, team_id, mlb_team_id, player_id, player_name, roster_status, role, position_abbreviation, source_key, 1, raw_json, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
    FROM ref_rosters_stage
    WHERE batch_id=? AND source_key=? AND snapshot_type='STATIC_40MAN_SNAPSHOT'`, requestId, batchId, SOURCE_KEY);

  await run(env.REF_DB, `UPDATE ref_players
    SET active=0, updated_at=CURRENT_TIMESTAMP
    WHERE source_key=?
      AND COALESCE(last_seen_request_id, '') <> ?`, SOURCE_KEY, requestId);

  await run(env.REF_DB, `UPDATE ref_player_aliases
    SET active=0, updated_at=CURRENT_TIMESTAMP
    WHERE source_key=?
      AND COALESCE(last_seen_request_id, '') <> ?`, SOURCE_KEY, requestId);

  await run(env.REF_DB, `UPDATE ref_rosters
    SET active=0, updated_at=CURRENT_TIMESTAMP
    WHERE source_key=?
      AND snapshot_type='STATIC_40MAN_SNAPSHOT'
      AND COALESCE(last_seen_request_id, '') <> ?`, SOURCE_KEY, requestId);

  const mainChecks = await certificationChecks(env);
  const mainOk = Number(mainChecks.player_rows || 0) > 500
    && Number(mainChecks.static_40man_roster_rows || 0) > 500
    && Number(mainChecks.active_player_team_count || 0) === 30
    && Number(mainChecks.active_roster_team_count || 0) === 30
    && Number(mainChecks.duplicate_mlb_player_id_count || 0) === 0
    && Number(mainChecks.missing_mlb_player_id || 0) === 0
    && Number(mainChecks.missing_full_name_or_player_name || 0) === 0
    && Number(mainChecks.alias_rows || 0) > 0;

  if (!mainOk) {
    await run(env.REF_DB, `UPDATE static_players_batches
      SET status='promotion_failed', certification_status='STATIC_PLAYERS_MAIN_CERTIFICATION_FAILED_AFTER_PROMOTION', error_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?`, JSON.stringify({ mainChecks }).slice(0, RAW_JSON_LIMIT), batchId);
    return { promoted: false, mainChecks };
  }

  await run(env.REF_DB, "DELETE FROM ref_players_stage WHERE batch_id=?", batchId);
  await run(env.REF_DB, "DELETE FROM ref_player_aliases_stage WHERE batch_id=?", batchId);
  await run(env.REF_DB, "DELETE FROM ref_rosters_stage WHERE batch_id=?", batchId);

  await run(env.REF_DB, `UPDATE static_players_batches
    SET status='promoted', certification_status='STATIC_PLAYERS_STAGE_CERTIFIED_PROMOTED_MAIN_CLEANED', promoted_at=CURRENT_TIMESTAMP, cleaned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`, batchId);

  return { promoted: true, mainChecks };
}

async function runSeed(env, input = {}) {
  await ensureSchema(env);

  const originalInput = input && typeof input.input_json === "object" && input.input_json !== null ? input.input_json : input;
  const processedMlbTeamIds = new Set(Array.isArray(originalInput.processed_mlb_team_ids) ? originalInput.processed_mlb_team_ids.map(v => String(v)) : []);
  const maxTeamsPerRunRaw = Number(originalInput.max_teams_per_run || originalInput.maxTeamsPerRun || DEFAULT_MAX_TEAMS_PER_RUN);
  const maxTeamsPerRun = Math.max(1, Math.min(Number.isFinite(maxTeamsPerRunRaw) ? maxTeamsPerRunRaw : DEFAULT_MAX_TEAMS_PER_RUN, HARD_MAX_TEAMS_PER_RUN));
  const requestId = input.request_id || originalInput.request_id || batchIdFor(input, originalInput);
  const batchId = batchIdFor({ ...input, request_id: requestId }, originalInput);

  const teams = await readActiveTeams(env);
  const distinctTeamIds = unique(teams.map(t => t.team_id)).length;
  const distinctMlbTeamIds = unique(teams.map(t => t.mlb_team_id)).length;

  if (teams.length !== 30 || distinctTeamIds !== 30 || distinctMlbTeamIds !== 30) {
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: input.request_id || null,
      chain_id: input.chain_id || null,
      batch_id: batchId,
      status: "blocked_ref_teams_not_ready",
      certification: "STATIC_PLAYERS_BLOCKED_REF_TEAMS_NOT_30_ACTIVE_MLB_TEAMS",
      teams_found: teams.length,
      distinct_team_ids: distinctTeamIds,
      distinct_mlb_team_ids: distinctMlbTeamIds,
      rows_read: teams.length,
      rows_written: 0,
      external_calls_performed: 0,
      error: "REF_DB.ref_teams must contain exactly 30 active teams with mlb_team_id before static player seed. Run/verify STATIC > Teams first.",
      boundaries: base(env).boundaries,
      timestamp_utc: nowUtc()
    };
  }

  const allMlbTeamIds = teams.map(t => String(t.mlb_team_id));
  const alreadyProcessedValid = Array.from(processedMlbTeamIds).filter(id => allMlbTeamIds.includes(id));
  const processedSet = new Set(alreadyProcessedValid);
  const isFirstChunk = processedSet.size === 0;

  if (isFirstChunk) {
    await initializeStageBatch(env, batchId, { ...input, request_id: requestId }, originalInput);
  }

  const remainingTeams = teams.filter(t => !processedSet.has(String(t.mlb_team_id)));
  const teamsThisRun = remainingTeams.slice(0, maxTeamsPerRun);

  const byMlbPlayerId = new Map();
  const sourceSamples = [];
  let externalCalls = 0;
  let rosterRowsRead = 0;
  let teamsProcessedThisRun = 0;
  let aliasesWritten = 0;
  let playersWrittenThisRun = 0;
  let rostersWritten = 0;
  const rosterSnapshots = [];
  let missingPosition = 0;
  let missingBatSide = 0;
  let missingThrowSide = 0;
  const teamSummaries = [];

  for (const team of teamsThisRun) {
    const mlbTeamId = numOrNull(team.mlb_team_id);
    const fetched = await fetchRoster(env, mlbTeamId);
    externalCalls += 1;
    teamsProcessedThisRun += 1;
    rosterRowsRead += fetched.roster.length;
    processedSet.add(String(mlbTeamId));
    teamSummaries.push({ team_id: team.team_id, mlb_team_id: mlbTeamId, abbreviation: team.abbreviation, roster_rows: fetched.roster.length, http_status: fetched.http_status });
    if (sourceSamples.length < 3) sourceSamples.push({ team_id: team.team_id, url: fetched.url, roster_rows: fetched.roster.length });

    for (const entry of fetched.roster) {
      const player = playerFromRosterEntry(entry, team);
      if (!player.mlb_player_id || !player.full_name) continue;
      if (!player.primary_position) missingPosition += 1;
      if (!player.bat_side) missingBatSide += 1;
      if (!player.throw_side) missingThrowSide += 1;

      rosterSnapshots.push({ player, team });
      const existing = byMlbPlayerId.get(String(player.mlb_player_id));
      if (!existing || (existing.current_team_id !== player.current_team_id && !existing.current_team_id)) {
        byMlbPlayerId.set(String(player.mlb_player_id), player);
      }
    }
  }

  const players = Array.from(byMlbPlayerId.values()).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const playerStatements = [];
  const aliasStatements = [];
  const rosterStatements = [];

  for (const player of players) {
    playerStatements.push(stagePlayerStmt(env, player, requestId, batchId));
    playersWrittenThisRun += 1;
    const aliases = buildAliases(player);
    for (const alias of aliases) {
      aliasStatements.push(stageAliasStmt(env, alias, requestId, batchId));
      aliasesWritten += 1;
    }
  }

  for (const snapshot of rosterSnapshots) {
    rosterStatements.push(stageRosterStmt(env, snapshot.player, snapshot.team, requestId, batchId));
    rostersWritten += 1;
  }

  const batchStatements = [...playerStatements, ...aliasStatements, ...rosterStatements];
  const d1BatchStatementsExecuted = await runD1Batch(env.REF_DB, batchStatements, D1_BATCH_SIZE);

  const processedNow = Array.from(processedSet).filter(id => allMlbTeamIds.includes(id));
  const remainingAfter = teams.filter(t => !processedSet.has(String(t.mlb_team_id)));

  if (remainingAfter.length > 0) {
    const checks = await updateStageBatchMetrics(env, batchId, processedNow, "collecting", "STATIC_PLAYERS_40MAN_IDENTITY_STAGE_PARTIAL_CONTINUE");
    const continuationInputJson = {
      ...originalInput,
      batch_id: batchId,
      mode: "static_players_40man_identity_seed",
      source_name: SOURCE_NAME,
      source_mode: "ref_teams_driven_mlb_statsapi_40man_roster",
      endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man",
      max_teams_per_run: maxTeamsPerRun,
      processed_mlb_team_ids: processedNow,
      continuation_status: "partial_continue",
      last_continued_at: nowUtc(),
      lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage",
      no_26man_only_scope: true,
      no_every_minor_leaguer_scope: true,
      no_person_detail_hydration_in_v0_1_0: true,
      no_prizepicks_board_mutation: true,
      no_prizepicks_alias_guessing: true,
      no_sleeper_alias_guessing: true,
      no_scoring: true,
      no_final_board_write: true
    };

    return {
      ok: true,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: input.request_id || null,
      chain_id: input.chain_id || null,
      batch_id: batchId,
      status: "partial_continue",
      certification: "STATIC_PLAYERS_40MAN_IDENTITY_STAGE_PARTIAL_CONTINUE",
      lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage",
      source_key: SOURCE_KEY,
      source_name: SOURCE_NAME,
      endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man",
      teams_processed_this_run: teamsProcessedThisRun,
      teams_processed_total: processedNow.length,
      teams_remaining: remainingAfter.length,
      teams_expected: 30,
      rows_read: rosterRowsRead,
      rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten,
      rows_written_target: "stage_only",
      main_tables_touched: false,
      stage_tables_touched: true,
      d1_batch_statements_executed: d1BatchStatementsExecuted,
      d1_batch_size: D1_BATCH_SIZE,
      players_staged_this_run: playersWrittenThisRun,
      aliases_staged_this_run: aliasesWritten,
      rosters_staged_this_run: rostersWritten,
      external_calls_performed: externalCalls,
      max_teams_per_run: maxTeamsPerRun,
      continuation_input_json: continuationInputJson,
      source_samples: sourceSamples,
      team_summaries: teamSummaries,
      missing_detail_counts_from_roster_payload_this_run: {
        primary_position: missingPosition,
        bat_side: missingBatSide,
        throw_side: missingThrowSide,
        note: "v0.1.9 remains bounded. It does not make person-detail hydration calls. Missing detail is counted, not guessed."
      },
      stage_certification_checks_so_far: checks,
      boundaries: base(env).boundaries,
      timestamp_utc: nowUtc()
    };
  }

  const stageChecks = await stageCertificationChecks(env, batchId);
  const playerRows = Number(stageChecks.player_rows || 0);
  const duplicateMlbPlayerIds = Number(stageChecks.duplicate_mlb_player_id_count || 0);
  const missingMlbPlayerId = Number(stageChecks.missing_mlb_player_id || 0);
  const missingFullName = Number(stageChecks.missing_full_name_or_player_name || 0);
  const aliasRows = Number(stageChecks.alias_rows || 0);
  const rosterRows = Number(stageChecks.static_40man_roster_rows || 0);
  const activePlayerTeamCount = Number(stageChecks.active_player_team_count || 0);
  const activeRosterTeamCount = Number(stageChecks.active_roster_team_count || 0);

  const stageOk = processedNow.length === 30 && playerRows > 500 && rosterRows > 500 && activePlayerTeamCount === 30 && activeRosterTeamCount === 30 && duplicateMlbPlayerIds === 0 && missingMlbPlayerId === 0 && missingFullName === 0 && aliasRows > 0;

  if (!stageOk) {
    await updateStageBatchMetrics(env, batchId, processedNow, "certification_failed", "STATIC_PLAYERS_STAGE_CERTIFICATION_FAILED", { stageChecks });
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: input.request_id || null,
      chain_id: input.chain_id || null,
      batch_id: batchId,
      status: "failed_certification",
      certification: "STATIC_PLAYERS_STAGE_CERTIFICATION_FAILED_MAIN_NOT_TOUCHED",
      lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage",
      main_tables_touched: false,
      stage_tables_retained_for_inspection: true,
      source_key: SOURCE_KEY,
      source_name: SOURCE_NAME,
      teams_processed_this_run: teamsProcessedThisRun,
      teams_processed_total: processedNow.length,
      teams_remaining: 0,
      teams_expected: 30,
      rows_read: rosterRowsRead,
      rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten,
      rows_written_target: "stage_only",
      stage_certification_checks: stageChecks,
      external_calls_performed: externalCalls,
      boundaries: base(env).boundaries,
      timestamp_utc: nowUtc()
    };
  }

  await updateStageBatchMetrics(env, batchId, processedNow, "certified", "STATIC_PLAYERS_STAGE_CERTIFIED_READY_TO_PROMOTE");
  const promotion = await promoteCertifiedStage(env, batchId, requestId);
  if (!promotion.promoted) {
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      request_id: input.request_id || null,
      chain_id: input.chain_id || null,
      batch_id: batchId,
      status: "promotion_failed",
      certification: "STATIC_PLAYERS_STAGE_CERTIFIED_MAIN_PROMOTION_FAILED",
      lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage",
      stage_certification_checks: stageChecks,
      main_certification_checks: promotion.mainChecks,
      stage_tables_retained_for_inspection: true,
      rows_read: rosterRowsRead,
      rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten,
      rows_written_target: "stage_then_failed_main_promotion",
      external_calls_performed: externalCalls,
      boundaries: base(env).boundaries,
      timestamp_utc: nowUtc()
    };
  }

  const mainChecks = promotion.mainChecks;
  const cleanup = await stageCleanupCounts(env, batchId);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    batch_id: batchId,
    status: "completed",
    certification: "STATIC_PLAYERS_STAGE_CERTIFIED_PROMOTED_MAIN_CLEANED",
    lifecycle: "mine_to_stage_certify_promote_replace_main_clean_stage",
    source_key: SOURCE_KEY,
    source_name: SOURCE_NAME,
    endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man",
    source_samples: sourceSamples,
    teams_processed_this_run: teamsProcessedThisRun,
    teams_processed_total: processedNow.length,
    teams_remaining: 0,
    teams_expected: 30,
    rows_read: rosterRowsRead,
    rows_written: playersWrittenThisRun + aliasesWritten + rostersWritten,
    rows_written_target: "stage_certified_promoted_to_main",
    main_tables_touched: true,
    stage_tables_cleaned: cleanup.total_stage_rows_for_batch === 0,
    d1_batch_statements_executed: d1BatchStatementsExecuted,
    d1_batch_size: D1_BATCH_SIZE,
    players_staged_this_run: playersWrittenThisRun,
    players_total_active_source_rows: Number(mainChecks.player_rows || 0),
    aliases_staged_this_run: aliasesWritten,
    alias_rows_total: Number(mainChecks.alias_rows || 0),
    rosters_staged_this_run: rostersWritten,
    static_40man_roster_rows_total: Number(mainChecks.static_40man_roster_rows || 0),
    active_player_team_count: Number(mainChecks.active_player_team_count || 0),
    active_roster_team_count: Number(mainChecks.active_roster_team_count || 0),
    external_calls_performed: externalCalls,
    max_teams_per_run: maxTeamsPerRun,
    missing_detail_counts_from_roster_payload_this_run: {
      primary_position: missingPosition,
      bat_side: missingBatSide,
      throw_side: missingThrowSide,
      note: "v0.1.9 remains bounded. It does not make person-detail hydration calls. Missing detail is counted, not guessed."
    },
    stage_certification_checks: stageChecks,
    main_certification_checks: mainChecks,
    staging_cleanup: cleanup,
    final_missing_detail_counts_from_active_source_rows: {
      primary_position: Number(mainChecks.missing_primary_position || 0),
      bat_side: Number(mainChecks.missing_bat_side || 0),
      throw_side: Number(mainChecks.missing_throw_side || 0),
      note: "Bat/throw are not certification blockers in v0.1.9 because the approved 40-man roster endpoint may omit them. They are counted for later bounded hydration design, not guessed."
    },
    team_summaries: teamSummaries,
    sample_players: await samplePlayers(env),
    boundaries: base(env).boundaries,
    timestamp_utc: nowUtc()
  };
}

async function stageCertificationChecks(env, batchId) {
  const row = await first(env.REF_DB, `SELECT
      (SELECT COUNT(*) FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1) AS player_rows,
      (SELECT COUNT(*) FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND (mlb_player_id IS NULL OR mlb_player_id='')) AS missing_mlb_player_id,
      (SELECT COUNT(*) FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND (COALESCE(full_name, player_name, '')='')) AS missing_full_name_or_player_name,
      (SELECT COUNT(*) FROM (
        SELECT mlb_player_id FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND mlb_player_id IS NOT NULL GROUP BY mlb_player_id HAVING COUNT(*) > 1
      )) AS duplicate_mlb_player_id_count,
      (SELECT COUNT(*) FROM ref_player_aliases_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1) AS alias_rows,
      (SELECT COUNT(*) FROM ref_rosters_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1) AS static_40man_roster_rows,
      (SELECT COUNT(*) FROM (SELECT current_team_id FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 GROUP BY current_team_id)) AS active_player_team_count,
      (SELECT COUNT(*) FROM (SELECT team_id FROM ref_rosters_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1 GROUP BY team_id)) AS active_roster_team_count,
      (SELECT COUNT(*) FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND COALESCE(primary_position, primary_role, '')='') AS missing_primary_position,
      (SELECT COUNT(*) FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND COALESCE(bat_side, bats, '')='') AS missing_bat_side,
      (SELECT COUNT(*) FROM ref_players_stage WHERE batch_id=? AND source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND COALESCE(throw_side, throws, '')='') AS missing_throw_side`,
    batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId, batchId);
  return row || {};
}

async function certificationChecks(env) {
  const row = await first(env.REF_DB, `SELECT
      (SELECT COUNT(*) FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1) AS player_rows,
      (SELECT COUNT(*) FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND (mlb_player_id IS NULL OR mlb_player_id='')) AS missing_mlb_player_id,
      (SELECT COUNT(*) FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND (COALESCE(full_name, player_name, '')='')) AS missing_full_name_or_player_name,
      (SELECT COUNT(*) FROM (
        SELECT mlb_player_id FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND mlb_player_id IS NOT NULL GROUP BY mlb_player_id HAVING COUNT(*) > 1
      )) AS duplicate_mlb_player_id_count,
      (SELECT COUNT(*) FROM ref_player_aliases WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1) AS alias_rows,
      (SELECT COUNT(*) FROM ref_rosters WHERE source_key='${SOURCE_KEY}' AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1) AS static_40man_roster_rows,
      (SELECT COUNT(*) FROM (SELECT current_team_id FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 GROUP BY current_team_id)) AS active_player_team_count,
      (SELECT COUNT(*) FROM (SELECT team_id FROM ref_rosters WHERE source_key='${SOURCE_KEY}' AND snapshot_type='STATIC_40MAN_SNAPSHOT' AND COALESCE(active,1)=1 GROUP BY team_id)) AS active_roster_team_count,
      (SELECT COUNT(*) FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND COALESCE(primary_position, primary_role, '')='') AS missing_primary_position,
      (SELECT COUNT(*) FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND COALESCE(bat_side, bats, '')='') AS missing_bat_side,
      (SELECT COUNT(*) FROM ref_players WHERE source_key='${SOURCE_KEY}' AND COALESCE(active,1)=1 AND COALESCE(throw_side, throws, '')='') AS missing_throw_side`);
  return row || {};
}

async function stageCleanupCounts(env, batchId) {
  const row = await first(env.REF_DB, `SELECT
      (SELECT COUNT(*) FROM ref_players_stage WHERE batch_id=?) AS players_stage_rows,
      (SELECT COUNT(*) FROM ref_player_aliases_stage WHERE batch_id=?) AS aliases_stage_rows,
      (SELECT COUNT(*) FROM ref_rosters_stage WHERE batch_id=?) AS rosters_stage_rows`, batchId, batchId, batchId);
  const out = row || { players_stage_rows: 0, aliases_stage_rows: 0, rosters_stage_rows: 0 };
  out.total_stage_rows_for_batch = Number(out.players_stage_rows || 0) + Number(out.aliases_stage_rows || 0) + Number(out.rosters_stage_rows || 0);
  return out;
}

async function samplePlayers(env) {
  return await all(env.REF_DB, `SELECT
      player_id,
      mlb_player_id,
      full_name,
      first_name,
      last_name,
      current_team_id,
      current_mlb_team_id,
      primary_position,
      bat_side,
      throw_side,
      source_key,
      active
    FROM ref_players
    WHERE source_key=? AND COALESCE(active,1)=1
    ORDER BY current_team_id, full_name
    LIMIT 12`, SOURCE_KEY);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") {
      return jsonResponse(base(env));
    }

    if (method === "GET" && path === "/health") {
      const bindings = bindingPresence(env, REQUIRED_DB_BINDINGS);
      const vars = varPresence(env, EXPECTED_VARS);
      return jsonResponse(base(env, {
        route: "/health",
        checks: {
          required_db_bindings_present: allTrue(bindings),
          expected_vars_present: allTrue(vars),
          db_bindings: bindings,
          vars
        }
      }));
    }

    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      let teams = [];
      try { teams = await readActiveTeams(env); } catch (_) { teams = []; }
      return jsonResponse(base(env, {
        route: "/diagnostic",
        input_echo_safe: {
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          job_key: input.job_key || null,
          mode: input.mode || null
        },
        ref_teams_probe: {
          active_team_rows_with_mlb_team_id: teams.length,
          sample: teams.slice(0, 5)
        },
        writes_performed: 0,
        external_calls_performed: 0
      }));
    }

    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runSeed(env, input);
        return jsonResponse(output, output.ok ? 200 : 500);
      } catch (err) {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: VERSION,
          worker_name: WORKER_NAME,
          job_key: JOB_KEY,
          request_id: input.request_id || null,
          chain_id: input.chain_id || null,
          status: "error",
          certification: "STATIC_PLAYERS_40MAN_IDENTITY_RUN_ERROR",
          error: String(err && err.message ? err.message : err),
          rows_read: 0,
          rows_written: 0,
          external_calls_performed: 0,
          boundaries: base(env).boundaries,
          timestamp_utc: nowUtc()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      status: "NOT_FOUND",
      allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"],
      timestamp_utc: nowUtc()
    }, 404);
  }
};
