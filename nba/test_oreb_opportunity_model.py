#!/usr/bin/env python3
"""
OREB OPPORTUNITY MODEL — testing the right SHAPE before touching the certified recipe.

WHY: oreb failed calibration on both seasons (worst bands -21.2 pp, then -2.5 / +5.7 after a lambda
change). Lambda tuning improved it without fixing it, because the missing piece is not ordering
strength - it is OPPORTUNITY. The canonical definition is

    ORB% = ORB / (ORB + DRB_opp)  ~=  ORB / (FGA - FGM)

i.e. offensive rebounds over the team's MISSED SHOTS. A per-36 rate ignores how many rebounds existed
to be had, which is exactly the flaw the literature names ("30 of 40 is better than 30 of 60"). A big
man on a 52%-shooting team simply has fewer chances than the same man on a 43%-shooting team, and the
rate model cannot see that.

THE TEST (no recipe changes, no writes):
    A  per-36 basis      proj = proj_min x OREB_per36 / 36                     <- what failed
    B  opportunity basis proj = expected_team_missed x (proj_min/48) x share
       where share = the player's as-of OREB per team-missed-shot while on floor,
       and expected_team_missed = his team's as-of average missed shots per game.
Both use the SAME as-of minutes, so the only difference is the rate basis. Compare MAE and, more
importantly, the calibration of P(OREB > line) implied by a Poisson/NegBin around each mean.

Env: OREB_SEASONS
"""
import json
import os
import urllib.request

import numpy as np
import pandas as pd
from scipy import stats

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    for season in [s.strip() for s in os.environ.get("OREB_SEASONS", "2024-25,2025-26").split(",")]:
        slug = season.replace("-", "_")
        d = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        d["GAME_DATE"] = pd.to_datetime(d["GAME_DATE"]).dt.date
        d["PLAYER_ID"] = d["PLAYER_ID"].astype(str)
        d["GAME_ID"] = d["GAME_ID"].astype(str)
        d["TEAM"] = d["MATCHUP"].str.split(" ").str[0]
        d = d.sort_values("GAME_DATE")

        # team missed shots per game (the opportunity pool), from the box score
        tm = d.groupby(["GAME_ID", "TEAM"]).agg(fga=("FGA", "sum"), fgm=("FGM", "sum"),
                                                fta=("FTA", "sum"), ftm=("FTM", "sum")).reset_index()
        tm["missed"] = (tm["fga"] - tm["fgm"]) + 0.44 * (tm["fta"] - tm["ftm"])
        d = d.merge(tm[["GAME_ID", "TEAM", "missed"]], on=["GAME_ID", "TEAM"], how="left")

        g = d.groupby("PLAYER_ID")
        # as-of (strictly before each game) minutes, per-36 oreb, and opportunity share
        d["base_min"] = g["MIN"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        d["oreb36"] = np.where(d["MIN"] > 0, d["OREB"] / d["MIN"] * 36, np.nan)
        d["base_oreb36"] = g["oreb36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        # share = OREB per team-missed-shot, scaled to the player's floor time
        d["opp_exposure"] = d["missed"] * (d["MIN"] / 48.0)
        d["share_obs"] = np.where(d["opp_exposure"] > 0, d["OREB"] / d["opp_exposure"], np.nan)
        d["base_share"] = g["share_obs"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        # expected team missed shots = the team's as-of average
        tmg = d.groupby(["TEAM", "GAME_DATE"])["missed"].first().reset_index().sort_values("GAME_DATE")
        tmg["exp_missed"] = tmg.groupby("TEAM")["missed"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        d = d.merge(tmg[["TEAM", "GAME_DATE", "exp_missed"]], on=["TEAM", "GAME_DATE"], how="left")

        x = d[d["base_min"].notna() & d["base_oreb36"].notna() & d["base_share"].notna()
              & d["exp_missed"].notna() & (d["base_min"] >= 8)].copy()
        x["mean_A"] = x["base_min"] * x["base_oreb36"] / 36.0
        x["mean_B"] = x["exp_missed"] * (x["base_min"] / 48.0) * x["base_share"]
        print(f"\n=== {season}: {len(x):,} player-games (base_min >= 8)")
        print(f"  MAE  per-36 basis {np.abs(x['mean_A']-x['OREB']).mean():.4f} | "
              f"opportunity basis {np.abs(x['mean_B']-x['OREB']).mean():.4f}")
        print(f"  mean actual {x['OREB'].mean():.3f} | A {x['mean_A'].mean():.3f} | B {x['mean_B'].mean():.3f}")

        # calibration of P(OREB > line) at the lines the board actually uses
        for basis, mcol in (("per-36", "mean_A"), ("opportunity", "mean_B")):
            rows = []
            for line in (0.5, 1.5, 2.5, 3.5):
                mu = x[mcol].clip(lower=0.02)
                # negative binomial with a fitted dispersion (oreb is over-dispersed vs Poisson)
                var = x["OREB"].var()
                p = np.clip(mu / max(var, mu.mean() * 1.05), 1e-3, 0.999)
                n = np.clip(mu * p / (1 - p), 0.05, 200)
                pred = 1 - stats.nbinom.cdf(line, n, p)
                act = (x["OREB"] > line).astype(int)
                for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 0.9)):
                    m = (pred >= lo) & (pred < hi)
                    if m.sum() >= 200:
                        rows.append((line, f"{lo:.1f}-{hi:.1f}", int(m.sum()),
                                     float(pred[m].mean()), float(act[m].mean())))
            if rows:
                worst = max(abs(r[4] - r[3]) for r in rows) * 100
                print(f"  {basis:<12} worst band gap {worst:5.1f} pp   {'PASS' if worst <= 2.5 else 'FAIL'}")
                for line, band, n, pr, ac in rows:
                    flag = "  <-- off" if abs(ac - pr) > 0.025 else ""
                    print(f"     line {line}  band {band}  n={n:<6,} pred {pr:.3f} actual {ac:.3f} "
                          f"{(ac-pr)*100:+5.1f} pp{flag}")


if __name__ == "__main__":
    main()
