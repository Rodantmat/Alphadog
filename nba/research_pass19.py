#!/usr/bin/env python3
"""
PASS 19 - ARE THE PASS-18 TRAILING LAYERS REAL? NEIGHBOURS AND A RANDOM-LAYER TEST. READ-ONLY. (NBA_HONEST_REBUILD.md 8ai)
Pass 18 tried 8,550 cells an app; survivors can be chance. Two checks on the leading families:
  1. NEIGHBOURS. Every window (5, 8, 10, 15, 20 games) x threshold (50, 60, 70%) of the "share under the line" layer, last game over / under / last two over, minutes trend at
     0.90 / 0.95 / 1.00 / rising, 10 / 20 / 40 earlier games - against NO layer, for the blend, the model and their average, on four pools, EVERY structure.
     A real layer improves its neighbours too and in most structures; a chance one stands alone.
  2. RANDOM LAYERS. 40 layers that keep a random half of the legs (same size as "last game over"): how good does a layer look by luck? The real layer's place among them.
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

SEAS = R.SEAS


def run(days, mask_col, TAB):
    """days: list of (gd, sorted frame); mask_col: column name of a bool mask (or None). -> {(st,k): frame of (s,u)} and the hit rate of the legs used in the largest slip"""
    acc = {key: [] for key in TAB}; legs = []
    for gd, g in days:
        gg = g if mask_col is None else g[g[mask_col].values]
        if len(gg) < 2:
            continue
        pl = gg["player_id"].values; gm = gg["game_id"].values; pr = gg["prop"].values; hit = gg["hit"].values; s = gg["season"].iloc[0]
        for (st, k), table in TAB.items():
            ix = R.take_idx(pl, gm, pr, k)
            if ix is not None:
                acc[(st, k)].append((s, table.get(int(hit[ix].sum()), 0.0) - 1))
                if (st, k) == ("P", 6):
                    legs.extend(hit[ix])
    return {key: pd.DataFrame(rows, columns=["s", "u"]) for key, rows in acc.items()}, (float(np.mean(legs)) if legs else float("nan"))


def line(res, app):
    out = []
    for (st, k), t in res.items():
        if not len(t):
            out.append(f"{k}{'F' if st == 'F' else ('S' if app == 'underdog' else 'P')} -"); continue
        pos = sum(1 for s in SEAS if (t["s"] == s).any() and t[t["s"] == s]["u"].sum() > 0)
        out.append(f"{k}{'F' if st == 'F' else ('S' if app == 'underdog' else 'P')} {100 * t['u'].mean():+.0f}({pos})")
    return " ".join(out)


def main():
    d = P18.load()
    L = {"none": None}
    for N in (5, 8, 10, 15, 20):
        for th in (.5, .6, .7):
            d[f"L{N}_{th}"] = (d[f"w{N}"] >= th).values; L[f"last-{N} share {int(100 * th)}%+"] = f"L{N}_{th}"
    d["L_lo"] = d["lo"].values & (d["npr"] > 0); d["L_lu"] = d["lu"].values; d["L_lg2"] = d["lg2"].values
    L.update({"last game over": "L_lo", "last game under": "L_lu", "last two over": "L_lg2"})
    for th in (.90, .95, 1.0):
        d[f"M{th}"] = (d["mt"] < th).values; L[f"minutes under {th:.2f} of usual"] = f"M{th}"
    d["Mr"] = (d["mt"] > 1.05).values; L["minutes rising"] = "Mr"
    for N in (10, 20, 40):
        d[f"G{N}"] = (d["npr"] >= N).values; L[f"{N}+ earlier games"] = f"G{N}"
    rng = np.random.default_rng(19)
    for j in range(40):
        d[f"R{j}"] = rng.random(len(d)) < 0.5
    pools = {"every single stat": lambda g: np.ones(len(g), bool), "no assists": lambda g: (g["prop"] != "assists").values, "rebounds": lambda g: (g["prop"] == "rebounds").values,
             "lines under 10": lambda g: (g["line"] < 10).values}
    d["avg"] = (d["blend"] + d["ph"]) / 2
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]
        print(f"\nP19|================ {app.upper()} ================", flush=True)
        for rn, col in (("blend", "blend"), ("model", "ph"), ("average", "avg")):
            for pn, pf in pools.items():
                x = a[pf(a)]
                days = [(gd, g.sort_values(col, ascending=False)) for gd, g in x.groupby("gd", sort=True)]
                print(f"P19|-- {rn} | {pn}", flush=True)
                for ln, mc in L.items():
                    res, hr = run(days, mc, TAB)
                    print(f"P19|   {ln:28s}: {line(res, app)} | legs of the 6-pick hit {100 * hr:.1f}%", flush=True)
                if pn == "every single stat":
                    # the random-layer distribution, per structure: pooled return and seasons positive
                    rr = [run(days, f"R{j}", TAB)[0] for j in range(40)]
                    for key in TAB:
                        v = np.array([100 * r[key]["u"].mean() if len(r[key]) else np.nan for r in rr])
                        allpos = sum(1 for r in rr if len(r[key]) and all((r[key]["s"] == s).any() and r[key][r[key]["s"] == s]["u"].sum() > 0 for s in SEAS))
                        st, k = key
                        print(f"P19|   random half-layers {k}{'F' if st == 'F' else ('S' if app == 'underdog' else 'P')}: median {np.nanmedian(v):+.0f}%, best of 40 {np.nanmax(v):+.0f}%, 90th pct {np.nanpercentile(v, 90):+.0f}%, "
                              f"positive in every season {allpos} of 40", flush=True)
    print("P19|DONE", flush=True)


if __name__ == "__main__":
    main()
