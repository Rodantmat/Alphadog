#!/usr/bin/env python3
"""
UNDERDOG EDGE MONITOR RESEARCH (strategy doc §31o) - read-only. The §31k method for the Underdog P5 portfolio.
Payouts verified at the source (Underdog help center, 'Pick'em Standard & Flex Entry Payouts'): Standard 3.5/6.5/12/20/35x;
Flex 0 losses 3.25/6/10/25x, 1 loss 1.09/1.4/2.5/2.6x, 6-pick 2 losses 0.25x; base assumes 1.0x per pick, pick multipliers
scale it, and a multiplier pick must be correct for its boost - exactly build_ud_slip_engine.grade().
  1. P5 slips (4-Std cap 1 + 6-Flex cap 1 + mains 2-Std cap 2) from ud_slip_engine_slips_dlt_orig2, stand-downs applied
     (final 8 calendar days; the pre-All-Star week = 7 days up to the last game before the largest February gap).
  2. Certified p per (cell, tier, side) from those slips; EXACT expected payout by full enumeration of hit outcomes through the
     engine's own grade() (payout depends on WHICH legs hit in Flex) with the stored per-leg factors (modifier x haircut).
     SANITY: expected ROI at certified p vs actual backtest ROI.
  3. Break-even: uniform log-odds shift where expected ROI = 0, as a percentage-point deficit (delta*).
  4. Daily exposure-weighted excess (hit - p): sd, autocorrelation, legs per slate.
  5. Group-sequential: looks every 30 slates, Newey-West SE (7 lags), boundaries calibrated by 14-day block bootstrap with
     the truth AT break-even; power under certified / realistic / below-break-even truths.
Env: DATABASE_URL, EM_SIMS (default 400).
"""
import itertools
import math
import os
import random
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ud_slip_engine as E  # noqa: E402

SIMS = int(os.environ.get('EM_SIMS', '400'))
rng = random.Random(11)
P5 = [('weighted:points_R_U', 4, 'standard', 1), ('weighted:points_R_U', 6, 'flex', 1), ('mains', 2, 'standard', 2)]
LOOKS = (30, 60, 90, 120)


def logit(p): return math.log(p / (1 - p))
def expit(x): return 1 / (1 + math.exp(-x))


def exp_payout(ps, fs, structure):
    e = 0.0
    for out in itertools.product((0, 1), repeat=len(ps)):
        prob = math.prod(p if o else 1 - p for p, o in zip(ps, out))
        if prob == 0:
            continue
        _, pay = E.grade([{'hit': o, 'factor': f} for o, f in zip(out, fs)], structure)
        e += prob * pay
    return e


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    stand = set()
    for season in ('2024-25', '2025-26'):
        ds = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_score.ud_slip_engine_slips_dlt_orig2 WHERE season=%s ORDER BY 1", (season,)).fetchall()]
        feb = [(a, b) for a, b in zip(ds, ds[1:]) if a.month == 2]
        lb = max(feb, key=lambda x: (x[1] - x[0]).days)[0]
        s1 = max(ds)
        stand |= {d for d in ds if (lb - d).days in range(0, 7) or (s1 - d).days <= 7}
    slips = []
    for comp, size, structure, cap in P5:
        for gd, season, lj, profit, stake in conn.execute("""SELECT game_date, season, legs_json, profit, stake FROM nba_score.ud_slip_engine_slips_dlt_orig2
                WHERE composition=%s AND size=%s AND structure=%s AND k<=%s""", (comp, size, structure, cap)).fetchall():
            if gd in stand:
                continue
            slips.append((gd, season, structure, [((j['cell'], j['tier'], j['side']), float(j['factor']), int(j['hit'])) for j in lj],
                          float(profit), float(stake)))
    agg = defaultdict(lambda: [0, 0])
    for *_r, legs, pr, st in slips:
        for key, f, h in legs:
            agg[key][0] += h; agg[key][1] += 1
    p_of = {k: min(max(a / n, 0.02), 0.98) for k, (a, n) in agg.items()}

    def roi_at(ss, shift):
        e = sum(exp_payout([expit(logit(p_of[k]) + shift) for k, f, h in legs], [f for k, f, h in legs], st)
                for gd, sn, st, legs, pr, sk in ss)
        return e / len(ss) - 1

    def solve(ss):
        lo, hi = -3.0, 1.0
        if roi_at(ss, lo) > 0 or roi_at(ss, hi) < 0:
            return None
        for _ in range(40):
            mid = (lo + hi) / 2
            if roi_at(ss, mid) > 0:
                hi = mid
            else:
                lo = mid
        return (lo + hi) / 2

    def dpp(ss, s):
        v = [expit(logit(p_of[k]) + s) - p_of[k] for gd, sn, st, legs, pr, sk in ss for k, f, h in legs]
        return sum(v) / len(v)

    print(f"UNDERDOG EDGE MONITOR RESEARCH - P5: {len(slips)} slips, {len(p_of)} (cell, tier, side) keys, stand-down days out: {len(stand)}", flush=True)
    print("\nSANITY + BREAK-EVEN", flush=True)
    for label, ss in (('2024-25', [s for s in slips if s[1] == '2024-25']), ('2025-26', [s for s in slips if s[1] == '2025-26']), ('BOTH', slips)):
        act = sum(s[4] for s in ss) / sum(s[5] for s in ss)
        exp0 = roi_at(ss, 0.0); s_star = solve(ss)
        print(f"  {label:<8} slips {len(ss):>4} | actual ROI {100*act:+6.1f}% | expected at certified {100*exp0:+6.1f}% | "
              f"break-even delta* {100*dpp(ss, s_star) if s_star is not None else float('nan'):+.2f} pp", flush=True)
        if label == 'BOTH':
            port_d = dpp(ss, s_star)
    # THINNING (correlation-preserving): the independence model above understates actual ROI because legs in a slip co-move
    # (measured: 4-Std all-hit 19.5% actual vs 15.9% independent; 6-Flex 10.2% vs 5.9%). Thinning keeps the REAL joint
    # outcomes: each actual hit survives with probability p(s)/p, so every leg's hit rate falls exactly to p(s) while the
    # observed co-movement is preserved; slips are regraded with the engine's own grade().
    R = int(os.environ.get('EM_THIN_REPS', '120'))
    def roi_thin(ss, shift, reps=R):
        keep = {k: expit(logit(p) + shift) / p for k, p in p_of.items()}
        tot = 0.0; trng = random.Random(1234)
        for _ in range(reps):
            for gd, sn, st, legs, pr, sk in ss:
                _, pay = E.grade([{'hit': (1 if (h and trng.random() < keep[k]) else 0), 'factor': f} for k, f, h in legs], st)
                tot += pay
        return tot / (reps * len(ss)) - 1
    def solve_thin(ss):
        lo, hi = -3.0, 0.0
        if roi_thin(ss, lo) > 0 or roi_thin(ss, hi) < 0:
            return None
        for _ in range(22):
            mid = (lo + hi) / 2
            if roi_thin(ss, mid) > 0:
                hi = mid
            else:
                lo = mid
        return (lo + hi) / 2
    print("\nTHINNING (correlation-preserving) - ROI at shift 0 must equal the actual ROI exactly:", flush=True)
    for label, ss in (('2024-25', [s for s in slips if s[1] == '2024-25']), ('2025-26', [s for s in slips if s[1] == '2025-26']), ('BOTH', slips)):
        r0 = roi_thin(ss, 0.0, reps=1); st_ = solve_thin(ss)
        d_ = dpp(ss, st_) if st_ is not None else float('nan')
        print(f"  {label:<8} ROI(shift 0) {100*r0:+6.1f}% | break-even delta* {100*d_:+.2f} pp (independence said "
              f"{'see above'})", flush=True)
        if label == 'BOTH':
            port_d = d_
    day = defaultdict(lambda: [0.0, 0])
    for gd, sn, st, legs, pr, sk in slips:
        for k, f, h in legs:
            day[gd][0] += h - p_of[k]; day[gd][1] += 1
    days = sorted(day)
    xs = [day[d][0] / day[d][1] for d in days]
    m = sum(xs) / len(xs); sd = (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
    acf = [sum((xs[i] - m) * (xs[i - l] - m) for i in range(l, len(xs))) / sum((x - m) ** 2 for x in xs) for l in range(1, 8)]
    print(f"\nDAILY EXCESS: {len(xs)} slates, legs/slate {sum(v[1] for v in day.values())/len(days):.1f}, mean {100*m:+.2f} pp, sd {100*sd:.2f} pp", flush=True)
    print("  autocorrelation lags 1-7: " + ", ".join(f"{a:+.3f}" for a in acf) + f"  (2 SE = {2/math.sqrt(len(xs)):.3f})", flush=True)

    blk = 14
    def season_draw(shift):
        seq = []
        while len(seq) < 140:
            i = rng.randrange(0, len(xs) - blk); seq.extend(xs[i:i + blk])
        return [x + shift for x in seq[:140]]

    def nw_se(seq, lags=7):
        n = len(seq); mu = sum(seq) / n; d = [x - mu for x in seq]
        var = sum(x * x for x in d) / n + 2 * sum((1 - l / (lags + 1)) * sum(d[i] * d[i - l] for i in range(l, n)) / n for l in range(1, lags + 1))
        return math.sqrt(max(var, 1e-12) / n)

    def zpath(seq):
        return [((sum(seq[:n]) / n) - port_d) / nw_se(seq[:n]) for n in LOOKS]

    at_be = port_d - m
    null = [zpath(season_draw(at_be)) for _ in range(SIMS * 2)]
    mx = sorted(max(z) for z in null); mn = sorted(min(z) for z in null)
    c_conf = mx[int(0.95 * len(mx))]; c_alarm = -mn[int(0.05 * len(mn))]
    print(f"\nGROUP-SEQUENTIAL (looks {LOOKS}; NW 7 lags): calibrated on {len(null)} seasons AT break-even -> confirm z >= {c_conf:.2f}, "
          f"alarm z <= -{c_alarm:.2f}", flush=True)
    for label, sh in (('edge as certified', 0.0), ('2 pp below certified', -0.02), ('4 pp below certified', -0.04),
                      ('6 pp below certified', -0.06), ('AT break-even', at_be), ('3 pp BELOW break-even', at_be - 0.03),
                      ('5 pp BELOW break-even', at_be - 0.05), ('8 pp BELOW break-even', at_be - 0.08)):
        conf = defaultdict(int); alarm = defaultdict(int)
        for _ in range(SIMS):
            zp = zpath(season_draw(sh))
            conf[next((LOOKS[i] for i, z in enumerate(zp) if z >= c_conf), None)] += 1
            alarm[next((LOOKS[i] for i, z in enumerate(zp) if z <= -c_alarm), None)] += 1
        cc = lambda n, d: sum(v for k, v in d.items() if k is not None and k <= n)
        print(f"  {label:<24} confirmed by " + " ".join(f"{n}:{100*cc(n, conf)/SIMS:4.0f}%" for n in LOOKS)
              + " | alarm by " + " ".join(f"{n}:{100*cc(n, alarm)/SIMS:4.0f}%" for n in LOOKS), flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
