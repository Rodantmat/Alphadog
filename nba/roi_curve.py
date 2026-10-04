#!/usr/bin/env python3
"""
ROI CURVE (strategy doc §31m) - read-only. Exact expected ROI of the real daily portfolio (both seasons' slips, every leg's
certified (cell, tier, side) p shifted uniformly in log-odds) as a function of the resulting leg-hit deficit in percentage
points, using the validated machinery of edge_monitor_research.py (expected payout = Poisson-binomial over the engine's own
grade()). Replaces the single-Power-slip approximation used for the earlier 'realistic ROI' estimate.
Reported beside it: the independence correction measured at the certified level (actual vs expected ROI), and the dollars at
$1 per slip over a season of ~3,100 slips.
Env: DATABASE_URL.
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edge_monitor_research as R  # noqa: E402


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    slips = R.load(conn)
    from collections import defaultdict
    agg = defaultdict(lambda: [0, 0])
    for *_r, legs in slips:
        for key, f, h in legs:
            agg[key][0] += h; agg[key][1] += 1
    p_of = {k: min(max(a / n, 0.02), 0.98) for k, (a, n) in agg.items()}
    act = sum(s[5] for s in slips) / sum(s[4] for s in slips)
    exp0 = R.roi_at(slips, p_of, 0.0)
    corr = act - exp0
    print(f"portfolio: {len(slips):,} slips; actual ROI {100*act:+.1f}% vs expected at certified p {100*exp0:+.1f}% "
          f"(independence correction {100*corr:+.1f} pts, applied below)", flush=True)
    print(f"\n{'leg-hit deficit':>16} {'expected ROI':>13} {'corrected':>10} {'$ / season at $1/slip (~3,100 slips)':>38}", flush=True)
    for s in (0.0, -0.04, -0.08, -0.12, -0.16, -0.20, -0.25, -0.30, -0.35, -0.40, -0.45):
        roi = R.roi_at(slips, p_of, s); dpp = R.delta_pp(slips, p_of, s)
        c = roi + corr
        print(f"{100*dpp:>14.2f}pp {100*roi:>12.1f}% {100*c:>9.1f}% {3100*c:>34,.0f}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
