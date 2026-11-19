#!/usr/bin/env python3
"""
S6b - UNDERDOG REGULAR UNDERS: the one lead of the honest rebuild, as slips. READ-ONLY. (NBA_HONEST_REBUILD.md section 8f / 8g)
Lead: Underdog regular (1.0x) Under legs ranked by the system hit above the 0.5345 break-even early in the season (honest baseline top tenth, Oct-Nov:
0.529 / 0.557 / 0.594 over three seasons; production final_hp this season, top fifth: 0.580 on 897 legs).
This script turns the lead into slips with Underdog's REAL tables and reports every structure, honest inputs only:
  score   'ph'  = honest baseline (nba_score.baseline_history_h) - three seasons
          'p'   = production final_hp as stored on the day (nba_score._lr_app_legs) - THIS SEASON ONLY (history copies carry the look-ahead)
  pool    each slate: regular Under legs, one per player (his best score), top UN_TOP by score (6, 8, 10, 12, 16, 20, 30)
  slips   UN_SLIPS a slate (1, 2, 3, 5), no leg reused across slips of a slate, at most 2 legs of one game in a slip; legs dealt round-robin by rank
  tables  Power ("standard") 2: 3.5x, 3: 6.5x, 4: 12x, 5: 20x, 6: 35x ; Flex 3: 3.25 / 1.09, 4: 7.2 / 1.4, 5: 10 / 2.5, 6: 25 / 2.6 / 0.25
          (owner rule: Underdog plays no Power above 2 picks - the larger Power sizes are reported for completeness only)
Per (score, period, pool, slips a slate, structure): slips, leg hit rate, ROI with 90% range (re-drawing slates), units, max drawdown (units), longest run
of slates without a winning slip. Periods: each season, and Oct-Nov / Dec-Jan / Feb+ of each season.
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 7.2, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
TOPS = (6, 8, 10, 12, 16, 20, 30); NSL = (1, 2, 3, 5)
STRUCTS = [("power", k) for k in range(2, 7)] + [("flex", k) for k in range(3, 7)]
rng = np.random.default_rng(23)


def pay(hits, k, st):
    return (STD[k] if hits == k else 0.0) if st == "power" else FLEX.get((k, k - hits), 0.0)


def breakeven(st, k):
    from math import comb
    lo, hi = .3, .9
    for _ in range(50):
        p = (lo + hi) / 2; ev = sum(comb(k, h) * p ** h * (1 - p) ** (k - h) * pay(h, k, st) for h in range(k + 1))
        lo, hi = (p, hi) if ev < 1 else (lo, p)
    return (lo + hi) / 2


def phase(gd):
    m = int(gd[5:7]); return "Oct-Nov" if m in (10, 11) else "Dec-Jan" if m in (12, 1) else "Feb+"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    h = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, line::float8 line, hit::int hit, ph::float8 ph FROM nba_score._lr_legs_h
                       WHERE app = 'underdog' AND kind = 'R' AND m BETWEEN 1.86 AND 1.88 AND lower(left(side, 1)) NOT IN ('o', 'h', 'm') AND hit IS NOT NULL""", conn)
    a = pd.read_sql("""SELECT game_date::text gd, player player_id, prop, line::float8 line, p::float8 p FROM nba_score._lr_app_legs
                       WHERE app = 'underdog' AND left(tier, 1) = 'R' AND season = '2026-27' AND lower(left(side, 1)) NOT IN ('o', 'h', 'm') AND p IS NOT NULL""", conn)
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'", conn)
    conn.close()
    h = h.merge(a.drop_duplicates(["gd", "player_id", "prop", "line"]), on=["gd", "player_id", "prop", "line"], how="left")
    h = h.merge(gl.drop_duplicates(["player_id", "gd"]), on=["player_id", "gd"], how="left"); h["game_id"] = h["game_id"].fillna("g" + h["player_id"])
    print(f"UN|Underdog regular Under legs {len(h):,} on {h['gd'].nunique()} slates; hit {h['hit'].mean():.3f}; with honest baseline {100 * h['ph'].notna().mean():.0f}%; "
          f"with stored production number (this season) {int(h['p'].notna().sum()):,}", flush=True)
    print("UN|break-even per leg: " + ", ".join(f"{k}-pick {st} {breakeven(st, k):.4f}" for st, k in STRUCTS), flush=True)
    for score in ("ph", "p"):
        d = h[h[score].notna()].copy()
        if not len(d):
            continue
        pools = {}                                           # slate -> legs sorted by score, one per player
        for gd, g in d.groupby("gd"):
            g = g.sort_values(score, ascending=False).drop_duplicates("player_id")
            pools[gd] = (g["hit"].values, g["game_id"].values, g["season"].iloc[0])
        print(f"\nUN|================ score = {'honest baseline (three seasons)' if score == 'ph' else 'production final_hp, THIS SEASON ONLY (29 slates)'} ================", flush=True)
        print("UN|leg hit rate of the pool by size and period:", flush=True)
        pers = sorted({(s, ph_) for gd, (_, _, s) in pools.items() for ph_ in ("ALL", phase(gd))})
        for top in TOPS:
            cells = []
            for s, ph_ in pers:
                hs = np.concatenate([x[0][:top] for gd, x in pools.items() if x[2] == s and (ph_ == "ALL" or phase(gd) == ph_)] or [np.array([])])
                if len(hs) >= 50:
                    cells.append(f"{s} {ph_} {hs.mean():.3f} (n {len(hs):,})")
            print(f"UN|  top {top:2d}: " + " | ".join(cells), flush=True)
        print("UN|slips: period | top | slips a slate | structure | slips | leg hit | ROI [90% range] | units | max drawdown | longest slates without a win", flush=True)
        best = defaultdict(list)
        for top in TOPS:
            for ns in NSL:
                for st, k in STRUCTS:
                    if k * ns > top:
                        continue
                    per_day = {}                             # slate -> list of (payout, hits)
                    for gd, (hit, game, s) in pools.items():
                        hh, gg = hit[:top], game[:top]
                        if len(hh) < k * ns:
                            continue
                        slips = [[] for _ in range(ns)]; left = []
                        for i in range(len(hh)):             # round-robin deal by rank, at most 2 legs of one game in a slip
                            placed = False
                            for j in sorted(range(ns), key=lambda j_: (len(slips[j_]), (j_ - i) % ns)):
                                if len(slips[j]) < k and sum(1 for q in slips[j] if gg[q] == gg[i]) < 2:
                                    slips[j].append(i); placed = True; break
                            if not placed:
                                left.append(i)
                        out = [(pay(int(hh[sl].sum()), k, st), int(hh[sl].sum())) for sl in slips if len(sl) == k]
                        if out:
                            per_day[gd] = (out, s)
                    for s, ph_ in pers:
                        gds = sorted(g for g, v in per_day.items() if v[1] == s and (ph_ == "ALL" or phase(g) == ph_))
                        if len(gds) < 10:
                            continue
                        prof = np.array([sum(p_ - 1 for p_, _ in per_day[g][0]) for g in gds]); n = np.array([len(per_day[g][0]) for g in gds])
                        hits = sum(h_ for g in gds for _, h_ in per_day[g][0]); roi = prof.sum() / n.sum()
                        bs = []
                        for _ in range(300):
                            ix = rng.integers(len(gds), size=len(gds)); bs.append(prof[ix].sum() / n[ix].sum())
                        cum = np.cumsum(prof); dd = float((np.maximum.accumulate(np.concatenate([[0], cum])) - np.concatenate([[0], cum])).max())
                        win = np.array([any(p_ > 1 for p_, _ in per_day[g][0]) for g in gds]); dr = 0; cur = 0
                        for w in win:
                            cur = 0 if w else cur + 1; dr = max(dr, cur)
                        lo, hi = np.quantile(bs, .05), np.quantile(bs, .95)
                        line = (f"UN|  {s} {ph_:7s} | top {top:2d} | {ns} a slate | {k}-pick {st:5s} | slips {int(n.sum()):5,} | leg hit {hits / (k * n.sum()):.3f} | ROI {100 * roi:+6.1f}% [{100 * lo:+.1f}% .. {100 * hi:+.1f}%] | "
                                f"units {prof.sum():+7.1f} | drawdown {dd:5.1f} | drought {dr}")
                        best[(s, ph_)].append((roi, lo, line))
                        if ph_ == "ALL" and ns in (1, 3) and top in (8, 12, 20):
                            print(line, flush=True)
        print("UN|--- per period: the 6 best by the LOW end of the range (steady first), any pool / count / structure ---", flush=True)
        for key in sorted(best):
            for roi, lo, line in sorted(best[key], key=lambda x: -x[1])[:6]:
                print(line.replace("UN|  ", "UN|B "), flush=True)
    print("UN|DONE", flush=True)


if __name__ == "__main__":
    main()
