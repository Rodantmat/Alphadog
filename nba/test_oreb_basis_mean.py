#!/usr/bin/env python3
"""
OREB BASIS TEST, STEP 1 OF 2 — the MEAN only. No distribution, no calibration.

The previous test conflated two separate questions and answered neither. It compared per-36 against an
opportunity basis THROUGH a negative binomial whose dispersion I set from a single global variance - so
the +6.2 / -3.1 / -2.9 pp pattern it produced is the signature of a wrong dispersion for everyone, not
evidence about the basis. You cannot judge a mean through a distribution that is wrong.

So: measure the MEAN alone. If a basis predicts the expected count better, it goes into the certified
recipe and inherits the recipe's FITTED per-cell dispersion - which is exactly what makes the other 28
props calibrate. Dispersion is step 2, and it belongs to the recipe, not to this script.

BASES COMPARED (all as-of, strictly before each game, same minutes input so only the rate basis differs)
  A per-36          proj_min x OREB_per36 / 36                       <- the failing basis
  B opportunity     exp_team_missed x (proj_min/48) x OREB_share     <- ORB/(FGA-FGM) from the literature
  C opportunity+opp adds the OPPONENT's defensive rebounding: teams differ by ~8 pts of DREB%, so the
                    same player faces materially different available-rebound pools
  D blended         0.5 x A + 0.5 x C   (a sanity check that the bases carry different information)

REPORTED: MAE, bias, and bias BY ANCHOR BAND - because the original failure was band-specific
(overconfident on MORE at low anchors), a basis that fixes the average while leaving the low band biased
has not fixed anything.

Env: OREB_SEASONS
"""
import json
import os
import urllib.request

import numpy as np
import pandas as pd

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
        d["OPP"] = d["MATCHUP"].str.replace(".", "", regex=False).str.split(" ").str[-1]
        d = d.sort_values("GAME_DATE")

        tm = d.groupby(["GAME_ID", "TEAM"]).agg(fga=("FGA", "sum"), fgm=("FGM", "sum"),
                                                fta=("FTA", "sum"), ftm=("FTM", "sum"),
                                                oreb=("OREB", "sum"), dreb=("DREB", "sum")).reset_index()
        tm["missed"] = (tm["fga"] - tm["fgm"]) + 0.44 * (tm["fta"] - tm["ftm"])
        d = d.merge(tm[["GAME_ID", "TEAM", "missed"]], on=["GAME_ID", "TEAM"], how="left")
        # opponent DREB share of their own available pool, as-of
        opp = tm.rename(columns={"TEAM": "OPP", "dreb": "opp_dreb", "missed": "opp_faced"})[["GAME_ID", "OPP", "opp_dreb"]]
        d = d.merge(opp, on=["GAME_ID", "OPP"], how="left")

        g = d.groupby("PLAYER_ID")
        d["base_min"] = g["MIN"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        d["oreb36"] = np.where(d["MIN"] > 0, d["OREB"] / d["MIN"] * 36, np.nan)
        d["base_oreb36"] = g["oreb36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        d["exposure"] = d["missed"] * (d["MIN"] / 48.0)
        d["share_obs"] = np.where(d["exposure"] > 0, d["OREB"] / d["exposure"], np.nan)
        d["base_share"] = g["share_obs"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())

        tmg = d.groupby(["TEAM", "GAME_DATE"])["missed"].first().reset_index().sort_values("GAME_DATE")
        tmg["exp_missed"] = tmg.groupby("TEAM")["missed"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        d = d.merge(tmg[["TEAM", "GAME_DATE", "exp_missed"]], on=["TEAM", "GAME_DATE"], how="left")

        og = d.groupby(["OPP", "GAME_DATE"])["opp_dreb"].first().reset_index().sort_values("GAME_DATE")
        og["exp_opp_dreb"] = og.groupby("OPP")["opp_dreb"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        d = d.merge(og[["OPP", "GAME_DATE", "exp_opp_dreb"]], on=["OPP", "GAME_DATE"], how="left")

        x = d[d["base_min"].notna() & d["base_oreb36"].notna() & d["base_share"].notna()
              & d["exp_missed"].notna() & d["exp_opp_dreb"].notna() & (d["base_min"] >= 8)].copy()
        lg_dreb = x["exp_opp_dreb"].median()
        x["A"] = x["base_min"] * x["base_oreb36"] / 36.0
        x["B"] = x["exp_missed"] * (x["base_min"] / 48.0) * x["base_share"]
        x["C"] = x["B"] * (lg_dreb / x["exp_opp_dreb"]).clip(0.85, 1.18)
        x["D"] = 0.5 * x["A"] + 0.5 * x["C"]

        print(f"\n=== {season}: {len(x):,} player-games | mean actual OREB {x['OREB'].mean():.3f}")
        print(f"{'basis':<16}{'MAE':>8}{'bias':>9}{'corr':>8}")
        for k, name in (("A", "per-36"), ("B", "opportunity"), ("C", "opportunity+opp"), ("D", "blend A/C")):
            mae = np.abs(x[k] - x["OREB"]).mean()
            bias = (x[k] - x["OREB"]).mean()
            corr = np.corrcoef(x[k], x["OREB"])[0, 1]
            print(f"{name:<16}{mae:>8.4f}{bias:>+9.4f}{corr:>8.4f}")

        print(f"\n  bias by anchor band (the original failure was band-specific):")
        x["band"] = pd.cut(x["A"], [0, 0.5, 1.0, 1.5, 2.5, 10],
                           labels=["<0.5", "0.5-1", "1-1.5", "1.5-2.5", "2.5+"])
        t = x.groupby("band", observed=True).agg(n=("OREB", "size"), actual=("OREB", "mean"),
                                                 A=("A", "mean"), B=("B", "mean"), C=("C", "mean"))
        for b, r in t.iterrows():
            print(f"    {str(b):<9}n={int(r['n']):<6,} actual {r['actual']:.3f} | "
                  f"A {r['A']:.3f} ({r['A']-r['actual']:+.3f}) | "
                  f"B {r['B']:.3f} ({r['B']-r['actual']:+.3f}) | "
                  f"C {r['C']:.3f} ({r['C']-r['actual']:+.3f})")


if __name__ == "__main__":
    main()
