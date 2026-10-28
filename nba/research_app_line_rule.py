#!/usr/bin/env python3
"""
RESEARCH - SLEEPER / FLIFF: THE APP'S LINE vs THE LINE WE SCORED (2026-10-28; owner 13:59-14:02 PT: a Sleeper leg "super off from
what is available ... if there is a bug, fix for the future"). READ-ONLY.

The live Sleeper (S_T1_2max, S_T1_3flex) and Fliff (F_T1_2max) slips take Underdog T1's qualified legs, ranked by final_hp AT
UNDERDOG'S LINE, and play them at the app's own main line - exactly as research_sleeper_transfer / research_sleeper_small measured
them. When the app's line is HARDER than Underdog's (Over: app line above; Under: app line below) the model's chance is overstated
(10-28: NAW Pts+Asts Over - UD 21.5 59.1%, Sleeper 22.5 52.8%; Garland Pts+Rebs Under - UD 28.5 62.1%, Fliff 26.5 53.1%).
VARIANTS (the same compositions as live: UD-T1, order final_hp, Sleeper no floor / Fliff floor .56, multiplier <= 1.85, skip 1,
one slip a slate, one leg a game):
  all       as live
  same      only legs whose app line = Underdog's line
  noharder  drop legs whose app line is harder than Underdog's (equal or easier kept)
  harder1   drop legs harder by more than 1 point
LEGS: every qualified leg at the app's line, split same / easier / harder: hit rate, mean multiplier, return per leg (hit x m - 1).
REPORT per variant and structure: slips, ROI, ROI per season, cashed, max drawdown (1u flat).
Env: DATABASE_URL, ST_APP (sleeper | fliff), ST_PART (hist_ud | live), ST_SMOKE.
"""
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "sleeper")
import research_sleeper_transfer as ST              # noqa: E402

VARIANTS = ("all", "same", "noharder", "harder1")
FLOOR = 0.56 if ST.APP == "fliff" else 0.0
STRUCTS = (("max", 2),) if ST.APP == "fliff" else (("max", 2), ("flex", 3))


def diff(l):
    """how much harder the app's line is than Underdog's (> 0 harder, < 0 easier)"""
    d = l["line"] - l["ud_line"]
    return d if l["side"] == "Over" else -d


def keep(l, v):
    if v == "all":
        return True
    if v == "same":
        return l["line"] == l["ud_line"]
    if v == "noharder":
        return diff(l) <= 0
    return diff(l) <= 1.0


class Book:
    def __init__(self):
        self.slips = defaultdict(list)       # (variant, structure, k) -> [(season, day, pay)]
        self.legs = defaultdict(list)        # (season, kind) -> [(hit, m)]

    def day(self, season, d, src, qualified, gc, pricer):
        if src != "UD-T1":
            return
        sl, seen = [], set()
        for q in qualified:
            x = pricer.leg(q)
            if x is None:
                continue
            key = (x["pid"], x["prop"], x["side"])
            if key in seen:
                continue
            seen.add(key)
            x["ud_line"] = float(q["line"])
            sl.append(x)
            if x["hit"] is not None:
                dd = diff(x)
                self.legs[(season, "same" if dd == 0 else "easier" if dd < 0 else "harder")].append((x["hit"], x["m"]))
        for v in VARIANTS:
            c = [l for l in sorted(sl, key=lambda x: -x["p"]) if l["p"] >= FLOOR and l["m"] <= 1.85 and keep(l, v)][1:]
            for st, k in STRUCTS:
                s = ST.pick(c, k, gc)
                if s is None:
                    continue
                if ST.APP == "fliff":
                    live = [l for l in s if l["hit"] is not None]
                    pay = 1.0 if len(live) < 2 else (float(np.prod([l["m"] for l in live])) if all(l["hit"] for l in live) else 0.0)
                elif st == "max":
                    pay = ST.pay_max(s, ST.BONUS_TRUE)
                else:
                    pay = ST.pay_flex_ev(s)
                self.slips[(v, st, k)].append((season, d, pay))

    def report(self):
        print("=" * 150)
        print(f"APP {ST.APP} | PART {ST.PART}")
        print("\nLEGS at the app's line (Underdog T1 qualified, the app's main line) - hit, mean multiplier, return per leg:")
        for season in sorted({k[0] for k in self.legs}):
            for kind in ("same", "easier", "harder"):
                a = self.legs.get((season, kind)) or []
                if not a:
                    continue
                h = np.array([x[0] for x in a], float); m = np.array([x[1] for x in a], float)
                print(f"  {season} {kind:<7} {len(a):6d} legs | hit {h.mean():.3f} | mean m {m.mean():.3f} | return {100 * (h * m - 1).mean():+.1f}%")
        print("\nSLIPS (one a slate, the live composition):")
        for st, k in STRUCTS:
            for v in VARIANTS:
                a = self.slips.get((v, st, k)) or []
                if not a:
                    print(f"  {k}-pick {st:<4} {v:<9} no slips"); continue
                pays = np.array([x[2] for x in a])
                c = np.cumsum(pays - 1)
                dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))
                seas = " | ".join(f"{s} {len(b)} {100 * (np.mean(b) - 1):+.1f}%" for s in sorted({x[0] for x in a})
                                  for b in [[x[2] for x in a if x[0] == s]])
                print(f"  {k}-pick {st:<4} {v:<9} {len(a):5d} slips | ROI {100 * (pays.mean() - 1):+6.1f}% | {seas} | cashed "
                      f"{100 * np.mean(pays > 1):.0f}% | profit {np.sum(pays - 1):+.1f}u | max dd {dd:.1f}u")


def main():
    conn = ST.connect()
    bk = Book()
    if ST.PART == "hist_ud":
        days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
        ST.run_ud(conn, days[::8] if ST.SMOKE else days, ST.HistPricer, bk)
    else:
        import datetime as dt
        today = dt.datetime.now(ST.AF.UDL.PT).date()
        days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) == "2026-27" and dt.date(2026, 10, 20) <= d < today]
        ST.run_ud(conn, days, ST.LivePricer if ST.APP == "sleeper" else ST.LiveFliffPricer, bk)
    bk.report()
    print("done", flush=True)


if __name__ == "__main__":
    main()
