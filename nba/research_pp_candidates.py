#!/usr/bin/env python3
"""RESEARCH - PRIZEPICKS CANDIDATES FROM THE UNIVERSE vs PORTFOLIO B (2026-11-03; owner 2026-11-02 21:18 PT "go deeper"). READ-ONLY.
research_pp_universe run 41583958382 surfaced new angles that hold in both seasons AND this season (non-demon):
  U3  low-volume Less ranked by the player's L10 average distance from the line (aedge), final_hp >= .65, <= 2 a game, skip top, 3P
  U4  the same, no skip, 4P
  L3  low-volume More + Less ranked by the player's L10 hit at the line, final_hp >= .70, 1 a game, 3P
  S2  steals 0.5 lines, More + Less, final_hp >= .60, 1 a game, 2P
  W4  low-volume low lines (slate's lower half), More + Less, final_hp >= .60, 1 a game, 4F
  C4  composition: 3 low-volume trailing-cell legs (>= .62) + 1 steals Less (blend), 4F
Each alone and in portfolios with B's six units (one slip each a slate, 1 unit each): per season slips a day, ROI, profit, max
drawdown, losing days, this season; the SET chosen on 2024-25 only -> 2025-26 (and reverse) among every B +/- candidate combination.
Same legs, trailing cells and grader as research_pp_universe. Env: DATABASE_URL, PC_SMOKE (1 = every 6th history slate)."""
import itertools
import os
import sys
import time
from collections import defaultdict, deque

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
if os.environ.get("PC_SMOKE") == "1":
    os.environ["UV_SMOKE"] = "1"
import build_slip_engine as SE                       # noqa: E402
import portfolio_b as PB                             # noqa: E402
import research_pp_universe as U                     # noqa: E402

T0 = time.time()
PERIODS = U.PERIODS
CANDS = {
    "U3": ("A", "R", "all", "U", "lowvol", "aedge", 0.65, 2, 1, 3, "power"),
    "U4": ("A", "R", "all", "U", "lowvol", "aedge", 0.65, 2, 0, 4, "power"),
    "L3": ("A", "R", "all", "B", "lowvol", "l10", 0.70, 1, 0, 3, "power"),
    "S2": ("A", "R", "half", "B", "steals", "p", 0.60, 1, 0, 2, "power"),
    "W4": ("A", "R", "low", "B", "lowvol", "p", 0.60, 1, 0, 4, "flex"),
    "C4": ("C", "lvB", "stlU", 3, 4, "flex"),
}
BUNITS = ("B3", "B4", "B5", "B6", "B7", "B9")


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def ordered(legs, po, pos, sd, ps, rk):
    pset = U.PROPSETS[ps]
    base = [l for l in legs if l["tier"] in U.POOLS[po] and l["side"] in U.SIDES[sd] and (pset is None or l["prop"] in pset)
            and (pos == "all" or (pos == "half" and l["line"] == 0.5) or (pos in ("low", "high") and l["_lp"] == pos))]
    base.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"], l["tier"]))
    return sorted(base, key=lambda l: (-l[rk], -l["p"]))


def cand_slip(legs, c):
    if c[0] == "C":
        _t, a, b, k, n, _st = c
        po, sd, ps, rk, fl = U.BLOCKS[a]; la = [l for l in ordered(legs, po, "all", sd, ps, rk) if l["p"] >= fl]
        po, sd, ps, rk, fl = U.BLOCKS[b]; lb = [l for l in ordered(legs, po, "all", sd, ps, rk) if l["p"] >= fl]
        first = U.pick_list(la, 1, need=k)
        if len(first) < k:
            return None
        g = defaultdict(int)
        for l in first:
            g[l["event_id"]] += 1
        pk = first + U.pick_list(lb, 1, used_p={l["player"] for l in first}, used_g=g, need=n - k)
    else:
        _t, po, pos, sd, ps, rk, fl, gc, sk, n, _st = c
        pk = U.pick_list([l for l in ordered(legs, po, pos, sd, ps, rk) if l["p"] >= fl][sk:], gc, need=n)
    if len(pk) < n or len({l["team_id"] for l in pk[:n]}) < 2:
        return None
    return pk[:n]


def max_dd(x):
    c = np.cumsum(x)
    return float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(c) else 0.0


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    slates = U.load(conn)
    conn.close()
    seas = np.array([s for s, _d, _l in slates])
    names = list(BUNITS) + list(CANDS)
    P = np.full((len(names), len(slates)), np.nan)
    hist, pbh = deque(maxlen=40), deque(maxlen=PB.WINDOW)
    sigs = defaultdict(dict)
    for di, (s, d, legs) in enumerate(slates):
        U.set_trails(legs, hist)
        prep = PB.prepare([dict(l) for l in legs], PB.window_rates(pbh))
        for i, uid in enumerate(BUNITS):
            sl = PB.unit_slip(prep, uid)
            if sl is not None:
                P[i, di] = U.grade(sl, PB.UNITS[uid][3]) - 1.0
                sigs[di][uid] = tuple(sorted((l["player"], l["prop"], l["side"], l["line"]) for l in sl))
        for j, (cid, c) in enumerate(CANDS.items()):
            sl = cand_slip(legs, c)
            if sl is not None:
                P[len(BUNITS) + j, di] = U.grade(sl, c[-1]) - 1.0
                sigs[di][cid] = tuple(sorted((l["player"], l["prop"], l["side"], l["line"]) for l in sl))
        hist.append(U.counts(legs))
        pbh.append(PB.slate_counts(PB.eligible([dict(l) for l in legs])))
    log("graded")
    print("\nEACH ALONE: slips | ROI | max dd per period")
    for i, nm in enumerate(names):
        print(f"  {nm}: " + " | ".join(f"{s} {int((~np.isnan(P[i][seas == s])).sum())} {100 * np.nanmean(P[i][seas == s]) if (~np.isnan(P[i][seas == s])).any() else 0:+.0f}% "
                                       f"dd {max_dd(np.nan_to_num(P[i][seas == s])):.1f}u" for s in PERIODS))
    print("\nIDENTICAL SLIPS between a candidate and a B unit (same legs, same slate):")
    for cid in CANDS:
        same = sum(1 for di in sigs for u in BUNITS if cid in sigs[di] and u in sigs[di] and sigs[di][cid] == sigs[di][u])
        print(f"  {cid}: {same}")
    # day-level correlation
    print("\nDAY P/L CORRELATION of each candidate with B (six units together), history days both played:")
    bday = np.nansum(P[:len(BUNITS)], 0)
    for j, cid in enumerate(CANDS):
        x = P[len(BUNITS) + j]; m = ~np.isnan(x) & (seas != "2026-27")
        print(f"  {cid}: {np.corrcoef(x[m], bday[m])[0, 1]:+.2f}")

    def metrics(idx, sel):
        Z = np.nan_to_num(P[idx][:, sel]); V = (~np.isnan(P[idx][:, sel])).sum()
        day = Z.sum(0)
        return V, (Z.sum() / max(V, 1)), Z.sum(), max_dd(day), float(np.mean(day[(~np.isnan(P[idx][:, sel])).any(0)] < 0)) if V else 0.0, V / max(sel.sum(), 1)

    sets = []
    for k in range(0, len(CANDS) + 1):
        for add in itertools.combinations(range(len(CANDS)), k):
            for drop in [()] + [(u,) for u in range(len(BUNITS))]:
                idx = [i for i in range(len(BUNITS)) if i not in drop] + [len(BUNITS) + a for a in add]
                if idx:
                    sets.append((idx, add, drop))
    rows = []
    for idx, add, drop in sets:
        r = {s: metrics(idx, seas == s) for s in PERIODS}
        lab = "B" + ("".join(f" -{BUNITS[u]}" for u in drop)) + "".join(f" +{list(CANDS)[a]}" for a in add)
        rows.append((lab, r))

    def fmt(lab, r):
        return (f"{lab:<34} " + " | ".join(f"{s} {r[s][5]:.2f}/day ROI {100 * r[s][1]:+5.1f}% {r[s][2]:+6.1f}u dd {r[s][3]:5.1f}u lose {100 * r[s][4]:.0f}%" for s in PERIODS))
    print("\nPORTFOLIOS (1 unit a slip):")
    base = next(r for lab, r in rows if lab == "B")
    print("  " + fmt("B (live)", base))
    for lab, r in sorted(rows, key=lambda x: -min(x[1]["2024-25"][1], x[1]["2025-26"][1]) * 1000 - 0)[:15]:
        print("  " + fmt(lab, r))
    print("\n  B plus ONE candidate:")
    for lab, r in rows:
        if lab.count("+") == 1 and "-" not in lab:
            print("  " + fmt(lab, r))
    print("\n  B with ONE unit swapped for ONE candidate:")
    for lab, r in rows:
        if lab.count("+") == 1 and lab.count(" -") == 1:
            if min(r["2024-25"][1], r["2025-26"][1]) > min(base["2024-25"][1], base["2025-26"][1]):
                print("  " + fmt(lab, r))
    print("\nHOLDOUT: the set with the best profit / drawdown chosen on one season only -> the other season and this season")
    for a, b in (("2024-25", "2025-26"), ("2025-26", "2024-25")):
        best = max(rows, key=lambda x: x[1][a][2] / max(x[1][a][3], 1))
        print(f"  chosen on {a}: {best[0]} -> {b} ROI {100 * best[1][b][1]:+.1f}% profit {best[1][b][2]:+.1f}u dd {best[1][b][3]:.1f}u | this season "
              f"ROI {100 * best[1]['2026-27'][1]:+.1f}% ({best[1]['2026-27'][0]} slips) | B on {b}: {100 * base[b][1]:+.1f}% {base[b][2]:+.1f}u dd {base[b][3]:.1f}u")
    log("DONE")


if __name__ == "__main__":
    main()
