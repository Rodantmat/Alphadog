const WORKER_NAME = "alphadog-v2-delta-hitter-logs";
const LOGICAL_WORKER_NAME = "alphadog-v2-catcher-reference-historical-backfill";
const VERSION = "alphadog-v2-catcher-reference-historical-backfill-v0.1.0";
const JOB_KEY = "catcher-reference-historical-backfill";

// Real, isolated, standalone historical backfill tool - repurposes a confirmed-dead dummy worker
// slot, same established pattern as this session's other one-time backfill tools. Deliberately
// built as a fully separate path rather than invoking the live production
// alphadog-v2-daily-lineups.js worker's runSourceProbe route (which does substantial unrelated
// live work per invocation) - this tool only ever touches REF_DB.ref_catcher_framing_poptime,
// using the exact same real, proven Baseball Savant CSV field mapping already live in production,
// copied read-only (pure data transformation, safe to duplicate).

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const SOURCE_KEY = "baseball_savant_csv_export_historical_backfill";

function nowUtc() { return new Date().toISOString(); }
function intOrNull(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function varPresence(env, names) { const out = {}; for (const n of names) out[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function parseCsvLine(line) {
  const values = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === "," && !inQuotes) { values.push(cur); cur = ""; continue; }
    cur += c;
  }
  values.push(cur);
  return values;
}
function parseCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter(l => l.length);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx]; });
    return row;
  });
}

async function fetchText(url) {
  try {
    const resp = await fetch(url, { headers: { accept: "text/csv,*/*;q=0.8", "user-agent": "AlphaDogV2CatcherReferenceHistoricalBackfill/0.1" } });
    const text = await resp.text();
    return { ok: resp.ok, http_status: resp.status, text };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function runBackfill(env, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const seasonYear = Number(inputJson.year);
  if (!seasonYear || seasonYear < 2015 || seasonYear > 2030) return { ok: false, data_ok: false, error: "input_json.year is required, e.g. 2025 (real Statcast catcher-tracking data starts 2015)" };

  const framingUrl = `https://baseballsavant.mlb.com/leaderboard/catcher-framing?gameType=Regular&minPitches=q&minResults=1&seasonEnd=${seasonYear}&seasonStart=${seasonYear}&type=catcher&csv=true`;
  const poptimeUrl = `https://baseballsavant.mlb.com/leaderboard/poptime?year=${seasonYear}&min2b=5&min3b=0&csv=true`;
  const [framingRes, poptimeRes] = await Promise.all([fetchText(framingUrl), fetchText(poptimeUrl)]);
  if (!framingRes.ok && !poptimeRes.ok) {
    return { ok: false, data_ok: false, error: "both_sources_failed", framing_status: framingRes.http_status, poptime_status: poptimeRes.http_status, framing_error: framingRes.error, poptime_error: poptimeRes.error };
  }

  const framingRows = framingRes.ok ? parseCsv(framingRes.text) : [];
  const poptimeRows = poptimeRes.ok ? parseCsv(poptimeRes.text) : [];
  const merged = new Map();
  for (const r of framingRows) {
    const pid = intOrNull(r.id);
    if (!pid) continue;
    merged.set(pid, { player_id: pid, player_name: r.name || null, framing_runs_total: Number(r.rv_tot) || null, framing_pct_total: r.pct_tot !== undefined ? Number(r.pct_tot) : null, framing_pitches: intOrNull(r.pitches) });
  }
  for (const r of poptimeRows) {
    const pid = intOrNull(r.entity_id);
    if (!pid) continue;
    const existing = merged.get(pid) || { player_id: pid, player_name: r.entity_name || null };
    existing.pop_time_2b_sba = r.pop_2b_sba !== undefined && r.pop_2b_sba !== "" ? Number(r.pop_2b_sba) : null;
    existing.pop_time_2b_sba_count = intOrNull(r.pop_2b_sba_count);
    existing.pop_time_3b_sba = r.pop_3b_sba !== undefined && r.pop_3b_sba !== "" ? Number(r.pop_3b_sba) : null;
    merged.set(pid, existing);
  }

  let written = 0;
  for (const row of merged.values()) {
    await run(env.REF_DB, `INSERT OR REPLACE INTO ref_catcher_framing_poptime (player_id, player_name, season, framing_runs_total, framing_pct_total, framing_pitches, pop_time_2b_sba, pop_time_2b_sba_count, pop_time_3b_sba, source_key, refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      row.player_id, row.player_name, seasonYear, row.framing_runs_total ?? null, row.framing_pct_total ?? null, row.framing_pitches ?? null, row.pop_time_2b_sba ?? null, row.pop_time_2b_sba_count ?? null, row.pop_time_3b_sba ?? null, SOURCE_KEY);
    written++;
  }

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null,
    status: "completed", certification: "CATCHER_REFERENCE_HISTORICAL_BACKFILL_CERTIFIED",
    season_year: seasonYear, catchers_written: written, framing_rows: framingRows.length, poptime_rows: poptimeRows.length,
    framing_ok: framingRes.ok, poptime_ok: poptimeRes.ok, external_calls_performed: 2,
    isolated_from_production_daily_lineups_worker: true,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "CATCHER_REFERENCE_HISTORICAL_BACKFILL_READY", timestamp_utc: nowUtc(),
    notes: [
      "Isolated, standalone historical catcher framing/pop-time backfill - real Baseball Savant CSV export, same field mapping as the live production worker, zero interaction with it.",
      "POST /run with input_json: { year: 2025 }"
    ],
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars) }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/") return jsonResponse(baseIdentity(env));
    if (method === "GET" && path === "/health") return jsonResponse({ ...baseIdentity(env), route: "/health" });
    if (method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try {
        const output = await runBackfill(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
