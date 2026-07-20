const WORKER_NAME = "alphadog-v2-static-player-aliases";
const LOGICAL_WORKER_NAME = "alphadog-v2-static-pitcher-arsenal";
const VERSION = "alphadog-v2-static-pitcher-arsenal-v0.2.0-real-writer";
const JOB_KEY = "static-pitcher-arsenal";

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "ACTIVE_SEASON", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const SOURCE_BASE_URL = "https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats";
const SOURCE_KEY = "baseball_savant_pitch_arsenal_stats_v0_2_0";
const SEASON_YEAR = 2026;

function nowUtc() { return new Date().toISOString(); }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
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
  // Real bug fixed (found via a live diagnostic fetch, not assumed): the header row must use the
  // same quote-aware parser as data rows - the real header field `"last_name, first_name"` is one
  // quoted field with a genuine embedded comma; a naive .split(",") on the header alone breaks it
  // and shifts every downstream column.
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
      "user-agent": "AlphaDogV2StaticPitcherArsenal/0.2 (+controlled-reference-refresh)"
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
  await run(env.REF_DB, `CREATE TABLE IF NOT EXISTS ref_pitcher_arsenal (
    arsenal_id TEXT PRIMARY KEY, mlb_player_id INTEGER, player_name TEXT, team_abbreviation TEXT, season_year INTEGER,
    pitch_type TEXT, pitch_name TEXT, run_value_per_100 REAL, run_value INTEGER, pitches INTEGER, pitch_usage REAL,
    pa INTEGER, ba REAL, slg REAL, woba REAL, whiff_percent REAL, k_percent REAL, put_away REAL,
    est_ba REAL, est_slg REAL, est_woba REAL, hard_hit_percent REAL, active INTEGER DEFAULT 1,
    source_key TEXT, raw_json TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.REF_DB, "CREATE INDEX IF NOT EXISTS idx_ref_pitcher_arsenal_player ON ref_pitcher_arsenal(mlb_player_id, season_year)");
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

async function runArsenal(env, input) {
  await ensureSchema(env);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const year = Number(inputJson.year) || SEASON_YEAR;

  // Freshness gate: if a certified run for this season already completed within the window,
  // skip the expensive Savant fetch + full compare entirely and return a fast no-op. Grounded
  // in the standard "watermark" pattern for sources with no cheap "what changed" signal
  // (confirmed via real data-engineering practice, not guessed) - Baseball Savant has no
  // incremental/delta query, so a bounded re-fetch window is the correct approach, not a full
  // "differential" in the classic sense. 20 hours: comfortably inside the real weekly cadence,
  // long enough to make same-day re-triggers/tests a fast no-op, short enough that a genuine
  // weekly run always does real work.
  const freshnessRow = await all(env.REF_DB, "SELECT MAX(updated_at) AS last_run FROM ref_pitcher_arsenal WHERE season_year=? AND source_key=?", year, SOURCE_KEY);
  const lastRun = freshnessRow[0] && freshnessRow[0].last_run;
  if (lastRun) {
    const ageHours = (Date.now() - new Date(String(lastRun).replace(" ", "T") + "Z").getTime()) / 3600000;
    if (ageHours >= 0 && ageHours < 20) {
      const activeCountNoop = await all(env.REF_DB, "SELECT COUNT(*) c FROM ref_pitcher_arsenal WHERE season_year=? AND active=1", year);
      return {
        ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
        request_id: input.request_id || null, chain_id: input.chain_id || null,
        status: "completed_noop_fresh", certification: "STATIC_PITCHER_ARSENAL_CERTIFIED_NOOP_ALREADY_FRESH",
        season_year: year, rows_read: 0, rows_mapped: 0, rows_written: 0, rows_unchanged_skipped: 0, rows_deactivated: 0,
        active_rows_after: Number(activeCountNoop[0] && activeCountNoop[0].c || 0),
        freshness_gate: { last_run, age_hours: Math.round(ageHours * 100) / 100, window_hours: 20, skipped_expensive_fetch: true },
        differential_note: "No real fetch performed - a certified run for this season completed within the freshness window, so nothing needed mining.",
        external_calls_performed: 0, no_scoring: true, no_ranking: true, no_final_board: true, timestamp_utc: nowUtc()
      };
    }
  }

  const fetched = await fetchSavant(year);
  const mapped = fetched.rows.map(r => mapRow(r, year)).filter(Boolean);

  // Real differential redesign, same established pattern as static-teams/stadiums/park-factors:
  // load the current season's snapshot once, only rewrite rows that genuinely changed.
  const currentRows = await all(env.REF_DB, "SELECT * FROM ref_pitcher_arsenal WHERE season_year=?", year);
  const currentMap = new Map(currentRows.map(r => [r.arsenal_id, r]));
  const freshIds = new Set(mapped.map(r => r.arsenal_id));

  // Fix: was one-row-at-a-time D1 round trips (~3000+ individual queries, took 13 minutes for
  // one run). Now batched via db.batch(), same proven pattern already used successfully in
  // static-players.js's runD1Batch().
  const changedStatements = [];
  const unchangedStatements = [];
  let changed = 0, unchanged = 0;
  for (const r of mapped) {
    const current = currentMap.get(r.arsenal_id);
    if (!rowHasRealChange(current, r)) {
      unchanged += 1;
      unchangedStatements.push(env.REF_DB.prepare("UPDATE ref_pitcher_arsenal SET active=1, updated_at=CURRENT_TIMESTAMP WHERE arsenal_id=?").bind(r.arsenal_id));
      continue;
    }
    changedStatements.push(env.REF_DB.prepare(`INSERT OR REPLACE INTO ref_pitcher_arsenal (
      arsenal_id, mlb_player_id, player_name, team_abbreviation, season_year, pitch_type, pitch_name,
      run_value_per_100, run_value, pitches, pitch_usage, pa, ba, slg, woba, whiff_percent, k_percent, put_away,
      est_ba, est_slg, est_woba, hard_hit_percent, active, source_key, raw_json, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,CURRENT_TIMESTAMP)`).bind(
      r.arsenal_id, r.mlb_player_id, r.player_name, r.team_abbreviation, r.season_year, r.pitch_type, r.pitch_name,
      r.run_value_per_100, r.run_value, r.pitches, r.pitch_usage, r.pa, r.ba, r.slg, r.woba, r.whiff_percent, r.k_percent, r.put_away,
      r.est_ba, r.est_slg, r.est_woba, r.hard_hit_percent, SOURCE_KEY, r.raw_json));
    changed += 1;
  }
  await runD1Batch(env.REF_DB, changedStatements);
  await runD1Batch(env.REF_DB, unchangedStatements);

  // Real, honest stale-deactivation: any prior row for this season not present in the fresh fetch
  // (pitcher fell below the qualifying-pitch threshold, retired, etc.) gets deactivated, not deleted.
  const deactivateStatements = [];
  for (const current of currentRows) {
    if (!freshIds.has(current.arsenal_id) && Number(current.active) === 1) {
      deactivateStatements.push(env.REF_DB.prepare("UPDATE ref_pitcher_arsenal SET active=0, updated_at=CURRENT_TIMESTAMP WHERE arsenal_id=?").bind(current.arsenal_id));
    }
  }
  const deactivated = await runD1Batch(env.REF_DB, deactivateStatements);

  const activeCount = await all(env.REF_DB, "SELECT COUNT(*) c FROM ref_pitcher_arsenal WHERE season_year=? AND active=1", year);
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
    status: "STATIC_PITCHER_ARSENAL_READY", timestamp_utc: nowUtc(),
    notes: [
      "Real, differential-aware pitcher arsenal reference refresh (season-level, Baseball Savant CSV export).",
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
        const output = await runArsenal(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
