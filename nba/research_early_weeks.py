#!/usr/bin/env python3
"""RESEARCH - EARLY-SEASON WEEKS vs THE LAST TWO SEASONS (2026-11-10, owner: "how these first weeks compare to the first week of the past two seasons ...
within expectation, over, under, and what can we learn for the upcoming weeks"). READ-ONLY. Live board, box-score grader (research_calib_audit.load).
Standard lines, week index = days since that season's first slate // 7 (week 0 = opening week). Per season x week x side (Over / Under / Both):
n, mean final_hp, hit, gap (hit - mean), calibration slope, top-25 a slate by final_hp hit, hit at final_hp >= .60 (n a slate), and the whole-season average beside it.
Also: the same for goblin / demon rungs pooled (hit - mean), and the slate counts. Weeks 0-12 are shown so the NEXT weeks of 24-25 / 25-26 say what usually follows.
Env: DATABASE_URL.
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_calib_audit as CA  # noqa: E402


def dd(d):
    return d if isinstance(d, dt.date) else dt.date.fromisoformat(str(d)[:10])


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slates = CA.load(conn)
    conn.close()
    first = {}
    for s, d, _ls in slates:
        first[s] = min(first.get(s, dd(d)), dd(d))
    by = defaultdict(list)    # (season, week) -> [(day, legs)]
    for s, d, ls in slates:
        by[(s, (dd(d) - first[s]).days // 7)].append((d, ls))
    print("\n" + "=" * 150)
    print("first slate: " + ", ".join(f"{s} {first[s]}" for s in CA.PERIODS))
    for sd in ("Both", "Over", "Under"):
        print(f"\nSTANDARD LINES, side {sd}: week | n | mean fh | hit | gap pts | cal-slope | top25/slate hit | fh>=.60 legs/slate : hit")
        for w in range(0, 13):
            parts = []
            for s in CA.PERIODS:
                sl = by.get((s, w), [])
                g = [l for _d, ls in sl for l in ls if l["k"] == "R" and l["hit"] is not None and (sd == "Both" or l["side"] == sd)]
                if len(g) < 200:
                    parts.append(f"{s}: n/a" + " " * 40)
                    continue
                x = np.array([l["fh"] for l in g]); y = np.array([l["hit"] for l in g], float)
                b = CA.fit(np.array([[CA.lg(v)] for v in x]), y)
                top = []
                for _d, ls in sl:
                    a = sorted([l for l in ls if l["k"] == "R" and l["hit"] is not None and (sd == "Both" or l["side"] == sd)], key=lambda l: -l["fh"])[:25]
                    top += [l["hit"] for l in a]
                hi = [l["hit"] for l in g if l["fh"] >= 0.60]
                parts.append(f"{s}: n{len(g):6,d} {x.mean():.3f} {y.mean():.3f} {100 * (y.mean() - x.mean()):+5.1f} sl {b[1]:5.2f} top25 {np.mean(top):.3f} 60+ {len(hi) / max(1, len(sl)):4.1f}:{np.mean(hi) if hi else float('nan'):.3f}")
            print(f"  wk {w:2d} | " + " | ".join(parts))
        parts = []
        for s in CA.PERIODS:
            g = [l for ss, _d, ls in slates if ss == s for l in ls if l["k"] == "R" and l["hit"] is not None and (sd == "Both" or l["side"] == sd)]
            if g:
                x = np.array([l["fh"] for l in g]); y = np.array([l["hit"] for l in g], float)
                b = CA.fit(np.array([[CA.lg(v)] for v in x]), y)
                parts.append(f"{s}: n{len(g):6,d} {x.mean():.3f} {y.mean():.3f} {100 * (y.mean() - x.mean()):+5.1f} sl {b[1]:5.2f}")
        print("  WHOLE SEASON | " + " | ".join(parts))
    print("\nGOBLIN / DEMON rungs pooled: week | gap pts (hit - mean fh) [n]")
    for w in range(0, 13):
        parts = []
        for s in CA.PERIODS:
            sl = by.get((s, w), [])
            out = []
            for kk in ("G", "D"):
                g = [l for _d, ls in sl for l in ls if l["k"] == kk and l["hit"] is not None]
                out.append(f"{kk} {100 * (np.mean([l['hit'] for l in g]) - np.mean([l['fh'] for l in g])):+5.1f}[{len(g)}]" if len(g) >= 200 else f"{kk} n/a")
            parts.append(f"{s}: " + " ".join(out))
        print(f"  wk {w:2d} | " + " | ".join(parts))
    CA.log("DONE")


if __name__ == "__main__":
    main()
