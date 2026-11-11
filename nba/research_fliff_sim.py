#!/usr/bin/env python3
"""RESEARCH (2026-11-11, owner: 'simulate whatever you need'). READ-ONLY. Proof + season simulation for the Fliff rules on Underdog T1 legs:
history at K_F 1.0971, this season Fliff's real Pick'Em board. Per season: slips, ROI, cash, profit, max dd, losing days, worst day, losing-day streak,
longest run of slips without a cash; then a block-bootstrap season simulation (150 slates, 5-day blocks, 3000 seasons) per rule."""
import datetime as dt
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["FT_PART"] = "ud"
import research_fliff_transfer as FT          # noqa: E402

ST = FT.ST
WANT = [("UD-T1", "pm", 0.0, "Under", 99.0, 0, 2, 3), ("UD-T1", "pm", 0.0, "Under", 99.0, 0, 1, 3),
        ("UD-T1", "fav", 0.56, "any", 99.0, 0, 2, 2), ("UD-T1", "p", 0.56, "any", 1.85, 1, 1, 2),
        ("UD-T1", "src", 0.56, "Under", 1.85, 0, 1, 2), ("UD-T1", "p", 0.0, "any", 99.0, 0, 1, 5),
        ("UD-T1", "p", 0.0, "any", 99.0, 0, 1, 6), ("UD-T1", "pm", 0.0, "Under", 99.0, 0, 2, 4)]
SEAS = ("2024-25", "2025-26", "2026-27")


def stats(rows):
    byday = defaultdict(list)
    for d, p in rows:
        byday[d].append(p - 1)
    ds = [sum(byday[d]) for d in sorted(byday)]
    flat = [p - 1 for _d, p in rows]
    c = np.cumsum(ds)
    dd = float(np.max(np.maximum.accumulate(np.r_[0, c]) - np.r_[0, c]))
    st = b = 0
    for v in ds:
        st = st + 1 if v < 0 else 0
        b = max(b, st)
    run = rb = 0
    for x in flat:
        run = run + 1 if x <= 0 else 0
        rb = max(rb, run)
    return len(flat), float(np.mean(flat)), float(np.mean([x > 0 for x in flat])), float(sum(flat)), dd, float(np.mean([s < 0 for s in ds])), float(min(ds)), b, rb, ds


def main():
    conn = ST.connect()
    bk = FT.Book()
    today = dt.datetime.now(ST.AF.UDL.PT).date()
    cur = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) == "2026-27" and dt.date(2026, 10, 20) <= d < today]
    early = [d for d in cur if d < dt.date(2026, 10, 26)]
    pick = [d for d in cur if d >= dt.date(2026, 10, 26)]
    days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
    conn = ST.run_ud(conn, days, ST.HistPricer, bk)
    conn = ST.run_ud(conn, early, ST.LiveFliffPricer, bk)
    conn = ST.run_ud(conn, pick, FT.PickemPricer, bk)
    rng = np.random.default_rng(11)
    print("=" * 200)
    for key, v in sorted(bk.slips.items(), key=lambda kv: str(kv[0])):
        if key[:8] not in WANT or key[8] != "max":
            continue
        print(f"\nFLIFF {key[7]}p Max order={key[1]} p>={key[2]} side={key[3]} m<={key[4]:g} skip={key[5]} slips/slate={key[6]}")
        alld = []
        for s in SEAS:
            rows = [(x[1], x[2]) for x in v if x[0] == s]
            if not rows:
                print(f"   {s}: none")
                continue
            n, roi, cash, pr, dd, ld, w, stk, dry, ds = stats(rows)
            alld += ds
            print(f"   {s}: {n:4d} slips ROI {100 * roi:+6.1f}% cash {100 * cash:4.1f}% P/L {pr:+7.1f}u dd {dd:5.1f}u losing days {100 * ld:3.0f}% worst day {w:+5.1f}u losing-day streak {stk} slips-without-cash {dry}")
        if len(alld) > 30:
            a = np.array(alld)
            out = []
            for _ in range(3000):
                seq = []
                while len(seq) < 150:
                    i = rng.integers(0, len(a) - 5)
                    seq.extend(a[i:i + 5])
                cs = np.cumsum(seq[:150])
                out.append((cs[-1], float(np.max(np.maximum.accumulate(np.r_[0, cs]) - np.r_[0, cs]))))
            pr = np.array([o[0] for o in out]); dd = np.array([o[1] for o in out])
            print(f"   SIM 150 slates x 3000: profit p5 {np.percentile(pr, 5):+.1f}u median {np.median(pr):+.1f}u p95 {np.percentile(pr, 95):+.1f}u | dd median {np.median(dd):.1f}u p95 {np.percentile(dd, 95):.1f}u | P(loss) {100 * np.mean(pr < 0):.1f}%")


if __name__ == "__main__":
    main()
