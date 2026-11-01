#!/usr/bin/env python3
"""RESEARCH (2026-11-01, owner: "The starter should be being used some way, research, debug, understand and fix accordingly"). READ-ONLY.

Fact 82 rejected a PROJECTED-lineup flag as redundant: recent-5 minutes already encodes who starts, with magnitude. That argument has a
gap - a ROLLING average LAGS a role change. Measured 2026-11-01 (SQL, both certified seasons): baseline proj_min vs actual minutes by
the AS-OF starter pattern (prior games only, known the morning after each game - no leak):
    new starter  (started last game, <= 2 of the prior 5)  n 1,749  actual 25.3 vs proj 21.8  -> +3.59 min under-projected
    demoted      (bench last game, >= 4 of the prior 5)     n   389  actual 23.8 vs proj 25.8  -> -2.03 min over-projected
    stable starter / stable bench                            n 26,607 resid -0.04 / +0.57 (unbiased)
This asks whether the FINAL probability (final_hp, after availability / redistribution / calibration) still carries that bias - the
only thing that would justify wiring the flag into scoring - per prop, Over side, anchor rung (ladder_offset 0), both seasons:
    model mean final_hp vs realised Over rate, by state; and the same for the next 2 games after the change (does the lag persist?).
Writes nothing."""
import os
from collections import defaultdict

import pandas as pd
import psycopg

STAT = {"points": ["pts"], "rebounds": ["reb"], "assists": ["ast"], "threes_made": ["fg3m"], "pra": ["pts", "reb", "ast"],
        "pts_reb": ["pts", "reb"], "pts_ast": ["pts", "ast"], "reb_ast": ["reb", "ast"], "steals": ["stl"], "blocks": ["blk"],
        "turnovers": ["tov"], "stocks": ["stl", "blk"]}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    g = pd.read_sql("""SELECT g.nba_player_id::text pid, g.game_id, g.season, g.game_date, g.min::float mn,
                              g.pts, g.reb, g.ast, g.fg3m, g.stl, g.blk, g.tov, s.is_starter
                       FROM nba_stats.player_game_log g JOIN nba_stats.player_game_starter_status s
                         ON s.player_id = g.player_id AND s.game_id = g.game_id
                       WHERE g.game_id LIKE '002%%' AND g.season IN ('2024-25','2025-26')""", conn)
    g = g.sort_values(["pid", "season", "game_date"])
    grp = g.groupby(["pid", "season"])["is_starter"]
    g["last1"] = grp.shift(1)
    g["st5"] = grp.transform(lambda s: s.shift(1).rolling(5, min_periods=5).sum())
    # games since the role flipped (0 = first game after the flip game)
    def state(r):
        if pd.isna(r.st5):
            return None
        if r.last1 == 1 and r.st5 <= 2:
            return "A_new_starter"
        if r.last1 == 0 and r.st5 >= 4:
            return "B_demoted"
        if r.st5 == 5:
            return "C_stable_starter"
        if r.st5 == 0:
            return "D_stable_bench"
        return "E_mixed"
    g["state"] = g.apply(state, axis=1)
    g = g[g["state"].notna()]
    print("states:", g["state"].value_counts().to_dict(), flush=True)
    key = g.set_index(["pid", "game_id"])
    dates = sorted(g["game_date"].astype(str).unique())
    acc = defaultdict(lambda: [0, 0.0, 0.0])
    for i in range(0, len(dates), 20):
        chunk = dates[i:i + 20]
        f = pd.read_sql("""SELECT player_id::text pid, game_id, prop, line::float line, final_hp::float hp
                           FROM nba_score.final_hp WHERE game_date = ANY(%s::date[]) AND side='Over' AND ladder_offset = 0
                             AND prop = ANY(%s)""", conn, params=(chunk, list(STAT)))
        if f.empty:
            continue
        f = f.join(key, on=["pid", "game_id"], how="inner")
        for prop, cols in STAT.items():
            d = f[f["prop"] == prop]
            if d.empty:
                continue
            val = d[cols].astype(float).sum(axis=1)
            ok = val.notna() & (d["line"] % 1 != 0)
            d, val = d[ok], val[ok]
            y = (val > d["line"]).astype(float)
            for st, hp, yy in zip(d["state"], d["hp"], y):
                a = acc[(prop, st)]; a[0] += 1; a[1] += hp; a[2] += yy
                a = acc[("ALL", st)]; a[0] += 1; a[1] += hp; a[2] += yy
        print(f"  read {chunk[0]}..{chunk[-1]}", flush=True)
    print("\nOVER side, anchor rung: model mean final_hp vs realised Over rate (gap = realised - model; + = model too low)", flush=True)
    for prop in ["ALL"] + list(STAT):
        for st in ("A_new_starter", "B_demoted", "C_stable_starter", "D_stable_bench", "E_mixed"):
            n, hp, y = acc.get((prop, st), [0, 0, 0])
            if n:
                print(f"  {prop:12s} {st:18s} n={n:6d} model={hp/n:.3f} realised={y/n:.3f} gap={(y-hp)/n:+.3f}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
