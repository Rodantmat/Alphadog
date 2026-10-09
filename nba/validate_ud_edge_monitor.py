#!/usr/bin/env python3
"""
UNDERDOG EDGE MONITOR - PRODUCTION-CODE VALIDATION (strategy doc §31o). ud_edge_reference (rebuild) -> each backtest season's
staked P5 slips (stand-downs out) as the live ledger would hold them -> ud_evaluate_edge slate by slate (looks recorded as
reached) -> then the DB wrapper ud_edge_monitor on today's ledger. Writes only nba_score.ud_edge_monitor_ref (needed anyway).
Env: DATABASE_URL.
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('UD_EXCL_CENTER', '1')
import ud_live_slip_engine as U  # noqa: E402


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    BT = U.ud_bt_table(conn)   # the tunable's backtest (round 3 #4: the market-free twin); UDL_BT_TABLE overrides
    p_ref = U.ud_edge_reference(conn, rebuild=True)
    print(f"reference: {len(p_ref)} (cell, tier, side) keys rebuilt from the P5 backtest ({BT})", flush=True)
    for season in ('2024-25', '2025-26'):
        ds = [r[0] for r in conn.execute(f"SELECT DISTINCT game_date FROM {BT} WHERE season=%s ORDER BY 1", (season,)).fetchall()]
        feb = [(a, b) for a, b in zip(ds, ds[1:]) if a.month == 2]
        lb = max(feb, key=lambda x: (x[1] - x[0]).days)[0]; s1 = max(ds)
        stand = {d for d in ds if 0 <= (lb - d).days < 7 or (s1 - d).days <= 7}
        by_day = defaultdict(lambda: [0.0, 0])
        for comp, size, structure, cap in U.UD_P5:
            for gd, lj in conn.execute(f"""SELECT game_date, legs_json FROM {BT} WHERE season=%s
                                          AND composition=%s AND size=%s AND structure=%s AND k<=%s""", (season, comp, size, structure, cap)).fetchall():
                if gd in stand:
                    continue
                for j in lj:
                    k = (j['cell'], j['tier'], j['side']); by_day[gd][0] += int(j['hit']) - p_ref[k]; by_day[gd][1] += 1
        days = sorted(by_day); excess = [by_day[d][0] / by_day[d][1] for d in days]
        print(f"\n{season}: {len(days)} staked slates, mean excess {100*sum(excess)/len(excess):+.2f} pp, break-even {100*U.UD_EDGE_DELTA:+.2f} pp", flush=True)
        prior = {}
        for n in range(1, len(excess) + 1):
            rows, running = U.ud_evaluate_edge(excess[:n], U.UD_EDGE_DELTA, prior)
            for look, mean, se, z, dec in rows:
                prior[look] = dec
                print(f"  look {look:>3} ({days[look-1]}): mean {100*mean:+.2f} pp, se {100*se:.2f} pp, z {z:+.2f} -> {dec}", flush=True)
        print(f"  end of season running (information only): n {running[0]}, z {running[3]:+.2f}", flush=True)
    print(f"\nDB wrapper on the live ledger as of {dt.date.today()}:", flush=True)
    U.ud_edge_monitor(conn, dt.date.today())
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
