const WORKER_NAME = "alphadog-v2-base-pitcher-splits";
const VERSION = "alphadog-v2-base-pitcher-splits-v0.2.0-base-stage-only-full-universe";
const JOB_KEY = "base-pitcher-splits";

const SOURCE_SEASON = 2026;
const GROUP_TYPE = "pitching";
const INGESTION_MODE = "base_backfill_stage_only_full_universe";
const DATA_FEED_KEY = "base_pitcher_splits";
const SOURCE_KEY = "mlb_statsapi_people_statSplits_pitching_sitCodes_vl_vr_v0_1_0";
const SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=statSplits&group=pitching&season={season}&sitCodes=vl%2Cvr";
const DEFAULT_CHUNK_SIZE = 20;
const MAX_CHUNK_SIZE = 25;
const FETCH_TIMEOUT_MS = 7000;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_PITCHER_DB"];
const EXPECTED_VARS = ["MLB_API_BASE_URL", "ACTIVE_SEASON"];
const EXPECTED_SECRETS = ["MLB_API_USER_AGENT"];

function nowUtc() { return new Date().toISOString(); }
function todayUtc() { return new Date().toISOString().slice(0, 10); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function safeJson(v) { try { return JSON.stringify(v ?? null); } catch (_) { return JSON.stringify({ stringify_error: true }); } }
function oneLine(v, max = 900) { return String(v ?? "").replace(/\s+/g, " ").slice(0, max); }
function capChunk(n) { return Math.max(1, Math.min(MAX_CHUNK_SIZE, asInt(n, DEFAULT_CHUNK_SIZE))); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function varPresence(env, names) { const out = {}; for (const n of names) out[n] = !!(env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function all(db, sql, ...binds) { const s = db.prepare(sql); const r = binds.length ? await s.bind(...binds).all() : await s.all(); return r.results || []; }
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
async function tryRun(db, sql, ...binds) { try { const r = await run(db, sql, ...binds); return { ok: true, meta: r && r.meta ? r.meta : null }; } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; } }

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  const secrets = varPresence(env, EXPECTED_SECRETS);
  return {
    ok: true,
    data_ok: true,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status: "BASE_STAGE_ONLY_READY",
    timestamp_utc: nowUtc(),
    phase: "base_pitcher_splits_v0_2_0_base_stage_only_full_universe",
    source_lock: {
      endpoint_pattern: SOURCE_ENDPOINT_PATTERN,
      source_key: SOURCE_KEY,
      season: SOURCE_SEASON,
      group_type: GROUP_TYPE,
      sitCodes: "vl,vr",
      source_probe_completed_v0_1_1: true,
      stage_only_full_universe: true,
      no_live_promotion: true,
      no_delta_update_execution: true
    },
    hard_blocks: {
      no_live_pitcher_splits_promotion: true,
      full_universe_stage_only_enabled: true,
      no_delta_update_execution: true,
      no_hitter_splits_mutation: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_game_log_mutation: true,
      no_team_logs: true,
      no_starter_history: true,
      no_bullpen_history: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true,
      no_browser_pump: true
    },
    binding_summary: {
      required_db_bindings_present: allTrue(db),
      expected_vars_present: allTrue(vars),
      required_secrets_present: allTrue(secrets)
    }
  };
}

async function ensureSchema(env) {
  const db = env.STATS_PITCHER_DB;
  const results = [];
  async function exec(label, sql, ...binds) {
    const r = await tryRun(db, sql, ...binds);
    results.push({ label, ok: r.ok, error: r.ok ? null : r.error });
    return r;
  }

  await exec("create_pitcher_schema_migrations", `CREATE TABLE IF NOT EXISTS pitcher_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`);

  await exec("create_pitcher_split_stage", `CREATE TABLE IF NOT EXISTS pitcher_split_stage (
    stage_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    season INTEGER NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'pitching',
    split_code TEXT NOT NULL,
    split_source_code TEXT,
    split_description TEXT,
    innings_pitched TEXT,
    innings_pitched_decimal REAL,
    outs_recorded INTEGER,
    batters_faced INTEGER,
    hits_allowed INTEGER,
    runs_allowed INTEGER,
    earned_runs INTEGER,
    home_runs_allowed INTEGER,
    strikeouts INTEGER,
    walks_allowed INTEGER,
    pitches INTEGER,
    strikes INTEGER,
    balls INTEGER,
    avg_against TEXT,
    obp_against TEXT,
    slg_against TEXT,
    ops_against TEXT,
    whip TEXT,
    era TEXT,
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_endpoint TEXT NOT NULL,
    source_season INTEGER NOT NULL,
    source_game_type TEXT,
    ingestion_mode TEXT NOT NULL,
    certification_status TEXT DEFAULT 'base_stage_only_unverified',
    certification_grade TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_STAGE_ONLY_NO_PROMOTION',
    certified_at TEXT,
    promoted_at TEXT,
    source_snapshot_date TEXT,
    raw_json TEXT NOT NULL,
    stat_shape_json TEXT,
    row_status TEXT DEFAULT 'base_stage_only_no_promotion',
    row_error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(batch_id, player_id, season, group_type, split_code)
  )`);

  await exec("create_pitcher_split_batches", `CREATE TABLE IF NOT EXISTS pitcher_split_batches (
    batch_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_endpoint TEXT NOT NULL,
    source_season INTEGER NOT NULL,
    source_game_type TEXT,
    source_snapshot_date TEXT,
    expected_pitcher_universe_count INTEGER DEFAULT 0,
    sample_size INTEGER DEFAULT 0,
    source_request_count INTEGER DEFAULT 0,
    source_success_count INTEGER DEFAULT 0,
    source_no_data_count INTEGER DEFAULT 0,
    source_error_count INTEGER DEFAULT 0,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_stage_keys INTEGER DEFAULT 0,
    duplicate_outcome_rows INTEGER DEFAULT 0,
    split_identifier_summary_json TEXT,
    field_summary_json TEXT,
    true_no_data_assessment TEXT,
    source_snapshot_assessment TEXT,
    certification_status TEXT DEFAULT 'probe_only_not_promotion_certified',
    certification_grade TEXT,
    certification_json TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_STAGE_ONLY_NO_PROMOTION',
    locked_by TEXT,
    lock_acquired_at TEXT,
    lock_expires_at TEXT,
    stale_recovery_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    certified_at TEXT,
    promoted_at TEXT,
    cleaned_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`);

  await exec("create_pitcher_split_outcomes", `CREATE TABLE IF NOT EXISTS pitcher_split_outcomes (
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    cursor_offset INTEGER,
    source_endpoint TEXT NOT NULL,
    source_http_status INTEGER,
    source_ok INTEGER DEFAULT 0,
    raw_payload_split_count INTEGER DEFAULT 0,
    rows_staged INTEGER DEFAULT 0,
    promoted_row_count INTEGER DEFAULT 0,
    terminal_category TEXT NOT NULL,
    category_reason TEXT,
    source_error TEXT,
    source_snapshot_date TEXT,
    split_identifier_json TEXT,
    field_names_json TEXT,
    certification_status TEXT DEFAULT 'player_outcome_probe_only',
    certification_grade TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (batch_id, player_id)
  )`);

  await exec("create_pitcher_split_cursor", `CREATE TABLE IF NOT EXISTS pitcher_split_cursor (
    cursor_key TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    source_season INTEGER,
    source_snapshot_date TEXT,
    current_player_id INTEGER,
    current_player_offset INTEGER DEFAULT 0,
    players_total INTEGER DEFAULT 0,
    players_processed INTEGER DEFAULT 0,
    requests_done INTEGER DEFAULT 0,
    next_run_after TEXT,
    last_error TEXT,
    cursor_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await exec("create_pitcher_split_certifications", `CREATE TABLE IF NOT EXISTS pitcher_split_certifications (
    certification_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    certification_status TEXT NOT NULL,
    certification_grade TEXT,
    checks_json TEXT NOT NULL,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    no_data_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    source_snapshot_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  const liveAdds = [
    ["group_type", "TEXT DEFAULT 'pitching'"],
    ["split_code", "TEXT"],
    ["split_source_code", "TEXT"],
    ["data_feed_key", "TEXT"],
    ["source_endpoint", "TEXT"],
    ["source_season", "INTEGER"],
    ["source_game_type", "TEXT"],
    ["ingestion_mode", "TEXT"],
    ["batch_id", "TEXT"],
    ["run_id", "TEXT"],
    ["certification_status", "TEXT"],
    ["certification_grade", "TEXT"],
    ["certified_at", "TEXT"],
    ["promoted_at", "TEXT"],
    ["created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"],
    ["source_snapshot_date", "TEXT"],
    ["stat_shape_json", "TEXT"],
    ["innings_pitched_decimal", "REAL"],
    ["runs_allowed", "INTEGER"],
    ["home_runs_allowed", "INTEGER"],
    ["pitches", "INTEGER"],
    ["strikes", "INTEGER"],
    ["balls", "INTEGER"],
    ["avg_against", "TEXT"],
    ["obp_against", "TEXT"],
    ["slg_against", "TEXT"],
    ["ops_against", "TEXT"]
  ];
  for (const [col, def] of liveAdds) {
    const r = await tryRun(db, `ALTER TABLE pitcher_splits ADD COLUMN ${col} ${def}`);
    const duplicate = /duplicate column name/i.test(r.error || "");
    results.push({ label: `alter_pitcher_splits_add_${col}`, ok: r.ok || duplicate, error: r.ok || duplicate ? null : r.error });
  }

  const indexes = [
    ["idx_pitcher_split_stage_batch", "CREATE INDEX IF NOT EXISTS idx_pitcher_split_stage_batch ON pitcher_split_stage(batch_id, row_status)"],
    ["idx_pitcher_split_stage_player", "CREATE INDEX IF NOT EXISTS idx_pitcher_split_stage_player ON pitcher_split_stage(player_id, season, split_code)"],
    ["idx_pitcher_split_stage_cert", "CREATE INDEX IF NOT EXISTS idx_pitcher_split_stage_cert ON pitcher_split_stage(certification_status, batch_id)"],
    ["idx_pitcher_split_batches_status", "CREATE INDEX IF NOT EXISTS idx_pitcher_split_batches_status ON pitcher_split_batches(status, mode, updated_at)"],
    ["idx_pitcher_split_cursor_status", "CREATE INDEX IF NOT EXISTS idx_pitcher_split_cursor_status ON pitcher_split_cursor(status, mode, updated_at)"],
    ["idx_pitcher_split_outcomes_batch_category", "CREATE INDEX IF NOT EXISTS idx_pitcher_split_outcomes_batch_category ON pitcher_split_outcomes(batch_id, terminal_category)"],
    ["idx_pitcher_split_outcomes_player", "CREATE INDEX IF NOT EXISTS idx_pitcher_split_outcomes_player ON pitcher_split_outcomes(player_id, batch_id)"],
    ["idx_pitcher_splits_lineage", "CREATE INDEX IF NOT EXISTS idx_pitcher_splits_lineage ON pitcher_splits(batch_id, certification_status)"],
    ["idx_pitcher_splits_player_split_code", "CREATE INDEX IF NOT EXISTS idx_pitcher_splits_player_split_code ON pitcher_splits(player_id, season, split_code)"]
  ];
  for (const [label, sql] of indexes) await exec(label, sql);

  await exec("record_schema_migration_v0_1_0", "INSERT OR REPLACE INTO pitcher_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_pitcher_splits_v0_2_0_base_stage_only_full_universe', ?, CURRENT_TIMESTAMP, 'Base Pitcher Splits v0.2.0 full-universe stage-only; no live promotion/no delta/no cleanup')", VERSION);
  return { attempted: results.length, failed: results.filter(r => !r.ok).length, results };
}

async function schemaStatus(env) {
  const tables = await all(env.STATS_PITCHER_DB, "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'pitcher_split%' OR name='pitcher_splits') ORDER BY name");
  const indexes = await all(env.STATS_PITCHER_DB, "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_pitcher_split%' ORDER BY name");
  const liveCols = await all(env.STATS_PITCHER_DB, "PRAGMA table_info(pitcher_splits)");
  return { tables: tables.map(r => r.name), indexes: indexes.map(r => r.name), pitcher_splits_columns: liveCols.map(r => r.name) };
}

function endpointFor(env, playerId, season) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  return `${base}/people/${encodeURIComponent(playerId)}/stats?stats=statSplits&group=pitching&season=${encodeURIComponent(season)}&sitCodes=vl%2Cvr`;
}

async function readPitcherUniverse(env) {
  // v0.1.1: use the deployed REF_DB shape verified by Manual SQL on 2026-05-22.
  // Safe pitcher definition: active REF roster/player rows where role/position abbreviation is source-proven P.
  const rows = await all(env.REF_DB, `SELECT
      r.player_id AS player_id,
      COALESCE(MAX(p.player_name), MAX(p.full_name), MAX(r.player_name), CAST(r.player_id AS TEXT)) AS player_name,
      MAX(r.team_id) AS team_id,
      MAX(r.role) AS role,
      MAX(r.position_abbreviation) AS position_abbreviation,
      MAX(r.source_key) AS source_key,
      MAX(r.snapshot_type) AS snapshot_type,
      MAX(r.roster_date) AS roster_date
    FROM ref_rosters r
    LEFT JOIN ref_players p ON p.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
      AND COALESCE(r.active, 1) = 1
      AND COALESCE(p.active, 1) = 1
      AND (
        r.role = 'P'
        OR r.position_abbreviation = 'P'
        OR p.primary_role = 'P'
        OR p.primary_position = 'P'
      )
    GROUP BY r.player_id
    ORDER BY r.player_id`);

  const duplicateRows = await all(env.REF_DB, `SELECT player_id, COUNT(*) AS c
    FROM ref_rosters
    WHERE player_id IS NOT NULL
      AND COALESCE(active, 1) = 1
      AND (role = 'P' OR position_abbreviation = 'P')
    GROUP BY player_id
    HAVING COUNT(*) > 1
    ORDER BY c DESC, player_id
    LIMIT 20`);

  const players = rows.map((r, idx) => ({
    player_id: asInt(r.player_id, 0),
    player_name: r.player_name || null,
    team_id: r.team_id || null,
    role: r.role || r.position_abbreviation || null,
    source_key: r.source_key || null,
    snapshot_type: r.snapshot_type || null,
    roster_date: r.roster_date || null,
    cursor_offset: idx,
    universe_source: "REF_DB.ref_rosters.active_role_P_position_P_join_ref_players_active"
  })).filter(p => p.player_id);

  return {
    ok: players.length > 0,
    source: "REF_DB.ref_rosters active role/position P + ref_players active",
    expected_count: players.length,
    duplicate_count: duplicateRows.length,
    duplicate_player_ids: duplicateRows.map(r => ({ player_id: asInt(r.player_id, 0), rows: asInt(r.c, 0) })),
    players
  };
}

async function getActiveStageCursor(env) {
  return await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_cursor
    WHERE cursor_key='base_pitcher_splits_stage_only_cursor'
      AND mode=?
      AND status IN ('STAGE_ONLY_RUNNING','PARTIAL_CONTINUE','FINALIZATION_ONLY')
    ORDER BY datetime(updated_at) DESC
    LIMIT 1`, INGESTION_MODE);
}

async function createStageBatch(env, input, universe) {
  const batchId = rid("pitcher_splits_stage_batch");
  const runId = input.run_id || rid("run_pitcher_splits_stage");
  const sourceSnapshotDate = todayUtc();
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_endpoint,source_season,source_game_type,source_snapshot_date,expected_pitcher_universe_count,sample_size,rows_promoted,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`, batchId, runId, WORKER_NAME, VERSION, INGESTION_MODE, "STAGE_ONLY_RUNNING", DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_PATTERN, SOURCE_SEASON, null, sourceSnapshotDate, universe.expected_count || 0, universe.expected_count || 0, "v0.2.0 full-universe base stage only; no live promotion/no delta/no cleanup");
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_stage_only_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, INGESTION_MODE, "STAGE_ONLY_RUNNING", SOURCE_SEASON, sourceSnapshotDate, null, 0, universe.expected_count || 0, 0, 0, null, null, safeJson({ created_by: VERSION, no_live_promotion: true }));
  return { batch_id: batchId, run_id: runId, source_snapshot_date: sourceSnapshotDate, current_player_offset: 0, players_processed: 0, requests_done: 0 };
}

async function loadOrCreateStageCursor(env, input, universe) {
  const active = await getActiveStageCursor(env);
  if (active) return {
    batch_id: active.batch_id,
    run_id: active.run_id,
    source_snapshot_date: active.source_snapshot_date || todayUtc(),
    current_player_offset: asInt(active.current_player_offset, 0),
    players_processed: asInt(active.players_processed, 0),
    requests_done: asInt(active.requests_done, 0),
    resumed: true
  };
  return { ...(await createStageBatch(env, input, universe)), resumed: false };
}

async function fetchTextWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), Math.max(1000, Number(timeoutMs || FETCH_TIMEOUT_MS)));
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    const text = await resp.text();
    return { ok: true, resp, text, timed_out: false };
  } catch (err) {
    return { ok: false, resp: null, text: "", timed_out: String(err && err.name ? err.name : err).includes("Abort") || String(err).includes("timeout"), error: String(err && err.message ? err.message : err) };
  } finally { clearTimeout(timer); }
}

function extractSplits(payload) {
  const stats = Array.isArray(payload && payload.stats) ? payload.stats : [];
  const out = [];
  for (const block of stats) {
    const splits = Array.isArray(block && block.splits) ? block.splits : [];
    for (const split of splits) out.push(split);
  }
  return out;
}

function splitIdentifierParts(split) {
  const s = split || {};
  const splitObj = s.split || s.statSplit || s.situation || {};
  const candidates = [];
  const push = (label, value) => { if (value !== undefined && value !== null && String(value).trim() !== "") candidates.push({ label, value: String(value).trim() }); };
  push("split.code", splitObj.code);
  push("split.name", splitObj.name);
  push("split.description", splitObj.description);
  push("split.displayName", splitObj.displayName);
  push("split.type", splitObj.type);
  push("split.value", splitObj.value);
  push("statSplit", s.statSplit);
  push("type", s.type);
  push("group.displayName", s.group && s.group.displayName);
  push("displayName", s.displayName);
  push("description", s.description);
  push("sitCode", s.sitCode);
  return candidates;
}

function mapSplitCode(split) {
  const parts = splitIdentifierParts(split);
  const joined = parts.map(p => `${p.label}:${p.value}`).join(" | ").toLowerCase();
  if (/\bvl\b|vs\.?\s*l|left|lhb|left-handed|left handed/.test(joined)) return { split_code: "vs_left", evidence: parts, confirmed: true };
  if (/\bvr\b|vs\.?\s*r|right|rhb|right-handed|right handed/.test(joined)) return { split_code: "vs_right", evidence: parts, confirmed: true };
  const fallback = parts[0] && parts[0].value ? `source_${parts[0].value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}` : "source_unmapped";
  return { split_code: fallback || "source_unmapped", evidence: parts, confirmed: false };
}

function statFields(stat) { if (!stat || typeof stat !== "object") return []; return Object.keys(stat).sort(); }
function statVal(stat, ...keys) { for (const k of keys) { if (stat && stat[k] !== undefined && stat[k] !== null && String(stat[k]).trim() !== "") return stat[k]; } return null; }
function intStat(stat, ...keys) { const v = statVal(stat, ...keys); return v === null ? null : asInt(v, null); }
function numStat(stat, ...keys) { const v = statVal(stat, ...keys); if (v === null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function textStat(stat, ...keys) { const v = statVal(stat, ...keys); return v === null ? null : String(v); }
function inningsDecimal(innings) {
  if (innings === null || innings === undefined || String(innings).trim() === "") return null;
  const s = String(innings);
  if (!s.includes(".")) { const n = Number(s); return Number.isFinite(n) ? n : null; }
  const [whole, frac] = s.split(".");
  const outs = Number(frac || 0);
  const w = Number(whole || 0);
  if (!Number.isFinite(w) || !Number.isFinite(outs)) return null;
  if (outs === 1) return w + (1 / 3);
  if (outs === 2) return w + (2 / 3);
  return Number(s);
}
function outsFromInnings(innings) {
  const s = String(innings ?? "");
  if (!s) return null;
  if (!s.includes(".")) { const n = Number(s); return Number.isFinite(n) ? Math.round(n * 3) : null; }
  const [whole, frac] = s.split(".");
  const w = Number(whole || 0);
  const outs = Number(frac || 0);
  return Number.isFinite(w) && Number.isFinite(outs) ? Math.round(w * 3 + outs) : null;
}

function parseStageRow(split, player, season, batchId, runId, endpoint, sourceSnapshotDate, statusLabel) {
  const stat = split && split.stat ? split.stat : {};
  const mapped = mapSplitCode(split);
  const sourceCode = mapped.evidence && mapped.evidence[0] ? mapped.evidence[0].value : mapped.split_code;
  const description = mapped.evidence && mapped.evidence.length ? mapped.evidence.map(x => `${x.label}=${x.value}`).join("; ") : mapped.split_code;
  const innings = textStat(stat, "inningsPitched", "ip");
  return {
    stage_id: `${batchId}_${player.player_id}_${season}_${mapped.split_code}`,
    batch_id: batchId,
    run_id: runId,
    player_id: player.player_id,
    player_name: player.player_name || null,
    season,
    group_type: GROUP_TYPE,
    split_code: mapped.split_code,
    split_source_code: sourceCode,
    split_description: description,
    innings_pitched: innings,
    innings_pitched_decimal: inningsDecimal(innings),
    outs_recorded: intStat(stat, "outs", "outsRecorded") ?? outsFromInnings(innings),
    batters_faced: intStat(stat, "battersFaced"),
    hits_allowed: intStat(stat, "hits"),
    runs_allowed: intStat(stat, "runs"),
    earned_runs: intStat(stat, "earnedRuns"),
    home_runs_allowed: intStat(stat, "homeRuns"),
    strikeouts: intStat(stat, "strikeOuts", "strikeouts"),
    walks_allowed: intStat(stat, "baseOnBalls", "walks"),
    pitches: intStat(stat, "numberOfPitches", "pitches"),
    strikes: intStat(stat, "strikes"),
    balls: intStat(stat, "balls"),
    avg_against: textStat(stat, "avg"),
    obp_against: textStat(stat, "obp"),
    slg_against: textStat(stat, "slg"),
    ops_against: textStat(stat, "ops"),
    whip: textStat(stat, "whip"),
    era: textStat(stat, "era"),
    data_feed_key: DATA_FEED_KEY,
    source_key: SOURCE_KEY,
    source_endpoint: endpoint,
    source_season: season,
    source_game_type: null,
    ingestion_mode: INGESTION_MODE,
    certification_status: statusLabel,
    certification_grade: null,
    source_confidence: "SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_STAGE_ONLY_NO_PROMOTION",
    certified_at: null,
    promoted_at: null,
    source_snapshot_date: sourceSnapshotDate,
    raw_json: safeJson(split),
    stat_shape_json: safeJson({ stat_fields: statFields(stat), identifier_evidence: mapped.evidence, mapping_confirmed: mapped.confirmed }),
    row_status: "base_stage_only_no_promotion",
    row_error: mapped.confirmed ? null : "split_identifier_not_confirmed"
  };
}

async function insertStageRow(env, row) {
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_stage (
    stage_id,batch_id,run_id,player_id,player_name,season,group_type,split_code,split_source_code,split_description,
    innings_pitched,innings_pitched_decimal,outs_recorded,batters_faced,hits_allowed,runs_allowed,earned_runs,home_runs_allowed,strikeouts,walks_allowed,pitches,strikes,balls,avg_against,obp_against,slg_against,ops_against,whip,era,
    data_feed_key,source_key,source_endpoint,source_season,source_game_type,ingestion_mode,certification_status,certification_grade,source_confidence,certified_at,promoted_at,source_snapshot_date,raw_json,stat_shape_json,row_status,row_error,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    row.stage_id,row.batch_id,row.run_id,row.player_id,row.player_name,row.season,row.group_type,row.split_code,row.split_source_code,row.split_description,
    row.innings_pitched,row.innings_pitched_decimal,row.outs_recorded,row.batters_faced,row.hits_allowed,row.runs_allowed,row.earned_runs,row.home_runs_allowed,row.strikeouts,row.walks_allowed,row.pitches,row.strikes,row.balls,row.avg_against,row.obp_against,row.slg_against,row.ops_against,row.whip,row.era,
    row.data_feed_key,row.source_key,row.source_endpoint,row.source_season,row.source_game_type,row.ingestion_mode,row.certification_status,row.certification_grade,row.source_confidence,row.certified_at,row.promoted_at,row.source_snapshot_date,row.raw_json,row.stat_shape_json,row.row_status,row.row_error);
}

async function finalizeStageOnly(env, batchId, runId, sourceSnapshotDate, universeCount) {
  const outcomeTotal = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=?", batchId);
  const stageTotal = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const catRows = await all(env.STATS_PITCHER_DB, "SELECT terminal_category, COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=? GROUP BY terminal_category ORDER BY terminal_category", batchId);
  const sourceErrors = catRows.filter(r => String(r.terminal_category) === "SOURCE_ERROR").reduce((a,r)=>a+asInt(r.c,0),0);
  const repairRows = catRows.filter(r => String(r.terminal_category) === "REPAIR_REQUIRED").reduce((a,r)=>a+asInt(r.c,0),0);
  const unclearRows = catRows.filter(r => String(r.terminal_category) === "UNCLEAR").reduce((a,r)=>a+asInt(r.c,0),0);
  const trueNoData = catRows.filter(r => String(r.terminal_category) === "TRUE_NO_DATA").reduce((a,r)=>a+asInt(r.c,0),0);
  const successRows = catRows.filter(r => String(r.terminal_category) === "STAGE_ROWS_WRITTEN").reduce((a,r)=>a+asInt(r.c,0),0);
  const dupStage = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT batch_id, player_id, season, group_type, split_code, COUNT(*) AS n FROM pitcher_split_stage WHERE batch_id=? GROUP BY batch_id, player_id, season, group_type, split_code HAVING n>1)`, batchId);
  const dupOutcome = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT batch_id, player_id, COUNT(*) AS n FROM pitcher_split_outcomes WHERE batch_id=? GROUP BY batch_id, player_id HAVING n>1)`, batchId);
  const badGroup = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=? AND group_type <> 'pitching'", batchId);
  const invalidSplit = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=? AND split_code NOT IN ('vs_left','vs_right')", batchId);
  const missingLineage = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=? AND (player_id IS NULL OR season IS NULL OR group_type IS NULL OR split_code IS NULL OR source_key IS NULL OR source_endpoint IS NULL OR source_season IS NULL OR ingestion_mode IS NULL OR batch_id IS NULL OR run_id IS NULL OR raw_json IS NULL OR source_snapshot_date IS NULL OR stat_shape_json IS NULL)`, batchId);
  const splitCoverage = await all(env.STATS_PITCHER_DB, "SELECT split_code, COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players FROM pitcher_split_stage WHERE batch_id=? GROUP BY split_code ORDER BY split_code", batchId);
  const fieldRows = await all(env.STATS_PITCHER_DB, "SELECT stat_shape_json FROM pitcher_split_stage WHERE batch_id=? LIMIT 1000", batchId);
  const fieldSet = new Set();
  for (const r of fieldRows) {
    try { const j = JSON.parse(r.stat_shape_json || "{}"); (j.stat_fields || []).forEach(f => fieldSet.add(f)); } catch (_) {}
  }
  const fields = Array.from(fieldSet).sort();
  const checks = {
    stage_only_full_universe: true,
    no_live_promotion: true,
    no_delta_update_execution: true,
    expected_pitcher_universe_count: universeCount,
    outcome_rows: asInt(outcomeTotal && outcomeTotal.c, 0),
    stage_rows: asInt(stageTotal && stageTotal.c, 0),
    success_outcomes: successRows,
    true_no_data_count: trueNoData,
    source_error_count: sourceErrors,
    repair_required_count: repairRows,
    unclear_count: unclearRows,
    duplicate_stage_keys: asInt(dupStage && dupStage.c, 0),
    duplicate_outcome_rows: asInt(dupOutcome && dupOutcome.c, 0),
    bad_group_type: asInt(badGroup && badGroup.c, 0),
    invalid_split_code_count: asInt(invalidSplit && invalidSplit.c, 0),
    missing_lineage_count: asInt(missingLineage && missingLineage.c, 0),
    split_coverage: splitCoverage,
    field_names_observed: fields,
    true_no_data_assessment: trueNoData > 0 ? "TRUE_NO_DATA_OBSERVED_ON_CLEAN_EMPTY_2XX_JSON" : "TRUE_NO_DATA_NOT_OBSERVED_IN_FULL_STAGE_RUN",
    source_snapshot_assessment: "SEASON_TO_DATE_SOURCE_SNAPSHOT_STAGE_ONLY_NO_CUTOFF_DATE_APPLIED"
  };
  const pass = checks.stage_rows > 0 && checks.outcome_rows === universeCount && checks.duplicate_stage_keys === 0 && checks.duplicate_outcome_rows === 0 && checks.source_error_count === 0 && checks.repair_required_count === 0 && checks.unclear_count === 0 && checks.bad_group_type === 0 && checks.invalid_split_code_count === 0 && checks.missing_lineage_count === 0;
  const certStatus = pass ? "BASE_PITCHER_SPLITS_STAGE_ONLY_FULL_UNIVERSE_CERTIFIED_NO_PROMOTION" : "BASE_PITCHER_SPLITS_STAGE_ONLY_FULL_UNIVERSE_REVIEW_REQUIRED_NO_PROMOTION";
  const grade = pass ? "STAGE_ONLY_PASS" : "STAGE_ONLY_REVIEW";
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, rows_staged=?, rows_promoted=0, duplicate_stage_keys=?, duplicate_outcome_rows=?, source_error_count=?, source_no_data_count=?, split_identifier_summary_json=?, field_summary_json=?, true_no_data_assessment=?, source_snapshot_assessment=?, certification_status=?, certification_grade=?, certification_json=?, finished_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    "STAGE_ONLY_COMPLETED_NO_PROMOTION", checks.stage_rows, checks.duplicate_stage_keys, checks.duplicate_outcome_rows, checks.source_error_count, checks.true_no_data_count, safeJson(splitCoverage), safeJson(fields), checks.true_no_data_assessment, checks.source_snapshot_assessment, certStatus, grade, safeJson(checks), batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status='STAGE_ONLY_COMPLETED_NO_PROMOTION', current_player_offset=?, players_processed=?, next_run_after=NULL, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_stage_only_cursor'`, universeCount, universeCount, safeJson({ finalization_only: true, checks }));
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid("pitcher_splits_stage_cert"), batchId, runId, INGESTION_MODE, certStatus, grade, safeJson(checks), checks.stage_rows, 0, checks.duplicate_stage_keys, checks.true_no_data_count, checks.source_error_count, sourceSnapshotDate);
  return { pass, certStatus, grade, checks };
}

async function runProbe(env, input) {
  if (!env.STATS_PITCHER_DB || !env.REF_DB) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "blocked_missing_required_db_binding", certification: "BASE_PITCHER_SPLITS_REQUIRED_DB_BINDING_MISSING", rows_read: 0, rows_written: 0, external_calls_performed: 0 };
  }
  const mode = String(input.mode || input.input_json?.mode || INGESTION_MODE);
  if (/delta/i.test(mode)) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "blocked_delta_update_not_enabled", certification: "BASE_PITCHER_SPLITS_DELTA_BLOCKED_UNTIL_BASE_CERTIFIED", rows_read: 0, rows_written: 0, external_calls_performed: 0 };
  }

  const inputJson = input.input_json || input || {};
  const chunkSize = capChunk(inputJson.chunk_size || inputJson.max_players_per_tick || DEFAULT_CHUNK_SIZE);
  const schema = await ensureSchema(env);
  const liveBefore = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits");
  const universe = await readPitcherUniverse(env);
  const cursor = await loadOrCreateStageCursor(env, input, universe);
  const batchId = cursor.batch_id;
  const runId = cursor.run_id;
  const sourceSnapshotDate = cursor.source_snapshot_date || todayUtc();
  const startOffset = Math.max(0, asInt(cursor.current_player_offset, 0));
  const players = universe.players.slice(startOffset, startOffset + chunkSize);

  if (universe.expected_count <= 0) {
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status='STAGE_ONLY_BLOCKED_EMPTY_PITCHER_UNIVERSE', certification_status='BASE_PITCHER_SPLITS_EMPTY_PITCHER_UNIVERSE_BLOCKED', certification_grade='BLOCKED', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, batchId);
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "STAGE_ONLY_BLOCKED_EMPTY_PITCHER_UNIVERSE", certification: "BASE_PITCHER_SPLITS_EMPTY_PITCHER_UNIVERSE_BLOCKED", rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false };
  }

  if (players.length === 0) {
    const final = await finalizeStageOnly(env, batchId, runId, sourceSnapshotDate, universe.expected_count);
    const liveAfter = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits");
    return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "STAGE_ONLY_COMPLETED_NO_PROMOTION", certification: final.certStatus, certification_grade: final.grade, rows_read: 0, rows_written: 1, rows_staged: final.checks.stage_rows, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, finalization_only: true, source_stage: { batch_id: batchId, run_id: runId, expected_pitcher_universe_count: universe.expected_count, players_processed: universe.expected_count, checks: final.checks, live_rows_before: asInt(liveBefore && liveBefore.c, 0), live_rows_after: asInt(liveAfter && liveAfter.c, 0), no_live_promotion_occurred: asInt(liveBefore && liveBefore.c, 0) === asInt(liveAfter && liveAfter.c, 0) }, boundaries: baseIdentity(env).hard_blocks, timestamp_utc: nowUtc() };
  }

  const headers = { "accept": "application/json" };
  if (env.MLB_API_USER_AGENT) headers["user-agent"] = env.MLB_API_USER_AGENT;
  let sourceRequestCount = 0, sourceSuccessCount = 0, sourceNoDataCount = 0, sourceErrorCount = 0, rowsStaged = 0;
  const playerSummaries = [];

  for (const player of players) {
    const endpoint = endpointFor(env, player.player_id, SOURCE_SEASON);
    sourceRequestCount += 1;
    const fetched = await fetchTextWithTimeout(endpoint, { headers }, FETCH_TIMEOUT_MS);
    let httpStatus = fetched.resp ? fetched.resp.status : null;
    let payload = null;
    let sourceError = null;
    if (!fetched.ok) sourceError = fetched.error || "fetch_failed";
    else {
      try { payload = JSON.parse(fetched.text || "{}"); }
      catch (err) { sourceError = "non_json_response: " + String(err && err.message ? err.message : err); }
    }
    const splits = payload ? extractSplits(payload) : [];
    const fieldsThisPlayer = new Set();
    const identifiersThisPlayer = [];
    if (sourceError || !(httpStatus >= 200 && httpStatus < 300)) {
      sourceErrorCount += 1;
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 0, 0, 0, 0, "SOURCE_ERROR", "source request failed or non-2xx/non-json", oneLine(sourceError || fetched.text), sourceSnapshotDate, "[]", "[]", "stage_only_source_error");
      playerSummaries.push({ player_id: player.player_id, terminal_category: "SOURCE_ERROR", http_status: httpStatus });
      continue;
    }
    if (splits.length === 0) {
      sourceNoDataCount += 1;
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 1, 0, 0, 0, "TRUE_NO_DATA", "clean 2xx JSON response with zero statSplits rows", null, sourceSnapshotDate, "[]", "[]", "stage_only_true_no_data");
      playerSummaries.push({ player_id: player.player_id, terminal_category: "TRUE_NO_DATA", http_status: httpStatus });
      continue;
    }
    sourceSuccessCount += 1;
    let stagedForPlayer = 0;
    let unclearIdentifier = false;
    for (const split of splits) {
      const stat = split && split.stat ? split.stat : {};
      for (const f of statFields(stat)) fieldsThisPlayer.add(f);
      const mapped = mapSplitCode(split);
      if (!mapped.confirmed) unclearIdentifier = true;
      identifiersThisPlayer.push({ split_code: mapped.split_code, confirmed: mapped.confirmed, evidence: mapped.evidence });
      const row = parseStageRow(split, player, SOURCE_SEASON, batchId, runId, endpoint, sourceSnapshotDate, mapped.confirmed ? "base_stage_only_identifier_confirmed" : "base_stage_only_identifier_unconfirmed");
      await insertStageRow(env, row);
      stagedForPlayer += 1;
      rowsStaged += 1;
    }
    const category = unclearIdentifier ? "UNCLEAR" : "STAGE_ROWS_WRITTEN";
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 1, splits.length, stagedForPlayer, 0, category, category === "UNCLEAR" ? "one or more split identifiers not confirmed by source evidence" : "full-universe stage-only rows written; no live promotion", null, sourceSnapshotDate, safeJson(identifiersThisPlayer), safeJson(Array.from(fieldsThisPlayer).sort()), category === "UNCLEAR" ? "stage_only_identifier_unclear" : "stage_only_identifier_confirmed");
    playerSummaries.push({ player_id: player.player_id, terminal_category: category, http_status: httpStatus, split_count: splits.length, rows_staged: stagedForPlayer });
  }

  const nextOffset = startOffset + players.length;
  const completed = nextOffset >= universe.expected_count;
  const totalRequests = asInt(cursor.requests_done, 0) + sourceRequestCount;
  const totalProcessed = Math.min(universe.expected_count, nextOffset);
  const stageTotal = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const outcomeTotal = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=?", batchId);

  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, source_request_count=COALESCE(source_request_count,0)+?, source_success_count=COALESCE(source_success_count,0)+?, source_no_data_count=COALESCE(source_no_data_count,0)+?, source_error_count=COALESCE(source_error_count,0)+?, rows_staged=?, rows_promoted=0, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, completed ? "FINALIZATION_ONLY" : "PARTIAL_CONTINUE", sourceRequestCount, sourceSuccessCount, sourceNoDataCount, sourceErrorCount, asInt(stageTotal && stageTotal.c, 0), batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status=?, current_player_id=?, current_player_offset=?, players_total=?, players_processed=?, requests_done=?, next_run_after=CURRENT_TIMESTAMP, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_stage_only_cursor'`, completed ? "FINALIZATION_ONLY" : "PARTIAL_CONTINUE", players.length ? players[players.length - 1].player_id : null, nextOffset, universe.expected_count, totalProcessed, totalRequests, safeJson({ chunk_size: chunkSize, last_chunk_player_ids: players.map(p => p.player_id), finalization_only_ready: completed }));

  if (completed) {
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "partial_continue_base_pitcher_splits", certification: "BASE_PITCHER_SPLITS_STAGE_ONLY_FINALIZATION_REQUIRED_NO_PROMOTION", certification_grade: "FINALIZATION_ONLY_READY", rows_read: players.length, rows_written: rowsStaged + players.length, rows_staged: asInt(stageTotal && stageTotal.c, 0), rows_promoted: 0, external_calls_performed: sourceRequestCount, continuation_required: true, orchestrator_should_self_continue: true, next_step: "FINALIZATION_ONLY_ZERO_MLB_CALLS", source_stage: { batch_id: batchId, run_id: runId, expected_pitcher_universe_count: universe.expected_count, players_processed: totalProcessed, outcome_rows: asInt(outcomeTotal && outcomeTotal.c, 0), current_offset: nextOffset, chunk_size: chunkSize, player_summaries: playerSummaries }, boundaries: baseIdentity(env).hard_blocks, timestamp_utc: nowUtc() };
  }

  return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "partial_continue_base_pitcher_splits", certification: "BASE_PITCHER_SPLITS_STAGE_ONLY_PARTIAL_CONTINUE_NO_PROMOTION", certification_grade: "PARTIAL_CONTINUE", rows_read: players.length, rows_written: rowsStaged + players.length, rows_staged: asInt(stageTotal && stageTotal.c, 0), rows_promoted: 0, external_calls_performed: sourceRequestCount, continuation_required: true, orchestrator_should_self_continue: true, source_stage: { batch_id: batchId, run_id: runId, expected_pitcher_universe_count: universe.expected_count, players_processed: totalProcessed, outcome_rows: asInt(outcomeTotal && outcomeTotal.c, 0), current_offset: nextOffset, chunk_size: chunkSize, player_summaries: playerSummaries }, boundaries: baseIdentity(env).hard_blocks, timestamp_utc: nowUtc() };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, EXPECTED_SECRETS) }, safe_secret_note: "Secret values are intentionally never printed." });
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, schema_status: env.STATS_PITCHER_DB ? await schemaStatus(env).catch(err => ({ error: String(err && err.message ? err.message : err) })) : null, writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runProbe(env, input)); }
      catch (err) { return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BASE_STAGE_ONLY_FAILED", certification: "BASE_PITCHER_SPLITS_BASE_STAGE_ONLY_FAILED", error: String(err && err.message ? err.message : err), rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, timestamp_utc: nowUtc() }, 500); }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
