import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-lineups";
const VERSION = "alphadog-v2-nba-static-lineups-v0.1.0";
const JOB_KEY = "nba-static-lineups";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const BATCH_SIZE = 500;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }
function toIntOrNull(v) { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }

async function fetchFromGithubRaw(env, path, metaPath) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "User-Agent": "Alphadog-NBA-StaticLineups" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
  const rawUrl = (p) => `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`;
  const [dataResp, metaResp] = await Promise.all([fetch(rawUrl(path), { headers }), fetch(rawUrl(metaPath), { headers })]);
  if (!dataResp.ok) throw new Error(`github_raw_read_failed_http_${dataResp.status}:${(await dataResp.text()).slice(0, 200)}`);
  const file = await dataResp.json();
  let meta = null;
  if (metaResp.ok) { try { meta = await metaResp.json(); } catch (_) {} }
  if (meta && meta.errors && meta.errors.length === 4) throw new Error(`last_committed_scrape_all_failed`);
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
  const sourceKey = "NBA_GITHUB_COMMITTED_STATS_NBA_SCRAPE";
  let written = 0;
  let error = null;
  let meta = null;
  let season = null;

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_lineup_profile.json", "nba/data/nba_lineup_profile_meta.json");
    meta = r.meta;
    season = r.file.season;
    const rows = (r.file.rows || [])
      .filter(x => x && x.group_id && x.group_quantity)
      .map(x => ({
        group_quantity: toIntOrNull(x.group_quantity), group_id: x.group_id,
        player_ids: "{" + (x.player_ids || []).map(p => `nba_${p}`).join(",") + "}", group_name: x.group_name,
        team_id: x.team_id ? `nba_${x.team_id}` : null, season,
        gp: toIntOrNull(x.gp), w: toIntOrNull(x.w), l: toIntOrNull(x.l), w_pct: x.w_pct, min: x.min,
        fgm: x.fgm, fga: x.fga, fg_pct: x.fg_pct, fg3m: x.fg3m, fg3a: x.fg3a, fg3_pct: x.fg3_pct,
        ftm: x.ftm, fta: x.fta, ft_pct: x.ft_pct, oreb: x.oreb, dreb: x.dreb, reb: x.reb,
        ast: x.ast, tov: x.tov, stl: x.stl, blk: x.blk, blka: x.blka, pf: x.pf, pfd: x.pfd,
        pts: x.pts, plus_minus: x.plus_minus, source_key: sourceKey,
      }));

    for (const batch of chunk(rows, BATCH_SIZE)) {
      await sql`
        INSERT INTO nba_team.lineup_profile ${sql(batch, "group_quantity", "group_id", "player_ids", "group_name", "team_id", "season", "gp", "w", "l", "w_pct", "min", "fgm", "fga", "fg_pct", "fg3m", "fg3a", "fg3_pct", "ftm", "fta", "ft_pct", "oreb", "dreb", "reb", "ast", "tov", "stl", "blk", "blka", "pf", "pfd", "pts", "plus_minus", "source_key")}
        ON CONFLICT (group_quantity, group_id, season) DO UPDATE SET
          player_ids=excluded.player_ids, group_name=excluded.group_name, team_id=excluded.team_id,
          gp=excluded.gp, w=excluded.w, l=excluded.l, w_pct=excluded.w_pct, min=excluded.min,
          fgm=excluded.fgm, fga=excluded.fga, fg_pct=excluded.fg_pct, fg3m=excluded.fg3m, fg3a=excluded.fg3a,
          fg3_pct=excluded.fg3_pct, ftm=excluded.ftm, fta=excluded.fta, ft_pct=excluded.ft_pct,
          oreb=excluded.oreb, dreb=excluded.dreb, reb=excluded.reb, ast=excluded.ast, tov=excluded.tov,
          stl=excluded.stl, blk=excluded.blk, blka=excluded.blka, pf=excluded.pf, pfd=excluded.pfd,
          pts=excluded.pts, plus_minus=excluded.plus_minus, source_key=excluded.source_key, updated_at=now()
      `;
      written += batch.length;
    }
  } catch (err) {
    error = String(err && err.message ? err.message : err);
  }

  const total = await sql`SELECT COUNT(*)::int AS c FROM nba_team.lineup_profile`;
  const byQty = await sql`SELECT group_quantity, COUNT(*)::int AS c FROM nba_team.lineup_profile GROUP BY group_quantity ORDER BY group_quantity`;
  await sql.end();

  const certified = !error && written > 0;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: error ? "failed" : "completed",
    error, rows_written: written, source_key: sourceKey, season, scraper_fetched_at: meta ? meta.fetched_at : null,
    final_counts: { nba_team_lineup_profile_rows: Number(total[0]?.c || 0), by_group_quantity: byQty },
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
