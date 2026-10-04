#!/usr/bin/env python3
"""
EDGE MONITOR - PRODUCTION-CODE VALIDATION (strategy doc §31l). Feeds each backtest season through the PRODUCTION functions
(live_slip_engine.edge_reference / edge_break_even / evaluate_edge) exactly as edge_monitor() would read the live ledger
(daily strategies, caps, final7 out, slip-legs with hits), slate by slate, recording looks as they are reached; then runs the
DB wrapper edge_monitor() itself on today's (empty) ledger to exercise its paths. Writes only nba_score.edge_monitor_ref (the
reference table the monitor needs anyway) and whatever edge_monitor() records for today's season (nothing on an empty ledger).
Env: DATABASE_URL.
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    p_ref = L.edge_reference(conn, rebuild=True)
    print(f"reference: {len(p_ref)} (cell, tier, side) keys rebuilt from the daily strategies' backtest", flush=True)
    for season in ('2024-25', '2025-26'):
        by_day = defaultdict(lambda: [0.0, 0]); slips = []
        for name in L.edge_daily_strategies():
            comp, size, structure, cap = L.STRATEGIES[name][:4]
            tbl = 'nba_score.slip_engine_slips_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else 'nba_score.slip_engine_slips'
            for gd, lj in conn.execute(f"""SELECT game_date, legs_json FROM {tbl} WHERE season=%s AND composition=%s AND size=%s
                                           AND structure=%s AND k<=%s AND phase<>'final7'""", (season, comp, size, structure, cap)).fetchall():
                legs = [((j['cell'], j['tier'], j['side']), float(j['factor'])) for j in lj]
                slips.append((structure, legs))
                for j in lj:
                    k = (j['cell'], j['tier'], j['side'])
                    by_day[gd][0] += int(j['hit']) - p_ref[k]; by_day[gd][1] += 1
        days = sorted(by_day)
        excess = [by_day[d][0] / by_day[d][1] for d in days]
        delta, shift = L.edge_break_even(slips, p_ref)
        print(f"\n{season}: {len(days)} slates, {len(slips)} slips, break-even delta* {100*delta:+.2f} pp, mean excess "
              f"{100*sum(excess)/len(excess):+.2f} pp", flush=True)
        prior = {}
        for n in range(1, len(excess) + 1):
            rows, running = L.evaluate_edge(excess[:n], delta, prior)
            for look, mean, se, z, dec in rows:
                prior[look] = dec
                print(f"  look {look:>3} ({days[look-1]}): mean {100*mean:+.2f} pp, se {100*se:.2f} pp, z {z:+.2f} -> {dec}", flush=True)
        print(f"  end of season running (information only): n {running[0]}, z {running[3]:+.2f}", flush=True)
    today = dt.date.today()
    print(f"\nDB wrapper on the live ledger as of {today}:", flush=True)
    L.edge_monitor(conn, today)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
