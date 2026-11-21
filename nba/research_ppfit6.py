#!/usr/bin/env python3
"""
PP FIT 6 - IS ONE NUMBER PER LEG ENOUGH? READ-ONLY. (owner 2026-11-20 15:45 PT)
Single-alternate ladders (the same alternate at sizes 2..6, all within PPFIT6_DT seconds, one leg a game). If PrizePicks prices a lineup
from one strength number per leg, every size's payout is a fixed smooth function of any other size's payout. Using the finest reading
(the 6-pick: 0.5 steps at ~40x = +/-0.6%) as the leg's strength, fit p_k = R(exp(poly(ln p6))) per size k (leave-one-day-out) and count
exact matches; same against the 2-pick reading, and per kind/side to see if the kind matters beyond the strength.
Env: DATABASE_URL, PPFIT_SINCE, PPFIT6_DT (120), PPFIT6_DEG (2).
"""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def rnd(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPFIT_SINCE", "2026-10-19")
    DT = int(os.environ.get("PPFIT6_DT", "120")); DEG = int(os.environ.get("PPFIT6_DEG", "2"))
    rows = conn.execute("SELECT extract(epoch FROM quoted_at::timestamptz)::bigint, left(quoted_at,10), n, power, flex, legs FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 2 AND 6 AND quoted_at >= %s ORDER BY 1", (since,)).fetchall()
    ev = defaultdict(list)
    for t, day, n, pw, fx, legs in rows:
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
        ev[f"{a.get('id')}|{a.get('odds')}|{a.get('side')}|{a.get('line')}"].append((t, day, n, top, fx.get(str(n)) or {}))
    lad = []
    for k, es in ev.items():
        for t, day, n, top, fx in es:
            if n != 6:
                continue
            near = {n2: (top2, fx2) for t2, _, n2, top2, fx2 in sorted(es, key=lambda e: abs(e[0] - t)) if abs(t2 - t) <= DT}
            near[6] = (top, fx)
            lad.append((day, k.split("|")[1] + "-" + k.split("|")[2], near))
    print(f"FIT6|ladders anchored on a 6-pick: {len(lad)} on {len({l[0] for l in lad})} days")
    # FLEX tiers from the same one-number strength (the 6-pick Power reading)
    for k in (3, 4, 5, 6):
        for h in range(k - 2, k + 1):
            pts = [(day, np.log(nr[6][0]), float((nr[k][1] or {}).get(str(h)))) for day, kd, nr in lad if k in nr and (nr[k][1] or {}).get(str(h)) is not None]
            pts = [p for p in pts if p[2] > 0]
            days = sorted({p[0] for p in pts})
            if len(pts) < 20:
                continue
            ok = w1 = 0; errs = []
            for dd in days:
                tr = [p for p in pts if p[0] != dd]; te = [p for p in pts if p[0] == dd]
                if len(tr) < 10:
                    continue
                c = np.polyfit([p[1] for p in tr], np.log([p[2] for p in tr]), 3)
                for p in te:
                    v = float(np.exp(np.polyval(c, p[1])))
                    ok += rnd(v) == p[2]; w1 += abs(rnd(v) - p[2]) <= step(p[2]) + 1e-9; errs.append(v / p[2] - 1)
            e = np.array(errs)
            if len(e):
                vals = sorted({p[2] for p in pts})
                print(f"FIT6|FLEX {h}/{k} from p6: {len(e):4d} | exact {100*ok/len(e):3.0f}% | within 1 step {100*w1/len(e):3.0f}% | abs err median {100*np.median(np.abs(e)):.2f}% | bias {100*e.mean():+.2f}% | values seen {vals[:12]}{'...' if len(vals) > 12 else ''}")
    for ref in (6, 2):
        for k in (2, 3, 4, 5, 6):
            if k == ref:
                continue
            pts = [(day, kd, np.log(nr[ref][0]), nr[k][0]) for day, kd, nr in lad if ref in nr and k in nr]
            if ref == 2:
                pts = [p for p in pts if 1.9 < np.exp(p[2]) < 18]
            days = sorted({p[0] for p in pts})
            if len(pts) < 20:
                continue
            ok = w1 = 0; errs = []
            for dd in days:
                tr = [p for p in pts if p[0] != dd]; te = [p for p in pts if p[0] == dd]
                if len(tr) < 10:
                    continue
                c = np.polyfit([p[2] for p in tr], np.log([p[3] for p in tr]), DEG)
                for p in te:
                    v = float(np.exp(np.polyval(c, p[2])))
                    ok += rnd(v) == p[3]; w1 += abs(rnd(v) - p[3]) <= step(p[3]) + 1e-9; errs.append(v / p[3] - 1)
            e = np.array(errs)
            if len(e):
                print(f"FIT6|from p{ref} -> p{k}: {len(e):4d} | exact {100*ok/len(e):3.0f}% | within 1 step {100*w1/len(e):3.0f}% | abs err median {100*np.median(np.abs(e)):.2f}% p90 {100*np.percentile(np.abs(e),90):.2f}% | bias {100*e.mean():+.2f}%")
            # kind effect: residual by kind with the all-data fit
            c = np.polyfit([p[2] for p in pts], np.log([p[3] for p in pts]), DEG)
            res = defaultdict(list)
            for p in pts:
                res[p[1]].append(np.log(p[3]) - np.polyval(c, p[2]))
            print(f"FIT6|   residual by kind-side: " + " | ".join(f"{kk} {100*np.mean(v):+.2f}% (n {len(v)})" for kk, v in sorted(res.items())))


if __name__ == "__main__":
    main()
