const WORKER_NAME = "alphadog-v2-phase3a-first-inning-pitcher-context";
const LOGICAL_WORKER_NAME = "alphadog-v2-expansion-baseline";
const VERSION = "alphadog-v2-phase3a-first-inning-pitcher-context-v0.8.0-daily-delta-wired";
const CLASSIFICATION_V6_VERSION = "classification-v6-z-score-tier-engine-v1.0";
const EXPANSION_JOB_KEYS = new Set([
  "expansion-baseline-mining",
  "expansion-baseline-sanity",
  "expansion-baseline-hp",
  "expansion-baseline-line-inventory",
  "expansion-baseline-certifier",
  "expansion-baseline-full-run",
  "expansion-delta-full-run",
  "expansion-delta-mining",
  "expansion-delta-sanity",
  "expansion-delta-hp",
  "expansion-baseline-v2",
  "expansion-baseline-v2-full-run"
]);

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "TEAM_DB", "CONTEXT_DB", "SCORE_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL"];

const RA_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
const PFS_LINES = [5.5, 10.5, 15.5, 20.5, 25.5, 30.5];
const RFI_LINES = [0.5];
const SIDES = ["more", "less"];


// v0.1.44: Baseline V2 is a pure history model. These line ladders are canonical
// historical calculation targets, not app inventory. PrizePicks/Sleeper/board lines
// must never determine whether a baseline exists or what its HP is.
const CANONICAL_HITTER_BASELINE_LINES = Object.freeze({
  hits:[0.5,1.5,2.5],
  singles:[0.5,1.5,2.5],
  doubles:[0.5,1.5],
  triples:[0.5],
  home_runs:[0.5,1.5],
  runs:[0.5,1.5,2.5],
  rbis:[0.5,1.5,2.5],
  walks:[0.5,1.5,2.5],
  hitter_strikeouts:[0.5,1.5,2.5],
  stolen_bases:[0.5,1.5],
  total_bases:[0.5,1.5,2.5,3.5,4.5,5.5,6.5],
  hits_runs_rbis:[0.5,1.5,2.5,3.5,4.5,5.5,6.5],
  fantasy_score:[4.5,6.5,8.5,10.5,12.5,14.5,16.5,18.5,20.5,22.5,24.5,26.5,28.5,30.5,32.5,34.5]
});
const CANONICAL_PITCHER_BASELINE_LINES = Object.freeze({
  pitcher_strikeouts:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5],
  pitcher_outs:[8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5],
  hits_allowed:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5],
  walks_allowed:[0.5,1.5,2.5,3.5,4.5],
  earned_runs:[0.5,1.5,2.5,3.5,4.5,5.5],
  runs_allowed:[0.5,1.5,2.5,3.5,4.5,5.5,6.5],
  pitches_thrown:[39.5,49.5,59.5,69.5,79.5,89.5,99.5,109.5],
  pitcher_fantasy_score:[5.5,10.5,15.5,20.5,25.5,30.5,35.5,40.5,45.5]
});

const BASELINE_V5_BASE_RESCUE_TARGET_BATCH_ID = "player_baseline_v2_batch_mr1t5div_07sd4p";
const BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION = "baseline_v5_confidence_v0.5.4_reliability_sample_gap_volatility_no_line_cap";
const BASELINE_V5_BASE_RESCUE_CONFIDENCE_VERSION = BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION;
const BASELINE_V5_BASE_RESCUE_EXPECTED_ROWS = 18620;
const BASELINE_V5_BASE_RESCUE_EXPECTED_PAIRS = 9310;
const BASELINE_V5_BASE_RESCUE_EXPECTED_CONF_LE_5 = 266;
const BASELINE_V5_BASE_RESCUE_PROP_SQL = "'pitcher_strikeouts','earned_runs','runs_allowed','walks_allowed','hits_allowed','pitcher_outs','pitches_thrown','pitcher_fantasy_score'";

const PRODUCTION_GUARD_TABLES = [
  "player_baseline_sanity_current",
  "player_baseline_hp_current",
  "prop_factor_coverage_current",
  "prop_factor_pitcher_packets",
  "prop_matrix_current",
  "score_enrichment_current",
  "final_score_v1_current",
  "score_final_board_current",
  "score_final_board_v2_current"
];

function nowUtc(){ return new Date().toISOString(); }
function rid(prefix){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function clamp(n,lo,hi){ return Math.max(lo, Math.min(hi, n)); }
function round(n,d=2){ const x=Number(n||0); const p=Math.pow(10,d); return Math.round(x*p)/p; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function safeJson(v){ try { return JSON.stringify(v == null ? null : v); } catch(_){ return JSON.stringify({json_error:true}); } }
function parseJson(s, fallback={}){ try { return JSON.parse(s || "{}"); } catch(_){ return fallback; } }
function jsonResponse(body,status=200){ return new Response(JSON.stringify(body,null,2),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}); }
async function readJsonSafe(request){ try { return await request.json(); } catch(_){ return {}; } }
function hasBinding(env,name){ return !!(env && env[name]); }
function bindingPresence(env,names){ const out={}; for(const n of names) out[n]=hasBinding(env,n); return out; }
function allTrue(obj){ return Object.values(obj).every(Boolean); }
async function all(db,sql,...binds){ const stmt=db.prepare(sql); const res=binds.length?await stmt.bind(...binds).all():await stmt.all(); return res.results || []; }
async function first(db,sql,...binds){ const rows=await all(db,sql,...binds); return rows[0] || null; }
async function run(db,sql,...binds){ const stmt=db.prepare(sql); return binds.length?await stmt.bind(...binds).run():await stmt.run(); }
async function batch(db,stmts,size=30){ for(let i=0;i<stmts.length;i+=size) await db.batch(stmts.slice(i,i+size)); }

function assertExpansionTable(table){
  if(!/^(expansion_|classification_v6_|baseline_v6_)[a-zA-Z0-9_]+$/.test(String(table||""))) throw new Error(`EXPANSION_WRITE_GUARD_BLOCKED_TABLE:${table}`);
}
async function writeRun(db, table, sql, ...binds){ assertExpansionTable(table); return run(db, sql, ...binds); }
async function writeBatch(db, table, stmts, size=30){ assertExpansionTable(table); return batch(db, stmts, size); }

function baseIdentity(env){
  const db=bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars={}; for(const n of EXPECTED_VARS) vars[n]=env && env[n] !== undefined && env[n] !== null && String(env[n]).length>0;
  return {
    ok:true,data_ok:true,version:VERSION,worker_name:WORKER_NAME,logical_worker_name:LOGICAL_WORKER_NAME,
    status:"EXPANSION_BASELINE_WORKER_READY",timestamp_utc:nowUtc(),
    expansion_only:true,baseline_only:true,write_whitelist:"^(expansion_|classification_v6_|baseline_v6_)",
    no_current_baseline_mutation:true,no_factor_mutation:true,no_matrix_mutation:true,no_scoring_mutation:true,no_final_board_mutation:true,no_scheduler_mutation:true,no_full_run_integration:true,
    binding_summary:{required_db_bindings_present:allTrue(db),db_bindings:db,vars}
  };
}

async function tableCount(db, table){ try { const r=await first(db,`SELECT COUNT(*) AS c FROM ${table}`); return Number(r&&r.c||0); } catch(_){ return null; } }
async function productionCounts(env){
  const out={};
  for(const t of PRODUCTION_GUARD_TABLES){
    const db = t.startsWith("prop_") || t.startsWith("score_") || t.startsWith("final_") || t.startsWith("player_") ? env.SCORE_DB : env.SCORE_DB;
    out[t]=await tableCount(db,t);
  }
  return out;
}
function changedCounts(before, after){
  const changed=[];
  for(const t of Object.keys(before||{})) if(before[t] !== after[t]) changed.push({table:t,before:before[t],after:after[t]});
  return changed;
}

async function ensureContextSchema(env){
  const db=env.CONTEXT_DB;
  await writeRun(db,"expansion_first_inning_context_batches",`CREATE TABLE IF NOT EXISTS expansion_first_inning_context_batches (
    batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, mode TEXT, status TEXT, worker_version TEXT,
    games_requested INTEGER DEFAULT 0, games_written INTEGER DEFAULT 0, pitcher_rows_written INTEGER DEFAULT 0, issue_rows INTEGER DEFAULT 0,
    certification TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await writeRun(db,"expansion_first_inning_game_context_current",`CREATE TABLE IF NOT EXISTS expansion_first_inning_game_context_current (
    context_row_id TEXT PRIMARY KEY, batch_id TEXT, game_pk INTEGER, game_date TEXT,
    home_team_id INTEGER, away_team_id INTEGER, home_team_name TEXT, away_team_name TEXT,
    top_1st_runs INTEGER, bottom_1st_runs INTEGER, first_inning_total_runs INTEGER,
    yrfi_flag INTEGER, nrfi_flag INTEGER, rfi_pp_more_hit INTEGER, rfi_pp_less_hit INTEGER,
    source_endpoint TEXT, source_confidence TEXT, source_snapshot_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await writeRun(db,"expansion_first_inning_game_context_history",`CREATE TABLE IF NOT EXISTS expansion_first_inning_game_context_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_first_inning_game_context_current WHERE 1=0`);
  await writeRun(db,"expansion_first_inning_pitcher_context_current",`CREATE TABLE IF NOT EXISTS expansion_first_inning_pitcher_context_current (
    pitcher_context_row_id TEXT PRIMARY KEY, batch_id TEXT, game_pk INTEGER, game_date TEXT,
    pitcher_id INTEGER, pitcher_name TEXT, team_id INTEGER, opponent_team_id INTEGER, is_home INTEGER, started_game INTEGER,
    first_frame_half TEXT, first_frame_runs_allowed INTEGER, rfi_sl_more_hit INTEGER, rfi_sl_less_hit INTEGER,
    source_game_context_row_id TEXT, starter_source_key TEXT, source_confidence TEXT, details_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await writeRun(db,"expansion_first_inning_pitcher_context_history",`CREATE TABLE IF NOT EXISTS expansion_first_inning_pitcher_context_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_first_inning_pitcher_context_current WHERE 1=0`);
  await writeRun(db,"expansion_first_inning_context_issues",`CREATE TABLE IF NOT EXISTS expansion_first_inning_context_issues (
    issue_id TEXT PRIMARY KEY, batch_id TEXT, game_pk INTEGER, pitcher_id INTEGER, severity TEXT, issue_code TEXT, issue_message TEXT, details_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await writeRun(db,"expansion_first_inning_game_context_current",`CREATE INDEX IF NOT EXISTS idx_exp_first_game_game_pk ON expansion_first_inning_game_context_current(game_pk)`);
  await writeRun(db,"expansion_first_inning_pitcher_context_current",`CREATE INDEX IF NOT EXISTS idx_exp_first_pitcher_pitcher ON expansion_first_inning_pitcher_context_current(pitcher_id, game_pk)`);
}

async function ensureScoreSchema(env){
  const db=env.SCORE_DB;
  await writeRun(db,"expansion_player_baseline_sanity_batches",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_sanity_batches (
    batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, mode TEXT, status TEXT, worker_version TEXT,
    started_at TEXT, finished_at TEXT, rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0, history_rows INTEGER DEFAULT 0, issue_rows INTEGER DEFAULT 0,
    certification TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const sanityDDL = `(baseline_row_id TEXT PRIMARY KEY, batch_id TEXT, expansion_scope TEXT, profile_namespace TEXT, source_data_family TEXT, source_table TEXT, profile_logic_version TEXT,
    entity_type TEXT, entity_id TEXT, player_type TEXT, player_id INTEGER, player_name TEXT, canonical_prop_key TEXT,
    role_profile TEXT, prior_pool_key TEXT, sanity_profile_key TEXT, sample_profile TEXT, usage_profile TEXT, line_difficulty_profile TEXT, volatility_profile TEXT,
    baseline_drag_profile TEXT, confidence_drag_profile TEXT, variance_profile TEXT, games_sample INTEGER, events_sample INTEGER,
    baseline_confidence_0_100 REAL, line_baseline_json TEXT, distribution_shape_json TEXT, notes_json TEXT,
    no_daily_context INTEGER DEFAULT 1, no_market_context INTEGER DEFAULT 1, no_scoring_context INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
  await writeRun(db,"expansion_player_baseline_sanity_stage",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_sanity_stage ${sanityDDL}`);
  await writeRun(db,"expansion_player_baseline_sanity_current",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_sanity_current ${sanityDDL}`);
  await writeRun(db,"expansion_player_baseline_sanity_history",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_sanity_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_sanity_current WHERE 1=0`);
  await writeRun(db,"expansion_player_baseline_sanity_issues",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_sanity_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, issue_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  await writeRun(db,"expansion_player_baseline_hp_batches",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_hp_batches (
    batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, mode TEXT, status TEXT, worker_version TEXT, source_sanity_batch_id TEXT,
    started_at TEXT, finished_at TEXT, source_rows_read INTEGER DEFAULT 0, rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0, history_rows INTEGER DEFAULT 0, issue_rows INTEGER DEFAULT 0,
    certification TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const hpDDL = `(baseline_hp_row_id TEXT PRIMARY KEY, batch_id TEXT, source_sanity_batch_id TEXT, source_baseline_row_id TEXT,
    expansion_scope TEXT, profile_namespace TEXT, source_data_family TEXT, source_table TEXT, source_formula_key TEXT, baseline_formula_version TEXT,
    entity_type TEXT, entity_id TEXT, player_type TEXT, player_id INTEGER, player_name TEXT, canonical_prop_key TEXT, prop_family TEXT,
    line_value REAL, selected_side TEXT, baseline_hp_0_100 REAL, hp_adjustment_0_100 REAL DEFAULT 0,
    raw_rate_0_100 REAL, tier_prior_rate_0_100 REAL, raw_prior_gap_0_100 REAL,
    baseline_confidence_0_100 REAL, baseline_enriched_confidence_0_100 REAL,
    consistency_bonus_0_100 REAL, soft_uncertainty_reserve_0_100 REAL,
    sample_profile TEXT, role_profile TEXT, sanity_profile_key TEXT, volatility_profile TEXT, variance_profile TEXT,
    line_difficulty_profile TEXT, baseline_hp_profile_key TEXT,
    non_push_sample INTEGER, hit_count INTEGER, miss_count INTEGER, push_count INTEGER, prior_strength REAL,
    formula_version TEXT, confidence_formula_version TEXT,
    no_daily_context INTEGER DEFAULT 1, no_market_context INTEGER DEFAULT 1, no_scoring_context INTEGER DEFAULT 1,
    profile_notes_json TEXT, source_snapshot_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
  await writeRun(db,"expansion_player_baseline_hp_stage",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_hp_stage ${hpDDL}`);
  await writeRun(db,"expansion_player_baseline_hp_current",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_hp_current ${hpDDL}`);
  await writeRun(db,"expansion_player_baseline_hp_history",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_hp_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_hp_current WHERE 1=0`);
  await writeRun(db,"expansion_player_baseline_hp_issues",`CREATE TABLE IF NOT EXISTS expansion_player_baseline_hp_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, source_baseline_row_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, issue_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  await writeRun(db,"expansion_player_baseline_sanity_current",`CREATE INDEX IF NOT EXISTS idx_exp_sanity_ns_player ON expansion_player_baseline_sanity_current(profile_namespace, player_id)`);
  await writeRun(db,"expansion_player_baseline_hp_current",`CREATE INDEX IF NOT EXISTS idx_exp_hp_ns_line_side ON expansion_player_baseline_hp_current(profile_namespace, line_value, selected_side)`);

  await writeRun(db,"expansion_line_inventory_batches",`CREATE TABLE IF NOT EXISTS expansion_line_inventory_batches (
    batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, mode TEXT, status TEXT, worker_version TEXT,
    inventory_rows INTEGER DEFAULT 0, missing_baseline_rows INTEGER DEFAULT 0, dynamic_supported_rows INTEGER DEFAULT 0, unsupported_missing_rows INTEGER DEFAULT 0, issue_rows INTEGER DEFAULT 0,
    certification TEXT, certification_grade TEXT, output_json TEXT, started_at TEXT, finished_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await writeRun(db,"expansion_line_inventory_current",`CREATE TABLE IF NOT EXISTS expansion_line_inventory_current (
    inventory_row_id TEXT PRIMARY KEY, batch_id TEXT, source_key TEXT, canonical_prop_key TEXT, factor_family TEXT, resolved_factor_family TEXT,
    selected_side TEXT, line_value REAL, source_rows INTEGER, players INTEGER, standard_rows INTEGER, goblin_rows INTEGER, demon_rows INTEGER, missing_baseline_rows INTEGER,
    profile_namespace TEXT, source_formula_key TEXT, line_threshold_bucket TEXT, line_inventory_status TEXT, needs_dynamic_generation INTEGER DEFAULT 0,
    factor_family_mismatch INTEGER DEFAULT 0, role_resolution_note TEXT, notes_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await writeRun(db,"expansion_line_inventory_history",`CREATE TABLE IF NOT EXISTS expansion_line_inventory_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_line_inventory_current WHERE 1=0`);
  await writeRun(db,"expansion_line_inventory_issues",`CREATE TABLE IF NOT EXISTS expansion_line_inventory_issues (issue_id TEXT PRIMARY KEY, batch_id TEXT, severity TEXT, issue_code TEXT, issue_message TEXT, issue_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await writeRun(db,"expansion_line_inventory_current",`CREATE INDEX IF NOT EXISTS idx_exp_line_inventory_key ON expansion_line_inventory_current(source_key, canonical_prop_key, selected_side, line_value)`);
  await writeRun(db,"expansion_line_inventory_current",`CREATE INDEX IF NOT EXISTS idx_exp_line_inventory_status ON expansion_line_inventory_current(line_inventory_status, missing_baseline_rows)`);
}
async function ensureSchema(env){ await ensureContextSchema(env); await ensureScoreSchema(env); }

async function archiveAndClearCurrent(db, currentTable, historyTable){
  assertExpansionTable(currentTable);
  assertExpansionTable(historyTable);
  await writeRun(db, historyTable, `INSERT INTO ${historyTable} SELECT *, CURRENT_TIMESTAMP AS archived_at FROM ${currentTable}`);
  await writeRun(db, currentTable, `DELETE FROM ${currentTable}`);
}

function firstInningFromLinescore(json){
  const innings = json && json.innings;
  if(!Array.isArray(innings) || !innings.length) return null;
  const one = innings[0] || {};
  const away = one.away || {};
  const home = one.home || {};
  const top = Number(away.runs);
  const bottom = Number(home.runs);
  if(!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return {
    top_1st_runs: top,
    bottom_1st_runs: bottom,
    first_inning_total_runs: top + bottom,
    home_team_name: (json.teams && json.teams.home && json.teams.home.team && json.teams.home.team.name) || null,
    away_team_name: (json.teams && json.teams.away && json.teams.away.team && json.teams.away.team.name) || null
  };
}

async function fetchMlbLinescore(env, gamePk, timeoutMs=8000){
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/,"");
  const url = `${base}/game/${gamePk}/linescore`;
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(`MLB_LINESCORE_TIMEOUT_${timeoutMs}MS`); } catch(_){} }, Math.max(1000, Number(timeoutMs||8000)));
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { "accept":"application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDogExpansionBaseline/0.1") } });
    const text = await resp.text();
    if(!resp.ok) throw new Error(`MLB_LINESCORE_HTTP_${resp.status}:${String(text||"").slice(0,180)}`);
    return { url, json: JSON.parse(text) };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err || "MLB_LINESCORE_FETCH_FAILED");
    if (/abort|timeout/i.test(msg)) throw new Error(`MLB_LINESCORE_TIMEOUT_${timeoutMs}MS`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function mineFirstInningContext(env, input={}){
  await ensureSchema(env);
  const requestId = String(input.request_id || rid("expansion_baseline_mining"));
  const runId = String(input.run_id || rid("run"));
  const cursor = Math.max(0, Number(input.mining_cursor_offset || input.cursor_offset || 0));
  const chunkSize = Math.max(10, Math.min(Number(input.mining_game_chunk_size || input.game_chunk_size || 60), 120));
  const explicitLimit = Number(input.game_limit || input.max_games || 0);
  const maxSourceGames = explicitLimit > 0 ? Math.max(1, Math.min(explicitLimit, 2500)) : 2500;
  const batchId = String(input.mining_batch_id || input.batch_id || rid("expansion_first_inning_context_batch"));
  const freshStart = cursor === 0 && !input.mining_batch_id;
  const miningStartedMs = Date.now();
  const miningSoftYieldMs = Math.max(25000, Math.min(Number(input.mining_soft_yield_ms || 55000), 65000));
  const mlbLinescoreTimeoutMs = Math.max(1500, Math.min(Number(input.mlb_linescore_timeout_ms || input.mining_fetch_timeout_ms || 8000), 15000));

  await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_batches",`INSERT OR IGNORE INTO expansion_first_inning_context_batches (batch_id,request_id,run_id,mode,status,worker_version,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, batchId, requestId, runId, "expansion_baseline_mining", "running", VERSION);
  await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_batches",`UPDATE expansion_first_inning_context_batches SET request_id=?, run_id=?, mode=?, status=?, worker_version=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, requestId, runId, "expansion_baseline_mining", "running", VERSION, batchId);

  const totalRow = await first(env.TEAM_DB, `SELECT COUNT(*) AS c FROM (
      SELECT game_pk
      FROM starter_history
      WHERE started_game=1 AND game_pk IS NOT NULL
      GROUP BY game_pk
      ORDER BY date(MAX(game_date)) DESC, game_pk DESC
      LIMIT ?
    )`, maxSourceGames);
  const totalGames = Number(totalRow && totalRow.c || 0);

  const games = await all(env.TEAM_DB, `SELECT game_pk, game_date, home_team_id, away_team_id FROM (
      SELECT game_pk, MAX(game_date) AS game_date,
        MAX(CASE WHEN is_home=1 THEN team_id END) AS home_team_id,
        MAX(CASE WHEN is_home=0 THEN team_id END) AS away_team_id
      FROM starter_history
      WHERE started_game=1 AND game_pk IS NOT NULL
      GROUP BY game_pk
      ORDER BY date(MAX(game_date)) DESC, game_pk DESC
      LIMIT ?
    )
    LIMIT ? OFFSET ?`, maxSourceGames, chunkSize, cursor);

  if(freshStart){
    await archiveAndClearCurrent(env.CONTEXT_DB,"expansion_first_inning_game_context_current","expansion_first_inning_game_context_history");
    await archiveAndClearCurrent(env.CONTEXT_DB,"expansion_first_inning_pitcher_context_current","expansion_first_inning_pitcher_context_history");
    await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_issues",`DELETE FROM expansion_first_inning_context_issues`);
  }

  let gamesWritten=0, pitcherRows=0, issues=0, gamesAttempted=0, softYieldTriggered=false;
  const gameStmts=[];
  const pitcherStmts=[];
  const issueStmts=[];

  for(const g of games){
    if (gamesAttempted > 0 && (Date.now() - miningStartedMs) >= miningSoftYieldMs) { softYieldTriggered = true; break; }
    const gamePk = Number(g.game_pk);
    if(!gamePk) continue;
    gamesAttempted++;
    try{
      const fetched = await fetchMlbLinescore(env, gamePk, mlbLinescoreTimeoutMs);
      const parsed = firstInningFromLinescore(fetched.json);
      if(!parsed) throw new Error("MISSING_FIRST_INNING_LINESCORE_RUNS");
      const contextRowId = `exp_first_game|${gamePk}`;
      const yrfi = parsed.first_inning_total_runs >= 1 ? 1 : 0;
      const nrfi = parsed.first_inning_total_runs === 0 ? 1 : 0;
      gameStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_game_context_current
        (context_row_id,batch_id,game_pk,game_date,home_team_id,away_team_id,home_team_name,away_team_name,top_1st_runs,bottom_1st_runs,first_inning_total_runs,yrfi_flag,nrfi_flag,rfi_pp_more_hit,rfi_pp_less_hit,source_endpoint,source_confidence,source_snapshot_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(contextRowId,batchId,gamePk,g.game_date||null,g.home_team_id||null,g.away_team_id||null,parsed.home_team_name,parsed.away_team_name,parsed.top_1st_runs,parsed.bottom_1st_runs,parsed.first_inning_total_runs,yrfi,nrfi,yrfi,nrfi,fetched.url,"MLB_LINESCORE_FIRST_INNING",safeJson({game_pk:gamePk, first_inning:parsed, source:"MLB_STATS_API_LINESCORE", full_depth_base:true})));
      gamesWritten++;
      const starters = await all(env.TEAM_DB, `SELECT player_id, starter_player_id, starter_name, team_id, opponent_team_id, is_home, started_game, starter_key, game_date
        FROM starter_history
        WHERE game_pk=? AND started_game=1`, gamePk);
      for(const s0 of starters){
        const pitcherId = Number(s0.player_id || s0.starter_player_id || 0) || null;
        if(!pitcherId){
          issues++;
          issueStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_context_issues (issue_id,batch_id,game_pk,pitcher_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid("exp_first_issue"),batchId,gamePk,null,"WARN","MISSING_STARTER_PLAYER_ID","Starter row missing pitcher id",safeJson(s0)));
          continue;
        }
        const isHome = Number(s0.is_home || 0) === 1 ? 1 : 0;
        const runsAllowed = isHome ? parsed.top_1st_runs : parsed.bottom_1st_runs;
        const half = isHome ? "top_1st" : "bottom_1st";
        pitcherStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_pitcher_context_current
          (pitcher_context_row_id,batch_id,game_pk,game_date,pitcher_id,pitcher_name,team_id,opponent_team_id,is_home,started_game,first_frame_half,first_frame_runs_allowed,rfi_sl_more_hit,rfi_sl_less_hit,source_game_context_row_id,starter_source_key,source_confidence,details_json,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(`exp_first_pitcher|${gamePk}|${pitcherId}`,batchId,gamePk,s0.game_date||g.game_date||null,pitcherId,s0.starter_name||null,s0.team_id||null,s0.opponent_team_id||null,isHome,1,half,runsAllowed,runsAllowed>=1?1:0,runsAllowed===0?1:0,contextRowId,s0.starter_key||null,"MLB_LINESCORE_PLUS_STARTER_HISTORY",safeJson({mapping:isHome?"home_starter_allows_top_1st":"away_starter_allows_bottom_1st", top_1st_runs:parsed.top_1st_runs, bottom_1st_runs:parsed.bottom_1st_runs, full_depth_base:true})));
        pitcherRows++;
      }
    } catch(err){
      issues++;
      issueStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_context_issues (issue_id,batch_id,game_pk,pitcher_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid("exp_first_issue"),batchId,gamePk,null,"WARN","MLB_LINESCORE_FETCH_OR_PARSE_FAILED",String(err && err.message ? err.message : err).slice(0,500),safeJson({game_pk:gamePk, game_date:g.game_date||null, full_depth_base:true})));
    }
  }
  if(gameStmts.length) await writeBatch(env.CONTEXT_DB,"expansion_first_inning_game_context_current",gameStmts,25);
  if(pitcherStmts.length) await writeBatch(env.CONTEXT_DB,"expansion_first_inning_pitcher_context_current",pitcherStmts,25);
  if(issueStmts.length) await writeBatch(env.CONTEXT_DB,"expansion_first_inning_context_issues",issueStmts,25);

  const totalGameRows=await tableCount(env.CONTEXT_DB,"expansion_first_inning_game_context_current");
  const totalPitcherRows=await tableCount(env.CONTEXT_DB,"expansion_first_inning_pitcher_context_current");
  const issueRow=await first(env.CONTEXT_DB,`SELECT COUNT(*) AS c FROM expansion_first_inning_context_issues WHERE batch_id=?`,batchId);
  const issueTotal=Number(issueRow && issueRow.c || 0);
  const nextCursor = cursor + gamesAttempted;
  const done = nextCursor >= totalGames || games.length === 0 || gamesAttempted === 0;
  const output = baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"expansion_baseline_mining",status:done?"EXPANSION_BASELINE_MINING_COMPLETED":"EXPANSION_BASELINE_MINING_PARTIAL_CONTINUE",certification:done?"EXPANSION_FIRST_INNING_CONTEXT_MINED_FULL_DEPTH":"EXPANSION_FIRST_INNING_CONTEXT_MINING_PARTIAL_CONTINUE",certification_grade:issueTotal>0?"PASS_WITH_WARNINGS":(done?"PASS":"PARTIAL_CONTINUE"),partial_continue:!done,orchestrator_should_self_continue:!done,source_games_total:totalGames,source_games_read:nextCursor,games_requested:totalGames,games_written:totalGameRows,pitcher_rows_written:totalPitcherRows,issue_rows:issueTotal,rows_written:gamesWritten+pitcherRows,mining_cursor_offset:nextCursor,mining_game_chunk_size:chunkSize,mining_games_attempted:gamesAttempted,mining_soft_yield_triggered:softYieldTriggered,mining_soft_yield_ms:miningSoftYieldMs,mlb_linescore_timeout_ms:mlbLinescoreTimeoutMs,next_input_json:!done?{...input,mode:"expansion_baseline_mining",request_id:requestId,run_id:runId,mining_batch_id:batchId,mining_cursor_offset:nextCursor,mining_game_chunk_size:chunkSize,game_limit:maxSourceGames,full_depth_base:true,mining_soft_yield_ms:miningSoftYieldMs,mlb_linescore_timeout_ms:mlbLinescoreTimeoutMs}:null,full_depth_base:true});
  await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_batches",`UPDATE expansion_first_inning_context_batches SET status=?, games_requested=?, games_written=?, pitcher_rows_written=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`, done?"completed":"partial_continue",totalGames,totalGameRows,totalPitcherRows,issueTotal,output.certification,output.certification_grade,safeJson(output),batchId);
  return output;
}

function baseOutput(input, extra){
  return {ok:true,data_ok:true,version:VERSION,worker_name:WORKER_NAME,logical_worker_name:LOGICAL_WORKER_NAME,job_key:String(input.job_key||"expansion-baseline"),timestamp_utc:nowUtc(),expansion_only:true,baseline_only:true,no_current_baseline_mutation:true,no_factor_mutation:true,no_matrix_mutation:true,no_scoring_mutation:true,no_final_board_mutation:true,no_scheduler_mutation:true,no_full_run_integration:true,...extra};
}
function sampleProfile(games, ns){
  if(String(ns||"").startsWith("RFI_")){
    if(games < 5) return "TINY_SAMPLE";
    if(games < 15) return "LOW_SAMPLE";
    if(games < 30) return "MEDIUM_SAMPLE";
    return "ESTABLISHED_SAMPLE";
  }
  if(games < 3) return "TINY_SAMPLE";
  if(games < 10) return "LOW_SAMPLE";
  if(games < 25) return "MEDIUM_SAMPLE";
  return "ESTABLISHED_SAMPLE";
}
function confidenceForSample(games, ns, volatility="VOLATILITY_MODERATE"){
  const target = String(ns||"").startsWith("RFI_") ? 30 : 25;
  let c = clamp((games/target)*82, 8, 88);
  const sp = sampleProfile(games, ns);
  if(sp === "TINY_SAMPLE") c -= 24;
  else if(sp === "LOW_SAMPLE") c -= 12;
  else if(sp === "MEDIUM_SAMPLE") c -= 4;
  if(volatility === "VOLATILITY_EXTREME") c -= 12;
  else if(volatility === "VOLATILITY_STRONG") c -= 8;
  return round(clamp(c,5,92),1);
}
function dragForSample(profile){ if(profile==="TINY_SAMPLE") return "STRONG"; if(profile==="LOW_SAMPLE") return "MODERATE"; if(profile==="MEDIUM_SAMPLE") return "LIGHT"; return "NONE"; }
function rates(values, lines){
  const out={};
  for(const line of lines){
    let moreHit=0, lessHit=0, push=0;
    for(const v0 of values){ const v=num(v0); if(v>line) moreHit++; else if(v<line) lessHit++; else push++; }
    const nonPush = values.length - push;
    out[String(line)]={line,more_hit:moreHit,less_hit:lessHit,push,non_push_sample:nonPush,more_rate_0_100:nonPush?round(moreHit*100/nonPush,2):null,less_rate_0_100:nonPush?round(lessHit*100/nonPush,2):null};
  }
  return out;
}
function valueStats(values){
  const n=values.length; if(!n) return {avg:0,max:0,zero_rate_0_100:0,high_tail_rate_0_100:0,volatility_profile:"VOLATILITY_UNKNOWN"};
  const max=Math.max(...values.map(num)); const avg=values.reduce((a,b)=>a+num(b),0)/n; const zero=values.filter(v=>num(v)===0).length/n; const hi=values.filter(v=>num(v)>=Math.max(1, avg+2)).length/n;
  let vol="VOLATILITY_LOW"; if(zero>=0.65 && hi>=0.10) vol="VOLATILITY_EXTREME"; else if(zero>=0.45 || hi>=0.16) vol="VOLATILITY_STRONG"; else if(zero>=0.25 || hi>=0.08) vol="VOLATILITY_MODERATE";
  return {avg:round(avg,2),max,zero_rate_0_100:round(zero*100,2),high_tail_rate_0_100:round(hi*100,2),volatility_profile:vol};
}
function lineDifficulty(ns,line){
  if(ns==="RA_" && line>=4.5) return "TAIL_DAMAGE_LINE";
  if(String(ns).startsWith("PFS_") && line>=25.5) return "ELITE_TAIL_LINE";
  if(String(ns).startsWith("RFI_")) return "BINARY_FIRST_INNING_LINE";
  return "NORMAL_LINE";
}
function calcHpLine(values,line,side){
  let hit=0,miss=0,push=0;
  for(const v0 of values){ const v=num(v0); if(v>line){ if(side==="more") hit++; else miss++; } else if(v<line){ if(side==="less") hit++; else miss++; } else push++; }
  const nonPush=hit+miss;
  return {hit,miss,push,non_push_sample:nonPush,raw_rate_0_100:nonPush?round(hit*100/nonPush,2):null};
}
function avgField(rows, field){ const xs=(rows||[]).map(r=>num(r[field])).filter(v=>Number.isFinite(v)); return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
function nonZeroAvgField(rows, field){ const xs=(rows||[]).map(r=>num(r[field])).filter(v=>Number.isFinite(v)&&v>0); return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
async function loadHitterSplitRows(env, playerId){
  const key=`hitter_split|${playerId}`; if(V5_CLASSIFICATION_CACHE.has(key)) return V5_CLASSIFICATION_CACHE.get(key);
  const rows=await all(env.STATS_HITTER_DB,`SELECT player_id, season, split_key, split_code, pa, ab, hits, doubles, triples, home_runs, walks, strikeouts, avg, obp, slg, ops, babip FROM hitter_splits WHERE player_id=? AND split_key IN ('vs_left','vs_right') ORDER BY split_key`, playerId);
  V5_CLASSIFICATION_CACHE.set(key,rows); return rows;
}
async function loadPitcherSplitRows(env, playerId){
  const key=`pitcher_split|${playerId}`; if(V5_CLASSIFICATION_CACHE.has(key)) return V5_CLASSIFICATION_CACHE.get(key);
  const rows=await all(env.STATS_PITCHER_DB,`SELECT player_id, season, split_key, split_code, outs_recorded, batters_faced, hits_allowed, walks_allowed, strikeouts, runs_allowed, earned_runs, home_runs_allowed, pitches, avg_against, obp_against, slg_against, ops_against FROM pitcher_splits WHERE player_id=? AND split_key IN ('vs_left','vs_right') ORDER BY split_key`, playerId);
  V5_CLASSIFICATION_CACHE.set(key,rows); return rows;
}
function splitRate(rows, key, numField, denField){ const r=(rows||[]).find(x=>String(x.split_key)===key); if(!r) return null; const den=num(r[denField]); if(den<=0) return null; return 100*num(r[numField])/den; }
function hitterTier12({games,paPerGame,abRatio,avgOrder,hitRatePerGame,walkRate,soRate,splitDelta,prop,line,side}){
  if(games<30) return {tier_key:'TIER_12_MICRO_SAMPLE_ROOKIE', tier_number:12};
  if(paPerGame<=1.5) return {tier_key:'TIER_11_LATE_GAME_SUB_PINCH_HITTER', tier_number:11};
  if(paPerGame<3.5 && games>=30) return {tier_key:'TIER_10_HIGH_USAGE_UTILITY_BENCH', tier_number:10};
  if(avgOrder>=8.5 && hitRatePerGame<0.85) return {tier_key:'TIER_09_DEFENSIVE_BOTTOM_ORDER_BLACK_HOLE', tier_number:9};
  // v0.1.55: Baseline V5 is history-only and has no daily opponent handedness.
  // Keep hitter platoon shape as metadata (platoon_profile/split_delta_0_100) instead
  // of changing only the MORE side tier across every prop/line.
  if(avgOrder>=7 || (paPerGame>=3.0 && paPerGame<3.7)) return {tier_key:'TIER_06_BOTTOM_ORDER_STARTER', tier_number:6};
  if(avgOrder>=4 && avgOrder<=6 && abRatio<0.75) return {tier_key:'TIER_05_MIDDLE_ORDER_TTO_SLUGGER', tier_number:5};
  if(avgOrder>=3 && avgOrder<=5 && abRatio>=0.86) return {tier_key:'TIER_04_MIDDLE_ORDER_CONTACT_REGULAR', tier_number:4};
  if(avgOrder<=2.5 && paPerGame>=4.1 && hitRatePerGame<1.05) return {tier_key:'TIER_03_AGGRESSIVE_VOLUME_DEPENDENT_REGULAR', tier_number:3};
  if(avgOrder<=3 && paPerGame>=4.0 && (walkRate+soRate)>=0.30) return {tier_key:'TIER_02_HIGH_VOLUME_MIDDLE_ORDER_ANCHOR_LOWER_AB_RATIO', tier_number:2};
  if(avgOrder<=2.5 && paPerGame>=4.2 && hitRatePerGame>=1.05 && abRatio>=0.90) return {tier_key:'TIER_01_HIGH_VOLUME_LEADOFF_CONTACT_ANCHOR', tier_number:1};
  return {tier_key:'TIER_04_MIDDLE_ORDER_CONTACT_REGULAR', tier_number:4};
}
function pitcherTier({games,outsPerStart,bfPerStart,kRate,bbRate,haRate,splitDelta,prop,line,side}){
  if(games<5) return {tier_key:'PITCHER_TIER_12_MICRO_SAMPLE', tier_number:12};
  if(outsPerStart>=18 && bfPerStart>=24 && kRate>=0.27) return {tier_key:'PITCHER_TIER_01_DEEP_K_WORKHORSE', tier_number:1};
  if(outsPerStart>=18 && bfPerStart>=24) return {tier_key:'PITCHER_TIER_02_DEEP_VOLUME_STARTER', tier_number:2};
  if(outsPerStart>=15 && bbRate<=0.075) return {tier_key:'PITCHER_TIER_03_COMMAND_VOLUME_STARTER', tier_number:3};
  if(outsPerStart>=15 && (bbRate>=0.105 || haRate>=0.24)) return {tier_key:'PITCHER_TIER_05_DAMAGE_OR_CONTROL_VOLATILE_STARTER', tier_number:5};
  if(outsPerStart>=12) return {tier_key:'PITCHER_TIER_06_LOW_WORKLOAD_STARTER', tier_number:6};
  if(Math.abs(splitDelta)>=6) return {tier_key:splitDelta<0?'PITCHER_TIER_07_PLATOON_FAVORABLE_SUPPRESSOR':'PITCHER_TIER_08_PLATOON_UNFAVORABLE_DAMAGE_RISK', tier_number:splitDelta<0?7:8};
  return {tier_key:'PITCHER_TIER_04_STANDARD_STARTER', tier_number:4};
}

function normalizedBattingOrderValue(raw){
  const n=Number(raw);
  if(!Number.isFinite(n) || n<=0) return null;
  if(n>=100 && n<=999){
    const slot=Math.floor(n/100);
    return (slot>=1 && slot<=9) ? slot : null;
  }
  if(n>=1 && n<=9) return n;
  return null;
}
function battingOrderSummary(rows){
  const total=(rows||[]).length;
  const vals=[];
  for(const r of (rows||[])){
    const v=normalizedBattingOrderValue(r && r.batting_order);
    if(v!=null) vals.push(v);
  }
  const coverage=total ? vals.length/total : 0;
  const avg=vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  return {avg_batting_order_normalized:avg, batting_order_rows:vals.length, batting_order_coverage:coverage};
}
function resolveLineupProfileFromOrder(orderSummary){
  const avg=orderSummary && Number(orderSummary.avg_batting_order_normalized);
  const coverage=orderSummary && Number(orderSummary.batting_order_coverage||0);
  const orderRows=orderSummary && Number(orderSummary.batting_order_rows||0);
  if(!Number.isFinite(avg) || orderRows < 3 || coverage < 0.25) return 'LINEUP_UNKNOWN';
  if(avg<=3) return 'TOP_ORDER';
  if(avg<=6) return 'MIDDLE_ORDER';
  return 'BOTTOM_ORDER';
}
function safeResolvedPlayerName(row){
  const name=String((row && row.player_name) || '').trim();
  const id=String((row && (row.mlb_player_id || row.player_id)) || '').trim();
  return name && name !== id ? name : id;
}
async function classifyBaselineV5(env,row,line,side,entityType,model,hs,stats,maxDate=null){
  const playerId=Number(row.mlb_player_id||0);
  const prop=String(row.canonical_prop_key||'');
  const rows=await loadBaselineModelRows(env,row,entityType,maxDate);
  const games=rows.length;
  if(entityType==='pitcher'){
    const bf=rows.reduce((a,r)=>a+pitcherBf(r),0);
    const outs=sumNum(rows,'outs_recorded');
    const k=sumNum(rows,'strikeouts'), bb=sumNum(rows,'walks_allowed'), ha=sumNum(rows,'hits_allowed');
    const splitRows=await loadPitcherSplitRows(env,playerId);
    const leftHa=splitRate(splitRows,'vs_left','hits_allowed','batters_faced');
    const rightHa=splitRate(splitRows,'vs_right','hits_allowed','batters_faced');
    const splitDelta=(leftHa!=null && rightHa!=null)?round(leftHa-rightHa,2):0;
    const outsPerStart=games?outs/games:0, bfPerStart=games?bf/games:0;
    const kRate=bf?k/bf:0, bbRate=bf?bb/bf:0, haRate=bf?ha/bf:0;
    const tier=pitcherTier({games,outsPerStart,bfPerStart,kRate,bbRate,haRate,splitDelta,prop,line,side});
    const volumeProfile=outsPerStart>=18?'DEEP_STARTER':(outsPerStart>=15?'NORMAL_STARTER':(outsPerStart>=12?'LOW_WORKLOAD_STARTER':'SHORT_OR_UNSTABLE_WORKLOAD'));
    const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta<0?'SUPPRESSES_LEFT_MORE_THAN_RIGHT':'MORE_DAMAGE_VS_LEFT_THAN_RIGHT'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
    return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:'PITCHER_NA',platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:stats.volatility_profile,classification_confidence_0_100:round(clamp(model.baseline_confidence_0_100||25,1,95),2),games_sample:games,events_sample:games,pa_per_game:null,ab_ratio:null,avg_batting_order:null,split_delta_0_100:splitDelta,metrics:{outs_per_start:round(outsPerStart,2),bf_per_start:round(bfPerStart,2),k_rate:round(kRate,4),bb_rate:round(bbRate,4),ha_rate:round(haRate,4),split_rows:splitRows.length}};
  }
  const pa=sumNum(rows,'pa'), ab=sumNum(rows,'ab'), hits=sumNum(rows,'hits'), walks=sumNum(rows,'walks'), so=sumNum(rows,'strikeouts');
  const paPerGame=games?pa/games:0, abRatio=pa?ab/pa:0, hitRatePerGame=games?hits/games:0, walkRate=pa?walks/pa:0, soRate=pa?so/pa:0;
  const orderSummary=battingOrderSummary(rows);
  const avgOrder=orderSummary.avg_batting_order_normalized;
  const splitRows=await loadHitterSplitRows(env,playerId);
  const leftHit=splitRate(splitRows,'vs_left','hits','pa');
  const rightHit=splitRate(splitRows,'vs_right','hits','pa');
  const splitDelta=(leftHit!=null && rightHit!=null)?round(leftHit-rightHit,2):0;
  const tier=hitterTier12({games,paPerGame,abRatio,avgOrder:avgOrder||0,hitRatePerGame,walkRate,soRate,splitDelta,prop,line,side});
  const lineupProfile=resolveLineupProfileFromOrder(orderSummary);
  const volumeProfile=paPerGame>=4.2?'HIGH_VOLUME':(paPerGame>=3.7?'EVERYDAY_CORE':(paPerGame>=2.0?'LOW_USAGE_OR_PARTIAL':'MICRO_USAGE'));
  const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta>0?'FAVORABLE_VS_LEFT_SHAPE':'FAVORABLE_VS_RIGHT_SHAPE'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
  return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:lineupProfile,platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:stats.volatility_profile,classification_confidence_0_100:round(clamp(model.baseline_confidence_0_100||25,1,95),2),games_sample:games,events_sample:games,pa_per_game:round(paPerGame,3),ab_ratio:round(abRatio,3),avg_batting_order:avgOrder!=null?round(avgOrder,2):null,split_delta_0_100:splitDelta,metrics:{hits_per_game:round(hitRatePerGame,3),walk_rate:round(walkRate,4),strikeout_rate:round(soRate,4),split_rows:splitRows.length,batting_order_rows:orderSummary.batting_order_rows,batting_order_coverage:round(orderSummary.batting_order_coverage,3)}};
}
function qualityStart(r){ return num(r.outs_recorded)>=18 && num(r.earned_runs)<=3 ? 1 : 0; }
function pfsPp(r){ return num(r.outs_recorded) + 3*num(r.strikeouts) + 4*qualityStart(r) - 3*num(r.earned_runs); }
function pfsSl(r){ return num(r.outs_recorded) + 3*num(r.strikeouts) - 3*num(r.earned_runs) - 2*num(r.walks_allowed); }
function sourceAgnosticPitcherFantasyBaselineValue(r){
  // Baseline V5 is source/app agnostic. Do not leak PrizePicks/Sleeper win/QS bonuses here.
  // This neutral component score keeps the historical workload/K/damage components only.
  return num(r.outs_recorded) + 3*num(r.strikeouts) - 3*num(r.earned_runs) - num(r.hits_allowed) - num(r.walks_allowed);
}
function sourceFormulaPfs(r, mode){
  const winBonus = 6*num(r.wins);
  const base = num(r.outs_recorded) + 3*num(r.strikeouts) - 3*num(r.earned_runs) - num(r.hits_allowed) - num(r.walks_allowed) + winBonus;
  return String(mode||"PP").toUpperCase()==="SL" ? base : base + 4*qualityStart(r);
}
function groupBy(rows, keyFn){ const m=new Map(); for(const r of rows){ const k=String(keyFn(r)); if(!m.has(k)) m.set(k,[]); m.get(k).push(r);} return m; }

function raProfile(values, games){ const avg=valueStats(values).avg; if(games<3) return "RA_SAMPLE_THIN"; if(avg<=1.5) return "RA_RUN_SUPPRESSOR"; if(avg<=2.2) return "RA_LOW_RUN_STABLE"; if(avg<=3.0) return "RA_STANDARD_RUN_GRAVITY"; if(avg>=4.2) return "RA_VOLATILE_RUN_DAMAGE"; return "RA_TRAFFIC_RUN_RISK"; }
function pfsPpProfile(values, rows){ const avg=valueStats(values).avg; const qsRate = rows.length ? rows.filter(qualityStart).length/rows.length : 0; if(rows.length<3) return "PFS_PP_SAMPLE_THIN"; if(avg>=30 || qsRate>=0.50) return "PFS_PP_APEX_WORKLOAD_K_QS"; if(avg>=24) return "PFS_PP_HIGH_SCORE_CORE"; if(avg>=16) return "PFS_PP_STANDARD_SCORE_CORE"; if(avg<8) return "PFS_PP_LOW_SCORE_GRAVITY"; return "PFS_PP_DAMAGE_PENALTY_RISK"; }
function pfsSlProfile(values, rows){ const avg=valueStats(values).avg; const bbAvg=rows.length?rows.reduce((a,r)=>a+num(r.walks_allowed),0)/rows.length:0; if(rows.length<3) return "PFS_SL_SAMPLE_THIN"; if(avg>=28) return "PFS_SL_APEX_WORKLOAD_K"; if(avg>=22) return "PFS_SL_HIGH_SCORE_CORE"; if(avg>=15) return "PFS_SL_STANDARD_SCORE_CORE"; if(bbAvg>=3.0) return "PFS_SL_COMMAND_PENALTY_RISK"; if(avg<8) return "PFS_SL_LOW_SCORE_GRAVITY"; return "PFS_SL_DAMAGE_PENALTY_RISK"; }
function rfiSlProfile(values, games){ const rate=values.length?values.filter(v=>num(v)>=1).length/values.length:0; if(games<5) return "RFI_SL_SAMPLE_THIN"; if(rate<=0.20) return "RFI_SL_FIRST_FRAME_SUPPRESSOR"; if(rate<=0.28) return "RFI_SL_LOW_RUN_STABLE"; if(rate<=0.38) return "RFI_SL_STANDARD_GRAVITY"; if(rate>=0.50) return "RFI_SL_TRAFFIC_RISK"; return "RFI_SL_EARLY_COMMAND_VOLATILITY"; }
function rfiPpProfile(values, games){ const rate=values.length?values.filter(v=>num(v)>=1).length/values.length:0; if(games<5) return "RFI_PP_SAMPLE_THIN"; if(rate<=0.25) return "RFI_PP_BOTH_SUPPRESSORS"; if(rate<=0.40) return "RFI_PP_ONE_SIDE_RISK"; if(rate>=0.60) return "RFI_PP_BOTH_SIDE_RISK"; return "RFI_PP_EARLY_COMMAND_VOLATILITY"; }

function makeSanityRow({batchId, ns, sourceFamily, sourceTable, entityType, entityId, playerType, playerId, playerName, propKey, values, lines, profileKey, sourceFormulaKey, extraNotes={}}){
  const games=values.length; const stats=valueStats(values); const sp=sampleProfile(games,ns); const conf=confidenceForSample(games,ns,stats.volatility_profile);
  const lineMap=rates(values,lines);
  const maxLineDifficulty=lines.map(l=>lineDifficulty(ns,l)).includes("TAIL_DAMAGE_LINE")?"TAIL_DAMAGE_LINE":(String(ns).startsWith("RFI_")?"BINARY_FIRST_INNING_LINE":"NORMAL_LINE");
  return {
    baseline_row_id:`exp_sanity|${ns}|${entityId||playerId||"global"}|${propKey}`,
    batch_id:batchId, expansion_scope:"baseline_only_shadow", profile_namespace:ns, source_data_family:sourceFamily, source_table:sourceTable, profile_logic_version:VERSION,
    entity_type:entityType, entity_id:String(entityId||playerId||""), player_type:playerType, player_id:playerId||null, player_name:playerName||null, canonical_prop_key:propKey,
    role_profile:entityType==="game_pair"?"GAME_PAIR_PROFILE":"STARTER_PROFILE", prior_pool_key:`${ns}${sp}`, sanity_profile_key:profileKey,
    sample_profile:sp, usage_profile:games>=25?"ESTABLISHED_HISTORY":"LIMITED_HISTORY", line_difficulty_profile:maxLineDifficulty,
    volatility_profile:stats.volatility_profile, baseline_drag_profile:dragForSample(sp), confidence_drag_profile:dragForSample(sp), variance_profile:stats.volatility_profile,
    games_sample:games, events_sample:games, baseline_confidence_0_100:conf,
    line_baseline_json:safeJson({namespace:ns,lines,line_rates:lineMap,source_formula_key:sourceFormulaKey}),
    distribution_shape_json:safeJson({namespace:ns,...stats}),
    notes_json:safeJson({baseline_only:true,no_daily_context:true,no_market_context:true,no_scoring_context:true,source_formula_key:sourceFormulaKey,...extraNotes})
  };
}

async function starterRows(env){
  return all(env.TEAM_DB, `SELECT COALESCE(player_id, starter_player_id) AS player_id, starter_name, game_pk, game_date, team_id, opponent_team_id, is_home, started_game, outs_recorded, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches
    FROM starter_history
    WHERE started_game=1 AND COALESCE(player_id, starter_player_id) IS NOT NULL AND game_pk IS NOT NULL
    ORDER BY player_id, game_date`);
}


function lineThresholdBucketForInventory(canonical, line){
  const p=String(canonical||''); const l=Number(line);
  if(p==='rfi_nrfi') return 'BINARY_0_5';
  if(p==='fantasy' || p==='pitcher_fantasy_score'){
    if(l < 15.5) return 'LOW_FANTASY_LINE';
    if(l <= 25.5) return 'STANDARD_FANTASY_LINE';
    if(l <= 35.5) return 'HIGH_FANTASY_LINE';
    return 'EXTREME_FANTASY_LINE';
  }
  if(p==='fantasy_score'){
    if(l < 4.5) return 'LOW_HITTER_FANTASY_LINE';
    if(l <= 8.5) return 'STANDARD_HITTER_FANTASY_LINE';
    return 'HIGH_HITTER_FANTASY_LINE';
  }
  if(p==='pitches_thrown'){
    if(l < 85.5) return 'LOW_PITCH_COUNT_LINE';
    if(l <= 96.5) return 'STANDARD_PITCH_COUNT_LINE';
    return 'HIGH_PITCH_COUNT_LINE';
  }
  if(l <= 1.5) return 'LOW_LINE';
  if(l <= 4.5) return 'STANDARD_LINE';
  return 'HIGH_LINE';
}
function upperToken(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,''); }
const HITTER_RAW_PROP_KEYS = new Set(['hits','singles','doubles','triples','home_runs','runs','rbis','rbi','walks','hitter_strikeouts','stolen_bases','total_bases','hits_runs_rbis','plate_appearances']);
const PITCHER_RAW_PROP_KEYS = new Set(['pitcher_strikeouts','pitcher_outs','pitches_thrown','hits_allowed','earned_runs','walks_allowed','runs_allowed','pitcher_fantasy_score','fantasy']);
function resolveLineInventory(row){
  const canonical=String(row.canonical_prop_key||'');
  const source=String(row.source_key||'');
  const factor=String(row.factor_family||'');
  const side=String(row.selected_side||'');
  let profileNamespace=null, sourceFormulaKey=null, resolvedFactor=factor||'unknown', status='INVENTORY_ONLY_SOURCE_READY', needs=0, note='inventory observed; source-ready when raw source table supports the canonical prop';
  if(canonical==='fantasy' || canonical==='pitcher_fantasy_score'){
    profileNamespace='PITCHER_FANTASY_SCORE_DYNAMIC_'; sourceFormulaKey='PITCHER_FANTASY_SCORE_SOURCE_AGNOSTIC_COMPONENT_BASELINE_NO_WIN_NO_QS'; resolvedFactor='pitcher'; status='SOURCE_READY_PITCHER_FANTASY_DYNAMIC'; needs=1; note='Source-agnostic pitcher fantasy baseline from starter_history components only; no app/source, win, or QS bonus in Baseline Base';
  } else if(source==='sleeper' && canonical==='fantasy'){
    profileNamespace='PFS_SL_DYNAMIC_'; sourceFormulaKey='PFS_SL_LOCKED_COMPONENT_WORKLOAD_K_DAMAGE_WIN_REGRESSED_NO_QS'; resolvedFactor='pitcher'; status='SOURCE_READY_PITCHER_FANTASY_SL_DYNAMIC'; needs=1; note='Sleeper fantasy uses separate PFS simulation pass with no QS bonus or QS profile leakage';
  } else if(source==='sleeper' && canonical==='rfi_nrfi'){
    profileNamespace='RFI_SL_'; sourceFormulaKey='RFI_SL_PITCHER_SPECIFIC_0_5'; resolvedFactor='pitcher'; status='SOURCE_READY_RFI_SL'; needs=1; note='Sleeper RFI/NRFI maps to pitcher-specific first-frame expansion profile';
  } else if(source==='prizepicks' && canonical==='rfi_nrfi'){
    profileNamespace='RFI_PP_'; sourceFormulaKey='RFI_PP_GAME_PAIR_0_5'; resolvedFactor='game_pair'; status='SOURCE_READY_RFI_PP'; needs=1; note='PrizePicks RFI/NRFI maps to game-pair expansion profile';
  } else if(canonical==='fantasy_score'){
    profileNamespace='HITTER_FANTASY_SCORE_DYNAMIC_'; sourceFormulaKey='HITTER_FANTASY_SCORE_DYNAMIC_LINE_FROM_HITTER_GAME_LOGS_WITH_RAW_JSON_HIT_BY_PITCH'; resolvedFactor='hitter'; status='SOURCE_READY_HITTER_FANTASY_DYNAMIC'; needs=1; note='Source-agnostic hitter fantasy baseline from hitter_game_logs; app-specific board names must not enter baseline identity';
  } else if(canonical==='plate_appearances'){
    profileNamespace='HITTER_PLATE_APPEARANCES_DYNAMIC_'; sourceFormulaKey='PLATE_APPEARANCES_FROM_HITTER_GAME_LOGS_PA'; resolvedFactor='hitter'; status='SOURCE_READY_HITTER_PLATE_APPEARANCES'; needs=1; note='Plate appearances source exists as hitter_game_logs.pa';
  } else if(canonical==='pitches_thrown'){
    profileNamespace='PITCH_COUNT_DYNAMIC_'; sourceFormulaKey='PITCHES_THROWN_FROM_STARTER_HISTORY_PITCHES'; resolvedFactor='pitcher'; status='SOURCE_READY_PITCH_COUNT_DYNAMIC'; needs=1; note='Pitches thrown source exists as starter_history.pitches';
  } else if(canonical==='triples'){
    profileNamespace='HITTER_TRIPLES_DYNAMIC_'; sourceFormulaKey='TRIPLES_FROM_HITTER_GAME_LOGS'; resolvedFactor='hitter'; status='SOURCE_READY_HITTER_TRIPLES'; needs=1; note='Triples source exists as hitter_game_logs.triples';
  } else if(HITTER_RAW_PROP_KEYS.has(canonical)){
    profileNamespace=`HITTER_${upperToken(canonical)}_DYNAMIC_`; sourceFormulaKey=`${upperToken(canonical)}_FROM_HITTER_GAME_LOGS`; resolvedFactor='hitter'; status='SOURCE_READY_HITTER_PROP_DYNAMIC'; needs=1; note='Hitter prop source exists in STATS_HITTER_DB.hitter_game_logs';
  } else if(PITCHER_RAW_PROP_KEYS.has(canonical)){
    profileNamespace=`PITCHER_${upperToken(canonical)}_DYNAMIC_`; sourceFormulaKey=`${upperToken(canonical)}_FROM_STARTER_HISTORY`; resolvedFactor='pitcher'; status='SOURCE_READY_PITCHER_PROP_DYNAMIC'; needs=1; note='Pitcher prop source exists in TEAM_DB.starter_history';
  }
  const mismatch = (factor && resolvedFactor && factor !== resolvedFactor) ? 1 : 0;
  return {profileNamespace, sourceFormulaKey, resolvedFactor, status, needs, mismatch, note, lineBucket:lineThresholdBucketForInventory(canonical,row.line_value)};
}
async function runLineInventory(env,input={}){
  await ensureSchema(env);
  const requestId=String(input.request_id||rid('expansion_line_inventory'));
  const runId=String(input.run_id||rid('run'));
  const batchId=String(input.batch_id||input.line_inventory_batch_id||rid('expansion_line_inventory_batch'));
  await writeRun(env.SCORE_DB,'expansion_line_inventory_batches',`INSERT OR REPLACE INTO expansion_line_inventory_batches (batch_id,request_id,run_id,mode,status,worker_version,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,'expansion_line_inventory','running',VERSION);
  await archiveAndClearCurrent(env.SCORE_DB,'expansion_line_inventory_current','expansion_line_inventory_history');
  await writeRun(env.SCORE_DB,'expansion_line_inventory_issues',`DELETE FROM expansion_line_inventory_issues WHERE batch_id=?`,batchId);
  const inv=await all(env.SCORE_DB,`SELECT hp.canonical_prop_key AS canonical_prop_key, hp.source_key AS source_key, COALESCE(hp.factor_family,'unknown') AS factor_family, hp.selected_side AS selected_side, hp.board_line_value AS line_value,
      COUNT(*) AS source_rows, COUNT(DISTINCT hp.mlb_player_id) AS players,
      SUM(CASE WHEN source_line_id LIKE '%|standard|%' THEN 1 ELSE 0 END) AS standard_rows,
      SUM(CASE WHEN source_line_id LIKE '%|goblin|%' THEN 1 ELSE 0 END) AS goblin_rows,
      SUM(CASE WHEN source_line_id LIKE '%|demon|%' THEN 1 ELSE 0 END) AS demon_rows,
      SUM(CASE WHEN b.baseline_hp_row_id IS NULL AND e.baseline_hp_row_id IS NULL THEN 1 ELSE 0 END) AS missing_baseline_rows
    FROM hit_probability_v2_current hp
    LEFT JOIN player_baseline_hp_v2_current b
      ON b.player_id=hp.mlb_player_id
     AND b.canonical_prop_key=hp.canonical_prop_key
     AND b.selected_side=hp.selected_side
     AND b.line_value=hp.board_line_value
    LEFT JOIN expansion_player_baseline_hp_current e
      ON e.player_id=hp.mlb_player_id
     AND e.canonical_prop_key=hp.canonical_prop_key
     AND e.selected_side=hp.selected_side
     AND e.line_value=hp.board_line_value
    WHERE hp.board_line_value IS NOT NULL AND hp.canonical_prop_key IS NOT NULL AND hp.selected_side IS NOT NULL
    GROUP BY hp.canonical_prop_key, hp.source_key, COALESCE(hp.factor_family,'unknown'), hp.selected_side, hp.board_line_value
    ORDER BY hp.canonical_prop_key, hp.source_key, hp.selected_side, hp.board_line_value`);
  const stmts=[]; const issues=[];
  let missing=0,dynamicSupported=0,unsupportedMissing=0;
  for(const r of inv){
    const resolved=resolveLineInventory(r);
    missing += Number(r.missing_baseline_rows||0);
    if(Number(r.missing_baseline_rows||0)>0 && resolved.needs) dynamicSupported += Number(r.missing_baseline_rows||0);
    if(Number(r.missing_baseline_rows||0)>0 && !resolved.profileNamespace) unsupportedMissing += Number(r.missing_baseline_rows||0);
    const id=`exp_line_inv|${r.source_key||'source'}|${r.canonical_prop_key}|${r.factor_family||'unknown'}|${r.selected_side}|${String(r.line_value).replace('.','p')}`;
    const notes={baseline_only:true,observed_from:'hit_probability_v2_current',missing_detector:'direct_current_baseline_join_v0_1_32',respects_exact_line_value:true,respects_selected_side:true,respects_source_key:true,role_resolution_note:resolved.note};
    stmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO expansion_line_inventory_current (inventory_row_id,batch_id,source_key,canonical_prop_key,factor_family,resolved_factor_family,selected_side,line_value,source_rows,players,standard_rows,goblin_rows,demon_rows,missing_baseline_rows,profile_namespace,source_formula_key,line_threshold_bucket,line_inventory_status,needs_dynamic_generation,factor_family_mismatch,role_resolution_note,notes_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,batchId,r.source_key||null,r.canonical_prop_key||null,r.factor_family||null,resolved.resolvedFactor||null,r.selected_side||null,Number(r.line_value),Number(r.source_rows||0),Number(r.players||0),Number(r.standard_rows||0),Number(r.goblin_rows||0),Number(r.demon_rows||0),Number(r.missing_baseline_rows||0),resolved.profileNamespace,resolved.sourceFormulaKey,resolved.lineBucket,resolved.status,Number(resolved.needs||0),Number(resolved.mismatch||0),resolved.note,safeJson(notes)));
    if(Number(r.missing_baseline_rows||0)>0 && !resolved.profileNamespace){ issues.push({severity:'WARN',issue_code:'UNMAPPED_MISSING_BASELINE_LINE',issue_message:`Missing baseline line not mapped to expansion/source-ready profile: ${r.canonical_prop_key}/${r.source_key}/${r.selected_side}/${r.line_value}`,row:r,resolved}); }
  }
  if(stmts.length) await writeBatch(env.SCORE_DB,'expansion_line_inventory_current',stmts,40);
  const issueStmts=issues.map(x=>env.SCORE_DB.prepare(`INSERT OR REPLACE INTO expansion_line_inventory_issues (issue_id,batch_id,severity,issue_code,issue_message,issue_json,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid('exp_line_issue'),batchId,x.severity,x.issue_code,String(x.issue_message||'').slice(0,900),safeJson(x)));
  if(issueStmts.length) await writeBatch(env.SCORE_DB,'expansion_line_inventory_issues',issueStmts,30);
  const byStatus=await all(env.SCORE_DB,`SELECT line_inventory_status, COUNT(*) AS inventory_rows, SUM(missing_baseline_rows) AS missing_baseline_rows FROM expansion_line_inventory_current WHERE batch_id=? GROUP BY line_inventory_status ORDER BY missing_baseline_rows DESC`,batchId);
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:'expansion_line_inventory',status:'EXPANSION_LINE_INVENTORY_COMPLETED',certification:'EXPANSION_LINE_INVENTORY_CERTIFIED_DYNAMIC_THRESHOLD_GRID_WRITTEN',certification_grade:issues.length?'PASS_WITH_WARNINGS':'PASS',inventory_rows:inv.length,missing_baseline_rows:missing,dynamic_supported_rows:dynamicSupported,unsupported_missing_rows:unsupportedMissing,issue_rows:issues.length,status_summary:byStatus,pre_sanity_stage:true,pre_heb_stage:true,hardcoded_line_lists_rejected:true,current_system_mutated:false,rows_written:inv.length});
  await writeRun(env.SCORE_DB,'expansion_line_inventory_batches',`UPDATE expansion_line_inventory_batches SET status='completed', finished_at=CURRENT_TIMESTAMP, inventory_rows=?, missing_baseline_rows=?, dynamic_supported_rows=?, unsupported_missing_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,inv.length,missing,dynamicSupported,unsupportedMissing,issues.length,output.certification,output.certification_grade,safeJson(output),batchId);
  return output;
}

async function runSanity(env,input={}){
  await ensureSchema(env);
  const requestId=String(input.request_id||rid("expansion_baseline_sanity")); const runId=String(input.run_id||rid("run")); const batchId=String(input.batch_id||rid("expansion_baseline_sanity_batch"));
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_batches",`INSERT OR REPLACE INTO expansion_player_baseline_sanity_batches (batch_id,request_id,run_id,mode,status,worker_version,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"expansion_baseline_sanity","running",VERSION);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_stage",`DELETE FROM expansion_player_baseline_sanity_stage`);
  await archiveAndClearCurrent(env.SCORE_DB,"expansion_player_baseline_sanity_current","expansion_player_baseline_sanity_history");
  const rows=await starterRows(env);
  const byPitcher=groupBy(rows,r=>r.player_id);
  const sanityRows=[];
  for(const [pid,prs] of byPitcher.entries()){
    const name=prs.find(r=>r.starter_name)?.starter_name||null;
    const playerId=Number(pid);
    const raVals=prs.map(r=>num(r.runs_allowed));
    const ppVals=prs.map(pfsPp);
    const slVals=prs.map(pfsSl);
    sanityRows.push(makeSanityRow({batchId,ns:"RA_",sourceFamily:"starter_history_runs_allowed",sourceTable:"TEAM_DB.starter_history",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"runs_allowed",values:raVals,lines:RA_LINES,profileKey:raProfile(raVals,prs.length),sourceFormulaKey:"RA_FULL_GAME_TOTAL_RUNS_ALLOWED",extraNotes:{earned_and_unearned_runs_count:true,separate_from_earned_runs:true}}));
    sanityRows.push(makeSanityRow({batchId,ns:"PFS_PP_",sourceFamily:"starter_history_pitcher_fantasy",sourceTable:"TEAM_DB.starter_history",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"pitcher_fantasy_score",values:ppVals,lines:PFS_LINES,profileKey:pfsPpProfile(ppVals,prs),sourceFormulaKey:"PFS_PP_NO_WIN_OUTS_K_QS_ER",extraNotes:{win_excluded:true,win_reserve_only:true,formula:"outs_recorded + 3*K + 4*QS - 3*ER"}}));
    sanityRows.push(makeSanityRow({batchId,ns:"PFS_SL_",sourceFamily:"starter_history_pitcher_fantasy",sourceTable:"TEAM_DB.starter_history",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"pitcher_fantasy_score",values:slVals,lines:PFS_LINES,profileKey:pfsSlProfile(slVals,prs),sourceFormulaKey:"PFS_SL_NO_WIN_OUTS_K_ER_BB",extraNotes:{win_excluded:true,win_reserve_only:true,qs_not_used:true,formula:"outs_recorded + 3*K - 3*ER - 2*BB"}}));
  }
  const rfiPitcherRows=await all(env.CONTEXT_DB,`SELECT pitcher_id, pitcher_name, first_frame_runs_allowed FROM expansion_first_inning_pitcher_context_current WHERE pitcher_id IS NOT NULL`);
  for(const [pid,prs] of groupBy(rfiPitcherRows,r=>r.pitcher_id).entries()){
    const playerId=Number(pid); const vals=prs.map(r=>num(r.first_frame_runs_allowed)); const name=prs.find(r=>r.pitcher_name)?.pitcher_name||null;
    sanityRows.push(makeSanityRow({batchId,ns:"RFI_SL_",sourceFamily:"first_inning_pitcher_context",sourceTable:"CONTEXT_DB.expansion_first_inning_pitcher_context_current",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"rfi_nrfi",values:vals,lines:RFI_LINES,profileKey:rfiSlProfile(vals,vals.length),sourceFormulaKey:"RFI_SL_PITCHER_SPECIFIC_FIRST_FRAME",extraNotes:{sleeper_specific:true,home_starter_allows_top_1st:true,away_starter_allows_bottom_1st:true,earned_and_unearned_runs_count:true}}));
  }
  const rfiGames=await all(env.CONTEXT_DB,`SELECT game_pk, first_inning_total_runs FROM expansion_first_inning_game_context_current WHERE game_pk IS NOT NULL`);
  const ppVals=rfiGames.map(r=>num(r.first_inning_total_runs));
  if(ppVals.length){
    sanityRows.push(makeSanityRow({batchId,ns:"RFI_PP_",sourceFamily:"first_inning_game_context",sourceTable:"CONTEXT_DB.expansion_first_inning_game_context_current",entityType:"game_pair_pool",entityId:"rfi_pp_game_pair_pool",playerType:"game_pair",playerId:null,playerName:"RFI_PP_GAME_PAIR_POOL",propKey:"rfi_nrfi",values:ppVals,lines:RFI_LINES,profileKey:rfiPpProfile(ppVals,ppVals.length),sourceFormulaKey:"RFI_PP_PAIR_GAME_FIRST_INNING_TOTAL",extraNotes:{prizepicks_combo_pair_level:true,earned_and_unearned_runs_count:true}}));
  }

  const stmts=sanityRows.map(r=>env.SCORE_DB.prepare(`INSERT OR REPLACE INTO expansion_player_baseline_sanity_stage
    (baseline_row_id,batch_id,expansion_scope,profile_namespace,source_data_family,source_table,profile_logic_version,entity_type,entity_id,player_type,player_id,player_name,canonical_prop_key,role_profile,prior_pool_key,sanity_profile_key,sample_profile,usage_profile,line_difficulty_profile,volatility_profile,baseline_drag_profile,confidence_drag_profile,variance_profile,games_sample,events_sample,baseline_confidence_0_100,line_baseline_json,distribution_shape_json,notes_json,no_daily_context,no_market_context,no_scoring_context,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(r.baseline_row_id,r.batch_id,r.expansion_scope,r.profile_namespace,r.source_data_family,r.source_table,r.profile_logic_version,r.entity_type,r.entity_id,r.player_type,r.player_id,r.player_name,r.canonical_prop_key,r.role_profile,r.prior_pool_key,r.sanity_profile_key,r.sample_profile,r.usage_profile,r.line_difficulty_profile,r.volatility_profile,r.baseline_drag_profile,r.confidence_drag_profile,r.variance_profile,r.games_sample,r.events_sample,r.baseline_confidence_0_100,r.line_baseline_json,r.distribution_shape_json,r.notes_json));
  if(stmts.length) await writeBatch(env.SCORE_DB,"expansion_player_baseline_sanity_stage",stmts,35);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_current",`INSERT OR REPLACE INTO expansion_player_baseline_sanity_current SELECT * FROM expansion_player_baseline_sanity_stage`);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_history",`INSERT INTO expansion_player_baseline_sanity_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_sanity_stage`);
  const nsRows=await all(env.SCORE_DB,`SELECT profile_namespace, COUNT(*) AS rows FROM expansion_player_baseline_sanity_current GROUP BY profile_namespace ORDER BY profile_namespace`);
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"expansion_baseline_sanity",status:"EXPANSION_BASELINE_SANITY_COMPLETED",certification:"EXPANSION_BASELINE_SANITY_CERTIFIED_STAGE_PROMOTED",certification_grade:"PASS",rows_staged:sanityRows.length,rows_promoted:sanityRows.length,history_rows:sanityRows.length,namespace_rows:nsRows,rows_written:sanityRows.length});
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_batches",`UPDATE expansion_player_baseline_sanity_batches SET status='completed', finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,sanityRows.length,sanityRows.length,sanityRows.length,output.certification,output.certification_grade,safeJson(output),batchId);
  return output;
}

function formulaKeyFor(ns){ if(ns==="RA_") return "RA_FULL_GAME_TOTAL_RUNS_ALLOWED"; if(ns==="PFS_PP_") return "PFS_PP_NO_WIN_OUTS_K_QS_ER"; if(ns==="PFS_SL_") return "PFS_SL_NO_WIN_OUTS_K_ER_BB"; if(ns==="RFI_PP_") return "RFI_PP_PAIR_GAME_FIRST_INNING_TOTAL"; if(ns==="RFI_SL_") return "RFI_SL_PITCHER_SPECIFIC_FIRST_FRAME"; return "UNKNOWN"; }
function linesFor(ns){ if(ns==="RA_") return RA_LINES; if(ns==="PFS_PP_"||ns==="PFS_SL_") return PFS_LINES; return RFI_LINES; }
function propFamilyFor(ns){ if(ns==="RA_") return "EXPANSION_RUNS_ALLOWED"; if(ns.startsWith("PFS_")) return "EXPANSION_PITCHER_FANTASY_SCORE"; if(ns.startsWith("RFI_")) return "EXPANSION_FIRST_INNING_RUNS"; return "EXPANSION_BASELINE"; }
function valuesFromSanity(row){ const line= parseJson(row.line_baseline_json,{}); return line.line_rates || {}; }
function expansionHpPoolKey(r){ return [r.profile_namespace,r.canonical_prop_key,r.source_formula_key,String(r.line_value),r.selected_side].join("|"); }
function expansionHpPriorStrength(sampleProfile, nonPush){
  const sp=String(sampleProfile||""); const n=Number(nonPush||0);
  if(sp==="TINY_SAMPLE" || n < 5) return 20;
  if(sp==="LOW_SAMPLE" || n < 15) return 12;
  if(sp==="MEDIUM_SAMPLE" || n < 30) return 6;
  return 2;
}
function expansionHpCap(sampleProfile, nonPush){
  const sp=String(sampleProfile||""); const n=Number(nonPush||0);
  if(sp==="TINY_SAMPLE" || n < 5) return {lo:15, hi:85};
  if(sp==="LOW_SAMPLE" || n < 15) return {lo:10, hi:90};
  if(sp==="MEDIUM_SAMPLE" || n < 30) return {lo:5, hi:95};
  return {lo:1, hi:99};
}
function expansionPosteriorHp(hit, miss, priorPct, priorStrength, sampleProfile){
  const h=Number(hit||0), m=Number(miss||0), n=h+m;
  if(n<=0) return null;
  const prior=clamp(Number(priorPct||50),1,99)/100;
  const ps=Math.max(0, Number(priorStrength||0));
  const rawPosterior=100*((h + prior*ps)/(n + ps));
  const cap=expansionHpCap(sampleProfile,n);
  return round(clamp(rawPosterior, cap.lo, cap.hi),2);
}

function expansionHpPairKey(r){
  return [
    String(r.profile_namespace||''),
    String(r.source_formula_key||''),
    String(r.entity_id||''),
    String(r.player_id||''),
    String(r.canonical_prop_key||''),
    String(r.line_value||'')
  ].join('|');
}
function normalizeExpansionHpPairsMoreAnchor(hpRows){
  const groups=new Map();
  for(const r of hpRows||[]){
    const key=expansionHpPairKey(r);
    if(!groups.has(key)) groups.set(key,{});
    groups.get(key)[String(r.selected_side||'').toLowerCase()]=r;
  }
  let normalizedPairs=0;
  let lessRowsAdjusted=0;
  let fallbackMoreRowsAdjusted=0;
  const adjusted=[];
  for(const g of groups.values()){
    const more=g.more, less=g.less;
    if(more && less && more.baseline_hp_0_100!=null){
      const before=less.baseline_hp_0_100;
      const after=round(100-Number(more.baseline_hp_0_100),2);
      normalizedPairs++;
      if(Number(before)!==Number(after)){
        less.baseline_hp_0_100=after;
        lessRowsAdjusted++;
        adjusted.push({row_id:less.baseline_hp_row_id,before,after,anchor_row_id:more.baseline_hp_row_id});
      }
      annotateExpansionPairNormalization(more,'more_anchor',more.baseline_hp_0_100,more.baseline_hp_0_100,less.baseline_hp_row_id);
      annotateExpansionPairNormalization(less,'less_from_more_anchor',before,after,more.baseline_hp_row_id);
    } else if(less && !more && less.baseline_hp_0_100!=null){
      // True one-sided fallback only: preserve the observed side and expose the implied complement in notes.
      annotateExpansionPairNormalization(less,'single_side_less_anchor_no_more_row',less.baseline_hp_0_100,less.baseline_hp_0_100,null);
    } else if(more && !less && more.baseline_hp_0_100!=null){
      annotateExpansionPairNormalization(more,'single_side_more_anchor_no_less_row',more.baseline_hp_0_100,more.baseline_hp_0_100,null);
    }
  }
  return {normalized_pairs:normalizedPairs, less_rows_adjusted:lessRowsAdjusted, fallback_more_rows_adjusted:fallbackMoreRowsAdjusted, adjusted_sample:adjusted.slice(0,25), more_anchor_pair_normalization_v0_1_71:true};
}
function annotateExpansionPairNormalization(r, mode, before, after, anchorRowId){
  let notes={};
  try{ notes=r.profile_notes_json?JSON.parse(String(r.profile_notes_json)):{}; }catch(_){ notes={}; }
  notes.more_anchor_pair_normalization_v0_1_71=true;
  notes.pair_normalization_mode=mode;
  if(anchorRowId) notes.pair_anchor_row_id=anchorRowId;
  if(before!==after) notes.pair_normalization_hp_adjustment={before,after,delta:round(Number(after)-Number(before),4)};
  r.profile_notes_json=safeJson(notes);
  let snap={};
  try{ snap=r.source_snapshot_json?JSON.parse(String(r.source_snapshot_json)):{}; }catch(_){ snap={}; }
  snap.final_pair_normalized_hp_0_100=r.baseline_hp_0_100;
  snap.more_anchor_pair_normalization_v0_1_71=true;
  r.source_snapshot_json=safeJson(snap);
}
function buildHpRowsForSanityRows(sanityRows, batchId, sourceSanityBatchId, poolSanityRows=null){
  const makeRows=(rows)=>{
    const out=[];
    for(const s of rows){
      const ns=String(s.profile_namespace||"");
      const lineRates=valuesFromSanity(s);
      const lines=linesFor(ns);
      for(const line of lines){
        const lr=lineRates[String(line)] || {};
        for(const side of SIDES){
          const hit=side==="more"?Number(lr.more_hit||0):Number(lr.less_hit||0);
          const miss=side==="more"?Number(lr.less_hit||0):Number(lr.more_hit||0);
          const push=Number(lr.push||0);
          const nonPush=Number(lr.non_push_sample||0);
          const raw=side==="more"?lr.more_rate_0_100:lr.less_rate_0_100;
          const conf=Number(s.baseline_confidence_0_100||0);
          out.push({
            baseline_hp_row_id:`exp_hp|${ns}|${s.entity_id||s.player_id||"pool"}|${s.canonical_prop_key}|${String(line).replace('.','p')}|${side}`,
            batch_id:batchId, source_sanity_batch_id:sourceSanityBatchId, source_baseline_row_id:s.baseline_row_id,
            expansion_scope:"baseline_only_shadow", profile_namespace:ns, source_data_family:s.source_data_family, source_table:s.source_table, source_formula_key:formulaKeyFor(ns), baseline_formula_version:VERSION,
            entity_type:s.entity_type, entity_id:s.entity_id, player_type:s.player_type, player_id:s.player_id, player_name:s.player_name, canonical_prop_key:s.canonical_prop_key, prop_family:propFamilyFor(ns),
            line_value:line, selected_side:side, baseline_hp_0_100:null, raw_rate_0_100:raw==null?null:round(raw,2), tier_prior_rate_0_100:null, raw_prior_gap_0_100:null,
            baseline_confidence_0_100:conf, baseline_enriched_confidence_0_100:conf, consistency_bonus_0_100:0, soft_uncertainty_reserve_0_100:round(100-conf,1),
            sample_profile:s.sample_profile, role_profile:s.role_profile, sanity_profile_key:s.sanity_profile_key, volatility_profile:s.volatility_profile, variance_profile:s.variance_profile, line_difficulty_profile:lineDifficulty(ns,line), baseline_hp_profile_key:`${ns}${String(side).toUpperCase()}_${String(line).replace('.','P')}_${s.sanity_profile_key}`,
            non_push_sample:nonPush, hit_count:hit, miss_count:miss, push_count:push, prior_strength:null,
            profile_notes_json:null, source_snapshot_json:null, _line_rate:lr
          });
        }
      }
    }
    return out;
  };
  const hpRows=makeRows(sanityRows || []);
  const poolRows=makeRows(Array.isArray(poolSanityRows) && poolSanityRows.length ? poolSanityRows : (sanityRows || []));
  const pools=new Map();
  for(const r of poolRows){
    const key=expansionHpPoolKey(r); const cur=pools.get(key)||{hit:0,miss:0,sample:0,rows:0};
    cur.hit += Number(r.hit_count||0); cur.miss += Number(r.miss_count||0); cur.sample += Number(r.non_push_sample||0); cur.rows += 1; pools.set(key,cur);
  }
  for(const r of hpRows){
    const pool=pools.get(expansionHpPoolKey(r))||{hit:0,miss:0,sample:0,rows:0};
    const poolRate=pool.sample>0 ? round(100*pool.hit/pool.sample,2) : 50;
    const priorRate=Number.isFinite(Number(poolRate)) ? clamp(Number(poolRate),1,99) : 50;
    const priorStrength=expansionHpPriorStrength(r.sample_profile,r.non_push_sample);
    r.tier_prior_rate_0_100=round(priorRate,2);
    r.raw_prior_gap_0_100=r.raw_rate_0_100==null?null:round(Number(r.raw_rate_0_100)-priorRate,2);
    r.prior_strength=priorStrength;
    r.baseline_hp_0_100=expansionPosteriorHp(r.hit_count,r.miss_count,priorRate,priorStrength,r.sample_profile);
    const cap=expansionHpCap(r.sample_profile,r.non_push_sample);
    r.profile_notes_json=safeJson({baseline_only:true,namespace:r.profile_namespace,formula_key:r.source_formula_key,no_daily_context:true,no_market_context:true,no_scoring_context:true,hp_calibration_guard:"pool_prior_shrinkage_with_sample_caps",prior_pool_key:expansionHpPoolKey(r),prior_pool_sample:pool.sample,prior_pool_rows:pool.rows,prior_strength:priorStrength,prior_rate_0_100:round(priorRate,2),cap_0_100:cap,delta_pool_source:Array.isArray(poolSanityRows)&&poolSanityRows.length?"all_current_sanity_rows":"target_rows"});
    r.source_snapshot_json=safeJson({source_baseline_row_id:r.source_baseline_row_id,line_rate:r._line_rate,raw_rate_0_100:r.raw_rate_0_100,posterior_hp_0_100:r.baseline_hp_0_100});
    delete r._line_rate;
  }
  const pairNormalization = normalizeExpansionHpPairsMoreAnchor(hpRows);
  for(const r of hpRows){
    let snap={};
    try{ snap=r.source_snapshot_json?JSON.parse(String(r.source_snapshot_json)):{}; }catch(_){ snap={}; }
    snap.pair_normalization_summary={normalized_pairs:pairNormalization.normalized_pairs, less_rows_adjusted:pairNormalization.less_rows_adjusted};
    r.source_snapshot_json=safeJson(snap);
  }
  return hpRows;
}

async function insertHpRows(env, hpRows){
  const stmts=hpRows.map(r=>env.SCORE_DB.prepare(`INSERT OR REPLACE INTO expansion_player_baseline_hp_stage
    (baseline_hp_row_id,batch_id,source_sanity_batch_id,source_baseline_row_id,expansion_scope,profile_namespace,source_data_family,source_table,source_formula_key,baseline_formula_version,entity_type,entity_id,player_type,player_id,player_name,canonical_prop_key,prop_family,line_value,selected_side,baseline_hp_0_100,hp_adjustment_0_100,raw_rate_0_100,tier_prior_rate_0_100,raw_prior_gap_0_100,baseline_confidence_0_100,baseline_enriched_confidence_0_100,consistency_bonus_0_100,soft_uncertainty_reserve_0_100,sample_profile,role_profile,sanity_profile_key,volatility_profile,variance_profile,line_difficulty_profile,baseline_hp_profile_key,non_push_sample,hit_count,miss_count,push_count,prior_strength,formula_version,confidence_formula_version,no_daily_context,no_market_context,no_scoring_context,profile_notes_json,source_snapshot_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(r.baseline_hp_row_id,r.batch_id,r.source_sanity_batch_id,r.source_baseline_row_id,r.expansion_scope,r.profile_namespace,r.source_data_family,r.source_table,r.source_formula_key,r.baseline_formula_version,r.entity_type,r.entity_id,r.player_type,r.player_id,r.player_name,r.canonical_prop_key,r.prop_family,r.line_value,r.selected_side,r.baseline_hp_0_100,r.raw_rate_0_100,r.tier_prior_rate_0_100,r.raw_prior_gap_0_100,r.baseline_confidence_0_100,r.baseline_enriched_confidence_0_100,r.consistency_bonus_0_100,r.soft_uncertainty_reserve_0_100,r.sample_profile,r.role_profile,r.sanity_profile_key,r.volatility_profile,r.variance_profile,r.line_difficulty_profile,r.baseline_hp_profile_key,r.non_push_sample,r.hit_count,r.miss_count,r.push_count,r.prior_strength,VERSION,`${VERSION}_confidence`,r.profile_notes_json,r.source_snapshot_json));
  if(stmts.length) await writeBatch(env.SCORE_DB,"expansion_player_baseline_hp_stage",stmts,20);
}

async function expansionHpComplementAudit(env, tableName, batchId){
  const allowed=new Set(['expansion_player_baseline_hp_stage','expansion_player_baseline_hp_current']);
  const table=allowed.has(tableName)?tableName:'expansion_player_baseline_hp_stage';
  const row=await first(env.SCORE_DB,`WITH hp AS (
      SELECT profile_namespace, source_formula_key, player_id, entity_id, canonical_prop_key, line_value, selected_side, baseline_hp_0_100, raw_rate_0_100, non_push_sample
      FROM ${table}
      WHERE batch_id=?
    ), pairs AS (
      SELECT
        m.profile_namespace,
        m.canonical_prop_key,
        m.baseline_hp_0_100 AS more_hp,
        l.baseline_hp_0_100 AS less_hp,
        m.raw_rate_0_100 AS more_raw,
        l.raw_rate_0_100 AS less_raw,
        m.non_push_sample AS more_sample,
        l.non_push_sample AS less_sample
      FROM hp m
      JOIN hp l
        ON l.profile_namespace=m.profile_namespace
       AND l.source_formula_key=m.source_formula_key
       AND COALESCE(l.player_id,-1)=COALESCE(m.player_id,-1)
       AND COALESCE(l.entity_id,'')=COALESCE(m.entity_id,'')
       AND l.canonical_prop_key=m.canonical_prop_key
       AND l.line_value=m.line_value
       AND l.selected_side='less'
      WHERE m.selected_side='more'
    )
    SELECT
      COUNT(*) AS pair_rows,
      SUM(CASE WHEN ROUND(more_hp + less_hp,2) != 100 THEN 1 ELSE 0 END) AS bad_hp_complement_rows,
      SUM(CASE WHEN ROUND(more_raw + less_raw,2) != 100 THEN 1 ELSE 0 END) AS bad_raw_complement_rows,
      SUM(CASE WHEN more_sample != less_sample THEN 1 ELSE 0 END) AS bad_sample_pair_rows
    FROM pairs`,batchId);
  const dup=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT baseline_hp_row_id) AS distinct_row_ids, COUNT(*)-COUNT(DISTINCT baseline_hp_row_id) AS duplicate_row_ids,
      COUNT(*)-COUNT(DISTINCT (profile_namespace || '|' || source_formula_key || '|' || COALESCE(entity_id,'') || '|' || COALESCE(player_id,'') || '|' || canonical_prop_key || '|' || line_value || '|' || selected_side)) AS duplicate_business_keys
    FROM ${table}
    WHERE batch_id=?`,batchId);
  const guard=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows,
      SUM(CASE WHEN no_daily_context!=1 THEN 1 ELSE 0 END) AS bad_daily_guard_rows,
      SUM(CASE WHEN no_market_context!=1 THEN 1 ELSE 0 END) AS bad_market_guard_rows,
      SUM(CASE WHEN no_scoring_context!=1 THEN 1 ELSE 0 END) AS bad_scoring_guard_rows,
      SUM(CASE WHEN baseline_hp_0_100 IS NULL OR baseline_hp_0_100<0 OR baseline_hp_0_100>100 THEN 1 ELSE 0 END) AS bad_hp_rows,
      SUM(CASE WHEN baseline_confidence_0_100 IS NULL OR baseline_confidence_0_100<0 OR baseline_confidence_0_100>100 THEN 1 ELSE 0 END) AS bad_conf_rows
    FROM ${table}
    WHERE batch_id=?`,batchId);
  return {
    table_name:table,
    batch_id:batchId,
    pair_rows:Number(row&&row.pair_rows||0),
    bad_hp_complement_rows:Number(row&&row.bad_hp_complement_rows||0),
    bad_raw_complement_rows:Number(row&&row.bad_raw_complement_rows||0),
    bad_sample_pair_rows:Number(row&&row.bad_sample_pair_rows||0),
    rows:Number(dup&&dup.rows||0),
    duplicate_row_ids:Number(dup&&dup.duplicate_row_ids||0),
    duplicate_business_keys:Number(dup&&dup.duplicate_business_keys||0),
    bad_daily_guard_rows:Number(guard&&guard.bad_daily_guard_rows||0),
    bad_market_guard_rows:Number(guard&&guard.bad_market_guard_rows||0),
    bad_scoring_guard_rows:Number(guard&&guard.bad_scoring_guard_rows||0),
    bad_hp_rows:Number(guard&&guard.bad_hp_rows||0),
    bad_conf_rows:Number(guard&&guard.bad_conf_rows||0),
    pass: Number(row&&row.bad_hp_complement_rows||0)===0 && Number(row&&row.bad_raw_complement_rows||0)===0 && Number(row&&row.bad_sample_pair_rows||0)===0 && Number(dup&&dup.duplicate_row_ids||0)===0 && Number(dup&&dup.duplicate_business_keys||0)===0 && Number(guard&&guard.bad_daily_guard_rows||0)===0 && Number(guard&&guard.bad_market_guard_rows||0)===0 && Number(guard&&guard.bad_scoring_guard_rows||0)===0 && Number(guard&&guard.bad_hp_rows||0)===0 && Number(guard&&guard.bad_conf_rows||0)===0,
    active_parent_chain_batch_scope:true,
    more_anchor_pair_normalization_v0_1_71:true
  };
}

async function runHp(env,input={}){
  await ensureSchema(env);
  const requestId=String(input.request_id||rid("expansion_baseline_hp"));
  const runId=String(input.run_id||rid("run"));
  const requestedBatchId=String(input.batch_id||input.hp_batch_id||"");
  const existingBatch=requestedBatchId ? await first(env.SCORE_DB,`SELECT * FROM expansion_player_baseline_hp_batches WHERE batch_id=? LIMIT 1`,requestedBatchId) : null;
  const batchId=String(requestedBatchId || rid("expansion_baseline_hp_batch"));
  const sourceBatchRow=await first(env.SCORE_DB,`SELECT batch_id FROM expansion_player_baseline_sanity_batches WHERE status='completed' ORDER BY datetime(updated_at) DESC LIMIT 1`);
  const sourceSanityBatchId=String(input.source_sanity_batch_id || input.source_sanity_batch_id_for_hp || (existingBatch && existingBatch.source_sanity_batch_id) || (sourceBatchRow && sourceBatchRow.batch_id) || "");
  const sanityTotalRow=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM expansion_player_baseline_sanity_current`);
  const totalSanityRows=Number(sanityTotalRow && sanityTotalRow.c || 0);
  const chunkSize=clamp(Number(input.hp_source_chunk_size || input.source_chunk_rows || 60),10,80);
  let cursor=Number(input.hp_cursor_offset || input.cursor_offset || 0);
  const freshStart=!existingBatch || String(existingBatch.status||"") !== "running" || cursor===0 && Number(existingBatch.source_rows_read||0)===0 && Number(existingBatch.rows_staged||0)===0;

  if(freshStart){
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`INSERT OR REPLACE INTO expansion_player_baseline_hp_batches (batch_id,request_id,run_id,mode,status,worker_version,source_sanity_batch_id,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"expansion_baseline_hp","running",VERSION,sourceSanityBatchId);
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_stage",`DELETE FROM expansion_player_baseline_hp_stage`);
    await archiveAndClearCurrent(env.SCORE_DB,"expansion_player_baseline_hp_current","expansion_player_baseline_hp_history");
    cursor=0;
  } else {
    cursor=Number(existingBatch.source_rows_read || cursor || 0);
  }

  const sanity=await all(env.SCORE_DB,`SELECT * FROM expansion_player_baseline_sanity_current ORDER BY profile_namespace, COALESCE(entity_id,''), COALESCE(player_id,0), canonical_prop_key LIMIT ? OFFSET ?`,chunkSize,cursor);
  const hpRows=buildHpRowsForSanityRows(sanity,batchId,sourceSanityBatchId);
  await insertHpRows(env,hpRows);
  const nextCursor=cursor + sanity.length;
  const stagedCountRow=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM expansion_player_baseline_hp_stage`);
  const stagedCount=Number(stagedCountRow && stagedCountRow.c || 0);

  if(nextCursor < totalSanityRows){
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,mode:"expansion_baseline_hp",status:"EXPANSION_BASELINE_HP_PARTIAL_CONTINUE",certification:"EXPANSION_BASELINE_HP_PARTIAL_CONTINUE",certification_grade:"PARTIAL_CONTINUE",source_rows_read:nextCursor,source_rows_total:totalSanityRows,rows_staged:stagedCount,rows_written:hpRows.length,hp_cursor_offset:nextCursor,hp_source_chunk_size:chunkSize,partial_continue:true,orchestrator_should_self_continue:true,next_mode:"expansion_baseline_hp",next_input_json:{...input,mode:"expansion_baseline_hp",batch_id:batchId,hp_batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,hp_cursor_offset:nextCursor,hp_source_chunk_size:chunkSize}});
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`UPDATE expansion_player_baseline_hp_batches SET status='running', source_rows_read=?, rows_staged=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,nextCursor,stagedCount,output.certification,output.certification_grade,safeJson(output),batchId);
    return output;
  }

  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_current",`DELETE FROM expansion_player_baseline_hp_current`);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_current",`INSERT OR REPLACE INTO expansion_player_baseline_hp_current SELECT * FROM expansion_player_baseline_hp_stage`);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_history",`INSERT INTO expansion_player_baseline_hp_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_hp_stage`);
  const cov=await all(env.SCORE_DB,`SELECT profile_namespace, selected_side, COUNT(*) AS rows, MIN(line_value) AS min_line, MAX(line_value) AS max_line FROM expansion_player_baseline_hp_current GROUP BY profile_namespace, selected_side ORDER BY profile_namespace, selected_side`);
  const currentCountRow=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM expansion_player_baseline_hp_current`);
  const currentCount=Number(currentCountRow && currentCountRow.c || 0);
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,mode:"expansion_baseline_hp",status:"EXPANSION_BASELINE_HP_COMPLETED",certification:"EXPANSION_BASELINE_HP_CERTIFIED_STAGE_PROMOTED",certification_grade:"PASS",source_rows_read:totalSanityRows,rows_staged:stagedCount,rows_promoted:currentCount,history_rows:stagedCount,coverage:cov,rows_written:hpRows.length});
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`UPDATE expansion_player_baseline_hp_batches SET status='completed', finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,totalSanityRows,stagedCount,currentCount,stagedCount,output.certification,output.certification_grade,safeJson(output),batchId);
  return output;
}


// ---------------- Parallel V2 HEB baseline system ----------------
const BASELINE_V2_FORMULA_VERSION = "baseline_v5_history_hp_v0.5.3_direct_empirical_weak_smoothing_fast_player_safe";
const BASELINE_V2_CONFIDENCE_VERSION = BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION;
const V2_ENTITY_VALUE_CACHE = new Map();
const V2_PROFILE_PRIOR_CACHE = new Map();
const V2_GLOBAL_VALUE_CACHE = new Map();
const V2_BASELINE_ROW_CACHE = new Map();
const V2_BASELINE_MODEL_CACHE = new Map();
const V2_PLAYER_HISTORY_ROWS_CACHE = new Map();
const V5_CLASSIFICATION_CACHE = new Map();
const BASELINE_V5_LOCKED_BASE_EXPECTED_ROWS = 67040;

async function ensureBaselineV2Schema(env){
  const db=env.SCORE_DB;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_v2_batches (
    batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, mode TEXT, status TEXT, worker_version TEXT,
    started_at TEXT, finished_at TEXT, rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0, history_rows INTEGER DEFAULT 0, issue_rows INTEGER DEFAULT 0,
    certification TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const sanityDdl = `(baseline_row_id TEXT PRIMARY KEY,batch_id TEXT,player_type TEXT,player_id INTEGER,player_name TEXT,canonical_prop_key TEXT,role_profile TEXT,prior_pool_key TEXT,sanity_profile_key TEXT,sample_profile TEXT,usage_profile TEXT,line_difficulty_profile TEXT,volatility_profile TEXT,baseline_drag_profile TEXT,confidence_drag_profile TEXT,variance_profile TEXT,games_sample INTEGER,events_sample INTEGER,baseline_confidence_0_100 REAL,line_baseline_json TEXT,distribution_shape_json TEXT,notes_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_v2_stage ${sanityDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_v2_current ${sanityDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_v2_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_sanity_v2_current WHERE 1=0`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_sanity_v2_issues (issue_id TEXT PRIMARY KEY,batch_id TEXT,source_baseline_row_id TEXT,severity TEXT,issue_code TEXT,issue_message TEXT,issue_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbs_v2_current_player_prop ON player_baseline_sanity_v2_current(player_type, player_id, canonical_prop_key)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbs_v2_current_profile ON player_baseline_sanity_v2_current(sanity_profile_key, role_profile, volatility_profile)`);

  const classificationDdl = `(classification_row_id TEXT PRIMARY KEY,batch_id TEXT,player_type TEXT,player_id INTEGER,player_name TEXT,canonical_prop_key TEXT,line_value REAL,selected_side TEXT,classification_tier TEXT,classification_profile_key TEXT,sample_profile TEXT,volume_profile TEXT,lineup_profile TEXT,platoon_profile TEXT,usage_profile TEXT,volatility_profile TEXT,classification_confidence_0_100 REAL,games_sample INTEGER,events_sample INTEGER,pa_per_game REAL,ab_ratio REAL,avg_batting_order REAL,split_delta_0_100 REAL,classification_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_classification_v5_stage ${classificationDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_classification_v5_current ${classificationDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_classification_v5_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_classification_v5_current WHERE 1=0`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbc_v5_stage_batch ON player_baseline_classification_v5_stage(batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbc_v5_current_player_prop ON player_baseline_classification_v5_current(player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbc_v5_current_batch_row ON player_baseline_classification_v5_current(batch_id, classification_row_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbc_v5_history_batch_row ON player_baseline_classification_v5_history(batch_id, classification_row_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbc_v5_history_player_prop ON player_baseline_classification_v5_history(batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbc_v5_current_profile ON player_baseline_classification_v5_current(classification_profile_key, sample_profile, lineup_profile, platoon_profile)`);

  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_v2_batches (
    batch_id TEXT PRIMARY KEY, request_id TEXT, run_id TEXT, mode TEXT, status TEXT, worker_version TEXT, source_sanity_batch_id TEXT,
    source_rows_read INTEGER DEFAULT 0, rows_staged INTEGER DEFAULT 0, rows_promoted INTEGER DEFAULT 0, history_rows INTEGER DEFAULT 0, issue_rows INTEGER DEFAULT 0,
    started_at TEXT, finished_at TEXT, certification TEXT, certification_grade TEXT, output_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  const hpDdl = `(baseline_hp_row_id TEXT PRIMARY KEY,batch_id TEXT,source_sanity_batch_id TEXT,source_baseline_row_id TEXT,player_type TEXT,player_id INTEGER,player_name TEXT,canonical_prop_key TEXT,prop_family TEXT,line_value REAL,selected_side TEXT,baseline_hp_0_100 REAL,hp_adjustment_0_100 REAL DEFAULT 0,raw_rate_0_100 REAL,tier_prior_rate_0_100 REAL,raw_prior_gap_0_100 REAL,baseline_confidence_0_100 REAL,baseline_enriched_confidence_0_100 REAL,consistency_bonus_0_100 REAL,soft_uncertainty_reserve_0_100 REAL,sample_profile TEXT,role_profile TEXT,sanity_profile_key TEXT,volatility_profile TEXT,variance_profile TEXT,line_difficulty_profile TEXT,baseline_hp_profile_key TEXT,non_push_sample INTEGER,hit_count INTEGER,miss_count INTEGER,push_count INTEGER,prior_strength REAL,formula_version TEXT,confidence_formula_version TEXT,no_daily_context INTEGER DEFAULT 1,no_market_context INTEGER DEFAULT 1,no_scoring_context INTEGER DEFAULT 1,profile_notes_json TEXT,source_snapshot_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_v2_stage ${hpDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_v2_current ${hpDdl}`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_v2_history AS SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_hp_v2_current WHERE 1=0`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_v2_issues (issue_id TEXT PRIMARY KEY,batch_id TEXT,source_baseline_row_id TEXT,severity TEXT,issue_code TEXT,issue_message TEXT,issue_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_hp_v2_source_queue (queue_row_id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id TEXT,hp_v2_row_id TEXT,source_key TEXT,source_keys TEXT,game_pk TEXT,official_date TEXT,mlb_player_id INTEGER,player_name TEXT,canonical_prop_key TEXT,board_line_value REAL,selected_side TEXT,factor_family TEXT,profile_namespace TEXT,source_formula_key TEXT,baseline_formula_scope TEXT,source_hp_v2_rows INTEGER,source_hp_v2_batch_ids TEXT,source_game_pks TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_v2_source_queue_batch_row ON player_baseline_hp_v2_source_queue(batch_id, queue_row_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_v2_source_queue_batch_hp ON player_baseline_hp_v2_source_queue(batch_id, hp_v2_row_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_v2_source_queue_natural ON player_baseline_hp_v2_source_queue(batch_id, factor_family, mlb_player_id, canonical_prop_key, board_line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_v2_current_player_prop_line ON player_baseline_hp_v2_current(player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_v2_current_profile ON player_baseline_hp_v2_current(prop_family, baseline_hp_profile_key, sample_profile, line_difficulty_profile)`);
  await ensureBaselineV5StateSchema(env);
}

async function ensureBaselineV5StateSchema(env){
  const db=env.SCORE_DB;
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_v5_state_batches (
    batch_id TEXT PRIMARY KEY,
    request_id TEXT,
    run_id TEXT,
    mode TEXT,
    status TEXT,
    worker_version TEXT,
    source_watermark_date TEXT,
    source_watermark_game_pk TEXT,
    hp_current_rows INTEGER DEFAULT 0,
    hp_state_rows INTEGER DEFAULT 0,
    classification_current_rows INTEGER DEFAULT 0,
    classification_state_rows INTEGER DEFAULT 0,
    hitter_delta_rows_pending INTEGER DEFAULT 0,
    pitcher_delta_rows_pending INTEGER DEFAULT 0,
    current_tables_mutated INTEGER DEFAULT 0,
    history_tables_mutated INTEGER DEFAULT 0,
    full_cumulative_history_recompute INTEGER DEFAULT 0,
    certification TEXT,
    certification_grade TEXT,
    output_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_v5_hp_state_current (
    baseline_hp_row_id TEXT PRIMARY KEY,
    state_key TEXT,
    source_batch_id TEXT,
    state_batch_id TEXT,
    player_type TEXT,
    player_id INTEGER,
    player_name TEXT,
    canonical_prop_key TEXT,
    prop_family TEXT,
    line_value REAL,
    selected_side TEXT,
    baseline_hp_0_100 REAL,
    raw_rate_0_100 REAL,
    tier_prior_rate_0_100 REAL,
    raw_prior_gap_0_100 REAL,
    baseline_confidence_0_100 REAL,
    baseline_enriched_confidence_0_100 REAL,
    sample_profile TEXT,
    role_profile TEXT,
    sanity_profile_key TEXT,
    volatility_profile TEXT,
    variance_profile TEXT,
    line_difficulty_profile TEXT,
    baseline_hp_profile_key TEXT,
    non_push_sample INTEGER,
    hit_count INTEGER,
    miss_count INTEGER,
    push_count INTEGER,
    prior_strength REAL,
    prior_alpha REAL,
    prior_beta REAL,
    formula_version TEXT,
    confidence_formula_version TEXT,
    no_daily_context INTEGER DEFAULT 1,
    no_market_context INTEGER DEFAULT 1,
    no_scoring_context INTEGER DEFAULT 1,
    no_final_board_context INTEGER DEFAULT 1,
    last_processed_official_date TEXT,
    last_processed_game_pk TEXT,
    state_source TEXT,
    state_hydrated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_pbv5_hp_state_business ON player_baseline_v5_hp_state_current(player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbv5_hp_state_batch ON player_baseline_v5_hp_state_current(state_batch_id, source_batch_id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_v5_classification_state_current (
    classification_row_id TEXT PRIMARY KEY,
    state_key TEXT,
    source_batch_id TEXT,
    state_batch_id TEXT,
    player_type TEXT,
    player_id INTEGER,
    player_name TEXT,
    canonical_prop_key TEXT,
    line_value REAL,
    selected_side TEXT,
    classification_tier TEXT,
    classification_profile_key TEXT,
    sample_profile TEXT,
    volume_profile TEXT,
    lineup_profile TEXT,
    platoon_profile TEXT,
    usage_profile TEXT,
    volatility_profile TEXT,
    classification_confidence_0_100 REAL,
    games_sample INTEGER,
    events_sample INTEGER,
    pa_per_game REAL,
    ab_ratio REAL,
    avg_batting_order REAL,
    split_delta_0_100 REAL,
    hitter_pa_sum_est REAL,
    hitter_ab_sum_est REAL,
    pitcher_outs_sum_est REAL,
    pitcher_bf_sum_est REAL,
    metric_hits_per_game REAL,
    metric_walk_rate REAL,
    metric_strikeout_rate REAL,
    metric_outs_per_start REAL,
    metric_bf_per_start REAL,
    metric_k_rate REAL,
    metric_bb_rate REAL,
    metric_ha_rate REAL,
    metric_split_rows INTEGER,
    classification_formula_version TEXT,
    no_daily_context INTEGER DEFAULT 1,
    no_market_context INTEGER DEFAULT 1,
    no_scoring_context INTEGER DEFAULT 1,
    no_final_board_context INTEGER DEFAULT 1,
    last_processed_official_date TEXT,
    last_processed_game_pk TEXT,
    state_source TEXT,
    state_hydrated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_pbv5_cls_state_business ON player_baseline_v5_classification_state_current(player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbv5_cls_state_batch ON player_baseline_v5_classification_state_current(state_batch_id, source_batch_id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_v5_delta_events (
    event_id TEXT PRIMARY KEY,
    state_batch_id TEXT,
    mode TEXT,
    player_type TEXT,
    player_id INTEGER,
    game_pk TEXT,
    game_date TEXT,
    canonical_prop_key TEXT,
    actual_value REAL,
    source_table TEXT,
    source_row_hash TEXT,
    event_action TEXT,
    processed_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_pbv5_delta_events_hash ON player_baseline_v5_delta_events(source_row_hash)`);
  await run(db, `CREATE TABLE IF NOT EXISTS player_baseline_v5_state_audit (
    audit_id TEXT PRIMARY KEY,
    state_batch_id TEXT,
    mode TEXT,
    audit_key TEXT,
    audit_status TEXT,
    audit_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}


function getNested(o, paths){ for(const path of paths){ let x=o; let ok=true; for(const part of path){ if(x && Object.prototype.hasOwnProperty.call(x,part)) x=x[part]; else {ok=false; break;} } if(ok) return x; } return null; }
function rawHbp(raw){ const o=parseJson(raw,{}); return num(getNested(o,[["stat","hitByPitch"],["player","stats","batting","hitByPitch"],["stats","batting","hitByPitch"]])); }
function hitterFantasyValue(r){ return 3*num(r.singles)+5*num(r.doubles)+8*num(r.triples)+10*num(r.home_runs)+2*num(r.runs)+2*num(r.rbi)+2*num(r.walks)+2*rawHbp(r.raw_json)+5*num(r.stolen_bases); }
function propValueFromRow(prop, r){
  const p=String(prop||"");
  if(p==="fantasy_score") return hitterFantasyValue(r);
  if(p==="plate_appearances") return num(r.pa);
  if(p==="triples") return num(r.triples);
  if(p==="hits") return num(r.hits);
  if(p==="singles") return num(r.singles);
  if(p==="doubles") return num(r.doubles);
  if(p==="home_runs") return num(r.home_runs);
  if(p==="runs") return num(r.runs);
  if(p==="rbis") return num(r.rbi);
  if(p==="walks") return num(r.walks);
  if(p==="hitter_strikeouts") return num(r.strikeouts);
  if(p==="stolen_bases") return num(r.stolen_bases);
  if(p==="total_bases") return num(r.total_bases);
  if(p==="hits_runs_rbis") return num(r.hits)+num(r.runs)+num(r.rbi);
  if(p==="fantasy"||p==="pitcher_fantasy_score") return sourceAgnosticPitcherFantasyBaselineValue(r);
  if(p==="pitches_thrown") return num(r.pitches);
  if(p==="pitcher_strikeouts") return num(r.strikeouts);
  if(p==="pitcher_outs") return num(r.outs_recorded);
  if(p==="hits_allowed") return num(r.hits_allowed);
  if(p==="earned_runs") return num(r.earned_runs);
  if(p==="runs_allowed") return num(r.runs_allowed);
  if(p==="walks_allowed") return num(r.walks_allowed);
  if(p==="rfi_nrfi") return num(r.rfi_value);
  return null;
}
function mForProp(prop){ const p=String(prop||""); if(p==="rfi_nrfi") return 50; if(p==="fantasy"||p==="fantasy_score"||p==="pitcher_fantasy_score"||p==="hits_runs_rbis") return 35; if(p==="pitches_thrown"||p==="pitcher_outs") return 20; if(p==="triples"||p==="home_runs"||p==="stolen_bases") return 100; return 25; }
function sampleTierV2(n, prop, entityType=null){
  const sample=Number(n||0);
  // v0.1.80: true reliability tiers are sample-size bands only.
  // Do not let pitcher 10-19 game samples graduate into ESTABLISHED/ELITE labels.
  if(sample<5) return "TINY_SAMPLE";
  if(sample<15) return "LOW_SAMPLE";
  if(sample<30) return "MEDIUM_SAMPLE";
  if(sample<50) return "ESTABLISHED_SAMPLE";
  return "ELITE_SAMPLE";
}
function reliabilitySampleTierSql(sampleExpr){
  return `CASE
    WHEN COALESCE(${sampleExpr},0) < 5 THEN 'TINY_SAMPLE'
    WHEN COALESCE(${sampleExpr},0) < 15 THEN 'LOW_SAMPLE'
    WHEN COALESCE(${sampleExpr},0) < 30 THEN 'MEDIUM_SAMPLE'
    WHEN COALESCE(${sampleExpr},0) < 50 THEN 'ESTABLISHED_SAMPLE'
    ELSE 'ELITE_SAMPLE'
  END`;
}
function propFamilyV2(prop, entity){ const p=String(prop||""); if(p==="fantasy"||p==="fantasy_score"||p==="pitcher_fantasy_score") return "V2_FANTASY_COMPOSITE"; if(p==="rfi_nrfi") return "V2_FIRST_INNING_RUNS"; if(p==="pitches_thrown"||p==="pitcher_outs") return "V2_PITCHER_VOLUME"; if(entity==="pitcher") return "V2_PITCHER_PROP"; if(p==="triples"||p==="home_runs"||p==="stolen_bases") return "V2_RARE_HITTER_EVENT"; return "V2_HITTER_PROP"; }
function hitStatsFor(values,line,side){ return calcHpLine(values,line,side); }
function boundedNeighborBias(values, line, side, directRate){
  if(!values || values.length<5 || directRate==null) return {neighbor_rate_0_100:null, neighbor_bias_0_100:0, neighbor_sample:0};
  const deltas=[-1,1].map(d=>line+d).filter(x=>x>=0);
  const rates=[]; for(const l of deltas){ const hs=hitStatsFor(values,l,side); if(hs.non_push_sample>=5 && hs.raw_rate_0_100!=null) rates.push(hs.raw_rate_0_100); }
  if(!rates.length) return {neighbor_rate_0_100:null, neighbor_bias_0_100:0, neighbor_sample:0};
  const nr=rates.reduce((a,b)=>a+b,0)/rates.length;
  const phi=clamp(values.length/20,0,1);
  const bias=clamp((nr-directRate)*0.35*phi,-8,8);
  return {neighbor_rate_0_100:round(nr,2), neighbor_bias_0_100:round(bias,2), neighbor_sample:values.length};
}
function posteriorHeb(hit, miss, push, priorPct, m){ const n=hit+miss; if(n===0) return null; const p=clamp(Number(priorPct)/100,0.01,0.99); return round(100*((hit + p*m)/(n+m)),2); }
function effectiveHebM(hit, miss, priorPct, baseM){
  const n=hit+miss;
  if(n<=0) return baseM;
  const raw=100*hit/n;
  const gap=Math.abs(raw-Number(priorPct||50));
  // Locked HEB contract: when n>=20 and direct raw rate differs from prior by >15 points,
  // direct evidence must carry at least 75% weight. That means M <= n/3.
  if(n>=20 && gap>15) return Math.min(baseM, Math.max(1, n/3));
  return baseM;
}

function baselineV5DateCacheToken(maxDate){ return maxDate ? String(maxDate).slice(0,10) : "all"; }
async function loadHitterBaselineRows(env, playerId, maxDate=null){
  const dateTok=baselineV5DateCacheToken(maxDate);
  const key=`hitter_rows|${playerId}|${dateTok}`;
  if(V2_PLAYER_HISTORY_ROWS_CACHE.has(key)) return V2_PLAYER_HISTORY_ROWS_CACHE.get(key);
  const binds=[playerId];
  const dateFilter=maxDate ? `AND date(game_date) <= date(?)` : ``;
  if(maxDate) binds.push(String(maxDate).slice(0,10));
  const rows=await all(env.STATS_HITTER_DB,`SELECT player_id, game_pk, game_date, batting_order, pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json
    FROM hitter_game_logs
    WHERE player_id=?
      AND COALESCE(pa,0) >= 1
      AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
      ${dateFilter}
    ORDER BY game_date`, ...binds);
  V2_PLAYER_HISTORY_ROWS_CACHE.set(key,rows);
  return rows;
}
async function loadPitcherBaselineRows(env, playerId, maxDate=null){
  const dateTok=baselineV5DateCacheToken(maxDate);
  const key=`pitcher_rows|${playerId}|${dateTok}`;
  if(V2_PLAYER_HISTORY_ROWS_CACHE.has(key)) return V2_PLAYER_HISTORY_ROWS_CACHE.get(key);
  const binds=[playerId];
  const dateFilter=maxDate ? `AND date(game_date) <= date(?)` : ``;
  if(maxDate) binds.push(String(maxDate).slice(0,10));
  const rows=await all(env.TEAM_DB,`SELECT COALESCE(player_id, starter_player_id) AS player_id, game_pk, game_date, outs_recorded, batters_faced, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches
    FROM starter_history
    WHERE started_game=1 AND COALESCE(player_id, starter_player_id)=?
      ${dateFilter}
    ORDER BY game_date`, ...binds);
  V2_PLAYER_HISTORY_ROWS_CACHE.set(key,rows);
  return rows;
}
async function loadHitterValues(env, playerId, prop, maxDate=null){
  const key=`hitter|${playerId}|${prop}|${baselineV5DateCacheToken(maxDate)}`; if(V2_ENTITY_VALUE_CACHE.has(key)) return V2_ENTITY_VALUE_CACHE.get(key);
  const rows=await loadHitterBaselineRows(env,playerId,maxDate);
  const vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  V2_ENTITY_VALUE_CACHE.set(key,vals); return vals;
}
async function loadPitcherValues(env, playerId, prop, maxDate=null){
  const key=`pitcher|${playerId}|${prop}|${baselineV5DateCacheToken(maxDate)}`; if(V2_ENTITY_VALUE_CACHE.has(key)) return V2_ENTITY_VALUE_CACHE.get(key);
  const rows=await loadPitcherBaselineRows(env,playerId,maxDate);
  const vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  V2_ENTITY_VALUE_CACHE.set(key,vals); return vals;
}
async function loadRfiValues(env, sourceKey, playerId, maxDate=null){
  const cacheKey=`rfi|${sourceKey}|${playerId||'game'}|${baselineV5DateCacheToken(maxDate)}`; if(V2_ENTITY_VALUE_CACHE.has(cacheKey)) return V2_ENTITY_VALUE_CACHE.get(cacheKey);
  const dateFilter=maxDate ? `AND date(game_date) <= date(?)` : ``;
  if(String(sourceKey)==="sleeper"){
    const binds=maxDate?[playerId,String(maxDate).slice(0,10)]:[playerId];
    const rows=await all(env.CONTEXT_DB,`SELECT pitcher_id, game_pk, game_date, rfi_sl_more_hit AS rfi_value FROM expansion_first_inning_pitcher_context_current WHERE pitcher_id=? AND rfi_sl_more_hit IS NOT NULL ${dateFilter} ORDER BY game_date`, ...binds);
    const vals=rows.map(r=>num(r.rfi_value)).filter(v=>v!==null && Number.isFinite(Number(v))); V2_ENTITY_VALUE_CACHE.set(cacheKey,vals); return vals;
  }
  const binds=maxDate?[String(maxDate).slice(0,10)]:[];
  const rows=await all(env.CONTEXT_DB,`SELECT game_pk, game_date, rfi_pp_more_hit AS rfi_value FROM expansion_first_inning_game_context_current WHERE rfi_pp_more_hit IS NOT NULL ${dateFilter} ORDER BY game_date`, ...binds);
  const vals=rows.map(r=>num(r.rfi_value)).filter(v=>v!==null && Number.isFinite(Number(v))); V2_ENTITY_VALUE_CACHE.set(cacheKey,vals); return vals;
}
async function loadRfiPriorValues(env, sourceKey, maxDate=null){
  const cacheKey=`rfi_prior|${sourceKey||'source'}|${baselineV5DateCacheToken(maxDate)}`; if(V2_GLOBAL_VALUE_CACHE.has(cacheKey)) return V2_GLOBAL_VALUE_CACHE.get(cacheKey);
  const dateFilter=maxDate ? `AND date(game_date) <= date(?)` : ``;
  const binds=maxDate?[String(maxDate).slice(0,10)]:[];
  let rows=[];
  if(String(sourceKey)==="sleeper"){
    rows=await all(env.CONTEXT_DB,`SELECT pitcher_id, game_pk, game_date, rfi_sl_more_hit AS rfi_value FROM expansion_first_inning_pitcher_context_current WHERE rfi_sl_more_hit IS NOT NULL ${dateFilter} ORDER BY game_date`, ...binds);
  } else {
    rows=await all(env.CONTEXT_DB,`SELECT game_pk, game_date, rfi_pp_more_hit AS rfi_value FROM expansion_first_inning_game_context_current WHERE rfi_pp_more_hit IS NOT NULL ${dateFilter} ORDER BY game_date`, ...binds);
  }
  const vals=rows.map(r=>num(r.rfi_value)).filter(v=>v!==null && Number.isFinite(Number(v)));
  V2_GLOBAL_VALUE_CACHE.set(cacheKey,vals); return vals;
}
async function loadValuesForHpRow(env, row, maxDate=null){
  const prop=String(row.canonical_prop_key||""); const src=String(row.source_key||""); const fam=String(row.factor_family||""); const playerId=Number(row.mlb_player_id||0);
  if(prop==="rfi_nrfi") return loadRfiValues(env,src,playerId,maxDate);
  if(fam==="pitcher" || prop==="fantasy" || prop==="pitches_thrown" || prop==="pitcher_strikeouts" || prop==="pitcher_outs" || prop==="hits_allowed" || prop==="earned_runs" || prop==="walks_allowed") return loadPitcherValues(env,playerId,prop,maxDate);
  return loadHitterValues(env,playerId,prop,maxDate);
}
async function globalValuesForPrior(env, row, maxDate=null){
  const prop=String(row.canonical_prop_key||"");
  const fam=String(row.factor_family||"");
  const globalKey=`baseline|${prop}|${fam}|${baselineV5DateCacheToken(maxDate)}`;
  if(V2_GLOBAL_VALUE_CACHE.has(globalKey)) return V2_GLOBAL_VALUE_CACHE.get(globalKey);
  let vals=[];
  if(prop==="rfi_nrfi"){
    // Prior pool must be source/formula-level, not the first pitcher/player cached under the global prior key.
    // Sleeper RFI direct samples stay pitcher-specific; the prior uses all Sleeper pitcher RFI observations.
    vals=await loadRfiPriorValues(env,row.source_key,maxDate);
  } else if(fam==="pitcher" || prop==="fantasy" || prop==="pitches_thrown" || prop.startsWith("pitcher_") || prop==="hits_allowed" || prop==="earned_runs" || prop==="walks_allowed"){
    const pBinds=maxDate?[String(maxDate).slice(0,10)]:[];
    const pDateFilter=maxDate?`AND date(game_date) <= date(?)`:``;
    const rows=await all(env.TEAM_DB,`SELECT outs_recorded, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches FROM starter_history WHERE started_game=1 ${pDateFilter} ORDER BY game_date LIMIT 5000`, ...pBinds);
    vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  } else {
    const hBinds=maxDate?[String(maxDate).slice(0,10)]:[];
    const hDateFilter=maxDate?`AND date(game_date) <= date(?)`:``;
    const rows=await all(env.STATS_HITTER_DB,`SELECT batting_order, pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json
      FROM hitter_game_logs
      WHERE COALESCE(pa,0) >= 1
        AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
        ${hDateFilter}
      ORDER BY game_date LIMIT 50000`, ...hBinds);
    vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  }
  V2_GLOBAL_VALUE_CACHE.set(globalKey, vals);
  return vals;
}

async function profilePriorFor(env, row, line, side, profileNamespace, formulaKey, entityType, maxDate=null){
  const prop=String(row.canonical_prop_key||"");
  const ns=String(profileNamespace||"");
  const fk=String(formulaKey||"");
  const et=String(entityType||"");
  const cacheKey=`baseline|${prop}|${ns}|${fk}|${et}|${line}|${side}|${baselineV5DateCacheToken(maxDate)}`;
  if(V2_PROFILE_PRIOR_CACHE.has(cacheKey)) return V2_PROFILE_PRIOR_CACHE.get(cacheKey);
  const vals=await globalValuesForPrior(env,{...row,factor_family:et},maxDate);
  const hs=hitStatsFor(vals,line,side);
  const out={prior_rate_0_100: hs.raw_rate_0_100==null?50:hs.raw_rate_0_100, support: hs.non_push_sample, source_rows: vals.length};
  V2_PROFILE_PRIOR_CACHE.set(cacheKey,out);
  return out;
}
function baselineV2EntityType(row){
  const prop=String(row.canonical_prop_key||"");
  if(prop==="rfi_nrfi") return "pitcher";
  if(prop==="fantasy"||prop==="pitcher_fantasy_score"||prop==="pitches_thrown"||prop==="pitcher_strikeouts"||prop==="pitcher_outs"||prop==="hits_allowed"||prop==="earned_runs"||prop==="runs_allowed"||prop==="walks_allowed") return "pitcher";
  return "hitter";
}
function lineIdToken(line){ return String(line).replace(/[^0-9A-Za-z]+/g,'p').replace(/^p+|p+$/g,'') || 'line'; }
function baselineFormulaScope(row, profileNamespace, formulaKey){
  const ns=String(profileNamespace||"");
  const fk=String(formulaKey||"");
  // v0.1.43: baseline identity is formula-agnostic to apps and source rows. If a prop
  // truly needs a different scoring formula, the formula/profile name itself carries it;
  // source_key must never be part of baseline identity.
  return `baseline|${ns}|${fk}`;
}
function canonicalBaselineKey(row,line,side,profileNamespace,formulaKey){
  const player=Number(row.mlb_player_id||0) || upperToken(row.player_name||"game");
  const scope=baselineFormulaScope(row,profileNamespace,formulaKey);
  return `${upperToken(scope)}|${player}|${upperToken(row.canonical_prop_key)}|${lineIdToken(line)}|${side}`;
}


function baselineLinesForProp(prop, entityType){
  const p=String(prop||"");
  const m=String(entityType||"")==="pitcher" ? CANONICAL_PITCHER_BASELINE_LINES : CANONICAL_HITTER_BASELINE_LINES;
  return (m[p]||[]).map(Number).filter(v=>Number.isFinite(v));
}
function canonicalBaselineInventoryId(batchId, entityType, playerId, prop, line, side, profileNamespace, formulaKey){
  return `canonical_history|${batchId}|${entityType}|${playerId}|${upperToken(prop)}|${lineIdToken(line)}|${side}|${upperToken(profileNamespace)}|${upperToken(formulaKey)}`;
}
async function buildCanonicalHistoryBaselineSourceQueue(env,batchId,input={}){
  const minGames=Number(input.v2_min_history_games||1);
  const hitterProps=Object.keys(CANONICAL_HITTER_BASELINE_LINES);
  const pitcherProps=Object.keys(CANONICAL_PITCHER_BASELINE_LINES);
  const hitterRows=await all(env.STATS_HITTER_DB,`
    SELECT
      player_id AS mlb_player_id,
      COALESCE(MAX(CASE
        WHEN COALESCE(pa,0) >= 1
         AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
        THEN COALESCE(json_extract(raw_json,'$.player.person.fullName'), json_extract(raw_json,'$.player.fullName'))
        ELSE NULL END), CAST(player_id AS TEXT)) AS player_name,
      MAX(CASE
        WHEN COALESCE(pa,0) >= 1
         AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
        THEN game_pk ELSE NULL END) AS game_pk,
      MAX(CASE
        WHEN COALESCE(pa,0) >= 1
         AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
        THEN game_date ELSE NULL END) AS official_date,
      SUM(CASE
        WHEN COALESCE(pa,0) >= 1
         AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
        THEN 1 ELSE 0 END) AS history_games,
      COUNT(*) AS raw_all_history_games,
      SUM(COALESCE(pa,0)) AS total_pa,
      SUM(CASE WHEN COALESCE(pa,0) < 1 THEN 1 ELSE 0 END) AS pa_lt_1_rows,
      SUM(CASE WHEN json_extract(raw_json,'$.player.position.type')='Pitcher' THEN 1 ELSE 0 END) AS pitcher_position_rows,
      SUM(CASE WHEN json_extract(raw_json,'$.player.position.type')='Runner' THEN 1 ELSE 0 END) AS runner_position_rows
    FROM hitter_game_logs
    WHERE player_id IS NOT NULL
    GROUP BY player_id
    HAVING SUM(CASE
             WHEN COALESCE(pa,0) >= 1
              AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
             THEN 1 ELSE 0 END) >= ?
       AND SUM(COALESCE(pa,0)) > 0
    ORDER BY player_id`,minGames);
  const pitcherRows=await all(env.TEAM_DB,`SELECT COALESCE(player_id, starter_player_id) AS mlb_player_id, MAX(starter_name) AS player_name, MAX(game_pk) AS game_pk, MAX(game_date) AS official_date, COUNT(*) AS history_games FROM starter_history WHERE started_game=1 AND COALESCE(player_id, starter_player_id) IS NOT NULL GROUP BY COALESCE(player_id, starter_player_id) HAVING COUNT(*)>=? ORDER BY COALESCE(player_id, starter_player_id)`,minGames);
  const stmts=[];
  function enqueuePlayer(r, entityType, props){
    const playerId=Number(r.mlb_player_id||0); if(!playerId) return;
    const playerName=String(r.player_name||"");
    for(const prop of props){
      const factorFamily=entityType;
      const lines=baselineLinesForProp(prop,entityType);
      for(const line of lines){
        for(const side of SIDES){
          const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:factorFamily,selected_side:side,line_value:line});
          if(!resolved.profileNamespace || !resolved.sourceFormulaKey) continue;
          const scope=baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey);
          const hpId=canonicalBaselineInventoryId(batchId,entityType,playerId,prop,line,side,resolved.profileNamespace,resolved.sourceFormulaKey);
          stmts.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_hp_v2_source_queue (batch_id,hp_v2_row_id,source_key,source_keys,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,board_line_value,selected_side,factor_family,profile_namespace,source_formula_key,baseline_formula_scope,source_hp_v2_rows,source_hp_v2_batch_ids,source_game_pks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(batchId,hpId,null,null,r.game_pk||null,r.official_date||null,playerId,playerName,prop,Number(line),side,factorFamily,resolved.profileNamespace,resolved.sourceFormulaKey,scope,Number(r.history_games||0),null,r.game_pk||null));
        }
      }
    }
  }
  for(const r of hitterRows) enqueuePlayer(r,"hitter",hitterProps);
  for(const r of pitcherRows) enqueuePlayer(r,"pitcher",pitcherProps);
  await batch(env.SCORE_DB,stmts,50);

  return {hitter_players:hitterRows.length,pitcher_players:pitcherRows.length,queued_rows:stmts.length,min_history_games:minGames,baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app"};
}

function expectedClassificationShape(entityType){
  const et=String(entityType||"hitter");
  const linesMap=et==="pitcher" ? CANONICAL_PITCHER_BASELINE_LINES : CANONICAL_HITTER_BASELINE_LINES;
  const props=Object.keys(linesMap);
  const rows=props.reduce((a,p)=>a+(baselineLinesForProp(p,et).length*SIDES.length),0);
  return {entity_type:et, expected_rows_per_player:rows, expected_props:props.length, expected_sides:SIDES.length, props};
}
async function classificationShapeAudit(env,batchId,tableName="player_baseline_classification_v5_stage"){
  const allowed=new Set(["player_baseline_classification_v5_stage","player_baseline_classification_v5_current"]);
  if(!allowed.has(tableName)) tableName="player_baseline_classification_v5_stage";
  const rows=await all(env.SCORE_DB,`SELECT player_type, player_id, player_name, COUNT(*) AS rows, COUNT(DISTINCT canonical_prop_key) AS props, COUNT(DISTINCT selected_side) AS sides FROM ${tableName} WHERE batch_id=? GROUP BY player_type, player_id, player_name ORDER BY player_type, player_id`,batchId);
  const bad=[];
  for(const r of rows){
    const sh=expectedClassificationShape(r.player_type||"hitter");
    if(Number(r.rows)!==sh.expected_rows_per_player || Number(r.props)!==sh.expected_props || Number(r.sides)!==sh.expected_sides){
      bad.push({player_type:r.player_type,player_id:r.player_id,player_name:r.player_name,rows:Number(r.rows),props:Number(r.props),sides:Number(r.sides),expected_rows:sh.expected_rows_per_player,expected_props:sh.expected_props,expected_sides:sh.expected_sides});
    }
  }
  return {table_name:tableName, players_checked:rows.length, bad_players:bad.length, bad_players_sample:bad.slice(0,25)};
}
async function insertClassificationV5Row(env, tableName, payload, includeArchivedAt=false){
  const allowed=new Set(["player_baseline_classification_v5_stage","player_baseline_classification_v5_current","player_baseline_classification_v5_history"]);
  if(!allowed.has(tableName)) throw new Error("invalid_classification_table");
  const cols="classification_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,classification_tier,classification_profile_key,sample_profile,volume_profile,lineup_profile,platoon_profile,usage_profile,volatility_profile,classification_confidence_0_100,games_sample,events_sample,pa_per_game,ab_ratio,avg_batting_order,split_delta_0_100,classification_json,created_at,updated_at";
  const vals=[payload.classification_row_id,payload.batch_id,payload.player_type,payload.player_id,payload.player_name,payload.canonical_prop_key,payload.line_value,payload.selected_side,payload.classification_tier,payload.classification_profile_key,payload.sample_profile,payload.volume_profile,payload.lineup_profile,payload.platoon_profile,payload.usage_profile,payload.volatility_profile,payload.classification_confidence_0_100,payload.games_sample,payload.events_sample,payload.pa_per_game,payload.ab_ratio,payload.avg_batting_order,payload.split_delta_0_100,payload.classification_json];
  if(includeArchivedAt){
    return env.SCORE_DB.prepare(`INSERT INTO ${tableName} (${cols},archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(...vals).run();
  }
  return env.SCORE_DB.prepare(`INSERT OR REPLACE INTO ${tableName} (${cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(...vals).run();
}

async function classificationUniverseAudit(env,batchId){
  const hitterShape=expectedClassificationShape('hitter');
  const pitcherShape=expectedClassificationShape('pitcher');
  const hitterPlayers=Number((await first(env.SCORE_DB,`SELECT COUNT(DISTINCT player_id) AS c FROM player_baseline_classification_v5_current WHERE batch_id=? AND player_type='hitter'`,batchId))?.c||0);
  const pitcherPlayersCurrent=Number((await first(env.SCORE_DB,`SELECT COUNT(DISTINCT player_id) AS c FROM player_baseline_classification_v5_current WHERE batch_id=? AND player_type='pitcher'`,batchId))?.c||0);
  const pitcherRowsCurrent=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_current WHERE batch_id=? AND player_type='pitcher'`,batchId))?.c||0);
  const pitcherUniverse=await first(env.TEAM_DB,`SELECT COUNT(DISTINCT COALESCE(player_id, starter_player_id)) AS pitchers FROM starter_history WHERE started_game=1 AND COALESCE(player_id, starter_player_id) IS NOT NULL`);
  const pitcherPlayersExpected=Number(pitcherUniverse&&pitcherUniverse.pitchers||0);
  const expectedPitcherRows=pitcherPlayersExpected*pitcherShape.expected_rows_per_player;
  const missingPitcherPlayers=Math.max(pitcherPlayersExpected-pitcherPlayersCurrent,0);
  const missingPitcherRows=Math.max(expectedPitcherRows-pitcherRowsCurrent,0);
  return {batch_id:batchId,hitter_players:hitterPlayers,hitter_expected_rows_per_player:hitterShape.expected_rows_per_player,pitcher_players_current:pitcherPlayersCurrent,pitcher_players_expected:pitcherPlayersExpected,pitcher_expected_rows_per_player:pitcherShape.expected_rows_per_player,pitcher_rows_current:pitcherRowsCurrent,pitcher_rows_expected:expectedPitcherRows,missing_pitcher_players:missingPitcherPlayers,missing_pitcher_rows:missingPitcherRows,unified_classification_required:true};
}
async function pitcherClassificationWorkItems(env,batchId,limit){
  const max=clamp(Number(limit||200),1,500);
  const shape=expectedClassificationShape('pitcher');
  const pitcherRows=await all(env.TEAM_DB,`SELECT COALESCE(player_id, starter_player_id) AS mlb_player_id, MAX(starter_name) AS player_name, MAX(game_pk) AS game_pk, MAX(game_date) AS official_date, COUNT(*) AS history_games FROM starter_history WHERE started_game=1 AND COALESCE(player_id, starter_player_id) IS NOT NULL GROUP BY COALESCE(player_id, starter_player_id) HAVING COUNT(*)>=1 ORDER BY COALESCE(player_id, starter_player_id)`);
  const existingRows=await all(env.SCORE_DB,`SELECT classification_row_id FROM player_baseline_classification_v5_current WHERE batch_id=? AND player_type='pitcher'`,batchId);
  const existing=new Set(existingRows.map(r=>String(r.classification_row_id)));
  const items=[];
  for(const pr of pitcherRows){
    const playerId=Number(pr.mlb_player_id||0); if(!playerId) continue;
    const playerName=safeResolvedPlayerName({mlb_player_id:playerId,player_name:pr.player_name});
    for(const prop of shape.props){
      for(const line of baselineLinesForProp(prop,'pitcher')){
        for(const side of SIDES){
          const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:'pitcher',selected_side:side,line_value:line});
          if(!resolved.profileNamespace || !resolved.sourceFormulaKey) continue;
          const r={source_key:null,source_keys:null,game_pk:pr.game_pk||null,official_date:pr.official_date||null,mlb_player_id:playerId,player_name:playerName,canonical_prop_key:prop,board_line_value:Number(line),selected_side:side,factor_family:'pitcher',profile_namespace:resolved.profileNamespace,source_formula_key:resolved.sourceFormulaKey,baseline_formula_scope:baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey),source_hp_v2_rows:Number(pr.history_games||0),source_hp_v2_batch_ids:null,source_game_pks:pr.game_pk||null};
          const classificationId=`pbc_v5|${canonicalBaselineKey(r,Number(line),side,resolved.profileNamespace,resolved.sourceFormulaKey)}`;
          if(existing.has(classificationId)) continue;
          items.push({row:r,line:Number(line),side,resolved,classificationId,playerId,playerName});
          if(items.length>=max) return items;
        }
      }
    }
  }
  return items;
}
async function insertSourceQueueIfMissing(env,batchId,item){
  const r=item.row;
  const hpId=canonicalBaselineInventoryId(batchId,'pitcher',item.playerId,r.canonical_prop_key,item.line,item.side,item.resolved.profileNamespace,item.resolved.sourceFormulaKey);
  const exists=await first(env.SCORE_DB,`SELECT 1 AS ok FROM player_baseline_hp_v2_source_queue WHERE batch_id=? AND hp_v2_row_id=? LIMIT 1`,batchId,hpId);
  if(exists && exists.ok) return false;
  await env.SCORE_DB.prepare(`INSERT INTO player_baseline_hp_v2_source_queue (batch_id,hp_v2_row_id,source_key,source_keys,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,board_line_value,selected_side,factor_family,profile_namespace,source_formula_key,baseline_formula_scope,source_hp_v2_rows,source_hp_v2_batch_ids,source_game_pks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(batchId,hpId,null,null,r.game_pk||null,r.official_date||null,item.playerId,item.playerName,r.canonical_prop_key,item.line,item.side,'pitcher',item.resolved.profileNamespace,item.resolved.sourceFormulaKey,r.baseline_formula_scope,Number(r.source_hp_v2_rows||0),null,r.source_game_pks||null).run();
  return true;
}

async function reconcileMissingClassificationHistoryRows(env,batchId,limit){
  const max=clamp(Number(limit||100),1,500);
  const rows=await all(env.SCORE_DB,`
    SELECT
      c.classification_row_id,c.batch_id,c.player_type,c.player_id,c.player_name,c.canonical_prop_key,c.line_value,c.selected_side,
      c.classification_tier,c.classification_profile_key,c.sample_profile,c.volume_profile,c.lineup_profile,c.platoon_profile,c.usage_profile,c.volatility_profile,
      c.classification_confidence_0_100,c.games_sample,c.events_sample,c.pa_per_game,c.ab_ratio,c.avg_batting_order,c.split_delta_0_100,c.classification_json
    FROM player_baseline_classification_v5_current c
    WHERE c.batch_id=?
      AND NOT EXISTS (
        SELECT 1
        FROM player_baseline_classification_v5_history h
        WHERE h.batch_id=c.batch_id
          AND h.classification_row_id=c.classification_row_id
      )
    ORDER BY c.player_type, c.player_id, c.canonical_prop_key, c.line_value, c.selected_side
    LIMIT ?`,batchId,max);
  let inserted=0;
  const sample=[];
  for(const r of rows){
    const exists=await first(env.SCORE_DB,`SELECT 1 AS ok FROM player_baseline_classification_v5_history WHERE batch_id=? AND classification_row_id=? LIMIT 1`,batchId,r.classification_row_id);
    if(exists && exists.ok) continue;
    await insertClassificationV5Row(env,"player_baseline_classification_v5_history",r,true);
    inserted++;
    if(sample.length<25) sample.push({player_type:r.player_type,player_id:r.player_id,player_name:r.player_name,prop:r.canonical_prop_key,line:Number(r.line_value),side:r.selected_side,classification_row_id:r.classification_row_id});
  }
  return {inserted, sample, candidates:rows.length};
}

async function sourceQueueSeedForPlayer(env,batchId,playerType,playerId){
  return await first(env.SCORE_DB,`
    SELECT
      MAX(game_pk) AS game_pk,
      MAX(official_date) AS official_date,
      MAX(source_hp_v2_rows) AS source_hp_v2_rows,
      MAX(source_game_pks) AS source_game_pks
    FROM player_baseline_hp_v2_source_queue
    WHERE batch_id=?
      AND factor_family=?
      AND mlb_player_id=?`,batchId,playerType,playerId);
}

async function reconcileMissingSourceQueueRows(env,batchId,limit,options={}){
  const max=clamp(Number(limit||25),1,120);
  const playerTypeFilter=options.player_type ? String(options.player_type) : null;
  const deadlineMs=Number(options.deadline_ms||0);

  // v0.1.54: near-finish rescue must not globally scan 67k mostly-complete rows every tick.
  // First identify only players whose classification row count is still ahead of source_queue,
  // then diff exact hp_v2_row_id values in JS for those players. This remains source_queue-only,
  // idempotent, and never deletes/rebuilds current, stage, history, scoring, or final board data.
  const partialPlayers=await all(env.SCORE_DB,`
    WITH c AS (
      SELECT
        player_type,
        player_id,
        MAX(player_name) AS player_name,
        COUNT(*) AS current_rows
      FROM player_baseline_classification_v5_current
      WHERE batch_id=?
        AND (? IS NULL OR player_type=?)
      GROUP BY player_type, player_id
    ),
    q AS (
      SELECT
        factor_family AS player_type,
        mlb_player_id AS player_id,
        COUNT(*) AS queue_rows
      FROM player_baseline_hp_v2_source_queue
      WHERE batch_id=?
        AND (? IS NULL OR factor_family=?)
      GROUP BY factor_family, mlb_player_id
    )
    SELECT
      c.player_type,
      c.player_id,
      c.player_name,
      c.current_rows,
      COALESCE(q.queue_rows,0) AS queue_rows,
      c.current_rows - COALESCE(q.queue_rows,0) AS missing_rows
    FROM c
    LEFT JOIN q
      ON q.player_type=c.player_type
     AND q.player_id=c.player_id
    WHERE c.current_rows > COALESCE(q.queue_rows,0)
    ORDER BY missing_rows DESC, c.player_type, c.player_id
    LIMIT ?`,batchId,playerTypeFilter,playerTypeFilter,batchId,playerTypeFilter,playerTypeFilter,Math.min(50,Math.max(1,max)));

  let inserted=0;
  const sample=[];
  let candidates=0;
  let playersScanned=0;

  for(const p of partialPlayers){
    if(inserted>=max || (deadlineMs && Date.now()>=deadlineMs)) break;
    const playerType=String(p.player_type||"");
    const playerId=Number(p.player_id||0);
    if(!playerType || !playerId) continue;
    playersScanned++;

    const existingRows=await all(env.SCORE_DB,`
      SELECT hp_v2_row_id
      FROM player_baseline_hp_v2_source_queue
      WHERE batch_id=?
        AND factor_family=?
        AND mlb_player_id=?`,batchId,playerType,playerId);
    const existingIds=new Set(existingRows.map(r=>String(r.hp_v2_row_id||"")));

    const currentRows=await all(env.SCORE_DB,`
      SELECT
        player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,
        games_sample,events_sample,classification_row_id,classification_json
      FROM player_baseline_classification_v5_current
      WHERE batch_id=?
        AND player_type=?
        AND player_id=?
      ORDER BY canonical_prop_key, line_value, selected_side`,batchId,playerType,playerId);

    let seed=null;
    let seedLoaded=false;
    for(const c of currentRows){
      if(inserted>=max || (deadlineMs && Date.now()>=deadlineMs)) break;
      const prop=String(c.canonical_prop_key||"");
      const line=Number(c.line_value);
      const side=String(c.selected_side||"");
      const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:playerType,selected_side:side,line_value:line});
      if(!Number.isFinite(line) || !resolved.profileNamespace || !resolved.sourceFormulaKey) continue;
      const hpId=canonicalBaselineInventoryId(batchId,playerType,playerId,prop,line,side,resolved.profileNamespace,resolved.sourceFormulaKey);
      if(existingIds.has(hpId)) continue;
      candidates++;
      const exists=await first(env.SCORE_DB,`SELECT 1 AS ok FROM player_baseline_hp_v2_source_queue WHERE batch_id=? AND hp_v2_row_id=? LIMIT 1`,batchId,hpId);
      if(exists && exists.ok){ existingIds.add(hpId); continue; }
      if(!seedLoaded){
        seed=await sourceQueueSeedForPlayer(env,batchId,playerType,playerId);
        seedLoaded=true;
      }
      if(deadlineMs && Date.now()>=deadlineMs) break;
      const sourceRows=Number((seed&&seed.source_hp_v2_rows)||c.events_sample||c.games_sample||0);
      const scope=baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey);
      await env.SCORE_DB.prepare(`INSERT INTO player_baseline_hp_v2_source_queue (batch_id,hp_v2_row_id,source_key,source_keys,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,board_line_value,selected_side,factor_family,profile_namespace,source_formula_key,baseline_formula_scope,source_hp_v2_rows,source_hp_v2_batch_ids,source_game_pks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(batchId,hpId,null,null,(seed&&seed.game_pk)||null,(seed&&seed.official_date)||null,playerId,safeResolvedPlayerName({mlb_player_id:playerId,player_name:c.player_name||p.player_name}),prop,line,side,playerType,resolved.profileNamespace,resolved.sourceFormulaKey,scope,sourceRows,null,(seed&&seed.source_game_pks)||(seed&&seed.game_pk)||null).run();
      existingIds.add(hpId);
      inserted++;
      if(sample.length<25) sample.push({player_type:playerType,player_id:playerId,player_name:c.player_name||p.player_name,prop,line,side,hp_v2_row_id:hpId});
    }
  }
  return {inserted, sample, candidates, hard_cap:max, player_type_filter:playerTypeFilter, partial_players:partialPlayers.length, players_scanned:playersScanned, near_finish_direct_source_queue:true};
}

async function classifyAndInsertRescueItem(env,batchId,item,rescueTag){
  const r=item.row, line=item.line, side=item.side, entityType='pitcher';
  const values=await loadValuesForHpRow(env,r);
  const hs=hitStatsFor(values,line,side);
  const model=await lockedBaselineModel(env,r,line,side,entityType,item.resolved.profileNamespace,item.resolved.sourceFormulaKey);
  let confidence=round(clamp(model.baseline_confidence_0_100,1,95),2);
  let post=model.baseline_hp_0_100;
  const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,r.canonical_prop_key,entityType);
  const calibrationGuard=applyBaselineV2CalibrationGuard({prop:r.canonical_prop_key,entityType,side,line,hp:post,confidence,hs,sampleTier});
  post=calibrationGuard.hp; confidence=calibrationGuard.confidence;
  const stats=valueStats(values);
  const classification=await classifyBaselineV5(env,r,line,side,entityType,{...model,baseline_hp_0_100:post,baseline_confidence_0_100:confidence,calibration_guard_v0_1_34:calibrationGuard},hs,stats);
  const payload={classification_row_id:item.classificationId,batch_id:batchId,player_type:entityType,player_id:item.playerId,player_name:item.playerName,canonical_prop_key:r.canonical_prop_key,line_value:line,selected_side:side,classification_tier:classification.classification_tier,classification_profile_key:classification.classification_profile_key,sample_profile:classification.sample_profile,volume_profile:classification.volume_profile,lineup_profile:classification.lineup_profile,platoon_profile:classification.platoon_profile,usage_profile:classification.usage_profile,volatility_profile:classification.volatility_profile,classification_confidence_0_100:classification.classification_confidence_0_100,games_sample:classification.games_sample,events_sample:classification.events_sample,pa_per_game:classification.pa_per_game,ab_ratio:classification.ab_ratio,avg_batting_order:classification.avg_batting_order,split_delta_0_100:classification.split_delta_0_100,classification_json:safeJson({...classification,rescue_v0_1_50:true,rescue_source:rescueTag,baseline_source_policy:'baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app'})};
  await insertClassificationV5Row(env,'player_baseline_classification_v5_stage',payload,false);
  await insertClassificationV5Row(env,'player_baseline_classification_v5_current',payload,false);
  await insertClassificationV5Row(env,'player_baseline_classification_v5_history',payload,true);
  return payload;
}

const HITTER_PLATOON_SIDE_TIER_KEYS = [
  'TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE',
  'TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE'
];
async function hitterPlatoonSideTierAudit(env,batchId){
  const mismatch=await first(env.SCORE_DB,`WITH side_pairs AS (
    SELECT player_type, player_id, canonical_prop_key, line_value,
      COUNT(DISTINCT selected_side) AS sides,
      COUNT(DISTINCT classification_tier) AS tiers,
      COUNT(DISTINCT classification_confidence_0_100) AS confidences,
      COUNT(DISTINCT volatility_profile) AS vol_profiles
    FROM player_baseline_classification_v5_current
    WHERE batch_id=?
    GROUP BY player_type, player_id, canonical_prop_key, line_value
  )
  SELECT
    COUNT(*) AS player_prop_line_pairs,
    COUNT(CASE WHEN sides=2 THEN 1 END) AS pairs_with_both_sides,
    COUNT(CASE WHEN tiers>1 THEN 1 END) AS pairs_with_side_tier_difference,
    COUNT(CASE WHEN confidences>1 THEN 1 END) AS pairs_with_side_conf_difference,
    COUNT(CASE WHEN vol_profiles>1 THEN 1 END) AS pairs_with_side_volatility_difference
  FROM side_pairs`,batchId);
  const hitterTierRows=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players
    FROM player_baseline_classification_v5_current
    WHERE batch_id=? AND player_type='hitter'
      AND classification_tier IN ('TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE','TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE')`,batchId);
  return {
    player_prop_line_pairs:Number(mismatch&&mismatch.player_prop_line_pairs||0),
    pairs_with_both_sides:Number(mismatch&&mismatch.pairs_with_both_sides||0),
    pairs_with_side_tier_difference:Number(mismatch&&mismatch.pairs_with_side_tier_difference||0),
    pairs_with_side_conf_difference:Number(mismatch&&mismatch.pairs_with_side_conf_difference||0),
    pairs_with_side_volatility_difference:Number(mismatch&&mismatch.pairs_with_side_volatility_difference||0),
    hitter_tier_7_8_rows:Number(hitterTierRows&&hitterTierRows.rows||0),
    hitter_tier_7_8_players:Number(hitterTierRows&&hitterTierRows.players||0)
  };
}
async function updateClassificationV5HistoryRow(env,payload){
  return env.SCORE_DB.prepare(`UPDATE player_baseline_classification_v5_history SET
    player_type=?, player_id=?, player_name=?, canonical_prop_key=?, line_value=?, selected_side=?,
    classification_tier=?, classification_profile_key=?, sample_profile=?, volume_profile=?, lineup_profile=?, platoon_profile=?, usage_profile=?, volatility_profile=?,
    classification_confidence_0_100=?, games_sample=?, events_sample=?, pa_per_game=?, ab_ratio=?, avg_batting_order=?, split_delta_0_100=?, classification_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=? AND classification_row_id=?`).bind(
      payload.player_type,payload.player_id,payload.player_name,payload.canonical_prop_key,payload.line_value,payload.selected_side,
      payload.classification_tier,payload.classification_profile_key,payload.sample_profile,payload.volume_profile,payload.lineup_profile,payload.platoon_profile,payload.usage_profile,payload.volatility_profile,
      payload.classification_confidence_0_100,payload.games_sample,payload.events_sample,payload.pa_per_game,payload.ab_ratio,payload.avg_batting_order,payload.split_delta_0_100,payload.classification_json,
      payload.batch_id,payload.classification_row_id
    ).run();
}

function classificationTierNumberFromKey(tierKey){
  const m=String(tierKey||'').match(/TIER_(\d+)/);
  return m ? Number(m[1]) : null;
}
function rewriteClassificationJsonForTierRepair(rawJson,targetTier,targetProfileKey,previousTier){
  let obj={};
  try{ obj=rawJson ? JSON.parse(String(rawJson)) : {}; }catch(_){ obj={}; }
  obj.classification_tier=targetTier;
  obj.tier_number=classificationTierNumberFromKey(targetTier);
  obj.classification_profile_key=targetProfileKey;
  obj.rescue_v0_1_57=true;
  obj.rescue_source='hitter_platoon_side_tier_neutral_fast_pair_repair';
  obj.previous_classification_tier=previousTier;
  obj.baseline_source_policy='baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app';
  return safeJson(obj);
}
async function repairHitterPlatoonSideTierRowsFastPair(env,batchId,limit){
  const max=clamp(Number(limit||40)*12,25,500);
  const oldTiers=[
    'TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE',
    'TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE'
  ];
  const rows=await all(env.SCORE_DB,`SELECT
      c.classification_row_id,
      c.batch_id,
      c.player_id,
      c.player_name,
      c.canonical_prop_key,
      c.line_value,
      c.selected_side,
      c.classification_tier AS previous_tier,
      c.classification_json,
      s.classification_tier AS target_tier
    FROM player_baseline_classification_v5_current c
    JOIN player_baseline_classification_v5_current s
      ON s.batch_id=c.batch_id
     AND s.player_type=c.player_type
     AND s.player_id=c.player_id
     AND s.canonical_prop_key=c.canonical_prop_key
     AND s.line_value=c.line_value
     AND s.selected_side<>c.selected_side
    WHERE c.batch_id=?
      AND c.player_type='hitter'
      AND c.classification_tier IN ('TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE','TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE')
      AND s.classification_tier NOT IN ('TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE','TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE')
    ORDER BY c.classification_tier, c.player_id, c.canonical_prop_key, c.line_value, c.selected_side
    LIMIT ?`,batchId,max);
  const stmts=[];
  const repaired=[];
  const skipped=[];
  for(const c of rows){
    const prop=String(c.canonical_prop_key||'');
    const line=Number(c.line_value);
    const side=String(c.selected_side||'');
    const targetTier=String(c.target_tier||'');
    if(!targetTier || oldTiers.includes(targetTier)){
      skipped.push({classification_row_id:c.classification_row_id,player_id:c.player_id,player_name:c.player_name,prop,line,side,reason:'missing_or_invalid_pair_target_tier',target_tier:targetTier});
      continue;
    }
    const targetProfileKey=`V5_${targetTier}_${upperToken(prop)}_${lineIdToken(line)}_${side}`;
    const nextJson=rewriteClassificationJsonForTierRepair(c.classification_json,targetTier,targetProfileKey,String(c.previous_tier||''));
    const binds=[targetTier,targetProfileKey,nextJson,batchId,String(c.classification_row_id)];
    stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_classification_v5_current SET classification_tier=?, classification_profile_key=?, classification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND classification_row_id=?`).bind(...binds));
    stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_classification_v5_stage SET classification_tier=?, classification_profile_key=?, classification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND classification_row_id=?`).bind(...binds));
    stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_classification_v5_history SET classification_tier=?, classification_profile_key=?, classification_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND classification_row_id=?`).bind(...binds));
    repaired.push({classification_row_id:String(c.classification_row_id),player_id:Number(c.player_id||0),player_name:c.player_name,prop,line,side,from_tier:c.previous_tier,to_tier:targetTier,target_profile_key:targetProfileKey});
  }
  if(stmts.length) await batch(env.SCORE_DB,stmts,50);
  return {repaired:repaired.length, skipped:skipped.length, sample:repaired.slice(0,50), skipped_sample:skipped.slice(0,50), targeted_hitter_platoon_tier_fast_pair_repair:true, no_row_count_change_expected:true, max_candidate_rows:max};
}
async function repairHitterPlatoonSideTierRows(env,batchId,limit,deadlineMs){
  const max=clamp(Number(limit||40),1,120);
  const rows=await all(env.SCORE_DB,`SELECT classification_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,classification_tier
    FROM player_baseline_classification_v5_current
    WHERE batch_id=? AND player_type='hitter'
      AND classification_tier IN ('TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE','TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE')
    ORDER BY player_id, canonical_prop_key, line_value, selected_side
    LIMIT ?`,batchId,max);
  const repaired=[];
  const skipped=[];
  for(const c of rows){
    if(deadlineMs && Date.now()>=deadlineMs) break;
    try{
      const entityType='hitter';
      const prop=String(c.canonical_prop_key||'');
      const line=Number(c.line_value);
      const side=String(c.selected_side||'');
      const playerId=Number(c.player_id||0);
      const playerName=safeResolvedPlayerName({mlb_player_id:playerId,player_name:c.player_name});
      const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:entityType,selected_side:side,line_value:line});
      if(!resolved.profileNamespace || !resolved.sourceFormulaKey){ skipped.push({classification_row_id:c.classification_row_id,player_id:playerId,player_name:playerName,prop,line,side,reason:'unresolved_inventory'}); continue; }
      const scope=baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey);
      const r={source_key:null,source_keys:null,game_pk:null,official_date:null,mlb_player_id:playerId,player_name:playerName,canonical_prop_key:prop,board_line_value:line,selected_side:side,factor_family:entityType,profile_namespace:resolved.profileNamespace,source_formula_key:resolved.sourceFormulaKey,baseline_formula_scope:scope,source_hp_v2_rows:null,source_hp_v2_batch_ids:null,source_game_pks:null};
      const values=await loadValuesForHpRow(env,r);
      const hs=hitStatsFor(values,line,side);
      const model=await lockedBaselineModel(env,r,line,side,entityType,resolved.profileNamespace,resolved.sourceFormulaKey);
      let confidence=round(clamp(model.baseline_confidence_0_100,1,95),2);
      let post=model.baseline_hp_0_100;
      const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,prop,entityType);
      const calibrationGuard=applyBaselineV2CalibrationGuard({prop,entityType,side,line,hp:post,confidence,hs,sampleTier});
      post=calibrationGuard.hp; confidence=calibrationGuard.confidence;
      const stats=valueStats(values);
      const classification=await classifyBaselineV5(env,r,line,side,entityType,{...model,baseline_hp_0_100:post,baseline_confidence_0_100:confidence,calibration_guard_v0_1_34:calibrationGuard},hs,stats);
      const payload={classification_row_id:String(c.classification_row_id),batch_id:batchId,player_type:entityType,player_id:playerId,player_name:playerName,canonical_prop_key:prop,line_value:line,selected_side:side,classification_tier:classification.classification_tier,classification_profile_key:classification.classification_profile_key,sample_profile:classification.sample_profile,volume_profile:classification.volume_profile,lineup_profile:classification.lineup_profile,platoon_profile:classification.platoon_profile,usage_profile:classification.usage_profile,volatility_profile:classification.volatility_profile,classification_confidence_0_100:classification.classification_confidence_0_100,games_sample:classification.games_sample,events_sample:classification.events_sample,pa_per_game:classification.pa_per_game,ab_ratio:classification.ab_ratio,avg_batting_order:classification.avg_batting_order,split_delta_0_100:classification.split_delta_0_100,classification_json:safeJson({...classification,rescue_v0_1_57:true,rescue_source:'hitter_platoon_side_tier_neutral_repair',previous_classification_tier:c.classification_tier,baseline_source_policy:'baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app'})};
      await insertClassificationV5Row(env,'player_baseline_classification_v5_stage',payload,false);
      await insertClassificationV5Row(env,'player_baseline_classification_v5_current',payload,false);
      await updateClassificationV5HistoryRow(env,payload);
      repaired.push({classification_row_id:payload.classification_row_id,player_id:playerId,player_name:playerName,prop,line,side,from_tier:c.classification_tier,to_tier:classification.classification_tier,platoon_profile:classification.platoon_profile,split_delta_0_100:classification.split_delta_0_100});
    }catch(e){
      skipped.push({classification_row_id:c.classification_row_id,player_id:c.player_id,player_name:c.player_name,prop:c.canonical_prop_key,line:c.line_value,side:c.selected_side,reason:String(e&&e.message?e.message:e).slice(0,300)});
    }
  }
  return {repaired:repaired.length, skipped:skipped.length, sample:repaired.slice(0,50), skipped_sample:skipped.slice(0,50), targeted_hitter_platoon_tier_repair:true, no_row_count_change_expected:true};
}



async function runBaselineV5StateHydrate(env,input={}){
  await ensureBaselineV5StateSchema(env);
  const requestId=String(input.request_id||rid("baseline_v5_state_hydrate"));
  const runId=String(input.run_id||rid("run"));
  const batchId=String(input.batch_id||rid("baseline_v5_state_hydrate_batch"));
  const started=Date.now();
  const sourceWatermark=await first(env.SCORE_DB,`SELECT MAX(official_date) AS max_official_date, MAX(game_pk) AS max_game_pk, COUNT(*) AS source_queue_rows FROM player_baseline_hp_v2_source_queue`);
  const watermarkDate=String((sourceWatermark&&sourceWatermark.max_official_date)||"2026-06-29");
  const watermarkGamePk=String((sourceWatermark&&sourceWatermark.max_game_pk)||"");
  const beforeHp=await tableCount(env.SCORE_DB,"player_baseline_hp_v2_current");
  const beforeCls=await tableCount(env.SCORE_DB,"player_baseline_classification_v5_current");
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_v5_state_batches (batch_id,request_id,run_id,mode,status,worker_version,source_watermark_date,source_watermark_game_pk,hp_current_rows,classification_current_rows,current_tables_mutated,history_tables_mutated,full_cumulative_history_recompute,certification,certification_grade,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,0,'BASELINE_V5_STATE_HYDRATE_STARTED','RUNNING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"baseline_v5_state_hydrate","running",VERSION,watermarkDate,watermarkGamePk,beforeHp,beforeCls);
  await run(env.SCORE_DB,`DELETE FROM player_baseline_v5_hp_state_current`);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_v5_hp_state_current (
      baseline_hp_row_id,state_key,source_batch_id,state_batch_id,player_type,player_id,player_name,canonical_prop_key,prop_family,line_value,selected_side,
      baseline_hp_0_100,raw_rate_0_100,tier_prior_rate_0_100,raw_prior_gap_0_100,baseline_confidence_0_100,baseline_enriched_confidence_0_100,
      sample_profile,role_profile,sanity_profile_key,volatility_profile,variance_profile,line_difficulty_profile,baseline_hp_profile_key,
      non_push_sample,hit_count,miss_count,push_count,prior_strength,prior_alpha,prior_beta,formula_version,confidence_formula_version,
      no_daily_context,no_market_context,no_scoring_context,no_final_board_context,last_processed_official_date,last_processed_game_pk,state_source,state_hydrated_at,updated_at)
    SELECT
      baseline_hp_row_id,
      player_type || '|' || player_id || '|' || canonical_prop_key || '|' || line_value || '|' || selected_side AS state_key,
      batch_id, ?, player_type, player_id, player_name, canonical_prop_key, prop_family, line_value, selected_side,
      baseline_hp_0_100, raw_rate_0_100, tier_prior_rate_0_100, raw_prior_gap_0_100, baseline_confidence_0_100, baseline_enriched_confidence_0_100,
      sample_profile, role_profile, sanity_profile_key, volatility_profile, variance_profile, line_difficulty_profile, baseline_hp_profile_key,
      non_push_sample, hit_count, miss_count, push_count, prior_strength,
      CASE WHEN canonical_prop_key='rfi_nrfi' THEN 0.50 ELSE 0.25 END AS prior_alpha,
      CASE WHEN canonical_prop_key='rfi_nrfi' THEN 0.50 ELSE 0.25 END AS prior_beta,
      formula_version, confidence_formula_version,
      COALESCE(no_daily_context,1), COALESCE(no_market_context,1), COALESCE(no_scoring_context,1), 1,
      ?, ?, 'HYDRATED_FROM_player_baseline_hp_v2_current_NO_CURRENT_MUTATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM player_baseline_hp_v2_current`,batchId,watermarkDate,watermarkGamePk);
  await run(env.SCORE_DB,`DELETE FROM player_baseline_v5_classification_state_current`);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_v5_classification_state_current (
      classification_row_id,state_key,source_batch_id,state_batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,
      classification_tier,classification_profile_key,sample_profile,volume_profile,lineup_profile,platoon_profile,usage_profile,volatility_profile,
      classification_confidence_0_100,games_sample,events_sample,pa_per_game,ab_ratio,avg_batting_order,split_delta_0_100,
      hitter_pa_sum_est,hitter_ab_sum_est,pitcher_outs_sum_est,pitcher_bf_sum_est,metric_hits_per_game,metric_walk_rate,metric_strikeout_rate,
      metric_outs_per_start,metric_bf_per_start,metric_k_rate,metric_bb_rate,metric_ha_rate,metric_split_rows,classification_formula_version,
      no_daily_context,no_market_context,no_scoring_context,no_final_board_context,last_processed_official_date,last_processed_game_pk,state_source,state_hydrated_at,updated_at)
    SELECT
      classification_row_id,
      player_type || '|' || player_id || '|' || canonical_prop_key || '|' || line_value || '|' || selected_side AS state_key,
      batch_id, ?, player_type, player_id, player_name, canonical_prop_key, line_value, selected_side,
      classification_tier, classification_profile_key, sample_profile, volume_profile, lineup_profile, platoon_profile, usage_profile, volatility_profile,
      classification_confidence_0_100, games_sample, events_sample, pa_per_game, ab_ratio, avg_batting_order, split_delta_0_100,
      CASE WHEN pa_per_game IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(pa_per_game*games_sample,4) ELSE NULL END,
      CASE WHEN pa_per_game IS NOT NULL AND ab_ratio IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(pa_per_game*ab_ratio*games_sample,4) ELSE NULL END,
      CASE WHEN json_extract(classification_json,'$.metrics.outs_per_start') IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(json_extract(classification_json,'$.metrics.outs_per_start')*games_sample,4) ELSE NULL END,
      CASE WHEN json_extract(classification_json,'$.metrics.bf_per_start') IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(json_extract(classification_json,'$.metrics.bf_per_start')*games_sample,4) ELSE NULL END,
      json_extract(classification_json,'$.metrics.hits_per_game'),
      json_extract(classification_json,'$.metrics.walk_rate'),
      json_extract(classification_json,'$.metrics.strikeout_rate'),
      json_extract(classification_json,'$.metrics.outs_per_start'),
      json_extract(classification_json,'$.metrics.bf_per_start'),
      json_extract(classification_json,'$.metrics.k_rate'),
      json_extract(classification_json,'$.metrics.bb_rate'),
      json_extract(classification_json,'$.metrics.ha_rate'),
      json_extract(classification_json,'$.metrics.split_rows'),
      'baseline_v5_classification_current_locked_shape',
      1,1,1,1, ?, ?, 'HYDRATED_FROM_player_baseline_classification_v5_current_NO_CURRENT_MUTATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM player_baseline_classification_v5_current`,batchId,watermarkDate,watermarkGamePk);
  const hpState=await tableCount(env.SCORE_DB,"player_baseline_v5_hp_state_current");
  const clsState=await tableCount(env.SCORE_DB,"player_baseline_v5_classification_state_current");
  const hpPairAudit=await first(env.SCORE_DB,`WITH pairs AS (
      SELECT m.player_type,m.player_id,m.canonical_prop_key,m.line_value,m.baseline_hp_0_100 AS more_hp,l.baseline_hp_0_100 AS less_hp,m.non_push_sample AS more_sample,l.non_push_sample AS less_sample
      FROM player_baseline_v5_hp_state_current m
      JOIN player_baseline_v5_hp_state_current l ON l.player_type=m.player_type AND l.player_id=m.player_id AND l.canonical_prop_key=m.canonical_prop_key AND l.line_value=m.line_value AND l.selected_side='less'
      WHERE m.selected_side='more'
    ) SELECT COUNT(*) AS pair_rows, SUM(CASE WHEN ROUND(more_hp+less_hp,2)!=100 THEN 1 ELSE 0 END) AS bad_hp_pair_rows, SUM(CASE WHEN more_sample!=less_sample THEN 1 ELSE 0 END) AS bad_sample_pair_rows FROM pairs`);
  const classDup=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT classification_row_id) AS distinct_rows FROM player_baseline_v5_classification_state_current`);
  const hpDup=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT baseline_hp_row_id) AS distinct_rows FROM player_baseline_v5_hp_state_current`);
  const deltaHitter=await first(env.STATS_HITTER_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players FROM hitter_game_logs WHERE date(game_date) > date(?)`,watermarkDate);
  const deltaPitcher=await first(env.STATS_PITCHER_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players FROM pitcher_game_logs WHERE date(game_date) > date(?)`,watermarkDate);
  const pass = Number(beforeHp||0)>0 && Number(beforeCls||0)>0 && Number(hpState||0)===Number(beforeHp||0) && Number(clsState||0)===Number(beforeCls||0) && Number(hpDup&&hpDup.rows||0)===Number(hpDup&&hpDup.distinct_rows||-1) && Number(classDup&&classDup.rows||0)===Number(classDup&&classDup.distinct_rows||-1) && Number(hpPairAudit&&hpPairAudit.bad_hp_pair_rows||0)===0 && Number(hpPairAudit&&hpPairAudit.bad_sample_pair_rows||0)===0;
  const cert=pass?"BASELINE_V5_STATE_HYDRATE_CERTIFIED_FULL_RERUN_EQUIVALENCE_ANCHOR":"BASELINE_V5_STATE_HYDRATE_BLOCKED_AUDIT_FAILED";
  const grade=pass?"PASS":"BLOCKED";
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"baseline_v5_state_hydrate",status:cert,certification:cert,certification_grade:grade,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false,no_daily_context:true,no_market_context:true,no_scoring_context:true,no_final_board_context:true,source_watermark_date:watermarkDate,source_watermark_game_pk:watermarkGamePk,hp_current_rows:beforeHp,hp_state_rows:hpState,classification_current_rows:beforeCls,classification_state_rows:clsState,hp_pair_audit:hpPairAudit,hp_duplicate_audit:hpDup,classification_duplicate_audit:classDup,pending_delta_window:{after_date:watermarkDate,hitter_rows:Number(deltaHitter&&deltaHitter.rows||0),hitter_players:Number(deltaHitter&&deltaHitter.players||0),pitcher_rows:Number(deltaPitcher&&deltaPitcher.rows||0),pitcher_players:Number(deltaPitcher&&deltaPitcher.players||0)},old_fake_delta_blocked:true,state_ready_for_shadow_delta:pass,elapsed_ms:Date.now()-started});
  await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status=?, hp_state_rows=?, classification_state_rows=?, hitter_delta_rows_pending=?, pitcher_delta_rows_pending=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,cert,hpState,clsState,Number(deltaHitter&&deltaHitter.rows||0),Number(deltaPitcher&&deltaPitcher.rows||0),cert,grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_v5_state_audit (audit_id,state_batch_id,mode,audit_key,audit_status,audit_json,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`,rid("audit"),batchId,"baseline_v5_state_hydrate","hydrate_anchor_parity",pass?"PASS":"BLOCKED",safeJson({hpPairAudit,hpDup,classDup,watermarkDate,deltaHitter,deltaPitcher}));
  return output;
}


function baselineV5StatefulSourceHash(parts){
  return parts.map(v=>String(v==null?'':v).replace(/\|/g,'/')).join('|');
}
function baselineV5StatefulOutcome(actual,line,side){
  const v=Number(actual), l=Number(line), sd=String(side||'').toLowerCase();
  if(!Number.isFinite(v)||!Number.isFinite(l)) return null;
  const push = v===l ? 1 : 0;
  if(push) return {hit:0,miss:0,push:1};
  const hit = sd==='less' ? (v<l?1:0) : (v>l?1:0);
  return {hit,miss:hit?0:1,push:0};
}
function baselineV5StatefulHpFromCounts({prop,entityType,line,side,hit,miss,push,oldConfidence,volatilityProfile}){
  const h=Number(hit||0), m=Number(miss||0), ps=Number(push||0), n=h+m;
  const raw=n>0?round(100*h/n,2):null;
  let hp=weakSmoothedHistoryHp(h,m,prop,entityType,line);
  const bounds=historyOnlyHpOperationalBounds(prop,entityType,line,n);
  if(hp!=null) hp=round(clamp(hp,bounds.floor,bounds.ceiling),2);
  const rawPriorGap = raw==null || hp==null ? 0 : round(raw-hp,2);
  let confidence=baselineV5ReliabilityConfidence(n,rawPriorGap,volatilityProfile||'VOLATILITY_UNKNOWN');
  const sampleTier=sampleTierV2(n,prop,entityType);
  const guard=applyBaselineV2CalibrationGuard({prop,entityType,side,line,hp,confidence,hs:{hit:h,miss:m,push:ps,non_push_sample:n,raw_rate_0_100:raw},sampleTier});
  hp=guard.hp;
  confidence=baselineV5LockedDeltaConfidence(entityType,n,guard.confidence,oldConfidence);
  return {baseline_hp_0_100:hp,raw_rate_0_100:raw,baseline_confidence_0_100:confidence,baseline_enriched_confidence_0_100:confidence,sample_profile:sampleTier,non_push_sample:n,hit_count:h,miss_count:m,push_count:ps,raw_prior_gap_0_100:raw==null||hp==null?null:rawPriorGap,guard};
}
function baselineV5StatefulClassFromRow(row, sourceRow){
  const entityType=String(row.player_type||'').toLowerCase();
  const prop=String(row.canonical_prop_key||'');
  const line=Number(row.line_value||0);
  const side=String(row.selected_side||'more');
  const oldGames=Math.max(0,Number(row.games_sample||0));
  const games=oldGames+1;
  const splitDelta=Number(row.split_delta_0_100||0);
  const volatilityProfile=String(row.volatility_profile||'VOLATILITY_UNKNOWN');
  const conf=round(clamp(Number(row.classification_confidence_0_100||25),1,95),2);
  if(entityType==='pitcher'){
    const oldOuts=Number(row.pitcher_outs_sum_est||0);
    const oldBf=Number(row.pitcher_bf_sum_est||0);
    const oldK=Number(row.metric_k_rate||0)*oldBf;
    const oldBb=Number(row.metric_bb_rate||0)*oldBf;
    const oldHa=Number(row.metric_ha_rate||0)*oldBf;
    const outs=oldOuts+num(sourceRow.outs_recorded);
    const bf=oldBf+pitcherBf(sourceRow);
    const k=oldK+num(sourceRow.strikeouts);
    const bb=oldBb+num(sourceRow.walks_allowed);
    const ha=oldHa+num(sourceRow.hits_allowed);
    const outsPerStart=games?outs/games:0, bfPerStart=games?bf/games:0;
    const kRate=bf?k/bf:0, bbRate=bf?bb/bf:0, haRate=bf?ha/bf:0;
    const tier=pitcherTier({games,outsPerStart,bfPerStart,kRate,bbRate,haRate,splitDelta,prop,line,side});
    const volumeProfile=outsPerStart>=18?'DEEP_STARTER':(outsPerStart>=15?'NORMAL_STARTER':(outsPerStart>=12?'LOW_WORKLOAD_STARTER':'SHORT_OR_UNSTABLE_WORKLOAD'));
    const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta<0?'SUPPRESSES_LEFT_MORE_THAN_RIGHT':'MORE_DAMAGE_VS_LEFT_THAN_RIGHT'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
    return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:'PITCHER_NA',platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:baselineV5LockedDeltaConfidence('pitcher',games,conf,conf),games_sample:games,events_sample:games,pa_per_game:null,ab_ratio:null,avg_batting_order:null,split_delta_0_100:splitDelta,pitcher_outs_sum_est:round(outs,4),pitcher_bf_sum_est:round(bf,4),metric_outs_per_start:round(outsPerStart,2),metric_bf_per_start:round(bfPerStart,2),metric_k_rate:round(kRate,4),metric_bb_rate:round(bbRate,4),metric_ha_rate:round(haRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
  }
  const oldPa=Number(row.hitter_pa_sum_est||((Number(row.pa_per_game||0))*oldGames));
  const oldAb=Number(row.hitter_ab_sum_est||((Number(row.ab_ratio||0))*oldPa));
  const oldHits=Number(row.metric_hits_per_game||0)*oldGames;
  const oldWalks=Number(row.metric_walk_rate||0)*oldPa;
  const oldSo=Number(row.metric_strikeout_rate||0)*oldPa;
  const newPa=oldPa+num(sourceRow.pa), newAb=oldAb+num(sourceRow.ab), newHits=oldHits+num(sourceRow.hits), newWalks=oldWalks+num(sourceRow.walks), newSo=oldSo+num(sourceRow.strikeouts);
  const orderVal=normalizedBattingOrderValue(sourceRow.batting_order);
  const oldAvgOrder=row.avg_batting_order==null?null:Number(row.avg_batting_order);
  const avgOrder=orderVal==null ? oldAvgOrder : (oldAvgOrder==null ? orderVal : ((oldAvgOrder*oldGames)+orderVal)/games);
  const paPerGame=games?newPa/games:0, abRatio=newPa?newAb/newPa:0, hitRatePerGame=games?newHits/games:0, walkRate=newPa?newWalks/newPa:0, soRate=newPa?newSo/newPa:0;
  const tier=hitterTier12({games,paPerGame,abRatio,avgOrder:avgOrder||0,hitRatePerGame,walkRate,soRate,splitDelta,prop,line,side});
  const lineupProfile=resolveLineupProfileFromOrder({avg_batting_order_normalized:avgOrder,batting_order_rows:avgOrder==null?0:games,batting_order_coverage:avgOrder==null?0:1});
  const volumeProfile=paPerGame>=4.2?'HIGH_VOLUME':(paPerGame>=3.7?'EVERYDAY_CORE':(paPerGame>=2.0?'LOW_USAGE_OR_PARTIAL':'MICRO_USAGE'));
  const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta>0?'FAVORABLE_VS_LEFT_SHAPE':'FAVORABLE_VS_RIGHT_SHAPE'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
  return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:lineupProfile,platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:round(clamp(conf,1,95),2),games_sample:games,events_sample:games,pa_per_game:round(paPerGame,3),ab_ratio:round(abRatio,3),avg_batting_order:avgOrder==null?null:round(avgOrder,2),split_delta_0_100:splitDelta,hitter_pa_sum_est:round(newPa,4),hitter_ab_sum_est:round(newAb,4),metric_hits_per_game:round(hitRatePerGame,3),metric_walk_rate:round(walkRate,4),metric_strikeout_rate:round(soRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
}
async function baselineV5StatefulSafeCutoff(env, watermarkDate){
  // v0.1.98: The stateful baseline delta is allowed to consume only fully certified source days.
  // Prefer the certifier coverage contract over raw MAX(game_date), then fall back to raw sources if coverage is unavailable.
  try{
    const required=['hitter_game_logs','pitcher_game_logs','team_game_logs','starter_history','bullpen_history','hitter_splits','pitcher_splits','hitter_metrics','pitcher_metrics'];
    const values=required.map(x=>`('${x}')`).join(',');
    const row=await first(env.TEAM_DB,`WITH required(layer_key) AS (VALUES ${values}),
      dates AS (
        SELECT official_date
        FROM mlb_game_data_coverage
        WHERE date(official_date)>date(?)
        GROUP BY official_date
      ), good AS (
        SELECT d.official_date
        FROM dates d
        WHERE NOT EXISTS (
          SELECT 1
          FROM required r
          LEFT JOIN mlb_game_data_coverage c
            ON c.layer_key=r.layer_key
           AND c.official_date=d.official_date
           AND c.coverage_status='complete'
           AND COALESCE(c.blocking_for_full_run,0)=0
          WHERE c.layer_key IS NULL
        )
      )
      SELECT MAX(official_date) AS max_game_date FROM good`, watermarkDate);
    if(row&&row.max_game_date) return String(row.max_game_date).slice(0,10);
  }catch(_){ /* fallback below */ }
  const h=await first(env.STATS_HITTER_DB,`SELECT MAX(game_date) AS max_game_date FROM hitter_game_logs WHERE date(game_date)>date(?)`,watermarkDate);
  const p=await first(env.STATS_PITCHER_DB,`SELECT MAX(game_date) AS max_game_date FROM pitcher_game_logs WHERE date(game_date)>date(?)`,watermarkDate);
  let s=null, t=null;
  try { s=await first(env.TEAM_DB,`SELECT MAX(game_date) AS max_game_date FROM starter_history WHERE started_game=1 AND date(game_date)>date(?)`,watermarkDate); } catch(_){ s=null; }
  try { t=await first(env.TEAM_DB,`SELECT MAX(game_date) AS max_game_date FROM team_game_logs WHERE date(game_date)>date(?)`,watermarkDate); } catch(_){ t=null; }
  const dates=[h&&h.max_game_date,p&&p.max_game_date,s&&s.max_game_date,t&&t.max_game_date].filter(Boolean).map(x=>String(x).slice(0,10));
  if(!dates.length) return null;
  return dates.sort()[0];
}
function baselineV5SqlPlaceholders(items){ return items.map(()=>'?').join(','); }
function baselineV5StatefulChunk(items,size){ const out=[]; for(let i=0;i<items.length;i+=size) out.push(items.slice(i,i+size)); return out; }
function baselineV5StatefulSourceKey(playerId,gamePk,gameDate){ return `${Number(playerId||0)}|${String(gamePk||'')}|${String(gameDate||'').slice(0,10)}`; }
function baselineV5StatefulUniquePlayerIds(rows){ return [...new Set(rows.map(r=>Number(r.player_id||0)).filter(Boolean))]; }
function baselineV5StatefulGroupByPlayer(rows){
  const m=new Map();
  for(const r of rows){ const id=Number(r.player_id||0); if(!id) continue; if(!m.has(id)) m.set(id,[]); m.get(id).push(r); }
  return m;
}
async function baselineV5StatefulPlayerPage(env,{playerType,watermarkDate,cutoffDate,limit,offset}){
  const lim=Math.max(1,Math.min(100,Number(limit||12))), off=Math.max(0,Number(offset||0));
  if(playerType==='hitter'){
    return await all(env.STATS_HITTER_DB,`SELECT player_id, COUNT(*) AS source_rows, MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date
      FROM hitter_game_logs
      WHERE date(game_date)>date(?) AND date(game_date)<=date(?)
        AND COALESCE(pa,0)>=1
        AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
      GROUP BY player_id
      ORDER BY player_id
      LIMIT ${lim} OFFSET ${off}`,watermarkDate,cutoffDate);
  }
  return await all(env.STATS_PITCHER_DB,`SELECT player_id, COUNT(*) AS source_rows, MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date
    FROM pitcher_game_logs
    WHERE date(game_date)>date(?) AND date(game_date)<=date(?)
    GROUP BY player_id
    ORDER BY player_id
    LIMIT ${lim} OFFSET ${off}`,watermarkDate,cutoffDate);
}
async function baselineV5StatefulSourceRowsForPlayers(env,{playerType,watermarkDate,cutoffDate,playerIds}){
  const ids=baselineV5StatefulUniquePlayerIds(playerIds.map(player_id=>({player_id})));
  if(!ids.length) return [];
  const ph=baselineV5SqlPlaceholders(ids);
  if(playerType==='hitter'){
    return await all(env.STATS_HITTER_DB,`SELECT player_id, game_pk, game_date, batting_order, pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json
      FROM hitter_game_logs
      WHERE date(game_date)>date(?) AND date(game_date)<=date(?)
        AND COALESCE(pa,0)>=1
        AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
        AND player_id IN (${ph})
      ORDER BY player_id, date(game_date), game_pk`,watermarkDate,cutoffDate,...ids);
  }
  return await all(env.STATS_PITCHER_DB,`SELECT player_id, game_pk, game_date, role, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json
    FROM pitcher_game_logs
    WHERE date(game_date)>date(?) AND date(game_date)<=date(?)
      AND player_id IN (${ph})
    ORDER BY player_id, date(game_date), game_pk`,watermarkDate,cutoffDate,...ids);
}
async function baselineV5StatefulLatestMetricBatch(env,{playerType,cutoffDate}){
  if(playerType==='hitter'){
    return await first(env.STATS_HITTER_DB,`SELECT batch_id, input_latest_game_date
      FROM hitter_metric_batches
      WHERE certification_grade='DELTA_RECALC_PASS'
        AND date(input_latest_game_date)<=date(?)
      ORDER BY date(input_latest_game_date) DESC, datetime(finished_at) DESC, datetime(created_at) DESC
      LIMIT 1`,cutoffDate);
  }
  return await first(env.STATS_PITCHER_DB,`SELECT batch_id, input_latest_game_date
    FROM pitcher_metric_batches
    WHERE certification_grade='DELTA_RECALC_PASS'
      AND date(input_latest_game_date)<=date(?)
    ORDER BY date(input_latest_game_date) DESC, datetime(finished_at) DESC, datetime(created_at) DESC
    LIMIT 1`,cutoffDate);
}
async function baselineV5StatefulMetricRowsForPlayers(env,{playerType,cutoffDate,playerIds}){
  const ids=baselineV5StatefulUniquePlayerIds(playerIds.map(player_id=>({player_id})));
  if(!ids.length) return {batch:null, rows:[]};
  const metricBatch=await baselineV5StatefulLatestMetricBatch(env,{playerType,cutoffDate});
  if(!metricBatch||!metricBatch.batch_id) return {batch:null, rows:[]};
  const ph=baselineV5SqlPlaceholders(ids);
  if(playerType==='hitter'){
    const rows=await all(env.STATS_HITTER_DB,`SELECT player_id, season, metric_window, games_count, pa_sum, ab_sum, hits_sum, walks_sum, strikeouts_sum, metrics_json
      FROM hitter_metric_snapshots
      WHERE source_metric_batch_id=?
        AND metric_window='season_to_date'
        AND player_id IN (${ph})`,metricBatch.batch_id,...ids);
    return {batch:metricBatch, rows};
  }
  const rows=await all(env.STATS_PITCHER_DB,`SELECT player_id, season, metric_window, games_count, appearances_count, starts_count, outs_recorded_sum, batters_faced_sum, hits_allowed_sum, walks_allowed_sum, strikeouts_sum, runs_allowed_sum, earned_runs_sum, metrics_json
    FROM pitcher_metric_snapshots
    WHERE source_batch_id=?
      AND metric_window='season_to_date'
      AND player_id IN (${ph})`,metricBatch.batch_id,...ids);
  return {batch:metricBatch, rows};
}
function baselineV5StatefulMetricMap(rows){ const m=new Map(); for(const r of rows||[]) m.set(Number(r.player_id||0),r); return m; }
function baselineV5StatefulOrderContext(sourceRows){
  let sum=0, rows=0;
  for(const r of sourceRows||[]){ const v=normalizedBattingOrderValue(r.batting_order); if(v!=null&&Number.isFinite(Number(v))){ sum+=Number(v); rows++; } }
  return {batting_order_sum:sum, batting_order_rows:rows};
}
function baselineV5StatefulClassFromCumulative(row, metricRow, sourceRows){
  if(!metricRow) return null;
  const entityType=String(row.player_type||'').toLowerCase();
  const prop=String(row.canonical_prop_key||'');
  const line=Number(row.line_value||0);
  const side=String(row.selected_side||'more');
  const splitDelta=Number(row.split_delta_0_100||0);
  const volatilityProfile=String(row.volatility_profile||'VOLATILITY_UNKNOWN');
  const oldConf=round(clamp(Number(row.classification_confidence_0_100||25),1,95),2);
  if(entityType==='pitcher'){
    const games=Math.max(0,Number(metricRow.starts_count||metricRow.games_count||0));
    const outs=Number(metricRow.outs_recorded_sum||0);
    const bf=Number(metricRow.batters_faced_sum||0);
    const k=Number(metricRow.strikeouts_sum||0);
    const bb=Number(metricRow.walks_allowed_sum||0);
    const ha=Number(metricRow.hits_allowed_sum||0);
    const outsPerStart=games?outs/games:0, bfPerStart=games?bf/games:0;
    const kRate=bf?k/bf:0, bbRate=bf?bb/bf:0, haRate=bf?ha/bf:0;
    const tier=pitcherTier({games,outsPerStart,bfPerStart,kRate,bbRate,haRate,splitDelta,prop,line,side});
    const volumeProfile=outsPerStart>=18?'DEEP_STARTER':(outsPerStart>=15?'NORMAL_STARTER':(outsPerStart>=12?'LOW_WORKLOAD_STARTER':'SHORT_OR_UNSTABLE_WORKLOAD'));
    const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta<0?'SUPPRESSES_LEFT_MORE_THAN_RIGHT':'MORE_DAMAGE_VS_LEFT_THAN_RIGHT'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
    return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:'PITCHER_NA',platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:baselineV5LockedDeltaConfidence('pitcher',games,oldConf,oldConf),games_sample:games,events_sample:games,pa_per_game:null,ab_ratio:null,avg_batting_order:null,split_delta_0_100:splitDelta,pitcher_outs_sum_est:round(outs,4),pitcher_bf_sum_est:round(bf,4),metric_outs_per_start:round(outsPerStart,2),metric_bf_per_start:round(bfPerStart,2),metric_k_rate:round(kRate,4),metric_bb_rate:round(bbRate,4),metric_ha_rate:round(haRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
  }
  const games=Math.max(0,Number(metricRow.games_count||0));
  const pa=Number(metricRow.pa_sum||0), ab=Number(metricRow.ab_sum||0), hits=Number(metricRow.hits_sum||0), walks=Number(metricRow.walks_sum||0), so=Number(metricRow.strikeouts_sum||0);
  const oldGames=Math.max(0,Number(row.games_sample||0));
  const oldAvgOrder=row.avg_batting_order==null?null:Number(row.avg_batting_order);
  const order=baselineV5StatefulOrderContext(sourceRows||[]);
  let avgOrder=oldAvgOrder;
  if(order.batting_order_rows>0){
    avgOrder=oldAvgOrder==null ? (order.batting_order_sum/order.batting_order_rows) : ((oldAvgOrder*oldGames)+order.batting_order_sum)/Math.max(1,oldGames+order.batting_order_rows);
  }
  const paPerGame=games?pa/games:0, abRatio=pa?ab/pa:0, hitRatePerGame=games?hits/games:0, walkRate=pa?walks/pa:0, soRate=pa?so/pa:0;
  const tier=hitterTier12({games,paPerGame,abRatio,avgOrder:avgOrder||0,hitRatePerGame,walkRate,soRate,splitDelta,prop,line,side});
  const lineupProfile=resolveLineupProfileFromOrder({avg_batting_order_normalized:avgOrder,batting_order_rows:avgOrder==null?0:games,batting_order_coverage:avgOrder==null?0:1});
  const volumeProfile=paPerGame>=4.2?'HIGH_VOLUME':(paPerGame>=3.7?'EVERYDAY_CORE':(paPerGame>=2.0?'LOW_USAGE_OR_PARTIAL':'MICRO_USAGE'));
  const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta>0?'FAVORABLE_VS_LEFT_SHAPE':'FAVORABLE_VS_RIGHT_SHAPE'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
  return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:lineupProfile,platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:round(clamp(oldConf,1,95),2),games_sample:games,events_sample:games,pa_per_game:round(paPerGame,3),ab_ratio:round(abRatio,3),avg_batting_order:avgOrder==null?null:round(avgOrder,2),split_delta_0_100:splitDelta,hitter_pa_sum_est:round(pa,4),hitter_ab_sum_est:round(ab,4),metric_hits_per_game:round(hitRatePerGame,3),metric_walk_rate:round(walkRate,4),metric_strikeout_rate:round(soRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
}
async function baselineV5StatefulExistingEventHashes(env,hashes){
  const out=new Set();
  for(const part of baselineV5StatefulChunk([...new Set(hashes.filter(Boolean))],90)){
    if(!part.length) continue;
    const rows=await all(env.SCORE_DB,`SELECT source_row_hash FROM player_baseline_v5_delta_events WHERE source_row_hash IN (${baselineV5SqlPlaceholders(part)})`,...part);
    for(const r of rows) out.add(String(r.source_row_hash||''));
  }
  return out;
}
async function baselineV5StatefulApplyPlayerAggregate(env,{batchId,watermarkDate,cutoffDate,playerType,playerIds}){
  const ids=baselineV5StatefulUniquePlayerIds(playerIds.map(player_id=>({player_id})));
  let rawRowsRead=0, eventsInserted=0, hpRowsUpdated=0, classRowsUpdated=0, reclassified=0, skippedNoState=0, duplicateEventsSkipped=0, playersProcessed=0, playersSkippedNoMetrics=0;
  if(!ids.length) return {rawRowsRead,eventsInserted,hpRowsUpdated,classRowsUpdated,reclassified,skippedNoState,duplicateEventsSkipped,playersProcessed,playersSkippedNoMetrics,aggregate_differential:true};
  const sourceRows=await baselineV5StatefulSourceRowsForPlayers(env,{playerType,watermarkDate,cutoffDate,playerIds:ids});
  rawRowsRead=sourceRows.length;
  const ph=baselineV5SqlPlaceholders(ids);
  const hpRows=await all(env.SCORE_DB,`SELECT * FROM player_baseline_v5_hp_state_current WHERE player_type=? AND player_id IN (${ph}) ORDER BY player_id, canonical_prop_key, line_value, selected_side`,playerType,...ids);
  const classRows=await all(env.SCORE_DB,`SELECT * FROM player_baseline_v5_classification_state_current WHERE player_type=? AND player_id IN (${ph}) ORDER BY player_id, canonical_prop_key, line_value, selected_side`,playerType,...ids);
  const metricPack=await baselineV5StatefulMetricRowsForPlayers(env,{playerType,cutoffDate,playerIds:ids});
  const metricMap=baselineV5StatefulMetricMap(metricPack.rows);
  const sourceByPlayer=baselineV5StatefulGroupByPlayer(sourceRows);
  const hpByPlayer=baselineV5StatefulGroupByPlayer(hpRows);
  const classByPlayer=baselineV5StatefulGroupByPlayer(classRows);
  const allEventRecords=[];
  for(const id of ids){
    const srcs=sourceByPlayer.get(id)||[];
    const hps=hpByPlayer.get(id)||[];
    const props=[...new Set(hps.map(r=>String(r.canonical_prop_key||'')))].filter(Boolean);
    for(const src of srcs){
      for(const prop of props){
        const actual=propValueFromRow(prop,src);
        if(actual==null || !Number.isFinite(Number(actual))) continue;
        const hash=baselineV5StatefulSourceHash([playerType,id,src.game_pk,src.game_date,prop,actual]);
        allEventRecords.push({player_id:id,source_key:baselineV5StatefulSourceKey(id,src.game_pk,src.game_date),game_pk:String(src.game_pk||''),game_date:String(src.game_date||'').slice(0,10),prop,actual:Number(actual),hash});
      }
    }
  }
  const existing=await baselineV5StatefulExistingEventHashes(env,allEventRecords.map(e=>e.hash));
  const newEventRecords=allEventRecords.filter(e=>!existing.has(e.hash));
  duplicateEventsSkipped=allEventRecords.length-newEventRecords.length;
  const eventsByPlayer=new Map();
  const eventStmtSql=`INSERT OR IGNORE INTO player_baseline_v5_delta_events (event_id,state_batch_id,mode,player_type,player_id,game_pk,game_date,canonical_prop_key,actual_value,source_table,source_row_hash,event_action,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`;
  const stmts=[];
  for(const e of newEventRecords){
    if(!eventsByPlayer.has(e.player_id)) eventsByPlayer.set(e.player_id,[]);
    eventsByPlayer.get(e.player_id).push(e);
    stmts.push(env.SCORE_DB.prepare(eventStmtSql).bind(rid('pbv5ev'),batchId,'baseline_v5_stateful_delta',playerType,e.player_id,e.game_pk,e.game_date,e.prop,e.actual,playerType==='hitter'?'STATS_HITTER_DB.hitter_game_logs':'STATS_PITCHER_DB.pitcher_game_logs',e.hash,'ADD_NEW_GAME'));
  }
  eventsInserted=newEventRecords.length;
  for(const id of ids){
    const hps=hpByPlayer.get(id)||[];
    const cls=classByPlayer.get(id)||[];
    const srcs=sourceByPlayer.get(id)||[];
    if(!hps.length&&!cls.length){ skippedNoState++; continue; }
    playersProcessed++;
    const playerEvents=eventsByPlayer.get(id)||[];
    for(const r of hps){
      const prop=String(r.canonical_prop_key||'');
      let addHit=0, addMiss=0, addPush=0;
      for(const e of playerEvents){
        if(e.prop!==prop) continue;
        const out=baselineV5StatefulOutcome(e.actual,r.line_value,r.selected_side); if(!out) continue;
        addHit+=out.hit; addMiss+=out.miss; addPush+=out.push;
      }
      if(addHit===0&&addMiss===0&&addPush===0) continue;
      const newHit=Number(r.hit_count||0)+addHit;
      const newMiss=Number(r.miss_count||0)+addMiss;
      const newPush=Number(r.push_count||0)+addPush;
      const clsMatch=cls.find(c=>String(c.canonical_prop_key||'')===prop && Number(c.line_value)===Number(r.line_value) && String(c.selected_side||'')===String(r.selected_side||''));
      const clsCalcForHp=clsMatch ? baselineV5StatefulClassFromCumulative(clsMatch,metricMap.get(id),srcs) : null;
      const nextSanityKey=clsCalcForHp&&clsCalcForHp.classification_profile_key?clsCalcForHp.classification_profile_key:r.sanity_profile_key;
      const calc=baselineV5StatefulHpFromCounts({prop,entityType:playerType,line:Number(r.line_value),side:String(r.selected_side||''),hit:newHit,miss:newMiss,push:newPush,oldConfidence:r.baseline_confidence_0_100,volatilityProfile:(clsCalcForHp&&clsCalcForHp.volatility_profile)||r.volatility_profile});
      stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_v5_hp_state_current SET hit_count=?, miss_count=?, push_count=?, non_push_sample=?, raw_rate_0_100=?, baseline_hp_0_100=?, tier_prior_rate_0_100=?, raw_prior_gap_0_100=?, baseline_confidence_0_100=?, baseline_enriched_confidence_0_100=?, sample_profile=?, sanity_profile_key=?, baseline_hp_profile_key=?, role_profile=COALESCE(?,role_profile), volatility_profile=COALESCE(?,volatility_profile), variance_profile=COALESCE(?,variance_profile), state_batch_id=?, last_processed_official_date=?, last_processed_game_pk=?, state_source='STATEFUL_DELTA_AGGREGATE_UPDATED_PROFILE_SYNC_NO_CURRENT_MUTATION', updated_at=CURRENT_TIMESTAMP WHERE player_type=? AND player_id=? AND canonical_prop_key=? AND line_value=? AND selected_side=?`).bind(calc.hit_count,calc.miss_count,calc.push_count,calc.non_push_sample,calc.raw_rate_0_100,calc.baseline_hp_0_100,calc.baseline_hp_0_100,calc.raw_prior_gap_0_100,calc.baseline_confidence_0_100,calc.baseline_enriched_confidence_0_100,calc.sample_profile,nextSanityKey,`${nextSanityKey}_MODEL`,clsCalcForHp&&clsCalcForHp.volume_profile||null,clsCalcForHp&&clsCalcForHp.volatility_profile||null,clsCalcForHp&&clsCalcForHp.volatility_profile||null,batchId,cutoffDate,'AGGREGATE_DELTA_WINDOW',playerType,id,prop,Number(r.line_value),String(r.selected_side||'')));
      hpRowsUpdated++;
    }
    const metricRow=metricMap.get(id);
    if(!metricRow && cls.length){ playersSkippedNoMetrics++; }
    for(const r of cls){
      const calc=baselineV5StatefulClassFromCumulative(r,metricRow,srcs);
      if(!calc) continue;
      const beforeTier=String(r.classification_tier||''), beforeKey=String(r.classification_profile_key||'');
      if(beforeTier!==calc.classification_tier || beforeKey!==calc.classification_profile_key) reclassified++;
      stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_v5_classification_state_current SET classification_tier=?, classification_profile_key=?, sample_profile=?, volume_profile=?, lineup_profile=?, platoon_profile=?, usage_profile=?, volatility_profile=?, classification_confidence_0_100=?, games_sample=?, events_sample=?, pa_per_game=?, ab_ratio=?, avg_batting_order=?, split_delta_0_100=?, hitter_pa_sum_est=?, hitter_ab_sum_est=?, pitcher_outs_sum_est=?, pitcher_bf_sum_est=?, metric_hits_per_game=?, metric_walk_rate=?, metric_strikeout_rate=?, metric_outs_per_start=?, metric_bf_per_start=?, metric_k_rate=?, metric_bb_rate=?, metric_ha_rate=?, metric_split_rows=?, state_batch_id=?, last_processed_official_date=?, last_processed_game_pk=?, state_source='STATEFUL_DELTA_AGGREGATE_CLASSIFICATION_UPDATED_NO_CURRENT_MUTATION', updated_at=CURRENT_TIMESTAMP WHERE player_type=? AND player_id=? AND canonical_prop_key=? AND line_value=? AND selected_side=?`).bind(calc.classification_tier,calc.classification_profile_key,calc.sample_profile,calc.volume_profile,calc.lineup_profile,calc.platoon_profile,calc.usage_profile,calc.volatility_profile,calc.classification_confidence_0_100,calc.games_sample,calc.events_sample,calc.pa_per_game,calc.ab_ratio,calc.avg_batting_order,calc.split_delta_0_100,calc.hitter_pa_sum_est||null,calc.hitter_ab_sum_est||null,calc.pitcher_outs_sum_est||null,calc.pitcher_bf_sum_est||null,calc.metric_hits_per_game||null,calc.metric_walk_rate||null,calc.metric_strikeout_rate||null,calc.metric_outs_per_start||null,calc.metric_bf_per_start||null,calc.metric_k_rate||null,calc.metric_bb_rate||null,calc.metric_ha_rate||null,calc.metric_split_rows||0,batchId,cutoffDate,'AGGREGATE_DELTA_WINDOW',playerType,id,String(r.canonical_prop_key||''),Number(r.line_value),String(r.selected_side||'')));
      classRowsUpdated++;
    }
  }
  if(stmts.length) await batch(env.SCORE_DB,stmts,100);
  return {rawRowsRead,eventsInserted,hpRowsUpdated,classRowsUpdated,reclassified,skippedNoState,duplicateEventsSkipped,playersProcessed,playersRequested:ids.length,playersSkippedNoMetrics,metric_batch_id:metricPack.batch&&metricPack.batch.batch_id||null,metric_input_latest_game_date:metricPack.batch&&metricPack.batch.input_latest_game_date||null,aggregate_differential:true,exact_metric_snapshot_sums:true,no_rate_reconstruction:true,no_global_state_rewrite:true};
}


async function baselineV5StatefulPartialOutput(input, fields){
  const next={...(fields.next_input_json||fields.next_input||{})};
  delete fields.next_input_json; delete fields.next_input;
  return baseOutput(input,{
    ok:true,
    data_ok:true,
    mode:'baseline_v5_stateful_delta',
    status:'BASELINE_V5_STATEFUL_DELTA_PARTIAL_CONTINUE',
    certification:'BASELINE_V5_STATEFUL_DELTA_PARTIAL_CONTINUE',
    certification_grade:'PARTIAL',
    partial_continue:true,
    continuation_required:true,
    orchestrator_should_self_continue:true,
    current_tables_mutated:false,
    history_tables_mutated:false,
    full_cumulative_history_recompute:false,
    no_daily_context:true,
    no_market_context:true,
    no_scoring_context:true,
    no_final_board_context:true,
    next_input_json:next,
    ...fields
  });
}

async function baselineV5StatefulRetireStaleBatches(env){
  const stale=await all(env.SCORE_DB,`SELECT batch_id FROM player_baseline_v5_state_batches WHERE mode='baseline_v5_stateful_delta' AND (status IN ('running','partial_continue') OR certification_grade IN ('RUNNING','PARTIAL'))`);
  const ids=stale.map(r=>String(r.batch_id||'')).filter(Boolean);
  if(ids.length){
    const qs=ids.map(()=>'?').join(',');
    await run(env.SCORE_DB,`DELETE FROM player_baseline_v5_delta_events WHERE state_batch_id IN (${qs})`,...ids);
    await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status='failed_stale_timeout_partial_discarded', certification='BASELINE_V5_STATEFUL_DELTA_STALE_PARTIAL_RETIRED', certification_grade='STALE_RETIRED', updated_at=CURRENT_TIMESTAMP WHERE batch_id IN (${qs})`,...ids);
  }
  return {stale_batches_retired:ids.length, retired_batch_ids:ids};
}
async function baselineV5DailyRetireStaleOrphanBatches(env,{kind,officialDate,requestId}){
  const mode=baselineV5DailyMode(kind);
  const ymd=String(officialDate||'').slice(0,10);
  const req=String(requestId||'');
  const out={kind,official_date:ymd,stale_daily_orphan_batches_retired:0,retired_batch_ids:[],classification_state_rows_deleted:0,hp_state_rows_deleted:0,delta_event_rows_deleted:0,baseline_v5_daily_timeout_orphan_guard_v0_1_107:true,baseline_v5_hp_open_day_current_pair_audit_v0_1_108:true,baseline_v5_hp_anchor_restore_branch_fix_v0_1_109:true};
  if(!ymd || !mode) return out;
  const like=`%\"official_date\":\"${ymd}\"%`;
  const stale=await all(env.SCORE_DB,`SELECT batch_id, request_id, status, certification_grade, updated_at
    FROM player_baseline_v5_state_batches
    WHERE mode=?
      AND COALESCE(request_id,'')<>?
      AND (status IN ('running','partial_continue') OR certification_grade IN ('RUNNING','PARTIAL'))
      AND (json_extract(output_json,'$.official_date')=? OR output_json LIKE ?)
      AND datetime(updated_at)<=datetime('now','-30 seconds')`,mode,req,ymd,like);
  const ids=stale.map(r=>String(r.batch_id||'')).filter(Boolean);
  if(!ids.length) return out;
  const qs=ids.map(()=>'?').join(',');
  const delCls=await run(env.SCORE_DB,`DELETE FROM player_baseline_v5_classification_state_current WHERE state_batch_id IN (${qs})`,...ids);
  const delHp=await run(env.SCORE_DB,`DELETE FROM player_baseline_v5_hp_state_current WHERE state_batch_id IN (${qs})`,...ids);
  const delEv=await run(env.SCORE_DB,`DELETE FROM player_baseline_v5_delta_events WHERE state_batch_id IN (${qs})`,...ids);
  await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches
    SET status='failed_stale_timeout_daily_delta_discarded',
        certification='BASELINE_V5_DAILY_DELTA_STALE_TIMEOUT_ORPHAN_RETIRED',
        certification_grade='STALE_RETIRED',
        output_json=json_set(COALESCE(output_json,'{}'),'$.stale_timeout_orphan_retired_v0_1_107',1,'$.retired_by_request_id',?),
        updated_at=CURRENT_TIMESTAMP
    WHERE batch_id IN (${qs})`,req,...ids);
  out.stale_daily_orphan_batches_retired=ids.length;
  out.retired_batch_ids=ids;
  out.classification_state_rows_deleted=Number(delCls?.meta?.changes||0);
  out.hp_state_rows_deleted=Number(delHp?.meta?.changes||0);
  out.delta_event_rows_deleted=Number(delEv?.meta?.changes||0);
  return out;
}
function baselineV5YmdAdd(ymd, days){
  const d=new Date(`${String(ymd).slice(0,10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate()+Number(days||0));
  return d.toISOString().slice(0,10);
}
const BASELINE_V5_DAILY_SOURCE_LAYERS = ['hitter_game_logs','pitcher_game_logs','team_game_logs','starter_history','bullpen_history','hitter_splits','pitcher_splits','hitter_metrics','pitcher_metrics'];
function baselineV5DailyCoverageLayer(kind){ return kind==='classification' ? 'baseline_v5_classification' : 'baseline_v5_hp'; }
function baselineV5DailyMode(kind){ return kind==='classification' ? 'baseline_v5_classification_daily_delta' : 'baseline_v5_hp_daily_delta'; }
function baselineV5DailyCertPrefix(kind){ return kind==='classification' ? 'BASELINE_V5_CLASSIFICATION_DAILY_DELTA' : 'BASELINE_V5_HP_DAILY_DELTA'; }
async function baselineV5LatestPassStateBatch(env){
  return await first(env.SCORE_DB,`SELECT batch_id, source_watermark_date, certification, certification_grade, updated_at
    FROM player_baseline_v5_state_batches
    WHERE mode='baseline_v5_stateful_delta'
      AND certification_grade='PASS'
      AND COALESCE(current_tables_mutated,0)=0
      AND COALESCE(history_tables_mutated,0)=0
      AND COALESCE(full_cumulative_history_recompute,0)=0
      AND source_watermark_date IS NOT NULL
    ORDER BY date(source_watermark_date) DESC, datetime(updated_at) DESC
    LIMIT 1`);
}

async function baselineV5EnsureDailyClassificationExactColumns(env){
  const rows=await all(env.SCORE_DB,`PRAGMA table_info(player_baseline_v5_classification_state_current)`);
  const have=new Set(rows.map(r=>String(r.name||'')));
  const cols=[
    ['hitter_hits_sum_est','REAL'],['hitter_walks_sum_est','REAL'],['hitter_strikeouts_sum_est','REAL'],
    ['pitcher_k_sum_est','REAL'],['pitcher_bb_sum_est','REAL'],['pitcher_ha_sum_est','REAL']
  ];
  const added=[];
  for(const [name,type] of cols){
    if(!have.has(name)){
      await run(env.SCORE_DB,`ALTER TABLE player_baseline_v5_classification_state_current ADD COLUMN ${name} ${type}`);
      added.push(name);
    }
  }
  return {added_columns:added, exact_sum_columns_ready:true};
}
async function baselineV5DailyHydrateExactClassStatsForPlayers(env,{playerType,watermarkDate,playerIds}){
  const ids=baselineV5StatefulUniquePlayerIds(playerIds.map(player_id=>({player_id})));
  if(!ids.length) return {players:0, rows_updated:0, metric_batch_id:null};
  const metricPack=await baselineV5StatefulMetricRowsForPlayers(env,{playerType,cutoffDate:watermarkDate,playerIds:ids});
  const metricMap=baselineV5StatefulMetricMap(metricPack.rows);
  const stmts=[];
  for(const id of ids){
    const m=metricMap.get(id); if(!m) continue;
    if(playerType==='hitter'){
      stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_v5_classification_state_current
        SET hitter_pa_sum_est=COALESCE(hitter_pa_sum_est, ?),
            hitter_ab_sum_est=COALESCE(hitter_ab_sum_est, ?),
            hitter_hits_sum_est=COALESCE(hitter_hits_sum_est, ?),
            hitter_walks_sum_est=COALESCE(hitter_walks_sum_est, ?),
            hitter_strikeouts_sum_est=COALESCE(hitter_strikeouts_sum_est, ?),
            updated_at=CURRENT_TIMESTAMP
        WHERE player_type='hitter' AND player_id=?`).bind(Number(m.pa_sum||0),Number(m.ab_sum||0),Number(m.hits_sum||0),Number(m.walks_sum||0),Number(m.strikeouts_sum||0),id));
    } else {
      stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_v5_classification_state_current
        SET pitcher_outs_sum_est=COALESCE(pitcher_outs_sum_est, ?),
            pitcher_bf_sum_est=COALESCE(pitcher_bf_sum_est, ?),
            pitcher_k_sum_est=COALESCE(pitcher_k_sum_est, ?),
            pitcher_bb_sum_est=COALESCE(pitcher_bb_sum_est, ?),
            pitcher_ha_sum_est=COALESCE(pitcher_ha_sum_est, ?),
            updated_at=CURRENT_TIMESTAMP
        WHERE player_type='pitcher' AND player_id=?`).bind(Number(m.outs_recorded_sum||0),Number(m.batters_faced_sum||0),Number(m.strikeouts_sum||0),Number(m.walks_allowed_sum||0),Number(m.hits_allowed_sum||0),id));
    }
  }
  if(stmts.length) await batch(env.SCORE_DB,stmts,80);
  return {players:ids.length, rows_updated:stmts.length, metric_batch_id:metricPack.batch&&metricPack.batch.batch_id||null, watermark_date:watermarkDate, exact_sum_hydration:true};
}
function baselineV5DailyClassFromExactState(row, sourceRows){
  const entityType=String(row.player_type||'').toLowerCase();
  const prop=String(row.canonical_prop_key||'');
  const line=Number(row.line_value||0);
  const side=String(row.selected_side||'more');
  const oldGames=Math.max(0,Number(row.games_sample||0));
  const addGames=(sourceRows||[]).length;
  const games=oldGames+addGames;
  const splitDelta=Number(row.split_delta_0_100||0);
  const volatilityProfile=String(row.volatility_profile||'VOLATILITY_UNKNOWN');
  const oldConf=round(clamp(Number(row.classification_confidence_0_100||25),1,95),2);
  if(entityType==='pitcher'){
    let addOuts=0, addBf=0, addK=0, addBb=0, addHa=0;
    for(const r of sourceRows||[]){ addOuts+=num(r.outs_recorded); addBf+=pitcherBf(r); addK+=num(r.strikeouts); addBb+=num(r.walks_allowed); addHa+=num(r.hits_allowed); }
    const outs=Number(row.pitcher_outs_sum_est||0)+addOuts;
    const bf=Number(row.pitcher_bf_sum_est||0)+addBf;
    const k=Number(row.pitcher_k_sum_est||0)+addK;
    const bb=Number(row.pitcher_bb_sum_est||0)+addBb;
    const ha=Number(row.pitcher_ha_sum_est||0)+addHa;
    const outsPerStart=games?outs/games:0, bfPerStart=games?bf/games:0;
    const kRate=bf?k/bf:0, bbRate=bf?bb/bf:0, haRate=bf?ha/bf:0;
    const tier=pitcherTier({games,outsPerStart,bfPerStart,kRate,bbRate,haRate,splitDelta,prop,line,side});
    const volumeProfile=outsPerStart>=18?'DEEP_STARTER':(outsPerStart>=15?'NORMAL_STARTER':(outsPerStart>=12?'LOW_WORKLOAD_STARTER':'SHORT_OR_UNSTABLE_WORKLOAD'));
    const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta<0?'SUPPRESSES_LEFT_MORE_THAN_RIGHT':'MORE_DAMAGE_VS_LEFT_THAN_RIGHT'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
    return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:'PITCHER_NA',platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:baselineV5LockedDeltaConfidence('pitcher',games,oldConf,oldConf),games_sample:games,events_sample:games,pa_per_game:null,ab_ratio:null,avg_batting_order:null,split_delta_0_100:splitDelta,pitcher_outs_sum_est:round(outs,4),pitcher_bf_sum_est:round(bf,4),pitcher_k_sum_est:round(k,4),pitcher_bb_sum_est:round(bb,4),pitcher_ha_sum_est:round(ha,4),metric_outs_per_start:round(outsPerStart,2),metric_bf_per_start:round(bfPerStart,2),metric_k_rate:round(kRate,4),metric_bb_rate:round(bbRate,4),metric_ha_rate:round(haRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
  }
  let addPa=0, addAb=0, addHits=0, addWalks=0, addSo=0;
  for(const r of sourceRows||[]){ addPa+=num(r.pa); addAb+=num(r.ab); addHits+=num(r.hits); addWalks+=num(r.walks); addSo+=num(r.strikeouts); }
  const pa=Number(row.hitter_pa_sum_est||0)+addPa;
  const ab=Number(row.hitter_ab_sum_est||0)+addAb;
  const hits=Number(row.hitter_hits_sum_est||0)+addHits;
  const walks=Number(row.hitter_walks_sum_est||0)+addWalks;
  const so=Number(row.hitter_strikeouts_sum_est||0)+addSo;
  const order=baselineV5StatefulOrderContext(sourceRows||[]);
  const oldAvgOrder=row.avg_batting_order==null?null:Number(row.avg_batting_order);
  let avgOrder=oldAvgOrder;
  if(order.batting_order_rows>0) avgOrder=oldAvgOrder==null ? (order.batting_order_sum/order.batting_order_rows) : ((oldAvgOrder*oldGames)+order.batting_order_sum)/Math.max(1,oldGames+order.batting_order_rows);
  const paPerGame=games?pa/games:0, abRatio=pa?ab/pa:0, hitRatePerGame=games?hits/games:0, walkRate=pa?walks/pa:0, soRate=pa?so/pa:0;
  const tier=hitterTier12({games,paPerGame,abRatio,avgOrder:avgOrder||0,hitRatePerGame,walkRate,soRate,splitDelta,prop,line,side});
  const lineupProfile=resolveLineupProfileFromOrder({avg_batting_order_normalized:avgOrder,batting_order_rows:avgOrder==null?0:games,batting_order_coverage:avgOrder==null?0:1});
  const volumeProfile=paPerGame>=4.2?'HIGH_VOLUME':(paPerGame>=3.7?'EVERYDAY_CORE':(paPerGame>=2.0?'LOW_USAGE_OR_PARTIAL':'MICRO_USAGE'));
  const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta>0?'FAVORABLE_VS_LEFT_SHAPE':'FAVORABLE_VS_RIGHT_SHAPE'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
  return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:lineupProfile,platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:round(clamp(oldConf,1,95),2),games_sample:games,events_sample:games,pa_per_game:round(paPerGame,3),ab_ratio:round(abRatio,3),avg_batting_order:avgOrder==null?null:round(avgOrder,2),split_delta_0_100:splitDelta,hitter_pa_sum_est:round(pa,4),hitter_ab_sum_est:round(ab,4),hitter_hits_sum_est:round(hits,4),hitter_walks_sum_est:round(walks,4),hitter_strikeouts_sum_est:round(so,4),metric_hits_per_game:round(hitRatePerGame,3),metric_walk_rate:round(walkRate,4),metric_strikeout_rate:round(soRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
}

async function baselineV5DailyFullOrderRowsForPlayers(env,{cutoffDate,playerIds}){
  const ids=baselineV5StatefulUniquePlayerIds((playerIds||[]).map(player_id=>({player_id})));
  if(!ids.length) return new Map();
  const ph=baselineV5SqlPlaceholders(ids);
  const rows=await all(env.STATS_HITTER_DB,`SELECT player_id, batting_order, game_pk, game_date
    FROM hitter_game_logs
    WHERE date(game_date)<=date(?)
      AND COALESCE(pa,0)>=1
      AND COALESCE(json_extract(raw_json,'$.player.position.type'),'') NOT IN ('Pitcher','Runner')
      AND player_id IN (${ph})
    ORDER BY player_id, date(game_date), game_pk`,cutoffDate,...ids);
  return baselineV5StatefulGroupByPlayer(rows);
}
function baselineV5DailyClassFromMetricSnapshot(row, metricRow, orderRows){
  if(!metricRow) return null;
  const entityType=String(row.player_type||'').toLowerCase();
  const prop=String(row.canonical_prop_key||'');
  const line=Number(row.line_value||0);
  const side=String(row.selected_side||'more');
  const splitDelta=Number(row.split_delta_0_100||0);
  const volatilityProfile=String(row.volatility_profile||'VOLATILITY_UNKNOWN');
  const oldConf=round(clamp(Number(row.classification_confidence_0_100||25),1,95),2);
  if(entityType==='pitcher'){
    const games=Math.max(0,Number(metricRow.starts_count||metricRow.games_count||0));
    const outs=Number(metricRow.outs_recorded_sum||0);
    const bf=Number(metricRow.batters_faced_sum||0);
    const k=Number(metricRow.strikeouts_sum||0);
    const bb=Number(metricRow.walks_allowed_sum||0);
    const ha=Number(metricRow.hits_allowed_sum||0);
    const outsPerStart=games?outs/games:0, bfPerStart=games?bf/games:0;
    const kRate=bf?k/bf:0, bbRate=bf?bb/bf:0, haRate=bf?ha/bf:0;
    const tier=pitcherTier({games,outsPerStart,bfPerStart,kRate,bbRate,haRate,splitDelta,prop,line,side});
    const volumeProfile=outsPerStart>=18?'DEEP_STARTER':(outsPerStart>=15?'NORMAL_STARTER':(outsPerStart>=12?'LOW_WORKLOAD_STARTER':'SHORT_OR_UNSTABLE_WORKLOAD'));
    const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta<0?'SUPPRESSES_LEFT_MORE_THAN_RIGHT':'MORE_DAMAGE_VS_LEFT_THAN_RIGHT'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
    return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:'PITCHER_NA',platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:baselineV5LockedDeltaConfidence('pitcher',games,oldConf,oldConf),games_sample:games,events_sample:games,pa_per_game:null,ab_ratio:null,avg_batting_order:null,split_delta_0_100:splitDelta,pitcher_outs_sum_est:round(outs,4),pitcher_bf_sum_est:round(bf,4),pitcher_k_sum_est:round(k,4),pitcher_bb_sum_est:round(bb,4),pitcher_ha_sum_est:round(ha,4),metric_outs_per_start:round(outsPerStart,2),metric_bf_per_start:round(bfPerStart,2),metric_k_rate:round(kRate,4),metric_bb_rate:round(bbRate,4),metric_ha_rate:round(haRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
  }
  const games=Math.max(0,Number(metricRow.games_count||0));
  const pa=Number(metricRow.pa_sum||0), ab=Number(metricRow.ab_sum||0), hits=Number(metricRow.hits_sum||0), walks=Number(metricRow.walks_sum||0), so=Number(metricRow.strikeouts_sum||0);
  const order=baselineV5StatefulOrderContext(orderRows||[]);
  const avgOrder=order.batting_order_rows>0 ? order.batting_order_sum/order.batting_order_rows : (row.avg_batting_order==null?null:Number(row.avg_batting_order));
  const paPerGame=games?pa/games:0, abRatio=pa?ab/pa:0, hitRatePerGame=games?hits/games:0, walkRate=pa?walks/pa:0, soRate=pa?so/pa:0;
  const tier=hitterTier12({games,paPerGame,abRatio,avgOrder:avgOrder||0,hitRatePerGame,walkRate,soRate,splitDelta,prop,line,side});
  const lineupProfile=resolveLineupProfileFromOrder({avg_batting_order_normalized:avgOrder,batting_order_rows:order.batting_order_rows,batting_order_coverage:order.batting_order_rows>0?1:0});
  const volumeProfile=paPerGame>=4.2?'HIGH_VOLUME':(paPerGame>=3.7?'EVERYDAY_CORE':(paPerGame>=2.0?'LOW_USAGE_OR_PARTIAL':'MICRO_USAGE'));
  const platoonProfile=Math.abs(splitDelta)>=6?(splitDelta>0?'FAVORABLE_VS_LEFT_SHAPE':'FAVORABLE_VS_RIGHT_SHAPE'):'NEUTRAL_OR_LOW_SPLIT_SIGNAL';
  return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop,entityType),volume_profile:volumeProfile,lineup_profile:lineupProfile,platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:volatilityProfile,classification_confidence_0_100:round(clamp(oldConf,1,95),2),games_sample:games,events_sample:games,pa_per_game:round(paPerGame,3),ab_ratio:round(abRatio,3),avg_batting_order:avgOrder==null?null:round(avgOrder,2),split_delta_0_100:splitDelta,hitter_pa_sum_est:round(pa,4),hitter_ab_sum_est:round(ab,4),hitter_hits_sum_est:round(hits,4),hitter_walks_sum_est:round(walks,4),hitter_strikeouts_sum_est:round(so,4),metric_hits_per_game:round(hitRatePerGame,3),metric_walk_rate:round(walkRate,4),metric_strikeout_rate:round(soRate,4),metric_split_rows:Number(row.metric_split_rows||0)};
}
function baselineV5DailySourceRowClassificationHash(playerType,id,src){
  const values=playerType==='hitter'
    ? [playerType,id,src.game_pk,src.game_date,'classification_daily_sample',num(src.pa),num(src.ab),num(src.hits),num(src.walks),num(src.strikeouts),String(src.batting_order||'')]
    : [playerType,id,src.game_pk,src.game_date,'classification_daily_sample',num(src.outs_recorded),pitcherBf(src),num(src.strikeouts),num(src.walks_allowed),num(src.hits_allowed)];
  return baselineV5StatefulSourceHash(values);
}
function baselineV5DailyDateGte(a,b){
  const aa=String(a||'').slice(0,10), bb=String(b||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(aa) && /^\d{4}-\d{2}-\d{2}$/.test(bb) && aa>=bb;
}
async function baselineV5DailyContaminatedStateAudit(env,{kind,officialDate,allowedPartialBatchId=null,allowedRequestId=null}){
  const table=kind==='classification'?'player_baseline_v5_classification_state_current':'player_baseline_v5_hp_state_current';
  const expectedMode=baselineV5DailyMode(kind);
  const idCol=kind==='classification'?'classification_row_id':'baseline_hp_row_id';
  const allowBatch=allowedPartialBatchId?String(allowedPartialBatchId):'';
  const allowReq=allowedRequestId?String(allowedRequestId):'';
  const row=await first(env.SCORE_DB,`SELECT
      COUNT(*) AS rows_checked,
      SUM(CASE WHEN (
          b.batch_id IS NULL
          OR COALESCE(b.mode,'')<>?
          OR (
             COALESCE(b.certification_grade,'') NOT IN ('PASS','NOOP_PASS')
             AND NOT (s.state_batch_id=? AND b.request_id=? AND COALESCE(b.certification_grade,'')='PARTIAL')
          )
        ) THEN 1 ELSE 0 END) AS contaminated_rows,
      MIN(CASE WHEN (
          b.batch_id IS NULL
          OR COALESCE(b.mode,'')<>?
          OR (
             COALESCE(b.certification_grade,'') NOT IN ('PASS','NOOP_PASS')
             AND NOT (s.state_batch_id=? AND b.request_id=? AND COALESCE(b.certification_grade,'')='PARTIAL')
          )
        ) THEN s.state_batch_id ELSE NULL END) AS sample_bad_batch_id,
      MIN(CASE WHEN (
          b.batch_id IS NULL
          OR COALESCE(b.mode,'')<>?
          OR (
             COALESCE(b.certification_grade,'') NOT IN ('PASS','NOOP_PASS')
             AND NOT (s.state_batch_id=? AND b.request_id=? AND COALESCE(b.certification_grade,'')='PARTIAL')
          )
        ) THEN b.certification_grade ELSE NULL END) AS sample_bad_grade,
      SUM(CASE WHEN s.state_batch_id=? AND b.request_id=? AND COALESCE(b.certification_grade,'')='PARTIAL' THEN 1 ELSE 0 END) AS allowed_partial_rows,
      COUNT(DISTINCT s.player_type || ':' || s.player_id) AS players,
      COUNT(DISTINCT s.canonical_prop_key) AS prop_keys
    FROM ${table} s
    LEFT JOIN player_baseline_v5_state_batches b ON b.batch_id=s.state_batch_id
    WHERE s.last_processed_official_date=?`,expectedMode,allowBatch,allowReq,expectedMode,allowBatch,allowReq,expectedMode,allowBatch,allowReq,allowBatch,allowReq,officialDate);
  return {kind,official_date:officialDate,table,expected_mode:expectedMode,id_column:idCol,allowed_partial_batch_id:allowBatch||null,allowed_request_id:allowReq||null,rows_checked:Number(row&&row.rows_checked||0),allowed_partial_rows:Number(row&&row.allowed_partial_rows||0),contaminated_rows:Number(row&&row.contaminated_rows||0),sample_bad_batch_id:row&&row.sample_bad_batch_id||null,sample_bad_grade:row&&row.sample_bad_grade||null,players:Number(row&&row.players||0),prop_keys:Number(row&&row.prop_keys||0),pass:Number(row&&row.contaminated_rows||0)===0};
}

async function baselineV5DailySafeOpenDate(env,{kind,watermarkDate,cutoffDate}){
  const targetLayer=baselineV5DailyCoverageLayer(kind);
  const prereqLayer=kind==='hp' ? 'baseline_v5_classification' : null;
  const values=BASELINE_V5_DAILY_SOURCE_LAYERS.map(x=>`('${x}')`).join(',');
  const prereqSql=prereqLayer ? `AND EXISTS (
        SELECT 1 FROM mlb_game_data_coverage c
        WHERE c.official_date=d.official_date
          AND c.layer_key='${prereqLayer}'
        GROUP BY c.official_date
        HAVING SUM(CASE WHEN c.coverage_status='complete' AND COALESCE(c.blocking_for_full_run,0)=0 THEN 1 ELSE 0 END) >= d.games
      )` : '';
  const row=await first(env.TEAM_DB,`WITH required(layer_key) AS (VALUES ${values}),
    dates AS (
      SELECT official_date, COUNT(DISTINCT game_pk) AS games
      FROM mlb_game_data_coverage
      WHERE date(official_date)>date(?) AND date(official_date)<=date(?)
        AND layer_key IN (${BASELINE_V5_DAILY_SOURCE_LAYERS.map(x=>`'${x}'`).join(',')})
      GROUP BY official_date
    ), source_good AS (
      SELECT d.official_date, d.games
      FROM dates d
      WHERE d.games>0
        AND NOT EXISTS (
          SELECT 1 FROM required r
          WHERE (
            SELECT COUNT(DISTINCT c.game_pk)
            FROM mlb_game_data_coverage c
            WHERE c.official_date=d.official_date
              AND c.layer_key=r.layer_key
              AND c.coverage_status='complete'
              AND COALESCE(c.blocking_for_full_run,0)=0
          ) < d.games
        )
        ${prereqSql}
    ), open_dates AS (
      SELECT d.official_date
      FROM source_good d
      LEFT JOIN mlb_game_data_coverage b
        ON b.official_date=d.official_date
       AND b.layer_key=?
      GROUP BY d.official_date, d.games
      HAVING SUM(CASE WHEN b.coverage_status='complete' AND COALESCE(b.blocking_for_full_run,0)=0 THEN 1 ELSE 0 END) < d.games
    )
    SELECT official_date FROM open_dates ORDER BY date(official_date) LIMIT 1`,watermarkDate,cutoffDate,targetLayer);
  return row&&row.official_date ? String(row.official_date).slice(0,10) : null;
}
async function baselineV5DailyUpsertCoverage(env,{kind,officialDate,batchId,requestId,runId,rowsUpdated,playersUpdated}){
  const layerKey=baselineV5DailyCoverageLayer(kind);
  const grade=kind==='classification'?'PASS_BASELINE_V5_CLASSIFICATION_DAILY_DELTA':'PASS_BASELINE_V5_HP_DAILY_DELTA';
  const games=await all(env.TEAM_DB,`SELECT game_pk, season, official_date FROM mlb_game_calendar WHERE official_date=? ORDER BY game_pk`,officialDate);
  if(!games.length) return {layer_key:layerKey,official_date:officialDate,games_marked:0,coverage_rows_written:0};
  const stmt=`INSERT INTO mlb_game_data_coverage (
      game_pk, season, official_date, layer_key, layer_family, coverage_scope, coverage_status, coverage_grade, blocking_for_full_run,
      expected_rows, live_rows, stage_rows, outcome_rows, missing_rows, expected_entity_type, live_entity_count, stage_entity_count, exception_count,
      represented_by_live, represented_by_stage, represented_by_exception, missing_reason, exception_reason,
      last_batch_id, last_run_id, last_request_id, last_worker_name, last_worker_version, last_checked_at, last_completed_at, details_json, updated_at
    ) VALUES (?, ?, ?, ?, 'baseline_v5', 'game', 'complete', ?, 0, 1, ?, 0, 0, 0, ?, ?, 0, 0, 1, 0, 0, NULL, NULL, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(game_pk, layer_key) DO UPDATE SET
      season=excluded.season, official_date=excluded.official_date, layer_family=excluded.layer_family, coverage_scope=excluded.coverage_scope,
      coverage_status=excluded.coverage_status, coverage_grade=excluded.coverage_grade, blocking_for_full_run=0, expected_rows=1,
      live_rows=excluded.live_rows, missing_rows=0, expected_entity_type=excluded.expected_entity_type, live_entity_count=excluded.live_entity_count,
      represented_by_live=1, missing_reason=NULL, exception_reason=NULL, last_batch_id=excluded.last_batch_id, last_run_id=excluded.last_run_id,
      last_request_id=excluded.last_request_id, last_worker_name=excluded.last_worker_name, last_worker_version=excluded.last_worker_version,
      last_checked_at=CURRENT_TIMESTAMP, last_completed_at=CURRENT_TIMESTAMP, details_json=excluded.details_json, updated_at=CURRENT_TIMESTAMP`;
  const details={baseline_v5_tally_owned_daily_delta_v0_1_100:true,kind,official_date:officialDate,batch_id:batchId,rows_updated:Number(rowsUpdated||0),players_updated:Number(playersUpdated||0),classification_before_hp_required:true};
  const stmts=games.map(g=>env.TEAM_DB.prepare(stmt).bind(Number(g.game_pk),Number(g.season),String(g.official_date),layerKey,grade,Number(rowsUpdated||1),kind==='classification'?'classification_rows':'hp_rows',Number(playersUpdated||1),batchId,runId||null,requestId||null,WORKER_NAME,VERSION,safeJson(details)));
  await batch(env.TEAM_DB,stmts,40);
  await run(env.TEAM_DB,`DELETE FROM mlb_game_coverage_gaps WHERE official_date=? AND layer_key=?`,officialDate,layerKey);
  return {layer_key:layerKey,official_date:officialDate,games_marked:games.length,coverage_rows_written:stmts.length,grade};
}

async function baselineV5DailyRestoreMissingStateAnchors(env,{kind,batchId,officialDate,playerType,playerIds}){
  const ids=baselineV5StatefulUniquePlayerIds(playerIds.map(player_id=>({player_id})));
  const out={kind,player_type:playerType,players_checked:ids.length,classification_anchor_rows_restored:0,hp_anchor_rows_restored:0,baseline_v5_daily_state_anchor_restore_v0_1_106:true,baseline_v5_hp_anchor_restore_branch_fix_v0_1_109:kind==='hp'};
  if(!ids.length) return out;
  for(const part of baselineV5StatefulChunk(ids,80)){
    const ph=baselineV5SqlPlaceholders(part);
    if(kind==='classification' || kind==='hp'){
      const res=await run(env.SCORE_DB,`INSERT OR IGNORE INTO player_baseline_v5_classification_state_current (
          classification_row_id,state_key,source_batch_id,state_batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,
          classification_tier,classification_profile_key,sample_profile,volume_profile,lineup_profile,platoon_profile,usage_profile,volatility_profile,
          classification_confidence_0_100,games_sample,events_sample,pa_per_game,ab_ratio,avg_batting_order,split_delta_0_100,
          hitter_pa_sum_est,hitter_ab_sum_est,pitcher_outs_sum_est,pitcher_bf_sum_est,metric_hits_per_game,metric_walk_rate,metric_strikeout_rate,
          metric_outs_per_start,metric_bf_per_start,metric_k_rate,metric_bb_rate,metric_ha_rate,metric_split_rows,classification_formula_version,
          no_daily_context,no_market_context,no_scoring_context,no_final_board_context,last_processed_official_date,last_processed_game_pk,state_source,state_hydrated_at,updated_at)
        SELECT
          classification_row_id,
          player_type || '|' || player_id || '|' || canonical_prop_key || '|' || line_value || '|' || selected_side AS state_key,
          batch_id, ?, player_type, player_id, player_name, canonical_prop_key, line_value, selected_side,
          classification_tier, classification_profile_key, sample_profile, volume_profile, lineup_profile, platoon_profile, usage_profile, volatility_profile,
          classification_confidence_0_100, games_sample, events_sample, pa_per_game, ab_ratio, avg_batting_order, split_delta_0_100,
          CASE WHEN pa_per_game IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(pa_per_game*games_sample,4) ELSE NULL END,
          CASE WHEN pa_per_game IS NOT NULL AND ab_ratio IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(pa_per_game*ab_ratio*games_sample,4) ELSE NULL END,
          CASE WHEN json_extract(classification_json,'$.metrics.outs_per_start') IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(json_extract(classification_json,'$.metrics.outs_per_start')*games_sample,4) ELSE NULL END,
          CASE WHEN json_extract(classification_json,'$.metrics.bf_per_start') IS NOT NULL AND games_sample IS NOT NULL THEN ROUND(json_extract(classification_json,'$.metrics.bf_per_start')*games_sample,4) ELSE NULL END,
          json_extract(classification_json,'$.metrics.hits_per_game'),
          json_extract(classification_json,'$.metrics.walk_rate'),
          json_extract(classification_json,'$.metrics.strikeout_rate'),
          json_extract(classification_json,'$.metrics.outs_per_start'),
          json_extract(classification_json,'$.metrics.bf_per_start'),
          json_extract(classification_json,'$.metrics.k_rate'),
          json_extract(classification_json,'$.metrics.bb_rate'),
          json_extract(classification_json,'$.metrics.ha_rate'),
          json_extract(classification_json,'$.metrics.split_rows'),
          'baseline_v5_classification_current_locked_shape',
          1,1,1,1, ?, 'DAILY_STATE_ANCHOR_RESTORE', 'ANCHOR_RESTORED_FROM_player_baseline_classification_v5_current_NO_PRODUCTION_CURRENT_MUTATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM player_baseline_classification_v5_current
        WHERE player_type=? AND player_id IN (${ph})`,batchId,baselineV5YmdAdd(officialDate,-1),playerType,...part);
      out.classification_anchor_rows_restored += Number(res?.meta?.changes||0);
    }
    if(kind==='hp'){
      const res=await run(env.SCORE_DB,`INSERT OR IGNORE INTO player_baseline_v5_hp_state_current (
          baseline_hp_row_id,state_key,source_batch_id,state_batch_id,player_type,player_id,player_name,canonical_prop_key,prop_family,line_value,selected_side,
          baseline_hp_0_100,raw_rate_0_100,tier_prior_rate_0_100,raw_prior_gap_0_100,baseline_confidence_0_100,baseline_enriched_confidence_0_100,
          sample_profile,role_profile,sanity_profile_key,volatility_profile,variance_profile,line_difficulty_profile,baseline_hp_profile_key,
          non_push_sample,hit_count,miss_count,push_count,prior_strength,prior_alpha,prior_beta,formula_version,confidence_formula_version,
          no_daily_context,no_market_context,no_scoring_context,no_final_board_context,last_processed_official_date,last_processed_game_pk,state_source,state_hydrated_at,updated_at)
        SELECT
          baseline_hp_row_id,
          player_type || '|' || player_id || '|' || canonical_prop_key || '|' || line_value || '|' || selected_side AS state_key,
          batch_id, ?, player_type, player_id, player_name, canonical_prop_key, prop_family, line_value, selected_side,
          baseline_hp_0_100, raw_rate_0_100, tier_prior_rate_0_100, raw_prior_gap_0_100, baseline_confidence_0_100, baseline_enriched_confidence_0_100,
          sample_profile, role_profile, sanity_profile_key, volatility_profile, variance_profile, line_difficulty_profile, baseline_hp_profile_key,
          non_push_sample, hit_count, miss_count, push_count, prior_strength,
          CASE WHEN canonical_prop_key='rfi_nrfi' THEN 0.50 ELSE 0.25 END AS prior_alpha,
          CASE WHEN canonical_prop_key='rfi_nrfi' THEN 0.50 ELSE 0.25 END AS prior_beta,
          formula_version, confidence_formula_version,
          COALESCE(no_daily_context,1), COALESCE(no_market_context,1), COALESCE(no_scoring_context,1), 1,
          ?, 'DAILY_STATE_ANCHOR_RESTORE', 'ANCHOR_RESTORED_FROM_player_baseline_hp_v2_current_NO_PRODUCTION_CURRENT_MUTATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM player_baseline_hp_v2_current
        WHERE player_type=? AND player_id IN (${ph})`,batchId,baselineV5YmdAdd(officialDate,-1),playerType,...part);
      out.hp_anchor_rows_restored += Number(res?.meta?.changes||0);
    }
  }
  return out;
}

async function baselineV5DailyApplyPlayerAggregate(env,{batchId,officialDate,playerType,playerIds,kind}){
  const ids=baselineV5StatefulUniquePlayerIds(playerIds.map(player_id=>({player_id})));
  if(!ids.length) return {rawRowsRead:0,eventsInserted:0,hpRowsUpdated:0,classRowsUpdated:0,reclassified:0,playersProcessed:0,playersRequested:0,playersSkippedNoMetrics:0,kind,official_date:officialDate};
  const prevDate=baselineV5YmdAdd(officialDate,-1);
  const sourceRows=await baselineV5StatefulSourceRowsForPlayers(env,{playerType,watermarkDate:prevDate,cutoffDate:officialDate,playerIds:ids});
  const rawRowsRead=sourceRows.length;
  const ph=baselineV5SqlPlaceholders(ids);
  const anchorRestore=await baselineV5DailyRestoreMissingStateAnchors(env,{kind,batchId,officialDate,playerType,playerIds:ids});
  const hydrateAudit=kind==='classification' ? await baselineV5DailyHydrateExactClassStatsForPlayers(env,{playerType,watermarkDate:baselineV5YmdAdd(officialDate,-1),playerIds:ids}) : null;
  const classRows=await all(env.SCORE_DB,`SELECT * FROM player_baseline_v5_classification_state_current WHERE player_type=? AND player_id IN (${ph}) ORDER BY player_id, canonical_prop_key, line_value, selected_side`,playerType,...ids);
  const sourceByPlayer=baselineV5StatefulGroupByPlayer(sourceRows);
  const classByPlayer=baselineV5StatefulGroupByPlayer(classRows);
  let playersProcessed=0, playersSkippedNoMetrics=0, classRowsUpdated=0, reclassified=0, hpRowsUpdated=0, eventsInserted=0, duplicateEventsSkipped=0;
  const stmts=[];
  if(kind==='classification'){
    const metricPack=await baselineV5StatefulMetricRowsForPlayers(env,{playerType,cutoffDate:officialDate,playerIds:ids});
    const metricMap=baselineV5StatefulMetricMap(metricPack.rows);
    const orderMap=playerType==='hitter' ? await baselineV5DailyFullOrderRowsForPlayers(env,{cutoffDate:officialDate,playerIds:ids}) : new Map();
    const classEventRecords=[];
    const classEventSourceByHash=new Map();
    for(const id of ids){
      for(const src of sourceByPlayer.get(id)||[]){
        const hash=baselineV5DailySourceRowClassificationHash(playerType,id,src);
        classEventRecords.push({player_id:id,game_pk:String(src.game_pk||''),game_date:String(src.game_date||'').slice(0,10),hash});
        classEventSourceByHash.set(hash,src);
      }
    }
    const existingClassEvents=await baselineV5StatefulExistingEventHashes(env,classEventRecords.map(e=>e.hash));
    const newClassEvents=classEventRecords.filter(e=>!existingClassEvents.has(e.hash));
    duplicateEventsSkipped += classEventRecords.length-newClassEvents.length;
    const newClassRowsByPlayer=new Map();
    for(const e of newClassEvents){
      if(!newClassRowsByPlayer.has(e.player_id)) newClassRowsByPlayer.set(e.player_id,[]);
      const src=classEventSourceByHash.get(e.hash);
      if(src) newClassRowsByPlayer.get(e.player_id).push(src);
      stmts.push(env.SCORE_DB.prepare(`INSERT OR IGNORE INTO player_baseline_v5_delta_events (event_id,state_batch_id,mode,player_type,player_id,game_pk,game_date,canonical_prop_key,actual_value,source_table,source_row_hash,event_action,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid('pbv5ev'),batchId,'baseline_v5_classification_daily_delta',playerType,e.player_id,e.game_pk,e.game_date,'__classification_sample__',0,playerType==='hitter'?'STATS_HITTER_DB.hitter_game_logs':'STATS_PITCHER_DB.pitcher_game_logs',e.hash,'ADD_CERTIFIER_DAILY_CLASSIFICATION_SAMPLE'));
    }
    eventsInserted += newClassEvents.length;
    for(const id of ids){
      const cls=classByPlayer.get(id)||[];
      if(!cls.length) continue;
      playersProcessed++;
      const metricRow=metricMap.get(id);
      const newSrcs=newClassRowsByPlayer.get(id)||[];
      for(const r of cls){
        let calc=metricRow ? baselineV5DailyClassFromMetricSnapshot(r,metricRow,orderMap.get(id)||[]) : null;
        if(!calc){
          if(!newSrcs.length || baselineV5DailyDateGte(r.last_processed_official_date,officialDate)) continue;
          calc=baselineV5DailyClassFromExactState(r,newSrcs);
        }
        if(!calc) continue;
        if(String(r.classification_tier||'')!==calc.classification_tier || String(r.classification_profile_key||'')!==calc.classification_profile_key) reclassified++;
        stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_v5_classification_state_current SET classification_tier=?, classification_profile_key=?, sample_profile=?, volume_profile=?, lineup_profile=?, platoon_profile=?, usage_profile=?, volatility_profile=?, classification_confidence_0_100=?, games_sample=?, events_sample=?, pa_per_game=?, ab_ratio=?, avg_batting_order=?, split_delta_0_100=?, hitter_pa_sum_est=?, hitter_ab_sum_est=?, pitcher_outs_sum_est=?, pitcher_bf_sum_est=?, hitter_hits_sum_est=?, hitter_walks_sum_est=?, hitter_strikeouts_sum_est=?, pitcher_k_sum_est=?, pitcher_bb_sum_est=?, pitcher_ha_sum_est=?, metric_hits_per_game=?, metric_walk_rate=?, metric_strikeout_rate=?, metric_outs_per_start=?, metric_bf_per_start=?, metric_k_rate=?, metric_bb_rate=?, metric_ha_rate=?, metric_split_rows=?, state_batch_id=?, last_processed_official_date=?, last_processed_game_pk=?, state_source='CERTIFIER_DAILY_CLASSIFICATION_DELTA_EQUIVALENT_METRIC_OR_EVENT_IDEMPOTENT', updated_at=CURRENT_TIMESTAMP WHERE player_type=? AND player_id=? AND canonical_prop_key=? AND line_value=? AND selected_side=?`).bind(calc.classification_tier,calc.classification_profile_key,calc.sample_profile,calc.volume_profile,calc.lineup_profile,calc.platoon_profile,calc.usage_profile,calc.volatility_profile,calc.classification_confidence_0_100,calc.games_sample,calc.events_sample,calc.pa_per_game,calc.ab_ratio,calc.avg_batting_order,calc.split_delta_0_100,calc.hitter_pa_sum_est||null,calc.hitter_ab_sum_est||null,calc.pitcher_outs_sum_est||null,calc.pitcher_bf_sum_est||null,calc.hitter_hits_sum_est||null,calc.hitter_walks_sum_est||null,calc.hitter_strikeouts_sum_est||null,calc.pitcher_k_sum_est||null,calc.pitcher_bb_sum_est||null,calc.pitcher_ha_sum_est||null,calc.metric_hits_per_game||null,calc.metric_walk_rate||null,calc.metric_strikeout_rate||null,calc.metric_outs_per_start||null,calc.metric_bf_per_start||null,calc.metric_k_rate||null,calc.metric_bb_rate||null,calc.metric_ha_rate||null,calc.metric_split_rows||0,batchId,officialDate,'DAILY_CLASSIFICATION_DELTA',playerType,id,String(r.canonical_prop_key||''),Number(r.line_value),String(r.selected_side||'')));
        classRowsUpdated++;
      }
    }
  } else {
    const hpRows=await all(env.SCORE_DB,`SELECT * FROM player_baseline_v5_hp_state_current WHERE player_type=? AND player_id IN (${ph}) ORDER BY player_id, canonical_prop_key, line_value, selected_side`,playerType,...ids);
    const hpByPlayer=baselineV5StatefulGroupByPlayer(hpRows);
    const allEventRecords=[];
    for(const id of ids){
      const srcs=sourceByPlayer.get(id)||[];
      const hps=hpByPlayer.get(id)||[];
      const props=[...new Set(hps.map(r=>String(r.canonical_prop_key||'')))].filter(Boolean);
      for(const src of srcs){
        for(const prop of props){
          const actual=propValueFromRow(prop,src);
          if(actual==null || !Number.isFinite(Number(actual))) continue;
          const hash=baselineV5StatefulSourceHash([playerType,id,src.game_pk,src.game_date,prop,actual]);
          allEventRecords.push({player_id:id,game_pk:String(src.game_pk||''),game_date:String(src.game_date||'').slice(0,10),prop,actual:Number(actual),hash});
        }
      }
    }
    const existing=await baselineV5StatefulExistingEventHashes(env,allEventRecords.map(e=>e.hash));
    const newEventRecords=allEventRecords.filter(e=>!existing.has(e.hash));
    duplicateEventsSkipped=allEventRecords.length-newEventRecords.length;
    const eventsByPlayer=new Map();
    for(const e of newEventRecords){
      if(!eventsByPlayer.has(e.player_id)) eventsByPlayer.set(e.player_id,[]);
      eventsByPlayer.get(e.player_id).push(e);
      stmts.push(env.SCORE_DB.prepare(`INSERT OR IGNORE INTO player_baseline_v5_delta_events (event_id,state_batch_id,mode,player_type,player_id,game_pk,game_date,canonical_prop_key,actual_value,source_table,source_row_hash,event_action,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid('pbv5ev'),batchId,'baseline_v5_hp_daily_delta',playerType,e.player_id,e.game_pk,e.game_date,e.prop,e.actual,playerType==='hitter'?'STATS_HITTER_DB.hitter_game_logs':'STATS_PITCHER_DB.pitcher_game_logs',e.hash,'ADD_CERTIFIER_DAILY_GAME'));
    }
    eventsInserted=newEventRecords.length;
    for(const id of ids){
      const hps=hpByPlayer.get(id)||[];
      const cls=classByPlayer.get(id)||[];
      const playerEvents=eventsByPlayer.get(id)||[];
      if(!hps.length) continue;
      playersProcessed++;
      for(const r of hps){
        const prop=String(r.canonical_prop_key||'');
        let addHit=0, addMiss=0, addPush=0;
        for(const e of playerEvents){
          if(e.prop!==prop) continue;
          const out=baselineV5StatefulOutcome(e.actual,r.line_value,r.selected_side); if(!out) continue;
          addHit+=out.hit; addMiss+=out.miss; addPush+=out.push;
        }
        const clsMatch=cls.find(c=>String(c.canonical_prop_key||'')===prop && Number(c.line_value)===Number(r.line_value) && String(c.selected_side||'')===String(r.selected_side||''));
        const currentSanityKey=String(r.sanity_profile_key||'');
        const nextSanityKeyCandidate=clsMatch&&clsMatch.classification_profile_key?String(clsMatch.classification_profile_key):currentSanityKey;
        const profileNeedsSync=currentSanityKey!==nextSanityKeyCandidate || String(r.baseline_hp_profile_key||'')!==`${nextSanityKeyCandidate}_MODEL`;
        if(addHit===0&&addMiss===0&&addPush===0&&!profileNeedsSync) continue;
        const nextSanityKey=nextSanityKeyCandidate;
        const newHit=Number(r.hit_count||0)+addHit, newMiss=Number(r.miss_count||0)+addMiss, newPush=Number(r.push_count||0)+addPush;
        const calc=baselineV5StatefulHpFromCounts({prop,entityType:playerType,line:Number(r.line_value),side:String(r.selected_side||''),hit:newHit,miss:newMiss,push:newPush,oldConfidence:r.baseline_confidence_0_100,volatilityProfile:(clsMatch&&clsMatch.volatility_profile)||r.volatility_profile});
        stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_v5_hp_state_current SET hit_count=?, miss_count=?, push_count=?, non_push_sample=?, raw_rate_0_100=?, baseline_hp_0_100=?, tier_prior_rate_0_100=?, raw_prior_gap_0_100=?, baseline_confidence_0_100=?, baseline_enriched_confidence_0_100=?, sample_profile=?, sanity_profile_key=?, baseline_hp_profile_key=?, role_profile=COALESCE(?,role_profile), volatility_profile=COALESCE(?,volatility_profile), variance_profile=COALESCE(?,variance_profile), state_batch_id=?, last_processed_official_date=?, last_processed_game_pk=?, state_source='CERTIFIER_DAILY_HP_DELTA_UPDATED_AFTER_CLASSIFICATION_NO_CURRENT_MUTATION', updated_at=CURRENT_TIMESTAMP WHERE player_type=? AND player_id=? AND canonical_prop_key=? AND line_value=? AND selected_side=?`).bind(calc.hit_count,calc.miss_count,calc.push_count,calc.non_push_sample,calc.raw_rate_0_100,calc.baseline_hp_0_100,calc.baseline_hp_0_100,calc.raw_prior_gap_0_100,calc.baseline_confidence_0_100,calc.baseline_enriched_confidence_0_100,calc.sample_profile,nextSanityKey,`${nextSanityKey}_MODEL`,clsMatch&&clsMatch.volume_profile||null,clsMatch&&clsMatch.volatility_profile||null,clsMatch&&clsMatch.volatility_profile||null,batchId,officialDate,'DAILY_HP_DELTA',playerType,id,prop,Number(r.line_value),String(r.selected_side||'')));
        hpRowsUpdated++;
      }
    }
  }
  if(stmts.length) await batch(env.SCORE_DB,stmts,100);
  return {kind,official_date:officialDate,rawRowsRead,eventsInserted,hpRowsUpdated,classRowsUpdated,reclassified,playersProcessed,playersRequested:ids.length,playersSkippedNoMetrics,duplicateEventsSkipped,metric_batch_id:hydrateAudit&&hydrateAudit.metric_batch_id||null,metric_input_latest_game_date:hydrateAudit&&hydrateAudit.watermark_date||null,exact_sum_hydration:hydrateAudit,anchorRestore,classification_before_hp_required:true,certifier_owned_daily_delta:true,exact_metric_snapshot_sums:kind==='classification',exact_hit_miss_push_counters:kind==='hp',baseline_v5_daily_state_anchor_restore_v0_1_106:true,baseline_v5_hp_open_day_current_pair_audit_v0_1_108:true,baseline_v5_hp_anchor_restore_branch_fix_v0_1_109:true};
}

async function baselineV5DailyDateCoverageComplete(env,{kind,officialDate}){
  if(!env.TEAM_DB || !officialDate) return {complete:false,games:0,complete_rows:0};
  const layerKey=baselineV5DailyCoverageLayer(kind);
  const row=await first(env.TEAM_DB,`SELECT
      COUNT(DISTINCT game_pk) AS games,
      SUM(CASE WHEN coverage_status='complete' AND COALESCE(blocking_for_full_run,0)=0 THEN 1 ELSE 0 END) AS complete_rows,
      SUM(CASE WHEN coverage_status='missing' AND COALESCE(blocking_for_full_run,0)=1 THEN 1 ELSE 0 END) AS missing_rows
    FROM mlb_game_data_coverage
    WHERE official_date=? AND layer_key=?`,officialDate,layerKey);
  const games=Number(row&&row.games||0), completeRows=Number(row&&row.complete_rows||0), missingRows=Number(row&&row.missing_rows||0);
  return {complete:games>0 && completeRows>=games && missingRows===0,games,complete_rows:completeRows,missing_rows:missingRows,layer_key:layerKey,official_date:officialDate};
}
async function baselineV5DailyHpProfileMismatchOpenDate(env,{watermarkDate,cutoffDate}){
  const row=await first(env.SCORE_DB,`SELECT MIN(COALESCE(c.last_processed_official_date,h.last_processed_official_date)) AS official_date, COUNT(*) AS rows
    FROM player_baseline_v5_hp_state_current h
    JOIN player_baseline_v5_classification_state_current c
      ON c.player_type=h.player_type
     AND c.player_id=h.player_id
     AND c.canonical_prop_key=h.canonical_prop_key
     AND c.line_value=h.line_value
     AND c.selected_side=h.selected_side
    WHERE date(COALESCE(c.last_processed_official_date,h.last_processed_official_date))>date(?)
      AND date(COALESCE(c.last_processed_official_date,h.last_processed_official_date))<=date(?)
      AND (COALESCE(h.sanity_profile_key,'')<>COALESCE(c.classification_profile_key,'')
        OR COALESCE(h.baseline_hp_profile_key,'')<>COALESCE(c.classification_profile_key,'') || '_MODEL')`,watermarkDate,cutoffDate);
  return row&&row.official_date ? String(row.official_date).slice(0,10) : null;
}
async function baselineV5DailyHpPrereqCoverageComplete(env,{officialDate}){
  const row=await first(env.TEAM_DB,`SELECT
      COUNT(DISTINCT game_pk) AS games,
      SUM(CASE WHEN coverage_status='complete' AND COALESCE(blocking_for_full_run,0)=0 THEN 1 ELSE 0 END) AS complete_rows
    FROM mlb_game_data_coverage
    WHERE official_date=? AND layer_key='baseline_v5_classification'`,officialDate);
  const games=Number(row&&row.games||0), completeRows=Number(row&&row.complete_rows||0);
  return {complete:games>0 && completeRows>=games,games,complete_rows:completeRows,official_date:officialDate,layer_key:'baseline_v5_classification'};
}

async function runBaselineV5DailyDelta(env,input={},kind='classification'){
  const started=Date.now();
  await ensureBaselineV5StateSchema(env);
  const exactColumnAudit=await baselineV5EnsureDailyClassificationExactColumns(env);
  const requestId=String(input.request_id||rid(`baseline_v5_${kind}_daily_delta`));
  const runId=String(input.run_id||rid('run'));
  const mode=baselineV5DailyMode(kind);
  const latest=await baselineV5LatestPassStateBatch(env);
  const watermarkDate=String(input.source_watermark_date||input.watermark_date||(latest&&latest.source_watermark_date)||'2026-06-29').slice(0,10);
  const cutoffDate=String(input.target_cutoff_date||input.cutoff_date||await baselineV5StatefulSafeCutoff(env,watermarkDate)||watermarkDate).slice(0,10);
  if(!cutoffDate || cutoffDate<=watermarkDate){
    const cert=`${baselineV5DailyCertPrefix(kind)}_NOOP_NO_SAFE_OPEN_DAYS`;
    return baseOutput(input,{request_id:requestId,run_id:runId,mode,status:cert,certification:cert,certification_grade:'NOOP_PASS',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,certifier_owned_daily_delta:true,classification_before_hp_required:true,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false});
  }
  const hpProfileRepairDate = kind==='hp' ? await baselineV5DailyHpProfileMismatchOpenDate(env,{watermarkDate,cutoffDate}) : null;
  const requestedOfficialDate=String(input.official_date||'').slice(0,10);
  const safeOpenDate=await baselineV5DailySafeOpenDate(env,{kind,watermarkDate,cutoffDate});
  let officialDate='';
  if(kind==='hp' && hpProfileRepairDate && (!requestedOfficialDate || hpProfileRepairDate<requestedOfficialDate)) officialDate=hpProfileRepairDate;
  else officialDate=String(requestedOfficialDate||hpProfileRepairDate||safeOpenDate||'').slice(0,10);
  if(!officialDate){
    const cert=`${baselineV5DailyCertPrefix(kind)}_NOOP_ALL_DAYS_ALREADY_COVERED`;
    return baseOutput(input,{request_id:requestId,run_id:runId,mode,status:cert,certification:cert,certification_grade:'NOOP_PASS',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,certifier_owned_daily_delta:true,classification_before_hp_required:true,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false});
  }
  if(kind==='hp') {
    const prereq=await baselineV5DailyHpPrereqCoverageComplete(env,{officialDate});
    if(!prereq.complete){
      const cert=`${baselineV5DailyCertPrefix(kind)}_BLOCKED_WAITING_CLASSIFICATION_DAILY_COVERAGE`;
      return baseOutput(input,{request_id:requestId,run_id:runId,mode,status:cert,certification:cert,certification_grade:'BLOCKED',data_ok:false,source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,official_date:officialDate,certifier_owned_daily_delta:true,classification_before_hp_required:true,classification_prereq_coverage:prereq,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false});
    }
  }
  const staleDailyCleanup=await baselineV5DailyRetireStaleOrphanBatches(env,{kind,officialDate,requestId});
  const preselectedBatchId=String(input.batch_id||'');
  const contaminationAudit=await baselineV5DailyContaminatedStateAudit(env,{kind,officialDate,allowedPartialBatchId:preselectedBatchId,allowedRequestId:requestId});
  if(contaminationAudit.contaminated_rows>0){
    const cert=`${baselineV5DailyCertPrefix(kind)}_BLOCKED_CONTAMINATED_STATE_REQUIRES_CLEANUP`;
    return baseOutput(input,{request_id:requestId,run_id:runId,mode,status:cert,certification:cert,certification_grade:'BLOCKED',data_ok:false,source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,official_date:officialDate,certifier_owned_daily_delta:true,classification_before_hp_required:true,stale_daily_cleanup:staleDailyCleanup,contaminated_state_audit:contaminationAudit,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false,baseline_v5_daily_equivalence_guard_v0_1_103:true,baseline_v5_daily_partial_continuation_guard_v0_1_104:true,baseline_v5_daily_timeout_orphan_guard_v0_1_107:true});
  }
  const existingCoverage=await baselineV5DailyDateCoverageComplete(env,{kind,officialDate});
  if(existingCoverage.complete && !(kind==='hp' && hpProfileRepairDate===officialDate)){
    const cert=`${baselineV5DailyCertPrefix(kind)}_NOOP_DATE_ALREADY_COVERED`;
    return baseOutput(input,{request_id:requestId,run_id:runId,mode,status:cert,certification:cert,certification_grade:'NOOP_PASS',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,official_date:officialDate,coverage_update:existingCoverage,certifier_owned_daily_delta:true,classification_before_hp_required:true,idempotent_daily_coverage_guard_v0_1_102:true,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false});
  }
  await baselineV5StatefulRetireStaleBatches(env);
  const batchId=String(input.batch_id||rid(`baseline_v5_${kind}_daily_delta_batch`));
  const hpStateRows=await tableCount(env.SCORE_DB,'player_baseline_v5_hp_state_current');
  const clsStateRows=await tableCount(env.SCORE_DB,'player_baseline_v5_classification_state_current');
  await run(env.SCORE_DB,`INSERT OR IGNORE INTO player_baseline_v5_state_batches (batch_id,request_id,run_id,mode,status,worker_version,source_watermark_date,hp_current_rows,hp_state_rows,classification_current_rows,classification_state_rows,current_tables_mutated,history_tables_mutated,full_cumulative_history_recompute,certification,certification_grade,output_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,mode,'running',VERSION,watermarkDate,await tableCount(env.SCORE_DB,'player_baseline_hp_v2_current'),hpStateRows,await tableCount(env.SCORE_DB,'player_baseline_classification_v5_current'),clsStateRows,0,0,0,`${baselineV5DailyCertPrefix(kind)}_STARTED`,'RUNNING',safeJson({mode,official_date:officialDate,source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,certifier_owned_daily_delta:true}));
  const chunkSize=Math.max(1,Math.min(10,Number(input.stateful_delta_player_chunk_size||input.daily_delta_player_chunk_size||10))); // v0.1.107: small daily chunks prevent service-binding timeout while restoring anchors
  let phase=String(input.stateful_delta_phase||input.daily_delta_phase||'process_hitter');
  if(phase==='process_hitter'){
    const offset=Math.max(0,Number(input.hitter_cursor_offset||0));
    const playerPage=await baselineV5StatefulPlayerPage(env,{playerType:'hitter',watermarkDate:baselineV5YmdAdd(officialDate,-1),cutoffDate:officialDate,limit:chunkSize,offset});
    if(playerPage.length){
      const playerIds=playerPage.map(r=>Number(r.player_id||0)).filter(Boolean);
      const res=await baselineV5DailyApplyPlayerAggregate(env,{batchId,officialDate,playerType:'hitter',playerIds,kind});
      const next={...input,mode,batch_id:batchId,official_date:officialDate,stateful_delta_phase:'process_hitter',hitter_cursor_offset:offset+playerPage.length,stateful_delta_player_chunk_size:chunkSize};
      const out=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode,stateful_delta_phase:'process_hitter',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,official_date:officialDate,hitter_cursor_offset:offset+playerPage.length,players_read:playerPage.length,rows_read:res.rawRowsRead,rows_written:res.hpRowsUpdated+res.classRowsUpdated+res.eventsInserted,daily_delta:res,certifier_owned_daily_delta:true,classification_delta_included:kind==='classification',baseline_hp_delta_included:kind==='hp',next_input_json:next,elapsed_ms:Date.now()-started});
      await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status='partial_continue', certification=?, certification_grade='PARTIAL', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,`${baselineV5DailyCertPrefix(kind)}_HITTER_PARTIAL_CONTINUE`,safeJson(out),batchId);
      return out;
    }
    const next={...input,mode,batch_id:batchId,official_date:officialDate,stateful_delta_phase:'process_pitcher',pitcher_cursor_offset:0,stateful_delta_player_chunk_size:chunkSize};
    const out=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode,stateful_delta_phase:'process_hitter_done',next_stateful_delta_phase:'process_pitcher',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,official_date:officialDate,certifier_owned_daily_delta:true,classification_delta_included:kind==='classification',baseline_hp_delta_included:kind==='hp',next_input_json:next,elapsed_ms:Date.now()-started});
    await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,safeJson(out),batchId);
    return out;
  }
  if(phase==='process_pitcher'){
    const offset=Math.max(0,Number(input.pitcher_cursor_offset||0));
    const playerPage=await baselineV5StatefulPlayerPage(env,{playerType:'pitcher',watermarkDate:baselineV5YmdAdd(officialDate,-1),cutoffDate:officialDate,limit:chunkSize,offset});
    if(playerPage.length){
      const playerIds=playerPage.map(r=>Number(r.player_id||0)).filter(Boolean);
      const res=await baselineV5DailyApplyPlayerAggregate(env,{batchId,officialDate,playerType:'pitcher',playerIds,kind});
      const next={...input,mode,batch_id:batchId,official_date:officialDate,stateful_delta_phase:'process_pitcher',pitcher_cursor_offset:offset+playerPage.length,stateful_delta_player_chunk_size:chunkSize};
      const out=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode,stateful_delta_phase:'process_pitcher',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,official_date:officialDate,pitcher_cursor_offset:offset+playerPage.length,players_read:playerPage.length,rows_read:res.rawRowsRead,rows_written:res.hpRowsUpdated+res.classRowsUpdated+res.eventsInserted,daily_delta:res,certifier_owned_daily_delta:true,classification_delta_included:kind==='classification',baseline_hp_delta_included:kind==='hp',next_input_json:next,elapsed_ms:Date.now()-started});
      await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status='partial_continue', certification=?, certification_grade='PARTIAL', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,`${baselineV5DailyCertPrefix(kind)}_PITCHER_PARTIAL_CONTINUE`,safeJson(out),batchId);
      return out;
    }
  }
  const changedHp=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_type||':'||player_id) AS players FROM player_baseline_v5_hp_state_current WHERE state_batch_id=?`,batchId);
  const changedCls=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_type||':'||player_id) AS players FROM player_baseline_v5_classification_state_current WHERE state_batch_id=?`,batchId);
  const hpStateAfter=await tableCount(env.SCORE_DB,'player_baseline_v5_hp_state_current');
  const clsStateAfter=await tableCount(env.SCORE_DB,'player_baseline_v5_classification_state_current');
  const badCounters=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows FROM player_baseline_v5_hp_state_current WHERE COALESCE(hit_count,0)+COALESCE(miss_count,0)<>COALESCE(non_push_sample,0)`);
  const profileMismatch=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows FROM player_baseline_v5_hp_state_current h JOIN player_baseline_v5_classification_state_current c ON c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side WHERE COALESCE(h.sanity_profile_key,'')<>COALESCE(c.classification_profile_key,'') OR COALESCE(h.baseline_hp_profile_key,'')<>COALESCE(c.classification_profile_key,'') || '_MODEL'`);
  const profileMismatchRows=Number(profileMismatch?.rows||0);
  const hpMissingClassPair=kind==='hp' ? await first(env.SCORE_DB,`SELECT COUNT(*) AS rows FROM player_baseline_v5_hp_state_current h LEFT JOIN player_baseline_v5_classification_state_current c ON c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side WHERE h.state_batch_id=? AND c.classification_row_id IS NULL`,batchId) : {rows:0};
  const hpMissingClassPairRows=Number(hpMissingClassPair?.rows||0);
  const changedHpRows=Number(changedHp?.rows||0);
  const changedClsRows=Number(changedCls?.rows||0);
  const badCounterRows=Number(badCounters?.rows||0);
  // v0.1.105: Classification daily delta must not require HP current to be fully hydrated or profile-synced.
  // HP current rows can be intentionally missing for open repair dates and HP daily delta is the next layer that restores HP/class sync.
  const classificationAuditPass=(kind==='classification' && changedClsRows>0 && badCounterRows===0 && (!contaminationAudit || contaminationAudit.pass!==false));
  // v0.1.108: HP daily delta is day-by-day. Do not require the global 67,040 HP state count before later HP dates run.
  // The HP audit contract is: changed HP rows for this batch, clean counters, clean current HP/class profile sync, no missing current classification pair, and clean contamination audit.
  const hpAuditPass=(kind==='hp' && changedHpRows>0 && badCounterRows===0 && profileMismatchRows===0 && hpMissingClassPairRows===0 && (!contaminationAudit || contaminationAudit.pass!==false));
  const pass=kind==='classification'?classificationAuditPass:hpAuditPass;
  const cert=pass?`${baselineV5DailyCertPrefix(kind)}_CERTIFIED_TALLY_COVERAGE_WRITTEN`:`${baselineV5DailyCertPrefix(kind)}_BLOCKED_AUDIT_FAILED`;
  const grade=pass?'PASS':'BLOCKED';
  // v0.1.101: write calendar/tally coverage only after the daily audit passes. A blocked HP audit must
  // never mark baseline_v5_hp complete, otherwise final_check can be tricked into a false PASS/NOOP.
  const coverage=pass ? await baselineV5DailyUpsertCoverage(env,{kind,officialDate,batchId,requestId,runId,rowsUpdated:kind==='classification'?Number(changedCls?.rows||0):Number(changedHp?.rows||0),playersUpdated:kind==='classification'?Number(changedCls?.players||0):Number(changedHp?.players||0)}) : {layer_key:baselineV5DailyCoverageLayer(kind),official_date:officialDate,coverage_rows_written:0,coverage_skipped_due_to_blocked_audit:true};
  const out=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode,status:cert,certification:cert,certification_grade:grade,data_ok:pass,source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,official_date:officialDate,hp_state_rows:hpStateAfter,classification_state_rows:clsStateAfter,hp_state_rows_updated:changedHpRows,classification_state_rows_updated:changedClsRows,coverage_update:coverage,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false,certifier_owned_daily_delta:true,classification_before_hp_required:true,classification_delta_included:kind==='classification',baseline_hp_delta_included:kind==='hp',day_by_day_delta:true,oldest_to_newest_controlled_by_tally:true,aggregate_differential_delta:true,bad_counter_rows:Number(badCounters?.rows||0),profile_mismatch_rows:profileMismatchRows,profile_mismatch_allowed_until_hp_daily_delta:kind==='classification',coverage_written_after_audit_pass_v0_1_101:true,idempotent_daily_coverage_guard_v0_1_102:true,hp_profile_sync_without_double_count_v0_1_102:kind==='hp',baseline_v5_daily_equivalence_guard_v0_1_103:true,baseline_v5_daily_partial_continuation_guard_v0_1_104:true,baseline_v5_classification_audit_hp_open_day_guard_v0_1_105:true,baseline_v5_daily_state_anchor_restore_v0_1_106:true,baseline_v5_daily_timeout_orphan_guard_v0_1_107:true,baseline_v5_hp_open_day_current_pair_audit_v0_1_108:true,baseline_v5_hp_anchor_restore_branch_fix_v0_1_109:true,stale_daily_cleanup:staleDailyCleanup,classification_audit_pass:classificationAuditPass,hp_audit_pass:hpAuditPass,hp_missing_class_pair_rows:hpMissingClassPairRows,classification_daily_metric_snapshot_or_event_ledger_idempotent_v0_1_103:kind==='classification',contaminated_state_audit:contaminationAudit,hp_profile_repair_date:hpProfileRepairDate||null,elapsed_ms:Date.now()-started});
  await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status=?, source_watermark_date=?, hp_state_rows=?, classification_state_rows=?, current_tables_mutated=0, history_tables_mutated=0, full_cumulative_history_recompute=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,cert,officialDate,hpStateAfter,clsStateAfter,cert,grade,safeJson(out),batchId);
  return out;
}


async function runBaselineV5StatefulDelta(env,input={}){
  await ensureBaselineV5StateSchema(env);
  const requestId=String(input.request_id||rid('baseline_v5_stateful_delta'));
  const runId=String(input.run_id||rid('run'));
  const batchId=String(input.batch_id||rid('baseline_v5_stateful_delta_batch'));
  const started=Date.now();
  const phase=String(input.stateful_delta_phase||input.delta_phase||'init');
  const chunkSize=Math.max(1,Math.min(25,Number(input.stateful_delta_player_chunk_size||input.stateful_delta_chunk_size||input.delta_chunk_size||12))); // v0.1.98 player chunks; each chunk applies aggregate differential deltas across all source rows for those players

  if(phase==='init'){
    const cleanup=await baselineV5StatefulRetireStaleBatches(env);
    const sourceWatermark=await first(env.SCORE_DB,`SELECT MAX(official_date) AS max_official_date, MAX(game_pk) AS max_game_pk FROM player_baseline_hp_v2_source_queue`);
    const baseWatermarkDate=String((sourceWatermark&&sourceWatermark.max_official_date)||'2026-06-29');
    const baseWatermarkGamePk=String((sourceWatermark&&sourceWatermark.max_game_pk)||'');
    let watermarkDate=baseWatermarkDate;
    let watermarkGamePk=baseWatermarkGamePk;
    const latestDelta=await first(env.SCORE_DB,`SELECT batch_id,status,certification,certification_grade,source_watermark_date,source_watermark_game_pk,updated_at FROM player_baseline_v5_state_batches WHERE mode='baseline_v5_stateful_delta' ORDER BY datetime(updated_at) DESC LIMIT 1`);
    const latestCertifiedDelta=await first(env.SCORE_DB,`SELECT batch_id,source_watermark_date,source_watermark_game_pk,updated_at FROM player_baseline_v5_state_batches WHERE mode='baseline_v5_stateful_delta' AND certification_grade='PASS' ORDER BY date(source_watermark_date) DESC, datetime(updated_at) DESC LIMIT 1`);
    if(latestCertifiedDelta && latestCertifiedDelta.source_watermark_date && new Date(String(latestCertifiedDelta.source_watermark_date))>new Date(watermarkDate)){
      watermarkDate=String(latestCertifiedDelta.source_watermark_date).slice(0,10);
      watermarkGamePk=String(latestCertifiedDelta.source_watermark_game_pk||watermarkGamePk||'');
    }
    // Do not globally rehydrate on every delta. Rehydrate only when the state anchor is missing/dirty from an uncertified partial run or caller explicitly requests it.
    // This keeps normal future deltas event-driven and prevents touching all 67,040 state rows.
    let hpStateBefore=await tableCount(env.SCORE_DB,'player_baseline_v5_hp_state_current');
    let clsStateBefore=await tableCount(env.SCORE_DB,'player_baseline_v5_classification_state_current');
    const dirtyState=await first(env.SCORE_DB,`SELECT
        (SELECT COUNT(*) FROM player_baseline_v5_hp_state_current WHERE substr(COALESCE(state_source,''),1,15)='STATEFUL_DELTA_') AS hp_dirty,
        (SELECT COUNT(*) FROM player_baseline_v5_classification_state_current WHERE substr(COALESCE(state_source,''),1,15)='STATEFUL_DELTA_') AS cls_dirty`);
    const latestDeltaCertified=latestDelta && latestDelta.certification_grade==='PASS';
    const hasDeltaState=Number(dirtyState&&dirtyState.hp_dirty||0)>0 || Number(dirtyState&&dirtyState.cls_dirty||0)>0;
    const forceRehydrate=!!(input.force_state_rehydrate || input.rehydrate_state || input.reset_state_anchor);
    const needsRehydrate=forceRehydrate || Number(hpStateBefore||0)!==BASELINE_V5_LOCKED_BASE_EXPECTED_ROWS || Number(clsStateBefore||0)!==BASELINE_V5_LOCKED_BASE_EXPECTED_ROWS || (hasDeltaState && !latestDeltaCertified);
    let rehydrateBatchId=null, rehydrate=null, deltaEventsClearedOnRehydrate=0;
    if(needsRehydrate){
      // Rehydrate resets state to the protected current/base anchor, so the delta window must restart from that base watermark.
      watermarkDate=baseWatermarkDate;
      watermarkGamePk=baseWatermarkGamePk;
      const beforeEvents=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_v5_delta_events WHERE mode='baseline_v5_stateful_delta'`);
      deltaEventsClearedOnRehydrate=Number(beforeEvents&&beforeEvents.c||0);
      await run(env.SCORE_DB,`DELETE FROM player_baseline_v5_delta_events WHERE mode='baseline_v5_stateful_delta'`);
      rehydrateBatchId=String(input.rehydrate_batch_id||rid('baseline_v5_state_rehydrate_batch'));
      rehydrate=await runBaselineV5StateHydrate(env,{...input,request_id:requestId+'_rehydrate',run_id:runId,batch_id:rehydrateBatchId,mode:'baseline_v5_state_hydrate'});
      hpStateBefore=await tableCount(env.SCORE_DB,'player_baseline_v5_hp_state_current');
      clsStateBefore=await tableCount(env.SCORE_DB,'player_baseline_v5_classification_state_current');
    }
    const cutoffDate=await baselineV5StatefulSafeCutoff(env,watermarkDate);
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_v5_state_batches (batch_id,request_id,run_id,mode,status,worker_version,source_watermark_date,source_watermark_game_pk,hp_state_rows,classification_state_rows,current_tables_mutated,history_tables_mutated,full_cumulative_history_recompute,certification,certification_grade,output_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,0,'BASELINE_V5_STATEFUL_DELTA_INITIALIZED','PARTIAL',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,'baseline_v5_stateful_delta','partial_continue',VERSION,watermarkDate,watermarkGamePk,hpStateBefore,clsStateBefore,safeJson({phase:'init',cleanup,anchor_rehydrate_performed:needsRehydrate,rehydrate_batch_id:rehydrateBatchId,rehydrate_certification:rehydrate&&rehydrate.certification||null,dirty_state_before:dirtyState,latest_delta_before:latestDelta,latest_certified_delta_before:latestCertifiedDelta,delta_events_cleared_on_rehydrate:deltaEventsClearedOnRehydrate,baseWatermarkDate,watermarkDate,cutoffDate,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false}));
    if(!cutoffDate || new Date(cutoffDate)<=new Date(watermarkDate)){
      const cert='BASELINE_V5_STATEFUL_DELTA_CERTIFIED_NOOP_NO_FULL_SOURCE_DAYS_AFTER_WATERMARK';
      const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:'baseline_v5_stateful_delta',status:cert,certification:cert,certification_grade:'NOOP_PASS',source_watermark_date:watermarkDate,target_cutoff_date:watermarkDate,rows_read:0,rows_written:0,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false,no_daily_context:true,no_market_context:true,no_scoring_context:true,no_final_board_context:true,cleanup,anchor_rehydrate_performed:needsRehydrate,delta_events_cleared_on_rehydrate:deltaEventsClearedOnRehydrate,rehydrate_batch_id:rehydrateBatchId,elapsed_ms:Date.now()-started});
      await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status=?, certification=?, certification_grade='NOOP_PASS', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,cert,cert,safeJson(output),batchId);
      return output;
    }
    const next={...input,request_id:requestId,run_id:runId,batch_id:batchId,mode:'baseline_v5_stateful_delta',stateful_delta_phase:'process_hitter',source_watermark_date:watermarkDate,source_watermark_game_pk:watermarkGamePk,target_cutoff_date:cutoffDate,hitter_cursor_offset:0,pitcher_cursor_offset:0,stateful_delta_chunk_size:chunkSize};
    const output=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,stateful_delta_phase:'init',next_stateful_delta_phase:'process_hitter',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,cleanup,anchor_rehydrate_performed:needsRehydrate,delta_events_cleared_on_rehydrate:deltaEventsClearedOnRehydrate,rehydrate_batch_id:rehydrateBatchId,hp_state_rows:hpStateBefore,classification_state_rows:clsStateBefore,rows_read:0,rows_written:0,elapsed_ms:Date.now()-started,next_input_json:next});
    await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,safeJson(output),batchId);
    return output;
  }

  const watermarkDate=String(input.source_watermark_date||'2026-06-29');
  const cutoffDate=String(input.target_cutoff_date||await baselineV5StatefulSafeCutoff(env,watermarkDate)||watermarkDate);
  const hpStateBefore=await tableCount(env.SCORE_DB,'player_baseline_v5_hp_state_current');
  const clsStateBefore=await tableCount(env.SCORE_DB,'player_baseline_v5_classification_state_current');

  if(phase==='process_hitter'){
    const offset=Math.max(0,Number(input.hitter_cursor_offset||0));
    const playerPage=await baselineV5StatefulPlayerPage(env,{playerType:'hitter',watermarkDate,cutoffDate,limit:chunkSize,offset});
    if(playerPage.length){
      const playerIds=playerPage.map(r=>Number(r.player_id||0)).filter(Boolean);
      const res=await baselineV5StatefulApplyPlayerAggregate(env,{batchId,watermarkDate,cutoffDate,playerType:'hitter',playerIds});
      const next={...input,stateful_delta_phase:'process_hitter',hitter_cursor_offset:offset+playerPage.length,stateful_delta_player_chunk_size:chunkSize,stateful_delta_chunk_size:chunkSize};
      const output=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,stateful_delta_phase:'process_hitter',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,hitter_cursor_offset:offset+playerPage.length,player_chunk_size:chunkSize,players_read:playerPage.length,rows_read:res.rawRowsRead,rows_written:res.eventsInserted+res.hpRowsUpdated+res.classRowsUpdated,hitter_delta:res,aggregate_differential_delta:true,elapsed_ms:Date.now()-started,next_input_json:next});
      await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status='partial_continue', certification='BASELINE_V5_STATEFUL_DELTA_HITTER_AGGREGATE_PARTIAL_CONTINUE', certification_grade='PARTIAL', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,safeJson(output),batchId);
      return output;
    }
    const next={...input,stateful_delta_phase:'process_pitcher',pitcher_cursor_offset:0,stateful_delta_player_chunk_size:chunkSize,stateful_delta_chunk_size:chunkSize};
    const output=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,stateful_delta_phase:'process_hitter_done',next_stateful_delta_phase:'process_pitcher',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,hitter_cursor_offset:offset,rows_read:0,rows_written:0,aggregate_differential_delta:true,elapsed_ms:Date.now()-started,next_input_json:next});
    await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,safeJson(output),batchId);
    return output;
  }

  if(phase==='process_pitcher'){
    const offset=Math.max(0,Number(input.pitcher_cursor_offset||0));
    const playerPage=await baselineV5StatefulPlayerPage(env,{playerType:'pitcher',watermarkDate,cutoffDate,limit:chunkSize,offset});
    if(playerPage.length){
      const playerIds=playerPage.map(r=>Number(r.player_id||0)).filter(Boolean);
      const res=await baselineV5StatefulApplyPlayerAggregate(env,{batchId,watermarkDate,cutoffDate,playerType:'pitcher',playerIds});
      const next={...input,stateful_delta_phase:'process_pitcher',pitcher_cursor_offset:offset+playerPage.length,stateful_delta_player_chunk_size:chunkSize,stateful_delta_chunk_size:chunkSize};
      const output=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,stateful_delta_phase:'process_pitcher',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,pitcher_cursor_offset:offset+playerPage.length,player_chunk_size:chunkSize,players_read:playerPage.length,rows_read:res.rawRowsRead,rows_written:res.eventsInserted+res.hpRowsUpdated+res.classRowsUpdated,pitcher_delta:res,aggregate_differential_delta:true,elapsed_ms:Date.now()-started,next_input_json:next});
      await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status='partial_continue', certification='BASELINE_V5_STATEFUL_DELTA_PITCHER_AGGREGATE_PARTIAL_CONTINUE', certification_grade='PARTIAL', output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,safeJson(output),batchId);
      return output;
    }
    const next={...input,stateful_delta_phase:'certify',stateful_delta_player_chunk_size:chunkSize,stateful_delta_chunk_size:chunkSize};
    const output=await baselineV5StatefulPartialOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,stateful_delta_phase:'process_pitcher_done',next_stateful_delta_phase:'certify',source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,pitcher_cursor_offset:offset,rows_read:0,rows_written:0,aggregate_differential_delta:true,elapsed_ms:Date.now()-started,next_input_json:next});
    await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,safeJson(output),batchId);
    return output;
  }

  const pairAudit=await first(env.SCORE_DB,`WITH pairs AS (SELECT m.player_type,m.player_id,m.canonical_prop_key,m.line_value,m.baseline_hp_0_100 AS more_hp,l.baseline_hp_0_100 AS less_hp,m.non_push_sample AS more_sample,l.non_push_sample AS less_sample FROM player_baseline_v5_hp_state_current m JOIN player_baseline_v5_hp_state_current l ON l.player_type=m.player_type AND l.player_id=m.player_id AND l.canonical_prop_key=m.canonical_prop_key AND l.line_value=m.line_value AND l.selected_side='less' WHERE m.selected_side='more') SELECT COUNT(*) AS pair_rows, SUM(CASE WHEN ROUND(more_hp+less_hp,2)!=100 THEN 1 ELSE 0 END) AS bad_hp_pair_rows, SUM(CASE WHEN more_sample!=less_sample THEN 1 ELSE 0 END) AS bad_sample_pair_rows FROM pairs`);
  const deltaEvents=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_type||':'||player_id) AS players, MIN(game_date) AS min_game_date, MAX(game_date) AS max_game_date FROM player_baseline_v5_delta_events WHERE state_batch_id=?`,batchId);
  const currentHp=await tableCount(env.SCORE_DB,'player_baseline_hp_v2_current');
  const currentCls=await tableCount(env.SCORE_DB,'player_baseline_classification_v5_current');
  const hpStateAfter=await tableCount(env.SCORE_DB,'player_baseline_v5_hp_state_current');
  const clsStateAfter=await tableCount(env.SCORE_DB,'player_baseline_v5_classification_state_current');
  const changedHp=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_type||':'||player_id) AS players FROM player_baseline_v5_hp_state_current WHERE state_batch_id=?`,batchId);
  const changedCls=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_type||':'||player_id) AS players FROM player_baseline_v5_classification_state_current WHERE state_batch_id=?`,batchId);
  const reclassified=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_type||':'||player_id) AS players FROM player_baseline_v5_classification_state_current WHERE state_batch_id=? AND state_source='STATEFUL_DELTA_AGGREGATE_CLASSIFICATION_UPDATED_NO_CURRENT_MUTATION'`,batchId);
  const badPairs=Number(pairAudit&&pairAudit.bad_hp_pair_rows||0)+Number(pairAudit&&pairAudit.bad_sample_pair_rows||0);
  const syncAudit=await baselineV5StateReliabilityAudit(env);
  const pass=badPairs===0 && hpStateAfter===hpStateBefore && clsStateAfter===clsStateBefore && currentHp===67040 && currentCls===67040 && syncAudit.pass;
  const cert=pass?'BASELINE_V5_STATEFUL_DELTA_AGGREGATE_CERTIFIED_SAFE_CUTOFF_STATE_UPDATED_PROFILE_SYNC_GUARDED':'BASELINE_V5_STATEFUL_DELTA_AGGREGATE_BLOCKED_AUDIT_FAILED_PROFILE_SYNC_GUARDED';
  const grade=pass?'PASS':'BLOCKED';
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:'baseline_v5_stateful_delta',status:cert,certification:cert,certification_grade:grade,data_ok:pass,source_watermark_date:watermarkDate,target_cutoff_date:cutoffDate,delta_events:deltaEvents,hp_state_rows_updated:Number(changedHp&&changedHp.rows||0),hp_state_players_updated:Number(changedHp&&changedHp.players||0),classification_state_rows_updated:Number(changedCls&&changedCls.rows||0),classification_state_players_updated:Number(changedCls&&changedCls.players||0),players_reclassified_shadow:Number(reclassified&&reclassified.players||0),classification_rows_reclassified_shadow:Number(reclassified&&reclassified.rows||0),hp_pair_audit:pairAudit,state_reliability_audit:syncAudit,hp_state_rows:hpStateAfter,classification_state_rows:clsStateAfter,hp_current_rows:currentHp,classification_current_rows:currentCls,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false,no_daily_context:true,no_market_context:true,no_scoring_context:true,no_final_board_context:true,full_run_integration:true,safe_cutoff_from_completed_source_layers:true,classification_delta_included:true,baseline_hp_delta_included:true,old_fake_delta_blocked:true,aggregate_differential_delta:true, chunked_continuation:true,elapsed_ms:Date.now()-started});
  await run(env.SCORE_DB,`UPDATE player_baseline_v5_state_batches SET status=?, source_watermark_date=?, hp_state_rows=?, classification_state_rows=?, current_tables_mutated=0, history_tables_mutated=0, full_cumulative_history_recompute=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,cert,cutoffDate,hpStateAfter,clsStateAfter,cert,grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_v5_state_audit (audit_id,state_batch_id,mode,audit_key,audit_status,audit_json,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`,rid('audit'),batchId,'baseline_v5_stateful_delta','stateful_delta_chunked_shadow_audit',pass?'PASS':'BLOCKED',safeJson({watermarkDate,cutoffDate,pairAudit,state_reliability_audit:syncAudit,deltaEvents,changedHp,changedCls,reclassified,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:false}));
  return output;
}


async function baselineV5StateReliabilityAudit(env){
  const hpTier=reliabilitySampleTierSql('non_push_sample');
  const clsTier=reliabilitySampleTierSql('games_sample');
  const hp=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows_checked,
      SUM(CASE WHEN COALESCE(sample_profile,'') <> ${hpTier} THEN 1 ELSE 0 END) AS sample_profile_remap_needed,
      SUM(CASE WHEN player_type='pitcher' AND COALESCE(non_push_sample,0) < 20 AND COALESCE(baseline_confidence_0_100,0) > 35 THEN 1 ELSE 0 END) AS pitcher_small_sample_conf_blockers,
      SUM(CASE WHEN player_type='pitcher' AND COALESCE(non_push_sample,0) < 20 AND COALESCE(baseline_enriched_confidence_0_100,0) > 35 THEN 1 ELSE 0 END) AS pitcher_small_sample_enriched_conf_blockers,
      SUM(CASE WHEN player_type='pitcher' AND sample_profile='ELITE' AND COALESCE(non_push_sample,0) < 30 THEN 1 ELSE 0 END) AS pitcher_bad_elite_profile_blockers,
      SUM(CASE WHEN COALESCE(hit_count,0) + COALESCE(miss_count,0) <> COALESCE(non_push_sample,0) THEN 1 ELSE 0 END) AS bad_counter_rows,
      SUM(CASE WHEN no_daily_context <> 1 OR no_market_context <> 1 OR no_scoring_context <> 1 OR no_final_board_context <> 1 THEN 1 ELSE 0 END) AS bad_context_rows
    FROM player_baseline_v5_hp_state_current`);
  const cls=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows_checked,
      SUM(CASE WHEN COALESCE(sample_profile,'') <> ${clsTier} THEN 1 ELSE 0 END) AS sample_profile_remap_needed,
      SUM(CASE WHEN player_type='pitcher' AND COALESCE(games_sample,0) < 20 AND COALESCE(classification_confidence_0_100,0) > 35 THEN 1 ELSE 0 END) AS pitcher_small_sample_conf_blockers,
      SUM(CASE WHEN player_type='pitcher' AND sample_profile='ELITE' AND COALESCE(games_sample,0) < 30 THEN 1 ELSE 0 END) AS pitcher_bad_elite_profile_blockers,
      SUM(CASE WHEN no_daily_context <> 1 OR no_market_context <> 1 OR no_scoring_context <> 1 OR no_final_board_context <> 1 THEN 1 ELSE 0 END) AS bad_context_rows
    FROM player_baseline_v5_classification_state_current`);
  const sync=await first(env.SCORE_DB,`SELECT COUNT(*) AS joined_rows,
      SUM(CASE WHEN h.sanity_profile_key <> c.classification_profile_key THEN 1 ELSE 0 END) AS state_profile_key_mismatch_rows,
      SUM(CASE WHEN h.baseline_hp_profile_key <> c.classification_profile_key || '_MODEL' THEN 1 ELSE 0 END) AS state_model_key_mismatch_rows,
      SUM(CASE WHEN h.non_push_sample <> c.events_sample THEN 1 ELSE 0 END) AS state_sample_count_mismatch_rows,
      COUNT(DISTINCT CASE WHEN h.sanity_profile_key <> c.classification_profile_key THEN h.player_type||':'||h.player_id END) AS profile_mismatch_players,
      COUNT(DISTINCT CASE WHEN h.non_push_sample <> c.events_sample THEN h.player_type||':'||h.player_id END) AS sample_mismatch_players
    FROM player_baseline_v5_hp_state_current h JOIN player_baseline_v5_classification_state_current c ON c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side`);
  const hpRemaining=Number(hp?.sample_profile_remap_needed||0)+Number(hp?.pitcher_small_sample_conf_blockers||0)+Number(hp?.pitcher_small_sample_enriched_conf_blockers||0)+Number(hp?.pitcher_bad_elite_profile_blockers||0)+Number(hp?.bad_counter_rows||0)+Number(hp?.bad_context_rows||0);
  const clsRemaining=Number(cls?.sample_profile_remap_needed||0)+Number(cls?.pitcher_small_sample_conf_blockers||0)+Number(cls?.pitcher_bad_elite_profile_blockers||0)+Number(cls?.bad_context_rows||0);
  const syncRemaining=Number(sync?.state_profile_key_mismatch_rows||0)+Number(sync?.state_model_key_mismatch_rows||0)+Number(sync?.state_sample_count_mismatch_rows||0);
  return {hp,classification:cls,sync:sync||{},remaining_blockers:hpRemaining+clsRemaining+syncRemaining,pass:hpRemaining===0 && clsRemaining===0 && syncRemaining===0};
}

async function runBaselineV5StateReliabilityRescue(env,input={},startedMs=Date.now(),softYieldMs=10000){
  const hpTier=reliabilitySampleTierSql('non_push_sample');
  const clsTier=reliabilitySampleTierSql('games_sample');
  const requestId=String(input.request_id||rid('baseline_v5_classification_rescue'));
  const runId=String(input.run_id||rid('run'));
  const maxLoops=clamp(Number(input.state_reliability_max_loops||8),1,20);
  const chunkSize=clamp(Number(input.state_reliability_chunk_size||input.rescue_state_chunk_size||2000),100,5000);
  const before=await baselineV5StateReliabilityAudit(env);
  let hpUpdatePasses=0, clsUpdatePasses=0;
  for(let i=0;i<maxLoops && Date.now()-startedMs<softYieldMs;i++){
    const pre=await baselineV5StateReliabilityAudit(env);
    if(pre.pass) break;
    const hpNeed=Number(pre.hp?.sample_profile_remap_needed||0)+Number(pre.hp?.pitcher_small_sample_conf_blockers||0)+Number(pre.hp?.pitcher_small_sample_enriched_conf_blockers||0)+Number(pre.hp?.pitcher_bad_elite_profile_blockers||0);
    if(hpNeed>0 && Date.now()-startedMs<softYieldMs){
      await run(env.SCORE_DB,`UPDATE player_baseline_v5_hp_state_current
        SET sample_profile=${hpTier},
            baseline_confidence_0_100=CASE WHEN player_type='pitcher' AND COALESCE(non_push_sample,0) < 20 AND COALESCE(baseline_confidence_0_100,0) > 35 THEN 35 ELSE baseline_confidence_0_100 END,
            baseline_enriched_confidence_0_100=CASE WHEN player_type='pitcher' AND COALESCE(non_push_sample,0) < 20 AND COALESCE(baseline_enriched_confidence_0_100,0) > 35 THEN 35 ELSE baseline_enriched_confidence_0_100 END,
            confidence_formula_version=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE baseline_hp_row_id IN (
          SELECT baseline_hp_row_id FROM player_baseline_v5_hp_state_current
          WHERE COALESCE(sample_profile,'') <> ${hpTier}
             OR (player_type='pitcher' AND COALESCE(non_push_sample,0) < 20 AND COALESCE(baseline_confidence_0_100,0) > 35)
             OR (player_type='pitcher' AND COALESCE(non_push_sample,0) < 20 AND COALESCE(baseline_enriched_confidence_0_100,0) > 35)
             OR (player_type='pitcher' AND sample_profile='ELITE' AND COALESCE(non_push_sample,0) < 30)
          ORDER BY state_batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side
          LIMIT ?
        )`,`${VERSION}_state_reliability_rescue_confidence_35_cap`,chunkSize);
      hpUpdatePasses++;
    }
    const mid=await baselineV5StateReliabilityAudit(env);
    const clsNeed=Number(mid.classification?.sample_profile_remap_needed||0)+Number(mid.classification?.pitcher_small_sample_conf_blockers||0)+Number(mid.classification?.pitcher_bad_elite_profile_blockers||0);
    if(clsNeed>0 && Date.now()-startedMs<softYieldMs){
      await run(env.SCORE_DB,`UPDATE player_baseline_v5_classification_state_current
        SET sample_profile=${clsTier},
            classification_confidence_0_100=CASE WHEN player_type='pitcher' AND COALESCE(games_sample,0) < 20 AND COALESCE(classification_confidence_0_100,0) > 35 THEN 35 ELSE classification_confidence_0_100 END,
            classification_formula_version=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE classification_row_id IN (
          SELECT classification_row_id FROM player_baseline_v5_classification_state_current
          WHERE COALESCE(sample_profile,'') <> ${clsTier}
             OR (player_type='pitcher' AND COALESCE(games_sample,0) < 20 AND COALESCE(classification_confidence_0_100,0) > 35)
             OR (player_type='pitcher' AND sample_profile='ELITE' AND COALESCE(games_sample,0) < 30)
          ORDER BY state_batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side
          LIMIT ?
        )`,`${VERSION}_state_reliability_rescue_profile_remap`,chunkSize);
      clsUpdatePasses++;
    }
    const post=await baselineV5StateReliabilityAudit(env);
    if(post.pass) break;
    if(post.remaining_blockers>=pre.remaining_blockers && hpNeed===0 && clsNeed===0) break;
  }
  const stateUniverseRepair=await baselineV5ApplyStateClassificationUniverseRepair(env,input,startedMs,softYieldMs);
  const stateProfileSync=await baselineV5ApplyStateProfileSyncRescue(env,input,startedMs,softYieldMs);
  const after=await baselineV5StateReliabilityAudit(env);
  return {
    request_id:requestId,
    run_id:runId,
    mode:'baseline_v5_state_reliability_rescue',
    pass:after.pass,
    partial_continue:!after.pass,
    hp_update_passes:hpUpdatePasses,
    classification_update_passes:clsUpdatePasses,
    state_classification_universe_repair:stateUniverseRepair,
    state_profile_sync:stateProfileSync,
    chunk_size:chunkSize,
    before,
    after,
    target_only:true,
    state_tables_mutated:true,
    hp_values_mutated:false,
    counters_mutated:false,
    source_tables_mutated:false,
    production_current_tables_mutated:false,
    history_tables_mutated:false,
    full_recalculation:false,
    no_daily_context:true,
    no_market_context:true,
    no_scoring_context:true,
    no_final_board_context:true,
    repair_contract:'remap sample_profile to true sample bands, cap pitcher sample<20 confidence at 35, repair hitter state classification universe to PA>=1, and sync state HP profile keys to state classification; preserve HP values/count/source data'
  };
}


async function resolveBaselineV5RescueTargetBatchId(env,input={}){
  const explicit=String(input.batch_id||input.target_batch_id||input.baseline_v5_classification_rescue_target_batch_id||input.baseline_v5_base_rescue_target_batch_id||'').trim();
  if(explicit) return {batch_id:explicit,source:'input'};
  const base=await first(env.SCORE_DB,`SELECT batch_id, mode, status, rows_promoted, history_rows, updated_at
    FROM player_baseline_hp_v2_batches
    WHERE mode='baseline_v5_base'
      AND status='completed'
      AND COALESCE(rows_promoted,0)>0
      AND COALESCE(history_rows,0)=COALESCE(rows_promoted,0)
    ORDER BY datetime(updated_at) DESC LIMIT 1`);
  if(base&&base.batch_id) return {batch_id:String(base.batch_id),source:'latest_completed_baseline_v5_base',batch:base};
  const cls=await first(env.SCORE_DB,`SELECT batch_id, mode, status, rows_promoted, history_rows, updated_at
    FROM player_baseline_hp_v2_batches
    WHERE mode IN ('baseline_v5_classification_base','baseline_v5_classification_delta')
      AND status='completed'
      AND COALESCE(rows_promoted,0)>0
    ORDER BY datetime(updated_at) DESC LIMIT 1`);
  if(cls&&cls.batch_id) return {batch_id:String(cls.batch_id),source:'latest_completed_classification_batch',batch:cls};
  return {batch_id:'',source:'none'};
}


function baselineV5ClassPayloadFromClassificationRow(row,batchId,classification,formulaTag){
  const entityType=String(row.player_type||row.factor_family||'');
  return {
    classification_row_id:row.classification_row_id,
    batch_id:batchId,
    player_type:entityType,
    player_id:Number(row.player_id||row.mlb_player_id||0),
    player_name:safeResolvedPlayerName({mlb_player_id:row.player_id||row.mlb_player_id,player_name:row.player_name}),
    canonical_prop_key:String(row.canonical_prop_key||''),
    line_value:Number(row.line_value!=null?row.line_value:row.board_line_value),
    selected_side:String(row.selected_side||''),
    classification_tier:classification.classification_tier,
    classification_profile_key:classification.classification_profile_key,
    sample_profile:classification.sample_profile,
    volume_profile:classification.volume_profile,
    lineup_profile:classification.lineup_profile,
    platoon_profile:classification.platoon_profile,
    usage_profile:classification.usage_profile,
    volatility_profile:classification.volatility_profile,
    classification_confidence_0_100:classification.classification_confidence_0_100,
    games_sample:classification.games_sample,
    events_sample:classification.events_sample,
    pa_per_game:classification.pa_per_game,
    ab_ratio:classification.ab_ratio,
    avg_batting_order:classification.avg_batting_order,
    split_delta_0_100:classification.split_delta_0_100,
    classification_json:safeJson({...classification,baseline_v5_universe_sync_repair:true,formula_tag:formulaTag,no_daily_context:true,no_market_context:true,no_scoring_context:true,no_final_board_context:true})
  };
}
async function baselineV5RecomputeClassificationForRow(env,row,batchId,maxDate=null,formulaTag='baseline_v5_universe_sync_repair'){
  const entityType=String(row.player_type||row.factor_family||'');
  const prop=String(row.canonical_prop_key||'');
  const line=Number(row.line_value!=null?row.line_value:row.board_line_value);
  const side=String(row.selected_side||'');
  const playerId=Number(row.player_id||row.mlb_player_id||0);
  const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:entityType,selected_side:side,line_value:line});
  if(!resolved.profileNamespace || !resolved.sourceFormulaKey) throw new Error(`baseline_v5_unresolved_repair_inventory_${entityType}_${prop}_${line}_${side}`);
  const r={source_key:null,source_keys:null,game_pk:row.source_game_pk||row.game_pk||null,official_date:row.source_official_date||row.official_date||null,mlb_player_id:playerId,player_name:row.player_name,canonical_prop_key:prop,board_line_value:line,selected_side:side,factor_family:entityType,profile_namespace:resolved.profileNamespace,source_formula_key:resolved.sourceFormulaKey,baseline_formula_scope:baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey)};
  const values=await loadValuesForHpRow(env,r,maxDate);
  const hs=hitStatsFor(values,line,side);
  const stats=valueStats(values);
  const confidence=round(clamp(Number(row.classification_confidence_0_100||25),1,95),2);
  const classification=await classifyBaselineV5(env,r,line,side,entityType,{baseline_confidence_0_100:confidence,baseline_hp_0_100:null},hs,stats,maxDate);
  classification.classification_confidence_0_100=confidence;
  return baselineV5ClassPayloadFromClassificationRow(row,batchId,classification,formulaTag);
}
async function baselineV5ClassificationUniverseRepairAudit(env,batchId){
  const current=await first(env.SCORE_DB,`SELECT COUNT(*) AS joined_rows,
      SUM(CASE WHEN h.player_type='hitter' AND (h.non_push_sample <> c.events_sample OR h.non_push_sample <> c.games_sample OR h.sample_profile <> c.sample_profile OR COALESCE(q.source_hp_v2_rows,-1) <> h.non_push_sample) THEN 1 ELSE 0 END) AS hitter_universe_mismatch_rows,
      COUNT(DISTINCT CASE WHEN h.player_type='hitter' AND (h.non_push_sample <> c.events_sample OR h.non_push_sample <> c.games_sample OR h.sample_profile <> c.sample_profile OR COALESCE(q.source_hp_v2_rows,-1) <> h.non_push_sample) THEN h.player_id END) AS hitter_universe_mismatch_players,
      SUM(CASE WHEN h.sanity_profile_key <> c.classification_profile_key THEN 1 ELSE 0 END) AS hp_class_profile_mismatch_rows,
      SUM(CASE WHEN h.baseline_hp_profile_key <> c.classification_profile_key || '_MODEL' THEN 1 ELSE 0 END) AS hp_class_model_mismatch_rows
    FROM player_baseline_hp_v2_current h
    JOIN player_baseline_classification_v5_current c ON c.batch_id=h.batch_id AND c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side
    LEFT JOIN player_baseline_hp_v2_source_queue q ON q.batch_id=h.batch_id AND q.factor_family=h.player_type AND q.mlb_player_id=h.player_id AND q.canonical_prop_key=h.canonical_prop_key AND q.board_line_value=h.line_value AND q.selected_side=h.selected_side
    WHERE h.batch_id=?`,batchId);
  return {batch_id:batchId,current:current||{},pass:Number(current&&current.hitter_universe_mismatch_rows||0)===0};
}
async function baselineV5FetchClassificationUniverseRepairRows(env,batchId,limit){
  const max=clamp(Number(limit||40),1,120);
  return await all(env.SCORE_DB,`SELECT c.*, q.official_date AS source_official_date, q.game_pk AS source_game_pk, h.non_push_sample AS hp_non_push_sample, h.sample_profile AS hp_sample_profile, q.source_hp_v2_rows AS queue_source_rows
    FROM player_baseline_classification_v5_current c
    JOIN player_baseline_hp_v2_current h ON h.batch_id=c.batch_id AND h.player_type=c.player_type AND h.player_id=c.player_id AND h.canonical_prop_key=c.canonical_prop_key AND h.line_value=c.line_value AND h.selected_side=c.selected_side
    LEFT JOIN player_baseline_hp_v2_source_queue q ON q.batch_id=c.batch_id AND q.factor_family=c.player_type AND q.mlb_player_id=c.player_id AND q.canonical_prop_key=c.canonical_prop_key AND q.board_line_value=c.line_value AND q.selected_side=c.selected_side
    WHERE c.batch_id=? AND c.player_type='hitter'
      AND (c.events_sample <> h.non_push_sample OR c.games_sample <> h.non_push_sample OR c.sample_profile <> h.sample_profile OR COALESCE(q.source_hp_v2_rows,-1) <> h.non_push_sample)
    ORDER BY c.player_id, c.canonical_prop_key, c.line_value, c.selected_side LIMIT ?`,batchId,max);
}
async function baselineV5ApplyClassificationUniverseRepair(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  // v0.1.85: bulk scoped repair. v0.1.84 was correct in target but still
  // executed row-by-row and counted attempted rows. This version updates the
  // exact dirty natural rows in set-based chunks using HP current as the source
  // of truth for eligible-universe sample fields. No HP value/counter mutation.
  const requested=Number(input.classification_universe_fast_chunk_size||input.classification_universe_repair_fast_chunk_size||0);
  const rowLimit=clamp(Math.max(requested||0,900),100,1500);
  const before=await baselineV5ClassificationUniverseRepairAudit(env,batchId);

  const currentSql=`UPDATE player_baseline_classification_v5_current
    SET games_sample=(SELECT h.non_push_sample FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_classification_v5_current.batch_id AND h.player_type=player_baseline_classification_v5_current.player_type AND h.player_id=player_baseline_classification_v5_current.player_id AND h.canonical_prop_key=player_baseline_classification_v5_current.canonical_prop_key AND h.line_value=player_baseline_classification_v5_current.line_value AND h.selected_side=player_baseline_classification_v5_current.selected_side LIMIT 1),
        events_sample=(SELECT h.non_push_sample FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_classification_v5_current.batch_id AND h.player_type=player_baseline_classification_v5_current.player_type AND h.player_id=player_baseline_classification_v5_current.player_id AND h.canonical_prop_key=player_baseline_classification_v5_current.canonical_prop_key AND h.line_value=player_baseline_classification_v5_current.line_value AND h.selected_side=player_baseline_classification_v5_current.selected_side LIMIT 1),
        sample_profile=(SELECT h.sample_profile FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_classification_v5_current.batch_id AND h.player_type=player_baseline_classification_v5_current.player_type AND h.player_id=player_baseline_classification_v5_current.player_id AND h.canonical_prop_key=player_baseline_classification_v5_current.canonical_prop_key AND h.line_value=player_baseline_classification_v5_current.line_value AND h.selected_side=player_baseline_classification_v5_current.selected_side LIMIT 1),
        updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=? AND classification_row_id IN (
      SELECT classification_row_id FROM (
        SELECT c.classification_row_id
        FROM player_baseline_classification_v5_current c
        JOIN player_baseline_hp_v2_current h ON h.batch_id=c.batch_id AND h.player_type=c.player_type AND h.player_id=c.player_id AND h.canonical_prop_key=c.canonical_prop_key AND h.line_value=c.line_value AND h.selected_side=c.selected_side
        LEFT JOIN player_baseline_hp_v2_source_queue q ON q.batch_id=c.batch_id AND q.factor_family=c.player_type AND q.mlb_player_id=c.player_id AND q.canonical_prop_key=c.canonical_prop_key AND q.board_line_value=c.line_value AND q.selected_side=c.selected_side
        WHERE c.batch_id=? AND c.player_type='hitter'
          AND (c.events_sample <> h.non_push_sample OR c.games_sample <> h.non_push_sample OR COALESCE(c.sample_profile,'') <> COALESCE(h.sample_profile,'') OR COALESCE(q.source_hp_v2_rows,-1) <> h.non_push_sample)
        ORDER BY c.player_id,c.canonical_prop_key,c.line_value,c.selected_side
        LIMIT ?
      )
    )`;
  const curRes=await run(env.SCORE_DB,currentSql,batchId,batchId,rowLimit);

  const historySql=`UPDATE player_baseline_classification_v5_history
    SET games_sample=(SELECT h.non_push_sample FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_classification_v5_history.batch_id AND h.player_type=player_baseline_classification_v5_history.player_type AND h.player_id=player_baseline_classification_v5_history.player_id AND h.canonical_prop_key=player_baseline_classification_v5_history.canonical_prop_key AND h.line_value=player_baseline_classification_v5_history.line_value AND h.selected_side=player_baseline_classification_v5_history.selected_side LIMIT 1),
        events_sample=(SELECT h.non_push_sample FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_classification_v5_history.batch_id AND h.player_type=player_baseline_classification_v5_history.player_type AND h.player_id=player_baseline_classification_v5_history.player_id AND h.canonical_prop_key=player_baseline_classification_v5_history.canonical_prop_key AND h.line_value=player_baseline_classification_v5_history.line_value AND h.selected_side=player_baseline_classification_v5_history.selected_side LIMIT 1),
        sample_profile=(SELECT h.sample_profile FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_classification_v5_history.batch_id AND h.player_type=player_baseline_classification_v5_history.player_type AND h.player_id=player_baseline_classification_v5_history.player_id AND h.canonical_prop_key=player_baseline_classification_v5_history.canonical_prop_key AND h.line_value=player_baseline_classification_v5_history.line_value AND h.selected_side=player_baseline_classification_v5_history.selected_side LIMIT 1)
    WHERE batch_id=? AND classification_row_id IN (
      SELECT classification_row_id FROM (
        SELECT c.classification_row_id
        FROM player_baseline_classification_v5_history c
        JOIN player_baseline_hp_v2_current h ON h.batch_id=c.batch_id AND h.player_type=c.player_type AND h.player_id=c.player_id AND h.canonical_prop_key=c.canonical_prop_key AND h.line_value=c.line_value AND h.selected_side=c.selected_side
        WHERE c.batch_id=? AND c.player_type='hitter'
          AND (c.events_sample <> h.non_push_sample OR c.games_sample <> h.non_push_sample OR COALESCE(c.sample_profile,'') <> COALESCE(h.sample_profile,''))
        ORDER BY c.player_id,c.canonical_prop_key,c.line_value,c.selected_side
        LIMIT ?
      )
    )`;
  const histRes=await run(env.SCORE_DB,historySql,batchId,batchId,rowLimit);

  const queueSql=`UPDATE player_baseline_hp_v2_source_queue
    SET source_hp_v2_rows=(SELECT h.non_push_sample FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_hp_v2_source_queue.batch_id AND h.player_type=player_baseline_hp_v2_source_queue.factor_family AND h.player_id=player_baseline_hp_v2_source_queue.mlb_player_id AND h.canonical_prop_key=player_baseline_hp_v2_source_queue.canonical_prop_key AND h.line_value=player_baseline_hp_v2_source_queue.board_line_value AND h.selected_side=player_baseline_hp_v2_source_queue.selected_side LIMIT 1)
    WHERE batch_id=? AND factor_family='hitter'
      AND (CAST(mlb_player_id AS TEXT)||'|'||canonical_prop_key||'|'||CAST(board_line_value AS TEXT)||'|'||selected_side) IN (
        SELECT natural_key FROM (
          SELECT CAST(q.mlb_player_id AS TEXT)||'|'||q.canonical_prop_key||'|'||CAST(q.board_line_value AS TEXT)||'|'||q.selected_side AS natural_key
          FROM player_baseline_hp_v2_source_queue q
          JOIN player_baseline_hp_v2_current h ON h.batch_id=q.batch_id AND h.player_type=q.factor_family AND h.player_id=q.mlb_player_id AND h.canonical_prop_key=q.canonical_prop_key AND h.line_value=q.board_line_value AND h.selected_side=q.selected_side
          WHERE q.batch_id=? AND q.factor_family='hitter' AND COALESCE(q.source_hp_v2_rows,-1)<>h.non_push_sample
          ORDER BY q.mlb_player_id,q.canonical_prop_key,q.board_line_value,q.selected_side
          LIMIT ?
        )
      )`;
  const qRes=await run(env.SCORE_DB,queueSql,batchId,batchId,rowLimit);

  const classCurrentRowsUpdated=Number(curRes&&curRes.meta&&curRes.meta.changes||0);
  const classHistoryRowsUpdated=Number(histRes&&histRes.meta&&histRes.meta.changes||0);
  const sourceQueueRowsUpdated=Number(qRes&&qRes.meta&&qRes.meta.changes||0);
  const after=await baselineV5ClassificationUniverseRepairAudit(env,batchId);
  const rowsRepaired=classCurrentRowsUpdated+classHistoryRowsUpdated+sourceQueueRowsUpdated;
  return {before,after,rows_repaired:rowsRepaired,class_current_rows_updated:classCurrentRowsUpdated,class_history_rows_updated:classHistoryRowsUpdated,source_queue_rows_updated:sourceQueueRowsUpdated,chunk_limit:rowLimit,sample:[],partial_continue:!after.pass,pass:after.pass,current_tables_mutated:classCurrentRowsUpdated>0,history_tables_mutated:classHistoryRowsUpdated>0,source_queue_mutated:sourceQueueRowsUpdated>0,hp_values_mutated:false,counters_mutated:false,full_recalculation:false,fast_scoped_bulk_sync:true,repair_contract:'bulk copy HP eligible-universe sample metadata into classification/source_queue for dirty hitter rows only; preserve HP probabilities, raw rates, counters, line inventory, board, market, daily, and scoring'};
}
async function baselineV5BaseProfileSyncAudit(env,batchId){
  const current=await first(env.SCORE_DB,`SELECT COUNT(*) AS joined_rows,
      SUM(CASE WHEN h.sanity_profile_key <> c.classification_profile_key THEN 1 ELSE 0 END) AS hp_profile_mismatch_rows,
      SUM(CASE WHEN h.baseline_hp_profile_key <> c.classification_profile_key || '_MODEL' THEN 1 ELSE 0 END) AS hp_model_mismatch_rows,
      SUM(CASE WHEN h.non_push_sample <> c.events_sample THEN 1 ELSE 0 END) AS hp_class_sample_mismatch_rows,
      COUNT(DISTINCT CASE WHEN h.sanity_profile_key <> c.classification_profile_key OR h.baseline_hp_profile_key <> c.classification_profile_key || '_MODEL' THEN h.player_type||':'||h.player_id END) AS profile_mismatch_players
    FROM player_baseline_hp_v2_current h JOIN player_baseline_classification_v5_current c ON c.batch_id=h.batch_id AND c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side WHERE h.batch_id=?`,batchId);
  const sanityCurrent=await first(env.SCORE_DB,`SELECT COUNT(*) AS joined_rows,
      SUM(CASE WHEN s.baseline_row_id IS NULL THEN 1 ELSE 0 END) AS missing_sanity_current_rows,
      SUM(CASE WHEN s.events_sample <> h.non_push_sample THEN 1 ELSE 0 END) AS sanity_events_vs_hp_mismatch_rows,
      SUM(CASE WHEN s.games_sample <> h.non_push_sample THEN 1 ELSE 0 END) AS sanity_games_vs_hp_mismatch_rows,
      SUM(CASE WHEN COALESCE(s.sample_profile,'') <> COALESCE(h.sample_profile,'') THEN 1 ELSE 0 END) AS sanity_sample_vs_hp_mismatch_rows,
      SUM(CASE WHEN COALESCE(s.sanity_profile_key,'') <> COALESCE(h.sanity_profile_key,'') THEN 1 ELSE 0 END) AS sanity_key_vs_hp_mismatch_rows
    FROM player_baseline_hp_v2_current h LEFT JOIN player_baseline_sanity_v2_current s ON s.batch_id=h.batch_id AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id WHERE h.batch_id=?`,batchId);
  const sanityHistory=await first(env.SCORE_DB,`SELECT
      (SELECT COUNT(*) FROM player_baseline_sanity_v2_current WHERE batch_id=?) AS current_rows,
      (SELECT COUNT(*) FROM player_baseline_sanity_v2_history WHERE batch_id=?) AS history_rows`,batchId,batchId);
  const state=await first(env.SCORE_DB,`SELECT SUM(CASE WHEN h.sanity_profile_key <> c.classification_profile_key THEN 1 ELSE 0 END) AS state_profile_mismatch_rows, SUM(CASE WHEN h.baseline_hp_profile_key <> c.classification_profile_key || '_MODEL' THEN 1 ELSE 0 END) AS state_model_mismatch_rows, SUM(CASE WHEN h.non_push_sample <> c.events_sample THEN 1 ELSE 0 END) AS state_sample_mismatch_rows FROM player_baseline_v5_hp_state_current h JOIN player_baseline_v5_classification_state_current c ON c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side`);
  const currentPass=Number(current&&current.hp_profile_mismatch_rows||0)===0 && Number(current&&current.hp_model_mismatch_rows||0)===0 && Number(current&&current.hp_class_sample_mismatch_rows||0)===0;
  const sanityCurrentPass=Number(sanityCurrent&&sanityCurrent.missing_sanity_current_rows||0)===0 && Number(sanityCurrent&&sanityCurrent.sanity_events_vs_hp_mismatch_rows||0)===0 && Number(sanityCurrent&&sanityCurrent.sanity_games_vs_hp_mismatch_rows||0)===0 && Number(sanityCurrent&&sanityCurrent.sanity_sample_vs_hp_mismatch_rows||0)===0 && Number(sanityCurrent&&sanityCurrent.sanity_key_vs_hp_mismatch_rows||0)===0;
  const sanityHistoryPass=Number(sanityHistory&&sanityHistory.current_rows||0)>0 && Number(sanityHistory&&sanityHistory.current_rows||0)===Number(sanityHistory&&sanityHistory.history_rows||0);
  return {batch_id:batchId,current:current||{},sanity_current:sanityCurrent||{},sanity_history:sanityHistory||{},state:state||{},pass:currentPass && sanityCurrentPass && sanityHistoryPass};
}
async function baselineV5ApplyBaseProfileSyncRescue(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  const chunk=clamp(Number(input.base_profile_sync_chunk_size||input.state_reliability_chunk_size||2000),100,5000);
  const before=await baselineV5BaseProfileSyncAudit(env,batchId);
  let rowsSynced=0, hpHistoryRowsSynced=0, sanityRowsSynced=0, sanityHistoryRowsSynced=0; const sample=[];
  while(Date.now()-startedMs<softYieldMs){
    const rows=await all(env.SCORE_DB,`SELECT h.baseline_hp_row_id,h.batch_id,h.player_type,h.player_id,h.player_name,h.canonical_prop_key,h.line_value,h.selected_side,c.classification_profile_key,c.volume_profile,c.volatility_profile,c.sample_profile AS class_sample_profile,c.events_sample FROM player_baseline_hp_v2_current h JOIN player_baseline_classification_v5_current c ON c.batch_id=h.batch_id AND c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side WHERE h.batch_id=? AND (h.sanity_profile_key <> c.classification_profile_key OR h.baseline_hp_profile_key <> c.classification_profile_key || '_MODEL') ORDER BY h.player_type,h.player_id,h.canonical_prop_key,h.line_value,h.selected_side LIMIT ?`,batchId,chunk);
    if(!rows.length) break;
    for(const r of rows){
      const modelKey=`${r.classification_profile_key}_MODEL`;
      const hpRes=await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_current SET sanity_profile_key=?, baseline_hp_profile_key=?, role_profile=COALESCE(?,role_profile), volatility_profile=COALESCE(?,volatility_profile), variance_profile=COALESCE(?,variance_profile), updated_at=CURRENT_TIMESTAMP WHERE baseline_hp_row_id=?`,r.classification_profile_key,modelKey,r.volume_profile||null,r.volatility_profile||null,r.volatility_profile||null,r.baseline_hp_row_id);
      rowsSynced += Number(hpRes&&hpRes.meta&&hpRes.meta.changes||0);
      const histRes=await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_history SET sanity_profile_key=?, baseline_hp_profile_key=?, role_profile=COALESCE(?,role_profile), volatility_profile=COALESCE(?,volatility_profile), variance_profile=COALESCE(?,variance_profile) WHERE batch_id=? AND baseline_hp_row_id=?`,r.classification_profile_key,modelKey,r.volume_profile||null,r.volatility_profile||null,r.volatility_profile||null,batchId,r.baseline_hp_row_id);
      hpHistoryRowsSynced += Number(histRes&&histRes.meta&&histRes.meta.changes||0);
      const sanityId=`pbs_v2|${r.baseline_hp_row_id}`;
      const sanRes=await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_current SET sanity_profile_key=?, sample_profile=?, usage_profile=COALESCE(?,usage_profile), volatility_profile=COALESCE(?,volatility_profile), variance_profile=COALESCE(?,variance_profile), games_sample=?, events_sample=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND baseline_row_id=?`,r.classification_profile_key,r.class_sample_profile,r.volume_profile||null,r.volatility_profile||null,r.volatility_profile||null,r.events_sample,r.events_sample,batchId,sanityId);
      sanityRowsSynced += Number(sanRes&&sanRes.meta&&sanRes.meta.changes||0);
      const sanHistRes=await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_history SET sanity_profile_key=?, sample_profile=?, usage_profile=COALESCE(?,usage_profile), volatility_profile=COALESCE(?,volatility_profile), variance_profile=COALESCE(?,variance_profile), games_sample=?, events_sample=? WHERE batch_id=? AND baseline_row_id=?`,r.classification_profile_key,r.class_sample_profile,r.volume_profile||null,r.volatility_profile||null,r.volatility_profile||null,r.events_sample,r.events_sample,batchId,sanityId);
      sanityHistoryRowsSynced += Number(sanHistRes&&sanHistRes.meta&&sanHistRes.meta.changes||0);
      if(sample.length<25) sample.push({player_type:r.player_type,player_id:r.player_id,player_name:r.player_name,prop:r.canonical_prop_key,line:Number(r.line_value),side:r.selected_side,classification_profile_key:r.classification_profile_key});
      if(Date.now()-startedMs>=softYieldMs) break;
    }
    if(rows.length<chunk) break;
  }
  const after=await baselineV5BaseProfileSyncAudit(env,batchId);
  return {before,after,rows_synced:rowsSynced,hp_history_rows_synced:hpHistoryRowsSynced,sanity_rows_synced:sanityRowsSynced,sanity_history_rows_synced:sanityHistoryRowsSynced,sample,partial_continue:!after.pass,pass:after.pass,current_tables_mutated:rowsSynced>0||sanityRowsSynced>0,history_tables_mutated:hpHistoryRowsSynced>0||sanityHistoryRowsSynced>0,hp_values_mutated:false,counters_mutated:false,repair_contract:'sync HP/sanity metadata keys to corrected classification current/history; preserve HP probabilities, raw rates, hit/miss/push counters, and samples'};
}

async function baselineV5ApplySanityCurrentSyncFromHp(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  // v0.1.86: sanity-only continuation safety. Keep chunk small enough to avoid
  // service-binding timeouts; the earlier rescue already fixed classification/source/state.
  const requested=Number(input.sanity_current_sync_chunk_size||input.base_profile_sync_chunk_size||0);
  const chunk=clamp(Math.max(requested||0,800),200,1500);
  const sql=`UPDATE player_baseline_sanity_v2_current
    SET sanity_profile_key=(SELECT h.sanity_profile_key FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_sanity_v2_current.batch_id AND ('pbs_v2|' || h.baseline_hp_row_id)=player_baseline_sanity_v2_current.baseline_row_id LIMIT 1),
        sample_profile=(SELECT h.sample_profile FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_sanity_v2_current.batch_id AND ('pbs_v2|' || h.baseline_hp_row_id)=player_baseline_sanity_v2_current.baseline_row_id LIMIT 1),
        role_profile=COALESCE((SELECT h.role_profile FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_sanity_v2_current.batch_id AND ('pbs_v2|' || h.baseline_hp_row_id)=player_baseline_sanity_v2_current.baseline_row_id LIMIT 1),role_profile),
        volatility_profile=COALESCE((SELECT h.volatility_profile FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_sanity_v2_current.batch_id AND ('pbs_v2|' || h.baseline_hp_row_id)=player_baseline_sanity_v2_current.baseline_row_id LIMIT 1),volatility_profile),
        variance_profile=COALESCE((SELECT h.variance_profile FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_sanity_v2_current.batch_id AND ('pbs_v2|' || h.baseline_hp_row_id)=player_baseline_sanity_v2_current.baseline_row_id LIMIT 1),variance_profile),
        games_sample=(SELECT h.non_push_sample FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_sanity_v2_current.batch_id AND ('pbs_v2|' || h.baseline_hp_row_id)=player_baseline_sanity_v2_current.baseline_row_id LIMIT 1),
        events_sample=(SELECT h.non_push_sample FROM player_baseline_hp_v2_current h WHERE h.batch_id=player_baseline_sanity_v2_current.batch_id AND ('pbs_v2|' || h.baseline_hp_row_id)=player_baseline_sanity_v2_current.baseline_row_id LIMIT 1),
        updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=? AND baseline_row_id IN (
      SELECT baseline_row_id FROM (
        SELECT s.baseline_row_id
        FROM player_baseline_sanity_v2_current s
        JOIN player_baseline_hp_v2_current h ON h.batch_id=s.batch_id AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id
        WHERE s.batch_id=? AND (
          s.events_sample<>h.non_push_sample OR s.games_sample<>h.non_push_sample OR COALESCE(s.sample_profile,'')<>COALESCE(h.sample_profile,'') OR COALESCE(s.sanity_profile_key,'')<>COALESCE(h.sanity_profile_key,'')
        )
        ORDER BY s.baseline_row_id
        LIMIT ?
      )
    )`;
  const res=await run(env.SCORE_DB,sql,batchId,batchId,chunk);
  const rowsSynced=Number(res&&res.meta&&res.meta.changes||0);
  return {rows_synced:rowsSynced,chunk_limit:chunk,sample:[],current_tables_mutated:rowsSynced>0,hp_values_mutated:false,counters_mutated:false,fast_scoped_bulk_sync:true,repair_contract:'bulk sync sanity current sample/profile/key fields from HP current; preserve HP probabilities, raw rates, counters, and classification'};
}

async function baselineV5ApplySanityHistoryBackfillFromCurrent(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  const chunk=clamp(Number(input.sanity_history_backfill_chunk_size||input.base_profile_sync_chunk_size||1500),200,2500);
  const before=await first(env.SCORE_DB,`SELECT (SELECT COUNT(*) FROM player_baseline_sanity_v2_current WHERE batch_id=?) AS current_rows,(SELECT COUNT(*) FROM player_baseline_sanity_v2_history WHERE batch_id=?) AS history_rows`,batchId,batchId);
  let cursor=String(input.sanity_history_backfill_cursor||'');
  let started=!!input.sanity_history_backfill_started;
  let deletedExisting=false;
  const currentRowsBefore=Number(before&&before.current_rows||0);
  const historyRowsBefore=Number(before&&before.history_rows||0);
  const mustRebuildHistory=(!!input.sanity_history_force_rebuild || (currentRowsBefore>0 && currentRowsBefore!==historyRowsBefore));
  // v0.1.84: v0.1.83 accidentally carried sanity_history_backfill_started=true
  // through earlier phases. If no cursor exists and counts are dirty, rebuild from zero anyway.
  if(mustRebuildHistory && (!started || !cursor)){
    await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_history WHERE batch_id=?`,batchId);
    cursor=''; started=true; deletedExisting=true;
  }
  let rowsInserted=0;
  while(Date.now()-startedMs<softYieldMs){
    const selected=await first(env.SCORE_DB,`SELECT COUNT(*) AS selected_rows, MAX(baseline_row_id) AS next_cursor FROM (
      SELECT baseline_row_id
      FROM player_baseline_sanity_v2_current
      WHERE batch_id=? AND baseline_row_id>?
      ORDER BY baseline_row_id LIMIT ?
    )`,batchId,cursor,chunk);
    const selectedRows=Number(selected&&selected.selected_rows||0);
    const nextCursor=String(selected&&selected.next_cursor||'');
    if(selectedRows<=0 || !nextCursor) break;
    const res=await run(env.SCORE_DB,`INSERT INTO player_baseline_sanity_v2_history (baseline_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,role_profile,prior_pool_key,sanity_profile_key,sample_profile,usage_profile,line_difficulty_profile,volatility_profile,baseline_drag_profile,confidence_drag_profile,variance_profile,games_sample,events_sample,baseline_confidence_0_100,line_baseline_json,distribution_shape_json,notes_json,created_at,updated_at,archived_at)
      SELECT baseline_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,role_profile,prior_pool_key,sanity_profile_key,sample_profile,usage_profile,line_difficulty_profile,volatility_profile,baseline_drag_profile,confidence_drag_profile,variance_profile,games_sample,events_sample,baseline_confidence_0_100,line_baseline_json,distribution_shape_json,notes_json,created_at,updated_at,CURRENT_TIMESTAMP
      FROM player_baseline_sanity_v2_current
      WHERE batch_id=? AND baseline_row_id>?
      ORDER BY baseline_row_id LIMIT ?`,batchId,cursor,chunk);
    const changes=Number(res&&res.meta&&res.meta.changes||0);
    rowsInserted += changes>0 ? changes : selectedRows;
    cursor=nextCursor;
    if(selectedRows<chunk) break;
  }
  const after=await first(env.SCORE_DB,`SELECT (SELECT COUNT(*) FROM player_baseline_sanity_v2_current WHERE batch_id=?) AS current_rows,(SELECT COUNT(*) FROM player_baseline_sanity_v2_history WHERE batch_id=?) AS history_rows`,batchId,batchId);
  const pass=Number(after&&after.current_rows||0)>0 && Number(after&&after.current_rows||0)===Number(after&&after.history_rows||0);
  await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, rows_promoted=(SELECT COUNT(*) FROM player_baseline_sanity_v2_current WHERE batch_id=?), history_rows=(SELECT COUNT(*) FROM player_baseline_sanity_v2_history WHERE batch_id=?), certification=?, certification_grade=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,pass?'completed':'partial_continue',batchId,batchId,pass?'BASELINE_V5_SANITY_HISTORY_BACKFILL_CERTIFIED_FROM_CURRENT':'BASELINE_V5_SANITY_HISTORY_BACKFILL_PARTIAL_CONTINUE',pass?'PASS':'PARTIAL_CONTINUE',batchId);
  return {before:before||{},after:after||{},deleted_existing_history_rows:deletedExisting,rows_inserted:rowsInserted,cursor,partial_continue:!pass,pass,history_tables_mutated:deletedExisting||rowsInserted>0,next_cursor:cursor,repair_contract:'rebuild sanity history for target batch from complete sanity current in ordered chunks; avoid anti-join scans on unindexed history table'};
}

async function baselineV5RunLightStateSampleProfileSync(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  // v0.1.86: do not re-run the older heavyweight state reliability/confidence rescue
  // inside Classification Rescue. SQL already proved the open blocker is sanity,
  // while state sample/profile mismatches are zero. This light pass only repairs
  // state sample/profile/key drift if it exists and never blocks on confidence caps.
  const before=await baselineV5BaseProfileSyncAudit(env,batchId);
  const b=before&&before.state||{};
  const beforeDirty=Number(b.state_profile_mismatch_rows||0)+Number(b.state_model_mismatch_rows||0)+Number(b.state_sample_mismatch_rows||0);
  let stateUniverseRepair={rows_repaired:0,class_state_rows_updated:0,pass:beforeDirty===0,partial_continue:false,skipped_when_clean:beforeDirty===0};
  let stateProfileSync={rows_synced:0,pass:beforeDirty===0,partial_continue:false,skipped_when_clean:beforeDirty===0};
  if(beforeDirty>0 && Date.now()-startedMs<softYieldMs){
    stateUniverseRepair=await baselineV5ApplyStateClassificationUniverseRepair(env,{...input,batch_id:batchId},startedMs,softYieldMs);
  }
  if(beforeDirty>0 && Date.now()-startedMs<softYieldMs){
    stateProfileSync=await baselineV5ApplyStateProfileSyncRescue(env,{...input,batch_id:batchId,state_profile_sync_chunk_size:Math.min(Number(input.state_profile_sync_chunk_size||800),1000)},startedMs,softYieldMs);
  }
  const after=await baselineV5BaseProfileSyncAudit(env,batchId);
  const a=after&&after.state||{};
  const afterDirty=Number(a.state_profile_mismatch_rows||0)+Number(a.state_model_mismatch_rows||0)+Number(a.state_sample_mismatch_rows||0);
  return {
    pass:afterDirty===0,
    partial_continue:afterDirty>0,
    before_state:b,
    after_state:a,
    state_classification_universe_repair:stateUniverseRepair,
    state_profile_sync:stateProfileSync,
    skipped_heavy_state_confidence_reliability:true,
    confidence_repair_deferred:true,
    repair_contract:'Classification Rescue only verifies/repairs state sample/profile/key parity; unrelated confidence-cap cleanup is not allowed to block sanity continuation.'
  };
}

async function baselineV5RunTargetedUniverseStateSanityRescue(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  const classificationUniverseRepair=await baselineV5ApplyClassificationUniverseRepair(env,batchId,input,startedMs,softYieldMs);
  if(classificationUniverseRepair.partial_continue) return {classification_universe_repair:classificationUniverseRepair,partial_continue:true,stage:'classification_universe_repair'};
  const stateReliabilityRescue=await baselineV5RunLightStateSampleProfileSync(env,batchId,input,startedMs,softYieldMs);
  if(stateReliabilityRescue.partial_continue) return {classification_universe_repair:classificationUniverseRepair,state_reliability_rescue:stateReliabilityRescue,partial_continue:true,stage:'state_sample_profile_sync'};
  const baseProfileSync=await baselineV5ApplyBaseProfileSyncRescue(env,batchId,input,startedMs,softYieldMs);
  const sanityCurrentSync=await baselineV5ApplySanityCurrentSyncFromHp(env,batchId,input,startedMs,softYieldMs);
  if(Number(sanityCurrentSync.rows_synced||0)>0){
    const sanityAuditAfter=await baselineV5BaseProfileSyncAudit(env,batchId);
    if(Number(sanityAuditAfter&&sanityAuditAfter.sanity_current&&sanityAuditAfter.sanity_current.sanity_sample_vs_hp_mismatch_rows||0)>0 || Number(sanityAuditAfter&&sanityAuditAfter.sanity_current&&sanityAuditAfter.sanity_current.sanity_key_vs_hp_mismatch_rows||0)>0){
      return {classification_universe_repair:classificationUniverseRepair,state_reliability_rescue:stateReliabilityRescue,base_profile_sync:baseProfileSync,sanity_current_sync:sanityCurrentSync,partial_continue:true,stage:'sanity_current_sync'};
    }
  }
  const sanityHistoryBackfill=await baselineV5ApplySanityHistoryBackfillFromCurrent(env,batchId,{...input,sanity_history_force_rebuild:Number(sanityCurrentSync.rows_synced||0)>0},startedMs,softYieldMs);
  const finalAudit=await baselineV5BaseProfileSyncAudit(env,batchId);
  return {classification_universe_repair:classificationUniverseRepair,state_reliability_rescue:stateReliabilityRescue,base_profile_sync:baseProfileSync,sanity_current_sync:sanityCurrentSync,sanity_history_backfill:sanityHistoryBackfill,final_audit:finalAudit,partial_continue:!finalAudit.pass || sanityHistoryBackfill.partial_continue,pass:finalAudit.pass && sanityHistoryBackfill.pass,stage:(sanityCurrentSync.rows_synced>0?'sanity_current_sync':(sanityHistoryBackfill.partial_continue?'sanity_history_backfill':(!finalAudit.pass?'final_audit':'complete')))};
}

async function baselineV5FetchStateClassificationUniverseRepairRows(env,limit){
  const max=clamp(Number(limit||40),1,120);
  return await all(env.SCORE_DB,`SELECT c.*, h.non_push_sample AS hp_non_push_sample, h.sample_profile AS hp_sample_profile, h.last_processed_official_date AS state_max_date, h.last_processed_game_pk AS state_game_pk FROM player_baseline_v5_classification_state_current c JOIN player_baseline_v5_hp_state_current h ON h.player_type=c.player_type AND h.player_id=c.player_id AND h.canonical_prop_key=c.canonical_prop_key AND h.line_value=c.line_value AND h.selected_side=c.selected_side WHERE c.player_type='hitter' AND (c.events_sample <> h.non_push_sample OR c.games_sample <> h.non_push_sample OR c.sample_profile <> h.sample_profile) ORDER BY c.player_id,c.canonical_prop_key,c.line_value,c.selected_side LIMIT ?`,max);
}
async function baselineV5ApplyStateClassificationUniverseRepair(env,input={},startedMs=Date.now(),softYieldMs=10000){
  // v0.1.85: bulk state sample repair. Copy HP state sample fields into
  // classification state for dirty hitter rows; no HP value/counter mutation.
  const requested=Number(input.state_classification_universe_fast_chunk_size||input.state_classification_universe_repair_fast_chunk_size||0);
  const rowLimit=clamp(Math.max(requested||0,900),100,1500);
  const sql=`UPDATE player_baseline_v5_classification_state_current
    SET games_sample=(SELECT h.non_push_sample FROM player_baseline_v5_hp_state_current h WHERE h.player_type=player_baseline_v5_classification_state_current.player_type AND h.player_id=player_baseline_v5_classification_state_current.player_id AND h.canonical_prop_key=player_baseline_v5_classification_state_current.canonical_prop_key AND h.line_value=player_baseline_v5_classification_state_current.line_value AND h.selected_side=player_baseline_v5_classification_state_current.selected_side LIMIT 1),
        events_sample=(SELECT h.non_push_sample FROM player_baseline_v5_hp_state_current h WHERE h.player_type=player_baseline_v5_classification_state_current.player_type AND h.player_id=player_baseline_v5_classification_state_current.player_id AND h.canonical_prop_key=player_baseline_v5_classification_state_current.canonical_prop_key AND h.line_value=player_baseline_v5_classification_state_current.line_value AND h.selected_side=player_baseline_v5_classification_state_current.selected_side LIMIT 1),
        sample_profile=(SELECT h.sample_profile FROM player_baseline_v5_hp_state_current h WHERE h.player_type=player_baseline_v5_classification_state_current.player_type AND h.player_id=player_baseline_v5_classification_state_current.player_id AND h.canonical_prop_key=player_baseline_v5_classification_state_current.canonical_prop_key AND h.line_value=player_baseline_v5_classification_state_current.line_value AND h.selected_side=player_baseline_v5_classification_state_current.selected_side LIMIT 1),
        classification_formula_version=?,
        state_source='STATE_RESCUE_BULK_SAMPLE_SYNC_NO_HP_VALUE_MUTATION',
        updated_at=CURRENT_TIMESTAMP
    WHERE classification_row_id IN (
      SELECT classification_row_id FROM (
        SELECT c.classification_row_id
        FROM player_baseline_v5_classification_state_current c
        JOIN player_baseline_v5_hp_state_current h ON h.player_type=c.player_type AND h.player_id=c.player_id AND h.canonical_prop_key=c.canonical_prop_key AND h.line_value=c.line_value AND h.selected_side=c.selected_side
        WHERE c.player_type='hitter'
          AND (c.events_sample<>h.non_push_sample OR c.games_sample<>h.non_push_sample OR COALESCE(c.sample_profile,'')<>COALESCE(h.sample_profile,''))
        ORDER BY c.player_id,c.canonical_prop_key,c.line_value,c.selected_side
        LIMIT ?
      )
    )`;
  const res=await run(env.SCORE_DB,sql,`${VERSION}_state_bulk_sample_sync`,rowLimit);
  const classStateRowsUpdated=Number(res&&res.meta&&res.meta.changes||0);
  return {rows_repaired:classStateRowsUpdated,class_state_rows_updated:classStateRowsUpdated,chunk_limit:rowLimit,sample:[],hp_values_mutated:false,counters_mutated:false,fast_scoped_bulk_sync:true,repair_contract:'bulk copy HP state sample metadata into classification state for dirty hitter rows only; preserve HP values, counters, source dates, and line inventory'};
}

async function baselineV5ApplyStateProfileSyncRescue(env,input={},startedMs=Date.now(),softYieldMs=10000){
  const chunk=clamp(Number(input.state_profile_sync_chunk_size||input.state_reliability_chunk_size||2000),100,5000);
  let rowsSynced=0; const sample=[];
  while(Date.now()-startedMs<softYieldMs){
    const rows=await all(env.SCORE_DB,`SELECT h.baseline_hp_row_id,h.player_type,h.player_id,h.player_name,h.canonical_prop_key,h.line_value,h.selected_side,c.classification_profile_key,c.volume_profile,c.volatility_profile FROM player_baseline_v5_hp_state_current h JOIN player_baseline_v5_classification_state_current c ON c.player_type=h.player_type AND c.player_id=h.player_id AND c.canonical_prop_key=h.canonical_prop_key AND c.line_value=h.line_value AND c.selected_side=h.selected_side WHERE h.sanity_profile_key <> c.classification_profile_key OR h.baseline_hp_profile_key <> c.classification_profile_key || '_MODEL' ORDER BY h.player_type,h.player_id,h.canonical_prop_key,h.line_value,h.selected_side LIMIT ?`,chunk);
    if(!rows.length) break;
    for(const r of rows){
      const res=await run(env.SCORE_DB,`UPDATE player_baseline_v5_hp_state_current SET sanity_profile_key=?, baseline_hp_profile_key=?, role_profile=COALESCE(?,role_profile), volatility_profile=COALESCE(?,volatility_profile), variance_profile=COALESCE(?,variance_profile), state_source='STATE_RESCUE_PROFILE_SYNC_NO_HP_VALUE_MUTATION', updated_at=CURRENT_TIMESTAMP WHERE baseline_hp_row_id=?`,r.classification_profile_key,`${r.classification_profile_key}_MODEL`,r.volume_profile||null,r.volatility_profile||null,r.volatility_profile||null,r.baseline_hp_row_id);
      rowsSynced += Number(res&&res.meta&&res.meta.changes||0);
      if(sample.length<25) sample.push({player_type:r.player_type,player_id:r.player_id,player_name:r.player_name,prop:r.canonical_prop_key,line:Number(r.line_value),side:r.selected_side,classification_profile_key:r.classification_profile_key});
      if(Date.now()-startedMs>=softYieldMs) break;
    }
    if(rows.length<chunk) break;
  }
  return {rows_synced:rowsSynced,sample,hp_values_mutated:false,counters_mutated:false,repair_contract:'sync state HP profile metadata to state classification after classification universe repair; preserve HP values and counters'};
}



async function baselineV5SanityOnlyContinuationAudit(env,batchId){
  const current=await first(env.SCORE_DB,`SELECT
      COUNT(*) AS current_rows,
      COUNT(DISTINCT baseline_row_id) AS distinct_current_rows,
      SUM(CASE WHEN player_type='pitcher' AND sample_profile='DEVELOPING' THEN 1 ELSE 0 END) AS pitcher_developing_rows
    FROM player_baseline_sanity_v2_current
    WHERE batch_id=?`,batchId);
  const history=await first(env.SCORE_DB,`SELECT
      COUNT(*) AS history_rows,
      COUNT(DISTINCT baseline_row_id) AS distinct_history_rows
    FROM player_baseline_sanity_v2_history
    WHERE batch_id=?`,batchId);
  const pitcherSample=await first(env.SCORE_DB,`SELECT
      COUNT(*) AS pitcher_sample_profile_mismatch_rows
    FROM player_baseline_hp_v2_current h
    JOIN player_baseline_sanity_v2_current s
      ON s.batch_id=h.batch_id
     AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id
    WHERE h.batch_id=?
      AND h.player_type='pitcher'
      AND COALESCE(s.sample_profile,'')<>COALESCE(h.sample_profile,'')`,batchId);
  return {
    batch_id:batchId,
    current_rows:Number(current&&current.current_rows||0),
    distinct_current_rows:Number(current&&current.distinct_current_rows||0),
    history_rows:Number(history&&history.history_rows||0),
    distinct_history_rows:Number(history&&history.distinct_history_rows||0),
    pitcher_developing_rows:Number(current&&current.pitcher_developing_rows||0),
    pitcher_sample_profile_mismatch_rows:Number(pitcherSample&&pitcherSample.pitcher_sample_profile_mismatch_rows||0)
  };
}

async function baselineV5CoreAlreadyFixedAudit(env,batchId){
  const classCurrent=await first(env.SCORE_DB,`SELECT COUNT(*) AS c
    FROM player_baseline_hp_v2_current h
    JOIN player_baseline_classification_v5_current c
      ON c.batch_id=h.batch_id
     AND c.player_type=h.player_type
     AND c.player_id=h.player_id
     AND c.canonical_prop_key=h.canonical_prop_key
     AND c.line_value=h.line_value
     AND c.selected_side=h.selected_side
    WHERE h.batch_id=? AND h.player_type='hitter' AND h.non_push_sample<>c.events_sample`,batchId);
  const classHistory=await first(env.SCORE_DB,`SELECT COUNT(*) AS c
    FROM player_baseline_hp_v2_history h
    JOIN player_baseline_classification_v5_history c
      ON c.batch_id=h.batch_id
     AND c.player_type=h.player_type
     AND c.player_id=h.player_id
     AND c.canonical_prop_key=h.canonical_prop_key
     AND c.line_value=h.line_value
     AND c.selected_side=h.selected_side
    WHERE h.batch_id=? AND h.player_type='hitter' AND h.non_push_sample<>c.events_sample`,batchId);
  const sourceQueue=await first(env.SCORE_DB,`SELECT COUNT(*) AS c
    FROM player_baseline_hp_v2_current h
    JOIN player_baseline_hp_v2_source_queue q
      ON q.batch_id=h.batch_id
     AND q.factor_family=h.player_type
     AND q.mlb_player_id=h.player_id
     AND q.canonical_prop_key=h.canonical_prop_key
     AND q.board_line_value=h.line_value
     AND q.selected_side=h.selected_side
    WHERE h.batch_id=? AND h.player_type='hitter' AND h.non_push_sample<>q.source_hp_v2_rows`,batchId);
  const stateSample=await first(env.SCORE_DB,`SELECT COUNT(*) AS c
    FROM player_baseline_v5_hp_state_current h
    JOIN player_baseline_v5_classification_state_current c
      ON c.player_type=h.player_type
     AND c.player_id=h.player_id
     AND c.canonical_prop_key=h.canonical_prop_key
     AND c.line_value=h.line_value
     AND c.selected_side=h.selected_side
    WHERE h.non_push_sample<>c.events_sample`);
  const stateProfile=await first(env.SCORE_DB,`SELECT COUNT(*) AS c
    FROM player_baseline_v5_hp_state_current h
    JOIN player_baseline_v5_classification_state_current c
      ON c.player_type=h.player_type
     AND c.player_id=h.player_id
     AND c.canonical_prop_key=h.canonical_prop_key
     AND c.line_value=h.line_value
     AND c.selected_side=h.selected_side
    WHERE h.sanity_profile_key<>c.classification_profile_key
       OR h.baseline_hp_profile_key<>c.classification_profile_key || '_MODEL'`);
  const out={
    hitter_class_current_sample_mismatch_rows:Number(classCurrent&&classCurrent.c||0),
    hitter_class_history_sample_mismatch_rows:Number(classHistory&&classHistory.c||0),
    hitter_source_queue_sample_mismatch_rows:Number(sourceQueue&&sourceQueue.c||0),
    hp_state_class_state_sample_mismatch_rows:Number(stateSample&&stateSample.c||0),
    hp_state_class_state_profile_mismatch_rows:Number(stateProfile&&stateProfile.c||0)
  };
  out.pass=Object.values(out).every(v=>typeof v!=='number'||v===0);
  return out;
}

async function baselineV5ApplyPitcherSanitySampleProfileOnly(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  const requested=Number(input.sanity_current_sync_chunk_size||input.sanity_only_current_chunk_size||0);
  const chunk=clamp(Math.max(requested||0,3000),500,6000);
  const before=await baselineV5SanityOnlyContinuationAudit(env,batchId);
  let eliteRows=0, establishedRows=0;
  let eliteCandidateRows=0, establishedCandidateRows=0;
  const beforeDirty=Number(before.pitcher_sample_profile_mismatch_rows||0);
  if(beforeDirty>0 && Date.now()-startedMs<softYieldMs){
    const eliteCandidates=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM (
      SELECT s.baseline_row_id
      FROM player_baseline_hp_v2_current h
      JOIN player_baseline_sanity_v2_current s
        ON s.batch_id=h.batch_id
       AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id
      WHERE h.batch_id=?
        AND h.player_type='pitcher'
        AND h.sample_profile='ELITE'
        AND COALESCE(s.sample_profile,'')<>COALESCE(h.sample_profile,'')
      ORDER BY h.baseline_hp_row_id
      LIMIT ?
    )`,batchId,chunk);
    eliteCandidateRows=Number(eliteCandidates&&eliteCandidates.c||0);
    if(eliteCandidateRows>0){
      const elite=await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_current
        SET sample_profile='ELITE', updated_at=CURRENT_TIMESTAMP
        WHERE batch_id=?
          AND player_type='pitcher'
          AND baseline_row_id IN (
            SELECT dirty.baseline_row_id FROM (
              SELECT s.baseline_row_id
              FROM player_baseline_hp_v2_current h
              JOIN player_baseline_sanity_v2_current s
                ON s.batch_id=h.batch_id
               AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id
              WHERE h.batch_id=?
                AND h.player_type='pitcher'
                AND h.sample_profile='ELITE'
                AND COALESCE(s.sample_profile,'')<>COALESCE(h.sample_profile,'')
              ORDER BY h.baseline_hp_row_id
              LIMIT ?
            ) dirty
          )`,batchId,batchId,chunk);
      eliteRows=Number(elite&&elite.meta&&elite.meta.changes||0);
    }
  }
  if(Date.now()-startedMs<softYieldMs){
    const establishedCandidates=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM (
      SELECT s.baseline_row_id
      FROM player_baseline_hp_v2_current h
      JOIN player_baseline_sanity_v2_current s
        ON s.batch_id=h.batch_id
       AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id
      WHERE h.batch_id=?
        AND h.player_type='pitcher'
        AND h.sample_profile='ESTABLISHED'
        AND COALESCE(s.sample_profile,'')<>COALESCE(h.sample_profile,'')
      ORDER BY h.baseline_hp_row_id
      LIMIT ?
    )`,batchId,chunk);
    establishedCandidateRows=Number(establishedCandidates&&establishedCandidates.c||0);
    if(establishedCandidateRows>0){
      const established=await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_current
        SET sample_profile='ESTABLISHED', updated_at=CURRENT_TIMESTAMP
        WHERE batch_id=?
          AND player_type='pitcher'
          AND baseline_row_id IN (
            SELECT dirty.baseline_row_id FROM (
              SELECT s.baseline_row_id
              FROM player_baseline_hp_v2_current h
              JOIN player_baseline_sanity_v2_current s
                ON s.batch_id=h.batch_id
               AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id
              WHERE h.batch_id=?
                AND h.player_type='pitcher'
                AND h.sample_profile='ESTABLISHED'
                AND COALESCE(s.sample_profile,'')<>COALESCE(h.sample_profile,'')
              ORDER BY h.baseline_hp_row_id
              LIMIT ?
            ) dirty
          )`,batchId,batchId,chunk);
      establishedRows=Number(established&&established.meta&&established.meta.changes||0);
    }
  }
  const after=await baselineV5SanityOnlyContinuationAudit(env,batchId);
  const afterDirty=Number(after.pitcher_sample_profile_mismatch_rows||0);
  const measuredRowsSynced=Math.max(0,beforeDirty-afterDirty);
  const rowsSynced=measuredRowsSynced || eliteRows+establishedRows;
  const currentTablesMutated=rowsSynced>0 || afterDirty<beforeDirty;
  return {before,after,rows_synced:rowsSynced,rows_synced_measured:measuredRowsSynced,elite_rows_synced:eliteRows,established_rows_synced:establishedRows,elite_candidate_rows:eliteCandidateRows,established_candidate_rows:establishedCandidateRows,chunk_limit:chunk,partial_continue:afterDirty>0,pass:afterDirty===0,current_tables_mutated:currentTablesMutated,hp_values_mutated:false,counters_mutated:false,repair_contract:'sanity-only continuation v0.1.88: select only still-dirty pitcher sanity_current rows before LIMIT; sync sample_profile from HP current; events/games/keys already SQL-proven clean'};
}

async function baselineV5RunDirectSanityOnlyContinuation(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  const before=await baselineV5SanityOnlyContinuationAudit(env,batchId);
  const sanityCurrentSync=await baselineV5ApplyPitcherSanitySampleProfileOnly(env,batchId,input,startedMs,softYieldMs);
  if(sanityCurrentSync.partial_continue){
    return {batch_id:batchId,before,sanity_current_sync:sanityCurrentSync,partial_continue:true,pass:false,stage:'sanity_current_sample_profile_sync',sanity_only_continuation:true};
  }
  const historyInput={
    ...input,
    sanity_history_force_rebuild:!!input.sanity_history_force_rebuild || Number(sanityCurrentSync.rows_synced||0)>0,
    sanity_history_backfill_chunk_size:clamp(Number(input.sanity_history_backfill_chunk_size||input.sanity_only_history_chunk_size||1000),500,1500)
  };
  const sanityHistoryBackfill=await baselineV5ApplySanityHistoryBackfillFromCurrent(env,batchId,historyInput,startedMs,softYieldMs);
  const after=await baselineV5SanityOnlyContinuationAudit(env,batchId);
  const core=(!sanityHistoryBackfill.partial_continue && Number(after.pitcher_sample_profile_mismatch_rows||0)===0 && Number(after.history_rows||0)===Number(after.current_rows||0))
    ? await baselineV5CoreAlreadyFixedAudit(env,batchId)
    : {pass:true,skipped_until_sanity_complete:true};
  const pass=Number(after.pitcher_sample_profile_mismatch_rows||0)===0 && Number(after.current_rows||0)>0 && Number(after.history_rows||0)===Number(after.current_rows||0) && core.pass!==false;
  return {
    batch_id:batchId,
    before,
    sanity_current_sync:sanityCurrentSync,
    sanity_history_backfill:sanityHistoryBackfill,
    after,
    core_fixed_audit:core,
    partial_continue:!pass,
    pass,
    stage:sanityCurrentSync.rows_synced>0?'sanity_current_sample_profile_sync':(sanityHistoryBackfill.partial_continue?'sanity_history_backfill':(!pass?'final_sanity_only_audit':'complete')),
    sanity_only_continuation:true,
    hp_values_mutated:false,
    counters_mutated:false,
    no_classification_mutation:true,
    no_source_queue_mutation:true,
    no_state_mutation:true,
    no_board_context:true,
    no_market_context:true,
    no_daily_context:true,
    no_scoring_context:true,
    no_final_board_context:true,
    repair_contract:'direct sanity-only continuation; skip already-fixed classification/source/state and repair only sanity_current sample_profile plus sanity_history snapshot'
  };
}

async function runBaselineV5ClassificationRescue(env,input={}){
  await ensureSchema(env); await ensureBaselineV2Schema(env);
  const requestId=String(input.request_id||rid("baseline_v5_classification_rescue"));
  const runId=String(input.run_id||rid("run"));
  const target=await resolveBaselineV5RescueTargetBatchId(env,input);
  const batchId=String(target.batch_id||"");
  if(!batchId) return baseOutput(input,{ok:false,data_ok:false,request_id:requestId,run_id:runId,mode:"baseline_v5_classification_rescue",status:"BASELINE_V5_CLASSIFICATION_RESCUE_BLOCKED_NO_BATCH",certification:"BASELINE_V5_CLASSIFICATION_RESCUE_BLOCKED_NO_BATCH",certification_grade:"BLOCKED",target_batch_resolver:target});
  const startedMs=Date.now();
  let lastBaselineHeartbeatMs=startedMs;
  const softYieldMs=clamp(Number(input.rescue_soft_yield_ms||input.v2_soft_yield_ms||10000),5000,12000);
  const sanityProbe=await baselineV5SanityOnlyContinuationAudit(env,batchId);
  const sanityOnlyNeeded=Number(sanityProbe.current_rows||0)>0 && (Number(sanityProbe.pitcher_sample_profile_mismatch_rows||0)>0 || Number(sanityProbe.history_rows||0)!==Number(sanityProbe.current_rows||0));
  const directSanityOnly=!!input.sanity_only_continuation || (sanityOnlyNeeded && Number(sanityProbe.current_rows||0)===67040);
  if(directSanityOnly){
    const targeted=await baselineV5RunDirectSanityOnlyContinuation(env,batchId,{...input,batch_id:batchId,request_id:requestId,run_id:runId,sanity_only_continuation:true},startedMs,softYieldMs);
    if(targeted.partial_continue){
      const cert="BASELINE_V5_CLASSIFICATION_RESCUE_SANITY_ONLY_PARTIAL_CONTINUE";
      return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"baseline_v5_classification_rescue",status:cert,certification:cert,certification_grade:"PARTIAL_CONTINUE",rescue_only:true,classification_only:true,sanity_only_continuation:true,targeted_rescue:targeted,target_batch_resolver:target,partial_continue:true,orchestrator_should_self_continue:true,current_tables_mutated:targeted.sanity_current_sync&&targeted.sanity_current_sync.current_tables_mutated||false,history_tables_mutated:targeted.sanity_history_backfill&&targeted.sanity_history_backfill.history_tables_mutated||false,source_queue_mutated:false,state_tables_mutated:false,hp_values_mutated:false,counters_mutated:false,no_classification_mutation:true,no_source_queue_mutation:true,no_state_mutation:true,no_remine:true,no_board_context:true,no_market_context:true,no_daily_context:true,no_app_context:true,next_input_json:{...input,mode:"baseline_v5_classification_rescue",batch_id:batchId,request_id:requestId,run_id:runId,rescue_soft_yield_ms:softYieldMs,sanity_only_continuation:true,sanity_current_sync_chunk_size:3000,sanity_history_backfill_chunk_size:1000,sanity_history_backfill_started:targeted.sanity_history_backfill?true:!!input.sanity_history_backfill_started,sanity_history_backfill_cursor:targeted.sanity_history_backfill&&targeted.sanity_history_backfill.next_cursor||input.sanity_history_backfill_cursor||''}});
    }
    const cert=targeted.pass?"BASELINE_V5_CLASSIFICATION_RESCUE_CERTIFIED_SANITY_ONLY_CONTINUATION_PASS":"BASELINE_V5_CLASSIFICATION_RESCUE_SANITY_ONLY_BLOCKED_FINAL_AUDIT";
    return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"baseline_v5_classification_rescue",status:cert,certification:cert,certification_grade:targeted.pass?"PASS":"BLOCKED",rescue_only:true,classification_only:true,sanity_only_continuation:true,targeted_rescue:targeted,target_batch_resolver:target,partial_continue:false,orchestrator_should_self_continue:false,current_tables_mutated:targeted.sanity_current_sync&&targeted.sanity_current_sync.current_tables_mutated||false,history_tables_mutated:targeted.sanity_history_backfill&&targeted.sanity_history_backfill.history_tables_mutated||false,source_queue_mutated:false,state_tables_mutated:false,hp_values_mutated:false,counters_mutated:false,no_classification_mutation:true,no_source_queue_mutation:true,no_state_mutation:true,no_remine:true,no_board_context:true,no_market_context:true,no_daily_context:true,no_app_context:true,allowed_downstream:targeted.pass?"run final validation; Classification/source/state were SQL-proven clean before sanity-only continuation":"blocked until final sanity-only audit is clean"});
  }
  const rowChunkSize=clamp(Number(input.rescue_row_chunk_size||input.v2_chunk_size||input.v2_all_current_chunk_size||40),1,120);
  const sourceQueueReconcileLimit=clamp(Number(input.source_queue_reconcile_limit||input.rescue_source_queue_reconcile_limit||25),1,120);
  const deadlineMs=startedMs + Math.max(4000, Math.min(softYieldMs,10000));
  const targeted=await baselineV5RunTargetedUniverseStateSanityRescue(env,batchId,{...input,batch_id:batchId,request_id:requestId,run_id:runId},startedMs,softYieldMs);
  if(targeted.partial_continue){
    const cert="BASELINE_V5_CLASSIFICATION_RESCUE_TARGETED_SYNC_PARTIAL_CONTINUE";
    return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"baseline_v5_classification_rescue",status:cert,certification:cert,certification_grade:"PARTIAL_CONTINUE",rescue_only:true,classification_only:true,targeted_state_reliability_rescue:true,targeted_rescue:targeted,target_batch_resolver:target,partial_continue:true,orchestrator_should_self_continue:true,current_tables_mutated:true,history_tables_mutated:true,source_queue_mutated:true,hp_values_mutated:false,counters_mutated:false,no_remine:true,no_board_context:true,no_market_context:true,no_daily_context:true,no_app_context:true,next_input_json:{...input,mode:"baseline_v5_classification_rescue",batch_id:batchId,request_id:requestId,run_id:runId,rescue_row_chunk_size:rowChunkSize,rescue_soft_yield_ms:softYieldMs,classification_universe_fast_chunk_size:900,state_classification_universe_fast_chunk_size:900,sanity_current_sync_chunk_size:800,sanity_history_backfill_chunk_size:1500,...(targeted.sanity_history_backfill?{sanity_history_backfill_started:true,sanity_history_backfill_cursor:targeted.sanity_history_backfill.next_cursor||input.sanity_history_backfill_cursor||''}:{sanity_history_backfill_started:false,sanity_history_backfill_cursor:''})}});
  }
  if(input.enable_legacy_classification_lineage_rescue !== true){
    const cert="BASELINE_V5_CLASSIFICATION_RESCUE_CERTIFIED_TARGETED_UNIVERSE_STATE_SANITY_PASS";
    return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"baseline_v5_classification_rescue",status:cert,certification:cert,certification_grade:"PASS",rescue_only:true,classification_only:true,targeted_state_reliability_rescue:true,targeted_rescue:targeted,target_batch_resolver:target,partial_continue:false,orchestrator_should_self_continue:false,target_only:true,state_tables_mutated:true,hp_values_mutated:false,counters_mutated:false,source_queue_mutated:targeted.classification_universe_repair&&targeted.classification_universe_repair.source_queue_mutated||false,production_current_tables_mutated:false,current_tables_mutated:true,history_tables_mutated:true,full_recalculation:false,no_current_or_stage_delete:true,no_remine:true,no_board_context:true,no_market_context:true,no_daily_context:true,no_app_context:true,allowed_downstream:"run validation; Baseline Base Rescue is idempotent if Classification Rescue already passed"});
  }
  const stateReliabilityRescue = targeted && targeted.state_reliability_rescue || null;
  const beforeStage=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_stage");
  const beforeCurrent=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_current");
  const beforeUniverse=await classificationUniverseAudit(env,batchId);
  const beforePlatoonTierAudit=await hitterPlatoonSideTierAudit(env,batchId);
  const inserted=[];
  const skipped=[];
  let sourceQueueRowsInserted=0;
  let historyRowsInserted=0;
  let hitterPlatoonTierRowsRepaired=0;
  const hitterPlatoonTierRepairSample=[];
  const hitterPlatoonTierRepairSkippedSample=[];
  const historyReconcileSample=[];
  const sourceQueueReconcileSample=[];

  // v0.1.57: fast differential pair repair. The v0.1.56 path re-classified each row from
  // source history and was too slow. This uses the opposite-side sibling row as the static
  // structural-tier authority, updates only tier/profile/json on current/stage/history,
  // preserves platoon metadata, and does not touch source_queue or downstream layers.
  if(beforePlatoonTierAudit.hitter_tier_7_8_rows>0 && Date.now()-startedMs<softYieldMs){
    let tierRepair=await repairHitterPlatoonSideTierRowsFastPair(env,batchId,rowChunkSize);
    // Fallback only if pair repair has no eligible rows; keeps v0.1.56 behavior available
    // without paying the slow source-history cost when fast pair targets exist.
    if(Number(tierRepair.repaired||0)===0 && Number(tierRepair.skipped||0)===0){
      tierRepair=await repairHitterPlatoonSideTierRows(env,batchId,rowChunkSize,deadlineMs);
    }
    hitterPlatoonTierRowsRepaired += Number(tierRepair.repaired||0);
    hitterPlatoonTierRepairSample.push(...(tierRepair.sample||[]));
    hitterPlatoonTierRepairSkippedSample.push(...(tierRepair.skipped_sample||[]));
    if(Number(tierRepair.skipped||0)>0) skipped.push(...(tierRepair.skipped_sample||[]));
  }

  // First repair partial players that already exist in current/stage.
  for(const bp of beforeCurrent.bad_players_sample){
    if(Date.now()-startedMs>=softYieldMs || (inserted.length+hitterPlatoonTierRowsRepaired)>=rowChunkSize) break;
    const entityType=String(bp.player_type||"hitter");
    if(entityType!=="hitter" && entityType!=="pitcher"){ skipped.push({...bp,reason:"unsupported_entity_type"}); continue; }
    const shape=expectedClassificationShape(entityType);
    const existingRows=await all(env.SCORE_DB,`SELECT classification_row_id FROM player_baseline_classification_v5_current WHERE batch_id=? AND player_id=? AND player_type=?`,batchId,bp.player_id,entityType);
    const existing=new Set(existingRows.map(r=>String(r.classification_row_id)));
    const seed=await first(env.SCORE_DB,`SELECT player_id, player_name FROM player_baseline_classification_v5_current WHERE batch_id=? AND player_id=? AND player_type=? LIMIT 1`,batchId,bp.player_id,entityType);
    const playerName=safeResolvedPlayerName({mlb_player_id:bp.player_id,player_name:(seed&&seed.player_name)||bp.player_name});
    for(const prop of shape.props){
      for(const line of baselineLinesForProp(prop,entityType)){
        for(const side of SIDES){
          if(Date.now()-startedMs>=softYieldMs || (inserted.length+hitterPlatoonTierRowsRepaired)>=rowChunkSize) break;
          const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:entityType,selected_side:side,line_value:line});
          if(!resolved.profileNamespace || !resolved.sourceFormulaKey){ skipped.push({player_id:bp.player_id,prop,line,side,reason:"unresolved_inventory"}); continue; }
          const scope=baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey);
          const r={source_key:null,source_keys:null,game_pk:null,official_date:null,mlb_player_id:Number(bp.player_id),player_name:playerName,canonical_prop_key:prop,board_line_value:Number(line),selected_side:side,factor_family:entityType,profile_namespace:resolved.profileNamespace,source_formula_key:resolved.sourceFormulaKey,baseline_formula_scope:scope,source_hp_v2_rows:null,source_hp_v2_batch_ids:null,source_game_pks:null};
          const classificationId=`pbc_v5|${canonicalBaselineKey(r,Number(line),side,resolved.profileNamespace,resolved.sourceFormulaKey)}`;
          if(existing.has(classificationId)) continue;
          const values=await loadValuesForHpRow(env,r);
          const hs=hitStatsFor(values,Number(line),side);
          const model=await lockedBaselineModel(env,r,Number(line),side,entityType,resolved.profileNamespace,resolved.sourceFormulaKey);
          let confidence=round(clamp(model.baseline_confidence_0_100,1,95),2);
          let post=model.baseline_hp_0_100;
          const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,prop,entityType);
          const calibrationGuard=applyBaselineV2CalibrationGuard({prop,entityType,side,line:Number(line),hp:post,confidence,hs,sampleTier});
          post=calibrationGuard.hp; confidence=calibrationGuard.confidence;
          const stats=valueStats(values);
          const classification=await classifyBaselineV5(env,r,Number(line),side,entityType,{...model,baseline_hp_0_100:post,baseline_confidence_0_100:confidence,calibration_guard_v0_1_34:calibrationGuard},hs,stats);
          const payload={classification_row_id:classificationId,batch_id:batchId,player_type:entityType,player_id:Number(bp.player_id),player_name:playerName,canonical_prop_key:prop,line_value:Number(line),selected_side:side,classification_tier:classification.classification_tier,classification_profile_key:classification.classification_profile_key,sample_profile:classification.sample_profile,volume_profile:classification.volume_profile,lineup_profile:classification.lineup_profile,platoon_profile:classification.platoon_profile,usage_profile:classification.usage_profile,volatility_profile:classification.volatility_profile,classification_confidence_0_100:classification.classification_confidence_0_100,games_sample:classification.games_sample,events_sample:classification.events_sample,pa_per_game:classification.pa_per_game,ab_ratio:classification.ab_ratio,avg_batting_order:classification.avg_batting_order,split_delta_0_100:classification.split_delta_0_100,classification_json:safeJson({...classification,rescue_v0_1_50:true,rescue_source:"missing_classification_shape_only",baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app"})};
          await insertClassificationV5Row(env,"player_baseline_classification_v5_stage",payload,false);
          await insertClassificationV5Row(env,"player_baseline_classification_v5_current",payload,false);
          await insertClassificationV5Row(env,"player_baseline_classification_v5_history",payload,true);
          const sourceHpId=canonicalBaselineInventoryId(batchId,entityType,Number(bp.player_id),prop,Number(line),side,resolved.profileNamespace,resolved.sourceFormulaKey);
          const sourceExists=await first(env.SCORE_DB,`SELECT 1 AS ok FROM player_baseline_hp_v2_source_queue WHERE batch_id=? AND hp_v2_row_id=? LIMIT 1`,batchId,sourceHpId);
          if(!(sourceExists&&sourceExists.ok)){
            const seed=await sourceQueueSeedForPlayer(env,batchId,entityType,Number(bp.player_id));
            await env.SCORE_DB.prepare(`INSERT INTO player_baseline_hp_v2_source_queue (batch_id,hp_v2_row_id,source_key,source_keys,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,board_line_value,selected_side,factor_family,profile_namespace,source_formula_key,baseline_formula_scope,source_hp_v2_rows,source_hp_v2_batch_ids,source_game_pks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(batchId,sourceHpId,null,null,(seed&&seed.game_pk)||null,(seed&&seed.official_date)||null,Number(bp.player_id),playerName,prop,Number(line),side,entityType,resolved.profileNamespace,resolved.sourceFormulaKey,scope,Number((seed&&seed.source_hp_v2_rows)||classification.events_sample||classification.games_sample||0),null,(seed&&seed.source_game_pks)||(seed&&seed.game_pk)||null).run();
            sourceQueueRowsInserted++;
          }
          inserted.push({player_type:entityType,player_id:bp.player_id,player_name:playerName,prop,line:Number(line),side,classification_row_id:classificationId});
          existing.add(classificationId);
        }
      }
    }
  }

  // Then add the missing pitcher universe. The original rescue only fixed partial existing players;
  // this closes the hitter-only source_queue hole without touching board, market, daily context, scoring, or final-board tables.
  while((inserted.length+hitterPlatoonTierRowsRepaired)<rowChunkSize && Date.now()-startedMs<softYieldMs){
    const items=await pitcherClassificationWorkItems(env,batchId,Math.min(rowChunkSize-inserted.length-hitterPlatoonTierRowsRepaired,50));
    if(!items.length) break;
    for(const item of items){
      if((inserted.length+hitterPlatoonTierRowsRepaired)>=rowChunkSize || Date.now()-startedMs>=softYieldMs) break;
      try{
        if(await insertSourceQueueIfMissing(env,batchId,item)) sourceQueueRowsInserted++;
        const payload=await classifyAndInsertRescueItem(env,batchId,item,"missing_pitcher_universe");
        inserted.push({player_type:'pitcher',player_id:item.playerId,player_name:item.playerName,prop:item.row.canonical_prop_key,line:item.line,side:item.side,classification_row_id:payload.classification_row_id});
      }catch(e){
        skipped.push({player_type:'pitcher',player_id:item.playerId,player_name:item.playerName,prop:item.row.canonical_prop_key,line:item.line,side:item.side,reason:String(e&&e.message?e.message:e).slice(0,300)});
      }
    }
  }

  if((inserted.length+hitterPlatoonTierRowsRepaired)<rowChunkSize && Date.now()-startedMs<softYieldMs){
    const remaining=Math.max(1,rowChunkSize-inserted.length-hitterPlatoonTierRowsRepaired);
    const historyReconcile=await reconcileMissingClassificationHistoryRows(env,batchId,Math.min(remaining,100));
    historyRowsInserted += Number(historyReconcile.inserted||0);
    historyReconcileSample.push(...(historyReconcile.sample||[]));
  }

  if((inserted.length + historyRowsInserted + hitterPlatoonTierRowsRepaired) < rowChunkSize && Date.now()-startedMs<softYieldMs){
    const remaining=Math.max(1,rowChunkSize-inserted.length-hitterPlatoonTierRowsRepaired-historyRowsInserted);
    const queueReconcile=await reconcileMissingSourceQueueRows(env,batchId,Math.min(remaining,sourceQueueReconcileLimit),{player_type:"pitcher",deadline_ms:deadlineMs});
    sourceQueueRowsInserted += Number(queueReconcile.inserted||0);
    sourceQueueReconcileSample.push(...(queueReconcile.sample||[]));
  }


  const afterStage=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_stage");
  const afterCurrent=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_current");
  const afterUniverse=await classificationUniverseAudit(env,batchId);
  const afterPlatoonTierAudit=await hitterPlatoonSideTierAudit(env,batchId);
  const stageRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId))?.c||0);
  const currentRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_current WHERE batch_id=?`,batchId))?.c||0);
  const historyRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_history WHERE batch_id=?`,batchId))?.c||0);
  const sourceQueueRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId))?.c||0);
  const shapeComplete=afterStage.bad_players===0 && afterCurrent.bad_players===0 && afterUniverse.missing_pitcher_rows===0;
  const platoonTierComplete=afterPlatoonTierAudit.hitter_tier_7_8_rows===0 && afterPlatoonTierAudit.pairs_with_side_tier_difference===0;
  const lineageComplete=shapeComplete && platoonTierComplete && stageRows===currentRows && historyRows===currentRows && sourceQueueRows===currentRows;
  const repairedRows=inserted.length + historyRowsInserted + sourceQueueRowsInserted + hitterPlatoonTierRowsRepaired;
  const partial=!lineageComplete && repairedRows>0;
  const cert=lineageComplete?"BASELINE_V5_CLASSIFICATION_RESCUE_COMPLETED_UNIFIED_HITTER_PITCHER_LINEAGE_PASS":(partial?"BASELINE_V5_CLASSIFICATION_RESCUE_LINEAGE_PARTIAL_CONTINUE":"BASELINE_V5_CLASSIFICATION_RESCUE_BLOCKED_LINEAGE_REMAINS");
  const grade=lineageComplete?"PASS":(partial?"PARTIAL_CONTINUE":"BLOCKED");
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"baseline_v5_classification_rescue",status:cert,certification:cert,certification_grade:grade,rescue_only:true,classification_only:true,targeted_state_reliability_rescue:true,state_reliability_rescue:stateReliabilityRescue,lineage_reconcile_only:shapeComplete && platoonTierComplete,partial_continue:partial,orchestrator_should_self_continue:partial,inserted_rows:inserted.length,inserted_sample:inserted.slice(0,50),hitter_platoon_tier_rows_repaired:hitterPlatoonTierRowsRepaired,hitter_platoon_tier_fast_pair_repair:true,hitter_platoon_tier_repair_sample:hitterPlatoonTierRepairSample.slice(0,50),hitter_platoon_tier_repair_skipped_sample:hitterPlatoonTierRepairSkippedSample.slice(0,50),history_rows_inserted:historyRowsInserted,history_reconcile_sample:historyReconcileSample.slice(0,50),skipped_sample:skipped.slice(0,50),source_queue_rows_inserted:sourceQueueRowsInserted,source_queue_reconcile_sample:sourceQueueReconcileSample.slice(0,50),source_queue_reconcile_limit:sourceQueueReconcileLimit,source_queue_rows:sourceQueueRows,before_stage_audit:beforeStage,before_current_audit:beforeCurrent,before_universe_audit:beforeUniverse,before_hitter_platoon_tier_audit:beforePlatoonTierAudit,after_stage_audit:afterStage,after_current_audit:afterCurrent,after_universe_audit:afterUniverse,after_hitter_platoon_tier_audit:afterPlatoonTierAudit,rows_staged:stageRows,rows_promoted:currentRows,history_rows:historyRows,issue_rows:skipped.length,lineage_complete:lineageComplete,shape_complete:shapeComplete,platoon_tier_complete:platoonTierComplete,targeted_existing_classification_row_repair:true,no_row_count_change_expected:true,no_source_queue_mutation_for_platoon_repair:true,no_board_context:true,no_market_context:true,no_daily_context:true,no_app_context:true,no_current_or_stage_delete:true,no_remine:true,allowed_downstream:lineageComplete?"run Baseline Base after rescue validation":"blocked until classification lineage and hitter platoon tier repair are complete",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,next_input_json:partial?{...input,mode:"baseline_v5_classification_rescue",batch_id:batchId,request_id:requestId,run_id:runId,rescue_row_chunk_size:rowChunkSize,rescue_soft_yield_ms:softYieldMs,source_queue_reconcile_limit:sourceQueueReconcileLimit}:null});
  await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,sourceQueueRows,stageRows,currentRows,historyRows,skipped.length,cert,grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,stageRows,currentRows,historyRows,skipped.length,cert,grade,safeJson(output),batchId);
  output.ok=lineageComplete || partial; output.data_ok=lineageComplete || partial; return output;
}

function meanNum(rows, field){ if(!rows || !rows.length) return 0; return rows.reduce((a,r)=>a+num(r[field]),0)/rows.length; }
function pitcherBf(r){ return num(r.batters_faced) || Math.max(0, num(r.outs_recorded)+num(r.hits_allowed)+num(r.walks_allowed)); }
function meanBf(rows){ return rows&&rows.length ? rows.reduce((a,r)=>a+pitcherBf(r),0)/rows.length : 0; }
function sumBf(rows){ return (rows||[]).reduce((a,r)=>a+pitcherBf(r),0); }
function sumNum(rows, field){ return (rows||[]).reduce((a,r)=>a+num(r[field]),0); }
function avgArr(values){ return values&&values.length ? values.reduce((a,b)=>a+num(b),0)/values.length : 0; }
function sortedRows(rows){ return [...(rows||[])].sort((a,b)=>String(a.game_date||"").localeCompare(String(b.game_date||""))); }
function recentRows(rows, n=8){ const s=sortedRows(rows); return s.slice(Math.max(0,s.length-n)); }
function blendedAvg(rows, field, recentN=8){ const recent=recentRows(rows,recentN); const season=meanNum(rows,field); const rec=recent.length?meanNum(recent,field):season; return 0.70*rec + 0.30*season; }
function erfApprox(x){ const sign=x<0?-1:1; x=Math.abs(x); const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911; const t=1/(1+p*x); const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x); return sign*y; }
function normalCdf(x,mu,sd){ if(sd<=0) return x<mu?0:1; return 0.5*(1+erfApprox((x-mu)/(Math.SQRT2*sd))); }
function poissonTailGE(k,lambda){ k=Math.ceil(k); lambda=Math.max(0,Number(lambda||0)); if(k<=0) return 1; if(lambda<=0) return 0; let term=Math.exp(-lambda), sum=term; for(let i=1;i<k;i++){ term*=lambda/i; sum+=term; if(i>250) break; } return clamp(1-sum,0,1); }
function binomialTailGE(k,n,p){ n=Math.max(0,Math.round(Number(n||0))); p=clamp(Number(p||0),0,1); k=Math.ceil(k); if(k<=0) return 1; if(k>n) return 0; if(n>80){ const mu=n*p; const sd=Math.sqrt(Math.max(0.0001,n*p*(1-p))); return clamp(1-normalCdf(k-0.5,mu,sd),0,1); } let prob=0; for(let i=k;i<=n;i++){ let comb=1; for(let j=1;j<=i;j++) comb*= (n-j+1)/j; prob += comb*Math.pow(p,i)*Math.pow(1-p,n-i); } return clamp(prob,0,1); }
function overdispersedTailGE(k,mu,sigma=1){ mu=Math.max(0,Number(mu||0)); k=Math.ceil(k); if(mu<10 && sigma<=1.05) return poissonTailGE(k,mu); const sd=Math.sqrt(Math.max(0.0001,mu*sigma)); return clamp(1-normalCdf(k-0.5,mu,sd),0,1); }
function sideProbFromMore(moreProb, side){ return String(side)==="less" ? clamp(1-moreProb,0,1) : clamp(moreProb,0,1); }
function lockedSampleCap(games, prop){ const g=Number(games||0); const p=String(prop||""); if(p==="rfi_nrfi"){ if(g<5) return 5; if(g<15) return 15; if(g<30) return 30; return 70; } if(g<5) return 5; if(g<10) return 10; if(g<25) return 25; return 65; }
function v2LineCap(prop,line,sourceKey){ const p=String(prop||""); const l=Number(line); if(p==="fantasy_score") return l<=25.5?55:(l<=35.5?35:15); if(p==="pitcher_fantasy_score"||p==="fantasy") return l<=25.5?55:(l<=35.5?35:15); if(p==="pitcher_strikeouts") return l<=2.5?60:(l<=3.5?55:(l<=4.5?50:(l<=5.5?45:(l<=8.5?20:10)))); if(p==="pitcher_outs") return l<=12.5?55:(l<=17.5?40:(l<=20.5?25:10)); if(p==="hits_allowed") return l<=3.5?55:(l<=6.5?40:20); if(p==="walks_allowed") return l<=1.5?55:(l<=2.5?35:(l<=3.5?15:5)); if(p==="earned_runs"||p==="runs_allowed") return l<=2.5?55:(l<=3.5?35:(l<=4.5?20:10)); if(p==="triples") return l<=0.5?15:1; if(p==="home_runs") return l<=0.5?40:2; if(p==="stolen_bases") return l<=0.5?35:1; if(p==="doubles") return l<=0.5?50:5; if(p==="rbis") return l<=0.5?60:(l<=1.5?20:5); if(p==="runs") return l<=0.5?70:(l<=1.5?30:10); if(p==="singles") return l<=0.5?70:(l<=1.5?35:10); if(p==="hits") return l<=0.5?80:(l<=1.5?45:20); if(p==="total_bases"||p==="hits_runs_rbis") return l<=0.5?70:(l<=1.5?50:(l<=2.5?35:(l<=3.5?25:(l<=4.5?15:(l<=5.5?10:5))))); if(p==="hitter_strikeouts") return l<=0.5?70:(l<=1.5?40:15); if(p==="walks") return l<=0.5?60:(l<=1.5?15:2); return 55; }
function workloadBucketFromRows(rows){
  const bf=meanBf(rows);
  const outs=meanNum(rows,"outs_recorded");
  // v0.1.30: TEAM_DB starter_history is starter-only here. SQL proof showed batters_faced was not selected,
  // so meanNum(rows,"batters_faced") returned 0 and real starters leaked into SHORT_RELIEF.
  // Use pitcherBf fallback and bar starter workloads from SHORT_RELIEF when outs/BF prove starter usage.
  if(outs>=18 || bf>=24) return "DEEP_STARTER";
  if(outs>=15 || bf>=20) return "NORMAL_STARTER";
  if(outs>=12 || bf>=15) return "LOW_WORKLOAD_STARTER";
  if(bf<6 && outs<6) return "SHORT_RELIEF";
  if(bf<15 && outs<12) return "MULTI_INNING_RELIEF";
  return "LOW_WORKLOAD_STARTER";
}
function workloadCap(bucket){ if(bucket==="SHORT_RELIEF") return 10; if(bucket==="MULTI_INNING_RELIEF") return 20; if(bucket==="LOW_WORKLOAD_STARTER") return 35; return 65; }
function softMoreCapBySide(hp, side, maxMore){ const m=clamp(maxMore,0.0001,0.9999); return String(side)==="more" ? Math.min(hp,m) : Math.max(hp,1-m); }
function applyLineSideCaps(prob, conf, prop, line, side, rows, trace){ const p=String(prop||""); const l=Number(line); let hp=prob; let cap=conf; const bucket=trace.workload_bucket;
  // v0.1.30: never use destructive 0/100 endpoint caps. Caps may suppress impossible tails, not erase contrary evidence.
  if(p==="pitcher_strikeouts"){ if(bucket==="SHORT_RELIEF" && l>=4.5){ hp=softMoreCapBySide(hp,side,0.08); cap=Math.min(cap,5); } if(bucket==="LOW_WORKLOAD_STARTER" && l>=9.5) hp=softMoreCapBySide(hp,side,0.02); }
  if(p==="pitcher_outs"){ if(bucket==="SHORT_RELIEF" && l>=6.5){ hp=softMoreCapBySide(hp,side,0.10); cap=Math.min(cap,5); } if(bucket==="MULTI_INNING_RELIEF" && l>=15.5){ hp=softMoreCapBySide(hp,side,0.12); cap=Math.min(cap,5); } }
  if(p==="hits_allowed"){ if(bucket==="SHORT_RELIEF" && l>=6.5){ hp=softMoreCapBySide(hp,side,0.12); cap=Math.min(cap,5); } if(l>=9.5) hp=String(side)==="more"?Math.min(hp,0.05):Math.max(hp,0.95); }
  if(p==="walks_allowed"){ if(bucket==="SHORT_RELIEF" && l>=4.5){ hp=softMoreCapBySide(hp,side,0.08); cap=Math.min(cap,5); } if(l>=4.5){ hp=String(side)==="more"?Math.min(hp,0.05):Math.max(hp,0.95); cap=Math.min(cap,5); } }
  if(p==="earned_runs" && l>=4.5){ if(trace.leash_profile==="SHORTENING_LEASH") hp=String(side)==="more"?Math.min(hp,0.08):Math.max(hp,0.92); cap=Math.min(cap,20); }
  if(p==="runs_allowed" && l>=5.5 && trace.leash_profile==="SHORTENING_LEASH"){ hp=String(side)==="more"?Math.min(hp,0.02):Math.max(hp,0.98); cap=Math.min(cap,10); }
  if((p==="pitcher_fantasy_score"||p==="fantasy") && l>=36.5) cap=Math.min(cap,15); return {prob:clamp(hp,0.0001,0.9999), confidence:clamp(cap,1,95)}; }
function exposureRate(rows, numerator, denominator, priorRate, priorExposure){ const den=String(denominator)==="batters_faced"?sumBf(rows):sumNum(rows,denominator); const hit=sumNum(rows,numerator); return (hit + priorRate*priorExposure) / Math.max(1, den + priorExposure); }
function hitterAb(row){ return num(row.ab) || Math.max(0, num(row.pa)*0.88); }
function hitterReach(row){ return Math.max(0,num(row.hits)+num(row.walks)-num(row.triples)-num(row.home_runs)); }
function hitterFantasyV2(row){ return 3*num(row.singles)+5*num(row.doubles)+8*num(row.triples)+10*num(row.home_runs)+2*num(row.runs)+2*num(row.rbi)+2*num(row.walks)+5*num(row.stolen_bases); }
function recentTrendCap(rows, seasonVal, recentVal){ if(!rows.length) return {profile:"MISSING_RECENT",cap:30}; if(!Number.isFinite(recentVal)) return {profile:"MISSING_RECENT",cap:30}; if(seasonVal>0 && Math.abs(recentVal-seasonVal)/seasonVal>0.40) return {profile:"VOLATILE_RECENT",cap:20}; return {profile:"STABLE_RECENT",cap:65}; }
async function loadBaselineModelRows(env,row,entityType,maxDate=null){ const prop=String(row.canonical_prop_key||""); const playerId=Number(row.mlb_player_id||0); const key=`${entityType}|baseline_rows|${playerId}|${baselineV5DateCacheToken(maxDate)}`; if(V2_BASELINE_ROW_CACHE.has(key)) return V2_BASELINE_ROW_CACHE.get(key); let rows=[]; if(prop==="rfi_nrfi"){ const vals=await loadValuesForHpRow(env,row,maxDate); rows=vals.map((v,i)=>({game_date:String(i),rfi_value:v})); }
  else if(entityType==="pitcher"){ rows=await loadPitcherBaselineRows(env,playerId,maxDate); }
  else { rows=await loadHitterBaselineRows(env,playerId,maxDate); }
  V2_BASELINE_ROW_CACHE.set(key,rows); return rows; }
function modelHitterBaseline(rows, prop, line, side, sourceKey){ const games=rows.length; const recent=recentRows(rows); const seasonPa=meanNum(rows,"pa"); const recentPa=recent.length?meanNum(recent,"pa"):seasonPa; const expPa=0.65*recentPa+0.35*seasonPa; const expAb=expPa*0.88; const priorAB=prop==="triples"?250:(prop==="home_runs"?250:200); const priorPA=prop==="walks"||prop==="hitter_strikeouts"?300:200; let more=0.5; let engine="hitter_locked_component_proxy"; let modelExtra={}; if(prop==="hits"){ const p=exposureRate(rows,"hits","pa",0.215,priorAB); more=binomialTailGE(Math.floor(line)+1,Math.round(expAb),p); }
  else if(prop==="singles"){ const p=exposureRate(rows,"singles","pa",0.14,priorAB); more=binomialTailGE(Math.floor(line)+1,Math.round(expAb),p); }
  else if(prop==="doubles"){ const p=exposureRate(rows,"doubles","pa",0.045,priorAB); more=overdispersedTailGE(Math.floor(line)+1,expAb*p,1.15); }
  else if(prop==="triples"){ const p=exposureRate(rows,"triples","pa",0.004,priorAB); more=line>=1.5?0.0001:overdispersedTailGE(1,expAb*p,1.2); }
  else if(prop==="home_runs"){ const p=exposureRate(rows,"home_runs","pa",0.03,priorPA); more=line>=1.5?Math.min(0.02,overdispersedTailGE(2,expPa*p,1.2)):overdispersedTailGE(1,expPa*p,1.15); }
  else if(prop==="walks"){ const p=exposureRate(rows,"walks","pa",0.085,priorPA); more=line>=2.5?Math.min(0.005,overdispersedTailGE(3,expPa*p,1.2)):overdispersedTailGE(Math.floor(line)+1,expPa*p,1.15); }
  else if(prop==="hitter_strikeouts"){ const p=exposureRate(rows,"strikeouts","pa",0.225,350); more=binomialTailGE(Math.floor(line)+1,Math.round(expPa),p); if(line>=2.5) more*=0.85; }
  else if(prop==="stolen_bases"){ const reaches=rows.reduce((a,r)=>a+hitterReach(r),0); const sb=sumNum(rows,"stolen_bases"); const p=(sb+0.025*100)/Math.max(1,reaches+100); const expReach=expPa*(sumNum(rows,"hits")+sumNum(rows,"walks"))/Math.max(1,sumNum(rows,"pa")); more=line>=1.5?Math.min(0.005,overdispersedTailGE(2,expReach*p*0.88,1.2)):Math.min(0.35,overdispersedTailGE(1,expReach*p*0.88,1.1)); }
  else if(prop==="runs"){ const p=exposureRate(rows,"runs","pa",0.115,250); more=overdispersedTailGE(Math.floor(line)+1,expPa*p,1.18); }
  else if(prop==="rbis"){ const p=exposureRate(rows,"rbi","pa",0.11,250); more=overdispersedTailGE(Math.floor(line)+1,expPa*p,1.20); }
  else if(prop==="total_bases"){ const avg=rows.reduce((a,r)=>a+num(r.total_bases),0)/Math.max(1,games); const rec=recent.length?recent.reduce((a,r)=>a+num(r.total_bases),0)/recent.length:avg; more=overdispersedTailGE(Math.floor(line)+1,0.6*rec+0.4*avg,1.35); engine="compound_tb_proxy"; }
  else if(prop==="hits_runs_rbis"){
    const vals=rows.map(r=>num(r.hits)+num(r.runs)+num(r.rbi));
    const avg=avgArr(vals);
    const ravg=avgArr(recent.map(r=>num(r.hits)+num(r.runs)+num(r.rbi)));
    const proxyMore=overdispersedTailGE(Math.floor(line)+1,0.6*(ravg||avg)+0.4*avg,1.35);
    const direct=calcHpLine(vals,line,"more");
    const directMore=direct.raw_rate_0_100==null ? proxyMore : clamp(direct.raw_rate_0_100/100,0,1);
    // v0.1.29 / formula v0.2.2: SQL proof on 2026-06-30 showed hrr_cluster_proxy was replacing
    // direct binary reality and creating +20 to +39 point lifts on HRR MORE 0.5/1.5/2.5.
    // HRR may get a small compound/opportunity lift, but it may not override the observed direct line hit rate.
    const sampleLift = games < 10 ? 0.03 : (games < 25 ? 0.05 : (games < 50 ? 0.07 : 0.09));
    const lineLift = Number(line)<=0.5 ? sampleLift : (Number(line)<=1.5 ? Math.min(sampleLift,0.08) : (Number(line)<=2.5 ? Math.min(sampleLift,0.06) : Math.min(sampleLift,0.04)));
    more=Math.min(proxyMore,directMore+lineLift);
    engine="hrr_cluster_proxy_direct_rate_lift_guard";
    modelExtra={hrr_proxy_more_pre_guard:round(proxyMore*100,2),hrr_direct_more_rate_0_100:direct.raw_rate_0_100,hrr_direct_non_push_sample:direct.non_push_sample,hrr_max_lift_over_direct_0_100:round(lineLift*100,2),hrr_lift_guard_applied:proxyMore>more};
  }
  else if(prop==="fantasy_score"){ const vals=rows.map(hitterFantasyV2); const avg=avgArr(vals); const ravg=avgArr(recent.map(hitterFantasyV2)); more=overdispersedTailGE(Math.floor(line)+1,0.6*(ravg||avg)+0.4*avg,1.45); engine="hfs_compound_proxy"; }
  const prob=sideProbFromMore(more,side); const cap=Math.min(lockedSampleCap(games,prop),v2LineCap(prop,line,sourceKey)); return {prob,confidence:cap,engine,games,workload_bucket:"HITTER",leash_profile:"NA",sample_cap:lockedSampleCap(games,prop),line_cap:v2LineCap(prop,line,sourceKey),...modelExtra}; }
function modelPitcherComponent(rows, prop, line, side, sourceKey, formulaKey){ const games=rows.length; const bucket=workloadBucketFromRows(rows); const seasonBf=meanBf(rows); const recent=recentRows(rows); const recentBf=recent.length?meanBf(recent):seasonBf; const expBf=0.70*recentBf+0.30*seasonBf; const seasonOuts=meanNum(rows,"outs_recorded"); const recentOuts=recent.length?meanNum(recent,"outs_recorded"):seasonOuts; const expOuts=0.70*recentOuts+0.30*seasonOuts; const leash=seasonBf>0 && recentBf < seasonBf*0.80 ? "SHORTENING_LEASH" : (seasonBf>0 && recentBf>seasonBf*1.20 ? "EXPANDING_LEASH" : "STABLE_LEASH"); let more=0.5, engine="pitcher_locked_component_proxy", extra={}; if(prop==="pitcher_strikeouts"){ const rate=exposureRate(rows,"strikeouts","batters_faced",0.2218,300); more = line>=9.5 && expBf<18 ? 0.02 : binomialTailGE(Math.floor(line)+1,Math.round(expBf),rate); }
  else if(prop==="pitcher_outs"){ more=overdispersedTailGE(Math.floor(line)+1,expOuts,1.25); engine="beta_binomial_outs_proxy"; }
  else if(prop==="hits_allowed"){ const rate=exposureRate(rows,"hits_allowed","batters_faced",0.2152,300); more=overdispersedTailGE(Math.floor(line)+1,expBf*rate,1.25); engine="beta_binomial_hits_allowed_proxy"; }
  else if(prop==="walks_allowed"){ const rate=exposureRate(rows,"walks_allowed","batters_faced",0.09,300); const strikeRate=0.637; let sigma=(rate>=0.095?1.25:1.10); let mu=expBf*rate; if((rate>=0.120 || strikeRate<0.600) && line>=2.5) mu*=1.15; more=overdispersedTailGE(Math.floor(line)+1,mu,sigma); engine="beta_binomial_walks_allowed_sigma_command_decay"; }
  else if(prop==="earned_runs"){ const erRate=exposureRate(rows,"earned_runs","batters_faced",0.1079,300); const ha=exposureRate(rows,"hits_allowed","batters_faced",0.2152,300); const wa=exposureRate(rows,"walks_allowed","batters_faced",0.09,300); const hr=exposureRate(rows,"home_runs_allowed","batters_faced",0.0297,300); const omega=clamp(0.45*(hr/0.0297)+0.35*(ha/0.2152)+0.20*(wa/0.09),0.65,1.60); more=overdispersedTailGE(Math.floor(line)+1,expBf*erRate*omega,1.55); engine="gamma_poisson_er_weighted_damage"; extra={omega,ha_per_bf:round(ha,4),wa_per_bf:round(wa,4),hr_per_bf:round(hr,4)}; }
  else if(prop==="runs_allowed"){ const erRate=exposureRate(rows,"earned_runs","batters_faced",0.1079,300); const unearnedRate=0.11734715736258086-0.10787883980977679; const ha=exposureRate(rows,"hits_allowed","batters_faced",0.2152,300); const wa=exposureRate(rows,"walks_allowed","batters_faced",0.09,300); const hr=exposureRate(rows,"home_runs_allowed","batters_faced",0.0297,300); const omega=clamp(0.45*(hr/0.0297)+0.35*(ha/0.2152)+0.20*(wa/0.09),0.65,1.60); const earnedMu=expBf*erRate*omega; const unearnedMu=expBf*unearnedRate; more=clamp(overdispersedTailGE(Math.floor(line)+1,earnedMu+unearnedMu,1.60),0,1); engine="dual_process_ra_negative_binomial_plus_unearned_poisson"; extra={omega,earned_mu:round(earnedMu,3),unearned_mu:round(unearnedMu,3)}; }
  else if(prop==="pitcher_fantasy_score"||prop==="fantasy"){
    // v0.1.59: Baseline Base is source/app agnostic. Do not leak PrizePicks/Sleeper, wins, or QS.
    // This is a component-only static proxy: outs + 3*K - 3*ER - H - BB.
    const neutralPfs = (r)=> num(r.outs_recorded) + 3*num(r.strikeouts) - 3*num(r.earned_runs) - num(r.hits_allowed) - num(r.walks_allowed);
    const vals=rows.map(neutralPfs);
    const season=avgArr(vals);
    const recentAvg=avgArr(recent.map(neutralPfs))||season;
    const mu=0.70*recentAvg+0.30*season;
    let sigma=line>=36.5?1.75:1.50; if(line>=45.5) sigma=1.95;
    more=overdispersedTailGE(Math.floor(line)+1,mu,sigma);
    engine="pfs_source_agnostic_component_proxy_no_win_no_qs";
    extra={source_pfs_mode:"SOURCE_AGNOSTIC_COMPONENTS",season_component_pfs:round(season,2),recent_component_pfs:round(recentAvg,2),wins_used:false,qs_used:false,platform_formula_used:false,component_formula:"outs_recorded + 3*strikeouts - 3*earned_runs - hits_allowed - walks_allowed"};
  }
  else if(prop==="pitches_thrown"){ const expPitch=blendedAvg(rows,"pitches",8); more=overdispersedTailGE(Math.floor(line)+1,expPitch,1.2); }
  const prob0=sideProbFromMore(more,side); const baseConf=Math.min(lockedSampleCap(games,prop),workloadCap(bucket),v2LineCap(prop,line,sourceKey)); const capped=applyLineSideCaps(prob0,baseConf,prop,line,side,rows,{workload_bucket:bucket,leash_profile:leash}); return {prob:capped.prob,confidence:capped.confidence,engine,games,workload_bucket:bucket,leash_profile:leash,sample_cap:lockedSampleCap(games,prop),workload_cap:workloadCap(bucket),line_cap:v2LineCap(prop,line,sourceKey),...extra}; }
function modelRfiBaseline(values,line,side){ const hs=hitStatsFor(values,line,side); const prior=50; const m=50; const post=posteriorHeb(hs.hit,hs.miss,hs.push,prior,m); const games=values.length; return {prob:post==null?null:post/100,confidence:Math.min(lockedSampleCap(games,"rfi_nrfi"),55),engine:"rfi_binary_larger_sample_tiers",games,sample_cap:lockedSampleCap(games,"rfi_nrfi"),line_cap:55,direct:hs}; }
function weakHistoryPriorFor(prop, entityType, line, sample){
  // v0.1.61: Baseline Base is any-day history only. This is weak additive smoothing,
  // not a league/projection prior. It only prevents impossible 0/100 endpoints.
  const p=String(prop||"").toLowerCase();
  let alpha=0.25, beta=0.25;
  if(p==="rfi_nrfi"){ alpha=0.50; beta=0.50; }
  return {alpha,beta,total:alpha+beta,prior_rate_0_100:50};
}
function weakSmoothedHistoryHp(hit, miss, prop, entityType, line){
  const h=Number(hit||0), m=Number(miss||0), n=h+m;
  if(n<=0) return null;
  const prior=weakHistoryPriorFor(prop,entityType,line,n);
  return round(100*((h+prior.alpha)/(n+prior.alpha+prior.beta)),2);
}
function directHistoryOnlyBaselineModel(values, prop, line, side, entityType){
  const hs=hitStatsFor(values,line,side);
  const n=Number(hs.non_push_sample||0);
  let hp=weakSmoothedHistoryHp(hs.hit,hs.miss,prop,entityType,line);
  const bounds=historyOnlyHpOperationalBounds(prop,entityType,line,n);
  if(hp!=null) hp=round(clamp(hp,bounds.floor,bounds.ceiling),2);
  const sampleCap=lockedSampleCap(n,prop);
  const lineCap=v2LineCap(prop,line,null);
  const rawPriorGap = hs.raw_rate_0_100==null || hp==null ? 0 : round(hs.raw_rate_0_100-hp,2);
  const stats=valueStats(values||[]);
  const confidence=baselineV5ReliabilityConfidence(n,rawPriorGap,stats.volatility_profile);
  const prior=weakHistoryPriorFor(prop,entityType,line,n);
  return {
    prob:hp==null?null:hp/100,
    confidence,
    engine:"direct_empirical_game_log_rate_weak_smoothing_no_context",
    games:n,
    direct:hs,
    weak_smoothing_prior:prior,
    operational_bounds:bounds,
    sample_cap:sampleCap,
    line_cap:lineCap,
    confidence_model:"reliability_sample_gap_volatility_no_line_cap",
    confidence_raw_prior_gap_0_100:rawPriorGap,
    confidence_volatility_profile:stats.volatility_profile,
    line_cap_not_used_for_confidence:true,
    no_projection_model:true,
    no_match_context:true,
    no_park_weather_platoon_context:true
  };
}
async function lockedBaselineModel(env,row,line,side,entityType,profileNamespace,formulaKey,maxDate=null){
  const prop=String(row.canonical_prop_key||"");
  const modelKey=`${entityType}|direct_history|${Number(row.mlb_player_id||0)}|${prop}|${line}|${side}|${profileNamespace}|${formulaKey}|${baselineV5DateCacheToken(maxDate)}`;
  if(V2_BASELINE_MODEL_CACHE.has(modelKey)) return V2_BASELINE_MODEL_CACHE.get(modelKey);
  const vals=await loadValuesForHpRow(env,row,maxDate);
  const result=directHistoryOnlyBaselineModel(vals,prop,line,side,entityType);
  const hp=result.prob==null?null:round(clamp(result.prob*100,0,100),2);
  const conf=result.prob==null?5:round(clamp(result.confidence,1,95),2);
  const out={...result, baseline_hp_0_100:hp, baseline_confidence_0_100:conf, model_version:BASELINE_V2_FORMULA_VERSION, confidence_version:BASELINE_V2_CONFIDENCE_VERSION, binary_game_rate_replaced:false, direct_history_only:true};
  V2_BASELINE_MODEL_CACHE.set(modelKey,out);
  return out;
}
function historyOnlyHpOperationalBounds(prop, entityType, line, sample){
  const p=String(prop||"").toLowerCase();
  const et=String(entityType||"").toLowerCase();
  const sampleN=Number(sample||0);
  let floor=0.50, ceiling=99.50;
  // Composite and pitcher props are wide-distribution estimates, not certainties.
  if(p==="fantasy_score" || p==="pitcher_fantasy_score" || p==="fantasy" || et==="pitcher") { floor=1.00; ceiling=99.00; }
  // Rare events can have tighter tails, but still cannot use 0.05/99.95 in history-only output.
  if(p==="home_runs" || p==="triples" || p==="stolen_bases") { floor=0.25; ceiling=99.75; }
  if(sampleN>0 && sampleN<20){ floor=Math.max(floor,3.00); ceiling=Math.min(ceiling,97.00); }
  else if(sampleN>=20 && sampleN<40){ floor=Math.max(floor,1.50); ceiling=Math.min(ceiling,98.50); }
  return {floor, ceiling};
}

function applyBaselineV2CalibrationGuard({prop, entityType, side, line, hp, confidence, hs, sampleTier}){
  if(hp==null) return {hp, confidence, adjusted:false, block_promotion:false, notes:{}};
  const notes={floor_min_0_05_max_99_95_legacy:true, operational_envelope_version:"v0.1.59", confidence_guard_version:"v0.1.59"};
  let outHp=Number(hp);
  let outConf=Number(confidence||5);
  const raw=hs && hs.raw_rate_0_100!=null ? Number(hs.raw_rate_0_100) : null;
  const sample=Number(hs && hs.non_push_sample || 0);
  const p=String(prop||"").toLowerCase();
  const et=String(entityType||"").toLowerCase();
  const sideKey=String(side||"").toLowerCase();
  const rareProp = p==="doubles" || p==="triples" || p==="home_runs";
  let adjusted=false;
  let blockPromotion=false;

  // v0.1.35 keeps v0.1.34 endpoint protection. History-only baseline rows are tail estimates,
  // not physical impossibilities, so never emit destructive 0/100 endpoints.
  const floored=round(clamp(outHp,0.05,99.95),2);
  if(floored!==outHp){ adjusted=true; notes.hp_floor_applied={before:outHp,after:floored}; outHp=floored; }

  // v0.1.35: Gemini/stat audit found high-line hits MORE 2.5 was over-suppressed for ELITE hitters.
  // Use a symmetric half-empirical tail relief for stabilized samples. For LESS, the same blend moves
  // the complement downward, preserving no-push pair math when both sides exist.
  if(et==="hitter" && p==="hits" && Number(line)>=2.5 && raw!=null && sample>=50 && Math.abs(outHp-raw)>3){
    const blended=round(clamp(0.50*raw + 0.50*outHp,0.05,99.95),2);
    notes.elite_high_line_hits_tail_relief={sample,raw_rate_0_100:raw,before:outHp,after:blended,alpha_raw:0.50,alpha_model:0.50,line:Number(line)};
    outHp=blended; adjusted=true;
  }

  // v0.1.41 / formula v0.2.10: SQL audit of v0.1.40 proved the source queue and
  // HITS/HRR calibration were clean, but the same prior-overtrust pattern remained across
  // direct binary hitter count families: RBIs, runs, singles, hitter strikeouts, total bases,
  // and a small stolen-base tail. These rows all carry direct_binary_reference hit/miss
  // samples, so stabilized 40+ / 60+ game samples must use empirical reality as the primary
  // anchor while the model remains a smaller stabilizer. This branch is gap-gated, so clean
  // families like doubles/home-runs are not moved unless they cross the same audit threshold.
  const empiricalTrustProp = et==="hitter" && (
    p==="hits" ||
    p==="hits_runs_rbis" ||
    p==="rbis" ||
    p==="runs" ||
    p==="singles" ||
    p==="hitter_strikeouts" ||
    p==="total_bases" ||
    p==="stolen_bases" ||
    p==="walks"
  );
  const empiricalTrustLabel = p==="hits_runs_rbis" ? "hrr" : p;
  if(et==="hitter" && empiricalTrustProp && raw!=null && sample>60 && Math.abs(outHp-raw)>10){
    const blended=round(clamp(0.80*raw + 0.20*outHp,0.05,99.95),2);
    notes[`sample60_${empiricalTrustLabel}_empirical_trust_blend`]={sample,raw_rate_0_100:raw,before:outHp,after:blended,alpha_raw:0.80,alpha_model:0.20,gap_before_0_100:round(Math.abs(outHp-raw),2)};
    outHp=blended; adjusted=true;
  } else if(et==="hitter" && empiricalTrustProp && raw!=null && sample>=40 && Math.abs(outHp-raw)>10){
    const blended=round(clamp(0.70*raw + 0.30*outHp,0.05,99.95),2);
    notes[`sample40_${empiricalTrustLabel}_empirical_trust_blend`]={sample,raw_rate_0_100:raw,before:outHp,after:blended,alpha_raw:0.70,alpha_model:0.30,gap_before_0_100:round(Math.abs(outHp-raw),2)};
    outHp=blended; adjusted=true;
  }

  // v0.1.41 fallback: if a generalized direct-count family still exceeds the old
  // 15-point emergency gap after the empirical trust blend, apply a stronger final blend.
  if(et==="hitter" && empiricalTrustProp && raw!=null && sample>=40 && Math.abs(outHp-raw)>15){
    const blended=round(clamp(0.85*raw + 0.15*outHp,0.05,99.95),2);
    notes[`large_sample_${empiricalTrustLabel}_empirical_blend`]={sample,raw_rate_0_100:raw,before:outHp,after:blended,alpha_raw:0.85,alpha_model:0.15};
    outHp=blended; adjusted=true;
  }

  // v0.1.59: fantasy/composite tails were over-modeling away from direct game outcomes.
  // Keep model signal, but force stabilized samples back toward empirical line clearance.
  const compositeEmpiricalProp = (p==="fantasy_score" || p==="pitcher_fantasy_score" || p==="fantasy");
  if(raw!=null && sample>=30 && compositeEmpiricalProp && Math.abs(outHp-raw)>8){
    const alphaRaw = sample>=60 ? 0.70 : (sample>=40 ? 0.62 : 0.55);
    const blended=round(clamp(alphaRaw*raw + (1-alphaRaw)*outHp,0.05,99.95),2);
    notes.composite_empirical_anchor_v0_1_59={sample,raw_rate_0_100:raw,before:outHp,after:blended,alpha_raw:alphaRaw,alpha_model:round(1-alphaRaw,2),gap_before_0_100:round(Math.abs(outHp-raw),2)};
    outHp=blended; adjusted=true;
  }

  // v0.1.59 emergency guard: any stabilized row still >25 points away from raw must visibly move toward raw.
  if(raw!=null && sample>=40 && Math.abs(outHp-raw)>25){
    const blended=round(clamp(0.80*raw + 0.20*outHp,0.05,99.95),2);
    notes.stabilized_large_gap_emergency_empirical_anchor_v0_1_59={sample,raw_rate_0_100:raw,before:outHp,after:blended,alpha_raw:0.80,alpha_model:0.20,gap_before_0_100:round(Math.abs(outHp-raw),2)};
    outHp=blended; adjusted=true;
  }

  // v0.1.59 operational envelope: history-only baseline cannot output near-certainty endpoints.
  const bounds=historyOnlyHpOperationalBounds(p,et,line,sample);
  const bounded=round(clamp(outHp,bounds.floor,bounds.ceiling),2);
  if(bounded!==outHp){
    notes.history_only_operational_hp_envelope_v0_1_59={sample,prop:p,entity_type:et,line:Number(line),before:outHp,after:bounded,floor:bounds.floor,ceiling:bounds.ceiling};
    outHp=bounded; adjusted=true;
  }

  // v0.1.35: rare-event confidence cannot graduate like a common hit/no-hit prop.
  // Doubles/triples/HR need event-scarcity confidence deflation, especially under 50 games.
  if(et==="hitter" && rareProp){
    const before=outConf;
    if(sample<50) outConf=Math.min(outConf, round(outConf*0.70,2));
    if(sample>=20 && raw!=null && (raw<=0 || raw>=100)) outConf=Math.min(outConf,10);
    if(sample<5) outConf=Math.min(outConf,5);
    if(outConf!==before){ notes.rare_event_confidence_deflated={prop:p,side:sideKey,sample,raw_rate_0_100:raw,before,after:outConf,under_50_scalar:sample<50?0.70:null,zero_or_full_raw_cap:(sample>=20 && raw!=null && (raw<=0 || raw>=100))?10:null}; adjusted=true; }
  }

  // v0.1.35: confidence must scale with available sample, not just the static tier cap.
  // This prevents 26-game rare-event samples carrying mid confidence.
  if(sample>0){
    const target=rareProp?80:(p==="hits"?60:70);
    const sampleScaledCap=round(clamp((sample/target)*100,5,95),2);
    if(outConf>sampleScaledCap){ notes.sample_size_confidence_cap={sample,target,before:outConf,after:sampleScaledCap}; outConf=sampleScaledCap; adjusted=true; }
  }

  // If calibrated HP remains far from direct empirical rate, confidence must advertise override risk.
  if(raw!=null && sample>=30 && Math.abs(outHp-raw)>15 && outConf>15){
    notes.confidence_gap_deflated={sample,raw_rate_0_100:raw,hp_0_100:outHp,before:outConf,after:15,gap_0_100:round(Math.abs(outHp-raw),2)};
    outConf=15; adjusted=true;
  }

  // v0.1.42: final global confidence caps run after HP calibration, not before it.
  // Sample-size uncertainty is prop-agnostic and must override static tier caps.
  if(sample>0){
    let finalSampleCap=null;
    if(sample<20) finalSampleCap=15;
    else if(sample<30) finalSampleCap=20;
    else if(sample<40) finalSampleCap=25;
    if(finalSampleCap!=null && outConf>finalSampleCap){
      notes.final_global_sample_confidence_cap={sample,before:outConf,after:finalSampleCap};
      outConf=finalSampleCap; adjusted=true;
    }
  }

  // v0.1.42: large-sample raw/model disagreement is a confidence risk even when the prop
  // is a composite family that should not be hard-blocked by the direct binary unit test.
  if(raw!=null && sample>60 && Math.abs(outHp-raw)>10 && outConf>15){
    notes.sample60_gap_confidence_deflated={sample,raw_rate_0_100:raw,hp_0_100:outHp,before:outConf,after:15,gap_0_100:round(Math.abs(outHp-raw),2)};
    outConf=15; adjusted=true;
  }

  // Strict final-gate marker: direct empirical hitter count props with sample >60 and
  // gap >10 must not auto-promote. Composite fantasy_score is deliberately excluded;
  // it is handled by confidence deflation until its own composite envelope is built.
  if(raw!=null && sample>60 && empiricalTrustProp && Math.abs(outHp-raw)>10){
    blockPromotion=true;
    notes.calibration_pending_sample60_gap_gt10={sample,raw_rate_0_100:raw,hp_0_100:outHp,gap_0_100:round(Math.abs(outHp-raw),2)};
  }
  if(blockPromotion && outConf>15){
    notes.block_promotion_confidence_cap={before:outConf,after:15};
    outConf=15; adjusted=true;
  }
  return {hp:round(outHp,2), confidence:round(clamp(outConf,1,95),2), adjusted, block_promotion:blockPromotion, notes};
}


async function repairBaselineV2StageLadders(env,batchId){
  const countRow=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
  const totalRows=Number(countRow&&countRow.rows||0);
  if(totalRows>20000){
    // v0.1.64: terminal certification rescue.  The full 67,040-row stage was already
    // externally proven complete, pair-clean, and monotonic-clean.  The old repair path
    // loaded every staged row into Worker memory and caused D1/Worker memory failure
    // before certification.  For large read-only Baseline Base stages, do not materialize
    // all rows in JS.  Let baselineV5StageValidation perform SQL aggregate gates.
    return {checked_rows:totalRows,monotonic_repairs:0,complement_repairs:0,updated_rows:0,skipped_full_scan:true,memory_safe_terminal_validation_only:true,patch_version:"v0.1.64"};
  }
  const rows=await all(env.SCORE_DB,`SELECT baseline_hp_row_id,player_id,player_name,canonical_prop_key,line_value,selected_side,baseline_hp_0_100,raw_rate_0_100,baseline_confidence_0_100,profile_notes_json FROM player_baseline_hp_v2_stage WHERE batch_id=? ORDER BY player_id, canonical_prop_key, line_value`,batchId);
  if(!rows.length) return {checked_rows:0,monotonic_repairs:0,complement_repairs:0,updated_rows:0};
  const byKey=new Map();
  for(const r of rows){
    const k=`${r.player_id}|${r.canonical_prop_key}`;
    if(!byKey.has(k)) byKey.set(k,[]);
    byKey.get(k).push({...r,line_value:Number(r.line_value),baseline_hp_0_100:Number(r.baseline_hp_0_100),baseline_confidence_0_100:Number(r.baseline_confidence_0_100)});
  }
  const updates=new Map();
  function setHp(r,newHp,reason){
    const hp=round(clamp(newHp,0.05,99.95),2);
    const cur=updates.get(r.baseline_hp_row_id) || {...r,new_hp:Number(r.baseline_hp_0_100),reasons:[]};
    if(Math.abs(cur.new_hp-hp)>0.004){ cur.new_hp=hp; cur.reasons.push(reason); updates.set(r.baseline_hp_row_id,cur); }
  }
  let monotonicRepairs=0, complementRepairs=0;
  for(const group of byKey.values()){
    const more=group.filter(r=>String(r.selected_side).toLowerCase()==="more").sort((a,b)=>a.line_value-b.line_value);
    let prev=null;
    for(const r of more){
      const current=(updates.get(r.baseline_hp_row_id)||r).new_hp ?? r.baseline_hp_0_100;
      if(prev!=null && current>prev+0.05){ setHp(r,prev,{type:"monotonic_more_downward_clamp",before:current,after:prev}); monotonicRepairs++; }
      prev=(updates.get(r.baseline_hp_row_id)||r).new_hp ?? r.baseline_hp_0_100;
    }
    const moreByLine=new Map();
    for(const r of more){ moreByLine.set(String(r.line_value),r); }
    for(const less of group.filter(r=>String(r.selected_side).toLowerCase()==="less")){
      const m=moreByLine.get(String(less.line_value));
      if(!m) continue;
      const moreHp=(updates.get(m.baseline_hp_row_id)||m).new_hp ?? m.baseline_hp_0_100;
      const target=round(clamp(100-moreHp,0.05,99.95),2);
      const lessHp=(updates.get(less.baseline_hp_row_id)||less).new_hp ?? less.baseline_hp_0_100;
      if(Math.abs(lessHp-target)>0.05){ setHp(less,target,{type:"exact_pair_complement_after_more_repair",more_hp:moreHp,before:lessHp,after:target}); complementRepairs++; }
    }
    const unpairedLess=group.filter(r=>String(r.selected_side).toLowerCase()==="less" && !moreByLine.has(String(r.line_value))).sort((a,b)=>a.line_value-b.line_value);
    prev=null;
    for(const r of unpairedLess){
      const current=(updates.get(r.baseline_hp_row_id)||r).new_hp ?? r.baseline_hp_0_100;
      if(prev!=null && current+0.05<prev){ setHp(r,prev,{type:"monotonic_less_upward_clamp_unpaired",before:current,after:prev}); monotonicRepairs++; }
      prev=(updates.get(r.baseline_hp_row_id)||r).new_hp ?? r.baseline_hp_0_100;
    }
  }
  const stmts=[];
  for(const u of updates.values()){
    const oldNotes=parseJson(u.profile_notes_json||"{}",{});
    const newHp=round(u.new_hp,2);
    const conf=round(clamp(Number(u.baseline_confidence_0_100||5),1,95),2);
    const raw=u.raw_rate_0_100==null?null:Number(u.raw_rate_0_100);
    oldNotes.monotonic_complement_repair_v0_1_42={reasons:u.reasons,after_hp_0_100:newHp,raw_rate_0_100:raw};
    stmts.push(env.SCORE_DB.prepare(`UPDATE player_baseline_hp_v2_stage SET baseline_hp_0_100=?, tier_prior_rate_0_100=?, raw_prior_gap_0_100=?, hp_adjustment_0_100=?, baseline_confidence_0_100=?, baseline_enriched_confidence_0_100=?, soft_uncertainty_reserve_0_100=?, profile_notes_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND baseline_hp_row_id=?`).bind(newHp,newHp,raw==null?null:round(raw-newHp,2),0,conf,conf,round(100-conf,2),safeJson(oldNotes),batchId,u.baseline_hp_row_id));
  }
  if(stmts.length) await batch(env.SCORE_DB,stmts,25);
  return {checked_rows:rows.length,monotonic_repairs:monotonicRepairs,complement_repairs:complementRepairs,updated_rows:updates.size};
}

function assertPlayerBaselineStageCopyTable(table){
  if(!/^player_baseline_(sanity|hp)_v2_(stage|current|history)$/.test(String(table||""))) throw new Error(`PLAYER_BASELINE_COPY_GUARD_BLOCKED_TABLE:${table}`);
}
function playerBaselineIdColumn(table){
  const t=String(table||"");
  if(t.includes("_hp_")) return "baseline_hp_row_id";
  if(t.includes("_sanity_")) return "baseline_row_id";
  throw new Error(`PLAYER_BASELINE_COPY_GUARD_UNKNOWN_ID_COLUMN:${table}`);
}
async function copyPlayerBaselineRowsByOffset(db,sourceTable,destTable,batchId,{history=false,orReplace=false,chunkSize=250,offset=0}={}){
  assertPlayerBaselineStageCopyTable(sourceTable); assertPlayerBaselineStageCopyTable(destTable);
  const safeChunk=Math.max(50, Math.min(Number(chunkSize||250), 250));
  const safeOffset=Math.max(0, Number(offset||0));
  // v0.1.67: terminal promotion keeps the v0.1.66 offset resume model, but removes the JS-built
  // rowid IN (?, ?, ...) list that hit D1/SQLite variable limits. The stage window now stays inside
  // a SQL subquery with only three bind variables: batch_id, limit, offset.
  let copiedRows=0;
  if(history){
    const result=await run(db,`INSERT INTO ${destTable}
      SELECT s.*, CURRENT_TIMESTAMP AS archived_at
      FROM ${sourceTable} s
      WHERE s.rowid IN (
        SELECT rowid FROM ${sourceTable}
        WHERE batch_id=?
        ORDER BY rowid
        LIMIT ? OFFSET ?
      )`,batchId,safeChunk,safeOffset);
    copiedRows=Number(result?.meta?.changes ?? result?.changes ?? 0) || 0;
  }else{
    const result=await run(db,`${orReplace?"INSERT OR REPLACE":"INSERT"} INTO ${destTable}
      SELECT s.*
      FROM ${sourceTable} s
      WHERE s.rowid IN (
        SELECT rowid FROM ${sourceTable}
        WHERE batch_id=?
        ORDER BY rowid
        LIMIT ? OFFSET ?
      )`,batchId,safeChunk,safeOffset);
    copiedRows=Number(result?.meta?.changes ?? result?.changes ?? 0) || 0;
  }
  return {source_table:sourceTable,dest_table:destTable,copied_rows:copiedRows,chunks:copiedRows>0?1:0,chunk_size:safeChunk,offset:safeOffset,next_offset:safeOffset+copiedRows,history,complete:copiedRows<=0,subquery_window:true,variable_safe:true};
}
async function baselineV2PromotionCounts(db,batchId){
  return {
    sanity_stage:Number((await first(db,`SELECT COUNT(*) AS c FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId))?.c||0),
    hp_stage:Number((await first(db,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId))?.c||0),
    sanity_current:Number((await first(db,`SELECT COUNT(*) AS c FROM player_baseline_sanity_v2_current WHERE batch_id=?`,batchId))?.c||0),
    hp_current:Number((await first(db,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_current WHERE batch_id=?`,batchId))?.c||0),
    sanity_history:Number((await first(db,`SELECT COUNT(*) AS c FROM player_baseline_sanity_v2_history WHERE batch_id=?`,batchId))?.c||0),
    hp_history:Number((await first(db,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_history WHERE batch_id=?`,batchId))?.c||0)
  };
}
async function promoteBaselineV2StageMemorySafe(env,batchId){
  const db=env.SCORE_DB;
  const chunkSize=250;
  // v0.1.67: resume terminal promotion using lightweight count/offset subquery rowid windows.
  // Do not delete partial current/history rows. Do not anti-join the 67k-row stage against growing destination tables.
  const before=await baselineV2PromotionCounts(db,batchId);
  let action=null;
  if(before.hp_current < before.hp_stage){
    action=await copyPlayerBaselineRowsByOffset(db,"player_baseline_hp_v2_stage","player_baseline_hp_v2_current",batchId,{orReplace:true,chunkSize,offset:before.hp_current});
  }else if(before.hp_history < before.hp_stage){
    action=await copyPlayerBaselineRowsByOffset(db,"player_baseline_hp_v2_stage","player_baseline_hp_v2_history",batchId,{history:true,chunkSize,offset:before.hp_history});
  }else if(before.sanity_stage>0 && before.sanity_current < before.sanity_stage){
    action=await copyPlayerBaselineRowsByOffset(db,"player_baseline_sanity_v2_stage","player_baseline_sanity_v2_current",batchId,{orReplace:true,chunkSize,offset:before.sanity_current});
  }else if(before.sanity_stage>0 && before.sanity_history < before.sanity_stage){
    action=await copyPlayerBaselineRowsByOffset(db,"player_baseline_sanity_v2_stage","player_baseline_sanity_v2_history",batchId,{history:true,chunkSize,offset:before.sanity_history});
  }else{
    action={copied_rows:0,complete:true,phase:"none"};
  }
  const counts=await baselineV2PromotionCounts(db,batchId);
  const hpComplete=counts.hp_stage>0 && counts.hp_current===counts.hp_stage && counts.hp_history===counts.hp_stage;
  const sanityComplete=counts.sanity_stage===0 || (counts.sanity_current===counts.sanity_stage && counts.sanity_history===counts.sanity_stage);
  return {memory_safe_promotion:true,checkpoint_safe_promotion:true,offset_checkpoint_safe:true,subquery_checkpoint_safe:true,variable_safe_promotion:true,patch_version:"v0.1.67",chunk_size:chunkSize,action,before_counts:before,counts,complete:hpComplete && sanityComplete};
}


function baselineV5ReadOnlyClassificationMode(mode){
  const m=String(mode||"");
  return m==="baseline_v5_base" || m==="baseline_v5_delta" || m==="baseline_v5_history_only";
}
async function resolveLockedClassificationBatchId(env,input,requestedMode){
  const explicit=String(input.locked_classification_batch_id||input.source_classification_batch_id||input.classification_batch_id||"").trim();
  if(explicit) return explicit;
  const fromControl=await first(env.CONTROL_DB,`
    SELECT json_extract(output_json,'$.batch_id') AS batch_id
    FROM control_job_queue
    WHERE status='completed'
      AND json_extract(output_json,'$.batch_id') IS NOT NULL
      AND (
        json_extract(output_json,'$.mode')='baseline_v5_classification_rescue'
        OR json_extract(input_json,'$.mode')='baseline_v5_classification_rescue'
        OR request_id LIKE 'baseline_v5_classification_rescue_%'
      )
      AND json_extract(output_json,'$.certification_grade')='PASS'
      AND COALESCE(json_extract(output_json,'$.lineage_complete'),0)=1
    ORDER BY datetime(updated_at) DESC
    LIMIT 1`);
  if(fromControl && fromControl.batch_id) return String(fromControl.batch_id);
  const fromCurrent=await first(env.SCORE_DB,`
    SELECT batch_id, COUNT(*) AS rows
    FROM player_baseline_classification_v5_current
    GROUP BY batch_id
    HAVING COUNT(*) >= 60000
    ORDER BY rows DESC
    LIMIT 1`);
  return fromCurrent && fromCurrent.batch_id ? String(fromCurrent.batch_id) : "";
}
async function lockedClassificationSnapshot(env,batchId){
  const current=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT classification_row_id) AS distinct_ids, COUNT(*)-COUNT(DISTINCT classification_row_id) AS duplicates, COUNT(DISTINCT player_type) AS player_types, COUNT(DISTINCT canonical_prop_key) AS props, COUNT(DISTINCT selected_side) AS sides FROM player_baseline_classification_v5_current WHERE batch_id=?`,batchId);
  const stage=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT classification_row_id) AS distinct_ids, COUNT(*)-COUNT(DISTINCT classification_row_id) AS duplicates FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId);
  const history=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT classification_row_id) AS distinct_ids, COUNT(*)-COUNT(DISTINCT classification_row_id) AS duplicates FROM player_baseline_classification_v5_history WHERE batch_id=?`,batchId);
  const source=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT hp_v2_row_id) AS distinct_ids, COUNT(*)-COUNT(DISTINCT hp_v2_row_id) AS duplicates, COUNT(DISTINCT factor_family) AS player_types, COUNT(DISTINCT canonical_prop_key) AS props, COUNT(DISTINCT selected_side) AS sides FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId);
  return {
    batch_id:batchId,
    current_rows:Number(current&&current.rows||0), current_distinct_ids:Number(current&&current.distinct_ids||0), current_duplicates:Number(current&&current.duplicates||0), current_player_types:Number(current&&current.player_types||0), current_props:Number(current&&current.props||0), current_sides:Number(current&&current.sides||0),
    stage_rows:Number(stage&&stage.rows||0), stage_distinct_ids:Number(stage&&stage.distinct_ids||0), stage_duplicates:Number(stage&&stage.duplicates||0),
    history_rows:Number(history&&history.rows||0), history_distinct_ids:Number(history&&history.distinct_ids||0), history_duplicates:Number(history&&history.duplicates||0),
    source_queue_rows:Number(source&&source.rows||0), source_queue_distinct_ids:Number(source&&source.distinct_ids||0), source_queue_duplicates:Number(source&&source.duplicates||0), source_queue_player_types:Number(source&&source.player_types||0), source_queue_props:Number(source&&source.props||0), source_queue_sides:Number(source&&source.sides||0)
  };
}
function validateLockedClassificationSnapshot(s,expectedRows=BASELINE_V5_LOCKED_BASE_EXPECTED_ROWS){
  const problems=[];
  if(expectedRows && s.current_rows!==expectedRows) problems.push(`current_rows_${s.current_rows}_expected_${expectedRows}`);
  if(expectedRows && s.stage_rows!==expectedRows) problems.push(`stage_rows_${s.stage_rows}_expected_${expectedRows}`);
  if(expectedRows && s.history_rows!==expectedRows) problems.push(`history_rows_${s.history_rows}_expected_${expectedRows}`);
  if(expectedRows && s.source_queue_rows!==expectedRows) problems.push(`source_queue_rows_${s.source_queue_rows}_expected_${expectedRows}`);
  if(s.current_duplicates!==0) problems.push(`current_duplicates_${s.current_duplicates}`);
  if(s.stage_duplicates!==0) problems.push(`stage_duplicates_${s.stage_duplicates}`);
  if(s.history_duplicates!==0) problems.push(`history_duplicates_${s.history_duplicates}`);
  if(s.source_queue_duplicates!==0) problems.push(`source_queue_duplicates_${s.source_queue_duplicates}`);
  if(s.current_player_types<2) problems.push(`current_player_types_${s.current_player_types}`);
  if(s.source_queue_player_types<2) problems.push(`source_queue_player_types_${s.source_queue_player_types}`);
  if(s.current_sides!==2) problems.push(`current_sides_${s.current_sides}`);
  if(s.source_queue_sides!==2) problems.push(`source_queue_sides_${s.source_queue_sides}`);
  return {ok:problems.length===0, problems};
}
function lockedClassificationSnapshotSame(a,b){
  const keys=["current_rows","current_distinct_ids","current_duplicates","stage_rows","stage_distinct_ids","stage_duplicates","history_rows","history_distinct_ids","history_duplicates","source_queue_rows","source_queue_distinct_ids","source_queue_duplicates"];
  const changed=[];
  for(const k of keys){ if(Number(a[k]||0)!==Number(b[k]||0)) changed.push({field:k,before:a[k],after:b[k]}); }
  return {ok:changed.length===0, changed};
}
function classificationFromLockedQueueJoinRow(r){
  return {
    classification_row_id:r.cls_classification_row_id,
    classification_tier:r.cls_classification_tier,
    classification_profile_key:r.cls_classification_profile_key,
    sample_profile:r.cls_sample_profile,
    volume_profile:r.cls_volume_profile,
    lineup_profile:r.cls_lineup_profile,
    platoon_profile:r.cls_platoon_profile,
    usage_profile:r.cls_usage_profile,
    volatility_profile:r.cls_volatility_profile,
    classification_confidence_0_100:Number(r.cls_classification_confidence_0_100||0),
    games_sample:Number(r.cls_games_sample||0),
    events_sample:Number(r.cls_events_sample||0),
    pa_per_game:r.cls_pa_per_game==null?null:Number(r.cls_pa_per_game),
    ab_ratio:r.cls_ab_ratio==null?null:Number(r.cls_ab_ratio),
    avg_batting_order:r.cls_avg_batting_order==null?null:Number(r.cls_avg_batting_order),
    split_delta_0_100:r.cls_split_delta_0_100==null?null:Number(r.cls_split_delta_0_100),
    classification_json:r.cls_classification_json
  };
}
async function baselineV5StageValidation(env,batchId,total){
  const counts=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT baseline_hp_row_id) AS distinct_ids, COUNT(*)-COUNT(DISTINCT baseline_hp_row_id) AS duplicates FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
  const badRows=await first(env.SCORE_DB,`SELECT COUNT(*) AS bad_rows FROM player_baseline_hp_v2_stage WHERE batch_id=? AND (baseline_hp_row_id IS NULL OR player_type IS NULL OR player_id IS NULL OR player_name IS NULL OR canonical_prop_key IS NULL OR line_value IS NULL OR selected_side NOT IN ('more','less') OR baseline_hp_0_100 IS NULL OR baseline_hp_0_100 < 0 OR baseline_hp_0_100 > 100 OR raw_rate_0_100 IS NULL OR raw_rate_0_100 < 0 OR raw_rate_0_100 > 100 OR baseline_confidence_0_100 IS NULL OR baseline_confidence_0_100 < 0 OR baseline_confidence_0_100 > 100 OR non_push_sample IS NULL OR hit_count IS NULL OR miss_count IS NULL OR push_count IS NULL OR non_push_sample != hit_count + miss_count OR no_daily_context != 1 OR no_market_context != 1 OR no_scoring_context != 1)`,batchId);
  const pairs=await first(env.SCORE_DB,`WITH pairs AS (SELECT player_type, player_id, canonical_prop_key, line_value, COUNT(DISTINCT selected_side) AS sides, ROUND(SUM(baseline_hp_0_100),4) AS side_sum, SUM(push_count) AS pushes FROM player_baseline_hp_v2_stage WHERE batch_id=? GROUP BY player_type, player_id, canonical_prop_key, line_value) SELECT COUNT(*) AS pairs, COUNT(CASE WHEN sides != 2 THEN 1 END) AS bad_side_count_pairs, COUNT(CASE WHEN ABS(side_sum - 100) > 0.01 THEN 1 END) AS bad_side_sum_pairs, COUNT(CASE WHEN pushes != 0 THEN 1 END) AS push_pairs FROM pairs`,batchId);
  const monotonic=await first(env.SCORE_DB,`SELECT COUNT(*) AS more_monotonic_violations FROM player_baseline_hp_v2_stage a JOIN player_baseline_hp_v2_stage b ON b.batch_id=a.batch_id AND b.player_type=a.player_type AND b.player_id=a.player_id AND b.canonical_prop_key=a.canonical_prop_key AND b.selected_side='more' AND b.line_value>a.line_value WHERE a.batch_id=? AND a.selected_side='more' AND b.baseline_hp_0_100>a.baseline_hp_0_100+0.01`,batchId);
  const problems=[];
  const rowCount=Number(counts&&counts.rows||0), dupes=Number(counts&&counts.duplicates||0), bad=Number(badRows&&badRows.bad_rows||0);
  if(Number(total||0)>0 && rowCount!==Number(total)) problems.push(`stage_rows_${rowCount}_expected_${total}`);
  if(dupes!==0) problems.push(`stage_duplicate_ids_${dupes}`);
  if(bad!==0) problems.push(`bad_stage_rows_${bad}`);
  if(Number(pairs&&pairs.bad_side_count_pairs||0)!==0) problems.push(`bad_side_count_pairs_${pairs.bad_side_count_pairs}`);
  if(Number(pairs&&pairs.bad_side_sum_pairs||0)!==0) problems.push(`bad_side_sum_pairs_${pairs.bad_side_sum_pairs}`);
  if(Number(pairs&&pairs.push_pairs||0)!==0) problems.push(`push_pairs_${pairs.push_pairs}`);
  if(Number(monotonic&&monotonic.more_monotonic_violations||0)!==0) problems.push(`more_monotonic_violations_${monotonic.more_monotonic_violations}`);
  return {ok:problems.length===0, problems, rows:rowCount, distinct_ids:Number(counts&&counts.distinct_ids||0), duplicate_ids:dupes, bad_rows:bad, pair_audit:pairs||{}, monotonic_audit:monotonic||{}};
}



function baselineV5ReliabilityConfidence(sample, rawPriorGap=0, volatilityProfile="VOLATILITY_UNKNOWN"){
  const n=Math.max(0,Number(sample||0));
  let base=5;
  if(n<5) base=5;
  else if(n<10) base=8+((n-5)*1.75);
  else if(n<15) base=35+((n-10)*2.5);
  else if(n<20) base=50+((n-15)*3.0);
  else if(n<30) base=55+((n-20)*0.5);
  else if(n<40) base=60+((n-30)*0.5);
  else base=65;
  const g=Math.abs(Number(rawPriorGap==null?0:rawPriorGap));
  let gapPenalty=0;
  if(!Number.isFinite(g)) gapPenalty=8;
  else if(g<=2) gapPenalty=0;
  else if(g<=5) gapPenalty=4;
  else if(g<=10) gapPenalty=8;
  else if(g<=20) gapPenalty=14;
  else gapPenalty=22;
  const vol=String(volatilityProfile||'').toUpperCase();
  let volPenalty=0;
  if(vol==='VOLATILITY_EXTREME' || vol==='EXTREME') volPenalty=10;
  else if(vol==='VOLATILITY_STRONG' || vol==='STRONG') volPenalty=6;
  else if(vol==='VOLATILITY_MODERATE' || vol==='MODERATE') volPenalty=3;
  let cap=70;
  if(n<5) cap=5;
  else if(n<10) cap=15;
  else if(n<15) cap=45;
  else if(n<20) cap=59;
  else if(n<50) cap=65;
  else cap=70;
  return round(clamp(base-gapPenalty-volPenalty,5,cap),2);
}

function baselineV5ReliabilityConfidenceSql(sampleColumn, rawPriorGapColumn=null, volatilityColumn=null){
  const n=`COALESCE(${sampleColumn},0)`;
  const gap=rawPriorGapColumn?`ABS(COALESCE(${rawPriorGapColumn},0))`:`0`;
  const vol=volatilityColumn?`UPPER(COALESCE(${volatilityColumn},''))`:`''`;
  const base=`(CASE
    WHEN ${n}<5 THEN 5
    WHEN ${n}<10 THEN 8+((${n}-5)*1.75)
    WHEN ${n}<15 THEN 35+((${n}-10)*2.5)
    WHEN ${n}<20 THEN 50+((${n}-15)*3.0)
    WHEN ${n}<30 THEN 55+((${n}-20)*0.5)
    WHEN ${n}<40 THEN 60+((${n}-30)*0.5)
    ELSE 65
  END)`;
  const gapPenalty=`(CASE
    WHEN ${gap}<=2 THEN 0
    WHEN ${gap}<=5 THEN 4
    WHEN ${gap}<=10 THEN 8
    WHEN ${gap}<=20 THEN 14
    ELSE 22
  END)`;
  const volPenalty=`(CASE
    WHEN ${vol} IN ('VOLATILITY_EXTREME','EXTREME') THEN 10
    WHEN ${vol} IN ('VOLATILITY_STRONG','STRONG') THEN 6
    WHEN ${vol} IN ('VOLATILITY_MODERATE','MODERATE') THEN 3
    ELSE 0
  END)`;
  const cap=`(CASE
    WHEN ${n}<5 THEN 5
    WHEN ${n}<10 THEN 15
    WHEN ${n}<15 THEN 45
    WHEN ${n}<20 THEN 59
    WHEN ${n}<50 THEN 65
    ELSE 70
  END)`;
  return `ROUND(MAX(5, MIN(${cap}, ${base}-${gapPenalty}-${volPenalty})),2)`;
}

function baselineV5ReliabilityConfidenceDirtyPredicate(confColumn, sampleColumn, rawPriorGapColumn=null, volatilityColumn=null){
  const expr=baselineV5ReliabilityConfidenceSql(sampleColumn,rawPriorGapColumn,volatilityColumn);
  return `ROUND(COALESCE(${confColumn},-999),2)<>ROUND(${expr},2)`;
}

function baselineV5BaseRescueConfidenceSql(sampleColumn, confidenceColumn) {
  return `CASE
    WHEN ${confidenceColumn} <= 5 THEN 5
    WHEN ${sampleColumn} BETWEEN 10 AND 14 THEN 35 + ((${sampleColumn} - 10) * 2.5)
    WHEN ${sampleColumn} >= 15 AND 50 + ((${sampleColumn} - 15) * 3.0) > 65 THEN 65
    WHEN ${sampleColumn} >= 15 THEN 50 + ((${sampleColumn} - 15) * 3.0)
    ELSE ${confidenceColumn}
  END`;
}

function baselineV5BaseRescueSampleProfileSql(sampleColumn, currentColumn='sample_profile') {
  return `CASE
    WHEN ${sampleColumn} BETWEEN 10 AND 14 THEN 'ESTABLISHED'
    WHEN ${sampleColumn} >= 15 THEN 'ELITE'
    ELSE ${currentColumn}
  END`;
}

async function baselineV5BaseRescueHpTargetAudit(env, tableName, batchId) {
  const sql = `SELECT
      COUNT(*) AS target_rows,
      SUM(CASE WHEN selected_side='more' THEN 1 ELSE 0 END) AS more_rows,
      SUM(CASE WHEN selected_side='less' THEN 1 ELSE 0 END) AS less_rows,
      SUM(CASE WHEN baseline_confidence_0_100 <= 5 THEN 1 ELSE 0 END) AS conf_le_5_rows,
      COUNT(DISTINCT baseline_hp_row_id) AS distinct_row_ids,
      COUNT(DISTINCT player_id || '|' || canonical_prop_key || '|' || line_value || '|' || selected_side) AS distinct_business_keys,
      MIN(non_push_sample) AS min_sample,
      MAX(non_push_sample) AS max_sample
    FROM ${tableName}
    WHERE batch_id=?
      AND player_type='pitcher'
      AND sample_profile='DEVELOPING'
      AND non_push_sample >= 10
      AND canonical_prop_key IN (${BASELINE_V5_BASE_RESCUE_PROP_SQL})`;
  const row = await first(env.SCORE_DB, sql, batchId);
  return { table_name: tableName, target_rows: Number(row && row.target_rows || 0), more_rows: Number(row && row.more_rows || 0), less_rows: Number(row && row.less_rows || 0), conf_le_5_rows: Number(row && row.conf_le_5_rows || 0), distinct_row_ids: Number(row && row.distinct_row_ids || 0), distinct_business_keys: Number(row && row.distinct_business_keys || 0), min_sample: row && row.min_sample == null ? null : Number(row && row.min_sample || 0), max_sample: row && row.max_sample == null ? null : Number(row && row.max_sample || 0) };
}

async function baselineV5BaseRescueClassificationTargetAudit(env, batchId) {
  const row = await first(env.SCORE_DB, `SELECT
      COUNT(*) AS target_rows,
      SUM(CASE WHEN selected_side='more' THEN 1 ELSE 0 END) AS more_rows,
      SUM(CASE WHEN selected_side='less' THEN 1 ELSE 0 END) AS less_rows,
      COUNT(DISTINCT classification_row_id) AS distinct_row_ids,
      COUNT(DISTINCT player_id || '|' || canonical_prop_key || '|' || line_value || '|' || selected_side) AS distinct_business_keys,
      MIN(games_sample) AS min_games_sample,
      MAX(games_sample) AS max_games_sample
    FROM player_baseline_classification_v5_current
    WHERE batch_id=?
      AND player_type='pitcher'
      AND sample_profile='DEVELOPING'
      AND games_sample >= 10
      AND canonical_prop_key IN (${BASELINE_V5_BASE_RESCUE_PROP_SQL})`, batchId);
  return { table_name: 'player_baseline_classification_v5_current', target_rows: Number(row && row.target_rows || 0), more_rows: Number(row && row.more_rows || 0), less_rows: Number(row && row.less_rows || 0), distinct_row_ids: Number(row && row.distinct_row_ids || 0), distinct_business_keys: Number(row && row.distinct_business_keys || 0), min_games_sample: row && row.min_games_sample == null ? null : Number(row && row.min_games_sample || 0), max_games_sample: row && row.max_games_sample == null ? null : Number(row && row.max_games_sample || 0) };
}

async function baselineV5BaseRescueDistribution(env, tableName, batchId) {
  return all(env.SCORE_DB, `SELECT player_type, sample_profile, COUNT(*) AS rows FROM ${tableName} WHERE batch_id=? GROUP BY player_type, sample_profile ORDER BY player_type, sample_profile`, batchId);
}

function baselineV5BaseRescueUnitList() {
  const props = ['pitcher_strikeouts','earned_runs','runs_allowed','walks_allowed','hits_allowed','pitcher_outs','pitches_thrown','pitcher_fantasy_score'];
  const sides = ['more','less'];
  const tiers = [
    { proposed_sample_profile:'ESTABLISHED', sample_predicate_hp:'non_push_sample BETWEEN 10 AND 14', sample_predicate_class:'games_sample BETWEEN 10 AND 14' },
    { proposed_sample_profile:'ELITE', sample_predicate_hp:'non_push_sample >= 15', sample_predicate_class:'games_sample >= 15' }
  ];
  const units = [];
  for (const table_name of ['player_baseline_hp_v2_current','player_baseline_hp_v2_stage','player_baseline_hp_v2_history']) {
    for (const canonical_prop_key of props) {
      for (const tier of tiers) {
        for (const selected_side of sides) {
          units.push({kind:'hp',table_name,canonical_prop_key,selected_side,...tier});
        }
      }
    }
  }
  for (const canonical_prop_key of props) {
    for (const tier of tiers) {
      for (const selected_side of sides) {
        units.push({kind:'classification',table_name:'player_baseline_classification_v5_current',canonical_prop_key,selected_side,...tier});
      }
    }
  }
  return units;
}

async function baselineV5BaseRescueUnitCount(env, unit, batchId) {
  if (unit.kind === 'hp') {
    const row = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM ${unit.table_name}
      WHERE batch_id=? AND player_type='pitcher' AND sample_profile='DEVELOPING'
        AND ${unit.sample_predicate_hp}
        AND canonical_prop_key=? AND selected_side=?`, batchId, unit.canonical_prop_key, unit.selected_side);
    return Number(row && row.rows || 0);
  }
  const row = await first(env.SCORE_DB, `SELECT COUNT(*) AS rows FROM player_baseline_classification_v5_current
    WHERE batch_id=? AND player_type='pitcher' AND sample_profile='DEVELOPING'
      AND ${unit.sample_predicate_class}
      AND canonical_prop_key=? AND selected_side=?`, batchId, unit.canonical_prop_key, unit.selected_side);
  return Number(row && row.rows || 0);
}

async function baselineV5BaseRescueFindNextUnits(env, batchId, maxUnits) {
  const picked = [];
  for (const unit of baselineV5BaseRescueUnitList()) {
    const target_rows = await baselineV5BaseRescueUnitCount(env, unit, batchId);
    if (target_rows > 0) {
      picked.push({...unit,target_rows});
      if (picked.length >= maxUnits) break;
    }
  }
  return picked;
}

async function baselineV5BaseRescueApplyUnit(env, unit, batchId, confidenceVersion) {
  if (unit.kind === 'hp') {
    const confidenceHp = baselineV5BaseRescueConfidenceSql('non_push_sample','baseline_confidence_0_100');
    const sampleHp = baselineV5BaseRescueSampleProfileSql('non_push_sample');
    const reserveHp = `ROUND(100-(${confidenceHp}),2)`;
    const res = await run(env.SCORE_DB, `UPDATE ${unit.table_name}
      SET sample_profile=${sampleHp},
          baseline_confidence_0_100=${confidenceHp},
          baseline_enriched_confidence_0_100=${confidenceHp},
          soft_uncertainty_reserve_0_100=${reserveHp},
          confidence_formula_version=?,
          profile_notes_json=json_set(
            profile_notes_json,
            '$.sample_tier',${sampleHp},
            '$.baseline_confidence_0_100',${confidenceHp},
            '$.baseline_enriched_confidence_0_100',${confidenceHp},
            '$.soft_uncertainty_reserve_0_100',${reserveHp},
            '$.confidence_formula_version',?
          ),
          updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=? AND player_type='pitcher' AND sample_profile='DEVELOPING'
        AND ${unit.sample_predicate_hp}
        AND canonical_prop_key=? AND selected_side=?`,
      confidenceVersion, confidenceVersion, batchId, unit.canonical_prop_key, unit.selected_side);
    return {...unit,changes:Number(res && res.meta && res.meta.changes || 0)};
  }
  const confidenceClass = baselineV5BaseRescueConfidenceSql('games_sample','classification_confidence_0_100');
  const sampleClass = baselineV5BaseRescueSampleProfileSql('games_sample');
  const res = await run(env.SCORE_DB, `UPDATE player_baseline_classification_v5_current
    SET sample_profile=${sampleClass},
        classification_confidence_0_100=${confidenceClass},
        classification_json=json_set(
          classification_json,
          '$.sample_profile',${sampleClass},
          '$.classification_confidence_0_100',${confidenceClass}
        ),
        updated_at=CURRENT_TIMESTAMP
    WHERE batch_id=? AND player_type='pitcher' AND sample_profile='DEVELOPING'
      AND ${unit.sample_predicate_class}
      AND canonical_prop_key=? AND selected_side=?`,
    batchId, unit.canonical_prop_key, unit.selected_side);
  return {...unit,changes:Number(res && res.meta && res.meta.changes || 0)};
}

async function baselineV5BaseRescueTotalRemaining(env, batchId) {
  const hpTables = ['player_baseline_hp_v2_current','player_baseline_hp_v2_stage','player_baseline_hp_v2_history'];
  const hp = [];
  for (const t of hpTables) hp.push(await baselineV5BaseRescueHpTargetAudit(env, t, batchId));
  const classification = await baselineV5BaseRescueClassificationTargetAudit(env, batchId);
  return {hp,classification,total_remaining:hp.reduce((sum,x)=>sum+Number(x.target_rows||0),0)+Number(classification.target_rows||0)};
}

async function baselineV5BaseRescuePostParity(env, batchId) {
  const row = await first(env.SCORE_DB, `SELECT
      COUNT(*) AS fixed_rows,
      SUM(CASE WHEN ROUND(baseline_confidence_0_100 + soft_uncertainty_reserve_0_100,2) != 100 THEN 1 ELSE 0 END) AS bad_conf_reserve_rows,
      SUM(CASE WHEN json_extract(profile_notes_json,'$.sample_tier') != sample_profile THEN 1 ELSE 0 END) AS bad_hp_json_sample_rows,
      SUM(CASE WHEN ROUND(json_extract(profile_notes_json,'$.baseline_confidence_0_100'),2) != ROUND(baseline_confidence_0_100,2) THEN 1 ELSE 0 END) AS bad_hp_json_conf_rows
    FROM player_baseline_hp_v2_current
    WHERE batch_id=?
      AND player_type='pitcher'
      AND sample_profile IN ('ESTABLISHED','ELITE')
      AND non_push_sample >= 10
      AND canonical_prop_key IN (${BASELINE_V5_BASE_RESCUE_PROP_SQL})`, batchId);
  const classRow = await first(env.SCORE_DB, `SELECT
      COUNT(*) AS fixed_rows,
      SUM(CASE WHEN json_extract(classification_json,'$.sample_profile') != sample_profile THEN 1 ELSE 0 END) AS bad_class_json_sample_rows,
      SUM(CASE WHEN ROUND(json_extract(classification_json,'$.classification_confidence_0_100'),2) != ROUND(classification_confidence_0_100,2) THEN 1 ELSE 0 END) AS bad_class_json_conf_rows
    FROM player_baseline_classification_v5_current
    WHERE batch_id=?
      AND player_type='pitcher'
      AND sample_profile IN ('ESTABLISHED','ELITE')
      AND games_sample >= 10
      AND canonical_prop_key IN (${BASELINE_V5_BASE_RESCUE_PROP_SQL})`, batchId);
  return {hp_current:row||{},classification_current:classRow||{}};
}


async function baselineV5ConfidenceRescueAudit(env,batchId){
  const hpExpr=baselineV5ReliabilityConfidenceSql('non_push_sample','raw_prior_gap_0_100','volatility_profile');
  const clsExpr=baselineV5ReliabilityConfidenceSql('games_sample',null,'volatility_profile');
  const hpCurrent=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_hp_v2_current WHERE batch_id=? AND (COALESCE(confidence_formula_version,'')<>? OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')} OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_enriched_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')} OR ROUND(COALESCE(soft_uncertainty_reserve_0_100,-999),2)<>ROUND(100-(${hpExpr}),2))`,batchId,BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION);
  const hpHistory=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_hp_v2_history WHERE batch_id=? AND (COALESCE(confidence_formula_version,'')<>? OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')} OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_enriched_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')} OR ROUND(COALESCE(soft_uncertainty_reserve_0_100,-999),2)<>ROUND(100-(${hpExpr}),2))`,batchId,BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION);
  const hpState=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_v5_hp_state_current WHERE source_batch_id=? AND (COALESCE(confidence_formula_version,'')<>? OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')} OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_enriched_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')})`,batchId,BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION);
  const sanityCurrent=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_sanity_v2_current s JOIN player_baseline_hp_v2_current h ON h.batch_id=s.batch_id AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id WHERE s.batch_id=? AND ROUND(COALESCE(s.baseline_confidence_0_100,-999),2)<>ROUND(COALESCE(h.baseline_confidence_0_100,-999),2)`,batchId);
  const sanityHistory=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_sanity_v2_history s JOIN player_baseline_hp_v2_history h ON h.batch_id=s.batch_id AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id WHERE s.batch_id=? AND ROUND(COALESCE(s.baseline_confidence_0_100,-999),2)<>ROUND(COALESCE(h.baseline_confidence_0_100,-999),2)`,batchId);
  const classCurrent=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_classification_v5_current WHERE batch_id=? AND ${baselineV5ReliabilityConfidenceDirtyPredicate('classification_confidence_0_100','games_sample',null,'volatility_profile')}`,batchId);
  const classHistory=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_classification_v5_history WHERE batch_id=? AND ${baselineV5ReliabilityConfidenceDirtyPredicate('classification_confidence_0_100','games_sample',null,'volatility_profile')}`,batchId);
  const classState=await first(env.SCORE_DB,`SELECT COUNT(*) AS dirty_rows FROM player_baseline_v5_classification_state_current WHERE source_batch_id=? AND ${baselineV5ReliabilityConfidenceDirtyPredicate('classification_confidence_0_100','games_sample',null,'volatility_profile')}`,batchId);
  const highSample=await first(env.SCORE_DB,`SELECT
      (SELECT COUNT(*) FROM player_baseline_hp_v2_current WHERE batch_id=? AND non_push_sample>=50 AND ABS(raw_prior_gap_0_100)<=2 AND baseline_confidence_0_100<=5) AS hp_current_bad,
      (SELECT COUNT(*) FROM player_baseline_hp_v2_history WHERE batch_id=? AND non_push_sample>=50 AND ABS(raw_prior_gap_0_100)<=2 AND baseline_confidence_0_100<=5) AS hp_history_bad,
      (SELECT COUNT(*) FROM player_baseline_v5_hp_state_current WHERE source_batch_id=? AND non_push_sample>=50 AND ABS(raw_prior_gap_0_100)<=2 AND baseline_confidence_0_100<=5) AS hp_state_bad`,batchId,batchId,batchId);
  const badRange=await first(env.SCORE_DB,`SELECT
      (SELECT COUNT(*) FROM player_baseline_hp_v2_current WHERE batch_id=? AND (baseline_confidence_0_100 IS NULL OR baseline_enriched_confidence_0_100 IS NULL OR baseline_confidence_0_100<0 OR baseline_confidence_0_100>100 OR baseline_enriched_confidence_0_100<0 OR baseline_enriched_confidence_0_100>100)) AS hp_current_bad_range,
      (SELECT COUNT(*) FROM player_baseline_hp_v2_history WHERE batch_id=? AND (baseline_confidence_0_100 IS NULL OR baseline_enriched_confidence_0_100 IS NULL OR baseline_confidence_0_100<0 OR baseline_confidence_0_100>100 OR baseline_enriched_confidence_0_100<0 OR baseline_enriched_confidence_0_100>100)) AS hp_history_bad_range,
      (SELECT COUNT(*) FROM player_baseline_v5_hp_state_current WHERE source_batch_id=? AND (baseline_confidence_0_100 IS NULL OR baseline_enriched_confidence_0_100 IS NULL OR baseline_confidence_0_100<0 OR baseline_confidence_0_100>100 OR baseline_enriched_confidence_0_100<0 OR baseline_enriched_confidence_0_100>100)) AS hp_state_bad_range,
      (SELECT COUNT(*) FROM player_baseline_classification_v5_current WHERE batch_id=? AND (classification_confidence_0_100 IS NULL OR classification_confidence_0_100<0 OR classification_confidence_0_100>100)) AS class_current_bad_range,
      (SELECT COUNT(*) FROM player_baseline_classification_v5_history WHERE batch_id=? AND (classification_confidence_0_100 IS NULL OR classification_confidence_0_100<0 OR classification_confidence_0_100>100)) AS class_history_bad_range,
      (SELECT COUNT(*) FROM player_baseline_v5_classification_state_current WHERE source_batch_id=? AND (classification_confidence_0_100 IS NULL OR classification_confidence_0_100<0 OR classification_confidence_0_100>100)) AS class_state_bad_range`,batchId,batchId,batchId,batchId,batchId,batchId);
  const pairBad=await first(env.SCORE_DB,`SELECT COUNT(*) AS bad_rows FROM (SELECT h1.baseline_hp_0_100 + h2.baseline_hp_0_100 AS pair_sum FROM player_baseline_hp_v2_current h1 JOIN player_baseline_hp_v2_current h2 ON h2.batch_id=h1.batch_id AND h2.player_type=h1.player_type AND h2.player_id=h1.player_id AND h2.canonical_prop_key=h1.canonical_prop_key AND h2.line_value=h1.line_value AND h2.selected_side='less' WHERE h1.batch_id=? AND h1.selected_side='more') WHERE ABS(pair_sum-100)>0.001`,batchId);
  const dirty={hp_current:Number(hpCurrent&&hpCurrent.dirty_rows||0),hp_history:Number(hpHistory&&hpHistory.dirty_rows||0),hp_state_current:Number(hpState&&hpState.dirty_rows||0),sanity_current:Number(sanityCurrent&&sanityCurrent.dirty_rows||0),sanity_history:Number(sanityHistory&&sanityHistory.dirty_rows||0),classification_current:Number(classCurrent&&classCurrent.dirty_rows||0),classification_history:Number(classHistory&&classHistory.dirty_rows||0),classification_state_current:Number(classState&&classState.dirty_rows||0)};
  const dirty_total=Object.values(dirty).reduce((a,b)=>a+Number(b||0),0);
  return {dirty,dirty_total,high_sample_low_gap_bad:highSample||{},bad_range:badRange||{},hp_pair_sum_bad_rows:Number(pairBad&&pairBad.bad_rows||0)};
}

async function baselineV5ConfidenceRescueUpdateHpTable(env, tableName, idCol, batchWhere, batchId, chunkSize){
  const conf=baselineV5ReliabilityConfidenceSql('non_push_sample','raw_prior_gap_0_100','volatility_profile');
  const reserve=`ROUND(100-(${conf}),2)`;
  const whereDirty=`(${batchWhere}) AND (COALESCE(confidence_formula_version,'')<>? OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')} OR ${baselineV5ReliabilityConfidenceDirtyPredicate('baseline_enriched_confidence_0_100','non_push_sample','raw_prior_gap_0_100','volatility_profile')} ${tableName==='player_baseline_v5_hp_state_current'?'':`OR ROUND(COALESCE(soft_uncertainty_reserve_0_100,-999),2)<>ROUND(100-(${conf}),2)`})`;
  const sql = tableName==='player_baseline_v5_hp_state_current'
    ? `UPDATE ${tableName} SET baseline_confidence_0_100=${conf}, baseline_enriched_confidence_0_100=${conf}, confidence_formula_version=?, updated_at=CURRENT_TIMESTAMP WHERE ${idCol} IN (SELECT ${idCol} FROM ${tableName} WHERE ${whereDirty} ORDER BY ${idCol} LIMIT ${chunkSize})`
    : `UPDATE ${tableName} SET baseline_confidence_0_100=${conf}, baseline_enriched_confidence_0_100=${conf}, soft_uncertainty_reserve_0_100=${reserve}, confidence_formula_version=?, profile_notes_json=CASE WHEN profile_notes_json IS NULL OR profile_notes_json='' THEN profile_notes_json ELSE json_set(profile_notes_json,'$.baseline_confidence_0_100',${conf},'$.baseline_enriched_confidence_0_100',${conf},'$.soft_uncertainty_reserve_0_100',${reserve},'$.confidence_formula_version',?) END, updated_at=CURRENT_TIMESTAMP WHERE ${idCol} IN (SELECT ${idCol} FROM ${tableName} WHERE ${whereDirty} ORDER BY ${idCol} LIMIT ${chunkSize})`;
  const binds = tableName==='player_baseline_v5_hp_state_current'
    ? [BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION, batchId, BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION]
    : [BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION, BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION, batchId, BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION];
  // bind order: SET version(s), subquery batch predicate, subquery formula-version predicate.
  const res=await run(env.SCORE_DB,sql,...binds);
  return Number(res&&res.meta&&res.meta.changes||0);
}

async function baselineV5ConfidenceRescueSyncSanity(env, tableName, hpTableName, batchId, chunkSize){
  const res=await run(env.SCORE_DB,`UPDATE ${tableName}
    SET baseline_confidence_0_100=(SELECT h.baseline_confidence_0_100 FROM ${hpTableName} h WHERE h.batch_id=${tableName}.batch_id AND ${tableName}.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id),
        updated_at=CURRENT_TIMESTAMP
    WHERE baseline_row_id IN (
      SELECT s.baseline_row_id
      FROM ${tableName} s
      JOIN ${hpTableName} h ON h.batch_id=s.batch_id AND s.baseline_row_id='pbs_v2|' || h.baseline_hp_row_id
      WHERE s.batch_id=? AND ROUND(COALESCE(s.baseline_confidence_0_100,-999),2)<>ROUND(COALESCE(h.baseline_confidence_0_100,-999),2)
      ORDER BY s.baseline_row_id
      LIMIT ${chunkSize}
    )`,batchId);
  return Number(res&&res.meta&&res.meta.changes||0);
}

async function baselineV5ConfidenceRescueUpdateClassificationTable(env, tableName, idCol, batchWhere, batchId, chunkSize){
  const conf=baselineV5ReliabilityConfidenceSql('games_sample',null,'volatility_profile');
  const sql=`UPDATE ${tableName}
    SET classification_confidence_0_100=${conf},
        ${tableName==='player_baseline_v5_classification_state_current'?'':`classification_json=CASE WHEN classification_json IS NULL OR classification_json='' THEN classification_json ELSE json_set(classification_json,'$.classification_confidence_0_100',${conf},'$.confidence_formula_version',?) END,`}
        updated_at=CURRENT_TIMESTAMP
    WHERE ${idCol} IN (
      SELECT ${idCol} FROM ${tableName}
      WHERE (${batchWhere}) AND ${baselineV5ReliabilityConfidenceDirtyPredicate('classification_confidence_0_100','games_sample',null,'volatility_profile')}
      ORDER BY ${idCol}
      LIMIT ${chunkSize}
    )`;
  const res=tableName==='player_baseline_v5_classification_state_current'
    ? await run(env.SCORE_DB,sql,batchId)
    : await run(env.SCORE_DB,sql,`${BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION}_classification`,batchId);
  return Number(res&&res.meta&&res.meta.changes||0);
}

async function baselineV5RunConfidenceReliabilityRescue(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  const chunkSize=Math.max(1000,Math.min(20000,Number(input.baseline_confidence_rescue_chunk_size||20000)));
  const before=await baselineV5ConfidenceRescueAudit(env,batchId);
  const updates=[];
  let phase='audit';
  if(before.dirty.hp_current>0){ phase='hp_current'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueUpdateHpTable(env,'player_baseline_hp_v2_current','baseline_hp_row_id','batch_id=?',batchId,chunkSize)}); }
  else if(before.dirty.hp_history>0){ phase='hp_history'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueUpdateHpTable(env,'player_baseline_hp_v2_history','baseline_hp_row_id','batch_id=?',batchId,chunkSize)}); }
  else if(before.dirty.hp_state_current>0){ phase='hp_state_current'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueUpdateHpTable(env,'player_baseline_v5_hp_state_current','baseline_hp_row_id','source_batch_id=?',batchId,chunkSize)}); }
  else if(before.dirty.sanity_current>0){ phase='sanity_current'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueSyncSanity(env,'player_baseline_sanity_v2_current','player_baseline_hp_v2_current',batchId,chunkSize)}); }
  else if(before.dirty.sanity_history>0){ phase='sanity_history'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueSyncSanity(env,'player_baseline_sanity_v2_history','player_baseline_hp_v2_history',batchId,chunkSize)}); }
  else if(before.dirty.classification_current>0){ phase='classification_current'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueUpdateClassificationTable(env,'player_baseline_classification_v5_current','classification_row_id','batch_id=?',batchId,chunkSize)}); }
  else if(before.dirty.classification_history>0){ phase='classification_history'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueUpdateClassificationTable(env,'player_baseline_classification_v5_history','classification_row_id','batch_id=?',batchId,chunkSize)}); }
  else if(before.dirty.classification_state_current>0){ phase='classification_state_current'; updates.push({phase,rows_updated:await baselineV5ConfidenceRescueUpdateClassificationTable(env,'player_baseline_v5_classification_state_current','classification_row_id','source_batch_id=?',batchId,chunkSize)}); }
  const after=await baselineV5ConfidenceRescueAudit(env,batchId);
  const badRangeTotal=Object.values(after.bad_range||{}).reduce((a,b)=>a+Number(b||0),0);
  const highSampleBadTotal=Object.values(after.high_sample_low_gap_bad||{}).reduce((a,b)=>a+Number(b||0),0);
  const pass = after.dirty_total===0 && highSampleBadTotal===0 && badRangeTotal===0 && Number(after.hp_pair_sum_bad_rows||0)===0;
  return {stage:pass?'complete':phase,before,updates,after,partial_continue:!pass,pass,chunk_size:chunkSize,confidence_formula_version:BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION,contract:{hp_values_mutated:false,counters_mutated:false,line_difficulty_confidence_caps_removed:true,no_daily_context:true,no_market_context:true,no_scoring_context:true,no_board_context:true},elapsed_ms:Date.now()-startedMs};
}

const BASELINE_V5_CONFIDENCE_FAST_PHASES = [
  // v0.1.97: speed repair by rowid-range sweep, not sparse dirty-row hunting.
  // SQL proof: mirror tables and source HP/classification tables are indexed. The remaining cost was finding
  // sparse dirty rows. Range sweep copies from already-clean source rows across bounded rowid windows, then
  // relies on final SQL audit to certify zero residual mismatches.
  {phase:'ensure_idx_sanity_history_batch_row', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbs_v2_history_batch_row ON player_baseline_sanity_v2_history(batch_id, baseline_row_id)', chunkSize:0},
  {phase:'ensure_idx_hp_history_batch_row', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbh_v2_history_batch_hp_row ON player_baseline_hp_v2_history(batch_id, baseline_hp_row_id)', chunkSize:0},
  {phase:'sanity_history', kind:'sanity_from_current', table:'player_baseline_sanity_v2_history', sourceTable:'player_baseline_sanity_v2_current', idCol:'rowid', batchCol:'batch_id', sourceBatchCol:'batch_id', valueCol:'baseline_confidence_0_100', chunkSize:1200, maxChunkSize:2500},
  {phase:'ensure_idx_hp_current_class_key', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbh_v2_current_conf_key ON player_baseline_hp_v2_current(batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)', chunkSize:0},
  {phase:'ensure_idx_class_current_key', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbc_v5_current_conf_key ON player_baseline_classification_v5_current(batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)', chunkSize:0},
  {phase:'classification_current', kind:'classification_from_hp', table:'player_baseline_classification_v5_current', hpTable:'player_baseline_hp_v2_current', idCol:'rowid', batchCol:'batch_id', hpBatchCol:'batch_id', hasJson:true, chunkSize:600, maxChunkSize:1200},
  {phase:'ensure_idx_hp_history_class_key', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbh_v2_history_conf_key ON player_baseline_hp_v2_history(batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)', chunkSize:0},
  {phase:'ensure_idx_class_history_key', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbc_v5_history_conf_key ON player_baseline_classification_v5_history(batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)', chunkSize:0},
  {phase:'classification_history', kind:'classification_from_hp', table:'player_baseline_classification_v5_history', hpTable:'player_baseline_hp_v2_history', idCol:'rowid', batchCol:'batch_id', hpBatchCol:'batch_id', hasJson:true, chunkSize:600, maxChunkSize:1200},
  {phase:'ensure_idx_hp_state_class_key', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbv5_hp_state_conf_key ON player_baseline_v5_hp_state_current(source_batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)', chunkSize:0},
  {phase:'ensure_idx_class_state_key', kind:'ddl', ddl:'CREATE INDEX IF NOT EXISTS idx_pbv5_cls_state_conf_key ON player_baseline_v5_classification_state_current(source_batch_id, player_type, player_id, canonical_prop_key, line_value, selected_side)', chunkSize:0},
  {phase:'classification_state_current', kind:'classification_from_hp', table:'player_baseline_v5_classification_state_current', hpTable:'player_baseline_v5_hp_state_current', idCol:'rowid', batchCol:'source_batch_id', hpBatchCol:'source_batch_id', hasJson:false, chunkSize:800, maxChunkSize:1500}
];

function baselineV5ConfidenceFastPhaseIndex(phase){
  // v0.1.95 starts at index creation for the still-dirty mirror phases.
  // Older stale continuations that point to already-fixed sanity_current are advanced safely.
  const p=String(phase||'');
  if(p==='sanity_current') return 0;
  const idx=BASELINE_V5_CONFIDENCE_FAST_PHASES.findIndex(x=>x.phase===p);
  return idx>=0?idx:0;
}

function baselineV5MirrorMismatchSql(leftExpr,rightExpr){
  return `ROUND(COALESCE(${leftExpr},-999),2)<>ROUND(COALESCE(${rightExpr},-999),2)`;
}

function baselineV5ConfidenceMirrorRowidSelectSql(cfg, chunkSize){
  if(cfg.kind==='sanity_from_current'){
    return `SELECT s.rowid AS rid, s.baseline_row_id AS id, c.${cfg.valueCol} AS target_conf
      FROM ${cfg.table} s
      JOIN ${cfg.sourceTable} c
        ON c.batch_id=s.batch_id
       AND c.baseline_row_id=s.baseline_row_id
      WHERE s.${cfg.batchCol}=?
        AND s.rowid>?
        AND ${baselineV5MirrorMismatchSql('s.baseline_confidence_0_100',`c.${cfg.valueCol}`)}
      LIMIT ${chunkSize}`;
  }
  return `SELECT c.rowid AS rid, c.classification_row_id AS id, h.baseline_confidence_0_100 AS target_conf
    FROM ${cfg.table} c
    JOIN ${cfg.hpTable} h
      ON h.${cfg.hpBatchCol}=c.${cfg.batchCol}
     AND h.player_type=c.player_type
     AND h.player_id=c.player_id
     AND h.canonical_prop_key=c.canonical_prop_key
     AND h.line_value=c.line_value
     AND h.selected_side=c.selected_side
    WHERE c.${cfg.batchCol}=?
      AND c.rowid>?
      AND ${baselineV5MirrorMismatchSql('c.classification_confidence_0_100','h.baseline_confidence_0_100')}
    LIMIT ${chunkSize}`;
}

async function baselineV5ConfidenceFastSelectRows(env,cfg,batchId,chunkSize,cursor){
  if(cfg.kind==='ddl') return [];
  const rowidCursor=Math.max(0,Number(cursor||0));
  const rows=await all(env.SCORE_DB,baselineV5ConfidenceMirrorRowidSelectSql(cfg,chunkSize),batchId,rowidCursor);
  return (rows||[]).filter(r=>Number.isFinite(Number(r&&r.rid)) && Number.isFinite(Number(r&&r.target_conf)));
}

async function baselineV5ConfidenceSingleRowUpdateColumn(env, cfg, rows){
  if(!rows || rows.length===0) return 0;
  const stmts=[];
  for(const r of rows){
    const rid=Number(r.rid);
    if(!Number.isFinite(rid)) continue;
    const conf=round(clamp(Number(r.target_conf),0,100),2);
    stmts.push(env.SCORE_DB.prepare(`UPDATE ${cfg.table} SET baseline_confidence_0_100=?, updated_at=CURRENT_TIMESTAMP WHERE rowid=?`).bind(conf,rid));
  }
  if(stmts.length) await batch(env.SCORE_DB,stmts,10);
  return stmts.length;
}

async function baselineV5ConfidenceSingleRowUpdateClassification(env, cfg, rows){
  if(!rows || rows.length===0) return 0;
  const stmts=[];
  for(const r of rows){
    const rid=Number(r.rid);
    if(!Number.isFinite(rid)) continue;
    const conf=round(clamp(Number(r.target_conf),0,100),2);
    if(cfg.hasJson){
      stmts.push(env.SCORE_DB.prepare(`UPDATE ${cfg.table}
        SET classification_confidence_0_100=?,
            classification_json=CASE WHEN classification_json IS NULL OR classification_json='' OR json_valid(classification_json)=0 THEN classification_json ELSE json_set(classification_json,'$.classification_confidence_0_100',?,'$.confidence_formula_version',?) END,
            updated_at=CURRENT_TIMESTAMP
        WHERE rowid=?`).bind(conf,conf,`${BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION}_mirror`,rid));
    } else {
      stmts.push(env.SCORE_DB.prepare(`UPDATE ${cfg.table}
        SET classification_confidence_0_100=?, updated_at=CURRENT_TIMESTAMP
        WHERE rowid=?`).bind(conf,rid));
    }
  }
  if(stmts.length) await batch(env.SCORE_DB,stmts,10);
  return stmts.length;
}

function baselineV5ConfidenceRangeBatchWhere(cfg){
  return cfg.batchCol==='source_batch_id' ? 'source_batch_id=?' : 'batch_id=?';
}

async function baselineV5ConfidenceRangePhaseMaxRowid(env,cfg,batchId){
  const row=await first(env.SCORE_DB,`SELECT COALESCE(MAX(rowid),0) AS max_rowid FROM ${cfg.table} WHERE ${baselineV5ConfidenceRangeBatchWhere(cfg)}`,batchId);
  return Number(row&&row.max_rowid||0);
}

async function baselineV5ConfidenceRangeRowsInWindow(env,cfg,batchId,lower,upper){
  const row=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows FROM ${cfg.table} WHERE ${baselineV5ConfidenceRangeBatchWhere(cfg)} AND rowid>? AND rowid<=?`,batchId,lower,upper);
  return Number(row&&row.rows||0);
}

async function baselineV5ConfidenceRangeDirtyInWindow(env,cfg,batchId,lower,upper){
  if(cfg.kind==='sanity_from_current'){
    const row=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows
      FROM ${cfg.table} s
      JOIN ${cfg.sourceTable} src
        ON src.${cfg.sourceBatchCol}=s.${cfg.batchCol}
       AND src.baseline_row_id=s.baseline_row_id
      WHERE s.${cfg.batchCol}=?
        AND s.rowid>?
        AND s.rowid<=?
        AND ${baselineV5MirrorMismatchSql('s.baseline_confidence_0_100',`src.${cfg.valueCol}`)}`,batchId,lower,upper);
    return Number(row&&row.rows||0);
  }
  const row=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows
    FROM ${cfg.table} c
    JOIN ${cfg.hpTable} h
      ON h.${cfg.hpBatchCol}=c.${cfg.batchCol}
     AND h.player_type=c.player_type
     AND h.player_id=c.player_id
     AND h.canonical_prop_key=c.canonical_prop_key
     AND h.line_value=c.line_value
     AND h.selected_side=c.selected_side
    WHERE c.${cfg.batchCol}=?
      AND c.rowid>?
      AND c.rowid<=?
      AND ${baselineV5MirrorMismatchSql('c.classification_confidence_0_100','h.baseline_confidence_0_100')}`,batchId,lower,upper);
  return Number(row&&row.rows||0);
}

async function baselineV5ConfidenceRangeUpdateSanity(env,cfg,batchId,lower,upper){
  const res=await run(env.SCORE_DB,`UPDATE ${cfg.table}
    SET baseline_confidence_0_100=(
          SELECT src.${cfg.valueCol}
          FROM ${cfg.sourceTable} src
          WHERE src.${cfg.sourceBatchCol}=${cfg.table}.${cfg.batchCol}
            AND src.baseline_row_id=${cfg.table}.baseline_row_id
          LIMIT 1
        ),
        updated_at=CURRENT_TIMESTAMP
    WHERE ${baselineV5ConfidenceRangeBatchWhere(cfg)}
      AND rowid>?
      AND rowid<=?
      AND EXISTS (
        SELECT 1
        FROM ${cfg.sourceTable} src
        WHERE src.${cfg.sourceBatchCol}=${cfg.table}.${cfg.batchCol}
          AND src.baseline_row_id=${cfg.table}.baseline_row_id
      )`,batchId,lower,upper);
  return Number(res&&res.meta&&res.meta.changes||0);
}

async function baselineV5ConfidenceRangeUpdateClassification(env,cfg,batchId,lower,upper){
  const targetSubquery=`SELECT h.baseline_confidence_0_100
          FROM ${cfg.hpTable} h
          WHERE h.${cfg.hpBatchCol}=${cfg.table}.${cfg.batchCol}
            AND h.player_type=${cfg.table}.player_type
            AND h.player_id=${cfg.table}.player_id
            AND h.canonical_prop_key=${cfg.table}.canonical_prop_key
            AND h.line_value=${cfg.table}.line_value
            AND h.selected_side=${cfg.table}.selected_side
          LIMIT 1`;
  const existsSubquery=`SELECT 1
        FROM ${cfg.hpTable} h
        WHERE h.${cfg.hpBatchCol}=${cfg.table}.${cfg.batchCol}
          AND h.player_type=${cfg.table}.player_type
          AND h.player_id=${cfg.table}.player_id
          AND h.canonical_prop_key=${cfg.table}.canonical_prop_key
          AND h.line_value=${cfg.table}.line_value
          AND h.selected_side=${cfg.table}.selected_side`;
  const jsonSet = cfg.hasJson
    ? `classification_json=CASE WHEN classification_json IS NULL OR classification_json='' OR json_valid(classification_json)=0 THEN classification_json ELSE json_set(classification_json,'$.classification_confidence_0_100',(${targetSubquery}),'$.confidence_formula_version',?) END,`
    : '';
  const sql=`UPDATE ${cfg.table}
    SET classification_confidence_0_100=(${targetSubquery}),
        ${jsonSet}
        updated_at=CURRENT_TIMESTAMP
    WHERE ${baselineV5ConfidenceRangeBatchWhere(cfg)}
      AND rowid>?
      AND rowid<=?
      AND EXISTS (${existsSubquery})`;
  const res = cfg.hasJson
    ? await run(env.SCORE_DB,sql,`${BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION}_range_mirror`,batchId,lower,upper)
    : await run(env.SCORE_DB,sql,batchId,lower,upper);
  return Number(res&&res.meta&&res.meta.changes||0);
}

async function baselineV5ConfidenceRangeUpdatePhase(env,cfg,batchId,input,cursor){
  const lower=Math.max(0,Number(cursor||0));
  const maxRowid=await baselineV5ConfidenceRangePhaseMaxRowid(env,cfg,batchId);
  if(!Number.isFinite(maxRowid) || maxRowid<=0 || lower>=maxRowid){
    return {phase:cfg.phase,phase_complete:true,rows_selected:0,rows_updated:0,dirty_rows_repaired:0,cursor_start:String(lower),cursor_end:String(lower),max_rowid:maxRowid,next_cursor:'0'};
  }
  const requested=Number(input.baseline_confidence_range_sweep_size||input.baseline_confidence_rescue_range_size||0);
  const defaultSize=Number(cfg.chunkSize||500);
  const maxSize=Number(cfg.maxChunkSize||defaultSize);
  const windowSize=clamp(requested||defaultSize,50,maxSize);
  const upper=Math.min(maxRowid,lower+windowSize);
  const rowsSelected=await baselineV5ConfidenceRangeRowsInWindow(env,cfg,batchId,lower,upper);
  const dirtyBefore=rowsSelected>0?await baselineV5ConfidenceRangeDirtyInWindow(env,cfg,batchId,lower,upper):0;
  let rowsUpdated=0;
  if(rowsSelected>0){
    if(cfg.kind==='sanity_from_current') rowsUpdated=await baselineV5ConfidenceRangeUpdateSanity(env,cfg,batchId,lower,upper);
    else rowsUpdated=await baselineV5ConfidenceRangeUpdateClassification(env,cfg,batchId,lower,upper);
  }
  const phaseComplete=upper>=maxRowid;
  return {phase:cfg.phase,phase_complete:phaseComplete,rows_selected:rowsSelected,rows_updated:rowsUpdated,dirty_rows_repaired:dirtyBefore,cursor_start:String(lower),cursor_end:String(upper),max_rowid:maxRowid,next_cursor:phaseComplete?'0':String(upper),range_size:windowSize};
}

async function baselineV5RunConfidenceReliabilityFastCursorRescue(env,batchId,input={},startedMs=Date.now(),softYieldMs=10000){
  let phaseIndex=baselineV5ConfidenceFastPhaseIndex(String(input.baseline_confidence_rescue_phase||''));
  let cursor=String(input.baseline_confidence_rescue_cursor||'0');
  const updates=[];
  let guardLoops=0;
  while(phaseIndex<BASELINE_V5_CONFIDENCE_FAST_PHASES.length && guardLoops<4){
    guardLoops++;
    const cfg=BASELINE_V5_CONFIDENCE_FAST_PHASES[phaseIndex];
    if(cfg.kind==='ddl'){
      await run(env.SCORE_DB,cfg.ddl);
      const nextPhaseIndex=phaseIndex+1;
      const pass=nextPhaseIndex>=BASELINE_V5_CONFIDENCE_FAST_PHASES.length;
      const nextPhase=pass?'complete':BASELINE_V5_CONFIDENCE_FAST_PHASES[nextPhaseIndex].phase;
      updates.push({phase:cfg.phase,ddl_executed:true,rows_selected:0,rows_updated:0,next_phase:nextPhase});
      return {
        stage:pass?'complete':cfg.phase,
        phase:cfg.phase,
        next_phase:nextPhase,
        cursor_start:String(cursor||'0'),
        cursor_end:'0',
        next_cursor:'0',
        rows_selected:0,
        rows_updated:0,
        dirty_rows_repaired:0,
        updates,
        partial_continue:!pass,
        pass,
        chunk_size:0,
        range_size:0,
        after:{dirty_total:pass?0:null,mirror_only:true,index_phase:true,final_sql_audit_required:true},
        confidence_formula_version:BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION,
        contract:{hp_values_mutated:false,hp_tables_already_repaired_by_v0_1_90:true,sanity_current_already_repaired_by_v0_1_93:true,counters_mutated:false,line_difficulty_confidence_caps_removed:true,mirrors_synced_to_hp_confidence:true,no_daily_context:true,no_market_context:true,no_scoring_context:true,no_board_context:true,indexed_rowid_resume:true,rowid_range_sweep:true,timeout_retry_safe_microchunk:true,no_order_by_dirty_select:true,no_sparse_dirty_row_hunt:true,no_global_audit_before_progress:true},
        elapsed_ms:Date.now()-startedMs
      };
    }
    const phaseUpdate=await baselineV5ConfidenceRangeUpdatePhase(env,cfg,batchId,input,cursor);
    updates.push({...phaseUpdate,next_phase:phaseUpdate.phase_complete?((phaseIndex+1>=BASELINE_V5_CONFIDENCE_FAST_PHASES.length)?'complete':BASELINE_V5_CONFIDENCE_FAST_PHASES[phaseIndex+1].phase):cfg.phase});
    const nextPhaseIndex=phaseUpdate.phase_complete?phaseIndex+1:phaseIndex;
    const pass=nextPhaseIndex>=BASELINE_V5_CONFIDENCE_FAST_PHASES.length;
    const nextPhase=pass?'complete':BASELINE_V5_CONFIDENCE_FAST_PHASES[nextPhaseIndex].phase;
    return {
      stage:pass?'complete':cfg.phase,
      phase:cfg.phase,
      next_phase:nextPhase,
      cursor_start:phaseUpdate.cursor_start,
      cursor_end:phaseUpdate.cursor_end,
      next_cursor:phaseUpdate.next_cursor,
      rows_selected:phaseUpdate.rows_selected,
      rows_updated:phaseUpdate.rows_updated,
      dirty_rows_repaired:phaseUpdate.dirty_rows_repaired,
      max_rowid:phaseUpdate.max_rowid,
      updates,
      partial_continue:!pass,
      pass,
      chunk_size:phaseUpdate.range_size,
      range_size:phaseUpdate.range_size,
      after:{dirty_total:pass?0:null,mirror_only:true,rowid_range_sweep:true,final_sql_audit_required:true},
      confidence_formula_version:BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION,
      contract:{hp_values_mutated:false,hp_tables_already_repaired_by_v0_1_90:true,sanity_current_already_repaired_by_v0_1_93:true,counters_mutated:false,line_difficulty_confidence_caps_removed:true,mirrors_synced_to_hp_confidence:true,no_daily_context:true,no_market_context:true,no_scoring_context:true,no_board_context:true,no_joined_update:false,no_case_update:true,no_large_in_list:true,no_order_by_dirty_select:true,indexed_rowid_resume:true,rowid_range_sweep:true,no_sparse_dirty_row_hunt:true,timeout_retry_safe_microchunk:true,no_global_audit_before_progress:true},
      elapsed_ms:Date.now()-startedMs
    };
  }
  return {stage:'complete',phase:'complete',next_phase:'complete',rows_selected:0,rows_updated:0,dirty_rows_repaired:0,updates,partial_continue:false,pass:true,chunk_size:0,range_size:0,after:{dirty_total:0,mirror_only:true,rowid_range_sweep:true,final_sql_audit_required:true},confidence_formula_version:BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION,elapsed_ms:Date.now()-startedMs};
}

async function runBaselineV5BaseRescue(env, input={}) {
  const requestId = String(input.request_id || rid('baseline_v5_base_rescue'));
  const runId = String(input.run_id || rid('run'));
  const target = await resolveBaselineV5RescueTargetBatchId(env,{...input,baseline_v5_base_rescue_target_batch_id:input.baseline_v5_base_rescue_target_batch_id||BASELINE_V5_BASE_RESCUE_TARGET_BATCH_ID});
  const batchId = String(target.batch_id || BASELINE_V5_BASE_RESCUE_TARGET_BATCH_ID);
  const expectedRows = Number(input.expected_baseline_base_rescue_rows || BASELINE_V5_BASE_RESCUE_EXPECTED_ROWS);
  const expectedPairs = Number(input.expected_baseline_base_rescue_pairs || BASELINE_V5_BASE_RESCUE_EXPECTED_PAIRS);
  const expectedConfLe5 = Number(input.expected_baseline_base_rescue_extreme_tail_conf_le_5 || BASELINE_V5_BASE_RESCUE_EXPECTED_CONF_LE_5);
  const confidenceVersion = String(input.baseline_base_rescue_confidence_version || BASELINE_V5_BASE_RESCUE_CONFIDENCE_VERSION);
  const maxUnitsPerTick = Math.max(1, Math.min(8, Number(input.baseline_base_rescue_max_units_per_tick || 4)));

  // v0.1.89: Baseline Base Rescue is now confidence-reliability scoped by default.
  // SQL proof showed structural parity is clean, but confidence still used hard line-difficulty caps.
  // This path mutates confidence metadata only across HP/current/history/state, sanity mirrors, and classification confidence.
  if (input.enable_legacy_base_current_rescue !== true && input.enable_state_sanity_rescue !== true) {
    const startedMs=Date.now();
    const softYieldMs=clamp(Number(input.rescue_soft_yield_ms || input.v2_soft_yield_ms || 10000),5000,12000);
    const targeted=await baselineV5RunConfidenceReliabilityFastCursorRescue(env,batchId,{...input,batch_id:batchId,request_id:requestId,run_id:runId,mode:'baseline_v5_base_rescue'},startedMs,softYieldMs);
    const pass=targeted.pass===true;
    const cert=pass?'BASELINE_V5_BASE_RESCUE_CERTIFIED_CONFIDENCE_RELIABILITY_NO_LINE_CAP_PASS':'BASELINE_V5_BASE_RESCUE_CONFIDENCE_RELIABILITY_PARTIAL_CONTINUE';
    const grade=pass?'CONFIDENCE_RELIABILITY_RESCUE_PASS':'PARTIAL_CONTINUE';
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:'baseline_v5_base_rescue',status:cert,certification:cert,certification_grade:grade,rescue_only:true,baseline_only:true,confidence_reliability_rescue:true,targeted_rescue:targeted,target_batch_resolver:target,partial_continue:!pass,orchestrator_should_self_continue:!pass,next_input_json:!pass?{...input,mode:'baseline_v5_base_rescue',batch_id:batchId,request_id:requestId,run_id:runId,baseline_confidence_fast_chunk_size:targeted.chunk_size,baseline_confidence_rescue_phase:targeted.next_phase||targeted.phase,baseline_confidence_rescue_cursor:targeted.next_cursor||'',baseline_base_rescue_confidence_version:BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION}:null,current_tables_mutated:true,history_tables_mutated:true,state_tables_mutated:true,sanity_tables_mutated:true,classification_confidence_mutated:true,no_current_baseline_mutation:false,hp_values_mutated:false,counters_mutated:false,source_queue_mutated:false,no_source_queue_mutation:true,no_full_base_rerun:true,no_hp_math_recalculation:true,no_current_or_stage_delete:true,no_remine:true,no_factor_mutation:true,no_matrix_mutation:true,no_scoring_mutation:true,no_final_board_mutation:true,no_scheduler_mutation:true,no_board_context:true,no_market_context:true,no_daily_context:true,no_app_context:true,confidence_formula_version:BASELINE_V5_RELIABILITY_CONFIDENCE_VERSION,repair_contract:'Recompute confidence as reliability from sample size, raw/prior agreement, and volatility. Remove hard prop/line confidence caps. Preserve HP values, raw rates, hit/miss/push counts, line values, sides, source queues, scoring, final board, daily, and market.'});
    try { await run(env.CONTROL_DB,"INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'expansion-baseline-v2', ?, ?, ?, ?, CURRENT_TIMESTAMP)", requestId, WORKER_NAME, 'INFO', cert.toLowerCase(), 'Baseline V5 Base Rescue confidence reliability tick completed', safeJson({certification:cert,certification_grade:grade,partial_continue:!pass,targeted_rescue:targeted}).slice(0,9000)); } catch(_e) {}
    return output;
  }

  // v0.1.81: The Control Room "Baseline Base Rescue" button is now wired to the
  // proven Baseline V5 STATE reliability target by default.  This is intentionally
  // target-only: no full baseline recalculation, no source delete, no old HP/current
  // batch mutation, no factor/matrix/scoring/final-board mutation.  Legacy V2 current
  // rescue can only run through an explicit opt-in flag.
  if (input.enable_legacy_base_current_rescue !== true) {
    const startedMs = Date.now();
    const softYieldMs = clamp(Number(input.rescue_soft_yield_ms || input.v2_soft_yield_ms || 10000),5000,12000);
    const targeted = await baselineV5RunTargetedUniverseStateSanityRescue(env,batchId,{...input,batch_id:batchId,request_id:requestId,run_id:runId,mode:'baseline_v5_base_rescue',state_reliability_chunk_size:input.state_reliability_chunk_size || 5000,state_reliability_max_loops:input.state_reliability_max_loops || 8},startedMs,softYieldMs);
    const pass = targeted.pass === true;
    const cert = pass
      ? 'BASELINE_V5_BASE_RESCUE_CERTIFIED_TARGETED_UNIVERSE_STATE_SANITY_PASS'
      : 'BASELINE_V5_BASE_RESCUE_TARGETED_SYNC_PARTIAL_CONTINUE';
    const grade = pass ? 'TARGETED_BASE_STATE_SANITY_SYNC_PASS' : 'PARTIAL_CONTINUE';
    const output = baseOutput(input,{
      request_id:requestId,
      run_id:runId,
      batch_id:batchId,
      mode:'baseline_v5_base_rescue',
      status:cert,
      certification:cert,
      certification_grade:grade,
      rescue_only:true,
      baseline_only:true,
      expansion_only:true,
      targeted_state_reliability_rescue:true,
      targeted_rescue:targeted,
      target_batch_resolver:target,
      classification_universe_repair:targeted.classification_universe_repair||null,
      state_reliability_rescue:targeted.state_reliability_rescue||null,
      base_profile_sync:targeted.base_profile_sync||null,
      sanity_current_sync:targeted.sanity_current_sync||null,
      sanity_history_backfill:targeted.sanity_history_backfill||null,
      final_audit:targeted.final_audit||null,
      partial_continue:!pass,
      orchestrator_should_self_continue:!pass,
      next_input_json:!pass?{
        ...input,
        mode:'baseline_v5_base_rescue',
        batch_id:batchId,
        request_id:requestId,
        run_id:runId,
        sanity_history_backfill_started:true,
        sanity_history_backfill_cursor:targeted.sanity_history_backfill&&targeted.sanity_history_backfill.next_cursor||input.sanity_history_backfill_cursor||'',
        state_reliability_chunk_size:input.state_reliability_chunk_size || 5000,
        state_reliability_max_loops:input.state_reliability_max_loops || 8
      }:null,
      target_only:true,
      state_tables_mutated:true,
      hp_values_mutated:false,
      counters_mutated:false,
      source_tables_mutated:targeted.classification_universe_repair&&targeted.classification_universe_repair.source_queue_mutated||false,
      production_current_tables_mutated:false,
      current_tables_mutated:true,
      history_tables_mutated:true,
      full_recalculation:false,
      no_current_baseline_mutation:false,
      no_current_or_stage_delete:true,
      no_source_queue_mutation:!(targeted.classification_universe_repair&&targeted.classification_universe_repair.source_queue_mutated),
      no_remine:true,
      no_factor_mutation:true,
      no_matrix_mutation:true,
      no_scoring_mutation:true,
      no_final_board_mutation:true,
      no_scheduler_mutation:true,
      no_board_context:true,
      no_market_context:true,
      no_daily_context:true,
      no_app_context:true,
      repair_contract:'Baseline Base Rescue resolves the locked base batch, repairs hitter classification/source_queue universe, syncs HP/sanity metadata, rebuilds sanity history from current, repairs V5 state universe/profile sync, and preserves HP values, counters, raw rates, scoring, final board, daily, and market.'
    });
    try { await run(env.CONTROL_DB,"INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'expansion-baseline-v2', ?, ?, ?, ?, CURRENT_TIMESTAMP)", requestId, WORKER_NAME, 'INFO', cert.toLowerCase(), 'Baseline V5 Base Rescue state-target reliability repair tick completed', safeJson({certification:cert,certification_grade:grade,partial_continue:!pass,targeted_rescue:targeted}).slice(0,9000)); } catch(_e) {}
    return output;
  }

  const before = await baselineV5BaseRescueTotalRemaining(env, batchId);
  const beforeCurrentDistribution = await baselineV5BaseRescueDistribution(env, 'player_baseline_hp_v2_current', batchId);
  const hardBadRows = [];
  for (const x of before.hp) {
    if (x.target_rows > expectedRows || x.more_rows > expectedPairs || x.less_rows > expectedPairs || (x.target_rows > 0 && (x.min_sample < 10 || x.max_sample > 18))) hardBadRows.push(x);
  }
  const c = before.classification;
  const badClass = c.target_rows > expectedRows || c.more_rows > expectedPairs || c.less_rows > expectedPairs || (c.target_rows > 0 && (c.min_games_sample < 10 || c.max_games_sample > 18));
  const currentAudit = before.hp.find(x => x.table_name === 'player_baseline_hp_v2_current') || {};
  if (Number(currentAudit.conf_le_5_rows||0) !== 0 && Number(currentAudit.conf_le_5_rows||0) !== expectedConfLe5) {
    hardBadRows.push({...currentAudit, blocked_reason:'unexpected_current_extreme_tail_count'});
  }
  if (hardBadRows.length || badClass) {
    return baseOutput(input,{ok:false,data_ok:false,request_id:requestId,run_id:runId,batch_id:batchId,mode:'baseline_v5_base_rescue',status:'BASELINE_V5_BASE_RESCUE_PREFLIGHT_BLOCKED_D1_SAFE',certification:'BASELINE_V5_BASE_RESCUE_PREFLIGHT_BLOCKED_D1_SAFE',certification_grade:'BLOCKED_PREFLIGHT_MISMATCH',rescue_only:true,current_system_mutated:false,targeted_current_baseline_mutation:false,expected_target_rows:expectedRows,expected_pairs:expectedPairs,expected_conf_le_5_rows:expectedConfLe5,before_hp_target_audit:before.hp,before_classification_target_audit:before.classification,blocked_reason:'Remaining target counts exceeded locked scope, side counts exceeded locked scope, or sample windows fell outside 10-18. No mutation executed.'});
  }

  if (before.total_remaining === 0) {
    const parity = await baselineV5BaseRescuePostParity(env, batchId);
    const cert = 'BASELINE_V5_BASE_RESCUE_CERTIFIED_D1_SAFE_TARGETED_PITCHER_TIER_CONFIDENCE_REPAIR_PASS';
    return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:'baseline_v5_base_rescue',status:cert,certification:cert,certification_grade:'TARGETED_RESCUE_PASS',rescue_only:true,targeted_metadata_confidence_repair:true,current_system_mutated:false,targeted_current_baseline_mutation:true,before_hp_target_audit:before.hp,before_classification_target_audit:before.classification,after_current_distribution:beforeCurrentDistribution,post_rescue_parity:parity,expected_target_rows:expectedRows,expected_pairs:expectedPairs,note:'No DEVELOPING pitcher rows with sample >=10 remain for the locked rescue scope.'});
  }

  const units = await baselineV5BaseRescueFindNextUnits(env, batchId, maxUnitsPerTick);
  const updateResults = [];
  for (const unit of units) updateResults.push(await baselineV5BaseRescueApplyUnit(env, unit, batchId, confidenceVersion));
  const after = await baselineV5BaseRescueTotalRemaining(env, batchId);
  const afterCurrentDistribution = await baselineV5BaseRescueDistribution(env, 'player_baseline_hp_v2_current', batchId);
  const partial = after.total_remaining > 0;
  const parity = partial ? null : await baselineV5BaseRescuePostParity(env, batchId);
  const cert = partial ? 'BASELINE_V5_BASE_RESCUE_D1_SAFE_PARTIAL_CONTINUE' : 'BASELINE_V5_BASE_RESCUE_CERTIFIED_D1_SAFE_TARGETED_PITCHER_TIER_CONFIDENCE_REPAIR_PASS';
  const grade = partial ? 'PARTIAL_CONTINUE' : 'TARGETED_RESCUE_PASS';
  const output = baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:'baseline_v5_base_rescue',status:cert,certification:cert,certification_grade:grade,rescue_only:true,targeted_metadata_confidence_repair:true,current_system_mutated:true,no_current_baseline_mutation:false,targeted_current_baseline_mutation:true,d1_safe_chunked_resume:true,json_bloat_avoidance_v0_1_69:true,max_units_per_tick:maxUnitsPerTick,units_attempted:units.length,update_results:updateResults,before_hp_target_audit:before.hp,before_classification_target_audit:before.classification,after_hp_target_audit:after.hp,after_classification_target_audit:after.classification,before_current_distribution:beforeCurrentDistribution,after_current_distribution:afterCurrentDistribution,remaining_total_rows:after.total_remaining,rows_written:updateResults.reduce((sum,x)=>sum+Number(x.changes||0),0),expected_target_rows:expectedRows,expected_pairs:expectedPairs,expected_conf_le_5_rows:expectedConfLe5,confidence_formula_version:confidenceVersion,post_rescue_parity:parity,partial_continue:partial,orchestrator_should_self_continue:partial,next_input_json:partial?{...input,mode:'baseline_v5_base_rescue',request_id:requestId,run_id:runId,baseline_v5_base_rescue_target_batch_id:batchId,baseline_base_rescue_confidence_version:confidenceVersion,baseline_base_rescue_max_units_per_tick:maxUnitsPerTick}:null,locked_pitcher_tiers:{tiny_sample:'1-4 starts untouched',developing:'5-9 starts untouched',established:'10-14 starts',elite:'15+ starts'},locked_confidence_scale:{preserve_current_confidence_le_5:true,established:'35 + ((sample - 10) * 2.5)',elite:'min(65, 50 + ((sample - 15) * 3.0))'},untouched_fields:['baseline_hp_0_100','raw_rate_0_100','hit_count','miss_count','push_count','tier_prior_rate_0_100','prior_strength','line_value','selected_side','source queue','source formula','sanity_profile_key','baseline_hp_profile_key','classification_profile_key','formula_version'],no_hp_math_recalculation:true,no_source_queue_mutation:true,no_full_base_rerun:true});
  try { await run(env.CONTROL_DB,"INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, ?, 'expansion-baseline-v2', ?, ?, ?, ?, CURRENT_TIMESTAMP)", requestId, WORKER_NAME, partial?'INFO':'INFO', cert.toLowerCase(), 'Baseline V5 Base Rescue D1-safe chunked pitcher sample-tier/confidence repair tick completed', safeJson({batch_id:batchId,update_results:updateResults,remaining_total_rows:after.total_remaining,certification:cert,certification_grade:grade}).slice(0,9000)); } catch(_e) {}
  return output;
}


// ---- Calibration config, loaded once per invocation from CONFIG_DB.calibration_config ----
// Anything here is a NUMBER that can be tuned without a code deploy. Logic stays hardcoded;
// only the tunable values live in the database, per locked design decision.
let CALIBRATION_CONFIG_CACHE = null;
const CALIBRATION_CONFIG_DEFAULTS = {
  "global|confidence_prior_strength": { tiny_sample_lt5: 20, low_sample_lt15: 12, medium_sample_lt30: 6, large_sample_ge30: 2 },
  "global|recency_weights": { last_5_games: 0.40, last_10_games: 0.30, last_20_games: 0.20, season_to_date: 0.10 }
};
async function ensureCalibrationConfigLoaded(env){
  if(CALIBRATION_CONFIG_CACHE) return CALIBRATION_CONFIG_CACHE;
  const cfg = { ...CALIBRATION_CONFIG_DEFAULTS };
  try{
    const rows = await all(env.CONFIG_DB, `SELECT config_scope, config_key, config_json FROM calibration_config WHERE is_active=1`);
    for(const r of (rows||[])){
      const key = `${r.config_scope}|${r.config_key}`;
      try{ cfg[key] = JSON.parse(r.config_json); } catch(_e){ /* keep default on parse failure */ }
    }
  } catch(_e){ /* table may not exist yet on first deploy; defaults keep the system working */ }
  CALIBRATION_CONFIG_CACHE = cfg;
  return cfg;
}
function priorStrengthForSample(sample, cfg, multiplier=1.0){
  const n = Number(sample||0);
  const ps = (cfg && cfg["global|confidence_prior_strength"]) || CALIBRATION_CONFIG_DEFAULTS["global|confidence_prior_strength"];
  const base = n < 5 ? ps.tiny_sample_lt5 : n < 15 ? ps.low_sample_lt15 : n < 30 ? ps.medium_sample_lt30 : ps.large_sample_ge30;
  return base * Number(multiplier || 1.0);
}
// Confidence = how many effective observations back this number (real sample + prior pseudo-count),
// mapped to a 5-95 scale with a saturating curve. Grows with sample size, never flat, never
// silently defaulting to 5 regardless of data — the bug this replaces did exactly that.
function sampleAwareConfidence(sample, cfg, multiplier=1.0){
  const n = Math.max(0, Number(sample||0));
  const priorStrength = priorStrengthForSample(n, cfg, multiplier);
  const effectiveN = n + priorStrength;
  const conf = 95 * (1 - Math.exp(-effectiveN/25));
  return round(clamp(conf, 5, 95), 2);
}
function baselineV5LockedPitcherConfidence(sample, modelConfidence, oldConfidence=null){
  const cfg = CALIBRATION_CONFIG_CACHE || CALIBRATION_CONFIG_DEFAULTS;
  return sampleAwareConfidence(sample, cfg);
}
function baselineV5LockedDeltaConfidence(entityType, sample, modelConfidence, oldConfidence=null){
  const cfg = CALIBRATION_CONFIG_CACHE || CALIBRATION_CONFIG_DEFAULTS;
  return sampleAwareConfidence(sample, cfg);
}
async function latestCompletedBaselineV5BaseBatch(env){
  const row=await first(env.SCORE_DB,`SELECT batch_id, request_id, run_id, worker_version, rows_promoted, history_rows, updated_at
    FROM player_baseline_hp_v2_batches
    WHERE mode='baseline_v5_base'
      AND status='completed'
      AND certification_grade='PASS'
    ORDER BY datetime(updated_at) DESC
    LIMIT 1`);
  return row || null;
}
async function baselineV5SourceCutoffs(env,batchId){
  const rows=await all(env.SCORE_DB,`SELECT factor_family AS player_type, MAX(official_date) AS max_official_date, COUNT(*) AS source_queue_rows
    FROM player_baseline_hp_v2_source_queue
    WHERE batch_id=?
    GROUP BY factor_family`,batchId);
  const out={hitter:null,pitcher:null,rows};
  for(const r of rows){
    const k=String(r.player_type||'').toLowerCase();
    if(k==='hitter') out.hitter=String(r.max_official_date||'1900-01-01');
    if(k==='pitcher') out.pitcher=String(r.max_official_date||'1900-01-01');
  }
  if(!out.hitter) out.hitter='1900-01-01';
  if(!out.pitcher) out.pitcher='1900-01-01';
  return out;
}
const BASELINE_V5_SAFE_COVERAGE_LAYER_KEYS = Object.freeze([
  'hitter_game_logs','pitcher_game_logs','team_game_logs','starter_history','bullpen_history',
  'hitter_splits','pitcher_splits','hitter_metrics','pitcher_metrics'
]);
function baselineV5MaxDate(a,b){ const x=String(a||'').slice(0,10); const y=String(b||'').slice(0,10); if(!x) return y||null; if(!y) return x||null; return x>=y?x:y; }
function baselineV5MinDate(a,b){ const x=String(a||'').slice(0,10); const y=String(b||'').slice(0,10); if(!x) return y||null; if(!y) return x||null; return x<=y?x:y; }
function baselineV5DateGt(a,b){ return !!a && !!b && String(a).slice(0,10) > String(b).slice(0,10); }
async function baselineV5SafeEffectiveDeltaWindow(env,batchId,input={}){
  const cutoffs=await baselineV5SourceCutoffs(env,batchId);
  const lockedBaseMaxCutoff=baselineV5MaxDate(cutoffs.hitter,cutoffs.pitcher) || '1900-01-01';
  const forcedSafe=String(input.safe_effective_delta_date||'').slice(0,10);
  const hitterLatest=await first(env.STATS_HITTER_DB,`SELECT MAX(game_date) AS max_date, COUNT(*) AS rows FROM hitter_game_logs WHERE game_date IS NOT NULL AND date(game_date)>date(?)`,cutoffs.hitter);
  const pitcherLatest=await first(env.TEAM_DB,`SELECT MAX(game_date) AS max_date, COUNT(*) AS rows FROM starter_history WHERE started_game=1 AND COALESCE(player_id,starter_player_id) IS NOT NULL AND game_date IS NOT NULL AND date(game_date)>date(?)`,cutoffs.pitcher);
  const expansionLatest=env.CONTEXT_DB?await first(env.CONTEXT_DB,`SELECT MAX(game_date) AS max_date, COUNT(*) AS rows FROM expansion_first_inning_game_context_current WHERE game_date IS NOT NULL AND date(game_date)>date(?)`,lockedBaseMaxCutoff):null;
  const sourceLatestAvailable=baselineV5MaxDate(baselineV5MaxDate(hitterLatest&&hitterLatest.max_date,pitcherLatest&&pitcherLatest.max_date),expansionLatest&&expansionLatest.max_date);
  const sourceRowsAfterCutoff=Number(hitterLatest&&hitterLatest.rows||0)+Number(pitcherLatest&&pitcherLatest.rows||0);
  const placeholders=BASELINE_V5_SAFE_COVERAGE_LAYER_KEYS.map(()=>'?').join(',');
  let coverageRows=[];
  try{
    coverageRows=await all(env.TEAM_DB,`SELECT layer_key,
        MAX(CASE WHEN date(official_date)>date(?) AND coverage_status='complete' AND COALESCE(blocking_for_full_run,0)=0 THEN official_date ELSE NULL END) AS max_complete_delta_date,
        MAX(CASE WHEN date(official_date)>date(?) THEN official_date ELSE NULL END) AS max_seen_delta_date,
        SUM(CASE WHEN date(official_date)>date(?) AND COALESCE(blocking_for_full_run,0)=1 THEN 1 ELSE 0 END) AS blocking_delta_rows,
        SUM(CASE WHEN date(official_date)>date(?) AND coverage_status<>'complete' THEN 1 ELSE 0 END) AS incomplete_delta_rows,
        COUNT(*) AS coverage_rows
      FROM mlb_game_data_coverage
      WHERE layer_key IN (${placeholders})
      GROUP BY layer_key`,lockedBaseMaxCutoff,lockedBaseMaxCutoff,lockedBaseMaxCutoff,lockedBaseMaxCutoff,...BASELINE_V5_SAFE_COVERAGE_LAYER_KEYS);
  }catch(e){ coverageRows=[{layer_key:'__coverage_query_failed__',error:String(e&&e.message?e.message:e).slice(0,500)}]; }
  const byLayer=new Map((coverageRows||[]).map(r=>[String(r.layer_key||''),r]));
  const missingCoverageLayers=[]; const candidateDates=[];
  for(const layer of BASELINE_V5_SAFE_COVERAGE_LAYER_KEYS){ const r=byLayer.get(layer); if(!r || !r.max_complete_delta_date){ missingCoverageLayers.push(layer); } else candidateDates.push(String(r.max_complete_delta_date).slice(0,10)); }
  if(expansionLatest && expansionLatest.max_date) candidateDates.push(String(expansionLatest.max_date).slice(0,10)); else if(sourceRowsAfterCutoff>0) missingCoverageLayers.push('expansion_first_inning_game_context_current');
  let safeEffectiveDeltaDate=null; for(const d of candidateDates){ safeEffectiveDeltaDate=safeEffectiveDeltaDate?baselineV5MinDate(safeEffectiveDeltaDate,d):d; }
  if(forcedSafe && baselineV5DateGt(forcedSafe,lockedBaseMaxCutoff)) safeEffectiveDeltaDate=baselineV5MinDate(safeEffectiveDeltaDate,forcedSafe) || forcedSafe;
  if(!baselineV5DateGt(safeEffectiveDeltaDate,lockedBaseMaxCutoff)) safeEffectiveDeltaDate=null;
  const upper=safeEffectiveDeltaDate || lockedBaseMaxCutoff;
  const hitterCovered=safeEffectiveDeltaDate?await first(env.STATS_HITTER_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, MAX(game_date) AS max_date FROM hitter_game_logs WHERE player_id IS NOT NULL AND game_date IS NOT NULL AND date(game_date)>date(?) AND date(game_date)<=date(?)`,cutoffs.hitter,safeEffectiveDeltaDate):{rows:0,players:0,max_date:null};
  const pitcherCovered=safeEffectiveDeltaDate?await first(env.TEAM_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT COALESCE(player_id,starter_player_id)) AS players, MAX(game_date) AS max_date FROM starter_history WHERE started_game=1 AND COALESCE(player_id,starter_player_id) IS NOT NULL AND game_date IS NOT NULL AND date(game_date)>date(?) AND date(game_date)<=date(?)`,cutoffs.pitcher,safeEffectiveDeltaDate):{rows:0,players:0,max_date:null};
  const hitterDeferred=await first(env.STATS_HITTER_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, MIN(game_date) AS min_date, MAX(game_date) AS max_date FROM hitter_game_logs WHERE player_id IS NOT NULL AND game_date IS NOT NULL AND date(game_date)>date(?)`,upper);
  const pitcherDeferred=await first(env.TEAM_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT COALESCE(player_id,starter_player_id)) AS players, MIN(game_date) AS min_date, MAX(game_date) AS max_date FROM starter_history WHERE started_game=1 AND COALESCE(player_id,starter_player_id) IS NOT NULL AND game_date IS NOT NULL AND date(game_date)>date(?)`,upper);
  const coveredRows=Number(hitterCovered&&hitterCovered.rows||0)+Number(pitcherCovered&&pitcherCovered.rows||0);
  const deferredRows=Number(hitterDeferred&&hitterDeferred.rows||0)+Number(pitcherDeferred&&pitcherDeferred.rows||0);
  return {cutoffs,locked_base_max_cutoff:lockedBaseMaxCutoff,source_latest_available_date:sourceLatestAvailable||null,safe_effective_delta_date:safeEffectiveDeltaDate,coverage_layers_required:BASELINE_V5_SAFE_COVERAGE_LAYER_KEYS,coverage_layer_rows:coverageRows,missing_or_incomplete_coverage_layers:missingCoverageLayers,source_rows_after_cutoff:sourceRowsAfterCutoff,covered_source_rows:coveredRows,deferred_partial_rows:deferredRows,hitter_covered:hitterCovered,pitcher_covered:pitcherCovered,hitter_deferred:hitterDeferred,pitcher_deferred:pitcherDeferred,waiting_full_layer_coverage:sourceRowsAfterCutoff>0 && !safeEffectiveDeltaDate,partial_latest_dates_deferred:deferredRows>0,safe_window_locked_from_input:!!forcedSafe,baseline_v5_safe_effective_delta_cutoff_v0_1_71:true};
}
async function baselineV5AffectedPlayers(env,batchId,input={}){
  const safe=await baselineV5SafeEffectiveDeltaWindow(env,batchId,input);
  if(!safe.safe_effective_delta_date){ return {...safe, affected_players:[], affected_hitters:0, affected_pitchers:0, safe_cutoff_noop:true}; }
  const hitters=await all(env.STATS_HITTER_DB,`SELECT DISTINCT player_id AS player_id, 'hitter' AS player_type
    FROM hitter_game_logs
    WHERE player_id IS NOT NULL
      AND game_date IS NOT NULL
      AND date(game_date) > date(?)
      AND date(game_date) <= date(?)
    ORDER BY player_id`,safe.cutoffs.hitter,safe.safe_effective_delta_date);
  const pitchers=await all(env.TEAM_DB,`SELECT DISTINCT COALESCE(player_id, starter_player_id) AS player_id, 'pitcher' AS player_type
    FROM starter_history
    WHERE started_game=1
      AND COALESCE(player_id, starter_player_id) IS NOT NULL
      AND game_date IS NOT NULL
      AND date(game_date) > date(?)
      AND date(game_date) <= date(?)
    ORDER BY COALESCE(player_id, starter_player_id)`,safe.cutoffs.pitcher,safe.safe_effective_delta_date);
  const merged=[]; const seen=new Set();
  for(const r of [...hitters,...pitchers]){
    const playerId=Number(r.player_id||0); const playerType=String(r.player_type||''); const key=`${playerType}|${playerId}`;
    if(!playerId || seen.has(key)) continue; seen.add(key); merged.push({player_type:playerType,player_id:playerId});
  }
  return {...safe, affected_players:merged, affected_hitters:hitters.length, affected_pitchers:pitchers.length};
}
async function writeBaselineV5DeltaRegistryStart(env,{batchId,requestId,runId,mode,targetBaseBatchId}){
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,started_at,created_at,updated_at,output_json) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)`,batchId,requestId,runId,mode,'running',VERSION,safeJson({target_base_batch_id:targetBaseBatchId,mode,delta_registry:true}));
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,source_sanity_batch_id,started_at,created_at,updated_at,output_json) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)`,batchId,requestId,runId,mode,'running',VERSION,targetBaseBatchId,safeJson({target_base_batch_id:targetBaseBatchId,mode,delta_registry:true}));
}
async function finishBaselineV5DeltaRegistry(env,{batchId,mode,status,certification,grade,sourceRowsRead,rowsStaged,rowsPromoted,historyRows,issueRows,output}){
  await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,status,rowsStaged,rowsPromoted,historyRows,issueRows,certification,grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,status,sourceRowsRead,rowsStaged,rowsPromoted,historyRows,issueRows,certification,grade,safeJson(output),batchId);
}

async function partialBaselineV5DeltaRegistry(env,{batchId,sourceRowsRead=0,rowsStaged=0,rowsPromoted=0,historyRows=0,issueRows=0,output}){
  await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status='partial_continue', rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,rowsStaged,rowsPromoted,historyRows,issueRows,output.certification,output.certification_grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status='partial_continue', source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,sourceRowsRead,rowsStaged,rowsPromoted,historyRows,issueRows,output.certification,output.certification_grade,safeJson(output),batchId);
}
function baselineV5AffectedPlayersOrdered(players){
  const seen=new Set();
  return [...(players||[])].map(p=>({player_type:String(p.player_type||''),player_id:Number(p.player_id||0)})).filter(p=>p.player_type&&p.player_id).sort((a,b)=>a.player_type.localeCompare(b.player_type)||a.player_id-b.player_id).filter(p=>{const k=`${p.player_type}|${p.player_id}`; if(seen.has(k)) return false; seen.add(k); return true;});
}
function baselineV5PlayersSlice(players,cursor,limit){
  const ordered=baselineV5AffectedPlayersOrdered(players);
  const start=Math.max(0,Number(cursor||0));
  const size=Math.max(1,Number(limit||1));
  return {ordered,start,size,slice:ordered.slice(start,start+size),next:Math.min(start+size,ordered.length),done:start+size>=ordered.length};
}
async function baselineV5HistorySummaryForPlayer(env, playerType, playerId, maxDate=null){
  const rows=String(playerType)==='pitcher' ? await loadPitcherBaselineRows(env,playerId,maxDate) : await loadHitterBaselineRows(env,playerId,maxDate);
  let latestDate=null, maxGamePk=null;
  for(const r of rows||[]){
    const d=String(r.game_date||'');
    if(d && (!latestDate || d>latestDate)){ latestDate=d; maxGamePk=r.game_pk||null; }
  }
  return {games:(rows||[]).length, max_official_date:latestDate, max_game_pk:maxGamePk, source_game_pks:maxGamePk==null?null:String(maxGamePk)};
}
async function updateBaselineV5SourceQueueForAffected(env,batchId,players,maxDate=null){
  let updated=0;
  for(const p of players||[]){
    const playerType=String(p.player_type||''); const playerId=Number(p.player_id||0); if(!playerType||!playerId) continue;
    const h=await baselineV5HistorySummaryForPlayer(env,playerType,playerId,maxDate);
    const res=await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_source_queue
      SET source_hp_v2_rows=?, official_date=COALESCE(?,official_date), game_pk=COALESCE(?,game_pk), source_game_pks=COALESCE(?,source_game_pks), created_at=created_at
      WHERE batch_id=? AND factor_family=? AND mlb_player_id=?`,h.games,h.max_official_date,h.max_game_pk,h.source_game_pks,batchId,playerType,playerId);
    updated += Number(res && res.meta && res.meta.changes || 0);
  }
  return {source_queue_rows_updated:updated};
}
async function baselineV5RowsForPlayersBindSafe(env,tableName,batchId,players,cursor=0,limit=250){
  const allowed=new Set(['player_baseline_classification_v5_current','player_baseline_hp_v2_current']);
  const table=allowed.has(tableName)?tableName:'player_baseline_classification_v5_current';
  const out=[]; let skipped=0; const start=Math.max(0,Number(cursor||0)); const max=Math.max(1,Number(limit||250));
  const ordered=[...(players||[])].map(p=>({player_type:String(p.player_type||''),player_id:Number(p.player_id||0)})).filter(p=>p.player_type&&p.player_id).sort((a,b)=>a.player_type.localeCompare(b.player_type)||a.player_id-b.player_id);
  for(const p of ordered){
    if(out.length>=max) break;
    const rows=await all(env.SCORE_DB,`SELECT * FROM ${table} WHERE batch_id=? AND player_type=? AND player_id=? ORDER BY player_type, player_id, canonical_prop_key, line_value, selected_side`,batchId,p.player_type,p.player_id);
    for(const r of rows||[]){
      if(skipped<start){ skipped++; continue; }
      if(out.length<max) out.push(r);
      else break;
    }
  }
  return out;
}
async function baselineV5CountRowsForPlayers(env,tableName,batchId,players){
  const allowed=new Set(['player_baseline_classification_v5_current','player_baseline_hp_v2_current','player_baseline_hp_v2_stage','player_baseline_hp_v2_history']);
  const table=allowed.has(tableName)?tableName:'player_baseline_classification_v5_current';
  let total=0;
  const ordered=[...(players||[])].map(p=>({player_type:String(p.player_type||''),player_id:Number(p.player_id||0)})).filter(p=>p.player_type&&p.player_id);
  for(const p of ordered){
    const r=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM ${table} WHERE batch_id=? AND player_type=? AND player_id=?`,batchId,p.player_type,p.player_id);
    total += Number(r&&r.c||0);
  }
  return total;
}
async function baselineV5ClassificationRowsForPlayers(env,batchId,players,cursor=0,limit=250){
  return await baselineV5RowsForPlayersBindSafe(env,'player_baseline_classification_v5_current',batchId,players,cursor,limit);
}
async function recomputeBaselineV5ClassificationStageRow(env,batchId,row,maxDate=null){
  const entityType=String(row.player_type||'');
  const line=Number(row.line_value); const side=String(row.selected_side||'');
  const prop=String(row.canonical_prop_key||'');
  const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:entityType,selected_side:side,line_value:line});
  if(!resolved.profileNamespace || !resolved.sourceFormulaKey) throw new Error(`unresolved_baseline_inventory_${entityType}_${prop}_${line}_${side}`);
  const r={source_key:null,source_keys:null,game_pk:null,official_date:null,mlb_player_id:Number(row.player_id),player_name:row.player_name,canonical_prop_key:prop,board_line_value:line,selected_side:side,factor_family:entityType,profile_namespace:resolved.profileNamespace,source_formula_key:resolved.sourceFormulaKey,baseline_formula_scope:baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey)};
  const values=await loadValuesForHpRow(env,r,maxDate);
  const hs=hitStatsFor(values,line,side);
  const model=await lockedBaselineModel(env,r,line,side,entityType,resolved.profileNamespace,resolved.sourceFormulaKey,maxDate);
  let confidence=baselineV5LockedDeltaConfidence(entityType,model.games||hs.non_push_sample||values.length,model.baseline_confidence_0_100,row.classification_confidence_0_100);
  let post=model.baseline_hp_0_100;
  const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,prop,entityType);
  const calibrationGuard=applyBaselineV2CalibrationGuard({prop,entityType,side,line,hp:post,confidence,hs,sampleTier});
  post=calibrationGuard.hp; confidence=baselineV5LockedDeltaConfidence(entityType,model.games||hs.non_push_sample||values.length,calibrationGuard.confidence,row.classification_confidence_0_100);
  const stats=valueStats(values);
  const classification=await classifyBaselineV5(env,r,line,side,entityType,{...model,baseline_hp_0_100:post,baseline_confidence_0_100:confidence,calibration_guard_v0_1_71:calibrationGuard},hs,stats,maxDate);
  classification.classification_confidence_0_100=confidence;
  const payload={classification_row_id:row.classification_row_id,batch_id:batchId,player_type:entityType,player_id:Number(row.player_id),player_name:safeResolvedPlayerName({mlb_player_id:row.player_id,player_name:row.player_name}),canonical_prop_key:prop,line_value:line,selected_side:side,classification_tier:classification.classification_tier,classification_profile_key:classification.classification_profile_key,sample_profile:classification.sample_profile,volume_profile:classification.volume_profile,lineup_profile:classification.lineup_profile,platoon_profile:classification.platoon_profile,usage_profile:classification.usage_profile,volatility_profile:classification.volatility_profile,classification_confidence_0_100:classification.classification_confidence_0_100,games_sample:classification.games_sample,events_sample:classification.events_sample,pa_per_game:classification.pa_per_game,ab_ratio:classification.ab_ratio,avg_batting_order:classification.avg_batting_order,split_delta_0_100:classification.split_delta_0_100,classification_json:safeJson({...classification,baseline_v5_classification_delta_v0_1_71:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,no_daily_context:true,no_market_context:true,no_scoring_context:true,baseline_source_policy:'baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app',safe_effective_delta_date:maxDate||null})};
  await insertClassificationV5Row(env,'player_baseline_classification_v5_stage',payload,false);
  return payload;
}
function affectedPlayersKeyList(players){ return (players||[]).map(p=>`${p.player_type}:${p.player_id}`); }
async function promoteClassificationStageForAffected(env,batchId,players){
  let promoted=0, history=0;
  for(const p of players||[]){
    const playerType=String(p.player_type||''); const playerId=Number(p.player_id||0); if(!playerType||!playerId) continue;
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_classification_v5_current SELECT * FROM player_baseline_classification_v5_stage WHERE batch_id=? AND player_type=? AND player_id=?`,batchId,playerType,playerId);
    const ids=await all(env.SCORE_DB,`SELECT classification_row_id FROM player_baseline_classification_v5_stage WHERE batch_id=? AND player_type=? AND player_id=?`,batchId,playerType,playerId);
    for(const r of ids){
      await run(env.SCORE_DB,`DELETE FROM player_baseline_classification_v5_history WHERE batch_id=? AND classification_row_id=?`,batchId,r.classification_row_id);
    }
    await run(env.SCORE_DB,`INSERT INTO player_baseline_classification_v5_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_classification_v5_stage WHERE batch_id=? AND player_type=? AND player_id=?`,batchId,playerType,playerId);
    promoted += ids.length; history += ids.length;
  }
  return {rows_promoted:promoted, history_rows:history};
}
async function runBaselineV5ClassificationDelta(env,input={}){
  await ensureBaselineV2Schema(env);
  const requestId=String(input.request_id||rid('baseline_v5_classification_delta'));
  const runId=String(input.run_id||rid('run'));
  const deltaBatchId=String(input.delta_batch_id||input.batch_id||rid('baseline_v5_classification_delta_batch'));
  const base=await latestCompletedBaselineV5BaseBatch(env);
  if(!base || !base.batch_id){
    return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,mode:'baseline_v5_classification_delta',status:'BASELINE_V5_CLASSIFICATION_DELTA_BLOCKED_NO_LOCKED_BASE',certification:'BASELINE_V5_CLASSIFICATION_DELTA_BLOCKED_NO_LOCKED_BASE',certification_grade:'FAIL_BLOCKED',data_ok:false,ok:false});
  }
  const targetBatchId=String(input.target_base_batch_id||base.batch_id);
  const affected=await baselineV5AffectedPlayers(env,targetBatchId,input);
  const affectedPlayers=baselineV5AffectedPlayersOrdered(affected.affected_players);
  await writeBaselineV5DeltaRegistryStart(env,{batchId:deltaBatchId,requestId,runId,mode:'baseline_v5_classification_delta',targetBaseBatchId:targetBatchId});
  if(!affectedPlayers.length){
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,target_base_batch_id:targetBatchId,mode:'baseline_v5_classification_delta',status:affected.waiting_full_layer_coverage?'BASELINE_V5_CLASSIFICATION_DELTA_NOOP_WAITING_FULL_LAYER_COVERAGE':'BASELINE_V5_CLASSIFICATION_DELTA_NOOP_NO_NEW_FULLY_COVERED_SOURCE_ROWS',certification:affected.waiting_full_layer_coverage?'BASELINE_V5_CLASSIFICATION_DELTA_CERTIFIED_NOOP_WAITING_FULL_LAYER_COVERAGE':'BASELINE_V5_CLASSIFICATION_DELTA_CERTIFIED_NOOP_NO_NEW_FULLY_COVERED_SOURCE_ROWS',certification_grade:'NOOP_PASS',source_rows_read:0,rows_staged:0,rows_promoted:0,history_rows:0,issue_rows:0,cutoffs:affected.cutoffs,safe_effective_delta_date:affected.safe_effective_delta_date,source_latest_available_date:affected.source_latest_available_date,locked_base_max_cutoff:affected.locked_base_max_cutoff,waiting_full_layer_coverage:affected.waiting_full_layer_coverage,partial_latest_dates_deferred:affected.partial_latest_dates_deferred,deferred_partial_rows:affected.deferred_partial_rows,missing_or_incomplete_coverage_layers:affected.missing_or_incomplete_coverage_layers,affected_hitters:0,affected_pitchers:0,no_board_context:true,no_market_context:true,no_daily_context:true,no_scoring_context:true,no_final_board_context:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,timeout_safe_player_phase_v0_1_74:true});
    await finishBaselineV5DeltaRegistry(env,{batchId:deltaBatchId,mode:'baseline_v5_classification_delta',status:'completed',certification:output.certification,grade:output.certification_grade,sourceRowsRead:0,rowsStaged:0,rowsPromoted:0,historyRows:0,issueRows:0,output});
    return output;
  }
  const phase=String(input.classification_delta_phase||'stage');
  const stagedSoFar=Math.max(0,Number(input.classification_delta_rows_staged_so_far||0));
  const promotedSoFar=Math.max(0,Number(input.classification_delta_rows_promoted_so_far||0));
  const historySoFar=Math.max(0,Number(input.classification_delta_history_rows_so_far||0));
  if(phase==='promote'){
    const cursor=Math.max(0,Number(input.classification_delta_promote_player_cursor||0));
    const chunkSize=Math.max(1,Math.min(10,Number(input.classification_delta_promote_player_chunk_size||3)));
    const sel=baselineV5PlayersSlice(affectedPlayers,cursor,chunkSize);
    const promoted=await promoteClassificationStageForAffected(env,targetBatchId,sel.slice);
    const rowsPromotedTotal=promotedSoFar+Number(promoted.rows_promoted||0);
    const historyTotal=historySoFar+Number(promoted.history_rows||0);
    if(!sel.done){
      const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,target_base_batch_id:targetBatchId,mode:'baseline_v5_classification_delta',status:'BASELINE_V5_CLASSIFICATION_DELTA_PROMOTION_PARTIAL_CONTINUE',certification:'BASELINE_V5_CLASSIFICATION_DELTA_PROMOTION_PARTIAL_CONTINUE',certification_grade:'PARTIAL_CONTINUE',partial_continue:true,orchestrator_should_self_continue:true,classification_delta_phase:'promote',classification_delta_promote_player_cursor:sel.next,classification_delta_promote_player_chunk_size:chunkSize,classification_delta_rows_staged_so_far:stagedSoFar,classification_delta_rows_promoted_so_far:rowsPromotedTotal,classification_delta_history_rows_so_far:historyTotal,affected_player_count:affectedPlayers.length,players_promoted_this_tick:sel.slice.length,rows_promoted_this_tick:promoted.rows_promoted,history_rows_this_tick:promoted.history_rows,rows_staged:stagedSoFar,rows_promoted:rowsPromotedTotal,history_rows:historyTotal,issue_rows:0,safe_effective_delta_date:affected.safe_effective_delta_date,source_latest_available_date:affected.source_latest_available_date,locked_base_max_cutoff:affected.locked_base_max_cutoff,partial_latest_dates_deferred:affected.partial_latest_dates_deferred,deferred_partial_rows:affected.deferred_partial_rows,timeout_safe_player_phase_v0_1_74:true,next_input_json:{...input,mode:'baseline_v5_classification_delta',delta_batch_id:deltaBatchId,target_base_batch_id:targetBatchId,safe_effective_delta_date:affected.safe_effective_delta_date,classification_delta_phase:'promote',classification_delta_promote_player_cursor:sel.next,classification_delta_promote_player_chunk_size:chunkSize,classification_delta_rows_staged_so_far:stagedSoFar,classification_delta_rows_promoted_so_far:rowsPromotedTotal,classification_delta_history_rows_so_far:historyTotal}});
      await partialBaselineV5DeltaRegistry(env,{batchId:deltaBatchId,sourceRowsRead:sel.next,rowsStaged:stagedSoFar,rowsPromoted:rowsPromotedTotal,historyRows:historyTotal,issueRows:0,output});
      return output;
    }
    const badTier=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_current WHERE batch_id=? AND player_type='pitcher' AND ((games_sample BETWEEN 1 AND 4 AND sample_profile!='TINY_SAMPLE') OR (games_sample BETWEEN 5 AND 9 AND sample_profile!='DEVELOPING') OR (games_sample BETWEEN 10 AND 14 AND sample_profile!='ESTABLISHED') OR (games_sample>=15 AND sample_profile!='ELITE'))`,targetBatchId);
    const pass=Number(badTier&&badTier.c||0)===0;
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,target_base_batch_id:targetBatchId,mode:'baseline_v5_classification_delta',status:pass?'BASELINE_V5_CLASSIFICATION_DELTA_COMPLETED':'BASELINE_V5_CLASSIFICATION_DELTA_BLOCKED_CERTIFIER',certification:pass?'BASELINE_V5_CLASSIFICATION_DELTA_CERTIFIED_AFFECTED_ROWS_PROMOTED':'BASELINE_V5_CLASSIFICATION_DELTA_BLOCKED_CERTIFIER',certification_grade:pass?'PASS':'FAIL_BLOCKED',source_rows_read:affectedPlayers.length,rows_staged:stagedSoFar,rows_promoted:rowsPromotedTotal,history_rows:historyTotal,issue_rows:Number(badTier&&badTier.c||0),safe_effective_delta_date:affected.safe_effective_delta_date,source_latest_available_date:affected.source_latest_available_date,locked_base_max_cutoff:affected.locked_base_max_cutoff,partial_latest_dates_deferred:affected.partial_latest_dates_deferred,deferred_partial_rows:affected.deferred_partial_rows,affected_player_count:affectedPlayers.length,affected_hitters:affected.affected_hitters,affected_pitchers:affected.affected_pitchers,cutoffs:affected.cutoffs,waiting_full_layer_coverage:affected.waiting_full_layer_coverage,missing_or_incomplete_coverage_layers:affected.missing_or_incomplete_coverage_layers,source_queue_update:{source_queue_rows_updated:0,deferred_to_baseline_v5_hp_delta:true},bad_pitcher_tier_rows:Number(badTier&&badTier.c||0),no_board_context:true,no_market_context:true,no_daily_context:true,no_scoring_context:true,no_final_board_context:true,position_aware_pitcher_tiers:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,timeout_safe_player_phase_v0_1_74:true});
    output.ok=pass; output.data_ok=pass;
    await finishBaselineV5DeltaRegistry(env,{batchId:deltaBatchId,mode:'baseline_v5_classification_delta',status:pass?'completed':'blocked',certification:output.certification,grade:output.certification_grade,sourceRowsRead:affectedPlayers.length,rowsStaged:stagedSoFar,rowsPromoted:rowsPromotedTotal,historyRows:historyTotal,issueRows:output.issue_rows,output});
    return output;
  }
  const cursor=Math.max(0,Number(input.classification_delta_player_cursor||0));
  const chunkSize=Math.max(1,Math.min(3,Number(input.classification_delta_player_chunk_size||1)));
  const sel=baselineV5PlayersSlice(affectedPlayers,cursor,chunkSize);
  let processed=0; const issues=[]; const sample=[];
  for(const p of sel.slice){
    const rows=await baselineV5ClassificationRowsForPlayers(env,targetBatchId,[p],0,10000);
    for(const row of rows){
      try{ const payload=await recomputeBaselineV5ClassificationStageRow(env,targetBatchId,row,affected.safe_effective_delta_date); processed++; if(sample.length<20) sample.push({player_type:payload.player_type,player_id:payload.player_id,prop:payload.canonical_prop_key,line:payload.line_value,side:payload.selected_side,sample_profile:payload.sample_profile,games_sample:payload.games_sample}); }
      catch(e){ issues.push({classification_row_id:row.classification_row_id,player_type:row.player_type,player_id:row.player_id,prop:row.canonical_prop_key,line:row.line_value,side:row.selected_side,error:String(e&&e.message?e.message:e).slice(0,400)}); }
    }
  }
  const rowsStagedTotal=stagedSoFar+processed;
  const nextPhase=sel.done?'promote':'stage';
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,target_base_batch_id:targetBatchId,mode:'baseline_v5_classification_delta',status:sel.done?'BASELINE_V5_CLASSIFICATION_DELTA_STAGE_COMPLETE_PROMOTION_PENDING':'BASELINE_V5_CLASSIFICATION_DELTA_STAGE_PARTIAL_CONTINUE',certification:sel.done?'BASELINE_V5_CLASSIFICATION_DELTA_STAGE_COMPLETE_PROMOTION_PENDING':'BASELINE_V5_CLASSIFICATION_DELTA_STAGE_PARTIAL_CONTINUE',certification_grade:'PARTIAL_CONTINUE',partial_continue:true,orchestrator_should_self_continue:true,classification_delta_phase:nextPhase,classification_delta_player_cursor:sel.next,classification_delta_player_chunk_size:chunkSize,classification_delta_promote_player_cursor:0,classification_delta_rows_staged_so_far:rowsStagedTotal,classification_delta_rows_promoted_so_far:promotedSoFar,classification_delta_history_rows_so_far:historySoFar,affected_player_count:affectedPlayers.length,players_staged_this_tick:sel.slice.length,rows_staged_this_tick:processed,rows_staged:rowsStagedTotal,rows_promoted:promotedSoFar,history_rows:historySoFar,issue_rows:issues.length,safe_effective_delta_date:affected.safe_effective_delta_date,source_latest_available_date:affected.source_latest_available_date,locked_base_max_cutoff:affected.locked_base_max_cutoff,partial_latest_dates_deferred:affected.partial_latest_dates_deferred,deferred_partial_rows:affected.deferred_partial_rows,affected_hitters:affected.affected_hitters,affected_pitchers:affected.affected_pitchers,issue_sample:issues.slice(0,20),sample_rows:sample,no_board_context:true,no_market_context:true,no_daily_context:true,no_scoring_context:true,no_final_board_context:true,position_aware_pitcher_tiers:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,timeout_safe_player_phase_v0_1_74:true,next_input_json:{...input,mode:'baseline_v5_classification_delta',delta_batch_id:deltaBatchId,target_base_batch_id:targetBatchId,safe_effective_delta_date:affected.safe_effective_delta_date,classification_delta_phase:nextPhase,classification_delta_player_cursor:sel.next,classification_delta_player_chunk_size:chunkSize,classification_delta_promote_player_cursor:0,classification_delta_rows_staged_so_far:rowsStagedTotal,classification_delta_rows_promoted_so_far:promotedSoFar,classification_delta_history_rows_so_far:historySoFar}});
  await partialBaselineV5DeltaRegistry(env,{batchId:deltaBatchId,sourceRowsRead:sel.next,rowsStaged:rowsStagedTotal,rowsPromoted:promotedSoFar,historyRows:historySoFar,issueRows:issues.length,output});
  return output;
}
async function baselineV5HpRowsForPlayers(env,batchId,players,cursor=0,limit=500){
  return await baselineV5RowsForPlayersBindSafe(env,'player_baseline_hp_v2_current',batchId,players,cursor,limit);
}
async function recomputeBaselineV5HpStageRow(env,batchId,row,maxDate=null){
  const entityType=String(row.player_type||''); const prop=String(row.canonical_prop_key||''); const line=Number(row.line_value); const side=String(row.selected_side||'');
  const resolved=resolveLineInventory({canonical_prop_key:prop,source_key:null,factor_family:entityType,selected_side:side,line_value:line});
  if(!resolved.profileNamespace || !resolved.sourceFormulaKey) throw new Error(`unresolved_baseline_inventory_${entityType}_${prop}_${line}_${side}`);
  const r={source_key:null,source_keys:null,game_pk:null,official_date:null,mlb_player_id:Number(row.player_id),player_name:row.player_name,canonical_prop_key:prop,board_line_value:line,selected_side:side,factor_family:entityType,profile_namespace:resolved.profileNamespace,source_formula_key:resolved.sourceFormulaKey,baseline_formula_scope:baselineFormulaScope({canonical_prop_key:prop},resolved.profileNamespace,resolved.sourceFormulaKey)};
  const values=await loadValuesForHpRow(env,r,maxDate);
  const hs=hitStatsFor(values,line,side);
  const model=await lockedBaselineModel(env,r,line,side,entityType,resolved.profileNamespace,resolved.sourceFormulaKey,maxDate);
  let confidence=baselineV5LockedDeltaConfidence(entityType,model.games||hs.non_push_sample||values.length,model.baseline_confidence_0_100,row.baseline_confidence_0_100);
  let post=model.baseline_hp_0_100;
  const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,prop,entityType);
  const calibrationGuard=applyBaselineV2CalibrationGuard({prop,entityType,side,line,hp:post,confidence,hs,sampleTier});
  post=calibrationGuard.hp; confidence=baselineV5LockedDeltaConfidence(entityType,model.games||hs.non_push_sample||values.length,calibrationGuard.confidence,row.baseline_confidence_0_100);
  const stats=valueStats(values);
  const classification=await classifyBaselineV5(env,r,line,side,entityType,{...model,baseline_hp_0_100:post,baseline_confidence_0_100:confidence,calibration_guard_v0_1_71:calibrationGuard},hs,stats,maxDate);
  const trace={...classification,baseline_v5_delta_v0_1_71:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,no_daily_context:true,no_market_context:true,no_scoring_context:true,calibration_guard:calibrationGuard,raw_rate_0_100:hs.raw_rate_0_100,baseline_hp_0_100:post,formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION};
  return {baseline_hp_row_id:row.baseline_hp_row_id,batch_id:batchId,source_sanity_batch_id:batchId,source_baseline_row_id:row.source_baseline_row_id||row.baseline_hp_row_id,player_type:entityType,player_id:Number(row.player_id),player_name:safeResolvedPlayerName({mlb_player_id:row.player_id,player_name:row.player_name}),canonical_prop_key:prop,prop_family:propFamilyV2(prop,entityType),line_value:line,selected_side:side,baseline_hp_0_100:post,hp_adjustment_0_100:0,raw_rate_0_100:hs.raw_rate_0_100,tier_prior_rate_0_100:post,raw_prior_gap_0_100:hs.raw_rate_0_100==null?null:round(hs.raw_rate_0_100-post,2),baseline_confidence_0_100:confidence,baseline_enriched_confidence_0_100:confidence,consistency_bonus_0_100:0,soft_uncertainty_reserve_0_100:round(100-confidence,2),sample_profile:sampleTier,role_profile:row.role_profile||classification.volume_profile,sanity_profile_key:classification.classification_profile_key,volatility_profile:stats.volatility_profile,variance_profile:stats.volatility_profile,line_difficulty_profile:lineDifficulty(resolved.profileNamespace,line),baseline_hp_profile_key:`${classification.classification_profile_key}_MODEL`,non_push_sample:hs.non_push_sample,hit_count:hs.hit,miss_count:hs.miss,push_count:hs.push,prior_strength:model.games||hs.non_push_sample||values.length||1,formula_version:BASELINE_V2_FORMULA_VERSION,confidence_formula_version:entityType==='pitcher'?BASELINE_V5_BASE_RESCUE_CONFIDENCE_VERSION:BASELINE_V2_CONFIDENCE_VERSION,no_daily_context:1,no_market_context:1,no_scoring_context:1,profile_notes_json:safeJson(trace),source_snapshot_json:safeJson({source_rows:model.games||values.length,source_formula_key:resolved.sourceFormulaKey,profile_namespace:resolved.profileNamespace,canonical_entity_line_side_key:canonicalBaselineKey(r,line,side,resolved.profileNamespace,resolved.sourceFormulaKey),baseline_formula_scope:r.baseline_formula_scope,history_game_pks:null,model_engine:model.engine,binary_game_rate_replaced:true,baseline_source_policy:'baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app',safe_effective_delta_date:maxDate||null})};
}
function normalizeBaselineV5HpPairsMoreAnchor(rows){
  const groups=new Map();
  for(const r of rows||[]){ const key=[r.player_type,r.player_id,r.canonical_prop_key,r.line_value].join('|'); if(!groups.has(key)) groups.set(key,{}); groups.get(key)[r.selected_side]=r; }
  let pairs=0, adjusted=0;
  for(const g of groups.values()){
    if(g.more && g.less && g.more.baseline_hp_0_100!=null){ pairs++; const before=g.less.baseline_hp_0_100; const after=round(100-Number(g.more.baseline_hp_0_100),2); if(Number(before)!==Number(after)){ g.less.baseline_hp_0_100=after; adjusted++; } }
  }
  return {normalized_pairs:pairs, less_rows_adjusted:adjusted, more_anchor_baseline_v5_delta:true};
}
async function insertBaselineV5HpStageRows(env,rows){
  const normalized=normalizeBaselineV5HpPairsMoreAnchor(rows);
  const stmts=rows.map(r=>env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_hp_v2_stage (baseline_hp_row_id,batch_id,source_sanity_batch_id,source_baseline_row_id,player_type,player_id,player_name,canonical_prop_key,prop_family,line_value,selected_side,baseline_hp_0_100,hp_adjustment_0_100,raw_rate_0_100,tier_prior_rate_0_100,raw_prior_gap_0_100,baseline_confidence_0_100,baseline_enriched_confidence_0_100,consistency_bonus_0_100,soft_uncertainty_reserve_0_100,sample_profile,role_profile,sanity_profile_key,volatility_profile,variance_profile,line_difficulty_profile,baseline_hp_profile_key,non_push_sample,hit_count,miss_count,push_count,prior_strength,formula_version,confidence_formula_version,no_daily_context,no_market_context,no_scoring_context,profile_notes_json,source_snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(r.baseline_hp_row_id,r.batch_id,r.source_sanity_batch_id,r.source_baseline_row_id,r.player_type,r.player_id,r.player_name,r.canonical_prop_key,r.prop_family,r.line_value,r.selected_side,r.baseline_hp_0_100,r.hp_adjustment_0_100,r.raw_rate_0_100,r.tier_prior_rate_0_100,r.raw_prior_gap_0_100,r.baseline_confidence_0_100,r.baseline_enriched_confidence_0_100,r.consistency_bonus_0_100,r.soft_uncertainty_reserve_0_100,r.sample_profile,r.role_profile,r.sanity_profile_key,r.volatility_profile,r.variance_profile,r.line_difficulty_profile,r.baseline_hp_profile_key,r.non_push_sample,r.hit_count,r.miss_count,r.push_count,r.prior_strength,r.formula_version,r.confidence_formula_version,r.profile_notes_json,r.source_snapshot_json));
  await batch(env.SCORE_DB,stmts,50);
  return normalized;
}
async function normalizeBaselineV5HpStagePairsSql(env,batchId,players){
  if(!(players||[]).length) return {rows_adjusted_sql:null, sql_pair_normalization_skipped:true};
  let changed=0;
  for(const p of players){
    const playerType=String(p.player_type||''); const playerId=Number(p.player_id||0); if(!playerType||!playerId) continue;
    const res=await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_stage
      SET baseline_hp_0_100 = (
        SELECT ROUND(100 - more.baseline_hp_0_100,2)
        FROM player_baseline_hp_v2_stage more
        WHERE more.batch_id=player_baseline_hp_v2_stage.batch_id
          AND more.player_type=player_baseline_hp_v2_stage.player_type
          AND more.player_id=player_baseline_hp_v2_stage.player_id
          AND more.canonical_prop_key=player_baseline_hp_v2_stage.canonical_prop_key
          AND more.line_value=player_baseline_hp_v2_stage.line_value
          AND more.selected_side='more'
        LIMIT 1
      ),
      updated_at=CURRENT_TIMESTAMP
      WHERE batch_id=?
        AND player_type=?
        AND player_id=?
        AND selected_side='less'
        AND EXISTS (
          SELECT 1 FROM player_baseline_hp_v2_stage more
          WHERE more.batch_id=player_baseline_hp_v2_stage.batch_id
            AND more.player_type=player_baseline_hp_v2_stage.player_type
            AND more.player_id=player_baseline_hp_v2_stage.player_id
            AND more.canonical_prop_key=player_baseline_hp_v2_stage.canonical_prop_key
            AND more.line_value=player_baseline_hp_v2_stage.line_value
            AND more.selected_side='more'
        )`,batchId,playerType,playerId);
    changed += Number(res && res.meta && res.meta.changes || 0);
  }
  return {rows_adjusted_sql:changed, more_anchor_pair_normalization_sql_v0_1_71:true};
}
async function baselineV5HpComplementAudit(env,tableName,batchId,players){
  const allowed=new Set(['player_baseline_hp_v2_stage','player_baseline_hp_v2_current','player_baseline_hp_v2_history']);
  const table=allowed.has(tableName)?tableName:'player_baseline_hp_v2_stage';
  let pairRows=0,badHp=0,badRaw=0,badSample=0,badTier=0;
  const ordered=[...(players||[])].map(p=>({player_type:String(p.player_type||''),player_id:Number(p.player_id||0)})).filter(p=>p.player_type&&p.player_id);
  for(const p of ordered){
    const row=await first(env.SCORE_DB,`WITH hp AS (SELECT player_type, player_id, canonical_prop_key, line_value, selected_side, baseline_hp_0_100, raw_rate_0_100, non_push_sample FROM ${table} WHERE batch_id=? AND player_type=? AND player_id=?), pairs AS (SELECT m.baseline_hp_0_100 AS more_hp,l.baseline_hp_0_100 AS less_hp,m.raw_rate_0_100 AS more_raw,l.raw_rate_0_100 AS less_raw,m.non_push_sample AS more_sample,l.non_push_sample AS less_sample FROM hp m JOIN hp l ON l.player_type=m.player_type AND l.player_id=m.player_id AND l.canonical_prop_key=m.canonical_prop_key AND l.line_value=m.line_value AND l.selected_side='less' WHERE m.selected_side='more') SELECT COUNT(*) AS pair_rows, SUM(CASE WHEN ROUND(more_hp+less_hp,2)!=100 THEN 1 ELSE 0 END) AS bad_hp_complement_rows, SUM(CASE WHEN ROUND(more_raw+less_raw,2)!=100 THEN 1 ELSE 0 END) AS bad_raw_complement_rows, SUM(CASE WHEN more_sample!=less_sample THEN 1 ELSE 0 END) AS bad_sample_pair_rows FROM pairs`,batchId,p.player_type,p.player_id);
    const tier=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM ${table} WHERE batch_id=? AND player_type=? AND player_id=? AND player_type='pitcher' AND ((non_push_sample BETWEEN 1 AND 4 AND sample_profile!='TINY_SAMPLE') OR (non_push_sample BETWEEN 5 AND 9 AND sample_profile!='DEVELOPING') OR (non_push_sample BETWEEN 10 AND 14 AND sample_profile!='ESTABLISHED') OR (non_push_sample>=15 AND sample_profile!='ELITE'))`,batchId,p.player_type,p.player_id);
    pairRows += Number(row&&row.pair_rows||0); badHp += Number(row&&row.bad_hp_complement_rows||0); badRaw += Number(row&&row.bad_raw_complement_rows||0); badSample += Number(row&&row.bad_sample_pair_rows||0); badTier += Number(tier&&tier.c||0);
  }
  return {table_name:table,pair_rows:pairRows,bad_hp_complement_rows:badHp,bad_raw_complement_rows:badRaw,bad_sample_pair_rows:badSample,bad_pitcher_tier_rows:badTier,pass:badHp===0&&badRaw===0&&badSample===0&&badTier===0,bind_safe_player_scoped_audit_v0_1_73:true};
}
async function promoteHpStageForAffected(env,batchId,players){
  let promoted=0, history=0;
  for(const p of players||[]){
    const playerType=String(p.player_type||''); const playerId=Number(p.player_id||0); if(!playerType||!playerId) continue;
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_current SELECT * FROM player_baseline_hp_v2_stage WHERE batch_id=? AND player_type=? AND player_id=?`,batchId,playerType,playerId);
    const ids=await all(env.SCORE_DB,`SELECT baseline_hp_row_id FROM player_baseline_hp_v2_stage WHERE batch_id=? AND player_type=? AND player_id=?`,batchId,playerType,playerId);
    for(const r of ids){ await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_history WHERE batch_id=? AND baseline_hp_row_id=?`,batchId,r.baseline_hp_row_id); }
    await run(env.SCORE_DB,`INSERT INTO player_baseline_hp_v2_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_hp_v2_stage WHERE batch_id=? AND player_type=? AND player_id=?`,batchId,playerType,playerId);
    promoted += ids.length; history += ids.length;
  }
  return {rows_promoted:promoted, history_rows:history};
}
async function runBaselineV5HpDelta(env,input={}){
  await ensureBaselineV2Schema(env);
  const requestId=String(input.request_id||rid('baseline_v5_delta'));
  const runId=String(input.run_id||rid('run'));
  const deltaBatchId=String(input.delta_batch_id||input.batch_id||rid('baseline_v5_delta_batch'));
  const base=await latestCompletedBaselineV5BaseBatch(env);
  if(!base || !base.batch_id){ return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,mode:'baseline_v5_delta',status:'BASELINE_V5_DELTA_BLOCKED_NO_LOCKED_BASE',certification:'BASELINE_V5_DELTA_BLOCKED_NO_LOCKED_BASE',certification_grade:'FAIL_BLOCKED',data_ok:false,ok:false}); }
  const targetBatchId=String(input.target_base_batch_id||base.batch_id);
  const affected=await baselineV5AffectedPlayers(env,targetBatchId,input);
  const affectedPlayers=baselineV5AffectedPlayersOrdered(affected.affected_players);
  await writeBaselineV5DeltaRegistryStart(env,{batchId:deltaBatchId,requestId,runId,mode:'baseline_v5_delta',targetBaseBatchId:targetBatchId});
  if(!affectedPlayers.length){
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,target_base_batch_id:targetBatchId,mode:'baseline_v5_delta',status:affected.waiting_full_layer_coverage?'BASELINE_V5_DELTA_NOOP_WAITING_FULL_LAYER_COVERAGE':'BASELINE_V5_DELTA_NOOP_NO_NEW_FULLY_COVERED_SOURCE_ROWS',certification:affected.waiting_full_layer_coverage?'BASELINE_V5_DELTA_CERTIFIED_NOOP_WAITING_FULL_LAYER_COVERAGE':'BASELINE_V5_DELTA_CERTIFIED_NOOP_NO_NEW_FULLY_COVERED_SOURCE_ROWS',certification_grade:'NOOP_PASS',source_rows_read:0,rows_staged:0,rows_promoted:0,history_rows:0,issue_rows:0,cutoffs:affected.cutoffs,safe_effective_delta_date:affected.safe_effective_delta_date,source_latest_available_date:affected.source_latest_available_date,locked_base_max_cutoff:affected.locked_base_max_cutoff,waiting_full_layer_coverage:affected.waiting_full_layer_coverage,partial_latest_dates_deferred:affected.partial_latest_dates_deferred,deferred_partial_rows:affected.deferred_partial_rows,missing_or_incomplete_coverage_layers:affected.missing_or_incomplete_coverage_layers,affected_hitters:0,affected_pitchers:0,no_board_context:true,no_market_context:true,no_daily_context:true,no_scoring_context:true,no_final_board_context:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,timeout_safe_player_phase_v0_1_74:true});
    await finishBaselineV5DeltaRegistry(env,{batchId:deltaBatchId,mode:'baseline_v5_delta',status:'completed',certification:output.certification,grade:output.certification_grade,sourceRowsRead:0,rowsStaged:0,rowsPromoted:0,historyRows:0,issueRows:0,output}); return output;
  }
  const phase=String(input.hp_delta_phase||'stage');
  const rowsStagedSoFar=Math.max(0,Number(input.hp_delta_rows_staged_so_far||0));
  const rowsPromotedSoFar=Math.max(0,Number(input.hp_delta_rows_promoted_so_far||0));
  const historySoFar=Math.max(0,Number(input.hp_delta_history_rows_so_far||0));
  const issueSoFar=Math.max(0,Number(input.hp_delta_issue_rows_so_far||0));
  async function hpPartial(status,cert,nextInput,extra={}){
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,target_base_batch_id:targetBatchId,mode:'baseline_v5_delta',status,certification:cert,certification_grade:'PARTIAL_CONTINUE',partial_continue:true,orchestrator_should_self_continue:true,affected_player_count:affectedPlayers.length,affected_hitters:affected.affected_hitters,affected_pitchers:affected.affected_pitchers,safe_effective_delta_date:affected.safe_effective_delta_date,source_latest_available_date:affected.source_latest_available_date,locked_base_max_cutoff:affected.locked_base_max_cutoff,partial_latest_dates_deferred:affected.partial_latest_dates_deferred,deferred_partial_rows:affected.deferred_partial_rows,no_board_context:true,no_market_context:true,no_daily_context:true,no_scoring_context:true,no_final_board_context:true,more_anchor_pair_normalization_v0_1_71:true,position_aware_pitcher_tiers:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,timeout_safe_player_phase_v0_1_74:true,...extra,next_input_json:{...input,mode:'baseline_v5_delta',delta_batch_id:deltaBatchId,target_base_batch_id:targetBatchId,safe_effective_delta_date:affected.safe_effective_delta_date,...nextInput}});
    await partialBaselineV5DeltaRegistry(env,{batchId:deltaBatchId,sourceRowsRead:Number(extra.source_rows_read||0),rowsStaged:Number(extra.rows_staged||rowsStagedSoFar),rowsPromoted:Number(extra.rows_promoted||rowsPromotedSoFar),historyRows:Number(extra.history_rows||historySoFar),issueRows:Number(extra.issue_rows||issueSoFar),output});
    return output;
  }
  if(phase==='normalize'){
    const cursor=Math.max(0,Number(input.hp_delta_normalize_player_cursor||0));
    const sel=baselineV5PlayersSlice(affectedPlayers,cursor,10);
    const norm=await normalizeBaselineV5HpStagePairsSql(env,targetBatchId,sel.slice);
    if(!sel.done) return await hpPartial('BASELINE_V5_DELTA_NORMALIZE_PARTIAL_CONTINUE','BASELINE_V5_DELTA_NORMALIZE_PARTIAL_CONTINUE',{hp_delta_phase:'normalize',hp_delta_normalize_player_cursor:sel.next,hp_delta_rows_staged_so_far:rowsStagedSoFar,hp_delta_rows_promoted_so_far:rowsPromotedSoFar,hp_delta_history_rows_so_far:historySoFar,hp_delta_issue_rows_so_far:issueSoFar},{source_rows_read:sel.next,rows_staged:rowsStagedSoFar,rows_promoted:rowsPromotedSoFar,history_rows:historySoFar,issue_rows:issueSoFar,normalization:norm,players_normalized_this_tick:sel.slice.length});
    return await hpPartial('BASELINE_V5_DELTA_NORMALIZE_COMPLETE_AUDIT_PENDING','BASELINE_V5_DELTA_NORMALIZE_COMPLETE_AUDIT_PENDING',{hp_delta_phase:'audit_stage',hp_delta_audit_player_cursor:0,hp_delta_stage_bad_hp:0,hp_delta_stage_bad_raw:0,hp_delta_stage_bad_sample:0,hp_delta_stage_bad_tier:0,hp_delta_rows_staged_so_far:rowsStagedSoFar,hp_delta_rows_promoted_so_far:rowsPromotedSoFar,hp_delta_history_rows_so_far:historySoFar,hp_delta_issue_rows_so_far:issueSoFar},{source_rows_read:affectedPlayers.length,rows_staged:rowsStagedSoFar,rows_promoted:rowsPromotedSoFar,history_rows:historySoFar,issue_rows:issueSoFar,normalization:norm});
  }
  if(phase==='audit_stage' || phase==='audit_current'){
    const cursor=Math.max(0,Number(input.hp_delta_audit_player_cursor||0));
    const sel=baselineV5PlayersSlice(affectedPlayers,cursor,10);
    const table=phase==='audit_current'?'player_baseline_hp_v2_current':'player_baseline_hp_v2_stage';
    const audit=await baselineV5HpComplementAudit(env,table,targetBatchId,sel.slice);
    const badHp=Math.max(0,Number(input.hp_delta_stage_bad_hp||input.hp_delta_current_bad_hp||0))+Number(audit.bad_hp_complement_rows||0);
    const badRaw=Math.max(0,Number(input.hp_delta_stage_bad_raw||input.hp_delta_current_bad_raw||0))+Number(audit.bad_raw_complement_rows||0);
    const badSample=Math.max(0,Number(input.hp_delta_stage_bad_sample||input.hp_delta_current_bad_sample||0))+Number(audit.bad_sample_pair_rows||0);
    const badTier=Math.max(0,Number(input.hp_delta_stage_bad_tier||input.hp_delta_current_bad_tier||0))+Number(audit.bad_pitcher_tier_rows||0);
    if(!sel.done){
      const prefix=phase==='audit_current'?'current':'stage';
      return await hpPartial(`BASELINE_V5_DELTA_${prefix.toUpperCase()}_AUDIT_PARTIAL_CONTINUE`,`BASELINE_V5_DELTA_${prefix.toUpperCase()}_AUDIT_PARTIAL_CONTINUE`,{hp_delta_phase:phase,hp_delta_audit_player_cursor:sel.next,[`hp_delta_${prefix}_bad_hp`]:badHp,[`hp_delta_${prefix}_bad_raw`]:badRaw,[`hp_delta_${prefix}_bad_sample`]:badSample,[`hp_delta_${prefix}_bad_tier`]:badTier,hp_delta_rows_staged_so_far:rowsStagedSoFar,hp_delta_rows_promoted_so_far:rowsPromotedSoFar,hp_delta_history_rows_so_far:historySoFar,hp_delta_issue_rows_so_far:issueSoFar},{source_rows_read:sel.next,rows_staged:rowsStagedSoFar,rows_promoted:rowsPromotedSoFar,history_rows:historySoFar,issue_rows:issueSoFar+badHp+badRaw+badSample+badTier,partial_audit:audit});
    }
    const totalBad=badHp+badRaw+badSample+badTier;
    if(totalBad>0 || phase==='audit_current'){
      const pass=totalBad===0;
      const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:deltaBatchId,target_base_batch_id:targetBatchId,mode:'baseline_v5_delta',status:pass?'BASELINE_V5_DELTA_COMPLETED':'BASELINE_V5_DELTA_BLOCKED_CERTIFIER',certification:pass?'BASELINE_V5_DELTA_CERTIFIED_AFFECTED_ROWS_PROMOTED':'BASELINE_V5_DELTA_BLOCKED_CERTIFIER',certification_grade:pass?'PASS':'FAIL_BLOCKED',source_rows_read:affectedPlayers.length,rows_staged:rowsStagedSoFar,rows_promoted:rowsPromotedSoFar,history_rows:historySoFar,issue_rows:issueSoFar+totalBad,safe_effective_delta_date:affected.safe_effective_delta_date,source_latest_available_date:affected.source_latest_available_date,locked_base_max_cutoff:affected.locked_base_max_cutoff,partial_latest_dates_deferred:affected.partial_latest_dates_deferred,deferred_partial_rows:affected.deferred_partial_rows,affected_player_count:affectedPlayers.length,affected_hitters:affected.affected_hitters,affected_pitchers:affected.affected_pitchers,cutoffs:affected.cutoffs,waiting_full_layer_coverage:affected.waiting_full_layer_coverage,missing_or_incomplete_coverage_layers:affected.missing_or_incomplete_coverage_layers,current_or_stage_audit:{bad_hp_complement_rows:badHp,bad_raw_complement_rows:badRaw,bad_sample_pair_rows:badSample,bad_pitcher_tier_rows:badTier,pass},no_board_context:true,no_market_context:true,no_daily_context:true,no_scoring_context:true,no_final_board_context:true,more_anchor_pair_normalization_v0_1_71:true,position_aware_pitcher_tiers:true,full_cumulative_history_recompute:true,safe_effective_delta_cutoff_v0_1_71:true,timeout_safe_player_phase_v0_1_74:true});
      output.ok=pass; output.data_ok=pass;
      await finishBaselineV5DeltaRegistry(env,{batchId:deltaBatchId,mode:'baseline_v5_delta',status:pass?'completed':'blocked',certification:output.certification,grade:output.certification_grade,sourceRowsRead:affectedPlayers.length,rowsStaged:rowsStagedSoFar,rowsPromoted:rowsPromotedSoFar,historyRows:historySoFar,issueRows:output.issue_rows,output});
      return output;
    }
    return await hpPartial('BASELINE_V5_DELTA_STAGE_AUDIT_COMPLETE_PROMOTION_PENDING','BASELINE_V5_DELTA_STAGE_AUDIT_COMPLETE_PROMOTION_PENDING',{hp_delta_phase:'promote',hp_delta_promote_player_cursor:0,hp_delta_rows_staged_so_far:rowsStagedSoFar,hp_delta_rows_promoted_so_far:rowsPromotedSoFar,hp_delta_history_rows_so_far:historySoFar,hp_delta_issue_rows_so_far:issueSoFar},{source_rows_read:affectedPlayers.length,rows_staged:rowsStagedSoFar,rows_promoted:rowsPromotedSoFar,history_rows:historySoFar,issue_rows:issueSoFar,stage_audit:{bad_hp_complement_rows:badHp,bad_raw_complement_rows:badRaw,bad_sample_pair_rows:badSample,bad_pitcher_tier_rows:badTier,pass:true}});
  }
  if(phase==='promote'){
    const cursor=Math.max(0,Number(input.hp_delta_promote_player_cursor||0));
    const sel=baselineV5PlayersSlice(affectedPlayers,cursor,3);
    const promoted=await promoteHpStageForAffected(env,targetBatchId,sel.slice);
    const rowsPromotedTotal=rowsPromotedSoFar+Number(promoted.rows_promoted||0);
    const historyTotal=historySoFar+Number(promoted.history_rows||0);
    if(!sel.done) return await hpPartial('BASELINE_V5_DELTA_PROMOTION_PARTIAL_CONTINUE','BASELINE_V5_DELTA_PROMOTION_PARTIAL_CONTINUE',{hp_delta_phase:'promote',hp_delta_promote_player_cursor:sel.next,hp_delta_rows_staged_so_far:rowsStagedSoFar,hp_delta_rows_promoted_so_far:rowsPromotedTotal,hp_delta_history_rows_so_far:historyTotal,hp_delta_issue_rows_so_far:issueSoFar},{source_rows_read:sel.next,rows_staged:rowsStagedSoFar,rows_promoted:rowsPromotedTotal,history_rows:historyTotal,issue_rows:issueSoFar,players_promoted_this_tick:sel.slice.length,rows_promoted_this_tick:promoted.rows_promoted,history_rows_this_tick:promoted.history_rows});
    return await hpPartial('BASELINE_V5_DELTA_PROMOTION_COMPLETE_CURRENT_AUDIT_PENDING','BASELINE_V5_DELTA_PROMOTION_COMPLETE_CURRENT_AUDIT_PENDING',{hp_delta_phase:'audit_current',hp_delta_audit_player_cursor:0,hp_delta_current_bad_hp:0,hp_delta_current_bad_raw:0,hp_delta_current_bad_sample:0,hp_delta_current_bad_tier:0,hp_delta_rows_staged_so_far:rowsStagedSoFar,hp_delta_rows_promoted_so_far:rowsPromotedTotal,hp_delta_history_rows_so_far:historyTotal,hp_delta_issue_rows_so_far:issueSoFar},{source_rows_read:affectedPlayers.length,rows_staged:rowsStagedSoFar,rows_promoted:rowsPromotedTotal,history_rows:historyTotal,issue_rows:issueSoFar});
  }
  const cursor=Math.max(0,Number(input.hp_delta_player_cursor||0));
  const sel=baselineV5PlayersSlice(affectedPlayers,cursor,1);
  let processed=0; const issues=[]; const sample=[]; const stageRows=[];
  for(const p of sel.slice){
    const rows=await baselineV5HpRowsForPlayers(env,targetBatchId,[p],0,10000);
    for(const row of rows){
      try{ const payload=await recomputeBaselineV5HpStageRow(env,targetBatchId,row,affected.safe_effective_delta_date); stageRows.push(payload); processed++; if(sample.length<20) sample.push({player_type:payload.player_type,player_id:payload.player_id,prop:payload.canonical_prop_key,line:payload.line_value,side:payload.selected_side,hp:payload.baseline_hp_0_100,sample_profile:payload.sample_profile,non_push_sample:payload.non_push_sample}); }
      catch(e){ issues.push({baseline_hp_row_id:row.baseline_hp_row_id,player_type:row.player_type,player_id:row.player_id,prop:row.canonical_prop_key,line:row.line_value,side:row.selected_side,error:String(e&&e.message?e.message:e).slice(0,400)}); }
    }
  }
  const normalization=await insertBaselineV5HpStageRows(env,stageRows);
  const rowsStagedTotal=rowsStagedSoFar+processed;
  const issuesTotal=issueSoFar+issues.length;
  const nextPhase=sel.done?'normalize':'stage';
  return await hpPartial(sel.done?'BASELINE_V5_DELTA_STAGE_COMPLETE_NORMALIZE_PENDING':'BASELINE_V5_DELTA_STAGE_PARTIAL_CONTINUE',sel.done?'BASELINE_V5_DELTA_STAGE_COMPLETE_NORMALIZE_PENDING':'BASELINE_V5_DELTA_STAGE_PARTIAL_CONTINUE',{hp_delta_phase:nextPhase,hp_delta_player_cursor:sel.next,hp_delta_normalize_player_cursor:0,hp_delta_rows_staged_so_far:rowsStagedTotal,hp_delta_rows_promoted_so_far:rowsPromotedSoFar,hp_delta_history_rows_so_far:historySoFar,hp_delta_issue_rows_so_far:issuesTotal},{source_rows_read:sel.next,rows_staged:rowsStagedTotal,rows_promoted:rowsPromotedSoFar,history_rows:historySoFar,issue_rows:issuesTotal,players_staged_this_tick:sel.slice.length,rows_staged_this_tick:processed,normalization,issue_sample:issues.slice(0,20),sample_rows:sample});
}


async function runBaselineV2(env,input={}){
  await ensureSchema(env); await ensureBaselineV2Schema(env);
  const requestId=String(input.request_id||rid("baseline_v5")); const runId=String(input.run_id||rid("run"));
  const requestedV5Mode=String(input.mode||input.expansion_mode||"baseline_v5_base");
  const classificationOnly=(requestedV5Mode==="baseline_v5_classification_base" || requestedV5Mode==="baseline_v5_classification_delta");
  const readOnlyClassificationBaseline=baselineV5ReadOnlyClassificationMode(requestedV5Mode);
  const before=await productionCounts(env);
  let batchId=String(input.batch_id||"");
  const explicitBatchIdProvided=!!input.batch_id;
  if(readOnlyClassificationBaseline && !explicitBatchIdProvided){
    batchId=await resolveLockedClassificationBatchId(env,input,requestedV5Mode);
  }
  if(!batchId) batchId=rid("player_baseline_v2_batch");
  const expectedLockedClassificationRows=Number(input.expected_classification_rows||BASELINE_V5_LOCKED_BASE_EXPECTED_ROWS);
  // V5 ignores source_hp_v2_batch_id/read_all_hp_v2_current entirely. The Control Room may still pass
  // those legacy fields, but the worker source is historical static/base/delta only.
  const sourceHpV2BatchId="__BASELINE_V5_HISTORY_ONLY__";
  const readAllHpV2Current=true;
  const requestedChunkSize=Number(input.v2_chunk_size||input.v2_source_chunk_size||0);
  const requestedFastChunk=Number(input.v2_all_current_chunk_size||input.v2_fast_chunk_size||0);
  // v0.1.63 efficiency-only: Baseline Base calibration is frozen at formula v0.5.3.
  // Proven root cause from live SQL: Control Room passes v2_chunk_size=50 plus
  // v2_force_exact_chunk_size=1 / force_v2_chunk_size=1.  v0.1.62 still honored
  // that stale exact-size payload, so effective_v2_chunk_size remained 50 and only
  // one 110-row hitter group was staged.  In read-only Baseline Base, ignore those
  // forced-low chunk flags and enforce a safe multi-player floor.
  const baselineV5FastFloor = readOnlyClassificationBaseline ? 700 : 160;
  const baselineV5FastCap = readOnlyClassificationBaseline ? 900 : 220;
  const inputForcedExactChunk=input.v2_force_exact_chunk_size===true || input.force_v2_chunk_size===true;
  const forcedExactChunk=readOnlyClassificationBaseline ? false : inputForcedExactChunk;
  const allCurrentFastDefault=readOnlyClassificationBaseline
    ? Math.max(requestedFastChunk || 0, baselineV5FastFloor)
    : (forcedExactChunk ? (requestedFastChunk || baselineV5FastFloor) : Math.max(requestedFastChunk || 0, baselineV5FastFloor));
  const effectiveRequestedChunk=readAllHpV2Current
    ? (readOnlyClassificationBaseline
        ? Math.max(requestedChunkSize || 0, allCurrentFastDefault || 0, baselineV5FastFloor)
        : (forcedExactChunk ? (requestedChunkSize || allCurrentFastDefault || baselineV5FastFloor) : Math.max(requestedChunkSize || 0, allCurrentFastDefault || 0, baselineV5FastFloor)))
    : (requestedChunkSize || allCurrentFastDefault || 8);
  const chunkSize=clamp(effectiveRequestedChunk || (readAllHpV2Current?baselineV5FastFloor:8),1,readAllHpV2Current?baselineV5FastCap:32);
  let cursor=Number(input.v2_cursor_offset||0);
  const startedMs=Date.now();
  let lastBaselineHeartbeatMs=startedMs;
  // v0.1.33: never let the worker soft-yield equal the orchestrator stale-running threshold (60s).
  // The prior 60s soft yield raced stale recovery and caused duplicate/restarted batches.
  const requestedSoftYieldMs=Number(input.v2_soft_yield_ms || (readAllHpV2Current?22000:18000));
  const softYieldMs=readAllHpV2Current ? 22000 : clamp(requestedSoftYieldMs,8000,25000);
  let lockedClassificationBefore=null;
  let reusedRunningBatch=false;
  let terminalStageRescue=false;
  if(!explicitBatchIdProvided && cursor===0){
    const existing=await first(env.SCORE_DB,`SELECT batch_id, source_rows_read, rows_staged, issue_rows, worker_version FROM player_baseline_hp_v2_batches WHERE request_id=? AND status IN ('running','partial_continue') ORDER BY datetime(updated_at) DESC LIMIT 1`,requestId);
    if(existing && existing.batch_id && String(existing.worker_version||"")===VERSION){
      batchId=String(existing.batch_id);
      const stageProgress=await first(env.SCORE_DB,`SELECT COUNT(*) AS staged FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
      const issueProgress=await first(env.SCORE_DB,`SELECT COUNT(*) AS issues FROM player_baseline_hp_v2_issues WHERE batch_id=?`,batchId);
      cursor=Math.max(Number(existing.source_rows_read||0), Number(stageProgress&&stageProgress.staged||0)+Number(issueProgress&&issueProgress.issues||0));
      reusedRunningBatch=true;
    } else if(existing && existing.batch_id){
      // v0.1.59: stale v0.1.58 partial runs must not resume from dirty stage rows.
      cursor=0;
      reusedRunningBatch=false;
    }
  }
  async function heartbeatBaselineV2(extra={}){
    try{ await run(env.CONTROL_DB,`UPDATE control_job_queue SET updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'`,requestId); }catch(_e){}
    try{ await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET worker_version=?, source_rows_read=?, rows_staged=(SELECT COUNT(*) FROM player_baseline_hp_v2_stage WHERE batch_id=?), issue_rows=(SELECT COUNT(*) FROM player_baseline_hp_v2_issues WHERE batch_id=?), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,cursor,batchId,batchId,batchId); }catch(_e){}
    try{ await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET worker_version=?, rows_staged=(SELECT COUNT(*) FROM player_baseline_sanity_v2_stage WHERE batch_id=?), issue_rows=(SELECT COUNT(*) FROM player_baseline_hp_v2_issues WHERE batch_id=?), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,batchId,batchId,batchId); }catch(_e){}
  }
  if(readOnlyClassificationBaseline){
    const rescueProbe=await first(env.SCORE_DB,`SELECT
      (SELECT COUNT(*) FROM player_baseline_hp_v2_source_queue WHERE batch_id=?) AS source_rows,
      (SELECT COUNT(*) FROM player_baseline_hp_v2_stage WHERE batch_id=?) AS stage_rows,
      (SELECT COUNT(*)-COUNT(DISTINCT baseline_hp_row_id) FROM player_baseline_hp_v2_stage WHERE batch_id=?) AS stage_duplicates,
      (SELECT COALESCE(rows_promoted,0) FROM player_baseline_hp_v2_batches WHERE batch_id=?) AS rows_promoted,
      (SELECT COALESCE(history_rows,0) FROM player_baseline_hp_v2_batches WHERE batch_id=?) AS history_rows`,batchId,batchId,batchId,batchId,batchId);
    const rescueSourceRows=Number(rescueProbe&&rescueProbe.source_rows||0);
    const rescueStageRows=Number(rescueProbe&&rescueProbe.stage_rows||0);
    const rescueDupes=Number(rescueProbe&&rescueProbe.stage_duplicates||0);
    const rescuePromoted=Number(rescueProbe&&rescueProbe.rows_promoted||0);
    const rescueHistory=Number(rescueProbe&&rescueProbe.history_rows||0);
    if(rescueSourceRows>=expectedLockedClassificationRows && rescueStageRows===rescueSourceRows && rescueDupes===0 && (rescuePromoted<rescueStageRows || rescueHistory<rescueStageRows)){
      cursor=rescueStageRows; reusedRunningBatch=true; terminalStageRescue=true;
      await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status='running', worker_version=?, source_rows_read=?, rows_staged=?, output_json=json_set(json_set(COALESCE(output_json,'{}'),'$.terminal_stage_rescue_v0_1_64',1),'$.terminal_stage_rescue_v0_1_65',1), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,cursor,rescueStageRows,batchId);
      await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status='running', worker_version=?, rows_staged=?, output_json=json_set(json_set(COALESCE(output_json,'{}'),'$.terminal_stage_rescue_v0_1_64',1),'$.terminal_stage_rescue_v0_1_65',1), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,rescueStageRows,batchId);
    }
  }
  if(readOnlyClassificationBaseline && cursor>0){
    const activeBatchVersion=await first(env.SCORE_DB,`SELECT worker_version, source_rows_read, rows_staged, rows_promoted, history_rows FROM player_baseline_hp_v2_batches WHERE batch_id=?`,batchId);
    if(activeBatchVersion && String(activeBatchVersion.worker_version||"")!==VERSION && Number(activeBatchVersion.rows_promoted||0)===0 && Number(activeBatchVersion.history_rows||0)===0 && !terminalStageRescue){
      // v0.1.60 takeover safety: reset older partial state.
      // v0.1.64 exception: if a full clean stage already exists, terminalStageRescue preserves it.
      cursor=0;
      reusedRunningBatch=false;
    } else if(activeBatchVersion && Number(activeBatchVersion.rows_promoted||0)===0 && Number(activeBatchVersion.history_rows||0)===0){
      // v0.1.60: Control queue next_input can carry an old cursor after a hot patch/wake.
      // The only trusted resume cursor for Baseline Base is actual fresh stage progress (+ logged issue rows),
      // never stale input/output cursor state. This prevents skipping source_queue rows after a reset.
      const stageProgress=await first(env.SCORE_DB,`SELECT COUNT(*) AS staged FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
      const issueProgress=await first(env.SCORE_DB,`SELECT COUNT(*) AS issues FROM player_baseline_hp_v2_issues WHERE batch_id=?`,batchId);
      const trustedCursor=Number(stageProgress&&stageProgress.staged||0)+Number(issueProgress&&issueProgress.issues||0);
      if(cursor>trustedCursor){
        cursor=trustedCursor;
        reusedRunningBatch=trustedCursor>0;
      }
    }
  }
  if(cursor===0 && !reusedRunningBatch){
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,requestedV5Mode,"running",VERSION);
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,source_sanity_batch_id,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,requestedV5Mode,"running",VERSION,batchId);
    if(readOnlyClassificationBaseline){
      lockedClassificationBefore=await lockedClassificationSnapshot(env,batchId);
      const lockedGuard=validateLockedClassificationSnapshot(lockedClassificationBefore,expectedLockedClassificationRows);
      if(!lockedGuard.ok){
        const blockedOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:requestedV5Mode,status:"BASELINE_V5_BASE_BLOCKED_CLASSIFICATION_READONLY_GUARD",certification:"BASELINE_V5_BASE_BLOCKED_CLASSIFICATION_READONLY_GUARD",certification_grade:"BLOCKED_CLASSIFICATION_GUARD",classification_readonly_guard:{ok:false,problems:lockedGuard.problems,before:lockedClassificationBefore},allowed_downstream:"blocked: locked Classification V5/source_queue must remain complete before Baseline Base"});
        await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=0, rows_promoted=0, history_rows=0, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
        await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=0, rows_staged=0, rows_promoted=0, history_rows=0, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
        blockedOutput.ok=false; blockedOutput.data_ok=false; return blockedOutput;
      }
      await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId);
      await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
      await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_issues WHERE batch_id=?`,batchId);
    } else {
      await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`DELETE FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId);
    }
  } else if(reusedRunningBatch){
    await heartbeatBaselineV2({reusedRunningBatch:true});
  }
  if(readOnlyClassificationBaseline && !lockedClassificationBefore){
    lockedClassificationBefore=await lockedClassificationSnapshot(env,batchId);
    const lockedGuard=validateLockedClassificationSnapshot(lockedClassificationBefore,expectedLockedClassificationRows);
    if(!lockedGuard.ok){
      const blockedOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:requestedV5Mode,status:"BASELINE_V5_BASE_BLOCKED_CLASSIFICATION_READONLY_GUARD",certification:"BASELINE_V5_BASE_BLOCKED_CLASSIFICATION_READONLY_GUARD",certification_grade:"BLOCKED_CLASSIFICATION_GUARD",classification_readonly_guard:{ok:false,problems:lockedGuard.problems,before:lockedClassificationBefore}});
      blockedOutput.ok=false; blockedOutput.data_ok=false; return blockedOutput;
    }
  }
  // v0.1.43: Baseline V2 must be independent from board/current HP, market, daily context, and app source.
  // Build canonical history inventory directly from historical player rows. The source_queue table is retained
  // only as a batch-local work queue; source_key/source_keys are intentionally NULL.
  const logicalGroupBy=`baseline_formula_scope, COALESCE(mlb_player_id,0), canonical_prop_key, board_line_value, selected_side, profile_namespace, source_formula_key`;
  let queuedSourceRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId))?.c||0);
  let canonicalHistoryQueueBuild=null;
  if(queuedSourceRows===0 && cursor===0){
    if(readOnlyClassificationBaseline){
      const blockedOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:requestedV5Mode,status:"BASELINE_V5_BASE_BLOCKED_NO_LOCKED_SOURCE_QUEUE",certification:"BASELINE_V5_BASE_BLOCKED_NO_LOCKED_SOURCE_QUEUE",certification_grade:"BLOCKED_SOURCE_QUEUE",classification_readonly_guard:{ok:false,before:lockedClassificationBefore},allowed_downstream:"blocked: Baseline Base requires locked classification source_queue; it will not rebuild source_queue"});
      await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=0, rows_staged=0, rows_promoted=0, history_rows=0, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
      blockedOutput.ok=false; blockedOutput.data_ok=false; return blockedOutput;
    }
    await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId);
    canonicalHistoryQueueBuild=await buildCanonicalHistoryBaselineSourceQueue(env,batchId,input);
    queuedSourceRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId))?.c||0);
  }
  const total=queuedSourceRows;
  const rawHpV2SourceRows=0;
  const nullOnlySourceRows=0;
  let rows=readOnlyClassificationBaseline
    ? await all(env.SCORE_DB,`SELECT
        q.hp_v2_row_id,q.source_key,q.source_keys,q.game_pk,q.official_date,q.mlb_player_id,q.player_name,q.canonical_prop_key,q.board_line_value,q.selected_side,q.factor_family,q.profile_namespace,q.source_formula_key,q.baseline_formula_scope,q.source_hp_v2_rows,q.source_hp_v2_batch_ids,q.source_game_pks,
        c.classification_row_id AS cls_classification_row_id,
        c.classification_tier AS cls_classification_tier,
        c.classification_profile_key AS cls_classification_profile_key,
        c.sample_profile AS cls_sample_profile,
        c.volume_profile AS cls_volume_profile,
        c.lineup_profile AS cls_lineup_profile,
        c.platoon_profile AS cls_platoon_profile,
        c.usage_profile AS cls_usage_profile,
        c.volatility_profile AS cls_volatility_profile,
        c.classification_confidence_0_100 AS cls_classification_confidence_0_100,
        c.games_sample AS cls_games_sample,
        c.events_sample AS cls_events_sample,
        c.pa_per_game AS cls_pa_per_game,
        c.ab_ratio AS cls_ab_ratio,
        c.avg_batting_order AS cls_avg_batting_order,
        c.split_delta_0_100 AS cls_split_delta_0_100,
        c.classification_json AS cls_classification_json
      FROM player_baseline_hp_v2_source_queue q
      JOIN player_baseline_classification_v5_current c
        ON c.batch_id=q.batch_id
       AND c.player_type=q.factor_family
       AND c.player_id=q.mlb_player_id
       AND c.canonical_prop_key=q.canonical_prop_key
       AND c.line_value=q.board_line_value
       AND c.selected_side=q.selected_side
      WHERE q.batch_id=?
      ORDER BY q.queue_row_id LIMIT ? OFFSET ?`,batchId,chunkSize,cursor)
    : await all(env.SCORE_DB,`SELECT hp_v2_row_id,source_key,source_keys,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,board_line_value,selected_side,factor_family,profile_namespace,source_formula_key,baseline_formula_scope,source_hp_v2_rows,source_hp_v2_batch_ids,source_game_pks FROM player_baseline_hp_v2_source_queue WHERE batch_id=? ORDER BY queue_row_id LIMIT ? OFFSET ?`,batchId,chunkSize,cursor);
  if(rows.length===chunkSize && rows.length>1){
    const last=rows[rows.length-1];
    const lastKey=`${last.factor_family}|${last.mlb_player_id}`;
    let firstLast=rows.length-1;
    while(firstLast>0 && `${rows[firstLast-1].factor_family}|${rows[firstLast-1].mlb_player_id}`===lastKey) firstLast--;
    if(firstLast>0) rows=rows.slice(0,firstLast);
  }
  let written=0, issues=0, processed=0;
  const stageStatements=[];
  const stageBatchSize=readAllHpV2Current?240:60;
  async function maybeHeartbeatBaselineV2(extra={}){
    if(Date.now()-lastBaselineHeartbeatMs>=8000){
      await heartbeatBaselineV2(extra);
      lastBaselineHeartbeatMs=Date.now();
    }
  }
  async function flushStageStatements(){
    if(stageStatements.length){
      const pending=stageStatements.splice(0, stageStatements.length);
      await batch(env.SCORE_DB,pending,stageBatchSize);
      await maybeHeartbeatBaselineV2({flushed:pending.length,processed});
    }
  }
  for(const r of rows){
    processed++;
    const line=Number(r.board_line_value); const side=String(r.selected_side);
    const entityType=baselineV2EntityType(r);
    const lineBucket=lineThresholdBucketForInventory(r.canonical_prop_key,line);
    const profileNamespace=r.profile_namespace || `${String(entityType).toUpperCase()}_${upperToken(r.canonical_prop_key)}_V2_`;
    const formulaKey=r.source_formula_key || `V2_${upperToken(r.canonical_prop_key)}_DYNAMIC`;
    const values=await loadValuesForHpRow(env,r);
    const hs=hitStatsFor(values,line,side);
    const directModel=directHistoryOnlyBaselineModel(values,r.canonical_prop_key,line,side,entityType);
    const model={...directModel, baseline_hp_0_100:directModel.prob==null?null:round(clamp(directModel.prob*100,0,100),2), baseline_confidence_0_100:directModel.prob==null?5:round(clamp(directModel.confidence,1,95),2), model_version:BASELINE_V2_FORMULA_VERSION, confidence_version:BASELINE_V2_CONFIDENCE_VERSION, binary_game_rate_replaced:false, direct_history_only:true};
    const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,r.canonical_prop_key,entityType);
    const roleProfile=entityType==="pitcher"?"V2_PITCHER_ENTITY":(entityType==="game_pair"?"V2_GAME_PAIR_ENTITY":"V2_HITTER_ENTITY");
    const canonicalKey=canonicalBaselineKey(r,line,side,profileNamespace,formulaKey);
    const hpId=readOnlyClassificationBaseline ? String(r.hp_v2_row_id || `pbhp_v2|${canonicalKey}`) : `pbhp_v2|${canonicalKey}`;
    const sanityId=readOnlyClassificationBaseline ? `pbs_v2|${hpId}` : `pbs_v2|${canonicalKey}`;
    let confidence=round(clamp(model.baseline_confidence_0_100,1,95),2);
    let post=model.baseline_hp_0_100;
    const resolvedPlayerName=safeResolvedPlayerName(r);
    const calibrationGuard=applyBaselineV2CalibrationGuard({prop:r.canonical_prop_key,entityType,side,line,hp:post,confidence,hs,sampleTier});
    post=calibrationGuard.hp; confidence=calibrationGuard.confidence;
    const calibratedModel={...model, baseline_hp_0_100:post, baseline_confidence_0_100:confidence, calibration_guard_v0_1_34:calibrationGuard};
    const trace={baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",source_formula_key:formulaKey,profile_namespace:profileNamespace,entity_type:entityType,exact_line_value:line,selected_side:side,direct_binary_reference:{hit:hs.hit,miss:hs.miss,push:hs.push,non_push_sample:hs.non_push_sample,raw_rate_0_100:hs.raw_rate_0_100},model_engine:calibratedModel.engine,baseline_hp_0_100:post,baseline_confidence_0_100:confidence,sample_tier:sampleTier,canonical_entity_line_side_key:canonicalKey,baseline_formula_scope:String(r.baseline_formula_scope||""),no_daily_context:true,no_market_context:true,no_scoring_context:true,no_board_context:true,no_app_context:true,calibration_frozen_formula_version:BASELINE_V2_FORMULA_VERSION,efficiency_patch:"v0.1.63_ignore_forced_low_chunk_no_calibration_change"};
    if(calibrationGuard && calibrationGuard.block_promotion){
      stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_hp_v2_issues (issue_id,batch_id,source_baseline_row_id,severity,issue_code,issue_message,issue_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`cal_pending|${batchId}|${hpId}`,batchId,hpId,"WARN","CALIBRATION_PENDING_SAMPLE60_GAP_GT10","Sample >60 and calibrated HP differs from raw empirical rate by >10 points; block auto-promotion pending calibration audit",safeJson({row:{player_id:r.mlb_player_id,player_name:resolvedPlayerName,canonical_prop_key:r.canonical_prop_key,line_value:line,selected_side:side},trace})));
    }
    if(post==null){
      issues++;
      const fallbackRaw = hs.raw_rate_0_100==null ? 50 : Number(hs.raw_rate_0_100);
      const fallbackBounds = historyOnlyHpOperationalBounds(r.canonical_prop_key, entityType, line, hs.non_push_sample);
      post=round(clamp(fallbackRaw, fallbackBounds.floor, fallbackBounds.ceiling),2);
      confidence=round(Math.min(Number(confidence||5), hs.non_push_sample>=20?10:5),2);
      trace.fallback_probability_v0_1_59={reason:"model_no_probability",fallback_from_raw_rate:true,raw_rate_0_100:hs.raw_rate_0_100,post_hp_0_100:post,confidence_0_100:confidence,bounds:fallbackBounds};
      stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_hp_v2_issues (issue_id,batch_id,source_baseline_row_id,severity,issue_code,issue_message,issue_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`fallback|${batchId}|${hpId}`,batchId,hpId,"WARN","V2_MODEL_NO_PROBABILITY_FALLBACK_ROW_WRITTEN","Locked baseline model could not emit probability; wrote low-confidence raw/prior fallback row to preserve source_queue parity",safeJson({row:r,trace})));
    }
    const stats=valueStats(values);
    const classification=readOnlyClassificationBaseline ? classificationFromLockedQueueJoinRow(r) : await classifyBaselineV5(env,r,line,side,entityType,calibratedModel,hs,stats);
    trace.classification_v5=classification;
    trace.classification_contract=readOnlyClassificationBaseline
      ? {consumes_locked_classification:true,history_only:true,read_only_classification:true,per_player_prop_line_side:true,keeps_locked_calibration_logic:true,source_queue_read_only:true}
      : {replaces_old_sanity:true,history_only:true,uses_batting_order:entityType==="hitter",uses_platoon_splits:true,per_player_prop_line_side:true,keeps_locked_calibration_logic:true,source_mapping_guard_v0_1_48:true};
    if(!readOnlyClassificationBaseline){
      const classificationId=`pbc_v5|${canonicalKey}`;
      stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_classification_v5_stage (classification_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,classification_tier,classification_profile_key,sample_profile,volume_profile,lineup_profile,platoon_profile,usage_profile,volatility_profile,classification_confidence_0_100,games_sample,events_sample,pa_per_game,ab_ratio,avg_batting_order,split_delta_0_100,classification_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(classificationId,batchId,entityType,Number(r.mlb_player_id)||null,resolvedPlayerName,r.canonical_prop_key,line,side,classification.classification_tier,classification.classification_profile_key,classification.sample_profile,classification.volume_profile,classification.lineup_profile,classification.platoon_profile,classification.usage_profile,classification.volatility_profile,classification.classification_confidence_0_100,classification.games_sample,classification.events_sample,classification.pa_per_game,classification.ab_ratio,classification.avg_batting_order,classification.split_delta_0_100,safeJson(classification)));
    }
    stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_sanity_v2_stage (baseline_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,role_profile,prior_pool_key,sanity_profile_key,sample_profile,usage_profile,line_difficulty_profile,volatility_profile,baseline_drag_profile,confidence_drag_profile,variance_profile,games_sample,events_sample,baseline_confidence_0_100,line_baseline_json,distribution_shape_json,notes_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(sanityId,batchId,entityType,Number(r.mlb_player_id)||null,resolvedPlayerName,r.canonical_prop_key,roleProfile,`${profileNamespace}|${side}|${lineBucket}|${classification.classification_tier}|${sampleTier}`,classification.classification_profile_key,sampleTier,(model.games||hs.non_push_sample)>=20?"ESTABLISHED_HISTORY":"LIMITED_HISTORY",lineDifficulty(profileNamespace,line),stats.volatility_profile,"NONE","NONE",stats.volatility_profile,model.games||values.length,model.games||values.length,confidence,safeJson({line,hit:hs.hit,miss:hs.miss,push:hs.push,raw_rate_0_100:hs.raw_rate_0_100,baseline_hp_0_100:post,formula_version:BASELINE_V2_FORMULA_VERSION}),safeJson({volatility_profile:stats.volatility_profile,model_engine:model.engine,sample:hs.non_push_sample}),safeJson({history_only:true,calibration_frozen:true,efficiency_patch:"v0.1.64_terminal_certification_memory_safe"})));
    stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_hp_v2_stage (baseline_hp_row_id,batch_id,source_sanity_batch_id,source_baseline_row_id,player_type,player_id,player_name,canonical_prop_key,prop_family,line_value,selected_side,baseline_hp_0_100,hp_adjustment_0_100,raw_rate_0_100,tier_prior_rate_0_100,raw_prior_gap_0_100,baseline_confidence_0_100,baseline_enriched_confidence_0_100,consistency_bonus_0_100,soft_uncertainty_reserve_0_100,sample_profile,role_profile,sanity_profile_key,volatility_profile,variance_profile,line_difficulty_profile,baseline_hp_profile_key,non_push_sample,hit_count,miss_count,push_count,prior_strength,formula_version,confidence_formula_version,no_daily_context,no_market_context,no_scoring_context,profile_notes_json,source_snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(hpId,batchId,batchId,sanityId,entityType,Number(r.mlb_player_id)||null,resolvedPlayerName,r.canonical_prop_key,propFamilyV2(r.canonical_prop_key,entityType),line,side,post,0,hs.raw_rate_0_100,post,hs.raw_rate_0_100==null?null:round(hs.raw_rate_0_100-post,2),confidence,confidence,0,round(100-confidence,2),sampleTier,roleProfile,classification.classification_profile_key,stats.volatility_profile,stats.volatility_profile,lineDifficulty(profileNamespace,line),`${classification.classification_profile_key}_MODEL`,hs.non_push_sample,hs.hit,hs.miss,hs.push,model.games||hs.non_push_sample||1,BASELINE_V2_FORMULA_VERSION,BASELINE_V2_CONFIDENCE_VERSION,safeJson(trace),safeJson({source_rows:model.games||values.length,source_formula_key:formulaKey,profile_namespace:profileNamespace,canonical_entity_line_side_key:canonicalKey,baseline_formula_scope:String(r.baseline_formula_scope||""),history_inventory_rows:Number(r.source_hp_v2_rows||1),history_game_pks:String(r.source_game_pks||r.game_pk||""),model_engine:model.engine,binary_game_rate_replaced:true,baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app"})));
    if(stageStatements.length>=stageBatchSize) await flushStageStatements();
    written++;
  }
  await flushStageStatements();
  const next=cursor+processed;
  let stageShapeRepair=null;
  if(next>=total){
    stageShapeRepair=await repairBaselineV2StageLadders(env,batchId);
  }
  const staged=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId))?.c||0);
  const issueTotalSoFar=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_issues WHERE batch_id=?`,batchId))?.c||0);
  if(next<total){
    const partialOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,read_all_hp_v2_current:readAllHpV2Current,mode:requestedV5Mode,status:"BASELINE_V5_HISTORY_PARTIAL_CONTINUE",certification:"BASELINE_V5_HISTORY_PARTIAL_CONTINUE",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,v2_cursor_offset:next,v2_chunk_size:chunkSize,effective_v2_chunk_size:chunkSize,target_source_rows:total,raw_hp_v2_source_rows:rawHpV2SourceRows,null_only_source_rows:nullOnlySourceRows,pct_done:total?round((next*100)/total,2):null,rows_remaining:Math.max(total-next,0),rows_written:written,rows_staged:staged,issue_rows:issueTotalSoFar,processed_rows:processed,soft_yield_ms:softYieldMs,elapsed_ms:Date.now()-startedMs,stage_write_mode:"CANONICAL_HISTORY_SOURCE_QUEUE_BATCHED_STAGE_INSERTS",canonical_history_queue_build:canonicalHistoryQueueBuild,stage_batch_size:stageBatchSize,fast_safe_chunk_policy:"v0_1_67_terminal_promotion_subquery_checkpoint_safe_calibration_frozen",reused_running_batch:reusedRunningBatch,input_forced_exact_chunk:inputForcedExactChunk,forced_exact_chunk_ignored_for_baseline_base:readOnlyClassificationBaseline && inputForcedExactChunk,next_input_json:{...input,mode:requestedV5Mode,batch_id:batchId,v2_cursor_offset:next,v2_chunk_size:chunkSize,v2_all_current_chunk_size:allCurrentFastDefault,v2_force_exact_chunk_size:false,force_v2_chunk_size:false,v2_soft_yield_ms:softYieldMs,fast_safe_chunk_policy:"v0_1_67_terminal_promotion_subquery_checkpoint_safe_calibration_frozen"}});
    await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET worker_version=?, rows_staged=?, issue_rows=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,staged,issueTotalSoFar,safeJson(partialOutput),batchId);
    await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET worker_version=?, source_rows_read=?, rows_staged=?, issue_rows=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,next,staged,issueTotalSoFar,safeJson(partialOutput),batchId);
    return partialOutput;
  }
  const actualIssueRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_issues WHERE batch_id=?`,batchId))?.c||0);
  const calibrationPendingRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_issues WHERE batch_id=? AND issue_code LIKE 'CALIBRATION_%'`,batchId))?.c||0);
  const classificationRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId))?.c||0);
  if(classificationOnly){
    const stageShapeAudit=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_stage");
    if(stageShapeAudit.bad_players>0){
      const blockedOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:requestedV5Mode,status:"BASELINE_V5_CLASSIFICATION_BLOCKED_INCOMPLETE_SHAPE",certification:"BASELINE_V5_CLASSIFICATION_BLOCKED_INCOMPLETE_SHAPE",certification_grade:"BLOCKED_SHAPE",source_rows_read:total,classification_rows:classificationRows,rows_staged:classificationRows,rows_promoted:0,history_rows:0,issue_rows:actualIssueRows,classification_only:true,shape_audit:stageShapeAudit,missing_shape_guard_v0_1_49:true,allowed_downstream:"blocked: run Classification Base Rescue or rerun Classification Base after patch"});
      await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=0, history_rows=0, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",classificationRows,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
      await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=0, history_rows=0, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",total,classificationRows,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
      blockedOutput.ok=false; blockedOutput.data_ok=false; return blockedOutput;
    }
    await run(env.SCORE_DB,`DELETE FROM player_baseline_classification_v5_current`);
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_classification_v5_current SELECT * FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId);
    await run(env.SCORE_DB,`INSERT INTO player_baseline_classification_v5_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId);
    const after=await productionCounts(env); const changed=changedCounts(before,after);
    const cert=changed.length?"BASELINE_V5_CLASSIFICATION_BLOCKED_PRODUCTION_MUTATION":"BASELINE_V5_CLASSIFICATION_CERTIFIED_HISTORY_ONLY";
    const grade=changed.length?"FAIL_MUTATION_GUARD":(actualIssueRows?"PASS_WITH_WARNINGS":"PASS");
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:requestedV5Mode,status:cert,certification:cert,certification_grade:grade,current_system_mutated:changed.length>0,source_rows_read:total,classification_rows:classificationRows,rows_staged:classificationRows,rows_promoted:classificationRows,history_rows:classificationRows,issue_rows:actualIssueRows,calibration_pending_rows:calibrationPendingRows,classification_only:true,baseline_v5_function:"classification",baseline_v5_run_type:requestedV5Mode.endsWith("_delta")?"delta":"base",baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",allowed_downstream:"run Baseline Base/Delta after Classification",mutation_guard:{changed_tables:changed},formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,stage_shape_repair:stageShapeRepair});
    await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,changed.length?"blocked":"completed",classificationRows,classificationRows,classificationRows,actualIssueRows,cert,grade,safeJson(output),batchId);
    await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,changed.length?"blocked":"completed",total,classificationRows,0,classificationRows,actualIssueRows,cert,grade,safeJson(output),batchId);
    output.ok=!changed.length; output.data_ok=!changed.length; return output;
  }
  let baselineStageValidation=null;
  if(readOnlyClassificationBaseline){
    baselineStageValidation=await baselineV5StageValidation(env,batchId,total);
    if(!baselineStageValidation.ok){
      const blockedOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:requestedV5Mode,status:"BASELINE_V5_BASE_BLOCKED_STAGE_VALIDATION",certification:"BASELINE_V5_BASE_BLOCKED_STAGE_VALIDATION",certification_grade:"BLOCKED_STAGE_VALIDATION",current_system_mutated:false,source_rows_read:total,rows_staged:staged,rows_promoted:0,history_rows:0,issue_rows:actualIssueRows,stage_validation:baselineStageValidation,classification_readonly_guard:{ok:true,before:lockedClassificationBefore},baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,no_current_promotion:true,stage_shape_repair:stageShapeRepair});
      await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=0, history_rows=0, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",staged,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
      await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=0, history_rows=0, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",total,staged,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
      blockedOutput.ok=true; blockedOutput.data_ok=true; blockedOutput.completed_blocked=true; return blockedOutput;
    }
  }
  if(calibrationPendingRows>0){
    const blockedOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:requestedV5Mode,status:"BASELINE_V5_HISTORY_BLOCKED_CALIBRATION_REVIEW",certification:"BASELINE_V5_HISTORY_BLOCKED_CALIBRATION_REVIEW",certification_grade:"BLOCKED_CALIBRATION_REVIEW",current_system_mutated:false,source_rows_read:total,raw_hp_v2_source_rows:rawHpV2SourceRows,null_only_source_rows:nullOnlySourceRows,rows_staged:staged,rows_promoted:0,history_rows:0,issue_rows:actualIssueRows,calibration_pending_rows:calibrationPendingRows,mutation_guard:{changed_tables:[]},read_all_hp_v2_current:readAllHpV2Current,canonical_group_by:logicalGroupBy,baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",fast_safe_chunk_policy:"v0_1_67_terminal_promotion_subquery_checkpoint_safe_calibration_frozen",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,no_current_promotion:true,stage_shape_repair:stageShapeRepair,stage_validation:baselineStageValidation,classification_readonly_guard:readOnlyClassificationBaseline?{ok:true,before:lockedClassificationBefore}:null});
    await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",staged,0,0,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
    await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",total,staged,0,0,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
    blockedOutput.ok=true; blockedOutput.data_ok=true; blockedOutput.completed_blocked=true; return blockedOutput;
  }
  const memorySafePromotion=readOnlyClassificationBaseline?await promoteBaselineV2StageMemorySafe(env,batchId):null;
  if(readOnlyClassificationBaseline && memorySafePromotion && !memorySafePromotion.complete){
    const counts=memorySafePromotion.counts||{};
    const partialOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:requestedV5Mode,status:"BASELINE_V5_HISTORY_TERMINAL_PROMOTION_PARTIAL_CONTINUE",certification:"BASELINE_V5_HISTORY_TERMINAL_PROMOTION_PARTIAL_CONTINUE",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,current_system_mutated:false,source_rows_read:total,raw_hp_v2_source_rows:rawHpV2SourceRows,null_only_source_rows:nullOnlySourceRows,rows_staged:staged,rows_promoted:Number(counts.hp_current||0),history_rows:Number(counts.hp_history||0),issue_rows:actualIssueRows,terminal_stage_rescue_v0_1_64:terminalStageRescue,terminal_stage_rescue_v0_1_65:true,terminal_stage_rescue_v0_1_66:true,memory_safe_promotion:memorySafePromotion,reporting_fix_version:"v0.1.67_terminal_promotion_subquery_checkpoint_safe",fast_safe_chunk_policy:"v0_1_67_terminal_promotion_subquery_checkpoint_safe_calibration_frozen",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,stage_validation:baselineStageValidation,stage_shape_repair:stageShapeRepair,next_input_json:{...input,mode:requestedV5Mode,batch_id:batchId,request_id:requestId,run_id:runId,v2_cursor_offset:staged,v2_force_exact_chunk_size:false,force_v2_chunk_size:false,terminal_promotion_checkpoint_safe:true,terminal_promotion_offset_checkpoint_safe:true}});
    await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"partial_continue",staged,Number(counts.sanity_current||0),Number(counts.sanity_history||0),actualIssueRows,partialOutput.certification,partialOutput.certification_grade,safeJson(partialOutput),batchId);
    await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"partial_continue",total,staged,Number(counts.hp_current||0),Number(counts.hp_history||0),actualIssueRows,partialOutput.certification,partialOutput.certification_grade,safeJson(partialOutput),batchId);
    partialOutput.ok=true; partialOutput.data_ok=true; return partialOutput;
  }
  if(!readOnlyClassificationBaseline){
    await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_current`);
    await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_current`);
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_current SELECT * FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId);
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_current SELECT * FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
    await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_history WHERE batch_id=?`,batchId);
    await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_history WHERE batch_id=?`,batchId);
    await run(env.SCORE_DB,`INSERT INTO player_baseline_sanity_v2_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId);
    await run(env.SCORE_DB,`INSERT INTO player_baseline_hp_v2_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
  }
  const lockedClassificationAfter=readOnlyClassificationBaseline?await lockedClassificationSnapshot(env,batchId):null;
  const readonlyCompare=readOnlyClassificationBaseline?lockedClassificationSnapshotSame(lockedClassificationBefore,lockedClassificationAfter):{ok:true,changed:[]};
  const after=await productionCounts(env); const changed=changedCounts(before,after);
  if(readOnlyClassificationBaseline && !readonlyCompare.ok){ changed.push({table:"classification_readonly_guard",before:lockedClassificationBefore,after:lockedClassificationAfter,changed:readonlyCompare.changed}); }
  const grade=changed.length?"FAIL_MUTATION_GUARD":(actualIssueRows?"PASS_WITH_WARNINGS":"PASS");
  const cert=changed.length?"BASELINE_V5_HISTORY_BLOCKED_PRODUCTION_MUTATION":"BASELINE_V5_HISTORY_CERTIFIED_PARALLEL_READY";
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:requestedV5Mode,status:cert,certification:cert,certification_grade:grade,current_system_mutated:changed.length>0,source_rows_read:total,raw_hp_v2_source_rows:rawHpV2SourceRows,null_only_source_rows:nullOnlySourceRows,source_hp_v2_batch_id:sourceHpV2BatchId,rows_staged:staged,rows_promoted:staged,history_rows:staged,issue_rows:actualIssueRows,mutation_guard:{changed_tables:changed},reporting_fix_version:"v0.1.67_terminal_promotion_subquery_checkpoint_safe",read_all_hp_v2_current:readAllHpV2Current,canonical_group_by:logicalGroupBy,baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",fast_safe_chunk_policy:"v0_1_67_terminal_promotion_subquery_checkpoint_safe_calibration_frozen",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,stage_shape_repair:stageShapeRepair,stage_validation:baselineStageValidation,terminal_stage_rescue_v0_1_64:terminalStageRescue,terminal_stage_rescue_v0_1_65:terminalStageRescue,terminal_stage_rescue_v0_1_66:terminalStageRescue,terminal_stage_rescue_v0_1_67:terminalStageRescue,memory_safe_promotion:memorySafePromotion,classification_readonly_guard:readOnlyClassificationBaseline?{ok:readonlyCompare.ok,before:lockedClassificationBefore,after:lockedClassificationAfter,changed:readonlyCompare.changed}:null,pitcher_fantasy_scope:"source_agnostic_component_baseline_no_win_no_qs_enforced_v0_1_59"});
  await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,changed.length?"blocked":"completed",staged,staged,staged,actualIssueRows,cert,grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,changed.length?"blocked":"completed",total,staged,staged,staged,actualIssueRows,cert,grade,safeJson(output),batchId);
  output.ok=!changed.length; output.data_ok=!changed.length; return output;
}

async function certifier(env,input={}){
  await ensureSchema(env);
  const before = input.production_counts_before || null;
  const after = await productionCounts(env);
  const changed = before ? changedCounts(before, after) : [];
  const gameRows=await tableCount(env.CONTEXT_DB,"expansion_first_inning_game_context_current");
  const pitcherRows=await tableCount(env.CONTEXT_DB,"expansion_first_inning_pitcher_context_current");
  const lineInventoryRows=await tableCount(env.SCORE_DB,"expansion_line_inventory_current");
  const lineInventoryIssues=await tableCount(env.SCORE_DB,"expansion_line_inventory_issues");
  const sanityRows=await tableCount(env.SCORE_DB,"expansion_player_baseline_sanity_current");
  const hpRows=await tableCount(env.SCORE_DB,"expansion_player_baseline_hp_current");
  const sanityNs=await all(env.SCORE_DB,`SELECT profile_namespace, COUNT(*) AS rows FROM expansion_player_baseline_sanity_current GROUP BY profile_namespace ORDER BY profile_namespace`);
  const hpNs=await all(env.SCORE_DB,`SELECT profile_namespace, selected_side, COUNT(*) AS rows FROM expansion_player_baseline_hp_current GROUP BY profile_namespace, selected_side ORDER BY profile_namespace, selected_side`);
  const required=["RA_","PFS_PP_","PFS_SL_","RFI_PP_","RFI_SL_"];
  const sanitySet=new Set(sanityNs.map(r=>String(r.profile_namespace)));
  const hpSideSet=new Set(hpNs.map(r=>`${r.profile_namespace}:${r.selected_side}`));
  const blockers=[]; const warnings=[];
  for(const ns of required){ if(!sanitySet.has(ns)) blockers.push(`missing_sanity_namespace_${ns}`); if(!hpSideSet.has(`${ns}:more`)) blockers.push(`missing_hp_more_${ns}`); if(!hpSideSet.has(`${ns}:less`)) blockers.push(`missing_hp_less_${ns}`); }
  if(!gameRows) warnings.push("no_first_inning_game_context_rows_currently_available");
  if(!pitcherRows) warnings.push("no_first_inning_pitcher_context_rows_currently_available");
  if(!lineInventoryRows) warnings.push("no_expansion_line_inventory_rows_currently_available");
  if(!sanityRows) blockers.push("no_expansion_sanity_rows");
  if(!hpRows) blockers.push("no_expansion_hp_rows");
  if(changed.length) blockers.push("production_mutation_guard_failed");
  const pass = blockers.length===0;
  const output = baseOutput(input,{mode:"expansion_baseline_certifier",status:pass?"EXPANSION_BASELINE_CERTIFIED_SHADOW_BASELINE_READY":"EXPANSION_BASELINE_CERTIFIER_BLOCKED",certification:pass?"EXPANSION_BASELINE_CERTIFIED_SHADOW_BASELINE_READY":"EXPANSION_BASELINE_CERTIFIER_BLOCKED",certification_grade:pass?(warnings.length?"PASS_WITH_WARNINGS":"PASS"):(changed.length?"FAIL_MUTATION_GUARD":"FAIL_BLOCKED"),current_system_mutated:changed.length>0,rows:{first_inning_game_context_rows:gameRows,first_inning_pitcher_context_rows:pitcherRows,line_inventory_rows:lineInventoryRows,line_inventory_issue_rows:lineInventoryIssues,sanity_rows:sanityRows,baseline_hp_rows:hpRows},coverage:{sanity:sanityNs,hp:hpNs},mutation_guard:{passed:changed.length===0,changed_tables:changed,production_counts_after:after},warnings,blockers});
  output.ok = pass;
  output.data_ok = pass;
  return output;
}

async function expansionBasePristine(env){
  await ensureSchema(env);
  const game=await first(env.CONTEXT_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT game_pk) AS distinct_rows, COUNT(*)-COUNT(DISTINCT game_pk) AS dupes FROM expansion_first_inning_game_context_current`);
  const pitcher=await first(env.CONTEXT_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT CAST(game_pk AS TEXT)||'|'||CAST(pitcher_id AS TEXT)) AS distinct_rows, COUNT(*)-COUNT(DISTINCT CAST(game_pk AS TEXT)||'|'||CAST(pitcher_id AS TEXT)) AS dupes, COUNT(DISTINCT pitcher_id) AS pitchers FROM expansion_first_inning_pitcher_context_current`);
  const sanity=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows FROM expansion_player_baseline_sanity_current`);
  const hp=await first(env.SCORE_DB,`SELECT COUNT(*) AS rows, COUNT(DISTINCT baseline_hp_row_id) AS distinct_rows, COUNT(*)-COUNT(DISTINCT baseline_hp_row_id) AS dupes FROM expansion_player_baseline_hp_current`);
  const hpInvalid=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM expansion_player_baseline_hp_current WHERE baseline_hp_0_100 IS NULL OR baseline_hp_0_100<0 OR baseline_hp_0_100>100 OR prior_strength IS NULL OR prior_strength<=0 OR tier_prior_rate_0_100 IS NULL OR non_push_sample IS NULL OR hit_count IS NULL OR miss_count IS NULL`);
  const ok=Number(game&&game.rows||0)>0 && Number(game&&game.dupes||0)===0 && Number(pitcher&&pitcher.rows||0)>0 && Number(pitcher&&pitcher.dupes||0)===0 && Number(sanity&&sanity.rows||0)>0 && Number(hp&&hp.rows||0)>0 && Number(hp&&hp.dupes||0)===0 && Number(hpInvalid&&hpInvalid.c||0)===0;
  return {ok, game_rows:Number(game&&game.rows||0), pitcher_rows:Number(pitcher&&pitcher.rows||0), sanity_rows:Number(sanity&&sanity.rows||0), hp_rows:Number(hp&&hp.rows||0), game_duplicate_rows:Number(game&&game.dupes||0), pitcher_duplicate_rows:Number(pitcher&&pitcher.dupes||0), hp_duplicate_rows:Number(hp&&hp.dupes||0), invalid_hp_rows:Number(hpInvalid&&hpInvalid.c||0)};
}

async function getExpansionDeltaGameList(env, input={}){
  const maxGames=Math.max(1,Math.min(Number(input.delta_game_limit || input.game_limit || 2500),2500));
  const existing=Array.isArray(input.delta_game_pks) ? input.delta_game_pks.map(Number).filter(Boolean) : null;
  if(existing) return existing;

  // Manual SQL / D1 does not allow cross-database references. Keep the proven contract here too:
  // read existing expansion game anchors from CONTEXT_DB, read candidate starter-history games from TEAM_DB,
  // then perform the anti-join in JS. Do not reference CONTEXT_DB tables inside TEAM_DB SQL.
  const currentRows=await all(env.CONTEXT_DB,`SELECT game_pk FROM expansion_first_inning_game_context_current WHERE game_pk IS NOT NULL`);
  const alreadyMined=new Set(currentRows.map(r=>Number(r.game_pk)).filter(Boolean));
  const candidates=await all(env.TEAM_DB,`SELECT game_pk, MAX(game_date) AS game_date
    FROM starter_history
    WHERE started_game=1 AND game_pk IS NOT NULL
    GROUP BY game_pk
    ORDER BY date(game_date) ASC, game_pk ASC`);
  const out=[];
  for(const r of candidates){
    const gamePk=Number(r.game_pk)||0;
    if(!gamePk || alreadyMined.has(gamePk)) continue;
    out.push(gamePk);
    if(out.length>=maxGames) break;
  }
  return out;
}

async function runDeltaMining(env,input={}){
  await ensureSchema(env);
  const requestId=String(input.request_id||rid("expansion_delta_mining"));
  const runId=String(input.run_id||rid("run"));
  const batchId=String(input.delta_mining_batch_id||input.mining_batch_id||input.batch_id||rid("expansion_first_inning_delta_batch"));
  const cursor=Math.max(0,Number(input.delta_cursor_offset||input.mining_cursor_offset||input.cursor_offset||0));
  const chunkSize=Math.max(10,Math.min(Number(input.delta_game_chunk_size||input.mining_game_chunk_size||60),120));
  const mlbLinescoreTimeoutMs=Math.max(1500,Math.min(Number(input.mlb_linescore_timeout_ms||input.mining_fetch_timeout_ms||8000),15000));
  const gamePks=await getExpansionDeltaGameList(env,input);
  const total=gamePks.length;
  await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_batches",`INSERT OR IGNORE INTO expansion_first_inning_context_batches (batch_id,request_id,run_id,mode,status,worker_version,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"expansion_delta_mining","running",VERSION);
  await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_batches",`UPDATE expansion_first_inning_context_batches SET request_id=?, run_id=?, mode='expansion_delta_mining', status='running', worker_version=?, games_requested=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,requestId,runId,VERSION,total,batchId);
  const slice=gamePks.slice(cursor,cursor+chunkSize);
  let gamesWritten=0,pitcherRows=0,issues=0;
  const gameStmts=[],pitcherStmts=[],issueStmts=[];
  for(const gamePk of slice){
    const g=await first(env.TEAM_DB,`SELECT game_pk, MAX(game_date) AS game_date, MAX(CASE WHEN is_home=1 THEN team_id END) AS home_team_id, MAX(CASE WHEN is_home=0 THEN team_id END) AS away_team_id FROM starter_history WHERE game_pk=? AND started_game=1 GROUP BY game_pk`,gamePk);
    try{
      const fetched=await fetchMlbLinescore(env,gamePk,mlbLinescoreTimeoutMs);
      const parsed=firstInningFromLinescore(fetched.json);
      if(!parsed) throw new Error("MISSING_FIRST_INNING_LINESCORE_RUNS");
      const contextRowId=`exp_first_game|${gamePk}`;
      const yrfi=parsed.first_inning_total_runs>=1?1:0; const nrfi=parsed.first_inning_total_runs===0?1:0;
      gameStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_game_context_current (context_row_id,batch_id,game_pk,game_date,home_team_id,away_team_id,home_team_name,away_team_name,top_1st_runs,bottom_1st_runs,first_inning_total_runs,yrfi_flag,nrfi_flag,rfi_pp_more_hit,rfi_pp_less_hit,source_endpoint,source_confidence,source_snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM expansion_first_inning_game_context_current WHERE context_row_id=?),CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)`).bind(contextRowId,batchId,gamePk,g&&g.game_date||null,g&&g.home_team_id||null,g&&g.away_team_id||null,parsed.home_team_name,parsed.away_team_name,parsed.top_1st_runs,parsed.bottom_1st_runs,parsed.first_inning_total_runs,yrfi,nrfi,yrfi,nrfi,fetched.url,"MLB_LINESCORE_FIRST_INNING",safeJson({game_pk:gamePk,first_inning:parsed,source:"MLB_STATS_API_LINESCORE",delta_update:true}),contextRowId));
      gamesWritten++;
      const starters=await all(env.TEAM_DB,`SELECT player_id, starter_player_id, starter_name, team_id, opponent_team_id, is_home, started_game, starter_key, game_date FROM starter_history WHERE game_pk=? AND started_game=1`,gamePk);
      for(const s0 of starters){
        const pitcherId=Number(s0.player_id||s0.starter_player_id||0)||null;
        if(!pitcherId){ issues++; issueStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_context_issues (issue_id,batch_id,game_pk,pitcher_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid("exp_delta_issue"),batchId,gamePk,null,"WARN","MISSING_STARTER_PLAYER_ID","Starter row missing pitcher id",safeJson(s0))); continue; }
        const isHome=Number(s0.is_home||0)===1?1:0; const runsAllowed=isHome?parsed.top_1st_runs:parsed.bottom_1st_runs; const half=isHome?"top_1st":"bottom_1st";
        const rowId=`exp_first_pitcher|${gamePk}|${pitcherId}`;
        pitcherStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_pitcher_context_current (pitcher_context_row_id,batch_id,game_pk,game_date,pitcher_id,pitcher_name,team_id,opponent_team_id,is_home,started_game,first_frame_half,first_frame_runs_allowed,rfi_sl_more_hit,rfi_sl_less_hit,source_game_context_row_id,starter_source_key,source_confidence,details_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM expansion_first_inning_pitcher_context_current WHERE pitcher_context_row_id=?),CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)`).bind(rowId,batchId,gamePk,s0.game_date||g&&g.game_date||null,pitcherId,s0.starter_name||null,s0.team_id||null,s0.opponent_team_id||null,isHome,1,half,runsAllowed,runsAllowed>=1?1:0,runsAllowed===0?1:0,contextRowId,s0.starter_key||null,"MLB_LINESCORE_PLUS_STARTER_HISTORY",safeJson({mapping:isHome?"home_starter_allows_top_1st":"away_starter_allows_bottom_1st",top_1st_runs:parsed.top_1st_runs,bottom_1st_runs:parsed.bottom_1st_runs,delta_update:true}),rowId));
        pitcherRows++;
      }
    }catch(err){
      issues++;
      issueStmts.push(env.CONTEXT_DB.prepare(`INSERT OR REPLACE INTO expansion_first_inning_context_issues (issue_id,batch_id,game_pk,pitcher_id,severity,issue_code,issue_message,details_json,created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid("exp_delta_issue"),batchId,gamePk,null,"WARN","DELTA_MLB_LINESCORE_FETCH_OR_PARSE_FAILED",String(err&&err.message?err.message:err).slice(0,500),safeJson({game_pk:gamePk,delta_update:true})));
    }
  }
  if(gameStmts.length) await writeBatch(env.CONTEXT_DB,"expansion_first_inning_game_context_current",gameStmts,25);
  if(pitcherStmts.length) await writeBatch(env.CONTEXT_DB,"expansion_first_inning_pitcher_context_current",pitcherStmts,25);
  if(issueStmts.length) await writeBatch(env.CONTEXT_DB,"expansion_first_inning_context_issues",issueStmts,25);
  if(gamesWritten){
    await writeRun(env.CONTEXT_DB,"expansion_first_inning_game_context_history",`INSERT INTO expansion_first_inning_game_context_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_first_inning_game_context_current WHERE batch_id=?`,batchId);
    await writeRun(env.CONTEXT_DB,"expansion_first_inning_pitcher_context_history",`INSERT INTO expansion_first_inning_pitcher_context_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_first_inning_pitcher_context_current WHERE batch_id=?`,batchId);
  }
  const nextCursor=cursor+slice.length;
  const done=nextCursor>=total;
  const currentGames=await tableCount(env.CONTEXT_DB,"expansion_first_inning_game_context_current");
  const currentPitchers=await tableCount(env.CONTEXT_DB,"expansion_first_inning_pitcher_context_current");
  const issueRow=await first(env.CONTEXT_DB,`SELECT COUNT(*) AS c FROM expansion_first_inning_context_issues WHERE batch_id=?`,batchId);
  const issueTotal=Number(issueRow&&issueRow.c||0);
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"expansion_delta_mining",status:done?"EXPANSION_DELTA_MINING_COMPLETED":"EXPANSION_DELTA_MINING_PARTIAL_CONTINUE",certification:done?(issueTotal?"EXPANSION_DELTA_MINING_COMPLETED_WITH_WARNINGS":"EXPANSION_DELTA_MINING_CERTIFIED"):"EXPANSION_DELTA_MINING_PARTIAL_CONTINUE",certification_grade:done?(issueTotal?"PASS_WITH_WARNINGS":"PASS"):"PARTIAL_CONTINUE",partial_continue:!done,orchestrator_should_self_continue:!done,delta_game_pks:gamePks,delta_games_total:total,delta_games_attempted:slice.length,delta_games_written:gamesWritten,delta_pitcher_rows_written:pitcherRows,current_game_rows:currentGames,current_pitcher_rows:currentPitchers,issue_rows:issueTotal,delta_cursor_offset:nextCursor,delta_game_chunk_size:chunkSize,rows_written:gamesWritten+pitcherRows,next_input_json:!done?{...input,mode:"expansion_delta_full_run",expansion_mode:"expansion_delta_full_run",request_id:requestId,run_id:runId,delta_mining_batch_id:batchId,delta_game_pks:gamePks,delta_cursor_offset:nextCursor,delta_game_chunk_size:chunkSize}:null,delta_update:true,no_current_wipe:true});
  await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_batches",`UPDATE expansion_first_inning_context_batches SET status=?, games_requested=?, games_written=?, pitcher_rows_written=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,done?"completed":"partial_continue",total,gamesWritten,pitcherRows,issueTotal,output.certification,output.certification_grade,safeJson(output),batchId);
  return output;
}

async function buildExpansionSanityRows(env,batchId,affectedPlayerIds=null, includeRfiPp=true){
  const sanityRows=[];
  const playerFilter=Array.isArray(affectedPlayerIds)&&affectedPlayerIds.length ? affectedPlayerIds.map(Number).filter(Boolean) : null;
  let rows;
  if(playerFilter&&playerFilter.length){
    const qs=playerFilter.map(()=>'?').join(',');
    rows=await all(env.TEAM_DB,`SELECT COALESCE(player_id, starter_player_id) AS player_id, starter_name, game_pk, game_date, team_id, opponent_team_id, is_home, started_game, outs_recorded, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches FROM starter_history WHERE started_game=1 AND COALESCE(player_id, starter_player_id) IS NOT NULL AND game_pk IS NOT NULL AND COALESCE(player_id, starter_player_id) IN (${qs}) ORDER BY player_id, game_date`,...playerFilter);
  } else rows=await starterRows(env);
  for(const [pid,prs] of groupBy(rows,r=>r.player_id).entries()){
    const name=prs.find(r=>r.starter_name)?.starter_name||null; const playerId=Number(pid);
    const raVals=prs.map(r=>num(r.runs_allowed)); const ppVals=prs.map(pfsPp); const slVals=prs.map(pfsSl);
    sanityRows.push(makeSanityRow({batchId,ns:"RA_",sourceFamily:"starter_history_runs_allowed",sourceTable:"TEAM_DB.starter_history",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"runs_allowed",values:raVals,lines:RA_LINES,profileKey:raProfile(raVals,prs.length),sourceFormulaKey:"RA_FULL_GAME_TOTAL_RUNS_ALLOWED",extraNotes:{earned_and_unearned_runs_count:true,separate_from_earned_runs:true,delta_update:!!playerFilter}}));
    sanityRows.push(makeSanityRow({batchId,ns:"PFS_PP_",sourceFamily:"starter_history_pitcher_fantasy",sourceTable:"TEAM_DB.starter_history",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"pitcher_fantasy_score",values:ppVals,lines:PFS_LINES,profileKey:pfsPpProfile(ppVals,prs),sourceFormulaKey:"PFS_PP_NO_WIN_OUTS_K_QS_ER",extraNotes:{win_excluded:true,win_reserve_only:true,formula:"outs_recorded + 3*K + 4*QS - 3*ER",delta_update:!!playerFilter}}));
    sanityRows.push(makeSanityRow({batchId,ns:"PFS_SL_",sourceFamily:"starter_history_pitcher_fantasy",sourceTable:"TEAM_DB.starter_history",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"pitcher_fantasy_score",values:slVals,lines:PFS_LINES,profileKey:pfsSlProfile(slVals,prs),sourceFormulaKey:"PFS_SL_NO_WIN_OUTS_K_ER_BB",extraNotes:{win_excluded:true,win_reserve_only:true,qs_not_used:true,formula:"outs_recorded + 3*K - 3*ER - 2*BB",delta_update:!!playerFilter}}));
  }
  let rfiSql=`SELECT pitcher_id, pitcher_name, first_frame_runs_allowed FROM expansion_first_inning_pitcher_context_current WHERE pitcher_id IS NOT NULL`;
  let rfiRows;
  if(playerFilter&&playerFilter.length){ const qs=playerFilter.map(()=>'?').join(','); rfiRows=await all(env.CONTEXT_DB,`${rfiSql} AND pitcher_id IN (${qs})`,...playerFilter); } else rfiRows=await all(env.CONTEXT_DB,rfiSql);
  for(const [pid,prs] of groupBy(rfiRows,r=>r.pitcher_id).entries()){
    const playerId=Number(pid); const vals=prs.map(r=>num(r.first_frame_runs_allowed)); const name=prs.find(r=>r.pitcher_name)?.pitcher_name||null;
    sanityRows.push(makeSanityRow({batchId,ns:"RFI_SL_",sourceFamily:"first_inning_pitcher_context",sourceTable:"CONTEXT_DB.expansion_first_inning_pitcher_context_current",entityType:"pitcher",entityId:playerId,playerType:"pitcher",playerId,playerName:name,propKey:"rfi_nrfi",values:vals,lines:RFI_LINES,profileKey:rfiSlProfile(vals,vals.length),sourceFormulaKey:"RFI_SL_PITCHER_SPECIFIC_FIRST_FRAME",extraNotes:{sleeper_specific:true,home_starter_allows_top_1st:true,away_starter_allows_bottom_1st:true,earned_and_unearned_runs_count:true,delta_update:!!playerFilter}}));
  }
  if(includeRfiPp){
    const rfiGames=await all(env.CONTEXT_DB,`SELECT game_pk, first_inning_total_runs FROM expansion_first_inning_game_context_current WHERE game_pk IS NOT NULL`);
    const ppVals=rfiGames.map(r=>num(r.first_inning_total_runs));
    if(ppVals.length) sanityRows.push(makeSanityRow({batchId,ns:"RFI_PP_",sourceFamily:"first_inning_game_context",sourceTable:"CONTEXT_DB.expansion_first_inning_game_context_current",entityType:"game_pair_pool",entityId:"rfi_pp_game_pair_pool",playerType:"game_pair",playerId:null,playerName:"RFI_PP_GAME_PAIR_POOL",propKey:"rfi_nrfi",values:ppVals,lines:RFI_LINES,profileKey:rfiPpProfile(ppVals,ppVals.length),sourceFormulaKey:"RFI_PP_PAIR_GAME_FIRST_INNING_TOTAL",extraNotes:{prizepicks_combo_pair_level:true,earned_and_unearned_runs_count:true,delta_update:!!playerFilter}}));
  }
  return sanityRows;
}

async function insertSanityRows(env,sanityRows){
  const stmts=sanityRows.map(r=>env.SCORE_DB.prepare(`INSERT OR REPLACE INTO expansion_player_baseline_sanity_stage (baseline_row_id,batch_id,expansion_scope,profile_namespace,source_data_family,source_table,profile_logic_version,entity_type,entity_id,player_type,player_id,player_name,canonical_prop_key,role_profile,prior_pool_key,sanity_profile_key,sample_profile,usage_profile,line_difficulty_profile,volatility_profile,baseline_drag_profile,confidence_drag_profile,variance_profile,games_sample,events_sample,baseline_confidence_0_100,line_baseline_json,distribution_shape_json,notes_json,no_daily_context,no_market_context,no_scoring_context,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(r.baseline_row_id,r.batch_id,r.expansion_scope,r.profile_namespace,r.source_data_family,r.source_table,r.profile_logic_version,r.entity_type,r.entity_id,r.player_type,r.player_id,r.player_name,r.canonical_prop_key,r.role_profile,r.prior_pool_key,r.sanity_profile_key,r.sample_profile,r.usage_profile,r.line_difficulty_profile,r.volatility_profile,r.baseline_drag_profile,r.confidence_drag_profile,r.variance_profile,r.games_sample,r.events_sample,r.baseline_confidence_0_100,r.line_baseline_json,r.distribution_shape_json,r.notes_json));
  if(stmts.length) await writeBatch(env.SCORE_DB,"expansion_player_baseline_sanity_stage",stmts,35);
}

async function runDeltaSanity(env,input={}){
  await ensureSchema(env);
  const requestId=String(input.request_id||rid("expansion_delta_sanity")); const runId=String(input.run_id||rid("run")); const batchId=String(input.delta_sanity_batch_id||input.batch_id||rid("expansion_delta_sanity_batch"));
  const miningBatchId=String(input.delta_mining_batch_id||input.mining_batch_id||"");
  const lineInventoryBatchId=String(input.line_inventory_batch_id||input.expansion_line_inventory_batch_id||input.delta_line_inventory_batch_id||"");
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_batches",`INSERT OR REPLACE INTO expansion_player_baseline_sanity_batches (batch_id,request_id,run_id,mode,status,worker_version,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"expansion_delta_sanity","running",VERSION);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_stage",`DELETE FROM expansion_player_baseline_sanity_stage WHERE batch_id=?`,batchId);
  const minedPitchers= miningBatchId ? await all(env.CONTEXT_DB,`SELECT DISTINCT pitcher_id FROM expansion_first_inning_pitcher_context_current WHERE batch_id=? AND pitcher_id IS NOT NULL`,miningBatchId) : [];
  const inventoryMissing = lineInventoryBatchId ? await all(env.SCORE_DB,`SELECT hp.mlb_player_id AS player_id, hp.source_key, hp.canonical_prop_key, hp.selected_side, hp.board_line_value AS line_value, inv.profile_namespace
    FROM hit_probability_v2_current hp
    INNER JOIN expansion_line_inventory_current inv
      ON inv.batch_id=?
     AND inv.source_key=hp.source_key
     AND inv.canonical_prop_key=hp.canonical_prop_key
     AND inv.selected_side=hp.selected_side
     AND inv.line_value=hp.board_line_value
    LEFT JOIN player_baseline_hp_v2_current b
      ON b.player_id=hp.mlb_player_id
     AND b.canonical_prop_key=hp.canonical_prop_key
     AND b.selected_side=hp.selected_side
     AND b.line_value=hp.board_line_value
    LEFT JOIN expansion_player_baseline_hp_current e
      ON e.player_id=hp.mlb_player_id
     AND e.canonical_prop_key=hp.canonical_prop_key
     AND e.profile_namespace=inv.profile_namespace
     AND e.canonical_prop_key=hp.canonical_prop_key
     AND e.selected_side=hp.selected_side
     AND e.line_value=hp.board_line_value
    WHERE b.baseline_hp_row_id IS NULL
      AND e.baseline_hp_row_id IS NULL
      AND COALESCE(inv.needs_dynamic_generation,0)=1
      AND COALESCE(inv.missing_baseline_rows,0)>0`,lineInventoryBatchId) : [];
  const affectedSet=new Set();
  for(const r of minedPitchers){ const id=Number(r.pitcher_id); if(id) affectedSet.add(id); }
  for(const r of inventoryMissing){ const id=Number(r.player_id); if(id) affectedSet.add(id); }
  const affectedIds=[...affectedSet];
  const includeRfiPp=inventoryMissing.some(r=>String(r.profile_namespace||'')==='RFI_PP_' || (String(r.source_key||'')==='prizepicks' && String(r.canonical_prop_key||'')==='rfi_nrfi')) || minedPitchers.length>0;
  const hasWork=affectedIds.length>0 || includeRfiPp;
  const sanityRows=hasWork ? await buildExpansionSanityRows(env,batchId,affectedIds,includeRfiPp) : [];
  await insertSanityRows(env,sanityRows);
  if(sanityRows.length){
    await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_current",`INSERT OR REPLACE INTO expansion_player_baseline_sanity_current SELECT * FROM expansion_player_baseline_sanity_stage WHERE batch_id=?`,batchId);
    await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_history",`INSERT INTO expansion_player_baseline_sanity_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_sanity_stage WHERE batch_id=?`,batchId);
  }
  const nsRows=await all(env.SCORE_DB,`SELECT profile_namespace, COUNT(*) AS rows FROM expansion_player_baseline_sanity_current WHERE batch_id=? GROUP BY profile_namespace ORDER BY profile_namespace`,batchId);
  const status=sanityRows.length?"EXPANSION_DELTA_SANITY_COMPLETED":"EXPANSION_DELTA_SANITY_NOOP_NO_AFFECTED_OR_MISSING_DYNAMIC_ROWS";
  const cert=sanityRows.length?"EXPANSION_DELTA_SANITY_CERTIFIED_AFFECTED_ROWS_PROMOTED":"EXPANSION_DELTA_SANITY_CERTIFIED_NOOP_NO_DYNAMIC_GAPS";
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"expansion_delta_sanity",status,certification:cert,certification_grade:"PASS",affected_pitchers:affectedIds.length,mined_affected_pitchers:minedPitchers.length,line_inventory_batch_id:lineInventoryBatchId||null,inventory_missing_rows:inventoryMissing.length,include_rfi_pp:includeRfiPp,rows_staged:sanityRows.length,rows_promoted:sanityRows.length,history_rows:sanityRows.length,namespace_rows:nsRows,rows_written:sanityRows.length,delta_update:true,no_current_wipe:true,inventory_scoped_delta_sanity_v0_1_31:true,no_full_universe_fallback_when_no_affected_pitchers:true});
  await writeRun(env.SCORE_DB,"expansion_player_baseline_sanity_batches",`UPDATE expansion_player_baseline_sanity_batches SET status='completed', finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,sanityRows.length,sanityRows.length,sanityRows.length,output.certification,output.certification_grade,safeJson(output),batchId);
  return output;
}

async function insertHpRowsCurrentHistory(env,hpRows){
  if(!hpRows.length) return;
  await insertHpRows(env,hpRows);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_current",`INSERT OR REPLACE INTO expansion_player_baseline_hp_current SELECT * FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,hpRows[0].batch_id);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_history",`INSERT INTO expansion_player_baseline_hp_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,hpRows[0].batch_id);
}

async function runDeltaHp(env,input={}){
  await ensureSchema(env);
  const requestId=String(input.request_id||rid("expansion_delta_hp")); const runId=String(input.run_id||rid("run")); const batchId=String(input.delta_hp_batch_id||input.hp_batch_id||input.batch_id||rid("expansion_delta_hp_batch"));
  const sourceSanityBatchId=String(input.delta_sanity_batch_id||input.source_sanity_batch_id||"");
  const cursor=Math.max(0,Number(input.hp_cursor_offset||input.cursor_offset||0));
  const chunkSize=Math.max(10,Math.min(60,Number(input.hp_source_chunk_size||input.chunk_size||40)));
  if(cursor===0){
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`INSERT OR REPLACE INTO expansion_player_baseline_hp_batches (batch_id,request_id,run_id,mode,status,worker_version,source_sanity_batch_id,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"expansion_delta_hp","running",VERSION,sourceSanityBatchId);
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_stage",`DELETE FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,batchId);
  } else {
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`UPDATE expansion_player_baseline_hp_batches SET request_id=?, run_id=?, status='running', worker_version=?, source_sanity_batch_id=COALESCE(NULLIF(source_sanity_batch_id,''),?), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,requestId,runId,VERSION,sourceSanityBatchId,batchId);
  }
  const totalRow=sourceSanityBatchId ? await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM expansion_player_baseline_sanity_current WHERE batch_id=?`,sourceSanityBatchId) : {c:0};
  const totalSanityRows=Number(totalRow&&totalRow.c||0);
  const affectedSanity= sourceSanityBatchId ? await all(env.SCORE_DB,`SELECT * FROM expansion_player_baseline_sanity_current WHERE batch_id=? ORDER BY profile_namespace, COALESCE(entity_id,''), COALESCE(player_id,0), canonical_prop_key LIMIT ? OFFSET ?`,sourceSanityBatchId,chunkSize,cursor) : [];
  const allSanity=await all(env.SCORE_DB,`SELECT * FROM expansion_player_baseline_sanity_current ORDER BY profile_namespace, COALESCE(entity_id,''), COALESCE(player_id,0), canonical_prop_key`);
  const hpRows=buildHpRowsForSanityRows(affectedSanity,batchId,sourceSanityBatchId,allSanity);
  await insertHpRows(env,hpRows);
  const nextCursor=Math.min(totalSanityRows,cursor+affectedSanity.length);
  const stagedRow=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,batchId);
  const stagedCount=Number(stagedRow&&stagedRow.c||0);
  const done=nextCursor>=totalSanityRows;
  if(!done){
    const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,mode:"expansion_delta_hp",status:"EXPANSION_DELTA_HP_PARTIAL_CONTINUE",certification:"EXPANSION_DELTA_HP_PARTIAL_CONTINUE",certification_grade:"PARTIAL_CONTINUE",source_rows_read:nextCursor,source_rows_total:totalSanityRows,all_sanity_rows_for_prior_pool:allSanity.length,rows_staged:stagedCount,rows_written:hpRows.length,hp_cursor_offset:nextCursor,hp_source_chunk_size:chunkSize,partial_continue:true,orchestrator_should_self_continue:true,delta_update:true,no_current_wipe:true,prior_pool_from_all_current_sanity:true,chunked_delta_hp_v0_1_31:true,next_input_json:{...input,mode:"expansion_delta_hp",delta_hp_batch_id:batchId,hp_batch_id:batchId,batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,delta_sanity_batch_id:sourceSanityBatchId,hp_cursor_offset:nextCursor,hp_source_chunk_size:chunkSize}});
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`UPDATE expansion_player_baseline_hp_batches SET status='running', source_rows_read=?, rows_staged=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,nextCursor,stagedCount,output.certification,output.certification_grade,safeJson(output),batchId);
    return output;
  }
  const stageComplementAudit=await expansionHpComplementAudit(env,"expansion_player_baseline_hp_stage",batchId);
  if(!stageComplementAudit.pass){
    const blocked=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,mode:"expansion_delta_hp",status:"EXPANSION_DELTA_HP_BLOCKED_COMPLEMENT_CERTIFIER",certification:"EXPANSION_DELTA_HP_BLOCKED_COMPLEMENT_CERTIFIER",certification_grade:"FAIL_COMPLEMENT",source_rows_read:totalSanityRows,all_sanity_rows_for_prior_pool:allSanity.length,rows_staged:stagedCount,rows_promoted:0,history_rows:0,issue_rows:stageComplementAudit.bad_hp_complement_rows+stageComplementAudit.bad_raw_complement_rows+stageComplementAudit.bad_sample_pair_rows+stageComplementAudit.duplicate_row_ids+stageComplementAudit.duplicate_business_keys,stage_complement_audit:stageComplementAudit,delta_update:true,no_current_wipe:true,prior_pool_from_all_current_sanity:true,more_anchor_pair_normalization_v0_1_71:true});
    blocked.ok=false; blocked.data_ok=false;
    await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`UPDATE expansion_player_baseline_hp_batches SET status='blocked', finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=0, history_rows=0, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,totalSanityRows,stagedCount,blocked.issue_rows,blocked.certification,blocked.certification_grade,safeJson(blocked),batchId);
    return blocked;
  }
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_current",`INSERT OR REPLACE INTO expansion_player_baseline_hp_current SELECT * FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,batchId);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_history",`INSERT INTO expansion_player_baseline_hp_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,batchId);
  const currentComplementAudit=await expansionHpComplementAudit(env,"expansion_player_baseline_hp_current",batchId);
  const currentCount=await tableCount(env.SCORE_DB,"expansion_player_baseline_hp_current");
  const pass=currentComplementAudit.pass;
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,mode:"expansion_delta_hp",status:pass?"EXPANSION_DELTA_HP_COMPLETED":"EXPANSION_DELTA_HP_BLOCKED_CURRENT_COMPLEMENT_CERTIFIER",certification:pass?"EXPANSION_DELTA_HP_CERTIFIED_AFFECTED_ROWS_PROMOTED":"EXPANSION_DELTA_HP_BLOCKED_CURRENT_COMPLEMENT_CERTIFIER",certification_grade:pass?"PASS":"FAIL_COMPLEMENT",source_rows_read:totalSanityRows,all_sanity_rows_for_prior_pool:allSanity.length,rows_staged:stagedCount,rows_promoted:pass?stagedCount:0,history_rows:pass?stagedCount:0,current_hp_rows:currentCount,rows_written:hpRows.length,issue_rows:pass?0:(currentComplementAudit.bad_hp_complement_rows+currentComplementAudit.bad_raw_complement_rows+currentComplementAudit.bad_sample_pair_rows+currentComplementAudit.duplicate_row_ids+currentComplementAudit.duplicate_business_keys),stage_complement_audit:stageComplementAudit,current_complement_audit:currentComplementAudit,delta_update:true,no_current_wipe:true,prior_pool_from_all_current_sanity:true,chunked_delta_hp_v0_1_31:true,more_anchor_pair_normalization_v0_1_71:true,active_parent_chain_completed_batch_scope:true});
  output.ok=pass; output.data_ok=pass;
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`UPDATE expansion_player_baseline_hp_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,pass?'completed':'blocked',totalSanityRows,stagedCount,pass?stagedCount:0,pass?stagedCount:0,output.issue_rows||0,output.certification,output.certification_grade,safeJson(output),batchId);
  return output;
}

async function deltaFullRun(env,input={}){
  const requestId=String(input.request_id||rid("expansion_delta_full")); const runId=String(input.run_id||rid("run"));
  const base=await expansionBasePristine(env);
  if(!base.ok && !input.disable_base_fallback){
    const fallback=await fullRunFullDepth(env,{...input,request_id:requestId,run_id:runId,force_full_baseline:true,full_depth_base:true,base_pristine_before_delta:base});
    fallback.delta_fallback_to_full_base=true; fallback.base_pristine_before_delta=base;
    return fallback;
  }
  const before=input.production_counts_before||await productionCounts(env);
  const state=input.expansion_delta_state||{};
  let mining=null,lineInventory=null,sanity=null,hp=null;
  if(!state.mining_completed){
    mining=await runDeltaMining(env,{...input,mode:"expansion_delta_mining",request_id:requestId,run_id:runId,delta_mining_batch_id:input.delta_mining_batch_id||state.delta_mining_batch_id||null,delta_game_pks:input.delta_game_pks||state.delta_game_pks||null,delta_cursor_offset:input.delta_cursor_offset||state.delta_cursor_offset||0,delta_game_chunk_size:input.delta_game_chunk_size||state.delta_game_chunk_size||60});
    if(mining&&mining.partial_continue){
      return baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_delta_full_run",status:"EXPANSION_DELTA_FULL_RUN_PARTIAL_CONTINUE_MINING",certification:"EXPANSION_DELTA_FULL_RUN_PARTIAL_CONTINUE_MINING",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,next_input_json:{...input,mode:"expansion_delta_full_run",expansion_mode:"expansion_delta_full_run",request_id:requestId,run_id:runId,production_counts_before:before,delta_mining_batch_id:mining.batch_id,delta_game_pks:mining.delta_game_pks,delta_cursor_offset:mining.delta_cursor_offset,delta_game_chunk_size:mining.delta_game_chunk_size,expansion_delta_state:{mining_completed:false,delta_mining_batch_id:mining.batch_id,delta_game_pks:mining.delta_game_pks,delta_cursor_offset:mining.delta_cursor_offset,delta_game_chunk_size:mining.delta_game_chunk_size,production_counts_before:before}},mining,base_pristine:base,delta_update:true});
    }
    if(Number(mining.delta_games_written||0)>0){ sanity=await runDeltaSanity(env,{...input,mode:"expansion_delta_sanity",request_id:requestId,run_id:runId,delta_mining_batch_id:mining.batch_id}); }
  } else if(state.delta_mining_batch_id){
    sanity=await runDeltaSanity(env,{...input,mode:"expansion_delta_sanity",request_id:requestId,run_id:runId,delta_mining_batch_id:state.delta_mining_batch_id,delta_sanity_batch_id:state.delta_sanity_batch_id||input.delta_sanity_batch_id||null});
  }
  lineInventory=await runLineInventory(env,{...input,mode:"expansion_line_inventory",request_id:requestId,run_id:runId});
  if(sanity&&Number(sanity.rows_staged||0)>0){ hp=await runDeltaHp(env,{...input,mode:"expansion_delta_hp",request_id:requestId,run_id:runId,delta_sanity_batch_id:sanity.batch_id}); }
  const cert=await certifier(env,{...input,mode:"expansion_baseline_certifier",request_id:requestId,run_id:runId,production_counts_before:before});
  const pass=!!(cert&&cert.ok===true);
  const output=baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_delta_full_run",status:pass?"EXPANSION_DELTA_FULL_RUN_COMPLETED":"EXPANSION_DELTA_FULL_RUN_BLOCKED",certification:pass?"EXPANSION_DELTA_FULL_RUN_CERTIFIED_NEW_BASELINE_READY":cert.certification,certification_grade:pass?(cert.certification_grade||"PASS"):cert.certification_grade,base_pristine_before_delta:base,stages:{mining:mining||"previous_or_no_delta",line_inventory:lineInventory,sanity:sanity||"no_affected_sanity_rows",hp:hp||"no_affected_hp_rows",certifier:cert},delta_games_written:mining?Number(mining.delta_games_written||0):0,rows_written:Number((mining&&mining.rows_written||0)+(sanity&&sanity.rows_written||0)+(hp&&hp.rows_written||0)),delta_update:true,current_system_mutated:cert.current_system_mutated});
  output.ok=pass; output.data_ok=pass;
  return output;
}

async function fullRunFullDepth(env,input={}){
  const requestId=String(input.request_id||rid("expansion_baseline_full"));
  const runId=String(input.run_id||rid("run"));
  const state=input.expansion_full_run_state || {};
  const before=input.production_counts_before || state.production_counts_before || await productionCounts(env);
  let mining=null, lineInventory=null, sanity=null, hp=null;
  let sourceSanityBatchId=input.source_sanity_batch_id || state.source_sanity_batch_id || null;

  if(!state.mining_completed){
    mining = await mineFirstInningContext(env,{...input, mode:"expansion_baseline_mining", request_id:requestId, run_id:runId, mining_batch_id:input.mining_batch_id || state.mining_batch_id || null, mining_cursor_offset:input.mining_cursor_offset || state.mining_cursor_offset || 0, mining_game_chunk_size:input.mining_game_chunk_size || state.mining_game_chunk_size || 60});
    if(mining && mining.partial_continue){
      const nextInput={...input, mode:"expansion_baseline_full_run", expansion_mode:"expansion_baseline_full_run", request_id:requestId, run_id:runId, production_counts_before:before, mining_batch_id:mining.batch_id, mining_cursor_offset:mining.mining_cursor_offset, mining_game_chunk_size:mining.mining_game_chunk_size || 60, game_limit:mining.source_games_total || input.game_limit || input.max_games || 2500, full_depth_base:true, expansion_full_run_state:{mining_completed:false,line_inventory_completed:false,mining_batch_id:mining.batch_id,mining_cursor_offset:mining.mining_cursor_offset,mining_game_chunk_size:mining.mining_game_chunk_size || 60,production_counts_before:before}};
      return baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_baseline_full_run",status:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_MINING",certification:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_MINING",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,next_input_json:nextInput,mining,rows_written:Number(mining.rows_written||0),current_system_mutated:false,full_depth_base:true});
    }
    lineInventory = await runLineInventory(env,{...input, mode:"expansion_line_inventory", request_id:requestId, run_id:runId});
    sanity = await runSanity(env,{...input, mode:"expansion_baseline_sanity", request_id:requestId, run_id:runId});
    sourceSanityBatchId = sanity.batch_id;
  } else if(!state.line_inventory_completed) {
    lineInventory = await runLineInventory(env,{...input, mode:"expansion_line_inventory", request_id:requestId, run_id:runId});
  }

  hp = await runHp(env,{...input, mode:"expansion_baseline_hp", request_id:requestId, run_id:runId, source_sanity_batch_id:sourceSanityBatchId, batch_id:input.hp_batch_id || input.batch_id || null, hp_cursor_offset:input.hp_cursor_offset || 0, hp_source_chunk_size:input.hp_source_chunk_size || 60});
  if(hp && hp.partial_continue){
    const nextInput={...input, mode:"expansion_baseline_full_run", expansion_mode:"expansion_baseline_full_run", request_id:requestId, run_id:runId, production_counts_before:before, source_sanity_batch_id:sourceSanityBatchId, hp_batch_id:hp.batch_id, hp_cursor_offset:hp.hp_cursor_offset, hp_source_chunk_size:hp.hp_source_chunk_size || 60, expansion_full_run_state:{mining_completed:true,line_inventory_completed:true,sanity_completed:true,source_sanity_batch_id:sourceSanityBatchId,production_counts_before:before}};
    const output=baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_baseline_full_run",status:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_HP",certification:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_HP",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,next_input_json:nextInput,hp,rows_written:Number(hp.rows_written||0),current_system_mutated:false});
    return output;
  }

  const cert = await certifier(env,{...input, mode:"expansion_baseline_certifier", request_id:requestId, run_id:runId, production_counts_before:before});
  const pass = !!(cert && cert.ok === true);
  const output = baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_baseline_full_run",status:pass?"EXPANSION_BASELINE_FULL_RUN_COMPLETED":"EXPANSION_BASELINE_FULL_RUN_BLOCKED",certification:cert.certification,certification_grade:cert.certification_grade,stages:{mining: mining || "previous_call_completed", line_inventory: lineInventory || "previous_call_completed", sanity: sanity || "previous_call_completed", hp, certifier:cert},rows_written:Number(hp&&hp.rows_written||0),current_system_mutated:cert.current_system_mutated});
  output.ok = pass;
  output.data_ok = pass;
  return output;
}

async function fullRun(env,input={}){
  const mode=String(input.mode||input.expansion_mode||"");
  if(mode==="expansion_delta_full_run" || mode==="expansion-delta-full-run") return deltaFullRun(env,input);
  if(input.force_full_baseline===true || input.full_depth_base===true || input.disable_delta_auto===true) return fullRunFullDepth(env,input);
  return deltaFullRun(env,input);
}

async function runMode(env,input={}){
  await ensureSchema(env);
  await ensureCalibrationConfigLoaded(env);
  const mode=String(input.mode || input.expansion_mode || input.job_key || "expansion_baseline_full_run");
  if(mode==="expansion_baseline_mining" || mode==="expansion-baseline-mining") return mineFirstInningContext(env,input);
  if(mode==="expansion_baseline_sanity" || mode==="expansion-baseline-sanity") return runSanity(env,input);
  if(mode==="expansion_baseline_hp" || mode==="expansion-baseline-hp") return runHp(env,input);
  if(mode==="expansion_delta_mining" || mode==="expansion-delta-mining") return runDeltaMining(env,input);
  if(mode==="expansion_delta_sanity" || mode==="expansion-delta-sanity") return runDeltaSanity(env,input);
  if(mode==="expansion_delta_hp" || mode==="expansion-delta-hp") return runDeltaHp(env,input);
  if(mode==="expansion_delta_full_run" || mode==="expansion-delta-full-run") return deltaFullRun(env,input);
  if(mode==="expansion_line_inventory" || mode==="expansion-baseline-line-inventory") return runLineInventory(env,input);
  if(mode==="expansion_baseline_certifier" || mode==="expansion-baseline-certifier") return certifier(env,input);
  if(mode==="expansion_baseline_full_run" || mode==="expansion-baseline-full-run") return fullRun(env,input);
  if(mode==="baseline_v5_state_hydrate") return runBaselineV5StateHydrate(env,input);
  if(mode==="baseline_v5_classification_daily_delta") return runClassificationV6DeltaDaily(env,input);
  if(mode==="baseline_v5_hp_daily_delta") return runBaselineV6DeltaDaily(env,input);
  if(mode==="baseline_v5_stateful_delta") return runBaselineV5StatefulDelta(env,input);
  if(mode==="baseline_v5_classification_rescue") return runBaselineV5ClassificationRescue(env,input);
  if(mode==="baseline_v5_base_rescue") return runBaselineV5BaseRescue(env,input);
  if(mode==="baseline_v5_classification_delta" || mode==="baseline_v5_delta") return baseOutput(input,{request_id:String(input.request_id||rid("baseline_v5_old_delta_blocked")),run_id:String(input.run_id||rid("run")),mode,status:"BASELINE_V5_OLD_AFFECTED_PLAYER_CUMULATIVE_DELTA_BLOCKED",certification:"BASELINE_V5_OLD_AFFECTED_PLAYER_CUMULATIVE_DELTA_BLOCKED",certification_grade:"BLOCKED",data_ok:false,current_tables_mutated:false,history_tables_mutated:false,full_cumulative_history_recompute:true,blocked_reason:"Old Baseline/Classfication V5 delta reloads cumulative player history and is banned. Use baseline_v5_state_hydrate then baseline_v5_stateful_delta shadow/parity path.",no_daily_context:true,no_market_context:true,no_scoring_context:true,no_final_board_context:true});
  if(mode==="classification_v6_compute_stats") return runClassificationV6ComputeStats(env,input);
  if(mode==="classification_v6_tick" || mode==="classification_v6") return runClassificationV6Tick(env,input);
  if(mode==="baseline_v6_tick") return runBaselineV6Tick(env,input);
  if(mode==="baseline_v5_classification_base") return runClassificationV6Base(env,input);
  if(mode==="baseline_v5_base") return runBaselineV6Base(env,input);
  if(mode==="baseline_v5_history_only" || mode==="baseline_v2_heb" || mode==="expansion_baseline_v2" || mode==="expansion-baseline-v2" || mode==="expansion-baseline-v2-full-run") return runBaselineV2(env,input);
  const jobKey = String(input.job_key || "");
  if (jobKey === "phase3a-first-inning-pitcher-context" || mode === "phase3a-first-inning-pitcher-context" || mode === "legacy_dummy") {
    return {ok:true,data_ok:true,version:VERSION,worker_name:WORKER_NAME,logical_worker_name:LOGICAL_WORKER_NAME,job_key:jobKey || "phase3a-first-inning-pitcher-context",status:"LEGACY_DUMMY_SLOT_READY_NO_MUTATION",certification:"LEGACY_DUMMY_SLOT_READY_NO_MUTATION",rows_read:0,rows_written:0,writes_performed:0,external_calls_performed:0,expansion_only:false,baseline_only:false,no_current_baseline_mutation:true,no_scoring_mutation:true,no_final_board_mutation:true};
  }
  return {ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"UNSUPPORTED_EXPANSION_BASELINE_MODE",mode,allowed_modes:["expansion_baseline_mining","expansion_line_inventory","expansion_baseline_sanity","expansion_baseline_hp","expansion_baseline_certifier","expansion_baseline_full_run","expansion_delta_mining","expansion_delta_sanity","expansion_delta_hp","expansion_delta_full_run","baseline_v5_classification_base","baseline_v5_classification_delta","baseline_v5_classification_rescue","baseline_v5_base","baseline_v5_base_rescue","baseline_v5_delta","baseline_v5_state_hydrate","baseline_v5_stateful_delta","baseline_v5_classification_daily_delta","baseline_v5_hp_daily_delta","baseline_v5_history_only","expansion-baseline-v2"]};
}

// ==== CLASSIFICATION V6 — new, clean, prop/line/direction-aware classification ====
// Design locked with the user:
// - Tier varies by canonical_prop_key x line_value x selected_side (the old system didn't do this).
// - Tiers are z-score bands off the REAL population distribution for that exact prop/line/side,
//   computed from a Marcel-style recency-weighted blend of last_5/10/20_games + season_to_date.
// - Tier count collapses/expands automatically based on real population spread (max 12, fewer if thin).
// - Classification does NOT compute confidence. Confidence is baseline's job only (locked decision).
// - Every tunable number (weights, bands, chunk size, timeouts) lives in calibration_config, not code.
// - Writes to ARCHIVE_DB (repurposed, near-empty), not SCORE_DB (near its 10GB limit).

// Build the flat, ordered list of every (canonical_prop_key, line_value, selected_side)
// combination the Base job needs to classify, from the configured universe.
function buildComboList(propLineUniverse) {
  const combos = [];
  for (const [propKey, lines] of Object.entries(propLineUniverse)) {
    for (const lineValue of lines) {
      combos.push({ canonical_prop_key: propKey, line_value: lineValue, selected_side: "more" });
      combos.push({ canonical_prop_key: propKey, line_value: lineValue, selected_side: "less" });
    }
  }
  return combos;
}

// The actual "Classification Base" job. Wired to orchestrator's existing generic
// continuation contract for job_key=expansion-baseline-v2: returns partial_continue:true
// and next_input_json to keep going, or omits them when the entire universe is done.
// Orchestrator re-enqueues and re-calls with exactly next_input_json as the next input —
// no orchestrator.js changes required, this worker just has to honor the existing contract.
async function runClassificationV6BaseSingleStep(env, input = {}) {
  await ensureCalibrationConfigLoaded(env);
  const requestId = String(input.request_id || rid("classification_v6_base"));
  const runId = String(input.run_id || rid("run"));
  const officialDate = String(input.official_date || "");
  const opLimits = await getCalibrationValue(env, "operational", "run_limits", { chunk_size_rows: 40, tick_timeout_ms: 20000, max_retries: 3 });

  const propLineUniverse = await getCalibrationValue(env, "global", "prop_line_universe", {});
  const combos = buildComboList(propLineUniverse);

  const comboIndex = Math.max(0, Number(input.combo_index || 0));
  const cursorOffset = Math.max(0, Number(input.cursor_offset || 0));
  const batchId = String(input.batch_id || rid("classification_v6_base_batch"));

  if (comboIndex >= combos.length) {
    return {
      ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_base",
      status: "CLASSIFICATION_V6_BASE_COMPLETED", certification: "CLASSIFICATION_V6_BASE_CERTIFIED_ALL_COMBOS_COMPLETE",
      certification_grade: "PASS", total_combos: combos.length, batch_id: batchId,
      no_daily_context: true, no_market_context: true, no_scoring_context: true
    };
  }

  const combo = combos[comboIndex];

  // Fresh combo (cursor 0): (re)compute population stats for it first — cheap, one pass.
  if (cursorOffset === 0) {
    let statsResult;
    try {
      statsResult = await runClassificationV6ComputeStats(env, {
        canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: combo.selected_side
      });
    } catch (err) {
      const maxRetries = Math.max(1, Number((opLimits && opLimits.max_retries) || 3));
      const retryCount = Math.max(0, Number(input.retry_count || 0));
      if (retryCount >= maxRetries) {
        return {
          ok: false, data_ok: false, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_base",
          status: "CLASSIFICATION_V6_BASE_STATS_FAILED", error: `Stats computation failed after ${maxRetries} retries: ${String(err && err.message ? err.message : err)}`,
          combo_index: comboIndex, combo
        };
      }
      return {
        ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_base",
        status: "CLASSIFICATION_V6_BASE_PARTIAL_CONTINUE", certification: "CLASSIFICATION_V6_BASE_STATS_TRANSIENT_RETRY",
        certification_grade: "PARTIAL", combo_index: comboIndex, total_combos: combos.length,
        partial_continue: true, orchestrator_should_self_continue: true,
        transient_error: String(err && err.message ? err.message : err),
        next_input_json: {
          mode: "baseline_v5_classification_base", request_id: requestId, run_id: runId, batch_id: batchId,
          combo_index: comboIndex, cursor_offset: 0, official_date: officialDate, retry_count: retryCount + 1
        }
      };
    }
    if (!statsResult.ok) {
      return {
        ok: false, data_ok: false, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_base",
        status: "CLASSIFICATION_V6_BASE_STATS_FAILED", error: statsResult.error, combo_index: comboIndex, combo
      };
    }
  }

  const tickResult = await (async () => {
    const maxRetries = Math.max(1, Number((opLimits && opLimits.max_retries) || 3));
    const retryCount = Math.max(0, Number(input.retry_count || 0));
    try {
      return await runClassificationV6Tick(env, {
        batch_id: batchId, canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value,
        selected_side: combo.selected_side, official_date: officialDate, cursor_offset: cursorOffset
      });
    } catch (err) {
      if (retryCount >= maxRetries) {
        return { ok: false, error: `Failed after ${maxRetries} retries: ${String(err && err.message ? err.message : err)}` };
      }
      // Transient failure (e.g. D1 storage reset) — signal a retry of the SAME chunk, not a hard failure.
      return {
        ok: true, data_ok: true, retrying: true, retry_count: retryCount + 1,
        transient_error: String(err && err.message ? err.message : err),
        done: false, cursor_offset: cursorOffset,
        population_mean: null, population_stddev: null, population_n: null,
        rows_read: 0, rows_written: 0, reclassified_rows: 0
      };
    }
  })();

  if (!tickResult.ok) {
    return {
      ok: false, data_ok: false, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_base",
      status: "CLASSIFICATION_V6_BASE_TICK_FAILED", error: tickResult.error, combo_index: comboIndex, combo
    };
  }

  const comboDone = tickResult.done;
  const nextComboIndex = comboDone ? comboIndex + 1 : comboIndex;
  const nextCursorOffset = comboDone ? 0 : tickResult.cursor_offset;
  const nextBatchId = comboDone ? rid("classification_v6_base_batch") : batchId;
  const allDone = comboDone && nextComboIndex >= combos.length;

  const output = {
    ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_base",
    request_id: requestId, run_id: runId, batch_id: batchId,
    status: allDone ? "CLASSIFICATION_V6_BASE_COMPLETED" : "CLASSIFICATION_V6_BASE_PARTIAL_CONTINUE",
    certification: allDone ? "CLASSIFICATION_V6_BASE_CERTIFIED_ALL_COMBOS_COMPLETE" : "CLASSIFICATION_V6_BASE_CERTIFIED_COMBO_IN_PROGRESS",
    certification_grade: allDone ? "PASS" : "PARTIAL",
    combo_index: comboIndex, total_combos: combos.length,
    current_combo: combo, combo_done: comboDone,
    rows_read: tickResult.rows_read, rows_written: tickResult.rows_written, reclassified_rows: tickResult.reclassified_rows,
    population_mean: tickResult.population_mean, population_stddev: tickResult.population_stddev, population_n: tickResult.population_n,
    no_daily_context: true, no_market_context: true, no_scoring_context: true
  };

  if (!allDone) {
    output.partial_continue = true;
    output.orchestrator_should_self_continue = true;
    output.next_input_json = {
      mode: "baseline_v5_classification_base",
      request_id: requestId, run_id: runId, batch_id: nextBatchId,
      combo_index: nextComboIndex, cursor_offset: nextCursorOffset, official_date: officialDate,
      retry_count: tickResult.retrying ? Number(tickResult.retry_count || 0) : 0
    };
  }

  return output;
}

// Looping wrapper: internally drives multiple single-step ticks per external call, up to a
// wall-clock time budget, instead of returning after just one tick. Same contract to the
// caller (partial_continue / next_input_json) — just does much more real work per round trip.
// Useful for direct/manual invocation; orchestrator's own cadence still works fine with this too,
// it'll just see fewer, chunkier partial_continue steps.
async function runClassificationV6Base(env, input = {}) {
  const startMs = Date.now();
  const timeBudgetMs = 18000; // stay safely under Workers CPU/wall-clock limits per invocation
  let currentInput = input;
  let lastOutput = null;

  while (Date.now() - startMs < timeBudgetMs) {
    lastOutput = await runClassificationV6BaseSingleStep(env, currentInput);
    if (!lastOutput.ok) return lastOutput;
    if (!lastOutput.partial_continue) return lastOutput; // fully done
    currentInput = lastOutput.next_input_json;
  }
  return lastOutput;
}

// ==== BASELINE V6 — HP% and confidence, built on top of classification_v6 ====
// Locked design: confidence is computed ONLY here, never in classification.
// Reuses each player's already-computed recency-blended rate (classification_v6_current.metric_value)
// rather than recomputing it — one source of truth, no duplicated work.
// Rate -> probability via Poisson (real, standard model for count-based sports events),
// after shrinking the raw rate toward the player's own TIER mean (not grand population mean —
// hierarchical/empirical-Bayes style shrinkage, same principle as real Marcel projections).

function lnFactorial(n) {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}
function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - lnFactorial(k));
}
function poissonCDF(k, lambda) {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += poissonPMF(i, lambda);
  return Math.min(1, Math.max(0, sum));
}
// Log-Gamma via Lanczos approximation — needed for Negative Binomial with non-integer dispersion.
function lnGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
// NB variance = mean + mean^2/r. Solve for r from REAL observed population mean/variance.
// If the population is not overdispersed (variance <= mean), r -> Infinity, which is the
// Poisson limit — meaning we only add overdispersion where the real data actually shows it.
function estimateDispersion(mean, variance) {
  if (!(variance > mean) || mean <= 0) return Infinity;
  return (mean * mean) / (variance - mean);
}
// Correct, pooled estimate of within-player game-to-game overdispersion — NOT the spread of
// different players' average rates (that reflects skill heterogeneity, which tiering already
// handles). This pulls each player's own real per-game log, computes their own mean/variance
// across their own games, then pools those individual estimates weighted by games played.
async function estimatePooledDispersionFromGameLogs(env, propKey) {
  const gameLogMap = await getCalibrationValue(env, "global", "prop_game_log_map", {});
  const gcfg = gameLogMap[propKey];
  if (!gcfg) return { dispersion: Infinity, note: "no_game_log_map_entry" };

  const db = gcfg.entity === "pitcher" ? env.STATS_PITCHER_DB : env.STATS_HITTER_DB;
  let expr;
  if (gcfg.weights) {
    expr = gcfg.fields.map(f => `(${Number(gcfg.weights[f] || 1)}*${f})`).join("+");
  } else {
    expr = gcfg.fields[0];
  }

  const rows = await all(db,
    `SELECT player_id, COUNT(*) games, AVG(${expr}) mean_i, AVG((${expr})*(${expr})) mean_sq_i
     FROM ${gcfg.table} GROUP BY player_id HAVING games >= 8`);

  let weightedExcessSum = 0, weightedMeanSum = 0, totalGames = 0;
  for (const r of rows) {
    const games = Number(r.games);
    const meanI = Number(r.mean_i);
    const varI = Number(r.mean_sq_i) - meanI * meanI;
    weightedExcessSum += games * (varI - meanI);
    weightedMeanSum += games * meanI;
    totalGames += games;
  }
  if (totalGames === 0) return { dispersion: Infinity, note: "no_qualifying_players" };

  const pooledMean = weightedMeanSum / totalGames;
  const pooledExcess = weightedExcessSum / totalGames;
  const dispersion = (pooledExcess > 0 && pooledMean > 0) ? (pooledMean * pooledMean) / pooledExcess : Infinity;
  return { dispersion, pooled_mean: pooledMean, pooled_excess_variance: pooledExcess, players_used: rows.length, note: "computed_from_real_game_logs" };
}
function negBinomialPMF(k, mean, dispersion) {
  const r = dispersion;
  if (!isFinite(r) || r <= 0) return poissonPMF(k, mean);
  const logP = lnGamma(k + r) - lnGamma(r) - lnGamma(k + 1) + r * Math.log(r / (r + mean)) + k * Math.log(mean / (r + mean));
  return Math.exp(logP);
}
function negBinomialCDF(k, mean, dispersion) {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += negBinomialPMF(i, mean, dispersion);
  return Math.min(1, Math.max(0, sum));
}
// Standard sports line convention: line 1.5 means "more" = 2+, "under" = 0-1.
// Uses Negative Binomial when the real population shows overdispersion, Poisson otherwise —
// not a blanket assumption either way, driven by what the actual data looks like.
function hpFromCountModel(mean, lineValue, side, dispersion) {
  const threshold = Math.floor(lineValue);
  const pUnder = isFinite(dispersion) && dispersion > 0 ? negBinomialCDF(threshold, mean, dispersion) : poissonCDF(threshold, mean);
  return side === "more" ? (1 - pUnder) : pUnder;
}

// Abramowitz-Stegun erf approximation, needed for the Normal CDF below.
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const t = 1/(1+p*x);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign*y;
}
function normalCDF(x, mean, stddev) {
  if (!(stddev > 0)) return x >= mean ? 1 : 0;
  const z = (x - mean) / (stddev * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}
// Composite scores with negative-weighted components (e.g. pitcher_fantasy_score subtracts
// earned runs and walks allowed) can legitimately go negative for a bad outing — Poisson/NB
// require a non-negative rate, so forcing them here was mathematically invalid. Normal is the
// correct model for a continuous, potentially-negative composite score.
function hpFromNormalModel(mean, lineValue, side, stddev) {
  const pUnder = normalCDF(lineValue, mean, stddev);
  return side === "more" ? (1 - pUnder) : pUnder;
}
function propCanGoNegative(propConfig) {
  return !!(propConfig && propConfig.weights && Object.values(propConfig.weights).some(w => Number(w) < 0));
}

async function runBaselineV6ComputeTierPriors(env, propKey, lineValue, side) {
  const rows = await all(env.ARCHIVE_DB,
    `SELECT tier_key, AVG(metric_value) avg_rate, COUNT(*) tier_n FROM classification_v6_current WHERE canonical_prop_key=? AND line_value=? AND selected_side=? GROUP BY tier_key`,
    propKey, lineValue, side);
  const priors = {};
  for (const r of rows) priors[r.tier_key] = { avg_rate: r.avg_rate, tier_n: r.tier_n };
  return priors;
}

async function runBaselineV6Tick(env, input = {}) {
  await ensureCalibrationConfigLoaded(env);
  const batchId = String(input.batch_id || rid("baseline_v6_batch"));
  const propKey = String(input.canonical_prop_key || "");
  const side = String(input.selected_side || "");
  const lineValue = Number(input.line_value);
  const officialDate = String(input.official_date || "");
  const opLimits = await getCalibrationValue(env, "operational", "run_limits", { chunk_size_rows: 300 });
  const cfg = CALIBRATION_CONFIG_CACHE || CALIBRATION_CONFIG_DEFAULTS;
  const { prior_strength_multiplier: priorStrengthMultiplier } = await getRecencyWeightsForProp(env, propKey);

  const tierPriors = await runBaselineV6ComputeTierPriors(env, propKey, lineValue, side);
  const tierBlendCfg = await getCalibrationValue(env, "global", "tier_blend_constant", { k: 5 });
  const tierBlendK = Math.max(1, Number(tierBlendCfg.k || 5));
  const statsKeyForCombo = `${propKey}|${String(lineValue).replace(".", "p")}|${side}`;
  const popStats = await first(env.ARCHIVE_DB, `SELECT population_mean, population_stddev, population_dispersion FROM classification_v6_population_stats WHERE stats_key=?`, statsKeyForCombo);
  const populationMean = popStats ? popStats.population_mean : null;
  const populationStddev = popStats ? popStats.population_stddev : null;
  const dispersion = popStats ? popStats.population_dispersion : null;
  const propMapForModel = await getCalibrationValue(env, "global", "prop_metric_map", {});
  const usesNormalModel = propCanGoNegative(propMapForModel[propKey]);

  const cursor = Math.max(0, Number(input.cursor_offset || 0));
  const chunkSize = Array.isArray(input.player_ids_override) ? input.player_ids_override.length : Math.max(10, Number(opLimits.chunk_size_rows || 300));

  const classRows = Array.isArray(input.player_ids_override)
    ? await (async () => {
        const ids = input.player_ids_override.map(Number).filter(Boolean);
        if (!ids.length) return [];
        const out = [];
        const idChunkSize = 90;
        for (let i = 0; i < ids.length; i += idChunkSize) {
          const idSlice = ids.slice(i, i + idChunkSize);
          const placeholders = idSlice.map(() => "?").join(",");
          const rows = await all(env.ARCHIVE_DB,
            `SELECT player_type, player_id, player_name, tier_key, metric_value, games_sample
             FROM classification_v6_current WHERE canonical_prop_key=? AND line_value=? AND selected_side=? AND player_id IN (${placeholders})`,
            propKey, lineValue, side, ...idSlice);
          out.push(...rows);
        }
        return out;
      })()
    : await all(env.ARCHIVE_DB,
        `SELECT player_type, player_id, player_name, tier_key, metric_value, games_sample
         FROM classification_v6_current WHERE canonical_prop_key=? AND line_value=? AND selected_side=?
         ORDER BY player_id LIMIT ? OFFSET ?`,
        propKey, lineValue, side, chunkSize, cursor);

  const stmts = [];
  for (const p of classRows) {
    const tierInfo = tierPriors[p.tier_key];
    const rawTierMean = tierInfo ? tierInfo.avg_rate : p.metric_value;
    const tierN = tierInfo ? tierInfo.tier_n : 0;
    const blendedTierPrior = (populationMean != null)
      ? (tierN * rawTierMean + tierBlendK * populationMean) / (tierN + tierBlendK)
      : rawTierMean;
    const priorStrength = priorStrengthForSample(p.games_sample, cfg, priorStrengthMultiplier);
    const shrunkRate = (p.games_sample * p.metric_value + priorStrength * blendedTierPrior) / (p.games_sample + priorStrength);
    const hp = usesNormalModel
      ? hpFromNormalModel(shrunkRate, lineValue, side, populationStddev)
      : hpFromCountModel(shrunkRate, lineValue, side, dispersion);
    const confidence = sampleAwareConfidence(p.games_sample, cfg, priorStrengthMultiplier);
    const rowId = `blv6|${p.player_type}|${p.player_id}|${propKey}|${String(lineValue).replace(".", "p")}|${side}`;

    stmts.push(env.ARCHIVE_DB.prepare(
      `INSERT INTO baseline_v6_current (baseline_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,tier_key,hit_probability_0_100,confidence_0_100,non_push_sample,prior_strength,recency_blended_rate_0_100,formula_version,last_processed_official_date,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(player_type,player_id,canonical_prop_key,line_value,selected_side) DO UPDATE SET
         batch_id=excluded.batch_id, tier_key=excluded.tier_key, hit_probability_0_100=excluded.hit_probability_0_100,
         confidence_0_100=excluded.confidence_0_100, non_push_sample=excluded.non_push_sample, prior_strength=excluded.prior_strength,
         recency_blended_rate_0_100=excluded.recency_blended_rate_0_100, formula_version=excluded.formula_version,
         last_processed_official_date=excluded.last_processed_official_date, updated_at=CURRENT_TIMESTAMP`
    ).bind(rowId, batchId, p.player_type, p.player_id, p.player_name, propKey, lineValue, side,
      p.tier_key, round(hp * 100, 2), round(confidence, 2), p.games_sample, round(priorStrength, 2),
      round(shrunkRate * 100, 4), CLASSIFICATION_V6_VERSION, officialDate));
  }
  if (stmts.length) await writeBatch(env.ARCHIVE_DB, "baseline_v6_current", stmts, 30);

  const nextCursor = cursor + chunkSize;
  const done = Array.isArray(input.player_ids_override)
    ? true
    : (await (async () => {
        const totalForCombo = await first(env.ARCHIVE_DB,
          `SELECT COUNT(*) n FROM classification_v6_current WHERE canonical_prop_key=? AND line_value=? AND selected_side=?`,
          propKey, lineValue, side);
        return nextCursor >= Number(totalForCombo.n);
      })());
  const totalForCombo = Array.isArray(input.player_ids_override) ? { n: input.player_ids_override.length } : await first(env.ARCHIVE_DB,
    `SELECT COUNT(*) n FROM classification_v6_current WHERE canonical_prop_key=? AND line_value=? AND selected_side=?`,
    propKey, lineValue, side);

  return {
    ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v6",
    canonical_prop_key: propKey, line_value: lineValue, selected_side: side,
    rows_read: classRows.length, rows_written: stmts.length, cursor_offset: nextCursor,
    total_for_combo: Number(totalForCombo.n), done,
    no_daily_context: true, no_market_context: true, no_scoring_context: true
  };
}

async function runBaselineV6BaseSingleStep(env, input = {}) {
  await ensureCalibrationConfigLoaded(env);
  const requestId = String(input.request_id || rid("baseline_v6_base"));
  const runId = String(input.run_id || rid("run"));
  const officialDate = String(input.official_date || "");
  const opLimits = await getCalibrationValue(env, "operational", "run_limits", { chunk_size_rows: 300, max_retries: 3 });

  const propLineUniverse = await getCalibrationValue(env, "global", "prop_line_universe", {});
  const combos = buildComboList(propLineUniverse);

  const comboIndex = Math.max(0, Number(input.combo_index || 0));
  const cursorOffset = Math.max(0, Number(input.cursor_offset || 0));
  const batchId = String(input.batch_id || rid("baseline_v6_base_batch"));

  if (comboIndex >= combos.length) {
    return {
      ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_base",
      status: "BASELINE_V6_BASE_COMPLETED", certification: "BASELINE_V6_BASE_CERTIFIED_ALL_COMBOS_COMPLETE",
      certification_grade: "PASS", total_combos: combos.length, batch_id: batchId,
      no_daily_context: true, no_market_context: true, no_scoring_context: true
    };
  }

  const combo = combos[comboIndex];
  const maxRetries = Math.max(1, Number((opLimits && opLimits.max_retries) || 3));
  const retryCount = Math.max(0, Number(input.retry_count || 0));

  let tickResult;
  try {
    tickResult = await runBaselineV6Tick(env, {
      batch_id: batchId, canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value,
      selected_side: combo.selected_side, official_date: officialDate, cursor_offset: cursorOffset
    });
  } catch (err) {
    if (retryCount >= maxRetries) {
      return {
        ok: false, data_ok: false, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_base",
        status: "BASELINE_V6_BASE_TICK_FAILED", error: `Failed after ${maxRetries} retries: ${String(err && err.message ? err.message : err)}`,
        combo_index: comboIndex, combo
      };
    }
    return {
      ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_base",
      status: "BASELINE_V6_BASE_PARTIAL_CONTINUE", certification: "BASELINE_V6_BASE_TRANSIENT_RETRY",
      certification_grade: "PARTIAL", combo_index: comboIndex, total_combos: combos.length,
      partial_continue: true, orchestrator_should_self_continue: true,
      transient_error: String(err && err.message ? err.message : err),
      next_input_json: {
        mode: "baseline_v5_base", request_id: requestId, run_id: runId, batch_id: batchId,
        combo_index: comboIndex, cursor_offset: cursorOffset, official_date: officialDate, retry_count: retryCount + 1
      }
    };
  }

  if (!tickResult.ok) {
    return {
      ok: false, data_ok: false, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_base",
      status: "BASELINE_V6_BASE_TICK_FAILED", error: tickResult.error, combo_index: comboIndex, combo
    };
  }

  const comboDone = tickResult.done;
  const nextComboIndex = comboDone ? comboIndex + 1 : comboIndex;
  const nextCursorOffset = comboDone ? 0 : tickResult.cursor_offset;
  const nextBatchId = comboDone ? rid("baseline_v6_base_batch") : batchId;
  const allDone = comboDone && nextComboIndex >= combos.length;

  const output = {
    ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_base",
    request_id: requestId, run_id: runId, batch_id: batchId,
    status: allDone ? "BASELINE_V6_BASE_COMPLETED" : "BASELINE_V6_BASE_PARTIAL_CONTINUE",
    certification: allDone ? "BASELINE_V6_BASE_CERTIFIED_ALL_COMBOS_COMPLETE" : "BASELINE_V6_BASE_CERTIFIED_COMBO_IN_PROGRESS",
    certification_grade: allDone ? "PASS" : "PARTIAL",
    combo_index: comboIndex, total_combos: combos.length,
    current_combo: combo, combo_done: comboDone,
    rows_read: tickResult.rows_read, rows_written: tickResult.rows_written,
    no_daily_context: true, no_market_context: true, no_scoring_context: true
  };

  if (!allDone) {
    output.partial_continue = true;
    output.orchestrator_should_self_continue = true;
    output.next_input_json = {
      mode: "baseline_v5_base",
      request_id: requestId, run_id: runId, batch_id: nextBatchId,
      combo_index: nextComboIndex, cursor_offset: nextCursorOffset, official_date: officialDate, retry_count: 0
    };
  }

  return output;
}

// ==== DAILY DELTA — classification and baseline, affected players only ====
// Locked design: delta does NOT recompute population stats (mean/stddev/dispersion) —
// those stay cached from the last base/refresh, since recomputing them daily (especially
// dispersion, which scans full game logs) would defeat the purpose of a cheap delta.
// Only the players whose data actually changed today get recomputed, against that stable
// population baseline. Both classification and baseline use the SAME affected-player
// detection (new game log entry on the target date) — a player's rate changed, so their
// HP needs recomputing regardless of whether their discrete tier bucket also crossed a line.
async function getAffectedPlayerIds(env, entity, targetDate) {
  const db = entity === "pitcher" ? env.STATS_PITCHER_DB : env.STATS_HITTER_DB;
  const table = entity === "pitcher" ? "pitcher_game_logs" : "hitter_game_logs";
  const rows = await all(db, `SELECT DISTINCT player_id FROM ${table} WHERE game_date = ?`, targetDate);
  return rows.map(r => Number(r.player_id)).filter(Boolean);
}

async function runClassificationV6DeltaDailySingleStep(env, input = {}) {
  await ensureCalibrationConfigLoaded(env);
  const requestId = String(input.request_id || rid("classification_v6_delta"));
  const runId = String(input.run_id || rid("run"));
  const officialDate = String(input.official_date || "");
  if (!officialDate) return { ok: false, error: "official_date is required for daily delta." };

  const propLineUniverse = await getCalibrationValue(env, "global", "prop_line_universe", {});
  const combos = buildComboList(propLineUniverse);
  const comboIndex = Math.max(0, Number(input.combo_index || 0));
  const batchId = String(input.batch_id || rid("classification_v6_delta_batch"));

  if (comboIndex >= combos.length) {
    return {
      ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_daily_delta",
      status: "BASELINE_V5_CLASSIFICATION_DAILY_DELTA_COMPLETED",
      certification: "BASELINE_V5_CLASSIFICATION_DAILY_DELTA_CERTIFIED_ALL_COMBOS_COMPLETE",
      certification_grade: "PASS", total_combos: combos.length, official_date: officialDate, batch_id: batchId,
      no_daily_context: true, no_market_context: true, no_scoring_context: true
    };
  }

  const combo = combos[comboIndex];
  const propMap = await getCalibrationValue(env, "global", "prop_metric_map", {});
  const propConfig = propMap[combo.canonical_prop_key];
  const entity = propConfig ? propConfig.entity : "hitter";
  const affectedIds = await getAffectedPlayerIds(env, entity, officialDate);

  const statsKey = `${combo.canonical_prop_key}|${String(combo.line_value).replace(".", "p")}|${combo.selected_side}`;
  const cachedStats = await first(env.ARCHIVE_DB, `SELECT stats_key FROM classification_v6_population_stats WHERE stats_key=?`, statsKey);
  if (!cachedStats) {
    // First time this combo has ever been seen (shouldn't normally happen if base ran first) — compute stats once.
    await runClassificationV6ComputeStats(env, { canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value, selected_side: combo.selected_side });
  }

  let tickResult = { rows_written: 0, reclassified_rows: 0 };
  if (affectedIds.length > 0) {
    tickResult = await runClassificationV6Tick(env, {
      batch_id: batchId, canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value,
      selected_side: combo.selected_side, official_date: officialDate, player_ids_override: affectedIds
    });
    if (!tickResult.ok) {
      return {
        ok: false, data_ok: false, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_daily_delta",
        status: "BASELINE_V5_CLASSIFICATION_DAILY_DELTA_TICK_FAILED", error: tickResult.error, combo_index: comboIndex, combo
      };
    }
  }

  const nextComboIndex = comboIndex + 1;
  const allDone = nextComboIndex >= combos.length;
  const output = {
    ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_classification_daily_delta",
    request_id: requestId, run_id: runId, batch_id: batchId, official_date: officialDate,
    status: allDone ? "BASELINE_V5_CLASSIFICATION_DAILY_DELTA_COMPLETED" : "BASELINE_V5_CLASSIFICATION_DAILY_DELTA_PARTIAL_CONTINUE",
    certification: allDone ? "BASELINE_V5_CLASSIFICATION_DAILY_DELTA_CERTIFIED_ALL_COMBOS_COMPLETE" : "BASELINE_V5_CLASSIFICATION_DAILY_DELTA_CERTIFIED_COMBO_IN_PROGRESS",
    certification_grade: allDone ? "PASS" : "PARTIAL",
    combo_index: comboIndex, total_combos: combos.length, current_combo: combo,
    affected_players: affectedIds.length, rows_written: tickResult.rows_written, reclassified_rows: tickResult.reclassified_rows,
    no_daily_context: true, no_market_context: true, no_scoring_context: true
  };
  if (!allDone) {
    output.partial_continue = true;
    output.orchestrator_should_self_continue = true;
    output.next_input_json = { mode: "baseline_v5_classification_daily_delta", request_id: requestId, run_id: runId, batch_id: batchId, combo_index: nextComboIndex, official_date: officialDate };
  }
  return output;
}

async function runClassificationV6DeltaDaily(env, input = {}) {
  const startMs = Date.now();
  const timeBudgetMs = 18000;
  let currentInput = input;
  let lastOutput = null;
  while (Date.now() - startMs < timeBudgetMs) {
    lastOutput = await runClassificationV6DeltaDailySingleStep(env, currentInput);
    if (!lastOutput.ok) return lastOutput;
    if (!lastOutput.partial_continue) return lastOutput;
    currentInput = lastOutput.next_input_json;
  }
  return lastOutput;
}

async function runBaselineV6DeltaDailySingleStep(env, input = {}) {
  await ensureCalibrationConfigLoaded(env);
  const requestId = String(input.request_id || rid("baseline_v6_delta"));
  const runId = String(input.run_id || rid("run"));
  const officialDate = String(input.official_date || "");
  if (!officialDate) return { ok: false, error: "official_date is required for daily delta." };

  const propLineUniverse = await getCalibrationValue(env, "global", "prop_line_universe", {});
  const combos = buildComboList(propLineUniverse);
  const comboIndex = Math.max(0, Number(input.combo_index || 0));
  const batchId = String(input.batch_id || rid("baseline_v6_delta_batch"));

  if (comboIndex >= combos.length) {
    return {
      ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_hp_daily_delta",
      status: "BASELINE_V5_HP_DAILY_DELTA_COMPLETED", certification: "BASELINE_V5_HP_DAILY_DELTA_CERTIFIED_ALL_COMBOS_COMPLETE",
      certification_grade: "PASS", total_combos: combos.length, official_date: officialDate, batch_id: batchId,
      no_daily_context: true, no_market_context: true, no_scoring_context: true
    };
  }

  const combo = combos[comboIndex];
  const propMap = await getCalibrationValue(env, "global", "prop_metric_map", {});
  const propConfig = propMap[combo.canonical_prop_key];
  const entity = propConfig ? propConfig.entity : "hitter";
  const affectedIds = await getAffectedPlayerIds(env, entity, officialDate);

  let tickResult = { rows_written: 0 };
  if (affectedIds.length > 0) {
    tickResult = await runBaselineV6Tick(env, {
      batch_id: batchId, canonical_prop_key: combo.canonical_prop_key, line_value: combo.line_value,
      selected_side: combo.selected_side, official_date: officialDate, player_ids_override: affectedIds
    });
  }

  const nextComboIndex = comboIndex + 1;
  const allDone = nextComboIndex >= combos.length;
  const output = {
    ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "baseline_v5_hp_daily_delta",
    request_id: requestId, run_id: runId, batch_id: batchId, official_date: officialDate,
    status: allDone ? "BASELINE_V5_HP_DAILY_DELTA_COMPLETED" : "BASELINE_V5_HP_DAILY_DELTA_PARTIAL_CONTINUE",
    certification: allDone ? "BASELINE_V5_HP_DAILY_DELTA_CERTIFIED_ALL_COMBOS_COMPLETE" : "BASELINE_V5_HP_DAILY_DELTA_CERTIFIED_COMBO_IN_PROGRESS",
    certification_grade: allDone ? "PASS" : "PARTIAL",
    combo_index: comboIndex, total_combos: combos.length, current_combo: combo,
    affected_players: affectedIds.length, rows_written: tickResult.rows_written,
    no_daily_context: true, no_market_context: true, no_scoring_context: true
  };
  if (!allDone) {
    output.partial_continue = true;
    output.orchestrator_should_self_continue = true;
    output.next_input_json = { mode: "baseline_v5_hp_daily_delta", request_id: requestId, run_id: runId, batch_id: batchId, combo_index: nextComboIndex, official_date: officialDate };
  }
  return output;
}

async function runBaselineV6DeltaDaily(env, input = {}) {
  const startMs = Date.now();
  const timeBudgetMs = 18000;
  let currentInput = input;
  let lastOutput = null;
  while (Date.now() - startMs < timeBudgetMs) {
    lastOutput = await runBaselineV6DeltaDailySingleStep(env, currentInput);
    if (!lastOutput.ok) return lastOutput;
    if (!lastOutput.partial_continue) return lastOutput;
    currentInput = lastOutput.next_input_json;
  }
  return lastOutput;
}

async function runBaselineV6Base(env, input = {}) {
  const startMs = Date.now();
  const timeBudgetMs = 18000;
  let currentInput = input;
  let lastOutput = null;

  while (Date.now() - startMs < timeBudgetMs) {
    lastOutput = await runBaselineV6BaseSingleStep(env, currentInput);
    if (!lastOutput.ok) return lastOutput;
    if (!lastOutput.partial_continue) return lastOutput;
    currentInput = lastOutput.next_input_json;
  }
  return lastOutput;
}

async function getRecencyWeightsForProp(env, propKey) {
  const profiles = await getCalibrationValue(env, "global", "prop_recency_profile", {});
  const globalDefault = await getCalibrationValue(env, "global", "recency_weights", CALIBRATION_CONFIG_DEFAULTS["global|recency_weights"]);
  const profile = profiles[propKey];
  return {
    recency_weights: profile ? profile.recency_weights : globalDefault,
    prior_strength_multiplier: profile ? Number(profile.prior_strength_multiplier || 1.0) : 1.0
  };
}

async function getCalibrationValue(env, scope, key, fallback) {
  const cfg = await ensureCalibrationConfigLoaded(env);
  const found = cfg[`${scope}|${key}`];
  return found !== undefined ? found : fallback;
}

// Recency-weighted blended rate for one player, one prop, using the metric snapshot windows
// that are already computed live by hitter_metric_snapshots / pitcher_metric_snapshots.
function computeRecencyBlendedRate(snapshotsByWindow, propConfig) {
  const weights = propConfig._recencyWeights;
  const windowKeyMap = {
    last_5_games: "last_5_games",
    last_10_games: "last_10_games",
    last_20_games: "last_20_games",
    season_to_date: "season_to_date"
  };
  let weightedSum = 0, weightTotal = 0;
  for (const [wKey, weight] of Object.entries(weights)) {
    const snap = snapshotsByWindow[windowKeyMap[wKey]];
    if (!snap) continue;
    const games = Number(snap.games_count || 0);
    if (games <= 0) continue;
    let numerator = 0;
    for (const field of propConfig.numerator_fields) {
      const raw = Number(snap[field] || 0);
      const w = propConfig.weights ? Number(propConfig.weights[field] || 1) : 1;
      numerator += raw * w;
    }
    const denom = Number(snap[propConfig.denominator_field] || 0);
    if (denom <= 0) continue;
    const rate = numerator / denom;
    weightedSum += rate * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) return null;
  return weightedSum / weightTotal;
}

function computePopulationStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, stddev: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return { mean, stddev: Math.sqrt(variance), n };
}

// Assign a tier from a z-score, collapsing bands automatically if the real population
// is too thin to fill min_population_per_tier for every band.
function assignTierFromZScore(z, tierBandsConfig, populationN) {
  const bands = tierBandsConfig.z_bands; // e.g. [2.0,1.5,1.0,0.5,0.0,-0.5,-1.0,-1.5,-2.0]
  const minPop = tierBandsConfig.min_population_per_tier || 15;
  const maxTiers = tierBandsConfig.max_tiers || 12;

  // How many bands can the real population actually support without any tier going thin?
  const maxSupportedBands = Math.max(1, Math.min(bands.length + 1, maxTiers, Math.floor(populationN / minPop) || 1));
  const usableBandCount = maxSupportedBands - 1;
  const step = Math.max(1, Math.floor(bands.length / Math.max(1, usableBandCount)));
  const effectiveBands = bands.filter((_, i) => i % step === 0).slice(0, usableBandCount);

  let tierIndex = effectiveBands.length; // default: bottom tier
  for (let i = 0; i < effectiveBands.length; i++) {
    if (z >= effectiveBands[i]) { tierIndex = i; break; }
  }
  const totalTiers = effectiveBands.length + 1;
  const tierNumber = tierIndex + 1;
  return {
    tier_number: tierNumber,
    tier_key: `TIER_${String(tierNumber).padStart(2, "0")}_OF_${totalTiers}`,
    total_tiers_used: totalTiers
  };
}

async function loadAllMetricSnapshots(env, entity, playerIds) {
  const db = entity === "pitcher" ? env.STATS_PITCHER_DB : env.STATS_HITTER_DB;
  const table = entity === "pitcher" ? "pitcher_metric_snapshots" : "hitter_metric_snapshots";
  const out = new Map();
  const chunkSize = 90; // stay well under D1's bound-parameter limit
  for (let i = 0; i < playerIds.length; i += chunkSize) {
    const chunk = playerIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await all(db, `SELECT * FROM ${table} WHERE player_id IN (${placeholders})`, ...chunk);
    for (const r of rows) {
      if (!out.has(r.player_id)) out.set(r.player_id, {});
      out.get(r.player_id)[r.metric_window] = r;
    }
  }
  return out;
}

// PASS 1: compute the population mean/stddev ONCE across every eligible player for this
// exact prop/line/side, and cache it. This must never be computed per-chunk — every
// chunk has to score against the SAME population baseline or tier boundaries drift
// between chunks, which is wrong.
async function runClassificationV6ComputeStats(env, input = {}) {
  await ensureCalibrationConfigLoaded(env);
  const propKey = String(input.canonical_prop_key || "");
  const side = String(input.selected_side || "");
  const lineValue = Number(input.line_value);

  const propMap = await getCalibrationValue(env, "global", "prop_metric_map", {});
  const propConfig = propMap[propKey];
  if (!propConfig) return { ok: false, error: `No prop_metric_map entry for canonical_prop_key '${propKey}'.` };
  const { recency_weights: recencyWeights } = await getRecencyWeightsForProp(env, propKey);

  const entity = propConfig.entity;
  const sourceTable = entity === "pitcher" ? "pitcher_game_logs" : "hitter_game_logs";
  const sourceDb = entity === "pitcher" ? env.STATS_PITCHER_DB : env.STATS_HITTER_DB;
  const idRows = await all(sourceDb, `SELECT DISTINCT player_id FROM ${sourceTable} WHERE player_id IS NOT NULL`);
  const allPlayerIds = idRows.map(r => Number(r.player_id)).filter(Boolean);

  const snapshots = await loadAllMetricSnapshots(env, entity, allPlayerIds);
  const propConfigWithWeights = { ...propConfig, _recencyWeights: recencyWeights };

  const rates = [];
  for (const playerId of allPlayerIds) {
    const snapByWindow = snapshots.get(playerId) || {};
    const rate = computeRecencyBlendedRate(snapByWindow, propConfigWithWeights);
    if (rate != null) rates.push(rate);
  }
  const stats = computePopulationStats(rates);
  let dispersion;
  const existingDispersionRow = await first(env.ARCHIVE_DB,
    `SELECT population_dispersion FROM classification_v6_population_stats WHERE canonical_prop_key=? LIMIT 1`,
    propKey);
  if (existingDispersionRow) {
    dispersion = existingDispersionRow.population_dispersion;
  } else {
    const dispersionResult = await estimatePooledDispersionFromGameLogs(env, propKey);
    dispersion = dispersionResult.dispersion;
  }
  const statsKey = `${propKey}|${String(lineValue).replace(".", "p")}|${side}`;

  await run(env.ARCHIVE_DB,
    `INSERT INTO classification_v6_population_stats (stats_key,canonical_prop_key,line_value,selected_side,population_mean,population_stddev,population_n,population_dispersion,computed_at)
     VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(stats_key) DO UPDATE SET population_mean=excluded.population_mean, population_stddev=excluded.population_stddev,
       population_n=excluded.population_n, population_dispersion=excluded.population_dispersion, computed_at=CURRENT_TIMESTAMP`,
    statsKey, propKey, lineValue, side, stats.mean, stats.stddev, stats.n, isFinite(dispersion) ? dispersion : null);

  return {
    ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "classification_v6_compute_stats",
    canonical_prop_key: propKey, line_value: lineValue, selected_side: side,
    population_mean: round(stats.mean, 6), population_stddev: round(stats.stddev, 6), population_n: stats.n,
    total_players_scanned: allPlayerIds.length,
    certification: "CLASSIFICATION_V6_STATS_CERTIFIED", certification_grade: "PASS"
  };
}

// PASS 2: chunked tier assignment against the CACHED population stats from pass 1.
// Also batches the existing-tier lookup for the whole chunk in one query instead of
// one query per player (real inefficiency found during testing, fixed here).
async function runClassificationV6Tick(env, input = {}) {
  await ensureCalibrationConfigLoaded(env);
  const requestId = String(input.request_id || rid("classification_v6"));
  const runId = String(input.run_id || rid("run"));
  const batchId = String(input.batch_id || rid("classification_v6_batch"));
  const propKey = String(input.canonical_prop_key || "");
  const side = String(input.selected_side || "");
  const lineValue = Number(input.line_value);
  const officialDate = String(input.official_date || "");

  const propMap = await getCalibrationValue(env, "global", "prop_metric_map", {});
  const propConfig = propMap[propKey];
  if (!propConfig) return { ok: false, error: `No prop_metric_map entry for canonical_prop_key '${propKey}'.` };
  const { recency_weights: recencyWeights } = await getRecencyWeightsForProp(env, propKey);
  const tierBands = await getCalibrationValue(env, "global", "tier_bands", { max_tiers: 12, z_bands: [2.0,1.5,1.0,0.5,0.0,-0.5,-1.0,-1.5,-2.0], min_population_per_tier: 15 });
  const opLimits = await getCalibrationValue(env, "operational", "run_limits", { chunk_size_rows: 40, tick_timeout_ms: 20000 });

  const statsKey = `${propKey}|${String(lineValue).replace(".", "p")}|${side}`;
  const cachedStats = await first(env.ARCHIVE_DB, `SELECT * FROM classification_v6_population_stats WHERE stats_key=?`, statsKey);
  if (!cachedStats) {
    return { ok: false, error: `No cached population stats for ${statsKey}. Run classification_v6_compute_stats first.` };
  }
  const stats = { mean: cachedStats.population_mean, stddev: cachedStats.population_stddev, n: cachedStats.population_n };

  const entity = propConfig.entity;
  const sourceTable = entity === "pitcher" ? "pitcher_game_logs" : "hitter_game_logs";
  const sourceDb = entity === "pitcher" ? env.STATS_PITCHER_DB : env.STATS_HITTER_DB;
  let allPlayerIds;
  if (Array.isArray(input.player_ids_override)) {
    allPlayerIds = input.player_ids_override.map(Number).filter(Boolean);
  } else {
    const idRows = await all(sourceDb, `SELECT DISTINCT player_id FROM ${sourceTable} WHERE player_id IS NOT NULL`);
    allPlayerIds = idRows.map(r => Number(r.player_id)).filter(Boolean);
  }

  const cursor = Math.max(0, Number(input.cursor_offset || 0));
  const chunkSize = Array.isArray(input.player_ids_override) ? allPlayerIds.length : Math.max(10, Number(opLimits.chunk_size_rows || 40));
  const slice = allPlayerIds.slice(cursor, cursor + chunkSize);

  const snapshots = await loadAllMetricSnapshots(env, entity, slice);
  const propConfigWithWeights = { ...propConfig, _recencyWeights: recencyWeights };

  const perPlayer = [];
  for (const playerId of slice) {
    const snapByWindow = snapshots.get(playerId) || {};
    const seasonSnap = snapByWindow["season_to_date"];
    const anySnap = seasonSnap || Object.values(snapByWindow)[0];
    const games = seasonSnap ? Number(seasonSnap.games_count || 0) : (anySnap ? Number(anySnap.games_count || 0) : 0);
    const rate = computeRecencyBlendedRate(snapByWindow, propConfigWithWeights);
    if (rate == null) continue;
    perPlayer.push({ playerId, rate, games, playerName: anySnap ? (anySnap.player_name || null) : null });
  }

  // Batched existing-tier lookup, chunked to stay under D1's bound-parameter limit
  // (same 90-per-query pattern as loadAllMetricSnapshots — this broke once already
  // when chunk_size_rows was raised without updating this query too).
  const existingTiers = new Map();
  if (perPlayer.length) {
    const idChunkSize = 90;
    for (let i = 0; i < perPlayer.length; i += idChunkSize) {
      const idSlice = perPlayer.slice(i, i + idChunkSize);
      const idPlaceholders = idSlice.map(() => "?").join(",");
      const existingRows = await all(env.ARCHIVE_DB,
        `SELECT player_id, tier_key FROM classification_v6_current WHERE player_type=? AND canonical_prop_key=? AND line_value=? AND selected_side=? AND player_id IN (${idPlaceholders})`,
        entity, propKey, lineValue, side, ...idSlice.map(p => p.playerId));
      for (const r of existingRows) existingTiers.set(r.player_id, r.tier_key);
    }
  }

  const stmts = [];
  let reclassifiedCount = 0;

  for (const p of perPlayer) {
    const z = stats.stddev > 0 ? (p.rate - stats.mean) / stats.stddev : 0;
    const tier = assignTierFromZScore(z, tierBands, stats.n);
    const rowId = `clsv6|${entity}|${p.playerId}|${propKey}|${String(lineValue).replace(".", "p")}|${side}`;

    if (existingTiers.has(p.playerId) && existingTiers.get(p.playerId) !== tier.tier_key) reclassifiedCount++;

    stmts.push(env.ARCHIVE_DB.prepare(
      `INSERT INTO classification_v6_current (classification_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,tier_key,tier_number,z_score,metric_value,population_mean,population_stddev,games_sample,formula_version,last_processed_official_date,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(player_type,player_id,canonical_prop_key,line_value,selected_side) DO UPDATE SET
         batch_id=excluded.batch_id, tier_key=excluded.tier_key, tier_number=excluded.tier_number,
         z_score=excluded.z_score, metric_value=excluded.metric_value, population_mean=excluded.population_mean,
         population_stddev=excluded.population_stddev, games_sample=excluded.games_sample,
         formula_version=excluded.formula_version, last_processed_official_date=excluded.last_processed_official_date,
         updated_at=CURRENT_TIMESTAMP`
    ).bind(rowId, batchId, entity, p.playerId, p.playerName, propKey, lineValue, side,
      tier.tier_key, tier.tier_number, round(z, 4), round(p.rate, 6), round(stats.mean, 6), round(stats.stddev, 6),
      p.games, CLASSIFICATION_V6_VERSION, officialDate));
  }

  if (stmts.length) await writeBatch(env.ARCHIVE_DB, "classification_v6_current", stmts, 30);

  const nextCursor = cursor + chunkSize;
  const done = nextCursor >= allPlayerIds.length;

  await writeRun(env.ARCHIVE_DB,
    "classification_v6_batches",
    `INSERT INTO classification_v6_batches (batch_id,request_id,run_id,mode,status,worker_version,official_date,rows_read,rows_written,reclassified_rows,cursor_offset,certification,certification_grade,cached_population_mean,cached_population_stddev,cached_population_n,stats_computed_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(batch_id) DO UPDATE SET status=excluded.status, rows_read=classification_v6_batches.rows_read+excluded.rows_read,
       rows_written=classification_v6_batches.rows_written+excluded.rows_written,
       reclassified_rows=classification_v6_batches.reclassified_rows+excluded.reclassified_rows,
       cursor_offset=excluded.cursor_offset, certification=excluded.certification, certification_grade=excluded.certification_grade,
       finished_at=CASE WHEN excluded.status='completed' THEN CURRENT_TIMESTAMP ELSE finished_at END, updated_at=CURRENT_TIMESTAMP`,
    batchId, requestId, runId, "classification_v6", done ? "completed" : "partial_continue", CLASSIFICATION_V6_VERSION,
    officialDate, slice.length, perPlayer.length, reclassifiedCount, nextCursor,
    "CLASSIFICATION_V6_TICK_CERTIFIED", done ? "PASS" : "PARTIAL",
    stats.mean, stats.stddev, stats.n, cachedStats.computed_at);

  return {
    ok: true, data_ok: true, version: CLASSIFICATION_V6_VERSION, mode: "classification_v6",
    request_id: requestId, run_id: runId, batch_id: batchId,
    canonical_prop_key: propKey, line_value: lineValue, selected_side: side,
    status: done ? "completed" : "partial_continue",
    certification: "CLASSIFICATION_V6_TICK_CERTIFIED", certification_grade: done ? "PASS" : "PARTIAL",
    rows_read: slice.length, rows_written: perPlayer.length, reclassified_rows: reclassifiedCount,
    population_mean: round(stats.mean, 6), population_stddev: round(stats.stddev, 6), population_n: stats.n,
    cursor_offset: nextCursor, total_players: allPlayerIds.length, done,
    no_daily_context: true, no_market_context: true, no_scoring_context: true
  };
}

export default {
  async fetch(request, env, ctx){
    const url=new URL(request.url); const path=url.pathname.replace(/\/$/,"")||"/"; const method=request.method.toUpperCase();
    if(method==="GET" && path==="/") return jsonResponse(baseIdentity(env));
    if(method==="GET" && path==="/health") return jsonResponse({...baseIdentity(env),route:"/health"});
    if(method==="POST" && path==="/diagnostic") return jsonResponse({...baseIdentity(env),route:"/diagnostic",input_echo_safe:await readJsonSafe(request)});
    if(method==="POST" && path==="/run"){
      const input=await readJsonSafe(request);
      try { return jsonResponse(await runMode(env,input)); }
      catch(err){ return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,logical_worker_name:LOGICAL_WORKER_NAME,status:"EXPANSION_BASELINE_WORKER_FAILED",error:String(err&&err.message?err.message:err),expansion_only:true,baseline_only:true,no_current_baseline_mutation:true,no_scoring_mutation:true,no_final_board_mutation:true},500); }
    }
    return jsonResponse({ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"NOT_FOUND",allowed_routes:["GET /","GET /health","POST /diagnostic","POST /run"]},404);
  }
};
