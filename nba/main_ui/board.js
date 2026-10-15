// NBA MAIN UI - the board: /api/main-board/current, /api/main-board/filters, and the leg loader every other screen reuses.
// SOURCE: nba_score.board_scored (written by P3, one set per slate) - every leg the DFS apps offer, priced (final_hp), with
// confidence and score. Enriched here, read-only, with: the player's team for the slate (latest game-log team, else roster),
// the game (nba_calendar.slate_games), PrizePicks variation (board_tiers_v2 kind / tier) and model factor (pp_leg_price),
// Underdog / Sleeper payout multipliers (board_snapshots), and the player's recent box scores for the card's scouting line.
import { q, pgArr, num, r1, isoDate, legId, sideOut, propLabel, propFamily, appLabel, lineTypeLabel, cap } from "./common.js";
import { composeLegInsight } from "./insight.js";

const STATS_COLS = "min, pts, reb, ast, fg3m, fg3a, stl, blk, tov, fgm, fga, ftm, fta, oreb, dreb, pf, plus_minus";

// Builds the enriched-leg query. `where` is extra SQL on board_scored alias b (its params start at $6).
export function legsSql(where, limit) {
  return `
WITH bs AS (
  -- HONEST PROBABILITY (2026-10-14): final_hp / score / edge are the market-anchored values (nba_score.board_true_hp, written by
  -- nba/apply_market_anchor.py) wherever they exist; the model's own number travels beside them as model_hp / model_score.
  SELECT b.game_date, b.app, b.player_id, b.player, b.prop, b.line, b.side, b.final_hp, b.baseline_hp, b.cal_shift,
         b.confidence, b.score, b.edge, b.interpolated, b.built_at, b.model_hp, b.model_score, b.market_hp, b.hp_anchor,
         b.dk_line, b.dk_p, b.pp_line, b.true_fit
  FROM (SELECT b0.game_date, b0.app, b0.player_id, b0.player, b0.prop, b0.line, b0.side, b0.baseline_hp, b0.cal_shift, b0.confidence,
               b0.interpolated, b0.built_at, coalesce(th.true_hp::numeric, b0.final_hp) final_hp, coalesce(th.true_score::numeric, b0.score) score,
               coalesce(th.true_edge::numeric, b0.edge) edge, b0.final_hp model_hp, b0.score model_score, th.market_hp, th.anchor hp_anchor,
               th.dk_line, th.dk_p, th.pp_line, th.fit_set true_fit
        FROM nba_score.board_scored b0
        LEFT JOIN nba_score.board_true_hp th ON th.game_date = b0.game_date AND th.player_id = b0.player_id AND th.prop = b0.prop
                                            AND th.line = b0.line AND th.side = b0.side
        WHERE b0.game_date = $1::date AND b0.app = ANY($2::text[])) b
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
tm AS (SELECT p.player_id, p.pid_t, pl.position,
         CASE WHEN gl.team_id IN (SELECT t FROM gteams) THEN gl.team_id
              WHEN pl.team_id IN (SELECT t FROM gteams) THEN pl.team_id
              ELSE COALESCE(gl.team_id, pl.team_id) END team_id
       FROM pids p LEFT JOIN gl ON gl.player_id = p.pid_t LEFT JOIN nba_ref.players pl ON pl.player_id = p.pid_t),
mk AS (SELECT * FROM unnest($3::text[], $4::text[]) AS m(market_key, prop)),
pk AS (SELECT DISTINCT ON (t.player, mk.prop, t.side, t.line) t.player, mk.prop, t.side, t.line, t.kind, t.tier, t.anchor_line
       FROM nba_market.board_tiers_v2 t JOIN mk ON mk.market_key = regexp_replace(t.base_market, '_(alternate|promo)$', '')
       WHERE t.game_date = $1::date AND t.bookmaker = 'prizepicks' AND t.player IN (SELECT DISTINCT player FROM bs WHERE app = 'prizepicks')
       ORDER BY t.player, mk.prop, t.side, t.line, array_position($5::text[], t.snapshot_label) NULLS LAST, t.built_at DESC),
pf AS (SELECT DISTINCT ON (p.player, mk.prop, p.side, p.line) p.player, mk.prop, p.side, p.line, p.factor, p.implied_p
       FROM nba_market.pp_leg_price p JOIN mk ON mk.market_key = regexp_replace(p.base_market, '_(alternate|promo)$', '')
       WHERE p.game_date = $1::date AND p.factor IS NOT NULL AND p.player IN (SELECT DISTINCT player FROM bs WHERE app = 'prizepicks')
       ORDER BY p.player, mk.prop, p.side, p.line, array_position($5::text[], p.snapshot_label) NULLS LAST),
um AS (SELECT DISTINCT ON (s.bookmaker, s.player, mk.prop, s.side, s.line) s.bookmaker, s.player, mk.prop, s.side, s.line, s.multiplier, s.price
       FROM nba_market.board_snapshots s JOIN mk ON mk.market_key = regexp_replace(s.market_key, '_(alternate|promo)$', '')
       WHERE s.game_date = $1::date AND s.bookmaker IN ('underdog', 'sleeper')
         AND s.player IN (SELECT DISTINCT player FROM bs WHERE app IN ('underdog', 'sleeper'))
       ORDER BY s.bookmaker, s.player, mk.prop, s.side, s.line, array_position($5::text[], s.snapshot_label) NULLS LAST, s.fetched_at DESC)
SELECT bs.game_date::text game_date, bs.app, bs.player_id, bs.player, bs.prop, bs.line::float line, bs.side, bs.final_hp::float final_hp,
       bs.model_hp::float model_hp, bs.model_score::float model_score, bs.market_hp::float market_hp, bs.hp_anchor, bs.dk_line::float dk_line,
       bs.dk_p::float dk_p, bs.pp_line::float pp_line, bs.true_fit,
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

export function rowToApi(r, i, slate, games, insightCtx) {
  const lt = lineType(r);
  const hp = r1(num(r.final_hp) * 100), conf = r1(num(r.confidence) * 100), score = r1(r.score);
  const isHome = r.team_id && r.team_id === r.home_team_id;
  const oppAbbr = r.team_id ? (isHome ? r.away_team_tricode : r.home_team_tricode) : null;
  const gamePk = r.game_id || (r.team_id ? `${slate.date}-${r.team_id}` : `${slate.date}-${r.player_id}`);
  // EDGE AGAINST THE LEG'S OWN BREAK-EVEN (2026-10-15 full pass). A leg paying factor f (PrizePicks goblin < 1 < demon; the
  // Underdog / Sleeper payout modifier) breaks even at about 0.56 / f - a flat 0.56 showed every goblin as a strong edge
  // (2026-01-14: 1,173 of 1,184 "positive" goblins were below their own break-even). 0.56 = build_final_hp.BREAKEVEN.
  const legFactor = r.app === "prizepicks" ? (num(r.pp_factor) ?? (lt === "regular" ? 1 : null)) : num(r.app_mult);
  const beBase = 0.56;
  const breakeven = legFactor && legFactor > 0 ? Math.min(0.99, beBase / legFactor) : beBase;
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
    // the market-anchored probability is the main number; the model's own number and the sportsbook's are shown beside it
    model_hp_0_100: r.model_hp == null ? null : r1(num(r.model_hp) * 100),
    model_score_0_100: r.model_score == null ? null : r1(r.model_score),
    market_hp_0_100: r.market_hp == null ? null : r1(num(r.market_hp) * 100),
    hp_anchor: r.hp_anchor || null, dk_line: num(r.dk_line), dk_p_over_0_100: r.dk_p == null ? null : r1(num(r.dk_p) * 100), pp_line: num(r.pp_line),
    hp_fit_set: r.true_fit || null, hp_is_market_anchored: r.true_fit ? 1 : 0,
    calibration_shift_logit: num(r.cal_shift),
    edge_0_100: r1(num(r.edge)),          // stored in points already ((hp - break-even) x 100) - was multiplied by 100 again
    interpolated: !!r.interpolated,
    line_type: lt,
    line_type_label: lineTypeLabel(lt),
    app_line_label: `${appLabel(r.app)} • ${lineTypeLabel(lt)}`,
    is_goblin: lt === "goblin" ? 1 : 0,
    is_demon: lt === "demon" ? 1 : 0,
    is_standard: lt === "regular" ? 1 : 0,
    more_only: (lt === "goblin" || lt === "demon") ? 1 : 0,
    pp_kind: r.pp_kind || null, pp_tier: r.pp_tier == null ? null : Number(r.pp_tier), anchor_line: r.anchor_line,
    leg_factor: r.app === "prizepicks" ? (num(r.pp_factor) ?? (lt === "regular" ? 1 : null)) : num(r.app_mult),
    app_multiplier: num(r.app_mult),
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

export async function loadLegs(sql, cfg, slate, { where = "", extra = [], limit = 200, withInsight = true } = {}) {
  const rows = await q(sql, legsSql(where, limit), legParams(cfg, slate.date, extra), 20000);
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

export async function apiCurrent(sql, cfg, slate, url, version) {
  const limit = clampLimit(cfg, url.searchParams.get("limit"));
  const minScore = num(url.searchParams.get("min_score"), 0) || 0;
  const minHp = num(url.searchParams.get("min_hit_probability"), 0) || 0;
  const t0 = Date.now();
  const rows = await loadLegs(sql, cfg, slate, { where: "AND b.score >= $6 AND b.final_hp * 100 >= $7", extra: [minScore, minHp], limit });
  return {
    ok: true, data_ok: true, version, route: "/api/main-board/current",
    slate, row_count: rows.length, limit, min_score: minScore, min_hit_probability: minHp, rows,
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
  const rows = await q(sql, `
    WITH bs AS (SELECT b0.app, b0.player, b0.prop, b0.line, b0.side, coalesce(th.true_hp::numeric, b0.final_hp) final_hp,
                       coalesce(th.true_score::numeric, b0.score) score, b0.confidence
                FROM nba_score.board_scored b0
                LEFT JOIN nba_score.board_true_hp th ON th.game_date = b0.game_date AND th.player_id = b0.player_id AND th.prop = b0.prop
                                                    AND th.line = b0.line AND th.side = b0.side
                WHERE b0.game_date = $1::date AND b0.app = ANY($2::text[])),
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
      underdog: ts.filter(t => t.source_key === "underdog"), other: []
    },
    probability_bands: [], probability_grades: [], board_tiers: [], writes_performed: 0, timestamp_utc: new Date().toISOString()
  };
}

export { STATS_COLS, cap };
