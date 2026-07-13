const WORKER_NAME = "alphadog-v2-static-team-context";
const LOGICAL_WORKER_NAME = "alphadog-v2-context-history-certifier";
const VERSION = "alphadog-v2-context-history-certifier-v0.1.0";
const JOB_KEY = "context-history-certifier";

// Real, read-only certifier for the Context History Snapshot pipeline. Validates that every real
// completed game (from TEAM_DB.team_game_logs, the authoritative real-outcomes source) within the
// requested date range has a corresponding permanent row in CONTEXT_DB.context_history_game_weather
// and context_history_game_umpire. Reports real gaps rather than assuming coverage. Never writes
// to source tables - only reads and reports.

const REQUIRED_DB_BINDINGS = ["CONTROL_DB", "CONFIG_DB", "REF_DB", "STATS_HITTER_DB", "STATS_PITCHER_DB", "TEAM_DB", "DAILY_DB", "MARKET_DB", "CONTEXT_DB", "SCORE_DB", "ARCHIVE_DB"];
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_FAMILY", "SYSTEM_VERSION", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];

function nowUtc() { return new Date().toISOString(); }
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

async function runCertify(env, input) {
  const inputJson = input.input_json && typeof input.input_json === "object" ? input.input_json : {};
  const startDate = String(inputJson.start_date || inputJson.date || "");
  const endDate = String(inputJson.end_date || inputJson.date || startDate);
  if (!startDate) return { ok: false, data_ok: false, error: "input_json.start_date (or date) is required, e.g. 2026-07-11" };

  const realGames = await all(env.TEAM_DB, `SELECT DISTINCT game_pk, game_date FROM team_game_logs WHERE game_date >= ? AND game_date <= ? AND is_home = 1`, startDate, endDate);
  const weatherRows = await all(env.CONTEXT_DB, `SELECT game_pk FROM context_history_game_weather WHERE official_date >= ? AND official_date <= ?`, startDate, endDate);
  const umpireRows = await all(env.CONTEXT_DB, `SELECT game_pk FROM context_history_game_umpire WHERE official_date >= ? AND official_date <= ?`, startDate, endDate);

  const weatherSet = new Set(weatherRows.map(r => asInt(r.game_pk)));
  const umpireSet = new Set(umpireRows.map(r => asInt(r.game_pk)));

  const missingWeather = [];
  const missingUmpire = [];
  for (const g of realGames) {
    const gamePk = asInt(g.game_pk);
    if (!gamePk) continue;
    if (!weatherSet.has(gamePk)) missingWeather.push({ game_pk: gamePk, official_date: g.game_date });
    if (!umpireSet.has(gamePk)) missingUmpire.push({ game_pk: gamePk, official_date: g.game_date });
  }

  const realGameCount = realGames.filter(g => g.game_pk).length;
  const weatherCoveragePct = realGameCount ? Math.round(((realGameCount - missingWeather.length) / realGameCount) * 1000) / 10 : 100;
  const umpireCoveragePct = realGameCount ? Math.round(((realGameCount - missingUmpire.length) / realGameCount) * 1000) / 10 : 100;
  const certified = missingWeather.length === 0 && missingUmpire.length === 0;

  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    request_id: input.request_id || null, chain_id: input.chain_id || null,
    status: certified ? "CONTEXT_HISTORY_CERTIFIED_FULL_COVERAGE" : "CONTEXT_HISTORY_GAPS_FOUND",
    certification: certified ? "CONTEXT_HISTORY_CERTIFIED_FULL_COVERAGE" : "CONTEXT_HISTORY_CERTIFICATION_GAPS_FOUND",
    certification_grade: certified ? "PASS" : "GAPS_FOUND",
    target_date_start: startDate, target_date_end: endDate,
    real_completed_games: realGameCount,
    weather_coverage_pct: weatherCoveragePct, umpire_coverage_pct: umpireCoveragePct,
    missing_weather_count: missingWeather.length, missing_umpire_count: missingUmpire.length,
    missing_weather_sample: missingWeather.slice(0, 20), missing_umpire_sample: missingUmpire.slice(0, 20),
    read_only: true, no_writes: true, no_scoring: true, no_ranking: true, no_final_board: true,
    timestamp_utc: nowUtc()
  };
}

function baseIdentity(env) {
  const db = bindingPresence(env, REQUIRED_DB_BINDINGS);
  const vars = varPresence(env, EXPECTED_VARS);
  return {
    ok: true, data_ok: true, version: VERSION, worker_name: LOGICAL_WORKER_NAME, deployed_worker_slot: WORKER_NAME, job_key: JOB_KEY,
    status: "CONTEXT_HISTORY_CERTIFIER_READY", timestamp_utc: nowUtc(),
    notes: [
      "Real, read-only certifier - compares real completed games (TEAM_DB.team_game_logs) against permanent context_history_game_weather/umpire coverage.",
      "POST /run with input_json: { start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD' (optional) }"
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
        const output = await runCertify(env, input);
        return jsonResponse(output, output.ok ? 200 : 400);
      } catch (err) {
        return jsonResponse({ ok: false, data_ok: false, version: VERSION, worker_name: LOGICAL_WORKER_NAME, error: String(err && err.stack ? err.stack : err) }, 500);
      }
    }
    return jsonResponse({ ok: false, error: "not_found", allowed_routes: ["GET /", "GET /health", "POST /run"] }, 404);
  }
};
