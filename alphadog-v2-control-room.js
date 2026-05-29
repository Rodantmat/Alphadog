const SYSTEM_VERSION = "alphadog-v2-control-room-v1.6.142-market-teams-button";
function nowIso() { return new Date().toISOString(); }

const DB_BINDINGS = [
  "CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB",
  "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"
];

const EXPECTED_VARS = [
  "SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON",
  "DEFAULT_DAY_SCOPE", "DEFAULT_SLATE_MODE", "ODDS_API_BASE_URL", "PARLAY_API_BASE_URL", "MLB_API_BASE_URL",
  "PRIZEPICKS_SOURCE_MODE", "MAX_TICK_MS", "MAX_API_CALLS_PER_TICK", "MAX_ROWS_PER_TICK", "LOCK_STALE_MINUTES",
  "WORKER_SAFE_MODE", "DEBUG_MODE", "MANUAL_SQL_ENABLED", "CONFIG_PHASE"
];

const EXPECTED_SECRETS = [
  "ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "ODDS_API_KEY", "PARLAY_API_KEY", "GEMINI_API_KEY",
  "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH", "GITHUB_PRIZEPICKS_PATH", "MLB_API_USER_AGENT"
];

const SERVICE_BINDINGS = ["ORCHESTRATOR_WORKER"];

const CONTROL_ROOM_HTML = "<!DOCTYPE html>\n<html>\n<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>AlphaDog V2 Control Room</title>\n<!-- alphadog-v2-control-room-v1.6.142-market-teams-button -->\n<style>\n:root{--bg:#0b0f14;--line:#30363d;--green:#00ff88;--white:#fff;--muted:#aaa;--debug:#8957e5;--check:#238636;--audit:#0f766e;--sql:#d29922;--clean:#da3633;--orch:#0969da}\n*{box-sizing:border-box}\nbody{background:var(--bg);color:var(--green);font-family:monospace;padding:8px;margin:0;max-width:100vw;overflow-x:hidden}\nh2{font-size:18px;color:var(--green);letter-spacing:.045em;margin:10px 0 8px 0}\nh3{color:var(--white);font-size:12px;letter-spacing:.045em;margin:7px 0}\n.section{border-top:1px solid var(--line);padding-top:7px;margin-top:9px}\n.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;width:100%}\nbutton{min-width:0;width:100%;padding:4px 1px;font-size:10.5px;border:0;border-radius:5px;background:#1f6feb;color:var(--white);min-height:31px;white-space:normal;overflow:hidden;text-overflow:clip;line-height:1.0;display:flex;align-items:center;justify-content:center;text-align:center;word-break:normal}\n.clean{background:var(--clean)}.check{background:var(--check)}.sql{background:var(--sql)}.debug{background:var(--debug)}.audit{background:var(--audit)}.orch{background:var(--orch)}\n.copy{background:var(--debug);width:100%;margin-top:6px;min-height:34px;font-size:11px}\ninput,textarea{width:100%;box-sizing:border-box;background:#111;color:var(--green);border:1px solid var(--line);border-radius:6px;margin-top:6px;padding:7px;font-size:12px}\ntextarea{height:82px}\npre{background:#000;color:var(--green);padding:8px;margin-top:8px;overflow:auto;max-height:420px;min-height:150px;border:1px solid var(--line);border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:11px}\n.status{background:#111;color:var(--white);padding:7px;border-radius:6px;border:1px solid var(--line);margin:7px 0;white-space:pre-wrap;font-size:11px}\n.small,.muted{font-size:10px;color:var(--muted)}\n#versionTag{color:#9ae6b4;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.035em;margin-top:5px;margin-bottom:8px}\ntextarea#sqlInput, textarea{user-select:text;-webkit-user-select:text;pointer-events:auto}\n@media (max-width:430px){body{padding:8px}.grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}button{font-size:10px;min-height:30px;padding:3px 1px;border-radius:5px}h2{font-size:17px}h3{font-size:11px}.small,.muted{font-size:9.5px}}\n@media (max-width:370px){button{font-size:9.2px;min-height:29px}.grid{gap:2px}}\n</style>\n</head>\n<body>\n<h2>ALPHADOG CONTROL ROOM</h2>\n<div id=\"versionTag\">alphadog-v2-control-room-v1.6.142-market-teams-button</div>\n<div class=\"small\">PT Now: <span id=\"ptNowLabel\"></span></div>\n<div class=\"small\">Slate: AUTO by game date/time.</div>\n<div class=\"status\" id=\"status\">READY</div>\n\n<div class=\"section\"><h3>DEBUG</h3><div class=\"grid\">\n<button class=\"debug\" type=\"button\" onclick=\"debugConfig()\">Config</button>\n<button class=\"debug\" type=\"button\" onclick=\"health()\">Health</button>\n<button class=\"debug\" type=\"button\" onclick=\"diagnostic()\">Diag</button>\n<button class=\"debug\" type=\"button\" onclick=\"testSQL()\">SQL</button>\n<button class=\"debug\" type=\"button\" onclick=\"reloadPage()\">Reload</button>\n</div></div>\n\n<div class=\"section\"><h3>V2 BOOTSTRAP / SCHEMA</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Schema','v2_schema_status')\">Schema</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Workers','v2_worker_registry')\">Workers</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Config','v2_config_summary')\">Config</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Phases','v2_phase_state')\">Phases</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Markets','v2_market_sources')\">Markets</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Props','v2_prop_taxonomy')\">Props</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Certs','v2_certification_rules')\">Certs</button>\n<button class=\"debug\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Bindings','v2_bindings_check')\">Bindings</button>\n</div></div>\n\n<div class=\"section\"><h3>ORCHESTRATOR</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Status','orchestrator_status')\">Status</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Enqueue','orchestrator_enqueue_test')\">Enqueue</button>\n<button class=\"orch\" type=\"button\" onclick=\"runOrchestratorWake()\">Wake</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Logs','orchestrator_logs')\">Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Health','orchestrator_health')\">OHealth</button>\n</div></div>\n\n<div class=\"section\"><h3>BOARD</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BOARD > PrizePicks','orchestrator_enqueue_prizepicks_github_board')\">PrizePicks</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BOARD > Sleeper','orchestrator_enqueue_parlay_sleeper_board')\">Sleeper</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('BOARD > Full Run','orchestrator_enqueue_board_full_run')\">Full Run</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('BOARD > Prep','orchestrator_enqueue_score_prep')\">Prep</button>\n</div></div>\n\n<div class=\"section\"><h3>MARKET CONTEXT</h3><div class=\"grid\">\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('MARKET > Teams','orchestrator_enqueue_market_context_source_probe')\">Teams</button>\n</div></div>\n\n<div class=\"section\"><h3>DAILY JOBS</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Game Status','orchestrator_enqueue_daily_games_status')\">Game Status</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Starters','orchestrator_enqueue_daily_probable_pitchers')\">Starters</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Lineups','orchestrator_enqueue_daily_lineups')\">Lineups</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Availability','orchestrator_enqueue_daily_player_availability')\">Availability</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Weather / Roof','orchestrator_enqueue_daily_weather')\">Weather / Roof</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Bullpen','orchestrator_enqueue_daily_bullpen_availability')\">Bullpen</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Team Spot','orchestrator_enqueue_daily_team_schedule_spot')\">Team Spot</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Umpire','orchestrator_enqueue_daily_umpire_context')\">Umpire</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Context Cert','orchestrator_enqueue_daily_context_certifier')\">Context Cert</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('DAILY JOBS > Full Run','orchestrator_enqueue_daily_context_full_run')\">Full Run</button>\n</div></div>\n\n<div class=\"section\"><h3>STATIC</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Teams','orchestrator_enqueue_static_teams')\">Teams</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Stadiums','orchestrator_enqueue_static_stadiums')\">Stadiums</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Park Factors','orchestrator_enqueue_static_park_factors')\">Park Factors</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Players','orchestrator_enqueue_static_players')\">Players</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Prop Taxonomy','orchestrator_enqueue_static_prop_taxonomy')\">Prop Tax</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('STATIC > Certifier','orchestrator_enqueue_static_certifier')\">Certifier</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('STATIC > Full Run','orchestrator_enqueue_static_full_run')\">Full Run</button>\n</div></div>\n\n<div class=\"section\"><h3>BASE JOBS</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Calendar','orchestrator_enqueue_base_calendar')\">Calendar</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Hitter Game Logs','orchestrator_enqueue_base_hitter_game_logs')\">Hitter Game Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Hitter Metrics','orchestrator_enqueue_base_hitter_metrics')\">Hitter Metrics</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Pitcher Game Logs','orchestrator_enqueue_base_pitcher_game_logs')\">Pitcher Game Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Pitcher Metrics','orchestrator_enqueue_base_pitcher_metrics')\">Pitcher Metrics</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Team Game Logs','orchestrator_enqueue_base_team_game_logs')\">Team Game Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Starter History','orchestrator_enqueue_base_starter_history')\">Starter History</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Bullpen History','orchestrator_enqueue_base_bullpen_history')\">Bullpen History</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Hitter Splits','orchestrator_enqueue_base_hitter_splits')\">Hitter Splits</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Pitcher Splits','orchestrator_enqueue_base_pitcher_splits')\">Pitcher Splits</button>\n</div></div>\n\n<div class=\"section\"><h3>DELTA / REPAIR JOBS</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Calendar','orchestrator_enqueue_delta_calendar')\">Calendar</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Hitter Game Logs','orchestrator_enqueue_delta_hitter_game_logs')\">Hitter Game Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Hitter Metrics','orchestrator_enqueue_delta_hitter_metrics')\">Hitter Metrics</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Pitcher Metrics','orchestrator_enqueue_delta_pitcher_metrics')\">Pitcher Metrics</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Pitcher Game Logs','orchestrator_enqueue_delta_pitcher_game_logs')\">Pitcher Game Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Team Game Logs','orchestrator_enqueue_delta_team_game_logs')\">Team Game Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Hitter Splits','orchestrator_enqueue_delta_hitter_splits')\">Hitter Splits</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Pitcher Splits','orchestrator_enqueue_delta_pitcher_splits')\">Pitcher Splits</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('DELTA > Full Run','orchestrator_enqueue_incremental_morning_full_run')\">Full Run</button>\n</div></div>\n\n<div class=\"section\"><h3>V2 SAFE ACTIONS</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Queue','v2_queue_status')\">Queue</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Locks','v2_lock_status')\">Locks</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Snap','v2_health_snapshot')\">Snap</button>\n<button class=\"clean\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Clear Q','v2_clear_open_queue')\">Clear Q</button>\n</div></div>\n\n<div class=\"section\"><h3>MANUAL SQL</h3>\n<div class=\"muted\">Output guard active: max 50 rows. Optional first line: -- db: CONFIG_DB</div>\n<textarea id=\"sqlInput\" spellcheck=\"false\" autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"none\" inputmode=\"text\"></textarea>\n<div class=\"grid\">\n<button class=\"sql\" type=\"button\" onclick=\"runManualSQL()\">Run</button>\n<button class=\"debug\" type=\"button\" onclick=\"clearSqlInput()\">Clear</button>\n<button class=\"debug\" type=\"button\" onclick=\"selectSqlInput()\">Select</button>\n<button class=\"debug\" type=\"button\" onclick=\"loadExampleSQL()\">Example</button>\n</div></div>\n\n<pre id=\"output\">Output will appear here.</pre>\n<button class=\"copy\" type=\"button\" onclick=\"copyOutput()\">COPY OUTPUT</button>\n\n<script>\nconst BASE=\"https://alphadog-v2-control-room.rodolfoaamattos.workers.dev\";\nconst JOB_URL=BASE+\"/tasks/run\";\nconst SQL_URL=BASE+\"/debug/sql\";\nconst HEALTH_URL=BASE+\"/health\";\nconst DIAGNOSTIC_URL=BASE+\"/diagnostic\";\nconst ORCH_BASE=\"https://alphadog-v2-orchestrator.rodolfoaamattos.workers.dev\";\nconst ORCH_TICK_URL=ORCH_BASE+\"/tick\";\n\nfunction ptParts(){\n  const parts=new Intl.DateTimeFormat(\"en-CA\",{timeZone:\"America/Los_Angeles\",year:\"numeric\",month:\"2-digit\",day:\"2-digit\",hour:\"2-digit\",minute:\"2-digit\",second:\"2-digit\",hour12:false}).formatToParts(new Date());\n  const m={};\n  parts.forEach(p=>m[p.type]=p.value);\n  return {date:m.year+\"-\"+m.month+\"-\"+m.day,hour:Number(m.hour),time:m.hour+\":\"+m.minute+\":\"+m.second};\n}\nfunction updateClock(){\n  const p=ptParts();\n  const el=document.getElementById(\"ptNowLabel\");\n  if(el) el.textContent=p.date+\" \"+p.time;\n}\nfunction autoSlateContext(){\n  const p=ptParts();\n  let band=\"same-day dominant\";\n  if(p.hour>=12&&p.hour<20) band=\"split slate likely; workers resolve by game date/time\";\n  if(p.hour>=20||p.hour<4) band=\"next-day dominant likely; workers resolve by game date/time\";\n  return {mode:\"AUTO_BY_GAME_DATE_TIME\",pt_now:p,slate_band_hint:band,note:\"Control Room no longer manually overrides slate. Data workers resolve pickability by actual game date/time and board availability.\"};\n}\nfunction setStatus(m){\n  const el=document.getElementById(\"status\");\n  if(el) el.textContent=\"[\"+new Date().toLocaleTimeString()+\"] \"+m;\n}\nfunction setOutput(l,o){\n  const out = [\n    \"ACTION: \"+l,\n    \"TIME: \"+new Date().toISOString(),\n    \"\",\n    (typeof o===\"string\"?o:JSON.stringify(o,null,2))\n  ].join(\"\\n\");\n  document.getElementById(\"output\").textContent=out;\n  window.scrollTo(0,document.body.scrollHeight);\n}\nfunction loading(l,e){\n  setStatus(\"RUNNING: \"+l);\n  setOutput(l,\"Loading...\"+(e?String.fromCharCode(10)+e:\"\"));\n}\nfunction debugConfig(){\n  setOutput(\"DEBUG > Config\",{base:BASE,auto_slate:autoSlateContext(),access_mode:\"single-user-admin-token-disabled\",orchestrator_mode:\"backend-scheduled-continuation\",wake_binding_required:\"ORCHESTRATOR_WORKER -> alphadog-v2-orchestrator\",public_url_fallback_disabled:true,version:\"alphadog-v2-control-room-v1.6.142-market-teams-button\",ui_sentinel:\"LAYOUT_PARITY_CLEAN_BUTTONS_V1_6_78\",button_layout:\"five_columns_original_compact\",html_source:\"embedded_worker_html_and_static_html_identical\",delta_pitcher_metrics_button:\"present_in_working_escaped_embedded_html\",deployed_file_truth:\"alphadog-v2-control-room.js\",working_html_string_mode:\"escaped_one_line_string_restored\",base_calendar_button:\"present\", delta_calendar_button:\"present\", daily_lineups_button:\"present_source_probe_only\", daily_player_availability_button:\"present_sidecar_only\", daily_weather_roof_button:\"present_phase_4_unified_context\", daily_bullpen_availability_button:\"present_phase_5_internal_context\", daily_team_schedule_spot_button:\"present_phase_6_team_schedule_spot_context\", daily_umpire_context_button:\"present_phase_7_existing_daily_usage_pulse_slot_no_global_deploy_files\", daily_context_certifier_button:\"present_readiness_enrichment_only_existing_daily_certifier_slot\", daily_context_full_run_button:\"present_backend_chain_auto_pump\", schema_creation:\"worker_owned_on_first_run_not_manual_sql\", market_teams_button:\"present_teams_game_odds_only_today_tomorrow_retention_no_market_current_lines\"});\n}\nfunction reloadPage(){window.location.reload(true)}\nasync function rawRequest(l,u,p){\n  const h={\"Content-Type\":\"application/json\"};\n  const o=p===null?{method:\"GET\",headers:h}:{method:\"POST\",headers:h,body:JSON.stringify(p)};\n  try{\n    const r=await fetch(u,o);\n    const txt=await r.text();\n    let b;\n    try{b=JSON.parse(txt)}catch(e){b=txt}\n    return {http_status:r.status,body:b};\n  }catch(e){\n    return {ok:false,error:String(e),action:l,url:u};\n  }\n}\nasync function requestJSON(l,u,p){\n  loading(l);\n  const r=await rawRequest(l,u,p);\n  setStatus(\"DONE: \"+l+\" / HTTP \"+(r.http_status||\"ERR\"));\n  setOutput(l,r);\n  return r;\n}\nfunction health(){requestJSON(\"DEBUG > Health\",HEALTH_URL,null)}\nfunction diagnostic(){requestJSON(\"DEBUG > Diag\",DIAGNOSTIC_URL,null)}\nfunction testSQL(){requestJSON(\"DEBUG > SQL\",SQL_URL,{sql:\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\",max_rows:50,max_chars:900})}\nfunction runJobButton(l,j){\n  return requestJSON(l,JOB_URL,{job:j,slate_mode:\"AUTO_BY_GAME_DATE_TIME\",auto_slate_context:autoSlateContext(),backend_only:true});\n}\nasync function runOrchestratorWake(){\n  requestJSON(\"ORCHESTRATOR > Wake\",JOB_URL,{job:\"orchestrator_tick\",source:\"control_room_manual_wake_proxy\",backend_only:true,max_jobs:5,wake_only:true,auto_pump:true,pump:true,backend_budget_loop_requested:true,max_cycles:4,max_jobs_per_cycle:1,max_ms:30000,max_pump_chains:30,static_players_max_chunks_requested:5,no_browser_loop:true,no_direct_browser_orchestrator_fetch:true,direct_backend_proxy_expected:true,cron_rescue_only:true});\n}\nfunction runManualSQL(){requestJSON(\"MANUAL SQL > Run\",SQL_URL,{sql:document.getElementById(\"sqlInput\").value,max_rows:50,max_chars:900})}\nfunction copyOutput(){navigator.clipboard.writeText(document.getElementById(\"output\").textContent);setStatus(\"COPIED OUTPUT\")}\nfunction clearSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.value=\"\";el.focus()}\nfunction selectSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.focus();el.select()}\nfunction loadExampleSQL(){const el=document.getElementById(\"sqlInput\");el.value=\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\";el.focus();setStatus(\"EXAMPLE SQL LOADED\")}\ndocument.addEventListener(\"DOMContentLoaded\",()=>{\n  const el=document.getElementById(\"sqlInput\");\n  if(el){el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.style.userSelect=\"text\";el.style.webkitUserSelect=\"text\";el.style.pointerEvents=\"auto\"}\n  updateClock();\n  setInterval(updateClock,1000);\n});\n</script>\n</body>\n</html>";
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function htmlResponse(html, status = 200) {
  return new Response(String(html || ""), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function bindingSummary(env) {
  const dbs = Object.fromEntries(DB_BINDINGS.map(k => [k, !!env[k]]));
  const vars = Object.fromEntries(EXPECTED_VARS.map(k => [k, env[k] !== undefined && env[k] !== null && String(env[k]).length > 0]));
  const secrets = Object.fromEntries(EXPECTED_SECRETS.map(k => [k, env[k] !== undefined && env[k] !== null && String(env[k]).length > 0]));
  const services = Object.fromEntries(SERVICE_BINDINGS.map(k => [k, !!(env[k] && typeof env[k].fetch === "function")]));
  return {
    required_db_bindings_present: Object.values(dbs).every(Boolean),
    expected_vars_present: Object.values(vars).every(Boolean),
    required_secrets_present: Object.values(secrets).every(Boolean),
    required_service_bindings_present: Object.values(services).every(Boolean),
    checks: { db_bindings: dbs, vars, service_bindings: services, secrets_present_only: secrets },
    safe_secret_note: "Secret values are intentionally never printed."
  };
}

function baseStatus(env, extra = {}) {
  const b = bindingSummary(env);
  return {
    ok: true,
    data_ok: true,
    version: SYSTEM_VERSION,
    worker_name: "alphadog-v2-control-room",
    job_key: "control-room",
    status: "CONTROL_ROOM_READY",
    timestamp_utc: nowIso(),
    phase: "alphadog-v2-control-room-admin-sql-shell",
    notes: [
      "V2 Control Room shell cloned visually from current Control Room.",
      "No mining, scoring, external API calls, or old production writes.",
      "Manual SQL targets new v2 D1 bindings only."
    ],
    binding_summary: {
      required_db_bindings_present: b.required_db_bindings_present,
      expected_vars_present: b.expected_vars_present,
      required_secrets_present: b.required_secrets_present,
      required_service_bindings_present: b.required_service_bindings_present
    },
    ...extra
  };
}

function getToken(request) {
  const h = request.headers;
  const auth = h.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return h.get("x-admin-token") || h.get("x-ingest-token") || "";
}

function requireAdmin(request, env) {
  // Single-user mode: admin access gate disabled by user request.
  return true;
}

async function readBody(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

function splitSqlStatements(sql) {
  const out = [];
  let cur = "", quote = null, dashComment = false, blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], n = sql[i+1];
    if (dashComment) { cur += c; if (c === "\n") dashComment = false; continue; }
    if (blockComment) { cur += c; if (c === "*" && n === "/") { cur += n; i++; blockComment = false; } continue; }
    if (!quote && c === "-" && n === "-") { cur += c + n; i++; dashComment = true; continue; }
    if (!quote && c === "/" && n === "*") { cur += c + n; i++; blockComment = true; continue; }
    if (quote) { cur += c; if (c === quote && sql[i-1] !== "\\") quote = null; continue; }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function stripLeadingComments(sql) {
  return String(sql || "").replace(/^\s*(--[^\n]*\n\s*)+/g, "").trim();
}

function targetDbFromSql(sql, fallback = null) {
  const raw = String(sql || "");
  const directive = raw.match(/^\s*--\s*db\s*:\s*([A-Z_]+)\s*$/mi);
  if (directive) return directive[1].trim();
  if (fallback) return fallback;
  const s = raw.toLowerCase();
  if (/\bcontrol_/.test(s)) return "CONTROL_DB";
  if (/\bconfig_/.test(s)) return "CONFIG_DB";
  if (/\bref_/.test(s)) return "REF_DB";
  if (/\bhitter_/.test(s)) return "STATS_HITTER_DB";
  if (/\bpitcher_/.test(s)) return "STATS_PITCHER_DB";
  if (/\bteam_/.test(s) || /\bbullpen_history\b/.test(s) || /\bstarter_history\b/.test(s)) return "TEAM_DB";
  if (/\bdaily_/.test(s)) return "DAILY_DB";
  if (/\bmarket_/.test(s)) return "MARKET_DB";
  if (/\bcontext_/.test(s)) return "CONTEXT_DB";
  if (/\bscore_/.test(s) || /\bprop_scores\b/.test(s) || /\bcandidate_board\b/.test(s) || /\brelease_board\b/.test(s)) return "SCORE_DB";
  if (/\barchive_/.test(s)) return "ARCHIVE_DB";
  return "CONTROL_DB";
}

function sanitizeSqlForSafety(sql) {
  const s = stripLeadingComments(sql).toLowerCase();
  const blocked = ["attach ", "detach ", "vacuum", "pragma writable_schema", "load_extension"];
  for (const b of blocked) if (s.includes(b)) return {ok:false, error:"blocked_sql_token:" + b.trim()};
  return {ok:true};
}

function truncateCell(v, maxChars) {
  if (typeof v === "string" && v.length > maxChars) return v.slice(0, maxChars) + "...[truncated " + (v.length - maxChars) + " chars]";
  return v;
}
function truncateRows(rows, maxChars) {
  return rows.map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, truncateCell(v, maxChars)])));
}

async function executeSql(request, env) {
  if (!requireAdmin(request, env)) return jsonResponse({ok:false, error:"single_user_mode_admin_gate_disabled"}, 401);
  const body = await readBody(request);
  const sql = String(body.sql || "").trim();
  const maxRows = Math.max(1, Math.min(Number(body.max_rows || 50), 100));
  const maxChars = Math.max(100, Math.min(Number(body.max_chars || 900), 4000));
  const fallbackDb = body.db ? String(body.db).trim().toUpperCase() : null;
  if (!sql) {
    return jsonResponse({
      ok: true,
      version: SYSTEM_VERSION,
      manual_sql_output_guard: {enabled:true, default_max_rows:50, hard_max_rows:100},
      outputs: [{sql:"", target_db:"CONTROL_DB", rows:[{ok:1, message:"SQL endpoint ready. Add SELECT COUNT(*) FROM control_worker_registry;"}], row_count:1, returned_rows:1, truncated:false}]
    });
  }
  const statements = splitSqlStatements(sql);
  if (statements.length > 25) return jsonResponse({ok:false, error:"too_many_sql_statements", count:statements.length, hard_limit:25}, 400);
  const outputs = [];
  for (const stmt of statements) {
    const safety = sanitizeSqlForSafety(stmt);
    if (!safety.ok) { outputs.push({sql:stmt, ok:false, error:safety.error}); continue; }
    const targetDb = targetDbFromSql(stmt, fallbackDb);
    const db = env[targetDb];
    if (!db || !DB_BINDINGS.includes(targetDb)) { outputs.push({sql:stmt, target_db:targetDb, ok:false, error:"unknown_or_unbound_db"}); continue; }
    const clean = stripLeadingComments(stmt);
    const isQuery = /^(select|with|pragma)\b/i.test(clean);
    try {
      if (isQuery) {
        const res = await db.prepare(stmt).all();
        const rows = Array.isArray(res.results) ? res.results : [];
        const returned = rows.slice(0, maxRows);
        outputs.push({
          sql: stmt,
          target_db: targetDb,
          ok: true,
          rows: truncateRows(returned, maxChars),
          row_count: rows.length,
          returned_rows: returned.length,
          truncated: rows.length > returned.length,
          output_guard: {enabled:true,max_rows:maxRows,max_chars_per_text_cell:maxChars,note:"Manual SQL output is capped to prevent browser/app crashes."}
        });
      } else {
        const res = await db.prepare(stmt).run();
        outputs.push({sql:stmt, target_db:targetDb, ok:true, rows:[], row_count:0, returned_rows:0, truncated:false, meta:res.meta || res});
      }
    } catch (e) {
      outputs.push({sql:stmt, target_db:targetDb, ok:false, error:String(e && e.message ? e.message : e)});
    }
  }
  const ok = outputs.every(o => o.ok !== false);
  return jsonResponse({
    ok,
    version: SYSTEM_VERSION,
    manual_sql_output_guard: {enabled:true, default_max_rows:50, hard_max_rows:100},
    outputs
  }, ok ? 200 : 500);
}

async function count(db, table) {
  const r = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).all();
  return r.results && r.results[0] ? Number(r.results[0].c) : null;
}
async function queryAll(db, sql) {
  const r = await db.prepare(sql).all();
  return r.results || [];
}

async function schemaStatus(env) {
  return {
    control: {
      worker_registry: await count(env.CONTROL_DB, "control_worker_registry"),
      phase_state: await count(env.CONTROL_DB, "control_phase_state"),
      system_state: await count(env.CONTROL_DB, "control_system_state"),
      queue_rows: await count(env.CONTROL_DB, "control_job_queue")
    },
    config: {
      worker_definitions: await count(env.CONFIG_DB, "config_worker_definitions"),
      prop_taxonomy: await count(env.CONFIG_DB, "config_prop_taxonomy"),
      market_sources: await count(env.CONFIG_DB, "config_market_sources"),
      certification_rules: await count(env.CONFIG_DB, "config_certification_rules"),
      system_settings: await count(env.CONFIG_DB, "config_system_settings")
    },
    expected: {workers:116, props:21, market_sources:7, certification_rules:6}
  };
}

async function callOrchestrator(env, path, payload = null) {
  const headers = {"content-type":"application/json", "x-admin-token": env.ALPHADOG_INTERNAL_TOKEN || env.ALPHADOG_ADMIN_TOKEN || ""};
  const init = payload === null ? {method:"GET", headers} : {method:"POST", headers, body: JSON.stringify(payload)};
  const serviceUrl = "https://alphadog-v2-orchestrator.internal" + path;

  if (!env.ORCHESTRATOR_WORKER || typeof env.ORCHESTRATOR_WORKER.fetch !== "function") {
    return {
      http_status: null,
      route: "service_binding_missing",
      ok: false,
      body: {
        ok: false,
        data_ok: false,
        status: "MISSING_ORCHESTRATOR_WORKER_SERVICE_BINDING",
        error: "ORCHESTRATOR_WORKER service binding is missing on alphadog-v2-control-room",
        required_binding: "ORCHESTRATOR_WORKER",
        required_service: "alphadog-v2-orchestrator",
        generator_fix_required: true,
        no_public_url_fallback: true,
        note: "Control Room Wake must use the ORCHESTRATOR_WORKER service binding. Public URL fallback is intentionally disabled because it returns Cloudflare 1042/404 and does not start the backend pump."
      }
    };
  }

  try {
    const r = await env.ORCHESTRATOR_WORKER.fetch(new Request(serviceUrl, init));
    const txt = await r.text();
    let body;
    try { body = JSON.parse(txt); } catch (_) { body = txt; }
    return {http_status:r.status, body, route:"service_binding", ok:r.status >= 200 && r.status < 300};
  } catch (e) {
    return {http_status:null, body:{ok:false, data_ok:false, error:String(e && e.message ? e.message : e), route:"service_binding", service_url:serviceUrl}, route:"service_binding", ok:false};
  }
}

function orchestratorCallOk(result) {
  return !!(result && result.ok === true && Number(result.http_status || 0) >= 200 && Number(result.http_status || 0) < 300);
}

async function getBullpenDeltaStageMissingFromLive(env) {
  const summary = await env.TEAM_DB.prepare(
    `SELECT
       COUNT(*) AS live_delta_rows,
       SUM(CASE WHEN s.bullpen_key IS NULL THEN 1 ELSE 0 END) AS missing_stage_rows,
       MIN(CASE WHEN s.bullpen_key IS NULL THEN l.game_date END) AS first_missing_stage_game_date,
       MAX(CASE WHEN s.bullpen_key IS NULL THEN l.game_date END) AS latest_missing_stage_game_date
     FROM bullpen_history l
     LEFT JOIN bullpen_history_stage s
       ON s.bullpen_key = l.bullpen_key
     WHERE l.ingestion_mode='delta_update'`
  ).first();
  return {
    live_delta_rows: Number(summary && summary.live_delta_rows || 0),
    missing_stage_rows: Number(summary && summary.missing_stage_rows || 0),
    first_missing_stage_game_date: summary ? summary.first_missing_stage_game_date : null,
    latest_missing_stage_game_date: summary ? summary.latest_missing_stage_game_date : null
  };
}

async function restoreMissingBullpenDeltaStageFromLive(env, limit = 200) {
  const before = await getBullpenDeltaStageMissingFromLive(env);
  if (!before.missing_stage_rows) return { restored: false, ...before, missing_before: 0, missing_after: 0, restored_rows: 0 };

  const restoreLimit = Math.max(1, Math.min(Number(limit || 200), 200));
  const sample = await env.TEAM_DB.prepare(
    `SELECT l.bullpen_key, l.game_date, l.game_pk, l.team_id, l.pitcher_id, l.pitcher_name, l.batch_id, l.run_id
     FROM bullpen_history l
     LEFT JOIN bullpen_history_stage s
       ON s.bullpen_key = l.bullpen_key
     WHERE l.ingestion_mode='delta_update'
       AND s.bullpen_key IS NULL
     ORDER BY date(l.game_date) DESC, l.bullpen_key
     LIMIT 5`
  ).all();

  const result = await env.TEAM_DB.prepare(
    `INSERT OR REPLACE INTO bullpen_history_stage (
       stage_id,bullpen_key,game_pk,game_date,season,game_type,game_status,team_id,team_name,opponent_team_id,opponent_team_name,is_home,venue_id,
       pitcher_id,pitcher_name,pitcher_hand,pitcher_role,relief_classification,relief_appearance,games_started,games_pitched,pitcher_order_index,bullpen_appearance_index,
       innings_pitched,innings_pitched_decimal,outs_recorded,batters_faced,pitches,strikes,hits_allowed,runs_allowed,earned_runs,walks_allowed,strikeouts,home_runs_allowed,
       inherited_runners,inherited_runners_scored,holds,saves,blown_saves,field_map_json,source_path,data_feed_key,source_key,source_endpoint,source_season,source_game_type,
       ingestion_mode,batch_id,run_id,request_id,certification_status,certification_grade,source_confidence,source_snapshot_date,raw_json,created_at,updated_at,certified_at,promoted_at
     )
     SELECT
       'bh_stage_restored_' || COALESCE(l.batch_id,'delta') || '_' || l.bullpen_key,
       l.bullpen_key,l.game_pk,l.game_date,l.season,l.game_type,l.game_status,l.team_id,NULL,l.opponent_team_id,NULL,l.is_home,l.venue_id,
       l.pitcher_id,l.pitcher_name,l.pitcher_hand,l.pitcher_role,l.relief_classification,l.relief_appearance,l.games_started,l.games_pitched,l.pitcher_order_index,l.bullpen_appearance_index,
       l.innings_pitched,l.innings_pitched_decimal,l.outs_recorded,l.batters_faced,l.pitches,l.strikes,l.hits_allowed,l.runs_allowed,l.earned_runs,l.walks_allowed,l.strikeouts,l.home_runs_allowed,
       l.inherited_runners,l.inherited_runners_scored,l.holds,l.saves,l.blown_saves,l.field_map_json,l.source_path,l.data_feed_key,l.source_key,l.source_endpoint,l.source_season,l.source_game_type,
       l.ingestion_mode,l.batch_id,l.run_id,NULL,l.certification_status,l.certification_grade,l.source_confidence,l.source_snapshot_date,l.raw_json,COALESCE(l.created_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP,l.certified_at,l.promoted_at
     FROM bullpen_history l
     LEFT JOIN bullpen_history_stage s
       ON s.bullpen_key = l.bullpen_key
     WHERE l.ingestion_mode='delta_update'
       AND s.bullpen_key IS NULL
     ORDER BY date(l.game_date) DESC, l.bullpen_key
     LIMIT ${restoreLimit}`
  ).run();

  const after = await getBullpenDeltaStageMissingFromLive(env);
  const dup = await env.TEAM_DB.prepare(
    `SELECT COALESCE(SUM(c-1),0) AS duplicate_stage_keys
     FROM (
       SELECT bullpen_key, COUNT(*) AS c
       FROM bullpen_history_stage
       WHERE ingestion_mode='delta_update'
       GROUP BY bullpen_key
       HAVING COUNT(*) > 1
     )`
  ).first();

  return {
    restored: true,
    missing_before: before.missing_stage_rows,
    missing_after: after.missing_stage_rows,
    restored_rows: Math.max(0, before.missing_stage_rows - after.missing_stage_rows),
    d1_changes: result && result.meta ? result.meta.changes : null,
    restore_limit: restoreLimit,
    first_missing_stage_game_date: before.first_missing_stage_game_date,
    latest_missing_stage_game_date: before.latest_missing_stage_game_date,
    live_delta_rows: after.live_delta_rows,
    duplicate_stage_keys: Number(dup && dup.duplicate_stage_keys || 0),
    sample_missing_before: sample && sample.results ? sample.results : []
  };
}

async function getCompletedRetainedDeltaGuard(env) {
  const latest = await env.STATS_HITTER_DB.prepare(
    `SELECT batch_id, run_id, mode, status, rows_staged, rows_promoted, certification_status, certification_grade, delta_start_date, promoted_at, cleaned_at, updated_at, source_season
     FROM hitter_game_log_batches
     WHERE mode='delta_update'
       AND status IN ('COMPLETED_PROMOTED_STAGE_RETAINED','DELTA_PROMOTING','DELTA_PROMOTED_STAGE_READY_TO_RETAIN')
       AND certification_grade='DELTA_PASS'
       AND COALESCE(rows_promoted,0) > 0
       AND cleaned_at IS NULL
     ORDER BY datetime(created_at) DESC LIMIT 1`
  ).first();
  if (!latest) return { pass: false, reason: "NO_COMPLETED_RETAINED_DELTA" };
  const stage = await env.STATS_HITTER_DB.prepare(
    "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs_stage WHERE batch_id=?"
  ).bind(latest.batch_id).first();
  const live = await env.STATS_HITTER_DB.prepare(
    "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs WHERE batch_id=?"
  ).bind(latest.batch_id).first();
  const missingLive = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS c FROM hitter_game_logs_stage s
     WHERE s.batch_id=?
       AND NOT EXISTS (SELECT 1 FROM hitter_game_logs h WHERE h.batch_id=s.batch_id AND h.player_id=s.player_id AND h.game_pk=s.game_pk AND h.group_type=s.group_type)`
  ).bind(latest.batch_id).first();
  const stageMeta = await env.STATS_HITTER_DB.prepare(
    `SELECT
       SUM(CASE WHEN COALESCE(row_status,'') <> 'promoted' OR promoted_at IS NULL THEN 1 ELSE 0 END) AS unpromoted_stage_rows
     FROM hitter_game_logs_stage
     WHERE batch_id=?`
  ).bind(latest.batch_id).first();
  const stageRows = Number(stage && stage.c || 0);
  const liveRows = Number(live && live.c || 0);
  const rowsStaged = Number(latest.rows_staged || 0);
  const rowsPromoted = Number(latest.rows_promoted || 0);
  const missingLiveRows = Number(missingLive && missingLive.c || 0);
  const unpromotedStageRows = Number(stageMeta && stageMeta.unpromoted_stage_rows || 0);
  const pass = stageRows > 0 && rowsStaged === stageRows && rowsPromoted === liveRows && liveRows > 0 && missingLiveRows === 0 && unpromotedStageRows === 0;
  let repairPlan = "NOOP_ALREADY_CURRENT";
  if (!pass) {
    if (stageRows > 0 && missingLiveRows > 0) repairPlan = "REPAIR_FROM_RETAINED_STAGE_ONLY";
    else if (stageRows > 0 && liveRows === stageRows && missingLiveRows === 0 && (rowsStaged !== stageRows || rowsPromoted !== liveRows || unpromotedStageRows > 0)) repairPlan = "RECONCILE_RETAINED_STAGE_METADATA_ONLY";
    else if (stageRows < rowsStaged) repairPlan = "REPAIR_STAGE_FROM_FINAL_GAME_FEED_WINDOW";
    else repairPlan = "BLOCK_RETAINED_DELTA_INCONSISTENT_MANUAL_REVIEW";
  }
  return {
    pass,
    reason: pass ? "COMPLETED_RETAINED_FULL_REFRESH_DELTA_ALREADY_EXISTS" : "COMPLETED_DELTA_NEEDS_SURGICAL_GAP_REPAIR",
    repair_plan: repairPlan,
    latest_delta: latest,
    retained_stage_rows: stageRows,
    live_rows_for_delta_batch: liveRows,
    rows_staged_counter: rowsStaged,
    rows_promoted_counter: rowsPromoted,
    missing_live_rows_from_retained_stage: missingLiveRows,
    unpromoted_stage_rows: unpromotedStageRows,
    stage_min_game_date: stage && stage.min_game_date,
    stage_max_game_date: stage && stage.max_game_date,
    live_min_game_date: live && live.min_game_date,
    live_max_game_date: live && live.max_game_date,
    no_new_batch_safe: pass,
    no_mlb_calls_safe: pass,
    no_stage_write_safe: pass
  };
}




async function reconcileHitterRetainedDeltaStageMetadata(env, batchId) {
  if (!batchId) return { reconciled: false, reason: "NO_BATCH_ID" };
  const stageBefore = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS stage_rows,
            SUM(CASE WHEN COALESCE(row_status,'') <> 'promoted' OR promoted_at IS NULL THEN 1 ELSE 0 END) AS unpromoted_stage_rows_before,
            MIN(date(game_date)) AS stage_min_game_date,
            MAX(date(game_date)) AS stage_max_game_date
     FROM hitter_game_logs_stage WHERE batch_id=?`
  ).bind(batchId).first();
  const liveBefore = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS live_rows, MIN(date(game_date)) AS live_min_game_date, MAX(date(game_date)) AS live_max_game_date
     FROM hitter_game_logs WHERE batch_id=?`
  ).bind(batchId).first();
  const missingBefore = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS missing_live_rows
     FROM hitter_game_logs_stage s
     WHERE s.batch_id=?
       AND NOT EXISTS (SELECT 1 FROM hitter_game_logs h WHERE h.batch_id=s.batch_id AND h.player_id=s.player_id AND h.game_pk=s.game_pk AND COALESCE(h.group_type,'hitting')=COALESCE(s.group_type,'hitting'))`
  ).bind(batchId).first();
  const stageRowsBefore = Number(stageBefore && stageBefore.stage_rows || 0);
  const liveRowsBefore = Number(liveBefore && liveBefore.live_rows || 0);
  const missingLiveRowsBefore = Number(missingBefore && missingBefore.missing_live_rows || 0);
  if (!(stageRowsBefore > 0 && liveRowsBefore === stageRowsBefore && missingLiveRowsBefore === 0)) {
    return { reconciled:false, reason:"PARITY_NOT_CLEAN_FOR_METADATA_RECONCILE", batch_id:batchId, stage_rows:stageRowsBefore, live_rows:liveRowsBefore, missing_live_rows:missingLiveRowsBefore };
  }
  const stageRes = await env.STATS_HITTER_DB.prepare(
    `UPDATE hitter_game_logs_stage
     SET row_status='promoted', certification_status='delta_update_certified', certification_grade='DELTA_PASS', certified_at=COALESCE(certified_at,CURRENT_TIMESTAMP), promoted_at=COALESCE(promoted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?
       AND EXISTS (SELECT 1 FROM hitter_game_logs h WHERE h.batch_id=hitter_game_logs_stage.batch_id AND h.player_id=hitter_game_logs_stage.player_id AND h.game_pk=hitter_game_logs_stage.game_pk AND COALESCE(h.group_type,'hitting')=COALESCE(hitter_game_logs_stage.group_type,'hitting'))`
  ).bind(batchId).run();
  const dup = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS duplicate_live_keys FROM (SELECT player_id, game_pk, COALESCE(group_type,'hitting') AS group_type, COUNT(*) AS n FROM hitter_game_logs WHERE batch_id=? GROUP BY player_id, game_pk, COALESCE(group_type,'hitting') HAVING COUNT(*) > 1)`
  ).bind(batchId).first();
  const stageAfter = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS stage_rows,
            SUM(CASE WHEN COALESCE(row_status,'') <> 'promoted' OR promoted_at IS NULL THEN 1 ELSE 0 END) AS unpromoted_stage_rows_after,
            MIN(date(game_date)) AS stage_min_game_date,
            MAX(date(game_date)) AS stage_max_game_date
     FROM hitter_game_logs_stage WHERE batch_id=?`
  ).bind(batchId).first();
  const liveAfter = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS live_rows, MIN(date(game_date)) AS live_min_game_date, MAX(date(game_date)) AS live_max_game_date FROM hitter_game_logs WHERE batch_id=?`
  ).bind(batchId).first();
  const missingAfter = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS missing_live_rows FROM hitter_game_logs_stage s WHERE s.batch_id=? AND NOT EXISTS (SELECT 1 FROM hitter_game_logs h WHERE h.batch_id=s.batch_id AND h.player_id=s.player_id AND h.game_pk=s.game_pk AND COALESCE(h.group_type,'hitting')=COALESCE(s.group_type,'hitting'))`
  ).bind(batchId).first();
  const stageRows = Number(stageAfter && stageAfter.stage_rows || 0);
  const liveRows = Number(liveAfter && liveAfter.live_rows || 0);
  const missingLiveRows = Number(missingAfter && missingAfter.missing_live_rows || 0);
  const unpromotedStageRows = Number(stageAfter && stageAfter.unpromoted_stage_rows_after || 0);
  const duplicateLiveKeys = Number(dup && dup.duplicate_live_keys || 0);
  const pass = stageRows > 0 && liveRows === stageRows && missingLiveRows === 0 && unpromotedStageRows === 0 && duplicateLiveKeys === 0;
  if (pass) {
    await env.STATS_HITTER_DB.prepare(
      `UPDATE hitter_game_log_batches SET status='COMPLETED_PROMOTED_STAGE_RETAINED', rows_staged=?, rows_promoted=?, certification_status='DELTA_HITTER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', cleaned_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?`
    ).bind(stageRows, liveRows, batchId).run();
  }
  return { reconciled:pass, reason:pass ? "RECONCILED_RETAINED_STAGE_METADATA_BEFORE_QUEUE" : "RETAINED_STAGE_METADATA_RECONCILE_FAILED", batch_id:batchId, stage_rows_before:stageRowsBefore, live_rows_before:liveRowsBefore, missing_live_rows_before:missingLiveRowsBefore, unpromoted_stage_rows_before:Number(stageBefore && stageBefore.unpromoted_stage_rows_before || 0), stage_rows:stageRows, live_rows:liveRows, missing_live_rows:missingLiveRows, unpromoted_stage_rows:unpromotedStageRows, duplicate_live_keys:duplicateLiveKeys, stage_min_game_date:stageAfter && stageAfter.stage_min_game_date, stage_max_game_date:stageAfter && stageAfter.stage_max_game_date, live_min_game_date:liveAfter && liveAfter.live_min_game_date, live_max_game_date:liveAfter && liveAfter.live_max_game_date, d1_stage_metadata_changes:stageRes && stageRes.meta ? stageRes.meta.changes : null, no_new_batch:true, no_mlb_calls:true, no_full_sweep:true, no_cleanup:true, no_live_data_insert:true, stage_metadata_reconciled:true, promoted_from_retained_stage:true };
}

async function restoreMissingLiveRowsFromRetainedStage(env, guard) {
  const latest = guard && guard.latest_delta ? guard.latest_delta : null;
  if (!latest || !guard) return { restored: false, reason: "NO_RETAINED_DELTA_GUARD" };
  if (guard.repair_plan !== "REPAIR_FROM_RETAINED_STAGE_ONLY") {
    return { restored: false, reason: "NOT_RETAINED_STAGE_RESTORE_PLAN", repair_plan: guard.repair_plan };
  }

  const batchId = latest.batch_id;
  const before = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS c
     FROM hitter_game_logs_stage s
     WHERE s.batch_id=?
       AND NOT EXISTS (
         SELECT 1 FROM hitter_game_logs h
         WHERE h.batch_id=s.batch_id
           AND h.player_id=s.player_id
           AND h.game_pk=s.game_pk
           AND h.group_type=s.group_type
       )`
  ).bind(batchId).first();
  const missingBefore = Number(before && before.c || 0);
  if (missingBefore <= 0) return { restored: false, reason: "NO_MISSING_LIVE_ROWS_FOUND", batch_id: batchId };

  const insertRes = await env.STATS_HITTER_DB.prepare(
    `INSERT OR REPLACE INTO hitter_game_logs (
       player_id,game_pk,season,game_date,team_id,opponent_team_id,is_home,batting_order,
       pa,ab,hits,singles,doubles,triples,home_runs,runs,rbi,walks,strikeouts,stolen_bases,total_bases,
       raw_json,source_key,source_confidence,updated_at,group_type,data_feed_key,source_endpoint,source_season,source_game_type,
       ingestion_mode,batch_id,run_id,certification_status,certification_grade,certified_at,promoted_at,created_at
     )
     SELECT
       s.player_id,s.game_pk,s.season,s.game_date,s.team_id,s.opponent_team_id,s.is_home,s.batting_order,
       s.pa,s.ab,s.hits,s.singles,s.doubles,s.triples,s.home_runs,s.runs,s.rbi,s.walks,s.strikeouts,s.stolen_bases,s.total_bases,
       s.raw_json,s.source_key,s.source_confidence,CURRENT_TIMESTAMP,s.group_type,s.data_feed_key,s.source_endpoint,s.source_season,s.source_game_type,
       s.ingestion_mode,s.batch_id,s.run_id,'delta_update_certified_promoted','DELTA_PASS',COALESCE(s.certified_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP,COALESCE(s.created_at,CURRENT_TIMESTAMP)
     FROM hitter_game_logs_stage s
     WHERE s.batch_id=?
       AND NOT EXISTS (
         SELECT 1 FROM hitter_game_logs h
         WHERE h.batch_id=s.batch_id
           AND h.player_id=s.player_id
           AND h.game_pk=s.game_pk
           AND h.group_type=s.group_type
       )`
  ).bind(batchId).run();

  const afterMissing = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS c
     FROM hitter_game_logs_stage s
     WHERE s.batch_id=?
       AND NOT EXISTS (
         SELECT 1 FROM hitter_game_logs h
         WHERE h.batch_id=s.batch_id
           AND h.player_id=s.player_id
           AND h.game_pk=s.game_pk
           AND h.group_type=s.group_type
       )`
  ).bind(batchId).first();
  const stage = await env.STATS_HITTER_DB.prepare(
    "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs_stage WHERE batch_id=?"
  ).bind(batchId).first();
  const live = await env.STATS_HITTER_DB.prepare(
    "SELECT COUNT(*) AS c, MIN(date(game_date)) AS min_game_date, MAX(date(game_date)) AS max_game_date FROM hitter_game_logs WHERE batch_id=?"
  ).bind(batchId).first();
  const dup = await env.STATS_HITTER_DB.prepare(
    `SELECT COUNT(*) AS c FROM (
       SELECT player_id, game_pk, group_type, COUNT(*) AS n
       FROM hitter_game_logs
       WHERE batch_id=?
       GROUP BY player_id, game_pk, group_type
       HAVING COUNT(*) > 1
     )`
  ).bind(batchId).first();

  const missingAfter = Number(afterMissing && afterMissing.c || 0);
  const stageRows = Number(stage && stage.c || 0);
  const liveRows = Number(live && live.c || 0);
  const duplicateLiveKeys = Number(dup && dup.c || 0);
  const restoredRows = missingBefore - missingAfter;
  const pass = missingAfter === 0 && stageRows > 0 && liveRows === stageRows && duplicateLiveKeys === 0;

  let metadataReconcile = null;
  if (pass) {
    metadataReconcile = await reconcileHitterRetainedDeltaStageMetadata(env, batchId);
  }

  return {
    restored: pass && (!metadataReconcile || metadataReconcile.reconciled),
    reason: pass ? "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE" : "RETAINED_STAGE_RESTORE_INCOMPLETE",
    batch_id: batchId,
    missing_before: missingBefore,
    restored_rows: restoredRows,
    missing_after: missingAfter,
    stage_rows: stageRows,
    live_rows: liveRows,
    duplicate_live_keys: duplicateLiveKeys,
    stage_min_game_date: stage && stage.min_game_date,
    stage_max_game_date: stage && stage.max_game_date,
    live_min_game_date: live && live.min_game_date,
    live_max_game_date: live && live.max_game_date,
    d1_changes: insertRes && insertRes.meta ? insertRes.meta.changes : null,
    metadata_reconcile: metadataReconcile,
    no_new_batch: true,
    no_mlb_calls: true,
    no_stage_data_writes: true,
    stage_metadata_reconciled: !!(metadataReconcile && metadataReconcile.reconciled),
    no_cleanup: true,
    promoted_from_retained_stage: true
  };
}

async function closeoutPromotedRetainedDeltaFromControlRoom(env, guard) {
  const latest = guard && guard.latest_delta ? guard.latest_delta : null;
  if (!latest || !guard || !guard.pass) return { closed: false, reason: "NO_PASSING_RETAINED_DELTA_GUARD" };
  const status = String(latest.status || "");
  if (!(status === "DELTA_PROMOTED_STAGE_READY_TO_RETAIN" || status === "DELTA_PROMOTING")) {
    return { closed: false, reason: "NO_CLOSEOUT_STATUS", status };
  }
  const stageRows = Number(guard.retained_stage_rows || 0);
  const liveRows = Number(guard.live_rows_for_delta_batch || 0);
  const rowsStaged = Number(guard.rows_staged_counter || 0);
  const rowsPromoted = Number(guard.rows_promoted_counter || 0);
  if (!(stageRows > 0 && liveRows === stageRows && rowsStaged === stageRows && rowsPromoted === liveRows)) {
    return { closed: false, reason: "CLOSEOUT_PARITY_FAIL", stageRows, liveRows, rowsStaged, rowsPromoted };
  }
  await env.STATS_HITTER_DB.prepare(
    `UPDATE hitter_game_log_batches
     SET status='COMPLETED_PROMOTED_STAGE_RETAINED',
         certification_status='DELTA_HITTER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED',
         certification_grade='DELTA_PASS',
         updated_at=CURRENT_TIMESTAMP
     WHERE batch_id=?
       AND status IN ('DELTA_PROMOTING','DELTA_PROMOTED_STAGE_READY_TO_RETAIN')
       AND COALESCE(rows_staged,0)=?
       AND COALESCE(rows_promoted,0)=?
       AND cleaned_at IS NULL`
  ).bind(latest.batch_id, stageRows, liveRows).run();
  return {
    closed: true,
    reason: "CONTROL_ROOM_CLOSEOUT_BEFORE_NOOP",
    batch_id: latest.batch_id,
    status_before: status,
    status_after: "COMPLETED_PROMOTED_STAGE_RETAINED",
    stage_rows: stageRows,
    live_rows: liveRows,
    rows_staged: rowsStaged,
    rows_promoted: rowsPromoted,
    no_new_batch: true,
    no_mlb_calls: true,
    no_stage_writes: true,
    no_promotion: true,
    no_cleanup: true
  };
}


function controlRoomIsoDateOnly(d) { return new Date(d).toISOString().slice(0, 10); }
function controlRoomTodayUtcDate() { return controlRoomIsoDateOnly(Date.now()); }
function controlRoomIsFinalMlbGame(game) {
  const status = game && game.status ? game.status : {};
  const abstractState = String(status.abstractGameState || "").toLowerCase();
  const detailed = String(status.detailedState || "").toLowerCase();
  const coded = String(status.codedGameState || "").toUpperCase();
  return abstractState === "final" || coded === "F" || detailed === "final" || detailed === "game over" || detailed === "completed early";
}
async function controlRoomLatestCompleteGameDate(env, deltaFloorDate) {
  const base = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, "");
  const today = controlRoomTodayUtcDate();
  const endpoint = `${base}/schedule?sportId=1&gameTypes=R&startDate=${encodeURIComponent(deltaFloorDate)}&endDate=${encodeURIComponent(today)}`;
  try {
    const r = await fetch(endpoint, { method: "GET", headers: { "accept": "application/json", "user-agent": String(env.MLB_API_USER_AGENT || "AlphaDog-v2-control-room/1.6.10") } });
    const txt = await r.text();
    if (!r.ok) return { ok:false, endpoint, error:`HTTP_${r.status}`, today_utc: today };
    const body = JSON.parse(txt || "{}");
    let latest = null;
    for (const d of (Array.isArray(body.dates) ? body.dates : [])) {
      const dateStr = d && d.date ? String(d.date) : null;
      const games = Array.isArray(d && d.games) ? d.games : [];
      if (!dateStr || !games.length) continue;
      if (games.every(controlRoomIsFinalMlbGame) && (!latest || dateStr > latest)) latest = dateStr;
    }
    if (!latest) return { ok:false, endpoint, error:"NO_COMPLETE_FINAL_MLB_GAME_DATE_IN_DELTA_RANGE", today_utc: today };
    return { ok:true, endpoint, latest_complete_game_date: latest, today_utc: today };
  } catch (e) {
    return { ok:false, endpoint, error:String(e && e.message ? e.message : e), today_utc: today };
  }
}

function crIsoDateOnly(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}
function crAddDays(dateStr, days) {
  const d = new Date(String(dateStr) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return crIsoDateOnly(d);
}
function crTodayUtcDate() { return crIsoDateOnly(new Date()); }
function crMlbBaseUrl(env) { return String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/$/, ""); }
function crIsFinalMlbGame(game) {
  const status = game && game.status ? game.status : {};
  const abstractState = String(status.abstractGameState || "").toLowerCase();
  const detailed = String(status.detailedState || "").toLowerCase();
  const coded = String(status.codedGameState || "").toUpperCase();
  return abstractState === "final" || coded === "F" || detailed === "final" || detailed === "game over" || detailed === "completed early";
}
async function crFetchJson(env, endpoint) {
  const resp = await fetch(endpoint, { headers: env.MLB_API_USER_AGENT ? { "user-agent": String(env.MLB_API_USER_AGENT) } : {} });
  const text = await resp.text();
  try { return { ok: resp.ok, http_status: resp.status, endpoint, json: JSON.parse(text || "{}"), error: resp.ok ? null : `HTTP_${resp.status}` }; }
  catch (err) { return { ok: false, http_status: resp.status, endpoint, json: null, error: `JSON_PARSE_FAILED:${String(err && err.message ? err.message : err)}` }; }
}
async function crLatestCompleteGameDate(env, startDate) {
  const today = crTodayUtcDate();
  const endpoint = `${crMlbBaseUrl(env)}/schedule?sportId=1&gameTypes=R&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(today)}`;
  const out = await crFetchJson(env, endpoint);
  if (!out.ok) return { ok: false, endpoint, error: out.error || `HTTP_${out.http_status}`, today_utc: today };
  let latest = null;
  for (const d of (Array.isArray(out.json && out.json.dates) ? out.json.dates : [])) {
    const dateStr = String((d && d.date) || "");
    const games = Array.isArray(d && d.games) ? d.games : [];
    if (!dateStr || games.length === 0) continue;
    if (games.every(crIsFinalMlbGame) && (!latest || dateStr > latest)) latest = dateStr;
  }
  if (!latest) return { ok: false, endpoint, error: "NO_COMPLETE_FINAL_MLB_GAME_DATE_IN_DELTA_RANGE", today_utc: today };
  return { ok: true, endpoint, latest_complete_game_date: latest, today_utc: today };
}
async function crLatestRetainedPitcherDelta(env) {
  return await env.STATS_PITCHER_DB.prepare("SELECT * FROM pitcher_game_log_batches WHERE mode='delta_update' AND status='COMPLETED_PROMOTED_STAGE_RETAINED' ORDER BY datetime(finished_at) DESC LIMIT 1").first();
}
async function crPitcherDeltaParity(env, batch) {
  if (!batch || !batch.batch_id) return { pass: false, reason: "NO_RETAINED_DELTA_BATCH" };
  const stage = await env.STATS_PITCHER_DB.prepare("SELECT COUNT(*) AS c, MIN(game_date) AS min_date, MAX(game_date) AS max_date FROM pitcher_game_log_stage WHERE batch_id=? AND ingestion_mode='delta_update'").bind(batch.batch_id).first();
  const live = await env.STATS_PITCHER_DB.prepare("SELECT COUNT(*) AS c, MIN(game_date) AS min_date, MAX(game_date) AS max_date FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update'").bind(batch.batch_id).first();
  const missing = await env.STATS_PITCHER_DB.prepare("SELECT COUNT(*) AS c FROM pitcher_game_log_stage s WHERE s.batch_id=? AND s.ingestion_mode='delta_update' AND NOT EXISTS (SELECT 1 FROM pitcher_game_logs l WHERE l.batch_id=s.batch_id AND l.player_id=s.player_id AND l.game_pk=s.game_pk AND COALESCE(l.group_type,'pitching')=COALESCE(s.group_type,'pitching'))").bind(batch.batch_id).first();
  const dup = await env.STATS_PITCHER_DB.prepare("SELECT COUNT(*) AS c FROM (SELECT player_id, game_pk, COALESCE(group_type,'pitching') g, COUNT(*) n FROM pitcher_game_logs WHERE batch_id=? AND ingestion_mode='delta_update' GROUP BY player_id, game_pk, COALESCE(group_type,'pitching') HAVING n>1)").bind(batch.batch_id).first();
  return {
    pass: Number(missing && missing.c || 0) === 0 && Number(dup && dup.c || 0) === 0 && Number(stage && stage.c || 0) === Number(live && live.c || 0),
    batch_id: batch.batch_id,
    stage_rows: Number(stage && stage.c || 0),
    live_rows: Number(live && live.c || 0),
    missing_live_rows: Number(missing && missing.c || 0),
    duplicate_live_keys: Number(dup && dup.c || 0),
    stage_min_game_date: stage && stage.min_date,
    stage_max_game_date: stage && stage.max_date,
    live_min_game_date: live && live.min_date,
    live_max_game_date: live && live.max_date
  };
}
async function crRestorePitcherDeltaFromRetainedStage(env, retained, parity) {
  const before = parity || await crPitcherDeltaParity(env, retained);
  if (!retained || !retained.batch_id || before.missing_live_rows <= 0) return { restored: false, reason: "NO_MISSING_LIVE_ROWS", before };
  const res = await env.STATS_PITCHER_DB.prepare(`INSERT OR REPLACE INTO pitcher_game_logs (
      player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
      innings_pitched, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
      walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, updated_at,
      data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id,
      certification_status, certification_grade, certified_at, promoted_at, created_at, group_type,
      player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
    )
    SELECT
      s.player_id, s.game_pk, s.season, s.game_date, s.team_id, s.opponent_team_id, s.is_home, s.role,
      s.innings_pitched_decimal, s.outs_recorded, s.batters_faced, s.hits_allowed, s.runs_allowed, s.earned_runs,
      s.walks_allowed, s.strikeouts, s.home_runs_allowed, s.pitches, s.raw_json, s.source_key, s.source_confidence, CURRENT_TIMESTAMP,
      s.data_feed_key, s.source_endpoint, s.source_season, s.source_game_type, 'delta_update', s.batch_id, s.run_id,
      'DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', 'DELTA_PASS', COALESCE(s.certified_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, COALESCE(s.created_at, CURRENT_TIMESTAMP), COALESCE(s.group_type,'pitching'),
      s.player_name, s.opponent_team, s.innings_pitched_decimal, s.balls, s.strikes, s.wins, s.losses, s.saves, s.holds, s.blown_saves, s.stat_shape_json
    FROM pitcher_game_log_stage s
    WHERE s.batch_id=? AND s.ingestion_mode='delta_update'
      AND NOT EXISTS (SELECT 1 FROM pitcher_game_logs l WHERE l.batch_id=s.batch_id AND l.player_id=s.player_id AND l.game_pk=s.game_pk AND COALESCE(l.group_type,'pitching')=COALESCE(s.group_type,'pitching'))`).bind(retained.batch_id).run();
  const after = await crPitcherDeltaParity(env, retained);
  await env.STATS_PITCHER_DB.prepare("UPDATE pitcher_game_log_batches SET rows_promoted=?, live_rows_after=?, certification_status='DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', cleaned_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?").bind(after.live_rows, after.live_rows, retained.batch_id).run();
  return { restored: after.pass, reason: after.pass ? "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE" : "RETAINED_STAGE_RESTORE_FAILED", batch_id: retained.batch_id, missing_before: before.missing_live_rows, restored_rows: Math.max(0, before.missing_live_rows - after.missing_live_rows), missing_after: after.missing_live_rows, stage_rows: after.stage_rows, live_rows: after.live_rows, duplicate_live_keys: after.duplicate_live_keys, stage_min_game_date: after.stage_min_game_date, stage_max_game_date: after.stage_max_game_date, live_min_game_date: after.live_min_game_date, live_max_game_date: after.live_max_game_date, d1_changes: res && res.meta ? res.meta.changes : null, no_new_batch: true, no_mlb_calls: true, no_stage_writes: true, no_cleanup: true, promoted_from_retained_stage: true };
}

async function crEnsurePitcherGameLogRepairRegistry(env) {
  await env.STATS_PITCHER_DB.prepare(`CREATE TABLE IF NOT EXISTS pitcher_game_log_repair_registry (
    registry_key TEXT PRIMARY KEY,
    target_batch_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    game_pk INTEGER NOT NULL,
    season INTEGER NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'pitching',
    game_date TEXT,
    source_endpoint TEXT,
    status TEXT,
    created_by_version TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.STATS_PITCHER_DB.prepare("CREATE INDEX IF NOT EXISTS idx_pitcher_game_log_repair_registry_target ON pitcher_game_log_repair_registry(target_batch_id, player_id, game_pk, group_type)").run();
}

async function crCreateOrRefreshPitcherGameLogRepairAnchor(env, retained) {
  await crEnsurePitcherGameLogRepairRegistry(env);
  const existing = await env.STATS_PITCHER_DB.prepare("SELECT * FROM pitcher_game_log_repair_registry WHERE registry_key='pitcher_game_logs_delta_repair_anchor_1'").first();
  if (existing) return { created: false, registry: existing };
  const anchor = await env.STATS_PITCHER_DB.prepare(`SELECT
      s.batch_id AS target_batch_id,
      s.player_id,
      s.game_pk,
      s.season,
      COALESCE(s.group_type,'pitching') AS group_type,
      s.game_date,
      s.source_endpoint
    FROM pitcher_game_log_stage s
    JOIN pitcher_game_logs h
      ON h.batch_id=s.batch_id
     AND h.player_id=s.player_id
     AND h.game_pk=s.game_pk
     AND COALESCE(h.group_type,'pitching')=COALESCE(s.group_type,'pitching')
    WHERE s.batch_id=? AND s.ingestion_mode='delta_update'
    ORDER BY s.game_date, s.player_id, s.game_pk
    LIMIT 1`).bind(retained.batch_id).first();
  if (!anchor) return { created: false, registry: null, reason: "no_joined_live_stage_anchor_available" };
  await env.STATS_PITCHER_DB.prepare(`INSERT OR REPLACE INTO pitcher_game_log_repair_registry
    (registry_key,target_batch_id,player_id,game_pk,season,group_type,game_date,source_endpoint,status,created_by_version,notes,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
      'pitcher_game_logs_delta_repair_anchor_1', anchor.target_batch_id, anchor.player_id, anchor.game_pk, anchor.season, anchor.group_type || 'pitching', anchor.game_date, anchor.source_endpoint,
      'REPAIR_ANCHOR_RETAINED_FROM_LOCKED_LIVE_AND_STAGE', SYSTEM_VERSION, 'Control Room repair anchor. Live-only deletion restores from retained stage; live+stage deletion queues scoped re-fetch only.'
    ).run();
  const registry = await env.STATS_PITCHER_DB.prepare("SELECT * FROM pitcher_game_log_repair_registry WHERE registry_key='pitcher_game_logs_delta_repair_anchor_1'").first();
  return { created: true, registry };
}

async function crPitcherGameLogRegistryCounts(env, registry) {
  if (!registry) return { live_count: 0, stage_count: 0 };
  const live = await env.STATS_PITCHER_DB.prepare("SELECT COUNT(*) AS c FROM pitcher_game_logs WHERE batch_id=? AND player_id=? AND game_pk=? AND COALESCE(group_type,'pitching')=COALESCE(?,'pitching')").bind(registry.target_batch_id, registry.player_id, registry.game_pk, registry.group_type || 'pitching').first();
  const stage = await env.STATS_PITCHER_DB.prepare("SELECT COUNT(*) AS c FROM pitcher_game_log_stage WHERE batch_id=? AND player_id=? AND game_pk=? AND COALESCE(group_type,'pitching')=COALESCE(?,'pitching')").bind(registry.target_batch_id, registry.player_id, registry.game_pk, registry.group_type || 'pitching').first();
  return { live_count: Number(live && live.c || 0), stage_count: Number(stage && stage.c || 0) };
}

async function crRestorePitcherGameLogAnchorFromRetainedStage(env, registry) {
  const before = await crPitcherGameLogRegistryCounts(env, registry);
  if (!registry || before.live_count > 0 || before.stage_count <= 0) return { restored: false, reason: "ANCHOR_RESTORE_NOT_NEEDED_OR_STAGE_MISSING", before };
  const res = await env.STATS_PITCHER_DB.prepare(`INSERT OR REPLACE INTO pitcher_game_logs (
      player_id, game_pk, season, game_date, team_id, opponent_team_id, is_home, role,
      innings_pitched, outs_recorded, batters_faced, hits_allowed, runs_allowed, earned_runs,
      walks_allowed, strikeouts, home_runs_allowed, pitches, raw_json, source_key, source_confidence, updated_at,
      data_feed_key, source_endpoint, source_season, source_game_type, ingestion_mode, batch_id, run_id,
      certification_status, certification_grade, certified_at, promoted_at, created_at, group_type,
      player_name, opponent_team, innings_pitched_decimal, balls, strikes, wins, losses, saves, holds, blown_saves, stat_shape_json
    )
    SELECT
      s.player_id, s.game_pk, s.season, s.game_date, s.team_id, s.opponent_team_id, s.is_home, s.role,
      s.innings_pitched, s.outs_recorded, s.batters_faced, s.hits_allowed, s.runs_allowed, s.earned_runs,
      s.walks_allowed, s.strikeouts, s.home_runs_allowed, s.pitches, s.raw_json, s.source_key, s.source_confidence, CURRENT_TIMESTAMP,
      s.data_feed_key, s.source_endpoint, s.source_season, s.source_game_type, 'delta_update', s.batch_id, s.run_id,
      'DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', 'DELTA_REPAIR_PASS', COALESCE(s.certified_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, COALESCE(s.created_at, CURRENT_TIMESTAMP), COALESCE(s.group_type,'pitching'),
      s.player_name, s.opponent_team, s.innings_pitched_decimal, s.balls, s.strikes, s.wins, s.losses, s.saves, s.holds, s.blown_saves, s.stat_shape_json
    FROM pitcher_game_log_stage s
    WHERE s.batch_id=? AND s.player_id=? AND s.game_pk=? AND COALESCE(s.group_type,'pitching')=COALESCE(?,'pitching')
    LIMIT 1`).bind(registry.target_batch_id, registry.player_id, registry.game_pk, registry.group_type || 'pitching').run();
  const after = await crPitcherGameLogRegistryCounts(env, registry);
  const parity = await crPitcherDeltaParity(env, { batch_id: registry.target_batch_id });
  await env.STATS_PITCHER_DB.prepare("UPDATE pitcher_game_log_batches SET rows_promoted=?, live_rows_after=?, certification_status='DELTA_PITCHER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED', certification_grade='DELTA_PASS', cleaned_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE batch_id=?").bind(parity.live_rows, parity.live_rows, registry.target_batch_id).run();
  return { restored: after.live_count > 0, reason: after.live_count > 0 ? "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE" : "ANCHOR_RESTORE_FAILED", registry_key: registry.registry_key, batch_id: registry.target_batch_id, restored_rows: Math.max(0, after.live_count - before.live_count), live_count_before: before.live_count, stage_count_before: before.stage_count, live_count_after: after.live_count, stage_count_after: after.stage_count, live_rows: parity.live_rows, stage_rows: parity.stage_rows, duplicate_live_keys: parity.duplicate_live_keys, d1_changes: res && res.meta ? res.meta.changes : null, no_new_batch: true, no_mlb_calls: true, no_stage_writes: true, no_cleanup: true, promoted_from_retained_stage: true };
}

async function runJob(request, env, ctx) {
  if (!requireAdmin(request, env)) return jsonResponse({ok:false, error:"single_user_mode_admin_gate_disabled"}, 401);
  const body = await readBody(request);
  const job = String(body.job || "");
  try {
    if (job === "v2_schema_status") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, schema: await schemaStatus(env)});
    if (job === "v2_worker_registry") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, rows: await queryAll(env.CONTROL_DB, "SELECT worker_name, job_key, worker_group, phase_key, enabled, service_binding_name FROM control_worker_registry ORDER BY worker_group, worker_name LIMIT 150")});
    if (job === "v2_config_summary") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, schema: await schemaStatus(env), settings: await queryAll(env.CONFIG_DB, "SELECT setting_key, setting_value, category FROM config_system_settings ORDER BY setting_key LIMIT 100")});
    if (job === "v2_phase_state") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, rows: await queryAll(env.CONTROL_DB, "SELECT phase_key, display_name, status, data_ok, updated_at FROM control_phase_state ORDER BY phase_key")});
    if (job === "v2_market_sources") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, rows: await queryAll(env.CONFIG_DB, "SELECT source_key, display_name, provider, enabled, primary_use, trust_grade FROM config_market_sources ORDER BY priority, source_key")});
    if (job === "v2_prop_taxonomy") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, rows: await queryAll(env.CONFIG_DB, "SELECT prop_key, display_name, player_side, primary_role, scoring_enabled FROM config_prop_taxonomy ORDER BY prop_key")});
    if (job === "v2_certification_rules") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, rows: await queryAll(env.CONFIG_DB, "SELECT rule_key, phase_key, job_key, required, zero_rows_policy, missing_data_policy FROM config_certification_rules ORDER BY phase_key, rule_key")});
    if (job === "v2_bindings_check") return jsonResponse(baseStatus(env, bindingSummary(env)));

    if ([
      "orchestrator_health",
      "orchestrator_status",
      "orchestrator_enqueue_test",
      "orchestrator_enqueue_prizepicks_github_board",
      "orchestrator_enqueue_parlay_sleeper_board",
      "orchestrator_enqueue_board_full_run",
      "orchestrator_enqueue_score_prep",
      "orchestrator_enqueue_daily_games_status",
      "orchestrator_enqueue_daily_probable_pitchers",
      "orchestrator_enqueue_daily_lineups",
      "orchestrator_enqueue_daily_player_availability",
      "orchestrator_enqueue_daily_weather",
      "orchestrator_enqueue_daily_bullpen_availability",
      "orchestrator_enqueue_daily_team_schedule_spot",
      "orchestrator_enqueue_daily_umpire_context",
      "orchestrator_enqueue_daily_context_certifier",
      "orchestrator_enqueue_daily_context_full_run",
      "orchestrator_enqueue_base_calendar",
      "orchestrator_enqueue_delta_calendar",
      "orchestrator_enqueue_base_hitter_game_logs",
      "orchestrator_enqueue_base_hitter_metrics",
      "orchestrator_enqueue_delta_hitter_metrics",
      "orchestrator_enqueue_delta_pitcher_metrics",
      "orchestrator_enqueue_base_hitter_splits",
      "orchestrator_enqueue_delta_hitter_splits",
      "orchestrator_enqueue_base_pitcher_game_logs",
      "orchestrator_enqueue_base_pitcher_metrics",
      "orchestrator_enqueue_base_team_game_logs",
      "orchestrator_enqueue_base_starter_history",
      "orchestrator_enqueue_base_bullpen_history",
      "orchestrator_enqueue_delta_team_game_logs",
      "orchestrator_enqueue_base_pitcher_splits",
      "orchestrator_enqueue_delta_pitcher_splits",
      "orchestrator_enqueue_delta_hitter_game_logs",
      "orchestrator_enqueue_delta_pitcher_game_logs",
      "orchestrator_enqueue_static_teams",
      "orchestrator_enqueue_static_stadiums",
      "orchestrator_enqueue_static_park_factors",
      "orchestrator_enqueue_static_players",
      "orchestrator_enqueue_static_prop_taxonomy",
      "orchestrator_enqueue_static_certifier",
      "orchestrator_enqueue_static_full_run",
      "orchestrator_enqueue_incremental_morning_full_run",
      "orchestrator_enqueue_market_context_source_probe",
      "orchestrator_tick",
      "orchestrator_logs"
    ].includes(job)) {
      return await v12OrchestratorLocalBridge(job, env, ctx);
    }
    if (job === "v2_queue_status") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, rows: await queryAll(env.CONTROL_DB, "SELECT request_id, job_key, status, run_after, started_at, finished_at, updated_at FROM control_job_queue ORDER BY updated_at DESC LIMIT 50")});
    if (job === "v2_lock_status") return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, rows: await queryAll(env.CONTROL_DB, "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at FROM control_locks ORDER BY lock_key")});
    if (job === "v2_health_snapshot") {
      const payload = baseStatus(env, {schema: await schemaStatus(env)});
      await env.CONTROL_DB.prepare("INSERT INTO control_health_snapshots (worker_name, status, db_bindings_ok, vars_ok, secrets_ok, health_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind("alphadog-v2-control-room", "ok", 1, 1, 1, JSON.stringify(payload)).run();
      return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, snapshot_written:true, payload});
    }
    if (job === "v2_clear_open_queue") {
      await env.CONTROL_DB.prepare("UPDATE control_job_queue SET status='cancelled', finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, error_code='manual_v2_clear_open_queue', error_message='Cleared from v2 Control Room' WHERE status IN ('pending','running','requested')").run();
      await env.CONTROL_DB.prepare("UPDATE control_system_state SET lock_flag=0, running_job_key=NULL, running_request_id=NULL, running_chain_id=NULL, status='IDLE', updated_at=CURRENT_TIMESTAMP WHERE state_key='GLOBAL'").run();
      await env.CONTROL_DB.prepare("UPDATE control_locks SET lock_flag=0, owner_request_id=NULL, owner_worker_name=NULL, updated_at=CURRENT_TIMESTAMP WHERE lock_key='GLOBAL_ORCHESTRATOR'").run();
      return jsonResponse({ok:true, data_ok:true, version:SYSTEM_VERSION, job, status:"cleared_v2_open_queue_and_global_locks_only"});
    }
    return jsonResponse({ok:false, data_ok:false, version:SYSTEM_VERSION, job, error:"unknown_or_not_enabled_v2_control_room_job"}, 400);
  } catch (e) {
    return jsonResponse({ok:false, data_ok:false, version:SYSTEM_VERSION, job, error:String(e && e.message ? e.message : e)}, 500);
  }
}


async function v12OrchestratorLocalBridge(job, env, ctx = null) {
  const now = new Date().toISOString();
  const version = SYSTEM_VERSION;

  if (job === "orchestrator_health") {
    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      orchestrator_mode: "local_control_db_bridge",
      status: "ORCHESTRATOR_BRIDGE_READY",
      note: "Control Room is not externally fetching orchestrator. This verifies local backend bridge and CONTROL_DB access.",
      timestamp_utc: now
    });
  }

  if (job === "orchestrator_status") {
    const queue = await env.CONTROL_DB.prepare(
      "SELECT request_id, job_key, worker_name, status, tick_count, created_at, started_at, finished_at, updated_at, error_message FROM control_job_queue ORDER BY datetime(created_at) DESC LIMIT 10"
    ).all();
    const locks = await env.CONTROL_DB.prepare(
      "SELECT lock_key, lock_flag, owner_request_id, owner_worker_name, acquired_at, expires_at, updated_at FROM control_locks ORDER BY lock_key LIMIT 20"
    ).all();
    const state = await env.CONTROL_DB.prepare(
      "SELECT state_key, lock_flag, running_job_key, running_request_id, status, updated_at FROM control_system_state ORDER BY state_key LIMIT 20"
    ).all();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      orchestrator_mode: "local_control_db_bridge",
      status: "READY",
      queue_rows: queue.results || [],
      locks: locks.results || [],
      state: state.results || []
    });
  }

  if (job === "orchestrator_enqueue_test") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'system-health' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing
      });
    }

    const requestId = "orch_test_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'system-health', 'alphadog-v2-system-health', '00 System', 'system', 'System Health Safe Test', 'pending', 10, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify({source:"control_room", mode:"safe_orchestrator_test", created_at:now})).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_test', 'INFO', 'queued_safe_test', 'Queued safe system-health orchestrator test job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      note: "Queued in CONTROL_DB. Real alphadog-v2-orchestrator cron/backend tick should process it automatically. Use ORCHESTRATOR > Logs or V2 SAFE ACTIONS > Queue after the cron window."
    });
  }

  if (job === "orchestrator_enqueue_prizepicks_github_board") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'prizepicks-github-board' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BOARD > PrizePicks"
      });
    }

    const requestId = "pp_board_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BOARD > PrizePicks",
      mode: "prizepicks_github_board_source_shape_staging",
      created_at: now,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      allowed_market_writes: ["market_raw_snapshots", "market_source_health"]
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'prizepicks-github-board', 'alphadog-v2-prizepicks-github-board', 'Board', 'board', 'PrizePicks Board Refresh', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_prizepicks_github_board', 'INFO', 'queued_prizepicks_github_board', 'Queued exact PrizePicks GitHub Board worker source-shape staging job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BOARD > PrizePicks"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BOARD > PrizePicks",
      queued_job_key: "prizepicks-github-board",
      queued_worker_name: "alphadog-v2-prizepicks-github-board",
      note: "Queued in CONTROL_DB. Use ORCHESTRATOR > Wake to process safe backend chunks now, then ORCHESTRATOR > Logs and V2 SAFE ACTIONS > Queue."
    });
  }

  if (job === "orchestrator_enqueue_parlay_sleeper_board") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'parlay-sleeper-board' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BOARD > Sleeper"
      });
    }

    const requestId = "sleeper_probe_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BOARD > Sleeper",
      mode: "parlay_sleeper_base_stage_readiness_only",
      created_at: now,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_prizepicks_mutation: true,
      no_promotion: true,
      no_alias_guessing: true,
      allowed_market_writes: ["sleeper_lifecycle_schema_ddl_only"],
      base_stage_only: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'parlay-sleeper-board', 'alphadog-v2-parlay-sleeper-board', '04 Board', 'board', 'Sleeper Board Source Probe', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_parlay_sleeper_board', 'INFO', 'queued_parlay_sleeper_board_probe', 'Queued exact Parlay Sleeper Board source-probe readiness job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BOARD > Sleeper"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BOARD > Sleeper",
      queued_job_key: "parlay-sleeper-board",
      queued_worker_name: "alphadog-v2-parlay-sleeper-board",
      note: "Queued in CONTROL_DB. Use ORCHESTRATOR > Wake to process the source-probe job, then ORCHESTRATOR > Logs and MANUAL SQL > Run."
    });
  }

  if (job === "orchestrator_enqueue_market_context_source_probe") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'market-normalizer' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "MARKET > Teams",
        note: "Existing External Teams Game Odds queue row found. Use ORCHESTRATOR > Wake and ORCHESTRATOR > Logs."
      });
    }

    const requestId = "market_teams_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_market_teams_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "MARKET > Teams",
      mode: "market_teams_game_odds",
      created_at: now,
      exact_worker_only: true,
      teams_game_odds_real_worker_shape: true,
      today_tomorrow_retention_only: true,
      evidence_tables_only: true,
      odds_api_game_odds_lane: true,
      odds_api_sport_key: "baseball_mlb",
      odds_api_markets: ["h2h", "spreads", "totals"],
      odds_api_event_level_game_team_markets: ["team_totals", "alternate_spreads", "alternate_totals"],
      no_player_props_in_this_worker: true,
      parlay_player_prop_coverage_test_only: false,
      no_market_current_lines_writes: true,
      no_score_db_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_matrix_builder: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'market-normalizer', 'alphadog-v2-market-normalizer', '05 Market', 'market_context', 'External Teams Game Odds', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_market_context_source_probe', 'INFO', 'queued_market_teams_game_odds', 'Queued exact External Teams Game Odds worker job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"MARKET > Teams", queued_job_key:"market-normalizer", queued_worker_name:"alphadog-v2-market-normalizer", no_market_current_lines_writes:true, no_score_db_mutation:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "MARKET > Teams",
      queued_job_key: "market-normalizer",
      queued_worker_name: "alphadog-v2-market-normalizer",
      teams_game_odds_real_worker_shape: true,
      today_tomorrow_retention_only: true,
      note: "Queued External Teams Game Odds only. This may create/write MARKET_DB probe evidence tables for today/tomorrow only. It does not write market_current_lines, mutate prepared board, score, rank, build matrix packets, or write final board. Tap ORCHESTRATOR > Wake."
    });
  }

  if (job === "orchestrator_enqueue_board_full_run") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE job_key = 'board-full-run' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({ ok: true, data_ok: true, version, job, status: "already_queued", request_id: existing.request_id, existing, visible_button: "BOARD > Full Run", backend_chain_only: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Existing Board Full Run parent queue row found. Do not enqueue a duplicate. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect." });
    }

    const requestId = "board_full_run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_board_full_run_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BOARD > Full Run",
      mode: "board_full_run",
      created_at: now,
      approved_chain_order: ["prizepicks-github-board", "parlay-sleeper-board"],
      child_modes: {
        "prizepicks-github-board": "board_full_run_prizepicks_refresh",
        "parlay-sleeper-board": "board_full_run_sleeper_refresh"
      },
      stop_on_first_failed_stage: true,
      backend_chain_only: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_generic_dispatch: true,
      no_delta_full_run: true,
      no_incremental_morning_full_run: true,
      no_static_work: true,
      no_base_delta_workers: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'board-full-run', 'alphadog-v2-orchestrator', 'Board', 'board', 'Board Full Run: PrizePicks then Sleeper', 'pending', 5, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES ('BOARD_FULL_RUN', 0, CURRENT_TIMESTAMP)"
    ).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_board_full_run', 'INFO', 'queued_board_full_run', 'Queued Board Full Run parent backend chain job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BOARD > Full Run", approved_chain_order:input.approved_chain_order, backend_chain_only:true})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", { source:"control_room_board_full_run_enqueue", max_cycles:6, max_jobs_per_cycle:1, max_ms:45000, max_pump_chains:12, no_browser_loop:true, cron_rescue_only:true, backend_budget_loop_requested:true }));
    }

    return jsonResponse({ ok: true, data_ok: true, version, job, status: "queued", request_id: requestId, chain_id: chainId, visible_button: "BOARD > Full Run", queued_job_key: "board-full-run", queued_worker_name: "alphadog-v2-orchestrator", approved_chain_order: input.approved_chain_order, backend_chain_only: true, auto_pump_triggered: true, browser_auto_pump: false, note: "Queued Board Full Run only: PrizePicks first, then Sleeper. This does not run Incremental Morning Full Run, static, base/delta, scoring, ranking, or final board." });
  }


  if (job === "orchestrator_enqueue_score_prep") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'score-prep' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BOARD > Prep",
        note: "Existing Board Prep queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "score_prep_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_score_prep_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BOARD > Prep",
      mode: "board_prep_enrichment",
      created_at: now,
      exact_worker_only: true,
      reads_market_boards: true,
      reads_team_calendar: true,
      reads_ref_identity: true,
      writes_score_prepared_board_only: true,
      preserve_all_source_rows: true,
      no_market_board_mutation: true,
      no_raw_board_delete: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'score-prep', 'alphadog-v2-score-prep', 'Board', 'board_prep', 'Board Prep Enrichment', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_score_prep', 'INFO', 'queued_score_prep_board_enrichment', 'Queued Board Prep enrichment worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BOARD > Prep", queued_job_key:"score-prep"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BOARD > Prep",
      queued_job_key: "score-prep",
      queued_worker_name: "alphadog-v2-score-prep",
      note: "Queued Board Prep only. This reads PrizePicks/Sleeper current boards plus REF/TEAM calendar and writes SCORE_DB prepared rows. It does not mutate raw boards, score, rank, or write final board. Tap ORCHESTRATOR > Wake."
    });
  }


  if (job === "orchestrator_enqueue_daily_games_status") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-games-status' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Game Status",
        note: "Existing Daily Game Status queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_game_status_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_game_status_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Game Status",
      mode: "board_focused_daily_game_status_current_refresh",
      created_at: now,
      exact_worker_only: true,
      board_focused_only: true,
      reads_market_board_current_only: true,
      writes_daily_game_status_context_only: true,
      no_board_mutation: true,
      no_player_resolver: true,
      no_lineups: true,
      no_starters: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-games-status', 'alphadog-v2-daily-games-status', 'Daily', 'daily', 'Daily Game Status', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_games_status', 'INFO', 'queued_daily_games_status', 'Queued board-focused Daily Game Status worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Game Status", queued_job_key:"daily-games-status"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Game Status",
      queued_job_key: "daily-games-status",
      queued_worker_name: "alphadog-v2-daily-games-status",
      note: "Queued Daily Game Status only. This reads active board rows and writes DAILY_DB game-status context. It does not mutate boards, score, rank, or write final candidates."
    });
  }


  if (job === "orchestrator_enqueue_daily_probable_pitchers") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-probable-pitchers' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Starters",
        note: "Existing Daily Starters queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_starters_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_starters_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Starters",
      mode: "daily_starters_refresh_window",
      created_at: now,
      exact_worker_only: true,
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      writes_daily_starters_context_only: true,
      no_calendar_rebuild: true,
      no_board_mutation: true,
      no_lineups: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-probable-pitchers', 'alphadog-v2-daily-probable-pitchers', 'Daily', 'daily', 'Daily Starters', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_probable_pitchers', 'INFO', 'queued_daily_starters', 'Queued Daily Starters worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Starters", queued_job_key:"daily-probable-pitchers"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Starters",
      queued_job_key: "daily-probable-pitchers",
      queued_worker_name: "alphadog-v2-daily-probable-pitchers",
      note: "Queued Daily Starters only. This reads official MLB probable/actual starter source context plus prepared-board relevance and writes DAILY_DB daily_starters context. It does not rebuild calendar, mutate boards, score, rank, or write final candidates. Tap ORCHESTRATOR > Wake."
    });
  }

  if (job === "orchestrator_enqueue_daily_lineups") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-lineups' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Lineups",
        note: "Existing Daily Lineups source-probe queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_lineups_probe_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_lineups_probe_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Lineups",
      mode: "source_probe",
      created_at: now,
      exact_worker_only: true,
      source_probe_only: false,
      live_gated_lineup_writes_ready: true,
      production_lineup_writes_enabled: true,
      derived_backup_write_enabled: false,
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      primary_endpoint: "/api/v1/game/{gamePk}/boxscore",
      fallback_endpoint: "/api/v1.1/game/{gamePk}/feed/live",
      writes_daily_lineups_context: true,
      live_gated_confirmed_lineup_writes_only: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_board_mutation: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-lineups', 'alphadog-v2-daily-lineups', 'Daily', 'daily', 'Daily Lineups Live-Gated', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_lineups', 'INFO', 'queued_daily_lineups_source_probe', 'Queued Daily Lineups live-gated worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Lineups", queued_job_key:"daily-lineups"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Lineups",
      queued_job_key: "daily-lineups",
      queued_worker_name: "alphadog-v2-daily-lineups",
      note: "Queued Daily Lineups LIVE-GATED worker. It reads TEAM_DB calendar + SCORE_DB prepared safe rows, writes confirmed lineup rows only after official MLB battingOrder posts, does not mutate boards, score, rank, or write final candidates. Tap ORCHESTRATOR > Wake."
    });
  }


  if (job === "orchestrator_enqueue_daily_player_availability") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-player-availability' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Availability",
        note: "Existing Daily Player Availability queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_player_availability_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_player_availability_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Availability",
      mode: "daily_player_availability_refresh_window",
      created_at: now,
      exact_worker_only: true,
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      writes_daily_player_availability_sidecar_only: true,
      sidecar_tables_only: true,
      legacy_daily_player_availability_stub_untouched: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups: true,
      no_board_mutation: true,
      no_weather: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-player-availability', 'alphadog-v2-daily-player-availability', 'Daily', 'daily', 'Daily Player Availability', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_player_availability', 'INFO', 'queued_daily_player_availability', 'Queued Daily Player Availability worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Availability", queued_job_key:"daily-player-availability"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Availability",
      queued_job_key: "daily-player-availability",
      queued_worker_name: "alphadog-v2-daily-player-availability",
      note: "Queued Daily Player Availability only. This reads prepared safe board rows, official MLB roster/transaction sources, and writes DAILY_DB sidecar availability context. It does not mutate boards, score, rank, or write final candidates. Tap ORCHESTRATOR > Wake."
    });
  }


  if (job === "orchestrator_enqueue_daily_weather") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-weather' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Weather / Roof",
        note: "Existing Daily Weather/Roof queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_weather_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_weather_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Weather / Roof",
      mode: "daily_weather_refresh_window",
      created_at: now,
      exact_worker_only: true,
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      writes_daily_weather_roof_context_only: true,
      unified_weather_roof_context: true,
      volatile_current_retention_today_tomorrow_only: true,
      static_reference_data_read_only: true,
      legacy_daily_weather_stub_untouched: true,
      legacy_daily_roof_status_stub_untouched: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups: true,
      no_daily_player_availability_duplication: true,
      no_board_mutation: true,
      no_bullpen: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-weather', 'alphadog-v2-daily-weather', 'Daily', 'daily', 'Daily Weather / Roof', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_weather', 'INFO', 'queued_daily_weather_roof', 'Queued Daily Weather/Roof worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Weather / Roof", queued_job_key:"daily-weather"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Weather / Roof",
      queued_job_key: "daily-weather",
      queued_worker_name: "alphadog-v2-daily-weather",
      note: "Queued Daily Weather/Roof only. This reads prepared safe board rows, TEAM_DB calendar, REF_DB stadium/park references, MLB weather and weather-provider fallback sources, then writes DAILY_DB v2 weather sidecar context. Current volatile rows are pruned to today/tomorrow. It does not mutate boards, score, rank, or write final candidates. Tap ORCHESTRATOR > Wake."
    });
  }



  if (job === "orchestrator_enqueue_daily_bullpen_availability") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-bullpen-availability' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Bullpen",
        note: "Existing Daily Bullpen Availability queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_bullpen_availability_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_bullpen_availability_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Bullpen",
      mode: "daily_bullpen_availability_refresh_window",
      created_at: now,
      exact_worker_only: true,
      internal_source_only_v0_1: true,
      primary_source_table: "TEAM_DB.bullpen_history",
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      writes_daily_bullpen_context_only: true,
      volatile_current_retention_today_tomorrow_only: true,
      no_external_sources: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_dependency: true,
      no_board_mutation: true,
      no_weather: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-bullpen-availability', 'alphadog-v2-daily-bullpen-availability', 'Daily', 'daily', 'Daily Bullpen Availability', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_bullpen_availability', 'INFO', 'queued_daily_bullpen_availability', 'Queued Daily Bullpen Availability worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Bullpen", queued_job_key:"daily-bullpen-availability"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Bullpen",
      queued_job_key: "daily-bullpen-availability",
      queued_worker_name: "alphadog-v2-daily-bullpen-availability",
      note: "Queued Daily Bullpen Availability only. This reads prepared safe board rows, TEAM_DB calendar, and TEAM_DB bullpen_history, then writes DAILY_DB sidecar bullpen context. It does not mutate boards, score, rank, or write final candidates. Tap ORCHESTRATOR > Wake."
    });
  }

  if (job === "orchestrator_enqueue_daily_team_schedule_spot") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-team-schedule-spot' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Team Spot",
        note: "Existing Daily Team Schedule Spot queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_team_schedule_spot_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_team_schedule_spot_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Team Spot",
      mode: "daily_team_schedule_spot_refresh_window",
      created_at: now,
      exact_worker_only: true,
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      writes_daily_team_schedule_spot_context_only: true,
      volatile_current_snapshot_issue_retention_today_tomorrow_only: true,
      batches_retained_for_audit: true,
      no_external_sources: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_daily_weather_duplication: true,
      no_daily_bullpen_duplication: true,
      no_board_mutation: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT OR REPLACE INTO control_worker_registry (worker_name, job_key, worker_group, phase_key, display_name, enabled, endpoint_url, service_binding_name, safe_mode, notes) VALUES ('alphadog-v2-daily-schedule','daily-team-schedule-spot','04 Daily','daily','Daily Team Schedule Spot',1,'https://alphadog-v2-daily-schedule.rodolfoaamattos.workers.dev','DAILY_SCHEDULE_WORKER',1,'Daily Context Phase 6 team schedule spot context; prepared-board relevant only; today/tomorrow volatile retention')"
    ).run();

    await env.CONFIG_DB.prepare(
      "INSERT OR REPLACE INTO config_worker_definitions (worker_name, job_key, worker_group, phase_key, display_name, enabled, schedule_profile_key, notes) VALUES ('alphadog-v2-daily-schedule','daily-team-schedule-spot','04 Daily','daily','Daily Team Schedule Spot',1,'manual_or_orchestrated','Daily Context Phase 6 team schedule spot context; no scoring/ranking/final board')"
    ).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-team-schedule-spot', 'alphadog-v2-daily-schedule', 'Daily', 'daily', 'Daily Team Schedule Spot', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_team_schedule_spot', 'INFO', 'queued_daily_team_schedule_spot', 'Queued Daily Team Schedule Spot worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Team Spot", queued_job_key:"daily-team-schedule-spot"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Team Spot",
      queued_job_key: "daily-team-schedule-spot",
      queued_worker_name: "alphadog-v2-daily-schedule",
      note: "Queued Daily Team Schedule Spot only. This reads TEAM_DB calendar, TEAM_DB team_game_logs, SCORE_DB prepared safe rows, REF_DB teams/stadiums, then writes DAILY_DB team schedule spot context with today/tomorrow volatile retention. It does not mutate boards, score, rank, or write final candidates. Tap ORCHESTRATOR > Wake."
    });
  }

  if (job === "orchestrator_enqueue_daily_umpire_context") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-umpire-context' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DAILY JOBS > Umpire",
        note: "Existing Daily Umpire Context queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "daily_umpire_context_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_umpire_context_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Umpire",
      mode: "daily_umpire_context_refresh_window",
      created_at: now,
      exact_worker_only: true,
      prepared_board_relevance_only: true,
      anchors_to_mlb_game_calendar_game_pk: true,
      writes_daily_umpire_context_only: true,
      game_level_one_row_per_game_pk: true,
      volatile_current_snapshot_issue_retention_today_tomorrow_only: true,
      batches_retained_for_audit: true,
      missing_assignment_warning_only_v0_1: true,
      official_mlb_source_probe_only: true,
      no_secondary_scrapers: true,
      no_paid_sources: true,
      no_umpire_tendencies_without_verified_history: true,
      no_calendar_rebuild: true,
      no_daily_game_status_duplication: true,
      no_daily_starters_duplication: true,
      no_daily_lineups_duplication: true,
      no_daily_player_availability_duplication: true,
      no_daily_weather_duplication: true,
      no_daily_bullpen_duplication: true,
      no_daily_team_schedule_spot_duplication: true,
      no_board_mutation: true,
      no_market_odds: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT OR REPLACE INTO control_worker_registry (worker_name, job_key, worker_group, phase_key, display_name, enabled, endpoint_url, service_binding_name, safe_mode, notes) VALUES ('alphadog-v2-daily-usage-pulse','daily-umpire-context','04 Daily','daily','Daily Umpire Context',1,'https://alphadog-v2-daily-usage-pulse.rodolfoaamattos.workers.dev','DAILY_USAGE_PULSE_WORKER',1,'Daily Context Phase 7 game-level umpire context; official MLB source probe only; prepared-board relevant only; today/tomorrow volatile retention')"
    ).run();

    await env.CONFIG_DB.prepare(
      "INSERT OR REPLACE INTO config_worker_definitions (worker_name, job_key, worker_group, phase_key, display_name, enabled, schedule_profile_key, notes) VALUES ('alphadog-v2-daily-usage-pulse','daily-umpire-context','04 Daily','daily','Daily Umpire Context',1,'manual_or_orchestrated','Daily Context Phase 7 umpire context; no scoring/ranking/final board; no secondary scraper')"
    ).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-umpire-context', 'alphadog-v2-daily-usage-pulse', 'Daily', 'daily', 'Daily Umpire Context', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_umpire_context', 'INFO', 'queued_daily_umpire_context', 'Queued Daily Umpire Context worker', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Umpire", queued_job_key:"daily-umpire-context"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DAILY JOBS > Umpire",
      queued_job_key: "daily-umpire-context",
      queued_worker_name: "alphadog-v2-daily-usage-pulse",
      deployed_worker_slot: "existing daily-usage-pulse dummy worker slot; no worker_manifest/global deploy file changed",
      note: "Queued Daily Umpire Context only. This uses the existing daily-usage-pulse dummy worker slot to avoid worker_manifest/global deploy changes. It reads SCORE_DB prepared safe rows and TEAM_DB calendar, probes official MLB live/boxscore endpoints for game-level umpire assignment, then writes DAILY_DB umpire sidecar context with today/tomorrow volatile retention. Missing assignment is warning-only in v0.1. It does not mutate boards, score, rank, or write final candidates. Tap ORCHESTRATOR > Wake."
    });
  }

  if (job === "orchestrator_enqueue_daily_context_certifier") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'daily-certifier' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();
    if (existing) return jsonResponse({ ok:true, data_ok:true, version, job, status:"already_queued", request_id: existing.request_id, existing, visible_button:"DAILY JOBS > Context Cert", note:"Existing Daily Context Certifier queue row found. Use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect." });

    const requestId = "daily_context_certifier_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_context_certifier_" + Date.now().toString(36);
    const input = { source:"control_room", visible_button:"DAILY JOBS > Context Cert", mode:"daily_context_readiness_refresh_window", created_at: now, exact_worker_only:true, readiness_enrichment_only:true, not_strict_all_context_enforcement:true, prepared_board_relevance_only:true, reads_locked_daily_context_sidecars_only:true, volatile_current_issue_retention_today_tomorrow_only:true, batches_retained_for_audit:true, no_external_calls:true, no_sidecar_repair:true, no_calendar_rebuild:true, no_daily_game_status_duplication:true, no_board_mutation:true, no_market_odds:true, no_score_db_mutation:true, no_scoring:true, no_ranking:true, no_final_board:true, no_old_production_touch:true };

    await env.CONTROL_DB.prepare(
      "INSERT OR REPLACE INTO control_worker_registry (worker_name, job_key, worker_group, phase_key, display_name, enabled, endpoint_url, service_binding_name, safe_mode, notes) VALUES ('alphadog-v2-daily-certifier','daily-certifier','04 Daily','daily','Daily Context Certifier',1,'https://alphadog-v2-daily-certifier.rodolfoaamattos.workers.dev','DAILY_CERTIFIER_WORKER',1,'Daily Context Readiness / Enrichment Certifier; reads locked daily sidecars and prepared board; today/tomorrow volatile current/issue retention; no scoring/ranking/final board')"
    ).run();
    await env.CONFIG_DB.prepare(
      "INSERT OR REPLACE INTO config_worker_definitions (worker_name, job_key, worker_group, phase_key, display_name, enabled, schedule_profile_key, notes) VALUES ('alphadog-v2-daily-certifier','daily-certifier','04 Daily','daily','Daily Context Certifier',1,'manual_or_orchestrated','Daily context readiness/enrichment ledger; warning/gap model, not strict all-context enforcement; no scoring/ranking/final board')"
    ).run();
    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-certifier', 'alphadog-v2-daily-certifier', 'Daily', 'daily', 'Daily Context Certifier', 'pending', 6, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();
    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_context_certifier', 'INFO', 'queued_daily_context_certifier', 'Queued Daily Context Readiness / Enrichment Certifier', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Context Cert", queued_job_key:"daily-certifier"})).run();
    return jsonResponse({ ok:true, data_ok:true, version, job, status:"queued", request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Context Cert", queued_job_key:"daily-certifier", queued_worker_name:"alphadog-v2-daily-certifier", note:"Queued Daily Context Certifier only. It reads SCORE_DB prepared eligible rows, TEAM_DB calendar, and all locked DAILY_DB sidecar current/batch tables, then writes DAILY_DB readiness current/issues with today/tomorrow-only retention. Missing late context becomes warning/enrichment gap unless true integrity/eligibility blocker. It does not mutate boards, score, rank, or final candidates. Tap ORCHESTRATOR > Wake." });
  }


  if (job === "orchestrator_enqueue_daily_context_full_run") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE job_key = 'daily-context-full-run' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({ ok: true, data_ok: true, version, job, status: "already_queued", request_id: existing.request_id, existing, visible_button: "DAILY JOBS > Full Run", backend_chain_only: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Existing Daily Context Full Run parent queue row found. Do not enqueue a duplicate. Backend auto-pump/cron continues the chain; ORCHESTRATOR > Wake is manual testing/rescue only." });
    }

    const requestId = "daily_context_full_run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_daily_context_full_run_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DAILY JOBS > Full Run",
      mode: "daily_context_full_run_backend_chain",
      created_at: now,
      approved_chain_order: ["daily-probable-pitchers", "daily-lineups", "daily-player-availability", "daily-weather", "daily-bullpen-availability", "daily-team-schedule-spot", "daily-umpire-context", "daily-certifier"],
      approved_stage_order: ["daily_starters", "daily_lineups", "daily_player_availability", "daily_weather_roof", "daily_bullpen_availability", "daily_team_schedule_spot", "daily_umpire_context", "daily_context_certifier"],
      stop_on_first_failed_stage: true,
      backend_chain_only: true,
      auto_pump_requested: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_generic_dispatch: true,
      no_daily_game_status_duplication: true,
      daily_context_enrichment_not_strict_enforcement: true,
      today_tomorrow_retention_only: true,
      no_board_refresh_included: true,
      no_incremental_morning_full_run: true,
      no_static_work: true,
      no_score_db_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'daily-context-full-run', 'alphadog-v2-orchestrator', 'Daily', 'daily', 'Daily Context Full Run Backend Chain', 'pending', 6, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES ('DAILY_CONTEXT_FULL_RUN', 0, CURRENT_TIMESTAMP)"
    ).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_daily_context_full_run', 'INFO', 'queued_daily_context_full_run', 'Queued Daily Context Full Run parent backend chain job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DAILY JOBS > Full Run", approved_chain_order:input.approved_chain_order, backend_chain_only:true, auto_pump_requested:true})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", { source:"control_room_daily_context_full_run_enqueue", max_cycles:12, max_jobs_per_cycle:1, max_ms:30000, max_pump_chains:40, no_browser_loop:true, cron_rescue_only:true, backend_budget_loop_requested:true }));
    }

    return jsonResponse({ ok: true, data_ok: true, version, job, status: "queued", request_id: requestId, chain_id: chainId, visible_button: "DAILY JOBS > Full Run", queued_job_key: "daily-context-full-run", queued_worker_name: "alphadog-v2-orchestrator", approved_chain_order: input.approved_chain_order, backend_chain_only: true, auto_pump_triggered: true, browser_auto_pump: false, note: "Queued Daily Context Full Run parent chain: Starters, Lineups, Availability, Weather/Roof, Bullpen, Team Spot, Umpire, then Context Cert. Backend service-binding auto-pump was launched; browser may close now. ORCHESTRATOR > Wake is manual testing/rescue only." });
  }

  if (job === "orchestrator_enqueue_static_teams") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'static-teams' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "STATIC > Teams"
      });
    }

    const requestId = "static_teams_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "STATIC > Teams",
      mode: "static_team_dictionary_seed",
      created_at: now,
      allowed_writes: ["REF_DB.ref_teams", "REF_DB.ref_team_aliases"],
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_manual_repeated_wake_required: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-teams', 'alphadog-v2-static-teams', 'Static', 'static', 'Static MLB Team Dictionary Seed', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_static_teams', 'INFO', 'queued_static_teams', 'Queued exact Static Team Dictionary worker seed job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"STATIC > Teams"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "STATIC > Teams",
      queued_job_key: "static-teams",
      queued_worker_name: "alphadog-v2-static-teams",
      note: "Queued in CONTROL_DB. Use ORCHESTRATOR > Wake to process safe backend chunks now, then ORCHESTRATOR > Logs and V2 SAFE ACTIONS > Queue."
    });
  }


  if (job === "orchestrator_enqueue_static_stadiums") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'static-stadiums' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "STATIC > Stadiums"
      });
    }

    const requestId = "static_stadiums_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "STATIC > Stadiums",
      mode: "static_stadium_dictionary_seed",
      created_at: now,
      allowed_writes: ["REF_DB.ref_stadiums", "REF_DB.ref_stadium_aliases"],
      no_team_db_writes: true,
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_sleeper_work: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_manual_repeated_wake_required: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-stadiums', 'alphadog-v2-static-stadiums', 'Static', 'static', 'Static MLB Stadium Dictionary Seed', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_static_stadiums', 'INFO', 'queued_static_stadiums', 'Queued exact Static Stadium Dictionary worker seed job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"STATIC > Stadiums"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "STATIC > Stadiums",
      queued_job_key: "static-stadiums",
      queued_worker_name: "alphadog-v2-static-stadiums",
      note: "Queued in CONTROL_DB. Use ORCHESTRATOR > Wake to process safe backend chunks now, then ORCHESTRATOR > Logs and V2 SAFE ACTIONS > Queue."
    });
  }

  if (job === "orchestrator_enqueue_static_park_factors") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'static-park-factors' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "STATIC > Park Factors"
      });
    }

    const requestId = "static_park_factors_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "STATIC > Park Factors",
      mode: "static_park_factors_baseball_savant_source_refresh",
      created_at: now,
      source_name: "Baseball Savant / MLB Statcast Park Factors",
      source_mode: "automated_html_payload_regex",
      allowed_writes: ["REF_DB.ref_park_factors"],
      no_fake_factors: true,
      no_neutral_placeholder_values: true,
      no_team_db_writes: true,
      no_prizepicks_board_mutation: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_sleeper_work: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_manual_repeated_wake_required: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-park-factors', 'alphadog-v2-static-park-factors', 'Static', 'static', 'Static MLB Park Factors Source Refresh', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_static_park_factors', 'INFO', 'queued_static_park_factors', 'Queued exact Static Park Factors Baseball Savant source refresh job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"STATIC > Park Factors"})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "STATIC > Park Factors",
      queued_job_key: "static-park-factors",
      queued_worker_name: "alphadog-v2-static-park-factors",
      note: "Queued in CONTROL_DB. Use ORCHESTRATOR > Wake to process safe backend chunks now, then ORCHESTRATOR > Logs and V2 SAFE ACTIONS > Queue."
    });
  }

  if (job === "orchestrator_enqueue_static_players") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'static-players' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "STATIC > Players",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Static Players queue row found. Control Room queues only. Orchestrator scheduled backend/cron will continue it; ORCHESTRATOR > Wake is manual backend testing only."
      });
    }

    const requestId = "static_players_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "STATIC > Players",
      mode: "static_players_40man_identity_seed",
      created_at: now,
      source_name: "MLB StatsAPI 40-man roster endpoint",
      source_mode: "ref_teams_driven_mlb_statsapi_40man_roster",
      endpoint_pattern: "/teams/{mlb_team_id}/roster/40Man",
      allowed_writes: ["REF_DB.ref_players", "REF_DB.ref_player_aliases", "REF_DB.ref_rosters"],
      no_26man_only_scope: true,
      no_every_minor_leaguer_scope: true,
      no_person_detail_hydration_in_v0_1_0: true,
      no_prizepicks_board_mutation: true,
      no_prizepicks_alias_guessing: true,
      no_sleeper_alias_guessing: true,
      no_opponent_backfill: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_sleeper_work: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_manual_repeated_wake_required: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-players', 'alphadog-v2-static-players', 'Static', 'static', 'Static MLB Player 40-Man Identity Seed', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_static_players', 'INFO', 'queued_static_players', 'Queued exact Static Players MLB StatsAPI 40-man identity seed job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"STATIC > Players", backend_scheduled_continuation:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "STATIC > Players",
      queued_job_key: "static-players",
      queued_worker_name: "alphadog-v2-static-players",
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued in CONTROL_DB only. Browser may close now. Orchestrator scheduled backend/cron owns continuation; ORCHESTRATOR > Wake is manual backend testing only."
    });
  }


  if (job === "orchestrator_enqueue_static_prop_taxonomy") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'static-prop-taxonomy' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "STATIC > Prop Taxonomy",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Static Prop Taxonomy queue row found. Control Room queues only. Orchestrator scheduled backend/cron will process it; ORCHESTRATOR > Wake is manual backend testing only."
      });
    }

    const requestId = "static_prop_taxonomy_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "STATIC > Prop Taxonomy",
      mode: "static_prop_taxonomy_alias_certifier",
      created_at: now,
      allowed_writes: ["CONFIG_DB.config_prop_taxonomy", "REF_DB.ref_prop_aliases source_key='prizepicks_github'"],
      source_key: "prizepicks_github",
      expected_taxonomy_rows_after_run: 21,
      expected_prizepicks_alias_rows_after_run: 20,
      no_prizepicks_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_sleeper_work: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_manual_repeated_wake_required: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-prop-taxonomy', 'alphadog-v2-static-prop-taxonomy', 'Static', 'static', 'Static MLB Prop Taxonomy / Alias Certifier', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_static_prop_taxonomy', 'INFO', 'queued_static_prop_taxonomy', 'Queued exact Static Prop Taxonomy taxonomy/alias certifier job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"STATIC > Prop Taxonomy", backend_scheduled_continuation:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "STATIC > Prop Taxonomy",
      queued_job_key: "static-prop-taxonomy",
      queued_worker_name: "alphadog-v2-static-prop-taxonomy",
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued in CONTROL_DB only. Browser may close now. Orchestrator scheduled backend/cron owns processing; ORCHESTRATOR > Wake is manual backend testing only."
    });
  }



  if (job === "orchestrator_enqueue_base_calendar") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'delta-certifier' AND worker_name = 'alphadog-v2-delta-certifier' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BASE > Calendar",
        queued_job_key: "delta-certifier",
        queued_worker_name: "alphadog-v2-delta-certifier",
        mode: "game_calendar_full_seed",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Calendar queue row found. Tap ORCHESTRATOR > Wake until the queue completes. Browser does not run the job."
      });
    }

    const requestId = "game_calendar_full_seed_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_game_calendar_full_seed_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Calendar",
      mode: "game_calendar_full_seed",
      created_at: now,
      season: 2026,
      season_start_date: "2026-03-01",
      season_end_date: "2026-11-30",
      game_types: "R,P",
      full_calendar_seed: true,
      official_date_is_canonical_anchor: true,
      upsert_by_game_pk_only: true,
      no_hard_delete: true,
      no_rolling_window: true,
      no_source_history_mutation: true,
      no_repair_jobs_created: true,
      no_coverage_rebuild_in_full_seed: true,
      no_scoring: true,
      no_ranking: true,
      no_board_mutation: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'delta-certifier', 'alphadog-v2-delta-certifier', 'Base', 'base', 'MLB Full Calendar Seed', 'pending', 4, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_calendar', 'INFO', 'queued_game_calendar_full_seed', 'Queued exact MLB full calendar seed job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Calendar", mode:"game_calendar_full_seed", season:2026, game_types:"R,P", backend_scheduled_continuation:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Calendar",
      queued_job_key: "delta-certifier",
      queued_worker_name: "alphadog-v2-delta-certifier",
      mode: "game_calendar_full_seed",
      season: 2026,
      season_start_date: "2026-03-01",
      season_end_date: "2026-11-30",
      game_types: "R,P",
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued full MLB calendar seed in CONTROL_DB only. Tap ORCHESTRATOR > Wake to run the backend job."
    });
  }


  if (job === "orchestrator_enqueue_delta_calendar") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'delta-certifier' AND worker_name = 'alphadog-v2-delta-certifier' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DELTA > Calendar",
        queued_job_key: "delta-certifier",
        queued_worker_name: "alphadog-v2-delta-certifier",
        mode: "game_calendar_differential_check_update",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Calendar delta/checker queue row found. Tap ORCHESTRATOR > Wake until the queue completes. Browser does not run the job."
      });
    }

    const requestId = "game_calendar_differential_check_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_game_calendar_differential_check_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Calendar",
      mode: "game_calendar_differential_check_update",
      created_at: now,
      season: 2026,
      season_start_date: "2026-03-01",
      season_end_date: "2026-11-30",
      game_types: "R,P",
      full_calendar_check_every_run: true,
      full_calendar_template_stage_table: "mlb_game_calendar_stage",
      update_main_from_differential_only: true,
      coverage_rebuild_enabled: true,
      coverage_layers: ["hitter_game_logs","pitcher_game_logs","team_game_logs","starter_history","bullpen_history","hitter_splits","pitcher_splits","hitter_metrics","pitcher_metrics"],
      official_date_is_canonical_anchor: true,
      game_level_anchor_for_logs_team_starter_bullpen: true,
      game_date_snapshot_anchor_for_splits: true,
      game_date_metric_input_anchor_for_metrics: true,
      no_rolling_window: true,
      no_hard_delete: true,
      no_source_history_mutation: true,
      no_repair_jobs_created: true,
      no_scoring: true,
      no_ranking: true,
      no_board_mutation: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'delta-certifier', 'alphadog-v2-delta-certifier', 'Delta', 'delta', 'MLB Calendar Differential Checker', 'pending', 4, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_calendar', 'INFO', 'queued_game_calendar_differential_check', 'Queued exact MLB full-calendar differential checker/updater job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Calendar", mode:"game_calendar_differential_check_update", season:2026, game_types:"R,P", full_calendar_check_every_run:true, no_rolling_window:true, backend_scheduled_continuation:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Calendar",
      queued_job_key: "delta-certifier",
      queued_worker_name: "alphadog-v2-delta-certifier",
      mode: "game_calendar_differential_check_update",
      season: 2026,
      season_start_date: "2026-03-01",
      season_end_date: "2026-11-30",
      game_types: "R,P",
      full_calendar_check_every_run: true,
      coverage_rebuild_enabled: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued full-calendar differential checker/updater in CONTROL_DB only. Tap ORCHESTRATOR > Wake to run the backend job."
    });
  }

  if (job === "orchestrator_enqueue_base_hitter_metrics") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-hitter-metrics' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BASE > Hitter Metrics",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Base Hitter Metrics queue row found. Tap ORCHESTRATOR > Wake until the queue completes. Browser does not run the job."
      });
    }

    const requestId = "base_hitter_metrics_snapshot_prep_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_base_hitter_metrics_snapshot_prep_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Hitter Metrics",
      mode: "snapshot_promote_retained_stage",
      created_at: now,
      worker_scope: "v0_4_0_snapshot_promote_retained_stage",
      source_name: "D1 compact snapshot prep from completed STATS_HITTER_DB.hitter_metric_stage base batch",
      source_key: "d1_hitter_metric_stage_snapshot_prep",
      source_season: 2026,
      config_profile_id: "hitter_metrics_neutral_v0_3_0_stage_only",
      formula_version: "hitter_metrics_formula_v0_3_0_stage_only",
      allowed_writes: [
        "STATS_HITTER_DB.hitter_metric_batches",
        "STATS_HITTER_DB.hitter_metric_stage",
        "STATS_HITTER_DB.hitter_metric_outcomes",
        "STATS_HITTER_DB.hitter_metric_cursor",
        "STATS_HITTER_DB.hitter_metric_certifications",
        "STATS_HITTER_DB.hitter_metric_snapshot_batches",
        "STATS_HITTER_DB.hitter_metric_snapshot_stage",
        "STATS_HITTER_DB.hitter_schema_migrations",
        "CONFIG_DB.config_metric_definitions",
        "CONFIG_DB.config_metric_windows",
        "CONFIG_DB.config_metric_thresholds",
        "CONFIG_DB.config_metric_formula_versions",
        "CONFIG_DB.config_metric_calibration_profiles",
        "CONFIG_DB.config_schema_migrations"
      ],
      no_live_metric_promotion: true,
      no_hitter_game_log_mutation: true,
      no_hitter_split_mutation: true,
      no_pitcher_mutation: true,
      no_team_logs: true,
      no_starter_history: true,
      no_bullpen_history: true,
      no_prizepicks_board_mutation: true,
      no_sleeper_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_external_mlb_calls: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true,
      wake_until_complete_requested: true,
      snapshot_prep_stage_only: true,
      v0_4_0_snapshot_promote_retained_stage: true,
      source_base_stage_required: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-hitter-metrics', 'alphadog-v2-base-hitter-metrics', 'Base', 'base', 'Base Hitter Metrics v0.3.4 Snapshot Prep Stage', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_hitter_metrics', 'INFO', 'queued_base_hitter_metrics_snapshot_prep_stage_only', 'Queued exact Base Hitter Metrics v0.3.4 snapshot-prep stage-only job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Hitter Metrics", snapshot_promote_retained_stage:true, live_snapshot_promotion:true, no_external_mlb_calls:true, no_scoring:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Hitter Metrics",
      queued_job_key: "base-hitter-metrics",
      queued_worker_name: "alphadog-v2-base-hitter-metrics",
      v0_4_0_snapshot_promote_retained_stage: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued v0.3.4 snapshot-prep stage-only. Tap ORCHESTRATOR > Wake to dispatch. Compact snapshot stage rows only; no live metric promotion, no source table mutation, no MLB calls, no scoring."
    });
  }


  if (job === "orchestrator_enqueue_delta_hitter_metrics") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-hitter-metrics' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DELTA > Hitter Metrics",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Hitter Metrics queue row found. Backend continuation owns remaining affected-player delta work; browser does not run the job."
      });
    }

    const requestId = "delta_hitter_metrics_affected_recalc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_delta_hitter_metrics_affected_recalc_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Hitter Metrics",
      mode: "delta_recalculate_affected_players",
      created_at: now,
      worker_scope: "v0_5_0_affected_player_recalculation_delta",
      source_name: "D1 hitter_game_logs and hitter_splits affected-player delta into hitter_metric_stage, hitter_metric_snapshot_stage, and hitter_metric_snapshots",
      source_key: "d1_hitter_metrics_affected_player_delta",
      source_season: 2026,
      config_profile_id: "hitter_metrics_neutral_v0_3_0_stage_only",
      formula_version: "hitter_metrics_formula_v0_3_0_stage_only",
      allowed_writes: [
        "STATS_HITTER_DB.hitter_metric_batches",
        "STATS_HITTER_DB.hitter_metric_stage scoped affected-player batch rows",
        "STATS_HITTER_DB.hitter_metric_snapshot_batches",
        "STATS_HITTER_DB.hitter_metric_snapshot_stage scoped affected-player retained rows",
        "STATS_HITTER_DB.hitter_metric_snapshots scoped affected-player live upserts",
        "STATS_HITTER_DB.hitter_metric_cursor"
      ],
      blocked_writes: [
        "STATS_HITTER_DB.hitter_game_logs",
        "STATS_HITTER_DB.hitter_splits",
        "MARKET_DB",
        "SCORE_DB",
        "final_board"
      ],
      no_full_rebuild: true,
      no_external_mlb_calls: true,
      no_source_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      v0_5_0_affected_player_recalculation_delta: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-hitter-metrics', 'alphadog-v2-base-hitter-metrics', 'Delta', 'delta', 'Delta Hitter Metrics Affected-Player Recalc', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_hitter_metrics', 'INFO', 'queued_delta_hitter_metrics_affected_player_recalc', 'Queued exact Delta Hitter Metrics v0.5.0 affected-player recalculation delta', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Hitter Metrics", no_full_rebuild:true, no_external_mlb_calls:true, no_source_mutation:true, no_scoring:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Hitter Metrics",
      queued_job_key: "base-hitter-metrics",
      queued_worker_name: "alphadog-v2-base-hitter-metrics",
      mode: "delta_recalculate_affected_players",
      true_affected_player_delta: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued v0.5.0 true affected-player recalculation delta. Tap ORCHESTRATOR > Wake. It recalculates only hitters touched by fresh game logs/splits, then scoped-upserts live snapshots. No source mutation, no MLB calls, no scoring."
    });
  }

  if (job === "orchestrator_enqueue_delta_pitcher_metrics") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-pitcher-metrics' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DELTA > Pitcher Metrics",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Pitcher Metrics queue row found. Backend continuation owns remaining affected-player delta work; browser does not run the job."
      });
    }

    const requestId = "delta_pitcher_metrics_affected_recalc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_delta_pitcher_metrics_affected_recalc_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Pitcher Metrics",
      mode: "delta_recalculate_affected_players",
      created_at: now,
      worker_scope: "v0_5_2_affected_player_recalculation_delta",
      source_name: "D1 pitcher_game_logs and pitcher_splits affected-player delta into pitcher_metric_stage, pitcher_metric_snapshot_stage, and pitcher_metric_snapshots",
      source_key: "d1_pitcher_metrics_affected_player_delta",
      source_season: 2026,
      config_profile_id: "pitcher_metrics_neutral_v0_3_0_base_stage",
      formula_version: "pitcher_metrics_formula_v0_3_0_base_stage",
      allowed_writes: [
        "STATS_PITCHER_DB.pitcher_metric_batches",
        "STATS_PITCHER_DB.pitcher_metric_stage scoped affected-player batch rows",
        "STATS_PITCHER_DB.pitcher_metric_snapshot_batches",
        "STATS_PITCHER_DB.pitcher_metric_snapshot_stage scoped affected-player retained rows",
        "STATS_PITCHER_DB.pitcher_metric_snapshots scoped affected-player live upserts",
        "STATS_PITCHER_DB.pitcher_metric_cursor"
      ],
      blocked_writes: [
        "STATS_PITCHER_DB.pitcher_game_logs",
        "STATS_PITCHER_DB.pitcher_splits",
        "MARKET_DB",
        "SCORE_DB",
        "final_board"
      ],
      no_full_rebuild: true,
      no_external_mlb_calls: true,
      no_source_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      v0_5_2_affected_player_recalculation_delta: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-metrics', 'alphadog-v2-base-pitcher-metrics', 'Delta', 'delta', 'Delta Pitcher Metrics Affected-Player Recalc', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_pitcher_metrics', 'INFO', 'queued_delta_pitcher_metrics_affected_player_recalc', 'Queued exact Delta Pitcher Metrics v0.5.2 affected-player recalculation delta', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Pitcher Metrics", no_full_rebuild:true, no_external_mlb_calls:true, no_source_mutation:true, no_scoring:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Pitcher Metrics",
      queued_job_key: "base-pitcher-metrics",
      queued_worker_name: "alphadog-v2-base-pitcher-metrics",
      mode: "delta_recalculate_affected_players",
      true_affected_player_delta: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued v0.5.2 true affected-player recalculation delta. Tap ORCHESTRATOR > Wake. It recalculates only pitchers touched by fresh game logs/splits, then scoped-upserts live snapshots. No source mutation, no MLB calls, no scoring."
    });
  }

  if (job === "orchestrator_enqueue_base_pitcher_metrics") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-pitcher-metrics' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BASE > Pitcher Metrics",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Base Pitcher Metrics queue row found. Do not duplicate. Backend continuation owns any remaining work; browser does not run the job."
      });
    }

    const requestId = "base_pitcher_metrics_snapshot_promote_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_base_pitcher_metrics_snapshot_promote_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Pitcher Metrics",
      mode: "snapshot_promote_retained_stage",
      created_at: now,
      worker_scope: "v0_4_0_snapshot_promote_retained_stage",
      source_name: "D1 audit from certified STATS_PITCHER_DB.pitcher_game_logs and STATS_PITCHER_DB.pitcher_splits",
      source_key: "d1_pitcher_metric_snapshot_stage_promote_retained",
      source_season: 2026,
      config_profile_id: "pitcher_metrics_neutral_v0_3_0_base_stage",
      formula_version: "pitcher_metrics_formula_v0_3_0_base_stage",
      allowed_writes: [
        "STATS_PITCHER_DB.pitcher_metric_schema_migrations",
        "STATS_PITCHER_DB.pitcher_metric_batches",
        "STATS_PITCHER_DB.pitcher_metric_snapshot_batches",
        "STATS_PITCHER_DB.pitcher_metric_snapshot_stage read-only retained source",
        "STATS_PITCHER_DB.pitcher_metric_snapshots",
        "STATS_PITCHER_DB.pitcher_metric_stage read-only source",
        "STATS_PITCHER_DB.pitcher_metric_cursor",
        "STATS_PITCHER_DB.pitcher_metric_certifications",
        "CONFIG_DB.config_metric_definitions pitcher-domain rows only",
        "CONFIG_DB.config_metric_windows pitcher-domain rows only",
        "CONFIG_DB.config_metric_thresholds pitcher-domain rows only",
        "CONFIG_DB.config_metric_formula_versions pitcher-domain rows only",
        "CONFIG_DB.config_metric_calibration_profiles pitcher-domain rows only"
      ],
      live_metric_promotion_to_snapshot_table_only: true,
      no_pitcher_game_log_mutation: true,
      no_pitcher_split_mutation: true,
      no_hitter_mutation: true,
      no_team_logs: true,
      no_starter_history: true,
      no_bullpen_history: true,
      no_prizepicks_board_mutation: true,
      no_sleeper_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_external_mlb_calls: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true,
      wake_until_complete_requested: true,
      snapshot_promote_retained_stage: true,
      retained_stage_preserved: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-metrics', 'alphadog-v2-base-pitcher-metrics', 'Base', 'base', 'Base Pitcher Metrics v0.4.0 Snapshot Promote Retained Stage', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_pitcher_metrics', 'INFO', 'queued_base_pitcher_metrics_v0_4_0_snapshot_promote_retained_stage', 'Queued exact Base Pitcher Metrics v0.4.0 snapshot promote retained-stage job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Pitcher Metrics", snapshot_promote_retained_stage:true, live_snapshot_promotion:true, no_external_mlb_calls:true, no_scoring:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Pitcher Metrics",
      queued_job_key: "base-pitcher-metrics",
      queued_worker_name: "alphadog-v2-base-pitcher-metrics",
      v0_4_0_snapshot_promote_retained_stage: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued v0.4.0 snapshot promote retained-stage. Tap ORCHESTRATOR > Wake once. Promotes retained snapshot stage to live pitcher_metric_snapshots only; no source mutation, no MLB calls, no scoring."
    });
  }


  if (job === "orchestrator_enqueue_base_pitcher_game_logs") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-pitcher-game-logs' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BASE > Pitcher Game Logs",
        note: "Existing Base Pitcher Game Logs promotion queue row found. Use ORCHESTRATOR > Wake or let backend continuation run. Browser does not run the job."
      });
    }

    const requestId = "base_pitcher_logs_promote_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_base_pitcher_logs_promote_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Pitcher Game Logs",
      mode: "base_promotion_microphase",
      backend_scheduled_continuation: true,
      base_stage_only: false,
      base_promotion_microphase: true,
      base_backfill_cutoff_date: "2026-05-18",
      delta_reserved_start_date: "2026-05-19",
      live_promotion_from_certified_stage_only: true,
      no_mlb_calls: true,
      no_delta: true,
      no_hitter_mutation: true,
      no_market_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      created_at: now
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-game-logs', 'alphadog-v2-base-pitcher-game-logs', 'Base', 'base', 'Base Pitcher Game Logs Promotion Microphase', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_pitcher_game_logs', 'INFO', 'queued_base_pitcher_game_logs_promotion_microphase', 'Queued exact Base Pitcher Game Logs v0.3.0 promotion microphase job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Pitcher Game Logs", base_promotion_microphase:true, no_mlb_calls:true, no_delta:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Pitcher Game Logs",
      queued_job_key: "base-pitcher-game-logs",
      queued_worker_name: "alphadog-v2-base-pitcher-game-logs",
      note: "Queued base promotion microphase. Use ORCHESTRATOR > Wake once as a test accelerator, then let backend continuation/cron continue. No MLB calls, no delta."
    });
  }

  if (job === "orchestrator_enqueue_delta_pitcher_game_logs") {
    const retained = await crLatestRetainedPitcherDelta(env);
    let pitcherRepairAnchor = null;
    let pitcherRepairCounts = null;
    if (retained) {
      const anchorResult = await crCreateOrRefreshPitcherGameLogRepairAnchor(env, retained);
      pitcherRepairAnchor = anchorResult.registry || null;
      pitcherRepairCounts = pitcherRepairAnchor ? await crPitcherGameLogRegistryCounts(env, pitcherRepairAnchor) : null;
      if (pitcherRepairAnchor && pitcherRepairCounts && pitcherRepairCounts.live_count <= 0 && pitcherRepairCounts.stage_count > 0) {
        const restore = await crRestorePitcherGameLogAnchorFromRetainedStage(env, pitcherRepairAnchor);
        if (restore.restored) {
          return jsonResponse({ ok:true, data_ok:true, version, job, status:"REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE", visible_button:"DELTA > Pitcher Game Logs", queued:false, request_id:null, no_new_batch:true, no_mlb_calls:true, no_stage_writes:true, no_cleanup:true, no_full_sweep:true, preserved_batch_id:retained.batch_id, retained_stage_rows:restore.stage_rows, live_rows_for_delta_batch:restore.live_rows, restored_rows:restore.restored_rows, missing_before:1, missing_after:0, duplicate_live_keys:restore.duplicate_live_keys, restore, note:"Restored missing live pitcher log row from retained stage before queue. No backend job, no MLB mining, no batch creation, no cleanup." });
        }
      }
      const registryNeedsScopedRepair = pitcherRepairAnchor && pitcherRepairCounts && ((pitcherRepairCounts.live_count <= 0 && pitcherRepairCounts.stage_count <= 0) || (pitcherRepairCounts.live_count > 0 && pitcherRepairCounts.stage_count <= 0));
      const parity = await crPitcherDeltaParity(env, retained);
      if (!registryNeedsScopedRepair && !parity.pass && parity.missing_live_rows > 0) {
        const restore = await crRestorePitcherDeltaFromRetainedStage(env, retained, parity);
        if (restore.restored) {
          return jsonResponse({
            ok: true,
            data_ok: true,
            version,
            job,
            status: "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE",
            visible_button: "DELTA > Pitcher Game Logs",
            queued: false,
            request_id: null,
            no_new_batch: true,
            no_mlb_calls: true,
            no_stage_writes: true,
            no_cleanup: true,
            no_full_sweep: true,
            preserved_batch_id: retained.batch_id,
            retained_stage_rows: restore.stage_rows,
            live_rows_for_delta_batch: restore.live_rows,
            restored_rows: restore.restored_rows,
            missing_before: restore.missing_before,
            missing_after: restore.missing_after,
            duplicate_live_keys: restore.duplicate_live_keys,
            restore
          });
        }
        return jsonResponse({ ok:false, data_ok:false, version, job, status:"RETAINED_STAGE_RESTORE_FAILED_BEFORE_QUEUE", visible_button:"DELTA > Pitcher Game Logs", queued:false, request_id:null, preserved_batch_id:retained.batch_id, retained_delta_guard:parity, restore }, 200);
      }
      if (!registryNeedsScopedRepair && parity.pass) {
        const retainedMax = [parity.stage_max_game_date, parity.live_max_game_date].filter(Boolean).sort().pop();
        const sourceFinal = await crLatestCompleteGameDate(env, "2026-05-19");
        if (sourceFinal.ok && retainedMax && sourceFinal.latest_complete_game_date <= retainedMax) {
          return jsonResponse({
            ok: true,
            data_ok: true,
            version,
            job,
            status: "NOOP_ALREADY_CURRENT_RETAINED_FULL_REFRESH_DELTA",
            visible_button: "DELTA > Pitcher Game Logs",
            queued: false,
            request_id: null,
            no_new_batch: true,
            no_stage_writes: true,
            no_promotion: true,
            no_cleanup: true,
            preserved_batch_id: retained.batch_id,
            retained_stage_rows: parity.stage_rows,
            live_rows_for_delta_batch: parity.live_rows,
            retained_max_game_date: retainedMax,
            source_final_date_check: sourceFinal,
            no_mlb_calls: false,
            no_mining_calls: true,
            no_full_sweep: true,
            repair_anchor: pitcherRepairAnchor ? { registry_key: pitcherRepairAnchor.registry_key, player_id: pitcherRepairAnchor.player_id, game_pk: pitcherRepairAnchor.game_pk, game_date: pitcherRepairAnchor.game_date, live_count: pitcherRepairCounts ? pitcherRepairCounts.live_count : null, stage_count: pitcherRepairCounts ? pitcherRepairCounts.stage_count : null } : null,
            retained_delta: {
              status: retained.status,
              rows_staged: retained.rows_staged,
              rows_promoted: retained.rows_promoted,
              certification_status: retained.certification_status,
              certification_grade: retained.certification_grade,
              delta_start_date: retained.delta_start_date,
              delta_end_date: retained.delta_end_date,
              cleaned_at: retained.cleaned_at
            }
          });
        }
      }
    }

    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-pitcher-game-logs' AND worker_name = 'alphadog-v2-base-pitcher-game-logs' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(callOrchestrator(env, "/pump", {
          source: "control_room_delta_pitcher_game_logs_existing_auto_continue",
          max_cycles: 12,
          max_jobs_per_cycle: 3,
          max_ms: 25000,
          pump_depth: 0,
          max_pump_chains: 12,
          backend_self_continuation: true,
          no_browser_pump: true,
          existing_request_id: existing.request_id
        }));
      }
      return jsonResponse({ ok:true, data_ok:true, version, job, status:"already_queued", request_id:existing.request_id, existing, visible_button:"DELTA > Pitcher Game Logs", backend_scheduled_continuation:true, auto_pump_triggered:true, browser_auto_pump:false, note:"Existing Pitcher Game Logs queue row found. Control Room launched backend pump as a safe continuation nudge; browser does not run the job." });
    }

    const sourceFinal = await crLatestCompleteGameDate(env, "2026-05-19");
    if (!sourceFinal.ok) return jsonResponse({ ok:false, data_ok:false, version, job, status:"DELTA_FINAL_DATE_DISCOVERY_FAILED_BEFORE_QUEUE", visible_button:"DELTA > Pitcher Game Logs", queued:false, request_id:null, source_final_date_check:sourceFinal }, 200);
    const retainedParity = retained ? await crPitcherDeltaParity(env, retained) : null;
    const retainedMax = retainedParity && retainedParity.pass ? [retainedParity.stage_max_game_date, retainedParity.live_max_game_date].filter(Boolean).sort().pop() : null;
    const deltaStart = retainedMax ? crAddDays(retainedMax, 1) : "2026-05-19";
    const requestId = "delta_pitcher_logs_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_delta_pitcher_logs_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Pitcher Game Logs",
      mode: "delta_update",
      requested_preflight_behavior: "delta_retained_stage_restore_before_queue",
      created_at: now,
      worker_scope: "delta_pitcher_game_logs_hitter_equivalent_scoped_delta_v0_4_1",
      source_name: "MLB StatsAPI schedule/boxscore scoped targets + player gameLog pitching endpoint",
      source_key: "mlb_statsapi_pitcher_game_logs_v0_2_0",
      endpoint_pattern: "/people/{playerId}/stats?stats=gameLog&group=pitching&season={season}",
      group_type: "pitching",
      base_backfill_cutoff_date: "2026-05-18",
      delta_start_date: deltaStart,
      delta_end_date: sourceFinal.latest_complete_game_date,
      preserved_batch_id: retained && retained.batch_id ? retained.batch_id : null,
      extend_retained_batch: !!(retained && retained.batch_id),
      base_integrity_gate_required: true,
      finalized_games_only: true,
      no_future_games: true,
      no_in_progress_games: true,
      no_base_rerun: true,
      retained_stage_restore_before_queue: true,
      schedule_noop_before_queue: true,
      scoped_delta_targets_only: true,
      target_source: "MLB schedule completed games + game boxscore pitching stats",
      no_normal_full_universe_sweep: true,
      full_universe_sweep_only_for_future_forced_repair_mode: true,
      no_hitter_logs: true,
      no_splits: true,
      no_team_logs: true,
      no_starter_history: true,
      no_bullpen_history: true,
      no_prizepicks_board_mutation: true,
      no_sleeper_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      continuation_strategy: "orchestrator_owned_backend_self_continuation_with_persisted_delta_cursor",
      one_active_run_only: true,
      no_browser_auto_pump: true,
      control_room_backend_launches_orchestrator_pump: true,
      no_manual_repeated_wake_required: true,
      source_final_date_check: sourceFinal,
      retained_stage_guard: retainedParity,
      repair_registry_key: pitcherRepairAnchor ? pitcherRepairAnchor.registry_key : null,
      repair_anchor_counts: pitcherRepairCounts || null,
      scoped_repair_if_anchor_live_and_stage_missing: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-game-logs', 'alphadog-v2-base-pitcher-game-logs', 'Delta', 'delta', 'Delta Pitcher Game Logs Scoped Retained Stage Update', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_pitcher_game_logs', 'INFO', 'queued_delta_pitcher_game_logs_scoped_update', 'Queued exact Delta Pitcher Game Logs scoped retained-stage update job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Pitcher Game Logs", mode:"delta_update", requested_preflight_behavior:"delta_retained_stage_restore_before_queue", retained_stage_restore_before_queue:true, schedule_noop_before_queue:true, backend_scheduled_continuation:true, delta_start_date:deltaStart, delta_end_date:sourceFinal.latest_complete_game_date, no_normal_full_universe_sweep:true})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", { source:"control_room_delta_pitcher_game_logs_scoped_auto_start", max_cycles:12, max_jobs_per_cycle:3, max_ms:25000, pump_depth:0, max_pump_chains:12, backend_self_continuation:true, no_browser_pump:true, request_id:requestId }));
    }

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Pitcher Game Logs",
      queued_job_key: "base-pitcher-game-logs",
      queued_worker_name: "alphadog-v2-base-pitcher-game-logs",
      mode: "delta_update",
      requested_preflight_behavior: "delta_retained_stage_restore_before_queue",
      delta_start_date: deltaStart,
      delta_end_date: sourceFinal.latest_complete_game_date,
      preserved_batch_id: input.preserved_batch_id,
      retained_stage_restore_before_queue: true,
      schedule_noop_before_queue: true,
      scoped_delta_targets_only: true,
      no_normal_full_universe_sweep: true,
      source_final_date_check: sourceFinal,
      backend_self_continuation_launched: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: true,
      browser_auto_pump: false,
      note: "Queued scoped pitcher delta only after retained-stage restore/no-op checks. Worker targets pitchers from completed-game boxscores, not the full pitcher universe."
    });
  }

  if (job === "orchestrator_enqueue_delta_hitter_game_logs") {
    const retainedDeltaGuard = await getCompletedRetainedDeltaGuard(env);
    if (!retainedDeltaGuard.pass && retainedDeltaGuard.repair_plan === "RECONCILE_RETAINED_STAGE_METADATA_ONLY") {
      const reconcile = await reconcileHitterRetainedDeltaStageMetadata(env, retainedDeltaGuard.latest_delta && retainedDeltaGuard.latest_delta.batch_id);
      if (reconcile.reconciled) {
        return jsonResponse({ ok:true, data_ok:true, version, job, status:"RECONCILED_RETAINED_STAGE_METADATA_BEFORE_QUEUE", visible_button:"DELTA > Hitter Game Logs", queued:false, request_id:null, no_new_batch:true, no_mlb_calls:true, no_full_sweep:true, no_cleanup:true, no_live_data_insert:true, stage_metadata_reconciled:true, preserved_batch_id:reconcile.batch_id, retained_stage_rows:reconcile.stage_rows, live_rows_for_delta_batch:reconcile.live_rows, missing_after:reconcile.missing_live_rows, duplicate_live_keys:reconcile.duplicate_live_keys, reconcile, note:"Reconciled retained hitter delta stage metadata before queue. No backend job, no MLB mining, no new batch, no cleanup." });
      }
      return jsonResponse({ ok:false, data_ok:false, version, job, status:"RETAINED_STAGE_METADATA_RECONCILE_FAILED_BLOCKED", visible_button:"DELTA > Hitter Game Logs", queued:false, request_id:null, preserved_batch_id:reconcile.batch_id || (retainedDeltaGuard.latest_delta && retainedDeltaGuard.latest_delta.batch_id), reconcile, retained_delta_guard:retainedDeltaGuard, note:"Blocked queue because retained stage/live parity was clean but retained metadata could not be reconciled." }, 500);
    }

    if (!retainedDeltaGuard.pass && retainedDeltaGuard.repair_plan === "REPAIR_FROM_RETAINED_STAGE_ONLY") {
      const restore = await restoreMissingLiveRowsFromRetainedStage(env, retainedDeltaGuard);
      if (restore.restored) {
        return jsonResponse({
          ok: true,
          data_ok: true,
          version,
          job,
          status: "REPAIRED_FROM_RETAINED_STAGE_BEFORE_QUEUE",
          visible_button: "DELTA > Hitter Game Logs",
          queued: false,
          request_id: null,
          no_new_batch: true,
          no_mlb_calls: true,
          no_stage_writes: true,
          no_cleanup: true,
          no_full_sweep: true,
          preserved_batch_id: restore.batch_id,
          retained_stage_rows: restore.stage_rows,
          live_rows_for_delta_batch: restore.live_rows,
          restored_rows: restore.restored_rows,
          missing_before: restore.missing_before,
          missing_after: restore.missing_after,
          duplicate_live_keys: restore.duplicate_live_keys,
          restore,
          note: "Restored missing live hitter log rows from retained stage before queue. No backend job, no MLB mining, no batch creation, no cleanup."
        });
      }
      return jsonResponse({
        ok: false,
        data_ok: false,
        version,
        job,
        status: "RETAINED_STAGE_RESTORE_FAILED_BLOCKED",
        visible_button: "DELTA > Hitter Game Logs",
        queued: false,
        request_id: null,
        no_new_batch: true,
        no_mlb_calls: true,
        no_stage_writes: true,
        no_cleanup: true,
        preserved_batch_id: restore.batch_id || (retainedDeltaGuard.latest_delta && retainedDeltaGuard.latest_delta.batch_id),
        restore,
        retained_delta_guard: retainedDeltaGuard,
        note: "Blocked queue because retained-stage restore was required but did not certify cleanly. No source mining was attempted."
      }, 500);
    }
    if (retainedDeltaGuard.pass) {
      const closeout = await closeoutPromotedRetainedDeltaFromControlRoom(env, retainedDeltaGuard);
      if (closeout.closed) {
        return jsonResponse({
          ok: true,
          data_ok: true,
          version,
          job,
          status: "COMPLETED_PROMOTED_STAGE_RETAINED",
          visible_button: "DELTA > Hitter Game Logs",
          queued: false,
          request_id: null,
          no_new_batch: true,
          no_mlb_calls: true,
          no_stage_writes: true,
          no_promotion: true,
          no_cleanup: true,
          preserved_batch_id: closeout.batch_id,
          retained_stage_rows: closeout.stage_rows,
          live_rows_for_delta_batch: closeout.live_rows,
          closeout,
          note: "Closed retained delta batch header before no-op. Stage/live parity was already verified; no mining or mutation outside metadata closeout."
        });
      }
      const sourceWindow = await controlRoomLatestCompleteGameDate(env, retainedDeltaGuard.latest_delta.delta_start_date || "2026-05-19");
      const retainedMax = [retainedDeltaGuard.stage_max_game_date, retainedDeltaGuard.live_max_game_date].filter(Boolean).sort().pop();
      if (!(sourceWindow.ok && retainedMax && sourceWindow.latest_complete_game_date > retainedMax)) {
        return jsonResponse({
          ok: true,
          data_ok: true,
          version,
          job,
          status: "NOOP_ALREADY_CURRENT_RETAINED_FULL_REFRESH_DELTA",
          visible_button: "DELTA > Hitter Game Logs",
          queued: false,
          request_id: null,
          no_new_batch: true,
          no_stage_writes: true,
          no_promotion: true,
          no_cleanup: true,
          preserved_batch_id: retainedDeltaGuard.latest_delta.batch_id,
          retained_stage_rows: retainedDeltaGuard.retained_stage_rows,
          live_rows_for_delta_batch: retainedDeltaGuard.live_rows_for_delta_batch,
          retained_max_game_date: retainedMax,
          source_final_date_check: sourceWindow,
          no_mlb_calls: sourceWindow.ok ? false : true,
          latest_delta: retainedDeltaGuard.latest_delta,
          note: "Blocked repeat full-refresh delta because retained stage/live are healthy and no newer final MLB game date was discovered. If source check is unavailable, no mutation is allowed."
        });
      }
    }

    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-hitter-game-logs' AND worker_name = 'alphadog-v2-base-hitter-game-logs' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(callOrchestrator(env, "/pump", {
          source: "control_room_delta_hitter_game_logs_existing_auto_continue",
          max_cycles: 12,
          max_jobs_per_cycle: 3,
          max_ms: 25000,
          pump_depth: 0,
          max_pump_chains: 12,
          backend_self_continuation: true,
          no_browser_pump: true,
          existing_request_id: existing.request_id
        }));
      }
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DELTA > Hitter Game Logs",
        backend_scheduled_continuation: true,
        auto_pump_triggered: true,
        browser_auto_pump: false,
        note: "Existing Hitter Game Logs queue row found. Control Room launched backend pump as a safe continuation nudge; browser does not run the job."
      });
    }

    const requestId = "delta_hitter_logs_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_delta_hitter_logs_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Hitter Game Logs",
      mode: "delta_update",
      requested_preflight_behavior: "delta_retained_stage_restore_before_queue",
      retained_stage_restore_before_queue: true,
      created_at: now,
      worker_scope: "delta_certifying_repair_engine_v1_6_10_final_retained_status_closeout",
      source_name: "MLB StatsAPI people gameLog hitting endpoint",
      source_key: "mlb_statsapi_people_gameLog_hitting_v0_1_0",
      endpoint_pattern: "/people/{playerId}/stats?stats=gameLog&group=hitting&season={season}",
      group_type: "hitting",
      required_base_batch_id: "hitter_base_backfill_batch_mpelpq0t_akyyu3",
      base_backfill_cutoff_date: "2026-05-18",
      delta_start_date: "2026-05-19",
      repair_lookback_days: 7,
      initial_full_delta_catchup_from_base_reserved_start: true,
      initial_full_delta_catchup_from_base_reserved_start: true,
      base_integrity_gate_required: true,
      finalized_games_only: true,
      no_future_games: true,
      no_in_progress_games: true,
      no_base_rerun: true,
      no_pitcher_logs: true,
      no_splits: true,
      no_team_logs: true,
      no_starter_history: true,
      no_bullpen_history: true,
      no_prizepicks_board_mutation: true,
      no_sleeper_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      continuation_strategy: "orchestrator_owned_backend_self_continuation_with_persisted_delta_cursor",
      one_active_run_only: true,
      no_browser_auto_pump: true,
      control_room_backend_launches_orchestrator_pump: true,
      no_manual_repeated_wake_required: true,
      chunk_size_players: 10,
      max_requests_per_tick: 10,
      max_rows_per_tick: 1000,
      self_continuation_required: true,
      cron_role: "rescue_fallback_only"
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-hitter-game-logs', 'alphadog-v2-base-hitter-game-logs', 'Delta', 'delta', 'Delta Hitter Game Logs Certifying Repair Update', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_hitter_game_logs', 'INFO', 'queued_delta_hitter_game_logs_update', 'Queued exact Delta Hitter Game Logs certifying repair/update self-continuation job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Hitter Game Logs", mode:"delta_update", requested_preflight_behavior:"delta_retained_stage_restore_before_queue", backend_scheduled_continuation:true, delta_start_date:"2026-05-19", required_base_batch_id:"hitter_base_backfill_batch_mpelpq0t_akyyu3"})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", {
        source: "control_room_delta_hitter_game_logs_auto_start",
        max_cycles: 12,
        max_jobs_per_cycle: 3,
        max_ms: 25000,
        pump_depth: 0,
        max_pump_chains: 12,
        backend_self_continuation: true,
        no_browser_pump: true,
        request_id: requestId
      }));
    }

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Hitter Game Logs",
      queued_job_key: "base-hitter-game-logs",
      queued_worker_name: "alphadog-v2-base-hitter-game-logs",
      mode: "delta_update",
      requested_preflight_behavior: "delta_retained_stage_restore_before_queue",
      retained_stage_restore_before_queue: true,
      required_base_batch_id: "hitter_base_backfill_batch_mpelpq0t_akyyu3",
      delta_start_date: "2026-05-19",
      repair_lookback_days: 7,
      initial_full_delta_catchup_from_base_reserved_start: true,
      initial_full_delta_catchup_from_base_reserved_start: true,
      backend_self_continuation_launched: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: true,
      browser_auto_pump: false,
      note: "Queued in CONTROL_DB. Control Room launches backend orchestrator pump via ctx.waitUntil; orchestrator self-continues bounded chunks. Browser may close now. Cron is rescue fallback only. ORCHESTRATOR > Wake is optional test/rescue only."
    });
  }


  if (job === "orchestrator_enqueue_delta_hitter_splits") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-hitter-splits' AND worker_name = 'alphadog-v2-base-hitter-splits' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DELTA > Hitter Splits",
        queued_job_key: "base-hitter-splits",
        queued_worker_name: "alphadog-v2-base-hitter-splits",
        note: "Existing Hitter Splits delta queue row found. Do not enqueue a duplicate; use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "hitter_splits_delta_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_hitter_splits_delta_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Hitter Splits",
      mode: "delta_update",
      requested_preflight_behavior: "calendar_tally_gap_scoped_refresh",
      calendar_gap_scoped_repair: true,
      coverage_layer_key: "hitter_splits",
      source_model: "season_to_date_snapshot_by_affected_hitters",
      target_source: "TEAM_DB.mlb_game_data_coverage blocking_for_full_run=1 plus STATS_HITTER_DB.hitter_game_logs affected hitters",
      created_at: now,
      no_full_sweep: true,
      no_full_hitter_universe_refresh: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_mutation: true,
      no_team_mutation: true,
      no_market_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      continuation_strategy: "orchestrator_owned_backend_self_continuation_with_hitter_split_cursor",
      one_active_run_only: true,
      no_browser_auto_pump: true,
      control_room_backend_launches_orchestrator_pump: true,
      worker_version_expected_minimum: "alphadog-v2-base-hitter-splits-v0.4.7-calendar-tally-gap-scoped-refresh"
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-hitter-splits', 'alphadog-v2-base-hitter-splits', 'Delta', 'delta', 'Delta Hitter Splits Calendar Gap Scoped Refresh', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_hitter_splits', 'INFO', 'queued_delta_hitter_splits_calendar_gap_scoped_refresh', 'Queued exact Delta Hitter Splits calendar-gap scoped affected-player snapshot refresh', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Hitter Splits", queued_job_key:"base-hitter-splits", queued_worker_name:"alphadog-v2-base-hitter-splits", mode:"delta_update", calendar_gap_scoped_repair:true})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", {
        source: "control_room_delta_hitter_splits_auto_start",
        max_cycles: 12,
        max_jobs_per_cycle: 3,
        max_ms: 25000,
        pump_depth: 0,
        max_pump_chains: 12,
        backend_self_continuation: true,
        no_browser_pump: true,
        request_id: requestId
      }));
    }

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Hitter Splits",
      queued_job_key: "base-hitter-splits",
      queued_worker_name: "alphadog-v2-base-hitter-splits",
      mode: "delta_update",
      requested_preflight_behavior: "calendar_tally_gap_scoped_refresh",
      calendar_gap_scoped_repair: true,
      backend_self_continuation_launched: true,
      auto_pump_triggered: true,
      browser_auto_pump: false,
      note: "Queued Hitter Splits as a calendar-gap scoped snapshot refresh. Worker must read TEAM_DB coverage gaps first, then refresh affected hitter splits only."
    });
  }


  if (job === "orchestrator_enqueue_delta_pitcher_splits") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-pitcher-splits' AND worker_name = 'alphadog-v2-base-pitcher-splits' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DELTA > Pitcher Splits",
        queued_job_key: "base-pitcher-splits",
        queued_worker_name: "alphadog-v2-base-pitcher-splits",
        note: "Existing Pitcher Splits delta queue row found. Do not enqueue a duplicate; use ORCHESTRATOR > Wake / Logs / Queue to continue or inspect."
      });
    }

    const requestId = "pitcher_splits_delta_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_pitcher_splits_delta_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Pitcher Splits",
      mode: "delta_update",
      requested_preflight_behavior: "calendar_tally_gap_scoped_refresh",
      calendar_gap_scoped_repair: true,
      coverage_layer_key: "pitcher_splits",
      source_model: "season_to_date_snapshot_by_affected_pitchers",
      target_source: "TEAM_DB.mlb_game_data_coverage blocking_for_full_run=1 plus STATS_PITCHER_DB.pitcher_game_logs affected pitchers",
      created_at: now,
      no_full_sweep: true,
      no_full_pitcher_universe_refresh: true,
      no_hitter_mutation: true,
      no_pitcher_game_log_mutation: true,
      no_team_mutation: true,
      no_market_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      continuation_strategy: "orchestrator_owned_backend_self_continuation_with_pitcher_split_cursor",
      one_active_run_only: true,
      no_browser_auto_pump: true,
      control_room_backend_launches_orchestrator_pump: true,
      worker_version_expected_minimum: "alphadog-v2-base-pitcher-splits-v0.5.11-calendar-tally-gap-scoped-refresh"
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-splits', 'alphadog-v2-base-pitcher-splits', 'Delta', 'delta', 'Delta Pitcher Splits Calendar Gap Scoped Refresh', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_pitcher_splits', 'INFO', 'queued_delta_pitcher_splits_calendar_gap_scoped_refresh', 'Queued exact Delta Pitcher Splits calendar-gap scoped affected-pitcher snapshot refresh', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Pitcher Splits", queued_job_key:"base-pitcher-splits", queued_worker_name:"alphadog-v2-base-pitcher-splits", mode:"delta_update", calendar_gap_scoped_repair:true})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", {
        source: "control_room_delta_pitcher_splits_auto_start",
        max_cycles: 12,
        max_jobs_per_cycle: 3,
        max_ms: 25000,
        pump_depth: 0,
        max_pump_chains: 12,
        backend_self_continuation: true,
        no_browser_pump: true,
        request_id: requestId
      }));
    }

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Pitcher Splits",
      queued_job_key: "base-pitcher-splits",
      queued_worker_name: "alphadog-v2-base-pitcher-splits",
      mode: "delta_update",
      requested_preflight_behavior: "calendar_tally_gap_scoped_refresh",
      calendar_gap_scoped_repair: true,
      backend_self_continuation_launched: true,
      auto_pump_triggered: true,
      browser_auto_pump: false,
      note: "Queued Pitcher Splits as a calendar-gap scoped snapshot refresh. Worker must read TEAM_DB coverage gaps first, then refresh affected pitcher splits from pitcher_game_logs coverage."
    });
  }

  if (job === "orchestrator_enqueue_delta_team_game_logs") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-team-game-logs' AND worker_name = 'alphadog-v2-base-team-game-logs' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(callOrchestrator(env, "/pump", {
          source: "control_room_delta_team_game_logs_existing_auto_continue",
          max_cycles: 8,
          max_jobs_per_cycle: 1,
          max_ms: 25000,
          pump_depth: 0,
          max_pump_chains: 12,
          backend_self_continuation: true,
          no_browser_pump: true,
          existing_request_id: existing.request_id
        }));
      }
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "DELTA > Team Game Logs",
        backend_scheduled_continuation: true,
        auto_pump_triggered: true,
        browser_auto_pump: false,
        note: "Existing Team Game Logs queue row found. Control Room launched backend pump as a safe continuation nudge; browser does not run the job."
      });
    }

    const requestId = "delta_team_logs_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_delta_team_logs_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Team Game Logs",
      mode: "delta_update",
      created_at: now,
      worker_scope: "delta_team_game_logs_mining_only_no_calendar_tally_writes",
      target_source: "MLB StatsAPI schedule completed games plus boxscore team totals",
      source_key: "mlb_statsapi_team_game_logs_v0_3_3_delta",
      base_backfill_cutoff_date: "2026-05-18",
      delta_start_date: "2026-05-19",
      finalized_games_only: true,
      no_future_games: true,
      no_in_progress_games: true,
      no_base_rerun: true,
      no_hitter_logs: true,
      no_pitcher_logs: true,
      no_splits: true,
      no_starter_history: true,
      no_bullpen_history: true,
      no_calendar_tally_writes: true,
      calendar_tally_owner: "alphadog-v2-delta-certifier",
      manual_calendar_reconciliation_required_after_success: true,
      no_prizepicks_board_mutation: true,
      no_sleeper_board_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true,
      backend_scheduled_continuation: true,
      continuation_strategy: "orchestrator_owned_backend_self_continuation_with_persisted_delta_cursor",
      one_active_run_only: true,
      no_browser_auto_pump: true,
      control_room_backend_launches_orchestrator_pump: true,
      no_manual_repeated_wake_required: true,
      max_requests_per_tick: 10,
      max_rows_per_tick: 1000,
      self_continuation_required: true,
      cron_role: "rescue_fallback_only"
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-team-game-logs', 'alphadog-v2-base-team-game-logs', 'Delta', 'delta', 'Delta Team Game Logs Mining Update', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_team_game_logs', 'INFO', 'queued_delta_team_game_logs_update', 'Queued exact Delta Team Game Logs mining-only update job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Team Game Logs", mode:"delta_update", backend_scheduled_continuation:true, no_calendar_tally_writes:true, calendar_tally_owner:"alphadog-v2-delta-certifier"})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", {
        source: "control_room_delta_team_game_logs_auto_start",
        max_cycles: 8,
        max_jobs_per_cycle: 1,
        max_ms: 25000,
        pump_depth: 0,
        max_pump_chains: 12,
        backend_self_continuation: true,
        no_browser_pump: true,
        request_id: requestId
      }));
    }

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "DELTA > Team Game Logs",
      queued_job_key: "base-team-game-logs",
      queued_worker_name: "alphadog-v2-base-team-game-logs",
      mode: "delta_update",
      no_calendar_tally_writes: true,
      calendar_tally_owner: "alphadog-v2-delta-certifier",
      manual_calendar_reconciliation_required_after_success: true,
      backend_self_continuation_launched: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: true,
      browser_auto_pump: false,
      note: "Queued Team Game Logs delta mining only. The worker must not write calendar/tally coverage; run DELTA > Calendar after success to reconcile mlb_game_data_coverage."
    });
  }

  if (job === "orchestrator_enqueue_static_certifier") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'static-certifier' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({ ok: true, data_ok: true, version, job, status: "already_queued", request_id: existing.request_id, existing, visible_button: "STATIC > Certifier", read_only_validation_only: true, backend_scheduled_continuation: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Existing Static Certifier queue row found. Control Room queues only. Orchestrator scheduled backend/cron will process it; ORCHESTRATOR > Wake is manual backend testing only." });
    }

    const requestId = "static_certifier_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_" + Date.now().toString(36);
    const input = { source: "control_room", visible_button: "STATIC > Certifier", mode: "static_certifier_read_only_static_layer_validation", created_at: now, read_only_validation_only: true, no_reruns: true, no_mutations: true, no_source_fetches: true, no_promotion: true, no_cleanup: true, validates_completed_static_workers: ["static-teams", "static-stadiums", "static-park-factors", "static-players", "static-prop-taxonomy"], validates_deferred_static_workers: ["static-rosters", "static-player-aliases"], no_prizepicks_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true, no_sleeper_work: true, no_old_production_touch: true, backend_scheduled_continuation: true, no_browser_auto_pump: true, no_control_room_to_orchestrator_fetch: true, no_manual_repeated_wake_required: true };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-certifier', 'alphadog-v2-static-certifier', 'Static', 'static', 'Static Layer Read-Only Certifier', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_static_certifier', 'INFO', 'queued_static_certifier', 'Queued exact Static Certifier read-only validation job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"STATIC > Certifier", read_only_validation_only:true, backend_scheduled_continuation:true})).run();

    return jsonResponse({ ok: true, data_ok: true, version, job, status: "queued", request_id: requestId, chain_id: chainId, visible_button: "STATIC > Certifier", queued_job_key: "static-certifier", queued_worker_name: "alphadog-v2-static-certifier", read_only_validation_only: true, backend_scheduled_continuation: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Queued in CONTROL_DB only. Certifier is read-only and does not rerun workers. Browser may close now. Orchestrator scheduled backend/cron owns processing; ORCHESTRATOR > Wake is manual backend testing only." });
  }

  if (job === "orchestrator_enqueue_static_full_run") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'static-full-run' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({ ok: true, data_ok: true, version, job, status: "already_queued", request_id: existing.request_id, existing, visible_button: "STATIC > Full Run", backend_chain_only: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Existing Static Full Run parent queue row found. Control Room queues only. Orchestrator scheduled backend/cron continues the chain; ORCHESTRATOR > Wake is manual backend testing only." });
    }

    const requestId = "static_full_run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_static_full_" + Date.now().toString(36);
    const input = { source: "control_room", visible_button: "STATIC > Full Run", mode: "static_full_run_backend_chain_active_static_workers_then_certifier", created_at: now, approved_chain_order: ["static-teams", "static-stadiums", "static-park-factors", "static-players", "static-prop-taxonomy", "static-certifier"], deferred_workers_skipped: ["static-rosters", "static-player-aliases"], stop_on_first_failed_stage: true, require_child_output_json_data_ok_certification: true, full_run_certified_only_if_final_certifier_passes: true, backend_chain_only: true, no_browser_auto_pump: true, no_control_room_to_orchestrator_fetch: true, no_generic_dispatch: true, no_prizepicks_board_mutation: true, no_scoring: true, no_ranking: true, no_final_board: true, no_sleeper_work: true, no_old_production_touch: true };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'static-full-run', 'alphadog-v2-orchestrator', 'Static', 'static', 'Static Full Run Backend Chain', 'pending', 6, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_static_full_run', 'INFO', 'queued_static_full_run', 'Queued Static Full Run parent backend chain job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"STATIC > Full Run", approved_chain_order:input.approved_chain_order, deferred_workers_skipped:input.deferred_workers_skipped, backend_chain_only:true})).run();

    return jsonResponse({ ok: true, data_ok: true, version, job, status: "queued", request_id: requestId, chain_id: chainId, visible_button: "STATIC > Full Run", queued_job_key: "static-full-run", queued_worker_name: "alphadog-v2-orchestrator", approved_chain_order: input.approved_chain_order, deferred_workers_skipped: input.deferred_workers_skipped, backend_chain_only: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Queued one parent Static Full Run request. Browser may close now. ORCHESTRATOR > Wake can start it immediately for testing; backend cron continues if budget runs out." });
  }

  if (job === "orchestrator_enqueue_incremental_morning_full_run") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, chain_id, status, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE job_key = 'incremental-morning-full-run' AND status IN ('pending','running','partial_continue') AND finished_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({ ok: true, data_ok: true, version, job, status: "already_queued", request_id: existing.request_id, existing, visible_button: "DELTA > Full Run", backend_chain_only: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Existing Incremental Morning Full Run parent queue row found. Do not enqueue a duplicate. Orchestrator scheduled backend/cron continues the chain; ORCHESTRATOR > Wake is manual testing/rescue only." });
    }

    const requestId = "incremental_morning_full_run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_incremental_morning_full_run_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Full Run",
      mode: "incremental_morning_full_run",
      created_at: now,
      approved_chain_order: ["delta-certifier", "base-hitter-game-logs", "base-pitcher-game-logs", "base-team-game-logs", "base-starter-history", "base-bullpen-history", "base-hitter-splits", "base-pitcher-splits", "base-hitter-metrics", "base-pitcher-metrics", "delta-certifier"],
      approved_stage_order: ["calendar_tally_precheck", "hitter_game_logs_delta", "pitcher_game_logs_delta", "team_game_logs_delta", "starter_history_delta", "bullpen_history_delta", "hitter_splits_delta", "pitcher_splits_delta", "hitter_metrics_affected_delta", "pitcher_metrics_affected_delta", "calendar_tally_final_check"],
      child_modes: {
        "delta-certifier": "game_calendar_differential_check_update",
        "base-hitter-game-logs": "delta_update",
        "base-pitcher-game-logs": "delta_update",
        "base-team-game-logs": "delta_update",
        "base-starter-history": "delta_scoped_source_repair",
        "base-bullpen-history": "delta_update",
        "base-hitter-splits": "delta_update",
        "base-pitcher-splits": "delta_update",
        "base-hitter-metrics": "delta_recalculate_affected_players",
        "base-pitcher-metrics": "delta_recalculate_affected_players"
      },
      stop_on_first_failed_stage: true,
      max_retries_per_child: 2,
      stale_threshold_minutes: 60,
      backend_chain_only: true,
      no_browser_auto_pump: true,
      no_control_room_to_orchestrator_fetch: true,
      no_generic_dispatch: true,
      no_board_refresh_included: true,
      board_refresh_deferred: true,
      calendar_tally_precheck_first: true,
      calendar_tally_final_check_last: true,
      final_calendar_tally_must_have_zero_blockers: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_old_production_touch: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'incremental-morning-full-run', 'alphadog-v2-orchestrator', 'Delta', 'incremental_base', 'Incremental Morning Full Run Backend Chain', 'pending', 8, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT OR IGNORE INTO control_locks (lock_key, lock_flag, updated_at) VALUES ('INCREMENTAL_MORNING_FULL_RUN', 0, CURRENT_TIMESTAMP)"
    ).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_incremental_morning_full_run', 'INFO', 'queued_incremental_morning_full_run', 'Queued Incremental Morning Full Run parent backend chain job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Full Run", approved_chain_order:input.approved_chain_order, backend_chain_only:true})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", { source:"control_room_incremental_morning_full_run_enqueue", max_cycles:4, max_jobs_per_cycle:1, max_ms:30000, max_pump_chains:30, no_browser_loop:true, cron_rescue_only:true, backend_budget_loop_requested:true }));
    }

    return jsonResponse({ ok: true, data_ok: true, version, job, status: "queued", request_id: requestId, chain_id: chainId, visible_button: "DELTA > Full Run", queued_job_key: "incremental-morning-full-run", queued_worker_name: "alphadog-v2-orchestrator", approved_chain_order: input.approved_chain_order, backend_chain_only: true, auto_pump_triggered: true, browser_auto_pump: false, note: "Queued one parent Incremental Morning Full Run request with Calendar/Tally precheck first and final zero-blocker Calendar/Tally certification last. Backend service-binding auto-pump was launched; browser may close now. ORCHESTRATOR > Wake is manual testing/rescue only." });
  }


  if (job === "orchestrator_enqueue_base_starter_history") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-starter-history' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BASE > Starter History",
        routed_as_delta_repair: true,
        note: "Existing Starter History queue row found. Do not duplicate. Tap ORCHESTRATOR > Wake or let backend continuation finish it."
      });
    }

    const requestId = "starter_history_delta_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_starter_history_delta_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Starter History",
      mode: "delta_scoped_source_repair",
      created_at: now,
      worker_scope: "calendar_gap_scoped_mining_only_no_tally_writes",
      source_key: "mlb_statsapi_starter_history_calendar_gap_scoped_v0_4_5",
      source_name: "TEAM_DB.mlb_game_data_coverage starter_history blocking gaps + MLB StatsAPI final boxscore actual starters",
      gap_source_table: "TEAM_DB.mlb_game_data_coverage",
      gap_layer_key: "starter_history",
      gap_filter: "blocking_for_full_run = 1",
      calendar_gap_scoped: true,
      repair_from_calendar_tally_gaps: true,
      no_full_sweep: true,
      no_rolling_window_guess: true,
      no_coverage_tally_writes: true,
      user_runs_calendar_tally_manually_after_live_data_passes: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_game_log_mutation: true,
      no_team_game_log_mutation: true,
      no_bullpen_history_mutation: true,
      no_splits_mutation: true,
      no_metrics_mutation: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-starter-history', 'alphadog-v2-base-starter-history', 'Delta', 'incremental_base', 'Starter History Calendar-Gap Scoped Delta Repair', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_starter_history', 'INFO', 'queued_base_starter_history_as_calendar_gap_scoped_delta', 'Queued BASE > Starter History as calendar-gap scoped mining-only delta repair', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Starter History", mode:input.mode, calendar_gap_scoped:true, no_coverage_tally_writes:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Starter History",
      queued_job_key: "base-starter-history",
      queued_worker_name: "alphadog-v2-base-starter-history",
      mode: "delta_scoped_source_repair",
      calendar_gap_scoped: true,
      no_coverage_tally_writes: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "BASE > Starter History is intentionally wired to the delta/scoped repair path because there is no separate Delta button. Tap ORCHESTRATOR > Wake, then verify live starter_history data before manually running calendar/tally."
    });
  }

  if (job === "orchestrator_enqueue_base_bullpen_history") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-bullpen-history' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      return jsonResponse({
        ok: true,
        data_ok: true,
        version,
        job,
        status: "already_queued",
        request_id: existing.request_id,
        existing,
        visible_button: "BASE > Bullpen History",
        routed_as_delta_update: true,
        note: "Existing Bullpen History queue row found. Do not duplicate. Tap ORCHESTRATOR > Wake or let backend continuation finish it."
      });
    }

    const requestId = "bullpen_history_delta_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_bullpen_history_delta_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Bullpen History",
      mode: "delta_update",
      created_at: now,
      worker_scope: "base_button_delta_update_no_tally_writes",
      source_key: "mlb_statsapi_bullpen_history_delta_update",
      source_name: "MLB StatsAPI final boxscore relief pitcher appearances",
      calendar_gap_scoped_required_before_lock: true,
      no_coverage_tally_writes: true,
      user_runs_calendar_tally_manually_after_live_data_passes: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_game_log_mutation: true,
      no_team_game_log_mutation: true,
      no_starter_history_mutation: true,
      no_splits_mutation: true,
      no_metrics_mutation: true,
      no_prizepicks_mutation: true,
      no_sleeper_mutation: true,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      backend_scheduled_continuation: true,
      no_browser_auto_pump: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-bullpen-history', 'alphadog-v2-base-bullpen-history', 'Delta', 'incremental_base', 'Bullpen History Delta Update', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_bullpen_history', 'INFO', 'queued_base_bullpen_history_as_delta_update', 'Queued BASE > Bullpen History as delta update because there is no separate Delta button', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Bullpen History", mode:input.mode, no_coverage_tally_writes:true})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Bullpen History",
      queued_job_key: "base-bullpen-history",
      queued_worker_name: "alphadog-v2-base-bullpen-history",
      mode: "delta_update",
      no_coverage_tally_writes: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "BASE > Bullpen History is intentionally wired to the delta path because there is no separate Delta button. Check gaps first, then verify live data before manually running calendar/tally."
    });
  }

  if (job === "orchestrator_tick") {
    const pendingBefore = await env.CONTROL_DB.prepare(
      "SELECT request_id, job_key, worker_name, status, created_at, updated_at FROM control_job_queue WHERE status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 10"
    ).all();

    const payload = {
      source: "control_room_manual_wake_service_binding_proxy",
      max_jobs: 5,
      wake_only: true,
      auto_pump: true,
      pump: true,
      backend_budget_loop_requested: true,
      max_cycles: 4,
      max_jobs_per_cycle: 1,
      max_ms: 30000,
      max_pump_chains: 30,
      static_players_max_chunks_requested: 5,
      no_browser_loop: true,
      no_direct_browser_orchestrator_fetch: true,
      cron_rescue_only: true
    };

    const pumpResult = await callOrchestrator(env, "/pump", payload);
    const pumpOk = orchestratorCallOk(pumpResult);

    const pendingAfter = await env.CONTROL_DB.prepare(
      "SELECT request_id, job_key, worker_name, status, created_at, started_at, finished_at, updated_at FROM control_job_queue WHERE status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 10"
    ).all();

    return jsonResponse({
      ok: pumpOk,
      data_ok: pumpOk,
      version,
      job,
      orchestrator_mode: "control_room_service_binding_wake_proxy",
      status: pumpOk ? "backend_pump_started_or_completed" : "WAKE_PROXY_FAILED",
      backend_pump_launched: pumpOk,
      backend_service_binding_awaited: true,
      pump_route: pumpResult.route || null,
      pump_http_status: pumpResult.http_status,
      pump_body: pumpResult.body,
      direct_browser_orchestrator_fetch_removed: true,
      browser_auto_pump: false,
      no_browser_loop: true,
      cron_rescue_only: true,
      note: pumpOk
        ? "Wake proxied one bounded backend orchestrator pump through the Control Room service binding. Browser did not fetch the orchestrator and did not run a loop; cron remains fallback rescue only."
        : "Wake proxy failed before the backend pump accepted the request. This is not reported as launched. If pump_route is service_binding_missing, deploy the updated generate_wrangler_configs.py so alphadog-v2-control-room receives ORCHESTRATOR_WORKER.",
      pending_or_running_before: pendingBefore.results || [],
      pending_or_running_after: pendingAfter.results || []
    }, pumpOk ? 200 : 502);
  }

  if (job === "orchestrator_logs") {
    const q = await env.CONTROL_DB.prepare(
      "SELECT request_id, job_key, worker_name, status, tick_count, created_at, started_at, finished_at, updated_at, substr(output_json,1,900) AS output_preview FROM control_job_queue ORDER BY datetime(created_at) DESC LIMIT 10"
    ).all();
    const r = await env.CONTROL_DB.prepare(
      "SELECT run_id, request_id, job_key, worker_name, status, data_ok, certification_status, started_at, finished_at, elapsed_ms FROM control_job_runs ORDER BY datetime(started_at) DESC LIMIT 10"
    ).all();
    const l = await env.CONTROL_DB.prepare(
      "SELECT log_id, request_id, run_id, worker_name, job_key, level, event_key, message, created_at FROM control_worker_run_log ORDER BY log_id DESC LIMIT 20"
    ).all();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      orchestrator_mode: "local_control_db_bridge",
      queue: q.results || [],
      runs: r.results || [],
      logs: l.results || []
    });
  }

  return jsonResponse({
    ok: false,
    data_ok: false,
    version,
    job,
    status: "ORCHESTRATOR_BRIDGE_ROUTE_NOT_IMPLEMENTED",
    error: "Control Room allow-list accepted this job, but v12OrchestratorLocalBridge has no route branch for it.",
    note: "This guard prevents Cloudflare 1101/null-response failures and returns JSON for missing Control Room routes."
  }, 501);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return jsonResponse({ok:true});
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/control_room.html")) return htmlResponse(CONTROL_ROOM_HTML);
    if (request.method === "GET" && url.pathname === "/health") return jsonResponse(baseStatus(env, {route:"/health", ...bindingSummary(env)}));
    if (request.method === "GET" && url.pathname === "/diagnostic") return jsonResponse(baseStatus(env, {route:"/diagnostic", diagnostic: await schemaStatus(env), ...bindingSummary(env)}));
    if (request.method === "POST" && (url.pathname === "/debug/sql" || url.pathname === "/admin/sql")) {
      try {
        return await executeSql(request, env);
      } catch (e) {
        return jsonResponse({
          ok: false,
          data_ok: false,
          version: SYSTEM_VERSION,
          job: "manual_sql_exception_guard",
          error: String(e && e.message ? e.message : e),
          note: "Manual SQL exception was caught and returned as JSON instead of Cloudflare 1101."
        }, 500);
      }
    }
    if (request.method === "POST" && url.pathname === "/tasks/run") return runJob(request, env, ctx);
    return jsonResponse({ok:false, error:"not_found", path:url.pathname, version:SYSTEM_VERSION}, 404);
  },
  async scheduled(event, env, ctx) {
    // Control Room cron is intentionally inert. Orchestrator owns scheduled work.
  }
};
