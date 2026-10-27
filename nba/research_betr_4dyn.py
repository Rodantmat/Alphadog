#!/usr/bin/env python3
"""
RESEARCH - BETR 4-PICK DYNAMIC: VARIATIONS AROUND THE OWNER'S CHOICE (2026-10-26; owner 17:29 PT: "I'll go 4-pick dynamic (2 a day)
any variation that may give more ROI but stay as safe or even safer?"). READ-ONLY.

BASELINE (research_sleeper_small ST_APP=betr hist_ud, run 40409604019 / split run 40413828837): UD-T2 legs in their own order, 2 slips
a slate (different players), 4-pick Dynamic: +34.8% ROI, 216 slips, cashed 44%, max drawdown 12.5u, early/late 2024-25 +31 / +8,
2025-26 +73 / +47.

PRICING: Betr's own table, re-certified 2026-10-26 from Betr's pricing query (probe_betr_quote_direct): Dynamic 4 = 6x (4 hits) /
1.5x (3 hits), all-LESS 5.5 / 1.25; a void drops the pick to the smaller table (unverified), < 2 live picks or 1 team = refund
(ST.pay_betr). History prices Betr's line as the books' main line (Betr = Underdog's line on 84% of 2026-10-26's shared legs).

VARIATIONS (every combination; the owner's numbers are examples - the data decides):
  leg pool   UD-T1, UD-T2, UD-T3 and the unions T1+T2, T2+T3, T1+T2+T3 (each unit's own order, then the next unit's)
  order      src (pool order) | p (final_hp) | pf (the books' de-vigged chance at the line) | blend (mean of the two)
  floor      final_hp >= 0 / .54 / .56 / .58 / .60 / .62 / .64
  side       any | Over only | Under only | mix (any, but a slip that came out all-Under swaps its last leg for the best Over -
             Betr pays all-LESS entries less)
  skip       the top 0 / 1 / 2 / 3 legs skipped
  games      at most 1 or 2 legs per game (and the pool's own cap)
  slips/day  1 / 2 / 3 / 4 (different players across a slate's slips)
REPORT (two seasons split early Oct-Dec / late Jan on; >= 150 slips): every combination at least as SAFE as the baseline (max drawdown
<= 12.5u, cashed >= 44%, all four periods positive) ranked by ROI; then the best by ROI lower bound with any drawdown; then by
profit per unit of drawdown. Env: DATABASE_URL, ST_PART (hist_ud | hist_pp).
"""
import itertools
import os
import sys
from collections import defaultdict

import numpy as np

os.environ.setdefault("ST_APP", "betr")
os.environ.setdefault("ST_SPLIT", "half")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_sleeper_small as SS                 # noqa: E402
import research_sleeper_transfer as ST              # noqa: E402

K = 4
ORDERS = ("src", "p", "pf", "blend")      # Betr is flat-priced (m = 1): pm / fav collapse to p; pf = the books' chance, blend = mean
FLOORS = (0.0, 0.54, 0.56, 0.58, 0.60, 0.62, 0.64)
SIDES = ("any", "Over", "Under", "mix")
SKIPS = (0, 1, 2, 3)
GCS = ("own", 1, 2)
NSLIPS = (1, 2, 3, 4)
BASE = {"roi": 34.8, "dd": 12.5, "cash": 44.0}

_orig_lists = ST.ud_lists


def ud_lists_plus(rows, legs):
    """the three units plus their unions (each unit's own order, then the next unit's legs not yet listed)"""
    out = dict(_orig_lists(rows, legs))
    for name, parts in (("T12", ("T1", "T2")), ("T23", ("T2", "T3")), ("T123", ("T1", "T2", "T3"))):
        c, seen = [], set()
        for p in parts:
            for l in out[p][0]:
                key = (l.get("player_id") or l.get("player"), l["prop"], l["side"])
                if key not in seen:
                    seen.add(key); c.append(l)
        out[name] = (c, max(out[p][1] for p in parts))
    return out


ST.ud_lists = ud_lists_plus


def ordered(sl, how):
    if how == "src":
        return list(sl)
    if how == "p":
        return sorted(sl, key=lambda x: -x["p"])
    if how == "pf":
        return sorted(sl, key=lambda x: -x.get("pf", 0.5))
    return sorted(sl, key=lambda x: -(x["p"] + x.get("pf", 0.5)) / 2)


def mix_fix(s, c, gc):
    """an all-Under slip swaps its last leg for the best Over leg in the pool that fits (other player, game cap)"""
    if s is None or any(l["side"] != "Under" for l in s):
        return s
    used = {l["pid"] for l in s}
    games = defaultdict(int)
    for l in s[:-1]:
        games[l["game"]] += 1
    for l in c:
        if l["side"] == "Over" and l["pid"] not in used and games[l["game"]] < gc:
            out = s[:-1] + [l]
            return out if len({x["team"] for x in out}) >= 2 else s
    return s


class Book4(ST.Book):
    def day(self, season, d, src, qualified, gc_own, pricer):
        if os.environ.get("ST_SPLIT") == "half":
            season = f"{season}{'early' if d.month >= 10 else 'late'}"
        sl, seen = [], set()
        for q in qualified:
            x = pricer.leg(q)
            if x is None:
                continue
            key = (x["pid"], x["prop"], x["side"])
            if key in seen:
                continue
            seen.add(key)
            sl.append(x)
        for how, fl, side, sk, g in itertools.product(ORDERS, FLOORS, SIDES, SKIPS, GCS):
            gc = gc_own if g == "own" else g
            c = [l for l in ordered(sl, how) if l["p"] >= fl and (side in ("any", "mix") or l["side"] == side)][sk:]
            if len(c) < K:
                continue
            used, slips = set(), []
            for _ in range(max(NSLIPS)):
                s = ST.pick([l for l in c if l["pid"] not in used], K, gc)
                if side == "mix":
                    s = mix_fix(s, [l for l in c if l["pid"] not in used], gc)
                if s is None:
                    break
                slips.append(s)
                used |= {l["pid"] for l in s}
            for ns in NSLIPS:
                if len(slips) < ns:
                    break
                comp = (src, how, fl, side, sk, str(g), ns)
                for s in slips[:ns]:
                    self.slips[comp].append((season, d, ST.pay_betr(s, True)))

    def report(self):
        rows = []
        for key, v in self.slips.items():
            if len(v) < 150:
                continue
            pays = np.array([x[2] for x in v])
            seas = {}
            for sea in sorted({x[0] for x in v}):
                b = np.array([x[2] for x in v if x[0] == sea])
                seas[sea] = (len(b), 100 * (b.mean() - 1))
            c = np.cumsum(pays - 1)
            dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))
            roi = 100 * (pays.mean() - 1)
            se = 100 * pays.std(ddof=1) / np.sqrt(len(pays))
            rows.append(dict(key=key, n=len(pays), roi=roi, lb=roi - se, seas=seas, cash=100 * float(np.mean(pays > 0)), dd=dd,
                             profit=float(c[-1]), worst=min(x[1] for x in seas.values()), days=len({x[1] for x in v})))

        def fmt(r):
            src, how, fl, side, sk, g, ns = r["key"]
            return (f"{src:<7} order={how:<3} p>={fl:.2f} side={side:<5} skip={sk} games<={g:<3} slips/day={ns} | {r['n']:4d} slips "
                    f"{r['days']:3d} slates | ROI {r['roi']:+6.1f}% (lb {r['lb']:+6.1f}) | profit {r['profit']:+6.1f}u | max dd {r['dd']:5.1f}u "
                    f"| profit/dd {r['profit'] / max(r['dd'], 1):4.1f} | cashed {r['cash']:.0f}% | " +
                    " | ".join(f"{s} {n} {x:+.0f}%" for s, (n, x) in r["seas"].items()))

        print("=" * 180)
        print(f"BETR 4-PICK DYNAMIC VARIATIONS | PART {ST.PART} | combinations with >= 150 slips: {len(rows)}")
        base = [r for r in rows if r["key"][:7] == ("UD-T2", "src", 0.0, "any", 0, "own", 2)]
        for r in base:
            print("BASELINE  " + fmt(r))
        safe = [r for r in rows if r["dd"] <= BASE["dd"] and r["cash"] >= BASE["cash"] and r["worst"] > 0]
        print(f"\n== AS SAFE OR SAFER than the baseline (dd <= {BASE['dd']}u, cashed >= {BASE['cash']:.0f}%, every period positive): "
              f"{len(safe)} - top 40 by ROI")
        seen = set()
        shown = 0
        for r in sorted(safe, key=lambda r: (-r["roi"], r["dd"])):
            sig = (round(r["roi"], 1), round(r["dd"], 1), r["n"])
            if sig in seen:
                continue                       # identical results (filters that do not bind) shown once
            seen.add(sig); shown += 1
            print("   " + fmt(r))
            if shown >= 40:
                break
        good = [r for r in rows if r["worst"] > 0]
        for title, keyf in (("BY ROI LOWER BOUND (every period positive, any drawdown)", lambda r: -r["lb"]),
                            ("BY PROFIT PER UNIT OF DRAWDOWN (every period positive)", lambda r: -r["profit"] / max(r["dd"], 1))):
            print(f"\n== {title} - top 25")
            seen, shown = set(), 0
            for r in sorted(good, key=keyf):
                sig = (round(r["roi"], 1), round(r["dd"], 1), r["n"])
                if sig in seen:
                    continue
                seen.add(sig); shown += 1
                print("   " + fmt(r))
                if shown >= 25:
                    break


def main():
    conn = ST.connect()
    bk = Book4()
    ST.log(f"betr 4-pick dynamic variations, part {ST.PART}")
    if ST.PART == "hist_pp":
        ST.run_pp_hist(conn, bk)
    else:
        days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
        ST.run_ud(conn, days[::8] if ST.SMOKE else days, ST.HistPricer, bk)
    bk.report()
    ST.log("done")


if __name__ == "__main__":
    main()
