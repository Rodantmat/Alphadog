import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-playtypes";
const VERSION = "alphadog-v2-nba-static-playtypes-v0.1.0";
const JOB_KEY = "nba-static-playtypes";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }

async function fetchFromGithubRaw(env, path, metaPath) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "User-Agent": "Alphadog-NBA-StaticPlaytypes" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
  const rawUrl = (p) => `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`;
  const [dataResp, metaResp] = await Promise.all([fetch(rawUrl(path), { headers }), fetch(rawUrl(metaPath), { headers })]);
  if (!dataResp.ok) throw new Error(`github_raw_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);
  const file = await dataResp.json();
  let meta = null;
  if (metaResp.ok) { try { meta = await metaResp.json(); } catch (_) {} }
  if (meta && meta.error) throw new Error(`last_committed_scrape_failed: ${meta.error}`);
  return { file, meta };
}

async function upsertPlayerPlaytypes(sql, records, sourceKey) {
  let written = 0;
  for (const r of records) {
    if (!r.player_id || !r.play_type) continue;
    const playerId = `nba_${r.player_id}`;
    const grouping = r.type_grouping || "Offensive";
    await sql`
      INSERT INTO nba_stats.player_playtype_profile (player_id, nba_player_id, play_type, type_grouping, gp, poss_pct, ppp, fg_pct, efg_pct, poss, pts, percentile, source_key, data_quality, raw_json, updated_at)
      VALUES (${playerId}, ${r.player_id}, ${r.play_type}, ${grouping}, ${r.gp}, ${r.poss_pct}, ${r.ppp}, ${r.fg_pct}, ${r.efg_pct}, ${r.poss}, ${r.pts}, ${r.percentile}, ${sourceKey}, 'real', ${JSON.stringify(r).slice(0, 1000)}, now())
      ON CONFLICT (player_id, play_type, type_grouping) DO UPDATE SET
        gp=excluded.gp, poss_pct=excluded.poss_pct, ppp=excluded.ppp, fg_pct=excluded.fg_pct, efg_pct=excluded.efg_pct,
        poss=excluded.poss, pts=excluded.pts, percentile=excluded.percentile, source_key=excluded.source_key,
        data_quality=excluded.data_quality, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }
  return written;
}

async function upsertTeamPlaytypes(sql, records, sourceKey) {
  let written = 0;
  for (const r of records) {
    if (!r.team_id || !r.play_type) continue;
    const teamId = `nba_${r.team_id}`;
    const grouping = r.type_grouping || "Offensive";
    await sql`
      INSERT INTO nba_team.playtype_profile (team_id, nba_team_id, play_type, type_grouping, gp, poss_pct, ppp, fg_pct, efg_pct, poss, pts, percentile, source_key, data_quality, raw_json, updated_at)
      VALUES (${teamId}, ${r.team_id}, ${r.play_type}, ${grouping}, ${r.gp}, ${r.poss_pct}, ${r.ppp}, ${r.fg_pct}, ${r.efg_pct}, ${r.poss}, ${r.pts}, ${r.percentile}, ${sourceKey}, 'real', ${JSON.stringify(r).slice(0, 1000)}, now())
      ON CONFLICT (team_id, play_type, type_grouping) DO UPDATE SET
        gp=excluded.gp, poss_pct=excluded.poss_pct, ppp=excluded.ppp, fg_pct=excluded.fg_pct, efg_pct=excluded.efg_pct,
        poss=excluded.poss, pts=excluded.pts, percentile=excluded.percentile, source_key=excluded.source_key,
        data_quality=excluded.data_quality, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }
  return written;
}

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  const sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  const errors = [];
  let playerWritten = 0;
  let teamWritten = 0;
  let playerMeta = null;
  let teamMeta = null;

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_playtypes_player_current.json", "nba/data/nba_playtypes_player_current_meta.json");
    playerWritten = await upsertPlayerPlaytypes(sql, r.file.records || [], sourceKey);
    playerMeta = r.meta;
  } catch (err) { errors.push(`player_playtypes_failed: ${String(err && err.message ? err.message : err)}`); }

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_playtypes_team_current.json", "nba/data/nba_playtypes_team_current_meta.json");
    teamWritten = await upsertTeamPlaytypes(sql, r.file.records || [], sourceKey);
    teamMeta = r.meta;
  } catch (err) { errors.push(`team_playtypes_failed: ${String(err && err.message ? err.message : err)}`); }

  const playerTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_playtype_profile`;
  const teamTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_team.playtype_profile`;
  await sql.end();

  const certified = errors.length === 0 && playerWritten >= 1000 && teamWritten >= 200;

  return {
    ok: certified,
    version: VERSION,
    worker_name: WORKER_NAME,
    job_key: input.job_key || JOB_KEY,
    status: errors.length === 0 ? "completed" : "completed_with_errors",
    errors: errors.length ? errors : null,
    player_rows_written: playerWritten,
    team_rows_written: teamWritten,
    player_scraper_fetched_at: playerMeta ? playerMeta.fetched_at : null,
    team_scraper_fetched_at: teamMeta ? teamMeta.fetched_at : null,
    source_key: sourceKey,
    final_counts: {
      nba_stats_player_playtype_profile_rows: Number(playerTotal[0]?.c || 0),
      nba_team_playtype_profile_rows: Number(teamTotal[0]?.c || 0)
    },
    elapsed_ms: Date.now() - started,
    timestamp_utc: nowUtc()
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
