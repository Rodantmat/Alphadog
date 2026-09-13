#!/usr/bin/env python3
"""
A2 USAGE ALLOCATION — FITTED, replacing the assumption.

THE FLAW: build_redistribution_factors.py allocates vacated MINUTES with a fitted weight model, but
allocates vacated USAGE by assuming it flows PROPORTIONALLY to each remaining player's baseline usage
share. That assumption was never tested, and the research says it is wrong in a specific way: the player
who inherits the MINUTES is often not the one who inherits the SHOTS. When a primary creator sits, usage
concentrates on the secondary creator far more than on the bench player who takes the vacated minutes.

That matters twice over: the rate response was rejected partly BECAUSE its usage input was this
assumption, and the defender x A2 interaction that just wired in uses min_mult - so a better usage
allocation should strengthen it.

WHAT THIS FITS
    share_usage(receiver) = softmax over available players of
        b0 + b1*log(baseline usage) + b2*log(baseline minutes) + b3*(is a high-usage player)
             + b4*(absent player's usage tier interaction)
  fitted on team-games WITH pre-game absences, target = each player's realised share of the vacated
  possession pool. Conserving by construction (softmax sums to 1), like the minutes allocator.

COMPARED AGAINST:
    P0 proportional-to-baseline-usage  (the current assumption)
    P1 proportional-to-allocated-MINUTES (usage follows minutes 1:1)
    P2 the fitted allocation
Metric: MAE of predicted vs realised usage share, held out on the test season.

Env: DATABASE_URL, UA_TRAIN_SEASON, UA_TEST_SEASON, UA_SAMPLE_DATES
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def build(season, conn, sample):
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["POSS"] = logs["FGA"].fillna(0) + 0.44 * logs["FTA"].fillna(0) + logs["TOV"].fillna(0)
    logs = logs.sort_values("GAME_DATE")

    fac = pd.read_sql("""SELECT game_id, team, player_id, n_out, base_min, alloc_full, alloc_actual,
                                min_mult, vacated_poss
                         FROM nba_score.redistribution_factors WHERE season=%s AND n_out > 0""",
                      conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    d = logs.merge(fac, left_on=["GAME_ID", "PLAYER_ID", "TEAM"],
                   right_on=["game_id", "player_id", "team"], how="inner")
    if sample:
        keep = sorted(d["GAME_DATE"].unique())[:sample]
        d = d[d["GAME_DATE"].isin(keep)]

    # as-of baselines
    g = d.sort_values("GAME_DATE").groupby("PLAYER_ID")
    d["base_poss"] = g["POSS"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
    d = d[d["base_poss"].notna() & (d["base_min"] >= 6) & (d["vacated_poss"] > 3)].copy()
    # realised share of the vacated possession pool
    d["gain_poss"] = d["POSS"] - d["base_poss"]
    d["realised_share"] = d["gain_poss"] / d["vacated_poss"]
    return d


def softmax_shares(X, beta, groups):
    w = np.exp(np.clip(X @ beta, -20, 20))
    out = np.zeros(len(w))
    for _, idx in groups.items():
        s = w[idx].sum()
        out[idx] = w[idx] / s if s > 0 else 1.0 / len(idx)
    return out


def main():
    tr_s = os.environ.get("UA_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("UA_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("UA_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    tr, te = build(tr_s, conn, sample), build(te_s, conn, sample)
    conn.close()
    if tr.empty or te.empty:
        print("insufficient data")
        return
    print(f"train {len(tr):,} | test {len(te):,}", flush=True)

    def design(x):
        return np.column_stack([
            np.log(x["base_poss"].clip(lower=0.5)),
            np.log(x["base_min"].clip(lower=5)),
            (x["base_poss"] >= 14).astype(float),          # is a creator
            np.log(x["alloc_actual"].clip(lower=5) / x["base_min"].clip(lower=5)),  # his minutes lift
        ])

    def groups_of(x):
        gi = defaultdict(list)
        for i, k in enumerate(zip(x["game_id"], x["team"])):
            gi[k].append(i)
        return {k: np.array(v) for k, v in gi.items()}

    gtr, gte = groups_of(tr), groups_of(te)
    Xtr, Xte = design(tr), design(te)
    ytr = tr["realised_share"].values
    yte = te["realised_share"].values

    # Fit by gradient descent WITH L2 regularisation. The unregularised version produced betas of
    # -15.7 and -22.0 - a fit that extreme will not generalise even when it tests well, because the
    # softmax only cares about DIFFERENCES within a team-game, so the scale can run away freely.
    # Standardise the design as well, so the penalty applies evenly across features.
    mu, sd = Xtr.mean(axis=0), Xtr.std(axis=0).clip(min=1e-6)
    Ztr, Zte = (Xtr - mu) / sd, (Xte - mu) / sd
    lam = float(os.environ.get("UA_RIDGE", "0.05"))
    beta = np.zeros(Ztr.shape[1])
    lr = 0.5
    best, best_beta = np.inf, beta.copy()
    for it in range(600):
        p = softmax_shares(Ztr, beta, gtr)
        grad = Ztr.T @ (p - ytr) / len(ytr) + lam * beta
        beta -= lr * grad
        if it % 50 == 0:
            loss = np.abs(softmax_shares(Ztr, beta, gtr) - ytr).mean()
            if loss < best:
                best, best_beta = loss, beta.copy()
    beta = best_beta
    print(f"fitted betas (standardised, ridge {lam}) "
          f"[log usage, log minutes, is_creator, minutes lift]: {np.round(beta, 4).tolist()}", flush=True)

    # baselines to beat
    def prop_share(x, col, groups):
        v = x[col].values.astype(float)
        out = np.zeros(len(v))
        for _, idx in groups.items():
            s = v[idx].sum()
            out[idx] = v[idx] / s if s > 0 else 1.0 / len(idx)
        return out

    p0 = prop_share(te, "base_poss", gte)                 # the current ASSUMPTION
    te = te.assign(_gain_min=(te["alloc_actual"] - te["base_min"]).clip(lower=0))
    p1 = prop_share(te, "_gain_min", gte)                 # usage follows minutes 1:1
    p2 = softmax_shares(Xte, beta, gte)                   # fitted

    for name, p in (("P0 proportional to baseline usage (current assumption)", p0),
                    ("P1 proportional to allocated minutes", p1),
                    ("P2 FITTED allocation", p2)):
        print(f"  {name:<52} MAE {np.abs(p - yte).mean():.4f}  corr {np.corrcoef(p, yte)[0,1]:+.4f}", flush=True)


if __name__ == "__main__":
    main()
