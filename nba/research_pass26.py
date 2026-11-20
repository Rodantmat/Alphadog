#!/usr/bin/env python3
"""
PASS 26 - TRAILING RESULTS OF THE PLAYER AND OF THE PROP. READ-ONLY. (NBA_HONEST_REBUILD.md 8am; owner: "new trailings")
Pass 18 used the player's own game log. Here the trail is the RESULT OF HIS LEGS on the app (earlier days only):
  player trail   share of his last 8 / 15 Under legs on this app that hit (needs 5+ / 8+ earlier legs): hot 60%+ | cold 40% or less | no record yet
  prop trail     how the day's top-10 legs of this prop did over the last 10 / 20 slates: hot (above the app's own trailing rate) | cold
  day trail      how the app's top-10 legs did over the last 5 / 10 slates: hot | cold (is the ranking on a run?)
Layers on the blend and the average, every structure, against no layer, plus the hit rate of the legs used.  Line format: structure pooled-return%(seasons positive of 3).
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
    d = d.sort_values(["app", "gd"]).reset_index(drop=True)
    # player trail: per (app, player, day) hits and legs -> rolling over EARLIER days
    pdx = d.groupby(["app", "player_id", "gd"], as_index=False).agg(h=("hit", "sum"), n=("hit", "size")).sort_values(["app", "player_id", "gd"])
    g = pdx.groupby(["app", "player_id"])
    for W in (4, 8):                                         # days with legs (about 8 / 15 legs)
        hh = g["h"].transform(lambda s: s.shift(1).rolling(W, min_periods=3).sum()); nn = g["n"].transform(lambda s: s.shift(1).rolling(W, min_periods=3).sum())
        pdx[f"pt{W}"] = hh / nn
    d = d.merge(pdx[["app", "player_id", "gd", "pt4", "pt8"]], on=["app", "player_id", "gd"], how="left")
    top = d.sort_values("blend", ascending=False).groupby(["app", "gd"]).head(10)
    dd = top.groupby(["app", "gd"], as_index=False).agg(h=("hit", "sum"), n=("hit", "size")).sort_values(["app", "gd"])
    for W in (5, 10, 20):
        dd[f"dt{W}"] = dd.groupby("app")["h"].transform(lambda s: s.shift(1).rolling(W, min_periods=3).sum()) / dd.groupby("app")["n"].transform(lambda s: s.shift(1).rolling(W, min_periods=3).sum())
    d = d.merge(dd[["app", "gd", "dt5", "dt10", "dt20"]], on=["app", "gd"], how="left")
    top20 = d.sort_values("blend", ascending=False).groupby(["app", "gd"]).head(25)
    pp = top20.groupby(["app", "prop", "gd"], as_index=False).agg(h=("hit", "sum"), n=("hit", "size")).sort_values(["app", "prop", "gd"])
    for W in (10, 20):
        pp[f"rt{W}"] = pp.groupby(["app", "prop"])["h"].transform(lambda s: s.shift(1).rolling(W, min_periods=4).sum()) / pp.groupby(["app", "prop"])["n"].transform(lambda s: s.shift(1).rolling(W, min_periods=4).sum())
    last = {}
    for (a, pr), x in pp.groupby(["app", "prop"]):
        last[(a, pr)] = (x["gd"].values, x["rt10"].values, x["rt20"].values, x["h"].values, x["n"].values)
    # the prop's trail as of each leg's day (a prop may be absent from the top that day): use its last EARLIER record incl. that record's own day
    r10 = np.full(len(d), np.nan); r20 = np.full(len(d), np.nan)
    ppx = pp.copy()
    for W in (10, 20):
        ppx[f"in{W}"] = ppx.groupby(["app", "prop"])["h"].transform(lambda s: s.rolling(W, min_periods=4).sum()) / ppx.groupby(["app", "prop"])["n"].transform(lambda s: s.rolling(W, min_periods=4).sum())
    idx = {k: (x["gd"].values, x["in10"].values, x["in20"].values) for k, x in ppx.groupby(["app", "prop"])}
    for i, (a, pr, gd) in enumerate(zip(d["app"].values, d["prop"].values, d["gd"].values)):
        v = idx.get((a, pr))
        if v is None:
            continue
        j = np.searchsorted(v[0], gd) - 1
        if j >= 0:
            r10[i] = v[1][j]; r20[i] = v[2][j]
    d["rt10"] = r10; d["rt20"] = r20
    L = {"none": None}
    for nm, m in (("player hot (last ~8 legs 60%+)", d["pt4"] >= .6), ("player cold (last ~8 legs 40% or less)", d["pt4"] <= .4), ("player hot (last ~15 legs 60%+)", d["pt8"] >= .6),
                  ("player cold (last ~15 legs 40% or less)", d["pt8"] <= .4), ("player not cold (~15 legs above 40% or no record)", ~(d["pt8"] <= .4)), ("no record yet", d["pt4"].isna()),
                  ("prop hot (10 slates, 55%+)", d["rt10"] >= .55), ("prop cold (10 slates, under 50%)", d["rt10"] < .5), ("prop hot (20 slates, 55%+)", d["rt20"] >= .55),
                  ("prop cold (20 slates, under 50%)", d["rt20"] < .5), ("prop not cold (20 slates 50%+ or no record)", ~(d["rt20"] < .5)),
                  ("ranking hot (5 slates, 55%+)", d["dt5"] >= .55), ("ranking cold (5 slates, under 50%)", d["dt5"] < .5), ("ranking hot (10 slates, 55%+)", d["dt10"] >= .55),
                  ("ranking cold (10 slates, under 50%)", d["dt10"] < .5), ("ranking hot (20 slates, 55%+)", d["dt20"] >= .55), ("ranking cold (20 slates, under 50%)", d["dt20"] < .5)):
        c = f"L{len(L)}"; d[c] = m.fillna(False).values; L[nm] = c
    for app in ("underdog", "prizepicks"):
        a = d[d["app"] == app]
        print(f"P26|{app} leg hit rate: " + " | ".join(f"{nm}: {100 * a[a[c]]['hit'].mean():.1f}% ({int(a[c].sum()):,})" for nm, c in L.items() if c), flush=True)
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]
        print(f"\nP26|================ {app.upper()} ================", flush=True)
        for rn, col in (("blend", "blend"), ("average", "avg")):
            for pn, pm in (("every single stat", np.ones(len(a), bool)), ("no assists", (a["prop"] != "assists").values)):
                x = a[pm]; days = [(gd, gg.sort_values(col, ascending=False)) for gd, gg in x.groupby("gd", sort=True)]
                print(f"P26|-- {rn} | {pn}", flush=True)
                for ln, mc in L.items():
                    res, hr = P19.run(days, mc, TAB)
                    print(f"P26|   {ln:50s}: {P19.line(res, app)} | legs of the 6-pick hit {100 * hr:.1f}% | 2-pick slips {len(res[('P', 2)])}", flush=True)
    print("P26|DONE", flush=True)


if __name__ == "__main__":
    main()
