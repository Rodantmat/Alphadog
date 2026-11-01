#!/usr/bin/env python3
"""
RESEARCH - THE UNIT LADDER (2026-11-01, owner 11:41 / 11:43 PT: "right now we increase ... each 25 units ... the thresholds ... are
flat. They need to be exponential ... $1 -> $2 at 25, -> $3 at 75, -> $4 at 150 ... dropping mirror the ladder, the same thresholds
downwards ... if you get a drought with a big unit, we're not losing too much").  READ-ONLY. Copy of research_earn_raise.py with the
rule as a parameter, every rule run on the same data (the same seasons and the same simulated seasons - reseeded per rule):
  current  (LIVE since 2026-10-28) raise from u at profit >= 25 x u (+25 a step); -1 when the drop from the high >= 15 x u
  ladder   (OWNER 2026-11-01) the unit is the rung the season profit sits on: rung n starts at 25 x n(n-1)/2 -
           $1 below 25, $2 from 25, $3 from 75, $4 from 150, $5 from 250, $6 from 375 ... (+25, +50, +75, +100 ...); the same
           thresholds downwards (below 150 -> $3, below 75 -> $2, below 25 -> $1); max 15
Data, haircuts and simulated seasons exactly as research_earn_raise.py.
Env: DATABASE_URL, ER_SIMS (20000), ER_UP (25), ER_DOWN (15), ER_MAX (15).
"""
import os
import random
from collections import defaultdict

import psycopg

LABELS = {'2025-26': 's2526_streak', '2024-25': 's2425_streak'}
SIX = ['A_core_3power', 'A_regular_5power', 'A_wrebounds_4flex', 'A_wsteals_5flex', 'C_wstocks_4flex', 'D_points_3power']
SIMS = int(os.environ.get('ER_SIMS', '20000'))
UP = float(os.environ.get('ER_UP', '25'))
DOWN = float(os.environ.get('ER_DOWN', '15'))
MAXU = int(os.environ.get('ER_MAX', '15'))
MIN = 1.0


def day_money(slips, u, hc=0.0):
    """slips: list of (own_weight, flagged, payout per unit). -> (n placed, staked, returned)"""
    n = 0; st = ret = 0.0
    for own, flagged, pay in slips:
        wt = own * 0.5 if (flagged and u * own * 0.5 >= MIN) else own
        if u * wt < MIN:
            continue
        n += 1; st += u * wt; ret += u * wt * pay * (1 - hc)
    return n, st, ret


RULE = 'current'


def ladder_unit(cum):
    n = 1
    while n < MAXU and cum >= UP * n * (n + 1) / 2:
        n += 1
    return n


def next_unit(u, cum, pk):
    if RULE == 'ladder':
        return ladder_unit(cum)
    old = u
    while u < MAXU and cum >= UP * u:
        u += 1
    if u == old and u > 1 and pk - cum >= DOWN * u:
        u -= 1
    return u


def season(days, hc=0.0, log=None):
    """days: list of (date, slips). Returns a dict of the season under the rule in force (RULE)."""
    u = 1; cum = pk = mdd = need = staked = 0.0; n_all = 0; maxst = 0.0
    drought = longest = lose = lstreak = 0; at = defaultdict(int); first15 = None; day_i = 0
    for d, slips in days:
        n, st, ret = day_money(slips, u, hc)
        need = max(need, st - cum); staked += st; n_all += n; maxst = max(maxst, st); at[u] += 1
        net = ret - st; cum += net
        if cum > pk:
            pk = cum; drought = 0
        else:
            drought += 1
        longest = max(longest, drought); mdd = max(mdd, pk - cum)
        lose = lose + 1 if net < 0 else 0; lstreak = max(lstreak, lose)
        old = u
        u = next_unit(u, cum, pk)
        day_i += 1
        if u == MAXU and first15 is None:
            first15 = day_i
        if log is not None and u != old:
            log.append((d, old, u, cum, pk))
    return {'profit': cum, 'staked': staked, 'roi': cum / staked if staked else 0, 'mdd': mdd, 'need': need, 'drought': longest,
            'lstreak': lstreak, 'slips': n_all, 'days': len(days), 'maxst': maxst, 'at': dict(at), 'first15': first15, 'end_unit': u}


def main():
    global RULE
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    data = {}
    for sname, label in LABELS.items():
        rows = conn.execute("""SELECT game_date, stake_weight, payout, coalesce(streak_note, '') FROM nba_score.replay_audit_slips
                               WHERE label=%s AND status IN ('graded','graded_void') AND strategy = ANY(%s) ORDER BY game_date""",
                            (label, SIX)).fetchall()
        byd = defaultdict(list)
        for d, w, pay, note in rows:
            if 'streak shift' in note:
                continue
            w = float(w)
            halved = '- stake x0.5' in note and 'full stake kept' not in note
            flagged = '- stake x0.5' in note
            byd[d].append((w / 0.5 if halved else w, flagged, float(pay or 0)))
        data[sname] = [(d, byd[d]) for d in sorted(byd)]

    for RULE in ('current', 'ladder'):
        report(data)
    conn.close()


def report(data):
    random.seed(20261018)          # the same simulated seasons for every rule
    print(f"\n\n######## RULE {RULE} ########", flush=True)
    print(f"== THE PLAN ON EACH PAST SEASON (start 1, rule {RULE}, max {MAXU}) ==", flush=True)
    for sname, days in data.items():
        log = []
        r = season(days, 0.0, log)
        d0 = days[0][0]
        print(f"\n  {sname}: profit {r['profit']:+.2f} on {r['staked']:.2f} staked, ROI {r['roi']:+.1%} | slips {r['slips']} ({r['slips'] / r['days']:.1f}/day), "
              f"largest day stake {r['maxst']:.2f} | worst drop {r['mdd']:.2f}, longest drought {r['drought']} days, losing streak {r['lstreak']} days | "
              f"cash needed {r['need']:.2f} | unit at the end {r['end_unit']}, reached {MAXU} on slate day {r['first15']}", flush=True)
        print("    slate days at each unit: " + ", ".join(f"{k}: {v}" for k, v in sorted(r['at'].items())), flush=True)
        for d, a, b, cum, pk in log:
            print(f"    {d} (day {(d - d0).days + 1:3d})  unit {a:2d} -> {b:2d}   season profit {cum:+9.2f}  high {pk:9.2f}", flush=True)
        print("    by month (staked / net): " + "  ".join(
            f"{m}: {v[0]:.0f} / {v[1]:+.0f}" for m, v in sorted(month_split(days).items())), flush=True)

    print(f"\n== {SIMS:,} SIMULATED SEASONS (week k drawn from either season's week k-2..k+2), the same rule ==", flush=True)
    weeks = defaultdict(list)
    for sname, days in data.items():
        d0 = days[0][0]; byw = defaultdict(list)
        for d, slips in days:
            byw[(d - d0).days // 7].append((d, slips))
        for k, v in byw.items():
            weeks[k].append(v)
    nweeks = max(weeks) + 1
    pools = [[v for j in range(max(0, k - 2), min(nweeks, k + 3)) for v in weeks.get(j, [])] for k in range(nweeks)]
    q = lambda a, x: a[int(x * (len(a) - 1))]
    for hc in (0.0, 0.20, 0.35):
        res = []
        for _ in range(SIMS):
            days = [x for k in range(nweeks) for x in random.choice(pools[k])]
            res.append(season(days, hc))
        P = sorted(r['profit'] for r in res); R = sorted(r['roi'] for r in res); M = sorted(r['mdd'] for r in res)
        N = sorted(r['need'] for r in res); E = sorted(r['end_unit'] for r in res)
        F = sorted(r['first15'] if r['first15'] else 999 for r in res)
        print(f"  payout haircut {hc:4.0%} | profit P5 {q(P, .05):+8.0f}  P25 {q(P, .25):+8.0f}  P50 {q(P, .5):+8.0f}  P75 {q(P, .75):+8.0f}  P95 {q(P, .95):+8.0f} "
              f"| ROI P5 {q(R, .05):+6.1%} P50 {q(R, .5):+6.1%} | losing season {sum(1 for x in P if x < 0) / len(P):5.1%} "
              f"| worst drop P50 {q(M, .5):6.0f} P95 {q(M, .95):6.0f} | cash needed P50 {q(N, .5):5.0f} P95 {q(N, .95):5.0f} "
              f"| unit at season end P5 {q(E, .05)} P50 {q(E, .5)} | reaches {MAXU} by slate day P50 {q(F, .5) if q(F, .5) < 999 else 'never'} "
              f"(never in {sum(1 for x in F if x == 999) / len(F):.0%})", flush=True)


def month_split(days):
    """the real path's dollars by month (re-runs the rule to know each day's unit)."""
    out = defaultdict(lambda: [0.0, 0.0])
    u = 1; cum = pk = 0.0
    for d, slips in days:
        n, st, ret = day_money(slips, u)
        net = ret - st; cum += net; pk = max(pk, cum)
        out[d.strftime('%Y-%m')][0] += st; out[d.strftime('%Y-%m')][1] += net
        u = next_unit(u, cum, pk)
    return out


if __name__ == '__main__':
    main()
