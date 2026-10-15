#!/usr/bin/env python3
"""
RESEARCH - THE PORTFOLIO: WHAT EACH CERTIFIED STRATEGY ADDS, AND HOW TO SIZE THE STAKES (2026-10-15; owner: "ground the
decisions on data, online research and debug. Do not cancel or cut anything, just adjust for the best possible outcome. Also
keep improving logics, looking at other models to improve ROI").  READ-ONLY.

Data: the backtest the live engine calibrates against (live_slip_engine.bt_table: market-free twin, the no-steals pool for
families C/D/R/W), every strategy at its live cap, final-7 out (never staked live). Daily strategies only (the rotation-only
and pre-break-week strategies stake on calendar signals and are reported separately).

Per strategy and season: slips, ROI, day-blocked bootstrap 95% interval (10k draws), daily-profit Sharpe.
Correlation of daily profit between strategies (a weak strategy that is uncorrelated with the rest can still lower the
portfolio's risk per unit of profit).
Portfolio with / without each strategy (flat 1-unit stakes, the live rule): net, ROI, daily sd, max drawdown, profit / drawdown.
SIZING MODELS, fit on one season and judged on the OTHER (cross-season, out of sample - never in-sample):
  flat      the live rule (1 unit per slip)
  kelly     multi-strategy Kelly: per-slip bankroll fractions maximizing E[log(1 + sum f_s * profit_s,day)] (Smoczynski &
            Tomkins; Whitrow 2007 for simultaneous bets), then scaled to HALF Kelly (estimation error; half Kelly keeps ~75% of
            the growth with far smaller drawdowns)
  invvar    risk parity: f_s proportional to mean_s / var_s of the daily profit (the diagonal Kelly), half scale
  each model's total daily exposure is normalized to the SAME average bankroll fraction as flat, so the comparison is
  allocation, not leverage.
Reported out of sample: log growth per day, final bankroll from 1.0, max bankroll drawdown, ROI on staked money.
Env: DATABASE_URL.
"""
import math
import os
import random
import sys
from collections import defaultdict

import numpy as np
import psycopg
from scipy.optimize import minimize

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_slip_engine import STRATEGIES, ROTATION_ONLY, ALLSTAR_ONLY, bt_table  # noqa: E402

BASE_FRACTION = float(os.environ.get('PR_BASE_FRACTION', '0.01'))   # flat: 1% of bankroll per slip (the research's unit)


def boot_ci(day_items, draws=10000, seed=11):
    n = len(day_items)
    rng = random.Random(seed)
    out = []
    for _ in range(draws):
        s = r = 0.0
        for _ in range(n):
            a, b = day_items[rng.randrange(n)]
            s += a; r += b
        out.append(r / s - 1 if s else 0.0)
    out.sort()
    return out[int(0.025 * draws)], out[int(0.975 * draws)]


def max_dd(series):
    peak = cum = dd = 0.0
    for x in series:
        cum += x; peak = max(peak, cum); dd = max(dd, peak - cum)
    return dd


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    daily = {n: s for n, s in STRATEGIES.items() if s[3] > 0 and n not in ROTATION_ONLY and n not in ALLSTAR_ONLY}
    prof = defaultdict(lambda: defaultdict(float))     # (season) -> {(day, strat): profit}
    stake = defaultdict(lambda: defaultdict(float))
    days = defaultdict(set)
    for name, (comp, size, structure, cap, *_r) in daily.items():
        tbl = bt_table(conn, name)
        for d, season, st, pr in conn.execute(
                f"""SELECT game_date, season, sum(stake), sum(profit) FROM {tbl}
                    WHERE composition=%s AND size=%s AND structure=%s AND k<=%s AND phase<>'final7' GROUP BY 1, 2""",
                (comp, size, structure, cap)):
            prof[season][(d, name)] = float(pr); stake[season][(d, name)] = float(st); days[season].add(d)
    names = list(daily)
    seasons = sorted(days)

    print("== PER STRATEGY (live cap, final-7 out, market-free twin) ==", flush=True)
    print(f"{'strategy':<20} {'season':<8} {'days':>4} {'slips':>5} {'ROI':>7} {'95% CI':>17} {'sharpe/day':>10}", flush=True)
    for name in names:
        for s in seasons:
            items = [(stake[s][(d, name)], stake[s][(d, name)] + prof[s][(d, name)]) for d in sorted(days[s]) if (d, name) in stake[s]]
            if not items:
                continue
            st = sum(a for a, _ in items); ret = sum(b for _, b in items)
            lo, hi = boot_ci(items)
            p = np.array([b - a for a, b in items])
            print(f"{name:<20} {s:<8} {len(items):>4} {int(st):>5} {ret / st - 1:>+7.1%} [{lo:+6.1%}, {hi:+6.1%}] {p.mean() / p.std():>10.3f}", flush=True)
        items = [(stake[s][(d, name)], stake[s][(d, name)] + prof[s][(d, name)]) for s in seasons for d in sorted(days[s]) if (d, name) in stake[s]]
        st = sum(a for a, _ in items); ret = sum(b for _, b in items)
        lo, hi = boot_ci(items)
        print(f"{name:<20} {'pooled':<8} {len(items):>4} {int(st):>5} {ret / st - 1:>+7.1%} [{lo:+6.1%}, {hi:+6.1%}]", flush=True)

    mats = {}
    for s in seasons:
        dl = sorted(days[s])
        mats[s] = (np.array([[prof[s].get((d, n), 0.0) for n in names] for d in dl]),
                   np.array([[stake[s].get((d, n), 0.0) for n in names] for d in dl]))

    print("\n== CORRELATION OF DAILY PROFIT (pooled seasons) ==", flush=True)
    P = np.vstack([mats[s][0] for s in seasons])
    C = np.corrcoef(P.T)
    print(" " * 20 + "".join(f"{n[:9]:>10}" for n in names), flush=True)
    for i, n in enumerate(names):
        print(f"{n:<20}" + "".join(f"{C[i, j]:>10.2f}" for j in range(len(names))), flush=True)

    print("\n== PORTFOLIO, FLAT 1-UNIT STAKES: ALL vs WITHOUT EACH STRATEGY ==", flush=True)
    print(f"{'portfolio':<28} {'season':<8} {'net':>8} {'ROI':>7} {'sd/day':>7} {'maxDD':>7} {'net/DD':>7}", flush=True)
    for drop in [None] + names:
        idx = [i for i, n in enumerate(names) if n != drop]
        for s in seasons + ['pooled']:
            Pm = P if s == 'pooled' else mats[s][0]
            Sm = np.vstack([mats[x][1] for x in seasons]) if s == 'pooled' else mats[s][1]
            dp = Pm[:, idx].sum(1); st = Sm[:, idx].sum()
            dd = max_dd(dp)
            print(f"{('ALL' if drop is None else 'without ' + drop):<28} {s:<8} {dp.sum():>+8.1f} {dp.sum() / st:>+7.1%} {dp.std():>7.2f} {dd:>7.1f} {dp.sum() / dd if dd else float('inf'):>7.2f}", flush=True)

    # ---- sizing models, cross-season ----
    def per_slip_returns(s):
        # per-unit-stake daily return of each strategy (profit per slip staked that day; 0 when it did not play)
        Pm, Sm = mats[s]
        with np.errstate(invalid='ignore', divide='ignore'):
            R = np.where(Sm > 0, Pm / np.where(Sm > 0, Sm, 1), 0.0)
        return R, Sm

    def run(f, s):
        """bankroll path: each slip stakes f_s of the CURRENT bankroll (fractions per slip), slips that day = Sm."""
        Pm, Sm = mats[s]
        b, peak, mdd, logs, staked, won = 1.0, 1.0, 0.0, [], 0.0, 0.0
        for d in range(Pm.shape[0]):
            exp = (f * Sm[d]).sum()
            if exp >= 0.999:
                f_d = f * (0.999 / exp)
            else:
                f_d = f
            r = (f_d * Pm[d]).sum()                     # Pm is profit summed over the day's slips (1-unit each)
            staked += b * (f_d * Sm[d]).sum(); won += b * r
            logs.append(math.log1p(r)); b *= (1 + r)
            peak = max(peak, b); mdd = max(mdd, 1 - b / peak)
        return np.mean(logs), b, mdd, (won / staked if staked else 0.0)

    def fit_kelly(s):
        Pm, Sm = mats[s]
        def nll(f):
            r = Pm @ f
            if np.any(r <= -0.999):
                return 1e9
            return -np.mean(np.log1p(r))
        n = len(names)
        x0 = np.full(n, BASE_FRACTION)
        res = minimize(nll, x0, method='SLSQP', bounds=[(0, 0.2)] * n)
        return np.clip(res.x, 0, None)

    def fit_invvar(s):
        Pm, Sm = mats[s]
        R, _ = per_slip_returns(s)
        mu = Pm.mean(0); var = Pm.var(0)
        return np.where(var > 0, np.clip(mu, 0, None) / var, 0.0)

    flat = np.full(len(names), BASE_FRACTION)
    print("\n== SIZING MODELS - fit on one season, judged on the other (out of sample) ==", flush=True)
    print(f"{'model':<10} {'fit':<8} {'test':<8} {'log g/day':>10} {'bankroll':>9} {'maxDD':>7} {'ROI':>7}  fractions per slip", flush=True)
    for fit_s in seasons:
        for test_s in seasons:
            if test_s == fit_s:
                continue
            avg_exp_flat = np.mean((flat * mats[test_s][1]).sum(1))
            for label, f in (('flat', flat), ('kelly/2', fit_kelly(fit_s) / 2), ('invvar', fit_invvar(fit_s))):
                if label != 'flat':
                    # same average bankroll exposure as flat on the FIT season (allocation, not leverage)
                    e = np.mean((f * mats[fit_s][1]).sum(1))
                    f = f * (np.mean((flat * mats[fit_s][1]).sum(1)) / e) if e > 0 else f
                g, b, dd, roi = run(f, test_s)
                print(f"{label:<10} {fit_s:<8} {test_s:<8} {g:>10.5f} {b:>9.3f} {dd:>7.1%} {roi:>+7.1%}  "
                      + " ".join(f"{n.split('_')[1][:7]}={x * 100:.2f}%" for n, x in zip(names, f)), flush=True)
            print(f"           (flat average exposure on {test_s}: {avg_exp_flat:.1%} of bankroll per day)", flush=True)

    # ---- the unit size: flat stakes as a share of the bankroll, each season (the risk the owner actually carries) ----
    print("\n== UNIT SIZE - flat stake per slip as a share of the CURRENT bankroll (compounding), each season ==", flush=True)
    print(f"{'unit':>6} {'season':<8} {'log g/day':>10} {'bankroll x':>11} {'maxDD':>7} {'avg daily exposure':>19}", flush=True)
    for unit in (0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02):
        f = np.full(len(names), unit)
        for s in seasons:
            g, b, dd, _roi = run(f, s)
            print(f"{unit:>6.2%} {s:<8} {g:>10.5f} {b:>11.2f} {dd:>7.1%} {np.mean((f * mats[s][1]).sum(1)):>19.1%}", flush=True)
    conn.close()


if __name__ == '__main__':
    main()
