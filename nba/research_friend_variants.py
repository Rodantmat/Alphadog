#!/usr/bin/env python3
"""
FRIEND PAGE VARIANT BACKTEST (owner 2026-11-06): the friend's elected rule per app vs variations of the slip building (second / third slip
from different players, rank by p or by EV, one leg fewer / more, a looser game cap) and what adding them does to ROI, net and worst losing
stretch. READ-ONLY. One app per process: FR_APP = PP | UD | SLEEPER | FLIFF | BETR. Flat $1 a slip.
Seasons before 2026-10 use each app's MODELLED board except PrizePicks / Underdog (real boards): the live 2026-27 sample is printed apart.
"""
import os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE

APP = FE.FAPP
TM = APP != "UD"


def cand_gc(legs, rule):
    if APP == "PP":
        return FE.pp_cand(legs, rule)
    if APP == "UD":
        return FE.ranked(legs, rule), 1
    return FE.ranked(legs, rule), (2 if rule[3] == "gc2" else 1)


def mult(l):
    v = l.get("m")
    if v is None:
        v = l.get("factor")
    try:
        return float(v) if v is not None else 1.0
    except Exception:
        return 1.0


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    it = FE.pp_days(conn) if APP == "PP" else FE.app_days(conn)
    res = collections.defaultdict(lambda: collections.defaultdict(list))   # variant -> day -> [profit]
    seas = {}
    nd = 0
    for season, d, legs in it:
        nd += 1
        seas[d] = season
        if len(legs) < 3:
            continue
        H = FE.proxies(legs)
        for code, size, st, rule in FE.RULES:
            cand, gc = cand_gc(legs, rule)

            def mk(c, k, g, banned=frozenset()):
                return FE.build(c, k, g, H, banned, teams=TM)

            def put(name, s, stx=st):
                if not s:
                    return
                try:
                    m = float(FE.pay_of(s, stx))
                except Exception:
                    return
                res[name][d].append(m - 1.0)

            base = mk(cand, size, gc)
            put("A base", base)
            if base:
                b1 = frozenset(FE.pid(l) for l in base)
                s2 = mk(cand, size, gc, b1)
                put("B 2nd slip (other players)", s2)
                if s2:
                    s3 = mk(cand, size, gc, b1 | frozenset(FE.pid(l) for l in s2))
                    put("C 3rd slip (other players)", s3)
            cp = sorted(cand, key=lambda l: -l["p"])
            put("D rank by hit chance", mk(cp, size, gc))
            ev = sorted(cand, key=lambda l: -l["p"] * mult(l))
            put("E rank by EV", mk(ev, size, gc))
            put("F looser game cap", mk(cand, size, gc + 1))
            for k in (size - 1, size + 1):
                if k >= 2:
                    put(f"G {k}-pick same rule", mk(cand, k, gc))
        if nd % 40 == 0:
            print(f"[{APP}] {nd} slates", flush=True)
    conn.close()

    def stats(name, days, label):
        ds = sorted(days)
        n = sum(len(res[name][d]) for d in ds)
        if not n:
            return None
        flat = [x for d in ds for x in res[name][d]]
        net = sum(flat)
        cum = peak = dd = 0.0
        for d in ds:
            cum += sum(res[name][d])
            peak = max(peak, cum)
            dd = max(dd, peak - cum)
        win = sum(1 for x in flat if x > 0) / n
        return n, len(ds), net / n, net, dd, win

    def table(title, daysel):
        print("\n" + "=" * 100 + f"\n{APP} {title}\n" + "=" * 100)
        print(f"{'variant':34s} {'slips':>6s} {'days':>5s} {'ROI':>8s} {'net$':>8s} {'worst dd$':>10s} {'win%':>6s}")
        for name in sorted(res):
            r = stats(name, [d for d in res[name] if daysel(d)], title)
            if r:
                n, ds, roi, net, dd, win = r
                print(f"{name:34s} {n:6d} {ds:5d} {roi * 100:7.1f}% {net:8.1f} {dd:10.1f} {win * 100:5.1f}%")
        # combined portfolios: base + more slips the same day
        combos = {"A+B": ["A base", "B 2nd slip (other players)"],
                  "A+B+C": ["A base", "B 2nd slip (other players)", "C 3rd slip (other players)"],
                  "A+E": ["A base", "E rank by EV"], "A+D": ["A base", "D rank by hit chance"]}
        for cn, parts in combos.items():
            days = sorted({d for p in parts for d in res[p] if daysel(d)})
            flat, cum, peak, dd, n = [], 0.0, 0.0, 0.0, 0
            for d in days:
                day = [x for p in parts for x in res[p].get(d, [])]
                n += len(day); flat += day; cum += sum(day); peak = max(peak, cum); dd = max(dd, peak - cum)
            if n:
                print(f"{'PORTFOLIO ' + cn:34s} {n:6d} {len(days):5d} {sum(flat) / n * 100:7.1f}% {sum(flat):8.1f} {dd:10.1f} {sum(1 for x in flat if x > 0) / n * 100:5.1f}%")

    table("ALL SLATES (older seasons: modelled boards for Sleeper/Fliff/Betr)", lambda d: True)
    table("LIVE 2026-27 SEASON ONLY (real boards)", lambda d: seas.get(d) == "2026-27")


if __name__ == "__main__":
    main()
