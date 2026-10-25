#!/usr/bin/env python3
"""
RESEARCH - STARTING-POINT (CUMULATIVE PATH) STUDY + REALISTIC SEASON EXPECTATION FOR THE PORTFOLIO OPTIONS (2026-10-25; owner 12:27 PT:
"Add a cumulative study, starting in a random day, and multiple starting points, like tomorrow for example, how many day to start getting
positive in average, and what is the worst scenario on the starting point to get positive. Also once positive, how often it went negative,
more than once? And by how much. And what to realistically expect in the current season on all aspects?"). READ-ONLY.

OPTIONS (built leg by leg with research_portfolio_caps, flat 1u a slip; at 0.5% of the starting bankroll a slip, 1u = 0.5%):
  ALL9   all nine, no caps                                 A    all nine, strength order, <= 6 legs a game day-wide (rebuild)
  B      3+4+5+6+7+9                                       C    2+3+4+5+9
  D1     1+4                                               D2   4+9
PART 1 - EVERY STARTING SLATE (each of the 309 history slates; the path runs on through the rest of history, seasons back to back) and
         the EARLY-SEASON starts (the first 14 slates of a season - "starting tomorrow"):
  slates to the first time the running total is above 0 (mean / median / 75th / 90th / worst), the deepest hole before that, how many
  starts never got positive; after first positive: how many times it fell back below 0 (share of starts with 0 / 1 / 2+ dips), the
  deepest dip below 0 after first positive, and the slate it turned positive FOR GOOD.
PART 2 - REALISTIC SEASON: a 5-slate block bootstrap of the history slates into 4,000 simulated seasons of the history season length,
         at the backtest edge x 100% / 60% / 40% / 20% / 0% (each slip's return shifted down so the ROI is that share of the backtest
         ROI - selection in-sample makes the full edge optimistic): season profit (p10 / median / p90), chance the season ends
         negative, max drawdown (median / p90), slates to first positive, longest stretch under water, slips a day, slips won.
Env: DATABASE_URL, PP_BOOT (default 4000).
"""
import os
import sys
import time

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_portfolio_caps as PC                 # noqa: E402

T0 = time.time()
HIST = PC.HIST
NB = int(os.environ.get("PP_BOOT", "4000"))
RNG = np.random.default_rng(1027)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def path_stats(pl, starts):
    """pl: daily P/L (units). For each start: first-positive slate count, hole before, dips after, deepest dip after, positive-for-good"""
    out = []
    n = len(pl)
    for s in starts:
        c = np.cumsum(pl[s:])
        pos = np.where(c > 0)[0]
        if not len(pos):
            out.append(None)
            continue
        fp = int(pos[0])
        hole = float(min(0.0, c[:fp + 1].min()))
        after = c[fp:]
        neg = after <= 0
        dips = int(np.sum(neg[1:] & ~neg[:-1])) if len(after) > 1 else 0
        deep = float(min(0.0, after.min()))
        lastneg = np.where(c <= 0)[0]
        good = int(lastneg[-1] + 1) if len(lastneg) else 0
        out.append((fp + 1, hole, dips, deep, good + 1 if good < len(c) else None, n - s))
    return out


def report(name, pl, starts, label):
    st = path_stats(pl, starts)
    ok = [x for x in st if x is not None]
    never = len(st) - len(ok)
    if not ok:
        print(f"    {label}: never positive")
        return
    fp = np.array([x[0] for x in ok]); hole = np.array([x[1] for x in ok]); dips = np.array([x[2] for x in ok])
    deep = np.array([x[3] for x in ok]); good = [x[4] for x in ok if x[4] is not None]
    print(f"    {label} ({len(st)} starts): slates to first positive mean {fp.mean():.1f} | median {np.median(fp):.0f} | 75th "
          f"{np.percentile(fp, 75):.0f} | 90th {np.percentile(fp, 90):.0f} | worst {fp.max()} | first slate positive {100 * np.mean(fp == 1):.0f}% "
          f"| within 5 {100 * np.mean(fp <= 5):.0f}% | within 10 {100 * np.mean(fp <= 10):.0f}% | within 20 {100 * np.mean(fp <= 20):.0f}% "
          f"| never {never}")
    print(f"      hole before first positive: median {np.median(hole):+.1f}u | 1-in-10 worst {np.percentile(hole, 10):+.1f}u | worst {hole.min():+.1f}u "
          f"(at 0.5%/slip: worst {0.5 * hole.min():+.1f}% of bankroll)")
    print(f"      after first positive: fell back below 0 - never {100 * np.mean(dips == 0):.0f}% | once {100 * np.mean(dips == 1):.0f}% | twice "
          f"{100 * np.mean(dips == 2):.0f}% | 3+ {100 * np.mean(dips >= 3):.0f}% (mean {dips.mean():.1f}, max {dips.max()}) | deepest dip below 0: "
          f"median {np.median(deep):+.1f}u | 1-in-10 worst {np.percentile(deep, 10):+.1f}u | worst {deep.min():+.1f}u (0.5%: {0.5 * deep.min():+.1f}%)")
    if good:
        g = np.array(good)
        print(f"      positive FOR GOOD from slate: median {np.median(g):.0f} | 75th {np.percentile(g, 75):.0f} | 90th {np.percentile(g, 90):.0f} | "
              f"worst {g.max()}")


def boot_season(pl, stk, nwon, nsl, L, k_edge, roi):
    """block bootstrap one season of L slates; returns season stats. Edge haircut: each staked unit's return lowered by (1-k) * roi."""
    B = 5
    idx = []
    while len(idx) < L:
        s = RNG.integers(0, len(pl) - B)
        idx.extend(range(s, s + B))
    idx = np.array(idx[:L])
    p = pl[idx] - (1 - k_edge) * roi * stk[idx]
    c = np.cumsum(p)
    peak = np.maximum.accumulate(np.concatenate([[0], c]))[1:]
    dd = float(np.max(peak - c))
    pos = np.where(c > 0)[0]
    fp = int(pos[0]) + 1 if len(pos) else L + 1
    uw, cur = 0, 0
    for x in c - peak:
        cur = cur + 1 if x < 0 else 0
        uw = max(uw, cur)
    return c[-1], dd, fp, uw, stk[idx].sum(), nsl[idx].sum()


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    seas = np.array([k[0] for k in horder])
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    conn.close()
    C = PC.candidates(days, horder)
    log(f"candidates built: {len(horder)} slates")
    # strength order as in research_portfolio_caps (lower bound on all history)
    alone = np.full((PC.NS, len(horder)), np.nan)
    for di, row in enumerate(C):
        for i in range(PC.NS):
            pk = PC.select(row[i][0], row[i][1], row[i][2], PC.SPECS[i][4])
            if pk is not None:
                alone[i, di] = PC.grade(pk, PC.SPECS[i][5]) - 1.0
    lbs = np.array([np.nanmean(x) - np.nanstd(x) / np.sqrt(np.sum(~np.isnan(x))) for x in alone])
    strength = list(np.argsort(-lbs))
    sub = lambda ids: [i - 1 for i in ids]
    OPT = {
        "ALL9 (all nine, no caps)": PC.sim(C, list(range(9)), 9, 99, 99, 99, "drop"),
        "A (all nine, <=6 legs a game)": PC.sim(C, strength, 9, 99, 99, 6, "rebuild"),
        "B (3+4+5+6+7+9)": PC.sim(C, sub([3, 4, 5, 6, 7, 9]), 9, 99, 99, 99, "drop"),
        "C (2+3+4+5+9)": PC.sim(C, sub([2, 3, 4, 5, 9]), 9, 99, 99, 99, "drop"),
        "D1 (1+4)": PC.sim(C, sub([1, 4]), 9, 99, 99, 99, "drop"),
        "D2 (4+9)": PC.sim(C, sub([4, 9]), 9, 99, 99, 99, "drop"),
    }
    first = {s: np.where(seas == s)[0][0] for s in HIST}
    L = int(round(np.mean([np.sum(seas == s) for s in HIST])))
    for name, res in OPT.items():
        pl = np.array([sum(m - 1.0 for _, m in d) for d in res])
        stk = np.array([float(len(d)) for d in res])
        won = np.array([sum(1 for _, m in d if m > 1.0) for d in res])
        roi = pl.sum() / stk.sum()
        o = PC.flat_metrics(res, seas)
        print("\n" + "=" * 170 + f"\n{name}\n  history: " + PC.fmt(o))
        print("  PART 1 - STARTING POINTS")
        report(name, pl, list(range(len(pl))), "any slate (path runs through the rest of history)")
        for s in HIST:
            ix = np.where(seas == s)[0]
            report(name, pl[ix], list(range(len(ix))), f"any slate of {s} (path ends at that season's end)")
            report(name, pl[ix], list(range(min(14, len(ix)))), f"first 14 slates of {s} (like starting tomorrow)")
        # what a season opener start looked like, slate by slate
        for s in HIST:
            ix = np.where(seas == s)[0]
            c = np.cumsum(pl[ix])
            marks = [5, 10, 20, 30, 50, 75, 100, len(ix)]
            print(f"  {s} started on opening night: running total after " + ", ".join(f"{m} slates {c[m - 1]:+.0f}u" for m in marks if m <= len(c))
                  + f" | lowest {c.min():+.1f}u")
        print(f"  PART 2 - REALISTIC SEASON ({NB} bootstrapped seasons of {L} slates; edge = share of the backtest ROI {100 * roi:+.0f}%)")
        for k in (1.0, 0.6, 0.4, 0.2, 0.0):
            R = np.array([boot_season(pl, stk, won, stk, L, k, roi) for _ in range(NB)])
            prof, dd, fp, uw, st_, ns_ = R.T
            print(f"    edge {100 * k:3.0f}% (ROI ~{100 * k * roi:+.0f}%): season profit p10 {np.percentile(prof, 10):+.0f}u | median {np.median(prof):+.0f}u "
                  f"| p90 {np.percentile(prof, 90):+.0f}u | season negative {100 * np.mean(prof < 0):.0f}% | max dd median {np.median(dd):.1f}u, p90 "
                  f"{np.percentile(dd, 90):.1f}u | slates to first positive median {np.median(fp):.0f}, p90 {np.percentile(fp, 90):.0f}, never "
                  f"{100 * np.mean(fp > L):.0f}% | longest under water median {np.median(uw):.0f}, p90 {np.percentile(uw, 90):.0f} slates | "
                  f"slips {np.median(ns_):.0f}")
    log("done")


if __name__ == "__main__":
    main()
