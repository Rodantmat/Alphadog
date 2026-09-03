import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-shotquality";
const VERSION = "alphadog-v2-nba-static-shotquality-v0.1.0";
const JOB_KEY = "nba-static-shotquality";
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
  const headers = { "User-Agent": "Alphadog-NBA-StaticShotQuality" };
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

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  const sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  const errors = [];
  let bucketWritten = 0, deltaWritten = 0, zoneWritten = 0;
  let bucketMeta = null, deltaMeta = null, zoneMeta = null;

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_shotquality_current.json", "nba/data/nba_shotquality_current_meta.json");
    const rows = (r.file.rows || []).filter(x => x && x.player_id && x.close_def_dist_range);
    bucketMeta = r.meta;
    for (const row of rows) {
      const playerId = `nba_${row.player_id}`;
      await sql`
        INSERT INTO nba_stats.player_shot_quality (player_id, close_def_dist_range, fga_frequency, fgm, fga, fg_pct, efg_pct, fg3a_frequency, fg3_pct, source_key, data_quality, updated_at)
        VALUES (${playerId}, ${row.close_def_dist_range}, ${row.fga_frequency}, ${row.fgm}, ${row.fga}, ${row.fg_pct}, ${row.efg_pct}, ${row.fg3a_frequency}, ${row.fg3_pct}, ${sourceKey}, 'real', now())
        ON CONFLICT (player_id, close_def_dist_range) DO UPDATE SET
          fga_frequency=excluded.fga_frequency, fgm=excluded.fgm, fga=excluded.fga, fg_pct=excluded.fg_pct,
          efg_pct=excluded.efg_pct, fg3a_frequency=excluded.fg3a_frequency, fg3_pct=excluded.fg3_pct,
          source_key=excluded.source_key, data_quality=excluded.data_quality, updated_at=now()
      `;
      bucketWritten += 1;
    }
  } catch (err) { errors.push(`shot_quality_buckets_failed: ${String(err && err.message ? err.message : err)}`); }

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_shotquality_delta_current.json", "nba/data/nba_shotquality_delta_current_meta.json");
    const deltas = (r.file.deltas || []).filter(x => x && x.player_id);
    deltaMeta = r.meta;
    for (const d of deltas) {
      const playerId = `nba_${d.player_id}`;
      await sql`
        INSERT INTO nba_stats.player_shot_quality_delta (player_id, actual_efg_pct, expected_efg_pct, shot_quality_delta, total_fga, source_key, data_quality, updated_at)
        VALUES (${playerId}, ${d.actual_efg_pct}, ${d.expected_efg_pct}, ${d.shot_quality_delta}, ${d.total_fga}, ${sourceKey}, 'derived', now())
        ON CONFLICT (player_id) DO UPDATE SET
          actual_efg_pct=excluded.actual_efg_pct, expected_efg_pct=excluded.expected_efg_pct,
          shot_quality_delta=excluded.shot_quality_delta, total_fga=excluded.total_fga,
          source_key=excluded.source_key, data_quality=excluded.data_quality, updated_at=now()
      `;
      deltaWritten += 1;
    }
  } catch (err) { errors.push(`shot_quality_delta_failed: ${String(err && err.message ? err.message : err)}`); }

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_shotzones_current.json", "nba/data/nba_shotzones_current_meta.json");
    const records = (r.file.records || []).filter(x => x && x.player_id && x.zone);
    zoneMeta = r.meta;
    for (const z of records) {
      const playerId = `nba_${z.player_id}`;
      await sql`
        INSERT INTO nba_stats.player_shot_zone_profile (player_id, zone, fgm, fga, fg_pct, source_key, data_quality, updated_at)
        VALUES (${playerId}, ${z.zone}, ${z.FGM}, ${z.FGA}, ${z.FG_PCT}, ${sourceKey}, 'real', now())
        ON CONFLICT (player_id, zone) DO UPDATE SET
          fgm=excluded.fgm, fga=excluded.fga, fg_pct=excluded.fg_pct,
          source_key=excluded.source_key, data_quality=excluded.data_quality, updated_at=now()
      `;
      zoneWritten += 1;
    }
  } catch (err) { errors.push(`shot_zones_failed: ${String(err && err.message ? err.message : err)}`); }

  const bucketTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_shot_quality`;
  const deltaTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_shot_quality_delta`;
  const zoneTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_shot_zone_profile`;
  await sql.end();

  const certified = errors.length === 0 && deltaWritten >= 400 && zoneWritten >= 3000;

  return {
    ok: certified,
    version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: errors.length === 0 ? "completed" : "completed_with_errors",
    errors: errors.length ? errors : null,
    bucket_rows_written: bucketWritten, delta_rows_written: deltaWritten, zone_rows_written: zoneWritten,
    scraper_fetched_at: { buckets: bucketMeta ? bucketMeta.fetched_at : null, deltas: deltaMeta ? deltaMeta.fetched_at : null, zones: zoneMeta ? zoneMeta.fetched_at : null },
    source_key: sourceKey,
    final_counts: {
      nba_stats_player_shot_quality_rows: Number(bucketTotal[0]?.c || 0),
      nba_stats_player_shot_quality_delta_rows: Number(deltaTotal[0]?.c || 0),
      nba_stats_player_shot_zone_profile_rows: Number(zoneTotal[0]?.c || 0)
    },
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
