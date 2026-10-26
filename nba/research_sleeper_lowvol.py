#!/usr/bin/env python3
"""
RESEARCH - SLEEPER PART C: IS THE SIMULATED LOW-VOLUME EDGE REAL ON SLEEPER'S OWN BOARD? (2026-10-25). READ-ONLY.
Part B (research_sleeper_hist run 40266055713) found the robust simulated-history strategies concentrated in LOW-VOLUME props
(steals, blocks, turnovers, stocks) ranked by final_hp x m - the same family PrizePicks' live portfolio B leans on. Before
trusting it, on this season's REAL Sleeper window boards:
  C1 Sleeper's margin by prop group x side x kind: median p_market x m (0.889 = the same 12.4% overround as the balanced mains;
     lower = Sleeper charges more there - the simulation would then be too generous)
  C2 final_hp calibration and value (hp x m bins) by prop group x side - low-volume vs the rest
  C3 the leading simulated strategies played on the real slates, slip by slip (legs, multipliers, results)
Env: DATABASE_URL.
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_deep as RSD                  # noqa: E402

GRP = AF.GRP


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    today = dt.datetime.now(AF.UDL.PT).date()
    d = dt.date(2026, 10, 20); legs = []
    while d < today:
        st = AF.box(conn, d)
        if st:
            sl, mk, *_ = RSD.load(conn, d)
            for k, l in sl.get("window", {}).items():
                h = AF.outcome(st, l)
                if h is None:
                    continue
                mkl = mk.get(k)
                legs.append({**l, "slate": d, "hit": int(h), "pmk": float(np.mean(mkl)) if mkl else np.nan, "grp": GRP.get(l["prop"]),
                             "hpv": np.nan if l["hp"] is None else l["hp"]})
        d += dt.timedelta(days=1)
    print(f"real graded Sleeper window legs: {len(legs):,} over {len({l['slate'] for l in legs})} slates")
    print("\nC1 SLEEPER'S MARGIN by group x side x kind (median p_market x m; 0.889 = the balanced-main margin)")
    cell = defaultdict(list)
    for l in legs:
        if l["pmk"] == l["pmk"]:
            cell[(l["grp"], l["side"], l["kind"])].append((l["pmk"] * l["m"], l["pmk"], l["m"]))
    for k in sorted(cell, key=str):
        v = np.array(cell[k])
        if len(v) >= 20:
            print(f"  {str(k[0]):<9} {k[1]:<5} {k[2]:<4}: {len(v):5d} legs | p_mk x m median {np.median(v[:, 0]):.3f} (p10 {np.percentile(v[:, 0], 10):.3f}) | "
                  f"mean p_mk {v[:, 1].mean():.3f} | mean m {v[:, 2].mean():.2f}")
    print("\nC2 final_hp by group x side (real): calibration and value")
    for g in sorted({l["grp"] for l in legs if l["grp"]}):
        for side in ("Over", "Under"):
            x = [l for l in legs if l["grp"] == g and l["side"] == side and l["hpv"] == l["hpv"]]
            if len(x) < 40:
                continue
            p = np.array([l["hpv"] for l in x]); m = np.array([l["m"] for l in x]); h = np.array([l["hit"] for l in x], float)
            ev = p * m; ret = m * h - 1
            line = f"  {g:<9} {side:<5}: {len(x):5d} legs | mean hp {p.mean():.3f} hit {h.mean():.3f} | all {100 * ret.mean():+.1f}%"
            for lo in (1.0, 1.06, 1.10, 1.20):
                k = ev >= lo
                if k.sum():
                    line += f" | hp x m >= {lo:.2f}: {int(k.sum())} legs hit {h[k].mean():.2f} ret {100 * ret[k].mean():+.0f}%"
            print(line)
    print("\nC3 LEADING SIMULATED STRATEGIES ON THE REAL SLATES (one slip a slate; one pick per game, distinct players)")
    strats = [("More", "lowvol", 1.00, "main", 0), ("More", "lowvol", 1.06, "main", 0), ("More", "lowvol", 1.10, "main", 0),
              ("both", "lowvol", 1.00, "main", 0), ("Under", "lowvol", 1.10, "main", 1), ("More", "all", 1.00, "main", 0)]
    for side, ps, gate, kind, sk in strats:
        print(f"  {side}-{ps}-ev-gate{gate}-{kind}{'-skip1' if sk else ''}:")
        for sd in sorted({l["slate"] for l in legs}):
            c = [l for l in legs if l["slate"] == sd and l["hpv"] == l["hpv"] and (side == "both" or l["side"] == ("Over" if side == "More" else "Under"))
                 and (ps == "all" or l["grp"] == ps) and l["kind"] == kind and l["hpv"] * l["m"] >= gate]
            c.sort(key=lambda l: (-l["hpv"] * l["m"], str(l["player"])))
            pick, pl, gm, skp = [], set(), set(), 0
            for l in c:
                if skp < sk:
                    skp += 1; continue
                if l["player"] in pl or l["event_id"] in gm:
                    continue
                pick.append(l); pl.add(l["player"]); gm.add(l["event_id"])
                if len(pick) == 6:
                    break
            res = " ".join(f"{n}p:{'W' if all(x['hit'] for x in pick[:n]) else 'L'}" for n in (2, 3, 4) if len(pick) >= n)
            print(f"    {sd} ({len(c)} qualified) {res} | " + "; ".join(f"{l['player']} {l['prop']} {l['side'][0]} {l['line']} x{l['m']:.2f} hp {l['hpv']:.2f} "
                                                                  f"{'hit' if l['hit'] else 'miss'}" for l in pick[:4]))


if __name__ == "__main__":
    main()
