#!/usr/bin/env python3
"""
RESEARCH - IS THE H7 STEALS ANCHOR A CANARY? (2026-10-15; owner: "Is there any way to prevent the February dip? Test and find a
way to identify and improve it, not just avoid blindly, but understand and act on it after identification").  READ-ONLY.

The question. H7 stops ALL of family A when the shared steals anchor (the steals legs' daily hit, trailing 14 slates) sits
3 sigma below its certified level; the drought rotation (29p) already answers a steals drought by building family A WITHOUT
steals. H7 is worth keeping only if a steals collapse is a CANARY - if the family's OTHER legs (what the rotation plays) also
go bad after the anchor fires. If they hold, H7 is stopping a family on a cell it no longer plays.

Method (both seasons, the backtest the live engine calibrates against, market-free twin, final-7 out):
  anchor series  per slate day, the mean hit of the DISTINCT steals legs family A's live-cap slips carry (the anchor's input);
                 trailing-14-slate mean -> z = (p0 - mean) / (sd_day / sqrt(n)) with the live calibration (_ANCHOR_steals)
  episodes       days with z > 3 (red) and 2 < z <= 3 (yellow); counted as the live engine would see them (z of the
                 trailing window through the PREVIOUS slate, applied to the next pick)
  measured on each flagged day (the stake H7 would have removed):
      - family A steals-free build at live caps (what the rotation stakes) - net, ROI
      - family A steals build at live caps (what normal mode stakes)
      - the family's NON-steals legs' hit that day vs their season mean (the canary test proper)
      - the next 15 slates after an episode's first red day, steals-free family A, vs the season's average day
  baseline       all other days of the same season.
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_slip_engine import STRATEGIES  # noqa: E402

FAM_A = {n: s for n, s in STRATEGIES.items() if n.startswith('A_') and s[3] > 0}


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    p0, sd_day = conn.execute("SELECT cert_leg_hit, sd_daily_hit FROM nba_score.live_strategy_calib WHERE strategy='_ANCHOR_steals'").fetchone()
    p0, sd_day = float(p0), float(sd_day)
    print(f"anchor calibration p0 {p0:.4f} sd_day {sd_day:.4f}; family A: {', '.join(f'{n} cap {s[3]}' for n, s in FAM_A.items())}", flush=True)
    for season in ('2024-25', '2025-26'):
        day_net = {'st': defaultdict(float), 'ns': defaultdict(float)}
        day_n = {'st': defaultdict(int), 'ns': defaultdict(int)}
        steals_legs = defaultdict(dict)     # day -> {(player, side, line): hit}
        other_legs = defaultdict(dict)
        for tag, tbl in (('st', 'nba_score.slip_engine_slips_mf'), ('ns', 'nba_score.slip_engine_slips_mf_nosteals')):
            for name, (comp, size, structure, cap, *_r) in FAM_A.items():
                rows = conn.execute(f"""SELECT game_date, stake, payout, legs_json FROM {tbl} WHERE season=%s AND composition=%s AND size=%s
                                        AND structure=%s AND k<=%s AND phase<>'final7'""", (season, comp, size, structure, cap)).fetchall()
                for d, stake, pay, legs in rows:
                    day_net[tag][d] += float(pay) - float(stake); day_n[tag][d] += 1
                    if tag == 'st':
                        for l in legs:
                            if l.get('hit') is None:
                                continue
                            key = (l['player'], l['side'], l['line'], l['prop'])
                            (steals_legs if str(l.get('cell', '')).startswith('steals') else other_legs)[d][key] = int(l['hit'])
        days = sorted(set(day_n['st']) | set(day_n['ns']))
        anchor = {d: sum(v.values()) / len(v) for d, v in steals_legs.items() if v}
        other = {d: sum(v.values()) / len(v) for d, v in other_legs.items() if v}
        other_mean = sum(sum(v.values()) for v in other_legs.values()) / max(1, sum(len(v) for v in other_legs.values()))
        # z as the live engine sees it at the pick of day d: trailing 14 anchor days strictly before d
        flag = {}
        hist = []
        for d in days:
            if len(hist) >= 7:
                w = hist[-14:]
                m = sum(w) / len(w); z = (p0 - m) / (sd_day / len(w) ** 0.5)
                flag[d] = 'red' if z > 3.0 else ('yellow' if z > 2.0 else 'ok')
            else:
                flag[d] = 'ok'
            if d in anchor:
                hist.append(anchor[d])
        print(f"\n== {season}: {len(days)} slate days; family-A non-steals leg hit (season) {other_mean:.3f} ==", flush=True)
        for state in ('red', 'yellow', 'ok'):
            ds = [d for d in days if flag[d] == state]
            if not ds:
                print(f"  {state:<6} 0 days", flush=True); continue
            out = []
            for tag in ('st', 'ns'):
                n = sum(day_n[tag][d] for d in ds); net = sum(day_net[tag][d] for d in ds)
                out.append(f"{'steals' if tag == 'st' else 'steals-free'} {net:+8.1f} on {n:4d} ({net / n if n else 0:+.0%})")
            oh = [other[d] for d in ds if d in other]
            print(f"  {state:<6} {len(ds):3d} days | " + " | ".join(out) + f" | non-steals leg hit {sum(oh) / len(oh):.3f}" if oh else "", flush=True)
        # episodes: the first red day after a non-red day, and the 15 slates that follow (steals-free build = the rotation)
        print("  episodes (first red day; steals-free family A over the next 15 slates vs the season's average 15-slate stretch):", flush=True)
        avg15 = sum(day_net['ns'][d] for d in days) / len(days) * 15
        prev = 'ok'
        for i, d in enumerate(days):
            if flag[d] == 'red' and prev != 'red':
                nxt = days[i:i + 15]
                net = sum(day_net['ns'][x] for x in nxt); n = sum(day_n['ns'][x] for x in nxt)
                reds = sum(1 for x in nxt if flag[x] == 'red')
                oh = [other[x] for x in nxt if x in other]
                print(f"    {d} -> {nxt[-1]}: steals-free {net:+.1f} on {n} ({net / n if n else 0:+.0%}; season avg 15 slates {avg15:+.1f}); "
                      f"red on {reds} of them; non-steals leg hit {sum(oh) / len(oh):.3f}", flush=True)
            prev = flag[d]
    conn.close()


if __name__ == '__main__':
    main()
