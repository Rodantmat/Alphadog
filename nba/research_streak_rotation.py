#!/usr/bin/env python3
"""
RESEARCH - WHAT TO RUN WHEN A STRATEGY IS IN A LOSING STRETCH (2026-10-17; owner: "find positive strategies to run instead
during these streaks, but it need to be identified, so we know when to do so, instead of guessing and end up losing more than
gaining").  READ-ONLY.

FLAG (known before the day's slips are placed; tested in both seasons 2026-10-17, permutation p 0.02-0.08):
  A_core_3power     its legs hit < 55% over its last 5 played days
  A_regular_5power  it lost on each of its last 3 played days
computed from the live-loop replays at caps 2 (nba_score.replay_audit_slips labels s2526_cap2 / s2425_cap2).

QUESTION: on the flagged days, which slip kind (window-only backtest, any composition / size 2-5 / structure, k <= cap, cap 1-3;
no 2-pick Flex) makes money - CHOSEN on one season's flagged days, SCORED on the other season's flagged days. Compared with
(a) staying with the flagged strategy and (b) sitting the day out. Minimum 40 slips on the selection season's flagged days.
Also prints the other live strategies (their current kinds and caps) on the flagged days.
Env: DATABASE_URL, SR_MIN (40).
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_slip_engine import STRATEGIES  # noqa: E402

MIN = int(os.environ.get('SR_MIN', '40'))
LABELS = {'2025-26': 's2526_cap2', '2024-25': 's2425_cap2'}
TABLES = {'wo': 'nba_score.slip_engine_slips_wo', 'wo_ns': 'nba_score.slip_engine_slips_wo_nosteals'}
LIVE = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power', 'R_stocks_4power']


def flagged_days(conn, label, strat):
    rows = conn.execute("""SELECT game_date, sum(stake_weight), sum(profit),
                                  sum((SELECT count(*) FROM jsonb_array_elements(legs_json) l WHERE l->>'hit' IS NOT NULL)),
                                  sum((SELECT count(*) FROM jsonb_array_elements(legs_json) l WHERE l->>'hit' = '1'))
                           FROM nba_score.replay_audit_slips WHERE label = %s AND strategy = %s AND status IN ('graded','graded_void')
                           GROUP BY 1 ORDER BY 1""", (label, strat)).fetchall()
    out, own = set(), {}
    for i, (d, st, pr, nl, nh) in enumerate(rows):
        prev = rows[:i]
        if strat == 'A_core_3power':
            l5 = prev[-5:]
            nl5 = sum(int(p[3]) for p in l5)
            flag = bool(l5) and nl5 > 0 and sum(int(p[4]) for p in l5) / nl5 < 0.55
        else:
            flag = len(prev) >= 3 and all(float(p[2]) <= 0 for p in prev[-3:])
        if flag:
            out.add(d)
        own[d] = (float(st), float(pr))
    return out, own


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))   # key -> season -> day -> k -> (stake, payout)
    for t, table in TABLES.items():
        for comp, size, struct, season, d, k, st, pay in conn.execute(f"""
                SELECT composition, size, structure, season, game_date, k, stake, payout FROM {table}
                WHERE phase <> 'final7' AND k <= 3 AND size BETWEEN 2 AND 5 AND NOT (structure = 'flex' AND size = 2)""").fetchall():
            data[(t, comp, size, struct)][season][d][k] = (float(st), float(pay))
    print(f"loaded {len(data)} slip kinds", flush=True)

    def on_days(key, season, cap, days):
        st = pr = 0.0; n = 0
        for d in days:
            for kk, (s, p) in data[key][season].get(d, {}).items():
                if kk <= cap:
                    st += s; pr += p - s; n += 1
        return st, pr, n

    for strat in ('A_core_3power', 'A_regular_5power'):
        flags, owns = {}, {}
        for season, label in LABELS.items():
            flags[season], owns[season] = flagged_days(conn, label, strat)
        print(f"\n######## {strat}: flagged days 2025-26 {len(flags['2025-26'])}, 2024-25 {len(flags['2024-25'])}", flush=True)
        for season in LABELS:
            st = sum(owns[season][d][0] for d in flags[season]); pr = sum(owns[season][d][1] for d in flags[season])
            print(f"  staying with {strat} on its flagged days, {season}: ROI {pr / st if st else 0:+.1%} net {pr:+.1f} on {st:.0f} staked", flush=True)
        print("  the other live strategies on those days (current kind and cap):", flush=True)
        for n in LIVE:
            comp, size, struct, cap = STRATEGIES[n][:4]
            key = ('wo_ns' if n.startswith(('C_', 'D_', 'R_', 'W_')) else 'wo', comp, size, struct)
            cells = []
            for season in LABELS:
                st, pr, k = on_days(key, season, max(1, min(cap, 3)), flags[season])
                cells.append(f"{season} {pr / st if st else 0:+7.1%} ({k:3d} slips)")
            print(f"    {n:<20} " + " | ".join(cells), flush=True)
        for sel, ev in (('2024-25', '2025-26'), ('2025-26', '2024-25')):
            cands = []
            for key in data:
                for cap in (1, 2, 3):
                    st, pr, n = on_days(key, sel, cap, flags[sel])
                    if n >= MIN and st:
                        cands.append((pr / st, key, cap, n))
            cands.sort(key=lambda r: -r[0])
            seen, top = set(), []
            for roi, key, cap, n in cands:
                if key[1:] in seen:
                    continue
                seen.add(key[1:]); top.append((roi, key, cap, n))
            print(f"  CHOSEN on {sel}'s flagged days -> SCORED on {ev}'s flagged days:", flush=True)
            for roi, key, cap, n in top[:8]:
                st, pr, m = on_days(key, ev, cap, flags[ev])
                print(f"    {key[1]:<22} {key[2]}{key[3][0].upper()} cap{cap} ({key[0]:<5}) chosen {roi:+7.1%} ({n} slips) -> scored {pr / st if st else 0:+7.1%} ({m} slips, net {pr:+.1f})", flush=True)
            for N in (1, 3, 5):
                st = pr = 0.0
                for roi, key, cap, n in top[:N]:
                    s, p, _ = on_days(key, ev, cap, flags[ev]); st += s; pr += p
                print(f"    top {N} together on {ev}'s flagged days: ROI {pr / st if st else 0:+.1%} net {pr:+.1f} on {st:.0f}", flush=True)
    conn.close()


if __name__ == '__main__':
    main()
