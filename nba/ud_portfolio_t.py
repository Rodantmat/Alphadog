#!/usr/bin/env python3
"""
UNDERDOG PORTFOLIO T - the one slip builder shared by the live Underdog pick (ud_live_slip_engine, portfolio 'T') and its parity
audit (audit_ud_portfolio_t_parity.py), so what was measured is what is placed (owner 2026-10-25 20:01 PT: "I'm just gonna go with
the T alone").

T = three 2-pick Standards, one slip each a slate, 1 unit each (research_app_deep, NBA_COMPASS 183):
  T1  composition weighted:rebounds_B1_U (build_ud_slip_engine, the certified cells; the rebounds B1 Under cell first)
  T2  standard + harder lines (R, B1-B3), More + Less, all props, ranked by final_hp x payout factor, final_hp >= 0.60, skip the top
      leg, one pick per game
  T3  standard + harder lines (R, B1-B3), More only, combo props (PRA, P+R, P+A, R+A), ranked by final_hp x factor,
      final_hp >= 0.55, skip the top leg, one pick per game
Chosen on 2024-25 alone, 2025-26 untouched: ROI +27%, max drawdown 11.3u, losing days 34%; both seasons +44% (+59 / +27), 2.81
slips a day, drawdown 11.3u, losing days 24% (run 40260781540); this season +71% on 13 slips.
LEGS: ud_live_slip_engine.load_legs rows (the live resolver, the placeability screen, duplicates keep the lowest factor) ->
one leg per (player, prop, side, line) with p = final_hp, m = factor, tier, event_id - research_app_final_strategies.load_ud.
TIES: legs are put in a fixed order (player, prop, side, line) before ranking (the research took the database row order).
"""
from collections import defaultdict

GRP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
POOLS = {"RB": ("R", "B1", "B2", "B3")}
PROPSETS = {"all": None, "combos": {"combos"}}
# id -> (kind, params, size, structure)
UNITS = {
    "T1": ("doc", "weighted:rebounds_B1_U", 2, "standard"),
    "T2": ("grid", ("RB", "B", "all", 0.60, 1, 1), 2, "standard"),
    "T3": ("grid", ("RB", "O", "combos", 0.55, 1, 1), 2, "standard"),
}
LABEL = {"T1": "weighted:rebounds_B1_U", "T2": "RB-both-all-ev-p0.60-gc1-skip1", "T3": "RB-More-combos-ev-p0.55-gc1-skip1"}


def raw_legs(rows):
    """load_legs rows -> one leg per (player, prop, side, line), research_app_final_strategies.load_ud without the grading"""
    by = {}
    for r in rows:
        k = (r["player"], r["prop"], r["side"], float(r["line"]))
        b = by.setdefault(k, {"player": r["player"], "player_id": r["player_id"], "prop": r["prop"], "side": r["side"], "line": float(r["line"]),
                              "tier": r["tier"], "m": float(r["factor"]), "event_id": r["event_id"]})
        b[{"final_hp": "p", "baseline_hp": "base", "final_score": "score"}[r["rank_key"]]] = r["score"]
    legs = [b for b in by.values() if b.get("p") is not None]
    legs.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"]))
    return legs


def grid_slip(legs, prm, size):
    pool, side, ps, fl, gc, sk = prm
    pset = PROPSETS[ps]
    base = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDES[side] and (pset is None or GRP.get(l["prop"]) in pset)]
    cand = [l for l in sorted(base, key=lambda l: -l["p"] * l["m"]) if l["p"] >= fl][sk:]
    pick, players, games = [], set(), defaultdict(int)
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
        if len(pick) == size:
            return pick
    return None


def unit_slip(uid, legs, pool, E):
    """the unit's slip as a list of leg dicts {player, player_id, prop, tier, side, line, factor, event_id, cell}, or None.
    legs = raw_legs(rows); pool = E.eligible_legs(rows); E = build_ud_slip_engine"""
    kind, prm, size, _st = UNITS[uid]
    if kind == "doc":
        sl = E.build_day_slips(pool, prm, size, 1)
        if not sl:
            return None
        return [{"cell": l["cell"], "player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "tier": l["tier"], "side": l["side"],
                 "line": float(l["line"]), "factor": float(l["factor"]), "event_id": l["event_id"]} for l in sl[0]]
    s = grid_slip(legs, prm, size)
    if s is None:
        return None
    return [{"cell": f"T:{LABEL[uid]}", "player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "tier": l["tier"], "side": l["side"],
             "line": l["line"], "factor": l["m"], "event_id": l["event_id"]} for l in s]
