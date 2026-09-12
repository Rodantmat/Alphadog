#!/usr/bin/env python3
"""
PER-PROP VALUE OF THE A2 MINUTES MULTIPLIER.

The end-to-end points test gave +0.097 MAE out-of-sample - real but modest, because points are
efficiency-driven as much as minutes-driven. The engine scores ~29 props, and the factor should help
most where MINUTES dominate the stat (rebounds, assists, PRA, FGA) and least where efficiency or
variance dominates (3PM, blocks, steals).

For each prop, out-of-sample on the test season, compare
    P0 = base_min x base_rate36 / 36                (ignore the absence)
    P1 = alloc_actual x base_rate36 / 36            (apply the conserving minutes multiplier)
and report the MAE gain. A prop only gets the factor wired in if the gain is positive on the TEST
season - same ship/don't-ship discipline that correctly rejected the rate response.

Env: DATABASE_URL, RATE_TRAIN_SEASON (unused here - no fitting), RATE_TEST_SEASON, RATE_SAMPLE_DATES
"""
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"

PROPS = {
    "points": "PTS", "rebounds": "REB", "assists": "AST", "threes_made": "FG3M",
    "fga": "FGA", "fg3a": "FG3A", "ftm": "FTM", "blocks": "BLK", "steals": "STL",
    "turnovers": "TOV", "personal_fouls": "PF", "fgm": "FGM", "fta": "FTA", "dreb": "DREB",
}
COMBOS = {"pra": ("PTS", "REB", "AST"), "pts_reb": ("PTS", "REB"), "pts_ast": ("PTS", "AST"),
          "reb_ast": ("REB", "AST"), "stocks": ("STL", "BLK")}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    season = os.environ.get("RATE_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("RATE_SAMPLE_DATES", "0"))
    slug = season.replace("-", "_")
    conn = psycopg.connect(os.environ["DATABASE_URL"])

    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    for name, cols in COMBOS.items():
        logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)
    logs = logs.sort_values("GAME_DATE")

    fac = pd.read_sql("""SELECT game_id, player_id, n_out, base_min, alloc_actual
                         FROM nba_score.redistribution_factors WHERE season=%s AND n_out > 0""",
                      conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    df = logs.merge(fac, left_on=["GAME_ID", "PLAYER_ID"], right_on=["game_id", "player_id"], how="inner")
    if sample:
        keep = sorted(df["GAME_DATE"].unique())[:sample]
        df = df[df["GAME_DATE"].isin(keep)]
    df = df[(df["MIN"] >= 6) & (df["base_min"] >= 6)].copy()
    print(f"{season}: {len(df):,} absence-game rows\n", flush=True)

    targets = {**{k: v for k, v in PROPS.items()}, **{k: k.upper() for k in COMBOS}}
    print(f"{'prop':<16}{'n':>8}{'MAE ignore':>12}{'MAE with A2':>13}{'gain':>9}   verdict")
    results = {}
    for prop, col in targets.items():
        if col not in df.columns:
            continue
        d = df.sort_values("GAME_DATE").copy()
        d["per36"] = np.where(d["MIN"] > 0, d[col] / d["MIN"] * 36, np.nan)
        d["base_rate36"] = d.groupby("PLAYER_ID")["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        d = d[d["base_rate36"].notna()]
        if len(d) < 500:
            continue
        p0 = d["base_min"] * d["base_rate36"] / 36
        p1 = d["alloc_actual"] * d["base_rate36"] / 36
        m0, m1 = np.abs(p0 - d[col]).mean(), np.abs(p1 - d[col]).mean()
        gain = m0 - m1
        results[prop] = gain
        print(f"{prop:<16}{len(d):>8,}{m0:>12.3f}{m1:>13.3f}{gain:>+9.3f}   {'WIRE IN' if gain > 0.002 else 'skip'}")
    conn.close()
    good = [p for p, g in results.items() if g > 0.002]
    print(f"\nprops where the A2 minutes multiplier helps out-of-sample: {len(good)} of {len(results)}")
    print(", ".join(sorted(good)), flush=True)


if __name__ == "__main__":
    main()
