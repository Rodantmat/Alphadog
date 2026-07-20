const WORKER_NAME = "alphadog-v2-delta-bullpen-update";
const LOGICAL_WORKER_NAME = "alphadog-v2-static-defensive-quality";
const VERSION = "alphadog-v2-static-defensive-quality-v0.2.0-real-writer";
const JOB_KEY = "static-defensive-quality";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const SOURCE_BASE_URL = "https://baseballsavant.mlb.com/leaderboard/outs_above_average";
const SOURCE_KEY = "baseball_savant_outs_above_average_v0_2_0";
const SEASON_YEAR = 2026;

function nowUtc() { return new Date().toISOString(); }
function numOrNull(v) { const n = Number(String(v || "").replace("%", "")); return Number.isFinite(n) ? n : null; }
function intOrNull(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function varPresence(env, names) { const out = {}; for (const n of names) out[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res && res.results ? res.results : [];
}
async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

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
      "user-agent": "AlphaDogV2StaticDefensiveQuality/0.2 (+controlled-reference-refresh)"
    }
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`baseball_savant_fetch_failed_${resp.status}`);
  const looksLikeCsv = text.split(/\r?\n/, 1)[0].includes(",") && !text.trim().startsWith("<");
  if (!looksLikeCsv) throw new Error("baseball_savant_response_not_csv_shaped");
  const rows = parseCsv(text);
  return { url, http_status: resp.status, rows, row_count: rows.length };
}

function mapRow(r, year) {
  const playerId = intOrNull(r.player_id);
  if (!playerId) return null;
  return {
    quality_id: `${playerId}_${year}`,
    mlb_player_id: playerId,
    player_name: String(r["last_name, first_name"] || "").trim() || null,
    team_name: String(r.display_team_name || "").trim() || null,
    season_year: year,
    primary_position: String(r.primary_pos_formatted || "").trim() || null,
    fielding_runs_prevented: intOrNull(r.fielding_runs_prevented),
    outs_above_average: intOrNull(r.outs_above_average),
    oaa_infront: intOrNull(r.outs_above_average_infront),
    oaa_lateral_toward_3b: intOrNull(r.outs_above_average_lateral_toward3bline),
    oaa_lateral_toward_1b: intOrNull(r.outs_above_average_lateral_toward1bline),
    oaa_behind: intOrNull(r.outs_above_average_behind),
    oaa_vs_rhh: intOrNull(r.outs_above_average_rhh),
    oaa_vs_lhh: intOrNull(r.outs_above_average_lhh),
    actual_success_rate_pct: numOrNull(r.actual_success_rate_formatted),
    adj_estimated_success_rate_pct: numOrNull(r.adj_estimated_success_rate_formatted),
    diff_success_rate_pct: numOrNull(r.diff_success_rate_formatted),
    raw_json: JSON.stringify(r).slice(0, 1500)
  };
}

async function ensureSchema(env) {
  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_defensive_quality (
    quality_id TEXT PRIMARY KEY, mlb_player_id INTEGER, player_name TEXT, team_name TEXT, season_year INTEGER,
    primary_position TEXT, fielding_runs_prevented INTEGER, outs_above_average INTEGER, oaa_infront INTEGER,
    oaa_lateral_toward_3b INTEGER, oaa_lateral_toward_1b INTEGER, oaa_behind INTEGER, oaa_vs_rhh INTEGER, oaa_vs_lhh INTEGER,
    actual_success_rate_pct REAL, adj_estimated_success_rate_pct REAL, diff_success_rate_pct REAL,
    active INTEGER DEFAULT 1, source_key TEXT, raw_json TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_defensive_quality_player ON ref_defensive_quality(mlb_player_id, season_year)");
}

function rowHasRealChange(current, fresh) {
  if (!current) return true;
  const fields = ["fielding_runs_prevented", "outs_above_average", "oaa_infront", "oaa_lateral_toward_3b", "oaa_lateral_toward_1b", "oaa_behind", "oaa_vs_rhh", "oaa_vs_lhh", "actual_success_rate_pct", "adj_estimated_success_rate_pct", "diff_success_rate_pct"];
  for (const f of fields) {
    const a = current[f] === null || current[f] === undefined ? null : Number(current[f]);
    const b = fresh[f] === null || fresh[f] === undefined ? null : Number(fresh[f]);
    if (a !== b) return true;
  }
  if (Number(current.active || 0) !== 1) return true;
  return false;
}

async function runD1Batch(db, statements, size = 50) {
  let executed = 0;
  for (let i = 0; i < statements.length; i += size) {
    const chunk = statements.slice(i, i + size);
    if (chunk.length) {
      await db.batch(chunk);
      executed += chunk.length;
    }
  }
  return executed;
}

async function runDefensiveQuality(env, input) {
  await ensureSchema(env);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const year = Number(inputJson.year) || SEASON_YEAR;

  // Freshness gate (same grounded watermark pattern as static-pitcher-arsenal): skip the
  // expensive Savant fetch + full compare if a certified run for this season completed within
  // the window. Baseball Savant has no incremental "what changed" query, so a bounded re-fetch
  // window is the correct pattern, not a full classic differential.
  const freshnessRow = await all(env.REF_DB, "SELECT MAX(updated_at) AS last_run FROM ref_defensive_quality WHERE season_year=? AND source_key=?", year, SOURCE_KEY);
  const lastRun = freshnessRow[0] && freshnessRow[0].last_run;
  if (lastRun) {
    const ageHours = (Date.now() - new Date(String(lastRun).replace(" ", "T") + "Z").getTime()) / 3600000;
    if (ageHours >= 0 && ageHours < 20) {
      const activeCountNoop = await all(env.REF_DB, "SELECT COUNT(*) c FROM ref_defensive_quality WHERE season_year=? AND active=1", year);
      return {
        ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
        request_id: input.request_id || null, chain_id: input.chain_id || null,
        status: "completed_noop_fresh", certification: "STATIC_DEFENSIVE_QUALITY_CERTIFIED_NOOP_ALREADY_FRESH",
        season_year: year, rows_read: 0, rows_mapped: 0, rows_written: 0, rows_unchanged_skipped: 0, rows_deactivated: 0,
        active_rows_after: Number(activeCountNoop[0] && activeCountNoop[0].c || 0),
        freshness_gate: { last_run: lastRun, age_hours: Math.round(ageHours * 100) / 100, window_hours: 20, skipped_expensive_fetch: true },
        differential_note: "No real fetch performed - a certified run for this season completed within the freshness window, so nothing needed mining.",
        external_calls_performed: 0, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
      };
    }
  }

  const fetched = await fetchSavant(year);
  const mapped = fetched.rows.map(r => mapRow(r, year)).filter(Boolean);

  const currentRows = await all(env.REF_DB, "SELECT * FROM ref_defensive_quality WHERE season_year=?", year);
  const currentMap = new Map(currentRows.map(r => [r.quality_id, r]));
  const freshIds = new Set(mapped.map(r => r.quality_id));

  const changedStatements = [];
  const unchangedStatements = [];
  let changed = 0, unchanged = 0;
  for (const r of mapped) {
    const current = currentMap.get(r.quality_id);
    if (!rowHasRealChange(current, r)) {
      unchanged += 1;
      unchangedStatements.push(env.REF_DB.prepare("UPDATE ref_defensive_quality SET active=1, updated_at=CURRENT_TIMESTAMP WHERE quality_id=?").bind(r.quality_id));
      continue;
    }
    changedStatements.push(env.REF_DB.prepare(`INSERT OR REPLACE INTO ref_defensive_quality (
      quality_id, mlb_player_id, player_name, team_name, season_year, primary_position, fielding_runs_prevented,
      outs_above_average, oaa_infront, oaa_lateral_toward_3b, oaa_lateral_toward_1b, oaa_behind, oaa_vs_rhh, oaa_vs_lhh,
      actual_success_rate_pct, adj_estimated_success_rate_pct, diff_success_rate_pct, active, source_key, raw_json, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,CURRENT_TIMESTAMP)`).bind(
      r.quality_id, r.mlb_player_id, r.player_name, r.team_name, r.season_year, r.primary_position, r.fielding_runs_prevented,
      r.outs_above_average, r.oaa_infront, r.oaa_lateral_toward_3b, r.oaa_lateral_toward_1b, r.oaa_behind, r.oaa_vs_rhh, r.oaa_vs_lhh,
      r.actual_success_rate_pct, r.adj_estimated_success_rate_pct, r.diff_success_rate_pct, SOURCE_KEY, r.raw_json));
    changed += 1;
  }
  await runD1Batch(env.REF_DB, changedStatements);
  await runD1Batch(env.REF_DB, unchangedStatements);

  const deactivateStatements = [];
  for (const current of currentRows) {
    if (!freshIds.has(current.quality_id) && Number(current.active) === 1) {
      deactivateStatements.push(env.REF_DB.prepare("UPDATE ref_defensive_quality SET active=0, updated_at=CURRENT_TIMESTAMP WHERE quality_id=?").bind(current.quality_id));
    }
  }
  const deactivated = await runD1Batch(env.REF_DB, deactivateStatements);

  const activeCount = await all(env.REF_DB, "SELECT COUNT(*) c FROM ref_defensive_quality WHERE season_year=? AND active=1", year);
  const certified = mapped.length > 0 && changed + unchanged === mapped.length;

  return {
    ok: certified, data_ok: certified, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null,
    status: certified ? "completed" : "failed_no_real_rows_parsed",
    certification: certified ? "STATIC_DEFENSIVE_QUALITY_CERTIFIED" : "STATIC_DEFENSIVE_QUALITY_CERTIFICATION_FAILED",
    season_year: year, source_url: fetched.url, rows_read: fetched.row_count, rows_mapped: mapped.length,
    rows_written: changed, rows_unchanged_skipped: unchanged, rows_deactivated: deactivated,
    active_rows_after: Number(activeCount[0] && activeCount[0].c || 0),
    external_calls_performed: 1,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "STATIC_DEFENSIVE_QUALITY_READY", timestamp_utc: nowUtc(),
    notes: [
      "Real, differential-aware defensive quality (Outs Above Average) reference refresh (season-level, Baseball Savant CSV export).",
      "POST /run with input_json: { year: 2026 (optional, defaults to current season) }"
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
        const output = await runDefensiveQuality(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
