import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-tracking-detail";
const VERSION = "alphadog-v2-nba-static-tracking-detail-v0.1.0";
const JOB_KEY = "nba-static-tracking-detail";
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
  const headers = { "User-Agent": "Alphadog-NBA-StaticTrackingDetail" };
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
  let records = [];
  let fetchError = null;
  let meta = null;
  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_tracking_detail_current.json", "nba/data/nba_tracking_detail_current_meta.json");
    records = (r.file.records || []).filter(rec => rec && rec.player_id && rec.measure_type);
    meta = r.meta;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (records.length === 0) {
    await sql.end();
    return { ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, status: "failed_no_data", error: fetchError || "zero_records", elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
  }

  const sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  let written = 0;
  for (const rec of records) {
    const playerId = `nba_${rec.player_id}`;
    await sql`
      INSERT INTO nba_stats.player_tracking_detail (player_id, measure_type, metrics, source_key, data_quality, updated_at)
      VALUES (${playerId}, ${rec.measure_type}, ${JSON.stringify(rec.metrics || {})}, ${sourceKey}, 'real', now())
      ON CONFLICT (player_id, measure_type) DO UPDATE SET
        metrics=excluded.metrics, source_key=excluded.source_key, data_quality=excluded.data_quality, updated_at=now()
    `;
    written += 1;
  }

  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_tracking_detail`;
  const byType = await sql`SELECT measure_type, COUNT(*)::int AS c FROM nba_stats.player_tracking_detail GROUP BY measure_type ORDER BY measure_type`;
  await sql.end();
  const certified = written >= 4000;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: certified ? "completed" : "completed_with_warning",
    rows_read: records.length, rows_written: written, source_key: sourceKey, scraper_fetched_at: meta ? meta.fetched_at : null,
    final_counts: { nba_stats_player_tracking_detail_rows: Number(total[0]?.c || 0), by_measure_type: byType },
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
