#!/usr/bin/env python3
"""
RESEARCH - THE PORTFOLIO OPTIONS IN REAL DOLLARS AT A 2-DOLLAR UNIT (2026-10-18; owner: "Give me a comparison of the options, ROI,
profit, max drought, drawback, slips a day, and all other important points. Set at 2 dollars a unit").  READ-ONLY.

Source: the live-loop replays at a 2-dollar unit, caps 2, streak flags on (labels s2526_streak / s2425_streak; audit_season_replay,
both rollback PASS). Played = graded / graded_void. The streak-shift slips are left out (the shift is OFF). Each option is shown
with the streak flags acting (half stake on flagged days, as live will do at 2 dollars) and without (the flag's x0.5 undone).
Dollars: stake = 2 x stake_weight per slip; net = stake x unit profit. Per season:
  slips, play days, slips / day (avg, max), staked / day (avg, max), staked, net, ROI, slip win rate, losing days %,
  worst / best day, max drawdown (peak to trough of the daily running total), longest drought (play days from a high to the next
  new high), longest losing-day streak, losing months, and bankroll needed = max drawdown + the largest day's stake.
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import psycopg

UNIT = 2.0
LABELS = {'2025-26': 's2526_streak', '2024-25': 's2425_streak'}
SIX = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']
OPTIONS = {'1. all six': SIX, '1b. five (no C_wstocks)': [s for s in SIX if s != 'C_wstocks_4flex'],
           '2. top 3': ['A_regular_5power', 'A_core_3power', 'A_wrebounds_4flex'], '3. top 2': ['A_regular_5power', 'A_core_3power']}


def stats(rows):
    byd = defaultdict(lambda: [0, 0.0, 0.0])
    wins = 0
    for d, st, net in rows:
        a = byd[d]; a[0] += 1; a[1] += st; a[2] += net
        wins += net > 0
    days = sorted(byd)
    staked = sum(byd[d][1] for d in days); net = sum(byd[d][2] for d in days)
    cum = pk = mdd = 0.0; drought = longest = 0; lose = longest_l = 0
    for d in days:
        cum += byd[d][2]
        if cum > pk:
            pk = cum; drought = 0
        else:
            drought += 1
        longest = max(longest, drought); mdd = max(mdd, pk - cum)
        lose = lose + 1 if byd[d][2] < 0 else 0; longest_l = max(longest_l, lose)
    months = defaultdict(float)
    for d in days:
        months[d.strftime('%Y-%m')] += byd[d][2]
    n = len(rows)
    return {
        'slips': n, 'days': len(days), 'spd': n / len(days) if days else 0, 'spd_max': max((byd[d][0] for d in days), default=0),
        'usd_day': staked / len(days) if days else 0, 'usd_day_max': max((byd[d][1] for d in days), default=0),
        'staked': staked, 'net': net, 'roi': net / staked if staked else 0, 'win': wins / n if n else 0,
        'lose_days': sum(1 for d in days if byd[d][2] < 0) / len(days) if days else 0,
        'worst': min((byd[d][2] for d in days), default=0), 'best': max((byd[d][2] for d in days), default=0),
        'mdd': mdd, 'drought': longest, 'lstreak': longest_l,
        'neg_months': sum(1 for v in months.values() if v < 0), 'months': len(months),
        'bankroll': mdd + max((byd[d][1] for d in days), default=0)}


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    for season, label in LABELS.items():
        rows = conn.execute("""SELECT game_date, strategy, stake_weight, profit, coalesce(streak_note, '') FROM nba_score.replay_audit_slips
                               WHERE label=%s AND status IN ('graded','graded_void') AND strategy = ANY(%s)""", (label, SIX)).fetchall()
        print(f"\n######## {season} ({label}): {len(rows)} played slips, unit {UNIT:.2f} dollars", flush=True)
        for oname, strats in OPTIONS.items():
            for flags in ('flags on', 'flags off'):
                sel = []
                for d, s, w, pr, note in rows:
                    if s not in strats or 'streak shift' in note:
                        continue
                    w = float(w)
                    if flags == 'flags off' and '- stake x0.5' in note and 'full stake kept' not in note:
                        w = w / 0.5
                    st = UNIT * w
                    sel.append((d, st, st * float(pr)))
                m = stats(sel)
                print(f"  {oname:<24} {flags:<9} | slips {m['slips']:5d} days {m['days']:3d} slips/day {m['spd']:4.1f} (max {m['spd_max']:2d}) "
                      f"| staked/day {m['usd_day']:6.2f} (max {m['usd_day_max']:6.2f}) staked {m['staked']:8.2f} | NET {m['net']:+9.2f} ROI {m['roi']:+6.1%} "
                      f"| slip win {m['win']:5.1%} losing days {m['lose_days']:5.1%} worst day {m['worst']:+8.2f} best day {m['best']:+8.2f} "
                      f"| max drawdown {m['mdd']:7.2f} longest drought {m['drought']:3d} days losing streak {m['lstreak']:2d} days "
                      f"| losing months {m['neg_months']}/{m['months']} | bankroll {m['bankroll']:7.2f}", flush=True)
    conn.close()


if __name__ == '__main__':
    main()
