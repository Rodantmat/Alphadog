const WORKER_NAME = "alphadog-v2-base-pitcher-metrics";
const VERSION = "alphadog-v2-base-pitcher-metrics-v0.4.0-snapshot-promote-retained-stage";
const JOB_KEY = "base-pitcher-metrics";

const PROFILE_ID = "pitcher_metrics_neutral_v0_3_0_base_stage";
const FORMULA_VERSION = "pitcher_metrics_formula_v0_3_0_base_stage";
const DATA_FEED_KEY = "derived_pitcher_metrics_v0_3_0_base_stage_only";
const DEFAULT_SEASON = 2026;
const DEFAULT_CHUNK_SIZE = 40;

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "STATS_PITCHER_DB"];
const REQUIRED_SECRETS = ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MAX_TICK_MS", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES"];

const REQUIRED_PITCHER_LOG_COLUMNS = [
  "player_id", "game_pk", "season", "game_date", "team_id", "opponent_team_id", "role", "innings_pitched", "innings_pitched_decimal", "outs_recorded", "batters_faced", "hits_allowed", "runs_allowed", "earned_runs", "walks_allowed", "strikeouts", "home_runs_allowed", "pitches", "strikes", "wins", "losses", "saves", "holds", "blown_saves", "certification_status", "certification_grade", "batch_id", "run_id", "promoted_at"
];

const REQUIRED_PITCHER_SPLIT_COLUMNS = [
  "player_id", "season", "split_key", "split_code", "split_description", "innings_pitched", "innings_pitched_decimal", "outs_recorded", "batters_faced", "hits_allowed", "earned_runs", "walks_allowed", "strikeouts", "home_runs_allowed", "pitches", "strikes", "avg_against", "obp_against", "slg_against", "ops_against", "whip", "era", "source_snapshot_date", "certification_status", "certification_grade", "batch_id", "run_id", "promoted_at"
];

const METRIC_DEFS = [
  { key: "pitcher_v030_games_count", family: "direct_aggregate", source: "pitcher_game_logs", num: "games_count", den: null },
  { key: "pitcher_v030_appearances_count", family: "direct_aggregate", source: "pitcher_game_logs", num: "appearances_count", den: null },
  { key: "pitcher_v030_starts_count", family: "role_readiness", source: "pitcher_game_logs", num: "starts_count", den: null },
  { key: "pitcher_v030_innings_pitched_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "outs_recorded/3", den: null },
  { key: "pitcher_v030_outs_recorded_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "outs_recorded", den: null },
  { key: "pitcher_v030_batters_faced_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "batters_faced", den: null },
  { key: "pitcher_v030_pitches_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "pitches", den: null },
  { key: "pitcher_v030_strikes_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "strikes", den: null },
  { key: "pitcher_v030_hits_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "hits_allowed", den: null },
  { key: "pitcher_v030_runs_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "runs_allowed", den: null },
  { key: "pitcher_v030_earned_runs_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "earned_runs", den: null },
  { key: "pitcher_v030_walks_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "walks_allowed", den: null },
  { key: "pitcher_v030_strikeouts_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "strikeouts", den: null },
  { key: "pitcher_v030_home_runs_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "home_runs_allowed", den: null },
  { key: "pitcher_v030_era_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "earned_runs*27", den: "outs_recorded" },
  { key: "pitcher_v030_whip_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "walks_allowed+hits_allowed", den: "outs_recorded/3" },
  { key: "pitcher_v030_k_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "strikeouts", den: "batters_faced" },
  { key: "pitcher_v030_bb_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "walks_allowed", den: "batters_faced" },
  { key: "pitcher_v030_hr_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "home_runs_allowed", den: "batters_faced" },
  { key: "pitcher_v030_k_minus_bb_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "strikeouts-walks_allowed", den: "batters_faced" },
  { key: "pitcher_v030_pitches_per_out_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "pitches", den: "outs_recorded" },
  { key: "pitcher_v030_strikes_per_pitch_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "strikes", den: "pitches" },
  { key: "pitcher_v030_innings_per_appearance_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "outs_recorded/3", den: "appearances_count" },
  { key: "pitcher_v030_role_sample_bucket", family: "role_readiness", source: "pitcher_game_logs", num: "outs_per_appearance_bucket", den: null },
  { key: "pitcher_v030_split_vs_left_era_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "era", den: null, split: "vs_left" },
  { key: "pitcher_v030_split_vs_left_whip_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "whip", den: null, split: "vs_left" },
  { key: "pitcher_v030_split_vs_left_ops_against_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "ops_against", den: null, split: "vs_left" },
  { key: "pitcher_v030_split_vs_right_era_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "era", den: null, split: "vs_right" },
  { key: "pitcher_v030_split_vs_right_whip_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "whip", den: null, split: "vs_right" },
  { key: "pitcher_v030_split_vs_right_ops_against_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "ops_against", den: null, split: "vs_right" }
];

const METRIC_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS pitcher_metric_schema_migrations (migration_key TEXT PRIMARY KEY, worker_version TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_batches (
    batch_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, worker_name TEXT NOT NULL, worker_version TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
    data_feed_key TEXT NOT NULL, source_key TEXT NOT NULL, source_season INTEGER, input_log_row_count INTEGER DEFAULT 0, input_split_row_count INTEGER DEFAULT 0,
    input_latest_game_date TEXT, input_latest_split_snapshot_date TEXT, expected_pitcher_universe_count INTEGER DEFAULT 0, config_profile_id TEXT,
    formula_version TEXT, metric_catalog_json TEXT, formula_readiness_json TEXT, config_readiness_json TEXT, input_readiness_json TEXT,
    rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0, duplicate_count INTEGER DEFAULT 0, certification_status TEXT DEFAULT 'not_certified',
    certification_grade TEXT, certification_json TEXT, locked_by TEXT, lock_acquired_at TEXT, lock_expires_at TEXT, stale_recovery_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, certified_at TEXT, promoted_at TEXT, cleaned_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_stage (
    stage_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, run_id TEXT NOT NULL, metric_key TEXT NOT NULL, player_id INTEGER NOT NULL, season INTEGER NOT NULL,
    metric_scope TEXT NOT NULL, metric_window TEXT NOT NULL, metric_family TEXT NOT NULL, source_start_date TEXT, source_end_date TEXT, source_snapshot_date TEXT,
    input_log_row_count INTEGER DEFAULT 0, input_split_row_count INTEGER DEFAULT 0, input_latest_game_date TEXT, metric_value REAL, metric_text_value TEXT,
    numerator REAL, denominator REAL, data_feed_key TEXT NOT NULL, source_key TEXT NOT NULL, ingestion_mode TEXT NOT NULL, certification_status TEXT DEFAULT 'base_stage_not_promoted',
    certification_grade TEXT, certified_at TEXT, promoted_at TEXT, formula_version TEXT, config_profile_id TEXT, raw_input_summary_json TEXT, metric_json TEXT,
    missing_data_reason TEXT, reliability_label TEXT, row_status TEXT DEFAULT 'base_stage_staged', row_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(batch_id, metric_key, player_id, season, metric_scope, metric_window))`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_outcomes (outcome_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, run_id TEXT NOT NULL, player_id INTEGER, season INTEGER, metric_family TEXT, metric_window TEXT, terminal_category TEXT NOT NULL, category_reason TEXT, input_log_row_count INTEGER DEFAULT 0, input_split_row_count INTEGER DEFAULT 0, missing_data_reason TEXT, formula_version TEXT, config_profile_id TEXT, outcome_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_cursor (cursor_key TEXT PRIMARY KEY, mode TEXT NOT NULL, status TEXT NOT NULL, batch_id TEXT, run_id TEXT, source_season INTEGER, players_total INTEGER DEFAULT 0, players_processed INTEGER DEFAULT 0, last_player_id INTEGER, last_game_date TEXT, last_split_snapshot_date TEXT, requests_done INTEGER DEFAULT 0, no_external_calls INTEGER DEFAULT 1, cursor_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_certifications (certification_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, run_id TEXT NOT NULL, certification_status TEXT NOT NULL, certification_grade TEXT, rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0, duplicate_count INTEGER DEFAULT 0, input_log_row_count INTEGER DEFAULT 0, input_split_row_count INTEGER DEFAULT 0, validation_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_snapshot_batches (snapshot_batch_id TEXT PRIMARY KEY, source_batch_id TEXT, run_id TEXT NOT NULL, worker_name TEXT NOT NULL, worker_version TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, config_profile_id TEXT, formula_version TEXT, source_rows INTEGER DEFAULT 0, source_players INTEGER DEFAULT 0, snapshot_rows INTEGER DEFAULT 0, snapshot_players INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0, duplicate_count INTEGER DEFAULT 0, certification_status TEXT DEFAULT 'not_promoted', certification_grade TEXT, certification_json TEXT, started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, promoted_at TEXT, cleaned_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_snapshot_stage (snapshot_stage_id TEXT PRIMARY KEY, snapshot_batch_id TEXT NOT NULL, source_batch_id TEXT, run_id TEXT NOT NULL, player_id INTEGER NOT NULL, season INTEGER NOT NULL, metric_window TEXT NOT NULL, config_profile_id TEXT NOT NULL, formula_version TEXT NOT NULL, metrics_json TEXT NOT NULL, input_summary_json TEXT, reliability_json TEXT, review_flags_json TEXT, certification_status TEXT DEFAULT 'not_promoted', certification_grade TEXT, promoted_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(snapshot_batch_id, player_id, season, metric_window, config_profile_id, formula_version))`,
  `CREATE TABLE IF NOT EXISTS pitcher_metric_snapshots (player_id INTEGER NOT NULL, season INTEGER NOT NULL, metric_window TEXT NOT NULL, config_profile_id TEXT NOT NULL, formula_version TEXT NOT NULL, snapshot_batch_id TEXT NOT NULL, source_batch_id TEXT, metrics_json TEXT NOT NULL, input_summary_json TEXT, reliability_json TEXT, review_flags_json TEXT, certification_status TEXT NOT NULL, certification_grade TEXT, promoted_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(player_id, season, metric_window, config_profile_id, formula_version))`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_batches_status ON pitcher_metric_batches(status, mode)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_stage_batch ON pitcher_metric_stage(batch_id, player_id, metric_window)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_stage_key ON pitcher_metric_stage(metric_key, season, metric_scope, metric_window)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_outcomes_batch ON pitcher_metric_outcomes(batch_id, terminal_category)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_snapshot_stage_batch ON pitcher_metric_snapshot_stage(snapshot_batch_id, player_id, metric_window)`,
  `CREATE INDEX IF NOT EXISTS idx_pitcher_metric_snapshots_player ON pitcher_metric_snapshots(player_id, season, metric_window)`,
  `INSERT OR IGNORE INTO pitcher_metric_schema_migrations (migration_key, worker_version, notes) VALUES ('pitcher_metrics_v0_4_0_snapshot_promote_retained_stage', '${VERSION}', 'Pitcher Metrics v0.4.0 promotes retained snapshot stage to live snapshots. Stage retained. No source mutation, no external calls, no scoring.')`
];

const CONFIG_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS config_metric_calibration_profiles (profile_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, sport TEXT NOT NULL DEFAULT 'MLB', metric_domain TEXT NOT NULL, active INTEGER DEFAULT 0, profile_status TEXT DEFAULT 'draft', profile_json TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS config_metric_formula_versions (formula_version TEXT PRIMARY KEY, sport TEXT NOT NULL DEFAULT 'MLB', metric_domain TEXT NOT NULL, active INTEGER DEFAULT 0, version_status TEXT DEFAULT 'readiness_only', formula_catalog_json TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS config_metric_definitions (metric_key TEXT PRIMARY KEY, metric_family TEXT NOT NULL, metric_scope TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT, source_table TEXT, numerator_field TEXT, denominator_field TEXT, formula_version TEXT, enabled INTEGER DEFAULT 1, neutral_metric_only INTEGER DEFAULT 1, future_scoring_bridge_flag INTEGER DEFAULT 0, config_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS config_metric_windows (window_key TEXT PRIMARY KEY, metric_domain TEXT NOT NULL, metric_scope TEXT NOT NULL, window_type TEXT NOT NULL, window_size INTEGER, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 100, config_profile_id TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS config_metric_thresholds (threshold_key TEXT PRIMARY KEY, config_profile_id TEXT NOT NULL, metric_domain TEXT NOT NULL, metric_family TEXT, metric_key TEXT, threshold_type TEXT NOT NULL, threshold_value REAL, threshold_json TEXT, label TEXT, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_config_metric_definitions_family ON config_metric_definitions(metric_family, enabled)`,
  `CREATE INDEX IF NOT EXISTS idx_config_metric_windows_domain ON config_metric_windows(metric_domain, metric_scope, enabled)`,
  `CREATE INDEX IF NOT EXISTS idx_config_metric_thresholds_profile ON config_metric_thresholds(config_profile_id, metric_domain, threshold_type, enabled)`
];

function nowUtc(){return new Date().toISOString();}
function rid(prefix){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;}
function jsonResponse(obj,status=200){return new Response(JSON.stringify(obj,null,2),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
async function readJsonSafe(request){try{return await request.json();}catch{return {};}}
function baseIdentity(env){return {ok:true,data_ok:true,version:VERSION,worker_name:WORKER_NAME,job_key:JOB_KEY,timestamp_utc:nowUtc(),bindings:bindingPresence(env,REQUIRED_DB_BINDINGS)};}
function bindingPresence(env,names){const out={}; for(const n of names) out[n]=!!env[n]; return out;}
function varPresence(env,names){const out={}; for(const n of names) out[n]=typeof env[n]!=="undefined" && env[n]!==null && String(env[n]).length>0; return out;}
async function execSql(db,sql,binds=[]){const stmt=db.prepare(sql); return binds.length?stmt.bind(...binds).run():stmt.run();}
async function safeQueryAll(db,sql,binds=[]){try{const stmt=db.prepare(sql); const res=binds.length?await stmt.bind(...binds).all():await stmt.all(); return {ok:true,rows:res.results||[]};}catch(err){return {ok:false,rows:[],error:String(err&&err.message?err.message:err)};}}
async function safeQueryFirst(db,sql,binds=[]){try{const stmt=db.prepare(sql); const row=binds.length?await stmt.bind(...binds).first():await stmt.first(); return {ok:true,row};}catch(err){return {ok:false,row:null,error:String(err&&err.message?err.message:err)};}}
async function pragmaColumns(db, table){const res=await safeQueryAll(db,`PRAGMA table_info(${table})`); if(!res.ok)return{ok:false,table,error:res.error,columns:[],column_names:[]}; const columns=res.rows||[]; return{ok:true,table,columns,column_names:columns.map(r=>r.name)};}
function missingColumns(actual, required){const set=new Set(actual||[]); return required.filter(c=>!set.has(c));}
function num(v){const n=Number(v); return Number.isFinite(n)?n:0;}
function nval(v){const n=Number(v); return Number.isFinite(n)?n:null;}
function round(v){return v===null||typeof v==="undefined"||!Number.isFinite(Number(v))?null:Number(Number(v).toFixed(6));}
function sampleBucket(agg){const apps=Math.max(1,num(agg.appearances_count)); const opa=num(agg.outs_recorded_sum)/apps; const starts=num(agg.starts_count); if(starts>0 || opa>=15) return "high_opa_or_start_sample"; if(opa<9) return "low_opa_reliever_like_sample"; return "middle_opa_swing_review_sample";}
function reliability(baseFlags, denom, threshold){if(baseFlags.includes("MISSING_INPUT")) return "MISSING_INPUT"; if(denom!==null && denom===0) return "ZERO_DENOMINATOR"; if(denom!==null && threshold!==null && denom<threshold) return "LOW_SAMPLE"; return "READY";}
function flagString(flags){return Array.from(new Set((flags||[]).filter(Boolean))).join("|") || null;}

function formulaCatalog(){return {profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,stage_only:true,no_promotion:true,no_scoring:true,metrics:METRIC_DEFS.map(d=>({metric_key:d.key,metric_family:d.family,source_table:d.source,numerator_field:d.num,denominator_field:d.den||null,split:d.split||null})),deferred:["FIP","xFIP","SIERA","Stuff+","park/weather/opponent context","market edge","scoring/ranking","starter-vs-reliever weighting","true role-specific scoring logic"]};}

function configSeedItems(){
  const catalog=formulaCatalog();
  const items=[
    {sql:"INSERT OR IGNORE INTO config_metric_calibration_profiles (profile_id, display_name, sport, metric_domain, active, profile_status, profile_json, notes) VALUES (?, ?, 'MLB', 'pitcher', 1, 'base_rebuild_stage_locked', ?, ?)",binds:[PROFILE_ID,"Pitcher Metrics Neutral v0.3.0 Base Stage",JSON.stringify({no_scoring:true,promotion_locked:true,tuning_owner:"CONFIG_DB",base_stage_only:true,default_chunk_size:DEFAULT_CHUNK_SIZE,mirror_hitter_metrics_structure:true}),"Pitcher neutral metrics v0.3.1 full granular base-stage profile. Stage rows only; no promotion."]},
    {sql:"INSERT OR IGNORE INTO config_metric_formula_versions (formula_version, sport, metric_domain, active, version_status, formula_catalog_json, notes) VALUES (?, 'MLB', 'pitcher', 1, 'base_rebuild_stage_locked', ?, ?)",binds:[FORMULA_VERSION,JSON.stringify(catalog),"Pitcher formula catalog for v0.3.1 full granular base-stage only. No production promotion."]}
  ];
  const windows=[
    ["pitcher_v030_last_3_games","last_3_games","last_n_games",3,10],
    ["pitcher_v030_last_5_games","last_5_games","last_n_games",5,20],
    ["pitcher_v030_last_10_games","last_10_games","last_n_games",10,30],
    ["pitcher_v030_last_20_games","last_20_games","last_n_games",20,40],
    ["pitcher_v030_season_to_date","season_to_date","season_to_date",null,90]
  ];
  for(const w of windows){items.push({sql:"INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES (?, 'pitcher', ?, ?, ?, 1, ?, ?, ?)",binds:[w[0],w[1],w[2],w[3],w[4],PROFILE_ID,`Pitcher v0.3.1 base-stage ${w[1]} window.`]});}
  const thresholds=[
    ["pitcher_v030_base_stage_chunk_size",null,null,"base_stage_chunk_size",DEFAULT_CHUNK_SIZE,"base stage chunk size for backend continuation"],
    ["pitcher_v030_min_bf_rate_ready",null,null,"minimum_batters_faced_for_ready_rate_label",100,"BF threshold for READY rate label; lower stages value with LOW_SAMPLE"],
    ["pitcher_v030_min_outs_ip_rate_ready",null,null,"minimum_outs_recorded_for_ready_ip_rate_label",81,"outs threshold for ERA/WHIP READY label; 81 outs = 27 IP"],
    ["pitcher_v030_min_pitches_ready",null,null,"minimum_pitches_for_ready_pitch_rate_label",100,"pitch threshold for strikes_per_pitch READY label"],
    ["pitcher_v030_min_appearances_ready",null,null,"minimum_appearances_for_ready_label",5,"appearances threshold for innings per appearance READY label"],
    ["pitcher_v030_min_split_bf_ready",null,null,"minimum_split_batters_faced_for_ready_label",30,"split BF threshold for pass-through split READY label"]
  ];
  for(const t of thresholds){items.push({sql:"INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, metric_family, metric_key, threshold_type, threshold_value, label, enabled, notes) VALUES (?, ?, 'pitcher', ?, ?, ?, ?, ?, 1, 'DB-configurable full granular base-stage threshold; not scoring.')",binds:[t[0],PROFILE_ID,t[1],t[2],t[3],t[4],t[5]]});}
  for(const d of METRIC_DEFS){items.push({sql:"INSERT OR IGNORE INTO config_metric_definitions (metric_key, metric_family, metric_scope, display_name, description, source_table, numerator_field, denominator_field, formula_version, enabled, neutral_metric_only, future_scoring_bridge_flag, config_json) VALUES (?, ?, 'base_rebuild_stage_locked', ?, ?, ?, ?, ?, ?, 1, 1, 0, ?)",binds:[d.key,d.family,d.key,`Pitcher v0.3.1 base-stage metric: ${d.key}`,d.source,d.num,d.den,FORMULA_VERSION,JSON.stringify({base_stage_only:true,no_promotion:true,split:d.split||null,pitcher_domain:true})]});}
  return items;
}

async function ensureSchema(env){
  const failures=[]; let statsOk=0,statsFailed=0,configOk=0,configFailed=0,seedOk=0,seedFailed=0;
  for(const sql of METRIC_SCHEMA_SQL){try{await execSql(env.STATS_PITCHER_DB,sql);statsOk++;}catch(err){statsFailed++;failures.push({target:"STATS_PITCHER_DB",sql_preview:sql.slice(0,80),error:String(err&&err.message?err.message:err)});}}
  for(const sql of CONFIG_SCHEMA_SQL){try{await execSql(env.CONFIG_DB,sql);configOk++;}catch(err){configFailed++;failures.push({target:"CONFIG_DB",sql_preview:sql.slice(0,80),error:String(err&&err.message?err.message:err)});}}
  for(const item of configSeedItems()){try{await execSql(env.CONFIG_DB,item.sql,item.binds);seedOk++;}catch(err){seedFailed++;failures.push({target:"CONFIG_DB",action:"pitcher_metric_v030_config_seed",sql_preview:item.sql.slice(0,80),error:String(err&&err.message?err.message:err)});}}
  return {ok:statsFailed===0&&configFailed===0&&seedFailed===0,stats_schema_ok:statsOk,stats_schema_failed:statsFailed,config_schema_ok:configOk,config_schema_failed:configFailed,config_seed_ok:seedOk,config_seed_failed:seedFailed,failures};
}

async function auditInputReadiness(env){
  const logs=await pragmaColumns(env.STATS_PITCHER_DB,"pitcher_game_logs");
  const splits=await pragmaColumns(env.STATS_PITCHER_DB,"pitcher_splits");
  const logMissing=logs.ok?missingColumns(logs.column_names,REQUIRED_PITCHER_LOG_COLUMNS):REQUIRED_PITCHER_LOG_COLUMNS;
  const splitMissing=splits.ok?missingColumns(splits.column_names,REQUIRED_PITCHER_SPLIT_COLUMNS):REQUIRED_PITCHER_SPLIT_COLUMNS;
  const logCount=await safeQueryFirst(env.STATS_PITCHER_DB,"SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date FROM pitcher_game_logs");
  const splitCount=await safeQueryFirst(env.STATS_PITCHER_DB,"SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, MIN(source_snapshot_date) AS min_snapshot_date, MAX(source_snapshot_date) AS max_snapshot_date FROM pitcher_splits");
  const splitKeys=await safeQueryAll(env.STATS_PITCHER_DB,"SELECT COALESCE(split_key, split_code, 'UNKNOWN') AS split_key, COUNT(*) AS rows FROM pitcher_splits GROUP BY COALESCE(split_key, split_code, 'UNKNOWN') ORDER BY split_key LIMIT 20");
  return {ok:logs.ok&&splits.ok&&logMissing.length===0&&splitMissing.length===0&&!!(logCount.row&&Number(logCount.row.rows)>0)&&!!(splitCount.row&&Number(splitCount.row.rows)>0),pitcher_game_logs:{schema_ok:logs.ok,column_count:logs.column_names.length,required_columns_missing:logMissing,counts:logCount.row,count_query_ok:logCount.ok,count_query_error:logCount.error||null},pitcher_splits:{schema_ok:splits.ok,column_count:splits.column_names.length,required_columns_missing:splitMissing,counts:splitCount.row,count_query_ok:splitCount.ok,count_query_error:splitCount.error||null,split_key_summary:splitKeys.rows,split_key_query_ok:splitKeys.ok,split_key_query_error:splitKeys.error||null}};
}

async function loadConfig(env){
  const profile=await safeQueryFirst(env.CONFIG_DB,"SELECT profile_id, active, profile_status, profile_json FROM config_metric_calibration_profiles WHERE profile_id=? AND metric_domain='pitcher' LIMIT 1",[PROFILE_ID]);
  const formula=await safeQueryFirst(env.CONFIG_DB,"SELECT formula_version, active, version_status FROM config_metric_formula_versions WHERE formula_version=? AND metric_domain='pitcher' LIMIT 1",[FORMULA_VERSION]);
  const windows=await safeQueryAll(env.CONFIG_DB,"SELECT window_key, metric_scope, window_type, window_size, enabled, sort_order FROM config_metric_windows WHERE metric_domain='pitcher' AND config_profile_id=? AND enabled=1 ORDER BY sort_order",[PROFILE_ID]);
  const thresholds=await safeQueryAll(env.CONFIG_DB,"SELECT threshold_key, threshold_type, threshold_value, label, enabled FROM config_metric_thresholds WHERE metric_domain='pitcher' AND config_profile_id=? AND enabled=1 ORDER BY threshold_key",[PROFILE_ID]);
  const definitions=await safeQueryAll(env.CONFIG_DB,"SELECT metric_key, metric_family, source_table, numerator_field, denominator_field, enabled FROM config_metric_definitions WHERE formula_version=? AND enabled=1 ORDER BY metric_family, metric_key",[FORMULA_VERSION]);
  const map={}; for(const r of thresholds.rows||[]) map[r.threshold_type]=num(r.threshold_value);
  return {ok:!!profile.row&&!!formula.row&&windows.rows.length>0&&thresholds.rows.length>0&&definitions.rows.length>0,profile:profile.row,formula:formula.row,windows:windows.rows,thresholds:thresholds.rows,threshold_map:map,metric_definitions_count:definitions.rows.length,metric_definitions_sample:definitions.rows.slice(0,50),query_errors:[profile,formula,windows,thresholds,definitions].filter(x=>!x.ok).map(x=>x.error)};
}

async function selectSamplePlayers(env, season, target){
  const agg=await safeQueryAll(env.STATS_PITCHER_DB, `SELECT player_id, season, COUNT(*) AS appearances_count,
    SUM(CASE WHEN lower(COALESCE(role,'')) LIKE '%start%' THEN 1 ELSE 0 END) AS starts_count,
    SUM(COALESCE(outs_recorded,0)) AS outs_recorded_sum, SUM(COALESCE(batters_faced,0)) AS batters_faced_sum,
    SUM(COALESCE(pitches,0)) AS pitches_sum, MAX(game_date) AS latest_game_date
    FROM pitcher_game_logs WHERE season=? GROUP BY player_id, season ORDER BY outs_recorded_sum DESC, appearances_count DESC LIMIT 500`, [season]);
  if(!agg.ok) return {ok:false,error:agg.error,players:[],sample_strategy:{}};
  const rows=agg.rows||[];
  const byId=new Map(rows.map(r=>[String(r.player_id),r]));
  const starts=rows.filter(r=>num(r.starts_count)>0).sort((a,b)=>num(b.outs_recorded_sum)-num(a.outs_recorded_sum));
  const relief=rows.filter(r=>num(r.starts_count)===0).sort((a,b)=>num(b.appearances_count)-num(a.appearances_count));
  const lowDen=rows.filter(r=>num(r.outs_recorded_sum)===0||num(r.batters_faced_sum)===0||num(r.pitches_sum)===0).sort((a,b)=>num(a.outs_recorded_sum)-num(b.outs_recorded_sum));
  const noSplit=await safeQueryAll(env.STATS_PITCHER_DB, `SELECT l.player_id, l.season, COUNT(*) AS appearances_count, SUM(COALESCE(l.outs_recorded,0)) AS outs_recorded_sum, SUM(COALESCE(l.batters_faced,0)) AS batters_faced_sum, MAX(l.game_date) AS latest_game_date
    FROM pitcher_game_logs l LEFT JOIN pitcher_splits s ON s.player_id=l.player_id AND s.season=l.season WHERE l.season=? AND s.player_id IS NULL GROUP BY l.player_id,l.season ORDER BY appearances_count DESC LIMIT 20`, [season]);
  const sample=[]; const seen=new Set();
  function add(list, limit, bucket){for(const r of list){if(sample.length>=target)break; const id=String(r.player_id); if(seen.has(id))continue; seen.add(id); sample.push({...r,sample_bucket:bucket||sampleBucket(r)}); if(sample.filter(x=>x.sample_bucket===bucket).length>=limit)break;}}
  add(starts, Math.ceil(target*0.34), "source_start_or_high_workload_sample");
  add(relief, Math.ceil(target*0.34), "source_zero_start_reliever_like_sample");
  add(lowDen, Math.ceil(target*0.16), "low_denominator_edge_sample");
  add((noSplit.rows||[]).map(r=>byId.get(String(r.player_id))||r), Math.ceil(target*0.16), "logs_without_split_edge_sample");
  add(rows, target, null);
  return {ok:sample.length>0,players:sample.slice(0,target),sample_strategy:{target,selected:sample.slice(0,target).length,pools:{starter_like_available:starts.length,reliever_like_available:relief.length,low_denominator_available:lowDen.length,logs_without_split_available:(noSplit.rows||[]).length},selection_note:"Hitter Metrics-equivalent edge-case sample: normal/high workload, reliever-like, low denominator, and logs-without-split edge cases where present. Role buckets are sample metadata only, not final role truth."}};
}

async function loadPlayerLogs(env, playerId, season){const q=await safeQueryAll(env.STATS_PITCHER_DB,"SELECT * FROM pitcher_game_logs WHERE player_id=? AND season=? ORDER BY date(game_date) DESC, game_pk DESC",[playerId,season]); return q.rows||[];}
async function loadPlayerSplits(env, playerId, season){const q=await safeQueryAll(env.STATS_PITCHER_DB,"SELECT * FROM pitcher_splits WHERE player_id=? AND season=?",[playerId,season]); return q.rows||[];}
function pickWindowLogs(logs, window){if(window.window_type==="last_n_games"&&window.window_size) return logs.slice(0,Number(window.window_size)); return logs.slice();}
function aggregateLogs(rows){const a={games_count:rows.length,appearances_count:rows.length,starts_count:0,outs_recorded_sum:0,batters_faced_sum:0,pitches_sum:0,strikes_sum:0,hits_allowed_sum:0,runs_allowed_sum:0,earned_runs_sum:0,walks_allowed_sum:0,strikeouts_sum:0,home_runs_allowed_sum:0,source_start_date:null,source_end_date:null,input_latest_game_date:null};
  const dates=[]; for(const r of rows){a.starts_count += String(r.role||"").toLowerCase().includes("start")?1:0; a.outs_recorded_sum+=num(r.outs_recorded); a.batters_faced_sum+=num(r.batters_faced); a.pitches_sum+=num(r.pitches); a.strikes_sum+=num(r.strikes); a.hits_allowed_sum+=num(r.hits_allowed); a.runs_allowed_sum+=num(r.runs_allowed); a.earned_runs_sum+=num(r.earned_runs); a.walks_allowed_sum+=num(r.walks_allowed); a.strikeouts_sum+=num(r.strikeouts); a.home_runs_allowed_sum+=num(r.home_runs_allowed); if(r.game_date) dates.push(r.game_date);} dates.sort(); a.source_start_date=dates[0]||null; a.source_end_date=dates[dates.length-1]||null; a.input_latest_game_date=a.source_end_date; a.innings_pitched_sum=a.outs_recorded_sum/3; return a;}
function metricFor(def, a, splitRow, thresholds, sample_bucket){
  const flags=[]; let value=null, text=null, numerator=null, denominator=null, label="READY";
  const bfTh=thresholds.minimum_batters_faced_for_ready_rate_label ?? 100;
  const outsTh=thresholds.minimum_outs_recorded_for_ready_ip_rate_label ?? 81;
  const pitchTh=thresholds.minimum_pitches_for_ready_pitch_rate_label ?? 100;
  const appTh=thresholds.minimum_appearances_for_ready_label ?? 5;
  const splitTh=thresholds.minimum_split_batters_faced_for_ready_label ?? 30;
  if(def.key==="pitcher_v030_games_count") value=a.games_count;
  else if(def.key==="pitcher_v030_appearances_count") value=a.appearances_count;
  else if(def.key==="pitcher_v030_starts_count") value=a.starts_count;
  else if(def.key==="pitcher_v030_innings_pitched_sum") value=a.innings_pitched_sum;
  else if(def.key==="pitcher_v030_outs_recorded_sum") value=a.outs_recorded_sum;
  else if(def.key==="pitcher_v030_batters_faced_sum") value=a.batters_faced_sum;
  else if(def.key==="pitcher_v030_pitches_sum") value=a.pitches_sum;
  else if(def.key==="pitcher_v030_strikes_sum") value=a.strikes_sum;
  else if(def.key==="pitcher_v030_hits_allowed_sum") value=a.hits_allowed_sum;
  else if(def.key==="pitcher_v030_runs_allowed_sum") value=a.runs_allowed_sum;
  else if(def.key==="pitcher_v030_earned_runs_sum") value=a.earned_runs_sum;
  else if(def.key==="pitcher_v030_walks_allowed_sum") value=a.walks_allowed_sum;
  else if(def.key==="pitcher_v030_strikeouts_sum") value=a.strikeouts_sum;
  else if(def.key==="pitcher_v030_home_runs_allowed_sum") value=a.home_runs_allowed_sum;
  else if(def.key==="pitcher_v030_era_calculated"){numerator=a.earned_runs_sum*27; denominator=a.outs_recorded_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,outsTh);} 
  else if(def.key==="pitcher_v030_whip_calculated"){numerator=a.walks_allowed_sum+a.hits_allowed_sum; denominator=a.outs_recorded_sum/3; value=denominator?numerator/denominator:null; label=reliability(flags,a.outs_recorded_sum,outsTh);} 
  else if(def.key==="pitcher_v030_k_rate_calculated"){numerator=a.strikeouts_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v030_bb_rate_calculated"){numerator=a.walks_allowed_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v030_hr_rate_calculated"){numerator=a.home_runs_allowed_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v030_k_minus_bb_rate_calculated"){numerator=a.strikeouts_sum-a.walks_allowed_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v030_pitches_per_out_calculated"){numerator=a.pitches_sum; denominator=a.outs_recorded_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,outsTh);} 
  else if(def.key==="pitcher_v030_strikes_per_pitch_calculated"){numerator=a.strikes_sum; denominator=a.pitches_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,pitchTh); if(value!==null&&value>1) flags.push("STRIKES_EXCEED_PITCHES");}
  else if(def.key==="pitcher_v030_innings_per_appearance_calculated"){numerator=a.innings_pitched_sum; denominator=a.appearances_count; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,appTh);} 
  else if(def.key==="pitcher_v030_role_sample_bucket"){text=sample_bucket||sampleBucket(a); label="REVIEW_ONLY"; flags.push("ROLE_BUCKET_SAMPLE_METADATA_ONLY");}
  else if(def.family==="split_pass_through"){
    if(!splitRow){label="MISSING_INPUT"; flags.push(`MISSING_SPLIT_SIDE_${def.split}`);} else {value=nval(splitRow[def.num]); numerator=value; denominator=nval(splitRow.batters_faced); label=denominator!==null&&denominator<splitTh?"LOW_SAMPLE":"SOURCE_PASS_THROUGH"; if(denominator===0) flags.push(`ZERO_DENOMINATOR_SPLIT_BATTERS_FACED_${def.split}`);} 
  }
  if(def.family!=="split_pass_through"){
    if(a.strikes_sum>a.pitches_sum) flags.push("STRIKES_EXCEED_PITCHES");
    if(a.earned_runs_sum>a.runs_allowed_sum) flags.push("EARNED_RUNS_EXCEED_RUNS");
    if(label==="ZERO_DENOMINATOR"){ if(def.den&&String(def.den).includes("outs")) flags.push("ZERO_DENOMINATOR_OUTS_RECORDED"); if(def.den&&String(def.den).includes("batters")) flags.push("ZERO_DENOMINATOR_BATTERS_FACED"); if(def.den&&String(def.den).includes("pitches")) flags.push("ZERO_DENOMINATOR_PITCHES"); if(def.den&&String(def.den).includes("appearances")) flags.push("ZERO_DENOMINATOR_APPEARANCES"); }
    if(label==="LOW_SAMPLE") flags.push("LOW_SAMPLE");
  }
  const rowStatus=(flags.length||label==="LOW_SAMPLE"||label==="MISSING_INPUT"||label==="ZERO_DENOMINATOR"||label==="REVIEW_ONLY")?"review_flag":"base_stage_staged";
  return {metric_value:round(value),metric_text_value:text,numerator:round(numerator),denominator:round(denominator),reliability_label:label,missing_data_reason:flagString(flags),row_status:rowStatus};
}

const STAGE_INSERT_SQL = `INSERT OR REPLACE INTO pitcher_metric_stage (stage_id,batch_id,run_id,metric_key,player_id,season,metric_scope,metric_window,metric_family,source_start_date,source_end_date,source_snapshot_date,input_log_row_count,input_split_row_count,input_latest_game_date,metric_value,metric_text_value,numerator,denominator,data_feed_key,source_key,ingestion_mode,certification_status,certification_grade,certified_at,promoted_at,formula_version,config_profile_id,raw_input_summary_json,metric_json,missing_data_reason,reliability_label,row_status,row_error,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'base_stage_not_promoted','BASE_STAGE_NOT_PROMOTED',NULL,NULL,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`;

function stageBinds(row){return [row.stage_id,row.batch_id,row.run_id,row.metric_key,row.player_id,row.season,row.metric_scope,row.metric_window,row.metric_family,row.source_start_date,row.source_end_date,row.source_snapshot_date,row.input_log_row_count,row.input_split_row_count,row.input_latest_game_date,row.metric_value,row.metric_text_value,row.numerator,row.denominator,DATA_FEED_KEY,row.source_key,row.ingestion_mode,FORMULA_VERSION,PROFILE_ID,JSON.stringify(row.raw_input_summary_json),JSON.stringify(row.metric_json),row.missing_data_reason,row.reliability_label,row.row_status,row.row_error||null];}

async function insertStageRow(env,row){await execSql(env.STATS_PITCHER_DB, STAGE_INSERT_SQL, stageBinds(row));}

async function insertStageRowsChunked(env, rows, chunkSize=100){
  let written=0;
  const errors=[];
  for(let i=0;i<rows.length;i+=chunkSize){
    const chunk=rows.slice(i,i+chunkSize);
    try{
      if(env.STATS_PITCHER_DB.batch){
        const statements=chunk.map(row=>env.STATS_PITCHER_DB.prepare(STAGE_INSERT_SQL).bind(...stageBinds(row)));
        await env.STATS_PITCHER_DB.batch(statements);
        written+=chunk.length;
      }else{
        for(const row of chunk){await insertStageRow(env,row); written++;}
      }
    }catch(err){
      for(const row of chunk){
        try{await insertStageRow(env,row); written++;}
        catch(rowErr){errors.push({row,error:String(rowErr&&rowErr.message?rowErr.message:rowErr)});}
      }
    }
  }
  return {written, errors};
}


async function selectAllEligiblePitchers(env, season){
  const q = await safeQueryAll(env.STATS_PITCHER_DB, `SELECT player_id, season, COUNT(*) AS appearances_count,
    SUM(CASE WHEN lower(COALESCE(role,'')) LIKE '%start%' THEN 1 ELSE 0 END) AS starts_count,
    SUM(COALESCE(outs_recorded,0)) AS outs_recorded_sum,
    SUM(COALESCE(batters_faced,0)) AS batters_faced_sum,
    SUM(COALESCE(pitches,0)) AS pitches_sum,
    MAX(game_date) AS latest_game_date
    FROM pitcher_game_logs
    WHERE season=?
    GROUP BY player_id, season
    HAVING COUNT(*) > 0
    ORDER BY player_id ASC`, [season]);
  if(!q.ok) return {ok:false,error:q.error,players:[]};
  return {ok:true,players:q.rows||[]};
}

async function countStageRows(env, batchId){
  const r = await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS c FROM pitcher_metric_stage WHERE batch_id=?", [batchId]);
  return num(r.row && r.row.c);
}

async function runBaseRebuildStageOnly(input, env){
  const schemaReadiness=await ensureSchema(env);
  const inputReadiness=await auditInputReadiness(env);
  const config=await loadConfig(env);
  const season=Number(input.source_season||DEFAULT_SEASON);
  const requestId=String(input.request_id||"manual_base_pitcher_metrics");
  const cursorKey=`base_pitcher_metrics_v0_3_0_${requestId}`;
  const existingCursor=await safeQueryFirst(env.STATS_PITCHER_DB,"SELECT * FROM pitcher_metric_cursor WHERE cursor_key=?",[cursorKey]);
  const cursor=existingCursor.row||null;
  const batchId=input.batch_id || (cursor && cursor.batch_id) || rid("pitcher_metrics_base_stage_batch");
  const runId=(cursor && cursor.run_id) || input.run_id || rid("pitcher_metrics_base_stage_run");
  const chunkSizeRaw=Number(input.chunk_size || (config.threshold_map && config.threshold_map.base_stage_chunk_size) || DEFAULT_CHUNK_SIZE);
  const chunkSize=Math.max(10, Math.min(60, Number.isFinite(chunkSizeRaw)?chunkSizeRaw:DEFAULT_CHUNK_SIZE));
  const eligible=await selectAllEligiblePitchers(env, season);
  const blockers=[];
  if(!schemaReadiness.ok) blockers.push("SCHEMA_READINESS_FAILED");
  if(!inputReadiness.ok) blockers.push("INPUT_READINESS_FAILED");
  if(!config.ok) blockers.push("CONFIG_READINESS_FAILED");
  if(!eligible.ok || !eligible.players.length) blockers.push("NO_ELIGIBLE_PITCHERS");
  const logRows=num(inputReadiness.pitcher_game_logs.counts&&inputReadiness.pitcher_game_logs.counts.rows);
  const splitRows=num(inputReadiness.pitcher_splits.counts&&inputReadiness.pitcher_splits.counts.rows);
  if(blockers.length){
    const certification="PITCHER_METRICS_V0_3_0_BASE_REBUILD_STAGE_ONLY_BLOCKED_NO_PROMOTION";
    await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_season,input_log_row_count,input_split_row_count,config_profile_id,formula_version,rows_staged,rows_promoted,duplicate_count,certification_status,certification_grade,certification_json,finished_at,notes,updated_at) VALUES (?,?,?,?, 'base_rebuild_stage_only','BLOCKED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION',?,'d1_internal_pitcher_game_logs_and_splits',?,?,?,?,?,0,0,0,?,?,?,CURRENT_TIMESTAMP,'v0.3.2 blocked before full granular stage. No promotion, no source mutation.',CURRENT_TIMESTAMP)`,[batchId,runId,WORKER_NAME,VERSION,DATA_FEED_KEY,season,logRows,splitRows,PROFILE_ID,FORMULA_VERSION,certification,"BASE_STAGE_BLOCKED_NO_PROMOTION",JSON.stringify({blockers,schemaReadiness,inputReadiness,config,eligible})]);
    return {ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,mode:"base_rebuild_stage_only",status:"BLOCKED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION",certification,certification_grade:"BASE_STAGE_BLOCKED_NO_PROMOTION",batch_id:batchId,run_id:runId,blockers,rows_staged:0,rows_promoted:0,external_calls_performed:0};
  }
  const allPlayers=eligible.players;
  const offset=cursor?Number(cursor.players_processed||cursor.current_player_offset||0):0;
  if(!cursor){
    await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_cursor (cursor_key,mode,status,batch_id,run_id,source_season,players_total,players_processed,last_player_id,last_game_date,last_split_snapshot_date,requests_done,no_external_calls,cursor_json,updated_at) VALUES (?,'base_rebuild_stage_only','RUNNING',?,?,?,?,?,NULL,?,?,0,1,?,CURRENT_TIMESTAMP)`,[cursorKey,batchId,runId,season,allPlayers.length,0,inputReadiness.pitcher_game_logs.counts.max_game_date,inputReadiness.pitcher_splits.counts.max_snapshot_date,JSON.stringify({request_id:requestId,chunk_size:chunkSize,full_eligible_pitchers:true,no_promotion:true})]);
  }
  const chunkPlayers=allPlayers.slice(offset, offset+chunkSize);
  let reviewRows=0; const stageRows=[]; const processedIds=[];
  for(const p of chunkPlayers){
    processedIds.push(Number(p.player_id));
    const logs=await loadPlayerLogs(env,p.player_id,p.season||season);
    const splits=await loadPlayerSplits(env,p.player_id,p.season||season);
    const splitByKey={}; for(const sp of splits){const key=String(sp.split_key||sp.split_code||"").toLowerCase(); if(key.includes("left")||key==="vs_left"||key==="l") splitByKey.vs_left=sp; if(key.includes("right")||key==="vs_right"||key==="r") splitByKey.vs_right=sp;}
    const bucket=sampleBucket(p);
    if(splits.length===0){await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_outcomes (outcome_id,batch_id,run_id,player_id,season,metric_family,metric_window,terminal_category,category_reason,input_log_row_count,input_split_row_count,missing_data_reason,formula_version,config_profile_id,outcome_json) VALUES (?,?,?,?,?,'split_pass_through','season_to_date','review_flag','pitcher has logs but no split rows',?,?, 'PITCHER_HAS_LOGS_NO_SPLIT_ROWS',?,?,?)`,[rid("pitcher_metric_outcome"),batchId,runId,Number(p.player_id),Number(p.season||season),logs.length,splits.length,FORMULA_VERSION,PROFILE_ID,JSON.stringify({sample_bucket:bucket,base_stage_only:true})]);}
    for(const w of config.windows){
      const windowLogs=pickWindowLogs(logs,w);
      const a=aggregateLogs(windowLogs);
      const metricScope=String(w.metric_scope||"season_to_date");
      const metricWindow=metricScope;
      for(const def of METRIC_DEFS){
        let splitRow=null;
        if(def.family==="split_pass_through"){
          if(w.metric_scope!=="season_to_date") continue;
          splitRow=splitByKey[def.split];
        }
        const mf=metricFor(def,a,splitRow,config.threshold_map,bucket);
        const stageRow={stage_id:rid("pitcher_metric_stage"),batch_id:batchId,run_id:runId,metric_key:def.key,player_id:Number(p.player_id),season:Number(p.season||season),metric_scope:metricScope,metric_window:metricWindow,metric_family:def.family,source_start_date:a.source_start_date,source_end_date:a.source_end_date,source_snapshot_date:splitRow?splitRow.source_snapshot_date:null,input_log_row_count:windowLogs.length,input_split_row_count:splits.length,input_latest_game_date:a.input_latest_game_date,metric_value:mf.metric_value,metric_text_value:mf.metric_text_value,numerator:mf.numerator,denominator:mf.denominator,source_key:def.source,ingestion_mode:"base_rebuild_stage_only",raw_input_summary_json:{sample_bucket:bucket,window_key:w.window_key,window_type:w.window_type,window_size:w.window_size,logs_in_window:windowLogs.length,splits_found:splits.length,base_stage_only:true},metric_json:{definition:def,profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,no_promotion:true,no_scoring:true,base_stage_only:true},missing_data_reason:mf.missing_data_reason,reliability_label:mf.reliability_label,row_status:mf.row_status,row_error:null};
        stageRows.push(stageRow);
        if(stageRow.row_status==="review_flag") reviewRows++;
      }
    }
  }
  const insertResult=await insertStageRowsChunked(env, stageRows, 100);
  const rowErrors=insertResult.errors.length;
  for(const e of insertResult.errors.slice(0,50)){
    const row=e.row||{};
    await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_outcomes (outcome_id,batch_id,run_id,player_id,season,metric_family,metric_window,terminal_category,category_reason,input_log_row_count,input_split_row_count,missing_data_reason,formula_version,config_profile_id,outcome_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[rid("pitcher_metric_error"),batchId,runId,Number(row.player_id||0),Number(row.season||season),row.metric_family||null,row.metric_window||null,"row_error","stage insert failed",Number(row.input_log_row_count||0),Number(row.input_split_row_count||0),e.error,FORMULA_VERSION,PROFILE_ID,JSON.stringify({metric_key:row.metric_key||null,error:e.error})]);
  }
  const newOffset=offset+chunkPlayers.length;
  const partialContinue = rowErrors===0 && newOffset < allPlayers.length;
  const stagedRowsTotal=await countStageRows(env,batchId);
  const dup=await safeQueryFirst(env.STATS_PITCHER_DB,"SELECT COUNT(*) AS duplicate_natural_keys FROM (SELECT metric_key, player_id, season, metric_scope, metric_window, COUNT(*) c FROM pitcher_metric_stage WHERE batch_id=? GROUP BY metric_key, player_id, season, metric_scope, metric_window HAVING c>1)",[batchId]);
  const duplicateCount=num(dup.row&&dup.row.duplicate_natural_keys);
  const status=rowErrors>0||duplicateCount>0?"COMPLETED_BASE_REBUILD_STAGE_ONLY_WITH_REVIEW_NO_PROMOTION":(partialContinue?"PARTIAL_CONTINUE_BASE_PITCHER_METRICS":"COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION");
  const certification=rowErrors>0||duplicateCount>0?"BASE_PITCHER_METRICS_V0_3_0_BASE_REBUILD_STAGE_ONLY_REVIEW_NO_PROMOTION":(partialContinue?"BASE_PITCHER_METRICS_V0_3_0_BASE_REBUILD_STAGE_ONLY_PARTIAL_CONTINUE":"BASE_PITCHER_METRICS_V0_3_0_BASE_REBUILD_STAGE_ONLY_COMPLETED_NO_PROMOTION");
  const grade=rowErrors>0||duplicateCount>0?"BASE_STAGE_REVIEW_NO_PROMOTION":(partialContinue?"PARTIAL_CONTINUE":"BASE_STAGE_PASS_NO_PROMOTION");
  await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_season,input_log_row_count,input_split_row_count,input_latest_game_date,input_latest_split_snapshot_date,expected_pitcher_universe_count,config_profile_id,formula_version,metric_catalog_json,formula_readiness_json,config_readiness_json,input_readiness_json,rows_staged,rows_promoted,duplicate_count,certification_status,certification_grade,certification_json,finished_at,certified_at,notes,updated_at) VALUES (?,?,?,?, 'base_rebuild_stage_only',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,[batchId,runId,WORKER_NAME,VERSION,status,DATA_FEED_KEY,"d1_internal_pitcher_game_logs_and_splits",season,logRows,splitRows,inputReadiness.pitcher_game_logs.counts.max_game_date,inputReadiness.pitcher_splits.counts.max_snapshot_date,allPlayers.length,PROFILE_ID,FORMULA_VERSION,JSON.stringify(formulaCatalog()),JSON.stringify({base_stage_formula_locked:true,advanced_metrics_deferred:true,full_granular_stage_only:true,promotion_locked:true}),JSON.stringify(config),JSON.stringify(inputReadiness),stagedRowsTotal,duplicateCount,certification,grade,JSON.stringify({offset_before:offset,offset_after:newOffset,players_total:allPlayers.length,chunk_size:chunkSize,chunk_player_ids:processedIds,review_rows_this_chunk:reviewRows,row_errors:rowErrors,duplicate_count:duplicateCount,no_promotion:true,no_source_mutation:true,no_external_calls:true}),partialContinue?null:nowUtc(),partialContinue?null:nowUtc(),"v0.3.2 full granular base stage only. No snapshots, no live promotion, no source mutation, no scoring."]);
  await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_cursor (cursor_key,mode,status,batch_id,run_id,source_season,players_total,players_processed,last_player_id,last_game_date,last_split_snapshot_date,requests_done,no_external_calls,cursor_json,updated_at) VALUES (?,'base_rebuild_stage_only',?,?,?,?,?,?,?,?,?,COALESCE((SELECT requests_done FROM pitcher_metric_cursor WHERE cursor_key=?),0)+1,1,?,CURRENT_TIMESTAMP)`,[cursorKey,partialContinue?"PARTIAL_CONTINUE":"COMPLETED",batchId,runId,season,allPlayers.length,newOffset,processedIds.length?processedIds[processedIds.length-1]:null,inputReadiness.pitcher_game_logs.counts.max_game_date,inputReadiness.pitcher_splits.counts.max_snapshot_date,cursorKey,JSON.stringify({request_id:requestId,chunk_size:chunkSize,offset_before:offset,offset_after:newOffset,chunk_player_ids:processedIds,no_promotion:true})]);
  if(!partialContinue && rowErrors===0 && duplicateCount===0){
    await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_certifications (certification_id,batch_id,run_id,certification_status,certification_grade,rows_staged,rows_promoted,duplicate_count,input_log_row_count,input_split_row_count,validation_json) VALUES (?,?,?,?,?,?,0,?,?,?,?)`,[rid("pitcher_metrics_base_stage_cert"),batchId,runId,certification,grade,stagedRowsTotal,duplicateCount,logRows,splitRows,JSON.stringify({players_total:allPlayers.length,rows_staged:stagedRowsTotal,row_errors:rowErrors,duplicate_count:duplicateCount})]);
  }
  return {ok:rowErrors===0&&duplicateCount===0&&stagedRowsTotal>0,data_ok:rowErrors===0&&duplicateCount===0&&stagedRowsTotal>0,version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,chain_id:input.chain_id||null,run_id:runId,batch_id:batchId,mode:"base_rebuild_stage_only",base_rebuild_stage_only:true,status,certification,certification_grade:grade,profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,players_total:allPlayers.length,chunk_size:chunkSize,offset_before:offset,offset_after:newOffset,chunk_player_count:chunkPlayers.length,chunk_player_ids:processedIds,continuation_required:partialContinue,orchestrator_should_self_continue:partialContinue,windows_used:config.windows.map(w=>({metric_scope:w.metric_scope,window_type:w.window_type,window_size:w.window_size})),metric_definitions_count:METRIC_DEFS.length,rows_read:logRows+splitRows,rows_staged:stagedRowsTotal,rows_written:insertResult.written+2,rows_promoted:0,duplicate_count:duplicateCount,row_errors:rowErrors,review_rows_this_chunk:reviewRows,stage_insert_mode:"d1_batch_chunked_with_individual_fallback",external_calls_performed:0,live_promotion_performed:false,source_table_mutation_performed:false,scoring_performed:false,ranking_performed:false,final_board_write_performed:false,allowed_next_phase:partialContinue?"Continue same queued job until complete":"snapshot prep only after SQL review and approval",blocked_downstream_reason:"v0.3.0 is full granular base-stage only; snapshot prep, live promotion, delta, repair/no-op, scoring are intentionally blocked.",config_used:{profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,thresholds:config.thresholds,windows:config.windows},input_readiness:inputReadiness,output_json:{mirrors_hitter_metrics_structure:true,hitter_formulas_copied:false,pitcher_specific_denominators:true,no_mlb_calls:true,no_source_mutation:true,no_promotion:true},timestamp_utc:nowUtc()};
}


const SNAPSHOT_TYPED_COLUMNS = [
  ["games_count","REAL"],["appearances_count","REAL"],["starts_count","REAL"],["innings_pitched_sum","REAL"],["outs_recorded_sum","REAL"],
  ["batters_faced_sum","REAL"],["pitches_sum","REAL"],["strikes_sum","REAL"],["hits_allowed_sum","REAL"],["runs_allowed_sum","REAL"],
  ["earned_runs_sum","REAL"],["walks_allowed_sum","REAL"],["strikeouts_sum","REAL"],["home_runs_allowed_sum","REAL"],
  ["era_calculated","REAL"],["whip_calculated","REAL"],["k_rate_calculated","REAL"],["bb_rate_calculated","REAL"],["hr_rate_calculated","REAL"],
  ["k_minus_bb_rate_calculated","REAL"],["pitches_per_out_calculated","REAL"],["strikes_per_pitch_calculated","REAL"],["innings_per_appearance_calculated","REAL"],
  ["sample_size_label","TEXT"]
];

function stripPrefixMetricKey(key){return String(key||"").replace(/^pitcher_v0\d+_/,"");}
function sampleLabelFromReliability(counts){
  const ready = Number((counts&&counts.READY)||0) + Number((counts&&counts.SOURCE_PASS_THROUGH)||0);
  const review = Number((counts&&counts.LOW_SAMPLE)||0) + Number((counts&&counts.REVIEW_ONLY)||0) + Number((counts&&counts.MISSING_INPUT)||0) + Number((counts&&counts.ZERO_DENOMINATOR)||0);
  if(ready > 0 && review === 0) return "sample_strong";
  if(ready > review) return "sample_usable";
  if(ready > 0) return "sample_thin";
  return "review_only";
}

async function ensureSnapshotTypedColumns(env){
  const targets = ["pitcher_metric_snapshot_stage", "pitcher_metric_snapshots"];
  const attempted=[];
  for(const table of targets){
    const cols = await pragmaColumns(env.STATS_PITCHER_DB, table);
    const existing = new Set((cols.column_names||[]).map(x=>String(x)));
    for(const [name,type] of SNAPSHOT_TYPED_COLUMNS){
      if(existing.has(name)) continue;
      try{
        await execSql(env.STATS_PITCHER_DB, `ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
        attempted.push({table,column:name,added:true});
      }catch(err){
        attempted.push({table,column:name,added:false,error:String(err&&err.message?err.message:err)});
      }
    }
  }
  return attempted;
}

async function insertSnapshotRowsChunked(env, rows, chunkSize=100){
  const cols = [
    "snapshot_stage_id","snapshot_batch_id","source_batch_id","run_id","player_id","season","metric_window","config_profile_id","formula_version",
    ...SNAPSHOT_TYPED_COLUMNS.map(c=>c[0]),
    "metrics_json","input_summary_json","reliability_json","review_flags_json","certification_status","certification_grade","promoted_at","updated_at"
  ];
  const placeholders = cols.map(()=>"?").join(",");
  const sql = `INSERT OR REPLACE INTO pitcher_metric_snapshot_stage (${cols.join(",")}) VALUES (${placeholders})`;
  let written=0; const errors=[];
  for(let i=0;i<rows.length;i+=chunkSize){
    const chunk=rows.slice(i,i+chunkSize);
    const stmts = chunk.map(r => env.STATS_PITCHER_DB.prepare(sql).bind(...cols.map(c => r[c] === undefined ? null : r[c])));
    try{ await env.STATS_PITCHER_DB.batch(stmts); written += chunk.length; }
    catch(err){
      for(const r of chunk){
        try{ await env.STATS_PITCHER_DB.prepare(sql).bind(...cols.map(c => r[c] === undefined ? null : r[c])).run(); written++; }
        catch(e){ errors.push({player_id:r.player_id,metric_window:r.metric_window,error:String(e&&e.message?e.message:e)}); }
      }
    }
  }
  return {written,errors};
}

async function runSnapshotPrepStageOnly(input, env){
  const runId = input.run_id || rid("run");
  const snapshotBatchId = rid("pitcher_metrics_snapshot_prep_batch");
  const sourceBatchId = input.source_metric_batch_id || input.source_batch_id || (await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT batch_id FROM pitcher_metric_batches WHERE mode='base_rebuild_stage_only' AND status='COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION' ORDER BY datetime(updated_at) DESC LIMIT 1")).row?.batch_id;
  const blockers=[];
  if(!sourceBatchId) blockers.push("NO_COMPLETED_BASE_STAGE_BATCH_FOUND");
  const schemaReadiness = await ensureSchema(env);
  await ensureSnapshotTypedColumns(env);
  if(!schemaReadiness.ok) blockers.push("SCHEMA_READINESS_FAILED");
  const sourceBatch = sourceBatchId ? await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_metric_batches WHERE batch_id=? LIMIT 1", [sourceBatchId]) : {row:null};
  if(sourceBatchId && !sourceBatch.row) blockers.push("SOURCE_BATCH_NOT_FOUND");
  if(sourceBatch.row && String(sourceBatch.row.status)!=="COMPLETED_BASE_REBUILD_STAGE_ONLY_NO_PROMOTION") blockers.push("SOURCE_BATCH_NOT_COMPLETED");
  const sourceCounts = sourceBatchId ? await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, COUNT(DISTINCT metric_window) AS windows, COUNT(DISTINCT metric_key) AS metric_keys FROM pitcher_metric_stage WHERE batch_id=?", [sourceBatchId]) : {row:null};
  if(sourceCounts.row && Number(sourceCounts.row.rows||0)<=0) blockers.push("SOURCE_STAGE_EMPTY");
  if(blockers.length){
    const certification="BASE_PITCHER_METRICS_V0_3_3_SNAPSHOT_PREP_BLOCKED_NO_PROMOTION";
    await execSql(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_metric_snapshot_batches (snapshot_batch_id,source_batch_id,run_id,worker_name,worker_version,mode,status,config_profile_id,formula_version,source_rows,source_players,snapshot_rows,snapshot_players,rows_promoted,duplicate_count,certification_status,certification_grade,certification_json,finished_at,notes,updated_at) VALUES (?,?,?,?,?,'snapshot_prep_stage_only','BLOCKED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION',?,?,?,?,0,0,0,0,?,?,?,CURRENT_TIMESTAMP,'v0.3.3 snapshot prep blocked before stage writes. No promotion, no source mutation.',CURRENT_TIMESTAMP)`,[snapshotBatchId,sourceBatchId||null,runId,WORKER_NAME,VERSION,PROFILE_ID,FORMULA_VERSION,Number(sourceCounts.row&&sourceCounts.row.rows||0),Number(sourceCounts.row&&sourceCounts.row.players||0),certification,"SNAPSHOT_PREP_BLOCKED_NO_PROMOTION",JSON.stringify({blockers,schemaReadiness,source_counts:sourceCounts.row||null})]);
    return {ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,run_id:runId,snapshot_batch_id:snapshotBatchId,source_metric_batch_id:sourceBatchId||null,mode:"snapshot_prep_stage_only",status:"BLOCKED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION",certification,certification_grade:"SNAPSHOT_PREP_BLOCKED_NO_PROMOTION",blockers,rows_promoted:0,external_calls_performed:0};
  }
  const sourceRows = await safeQueryAll(env.STATS_PITCHER_DB, `SELECT player_id, season, metric_window, metric_scope, metric_key, metric_family, metric_value, metric_text_value, numerator, denominator, reliability_label, row_status, missing_data_reason, input_log_row_count, input_split_row_count, source_start_date, source_end_date, source_snapshot_date, input_latest_game_date FROM pitcher_metric_stage WHERE batch_id=? ORDER BY player_id, season, metric_window, metric_key`, [sourceBatchId]);
  if(!sourceRows.ok) throw new Error(sourceRows.error || "SOURCE_STAGE_QUERY_FAILED");
  const groups = new Map();
  for(const r of sourceRows.rows){
    const key = [r.player_id,r.season,r.metric_window].join("|");
    if(!groups.has(key)) groups.set(key,{player_id:Number(r.player_id),season:Number(r.season),metric_window:String(r.metric_window),metrics:{},reliability_counts:{},review_flags:[],input_summary:{source_start_date:null,source_end_date:null,source_snapshot_date:null,input_latest_game_date:null,input_log_row_count_total:0,input_split_row_count_max:0,metric_rows:0}});
    const g=groups.get(key); const compactKey=stripPrefixMetricKey(r.metric_key);
    g.metrics[compactKey]={metric_key:r.metric_key,metric_family:r.metric_family,metric_value:r.metric_value,metric_text_value:r.metric_text_value,numerator:r.numerator,denominator:r.denominator,reliability_label:r.reliability_label,row_status:r.row_status,missing_data_reason:r.missing_data_reason};
    g.reliability_counts[r.reliability_label||"UNKNOWN"]=(g.reliability_counts[r.reliability_label||"UNKNOWN"]||0)+1;
    if(String(r.row_status)==="review_flag" || r.missing_data_reason){ g.review_flags.push({metric_key:r.metric_key,reliability_label:r.reliability_label,row_status:r.row_status,missing_data_reason:r.missing_data_reason}); }
    g.input_summary.metric_rows++;
    g.input_summary.input_log_row_count_total += Number(r.input_log_row_count||0);
    g.input_summary.input_split_row_count_max = Math.max(g.input_summary.input_split_row_count_max, Number(r.input_split_row_count||0));
    if(r.source_start_date && (!g.input_summary.source_start_date || String(r.source_start_date)<String(g.input_summary.source_start_date))) g.input_summary.source_start_date=r.source_start_date;
    if(r.source_end_date && (!g.input_summary.source_end_date || String(r.source_end_date)>String(g.input_summary.source_end_date))) g.input_summary.source_end_date=r.source_end_date;
    if(r.source_snapshot_date && (!g.input_summary.source_snapshot_date || String(r.source_snapshot_date)>String(g.input_summary.source_snapshot_date))) g.input_summary.source_snapshot_date=r.source_snapshot_date;
    if(r.input_latest_game_date && (!g.input_summary.input_latest_game_date || String(r.input_latest_game_date)>String(g.input_summary.input_latest_game_date))) g.input_summary.input_latest_game_date=r.input_latest_game_date;
  }
  const snapshotRows=[];
  for(const g of groups.values()){
    const row={snapshot_stage_id:rid("pitcher_metric_snapshot_stage"),snapshot_batch_id:snapshotBatchId,source_batch_id:sourceBatchId,run_id:runId,player_id:g.player_id,season:g.season,metric_window:g.metric_window,config_profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,metrics_json:JSON.stringify(g.metrics),input_summary_json:JSON.stringify(g.input_summary),reliability_json:JSON.stringify(g.reliability_counts),review_flags_json:JSON.stringify(g.review_flags),certification_status:"snapshot_prep_stage_not_promoted",certification_grade:"SNAPSHOT_PREP_STAGE_NOT_PROMOTED",promoted_at:null,updated_at:nowUtc()};
    const typedMap={
      games_count:"games_count",appearances_count:"appearances_count",starts_count:"starts_count",innings_pitched_sum:"innings_pitched_sum",outs_recorded_sum:"outs_recorded_sum",batters_faced_sum:"batters_faced_sum",pitches_sum:"pitches_sum",strikes_sum:"strikes_sum",hits_allowed_sum:"hits_allowed_sum",runs_allowed_sum:"runs_allowed_sum",earned_runs_sum:"earned_runs_sum",walks_allowed_sum:"walks_allowed_sum",strikeouts_sum:"strikeouts_sum",home_runs_allowed_sum:"home_runs_allowed_sum",era_calculated:"era_calculated",whip_calculated:"whip_calculated",k_rate_calculated:"k_rate_calculated",bb_rate_calculated:"bb_rate_calculated",hr_rate_calculated:"hr_rate_calculated",k_minus_bb_rate_calculated:"k_minus_bb_rate_calculated",pitches_per_out_calculated:"pitches_per_out_calculated",strikes_per_pitch_calculated:"strikes_per_pitch_calculated",innings_per_appearance_calculated:"innings_per_appearance_calculated"
    };
    for(const col of Object.keys(typedMap)){ const m=g.metrics[typedMap[col]]; row[col]=m ? m.metric_value : null; }
    row.sample_size_label=sampleLabelFromReliability(g.reliability_counts);
    snapshotRows.push(row);
  }
  const insertResult = await insertSnapshotRowsChunked(env, snapshotRows, 100);
  const rowErrors=insertResult.errors.length;
  const snapCounts = await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, COUNT(DISTINCT metric_window) AS windows FROM pitcher_metric_snapshot_stage WHERE snapshot_batch_id=?", [snapshotBatchId]);
  const dup = await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS duplicate_natural_keys FROM (SELECT player_id, season, metric_window, config_profile_id, formula_version, COUNT(*) c FROM pitcher_metric_snapshot_stage WHERE snapshot_batch_id=? GROUP BY player_id, season, metric_window, config_profile_id, formula_version HAVING c>1)", [snapshotBatchId]);
  const snapshotRowsCount=Number(snapCounts.row&&snapCounts.row.rows||0); const snapshotPlayers=Number(snapCounts.row&&snapCounts.row.players||0); const duplicateCount=Number(dup.row&&dup.row.duplicate_natural_keys||0);
  const status = rowErrors===0 && duplicateCount===0 && snapshotRowsCount>0 ? "COMPLETED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION" : "COMPLETED_SNAPSHOT_PREP_STAGE_ONLY_REVIEW_NO_PROMOTION";
  const certification = rowErrors===0 && duplicateCount===0 && snapshotRowsCount>0 ? "BASE_PITCHER_METRICS_V0_3_4_SNAPSHOT_PREP_COMPLETED_NO_PROMOTION" : "BASE_PITCHER_METRICS_V0_3_4_SNAPSHOT_PREP_REVIEW_NO_PROMOTION";
  const grade = rowErrors===0 && duplicateCount===0 && snapshotRowsCount>0 ? "SNAPSHOT_PREP_PASS_NO_PROMOTION" : "SNAPSHOT_PREP_REVIEW_NO_PROMOTION";
  await execSql(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_metric_snapshot_batches (snapshot_batch_id,source_batch_id,run_id,worker_name,worker_version,mode,status,config_profile_id,formula_version,source_rows,source_players,snapshot_rows,snapshot_players,rows_promoted,duplicate_count,certification_status,certification_grade,certification_json,finished_at,notes,updated_at) VALUES (?,?,?,?,?,'snapshot_prep_stage_only',?,?,?,?,?,?,?,0,?,?,?,?,CURRENT_TIMESTAMP,'v0.3.4 snapshot prep stage only. Schema call fix. No live promotion, no source mutation, no scoring.',CURRENT_TIMESTAMP)`,[snapshotBatchId,sourceBatchId,runId,WORKER_NAME,VERSION,status,PROFILE_ID,FORMULA_VERSION,Number(sourceCounts.row.rows||0),Number(sourceCounts.row.players||0),snapshotRowsCount,snapshotPlayers,duplicateCount,certification,grade,JSON.stringify({source_batch_id:sourceBatchId,source_rows:sourceCounts.row,snapshot_counts:snapCounts.row,duplicate_count:duplicateCount,row_errors:rowErrors,no_promotion:true,no_source_mutation:true,no_external_calls:true})]);
  return {ok:rowErrors===0&&duplicateCount===0&&snapshotRowsCount>0,data_ok:rowErrors===0&&duplicateCount===0&&snapshotRowsCount>0,version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,chain_id:input.chain_id||null,run_id:runId,snapshot_batch_id:snapshotBatchId,source_metric_batch_id:sourceBatchId,mode:"snapshot_prep_stage_only",snapshot_prep_stage_only:true,status,certification,certification_grade:grade,source_stage_rows:Number(sourceCounts.row.rows||0),source_stage_players:Number(sourceCounts.row.players||0),source_stage_windows:Number(sourceCounts.row.windows||0),source_metric_keys:Number(sourceCounts.row.metric_keys||0),snapshot_rows:snapshotRowsCount,snapshot_players:snapshotPlayers,snapshot_windows:Number(snapCounts.row&&snapCounts.row.windows||0),rows_written:insertResult.written+1,rows_promoted:0,duplicate_count:duplicateCount,row_errors:rowErrors,external_calls_performed:0,live_promotion_performed:false,source_table_mutation_performed:false,scoring_performed:false,ranking_performed:false,final_board_write_performed:false,retained_stage_preserved:true,allowed_next_phase:"live snapshot promotion only after SQL review and approval",blocked_downstream_reason:"v0.3.4 is snapshot prep stage-only; live promotion, delta, repair/no-op, scoring are intentionally blocked.",timestamp_utc:nowUtc()};
}

async function runSnapshotPromoteRetainedStage(input, env){
  const runId = input.run_id || rid("run");
  const snapshotBatchId = input.snapshot_batch_id || (await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT snapshot_batch_id FROM pitcher_metric_snapshot_batches WHERE mode='snapshot_prep_stage_only' AND status='COMPLETED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION' ORDER BY datetime(updated_at) DESC LIMIT 1")).row?.snapshot_batch_id;
  const blockers=[];
  if(!snapshotBatchId) blockers.push("NO_COMPLETED_SNAPSHOT_PREP_BATCH_FOUND");
  const schemaReadiness = await ensureSchema(env);
  await ensureSnapshotTypedColumns(env);
  if(!schemaReadiness.ok) blockers.push("SCHEMA_READINESS_FAILED");
  const batch = snapshotBatchId ? await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT * FROM pitcher_metric_snapshot_batches WHERE snapshot_batch_id=? LIMIT 1", [snapshotBatchId]) : {row:null};
  if(snapshotBatchId && !batch.row) blockers.push("SNAPSHOT_BATCH_NOT_FOUND");
  if(batch.row && String(batch.row.status)!=="COMPLETED_SNAPSHOT_PREP_STAGE_ONLY_NO_PROMOTION" && String(batch.row.status)!=="COMPLETED_SNAPSHOT_PROMOTED_RETAINED_STAGE") blockers.push("SNAPSHOT_BATCH_NOT_READY_FOR_PROMOTION");
  const stageCounts = snapshotBatchId ? await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, COUNT(DISTINCT metric_window) AS windows FROM pitcher_metric_snapshot_stage WHERE snapshot_batch_id=?", [snapshotBatchId]) : {row:null};
  const dup = snapshotBatchId ? await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS duplicate_natural_keys FROM (SELECT player_id, season, metric_window, config_profile_id, formula_version, COUNT(*) c FROM pitcher_metric_snapshot_stage WHERE snapshot_batch_id=? GROUP BY player_id, season, metric_window, config_profile_id, formula_version HAVING c>1)", [snapshotBatchId]) : {row:null};
  const duplicateCount = Number(dup.row&&dup.row.duplicate_natural_keys||0);
  if(stageCounts.row && Number(stageCounts.row.rows||0)<=0) blockers.push("SNAPSHOT_STAGE_EMPTY");
  if(duplicateCount>0) blockers.push("DUPLICATE_SNAPSHOT_STAGE_KEYS");
  if(blockers.length){
    const certification="BASE_PITCHER_METRICS_V0_4_0_SNAPSHOT_PROMOTE_BLOCKED";
    return {ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,chain_id:input.chain_id||null,run_id:runId,snapshot_batch_id:snapshotBatchId||null,mode:"snapshot_promote_retained_stage",status:"BLOCKED_SNAPSHOT_PROMOTE_RETAINED_STAGE",certification,certification_grade:"SNAPSHOT_PROMOTE_BLOCKED",blockers,stage_counts:stageCounts.row||null,duplicate_count:duplicateCount,rows_promoted:0,external_calls_performed:0,source_table_mutation_performed:false,scoring_performed:false,ranking_performed:false,final_board_write_performed:false,timestamp_utc:nowUtc()};
  }
  const typed = SNAPSHOT_TYPED_COLUMNS.map(c=>c[0]);
  const targetCols = ["player_id","season","metric_window","config_profile_id","formula_version","snapshot_batch_id","source_batch_id",...typed,"metrics_json","input_summary_json","reliability_json","review_flags_json","certification_status","certification_grade","promoted_at","updated_at"];
  const selectCols = ["player_id","season","metric_window","config_profile_id","formula_version","snapshot_batch_id","source_batch_id",...typed,"metrics_json","input_summary_json","reliability_json","review_flags_json", "'snapshot_promoted_retained_stage'", "'SNAPSHOT_PROMOTED_RETAINED_STAGE'", "CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP"];
  await execSql(env.STATS_PITCHER_DB, `INSERT OR REPLACE INTO pitcher_metric_snapshots (${targetCols.join(",")}) SELECT ${selectCols.join(",")} FROM pitcher_metric_snapshot_stage WHERE snapshot_batch_id=?`, [snapshotBatchId]);
  const liveCounts = await safeQueryFirst(env.STATS_PITCHER_DB, "SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, COUNT(DISTINCT metric_window) AS windows FROM pitcher_metric_snapshots WHERE snapshot_batch_id=?", [snapshotBatchId]);
  const rowsPromoted = Number(liveCounts.row&&liveCounts.row.rows||0);
  const expectedRows = Number(stageCounts.row&&stageCounts.row.rows||0);
  const status = rowsPromoted===expectedRows && rowsPromoted>0 ? "COMPLETED_SNAPSHOT_PROMOTED_RETAINED_STAGE" : "COMPLETED_SNAPSHOT_PROMOTE_REVIEW_RETAINED_STAGE";
  const certification = rowsPromoted===expectedRows && rowsPromoted>0 ? "BASE_PITCHER_METRICS_V0_4_0_SNAPSHOT_PROMOTED_RETAINED" : "BASE_PITCHER_METRICS_V0_4_0_SNAPSHOT_PROMOTE_REVIEW_RETAINED";
  const grade = rowsPromoted===expectedRows && rowsPromoted>0 ? "SNAPSHOT_PROMOTE_PASS_RETAINED" : "SNAPSHOT_PROMOTE_REVIEW_RETAINED";
  await execSql(env.STATS_PITCHER_DB, "UPDATE pitcher_metric_snapshot_stage SET certification_status='snapshot_promoted_retained_stage', certification_grade='SNAPSHOT_PROMOTED_RETAINED_STAGE', promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE snapshot_batch_id=?", [snapshotBatchId]);
  await execSql(env.STATS_PITCHER_DB, "UPDATE pitcher_metric_snapshot_batches SET status=?, rows_promoted=?, duplicate_count=?, certification_status=?, certification_grade=?, certification_json=?, promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP), finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP, notes='v0.4.0 snapshot promoted to live with retained stage preserved. No source mutation, no external calls, no scoring.' WHERE snapshot_batch_id=?", [status, rowsPromoted, duplicateCount, certification, grade, JSON.stringify({snapshot_batch_id:snapshotBatchId,stage_counts:stageCounts.row,live_counts:liveCounts.row,duplicate_count:duplicateCount,retained_stage_preserved:true,no_source_mutation:true,no_external_calls:true,no_scoring:true}), snapshotBatchId]);
  return {ok:status==="COMPLETED_SNAPSHOT_PROMOTED_RETAINED_STAGE",data_ok:status==="COMPLETED_SNAPSHOT_PROMOTED_RETAINED_STAGE",version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,chain_id:input.chain_id||null,run_id:runId,snapshot_batch_id:snapshotBatchId,source_metric_batch_id:batch.row&&batch.row.source_batch_id||null,mode:"snapshot_promote_retained_stage",snapshot_promote_retained_stage:true,status,certification,certification_grade:grade,snapshot_stage_rows:expectedRows,snapshot_stage_players:Number(stageCounts.row&&stageCounts.row.players||0),snapshot_stage_windows:Number(stageCounts.row&&stageCounts.row.windows||0),live_rows:rowsPromoted,live_players:Number(liveCounts.row&&liveCounts.row.players||0),live_windows:Number(liveCounts.row&&liveCounts.row.windows||0),rows_promoted:rowsPromoted,duplicate_count:duplicateCount,external_calls_performed:0,live_promotion_performed:true,retained_stage_preserved:true,source_table_mutation_performed:false,scoring_performed:false,ranking_performed:false,final_board_write_performed:false,allowed_next_phase:"retained-stage/live repair and no-op gate only after SQL review and approval",blocked_downstream_reason:"v0.4.0 promotes neutral pitcher metric snapshots only; scoring/ranking/final board remain blocked.",timestamp_utc:nowUtc()};
}


export default {async fetch(request, env, ctx){
  const url=new URL(request.url); const path=url.pathname.replace(/\/$/,"")||"/"; const method=request.method.toUpperCase();
  if(method==="GET"&&path==="/") return jsonResponse(baseIdentity(env));
  if(method==="GET"&&path==="/health"){return jsonResponse({...baseIdentity(env),route:"/health",checks:{db_bindings:bindingPresence(env,REQUIRED_DB_BINDINGS),vars:varPresence(env,EXPECTED_VARS),secrets_present_only:varPresence(env,REQUIRED_SECRETS)},safe_secret_note:"Secret values are intentionally never printed."});}
  if(method==="POST"&&path==="/diagnostic"){const input=await readJsonSafe(request); return jsonResponse({...baseIdentity(env),route:"/diagnostic",input_echo_safe:{request_id:input.request_id||null,chain_id:input.chain_id||null,job_key:input.job_key||null,mode:input.mode||null},diagnostics:{db_bindings:bindingPresence(env,REQUIRED_DB_BINDINGS),vars:varPresence(env,EXPECTED_VARS),secrets_present_only:varPresence(env,REQUIRED_SECRETS)},writes_performed:0,external_calls_performed:0});}
  if(method==="POST"&&path==="/run"){
    const input=await readJsonSafe(request); const missingDb=REQUIRED_DB_BINDINGS.filter(name=>!env[name]);
    if(missingDb.length) return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"BLOCKED_MISSING_DB_BINDINGS",missing_db_bindings:missingDb,external_calls_performed:0,rows_written:0},500);
    try{
      if(String(input.mode||"")==="snapshot_promote_retained_stage") return jsonResponse(await runSnapshotPromoteRetainedStage(input,env));
      if(String(input.mode||"")==="snapshot_prep_stage_only") return jsonResponse(await runSnapshotPrepStageOnly(input,env));
      return jsonResponse(await runBaseRebuildStageOnly(input,env));
    }catch(err){
      const m=String(input.mode||"");
      return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,status:m==="snapshot_promote_retained_stage"?"SNAPSHOT_PROMOTE_WORKER_EXCEPTION":(m==="snapshot_prep_stage_only"?"SNAPSHOT_PREP_WORKER_EXCEPTION":"BASE_STAGE_WORKER_EXCEPTION"),certification:m==="snapshot_promote_retained_stage"?"PITCHER_METRICS_V0_4_0_SNAPSHOT_PROMOTE_EXCEPTION":(m==="snapshot_prep_stage_only"?"PITCHER_METRICS_V0_3_4_SNAPSHOT_PREP_EXCEPTION":"PITCHER_METRICS_V0_3_3_BASE_STAGE_EXCEPTION"),error:String(err&&err.message?err.message:err),stack:String(err&&err.stack?err.stack:"").slice(0,2000),rows_written:0,rows_promoted:0,external_calls_performed:0,timestamp_utc:nowUtc()},500);}
  }
  return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"NOT_FOUND",allowed_routes:["GET /","GET /health","POST /run","POST /diagnostic"],timestamp_utc:nowUtc()},404);
}};
