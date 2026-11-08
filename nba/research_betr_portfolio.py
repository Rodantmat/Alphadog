#!/usr/bin/env python3
"""RESEARCH (2026-11-08, owner 14:12 PT: "Adding the 5-pick and 6-pick dynamic, how it changes/improves ROI, drawdown, accumulated for the season"). READ-ONLY.
The live Betr rule (4-pick Dynamic, 2 slips a day) alone vs plus the 5-pick Dynamic vs plus the 6-pick Dynamic vs both, 1u per slip, on the Underdog-leg history
(research_betr_4dyn machinery, books' chance at Betr's lines). Per season and pooled: slips, slips a day, ROI, profit, max drawdown, cash rate, losing-day share, longest
losing-day streak (drought), worst day. Env: DATABASE_URL, ST_PART=hist_ud."""
import os, sys
from collections import defaultdict
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "betr")
import research_betr_4dyn as B                      # noqa: E402
ST = B.ST
# name: (K, source list, order, floor, side, skip, game cap, slips)
CFG = {"L4": (4, "UD-T123", "blend", 0.60, "mix", 0, 1, 2),
       "A5": (5, "UD-T12", "pf", 0.56, "mix", 2, "own", 2),
       "A6": (6, "UD-T23", "pf", 0.58, "mix", 1, 2, 1)}
REC = defaultdict(list)      # name -> [(season, date, pay)]


class PBook(ST.Book):
    def day(self, season, d, src, qualified, gc_own, pricer):
        sl, seen = [], set()
        for q in qualified:
            x = pricer.leg(q)
            if x is None:
                continue
            key = (x["pid"], x["prop"], x["side"])
            if key in seen:
                continue
            seen.add(key); sl.append(x)
        for name, (k, s_, how, fl, side, sk, g, ns) in CFG.items():
            if s_ != src:
                continue
            gc = gc_own if g == "own" else g
            c = [l for l in B.ordered(sl, how) if l["p"] >= fl and (side in ("any", "mix") or l["side"] == side)][sk:]
            used = set()
            for _ in range(ns):
                s = ST.pick([l for l in c if l["pid"] not in used], k, gc)
                if side == "mix":
                    s = B.mix_fix(s, [l for l in c if l["pid"] not in used], gc)
                if s is None:
                    break
                REC[name].append((season, d, ST.pay_betr(s, True)))
                used |= {l["pid"] for l in s}


def stat(rows):
    if not rows:
        return None
    byday = defaultdict(float); n = len(rows); pays = np.array([r[2] for r in rows])
    for _s, d, p in rows:
        byday[d] += p - 1
    ds = sorted(byday); dv = np.array([byday[d] for d in ds]); cum = np.cumsum(dv)
    dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
    streak = best = 0
    for v in dv:
        streak = streak + 1 if v < 0 else 0; best = max(best, streak)
    return dict(n=n, days=len(ds), spd=n / len(ds), roi=100 * (pays.mean() - 1), profit=float(cum[-1]), dd=dd, cash=100 * float(np.mean(pays > 0)),
                lose=100 * float(np.mean(dv < 0)), drought=best, worst=float(dv.min()))


def main():
    conn = ST.connect()
    days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
    ST.run_ud(conn, days[::8] if ST.SMOKE else days, ST.HistPricer, PBook())
    sets = {"LIVE 4-pick x2 only": ["L4"], "+ 5-pick Dynamic": ["L4", "A5"], "+ 6-pick Dynamic": ["L4", "A6"], "+ 5 and 6-pick": ["L4", "A5", "A6"],
            "5-pick alone": ["A5"], "6-pick alone": ["A6"]}
    seasons = sorted({r[0] for v in REC.values() for r in v})
    for title, names in sets.items():
        print("\n" + "=" * 150 + f"\n{title}")
        for sea in seasons + ["ALL"]:
            rows = [r for n in names for r in REC[n] if sea == "ALL" or r[0] == sea]
            s = stat(rows)
            if s:
                print(f"  {sea:<8} {s['n']:4d} slips on {s['days']:3d} days ({s['spd']:.1f}/day) | ROI {s['roi']:+6.1f}% | profit {s['profit']:+7.1f}u | max drawdown {s['dd']:5.1f}u | "
                      f"cashed {s['cash']:.0f}% | losing days {s['lose']:.0f}% | longest losing-day streak {s['drought']} | worst day {s['worst']:+.1f}u")
    # overlap: share of 5/6-pick slate days on which the live 4-pick rule also played
    d4 = {r[1] for r in REC["L4"]}
    for n in ("A5", "A6"):
        dn = {r[1] for r in REC[n]}
        print(f"\n{n}: plays on {len(dn)} days; {len(dn & d4)} of them also have a live 4-pick slip; new days it adds: {len(dn - d4)}")


if __name__ == "__main__":
    main()
