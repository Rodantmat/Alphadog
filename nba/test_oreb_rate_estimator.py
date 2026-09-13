#!/usr/bin/env python3
"""
OREB BASIS TEST, STEP 2 — the RATE ESTIMATOR, which the band-bias table says is the real defect.

WHAT STEP 1 ESTABLISHED: the opportunity basis (team missed shots, opponent DREB) moves the bias by
~0.02 - essentially nothing. Both hypotheses about the BASIS were wrong. What the band table actually
showed is SHRINKAGE:

    anchor <0.5   actual 0.434   predicted 0.324   (-0.110)   under-predicted
    anchor 2.5+   actual 3.020   predicted 3.269   (+0.249)   over-predicted

The spread of predictions is too narrow - every player is pulled toward the league mean. Offensive
rebounding is far more role-concentrated than total rebounding, so compression costs oreb much more
than it costs rebounds, which is why one prop passes and the other does not.

The recipe gives oreb k_stab = 60, the HEAVIEST prior of any prop (points/rebounds use far less). That
is the lever. Estimators compared, all as-of, same minutes, same basis - only the rate estimator differs:

  A  expanding mean                       (the current proxy, heavy implicit shrinkage)
  E  EWMA alpha 0.15                      (responsive, little shrinkage)
  F  empirical Bayes toward the ROLE-TIER mean, k = 20   (shrink to peers, not to the league)
  G  empirical Bayes toward role tier, k = 8             (lighter still)

A correct estimator should flatten the bias ACROSS BANDS, not just lower the average error - a model
that is right on average and wrong at both ends is exactly what failed calibration.

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
        d = d.sort_values("GAME_DATE")
        g = d.groupby("PLAYER_ID")
        d["base_min"] = g["MIN"].transform(lambda s: s.shift(1).rolling(10, min_periods=3).mean())
        d["oreb36"] = np.where(d["MIN"] > 0, d["OREB"] / d["MIN"] * 36, np.nan)

        # A: expanding mean
        d["rate_A"] = g["oreb36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        # E: EWMA, responsive
        d["rate_E"] = g["oreb36"].transform(lambda s: s.shift(1).ewm(alpha=0.15, min_periods=3).mean())
        # role tier from as-of minutes (the recipe's own role-ranked tiers, approximated)
        d["role"] = pd.cut(d["base_min"], [0, 12, 20, 28, 60], labels=["bench", "rotation", "starter", "heavy"])
        # empirical Bayes toward the role-tier mean, using each player's own as-of sample size
        d["n_seen"] = g["oreb36"].transform(lambda s: s.shift(1).expanding(min_periods=1).count())
        role_mean = d.groupby(["role", "GAME_DATE"], observed=True)["oreb36"].mean().groupby(level=0).transform(
            lambda s: s.shift(1).expanding(min_periods=3).mean()).rename("role_prior").reset_index()
        d = d.merge(role_mean, on=["role", "GAME_DATE"], how="left")
        for tag, k in (("F", 20.0), ("G", 8.0)):
            w = d["n_seen"] / (d["n_seen"] + k)
            d[f"rate_{tag}"] = w * d["rate_A"] + (1 - w) * d["role_prior"]

        # H: shrink toward an ARCHETYPE prior, not a minutes tier. Gemini's critique of F/G is exact:
        # "starter" mixes a crash-first center with a wing who never crashes, so shrinking to that group
        # is worse than not shrinking at all - which is what the sign flip showed (+0.192 / -0.658).
        # The archetype is defined by DEFENSIVE rebound rate: a proxy for size and role that correlates
        # with rebounding behaviour but is NOT the target, so the grouping is not circular.
        d["dreb36"] = np.where(d["MIN"] > 0, d["DREB"] / d["MIN"] * 36, np.nan)
        d["base_dreb36"] = g["dreb36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        d["arch"] = pd.qcut(d["base_dreb36"], 5, labels=[f"q{i}" for i in range(1, 6)], duplicates="drop")
        arch_prior = (d.groupby(["arch", "GAME_DATE"], observed=True)["oreb36"].mean()
                        .groupby(level=0).transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
                        .rename("arch_prior").reset_index())
        d = d.merge(arch_prior, on=["arch", "GAME_DATE"], how="left")
        for tag, k, base in (("H", 20.0, "rate_A"), ("I", 8.0, "rate_E")):
            w = d["n_seen"] / (d["n_seen"] + k)
            d[f"rate_{tag}"] = w * d[base] + (1 - w) * d["arch_prior"]

        x = d[d["base_min"].notna() & d["rate_A"].notna() & d["rate_E"].notna()
              & d["rate_F"].notna() & d["rate_H"].notna() & (d["base_min"] >= 8)].copy()
        for tag in ("A", "E", "F", "G", "H", "I"):
            x[f"p_{tag}"] = x["base_min"] * x[f"rate_{tag}"] / 36.0

        print(f"\n=== {season}: {len(x):,} player-games | mean actual {x['OREB'].mean():.3f}")
        print(f"{'estimator':<30}{'MAE':>8}{'bias':>9}{'sd(pred)':>10}   (sd actual {x['OREB'].std():.3f})")
        for tag, name in (("A", "expanding mean"), ("E", "EWMA 0.15"),
                          ("F", "EB to minutes tier k=20"), ("G", "EB to minutes tier k=8"),
                          ("H", "EB to DREB archetype k=20"), ("I", "EWMA + archetype k=8")):
            c = f"p_{tag}"
            print(f"{name:<30}{np.abs(x[c]-x['OREB']).mean():>8.4f}"
                  f"{(x[c]-x['OREB']).mean():>+9.4f}{x[c].std():>10.4f}")

        # the smoking-gun test for regression to the mean: correlation of prediction with error
        for tag in ("A", "E", "H", "I"):
            r = np.corrcoef(x[f"p_{tag}"], x["OREB"] - x[f"p_{tag}"])[0, 1]
            print(f"  corr(prediction, error) {tag}: {r:+.4f}   (0 = no regression-to-mean bias)")

        print("\n  bias by anchor band - the test that matters (flat across bands = fixed):")
        x["band"] = pd.cut(x["p_A"], [0, 0.5, 1.0, 1.5, 2.5, 10],
                           labels=["<0.5", "0.5-1", "1-1.5", "1.5-2.5", "2.5+"])
        t = x.groupby("band", observed=True).agg(n=("OREB", "size"), actual=("OREB", "mean"),
                                                 A=("p_A", "mean"), E=("p_E", "mean"),
                                                 H=("p_H", "mean"), I=("p_I", "mean"))
        print(f"    {'band':<9}{'n':>7}{'actual':>8}{'A':>9}{'E':>9}{'H':>9}{'I':>9}")
        for b, r in t.iterrows():
            print(f"    {str(b):<9}{int(r['n']):>7,}{r['actual']:>8.3f}"
                  f"{r['A']-r['actual']:>+9.3f}{r['E']-r['actual']:>+9.3f}"
                  f"{r['H']-r['actual']:>+9.3f}{r['I']-r['actual']:>+9.3f}")
        spread = {tag: float(t[tag].sub(t["actual"]).abs().max()) for tag in ("A", "E", "H", "I")}
        best = min(spread, key=spread.get)
        print(f"\n  worst band bias: " + " | ".join(f"{k} {v:.3f}" for k, v in spread.items())
              + f"   -> best {best}")


if __name__ == "__main__":
    main()
