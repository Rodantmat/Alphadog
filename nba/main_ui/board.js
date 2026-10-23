// NBA MAIN UI - the board: /api/main-board/current, /api/main-board/filters, and the leg loader every other screen reuses.
// SOURCE: nba_score.board_scored (written by P3, one set per slate) - every leg the DFS apps offer, priced (final_hp), with
// confidence and score. Enriched here, read-only, with: the player's team for the slate (latest game-log team, else roster),
// the game (nba_calendar.slate_games), PrizePicks variation (board_tiers_v2 kind / tier) and model factor (pp_leg_price),
// Underdog / Sleeper payout multipliers (board_snapshots), and the player's recent box scores for the card's scouting line.
import { q, pgArr, num, r1, isoDate, legId, sideOut, propLabel, propFamily, appLabel, lineTypeLabel, cap } from "./common.js";
import { composeLegInsight } from "./insight.js";

const STATS_COLS = "min, pts, reb, ast, fg3m, fg3a, stl, blk, tov, fgm, fga, ftm, fta, oreb, dreb, pf, plus_minus";

// UNDERDOG PLACEABILITY (2026-10-20): an alternate rung of a prediction-market line is in the feed but was not offered in the app
// (nba_market.ud_line_flags, written by the archiver; tunable nba_main_ui.ud_alt_policy.hide_prediction_market_alts, default on).
// The board screens those legs out; the Slips screen loads them unscreened (a slip already built must still resolve its legs) and drops them from its pool.
const UD_HIDE = a => `(${a}.app = 'underdog'
          AND coalesce((SELECT config_json->'ud_alt_policy'->>'hide_prediction_market_alts' FROM nba_config.classification_config WHERE config_key = 'nba_main_ui'), 'true') <> 'false'
          AND EXISTS (SELECT 1 FROM nba_market.ud_line_flags uf JOIN unnest($3::text[], $4::text[]) um0(market_key, prop) ON um0.market_key = uf.base_market
                      WHERE uf.game_date = ${a}.game_date AND uf.hide AND uf.player = ${a}.player AND uf.line = ${a}.line AND um0.prop = ${a}.prop))`;

// Builds the enriched-leg query. `where` is extra SQL on board_scored alias b (its params start at $6). `screen` false keeps the unplaceable Underdog legs (flagged ud_hide).
// STARTED GAMES (owner 2026-10-20 19:44 PT: "it should not show started legs/games"): on a LIVE slate (today or later, Pacific) a leg
// whose game has tipped is no longer playable - the server leaves it out of the board AND of the filter counts (the browser's own
// started check stays as a second guard). The leg's game is its own scored game (nba_score.final_hp.game_id -> slate_games tip time).
// A past slate (replay) keeps every leg.
const STARTED_CTE = `stp AS (SELECT DISTINCT fx.player_id FROM nba_score.final_hp fx
                JOIN nba_calendar.slate_games sx ON sx.game_id = fx.game_id AND sx.game_date = fx.game_date
                WHERE fx.game_date = $1::date AND $1::date >= (now() AT TIME ZONE 'America/Los_Angeles')::date
                  AND sx.game_datetime_utc <= now())`;
const NOT_STARTED = a => `AND ${a}.player_id NOT IN (SELECT player_id FROM stp)`;

// PRICE LOOKUPS (2026-10-21 speed fix). The PrizePicks variation (board_tiers_v2), model factor (pp_leg_price) and the
// Underdog / Sleeper / Fliff multiplier (board_snapshots) of the legs in CTE `src`. Each source row's market key is normalised
// ONCE (MATERIALIZED) and then hash-joined to the market map - joining on regexp_replace(...) = mk.market_key made the planner
// re-run the regexp for every (row x 38 markets) pair: 1.2M regexp calls per lookup, ~3-5 s each on a full slate (EXPLAIN 10-21).
// Same rows, same DISTINCT ON order as before. Each lookup carries `k` = player|prop|side|line for a single-key join.
// the market-key normaliser (kept out of the literal text so no tool reads its $ + quote as a replacement token)
const NORM_RE = "'_(alternate|promo)" + "$" + "'";
const LKEY = a => `concat_ws('|', ${a}.player, mk.prop, ${a}.side, (${a}.line::float8)::text)`;
function lookupCtes(src, udBooks) {
  return `pk0 AS MATERIALIZED (SELECT t.player, t.side, t.line, t.kind, t.tier, t.anchor_line, t.snapshot_label, t.built_at,
              regexp_replace(t.base_market, ${NORM_RE}, '') bm
       FROM nba_market.board_tiers_v2 t
       WHERE t.game_date = $1::date AND t.bookmaker = 'prizepicks' AND t.player IN (SELECT DISTINCT player FROM ${src} WHERE app = 'prizepicks')),
pk AS (SELECT DISTINCT ON (t.player, mk.prop, t.side, t.line) t.player, mk.prop, t.side, t.line, t.kind, t.tier, t.anchor_line, ${LKEY("t")} k
       FROM pk0 t JOIN mk ON mk.market_key = t.bm
       ORDER BY t.player, mk.prop, t.side, t.line, array_position($5::text[], t.snapshot_label) NULLS LAST, t.built_at DESC),
pf0 AS MATERIALIZED (SELECT p.player, p.side, p.line, p.factor, p.implied_p, p.snapshot_label, regexp_replace(p.base_market, ${NORM_RE}, '') bm
       FROM nba_market.pp_leg_price p
       WHERE p.game_date = $1::date AND p.factor IS NOT NULL AND p.player IN (SELECT DISTINCT player FROM ${src} WHERE app = 'prizepicks')),
pf AS (SELECT DISTINCT ON (p.player, mk.prop, p.side, p.line) p.player, mk.prop, p.side, p.line, p.factor, p.implied_p, ${LKEY("p")} k
       FROM pf0 p JOIN mk ON mk.market_key = p.bm
       ORDER BY p.player, mk.prop, p.side, p.line, array_position($5::text[], p.snapshot_label) NULLS LAST),
um0 AS MATERIALIZED (SELECT s.bookmaker, s.player, s.side, s.line, s.multiplier, s.price, s.snapshot_label, s.fetched_at,
              regexp_replace(s.market_key, ${NORM_RE}, '') bm
       FROM nba_market.board_snapshots s
       WHERE s.game_date = $1::date AND s.bookmaker IN (${udBooks})
         AND s.player IN (SELECT DISTINCT player FROM ${src} WHERE app IN (${udBooks}))),
um AS (SELECT DISTINCT ON (s.bookmaker, s.player, mk.prop, s.side, s.line) s.bookmaker, s.player, mk.prop, s.side, s.line, s.multiplier, s.price, ${LKEY("s")} k
       FROM um0 s JOIN mk ON mk.market_key = s.bm
       ORDER BY s.bookmaker, s.player, mk.prop, s.side, s.line, array_position($5::text[], s.snapshot_label) NULLS LAST, s.fetched_at DESC)`;
}

export function legsSql(where, limit, screen = true) {
  return `
WITH ${STARTED_CTE},
bs AS (
  -- ONE NUMBER (2026-10-23; owner 21:01 PT: "the final hit probability and board hit probability should be the same thing"):
  -- final_hp / score / edge are board_scored's own - P3 writes there final_hp's stored number for every leg final_hp holds (what
  -- the slip engine reads) and the same board-centred chain for the rest (score_board_legs.py step 4b). The market-anchored
  -- board_true_hp (2026-10-14 .. 10-22 main number) is no longer the main number: its fields stay beside it for reference only.
  SELECT b.game_date, b.app, b.player_id, b.player, b.prop, b.line, b.side, b.final_hp, b.baseline_hp, b.cal_shift,
         b.confidence, b.score, b.edge, b.interpolated, b.built_at, b.model_hp, b.model_score, b.market_hp, b.hp_anchor,
         b.dk_line, b.dk_p, b.pp_line, b.true_fit, b.ud_hide
  FROM (SELECT b0.game_date, b0.app, b0.player_id, b0.player, b0.prop, b0.line, b0.side, b0.baseline_hp, b0.cal_shift, b0.confidence,
               b0.interpolated, b0.built_at, b0.final_hp, b0.score,
               b0.edge, b0.final_hp model_hp, b0.score model_score, th.market_hp, th.anchor hp_anchor,
               th.dk_line, th.dk_p, th.pp_line, th.fit_set true_fit, ${UD_HIDE("b0")} ud_hide
        FROM nba_score.board_scored b0
        LEFT JOIN nba_score.board_true_hp th ON th.game_date = b0.game_date AND th.player_id = b0.player_id AND th.prop = b0.prop
                                            AND th.line = b0.line AND th.side = b0.side
        WHERE b0.game_date = $1::date AND b0.app = ANY($2::text[]) ${screen ? "AND NOT " + UD_HIDE("b0") : ""} ${screen ? NOT_STARTED("b0") : ""}) b
  WHERE true ${where || ""}
  ORDER BY b.score DESC, b.final_hp DESC, b.player, b.prop, b.line, b.side
  LIMIT ${Number(limit) || 200}),
pids AS (SELECT DISTINCT player_id, ('nba_' || player_id) pid_t, player_id::bigint pid_n FROM bs WHERE player_id ~ '^[0-9]+$'),
g AS (SELECT game_id, game_datetime_utc, home_team_id, away_team_id, home_team_tricode, away_team_tricode, arena_name, arena_city,
             game_status, game_status_text FROM nba_calendar.slate_games WHERE game_date = $1::date),
gteams AS (SELECT home_team_id t FROM g UNION SELECT away_team_id FROM g),
gl AS (SELECT DISTINCT ON (x.player_id) x.player_id, x.team_id FROM (
         SELECT player_id, team_id, game_date FROM nba_stats.player_game_log WHERE nba_player_id IN (SELECT pid_n FROM pids) AND game_date < $1::date
         UNION ALL
         SELECT player_id, team_id, game_date FROM nba_stats.player_game_log_postseason WHERE player_id IN (SELECT pid_t FROM pids) AND game_date < $1::date) x
       ORDER BY x.player_id, x.game_date DESC),
gc AS (SELECT player_id, count(*) n FROM nba_stats.player_game_log
       WHERE nba_player_id IN (SELECT pid_n FROM pids) AND game_date < $1::date AND game_date >= $1::date - 365 GROUP BY player_id),
-- live slate (today or later): the CURRENT roster team first - a mover's old team may play the same night (2026-10-17: 161
-- active players' last box score is for another team); a past slate: the box-score team of that time first
tm AS (SELECT p.player_id, p.pid_t, pl.position,
         CASE WHEN $1::date >= (now() AT TIME ZONE 'America/Los_Angeles')::date AND pl.active = 1 AND pl.team_id IN (SELECT t FROM gteams) THEN pl.team_id
              WHEN gl.team_id IN (SELECT t FROM gteams) THEN gl.team_id
              WHEN pl.team_id IN (SELECT t FROM gteams) THEN pl.team_id
              ELSE COALESCE(gl.team_id, pl.team_id) END team_id
       FROM pids p LEFT JOIN gl ON gl.player_id = p.pid_t LEFT JOIN nba_ref.players pl ON pl.player_id = p.pid_t),
mk AS (SELECT * FROM unnest($3::text[], $4::text[]) AS m(market_key, prop)),
${lookupCtes("bs", "'underdog', 'sleeper', 'fliff'")}
SELECT bs.game_date::text game_date, bs.app, bs.player_id, bs.player, bs.prop, bs.line::float line, bs.side, bs.final_hp::float final_hp,
       bs.model_hp::float model_hp, bs.model_score::float model_score, bs.market_hp::float market_hp, bs.hp_anchor, bs.dk_line::float dk_line,
       bs.dk_p::float dk_p, bs.pp_line::float pp_line, bs.true_fit, bs.ud_hide,
       bs.baseline_hp::float baseline_hp, bs.cal_shift::float cal_shift, bs.confidence::float confidence, bs.score::float score, bs.edge::float edge,
       bs.interpolated, bs.built_at, tm.team_id, tm.position, t.abbreviation team_abbr, t.full_name team_name, gc.n games_365,
       g.game_id, g.game_datetime_utc, g.home_team_id, g.away_team_id, ht.full_name home_name, at.full_name away_name,
       g.home_team_tricode, g.away_team_tricode, g.arena_name, g.arena_city, g.game_status, g.game_status_text,
       pk.kind pp_kind, pk.tier pp_tier, pk.anchor_line::float anchor_line, pf.factor::float pp_factor, pf.implied_p::float pp_implied_p,
       um.multiplier::float app_mult, um.price app_price
FROM bs
LEFT JOIN tm ON tm.player_id = bs.player_id
LEFT JOIN gc ON gc.player_id = tm.pid_t
LEFT JOIN g ON tm.team_id IN (g.home_team_id, g.away_team_id)
LEFT JOIN nba_ref.teams t ON t.team_id = tm.team_id
LEFT JOIN nba_ref.teams ht ON ht.team_id = g.home_team_id
LEFT JOIN nba_ref.teams at ON at.team_id = g.away_team_id
LEFT JOIN pk ON bs.app = 'prizepicks' AND pk.player = bs.player AND pk.prop = bs.prop AND pk.side = bs.side AND pk.line = bs.line
LEFT JOIN pf ON bs.app = 'prizepicks' AND pf.player = bs.player AND pf.prop = bs.prop AND pf.side = bs.side AND pf.line = bs.line
LEFT JOIN um ON um.bookmaker = bs.app AND um.player = bs.player AND um.prop = bs.prop AND um.side = bs.side AND um.line = bs.line
ORDER BY bs.score DESC, bs.final_hp DESC, bs.player, bs.prop, bs.line, bs.side`;
}

export function legParams(cfg, slateDate, extra = []) {
  const mk = Object.entries(cfg.ui.market_to_prop);
  return [slateDate, pgArr(cfg.ui.apps), pgArr(mk.map(x => x[0])), pgArr(mk.map(x => x[1])), pgArr(cfg.ui.label_pref), ...extra];
}

// Recent box scores (regular season + postseason) for a set of bare player ids, newest first, before the slate date.
export async function recentGames(sql, pids, beforeDate, n = 10) {
  if (!pids.length) return new Map();
  const rows = await q(sql, `
    SELECT * FROM (
      SELECT x.*, row_number() OVER (PARTITION BY x.player_id ORDER BY x.game_date DESC) rn FROM (
        SELECT player_id, game_id, game_date, matchup, wl, ${STATS_COLS} FROM nba_stats.player_game_log
          WHERE nba_player_id = ANY($1::bigint[]) AND game_date < $2::date
        UNION ALL
        SELECT player_id, game_id, game_date, matchup, wl, ${STATS_COLS} FROM nba_stats.player_game_log_postseason
          WHERE player_id = ANY($3::text[]) AND game_date < $2::date) x) y
    WHERE rn <= $4 ORDER BY player_id, game_date DESC`,
    [pgArr(pids.map(Number)), beforeDate, pgArr(pids.map(p => "nba_" + p)), n]);
  const by = new Map();
  for (const r of rows) {
    const k = String(r.player_id).replace(/^nba_/, "");
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return by;
}

export function lineType(r) {
  if (r.app === "prizepicks") {
    const k = String(r.pp_kind || "").toLowerCase();
    return k === "goblin" ? "goblin" : k === "demon" ? "demon" : "regular";
  }
  if (r.app === "underdog") {
    const m = num(r.app_mult);
    if (m == null || Math.abs(m - 1) < 1e-9) return "regular";
    return m > 1 ? "higher_payout" : "lower_payout";
  }
  return "regular";
}

// The leg's payout factor and its OWN break-even - the one definition the card and the Overview ranking both use.
export function legPricing(r, lt = lineType(r)) {
  // EDGE AGAINST THE LEG'S OWN BREAK-EVEN (2026-10-15 full pass). A leg paying factor f (PrizePicks goblin < 1 < demon; the
  // Underdog / Sleeper payout modifier) breaks even at about 0.56 / f - a flat 0.56 showed every goblin as a strong edge
  // (2026-01-14: 1,173 of 1,184 "positive" goblins were below their own break-even). 0.56 = build_final_hp.BREAKEVEN.
  // FLIFF (2026-10-19, owner: Fliff and Betr wired like the other apps): a sportsbook price - American odds PER SIDE in board_snapshots.price,
  // no payout multiplier. A Fliff slip pays the product of the decimal prices, so the leg is priced like a Sleeper pick: its factor is the
  // decimal price and it breaks even at 1 / decimal (vig included). BETR pays a flat entry table (betr_payout_v1), no per-leg price.
  let fliffDec = null;
  if (r.app === "fliff") {
    const a = num(r.app_price);
    fliffDec = a == null ? null : (a >= 100 ? 1 + a / 100 : (a <= -100 ? 1 + 100 / -a : null));
  }
  const legFactor = r.app === "prizepicks" ? (num(r.pp_factor) ?? (lt === "regular" ? 1 : null)) : r.app === "fliff" ? fliffDec : num(r.app_mult);
  const beBase = 0.56;
  // SLEEPER (2026-10-18, owner comparing the app): its multiplier is the pick's own PRICE (a slip pays the product), so the leg
  // breaks even at 1 / m - 0.56 / m (the modifier rule of PrizePicks / Underdog) put a 1.87x Sleeper leg's break-even at 30%.
  const breakeven = (r.app === "sleeper" || r.app === "fliff") && legFactor && legFactor > 1 ? Math.min(0.99, 1 / legFactor)
    : (legFactor && legFactor > 0 ? Math.min(0.99, beBase / legFactor) : beBase);
  return { fliffDec, legFactor, breakeven };
}

export function rowToApi(r, i, slate, games, insightCtx) {
  const lt = lineType(r);
  const hp = r1(num(r.final_hp) * 100), conf = r1(num(r.confidence) * 100), score = r1(r.score);
  const isHome = r.team_id && r.team_id === r.home_team_id;
  const oppAbbr = r.team_id ? (isHome ? r.away_team_tricode : r.home_team_tricode) : null;
  const gamePk = r.game_id || (r.team_id ? `${slate.date}-${r.team_id}` : `${slate.date}-${r.player_id}`);
  const { fliffDec, legFactor, breakeven } = legPricing(r, lt);
  // THE NUMBER THE APP SHOWS (2026-10-18, owner: "scores does not match"): Underdog's pick screen shows a per-pick price
  // (1.87x on a balanced line, 4.42x / 1.15x on a ladder rung), not the payout modifier (1.00 / 2.36 / 0.62) the slip is priced
  // on (PP_PAYOUT_FINDINGS 0m). Our scraper archives that shown price (American) beside the modifier; the 2024-26 Odds API feed
  // carried only sqrt(3) x modifier, so there it is approximated as sqrt(3.5) x modifier (marked approximate). Sleeper shows m itself.
  let appShown = null, appShownExact = false;
  if (r.app === "sleeper" && num(r.app_mult) != null) { appShown = num(r.app_mult); appShownExact = true; }
  else if (r.app === "fliff" && fliffDec != null) { appShown = fliffDec; appShownExact = true; }
  else if (r.app === "underdog" && num(r.app_mult) != null) {
    const m = num(r.app_mult), a = num(r.app_price);
    const dec = a == null ? null : (a >= 100 ? 1 + a / 100 : (a <= -100 ? 1 + 100 / -a : null));
    if (dec != null && Math.abs(dec - Math.sqrt(3) * m) > 0.02) { appShown = dec; appShownExact = true; }
    else appShown = Math.sqrt(3.5) * m;
  }
  const out = {
    final_board_row_id: legId(r.game_date, r.app, r.player_id, r.prop, r.line, r.side),
    rank_order: i + 1,
    source_key: r.app,
    source_display_label: appLabel(r.app),
    game_pk: gamePk,
    official_date: r.game_date,
    official_game_time_utc: r.game_datetime_utc ? new Date(r.game_datetime_utc).toISOString() : null,
    mlb_player_id: r.player_id,          // the shared client keys players on this field name (kept identical to the MLB copy)
    player_id: r.player_id,
    player_name: r.player,
    team_id: r.team_id, team_abbr: r.team_abbr, team_name: r.team_name, opponent_abbr: oppAbbr, is_home: isHome ? 1 : 0,
    position: r.position,
    canonical_prop_key: r.prop,
    prop_label: propLabel(r.prop),
    prop_family: propFamily(r.prop),
    line_value: r.line,
    selected_side: sideOut(r.side),
    score_0_100: score,
    confidence_0_100: conf,
    overall_score_0_100: score,
    certainty_0_100: conf,
    hit_probability_0_100: hp,
    estimated_hit_probability_0_100: hp,
    final_hp_raw: num(r.final_hp),
    probability_confidence_0_100: conf,
    baseline_hp_0_100: r1(num(r.baseline_hp) * 100),
    // cal_shift is stored on the log-odds scale (final = sigmoid(logit(baseline) + cal_shift)) - show the real move in points
    calibration_shift_pp: r1((num(r.model_hp ?? r.final_hp) - num(r.baseline_hp)) * 100),
    // ONE NUMBER (2026-10-23): final_hp is the main and only hit probability - no separate model number; the sportsbook's main
    // line and the old market-anchored reference stay beside it for information
    model_hp_0_100: null,
    model_score_0_100: r.model_score == null ? null : r1(r.model_score),
    market_hp_0_100: r.market_hp == null ? null : r1(num(r.market_hp) * 100),
    hp_anchor: r.hp_anchor || null, dk_line: num(r.dk_line), dk_p_over_0_100: r.dk_p == null ? null : r1(num(r.dk_p) * 100), pp_line: num(r.pp_line),
    hp_fit_set: r.true_fit || null, hp_is_market_anchored: 0,
    ud_hidden: r.ud_hide === true,
    calibration_shift_logit: num(r.cal_shift),
    edge_0_100: hp == null ? null : r1(hp - 100 * breakeven),     // hit probability minus the leg's own break-even, in points
    breakeven_0_100: r1(100 * breakeven),
    interpolated: !!r.interpolated,
    line_type: lt,
    line_type_label: lineTypeLabel(lt),
    app_line_label: `${appLabel(r.app)} • ${lineTypeLabel(lt)}`,
    is_goblin: lt === "goblin" ? 1 : 0,
    is_demon: lt === "demon" ? 1 : 0,
    is_standard: lt === "regular" ? 1 : 0,
    more_only: (lt === "goblin" || lt === "demon") ? 1 : 0,
    pp_kind: r.pp_kind || null, pp_tier: r.pp_tier == null ? null : Number(r.pp_tier), anchor_line: r.anchor_line,
    leg_factor: legFactor,
    app_multiplier: num(r.app_mult),
    app_shown_x: appShown == null ? null : Math.round(appShown * 100) / 100, app_shown_exact: appShownExact ? 1 : 0,
    board_tier: lt,
    home_team_name: r.home_name || r.home_team_tricode || null,
    away_team_name: r.away_name || r.away_team_tricode || null,
    home_team_abbr: r.home_team_tricode, away_team_abbr: r.away_team_tricode,
    venue_name: r.arena_name ? r.arena_name + (r.arena_city ? ", " + r.arena_city : "") : null,
    game_status_code: r.game_status_text || null,
    hp_sample_size: num(r.games_365),
    hp_non_push_sample: num(r.games_365),
    live_playable: slate.mode === "live" ? 1 : 0,
    review_playable: 1,
    replay_mode: slate.mode === "replay" ? 1 : 0,
    slate_date: slate.date,
    scored_at: r.built_at ? new Date(r.built_at).toISOString() : null
  };
  out.leg_insight_comment = composeLegInsight(out, (games && games.get(String(r.player_id))) || [], insightCtx || {});
  return out;
}

export async function loadLegs(sql, cfg, slate, { where = "", extra = [], limit = 200, withInsight = true, screen = true } = {}) {
  const rows = await q(sql, legsSql(where, limit, screen), legParams(cfg, slate.date, extra), 20000);
  let games = new Map();
  if (withInsight && rows.length) {
    const pids = [...new Set(rows.map(r => String(r.player_id)).filter(p => /^\d+$/.test(p)))];
    games = await recentGames(sql, pids, slate.date, 10);
  }
  return rows.map((r, i) => rowToApi(r, i, slate, games));
}

export function clampLimit(cfg, v) {
  const d = Number(cfg.ui.board_default_limit), mx = Number(cfg.ui.board_max_limit);
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, mx) : d;
}

// OVERVIEW (owner 2026-10-21 13:56 PT: "on the main screen, create one option called overview that comes also pre-selected ...
// the top legs for reality ... real good legs, because as now it's just showing the double double ... less heavy to load").
// The default board sorted the whole slate by score, so near-certain, near-free lines (Fliff Double-Double Less 0.5 at 1.01x)
// filled the screen. Overview = legs a player can actually use: the slip apps (PrizePicks, Underdog, Sleeper), the market-anchored
// probability present (honest number), the main props only, and a real edge against the leg's OWN break-even (goblin / demon
// factor, app multiplier) - best edge first, one line per player-prop-app, capped. Tunable nba_main_ui.overview.
const OVERVIEW_DEFAULT = { apps: ["prizepicks", "underdog", "sleeper"], min_edge: 3, max_hp: 0.97, size: 60,
  exclude_props: ["double_double", "fantasy_score", "dreb", "oreb", "fg3a", "fga", "fgm", "fta", "ftm", "personal_fouls"] };
// Phase 1 is a LEAN query (2026-10-21: the full leg loader over the slate took 21 s and timed out): only the fields the ranking
// needs - the anchored probability and the price lookups - for every candidate, then the edge in JS with legPricing (the card's own
// rule). Phase 2 loads the full cards for the chosen few. A leg whose break-even is unknown (a PrizePicks goblin / demon with no
// model factor) is left out: its edge would be measured against the flat 0.56 and overstated.
function overviewSql() {
  return `
WITH ${STARTED_CTE},
mk AS (SELECT * FROM unnest($3::text[], $4::text[]) AS m(market_key, prop)),
c AS MATERIALIZED (SELECT b0.app, b0.player_id, b0.player, b0.prop, b0.line, b0.side, b0.final_hp,
             concat_ws('|', b0.player, b0.prop, b0.side, (b0.line::float8)::text) k
      FROM nba_score.board_scored b0
      WHERE b0.game_date = $1::date AND b0.app = ANY($2::text[]) AND b0.app = ANY($6::text[]) AND NOT (b0.prop = ANY($7::text[]))
        AND b0.final_hp * 100 >= $8 AND b0.final_hp < $9
        AND NOT ${UD_HIDE("b0")} ${NOT_STARTED("b0")}),
${lookupCtes("c", "'underdog', 'sleeper'")}
SELECT c.app, c.player_id, c.player, c.prop, c.line::float line, c.side, c.final_hp::float final_hp,
       pk.kind pp_kind, pf.factor::float pp_factor, um.multiplier::float app_mult, um.price app_price
FROM c
LEFT JOIN pk ON c.app = 'prizepicks' AND pk.k = c.k
LEFT JOIN pf ON c.app = 'prizepicks' AND pf.k = c.k
LEFT JOIN um ON um.bookmaker = c.app AND um.k = c.k`;
}
async function overviewRows(sql, cfg, slate, minHp) {
  const ov = { ...OVERVIEW_DEFAULT, ...((cfg.ui || {}).overview || {}) };
  const raw = await q(sql, overviewSql(), legParams(cfg, slate.date, [pgArr(ov.apps), pgArr(ov.exclude_props), minHp, Number(ov.max_hp)]), 20000);
  const cand = [];
  for (const r of raw) {
    const { legFactor, breakeven } = legPricing(r);
    if (legFactor == null || !(legFactor > 0)) continue;
    const hp = r1(num(r.final_hp) * 100);
    cand.push({ source_key: r.app, player_id: r.player_id, canonical_prop_key: r.prop, line_value: r.line, side_db: r.side,
                hit_probability_0_100: hp, edge_0_100: r1(hp - 100 * breakeven),
                final_board_row_id: legId(slate.date, r.app, r.player_id, r.prop, r.line, r.side) });
  }
  const best = new Map();
  for (const r of cand) {
    if (r.edge_0_100 == null || Number(r.edge_0_100) < Number(ov.min_edge)) continue;
    const k = [r.source_key, r.player_id, r.canonical_prop_key].join("|");
    const cur = best.get(k);
    if (!cur || Number(r.edge_0_100) > Number(cur.edge_0_100)) best.set(k, r);
  }
  const pick = [...best.values()].sort((a, b) => Number(b.edge_0_100) - Number(a.edge_0_100) || Number(b.hit_probability_0_100) - Number(a.hit_probability_0_100))
    .slice(0, Number(ov.size));
  if (!pick.length) return { rows: [], candidates: cand.length };
  const full = await loadLegs(sql, cfg, slate, {
    where: "AND (b.app, b.player_id, b.prop, b.line, b.side) IN (SELECT * FROM unnest($6::text[], $7::text[], $8::text[], $9::numeric[], $10::text[]))",
    extra: [pgArr(pick.map(r => r.source_key)), pgArr(pick.map(r => String(r.player_id))), pgArr(pick.map(r => r.canonical_prop_key)),
            pgArr(pick.map(r => String(r.line_value))), pgArr(pick.map(r => r.side_db))], limit: pick.length + 10 });
  const rank = new Map(pick.map((r, i) => [r.final_board_row_id, i]));
  full.sort((a, b) => (rank.get(a.final_board_row_id) ?? 999) - (rank.get(b.final_board_row_id) ?? 999));
  full.forEach((r, i) => { r.rank_order = i + 1; });   // the card order is the overview's (best edge first), not the score order
  return { rows: full, candidates: cand.length, settings: ov };
}

export async function apiCurrent(sql, cfg, slate, url, version) {
  const limit = clampLimit(cfg, url.searchParams.get("limit"));
  const minScore = num(url.searchParams.get("min_score"), 0) || 0;
  const minHp = num(url.searchParams.get("min_hit_probability"), 0) || 0;
  const t0 = Date.now();
  // OVERVIEW OFF UNTIL PROVEN (2026-10-21 15:30 PT): its first pass ran > 4 min in the database through the worker (the 20 s race
  // returns, the database query keeps running). Asked for while nba_main_ui.overview.enabled is not true = the whole board.
  const overviewAsked = url.searchParams.get("view") === "overview";
  const overview = overviewAsked && ((cfg.ui || {}).overview || {}).enabled === true;
  const ovr = overview ? await overviewRows(sql, cfg, slate, minHp) : null;
  const rows = overview ? ovr.rows : await loadLegs(sql, cfg, slate, { where: "AND b.score >= $6 AND b.final_hp * 100 >= $7", extra: [minScore, minHp], limit });
  // a leg without its market-anchored row falls back to the raw model number - said on the board, never silent (2026-10-15)
  const honestMissing = rows.filter(r => !r.hp_is_market_anchored).length;
  // the slate's games, how many have tipped, and the next slate - so an empty live board says WHY (all games started) and what is next
  const gi = (await q(sql, `SELECT count(*)::int games, count(*) FILTER (WHERE game_datetime_utc <= now())::int started,
        (SELECT min(game_date)::text FROM nba_calendar.slate_games WHERE game_date > $1::date) next_date,
        (SELECT count(*)::int FROM nba_calendar.slate_games WHERE game_date = (SELECT min(game_date) FROM nba_calendar.slate_games WHERE game_date > $1::date)) next_games
      FROM nba_calendar.slate_games WHERE game_date = $1::date`, [slate.date]))[0] || {};
  return {
    ok: true, data_ok: true, version, route: "/api/main-board/current",
    slate: { ...slate, honest_missing: honestMissing, games_total: gi.games || 0, games_started: slate.mode === "live" ? (gi.started || 0) : 0,
             next_slate_date: gi.next_date || null, next_slate_games: gi.next_games || 0 }, row_count: rows.length, limit, min_score: minScore, min_hit_probability: minHp, rows,
    view: overview ? "overview" : "all", overview: overview ? { candidates: ovr.candidates, settings: ovr.settings || null } : null,
    semantics: {
      main_number: "hit_probability_0_100 = nba_score.board_true_hp.true_hp (market-anchored hit probability of this exact leg; falls back to board_scored.final_hp when the slate has no anchored row) - model_hp_0_100 = the model's own number",
      secondary_number: "probability_confidence_0_100 = board_scored.confidence",
      tertiary_number: "score_0_100 = the certified score formula on the market-anchored probability (model_score_0_100 = on the model's)",
      rows_are: slate.mode === "live" ? "today's scored board (P3)" : `replay of the latest scored slate ${slate.date} - no scored board for today yet`
    },
    query_ms: Date.now() - t0, writes_performed: 0, timestamp_utc: new Date().toISOString()
  };
}

export async function apiFilters(sql, cfg, slate, version) {
  // the counts are of the legs the board can show (2026-10-20): unplaceable Underdog rungs and started games are left out, as on the board
  const rows = await q(sql, `
    WITH ${STARTED_CTE},
    bs AS (SELECT b0.app, b0.player, b0.prop, b0.line, b0.side, coalesce(th.true_hp::numeric, b0.final_hp) final_hp,
                       coalesce(th.true_score::numeric, b0.score) score, b0.confidence
                FROM nba_score.board_scored b0
                LEFT JOIN nba_score.board_true_hp th ON th.game_date = b0.game_date AND th.player_id = b0.player_id AND th.prop = b0.prop
                                                    AND th.line = b0.line AND th.side = b0.side
                WHERE b0.game_date = $1::date AND b0.app = ANY($2::text[]) AND NOT ${UD_HIDE("b0")} ${NOT_STARTED("b0")}),
    mk AS (SELECT * FROM unnest($3::text[], $4::text[]) AS m(market_key, prop)),
    pk AS (SELECT DISTINCT ON (t.player, mk.prop, t.side, t.line) t.player, mk.prop, t.side, t.line, t.kind
           FROM nba_market.board_tiers_v2 t JOIN mk ON mk.market_key = regexp_replace(t.base_market, '_(alternate|promo)$', '')
           WHERE t.game_date = $1::date AND t.bookmaker = 'prizepicks'
           ORDER BY t.player, mk.prop, t.side, t.line, array_position($5::text[], t.snapshot_label) NULLS LAST, t.built_at DESC),
    um AS (SELECT DISTINCT ON (s.bookmaker, s.player, mk.prop, s.side, s.line) s.bookmaker, s.player, mk.prop, s.side, s.line, s.multiplier
           FROM nba_market.board_snapshots s JOIN mk ON mk.market_key = regexp_replace(s.market_key, '_(alternate|promo)$', '')
           WHERE s.game_date = $1::date AND s.bookmaker IN ('underdog', 'sleeper')
           ORDER BY s.bookmaker, s.player, mk.prop, s.side, s.line, array_position($5::text[], s.snapshot_label) NULLS LAST, s.fetched_at DESC)
    SELECT bs.app, bs.prop, pk.kind pp_kind, um.multiplier::float app_mult, count(*)::int n,
           max(bs.final_hp)::float max_hp, min(bs.final_hp)::float min_hp, max(bs.score)::float max_score, min(bs.score)::float min_score,
           max(bs.confidence)::float max_conf, min(bs.confidence)::float min_conf
    FROM bs
    LEFT JOIN pk ON bs.app = 'prizepicks' AND pk.player = bs.player AND pk.prop = bs.prop AND pk.side = bs.side AND pk.line = bs.line
    LEFT JOIN um ON um.bookmaker = bs.app AND um.player = bs.player AND um.prop = bs.prop AND um.side = bs.side AND um.line = bs.line
    GROUP BY 1, 2, 3, 4`, legParams(cfg, slate.date), 20000);
  const props = new Map(), types = new Map();
  const summary = { total_rows: 0, max_hp: 0, min_hp: 100, max_score: 0, min_score: 100, max_certainty: 0, min_certainty: 100 };
  for (const r of rows) {
    const fam = propFamily(r.prop) === "single" ? "hitter" : "pitcher";
    if (!props.has(r.prop)) props.set(r.prop, { prop_family: fam, canonical_prop_key: r.prop, label: propLabel(r.prop), rows: 0 });
    props.get(r.prop).rows += r.n;
    const lt = lineType({ app: r.app, pp_kind: r.pp_kind, app_mult: r.app_mult });
    const tk = r.app + "|" + lt;
    if (!types.has(tk)) types.set(tk, { source_key: r.app, line_type: lt, label: lineTypeLabel(lt), line_type_label: lineTypeLabel(lt), app_line_label: `${appLabel(r.app)} • ${lineTypeLabel(lt)}`, rows: 0 });
    types.get(tk).rows += r.n;
    summary.total_rows += r.n;
    summary.max_hp = Math.max(summary.max_hp, r1(r.max_hp * 100)); summary.min_hp = Math.min(summary.min_hp, r1(r.min_hp * 100));
    summary.max_score = Math.max(summary.max_score, r1(r.max_score)); summary.min_score = Math.min(summary.min_score, r1(r.min_score));
    summary.max_certainty = Math.max(summary.max_certainty, r1(r.max_conf * 100)); summary.min_certainty = Math.min(summary.min_certainty, r1(r.min_conf * 100));
  }
  if (!summary.total_rows) Object.assign(summary, { max_hp: 0, min_hp: 0, max_score: 0, min_score: 0, max_certainty: 0, min_certainty: 0 });
  // documented options always listed (a zero-row option renders greyed, exactly as the MLB board does)
  for (const opt of cfg.ui.documented_props || []) {
    if (!props.has(opt)) props.set(opt, { prop_family: propFamily(opt) === "single" ? "hitter" : "pitcher", canonical_prop_key: opt, label: propLabel(opt), rows: 0, documented: true });
  }
  for (const [app, lts] of Object.entries(cfg.ui.documented_line_types || {})) {
    for (const lt of lts) {
      const tk = app + "|" + lt;
      if (!types.has(tk)) types.set(tk, { source_key: app, line_type: lt, label: lineTypeLabel(lt), line_type_label: lineTypeLabel(lt), app_line_label: `${appLabel(app)} • ${lineTypeLabel(lt)}`, rows: 0, documented: true });
    }
  }
  const order = cfg.ui.documented_props || [];
  const ps = [...props.values()].sort((a, b) => {
    const ia = order.indexOf(a.canonical_prop_key), ib = order.indexOf(b.canonical_prop_key);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.label.localeCompare(b.label);
  });
  const ltOrder = ["goblin", "regular", "demon", "higher_payout", "lower_payout"];
  const ts = [...types.values()].sort((a, b) => ltOrder.indexOf(a.line_type) - ltOrder.indexOf(b.line_type));
  return {
    ok: true, data_ok: true, version, route: "/api/main-board/filters", slate, source_table: "nba_score.board_scored", summary,
    prop_groups: { hitter: ps.filter(p => p.prop_family === "hitter"), pitcher: ps.filter(p => p.prop_family === "pitcher"), other: [] },
    prop_group_labels: { hitter: "Single Stat Props", pitcher: "Combo Props" },
    source_groups: {
      prizepicks: ts.filter(t => t.source_key === "prizepicks"), sleeper: ts.filter(t => t.source_key === "sleeper"),
      underdog: ts.filter(t => t.source_key === "underdog"), fliff: ts.filter(t => t.source_key === "fliff"),
      betr: ts.filter(t => t.source_key === "betr"), other: []
    },
    probability_bands: [], probability_grades: [], board_tiers: [], writes_performed: 0, timestamp_utc: new Date().toISOString()
  };
}

export { STATS_COLS, cap };
