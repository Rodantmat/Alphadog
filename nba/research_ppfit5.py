#!/usr/bin/env python3
"""
PP FIT 5 - SLIP PAYOUT FROM ITS LEGS' OWN 2-PICK PRICES, PER SIZE, POWER AND EVERY FLEX TIER. READ-ONLY. (owner 2026-11-20 15:45 PT)
Facts used (fit 1-4): a leg's 2-pick payout does not depend on its standard partner; prices drift over time (so every alternate is read
from its own 2-pick quote nearest in time, within PPFIT5_DT seconds); payouts are rounded to PrizePicks' grid; lineups holding an
alternate use adjusted bases; the size step from the 2-pick grows with the leg's size (big demons scale up more than goblins).
Model per size k and per payout tier (Power k/k, Flex tiers): ln P = c + sum over the slip's alternates of [ a_g * lnF_i + b_g * lnF_i^2 ]
  g = kind-side (goblin/demon x More/Less), F_i = leg 2-pick payout / 3. Standards contribute nothing (partner-invariant).
Honesty: leave-one-DAY-out - each day is predicted from a fit on the other days. Reports per size / tier: quotes, exact after rounding,
within one grid step, median and p90 absolute error, MEAN SIGNED error (bias - what would inflate or deflate an ROI).
Env: DATABASE_URL, PPFIT_SINCE (2026-10-19), PPFIT5_DT (600).
"""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg

G = ["go", "gu", "do", "du"]


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def rnd(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPFIT_SINCE", "2026-10-19")
    DT = int(os.environ.get("PPFIT5_DT", "600"))
    rows = conn.execute("SELECT extract(epoch FROM quoted_at::timestamptz)::bigint, left(quoted_at, 10), n, power, flex, legs FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 2 AND 6 AND quoted_at >= %s ORDER BY 1", (since,)).fetchall()
    two = defaultdict(list)       # alt key -> [(t, p2)]
    slips = []
    for t, day, n, pw, fx, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        fx = fx if isinstance(fx, dict) else json.loads(fx or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        alts = [l for l in legs if l.get("odds") != "standard"]
        if not alts or len({l.get("game") for l in legs}) != n:
            continue
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        keys = [(f"{a.get('id')}|{a.get('side')}|{a.get('line')}", (a.get("odds") or "x")[0] + (a.get("side") or "o")[0]) for a in alts]
        if n == 2 and len(alts) == 1:
            two[keys[0][0]].append((t, top))
        if n >= 3 or len(alts) == 2:
            tiers = {f"P{n}": top}
            for h, v in (fx.get(str(n)) or {}).items():
                tiers[f"F{n}/{h}"] = float(v)
            slips.append((t, day, n, keys, tiers))
    for k in two:
        two[k].sort()
    data = []
    for t, day, n, keys, tiers in slips:
        fs = []
        for key, g in keys:
            c = [(abs(t2 - t), p2) for t2, p2 in two.get(key, []) if abs(t2 - t) <= DT]
            if not c:
                fs = None
                break
            fs.append((g, np.log(min(c)[1] / 3)))
        if fs is None:
            continue
        x = np.zeros(2 * len(G) + 1)
        x[0] = 1
        for g, lf in fs:
            if g in G:
                j = G.index(g)
                x[1 + 2 * j] += lf
                x[2 + 2 * j] += lf * lf
        for tier, v in tiers.items():
            if v > 0:
                data.append((day, n, tier, x, v, len(keys)))
    print(f"FIT5|slips priced with every alternate's 2-pick within {DT}s: {len({(d[0], d[1], tuple(d[3])) for d in data})} | tier rows {len(data)} | days {len({d[0] for d in data})}")
    by = defaultdict(list)
    for d in data:
        by[d[2]].append(d)
    for tier in sorted(by, key=lambda s: (s[1], s)):
        rs = by[tier]
        days = sorted({r[0] for r in rs})
        if len(rs) < 30 or len(days) < 2:
            continue
        out = []
        for dd in days:
            tr = [r for r in rs if r[0] != dd]
            te = [r for r in rs if r[0] == dd]
            if len(tr) < 20:
                continue
            X = np.array([r[3] for r in tr]); y = np.log([r[4] for r in tr])
            used = X.any(0)
            w = np.zeros(X.shape[1])
            w[used] = np.linalg.lstsq(X[:, used] + 0, y, rcond=None)[0]
            for r in te:
                v = float(np.exp(r[3] @ w))
                out.append((rnd(v) == r[4], abs(rnd(v) - r[4]) <= step(r[4]) + 1e-9, v / r[4] - 1))
        if not out:
            continue
        e = np.array([o[2] for o in out])
        print(f"FIT5|{tier:7s}: {len(out):5d} out-of-day | exact {100*np.mean([o[0] for o in out]):3.0f}% | within 1 step {100*np.mean([o[1] for o in out]):3.0f}% | abs err median {100*np.median(np.abs(e)):.2f}% p90 {100*np.percentile(np.abs(e), 90):.2f}% | MEAN SIGNED {100*e.mean():+.2f}%")


if __name__ == "__main__":
    main()
