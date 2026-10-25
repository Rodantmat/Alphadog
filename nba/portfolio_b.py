#!/usr/bin/env python3
"""
PORTFOLIO B - the one slip builder shared by the live pick (live_slip_engine portfolio units 'pb:<id>') and the parity audit
(audit_portfolio_b_parity.py), so what was measured is what is placed (2026-10-25; owner 12:45 PT "which is the best balanced
option?" -> B; 12:47 PT "deploy it").

B = six strategies of the final review (research_final_strategies run 40174314973), measured together in research_portfolio_caps
run 40221601395 (history: 3.04 slips a day, ROI +93% (+81% / +103%), max drawdown 14.6u, no caps) and research_portfolio_paths
run 40226300469 (starting points + realistic season). One slip per strategy per slate, 1 unit each, no portfolio caps:
  B3  standard lines, final_hp >= 0.68, Less, best final_hp first, <= 2 legs a game                       3-pick Power
  B4  standard lines, low-volume props, More + Less, ranked by the trailing cell hit (20 slates), >= 0.62, 1 a game   4-pick Flex
  B5  standard lines, More, all props, best final_hp first, >= 0.62, 1 a game, skip the top leg             3-pick Power
  B6  standard lines, low-volume props, More + Less, best final_hp first, line at / below the slate median, 1 a game   4-pick Flex
  B7  standard lines, low-volume props, More + Less, ranked by 0.5 final_hp + 0.5 trailing cell hit, >= 0.70, 2 a game,
      skip the top leg                                                                                   3-pick Power
  B9  standard + demon lines, low-volume props, More + Less, ranked by final_hp x factor, >= 0.62, 2 a game, skip the top leg
                                                                                                         6-pick Flex
Every slip: distinct players, the game cap, >= 2 teams. Legs: the 12 board-calibrated props only (final_hp_board_cal.PROPS), a
final_hp and a team. TIES: legs are put in a fixed order (player, prop, side, line, tier) before ranking, so equal scores always
resolve the same way (the research took the database's row order, which is not fixed).
TRAILING CELL HIT: per cell (prop, line type, side) the graded legs of the previous 20 slates; the rate is used when the cell has
>= 30 graded legs, else the leg's own final_hp (research_board_profiles_l2.strategy_grid, the battery the strategies came from).
"""
from collections import defaultdict, deque

import numpy as np

from final_hp_board_cal import PROPS as CALIBRATED_PROPS

GRP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
POOLS = {"R": ("R",), "RD": ("R", "D1", "D2", "D3")}
WINDOW, MIN_CELL = 20, 30
# id -> (kind, params, size, structure); kinds and params exactly as research_portfolio_caps.SPECS
UNITS = {
    "B3": ("f", (0.68, "Under", "none"), 3, "power"),
    "B4": ("b1", ("R", "B", "lowvol", "trail", 0.62, 1, 0), 4, "flex"),
    "B5": ("b1", ("R", "O", "all", "p", 0.62, 1, 1), 3, "power"),
    "B6": ("b2", ("R", "B", "lowvol", "p", "low", 0, 1), 4, "flex"),
    "B7": ("b1", ("R", "B", "lowvol", "blend", 0.70, 2, 1), 3, "power"),
    "B9": ("b1", ("RD", "B", "lowvol", "ev", 0.62, 2, 1), 6, "flex"),
}


def cell(l):
    return (l["prop"], l["tier"] if l["tier"] == "R" else l["tier"][:2], l["side"])


def eligible(legs):
    """the slate's legs as the research saw them: calibrated props, a final_hp (p) and a team; fixed tie order"""
    out = [l for l in legs if l.get("prop") in CALIBRATED_PROPS and l.get("p") is not None and l.get("team_id") is not None]
    out.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"]))
    return out


def slate_counts(legs):
    """one slate's graded legs -> {cell: [hits, graded]} (legs: eligible(), with 'hit' 1 / 0 / None)"""
    c = defaultdict(lambda: [0, 0])
    for l in legs:
        if l.get("hit") is not None:
            c[cell(l)][0] += int(l["hit"]); c[cell(l)][1] += 1
    return dict(c)


def window_rates(history):
    """history: the previous slates' slate_counts, oldest first (only the last WINDOW are used) -> {cell: (hits, graded)}"""
    agg = defaultdict(lambda: [0, 0])
    for h in list(history)[-WINDOW:]:
        for c, (a, b) in h.items():
            agg[c][0] += a; agg[c][1] += b
    return {c: tuple(v) for c, v in agg.items()}


def prepare(legs, rates):
    """eligible legs with the per-slate keys every unit reads: _grp, _trail, _blend, _lp (line at / below the slate median of its
    prop and line type)"""
    legs = eligible(legs)
    med = defaultdict(list)
    for l in legs:
        med[(l["prop"], l["tier"])].append(float(l["line"]))
    med = {k: float(np.median(v)) for k, v in med.items()}
    for l in legs:
        a, b = rates.get(cell(l), (0, 0))
        rate = a / b if b >= MIN_CELL else float(l["p"])
        l["_trail"] = rate
        l["_blend"] = 0.5 * float(l["p"]) + 0.5 * rate
        l["_grp"] = GRP.get(l["prop"])
        l["_lp"] = "low" if float(l["line"]) <= med[(l["prop"], l["tier"])] else "high"
    return legs


def candidates(legs, uid, graded_only=False):
    """(ordered candidate legs, game cap, prop-group cap) for one unit on prepared legs. graded_only: the research's factor
    family read graded legs only (a void leg - DNP / push - was not in its pool); live cannot know, so live passes False"""
    kind, prm, _size, _st = UNITS[uid]
    if kind == "f":
        th, sd, _bn = prm
        c = [l for l in legs if l["tier"] == "R" and float(l["p"]) >= th and (sd == "both" or l["side"] == sd)
             and (not graded_only or l.get("hit") is not None)]
        c.sort(key=lambda x: -float(x["p"]))
        return c, 2, 0
    if kind == "b1":
        pool, side, ps, rk, mp, gc, tp = prm
        base = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDES[side] and (ps == "all" or l["_grp"] == ps)]
        if rk == "p":
            r = sorted(base, key=lambda l: -l["p"])
        elif rk == "ev":
            r = sorted(base, key=lambda l: -l["p"] * float(l["factor"]))
        elif rk == "blend":
            r = sorted(base, key=lambda l: -l["_blend"])
        else:
            r = sorted(base, key=lambda l: (-l["_trail"], -l["p"]))
        return [l for l in r if l["p"] >= mp][tp:], gc, 0
    lv, side, ps, rk, lp, pc, gc = prm
    base = [l for l in legs if l["tier"] == lv and l["side"] in SIDES[side] and (ps == "all" or l["_grp"] == ps)]
    r = sorted(base, key=(lambda l: -l["p"]) if rk == "p" else (lambda l: -l["p"] * float(l["factor"])))
    if lp != "all":
        r = [l for l in r if l["_lp"] == lp]
    return r, gc, pc


def select(cand, gc, pc, size):
    pick, players, games, grps = [], set(), defaultdict(int), defaultdict(int)
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc or (pc and grps[l["_grp"]] >= pc):
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1; grps[l["_grp"]] += 1
        if len(pick) == size:
            break
    if len(pick) >= size and len({l["team_id"] for l in pick[:size]}) >= 2:
        return pick[:size]
    return None


def unit_slip(prepared, uid, graded_only=False):
    """the unit's one slip on the slate (prepared legs), or None"""
    c, gc, pc = candidates(prepared, uid, graded_only)
    return select(c, gc, pc, UNITS[uid][2])


class Trailing:
    """running 20-slate cell window for a replay (audit): feed slates oldest first"""
    def __init__(self):
        self.hist = deque(maxlen=WINDOW)

    def rates(self):
        return window_rates(self.hist)

    def push(self, legs):
        self.hist.append(slate_counts(eligible(legs)))
