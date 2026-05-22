const WORKER_NAME = "alphadog-v2-base-pitcher-splits";
const VERSION = "alphadog-v2-base-pitcher-splits-v0.1.0-schema-source-lock-probe";
const JOB_KEY = "base-pitcher-splits";

const SOURCE_SEASON = 2026;
const GROUP_TYPE = "pitching";
const INGESTION_MODE = "base_backfill_source_shape_probe";
const DATA_FEED_KEY = "base_pitcher_splits";
const SOURCE_KEY = "mlb_statsapi_people_statSplits_pitching_sitCodes_vl_vr_v0_1_0";
const SOURCE_ENDPOINT_PATTERN = "/people/{playerId}/stats?stats=statSplits&group=pitching&season={season}&sitCodes=vl%2Cvr";
const DEFAULT_SAMPLE_SIZE = 3;
const MAX_SAMPLE_SIZE = 5;
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
function capSample(n) { return Math.max(1, Math.min(MAX_SAMPLE_SIZE, asInt(n, DEFAULT_SAMPLE_SIZE))); }

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
    status: "SCHEMA_SOURCE_LOCK_PROBE_READY",
    timestamp_utc: nowUtc(),
    phase: "base_pitcher_splits_v0_1_0_schema_source_lock_probe",
    source_lock: {
      endpoint_pattern: SOURCE_ENDPOINT_PATTERN,
      source_key: SOURCE_KEY,
      season: SOURCE_SEASON,
      group_type: GROUP_TYPE,
      sitCodes: "vl,vr",
      source_probe_only: true,
      no_live_promotion: true,
      no_delta_update_execution: true
    },
    hard_blocks: {
      no_live_pitcher_splits_promotion: true,
      no_full_base_mining: true,
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
    certification_status TEXT DEFAULT 'source_shape_probe_unverified',
    certification_grade TEXT,
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_PROBE_ONLY',
    certified_at TEXT,
    promoted_at TEXT,
    source_snapshot_date TEXT,
    raw_json TEXT NOT NULL,
    stat_shape_json TEXT,
    row_status TEXT DEFAULT 'source_shape_probe_stage_only',
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
    source_confidence TEXT DEFAULT 'SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_PROBE_ONLY',
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

  await exec("record_schema_migration_v0_1_0", "INSERT OR REPLACE INTO pitcher_schema_migrations (migration_key, package_version, applied_at, notes) VALUES ('base_pitcher_splits_v0_1_0_schema_source_lock_probe', ?, CURRENT_TIMESTAMP, 'Additive pitcher split lifecycle schema and lineage-ready live columns; source-shape probe only; no live promotion/full mining/delta execution')", VERSION);
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
  const rows = await all(env.REF_DB, `SELECT DISTINCT r.player_id AS player_id, COALESCE(p.player_name, CAST(r.player_id AS TEXT)) AS player_name, r.team_id AS team_id, r.role AS role, r.source_key AS source_key
    FROM ref_rosters r
    LEFT JOIN ref_players p ON p.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
      AND (lower(COALESCE(r.role,'')) LIKE '%pitch%' OR lower(COALESCE(p.primary_role,'')) LIKE '%pitch%')
    ORDER BY r.player_id`);
  const seen = new Map();
  const duplicates = [];
  for (const r of rows) {
    const id = asInt(r.player_id, 0);
    if (!id) continue;
    if (seen.has(id)) duplicates.push(id);
    else seen.set(id, { player_id: id, player_name: r.player_name || null, team_id: r.team_id || null, role: r.role || null, source_key: r.source_key || null });
  }
  const players = Array.from(seen.values()).sort((a, b) => a.player_id - b.player_id).map((p, idx) => ({ ...p, cursor_offset: idx, universe_source: "REF_DB.ref_rosters.role/ref_players.primary_role" }));
  return { ok: players.length > 0 && duplicates.length === 0, source: "REF_DB.ref_rosters + ref_players", expected_count: players.length, duplicate_count: duplicates.length, duplicate_player_ids: duplicates.slice(0, 20), players };
}

async function chooseSamplePitchers(env, inputJson) {
  const explicit = Array.isArray(inputJson.player_ids) ? inputJson.player_ids.map(x => asInt(x, 0)).filter(Boolean).slice(0, MAX_SAMPLE_SIZE) : [];
  if (explicit.length) return explicit.map((player_id, idx) => ({ player_id, player_name: null, cursor_offset: idx, universe_source: "input_json.player_ids" }));
  const universe = await readPitcherUniverse(env);
  return universe.players.slice(0, capSample(inputJson.sample_size));
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
    source_confidence: "SOURCE_LOCKED_STATSAPI_STATSPLITS_PITCHING_SITCODES_VL_VR_PROBE_ONLY",
    certified_at: null,
    promoted_at: null,
    source_snapshot_date: sourceSnapshotDate,
    raw_json: safeJson(split),
    stat_shape_json: safeJson({ stat_fields: statFields(stat), identifier_evidence: mapped.evidence, mapping_confirmed: mapped.confirmed }),
    row_status: "source_shape_probe_stage_only",
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

async function runProbe(env, input) {
  if (!env.STATS_PITCHER_DB || !env.REF_DB) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "blocked_missing_required_db_binding", certification: "BASE_PITCHER_SPLITS_REQUIRED_DB_BINDING_MISSING", rows_read: 0, rows_written: 0, external_calls_performed: 0 };
  }
  const mode = String(input.mode || input.input_json?.mode || "base_backfill_source_shape_probe");
  if (/delta/i.test(mode)) {
    return { ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "blocked_delta_update_not_enabled", certification: "BASE_PITCHER_SPLITS_DELTA_BLOCKED_UNTIL_BASE_CERTIFIED", rows_read: 0, rows_written: 0, external_calls_performed: 0 };
  }

  const schema = await ensureSchema(env);
  const schemaAfter = await schemaStatus(env);
  const liveBefore = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits");
  const universe = await readPitcherUniverse(env);
  const sample = await chooseSamplePitchers(env, input.input_json || input || {});
  const batchId = rid("pitcher_splits_probe_batch");
  const runId = input.run_id || rid("run_pitcher_splits_probe");
  const sourceSnapshotDate = todayUtc();
  const sourceEndpoint = SOURCE_ENDPOINT_PATTERN;

  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_endpoint,source_season,source_game_type,source_snapshot_date,expected_pitcher_universe_count,sample_size,rows_promoted,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`, batchId, runId, WORKER_NAME, VERSION, INGESTION_MODE, "SOURCE_SHAPE_PROBE_RUNNING", DATA_FEED_KEY, SOURCE_KEY, sourceEndpoint, SOURCE_SEASON, null, sourceSnapshotDate, universe.expected_count || 0, sample.length, "v0.1.0 source-shape probe only; no live promotion/full mining/delta");

  const headers = { "accept": "application/json" };
  if (env.MLB_API_USER_AGENT) headers["user-agent"] = env.MLB_API_USER_AGENT;
  let sourceRequestCount = 0, sourceSuccessCount = 0, sourceNoDataCount = 0, sourceErrorCount = 0, rowsStaged = 0;
  const splitIdentifiers = [];
  const fieldSet = new Set();
  const playerSummaries = [];

  for (const player of sample) {
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
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 0, 0, 0, 0, "SOURCE_ERROR", "source request failed or non-2xx/non-json", oneLine(sourceError || fetched.text), sourceSnapshotDate, "[]", "[]", "probe_only_source_error");
      playerSummaries.push({ player_id: player.player_id, player_name: player.player_name, terminal_category: "SOURCE_ERROR", http_status: httpStatus, error: oneLine(sourceError || fetched.text, 300) });
      continue;
    }
    if (splits.length === 0) {
      sourceNoDataCount += 1;
      await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 1, 0, 0, 0, "TRUE_NO_DATA", "clean 2xx JSON response with zero statSplits rows", null, sourceSnapshotDate, "[]", "[]", "probe_only_true_no_data_observed");
      playerSummaries.push({ player_id: player.player_id, player_name: player.player_name, terminal_category: "TRUE_NO_DATA", http_status: httpStatus, split_count: 0 });
      continue;
    }

    sourceSuccessCount += 1;
    let stagedForPlayer = 0;
    let unclearIdentifier = false;
    for (const split of splits) {
      const stat = split && split.stat ? split.stat : {};
      for (const f of statFields(stat)) { fieldSet.add(f); fieldsThisPlayer.add(f); }
      const mapped = mapSplitCode(split);
      if (!mapped.confirmed) unclearIdentifier = true;
      identifiersThisPlayer.push({ split_code: mapped.split_code, confirmed: mapped.confirmed, evidence: mapped.evidence });
      splitIdentifiers.push({ player_id: player.player_id, split_code: mapped.split_code, confirmed: mapped.confirmed, evidence: mapped.evidence });
      const row = parseStageRow(split, player, SOURCE_SEASON, batchId, runId, endpoint, sourceSnapshotDate, mapped.confirmed ? "source_shape_probe_identifier_confirmed" : "source_shape_probe_identifier_unconfirmed");
      await insertStageRow(env, row);
      stagedForPlayer += 1;
      rowsStaged += 1;
    }
    const category = unclearIdentifier ? "UNCLEAR" : "PROBE_ROWS_STAGED";
    await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_outcomes (batch_id,run_id,player_id,player_name,cursor_offset,source_endpoint,source_http_status,source_ok,raw_payload_split_count,rows_staged,promoted_row_count,terminal_category,category_reason,source_error,source_snapshot_date,split_identifier_json,field_names_json,certification_status,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, player.player_id, player.player_name, player.cursor_offset, endpoint, httpStatus, 1, splits.length, stagedForPlayer, 0, category, category === "UNCLEAR" ? "one or more split identifiers not confirmed by source evidence" : "source-shape probe rows staged only; no live promotion", null, sourceSnapshotDate, safeJson(identifiersThisPlayer), safeJson(Array.from(fieldsThisPlayer).sort()), category === "UNCLEAR" ? "probe_only_identifier_unclear" : "probe_only_identifier_confirmed");
    playerSummaries.push({ player_id: player.player_id, player_name: player.player_name, terminal_category: category, http_status: httpStatus, split_count: splits.length, rows_staged: stagedForPlayer, identifiers: identifiersThisPlayer, field_names: Array.from(fieldsThisPlayer).sort() });
  }

  const dupStage = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT batch_id, player_id, season, group_type, split_code, COUNT(*) AS n FROM pitcher_split_stage WHERE batch_id=? GROUP BY batch_id, player_id, season, group_type, split_code HAVING n>1)`, batchId);
  const dupOutcome = await first(env.STATS_PITCHER_DB, `SELECT COUNT(*) AS c FROM (SELECT batch_id, player_id, COUNT(*) AS n FROM pitcher_split_outcomes WHERE batch_id=? GROUP BY batch_id, player_id HAVING n>1)`, batchId);
  const noDataObserved = sourceNoDataCount > 0;
  const invalidSplitCount = splitIdentifiers.filter(x => !["vs_left", "vs_right"].includes(x.split_code)).length;
  const fields = Array.from(fieldSet).sort();
  const confirmedCodes = Array.from(new Set(splitIdentifiers.filter(x => x.confirmed).map(x => x.split_code))).sort();
  const sourceSnapshotAssessment = "LIKELY_SEASON_TO_DATE_SNAPSHOT_BUT_BASE_PROMOTION_BLOCKED_UNTIL_LARGER_STAGE_VALIDATION";
  const trueNoDataAssessment = noDataObserved ? "TRUE_NO_DATA_OBSERVED_ON_CLEAN_EMPTY_2XX_JSON" : "TRUE_NO_DATA_NOT_OBSERVED_IN_SMALL_SAMPLE";
  const certificationStatus = sourceErrorCount === 0 && invalidSplitCount === 0 && confirmedCodes.includes("vs_left") && confirmedCodes.includes("vs_right") ? "BASE_PITCHER_SPLITS_SOURCE_SHAPE_PROBE_CERTIFIED_NO_PROMOTION" : "BASE_PITCHER_SPLITS_SOURCE_SHAPE_PROBE_REVIEW_REQUIRED_NO_PROMOTION";
  const certificationGrade = certificationStatus.includes("CERTIFIED") ? "PROBE_PASS" : "PROBE_REVIEW";

  const cert = {
    source_probe_only: true,
    no_live_promotion: true,
    no_full_base_mining: true,
    no_delta_update_execution: true,
    expected_pitcher_universe_count: universe.expected_count || 0,
    sample_size: sample.length,
    rows_staged: rowsStaged,
    rows_promoted: 0,
    duplicate_stage_keys: asInt(dupStage && dupStage.c, 0),
    duplicate_outcome_rows: asInt(dupOutcome && dupOutcome.c, 0),
    source_request_count: sourceRequestCount,
    source_success_count: sourceSuccessCount,
    source_no_data_count: sourceNoDataCount,
    source_error_count: sourceErrorCount,
    confirmed_split_codes: confirmedCodes,
    invalid_or_unmapped_split_identifier_count: invalidSplitCount,
    field_names_confirmed_in_sample: fields,
    true_no_data_assessment: trueNoDataAssessment,
    source_snapshot_assessment: sourceSnapshotAssessment,
    live_rows_before: asInt(liveBefore && liveBefore.c, 0)
  };
  await run(env.STATS_PITCHER_DB, `UPDATE pitcher_split_batches SET status=?, source_request_count=?, source_success_count=?, source_no_data_count=?, source_error_count=?, rows_staged=?, rows_promoted=0, duplicate_stage_keys=?, duplicate_outcome_rows=?, split_identifier_summary_json=?, field_summary_json=?, true_no_data_assessment=?, source_snapshot_assessment=?, certification_status=?, certification_grade=?, certification_json=?, finished_at=CURRENT_TIMESTAMP, certified_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,
    "SOURCE_SHAPE_PROBE_COMPLETED_NO_PROMOTION", sourceRequestCount, sourceSuccessCount, sourceNoDataCount, sourceErrorCount, rowsStaged, asInt(dupStage && dupStage.c, 0), asInt(dupOutcome && dupOutcome.c, 0), safeJson(splitIdentifiers), safeJson(fields), trueNoDataAssessment, sourceSnapshotAssessment, certificationStatus, certificationGrade, safeJson(cert), batchId);
  await run(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_split_cursor (cursor_key,batch_id,run_id,mode,status,source_season,source_snapshot_date,current_player_id,current_player_offset,players_total,players_processed,requests_done,next_run_after,last_error,cursor_json,updated_at)
    VALUES ('base_pitcher_splits_source_probe_cursor',?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`, batchId, runId, INGESTION_MODE, "SOURCE_SHAPE_PROBE_COMPLETED_NO_PROMOTION", SOURCE_SEASON, sourceSnapshotDate, sample.length ? sample[sample.length - 1].player_id : null, sample.length, universe.expected_count || 0, sample.length, sourceRequestCount, null, null, safeJson({ sample_player_ids: sample.map(p => p.player_id), finalization_only: false }));
  await run(env.STATS_PITCHER_DB, `INSERT INTO pitcher_split_certifications (certification_id,batch_id,run_id,mode,certification_status,certification_grade,checks_json,rows_staged,rows_promoted,duplicate_count,no_data_count,error_count,source_snapshot_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rid("pitcher_splits_probe_cert"), batchId, runId, INGESTION_MODE, certificationStatus, certificationGrade, safeJson(cert), rowsStaged, 0, asInt(dupStage && dupStage.c, 0), sourceNoDataCount, sourceErrorCount, sourceSnapshotDate);
  const liveAfter = await first(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_splits");

  return {
    ok: true,
    data_ok: certificationGrade === "PROBE_PASS",
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: JOB_KEY,
    request_id: input.request_id || null,
    chain_id: input.chain_id || null,
    status: "SOURCE_SHAPE_PROBE_COMPLETED_NO_PROMOTION",
    certification: certificationStatus,
    certification_grade: certificationGrade,
    rows_read: sample.length,
    rows_written: rowsStaged + 3,
    rows_staged: rowsStaged,
    rows_promoted: 0,
    external_calls_performed: sourceRequestCount,
    continuation_required: false,
    orchestrator_should_self_continue: false,
    source_probe: {
      batch_id: batchId,
      run_id: runId,
      expected_pitcher_universe_count: universe.expected_count || 0,
      universe_source: universe.source,
      duplicate_pitcher_universe_count: universe.duplicate_count || 0,
      sample_size: sample.length,
      sample_player_ids: sample.map(p => p.player_id),
      source_endpoint_pattern: SOURCE_ENDPOINT_PATTERN,
      confirmed_split_codes: confirmedCodes,
      split_identifier_summary: splitIdentifiers,
      field_names_confirmed_in_sample: fields,
      true_no_data_assessment: trueNoDataAssessment,
      source_snapshot_assessment: sourceSnapshotAssessment,
      no_live_promotion_occurred: asInt(liveBefore && liveBefore.c, 0) === asInt(liveAfter && liveAfter.c, 0),
      live_rows_before: asInt(liveBefore && liveBefore.c, 0),
      live_rows_after: asInt(liveAfter && liveAfter.c, 0),
      player_summaries: playerSummaries
    },
    schema,
    schema_after: schemaAfter,
    boundaries: baseIdentity(env).hard_blocks,
    timestamp_utc: nowUtc()
  };
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
      catch (err) { return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: JOB_KEY, status: "SOURCE_SHAPE_PROBE_FAILED", certification: "BASE_PITCHER_SPLITS_SOURCE_SHAPE_PROBE_FAILED", error: String(err && err.message ? err.message : err), rows_read: 0, rows_written: 0, rows_promoted: 0, external_calls_performed: 0, timestamp_utc: nowUtc() }, 500); }
    }
    return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: WORKER_NAME, status: "NOT_FOUND", allowed_routes: ["GET /", "GET /health", "POST /run", "POST /diagnostic"], timestamp_utc: nowUtc() }, 404);
  }
};
