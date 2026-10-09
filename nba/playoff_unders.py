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


def candidates(legs, cfg):
    """the night's eligible legs, best first: balanced line, Under, configured prop, model p >= min_p, one per player"""
    rank = cfg.get('rank', 's_final')
    props = set(cfg.get('props') or MAIN_PROPS)
    min_p = float(cfg.get('min_p', 0.58))
    xs = [l for l in legs if l['tier'] == 'R' and l['side'] == 'Under' and l['prop'] in props
          and l.get(rank) is not None and l[rank] >= min_p and not l.get('whole_number')
          and not (cfg.get('exclude_star') and is_star(l))]
    xs.sort(key=lambda l: (-l[rank], l['player'], l['prop'], float(l['line'])))
    seen, out = set(), []
    for l in xs:
        if l['player'] in seen:
            continue
        seen.add(l['player'])
        out.append(l)
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
