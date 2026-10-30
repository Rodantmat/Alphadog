#!/usr/bin/env python3
"""
RESEARCH - WHAT DOES A REAL BETR LEG LOOK LIKE vs THE HISTORY'S LEGS? (2026-10-29; owner 16:42 PT "Make it be credible"). READ-ONLY.
The Betr flat table (Perfect 6 = 35x) is worth +EV only on legs that hit ~57%+. History gave +250-600% even on NORMAL days (and a median small-slate rule +64..+85%), so the
history legs must be far more lopsided (market chance pf high) than Betr's real legs. This prints, per pf bucket (the books' de-vigged chance AT THE LEG'S OWN LINE):
  A. Betr's real board (this season's Betr days, every main-market leg with a book price at Betr's line): legs, mean pf, mean final_hp, hit rate
  B. the history universe the Betr studies use (books' main line, both sides; hist_legs): same columns - and the UD board legs at the books' main line (same_line)
and then the share of each universe in pf >= .60 / >= .65. A real Betr board that is almost all pf .45-.58 while history is full of .60-.80 legs is the whole story.
Env: DATABASE_URL, BSH_STEP (every Nth history slate, 6).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["AA_APP"] = "betr"
os.environ["ST_APP"] = "betr"
import research_app_allegs as RA                     # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_hist as RSH                  # noqa: E402

B = ((0, .40), (.40, .45), (.45, .50), (.50, .55), (.55, .60), (.60, .65), (.65, .70), (.70, .80), (.80, 1.01))


def put(acc, tag, l):
    pf = l.get("pf")
    if pf is None or l.get("hit") is None or l.get("p") is None:
        return
    b = next(k for k, (lo, hi) in enumerate(B) if lo <= pf < hi)
    acc[(tag, b)].append((pf, float(l["p"]), 1.0 if l["hit"] else 0.0))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    step = int(os.environ.get("BSH_STEP") or 6)
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27" and conn.execute(
        "SELECT 1 FROM nba_market.board_snapshots WHERE bookmaker='betr' AND game_date=%s LIMIT 1", (d,)).fetchone()]
    hist = [d for d in days if AF.season_of(d) != "2026-27"][::step]
    ovr, kt = RSH.law(conn, [d for d in days if AF.season_of(d) == "2026-27"])
    acc = defaultdict(list)
    for d in live + hist:
        st = AF.box(conn, d)
        if not st:
            continue
        if d in live:
            for l in RA.live_legs(conn, d, st):
                put(acc, "A real Betr board", l)
        else:
            for l in RA.hist_legs(conn, d, st, ovr, kt, None):
                put(acc, "B history main line (both sides)", l)
    print("=" * 140)
    print("universe                          pf bucket   |  legs | mean pf | mean final_hp | HIT RATE | hit - pf")
    tot = defaultdict(int)
    hi = defaultdict(int)
    for key in sorted(acc):
        tag, b = key
        a = np.array(acc[key])
        tot[tag] += len(a)
        if B[b][0] >= .60:
            hi[tag] += len(a)
        print(f"{tag:<34}{B[b][0]:.2f}-{B[b][1]:.2f}  | {len(a):6d} | {a[:, 0].mean():.3f}   | {a[:, 1].mean():.3f}         | {a[:, 2].mean():.3f}    | {a[:, 2].mean() - a[:, 0].mean():+.3f}")
    for t in tot:
        print(f"{t}: {tot[t]} legs, share with pf >= .60: {100 * hi[t] / max(tot[t], 1):.1f}%")
    print("done")


if __name__ == "__main__":
    main()
