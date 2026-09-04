import postgres from "postgres";

const WORKER_NAME = "alphadog-v2-nba-daily-delta";
const VERSION = "alphadog-v2-nba-daily-delta-v0.1.0";
const JOB_KEY = "nba-daily-delta";
const EXPECTED_VARS = ["SYSTEM_ENV", "SYSTEM_TIMEZONE", "ACTIVE_SPORT", "WORKER_SAFE_MODE", "DEBUG_MODE"];
const BATCH_SIZE = 500;

function nowUtc() { return new Date().toISOString(); }
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function readJsonSafe(request) { try { return await request.json(); } catch { return {}; } }
function pg(env) { return postgres(env.HYPERDRIVE.connectionString, { max: 3, fetch_types: false, prepare: false }); }
function toIntOrNull(v) { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }

async function fetchFromGithubRaw(env, path) {
  const owner = env.GITHUB_OWNER || "Rodantmat";
  const repo = env.GITHUB_REPO || "Alphadog";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = { "User-Agent": "Alphadog-NBA-DailyDelta" };
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

async function upsertPlayerGameLogs(sql, records, sourceKey, season) {
  let written = 0;
  const rows = records.filter(r => r.PLAYER_ID && r.GAME_ID).map(r => ({
    player_id: `nba_${r.PLAYER_ID}`, nba_player_id: r.PLAYER_ID, game_id: r.GAME_ID, season,
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
        stl=excluded.stl, blk=excluded.blk, blka=excluded.blka, pf=excluded.pf, pfd=excluded.pfd,
        pts=excluded.pts, plus_minus=excluded.plus_minus, nba_fantasy_pts=excluded.nba_fantasy_pts,
        dd2=excluded.dd2, td3=excluded.td3, source_key=excluded.source_key, updated_at=now()
    `;
    written += batch.length;
  }
  return written;
}

async function upsertTeamGameLogs(sql, records, sourceKey, season) {
  let written = 0;
  const rows = records.filter(r => r.TEAM_ID && r.GAME_ID).map(r => ({
    team_id: `nba_${r.TEAM_ID}`, nba_team_id: r.TEAM_ID, game_id: r.GAME_ID, season,
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
        fg3_pct=excluded.fg3_pct, ftm=excluded.ftm, fta=excluded.fta, ft_pct=excluded.ft_pct,
        oreb=excluded.oreb, dreb=excluded.dreb, reb=excluded.reb, ast=excluded.ast, tov=excluded.tov,
        stl=excluded.stl, blk=excluded.blk, pf=excluded.pf, pts=excluded.pts, plus_minus=excluded.plus_minus,
        source_key=excluded.source_key, updated_at=now()
    `;
    written += batch.length;
  }
  return written;
}

async function upsertPlayerAdvanced(sql, records, sourceKey) {
  let written = 0;
  const rows = records.filter(r => r.PLAYER_ID && r.GAME_ID).map(r => ({
    player_id: `nba_${r.PLAYER_ID}`, game_id: r.GAME_ID,
    off_rating: r.OFF_RATING, def_rating: r.DEF_RATING, net_rating: r.NET_RATING, pace: r.PACE,
    usg_pct: r.USG_PCT, ts_pct: r.TS_PCT, ast_pct: r.AST_PCT, oreb_pct: r.OREB_PCT, dreb_pct: r.DREB_PCT,
    reb_pct: r.REB_PCT, efg_pct: r.EFG_PCT, source_key: sourceKey,
  }));
  for (const batch of chunk(rows, BATCH_SIZE)) {
    await sql`
      INSERT INTO nba_stats.player_game_log_advanced ${sql(batch, "player_id", "game_id", "off_rating", "def_rating", "net_rating", "pace", "usg_pct", "ts_pct", "ast_pct", "oreb_pct", "dreb_pct", "reb_pct", "efg_pct", "source_key")}
      ON CONFLICT (player_id, game_id) DO UPDATE SET
        off_rating=excluded.off_rating, def_rating=excluded.def_rating, net_rating=excluded.net_rating,
        pace=excluded.pace, usg_pct=excluded.usg_pct, ts_pct=excluded.ts_pct, ast_pct=excluded.ast_pct,
        oreb_pct=excluded.oreb_pct, dreb_pct=excluded.dreb_pct, reb_pct=excluded.reb_pct, efg_pct=excluded.efg_pct,
        source_key=excluded.source_key, updated_at=now()
    `;
    written += batch.length;
  }
  return written;
}

async function upsertTeamAdvanced(sql, records, sourceKey) {
  let written = 0;
  const rows = records.filter(r => r.TEAM_ID && r.GAME_ID).map(r => ({
    team_id: `nba_${r.TEAM_ID}`, game_id: r.GAME_ID,
    off_rating: r.OFF_RATING, def_rating: r.DEF_RATING, net_rating: r.NET_RATING, pace: r.PACE,
    usg_pct: r.USG_PCT, ts_pct: r.TS_PCT, ast_pct: r.AST_PCT, oreb_pct: r.OREB_PCT, dreb_pct: r.DREB_PCT,
    reb_pct: r.REB_PCT, efg_pct: r.EFG_PCT, source_key: sourceKey,
  }));
  for (const batch of chunk(rows, BATCH_SIZE)) {
    await sql`
      INSERT INTO nba_team.team_game_log_advanced ${sql(batch, "team_id", "game_id", "off_rating", "def_rating", "net_rating", "pace", "usg_pct", "ts_pct", "ast_pct", "oreb_pct", "dreb_pct", "reb_pct", "efg_pct", "source_key")}
      ON CONFLICT (team_id, game_id) DO UPDATE SET
        off_rating=excluded.off_rating, def_rating=excluded.def_rating, net_rating=excluded.net_rating,
        pace=excluded.pace, usg_pct=excluded.usg_pct, ts_pct=excluded.ts_pct, ast_pct=excluded.ast_pct,
        oreb_pct=excluded.oreb_pct, dreb_pct=excluded.dreb_pct, reb_pct=excluded.reb_pct, efg_pct=excluded.efg_pct,
        source_key=excluded.source_key, updated_at=now()
    `;
    written += batch.length;
  }
  return written;
}

async function runJob(input, env) {
  const started = Date.now();
  const sql = pg(env);
  const sourceKey = "NBA_GITHUB_COMMITTED_DAILY_DELTA";
  const errors = [];
  let playerWritten = 0, teamWritten = 0, playerAdvWritten = 0, teamAdvWritten = 0;
  let season = null, meta = null;

  try {
    meta = await fetchFromGithubRaw(env, "nba/data/nba_daily_delta_meta.json");
    season = meta.season;
  } catch (err) { errors.push(`meta_read_failed: ${String(err)}`); }

  try {
    const f = await fetchFromGithubRaw(env, "nba/data/nba_delta_player_game_log.json");
    playerWritten = await upsertPlayerGameLogs(sql, f.records || [], sourceKey, f.season || season);
  } catch (err) { errors.push(`player_game_log_failed: ${String(err)}`); }

  try {
    const f = await fetchFromGithubRaw(env, "nba/data/nba_delta_team_game_log.json");
    teamWritten = await upsertTeamGameLogs(sql, f.records || [], sourceKey, f.season || season);
  } catch (err) { errors.push(`team_game_log_failed: ${String(err)}`); }

  try {
    const f = await fetchFromGithubRaw(env, "nba/data/nba_delta_player_game_log_advanced.json");
    playerAdvWritten = await upsertPlayerAdvanced(sql, f.records || [], sourceKey);
  } catch (err) { errors.push(`player_advanced_failed: ${String(err)}`); }

  try {
    const f = await fetchFromGithubRaw(env, "nba/data/nba_delta_team_game_log_advanced.json");
    teamAdvWritten = await upsertTeamAdvanced(sql, f.records || [], sourceKey);
  } catch (err) { errors.push(`team_advanced_failed: ${String(err)}`); }

  // Real completeness check: Final REGULAR SEASON games in the calendar vs games actually
  // present in the log. Uses the GAME_ID prefix convention (002=regular season, 001=preseason,
  // 003=all-star, 004=playoffs, 005=play-in) rather than the free-text game_label field - the
  // label field turned out unreliable for this (Cup group-stage games, Rivals Week, and
  // international showcase games all correctly count as regular season but carry a non-blank
  // label, while blank-label alone undercounted by 81 games). GAME_ID prefix '002' matched the
  // known-correct 1230 regular-season game count for 2025-26 exactly - verified before using it.
  let completeness = null;
  if (season) {
    const calendarFinal = await sql`SELECT COUNT(*)::int AS c FROM nba_calendar.games WHERE season = ${season} AND game_status = 3 AND game_id LIKE '002%'`;
    const loggedGames = await sql`SELECT COUNT(DISTINCT game_id)::int AS c FROM nba_stats.player_game_log WHERE season = ${season}`;
    const missingGames = await sql`
      SELECT g.game_id, g.game_date, g.home_team_tricode, g.away_team_tricode
      FROM nba_calendar.games g
      LEFT JOIN (SELECT DISTINCT game_id FROM nba_stats.player_game_log WHERE season = ${season}) l ON l.game_id = g.game_id
      WHERE g.season = ${season} AND g.game_status = 3 AND g.game_id LIKE '002%' AND l.game_id IS NULL
      ORDER BY g.game_date DESC LIMIT 20
    `;
    completeness = {
      season, calendar_final_games: Number(calendarFinal[0]?.c || 0), logged_games: Number(loggedGames[0]?.c || 0),
      missing_games_sample: missingGames, is_complete: Number(calendarFinal[0]?.c || 0) === Number(loggedGames[0]?.c || 0),
    };

    // Real gap closed (2026-09-04, final coverage pass): this check was designed but never
    // actually implemented until now - identifies logged games that still lack starter-status
    // or officials data, so a follow-up per-game backfill run knows exactly which game_ids to
    // target instead of needing to re-scan the whole season.
    const missingStarterStatus = await sql`
      SELECT g.game_id, g.game_date, g.matchup
      FROM nba_stats.player_game_log g
      LEFT JOIN (SELECT DISTINCT game_id FROM nba_stats.player_game_starter_status) s ON s.game_id = g.game_id
      WHERE g.season = ${season} AND s.game_id IS NULL
      GROUP BY g.game_id, g.game_date, g.matchup
      ORDER BY g.game_date DESC LIMIT 20
    `;
    const missingOfficials = await sql`
      SELECT g.game_id, g.game_date, g.matchup
      FROM nba_stats.player_game_log g
      LEFT JOIN (SELECT DISTINCT game_id FROM nba_stats.game_officials) o ON o.game_id = g.game_id
      WHERE g.season = ${season} AND o.game_id IS NULL
      GROUP BY g.game_id, g.game_date, g.matchup
      ORDER BY g.game_date DESC LIMIT 20
    `;
    completeness.per_game_data_gaps = {
      games_missing_starter_status_sample: missingStarterStatus,
      games_missing_officials_sample: missingOfficials,
      note: "These per-game endpoints (boxscoretraditionalv3/boxscoresummaryv3) are not re-fetched by this worker automatically - this list tells you exactly which game_ids a follow-up per-game backfill run needs to target.",
    };
  }

  await sql.end();

  const certified = errors.length === 0;

  return {
    ok: certified, version: VERSION, worker_name: WORKER_NAME, job_key: input.job_key || JOB_KEY,
    status: errors.length === 0 ? "completed" : "completed_with_errors",
    errors: errors.length ? errors : null, season, source_key: sourceKey,
    rows_written: { player_game_log: playerWritten, team_game_log: teamWritten, player_advanced: playerAdvWritten, team_advanced: teamAdvWritten },
    completeness_check: completeness,
    scraper_fetched_at: meta ? meta.fetched_at : null,
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
