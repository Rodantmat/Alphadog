#!/usr/bin/env python3
"""
THE OWNER'S SET, ITS FALLBACKS, AND WHAT TO DO WHEN A LEG IS GONE (owner 2026-11-23 09:24 PT: "everything over 25% as daily, under as fallback.
Check if the fallbacks for the needed days hold positive ROI, otherwise we will drop it. Also check the best strategy, leg sub, shrink or slip drop.
If leg sub, have clear what is the pool used. We keep the best ROI."). READ-ONLY. PrizePicks / Underdog (research_universe loader: certified
grading, real prices, regular legs; PrizePicks half-point lines).
1. DAILY = the codes above 25% (research_candidates, 2026-11-23 00:48 PT); FALLBACK = the ones below. A slate is THIN when the daily codes build
   fewer slips than they number; the fallbacks then fill in order (never the same legs as a slip already built). Fallback ROI is read ONLY on those days.
2. LEG GONE: every leg of every built slip is removed in turn (a late scratch / pulled line can hit any leg) and the slip is re-made four ways:
     sub-own      the next leg of the strategy's OWN ranked pool (same ranking, same filters, same game / player rules) not already in the slip
     sub-main     the next leg of the app's MAIN list (every regular single-stat Under, blend order) not already in the slip
     shrink       the same slip without that leg, one size down (5F -> 4F, 3P / 3S -> 2-pick)
     drop         no slip (0)
   Reported per code: profit per affected slip (units) for each way; the best is kept.
Env: DATABASE_URL, UA_APP.
"""
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_universe as U                                     # noqa: E402

APP = U.APP; SEAS = U.SEAS
# code: (ranker, filters, gcap, struct, k, role)
SETS = {
    "prizepicks": [
        ("P1", "blend", ("single", "half", "line<10", "noast"), 1, "flex", 5, "daily"),
        ("P3", "blend", ("single", "half"), 1, "flex", 5, "daily"),
        ("P4", "avg", ("single", "half"), 1, "flex", 5, "daily"),
        ("P10", "blend", ("single", "half"), 1, "power", 3, "daily"),
        ("PB2B", "score", ("b2b", "half"), 2, "flex", 5, "daily"),
        ("P9", "blend", ("single", "half"), 1, "flex", 4, "fallback"),
    ],
    "underdog": [
        ("U9", "blend", ("noast",), 2, "power", 3, "daily"),
        ("UHR3", "hr", (), 1, "power", 3, "daily"),
        ("UBS3", "blend", ("single",), 2, "power", 3, "daily"),
        ("UPB3", "pb", ("hot",), 1, "power", 3, "daily"),
        ("U2", "ph", ("single",), 1, "power", 2, "fallback"),
        ("U1", "blend", ("single",), 1, "power", 2, "fallback"),
    ],
}[APP]
MAIN = ("blend", ("single", "half") if APP == "prizepicks" else ("single",))


def pay(st, k, w, lf_sum, lfh_sum, old):
    pw, fx = U.payouts(k, np.array([w]), np.array([0]), np.array([0.0]), np.array([lf_sum]), np.array([lfh_sum]), np.array([old]), {})
    v = (pw if st == "power" else fx)[0]
    return v if np.isfinite(v) else None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = U.load(conn)
    L = U.layers(d)
    reg = d["easy"].values == 0
    und = d["under"].values
    masks = {}
    for code, rk, filt, gcap, st, k, role in SETS:
        m = reg & und & np.isfinite(d[rk].values.astype(float))
        for f in filt:
            m &= L[f]
        masks[code] = m
    mm = reg & und & np.isfinite(d[MAIN[0]].values.astype(float))
    for f in MAIN[1]:
        mm &= L[f]
    by_gd = d.groupby("gd").indices
    out = defaultdict(list)            # code -> (season, gd, u, role_used)
    gone = defaultdict(lambda: defaultdict(list))
    thin_days = 0; days = 0
    for gd in sorted(by_gd):
        ix = by_gd[gd]; old = gd < "2026-07-01"; season = d["season"].values[ix[0]]
        pid = d["player_id"].values; gid = d["gid"].values; w = d["w"].values; lf = d["logf"].values

        def ranked(mask, rk):
            j = ix[mask[ix]]
            return j[np.argsort(-d[rk].values[j].astype(float), kind="mergesort")]

        def build(order, k, gcap, skip=(), seed=()):
            sel = list(seed); up = {pid[i] for i in sel}; ug = defaultdict(int)
            for i in sel:
                ug[gid[i]] += 1
            for i in order:
                if i in skip or pid[i] in up or ug[gid[i]] >= gcap:
                    continue
                sel.append(i); up.add(pid[i]); ug[gid[i]] += 1
                if len(sel) == k:
                    return sel
            return None

        def value(sel, st, k):
            s = np.array(sel)
            return pay(st, k, int(w[s].sum()), float(lf[s].sum()), float(lf[s][w[s] == 1].sum()), old)

        main_order = ranked(mm, MAIN[0])
        daily = [x for x in SETS if x[6] == "daily"]; fb = [x for x in SETS if x[6] == "fallback"]
        built = []; seen = set()
        for code, rk, filt, gcap, st, k, role in daily:
            order = ranked(masks[code], rk); s = build(order, k, gcap)
            if s is not None and value(s, st, k) is not None:
                built.append((code, s, order, gcap, st, k, "daily")); seen.add(frozenset(s))
        days += 1
        if len(built) < len(daily):
            thin_days += 1
            for code, rk, filt, gcap, st, k, role in fb:
                if len(built) >= len(daily):
                    break
                order = ranked(masks[code], rk); s = build(order, k, gcap)
                if s is None or frozenset(s) in seen or value(s, st, k) is None:
                    continue
                built.append((code, s, order, gcap, st, k, "fallback")); seen.add(frozenset(s))
        for code, s, order, gcap, st, k, used in built:
            base = value(s, st, k)
            out[code].append((season, gd, base - 1, used))
            # leg gone, each leg in turn
            for i in s:
                rest = [x for x in s if x != i]
                r = {}
                so = build(order, k, gcap, skip={i}, seed=rest)
                r["sub-own"] = (value(so, st, k) - 1) if so is not None and value(so, st, k) is not None else None
                sm = build(main_order, k, gcap, skip={i}, seed=rest)
                r["sub-main"] = (value(sm, st, k) - 1) if sm is not None and value(sm, st, k) is not None else None
                sk = value(rest, st, k - 1) if k - 1 >= (3 if st == "flex" else 2) else None
                if sk is None and st == "flex" and k - 1 == 2:      # a 3-pick Flex shrinks to a 2-pick Power / Standard
                    sk = value(rest, "power", 2)
                r["shrink"] = (sk - 1) if sk is not None else None
                r["drop"] = 0.0
                for kk, v in r.items():
                    gone[code][kk].append(v)
    print(f"SC|{APP}: slates {days} | thin (a daily code could not build) {thin_days}", flush=True)
    tot = defaultdict(list)
    for code, rk, filt, gcap, st, k, role in SETS:
        v = out.get(code, [])
        if not v:
            print(f"SC|  {code}: no slip", flush=True); continue
        t = pd.DataFrame(v, columns=["s", "gd", "u", "used"])
        for used, g in t.groupby("used"):
            u = g.u.values; top = np.sort(u)[::-1]
            cum = np.cumsum(u); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
            by = " / ".join(f"{100*g[g.s == s].u.mean():+.0f}% ({(g.s == s).sum()})" if (g.s == s).any() else "-" for s in SEAS)
            print(f"SC|  {code} ({role}, played as {used}): {len(u)} slips ROI {100*u.mean():+.1f}% {u.sum():+.1f} u | {by} | w/o 5 best {100*(u.sum()-top[:5].sum())/len(u):+.1f}% | dd {dd:.1f} u", flush=True)
            tot[used].extend(u)
        gl = gone[code]
        parts = []
        for kk in ("sub-own", "sub-main", "shrink", "drop"):
            vals = [x for x in gl[kk] if x is not None]
            miss = sum(x is None for x in gl[kk])
            parts.append(f"{kk} {np.mean(vals):+.3f} u ({len(vals)}{'; ' + str(miss) + ' could not' if miss else ''})")
        best = max(("sub-own", "sub-main", "shrink", "drop"), key=lambda kk: np.mean([x if x is not None else 0.0 for x in gl[kk]]))
        print(f"SC|    leg gone ({len(gl['drop'])} cases): " + " | ".join(parts) + f"  -> best: {best}", flush=True)
    for used, u in tot.items():
        print(f"SC|ALL {used}: {len(u)} slips ROI {100*np.mean(u):+.1f}% {np.sum(u):+.1f} u", flush=True)
    print("SC|DONE", flush=True)


if __name__ == "__main__":
    main()
