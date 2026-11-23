#!/usr/bin/env python3
"""
CANDIDATES FROM THE UNIVERSE vs THE OWNER'S KEPT SET - one harness, exact luck test (owner 2026-11-22 23:11 PT: keep U9 / P1 / P10 / P3 / P4,
fallbacks P9 / U2 / U1; "look for better options than what we already have"). READ-ONLY.
Universe loader of research_universe.py (certified grading, real prices). Each strategy = one slip a slate of the top k legs of its pool (one a
player, games cap). Luck test (pass 3 of NBA_HONEST_REBUILD.md): the same slip re-drawn N times at random from its own pool on the same slates -
share of random draws doing as well (pooled and per season). Plus ROI by season, units, drawdown, drought, without the 5 best, legs' hit,
2024-25 -> 2025-26 transfer (a whole unseen season) and the 2026-27 holdout.
Env: DATABASE_URL, UA_APP (prizepicks | underdog), CN_DRAWS (500).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_universe as U                                     # noqa: E402

SEAS = U.SEAS
APP = U.APP
# name: (ranker, pool filters (all must hold), side, gcap, struct, k)
PPC = {
    "P1 kept: blend 5F single half line<10 noast": ("blend", ("single", "half", "line<10", "noast"), "Under", 1, "flex", 5),
    "P3 kept: blend 5F single half": ("blend", ("single", "half"), "Under", 1, "flex", 5),
    "P4 kept: avg 5F single half": ("avg", ("single", "half"), "Under", 1, "flex", 5),
    "P9 fallback: blend 4F single half": ("blend", ("single", "half"), "Under", 1, "flex", 4),
    "P10 kept: blend 3P single half": ("blend", ("single", "half"), "Under", 1, "power", 3),
    "C gbm_s 4F single half": ("gbm_s", ("single", "half"), "Under", 1, "flex", 4),
    "C gbm_s 5F single half": ("gbm_s", ("single", "half"), "Under", 1, "flex", 5),
    "C gbm_s 3P single half": ("gbm_s", ("single", "half"), "Under", 1, "power", 3),
    "C gbm_s 5F single half line<10": ("gbm_s", ("single", "half", "line<10"), "Under", 1, "flex", 5),
    "C gbm_s 6F single half": ("gbm_s", ("single", "half"), "Under", 1, "flex", 6),
    "C ph 5F trall_hot half": ("ph", ("trall_hot", "half"), "Under", 1, "flex", 5),
    "C ph 4F trall_hot half": ("ph", ("trall_hot", "half"), "Under", 1, "flex", 4),
    "C e_base 5F line>book half": ("e_base", ("line>book", "half"), "Under", 1, "flex", 5),
    "C e_base 4F line>book half": ("e_base", ("line>book", "half"), "Under", 1, "flex", 4),
    "C score 5F b2b half": ("score", ("b2b", "half"), "Under", 2, "flex", 5),
    "C hr 5F single half": ("hr", ("single", "half"), "Under", 1, "flex", 5),
    "C hcal 5F single half": ("hcal", ("single", "half"), "Under", 1, "flex", 5),
    "C fhp 5F single half": ("fhp", ("single", "half"), "Under", 1, "flex", 5),
    "C blend 5F single half lowfoul": ("blend", ("single", "half", "lowfoul"), "Under", 1, "flex", 5),
}
UDC = {
    "U9 kept: blend 3S noast 2/game": ("blend", ("noast",), "Under", 2, "power", 3),
    "U2 fallback: baseline 2S": ("ph", ("single",), "Under", 1, "power", 2),
    "U1 fallback: blend 2S": ("blend", ("single",), "Under", 1, "power", 2),
    "C hr 3S": ("hr", (), "Under", 1, "power", 3),
    "C hr 3S 2/game": ("hr", (), "Under", 2, "power", 3),
    "C hr 3S noast": ("hr", ("noast",), "Under", 1, "power", 3),
    "C hr 3S rebounds 2/game": ("hr", ("reb",), "Under", 2, "power", 3),
    "C hr 3S single": ("hr", ("single",), "Under", 1, "power", 3),
    "C hr 2S": ("hr", (), "Under", 1, "power", 2),
    "C hr 2S line<10": ("hr", ("line<10",), "Under", 1, "power", 2),
    "C hr 3S line<10": ("hr", ("line<10",), "Under", 1, "power", 3),
    "C blend 3S single 2/game": ("blend", ("single",), "Under", 2, "power", 3),
    "C blend 3S single": ("blend", ("single",), "Under", 1, "power", 3),
    "C gbm 3S def 2/game": ("gbm", ("def",), "Under", 2, "power", 3),
    "C gbm 2S def": ("gbm", ("def",), "Under", 1, "power", 2),
    "C avg 3S starter": ("avg", ("starter",), "Under", 1, "power", 3),
    "C avg 2S starter": ("avg", ("starter",), "Under", 1, "power", 2),
    "C pb 3S hot": ("pb", ("hot",), "Under", 1, "power", 3),
    "C gbm_s 3S": ("gbm_s", (), "Under", 2, "power", 3),
    "C hr 3S lowfoul": ("hr", ("lowfoul",), "Under", 1, "power", 3),
    "C hr 4F": ("hr", (), "Under", 1, "flex", 4),
    "C blend 4F rebounds": ("blend", ("reb",), "Under", 1, "flex", 4),
}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = U.load(conn)
    L = U.layers(d)
    draws = int(os.environ.get("CN_DRAWS") or 500)
    rng = np.random.default_rng(3)
    C = PPC if APP == "prizepicks" else UDC
    reg = d["easy"].values == 0
    by_gd = {gd: ix for gd, ix in d.groupby("gd").indices.items()}
    print(f"CN|{APP}: legs {len(d):,} slates {len(by_gd)} | draws {draws}", flush=True)
    rows = []
    for name, (rk, filt, side, gcap, st, k) in C.items():
        m = reg & np.isfinite(d[rk].values.astype(float))
        m &= d["under"].values if side == "Under" else ~d["under"].values
        for f in filt:
            m &= L[f]
        real = []; rnd = []; ses = []; hits = 0; legs = 0; days = []
        for gd, ix in by_gd.items():
            ix = ix[m[ix]]
            if len(ix) < k:
                continue
            old = gd < "2026-07-01"
            pid = d["player_id"].values[ix]; gid = d["gid"].values[ix]; w = d["w"].values[ix]; lf = d["logf"].values[ix]; v = d[rk].values[ix]

            def build(order):
                sel = []; up = set(); ug = defaultdict(int)
                for i in order:
                    if pid[i] in up or ug[gid[i]] >= gcap:
                        continue
                    sel.append(i); up.add(pid[i]); ug[gid[i]] += 1
                    if len(sel) == k:
                        return sel
                return None

            s = build(np.argsort(-v, kind="mergesort"))
            if s is None:
                continue
            s = np.array(s)
            pw, fx = U.payouts(k, np.array([w[s].sum()]), np.array([0]), np.array([0.0]), np.array([lf[s].sum()]), np.array([lf[s][w[s] == 1].sum()]), np.array([old]), {})
            pv = (pw if st == "power" else fx)[0]
            if not np.isfinite(pv):
                continue
            real.append(pv - 1); ses.append(d["season"].values[ix[0]]); hits += int(w[s].sum()); legs += k; days.append(gd)
            rr = np.empty(draws)
            for j in range(draws):
                t = build(rng.permutation(len(ix)))
                if t is None:
                    rr[j] = np.nan; continue
                t = np.array(t)
                a, b = U.payouts(k, np.array([w[t].sum()]), np.array([0]), np.array([0.0]), np.array([lf[t].sum()]), np.array([lf[t][w[t] == 1].sum()]), np.array([old]), {})
                rr[j] = (a if st == "power" else b)[0] - 1
            rnd.append(rr)
        if len(real) < 40:
            print(f"CN|  {name}: too few slips ({len(real)})", flush=True)
            continue
        u = np.array(real); R = np.vstack(rnd); se = np.array(ses)
        Rn = np.where(np.isnan(R), np.nanmean(R), R)
        p_all = float((Rn.sum(0) >= u.sum()).mean())
        cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
        run = best = 0
        for z in u:
            run = run + 1 if z < 0 else 0; best = max(best, run)
        top = np.sort(u)[::-1]
        rec = dict(name=name, n=len(u), roi=u.mean(), units=u.sum(), wo5=(u.sum() - top[:5].sum()) / len(u), dd=dd, drought=best, hit=hits / legs, p=p_all,
                   rnd=float(np.nanmean(R)))
        for ss in SEAS:
            mm = se == ss
            rec[f"n{ss[2:4]}"] = int(mm.sum()); rec[f"r{ss[2:4]}"] = float(u[mm].mean()) if mm.any() else np.nan
            rec[f"p{ss[2:4]}"] = float((Rn[mm].sum(0) >= u[mm].sum()).mean()) if mm.any() else np.nan
        rows.append(rec)
        print(f"CN|  {name}: {rec['n']} slips ROI {100*rec['roi']:+.1f}% {rec['units']:+.1f} u | {100*rec['r24']:+.0f} / {100*rec['r25']:+.0f} / {100*rec['r26']:+.0f}% "
              f"({rec['n24']}/{rec['n25']}/{rec['n26']}) | w/o 5 best {100*rec['wo5']:+.1f}% | dd {dd:.1f} u drought {best} | legs {100*rec['hit']:.1f}% | "
              f"random order {100*rec['rnd']:+.1f}% | luck p pooled {p_all:.3f}, by season {rec['p24']:.3f} / {rec['p25']:.3f} / {rec['p26']:.3f}", flush=True)
    print("CN|DONE", flush=True)


if __name__ == "__main__":
    main()
