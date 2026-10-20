#!/usr/bin/env python3
"""
CAN WE RECONSTRUCT PRIZEPICKS' STANDARD LINE FROM BOX SCORES? (2026-10-20, owner: "derive ... what PrizePicks offers ... a reliable
derived simulation" for props whose PrizePicks lines were never archived - two-pointers, combos, quarters, FG / FT attempts ...).
READ-ONLY.

Why this comes first. An edge exists only against the line PrizePicks actually posts. For the props we never archived, the line
must be rebuilt. The method is trusted only if it rebuilds the lines we DO have: points, rebounds, assists, PRA, combos-of-stats,
threes, steals, blocks, turnovers (nba_market.prop_universe, line_source 'real', 2024-25 and 2025-26).

Method (per prop; fit on one season, scored on the other, both directions):
  features from the player's own games BEFORE the date (regular season, cross-season carry): EWMA of the stat (alpha 0.15),
  last-10 mean, season-to-date mean (games so far this season, 0 if none), prior-season mean, EWMA minutes; plus the same
  features x a season-start flag (first 10 games).
  model: line = OLS on the features (intercept), then rounded to PrizePicks' grid (x.5).
Scores: MAE vs the real line, share within 0.5 / 1.0, mean signed error, and the decisive one - the OVER BASE RATE at the
rebuilt line vs at the real line (if the rebuilt lines are as hard as PrizePicks', the two rates match), plus the agreement of
the hit at the two lines leg by leg.
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

STAT = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk",
        "turnovers": "tov", "pra": "pra", "pts_reb": "pr", "pts_ast": "pa", "reb_ast": "ra", "stocks": "stk"}


def load():
    url = os.environ["DATABASE_URL"]
    with psycopg.connect(url) as c:
        c.execute("SET statement_timeout = 0")
        gl = pd.read_sql("""SELECT nba_player_id::bigint pid, game_date, season, min::float min, pts::float pts, reb::float reb, ast::float ast,
                                   fg3m::float fg3m, stl::float stl, blk::float blk, tov::float tov
                            FROM nba_stats.player_game_log WHERE min > 0 AND season IN ('2023-24', '2024-25', '2025-26')""", c)
        ln = pd.read_sql("""SELECT player_id::bigint pid, game_date, prop, percentile_disc(0.5) WITHIN GROUP (ORDER BY line)::float line,
                                   max(stat_actual)::float actual, max(season) season
                            FROM nba_market.prop_universe WHERE line_source = 'real' AND kind = 'standard' AND side = 'Over'
                              AND player_id ~ '^[0-9]+$' GROUP BY 1, 2, 3""", c)
    return gl, ln


def features(gl):
    gl = gl.sort_values(["pid", "game_date"]).copy()
    gl["pra"] = gl.pts + gl.reb + gl.ast
    gl["pr"] = gl.pts + gl.reb
    gl["pa"] = gl.pts + gl.ast
    gl["ra"] = gl.reb + gl.ast
    gl["stk"] = gl.stl + gl.blk
    g = gl.groupby("pid")
    gs = gl.groupby(["pid", "season"])
    out = gl[["pid", "game_date", "season"]].copy()
    out["n_season"] = gs.cumcount()
    out["min_ewm"] = g["min"].transform(lambda s: s.shift(1).ewm(alpha=0.15, adjust=False).mean())
    for col in ["pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra", "pr", "pa", "ra", "stk"]:
        out[f"{col}_ewm"] = g[col].transform(lambda s: s.shift(1).ewm(alpha=0.15, adjust=False).mean())
        out[f"{col}_l10"] = g[col].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        out[f"{col}_std"] = gs[col].transform(lambda s: s.shift(1).expanding().mean())
        sm = gl.groupby(["pid", "season"])[col].mean().rename(f"{col}_seasonmean").reset_index()
        sm["season_next"] = sm["season"].map({"2023-24": "2024-25", "2024-25": "2025-26", "2025-26": "2026-27"})
        out = out.merge(sm[["pid", "season_next", f"{col}_seasonmean"]].rename(columns={"season_next": "season", f"{col}_seasonmean": f"{col}_prev"}),
                        on=["pid", "season"], how="left")
    return out


def main():
    gl, ln = load()
    print(f"game logs {len(gl):,}; real PrizePicks standard lines {len(ln):,}", flush=True)
    ft = features(gl)
    df = ln.merge(ft.drop(columns=["season"]), on=["pid", "game_date"], how="inner")
    print(f"lines with a box-score history row {len(df):,}", flush=True)
    rows = []
    for prop, col in STAT.items():
        d = df[df.prop == prop].copy()
        if len(d) < 500:
            continue
        early = (d.n_season < 10).astype(float)
        X = pd.DataFrame({"ewm": d[f"{col}_ewm"], "l10": d[f"{col}_l10"], "std": d[f"{col}_std"].fillna(0), "has_std": (d.n_season > 0).astype(float),
                          "prev": d[f"{col}_prev"].fillna(d[f"{col}_ewm"]), "min": d.min_ewm})
        X["early_ewm"] = early * X["ewm"]
        X["early_prev"] = early * X["prev"]
        ok = X.notna().all(axis=1) & d.line.notna()
        d, X = d[ok], X[ok]
        for tr, te in (("2024-25", "2025-26"), ("2025-26", "2024-25")):
            a, b = (d.season == tr).values, (d.season == te).values
            if a.sum() < 300 or b.sum() < 300:
                continue
            A = np.c_[np.ones(a.sum()), X[a].values]
            beta, *_ = np.linalg.lstsq(A, d.line[a].values, rcond=None)
            pred = np.c_[np.ones(b.sum()), X[b].values] @ beta
            recon = np.floor(pred) + 0.5                      # PrizePicks' grid
            real = d.line[b].values
            act = d.actual[b].values
            err = recon - real
            hit_real = (act > real)
            hit_rec = (act > recon)
            rows.append({"prop": prop, "train": tr, "test": te, "n": int(b.sum()), "mae": float(np.mean(np.abs(err))),
                         "within_0.5": float(np.mean(np.abs(err) <= 0.5)), "within_1": float(np.mean(np.abs(err) <= 1.0)),
                         "bias": float(np.mean(err)), "over_rate_real": float(np.mean(hit_real)), "over_rate_rebuilt": float(np.mean(hit_rec)),
                         "same_outcome": float(np.mean(hit_real == hit_rec)), "mean_line": float(np.mean(real))})
    r = pd.DataFrame(rows)
    pd.set_option("display.width", 250)
    print("\nRECONSTRUCTION OF PRIZEPICKS' STANDARD LINE (fit one season, scored on the other):")
    print(r.round(3).to_string(index=False))
    print("\nReading: over_rate_rebuilt close to over_rate_real = the rebuilt lines are as hard as PrizePicks'; same_outcome = the share of "
          "legs whose More/Less result is identical at the two lines (1.0 = indistinguishable for grading).")


if __name__ == "__main__":
    main()
