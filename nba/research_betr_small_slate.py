#!/usr/bin/env python3
"""
RESEARCH - BETR SMALL-SLATE FALLBACK ON A CREDIBLE LEG UNIVERSE (2026-10-29; owner 16:42 PT "Figure it out, why is not credible ... Make it be credible").
READ-ONLY.
WHY research_app_allegs' Betr history was not credible: it takes EVERY player / stat at the books' consensus main line, both sides, and ranks by final_hp. Betr's
flat table (Perfect 3 / 6 / 10 / 20 / 35) pays a near-certain leg exactly like a coin flip, so the ranking fills slips with final_hp .80-.90 legs that no app board
lists (history final_hp is honest per leg - audit_hist_leg_calibration - the legs just are not on the board). On Betr's real boards the same rules were -25% to -100%.
THIS RUN builds history only from legs that a real board lists:
  * the Underdog board's own legs (underdog_live legs, tier-qualified units UD-T1 .. UD-T123 as in research_betr_transfer, AND every Underdog board leg = UD-ALL),
    each at the line Underdog posts (a leg whose line is not the books' main line is DROPPED in history - same_line - so final_hp and the grade are for the same line),
  * 2026-27 = Betr's OWN archived board (BetrPricer: the leg's line open on Betr, books pricing that line),
  * only SMALL slates (games counted from the box score: <= 3 and <= 4), Betr flat table, Perfect and Dynamic, 2-6 picks.
GRID as research_betr_transfer plus game caps 1 / 2 / 3 / own. REPORT per bucket and structure: skip-0 rules by pooled lower bound (mean ROI - 1 se) over both history
seasons and this season's real Betr board, with coverage (slates with a slip / small slates seen) and per-season rows; the live B_T23_4dyn on the same slates for reference.
Env: DATABASE_URL, BS_TOP (6), BS_MINN (25 pooled slips), BS_COV (0.85).
"""
import itertools
import math
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["ST_APP"] = "betr"
import research_betr_transfer as RB                  # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402

RB.GCS = ("own", 1, 2, 3)
BUCKETS = (("s3", 3), ("s4", 4), ("big", 99))     # big = >= 6 games (the normal days the rule is SELECTED on)
TOP = int(os.environ.get("BS_TOP") or 6)
MINN = int(os.environ.get("BS_MINN") or 25)
COV = float(os.environ.get("BS_COV") or 0.85)
SEASONS = RB.SEASONS


class Dispatch:
    def __init__(self):
        self.book = {b: RB.Book() for b, _ in BUCKETS}
        self.slates = {b: [set(), set(), set()] for b, _ in BUCKETS}

    def day(self, season, d, src, qualified, gc_own, pricer):
        teams = {v["team"] for v in pricer.bx.values() if v.get("team") is not None}
        ng = math.ceil(len(teams) / 2)
        si = SEASONS.index(season)
        orig = pricer.leg

        def leg(q):
            x = orig(q)
            return x if x is not None and x.get("same_line") else None

        pricer.leg = leg
        try:
            for b, mx in BUCKETS:
                if (b == "big" and ng >= 6) or (b != "big" and ng <= mx):
                    self.slates[b][si].add(d)
                    self.book[b].day(season, d, src, qualified, gc_own, pricer)
        finally:
            pricer.leg = orig


def run(conn, days, pricer_cls, dp):
    for i, d in enumerate(days):
        st = ST.AF.box(conn, d)
        if not st:
            continue
        legs, rows = ST.AF.load_ud(conn, d, st)
        if not legs:
            continue
        pr = pricer_cls(conn, d)
        s = ST.AF.season_of(d)
        for uid, (c, gc) in ST.ud_lists(rows, legs).items():
            dp.day(s, d, "UD-" + uid, c, gc, pr)
        allc = sorted([l for l in legs if l.get("p") is not None], key=lambda l: -l["p"])
        dp.day(s, d, "UD-ALL", allc, 2, pr)
        if i % 40 == 39:
            conn.close(); conn = ST.connect()
        if i % 30 == 0:
            ST.log(f"slate {i + 1}/{len(days)} {d}")
    return conn


def report(dp):
    for b, mx in BUCKETS:
        A = dp.book[b].acc.d
        ns_ = [len(dp.slates[b][i]) for i in range(3)]
        print("=" * 170 + f"\nBETR credible universe | slates with <= {mx} games seen: " + ", ".join(f"{s} {n}" for s, n in zip(SEASONS, ns_)) + f" | rules {len(A)}")
        for k in RB.KS:
            for stc in ("perfect", "dynamic"):
                if stc == "dynamic" and k < 3:
                    continue
                rows = []
                for q, a in A.items():
                    if q[7] != k or q[8] != stc or q[4] != 0:
                        continue
                    n = sum(a[i][0] for i in range(3))
                    if n < MINN:
                        continue
                    S1 = sum(a[i][1] for i in range(3)); S2 = sum(a[i][2] for i in range(3))
                    mean = S1 / n; var = max(S2 / n - mean * mean, 0.0)
                    cov = n / (q[6] * max(sum(ns_), 1))
                    if mean <= 0 or cov < COV:
                        continue
                    rows.append((mean - math.sqrt(var / n), mean, n, cov, q, a))
                rows.sort(key=lambda t: -t[0])
                print(f"\n== {k}-pick {stc.upper()}: {len(rows)} skip-0 rules positive pooled, coverage >= {COV:.0%}, >= {MINN} slips; top {TOP} by lower bound (mean - 1 se)")
                seen = set()
                shown = 0
                for lb, mean, n, cov, q, a in rows:
                    sig = tuple(round(a[i][1], 2) for i in range(3))
                    if sig in seen:
                        continue
                    seen.add(sig); shown += 1
                    src, how, fl, side, sk, g, ns, kk, st_ = q
                    per = " | ".join(f"{SEASONS[i]} {int(a[i][0])} {100 * a[i][1] / a[i][0] if a[i][0] else 0:+.0f}% (cash {100 * a[i][3] / a[i][0] if a[i][0] else 0:.0f}%)" for i in range(3))
                    print(f"    {src:<7} order={how:<5} p>={fl:.2f} side={side:<5} games<={g:<3} slips/slate={ns} | pooled {int(n)} slips {100 * mean:+.1f}% (lb {100 * lb:+.1f}%) cov {100 * cov:.0f}% | {per}")
                    if shown >= TOP:
                        break
        q = RB.LIVE_RULE
        if q in A:
            a = A[q]
            print("  LIVE B_T23_4dyn on these slates: " + " | ".join(f"{SEASONS[i]} {int(a[i][0])} slips {100 * a[i][1] / a[i][0] if a[i][0] else 0:+.0f}%" for i in range(3)))


def main():
    conn = ST.connect()
    dp = Dispatch()
    import datetime as dt
    today = dt.datetime.now(ST.AF.UDL.PT).date()
    cur = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) == "2026-27" and d < today and
           conn.execute("SELECT 1 FROM nba_market.board_snapshots WHERE bookmaker='betr' AND game_date=%s LIMIT 1", (d,)).fetchone()]
    ST.log(f"this season's slates with a Betr board: {[str(d) for d in cur]}")
    days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
    conn = run(conn, days, ST.HistPricer, dp)
    conn = run(conn, cur, RB.BetrPricer, dp)
    report(dp)
    print("\ndone")
    ST.log("done")


if __name__ == "__main__":
    main()
