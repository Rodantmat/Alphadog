const WORKER_NAME = "alphadog-v2-phase3a-first-inning-pitcher-context";
const LOGICAL_WORKER_NAME = "alphadog-v2-expansion-baseline";
const VERSION = "alphadog-v2-phase3a-first-inning-pitcher-context-v0.1.13-dynamic-v2-fast-safe-throughput";
const EXPANSION_JOB_KEYS = new Set([
  "expansion-baseline-mining",
  "expansion-baseline-sanity",
  "expansion-baseline-hp",
  "expansion-baseline-line-inventory",
  "expansion-baseline-certifier",
  "expansion-baseline-full-run",
  "expansion-baseline-v2",
  "expansion-baseline-v2-full-run"
]);

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "TEAM_DB", "CONTEXT_DB", "SCORE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "MLB_API_BASE_URL"];

const RA_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
const PFS_LINES = [5.5, 10.5, 15.5, 20.5, 25.5, 30.5];
const RFI_LINES = [0.5];
const SIDES = ["more", "less"];

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

async function fetchMlbLinescore(env, gamePk){
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/,"");
  const url = `${base}/game/${gamePk}/linescore`;
  const resp = await fetch(url, { headers: { "accept":"application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDogExpansionBaseline/0.1") } });
  const text = await resp.text();
  if(!resp.ok) throw new Error(`MLB_LINESCORE_HTTP_${resp.status}:${String(text||"").slice(0,180)}`);
  return { url, json: JSON.parse(text) };
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

  await writeRun(env.CONTEXT_DB,"expansion_first_inning_context_batches",`INSERT OR REPLACE INTO expansion_first_inning_context_batches (batch_id,request_id,run_id,mode,status,worker_version,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, batchId, requestId, runId, "expansion_baseline_mining", "running", VERSION);

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

  let gamesWritten=0, pitcherRows=0, issues=0;
  const gameStmts=[];
  const pitcherStmts=[];
  const issueStmts=[];

  for(const g of games){
    const gamePk = Number(g.game_pk);
    if(!gamePk) continue;
    try{
      const fetched = await fetchMlbLinescore(env, gamePk);
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
  const nextCursor = cursor + games.length;
  const done = nextCursor >= totalGames || games.length === 0;
  const output = baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,mode:"expansion_baseline_mining",status:done?"EXPANSION_BASELINE_MINING_COMPLETED":"EXPANSION_BASELINE_MINING_PARTIAL_CONTINUE",certification:done?"EXPANSION_FIRST_INNING_CONTEXT_MINED_FULL_DEPTH":"EXPANSION_FIRST_INNING_CONTEXT_MINING_PARTIAL_CONTINUE",certification_grade:issueTotal>0?"PASS_WITH_WARNINGS":(done?"PASS":"PARTIAL_CONTINUE"),partial_continue:!done,orchestrator_should_self_continue:!done,source_games_total:totalGames,source_games_read:nextCursor,games_requested:totalGames,games_written:totalGameRows,pitcher_rows_written:totalPitcherRows,issue_rows:issueTotal,rows_written:gamesWritten+pitcherRows,mining_cursor_offset:nextCursor,mining_game_chunk_size:chunkSize,next_input_json:!done?{...input,mode:"expansion_baseline_mining",request_id:requestId,run_id:runId,mining_batch_id:batchId,mining_cursor_offset:nextCursor,mining_game_chunk_size:chunkSize,game_limit:maxSourceGames,full_depth_base:true}:null,full_depth_base:true});
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
function qualityStart(r){ return num(r.outs_recorded)>=18 && num(r.earned_runs)<=3 ? 1 : 0; }
function pfsPp(r){ return num(r.outs_recorded) + 3*num(r.strikeouts) + 4*qualityStart(r) - 3*num(r.earned_runs); }
function pfsSl(r){ return num(r.outs_recorded) + 3*num(r.strikeouts) - 3*num(r.earned_runs) - 2*num(r.walks_allowed); }
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
const PITCHER_RAW_PROP_KEYS = new Set(['pitcher_strikeouts','pitcher_outs','pitches_thrown','hits_allowed','earned_runs','walks_allowed','runs_allowed']);
function resolveLineInventory(row){
  const canonical=String(row.canonical_prop_key||'');
  const source=String(row.source_key||'');
  const factor=String(row.factor_family||'');
  const side=String(row.selected_side||'');
  let profileNamespace=null, sourceFormulaKey=null, resolvedFactor=factor||'unknown', status='INVENTORY_ONLY_SOURCE_READY', needs=0, note='inventory observed; source-ready when raw source table supports the canonical prop';
  if(source==='prizepicks' && canonical==='fantasy'){
    profileNamespace='PFS_PP_DYNAMIC_'; sourceFormulaKey='PFS_PP_NO_WIN_DYNAMIC_LINE_FROM_STARTER_HISTORY'; resolvedFactor='pitcher'; status='SOURCE_READY_PITCHER_FANTASY_PP_DYNAMIC'; needs=1; note='PrizePicks fantasy rows are pitcher names despite factor_family=hitter; baseline uses no-win pitcher fantasy from starter_history by locked AlphaDog contract';
  } else if(source==='sleeper' && canonical==='rfi_nrfi'){
    profileNamespace='RFI_SL_'; sourceFormulaKey='RFI_SL_PITCHER_SPECIFIC_0_5'; resolvedFactor='pitcher'; status='SOURCE_READY_RFI_SL'; needs=1; note='Sleeper RFI/NRFI maps to pitcher-specific first-frame expansion profile';
  } else if(source==='prizepicks' && canonical==='rfi_nrfi'){
    profileNamespace='RFI_PP_'; sourceFormulaKey='RFI_PP_GAME_PAIR_0_5'; resolvedFactor='game_pair'; status='SOURCE_READY_RFI_PP'; needs=1; note='PrizePicks RFI/NRFI maps to game-pair expansion profile';
  } else if(source==='prizepicks' && canonical==='fantasy_score'){
    profileNamespace='HFS_PP_DYNAMIC_'; sourceFormulaKey='HITTER_FANTASY_SCORE_PP_DYNAMIC_LINE_FROM_HITTER_GAME_LOGS_WITH_RAW_JSON_HIT_BY_PITCH'; resolvedFactor='hitter'; status='SOURCE_READY_HITTER_FANTASY_PP_DYNAMIC'; needs=1; note='Hitter fantasy source exists in hitter_game_logs; hitByPitch is available in raw_json and must be parsed by HEB formula even though it is not a top-level column';
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
      SUM(CASE WHEN baseline_hp_row_id IS NULL THEN 1 ELSE 0 END) AS missing_baseline_rows
    FROM hit_probability_v2_current
    WHERE board_line_value IS NOT NULL AND canonical_prop_key IS NOT NULL AND selected_side IS NOT NULL
    GROUP BY canonical_prop_key, source_key, COALESCE(factor_family,'unknown'), selected_side, board_line_value
    ORDER BY canonical_prop_key, source_key, selected_side, board_line_value`);
  const stmts=[]; const issues=[];
  let missing=0,dynamicSupported=0,unsupportedMissing=0;
  for(const r of inv){
    const resolved=resolveLineInventory(r);
    missing += Number(r.missing_baseline_rows||0);
    if(Number(r.missing_baseline_rows||0)>0 && resolved.needs) dynamicSupported += Number(r.missing_baseline_rows||0);
    if(Number(r.missing_baseline_rows||0)>0 && !resolved.profileNamespace) unsupportedMissing += Number(r.missing_baseline_rows||0);
    const id=`exp_line_inv|${r.source_key||'source'}|${r.canonical_prop_key}|${r.factor_family||'unknown'}|${r.selected_side}|${String(r.line_value).replace('.','p')}`;
    const notes={baseline_only:true,observed_from:'hit_probability_v2_current',respects_exact_line_value:true,respects_selected_side:true,respects_source_key:true,role_resolution_note:resolved.note};
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
function buildHpRowsForSanityRows(sanityRows, batchId, sourceSanityBatchId){
  const hpRows=[];
  for(const s of sanityRows){
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
        const baselineHp=raw==null?null:round(raw,2);
        const conf=Number(s.baseline_confidence_0_100||0);
        hpRows.push({
          baseline_hp_row_id:`exp_hp|${ns}|${s.entity_id||s.player_id||"pool"}|${s.canonical_prop_key}|${String(line).replace('.','p')}|${side}`,
          batch_id:batchId, source_sanity_batch_id:sourceSanityBatchId, source_baseline_row_id:s.baseline_row_id,
          expansion_scope:"baseline_only_shadow", profile_namespace:ns, source_data_family:s.source_data_family, source_table:s.source_table, source_formula_key:formulaKeyFor(ns), baseline_formula_version:VERSION,
          entity_type:s.entity_type, entity_id:s.entity_id, player_type:s.player_type, player_id:s.player_id, player_name:s.player_name, canonical_prop_key:s.canonical_prop_key, prop_family:propFamilyFor(ns),
          line_value:line, selected_side:side, baseline_hp_0_100:baselineHp, raw_rate_0_100:raw==null?null:round(raw,2), tier_prior_rate_0_100:raw==null?null:round(raw,2), raw_prior_gap_0_100:0,
          baseline_confidence_0_100:conf, baseline_enriched_confidence_0_100:conf, consistency_bonus_0_100:0, soft_uncertainty_reserve_0_100:round(100-conf,1),
          sample_profile:s.sample_profile, role_profile:s.role_profile, sanity_profile_key:s.sanity_profile_key, volatility_profile:s.volatility_profile, variance_profile:s.variance_profile, line_difficulty_profile:lineDifficulty(ns,line), baseline_hp_profile_key:`${ns}${String(side).toUpperCase()}_${String(line).replace('.','P')}_${s.sanity_profile_key}`,
          non_push_sample:nonPush, hit_count:hit, miss_count:miss, push_count:push, prior_strength:0,
          profile_notes_json:safeJson({baseline_only:true,namespace:ns,formula_key:formulaKeyFor(ns),no_daily_context:true,no_market_context:true,no_scoring_context:true}),
          source_snapshot_json:safeJson({source_baseline_row_id:s.baseline_row_id,line_rate:lr})
        });
      }
    }
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
const BASELINE_V2_FORMULA_VERSION = "baseline_v2_heb_v0.1.0_dynamic_inventory_exact_line_bounded_neighbor";
const BASELINE_V2_CONFIDENCE_VERSION = "baseline_v2_confidence_v0.1.0_trace_only_no_hp_drag";
const V2_ENTITY_VALUE_CACHE = new Map();
const V2_PROFILE_PRIOR_CACHE = new Map();
const V2_GLOBAL_VALUE_CACHE = new Map();

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
  if(p==="fantasy") return pfsPp(r);
  if(p==="pitches_thrown") return num(r.pitches);
  if(p==="pitcher_strikeouts") return num(r.strikeouts);
  if(p==="pitcher_outs") return num(r.outs_recorded);
  if(p==="hits_allowed") return num(r.hits_allowed);
  if(p==="earned_runs") return num(r.earned_runs);
  if(p==="walks_allowed") return num(r.walks_allowed);
  if(p==="rfi_nrfi") return num(r.rfi_value);
  return null;
}
function mForProp(prop){ const p=String(prop||""); if(p==="rfi_nrfi") return 50; if(p==="fantasy"||p==="fantasy_score"||p==="hits_runs_rbis") return 35; if(p==="pitches_thrown"||p==="pitcher_outs") return 20; if(p==="triples"||p==="home_runs"||p==="stolen_bases") return 100; return 25; }
function sampleTierV2(n){ if(n<5) return "TINY_SAMPLE"; if(n<20) return "DEVELOPING"; if(n<50) return "ESTABLISHED"; return "ELITE"; }
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
  const rows=await all(env.STATS_HITTER_DB,`SELECT player_id, game_pk, game_date, pa, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json FROM hitter_game_logs WHERE player_id=? ORDER BY game_date`, playerId);
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
    const rows=await all(env.CONTEXT_DB,`SELECT pitcher_id, game_pk, game_date, rfi_sl_more_hit AS rfi_value FROM expansion_first_inning_pitcher_context_current WHERE pitcher_id=? ORDER BY game_date`, playerId);
    const vals=rows.map(r=>num(r.rfi_value)); V2_ENTITY_VALUE_CACHE.set(cacheKey,vals); return vals;
  }
  const rows=await all(env.CONTEXT_DB,`SELECT game_pk, game_date, rfi_pp_more_hit AS rfi_value FROM expansion_first_inning_game_context_current ORDER BY game_date`);
  const vals=rows.map(r=>num(r.rfi_value)); V2_ENTITY_VALUE_CACHE.set(cacheKey,vals); return vals;
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
  const source=String(row.source_key||"");
  const globalKey=`${source}|${prop}|${fam}`;
  if(V2_GLOBAL_VALUE_CACHE.has(globalKey)) return V2_GLOBAL_VALUE_CACHE.get(globalKey);
  let vals=[];
  if(prop==="rfi_nrfi"){
    vals=await loadRfiValues(env,row.source_key,Number(row.mlb_player_id||0));
  } else if(fam==="pitcher" || prop==="fantasy" || prop==="pitches_thrown" || prop.startsWith("pitcher_") || prop==="hits_allowed" || prop==="earned_runs" || prop==="walks_allowed"){
    const rows=await all(env.TEAM_DB,`SELECT outs_recorded, strikeouts, earned_runs, runs_allowed, walks_allowed, hits_allowed, home_runs_allowed, pitches FROM starter_history WHERE started_game=1 ORDER BY game_date LIMIT 5000`);
    vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  } else {
    const rows=await all(env.STATS_HITTER_DB,`SELECT pa, hits, singles, doubles, triples, home_runs, runs, rbi, walks, strikeouts, stolen_bases, total_bases, raw_json FROM hitter_game_logs ORDER BY game_date LIMIT 50000`);
    vals=rows.map(r=>propValueFromRow(prop,r)).filter(v=>v!==null && Number.isFinite(Number(v)));
  }
  V2_GLOBAL_VALUE_CACHE.set(globalKey, vals);
  return vals;
}

async function profilePriorFor(env, row, line, side){
  const prop=String(row.canonical_prop_key||""); const fam=String(row.factor_family||""); const cacheKey=`${row.source_key}|${prop}|${fam}|${line}|${side}`; if(V2_PROFILE_PRIOR_CACHE.has(cacheKey)) return V2_PROFILE_PRIOR_CACHE.get(cacheKey);
  const vals=await globalValuesForPrior(env,row);
  const hs=hitStatsFor(vals,line,side); const out={prior_rate_0_100: hs.raw_rate_0_100==null?50:hs.raw_rate_0_100, support: hs.non_push_sample, source_rows: vals.length}; V2_PROFILE_PRIOR_CACHE.set(cacheKey,out); return out;
}
function profilePriorFromDirectValues(row,line,side,values,hs){
  const n=Number((hs&&hs.non_push_sample)||0);
  const raw=(hs&&hs.raw_rate_0_100!=null)?Number(hs.raw_rate_0_100):null;
  const conservative=(n>=8 && raw!=null) ? clamp((raw*0.65)+(50*0.35),1,99) : 50;
  return {prior_rate_0_100:round(conservative,2), support:n, source_rows:Array.isArray(values)?values.length:0, fast_direct_prior:true, prior_source:"direct_values_shrunk_to_50"};
}

async function runBaselineV2(env,input={}){
  await ensureSchema(env); await ensureBaselineV2Schema(env);
  const requestId=String(input.request_id||rid("baseline_v2")); const runId=String(input.run_id||rid("run"));
  const before=await productionCounts(env);
  const batchId=String(input.batch_id||rid("player_baseline_v2_batch"));
  const requestedChunkSize=Number(input.dynamic_v2_chunk_size || input.v2_chunk_size || 32);
  const fullRunBridgeMode=String(input.mode||"")==="baseline_v2_heb" && String(input.expansion_mode||"")==="baseline_v2_heb" && input.parent_full_run!==false;
  const minFullRunChunkSize=Number(input.dynamic_v2_min_chunk_size || 48);
  const targetFullRunChunkSize=Number(input.dynamic_v2_target_chunk_size || 72);
  const effectiveRequestedChunkSize=fullRunBridgeMode ? Math.max(requestedChunkSize,minFullRunChunkSize,targetFullRunChunkSize) : requestedChunkSize;
  const chunkSize=clamp(effectiveRequestedChunkSize,1,96); const cursor=Number(input.v2_cursor_offset||0);
  const startedMs=Date.now(); const softYieldMs=Number(input.dynamic_v2_soft_yield_ms || 18000);
  const useFastSafePrior=(input.dynamic_v2_fast_safe_prior!==false) && fullRunBridgeMode;
  if(cursor===0){
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"baseline_v2_heb","running",VERSION);
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_batches (batch_id,request_id,run_id,mode,status,worker_version,source_sanity_batch_id,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,batchId,requestId,runId,"baseline_v2_heb","running",VERSION,batchId);
    await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_stage`); await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_stage`);
  }
  const explicitSourceHpV2BatchId=String(input.source_hp_v2_batch_id||input.hp_v2_batch_id||"");
  const fullRunCurrentSource = String(input.mode||"")==="baseline_v2_heb" && String(input.expansion_mode||"")==="baseline_v2_heb" && !explicitSourceHpV2BatchId;
  const sourceBatchRow= explicitSourceHpV2BatchId ? null : await first(env.SCORE_DB,`SELECT batch_id FROM hit_probability_v2_batches ORDER BY datetime(updated_at) DESC LIMIT 1`);
  const sourceHpV2BatchId=String(explicitSourceHpV2BatchId || (fullRunCurrentSource ? "__ALL_HIT_PROBABILITY_V2_CURRENT__" : ((sourceBatchRow&&sourceBatchRow.batch_id)||"")));
  const targetWhereBase=`baseline_hp_row_id IS NULL AND board_line_value IS NOT NULL AND canonical_prop_key IS NOT NULL AND selected_side IS NOT NULL`;
  const targetWhere = sourceHpV2BatchId === "__ALL_HIT_PROBABILITY_V2_CURRENT__" ? targetWhereBase : `${targetWhereBase} AND batch_id=?`;
  const targetParams = sourceHpV2BatchId === "__ALL_HIT_PROBABILITY_V2_CURRENT__" ? [] : [sourceHpV2BatchId];
  const totalRow=await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM (SELECT MAX(hp_v2_row_id) AS hp_v2_row_id FROM hit_probability_v2_current WHERE ${targetWhere} GROUP BY source_key, game_pk, COALESCE(mlb_player_id,0), canonical_prop_key, board_line_value, selected_side, COALESCE(factor_family,'unknown'))`,...targetParams);
  const total=Number(totalRow&&totalRow.c||0);
  const rows=await all(env.SCORE_DB,`SELECT MAX(hp_v2_row_id) AS hp_v2_row_id, source_key, game_pk, MAX(official_date) AS official_date, COALESCE(mlb_player_id,0) AS mlb_player_id, MAX(player_name) AS player_name, canonical_prop_key, board_line_value, selected_side, COALESCE(factor_family,'unknown') AS factor_family FROM hit_probability_v2_current WHERE ${targetWhere} GROUP BY source_key, game_pk, COALESCE(mlb_player_id,0), canonical_prop_key, board_line_value, selected_side, COALESCE(factor_family,'unknown') ORDER BY hp_v2_row_id LIMIT ? OFFSET ?`,...targetParams,chunkSize,cursor);
  const invRows=await all(env.SCORE_DB,`SELECT source_key, canonical_prop_key, factor_family, selected_side, line_value, profile_namespace, source_formula_key, line_threshold_bucket FROM expansion_line_inventory_current`);
  const invMap=new Map();
  for(const inv of invRows){ invMap.set(`${inv.source_key}|${inv.canonical_prop_key}|${inv.factor_family}|${inv.selected_side}|${Number(inv.line_value)}`,inv); }
  let written=0, issues=0, processed=0;
  for(const r of rows){
    if(processed>0 && Date.now()-startedMs>=softYieldMs) break;
    processed++;
    const line=Number(r.board_line_value); const side=String(r.selected_side); const values=await loadValuesForHpRow(env,r); const hs=hitStatsFor(values,line,side);
    const prior=useFastSafePrior?profilePriorFromDirectValues(r,line,side,values,hs):await profilePriorFor(env,r,line,side); const sampleTier=sampleTierV2(hs.non_push_sample); const baseM=mForProp(r.canonical_prop_key); const stats=valueStats(values);
    const nb=boundedNeighborBias(values,line,side,hs.raw_rate_0_100); const adjPrior=clamp(Number(prior.prior_rate_0_100||50)+Number(nb.neighbor_bias_0_100||0),1,99);
    const m=effectiveHebM(hs.hit,hs.miss,adjPrior,baseM);
    const directWeight=hs.non_push_sample>0?round(100*hs.non_push_sample/(hs.non_push_sample+m),2):0;
    const post=posteriorHeb(hs.hit,hs.miss,hs.push,adjPrior,m);
    const entityType=String(r.canonical_prop_key)==="rfi_nrfi" && String(r.source_key)==="prizepicks" ? "game_pair" : ((String(r.factor_family)==="pitcher"||String(r.canonical_prop_key)==="fantasy"||String(r.canonical_prop_key)==="pitches_thrown")?"pitcher":"hitter");
    const profileNsRow=invMap.get(`${r.source_key}|${r.canonical_prop_key}|${r.factor_family}|${side}|${line}`)||null;
    const profileNamespace=profileNsRow&&profileNsRow.profile_namespace || `${String(entityType).toUpperCase()}_${upperToken(r.canonical_prop_key)}_V2_`;
    const formulaKey=profileNsRow&&profileNsRow.source_formula_key || `V2_${upperToken(r.canonical_prop_key)}_DYNAMIC`;
    const roleProfile=entityType==="pitcher"?"V2_PITCHER_ENTITY":(entityType==="game_pair"?"V2_GAME_PAIR_ENTITY":"V2_HITTER_ENTITY");
    const sanityId=`pbs_v2|${r.hp_v2_row_id}`; const hpId=`pbhp_v2|${r.hp_v2_row_id}`;
    const confidence=round(clamp((hs.non_push_sample/(hs.non_push_sample+m))*85 + Math.min(prior.support,100)/100*10,5,95),2);
    const trace={source_key:r.source_key,source_formula_key:formulaKey,profile_namespace:profileNamespace,entity_type:entityType,exact_line_value:line,selected_side:side,direct:{...hs},profile_prior_rate_0_100:prior.prior_rate_0_100,global_prior_rate_0_100:prior.prior_rate_0_100,adjusted_prior_rate_0_100:round(adjPrior,2),neighbor:nb,M:m,base_M:baseM,direct_weight_pct:directWeight,direct_dominance_applied:(m<baseM),sample_tier:sampleTier,profile_support_rows:prior.support,hbp_parse_source:String(r.canonical_prop_key)==="fantasy_score"?"raw_json.hitByPitch":null,no_daily_context:true,no_market_context:true,no_scoring_context:true};
    if(post==null){ issues++; await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_issues (issue_id,batch_id,source_baseline_row_id,severity,issue_code,issue_message,issue_json,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,rid("pbhp_v2_issue"),batchId,sanityId,"BLOCK","V2_NO_DIRECT_OR_PRIOR","No valid direct sample for v2 HEB row",safeJson({row:r,trace})); continue; }
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_stage (baseline_row_id,batch_id,player_type,player_id,player_name,canonical_prop_key,role_profile,prior_pool_key,sanity_profile_key,sample_profile,usage_profile,line_difficulty_profile,volatility_profile,baseline_drag_profile,confidence_drag_profile,variance_profile,games_sample,events_sample,baseline_confidence_0_100,line_baseline_json,distribution_shape_json,notes_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,sanityId,batchId,entityType,Number(r.mlb_player_id)||null,r.player_name,r.canonical_prop_key,roleProfile,`${profileNamespace}|${side}|${profileNsRow&&profileNsRow.line_threshold_bucket||lineThresholdBucketForInventory(r.canonical_prop_key,line)}|${sampleTier}`,`${profileNamespace}${sampleTier}`,sampleTier,hs.non_push_sample>=20?"ESTABLISHED_HISTORY":"LIMITED_HISTORY",lineDifficulty(profileNamespace,line),stats.volatility_profile,"NONE","NONE",stats.volatility_profile,values.length,values.length,confidence,safeJson({line,line_rates:{[String(line)]:hs},trace}),safeJson(stats),safeJson(trace));
    await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_stage (baseline_hp_row_id,batch_id,source_sanity_batch_id,source_baseline_row_id,player_type,player_id,player_name,canonical_prop_key,prop_family,line_value,selected_side,baseline_hp_0_100,hp_adjustment_0_100,raw_rate_0_100,tier_prior_rate_0_100,raw_prior_gap_0_100,baseline_confidence_0_100,baseline_enriched_confidence_0_100,consistency_bonus_0_100,soft_uncertainty_reserve_0_100,sample_profile,role_profile,sanity_profile_key,volatility_profile,variance_profile,line_difficulty_profile,baseline_hp_profile_key,non_push_sample,hit_count,miss_count,push_count,prior_strength,formula_version,confidence_formula_version,no_daily_context,no_market_context,no_scoring_context,profile_notes_json,source_snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,hpId,batchId,batchId,sanityId,entityType,Number(r.mlb_player_id)||null,r.player_name,r.canonical_prop_key,propFamilyV2(r.canonical_prop_key,entityType),line,side,post,0,hs.raw_rate_0_100,round(adjPrior,2),hs.raw_rate_0_100==null?null:round(hs.raw_rate_0_100-adjPrior,2),confidence,confidence,0,round(100-confidence,2),sampleTier,roleProfile,`${profileNamespace}${sampleTier}`,stats.volatility_profile,stats.volatility_profile,lineDifficulty(profileNamespace,line),`${profileNamespace}HEB_${sampleTier}`,hs.non_push_sample,hs.hit,hs.miss,hs.push,m,BASELINE_V2_FORMULA_VERSION,BASELINE_V2_CONFIDENCE_VERSION,safeJson(trace),safeJson({source_rows:values.length,source_formula_key:formulaKey,profile_namespace:profileNamespace}));
    written++;
  }
  const next=cursor+processed;
  const staged=Number((await first(env.SCORE_DB,`SELECT COUNT(*) AS c FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId))?.c||0);
  if(next<total){
    await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET rows_staged=?, issue_rows=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,staged,issues,batchId);
    await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET source_rows_read=?, rows_staged=?, issue_rows=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,next,staged,issues,batchId);
    return baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:"baseline_v2_heb",status:"BASELINE_V2_HEB_PARTIAL_CONTINUE",certification:"BASELINE_V2_HEB_PARTIAL_CONTINUE",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,v2_cursor_offset:next,v2_chunk_size:chunkSize,dynamic_v2_chunk_size:chunkSize,dynamic_v2_target_chunk_size:targetFullRunChunkSize,dynamic_v2_fast_safe_prior:useFastSafePrior,inventory_lookup_rows:invRows.length,rows_written:written,rows_staged:staged,processed_rows:processed,soft_yield_ms:softYieldMs,elapsed_ms:Date.now()-startedMs,next_input_json:{...input,mode:"baseline_v2_heb",batch_id:batchId,v2_cursor_offset:next,v2_chunk_size:chunkSize,dynamic_v2_chunk_size:chunkSize,dynamic_v2_target_chunk_size:targetFullRunChunkSize,dynamic_v2_min_chunk_size:minFullRunChunkSize,dynamic_v2_fast_safe_prior:useFastSafePrior}});
  }
  await run(env.SCORE_DB,`DELETE FROM player_baseline_sanity_v2_current`); await run(env.SCORE_DB,`DELETE FROM player_baseline_hp_v2_current`);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_sanity_v2_current SELECT * FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId);
  await run(env.SCORE_DB,`INSERT OR REPLACE INTO player_baseline_hp_v2_current SELECT * FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
  await run(env.SCORE_DB,`INSERT INTO player_baseline_sanity_v2_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_sanity_v2_stage WHERE batch_id=?`,batchId);
  await run(env.SCORE_DB,`INSERT INTO player_baseline_hp_v2_history SELECT *, CURRENT_TIMESTAMP AS archived_at FROM player_baseline_hp_v2_stage WHERE batch_id=?`,batchId);
  const after=await productionCounts(env); const changed=changedCounts(before,after); const grade=changed.length?"FAIL_MUTATION_GUARD":(issues?"PASS_WITH_WARNINGS":"PASS");
  const cert=changed.length?"BASELINE_V2_HEB_BLOCKED_PRODUCTION_MUTATION":"BASELINE_V2_HEB_CERTIFIED_PARALLEL_READY";
  const output=baseOutput(input,{request_id:requestId,run_id:runId,batch_id:batchId,source_hp_v2_batch_id:sourceHpV2BatchId,mode:"baseline_v2_heb",status:cert,certification:cert,certification_grade:grade,current_system_mutated:changed.length>0,source_rows_read:total,source_hp_v2_batch_id:sourceHpV2BatchId,rows_staged:staged,rows_promoted:staged,history_rows:staged,issue_rows:issues,mutation_guard:{changed_tables:changed},formula_version:BASELINE_V2_FORMULA_VERSION});
  await run(env.SCORE_DB,`UPDATE player_baseline_sanity_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,changed.length?"blocked":"completed",staged,staged,staged,issues,cert,grade,safeJson(output),batchId);
  await run(env.SCORE_DB,`UPDATE player_baseline_hp_v2_batches SET status=?, finished_at=CURRENT_TIMESTAMP, source_rows_read=?, rows_staged=?, rows_promoted=?, history_rows=?, issue_rows=?, certification=?, certification_grade=?, output_json=?, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`,changed.length?"blocked":"completed",total,staged,staged,staged,issues,cert,grade,safeJson(output),batchId);
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
  const dynamicV2HpRows=await tableCount(env.SCORE_DB,"player_baseline_hp_v2_current");
  const sanityNs=await all(env.SCORE_DB,`SELECT profile_namespace, COUNT(*) AS rows FROM expansion_player_baseline_sanity_current GROUP BY profile_namespace ORDER BY profile_namespace`);
  const hpNs=await all(env.SCORE_DB,`SELECT profile_namespace, selected_side, COUNT(*) AS rows FROM expansion_player_baseline_hp_current GROUP BY profile_namespace, selected_side ORDER BY profile_namespace, selected_side`);
  const dynamicV2Props=await all(env.SCORE_DB,`SELECT canonical_prop_key, COUNT(*) AS rows, COUNT(DISTINCT player_id) AS players, COUNT(DISTINCT line_value) AS line_values, COUNT(DISTINCT selected_side) AS sides FROM player_baseline_hp_v2_current GROUP BY canonical_prop_key ORDER BY canonical_prop_key`);
  const dynamicV2PropSet=new Set(dynamicV2Props.map(r=>String(r.canonical_prop_key||'')));
  const dynamicInventoryTargets=await all(env.SCORE_DB,`SELECT canonical_prop_key, COUNT(*) AS inventory_rows, SUM(source_rows) AS source_rows, SUM(missing_baseline_rows) AS old_baseline_missing_rows FROM expansion_line_inventory_current WHERE canonical_prop_key IN ('fantasy','fantasy_score','rfi_nrfi','plate_appearances') GROUP BY canonical_prop_key ORDER BY canonical_prop_key`);
  const dynamicInventorySet=new Set(dynamicInventoryTargets.map(r=>String(r.canonical_prop_key||'')));
  const required=["RA_","PFS_PP_","PFS_SL_","RFI_PP_","RFI_SL_"];
  const requiredDynamicProps=["fantasy","fantasy_score","rfi_nrfi","plate_appearances"];
  const sanitySet=new Set(sanityNs.map(r=>String(r.profile_namespace)));
  const hpSideSet=new Set(hpNs.map(r=>`${r.profile_namespace}:${r.selected_side}`));
  const blockers=[]; const warnings=[];
  for(const ns of required){ if(!sanitySet.has(ns)) blockers.push(`missing_sanity_namespace_${ns}`); if(!hpSideSet.has(`${ns}:more`)) blockers.push(`missing_hp_more_${ns}`); if(!hpSideSet.has(`${ns}:less`)) blockers.push(`missing_hp_less_${ns}`); }
  for(const prop of requiredDynamicProps){ if(dynamicInventorySet.has(prop) && !dynamicV2PropSet.has(prop)) blockers.push(`missing_dynamic_v2_baseline_prop_${prop}`); }
  if(!gameRows) warnings.push("no_first_inning_game_context_rows_currently_available");
  if(!pitcherRows) warnings.push("no_first_inning_pitcher_context_rows_currently_available");
  if(!lineInventoryRows) warnings.push("no_expansion_line_inventory_rows_currently_available");
  if(dynamicInventoryTargets.length && !dynamicV2HpRows) blockers.push("no_player_baseline_hp_v2_rows_for_dynamic_inventory");
  if(!sanityRows) blockers.push("no_expansion_sanity_rows");
  if(!hpRows) blockers.push("no_expansion_hp_rows");
  if(changed.length) blockers.push("production_mutation_guard_failed");
  const pass = blockers.length===0;
  const output = baseOutput(input,{mode:"expansion_baseline_certifier",status:pass?"EXPANSION_BASELINE_CERTIFIED_SHADOW_BASELINE_READY":"EXPANSION_BASELINE_CERTIFIER_BLOCKED",certification:pass?"EXPANSION_BASELINE_CERTIFIED_SHADOW_BASELINE_READY":"EXPANSION_BASELINE_CERTIFIER_BLOCKED",certification_grade:pass?(warnings.length?"PASS_WITH_WARNINGS":"PASS"):(changed.length?"FAIL_MUTATION_GUARD":"FAIL_BLOCKED"),current_system_mutated:changed.length>0,dynamic_v2_heb_required:true,dynamic_v2_heb_bridge_preferred_by_score_audit:true,rows:{first_inning_game_context_rows:gameRows,first_inning_pitcher_context_rows:pitcherRows,line_inventory_rows:lineInventoryRows,line_inventory_issue_rows:lineInventoryIssues,sanity_rows:sanityRows,baseline_hp_rows:hpRows,dynamic_v2_hp_rows:dynamicV2HpRows},coverage:{sanity:sanityNs,hp:hpNs,dynamic_v2_props:dynamicV2Props,dynamic_inventory_targets:dynamicInventoryTargets},mutation_guard:{passed:changed.length===0,changed_tables:changed,production_counts_after:after},warnings,blockers});
  output.ok = pass;
  output.data_ok = pass;
  return output;
}

async function fullRun(env,input={}){
  const requestId=String(input.request_id||rid("expansion_baseline_full"));
  const runId=String(input.run_id||rid("run"));
  const state=input.expansion_full_run_state || {};
  const before=input.production_counts_before || state.production_counts_before || await productionCounts(env);
  let mining=null, lineInventory=null, sanity=null, hp=null, dynamicV2=null;
  let sourceSanityBatchId=input.source_sanity_batch_id || state.source_sanity_batch_id || null;

  if(!state.mining_completed){
    mining = await mineFirstInningContext(env,{...input, mode:"expansion_baseline_mining", request_id:requestId, run_id:runId, mining_batch_id:input.mining_batch_id || state.mining_batch_id || null, mining_cursor_offset:input.mining_cursor_offset || state.mining_cursor_offset || 0, mining_game_chunk_size:input.mining_game_chunk_size || state.mining_game_chunk_size || 60});
    if(mining && mining.partial_continue){
      const nextInput={...input, mode:"expansion_baseline_full_run", expansion_mode:"expansion_baseline_full_run", request_id:requestId, run_id:runId, production_counts_before:before, mining_batch_id:mining.batch_id, mining_cursor_offset:mining.mining_cursor_offset, mining_game_chunk_size:mining.mining_game_chunk_size || 60, game_limit:mining.source_games_total || input.game_limit || input.max_games || 2500, full_depth_base:true, expansion_full_run_state:{mining_completed:false,line_inventory_completed:false,sanity_completed:false,hp_completed:false,dynamic_v2_completed:false,mining_batch_id:mining.batch_id,mining_cursor_offset:mining.mining_cursor_offset,mining_game_chunk_size:mining.mining_game_chunk_size || 60,production_counts_before:before}};
      return baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_baseline_full_run",status:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_MINING",certification:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_MINING",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,next_input_json:nextInput,mining,rows_written:Number(mining.rows_written||0),current_system_mutated:false,full_depth_base:true,dynamic_v2_heb_included_in_full_run:true});
    }
    lineInventory = await runLineInventory(env,{...input, mode:"expansion_line_inventory", request_id:requestId, run_id:runId});
    sanity = await runSanity(env,{...input, mode:"expansion_baseline_sanity", request_id:requestId, run_id:runId});
    sourceSanityBatchId = sanity.batch_id;
  } else if(!state.line_inventory_completed) {
    lineInventory = await runLineInventory(env,{...input, mode:"expansion_line_inventory", request_id:requestId, run_id:runId});
  } else {
    lineInventory = state.line_inventory || "previous_call_completed";
    sanity = state.sanity || "previous_call_completed";
  }

  if(!state.hp_completed){
    hp = await runHp(env,{...input, mode:"expansion_baseline_hp", request_id:requestId, run_id:runId, source_sanity_batch_id:sourceSanityBatchId, batch_id:input.hp_batch_id || state.hp_batch_id || input.batch_id || null, hp_cursor_offset:input.hp_cursor_offset || 0, hp_source_chunk_size:input.hp_source_chunk_size || 60});
    if(hp && hp.partial_continue){
      const nextInput={...input, mode:"expansion_baseline_full_run", expansion_mode:"expansion_baseline_full_run", request_id:requestId, run_id:runId, production_counts_before:before, source_sanity_batch_id:sourceSanityBatchId, hp_batch_id:hp.batch_id, hp_cursor_offset:hp.hp_cursor_offset, hp_source_chunk_size:hp.hp_source_chunk_size || 60, expansion_full_run_state:{mining_completed:true,line_inventory_completed:true,sanity_completed:true,hp_completed:false,dynamic_v2_completed:false,source_sanity_batch_id:sourceSanityBatchId,production_counts_before:before,hp_batch_id:hp.batch_id}};
      return baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_baseline_full_run",status:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_HP",certification:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_HP",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,next_input_json:nextInput,hp,rows_written:Number(hp.rows_written||0),current_system_mutated:false,dynamic_v2_heb_included_in_full_run:true});
    }
  } else {
    hp = state.hp || "previous_call_completed";
  }

  if(!state.dynamic_v2_completed){
    dynamicV2 = await runBaselineV2(env,{...input, mode:"baseline_v2_heb", expansion_mode:"baseline_v2_heb", request_id:requestId, run_id:runId, batch_id:input.dynamic_v2_batch_id || state.dynamic_v2_batch_id || input.v2_batch_id || null, v2_cursor_offset:input.v2_cursor_offset || 0, dynamic_v2_chunk_size:Number(input.dynamic_v2_chunk_size || input.v2_chunk_size || 72), dynamic_v2_min_chunk_size:Number(input.dynamic_v2_min_chunk_size || 48), dynamic_v2_target_chunk_size:Number(input.dynamic_v2_target_chunk_size || 72), dynamic_v2_fast_safe_prior:input.dynamic_v2_fast_safe_prior!==false, v2_chunk_size:Number(input.v2_chunk_size || input.dynamic_v2_chunk_size || 72)});
    if(dynamicV2 && dynamicV2.partial_continue){
      const nextInput={...input, mode:"expansion_baseline_full_run", expansion_mode:"expansion_baseline_full_run", request_id:requestId, run_id:runId, production_counts_before:before, source_sanity_batch_id:sourceSanityBatchId, hp_batch_id:(hp && hp.batch_id) || input.hp_batch_id || state.hp_batch_id || null, dynamic_v2_batch_id:dynamicV2.batch_id, v2_cursor_offset:dynamicV2.v2_cursor_offset, dynamic_v2_chunk_size:dynamicV2.v2_chunk_size || input.dynamic_v2_chunk_size || 32, dynamic_v2_min_chunk_size:input.dynamic_v2_min_chunk_size || 48, dynamic_v2_target_chunk_size:input.dynamic_v2_target_chunk_size || 72, dynamic_v2_fast_safe_prior:input.dynamic_v2_fast_safe_prior!==false, v2_chunk_size:dynamicV2.v2_chunk_size || input.v2_chunk_size || 72, expansion_full_run_state:{mining_completed:true,line_inventory_completed:true,sanity_completed:true,hp_completed:true,dynamic_v2_completed:false,source_sanity_batch_id:sourceSanityBatchId,production_counts_before:before,hp_batch_id:(hp && hp.batch_id) || input.hp_batch_id || state.hp_batch_id || null,dynamic_v2_batch_id:dynamicV2.batch_id}};
      return baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_baseline_full_run",status:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_DYNAMIC_V2_HEB",certification:"EXPANSION_BASELINE_FULL_RUN_PARTIAL_CONTINUE_DYNAMIC_V2_HEB",certification_grade:"PARTIAL_CONTINUE",partial_continue:true,orchestrator_should_self_continue:true,next_input_json:nextInput,dynamic_v2_heb:dynamicV2,rows_written:Number(dynamicV2.rows_written||0),current_system_mutated:false,dynamic_v2_heb_included_in_full_run:true});
    }
  } else {
    dynamicV2 = state.dynamic_v2 || "previous_call_completed";
  }

  const cert = await certifier(env,{...input, mode:"expansion_baseline_certifier", request_id:requestId, run_id:runId, production_counts_before:before});
  const pass = !!(cert && cert.ok === true);
  const output = baseOutput(input,{request_id:requestId,run_id:runId,mode:"expansion_baseline_full_run",status:pass?"EXPANSION_BASELINE_FULL_RUN_COMPLETED":"EXPANSION_BASELINE_FULL_RUN_BLOCKED",certification:cert.certification,certification_grade:cert.certification_grade,stages:{mining: mining || "previous_call_completed", line_inventory: lineInventory || "previous_call_completed", sanity: sanity || "previous_call_completed", hp, dynamic_v2_heb:dynamicV2, certifier:cert},dynamic_v2_heb_included_in_full_run:true,dynamic_v2_heb_bridge_preferred_by_score_audit:true,rows_written:Number(hp&&hp.rows_written||0)+Number(dynamicV2&&dynamicV2.rows_written||0),current_system_mutated:cert.current_system_mutated});
  output.ok = pass;
  output.data_ok = pass;
  return output;
}

async function runMode(env,input={}){
  await ensureSchema(env);
  const mode=String(input.mode || input.expansion_mode || input.job_key || "expansion_baseline_full_run");
  if(mode==="expansion_baseline_mining" || mode==="expansion-baseline-mining") return mineFirstInningContext(env,input);
  if(mode==="expansion_baseline_sanity" || mode==="expansion-baseline-sanity") return runSanity(env,input);
  if(mode==="expansion_baseline_hp" || mode==="expansion-baseline-hp") return runHp(env,input);
  if(mode==="expansion_line_inventory" || mode==="expansion-baseline-line-inventory") return runLineInventory(env,input);
  if(mode==="expansion_baseline_certifier" || mode==="expansion-baseline-certifier") return certifier(env,input);
  if(mode==="expansion_baseline_full_run" || mode==="expansion-baseline-full-run") return fullRun(env,input);
  if(mode==="baseline_v2_heb" || mode==="expansion_baseline_v2" || mode==="expansion-baseline-v2" || mode==="expansion-baseline-v2-full-run") return runBaselineV2(env,input);
  const jobKey = String(input.job_key || "");
  if (jobKey === "phase3a-first-inning-pitcher-context" || mode === "phase3a-first-inning-pitcher-context" || mode === "legacy_dummy") {
    return {ok:true,data_ok:true,version:VERSION,worker_name:WORKER_NAME,logical_worker_name:LOGICAL_WORKER_NAME,job_key:jobKey || "phase3a-first-inning-pitcher-context",status:"LEGACY_DUMMY_SLOT_READY_NO_MUTATION",certification:"LEGACY_DUMMY_SLOT_READY_NO_MUTATION",rows_read:0,rows_written:0,writes_performed:0,external_calls_performed:0,expansion_only:false,baseline_only:false,no_current_baseline_mutation:true,no_scoring_mutation:true,no_final_board_mutation:true};
  }
  return {ok:false,data_ok:false,version:VERSION,worker_name:WORKER_NAME,status:"UNSUPPORTED_EXPANSION_BASELINE_MODE",mode,allowed_modes:["expansion_baseline_mining","expansion_line_inventory","expansion_baseline_sanity","expansion_baseline_hp","expansion_baseline_certifier","expansion_baseline_full_run","baseline_v2_heb","expansion-baseline-v2"]};
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
