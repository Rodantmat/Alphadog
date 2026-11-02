#!/usr/bin/env python3
"""RESEARCH (2026-11-01, owner 19:57 PT: "For the picks no book ever price, it should have some kind of penalty, in confidence for sure,
but not sure about the final hp ... be careful that it does not damage more than help"). READ-ONLY.

QUESTION: is final_hp OVERCONFIDENT on rungs no sportsbook prices (final_hp.c_market = 0) compared with priced rungs (c_market > 0)?
final_hp never sees the books (baseline + calibration shift + board centring); c_market only lowers confidence / score. If the unpriced
legs' realised hit rate tracks final_hp as well as the priced ones', a penalty on final_hp would only damage; if they fall short (worse
at high final_hp), the size of the shortfall says how much to shrink.

For both certified seasons (and 2026-27 so far), every graded final_hp row (non-integer line, regular season), split by
  priced  c_market > 0 vs 0  x  final_hp bin  x  side  x  prop group (main / low-volume)
reports n, mean final_hp, realised hit, gap; plus the logistic calibration slope / intercept of outcome on logit(final_hp) per split
(slope < 1 = overconfident - the shrink toward 0.5 that would fix it). Then the same for the legs a strategy actually takes:
final_hp >= .58 / .60 / .62 / .65. Env: DATABASE_URL, UC_SEASONS (default 2024-25,2025-26,2026-27)."""
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

STAT = {"points": ["pts"], "rebounds": ["reb"], "assists": ["ast"], "threes_made": ["fg3m"], "pra": ["pts", "reb", "ast"],
        "pts_reb": ["pts", "reb"], "pts_ast": ["pts", "ast"], "reb_ast": ["reb", "ast"], "steals": ["stl"], "blocks": ["blk"],
        "turnovers": ["tov"], "stocks": ["stl", "blk"]}
LOW = {"steals", "blocks", "turnovers", "stocks"}
BINS = [0, .40, .45, .50, .55, .58, .60, .62, .65, .70, .75, .80, 1.0]


def fit(p, y):
    """logistic y ~ a + b logit(p), Newton; returns (a, b)"""
    p = np.clip(p, 1e-4, 1 - 1e-4)
    x = np.log(p / (1 - p))
    X = np.c_[np.ones_like(x), x]
    w = np.array([0.0, 1.0])
    for _ in range(25):
        z = X @ w
        mu = 1 / (1 + np.exp(-z))
        g = X.T @ (y - mu)
        H = (X * (mu * (1 - mu))[:, None]).T @ X
        step = np.linalg.solve(H + 1e-9 * np.eye(2), g)
        w += step
        if np.abs(step).max() < 1e-8:
            break
    return w


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    seasons = (os.environ.get("UC_SEASONS") or "2024-25,2025-26,2026-27").split(",")
    for season in seasons:
        dates = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_score.final_hp WHERE season=%s AND game_id LIKE '002%%'
                                               ORDER BY 1""", (season,)).fetchall()]
        if not dates:
            print(f"{season}: no final_hp rows", flush=True); continue
        parts = []
        for i in range(0, len(dates), 15):
            chunk = dates[i:i + 15]
            f = pd.read_sql("""SELECT f.player_id::text pid, f.game_id, f.prop, f.line::float line, f.side, f.final_hp::float hp,
                                      coalesce(f.c_market, 0)::float cm, f.ladder_offset lo,
                                      g.pts, g.reb, g.ast, g.fg3m, g.stl, g.blk, g.tov, g.min::float mn
                               FROM nba_score.final_hp f JOIN nba_stats.player_game_log g
                                 ON g.game_id = f.game_id AND g.nba_player_id = f.player_id::bigint
                               WHERE f.game_date = ANY(%s::date[]) AND f.final_hp IS NOT NULL AND f.prop = ANY(%s)""",
                            conn, params=(chunk, list(STAT)))
            if f.empty:
                continue
            f = f[(f["line"] % 1 != 0) & (f["mn"].fillna(0) > 0)]
            val = np.zeros(len(f))
            for prop, cols in STAT.items():
                m = (f["prop"] == prop).values
                if m.any():
                    val[m] = f.loc[m, cols].astype(float).sum(axis=1).values
            over = (val > f["line"].values).astype(float)
            f = f.assign(y=np.where(f["side"].values == "Over", over, 1 - over), low=f["prop"].isin(LOW).values,
                         priced=(f["cm"].values > 0))
            parts.append(f[["prop", "side", "hp", "y", "low", "priced", "lo", "cm"]])
        d = pd.concat(parts, ignore_index=True)
        print("=" * 150 + f"\n{season}: {len(d):,} graded final_hp legs | priced {d['priced'].mean():.1%}", flush=True)
        d["bin"] = pd.cut(d["hp"], BINS)
        for grp_name, g in (("ALL", d), ("main props", d[~d["low"]]), ("low-volume props", d[d["low"]]),
                            ("anchor rung (ladder_offset 0)", d[d["lo"].fillna(0) == 0])):
            print(f"\n  {season} | {grp_name}")
            for pr in (True, False):
                x = g[g["priced"] == pr]
                if len(x) < 500:
                    print(f"    {'priced  ' if pr else 'UNPRICED'} n={len(x)} (too few)"); continue
                a, b = fit(x["hp"].values, x["y"].values)
                print(f"    {'priced  ' if pr else 'UNPRICED'} n={len(x):8,d} mean hp {x['hp'].mean():.3f} realised {x['y'].mean():.3f} "
                      f"gap {x['y'].mean() - x['hp'].mean():+.3f} | calibration slope {b:.3f} intercept {a:+.3f}", flush=True)
                rows = []
                for bn, xb in x.groupby("bin", observed=True):
                    if len(xb) >= 200:
                        rows.append(f"{bn.left:.2f}-{bn.right:.2f}: n {len(xb):,} hp {xb['hp'].mean():.3f} hit {xb['y'].mean():.3f} ({xb['y'].mean() - xb['hp'].mean():+.3f})")
                print("      " + "\n      ".join(rows), flush=True)
            for fl in (0.58, 0.60, 0.62, 0.65):
                s = []
                for pr in (True, False):
                    x = g[(g["priced"] == pr) & (g["hp"] >= fl)]
                    if len(x):
                        s.append(f"{'priced' if pr else 'UNPRICED'} n {len(x):,} hp {x['hp'].mean():.3f} hit {x['y'].mean():.3f} gap {x['y'].mean() - x['hp'].mean():+.3f}")
                print(f"    final_hp >= {fl:.2f}: " + " | ".join(s), flush=True)
        # per prop, the strategy zone (final_hp >= .60): does any prop's unpriced legs fall short?
        print(f"\n  {season} | per prop, final_hp >= .60, gap = realised - mean hp (priced / UNPRICED)")
        for prop in STAT:
            s = []
            for pr in (True, False):
                x = d[(d["prop"] == prop) & (d["priced"] == pr) & (d["hp"] >= 0.60)]
                s.append(f"{'pr' if pr else 'UN'} n {len(x):6,d} gap {x['y'].mean() - x['hp'].mean():+.3f}" if len(x) >= 100 else f"{'pr' if pr else 'UN'} n {len(x):6,d}")
            print(f"    {prop:12s} " + " | ".join(s), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
