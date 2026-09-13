#!/usr/bin/env python3
"""
EDGE BACKTEST — where the certified baseline disagrees with the PrizePicks board, and whether that
disagreement is profitable.

WHY THIS IS NOW THE PRIORITY. Seven enrichment factors were tested and all were rejected at the leg
level; the baseline (0.7150-0.7231 log-loss) beat every one of them. The projection layer is strong and
adding to it is not where the remaining edge is. The edge is in the COMPARISON: PrizePicks standard legs
hit 48.8% historically against a 54.3-57.8% break-even, so the house edge is 5.5-9 points and the only
way to beat it is to find the legs where OUR probability is far enough above the board's requirement to
clear that gap.

WHAT IT MEASURES, per graded leg (both seasons, real window boards):
    p_model     the baseline's calibrated P(stat > line) at that exact line
    edge        p_model - break_even(tier)
    realised    did it actually hit
Then, by edge bucket and by prop: how many legs, the model's average probability, the ACTUAL hit rate,
and whether the actual rate clears the break-even. A bucket only matters if actual >= break-even.

BREAK-EVEN uses the measured PrizePicks structure (config prizepicks_goblin_demon_tier_spec):
    2-pick power 3x    -> 57.7%      3-pick power 6x   -> 55.0%
    flex and demons vary; the standard 2-pick/3-pick range 54.3-57.8% brackets it, so 56% is used as the
    reference and both ends are reported.

Env: DATABASE_URL, EB_SEASONS, EB_PROP
"""
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
BREAKEVEN = {"2pick": 0.577, "3pick": 0.550, "reference": 0.560}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    seasons = [s.strip() for s in os.environ.get("EB_SEASONS", "2024-25,2025-26").split(",")]
    prop = os.environ.get("EB_PROP", "points")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}

    frames = []
    for season in seasons:
        h = pd.read_sql("""SELECT game_date, player_id, line, p_more, p_less
                           FROM nba_score.baseline_history WHERE season=%s AND prop=%s""",
                        conn, params=(season, prop))
        if h.empty:
            continue
        h["game_date"] = pd.to_datetime(h["game_date"]).dt.date
        h["player_id"] = h["player_id"].astype(str)
        h["line"] = h["line"].astype(float)
        h = h.drop_duplicates(subset=["game_date", "player_id", "line"])
        frames.append(h)
    if not frames:
        print("no baseline rows")
        return
    hist = pd.concat(frames, ignore_index=True)

    mk = "player_" + ("points" if prop == "points" else prop)
    board = pd.read_sql("""SELECT game_date, player, side, line, market_key
                           FROM nba_market.board_snapshots
                           WHERE bookmaker='prizepicks' AND snapshot_label='window'
                             AND replace(market_key,'_alternate','')=%s""", conn, params=(mk,))
    board["game_date"] = pd.to_datetime(board["game_date"]).dt.date
    board["line"] = board["line"].astype(float)
    board["player_id"] = board["player"].map(norm_name).map(pid_map)
    board = board[board["player_id"].notna()].drop_duplicates(
        subset=["game_date", "player_id", "line", "side"])

    out = pd.read_sql("""SELECT game_date, player, line, side, leg_result, market_key
                         FROM nba_market.board_outcomes
                         WHERE replace(market_key,'_alternate','')=%s""", conn, params=(mk,))
    conn.close()
    out["game_date"] = pd.to_datetime(out["game_date"]).dt.date
    out["line"] = out["line"].astype(float)
    out["player_id"] = out["player"].map(norm_name).map(pid_map)
    out = out[out["player_id"].notna()].drop_duplicates(subset=["game_date", "player_id", "line", "side"])

    d = board.merge(hist, on=["game_date", "player_id", "line"], how="inner") \
             .merge(out[["game_date", "player_id", "line", "side", "leg_result"]],
                    on=["game_date", "player_id", "line", "side"], how="inner")
    d = d[d["leg_result"].isin(["over_win", "under_win"])]
    if d.empty:
        print("no graded legs matched")
        return
    d["p_model"] = np.where(d["side"] == "Over", d["p_more"], d["p_less"]).astype(float)
    d["won"] = np.where(d["side"] == "Over", (d["leg_result"] == "over_win"),
                        (d["leg_result"] == "under_win")).astype(int)
    d["edge"] = d["p_model"] - BREAKEVEN["reference"]
    print(f"{prop}: {len(d):,} graded legs matched to a baseline probability", flush=True)
    print(f"  overall  model mean p {d['p_model'].mean():.4f} | actual hit rate {d['won'].mean():.4f}", flush=True)

    print(f"\n{'edge bucket':<18}{'n':>8}{'model p':>10}{'ACTUAL':>9}{'vs 3pick 55.0':>15}{'vs 2pick 57.7':>15}")
    bins = [-1, -0.10, -0.05, 0.0, 0.05, 0.10, 0.15, 1.0]
    labs = ["< -10pp", "-10..-5", "-5..0", "0..+5", "+5..+10", "+10..+15", "> +15pp"]
    d["bucket"] = pd.cut(d["edge"], bins, labels=labs)
    for b, g in d.groupby("bucket", observed=True):
        if len(g) < 200:
            continue
        act = g["won"].mean()
        print(f"{str(b):<18}{len(g):>8,}{g['p_model'].mean():>10.4f}{act:>9.4f}"
              f"{act - BREAKEVEN['3pick']:>+15.4f}{act - BREAKEVEN['2pick']:>+15.4f}", flush=True)

    top = d[d["edge"] >= 0.10]
    if len(top) > 200:
        print(f"\nHIGH-EDGE legs (model p >= 66%): {len(top):,} legs, actual {top['won'].mean():.4f}", flush=True)
        by_prop = top.groupby(top["market_key"].str.contains("alternate")).agg(
            n=("won", "size"), actual=("won", "mean"), model=("p_model", "mean"))
        for k, r in by_prop.iterrows():
            print(f"  {'alternate (goblin/demon)' if k else 'standard line':<26}"
                  f"n={int(r['n']):>6,}  model {r['model']:.4f}  actual {r['actual']:.4f}", flush=True)


if __name__ == "__main__":
    main()
