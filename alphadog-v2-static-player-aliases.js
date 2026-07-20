import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-static-player-aliases";
const LOGICAL_WORKER_NAME = "alphadog-v2-static-pitcher-arsenal";
const VERSION = "alphadog-v2-static-pitcher-arsenal-v0.3.0-postgres-cutover";
const JOB_KEY = "static-pitcher-arsenal";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const SOURCE_BASE_URL = "https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats";
const SOURCE_KEY = "baseball_savant_pitch_arsenal_stats_v0_2_0";
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
  u.searchParams.set("type", "pitcher");
  u.searchParams.set("year", String(year));
  u.searchParams.set("team", "");
  u.searchParams.set("min", "1");
  u.searchParams.set("minPitches", "q");
  u.searchParams.set("sort", "4");
  u.searchParams.set("sortDir", "desc");
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
      "user-agent": "AlphaDogV2StaticPitcherArsenal/0.3 (+controlled-reference-refresh)"
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
  const nameField = r["last_name, first_name"] || "";
  const playerId = intOrNull(r.player_id);
  const pitchType = String(r.pitch_type || "").trim();
  if (!playerId || !pitchType) return null;
  return {
    arsenal_id: `${playerId}_${year}_${pitchType}`,
    mlb_player_id: playerId,
    player_name: String(nameField || "").trim() || null,
    team_abbreviation: String(r.team_name_alt || "").trim() || null,
    season_year: year,
    pitch_type: pitchType,
    pitch_name: String(r.pitch_name || "").trim() || null,
    run_value_per_100: numOrNull(r.run_value_per_100),
    run_value: intOrNull(r.run_value),
    pitches: intOrNull(r.pitches),
    pitch_usage: numOrNull(r.pitch_usage),
    pa: intOrNull(r.pa),
    ba: numOrNull(r.ba),
    slg: numOrNull(r.slg),
    woba: numOrNull(r.woba),
    whiff_percent: numOrNull(r.whiff_percent),
    k_percent: numOrNull(r.k_percent),
    put_away: numOrNull(r.put_away),
    est_ba: numOrNull(r.est_ba),
    est_slg: numOrNull(r.est_slg),
    est_woba: numOrNull(r.est_woba),
    hard_hit_percent: numOrNull(r.hard_hit_percent),
    raw_json: JSON.stringify(r).slice(0, 1500)
  };
}

async function ensureSchema(env) {
  const sql = pg(env);
  try {
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS ref.pitcher_arsenal (
      arsenal_id TEXT PRIMARY KEY, mlb_player_id INT, player_name TEXT, team_abbreviation TEXT, season_year INT,
      pitch_type TEXT, pitch_name TEXT, run_value_per_100 DOUBLE PRECISION, run_value INT, pitches INT, pitch_usage DOUBLE PRECISION,
      pa INT, ba DOUBLE PRECISION, slg DOUBLE PRECISION, woba DOUBLE PRECISION, whiff_percent DOUBLE PRECISION, k_percent DOUBLE PRECISION, put_away DOUBLE PRECISION,
      est_ba DOUBLE PRECISION, est_slg DOUBLE PRECISION, est_woba DOUBLE PRECISION, hard_hit_percent DOUBLE PRECISION, active INT DEFAULT 1,
      source_key TEXT, raw_json JSONB, updated_at TIMESTAMPTZ DEFAULT now()
    )`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_ref_pitcher_arsenal_player ON ref.pitcher_arsenal(mlb_player_id, season_year)`);
  } finally { await sql.end(); }
}

function rowHasRealChange(current, fresh) {
  if (!current) return true;
  const fields = ["run_value_per_100", "run_value", "pitches", "pitch_usage", "pa", "ba", "slg", "woba", "whiff_percent", "k_percent", "put_away", "est_ba", "est_slg", "est_woba", "hard_hit_percent"];
  for (const f of fields) {
    const a = current[f] === null || current[f] === undefined ? null : Number(current[f]);
    const b = fresh[f] === null || fresh[f] === undefined ? null : Number(fresh[f]);
    if (a !== b) return true;
  }
  if (Number(current.active || 0) !== 1) return true;
  return false;
}

async function runArsenal(env, input) {
  let step = "ensureSchema";
  try {
    await ensureSchema(env);
    const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
    const year = Number(inputJson.year) || SEASON_YEAR;

    step = "freshness_check_open";
    let sqlCheck = pg(env);
    step = "freshness_check_query";
    const freshnessRows = await sqlCheck`SELECT MAX(updated_at) AS last_run FROM ref.pitcher_arsenal WHERE season_year=${year} AND source_key=${SOURCE_KEY}`;
    const lastRun = freshnessRows[0] && freshnessRows[0].last_run;
    if (lastRun) {
      const ageHours = (Date.now() - new Date(lastRun).getTime()) / 3600000;
      if (ageHours >= 0 && ageHours < 20) {
        step = "freshness_noop_count";
        const activeCountNoop = await sqlCheck`SELECT COUNT(*)::int c FROM ref.pitcher_arsenal WHERE season_year=${year} AND active=1`;
        await sqlCheck.end();
        return {
          ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
          request_id: input.request_id || null, chain_id: input.chain_id || null,
          status: "completed_noop_fresh", certification: "STATIC_PITCHER_ARSENAL_CERTIFIED_NOOP_ALREADY_FRESH",
          season_year: year, rows_read: 0, rows_mapped: 0, rows_written: 0, rows_unchanged_skipped: 0, rows_deactivated: 0,
          active_rows_after: Number(activeCountNoop[0] && activeCountNoop[0].c || 0),
          freshness_gate: { last_run: lastRun, age_hours: Math.round(ageHours * 100) / 100, window_hours: 20, skipped_expensive_fetch: true },
          differential_note: "No real fetch performed - a certified run for this season completed within the freshness window, so nothing needed mining.",
          database_target: "postgres_ref_pitcher_arsenal",
          external_calls_performed: 0, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
        };
      }
    }
    step = "freshness_check_close";
    await sqlCheck.end();

    step = "external_fetch";
    const fetched = await fetchSavant(year);
    const mapped = fetched.rows.map(r => mapRow(r, year)).filter(Boolean);

    step = "write_connection_open";
    const sql = pg(env);
    step = "write_current_rows_select";
    const currentRows = await sql`SELECT * FROM ref.pitcher_arsenal WHERE season_year=${year}`;
    const currentMap = new Map(currentRows.map(r => [r.arsenal_id, r]));
    const freshIds = new Set(mapped.map(r => r.arsenal_id));

    const toInsert = [];
    const unchangedIds = [];
    for (const r of mapped) {
      const current = currentMap.get(r.arsenal_id);
      if (!rowHasRealChange(current, r)) {
        unchangedIds.push(r.arsenal_id);
        continue;
      }
      toInsert.push(r);
    }
    const changed = toInsert.length;
    const unchanged = unchangedIds.length;

    const CHUNK = 25;
    step = "write_bulk_insert";
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK).map(r => ({
        arsenal_id: r.arsenal_id, mlb_player_id: r.mlb_player_id, player_name: r.player_name, team_abbreviation: r.team_abbreviation,
        season_year: r.season_year, pitch_type: r.pitch_type, pitch_name: r.pitch_name, run_value_per_100: r.run_value_per_100,
        run_value: r.run_value, pitches: r.pitches, pitch_usage: r.pitch_usage, pa: r.pa, ba: r.ba, slg: r.slg, woba: r.woba,
        whiff_percent: r.whiff_percent, k_percent: r.k_percent, put_away: r.put_away, est_ba: r.est_ba, est_slg: r.est_slg,
        est_woba: r.est_woba, hard_hit_percent: r.hard_hit_percent, active: 1, source_key: SOURCE_KEY, raw_json: r.raw_json
      }));
      await sql`
        INSERT INTO ref.pitcher_arsenal ${sql(chunk, "arsenal_id", "mlb_player_id", "player_name", "team_abbreviation", "season_year", "pitch_type", "pitch_name",
          "run_value_per_100", "run_value", "pitches", "pitch_usage", "pa", "ba", "slg", "woba", "whiff_percent", "k_percent", "put_away",
          "est_ba", "est_slg", "est_woba", "hard_hit_percent", "active", "source_key", "raw_json")}
        ON CONFLICT (arsenal_id) DO UPDATE SET mlb_player_id=excluded.mlb_player_id, player_name=excluded.player_name, team_abbreviation=excluded.team_abbreviation,
          season_year=excluded.season_year, pitch_type=excluded.pitch_type, pitch_name=excluded.pitch_name, run_value_per_100=excluded.run_value_per_100,
          run_value=excluded.run_value, pitches=excluded.pitches, pitch_usage=excluded.pitch_usage, pa=excluded.pa, ba=excluded.ba, slg=excluded.slg, woba=excluded.woba,
          whiff_percent=excluded.whiff_percent, k_percent=excluded.k_percent, put_away=excluded.put_away, est_ba=excluded.est_ba, est_slg=excluded.est_slg,
          est_woba=excluded.est_woba, hard_hit_percent=excluded.hard_hit_percent, active=1, source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
      `;
    }
    step = "write_unchanged_touch";
    for (let i = 0; i < unchangedIds.length; i += CHUNK) {
      const chunk = unchangedIds.slice(i, i + CHUNK);
      await sql`UPDATE ref.pitcher_arsenal SET active=1, updated_at=now() WHERE arsenal_id IN ${sql(chunk)}`;
    }

    step = "write_deactivate_stale";
    const staleIds = currentRows.filter(current => !freshIds.has(current.arsenal_id) && Number(current.active) === 1).map(c => c.arsenal_id);
    let deactivated = 0;
    for (let i = 0; i < staleIds.length; i += CHUNK) {
      const chunk = staleIds.slice(i, i + CHUNK);
      await sql`UPDATE ref.pitcher_arsenal SET active=0, updated_at=now() WHERE arsenal_id IN ${sql(chunk)}`;
      deactivated += chunk.length;
    }

    step = "final_count_and_close";
    const activeCount = await sql`SELECT COUNT(*)::int c FROM ref.pitcher_arsenal WHERE season_year=${year} AND active=1`;
    await sql.end();
    const certified = mapped.length > 0 && changed + unchanged === mapped.length;

    return {
      ok: certified, data_ok: certified, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
      request_id: input.request_id || null, chain_id: input.chain_id || null,
      status: certified ? "completed" : "failed_no_real_rows_parsed",
      certification: certified ? "STATIC_PITCHER_ARSENAL_CERTIFIED" : "STATIC_PITCHER_ARSENAL_CERTIFICATION_FAILED",
      season_year: year, source_url: fetched.url, rows_read: fetched.row_count, rows_mapped: mapped.length,
      rows_written: changed, rows_unchanged_skipped: unchanged, rows_deactivated: deactivated,
      active_rows_after: Number(activeCount[0] && activeCount[0].c || 0),
      differential_note: "rows_written is the honest count of pitcher-pitch-type rows whose real Statcast values actually changed; rows_unchanged_skipped got a cheap active/updated_at touch only.",
      database_target: "postgres_ref_pitcher_arsenal",
      external_calls_performed: 1,
      no_scoring: true, no_ranking: true, no_final_board: true,
      timestamp_utc: nowUtc()
    };
  } catch (err) {
    throw new Error(`failed_at_step:${step}: ${String(err && err.message ? err.message : err)}`);
  }
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "STATIC_PITCHER_ARSENAL_READY", timestamp_utc: nowUtc(),
    notes: [
      "Real, differential-aware pitcher arsenal reference refresh (season-level, Baseball Savant CSV export). Now Postgres-backed.",
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
        const output = await runArsenal(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
