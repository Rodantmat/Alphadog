#!/usr/bin/env python3
"""
RATE RESPONSE — the second half of factor A2, and the end-to-end test that it helps the actual prop.

DESIGN RULE (NBA_ENRICHMENT_ENGINE_DESIGN.md §3b): minutes and rate move together when a teammate is
out, so fitting them as two independent multipliers double-counts. The causal chain is
    absence -> usage vacuum -> the player absorbs usage -> his per-minute rate changes
so rate is a FUNCTION of the new state:
    log(rate_actual / rate_baseline) = a + b*log(min_mult) + c*log(usage_mult) + d*(minutes band)
fitted on games WITH absences, as-of, with the allocator's conserving multipliers as inputs.

THE TEST THAT DECIDES IT (the minutes MAE is not enough - the engine predicts POINTS):
  on absence games, compare predicted points
     P0  base_min x base_rate36 / 36                      (ignore the absence entirely)
     P1  alloc_actual x base_rate36 / 36                  (minutes only)
     P2  alloc_actual x base_rate36 x rate_response / 36  (minutes + fitted rate)
  P2 must beat P1 must beat P0. If P2 does not beat P1, the rate response adds nothing and only the
  minutes multiplier ships.

Train/test split is BY SEASON so the fit is never evaluated on its own data.
Env: DATABASE_URL, RATE_TRAIN_SEASON, RATE_TEST_SEASON, RATE_SAMPLE_DATES
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


def load_season(slug):
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["POSS"] = logs["FGA"].fillna(0) + 0.44 * logs["FTA"].fillna(0) + logs["TOV"].fillna(0)
    return logs.sort_values("GAME_DATE")


def build(season, conn, sample):
    slug = season.replace("-", "_")
    logs = load_season(slug)
    fac = pd.read_sql("""SELECT game_id, player_id, n_out, base_min, alloc_full, alloc_actual,
                                min_mult, usage_mult FROM nba_score.redistribution_factors WHERE season=%s""",
                      conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    df = logs.merge(fac, left_on=["GAME_ID", "PLAYER_ID"], right_on=["game_id", "player_id"], how="inner")
    # as-of per-36 rate and possession rate, strictly before each game
    df = df.sort_values("GAME_DATE")
    g = df.groupby("PLAYER_ID")
    df["per36"] = np.where(df["MIN"] > 0, df["PTS"] / df["MIN"] * 36, np.nan)
    df["base_rate36"] = g["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
    df["poss36"] = np.where(df["MIN"] > 0, df["POSS"] / df["MIN"] * 36, np.nan)
    df["base_poss36"] = g["poss36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
    df = df[(df["n_out"] > 0) & df["base_rate36"].notna() & (df["MIN"] >= 6) & (df["base_min"] >= 6)].copy()
    if sample:
        keep = sorted(df["GAME_DATE"].unique())[:sample]
        df = df[df["GAME_DATE"].isin(keep)]
    return df


def main():
    tr_s = os.environ.get("RATE_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("RATE_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("RATE_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    tr = build(tr_s, conn, sample)
    te = build(te_s, conn, sample)
    print(f"train {tr_s}: {len(tr):,} rows | test {te_s}: {len(te):,} rows", flush=True)

    # fit the rate response on TRAIN only
    def design(d):
        return np.column_stack([np.ones(len(d)),
                                np.log(d["min_mult"].clip(0.5, 2.0)),
                                np.log(d["usage_mult"].clip(0.5, 2.5)),
                                np.log(d["base_min"].clip(6, 40))])
    y = np.log((tr["per36"] / tr["base_rate36"]).clip(0.3, 3.0))
    beta, *_ = np.linalg.lstsq(design(tr), y, rcond=None)
    print(f"rate response betas [const, log(min_mult), log(usage_mult), log(base_min)]: {np.round(beta,4).tolist()}", flush=True)

    resp = np.exp(design(te) @ beta)
    p0 = te["base_min"] * te["base_rate36"] / 36
    p1 = te["alloc_actual"] * te["base_rate36"] / 36
    p2 = te["alloc_actual"] * te["base_rate36"] * resp / 36
    act = te["PTS"]

    def rep(name, pred):
        print(f"  {name:<34} MAE {np.abs(pred-act).mean():6.3f}  RMSE {np.sqrt(((pred-act)**2).mean()):6.3f}", flush=True)

    print(f"\nPOINTS PREDICTION on {te_s} absence games (out-of-sample)")
    rep("P0 ignore the absence", p0)
    rep("P1 minutes multiplier only", p1)
    rep("P2 minutes + fitted rate response", p2)
    imp1 = (np.abs(p0-act).mean() - np.abs(p1-act).mean())
    imp2 = (np.abs(p1-act).mean() - np.abs(p2-act).mean())
    print(f"\n  minutes multiplier gains {imp1:+.3f} MAE points")
    print(f"  rate response adds       {imp2:+.3f} MAE points   {'-> SHIP' if imp2 > 0.005 else '-> DOES NOT EARN ITS PLACE, ship minutes only'}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
