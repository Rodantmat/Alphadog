#!/usr/bin/env python3
"""
RESEARCH - SLEEPER: SMALLER, STEADIER SLIPS (2026-10-26; owner 11:49 PT "Nothing smaller safer? 2 pick or 3/4 pick flex in different
composition or strategies?"). READ-ONLY. Same legs and the same Sleeper pricing as research_sleeper_transfer ('max-true' /
'flex-true': Max bonus 1.0 / 1.0797 / 1.101 / 1.174 / 1.276, Flex EV-matched at q = 1/m - from 454 of the owner's own entries).
COMPOSITIONS, per source list (UD-T1/T2/T3 or PP-B*), each slate:
  order  src (the source's own) | p (highest model hit chance first) | pm (p x Sleeper multiplier) | fav (lowest multiplier first)
  floor  model p >= 0 / .56 / .58 / .60 / .62
  side   any | Over only | Under only
  mcap   multiplier <= 99 / 1.85 / 1.78
  skip   0 / 1 leading legs
  slips  1 / 2 / 3 per slate (disjoint players, the source's game cap inside each slip)
  sizes  2..6 picks, Max and Flex (Flex 3+)
REPORT per composition: slips, ROI, ROI per season, cashed %, max drawdown (units, flat 1u per slip), losing-slate share, and
a lower bound ROI - 1 standard error. Ranked by that lower bound among compositions positive in every season with >= 150 slips
(history) - the steady ones first. ST_PART=live prints every composition with >= 5 slips (this season, Sleeper's real board).
Env: DATABASE_URL, ST_APP=sleeper, ST_PART (hist_ud | hist_pp | live), ST_SMOKE.
"""
import itertools
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "sleeper")
import research_sleeper_transfer as ST              # noqa: E402

if os.environ.get("FL_OVR"):                         # Fliff margin sensitivity (Pick'Em feed 2026-10-26: 1/1.85 + 1/1.80 = 1.096)
    ST.OVR_F = float(os.environ["FL_OVR"])

ORDERS = ("src", "p", "pm", "fav")
FLOORS = (0.0, 0.56, 0.58, 0.60, 0.62)
SIDES = ("any", "Over", "Under")
MCAPS = (99.0, 1.85, 1.78)
SKIPS = (0, 1)
NSLIPS = (1, 2, 3)


def ordered(sl, how):
    if how == "src":
        return list(sl)
    if how == "p":
        return sorted(sl, key=lambda x: -x["p"])
    if how == "pm":
        return sorted(sl, key=lambda x: -x["p"] * x["m"])
    return sorted(sl, key=lambda x: (x["m"], -x["p"]))


def several(c, k, gc, n):
    out, used = [], set()
    for _ in range(n):
        s = ST.pick([l for l in c if l["pid"] not in used], k, gc)
        if s is None:
            break
        out.append(s)
        used |= {l["pid"] for l in s}
    return out


class SmallBook(ST.Book):
    def day(self, season, d, src, qualified, gc, pricer):
        if os.environ.get("ST_SPLIT") == "half":         # owner 2026-10-26: how each setup holds early (Oct-Dec) vs late (Jan on) in a season
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
        for how, fl, side, mc, sk in itertools.product(ORDERS, FLOORS, SIDES, MCAPS, SKIPS):
            c = [l for l in ordered(sl, how) if l["p"] >= fl and l["m"] <= mc and (side == "any" or l["side"] == side)][sk:]
            if len(c) < 2:
                continue
            for k in ST.KS:
                for ns in NSLIPS:
                    ss = several(c, k, gc, ns)
                    if len(ss) < ns:
                        continue
                    comp = (src, how, fl, side, mc, sk, ns, k)
                    for s in ss:
                        if ST.APP == "betr":
                            # BETR (research only - parked): its flat table (pp_slip_rules betr_payout_v1, Betr's own pricing query):
                            # Perfect 2-6 = 3 / 6 / 10 / 20 / 35, Dynamic (3+) by hits; history prices Betr's line as the books' main line
                            self.slips[comp + ("max",)].append((season, d, ST.pay_betr(s, False)))
                            if k >= 3:
                                self.slips[comp + ("flex",)].append((season, d, ST.pay_betr(s, True)))
                            continue
                        if ST.APP == "fliff":
                            # FLIFF PICK'EM (official rules v2.0, 2026-10-05, getfliff.com/fliff-pickem-contest-rules): Max pays the
                            # product of the picks' multipliers (the guaranteed Contest Score; any extra pool share is NOT counted);
                            # a void drops the pick, < 2 live picks = refund. Flex reduction unpublished - not priced.
                            live = [l for l in s if l["hit"] is not None]
                            pay = 1.0 if len(live) < 2 else (float(np.prod([l["m"] for l in live])) if all(l["hit"] for l in live) else 0.0)
                            self.slips[comp + ("max",)].append((season, d, pay))
                            continue
                        self.slips[comp + ("max",)].append((season, d, ST.pay_max(s, ST.BONUS_TRUE)))
                        if k >= 3:
                            self.slips[comp + ("flex",)].append((season, d, ST.pay_flex_ev(s)))

    def report(self):
        rows = []
        for key, v in self.slips.items():
            pays = np.array([x[2] for x in v])
            if len(pays) < min(5, int(os.environ.get("ST_MIN") or 5)):
                continue
            seas = {}
            for sea in sorted({x[0] for x in v}):
                b = np.array([x[2] for x in v if x[0] == sea])
                seas[sea] = (len(b), 100 * (b.mean() - 1))
            c = np.cumsum(pays - 1)
            dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))
            byday = defaultdict(float)
            for x in v:
                byday[x[1]] += x[2] - 1
            lose_days = 100 * float(np.mean([y < 0 for y in byday.values()]))
            roi = 100 * (pays.mean() - 1)
            se = 100 * pays.std(ddof=1) / np.sqrt(len(pays)) if len(pays) > 1 else 99.0
            rows.append(dict(key=key, n=len(pays), roi=roi, lb=roi - se, seas=seas, cash=100 * float(np.mean(pays > 0)), dd=dd,
                             ld=lose_days, days=len(byday)))

        def fmt(r):
            src, how, fl, side, mc, sk, ns, k, st = r["key"]
            return (f"{src:<6} {st:<4} {k}p order={how:<3} p>={fl:.2f} side={side:<5} m<={mc:<5} skip={sk} slips/day={ns} | "
                    f"{r['n']:5d} slips {r['days']:4d} slates | ROI {r['roi']:+6.1f}% (lb {r['lb']:+6.1f}) | " +
                    " | ".join(f"{s} {n} {x:+.0f}%" for s, (n, x) in r["seas"].items()) +
                    f" | cashed {r['cash']:.0f}% | max dd {r['dd']:.1f}u | losing slates {r['ld']:.0f}%")

        live = ST.PART == "live"
        mn = int(os.environ.get("ST_MIN") or 5) if live else 150
        print("=" * 170)
        print(f"SLEEPER SMALL/STEADY | PART {ST.PART} | compositions {len(rows)}")
        for k in ST.KS:
            for st in ("max", "flex"):
                pool = [r for r in rows if r["key"][7] == k and r["key"][8] == st and r["n"] >= mn]
                if not pool:
                    continue
                good = [r for r in pool if all(x[1] > 0 for x in r["seas"].values())]
                print(f"\n== {k}-pick {st.upper()}: {len(pool)} compositions with >= {mn} slips, {len(good)} positive in every season"
                      f" | ROI median {np.median([r['roi'] for r in pool]):+.1f}%, share positive {100 * np.mean([r['roi'] > 0 for r in pool]):.0f}%")
                for r in sorted(good if not live else pool, key=lambda r: -r["lb"])[:12 if not live else (9999 if os.environ.get("ST_ALL") else 25)]:
                    print("   " + fmt(r))
                # the plain baseline: each source's own order, no filter, 1 slip a slate
                for r in sorted([r for r in pool if r["key"][1:7] == ("src", 0.0, "any", 99.0, 0, 1)], key=lambda r: r["key"][0]):
                    print("   BASE " + fmt(r))
        # the steadiest overall: highest lower bound with cashed >= 40%
        steady = [r for r in rows if r["n"] >= mn and r["cash"] >= 40 and all(x[1] > 0 for x in r["seas"].values())]
        print(f"\nSTEADY (cashed >= 40%, positive every season, >= {mn} slips): {len(steady)} - top 30 by ROI lower bound")
        for r in sorted(steady, key=lambda r: -r["lb"])[:30]:
            print("   " + fmt(r))


def main():
    conn = ST.connect()
    bk = SmallBook()
    ST.log(f"small/steady part {ST.PART}")
    if ST.PART == "hist_ud":
        days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
        conn = ST.run_ud(conn, days[::8] if ST.SMOKE else days, ST.HistPricer, bk)
    elif ST.PART == "hist_pp":
        conn = ST.run_pp_hist(conn, bk)
    else:
        import datetime as dt
        today = dt.datetime.now(ST.AF.UDL.PT).date()
        days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) == "2026-27" and dt.date(2026, 10, 20) <= d < today]
        # Betr has no live board (parked): its flat table only needs the line, so it is priced at the books' main line as in history
        P = ST.LivePricer if ST.APP == "sleeper" else (ST.HistPricer if ST.APP == "betr" else ST.LiveFliffPricer)
        conn = ST.run_ud(conn, days, P, bk)
        ST.run_pp_live(conn, days, bk, P)
    bk.report()
    ST.log("done")


if __name__ == "__main__":
    main()
