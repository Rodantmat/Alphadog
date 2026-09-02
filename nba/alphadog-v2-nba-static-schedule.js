import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-schedule";
const VERSION = "alphadog-v2-nba-static-schedule-v0.1.0";
const JOB_KEY = "nba-static-schedule";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }

async function fetchFromGithub(env, path, metaPath) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-StaticSchedule" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
  const apiUrl = (p) => `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;
  const [dataResp, metaResp] = await Promise.all([fetch(apiUrl(path), { headers }), fetch(apiUrl(metaPath), { headers })]);
  if (!dataResp.ok) throw new Error(`github_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);
  const dataJson = await dataResp.json();
  const file = JSON.parse(atob(String(dataJson.content || "").replace(/\n/g, "")));
  let meta = null;
  if (metaResp.ok) {
    try { const metaJson = await metaResp.json(); meta = JSON.parse(atob(String(metaJson.content || "").replace(/\n/g, ""))); } catch (_) {}
  }
  if (meta && meta.error) throw new Error(`last_committed_scrape_failed: ${meta.error}`);
  return { file, meta };
}

function toIntOrNull(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  let games = [];
  let fetchError = null;
  let meta = null;
  try {
    const r = await fetchFromGithub(env, "nba/data/nba_schedule_current.json", "nba/data/nba_schedule_current_meta.json");
    games = (r.file.games || []).filter(g => g && g.game_id && g.home_team_id && g.away_team_id);
    meta = r.meta;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (games.length === 0) {
    await sql.end();
    return { ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, status: "failed_no_data", error: fetchError || "zero_games", elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
  }

  const sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  let written = 0;
  for (const g of games) {
    await sql`
      INSERT INTO nba_calendar.games (game_id, season, game_date, game_datetime_utc, home_team_id, home_team_tricode, away_team_id, away_team_tricode, arena_name, arena_city, game_status, game_status_text, game_label, source_key, raw_json, updated_at)
      VALUES (${g.game_id}, ${g.season}, ${g.game_date ? g.game_date.slice(0, 10) : null}, ${g.game_datetime_utc}, ${`nba_${g.home_team_id}`}, ${g.home_team_tricode}, ${`nba_${g.away_team_id}`}, ${g.away_team_tricode}, ${g.arena_name}, ${g.arena_city}, ${toIntOrNull(g.game_status)}, ${g.game_status_text}, ${g.game_label}, ${sourceKey}, ${JSON.stringify(g).slice(0, 1500)}, now())
      ON CONFLICT (game_id) DO UPDATE SET
        season=excluded.season, game_date=excluded.game_date, game_datetime_utc=excluded.game_datetime_utc,
        home_team_id=excluded.home_team_id, home_team_tricode=excluded.home_team_tricode,
        away_team_id=excluded.away_team_id, away_team_tricode=excluded.away_team_tricode,
        arena_name=excluded.arena_name, arena_city=excluded.arena_city, game_status=excluded.game_status,
        game_status_text=excluded.game_status_text, game_label=excluded.game_label,
        source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }

  const bySeasonCount = await sql`SELECT season, COUNT(*)::int AS c FROM nba_calendar.games GROUP BY season ORDER BY season`;
  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_calendar.games`;
  await sql.end();
  const certified = written >= 1000;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: certified ? "completed" : "completed_with_warning",
    rows_read: games.length, rows_written: written, source_key: sourceKey, scraper_fetched_at: meta ? meta.fetched_at : null,
    final_counts: { nba_calendar_games_total: Number(total[0]?.c || 0), by_season: bySeasonCount },
    elapsed_ms: Date.now() - started, timestamp_utc: nowUtc()
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && path === "/") return jsonResponse({ ok: true, worker_name: WORKER_NAME, version: VERSION, timestamp_utc: nowUtc() });
    if (request.method === "GET" && path === "/health") return jsonResponse({ ok: true, worker_name: WORKER_NAME, vars_present: Object.fromEntries(EXPECTED_VARS.map(v => [v, Boolean(env[v])])) });
    if (request.method === "POST" && path === "/run") {
      const input = await readJsonSafe(request);
      try { return jsonResponse(await runJob(input, env)); }
      catch (err) { return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err), timestamp_utc: nowUtc() }, 500); }
    }
    return jsonResponse({ ok: false, status: "NOT_FOUND" }, 404);
  }
};
