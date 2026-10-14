// NBA MAIN UI - the player / game context behind the dossier and the player profile (the MLB dossier_context, for basketball).
// Every section is read-only and as-of the slate: box scores strictly before the slate date, the injury report as of tip,
// the officials, the game lines, the sportsbook and DFS boards for that slate. A section with no data renders as "not
// available", never as an invented number.
import { q, pgArr, num, r1, r3, isoDate, propLabel, appLabel } from "./common.js";
import { statFor } from "./insight.js";

const TEAM_NAME = x => `replace(${x}, 'Los Angeles Clippers', 'LA Clippers')`;
const LOG_COLS = "player_id, team_id, game_id, season, game_date, matchup, wl, min, pts, reb, ast, fg3m, fg3a, stl, blk, tov, fgm, fga, ftm, fta, oreb, dreb, pf, plus_minus";

export function parseMatchup(m) {
  const s = String(m || "");
  const home = s.includes(" vs. ");
  const parts = s.split(home ? " vs. " : " @ ");
  return { is_home: home ? 1 : 0, team_abbr: (parts[0] || "").trim(), opponent_abbr: (parts[1] || "").trim() };
}

export async function playerInfo(sql, pidT) {
  const r = await q(sql, `SELECT p.player_id, p.nba_player_id, p.full_name, p.first_name, p.last_name, p.position, p.height_inches, p.weight_lbs,
      p.birth_date::text birth_date, p.age, p.years_pro, p.college, p.country, p.draft_year, p.draft_round, p.draft_number, p.active,
      p.team_id, t.abbreviation team_abbr, t.full_name team_name
    FROM nba_ref.players p LEFT JOIN nba_ref.teams t ON t.team_id = p.team_id WHERE p.player_id = $1`, [pidT]);
  return r[0] || null;
}

export async function gameLog(sql, pidT, beforeDate, limit = 25) {
  const rows = await q(sql, `
    SELECT x.*, COALESCE(s.is_starter, sp.is_starter) is_starter FROM (
      SELECT 'Regular' phase, ${LOG_COLS} FROM nba_stats.player_game_log WHERE nba_player_id = $1::bigint AND game_date < $2::date
      UNION ALL
      SELECT 'Playoffs' phase, ${LOG_COLS} FROM nba_stats.player_game_log_postseason WHERE player_id = $3 AND game_date < $2::date) x
    LEFT JOIN nba_stats.player_game_starter_status s ON s.player_id = x.player_id AND s.game_id = x.game_id
    LEFT JOIN nba_stats.player_game_starter_status_postseason sp ON sp.player_id = x.player_id AND sp.game_id = x.game_id
    ORDER BY x.game_date DESC LIMIT $4`, [String(pidT).replace(/^nba_/, ""), beforeDate, pidT, limit]);
  return rows.map(g => {
    const m = parseMatchup(g.matchup);
    return {
      phase: g.phase, season: g.season, game_id: g.game_id, game_date: isoDate(g.game_date), opponent_abbr: m.opponent_abbr, is_home: m.is_home, wl: g.wl,
      is_starter: g.is_starter == null ? null : Number(g.is_starter), min: r1(g.min), pts: num(g.pts), reb: num(g.reb), ast: num(g.ast),
      fg3m: num(g.fg3m), fg3a: num(g.fg3a), stl: num(g.stl), blk: num(g.blk), tov: num(g.tov), fgm: num(g.fgm), fga: num(g.fga),
      ftm: num(g.ftm), fta: num(g.fta), oreb: num(g.oreb), dreb: num(g.dreb), pf: num(g.pf), plus_minus: num(g.plus_minus), team_id: g.team_id
    };
  });
}

// per-window averages (the MLB recent_form / metric_snapshots, for basketball)
export function formWindows(games, seasonGames) {
  const avg = (arr, k) => { const v = arr.map(g => num(g[k])).filter(x => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const pct = (arr, m, a) => { const M = arr.reduce((s, g) => s + (num(g[m]) || 0), 0), A = arr.reduce((s, g) => s + (num(g[a]) || 0), 0); return A ? r1(100 * M / A) : null; };
  const played = list => list.filter(g => num(g.min) > 0);
  const mk = (key, list) => {
    const l = played(list);
    return {
      metric_window: key, games_count: l.length, min: avg(l, "min"), pts: avg(l, "pts"), reb: avg(l, "reb"), ast: avg(l, "ast"), fg3m: avg(l, "fg3m"),
      stl: avg(l, "stl"), blk: avg(l, "blk"), tov: avg(l, "tov"), pra: l.length ? r1(l.reduce((s, g) => s + num(g.pts, 0) + num(g.reb, 0) + num(g.ast, 0), 0) / l.length) : null,
      fg_pct: pct(l, "fgm", "fga"), fg3_pct: pct(l, "fg3m", "fg3a"), ft_pct: pct(l, "ftm", "fta"), plus_minus: avg(l, "plus_minus"),
      starts: l.filter(g => g.is_starter === 1).length
    };
  };
  const p = played(games);
  return [mk("last_5_games", p.slice(0, 5)), mk("last_10_games", p.slice(0, 10)), mk("last_20_games", p.slice(0, 20)), mk("season_to_date", seasonGames || games)];
}

export async function splits(sql, pidT) {
  return q(sql, `SELECT split_type, group_value, season, gp, min::float, pts::float, reb::float, ast::float, fg3m::float, stl::float, blk::float,
      tov::float, fg_pct::float, fg3_pct::float, ft_pct::float, plus_minus::float
    FROM nba_stats.player_splits WHERE player_id = $1 AND season = (SELECT max(season) FROM nba_stats.player_splits WHERE player_id = $1)
    ORDER BY split_type, group_value`, [pidT]);
}

export async function teamProfiles(sql, teamIds, date) {
  if (!teamIds.length) return [];
  const rows = await q(sql, `
    WITH sp AS (SELECT DISTINCT ON (team_id) team_id, season, games_played, wins, losses, pace::float, off_rating::float, def_rating::float, net_rating::float
                FROM nba_team.season_profile WHERE team_id = ANY($1::text[]) ORDER BY team_id, season DESC),
    l10 AS (SELECT team_id, string_agg(wl, '' ORDER BY game_date DESC) wl FROM (
              SELECT team_id, wl, game_date, row_number() OVER (PARTITION BY team_id ORDER BY game_date DESC) rn FROM (
                SELECT team_id, wl, game_date FROM nba_team.team_game_log WHERE team_id = ANY($1::text[]) AND game_date < $2::date
                UNION ALL SELECT team_id, wl, game_date FROM nba_team.team_game_log_postseason WHERE team_id = ANY($1::text[]) AND game_date < $2::date) a) b
            WHERE rn <= 10 GROUP BY team_id)
    SELECT t.team_id, t.abbreviation, t.full_name, t.conference, t.division, sp.season, sp.games_played, sp.wins, sp.losses, sp.pace, sp.off_rating,
           sp.def_rating, sp.net_rating, l10.wl last10
    FROM nba_ref.teams t LEFT JOIN sp ON sp.team_id = t.team_id LEFT JOIN l10 ON l10.team_id = t.team_id WHERE t.team_id = ANY($1::text[])`,
    [pgArr(teamIds), date]);
  return rows.map(r => ({ ...r, last10_record: r.last10 ? `${(r.last10.match(/W/g) || []).length}-${(r.last10.match(/L/g) || []).length}` : null }));
}

export async function defenseVsPosition(sql, oppTeamId, position) {
  if (!oppTeamId || !position) return null;
  const rows = await q(sql, `
    WITH s AS (SELECT max(season) season FROM nba_team.defense_vs_position WHERE opponent_position = $1),
    d AS (SELECT team_id, games_sampled, avg_pts_allowed::float pts, avg_reb_allowed::float reb, avg_ast_allowed::float ast, avg_fg_pct_allowed::float fg
          FROM nba_team.defense_vs_position WHERE opponent_position = $1 AND season = (SELECT season FROM s))
    SELECT d.*, (SELECT season FROM s) season,
      rank() OVER (ORDER BY pts DESC) pts_rank, rank() OVER (ORDER BY reb DESC) reb_rank, rank() OVER (ORDER BY ast DESC) ast_rank,
      rank() OVER (ORDER BY fg DESC) fg_rank, count(*) OVER () teams FROM d`, [position]);
  const r = rows.find(x => x.team_id === oppTeamId);
  return r ? { position, season: r.season, games_sampled: r.games_sampled, avg_pts_allowed: r1(r.pts), avg_reb_allowed: r1(r.reb), avg_ast_allowed: r1(r.ast),
    avg_fg_pct_allowed: r1(r.fg <= 1 ? r.fg * 100 : r.fg), pts_rank: Number(r.pts_rank), reb_rank: Number(r.reb_rank), ast_rank: Number(r.ast_rank),
    fg_rank: Number(r.fg_rank), teams: Number(r.teams), note: "rank 1 = allows the most to this position" } : null;
}

export async function injuries(sql, date, teamNames, tipIso) {
  if (!teamNames.length) return { as_of: null, rows: [] };
  const rows = await q(sql, `
    WITH s AS (SELECT max(snapshot_ts) ts FROM nba_daily.injury_report_snapshots
               WHERE game_date = $1::date AND snapshot_ts <= COALESCE($3::timestamptz, now()))
    SELECT team, player_name, status, reason, snapshot_ts FROM nba_daily.injury_report_snapshots
    WHERE game_date = $1::date AND snapshot_ts = (SELECT ts FROM s) AND ${TEAM_NAME("team")} = ANY($2::text[])
    ORDER BY team, CASE status WHEN 'Out' THEN 1 WHEN 'Doubtful' THEN 2 WHEN 'Questionable' THEN 3 WHEN 'Probable' THEN 4 ELSE 5 END, player_name`,
    [date, pgArr(teamNames), tipIso || null]);
  const flip = n => { const p = String(n || "").split(", "); return p.length === 2 ? `${p[1]} ${p[0]}` : String(n || ""); };
  return { as_of: rows[0] ? new Date(rows[0].snapshot_ts).toISOString() : null,
    rows: rows.map(r => ({ team: r.team, player: flip(r.player_name), status: r.status, reason: r.reason })) };
}

export async function lastGameStarters(sql, teamIds, date) {
  if (!teamIds.length) return [];
  return q(sql, `
    WITH lg AS (SELECT DISTINCT ON (team_id) team_id, game_id, game_date, post FROM (
                  SELECT team_id, game_id, game_date, false post FROM nba_team.team_game_log WHERE team_id = ANY($1::text[]) AND game_date < $2::date
                  UNION ALL SELECT team_id, game_id, game_date, true FROM nba_team.team_game_log_postseason WHERE team_id = ANY($1::text[]) AND game_date < $2::date) x
                ORDER BY team_id, game_date DESC),
    st AS (SELECT player_id, game_id, start_position FROM nba_stats.player_game_starter_status WHERE is_starter = 1 AND game_id IN (SELECT game_id FROM lg)
           UNION ALL SELECT player_id, game_id, start_position FROM nba_stats.player_game_starter_status_postseason WHERE is_starter = 1 AND game_id IN (SELECT game_id FROM lg)),
    pl AS (SELECT player_id, game_id, team_id, min FROM nba_stats.player_game_log WHERE game_id IN (SELECT game_id FROM lg)
           UNION ALL SELECT player_id, game_id, team_id, min FROM nba_stats.player_game_log_postseason WHERE game_id IN (SELECT game_id FROM lg))
    SELECT lg.team_id, t.abbreviation team_abbr, lg.game_date::text game_date, p.full_name player, st.start_position, pl.min::float min
    FROM lg JOIN st ON st.game_id = lg.game_id JOIN pl ON pl.game_id = st.game_id AND pl.player_id = st.player_id AND pl.team_id = lg.team_id
    LEFT JOIN nba_ref.players p ON p.player_id = st.player_id LEFT JOIN nba_ref.teams t ON t.team_id = lg.team_id
    ORDER BY lg.team_id, CASE st.start_position WHEN 'G' THEN 1 WHEN 'F' THEN 2 WHEN 'C' THEN 3 ELSE 4 END, p.full_name`, [pgArr(teamIds), date]);
}

export async function scheduleSpot(sql, teamIds, date) {
  if (!teamIds.length) return [];
  const rows = await q(sql, `
    WITH tg AS (SELECT team_id, game_date, matchup FROM nba_team.team_game_log WHERE team_id = ANY($1::text[]) AND game_date BETWEEN $2::date - 14 AND $2::date - 1
                UNION SELECT team_id, game_date, matchup FROM nba_team.team_game_log_postseason WHERE team_id = ANY($1::text[]) AND game_date BETWEEN $2::date - 14 AND $2::date - 1)
    SELECT t.team_id, t.abbreviation, t.full_name, max(tg.game_date)::text last_game,
      count(tg.game_date) FILTER (WHERE tg.game_date >= $2::date - 3) g_prev3, count(tg.game_date) FILTER (WHERE tg.game_date >= $2::date - 5) g_prev5,
      (array_agg(tg.matchup ORDER BY tg.game_date DESC))[1] last_matchup
    FROM nba_ref.teams t LEFT JOIN tg ON tg.team_id = t.team_id WHERE t.team_id = ANY($1::text[]) GROUP BY 1, 2, 3`, [pgArr(teamIds), date]);
  return rows.map(r => {
    const rest = r.last_game ? Math.round((Date.parse(date) - Date.parse(r.last_game)) / 86400000) - 1 : null;
    const g4 = Number(r.g_prev3) + 1, g6 = Number(r.g_prev5) + 1;
    return { team_id: r.team_id, team_abbr: r.abbreviation, team_name: r.full_name, last_game: r.last_game, days_rest: rest,
      back_to_back: rest === 0 ? 1 : 0, games_in_4_nights: g4, games_in_6_nights: g6, three_in_four: g4 >= 3 ? 1 : 0, four_in_six: g6 >= 4 ? 1 : 0,
      last_game_location: r.last_matchup ? (String(r.last_matchup).includes(" @ ") ? "road" : "home") : null,
      schedule_risk_level: rest === 0 || g4 >= 3 ? "elevated" : (rest != null && rest >= 2 ? "rested" : "normal") };
  });
}

export async function officials(sql, date, game) {
  if (!game) return { source: null, rows: [] };
  const rows = await q(sql, `
    WITH ra AS (SELECT official_name full_name, ('nba_' || official_code::text) official_id, slot, 'pregame assignment' source
                FROM nba_ref.referee_assignments WHERE game_date = $1::date AND (game_id = $2 OR replace(matchup, ' ', '') = $3)),
    go AS (SELECT full_name, official_id, NULL::int slot, 'box score' source FROM nba_stats.game_officials WHERE game_id = $2),
    o AS (SELECT * FROM ra UNION ALL SELECT * FROM go WHERE NOT EXISTS (SELECT 1 FROM ra))
    SELECT o.full_name, o.slot, o.source, ot.games, ot.pf_shrunk::float pf, ot.fta_shrunk::float fta, ot.pf_delta_vs_league::float pf_delta,
           ot.league_pf::float league_pf, ot.league_fta::float league_fta
    FROM o LEFT JOIN nba_ref.official_tendency ot ON ot.official_id = o.official_id OR (ot.full_name = o.full_name AND o.official_id IS NULL)
    ORDER BY o.slot NULLS LAST, o.full_name`, [date, game.game_id || "", `${game.away_team_tricode}@${game.home_team_tricode}`]);
  return { source: rows[0] ? rows[0].source : null, rows: rows.map(r => ({ ...r, pf: r1(r.pf), fta: r1(r.fta), pf_delta: r3(r.pf_delta), league_pf: r1(r.league_pf), league_fta: r1(r.league_fta) })) };
}

export async function gameLines(sql, cfg, date, game) {
  if (!game || !game.home_name || !game.away_name) return { label: null, rows: [], summary: {} };
  const rows = await q(sql, `
    WITH lab AS (SELECT snapshot_label FROM nba_market.game_lines_snapshots
                 WHERE game_date = $1::date AND ${TEAM_NAME("home_team")} = $2 AND ${TEAM_NAME("away_team")} = $3
                 GROUP BY 1 ORDER BY array_position($4::text[], snapshot_label) NULLS LAST LIMIT 1)
    SELECT DISTINCT ON (bookmaker, market, outcome) bookmaker, market, outcome, point::float point, price::float price, snapshot_label, fetched_at
    FROM nba_market.game_lines_snapshots
    WHERE game_date = $1::date AND ${TEAM_NAME("home_team")} = $2 AND ${TEAM_NAME("away_team")} = $3 AND snapshot_label = (SELECT snapshot_label FROM lab)
    ORDER BY bookmaker, market, outcome, fetched_at DESC`, [date, game.home_name, game.away_name, pgArr(cfg.ui.game_lines_label_pref)]);
  const med = a => { const v = a.filter(x => Number.isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
  const nm = s => String(s || "").replace("Los Angeles Clippers", "LA Clippers");
  const H = game.home_name, A = game.away_name;
  const pick = (mkt, team) => rows.filter(r => r.market === mkt && (team ? nm(r.outcome) === team : true));
  const homeMl = med(pick("h2h", H).map(r => r.price)), awayMl = med(pick("h2h", A).map(r => r.price));
  const homeSp = med(pick("spreads", H).map(r => r.point)), total = med(pick("totals").filter(r => /over/i.test(r.outcome)).map(r => r.point));
  const books = new Set(rows.map(r => r.bookmaker));
  const summary = {
    label: rows[0] ? rows[0].snapshot_label : null, books: books.size, home_team: game.home_abbr, away_team: game.away_abbr,
    home_ml: homeMl, away_ml: awayMl, best_home_ml: pick("h2h", H).reduce((m, r) => Math.max(m, r.price), -1e9), best_away_ml: pick("h2h", A).reduce((m, r) => Math.max(m, r.price), -1e9),
    home_spread: homeSp, total, home_implied: total != null && homeSp != null ? r1(total / 2 - homeSp / 2) : null,
    away_implied: total != null && homeSp != null ? r1(total / 2 + homeSp / 2) : null,
    updated: rows.length ? new Date(Math.max(...rows.map(r => Date.parse(r.fetched_at)))).toISOString() : null
  };
  if (!pick("h2h", H).length) { summary.best_home_ml = null; summary.best_away_ml = null; }
  return { label: summary.label, summary, rows: rows.map(r => ({ book: r.bookmaker, market: r.market, outcome: nm(r.outcome), point: r.point, price: r.price, updated: r.fetched_at ? new Date(r.fetched_at).toISOString() : null })) };
}

// every sportsbook (non-DFS) and DFS row for this player on the slate, latest per book / market / side / line
export async function playerBoardRows(sql, cfg, date, playerName) {
  const mk = Object.entries(cfg.ui.market_to_prop);
  const rows = await q(sql, `
    WITH mk AS (SELECT * FROM unnest($3::text[], $4::text[]) AS m(market_key, prop))
    SELECT DISTINCT ON (s.bookmaker, s.market_key, s.side, s.line) s.bookmaker, s.market_key, mk.prop, s.side, s.line::float line, s.price, s.multiplier::float multiplier,
           s.snapshot_label, s.fetched_at, t.kind
    FROM nba_market.board_snapshots s
    LEFT JOIN mk ON mk.market_key = regexp_replace(s.market_key, '_(alternate|promo)$', '')
    LEFT JOIN LATERAL (SELECT kind FROM nba_market.board_tiers_v2 t WHERE t.game_date = s.game_date AND t.bookmaker = s.bookmaker AND t.player = s.player
                         AND t.base_market = regexp_replace(s.market_key, '_(alternate|promo)$', '') AND t.side = s.side AND t.line = s.line LIMIT 1) t ON s.bookmaker = 'prizepicks'
    WHERE s.game_date = $1::date AND s.player = $2
    ORDER BY s.bookmaker, s.market_key, s.side, s.line, array_position($5::text[], s.snapshot_label) NULLS LAST, s.fetched_at DESC`,
    [date, playerName, pgArr(mk.map(x => x[0])), pgArr(mk.map(x => x[1])), pgArr(cfg.ui.label_pref)]);
  const dfs = new Set(cfg.ui.dfs_books);
  const fmt = r => ({ source_key: r.bookmaker, book_key: r.bookmaker, prop_key: r.prop || r.market_key, canonical_prop_key: r.prop || r.market_key, market_key: r.market_key,
    side: r.side === "Over" ? "more" : r.side === "Under" ? "less" : r.side, line_value: r.line, price_american: r.price, multiplier: r.multiplier, kind: r.kind,
    snapshot_label: r.snapshot_label, last_update: r.fetched_at ? new Date(r.fetched_at).toISOString() : null });
  const consensus = await q(sql, `
    WITH mk AS (SELECT * FROM unnest($3::text[], $4::text[]) AS m(market_key, prop))
    SELECT DISTINCT ON (c.market_key, c.line) mk.prop, c.market_key, c.line::float line, c.books, c.p_over_mean::float p_over, c.p_over_sd::float sd, c.snapshot_label
    FROM nba_market.market_consensus c LEFT JOIN mk ON mk.market_key = regexp_replace(c.market_key, '_(alternate|promo)
    WHERE c.game_date = $1::date AND c.player = $2 ORDER BY c.market_key, c.line, array_position($5::text[], c.snapshot_label) NULLS LAST`,
    [date, playerName, pgArr(mk.map(x => x[0])), pgArr(mk.map(x => x[1])), pgArr(cfg.ui.label_pref)]);
  return { sportsbook: rows.filter(r => !dfs.has(r.bookmaker)).map(fmt), dfs: rows.filter(r => dfs.has(r.bookmaker)).map(fmt),
    consensus: consensus.map(c => ({ prop: c.prop || c.market_key, line: c.line, books: c.books, p_over: r1(c.p_over * 100), sd: r1(c.sd * 100), label: c.snapshot_label })) };
}

export async function shotProfile(sql, pidT) {
  const [quality, delta, zones] = await Promise.all([
    q(sql, `SELECT close_def_dist_range, fga_frequency::float freq, fga::float fga, fg_pct::float fg_pct, efg_pct::float efg_pct, fg3a_frequency::float fg3a_freq, fg3_pct::float fg3_pct
            FROM nba_stats.player_shot_quality WHERE player_id = $1 ORDER BY close_def_dist_range`, [pidT]),
    q(sql, `SELECT actual_efg_pct::float actual, expected_efg_pct::float expected, shot_quality_delta::float delta, total_fga::float fga FROM nba_stats.player_shot_quality_delta WHERE player_id = $1`, [pidT]),
    q(sql, `SELECT zone, fgm::float fgm, fga::float fga, fg_pct::float fg_pct FROM nba_stats.player_shot_zone_profile WHERE player_id = $1 ORDER BY fga DESC`, [pidT])]);
  const p = v => v == null ? null : r1(v <= 1.5 ? v * 100 : v);
  if (!quality.length && !delta.length && !zones.length) return null;
  return {
    by_defender_distance: quality.map(r => ({ range: r.close_def_dist_range, freq: p(r.freq), fga: r.fga, fg_pct: p(r.fg_pct), efg_pct: p(r.efg_pct), fg3a_freq: p(r.fg3a_freq), fg3_pct: p(r.fg3_pct) })),
    delta: delta[0] ? { actual_efg: p(delta[0].actual), expected_efg: p(delta[0].expected), delta_pp: delta[0].delta == null ? null : r1(Math.abs(delta[0].delta) <= 1 ? delta[0].delta * 100 : delta[0].delta), fga: delta[0].fga } : null,
    zones: zones.map(z => ({ zone: z.zone, fgm: z.fgm, fga: z.fga, fg_pct: p(z.fg_pct) }))
  };
}

export async function advanced(sql, pidT) {
  const [season, tracking, impact, onoff, playtypes] = await Promise.all([
    q(sql, `SELECT season, games_played, pts_total::float pts, reb_total::float reb, ast_total::float ast, net_rating::float net, usg_pct::float usg, ts_pct::float ts, ast_pct::float ast_pct, oreb_pct::float oreb_pct, dreb_pct::float dreb_pct
            FROM nba_stats.player_season_profile WHERE player_id = $1 ORDER BY season DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT season, avg_speed::float speed, avg_speed_off::float speed_off, avg_speed_def::float speed_def, dist_miles::float miles, dist_miles_off::float miles_off, dist_miles_def::float miles_def
            FROM nba_stats.player_tracking_profile WHERE player_id = $1 ORDER BY season DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT dpm::float dpm, o_dpm::float o_dpm, d_dpm::float d_dpm, box_dpm::float box_dpm, on_off_dpm::float on_off_dpm, rank, source_key FROM nba_stats.player_impact_rating WHERE player_id = $1 ORDER BY updated_at DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT season, net_rating_on::float net_on, net_rating_off::float net_off, net_rating_diff::float net_diff, off_rating_on::float off_on, off_rating_off::float off_off, def_rating_on::float def_on, def_rating_off::float def_off
            FROM nba_stats.player_onoff_profile WHERE player_id = $1 ORDER BY season DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT play_type, type_grouping, gp, poss_pct::float poss_pct, ppp::float ppp, efg_pct::float efg_pct, percentile::float percentile
            FROM nba_stats.player_playtype_profile WHERE player_id = $1 ORDER BY poss_pct DESC NULLS LAST LIMIT 8`, [pidT])]);
  const p = v => v == null ? null : r1(v <= 1.5 ? v * 100 : v);
  const s = season[0];
  return {
    season_profile: s ? { season: s.season, games: s.games_played, pts_per_game: s.games_played ? r1(s.pts / s.games_played) : null, reb_per_game: s.games_played ? r1(s.reb / s.games_played) : null,
      ast_per_game: s.games_played ? r1(s.ast / s.games_played) : null, usage_pct: p(s.usg), true_shooting_pct: p(s.ts), assist_pct: p(s.ast_pct), oreb_pct: p(s.oreb_pct), dreb_pct: p(s.dreb_pct), net_rating: r1(s.net) } : null,
    tracking: tracking[0] ? { season: tracking[0].season, speed_mph: r1(tracking[0].speed), speed_off: r1(tracking[0].speed_off), speed_def: r1(tracking[0].speed_def), miles: r1(tracking[0].miles), miles_off: r1(tracking[0].miles_off), miles_def: r1(tracking[0].miles_def) } : null,
    impact: impact[0] ? { dpm: r1(impact[0].dpm), o_dpm: r1(impact[0].o_dpm), d_dpm: r1(impact[0].d_dpm), box_dpm: r1(impact[0].box_dpm), on_off_dpm: r1(impact[0].on_off_dpm), rank: impact[0].rank, source: impact[0].source_key } : null,
    on_off: onoff[0] ? { season: onoff[0].season, net_on: r1(onoff[0].net_on), net_off: r1(onoff[0].net_off), net_diff: r1(onoff[0].net_diff), off_on: r1(onoff[0].off_on), off_off: r1(onoff[0].off_off), def_on: r1(onoff[0].def_on), def_off: r1(onoff[0].def_off) } : null,
    play_types: playtypes.map(r => ({ play_type: r.play_type, grouping: r.type_grouping, gp: r.gp, poss_pct: p(r.poss_pct), ppp: r3(r.ppp), efg_pct: p(r.efg_pct), percentile: p(r.percentile) }))
  };
}

// The game a team plays on a date (slate calendar), with names
export async function gameFor(sql, date, teamId) {
  const r = await q(sql, `SELECT g.game_id, g.game_date::text game_date, g.game_datetime_utc, g.home_team_id, g.away_team_id, g.home_team_tricode, g.away_team_tricode,
      g.arena_name, g.arena_city, g.game_status_text, ht.full_name home_name, at.full_name away_name, ht.abbreviation home_abbr, at.abbreviation away_abbr
    FROM nba_calendar.slate_games g LEFT JOIN nba_ref.teams ht ON ht.team_id = g.home_team_id LEFT JOIN nba_ref.teams at ON at.team_id = g.away_team_id
    WHERE g.game_date = $1::date AND $2 IN (g.home_team_id, g.away_team_id) LIMIT 1`, [date, teamId || ""]);
  const g = r[0];
  if (!g) return null;
  return { ...g, game_time_utc: g.game_datetime_utc ? new Date(g.game_datetime_utc).toISOString() : null };
}

// Everything around one player's game: used by the dossier (selected leg's game) and the profile (next game).
export async function gameContext(sql, cfg, { date, game, teamId, position }) {
  if (!game) return null;
  const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean);
  const oppId = teamId === game.home_team_id ? game.away_team_id : game.home_team_id;
  const [teams, dvp, inj, starters, sched, refs, lines] = await Promise.all([
    teamProfiles(sql, teamIds, date), defenseVsPosition(sql, oppId, position), injuries(sql, date, [game.home_name, game.away_name].filter(Boolean), game.game_time_utc),
    lastGameStarters(sql, teamIds, date), scheduleSpot(sql, teamIds, date), officials(sql, date, game), gameLines(sql, cfg, date, game)]);
  return { game, opponent_team_id: oppId, team_profiles: teams, defense_vs_position: dvp, injuries: inj, starters, schedule_spot: sched, officials: refs,
    market_summary: lines.summary, market_odds: lines.rows };
}

export { statFor, propLabel, appLabel };
, '')
    WHERE c.game_date = $1::date AND c.player = $2 ORDER BY c.market_key, c.line, array_position($5::text[], c.snapshot_label) NULLS LAST`,
    [date, playerName, pgArr(mk.map(x => x[0])), pgArr(mk.map(x => x[1])), pgArr(cfg.ui.label_pref)]);
  return { sportsbook: rows.filter(r => !dfs.has(r.bookmaker)).map(fmt), dfs: rows.filter(r => dfs.has(r.bookmaker)).map(fmt),
    consensus: consensus.map(c => ({ prop: c.prop || c.market_key, line: c.line, books: c.books, p_over: r1(c.p_over * 100), sd: r1(c.sd * 100), label: c.snapshot_label })) };
}

export async function shotProfile(sql, pidT) {
  const [quality, delta, zones] = await Promise.all([
    q(sql, `SELECT close_def_dist_range, fga_frequency::float freq, fga::float fga, fg_pct::float fg_pct, efg_pct::float efg_pct, fg3a_frequency::float fg3a_freq, fg3_pct::float fg3_pct
            FROM nba_stats.player_shot_quality WHERE player_id = $1 ORDER BY close_def_dist_range`, [pidT]),
    q(sql, `SELECT actual_efg_pct::float actual, expected_efg_pct::float expected, shot_quality_delta::float delta, total_fga::float fga FROM nba_stats.player_shot_quality_delta WHERE player_id = $1`, [pidT]),
    q(sql, `SELECT zone, fgm::float fgm, fga::float fga, fg_pct::float fg_pct FROM nba_stats.player_shot_zone_profile WHERE player_id = $1 ORDER BY fga DESC`, [pidT])]);
  const p = v => v == null ? null : r1(v <= 1.5 ? v * 100 : v);
  if (!quality.length && !delta.length && !zones.length) return null;
  return {
    by_defender_distance: quality.map(r => ({ range: r.close_def_dist_range, freq: p(r.freq), fga: r.fga, fg_pct: p(r.fg_pct), efg_pct: p(r.efg_pct), fg3a_freq: p(r.fg3a_freq), fg3_pct: p(r.fg3_pct) })),
    delta: delta[0] ? { actual_efg: p(delta[0].actual), expected_efg: p(delta[0].expected), delta_pp: delta[0].delta == null ? null : r1(Math.abs(delta[0].delta) <= 1 ? delta[0].delta * 100 : delta[0].delta), fga: delta[0].fga } : null,
    zones: zones.map(z => ({ zone: z.zone, fgm: z.fgm, fga: z.fga, fg_pct: p(z.fg_pct) }))
  };
}

export async function advanced(sql, pidT) {
  const [season, tracking, impact, onoff, playtypes] = await Promise.all([
    q(sql, `SELECT season, games_played, pts_total::float pts, reb_total::float reb, ast_total::float ast, net_rating::float net, usg_pct::float usg, ts_pct::float ts, ast_pct::float ast_pct, oreb_pct::float oreb_pct, dreb_pct::float dreb_pct
            FROM nba_stats.player_season_profile WHERE player_id = $1 ORDER BY season DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT season, avg_speed::float speed, avg_speed_off::float speed_off, avg_speed_def::float speed_def, dist_miles::float miles, dist_miles_off::float miles_off, dist_miles_def::float miles_def
            FROM nba_stats.player_tracking_profile WHERE player_id = $1 ORDER BY season DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT dpm::float dpm, o_dpm::float o_dpm, d_dpm::float d_dpm, box_dpm::float box_dpm, on_off_dpm::float on_off_dpm, rank, source_key FROM nba_stats.player_impact_rating WHERE player_id = $1 ORDER BY updated_at DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT season, net_rating_on::float net_on, net_rating_off::float net_off, net_rating_diff::float net_diff, off_rating_on::float off_on, off_rating_off::float off_off, def_rating_on::float def_on, def_rating_off::float def_off
            FROM nba_stats.player_onoff_profile WHERE player_id = $1 ORDER BY season DESC LIMIT 1`, [pidT]),
    q(sql, `SELECT play_type, type_grouping, gp, poss_pct::float poss_pct, ppp::float ppp, efg_pct::float efg_pct, percentile::float percentile
            FROM nba_stats.player_playtype_profile WHERE player_id = $1 ORDER BY poss_pct DESC NULLS LAST LIMIT 8`, [pidT])]);
  const p = v => v == null ? null : r1(v <= 1.5 ? v * 100 : v);
  const s = season[0];
  return {
    season_profile: s ? { season: s.season, games: s.games_played, pts_per_game: s.games_played ? r1(s.pts / s.games_played) : null, reb_per_game: s.games_played ? r1(s.reb / s.games_played) : null,
      ast_per_game: s.games_played ? r1(s.ast / s.games_played) : null, usage_pct: p(s.usg), true_shooting_pct: p(s.ts), assist_pct: p(s.ast_pct), oreb_pct: p(s.oreb_pct), dreb_pct: p(s.dreb_pct), net_rating: r1(s.net) } : null,
    tracking: tracking[0] ? { season: tracking[0].season, speed_mph: r1(tracking[0].speed), speed_off: r1(tracking[0].speed_off), speed_def: r1(tracking[0].speed_def), miles: r1(tracking[0].miles), miles_off: r1(tracking[0].miles_off), miles_def: r1(tracking[0].miles_def) } : null,
    impact: impact[0] ? { dpm: r1(impact[0].dpm), o_dpm: r1(impact[0].o_dpm), d_dpm: r1(impact[0].d_dpm), box_dpm: r1(impact[0].box_dpm), on_off_dpm: r1(impact[0].on_off_dpm), rank: impact[0].rank, source: impact[0].source_key } : null,
    on_off: onoff[0] ? { season: onoff[0].season, net_on: r1(onoff[0].net_on), net_off: r1(onoff[0].net_off), net_diff: r1(onoff[0].net_diff), off_on: r1(onoff[0].off_on), off_off: r1(onoff[0].off_off), def_on: r1(onoff[0].def_on), def_off: r1(onoff[0].def_off) } : null,
    play_types: playtypes.map(r => ({ play_type: r.play_type, grouping: r.type_grouping, gp: r.gp, poss_pct: p(r.poss_pct), ppp: r3(r.ppp), efg_pct: p(r.efg_pct), percentile: p(r.percentile) }))
  };
}

// The game a team plays on a date (slate calendar), with names
export async function gameFor(sql, date, teamId) {
  const r = await q(sql, `SELECT g.game_id, g.game_date::text game_date, g.game_datetime_utc, g.home_team_id, g.away_team_id, g.home_team_tricode, g.away_team_tricode,
      g.arena_name, g.arena_city, g.game_status_text, ht.full_name home_name, at.full_name away_name, ht.abbreviation home_abbr, at.abbreviation away_abbr
    FROM nba_calendar.slate_games g LEFT JOIN nba_ref.teams ht ON ht.team_id = g.home_team_id LEFT JOIN nba_ref.teams at ON at.team_id = g.away_team_id
    WHERE g.game_date = $1::date AND $2 IN (g.home_team_id, g.away_team_id) LIMIT 1`, [date, teamId || ""]);
  const g = r[0];
  if (!g) return null;
  return { ...g, game_time_utc: g.game_datetime_utc ? new Date(g.game_datetime_utc).toISOString() : null };
}

// Everything around one player's game: used by the dossier (selected leg's game) and the profile (next game).
export async function gameContext(sql, cfg, { date, game, teamId, position }) {
  if (!game) return null;
  const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean);
  const oppId = teamId === game.home_team_id ? game.away_team_id : game.home_team_id;
  const [teams, dvp, inj, starters, sched, refs, lines] = await Promise.all([
    teamProfiles(sql, teamIds, date), defenseVsPosition(sql, oppId, position), injuries(sql, date, [game.home_name, game.away_name].filter(Boolean), game.game_time_utc),
    lastGameStarters(sql, teamIds, date), scheduleSpot(sql, teamIds, date), officials(sql, date, game), gameLines(sql, cfg, date, game)]);
  return { game, opponent_team_id: oppId, team_profiles: teams, defense_vs_position: dvp, injuries: inj, starters, schedule_spot: sched, officials: refs,
    market_summary: lines.summary, market_odds: lines.rows };
}

export { statFor, propLabel, appLabel };
