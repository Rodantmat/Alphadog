const WORKER_NAME = "alphadog-v2-base-hitter-splits";
const VERSION = "alphadog-v2-base-hitter-splits-v0.1.0-schema-source-lock-probe";
const JOB_KEY = "base-hitter-splits";

const SOURCE_SEASON = 2026;
const GROUP_TYPE = "hitting";
const INGESTION_MODE = "base_backfill";
const DATA_FEED_KEY = "base_hitter_splits";
const SOURCE_KEY = "mlb_statsapi_people_statSplits_hitting_sitCodes_vl_vr_v0_1_0";
const SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=statSplits&group=hitting&season={season}&sitCodes=vl%2Cvr";
const ACTIVE_CURSOR_KEY = "base_hitter_splits_source_probe_cursor";
const DEFAULT_SAMPLE_SIZE = 3;
const MAX_SAMPLE_SIZE = 5;
const FETCH_TIMEOUT_MS = 7000;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB"];
const EXPECTED_VARS = ["MLB_API_BASE_URL", "ACTIVE_SEASON"];
const EXPECTED_SECRETS = ["MLB_API_USER_AGENT"];

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function asInt(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function asText(v, fallback = null) { if (v === undefined || v === null || String(v).trim() === "") return fallback; return String(v).trim(); }
function safeJson(v) { try { return JSON.stringify(v ?? null); } catch (_) { return JSON.stringify({ stringify_error: true }); } }
function cap(n, min, max) { return Math.max(min, Math.min(max, Number(n || 0))); }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function bindingPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = Boolean(env && env[name]);
  return out;
}
function varPresence(env, names) {
  const out = {};
  for (const name of names) out[name] = !!(env && env[name] !== undefined && env[name] !== null && String(env[name]).length > 0);
  return out;
}
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
    status: "SOURCE_LOCK_PROBE_READY",
    timestamp_utc: nowUtc(),
    phase: "base_hitter_splits_v0_1_0_probe_only",
    source_lock: {
      endpoint_pattern: SOURCE_ENDPOINT_PATTERN,
      source_key: SOURCE_KEY,
      season: SOURCE_SEASON,
      group_type: GROUP_TYPE,
      sitCodes: "vl,vr",
      no_unspecified_split_source: true
    },
    hard_blocks: {
      no_live_promotion: true,
      no_full_base_mining: true,
      no_delta_update_execution: true,
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
    certification_status TEXT DEFAULT 'source_shape_probe_staged',
    certification_grade TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_PROBE',
    certified_at TEXT,
    promoted_at TEXT,
    source_snapshot_date TEXT,
    raw_json TEXT NOT NULL,
    stat_shape_json TEXT,
    row_status TEXT DEFAULT 'source_shape_probe_staged',
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
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_PROBE',
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

  const indexes = [
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

  await exec("record_schema_migration", "INSERT OR REPLACE INTO hitter_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_hitter_splits_v0_1_0_schema_source_lock_probe', ?, CURRENT_TIMESTAMP, 'Base Hitter Splits v0.1.0: additive lifecycle schema, lineage columns, source-lock/probe only, no live promotion, no delta execution')", VERSION);
  return { attempted: results.length, failed: results.filter(r => !r.ok).length, results };
}

async function schemaStatus(env) {
  const tables = await all(env.STATS_HITTER_DB, "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'hitter_split%' OR name='hitter_splits') ORDER BY name");
  const liveCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_splits)");
  const stageCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_split_stage)");
  const batchCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_split_batches)");
  const outcomeCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_split_outcomes)");
  const cursorCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_split_cursor)");
  const certCols = await all(env.STATS_HITTER_DB, "PRAGMA table_info(hitter_split_certifications)");
  return {
    tables: tables.map(r => r.name),
    hitter_splits_columns: liveCols.map(r => r.name),
    hitter_split_stage_columns: stageCols.map(r => r.name),
    hitter_split_batches_columns: batchCols.map(r => r.name),
    hitter_split_outcomes_columns: outcomeCols.map(r => r.name),
    hitter_split_cursor_columns: cursorCols.map(r => r.name),
    hitter_split_certifications_columns: certCols.map(r => r.name)
  };
}

function endpointFor(env, playerId, season) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  return `${base}/people/${encodeURIComponent(playerId)}/stats?stats=statSplits&group=hitting&season=${encodeURIComponent(season)}&sitCodes=vl%2Cvr`;
}

async function chooseSampleHitters(env, inputJson) {
  const explicit = Array.isArray(inputJson.player_ids) ? inputJson.player_ids.map(x => asInt(x, 0)).filter(Boolean).slice(0, MAX_SAMPLE_SIZE) : [];
  if (explicit.length) return explicit.map((player_id, idx) => ({ player_id, player_name: null, cursor_offset: idx, source: "input_json.player_ids" }));

  let rows = [];
  try {
    rows = await all(env.STATS_HITTER_DB, `SELECT player_id, player_name FROM hitter_game_log_player_outcomes
      WHERE batch_id='hitter_base_backfill_batch_mpelpq0t_akyyu3' AND terminal_category='PROMOTED_ROWS'
      ORDER BY player_id LIMIT ?`, DEFAULT_SAMPLE_SIZE);
  } catch (_) { rows = []; }
  if (!rows.length) {
    try {
      rows = await all(env.STATS_HITTER_DB, `SELECT player_id, NULL AS player_name, COUNT(*) AS row_count FROM hitter_game_logs
        WHERE season=? AND COALESCE(group_type,'hitting')='hitting'
        GROUP BY player_id ORDER BY row_count DESC, player_id LIMIT ?`, SOURCE_SEASON, DEFAULT_SAMPLE_SIZE);
    } catch (_) { rows = []; }
  }
  if (!rows.length) {
    try {
      rows = await all(env.REF_DB, `SELECT COALESCE(mlb_player_id, player_id) AS player_id, COALESCE(full_name, player_name) AS player_name
        FROM ref_players
        WHERE COALESCE(active,1)=1 AND COALESCE(mlb_player_id, player_id) IS NOT NULL
          AND UPPER(COALESCE(primary_position, primary_role, '')) NOT IN ('P','SP','RP','LHP','RHP','PITCHER')
        ORDER BY player_id LIMIT ?`, DEFAULT_SAMPLE_SIZE);
    } catch (_) { rows = []; }
  }
  return rows.map((r, idx) => ({ player_id: asInt(r.player_id, 0), player_name: r.player_name || null, cursor_offset: idx, source: rows.length ? "locked_hitter_game_log_outcomes_or_safe_fallback" : "none" })).filter(r => r.player_id).slice(0, DEFAULT_SAMPLE_SIZE);
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
  } finally {
    clearTimeout(timer);
  }
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

function statFields(stat) {
  if (!stat || typeof stat !== "object") return [];
  return Object.keys(stat).sort();
}
function statVal(stat, ...keys) {
  for (const k of keys) {
    if (stat && stat[k] !== undefined && stat[k] !== null && String(stat[k]).trim() !== "") return stat[k];
  }
  return null;
}
function intStat(stat, ...keys) { const v = statVal(stat, ...keys); return v === null ? null : asInt(v, null); }
function textStat(stat, ...keys) { const v = statVal(stat, ...keys); return v === null ? null : String(v); }

function parseStageRow(split, player, season, batchId, runId, endpoint, sourceSnapshotDate) {
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
    certification_status: "source_shape_probe_staged",
    certification_grade: "PROBE_ONLY",
    source_confidence: "SOURCE_LOCKED_STATSAPI_STATSPLITS_SITCODES_VL_VR_PROBE",
    certified_at: null,
    promoted_at: null,
    source_snapshot_date: sourceSnapshotDate,
    raw_json: safeJson(split),
    stat_shape_json: safeJson({ stat_fields: statFields(stat), identifier_evidence: mapped.evidence }),
    row_status: "source_shape_probe_staged",
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
    "v0.1.0 source-shape probe only. No live hitter_splits promotion. No full base mining. No delta execution. Uses locked sitCodes=vl,vr endpoint."
  );
  await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES (?, ?, ?, 'source_shape_probe', 'SOURCE_SHAPE_PROBE_RUNNING', ?, ?, NULL, 0, ?, 0, 0, CURRENT_TIMESTAMP, NULL, ?, CURRENT_TIMESTAMP)`,
    ACTIVE_CURSOR_KEY, batchId, runId, season, sourceSnapshotDate, players.length, safeJson({ players, player_source: playerSource, source_endpoint: SOURCE_ENDPOINT_PATTERN }));

  const headers = { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-base-hitter-splits-probe") };
  let sourceRequestCount = 0, sourceSuccessCount = 0, sourceNoDataCount = 0, sourceErrorCount = 0, rowsStaged = 0;
  const observedIdentifiers = [];
  const observedFields = new Set();
  const perPlayer = [];
  const allSplits = [];

  for (let idx = 0; idx < players.length; idx++) {
    const player = players[idx];
    const endpoint = endpointFor(env, player.player_id, season);
    sourceRequestCount++;
    let terminal = "UNCLEAR";
    let reason = "Probe did not classify cleanly.";
    let sourceError = null;
    let httpStatus = null;
    let splits = [];
    let rowsForPlayer = 0;
    try {
      const fetched = await fetchTextWithTimeout(endpoint, { method: "GET", headers }, FETCH_TIMEOUT_MS);
      if (!fetched.ok) {
        terminal = "SOURCE_ERROR";
        sourceError = fetched.error || "fetch_failed";
        sourceErrorCount++;
      } else {
        httpStatus = fetched.resp.status;
        let payload = null;
        try { payload = JSON.parse(fetched.text || "{}"); } catch (err) { payload = { parse_error: String(err && err.message ? err.message : err), raw_preview: String(fetched.text || "").slice(0, 500) }; }
        if (!fetched.resp.ok || payload.parse_error) {
          terminal = "SOURCE_ERROR";
          sourceError = payload.parse_error || `HTTP_${httpStatus}`;
          sourceErrorCount++;
        } else {
          splits = extractSplits(payload);
          allSplits.push(...splits);
          if (!splits.length) {
            terminal = "TRUE_NO_DATA";
            reason = "HTTP 200 JSON response contained zero stats[].splits rows for locked sitCodes=vl,vr endpoint.";
            sourceNoDataCount++;
          } else {
            for (const split of splits) {
              const stat = split && split.stat ? split.stat : {};
              for (const f of statFields(stat)) observedFields.add(f);
              const mapped = mapSplitCode(split);
              observedIdentifiers.push({ player_id: player.player_id, split_code: mapped.split_code, evidence: mapped.evidence });
              const row = parseStageRow(split, player, season, batchId, runId, endpoint, sourceSnapshotDate);
              await insertStageRow(env, row);
              rowsForPlayer++;
              rowsStaged++;
            }
            terminal = "PROMOTED_ROWS";
            reason = "Source returned split rows and probe staged them only; no live hitter_splits promotion occurred.";
            sourceSuccessCount++;
          }
        }
      }
    } catch (err) {
      terminal = "SOURCE_ERROR";
      sourceError = String(err && err.message ? err.message : err);
      sourceErrorCount++;
    }
    await run(env.STATS_HITTER_DB, `INSERT OR REPLACE INTO hitter_split_outcomes (
      batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,
      terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,certification_grade,updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'player_outcome_probe_recorded', 'PROBE_ONLY', CURRENT_TIMESTAMP)`,
      batchId, runId, player.player_id, player.player_name, idx, endpoint, httpStatus, terminal === "PROMOTED_ROWS" || terminal === "TRUE_NO_DATA" ? 1 : 0, splits.length, rowsForPlayer,
      terminal, reason, sourceError, sourceSnapshotDate, safeJson(observedIdentifiers.filter(x => x.player_id === player.player_id)), safeJson(Array.from(observedFields).sort())
    );
    perPlayer.push({ player_id: player.player_id, player_name: player.player_name, http_status: httpStatus, terminal_category: terminal, raw_payload_split_count: splits.length, rows_staged: rowsForPlayer, source_error: sourceError });
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
    certificationPass ? "SOURCE_SHAPE_PROBE_COMPLETED" : "SOURCE_SHAPE_PROBE_REVIEW_REQUIRED", players.length, players.length, sourceRequestCount, ACTIVE_CURSOR_KEY);

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
    source_probe: {
      endpoint_pattern: SOURCE_ENDPOINT_PATTERN,
      season,
      source_snapshot_date: sourceSnapshotDate,
      hitter_universe_sample_source: playerSource,
      sample_players: players,
      per_player: perPlayer,
      split_identifiers_confirmed: splitCodes,
      field_names_confirmed: fields,
      true_no_data_behavior: checks.true_no_data_behavior,
      source_snapshot_assessment: snapshotAssessment
    },
    checks,
    schema,
    hard_blocks_confirmed: baseIdentity(env).hard_blocks,
    next_phase_gate: certificationPass ? "v0.2.0 base_backfill stage-only can be considered after review; do not enable promotion/delta yet." : "Stop and review probe output before any v0.2.0 work."
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health", checks: { db_bindings: bindingPresence(env, REQUIRED_DB_BINDINGS), vars: varPresence(env, EXPECTED_VARS), secrets_present_only: varPresence(env, EXPECTED_SECRETS) }, safe_secret_note: "Secret values are intentionally never printed." });
    if (method === "GET" && path === "/schema") {
      await ensureSchema(env);
      return jsonResponse({ ...baseIdentity(env), route: "/schema", schema: await schemaStatus(env) });
    }
    if (method === "POST" && path === "/diagnostic") {
      const input = await readJsonSafe(request);
      return jsonResponse({ ...baseIdentity(env), route: "/diagnostic", input_echo_safe: { request_id: input.request_id || null, chain_id: input.chain_id || null, job_key: input.job_key || null, mode: input.mode || null }, schema: await schemaStatus(env), writes_performed: 0, external_calls_performed: 0 });
    }
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      const rowInput = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
      const mode = rowInput.mode || input.mode || "source_shape_probe";
      if (mode === "delta_update") return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "DELTA_UPDATE_BLOCKED_IN_V0_1_0", certification: "BASE_HITTER_SPLITS_DELTA_NOT_PROVEN", rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, note: "v0.1.0 is schema/source-lock probe only. Delta/update remains structurally reserved and blocked." }, 200);
      return jsonResponse(await runSourceProbe(env, input));
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "GET /schema", "POST /diagnostic", "POST /run"], timestamp_utc: nowUtc() }, 404);
  }
};
