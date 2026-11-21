#!/usr/bin/env python3
"""
PP FIT 4 - ONE ALTERNATE, EVERY SIZE, SAME MINUTE. READ-ONLY. (owner 2026-11-20 15:45 PT)
Finding behind it: a leg's 2-pick payout does not depend on its standard partner (100% identical within a minute) but drifts over time
(64-93% identical within an hour). So each alternate is compared with itself at sizes 2..6 inside 120 seconds.
Prints, per alternate, p2 p3 p4 p5 p6 (+ Flex tiers) and the ratios p_k / p2 so the size rule can be read off directly; then tests rules:
  R1: p_k = R(B_k * f), f = p2/3 (rounded 2-pick) - best B_k by exact matches
  R2: latent f = intersection of all sizes' rounding cells with free B_k (grid search on B_k) - consistency rate
Env: DATABASE_URL, PPFIT_SINCE.
"""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg

BASE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def rnd(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPFIT_SINCE", "2026-10-19")
    rows = conn.execute("SELECT extract(epoch FROM quoted_at::timestamptz)::bigint, n, power, flex, legs FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 2 AND 6 AND quoted_at >= %s ORDER BY 1", (since,)).fetchall()
    ev = defaultdict(list)          # alt key -> [(t, n, top, flex)]
    for t, n, pw, fx, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        fx = fx if isinstance(fx, dict) else json.loads(fx or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        alts = [l for l in legs if l.get("odds") != "standard"]
        if len(alts) != 1 or len({l.get("game") for l in legs}) != n:
            continue
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        a = alts[0]
        ev[f"{a.get('id')}|{a.get('odds')}|{a.get('side')}|{a.get('line')}"].append((t, n, top, fx.get(str(n)) or {}))
    tuples = []
    for k, es in ev.items():
        es.sort()
        for i, (t, n, top, fx) in enumerate(es):
            if n != 2:
                continue
            near = {}
            for t2, n2, top2, fx2 in es:
                if abs(t2 - t) <= 120 and n2 > 2 and n2 not in near:
                    near[n2] = (top2, fx2)
            if near:
                tuples.append((k.split("|")[1], k.split("|")[2], top, near))
    print(f"FIT4|alternates with a 2-pick and a bigger single-alternate slip within 120 s: {len(tuples)}")
    # ratio table
    for n in (3, 4, 5, 6):
        r = [(kd, sd, p2, nr[n][0]) for kd, sd, p2, nr in tuples if n in nr]
        if not r:
            continue
        rat = np.array([pk / (p2 / 3) / BASE[n] for _, _, p2, pk in r])
        print(f"FIT4|size {n}: {len(r)} pairs | p_k / (base_k * p2/3): median {np.median(rat):.4f} p10 {np.percentile(rat, 10):.4f} p90 {np.percentile(rat, 90):.4f}")
        best = None
        for B in np.arange(BASE[n] * 0.80, BASE[n] * 1.10, BASE[n] * 0.0005):
            ok = sum(1 for _, _, p2, pk in r if abs(rnd(B * p2 / 3) - pk) < 1e-6)
            if best is None or ok > best[1]:
                best = (B, ok)
        print(f"FIT4|size {n}: R1 best adjusted base {best[0]:.4f} -> exact {best[1]}/{len(r)} ({100*best[1]/len(r):.0f}%)")
        by_kind = defaultdict(list)
        for kd, sd, p2, pk in r:
            by_kind[(kd, sd)].append(pk / (p2 / 3) / BASE[n])
        print("FIT4|size %d ratio by kind/side: " % n + " | ".join(f"{a}-{b} {np.median(v):.4f} (n {len(v)})" for (a, b), v in sorted(by_kind.items())))
    # R2 consistency: latent f must satisfy every size's cell with a common B per size
    full = [(kd, sd, p2, nr) for kd, sd, p2, nr in tuples if len(nr) >= 3]
    print(f"FIT4|alternates with >= 3 bigger sizes in the same 2 minutes: {len(full)}")
    for kd, sd, p2, nr in full[:40]:
        print(f"FIT4|  {kd:6s} {sd:5s} p2 {p2:6.2f} | " + " ".join(f"p{n} {nr[n][0]:7.2f} (x{nr[n][0] / p2:.3f})" for n in sorted(nr)) + " | flex " + json.dumps({n: nr[n][1] for n in sorted(nr)}))


if __name__ == "__main__":
    main()
