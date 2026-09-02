import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-darko";
const VERSION = "alphadog-v2-nba-static-darko-v0.1.0";
const JOB_KEY = "nba-static-darko";
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
  const headers = { "Accept": "application/vnd.github+json", "User-Agent": "Alphadog-NBA-StaticDarko" };
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
  let players = [];
  let fetchError = null;
  let meta = null;
  try {
    const r = await fetchFromGithub(env, "nba/data/nba_darko_current.json", "nba/data/nba_darko_current_meta.json");
    players = (r.file.players || []).filter(p => p && p.player_id);
    meta = r.meta;
  } catch (err) {
    fetchError = String(err && err.message ? err.message : err);
  }

  if (players.length === 0) {
    await sql.end();
    return { ok: false, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY, status: "failed_no_data", error: fetchError || "zero_players", elapsed_ms: Date.now() - started, timestamp_utc: nowUtc() };
  }

  const sourceKey = "DARKO_APP_GITHUB_COMMITTED_SCRAPE";
  let written = 0;
  for (const p of players) {
    const playerId = `nba_${p.player_id}`;
    await sql`
      INSERT INTO nba_stats.player_impact_rating (player_id, nba_player_id, source_key, dpm, o_dpm, d_dpm, box_dpm, on_off_dpm, rank, data_quality, raw_json, updated_at)
      VALUES (${playerId}, ${p.player_id}, ${sourceKey}, ${p.dpm}, ${p.o_dpm}, ${p.d_dpm}, ${p.box_dpm}, ${p.on_off_dpm}, ${p.rank}, 'real', ${JSON.stringify(p).slice(0, 1500)}, now())
      ON CONFLICT (player_id) DO UPDATE SET
        source_key=excluded.source_key, dpm=excluded.dpm, o_dpm=excluded.o_dpm, d_dpm=excluded.d_dpm,
        box_dpm=excluded.box_dpm, on_off_dpm=excluded.on_off_dpm, rank=excluded.rank,
        data_quality=excluded.data_quality, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += 1;
  }

  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_impact_rating`;
  await sql.end();
  const certified = written >= 400;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: certified ? "completed" : "completed_with_warning",
    rows_read: players.length, rows_written: written, source_key: sourceKey, scraper_fetched_at: meta ? meta.fetched_at : null,
    final_counts: { nba_stats_player_impact_rating_rows: Number(total[0]?.c || 0) },
    // Generic "player_impact_rating" abstraction per Gemini's recommendation (2026-09-01) -
    // sourced from DARKO today, swappable later if DARKO ever disappears (single-maintainer
    // "bus factor" risk, flagged in nba/NBA_ENRICHMENT_FACTORS_RESEARCH.md).
    note: "Source: DARKO DPM (darko.app, free/public, rated best predictive catch-all metric by NBA analysts). Table is a generic player_impact_rating abstraction, not hard-wired to DARKO specifically.",
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
