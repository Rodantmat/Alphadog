import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-starter-status";
const VERSION = "alphadog-v2-nba-static-starter-status-v0.1.0";
const JOB_KEY = "nba-static-starter-status";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const BATCH_SIZE = 500;

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
  const headers = { "User-Agent": "Alphadog-NBA-StaticStarterStatus" };
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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  const sourceKey = "NBA_GITHUB_COMMITTED_ONETIME_BACKFILL_V3";
  let written = 0;
  let error = null;
  let meta = null;

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_starter_status_2025_26.json", "nba/data/nba_starter_status_2025_26_meta.json");
    meta = r.meta;
    const rows = (r.file.rows || [])
      .filter(x => x && x.player_id && x.game_id)
      .map(x => ({
        player_id: `nba_${x.player_id}`, game_id: x.game_id, start_position: x.start_position,
        is_starter: x.is_starter, comment: x.comment, source_key: sourceKey,
      }));

    for (const batch of chunk(rows, BATCH_SIZE)) {
      await sql`
        INSERT INTO nba_stats.player_game_starter_status ${sql(batch, "player_id", "game_id", "start_position", "is_starter", "comment", "source_key")}
        ON CONFLICT (player_id, game_id) DO UPDATE SET
          start_position=excluded.start_position, is_starter=excluded.is_starter,
          comment=excluded.comment, source_key=excluded.source_key, updated_at=now()
      `;
      written += batch.length;
    }
  } catch (err) {
    error = String(err && err.message ? err.message : err);
  }

  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_game_starter_status`;
  const starterTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_game_starter_status WHERE is_starter = 1`;
  await sql.end();

  const certified = !error && written > 30000;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: error ? "failed" : "completed",
    error, rows_written: written, source_key: sourceKey, scraper_fetched_at: meta ? meta.fetched_at : null,
    final_counts: { nba_stats_player_game_starter_status_rows: Number(total[0]?.c || 0), starter_rows: Number(starterTotal[0]?.c || 0) },
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
