import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-team-stats";
const VERSION = "alphadog-v2-nba-static-team-stats-v0.1.0";
const JOB_KEY = "nba-static-team-stats";
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
  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-StaticTeamStats" };
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

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  let teams = [];
  let fetchError = null;
  let meta = null;
  try {
    const r = await fetchFromGithub(env, "nba/data/nba_team_stats_current.json", "nba/data/nba_team_stats_current_meta.json");
    teams = (r.file.teams || []).filter(t => t && t.team_id);
    meta = r.meta;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (teams.length === 0) {
    await sql.end();
    return { ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, status: "failed_no_data", error: fetchError || "zero_teams", elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
  }

  const sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  let written = 0;
  for (const t of teams) {
    const teamId = `nba_${t.team_id}`;
    await sql`
      INSERT INTO nba_team.season_profile (team_id, nba_team_id, season, games_played, wins, losses, pace, off_rating, def_rating, net_rating, source_key, data_quality, raw_json, updated_at)
      VALUES (${teamId}, ${t.team_id}, '2025-26', ${t.gp}, ${t.w}, ${t.l}, ${t.pace}, ${t.off_rating}, ${t.def_rating}, ${t.net_rating}, ${sourceKey}, 'real', ${JSON.stringify(t).slice(0, 2000)}, now())
      ON CONFLICT (team_id) DO UPDATE SET
        season=excluded.season, games_played=excluded.games_played, wins=excluded.wins, losses=excluded.losses,
        pace=excluded.pace, off_rating=excluded.off_rating, def_rating=excluded.def_rating, net_rating=excluded.net_rating,
        source_key=excluded.source_key, data_quality=excluded.data_quality, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }

  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_team.season_profile`;
  await sql.end();
  const certified = written === 30;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: certified ? "completed" : "completed_with_warning",
    rows_read: teams.length, rows_written: written, source_key: sourceKey, scraper_fetched_at: meta ? meta.fetched_at : null,
    final_counts: { nba_team_season_profile_rows: Number(total[0]?.c || 0) },
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
