#!/usr/bin/env python3
"""
PASS 22 - CONSENSUS OF THE RANKERS. READ-ONLY. (NBA_HONEST_REBUILD.md 8aj)
Four independent opinions on a leg exist: the blend, the model, the sportsbooks' chance at the exact line, the small gbm. Until now they were used one at a time or in pairs.
  rankers  mean of the four chances | mean of three (no book, so every leg qualifies) | Borda (sum of the leg's ranks in the slate under each) with 3 and with 4 opinions
           | the WORST of its ranks (a leg is as good as its weakest opinion) | the best of its ranks
  layers   the leg is in the slate's top 10 / 15 / 20 / 30 of EVERY opinion (3 opinions, and 4), ranked by the blend or the average
Pools: every single stat, no assists, rebounds, lines under 10. Every structure, against the blend and the average with no layer.
Line format: structure pooled-return%(seasons positive of 3).
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass16 as R
import research_pass18 as P18
import research_pass19 as P19


def main():
    d = P18.load(); d["avg"] = (d["blend"] + d["ph"]) / 2
    g = d.groupby(["app", "gd"])
    for c in ("blend", "ph", "pb", "gbm_s"):
        d[f"r_{c}"] = g[c].rank(ascending=False, method="min")
    d["mean4"] = d[["blend", "ph", "pb", "gbm_s"]].mean(axis=1, skipna=False); d["mean3"] = d[["blend", "ph", "gbm_s"]].mean(axis=1, skipna=False)
    d["borda3"] = -(d["r_blend"] + d["r_ph"] + d["r_gbm_s"]); d["borda4"] = -(d["r_blend"] + d["r_ph"] + d["r_gbm_s"] + d["r_pb"])
    d["worst3"] = -d[["r_blend", "r_ph", "r_gbm_s"]].max(axis=1, skipna=False); d["best3"] = -d[["r_blend", "r_ph", "r_gbm_s"]].min(axis=1, skipna=False)
    d["worst4"] = -d[["r_blend", "r_ph", "r_gbm_s", "r_pb"]].max(axis=1, skipna=False)
    L = {"none": None}
    for N in (10, 15, 20, 30):
        d[f"T3_{N}"] = (-d["worst3"] <= N).fillna(False).values; L[f"top {N} of all three opinions"] = f"T3_{N}"
        d[f"T4_{N}"] = (-d["worst4"] <= N).fillna(False).values; L[f"top {N} of all four opinions"] = f"T4_{N}"
    pools = {"every single stat": lambda x: np.ones(len(x), bool), "no assists": lambda x: (x["prop"] != "assists").values, "rebounds": lambda x: (x["prop"] == "rebounds").values,
             "lines under 10": lambda x: (x["line"] < 10).values}
    RK = (("blend (reference)", "blend"), ("average (reference)", "avg"), ("mean of four", "mean4"), ("mean of three", "mean3"), ("Borda, three", "borda3"), ("Borda, four", "borda4"),
          ("worst rank of three", "worst3"), ("worst rank of four", "worst4"), ("best rank of three", "best3"))
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]
        print(f"\nP22|================ {app.upper()} ================", flush=True)
        for pn, pf in pools.items():
            print(f"P22|-- pool: {pn}", flush=True)
            for rn, col in RK:
                x = a[pf(a) & a[col].notna().values]
                days = [(gd, gg.sort_values(col, ascending=False)) for gd, gg in x.groupby("gd", sort=True)]
                for ln, mc in (L.items() if "reference" in rn else [("none", None)]):
                    res, hr = P19.run(days, mc, TAB)
                    print(f"P22|   {rn:22s} | {ln:30s}: {P19.line(res, app)} | legs of the 6-pick hit {100 * hr:.1f}% | 2-pick slips {len(res[('P', 2)])}", flush=True)
    print("P22|DONE", flush=True)


if __name__ == "__main__":
    main()
