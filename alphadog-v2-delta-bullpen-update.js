import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-delta-bullpen-update";
const LOGICAL_WORKER_NAME = "alphadog-v2-static-defensive-quality";
const VERSION = "alphadog-v2-static-defensive-quality-v0.3.0-postgres-cutover";
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

function pg(env) {
  return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false });
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
      "user-agent": "AlphaDogV2StaticDefensiveQuality/0.3 (+controlled-reference-refresh)"
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
  const sql = pg(env);
  try {
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS ref.defensive_quality (
      quality_id TEXT PRIMARY KEY, mlb_player_id INT, player_name TEXT, team_name TEXT, season_year INT,
      primary_position TEXT, fielding_runs_prevented INT, outs_above_average INT, oaa_infront INT,
      oaa_lateral_toward_3b INT, oaa_lateral_toward_1b INT, oaa_behind INT, oaa_vs_rhh INT, oaa_vs_lhh INT,
      actual_success_rate_pct DOUBLE PRECISION, adj_estimated_success_rate_pct DOUBLE PRECISION, diff_success_rate_pct DOUBLE PRECISION,
      active INT DEFAULT 1, source_key TEXT, raw_json JSONB, updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_ref_defensive_quality_player ON ref.defensive_quality(mlb_player_id, season_year)`);
  } finally { await sql.end(); }
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

async function runDefensiveQuality(env, input) {
  await ensureSchema(env);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const year = Number(inputJson.year) || SEASON_YEAR;

  let sqlCheck = pg(env);
  const freshnessRows = await sqlCheck`SELECT MAX(updated_at) AS last_run FROM ref.defensive_quality WHERE season_year=${year} AND source_key=${SOURCE_KEY}`;
  const lastRun = freshnessRows[0] && freshnessRows[0].last_run;
  if (lastRun) {
    const ageHours = (Date.now() - new Date(lastRun).getTime()) / 3600000;
    if (ageHours >= 0 && ageHours < 20) {
      const activeCountNoop = await sqlCheck`SELECT COUNT(*)::int c FROM ref.defensive_quality WHERE season_year=${year} AND active=1`;
      await sqlCheck.end();
      return {
        ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
        request_id: input.request_id || null, chain_id: input.chain_id || null,
        status: "completed_noop_fresh", certification: "STATIC_DEFENSIVE_QUALITY_CERTIFIED_NOOP_ALREADY_FRESH",
        season_year: year, rows_read: 0, rows_mapped: 0, rows_written: 0, rows_unchanged_skipped: 0, rows_deactivated: 0,
        active_rows_after: Number(activeCountNoop[0] && activeCountNoop[0].c || 0),
        freshness_gate: { last_run: lastRun, age_hours: Math.round(ageHours * 100) / 100, window_hours: 20, skipped_expensive_fetch: true },
        differential_note: "No real fetch performed - a certified run for this season completed within the freshness window, so nothing needed mining.",
        database_target: "postgres_ref_defensive_quality",
        external_calls_performed: 0, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
      };
    }
  }
  await sqlCheck.end();

  // External fetch with no Postgres connection held open (same fix as static-pitcher-arsenal).
  const fetched = await fetchSavant(year);
  const mapped = fetched.rows.map(r => mapRow(r, year)).filter(Boolean);

  const sql = pg(env);
  const currentRows = await sql`SELECT * FROM ref.defensive_quality WHERE season_year=${year}`;
  const currentMap = new Map(currentRows.map(r => [r.quality_id, r]));
  const freshIds = new Set(mapped.map(r => r.quality_id));

  const toInsert = [];
  const unchangedIds = [];
  for (const r of mapped) {
    const current = currentMap.get(r.quality_id);
    if (!rowHasRealChange(current, r)) {
      unchangedIds.push(r.quality_id);
      continue;
    }
    toInsert.push(r);
  }
  const changed = toInsert.length;
  const unchanged = unchangedIds.length;

  const CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK).map(r => ({
      quality_id: r.quality_id, mlb_player_id: r.mlb_player_id, player_name: r.player_name, team_name: r.team_name, season_year: r.season_year,
      primary_position: r.primary_position, fielding_runs_prevented: r.fielding_runs_prevented, outs_above_average: r.outs_above_average,
      oaa_infront: r.oaa_infront, oaa_lateral_toward_3b: r.oaa_lateral_toward_3b, oaa_lateral_toward_1b: r.oaa_lateral_toward_1b, oaa_behind: r.oaa_behind,
      oaa_vs_rhh: r.oaa_vs_rhh, oaa_vs_lhh: r.oaa_vs_lhh, actual_success_rate_pct: r.actual_success_rate_pct, adj_estimated_success_rate_pct: r.adj_estimated_success_rate_pct,
      diff_success_rate_pct: r.diff_success_rate_pct, active: 1, source_key: SOURCE_KEY, raw_json: r.raw_json
    }));
    await sql`
      INSERT INTO ref.defensive_quality ${sql(chunk, "quality_id", "mlb_player_id", "player_name", "team_name", "season_year", "primary_position",
        "fielding_runs_prevented", "outs_above_average", "oaa_infront", "oaa_lateral_toward_3b", "oaa_lateral_toward_1b", "oaa_behind", "oaa_vs_rhh", "oaa_vs_lhh",
        "actual_success_rate_pct", "adj_estimated_success_rate_pct", "diff_success_rate_pct", "active", "source_key", "raw_json")}
      ON CONFLICT (quality_id) DO UPDATE SET mlb_player_id=excluded.mlb_player_id, player_name=excluded.player_name, team_name=excluded.team_name,
        season_year=excluded.season_year, primary_position=excluded.primary_position, fielding_runs_prevented=excluded.fielding_runs_prevented,
        outs_above_average=excluded.outs_above_average, oaa_infront=excluded.oaa_infront, oaa_lateral_toward_3b=excluded.oaa_lateral_toward_3b,
        oaa_lateral_toward_1b=excluded.oaa_lateral_toward_1b, oaa_behind=excluded.oaa_behind, oaa_vs_rhh=excluded.oaa_vs_rhh, oaa_vs_lhh=excluded.oaa_vs_lhh,
        actual_success_rate_pct=excluded.actual_success_rate_pct, adj_estimated_success_rate_pct=excluded.adj_estimated_success_rate_pct,
        diff_success_rate_pct=excluded.diff_success_rate_pct, active=1, source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
    `;
  }
  for (let i = 0; i < unchangedIds.length; i += CHUNK) {
    const chunk = unchangedIds.slice(i, i + CHUNK);
    await sql`UPDATE ref.defensive_quality SET active=1, updated_at=now() WHERE quality_id IN ${sql(chunk)}`;
  }

  const staleIds = currentRows.filter(current => !freshIds.has(current.quality_id) && Number(current.active) === 1).map(c => c.quality_id);
  let deactivated = 0;
  for (let i = 0; i < staleIds.length; i += CHUNK) {
    const chunk = staleIds.slice(i, i + CHUNK);
    await sql`UPDATE ref.defensive_quality SET active=0, updated_at=now() WHERE quality_id IN ${sql(chunk)}`;
    deactivated += chunk.length;
  }

  const activeCount = await sql`SELECT COUNT(*)::int c FROM ref.defensive_quality WHERE season_year=${year} AND active=1`;
  await sql.end();
  const certified = mapped.length > 0 && changed + unchanged === mapped.length;

  return {
    ok: certified, data_ok: certified, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null,
    status: certified ? "completed" : "failed_no_real_rows_parsed",
    certification: certified ? "STATIC_DEFENSIVE_QUALITY_CERTIFIED" : "STATIC_DEFENSIVE_QUALITY_CERTIFICATION_FAILED",
    season_year: year, source_url: fetched.url, rows_read: fetched.row_count, rows_mapped: mapped.length,
    rows_written: changed, rows_unchanged_skipped: unchanged, rows_deactivated: deactivated,
    active_rows_after: Number(activeCount[0] && activeCount[0].c || 0),
    database_target: "postgres_ref_defensive_quality",
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
      "Real, differential-aware defensive quality (Outs Above Average) reference refresh (season-level, Baseball Savant CSV export). Now Postgres-backed.",
      "POST /run with input_json: { year: 2026 (optional, defaults to current season) }"
    ],
    binding_summary: { required_db_bindings_present: allTrue(db), expected_vars_present: allTrue(vars), hyperdrive_bound: !!env.HYPERDRIVE }
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
