#!/usr/bin/env python3
"""
RESEARCH - ARE THE DEMONS IN THE 2-SLIP PORTFOLIO WORTH IT? (2026-10-22 PT; owner 14:53-14:54 PT: "those slips carry demons, and
demons are so hard to hit ... is the payout for a demon worth it? ... we should try to get easier legs").  READ-ONLY.

The portfolio exactly as live (live_slip_engine.PORTFOLIO_UNITS order, round robin k = 1..10, no repeat, leg cap 2, 2 slips a day)
on the live engine's twin backtest (window-only, final 7 days out), with a DEMON RULE on the candidates:
  ANY      - as live (demons allowed)
  MAX1     - a candidate with 2+ demon legs is passed over (the next candidate fills)
  NONE     - a candidate with any demon leg is passed over
and at 4 slips a day too. Per season: slips, ROI, all-hit rate, 3-of-4+ rate (Flex), max drawdown, longest losing run; plus the
slips of the ANY rule split by their demon count (0 / 1 / 2+): ROI, all-hit, 3-of-4. And the legs: demon vs standard legs inside
the portfolio's slips - hit rate, mean factor, value e = hit x factor.
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE          # noqa: E402
import research_exhaustive_pp as EX     # noqa: E402

SEASONS = ("2024-25", "2025-26")
KMAX = 10
UNITS = [("_wo", "weighted:threes_D1", 4, "flex"), ("_wo_nosteals", "weighted:assists_D1", 4, "flex"),
         ("_wo", "weighted:rebounds_R", 4, "flex"), ("_wo", "weighted:stocks_R", 4, "flex"),
         ("_wo", "single:points_R", 3, "power"), ("_wo", "weighted:rebounds_R", 3, "power")]


def ndemon(legs):
    return sum(1 for l in legs if str(l.get("tier", "R")).startswith("D"))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    EX.install_flex2_alt(conn)
    cand = defaultdict(list)
    for u in UNITS:
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

    def run(season, n, rule):
        out = []
        for d in sorted(days[season]):
            taken, use, seen = [], defaultdict(int), set()
            for k in range(KMAX):
                for u in UNITS:
                    lst = cand.get((u, season, d))
                    if not lst or k >= len(lst) or len(taken) >= n:
                        continue
                    _, legs, sg = lst[k]
                    nd = ndemon(legs)
                    if (rule == "MAX1" and nd >= 2) or (rule == "NONE" and nd >= 1):
                        continue
                    keys = list(dict.fromkeys((l["player"], l["prop"], l["side"], round(float(l["line"]), 1)) for l in legs))
                    sig = (u[2], u[3], tuple(sorted(map(str, keys))))
                    if sig in seen or any(use[x] >= 2 for x in keys):
                        continue
                    seen.add(sig)
                    for x in keys:
                        use[x] += 1
                    hits, pay = SE.grade([{"hit": l.get("hit"), "factor": float(l.get("factor") or 1.0)} for l in legs], u[3], same_game=sg)
                    nleg = sum(1 for l in legs if l.get("hit") is not None)
                    taken.append((d, u, legs, pay, hits, nleg, nd))
                if len(taken) >= n:
                    break
            out += taken
        return out

    def summ(rows):
        if not rows:
            return "-"
        st = len(rows)
        pr = sum(r[3] - 1 for r in rows)
        allhit = sum(1 for r in rows if r[4] == r[5] and r[5] > 0) / st
        three = sum(1 for r in rows if r[5] >= 3 and r[4] >= r[5] - 1) / st
        by = defaultdict(float)
        for r in rows:
            by[r[0]] += r[3] - 1
        eq = peak = dd = 0.0
        run_, best = 0, 0
        for d in sorted(by):
            eq += by[d]
            peak = max(peak, eq)
            dd = max(dd, peak - eq)
            run_ = run_ + 1 if by[d] < -1e-9 else 0
            best = max(best, run_)
        return f"n{st:>4} ROI {100 * pr / st:+6.1f}%  all-hit {100 * allhit:4.1f}%  >=all-but-1 {100 * three:4.1f}%  dd {dd:5.1f}u  losing run {best:>2}"

    for n in (2, 4):
        print(f"\n{'=' * 130}\n{n} SLIPS A DAY, leg cap 2")
        for rule in ("ANY", "MAX1", "NONE"):
            for s in SEASONS:
                print(f"  {rule:<5} {s}: {summ(run(s, n, rule))}")
    print(f"\n{'=' * 130}\nTHE LIVE RULE (ANY, 2 a day) - its slips by demon count")
    for s in SEASONS:
        rows = run(s, 2, "ANY")
        for lab, f in (("0 demons", lambda r: r[6] == 0), ("1 demon", lambda r: r[6] == 1), ("2+ demons", lambda r: r[6] >= 2)):
            print(f"  {s} {lab:<10}: {summ([r for r in rows if f(r)])}")
        legs = [(l, r[1]) for r in rows for l in r[2] if l.get("hit") is not None]
        for lab, f in (("demon legs", lambda l: str(l.get('tier', 'R')).startswith('D')), ("standard legs", lambda l: str(l.get('tier', 'R')) == 'R')):
            sel = [l for l, _ in legs if f(l)]
            if sel:
                h = sum(int(l["hit"]) for l in sel) / len(sel)
                fa = sum(float(l.get("factor") or 1) for l in sel) / len(sel)
                e = sum(int(l["hit"]) * float(l.get("factor") or 1) for l in sel) / len(sel)
                print(f"  {s} {lab:<14}: n {len(sel):>4}  hit {100 * h:4.1f}%  mean factor {fa:.2f}  value e {e:.3f}")


if __name__ == "__main__":
    main()
