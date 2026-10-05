#!/usr/bin/env python3
"""
GATE-2 COMPARISON (strategy doc §31s) - read-only. Control vs test slip builds for every daily strategy (live caps, final7 out) and
the daily PORTFOLIO, each season separately: ROI, profit, max drawdown, slips, and the share of test slips that used a new leg.
Arms from env G2_ARMS = "label:suffix,label:suffix" (suffix of slip_engine_slips; families C/D/R/W read the '_nosteals' variant,
i.e. slip_engine_slips_nosteals<suffix>). G2_NEW_LEGS = SQL predicate on a legs_json element j marking a "new" leg
(e.g. "(j->>'line')::numeric = floor((j->>'line')::numeric)" for whole-number lines).
Adoption bar (§30x / §31n): better at the portfolio level in BOTH seasons without a material drawdown increase.
Env: DATABASE_URL, G2_ARMS, G2_NEW_LEGS.
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402

DAILY = L.edge_daily_strategies()


def stats(days):
    stake = sum(v[0] for v in days.values()); net = sum(v[1] for v in days.values())
    cum = peak = dd = 0.0
    for d in sorted(days):
        cum += days[d][1]; peak = max(peak, cum); dd = max(dd, peak - cum)
    return stake, net, (net / stake if stake else 0.0), dd


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    arms = [a.split(':', 1) for a in os.environ['G2_ARMS'].split(',')]
    newp = os.environ.get('G2_NEW_LEGS', 'false')
    res = {}
    for label, sfx in arms:
        ser = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0])); newcnt = defaultdict(lambda: [0, 0])
        for name in DAILY:
            comp, size, structure, cap = L.STRATEGIES[name][:4]
            tbl = f"nba_score.slip_engine_slips{'_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else ''}{sfx}"
            for gd, season, stake, profit, has_new in conn.execute(f"""SELECT game_date, season, stake, profit,
                      EXISTS (SELECT 1 FROM jsonb_array_elements(legs_json) j WHERE {newp}) FROM {tbl}
                      WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7'""", (comp, size, structure, cap)).fetchall():
                c = ser[(name, season)][gd]; c[0] += float(stake); c[1] += float(profit)
                p = ser[('PORTFOLIO', season)][gd]; p[0] += float(stake); p[1] += float(profit)
                n = newcnt[season]; n[0] += int(has_new); n[1] += 1
        res[label] = (ser, newcnt)
    base = arms[0][0]
    for season in ('2024-25', '2025-26'):
        print(f"\n=== {season} ===", flush=True)
        for label, _ in arms[1:]:
            n = res[label][1][season]
            print(f"  {label}: {n[0]:,} of {n[1]:,} slips ({100*n[0]/max(n[1],1):.1f}%) used a new leg", flush=True)
        for name in DAILY + ['PORTFOLIO']:
            row = f"  {name:<20}"
            b = stats(res[base][0].get((name, season), {}))
            row += f" {base} {100*b[2]:6.1f}% p{b[1]:+7.0f} dd{b[3]:5.0f}"
            for label, _ in arms[1:]:
                t = stats(res[label][0].get((name, season), {}))
                row += f" | {label} {100*t[2]:6.1f}% ({100*(t[2]-b[2]):+5.1f}) p{t[1]:+7.0f} dd{t[3]:5.0f}"
            print(row, flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
