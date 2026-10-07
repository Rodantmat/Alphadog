#!/usr/bin/env python3
"""
PRIZEPICKS BREAK-EVEN CROSS-CHECK (strategy doc §31p) - read-only. The production PrizePicks monitor computes break-even with
the exact INDEPENDENCE expectation (§31k; sanity gap 4 pts). Underdog needed correlation-preserving THINNING (§31o; gap 24 pts).
This runs the thinning method on the PrizePicks daily portfolio with the engine's own grade() and compares:
  - ROI at shift 0 must equal the actual backtest ROI exactly (thinning keeps every real outcome)
  - break-even delta* by thinning vs by independence, per season and both
Decision rule written BEFORE the run: if the two differ by more than 1.0 pp at the portfolio level, the production monitor switches
to a thinning-based delta*; otherwise the independence value stands.
Env: DATABASE_URL, EM_THIN_REPS (default 60).
"""
import math
import os
import random
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edge_monitor_research as R  # noqa: E402
ENG = R.ENG
REPS = int(os.environ.get('EM_THIN_REPS', '60'))


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    slips = R.load(conn)
    season_of = {}
    for (d, s) in conn.execute("SELECT DISTINCT game_date, season FROM nba_score.slip_engine_slips").fetchall():
        season_of[d] = s
    agg = defaultdict(lambda: [0, 0])
    for *_r, legs in slips:
        for key, f, h in legs:
            if h is None:
                continue   # tied whole-number leg: void, not an outcome
            agg[key][0] += h; agg[key][1] += 1
    p_of = {k: min(max(a / n, 0.02), 0.98) for k, (a, n) in agg.items()}

    def roi_thin(ss, shift, reps=REPS):
        keep = {k: R.expit(R.logit(p) + shift) / p for k, p in p_of.items()}
        rng = random.Random(99); tot = st = 0.0
        for _ in range(reps):
            for name, d, structure, k, stake, profit, legs in ss:
                _, pay = ENG.grade([{'hit': None if h is None else (1 if (h and rng.random() < keep[key]) else 0), 'factor': f}
                                    for key, f, h in legs], structure)   # a tie stays a tie (void, lineup reverts)
                tot += stake * pay; st += stake
        return tot / st - 1

    def solve(fn, ss):
        lo, hi = -3.0, 0.0
        if fn(ss, lo) > 0 or fn(ss, hi) < 0:
            return None
        for _ in range(22):
            mid = (lo + hi) / 2
            if fn(ss, mid) > 0:
                hi = mid
            else:
                lo = mid
        return (lo + hi) / 2

    print(f"PRIZEPICKS BREAK-EVEN CROSS-CHECK - {len(slips):,} slips of {len(R.DAILY)} daily strategies, {REPS} thinning replicates", flush=True)
    for label, ss in (('2024-25', [s for s in slips if season_of.get(s[1]) == '2024-25']),
                      ('2025-26', [s for s in slips if season_of.get(s[1]) == '2025-26']), ('BOTH', slips)):
        act = sum(s[5] for s in ss) / sum(s[4] for s in ss)
        r0 = roi_thin(ss, 0.0, reps=1)
        s_ind = R.solve_shift(ss, p_of); s_thin = solve(roi_thin, ss)
        d_ind = R.delta_pp(ss, p_of, s_ind); d_thin = R.delta_pp(ss, p_of, s_thin)
        print(f"  {label:<8} slips {len(ss):>5} | actual ROI {100*act:+6.1f}% | thinning ROI(shift 0) {100*r0:+6.1f}% | "
              f"break-even: independence {100*d_ind:+.2f} pp, thinning {100*d_thin:+.2f} pp, difference {100*(d_thin-d_ind):+.2f} pp", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
