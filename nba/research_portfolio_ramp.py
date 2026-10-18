#!/usr/bin/env python3
"""
RESEARCH - THE PORTFOLIO OPTIONS WITH A WEEKLY UNIT RAMP (2026-10-18; owner: "Do the same study start at 2 dollars and ...
incrementing a week, 4,6,8,10,12,15 gradually, maxing at 15 per unit and increasing a week").  READ-ONLY.

Source: the live-loop replays (caps 2, streak flags on; labels s2526_streak / s2425_streak). Played = graded / graded_void; the
streak-shift slips left out (the shift is OFF). Unit by season week (week 1 = the season's first 7 days of slates, counted from its
first slate): 2, 4, 6, 8, 10, 12, then 15 to the end. Compared with a flat 2 and a flat 15.
Stakes: unit x weight. The weight is the slip's own (star-line Under slips 0.5) times the streak flag's x0.5 while it is ON - and
a stake below the 1-dollar minimum keeps the slip's own weight (as live does), recomputed at each week's unit.
Bankroll needed = the smallest starting cash that never goes below zero when every day's stakes are paid before that day settles.
Env: DATABASE_URL.
"""
import datetime as dt
import os
from collections import defaultdict

import psycopg

LABELS = {'2025-26': 's2526_streak', '2024-25': 's2425_streak'}
SIX = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']
OPTIONS = {'1. all six': SIX, '1b. five (no C_wstocks)': [s for s in SIX if s != 'C_wstocks_4flex'],
           '2. top 3': ['A_regular_5power', 'A_core_3power', 'A_wrebounds_4flex'], '3. top 2': ['A_regular_5power', 'A_core_3power']}
RAMP = [2, 4, 6, 8, 10, 12, 15]
MIN = 1.0


def unit_for(schedule, week):
    if schedule == 'flat 2':
        return 2.0
    if schedule == 'flat 15':
        return 15.0
    return float(RAMP[min(week, len(RAMP) - 1)])


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    for season, label in LABELS.items():
        rows = conn.execute("""SELECT game_date, strategy, stake_weight, profit, coalesce(streak_note, '') FROM nba_score.replay_audit_slips
                               WHERE label=%s AND status IN ('graded','graded_void') AND strategy = ANY(%s)""", (label, SIX)).fetchall()
        d0 = min(r[0] for r in rows)
        print(f"\n######## {season} ({label}): first slate {d0}; ramp weeks: " +
              ", ".join(f"wk{i + 1} {d0 + dt.timedelta(days=7 * i)} = {u}" for i, u in enumerate(RAMP)) + " to the end", flush=True)
        for oname, strats in OPTIONS.items():
            for sched in ('ramp', 'flat 2', 'flat 15'):
                byd = defaultdict(lambda: [0, 0.0, 0.0]); wk = defaultdict(lambda: [0.0, 0.0])
                n = wins = 0
                for d, s, w, pr, note in rows:
                    if s not in strats or 'streak shift' in note:
                        continue
                    w = float(w)
                    halved = '- stake x0.5' in note and 'full stake kept' not in note
                    flagged = '- stake x0.5' in note                       # the flag acted on this slip (halved or kept full)
                    own = w / 0.5 if halved else w                          # the slip's own weight
                    week = (d - d0).days // 7
                    u = unit_for(sched, week)
                    wt = own * 0.5 if (flagged and u * own * 0.5 >= MIN) else own
                    if u * wt < MIN:
                        continue                                            # below the minimum entry: never staked
                    st = u * wt; net = st * float(pr)
                    a = byd[d]; a[0] += 1; a[1] += st; a[2] += net
                    k = min(week, len(RAMP) - 1) if sched == 'ramp' else 0
                    wk[k][0] += st; wk[k][1] += net
                    n += 1; wins += net > 0
                days = sorted(byd)
                staked = sum(byd[d][1] for d in days); tot = sum(byd[d][2] for d in days)
                cum = pk = mdd = 0.0; need = 0.0; drought = longest = 0; lose = ls = 0; worst_day = (0.0, None)
                for d in days:
                    need = max(need, byd[d][1] - cum)                       # cash before the day must cover its stakes
                    cum += byd[d][2]
                    if cum > pk:
                        pk = cum; drought = 0
                    else:
                        drought += 1
                    longest = max(longest, drought); mdd = max(mdd, pk - cum)
                    lose = lose + 1 if byd[d][2] < 0 else 0; ls = max(ls, lose)
                    if byd[d][2] < worst_day[0]:
                        worst_day = (byd[d][2], d)
                months = defaultdict(float)
                for d in days:
                    months[d.strftime('%Y-%m')] += byd[d][2]
                print(f"  {oname:<24} {sched:<8} | slips {n:5d} slips/day {n / len(days):4.1f} | staked/day avg {staked / len(days):7.2f} max "
                      f"{max(byd[d][1] for d in days):7.2f} | staked {staked:9.2f} NET {tot:+10.2f} ROI {tot / staked:+6.1%} | slip win {wins / n:5.1%} "
                      f"| worst day {worst_day[0]:+8.2f} ({worst_day[1]}) best {max(byd[d][2] for d in days):+8.2f} | max drawdown {mdd:8.2f} "
                      f"drought {longest:3d} d losing streak {ls:2d} d | losing months {sum(1 for v in months.values() if v < 0)}/{len(months)} "
                      f"| bankroll needed {need:8.2f}", flush=True)
                if sched == 'ramp':
                    print("      by ramp step (unit: staked / net): " + "  ".join(
                        f"{RAMP[k]}: {wk[k][0]:.0f} / {wk[k][1]:+.0f}" for k in sorted(wk)), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
