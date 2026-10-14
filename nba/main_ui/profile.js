// NBA MAIN UI - /api/player-search and /api/player-profile (the MLB Player Profile screen, for basketball).
import { q, pgArr, resolveSlate } from "./common.js";
import { loadLegs } from "./board.js";
import * as C from "./context.js";

export async function apiPlayerSearch(sql, url, version) {
  const qs = String(url.searchParams.get("q") || "").trim();
  if (qs.length < 3) return { ok: true, data_ok: true, version, route: "/api/player-search", rows: [] };
  const like = `%${qs.replace(/[%_]/g, "").toLowerCase()}%`;
  const rows = await q(sql, `
    WITH m AS (
      SELECT p.player_id, p.full_name, p.position, p.team_id, p.active, 'player' match_type FROM nba_ref.players p
      WHERE lower(COALESCE(p.full_name, '')) LIKE $1 OR lower(COALESCE(p.first_name, '')) LIKE $1 OR lower(COALESCE(p.last_name, '')) LIKE $1
      UNION ALL
      SELECT p.player_id, p.full_name, p.position, p.team_id, p.active, 'alias' FROM nba_ref.player_aliases a JOIN nba_ref.players p ON p.player_id = a.player_id
      WHERE a.active = 1 AND (lower(COALESCE(a.alias_value, '')) LIKE $1 OR lower(COALESCE(a.alias_normalized, '')) LIKE $1))
    SELECT DISTINCT ON (m.player_id) m.player_id, m.full_name player_name, m.position primary_position, t.abbreviation team_abbr, m.active, m.match_type
    FROM m LEFT JOIN nba_ref.teams t ON t.team_id = m.team_id
    ORDER BY m.player_id, CASE m.match_type WHEN 'player' THEN 0 ELSE 1 END`, [like]);
  rows.sort((a, b) => (Number(b.active || 0) - Number(a.active || 0)) || String(a.player_name).localeCompare(String(b.player_name)));
  return { ok: true, data_ok: true, version, route: "/api/player-search",
    rows: rows.slice(0, 20).map(r => ({ player_id: r.player_id, player_name: r.player_name, primary_position: [r.primary_position, r.team_abbr].filter(Boolean).join(" • "), active: r.active })) };
}

export async function apiPlayerProfile(sql, cfg, url, version) {
  const raw = String(url.searchParams.get("player_id") || "").trim();
  if (!raw) return { status: 400, body: { ok: false, error: "player_id required", version } };
  const pidT = raw.startsWith("nba_") ? raw : "nba_" + raw;
  const bare = pidT.replace(/^nba_/, "");
  const slate = await resolveSlate(sql, cfg, url);
  const info = await C.playerInfo(sql, pidT);
  if (!info) return { status: 404, body: { ok: false, error: "player not found", player_id: raw, version } };
  const today = slate.today;
  const [games, sp, shot, adv, legs, avail] = await Promise.all([
    C.gameLog(sql, pidT, today, 100), C.splits(sql, pidT), C.shotProfile(sql, pidT), C.advanced(sql, pidT),
    loadLegs(sql, cfg, slate, { where: "AND b.player_id = $6", extra: [bare], limit: 600 }),
    q(sql, `SELECT status, reason, snapshot_ts, game_date::text game_date FROM nba_daily.injury_report_snapshots
            WHERE player_name = $1 ORDER BY snapshot_ts DESC LIMIT 1`, [`${info.last_name || ""}, ${info.first_name || ""}`])]);
  const season = games[0] ? games[0].season : null;
  const seasonGames = games.filter(g => g.season === season);
  // the player's team: his latest box-score team, else the roster team
  const teamId = (games[0] && games[0].team_id) || info.team_id;
  const team = (await q(sql, "SELECT team_id, abbreviation, full_name, conference, division FROM nba_ref.teams WHERE team_id = $1", [teamId || ""]))[0] || {};
  const ng = (await q(sql, `SELECT game_date::text game_date FROM nba_calendar.slate_games WHERE game_date >= $1::date AND $2 IN (home_team_id, away_team_id)
                            ORDER BY game_date, game_datetime_utc LIMIT 1`, [today, teamId || ""]))[0];
  let nextGame = null, nextCtx = null;
  if (ng) {
    const g = await C.gameFor(sql, ng.game_date, teamId);
    if (g) {
      const isHome = g.home_team_id === teamId;
      nextGame = { game_id: g.game_id, game_date: g.game_date, game_time_utc: g.game_time_utc, is_home: isHome, opponent_team_name: isHome ? g.away_name : g.home_name,
        opponent_abbr: isHome ? g.away_abbr : g.home_abbr, arena: g.arena_name, arena_city: g.arena_city };
      nextCtx = await C.gameContext(sql, cfg, { date: g.game_date, game: g, teamId, position: info.position });
    }
  }
  const a = avail[0];
  const availability = a ? { availability_status: a.status, reason: a.reason, as_of: new Date(a.snapshot_ts).toISOString(), report_date: a.game_date }
                         : { availability_status: info.active ? "Active" : "Inactive", reason: null, as_of: null };
  return { status: 200, body: {
    ok: true, data_ok: true, version, route: "/api/player-profile", slate,
    player: { ...info, player_name: info.full_name, primary_position: info.position },
    team, is_pitcher: false, is_two_way: false,
    current_legs: legs, recent_games: games, season,
    home_games: seasonGames.filter(g => g.is_home === 1), away_games: seasonGames.filter(g => g.is_home === 0),
    metric_snapshots: C.formWindows(games, seasonGames), splits: sp,
    next_game: nextGame, next_game_context: nextCtx,
    advanced: { ...adv, shot_quality: shot }, availability
  } };
}

export { pgArr };
