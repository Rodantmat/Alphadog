#!/usr/bin/env python3
"""
LADDER-ALL ANALYSIS - ONE GOBLIN / DEMON AT A TIME BESIDE THE SAME REGULARS. READ-ONLY. (owner 2026-11-20 18:20 PT)
Source: section LAD quotes (mode ladderall / ladder): each rung of a ladder is the only non-regular leg beside the SAME 1..5 regular legs from
other games, quoted at 2..6 picks in the same minutes. note = tier|distance from anchor|anchor|R (regular line) or S (switch point)|player | stat.
  1. Control: the regular line itself (S0) must pay the plain table 3 / 6 / 10 / 20 / 37.5 and Flex 2+0.5 ... 25+2+0.4.
  2. Per rung, the multiplier at each size: g_k = Power_k / table_k (the owner's "deduction": 2-pick 2.8 = -0.2 = g 0.933). Does it stick
     from 2 to 6 picks? Exact mapping 2-pick -> k-pick payout (is the k-pick fully decided by the 2-pick? by the 6-pick?).
  3. What sets g_2: tier, distance, anchor level, regular vs switch, stat, side - tables per stat (Points first).
  4. Flex tiers per size against the Power payout of the same slip.
Env: DATABASE_URL, PPLAD_SINCE (2026-11-20T00:00).
"""
import json
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

TABLE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEXT = {2: {2: 2.0, 1: 0.5}, 3: {3: 3.0, 2: 1.0}, 4: {4: 6.0, 3: 1.5}, 5: {5: 10.0, 4: 2.0, 3: 0.4}, 6: {6: 25.0, 5: 2.0, 4: 0.4}}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPLAD_SINCE", "2026-11-20T00:00")
    rows = conn.execute("SELECT run_file, quoted_at, n, power, flex, note, legs FROM nba_market.pp_quote WHERE section='LAD' AND status=200 AND quoted_at >= %s", (since,)).fetchall()
    conn.close()
    recs = []
    for rf, qa, n, pw, fx, note, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        fx = fx if isinstance(fx, dict) else json.loads(fx or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        parts = (note or "").split("|")
        if len(parts) < 4:
            continue
        tier = parts[0]; dist = float(parts[1]); anchor = float(parts[2])
        if len(parts) >= 5 and parts[3] in ("R", "S"):
            rs = parts[3]; ps = "|".join(parts[4:])
        else:
            rs = "R"; ps = "|".join(parts[3:])
        player, stat = [x.strip() for x in ps.split(" | ")] if " | " in ps else (ps, "?")
        a = legs[0]
        recs.append(dict(rf=rf, qa=qa, n=n, top=top, flex={int(k): float(v) for k, v in (fx.get(str(n)) or {}).items()}, tier=tier, dist=dist, anchor=anchor, rs=rs,
                         player=player, stat=stat, line=float(a.get("line")), side=a.get("side"), odds=a.get("odds"), rid=f"{rf}|{a.get('id')}|{a.get('side')}"))
    d = pd.DataFrame(recs)
    print(f"LAD|quotes {len(d):,} | rungs {d['rid'].nunique():,} | ladders {d.groupby(['player','stat']).ngroups:,} | stats {d['stat'].nunique()}", flush=True)
    if d.empty:
        return
    # 1. control
    c = d[d["tier"] == "S0"]
    for n in range(2, 7):
        x = c[c["n"] == n]
        if len(x):
            ok = (x["top"] == TABLE[n]).mean()
            fl = x["flex"].apply(lambda f: f == FLEXT[n]).mean()
            print(f"LAD|control regular line alone, {n}-pick: {len(x)} | Power = {TABLE[n]} in {100*ok:.0f}% | Flex = table in {100*fl:.0f}% | other Power values {sorted(set(x.loc[x['top'] != TABLE[n], 'top']))[:6]}", flush=True)
    a = d[d["tier"] != "S0"].copy()
    a["kind"] = a["odds"]; a["sd"] = np.where(a["side"] == "under", "Less", "More")
    a["g"] = a["top"] / a["n"].map(TABLE)
    w = a.pivot_table(index=["rid", "player", "stat", "kind", "sd", "tier", "dist", "anchor", "rs"], columns="n", values="top", aggfunc="first").reset_index()
    print(f"LAD|rungs with every size 2-6: {int(w[[2,3,4,5,6]].notna().all(axis=1).sum()) if all(k in w for k in (2,3,4,5,6)) else 0:,}", flush=True)
    # 2. does the 2-pick multiplier stick?
    for n in (3, 4, 5, 6):
        if n not in w or 2 not in w:
            continue
        x = w[w[2].notna() & w[n].notna()]
        g2 = x[2] / 3; gn = x[n] / TABLE[n]
        same = (np.abs(gn - g2) < 1e-9).mean()
        print(f"LAD|{n}-pick vs 2-pick multiplier: {len(x):,} rungs | identical {100*same:.0f}% | g_{n}/g_2 median {np.median(gn/g2):.4f} (p10 {np.percentile(gn/g2,10):.4f}, p90 {np.percentile(gn/g2,90):.4f})", flush=True)
        # is the k-pick payout fully decided by the 2-pick payout?
        grp = x.groupby(2)[n].agg(lambda s: len(set(s)))
        print(f"LAD|   {n}-pick decided by the 2-pick value alone: {100*(grp == 1).mean():.0f}% of 2-pick values map to ONE {n}-pick value (values {len(grp)})", flush=True)
        if 6 in w and n != 6:
            y = w[w[6].notna() & w[n].notna()]
            grp6 = y.groupby(6)[n].agg(lambda s: len(set(s)))
            print(f"LAD|   {n}-pick decided by the 6-pick value: {100*(grp6 == 1).mean():.0f}% (values {len(grp6)})", flush=True)
    # mapping table 2-pick -> each size (median and spread)
    if 2 in w:
        print("LAD|mapping (2-pick payout -> median 3/4/5/6-pick payout, n): ", flush=True)
        for v, x in w.groupby(2):
            if len(x) < 3:
                continue
            print(f"LAD|   2-pick {v:6.2f} (g {v/3:.3f}, n {len(x):3d}) -> " + " | ".join(f"{k}: {x[k].median():.2f} [{x[k].min():.2f}-{x[k].max():.2f}]" for k in (3, 4, 5, 6) if k in x and x[k].notna().any()), flush=True)
    # 3. what sets the 2-pick multiplier
    if 2 in w:
        z = w[w[2].notna()].copy(); z["g2"] = z[2] / 3
        z["rel"] = z["dist"].abs() / z["anchor"].clip(lower=0.5); z["dsq"] = z["dist"].abs() / np.sqrt(z["anchor"].clip(lower=0.5))
        for stat in ["Points"] + sorted(s for s in z["stat"].unique() if s != "Points"):
            zs = z[z["stat"] == stat]
            if len(zs) < 20:
                continue
            print(f"LAD|==== {stat}: {len(zs)} rungs", flush=True)
            for (kind, sd), y in zs.groupby(["kind", "sd"]):
                t = y.groupby("tier")["g2"].agg(["count", "median", "min", "max"])
                print(f"LAD|  {kind} {sd} by tier: " + " | ".join(f"{k}: n {int(r['count'])} g {r['median']:.3f} [{r['min']:.3f}-{r['max']:.3f}]" for k, r in t.iterrows()), flush=True)
                y1 = y[y["tier"].str[1:].str.rstrip("u") == "1"]
                if len(y1) >= 8:
                    t2 = y1.groupby(pd.cut(y1["anchor"], [0, 5.5, 10.5, 15.5, 20.5, 25.5, 30.5, 40.5, 99]))["g2"].agg(["count", "median"])
                    print(f"LAD|    tier 1 by anchor level: " + " | ".join(f"{k}: n {int(r['count'])} g {r['median']:.3f}" for k, r in t2.iterrows() if r["count"] > 0), flush=True)
                    t3 = y1.groupby(y1["dist"].abs())["g2"].agg(["count", "median"])
                    print(f"LAD|    tier 1 by distance (points from anchor): " + " | ".join(f"{k:g}: n {int(r['count'])} g {r['median']:.3f}" for k, r in t3.iterrows()), flush=True)
                    t4 = y1.groupby("rs")["g2"].agg(["count", "median"])
                    print(f"LAD|    tier 1 regular (R) vs switch (S): " + " | ".join(f"{k}: n {int(r['count'])} g {r['median']:.3f}" for k, r in t4.iterrows()), flush=True)
                # within the same distance-per-sqrt(anchor) bucket, how much spread remains
                y = y.assign(b=pd.cut(y["dsq"], [0, .15, .25, .35, .5, .7, 1, 1.5, 2.5, 9]))
                t5 = y.groupby("b")["g2"].agg(["count", "median", "std"])
                print(f"LAD|    by distance / sqrt(anchor): " + " | ".join(f"{k}: n {int(r['count'])} g {r['median']:.3f} sd {r['std']:.3f}" for k, r in t5.iterrows() if r["count"] >= 3), flush=True)
    # 4. flex vs power of the same slip
    for n in (3, 4, 5, 6):
        x = a[a["n"] == n]
        if len(x) < 20:
            continue
        tiers = sorted({k for f in x["flex"] for k in f})
        out = []
        for h in tiers:
            v = x["flex"].apply(lambda f: f.get(h, np.nan)) / x["top"]
            out.append(f"{h}/{n}: ratio to Power median {np.nanmedian(v):.3f} (p10 {np.nanpercentile(v,10):.3f}, p90 {np.nanpercentile(v,90):.3f})")
        print(f"LAD|Flex {n}-pick: " + " | ".join(out), flush=True)
    d.to_csv("/tmp/pplad.csv", index=False)


if __name__ == "__main__":
    main()
