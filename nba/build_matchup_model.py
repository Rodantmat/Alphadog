#!/usr/bin/env python3
"""
TEAM MATCHUP v2 — the market total as the game-environment input. NON-NEGOTIABLE FACTOR.

THE PARALLEL WITH BLOWOUT. The blowout mixture ran on a DERIVED spread (r=0.46, MAE 11.5) while 307k
real market rows sat unused; swapping in the market line produced a monotone, verified effect. The
matchup layer has the same shape of problem: COMPASS fact 21 measures the opponent-profile factor layer
as "real but small" (Brier -0.1 to -0.3%), and every input to it is DERIVED - opponent defensive rating,
pace, miss rate, OREB%, TOV%, FTA rate, all rolled from our own box scores.

The market TOTAL is the book's estimate of the whole game environment - pace, efficiency, and both
teams' quality folded into one number that the market is paid to get right. If it predicts the realised
game environment better than our derived pace estimate, it belongs in the baseline the same way the
spread now does.

WHAT THIS MEASURES (both seasons, all games with a morning line):
  1. ENVIRONMENT: does the market total predict actual combined points better than our derived pace?
  2. DECOMPOSITION: total and spread together imply each team's expected score
        team_expected = total/2 - spread/2     (the favourite's implied score is higher)
     Does that beat a derived team-strength estimate?
  3. PLAYER-LEVEL: do the implied team scores explain player production beyond the player's own
     baseline - i.e. is there matchup signal the per-36 rate does not already carry?
  4. THE ASYMMETRY: strong offence vs weak defence is not the same as the reverse. Bucketed by implied
     team total AND implied opponent total, so both sides of the matchup are measured separately.

Env: DATABASE_URL, TM_SEASONS
"""
import json
import os
import urllib.request

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    seasons = [s.strip() for s in os.environ.get("TM_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    frames = []
    for season in seasons:
        slug = season.replace("-", "_")
        lg = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        lg["GAME_DATE"] = pd.to_datetime(lg["GAME_DATE"]).dt.date
        lg["PLAYER_ID"] = lg["PLAYER_ID"].astype(str)
        lg["GAME_ID"] = lg["GAME_ID"].astype(str)
        lg["TEAM"] = lg["MATCHUP"].str.split(" ").str[0]
        lg["IS_HOME"] = (~lg["MATCHUP"].str.contains("@")).astype(int)
        lg["season"] = season
        ms = fetch(f"nba_market_spreads_{slug}.json")
        sp = {str(r["game_id"]): r for r in ms["rows"]}
        lg["mkt_home_spread"] = lg["GAME_ID"].map(lambda g: (sp.get(g) or {}).get("home_spread"))
        lg["mkt_total"] = lg["GAME_ID"].map(lambda g: (sp.get(g) or {}).get("total"))
        frames.append(lg)
    logs = pd.concat(frames, ignore_index=True).sort_values("GAME_DATE")

    tp = logs.groupby(["GAME_ID", "TEAM"]).agg(pts=("PTS", "sum"), is_home=("IS_HOME", "max"),
                                               season=("season", "first")).reset_index()
    gg = tp.merge(tp, on="GAME_ID")
    gg = gg[gg["TEAM_x"] != gg["TEAM_y"]].copy()
    gg["combined"] = gg["pts_x"] + gg["pts_y"]
    gg = gg.merge(logs[["GAME_ID", "mkt_total", "mkt_home_spread"]].drop_duplicates("GAME_ID"),
                  on="GAME_ID", how="left")
    have = gg[gg["mkt_total"].notna()].copy()

    # derived pace/environment: each team's season-to-date points for + against, as-of
    tp = tp.sort_values("GAME_ID")
    pf, pa = {}, {}
    for (season, team), grp in tp.groupby(["season", "TEAM"]):
        run = grp["pts"].expanding().mean().shift(1)
        for gid, v in zip(grp["GAME_ID"], run):
            pf[(season, gid, team)] = v
    have["derived_total"] = [(pf.get((s, g, tx)) or np.nan) + (pf.get((s, g, ty)) or np.nan)
                             for s, g, tx, ty in zip(have["season_x"], have["GAME_ID"], have["TEAM_x"], have["TEAM_y"])]
    h = have[have["derived_total"].notna()]
    print(f"games with both a market total and a derived estimate: {len(h):,}\n", flush=True)

    print("1) GAME ENVIRONMENT - predicting actual combined points")
    for tag, col in (("derived (our own box scores)", "derived_total"), ("MARKET TOTAL", "mkt_total")):
        r = float(np.corrcoef(h[col], h["combined"])[0, 1])
        mae = float(np.abs(h[col] - h["combined"]).mean())
        print(f"   {tag:<30} r {r:.4f}   MAE {mae:.2f}", flush=True)

    # 2) implied team scores
    h = h.copy()
    h["spread_x"] = np.where(h["is_home_x"] == 1, h["mkt_home_spread"], -h["mkt_home_spread"])
    h["implied_own"] = h["mkt_total"] / 2 - h["spread_x"] / 2
    h["implied_opp"] = h["mkt_total"] / 2 + h["spread_x"] / 2
    r_own = float(np.corrcoef(h["implied_own"], h["pts_x"])[0, 1])
    mae_own = float(np.abs(h["implied_own"] - h["pts_x"]).mean())
    r_der = float(np.corrcoef([pf.get((s, g, t), np.nan) for s, g, t in zip(h["season_x"], h["GAME_ID"], h["TEAM_x"])],
                              h["pts_x"])[0, 1])
    print(f"\n2) IMPLIED TEAM SCORE (total/2 - spread/2) vs actual team points")
    print(f"   derived season-to-date mean    r {r_der:.4f}")
    print(f"   MARKET-IMPLIED team score      r {r_own:.4f}   MAE {mae_own:.2f}", flush=True)

    # 3/4) player level - does the implied environment explain production beyond the player's own rate?
    g2 = logs.sort_values("GAME_DATE").groupby("PLAYER_ID")
    logs["base_min"] = g2["MIN"].transform(lambda s: s.shift(1).rolling(10, min_periods=4).mean())
    logs["per36"] = np.where(logs["MIN"] > 0, logs["PTS"] / logs["MIN"] * 36, np.nan)
    # rebind: g2 was created before per36 existed and cannot see it (same trap as the DREB archetype fix)
    g3 = logs.sort_values("GAME_DATE").groupby("PLAYER_ID")
    logs["base_rate"] = g3["per36"].transform(lambda s: s.shift(1).expanding(min_periods=5).mean())
    imp = h[["GAME_ID", "TEAM_x", "implied_own", "implied_opp"]].rename(columns={"TEAM_x": "TEAM"})
    d = logs.merge(imp, on=["GAME_ID", "TEAM"], how="inner")
    d = d[d["base_min"].notna() & d["base_rate"].notna() & (d["base_min"] >= 12)].copy()
    d["pred"] = d["base_min"] * d["base_rate"] / 36
    d = d[d["pred"] > 0]
    d["resid"] = np.log(d["PTS"].clip(lower=0.5) / d["pred"].clip(lower=0.5))
    print(f"\n3) PLAYER RESIDUAL vs the market-implied environment (n={len(d):,})")
    print(f"   {'implied own team total':<26}{'n':>8}{'mean resid':>12}{'actual/pred':>13}")
    for lo, hi in [(0, 108), (108, 113), (113, 117), (117, 121), (121, 200)]:
        s = d[(d["implied_own"] >= lo) & (d["implied_own"] < hi)]
        if len(s) < 500:
            continue
        print(f"   {f'{lo}-{hi}':<26}{len(s):>8,}{float(s['resid'].mean()):>12.4f}"
              f"{float((s['PTS'].sum()/s['pred'].sum())):>13.4f}", flush=True)
    print(f"\n   {'implied OPPONENT total':<26}{'n':>8}{'mean resid':>12}{'actual/pred':>13}   (weak defence = high)")
    for lo, hi in [(0, 108), (108, 113), (113, 117), (117, 121), (121, 200)]:
        s = d[(d["implied_opp"] >= lo) & (d["implied_opp"] < hi)]
        if len(s) < 500:
            continue
        print(f"   {f'{lo}-{hi}':<26}{len(s):>8,}{float(s['resid'].mean()):>12.4f}"
              f"{float((s['PTS'].sum()/s['pred'].sum())):>13.4f}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
