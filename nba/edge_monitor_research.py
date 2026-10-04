#!/usr/bin/env python3
"""
EDGE MONITOR RESEARCH (strategy doc §31k) - read-only. Builds the evidence a break-even monitor must rest on.
  1. Per-leg certified probability p_i = backtest hit rate of the leg's (cell, tier, side), from the strategies' own slips.
  2. Expected payout of every historical slip at any leg probabilities, EXACTLY (Poisson-binomial over hits x the engine's own
     grade(): compress(base(size, hits) x prod factors), official PrizePicks tables verified 2026-09-09).
     SANITY: expected ROI at the certified p_i must reproduce the actual backtest ROI - validates the method before use.
  3. Break-even as a uniform log-odds shift s* (all legs together) where expected ROI = 0; reported as the slip-leg-weighted
     percentage-point deficit vs certified (delta*), per strategy and for the daily portfolio.
  4. The monitored statistic: daily exposure-weighted mean of (hit - p_i). Its sd and autocorrelation (lags 1-7) decide the
     unit (day or week) a confidence sequence may treat as independent.
  5. Confidence sequence: predictable plug-in empirical-Bernstein (Waudby-Smith & Ramdas, JRSS-B 2024, Thm 2), coverage first
     checked on synthetic data with a known mean; then on the real backtest by block bootstrap: false 'below break-even'
     alarms when the edge is as certified; detection time when the edge decays below break-even; confirmation time at a
     realistic edge.
Env: DATABASE_URL, EM_SIMS (default 400).
"""
import math
import os
import random
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402
ENG = L.ENG
SIMS = int(os.environ.get('EM_SIMS', '400'))
ALPHA = 0.05
rng = random.Random(7)

DAILY = [n for n, v in L.STRATEGIES.items() if v[3] > 0 and n not in L.ROTATION_ONLY and n not in L.ALLSTAR_ONLY]


def logit(p): return math.log(p / (1 - p))
def expit(x): return 1 / (1 + math.exp(-x))


def exp_payout(legs_p, fprod, k, structure):
    """E[payout] with independent legs of probabilities legs_p: Poisson-binomial over hit counts x the engine's grade()."""
    dist = [1.0]
    for p in legs_p:
        nd = [0.0] * (len(dist) + 1)
        for h, q in enumerate(dist):
            nd[h] += q * (1 - p); nd[h + 1] += q * p
        dist = nd
    e = 0.0
    for h, q in enumerate(dist):
        base = (ENG.POWER[k] if h == k else 0.0) if structure == 'power' else ENG.FLEX.get((k, h), 0.0)
        if base > 0:
            e += q * ENG.compress(base * fprod)
    return e


def load(conn):
    slips = []   # (strategy, date, structure, k, stake, profit, legs[(key, factor, hit)])
    for name in DAILY:
        comp, size, structure, cap = L.STRATEGIES[name][:4]
        tbl = 'nba_score.slip_engine_slips_nosteals' if name.startswith(('C_', 'D_', 'R_', 'W_')) else 'nba_score.slip_engine_slips'
        side_only = L.SIDE_FILTER_BY_STRATEGY.get(name)
        for d, k, stake, profit, lj in conn.execute(f"""SELECT game_date, size, stake, profit, legs_json FROM {tbl}
                WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7'""", (comp, size, structure, cap)).fetchall():
            legs = [((j['cell'], j['tier'], j['side']), float(j['factor']), int(j['hit'])) for j in lj]
            slips.append((name, d, structure, k, float(stake), float(profit), legs))
    return slips


def roi_at(slips, p_of, shift):
    tot_e = tot_s = 0.0
    for name, d, structure, k, stake, profit, legs in slips:
        ps = [expit(logit(p_of[key]) + shift) for key, f, h in legs]
        fprod = math.prod(f for key, f, h in legs)
        tot_e += stake * exp_payout(ps, fprod, k, structure); tot_s += stake
    return tot_e / tot_s - 1


def solve_shift(slips, p_of):
    lo, hi = -3.0, 1.0
    if roi_at(slips, p_of, lo) > 0:
        return None
    for _ in range(40):
        mid = (lo + hi) / 2
        (lo, hi) = (mid, hi) if roi_at(slips, p_of, mid) > 0 else (lo, mid)
    return (lo + hi) / 2


def delta_pp(slips, p_of, s):
    n = tot = 0.0
    for *_r, legs in slips:
        for key, f, h in legs:
            p = p_of[key]; tot += expit(logit(p) + s) - p; n += 1
    return tot / n


# --- predictable plug-in empirical-Bernstein CS (Waudby-Smith & Ramdas 2024, Thm 2) on observations in [0, 1] ---
def prpl_eb_cs(xs, alpha=ALPHA, c=0.5):
    out = []; s_lx = s_l = s_vpsi = 0.0; mu_hat = 0.5; sig2 = 0.25; s_x = 0.0; s_dev = 0.0
    for t, x in enumerate(xs, start=1):
        lam = min(math.sqrt(2 * math.log(2 / alpha) / (sig2 * t * math.log(t + 1))), c)
        psi = (-math.log(1 - lam) - lam) / 4
        v = 4 * (x - mu_hat) ** 2
        s_lx += lam * x; s_l += lam; s_vpsi += v * psi
        center = s_lx / s_l; half = (math.log(2 / alpha) + s_vpsi) / s_l
        out.append((max(0.0, center - half), min(1.0, center + half)))
        s_x += x; mu_hat = (0.5 + s_x) / (t + 1)
        s_dev += (x - mu_hat) ** 2; sig2 = (0.25 + s_dev) / (t + 1)
    return out


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    slips = load(conn)
    print(f"EDGE MONITOR RESEARCH - {len(slips):,} backtest slips of the {len(DAILY)} daily strategies: {', '.join(DAILY)}", flush=True)
    # 1. certified per-leg probability: (cell, tier, side) hit rate over the strategies' own slip-legs
    agg = defaultdict(lambda: [0, 0])
    for *_r, legs in slips:
        for key, f, h in legs:
            agg[key][0] += h; agg[key][1] += 1
    p_of = {k: min(max(a / n, 0.02), 0.98) for k, (a, n) in agg.items()}
    print(f"\n1. certified (cell, tier, side) probabilities: {len(p_of)} keys", flush=True)
    # 2-3. sanity + break-even per strategy and for the portfolio
    print("\n2-3. SANITY (actual vs expected ROI at certified p) and BREAK-EVEN", flush=True)
    print(f"  {'strategy':<20} {'slips':>6} {'actual ROI':>10} {'expected':>9} {'shift s*':>8} {'delta* pp':>9}", flush=True)
    by = defaultdict(list)
    for s in slips:
        by[s[0]].append(s)
    for name in DAILY + ['PORTFOLIO']:
        ss = slips if name == 'PORTFOLIO' else by[name]
        act = sum(x[5] for x in ss) / sum(x[4] for x in ss)
        exp0 = roi_at(ss, p_of, 0.0)
        s_star = solve_shift(ss, p_of)
        dpp = delta_pp(ss, p_of, s_star) if s_star is not None else float('nan')
        print(f"  {name:<20} {len(ss):>6} {100*act:>9.1f}% {100*exp0:>8.1f}% {s_star if s_star is not None else float('nan'):>8.3f} {100*dpp:>8.2f}", flush=True)
        if name == 'PORTFOLIO':
            port_s, port_d = s_star, dpp
    # 4. the monitored statistic, daily
    day_sum = defaultdict(float); day_n = defaultdict(int)
    for name, d, *_r, legs in slips:
        for key, f, h in legs:
            day_sum[d] += h - p_of[key]; day_n[d] += 1
    days = sorted(day_sum)
    xs = [day_sum[d] / day_n[d] for d in days]
    m = sum(xs) / len(xs); sd = (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
    acf = []
    for lag in range(1, 8):
        num = sum((xs[i] - m) * (xs[i - lag] - m) for i in range(lag, len(xs)))
        acf.append(num / sum((x - m) ** 2 for x in xs))
    weeks = defaultdict(list)
    d0 = days[0]
    for d, x in zip(days, xs):
        weeks[(d - d0).days // 7].append(x)
    wx = [sum(v) / len(v) for k, v in sorted(weeks.items())]
    wm = sum(wx) / len(wx)
    wacf1 = sum((wx[i] - wm) * (wx[i - 1] - wm) for i in range(1, len(wx))) / sum((x - wm) ** 2 for x in wx)
    print(f"\n4. DAILY EXCESS (hit - certified p), exposure-weighted: {len(xs)} days, mean {100*m:+.2f} pp, sd {100*sd:.2f} pp, "
          f"legs/day {sum(day_n.values())/len(days):.0f}", flush=True)
    print("  autocorrelation lags 1-7: " + ", ".join(f"{a:+.3f}" for a in acf) + f"  (±{2/math.sqrt(len(xs)):.3f} = 2 SE)", flush=True)
    print(f"  weekly blocks: {len(wx)}, sd {100*(sum((x-wm)**2 for x in wx)/(len(wx)-1))**0.5:.2f} pp, lag-1 acf {wacf1:+.3f}", flush=True)
    print(f"  portfolio break-even: delta* = {100*port_d:.2f} pp (excess must stay above this)", flush=True)
    # 5a. CS coverage on synthetic data with a known mean
    miss = 0
    for _ in range(SIMS):
        mu = 0.55
        ys = [min(1, max(0, rng.gauss(mu, 0.1))) for _ in range(160)]
        if any(not (lo <= mu <= hi) for lo, hi in prpl_eb_cs(ys)):
            miss += 1
    print(f"\n5a. CS COVERAGE CHECK (synthetic, known mean, 160 looks, alpha {ALPHA}): miscovered at ANY look in {miss}/{SIMS} "
          f"= {100*miss/SIMS:.1f}% (must be <= {100*ALPHA:.0f}%)", flush=True)
    # 5b-d. backtest validation by 14-day block bootstrap of the real daily excess, in the CS's [0,1] scale
    blk = 14
    def season_draw(shift_pp):
        seq = []
        while len(seq) < 150:
            i = rng.randrange(0, len(xs) - blk)
            seq.extend(xs[i:i + blk])
        return [x + shift_pp for x in seq[:150]]
    def to01(x): return (x + 1) / 2
    thr = to01(port_d)
    def run(shift_pp):
        below = confirm = 0; t_below = []; t_conf = []
        for _ in range(SIMS):
            cs = prpl_eb_cs([to01(x) for x in season_draw(shift_pp)])
            tb = next((t for t, (lo, hi) in enumerate(cs, 1) if hi < thr), None)
            tc = next((t for t, (lo, hi) in enumerate(cs, 1) if lo > thr), None)
            if tb: below += 1; t_below.append(tb)
            if tc: confirm += 1; t_conf.append(tc)
        med = lambda v: sorted(v)[len(v) // 2] if v else None
        return below, med(t_below), confirm, med(t_conf)
    print("\n5b-d. BACKTEST VALIDATION (14-day block bootstrap of the real daily excess, 150-slate seasons, "
          f"{SIMS} sims; alarm = CS entirely below break-even, confirm = CS entirely above)", flush=True)
    for label, sh in (('edge as certified (backtest)', 0.0), ('realistic: 2 pp below certified', -0.02),
                      ('realistic: 4 pp below certified', -0.04), ('AT break-even', port_d - m),
                      ('1 pp BELOW break-even', port_d - m - 0.01), ('3 pp BELOW break-even', port_d - m - 0.03)):
        b, tb, c, tc = run(sh)
        print(f"  {label:<34} below-alarm {100*b/SIMS:5.1f}% (median day {tb}) | confirmed-above {100*c/SIMS:5.1f}% (median day {tc})", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
