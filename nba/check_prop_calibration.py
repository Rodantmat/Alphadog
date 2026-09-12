#!/usr/bin/env python3
"""
CALIBRATION CHECK for any prop in nba_score.baseline_history, straight against the box scores.

WHY THIS EXISTS: the certification tables are printed inside harness runs, so once a run scrolls out of
the Actions list there is no way to re-read a verdict. This recomputes it from stored data, so any prop
can be re-checked at any time - and a prop that is IN the history table but not certified can be caught.

THE STANDARD (COMPASS fact 5): calibrated at the leg level - when the model says 75%, it must hit ~75%
on every confidence band, both directions, on BOTH seasons. Reported as:
  band | n | mean predicted | actual hit rate | gap
A prop passes when no band with n >= 200 is off by more than ~2.5 points and the pattern is not
systematically signed.

Env: DATABASE_URL, CAL_PROPS (comma separated), CAL_SEASONS
"""
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
COL = {"points": "PTS", "rebounds": "REB", "assists": "AST", "threes_made": "FG3M", "blocks": "BLK",
       "steals": "STL", "turnovers": "TOV", "personal_fouls": "PF", "fga": "FGA", "fg3a": "FG3A",
       "ftm": "FTM", "fgm": "FGM", "fta": "FTA", "oreb": "OREB", "dreb": "DREB"}
COMBO = {"pra": ("PTS", "REB", "AST"), "pts_reb": ("PTS", "REB"), "pts_ast": ("PTS", "AST"),
         "reb_ast": ("REB", "AST"), "stocks": ("STL", "BLK")}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    props = [p.strip() for p in os.environ.get("CAL_PROPS", "oreb").split(",")]
    seasons = [s.strip() for s in os.environ.get("CAL_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    for season in seasons:
        slug = season.replace("-", "_")
        logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
        logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
        for name, cols in COMBO.items():
            logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)

        for prop in props:
            col = COL.get(prop, prop.upper())
            if col not in logs.columns:
                print(f"{season} {prop}: no box-score column {col}", flush=True)
                continue
            h = pd.read_sql("""SELECT game_date, player_id, line, p_more FROM nba_score.baseline_history
                               WHERE season=%s AND prop=%s AND p_more IS NOT NULL""",
                            conn, params=(season, prop))
            if h.empty:
                print(f"{season} {prop}: no rows in baseline_history", flush=True)
                continue
            h["game_date"] = pd.to_datetime(h["game_date"]).dt.date
            h["player_id"] = h["player_id"].astype(str)
            d = h.merge(logs[["GAME_DATE", "PLAYER_ID", col]],
                        left_on=["game_date", "player_id"], right_on=["GAME_DATE", "PLAYER_ID"], how="inner")
            d["hit"] = (d[col] > d["line"]).astype(int)
            d["p"] = d["p_more"].astype(float)

            print(f"\n=== {season} {prop}: {len(d):,} graded rows", flush=True)
            for side, mask, pcol in (("more", d["p"] >= 0.5, "p"), ("less", d["p"] < 0.5, "p")):
                x = d[mask].copy()
                if len(x) < 200:
                    continue
                # express everything as the probability of the SIDE the model favours
                x["p_side"] = np.where(x["p"] >= 0.5, x["p"], 1 - x["p"])
                x["hit_side"] = np.where(x["p"] >= 0.5, x["hit"], 1 - x["hit"])
                bins = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1.01]
                x["band"] = pd.cut(x["p_side"], bins, right=False)
                g = x.groupby("band", observed=True).agg(n=("hit_side", "size"),
                                                         pred=("p_side", "mean"),
                                                         actual=("hit_side", "mean"))
                g = g[g["n"] >= 200]
                if g.empty:
                    continue
                g["gap_pp"] = (g["actual"] - g["pred"]) * 100
                worst = g["gap_pp"].abs().max()
                print(f"  side={side}  worst band gap {worst:5.1f} pp   {'PASS' if worst <= 2.5 else 'FAIL'}")
                for b, r in g.iterrows():
                    flag = "  <-- off" if abs(r["gap_pp"]) > 2.5 else ""
                    print(f"    {str(b):<14}{int(r['n']):>7,}  pred {r['pred']:.3f}  actual {r['actual']:.3f}  {r['gap_pp']:+6.1f} pp{flag}")
    conn.close()


if __name__ == "__main__":
    main()
