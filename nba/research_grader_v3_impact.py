#!/usr/bin/env python3
"""
RESEARCH - WHAT GRADER v3 CHANGED, STRATEGY BY STRATEGY (2026-10-18; owner: "be sure we are using the proper multipliers, prove,
analyze and understand each of the available tables").  READ-ONLY.

After regrade_pp_payout_v3.py the backtest tables keep the old payout in payout_grader_v2 (NULL = unchanged). Per live PrizePicks
strategy (live_slip_engine.STRATEGIES: composition, size, structure, CURRENT cap) on the live engine's own twin
(classification_config['live_backtest_suffix']; C_ / D_ / R_ / W_ strategies on the _nosteals table), regular season, final 7
days out: slips, ROI before (grader v2) and after (v3), per season; the share of slips whose payout changed and why (all-regular
Power / all-regular Flex / Power with alternates / same-game Flex).
Env: DATABASE_URL.
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    sfx = (conn.execute("SELECT config_json->>'suffix' FROM nba_config.classification_config WHERE config_key='live_backtest_suffix'").fetchone() or [''])[0] or ''
    print(f"twin suffix: {sfx!r}", flush=True)
    print("strategy             cap season   slips  ROI v2   ROI v3   change | changed slips: power-regular power-alt flex-regular flex-sg", flush=True)
    for name, spec in L.STRATEGIES.items():
        comp, size, structure, cap = spec[:4]
        if not cap:
            continue
        t = f"nba_score.slip_engine_slips{sfx}{'_nosteals' if name[:2] in ('C_', 'D_', 'R_', 'W_') else ''}"
        rows = conn.execute(f"""SELECT season, count(*), sum(stake), sum(coalesce(payout_grader_v2, payout)), sum(payout),
                                       count(*) FILTER (WHERE payout_grader_v2 IS NOT NULL AND structure = 'power' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(legs_json) j WHERE abs((j->>'factor')::float - 1) > 1e-9)),
                                       count(*) FILTER (WHERE payout_grader_v2 IS NOT NULL AND structure = 'power' AND EXISTS (SELECT 1 FROM jsonb_array_elements(legs_json) j WHERE abs((j->>'factor')::float - 1) > 1e-9)),
                                       count(*) FILTER (WHERE payout_grader_v2 IS NOT NULL AND structure = 'flex' AND same_game = 0),
                                       count(*) FILTER (WHERE payout_grader_v2 IS NOT NULL AND structure = 'flex' AND same_game > 0)
                                FROM {t} WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'
                                GROUP BY season ORDER BY season""", (comp, size, structure, cap)).fetchall()
        for season, n, st, p2, p3, a, b, c, d in rows:
            r2, r3 = 100 * (p2 / st - 1), 100 * (p3 / st - 1)
            print(f"{name:<20} {cap:>3} {season} {n:6d} {r2:+7.1f}% {r3:+7.1f}% {r3 - r2:+6.1f} | {a:5d} {b:5d} {c:5d} {d:5d}", flush=True)
    conn.close()


if __name__ == '__main__':
    main()
