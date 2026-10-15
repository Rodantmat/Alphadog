// NBA MAIN UI - /api/main-board/dossier (the card tap): the selected leg, every other board leg of the player that slate,
// and the full basketball context (form, splits, matchup, injuries, starters, rest, officials, game lines, prop markets,
// shot quality, advanced metrics).
import { q, parseLegId, propLabel } from "./common.js";
import { loadLegs } from "./board.js";
import * as C from "./context.js";
import * as D from "./bettor.js";

export async function apiDossier(sql, cfg, url, version) {
  const id = url.searchParams.get("final_board_row_id") || url.searchParams.get("id");
  const leg = parseLegId(id);
  if (!leg) return { status: 400, body: { ok: false, error: "final_board_row_id required (date~app~player_id~prop~line~side)", version } };
  const slate = { date: leg.date, mode: "replay" };
  const today = (await q(sql, "SELECT (now() AT TIME ZONE 'America/Los_Angeles')::date::text d"))[0].d;
  slate.mode = leg.date === today ? "live" : "replay";
  const legs = await loadLegs(sql, cfg, slate, { where: "AND b.player_id = $6", extra: [leg.player_id], limit: 600 });
  const selected = legs.find(l => l.final_board_row_id === id) || legs.find(l => l.source_key === leg.app && l.canonical_prop_key === leg.prop && Number(l.line_value) === leg.line);
  if (!selected) return { status: 404, body: { ok: false, error: "leg not on the scored board for that slate", id, version } };
  const pidT = "nba_" + leg.player_id;
  const [info, games, sp, shot, adv, boards] = await Promise.all([
    C.playerInfo(sql, pidT), C.gameLog(sql, pidT, leg.date, 100), C.splits(sql, pidT), C.shotProfile(sql, pidT), C.advanced(sql, pidT),
    C.playerBoardRows(sql, cfg, leg.date, selected.player_name)]);
  const game = selected.team_id ? await C.gameFor(sql, leg.date, selected.team_id) : null;
  // the matchup context and the bettor depth (usage, tracking, career, head-to-head, with/without, lineups, team form) in parallel
  const gctxP = game ? C.gameContext(sql, cfg, { date: leg.date, game, teamId: selected.team_id, position: selected.position || (info && info.position) }) : Promise.resolve(null);
  const [gctx, depth] = await Promise.all([gctxP,
    D.bettorDepth(sql, { pidT, beforeDate: leg.date, teamId: selected.team_id, game, oppAbbr: selected.opponent_abbr, injuries: gctxP.then(g => g && g.injuries) })]);
  const seasonGames = games.filter(g => g.season === (games[0] && games[0].season));
  const ctx = {
    player_profile: info ? { ...info, team_abbr: selected.team_abbr || info.team_abbr, team_name: selected.team_name || info.team_name } : { full_name: selected.player_name },
    hp_lines: legs.map(l => ({ final_board_row_id: l.final_board_row_id, source_key: l.source_key, canonical_prop_key: l.canonical_prop_key, prop_label: propLabel(l.canonical_prop_key),
      selected_side: l.selected_side, line_value: l.line_value, line_type: l.line_type, estimated_hit_probability_0_100: l.estimated_hit_probability_0_100,
      probability_confidence_0_100: l.probability_confidence_0_100, score_0_100: l.score_0_100, edge_0_100: l.edge_0_100, leg_factor: l.leg_factor,
      baseline_hp_0_100: l.baseline_hp_0_100, calibration_shift_pp: l.calibration_shift_pp, interpolated: l.interpolated })),
    recent_games: games.slice(0, 30),
    games_full: games,
    recent_form: C.formWindows(games, seasonGames),
    splits: sp,
    shot_quality: shot,
    advanced: adv,
    prop_market_current_lines: boards.sportsbook,
    prop_market_consensus: boards.consensus,
    prepared_lines: boards.dfs,
    ...(gctx || {}),
    ...depth
  };
  return { status: 200, body: { ok: true, data_ok: true, version, route: "/api/main-board/dossier", slate, selected, other_player_legs: legs, dossier_context: ctx, raw_context: {} } };
}
