
const SYSTEM_VERSION = "alphadog-v2-control-room-v0.2";
const CONTROL_ROOM_HTML = "<!DOCTYPE html>\n<html>\n<head>\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>AlphaDog V2 Control Room</title>\n<!-- alphadog-v2-control-room-v0.2 - cloned from current control room visual shell -->\n<style>\nbody{background:#0b0f14;color:#00ff88;font-family:monospace;padding:10px;margin:0}\nh2{font-size:21px;color:#00ff88} h3{color:#fff;font-size:14px}\n.section{border-top:1px solid #30363d;padding-top:8px;margin-top:10px}\n.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}\nbutton{padding:10px 4px;font-size:12px;border:0;border-radius:7px;background:#1f6feb;color:#fff}\n.clean{background:#da3633}.check{background:#238636}.sql{background:#d29922}.debug{background:#8957e5}.audit{background:#0f766e}.slate{background:#7c3aed}\n.copy{background:#8957e5;width:100%;margin-top:6px}\ninput,textarea{width:100%;box-sizing:border-box;background:#111;color:#00ff88;border:1px solid #30363d;border-radius:6px;margin-top:6px;padding:8px}\ntextarea{height:90px}\npre{background:#000;color:#00ff88;padding:8px;margin-top:8px;overflow:auto;max-height:420px;min-height:150px;border:1px solid #30363d;border-radius:6px;white-space:pre-wrap;word-break:break-word}\n.status{background:#111;color:#fff;padding:8px;border-radius:6px;border:1px solid #30363d;margin:8px 0;white-space:pre-wrap}\n.small{font-size:11px;color:#aaa}\n\n.candidateBoard{background:#05070a;border:1px solid #30363d;border-radius:8px;margin-top:8px;padding:8px;color:#d7ffe6}\n.candidateToolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.candidateToolbar button{width:auto;padding:8px 10px}\n.candidateSummary{font-size:12px;color:#fff;margin-bottom:8px;white-space:pre-wrap}.candidateTableWrap{overflow:auto;border:1px solid #1f2937;border-radius:7px;max-height:520px}\ntable.candidateTable{width:100%;border-collapse:collapse;font-size:11px;color:#d7ffe6;background:#05070a}.candidateTable th,.candidateTable td{border-bottom:1px solid #1f2937;padding:6px;text-align:left;vertical-align:top;white-space:nowrap}.candidateTable th{position:sticky;top:0;background:#111827;color:#9ae6b4;z-index:1}\n.badgePlayable{color:#fff;background:#1f6feb;border-radius:999px;padding:2px 6px;font-weight:800}.badgeWatchlist{color:#111;background:#facc15;border-radius:999px;padding:2px 6px;font-weight:800}.badgeQualified{color:#fff;background:#238636;border-radius:999px;padding:2px 6px;font-weight:800}.riskCell{white-space:normal;min-width:180px;color:#ffcf99}\n\n\n.refreshGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:8px 0}.refreshItem{display:flex;gap:8px;align-items:flex-start;background:#111;border:1px solid #30363d;border-radius:7px;padding:8px;color:#d7ffe6}.refreshItem input{width:auto;margin:2px 0 0 0}.refreshItem b{display:block;color:#fff;font-size:12px}.refreshItem span{display:block;color:#aaa;font-size:10px;line-height:1.25}.refreshActions{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}\n@media (max-width:720px){.refreshGrid{grid-template-columns:1fr}.refreshActions{grid-template-columns:repeat(2,1fr)}}\n\n/* label-sql-fix */\n.grid button{min-height:0;height:auto;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.15;padding:10px 4px;}\ntextarea#sqlInput, textarea{user-select:text;-webkit-user-select:text;pointer-events:auto;}\n</style>\n<style id=\"versionTagStyle\">\n#versionTag{\n  color:#9ae6b4;\n  font-family: inherit;\n  font-size: 14px;\n  font-weight: 800;\n  letter-spacing: 0.04em;\n  margin-top: 6px;\n  margin-bottom: 12px;\n}\n</style>\n</head>\n<body>\n<h2>ALPHADOG CONTROL ROOM</h2>\n<div id=\"versionTag\">alphadog-v2-control-room-v0.2</div>\n<div class=\"small\">PT Now: <span id=\"ptNowLabel\"></span></div>\n<div class=\"small\">Slate Mode: <span id=\"slateModeLabel\"></span> | Resolved Slate: <span id=\"targetDateLabel\"></span></div>\n<div class=\"status\" id=\"status\">READY</div>\n\n<div class=\"section\"><h3>SLATE</h3><div class=\"grid\">\n<button class=\"slate\" onclick=\"setSlateMode('AUTO')\">Auto</button>\n<button class=\"slate\" onclick=\"setSlateMode('TODAY')\">Today</button>\n<button class=\"slate\" onclick=\"setSlateMode('TOMORROW')\">Tomorrow</button>\n<button class=\"slate\" onclick=\"setSlateMode('MANUAL')\">Manual</button>\n</div><input id=\"manualDate\" placeholder=\"YYYY-MM-DD manual date\" onchange=\"setManualDate(this.value)\"></div>\n\n<div class=\"section\"><h3>DEBUG</h3><div class=\"grid\">\n<button class=\"debug\" onclick=\"debugConfig()\">Config</button>\n<button class=\"debug\" onclick=\"health()\">Health</button>\n<button class=\"debug\" onclick=\"diagnostic()\">Diagnostic</button>\n<button class=\"debug\" onclick=\"testSQL()\">SQL Test</button>\n<button class=\"debug\" onclick=\"loadConfig()\">Reload</button>\n</div></div>\n\n<div class=\"section\"><h3>V2 BOOTSTRAP / SCHEMA</h3><div class=\"grid\">\n<button class=\"check\" onclick=\"runJobButton('V2 > Schema Status','v2_schema_status')\">Schema Status</button>\n<button class=\"check\" onclick=\"runJobButton('V2 > Worker Registry','v2_worker_registry')\">Worker Registry</button>\n<button class=\"check\" onclick=\"runJobButton('V2 > Config Summary','v2_config_summary')\">Config Summary</button>\n<button class=\"audit\" onclick=\"runJobButton('V2 > Phase State','v2_phase_state')\">Phase State</button>\n<button class=\"audit\" onclick=\"runJobButton('V2 > Market Sources','v2_market_sources')\">Market Sources</button>\n<button class=\"audit\" onclick=\"runJobButton('V2 > Prop Taxonomy','v2_prop_taxonomy')\">Prop Taxonomy</button>\n<button class=\"audit\" onclick=\"runJobButton('V2 > Certification Rules','v2_certification_rules')\">Cert Rules</button>\n<button class=\"debug\" onclick=\"runJobButton('V2 > Bindings Check','v2_bindings_check')\">Bindings Check</button>\n</div><div class=\"small\">V2 management only. No mining, no scoring, no old production writes.</div></div>\n\n<div class=\"section\"><h3>V2 SAFE ACTIONS</h3><div class=\"grid\">\n<button class=\"check\" onclick=\"runJobButton('CONTROL > Queue Status','v2_queue_status')\">Queue Status</button>\n<button class=\"check\" onclick=\"runJobButton('CONTROL > Lock Status','v2_lock_status')\">Lock Status</button>\n<button class=\"audit\" onclick=\"runJobButton('CONTROL > Health Snapshot','v2_health_snapshot')\">Health Snapshot</button>\n<button class=\"clean\" onclick=\"runJobButton('CONTROL > Clear Open V2 Queue','v2_clear_open_queue')\">Clear Open Queue</button>\n</div><div class=\"small\">Clear Open Queue only changes v2 CONTROL_DB queue/lock state. It does not delete real data and does not touch old production.</div></div>\n\n<div class=\"section\"><h3>MANUAL SQL</h3><div class=\"muted\">Output guard active: max 50 rows, long text cells truncated to prevent browser/app crashes. V2 auto-routes known table prefixes. Optional first line: -- db: CONFIG_DB</div><textarea id=\"sqlInput\" spellcheck=\"false\" autocomplete=\"off\" autocorrect=\"off\" autocapitalize=\"none\" inputmode=\"text\"></textarea><button class=\"sql\" onclick=\"runManualSQL()\">Run SQL</button>\n<button class=\"debug\" type=\"button\" onclick=\"clearSqlInput()\">Clear SQL</button>\n<button class=\"debug\" type=\"button\" onclick=\"selectSqlInput()\">Select SQL</button></div>\n<div id=\"minePulse\" style=\"display:none;border:1px solid #1f8b4c;border-radius:12px;padding:14px;margin:12px 0;background:#07130d;color:#21f06f;font-family:monospace;font-size:17px;line-height:1.35;white-space:pre-wrap;\">Miner Pulse idle.</div><pre id=\"output\">Output will appear here.</pre><button class=\"copy\" onclick=\"copyOutput()\">COPY OUTPUT</button>\n\n<script>\nconst BASE=\"https://alphadog-v2-control-room.rodolfoaamattos.workers.dev\", JOB_URL=BASE+\"/tasks/run\", SQL_URL=BASE+\"/debug/sql\", HEALTH_URL=BASE+\"/health\", DIAGNOSTIC_URL=BASE+\"/diagnostic\", CONFIG_URL=\"https://raw.githubusercontent.com/Rodantmat/Alphadog/main/config.txt\";\nlet TOKEN=\"\", CONFIG_LOADED=false, SLATE_MODE=localStorage.getItem(\"alphadog_slate_mode\")||\"AUTO\", MANUAL_DATE=localStorage.getItem(\"alphadog_manual_date\")||\"\";\nfunction pad2(n){return String(n).padStart(2,\"0\")}\nfunction addDaysISO(s,d){const p=s.split(\"-\").map(Number),x=new Date(Date.UTC(p[0],p[1]-1,p[2]));x.setUTCDate(x.getUTCDate()+d);return x.getUTCFullYear()+\"-\"+pad2(x.getUTCMonth()+1)+\"-\"+pad2(x.getUTCDate())}\nfunction ptParts(){const parts=new Intl.DateTimeFormat(\"en-CA\",{timeZone:\"America/Los_Angeles\",year:\"numeric\",month:\"2-digit\",day:\"2-digit\",hour:\"2-digit\",minute:\"2-digit\",second:\"2-digit\",hour12:false}).formatToParts(new Date()),m={};parts.forEach(p=>m[p.type]=p.value);return {date:m.year+\"-\"+m.month+\"-\"+m.day,hour:Number(m.hour),time:m.hour+\":\"+m.minute+\":\"+m.second}}\nfunction resolveSlateDate(){const p=ptParts();if(SLATE_MODE===\"MANUAL\"&&/^\\d{4}-\\d{2}-\\d{2}$/.test(MANUAL_DATE))return MANUAL_DATE;if(SLATE_MODE===\"TODAY\")return p.date;if(SLATE_MODE===\"TOMORROW\")return addDaysISO(p.date,1);return p.hour>=20?addDaysISO(p.date,1):p.date}\nfunction updateSlateLabels(){const p=ptParts();document.getElementById(\"ptNowLabel\").textContent=p.date+\" \"+p.time;document.getElementById(\"slateModeLabel\").textContent=SLATE_MODE;document.getElementById(\"targetDateLabel\").textContent=resolveSlateDate();document.getElementById(\"manualDate\").value=MANUAL_DATE;}\nfunction setSlateMode(m){SLATE_MODE=m;localStorage.setItem(\"alphadog_slate_mode\",m);updateSlateLabels();setOutput(\"Slate Mode\",{slate_mode:SLATE_MODE,resolved_slate:resolveSlateDate()})}\nfunction setManualDate(v){MANUAL_DATE=String(v||\"\").trim();localStorage.setItem(\"alphadog_manual_date\",MANUAL_DATE);updateSlateLabels()}\nfunction setStatus(m){document.getElementById(\"status\").textContent=\"[\"+new Date().toLocaleTimeString()+\"] \"+m}\nfunction setOutput(l,o){document.getElementById(\"output\").textContent=\"ACTION: \"+l+\"\nTIME: \"+new Date().toISOString()+\"\n\n\"+(typeof o===\"string\"?o:JSON.stringify(o,null,2));window.scrollTo(0,document.body.scrollHeight)}\nfunction loading(l,e){setStatus(\"RUNNING: \"+l);setOutput(l,\"Loading...\"+(e?\"\n\"+e:\"\"))}\nfunction tokenFingerprint(){return TOKEN?{loaded:true,length:TOKEN.length,starts_with:TOKEN.slice(0,2),ends_with:TOKEN.slice(-2)}:{loaded:false,length:0}}\nasync function loadConfig(){try{loading(\"Reload Config\");const r=await fetch(CONFIG_URL+\"?t=\"+Date.now(),{cache:\"no-store\"}),t=await r.text(),m=t.match(/^\\s*TOKEN\\s*=\\s*(.+?)\\s*$/m);if(m&&m[1].trim()){TOKEN=m[1].trim().replace(/^[\"']|[\"']$/g,\"\");CONFIG_LOADED=true;setStatus(\"CONFIG LOADED\");setOutput(\"Reload Config\",{config_loaded:true,token_fingerprint:tokenFingerprint()})}else{TOKEN=\"\";CONFIG_LOADED=false;setOutput(\"Reload Config\",{config_loaded:false,error:\"TOKEN line not found\",config_url:CONFIG_URL})}}catch(e){TOKEN=\"\";CONFIG_LOADED=false;setOutput(\"Reload Config\",{config_loaded:false,error:String(e),config_url:CONFIG_URL})}}\nfunction debugConfig(){setOutput(\"DEBUG > Config\",{base:BASE,config_url:CONFIG_URL,slate_mode:SLATE_MODE,manual_date:MANUAL_DATE,resolved_slate:resolveSlateDate(),pt_now:ptParts(),token_set:Boolean(TOKEN),config_loaded:CONFIG_LOADED,token_fingerprint:tokenFingerprint(),version:\"alphadog-v2-control-room-v0.2\"})}\nasync function rawRequest(l,u,p){if(!CONFIG_LOADED||!TOKEN)await loadConfig();const h={\"Content-Type\":\"application/json\",\"x-ingest-token\":TOKEN,\"x-admin-token\":TOKEN},o=p===null?{method:\"GET\",headers:h}:{method:\"POST\",headers:h,body:JSON.stringify(p)};try{const r=await fetch(u,o),txt=await r.text();let b;try{b=JSON.parse(txt)}catch(e){b=txt}return {http_status:r.status,body:b}}catch(e){return {ok:false,error:String(e),action:l}}}\nasync function requestJSON(l,u,p){loading(l);const r=await rawRequest(l,u,p);setStatus(\"DONE: \"+l+\" / HTTP \"+(r.http_status||\"ERR\"));setOutput(l,r);return r}\nfunction health(){requestJSON(\"DEBUG > Health\",HEALTH_URL,null)}\nfunction diagnostic(){requestJSON(\"DEBUG > Diagnostic\",DIAGNOSTIC_URL,null)}\nfunction testSQL(){requestJSON(\"DEBUG > SQL Test\",SQL_URL,{sql:\"SELECT COUNT(*) AS control_worker_registry_rows FROM control_worker_registry;\"})}\nfunction runJobButton(l,j){const d=resolveSlateDate();requestJSON(l,JOB_URL,{job:j,slate_date:d,slate_mode:SLATE_MODE,manual_slate_date:MANUAL_DATE})}\nfunction runManualSQL(){requestJSON(\"MANUAL SQL > Output\",SQL_URL,{sql:document.getElementById(\"sqlInput\").value,max_rows:50,max_chars:900})}\nfunction copyOutput(){navigator.clipboard.writeText(document.getElementById(\"output\").textContent);setStatus(\"COPIED OUTPUT\")}\nfunction clearSqlInput(){const el=document.getElementById('sqlInput')||document.querySelector('textarea');if(!el)return;el.removeAttribute('readonly');el.removeAttribute('disabled');el.value='';el.focus();}\nfunction selectSqlInput(){const el=document.getElementById('sqlInput')||document.querySelector('textarea');if(!el)return;el.removeAttribute('readonly');el.removeAttribute('disabled');el.focus();el.select();}\ndocument.addEventListener('DOMContentLoaded',()=>{const el=document.getElementById('sqlInput')||document.querySelector('textarea');if(el){el.removeAttribute('readonly');el.removeAttribute('disabled');el.style.userSelect='text';el.style.webkitUserSelect='text';el.style.pointerEvents='auto';}updateSlateLabels();setInterval(updateSlateLabels,1000);loadConfig();});\n</script>\n</body>\n</html>\n";

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
