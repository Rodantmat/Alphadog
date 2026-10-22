#!/usr/bin/env python3
"""
RESEARCH - LOSING STREAKS OF THE PROPOSED STRATEGIES, ONE BY ONE AND TOGETHER (2026-10-22 PT; owner 14:13 PT: "for these strategies,
individual and also summed, how many days it lost money back to back, each one of them, and playing all together").  READ-ONLY.

Per season (regular season, final 7 days out), every slip 1 unit, graded by build_slip_engine.grade:
  - each PROPOSED unit alone at 1 and 2 slips a day (its k = 1 / k = 1..2 slips);
  - the PROPOSED portfolio at 4 slips a day, leg cap 2 (research_pp_portfolio_mix round robin) and at 8 / no cap;
  - LIVE NOW at 8 / no cap (reference).
Printed: days played, losing days (share), LONGEST RUN OF BACK-TO-BACK LOSING DAYS (and its dates and units lost), the second
longest, longest run without a new equity high (days), worst single day, max drawdown.
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402
import research_pp_portfolio_mix as M   # noqa: E402

SEASONS = ("2024-25", "2025-26")
KMAX = 10


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    EX.install_flex2_alt(conn)
    units = sorted(set(M.PROPOSED) | set(M.LIVE_NOW))
    cand = defaultdict(list)
    for u in units:
        for season, d, k, legs, sg in conn.execute(
                f"""SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips{u[0]}
                    WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7'""",
                (u[1], u[2], u[3], KMAX)):
            if season in SEASONS:
                cand[(u, season, d)].append((k, legs, bool(sg and sg > 0)))
    for v in cand.values():
        v.sort(key=lambda x: x[0])
    days = defaultdict(set)
    for (u, s, d) in cand:
        days[s].add(d)

    def pay(u, legs, sg):
        return SE.grade([{"hit": l.get("hit"), "factor": float(l.get("factor") or 1.0)} for l in legs], u[3], same_game=sg)[1]

    def run(port, n, lcap, season):
        out = {}
        for d in sorted(days[season]):
            taken, use, seen = [], defaultdict(int), set()
            for k in range(KMAX):
                for u in port:
                    lst = cand.get((u, season, d))
                    if not lst or k >= len(lst) or len(taken) >= n:
                        continue
                    _, legs, sg = lst[k]
                    keys = list(dict.fromkeys(M.legkey(l) for l in legs))
                    sig = (u[2], u[3], tuple(sorted(map(str, keys))))
                    if sig in seen or any(use[x] >= lcap for x in keys):
                        continue
                    seen.add(sig)
                    for x in keys:
                        use[x] += 1
                    taken.append(pay(u, legs, sg) - 1.0)
                if len(taken) >= n:
                    break
            if taken:
                out[d] = (len(taken), sum(taken))
        return out

    def streaks(res):
        ds = sorted(res)
        runs, cur, start, lost = [], 0, None, 0.0
        for d in ds:
            p = res[d][1]
            if p < -1e-9:
                if cur == 0:
                    start, lost = d, 0.0
                cur += 1
                lost += p
            else:
                if cur:
                    runs.append((cur, start, prev, lost))
                cur = 0
            prev = d
        if cur:
            runs.append((cur, start, prev, lost))
        runs.sort(key=lambda r: (-r[0], r[3]))
        eq, peak, since, longest_flat, dd = 0.0, 0.0, 0, 0, 0.0
        for d in ds:
            eq += res[d][1]
            if eq > peak + 1e-9:
                peak, since = eq, 0
            else:
                since += 1
            longest_flat = max(longest_flat, since)
            dd = max(dd, peak - eq)
        st = sum(res[d][0] for d in ds)
        pr = sum(res[d][1] for d in ds)
        nl = sum(1 for d in ds if res[d][1] < -1e-9)
        worst = min(res[d][1] for d in ds)
        return st, pr, len(ds), nl, runs, longest_flat, worst, dd

    rows = []
    for u in M.PROPOSED:
        for n in (1, 2):
            rows.append((f"alone {u[1]} {u[2]}{'F' if u[3] == 'flex' else 'P'}{' (no steals)' if u[0] == '_wo_nosteals' else ''} {n}/day",
                         [u], n, 99))
    rows += [("PROPOSED together 4/day, leg cap 2", M.PROPOSED, 4, 2), ("PROPOSED together 8/day, no cap", M.PROPOSED, 8, 99),
             ("LIVE NOW together 8/day, no cap (reference)", M.LIVE_NOW, 8, 99)]
    for season in SEASONS:
        print(f"\n{'=' * 150}\n{season}\n{'strategy':<52} {'days':>4} {'ROI':>7} {'losing days':>12} {'LONGEST losing run':>36} "
              f"{'2nd':>4} {'no new high':>11} {'worst day':>9} {'max dd':>7}")
        for name, port, n, lcap in rows:
            st, pr, nd, nl, runs, flat, worst, dd = streaks(run(port, n, lcap, season))
            r1 = runs[0] if runs else (0, None, None, 0.0)
            r2 = runs[1][0] if len(runs) > 1 else 0
            print(f"{name:<52} {nd:>4} {100 * pr / st:>+6.1f}% {nl:>5} ({100 * nl / nd:>3.0f}%)   "
                  f"{r1[0]:>2} days {str(r1[1]):>10}..{str(r1[2]):<10} {r1[3]:>+6.1f}u {r2:>4} {flat:>8} d {worst:>+8.1f}u {dd:>6.1f}u")


if __name__ == "__main__":
    main()
