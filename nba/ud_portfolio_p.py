#!/usr/bin/env python3
"""
UNDERDOG PORTFOLIO P - the multi-structure portfolio of the corrected full search on today's prices (owner 2026-11-02 10:39 PT:
"whatever ones is the strongest, even multiple strategies if it is worth it"; research_app_deep DP_REPRICE=1 run 41505430467,
NBA_COMPASS 193). The one builder shared by the live Underdog pick (ud_live_slip_engine, portfolio 'P6') and its parity audit
(audit_ud_portfolio_p_parity.py).

LEGS   the live resolver's legs (ud_live_slip_engine.load_legs -> ud_portfolio_t.raw_legs), each given the books' no-vig nv (or
       K / Underdog's multiplier when no book prices the line) and p := p_hat, the calibrated chance (ud_portfolio_c.calibrate) -
       exactly research_app_deep.reprice_day for this season. Ranks: 'ev' = p_hat x m, 'base' = baseline_hp (raw), floors on p_hat.
UNITS  one slip each a slate, 1 unit each (shortlist set 1+2+5+12):
  P1  RB-both-all-base-p0.55-gc1 6F   R + B lines, More + Less, all props, by baseline_hp, p_hat >= .55, one pick a game, 6-pick Flex
  P2  RB-Less-all-base-p0.00-gc1 6F   R + B lines, Less only, all props, by baseline_hp, one pick a game, 6-pick Flex
  P3  ALL-both-core-ev-p0.00-gc1-skip1 2S   all lines, More + Less, no low-volume props, by p_hat x m, skip the top leg, 2-pick Power
  P4  composition ex:rebounds_F2_U 2S  the certified cells without rebounds F2 Under (build_ud_slip_engine), 2-pick Power
Set 1+2+5+12: ROI +58% (2024-25 +61 / 2025-26 +55), max drawdown 23.2u, 3.34 slips a day, this season +70% on 42 slips; the
portfolio holdouts of the same search (chosen on one season, played on the other) kept +10% to +19%.
"""
from collections import defaultdict

import ud_portfolio_c as UPC

GRP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}
PROPSETS = {"all": None, "core": {"points", "rebounds", "assists", "threes", "combos"}}
SIDES = {"O": ("Over",), "U": ("Under",), "B": ("Over", "Under")}
POOLS = {"RB": ("R", "B1", "B2", "B3"), "ALL": ("R", "F1", "F2", "F3", "B1", "B2", "B3")}
MAXSZ = 8
# id -> ("b1", (pool, side, props, rank, floor, game cap, skip), picks, structure) | ("doc", composition, picks, structure)
UNITS = {
    "P1": ("b1", ("RB", "B", "all", "base", 0.55, 1, 0), 6, "flex"),
    "P2": ("b1", ("RB", "U", "all", "base", 0.0, 1, 0), 6, "flex"),
    "P3": ("b1", ("ALL", "B", "core", "ev", 0.0, 1, 1), 2, "standard"),
    "P4": ("doc", "ex:rebounds_F2_U", 2, "standard"),
}
LABEL = {"P1": "RB-both-all-base-p0.55-gc1", "P2": "RB-Less-all-base-p0.00-gc1", "P3": "ALL-both-core-ev-p0.00-gc1-skip1",
         "P4": "composition ex:rebounds_F2_U"}


def legs_p(raw, fair):
    """raw = ud_portfolio_t.raw_legs(rows) -> legs with p = p_hat (legs without a market chance dropped), as reprice_day"""
    out = []
    for l in UPC.calibrate([dict(x) for x in raw], fair):
        l["p_raw"], l["p"] = l["p"], l["ph"]
        out.append(l)
    return out


def rows_p(rows, fair):
    """load_legs rows kept only where the leg has a market chance (reprice_day's rows filter, this season: Underdog's real factor)"""
    out = []
    for r in rows:
        x = {"player_id": r.get("player_id"), "prop": r["prop"], "side": r["side"], "line": r["line"], "lv": UPC.lvl(r.get("tier")),
             "m": r.get("factor")}
        if x["lv"] is None:
            x["lv"] = "R"
        nv, _src = UPC.nv_of(fair, x)
        if nv is not None:
            out.append(r)
    return out


def b1_slip(legs, prm, n):
    """research_app_final_strategies.day_matrix's slip for one combo: the first n of the MAXSZ pick list"""
    pool, side, ps, rk, fl, gc, sk = prm
    pset = PROPSETS[ps]
    base = [l for l in legs if l["tier"] in POOLS[pool] and l["side"] in SIDES[side] and (pset is None or GRP.get(l["prop"]) in pset)]
    if rk == "p":
        r = sorted(base, key=lambda l: -l["p"])
    elif rk == "ev":
        r = sorted(base, key=lambda l: -l["p"] * l["m"])
    elif rk == "base":
        r = sorted(base, key=lambda l: -(l["base"] if l.get("base") is not None else -1))
    else:
        r = sorted(base, key=lambda l: -(l["score"] if l.get("score") is not None else -1))
    cand = [l for l in r if l["p"] >= fl][sk:]
    pick, players, games = [], set(), defaultdict(int)
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
        if len(pick) == MAXSZ:
            break
    return pick[:n] if len(pick) >= n else None


def unit_slip(uid, legs, prows, E):
    """the unit's slip as leg dicts {cell, player, player_id, prop, tier, side, line, factor, event_id, ...} or None.
    legs = legs_p(...); prows = rows_p(load_legs rows); E = build_ud_slip_engine"""
    kind, prm, n, _st = UNITS[uid]
    if kind == "doc":
        sl = E.build_day_slips(E.eligible_legs(prows), prm, n, 1)
        if not sl:
            return None
        return [{"cell": l["cell"], "player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "tier": l["tier"], "side": l["side"],
                 "line": float(l["line"]), "factor": float(l["factor"]), "event_id": l["event_id"]} for l in sl[0]]
    s = b1_slip(legs, prm, n)
    if s is None:
        return None
    return [{"cell": f"P:{LABEL[uid]}", "player": l["player"], "player_id": l["player_id"], "prop": l["prop"], "tier": l["tier"], "side": l["side"],
             "line": float(l["line"]), "factor": float(l["m"]), "event_id": l["event_id"], "p_hat": round(l["p"], 4),
             "nv": round(l["nv"], 4), "nv_src": l["nv_src"], "final_hp": round(float(l["p_raw"]), 4)} for l in s]
