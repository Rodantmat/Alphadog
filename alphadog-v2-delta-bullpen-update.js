const WORKER_NAME = "alphadog-v2-delta-bullpen-update";
const LOGICAL_WORKER_NAME = "alphadog-v2-static-defensive-quality";
const VERSION = "alphadog-v2-static-defensive-quality-v0.1.0-diagnostic";
const JOB_KEY = "static-defensive-quality";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const SOURCE_BASE_URL = "https://baseballsavant.mlb.com/leaderboard/outs_above_average";
const SEASON_YEAR = 2026;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function varPresence(env, names) { const out = {}; for (const n of names) out[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

function savantUrl(year) {
  const u = new URL(SOURCE_BASE_URL);
  u.searchParams.set("year", String(year));
  u.searchParams.set("type", "Fielder");
  u.searchParams.set("min", "q");
  u.searchParams.set("pos", "");
  u.searchParams.set("team", "");
  u.searchParams.set("csv", "true");
  return u.toString();
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
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  // Real lesson applied from the pitcher-arsenal build: use the same quote-aware parser for the
  // header row as for data rows - a naive header .split(",") breaks on any quoted field with an
  // embedded comma (confirmed to be a real, recurring Baseball Savant CSV shape, not a one-off).
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] !== undefined ? values[i] : null; });
    return row;
  });
}

async function fetchSavant(year) {
  const url = savantUrl(year);
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/csv,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "user-agent": "AlphaDogV2StaticDefensiveQuality/0.1 (+controlled-reference-refresh)"
    }
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`baseball_savant_fetch_failed_${resp.status}`);
  const looksLikeCsv = text.split(/\r?\n/, 1)[0].includes(",") && !text.trim().startsWith("<");
  if (!looksLikeCsv) throw new Error("baseball_savant_response_not_csv_shaped");
  const rows = parseCsv(text);
  return { url, http_status: resp.status, rows, row_count: rows.length, raw_text_sample: text.slice(0, 400) };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "DIAGNOSTIC_ONLY_NOT_YET_WRITING", timestamp_utc: nowUtc(),
    notes: [
      "Diagnostic-first build: fetches and reports the real Baseball Savant outs_above_average CSV payload shape - does not write to any table yet.",
      "POST /run with input_json: { year } to fetch real data and see the real field names/sample rows before schema/mapping is finalized."
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
      const year = Number(input && input.input_json && input.input_json.year) || SEASON_YEAR;
      try {
        const fetched = await fetchSavant(year);
        return jsonResponse({
          ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, job_key: JOB_KEY,
          status: "DIAGNOSTIC_FETCH_COMPLETED", certification: "DIAGNOSTIC_ONLY_NOT_WRITTEN",
          source_url: fetched.url, http_status: fetched.http_status, row_count: fetched.row_count,
          raw_text_sample: fetched.raw_text_sample,
          sample_rows: fetched.rows.slice(0, 3),
          real_field_names_from_first_row: fetched.rows.length ? Object.keys(fetched.rows[0]) : [],
          rows_written: 0, external_calls_performed: 1,
          timestamp_utc: nowUtc()
        });
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.message ? err.message : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
