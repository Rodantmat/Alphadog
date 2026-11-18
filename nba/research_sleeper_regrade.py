#!/usr/bin/env python3
"""
SLEEPER FLEX RE-GRADE AUDIT (2026-11-18): the graded Sleeper Flex slips of nba_score.sleeper_live_slips were paid by the old fixed-ratio tiers (full hit read low, partial
hits high). This recomputes every graded Flex slip with the share model now in classification_config['sleeper_payout'].true_pricing.flex_share and prints the old and the
new profit by size. DRY unless REGRADE_APPLY=1 (then payout / profit are rewritten). Env: DATABASE_URL.
"""
import json
import os
from collections import defaultdict

import psycopg

import sleeper_live_slip_engine as SL


def main():
    apply = os.getenv("REGRADE_APPLY") == "1"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        pr = SL.pricing(conn)
        print(f"REGRADE|share model loaded for sizes {sorted(SL.FLEX_SHARE)}; apply={apply}")
        rows = conn.execute("""SELECT game_date, strategy, k, size, legs_json, stake, hits, payout, profit FROM nba_score.sleeper_live_slips
                               WHERE structure='flex' AND profit IS NOT NULL ORDER BY game_date, strategy, k""").fetchall()
        agg = defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0])
        for d, strat, k, size, lj, stake, hits, pay, prof in rows:
            legs = lj if isinstance(lj, list) else json.loads(lj)
            stake = float(stake or 1.0)
            new_mult = SL.payout(legs, "flex", pr)
            new_prof = round(stake * new_mult - stake, 4)
            a = agg[int(size)]
            a[0] += 1; a[1] += stake; a[2] += float(prof); a[3] += new_prof; a[4] += abs(new_prof - float(prof)) > 0.005
            if apply and abs(new_prof - float(prof)) > 0.00005:
                conn.execute("UPDATE nba_score.sleeper_live_slips SET payout=%s, profit=%s WHERE game_date=%s AND strategy=%s AND k=%s AND structure='flex'",
                             (round(stake * new_mult, 4), new_prof, d, strat, k))
        tot = [0, 0.0, 0.0, 0.0, 0]
        for size in sorted(agg):
            a = agg[size]
            for i in range(5):
                tot[i] += a[i]
            print(f"REGRADE|{size}-pick Flex: {a[0]} graded slips, staked {a[1]:.2f} | profit old {a[2]:+.2f} -> new {a[3]:+.2f} ({a[4]} slips change)")
        print(f"REGRADE|ALL Flex: {tot[0]} slips, staked {tot[1]:.2f} | profit old {tot[2]:+.2f} (ROI {100 * tot[2] / tot[1]:+.1f}%) -> new {tot[3]:+.2f} (ROI {100 * tot[3] / tot[1]:+.1f}%)")
        if apply:
            conn.commit()
            print("REGRADE|applied")


if __name__ == "__main__":
    main()
