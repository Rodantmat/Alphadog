#!/usr/bin/env python3
"""
RESEARCH - REFIT THE PRIZEPICKS POWER LAW FOR SLIPS WITH GOBLINS / DEMONS (2026-10-18; owner: "be sure we are using the proper
multipliers, prove, analyze and understand each of the available tables").  READ-ONLY.

Evidence: every status-200 multi-pick quote (3-6 picks) with at least one goblin / demon whose alternates were priced alone in
the same run (nba_market.pp_quote: MIXED / FLEX / P_D1 / P_D2 / P_G1 / P_GD, NBA league 7 and WNBA league 3). Factor of an
alternate = its 2-pick quote vs a standard / 3, de-compressed above the 9.1 knee.

Fit per size n (least squares in logs):  ln(quote) = ln b + a ln(fp) + c [2+ alternates] + d [NBA]   (fp = product of factors)
Reported: b, a, c, d, residual quantiles; then candidate graders scored on every quote (ratio model / quote, share > 1):
  old    = build_slip_engine.grade today: compress(base_n x fp)
  law    = the fitted law (NBA)
  cons   = law x k_n, k_n = the 10th percentile of quote / law on NBA quotes (90% of quotes at or above), rounded down to
           PrizePicks' grid (0.1 below 3x, 0.25 at or above)
Env: DATABASE_URL.
"""
import math
import os
from collections import defaultdict

import numpy as np
import psycopg

POWER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}


def decompress(p):
    return p if p <= 9.1 else 9.1 * (p / 9.1) ** (1 / 0.857)


def compress(p):
    return p if p <= 9.1 else 9.1 * (p / 9.1) ** 0.857


def grid_down(x):
    return math.floor(x / 0.1 + 1e-9) * 0.1 if x < 3 else math.floor(x / 0.25 + 1e-9) * 0.25


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    rows = conn.execute("""SELECT run_file, league, section, n, power, legs FROM nba_market.pp_quote WHERE status = 200
                           ORDER BY run_file, seq""").fetchall()
    fac = {}
    for rf, lg, sec, n, pw, legs in rows:
        if sec in ('LEG', 'DRIFT') and n == 2:
            alt = [l for l in legs if l.get('odds') in ('goblin', 'demon')]
            p = ((pw or {}).get('2') or {}).get('2')
            if len(alt) == 1 and p:
                fac[(rf, alt[0]['id'], alt[0].get('side', 'over'))] = decompress(float(p)) / 3.0
    data = defaultdict(list)
    for rf, lg, sec, n, pw, legs in rows:
        if sec in ('LEG', 'DRIFT', 'LESS', 'ALTALT', 'VALIDATE', 'UNDER', 'SAMEGAME') or not n or n < 3:
            continue
        q = ((pw or {}).get(str(n)) or {}).get(str(n))
        if not q:
            continue
        f = [fac.get((rf, l['id'], l.get('side', 'over'))) if l.get('odds') in ('goblin', 'demon') else 1.0 for l in legs]
        if any(x is None for x in f):
            continue
        n_alt = sum(1 for x in f if x != 1.0)
        if n_alt == 0:
            continue
        kinds = ''.join(sorted(l['odds'][0] for l in legs if l.get('odds') in ('goblin', 'demon')))
        data[n].append({'fp': math.prod(f), 'q': float(q), 'multi': n_alt >= 2, 'nba': lg == 7, 'kinds': kinds,
                        'run': rf, 'new': rf >= 'pp_payout_map_20261019'})
    out = {}
    print("== FIT ln(quote) = ln b + a ln(fp) + c[2+ alts] + d[NBA] ==", flush=True)
    for n in sorted(data):
        D = data[n]
        X = np.array([[1, math.log(d['fp']), d['multi'], d['nba']] for d in D])
        y = np.array([math.log(d['q']) for d in D])
        coef, *_ = np.linalg.lstsq(X, y, rcond=None)
        res = y - X @ coef
        b, a, c, dn = math.exp(coef[0]), coef[1], coef[2], coef[3]
        out[n] = (b, a, c, dn)
        print(f"  {n}-pick: quotes {len(D)} (NBA {sum(d['nba'] for d in D)}, new 10-18 {sum(d['new'] for d in D)}) b {b:.3f} a {a:.4f} "
              f"multi x{math.exp(c):.3f} NBA x{math.exp(dn):.3f} | residual sd {res.std():.3f} q05 {np.quantile(res, .05):+.3f} q95 {np.quantile(res, .95):+.3f}",
              flush=True)
    print("\n== CANDIDATE GRADERS ON EVERY QUOTE (ratio = model / quote; > 1 overpays) ==", flush=True)
    ks = {}
    for n in sorted(data):
        b, a, c, dn = out[n]
        nba = [d for d in data[n] if d['nba']]
        law = lambda d: b * d['fp'] ** a * math.exp(c * d['multi'] + dn)
        r = sorted(d['q'] / law(d) for d in nba)
        k = r[max(0, int(0.10 * (len(r) - 1)))]
        ks[n] = k
        for name, fn in (('old', lambda d: compress(POWER[n] * d['fp'])), ('law', law), ('cons', lambda d: grid_down(law(d) * k))):
            for sub, sel in (('all', data[n]), ('NBA', nba), ('new 10-18', [d for d in data[n] if d['new']]),
                             ('1 alt', [d for d in nba if not d['multi']]), ('2+ alts', [d for d in nba if d['multi']]),
                             ('demon only', [d for d in nba if set(d['kinds']) == {'d'}]), ('goblin in', [d for d in nba if 'g' in d['kinds']])):
                if not sel:
                    continue
                rr = [fn(d) / d['q'] for d in sel]
                print(f"  {n}-pick {name:<4} {sub:<11} n {len(rr):3d} mean {np.mean(rr):.3f} min {min(rr):.3f} max {max(rr):.3f} "
                      f"share>1 {np.mean([x > 1.0001 for x in rr]):.0%}", flush=True)
        print(f"  {n}-pick k (q10 of quote/law, NBA) = {k:.4f}", flush=True)
    print("\n== RULE TO STORE (pp_slip_rules['power_alt_v3']) ==", flush=True)
    print({str(n): {'b': round(out[n][0] * math.exp(out[n][3]), 4), 'a': round(out[n][1], 4), 'multi': round(math.exp(out[n][2]), 4),
                    'k_cons': round(ks[n], 4)} for n in sorted(out)}, flush=True)
    conn.close()


if __name__ == '__main__':
    main()
