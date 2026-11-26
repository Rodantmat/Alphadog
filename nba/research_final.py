#!/usr/bin/env python3
"""
FINAL SET, step A (owner 2026-11-26 00:50 PT): per app a MAIN set for good days (N slips/day: 5-6 for the better apps, fewer for weaker), small slips first
(at least one 2-pick Power or 3-pick Flex, bigger slips Flex only), low drawdown / few losing days; then a FALLBACK set that only fills the slots the main
set leaves empty on thin days. Reads clean '-n' rows of nba_score.ua3. Writes the chosen signatures to a scratch table (ua_final; ua_final_live with FN_LIVE=1) for step B.
Env: DATABASE_URL, FN_N ("underdog:6,fliff:6,prizepicks:6,sleeper:5,betr:4"), PF_RHO (0.7), PF_SPLIT.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pandas as pd
import psycopg
import research_best as RB
from research_best import parse, stats, J, merge, fmt

RHO = float(os.environ.get("PF_RHO") or 0.7)
FT = "ua_final_live" if os.environ.get("FN_LIVE") == "1" else "ua_final"
NS = {a.split(":")[0]: int(a.split(":")[1]) for a in (os.environ.get("FN_N") or "underdog:6,fliff:6,prizepicks:6,sleeper:5,betr:4").split(",")}


def ni(x):
    return -9 if x != x else int(x)


def order(S):
    return sorted(S, key=lambda s: (s["k"], -s["J"]))


def load():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    df = pd.read_sql("SELECT app, tier, side, rk, layer, gcap, pdif, altcap, start, nsl, st, k, gone_base, gone_sub, gone_shrink, days FROM nba_score.ua3 WHERE tag LIKE '%-n'", conn)
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
        S.append(dict(app=r.app, layer=r.layer, k=int(r.k), st=r.st, tier=r.tier, side=r.side, rk=r.rk, gcap=ni(r.gcap), pdif=ni(r.pdif), altcap=ni(r.altcap), start=ni(r.start), nsl=r.nsl,
                      label=f"{'P' if r.st == 'power' else 'F'}{int(r.k)} {r.tier} {r.side} {r.rk} #{int(r.start)} x{r.nsl}", day=day, m=m, gb=r.gone_base, gs=r.gone_sub, gh=r.gone_shrink))
    if os.environ.get("FN_LIVE") == "1":
        LIVE = {"ph", "pb", "blend", "fhp", "geo", "avg", "pb_ret", "ph_ret", "ret_blend", "bline_d", "score"}
        def live_ok(s):
            if s["app"] == "betr":
                return True
            if s["side"] != "Under" or s["tier"] != "regular":
                return False
            comps = s["rk"].split(":")[-1].split("+")
            if "score" in comps and s["app"] != "prizepicks":
                return False
            return all(c in LIVE for c in comps)
        S = [s for s in S if live_ok(s)]
    return S


def ok_main(m):
    prior = [x for x in (m["r24"], m["r25"]) if x == x]
    return all(x > 0 for x in prior) and m["r26"] == m["r26"] and m["r26"] >= 0.25 and m["rlate"] == m["rlate"] and m["rlate"] > 0 and m["n26"] >= 10 and m["ls"] <= 0.62


def ok_fb(m):
    prior = [x for x in (m["r24"], m["r25"]) if x == x]
    return all(x > 0 for x in prior) and m["r26"] == m["r26"] and m["r26"] > 0 and m["rlate"] == m["rlate"] and m["rlate"] > 0 and m["n26"] >= 8 and m["ls"] <= 0.68


def pool_of(C, size):
    days = sorted({g for s in C for g in s["day"]}); pool = []
    for s in C:
        v = np.array([sum(p for p, _ in s["day"].get(g, [])) for g in days]); s["_v"] = v
        if any(np.std(v) > 0 and np.std(q["_v"]) > 0 and abs(np.corrcoef(v, q["_v"])[0, 1]) > RHO for q in pool):
            continue
        pool.append(s)
        if len(pool) >= size:
            break
    return pool


def build(pool, cap, N, base=None, maxn=8, need_small=True):
    cur = list(base or []); curJ = J(merge(order(cur), cap, N)) if cur else -9
    if need_small and not any(s["k"] <= 3 for s in cur):
        sm = [s for s in pool if s["k"] <= 3]
        best = max(sm, key=lambda s: J(merge([s], cap, N)), default=None)
        if best:
            cur.append(best); curJ = J(merge(order(cur), cap, N))
    while len(cur) < maxn:
        opt = None
        for s in pool:
            if s in cur:
                continue
            r = merge(order(cur + [s]), cap, N)
            if r and J(r) > curJ + 1e-9 and (opt is None or J(r) > opt[0]):
                opt = (J(r), s)
        if not opt:
            break
        curJ = opt[0]; cur.append(opt[1])
    return order(cur)


def main():
    S = load(); print(f"FN|strategies {len(S)}", flush=True)
    rows = []
    for a in ("underdog", "fliff", "prizepicks", "sleeper", "betr"):
        A = [s for s in S if s["app"] == a]
        for s in A:
            s["J"] = J(s["m"])
        M = sorted([s for s in A if ok_main(s["m"])], key=lambda s: -s["J"])
        pool = pool_of(M, 30)
        N = NS[a]
        print(f"\nFN|===== {a.upper()} (target {N} slips on a good day; {len(M)} worth-it, pool {len(pool)}) =====", flush=True)
        # slots sweep for the table
        for n_ in (3, 4, 5, 6):
            bb = None
            for cap in (1, 2, 3, 99):
                cur = build(pool, cap, n_); r = merge(cur, cap, n_)
                if r and (bb is None or J(r) > bb[0]):
                    bb = (J(r), cap, cur, r)
            print(f"FN|  slots {n_}: best cap {bb[1] if bb[1] < 99 else 'none'} | " + fmt(bb[3]), flush=True)
        best = None
        for cap in (1, 2, 3, 99):
            cur = build(pool, cap, N); r = merge(cur, cap, N)
            if r and (best is None or J(r) > best[0]):
                best = (J(r), cap, cur, r)
        _, cap, main_s, rm = best
        print(f"FN|  MAIN ({N} slots, player cap {cap if cap < 99 else 'none'}): " + fmt(rm), flush=True)
        for s in main_s:
            print(f"FN|    {s['label']} | " + fmt(s["m"]), flush=True)
        full = sum(1 for g, u, n in rm["dayu"] if n >= N)
        print(f"FN|    days with all {N} slots filled: {full}/{rm['days']}", flush=True)
        # fallback: only fills what main leaves empty
        F = sorted([s for s in A if ok_fb(s["m"]) and s not in main_s], key=lambda s: -s["J"])
        fp = pool_of(F, 30)
        fb = list(main_s); curJ = J(rm)
        add = []
        while len(add) < 4:
            opt = None
            for s in fp:
                if s in fb:
                    continue
                r = merge(fb + [s], cap, N)     # main first (already ordered), fallback after: fills leftover slots only
                if r and J(r) > curJ + 1e-9 and (opt is None or J(r) > opt[0]):
                    opt = (J(r), s)
            if not opt:
                break
            curJ = opt[0]; fb.append(opt[1]); add.append(opt[1])
        rf = merge(fb, cap, N)
        print(f"FN|  MAIN + FALLBACK: " + fmt(rf), flush=True)
        if add:
            nf = rf["slips"] - rm["slips"]
            print(f"FN|    fallback fills {nf} extra slips ({nf / max(1, rf['days']):.2f}/day)", flush=True)
            for s in add:
                print(f"FN|    FB {s['label']} | " + fmt(s["m"]), flush=True)
        for s in main_s:
            rows.append((a, "main", s))
        for s in add:
            rows.append((a, "fallback", s))
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute(f"DROP TABLE IF EXISTS nba_score.{FT}")
    conn.execute(f"CREATE TABLE nba_score.{FT} (app text, role text, layer text, tier text, side text, rk text, gcap int, pdif int, altcap int, start int, nsl text, st text, k int, label text)")
    for a, role, s in rows:
        conn.execute(f"INSERT INTO nba_score.{FT} VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                     (a, role, s["layer"], s["tier"], s["side"], s["rk"], s["gcap"], s["pdif"], s["altcap"], s["start"], str(s["nsl"]), s["st"], s["k"], s["label"]))
    conn.close()
    print(f"FN|wrote {len(rows)} signatures", flush=True)
    print("FN|DONE", flush=True)


if __name__ == "__main__":
    main()
