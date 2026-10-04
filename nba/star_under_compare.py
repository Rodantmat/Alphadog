#!/usr/bin/env python3
"""
STAR-LINE UNDER TEST - COMPARISON (strategy doc §31n). Read-only over the test tables built by nba-star-under-test.yml.
Arms, every daily strategy (live caps, final7 out) and the daily PORTFOLIO, each season separately:
  CONTROL      slip_engine_slips{_su_ctrl | _nosteals_su_ctrl}: rebuilt now, filter OFF (isolates the filter from any drift
               since the certified build)
  HALF-STAKE   the control's own slips, stake 0.5 on any slip holding a star-line balanced Under (default thresholds)
  EXCLUDE lo / mid / hi   star-line Unders removed BEFORE ranking (replacements fill), thresholds points / pra / combos =
               22.5/32.5/27.5, 24.5/34.5/29.5, 26.5/36.5/31.5 - a rule that works at only one cutoff is data-snooping
Reported: ROI, profit, max drawdown (units), and the change vs control. Adoption bar (§30x lesson): positive in BOTH seasons
at the portfolio level, at all three thresholds, without a material drawdown increase.
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402

DAILY = L.edge_daily_strategies()
STAR = {'lo': (22.5, 32.5, 27.5), 'mid': (24.5, 34.5, 29.5), 'hi': (26.5, 36.5, 31.5)}


def is_star_under(j, th):
    p, r, c = th
    if j.get('side') != 'Under' or j.get('tier') != 'R':
        return False
    line = float(j['line'])
    return (j['prop'] == 'points' and line >= p) or (j['prop'] == 'pra' and line >= r) or (j['prop'] in ('pts_ast', 'pts_reb') and line >= c)


def series(conn, arm, half=False):
    """{(strategy, season): {date: (stake, net)}} for one arm."""
    out = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
    for name in DAILY:
        comp, size, structure, cap = L.STRATEGIES[name][:4]
        fam_ns = name.startswith(('C_', 'D_', 'R_', 'W_'))
        tbl = f"nba_score.slip_engine_slips{'_nosteals' if fam_ns else ''}_su_{arm}"
        for gd, season, stake, profit, payout, lj in conn.execute(f"""SELECT game_date, season, stake, profit, payout, legs_json FROM {tbl}
                WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7'""", (comp, size, structure, cap)).fetchall():
            st, pr = float(stake), float(profit)
            if half and any(is_star_under(j, STAR['mid']) for j in lj):
                st, pr = st * 0.5, pr * 0.5
            cell = out[(name, season)][gd]; cell[0] += st; cell[1] += pr
    return out


def stats(days):
    stake = sum(v[0] for v in days.values()); net = sum(v[1] for v in days.values())
    cum = peak = dd = 0.0
    for d in sorted(days):
        cum += days[d][1]; peak = max(peak, cum); dd = max(dd, peak - cum)
    return stake, net, (net / stake if stake else 0.0), dd


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    arms = {'CONTROL': series(conn, 'ctrl'), 'HALF-STAKE': series(conn, 'ctrl', half=True),
            'EXCLUDE lo': series(conn, 'lo'), 'EXCLUDE mid': series(conn, 'mid'), 'EXCLUDE hi': series(conn, 'hi')}
    # control vs certified (reproducibility of the rebuild)
    for season in ('2024-25', '2025-26'):
        print(f"\n=== {season} ===", flush=True)
        print(f"  {'strategy':<20}" + "".join(f"{a:>22}" for a in arms), flush=True)
        port = {a: defaultdict(lambda: [0.0, 0.0]) for a in arms}
        for name in DAILY:
            row = f"  {name:<20}"
            base = None
            for a, ser in arms.items():
                days = ser.get((name, season), {})
                for d, (s, n) in days.items():
                    port[a][d][0] += s; port[a][d][1] += n
                st, net, roi, dd = stats(days)
                if a == 'CONTROL':
                    base = roi; row += f"{100*roi:>14.1f}% dd{dd:>4.0f}"
                else:
                    row += f"{100*roi:>9.1f}% ({100*(roi-base):+5.1f}) dd{dd:>3.0f}"
            print(row, flush=True)
        row = f"  {'PORTFOLIO':<20}"
        for a in arms:
            st, net, roi, dd = stats(port[a])
            if a == 'CONTROL':
                base = roi; row += f"{100*roi:>14.1f}% dd{dd:>4.0f}"
            else:
                row += f"{100*roi:>9.1f}% ({100*(roi-base):+5.1f}) dd{dd:>3.0f}"
        print(row, flush=True)
        print("  PORTFOLIO profit (units): " + ", ".join(f"{a} {stats(port[a])[1]:+.0f}" for a in arms), flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
