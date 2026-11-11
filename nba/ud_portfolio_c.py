#!/usr/bin/env python3
"""
UNDERDOG PORTFOLIO C - 2-pick Standards on today's Underdog prices, ranked by the CALIBRATED chance (owner 2026-11-02 10:39 PT:
"Underdog, let's go with your recommendation, whatever ones is the strongest, even multiple strategies if it is worth it").
The one builder shared by the live Underdog pick (ud_live_slip_engine, portfolio 'C') and its research / parity audit
(research_ud_switch.py, audit_ud_portfolio_c_parity.py), so what was measured is what is placed.

WHY (NBA_COMPASS 192): on today's prices (m ~= K / nv) only 2-pick Standard keeps a forward edge (walk-forward top-1 +14%); every
3+ pick structure failed when chosen on one season and played on the next.

THE CHANCE  p_hat = logistic(c + a logit(final_hp) + b logit(nv) + F + B + Under), coefficients fitted on 2024-25 + 2025-26
            (research_ud_rebuild run 41409811739, out of sample for this season). nv = the books' no-vig for that side at that line
            (8 books' window board, main markets, mean of the books' two-way fair chances); when no book prices the line (most of
            this season's board - the live feed is thin) nv = K[level, side] / Underdog's own multiplier (Underdog prices off the
            exchange: K = m x nv, measured on this season's real boards).
THE RANK    r_hat = p_hat x m (expected return of the leg); floor r_hat >= .535 (a 2-pick Standard's break-even per leg).
UNITS       C1  all line levels (R, F, B), Less only, all props, skip the top leg, 2 slips (the second never repeats a player)
            C2  all line levels, More + Less, main + combo props (no steals / blocks / turnovers / stocks), skip the top leg, 1 slip
            one pick per game inside a slip, one pick per player.
"""
import math
from collections import defaultdict

import numpy as np

K = {("R", "Over"): 0.5010, ("R", "Under"): 0.4969, ("F", "Over"): 0.4759, ("F", "Under"): 0.4601, ("B", "Over"): 0.4889, ("B", "Under"): 0.4699}
K_ALL = 0.4797
COEF = (-0.025, 0.518, 0.905, -0.048, 0.050, 0.051)        # const, logit final_hp, logit nv, F, B, Under (fit 2024-25 + 2025-26)
GRP = {"points": "mains", "rebounds": "mains", "assists": "mains", "threes_made": "mains", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "low", "blocks": "low", "turnovers": "low", "stocks": "low"}
LEVELS = {"ALL": {"R", "F", "B"}}
SIDES = {"both": ("Over", "Under"), "More": ("Over",), "Less": ("Under",)}
PROPS = {"all": None, "nolow": {"mains", "combos"}, "low": {"low"}}
# id -> (level set, side, props, rank floor, skip, picks, slips)
UNITS = {
    "C1": ("ALL", "Less", "all", 0.535, 1, 2, 2),
    "C2": ("ALL", "both", "nolow", 0.535, 1, 2, 1),
}
SHORT = {"C1": "all lines, Less, all props", "C2": "all lines, More + Less, no low-volume props"}
LABEL = {"C1": "2-pick Power, all lines, Less, all props, r_hat >= .535, skip 1",
         "C2": "2-pick Power, all lines, More + Less, no low-volume props, r_hat >= .535, skip 1"}

MK = {'player_points': 'points', 'player_rebounds': 'rebounds', 'player_assists': 'assists', 'player_threes': 'threes_made',
      'player_steals': 'steals', 'player_blocks': 'blocks', 'player_turnovers': 'turnovers', 'player_blocks_steals': 'stocks',
      'player_points_rebounds': 'pts_reb', 'player_points_assists': 'pts_ast', 'player_rebounds_assists': 'reb_ast',
      'player_points_rebounds_assists': 'pra'}
MKALL = list(MK) + [k + "_alternate" for k in MK]
HBOOKS = ["fanduel", "draftkings", "betmgm", "williamhill_us", "fanatics", "betonlineag", "bovada", "betrivers"]
HSQL = """
WITH b AS (SELECT DISTINCT ON (bookmaker, nba_ref.norm_name(player), market_key, side, line)
             bookmaker, nba_ref.norm_name(player) pn, market_key, side, line::float line, price, event_id
           FROM nba_market.board_snapshots
           WHERE game_date=%s AND snapshot_label='window' AND bookmaker = ANY(%s) AND market_key = ANY(%s) AND price IS NOT NULL
           ORDER BY bookmaker, nba_ref.norm_name(player), market_key, side, line, snapshot_ts DESC)
SELECT b.bookmaker, b.pn, nm.player_id::text, b.market_key, b.side, b.line, b.price::float, b.event_id
FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = b.pn"""


def american(p):
    return 1 + 100.0 / (-p) if p < 0 else 1 + p / 100.0


def consensus(conn, d):
    """books' window board -> fair chance of Over {(pid, prop, line): p} (== research_sleeper_transfer.consensus)"""
    q = defaultdict(lambda: defaultdict(dict))
    for bk, _pn, pid, mk, side, line, price, _e in conn.execute(HSQL, (d, HBOOKS, MKALL)).fetchall():
        if abs(price) < 100 or mk.endswith("_alternate"):
            continue
        q[(pid, MK[mk], line)][bk][side] = american(price)
    fair = {}
    for k, books in q.items():
        ps = [(1 / s["Over"]) / (1 / s["Over"] + 1 / s["Under"]) for s in books.values() if "Over" in s and "Under" in s]
        if ps:
            fair[k] = float(np.mean(ps))
    return fair


def lvl(tier):
    t = str(tier)
    return "R" if t == "R" else "B" if t.startswith("B") else "F" if t.startswith("F") else None


def lg(x):
    x = min(max(float(x), 1e-4), 1 - 1e-4)
    return math.log(x / (1 - x))


def nv_of(fair, l, fill=True):
    po = fair.get((str(l["player_id"]), l["prop"], float(l["line"])))
    nv = None if po is None else (po if l["side"] == "Over" else 1 - po)
    if nv is not None and not 0.03 < nv < 0.97:
        nv = None
    src = "books"
    if nv is None and fill and l["m"] and l["m"] > 0:
        x = K.get((l["lv"], l["side"]), K_ALL) / float(l["m"])
        nv, src = (x, "ud") if 0.03 < x < 0.97 else (None, None)
    return nv, src


def p_hat(l, coef=COEF):
    z = coef[0] + coef[1] * lg(l["p"]) + coef[2] * lg(l["nv"]) + coef[3] * (l["lv"] == "F") + coef[4] * (l["lv"] == "B") + coef[5] * (l["side"] == "Under")
    return 1 / (1 + math.exp(-z))


def calibrate(legs, fair, coef=COEF, fill=True):
    """raw legs {player, player_id, prop, side, line, tier, m, event_id, p} -> the same dicts with lv, g, nv, nv_src, ph, rh
    (legs without a level or a chance of the market are dropped)"""
    out = []
    for l in legs:
        l["lv"] = lvl(l["tier"])
        if l["lv"] is None or l.get("p") is None or l.get("event_id") is None:
            continue
        l["g"] = GRP.get(l["prop"], "?")
        l["nv"], l["nv_src"] = nv_of(fair, l, fill)
        if l["nv"] is None:
            continue
        l["ph"] = p_hat(l, coef)
        l["rh"] = l["ph"] * l["m"]
        out.append(l)
    return out


def unit_slips(uid, legs, prm=None):
    """the unit's slips (list of lists of legs). legs = calibrate(...) output in a fixed order."""
    lvn, sdn, prn, fl, sk, n, ns = prm or UNITS[uid]
    pool = [l for l in legs if l["lv"] in LEVELS[lvn] and l["side"] in SIDES[sdn] and (PROPS[prn] is None or l["g"] in PROPS[prn])]
    cand = [l for l in sorted(pool, key=lambda l: -l["rh"]) if fl is None or l["rh"] >= fl][sk:]
    s1, pl, gm = [], set(), set()
    for l in cand:
        if l["player"] in pl or l["event_id"] in gm:
            continue
        s1.append(l); pl.add(l["player"]); gm.add(l["event_id"])
        if len(s1) == n:
            break
    if len(s1) < n:
        return []
    out = [s1]
    if ns >= 2:
        s2, pl2, gm2 = [], set(), set()
        for l in cand:
            if l["player"] in pl or l["player"] in pl2 or l["event_id"] in gm2:
                continue
            s2.append(l); pl2.add(l["player"]); gm2.add(l["event_id"])
            if len(s2) == n:
                break
        if len(s2) == n:
            out.append(s2)
    return out


def slip_json(uid, slip):
    return [{"cell": f"C:{uid}", "player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "tier": l["tier"], "side": l["side"],
             "line": float(l["line"]), "factor": float(l["m"]), "event_id": l["event_id"], "p_hat": round(l["ph"], 4),
             "nv": round(l["nv"], 4), "nv_src": l["nv_src"], "final_hp": round(float(l["p"]), 4)} for l in slip]


def portfolio(legs):
    """[(uid, k, slip)] for every unit; a slip identical to an earlier one (same legs) is dropped (one entry per slip)"""
    seen, out = set(), []
    for uid in UNITS:
        for k, s in enumerate(unit_slips(uid, legs), start=1):
            key = tuple(sorted((l["player"], l["prop"], l["side"], float(l["line"])) for l in s))
            if key in seen:
                continue
            seen.add(key)
            out.append((uid, k, s))
    return out


# C3 (owner 2026-11-08 11:58 PT: "Deploy E for me"; research_ud_3pick.py UD_N=4, option E): one 4-pick FLEX a slate from the regular
# lines only (R), More + Less, no low-volume props (no steals / blocks / turnovers / stocks), ranked by the calibrated hit chance p_hat,
# skip the top 2, no floor. Walk-forward on 2024-25 + 2025-26 history (repriced to today's law): ROI +34.1% / +32.5% / this season +75.4%,
# cash 45-62%, max drawdown 9.5u / 8.9u / 3.0u. It uses the 3+ pick Flex slot the owner's bonuses need.
# id -> (level set, side, props, rank key, rank floor, skip, picks, slips)
FLEX_UNITS = {"C3": ({"R"}, "both", "nolow", "ph", None, 2, 4, 1)}
FLEX_SHORT = {"C3": "4-pick Flex, regular lines, More + Less, no low-volume props, p_hat rank, skip 2"}


def flex_slips(uid, legs):
    """the Flex unit's slips (list of lists of legs); one pick per player and per game inside a slip"""
    lvs, sdn, prn, key, fl, sk, n, ns = FLEX_UNITS[uid]
    pool = [l for l in legs if l["lv"] in lvs and l["side"] in SIDES[sdn] and (PROPS[prn] is None or l["g"] in PROPS[prn])]
    cand = [l for l in sorted(pool, key=lambda l: -l[key]) if fl is None or l[key] >= fl][sk:]
    out, used = [], set()
    for _ in range(ns):
        s1, pl, gm = [], set(), set()
        for l in cand:
            if l["player"] in used or l["player"] in pl or l["event_id"] in gm:
                continue
            s1.append(l); pl.add(l["player"]); gm.add(l["event_id"])
            if len(s1) == n:
                break
        if len(s1) < n:
            break
        out.append(s1)
        used |= pl
    return out
