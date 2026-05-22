const WORKER_NAME = "alphadog-v2-base-pitcher-splits";
const VERSION = "alphadog-v2-base-pitcher-splits-v0.5.2-scoped-remine-repair-fix";
const JOB_KEY = "base-pitcher-splits";

const SOURCE_SEASON = 2026;
const GROUP_TYPE = "pitching";
const INGESTION_MODE = "base_backfill_stage_only_full_universe";
const PROMOTION_MODE = "base_backfill_promote_certified_stage";
const DELTA_REFRESH_MODE = "delta_update_stage_retain_refresh";
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
function cleanBinds(binds) { return binds.map(v => v === undefined ? null : v); }
async function all(db, sql, ...binds) { const s = db.prepare(sql); const r = binds.length ? await s.bind(...cleanBinds(binds)).all() : await s.all(); return r.results || []; }
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...cleanBinds(binds)).run() : await s.run(); }
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
    status: "BASE_PROMOTION_READY",
    timestamp_utc: nowUtc(),
    phase: "base_pitcher_splits_v0_5_2_scoped_remine_repair_fix",
    source_lock: {
      endpoint_pattern: SOURCE_ENDPOINT_PATTERN,
      source_key: SOURCE_KEY,
      season: SOURCE_SEASON,
      group_type: GROUP_TYPE,
      sitCodes: "vl,vr",
      source_probe_completed_v0_1_1: true,
      stage_only_full_universe_completed_v0_2_0: true,
      certified_stage_promotion_enabled: true,
      delta_noop_restore_scoped_repair_gate_enabled: true,
      scoped_remine_repair_bind_sanitizer_v0_5_2: true
    },
    hard_blocks: {
      live_pitcher_splits_promotion_enabled_from_certified_stage_only: true,
      full_universe_stage_only_completed_v0_2_0: true,
      delta_noop_restore_scoped_repair_gate_enabled: true,
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

  await exec("create_pitcher_split_repair_registry", `CREATE TABLE IF NOT EXISTS pitcher_split_repair_registry (
    registry_key TEXT PRIMARY KEY,
    target_batch_id TEXT NOT NULL,
    source_batch_id TEXT,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    season INTEGER NOT NULL,
    group_type TEXT NOT NULL,
    split_code TEXT NOT NULL,
    split_source_code TEXT,
    source_endpoint TEXT,
    source_snapshot_date TEXT,
    target_row_json TEXT,
    status TEXT NOT NULL,
    created_by_version TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

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

  await exec("record_schema_migration_v0_5_1", "INSERT OR REPLACE INTO pitcher_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_pitcher_splits_v0_5_2_scoped_remine_repair_fix', ?, CURRENT_TIMESTAMP, 'Base Pitcher Splits v0.5.2 fixes scoped re-mine undefined bind handling; no full sweep; one-player repair only')", VERSION);
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


async function findCertifiedStageBatch(env) {
  return await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_batches
    WHERE mode='base_backfill_stage_only_full_universe'
      AND COALESCE(rows_staged,0) > 0
      AND (
        (
          status='STAGE_ONLY_COMPLETED_NO_PROMOTION'
          AND certification_status='BASE_PITCHER_SPLITS_STAGE_ONLY_FULL_UNIVERSE_CERTIFIED_NO_PROMOTION'
          AND certification_grade='STAGE_ONLY_PASS'
        )
        OR status IN ('PROMOTION_RUNNING','PARTIAL_CONTINUE','FINALIZATION_ONLY')
      )
    ORDER BY
      CASE
        WHEN status IN ('PROMOTION_RUNNING','PARTIAL_CONTINUE','FINALIZATION_ONLY') THEN 0
        ELSE 1
      END,
      datetime(updated_at) DESC,
      datetime(finished_at) DESC,
      datetime(created_at) DESC
    LIMIT 1`);
}

async function getPromotionCursor(env, stageBatch, runId) {
  const existing = await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_cursor
    WHERE cursor_key='base_pitcher_splits_promotion_cursor'
      AND batch_id=?
      AND mode=?
      AND status IN ('PROMOTION_RUNNING','PARTIAL_CONTINUE','FINALIZATION_ONLY')
    LIMIT 1`, stageBatch.batch_id, PROMOTION_MODE);
  if (existing) return existing;
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_promotion_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, stageBatch.batch_id, runId, PROMOTION_MODE, 'PROMOTION_RUNNING', SOURCE_SEASON, stageBatch.source_snapshot_date || todayUtc(), null, 0, asInt(stageBatch.rows_staged, 0), 0, 0, null, null, safeJson({ created_by: VERSION, promotes_certified_stage_batch: stageBatch.batch_id, zero_mlb_calls: true, no_remine: true, no_delta: true }));
  return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_split_cursor WHERE cursor_key='base_pitcher_splits_promotion_cursor' AND batch_id=?", stageBatch.batch_id);
}

async function validateCertifiedStageForPromotion(env, batchId, expectedUniverse) {
  const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const outcomeRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=?", batchId);
  const sourceError = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=? AND terminal_category='SOURCE_ERROR'", batchId);
  const repair = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=? AND terminal_category='REPAIR_REQUIRED'", batchId);
  const unclear = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=? AND terminal_category='UNCLEAR'", batchId);
  const dupStage = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM pitcher_split_stage WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1)`, batchId);
  const invalidSplit = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=? AND split_code NOT IN ('vs_left','vs_right')", batchId);
  const missingLineage = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=? AND (player_id IS NULL OR season IS NULL OR group_type IS NULL OR split_code IS NULL OR source_key IS NULL OR source_endpoint IS NULL OR source_season IS NULL OR ingestion_mode IS NULL OR batch_id IS NULL OR run_id IS NULL OR raw_json IS NULL OR source_snapshot_date IS NULL OR stat_shape_json IS NULL)`, batchId);
  const splitCoverage = await all(env.STATS_PITCHER_DB, "SELECT split_code, COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players FROM pitcher_split_stage WHERE batch_id=? GROUP BY split_code ORDER BY split_code", batchId);
  const checks = {
    certified_stage_batch_id: batchId,
    expected_pitcher_universe_count: asInt(expectedUniverse, 0),
    stage_rows: asInt(stageRows && stageRows.c, 0),
    outcome_rows: asInt(outcomeRows && outcomeRows.c, 0),
    source_error_count: asInt(sourceError && sourceError.c, 0),
    repair_required_count: asInt(repair && repair.c, 0),
    unclear_count: asInt(unclear && unclear.c, 0),
    duplicate_stage_keys: asInt(dupStage && dupStage.c, 0),
    invalid_split_code_count: asInt(invalidSplit && invalidSplit.c, 0),
    missing_lineage_count: asInt(missingLineage && missingLineage.c, 0),
    split_coverage: splitCoverage,
    zero_mlb_calls_required: true,
    no_remine_required: true,
    no_delta_update_execution: true
  };
  checks.pass = checks.stage_rows > 0 && checks.outcome_rows === checks.expected_pitcher_universe_count && checks.source_error_count === 0 && checks.repair_required_count === 0 && checks.unclear_count === 0 && checks.duplicate_stage_keys === 0 && checks.invalid_split_code_count === 0 && checks.missing_lineage_count === 0;
  return checks;
}

async function promoteOneStageRow(env, r) {
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_splits (
    player_id, season, split_key, split_description, innings_pitched, outs_recorded, batters_faced, hits_allowed, earned_runs, walks_allowed, strikeouts, era, whip, raw_json, source_key, source_confidence, updated_at,
    group_type, split_code, split_source_code, data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id, certification_status, certification_grade, certified_at, promoted_at, created_at, source_snapshot_date, stat_shape_json,
    innings_pitched_decimal, runs_allowed, home_runs_allowed, pitches, strikes, balls, avg_against, obp_against, slg_against, ops_against
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,COALESCE(?,CURRENT_TIMESTAMP),?,?,?,?,?,?,?,?,?,?,?,?)`,
    r.player_id, r.season, r.split_code, r.split_description, r.innings_pitched, r.outs_recorded, r.batters_faced, r.hits_allowed, r.earned_runs, r.walks_allowed, r.strikeouts, r.era, r.whip, r.raw_json, r.source_key, 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_PROMOTED_FROM_CERTIFIED_STAGE',
    r.group_type, r.split_code, r.split_source_code, r.data_feed_key, r.source_endpoint, r.source_season, r.source_game_type, 'base_backfill_promoted_from_certified_stage', r.batch_id, r.run_id, 'BASE_PITCHER_SPLITS_BASE_BACKFILL_CERTIFIED_PROMOTED', 'BASE_PASS', r.created_at, r.source_snapshot_date, r.stat_shape_json,
    r.innings_pitched_decimal, r.runs_allowed, r.home_runs_allowed, r.pitches, r.strikes, r.balls, r.avg_against, r.obp_against, r.slg_against, r.ops_against);
}

async function finalizePromotion(env, stageBatch, runId, checks) {
  const batchId = stageBatch.batch_id;
  const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=?", batchId);
  const dupLive = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM pitcher_splits WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1)`, batchId);
  const invalidLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=? AND split_code NOT IN ('vs_left','vs_right')", batchId);
  const stageRemainingBeforeClean = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const finalChecks = { ...checks,
    live_rows_for_batch: asInt(liveRows && liveRows.c, 0),
    duplicate_live_keys: asInt(dupLive && dupLive.c, 0),
    invalid_live_split_code_count: asInt(invalidLive && invalidLive.c, 0),
    stage_rows_before_clean: asInt(stageRemainingBeforeClean && stageRemainingBeforeClean.c, 0),
    live_verification_pass: asInt(liveRows && liveRows.c, 0) === checks.stage_rows && asInt(dupLive && dupLive.c, 0) === 0 && asInt(invalidLive && invalidLive.c, 0) === 0
  };
  if (!finalChecks.live_verification_pass) {
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status='PROMOTION_REVIEW_REQUIRED_LIVE_VERIFY_FAILED', rows_promoted=?, certification_status='BASE_PITCHER_SPLITS_PROMOTION_REVIEW_REQUIRED_LIVE_VERIFY_FAILED', certification_grade='PROMOTION_REVIEW', certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, finalChecks.live_rows_for_batch, safeJson(finalChecks), batchId);
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status='PROMOTION_REVIEW_REQUIRED_LIVE_VERIFY_FAILED', cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_promotion_cursor' AND batch_id=?`, safeJson(finalChecks), batchId);
    return { pass: false, certStatus: 'BASE_PITCHER_SPLITS_PROMOTION_REVIEW_REQUIRED_LIVE_VERIFY_FAILED', grade: 'PROMOTION_REVIEW', checks: finalChecks };
  }
  await run(env.STATS_PITCHER_DB, "DELETE FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const stageRemainingAfterClean = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  finalChecks.stage_rows_after_clean = asInt(stageRemainingAfterClean && stageRemainingAfterClean.c, 0);
  finalChecks.stage_cleanup_pass = finalChecks.stage_rows_after_clean === 0;
  const pass = finalChecks.live_verification_pass && finalChecks.stage_cleanup_pass;
  const certStatus = pass ? 'BASE_PITCHER_SPLITS_BASE_BACKFILL_CERTIFIED_PROMOTED_CLEANED' : 'BASE_PITCHER_SPLITS_PROMOTED_CLEANUP_REVIEW_REQUIRED';
  const grade = pass ? 'BASE_PASS' : 'PROMOTION_REVIEW';
  const status = pass ? 'COMPLETED_PROMOTED_CLEANED' : 'PROMOTED_CLEANUP_REVIEW_REQUIRED';
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, rows_promoted=?, certification_status=?, certification_grade=?, certification_json=?, promoted_at=CURRENT_TIMESTAMP, cleaned_at=CURRENT_TIMESTAMP, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, status, finalChecks.live_rows_for_batch, certStatus, grade, safeJson(finalChecks), batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status=?, current_player_offset=?, players_processed=?, requests_done=0, next_run_after=NULL, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_promotion_cursor' AND batch_id=?`, status, finalChecks.stage_rows, finalChecks.stage_rows, safeJson({ finalization_only: true, checks: finalChecks }), batchId);
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_promotion_cert'), batchId, runId, PROMOTION_MODE, certStatus, grade, safeJson(finalChecks), finalChecks.stage_rows_before_clean, finalChecks.live_rows_for_batch, finalChecks.duplicate_live_keys, checks.true_no_data_count || 172, 0, stageBatch.source_snapshot_date || todayUtc());
  return { pass, certStatus, grade, checks: finalChecks };
}

async function runPromotion(env, input) {
  if (!env.STATS_PITCHER_DB) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'blocked_missing_stats_pitcher_db_binding', certification: 'BASE_PITCHER_SPLITS_REQUIRED_DB_BINDING_MISSING', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  }
  const schema = await ensureSchema(env);
  const stageBatch = await findCertifiedStageBatch(env);
  if (!stageBatch) {
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'PROMOTION_BLOCKED_NO_CERTIFIED_STAGE_BATCH', certification: 'BASE_PITCHER_SPLITS_PROMOTION_BLOCKED_NO_CERTIFIED_STAGE_BATCH', certification_grade: 'BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, schema, timestamp_utc: nowUtc() };
  }
  const runId = input.run_id || rid('run_pitcher_splits_promote');
  const checks = await validateCertifiedStageForPromotion(env, stageBatch.batch_id, asInt(stageBatch.expected_pitcher_universe_count, 0));
  if (!checks.pass) {
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status='PROMOTION_BLOCKED_STAGE_CERTIFICATION_CHECK_FAILED', certification_status='BASE_PITCHER_SPLITS_PROMOTION_BLOCKED_STAGE_CHECK_FAILED', certification_grade='BLOCKED', certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, safeJson(checks), stageBatch.batch_id);
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'PROMOTION_BLOCKED_STAGE_CERTIFICATION_CHECK_FAILED', certification: 'BASE_PITCHER_SPLITS_PROMOTION_BLOCKED_STAGE_CHECK_FAILED', certification_grade: 'BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, promotion_checks: checks, timestamp_utc: nowUtc() };
  }
  const inputJson = input.input_json || input || {};
  const chunkSize = capChunk(inputJson.promotion_chunk_size || inputJson.chunk_size || DEFAULT_CHUNK_SIZE);
  const cursor = await getPromotionCursor(env, stageBatch, runId);
  const offset = Math.max(0, asInt(cursor.current_player_offset, 0));
  const stageRows = await all(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_stage WHERE batch_id=? ORDER BY player_id, season, group_type, split_code LIMIT ? OFFSET ?`, stageBatch.batch_id, chunkSize, offset);
  if (!stageRows.length) {
    const final = await finalizePromotion(env, stageBatch, runId, checks);
    return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: final.pass ? 'COMPLETED_PROMOTED_CLEANED' : 'PROMOTION_REVIEW_REQUIRED', certification: final.certStatus, certification_grade: final.grade, rows_read: 0, rows_written: 1, rows_staged: final.checks.stage_rows_before_clean || final.checks.stage_rows, rows_promoted: final.checks.live_rows_for_batch || 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, finalization_only: true, promotion: { batch_id: stageBatch.batch_id, run_id: runId, checks: final.checks }, boundaries: baseIdentity(env).hard_blocks, timestamp_utc: nowUtc() };
  }
  let promotedThisTick = 0;
  for (const row of stageRows) { await promoteOneStageRow(env, row); promotedThisTick += 1; }
  const newOffset = offset + promotedThisTick;
  const liveCount = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=?", stageBatch.batch_id);
  const completed = newOffset >= checks.stage_rows;
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, completed ? 'FINALIZATION_ONLY' : 'PARTIAL_CONTINUE', asInt(liveCount && liveCount.c, 0), stageBatch.batch_id);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status=?, current_player_offset=?, players_total=?, players_processed=?, requests_done=0, next_run_after=CURRENT_TIMESTAMP, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_promotion_cursor' AND batch_id=?`, completed ? 'FINALIZATION_ONLY' : 'PARTIAL_CONTINUE', newOffset, checks.stage_rows, newOffset, safeJson({ promotion_chunk_size: chunkSize, promoted_this_tick: promotedThisTick, finalization_only_ready: completed, zero_mlb_calls: true }), stageBatch.batch_id);
  return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'partial_continue_base_pitcher_splits', certification: completed ? 'BASE_PITCHER_SPLITS_PROMOTION_FINALIZATION_REQUIRED_ZERO_MLB_CALLS' : 'BASE_PITCHER_SPLITS_PROMOTION_PARTIAL_CONTINUE_ZERO_MLB_CALLS', certification_grade: completed ? 'FINALIZATION_ONLY_READY' : 'PARTIAL_CONTINUE', rows_read: promotedThisTick, rows_written: promotedThisTick, rows_staged: checks.stage_rows, rows_promoted: asInt(liveCount && liveCount.c, 0), external_calls_performed: 0, continuation_required: true, orchestrator_should_self_continue: true, promotion: { batch_id: stageBatch.batch_id, run_id: runId, current_offset: newOffset, stage_rows: checks.stage_rows, promoted_this_tick: promotedThisTick, live_rows_for_batch: asInt(liveCount && liveCount.c, 0), zero_mlb_calls: true, no_remine: true, no_delta: true }, boundaries: baseIdentity(env).hard_blocks, timestamp_utc: nowUtc() };
}


async function latestLockedBaseBatch(env) {
  return await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_batches
    WHERE mode='base_backfill_stage_only_full_universe'
      AND status='COMPLETED_PROMOTED_CLEANED'
      AND certification_status='BASE_PITCHER_SPLITS_BASE_BACKFILL_CERTIFIED_PROMOTED_CLEANED'
      AND certification_grade='BASE_PASS'
      AND COALESCE(rows_promoted,0) > 0
    ORDER BY datetime(promoted_at) DESC, datetime(updated_at) DESC, datetime(created_at) DESC
    LIMIT 1`);
}

async function runDeltaGate(env, input) {
  if (!env.STATS_PITCHER_DB) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'blocked_missing_stats_pitcher_db_binding', certification: 'DELTA_PITCHER_SPLITS_REQUIRED_DB_BINDING_MISSING', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  }
  const schema = await ensureSchema(env);
  const runId = input.run_id || rid('run_delta_pitcher_splits_gate');
  const batch = await latestLockedBaseBatch(env);
  if (!batch) {
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_PITCHER_SPLITS_BLOCKED_NO_LOCKED_BASE', certification: 'DELTA_PITCHER_SPLITS_BLOCKED_NO_LOCKED_BASE', certification_grade: 'BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema, timestamp_utc: nowUtc() };
  }
  const batchId = batch.batch_id;
  const live = await first(env.STATS_PITCHER_DB, `SELECT
      COUNT(*) AS live_rows,
      COUNT(DISTINCT player_id) AS live_players,
      COUNT(DISTINCT player_id || '|' || season || '|' || group_type || '|' || split_code) AS distinct_live_keys,
      SUM(CASE WHEN player_id IS NULL THEN 1 ELSE 0 END) AS missing_player_id,
      SUM(CASE WHEN season IS NULL THEN 1 ELSE 0 END) AS missing_season,
      SUM(CASE WHEN group_type IS NULL OR group_type <> 'pitching' THEN 1 ELSE 0 END) AS bad_group_type,
      SUM(CASE WHEN split_code IS NULL THEN 1 ELSE 0 END) AS missing_split_code,
      SUM(CASE WHEN split_code NOT IN ('vs_left','vs_right') THEN 1 ELSE 0 END) AS invalid_split_code,
      SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS missing_raw_json,
      SUM(CASE WHEN source_snapshot_date IS NULL THEN 1 ELSE 0 END) AS missing_source_snapshot_date,
      MIN(source_snapshot_date) AS min_source_snapshot_date,
      MAX(source_snapshot_date) AS max_source_snapshot_date
    FROM pitcher_splits WHERE batch_id=?`, batchId);
  const splits = await all(env.STATS_PITCHER_DB, `SELECT split_code, COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players FROM pitcher_splits WHERE batch_id=? GROUP BY split_code ORDER BY split_code`, batchId);
  const oneSided = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id FROM pitcher_splits WHERE batch_id=? GROUP BY player_id HAVING COUNT(DISTINCT split_code) < 2)`, batchId);
  const liveDup = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id, season, group_type, split_code, COUNT(*) AS d FROM pitcher_splits WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING COUNT(*) > 1)`, batchId);
  const stageRemaining = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?`, batchId);
  const outcome = await first(env.STATS_PITCHER_DB, `SELECT SUM(CASE WHEN terminal_category='STAGE_ROWS_WRITTEN' THEN 1 ELSE 0 END) AS success_outcome_rows, SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END) AS true_no_data_rows, SUM(CASE WHEN terminal_category='STAGE_ROWS_WRITTEN' THEN COALESCE(rows_staged,0) ELSE 0 END) AS outcome_rows_staged_sum FROM pitcher_split_outcomes WHERE batch_id=?`, batchId);
  const expectedRows = asInt(batch.rows_promoted, 0);
  const today = todayUtc();
  const checks = {
    locked_base_batch_id: batchId,
    locked_base_status: batch.status,
    locked_base_certification: batch.certification_status,
    expected_pitcher_universe_count: asInt(batch.expected_pitcher_universe_count, 0),
    source_success_count: asInt(batch.source_success_count, 0),
    source_no_data_count: asInt(batch.source_no_data_count, 0),
    source_error_count: asInt(batch.source_error_count, 0),
    rows_promoted_batch_truth: expectedRows,
    live_rows: asInt(live && live.live_rows, 0),
    live_players: asInt(live && live.live_players, 0),
    distinct_live_keys: asInt(live && live.distinct_live_keys, 0),
    duplicate_live_keys: asInt(liveDup && liveDup.c, 0),
    invalid_split_code: asInt(live && live.invalid_split_code, 0),
    missing_raw_json: asInt(live && live.missing_raw_json, 0),
    missing_source_snapshot_date: asInt(live && live.missing_source_snapshot_date, 0),
    min_source_snapshot_date: live && live.min_source_snapshot_date,
    max_source_snapshot_date: live && live.max_source_snapshot_date,
    source_snapshot_date_today_utc: today,
    source_snapshot_is_current_utc: String(live && live.max_source_snapshot_date || '') === today,
    split_coverage: splits,
    one_sided_successful_players: asInt(oneSided && oneSided.c, 0),
    stage_rows_remaining: asInt(stageRemaining && stageRemaining.c, 0),
    retained_stage_available_for_restore: asInt(stageRemaining && stageRemaining.c, 0) > 0,
    outcome_success_rows_player_level: asInt(outcome && outcome.success_outcome_rows, 0),
    outcome_true_no_data_rows_player_level: asInt(outcome && outcome.true_no_data_rows, 0),
    outcome_rows_staged_sum_non_authoritative: asInt(outcome && outcome.outcome_rows_staged_sum, 0),
    outcome_rows_staged_counter_warning: asInt(outcome && outcome.outcome_rows_staged_sum, 0) !== expectedRows,
    does_not_require_balanced_splits: true,
    does_not_use_outcome_rows_staged_for_physical_truth: true,
    zero_mlb_calls: true,
    no_live_mutation: true,
    no_delta_execution_beyond_gate: true
  };
  const baseOk = checks.live_rows === expectedRows && checks.distinct_live_keys === checks.live_rows && checks.duplicate_live_keys === 0 && checks.invalid_split_code === 0 && checks.missing_raw_json === 0 && checks.missing_source_snapshot_date === 0 && checks.source_error_count === 0;
  const current = checks.source_snapshot_is_current_utc;
  const status = baseOk && current ? 'DELTA_PITCHER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT' : (baseOk ? 'DELTA_PITCHER_SPLITS_BLOCKED_STALE_SOURCE_SNAPSHOT_REVIEW_REQUIRED' : 'DELTA_PITCHER_SPLITS_BLOCKED_BASE_INTEGRITY_REVIEW_REQUIRED');
  const cert = baseOk && current ? 'DELTA_PITCHER_SPLITS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT' : (baseOk ? 'DELTA_PITCHER_SPLITS_BLOCKED_STALE_SOURCE_SNAPSHOT_REVIEW_REQUIRED' : 'DELTA_PITCHER_SPLITS_BLOCKED_BASE_INTEGRITY_REVIEW_REQUIRED');
  const grade = baseOk && current ? 'DELTA_NOOP_PASS' : 'DELTA_REVIEW';
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, 'delta_update_noop_restore_gate', status, SOURCE_SEASON, checks.max_source_snapshot_date || today, null, checks.live_players, checks.expected_pitcher_universe_count, checks.expected_pitcher_universe_count, 0, null, baseOk ? null : 'base_integrity_review_required', safeJson(checks));
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, rid('pitcher_splits_delta_cert'), batchId, runId, 'delta_update_noop_restore_gate', cert, grade, safeJson(checks), 0, checks.live_rows, checks.duplicate_live_keys, checks.source_no_data_count, checks.source_error_count, checks.max_source_snapshot_date || today);
  return { ok: true, data_ok: baseOk && current, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status, certification: cert, certification_grade: grade, rows_read: checks.live_rows, rows_written: 2, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, delta_gate: checks, boundaries: { no_hitter_splits_mutation: true, no_hitter_game_log_mutation: true, no_pitcher_game_log_mutation: true, no_prizepicks_mutation: true, no_sleeper_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true, no_old_production_touch: true }, timestamp_utc: nowUtc() };
}



function livePayloadFromRow(r) {
  return {
    player_id: r.player_id, player_name: r.player_name || null, season: r.season, group_type: r.group_type || GROUP_TYPE,
    split_key: r.split_key || r.split_code, split_code: r.split_code || r.split_key, split_source_code: r.split_source_code || null,
    split_description: r.split_description || null, innings_pitched: r.innings_pitched || null, innings_pitched_decimal: r.innings_pitched_decimal ?? null,
    outs_recorded: r.outs_recorded ?? null, batters_faced: r.batters_faced ?? null, hits_allowed: r.hits_allowed ?? null,
    runs_allowed: r.runs_allowed ?? null, earned_runs: r.earned_runs ?? null, home_runs_allowed: r.home_runs_allowed ?? null,
    strikeouts: r.strikeouts ?? null, walks_allowed: r.walks_allowed ?? null, pitches: r.pitches ?? null, strikes: r.strikes ?? null, balls: r.balls ?? null,
    avg_against: r.avg_against || null, obp_against: r.obp_against || null, slg_against: r.slg_against || null, ops_against: r.ops_against || null,
    era: r.era || null, whip: r.whip || null, raw_json: r.raw_json || null, source_key: r.source_key || SOURCE_KEY,
    source_confidence: r.source_confidence || 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_REPAIR_PAYLOAD',
    data_feed_key: r.data_feed_key || DATA_FEED_KEY, source_endpoint: r.source_endpoint || endpointFor({ MLB_API_BASE_URL: 'https://statsapi.mlb.com/api/v1' }, r.player_id, SOURCE_SEASON),
    source_season: r.source_season || SOURCE_SEASON, source_game_type: r.source_game_type || null,
    ingestion_mode: r.ingestion_mode || 'delta_repair_payload_from_locked_live', batch_id: r.batch_id,
    run_id: r.run_id || null, certification_status: r.certification_status || null, certification_grade: r.certification_grade || null,
    certified_at: r.certified_at || null, promoted_at: r.promoted_at || null, created_at: r.created_at || null,
    source_snapshot_date: r.source_snapshot_date || todayUtc(), stat_shape_json: r.stat_shape_json || null
  };
}

async function upsertPitcherSplitLiveRow(env, row, reason) {
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_splits (
    player_id, season, split_key, split_description, innings_pitched, outs_recorded, batters_faced, hits_allowed, earned_runs, walks_allowed, strikeouts, era, whip, raw_json, source_key, source_confidence, updated_at,
    group_type, split_code, split_source_code, data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id, certification_status, certification_grade, certified_at, promoted_at, created_at, source_snapshot_date, stat_shape_json,
    innings_pitched_decimal, runs_allowed, home_runs_allowed, pitches, strikes, balls, avg_against, obp_against, slg_against, ops_against
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,COALESCE(?,CURRENT_TIMESTAMP),?,?,?,?,?,?,?,?,?,?,?,?)`,
    row.player_id, row.season, row.split_code || row.split_key, row.split_description, row.innings_pitched, row.outs_recorded, row.batters_faced, row.hits_allowed, row.earned_runs, row.walks_allowed, row.strikeouts, row.era, row.whip, row.raw_json, row.source_key || SOURCE_KEY, reason || row.source_confidence || 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_REPAIRED',
    row.group_type || GROUP_TYPE, row.split_code || row.split_key, row.split_source_code, row.data_feed_key || DATA_FEED_KEY, row.source_endpoint, row.source_season || SOURCE_SEASON, row.source_game_type || null, row.ingestion_mode || 'delta_repair_upsert', row.batch_id, row.run_id, row.certification_status || 'DELTA_PITCHER_SPLITS_REPAIR_PROMOTED', row.certification_grade || 'DELTA_REPAIR_PASS', row.created_at, row.source_snapshot_date || todayUtc(), row.stat_shape_json,
    row.innings_pitched_decimal, row.runs_allowed, row.home_runs_allowed, row.pitches, row.strikes, row.balls, row.avg_against, row.obp_against, row.slg_against, row.ops_against);
}

async function currentLiveIntegrity(env, batchId) {
  const live = await first(env.STATS_PITCHER_DB, `SELECT
      COUNT(*) AS live_rows,
      COUNT(DISTINCT player_id || '|' || season || '|' || group_type || '|' || split_code) AS distinct_live_keys,
      SUM(CASE WHEN split_code NOT IN ('vs_left','vs_right') THEN 1 ELSE 0 END) AS invalid_split_code,
      SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS missing_raw_json,
      SUM(CASE WHEN source_snapshot_date IS NULL THEN 1 ELSE 0 END) AS missing_source_snapshot_date,
      MIN(source_snapshot_date) AS min_source_snapshot_date,
      MAX(source_snapshot_date) AS max_source_snapshot_date
    FROM pitcher_splits WHERE batch_id=?`, batchId);
  const dup = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM pitcher_splits WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1)`, batchId);
  return {
    live_rows: asInt(live && live.live_rows, 0), distinct_live_keys: asInt(live && live.distinct_live_keys, 0),
    duplicate_live_keys: asInt(dup && dup.c, 0), invalid_split_code: asInt(live && live.invalid_split_code, 0),
    missing_raw_json: asInt(live && live.missing_raw_json, 0), missing_source_snapshot_date: asInt(live && live.missing_source_snapshot_date, 0),
    min_source_snapshot_date: live && live.min_source_snapshot_date, max_source_snapshot_date: live && live.max_source_snapshot_date
  };
}

async function getRepairCursorKey(env) {
  const c = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_split_cursor WHERE cursor_key='base_pitcher_splits_delta_repair_cursor' ORDER BY datetime(updated_at) DESC LIMIT 1");
  if (!c) return null;
  try { return JSON.parse(c.cursor_json || '{}'); } catch (_) { return null; }
}

async function latestRepairRegistry(env) {
  return await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_split_repair_registry WHERE registry_key='pitcher_splits_delta_repair_anchor_1' ORDER BY datetime(updated_at) DESC LIMIT 1");
}

async function createRepairAnchorFromLive(env, baseBatch, input, liveChecks) {
  const runId = input.run_id || rid('run_delta_pitcher_splits_repair_anchor');
  const row = await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_splits WHERE batch_id=? ORDER BY player_id, season, group_type, split_code LIMIT 1`, baseBatch.batch_id);
  if (!row) {
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_PITCHER_SPLITS_REPAIR_ANCHOR_BLOCKED_NO_LIVE_ROW', certification: 'DELTA_PITCHER_SPLITS_REPAIR_ANCHOR_BLOCKED_NO_LIVE_ROW', certification_grade: 'BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false };
  }
  const payload = livePayloadFromRow(row);
  const registryKey = 'pitcher_splits_delta_repair_anchor_1';
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_repair_registry (registry_key,target_batch_id,source_batch_id,player_id,player_name,season,group_type,split_code,split_source_code,source_endpoint,source_snapshot_date,target_row_json,status,created_by_version,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, registryKey, baseBatch.batch_id, baseBatch.batch_id, payload.player_id, payload.player_name, payload.season, payload.group_type, payload.split_code, payload.split_source_code, payload.source_endpoint, payload.source_snapshot_date, safeJson(payload), 'REPAIR_ANCHOR_RETAINED_FROM_LOCKED_LIVE', VERSION);
  const checks = { locked_base_batch_id: baseBatch.batch_id, repair_registry_key: registryKey, anchor_player_id: payload.player_id, anchor_split_code: payload.split_code, live_rows: liveChecks.live_rows, distinct_live_keys: liveChecks.distinct_live_keys, no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, repair_anchor_created: true, next_test: 'delete this exact live key, then run DELTA > Pitcher Splits to restore from retained repair registry' };
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_delta_repair_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_PITCHER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', SOURCE_SEASON, payload.source_snapshot_date || todayUtc(), payload.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 0, null, null, safeJson({ ...checks, expected_key: { player_id: payload.player_id, season: payload.season, group_type: payload.group_type, split_code: payload.split_code, source_endpoint: payload.source_endpoint, target_batch_id: baseBatch.batch_id } }));
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_repair_anchor_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_PITCHER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', 'DELTA_ANCHOR_PASS', safeJson(checks), 0, liveChecks.live_rows, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count, 0), 0, payload.source_snapshot_date || todayUtc());
  return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_PITCHER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', certification: 'DELTA_PITCHER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', certification_grade: 'DELTA_ANCHOR_PASS', rows_read: liveChecks.live_rows, rows_written: 2, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, repair_anchor: checks, timestamp_utc: nowUtc() };
}

async function rowExistsLive(env, key) {
  const r = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=? AND player_id=? AND season=? AND group_type=? AND split_code=?`, key.target_batch_id, key.player_id, key.season, key.group_type || GROUP_TYPE, key.split_code);
  return asInt(r && r.c, 0) > 0;
}

function registryToKey(reg, cursorKey) {
  if (reg) return { target_batch_id: reg.target_batch_id, player_id: reg.player_id, season: reg.season, group_type: reg.group_type, split_code: reg.split_code, source_endpoint: reg.source_endpoint, source_snapshot_date: reg.source_snapshot_date };
  const k = cursorKey && cursorKey.expected_key ? cursorKey.expected_key : null;
  return k ? { target_batch_id: k.target_batch_id, player_id: k.player_id, season: k.season, group_type: k.group_type || GROUP_TYPE, split_code: k.split_code, source_endpoint: k.source_endpoint, source_snapshot_date: k.source_snapshot_date || todayUtc() } : null;
}

async function restoreFromRepairRegistry(env, baseBatch, reg, input) {
  const runId = input.run_id || rid('run_delta_pitcher_splits_restore_registry');
  const payload = JSON.parse(reg.target_row_json || '{}');
  payload.batch_id = reg.target_batch_id;
  payload.ingestion_mode = 'delta_repair_restored_from_retained_registry';
  payload.certification_status = 'DELTA_PITCHER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE';
  payload.certification_grade = 'DELTA_REPAIR_PASS';
  await upsertPitcherSplitLiveRow(env, payload, 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_RESTORED_FROM_RETAINED_REPAIR_REGISTRY');
  const liveChecks = await currentLiveIntegrity(env, baseBatch.batch_id);
  const checks = { locked_base_batch_id: baseBatch.batch_id, registry_key: reg.registry_key, restored_rows: 1, restored_player_id: reg.player_id, restored_split_code: reg.split_code, live_rows_after: liveChecks.live_rows, distinct_live_keys_after: liveChecks.distinct_live_keys, duplicate_live_keys: liveChecks.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_new_batch: true, no_stage_writes: true, restored_from_retained_stage_before_queue: true };
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', SOURCE_SEASON, reg.source_snapshot_date || todayUtc(), reg.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 0, null, null, safeJson(checks));
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_restore_registry_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'PITCHER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', 'DELTA_REPAIR_PASS', safeJson(checks), 0, liveChecks.live_rows, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, reg.source_snapshot_date || todayUtc());
  return { ok: true, data_ok: liveChecks.duplicate_live_keys === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', certification: 'PITCHER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', certification_grade: 'DELTA_REPAIR_PASS', restored_rows: 1, queued: false, request_id_created: null, no_mlb_calls: true, no_stage_writes: true, no_full_sweep: true, no_new_batch: true, rows_read: 1, rows_written: 1, rows_promoted: 1, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, delta_restore_gate: checks, timestamp_utc: nowUtc() };
}

async function scopedRemineMissingKey(env, baseBatch, key, input) {
  const runId = input.run_id || rid('run_delta_pitcher_splits_scoped_repair');
  const endpoint = key.source_endpoint || endpointFor(env, key.player_id, SOURCE_SEASON);
  const headers = { accept: 'application/json' };
  if (env.MLB_API_USER_AGENT) headers['user-agent'] = env.MLB_API_USER_AGENT;
  const fetched = await fetchTextWithTimeout(endpoint, { headers }, FETCH_TIMEOUT_MS);
  let payload = null, sourceError = null;
  if (!fetched.ok) sourceError = fetched.error || 'fetch_failed';
  else { try { payload = JSON.parse(fetched.text || '{}'); } catch (err) { sourceError = 'non_json_response: ' + String(err && err.message ? err.message : err); } }
  const splits = payload ? extractSplits(payload) : [];
  const target = splits.find(sp => mapSplitCode(sp).split_code === key.split_code);
  if (sourceError || !target) {
    const checks = { locked_base_batch_id: baseBatch.batch_id, expected_key: key, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, external_calls_performed: 1, no_full_sweep: true, source_error: sourceError, target_split_returned: Boolean(target), repair_completed: false };
    await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_scoped_repair_review_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_REVIEW_REQUIRED', 'DELTA_REVIEW', safeJson(checks), 0, 0, 0, asInt(baseBatch.source_no_data_count,0), sourceError ? 1 : 0, key.source_snapshot_date || todayUtc());
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_REVIEW_REQUIRED', certification: 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_REVIEW_REQUIRED', certification_grade: 'DELTA_REVIEW', rows_read: 1, rows_written: 0, rows_promoted: 0, external_calls_performed: 1, continuation_required: false, orchestrator_should_self_continue: false, scoped_repair: checks };
  }
  const liveLikePlayer = { player_id: key.player_id, player_name: null, cursor_offset: 0 };
  const row = parseStageRow(target, liveLikePlayer, key.season || SOURCE_SEASON, key.target_batch_id, runId, endpoint, key.source_snapshot_date || todayUtc(), 'delta_scoped_repair_identifier_confirmed');
  row.ingestion_mode = 'delta_scoped_repair_promoted_from_source';
  row.certification_status = 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED';
  row.certification_grade = 'DELTA_REPAIR_PASS';
  await upsertPitcherSplitLiveRow(env, row, 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_SCOPED_REPAIR_REFETCH');
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_repair_registry (registry_key,target_batch_id,source_batch_id,player_id,player_name,season,group_type,split_code,split_source_code,source_endpoint,source_snapshot_date,target_row_json,status,created_by_version,updated_at)
    VALUES ('pitcher_splits_delta_repair_anchor_1',?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, key.target_batch_id, key.target_batch_id, row.player_id, row.player_name, row.season, row.group_type, row.split_code, row.split_source_code, row.source_endpoint, row.source_snapshot_date, safeJson(livePayloadFromRow(row)), 'REPAIR_ANCHOR_RETAINED_FROM_SCOPED_REPAIR', VERSION);
  const liveChecks = await currentLiveIntegrity(env, baseBatch.batch_id);
  const checks = { locked_base_batch_id: baseBatch.batch_id, missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, scoped_expected_split_key: key, external_calls_performed: 1, no_full_sweep: true, rows_staged: 1, rows_promoted: 1, live_rows_after: liveChecks.live_rows, duplicate_live_keys: liveChecks.duplicate_live_keys, stage_retained_for_repair: true };
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_COMPLETED', SOURCE_SEASON, key.source_snapshot_date || todayUtc(), key.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 1, null, null, safeJson(checks));
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_scoped_repair_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED', 'DELTA_REPAIR_PASS', safeJson(checks), 1, 1, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, key.source_snapshot_date || todayUtc());
  return { ok: true, data_ok: liveChecks.duplicate_live_keys === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_COMPLETED', certification: 'DELTA_PITCHER_SPLITS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED', certification_grade: 'DELTA_REPAIR_PASS', missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, external_calls_performed: 1, no_full_sweep: true, rows_read: 1, rows_written: 2, rows_staged: 1, rows_promoted: 1, continuation_required: false, orchestrator_should_self_continue: false, scoped_repair: checks, timestamp_utc: nowUtc() };
}

async function runDeltaNoopRestoreScopedRepairGate(env, input) {
  if (!env.STATS_PITCHER_DB) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'blocked_missing_stats_pitcher_db_binding', certification: 'DELTA_PITCHER_SPLITS_REQUIRED_DB_BINDING_MISSING', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 };
  }
  const schema = await ensureSchema(env);
  const baseBatch = await latestLockedBaseBatch(env);
  if (!baseBatch) return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'DELTA_PITCHER_SPLITS_BLOCKED_NO_LOCKED_BASE', certification: 'DELTA_PITCHER_SPLITS_BLOCKED_NO_LOCKED_BASE', certification_grade: 'BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema };
  const liveChecks = await currentLiveIntegrity(env, baseBatch.batch_id);
  const expectedRows = asInt(baseBatch.rows_promoted, 0);
  const baseComplete = liveChecks.live_rows === expectedRows && liveChecks.distinct_live_keys === liveChecks.live_rows && liveChecks.duplicate_live_keys === 0 && liveChecks.invalid_split_code === 0 && liveChecks.missing_raw_json === 0 && liveChecks.missing_source_snapshot_date === 0;
  const registry = await latestRepairRegistry(env);
  const cursorKey = await getRepairCursorKey(env);
  const expectedKey = registryToKey(registry, cursorKey);

  if (!expectedKey && baseComplete) return await createRepairAnchorFromLive(env, baseBatch, input, liveChecks);
  if (!expectedKey && !baseComplete) {
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'DELTA_PITCHER_SPLITS_BLOCKED_MISSING_EXPECTED_KEY_REGISTRY', certification: 'DELTA_PITCHER_SPLITS_BLOCKED_MISSING_EXPECTED_KEY_REGISTRY', certification_grade: 'BLOCKED', rows_read: liveChecks.live_rows, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, checks: { baseBatch: baseBatch.batch_id, liveChecks, expectedRows, reason: 'Live is incomplete and no retained expected key registry exists; full sweep is disabled by design.' } };
  }

  const exists = await rowExistsLive(env, expectedKey);
  if (exists) {
    const runId = input.run_id || rid('run_delta_pitcher_splits_noop_repair_gate');
    const checks = { locked_base_batch_id: baseBatch.batch_id, expected_key: expectedKey, live_rows: liveChecks.live_rows, expected_rows: expectedRows, distinct_live_keys: liveChecks.distinct_live_keys, duplicate_live_keys: liveChecks.duplicate_live_keys, source_snapshot_date_today_utc: todayUtc(), no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, retained_registry_available: Boolean(registry), does_not_require_balanced_splits: true, does_not_use_outcome_rows_staged_for_physical_truth: true };
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
      VALUES ('base_pitcher_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_PITCHER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT', SOURCE_SEASON, liveChecks.max_source_snapshot_date || todayUtc(), expectedKey.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 0, null, null, safeJson(checks));
    await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_delta_noop_repair_gate_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_PITCHER_SPLITS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT', 'DELTA_NOOP_PASS', safeJson(checks), 0, liveChecks.live_rows, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, liveChecks.max_source_snapshot_date || todayUtc());
    return { ok: true, data_ok: baseComplete, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_PITCHER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT', certification: 'DELTA_PITCHER_SPLITS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT', certification_grade: 'DELTA_NOOP_PASS', rows_read: liveChecks.live_rows, rows_written: 2, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, delta_gate: checks, timestamp_utc: nowUtc() };
  }

  if (registry && registry.target_row_json) return await restoreFromRepairRegistry(env, baseBatch, registry, input);
  return await scopedRemineMissingKey(env, baseBatch, expectedKey, input);
}


async function latestRetainedDeltaBatch(env) {
  return await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_batches
    WHERE mode=?
      AND status IN ('DELTA_COMPLETED_PROMOTED_RETAINED','DELTA_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE','DELTA_NOOP_RETAINED_STAGE_LIVE_PARITY')
      AND certification_status IN ('DELTA_PITCHER_SPLITS_REFRESH_CERTIFIED_PROMOTED_RETAINED','DELTA_PITCHER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE','DELTA_PITCHER_SPLITS_NOOP_RETAINED_STAGE_LIVE_PARITY')
      AND COALESCE(rows_staged,0) > 0
    ORDER BY datetime(COALESCE(promoted_at, finished_at, updated_at, created_at)) DESC
    LIMIT 1`, DELTA_REFRESH_MODE);
}

async function getActiveDeltaRefreshCursor(env) {
  return await first(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_cursor
    WHERE cursor_key='base_pitcher_splits_delta_retain_refresh_cursor'
      AND mode=?
      AND status IN ('DELTA_STAGE_RUNNING','PARTIAL_CONTINUE','FINALIZATION_ONLY','DELTA_PROMOTION_RUNNING','DELTA_PROMOTION_PARTIAL_CONTINUE','DELTA_PROMOTION_FINALIZATION_ONLY')
    ORDER BY datetime(updated_at) DESC
    LIMIT 1`, DELTA_REFRESH_MODE);
}

async function createDeltaRefreshBatch(env, input, universe) {
  const batchId = rid("pitcher_splits_delta_batch");
  const runId = input.run_id || rid("run_delta_pitcher_splits_refresh");
  const sourceSnapshotDate = todayUtc();
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_endpoint,source_season,source_game_type,source_snapshot_date,expected_pitcher_universe_count,sample_size,rows_promoted,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`, batchId, runId, WORKER_NAME, VERSION, DELTA_REFRESH_MODE, "DELTA_STAGE_RUNNING", DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_PATTERN, SOURCE_SEASON, null, sourceSnapshotDate, universe.expected_count || 0, universe.expected_count || 0, "DISABLED LEGACY v0.5.0 full delta refresh path; do not invoke by default");
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_delta_retain_refresh_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, DELTA_REFRESH_MODE, "DELTA_STAGE_RUNNING", SOURCE_SEASON, sourceSnapshotDate, null, 0, universe.expected_count || 0, 0, 0, null, null, safeJson({ created_by: VERSION, real_delta_refresh: true, retain_stage_after_promotion: true, no_live_mutation_until_certified: true }));
  return { batch_id: batchId, run_id: runId, source_snapshot_date: sourceSnapshotDate, current_player_offset: 0, players_processed: 0, requests_done: 0, status: 'DELTA_STAGE_RUNNING' };
}

async function loadOrCreateDeltaRefreshCursor(env, input, universe) {
  const active = await getActiveDeltaRefreshCursor(env);
  if (active) return {
    batch_id: active.batch_id,
    run_id: active.run_id,
    source_snapshot_date: active.source_snapshot_date || todayUtc(),
    current_player_offset: asInt(active.current_player_offset, 0),
    players_processed: asInt(active.players_processed, 0),
    requests_done: asInt(active.requests_done, 0),
    status: active.status,
    resumed: true
  };
  return { ...(await createDeltaRefreshBatch(env, input, universe)), resumed: false };
}

function makeDeltaStageRow(split, player, season, batchId, runId, endpoint, sourceSnapshotDate) {
  const row = parseStageRow(split, player, season, batchId, runId, endpoint, sourceSnapshotDate, 'delta_stage_identifier_confirmed');
  row.ingestion_mode = DELTA_REFRESH_MODE;
  row.certification_status = row.row_error ? 'delta_stage_identifier_unconfirmed' : 'delta_stage_identifier_confirmed';
  row.source_confidence = 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_DELTA_STAGE_RETAIN_REFRESH';
  row.row_status = 'delta_stage_retained_pending_certification';
  return row;
}

async function finalizeDeltaStage(env, batchId, runId, sourceSnapshotDate, universeCount) {
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
  const invalidSplit = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=? AND split_code NOT IN ('vs_left','vs_right')", batchId);
  const missingLineage = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=? AND (player_id IS NULL OR season IS NULL OR group_type IS NULL OR split_code IS NULL OR source_key IS NULL OR source_endpoint IS NULL OR source_season IS NULL OR ingestion_mode IS NULL OR batch_id IS NULL OR run_id IS NULL OR raw_json IS NULL OR source_snapshot_date IS NULL OR stat_shape_json IS NULL)`, batchId);
  const splitCoverage = await all(env.STATS_PITCHER_DB, "SELECT split_code, COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players FROM pitcher_split_stage WHERE batch_id=? GROUP BY split_code ORDER BY split_code", batchId);
  const oneSided = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id FROM pitcher_split_stage WHERE batch_id=? GROUP BY player_id HAVING COUNT(DISTINCT split_code) < 2)`, batchId);
  const checks = {
    delta_stage_retain_refresh: true,
    no_live_mutation_before_certification: true,
    retain_stage_after_promotion_required: true,
    expected_pitcher_universe_count: universeCount,
    outcome_rows_player_level: asInt(outcomeTotal && outcomeTotal.c, 0),
    stage_rows: asInt(stageTotal && stageTotal.c, 0),
    success_outcomes: successRows,
    true_no_data_count: trueNoData,
    source_error_count: sourceErrors,
    repair_required_count: repairRows,
    unclear_count: unclearRows,
    duplicate_stage_keys: asInt(dupStage && dupStage.c, 0),
    duplicate_outcome_rows: asInt(dupOutcome && dupOutcome.c, 0),
    invalid_split_code_count: asInt(invalidSplit && invalidSplit.c, 0),
    missing_lineage_count: asInt(missingLineage && missingLineage.c, 0),
    split_coverage: splitCoverage,
    one_sided_successful_players: asInt(oneSided && oneSided.c, 0),
    does_not_require_balanced_splits: true,
    does_not_use_outcome_rows_staged_for_physical_truth: true,
    source_snapshot_assessment: "SEASON_TO_DATE_SOURCE_SNAPSHOT_DELTA_STAGE_RETAIN_REFRESH_NO_CUTOFF_DATE_APPLIED"
  };
  checks.pass = checks.stage_rows > 0 && checks.outcome_rows_player_level === universeCount && checks.duplicate_stage_keys === 0 && checks.duplicate_outcome_rows === 0 && checks.source_error_count === 0 && checks.repair_required_count === 0 && checks.unclear_count === 0 && checks.invalid_split_code_count === 0 && checks.missing_lineage_count === 0;
  const certStatus = checks.pass ? 'DELTA_PITCHER_SPLITS_STAGE_CERTIFIED_PROMOTION_PENDING' : 'DELTA_PITCHER_SPLITS_STAGE_REVIEW_REQUIRED_NO_PROMOTION';
  const grade = checks.pass ? 'DELTA_STAGE_PASS' : 'DELTA_STAGE_REVIEW';
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, rows_staged=?, rows_promoted=0, duplicate_stage_keys=?, duplicate_outcome_rows=?, source_error_count=?, source_no_data_count=?, split_identifier_summary_json=?, true_no_data_assessment=?, source_snapshot_assessment=?, certification_status=?, certification_grade=?, certification_json=?, finished_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    checks.pass ? 'DELTA_STAGE_CERTIFIED_PROMOTION_PENDING' : 'DELTA_STAGE_REVIEW_REQUIRED_NO_PROMOTION', checks.stage_rows, checks.duplicate_stage_keys, checks.duplicate_outcome_rows, checks.source_error_count, checks.true_no_data_count, safeJson(splitCoverage), checks.true_no_data_count > 0 ? 'TRUE_NO_DATA_OBSERVED_ON_CLEAN_EMPTY_2XX_JSON' : 'TRUE_NO_DATA_NOT_OBSERVED_IN_DELTA_STAGE', checks.source_snapshot_assessment, certStatus, grade, safeJson(checks), batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status=?, current_player_offset=?, players_processed=?, next_run_after=CURRENT_TIMESTAMP, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_delta_retain_refresh_cursor' AND batch_id=?`, checks.pass ? 'DELTA_PROMOTION_RUNNING' : 'DELTA_STAGE_REVIEW_REQUIRED_NO_PROMOTION', checks.stage_rows, universeCount, safeJson({ finalization_only: true, checks, next_step: checks.pass ? 'promote_certified_delta_stage_and_retain_stage' : 'review_required_no_promotion' }), batchId);
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_delta_stage_cert'), batchId, runId, DELTA_REFRESH_MODE, certStatus, grade, safeJson(checks), checks.stage_rows, 0, checks.duplicate_stage_keys, checks.true_no_data_count, checks.source_error_count, sourceSnapshotDate);
  return { pass: checks.pass, certStatus, grade, checks };
}

async function promoteOneDeltaStageRow(env, r) {
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_splits (
    player_id, season, split_key, split_description, innings_pitched, outs_recorded, batters_faced, hits_allowed, earned_runs, walks_allowed, strikeouts, era, whip, raw_json, source_key, source_confidence, updated_at,
    group_type, split_code, split_source_code, data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id, certification_status, certification_grade, certified_at, promoted_at, created_at, source_snapshot_date, stat_shape_json,
    innings_pitched_decimal, runs_allowed, home_runs_allowed, pitches, strikes, balls, avg_against, obp_against, slg_against, ops_against
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,COALESCE(?,CURRENT_TIMESTAMP),?,?,?,?,?,?,?,?,?,?,?,?)`,
    r.player_id, r.season, r.split_code, r.split_description, r.innings_pitched, r.outs_recorded, r.batters_faced, r.hits_allowed, r.earned_runs, r.walks_allowed, r.strikeouts, r.era, r.whip, r.raw_json, r.source_key, 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_DELTA_PROMOTED_FROM_RETAINED_STAGE',
    r.group_type, r.split_code, r.split_source_code, r.data_feed_key, r.source_endpoint, r.source_season, r.source_game_type, 'delta_update_promoted_from_retained_stage', r.batch_id, r.run_id, 'DELTA_PITCHER_SPLITS_REFRESH_CERTIFIED_PROMOTED', 'DELTA_PASS', r.created_at, r.source_snapshot_date, r.stat_shape_json,
    r.innings_pitched_decimal, r.runs_allowed, r.home_runs_allowed, r.pitches, r.strikes, r.balls, r.avg_against, r.obp_against, r.slg_against, r.ops_against);
}

async function finalizeDeltaPromotion(env, batchId, runId, stageRowsExpected, noDataCount, sourceErrorCount) {
  const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=?", batchId);
  const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const dupLive = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM pitcher_splits WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1)`, batchId);
  const invalidLive = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=? AND split_code NOT IN ('vs_left','vs_right')", batchId);
  const splitCoverage = await all(env.STATS_PITCHER_DB, "SELECT split_code, COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players FROM pitcher_splits WHERE batch_id=? GROUP BY split_code ORDER BY split_code", batchId);
  const checks = {
    delta_completed_promoted_retained: true,
    retained_stage_available_for_restore: asInt(stageRows && stageRows.c, 0) === stageRowsExpected,
    stage_rows_retained: asInt(stageRows && stageRows.c, 0),
    live_rows_for_batch: asInt(liveRows && liveRows.c, 0),
    stage_rows_expected: stageRowsExpected,
    duplicate_live_keys: asInt(dupLive && dupLive.c, 0),
    invalid_live_split_code_count: asInt(invalidLive && invalidLive.c, 0),
    split_coverage: splitCoverage,
    live_verification_pass: asInt(liveRows && liveRows.c, 0) === stageRowsExpected && asInt(dupLive && dupLive.c, 0) === 0 && asInt(invalidLive && invalidLive.c, 0) === 0,
    stage_retention_pass: asInt(stageRows && stageRows.c, 0) === stageRowsExpected,
    does_not_require_balanced_splits: true,
    does_not_use_outcome_rows_staged_for_physical_truth: true
  };
  checks.pass = checks.live_verification_pass && checks.stage_retention_pass;
  const certStatus = checks.pass ? 'DELTA_PITCHER_SPLITS_REFRESH_CERTIFIED_PROMOTED_RETAINED' : 'DELTA_PITCHER_SPLITS_PROMOTION_REVIEW_REQUIRED';
  const grade = checks.pass ? 'DELTA_PASS' : 'DELTA_REVIEW';
  const status = checks.pass ? 'DELTA_COMPLETED_PROMOTED_RETAINED' : 'DELTA_PROMOTION_REVIEW_REQUIRED';
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, rows_promoted=?, certification_status=?, certification_grade=?, certification_json=?, promoted_at=CURRENT_TIMESTAMP, cleaned_at=NULL, finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, status, checks.live_rows_for_batch, certStatus, grade, safeJson(checks), batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status=?, current_player_offset=?, players_processed=?, requests_done=0, next_run_after=NULL, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_delta_retain_refresh_cursor' AND batch_id=?`, status, stageRowsExpected, stageRowsExpected, safeJson({ finalization_only: true, checks }), batchId);
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('pitcher_splits_delta_promote_cert'), batchId, runId, DELTA_REFRESH_MODE, certStatus, grade, safeJson(checks), checks.stage_rows_retained, checks.live_rows_for_batch, checks.duplicate_live_keys, noDataCount, sourceErrorCount, todayUtc());
  return { pass: checks.pass, certStatus, grade, status, checks };
}

async function restoreMissingFromRetainedDeltaStage(env, retainedBatch, input) {
  const batchId = retainedBatch.batch_id;
  const runId = input.run_id || rid('run_delta_pitcher_splits_restore');
  const chunkSize = capChunk((input.input_json && input.input_json.restore_chunk_size) || (input.input_json && input.input_json.chunk_size) || DEFAULT_CHUNK_SIZE);
  const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const missingBefore = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_split_stage s WHERE s.batch_id=? AND NOT EXISTS (SELECT 1 FROM pitcher_splits p WHERE p.batch_id=s.batch_id AND p.player_id=s.player_id AND p.season=s.season AND p.group_type=s.group_type AND p.split_code=s.split_code)`, batchId);
  const missing = asInt(missingBefore && missingBefore.c, 0);
  if (missing <= 0) {
    const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=?", batchId);
    const checks = { retained_delta_batch_id: batchId, stage_rows_retained: asInt(stageRows && stageRows.c, 0), live_rows: asInt(liveRows && liveRows.c, 0), missing_live_rows_from_retained_stage: 0, no_mlb_calls: true, no_new_batch: true, no_live_mutation: true, does_not_require_balanced_splits: true };
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
      VALUES ('base_pitcher_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, 'delta_update_retained_stage_restore_gate', 'DELTA_NOOP_RETAINED_STAGE_LIVE_PARITY', SOURCE_SEASON, retainedBatch.source_snapshot_date || todayUtc(), null, checks.live_rows, checks.stage_rows_retained, checks.stage_rows_retained, 0, null, null, safeJson(checks));
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_NOOP_RETAINED_STAGE_LIVE_PARITY', certification: 'DELTA_PITCHER_SPLITS_NOOP_RETAINED_STAGE_LIVE_PARITY', certification_grade: 'DELTA_NOOP_PASS', rows_read: checks.live_rows, rows_written: 1, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, delta_restore_gate: checks, timestamp_utc: nowUtc() };
  }
  const rows = await all(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_stage s WHERE s.batch_id=? AND NOT EXISTS (SELECT 1 FROM pitcher_splits p WHERE p.batch_id=s.batch_id AND p.player_id=s.player_id AND p.season=s.season AND p.group_type=s.group_type AND p.split_code=s.split_code) ORDER BY s.player_id, s.season, s.group_type, s.split_code LIMIT ?`, batchId, chunkSize);
  let restored = 0;
  for (const r of rows) { await promoteOneDeltaStageRow(env, r); restored += 1; }
  const missingAfter = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM pitcher_split_stage s WHERE s.batch_id=? AND NOT EXISTS (SELECT 1 FROM pitcher_splits p WHERE p.batch_id=s.batch_id AND p.player_id=s.player_id AND p.season=s.season AND p.group_type=s.group_type AND p.split_code=s.split_code)`, batchId);
  const stillMissing = asInt(missingAfter && missingAfter.c, 0);
  const final = stillMissing === 0;
  const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=?", batchId);
  const checks = { retained_delta_batch_id: batchId, stage_rows_retained: asInt(stageRows && stageRows.c, 0), live_rows: asInt(liveRows && liveRows.c, 0), missing_before: missing, restored_this_tick: restored, missing_after: stillMissing, no_mlb_calls: true, no_new_batch: true, restored_from_retained_stage_before_queue: true };
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, rows_promoted=?, certification_status=?, certification_grade=?, certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, final ? 'DELTA_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE' : 'PARTIAL_CONTINUE', checks.live_rows, final ? 'DELTA_PITCHER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE' : 'DELTA_PITCHER_SPLITS_RETAINED_STAGE_REPAIR_PARTIAL_CONTINUE', final ? 'DELTA_REPAIR_PASS' : 'PARTIAL_CONTINUE', safeJson(checks), batchId);
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, 'delta_update_retained_stage_restore_gate', final ? 'DELTA_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE' : 'PARTIAL_CONTINUE', SOURCE_SEASON, retainedBatch.source_snapshot_date || todayUtc(), null, checks.live_rows, checks.stage_rows_retained, checks.live_rows, 0, final ? null : 'CURRENT_TIMESTAMP', null, safeJson(checks));
  return { ok: true, data_ok: final, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: final ? 'DELTA_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE' : 'partial_continue_base_pitcher_splits', certification: final ? 'DELTA_PITCHER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE' : 'DELTA_PITCHER_SPLITS_RETAINED_STAGE_REPAIR_PARTIAL_CONTINUE', certification_grade: final ? 'DELTA_REPAIR_PASS' : 'PARTIAL_CONTINUE', rows_read: restored, rows_written: restored, rows_promoted: restored, external_calls_performed: 0, continuation_required: !final, orchestrator_should_self_continue: !final, delta_restore_gate: checks, timestamp_utc: nowUtc() };
}

async function runDeltaStageRetainRefresh(env, input) {
  if (!env.STATS_PITCHER_DB || !env.REF_DB) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'blocked_missing_required_db_binding', certification: 'DELTA_PITCHER_SPLITS_REQUIRED_DB_BINDING_MISSING', rows_read: 0, rows_written: 0, external_calls_performed: 0 };
  }
  const schema = await ensureSchema(env);
  const inputJson = input.input_json || input || {};
  const retained = await latestRetainedDeltaBatch(env);
  if (retained && String(retained.source_snapshot_date || '') === todayUtc()) {
    return await restoreMissingFromRetainedDeltaStage(env, retained, input);
  }

  const universe = await readPitcherUniverse(env);
  const cursor = await loadOrCreateDeltaRefreshCursor(env, input, universe);
  const batchId = cursor.batch_id;
  const runId = cursor.run_id;
  const sourceSnapshotDate = cursor.source_snapshot_date || todayUtc();
  const status = String(cursor.status || 'DELTA_STAGE_RUNNING');
  const chunkSize = capChunk(inputJson.chunk_size || inputJson.max_players_per_tick || DEFAULT_CHUNK_SIZE);

  if (universe.expected_count <= 0) {
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status='DELTA_BLOCKED_EMPTY_PITCHER_UNIVERSE', certification_status='DELTA_PITCHER_SPLITS_EMPTY_PITCHER_UNIVERSE_BLOCKED', certification_grade='BLOCKED', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, batchId);
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: 'DELTA_BLOCKED_EMPTY_PITCHER_UNIVERSE', certification: 'DELTA_PITCHER_SPLITS_EMPTY_PITCHER_UNIVERSE_BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false };
  }

  if (status === 'FINALIZATION_ONLY') {
    const final = await finalizeDeltaStage(env, batchId, runId, sourceSnapshotDate, universe.expected_count);
    return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: final.pass ? 'partial_continue_base_pitcher_splits' : 'DELTA_STAGE_REVIEW_REQUIRED_NO_PROMOTION', certification: final.certStatus, certification_grade: final.grade, rows_read: 0, rows_written: 1, rows_staged: final.checks.stage_rows, rows_promoted: 0, external_calls_performed: 0, continuation_required: final.pass, orchestrator_should_self_continue: final.pass, next_step: final.pass ? 'PROMOTE_CERTIFIED_DELTA_STAGE_AND_RETAIN_STAGE' : 'REVIEW_REQUIRED', delta_stage: { batch_id: batchId, run_id: runId, checks: final.checks }, timestamp_utc: nowUtc() };
  }

  if (status === 'DELTA_PROMOTION_RUNNING' || status === 'DELTA_PROMOTION_PARTIAL_CONTINUE' || status === 'DELTA_PROMOTION_FINALIZATION_ONLY') {
    const stageRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
    const batch = await first(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_split_batches WHERE batch_id=?", batchId);
    const offset = asInt(cursor.current_player_offset, 0);
    const total = asInt(stageRows && stageRows.c, 0);
    const rows = await all(env.STATS_PITCHER_DB, `SELECT * FROM pitcher_split_stage WHERE batch_id=? ORDER BY player_id, season, group_type, split_code LIMIT ? OFFSET ?`, batchId, chunkSize, offset);
    if (!rows.length) {
      const final = await finalizeDeltaPromotion(env, batchId, runId, total, asInt(batch && batch.source_no_data_count, 0), asInt(batch && batch.source_error_count, 0));
      return { ok: true, data_ok: final.pass, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: final.status, certification: final.certStatus, certification_grade: final.grade, rows_read: 0, rows_written: 1, rows_staged: total, rows_promoted: final.checks.live_rows_for_batch, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, finalization_only: true, delta_promotion: { batch_id: batchId, checks: final.checks }, timestamp_utc: nowUtc() };
    }
    let promoted = 0;
    for (const r of rows) { await promoteOneDeltaStageRow(env, r); promoted += 1; }
    const newOffset = offset + rows.length;
    const completed = newOffset >= total;
    const liveRows = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits WHERE batch_id=?", batchId);
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, rows_promoted=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, completed ? 'DELTA_PROMOTION_FINALIZATION_ONLY' : 'DELTA_PROMOTION_PARTIAL_CONTINUE', asInt(liveRows && liveRows.c, 0), batchId);
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status=?, current_player_offset=?, players_total=?, players_processed=?, requests_done=0, next_run_after=CURRENT_TIMESTAMP, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_delta_retain_refresh_cursor' AND batch_id=?`, completed ? 'DELTA_PROMOTION_FINALIZATION_ONLY' : 'DELTA_PROMOTION_PARTIAL_CONTINUE', newOffset, total, newOffset, safeJson({ promotion_chunk_size: chunkSize, promoted_this_tick: promoted, finalization_only_ready: completed, retain_stage_after_promotion: true, zero_mlb_calls_during_promotion: true }), batchId);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'partial_continue_base_pitcher_splits', certification: completed ? 'DELTA_PITCHER_SPLITS_PROMOTION_FINALIZATION_REQUIRED_RETAIN_STAGE' : 'DELTA_PITCHER_SPLITS_PROMOTION_PARTIAL_CONTINUE_RETAIN_STAGE', certification_grade: completed ? 'FINALIZATION_ONLY_READY' : 'PARTIAL_CONTINUE', rows_read: promoted, rows_written: promoted, rows_staged: total, rows_promoted: asInt(liveRows && liveRows.c, 0), external_calls_performed: 0, continuation_required: true, orchestrator_should_self_continue: true, delta_promotion: { batch_id: batchId, promoted_this_tick: promoted, current_offset: newOffset, stage_rows: total, live_rows_for_batch: asInt(liveRows && liveRows.c, 0), retain_stage_after_promotion: true }, timestamp_utc: nowUtc() };
  }

  const startOffset = Math.max(0, asInt(cursor.current_player_offset, 0));
  const players = universe.players.slice(startOffset, startOffset + chunkSize);
  if (players.length === 0) {
    await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status='FINALIZATION_ONLY', next_run_after=CURRENT_TIMESTAMP, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_delta_retain_refresh_cursor' AND batch_id=?`, safeJson({ finalization_only_ready: true, no_mlb_calls_next_tick: true }), batchId);
    return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'partial_continue_base_pitcher_splits', certification: 'DELTA_PITCHER_SPLITS_STAGE_FINALIZATION_REQUIRED_NO_PROMOTION_YET', certification_grade: 'FINALIZATION_ONLY_READY', rows_read: 0, rows_written: 1, rows_staged: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: true, orchestrator_should_self_continue: true, next_step: 'FINALIZE_DELTA_STAGE_ZERO_MLB_CALLS', delta_stage: { batch_id: batchId, run_id: runId }, timestamp_utc: nowUtc() };
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
    if (!fetched.ok) sourceError = fetched.error || 'fetch_failed';
    else { try { payload = JSON.parse(fetched.text || '{}'); } catch (err) { sourceError = 'non_json_response: ' + String(err && err.message ? err.message : err); } }
    const splits = payload ? extractSplits(payload) : [];
    const fieldsThisPlayer = new Set();
    const identifiersThisPlayer = [];
    if (sourceError || !(httpStatus >= 200 && httpStatus < 300)) {
      sourceErrorCount += 1;
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 0, 0, 0, 0, 'SOURCE_ERROR', 'delta source request failed or non-2xx/non-json', oneLine(sourceError || fetched.text), sourceSnapshotDate, '[]', '[]', 'delta_stage_source_error');
      playerSummaries.push({ player_id: player.player_id, terminal_category: 'SOURCE_ERROR', http_status: httpStatus });
      continue;
    }
    if (splits.length === 0) {
      sourceNoDataCount += 1;
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 1, 0, 0, 0, 'TRUE_NO_DATA', 'clean 2xx JSON response with zero statSplits rows', null, sourceSnapshotDate, '[]', '[]', 'delta_stage_true_no_data');
      playerSummaries.push({ player_id: player.player_id, terminal_category: 'TRUE_NO_DATA', http_status: httpStatus });
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
      const row = makeDeltaStageRow(split, player, SOURCE_SEASON, batchId, runId, endpoint, sourceSnapshotDate);
      await insertStageRow(env, row);
      stagedForPlayer += 1;
      rowsStaged += 1;
    }
    const category = unclearIdentifier ? 'UNCLEAR' : 'STAGE_ROWS_WRITTEN';
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 1, splits.length, stagedForPlayer, 0, category, category === 'UNCLEAR' ? 'one or more split identifiers not confirmed by source evidence' : 'delta stage retained rows written; no live promotion before certification', null, sourceSnapshotDate, safeJson(identifiersThisPlayer), safeJson(Array.from(fieldsThisPlayer).sort()), category === 'UNCLEAR' ? 'delta_stage_identifier_unclear' : 'delta_stage_identifier_confirmed');
    playerSummaries.push({ player_id: player.player_id, terminal_category: category, http_status: httpStatus, split_count: splits.length, rows_staged: stagedForPlayer });
  }

  const nextOffset = startOffset + players.length;
  const completed = nextOffset >= universe.expected_count;
  const totalRequests = asInt(cursor.requests_done, 0) + sourceRequestCount;
  const totalProcessed = Math.min(universe.expected_count, nextOffset);
  const stageTotal = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_stage WHERE batch_id=?", batchId);
  const outcomeTotal = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_split_outcomes WHERE batch_id=?", batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, source_request_count=COALESCE(source_request_count,0)+?, source_success_count=COALESCE(source_success_count,0)+?, source_no_data_count=COALESCE(source_no_data_count,0)+?, source_error_count=COALESCE(source_error_count,0)+?, rows_staged=?, rows_promoted=0, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, completed ? 'FINALIZATION_ONLY' : 'PARTIAL_CONTINUE', sourceRequestCount, sourceSuccessCount, sourceNoDataCount, sourceErrorCount, asInt(stageTotal && stageTotal.c, 0), batchId);
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_cursor SET status=?, current_player_id=?, current_player_offset=?, players_total=?, players_processed=?, requests_done=?, next_run_after=CURRENT_TIMESTAMP, last_error=NULL, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key='base_pitcher_splits_delta_retain_refresh_cursor' AND batch_id=?`, completed ? 'FINALIZATION_ONLY' : 'PARTIAL_CONTINUE', players.length ? players[players.length - 1].player_id : null, nextOffset, universe.expected_count, totalProcessed, totalRequests, safeJson({ chunk_size: chunkSize, last_chunk_player_ids: players.map(p => p.player_id), finalization_only_ready: completed, retain_stage_after_promotion: true }), batchId);
  return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'partial_continue_base_pitcher_splits', certification: completed ? 'DELTA_PITCHER_SPLITS_STAGE_FINALIZATION_REQUIRED_NO_PROMOTION_YET' : 'DELTA_PITCHER_SPLITS_STAGE_PARTIAL_CONTINUE_RETAIN_STAGE', certification_grade: completed ? 'FINALIZATION_ONLY_READY' : 'PARTIAL_CONTINUE', rows_read: players.length, rows_written: rowsStaged + players.length, rows_staged: asInt(stageTotal && stageTotal.c, 0), rows_promoted: 0, external_calls_performed: sourceRequestCount, continuation_required: true, orchestrator_should_self_continue: true, source_stage: { batch_id: batchId, run_id: runId, expected_pitcher_universe_count: universe.expected_count, players_processed: totalProcessed, outcome_rows: asInt(outcomeTotal && outcomeTotal.c, 0), current_offset: nextOffset, chunk_size: chunkSize, player_summaries: playerSummaries, retain_stage_after_promotion: true }, timestamp_utc: nowUtc() };
}

async function runProbe(env, input) {
  const mode = String(input.mode || input.input_json?.mode || PROMOTION_MODE);
  if (/delta/i.test(mode)) {
    return await runDeltaNoopRestoreScopedRepairGate(env, input);
  }
  return await runPromotion(env, input);
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
      catch (err) { return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BASE_PITCHER_SPLITS_FAILED", certification: "BASE_PITCHER_SPLITS_RUN_FAILED", error: String(err && err.message ? err.message : err), rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, timestamp_utc: nowUtc() }, 500); }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
