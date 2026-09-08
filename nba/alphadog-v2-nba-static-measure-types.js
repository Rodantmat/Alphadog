import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-measure-types";
const VERSION = "alphadog-v2-nba-static-measure-types-v0.1.0";
const JOB_KEY = "nba-static-measure-types";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const BATCH_SIZE = 500;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }

async function fetchFromGithubRaw(env, path) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "User-Agent": "Alphadog-NBA-MeasureTypes" };
  if (env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
  const resp = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, { headers });
  if (!resp.ok) throw new Error(`github_raw_read_failed_http_${resp.status}`);
  return resp.json();
}

function chunk(arr, size) {
  if (!arr || arr.length === 0) return [];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const SCORING_COLS = ["pct_fga_2pt", "pct_fga_3pt", "pct_pts_2pt", "pct_pts_2pt_mr", "pct_pts_3pt", "pct_pts_fb", "pct_pts_ft", "pct_pts_off_tov", "pct_pts_paint", "pct_ast_2pm", "pct_uast_2pm", "pct_ast_3pm", "pct_uast_3pm", "pct_ast_fgm", "pct_uast_fgm"];
const USAGE_COLS = ["usg_pct", "pct_fgm", "pct_fga", "pct_fg3m", "pct_fg3a", "pct_ftm", "pct_fta", "pct_oreb", "pct_dreb", "pct_reb", "pct_ast", "pct_tov", "pct_stl", "pct_blk", "pct_blka", "pct_pf", "pct_pfd", "pct_pts"];
const FF_COLS = ["efg_pct", "fta_rate", "tm_tov_pct", "oreb_pct", "opp_efg_pct", "opp_fta_rate", "opp_tov_pct", "opp_oreb_pct"];

function mapCols(r, cols) {
  const o = {};
  for (const c of cols) o[c] = r[c.toUpperCase()];
  return o;
}

async function upsertPlayerUsage(sql, records, sourceKey) {
  const rows = records.filter(r => r.PLAYER_ID && r.GAME_ID).map(r => ({ player_id: `nba_${r.PLAYER_ID}`, game_id: r.GAME_ID, ...mapCols(r, USAGE_COLS), source_key: sourceKey }));
  let n = 0;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    await sql`INSERT INTO nba_stats.player_game_log_usage ${sql(batch, "player_id", "game_id", ...USAGE_COLS, "source_key")}
      ON CONFLICT (player_id, game_id) DO UPDATE SET
        usg_pct=excluded.usg_pct, pct_fgm=excluded.pct_fgm, pct_fga=excluded.pct_fga, pct_fg3m=excluded.pct_fg3m, pct_fg3a=excluded.pct_fg3a,
        pct_ftm=excluded.pct_ftm, pct_fta=excluded.pct_fta, pct_oreb=excluded.pct_oreb, pct_dreb=excluded.pct_dreb, pct_reb=excluded.pct_reb,
        pct_ast=excluded.pct_ast, pct_tov=excluded.pct_tov, pct_stl=excluded.pct_stl, pct_blk=excluded.pct_blk, pct_blka=excluded.pct_blka,
        pct_pf=excluded.pct_pf, pct_pfd=excluded.pct_pfd, pct_pts=excluded.pct_pts, source_key=excluded.source_key, updated_at=now()`;
    n += batch.length;
  }
  return n;
}

async function upsertScoring(sql, table, idCol, idPrefix, idField, records, sourceKey) {
  const rows = records.filter(r => r[idField] && r.GAME_ID).map(r => ({ [idCol]: `${idPrefix}${r[idField]}`, game_id: r.GAME_ID, ...mapCols(r, SCORING_COLS), source_key: sourceKey }));
  let n = 0;
  const setClause = SCORING_COLS.map(c => `${c}=excluded.${c}`).join(", ");
  for (const batch of chunk(rows, BATCH_SIZE)) {
    if (table === "player") {
      await sql`INSERT INTO nba_stats.player_game_log_scoring ${sql(batch, "player_id", "game_id", ...SCORING_COLS, "source_key")}
        ON CONFLICT (player_id, game_id) DO UPDATE SET ${sql.unsafe(setClause)}, source_key=excluded.source_key, updated_at=now()`;
    } else {
      await sql`INSERT INTO nba_team.team_game_log_scoring ${sql(batch, "team_id", "game_id", ...SCORING_COLS, "source_key")}
        ON CONFLICT (team_id, game_id) DO UPDATE SET ${sql.unsafe(setClause)}, source_key=excluded.source_key, updated_at=now()`;
    }
    n += batch.length;
  }
  return n;
}

async function upsertTeamFourFactors(sql, records, sourceKey) {
  const rows = records.filter(r => r.TEAM_ID && r.GAME_ID).map(r => ({ team_id: `nba_${r.TEAM_ID}`, game_id: r.GAME_ID, ...mapCols(r, FF_COLS), source_key: sourceKey }));
  let n = 0;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    await sql`INSERT INTO nba_team.team_game_log_four_factors ${sql(batch, "team_id", "game_id", ...FF_COLS, "source_key")}
      ON CONFLICT (team_id, game_id) DO UPDATE SET
        efg_pct=excluded.efg_pct, fta_rate=excluded.fta_rate, tm_tov_pct=excluded.tm_tov_pct, oreb_pct=excluded.oreb_pct,
        opp_efg_pct=excluded.opp_efg_pct, opp_fta_rate=excluded.opp_fta_rate, opp_tov_pct=excluded.opp_tov_pct, opp_oreb_pct=excluded.opp_oreb_pct,
        source_key=excluded.source_key, updated_at=now()`;
    n += batch.length;
  }
  return n;
}

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  const sourceKey = input.source_key || "NBA_GITHUB_COMMITTED_MEASURE_TYPES_BACKFILL";
  const prefix = input.file_prefix || "nba/data/nba_backfill_";
  const errors = [];
  const written = {};

  const jobs = [
    ["player_usage", async (recs) => upsertPlayerUsage(sql, recs, sourceKey)],
    ["player_scoring", async (recs) => upsertScoring(sql, "player", "player_id", "nba_", "PLAYER_ID", recs, sourceKey)],
    ["team_scoring", async (recs) => upsertScoring(sql, "team", "team_id", "nba_", "TEAM_ID", recs, sourceKey)],
    ["team_four_factors", async (recs) => upsertTeamFourFactors(sql, recs, sourceKey)],
  ];
  for (const [key, fn] of jobs) {
    try {
      const f = await fetchFromGithubRaw(env, `${prefix}${key}.json`);
      written[key] = await fn(f.records || []);
    } catch (err) { errors.push(`${key}: ${String(err && err.message ? err.message : err)}`); }
  }

  const counts = {
    player_usage: Number((await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_game_log_usage`)[0]?.c || 0),
    player_scoring: Number((await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_game_log_scoring`)[0]?.c || 0),
    team_scoring: Number((await sql`SELECT COUNT(*)::int AS c FROM nba_team.team_game_log_scoring`)[0]?.c || 0),
    team_four_factors: Number((await sql`SELECT COUNT(*)::int AS c FROM nba_team.team_game_log_four_factors`)[0]?.c || 0),
  };
  await sql.end();

  return {
    ok: errors.length === 0, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: errors.length === 0 ? "completed" : "completed_with_errors", errors: errors.length ? errors : null,
    rows_written: written, final_counts: counts, source_key: sourceKey,
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
