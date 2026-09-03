import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-static-backfill";
const VERSION = "alphadog-v2-nba-static-backfill-v0.1.0";
const JOB_KEY = "nba-static-backfill";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const BATCH_SIZE = 500;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }
function toIntOrNull(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }

async function fetchFromGithubRaw(env, path, metaPath) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "User-Agent": "Alphadog-NBA-StaticBackfill" };
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

async function upsertPlayerGameLogs(sql, records, sourceKey) {
  let written = 0;
  const rows = records
    .filter(r => r.PLAYER_ID && r.GAME_ID)
    .map(r => ({
      player_id: `nba_${r.PLAYER_ID}`, nba_player_id: r.PLAYER_ID, game_id: r.GAME_ID, season: "2025-26",
      team_id: r.TEAM_ID ? `nba_${r.TEAM_ID}` : null, game_date: r.GAME_DATE, matchup: r.MATCHUP, wl: r.WL,
      min: r.MIN, fgm: r.FGM, fga: r.FGA, fg_pct: r.FG_PCT, fg3m: r.FG3M, fg3a: r.FG3A, fg3_pct: r.FG3_PCT,
      ftm: r.FTM, fta: r.FTA, ft_pct: r.FT_PCT, oreb: r.OREB, dreb: r.DREB, reb: r.REB, ast: r.AST,
      tov: r.TOV, stl: r.STL, blk: r.BLK, blka: r.BLKA, pf: r.PF, pfd: r.PFD, pts: r.PTS,
      plus_minus: r.PLUS_MINUS, nba_fantasy_pts: r.NBA_FANTASY_PTS, dd2: toIntOrNull(r.DD2), td3: toIntOrNull(r.TD3),
      source_key: sourceKey,
    }));

  for (const batch of chunk(rows, BATCH_SIZE)) {
    await sql`
      INSERT INTO nba_stats.player_game_log ${sql(batch, "player_id", "nba_player_id", "game_id", "season", "team_id", "game_date", "matchup", "wl", "min", "fgm", "fga", "fg_pct", "fg3m", "fg3a", "fg3_pct", "ftm", "fta", "ft_pct", "oreb", "dreb", "reb", "ast", "tov", "stl", "blk", "blka", "pf", "pfd", "pts", "plus_minus", "nba_fantasy_pts", "dd2", "td3", "source_key")}
      ON CONFLICT (player_id, game_id) DO UPDATE SET
        team_id=excluded.team_id, game_date=excluded.game_date, matchup=excluded.matchup, wl=excluded.wl,
        min=excluded.min, fgm=excluded.fgm, fga=excluded.fga, fg_pct=excluded.fg_pct, fg3m=excluded.fg3m,
        fg3a=excluded.fg3a, fg3_pct=excluded.fg3_pct, ftm=excluded.ftm, fta=excluded.fta, ft_pct=excluded.ft_pct,
        oreb=excluded.oreb, dreb=excluded.dreb, reb=excluded.reb, ast=excluded.ast, tov=excluded.tov,
        stl=excluded.stl, blk=excluded.blk, blka=excluded.blka, pf=excluded.pf, pfd=excluded.pfd, pts=excluded.pts,
        plus_minus=excluded.plus_minus, nba_fantasy_pts=excluded.nba_fantasy_pts, dd2=excluded.dd2, td3=excluded.td3,
        source_key=excluded.source_key, updated_at=now()
    `;
    written += batch.length;
  }
  return written;
}

async function upsertTeamGameLogs(sql, records, sourceKey) {
  let written = 0;
  const rows = records
    .filter(r => r.TEAM_ID && r.GAME_ID)
    .map(r => ({
      team_id: `nba_${r.TEAM_ID}`, nba_team_id: r.TEAM_ID, game_id: r.GAME_ID, season: "2025-26",
      game_date: r.GAME_DATE, matchup: r.MATCHUP, wl: r.WL, min: r.MIN, fgm: r.FGM, fga: r.FGA, fg_pct: r.FG_PCT,
      fg3m: r.FG3M, fg3a: r.FG3A, fg3_pct: r.FG3_PCT, ftm: r.FTM, fta: r.FTA, ft_pct: r.FT_PCT,
      oreb: r.OREB, dreb: r.DREB, reb: r.REB, ast: r.AST, tov: r.TOV, stl: r.STL, blk: r.BLK, pf: r.PF,
      pts: r.PTS, plus_minus: r.PLUS_MINUS, source_key: sourceKey,
    }));

  for (const batch of chunk(rows, BATCH_SIZE)) {
    await sql`
      INSERT INTO nba_team.team_game_log ${sql(batch, "team_id", "nba_team_id", "game_id", "season", "game_date", "matchup", "wl", "min", "fgm", "fga", "fg_pct", "fg3m", "fg3a", "fg3_pct", "ftm", "fta", "ft_pct", "oreb", "dreb", "reb", "ast", "tov", "stl", "blk", "pf", "pts", "plus_minus", "source_key")}
      ON CONFLICT (team_id, game_id) DO UPDATE SET
        game_date=excluded.game_date, matchup=excluded.matchup, wl=excluded.wl, min=excluded.min,
        fgm=excluded.fgm, fga=excluded.fga, fg_pct=excluded.fg_pct, fg3m=excluded.fg3m, fg3a=excluded.fg3a,
        fg3_pct=excluded.fg3_pct, ftm=excluded.ftm, fta=excluded.fta, ft_pct=excluded.ft_pct, oreb=excluded.oreb,
        dreb=excluded.dreb, reb=excluded.reb, ast=excluded.ast, tov=excluded.tov, stl=excluded.stl,
        blk=excluded.blk, pf=excluded.pf, pts=excluded.pts, plus_minus=excluded.plus_minus,
        source_key=excluded.source_key, updated_at=now()
    `;
    written += batch.length;
  }
  return written;
}

async function upsertCareerTotals(sql, rows, sourceKey) {
  let written = 0;
  const recs = rows
    .filter(r => r.PLAYER_ID && r.SEASON_ID && r.TEAM_ID !== undefined && r.TEAM_ID !== null)
    .map(r => ({
      player_id: `nba_${r.PLAYER_ID}`, nba_player_id: r.PLAYER_ID, season_id: r.SEASON_ID,
      team_id: r.TEAM_ID ? `nba_${r.TEAM_ID}` : "nba_0", player_age: r.PLAYER_AGE,
      gp: toIntOrNull(r.GP), gs: toIntOrNull(r.GS), min: r.MIN, fgm: r.FGM, fga: r.FGA, fg_pct: r.FG_PCT,
      fg3m: r.FG3M, fg3a: r.FG3A, fg3_pct: r.FG3_PCT, ftm: r.FTM, fta: r.FTA, ft_pct: r.FT_PCT,
      oreb: r.OREB, dreb: r.DREB, reb: r.REB, ast: r.AST, stl: r.STL, blk: r.BLK, tov: r.TOV, pf: r.PF, pts: r.PTS,
      source_key: sourceKey, raw_json: JSON.stringify(r).slice(0, 1500),
    }));

  for (const batch of chunk(recs, BATCH_SIZE)) {
    await sql`
      INSERT INTO nba_stats.player_career_season_totals ${sql(batch, "player_id", "nba_player_id", "season_id", "team_id", "player_age", "gp", "gs", "min", "fgm", "fga", "fg_pct", "fg3m", "fg3a", "fg3_pct", "ftm", "fta", "ft_pct", "oreb", "dreb", "reb", "ast", "stl", "blk", "tov", "pf", "pts", "source_key", "raw_json")}
      ON CONFLICT (player_id, season_id, team_id) DO UPDATE SET
        player_age=excluded.player_age, gp=excluded.gp, gs=excluded.gs, min=excluded.min, fgm=excluded.fgm,
        fga=excluded.fga, fg_pct=excluded.fg_pct, fg3m=excluded.fg3m, fg3a=excluded.fg3a, fg3_pct=excluded.fg3_pct,
        ftm=excluded.ftm, fta=excluded.fta, ft_pct=excluded.ft_pct, oreb=excluded.oreb, dreb=excluded.dreb,
        reb=excluded.reb, ast=excluded.ast, stl=excluded.stl, blk=excluded.blk, tov=excluded.tov, pf=excluded.pf,
        pts=excluded.pts, source_key=excluded.source_key, raw_json=excluded.raw_json, updated_at=now()
    `;
    written += batch.length;
  }
  return written;
}

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  const sourceKey = "NBA_GITHUB_COMMITTED_ONETIME_BACKFILL";
  const errors = [];
  let playerLogWritten = 0, teamLogWritten = 0, careerWritten = 0;

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_player_game_log_2025_26.json", "nba/data/nba_player_game_log_2025_26_meta.json");
    playerLogWritten = await upsertPlayerGameLogs(sql, r.file.records || [], sourceKey);
  } catch (err) { errors.push(`player_game_log_failed: ${String(err && err.message ? err.message : err)}`); }

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_team_game_log_2025_26.json", "nba/data/nba_team_game_log_2025_26_meta.json");
    teamLogWritten = await upsertTeamGameLogs(sql, r.file.records || [], sourceKey);
  } catch (err) { errors.push(`team_game_log_failed: ${String(err && err.message ? err.message : err)}`); }

  try {
    const r = await fetchFromGithubRaw(env, "nba/data/nba_player_career_totals.json", "nba/data/nba_player_career_totals_meta.json");
    careerWritten = await upsertCareerTotals(sql, r.file.rows || [], sourceKey);
  } catch (err) { errors.push(`career_totals_failed: ${String(err && err.message ? err.message : err)}`); }

  const playerLogTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_game_log`;
  const teamLogTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_team.team_game_log`;
  const careerTotal = await sql`SELECT COUNT(*)::int AS c FROM nba_stats.player_career_season_totals`;
  await sql.end();

  const certified = errors.length === 0 && playerLogWritten > 20000 && teamLogWritten === 2460;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: errors.length === 0 ? "completed" : "completed_with_errors",
    errors: errors.length ? errors : null,
    player_game_log_rows_written: playerLogWritten, team_game_log_rows_written: teamLogWritten,
    career_totals_rows_written: careerWritten, source_key: sourceKey,
    final_counts: {
      nba_stats_player_game_log_rows: Number(playerLogTotal[0]?.c || 0),
      nba_team_team_game_log_rows: Number(teamLogTotal[0]?.c || 0),
      nba_stats_player_career_season_totals_rows: Number(careerTotal[0]?.c || 0),
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
