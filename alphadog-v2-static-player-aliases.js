import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-static-player-aliases";
const LOGICAL_WORKER_NAME = "alphadog-v2-static-pitcher-arsenal";
const VERSION = "alphadog-v2-static-pitcher-arsenal-v0.4.0-chunked-ticks";
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
      "user-agent": "AlphaDogV2StaticPitcherArsenal/0.4 (+controlled-reference-refresh)"
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

const TICK_CHUNK_SIZE = 150;

async function runArsenal(env, input) {
  let step = "ensureSchema";
  try {
    await ensureSchema(env);
    const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
    const year = Number(inputJson.year) || SEASON_YEAR;
    const offset = Number(inputJson.arsenal_offset) || 0;

    step = "freshness_check_open";
    let sqlCheck = pg(env);
    if (offset === 0) {
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
    }
    step = "freshness_check_close";
    await sqlCheck.end();

    // Re-fetched every tick (cheap HTTP GET, data doesn't meaningfully change within a few
    // minutes) so there's no need to persist the CSV between ticks - just slice by offset.
    step = "external_fetch";
    const fetched = await fetchSavant(year);
    const mapped = fetched.rows.map(r => mapRow(r, year)).filter(Boolean);
    const totalRows = mapped.length;
    const sliceRows = mapped.slice(offset, offset + TICK_CHUNK_SIZE);
    const isLastTick = offset + TICK_CHUNK_SIZE >= totalRows;

    step = "write_connection_open";
    const sql = pg(env);
    step = "write_current_rows_select";
    const currentRows = await sql`SELECT * FROM ref.pitcher_arsenal WHERE season_year=${year}`;
    const currentMap = new Map(currentRows.map(r => [r.arsenal_id, r]));

    // Bounded per-tick write: only this slice's rows, individual upserts (the proven-reliable
    // pattern from static-teams/stadiums/park-factors). Confirmed live that BOTH the bulk-helper
    // syntax AND an unbounded individual-row loop over the full ~3000-row dataset in a single
    // invocation eventually drop the Hyperdrive connection; a small bounded slice per tick does
    // not. This is the real fix, not a syntax workaround.
    step = "write_upserts";
    let changed = 0, unchanged = 0;
    for (const r of sliceRows) {
      const current = currentMap.get(r.arsenal_id);
      if (!rowHasRealChange(current, r)) {
        unchanged += 1;
        await sql`UPDATE ref.pitcher_arsenal SET active=1, updated_at=now() WHERE arsenal_id=${r.arsenal_id}`;
        continue;
      }
      await sql`
        INSERT INTO ref.pitcher_arsenal (arsenal_id, mlb_player_id, player_name, team_abbreviation, season_year, pitch_type, pitch_name,
          run_value_per_100, run_value, pitches, pitch_usage, pa, ba, slg, woba, whiff_percent, k_percent, put_away,
          est_ba, est_slg, est_woba, hard_hit_percent, active, source_key, raw_json, updated_at)
        VALUES (${r.arsenal_id}, ${r.mlb_player_id}, ${r.player_name}, ${r.team_abbreviation}, ${r.season_year}, ${r.pitch_type}, ${r.pitch_name},
          ${r.run_value_per_100}, ${r.run_value}, ${r.pitches}, ${r.pitch_usage}, ${r.pa}, ${r.ba}, ${r.slg}, ${r.woba}, ${r.whiff_percent}, ${r.k_percent}, ${r.put_away},
          ${r.est_ba}, ${r.est_slg}, ${r.est_woba}, ${r.hard_hit_percent}, 1, ${SOURCE_KEY}, ${r.raw_json}, now())
        ON CONFLICT (arsenal_id) DO UPDATE SET mlb_player_id=excluded.mlb_player_id, player_name=excluded.player_name, team_abbreviation=excluded.team_abbreviation,
          season_year=excluded.season_year, pitch_type=excluded.pitch_type, pitch_name=excluded.pitch_name, run_value_per_100=excluded.run_value_per_100,
          run_value=excluded.run_value, pitches=excluded.pitches, pitch_usage=excluded.pitch_usage, pa=excluded.pa, ba=excluded.ba, slg=excluded.slg, woba=excluded.woba,
          whiff_percent=excluded.whiff_percent, k_percent=excluded.k_percent, put_away=excluded.put_away, est_ba=excluded.est_ba, est_slg=excluded.est_slg,
          est_woba=excluded.est_woba, hard_hit_percent=excluded.hard_hit_percent, active=1, source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
      `;
      changed += 1;
    }

    let deactivated = 0;
    if (isLastTick) {
      step = "write_deactivate_stale";
      const freshIds = new Set(mapped.map(r => r.arsenal_id));
      for (const current of currentRows) {
        if (!freshIds.has(current.arsenal_id) && Number(current.active) === 1) {
          await sql`UPDATE ref.pitcher_arsenal SET active=0, updated_at=now() WHERE arsenal_id=${current.arsenal_id}`;
          deactivated += 1;
        }
      }
    }

    step = "final_count_and_close";
    const activeCount = await sql`SELECT COUNT(*)::int c FROM ref.pitcher_arsenal WHERE season_year=${year} AND active=1`;
    await sql.end();

    if (!isLastTick) {
      return {
        ok: true, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
        request_id: input.request_id || null, chain_id: input.chain_id || null,
        status: "partial_continue", certification: "STATIC_PITCHER_ARSENAL_PARTIAL_CONTINUE",
        season_year: year, rows_read: fetched.row_count, rows_mapped: totalRows,
        rows_processed_this_tick: sliceRows.length, rows_written: changed, rows_unchanged_skipped: unchanged,
        offset_processed_through: offset + sliceRows.length, rows_remaining: totalRows - (offset + sliceRows.length),
        continuation_input_json: { ...inputJson, year, arsenal_offset: offset + TICK_CHUNK_SIZE },
        active_rows_after: Number(activeCount[0] && activeCount[0].c || 0),
        differential_note: "Bounded per-tick write (150 rows/tick) to keep each invocation's connection duration short - confirmed live that unbounded single-invocation writes over the full ~3000-row dataset eventually drop the connection.",
        database_target: "postgres_ref_pitcher_arsenal",
        external_calls_performed: 1, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
      };
    }

    const certified = totalRows > 0;
    return {
      ok: certified, data_ok: certified, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
      request_id: input.request_id || null, chain_id: input.chain_id || null,
      status: certified ? "completed" : "failed_no_real_rows_parsed",
      certification: certified ? "STATIC_PITCHER_ARSENAL_CERTIFIED" : "STATIC_PITCHER_ARSENAL_CERTIFICATION_FAILED",
      season_year: year, source_url: fetched.url, rows_read: fetched.row_count, rows_mapped: totalRows,
      rows_processed_this_tick: sliceRows.length, rows_written: changed, rows_unchanged_skipped: unchanged, rows_deactivated: deactivated,
      active_rows_after: Number(activeCount[0] && activeCount[0].c || 0),
      differential_note: "Final tick of a bounded multi-tick run - rows_written/rows_unchanged_skipped reflect only this tick's slice, not the full dataset.",
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
      "Real, differential-aware pitcher arsenal reference refresh (season-level, Baseball Savant CSV export). Postgres-backed, chunked across ticks.",
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
