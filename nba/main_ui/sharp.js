// NBA MAIN UI - the sharp-bettor layer of the dossier (card tap) and the Player Profile (2026-10-14, owner: "see all the possible
// factors ... what the best and most experienced bettors look for"). Everything here is information a professional prop bettor
// reads before a bet - all public, none of it a model internal:
//   market      - the sportsbooks' no-vig line ladder for each prop on this slate, the fair (50/50) line per snapshot, each
//                 book's main line and prices at each snapshot (line movement), and the market's over% at every DFS line
//   history     - his last games against the closing market line of each prop (over / under record vs the market)
//   env         - each recent game's script: his team's score and margin and the pregame spread and total (game-script splits,
//                 blowout risk, high / low total splits, foul trouble, projection inputs)
//   blowout     - tonight's spread-implied win and blowout probabilities (normal margin model, tunable sd - approximate)
//   availability- missed-game streaks and the minutes ramp since his latest return
//   travel      - both teams' trip into tonight: miles, time-zone change, altitude, road-trip length, games / miles in the last week
//   defenders   - the opponent's rotation with each defender's size, steals / blocks / fouls and public defensive impact (DARKO D-DPM)
//   teammates   - how his production moves with each rotation teammate's (same-game correlation, this season)
// Per-game data is strictly before the slate date. Every tunable lives in nba_config.classification_config['nba_main_ui'].sharp.
import { q, pgArr, num, r1, r3 } from "./common.js";
import { statFor } from "./insight.js";

const nameKey = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
// the names the market feeds use for this player: the board's name, else the accent- and period-free full name
export function marketNames(fullName, boardName) {
  return [...new Set([boardName, fullName, nameKey(fullName), nameKey(boardName)].filter(Boolean))];
}
const amImp = p => { const x = Number(p); if (!Number.isFinite(x) || x === 0) return null; return x > 0 ? 100 / (x + 100) : -x / (-x + 100); };
// the 50/50 line of a ladder [{line, p}] (p = no-vig P(over)), linear between the two lines that bracket 50%
export function fairLine(ladder) {
  const L = ladder.filter(x => x.p != null).sort((a, b) => a.line - b.line);
  for (let i = 0; i + 1 < L.length; i++) {
    const a = L[i], b = L[i + 1];
    if (a.p >= 0.5 && b.p <= 0.5 && a.p !== b.p) return r1(a.line + (a.p - 0.5) / (a.p - b.p) * (b.line - a.line));
  }
  const exact = L.find(x => x.p === 0.5);
  return exact ? exact.line : null;
}
// market P(over) at any line, linear between the ladder's lines (null outside the ladder)
export function pAt(ladder, line) {
  const L = ladder.filter(x => x.p != null).sort((a, b) => a.line - b.line);
  for (let i = 0; i < L.length; i++) {
    if (L[i].line === line) return L[i].p;
    if (i + 1 < L.length && L[i].line < line && line < L[i + 1].line) return L[i].p + (line - L[i].line) / (L[i + 1].line - L[i].line) * (L[i + 1].p - L[i].p);
  }
  return null;
}
const baseMarket = mk => String(mk || "").replace(/_(alternate)$/, "");

// ---- the market for this slate: no-vig ladder per prop per snapshot, fair line, per-book movement, DFS lines priced
export async function marketRead(sql, cfg, { date, names, legs }) {
  const sh = cfg.ui.sharp, m2p = cfg.ui.market_to_prop, dfs = new Set(cfg.ui.dfs_books);
  const rows = await q(sql, `
    SELECT DISTINCT ON (bookmaker, market_key, side, line, snapshot_label) bookmaker, market_key, side, line::float line, price::float price, snapshot_label, fetched_at
    FROM nba_market.board_snapshots
    WHERE game_date = $1::date AND player = ANY($2::text[]) AND market_key !~ '_promo$' AND bookmaker <> ALL($3::text[])
    ORDER BY bookmaker, market_key, side, line, snapshot_label, fetched_at DESC`, [date, pgArr(names), pgArr([...dfs])]);
  const labels = sh.market_labels_order.filter(l => rows.some(r => r.snapshot_label === l));
  // pair the two sides of every book line and remove the vig
  const pairs = new Map();
  for (const r of rows) {
    const prop = m2p[baseMarket(r.market_key)];
    if (!prop) continue;
    const k = [r.snapshot_label, r.bookmaker, prop, r.market_key, r.line].join("|");
    if (!pairs.has(k)) pairs.set(k, { label: r.snapshot_label, book: r.bookmaker, prop, alt: r.market_key.endsWith("_alternate"), line: r.line, over: null, under: null, at: null });
    const p = pairs.get(k);
    if (/^over$/i.test(r.side)) p.over = r.price; else if (/^under$/i.test(r.side)) p.under = r.price;
    p.at = p.at && p.at > r.fetched_at ? p.at : r.fetched_at;
  }
  const books = [];
  for (const p of pairs.values()) {
    const io = amImp(p.over), iu = amImp(p.under);
    if (io == null || iu == null) continue;
    books.push({ ...p, p: io / (io + iu), hold: io + iu - 1 });
  }
  const props = [...new Set(books.map(b => b.prop))];
  const out = [];
  for (const prop of props) {
    const byLabel = {};
    for (const lab of labels) {
      const set = books.filter(b => b.prop === prop && b.label === lab);
      if (!set.length) continue;
      const lines = [...new Set(set.map(b => b.line))].sort((a, b) => a - b);
      const ladder = lines.map(line => { const s = set.filter(b => b.line === line); return { line, p: s.reduce((a, b) => a + b.p, 0) / s.length, books: new Set(s.map(b => b.book)).size }; });
      // each book's main line: its standard (non-alternate) line closest to 50/50
      const mains = {};
      for (const b of set.filter(x => !x.alt)) { const cur = mains[b.book]; if (!cur || Math.abs(b.p - 0.5) < Math.abs(cur.p - 0.5)) mains[b.book] = b; }
      byLabel[lab] = { ladder, fair: fairLine(ladder), books: new Set(set.map(b => b.book)).size,
        mains: Object.values(mains).map(b => ({ book: b.book, line: b.line, over: b.over, under: b.under, p_over: r1(100 * b.p), hold: r1(100 * b.hold), at: b.at ? new Date(b.at).toISOString() : null })) };
    }
    const labs = Object.keys(byLabel);
    if (!labs.length) continue;
    const first = byLabel[labs[0]], last = byLabel[labs[labs.length - 1]];
    const lastLadder = last.ladder;
    // DFS lines on the board for this prop, priced by the latest market ladder
    const dfsLines = [...new Set((legs || []).filter(l => l.canonical_prop_key === prop).map(l => Number(l.line_value)))].sort((a, b) => a - b)
      .map(line => { const p = pAt(lastLadder, line); return { line, p_over: p == null ? null : r1(100 * p), offers: (legs || []).filter(l => l.canonical_prop_key === prop && Number(l.line_value) === line)
        .map(l => ({ app: l.source_key, line_type: l.line_type || "regular", side: l.selected_side, multiplier: l.app_multiplier ?? null })) }; });
    const allLines = [...new Set(labs.flatMap(lb => byLabel[lb].ladder.map(x => x.line)))].sort((a, b) => a - b);
    out.push({ prop, labels: labs, books: Math.max(...labs.map(lb => byLabel[lb].books)),
      fair: Object.fromEntries(labs.map(lb => [lb, byLabel[lb].fair])),
      fair_move: first.fair != null && last.fair != null && labs.length > 1 ? r1(last.fair - first.fair) : null,
      ladder: allLines.map(line => ({ line, ...Object.fromEntries(labs.map(lb => { const x = byLabel[lb].ladder.find(y => y.line === line); return [lb, x ? r1(100 * x.p) : null]; })),
        books: Math.max(0, ...labs.map(lb => { const x = byLabel[lb].ladder.find(y => y.line === line); return x ? x.books : 0; })) })),
      book_lines: [...new Set(labs.flatMap(lb => byLabel[lb].mains.map(m => m.book)))].sort().map(book => ({ book,
        ...Object.fromEntries(labs.map(lb => [lb, byLabel[lb].mains.find(m => m.book === book) || null])) })),
      dfs_lines: dfsLines });
  }
  const order = Object.values(m2p);
  out.sort((a, b) => order.indexOf(a.prop) - order.indexOf(b.prop));
  return { date, labels, label_note: "routine = earlier in the day, window = pre-game window, close = at tip", props: out };
}

// ---- his recent games against the closing market: the fair (50/50) line of each prop and what he actually did
export async function marketHistory(sql, cfg, { names, games }) {
  const sh = cfg.ui.sharp, m2p = cfg.ui.market_to_prop;
  const played = games.filter(g => num(g.min) > 0).slice(0, sh.history_lookback_games);
  if (!played.length) return { props: [] };
  const mkeys = Object.entries(m2p).filter(([, p]) => sh.history_props.includes(p)).map(([k]) => k);
  const rows = await q(sql, `
    SELECT game_date::text game_date, market_key, snapshot_label, line::float line, books, p_over_mean::float p
    FROM nba_market.market_consensus
    WHERE game_date = ANY($1::date[]) AND player = ANY($2::text[]) AND regexp_replace(market_key, '_alternate$', '') = ANY($3::text[]) AND snapshot_label = ANY($4::text[])`,
    [pgArr(played.map(g => g.game_date)), pgArr(names), pgArr(mkeys), pgArr(sh.history_label_pref)]);
  const props = [];
  for (const prop of sh.history_props) {
    const mks = new Set(mkeys.filter(k => m2p[k] === prop));
    const list = [];
    for (const g of played) {
      const rs = rows.filter(r => r.game_date === g.game_date && mks.has(baseMarket(r.market_key)));
      if (!rs.length) continue;
      const lab = sh.history_label_pref.find(l => rs.some(r => r.snapshot_label === l));
      const set = rs.filter(r => r.snapshot_label === lab);
      const lines = [...new Set(set.map(r => r.line))];
      // main + alternate rows at one line: weight each by its book count
      const ladder = lines.map(line => { const s = set.filter(r => r.line === line); const w = s.reduce((a, r) => a + (Number(r.books) || 1), 0); return { line, p: s.reduce((a, r) => a + r.p * (Number(r.books) || 1), 0) / w }; });
      const fair = fairLine(ladder);
      const actual = statFor(prop, g);
      if (fair == null || actual == null) continue;
      list.push({ game_date: g.game_date, opp: (g.is_home ? "vs " : "@ ") + (g.opponent_abbr || ""), label: lab, fair, actual, diff: r1(actual - fair), result: actual > fair ? "Over" : actual < fair ? "Under" : "Push" });
      if (list.length >= sh.history_games) break;
    }
    if (!list.length) continue;
    const o = list.filter(x => x.result === "Over").length, u = list.filter(x => x.result === "Under").length;
    props.push({ prop, games: list.length, over: o, under: u, avg_diff: r1(list.reduce((a, x) => a + x.diff, 0) / list.length),
      l5_over: list.slice(0, 5).filter(x => x.result === "Over").length, l5_games: Math.min(5, list.length),
      line_trend: list.length >= 2 ? r1(list[0].fair - list[list.length - 1].fair) : null, rows: list });
  }
  return { label_pref: sh.history_label_pref, props };
}

// ---- each recent game's script: his line, his team's score / margin, and the pregame spread and total (median of books)
export async function gameEnvironment(sql, cfg, { pidT, beforeDate }) {
  const sh = cfg.ui.sharp;
  const rows = await q(sql, `
    WITH pg AS (
      SELECT * FROM (
        SELECT 'Regular' phase, season, game_id, game_date, team_id, matchup, wl, min::float min, pts::float pts, reb::float reb, ast::float ast, fg3m::float fg3m,
               stl::float stl, blk::float blk, tov::float tov, pf::float pf, fga::float fga, fta::float fta
          FROM nba_stats.player_game_log WHERE player_id = $1 AND game_date < $2::date AND min > 0
        UNION ALL
        SELECT 'Playoffs', season, game_id, game_date, team_id, matchup, wl, min::float, pts::float, reb::float, ast::float, fg3m::float, stl::float, blk::float, tov::float,
               pf::float, fga::float, fta::float
          FROM nba_stats.player_game_log_postseason WHERE player_id = $1 AND game_date < $2::date AND min > 0) x
      ORDER BY game_date DESC LIMIT $3),
    tg AS (SELECT team_id, game_id, pts::float tpts, plus_minus::float tpm FROM nba_team.team_game_log WHERE game_id IN (SELECT game_id FROM pg)
           UNION ALL SELECT team_id, game_id, pts::float, plus_minus::float FROM nba_team.team_game_log_postseason WHERE game_id IN (SELECT game_id FROM pg)),
    nm AS (SELECT pg.game_id, pg.game_date, t.full_name team_name, pg.matchup LIKE '% vs. %' is_home FROM pg JOIN nba_ref.teams t ON t.team_id = pg.team_id),
    gl AS (SELECT nm.game_id, s.market, s.outcome, s.point::float point, s.snapshot_label
           FROM nm JOIN nba_market.game_lines_snapshots s ON s.game_date = nm.game_date AND s.snapshot_label = ANY($4::text[]) AND s.market IN ('spreads', 'totals')
            AND replace(CASE WHEN nm.is_home THEN s.home_team ELSE s.away_team END, 'Los Angeles Clippers', 'LA Clippers') = nm.team_name),
    lab AS (SELECT DISTINCT ON (game_id) game_id, snapshot_label FROM gl ORDER BY game_id, array_position($4::text[], snapshot_label)),
    ln AS (SELECT gl.game_id,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY gl.point) FILTER (WHERE gl.market = 'spreads'
               AND replace(gl.outcome, 'Los Angeles Clippers', 'LA Clippers') = (SELECT team_name FROM nm WHERE nm.game_id = gl.game_id)) spread,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY gl.point) FILTER (WHERE gl.market = 'totals' AND gl.outcome ILIKE 'over') total
           FROM gl JOIN lab ON lab.game_id = gl.game_id AND lab.snapshot_label = gl.snapshot_label GROUP BY 1)
    SELECT pg.phase, pg.season, pg.game_id, pg.game_date::text game_date, pg.matchup, pg.wl, pg.min, pg.pts, pg.reb, pg.ast, pg.fg3m, pg.stl, pg.blk, pg.tov, pg.pf, pg.fga, pg.fta,
           tg.tpts, tg.tpm, ln.spread::float spread, ln.total::float total
    FROM pg LEFT JOIN tg ON tg.game_id = pg.game_id AND tg.team_id = pg.team_id LEFT JOIN ln ON ln.game_id = pg.game_id
    ORDER BY pg.game_date DESC`, [pidT, beforeDate, sh.env_games, pgArr(cfg.ui.game_lines_label_pref)]);
  return rows.map(r => ({ phase: r.phase, season: r.season, game_date: r.game_date, matchup: r.matchup, wl: r.wl, min: r1(r.min), pts: r.pts, reb: r.reb, ast: r.ast,
    fg3m: r.fg3m, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf, fga: r.fga, fta: r.fta, team_pts: r.tpts, margin: r.tpm,
    opp_pts: r.tpts != null && r.tpm != null ? r.tpts - r.tpm : null, spread: r.spread, total: r.total }));
}

// ---- tonight's spread-implied script (normal margin model around the spread; approximate by construction)
function normCdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
export function blowoutRisk(cfg, spread, total) {
  const sh = cfg.ui.sharp;
  if (spread == null || !Number.isFinite(Number(spread))) return null;
  const mu = -Number(spread), sd = sh.margin_sd, B = sh.blowout_margin;
  const pWin = 1 - normCdf((0 - mu) / sd), pBigWin = 1 - normCdf((B - mu) / sd), pBigLoss = normCdf((-B - mu) / sd);
  return { spread: Number(spread), total: total == null ? null : Number(total), expected_margin: r1(mu), margin_sd: sd, blowout_margin: B,
    p_win: r1(100 * pWin), p_win_by_blowout: r1(100 * pBigWin), p_lose_by_blowout: r1(100 * pBigLoss), p_blowout: r1(100 * (pBigWin + pBigLoss)),
    team_implied: total != null ? r1(Number(total) / 2 - Number(spread) / 2) : null };
}

// ---- missed-game streaks and the minutes ramp since his latest return (his current team, this season)
export async function availabilityRamp(sql, cfg, { pidT, teamId, beforeDate, env }) {
  const sh = cfg.ui.sharp;
  if (!teamId || !env.length) return null;
  const season = env[0].season;
  const mine = env.filter(g => g.season === season);
  const rows = await q(sql, `
    -- traded this season: count only his current team's games since he joined; otherwise the team's whole season (a season-long absence shows)
    WITH f AS (SELECT CASE WHEN EXISTS (SELECT 1 FROM nba_stats.player_game_log WHERE player_id = $1 AND season = $3 AND team_id <> $2 AND game_date < $4::date)
                      THEN (SELECT min(game_date) FROM nba_stats.player_game_log WHERE player_id = $1 AND team_id = $2 AND season = $3) END d)
    SELECT game_date::text game_date, phase FROM (
      SELECT game_date, 'Regular' phase FROM nba_team.team_game_log WHERE team_id = $2 AND season = $3 AND game_date < $4::date
      UNION ALL SELECT game_date, 'Playoffs' FROM nba_team.team_game_log_postseason WHERE team_id = $2 AND season = $3 AND game_date < $4::date) t
    WHERE game_date >= COALESCE((SELECT d FROM f), '1900-01-01'::date) ORDER BY game_date`, [pidT, teamId, season, beforeDate]);
  if (!rows.length) return null;
  const played = new Set(mine.map(g => g.game_date));
  const streaks = [];
  let cur = null;
  for (const r of rows) {
    if (!played.has(r.game_date)) { if (!cur) cur = { from: r.game_date, to: r.game_date, games: 0 }; cur.to = r.game_date; cur.games++; }
    else if (cur) { cur.return_date = r.game_date; streaks.push(cur); cur = null; }
  }
  const out = { season, team_games: rows.length, played: rows.filter(r => played.has(r.game_date)).length, missed: rows.filter(r => !played.has(r.game_date)).length,
    current_out_streak: cur ? cur.games : 0, current_out_since: cur ? cur.from : null, absences: streaks.filter(s => s.games >= sh.absence_min_team_games).reverse(), ramp: null };
  const last = out.absences[0];
  if (last) {
    const after = mine.filter(g => g.game_date >= last.return_date).reverse();
    const before = mine.filter(g => g.game_date < last.from);
    const avg = (set, k) => set.length ? r1(set.reduce((a, g) => a + (num(g[k]) || 0), 0) / set.length) : null;
    out.ramp = { return_date: last.return_date, games_missed: last.games, games_since_return: after.length,
      since_return: after.slice(0, sh.ramp_games).map(g => ({ game_date: g.game_date, min: g.min, pts: g.pts, reb: g.reb, ast: g.ast })),
      min_since_return: avg(after, "min"), min_before_absence: avg(before, "min"), pts_since_return: avg(after, "pts"), pts_before_absence: avg(before, "pts") };
  }
  return out;
}

// ---- both teams' trip into tonight: distance, time-zone change, altitude, road-trip length, schedule density
function hav(a, b) { const R = 3958.8, rad = x => x * Math.PI / 180; const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
export function tzOffset(tz, dateStr) {
  try {
    const d = new Date(dateStr + "T20:00:00Z");
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(d).map(p => [p.type, p.value]));
    const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
    return Math.round((local - d.getTime()) / 3600000);
  } catch { return null; }
}
export async function travel(sql, cfg, { game, date }) {
  const sh = cfg.ui.sharp, geo = sh.team_geo;
  if (!game) return [];
  const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean);
  const rows = await q(sql, `
    SELECT t.team_id, t.abbreviation, x.game_date::text game_date, x.matchup FROM (
      SELECT team_id, game_date, matchup FROM nba_team.team_game_log WHERE team_id = ANY($1::text[]) AND game_date BETWEEN $2::date - 30 AND $2::date - 1
      UNION SELECT team_id, game_date, matchup FROM nba_team.team_game_log_postseason WHERE team_id = ANY($1::text[]) AND game_date BETWEEN $2::date - 30 AND $2::date - 1) x
    JOIN nba_ref.teams t ON t.team_id = x.team_id ORDER BY x.team_id, x.game_date`, [pgArr(teamIds), date]);
  const tonightHome = game.home_abbr;
  const out = [];
  for (const tid of teamIds) {
    const abbr = tid === game.home_team_id ? game.home_abbr : game.away_abbr;
    const gs = rows.filter(r => r.team_id === tid).map(r => { const away = String(r.matchup).includes(" @ "); const parts = String(r.matchup).split(away ? " @ " : " vs. ");
      return { date: r.game_date, away, site: away ? (parts[1] || "").trim() : abbr }; });
    const path = gs.concat([{ date, away: tid !== game.home_team_id, site: tonightHome, tonight: true }]);
    const last = gs[gs.length - 1] || null;
    const from = last ? geo[last.site] : null, to = geo[tonightHome];
    let roadTrip = 0;
    if (tid !== game.home_team_id) { roadTrip = 1; for (let i = gs.length - 1; i >= 0 && gs[i].away; i--) roadTrip++; }
    let homeStand = 0;
    if (tid === game.home_team_id) { homeStand = 1; for (let i = gs.length - 1; i >= 0 && !gs[i].away; i--) homeStand++; }
    const since = new Date(Date.parse(date) - sh.travel_days * 86400000).toISOString().slice(0, 10);
    const week = path.filter(p => p.date >= since);
    let weekMiles = 0;
    for (let i = 1; i < path.length; i++) if (path[i].date >= since) { const a = geo[path[i - 1].site], b = geo[path[i].site]; if (a && b) weekMiles += hav(a, b); }
    const tzFrom = from ? tzOffset(from.tz, date) : null, tzTo = to ? tzOffset(to.tz, date) : null;
    out.push({ team_id: tid, team: abbr, is_home: tid === game.home_team_id, last_game: last ? last.date : null, last_site: last ? last.site : null,
      rest_days: last ? Math.round((Date.parse(date) - Date.parse(last.date)) / 86400000) - 1 : null,
      miles_to_tonight: from && to ? Math.round(hav(from, to)) : null, tz_change_hours: tzFrom != null && tzTo != null ? tzTo - tzFrom : null,
      tonight_tz: to ? to.tz : null, tonight_elev_ft: to ? to.elev_ft : null, high_altitude: to ? to.elev_ft >= sh.altitude_flag_ft : null,
      road_trip_game: roadTrip || null, home_stand_game: homeStand || null, games_last_week: week.length, miles_last_week: Math.round(weekMiles),
      recent_path: path.slice(-6).map(p => ({ date: p.date, site: p.site, away: p.away, tonight: !!p.tonight })) });
  }
  return out;
}

// ---- the opponent's rotation: size, defensive box numbers, fouls and the public DARKO defensive impact (D-DPM, + = better)
export async function opponentDefenders(sql, cfg, { oppTeamId, beforeDate }) {
  const sh = cfg.ui.sharp;
  if (!oppTeamId) return null;
  const rows = await q(sql, `
    WITH s AS (SELECT max(season) season FROM nba_team.team_game_log WHERE team_id = $1 AND game_date < $2::date),
    lg AS (SELECT player_id, team_id, game_date, min::float min, stl::float stl, blk::float blk, pf::float pf, dreb::float dreb
           FROM nba_stats.player_game_log WHERE season = (SELECT season FROM s) AND game_date < $2::date AND min > 0
             AND player_id IN (SELECT DISTINCT player_id FROM nba_stats.player_game_log WHERE team_id = $1 AND season = (SELECT season FROM s) AND game_date < $2::date)),
    cur AS (SELECT DISTINCT ON (player_id) player_id, team_id FROM lg ORDER BY player_id, game_date DESC),
    agg AS (SELECT lg.player_id, count(*)::int gp, avg(min) min, avg(stl) stl, avg(blk) blk, avg(pf) pf, avg(dreb) dreb, sum(min) tot
            FROM lg JOIN cur ON cur.player_id = lg.player_id AND cur.team_id = $1 WHERE lg.team_id = $1 GROUP BY 1),
    dk AS (SELECT DISTINCT ON (player_id) player_id, d_dpm::float d_dpm, dpm::float dpm, updated_at FROM nba_stats.player_impact_rating ORDER BY player_id, updated_at DESC)
    SELECT agg.*, p.full_name, p.position, p.height_inches, p.weight_lbs, dk.d_dpm, dk.dpm, dk.updated_at, (SELECT season FROM s) season
    FROM agg JOIN nba_ref.players p ON p.player_id = agg.player_id LEFT JOIN dk ON dk.player_id = agg.player_id
    ORDER BY agg.tot DESC LIMIT $3`, [oppTeamId, beforeDate, sh.opp_rotation]);
  if (!rows.length) return null;
  const upd = rows.map(r => r.updated_at).filter(Boolean).sort().pop();
  return { season: rows[0].season, darko_updated: upd ? new Date(upd).toISOString().slice(0, 10) : null,
    rows: rows.map(r => ({ player_id: r.player_id, name: r.full_name, position: r.position, height_inches: r.height_inches, weight_lbs: r.weight_lbs, gp: r.gp,
      min: r1(r.min), stl: r1(r.stl), blk: r1(r.blk), pf: r1(r.pf), dreb: r1(r.dreb), stl36: r.min ? r1(36 * r.stl / r.min) : null, blk36: r.min ? r1(36 * r.blk / r.min) : null,
      d_dpm: r.d_dpm == null ? null : r1(r.d_dpm), dpm: r.dpm == null ? null : r1(r.dpm) })) };
}

// ---- same-game correlation with each rotation teammate this season (Pearson r; needs corr_min_games shared games)
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
export async function teammateCorrelation(sql, cfg, { pidT, teamId, beforeDate, env }) {
  const sh = cfg.ui.sharp;
  if (!teamId || !env.length) return null;
  const season = env[0].season;
  const rows = await q(sql, `
    WITH me AS (SELECT game_id, pts::float pts, reb::float reb, ast::float ast, fg3m::float fg3m FROM nba_stats.player_game_log
                WHERE player_id = $1 AND team_id = $2 AND season = $3 AND game_date < $4::date AND min > 0),
    mates AS (SELECT player_id FROM nba_stats.player_game_log WHERE team_id = $2 AND season = $3 AND game_date < $4::date AND min > 0 AND player_id <> $1
              GROUP BY 1 ORDER BY sum(min) DESC LIMIT $5)
    SELECT t.player_id, p.full_name, me.pts mpts, me.reb mreb, me.ast mast, me.fg3m m3, t.pts::float pts, t.reb::float reb, t.ast::float ast, t.fg3m::float fg3m, t.min::float min
    FROM nba_stats.player_game_log t JOIN me ON me.game_id = t.game_id JOIN mates USING (player_id) LEFT JOIN nba_ref.players p ON p.player_id = t.player_id
    WHERE t.team_id = $2 AND t.min > 0`, [pidT, teamId, season, beforeDate, sh.teammates]);
  const by = new Map();
  for (const r of rows) { if (!by.has(r.player_id)) by.set(r.player_id, { name: r.full_name, g: [] }); by.get(r.player_id).g.push(r); }
  const out = [];
  for (const [pid, v] of by) {
    const g = v.g, n = g.length;
    const r = (fa, fb) => n >= sh.corr_min_games ? r3(pearson(g.map(fa), g.map(fb))) : null;
    const pra = x => x.pts + x.reb + x.ast, mpra = x => x.mpts + x.mreb + x.mast;
    out.push({ player_id: pid, name: v.name, games: n, min: r1(g.reduce((a, x) => a + x.min, 0) / n),
      r_pts_pts: r(x => x.mpts, x => x.pts), r_reb_reb: r(x => x.mreb, x => x.reb), r_ast_pts: r(x => x.mast, x => x.pts), r_pts_ast: r(x => x.mpts, x => x.ast),
      r_pra_pra: r(mpra, pra), r_3pm_3pm: r(x => x.m3, x => x.fg3m) });
  }
  out.sort((a, b) => b.min - a.min);
  return { season, min_games: sh.corr_min_games, rows: out };
}

// everything above for one player and game; the dossier and the profile both call this. Each piece fails alone.
export async function sharpDepth(sql, cfg, { pidT, date, teamId, game, names, legs, games, marketSummary }) {
  const safe = p => Promise.resolve().then(() => p()).catch(e => ({ __error: String(e && e.message ? e.message : e).slice(0, 200) }));
  const oppTeamId = game ? (game.home_team_id === teamId ? game.away_team_id : game.home_team_id) : null;
  const envP = safe(() => gameEnvironment(sql, cfg, { pidT, beforeDate: date }));
  const [market, history, env, defenders, trav] = await Promise.all([
    safe(() => game ? marketRead(sql, cfg, { date, names, legs }) : null), safe(() => marketHistory(sql, cfg, { names, games })), envP,
    safe(() => opponentDefenders(sql, cfg, { oppTeamId, beforeDate: date })), safe(() => travel(sql, cfg, { game, date }))]);
  const envRows = Array.isArray(env) ? env : [];
  const [avail, mates, ms] = await Promise.all([
    safe(() => availabilityRamp(sql, cfg, { pidT, teamId, beforeDate: date, env: envRows })),
    safe(() => teammateCorrelation(sql, cfg, { pidT, teamId, beforeDate: date, env: envRows })),
    Promise.resolve(marketSummary)]);
  // tonight's spread / total from his team's side
  let tonight = null;
  if (ms && ms.home_spread != null && game) { const sp = game.home_team_id === teamId ? ms.home_spread : -ms.home_spread; tonight = blowoutRisk(cfg, sp, ms.total); }
  const parts = { market, history, env, defenders, travel: trav, availability: avail, teammates: mates };
  const errors = Object.entries(parts).filter(([, v]) => v && v.__error).map(([k, v]) => `${k}: ${v.__error}`);
  const ok = v => (v && v.__error ? null : v);
  const sh = cfg.ui.sharp;
  return { sharp: { market: ok(market), market_history: ok(history), env: ok(env) || [], tonight_script: tonight, availability: ok(avail), travel: ok(trav) || [],
    opp_defenders: ok(defenders), teammate_corr: ok(mates), names,
    config: { blowout_margin: sh.blowout_margin, margin_sd: sh.margin_sd, big_favorite_spread: sh.big_favorite_spread, proj_minutes_window: sh.proj_minutes_window,
      proj_rate_weights: sh.proj_rate_weights, form_z_window: sh.form_z_window, foul_trouble_pf: sh.foul_trouble_pf, corr_min_games: sh.corr_min_games },
    errors } };
}
