#!/usr/bin/env python3
"""
PP FIT 1 - HOW PRIZEPICKS PRICES A SLIP WITH GOBLINS / DEMONS. READ-ONLY. (NBA_HONEST_REBUILD.md; owner 2026-11-20 15:45 PT "we need to get it today")
Finding that started it: 3-6 pick Power payouts with alternates are not base_k x product(2-pick leg factors) (ratio 0.80-1.25).
Hypothesis tested here: once a slip is "adjusted" EVERY leg carries its own weight g (standards too), and the payout is
    Power_k = base_k * prod_i g_i          (base: 2->3, 3->6, 4->10, 5->20, 6->37.5)
so a 2-pick "factor" read against one standard partner is g_alt * g_partner, not g_alt.
Per quote time window (run_file) every leg gets one unknown ln g; least squares over every quote of that window.
Reports: residuals (log and relative) by size / composition, how often the fit is exact to PrizePicks' rounding, and how standards' g spread.
Also Flex: ratio of each Flex tier to the Power top tier, by size and alt count (is Flex = fixed table x the same prod g?).
Env: DATABASE_URL, PPFIT_SINCE (default 2026-10-19).
"""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg

BASE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPFIT_SINCE", "2026-10-19")
    rows = conn.execute("SELECT run_file, section, n, power, flex, power_adj, legs FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 2 AND 6 AND quoted_at >= %s", (since,)).fetchall()
    print(f"FIT|quotes={len(rows)} since {since}")
    by = defaultdict(list)
    for rf, sec, n, pw, fx, adj, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        fx = fx if isinstance(fx, dict) else json.loads(fx or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        keys = [f"{l.get('id')}|{l.get('odds')}|{l.get('side')}|{l.get('line')}" for l in legs]
        nalt = sum(1 for l in legs if l.get("odds") != "standard")
        gs = [l.get("game") for l in legs]
        sg = sum(1 for i in range(len(gs)) for j in range(i + 1, len(gs)) if gs[i] and gs[i] == gs[j])
        by[rf].append(dict(sec=sec, n=n, top=top, flex=fx.get(str(n)) or {}, adj=adj, keys=keys, nalt=nalt, sg=sg,
                           kinds="".join(sorted((l.get("odds") or "s")[0] + (l.get("side") or "o")[0] for l in legs if l.get("odds") != "standard"))))
    res = []          # (n, nalt, rel_resid, sec)
    gstd = []
    flexr = defaultdict(list)
    ONLY = os.environ.get("PPFIT_SG", "all")
    for rf, qs in by.items():
        qs = [q for q in qs if q["nalt"] > 0 and (ONLY == "all" or q["sg"] == 0)]          # all-standard slips are the plain table
        if len(qs) < 5:
            continue
        idx = {}
        for q in qs:
            for k in q["keys"]:
                idx.setdefault(k, len(idx))
        A = np.zeros((len(qs), len(idx))); y = np.zeros(len(qs))
        for i, q in enumerate(qs):
            for k in q["keys"]:
                A[i, idx[k]] = 1
            y[i] = np.log(q["top"] / BASE[q["n"]])
        # standards that never appear with variation are unidentified; ridge pulls them to g=1
        lam = 1e-3
        x = np.linalg.solve(A.T @ A + lam * np.eye(len(idx)), A.T @ y)
        pred = A @ x
        # leave-one-out-ish honesty: count how many quotes each leg is in
        cnt = A.sum(0)
        for i, q in enumerate(qs):
            informative = all(cnt[idx[k]] >= 2 for k in q["keys"])
            res.append((q["n"], q["nalt"], float(np.exp(y[i] - pred[i]) - 1), q["sec"], informative, q["sg"], q["top"]))
            for fn, fv in (q["flex"] or {}).items():
                flexr[(q["n"], min(q["nalt"], 3), int(fn))].append(float(fv) / q["top"])
        for k, j in idx.items():
            if "|standard|" in k and cnt[j] >= 3:
                gstd.append(float(np.exp(x[j])))
    r = np.array([abs(t[2]) for t in res if t[4]])
    print(f"FIT|fitted quotes={len(res)}  informative={len(r)}")
    if len(r):
        print(f"FIT|abs rel resid (informative): median {100*np.median(r):.2f}%  p90 {100*np.percentile(r,90):.2f}%  max {100*r.max():.2f}%  within 0.5% {100*(r<0.005).mean():.1f}%  within 1% {100*(r<0.01).mean():.1f}%")
    for n in range(2, 7):
        for na in range(1, n + 1):
            rr_ = np.array([abs(t[2]) for t in res if t[0] == n and t[1] == na and t[4]])
            if len(rr_) >= 5:
                print(f"FIT|  n={n} alts={na}: {len(rr_):4d} quotes | median {100*np.median(rr_):.2f}% | p90 {100*np.percentile(rr_,90):.2f}% | within 1% {100*(rr_<0.01).mean():.0f}%")
    for sgv in range(0, 4):
        rr_ = np.array([abs(t[2]) for t in res if t[5] == sgv and t[4]])
        if len(rr_) >= 5:
            print(f"FIT|  same-game pairs={sgv}: {len(rr_):4d} quotes | median {100*np.median(rr_):.2f}% | p90 {100*np.percentile(rr_,90):.2f}% | within 1% {100*(rr_<0.01).mean():.0f}%")
    tops = [t[6] for t in res]
    print("FIT|payout decimals: " + ", ".join(f"{d}dp {100*np.mean([len(str(v).split('.')[1]) == d if '.' in str(v) else d == 0 for v in tops]):.0f}%" for d in range(0, 4)))
    print("FIT|sample top payouts: " + " ".join(str(v) for v in sorted(set(tops))[:60]))
    if gstd:
        g = np.array(gstd)
        print(f"FIT|standard legs' own g (seen >=3 times): {len(g)} | median {np.median(g):.3f} | p10 {np.percentile(g,10):.3f} | p90 {np.percentile(g,90):.3f}")
    print("FIT|Flex tier / Power top, by size, alt count (3 = 3+), tier hits:")
    for key in sorted(flexr):
        v = np.array(flexr[key])
        if len(v) >= 5:
            print(f"FIT|  n={key[0]} alts={key[1]} hits={key[2]}: {len(v):4d} | median {np.median(v):.4f} | p10 {np.percentile(v,10):.4f} | p90 {np.percentile(v,90):.4f}")


if __name__ == "__main__":
    main()
