#!/usr/bin/env python3
"""
BEST OF THE BEST (owner 2026-11-26 00:41 PT: very high ROI, very low drawdown and losing days; per app all strategies worth it; best leg-exposure treatment).
READ-ONLY. Input nba_score.ua3 rows tagged '-n' (no filters, own boards; Betr from the cross-app orders). Structures 2-pick Power and 3-6 Flex.
WORTH IT = positive in every season it has, 2026-27 ROI >= 25%, positive Nov 8+, 2026-27 slips >= 10, losing days <= 62% of the days it plays.
Per app: greedy build (max 8, decorrelated) maximising  units / (drawdown + 2) x (1 - losing-day share); every player-exposure cap 1/2/3/none tried.
Union across apps: cross-app player cap 1/2/3/none x total slips a day. Env: DATABASE_URL, PF_SPLIT (2026-11-08), PF_RHO (0.7).
"""
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

SPLIT = os.environ.get("PF_SPLIT") or "2026-11-08"
RHO = float(os.environ.get("PF_RHO") or 0.7)


def season(g):
    return "2024-25" if g < "2025-07-01" else "2025-26" if g < "2026-07-01" else "2026-27"


def parse(s):
    out = {}
    for t in s.split("|"):
        if t:
            g, u, n, sl = t.split("#", 3)
            out[g] = [(float(z.split("@")[0]), set(z.split("@")[1].split("."))) for z in sl.split("/")]
    return out


def stats(day, cap=99):
    """day: {date: [(profit, legs)]} -> metrics (player cap applied inside one strategy)"""
    seas = defaultdict(lambda: [0.0, 0]); late = [0.0, 0]; du = []
    for g in sorted(day):
        pl = defaultdict(int); u = 0.0; n = 0
        for p, legs in day[g]:
            if cap < 99 and any(pl[x] >= cap for x in legs):
                continue
            for x in legs:
                pl[x] += 1
            u += p; n += 1; seas[season(g)][0] += p; seas[season(g)][1] += 1
            if g >= SPLIT:
                late[0] += p; late[1] += 1
        if n:
            du.append((g, u, n))
    if not du:
        return None
    arr = np.array([x[1] for x in du]); cum = np.cumsum(arr); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
    r = dict(units=float(arr.sum()), slips=sum(x[2] for x in du), days=len(du), dd=dd, ls=float((arr < 0).mean()), spd=sum(x[2] for x in du) / len(du),
             rlate=late[0] / late[1] if late[1] else np.nan, nlate=late[1], dayu=du)
    for ss in ("2024-25", "2025-26", "2026-27"):
        r["r" + ss[2:4]] = seas[ss][0] / seas[ss][1] if seas[ss][1] else np.nan; r["n" + ss[2:4]] = seas[ss][1]
    return r


def J(r):
    return r["units"] / (r["dd"] + 2) * (1 - r["ls"]) if r else -9


def merge(strats, cap=99, tot=999, xcap=99):
    """combine strategies: per-day player cap across the whole set, total slips cap"""
    days = sorted({g for s in strats for g in s["day"]})
    seas = defaultdict(lambda: [0.0, 0]); late = [0.0, 0]; du = []
    for g in days:
        pl = defaultdict(int); u = 0.0; n = 0
        for s in strats:
            for p, legs in s["day"].get(g, []):
                if n >= tot or (cap < 99 and any(pl[x] >= cap for x in legs)):
                    continue
                for x in legs:
                    pl[x] += 1
                u += p; n += 1; seas[season(g)][0] += p; seas[season(g)][1] += 1
                if g >= SPLIT:
                    late[0] += p; late[1] += 1
        if n:
            du.append((g, u, n))
    if not du:
        return None
    arr = np.array([x[1] for x in du]); cum = np.cumsum(arr); dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
    run = best = 0
    for z in arr:
        run = run + 1 if z < 0 else 0; best = max(best, run)
    r = dict(units=float(arr.sum()), slips=sum(x[2] for x in du), days=len(du), dd=dd, ls=float((arr < 0).mean()), spd=sum(x[2] for x in du) / len(du), run=best,
             rlate=late[0] / late[1] if late[1] else np.nan, nlate=late[1], dayu=du)
    for ss in ("2024-25", "2025-26", "2026-27"):
        r["r" + ss[2:4]] = seas[ss][0] / seas[ss][1] if seas[ss][1] else np.nan; r["n" + ss[2:4]] = seas[ss][1]
    return r


def fmt(r):
    f = lambda x: "-" if x != x else f"{100*x:+.0f}%"
    return (f"{r['spd']:.1f}/day | {f(r['r24'])} ({r['n24']}) / {f(r['r25'])} ({r['n25']}) / {f(r['r26'])} ({r['n26']}) | Nov 8+ {f(r['rlate'])} ({r['nlate']}) | units {r['units']:+.0f} | "
            f"dd {r['dd']:.0f}u | losing days {100*r['ls']:.0f}%" + (f" | run {r['run']}" if "run" in r else ""))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    df = pd.read_sql("SELECT app, sid, st, k, tier, side, rk, layer, nsl, start, gone_base, gone_sub, gone_shrink, days FROM nba_score.ua3 WHERE tag LIKE '%-n'", conn)
    conn.close()
    S = []; seen = set()
    for r in df.itertuples():
        if r.app == "underdog" and r.tier != "regular":
            continue
        h = (r.app, hash(r.days))
        if h in seen:
            continue
        seen.add(h)
        day = parse(r.days); m = stats(day)
        if not m:
            continue
        S.append(dict(app=r.app, k=int(r.k), st=r.st, label=f"{'P' if r.st == 'power' else 'F'}{int(r.k)} {r.tier} {r.side} {r.rk} [{r.layer}] #{int(r.start)} x{r.nsl}", day=day, m=m,
                      gb=r.gone_base, gs=r.gone_sub, gh=r.gone_shrink))
    print(f"BB|strategies read (unique): {len(S)}", flush=True)
    apps = sorted({s["app"] for s in S})
    W = []
    for s in S:
        m = s["m"]
        prior = [x for x in (m["r24"], m["r25"]) if x == x]
        ok = all(x > 0 for x in prior) and m["r26"] == m["r26"] and m["r26"] >= 0.25 and m["rlate"] == m["rlate"] and m["rlate"] > 0 and m["n26"] >= 10 and m["ls"] <= 0.62
        if ok:
            s["J"] = J(m); W.append(s)
    print("BB|worth-it strategies per app: " + " | ".join(f"{a} {sum(1 for s in W if s['app'] == a)}" for a in apps), flush=True)
    chosen = {}
    for a in apps:
        C = sorted([s for s in W if s["app"] == a], key=lambda s: -s["J"])
        print(f"\nBB|===== {a.upper()} =====", flush=True)
        if not C:
            print("BB|  nothing passes", flush=True); continue
        # decorrelated candidates on all common days
        days = sorted({g for s in C for g in s["day"]})
        pool = []
        for s in C[:120]:
            v = np.array([sum(p for p, _ in s["day"].get(g, [])) for g in days]); s["_v"] = v
            if any(np.std(v) > 0 and np.std(q["_v"]) > 0 and abs(np.corrcoef(v, q["_v"])[0, 1]) > RHO for q in pool):
                continue
            pool.append(s)
            if len(pool) >= 25:
                break
        best = None
        for cap in (1, 2, 3, 99):
            cur = []; curJ = -9
            while len(cur) < 8:
                opt = None
                for s in pool:
                    if s in cur:
                        continue
                    r = merge(cur + [s], cap)
                    if r and J(r) > curJ * 1.0 + 1e-9 and (opt is None or J(r) > opt[0]):
                        opt = (J(r), s)
                if not opt:
                    break
                curJ = opt[0]; cur.append(opt[1])
            r = merge(cur, cap)
            print(f"BB|  player cap {cap if cap < 99 else 'none'}: {len(cur)} strategies | J {J(r):.2f} | " + fmt(r), flush=True)
            if best is None or J(r) > best[0]:
                best = (J(r), cap, cur, r)
        chosen[a] = best
        print(f"BB|  BEST exposure for {a}: player cap {best[1] if best[1] < 99 else 'none'}", flush=True)
        for s in best[2]:
            m = s["m"]
            print(f"BB|    {s['label']} | alone: " + fmt(m).replace(f"{m['spd']:.1f}/day", f"{m['spd']:.1f}/day"), flush=True)
        # also the rest that are worth it (not in the build), best 10 by J
        rest = [s for s in C if s not in best[2]][:10]
        print(f"BB|  other worth-it strategies ({len(C) - len(best[2])}; top shown):", flush=True)
        for s in rest:
            print(f"BB|    {s['label']} | " + fmt(s["m"]), flush=True)
    # union
    allst = [s for a in chosen for s in chosen[a][2]]
    print("\nBB|===== ALL APPS TOGETHER =====", flush=True)
    res = []
    for cap in (1, 2, 3, 99):
        for tot in (6, 8, 10, 15, 20, 999):
            r = merge(allst, cap, tot)
            if r:
                res.append((J(r), cap, tot, r))
    for j, cap, tot, r in sorted(res, key=lambda x: -x[0])[:8]:
        print(f"BB|  cross-app player cap {cap if cap < 99 else 'none'}, total {tot if tot < 999 else 'none'}: J {j:.2f} | " + fmt(r), flush=True)
    j, cap, tot, r = max(res, key=lambda x: x[0])
    print(f"BB|BEST UNION: cross-app player cap {cap if cap < 99 else 'none'}, total {tot if tot < 999 else 'none'} ({len(allst)} strategies)", flush=True)
    print("BB|  exposure sweep (total cap fixed at best):", flush=True)
    for c2 in (1, 2, 3, 99):
        r2 = merge(allst, c2, tot); print(f"BB|    player cap {c2 if c2 < 99 else 'none'}: " + fmt(r2), flush=True)
    print("BB|  pulled legs (per-leg rate; expected value; sub / shrink / drop):", flush=True)
    for q in (0.05, 0.10, 0.20):
        parts = []
        for pol in ("sub", "shrink", "drop"):
            tot_u = 0.0; n = 0
            for s in allst:
                for g, sl in s["day"].items():
                    for p, legs in sl:
                        k = s["k"]; base = s["gb"]; alt = 0.0 if pol == "drop" else (s["gs"] if pol == "sub" else s["gh"])
                        adj = k * q * (1 - q) ** (k - 1) * (alt - base) if (alt == alt and base == base) else 0.0
                        tot_u += p + adj; n += 1
            parts.append(f"{pol} {tot_u:+.0f}u")
        print(f"BB|    q {int(100*q)}%: " + " | ".join(parts) + f" (no pulls: {sum(p for s in allst for sl in s['day'].values() for p, _ in sl):+.0f}u, uncapped)", flush=True)
    print("BB|DONE", flush=True)


if __name__ == "__main__":
    main()
