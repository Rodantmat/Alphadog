import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-onoff";
const VERSION = "alphadog-v2-nba-static-onoff-v0.1.0";
const JOB_KEY = "nba-static-onoff";
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
  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-StaticOnOff" };
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
  let rows = [];
  let fetchError = null;
  let meta = null;
  try {
    const r = await fetchFromGithub(env, "nba/data/nba_onoff_current.json", "nba/data/nba_onoff_current_meta.json");
    rows = (r.file.players || []).filter(p => p && p.player_id && p.team_id);
    meta = r.meta;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (rows.length === 0) {
    await sql.end();
    return { ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, status: "failed_no_data", error: fetchError || "zero_rows", elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
  }

  const sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  let written = 0;
  // A player who changed teams mid-season appears once per team in the source; keep the row
  // from their CURRENT team (per nba_ref.players.team_id) when duplicates exist, since
  // player_id is the primary key here - most recent team is the most decision-relevant context.
  const currentTeams = await sql`SELECT player_id, team_id FROM nba_ref.players`;
  const currentTeamByPlayer = new Map(currentTeams.map(r => [String(r.player_id), r.team_id]));

  const byPlayer = new Map();
  for (const row of rows) {
    const playerId = `nba_${row.player_id}`;
    const rowTeamId = `nba_${row.team_id}`;
    const preferredTeam = currentTeamByPlayer.get(playerId);
    const existing = byPlayer.get(playerId);
    if (!existing || (preferredTeam && rowTeamId === preferredTeam)) {
      byPlayer.set(playerId, { ...row, playerId, rowTeamId });
    }
  }

  for (const row of byPlayer.values()) {
    await sql`
      INSERT INTO nba_stats.player_onoff_profile (player_id, nba_player_id, team_id, season, net_rating_on, net_rating_off, net_rating_diff, off_rating_on, off_rating_off, def_rating_on, def_rating_off, source_key, data_quality, raw_json, updated_at)
      VALUES (${row.playerId}, ${row.player_id}, ${row.rowTeamId}, '2025-26', ${row.net_rating_on}, ${row.net_rating_off}, ${row.net_rating_diff}, ${row.off_rating_on}, ${row.off_rating_off}, ${row.def_rating_on}, ${row.def_rating_off}, ${sourceKey}, 'real', ${JSON.stringify(row).slice(0, 1500)}, now())
      ON CONFLICT (player_id) DO UPDATE SET
        team_id=excluded.team_id, season=excluded.season, net_rating_on=excluded.net_rating_on, net_rating_off=excluded.net_rating_off,
        net_rating_diff=excluded.net_rating_diff, off_rating_on=excluded.off_rating_on, off_rating_off=excluded.off_rating_off,
        def_rating_on=excluded.def_rating_on, def_rating_off=excluded.def_rating_off, source_key=excluded.source_key,
        data_quality=excluded.data_quality, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }

  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_onoff_profile`;
  await sql.end();
  const certified = written >= 400;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: certified ? "completed" : "completed_with_warning",
    rows_read: rows.length, distinct_players_written: written, source_key: sourceKey, scraper_fetched_at: meta ? meta.fetched_at : null,
    final_counts: { nba_stats_player_onoff_profile_rows: Number(total[0]?.c || 0) },
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
