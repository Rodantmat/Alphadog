#!/usr/bin/env python3
"""
RESEARCH - HOW FAST SHOULD A RED STRATEGY COME BACK? (2026-10-16; owner: "Is there any way to prevent the February dip? Test and
find a way to identify and improve it, not just avoid blindly, but understand and act on it after identification").  READ-ONLY.

Found by the hands-off replays (nba_score.replay_audit_*): in 2024-25 A_wsteals_5flex (cap 9, the largest strategy) went red
on 2024-12-28 (H1: its trailing-14-day leg hit 3 sigma low) and stayed red until 2025-03-31, while its shadow slips earned
+197 units (+26%) - because P5's release reads the strategy's SEASON-TO-DATE record (from Nov 1), which still carries the
bad weeks that caused the red. A season-to-date bound reacts ever more slowly as the season grows.

Tested here, before any engine change:
  A. On the replays' own ledgers (the production path: the live ledger, graded + shadow, k <= max(cap, 1)): for every red
     episode, the first Monday each release rule would have released, and what the strategy's slips earned between that
     Monday and the actual release.
       S   season-to-date from Nov 1, >= 40 days, day-blocked bootstrap lower bound > 0   (the live rule)
       T40 / T30   the same bound on the TRAILING 40 / 30 slate days only
  B. A null and an edge simulation on the backtest (market-free twin, both seasons, final-7 out), per daily strategy:
     a season is resampled by day blocks; red at a random day 30-110; weekly looks from then on. Null = payouts scaled so
     the strategy's ROI is exactly zero (variance shape kept); edge = the strategy's real record. Reported: the share of
     seasons each rule releases (null = false release) and the median weeks to release (edge).
Env: DATABASE_URL, RW_DRAWS (2000 bootstrap draws), RW_SIMS (300 simulated seasons per strategy).
"""
import datetime as dt
import os
import random
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_slip_engine import STRATEGIES, ROTATION_ONLY, ALLSTAR_ONLY, bt_table  # noqa: E402

DRAWS = int(os.environ.get('RW_DRAWS', '2000'))
SIMS = int(os.environ.get('RW_SIMS', '300'))


NP = np.random.default_rng(16)


def boot_lo(days, draws, rng=None):
    """day-blocked bootstrap 2.5% lower bound of ROI; days = [(staked, returned)]"""
    a = np.asarray(days, dtype=float)
    idx = NP.integers(0, len(a), size=(draws, len(a)))
    st = a[idx, 0].sum(axis=1); rt = a[idx, 1].sum(axis=1)
    return float(np.quantile(rt / st - 1, 0.025))


def rule_lo(days, rule, draws, rng):
    if rule == 'S':
        w = days
    else:
        w = days[-int(rule[1:]):]
    return boot_lo(w, draws, rng) if len(w) >= (40 if rule == 'S' else int(rule[1:])) else None


def part_a(conn, rng):
    print("== A. RED EPISODES IN THE HANDS-OFF REPLAYS (production release path: the strategy's own ledger) ==", flush=True)
    for label in ('s2425_red', 's2526_red'):
        st = conn.execute("""SELECT game_date, strategy, state FROM nba_score.replay_audit_states WHERE label=%s ORDER BY strategy, game_date""",
                          (label,)).fetchall()
        if not st:
            print(f"  {label}: no rows", flush=True); continue
        by = defaultdict(list)
        for d, s, state in st:
            by[s].append((d, state))
        for name, seq in by.items():
            if name not in STRATEGIES:
                continue
            cap = STRATEGIES[name][3]
            prev = None; start = None
            episodes = []
            for d, state in seq:
                if state == 'red' and prev != 'red':
                    start = d
                if prev == 'red' and state != 'red' and start:
                    episodes.append((start, d, state)); start = None
                prev = state
            if start:
                episodes.append((start, None, 'still red'))
            for r0, r1, how in episodes:
                y0 = r0.year if r0.month >= 7 else r0.year - 1
                since = dt.date(y0, 11, 1)
                rows = conn.execute("""SELECT game_date, count(*), sum(payout) FROM nba_score.replay_audit_slips WHERE label=%s AND strategy=%s
                                       AND status LIKE 'graded%%' AND k <= %s AND game_date >= %s GROUP BY 1 ORDER BY 1""",
                                    (label, name, max(cap, 1), since)).fetchall()
                daily = [(d, float(n), float(p or 0)) for d, n, p in rows]
                end = r1 or daily[-1][0] + dt.timedelta(days=1)
                line = f"  {label} {name:<18} red {r0} -> {r1 or '-'} ({how})"
                first = {}
                m = r0 + dt.timedelta(days=(7 - r0.weekday()) % 7 or 7)
                while m < end:
                    hist = [(n, p) for d, n, p in daily if d < m]
                    for rule in ('S', 'T40', 'T30'):
                        if rule in first:
                            continue
                        lo = rule_lo(hist, rule, DRAWS, rng)
                        if lo is not None and lo > 0:
                            first[rule] = m
                    m += dt.timedelta(days=7)
                for rule in ('S', 'T40', 'T30'):
                    if rule in first:
                        seg = [(n, p) for d, n, p in daily if first[rule] <= d < end]
                        st_, ret = sum(x[0] for x in seg), sum(x[1] for x in seg)
                        line += f" | {rule}: {first[rule]} (then {ret - st_:+.1f} on {st_:.0f} before the actual release)"
                    else:
                        line += f" | {rule}: never"
                print(line, flush=True)


def part_b(conn, rng):
    print("\n== B. SIMULATED SEASONS (backtest day blocks; red at a random day 30-110; weekly looks) ==", flush=True)
    print(f"   {'strategy':<20} {'rule':<4} {'null: false release':>20} {'edge: released':>15} {'edge: median weeks':>19}", flush=True)
    daily_names = [n for n, s in STRATEGIES.items() if s[3] > 0 and n not in ROTATION_ONLY and n not in ALLSTAR_ONLY]
    for name in daily_names:
        comp, size, structure, cap = STRATEGIES[name][:4]
        tbl = bt_table(conn, name)
        rows = conn.execute(f"""SELECT game_date, count(*), sum(payout) FROM {tbl} WHERE composition=%s AND size=%s AND structure=%s
                                AND k<=%s AND phase<>'final7' GROUP BY 1""", (comp, size, structure, cap)).fetchall()
        days = [(float(n), float(p)) for _, n, p in rows]
        roi = sum(p for _, p in days) / sum(n for n, _ in days) - 1
        null_days = [(n, p / (1 + roi)) for n, p in days]
        for rule in ('S', 'T40', 'T30'):
            res = {}
            for tag, pool in (('null', null_days), ('edge', days)):
                rel = 0; weeks = []
                for _ in range(SIMS):
                    season = [pool[rng.randrange(len(pool))] for _ in range(160)]
                    red = rng.randrange(30, 111)
                    for look in range(red + 7, 160, 7):
                        lo = rule_lo(season[:look], rule, 300, rng)
                        if lo is not None and lo > 0:
                            rel += 1; weeks.append((look - red) // 7); break
                res[tag] = (rel / SIMS, sorted(weeks)[len(weeks) // 2] if weeks else None)
            print(f"   {name:<20} {rule:<4} {res['null'][0]:>20.1%} {res['edge'][0]:>15.1%} {str(res['edge'][1]):>19}", flush=True)


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    rng = random.Random(16)
    part_a(conn, rng)
    part_b(conn, rng)
    conn.close()


if __name__ == '__main__':
    main()
