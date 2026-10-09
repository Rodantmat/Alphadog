#!/usr/bin/env python3
"""
PLAYOFF UNDERS - the postseason-only strategy family (strategy §31y-§31z, owner 2026-10-09: "now you have a proper logic to run
on playoffs - run all the gates, stress it, get the best of it, then wire it so it is ready for playoff time").

Why it exists (§31x-§31y, measured): in the play-in / playoffs, player production per minute drops (all three postseasons on
record) and the model's top-ranked UNDERS on balanced lines are the one leg edge that holds out of sample (cells chosen on one
postseason, scored on the other); the model's Overs, demons and goblins fail there. The strategy is therefore a RULE, not a
mined cell list: the night's balanced-line Unders on the configured props whose model probability clears min_p, best first,
one leg per player, built into ONE slip per strategy per night.

ONE implementation, three callers (the owner's parity rule - what is certified is exactly what live places):
  research_playoff_unders.py      the gates and the stress test (variant grid, walk-forward, null, envelopes, decay, regular stress)
  certify_postseason_strategies.py the postseason backtest + verdict of every configured Playoff Unders strategy
  live_slip_engine.pick_postseason the live slip on a play-in / playoff slate (shadow until its verdict is PASS)
  ud_live_slip_engine              the Underdog paper slip on a postseason slate (stake 0 until certified)
Tunables: nba_config.classification_config['playoff_unders'] (seeded from DEFAULT_CFG once; never hardcoded after that).
"""
import json
from collections import Counter

MAIN_PROPS = ['points', 'rebounds', 'assists', 'threes_made', 'pts_reb', 'pts_ast', 'reb_ast', 'pra']
DEF_PROPS = ['steals', 'blocks', 'stocks', 'turnovers']
STAR_LINES = {'points': 24.5, 'pra': 34.5, 'pts_ast': 29.5, 'pts_reb': 29.5}   # §31n star-line thresholds (default level)
RANK_KEYS = {'s_final': 'final_hp', 's_base': 'baseline_hp', 's_score': 'final_score'}

DEFAULT_CFG = {
    "enabled": True,
    "rank": "s_final",
    "props": MAIN_PROPS,
    "min_p": 0.58,
    "exclude_star": False,
    "max_per_game": 99,
    # stake_mode: 'gate' = a strategy with a PASS postseason verdict stakes (PP placed_post / UD paper_post stake 1);
    # 'shadow' = every Playoff Unders slip is recorded and graded but never staked, whatever the verdict (the owner's one-row switch)
    "stake_mode": "gate",
    "strategies": {
        "P_unders_5flex": {"app": "pp", "size": 5, "structure": "flex"},
        "P_unders_6flex": {"app": "pp", "size": 6, "structure": "flex"},
        "U_unders_2std": {"app": "ud", "size": 2, "structure": "standard"},
    },
    "note": "§31z Playoff Unders: postseason-only; balanced-line Unders, model p >= min_p under `rank`, one leg per player, best first; "
            "PP needs >= 2 teams, UD one pick per game; one slip per strategy per night; stakes only with a PASS postseason verdict",
}


def load_cfg(conn, seed=True):
    """the live tunables; seeded once from DEFAULT_CFG (the research's chosen configuration is written by the research run)"""
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='playoff_unders'").fetchone()
    if r:
        c = r[0] if isinstance(r[0], dict) else json.loads(r[0])
        return {**DEFAULT_CFG, **c}
    if seed:
        conn.execute("INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('playoff_unders', %s) "
                     "ON CONFLICT (config_key) DO NOTHING", (json.dumps(DEFAULT_CFG),))
        conn.commit()
    return dict(DEFAULT_CFG)


def app_cfg(cfg, app):
    """the rule for one app: the top-level keys are PrizePicks'; cfg['ud'] (when the research chose a different rule for Underdog)
    overrides them for Underdog"""
    if app == 'ud' and isinstance(cfg.get('ud'), dict) and cfg['ud']:
        return {**cfg, **cfg['ud']}
    return cfg


def strategies_for(cfg, app):
    return {n: s for n, s in (cfg.get('strategies') or {}).items() if s.get('app') == app}


def pivot_rank_rows(rows):
    """live / tier-map rows come one per rank key (rank_key, score); the rule reads one leg with s_final / s_base / s_score"""
    legs = {}
    inv = {v: k for k, v in RANK_KEYS.items()}
    for r in rows:
        key = (r['player'], r['prop'], r['tier'], r['side'], float(r['line']))
        l = legs.get(key)
        if l is None:
            l = dict(r)
            for k in RANK_KEYS:
                l[k] = None
            legs[key] = l
        k = inv.get(r.get('rank_key'))
        if k:
            l[k] = float(r['score']) if r.get('score') is not None else None
    return list(legs.values())


def is_star(l):
    t = STAR_LINES.get(l['prop'])
    return t is not None and float(l['line']) >= t


def score_of(l, rank):
    """the leg's ranking score on a probability scale: final_hp / baseline_hp are probabilities; final_score is published on a
    0-100 scale (measured 2026-10-09: mean 65 on postseason Unders), so it is divided by 100 before the min_p comparison"""
    s = l.get(rank)
    if s is None:
        return None
    s = float(s)
    return s / 100.0 if rank == 's_score' and s > 1.5 else s


def candidates(legs, cfg):
    """the night's eligible legs, best first: balanced line (half-point AND whole-number lines, exactly as the live board and the
    certified maps carry them - a whole-number tie voids the leg), Under, configured prop, model p >= min_p, one per player"""
    rank = cfg.get('rank', 's_final')
    props = set(cfg.get('props') or MAIN_PROPS)
    min_p = float(cfg.get('min_p', 0.58))
    xs = [l for l in legs if l['tier'] == 'R' and l['side'] == 'Under' and l['prop'] in props
          and score_of(l, rank) is not None and score_of(l, rank) >= min_p
          and not (cfg.get('exclude_star') and is_star(l))
          and not (cfg.get('half_only') and float(l['line']) % 1 == 0)]
    xs.sort(key=lambda l: (-score_of(l, rank), l['player'], l['prop'], float(l['line'])))
    seen, out = set(), []
    for l in xs:
        if l['player'] in seen:
            continue
        seen.add(l['player'])
        out.append(l)
    return out


BT_PP_SQL = """
SELECT season, game_date, player, player_id, prop, tier, side, line, factor, hit, team_id, event_id, rank_key, score
FROM nba_score.tier_map_legs_post WHERE tier='R' AND side='Under'"""
BT_UD_SQL = """
SELECT l.season, l.game_date, l.player, l.player_id, l.prop, l.tier, l.side, l.line, l.factor, l.hit,
       coalesce(g.team_id, w.event_id) team_id, w.event_id, l.rank_key, l.score
FROM nba_score.ud_tier_map_legs_post l
LEFT JOIN (SELECT game_date, pn, prop, side, line, min(event_id) event_id FROM nba_score.ud_window_legs_post GROUP BY 1,2,3,4,5) w
  ON w.game_date=l.game_date AND w.pn=l.player AND w.prop=l.prop AND w.side=l.side AND w.line=l.line
LEFT JOIN nba_stats.player_game_log_postseason g ON g.player_id='nba_'||l.player_id AND g.game_date=l.game_date
WHERE l.tier='R' AND l.side='Under'"""
BT_COLS = ['season', 'game_date', 'player', 'player_id', 'prop', 'tier', 'side', 'line', 'factor', 'hit', 'team_id', 'event_id', 'rank_key', 'score']


def ud_grade(slip, structure):
    """the certified Underdog formula (build_ud_slip_engine STD / FLEX); a void leg is removed and the entry drops a size"""
    import build_ud_slip_engine as UE
    live = [l for l in slip if l['hit'] is not None]
    k = len(live)
    hits = sum(l['hit'] for l in live)
    if k < 2:
        return hits, 1.0                                   # refund
    if structure == 'standard' or k == 2:
        if hits < k:
            return hits, 0.0
        p = UE.STD[k]
        for l in live:
            p *= l['factor']
        return hits, p
    base = UE.FLEX.get((k, k - hits), 0.0)
    if not base:
        return hits, 0.0
    p = base
    for l in live:
        if l['hit']:
            p *= l['factor']
    return hits, p


def backtest(conn, cfg):
    """the postseason backtest of every configured Playoff Unders strategy, built by THIS module's rule over the certified
    postseason maps (PrizePicks: tier_map_legs_post; Underdog: ud_tier_map_legs_post + its game), graded by the certified payout
    (PrizePicks build_slip_engine.grade, Underdog the formula above with the §30t 0.5% / 1% discount).
    Returns {strategy: [(season, game_date, stake, payout, slip_legs), ...]} - one slip a night (k = 1)."""
    import build_slip_engine as SE
    out = {}
    for app, sql in (('pp', BT_PP_SQL), ('ud', BT_UD_SQL)):
        strats = strategies_for(cfg, app)
        if not strats:
            continue
        rows = [dict(zip(BT_COLS, r)) for r in conn.execute(sql).fetchall()]
        for r in rows:
            r['line'] = float(r['line'])
            r['factor'] = float(r['factor']) if r['factor'] is not None else None
            if app == 'ud' and r['factor'] is not None:
                r['factor'] *= 0.995 if abs(r['factor'] - 1.0) < 1e-9 else 0.99
        days = {}
        for r in rows:
            days.setdefault(r['game_date'], []).append(r)
        acfg = app_cfg(cfg, app)
        for name, s in strats.items():
            recs = []
            for d in sorted(days):
                legs = pivot_rank_rows(days[d])
                slip = build_slip(candidates(legs, acfg), int(s['size']), app, acfg)
                if slip is None:
                    continue
                hits, payout = SE.grade(slip, s['structure']) if app == 'pp' else ud_grade(slip, s['structure'])
                recs.append((days[d][0]['season'], d, 1.0, payout, slip))
            out[name] = recs
    return out


def build_slip(cands, size, app, cfg):
    """deterministic greedy: walk the candidates best first; a leg is skipped if its game already holds max_per_game legs
    (Underdog: 1 - one pick per game), or if it would leave a full PrizePicks slip on a single team. None if the night is too thin."""
    mpg = 1 if app == 'ud' else int(cfg.get('max_per_game', 99))
    slip, games, players = [], Counter(), set()
    for l in cands:
        g = l.get('event_id')
        if g is None or l['player'] in players or games[g] >= mpg:
            continue
        if app == 'pp' and len(slip) == size - 1 and len({x.get('team_id') for x in slip} | {l.get('team_id')}) < 2:
            continue
        slip.append(l)
        players.add(l['player'])
        games[g] += 1
        if len(slip) == size:
            return slip
    return None
