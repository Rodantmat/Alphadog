const WORKER_NAME = "alphadog-v2-base-hitter-splits";
const VERSION = "alphadog-v2-base-hitter-splits-v0.4.6-pitcher-parity-chunk-progress-fix";
const JOB_KEY = "base-hitter-splits";

const SOURCE_SEASON = 2026;
const GROUP_TYPE = "hitting";
const INGESTION_MODE = "base_backfill";
const DATA_FEED_KEY = "base_hitter_splits";
const SOURCE_KEY = "mlb_statsapi_people_statSplits_hitting_sitCodes_vl_vr_v0_2_0";
const SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=statSplits&group=hitting&season={season}&sitCodes=vl%2Cvr";
const LOCKED_HITTER_GAME_LOG_BATCH_ID = "hitter_base_backfill_batch_mpelpq0t_akyyu3";
const PROBE_CURSOR_KEY = "base_hitter_splits_source_probe_cursor";
const STAGE_CURSOR_KEY = "base_hitter_splits_base_backfill_stage_cursor";
const PROMOTION_CURSOR_KEY = "base_hitter_splits_certified_stage_promotion_cursor";
const DELTA_CURSOR_KEY = "base_hitter_splits_delta_update_cursor";
const CERTIFIED_STAGE_WORKER_VERSION = "alphadog-v2-base-hitter-splits-v0.2.0-base-backfill-stage-only";
const CERTIFIED_STAGE_STATUS = "BASE_BACKFILL_STAGE_ONLY_COMPLETED_NO_PROMOTION";
const CERTIFIED_STAGE_CERTIFICATION = "BASE_HITTER_SPLITS_BASE_BACKFILL_STAGE_ONLY_CERTIFIED_NO_PROMOTION";
const DEFAULT_SAMPLE_SIZE = 3;
const MAX_SAMPLE_SIZE = 5;
const DEFAULT_STAGE_CHUNK_SIZE = 20;
const MAX_STAGE_CHUNK_SIZE = 20;
const FETCH_TIMEOUT_MS = 7000;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB"];
const EXPECTED_VARS = ["MLB_API_BASE_URL", "ACTIVE_SEASON"];
const EXPECTED_SECRETS = ["MLB_API_USER_AGENT"];

function nowUtc() { return new Date().toISOString(); }
function todayUtc() { return new Date().toISOString().slice(0, 10); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function safeJson(v) { try { return JSON.stringify(v ?? null); } catch (_) { return JSON.stringify({ stringify_error: true }); } }
function cap(n, min, max) { return Math.max(min, Math.min(max, Number(n || 0))); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function bindingPresence(env, names) { const out = {}; for (const name of names) out[name] = Boolean(env && env[name]); return out; }
function varPresence(env, names) { const out = {}; for (const name of names) out[name] = !!(env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0); return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch (_) { return {}; } }
async function all(db, sql, ...binds) { const s = db.prepare(sql); const r = binds.length ? await s.bind(...binds).all() : await s.all(); return r.results || []; }
async function first(db, sql, ...binds) { const rows = await all(db, sql, ...binds); return rows[0] || null; }
async function run(db, sql, ...binds) { const s = db.prepare(sql); return binds.length ? await s.bind(...binds).run() : await s.run(); }
async function tryRun(db, sql, ...binds) { try { const res = await run(db, sql, ...binds); return { ok: true, meta: res && res.meta ? res.meta : null }; } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; } }

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
    status: "DELTA_NOOP_RESTORE_GATE_READY",
    timestamp_utc: nowUtc(),
    phase: "base_hitter_splits_v0_4_5_daily_refresh_reopen_loop_fix",
    source_lock: {
      endpoint_pattern: SOURCE_ENDPOINT_PATTERN,
      source_key: SOURCE_KEY,
      season: SOURCE_SEASON,
      group_type: GROUP_TYPE,
      sitCodes: "vl,vr",
      source_model: "season_to_date_aggregate_snapshot",
      no_unspecified_split_source: true,
      no_2026_05_18_cutoff_claim: true
    },
    hard_blocks: {
      live_promotion_from_certified_stage_only: true,
      delta_noop_before_queue_if_current: true,
      retained_stage_restore_if_available: true,
      no_new_mlb_calls_for_noop_gate: true,
      no_full_universe_remine_for_repair: true,
      daily_affected_player_refresh_enabled: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_mutation: true,
      no_market_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
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
  const db = env.STATS_HITTER_DB;
  const results = [];
  async function exec(label, sql, ...binds) {
    const r = await tryRun(db, sql, ...binds);
    results.push({ label, ok: r.ok, error: r.ok ? null : r.error });
    return r;
  }

  await exec("create_hitter_schema_migrations", `CREATE TABLE IF NOT EXISTS hitter_schema_migrations (migration_key TEXT PRIMARY KEY, package_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`);

  await exec("create_hitter_split_stage", `CREATE TABLE IF NOT EXISTS hitter_split_stage (
    stage_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    season INTEGER NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'hitting',
    split_code TEXT NOT NULL,
    split_source_code TEXT,
    split_description TEXT,
    pa INTEGER,
    ab INTEGER,
    hits INTEGER,
    singles INTEGER,
    doubles INTEGER,
    triples INTEGER,
    home_runs INTEGER,
    runs INTEGER,
    rbi INTEGER,
    walks INTEGER,
    strikeouts INTEGER,
    stolen_bases INTEGER,
    total_bases INTEGER,
    avg TEXT,
    obp TEXT,
    slg TEXT,
    ops TEXT,
    babip TEXT,
    data_feed_key TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_endpoint TEXT NOT NULL,
    source_season INTEGER NOT NULL,
    source_game_type TEXT,
    ingestion_mode TEXT NOT NULL,
    certification_status TEXT DEFAULT 'stage_only_unverified',
    certification_grade TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_STAGE_ONLY',
    certified_at TEXT,
    promoted_at TEXT,
    source_snapshot_date TEXT,
    raw_json TEXT NOT NULL,
    stat_shape_json TEXT,
    row_status TEXT DEFAULT 'base_backfill_stage_only_staged',
    row_error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(batch_id, player_id, season, group_type, split_code)
  )`);

  await exec("create_hitter_split_batches", `CREATE TABLE IF NOT EXISTS hitter_split_batches (
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
    cursor_player_id INTEGER,
    cursor_season INTEGER,
    cursor_offset INTEGER DEFAULT 0,
    cursor_state_json TEXT,
    expected_hitter_universe_count INTEGER DEFAULT 0,
    sample_size INTEGER DEFAULT 0,
    source_request_count INTEGER DEFAULT 0,
    source_success_count INTEGER DEFAULT 0,
    source_no_data_count INTEGER DEFAULT 0,
    source_error_count INTEGER DEFAULT 0,
    rows_staged INTEGER DEFAULT 0,
    rows_promoted INTEGER DEFAULT 0,
    duplicate_stage_keys INTEGER DEFAULT 0,
    split_identifier_summary_json TEXT,
    field_summary_json TEXT,
    source_snapshot_assessment TEXT,
    certification_status TEXT DEFAULT 'not_certified',
    certification_grade TEXT,
    certification_json TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_STAGE_ONLY',
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

  await exec("create_hitter_split_outcomes", `CREATE TABLE IF NOT EXISTS hitter_split_outcomes (
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
    certification_status TEXT DEFAULT 'player_outcome_unverified',
    certification_grade TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (batch_id, player_id)
  )`);

  await exec("create_hitter_split_cursor", `CREATE TABLE IF NOT EXISTS hitter_split_cursor (
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

  await exec("create_hitter_split_certifications", `CREATE TABLE IF NOT EXISTS hitter_split_certifications (
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
    ["group_type", "TEXT DEFAULT 'hitting'"],
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
    ["babip", "TEXT"],
    ["stat_shape_json", "TEXT"]
  ];
  for (const [col, def] of liveAdds) {
    const r = await tryRun(db, `ALTER TABLE hitter_splits ADD COLUMN ${col} ${def}`);
    results.push({ label: `alter_hitter_splits_add_${col}`, ok: r.ok || /duplicate column name/i.test(r.error || ""), error: r.ok || /duplicate column name/i.test(r.error || "") ? null : r.error });
  }

  await exec("create_hitter_split_repair_registry", `CREATE TABLE IF NOT EXISTS hitter_split_repair_registry (
    registry_key TEXT PRIMARY KEY,
    target_batch_id TEXT NOT NULL,
    source_batch_id TEXT,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    season INTEGER NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'hitting',
    split_code TEXT NOT NULL,
    split_source_code TEXT,
    source_endpoint TEXT,
    source_snapshot_date TEXT,
    target_row_json TEXT,
    status TEXT,
    created_by_version TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  const indexes = [
    ["idx_hitter_split_repair_registry_target", "CREATE INDEX IF NOT EXISTS idx_hitter_split_repair_registry_target ON hitter_split_repair_registry(target_batch_id, player_id, season, group_type, split_code)"],
    ["idx_hitter_split_stage_batch", "CREATE INDEX IF NOT EXISTS idx_hitter_split_stage_batch ON hitter_split_stage(batch_id, row_status)"],
    ["idx_hitter_split_stage_player", "CREATE INDEX IF NOT EXISTS idx_hitter_split_stage_player ON hitter_split_stage(player_id, season, split_code)"],
    ["idx_hitter_split_stage_cert", "CREATE INDEX IF NOT EXISTS idx_hitter_split_stage_cert ON hitter_split_stage(certification_status, batch_id)"],
    ["idx_hitter_split_batches_status", "CREATE INDEX IF NOT EXISTS idx_hitter_split_batches_status ON hitter_split_batches(status, mode, updated_at)"],
    ["idx_hitter_split_batches_lock", "CREATE INDEX IF NOT EXISTS idx_hitter_split_batches_lock ON hitter_split_batches(locked_by, lock_expires_at)"],
    ["idx_hitter_split_cursor_status", "CREATE INDEX IF NOT EXISTS idx_hitter_split_cursor_status ON hitter_split_cursor(status, mode, updated_at)"],
    ["idx_hitter_split_outcomes_batch_category", "CREATE INDEX IF NOT EXISTS idx_hitter_split_outcomes_batch_category ON hitter_split_outcomes(batch_id, terminal_category)"],
    ["idx_hitter_split_outcomes_player", "CREATE INDEX IF NOT EXISTS idx_hitter_split_outcomes_player ON hitter_split_outcomes(player_id, batch_id)"],
    ["idx_hitter_splits_lineage", "CREATE INDEX IF NOT EXISTS idx_hitter_splits_lineage ON hitter_splits(batch_id, certification_status)"],
    ["idx_hitter_splits_player_split_code", "CREATE INDEX IF NOT EXISTS idx_hitter_splits_player_split_code ON hitter_splits(player_id, season, split_code)"]
  ];
  for (const [label, sql] of indexes) await exec(label, sql);

  await exec("record_schema_migration_v0_2_0", "INSERT OR REPLACE INTO hitter_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_hitter_splits_v0_2_0_base_backfill_stage_only', ?, CURRENT_TIMESTAMP, 'Base Hitter Splits v0.4.2: delta no-op / retained registry restore / scoped repair / daily affected-player split refresh; no full universe default repair')", VERSION);
  return { attempted: results.length, failed: results.filter(r => !r.ok).length, results };
}

async function schemaStatus(env) {
  const tables = await all(env.STATS_HITTER_DB, "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'hitter_split%' OR name='hitter_splits') ORDER BY name");
  const indexes = await all(env.STATS_HITTER_DB, "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_hitter_split%' ORDER BY name");
  const liveCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_splits)");
  return { tables: tables.map(r => r.name), indexes: indexes.map(r => r.name), hitter_splits_columns: liveCols.map(r => r.name) };
}

function endpointFor(env, playerId, season) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  return `${base}/people/${encodeURIComponent(playerId)}/stats?stats=statSplits&group=hitting&season=${encodeURIComponent(season)}&sitCodes=vl%2Cvr`;
}

async function readHitterUniverse(env) {
  let rows = [];
  try {
    rows = await all(env.STATS_HITTER_DB, `SELECT player_id, player_name
      FROM hitter_game_log_player_outcomes
      WHERE batch_id=?
      ORDER BY player_id`, LOCKED_HITTER_GAME_LOG_BATCH_ID);
  } catch (err) {
    return { ok: false, source: "STATS_HITTER_DB.hitter_game_log_player_outcomes", error: String(err && err.message ? err.message : err), players: [], expected_count: 0, duplicate_count: 0 };
  }
  const seen = new Map();
  const duplicates = [];
  for (const r of rows) {
    const id = asInt(r.player_id, 0);
    if (!id) continue;
    if (seen.has(id)) duplicates.push(id);
    else seen.set(id, { player_id: id, player_name: r.player_name || null });
  }
  const players = Array.from(seen.values()).sort((a, b) => a.player_id - b.player_id).map((p, idx) => ({ ...p, cursor_offset: idx, source: "locked_hitter_game_log_player_outcomes_base_batch" }));
  return {
    ok: players.length > 0 && duplicates.length === 0,
    source: "STATS_HITTER_DB.hitter_game_log_player_outcomes",
    locked_batch_id: LOCKED_HITTER_GAME_LOG_BATCH_ID,
    expected_count: players.length,
    duplicate_count: duplicates.length,
    duplicate_player_ids: duplicates.slice(0, 20),
    players
  };
}

async function chooseSampleHitters(env, inputJson) {
  const explicit = Array.isArray(inputJson.player_ids) ? inputJson.player_ids.map(x => asInt(x, 0)).filter(Boolean).slice(0, MAX_SAMPLE_SIZE) : [];
  if (explicit.length) return explicit.map((player_id, idx) => ({ player_id, player_name: null, cursor_offset: idx, source: "input_json.player_ids" }));
  const universe = await readHitterUniverse(env);
  if (universe.ok) return universe.players.slice(0, DEFAULT_SAMPLE_SIZE).map((p, idx) => ({ ...p, cursor_offset: idx }));
  return [];
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
  if (/\bvl\b|vs\.?\s*l|left|lhp|left-handed|left handed/.test(joined)) return { split_code: "vs_left", evidence: parts };
  if (/\bvr\b|vs\.?\s*r|right|rhp|right-handed|right handed/.test(joined)) return { split_code: "vs_right", evidence: parts };
  const fallback = parts[0] && parts[0].value ? `source_${parts[0].value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}` : "source_unmapped";
  return { split_code: fallback || "source_unmapped", evidence: parts };
}

function statFields(stat) { if (!stat || typeof stat !== "object") return []; return Object.keys(stat).sort(); }
function statVal(stat, ...keys) { for (const k of keys) { if (stat && stat[k] !== undefined && stat[k] !== null && String(stat[k]).trim() !== "") return stat[k]; } return null; }
function intStat(stat, ...keys) { const v = statVal(stat, ...keys); return v === null ? null : asInt(v, null); }
function textStat(stat, ...keys) { const v = statVal(stat, ...keys); return v === null ? null : String(v); }

function parseStageRow(split, player, season, batchId, runId, endpoint, sourceSnapshotDate, statusLabel) {
  const stat = split && split.stat ? split.stat : {};
  const mapped = mapSplitCode(split);
  const sourceCode = mapped.evidence && mapped.evidence[0] ? mapped.evidence[0].value : mapped.split_code;
  const description = mapped.evidence && mapped.evidence.length ? mapped.evidence.map(x => `${x.label}=${x.value}`).join("; ") : mapped.split_code;
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
    pa: intStat(stat, "plateAppearances", "pa"),
    ab: intStat(stat, "atBats", "ab"),
    hits: intStat(stat, "hits"),
    singles: intStat(stat, "singles"),
    doubles: intStat(stat, "doubles"),
    triples: intStat(stat, "triples"),
    home_runs: intStat(stat, "homeRuns", "home_runs", "hr"),
    runs: intStat(stat, "runs"),
    rbi: intStat(stat, "rbi", "runsBattedIn"),
    walks: intStat(stat, "baseOnBalls", "walks", "bb"),
    strikeouts: intStat(stat, "strikeOuts", "strikeouts", "so"),
    stolen_bases: intStat(stat, "stolenBases", "stolen_bases"),
    total_bases: intStat(stat, "totalBases", "total_bases"),
    avg: textStat(stat, "avg"),
    obp: textStat(stat, "obp"),
    slg: textStat(stat, "slg"),
    ops: textStat(stat, "ops"),
    babip: textStat(stat, "babip"),
    data_feed_key: DATA_FEED_KEY,
    source_key: SOURCE_KEY,
    source_endpoint: endpoint,
    source_season: season,
    source_game_type: null,
    ingestion_mode: INGESTION_MODE,
    certification_status: statusLabel,
    certification_grade: null,
    source_confidence: "SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_STAGE_ONLY",
    certified_at: null,
    promoted_at: null,
    source_snapshot_date: sourceSnapshotDate,
    raw_json: safeJson(split),
    stat_shape_json: safeJson({ stat_fields: statFields(stat), identifier_evidence: mapped.evidence }),
    row_status: statusLabel,
    row_error: null
  };
}

async function insertStageRow(env, row) {
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_stage (
    stage_id,batch_id,run_id,player_id,player_name,season,group_type,split_code,split_source_code,split_description,
    pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
    avg,obp,slg,ops,babip,data_feed_key,source_key,source_endpoint,source_season,source_game_type,ingestion_mode,
    certification_status,certification_grade,source_confidence,certified_at,promoted_at,source_snapshot_date,raw_json,stat_shape_json,row_status,row_error,updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    row.stage_id,row.batch_id,row.run_id,row.player_id,row.player_name,row.season,row.group_type,row.split_code,row.split_source_code,row.split_description,
    row.pa,row.ab,row.hits,row.singles,row.doubles,row.triples,row.home_runs,row.runs,row.rbi,row.walks,row.strikeouts,row.stolen_bases,row.total_bases,
    row.avg,row.obp,row.slg,row.ops,row.babip,row.data_feed_key,row.source_key,row.source_endpoint,row.source_season,row.source_game_type,row.ingestion_mode,
    row.certification_status,row.certification_grade,row.source_confidence,row.certified_at,row.promoted_at,row.source_snapshot_date,row.raw_json,row.stat_shape_json,row.row_status,row.row_error);
}

function sourceSnapshotAssessment(splits) {
  let dateLike = 0;
  let gameLike = 0;
  for (const split of splits) {
    const raw = JSON.stringify(split || {}).toLowerCase();
    if (/gamepk|game_pk|gamedate|game_date|date/.test(raw)) dateLike++;
    if (/gamepk|game_pk/.test(raw)) gameLike++;
  }
  if (!splits.length) return "not_determined_empty_probe_payload";
  if (dateLike === 0 && gameLike === 0) return "season_to_date_aggregate_snapshot_likely_no_game_date_fields_observed";
  return "date_or_game_fields_observed_requires_deeper_audit_before_cutoff_claim";
}

async function recordOutcome(env, args) {
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_outcomes (
    batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,
    terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,certification_grade,updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args.batch_id, args.run_id, args.player_id, args.player_name, args.cursor_offset, args.source_endpoint, args.source_http_status,
    args.source_ok ? 1 : 0, args.raw_payload_split_count, args.rows_staged, args.terminal_category, args.category_reason, args.source_error,
    args.source_snapshot_date, safeJson(args.split_identifier_json || []), safeJson(args.field_names_json || []), args.certification_status, args.certification_grade);
}

async function processOnePlayer(env, player, season, batchId, runId, sourceSnapshotDate, statusLabel) {
  const endpoint = endpointFor(env, player.player_id, season);
  const headers = { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-splits") };
  let terminal = "UNCLEAR";
  let reason = "Worker did not classify response cleanly.";
  let sourceError = null;
  let httpStatus = null;
  let splits = [];
  let rowsForPlayer = 0;
  const observedIdentifiers = [];
  const observedFields = new Set();

  try {
    const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers }, FETCH_TIMEOUT_MS);
    if (!fetched.ok) {
      terminal = "SOURCE_ERROR";
      sourceError = fetched.error || "fetch_failed";
    } else {
      httpStatus = fetched.resp.status;
      let payload = null;
      try { payload = JSON.parse(fetched.text || "{}"); } catch (err) { payload = { parse_error: String(err && err.message ? err.message : err), raw_preview: String(fetched.text || "").slice(0, 500) }; }
      if (!fetched.resp.ok || payload.parse_error) {
        terminal = "SOURCE_ERROR";
        sourceError = payload.parse_error || `HTTP_${httpStatus}`;
      } else {
        splits = extractSplits(payload);
        if (!splits.length) {
          terminal = "TRUE_NO_DATA";
          reason = "HTTP 200 JSON response contained zero stats[].splits rows for locked sitCodes=vl,vr endpoint.";
        } else {
          for (const split of splits) {
            const stat = split && split.stat ? split.stat : {};
            for (const f of statFields(stat)) observedFields.add(f);
            const mapped = mapSplitCode(split);
            observedIdentifiers.push({ player_id: player.player_id, split_code: mapped.split_code, evidence: mapped.evidence });
            const row = parseStageRow(split, player, season, batchId, runId, endpoint, sourceSnapshotDate, statusLabel);
            await insertStageRow(env, row);
            rowsForPlayer++;
          }
          terminal = "PROMOTED_ROWS";
          reason = "Source returned split rows and v0.2.0 staged them only; no live hitter_splits promotion occurred.";
        }
      }
    }
  } catch (err) {
    terminal = "SOURCE_ERROR";
    sourceError = String(err && err.message ? err.message : err);
  }

  await recordOutcome(env, {
    batch_id: batchId,
    run_id: runId,
    player_id: player.player_id,
    player_name: player.player_name,
    cursor_offset: player.cursor_offset,
    source_endpoint: endpoint,
    source_http_status: httpStatus,
    source_ok: terminal === "PROMOTED_ROWS" || terminal === "TRUE_NO_DATA",
    raw_payload_split_count: splits.length,
    rows_staged: rowsForPlayer,
    terminal_category: terminal,
    category_reason: reason,
    source_error: sourceError,
    source_snapshot_date: sourceSnapshotDate,
    split_identifier_json: observedIdentifiers,
    field_names_json: Array.from(observedFields).sort(),
    certification_status: "player_outcome_stage_only_recorded",
    certification_grade: "STAGE_ONLY"
  });

  return { player_id: player.player_id, player_name: player.player_name, http_status: httpStatus, terminal_category: terminal, raw_payload_split_count: splits.length, rows_staged: rowsForPlayer, source_error: sourceError, split_identifiers: observedIdentifiers, field_names: Array.from(observedFields).sort(), splits };
}

async function aggregateBatchTruth(env, batchId) {
  const counts = await first(env.STATS_HITTER_DB, `SELECT
    COUNT(*) AS outcomes,
    SUM(CASE WHEN terminal_category='PROMOTED_ROWS' THEN 1 ELSE 0 END) AS success_players,
    SUM(CASE WHEN terminal_category='TRUE_NO_DATA' THEN 1 ELSE 0 END) AS no_data_players,
    SUM(CASE WHEN terminal_category='SOURCE_ERROR' THEN 1 ELSE 0 END) AS source_errors,
    SUM(CASE WHEN terminal_category='REPAIR_REQUIRED' THEN 1 ELSE 0 END) AS repair_required,
    SUM(CASE WHEN terminal_category='UNCLEAR' THEN 1 ELSE 0 END) AS unclear
    FROM hitter_split_outcomes WHERE batch_id=?`, batchId);
  const stageRows = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_split_stage WHERE batch_id=?", batchId);
  const dupStage = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (
    SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM hitter_split_stage WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1
  )`, batchId);
  const dupOutcomes = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (
    SELECT player_id, COUNT(*) AS n FROM hitter_split_outcomes WHERE batch_id=? GROUP BY player_id HAVING n>1
  )`, batchId);
  const missing = await first(env.STATS_HITTER_DB, `SELECT
    SUM(CASE WHEN player_id IS NULL THEN 1 ELSE 0 END) AS missing_player_id,
    SUM(CASE WHEN season IS NULL THEN 1 ELSE 0 END) AS missing_season,
    SUM(CASE WHEN group_type IS NULL OR group_type='' THEN 1 ELSE 0 END) AS missing_group_type,
    SUM(CASE WHEN split_code IS NULL OR split_code='' THEN 1 ELSE 0 END) AS missing_split_code,
    SUM(CASE WHEN group_type!='hitting' THEN 1 ELSE 0 END) AS bad_group_type,
    SUM(CASE WHEN split_code NOT IN ('vs_left','vs_right') THEN 1 ELSE 0 END) AS invalid_split_code,
    SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS missing_raw_json,
    SUM(CASE WHEN data_feed_key IS NULL OR source_key IS NULL OR source_endpoint IS NULL OR ingestion_mode IS NULL OR batch_id IS NULL OR run_id IS NULL THEN 1 ELSE 0 END) AS missing_lineage
    FROM hitter_split_stage WHERE batch_id=?`, batchId);
  const splitCodes = await all(env.STATS_HITTER_DB, "SELECT DISTINCT split_code FROM hitter_split_stage WHERE batch_id=? ORDER BY split_code", batchId);
  const fieldRows = await all(env.STATS_HITTER_DB, "SELECT stat_shape_json FROM hitter_split_stage WHERE batch_id=? LIMIT 5000", batchId);
  const fieldSet = new Set();
  for (const r of fieldRows) {
    try {
      const parsed = JSON.parse(r.stat_shape_json || "{}");
      for (const f of (parsed.stat_fields || [])) fieldSet.add(f);
    } catch (_) {}
  }
  return {
    outcomes: asInt(counts && counts.outcomes, 0),
    success_players: asInt(counts && counts.success_players, 0),
    no_data_players: asInt(counts && counts.no_data_players, 0),
    source_errors: asInt(counts && counts.source_errors, 0),
    repair_required: asInt(counts && counts.repair_required, 0),
    unclear: asInt(counts && counts.unclear, 0),
    rows_staged: asInt(stageRows && stageRows.c, 0),
    duplicate_stage_keys: asInt(dupStage && dupStage.c, 0),
    duplicate_outcome_rows: asInt(dupOutcomes && dupOutcomes.c, 0),
    missing_player_id: asInt(missing && missing.missing_player_id, 0),
    missing_season: asInt(missing && missing.missing_season, 0),
    missing_group_type: asInt(missing && missing.missing_group_type, 0),
    missing_split_code: asInt(missing && missing.missing_split_code, 0),
    bad_group_type: asInt(missing && missing.bad_group_type, 0),
    invalid_split_code: asInt(missing && missing.invalid_split_code, 0),
    missing_raw_json: asInt(missing && missing.missing_raw_json, 0),
    missing_lineage: asInt(missing && missing.missing_lineage, 0),
    split_codes_confirmed: splitCodes.map(r => r.split_code),
    field_names_confirmed: Array.from(fieldSet).sort()
  };
}

async function writeBatchCounters(env, batchId, truth, extra = {}) {
  await run(env.STATS_HITTER_DB, `UPDATE hitter_split_batches SET
    source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, rows_promoted=0,
    duplicate_stage_keys=?, split_identifier_summary_json=?, field_summary_json=?, source_snapshot_assessment=?, certification_json=?, cursor_offset=COALESCE(?, cursor_offset), updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`,
    truth.outcomes, truth.success_players, truth.no_data_players, truth.source_errors, truth.rows_staged,
    truth.duplicate_stage_keys, safeJson(truth.split_codes_confirmed), safeJson(truth.field_names_confirmed), extra.source_snapshot_assessment || "season_to_date_aggregate_snapshot_likely_no_game_date_fields_observed", safeJson(extra.certification_json || truth), extra.cursor_offset ?? null, batchId);
}

async function getCompletedStageOnlyBatch(env) {
  return await first(env.STATS_HITTER_DB, `SELECT batch_id, status, certification_status, certification_grade, rows_staged, rows_promoted, expected_hitter_universe_count, source_request_count, source_success_count, source_no_data_count, source_error_count, updated_at
    FROM hitter_split_batches
    WHERE worker_version=? AND mode='base_backfill_stage_only' AND status='BASE_BACKFILL_STAGE_ONLY_COMPLETED_NO_PROMOTION'
    ORDER BY datetime(updated_at) DESC LIMIT 1`, VERSION);
}

async function getOrStartStageOnlyBatch(env, inputJson, universe, sourceSnapshotDate) {
  const forceNew = inputJson.force_new_batch === true;
  if (!forceNew) {
    const completed = await getCompletedStageOnlyBatch(env);
    if (completed) return { noop_completed: true, completed };
  }

  const existingCursor = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_split_cursor WHERE cursor_key=?", STAGE_CURSOR_KEY);
  if (!forceNew && existingCursor && ["BASE_BACKFILL_STAGE_ONLY_RUNNING", "BASE_BACKFILL_STAGE_ONLY_PARTIAL_CONTINUE"].includes(String(existingCursor.status || ""))) {
    const batch = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_split_batches WHERE batch_id=?", existingCursor.batch_id);
    if (batch) return { batch_id: existingCursor.batch_id, run_id: existingCursor.run_id, cursor_offset: asInt(existingCursor.current_player_offset, 0), resumed: true };
  }

  const batchId = inputJson.batch_id || rid("hitter_splits_base_stage_batch");
  const runId = inputJson.run_id || rid("run_hitter_splits_base_stage");
  await run(env.STATS_HITTER_DB, "DELETE FROM hitter_split_stage WHERE batch_id=?", batchId);
  await run(env.STATS_HITTER_DB, "DELETE FROM hitter_split_outcomes WHERE batch_id=?", batchId);
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_batches (
    batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_endpoint,source_season,source_game_type,source_snapshot_date,
    cursor_player_id,cursor_season,cursor_offset,cursor_state_json,expected_hitter_universe_count,sample_size,certification_status,certification_grade,source_confidence,notes,updated_at
  ) VALUES (?, ?, ?, ?, 'base_backfill_stage_only', 'BASE_BACKFILL_STAGE_ONLY_RUNNING', ?, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?, 0, 'not_certified', 'STAGE_ONLY_RUNNING', 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_STAGE_ONLY', ?, CURRENT_TIMESTAMP)`,
    batchId, runId, WORKER_NAME, VERSION, DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_PATTERN, SOURCE_SEASON, sourceSnapshotDate, SOURCE_SEASON,
    safeJson({ version: VERSION, source_snapshot_date: sourceSnapshotDate, source_model: "season_to_date_aggregate_snapshot", universe_source: universe.source, locked_hitter_game_log_batch_id: LOCKED_HITTER_GAME_LOG_BATCH_ID, expected_hitter_universe_count: universe.expected_count, no_live_promotion: true, no_delta_update: true }), universe.expected_count,
    "v0.2.0 base_backfill stage-only. Full locked hitter universe, cursor continuation, no live hitter_splits promotion, no delta execution. Source is season-to-date aggregate snapshot."
  );
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES (?, ?, ?, 'base_backfill_stage_only', 'BASE_BACKFILL_STAGE_ONLY_RUNNING', ?, ?, NULL, 0, ?, 0, 0, CURRENT_TIMESTAMP, NULL, ?, CURRENT_TIMESTAMP)`,
    STAGE_CURSOR_KEY, batchId, runId, SOURCE_SEASON, sourceSnapshotDate, universe.expected_count, safeJson({ universe_source: universe.source, locked_hitter_game_log_batch_id: LOCKED_HITTER_GAME_LOG_BATCH_ID, expected_hitter_universe_count: universe.expected_count, source_snapshot_date: sourceSnapshotDate }));
  return { batch_id: batchId, run_id: runId, cursor_offset: 0, resumed: false };
}

async function finalizeStageOnly(env, batchId, runId, universe, sourceSnapshotDate, liveBefore, startedMs) {
  const truth = await aggregateBatchTruth(env, batchId);
  const liveAfter = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits");
  const checks = {
    expected_hitter_universe_count: universe.expected_count,
    hitter_universe_source: universe.source,
    locked_hitter_game_log_batch_id: LOCKED_HITTER_GAME_LOG_BATCH_ID,
    outcome_rows: truth.outcomes,
    outcome_rows_match_expected: truth.outcomes === universe.expected_count,
    duplicate_outcome_rows: truth.duplicate_outcome_rows,
    stage_rows_gt_zero: truth.rows_staged > 0,
    source_error_count: truth.source_errors,
    repair_required_count: truth.repair_required,
    unclear_count: truth.unclear,
    duplicate_stage_keys: truth.duplicate_stage_keys,
    missing_player_id: truth.missing_player_id,
    missing_season: truth.missing_season,
    missing_group_type: truth.missing_group_type,
    missing_split_code: truth.missing_split_code,
    bad_group_type: truth.bad_group_type,
    invalid_split_code: truth.invalid_split_code,
    missing_raw_json: truth.missing_raw_json,
    missing_lineage: truth.missing_lineage,
    split_codes_confirmed: truth.split_codes_confirmed,
    field_names_confirmed: truth.field_names_confirmed,
    live_hitter_splits_before: asInt(liveBefore && liveBefore.c, 0),
    live_hitter_splits_after: asInt(liveAfter && liveAfter.c, 0),
    no_live_promotion_occurred: asInt(liveBefore && liveBefore.c, 0) === asInt(liveAfter && liveAfter.c, 0),
    rows_promoted: 0,
    delta_update_blocked: true,
    source_snapshot_date: sourceSnapshotDate,
    source_snapshot_assessment: "season_to_date_aggregate_snapshot_likely_no_game_date_fields_observed",
    no_2026_05_18_cutoff_claim: true
  };
  const pass = checks.outcome_rows_match_expected && checks.duplicate_outcome_rows === 0 && checks.stage_rows_gt_zero && checks.source_error_count === 0 && checks.repair_required_count === 0 && checks.unclear_count === 0 && checks.duplicate_stage_keys === 0 && checks.missing_player_id === 0 && checks.missing_season === 0 && checks.missing_group_type === 0 && checks.missing_split_code === 0 && checks.bad_group_type === 0 && checks.invalid_split_code === 0 && checks.missing_raw_json === 0 && checks.missing_lineage === 0 && checks.no_live_promotion_occurred;
  const certification = pass ? "BASE_HITTER_SPLITS_BASE_BACKFILL_STAGE_ONLY_CERTIFIED_NO_PROMOTION" : "BASE_HITTER_SPLITS_BASE_BACKFILL_STAGE_ONLY_REVIEW_REQUIRED";
  const grade = pass ? "STAGE_PASS" : "STAGE_REVIEW";
  const status = pass ? "BASE_BACKFILL_STAGE_ONLY_COMPLETED_NO_PROMOTION" : "BASE_BACKFILL_STAGE_ONLY_REVIEW_REQUIRED";

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_certifications (
    certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date
  ) VALUES (?, ?, ?, 'base_backfill_stage_only', ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    `${batchId}_stage_only_cert`, batchId, runId, certification, grade, safeJson(checks), truth.rows_staged, truth.duplicate_stage_keys, truth.no_data_players, truth.source_errors, sourceSnapshotDate);

  await run(env.STATS_HITTER_DB, "UPDATE hitter_split_stage SET certification_status=?, certification_grade=?, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", certification, grade, batchId);
  await run(env.STATS_HITTER_DB, "UPDATE hitter_split_outcomes SET certification_status=?, certification_grade=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", certification, grade, batchId);
  await run(env.STATS_HITTER_DB, `UPDATE hitter_split_batches SET status=?, certification_status=?, certification_grade=?, certification_json=?, source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, rows_promoted=0, duplicate_stage_keys=?, split_identifier_summary_json=?, field_summary_json=?, source_snapshot_assessment=?, finished_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, promoted_at=NULL, cleaned_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    status, certification, grade, safeJson(checks), truth.outcomes, truth.success_players, truth.no_data_players, truth.source_errors, truth.rows_staged, truth.duplicate_stage_keys, safeJson(truth.split_codes_confirmed), safeJson(truth.field_names_confirmed), checks.source_snapshot_assessment, batchId);
  await run(env.STATS_HITTER_DB, "UPDATE hitter_split_cursor SET status=?, current_player_offset=?, players_processed=?, requests_done=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?", status, universe.expected_count, universe.expected_count, truth.outcomes, STAGE_CURSOR_KEY);

  return {
    ok: true,
    data_ok: pass,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status,
    certification,
    certification_grade: grade,
    mode: "base_backfill_stage_only",
    batch_id: batchId,
    run_id: runId,
    source_snapshot_date: sourceSnapshotDate,
    expected_hitter_universe_count: universe.expected_count,
    cursor_offset_after: universe.expected_count,
    players_processed_this_tick: 0,
    players_remaining: 0,
    rows_read: 0,
    rows_written: 3,
    rows_staged: truth.rows_staged,
    rows_promoted: 0,
    live_rows_before: asInt(liveBefore && liveBefore.c, 0),
    live_rows_after: asInt(liveAfter && liveAfter.c, 0),
    external_calls_performed: 0,
    continuation_required: false,
    orchestrator_should_self_continue: false,
    elapsed_ms: Date.now() - startedMs,
    hitter_universe_audit: { ok: universe.ok, source: universe.source, locked_batch_id: universe.locked_batch_id, expected_hitter_universe_count: universe.expected_count, duplicate_count: universe.duplicate_count },
    checks,
    hard_blocks_confirmed: baseIdentity(env).hard_blocks,
    next_phase_gate: pass ? "v0.3.0 promotion can be considered only after review; delta remains blocked." : "Stop and review stage-only certification failures."
  };
}


async function getCertifiedStageForPromotion(env, requestedBatchId = null) {
  // v0.3.1 repair: promotion is multi-tick. After the first chunk, the same
  // certified v0.2.0 stage batch is intentionally marked BASE_PROMOTION_PARTIAL_CONTINUE.
  // The next tick must resume that same batch instead of blocking because the status
  // is no longer the original stage-only certification status.
  const allowedStatuses = [
    CERTIFIED_STAGE_STATUS,
    "BASE_PROMOTION_PARTIAL_CONTINUE",
    "BASE_PROMOTION_REVIEW_REQUIRED"
  ];
  const allowedCertifications = [
    CERTIFIED_STAGE_CERTIFICATION,
    "BASE_HITTER_SPLITS_PROMOTION_PARTIAL_CONTINUE"
  ];
  const statusMarks = allowedStatuses.map(() => "?").join(",");
  const certMarks = allowedCertifications.map(() => "?").join(",");
  const argsBase = [CERTIFIED_STAGE_WORKER_VERSION, ...allowedStatuses, ...allowedCertifications];

  if (requestedBatchId) {
    return await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_split_batches
      WHERE batch_id=?
        AND worker_version=?
        AND mode='base_backfill_stage_only'
        AND status IN (${statusMarks})
        AND certification_status IN (${certMarks})
        AND certification_grade IN ('STAGE_PASS','PARTIAL')
      LIMIT 1`, requestedBatchId, ...argsBase);
  }
  return await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_split_batches
    WHERE worker_version=?
      AND mode='base_backfill_stage_only'
      AND status IN (${statusMarks})
      AND certification_status IN (${certMarks})
      AND certification_grade IN ('STAGE_PASS','PARTIAL')
    ORDER BY
      CASE WHEN status='BASE_PROMOTION_PARTIAL_CONTINUE' THEN 0 ELSE 1 END,
      datetime(updated_at) DESC
    LIMIT 1`, ...argsBase);
}

async function promoteCertifiedStageChunk(env, batchId, limit) {
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_splits (
    player_id,season,split_key,split_description,pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,
    avg,obp,slg,ops,raw_json,source_key,source_confidence,updated_at,group_type,split_code,split_source_code,data_feed_key,source_endpoint,source_season,
    source_game_type,ingestion_mode,batch_id,run_id,certification_status,certification_grade,certified_at,promoted_at,created_at,source_snapshot_date,babip,stat_shape_json
  )
  SELECT
    player_id,season,split_code,split_description,pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,
    avg,obp,slg,ops,raw_json,source_key,source_confidence,CURRENT_TIMESTAMP,group_type,split_code,split_source_code,data_feed_key,source_endpoint,source_season,
    source_game_type,ingestion_mode,batch_id,run_id,'BASE_HITTER_SPLITS_PROMOTED_FROM_CERTIFIED_STAGE','BASE_PASS',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,created_at,source_snapshot_date,babip,stat_shape_json
  FROM hitter_split_stage
  WHERE batch_id=? AND promoted_at IS NULL
  ORDER BY player_id, split_code
  LIMIT ?`, batchId, limit);

  await run(env.STATS_HITTER_DB, `UPDATE hitter_split_stage
    SET promoted_at=CURRENT_TIMESTAMP,
        certification_status='BASE_HITTER_SPLITS_PROMOTED_FROM_CERTIFIED_STAGE',
        certification_grade='BASE_PASS',
        row_status='promoted_from_certified_stage',
        updated_at=CURRENT_TIMESTAMP
    WHERE stage_id IN (
      SELECT stage_id FROM hitter_split_stage
      WHERE batch_id=? AND promoted_at IS NULL
      ORDER BY player_id, split_code
      LIMIT ?
    )`, batchId, limit);
}

async function runCertifiedStagePromotion(env, input) {
  const started = Date.now();
  const schema = await ensureSchema(env);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const requestedBatchId = inputJson.batch_id || input.batch_id || null;
  const chunkSize = cap(inputJson.promotion_chunk_size || inputJson.chunk_size || 250, 25, 500);
  const requestId = input.request_id || rid("request_base_hitter_splits_promote");
  const runId = input.run_id || rid("run_hitter_splits_promote");

  const batch = await getCertifiedStageForPromotion(env, requestedBatchId);
  if (!batch) {
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "BLOCKED_NO_CERTIFIED_STAGE_BATCH",
      certification: "BASE_HITTER_SPLITS_PROMOTION_BLOCKED_NO_CERTIFIED_STAGE",
      certification_grade: "BLOCKED",
      mode: "base_promotion_microphase",
      rows_read: 0,
      rows_written: 0,
      rows_promoted: 0,
      external_calls_performed: 0,
      schema,
      note: "Promotion requires the certified v0.2.0 stage-only batch. No mining was attempted. Delta remains blocked."
    };
  }

  const batchId = batch.batch_id;
  const expectedRows = asInt(batch.rows_staged, 0);
  const expectedUniverse = asInt(batch.expected_hitter_universe_count, 0);
  const truthBefore = await aggregateBatchTruth(env, batchId);
  const liveBeforeRow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits WHERE batch_id=?", batchId);
  const stageBeforeRow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_split_stage WHERE batch_id=?", batchId);
  const unpromotedBeforeRow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_split_stage WHERE batch_id=? AND promoted_at IS NULL", batchId);
  const liveBefore = asInt(liveBeforeRow && liveBeforeRow.c, 0);
  const stageBefore = asInt(stageBeforeRow && stageBeforeRow.c, 0);
  const unpromotedBefore = asInt(unpromotedBeforeRow && unpromotedBeforeRow.c, 0);

  const prechecks = {
    certified_stage_batch_id: batchId,
    expected_hitter_universe_count: expectedUniverse,
    expected_stage_rows: expectedRows,
    stage_rows_before: stageBefore,
    unpromoted_stage_rows_before: unpromotedBefore,
    live_rows_before: liveBefore,
    outcome_rows: truthBefore.outcomes,
    outcome_rows_match_expected: truthBefore.outcomes === expectedUniverse,
    source_error_count: truthBefore.source_errors,
    repair_required_count: truthBefore.repair_required,
    unclear_count: truthBefore.unclear,
    duplicate_stage_keys: truthBefore.duplicate_stage_keys,
    duplicate_outcome_rows: truthBefore.duplicate_outcome_rows,
    missing_player_id: truthBefore.missing_player_id,
    missing_season: truthBefore.missing_season,
    missing_group_type: truthBefore.missing_group_type,
    missing_split_code: truthBefore.missing_split_code,
    bad_group_type: truthBefore.bad_group_type,
    invalid_split_code: truthBefore.invalid_split_code,
    missing_raw_json: truthBefore.missing_raw_json,
    missing_lineage: truthBefore.missing_lineage,
    source_snapshot_date: batch.source_snapshot_date,
    no_mlb_calls: true,
    no_remine: true,
    no_delta_update: true
  };

  const precheckPass = expectedRows > 0 && stageBefore === expectedRows && prechecks.outcome_rows_match_expected && prechecks.source_error_count === 0 && prechecks.repair_required_count === 0 && prechecks.unclear_count === 0 && prechecks.duplicate_stage_keys === 0 && prechecks.duplicate_outcome_rows === 0 && prechecks.missing_player_id === 0 && prechecks.missing_season === 0 && prechecks.missing_group_type === 0 && prechecks.missing_split_code === 0 && prechecks.bad_group_type === 0 && prechecks.invalid_split_code === 0 && prechecks.missing_raw_json === 0 && prechecks.missing_lineage === 0;

  if (!precheckPass && !(stageBefore === 0 && liveBefore === expectedRows && expectedRows > 0)) {
    await run(env.STATS_HITTER_DB, `UPDATE hitter_split_batches SET status='BASE_PROMOTION_BLOCKED_PRECHECK_FAILED', certification_status='BASE_HITTER_SPLITS_PROMOTION_BLOCKED_PRECHECK_FAILED', certification_grade='BLOCKED', certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, safeJson(prechecks), batchId);
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "BASE_PROMOTION_BLOCKED_PRECHECK_FAILED",
      certification: "BASE_HITTER_SPLITS_PROMOTION_BLOCKED_PRECHECK_FAILED",
      certification_grade: "BLOCKED",
      mode: "base_promotion_microphase",
      batch_id: batchId,
      rows_read: 0,
      rows_written: 1,
      rows_promoted: liveBefore,
      external_calls_performed: 0,
      prechecks,
      schema,
      note: "Promotion blocked before live mutation. Review prechecks."
    };
  }

  let promotedThisTick = 0;
  if (unpromotedBefore > 0) {
    promotedThisTick = Math.min(chunkSize, unpromotedBefore);
    await promoteCertifiedStageChunk(env, batchId, promotedThisTick);
  }

  const liveAfterRow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits WHERE batch_id=?", batchId);
  const unpromotedAfterRow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_split_stage WHERE batch_id=? AND promoted_at IS NULL", batchId);
  const stageAfterRow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_split_stage WHERE batch_id=?", batchId);
  const liveAfter = asInt(liveAfterRow && liveAfterRow.c, 0);
  const unpromotedAfter = asInt(unpromotedAfterRow && unpromotedAfterRow.c, 0);
  const stageAfter = asInt(stageAfterRow && stageAfterRow.c, 0);

  const partial = unpromotedAfter > 0 || liveAfter < expectedRows;
  if (partial) {
    await run(env.STATS_HITTER_DB, `UPDATE hitter_split_batches SET status='BASE_PROMOTION_PARTIAL_CONTINUE', rows_promoted=?, certification_status='BASE_HITTER_SPLITS_PROMOTION_PARTIAL_CONTINUE', certification_grade='PARTIAL', certification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, liveAfter, safeJson({ ...prechecks, live_rows_after: liveAfter, stage_rows_after: stageAfter, unpromoted_stage_rows_after: unpromotedAfter, promoted_this_tick: promotedThisTick }), batchId);
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
      VALUES (?, ?, ?, 'base_promotion_microphase', 'BASE_PROMOTION_PARTIAL_CONTINUE', ?, ?, NULL, ?, ?, ?, 0, CURRENT_TIMESTAMP, NULL, ?, CURRENT_TIMESTAMP)`, PROMOTION_CURSOR_KEY, batchId, runId, SOURCE_SEASON, batch.source_snapshot_date, liveAfter, expectedRows, liveAfter, safeJson({ live_rows_after: liveAfter, unpromoted_stage_rows_after: unpromotedAfter, chunk_size: chunkSize }));
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "partial_continue_base_hitter_splits_promotion",
      certification: "BASE_HITTER_SPLITS_PROMOTION_PARTIAL_CONTINUE",
      certification_grade: "PARTIAL",
      mode: "base_promotion_microphase",
      batch_id: batchId,
      run_id: runId,
      rows_read: promotedThisTick,
      rows_written: promotedThisTick + 2,
      rows_promoted: liveAfter,
      promoted_this_tick: promotedThisTick,
      stage_rows_after: stageAfter,
      unpromoted_stage_rows_after: unpromotedAfter,
      live_rows_before: liveBefore,
      live_rows_after: liveAfter,
      external_calls_performed: 0,
      continuation_required: true,
      orchestrator_should_self_continue: true,
      elapsed_ms: Date.now() - started,
      prechecks,
      hard_blocks_confirmed: { no_new_mlb_calls: true, no_remine: true, no_delta_update: true, no_hitter_game_log_mutation: true, no_pitcher_mutation: true, no_market_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true }
    };
  }

  const duplicateLive = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (
    SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM hitter_splits WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1
  )`, batchId);
  const badLive = await first(env.STATS_HITTER_DB, `SELECT
    SUM(CASE WHEN player_id IS NULL THEN 1 ELSE 0 END) AS missing_player_id,
    SUM(CASE WHEN season IS NULL THEN 1 ELSE 0 END) AS missing_season,
    SUM(CASE WHEN group_type IS NULL OR group_type='' THEN 1 ELSE 0 END) AS missing_group_type,
    SUM(CASE WHEN split_code IS NULL OR split_code='' THEN 1 ELSE 0 END) AS missing_split_code,
    SUM(CASE WHEN group_type!='hitting' THEN 1 ELSE 0 END) AS bad_group_type,
    SUM(CASE WHEN split_code NOT IN ('vs_left','vs_right') THEN 1 ELSE 0 END) AS invalid_split_code,
    SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS missing_raw_json,
    SUM(CASE WHEN batch_id IS NULL OR run_id IS NULL OR source_endpoint IS NULL OR source_snapshot_date IS NULL THEN 1 ELSE 0 END) AS missing_lineage
    FROM hitter_splits WHERE batch_id=?`, batchId);

  const finalChecks = {
    ...prechecks,
    promoted_this_tick: promotedThisTick,
    live_rows_after: liveAfter,
    live_rows_match_stage_rows: liveAfter === expectedRows,
    unpromoted_stage_rows_after: unpromotedAfter,
    duplicate_live_keys: asInt(duplicateLive && duplicateLive.c, 0),
    live_missing_player_id: asInt(badLive && badLive.missing_player_id, 0),
    live_missing_season: asInt(badLive && badLive.missing_season, 0),
    live_missing_group_type: asInt(badLive && badLive.missing_group_type, 0),
    live_missing_split_code: asInt(badLive && badLive.missing_split_code, 0),
    live_bad_group_type: asInt(badLive && badLive.bad_group_type, 0),
    live_invalid_split_code: asInt(badLive && badLive.invalid_split_code, 0),
    live_missing_raw_json: asInt(badLive && badLive.missing_raw_json, 0),
    live_missing_lineage: asInt(badLive && badLive.missing_lineage, 0),
    no_new_mlb_calls: true,
    no_delta_update: true
  };

  const finalPass = finalChecks.live_rows_match_stage_rows && finalChecks.unpromoted_stage_rows_after === 0 && finalChecks.duplicate_live_keys === 0 && finalChecks.live_missing_player_id === 0 && finalChecks.live_missing_season === 0 && finalChecks.live_missing_group_type === 0 && finalChecks.live_missing_split_code === 0 && finalChecks.live_bad_group_type === 0 && finalChecks.live_invalid_split_code === 0 && finalChecks.live_missing_raw_json === 0 && finalChecks.live_missing_lineage === 0;
  const certification = finalPass ? "BASE_HITTER_SPLITS_BASE_BACKFILL_CERTIFIED_PROMOTED_CLEANED" : "BASE_HITTER_SPLITS_PROMOTION_REVIEW_REQUIRED";
  const grade = finalPass ? "BASE_PASS" : "PROMOTION_REVIEW";
  const status = finalPass ? "COMPLETED_PROMOTED_CLEANED" : "BASE_PROMOTION_REVIEW_REQUIRED";

  let stageRowsAfterClean = stageAfter;
  if (finalPass) {
    await run(env.STATS_HITTER_DB, "DELETE FROM hitter_split_stage WHERE batch_id=?", batchId);
    const stageCleanRow = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_split_stage WHERE batch_id=?", batchId);
    stageRowsAfterClean = asInt(stageCleanRow && stageCleanRow.c, 0);
    finalChecks.stage_rows_after_clean = stageRowsAfterClean;
  }

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_certifications (
    certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date
  ) VALUES (?, ?, ?, 'base_promotion_microphase', ?, ?, ?, ?, ?, ?, ?, ?, ?)`, `${batchId}_promotion_cert`, batchId, runId, certification, grade, safeJson(finalChecks), expectedRows, liveAfter, finalChecks.duplicate_live_keys, truthBefore.no_data_players, truthBefore.source_errors, batch.source_snapshot_date);

  await run(env.STATS_HITTER_DB, `UPDATE hitter_split_batches SET status=?, certification_status=?, certification_grade=?, certification_json=?, rows_promoted=?, promoted_at=CURRENT_TIMESTAMP, cleaned_at=${finalPass ? 'CURRENT_TIMESTAMP' : 'cleaned_at'}, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, status, certification, grade, safeJson(finalChecks), liveAfter, batchId);
  await run(env.STATS_HITTER_DB, `UPDATE hitter_split_cursor SET status=?, current_player_offset=?, players_total=?, players_processed=?, requests_done=0, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?`, status, liveAfter, expectedRows, liveAfter, PROMOTION_CURSOR_KEY);

  return {
    ok: true,
    data_ok: finalPass,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    status,
    certification,
    certification_grade: grade,
    mode: "base_promotion_microphase",
    batch_id: batchId,
    run_id: runId,
    source_snapshot_date: batch.source_snapshot_date,
    expected_hitter_universe_count: expectedUniverse,
    rows_read: promotedThisTick,
    rows_written: promotedThisTick + 4 + (finalPass ? stageAfter : 0),
    rows_staged_before_clean: expectedRows,
    rows_promoted: liveAfter,
    promoted_this_tick: promotedThisTick,
    live_rows_before: liveBefore,
    live_rows_after: liveAfter,
    stage_rows_after_clean: stageRowsAfterClean,
    external_calls_performed: 0,
    continuation_required: false,
    orchestrator_should_self_continue: false,
    elapsed_ms: Date.now() - started,
    checks: finalChecks,
    hard_blocks_confirmed: { no_new_mlb_calls: true, no_remine: true, no_delta_update: true, no_hitter_game_log_mutation: true, no_pitcher_mutation: true, no_market_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true },
    next_phase_gate: finalPass ? "Delta/update design can be audited next using hitter/pitcher game-log retained-stage restore/no-op/scoped-update principles, but do not enable delta blindly." : "Stop and review promotion verification."
  };
}



async function getLatestCompletedBaseBatch(env) {
  return await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_split_batches
    WHERE status='COMPLETED_PROMOTED_CLEANED'
      AND certification_status='BASE_HITTER_SPLITS_BASE_BACKFILL_CERTIFIED_PROMOTED_CLEANED'
      AND certification_grade='BASE_PASS'
      AND rows_promoted > 0
    ORDER BY datetime(promoted_at) DESC, datetime(updated_at) DESC
    LIMIT 1`);
}

async function liveSplitQuality(env, batchId) {
  const live = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits WHERE batch_id=?", batchId);
  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (
    SELECT player_id, season, group_type, split_code, COUNT(*) AS n
    FROM hitter_splits
    WHERE batch_id=?
    GROUP BY player_id, season, group_type, split_code
    HAVING n>1
  )`, batchId);
  const bad = await first(env.STATS_HITTER_DB, `SELECT
    SUM(CASE WHEN player_id IS NULL THEN 1 ELSE 0 END) AS missing_player_id,
    SUM(CASE WHEN season IS NULL THEN 1 ELSE 0 END) AS missing_season,
    SUM(CASE WHEN group_type IS NULL OR group_type='' THEN 1 ELSE 0 END) AS missing_group_type,
    SUM(CASE WHEN split_code IS NULL OR split_code='' THEN 1 ELSE 0 END) AS missing_split_code,
    SUM(CASE WHEN group_type!='hitting' THEN 1 ELSE 0 END) AS bad_group_type,
    SUM(CASE WHEN split_code NOT IN ('vs_left','vs_right') THEN 1 ELSE 0 END) AS invalid_split_code,
    SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS missing_raw_json,
    SUM(CASE WHEN batch_id IS NULL OR run_id IS NULL OR source_endpoint IS NULL OR source_snapshot_date IS NULL THEN 1 ELSE 0 END) AS missing_lineage
    FROM hitter_splits WHERE batch_id=?`, batchId);
  const splitRows = await all(env.STATS_HITTER_DB, "SELECT split_code, COUNT(*) AS rows FROM hitter_splits WHERE batch_id=? GROUP BY split_code ORDER BY split_code", batchId);
  return {
    live_rows: asInt(live && live.c, 0),
    duplicate_live_keys: asInt(dup && dup.c, 0),
    missing_player_id: asInt(bad && bad.missing_player_id, 0),
    missing_season: asInt(bad && bad.missing_season, 0),
    missing_group_type: asInt(bad && bad.missing_group_type, 0),
    missing_split_code: asInt(bad && bad.missing_split_code, 0),
    bad_group_type: asInt(bad && bad.bad_group_type, 0),
    invalid_split_code: asInt(bad && bad.invalid_split_code, 0),
    missing_raw_json: asInt(bad && bad.missing_raw_json, 0),
    missing_lineage: asInt(bad && bad.missing_lineage, 0),
    split_rows: splitRows
  };
}


function hitterLivePayloadFromRow(r) {
  return {
    player_id: asInt(r.player_id, 0), player_name: r.player_name || null, season: asInt(r.season, SOURCE_SEASON),
    group_type: r.group_type || GROUP_TYPE, split_code: r.split_code || r.split_key, split_source_code: r.split_source_code || null,
    split_description: r.split_description || null, pa: r.pa === null || r.pa === undefined ? null : asInt(r.pa, null),
    ab: r.ab === null || r.ab === undefined ? null : asInt(r.ab, null), hits: r.hits === null || r.hits === undefined ? null : asInt(r.hits, null),
    singles: r.singles === null || r.singles === undefined ? null : asInt(r.singles, null), doubles: r.doubles === null || r.doubles === undefined ? null : asInt(r.doubles, null),
    triples: r.triples === null || r.triples === undefined ? null : asInt(r.triples, null), home_runs: r.home_runs === null || r.home_runs === undefined ? null : asInt(r.home_runs, null),
    runs: r.runs === null || r.runs === undefined ? null : asInt(r.runs, null), rbi: r.rbi === null || r.rbi === undefined ? null : asInt(r.rbi, null),
    walks: r.walks === null || r.walks === undefined ? null : asInt(r.walks, null), strikeouts: r.strikeouts === null || r.strikeouts === undefined ? null : asInt(r.strikeouts, null),
    stolen_bases: r.stolen_bases === null || r.stolen_bases === undefined ? null : asInt(r.stolen_bases, null), total_bases: r.total_bases === null || r.total_bases === undefined ? null : asInt(r.total_bases, null),
    avg: r.avg || null, obp: r.obp || null, slg: r.slg || null, ops: r.ops || null, babip: r.babip || null,
    raw_json: r.raw_json || '{}', stat_shape_json: r.stat_shape_json || null, data_feed_key: r.data_feed_key || DATA_FEED_KEY,
    source_key: r.source_key || SOURCE_KEY, source_endpoint: r.source_endpoint || `https://statsapi.mlb.com/api/v1/people/${r.player_id}/stats?stats=statSplits&group=hitting&season=${r.season || SOURCE_SEASON}&sitCodes=vl%2Cvr`,
    source_season: asInt(r.source_season, r.season || SOURCE_SEASON), source_game_type: r.source_game_type || null, source_snapshot_date: r.source_snapshot_date || todayUtc(),
    ingestion_mode: r.ingestion_mode || 'delta_repair_registry', batch_id: r.batch_id, run_id: r.run_id || null,
    certification_status: r.certification_status || 'DELTA_HITTER_SPLITS_REPAIR_PROMOTED', certification_grade: r.certification_grade || 'DELTA_REPAIR_PASS', created_at: r.created_at || null
  };
}

async function upsertHitterSplitLiveRow(env, row, reason) {
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_splits (
    player_id,season,split_key,split_description,pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,
    avg,obp,slg,ops,raw_json,source_key,source_confidence,updated_at,group_type,split_code,split_source_code,data_feed_key,source_endpoint,source_season,
    source_game_type,ingestion_mode,batch_id,run_id,certification_status,certification_grade,certified_at,promoted_at,created_at,source_snapshot_date,babip,stat_shape_json
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,COALESCE(?,CURRENT_TIMESTAMP),?,?,?)`,
    row.player_id, row.season, row.split_code, row.split_description, row.pa, row.ab, row.hits, row.singles, row.doubles, row.triples, row.home_runs, row.runs, row.rbi, row.walks, row.strikeouts, row.stolen_bases,
    row.avg, row.obp, row.slg, row.ops, row.raw_json, row.source_key || SOURCE_KEY, reason || row.source_confidence || 'SOURCE_LOCKED_STATSAPI_STATSPLITS_HITTING_SITCODES_VL_VR_REPAIRED',
    row.group_type || GROUP_TYPE, row.split_code, row.split_source_code, row.data_feed_key || DATA_FEED_KEY, row.source_endpoint, row.source_season || row.season || SOURCE_SEASON,
    row.source_game_type || null, row.ingestion_mode || 'delta_repair_upsert', row.batch_id, row.run_id, row.certification_status || 'DELTA_HITTER_SPLITS_REPAIR_PROMOTED', row.certification_grade || 'DELTA_REPAIR_PASS', row.created_at, row.source_snapshot_date || todayUtc(), row.babip, row.stat_shape_json);
}

async function hitterCurrentLiveIntegrity(env, batchId) {
  const live = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS live_rows,
      COUNT(DISTINCT player_id || '|' || season || '|' || group_type || '|' || split_code) AS distinct_live_keys,
      SUM(CASE WHEN split_code NOT IN ('vs_left','vs_right') THEN 1 ELSE 0 END) AS invalid_split_code,
      SUM(CASE WHEN raw_json IS NULL OR raw_json='' THEN 1 ELSE 0 END) AS missing_raw_json,
      SUM(CASE WHEN source_snapshot_date IS NULL THEN 1 ELSE 0 END) AS missing_source_snapshot_date,
      MIN(source_snapshot_date) AS min_source_snapshot_date, MAX(source_snapshot_date) AS max_source_snapshot_date
    FROM hitter_splits WHERE batch_id=?`, batchId);
  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM hitter_splits WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1)`, batchId);
  return { live_rows: asInt(live && live.live_rows, 0), distinct_live_keys: asInt(live && live.distinct_live_keys, 0), duplicate_live_keys: asInt(dup && dup.c, 0), invalid_split_code: asInt(live && live.invalid_split_code, 0), missing_raw_json: asInt(live && live.missing_raw_json, 0), missing_source_snapshot_date: asInt(live && live.missing_source_snapshot_date, 0), min_source_snapshot_date: live && live.min_source_snapshot_date, max_source_snapshot_date: live && live.max_source_snapshot_date };
}

async function latestHitterSplitRepairRegistry(env) { return await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_split_repair_registry WHERE registry_key='hitter_splits_delta_repair_anchor_1' ORDER BY datetime(updated_at) DESC LIMIT 1"); }
async function getHitterSplitRepairCursorKey(env) { const c = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_split_cursor WHERE cursor_key='base_hitter_splits_delta_repair_cursor' ORDER BY datetime(updated_at) DESC LIMIT 1"); if (!c) return null; try { return JSON.parse(c.cursor_json || '{}'); } catch (_) { return null; } }
function hitterRegistryToKey(reg, cursorKey) { if (reg) return { target_batch_id: reg.target_batch_id, player_id: reg.player_id, season: reg.season, group_type: reg.group_type || GROUP_TYPE, split_code: reg.split_code, source_endpoint: reg.source_endpoint, source_snapshot_date: reg.source_snapshot_date }; const k = cursorKey && cursorKey.expected_key ? cursorKey.expected_key : null; return k ? { target_batch_id: k.target_batch_id, player_id: k.player_id, season: k.season, group_type: k.group_type || GROUP_TYPE, split_code: k.split_code, source_endpoint: k.source_endpoint, source_snapshot_date: k.source_snapshot_date || todayUtc() } : null; }
async function hitterSplitRowExistsLive(env, key) { const r = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM hitter_splits WHERE batch_id=? AND player_id=? AND season=? AND group_type=? AND split_code=?`, key.target_batch_id, key.player_id, key.season, key.group_type || GROUP_TYPE, key.split_code); return asInt(r && r.c, 0) > 0; }

async function createHitterSplitRepairAnchorFromLive(env, baseBatch, input, liveChecks) {
  const runId = input.run_id || rid('run_delta_hitter_splits_repair_anchor');
  const row = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_splits WHERE batch_id=? ORDER BY player_id, season, group_type, split_code LIMIT 1`, baseBatch.batch_id);
  if (!row) return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_REPAIR_ANCHOR_BLOCKED_NO_LIVE_ROW', certification: 'DELTA_HITTER_SPLITS_REPAIR_ANCHOR_BLOCKED_NO_LIVE_ROW', certification_grade: 'BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false };
  const payload = hitterLivePayloadFromRow(row);
  const registryKey = 'hitter_splits_delta_repair_anchor_1';
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_repair_registry (registry_key,target_batch_id,source_batch_id,player_id,player_name,season,group_type,split_code,split_source_code,source_endpoint,source_snapshot_date,target_row_json,status,created_by_version,notes,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, registryKey, baseBatch.batch_id, baseBatch.batch_id, payload.player_id, payload.player_name, payload.season, payload.group_type, payload.split_code, payload.split_source_code, payload.source_endpoint, payload.source_snapshot_date, safeJson(payload), 'REPAIR_ANCHOR_RETAINED_FROM_LOCKED_LIVE', VERSION, 'Base Hitter Splits repair anchor. Live-only deletion restores from retained registry; live+registry deletion queues scoped re-fetch only.');
  const checks = { locked_base_batch_id: baseBatch.batch_id, repair_registry_key: registryKey, anchor_player_id: payload.player_id, anchor_split_code: payload.split_code, live_rows: liveChecks.live_rows, distinct_live_keys: liveChecks.distinct_live_keys, no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, repair_anchor_created: true };
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_hitter_splits_delta_repair_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_HITTER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', SOURCE_SEASON, payload.source_snapshot_date || todayUtc(), payload.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 0, null, null, safeJson({ ...checks, expected_key: { target_batch_id: baseBatch.batch_id, player_id: payload.player_id, season: payload.season, group_type: payload.group_type, split_code: payload.split_code, source_endpoint: payload.source_endpoint, source_snapshot_date: payload.source_snapshot_date } }));
  await run(env.STATS_HITTER_DB, `INSERT INTO hitter_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('hitter_splits_repair_anchor_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_HITTER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', 'DELTA_ANCHOR_PASS', safeJson(checks), 0, liveChecks.live_rows, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count, 0), 0, payload.source_snapshot_date || todayUtc());
  return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', certification: 'DELTA_HITTER_SPLITS_REPAIR_ANCHOR_RETAINED_NOOP', certification_grade: 'DELTA_ANCHOR_PASS', rows_read: liveChecks.live_rows, rows_written: 2, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, repair_anchor: checks, timestamp_utc: nowUtc() };
}

async function restoreHitterSplitFromRepairRegistry(env, baseBatch, reg, input) {
  const runId = input.run_id || rid('run_delta_hitter_splits_restore_registry');
  const payload = JSON.parse(reg.target_row_json || '{}'); payload.batch_id = reg.target_batch_id; payload.ingestion_mode = 'delta_repair_restored_from_retained_registry'; payload.certification_status = 'DELTA_HITTER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE'; payload.certification_grade = 'DELTA_REPAIR_PASS';
  await upsertHitterSplitLiveRow(env, payload, 'SOURCE_LOCKED_STATSAPI_STATSPLITS_HITTING_SITCODES_VL_VR_RESTORED_FROM_RETAINED_REPAIR_REGISTRY');
  const liveChecks = await hitterCurrentLiveIntegrity(env, baseBatch.batch_id);
  const checks = { locked_base_batch_id: baseBatch.batch_id, registry_key: reg.registry_key, restored_rows: 1, restored_player_id: reg.player_id, restored_split_code: reg.split_code, live_rows_after: liveChecks.live_rows, distinct_live_keys_after: liveChecks.distinct_live_keys, duplicate_live_keys: liveChecks.duplicate_live_keys, no_mlb_calls: true, no_full_sweep: true, no_new_batch: true, no_stage_writes: true, restored_from_retained_stage_before_queue: true };
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_hitter_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', SOURCE_SEASON, reg.source_snapshot_date || todayUtc(), reg.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 0, null, null, safeJson(checks));
  await run(env.STATS_HITTER_DB, `INSERT INTO hitter_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('hitter_splits_restore_registry_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'HITTER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', 'DELTA_REPAIR_PASS', safeJson(checks), 0, 1, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, reg.source_snapshot_date || todayUtc());
  return { ok: true, data_ok: liveChecks.duplicate_live_keys === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', certification: 'HITTER_SPLITS_REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE', certification_grade: 'DELTA_REPAIR_PASS', restored_rows: 1, queued: false, request_id_created: null, no_mlb_calls: true, no_stage_writes: true, no_full_sweep: true, no_new_batch: true, rows_read: 1, rows_written: 1, rows_promoted: 1, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, delta_restore_gate: checks, timestamp_utc: nowUtc() };
}

async function scopedRemineHitterSplitMissingKey(env, baseBatch, key, input) {
  const runId = input.run_id || rid('run_delta_hitter_splits_scoped_repair');
  const endpoint = endpointFor(env, key.player_id, key.season || SOURCE_SEASON);
  const headers = { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-splits") };
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers }, FETCH_TIMEOUT_MS);
  if (!fetched.ok || !fetched.resp || !fetched.resp.ok) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_SOURCE_FAILED', certification: 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_SOURCE_FAILED', certification_grade: 'BLOCKED', missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, external_calls_performed: 1, no_full_sweep: true, rows_read: 1, rows_written: 0, rows_staged: 0, rows_promoted: 0, error: fetched.error || `HTTP_${fetched.resp && fetched.resp.status}`, continuation_required: false, orchestrator_should_self_continue: false };
  let sourcePayload; try { sourcePayload = JSON.parse(fetched.text || '{}'); } catch (err) { sourcePayload = { parse_error: String(err && err.message ? err.message : err) }; }
  const splits = extractSplits(sourcePayload);
  const player = { player_id: key.player_id, player_name: null };
  const matched = splits.map(split => parseStageRow(split, player, key.season || SOURCE_SEASON, key.target_batch_id, runId, endpoint, key.source_snapshot_date || todayUtc(), 'delta_scoped_repair_retained')).find(row => row.split_code === key.split_code);
  if (!matched) return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_SOURCE_MISSING_EXPECTED_SPLIT', certification: 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_SOURCE_MISSING_EXPECTED_SPLIT', certification_grade: 'BLOCKED', missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, external_calls_performed: 1, no_full_sweep: true, rows_read: 1, rows_written: 0, rows_staged: 0, rows_promoted: 0, expected_key: key, raw_split_count: splits.length, continuation_required: false, orchestrator_should_self_continue: false };
  matched.ingestion_mode = 'delta_scoped_repair_retained'; matched.certification_status = 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED'; matched.certification_grade = 'DELTA_REPAIR_PASS'; matched.source_confidence = 'SOURCE_LOCKED_STATSAPI_STATSPLITS_HITTING_SITCODES_VL_VR_SCOPED_REPAIR'; matched.row_status = 'delta_scoped_repair_retained';
  await insertStageRow(env, matched);
  const livePayload = hitterLivePayloadFromRow(matched); livePayload.certification_status = 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED'; livePayload.certification_grade = 'DELTA_REPAIR_PASS'; livePayload.ingestion_mode = 'delta_scoped_repair_promoted_retained';
  await upsertHitterSplitLiveRow(env, livePayload, 'SOURCE_LOCKED_STATSAPI_STATSPLITS_HITTING_SITCODES_VL_VR_SCOPED_REPAIR');
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_repair_registry (registry_key,target_batch_id,source_batch_id,player_id,player_name,season,group_type,split_code,split_source_code,source_endpoint,source_snapshot_date,target_row_json,status,created_by_version,notes,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, 'hitter_splits_delta_repair_anchor_1', key.target_batch_id, key.target_batch_id, livePayload.player_id, livePayload.player_name, livePayload.season, livePayload.group_type, livePayload.split_code, livePayload.split_source_code, livePayload.source_endpoint, livePayload.source_snapshot_date, safeJson(livePayload), 'REPAIR_ANCHOR_RETAINED_FROM_SCOPED_REPAIR', VERSION, 'Recreated by scoped repair; future live-only deletion restores without MLB calls.');
  const liveChecks = await hitterCurrentLiveIntegrity(env, baseBatch.batch_id);
  const checks = { locked_base_batch_id: baseBatch.batch_id, missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, scoped_expected_split_key: key, external_calls_performed: 1, no_full_sweep: true, rows_staged: 1, rows_promoted: 1, live_rows_after: liveChecks.live_rows, distinct_live_keys_after: liveChecks.distinct_live_keys, duplicate_live_keys: liveChecks.duplicate_live_keys, stage_retained_for_repair: true, repair_ok: true, repair_error: null };
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_hitter_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_COMPLETED', SOURCE_SEASON, key.source_snapshot_date || todayUtc(), key.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 1, null, null, safeJson(checks));
  await run(env.STATS_HITTER_DB, `INSERT INTO hitter_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('hitter_splits_scoped_repair_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED', 'DELTA_REPAIR_PASS', safeJson(checks), 1, 1, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, key.source_snapshot_date || todayUtc());
  return { ok: true, data_ok: liveChecks.duplicate_live_keys === 0, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_COMPLETED', certification: 'DELTA_HITTER_SPLITS_SCOPED_REPAIR_CERTIFIED_PROMOTED_RETAINED', certification_grade: 'DELTA_REPAIR_PASS', missing_live_rows_detected: 1, retained_restore_rows_available: 0, scoped_players_to_refetch: 1, external_calls_performed: 1, no_full_sweep: true, rows_read: 1, rows_written: 2, rows_staged: 1, rows_promoted: 1, continuation_required: false, orchestrator_should_self_continue: false, scoped_repair: checks, timestamp_utc: nowUtc() };
}


function dateOnlyUtc(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function addDays(dateStr, days) {
  const d = new Date(String(dateStr) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function isFinalMlbGame(game) {
  const status = game && game.status ? game.status : {};
  const abstractState = String(status.abstractGameState || "").toLowerCase();
  const detailed = String(status.detailedState || "").toLowerCase();
  const coded = String(status.codedGameState || "").toUpperCase();
  return abstractState === "final" || coded === "F" || detailed === "final" || detailed === "game over" || detailed === "completed early";
}
function isNonDataScheduleGame(game) {
  const status = game && game.status ? game.status : {};
  const detailed = String(status.detailedState || "").toLowerCase();
  const abstractState = String(status.abstractGameState || "").toLowerCase();
  const coded = String(status.codedGameState || "").toUpperCase();
  return coded === "C" || abstractState === "cancelled" || detailed.includes("postponed") || detailed.includes("cancelled") || detailed.includes("canceled") || detailed.includes("suspended");
}
async function fetchLatestCompleteGameDate(env, startDate) {
  const start = dateOnlyUtc(startDate) || todayUtc();
  const today = todayUtc();
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  const endpoint = `${base}/schedule?sportId=1&gameTypes=R&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(today)}`;
  const dateAudits = [];
  try {
    const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-splits") } }, FETCH_TIMEOUT_MS);
    if (!fetched.ok || !fetched.resp || !fetched.resp.ok) return { ok: false, endpoint, error: fetched.error || `HTTP_${fetched.resp && fetched.resp.status}`, today_utc: today, date_audits: dateAudits };
    const body = JSON.parse(fetched.text || "{}");
    let latest = null;
    for (const d of (Array.isArray(body.dates) ? body.dates : [])) {
      const dateStr = dateOnlyUtc(d && d.date);
      const games = Array.isArray(d && d.games) ? d.games : [];
      if (!dateStr || !games.length) continue;
      const regularGames = games.filter(g => !isNonDataScheduleGame(g));
      const finalGames = regularGames.filter(isFinalMlbGame);
      const audit = { date: dateStr, regular_games: regularGames.length, final_games: finalGames.length, non_data_games: games.length - regularGames.length, unfinished_data_games: Math.max(0, regularGames.length - finalGames.length), final_date_discovery_v0_4_3: true };
      dateAudits.push(audit);
      if (regularGames.length > 0 && finalGames.length === regularGames.length && (!latest || dateStr > latest)) latest = dateStr;
    }
    if (!latest) return { ok: false, endpoint, error: "NO_COMPLETE_FINAL_MLB_GAME_DATE_IN_RANGE", today_utc: today, date_audits: dateAudits };
    return { ok: true, endpoint, latest_complete_game_date: latest, today_utc: today, date_audits: dateAudits };
  } catch (err) {
    return { ok: false, endpoint, error: String(err && err.message ? err.message : err), today_utc: today, date_audits: dateAudits };
  }
}
async function readAffectedHitterSplitPlayers(env, afterDate, throughDate) {
  const rows = await all(env.STATS_HITTER_DB, `SELECT player_id, MIN(game_date) AS first_game_date, MAX(game_date) AS last_game_date, COUNT(DISTINCT game_pk) AS games
    FROM hitter_game_logs
    WHERE game_date > ? AND game_date <= ? AND player_id IS NOT NULL
    GROUP BY player_id
    ORDER BY player_id`, afterDate, throughDate);
  return rows.map((r, idx) => ({ player_id: asInt(r.player_id, 0), player_name: null, first_game_date: r.first_game_date, last_game_date: r.last_game_date, games: asInt(r.games, 0), cursor_offset: idx })).filter(p => p.player_id);
}
async function refreshOneAffectedHitterSplitPlayer(env, player, baseBatch, runId, sourceSnapshotDate) {
  const endpoint = endpointFor(env, player.player_id, SOURCE_SEASON);
  const headers = { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-splits") };
  const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers }, FETCH_TIMEOUT_MS);
  if (!fetched.ok || !fetched.resp || !fetched.resp.ok) return { player_id: player.player_id, outcome: "SOURCE_ERROR", rows_staged: 0, rows_promoted: 0, source_error: fetched.error || `HTTP_${fetched.resp && fetched.resp.status}`, external_calls: 1 };
  let sourcePayload;
  try { sourcePayload = JSON.parse(fetched.text || "{}"); }
  catch (err) { return { player_id: player.player_id, outcome: "SOURCE_ERROR", rows_staged: 0, rows_promoted: 0, source_error: `JSON_PARSE_FAILED:${String(err && err.message ? err.message : err)}`, external_calls: 1 }; }
  const splits = extractSplits(sourcePayload);
  if (!splits.length) return { player_id: player.player_id, outcome: "TRUE_NO_DATA", rows_staged: 0, rows_promoted: 0, raw_split_count: 0, external_calls: 1 };
  let rowsStaged = 0;
  let rowsPromoted = 0;
  const promotedSplitCodes = [];
  for (const split of splits) {
    const row = parseStageRow(split, player, SOURCE_SEASON, baseBatch.batch_id, runId, endpoint, sourceSnapshotDate, "delta_daily_affected_player_refresh_retained");
    if (!row.split_code || !["vs_left", "vs_right"].includes(row.split_code)) continue;
    row.ingestion_mode = "delta_daily_affected_player_refresh_retained";
    row.certification_status = "DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH_CERTIFIED_PROMOTED_RETAINED";
    row.certification_grade = "DELTA_REFRESH_PASS";
    row.source_confidence = "SOURCE_LOCKED_STATSAPI_STATSPLITS_HITTING_SITCODES_VL_VR_DAILY_AFFECTED_REFRESH";
    row.row_status = "delta_daily_affected_player_refresh_retained";
    await insertStageRow(env, row);
    rowsStaged++;
    const livePayload = hitterLivePayloadFromRow(row);
    livePayload.ingestion_mode = "delta_daily_affected_player_refresh_promoted_retained";
    livePayload.certification_status = "DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH_CERTIFIED_PROMOTED_RETAINED";
    livePayload.certification_grade = "DELTA_REFRESH_PASS";
    await upsertHitterSplitLiveRow(env, livePayload, "SOURCE_LOCKED_STATSAPI_STATSPLITS_HITTING_SITCODES_VL_VR_DAILY_AFFECTED_REFRESH");
    rowsPromoted++;
    promotedSplitCodes.push(row.split_code);
  }
  return { player_id: player.player_id, player_name: player.player_name, outcome: rowsPromoted ? "PROMOTED_ROWS" : "NO_MAPPED_SPLITS", raw_split_count: splits.length, rows_staged: rowsStaged, rows_promoted: rowsPromoted, split_codes: promotedSplitCodes, external_calls: 1 };
}
async function refreshDailyAffectedHitterSplits(env, baseBatch, input, liveChecks, latestCompleteDate) {
  const runId = input.run_id || rid("run_delta_hitter_splits_daily_affected_refresh");
  const cursor = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_split_cursor WHERE cursor_key='base_hitter_splits_daily_affected_refresh_cursor' AND status='PARTIAL_CONTINUE_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH' ORDER BY datetime(updated_at) DESC LIMIT 1");
  let cursorJson = {};
  if (cursor && cursor.cursor_json) { try { cursorJson = JSON.parse(cursor.cursor_json || '{}'); } catch (_) { cursorJson = {}; } }
  const afterDate = dateOnlyUtc(cursorJson.source_snapshot_date_before) || dateOnlyUtc(liveChecks.max_source_snapshot_date) || dateOnlyUtc(baseBatch.source_snapshot_date);
  const throughDate = dateOnlyUtc(cursorJson.latest_complete_game_date) || dateOnlyUtc(latestCompleteDate);
  if (!afterDate || !throughDate || throughDate <= afterDate) return null;
  const affectedPlayers = await readAffectedHitterSplitPlayers(env, afterDate, throughDate);
  if (!affectedPlayers.length) {
    return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: "DELTA_HITTER_SPLITS_DAILY_REFRESH_BLOCKED_NO_AFFECTED_PLAYERS", certification: "DELTA_HITTER_SPLITS_DAILY_REFRESH_BLOCKED_NO_AFFECTED_PLAYERS", certification_grade: "BLOCKED", source_snapshot_date_before: afterDate, latest_complete_game_date: throughDate, rows_read: 0, rows_written: 1, rows_staged: 0, rows_promoted: 0, external_calls_performed: 0, no_full_sweep: true, continuation_required: false, orchestrator_should_self_continue: false, note: "New finalized date exists, but hitter_game_logs has no affected hitter rows for that date. Run Hitter Game Logs delta first, then Hitter Splits delta." };
  }
  const startOffset = cursor && cursor.batch_id === baseBatch.batch_id ? cap(Math.max(
    asInt(cursor.current_player_offset, 0),
    asInt(cursor.players_processed, 0),
    asInt(cursor.requests_done, 0)
  ), 0, affectedPlayers.length) : 0;
  const chunkSize = cap((input.input_json && input.input_json.chunk_size) || DEFAULT_STAGE_CHUNK_SIZE, 1, MAX_STAGE_CHUNK_SIZE);
  const players = affectedPlayers.slice(startOffset, startOffset + chunkSize);
  let rowsStaged = 0, rowsPromoted = 0, externalCalls = 0, sourceErrors = 0, noData = 0;
  const outcomes = [];
  for (const player of players) {
    const out = await refreshOneAffectedHitterSplitPlayer(env, player, baseBatch, runId, throughDate);
    externalCalls += out.external_calls || 0;
    rowsStaged += out.rows_staged || 0;
    rowsPromoted += out.rows_promoted || 0;
    if (out.outcome === "SOURCE_ERROR") sourceErrors++;
    if (out.outcome === "TRUE_NO_DATA") noData++;
    outcomes.push(out);
  }
  const nextOffset = startOffset + players.length;
  const remaining = Math.max(0, affectedPlayers.length - nextOffset);
  const liveAfter = await hitterCurrentLiveIntegrity(env, baseBatch.batch_id);
  const checks = { locked_base_batch_id: baseBatch.batch_id, source_snapshot_date_before: afterDate, latest_complete_game_date: throughDate, affected_player_count: affectedPlayers.length, players_processed_this_tick: players.length, cursor_offset_before: startOffset, cursor_offset_after: nextOffset, rows_staged_this_tick: rowsStaged, rows_promoted_this_tick: rowsPromoted, external_calls_this_tick: externalCalls, no_full_sweep: true, no_full_hitter_universe_refresh: true, source_errors_this_tick: sourceErrors, no_data_this_tick: noData, live_rows_after: liveAfter.live_rows, distinct_live_keys_after: liveAfter.distinct_live_keys, duplicate_live_keys: liveAfter.duplicate_live_keys, invalid_split_code: liveAfter.invalid_split_code, missing_raw_json: liveAfter.missing_raw_json, min_source_snapshot_date_after: liveAfter.min_source_snapshot_date, max_source_snapshot_date_after: liveAfter.max_source_snapshot_date, outcomes };
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_hitter_splits_daily_affected_refresh_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_daily_affected_player_refresh', remaining > 0 ? 'PARTIAL_CONTINUE_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH' : 'COMPLETED_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH', SOURCE_SEASON, throughDate, players.length ? players[players.length - 1].player_id : null, nextOffset, affectedPlayers.length, nextOffset, nextOffset, remaining > 0 ? new Date(Date.now()+1000).toISOString() : null, sourceErrors ? 'SOURCE_ERRORS_IN_TICK' : null, safeJson(checks));
  await run(env.STATS_HITTER_DB, `INSERT INTO hitter_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('hitter_splits_daily_affected_refresh_cert'), baseBatch.batch_id, runId, 'delta_daily_affected_player_refresh', remaining > 0 ? 'DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH_PARTIAL_CONTINUE' : 'DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH_CERTIFIED_PROMOTED_RETAINED', sourceErrors ? 'REVIEW' : (remaining > 0 ? 'PARTIAL' : 'DELTA_REFRESH_PASS'), safeJson(checks), rowsStaged, rowsPromoted, liveAfter.duplicate_live_keys, noData, sourceErrors, throughDate);
  if (remaining === 0) {
    const mainCursorChecks = { ...checks, completed_daily_refresh_updates_main_delta_cursor_v0_4_3: true };
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
      VALUES ('base_hitter_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_daily_affected_player_refresh', 'COMPLETED_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH', SOURCE_SEASON, throughDate, players.length ? players[players.length - 1].player_id : null, nextOffset, liveAfter.live_rows, liveAfter.live_rows, nextOffset, null, sourceErrors ? 'SOURCE_ERRORS_IN_TICK' : null, safeJson(mainCursorChecks));
  }
  const dataOk = sourceErrors === 0 && liveAfter.duplicate_live_keys === 0 && liveAfter.invalid_split_code === 0 && liveAfter.missing_raw_json === 0;
  return { ok: true, data_ok: dataOk, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: remaining > 0 ? 'PARTIAL_CONTINUE_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH' : 'COMPLETED_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH', certification: remaining > 0 ? 'DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH_PARTIAL_CONTINUE' : 'DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH_CERTIFIED_PROMOTED_RETAINED', certification_grade: sourceErrors ? 'REVIEW' : (remaining > 0 ? 'PARTIAL' : 'DELTA_REFRESH_PASS'), source_snapshot_date_before: afterDate, latest_complete_game_date: throughDate, affected_player_count: affectedPlayers.length, cursor_offset_before: startOffset, cursor_offset_after: nextOffset, players_processed_this_tick: players.length, players_remaining: remaining, rows_read: externalCalls, rows_written: rowsStaged + rowsPromoted + 2, rows_staged: rowsStaged, rows_promoted: rowsPromoted, external_calls_performed: externalCalls, no_full_sweep: true, no_full_hitter_universe_refresh: true, continuation_required: remaining > 0, orchestrator_should_self_continue: remaining > 0, daily_affected_refresh: checks, timestamp_utc: nowUtc() };
}


function parseJsonObjectSafe(text) {
  try {
    const obj = JSON.parse(text || '{}');
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

async function reopenIncompleteHitterDailyRefreshIfBadRescue(env, baseBatch, liveChecks, input) {
  const mainCursor = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_split_cursor
    WHERE cursor_key='base_hitter_splits_delta_update_cursor'
      AND status='DELTA_HITTER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT'
      AND mode='delta_noop_current_after_stale_duplicate_rescue'
    ORDER BY datetime(updated_at) DESC LIMIT 1`);
  if (!mainCursor) return null;
  const cj = parseJsonObjectSafe(mainCursor.cursor_json);
  const pendingTotal = asInt(cj.pending_players_total, 0);
  const pendingProcessed = asInt(cj.pending_players_processed, 0);
  const pendingOffset = asInt(cj.pending_cursor_offset, pendingProcessed);
  const pendingThroughDate = dateOnlyUtc(cj.pending_latest_complete_game_date) || dateOnlyUtc(mainCursor.source_snapshot_date);
  const currentCoveredDate = dateOnlyUtc(cj.current_covered_game_date) || dateOnlyUtc(liveChecks.max_source_snapshot_date) || dateOnlyUtc(mainCursor.source_snapshot_date);
  if (!pendingThroughDate || !pendingTotal || pendingProcessed >= pendingTotal) return null;

  const activeDailyCursor = await first(env.STATS_HITTER_DB, `SELECT * FROM hitter_split_cursor
    WHERE cursor_key='base_hitter_splits_daily_affected_refresh_cursor'
      AND status='PARTIAL_CONTINUE_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH'
    ORDER BY datetime(updated_at) DESC LIMIT 1`);
  if (activeDailyCursor) {
    const activeThroughDate = dateOnlyUtc(activeDailyCursor.source_snapshot_date);
    const activeOffset = asInt(activeDailyCursor.current_player_offset, 0);
    const activeProcessed = asInt(activeDailyCursor.players_processed, 0);
    if (activeThroughDate === pendingThroughDate && (activeOffset >= pendingOffset || activeProcessed >= pendingProcessed)) return null;
  }

  const partialCert = await first(env.STATS_HITTER_DB, `SELECT checks_json, source_snapshot_date
    FROM hitter_split_certifications
    WHERE certification_status='DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH_PARTIAL_CONTINUE'
      AND source_snapshot_date=?
    ORDER BY datetime(created_at) DESC LIMIT 1`, pendingThroughDate);
  const pcj = parseJsonObjectSafe(partialCert && partialCert.checks_json);
  const sourceBefore = dateOnlyUtc(pcj.source_snapshot_date_before) || dateOnlyUtc(pcj.min_source_snapshot_date_after) || dateOnlyUtc(baseBatch.source_snapshot_date) || dateOnlyUtc(liveChecks.min_source_snapshot_date);
  if (!sourceBefore || pendingThroughDate <= sourceBefore) return null;

  const runId = input.run_id || rid('run_delta_hitter_splits_reopen_incomplete_daily_refresh');
  const reopenChecks = {
    locked_base_batch_id: baseBatch.batch_id,
    reopened_incomplete_daily_refresh_after_bad_stale_rescue_v0_4_5: true,
    bad_rescue_cursor_status: mainCursor.status,
    bad_rescue_cursor_mode: mainCursor.mode,
    source_snapshot_date_before: sourceBefore,
    latest_complete_game_date: pendingThroughDate,
    current_covered_game_date: currentCoveredDate,
    pending_players_total: pendingTotal,
    pending_players_processed: pendingProcessed,
    resume_cursor_offset: pendingOffset,
    no_full_sweep: true,
    no_full_hitter_universe_refresh: true,
    no_live_mutation: true,
    no_mlb_calls_in_reopen_step: true
  };

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_hitter_splits_daily_affected_refresh_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_daily_affected_player_refresh', 'PARTIAL_CONTINUE_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH', SOURCE_SEASON, pendingThroughDate, null, pendingOffset, pendingTotal, pendingProcessed, pendingProcessed, new Date(Date.now()+1000).toISOString(), null, safeJson(reopenChecks));
  await run(env.STATS_HITTER_DB, `INSERT INTO hitter_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('hitter_splits_reopen_incomplete_daily_refresh_cert'), baseBatch.batch_id, runId, 'delta_daily_affected_player_refresh_reopen', 'DELTA_HITTER_SPLITS_INCOMPLETE_DAILY_REFRESH_REOPENED', 'DELTA_REOPEN_PASS', safeJson(reopenChecks), 0, 0, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, pendingThroughDate);
  return { latest_complete_game_date: pendingThroughDate, checks: reopenChecks };
}

async function runDeltaUpdate(env, input) {
  const schema = await ensureSchema(env);
  const baseBatch = await getLatestCompletedBaseBatch(env);
  if (!baseBatch) return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_BLOCKED_NO_LOCKED_BASE', certification: 'DELTA_HITTER_SPLITS_BLOCKED_NO_LOCKED_BASE', certification_grade: 'BLOCKED', rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, schema };
  const liveChecks = await hitterCurrentLiveIntegrity(env, baseBatch.batch_id);
  const expectedRows = asInt(baseBatch.rows_promoted, 0);
  const baseComplete = liveChecks.live_rows >= expectedRows && liveChecks.distinct_live_keys === liveChecks.live_rows && liveChecks.duplicate_live_keys === 0 && liveChecks.invalid_split_code === 0 && liveChecks.missing_raw_json === 0 && liveChecks.missing_source_snapshot_date === 0;
  const reopenedIncompleteDailyRefresh = await reopenIncompleteHitterDailyRefreshIfBadRescue(env, baseBatch, liveChecks, input);
  if (reopenedIncompleteDailyRefresh) return await refreshDailyAffectedHitterSplits(env, baseBatch, input, liveChecks, reopenedIncompleteDailyRefresh.latest_complete_game_date);
  const pendingDailyCursor = await first(env.STATS_HITTER_DB, "SELECT * FROM hitter_split_cursor WHERE cursor_key='base_hitter_splits_daily_affected_refresh_cursor' AND status='PARTIAL_CONTINUE_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH' ORDER BY datetime(updated_at) DESC LIMIT 1");
  if (baseComplete && pendingDailyCursor) {
    let cj = {}; try { cj = JSON.parse(pendingDailyCursor.cursor_json || '{}'); } catch (_) { cj = {}; }
    const pendingThroughDate = dateOnlyUtc(cj.latest_complete_game_date) || dateOnlyUtc(cj.daily_affected_refresh && cj.daily_affected_refresh.latest_complete_game_date) || dateOnlyUtc(pendingDailyCursor.source_snapshot_date);
    const currentCoveredDate = dateOnlyUtc(liveChecks.max_source_snapshot_date) || dateOnlyUtc(baseBatch.source_snapshot_date);
    const pendingTotal = asInt(pendingDailyCursor.players_total, 0);
    const pendingProcessed = asInt(pendingDailyCursor.players_processed, 0);
    const pendingOffset = asInt(pendingDailyCursor.current_player_offset, 0);
    const pendingDailyRefreshComplete = pendingTotal > 0 && pendingProcessed >= pendingTotal && pendingOffset >= pendingTotal;
    if (pendingDailyRefreshComplete && pendingThroughDate && currentCoveredDate && currentCoveredDate >= pendingThroughDate && liveChecks.duplicate_live_keys === 0 && liveChecks.invalid_split_code === 0 && liveChecks.missing_raw_json === 0) {
      const runId = input.run_id || rid('run_delta_hitter_splits_stale_duplicate_current_rescue');
      const rescueChecks = {
        locked_base_batch_id: baseBatch.batch_id,
        stale_daily_cursor_detected: true,
        stale_duplicate_current_cursor_rescue_v0_4_5: true,
        pending_cursor_status: pendingDailyCursor.status,
        pending_cursor_offset: asInt(pendingDailyCursor.current_player_offset, 0),
        pending_players_total: asInt(pendingDailyCursor.players_total, 0),
        pending_players_processed: asInt(pendingDailyCursor.players_processed, 0),
        pending_latest_complete_game_date: pendingThroughDate,
        current_covered_game_date: currentCoveredDate,
        live_rows: liveChecks.live_rows,
        distinct_live_keys: liveChecks.distinct_live_keys,
        duplicate_live_keys: liveChecks.duplicate_live_keys,
        invalid_split_code: liveChecks.invalid_split_code,
        missing_raw_json: liveChecks.missing_raw_json,
        max_source_snapshot_date: liveChecks.max_source_snapshot_date,
        no_full_sweep: true,
        no_full_hitter_universe_refresh: true,
        no_live_mutation: true,
        no_mlb_calls: true
      };
      await run(env.STATS_HITTER_DB, `UPDATE hitter_split_cursor
        SET status='STALE_DUPLICATE_COMPLETED_BY_MAIN_CURSOR',
            current_player_offset=players_total,
            players_processed=players_total,
            next_run_after=NULL,
            last_error=NULL,
            cursor_json=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE cursor_key='base_hitter_splits_daily_affected_refresh_cursor'
          AND status='PARTIAL_CONTINUE_DELTA_HITTER_SPLITS_DAILY_AFFECTED_REFRESH'`, safeJson(rescueChecks));
      await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
        VALUES ('base_hitter_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_current_after_stale_duplicate_rescue', 'DELTA_HITTER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT', SOURCE_SEASON, currentCoveredDate, null, 0, liveChecks.live_rows, liveChecks.live_rows, 0, null, null, safeJson(rescueChecks));
      await run(env.STATS_HITTER_DB, `INSERT INTO hitter_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('hitter_splits_stale_duplicate_rescue_cert'), baseBatch.batch_id, runId, 'delta_noop_current_after_stale_duplicate_rescue', 'DELTA_HITTER_SPLITS_STALE_DUPLICATE_CURRENT_CURSOR_RESCUED', 'DELTA_NOOP_PASS', safeJson(rescueChecks), 0, liveChecks.live_rows, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, currentCoveredDate);
      return { ok: true, data_ok: true, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT', certification: 'DELTA_HITTER_SPLITS_STALE_DUPLICATE_CURRENT_CURSOR_RESCUED', certification_grade: 'DELTA_NOOP_PASS', rows_read: liveChecks.live_rows, rows_written: 3, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, stale_duplicate_rescue: rescueChecks, timestamp_utc: nowUtc() };
    }
    return await refreshDailyAffectedHitterSplits(env, baseBatch, input, liveChecks, pendingThroughDate || liveChecks.max_source_snapshot_date || todayUtc());
  }
  const latestCompleteCheck = await fetchLatestCompleteGameDate(env, addDays(liveChecks.max_source_snapshot_date || baseBatch.source_snapshot_date || todayUtc(), 1));
  if (baseComplete && latestCompleteCheck.ok && latestCompleteCheck.latest_complete_game_date && latestCompleteCheck.latest_complete_game_date > (liveChecks.max_source_snapshot_date || baseBatch.source_snapshot_date || '0000-00-00')) {
    return await refreshDailyAffectedHitterSplits(env, baseBatch, input, liveChecks, latestCompleteCheck.latest_complete_game_date);
  }
  const registry = await latestHitterSplitRepairRegistry(env);
  const cursorKey = await getHitterSplitRepairCursorKey(env);
  const expectedKey = hitterRegistryToKey(registry, cursorKey);
  if (!expectedKey && baseComplete) return await createHitterSplitRepairAnchorFromLive(env, baseBatch, input, liveChecks);
  if (!expectedKey && !baseComplete) return { ok: true, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_BLOCKED_MISSING_EXPECTED_KEY_REGISTRY', certification: 'DELTA_HITTER_SPLITS_BLOCKED_MISSING_EXPECTED_KEY_REGISTRY', certification_grade: 'BLOCKED', rows_read: liveChecks.live_rows, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, checks: { baseBatch: baseBatch.batch_id, liveChecks, expectedRows, reason: 'Live is incomplete and no retained expected key registry exists; full sweep is disabled by design.' } };
  const exists = await hitterSplitRowExistsLive(env, expectedKey);
  if (exists) {
    const runId = input.run_id || rid('run_delta_hitter_splits_noop_repair_gate');
    const checks = { locked_base_batch_id: baseBatch.batch_id, expected_key: expectedKey, live_rows: liveChecks.live_rows, expected_rows: expectedRows, distinct_live_keys: liveChecks.distinct_live_keys, duplicate_live_keys: liveChecks.duplicate_live_keys, source_snapshot_date_today_utc: todayUtc(), no_mlb_calls: true, no_full_sweep: true, no_live_mutation: true, retained_registry_available: Boolean(registry), does_not_require_balanced_splits: true, does_not_use_outcome_rows_staged_for_physical_truth: true, latest_complete_game_date_check: latestCompleteCheck };
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
      VALUES ('base_hitter_splits_delta_update_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_HITTER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT', SOURCE_SEASON, liveChecks.max_source_snapshot_date || todayUtc(), expectedKey.player_id, 0, liveChecks.live_rows, liveChecks.live_rows, 0, null, null, safeJson(checks));
    await run(env.STATS_HITTER_DB, `INSERT INTO hitter_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid('hitter_splits_delta_noop_repair_gate_cert'), baseBatch.batch_id, runId, 'delta_noop_restore_scoped_repair_gate', 'DELTA_HITTER_SPLITS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT', 'DELTA_NOOP_PASS', safeJson(checks), 0, liveChecks.live_rows, liveChecks.duplicate_live_keys, asInt(baseBatch.source_no_data_count,0), 0, liveChecks.max_source_snapshot_date || todayUtc());
    return { ok: true, data_ok: baseComplete, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, request_id: input.request_id || null, chain_id: input.chain_id || null, status: 'DELTA_HITTER_SPLITS_NOOP_CURRENT_SOURCE_SNAPSHOT', certification: 'DELTA_HITTER_SPLITS_NOOP_LIVE_SOURCE_SNAPSHOT_CURRENT', certification_grade: 'DELTA_NOOP_PASS', rows_read: liveChecks.live_rows, rows_written: 2, rows_promoted: 0, external_calls_performed: 0, continuation_required: false, orchestrator_should_self_continue: false, queued: false, no_full_sweep: true, no_mlb_calls: true, no_live_mutation: true, delta_gate: checks, timestamp_utc: nowUtc() };
  }
  if (registry && registry.target_row_json) return await restoreHitterSplitFromRepairRegistry(env, baseBatch, registry, input);
  return await scopedRemineHitterSplitMissingKey(env, baseBatch, expectedKey, input);
}

async function runBaseBackfillStageOnly(env, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const started = Date.now();
  const sourceSnapshotDate = inputJson.source_snapshot_date || nowUtc().slice(0, 10);
  const chunkSize = cap(inputJson.chunk_size || DEFAULT_STAGE_CHUNK_SIZE, 1, MAX_STAGE_CHUNK_SIZE);
  const schema = await ensureSchema(env);
  const liveBefore = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits");
  const universe = await readHitterUniverse(env);

  if (!universe.ok || universe.expected_count < 100) {
    return {
      ok: false,
      data_ok: false,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "BLOCKED_UNSAFE_HITTER_UNIVERSE",
      certification: "BASE_HITTER_SPLITS_HITTER_UNIVERSE_NOT_SOURCE_PROVEN",
      certification_grade: "BLOCKED",
      mode: "base_backfill_stage_only",
      rows_read: 0,
      rows_written: 0,
      rows_staged: 0,
      rows_promoted: 0,
      external_calls_performed: 0,
      schema,
      hitter_universe_audit: universe,
      note: "v0.3.0 promotion does not remine. Stage-only backfill compatibility route still requires locked hitter game-log outcome universe."
    };
  }

  const batchState = await getOrStartStageOnlyBatch(env, inputJson, universe, sourceSnapshotDate);
  if (batchState.noop_completed) {
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "NOOP_BASE_HITTER_SPLITS_STAGE_ONLY_BATCH_ALREADY_COMPLETE_NO_PROMOTION",
      certification: batchState.completed.certification_status,
      certification_grade: batchState.completed.certification_grade,
      mode: "base_backfill_stage_only",
      batch_id: batchState.completed.batch_id,
      rows_read: 0,
      rows_written: 0,
      rows_staged: asInt(batchState.completed.rows_staged, 0),
      rows_promoted: 0,
      external_calls_performed: 0,
      continuation_required: false,
      orchestrator_should_self_continue: false,
      no_live_promotion: true,
      no_delta_update: true,
      note: "Existing v0.2.0 certified stage-only batch found. No remine, no promotion."
    };
  }

  const batchId = batchState.batch_id;
  const batchRunId = batchState.run_id;
  const startOffset = cap(batchState.cursor_offset || 0, 0, universe.expected_count);
  const players = universe.players.slice(startOffset, startOffset + chunkSize);
  const statusLabel = "base_backfill_stage_only_staged";
  const tickOutcomes = [];
  let externalCalls = 0;
  let rowsStagedThisTick = 0;
  const allSplitsThisTick = [];

  for (const player of players) {
    const result = await processOnePlayer(env, player, SOURCE_SEASON, batchId, batchRunId, sourceSnapshotDate, statusLabel);
    externalCalls++;
    rowsStagedThisTick += result.rows_staged;
    allSplitsThisTick.push(...(result.splits || []));
    tickOutcomes.push({ player_id: result.player_id, player_name: result.player_name, outcome: result.terminal_category, raw_payload_split_count: result.raw_payload_split_count, rows_staged: result.rows_staged, source_error: result.source_error });
  }

  const nextOffset = startOffset + players.length;
  const remaining = Math.max(0, universe.expected_count - nextOffset);
  const truth = await aggregateBatchTruth(env, batchId);
  await writeBatchCounters(env, batchId, truth, { cursor_offset: nextOffset, source_snapshot_assessment: "season_to_date_aggregate_snapshot_likely_no_game_date_fields_observed", certification_json: { partial: true, expected_hitter_universe_count: universe.expected_count, cursor_offset_after: nextOffset, players_remaining: remaining } });
  await run(env.STATS_HITTER_DB, "UPDATE hitter_split_cursor SET status=?, current_player_id=?, current_player_offset=?, players_processed=?, requests_done=?, cursor_json=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?",
    remaining > 0 ? "BASE_BACKFILL_STAGE_ONLY_PARTIAL_CONTINUE" : "FINALIZATION_ONLY",
    players.length ? players[players.length - 1].player_id : null,
    nextOffset,
    nextOffset,
    truth.outcomes,
    safeJson({ expected_hitter_universe_count: universe.expected_count, cursor_offset_after: nextOffset, players_remaining: remaining, chunk_size: chunkSize, source_snapshot_date: sourceSnapshotDate }),
    STAGE_CURSOR_KEY);

  if (remaining > 0) {
    await run(env.STATS_HITTER_DB, "UPDATE hitter_split_batches SET status='BASE_BACKFILL_STAGE_ONLY_PARTIAL_CONTINUE', certification_status='BASE_HITTER_SPLITS_STAGE_ONLY_PARTIAL_CONTINUE', certification_grade='PARTIAL', updated_at=CURRENT_TIMESTAMP WHERE batch_id=?", batchId);
    return {
      ok: true,
      data_ok: true,
      version: VERSION,
      worker_name: WORKER_NAME,
      job_key: JOB_KEY,
      status: "partial_continue_base_hitter_splits",
      certification: "BASE_HITTER_SPLITS_STAGE_ONLY_PARTIAL_CONTINUE",
      certification_grade: "PARTIAL",
      mode: "base_backfill_stage_only",
      batch_id: batchId,
      run_id: batchRunId,
      source_snapshot_date: sourceSnapshotDate,
      expected_hitter_universe_count: universe.expected_count,
      cursor_offset_before: startOffset,
      cursor_offset_after: nextOffset,
      players_processed_this_tick: players.length,
      players_remaining: remaining,
      rows_read: externalCalls,
      rows_written: rowsStagedThisTick + players.length + 2,
      rows_staged_this_tick: rowsStagedThisTick,
      rows_staged: truth.rows_staged,
      rows_promoted: 0,
      live_rows_before: asInt(liveBefore && liveBefore.c, 0),
      live_rows_after: asInt(liveBefore && liveBefore.c, 0),
      external_calls_performed: externalCalls,
      continuation_required: true,
      orchestrator_should_self_continue: true,
      elapsed_ms: Date.now() - started,
      tick_outcomes: tickOutcomes,
      hitter_universe_audit: { ok: universe.ok, source: universe.source, locked_batch_id: universe.locked_batch_id, expected_hitter_universe_count: universe.expected_count, duplicate_count: universe.duplicate_count },
      source_snapshot_assessment: sourceSnapshotAssessment(allSplitsThisTick) || "season_to_date_aggregate_snapshot_likely_no_game_date_fields_observed",
      hard_blocks_confirmed: baseIdentity(env).hard_blocks
    };
  }

  return await finalizeStageOnly(env, batchId, batchRunId, universe, sourceSnapshotDate, liveBefore, started);
}

async function runSourceProbe(env, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const season = asInt(inputJson.source_season || env.ACTIVE_SEASON, SOURCE_SEASON);
  const sampleSize = cap(inputJson.sample_size || DEFAULT_SAMPLE_SIZE, 1, MAX_SAMPLE_SIZE);
  const sourceSnapshotDate = nowUtc().slice(0, 10);
  const requestId = input.request_id || rid("request_base_hitter_splits_probe");
  const runId = input.run_id || rid("run_base_hitter_splits_probe");
  const batchId = inputJson.batch_id || rid("hitter_splits_probe_batch");
  const started = Date.now();

  const schema = await ensureSchema(env);
  const liveBefore = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits");
  await run(env.STATS_HITTER_DB, "DELETE FROM hitter_split_stage WHERE batch_id=?", batchId);
  await run(env.STATS_HITTER_DB, "DELETE FROM hitter_split_outcomes WHERE batch_id=?", batchId);

  const players = (await chooseSampleHitters(env, inputJson)).slice(0, sampleSize);
  const playerSource = players.length ? players[0].source : "none";

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_batches (
    batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_endpoint,source_season,source_game_type,source_snapshot_date,
    cursor_player_id,cursor_season,cursor_offset,cursor_state_json,expected_hitter_universe_count,sample_size,certification_status,certification_grade,source_confidence,notes,updated_at
  ) VALUES (?, ?, ?, ?, 'source_shape_probe', 'SOURCE_SHAPE_PROBE_RUNNING', ?, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?, ?, 'not_certified', 'PROBE_ONLY', 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_PROBE', ?, CURRENT_TIMESTAMP)`,
    batchId, runId, WORKER_NAME, VERSION, DATA_FEED_KEY, SOURCE_KEY, SOURCE_ENDPOINT_PATTERN, season, sourceSnapshotDate, season,
    safeJson({ version: VERSION, request_id: requestId, players, player_source: playerSource, source_endpoint: SOURCE_ENDPOINT_PATTERN, source_snapshot_date: sourceSnapshotDate, no_live_promotion: true, delta_update_blocked: true }),
    players.length, sampleSize,
    "v0.2.0 source-shape probe compatibility route. No live hitter_splits promotion. No full base mining unless mode=base_backfill_stage_only. No delta execution."
  );
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES (?, ?, ?, 'source_shape_probe', 'SOURCE_SHAPE_PROBE_RUNNING', ?, ?, NULL, 0, ?, 0, 0, CURRENT_TIMESTAMP, NULL, ?, CURRENT_TIMESTAMP)`,
    PROBE_CURSOR_KEY, batchId, runId, season, sourceSnapshotDate, players.length, safeJson({ players, player_source: playerSource, source_endpoint: SOURCE_ENDPOINT_PATTERN }));

  let sourceRequestCount = 0, sourceSuccessCount = 0, sourceNoDataCount = 0, sourceErrorCount = 0, rowsStaged = 0;
  const observedIdentifiers = [];
  const observedFields = new Set();
  const perPlayer = [];
  const allSplits = [];

  for (let idx = 0; idx < players.length; idx++) {
    const result = await processOnePlayer(env, { ...players[idx], cursor_offset: idx }, season, batchId, runId, sourceSnapshotDate, "source_shape_probe_staged");
    sourceRequestCount++;
    if (result.terminal_category === "SOURCE_ERROR") sourceErrorCount++;
    else if (result.terminal_category === "TRUE_NO_DATA") sourceNoDataCount++;
    else if (result.terminal_category === "PROMOTED_ROWS") sourceSuccessCount++;
    rowsStaged += result.rows_staged;
    allSplits.push(...(result.splits || []));
    for (const ident of result.split_identifiers || []) observedIdentifiers.push(ident);
    for (const f of result.field_names || []) observedFields.add(f);
    perPlayer.push({ player_id: result.player_id, player_name: result.player_name, http_status: result.http_status, terminal_category: result.terminal_category, raw_payload_split_count: result.raw_payload_split_count, rows_staged: result.rows_staged, source_error: result.source_error });
  }

  const dup = await first(env.STATS_HITTER_DB, `SELECT COUNT(*) AS c FROM (
    SELECT player_id, season, group_type, split_code, COUNT(*) AS n FROM hitter_split_stage WHERE batch_id=? GROUP BY player_id, season, group_type, split_code HAVING n>1
  )`, batchId);
  const liveAfter = await first(env.STATS_HITTER_DB, "SELECT COUNT(*) AS c FROM hitter_splits");
  const splitCodes = Array.from(new Set(observedIdentifiers.map(x => x.split_code))).sort();
  const fields = Array.from(observedFields).sort();
  const snapshotAssessment = sourceSnapshotAssessment(allSplits);
  const certificationPass = players.length > 0 && sourceErrorCount === 0 && asInt(dup && dup.c, 0) === 0 && asInt(liveBefore && liveBefore.c, 0) === asInt(liveAfter && liveAfter.c, 0);
  const certification = certificationPass ? "BASE_HITTER_SPLITS_SOURCE_LOCK_PROBE_CERTIFIED_NO_LIVE_PROMOTION" : "BASE_HITTER_SPLITS_SOURCE_LOCK_PROBE_BLOCKED_REVIEW_REQUIRED";
  const grade = certificationPass ? "PROBE_PASS" : "PROBE_REVIEW";

  const checks = {
    schema_exists: schema.failed === 0,
    routing_expected_job_key: JOB_KEY,
    locked_endpoint_used: SOURCE_ENDPOINT_PATTERN,
    sitCodes_vl_vr_used: true,
    sample_size: players.length,
    hitter_universe_sample_source: playerSource,
    source_requests: sourceRequestCount,
    source_success: sourceSuccessCount,
    true_no_data: sourceNoDataCount,
    source_errors: sourceErrorCount,
    rows_staged: rowsStaged,
    duplicate_stage_keys: asInt(dup && dup.c, 0),
    split_codes_confirmed: splitCodes,
    field_names_confirmed: fields,
    true_no_data_behavior: sourceNoDataCount > 0 ? "observed_clean_http_200_empty_splits" : "not_observed_in_sample; classifier requires HTTP 200 JSON with zero stats[].splits rows before TRUE_NO_DATA",
    source_snapshot_assessment: snapshotAssessment,
    live_hitter_splits_before: asInt(liveBefore && liveBefore.c, 0),
    live_hitter_splits_after: asInt(liveAfter && liveAfter.c, 0),
    no_live_promotion_occurred: asInt(liveBefore && liveBefore.c, 0) === asInt(liveAfter && liveAfter.c, 0),
    delta_update_blocked: true,
    no_hitter_game_log_mutation: true,
    no_pitcher_mutation: true,
    no_market_mutation: true,
    no_scoring_ranking_final_board: true
  };

  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_certifications (
    certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date
  ) VALUES (?, ?, ?, 'source_shape_probe', ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    `${batchId}_cert`, batchId, runId, certification, grade, safeJson(checks), rowsStaged, asInt(dup && dup.c, 0), sourceNoDataCount, sourceErrorCount, sourceSnapshotDate);

  await run(env.STATS_HITTER_DB, `UPDATE hitter_split_batches SET
    status=?, source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, rows_promoted=0,
    duplicate_stage_keys=?, split_identifier_summary_json=?, field_summary_json=?, source_snapshot_assessment=?, certification_status=?, certification_grade=?, certification_json=?,
    finished_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, promoted_at=NULL, cleaned_at=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=?`,
    certificationPass ? "SOURCE_SHAPE_PROBE_COMPLETED_NO_LIVE_PROMOTION" : "SOURCE_SHAPE_PROBE_REVIEW_REQUIRED",
    sourceRequestCount, sourceSuccessCount, sourceNoDataCount, sourceErrorCount, rowsStaged, asInt(dup && dup.c, 0), safeJson(observedIdentifiers), safeJson(fields), snapshotAssessment, certification, grade, safeJson(checks), batchId);
  await run(env.STATS_HITTER_DB, "UPDATE hitter_split_cursor SET status=?, current_player_offset=?, players_processed=?, requests_done=?, updated_at=CURRENT_TIMESTAMP WHERE cursor_key=?",
    certificationPass ? "SOURCE_SHAPE_PROBE_COMPLETED" : "SOURCE_SHAPE_PROBE_REVIEW_REQUIRED", players.length, players.length, sourceRequestCount, PROBE_CURSOR_KEY);

  return {
    ok: true,
    data_ok: certificationPass,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: requestId,
    run_id: runId,
    batch_id: batchId,
    status: certificationPass ? "SOURCE_SHAPE_PROBE_COMPLETED_NO_LIVE_PROMOTION" : "SOURCE_SHAPE_PROBE_REVIEW_REQUIRED",
    certification,
    certification_grade: grade,
    rows_read: sourceRequestCount,
    rows_written: rowsStaged + players.length + 3,
    rows_staged: rowsStaged,
    rows_promoted: 0,
    external_calls_performed: sourceRequestCount,
    elapsed_ms: Date.now() - started,
    source_probe: { endpoint_pattern: SOURCE_ENDPOINT_PATTERN, season, source_snapshot_date: sourceSnapshotDate, hitter_universe_sample_source: playerSource, sample_players: players, per_player: perPlayer, split_identifiers_confirmed: splitCodes, field_names_confirmed: fields, true_no_data_behavior: checks.true_no_data_behavior, source_snapshot_assessment: snapshotAssessment },
    checks,
    schema,
    hard_blocks_confirmed: baseIdentity(env).hard_blocks,
    next_phase_gate: certificationPass ? "v0.2.0 base_backfill stage-only is available by mode=base_backfill_stage_only; do not enable promotion/delta yet." : "Stop and review probe output before any stage-only mining."
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, EXPECTED_SECRETS) }, safe_secret_note: "Secret values are intentionally never printed." });
    if (method === "GET" && path === "/schema") { await ensureSchema(env); return jsonResponse({ ...baseIdentity(env), route: "/schema", schema: await schemaStatus(env) }); }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, schema: await schemaStatus(env), writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const rowInput = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
      const mode = rowInput.mode || input.mode || "base_promotion_microphase";
      if (mode === "delta_update") return jsonResponse(await runDeltaUpdate(env, input));
      if (mode === "base_promotion_microphase" || mode === "base_promote_from_certified_stage" || mode === "promote_certified_stage") return jsonResponse(await runCertifiedStagePromotion(env, input));
      if (mode === "source_shape_probe") return jsonResponse(await runSourceProbe(env, input));
      if (mode === "base_backfill_stage_only" || mode === "base_backfill") return jsonResponse(await runBaseBackfillStageOnly(env, input));
      return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "BLOCKED_UNSUPPORTED_MODE", mode, allowed_modes: ["delta_update", "base_promotion_microphase", "base_promote_from_certified_stage", "base_backfill_stage_only", "source_shape_probe"], rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0 }, 200);
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "GET /schema", "POST /diagnostic", "POST /run"], timestamp_utc: nowUtc() }, 404);
  }
};
