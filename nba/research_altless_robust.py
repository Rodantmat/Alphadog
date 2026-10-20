#!/usr/bin/env python3
"""
ROBUSTNESS OF THE GOBLIN / DEMON LESS 5-PICK RULES (2026-10-20, follow-up of research_altless_strategies.py run 39515299034).
READ-ONLY.

The fixed rule that held in BOTH seasons: 5 picks of goblin + demon Less, depth rmin <= N (N 1, 2, 3), Power and Flex
(Power +97 / +89% and +126 / +71%, Flex +60 / +58% and +64 / +50%), with a bootstrap 5th percentile below zero (variance: Power
pays on ~4% of days). Before anything is paper-traded, how fragile is it?
  1  PRICE: the Less complement S in 0.97 / 0.99 / 1.00 and the conservative margin 3% / 0% / 6% (PrizePicks' own pairs: S median
     0.991, range 0.949-1.005).
  2  OPEN BAND: which rungs PrizePicks opens to Less - quote-level More p in 0.30-0.70 (measured) vs 0.35-0.65 and 0.25-0.75.
  3  TIME: ROI per calendar month, max drawdown (units), longest losing-day streak, number of winning days.
  4  SIZE NEIGHBOURS: the same rule at 4 and 6 picks under each setting (a cliff at exactly 5 would be a warning).
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_altless_strategies as AS   # noqa: E402  (installs the 2-pick x 0.93 Power rule on import)
import research_exhaustive_pp as EX         # noqa: E402
import build_slip_engine as SE              # noqa: E402

SEASONS = AS.SEASONS


def price_fn(S, margin):
    def less_price(f_over, tier):
        fq = f_over * EX.QUOTE_LIFT[tier[1]]
        p_over = min(0.97, max(0.072, 0.5 / fq))
        p_under = max(0.072, S - p_over)
        raw = 0.5 / p_under
        if raw <= EX.LESS_FLOOR:
            return EX.LESS_FLOOR
        return min(6.94, max(EX.LESS_FLOOR, raw * (1 - margin)))
    return less_price


def load_raw():
    import psycopg
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("SET statement_timeout = 0")
        cur = c.execute(EX.ALT_LESS_SQL)
        cols = [x.name for x in cur.description]
        raw = [dict(zip(cols, r)) for r in cur.fetchall()]
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        EX.install_flex2_alt(c)
    for r in raw:
        ks = [r.get(k) for k in ("n_fs", "n_fh", "n_bh") if r.get(k) is not None]
        r["rmin"] = min(ks) if ks else 99
        r["grp"] = "UG" if r["tier"][1] == "G" else "UD"
        st = r["stat_actual"]
        r["hit"] = None if st is None or st == r["line"] else int(st < r["line"])
    last = {s: max(r["game_date"] for r in raw if r["season"] == s) for s in SEASONS}
    return [r for r in raw if (last[r["season"]] - r["game_date"]).days > 7]


def legs_for(raw, S, margin, pmin, pmax):
    fn = price_fn(S, margin)
    out = []
    for r in raw:
        p = 0.5 / (r["f_over"] * EX.QUOTE_LIFT[r["tier"][1]])
        if not (pmin <= p <= pmax):
            continue
        l = dict(r)
        l["factor"] = fn(r["f_over"], r["tier"])
        out.append(l)
    return out


def run_rule(legs, season, N, k, st):
    days = defaultdict(list)
    for l in legs:
        if l["season"] == season and l["rmin"] <= N:
            days[l["game_date"]].append(l)
    rows = []
    for d in sorted(days):
        c = sorted(days[d], key=lambda l: (l["rmin"], -l["factor"], l["player"]))
        sl = AS.build(c, k)
        if not sl:
            continue
        hits, pay = SE.grade(sl, st)
        rows.append((d, pay - 1.0, int(hits == k)))
    return rows


def summarize(rows):
    if not rows:
        return None
    prof = np.array([r[1] for r in rows])
    cum = np.cumsum(prof)
    dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], cum]))[1:] - cum)) if len(cum) else 0.0
    streak = best = 0
    for p in prof:
        streak = streak + 1 if p < 0 else 0
        best = max(best, streak)
    months = defaultdict(list)
    for d, p, _ in rows:
        months[str(d)[:7]].append(p)
    pos_m = sum(1 for v in months.values() if sum(v) > 0)
    return {"days": len(rows), "roi": float(prof.mean()), "wins": int((prof > 0).sum()), "full": int(sum(r[2] for r in rows)),
            "dd": dd, "streak": best, "months": f"{pos_m}/{len(months)}",
            "by_month": " ".join(f"{m[2:]}:{np.mean(v) * 100:+.0f}" for m, v in sorted(months.items()))}


def main():
    raw = load_raw()
    print(f"alternate-Less rungs (before the open band): {len(raw):,}", flush=True)
    settings = [("base S.99 m3 band.30-.70", 0.99, 0.03, 0.30, 0.70), ("S.97 (worse price)", 0.97, 0.03, 0.30, 0.70),
                ("S1.00 (better)", 1.00, 0.03, 0.30, 0.70), ("margin 0%", 0.99, 0.0, 0.30, 0.70), ("margin 6%", 0.99, 0.06, 0.30, 0.70),
                ("band .35-.65", 0.99, 0.03, 0.35, 0.65), ("band .25-.75", 0.99, 0.03, 0.25, 0.75),
                ("worst: S.97 m6 band.35-.65", 0.97, 0.06, 0.35, 0.65)]
    for label, S, m, a, b in settings:
        legs = legs_for(raw, S, m, a, b)
        print(f"\n=== {label}: {len(legs):,} legs ===", flush=True)
        for st in ("power", "flex"):
            for N in (1, 2, 3):
                for k in (4, 5, 6):
                    cells = []
                    for s in SEASONS:
                        r = summarize(run_rule(legs, s, N, k, st))
                        cells.append(f"{s} {r['roi'] * 100:+6.1f}% d{r['days']:>3} win-days {r['wins']:>3} full {r['full']:>3} maxDD {r['dd']:5.1f}u "
                                     f"lose-streak {r['streak']:>2} +months {r['months']}" if r else f"{s} n/a")
                    print(f"  {st:<5} N{N} {k}p | " + " | ".join(cells), flush=True)
    # month detail for the headline rules under the base setting
    legs = legs_for(raw, 0.99, 0.03, 0.30, 0.70)
    print("\n=== MONTH BY MONTH (base setting), ROI % per month ===", flush=True)
    for st in ("power", "flex"):
        for N in (1, 2):
            for s in SEASONS:
                r = summarize(run_rule(legs, s, N, 5, st))
                if r:
                    print(f"  {st:<5} N{N} 5p {s}: {r['by_month']}", flush=True)


if __name__ == "__main__":
    main()
