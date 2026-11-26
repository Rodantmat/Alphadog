#!/usr/bin/env python3
"""
FINAL SET, step B (owner 2026-11-26 00:50 PT): (1) do filters/layers improve and hold on the chosen strategies, (2) sub / shrink / drop and the sub bank depth,
(3) final per-app sets and the union. Needs nba_score.ua_final (step A) and ua3 rows tagged '-f' (certify with UA_ONLY=1) and '-n'. READ-ONLY.
Env: DATABASE_URL, FN_N, PF_RHO.
"""
import os
import sys
from collections import defaultdict
from math import comb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pandas as pd
import psycopg
import research_final as RF
from research_best import parse, stats, J, merge, fmt, season

APPS = ("underdog", "fliff", "prizepicks", "sleeper", "betr")


def sig(r):
    return (r.app, r.tier, r.side, r.rk, RF.ni(r.gcap), RF.ni(r.pdif), RF.ni(r.altcap), RF.ni(r.start), str(r.nsl), r.st, int(r.k))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    fin = pd.read_sql("SELECT * FROM nba_score.ua_final", conn)
    F = pd.read_sql("SELECT * FROM nba_score.ua3 WHERE tag LIKE '%-f'", conn)
    conn.close()
    print(f"FF|final signatures {len(fin)} | layered rows {len(F)}", flush=True)
    S = RF.load()
    for s in S:
        s["J"] = J(s["m"])
    bysig = {}
    for s in S:
        bysig[(s["app"], s["layer"], s["tier"], s["side"], s["rk"], s["gcap"], s["pdif"], s["altcap"], s["start"], str(s["nsl"]), s["st"], s["k"])] = s
    main_s = defaultdict(list); fb_s = defaultdict(list)
    for r in fin.itertuples():
        k_ = (r.app, r.layer, r.tier, r.side, r.rk, int(r.gcap), int(r.pdif), int(r.altcap), int(r.start), str(r.nsl), r.st, int(r.k))
        s = bysig.get(k_)
        if s is None:
            print(f"FF|missing in -n: {r.label}", flush=True); continue
        (main_s if r.role == "main" else fb_s)[r.app].append(s)

    # ---------- (1) layers ----------
    print("\nFF|===== (1) FILTERS / LAYERS on the chosen strategies (same strategy, same cell, layer on vs off) =====", flush=True)
    L = {}
    for r in F.itertuples():
        day = parse(r.days); m = stats(day)
        if not m:
            continue
        L[(sig(r), r.layer)] = dict(day=day, m=m, k=int(r.k), gb=r.gone_base, gs=r.gone_sub, gh=r.gone_shrink, s1=getattr(r, "gone_s1", np.nan), s2=getattr(r, "gone_s2", np.nan),
                                    b2=getattr(r, "gone2_base", np.nan), sb2=getattr(r, "gone2_sub", np.nan), sh2=getattr(r, "gone2_shrink", np.nan))
    chosen = {a: main_s[a] + fb_s[a] for a in APPS}
    for a in ("underdog", "fliff", "prizepicks", "sleeper"):
        layers = sorted({l for (sg, l) in L if sg[0] == a and l != "none"})
        rows = []
        for l in layers:
            base = []; lay = []
            for s in chosen[a]:
                sg = (a, s["tier"], s["side"], s["rk"], s["gcap"], s["pdif"], s["altcap"], s["start"], str(s["nsl"]), s["st"], s["k"])
                b = L.get((sg, "none")); x = L.get((sg, l))
                if b and x:
                    base.append(dict(day=b["day"])); lay.append(dict(day=x["day"]))
            if len(base) < 3:
                continue
            rb = merge(base); rl = merge(lay)
            if not rb or not rl:
                continue
            gains = []
            for kk in ("r24", "r25", "r26", "rlate"):
                if rb[kk] == rb[kk] and rl[kk] == rl[kk]:
                    gains.append(rl[kk] - rb[kk])
            hold = bool(gains) and all(g > 0.02 for g in gains) and rl["units"] >= 0.9 * rb["units"] and rl["dd"] <= 1.1 * rb["dd"] + 1
            rows.append((hold, np.mean(gains) if gains else -9, l, len(base), rb, rl))
        rows.sort(key=lambda t: (-t[0], -t[1]))
        print(f"FF|  {a}: {len(layers)} layers tested on {len(chosen[a])} chosen strategies", flush=True)
        for hold, g, l, n, rb, rl in rows[:5]:
            print(f"FF|    {'HOLDS ' if hold else 'no    '}{l} ({n} strats): base {fmt(rb)}", flush=True)
            print(f"FF|          with layer: {fmt(rl)}", flush=True)
        print(f"FF|    layers that hold: {sum(1 for t in rows if t[0])} of {len(rows)}", flush=True)

    # ---------- (2) sub / shrink / drop and bank depth ----------
    print("\nFF|===== (2) PULLED LEG: sub / shrink / drop, sub bank depth (mean profit per slip with the pulled leg handled; weighted by slips) =====", flush=True)
    pol_tot = {}
    for a in ("underdog", "fliff", "prizepicks", "sleeper"):
        acc = defaultdict(float); w = 0.0; bysub = defaultdict(lambda: defaultdict(float)); wk = defaultdict(float)
        for s in chosen[a]:
            sg = (a, s["tier"], s["side"], s["rk"], s["gcap"], s["pdif"], s["altcap"], s["start"], str(s["nsl"]), s["st"], s["k"])
            x = L.get((sg, "none"))
            if not x or x["gb"] != x["gb"]:
                continue
            n = s["m"]["slips"]; k = s["k"]
            for nm, v in (("base", x["gb"]), ("sub1", x["gs"]), ("sub2", x["s1"]), ("sub3", x["s2"]), ("shrink", x["gh"]), ("drop", 0.0)):
                if v == v:
                    acc[nm] += v * n; bysub[k][nm] += v * n
            w += n; wk[k] += n
        if not w:
            print(f"FF|  {a}: no pulled-leg data", flush=True); continue
        print(f"FF|  {a}: one leg pulled, per slip: base {acc['base']/w:+.3f} | sub with 1st spare {acc['sub1']/w:+.3f} | 2nd spare {acc['sub2']/w:+.3f} | 3rd spare {acc['sub3']/w:+.3f} | shrink {acc['shrink']/w:+.3f} | drop {acc['drop']/w:+.3f}", flush=True)
        for k in sorted(bysub):
            b = bysub[k]; ww = wk[k]
            print(f"FF|      F{k}: base {b['base']/ww:+.3f} | sub1 {b['sub1']/ww:+.3f} | sub2 {b['sub2']/ww:+.3f} | sub3 {b['sub3']/ww:+.3f} | shrink {b['shrink']/ww:+.3f} | drop 0", flush=True)
        # two legs pulled
        a2 = defaultdict(float); w2 = 0.0
        for s in chosen[a]:
            sg = (a, s["tier"], s["side"], s["rk"], s["gcap"], s["pdif"], s["altcap"], s["start"], str(s["nsl"]), s["st"], s["k"])
            x = L.get((sg, "none"))
            if x and x["b2"] == x["b2"]:
                n = s["m"]["slips"]; a2["base"] += x["b2"] * n; a2["sub"] += x["sb2"] * n; a2["shrink"] += x["sh2"] * n; w2 += n
        if w2:
            print(f"FF|      two legs pulled: base {a2['base']/w2:+.3f} | sub both {a2['sub']/w2:+.3f} | shrink 2 {a2['shrink']/w2:+.3f} | drop 0", flush=True)
        pol_tot[a] = (acc, w)

    # ---------- (3) final sets + union ----------
    print("\nFF|===== (3) FINAL SETS =====", flush=True)
    Ns = RF.NS
    kept = {}
    for a in APPS:
        M = RF.order(main_s[a]); Fb = RF.order(fb_s[a]); N = Ns[a]
        best = None
        for cap in (1, 2, 3, 99):
            r = merge(M + Fb, cap, N)
            if r and (best is None or J(r) > best[0]):
                best = (J(r), cap, r)
        cap = best[1]; kept[a] = (cap, N)
        rm = merge(M, cap, N); rf = best[2]
        print(f"FF|  {a.upper()}: {N} slips on a good day, player cap {cap if cap < 99 else 'none'}", flush=True)
        print(f"FF|    main:     {fmt(rm)}", flush=True)
        print(f"FF|    +fallback: {fmt(rf)}", flush=True)
        for s in M:
            print(f"FF|      MAIN {s['label']} | {fmt(s['m'])}", flush=True)
        for s in Fb:
            print(f"FF|      FALL {s['label']} | {fmt(s['m'])}", flush=True)
    # union with cross-app player cap
    allst = []
    for a in APPS:
        allst += [dict(s, _a=a) for s in RF.order(main_s[a]) + RF.order(fb_s[a])]
    # per-app slot limit inside the union: apply app total cap by running merge per app first
    def app_days(a):
        cap, N = kept[a]
        days = defaultdict(list)
        pl = None
        for g in sorted({g for s in main_s[a] + fb_s[a] for g in s["day"]}):
            pl = defaultdict(int); n = 0
            for s in RF.order(main_s[a]) + RF.order(fb_s[a]):
                for p, legs in s["day"].get(g, []):
                    if n >= N or (cap < 99 and any(pl[x] >= cap for x in legs)):
                        continue
                    for x in legs:
                        pl[x] += 1
                    n += 1; days[g].append((p, legs))
        return days
    AD = {a: app_days(a) for a in APPS}
    print("FF|  UNION (each app at its own cap and slots; cross-app player cap on top):", flush=True)
    for xc in (1, 2, 3, 99):
        fake = [dict(day={g: v for g, v in AD[a].items()}) for a in APPS]
        r = merge(fake, xc)
        print(f"FF|    cross-app player cap {xc if xc < 99 else 'none'}: {fmt(r)}", flush=True)
    r = merge([dict(day=AD[a]) for a in ("underdog", "fliff", "prizepicks", "sleeper")], 99)
    print(f"FF|    without Betr, no cross-app cap: {fmt(r)}", flush=True)
    print("FF|DONE", flush=True)


if __name__ == "__main__":
    main()
