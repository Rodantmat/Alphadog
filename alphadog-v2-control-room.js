const SYSTEM_VERSION = "alphadog-v2-control-room-v1.6.3-autopump-env-binding-fix";

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

const CONTROL_ROOM_HTML = "<!DOCTYPE html>\n<html>\n<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>AlphaDog V2 Control Room</title>\n<!-- alphadog-v2-control-room-v1.6.3-autopump-env-binding-fix -->\n<style>\n:root{--bg:#0b0f14;--line:#30363d;--green:#00ff88;--white:#fff;--muted:#aaa;--debug:#8957e5;--check:#238636;--audit:#0f766e;--sql:#d29922;--clean:#da3633;--orch:#0969da}\n*{box-sizing:border-box}\nbody{background:var(--bg);color:var(--green);font-family:monospace;padding:8px;margin:0;max-width:100vw;overflow-x:hidden}\nh2{font-size:18px;color:var(--green);letter-spacing:.045em;margin:10px 0 8px 0}\nh3{color:var(--white);font-size:12px;letter-spacing:.045em;margin:7px 0}\n.section{border-top:1px solid var(--line);padding-top:7px;margin-top:9px}\n.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;width:100%}\nbutton{min-width:0;width:100%;padding:4px 1px;font-size:10.5px;border:0;border-radius:5px;background:#1f6feb;color:var(--white);min-height:31px;white-space:normal;overflow:hidden;text-overflow:clip;line-height:1.0;display:flex;align-items:center;justify-content:center;text-align:center;word-break:normal}\n.clean{background:var(--clean)}.check{background:var(--check)}.sql{background:var(--sql)}.debug{background:var(--debug)}.audit{background:var(--audit)}.orch{background:var(--orch)}\n.copy{background:var(--debug);width:100%;margin-top:6px;min-height:34px;font-size:11px}\ninput,textarea{width:100%;box-sizing:border-box;background:#111;color:var(--green);border:1px solid var(--line);border-radius:6px;margin-top:6px;padding:7px;font-size:12px}\ntextarea{height:82px}\npre{background:#000;color:var(--green);padding:8px;margin-top:8px;overflow:auto;max-height:420px;min-height:150px;border:1px solid var(--line);border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:11px}\n.status{background:#111;color:var(--white);padding:7px;border-radius:6px;border:1px solid var(--line);margin:7px 0;white-space:pre-wrap;font-size:11px}\n.small,.muted{font-size:10px;color:var(--muted)}\n#versionTag{color:#9ae6b4;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.035em;margin-top:5px;margin-bottom:8px}\ntextarea#sqlInput, textarea{user-select:text;-webkit-user-select:text;pointer-events:auto}\n@media (max-width:430px){body{padding:8px}.grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}button{font-size:10px;min-height:30px;padding:3px 1px;border-radius:5px}h2{font-size:17px}h3{font-size:11px}.small,.muted{font-size:9.5px}}\n@media (max-width:370px){button{font-size:9.2px;min-height:29px}.grid{gap:2px}}\n</style>\n</head>\n<body>\n<h2>ALPHADOG CONTROL ROOM</h2>\n<div id=\"versionTag\">alphadog-v2-control-room-v1.6.3-autopump-env-binding-fix</div>\n<div class=\"small\">PT Now: <span id=\"ptNowLabel\"></span></div>\n<div class=\"small\">Slate: AUTO by game date/time. No manual slate override.</div>\n<div class=\"small\">Access mode: single-user. Control Room enqueues/status only. Static Players, Static Prop Taxonomy, Static Certifier, Static Full Run, Sleeper source-probe, Base Hitter Game Logs base_backfill, and Hitter Game Logs delta_update queue plus backend self-continuation launch. Orchestrator scheduled backend/cron owns continuation. Wake is optional backend test/rescue only.</div>\n<div class=\"status\" id=\"status\">READY</div>\n\n<div class=\"section\"><h3>DEBUG</h3><div class=\"grid\">\n<button class=\"debug\" type=\"button\" onclick=\"debugConfig()\">Config</button>\n<button class=\"debug\" type=\"button\" onclick=\"health()\">Health</button>\n<button class=\"debug\" type=\"button\" onclick=\"diagnostic()\">Diag</button>\n<button class=\"debug\" type=\"button\" onclick=\"testSQL()\">SQL</button>\n<button class=\"debug\" type=\"button\" onclick=\"reloadPage()\">Reload</button>\n</div></div>\n\n<div class=\"section\"><h3>V2 BOOTSTRAP / SCHEMA</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Schema','v2_schema_status')\">Schema</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Workers','v2_worker_registry')\">Workers</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Config','v2_config_summary')\">Config</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Phases','v2_phase_state')\">Phases</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Markets','v2_market_sources')\">Markets</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Props','v2_prop_taxonomy')\">Props</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Certs','v2_certification_rules')\">Certs</button>\n<button class=\"debug\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Bindings','v2_bindings_check')\">Bindings</button>\n</div><div class=\"small\">V2 only. No mining, no scoring, no old production writes.</div></div>\n\n<div class=\"section\"><h3>ORCHESTRATOR</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Status','orchestrator_status')\">Status</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Enqueue','orchestrator_enqueue_test')\">Enqueue</button>\n<button class=\"orch\" type=\"button\" onclick=\"runOrchestratorWake()\">Wake</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Logs','orchestrator_logs')\">Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('ORCHESTRATOR > Health','orchestrator_health')\">OHealth</button>\n</div><div class=\"small\">Wake = optional backend trigger for testing. It requests up to 5 safe backend chunks/jobs in one wake. Static Full Run remains backend-chain only. Self-continuing backend pump owns normal continuation; cron is fallback rescue only. No browser loops.</div></div>\n\n<div class=\"section\"><h3>BOARD</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BOARD > PrizePicks','orchestrator_enqueue_prizepicks_github_board')\">PrizePicks</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BOARD > Sleeper','orchestrator_enqueue_parlay_sleeper_board')\">Sleeper</button>\n</div><div class=\"small\">Board source refresh/probe only. PrizePicks refreshes board data. Sleeper queues source-probe readiness only. No promotion for Sleeper, no guessed aliases, no scoring, no ranking, no final board.</div></div>\n\n<div class=\"section\"><h3>STATIC</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Teams','orchestrator_enqueue_static_teams')\">Teams</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Stadiums','orchestrator_enqueue_static_stadiums')\">Stadiums</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Park Factors','orchestrator_enqueue_static_park_factors')\">Park Factors</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Players','orchestrator_enqueue_static_players')\">Players</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('STATIC > Prop Taxonomy','orchestrator_enqueue_static_prop_taxonomy')\">Prop Tax</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('STATIC > Certifier','orchestrator_enqueue_static_certifier')\">Certifier</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('STATIC > Full Run','orchestrator_enqueue_static_full_run')\">Full Run</button>\n</div><div class=\"small\">Static dictionary/reference data only. Certifier is read-only. Full Run reruns active static workers then certifier. Deferred static-rosters and static-player-aliases stay skipped. No scoring, no board mutation, no opponent backfill.</div></div>\n\n\n<div class=\"section\"><h3>BASE / DELTA</h3><div class=\"grid\">\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('BASE > Hitter Game Logs','orchestrator_enqueue_base_hitter_game_logs')\">Base Logs</button>\n<button class=\"orch\" type=\"button\" onclick=\"runJobButton('DELTA > Hitter Game Logs','orchestrator_enqueue_delta_hitter_game_logs')\">Delta Logs</button>\n</div><div class=\"small\">Base is locked at 2026-05-18. Delta Hitter Game Logs v1.6.3 is a certifying repair/update engine: base integrity gate first, initial full catch-up from 2026-05-19 through latest finalized MLB date, then 7-day repair lookback after prior delta live rows exist, stage-certify-promote-clean lifecycle, SQL-safe microchunks, backend self-continuation only. No browser pump, no scoring, no ranking, no final board, no board mutation.</div></div>\n\n<div class=\"section\"><h3>V2 SAFE ACTIONS</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Queue','v2_queue_status')\">Queue</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Locks','v2_lock_status')\">Locks</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Snap','v2_health_snapshot')\">Snap</button>\n<button class=\"clean\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Clear Q','v2_clear_open_queue')\">Clear Q</button>\n</div><div class=\"small\">Clear Q only changes v2 CONTROL_DB queue/lock state.</div></div>\n\n<div class=\"section\"><h3>MANUAL SQL</h3>\n<div class=\"muted\">Output guard active: max 50 rows. Optional first line: -- db: CONFIG_DB</div>\n<textarea id=\"sqlInput\" spellcheck=\"false\" autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"none\" inputmode=\"text\"></textarea>\n<div class=\"grid\">\n<button class=\"sql\" type=\"button\" onclick=\"runManualSQL()\">Run</button>\n<button class=\"debug\" type=\"button\" onclick=\"clearSqlInput()\">Clear</button>\n<button class=\"debug\" type=\"button\" onclick=\"selectSqlInput()\">Select</button>\n<button class=\"debug\" type=\"button\" onclick=\"loadExampleSQL()\">Example</button>\n</div></div>\n\n<pre id=\"output\">Output will appear here.</pre>\n<button class=\"copy\" type=\"button\" onclick=\"copyOutput()\">COPY OUTPUT</button>\n\n<script>\nconst BASE=\"https://alphadog-v2-control-room.rodolfoaamattos.workers.dev\";\nconst JOB_URL=BASE+\"/tasks/run\";\nconst SQL_URL=BASE+\"/debug/sql\";\nconst HEALTH_URL=BASE+\"/health\";\nconst DIAGNOSTIC_URL=BASE+\"/diagnostic\";\nconst ORCH_BASE=\"https://alphadog-v2-orchestrator.rodolfoaamattos.workers.dev\";\nconst ORCH_TICK_URL=ORCH_BASE+\"/tick\";\n\nfunction ptParts(){\n  const parts=new Intl.DateTimeFormat(\"en-CA\",{timeZone:\"America/Los_Angeles\",year:\"numeric\",month:\"2-digit\",day:\"2-digit\",hour:\"2-digit\",minute:\"2-digit\",second:\"2-digit\",hour12:false}).formatToParts(new Date());\n  const m={};\n  parts.forEach(p=>m[p.type]=p.value);\n  return {date:m.year+\"-\"+m.month+\"-\"+m.day,hour:Number(m.hour),time:m.hour+\":\"+m.minute+\":\"+m.second};\n}\nfunction updateClock(){\n  const p=ptParts();\n  const el=document.getElementById(\"ptNowLabel\");\n  if(el) el.textContent=p.date+\" \"+p.time;\n}\nfunction autoSlateContext(){\n  const p=ptParts();\n  let band=\"same-day dominant\";\n  if(p.hour>=12&&p.hour<20) band=\"split slate likely; workers resolve by game date/time\";\n  if(p.hour>=20||p.hour<4) band=\"next-day dominant likely; workers resolve by game date/time\";\n  return {mode:\"AUTO_BY_GAME_DATE_TIME\",pt_now:p,slate_band_hint:band,note:\"Control Room no longer manually overrides slate. Data workers must resolve pickability by actual game date/time and board availability.\"};\n}\nfunction setStatus(m){\n  const el=document.getElementById(\"status\");\n  if(el) el.textContent=\"[\"+new Date().toLocaleTimeString()+\"] \"+m;\n}\nfunction setOutput(l,o){\n  const out = [\n    \"ACTION: \"+l,\n    \"TIME: \"+new Date().toISOString(),\n    \"\",\n    (typeof o===\"string\"?o:JSON.stringify(o,null,2))\n  ].join(\"\\\\n\");\n  document.getElementById(\"output\").textContent=out;\n  window.scrollTo(0,document.body.scrollHeight);\n}\nfunction loading(l,e){\n  setStatus(\"RUNNING: \"+l);\n  setOutput(l,\"Loading...\"+(e?String.fromCharCode(10)+e:\"\"));\n}\nfunction debugConfig(){\n  setOutput(\"DEBUG > Config\",{base:BASE,auto_slate:autoSlateContext(),access_mode:\"single-user-admin-token-disabled\", orchestrator_mode:\"backend-scheduled-continuation\",version:\"alphadog-v2-control-room-v1.6.3-autopump-env-binding-fix\"});\n}\nfunction reloadPage(){window.location.reload(true)}\nasync function rawRequest(l,u,p){\n  const h={\"Content-Type\":\"application/json\"};\n  const o=p===null?{method:\"GET\",headers:h}:{method:\"POST\",headers:h,body:JSON.stringify(p)};\n  try{\n    const r=await fetch(u,o);\n    const txt=await r.text();\n    let b;\n    try{b=JSON.parse(txt)}catch(e){b=txt}\n    return {http_status:r.status,body:b};\n  }catch(e){\n    return {ok:false,error:String(e),action:l,url:u};\n  }\n}\nasync function requestJSON(l,u,p){\n  loading(l);\n  const r=await rawRequest(l,u,p);\n  setStatus(\"DONE: \"+l+\" / HTTP \"+(r.http_status||\"ERR\"));\n  setOutput(l,r);\n  return r;\n}\nfunction health(){requestJSON(\"DEBUG > Health\",HEALTH_URL,null)}\nfunction diagnostic(){requestJSON(\"DEBUG > Diag\",DIAGNOSTIC_URL,null)}\nfunction testSQL(){requestJSON(\"DEBUG > SQL\",SQL_URL,{sql:\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\",max_rows:50,max_chars:900})}\nfunction runJobButton(l,j){\n  return requestJSON(l,JOB_URL,{job:j,slate_mode:\"AUTO_BY_GAME_DATE_TIME\",auto_slate_context:autoSlateContext(),backend_only:true});\n}\n\nasync function runOrchestratorWake(){\n  requestJSON(\"ORCHESTRATOR > Wake\",ORCH_TICK_URL,{source:\"control_room_manual_wake_tick\",backend_only:true,max_jobs:5,wake_only:true,backend_budget_loop_requested:true,static_players_max_chunks_requested:5,no_browser_loop:true,no_control_room_to_orchestrator_fetch:true});\n}\n\nfunction runManualSQL(){requestJSON(\"MANUAL SQL > Run\",SQL_URL,{sql:document.getElementById(\"sqlInput\").value,max_rows:50,max_chars:900})}\nfunction copyOutput(){navigator.clipboard.writeText(document.getElementById(\"output\").textContent);setStatus(\"COPIED OUTPUT\")}\nfunction clearSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.value=\"\";el.focus()}\nfunction selectSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.focus();el.select()}\nfunction loadExampleSQL(){const el=document.getElementById(\"sqlInput\");el.value=\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\";el.focus();setStatus(\"EXAMPLE SQL LOADED\")}\ndocument.addEventListener(\"DOMContentLoaded\",()=>{\n  const el=document.getElementById(\"sqlInput\");\n  if(el){el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.style.userSelect=\"text\";el.style.webkitUserSelect=\"text\";el.style.pointerEvents=\"auto\"}\n  updateClock();\n  setInterval(updateClock,1000);\n});\n</script>\n</body>\n</html>";

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
      "orchestrator_enqueue_delta_hitter_game_logs",
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

  if (job === "orchestrator_enqueue_delta_hitter_game_logs") {
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
      worker_scope: "delta_certifying_repair_engine_v1_6_2_partial_continue_full_catchup",
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
