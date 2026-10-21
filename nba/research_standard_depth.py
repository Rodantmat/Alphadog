#!/usr/bin/env python3
"""
REGULAR (STANDARD) LINES - WHICH SIDE, WHICH DEPTH, AND 2-PICK FLEX (2026-10-20, owner: "pick flex on regular lines ... all regular
lines ... they still get 50% back, and if he wins, it's the double. So a bunch of two picks is not a bad idea ... find which
percentage of the legs have less or more that hits more often, that's not a coin flip, and which depth, like top 2, top 5, top 10,
top 30 ... the best way to track might be trailing"). READ-ONLY.

PAYOUT ARITHMETIC (certified grader v3, standard legs pay the plain table): per-leg hit rate p, independent legs ->
  2-pick Flex  2x / 0.5x: EV = 2p^2 + 0.5 * 2p(1-p) = p^2 + p -> breakeven p = 0.618
  2-pick Power 3x:        EV = 3p^2                   -> breakeven p = 0.577
  (3-pick Power 0.550, Flex 0.577; 4-pick Power 0.562, Flex 0.550; 5-pick Power 0.549, Flex 0.543; 6-pick Power 0.547, Flex 0.542)
  - computed exactly from SE.POWER / SE.FLEX and printed at the top of the run.
So 2-pick Flex needs the HIGHER leg rate of the two; it buys a smaller swing, not a better price.

DATA: every standard PrizePicks window leg of both seasons (nba_score.tier_map_legs tier R, both sides, graded; the certified
leg table), its three model scores (final_hp, baseline_hp, final_score), game and team from prop_universe.
PART 1 LEG RATES: per prop x side x rank key x depth (top 1/2/3/5/10/20/30/all per day, ranked within prop + side by that key's score)
  -> n and hit rate per season; then all props pooled per side and both sides. A cell is flagged when BOTH seasons clear a breakeven.
PART 2 FIXED SLIP RULES (no fitting): pooled across props, per rank key, depth = top N per (prop, side) per day, legs ordered by score;
  sizes 2-6, Power and Flex; for 2 picks also M = 3, 5 disjoint 2-pick slips a day ("a bunch of two picks").
PART 3 CROSS-SEASON: cells (prop, side, key, depth) chosen on one season's leg rate (>= the size's breakeven + 1 pt, n >= 150),
  then slips built from ONLY those cells on the OTHER season - the out-of-sample number.
PART 4 TRAILING SELECTOR: each day, cells whose trailing W-day leg rate (W 30 / 60, n >= 40, strictly before the day) clears the
  breakeven + margin are live that day; slips from live cells only. Forward-walk, no look-ahead.
Rules: one leg per player, <= 2 legs per game, >= 2 teams; voids revert by the certified grader. Env: DATABASE_URL.
"""
import bisect
import os
import sys
from collections import defaultdict
from datetime import timedelta
from itertools import product

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE   # noqa: E402

SEASONS = ("2024-25", "2025-26")
KEYS = ("final_hp", "baseline_hp", "final_score")
DEPTHS = (1, 2, 3, 5, 10, 20, 30, 999)
MAX_SG = 2
BOOT = 2000

SQL = """
WITH l AS (
  SELECT season, game_date, player, prop, side, line,
         max(hit) hit,
         max(score) FILTER (WHERE rank_key = 'final_hp') s_fh,
         max(score) FILTER (WHERE rank_key = 'baseline_hp') s_bh,
         max(score) FILTER (WHERE rank_key = 'final_score') s_fs
  FROM nba_score.tier_map_legs WHERE tier = 'R' GROUP BY 1, 2, 3, 4, 5, 6)
SELECT l.season, l.game_date, l.player, l.prop, l.side, l.line::float8, l.hit, l.s_fh, l.s_bh, l.s_fs,
       max(pu.team_id) team_id, max(pu.event_id) event_id
FROM l JOIN nba_market.prop_universe pu ON pu.game_date = l.game_date AND pu.player = l.player AND pu.prop = l.prop AND pu.side = l.side
 AND pu.line = l.line AND pu.line_source = 'real'
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
"""
SK = {"final_hp": "s_fh", "baseline_hp": "s_bh", "final_score": "s_fs"}


def ev(k, st, p):
    from math import comb
    if st == "power":
        return SE.POWER[k] * p ** k
    return sum(SE.FLEX.get((k, h), 0.0) * comb(k, h) * p ** h * (1 - p) ** (k - h) for h in range(k + 1))


def breakeven(k, st):
    lo, hi = 0.3, 0.9
    for _ in range(60):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if ev(k, st, m) < 1 else (lo, m)
    return (lo + hi) / 2


BE = {(k, st): breakeven(k, st) for k in (2, 3, 4, 5, 6) for st in ("power", "flex")}


def load():
    import psycopg
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("SET statement_timeout = 0")
        c.execute("SET jit = off")
        cur = c.execute(SQL)
        cols = [x.name for x in cur.description]
        legs = [dict(zip(cols, r)) for r in cur.fetchall()]
    for l in legs:
        l["hit"] = None if l["hit"] is None else int(l["hit"])
        l["factor"] = 1.0
    # per-day rank within (prop, side) for each key (1 = highest score = most confident for that side)
    grp = defaultdict(list)
    for l in legs:
        grp[(l["game_date"], l["prop"], l["side"])].append(l)
    for g in grp.values():
        for k in KEYS:
            sk = SK[k]
            for i, x in enumerate(sorted(g, key=lambda x: (-(x[sk] if x[sk] is not None else -9), x["player"], x["line"])), 1):
                x["r_" + k] = i if x[sk] is not None else 9999
    return legs


def build(cands, k, used):
    games, slip = defaultdict(int), []
    for l in cands:
        if l["player"] in used or games[l["event_id"]] >= MAX_SG:
            continue
        slip.append(l)
        used.add(l["player"])
        games[l["event_id"]] += 1
        if len(slip) == k:
            break
    if len(slip) < k or len({l["team_id"] for l in slip}) < 2:
        for l in slip:
            used.discard(l["player"])
        return None
    return slip


def run(days, k, st, m=1):
    prof, full, nd = [], 0, 0
    for d in sorted(days):
        c = days[d]
        used = set()
        any_ = False
        for _ in range(m):
            sl = build(c, k, used)
            if not sl:
                break
            hits, pay = SE.grade(sl, st)
            prof.append(pay - 1.0)
            full += int(hits == k)
            any_ = True
        nd += int(any_)
    if not prof:
        return None
    p = np.array(prof)
    lb = None
    if len(p) >= 10:
        rng = np.random.default_rng(7)
        idx = rng.integers(0, len(p), size=(BOOT, len(p)))
        lb = float(np.percentile(p[idx].mean(1), 5))
    return {"n": len(p), "days": nd, "roi": float(p.mean()), "lb": lb, "full": full}


def fmt(r):
    if not r:
        return "   n/a                       "
    return f"{r['roi'] * 100:+6.1f}% n{r['n']:>4} LB5 {('%+.1f%%' % (r['lb'] * 100)) if r['lb'] is not None else '  -  '} full {r['full']:>3}"


def rate(ls):
    h = [l["hit"] for l in ls if l["hit"] is not None]
    return (len(h), float(np.mean(h)) if h else float("nan"))


def main():
    legs = load()
    print(f"standard legs (both sides, graded): {len(legs):,}", flush=True)
    print("BREAKEVEN leg rate per structure: " + " ".join(f"{k}{st[0].upper()} {BE[(k, st)]:.3f}" for k, st in sorted(BE)), flush=True)
    by_season = {s: [l for l in legs if l["season"] == s] for s in SEASONS}

    # PART 1 - leg rates
    print("\n=== PART 1: LEG HIT RATE by prop x side x key x depth (both seasons) - flag: P2 = both >= 0.577, F2 = both >= 0.618 ===",
          flush=True)
    props = sorted({l["prop"] for l in legs})
    acc = defaultdict(lambda: [0, 0])                      # (season, prop, side, key, D) -> [n, hits]
    for l in legs:
        if l["hit"] is None:
            continue
        for key in KEYS:
            r = l["r_" + key]
            for D in DEPTHS:
                if r <= D:
                    for pp, sd in ((l["prop"], l["side"]), ("ALL", l["side"]), (l["prop"], "both"), ("ALL", "both")):
                        a_ = acc[(l["season"], pp, sd, key, D)]
                        a_[0] += 1
                        a_[1] += l["hit"]
    cellrate = {kk: (v[0], v[1] / v[0] if v[0] else float("nan")) for kk, v in acc.items()}
    for prop, side, key in product(props + ["ALL"], ("Over", "Under", "both"), KEYS):
        line = []
        for D in DEPTHS:
            vals = [cellrate.get((s_, prop, side, key, D), (0, float("nan"))) for s_ in SEASONS]
            mn = min(v[1] for v in vals)
            flag = "F2" if mn >= 0.618 else ("P2" if mn >= 0.577 else ("55" if mn >= 0.55 else "  "))
            line.append(f"top{D if D < 999 else 'all'}:{vals[0][1]:.3f}/{vals[1][1]:.3f}(n{vals[0][0]}/{vals[1][0]}){flag}")
        print(f"  {prop:<12} {side:<5} {key:<11} | " + " ".join(line), flush=True)

    # PART 2 - fixed pooled rules
    print("\n=== PART 2: FIXED POOLED RULES - all props, top-N per (prop, side) per day, legs by score; ROI per slip ===", flush=True)
    for key in KEYS:
        for side in ("Over", "Under", "both"):
            for D in (1, 2, 3, 5, 10):
                sk = SK[key]
                for s in SEASONS:
                    days = defaultdict(list)
                    for l in by_season[s]:
                        if l["r_" + key] <= D and (side == "both" or l["side"] == side):
                            days[l["game_date"]].append(l)
                    for d in days:
                        days[d].sort(key=lambda l: (-l[sk], l["player"]))
                    cells = []
                    for k in (2, 3, 4, 5, 6):
                        for st in ("power", "flex"):
                            cells.append(f"{k}{st[0].upper()} {fmt(run(days, k, st))}")
                    cells.append(f"2F x3 {fmt(run(days, 2, 'flex', 3))}")
                    cells.append(f"2F x5 {fmt(run(days, 2, 'flex', 5))}")
                    cells.append(f"2P x3 {fmt(run(days, 2, 'power', 3))}")
                    print(f"  {key:<11} {side:<5} top{D:<2} {s} | " + " | ".join(cells), flush=True)

    # PART 3 - cross-season cells
    print("\n=== PART 3: CROSS-SEASON - cells picked on one season's leg rate (>= breakeven + 1 pt, n >= 150), slips on the other ===",
          flush=True)
    for train, test in ((SEASONS[0], SEASONS[1]), (SEASONS[1], SEASONS[0])):
        for k in (2, 3, 4, 5, 6):
            for st in ("power", "flex"):
                be = BE[(k, st)] + 0.01
                chosen = []
                for prop in props:
                    for side in ("Over", "Under"):
                        best = None
                        for key in KEYS:
                            for D in DEPTHS[:-1]:
                                n, hr = cellrate.get((train, prop, side, key, D), (0, 0.0))
                                if n >= 150 and hr >= be and (best is None or D > best[1] or (D == best[1] and hr > best[2])):
                                    best = (key, D, hr)
                        if best:
                            chosen.append((prop, side) + best)
                days = defaultdict(list)
                ch = {(c[0], c[1]): c[2:] for c in chosen}
                for l in by_season[test]:
                    c = ch.get((l["prop"], l["side"]))
                    if c and l["r_" + c[0]] <= c[1]:
                        days[l["game_date"]].append(dict(l, _hr=c[2]))
                for d in days:
                    days[d].sort(key=lambda l: (-l["_hr"], l["player"]))
                n, hr = rate([l for v in days.values() for l in v])
                res = run(days, k, st)
                res3 = run(days, 2, st, 3) if k == 2 else None
                print(f"  train {train} -> test {test} {k}{st[0].upper()} (BE {BE[(k, st)]:.3f}): {len(chosen)} cells, test legs {n} rate "
                      f"{hr:.3f} | {fmt(res)}" + (f" | x3 {fmt(res3)}" if res3 else ""), flush=True)
                if k == 2 and st == "flex":
                    print("     cells: " + "; ".join(f"{p}/{s[0]}/{kk}/top{D} {h:.3f}" for p, s, kk, D, h in chosen), flush=True)

    # PART 4 - trailing selector
    print("\n=== PART 4: TRAILING SELECTOR - cells live when their trailing W-day leg rate (before the day) >= breakeven + margin ===",
          flush=True)
    all_dates = sorted({l["game_date"] for l in legs})
    di = {d: i for i, d in enumerate(all_dates)}
    cells = sorted({(l["prop"], l["side"], key, D) for l in legs for key in KEYS for D in (2, 5, 10)})
    ci = {c: i for i, c in enumerate(cells)}
    N = np.zeros((len(cells), len(all_dates)))
    H = np.zeros((len(cells), len(all_dates)))
    for l in legs:
        if l["hit"] is None:
            continue
        for key in KEYS:
            for D in (2, 5, 10):
                if l["r_" + key] <= D:
                    i = ci[(l["prop"], l["side"], key, D)]
                    N[i, di[l["game_date"]]] += 1
                    H[i, di[l["game_date"]]] += l["hit"]
    cN = np.concatenate([np.zeros((len(cells), 1)), np.cumsum(N, 1)], 1)    # cN[:, j] = total over dates before index j
    cH = np.concatenate([np.zeros((len(cells), 1)), np.cumsum(H, 1)], 1)
    idx = defaultdict(list)
    for l in legs:
        idx[l["game_date"]].append(l)
    for W in (30, 60):
        trail = {}
        for j, d in enumerate(all_dates):
            lo = bisect.bisect_left(all_dates, d - timedelta(days=W))         # dates in [d - W, d), strictly before the day
            n = cN[:, j] - cN[:, lo]
            h = cH[:, j] - cH[:, lo]
            trail[d] = (n, np.divide(h, n, out=np.zeros_like(h), where=n > 0))
        for margin in (0.0, 0.02):
            for k, st in ((2, "flex"), (2, "power"), (3, "power"), (3, "flex"), (4, "power"), (4, "flex"), (5, "power"), (5, "flex"),
                          (6, "power"), (6, "flex")):
                be = BE[(k, st)] + margin
                out = []
                for s_ in SEASONS:
                    days = {}
                    for d in sorted({l["game_date"] for l in by_season[s_]}):
                        n, r = trail[d]
                        live = {cells[i]: float(r[i]) for i in np.nonzero((n >= 40) & (r >= be))[0]}
                        if not live:
                            continue
                        cand = []
                        for l in idx[d]:
                            best = None
                            for key in KEYS:
                                for D in (2, 5, 10):
                                    hr = live.get((l["prop"], l["side"], key, D))
                                    if hr is not None and l["r_" + key] <= D and (best is None or hr > best):
                                        best = hr
                            if best is not None:
                                cand.append(dict(l, _hr=best))
                        if cand:
                            days[d] = sorted(cand, key=lambda l: (-l["_hr"], l["player"]))
                    out.append(f"{s_} {fmt(run(days, k, st))}" + (f" x3 {fmt(run(days, 2, st, 3))}" if k == 2 else ""))
                print(f"  W{W} +{margin:.2f} {k}{st[0].upper()} (BE {BE[(k, st)]:.3f}) | " + " | ".join(out), flush=True)


if __name__ == "__main__":
    main()
