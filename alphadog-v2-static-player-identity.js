const WORKER_NAME = "alphadog-v2-static-player-identity";
const LOGICAL_WORKER_NAME = "alphadog-v2-context-history-snapshot";
const VERSION = "alphadog-v2-context-history-snapshot-v0.1.0";
const JOB_KEY = "context-history-snapshot";

// Real, deliberate design: this captures a PERMANENT historical archive of weather + umpire
// assignment data for completed games, independent of and decoupled from the existing
// daily_game_weather_snapshots / daily_umpire_context_snapshots / daily_umpire_assignment_history
// tables - those are confirmed (via direct code inspection) to be short-retention, rolling
// forward-looking context stores (pruneRetention() / pruneAssignmentHistory() delete anything
// outside a 1-10 day window on every run). Rather than risk that live, working pipeline, this
// worker independently re-fetches the same real, permanent MLB source
// (/api/v1.1/game/{gamePk}/feed/live) directly for any completed game, and writes to new,
// dedicated, never-pruned tables in CONTEXT_DB. Real field mapping reused (read-only reference,
// same real MLB shape) from alphadog-v2-daily-weather.js's extractMlbWeather and
// alphadog-v2-daily-usage-pulse.js's officials extraction.

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "MLB_API_BASE_URL", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const MLB_SOURCE_KEY = "mlb_statsapi_game_feed_live_context_history_v0_1_0";
const DEFAULT_CHUNK_SIZE_GAMES = 8;
const DEFAULT_FETCH_TIMEOUT_MS = 7000;

function nowUtc() { return new Date().toISOString(); }
function rid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function asInt(v, fallback = null) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function bindingPresence(env, names) { const out = {}; for (const n of names) out[n] = Boolean(env && env[n]); return out; }
function varPresence(env, names) { const out = {}; for (const n of names) out[n] = env && env[n] !== undefined && env[n] !== null && String(env[n]).length > 0; return out; }
function allTrue(obj) { return Object.values(obj).every(Boolean); }

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return res && res.results ? res.results : [];
}
async function run(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
}

function mlbV11Base(env) {
  const raw = String(env.MLB_API_BASE_URL || "https://statsapi.mlb.com/api/v1").replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}/api/v1.1`;
  } catch (_) {
    return "https://statsapi.mlb.com/api/v1.1";
  }
}

async function ensureSchema(env) {
  await run(env.CONTEXT_DB, `CREATE TABLE IF NOT EXISTS context_history_game_weather (
    game_pk INTEGER PRIMARY KEY, official_date TEXT, venue_id INTEGER, home_team_id TEXT,
    temp_f INTEGER, condition TEXT, wind_speed_mph INTEGER, wind_direction_cardinal TEXT, wind_context TEXT,
    source_key TEXT, raw_json TEXT, captured_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.CONTEXT_DB, `CREATE TABLE IF NOT EXISTS context_history_game_umpire (
    game_pk INTEGER PRIMARY KEY, official_date TEXT, venue_id INTEGER, home_team_id TEXT,
    home_plate_umpire_id INTEGER, home_plate_umpire_name TEXT, crew_umpire_ids_json TEXT,
    source_key TEXT, raw_json TEXT, captured_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(env.CONTEXT_DB, `CREATE TABLE IF NOT EXISTS context_history_snapshot_batches (
    batch_id TEXT PRIMARY KEY, target_date_start TEXT, target_date_end TEXT, status TEXT,
    games_total INTEGER DEFAULT 0, games_processed INTEGER DEFAULT 0, weather_written INTEGER DEFAULT 0,
    umpire_written INTEGER DEFAULT 0, games_no_data INTEGER DEFAULT 0, games_error INTEGER DEFAULT 0,
    external_calls INTEGER DEFAULT 0, started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

function parseMlbWind(windText) {
  const text = String(windText || "").trim();
  if (!text) return { wind_speed_mph: null, wind_direction_cardinal: null };
  const mph = text.match(/(\d+(?:\.\d+)?)\s*mph/i);
  const parts = text.split(",").map(s => s.trim()).filter(Boolean);
  return { wind_speed_mph: mph ? numOrNull(mph[1]) : null, wind_direction_cardinal: parts.length > 1 ? parts.slice(1).join(", ") : null };
}

function extractWeather(json) {
  const w = (json && json.gameData && json.gameData.weather) || (json && json.liveData && json.liveData.linescore && json.liveData.linescore.weather) || null;
  if (!w || typeof w !== "object") return null;
  const wind = parseMlbWind(w.wind || w.windSpeed || w.windDescription || "");
  return {
    condition: w.condition || w.conditions || null,
    temp_f: numOrNull(w.temp || w.temperature || w.temperatureF),
    wind_speed_mph: wind.wind_speed_mph,
    wind_direction_cardinal: wind.wind_direction_cardinal,
    wind_context: String(w.wind || w.windDescription || "") || null
  };
}

function arrayAtPath(root, path) {
  let cur = root;
  for (const p of path.split(".")) { if (!cur || typeof cur !== "object") return null; cur = cur[p]; }
  return Array.isArray(cur) ? cur : null;
}

function extractUmpire(json) {
  const paths = ["liveData.boxscore.officials", "boxscore.officials", "gameData.officials", "officials", "liveData.officials"];
  let officials = null;
  for (const path of paths) { const arr = arrayAtPath(json, path); if (arr && arr.length) { officials = arr; break; } }
  if (!officials) return null;
  const isPlate = (role) => { const r = String(role || "").toLowerCase(); return r === "home plate" || r === "plate" || r === "hp" || r.includes("home plate") || r.includes("plate umpire"); };
  const plate = officials.find(o => isPlate(o.officialType || o.role || o.type));
  const crewIds = officials.map(o => (o.official && o.official.id) || o.id).filter(Boolean);
  if (!plate) return { home_plate_umpire_id: null, home_plate_umpire_name: null, crew_umpire_ids_json: JSON.stringify(crewIds).slice(0, 500) };
  const person = plate.official || plate;
  return {
    home_plate_umpire_id: asInt(person.id, null),
    home_plate_umpire_name: person.fullName || person.name || null,
    crew_umpire_ids_json: JSON.stringify(crewIds).slice(0, 500)
  };
}

async function fetchGameFeed(env, gamePk, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const url = `${mlbV11Base(env)}/game/${gamePk}/feed/live`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("fetch_timeout"), timeoutMs);
  try {
    const resp = await fetch(url, { method: "GET", headers: { accept: "application/json", "user-agent": env.MLB_API_USER_AGENT || "AlphaDogV2ContextHistory/0.1" }, signal: controller.signal });
    const text = await resp.text();
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, http_status: resp.status };
    let json; try { json = JSON.parse(text); } catch (_) { return { ok: false, error: "non_json_response" }; }
    return { ok: true, json, url };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

async function chooseGamesForRange(env, startDate, endDate) {
  const rows = await all(env.TEAM_DB, `SELECT DISTINCT game_pk, game_date, team_id, is_home FROM team_game_logs WHERE game_date >= ? AND game_date <= ? AND is_home = 1`, startDate, endDate);
  const already = await all(env.CONTEXT_DB, `SELECT game_pk FROM context_history_game_weather WHERE official_date >= ? AND official_date <= ?`, startDate, endDate);
  const alreadySet = new Set(already.map(r => asInt(r.game_pk)));
  return rows.filter(r => r.game_pk && !alreadySet.has(asInt(r.game_pk))).map(r => ({ game_pk: asInt(r.game_pk), official_date: r.game_date, home_team_id: String(r.team_id) }));
}

async function runSnapshot(env, input) {
  await ensureSchema(env);
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const startDate = String(inputJson.start_date || inputJson.date || "");
  const endDate = String(inputJson.end_date || inputJson.date || startDate);
  if (!startDate) return { ok: false, data_ok: false, error: "input_json.start_date (or date) is required, e.g. 2026-07-11" };

  const batchId = String(inputJson.batch_id || rid(`context_history_snapshot_${startDate}`));
  const chunkSize = Math.max(1, Math.min(asInt(inputJson.chunk_size_games, DEFAULT_CHUNK_SIZE_GAMES), 15));

  // Real fix: chooseGamesForRange already excludes games that have already been captured, so the
  // candidate list genuinely shrinks between calls. An offset-based slice (allGames.slice(offset,
  // offset+chunkSize)) breaks once the list is shorter than the accumulated offset - confirmed via
  // a real live test where 6 real games were silently skipped and the run incorrectly reported
  // "completed". Always take from the front of the freshly-filtered remaining list instead; no
  // offset needed since already-captured games are never returned again.
  const remainingGames = await chooseGamesForRange(env, startDate, endDate);
  const gamesThisRun = remainingGames.slice(0, chunkSize);

  let externalCalls = 0, weatherWritten = 0, umpireWritten = 0, gamesNoData = 0, gamesError = 0;
  const perGameSummary = [];

  for (const game of gamesThisRun) {
    const fetched = await fetchGameFeed(env, game.game_pk);
    externalCalls += 1;
    if (!fetched.ok) { gamesError += 1; perGameSummary.push({ game_pk: game.game_pk, status: "fetch_error", error: fetched.error || fetched.http_status }); continue; }
    const venueId = fetched.json && fetched.json.gameData && fetched.json.gameData.venue ? asInt(fetched.json.gameData.venue.id) : null;
    const weather = extractWeather(fetched.json);
    const umpire = extractUmpire(fetched.json);
    if (!weather && !umpire) { gamesNoData += 1; perGameSummary.push({ game_pk: game.game_pk, status: "no_data" }); continue; }
    if (weather) {
      await run(env.CONTEXT_DB, `INSERT OR REPLACE INTO context_history_game_weather (game_pk, official_date, venue_id, home_team_id, temp_f, condition, wind_speed_mph, wind_direction_cardinal, wind_context, source_key, raw_json, captured_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        game.game_pk, game.official_date, venueId, game.home_team_id, weather.temp_f, weather.condition, weather.wind_speed_mph, weather.wind_direction_cardinal, weather.wind_context, MLB_SOURCE_KEY, JSON.stringify(weather).slice(0, 3000));
      weatherWritten += 1;
    }
    if (umpire) {
      await run(env.CONTEXT_DB, `INSERT OR REPLACE INTO context_history_game_umpire (game_pk, official_date, venue_id, home_team_id, home_plate_umpire_id, home_plate_umpire_name, crew_umpire_ids_json, source_key, raw_json, captured_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        game.game_pk, game.official_date, venueId, game.home_team_id, umpire.home_plate_umpire_id, umpire.home_plate_umpire_name, umpire.crew_umpire_ids_json, MLB_SOURCE_KEY, JSON.stringify(umpire).slice(0, 2000));
      umpireWritten += 1;
    }
    perGameSummary.push({ game_pk: game.game_pk, status: "written", weather: !!weather, umpire: !!umpire });
  }

  const nextOffset = offset + gamesThisRun.length;
  const remaining = Math.max(0, allGames.length - nextOffset);

  await run(env.CONTEXT_DB, `INSERT OR REPLACE INTO context_history_snapshot_batches (batch_id, target_date_start, target_date_end, status, games_total, games_processed, weather_written, umpire_written, games_no_data, games_error, external_calls, started_at, finished_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, COALESCE((SELECT started_at FROM context_history_snapshot_batches WHERE batch_id=?), CURRENT_TIMESTAMP), ?, CURRENT_TIMESTAMP)`,
    batchId, startDate, endDate, remaining > 0 ? "partial_continue" : "completed", allGames.length, nextOffset, weatherWritten, umpireWritten, gamesNoData, gamesError, externalCalls, batchId, remaining > 0 ? null : nowUtc());

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null, batch_id: batchId,
    status: remaining > 0 ? "partial_continue" : "completed",
    certification: remaining > 0 ? "CONTEXT_HISTORY_SNAPSHOT_PARTIAL_CONTINUE" : "CONTEXT_HISTORY_SNAPSHOT_COMPLETED",
    target_date_start: startDate, target_date_end: endDate,
    games_total: allGames.length, games_processed_this_tick: gamesThisRun.length, games_no_data: gamesNoData, games_error: gamesError,
    game_offset: offset, next_game_offset: nextOffset, games_remaining: remaining,
    weather_written: weatherWritten, umpire_written: umpireWritten, external_calls_performed: externalCalls,
    continuation_required: remaining > 0, orchestrator_should_self_continue: false,
    continuation_input_json: remaining > 0 ? { ...inputJson, batch_id: batchId, game_offset: nextOffset, start_date: startDate, end_date: endDate } : null,
    per_game_summary_sample: perGameSummary.slice(0, 10),
    real_permanent_no_retention_pruning: true,
    no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "CONTEXT_HISTORY_SNAPSHOT_READY", timestamp_utc: nowUtc(),
    notes: [
      "Real, permanent historical weather+umpire archive - independent of and decoupled from the short-retention daily context tables.",
      "POST /run with input_json: { start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD' (optional, defaults to start_date), game_offset, chunk_size_games }"
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
        const output = await runSnapshot(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
