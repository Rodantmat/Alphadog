#!/usr/bin/env python3
"""
RESEARCH - CAPS AND COMPOSITIONS AT EQUAL BUDGET (2026-10-17; owner: "Try different caps with the strategies, and see if
different compositions and use caps can give any difference or improvement" - ROI is the measure; the same money is spread
over fewer, better slips with a bigger unit).  READ-ONLY.

Data: the window-only backtest the live engine calibrates against (nba_score.slip_engine_slips_wo / _wo_nosteals), every slip
k = 1..10 a day of every (composition, size, structure), final-7 phase out (as the certified validation). 2-pick Flex is not a
PrizePicks product and is left out.

RULES, fixed before any result was seen:
  candidate     = (table, composition, size, structure, cap): the day's slips k <= cap of that kind
  volume        = at least MIN_SLIPS slips in the season it is chosen on
  honesty       = everything is CHOSEN on one season and SCORED on the other, both directions; nothing is scored in-sample
  equal budget  = a portfolio's profit is compared at the same total stake as the current six (ROI x the same money); its
                  max drawdown is scaled the same way
  portfolios    = (a) the current six at today's caps; (b) the current six, each at the cap that was best on the selection
                  season; (c) the top-N candidates of the selection season (one cap per composition/size/structure), N = 1, 2,
                  3, 6, 10; (d) the current six's compositions only, top-N among them
Prints per direction the out-of-sample ROI, profit at equal budget, max drawdown at equal budget, slips per day.
Env: DATABASE_URL, CC_MIN_SLIPS (150).
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_slip_engine import STRATEGIES  # noqa: E402

MIN_SLIPS = int(os.environ.get('CC_MIN_SLIPS', '150'))
SEASONS = ('2024-25', '2025-26')
TABLES = {'wo': 'nba_score.slip_engine_slips_wo', 'wo_ns': 'nba_score.slip_engine_slips_wo_nosteals'}
CURRENT = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']


def tbl_of(name):
    return 'wo_ns' if name.startswith(('C_', 'D_', 'R_', 'W_')) else 'wo'


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    # (tbl, comp, size, structure) -> season -> day -> k -> [stake, payout]
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    for t, table in TABLES.items():
        for comp, size, struct, season, d, k, st, pay in conn.execute(f"""
                SELECT composition, size, structure, season, game_date, k, stake, payout FROM {table}
                WHERE phase <> 'final7' AND NOT (structure = 'flex' AND size = 2)""").fetchall():
            data[(t, comp, size, struct)][season][d][k] = (float(st), float(pay))
    print(f"loaded {len(data)} slip kinds", flush=True)

    def daily(key, season, cap):
        """day -> (stake, profit) for slips k <= cap"""
        out = {}
        for d, ks in data[key][season].items():
            st = sum(v[0] for kk, v in ks.items() if kk <= cap)
            if st:
                out[d] = (st, sum(v[1] - v[0] for kk, v in ks.items() if kk <= cap))
        return out

    def stats(parts, season):
        """parts: list of (key, cap). Portfolio per day."""
        day = defaultdict(lambda: [0.0, 0.0])
        for key, cap in parts:
            for d, (st, pr) in daily(key, season, cap).items():
                day[d][0] += st; day[d][1] += pr
        st = sum(v[0] for v in day.values()); pr = sum(v[1] for v in day.values())
        cum = pk = mdd = 0.0
        for d in sorted(day):
            cum += day[d][1]; pk = max(pk, cum); mdd = max(mdd, pk - cum)
        return {'stake': st, 'profit': pr, 'roi': pr / st if st else 0.0, 'mdd': mdd, 'days': len(day),
                'per_day': st / len(day) if day else 0.0}

    def cand_table(season):
        rows = []
        for key in data:
            for cap in range(1, 11):
                s = stats([(key, cap)], season)
                if s['stake'] >= MIN_SLIPS:
                    rows.append((s['roi'], key, cap, s))
        return sorted(rows, key=lambda r: -r[0])

    cur_parts = [((tbl_of(n), STRATEGIES[n][0], STRATEGIES[n][1], STRATEGIES[n][2]), STRATEGIES[n][3]) for n in CURRENT]
    for sel, ev in ((SEASONS[0], SEASONS[1]), (SEASONS[1], SEASONS[0])):
        print(f"\n===== CHOSEN ON {sel}  ->  SCORED ON {ev} (out of sample) =====", flush=True)
        base = stats(cur_parts, ev)
        budget = base['stake']

        def line(label, parts):
            s = stats(parts, ev)
            if not s['stake']:
                print(f"  {label:<58} no slips", flush=True); return
            f = budget / s['stake']
            print(f"  {label:<58} ROI {s['roi']:>+7.1%} | profit at equal budget {s['profit'] * f:>+8.0f} | max DD {s['mdd'] * f:>5.0f}"
                  f" | {s['per_day']:>4.1f} slips/day x unit {f:>4.2f}", flush=True)
        line("CURRENT six at today's caps", cur_parts)
        # (b) current six, cap chosen on the selection season
        tuned = []
        for (key, cap0), n in zip(cur_parts, CURRENT):
            best = max(range(1, 11), key=lambda c: (stats([(key, c)], sel)['roi'] if stats([(key, c)], sel)['stake'] >= MIN_SLIPS / 3 else -9))
            tuned.append((key, best))
        line("current six, caps tuned on " + sel + ": " + ",".join(str(c) for _, c in tuned), tuned)
        cands = cand_table(sel)
        seen, top = set(), []
        for roi, key, cap, s in cands:
            if key in seen:
                continue
            seen.add(key); top.append((key, cap, roi, s))
        print(f"  top of {sel} (chosen there): " + "; ".join(f"{k[1]} {k[2]}{k[3][0].upper()} cap{c} ({r:+.0%}, {k[0]})" for k, c, r, _ in top[:10]), flush=True)
        for n in (1, 2, 3, 6, 10):
            line(f"top {n} kinds of {sel}", [(k, c) for k, c, _, _ in top[:n]])
        cur_keys = {k for k, _ in cur_parts}
        topc = [(k, c) for k, c, _, _ in top if k in cur_keys]
        for n in (1, 2, 3):
            line(f"top {n} of the current six's kinds on {sel} (cap from {sel})", topc[:n])
    conn.close()


if __name__ == '__main__':
    main()
