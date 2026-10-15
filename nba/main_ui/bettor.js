// NBA MAIN UI - bettor-facing player depth for the dossier (card tap) and the Player Profile (2026-10-14, owner: "every single
// possible information is there, raw, derived ... not internal factors ... player characteristics, player skills, player form").
// Everything here is public basketball information about the player and the matchup: per-game usage / efficiency / scoring
// mix, tracking skills (passing, rebounding, catch-and-shoot, pull-up, drives, touches), career by season, games against the
// opponent, his numbers with and without each key / injured teammate, his most-used lineups, both teams' recent form and the
// arena. Per-game data is strictly BEFORE the slate date; season-level tables (tracking, career, lineups) carry their season
// or source date so a replayed slate never passes them off as as-of data. No model internals.
import { q, pgArr, num, r1 } from "./common.js";

const p100 = v => (v == null || !Number.isFinite(Number(v)) ? null : r1(Number(v) <= 1.5 ? Number(v) * 100 : Number(v)));
function mean(rows, k) { const v = rows.map(r => num(r[k])).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function sumOf(rows, k) { return rows.reduce((a, r) => a + (num(r[k]) || 0), 0); }
export function normName(s) { return String(s || "").normalize("NFKD").toLowerCase().replace(/[^a-z]/g, ""); }
function flipName(n) { const p = String(n || "").split(", "); return p.length === 2 ? `${p[1]} ${p[0]}` : String(n || ""); }
const teamKey = s => normName(s).replace("losangelesclippers", "laclippers");

// ---- per-game usage, efficiency and scoring mix (regular season + playoffs, before the slate)
export async function perGameDetail(sql, pidT, beforeDate, limit = 100) {
  const rows = await q(sql, `
    WITH g AS (
      (SELECT 'Regular' phase, game_id, game_date, season, min::float min, fga::float fga, fg3a::float fg3a, fta::float fta
         FROM nba_stats.player_game_log WHERE player_id = $1 AND game_date < $2::date AND min > 0
       UNION ALL
       SELECT 'Playoffs', game_id, game_date, season, min::float, fga::float, fg3a::float, fta::float
         FROM nba_stats.player_game_log_postseason WHERE player_id = $1 AND game_date < $2::date AND min > 0)
      ORDER BY game_date DESC LIMIT $3),
    a AS (SELECT game_id, usg_pct, ts_pct, efg_pct, ast_pct, reb_pct, oreb_pct, dreb_pct, pace, off_rating, def_rating FROM nba_stats.player_game_log_advanced WHERE player_id = $1
          UNION ALL SELECT game_id, usg_pct, ts_pct, efg_pct, ast_pct, reb_pct, oreb_pct, dreb_pct, pace, off_rating, def_rating FROM nba_stats.player_game_log_advanced_postseason WHERE player_id = $1),
    u AS (SELECT game_id, pct_pts, pct_reb, pct_ast, pct_fga, pct_fg3a, pct_stl, pct_blk FROM nba_stats.player_game_log_usage WHERE player_id = $1
          UNION ALL SELECT game_id, pct_pts, pct_reb, pct_ast, pct_fga, pct_fg3a, pct_stl, pct_blk FROM nba_stats.player_game_log_usage_postseason WHERE player_id = $1),
    s AS (SELECT game_id, pct_pts_paint, pct_pts_2pt_mr, pct_pts_3pt, pct_pts_ft, pct_pts_fb, pct_pts_off_tov, pct_uast_fgm, pct_fga_3pt FROM nba_stats.player_game_log_scoring WHERE player_id = $1
          UNION ALL SELECT game_id, pct_pts_paint, pct_pts_2pt_mr, pct_pts_3pt, pct_pts_ft, pct_pts_fb, pct_pts_off_tov, pct_uast_fgm, pct_fga_3pt FROM nba_stats.player_game_log_scoring_postseason WHERE player_id = $1)
    SELECT g.phase, g.game_id, g.game_date::text game_date, g.season, g.min, g.fga, g.fg3a, g.fta,
           a.usg_pct::float usg, a.ts_pct::float ts, a.efg_pct::float efg, a.ast_pct::float astp, a.reb_pct::float rebp, a.oreb_pct::float orebp,
           a.dreb_pct::float drebp, a.pace::float pace, a.off_rating::float ortg, a.def_rating::float drtg,
           u.pct_pts::float tm_pts, u.pct_reb::float tm_reb, u.pct_ast::float tm_ast, u.pct_fga::float tm_fga, u.pct_fg3a::float tm_fg3a,
           u.pct_stl::float tm_stl, u.pct_blk::float tm_blk,
           s.pct_pts_paint::float paint, s.pct_pts_2pt_mr::float mid, s.pct_pts_3pt::float three, s.pct_pts_ft::float ft,
           s.pct_pts_fb::float fb, s.pct_pts_off_tov::float offtov, s.pct_uast_fgm::float uast, s.pct_fga_3pt::float fga3
    FROM g LEFT JOIN a ON a.game_id = g.game_id LEFT JOIN u ON u.game_id = g.game_id LEFT JOIN s ON s.game_id = g.game_id
    ORDER BY g.game_date DESC`, [pidT, beforeDate, limit]);
  if (!rows.length) return null;
  const season = rows[0].season;
  const wins = [["Last 5", rows.slice(0, 5)], ["Last 10", rows.slice(0, 10)], ["Last 20", rows.slice(0, 20)], [`Season ${season}`, rows.filter(r => r.season === season)]];
  const usage = wins.filter(([, g]) => g.length).map(([w, g]) => ({
    window: w, games: g.length, min: r1(mean(g, "min")), usg: p100(mean(g, "usg")), ts: p100(mean(g, "ts")), efg: p100(mean(g, "efg")),
    astp: p100(mean(g, "astp")), rebp: p100(mean(g, "rebp")), orebp: p100(mean(g, "orebp")), drebp: p100(mean(g, "drebp")), pace: r1(mean(g, "pace")),
    ortg: r1(mean(g, "ortg")), drtg: r1(mean(g, "drtg")), tm_pts: p100(mean(g, "tm_pts")), tm_reb: p100(mean(g, "tm_reb")), tm_ast: p100(mean(g, "tm_ast")),
    tm_fga: p100(mean(g, "tm_fga")), tm_fg3a: p100(mean(g, "tm_fg3a")), fga: r1(mean(g, "fga")), fg3a: r1(mean(g, "fg3a")), fta: r1(mean(g, "fta")),
    three_rate: sumOf(g, "fga") ? r1(100 * sumOf(g, "fg3a") / sumOf(g, "fga")) : null, ft_rate: sumOf(g, "fga") ? r1(100 * sumOf(g, "fta") / sumOf(g, "fga")) : null }));
  const scoring = wins.filter(([, g]) => g.length).map(([w, g]) => ({
    window: w, games: g.length, paint: p100(mean(g, "paint")), mid: p100(mean(g, "mid")), three: p100(mean(g, "three")), ft: p100(mean(g, "ft")),
    fb: p100(mean(g, "fb")), offtov: p100(mean(g, "offtov")), uast: p100(mean(g, "uast")), fga3: p100(mean(g, "fga3")) }));
  return { usage, scoring, per_game: rows.slice(0, 20).map(r => ({ game_date: r.game_date, phase: r.phase, min: r1(r.min), usg: p100(r.usg), ts: p100(r.ts),
    tm_pts: p100(r.tm_pts), tm_reb: p100(r.tm_reb), tm_ast: p100(r.tm_ast), pace: r1(r.pace), paint: p100(r.paint), three: p100(r.three) })) };
}

// ---- tracking skills (season to date; the NBA's player-tracking boards, refreshed weekly by P1)
const TRACK = {
  Passing: [["Passes Made", "PASSES_MADE"], ["Passes Received", "PASSES_RECEIVED"], ["Assists", "AST"], ["Potential Assists", "POTENTIAL_AST"],
    ["Secondary Assists", "SECONDARY_AST"], ["FT Assists", "FT_AST"], ["Assist Points Created", "AST_POINTS_CREATED"], ["Assist / Pass %", "AST_TO_PASS_PCT", 1]],
  Rebounding: [["Rebounds", "REB"], ["Rebound Chances", "REB_CHANCES"], ["Rebound Chance %", "REB_CHANCE_PCT", 1], ["Contested Reb %", "REB_CONTEST_PCT", 1],
    ["OREB Chances", "OREB_CHANCES"], ["OREB Chance %", "OREB_CHANCE_PCT", 1], ["DREB Chances", "DREB_CHANCES"], ["DREB Chance %", "DREB_CHANCE_PCT", 1], ["Avg Reb Distance (ft)", "AVG_REB_DIST"]],
  CatchShoot: [["C&S Points", "CATCH_SHOOT_PTS"], ["C&S FGA", "CATCH_SHOOT_FGA"], ["C&S FG%", "CATCH_SHOOT_FG_PCT", 1], ["C&S 3PA", "CATCH_SHOOT_FG3A"],
    ["C&S 3PM", "CATCH_SHOOT_FG3M"], ["C&S 3P%", "CATCH_SHOOT_FG3_PCT", 1], ["C&S eFG%", "CATCH_SHOOT_EFG_PCT", 1]],
  PullUpShot: [["Pull-Up Points", "PULL_UP_PTS"], ["Pull-Up FGA", "PULL_UP_FGA"], ["Pull-Up FG%", "PULL_UP_FG_PCT", 1], ["Pull-Up 3PA", "PULL_UP_FG3A"],
    ["Pull-Up 3PM", "PULL_UP_FG3M"], ["Pull-Up 3P%", "PULL_UP_FG3_PCT", 1], ["Pull-Up eFG%", "PULL_UP_EFG_PCT", 1]],
  Drives: [["Drives", "DRIVES"], ["Drive Points", "DRIVE_PTS"], ["Drive FGA", "DRIVE_FGA"], ["Drive FG%", "DRIVE_FG_PCT", 1], ["Drive FTA", "DRIVE_FTA"],
    ["Drive Assists", "DRIVE_AST"], ["Drive Pass %", "DRIVE_PASSES_PCT", 1], ["Drive Turnovers", "DRIVE_TOV"]],
  Touches: [["Touches", "TOUCHES"], ["Paint Touches", "PAINT_TOUCHES"], ["Paint Touch Points", "PAINT_TOUCH_PTS"], ["Post Touches", "POST_TOUCHES"],
    ["Post Touch Points", "POST_TOUCH_PTS"], ["Elbow Touches", "ELBOW_TOUCHES"], ["Elbow Touch Points", "ELBOW_TOUCH_PTS"]]
};
const TRACK_TITLE = { Passing: "Passing & Playmaking", Rebounding: "Rebounding", CatchShoot: "Catch & Shoot", PullUpShot: "Pull-Up Shooting", Drives: "Drives", Touches: "Touches" };
export async function trackingSkills(sql, pidT) {
  const rows = await q(sql, "SELECT measure_type, metrics, updated_at FROM nba_stats.player_tracking_detail WHERE player_id = $1", [pidT]);
  const by = {};
  let updated = null, gp = null, min = null;
  for (const r of rows) {
    let m = r.metrics;
    for (let i = 0; i < 3 && typeof m === "string"; i++) { try { m = JSON.parse(m); } catch { m = null; } }
    if (!m || typeof m !== "object") continue;
    by[r.measure_type] = m;
    if (r.updated_at && (!updated || new Date(r.updated_at) > updated)) updated = new Date(r.updated_at);
    if (gp == null && m.GP != null) { gp = m.GP; min = m.MIN; }
  }
  // the touches board is split across three measure types; merge them
  const touch = { ...(by.PostTouch || {}), ...(by.ElbowTouch || {}), ...(by.PaintTouch || {}) };
  if (Object.keys(touch).length) by.Touches = touch;
  const groups = [];
  for (const [key, fields] of Object.entries(TRACK)) {
    const m = by[key];
    if (!m) continue;
    const vals = fields.map(([label, f, isPct]) => [label, m[f] == null ? null : (isPct ? p100(m[f]) : r1(m[f]))]).filter(([, v]) => v != null);
    if (vals.length) groups.push({ key, title: TRACK_TITLE[key], rows: vals });
  }
  if (!groups.length) return null;
  return { games: gp, min_per_game: r1(min), updated: updated ? updated.toISOString().slice(0, 10) : null, groups };
}

// ---- career, one row per season (per-game averages from the season totals)
export async function career(sql, pidT) {
  const rows = await q(sql, `
    SELECT c.season_id, t.abbreviation team, c.player_age::float age, c.gp, c.gs, c.min::float min, c.pts::float pts, c.reb::float reb, c.ast::float ast,
           c.fg3m::float fg3m, c.stl::float stl, c.blk::float blk, c.tov::float tov, c.fg_pct::float fg_pct, c.fg3_pct::float fg3_pct, c.ft_pct::float ft_pct
    FROM nba_stats.player_career_season_totals c LEFT JOIN nba_ref.teams t ON t.team_id = c.team_id
    WHERE c.player_id = $1 ORDER BY c.season_id DESC, c.gp DESC`, [pidT]);
  return rows.map(r => {
    const g = Number(r.gp) || 0, pg = v => (g ? r1(Number(v) / g) : null);
    return { season: r.season_id, team: r.team || "TOT", age: r.age != null ? Math.round(r.age) : null, gp: g, gs: r.gs, min: pg(r.min), pts: pg(r.pts), reb: pg(r.reb), ast: pg(r.ast),
      fg3m: pg(r.fg3m), stl: pg(r.stl), blk: pg(r.blk), tov: pg(r.tov), pra: g ? r1((Number(r.pts) + Number(r.reb) + Number(r.ast)) / g) : null,
      fg_pct: p100(r.fg_pct), fg3_pct: p100(r.fg3_pct), ft_pct: p100(r.ft_pct) };
  });
}

// ---- every game against this opponent (regular season + playoffs, before the slate)
export async function vsOpponent(sql, pidT, beforeDate, oppAbbr, limit = 20) {
  if (!oppAbbr) return [];
  const rows = await q(sql, `
    SELECT * FROM (
      SELECT 'Regular' phase, game_date::text game_date, season, matchup, wl, min::float min, pts::float pts, reb::float reb, ast::float ast, fg3m::float fg3m, stl::float stl,
             blk::float blk, tov::float tov, fgm::float fgm, fga::float fga, ftm::float ftm, fta::float fta, plus_minus::float plus_minus
      FROM nba_stats.player_game_log WHERE player_id = $1 AND game_date < $2::date AND (matchup LIKE '% @ ' || $3 OR matchup LIKE '% vs. ' || $3)
      UNION ALL
      SELECT 'Playoffs', game_date::text, season, matchup, wl, min::float, pts::float, reb::float, ast::float, fg3m::float, stl::float, blk::float, tov::float,
             fgm::float, fga::float, ftm::float, fta::float, plus_minus::float
      FROM nba_stats.player_game_log_postseason WHERE player_id = $1 AND game_date < $2::date AND (matchup LIKE '% @ ' || $3 OR matchup LIKE '% vs. ' || $3)) x
    ORDER BY game_date DESC LIMIT $4`, [pidT, beforeDate, oppAbbr, limit]);
  return rows.map(r => ({ ...r, is_home: String(r.matchup || "").includes(" vs. ") ? 1 : 0, opponent_abbr: oppAbbr }));
}

// ---- his numbers with and without each key teammate this season (the starters by minutes + anyone on tonight's report)
export async function withWithout(sql, pidT, teamId, beforeDate, injuredRows) {
  if (!teamId) return null;
  const season = (await q(sql, `SELECT season FROM nba_stats.player_game_log WHERE player_id = $1 AND game_date < $2::date ORDER BY game_date DESC LIMIT 1`, [pidT, beforeDate]))[0];
  if (!season) return null;
  const inj = (injuredRows || []).map(r => ({ key: normName(flipName(r.player_name || r.player)), status: r.status, reason: r.reason }));
  const rows = await q(sql, `
    WITH tg AS (SELECT game_id FROM nba_team.team_game_log WHERE team_id = $2 AND season = $3 AND game_date < $4::date),
    roster AS (SELECT player_id, sum(min::float) mins FROM nba_stats.player_game_log
               WHERE team_id = $2 AND season = $3 AND game_date < $4::date AND min > 0 AND player_id <> $1 GROUP BY 1),
    inj AS (SELECT r.player_id FROM roster r JOIN nba_ref.players p ON p.player_id = r.player_id
            WHERE lower(regexp_replace(normalize(p.full_name, NFKD), '[^A-Za-z]', '', 'g')) = ANY($5::text[])),
    mates AS (SELECT player_id FROM (SELECT player_id FROM roster ORDER BY mins DESC LIMIT 5) a UNION SELECT player_id FROM inj),
    me AS (SELECT game_id, min::float min, pts::float pts, reb::float reb, ast::float ast, fg3m::float fg3m, fga::float fga
           FROM nba_stats.player_game_log WHERE player_id = $1 AND season = $3 AND game_date < $4::date AND min > 0 AND game_id IN (SELECT game_id FROM tg)),
    tm AS (SELECT player_id, game_id FROM nba_stats.player_game_log
           WHERE player_id IN (SELECT player_id FROM mates) AND season = $3 AND game_date < $4::date AND min > 0)
    SELECT m.player_id, p.full_name, (tm.game_id IS NOT NULL) together, count(*)::int n, avg(me.min)::float min, avg(me.pts)::float pts, avg(me.reb)::float reb,
           avg(me.ast)::float ast, avg(me.fg3m)::float fg3m, avg(me.fga)::float fga, avg(me.pts + me.reb + me.ast)::float pra,
           (SELECT mins FROM roster r WHERE r.player_id = m.player_id) mate_mins
    FROM mates m CROSS JOIN me LEFT JOIN tm ON tm.player_id = m.player_id AND tm.game_id = me.game_id LEFT JOIN nba_ref.players p ON p.player_id = m.player_id
    GROUP BY 1, 2, 3`, [pidT, teamId, season.season, beforeDate, pgArr(inj.map(i => i.key))]);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.player_id)) by.set(r.player_id, { player_id: r.player_id, name: r.full_name, mate_mins: num(r.mate_mins), with: null, without: null });
    const side = { games: r.n, min: r1(r.min), pts: r1(r.pts), reb: r1(r.reb), ast: r1(r.ast), fg3m: r1(r.fg3m), fga: r1(r.fga), pra: r1(r.pra) };
    by.get(r.player_id)[r.together ? "with" : "without"] = side;
  }
  const out = [...by.values()].map(x => { const i = inj.find(j => j.key === normName(x.name)); return { ...x, status: i ? i.status : null, reason: i ? i.reason : null }; });
  out.sort((a, b) => (b.status ? 1 : 0) - (a.status ? 1 : 0) || (b.mate_mins || 0) - (a.mate_mins || 0));
  return { season: season.season, rows: out };
}

// ---- his most-used lineups (5-man units and 2-man pairs), latest season on record
export async function lineups(sql, pidT) {
  const rows = await q(sql, `
    SELECT group_quantity, group_name, season, t.abbreviation team, gp, w, l, min::float min, plus_minus::float plus_minus, pts::float pts
    FROM nba_team.lineup_profile lp LEFT JOIN nba_ref.teams t ON t.team_id = lp.team_id
    WHERE $1 = ANY(lp.player_ids) AND lp.season = (SELECT max(season) FROM nba_team.lineup_profile WHERE $1 = ANY(player_ids))
    ORDER BY group_quantity DESC, min DESC`, [pidT]);
  const pick = (n, k) => rows.filter(r => Number(r.group_quantity) === n).slice(0, k).map(r => ({ group: r.group_name, team: r.team, season: r.season, gp: r.gp,
    record: r.w != null ? `${r.w}-${r.l}` : null, min: r1(r.min), plus_minus: r1(r.plus_minus), per48: r.min ? r1(48 * r.plus_minus / r.min) : null, pts: r1(r.pts) }));
  if (!rows.length) return null;
  return { season: rows[0].season, five: pick(5, 6), pairs: pick(2, 8) };
}

// ---- both teams' form: last 10 and season to date (scoring, pace, ratings, the four factors for and against)
export async function teamTrends(sql, teamIds, beforeDate) {
  if (!teamIds || !teamIds.length) return [];
  const rows = await q(sql, `
    WITH g AS (
      SELECT team_id, game_id, game_date, season, pts::float pts, plus_minus::float pm, wl FROM nba_team.team_game_log WHERE team_id = ANY($1::text[]) AND game_date < $2::date
      UNION ALL
      SELECT team_id, game_id, game_date, season, pts::float, plus_minus::float, wl FROM nba_team.team_game_log_postseason WHERE team_id = ANY($1::text[]) AND game_date < $2::date),
    s AS (SELECT team_id, max(season) season FROM g GROUP BY 1),
    a AS (SELECT team_id, game_id, pace, off_rating, def_rating FROM nba_team.team_game_log_advanced WHERE team_id = ANY($1::text[])
          UNION ALL SELECT team_id, game_id, pace, off_rating, def_rating FROM nba_team.team_game_log_advanced_postseason WHERE team_id = ANY($1::text[])),
    f AS (SELECT team_id, game_id, efg_pct, fta_rate, tm_tov_pct, oreb_pct, opp_efg_pct, opp_fta_rate, opp_tov_pct, opp_oreb_pct FROM nba_team.team_game_log_four_factors WHERE team_id = ANY($1::text[])
          UNION ALL SELECT team_id, game_id, efg_pct, fta_rate, tm_tov_pct, oreb_pct, opp_efg_pct, opp_fta_rate, opp_tov_pct, opp_oreb_pct FROM nba_team.team_game_log_four_factors_postseason WHERE team_id = ANY($1::text[]))
    SELECT g.team_id, t.abbreviation, g.game_date::text game_date, g.season, g.wl, g.pts, g.pts - g.pm opp_pts, a.pace::float pace, a.off_rating::float ortg, a.def_rating::float drtg,
           f.efg_pct::float efg, f.opp_efg_pct::float opp_efg, f.tm_tov_pct::float tov, f.opp_tov_pct::float opp_tov, f.oreb_pct::float oreb,
           f.opp_oreb_pct::float opp_oreb, f.fta_rate::float ftr, f.opp_fta_rate::float opp_ftr
    FROM g JOIN s ON s.team_id = g.team_id AND s.season = g.season
    LEFT JOIN a ON a.team_id = g.team_id AND a.game_id = g.game_id LEFT JOIN f ON f.team_id = g.team_id AND f.game_id = g.game_id
    LEFT JOIN nba_ref.teams t ON t.team_id = g.team_id
    ORDER BY g.team_id, g.game_date DESC`, [pgArr(teamIds), beforeDate]);
  const out = [];
  for (const tid of teamIds) {
    const g = rows.filter(r => r.team_id === tid);
    if (!g.length) continue;
    for (const [w, set] of [["Last 10", g.slice(0, 10)], [`Season ${g[0].season}`, g]]) {
      out.push({ team_id: tid, team: g[0].abbreviation, window: w, games: set.length, record: `${set.filter(x => x.wl === "W").length}-${set.filter(x => x.wl === "L").length}`,
        ppg: r1(mean(set, "pts")), opp_ppg: r1(mean(set, "opp_pts")), pace: r1(mean(set, "pace")), ortg: r1(mean(set, "ortg")), drtg: r1(mean(set, "drtg")),
        efg: p100(mean(set, "efg")), opp_efg: p100(mean(set, "opp_efg")), tov: p100(mean(set, "tov")), opp_tov: p100(mean(set, "opp_tov")),
        oreb: p100(mean(set, "oreb")), opp_oreb: p100(mean(set, "opp_oreb")), ftr: p100(mean(set, "ftr")), opp_ftr: p100(mean(set, "opp_ftr")) });
    }
  }
  return out;
}

export async function arena(sql, homeTeamId) {
  if (!homeTeamId) return null;
  const r = (await q(sql, "SELECT arena_name, city, state, capacity, altitude_ft, timezone FROM nba_ref.arenas WHERE team_id = $1 LIMIT 1", [homeTeamId]))[0];
  return r || null;
}

// everything above for one player and (optionally) one game - the dossier and the profile both call this
// `injuries` may be a promise (the game context's injury report, built in parallel) - only with/without waits for it
export async function bettorDepth(sql, { pidT, beforeDate, teamId, game, oppAbbr, injuries }) {
  const teamName = game ? (game.home_team_id === teamId ? game.home_name : game.away_name) : null;
  const matesOut = inj => ((inj && inj.rows) || []).filter(r => teamName && teamKey(r.team) === teamKey(teamName))
    .map(r => ({ player_name: r.player, status: r.status, reason: r.reason }));
  const safe = p => p.catch(e => ({ __error: String(e && e.message ? e.message : e).slice(0, 200) }));
  const [detail, tracking, car, vs, ww, lu, trends, ar] = await Promise.all([
    safe(perGameDetail(sql, pidT, beforeDate)), safe(trackingSkills(sql, pidT)), safe(career(sql, pidT)), safe(vsOpponent(sql, pidT, beforeDate, oppAbbr)),
    safe(Promise.resolve(injuries).then(inj => withWithout(sql, pidT, teamId, beforeDate, matesOut(inj)))),
    safe(lineups(sql, pidT)), safe(game ? teamTrends(sql, [game.home_team_id, game.away_team_id].filter(Boolean), beforeDate) : Promise.resolve([])),
    safe(game ? arena(sql, game.home_team_id) : Promise.resolve(null))]);
  const errors = Object.entries({ detail, tracking, career: car, vs_opponent: vs, with_without: ww, lineups: lu, team_trends: trends, arena: ar })
    .filter(([, v]) => v && v.__error).map(([k, v]) => `${k}: ${v.__error}`);
  const ok = v => (v && v.__error ? null : v);
  return { usage_detail: ok(detail), tracking_skills: ok(tracking), career: ok(car) || [], vs_opponent: ok(vs) || [], vs_opponent_abbr: oppAbbr || null,
    with_without: ok(ww), lineups: ok(lu), team_trends: ok(trends) || [], arena: ok(ar), depth_errors: errors };
}
