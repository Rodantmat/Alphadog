const WORKER_NAME = "alphadog-v2-base-pitcher-metrics";
const VERSION = "alphadog-v2-base-pitcher-metrics-v0.2.0-sample-stage-calibration";
const JOB_KEY = "base-pitcher-metrics";

const PROFILE_ID = "pitcher_metrics_neutral_v0_2_0_sample_stage";
const FORMULA_VERSION = "pitcher_metrics_formula_v0_2_0_sample_stage";
const DATA_FEED_KEY = "derived_pitcher_metrics_v0_2_0_sample_stage_calibration";
const DEFAULT_SEASON = 2026;
const DEFAULT_SAMPLE_TARGET = 30;

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
  { key: "pitcher_v020_games_count", family: "direct_aggregate", source: "pitcher_game_logs", num: "games_count", den: null },
  { key: "pitcher_v020_appearances_count", family: "direct_aggregate", source: "pitcher_game_logs", num: "appearances_count", den: null },
  { key: "pitcher_v020_starts_count", family: "role_readiness", source: "pitcher_game_logs", num: "starts_count", den: null },
  { key: "pitcher_v020_innings_pitched_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "outs_recorded/3", den: null },
  { key: "pitcher_v020_outs_recorded_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "outs_recorded", den: null },
  { key: "pitcher_v020_batters_faced_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "batters_faced", den: null },
  { key: "pitcher_v020_pitches_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "pitches", den: null },
  { key: "pitcher_v020_strikes_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "strikes", den: null },
  { key: "pitcher_v020_hits_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "hits_allowed", den: null },
  { key: "pitcher_v020_runs_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "runs_allowed", den: null },
  { key: "pitcher_v020_earned_runs_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "earned_runs", den: null },
  { key: "pitcher_v020_walks_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "walks_allowed", den: null },
  { key: "pitcher_v020_strikeouts_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "strikeouts", den: null },
  { key: "pitcher_v020_home_runs_allowed_sum", family: "direct_aggregate", source: "pitcher_game_logs", num: "home_runs_allowed", den: null },
  { key: "pitcher_v020_era_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "earned_runs*27", den: "outs_recorded" },
  { key: "pitcher_v020_whip_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "walks_allowed+hits_allowed", den: "outs_recorded/3" },
  { key: "pitcher_v020_k_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "strikeouts", den: "batters_faced" },
  { key: "pitcher_v020_bb_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "walks_allowed", den: "batters_faced" },
  { key: "pitcher_v020_hr_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "home_runs_allowed", den: "batters_faced" },
  { key: "pitcher_v020_k_minus_bb_rate_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "strikeouts-walks_allowed", den: "batters_faced" },
  { key: "pitcher_v020_pitches_per_out_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "pitches", den: "outs_recorded" },
  { key: "pitcher_v020_strikes_per_pitch_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "strikes", den: "pitches" },
  { key: "pitcher_v020_innings_per_appearance_calculated", family: "denominator_safe_rate", source: "pitcher_game_logs", num: "outs_recorded/3", den: "appearances_count" },
  { key: "pitcher_v020_role_sample_bucket", family: "role_readiness", source: "pitcher_game_logs", num: "outs_per_appearance_bucket", den: null },
  { key: "pitcher_v020_split_vs_left_era_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "era", den: null, split: "vs_left" },
  { key: "pitcher_v020_split_vs_left_whip_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "whip", den: null, split: "vs_left" },
  { key: "pitcher_v020_split_vs_left_ops_against_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "ops_against", den: null, split: "vs_left" },
  { key: "pitcher_v020_split_vs_right_era_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "era", den: null, split: "vs_right" },
  { key: "pitcher_v020_split_vs_right_whip_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "whip", den: null, split: "vs_right" },
  { key: "pitcher_v020_split_vs_right_ops_against_pass_through", family: "split_pass_through", source: "pitcher_splits", num: "ops_against", den: null, split: "vs_right" }
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
    numerator REAL, denominator REAL, data_feed_key TEXT NOT NULL, source_key TEXT NOT NULL, ingestion_mode TEXT NOT NULL, certification_status TEXT DEFAULT 'sample_stage_not_promoted',
    certification_grade TEXT, certified_at TEXT, promoted_at TEXT, formula_version TEXT, config_profile_id TEXT, raw_input_summary_json TEXT, metric_json TEXT,
    missing_data_reason TEXT, reliability_label TEXT, row_status TEXT DEFAULT 'sample_stage_staged', row_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
  `INSERT OR IGNORE INTO pitcher_metric_schema_migrations (migration_key, worker_version, notes) VALUES ('pitcher_metrics_v0_2_0_sample_stage_schema_safe', '${VERSION}', 'Pitcher Metrics v0.2.0 sample-stage calibration uses existing lifecycle tables only. No promotion, no source mutation, no external calls.')`
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
    {sql:"INSERT OR IGNORE INTO config_metric_calibration_profiles (profile_id, display_name, sport, metric_domain, active, profile_status, profile_json, notes) VALUES (?, ?, 'MLB', 'pitcher', 1, 'sample_stage_calibration', ?, ?)",binds:[PROFILE_ID,"Pitcher Metrics Neutral v0.2.0 Sample Stage",JSON.stringify({no_scoring:true,promotion_locked:true,tuning_owner:"CONFIG_DB",sample_stage_only:true,default_sample_target:DEFAULT_SAMPLE_TARGET,mirror_hitter_metrics_structure:true}),"Pitcher neutral metrics v0.2.0 sample-stage calibration profile. Stage rows only; no promotion."]},
    {sql:"INSERT OR IGNORE INTO config_metric_formula_versions (formula_version, sport, metric_domain, active, version_status, formula_catalog_json, notes) VALUES (?, 'MLB', 'pitcher', 1, 'sample_stage_calibration', ?, ?)",binds:[FORMULA_VERSION,JSON.stringify(catalog),"Pitcher formula catalog for v0.2.0 sample-stage calibration only. No production promotion."]}
  ];
  const windows=[
    ["pitcher_v020_last_3_games","last_3_games","last_n_games",3,10],
    ["pitcher_v020_last_5_games","last_5_games","last_n_games",5,20],
    ["pitcher_v020_last_10_games","last_10_games","last_n_games",10,30],
    ["pitcher_v020_last_20_games","last_20_games","last_n_games",20,40],
    ["pitcher_v020_season_to_date","season_to_date","season_to_date",null,90]
  ];
  for(const w of windows){items.push({sql:"INSERT OR IGNORE INTO config_metric_windows (window_key, metric_domain, metric_scope, window_type, window_size, enabled, sort_order, config_profile_id, notes) VALUES (?, 'pitcher', ?, ?, ?, 1, ?, ?, ?)",binds:[w[0],w[1],w[2],w[3],w[4],PROFILE_ID,`Pitcher v0.2.0 sample-stage ${w[1]} window.`]});}
  const thresholds=[
    ["pitcher_v020_sample_target",null,null,"sample_target",DEFAULT_SAMPLE_TARGET,"sample target; mirrors hitter sample-stage small footprint"],
    ["pitcher_v020_min_bf_rate_ready",null,null,"minimum_batters_faced_for_ready_rate_label",100,"BF threshold for READY rate label; lower stages value with LOW_SAMPLE"],
    ["pitcher_v020_min_outs_ip_rate_ready",null,null,"minimum_outs_recorded_for_ready_ip_rate_label",81,"outs threshold for ERA/WHIP READY label; 81 outs = 27 IP"],
    ["pitcher_v020_min_pitches_ready",null,null,"minimum_pitches_for_ready_pitch_rate_label",100,"pitch threshold for strikes_per_pitch READY label"],
    ["pitcher_v020_min_appearances_ready",null,null,"minimum_appearances_for_ready_label",5,"appearances threshold for innings per appearance READY label"],
    ["pitcher_v020_min_split_bf_ready",null,null,"minimum_split_batters_faced_for_ready_label",30,"split BF threshold for pass-through split READY label"]
  ];
  for(const t of thresholds){items.push({sql:"INSERT OR IGNORE INTO config_metric_thresholds (threshold_key, config_profile_id, metric_domain, metric_family, metric_key, threshold_type, threshold_value, label, enabled, notes) VALUES (?, ?, 'pitcher', ?, ?, ?, ?, ?, 1, 'DB-configurable sample-stage calibration threshold; not scoring.')",binds:[t[0],PROFILE_ID,t[1],t[2],t[3],t[4],t[5]]});}
  for(const d of METRIC_DEFS){items.push({sql:"INSERT OR IGNORE INTO config_metric_definitions (metric_key, metric_family, metric_scope, display_name, description, source_table, numerator_field, denominator_field, formula_version, enabled, neutral_metric_only, future_scoring_bridge_flag, config_json) VALUES (?, ?, 'sample_stage_calibration', ?, ?, ?, ?, ?, ?, 1, 1, 0, ?)",binds:[d.key,d.family,d.key,`Pitcher v0.2.0 sample-stage metric: ${d.key}`,d.source,d.num,d.den,FORMULA_VERSION,JSON.stringify({sample_stage_only:true,no_promotion:true,split:d.split||null,pitcher_domain:true})]});}
  return items;
}

async function ensureSchema(env){
  const failures=[]; let statsOk=0,statsFailed=0,configOk=0,configFailed=0,seedOk=0,seedFailed=0;
  for(const sql of METRIC_SCHEMA_SQL){try{await execSql(env.STATS_PITCHER_DB,sql);statsOk++;}catch(err){statsFailed++;failures.push({target:"STATS_PITCHER_DB",sql_preview:sql.slice(0,80),error:String(err&&err.message?err.message:err)});}}
  for(const sql of CONFIG_SCHEMA_SQL){try{await execSql(env.CONFIG_DB,sql);configOk++;}catch(err){configFailed++;failures.push({target:"CONFIG_DB",sql_preview:sql.slice(0,80),error:String(err&&err.message?err.message:err)});}}
  for(const item of configSeedItems()){try{await execSql(env.CONFIG_DB,item.sql,item.binds);seedOk++;}catch(err){seedFailed++;failures.push({target:"CONFIG_DB",action:"pitcher_metric_v020_config_seed",sql_preview:item.sql.slice(0,80),error:String(err&&err.message?err.message:err)});}}
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
  if(def.key==="pitcher_v020_games_count") value=a.games_count;
  else if(def.key==="pitcher_v020_appearances_count") value=a.appearances_count;
  else if(def.key==="pitcher_v020_starts_count") value=a.starts_count;
  else if(def.key==="pitcher_v020_innings_pitched_sum") value=a.innings_pitched_sum;
  else if(def.key==="pitcher_v020_outs_recorded_sum") value=a.outs_recorded_sum;
  else if(def.key==="pitcher_v020_batters_faced_sum") value=a.batters_faced_sum;
  else if(def.key==="pitcher_v020_pitches_sum") value=a.pitches_sum;
  else if(def.key==="pitcher_v020_strikes_sum") value=a.strikes_sum;
  else if(def.key==="pitcher_v020_hits_allowed_sum") value=a.hits_allowed_sum;
  else if(def.key==="pitcher_v020_runs_allowed_sum") value=a.runs_allowed_sum;
  else if(def.key==="pitcher_v020_earned_runs_sum") value=a.earned_runs_sum;
  else if(def.key==="pitcher_v020_walks_allowed_sum") value=a.walks_allowed_sum;
  else if(def.key==="pitcher_v020_strikeouts_sum") value=a.strikeouts_sum;
  else if(def.key==="pitcher_v020_home_runs_allowed_sum") value=a.home_runs_allowed_sum;
  else if(def.key==="pitcher_v020_era_calculated"){numerator=a.earned_runs_sum*27; denominator=a.outs_recorded_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,outsTh);} 
  else if(def.key==="pitcher_v020_whip_calculated"){numerator=a.walks_allowed_sum+a.hits_allowed_sum; denominator=a.outs_recorded_sum/3; value=denominator?numerator/denominator:null; label=reliability(flags,a.outs_recorded_sum,outsTh);} 
  else if(def.key==="pitcher_v020_k_rate_calculated"){numerator=a.strikeouts_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v020_bb_rate_calculated"){numerator=a.walks_allowed_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v020_hr_rate_calculated"){numerator=a.home_runs_allowed_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v020_k_minus_bb_rate_calculated"){numerator=a.strikeouts_sum-a.walks_allowed_sum; denominator=a.batters_faced_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,bfTh);} 
  else if(def.key==="pitcher_v020_pitches_per_out_calculated"){numerator=a.pitches_sum; denominator=a.outs_recorded_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,outsTh);} 
  else if(def.key==="pitcher_v020_strikes_per_pitch_calculated"){numerator=a.strikes_sum; denominator=a.pitches_sum; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,pitchTh); if(value!==null&&value>1) flags.push("STRIKES_EXCEED_PITCHES");}
  else if(def.key==="pitcher_v020_innings_per_appearance_calculated"){numerator=a.innings_pitched_sum; denominator=a.appearances_count; value=denominator?numerator/denominator:null; label=reliability(flags,denominator,appTh);} 
  else if(def.key==="pitcher_v020_role_sample_bucket"){text=sample_bucket||sampleBucket(a); label="REVIEW_ONLY"; flags.push("ROLE_BUCKET_SAMPLE_METADATA_ONLY");}
  else if(def.family==="split_pass_through"){
    if(!splitRow){label="MISSING_INPUT"; flags.push(`MISSING_SPLIT_SIDE_${def.split}`);} else {value=nval(splitRow[def.num]); numerator=value; denominator=nval(splitRow.batters_faced); label=denominator!==null&&denominator<splitTh?"LOW_SAMPLE":"SOURCE_PASS_THROUGH"; if(denominator===0) flags.push(`ZERO_DENOMINATOR_SPLIT_BATTERS_FACED_${def.split}`);} 
  }
  if(def.family!=="split_pass_through"){
    if(a.strikes_sum>a.pitches_sum) flags.push("STRIKES_EXCEED_PITCHES");
    if(a.earned_runs_sum>a.runs_allowed_sum) flags.push("EARNED_RUNS_EXCEED_RUNS");
    if(label==="ZERO_DENOMINATOR"){ if(def.den&&String(def.den).includes("outs")) flags.push("ZERO_DENOMINATOR_OUTS_RECORDED"); if(def.den&&String(def.den).includes("batters")) flags.push("ZERO_DENOMINATOR_BATTERS_FACED"); if(def.den&&String(def.den).includes("pitches")) flags.push("ZERO_DENOMINATOR_PITCHES"); if(def.den&&String(def.den).includes("appearances")) flags.push("ZERO_DENOMINATOR_APPEARANCES"); }
    if(label==="LOW_SAMPLE") flags.push("LOW_SAMPLE");
  }
  const rowStatus=(flags.length||label==="LOW_SAMPLE"||label==="MISSING_INPUT"||label==="ZERO_DENOMINATOR"||label==="REVIEW_ONLY")?"review_flag":"sample_stage_staged";
  return {metric_value:round(value),metric_text_value:text,numerator:round(numerator),denominator:round(denominator),reliability_label:label,missing_data_reason:flagString(flags),row_status:rowStatus};
}

async function insertStageRow(env,row){await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_stage (stage_id,batch_id,run_id,metric_key,player_id,season,metric_scope,metric_window,metric_family,source_start_date,source_end_date,source_snapshot_date,input_log_row_count,input_split_row_count,input_latest_game_date,metric_value,metric_text_value,numerator,denominator,data_feed_key,source_key,ingestion_mode,certification_status,certification_grade,certified_at,promoted_at,formula_version,config_profile_id,raw_input_summary_json,metric_json,missing_data_reason,reliability_label,row_status,row_error,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'sample_stage_not_promoted','SAMPLE_STAGE_NOT_PROMOTED',NULL,NULL,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
  [row.stage_id,row.batch_id,row.run_id,row.metric_key,row.player_id,row.season,row.metric_scope,row.metric_window,row.metric_family,row.source_start_date,row.source_end_date,row.source_snapshot_date,row.input_log_row_count,row.input_split_row_count,row.input_latest_game_date,row.metric_value,row.metric_text_value,row.numerator,row.denominator,DATA_FEED_KEY,row.source_key,row.ingestion_mode,FORMULA_VERSION,PROFILE_ID,JSON.stringify(row.raw_input_summary_json),JSON.stringify(row.metric_json),row.missing_data_reason,row.reliability_label,row.row_status,row.row_error||null]);}

async function runSampleStage(input, env){
  const schemaReadiness=await ensureSchema(env);
  const inputReadiness=await auditInputReadiness(env);
  const config=await loadConfig(env);
  const season=Number(input.source_season||DEFAULT_SEASON);
  const sampleTarget=Number((config.threshold_map&&config.threshold_map.sample_target)||input.sample_target||DEFAULT_SAMPLE_TARGET);
  const batchId=input.batch_id||rid("pitcher_metrics_sample_batch");
  const runId=input.run_id||rid("pitcher_metrics_sample_run");
  const select=await selectSamplePlayers(env,season,sampleTarget);
  if(!schemaReadiness.ok||!inputReadiness.ok||!config.ok||!select.ok){
    const certification="PITCHER_METRICS_V0_2_0_SAMPLE_STAGE_CALIBRATION_BLOCKED";
    await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_season,input_log_row_count,input_split_row_count,config_profile_id,formula_version,rows_staged,rows_promoted,duplicate_count,certification_status,certification_grade,certification_json,finished_at,notes,updated_at) VALUES (?,?,?,?, 'sample_stage_calibration','BLOCKED_SAMPLE_STAGE_CALIBRATION_NO_PROMOTION',?,'d1_internal_pitcher_game_logs_and_splits',?,?,?,?,?,0,0,0,?,?,?,CURRENT_TIMESTAMP,'v0.2.0 blocked before staging. No promotion, no source mutation.',CURRENT_TIMESTAMP)`,[batchId,runId,WORKER_NAME,VERSION,DATA_FEED_KEY,season,num(inputReadiness.pitcher_game_logs?.counts?.rows),num(inputReadiness.pitcher_splits?.counts?.rows),PROFILE_ID,FORMULA_VERSION,certification,"SAMPLE_STAGE_BLOCKED_NO_PROMOTION",JSON.stringify({schemaReadiness,inputReadiness,config,sample_selection:select})]);
    return {ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,mode:"sample_stage_calibration",status:"BLOCKED_SAMPLE_STAGE_CALIBRATION_NO_PROMOTION",certification,certification_grade:"SAMPLE_STAGE_BLOCKED_NO_PROMOTION",batch_id:batchId,run_id:runId,schema_readiness:schemaReadiness,input_readiness:inputReadiness,config_readiness:config,sample_selection:select,rows_staged:0,rows_promoted:0,external_calls_performed:0};
  }
  let rowsStaged=0,rowErrors=0,reviewRows=0; const sampleIds=[];
  for(const p of select.players){
    sampleIds.push(Number(p.player_id));
    const logs=await loadPlayerLogs(env,p.player_id,p.season||season);
    const splits=await loadPlayerSplits(env,p.player_id,p.season||season);
    const splitByKey={}; for(const s of splits){const key=String(s.split_key||s.split_code||"").toLowerCase(); if(key.includes("left")||key==="vs_left"||key==="l") splitByKey.vs_left=s; if(key.includes("right")||key==="vs_right"||key==="r") splitByKey.vs_right=s;}
    if(splits.length===0){await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_outcomes (outcome_id,batch_id,run_id,player_id,season,metric_family,metric_window,terminal_category,category_reason,input_log_row_count,input_split_row_count,missing_data_reason,formula_version,config_profile_id,outcome_json) VALUES (?,?,?,?,?,'split_pass_through','season_to_date','review_flag','pitcher has logs but no split rows',?,?, 'PITCHER_HAS_LOGS_NO_SPLIT_ROWS',?,?,?)`,[rid("pitcher_metric_outcome"),batchId,runId,Number(p.player_id),Number(p.season||season),logs.length,splits.length,FORMULA_VERSION,PROFILE_ID,JSON.stringify({sample_bucket:p.sample_bucket})]);}
    for(const w of config.windows){
      const windowLogs=pickWindowLogs(logs,w); const a=aggregateLogs(windowLogs); const bucket=p.sample_bucket||sampleBucket(a);
      for(const def of METRIC_DEFS){
        const splitRow=def.split?splitByKey[def.split]:null;
        const mf=metricFor(def,a,splitRow,config.threshold_map||{},bucket);
        const metricScope=def.family==="split_pass_through"?def.split:String(w.metric_scope);
        const metricWindow=def.family==="split_pass_through"?"season_to_date":String(w.metric_scope);
        if(def.family==="split_pass_through" && w.metric_scope!=="season_to_date") continue;
        const stageRow={stage_id:rid("pitcher_metric_stage"),batch_id:batchId,run_id:runId,metric_key:def.key,player_id:Number(p.player_id),season:Number(p.season||season),metric_scope:metricScope,metric_window:metricWindow,metric_family:def.family,source_start_date:a.source_start_date,source_end_date:a.source_end_date,source_snapshot_date:splitRow?splitRow.source_snapshot_date:null,input_log_row_count:windowLogs.length,input_split_row_count:splits.length,input_latest_game_date:a.input_latest_game_date,metric_value:mf.metric_value,metric_text_value:mf.metric_text_value,numerator:mf.numerator,denominator:mf.denominator,source_key:def.source,ingestion_mode:"sample_stage_calibration",raw_input_summary_json:{sample_bucket:bucket,window_key:w.window_key,window_type:w.window_type,window_size:w.window_size,logs_in_window:windowLogs.length,splits_found:splits.length},metric_json:{definition:def,profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,no_promotion:true,no_scoring:true},missing_data_reason:mf.missing_data_reason,reliability_label:mf.reliability_label,row_status:mf.row_status,row_error:null};
        try{await insertStageRow(env,stageRow); rowsStaged++; if(stageRow.row_status==="review_flag") reviewRows++;}catch(err){rowErrors++; await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_outcomes (outcome_id,batch_id,run_id,player_id,season,metric_family,metric_window,terminal_category,category_reason,input_log_row_count,input_split_row_count,missing_data_reason,formula_version,config_profile_id,outcome_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[rid("pitcher_metric_error"),batchId,runId,Number(p.player_id),Number(p.season||season),def.family,metricWindow,"row_error","stage insert failed",windowLogs.length,splits.length,String(err&&err.message?err.message:err),FORMULA_VERSION,PROFILE_ID,JSON.stringify({metric_key:def.key,error:String(err&&err.stack?err.stack:err).slice(0,1000)})]);}
      }
    }
  }
  const dup=await safeQueryFirst(env.STATS_PITCHER_DB,"SELECT COUNT(*) AS duplicate_natural_keys FROM (SELECT metric_key, player_id, season, metric_scope, metric_window, COUNT(*) c FROM pitcher_metric_stage WHERE batch_id=? GROUP BY metric_key, player_id, season, metric_scope, metric_window HAVING c>1)",[batchId]);
  const duplicateCount=num(dup.row&&dup.row.duplicate_natural_keys);
  const status=(rowErrors===0&&duplicateCount===0&&rowsStaged>0)?"COMPLETED_SAMPLE_STAGE_CALIBRATION_NO_PROMOTION":"COMPLETED_SAMPLE_STAGE_CALIBRATION_WITH_REVIEW_NO_PROMOTION";
  const certification=(rowErrors===0&&duplicateCount===0&&rowsStaged>0)?"PITCHER_METRICS_V0_2_0_SAMPLE_STAGE_CALIBRATION_COMPLETED_NO_PROMOTION":"PITCHER_METRICS_V0_2_0_SAMPLE_STAGE_CALIBRATION_REVIEW_NO_PROMOTION";
  const grade=(rowErrors===0&&duplicateCount===0&&rowsStaged>0)?"SAMPLE_STAGE_PASS_NO_PROMOTION":"SAMPLE_STAGE_REVIEW_NO_PROMOTION";
  const logRows=num(inputReadiness.pitcher_game_logs.counts&&inputReadiness.pitcher_game_logs.counts.rows), splitRows=num(inputReadiness.pitcher_splits.counts&&inputReadiness.pitcher_splits.counts.rows);
  await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_batches (batch_id,run_id,worker_name,worker_version,mode,status,data_feed_key,source_key,source_season,input_log_row_count,input_split_row_count,input_latest_game_date,input_latest_split_snapshot_date,expected_pitcher_universe_count,config_profile_id,formula_version,metric_catalog_json,formula_readiness_json,config_readiness_json,input_readiness_json,rows_staged,rows_promoted,duplicate_count,certification_status,certification_grade,certification_json,finished_at,certified_at,notes,updated_at) VALUES (?,?,?,?, 'sample_stage_calibration',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP)`,[batchId,runId,WORKER_NAME,VERSION,status,DATA_FEED_KEY,"d1_internal_pitcher_game_logs_and_splits",season,logRows,splitRows,inputReadiness.pitcher_game_logs.counts.max_game_date,inputReadiness.pitcher_splits.counts.max_snapshot_date,num(inputReadiness.pitcher_game_logs.counts.players),PROFILE_ID,FORMULA_VERSION,JSON.stringify(formulaCatalog()),JSON.stringify({sample_stage_formula_locked:true,advanced_metrics_deferred:true}),JSON.stringify(config),JSON.stringify(inputReadiness),rowsStaged,duplicateCount,certification,grade,JSON.stringify({sample_selection:select.sample_strategy,sample_player_ids:sampleIds,review_rows:reviewRows,row_errors:rowErrors,duplicate_count:duplicateCount,no_promotion:true,no_source_mutation:true,no_external_calls:true}),"v0.2.0 sample-stage calibration. Stage rows only. No snapshots, no promotion, no source mutation, no scoring."]);
  await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_certifications (certification_id,batch_id,run_id,certification_status,certification_grade,rows_staged,rows_promoted,duplicate_count,input_log_row_count,input_split_row_count,validation_json) VALUES (?,?,?,?,?,?,0,?,?,?,?)`,[rid("pitcher_metrics_sample_cert"),batchId,runId,certification,grade,rowsStaged,duplicateCount,logRows,splitRows,JSON.stringify({sample_selection:select.sample_strategy,sample_player_ids:sampleIds,row_errors:rowErrors,review_rows:reviewRows})]);
  await execSql(env.STATS_PITCHER_DB,`INSERT OR REPLACE INTO pitcher_metric_cursor (cursor_key,mode,status,batch_id,run_id,source_season,players_total,players_processed,last_game_date,last_split_snapshot_date,requests_done,no_external_calls,cursor_json,updated_at) VALUES ('pitcher_metrics_v0_2_0_sample_stage_cursor','sample_stage_calibration',?,?,?,?,?,?,?,?,1,1,?,CURRENT_TIMESTAMP)`,[status,batchId,runId,season,select.players.length,select.players.length,inputReadiness.pitcher_game_logs.counts.max_game_date,inputReadiness.pitcher_splits.counts.max_snapshot_date,JSON.stringify({next_phase:"v0.3.x full granular stage only after review",no_promotion:true})]);
  return {ok:rowErrors===0&&duplicateCount===0&&rowsStaged>0,data_ok:rowErrors===0&&duplicateCount===0&&rowsStaged>0,version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,chain_id:input.chain_id||null,run_id:runId,batch_id:batchId,mode:"sample_stage_calibration",status,certification,certification_grade:grade,profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,sample_player_count:select.players.length,sample_player_ids:sampleIds,sample_strategy:select.sample_strategy,windows_used:config.windows.map(w=>({metric_scope:w.metric_scope,window_type:w.window_type,window_size:w.window_size})),metric_definitions_count:METRIC_DEFS.length,rows_read:logRows+splitRows,rows_staged:rowsStaged,rows_written:rowsStaged+3,rows_promoted:0,duplicate_count:duplicateCount,row_errors:rowErrors,review_rows:reviewRows,external_calls_performed:0,live_promotion_performed:false,source_table_mutation_performed:false,scoring_performed:false,ranking_performed:false,final_board_write_performed:false,allowed_next_phase:"v0.3.x full granular stage only after SQL review",blocked_downstream_reason:"v0.2.0 is sample-stage calibration only; snapshot prep, live promotion, delta, repair/no-op, scoring are intentionally blocked.",config_used:{profile_id:PROFILE_ID,formula_version:FORMULA_VERSION,thresholds:config.thresholds,windows:config.windows},input_readiness:inputReadiness,output_json:{mirrors_hitter_metrics_structure:true,hitter_formulas_copied:false,pitcher_specific_denominators:true,no_mlb_calls:true,no_source_mutation:true,no_promotion:true},timestamp_utc:nowUtc()};
}

export default {async fetch(request, env, ctx){
  const url=new URL(request.url); const path=url.pathname.replace(/\/$/,"")||"/"; const method=request.method.toUpperCase();
  if(method==="GET"&&path==="/") return jsonResponse(baseIdentity(env));
  if(method==="GET"&&path==="/health"){return jsonResponse({...baseIdentity(env),route:"/health",checks:{db_bindings:bindingPresence(env,REQUIRED_DB_BINDINGS),vars:varPresence(env,EXPECTED_VARS),secrets_present_only:varPresence(env,REQUIRED_SECRETS)},safe_secret_note:"Secret values are intentionally never printed."});}
  if(method==="POST"&&path==="/diagnostic"){const input=await readJsonSafe(request); return jsonResponse({...baseIdentity(env),route:"/diagnostic",input_echo_safe:{request_id:input.request_id||null,chain_id:input.chain_id||null,job_key:input.job_key||null,mode:input.mode||null},diagnostics:{db_bindings:bindingPresence(env,REQUIRED_DB_BINDINGS),vars:varPresence(env,EXPECTED_VARS),secrets_present_only:varPresence(env,REQUIRED_SECRETS)},writes_performed:0,external_calls_performed:0});}
  if(method==="POST"&&path==="/run"){
    const input=await readJsonSafe(request); const missingDb=REQUIRED_DB_BINDINGS.filter(name=>!env[name]);
    if(missingDb.length) return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"BLOCKED_MISSING_DB_BINDINGS",missing_db_bindings:missingDb,external_calls_performed:0,rows_written:0},500);
    try{return jsonResponse(await runSampleStage(input,env));}catch(err){return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,job_key:input.job_key||JOB_KEY,request_id:input.request_id||null,status:"SAMPLE_STAGE_WORKER_EXCEPTION",certification:"PITCHER_METRICS_V0_2_0_SAMPLE_STAGE_EXCEPTION",error:String(err&&err.message?err.message:err),stack:String(err&&err.stack?err.stack:"").slice(0,2000),rows_written:0,rows_promoted:0,external_calls_performed:0,timestamp_utc:nowUtc()},500);}
  }
  return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"NOT_FOUND",allowed_routes:["GET /","GET /health","POST /run","POST /diagnostic"],timestamp_utc:nowUtc()},404);
}};
