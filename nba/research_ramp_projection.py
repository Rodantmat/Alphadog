#!/usr/bin/env python3
"""
RESEARCH - BETTER UNIT RAMPS AND A CONSERVATIVE SEASON PROJECTION (2026-10-18; owner: "Any better ramp strategy? What is the
projection for the new season, conservatively?").  READ-ONLY.

Data: the live-loop replays (caps 2, streak flags on; s2526_streak / s2425_streak), played slips, shift slips out. Per option and
season-day: stake and return per 1-dollar unit (flags acting; a flagged slip's half stake is valid from a 2-dollar unit).

1. WEEK OF SEASON - ROI by season week (both seasons), to see where the early-season trough sits.
2. RAMPS (each from a 2-dollar start, cap 15, the unit never below 2; a ramp only uses what is known before the day):
   owner      weekly 2,4,6,8,10,12,15
   delayed    2 for weeks 1-6, then +2 a week to 15 (the owner's steps, started after the early trough)
   profit     the unit steps to the next level (2,4,6,8,10,12,15) only once season profit >= 25 x that level; steps back down one
              level when the drawdown from the season high reaches 15 x the current unit
   bankroll   unit = 2.5% of the bankroll (starting cash + season profit), rounded down to a level, starting cash = the flat-2
              weak-season bankroll x 4 (minimum 200)
   Scored per season: profit, staked, ROI, worst drop, bankroll needed (cash before each day must cover its stakes).
3. PROJECTION (conservative): 20,000 simulated seasons. Season week k is drawn from either season's week k-2..k+2 (keeps the
   calendar - the early trough stays early - while mixing the two seasons). Each simulated slip return is cut by a HAIRCUT
   (0%, 20%, 35% of every payout: live may be worse than the replay - closing lines, pulled legs, model drift). Reported per option
   at the owner's ramp: profit P5 / P25 / P50, probability of a losing season, worst drop P95, bankroll needed P95.
Env: DATABASE_URL, RP_SIMS (20000).
"""
import os
import random
from collections import defaultdict

import psycopg

LABELS = {'2025-26': 's2526_streak', '2024-25': 's2425_streak'}
SIX = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']
OPTIONS = {'all six': SIX, 'five': [s for s in SIX if s != 'C_wstocks_4flex'],
           'top 3': ['A_regular_5power', 'A_core_3power', 'A_wrebounds_4flex'], 'top 2': ['A_regular_5power', 'A_core_3power']}
LEVELS = [2, 4, 6, 8, 10, 12, 15]
SIMS = int(os.environ.get('RP_SIMS', '20000'))
random.seed(20261018)


def run(days, unit_fn, start_cash=0.0):
    """days: list of (week, stake_per_unit, return_per_unit). Returns profit, staked, worst drop, bankroll needed."""
    cum = pk = mdd = need = staked = 0.0; state = {'lvl': 0}
    for wk, s, r in days:
        u = unit_fn(wk, cum, pk, state, start_cash)
        st = u * s; net = u * (r - s)
        need = max(need, st - cum); staked += st
        cum += net; pk = max(pk, cum); mdd = max(mdd, pk - cum)
    return cum, staked, mdd, need


def owner(wk, cum, pk, st, cash):
    return LEVELS[min(wk, len(LEVELS) - 1)]


def delayed(wk, cum, pk, st, cash):
    return 2 if wk < 6 else LEVELS[min(wk - 5, len(LEVELS) - 1)]


def profit_gated(wk, cum, pk, st, cash):
    lvl = st['lvl']
    while lvl + 1 < len(LEVELS) and cum >= 25 * LEVELS[lvl + 1]:
        lvl += 1
    if lvl > 0 and pk - cum >= 15 * LEVELS[lvl]:
        lvl -= 1
    st['lvl'] = lvl
    return LEVELS[lvl]


def make_bankroll(cash):
    def f(wk, cum, pk, st, _):
        u = 0.025 * (cash + cum)
        lv = [x for x in LEVELS if x <= u]
        return lv[-1] if lv else 2
    return f


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    series = {}   # (season, option) -> list of (date, week, stake/u, return/u); slips -> per (season, option, week) list of days
    for season, label in LABELS.items():
        rows = conn.execute("""SELECT game_date, strategy, stake_weight, payout, coalesce(streak_note, '') FROM nba_score.replay_audit_slips
                               WHERE label=%s AND status IN ('graded','graded_void') AND strategy = ANY(%s)""", (label, SIX)).fetchall()
        d0 = min(r[0] for r in rows)
        for oname, strats in OPTIONS.items():
            byd = defaultdict(lambda: [0.0, 0.0])
            for d, s, w, pay, note in rows:
                if s not in strats or 'streak shift' in note:
                    continue
                w = float(w)
                byd[d][0] += w; byd[d][1] += w * float(pay or 0)
            series[(season, oname)] = [((d - d0).days // 7, byd[d][0], byd[d][1]) for d in sorted(byd)]

    print("\n== 1. ROI BY SEASON WEEK (all six, per-unit) ==", flush=True)
    for season in LABELS:
        wk = defaultdict(lambda: [0.0, 0.0])
        for w, s, r in series[(season, 'all six')]:
            wk[w][0] += s; wk[w][1] += r - s
        print(f"  {season}: " + "  ".join(f"w{k + 1} {v[1] / v[0]:+.0%}" for k, v in sorted(wk.items()) if v[0]), flush=True)

    print("\n== 2. RAMPS (profit / staked / ROI / worst drop / bankroll needed) ==", flush=True)
    for oname in OPTIONS:
        weak_need = run(series[('2024-25', oname)], lambda *a: 2)[3]
        cash = max(200.0, 4 * weak_need)
        ramps = {'flat 2': lambda *a: 2, 'flat 15': lambda *a: 15, 'owner': owner, 'delayed': delayed, 'profit': profit_gated,
                 f'bankroll {cash:.0f}': make_bankroll(cash)}
        for rname, fn in ramps.items():
            parts = []
            for season in LABELS:
                p, s, m, n = run(series[(season, oname)], fn, cash)
                parts.append(f"{season} {p:+9.0f} / {s:7.0f} / {p / s if s else 0:+6.1%} / DD {m:6.0f} / need {n:6.0f}")
            print(f"  {oname:<8} {rname:<14} " + " | ".join(parts), flush=True)

    print(f"\n== 3. PROJECTION - {SIMS:,} simulated seasons at the owner's ramp (week k drawn from either season's week k-2..k+2) ==", flush=True)
    for oname in OPTIONS:
        weeks = defaultdict(list)
        for season in LABELS:
            byw = defaultdict(list)
            for w, s, r in series[(season, oname)]:
                byw[w].append((s, r))
            for w, v in byw.items():
                weeks[w].append(v)
        nweeks = max(weeks) + 1
        pools = [[v for j in range(max(0, k - 2), min(nweeks, k + 3)) for v in weeks.get(j, [])] for k in range(nweeks)]
        for hc in (0.0, 0.20, 0.35):
            profits, dds, needs, rois = [], [], [], []
            for _ in range(SIMS):
                days = []
                for k in range(nweeks):
                    for s, r in random.choice(pools[k]):
                        days.append((k, s, r * (1 - hc)))
                p, st, m, n = run(days, owner)
                profits.append(p); dds.append(m); needs.append(n); rois.append(p / st if st else 0)
            profits.sort(); dds.sort(); needs.sort(); rois.sort()
            q = lambda a, x: a[int(x * (len(a) - 1))]
            print(f"  {oname:<8} haircut {hc:4.0%} | profit P5 {q(profits, .05):+9.0f}  P25 {q(profits, .25):+9.0f}  P50 {q(profits, .5):+9.0f} "
                  f"| ROI P5 {q(rois, .05):+6.1%} P50 {q(rois, .5):+6.1%} | P(losing season) {sum(1 for x in profits if x < 0) / len(profits):5.1%} "
                  f"| worst drop P95 {q(dds, .95):7.0f} | bankroll needed P95 {q(needs, .95):7.0f}", flush=True)
    conn.close()


if __name__ == '__main__':
    main()
