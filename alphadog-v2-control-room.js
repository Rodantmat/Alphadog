const SYSTEM_VERSION = "alphadog-v2-control-room-v1.6.27-delta-pitcher-splits-noop-gate";

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

const CONTROL_ROOM_HTML = "<!DOCTYPE html>\n<html>\n<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>AlphaDog V2 Control Room</title>\n<!-- alphadog-v2-control-room-v1.6.27-delta-pitcher-splits-noop-gate -->\n<style>\n:root{--bg:#0b0f14;--line:#30363d;--green:#00ff88;--white:#fff;--muted:#aaa;--debug:#8957e5;--check:#238636;--audit:#0f766e;--sql:#d29922;--clean:#da3633;--orch:#0969da}\n*{box-sizing:border-box}\nbody{background:var(--bg);color:var(--green);font-family:monospace;padding:8px;margin:0;max-width:100vw;overflow-x:hidden}\nh2{font-size:18px;color:var(--green);letter-spacing:.045em;margin:10px 0 8px 0}\nh3{color:var(--white);font-size:12px;letter-spacing:.045em;margin:7px 0}\n.section{border-top:1px solid var(--line);padding-top:7px;margin-top:9px}\n.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;width:100%}\nbutton{min-width:0;width:100%;padding:4px 1px;font-size:10.5px;border:0;border-radius:5px;background:#1f6feb;color:var(--white);min-height:31px;white-space:normal;overflow:hidden;text-overflow:clip;line-height:1.0;display:flex;align-items:center;justify-content:center;text-align:center;word-break:normal}\n.clean{background:var(--clean)}.check{background:var(--check)}.sql{background:var(--sql)}.debug{background:var(--debug)}.audit{background:var(--audit)}.orch{background:var(--orch)}\n.copy{background:var(--debug);width:100%;margin-top:6px;min-height:34px;font-size:11px}\ninput,textarea{width:100%;box-sizing:border-box;background:#111;color:var(--green);border:1px solid var(--line);border-radius:6px;margin-top:6px;padding:7px;font-size:12px}\ntextarea{height:82px}\npre{background:#000;color:var(--green);padding:8px;margin-top:8px;overflow:auto;max-height:420px;min-height:150px;border:1px solid var(--line);border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:11px}\n.status{background:#111;color:var(--white);padding:7px;border-radius:6px;border:1px solid var(--line);margin:7px 0;white-space:pre-wrap;font-size:11px}\n.small,.muted{font-size:10px;color:var(--muted)}\n#versionTag{color:#9ae6b4;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.035em;margin-top:5px;margin-bottom:8px}\ntextarea#sqlInput, textarea{user-select:text;-webkit-user-select:text;pointer-events:auto}\n@media (max-width:430px){body{padding:8px}.grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}button{font-size:10px;min-height:30px;padding:3px 1px;border-radius:5px}h2{font-size:17px}h3{font-size:11px}.small,.muted{font-size:9.5px}}\n@media (max-width:370px){button{font-size:9.2px;min-height:29px}.grid{gap:2px}}\n</style>\n</head>\n<body>\n<h2>ALPHADOG CONTROL ROOM</h2>\n<div id=\"versionTag\">alphadog-v2-control-room-v1.6.27-delta-pitcher-splits-noop-gate</div>\n<div class=\"small\">PT Now: <span id=\"ptNowLabel\"></span></div>\n<div class=\"small\">Slate: AUTO by game date/time. No manual slate override.</div>\n<div class=\"small\">Access mode: single-user. Control Room enqueues/status only. Static Players, Static Prop Taxonomy, Static Certifier, Static Full Run, Sleeper source-probe, Base Hitter Game Logs base_backfill, Hitter Game Logs delta_update queue plus backend self-continuation launch, and Base Pitcher Game Logs base is locked; BASE > Pitcher Splits is locked promoted/cleaned and DELTA > Pitcher Splits runs the no-op/restore gate and Pitcher Delta Game Logs uses retained-stage restore/no-op before queue and scoped delta_update; Base Hitter Splits is locked promoted/cleaned, and DELTA > Hitter Splits runs the no-op/current-snapshot and retained-stage repair gate with no MLB calls when current; visible buttons are in BASE / DELTA. Orchestrator scheduled backend/cron owns continuation. Wake is optional backend test/rescue only.</div>\n<div class=\"status\" id=\"status\">READY</div>\n\n<div class=\"section\"><h3>DEBUG</h3><div class=\"grid\">\n<button class=\"debug\" type=\"button\" onclick=\"debugConfig()\">Config</button>\n<button class=\"debug\" type=\"button\" onclick=\"health()\">Health</button>\n<button class=\"debug\" type=\"button\" onclick=\"diagnostic()\">Diag</button>\n<button class=\"debug\" type=\"button\" onclick=\"testSQL()\">SQL</button>\n<button class=\"debug\" type=\"button\" onclick=\"reloadPage()\">Reload</button>\n</div></div>\n\n<div class=\"section\"><h3>V2 BOOTSTRAP / SCHEMA</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Schema','v2_schema_status')\">Schema</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Workers','v2_worker_registry')\">Workers</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Config','v2_config_summary')\">Config</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Phases','v2_phase_state')\">Phases</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Markets','v2_market_sources')\">Markets</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Props','v2_prop_taxonomy')\">Props</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Certs','v2_certification_rules')\">Certs</button>\n<button class=\"debug\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Bindings','v2_bindings_check')\">Bindings</button>\n</div><div class=\"small\">V2 only. No mining, no scoring, no old production writes.</div></div>\n\n<div class=\"section\"><h3>ORCHESTRATOR</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Status','orchestrator_status')\">Status</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Enqueue','orchestrator_enqueue_test')\">Enqueue</button>\n<button class=\"orch\" type=\"button\" onclick=\"runOrchestratorWake()\">Wake</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Logs','orchestrator_logs')\">Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Health','orchestrator_health')\">OHealth</button>\n</div><div class=\"small\">Wake = optional backend trigger for testing. It requests up to 5 safe backend chunks/jobs in one wake. Static Full Run remains backend-chain only. Self-continuing backend pump owns normal continuation; cron is fallback rescue only. No browser loops.</div></div>\n\n<div class=\"section\"><h3>BOARD</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BOARD > PrizePicks','orchestrator_enqueue_prizepicks_github_board')\">PrizePicks</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BOARD > Sleeper','orchestrator_enqueue_parlay_sleeper_board')\">Sleeper</button>\n</div><div class=\"small\">Board source refresh/probe only. PrizePicks refreshes board data. Sleeper queues source-probe readiness only. No promotion for Sleeper, no guessed aliases, no scoring, no ranking, no final board.</div></div>\n\n<div class=\"section\"><h3>STATIC</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Teams','orchestrator_enqueue_static_teams')\">Teams</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Stadiums','orchestrator_enqueue_static_stadiums')\">Stadiums</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Park Factors','orchestrator_enqueue_static_park_factors')\">Park Factors</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Players','orchestrator_enqueue_static_players')\">Players</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Prop Taxonomy','orchestrator_enqueue_static_prop_taxonomy')\">Prop Tax</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('STATIC > Certifier','orchestrator_enqueue_static_certifier')\">Certifier</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('STATIC > Full Run','orchestrator_enqueue_static_full_run')\">Full Run</button>\n</div><div class=\"small\">Static dictionary/reference data only. Certifier is read-only. Full Run reruns active static workers then certifier. Deferred static-rosters and static-player-aliases stay skipped. No scoring, no board mutation, no opponent backfill.</div></div>\n\n\n<div class=\"section\"><h3>BASE / DELTA</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Hitter Game Logs','orchestrator_enqueue_base_hitter_game_logs')\">Base Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Hitter Splits','orchestrator_enqueue_base_hitter_splits')\">Hitter Splits</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Pitcher Game Logs','orchestrator_enqueue_base_pitcher_game_logs')\">Pitcher Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Pitcher Splits','orchestrator_enqueue_base_pitcher_splits')\">Pitcher Splits</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Hitter Game Logs','orchestrator_enqueue_delta_hitter_game_logs')\">Delta Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Hitter Splits','orchestrator_enqueue_delta_hitter_splits')\">Hitter Splits Delta</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Pitcher Splits','orchestrator_enqueue_delta_pitcher_splits')\">Pitch Splits Delta</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Pitcher Game Logs','orchestrator_enqueue_delta_pitcher_game_logs')\">Pitch Delta</button>\n</div><div class=\"small\">Hitter base is locked at 2026-05-18. Base Hitter Splits is locked promoted/cleaned. Delta Hitter Splits v0.4.0 uses base integrity gate, retained-stage/live parity check, and no-op before queue when the season-to-date source snapshot is already current; no repeated manual Wake. Pitcher Game Logs base_backfill is locked complete. BASE > Pitcher Splits is v0.3.0 promotion-only: promotes the certified v0.2.0 stage batch with zero MLB calls, verifies live rows, then cleans stage; no remine, no delta. Pitcher Delta Game Logs v0.4.1 uses retained-stage restore before queue, schedule no-op before queue, and scoped completed-game boxscore pitcher targets; no normal full-universe sweep. Delta Hitter Game Logs v1.6.11 closes retained delta batches before no-op when stage/live promotion parity is verified, keeps retained batch immutable on failed increment attempts, and queues only when a newer final MLB date or surgical repair is needed. No scoring, no ranking, no board mutation. No browser pump, no scoring, no ranking, no final board, no board mutation.</div></div>\n\n<div class=\"section\"><h3>V2 SAFE ACTIONS</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Queue','v2_queue_status')\">Queue</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Locks','v2_lock_status')\">Locks</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Snap','v2_health_snapshot')\">Snap</button>\n<button class=\"clean\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Clear Q','v2_clear_open_queue')\">Clear Q</button>\n</div><div class=\"small\">Clear Q only changes v2 CONTROL_DB queue/lock state.</div></div>\n\n<div class=\"section\"><h3>MANUAL SQL</h3>\n<div class=\"muted\">Output guard active: max 50 rows. Optional first line: -- db: CONFIG_DB</div>\n<textarea id=\"sqlInput\" spellcheck=\"false\" autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"none\" inputmode=\"text\"></textarea>\n<div class=\"grid\">\n<button class=\"sql\" type=\"button\" onclick=\"runManualSQL()\">Run</button>\n<button class=\"debug\" type=\"button\" onclick=\"clearSqlInput()\">Clear</button>\n<button class=\"debug\" type=\"button\" onclick=\"selectSqlInput()\">Select</button>\n<button class=\"debug\" type=\"button\" onclick=\"loadExampleSQL()\">Example</button>\n</div></div>\n\n<pre id=\"output\">Output will appear here.</pre>\n<button class=\"copy\" type=\"button\" onclick=\"copyOutput()\">COPY OUTPUT</button>\n\n<script>\nconst BASE=\"https://alphadog-v2-control-room.rodolfoaamattos.workers.dev\";\nconst JOB_URL=BASE+\"/tasks/run\";\nconst SQL_URL=BASE+\"/debug/sql\";\nconst HEALTH_URL=BASE+\"/health\";\nconst DIAGNOSTIC_URL=BASE+\"/diagnostic\";\nconst ORCH_BASE=\"https://alphadog-v2-orchestrator.rodolfoaamattos.workers.dev\";\nconst ORCH_TICK_URL=ORCH_BASE+\"/tick\";\n\nfunction ptParts(){\n  const parts=new Intl.DateTimeFormat(\"en-CA\",{timeZone:\"America/Los_Angeles\",year:\"numeric\",month:\"2-digit\",day:\"2-digit\",hour:\"2-digit\",minute:\"2-digit\",second:\"2-digit\",hour12:false}).formatToParts(new Date());\n  const m={};\n  parts.forEach(p=>m[p.type]=p.value);\n  return {date:m.year+\"-\"+m.month+\"-\"+m.day,hour:Number(m.hour),time:m.hour+\":\"+m.minute+\":\"+m.second};\n}\nfunction updateClock(){\n  const p=ptParts();\n  const el=document.getElementById(\"ptNowLabel\");\n  if(el) el.textContent=p.date+\" \"+p.time;\n}\nfunction autoSlateContext(){\n  const p=ptParts();\n  let band=\"same-day dominant\";\n  if(p.hour>=12&&p.hour<20) band=\"split slate likely; workers resolve by game date/time\";\n  if(p.hour>=20||p.hour<4) band=\"next-day dominant likely; workers resolve by game date/time\";\n  return {mode:\"AUTO_BY_GAME_DATE_TIME\",pt_now:p,slate_band_hint:band,note:\"Control Room no longer manually overrides slate. Data workers must resolve pickability by actual game date/time and board availability.\"};\n}\nfunction setStatus(m){\n  const el=document.getElementById(\"status\");\n  if(el) el.textContent=\"[\"+new Date().toLocaleTimeString()+\"] \"+m;\n}\nfunction setOutput(l,o){\n  const out = [\n    \"ACTION: \"+l,\n    \"TIME: \"+new Date().toISOString(),\n    \"\",\n    (typeof o===\"string\"?o:JSON.stringify(o,null,2))\n  ].join(\"\\\\n\");\n  document.getElementById(\"output\").textContent=out;\n  window.scrollTo(0,document.body.scrollHeight);\n}\nfunction loading(l,e){\n  setStatus(\"RUNNING: \"+l);\n  setOutput(l,\"Loading...\"+(e?String.fromCharCode(10)+e:\"\"));\n}\nfunction debugConfig(){\n  setOutput(\"DEBUG > Config\",{base:BASE,auto_slate:autoSlateContext(),access_mode:\"single-user-admin-token-disabled\", orchestrator_mode:\"backend-scheduled-continuation\",version:\"alphadog-v2-control-room-v1.6.27-delta-pitcher-splits-noop-gate\"});\n}\nfunction reloadPage(){window.location.reload(true)}\nasync function rawRequest(l,u,p){\n  const h={\"Content-Type\":\"application/json\"};\n  const o=p===null?{method:\"GET\",headers:h}:{method:\"POST\",headers:h,body:JSON.stringify(p)};\n  try{\n    const r=await fetch(u,o);\n    const txt=await r.text();\n    let b;\n    try{b=JSON.parse(txt)}catch(e){b=txt}\n    return {http_status:r.status,body:b};\n  }catch(e){\n    return {ok:false,error:String(e),action:l,url:u};\n  }\n}\nasync function requestJSON(l,u,p){\n  loading(l);\n  const r=await rawRequest(l,u,p);\n  setStatus(\"DONE: \"+l+\" / HTTP \"+(r.http_status||\"ERR\"));\n  setOutput(l,r);\n  return r;\n}\nfunction health(){requestJSON(\"DEBUG > Health\",HEALTH_URL,null)}\nfunction diagnostic(){requestJSON(\"DEBUG > Diag\",DIAGNOSTIC_URL,null)}\nfunction testSQL(){requestJSON(\"DEBUG > SQL\",SQL_URL,{sql:\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\",max_rows:50,max_chars:900})}\nfunction runJobButton(l,j){\n  return requestJSON(l,JOB_URL,{job:j,slate_mode:\"AUTO_BY_GAME_DATE_TIME\",auto_slate_context:autoSlateContext(),backend_only:true});\n}\n\nasync function runOrchestratorWake(){\n  requestJSON(\"ORCHESTRATOR > Wake\",ORCH_TICK_URL,{source:\"control_room_manual_wake_tick\",backend_only:true,max_jobs:5,wake_only:true,backend_budget_loop_requested:true,static_players_max_chunks_requested:5,no_browser_loop:true,no_control_room_to_orchestrator_fetch:true});\n}\n\nfunction runManualSQL(){requestJSON(\"MANUAL SQL > Run\",SQL_URL,{sql:document.getElementById(\"sqlInput\").value,max_rows:50,max_chars:900})}\nfunction copyOutput(){navigator.clipboard.writeText(document.getElementById(\"output\").textContent);setStatus(\"COPIED OUTPUT\")}\nfunction clearSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.value=\"\";el.focus()}\nfunction selectSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.focus();el.select()}\nfunction loadExampleSQL(){const el=document.getElementById(\"sqlInput\");el.value=\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\";el.focus();setStatus(\"EXAMPLE SQL LOADED\")}\ndocument.addEventListener(\"DOMContentLoaded\",()=>{\n  const el=document.getElementById(\"sqlInput\");\n  if(el){el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.style.userSelect=\"text\";el.style.webkitUserSelect=\"text\";el.style.pointerEvents=\"auto\"}\n  updateClock();\n  setInterval(updateClock,1000);\n});\n</script>\n</body>\n</html>";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-ingest-token,x-admin-token,authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });
}

function htmlResponse(body) {
  return new Response(body, {status: 200, headers: {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"}});
}

function nowIso() { return new Date().toISOString(); }

function bindingSummary(env) {
  const dbs = Object.fromEntries(DB_BINDINGS.map(k => [k, !!env[k]]));
  const vars = Object.fromEntries(EXPECTED_VARS.map(k => [k, env[k] !== undefined && env[k] !== null && String(env[k]).length > 0]));
  const secrets = Object.fromEntries(EXPECTED_SECRETS.map(k => [k, env[k] !== undefined && env[k] !== null && String(env[k]).length > 0]));
  return {
    required_db_bindings_present: Object.values(dbs).every(Boolean),
    expected_vars_present: Object.values(vars).every(Boolean),
    required_secrets_present: Object.values(secrets).every(Boolean),
    checks: { db_bindings: dbs, vars, secrets_present_only: secrets },
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
      required_secrets_present: b.required_secrets_present
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
  const url = "https://alphadog-v2-orchestrator.rodolfoaamattos.workers.dev" + path;
  const headers = {"content-type":"application/json", "x-admin-token": env.ALPHADOG_INTERNAL_TOKEN || env.ALPHADOG_ADMIN_TOKEN || ""};
  const init = payload === null ? {method:"GET", headers} : {method:"POST", headers, body: JSON.stringify(payload)};
  try {
    const r = await fetch(url, init);
    const txt = await r.text();
    let body;
    try { body = JSON.parse(txt); } catch (_) { body = txt; }
    return {http_status:r.status, body};
  } catch (e) {
    return {http_status:null, body:{ok:false, error:String(e && e.message ? e.message : e), url}};
  }
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
  const stageRows = Number(stage && stage.c || 0);
  const liveRows = Number(live && live.c || 0);
  const rowsStaged = Number(latest.rows_staged || 0);
  const rowsPromoted = Number(latest.rows_promoted || 0);
  const missingLiveRows = Number(missingLive && missingLive.c || 0);
  const pass = stageRows > 0 && rowsStaged === stageRows && rowsPromoted === liveRows && liveRows > 0 && missingLiveRows === 0;
  let repairPlan = "NOOP_ALREADY_CURRENT";
  if (!pass) {
    if (stageRows > 0 && missingLiveRows > 0) repairPlan = "REPAIR_FROM_RETAINED_STAGE_ONLY";
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
    stage_min_game_date: stage && stage.min_game_date,
    stage_max_game_date: stage && stage.max_game_date,
    live_min_game_date: live && live.min_game_date,
    live_max_game_date: live && live.max_game_date,
    no_new_batch_safe: pass,
    no_mlb_calls_safe: pass,
    no_stage_write_safe: pass
  };
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

  if (pass) {
    await env.STATS_HITTER_DB.prepare(
      `UPDATE hitter_game_log_batches
       SET status='COMPLETED_PROMOTED_STAGE_RETAINED',
           rows_promoted=?,
           certification_status='DELTA_HITTER_GAME_LOGS_CERTIFIED_PROMOTED_STAGE_RETAINED',
           certification_grade='DELTA_PASS',
           updated_at=CURRENT_TIMESTAMP
       WHERE batch_id=?
         AND cleaned_at IS NULL`
    ).bind(liveRows, batchId).run();
  }

  return {
    restored: pass,
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
    no_new_batch: true,
    no_mlb_calls: true,
    no_stage_writes: true,
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
      "orchestrator_enqueue_base_hitter_game_logs",
      "orchestrator_enqueue_base_hitter_splits",
      "orchestrator_enqueue_delta_hitter_splits",
      "orchestrator_enqueue_base_pitcher_game_logs",
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
      mode: "parlay_sleeper_source_probe_readiness_only",
      created_at: now,
      no_scoring: true,
      no_ranking: true,
      no_final_board: true,
      no_prizepicks_mutation: true,
      no_promotion: true,
      no_alias_guessing: true,
      allowed_market_writes: ["sleeper_lifecycle_schema_ddl_only"],
      source_probe_only: true
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


  if (job === "orchestrator_enqueue_base_hitter_game_logs") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-hitter-game-logs' AND status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();

    if (existing) {
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(callOrchestrator(env, "/pump", {
          source: "control_room_base_hitter_game_logs_existing_auto_continue",
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
        visible_button: "BASE > Hitter Game Logs",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Base Hitter Game Logs queue row found. Control Room will launch backend pump again as a safe self-continuation nudge; browser does not run the job."
      });
    }

    const requestId = "base_hitter_logs_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_base_hitter_logs_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Hitter Game Logs",
      mode: "base_backfill",
      created_at: now,
      worker_scope: "base_backfill_self_continuation_v0_2_0",
      source_name: "MLB StatsAPI people gameLog hitting endpoint",
      source_key: "mlb_statsapi_people_gameLog_hitting_v0_1_0",
      endpoint_pattern: "/people/{playerId}/stats?stats=gameLog&group=hitting&season={season}",
      group_type: "hitting",
      base_backfill_cutoff_date: "2026-05-18",
      delta_reserved_start_date: "2026-05-19",
      cutoff_date_configurable_per_batch: true,
      delta_update_runtime_blocked_until_base_certified: true,
      allowed_writes: ["STATS_HITTER_DB.hitter_game_logs_stage", "STATS_HITTER_DB.hitter_game_log_batches", "STATS_HITTER_DB.hitter_game_log_cursor", "STATS_HITTER_DB.hitter_game_log_certifications", "STATS_HITTER_DB.hitter_schema_migrations"],
      no_live_promotion_before_certification: true,
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
      continuation_strategy: "orchestrator_owned_backend_self_continuation_with_persisted_cursor",
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
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-hitter-game-logs', 'alphadog-v2-base-hitter-game-logs', 'Base', 'base', 'Base Hitter Game Logs Base Backfill', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_hitter_game_logs', 'INFO', 'queued_base_hitter_game_logs_backfill', 'Queued exact Base Hitter Game Logs base_backfill self-continuation job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Hitter Game Logs", backend_scheduled_continuation:true, base_backfill_cutoff_date:"2026-05-18", delta_reserved_start_date:"2026-05-19"})).run();

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(callOrchestrator(env, "/pump", {
        source: "control_room_base_hitter_game_logs_auto_start",
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
      visible_button: "BASE > Hitter Game Logs",
      queued_job_key: "base-hitter-game-logs",
      queued_worker_name: "alphadog-v2-base-hitter-game-logs",
      base_backfill_cutoff_date: "2026-05-18",
      delta_reserved_start_date: "2026-05-19",
      base_backfill_self_continuation_v0_2_0: true,
      backend_self_continuation_launched: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: true,
      browser_auto_pump: false,
      note: "Queued in CONTROL_DB. Control Room launches one backend orchestrator pump via ctx.waitUntil; then orchestrator self-continues bounded chunks. Browser may close now. Cron is rescue fallback only. ORCHESTRATOR > Wake is optional test/rescue only."
    });
  }


  if (job === "orchestrator_enqueue_delta_hitter_splits") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-hitter-splits' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
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
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Base/Delta Hitter Splits queue row found. Do not repeatedly Wake; backend continuation owns the job."
      });
    }

    const requestId = "delta_hitter_splits_gate_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_delta_hitter_splits_gate_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Hitter Splits",
      mode: "delta_update",
      created_at: now,
      worker_scope: "delta_noop_restore_gate_v0_4_0",
      source_name: "MLB StatsAPI people statSplits hitting endpoint with sitCodes=vl,vr",
      source_key: "mlb_statsapi_people_statSplits_hitting_sitCodes_vl_vr_v0_2_0",
      source_season: 2026,
      source_snapshot_date: now.slice(0,10),
      source_snapshot_model: "season_to_date_aggregate_snapshot",
      base_integrity_gate_required: true,
      retained_stage_live_parity_check: true,
      noop_before_queue_if_current: true,
      restore_before_queue_if_retained_stage_available: true,
      no_new_mlb_calls_when_current: true,
      no_full_base_split_mining: true,
      no_base_promotion: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_mutation: true,
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
      no_browser_auto_pump: true,
      wake_once_for_test_only: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-hitter-splits', 'alphadog-v2-base-hitter-splits', 'Delta', 'delta', 'Delta Hitter Splits No-Op/Restore Gate v0.4.0', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_hitter_splits', 'INFO', 'queued_delta_hitter_splits_noop_restore_gate', 'Queued exact Delta Hitter Splits v0.4.0 no-op/restore gate job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Hitter Splits", delta_update:true, noop_before_queue_if_current:true, restore_before_queue_if_retained_stage_available:true, no_new_mlb_calls_when_current:true})).run();

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
      delta_update: true,
      noop_before_queue_if_current: true,
      restore_before_queue_if_retained_stage_available: true,
      no_new_mlb_calls_when_current: true,
      no_full_base_split_mining: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued v0.4.0 delta no-op/restore gate in CONTROL_DB. Tap ORCHESTRATOR > Wake once to dispatch. If live split snapshot is current, this should complete with zero MLB calls and no live mutation."
    });
  }


  if (job === "orchestrator_enqueue_base_hitter_splits") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-hitter-splits' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
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
        visible_button: "BASE > Hitter Splits",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Base Hitter Splits queue row found. Do not repeatedly Wake; backend continuation owns the job."
      });
    }

    const requestId = "base_hitter_splits_promote_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_base_hitter_splits_promote_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Hitter Splits",
      mode: "base_promotion_microphase",
      created_at: now,
      worker_scope: "certified_stage_promotion_v0_3_0",
      source_name: "MLB StatsAPI people statSplits hitting endpoint with sitCodes=vl,vr",
      source_key: "mlb_statsapi_people_statSplits_hitting_sitCodes_vl_vr_v0_2_0",
      source_season: 2026,
      source_snapshot_model: "season_to_date_aggregate_snapshot",
      certified_stage_required: true,
      certified_stage_worker_version: "alphadog-v2-base-hitter-splits-v0.2.0-base-backfill-stage-only",
      certified_stage_status: "BASE_BACKFILL_STAGE_ONLY_COMPLETED_NO_PROMOTION",
      certified_stage_certification: "BASE_HITTER_SPLITS_BASE_BACKFILL_STAGE_ONLY_CERTIFIED_NO_PROMOTION",
      promotion_chunk_size: 250,
      allowed_writes: ["STATS_HITTER_DB.hitter_splits", "STATS_HITTER_DB.hitter_split_stage.promoted_at", "STATS_HITTER_DB.hitter_split_batches", "STATS_HITTER_DB.hitter_split_cursor", "STATS_HITTER_DB.hitter_split_certifications"],
      live_promotion_from_certified_stage_only: true,
      no_new_mlb_calls: true,
      no_remine: true,
      clean_stage_after_live_verification: true,
      no_delta_update: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_mutation: true,
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
      no_browser_auto_pump: true,
      wake_once_for_test_only: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-hitter-splits', 'alphadog-v2-base-hitter-splits', 'Base', 'base', 'Base Hitter Splits Certified Stage Promotion v0.3.0', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_hitter_splits', 'INFO', 'queued_base_hitter_splits_promotion', 'Queued exact Base Hitter Splits v0.3.0 certified-stage promotion job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Hitter Splits", certified_stage_promotion:true, no_new_mlb_calls:true, no_delta_update:true, promotion_chunk_size:250})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Hitter Splits",
      queued_job_key: "base-hitter-splits",
      queued_worker_name: "alphadog-v2-base-hitter-splits",
      certified_stage_promotion: true,
      no_new_mlb_calls: true,
      no_remine: true,
      no_delta_update: true,
      clean_stage_after_live_verification: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued v0.3.0 certified-stage promotion in CONTROL_DB. Tap ORCHESTRATOR > Wake once to dispatch. No MLB calls, no remine, no delta."
    });
  }


  if (job === "orchestrator_enqueue_delta_pitcher_splits") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-pitcher-splits' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
    ).first();
    if (existing) {
      return jsonResponse({ ok: true, data_ok: true, version, job, status: "already_queued", request_id: existing.request_id, existing, visible_button: "DELTA > Pitcher Splits", backend_scheduled_continuation: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Existing Base Pitcher Splits queue row found. Do not repeatedly Wake; backend continuation owns any continuation." });
    }
    const requestId = "delta_pitcher_splits_gate_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_delta_pitcher_splits_gate_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "DELTA > Pitcher Splits",
      mode: "delta_update_noop_restore_gate",
      created_at: now,
      worker_scope: "delta_noop_restore_gate_v0_4_0",
      source_name: "MLB StatsAPI people statSplits pitching endpoint with sitCodes=vl,vr",
      source_key: "mlb_statsapi_people_statSplits_pitching_sitCodes_vl_vr_v0_1_0",
      source_season: 2026,
      locked_base_required: true,
      expected_locked_base_batch_status: "COMPLETED_PROMOTED_CLEANED",
      no_mlb_calls_when_source_snapshot_current: true,
      no_balanced_split_assumption: true,
      outcome_rows_staged_non_authoritative: true,
      physical_truth_sources: ["pitcher_splits live rows", "pitcher_split_batches.rows_staged", "pitcher_split_batches.rows_promoted"],
      no_live_promotion: true,
      no_remine: true,
      no_hitter_splits_mutation: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_game_log_mutation: true,
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
      no_browser_auto_pump: true,
      wake_once_for_test_only: true
    };
    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-splits', 'alphadog-v2-base-pitcher-splits', 'Delta', 'delta', 'Delta Pitcher Splits No-Op Restore Gate v0.4.0', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();
    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_pitcher_splits', 'INFO', 'queued_delta_pitcher_splits_noop_restore_gate', 'Queued Delta Pitcher Splits v0.4.0 no-op/restore gate job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({ request_id: requestId, chain_id: chainId, visible_button: "DELTA > Pitcher Splits", delta_noop_restore_gate: true, no_mlb_calls_when_current: true, no_balanced_split_assumption: true })).run();
    return jsonResponse({ ok: true, data_ok: true, version, job, status: "queued", request_id: requestId, chain_id: chainId, visible_button: "DELTA > Pitcher Splits", queued_job_key: "base-pitcher-splits", queued_worker_name: "alphadog-v2-base-pitcher-splits", delta_noop_restore_gate: true, no_mlb_calls_when_current: true, no_balanced_split_assumption: true, outcome_rows_staged_non_authoritative: true, backend_scheduled_continuation: true, auto_pump_triggered: false, browser_auto_pump: false, note: "Queued v0.4.0 delta/no-op/restore gate. Tap ORCHESTRATOR > Wake once to dispatch. No MLB calls if source snapshot is current." });
  }


  if (job === "orchestrator_enqueue_base_pitcher_splits") {
    const existing = await env.CONTROL_DB.prepare(
      "SELECT request_id, status, created_at, updated_at FROM control_job_queue WHERE job_key = 'base-pitcher-splits' AND status IN ('pending','running','partial_continue') ORDER BY datetime(created_at) DESC LIMIT 1"
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
        visible_button: "BASE > Pitcher Splits",
        backend_scheduled_continuation: true,
        auto_pump_triggered: false,
        browser_auto_pump: false,
        note: "Existing Base Pitcher Splits promotion queue row found. Do not repeatedly Wake; backend continuation owns any continuation."
      });
    }

    const requestId = "base_pitcher_splits_promote_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const chainId = "chain_base_pitcher_splits_promote_" + Date.now().toString(36);
    const input = {
      source: "control_room",
      visible_button: "BASE > Pitcher Splits",
      mode: "base_backfill_promote_certified_stage",
      created_at: now,
      worker_scope: "promote_certified_stage_v0_3_0",
      source_name: "MLB StatsAPI people statSplits pitching endpoint with sitCodes=vl,vr",
      source_key: "mlb_statsapi_people_statSplits_pitching_sitCodes_vl_vr_v0_1_0",
      source_season: 2026,
      chunk_size: 20,
      promotion_chunk_size: 20,
      promote_certified_stage_only: true,
      allowed_writes: ["STATS_PITCHER_DB.pitcher_splits", "STATS_PITCHER_DB.pitcher_split_batches", "STATS_PITCHER_DB.pitcher_split_cursor", "STATS_PITCHER_DB.pitcher_split_certifications", "STATS_PITCHER_DB.pitcher_split_stage cleanup after live verification"],
      rows_promoted_expected: 1134,
      live_pitcher_splits_promotion_from_certified_stage_only: true,
      no_remine: true,
      no_delta_update_execution: true,
      no_hitter_splits_mutation: true,
      no_hitter_game_log_mutation: true,
      no_pitcher_game_log_mutation: true,
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
      no_browser_auto_pump: true,
      wake_once_for_test_only: true
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-splits', 'alphadog-v2-base-pitcher-splits', 'Base', 'base', 'Base Pitcher Splits Promote Certified Stage v0.3.0', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_base_pitcher_splits', 'INFO', 'queued_base_pitcher_splits_promote_certified_stage', 'Queued exact Base Pitcher Splits v0.3.0 certified-stage promotion job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"BASE > Pitcher Splits", promote_certified_stage_only:true, rows_promoted_expected:1134, promotion_chunk_size:20})).run();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      status: "queued",
      request_id: requestId,
      chain_id: chainId,
      visible_button: "BASE > Pitcher Splits",
      queued_job_key: "base-pitcher-splits",
      queued_worker_name: "alphadog-v2-base-pitcher-splits",
      promote_certified_stage_only: true,
      chunk_size: 20,
      rows_promoted_expected: 1134,
      no_live_pitcher_splits_promotion: true,
      full_universe_stage_only: true,
      no_delta_update_execution: true,
      backend_scheduled_continuation: true,
      auto_pump_triggered: false,
      browser_auto_pump: false,
      note: "Queued v0.2.0 full-universe stage-only job in CONTROL_DB. Tap ORCHESTRATOR > Wake once to dispatch. No live promotion, no delta; backend continuation owns remaining chunks."
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
      source_probe_only: false,
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
    if (retained) {
      const parity = await crPitcherDeltaParity(env, retained);
      if (!parity.pass && parity.missing_live_rows > 0) {
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
      if (parity.pass) {
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
      retained_stage_guard: retainedParity
    };

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_job_queue (request_id, chain_id, job_key, worker_name, worker_group, phase_key, display_name, status, priority, cascade, input_json, run_after, created_at, updated_at) VALUES (?, ?, 'base-pitcher-game-logs', 'alphadog-v2-base-pitcher-game-logs', 'Delta', 'delta', 'Delta Pitcher Game Logs Scoped Retained Stage Update', 'pending', 5, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(requestId, chainId, JSON.stringify(input)).run();

    await env.CONTROL_DB.prepare(
      "INSERT INTO control_worker_run_log (request_id, worker_name, job_key, level, event_key, message, data_json, created_at) VALUES (?, 'alphadog-v2-control-room', 'orchestrator_enqueue_delta_pitcher_game_logs', 'INFO', 'queued_delta_pitcher_game_logs_scoped_update', 'Queued exact Delta Pitcher Game Logs scoped retained-stage update job', ?, CURRENT_TIMESTAMP)"
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Pitcher Game Logs", backend_scheduled_continuation:true, delta_start_date:deltaStart, delta_end_date:sourceFinal.latest_complete_game_date, no_normal_full_universe_sweep:true})).run();

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
    ).bind(requestId, JSON.stringify({request_id:requestId, chain_id:chainId, visible_button:"DELTA > Hitter Game Logs", backend_scheduled_continuation:true, delta_start_date:"2026-05-19", required_base_batch_id:"hitter_base_backfill_batch_mpelpq0t_akyyu3"})).run();

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

  if (job === "orchestrator_tick") {
    const pending = await env.CONTROL_DB.prepare(
      "SELECT request_id, job_key, worker_name, status, created_at, updated_at FROM control_job_queue WHERE status IN ('pending','running') ORDER BY datetime(created_at) DESC LIMIT 10"
    ).all();

    return jsonResponse({
      ok: true,
      data_ok: true,
      version,
      job,
      orchestrator_mode: "backend_scheduled_continuation",
      status: "queued_backend_continuation",
      note: "Control Room queues only. Static Players continuation is owned by alphadog-v2-orchestrator scheduled backend/cron. ORCHESTRATOR > Wake is a manual backend test only.",
      pending_or_running: pending.results || []
    });
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

  return null;
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
