const SYSTEM_VERSION = "alphadog-v2-control-room-v0.6";
const CONTROL_ROOM_HTML = "<!DOCTYPE html>\n<html>\n<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>AlphaDog V2 Control Room</title>\n<!-- alphadog-v2-control-room-v0.6 - embedded compact phone UI -->\n<style>\n:root{--bg:#0b0f14;--line:#30363d;--green:#00ff88;--white:#fff;--muted:#aaa;--debug:#8957e5;--check:#238636;--audit:#0f766e;--sql:#d29922;--clean:#da3633}\n*{box-sizing:border-box}\nbody{background:var(--bg);color:var(--green);font-family:monospace;padding:8px;margin:0;max-width:100vw;overflow-x:hidden}\nh2{font-size:18px;color:var(--green);letter-spacing:.045em;margin:10px 0 8px 0}\nh3{color:var(--white);font-size:12px;letter-spacing:.045em;margin:7px 0}\n.section{border-top:1px solid var(--line);padding-top:7px;margin-top:9px}\n.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;width:100%}\nbutton{min-width:0;width:100%;padding:4px 1px;font-size:8.5px;border:0;border-radius:5px;background:#1f6feb;color:var(--white);min-height:31px;white-space:normal;overflow:hidden;text-overflow:clip;line-height:1.0;display:flex;align-items:center;justify-content:center;text-align:center;word-break:normal}\n.clean{background:var(--clean)}.check{background:var(--check)}.sql{background:var(--sql)}.debug{background:var(--debug)}.audit{background:var(--audit)}\n.copy{background:var(--debug);width:100%;margin-top:6px;min-height:34px;font-size:10px}\ninput,textarea{width:100%;box-sizing:border-box;background:#111;color:var(--green);border:1px solid var(--line);border-radius:6px;margin-top:6px;padding:7px;font-size:12px}\ntextarea{height:82px}\npre{background:#000;color:var(--green);padding:8px;margin-top:8px;overflow:auto;max-height:420px;min-height:150px;border:1px solid var(--line);border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:11px}\n.status{background:#111;color:var(--white);padding:7px;border-radius:6px;border:1px solid var(--line);margin:7px 0;white-space:pre-wrap;font-size:11px}\n.small,.muted{font-size:10px;color:var(--muted)}\n#versionTag{color:#9ae6b4;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.035em;margin-top:5px;margin-bottom:8px}\ntextarea#sqlInput, textarea{user-select:text;-webkit-user-select:text;pointer-events:auto}\n@media (max-width:430px){body{padding:8px}.grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}button{font-size:8px;min-height:30px;padding:3px 1px;border-radius:5px}h2{font-size:17px}h3{font-size:11px}.small,.muted{font-size:9.5px}}\n@media (max-width:370px){button{font-size:7.5px;min-height:29px}.grid{gap:2px}}\n</style>\n</head>\n<body>\n<h2>ALPHADOG CONTROL ROOM</h2>\n<div id=\"versionTag\">alphadog-v2-control-room-v0.6</div>\n<div class=\"small\">PT Now: <span id=\"ptNowLabel\"></span></div>\n<div class=\"small\">Slate: AUTO by game date/time. No manual slate override.</div>\n<div class=\"status\" id=\"status\">READY</div>\n\n<div class=\"section\"><h3>DEBUG</h3><div class=\"grid\">\n<button class=\"debug\" type=\"button\" onclick=\"debugConfig()\">Config</button>\n<button class=\"debug\" type=\"button\" onclick=\"health()\">Health</button>\n<button class=\"debug\" type=\"button\" onclick=\"diagnostic()\">Diag</button>\n<button class=\"debug\" type=\"button\" onclick=\"testSQL()\">SQL</button>\n<button class=\"debug\" type=\"button\" onclick=\"loadConfig()\">Reload</button>\n</div></div>\n\n<div class=\"section\"><h3>V2 BOOTSTRAP / SCHEMA</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Schema','v2_schema_status')\">Schema</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Workers','v2_worker_registry')\">Workers</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Config','v2_config_summary')\">Config</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Phases','v2_phase_state')\">Phases</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Markets','v2_market_sources')\">Markets</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Props','v2_prop_taxonomy')\">Props</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Certs','v2_certification_rules')\">Certs</button>\n<button class=\"debug\" type=\"button\" onclick=\"runJobButton('V2 BOOTSTRAP / SCHEMA > Bindings','v2_bindings_check')\">Bindings</button>\n</div><div class=\"small\">V2 only. No mining, no scoring, no old production writes.</div></div>\n\n<div class=\"section\"><h3>V2 SAFE ACTIONS</h3><div class=\"grid\">\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Queue','v2_queue_status')\">Queue</button>\n<button class=\"check\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Locks','v2_lock_status')\">Locks</button>\n<button class=\"audit\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Snap','v2_health_snapshot')\">Snap</button>\n<button class=\"clean\" type=\"button\" onclick=\"runJobButton('V2 SAFE ACTIONS > Clear Q','v2_clear_open_queue')\">Clear Q</button>\n</div><div class=\"small\">Clear Q only changes v2 CONTROL_DB queue/lock state.</div></div>\n\n<div class=\"section\"><h3>MANUAL SQL</h3>\n<div class=\"muted\">Output guard active: max 50 rows. Optional first line: -- db: CONFIG_DB</div>\n<textarea id=\"sqlInput\" spellcheck=\"false\" autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"none\" inputmode=\"text\"></textarea>\n<div class=\"grid\">\n<button class=\"sql\" type=\"button\" onclick=\"runManualSQL()\">Run</button>\n<button class=\"debug\" type=\"button\" onclick=\"clearSqlInput()\">Clear</button>\n<button class=\"debug\" type=\"button\" onclick=\"selectSqlInput()\">Select</button>\n<button class=\"debug\" type=\"button\" onclick=\"loadExampleSQL()\">Example</button>\n</div></div>\n\n<pre id=\"output\">Output will appear here.</pre>\n<button class=\"copy\" type=\"button\" onclick=\"copyOutput()\">COPY OUTPUT</button>\n\n<script>\nconst BASE=\"https://alphadog-v2-control-room.rodolfoaamattos.workers.dev\";\nconst JOB_URL=BASE+\"/tasks/run\";\nconst SQL_URL=BASE+\"/debug/sql\";\nconst HEALTH_URL=BASE+\"/health\";\nconst DIAGNOSTIC_URL=BASE+\"/diagnostic\";\nconst CONFIG_URL=\"https://raw.githubusercontent.com/Rodantmat/Alphadog/main/config.txt\";\nlet TOKEN=\"\";\nlet CONFIG_LOADED=false;\n\nfunction ptParts(){\n  const parts=new Intl.DateTimeFormat(\"en-CA\",{timeZone:\"America/Los_Angeles\",year:\"numeric\",month:\"2-digit\",day:\"2-digit\",hour:\"2-digit\",minute:\"2-digit\",second:\"2-digit\",hour12:false}).formatToParts(new Date()),m={};\n  parts.forEach(p=>m[p.type]=p.value);\n  return {date:m.year+\"-\"+m.month+\"-\"+m.day,hour:Number(m.hour),time:m.hour+\":\"+m.minute+\":\"+m.second}\n}\nfunction updateClock(){const p=ptParts();document.getElementById(\"ptNowLabel\").textContent=p.date+\" \"+p.time}\nfunction autoSlateContext(){\n  const p=ptParts();\n  let band=\"same-day dominant\";\n  if(p.hour>=12&&p.hour<20) band=\"split slate likely; workers resolve by game date/time\";\n  if(p.hour>=20||p.hour<4) band=\"next-day dominant likely; workers resolve by game date/time\";\n  return {mode:\"AUTO_BY_GAME_DATE_TIME\",pt_now:p,slate_band_hint:band,note:\"Control Room no longer manually overrides slate. Data workers must resolve pickability by actual game date/time and board availability.\"}\n}\nfunction setStatus(m){document.getElementById(\"status\").textContent=\"[\"+new Date().toLocaleTimeString()+\"] \"+m}\nfunction setOutput(l,o){\n  document.getElementById(\"output\").textContent=\"ACTION: \"+l+\"\\nTIME: \"+new Date().toISOString()+\"\\n\\n\"+(typeof o===\"string\"?o:JSON.stringify(o,null,2));\n  window.scrollTo(0,document.body.scrollHeight)\n}\nfunction loading(l,e){setStatus(\"RUNNING: \"+l);setOutput(l,\"Loading...\"+(e?\"\\n\"+e:\"\"))}\nfunction tokenFingerprint(){return TOKEN?{loaded:true,length:TOKEN.length,starts_with:TOKEN.slice(0,2),ends_with:TOKEN.slice(-2)}:{loaded:false,length:0}}\nasync function loadConfig(){\n  try{\n    loading(\"DEBUG > Reload\");\n    const r=await fetch(CONFIG_URL+\"?t=\"+Date.now(),{cache:\"no-store\"});\n    const t=await r.text();\n    const m=t.match(/^\\s*TOKEN\\s*=\\s*(.+?)\\s*$/m);\n    if(m&&m[1].trim()){\n      TOKEN=m[1].trim().replace(/^[\"']|[\"']$/g,\"\");\n      CONFIG_LOADED=true;\n      setStatus(\"CONFIG LOADED\");\n      setOutput(\"DEBUG > Reload\",{config_loaded:true,token_fingerprint:tokenFingerprint()})\n    }else{\n      TOKEN=\"\";\n      CONFIG_LOADED=false;\n      setStatus(\"CONFIG NOT LOADED\");\n      setOutput(\"DEBUG > Reload\",{config_loaded:false,error:\"TOKEN line not found. Protected buttons need config.txt with TOKEN=your_admin_token.\",config_url:CONFIG_URL})\n    }\n  }catch(e){\n    TOKEN=\"\";\n    CONFIG_LOADED=false;\n    setStatus(\"CONFIG LOAD FAILED\");\n    setOutput(\"DEBUG > Reload\",{config_loaded:false,error:String(e),config_url:CONFIG_URL})\n  }\n}\nfunction debugConfig(){setOutput(\"DEBUG > Config\",{base:BASE,config_url:CONFIG_URL,auto_slate:autoSlateContext(),token_set:Boolean(TOKEN),config_loaded:CONFIG_LOADED,token_fingerprint:tokenFingerprint(),version:\"alphadog-v2-control-room-v0.6\"})}\nasync function rawRequest(l,u,p){\n  if(p!==null && (!CONFIG_LOADED||!TOKEN)) await loadConfig();\n  const h={\"Content-Type\":\"application/json\"};\n  if(TOKEN){h[\"x-ingest-token\"]=TOKEN;h[\"x-admin-token\"]=TOKEN;}\n  const o=p===null?{method:\"GET\",headers:h}:{method:\"POST\",headers:h,body:JSON.stringify(p)};\n  try{\n    const r=await fetch(u,o),txt=await r.text();\n    let b;try{b=JSON.parse(txt)}catch(e){b=txt}\n    return {http_status:r.status,body:b}\n  }catch(e){return {ok:false,error:String(e),action:l,url:u}}\n}\nasync function requestJSON(l,u,p){loading(l);const r=await rawRequest(l,u,p);setStatus(\"DONE: \"+l+\" / HTTP \"+(r.http_status||\"ERR\"));setOutput(l,r);return r}\nfunction health(){requestJSON(\"DEBUG > Health\",HEALTH_URL,null)}\nfunction diagnostic(){requestJSON(\"DEBUG > Diag\",DIAGNOSTIC_URL,null)}\nfunction testSQL(){requestJSON(\"DEBUG > SQL\",SQL_URL,{sql:\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\",max_rows:50,max_chars:900})}\nfunction runJobButton(l,j){requestJSON(l,JOB_URL,{job:j,slate_mode:\"AUTO_BY_GAME_DATE_TIME\",auto_slate_context:autoSlateContext()})}\nfunction runManualSQL(){requestJSON(\"MANUAL SQL > Run\",SQL_URL,{sql:document.getElementById(\"sqlInput\").value,max_rows:50,max_chars:900})}\nfunction copyOutput(){navigator.clipboard.writeText(document.getElementById(\"output\").textContent);setStatus(\"COPIED OUTPUT\")}\nfunction clearSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.value=\"\";el.focus()}\nfunction selectSqlInput(){const el=document.getElementById(\"sqlInput\");if(!el)return;el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.focus();el.select()}\nfunction loadExampleSQL(){const el=document.getElementById(\"sqlInput\");el.value=\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\";el.focus();setStatus(\"EXAMPLE SQL LOADED\")}\ndocument.addEventListener(\"DOMContentLoaded\",()=>{const el=document.getElementById(\"sqlInput\");if(el){el.removeAttribute(\"readonly\");el.removeAttribute(\"disabled\");el.style.userSelect=\"text\";el.style.webkitUserSelect=\"text\";el.style.pointerEvents=\"auto\"}updateClock();setInterval(updateClock,1000);});\n</script>\n</body>\n</html>";

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
  const token = getToken(request);
  return !!token && (token === env.ALPHADOG_ADMIN_TOKEN || token === env.ALPHADOG_INTERNAL_TOKEN);
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
  if (!requireAdmin(request, env)) return jsonResponse({ok:false, error:"unauthorized_admin_token_required"}, 401);
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
    expected: {workers:116, props:19, market_sources:7, certification_rules:6}
  };
}

async function runJob(request, env) {
  if (!requireAdmin(request, env)) return jsonResponse({ok:false, error:"unauthorized_admin_token_required"}, 401);
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return jsonResponse({ok:true});
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/control_room.html")) return htmlResponse(CONTROL_ROOM_HTML);
    if (request.method === "GET" && url.pathname === "/health") return jsonResponse(baseStatus(env, {route:"/health", ...bindingSummary(env)}));
    if (request.method === "GET" && url.pathname === "/diagnostic") return jsonResponse(baseStatus(env, {route:"/diagnostic", diagnostic: await schemaStatus(env), ...bindingSummary(env)}));
    if (request.method === "POST" && (url.pathname === "/debug/sql" || url.pathname === "/admin/sql")) return executeSql(request, env);
    if (request.method === "POST" && url.pathname === "/tasks/run") return runJob(request, env);
    return jsonResponse({ok:false, error:"not_found", path:url.pathname, version:SYSTEM_VERSION}, 404);
  },
  async scheduled(event, env, ctx) {
    // Control Room cron is intentionally inert. Orchestrator owns scheduled work.
  }
};
