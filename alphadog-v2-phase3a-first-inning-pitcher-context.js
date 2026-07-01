const WORKER_NAME = "alphadog-v2-phase3a-first-inning-pitcher-context";
const LOGICAL_WORKER_NAME = "alphadog-v2-expansion-baseline";
const VERSION = "alphadog-v2-phase3a-first-inning-pitcher-context-v0.1.50-baseline-v5-classification-rescue-pitcher-universe";
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
  if(!/^expansion_[a-zA-Z0-9_]+$/.test(String(table||""))) throw new Error(`EXPANSION_WRITE_GUARD_BLOCKED_TABLE:${table}`);
}
async function writeRun(db, table, sql, ...binds){ assertExpansionTable(table); return run(db, sql, ...binds); }
async function writeBatch(db, table, stmts, size=30){ assertExpansionTable(table); return batch(db, stmts, size); }

function baseIdentity(env){
  const db=bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars={}; for(const n of EXPECTED_VARS) vars[n]=env && env[n] !== undefined && env[n] !== null && String(env[n]).length>0;
  return {
    ok:true,data_ok:true,version:VERSION,worker_name:WORKER_NAME,logical_worker_name:LOGICAL_WORKER_NAME,
    status:"EXPANSION_BASELINE_WORKER_READY",timestamp_utc:nowUtc(),
    expansion_only:true,baseline_only:true,write_whitelist:"^expansion_",
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
  if(Math.abs(splitDelta)>=6 && side==='more') return {tier_key:splitDelta>0?'TIER_07_EXTREME_PLATOON_FAVORABLE_SHAPE':'TIER_08_EXTREME_PLATOON_UNFAVORABLE_SHAPE', tier_number:splitDelta>0?7:8};
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
async function classifyBaselineV5(env,row,line,side,entityType,model,hs,stats){
  const playerId=Number(row.mlb_player_id||0);
  const prop=String(row.canonical_prop_key||'');
  const rows=await loadBaselineModelRows(env,row,entityType);
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
    return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop),volume_profile:volumeProfile,lineup_profile:'PITCHER_NA',platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:stats.volatility_profile,classification_confidence_0_100:round(clamp(model.baseline_confidence_0_100||25,1,95),2),games_sample:games,events_sample:games,pa_per_game:null,ab_ratio:null,avg_batting_order:null,split_delta_0_100:splitDelta,metrics:{outs_per_start:round(outsPerStart,2),bf_per_start:round(bfPerStart,2),k_rate:round(kRate,4),bb_rate:round(bbRate,4),ha_rate:round(haRate,4),split_rows:splitRows.length}};
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
  return {classification_tier:tier.tier_key,tier_number:tier.tier_number,classification_profile_key:`V5_${tier.tier_key}_${upperToken(prop)}_${lineIdToken(line)}_${side}`,sample_profile:sampleTierV2(games,prop),volume_profile:volumeProfile,lineup_profile:lineupProfile,platoon_profile:platoonProfile,usage_profile:volumeProfile,volatility_profile:stats.volatility_profile,classification_confidence_0_100:round(clamp(model.baseline_confidence_0_100||25,1,95),2),games_sample:games,events_sample:games,pa_per_game:round(paPerGame,3),ab_ratio:round(abRatio,3),avg_batting_order:avgOrder!=null?round(avgOrder,2):null,split_delta_0_100:splitDelta,metrics:{hits_per_game:round(hitRatePerGame,3),walk_rate:round(walkRate,4),strikeout_rate:round(soRate,4),split_rows:splitRows.length,batting_order_rows:orderSummary.batting_order_rows,batting_order_coverage:round(orderSummary.batting_order_coverage,3)}};
}
function qualityStart(r){ return num(r.outs_recorded)>=18 && num(r.earned_runs)<=3 ? 1 : 0; }
function pfsPp(r){ return num(r.outs_recorded) + 3*num(r.strikeouts) + 4*qualityStart(r) - 3*num(r.earned_runs); }
function pfsSl(r){ return num(r.outs_recorded) + 3*num(r.strikeouts) - 3*num(r.earned_runs) - 2*num(r.walks_allowed); }
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
    profileNamespace='PITCHER_FANTASY_SCORE_DYNAMIC_'; sourceFormulaKey='PITCHER_FANTASY_SCORE_LOCKED_COMPONENT_WORKLOAD_K_DAMAGE_WIN_REGRESSED'; resolvedFactor='pitcher'; status='SOURCE_READY_PITCHER_FANTASY_DYNAMIC'; needs=1; note='Source-agnostic pitcher fantasy baseline; app-specific scoring variants must be modeled as formula variants outside board/source identity';
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
  const inv=await all(env.SCORE_DB,`SELECT canonical_prop_key, source_key, COALESCE(factor_family,'unknown') AS factor_family, selected_side, board_line_value AS line_value,
      COUNT(*) AS source_rows, COUNT(DISTINCT mlb_player_id) AS players,
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
  return hpRows;
}

async function insertHpRows(env, hpRows){
  const stmts=hpRows.map(r=>env.SCORE_DB.prepare(`INSERT OR REPLACE INTO expansion_player_baseline_hp_stage
    (baseline_hp_row_id,batch_id,source_sanity_batch_id,source_baseline_row_id,expansion_scope,profile_namespace,source_data_family,source_table,source_formula_key,baseline_formula_version,entity_type,entity_id,player_type,player_id,player_name,canonical_prop_key,prop_family,line_value,selected_side,baseline_hp_0_100,hp_adjustment_0_100,raw_rate_0_100,tier_prior_rate_0_100,raw_prior_gap_0_100,baseline_confidence_0_100,baseline_enriched_confidence_0_100,consistency_bonus_0_100,soft_uncertainty_reserve_0_100,sample_profile,role_profile,sanity_profile_key,volatility_profile,variance_profile,line_difficulty_profile,baseline_hp_profile_key,non_push_sample,hit_count,miss_count,push_count,prior_strength,formula_version,confidence_formula_version,no_daily_context,no_market_context,no_scoring_context,profile_notes_json,source_snapshot_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(r.baseline_hp_row_id,r.batch_id,r.source_sanity_batch_id,r.source_baseline_row_id,r.expansion_scope,r.profile_namespace,r.source_data_family,r.source_table,r.source_formula_key,r.baseline_formula_version,r.entity_type,r.entity_id,r.player_type,r.player_id,r.player_name,r.canonical_prop_key,r.prop_family,r.line_value,r.selected_side,r.baseline_hp_0_100,r.raw_rate_0_100,r.tier_prior_rate_0_100,r.raw_prior_gap_0_100,r.baseline_confidence_0_100,r.baseline_enriched_confidence_0_100,r.consistency_bonus_0_100,r.soft_uncertainty_reserve_0_100,r.sample_profile,r.role_profile,r.sanity_profile_key,r.volatility_profile,r.variance_profile,r.line_difficulty_profile,r.baseline_hp_profile_key,r.non_push_sample,r.hit_count,r.miss_count,r.push_count,r.prior_strength,VERSION,`${VERSION}_confidence`,r.profile_notes_json,r.source_snapshot_json));
  if(stmts.length) await writeBatch(env.SCORE_DB,"expansion_player_baseline_hp_stage",stmts,20);
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
const BASELINE_V2_FORMULA_VERSION = "baseline_v5_full_prop_models_v0.5.0_classification_history_only_fast50";
const BASELINE_V2_CONFIDENCE_VERSION = "baseline_v5_confidence_v0.5.0_classification_history_only_caps";
const V2_ENTITY_VALUE_CACHE = new Map();
const V2_PROFILE_PRIOR_CACHE = new Map();
const V2_GLOBAL_VALUE_CACHE = new Map();
const V2_BASELINE_ROW_CACHE = new Map();
const V2_BASELINE_MODEL_CACHE = new Map();
const V5_CLASSIFICATION_CACHE = new Map();

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
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_v2_current_player_prop_line ON player_baseline_hp_v2_current(player_type, player_id, canonical_prop_key, line_value, selected_side)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pbhp_v2_current_profile ON player_baseline_hp_v2_current(prop_family, baseline_hp_profile_key, sample_profile, line_difficulty_profile)`);
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
  if(p==="fantasy"||p==="pitcher_fantasy_score") return sourceFormulaPfs(r, "PP");
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
function mForProp(prop){ const p=String(prop||""); if(p==="rfi_nrfi") return 50; if(p==="fantasy"||p==="fantasy_score"||p==="hits_runs_rbis") return 35; if(p==="pitches_thrown"||p==="pitcher_outs") return 20; if(p==="triples"||p==="home_runs"||p==="stolen_bases") return 100; return 25; }
function sampleTierV2(n, prop){
  const sample=Number(n||0);
  // RFI is binary/noisy and must use the locked larger-tier contract.
  if(String(prop||"")==="rfi_nrfi"){
    if(sample<5) return "TINY_SAMPLE";
    if(sample<15) return "LOW_SAMPLE";
    if(sample<30) return "MEDIUM_SAMPLE";
    return "ESTABLISHED_SAMPLE";
  }
  if(sample<5) return "TINY_SAMPLE";
  if(sample<20) return "DEVELOPING";
  if(sample<50) return "ESTABLISHED";
  return "ELITE";
}
function propFamilyV2(prop, entity){ const p=String(prop||""); if(p==="fantasy"||p==="fantasy_score") return "V2_FANTASY_COMPOSITE"; if(p==="rfi_nrfi") return "V2_FIRST_INNING_RUNS"; if(p==="pitches_thrown"||p==="pitcher_outs") return "V2_PITCHER_VOLUME"; if(entity==="pitcher") return "V2_PITCHER_PROP"; if(p==="triples"||p==="home_runs"||p==="stolen_bases") return "V2_RARE_HITTER_EVENT"; return "V2_HITTER_PROP"; }
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

async function loadHitterValues(env, playerId, prop){
  const key=`hitter|${playerId}|${prop}`; if(V2_ENTITY_VALUE_CACHE.has(key)) return V2_ENTITY_VALUE_CACHE.get(key);
  const rows=await all(env.STATS_HITTER_DB,`SELECT player_id, game_pk, game_date, batting_order, pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json FROM hitter_game_logs WHERE player_id=? ORDER BY game_date`, playerId);
  const vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v))); V2_ENTITY_VALUE_CACHE.set(key,vals); return vals;
}
async function loadPitcherValues(env, playerId, prop){
  const key=`pitcher|${playerId}|${prop}`; if(V2_ENTITY_VALUE_CACHE.has(key)) return V2_ENTITY_VALUE_CACHE.get(key);
  const rows=await all(env.TEAM_DB,`SELECT COALESCE(player_id, starter_player_id) AS player_id, game_pk, game_date, outs_recorded, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches FROM starter_history WHERE started_game=1 AND COALESCE(player_id, starter_player_id)=? ORDER BY game_date`, playerId);
  const vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v))); V2_ENTITY_VALUE_CACHE.set(key,vals); return vals;
}
async function loadRfiValues(env, sourceKey, playerId){
  const cacheKey=`rfi|${sourceKey}|${playerId||'game'}`; if(V2_ENTITY_VALUE_CACHE.has(cacheKey)) return V2_ENTITY_VALUE_CACHE.get(cacheKey);
  if(String(sourceKey)==="sleeper"){
    const rows=await all(env.CONTEXT_DB,`SELECT pitcher_id, game_pk, game_date, rfi_sl_more_hit AS rfi_value FROM expansion_first_inning_pitcher_context_current WHERE pitcher_id=? AND rfi_sl_more_hit IS NOT NULL ORDER BY game_date`, playerId);
    const vals=rows.map(r=>num(r.rfi_value)).filter(v=>v!==null && Number.isFinite(Number(v))); V2_ENTITY_VALUE_CACHE.set(cacheKey,vals); return vals;
  }
  const rows=await all(env.CONTEXT_DB,`SELECT game_pk, game_date, rfi_pp_more_hit AS rfi_value FROM expansion_first_inning_game_context_current WHERE rfi_pp_more_hit IS NOT NULL ORDER BY game_date`);
  const vals=rows.map(r=>num(r.rfi_value)).filter(v=>v!==null && Number.isFinite(Number(v))); V2_ENTITY_VALUE_CACHE.set(cacheKey,vals); return vals;
}
async function loadRfiPriorValues(env, sourceKey){
  const cacheKey=`rfi_prior|${sourceKey||'source'}`; if(V2_GLOBAL_VALUE_CACHE.has(cacheKey)) return V2_GLOBAL_VALUE_CACHE.get(cacheKey);
  let rows=[];
  if(String(sourceKey)==="sleeper"){
    rows=await all(env.CONTEXT_DB,`SELECT pitcher_id, game_pk, game_date, rfi_sl_more_hit AS rfi_value FROM expansion_first_inning_pitcher_context_current WHERE rfi_sl_more_hit IS NOT NULL ORDER BY game_date`);
  } else {
    rows=await all(env.CONTEXT_DB,`SELECT game_pk, game_date, rfi_pp_more_hit AS rfi_value FROM expansion_first_inning_game_context_current WHERE rfi_pp_more_hit IS NOT NULL ORDER BY game_date`);
  }
  const vals=rows.map(r=>num(r.rfi_value)).filter(v=>v!==null && Number.isFinite(Number(v)));
  V2_GLOBAL_VALUE_CACHE.set(cacheKey,vals); return vals;
}
async function loadValuesForHpRow(env, row){
  const prop=String(row.canonical_prop_key||""); const src=String(row.source_key||""); const fam=String(row.factor_family||""); const playerId=Number(row.mlb_player_id||0);
  if(prop==="rfi_nrfi") return loadRfiValues(env,src,playerId);
  if(fam==="pitcher" || prop==="fantasy" || prop==="pitches_thrown" || prop==="pitcher_strikeouts" || prop==="pitcher_outs" || prop==="hits_allowed" || prop==="earned_runs" || prop==="walks_allowed") return loadPitcherValues(env,playerId,prop);
  return loadHitterValues(env,playerId,prop);
}
async function globalValuesForPrior(env, row){
  const prop=String(row.canonical_prop_key||"");
  const fam=String(row.factor_family||"");
  const globalKey=`baseline|${prop}|${fam}`;
  if(V2_GLOBAL_VALUE_CACHE.has(globalKey)) return V2_GLOBAL_VALUE_CACHE.get(globalKey);
  let vals=[];
  if(prop==="rfi_nrfi"){
    // Prior pool must be source/formula-level, not the first pitcher/player cached under the global prior key.
    // Sleeper RFI direct samples stay pitcher-specific; the prior uses all Sleeper pitcher RFI observations.
    vals=await loadRfiPriorValues(env,row.source_key);
  } else if(fam==="pitcher" || prop==="fantasy" || prop==="pitches_thrown" || prop.startsWith("pitcher_") || prop==="hits_allowed" || prop==="earned_runs" || prop==="walks_allowed"){
    const rows=await all(env.TEAM_DB,`SELECT outs_recorded, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches FROM starter_history WHERE started_game=1 ORDER BY game_date LIMIT 5000`);
    vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  } else {
    const rows=await all(env.STATS_HITTER_DB,`SELECT batting_order, pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json FROM hitter_game_logs ORDER BY game_date LIMIT 50000`);
    vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  }
  V2_GLOBAL_VALUE_CACHE.set(globalKey, vals);
  return vals;
}

async function profilePriorFor(env, row, line, side, profileNamespace, formulaKey, entityType){
  const prop=String(row.canonical_prop_key||"");
  const ns=String(profileNamespace||"");
  const fk=String(formulaKey||"");
  const et=String(entityType||"");
  const cacheKey=`baseline|${prop}|${ns}|${fk}|${et}|${line}|${side}`;
  if(V2_PROFILE_PRIOR_CACHE.has(cacheKey)) return V2_PROFILE_PRIOR_CACHE.get(cacheKey);
  const vals=await globalValuesForPrior(env,{...row,factor_family:et});
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
      COALESCE(MAX(COALESCE(json_extract(raw_json,'$.player.person.fullName'), json_extract(raw_json,'$.player.fullName'))), CAST(player_id AS TEXT)) AS player_name,
      MAX(game_pk) AS game_pk,
      MAX(game_date) AS official_date,
      COUNT(*) AS history_games,
      SUM(COALESCE(pa,0)) AS total_pa,
      SUM(CASE WHEN json_extract(raw_json,'$.player.position.type')='Pitcher' THEN 1 ELSE 0 END) AS pitcher_position_rows,
      SUM(CASE WHEN json_extract(raw_json,'$.player.position.type')='Runner' THEN 1 ELSE 0 END) AS runner_position_rows
    FROM hitter_game_logs
    WHERE player_id IS NOT NULL
    GROUP BY player_id
    HAVING COUNT(*)>=?
       AND SUM(COALESCE(pa,0)) > 0
       AND SUM(CASE WHEN json_extract(raw_json,'$.player.position.type')='Pitcher' THEN 1 ELSE 0 END) < COUNT(*)
       AND SUM(CASE WHEN json_extract(raw_json,'$.player.position.type')='Runner' THEN 1 ELSE 0 END) < COUNT(*)
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
async function classifyAndInsertRescueItem(env,batchId,item,rescueTag){
  const r=item.row, line=item.line, side=item.side, entityType='pitcher';
  const values=await loadValuesForHpRow(env,r);
  const hs=hitStatsFor(values,line,side);
  const model=await lockedBaselineModel(env,r,line,side,entityType,item.resolved.profileNamespace,item.resolved.sourceFormulaKey);
  let confidence=round(clamp(model.baseline_confidence_0_100,1,95),2);
  let post=model.baseline_hp_0_100;
  const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,r.canonical_prop_key);
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

async function runBaselineV5ClassificationRescue(env,input={}){
  await ensureSchema(env); await ensureBaselineV2Schema(env);
  const requestId=String(input.request_id||rid("baseline_v5_classification_rescue"));
  const runId=String(input.run_id||rid("run"));
  let batchId=String(input.batch_id||"");
  if(!batchId){
    const latest=await first(env.SCORE_DB,`SELECT batch_id FROM player_baseline_hp_v2_batches WHERE mode IN ('baseline_v5_classification_base','baseline_v5_classification_delta') AND status='completed' ORDER BY datetime(updated_at) DESC LIMIT 1`);
    batchId=String(latest&&latest.batch_id||"");
  }
  if(!batchId) return baseOutput(input,{ok:false,data_ok:false,request_id:requestId,run_id:runId,mode:"baseline_v5_classification_rescue",status:"BASELINE_V5_CLASSIFICATION_RESCUE_BLOCKED_NO_BATCH",certification:"BASELINE_V5_CLASSIFICATION_RESCUE_BLOCKED_NO_BATCH",certification_grade:"BLOCKED"});
  const startedMs=Date.now();
  const softYieldMs=clamp(Number(input.rescue_soft_yield_ms||12000),5000,18000);
  const rowChunkSize=clamp(Number(input.rescue_row_chunk_size||200),1,500);
  const beforeStage=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_stage");
  const beforeCurrent=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_current");
  const beforeUniverse=await classificationUniverseAudit(env,batchId);
  const inserted=[];
  const skipped=[];
  let sourceQueueRowsInserted=0;

  // First repair partial players that already exist in current/stage.
  for(const bp of beforeCurrent.bad_players_sample){
    if(Date.now()-startedMs>=softYieldMs || inserted.length>=rowChunkSize) break;
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
          if(Date.now()-startedMs>=softYieldMs || inserted.length>=rowChunkSize) break;
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
          const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,prop);
          const calibrationGuard=applyBaselineV2CalibrationGuard({prop,entityType,side,line:Number(line),hp:post,confidence,hs,sampleTier});
          post=calibrationGuard.hp; confidence=calibrationGuard.confidence;
          const stats=valueStats(values);
          const classification=await classifyBaselineV5(env,r,Number(line),side,entityType,{...model,baseline_hp_0_100:post,baseline_confidence_0_100:confidence,calibration_guard_v0_1_34:calibrationGuard},hs,stats);
          const payload={classification_row_id:classificationId,batch_id:batchId,player_type:entityType,player_id:Number(bp.player_id),player_name:playerName,canonical_prop_key:prop,line_value:Number(line),selected_side:side,classification_tier:classification.classification_tier,classification_profile_key:classification.classification_profile_key,sample_profile:classification.sample_profile,volume_profile:classification.volume_profile,lineup_profile:classification.lineup_profile,platoon_profile:classification.platoon_profile,usage_profile:classification.usage_profile,volatility_profile:classification.volatility_profile,classification_confidence_0_100:classification.classification_confidence_0_100,games_sample:classification.games_sample,events_sample:classification.events_sample,pa_per_game:classification.pa_per_game,ab_ratio:classification.ab_ratio,avg_batting_order:classification.avg_batting_order,split_delta_0_100:classification.split_delta_0_100,classification_json:safeJson({...classification,rescue_v0_1_50:true,rescue_source:"missing_classification_shape_only",baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app"})};
          await insertClassificationV5Row(env,"player_baseline_classification_v5_stage",payload,false);
          await insertClassificationV5Row(env,"player_baseline_classification_v5_current",payload,false);
          await insertClassificationV5Row(env,"player_baseline_classification_v5_history",payload,true);
          inserted.push({player_type:entityType,player_id:bp.player_id,player_name:playerName,prop,line:Number(line),side,classification_row_id:classificationId});
          existing.add(classificationId);
        }
      }
    }
  }

  // Then add the missing pitcher universe. The original rescue only fixed partial existing players;
  // this closes the hitter-only source_queue hole without touching board, market, daily context, scoring, or final-board tables.
  while(inserted.length<rowChunkSize && Date.now()-startedMs<softYieldMs){
    const items=await pitcherClassificationWorkItems(env,batchId,Math.min(rowChunkSize-inserted.length,50));
    if(!items.length) break;
    for(const item of items){
      if(inserted.length>=rowChunkSize || Date.now()-startedMs>=softYieldMs) break;
      try{
        if(await insertSourceQueueIfMissing(env,batchId,item)) sourceQueueRowsInserted++;
        const payload=await classifyAndInsertRescueItem(env,batchId,item,"missing_pitcher_universe");
        inserted.push({player_type:'pitcher',player_id:item.playerId,player_name:item.playerName,prop:item.row.canonical_prop_key,line:item.line,side:item.side,classification_row_id:payload.classification_row_id});
      }catch(e){
        skipped.push({player_type:'pitcher',player_id:item.playerId,player_name:item.playerName,prop:item.row.canonical_prop_key,line:item.line,side:item.side,reason:String(e&&e.message?e.message:e).slice(0,300)});
      }
    }
  }

  const afterStage=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_stage");
  const afterCurrent=await classificationShapeAudit(env,batchId,"player_baseline_classification_v5_current");
  const afterUniverse=await classificationUniverseAudit(env,batchId);
  const stageRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId))?.c||0);
  const currentRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_current WHERE batch_id=?`,batchId))?.c||0);
  const historyRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_classification_v5_history WHERE batch_id=?`,batchId))?.c||0);
  const sourceQueueRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId))?.c||0);
  const complete=afterStage.bad_players===0 && afterCurrent.bad_players===0 && afterUniverse.missing_pitcher_rows===0;
  const partial=!complete && inserted.length>0;
  const cert=complete?"BASELINE_V5_CLASSIFICATION_RESCUE_COMPLETED_UNIFIED_HITTER_PITCHER_PASS":(partial?"BASELINE_V5_CLASSIFICATION_RESCUE_PARTIAL_CONTINUE":"BASELINE_V5_CLASSIFICATION_RESCUE_BLOCKED_SHAPE_REMAINS");
  const grade=complete?"PASS":(partial?"PARTIAL_CONTINUE":"BLOCKED");
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"baseline_v5_classification_rescue",status:cert,certification:cert,certification_grade:grade,rescue_only:true,classification_only:true,partial_continue:partial,orchestrator_should_self_continue:partial,inserted_rows:inserted.length,inserted_sample:inserted.slice(0,50),skipped_sample:skipped.slice(0,50),source_queue_rows_inserted:sourceQueueRowsInserted,source_queue_rows:sourceQueueRows,before_stage_audit:beforeStage,before_current_audit:beforeCurrent,before_universe_audit:beforeUniverse,after_stage_audit:afterStage,after_current_audit:afterCurrent,after_universe_audit:afterUniverse,rows_staged:stageRows,rows_promoted:currentRows,history_rows:historyRows,issue_rows:skipped.length,no_board_context:true,no_market_context:true,no_daily_context:true,no_app_context:true,allowed_downstream:complete?"run Baseline Base after rescue validation":"blocked until unified hitter+pitcher classification is complete",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,next_input_json:partial?{...input,mode:"baseline_v5_classification_rescue",batch_id:batchId,request_id:requestId,run_id:runId,rescue_row_chunk_size:rowChunkSize,rescue_soft_yield_ms:softYieldMs}:null});
  await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,sourceQueueRows,stageRows,currentRows,historyRows,skipped.length,cert,grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,stageRows,currentRows,historyRows,skipped.length,cert,grade,safeJson(output),batchId);
  output.ok=complete || partial; output.data_ok=complete || partial; return output;
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
async function loadBaselineModelRows(env,row,entityType){ const prop=String(row.canonical_prop_key||""); const playerId=Number(row.mlb_player_id||0); const key=`${entityType}|baseline|${playerId}|${prop}`; if(V2_BASELINE_ROW_CACHE.has(key)) return V2_BASELINE_ROW_CACHE.get(key); let rows=[]; if(prop==="rfi_nrfi"){ const vals=await loadValuesForHpRow(env,row); rows=vals.map((v,i)=>({game_date:String(i),rfi_value:v})); }
  else if(entityType==="pitcher"){ rows=await all(env.TEAM_DB,`SELECT COALESCE(player_id, starter_player_id) AS player_id, starter_name AS player_name, game_pk, game_date, outs_recorded, batters_faced, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches FROM starter_history WHERE started_game=1 AND COALESCE(player_id, starter_player_id)=? ORDER BY game_date`,playerId); }
  else { rows=await all(env.STATS_HITTER_DB,`SELECT player_id, game_pk, game_date, batting_order, pa, ab, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json FROM hitter_game_logs WHERE player_id=? ORDER BY game_date`,playerId); }
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
  else if(prop==="pitcher_fantasy_score"||prop==="fantasy"){ const sourceMode=/PFS_SL|SLEEPER/i.test(String(formulaKey||sourceKey||"")) ? "SL" : "PP"; const vals=rows.map(r=>sourceFormulaPfs(r,sourceMode)); const season=avgArr(vals); const recentAvg=avgArr(recent.map(r=>sourceFormulaPfs(r,sourceMode)))||season; const mu=0.70*recentAvg+0.30*season; let sigma=line>=36.5?1.65:1.45; if(line>=45.5) sigma=1.85; more=overdispersedTailGE(Math.floor(line)+1,mu,sigma); engine=sourceMode==="SL"?"pfs_sl_correlated_workload_proxy_no_qs":"pfs_pp_correlated_workload_proxy_qs_same_iteration"; extra={source_pfs_mode:sourceMode,season_pfs:round(season,2),recent_pfs:round(recentAvg,2),qs_used:sourceMode==="PP",shared_workload_draw_required:true,monte_carlo_contract:"implemented_as_fast_deterministic_correlated_proxy_for_baseline_v2"}; }
  else if(prop==="pitches_thrown"){ const expPitch=blendedAvg(rows,"pitches",8); more=overdispersedTailGE(Math.floor(line)+1,expPitch,1.2); }
  const prob0=sideProbFromMore(more,side); const baseConf=Math.min(lockedSampleCap(games,prop),workloadCap(bucket),v2LineCap(prop,line,sourceKey)); const capped=applyLineSideCaps(prob0,baseConf,prop,line,side,rows,{workload_bucket:bucket,leash_profile:leash}); return {prob:capped.prob,confidence:capped.confidence,engine,games,workload_bucket:bucket,leash_profile:leash,sample_cap:lockedSampleCap(games,prop),workload_cap:workloadCap(bucket),line_cap:v2LineCap(prop,line,sourceKey),...extra}; }
function modelRfiBaseline(values,line,side){ const hs=hitStatsFor(values,line,side); const prior=50; const m=50; const post=posteriorHeb(hs.hit,hs.miss,hs.push,prior,m); const games=values.length; return {prob:post==null?null:post/100,confidence:Math.min(lockedSampleCap(games,"rfi_nrfi"),55),engine:"rfi_binary_larger_sample_tiers",games,sample_cap:lockedSampleCap(games,"rfi_nrfi"),line_cap:55,direct:hs}; }
async function lockedBaselineModel(env,row,line,side,entityType,profileNamespace,formulaKey){ const prop=String(row.canonical_prop_key||""); const modelKey=`${entityType}|baseline|${Number(row.mlb_player_id||0)}|${prop}|${line}|${side}|${profileNamespace}|${formulaKey}`; if(V2_BASELINE_MODEL_CACHE.has(modelKey)) return V2_BASELINE_MODEL_CACHE.get(modelKey); let result; if(prop==="rfi_nrfi"){ const vals=await loadValuesForHpRow(env,row); result=modelRfiBaseline(vals,line,side); }
  else { const rows=await loadBaselineModelRows(env,row,entityType); result=entityType==="pitcher"?modelPitcherComponent(rows,prop,line,side,null,formulaKey):modelHitterBaseline(rows,prop,line,side,null); }
  const hp=result.prob==null?null:round(clamp(result.prob*100,0,100),2); const conf=result.prob==null?5:round(clamp(result.confidence,1,95),2); const out={...result, baseline_hp_0_100:hp, baseline_confidence_0_100:conf, model_version:BASELINE_V2_FORMULA_VERSION, confidence_version:BASELINE_V2_CONFIDENCE_VERSION, binary_game_rate_replaced:true}; V2_BASELINE_MODEL_CACHE.set(modelKey,out); return out; }
function applyBaselineV2CalibrationGuard({prop, entityType, side, line, hp, confidence, hs, sampleTier}){
  if(hp==null) return {hp, confidence, adjusted:false, block_promotion:false, notes:{}};
  const notes={floor_min_0_05_max_99_95:true, confidence_guard_version:"v0.1.42"};
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

async function runBaselineV2(env,input={}){
  await ensureSchema(env); await ensureBaselineV2Schema(env);
  const requestId=String(input.request_id||rid("baseline_v5")); const runId=String(input.run_id||rid("run"));
  const requestedV5Mode=String(input.mode||input.expansion_mode||"baseline_v5_base");
  const classificationOnly=(requestedV5Mode==="baseline_v5_classification_base" || requestedV5Mode==="baseline_v5_classification_delta");
  const before=await productionCounts(env);
  let batchId=String(input.batch_id||rid("player_baseline_v2_batch"));
  const explicitBatchIdProvided=!!input.batch_id;
  // V5 ignores source_hp_v2_batch_id/read_all_hp_v2_current entirely. The Control Room may still pass
  // those legacy fields, but the worker source is historical static/base/delta only.
  const sourceHpV2BatchId="__BASELINE_V5_HISTORY_ONLY__";
  const readAllHpV2Current=true;
  const requestedChunkSize=Number(input.v2_chunk_size||input.v2_source_chunk_size||0);
  const allCurrentFastDefault=Number(input.v2_all_current_chunk_size||input.v2_fast_chunk_size||160);
  // v0.1.28: full-base all-current was correctly routed in v0.1.27, but the safety clamp
  // capped every continuation at 96 rows. The Control Room already asks for 160; old
  // v0.1.27 partial outputs also carry v2_chunk_size=96, so prefer the larger all-current
  // target on full-base continuation unless an explicit force flag is used. This keeps the
  // active mr08* run usable after deploy: next Wake resumes the same batch at the next cursor,
  // but drains with 160-row chunks instead of staying pinned to the old 96 cap.
  const forcedExactChunk=input.v2_force_exact_chunk_size===true || input.force_v2_chunk_size===true;
  const effectiveRequestedChunk=readAllHpV2Current
    ? (forcedExactChunk ? (requestedChunkSize || allCurrentFastDefault || 40) : Math.max(requestedChunkSize || 0, allCurrentFastDefault || 0, 40))
    : (requestedChunkSize || allCurrentFastDefault || 8);
  const chunkSize=clamp(effectiveRequestedChunk || (readAllHpV2Current?50:8),1,readAllHpV2Current?(forcedExactChunk?50:100):32);
  let cursor=Number(input.v2_cursor_offset||0);
  const startedMs=Date.now();
  // v0.1.33: never let the worker soft-yield equal the orchestrator stale-running threshold (60s).
  // The prior 60s soft yield raced stale recovery and caused duplicate/restarted batches.
  const requestedSoftYieldMs=Number(input.v2_soft_yield_ms || (readAllHpV2Current?14000:18000));
  const softYieldMs=readAllHpV2Current ? 14000 : clamp(requestedSoftYieldMs,8000,25000);
  let reusedRunningBatch=false;
  if(!explicitBatchIdProvided && cursor===0){
    const existing=await first(env.SCORE_DB,`SELECT batch_id, source_rows_read, rows_staged, issue_rows FROM player_baseline_hp_v2_batches WHERE request_id=? AND status IN ('running','partial_continue') ORDER BY datetime(updated_at) DESC LIMIT 1`,requestId);
    if(existing && existing.batch_id){
      batchId=String(existing.batch_id);
      const stageProgress=await first(env.SCORE_DB,`SELECT COUNT(*) AS staged FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
      const issueProgress=await first(env.SCORE_DB,`SELECT COUNT(*) AS issues FROM player_baseline_hp_v2_issues WHERE batch_id=?`,batchId);
      cursor=Math.max(Number(existing.source_rows_read||0), Number(stageProgress&&stageProgress.staged||0)+Number(issueProgress&&issueProgress.issues||0));
      reusedRunningBatch=true;
    }
  }
  async function heartbeatBaselineV2(extra={}){
    try{ await run(env.CONTROL_DB,`UPDATE control_job_queue SET updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='running'`,requestId); }catch(_e){}
    try{ await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET worker_version=?, source_rows_read=?, rows_staged=(SELECT COUNT(*) FROM player_baseline_hp_v2_stage WHERE batch_id=?), issue_rows=(SELECT COUNT(*) FROM player_baseline_hp_v2_issues WHERE batch_id=?), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,cursor,batchId,batchId,batchId); }catch(_e){}
    try{ await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET worker_version=?, rows_staged=(SELECT COUNT(*) FROM player_baseline_sanity_v2_stage WHERE batch_id=?), issue_rows=(SELECT COUNT(*) FROM player_baseline_hp_v2_issues WHERE batch_id=?), updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,VERSION,batchId,batchId,batchId); }catch(_e){}
  }
  if(cursor===0 && !reusedRunningBatch){
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,requestedV5Mode,"running",VERSION);
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,source_sanity_batch_id,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,requestedV5Mode,"running",VERSION,batchId);
    await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`DELETE FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId);
  } else if(reusedRunningBatch){
    await heartbeatBaselineV2({reusedRunningBatch:true});
  }
  // v0.1.43: Baseline V2 must be independent from board/current HP, market, daily context, and app source.
  // Build canonical history inventory directly from historical player rows. The source_queue table is retained
  // only as a batch-local work queue; source_key/source_keys are intentionally NULL.
  const logicalGroupBy=`baseline_formula_scope, COALESCE(mlb_player_id,0), canonical_prop_key, board_line_value, selected_side, profile_namespace, source_formula_key`;
  let queuedSourceRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId))?.c||0);
  let canonicalHistoryQueueBuild=null;
  if(queuedSourceRows===0 && cursor===0){
    await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId);
    canonicalHistoryQueueBuild=await buildCanonicalHistoryBaselineSourceQueue(env,batchId,input);
    queuedSourceRows=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_source_queue WHERE batch_id=?`,batchId))?.c||0);
  }
  const total=queuedSourceRows;
  const rawHpV2SourceRows=0;
  const nullOnlySourceRows=0;
  const rows=await all(env.SCORE_DB,`SELECT hp_v2_row_id,source_key,source_keys,game_pk,official_date,mlb_player_id,player_name,canonical_prop_key,board_line_value,selected_side,factor_family,profile_namespace,source_formula_key,baseline_formula_scope,source_hp_v2_rows,source_hp_v2_batch_ids,source_game_pks FROM player_baseline_hp_v2_source_queue WHERE batch_id=? ORDER BY queue_row_id LIMIT ? OFFSET ?`,batchId,chunkSize,cursor);
  let written=0, issues=0, processed=0;
  const stageStatements=[];
  const stageBatchSize=readAllHpV2Current?40:30;
  async function flushStageStatements(){
    if(stageStatements.length){
      const pending=stageStatements.splice(0, stageStatements.length);
      await batch(env.SCORE_DB,pending,stageBatchSize);
      await heartbeatBaselineV2({flushed:pending.length});
    }
  }
  for(const r of rows){
    if(processed>0 && Date.now()-startedMs>=softYieldMs) break;
    if(processed>0 && processed%5===0) await heartbeatBaselineV2({processed});
    processed++;
    const line=Number(r.board_line_value); const side=String(r.selected_side);
    const entityType=baselineV2EntityType(r);
    const lineBucket=lineThresholdBucketForInventory(r.canonical_prop_key,line);
    const profileNamespace=r.profile_namespace || `${String(entityType).toUpperCase()}_${upperToken(r.canonical_prop_key)}_V2_`;
    const formulaKey=r.source_formula_key || `V2_${upperToken(r.canonical_prop_key)}_DYNAMIC`;
    const values=await loadValuesForHpRow(env,r);
    const hs=hitStatsFor(values,line,side);
    const model=await lockedBaselineModel(env,r,line,side,entityType,profileNamespace,formulaKey);
    const sampleTier=sampleTierV2(model.games || hs.non_push_sample || values.length,r.canonical_prop_key);
    const roleProfile=entityType==="pitcher"?"V2_PITCHER_ENTITY":(entityType==="game_pair"?"V2_GAME_PAIR_ENTITY":"V2_HITTER_ENTITY");
    const canonicalKey=canonicalBaselineKey(r,line,side,profileNamespace,formulaKey);
    const sanityId=`pbs_v2|${canonicalKey}`; const hpId=`pbhp_v2|${canonicalKey}`;
    let confidence=round(clamp(model.baseline_confidence_0_100,1,95),2);
    let post=model.baseline_hp_0_100;
    const calibrationGuard=applyBaselineV2CalibrationGuard({prop:r.canonical_prop_key,entityType,side,line,hp:post,confidence,hs,sampleTier});
    post=calibrationGuard.hp; confidence=calibrationGuard.confidence;
    const calibratedModel={...model, baseline_hp_0_100:post, baseline_confidence_0_100:confidence, calibration_guard_v0_1_34:calibrationGuard};
    const trace={baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",source_formula_key:formulaKey,profile_namespace:profileNamespace,entity_type:entityType,exact_line_value:line,selected_side:side,direct_binary_reference:{...hs},model:calibratedModel,raw_model_before_calibration:model,model_family:"locked_full_prop_baseline_v2",binary_game_rate_replaced:true,calibration_guard_v0_1_34:calibrationGuard,sample_tier:sampleTier,canonical_entity_line_side_key:canonicalKey,baseline_formula_scope:String(r.baseline_formula_scope||""),history_inventory_rows:Number(r.source_hp_v2_rows||1),history_game_pks:String(r.source_game_pks||r.game_pk||""),no_daily_context:true,no_market_context:true,no_scoring_context:true,no_board_context:true,no_app_context:true};
    if(calibrationGuard && calibrationGuard.block_promotion){
      stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_hp_v2_issues (issue_id,batch_id,source_baseline_row_id,severity,issue_code,issue_message,issue_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`cal_pending|${batchId}|${hpId}`,batchId,hpId,"WARN","CALIBRATION_PENDING_SAMPLE60_GAP_GT10","Sample >60 and calibrated HP differs from raw empirical rate by >10 points; block auto-promotion pending calibration audit",safeJson({row:{player_id:r.mlb_player_id,player_name:resolvedPlayerName,canonical_prop_key:r.canonical_prop_key,line_value:line,selected_side:side},trace})));
    }
    if(post==null){ issues++; stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_hp_v2_issues (issue_id,batch_id,source_baseline_row_id,severity,issue_code,issue_message,issue_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(rid("pbhp_v2_issue"),batchId,sanityId,"BLOCK","V2_MODEL_NO_PROBABILITY","Locked baseline model could not emit probability",safeJson({row:r,trace}))); if(stageStatements.length>=stageBatchSize) await flushStageStatements(); continue; }
    const stats=valueStats(values);
    const classification=await classifyBaselineV5(env,r,line,side,entityType,calibratedModel,hs,stats);
    const resolvedPlayerName=safeResolvedPlayerName(r);
    trace.classification_v5=classification;
    trace.classification_contract={replaces_old_sanity:true,history_only:true,uses_batting_order:entityType==="hitter",uses_platoon_splits:true,per_player_prop_line_side:true,keeps_locked_calibration_logic:true,source_mapping_guard_v0_1_48:true};
    const classificationId=`pbc_v5|${canonicalKey}`;
    stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_classification_v5_stage (classification_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,line_value,selected_side,classification_tier,classification_profile_key,sample_profile,volume_profile,lineup_profile,platoon_profile,usage_profile,volatility_profile,classification_confidence_0_100,games_sample,events_sample,pa_per_game,ab_ratio,avg_batting_order,split_delta_0_100,classification_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(classificationId,batchId,entityType,Number(r.mlb_player_id)||null,resolvedPlayerName,r.canonical_prop_key,line,side,classification.classification_tier,classification.classification_profile_key,classification.sample_profile,classification.volume_profile,classification.lineup_profile,classification.platoon_profile,classification.usage_profile,classification.volatility_profile,classification.classification_confidence_0_100,classification.games_sample,classification.events_sample,classification.pa_per_game,classification.ab_ratio,classification.avg_batting_order,classification.split_delta_0_100,safeJson(classification)));
    stageStatements.push(env.SCORE_DB.prepare(`INSERT OR REPLACE INTO player_baseline_sanity_v2_stage (baseline_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,role_profile,prior_pool_key,sanity_profile_key,sample_profile,usage_profile,line_difficulty_profile,volatility_profile,baseline_drag_profile,confidence_drag_profile,variance_profile,games_sample,events_sample,baseline_confidence_0_100,line_baseline_json,distribution_shape_json,notes_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(sanityId,batchId,entityType,Number(r.mlb_player_id)||null,resolvedPlayerName,r.canonical_prop_key,roleProfile,`${profileNamespace}|${side}|${lineBucket}|${classification.classification_tier}|${sampleTier}`,classification.classification_profile_key,sampleTier,(model.games||hs.non_push_sample)>=20?"ESTABLISHED_HISTORY":"LIMITED_HISTORY",lineDifficulty(profileNamespace,line),stats.volatility_profile,"NONE","NONE",stats.volatility_profile,model.games||values.length,model.games||values.length,confidence,safeJson({line,line_rates:{[String(line)]:hs},model:calibratedModel,classification_v5:classification,trace}),safeJson({...stats,model_engine:model.engine}),safeJson(trace)));
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
    const partialOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,read_all_hp_v2_current:readAllHpV2Current,mode:requestedV5Mode,status:"BASELINE_V5_HISTORY_PARTIAL_CONTINUE",certification:"BASELINE_V5_HISTORY_PARTIAL_CONTINUE",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,v2_cursor_offset:next,v2_chunk_size:chunkSize,effective_v2_chunk_size:chunkSize,target_source_rows:total,raw_hp_v2_source_rows:rawHpV2SourceRows,null_only_source_rows:nullOnlySourceRows,pct_done:total?round((next*100)/total,2):null,rows_remaining:Math.max(total-next,0),rows_written:written,rows_staged:staged,issue_rows:issueTotalSoFar,processed_rows:processed,soft_yield_ms:softYieldMs,elapsed_ms:Date.now()-startedMs,stage_write_mode:"CANONICAL_HISTORY_SOURCE_QUEUE_BATCHED_STAGE_INSERTS",canonical_history_queue_build:canonicalHistoryQueueBuild,stage_batch_size:stageBatchSize,fast_safe_chunk_policy:"all_current_fast50_source_queue_soft14_worker_guard",reused_running_batch:reusedRunningBatch,next_input_json:{...input,mode:requestedV5Mode,batch_id:batchId,v2_cursor_offset:next,v2_chunk_size:chunkSize,v2_all_current_chunk_size:allCurrentFastDefault,v2_soft_yield_ms:softYieldMs,fast_safe_chunk_policy:"all_current_fast50_source_queue_soft14_worker_guard"}});
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
  if(calibrationPendingRows>0){
    const blockedOutput=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:requestedV5Mode,status:"BASELINE_V5_HISTORY_BLOCKED_CALIBRATION_REVIEW",certification:"BASELINE_V5_HISTORY_BLOCKED_CALIBRATION_REVIEW",certification_grade:"BLOCKED_CALIBRATION_REVIEW",current_system_mutated:false,source_rows_read:total,raw_hp_v2_source_rows:rawHpV2SourceRows,null_only_source_rows:nullOnlySourceRows,rows_staged:staged,rows_promoted:0,history_rows:0,issue_rows:actualIssueRows,calibration_pending_rows:calibrationPendingRows,mutation_guard:{changed_tables:[]},read_all_hp_v2_current:readAllHpV2Current,canonical_group_by:logicalGroupBy,baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",fast_safe_chunk_policy:"all_current_fast50_source_queue_soft14_worker_guard",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,no_current_promotion:true,stage_shape_repair:stageShapeRepair});
    await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",staged,0,0,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
    await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,"blocked",total,staged,0,0,actualIssueRows,blockedOutput.certification,blockedOutput.certification_grade,safeJson(blockedOutput),batchId);
    blockedOutput.ok=true; blockedOutput.data_ok=true; blockedOutput.completed_blocked=true; return blockedOutput;
  }
  await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_current`); await run(env.SCORE_DB,`DELETE FROM player_baseline_classification_v5_current`); await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_current`);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_current SELECT * FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_classification_v5_current SELECT * FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_current SELECT * FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
  await run(env.SCORE_DB,`INSERT INTO player_baseline_sanity_v2_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId); await run(env.SCORE_DB,`INSERT INTO player_baseline_classification_v5_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_classification_v5_stage WHERE batch_id=?`,batchId);
  await run(env.SCORE_DB,`INSERT INTO player_baseline_hp_v2_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
  const after=await productionCounts(env); const changed=changedCounts(before,after);
  const grade=changed.length?"FAIL_MUTATION_GUARD":(actualIssueRows?"PASS_WITH_WARNINGS":"PASS");
  const cert=changed.length?"BASELINE_V5_HISTORY_BLOCKED_PRODUCTION_MUTATION":"BASELINE_V5_HISTORY_CERTIFIED_PARALLEL_READY";
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:requestedV5Mode,status:cert,certification:cert,certification_grade:grade,current_system_mutated:changed.length>0,source_rows_read:total,raw_hp_v2_source_rows:rawHpV2SourceRows,null_only_source_rows:nullOnlySourceRows,source_hp_v2_batch_id:sourceHpV2BatchId,rows_staged:staged,rows_promoted:staged,history_rows:staged,issue_rows:actualIssueRows,mutation_guard:{changed_tables:changed},reporting_fix_version:"v0.1.30_pitcher_workload_bf_source_soft_caps",read_all_hp_v2_current:readAllHpV2Current,canonical_group_by:logicalGroupBy,baseline_source_policy:"baseline_v5_history_only_static_base_delta_expansion_no_board_no_market_no_daily_no_app",fast_safe_chunk_policy:"all_current_fast50_source_queue_soft14_worker_guard",formula_version:BASELINE_V2_FORMULA_VERSION,confidence_version:BASELINE_V2_CONFIDENCE_VERSION,stage_shape_repair:stageShapeRepair});
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
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_current",`INSERT OR REPLACE INTO expansion_player_baseline_hp_current SELECT * FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,batchId);
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_history",`INSERT INTO expansion_player_baseline_hp_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM expansion_player_baseline_hp_stage WHERE batch_id=?`,batchId);
  const currentCount=await tableCount(env.SCORE_DB,"expansion_player_baseline_hp_current");
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_sanity_batch_id:sourceSanityBatchId,mode:"expansion_delta_hp",status:"EXPANSION_DELTA_HP_COMPLETED",certification:"EXPANSION_DELTA_HP_CERTIFIED_AFFECTED_ROWS_PROMOTED",certification_grade:"PASS",source_rows_read:totalSanityRows,all_sanity_rows_for_prior_pool:allSanity.length,rows_staged:stagedCount,rows_promoted:stagedCount,history_rows:stagedCount,current_hp_rows:currentCount,rows_written:hpRows.length,delta_update:true,no_current_wipe:true,prior_pool_from_all_current_sanity:true,chunked_delta_hp_v0_1_31:true});
  await writeRun(env.SCORE_DB,"expansion_player_baseline_hp_batches",`UPDATE expansion_player_baseline_hp_batches SET status='completed', finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=0, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,totalSanityRows,stagedCount,stagedCount,stagedCount,output.certification,output.certification_grade,safeJson(output),batchId);
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
  if(mode==="baseline_v5_classification_rescue") return runBaselineV5ClassificationRescue(env,input);
  if(mode==="baseline_v5_classification_base" || mode==="baseline_v5_classification_delta" || mode==="baseline_v5_base" || mode==="baseline_v5_delta" || mode==="baseline_v5_history_only" || mode==="baseline_v2_heb" || mode==="expansion_baseline_v2" || mode==="expansion-baseline-v2" || mode==="expansion-baseline-v2-full-run") return runBaselineV2(env,input);
  const jobKey = String(input.job_key || "");
  if (jobKey === "phase3a-first-inning-pitcher-context" || mode === "phase3a-first-inning-pitcher-context" || mode === "legacy_dummy") {
    return {ok:true,data_ok:true,version:VERSION,worker_name:WORKER_NAME,logical_worker_name:LOGICAL_WORKER_NAME,job_key:jobKey || "phase3a-first-inning-pitcher-context",status:"LEGACY_DUMMY_SLOT_READY_NO_MUTATION",certification:"LEGACY_DUMMY_SLOT_READY_NO_MUTATION",rows_read:0,rows_written:0,writes_performed:0,external_calls_performed:0,expansion_only:false,baseline_only:false,no_current_baseline_mutation:true,no_scoring_mutation:true,no_final_board_mutation:true};
  }
  return {ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"UNSUPPORTED_EXPANSION_BASELINE_MODE",mode,allowed_modes:["expansion_baseline_mining","expansion_line_inventory","expansion_baseline_sanity","expansion_baseline_hp","expansion_baseline_certifier","expansion_baseline_full_run","expansion_delta_mining","expansion_delta_sanity","expansion_delta_hp","expansion_delta_full_run","baseline_v5_classification_base","baseline_v5_classification_delta","baseline_v5_classification_rescue","baseline_v5_base","baseline_v5_delta","baseline_v5_history_only","expansion-baseline-v2"]};
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
