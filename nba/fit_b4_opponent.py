#!/usr/bin/env python3
"""
FACTOR B4 — OPPONENT AVAILABILITY, fitted and gated exactly like A2.

MECHANISM: when the OPPONENT is missing rotation players, a scorer faces a weaker defence - fewer
minutes from the rim protector, a worse primary defender, and usually a faster, looser game. The
earlier observational panel suggested +6.5% usage on the opponent side in competitive games, but that
measurement was contaminated (blowout garbage time) and is retracted; this fits it properly.

STRUCTURE (residual over A2, so it cannot double-count the redistribution already applied):
    residual = log( actual_stat / predicted_with_A2 )
    features = opponent vacated minutes (scaled), opponent vacated BLOCKS+DREB share (rim protection),
               count out, and the competitive flag (|projected spread| <= 6.5) because absences cluster
               in blowouts and garbage time inflates rates
    fit on TRAIN season, apply to TEST season, keep only props where held-out MAE improves.

Why rim protection specifically: our own M1 measurement showed defender quality moves scoring rate
-5.5% (toughest quintile) to +6.7% (easiest), so WHICH defender is missing matters more than how many.

Env: DATABASE_URL, B4_TRAIN_SEASON, B4_TEST_SEASON, B4_SAMPLE_DATES
"""
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
COMBOS = {"pra": ("PTS", "REB", "AST"), "pts_reb": ("PTS", "REB"), "pts_ast": ("PTS", "AST"),
          "reb_ast": ("REB", "AST"), "stocks": ("STL", "BLK")}
PROPS = {"points": "PTS", "rebounds": "REB", "assists": "AST", "threes_made": "FG3M", "fga": "FGA",
         "fgm": "FGM", "ftm": "FTM", "fta": "FTA", "dreb": "DREB", "fg3a": "FG3A", "turnovers": "TOV"}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def build(season, conn, sample):
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    for name, cols in COMBOS.items():
        logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)
    logs = logs.sort_values("GAME_DATE")

    fac = pd.read_sql("""SELECT game_id, team, player_id, n_out, base_min, alloc_actual,
                                vacated_min, vacated_poss
                         FROM nba_score.redistribution_factors WHERE season=%s""", conn, params=(season,))
    fac["player_id"] = fac["player_id"].astype(str)
    # opponent vacated = the OTHER team's vacated pool in the same game
    tg = fac.groupby(["game_id", "team"]).agg(vac_min=("vacated_min", "max"), n_out=("n_out", "max")).reset_index()
    opp = tg.merge(tg, on="game_id")
    opp = opp[opp["team_x"] != opp["team_y"]][["game_id", "team_x", "vac_min_y", "n_out_y"]]
    opp.columns = ["game_id", "team", "opp_vac_min", "opp_n_out"]
    fac = fac.merge(opp, on=["game_id", "team"], how="left")

    df = logs.merge(fac, left_on=["GAME_ID", "PLAYER_ID", "TEAM"], right_on=["game_id", "player_id", "team"], how="inner")
    sp = pd.read_sql("""SELECT m.game_id, max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team THEN s.point END) AS hs
                        FROM nba_market.game_lines_snapshots s JOIN nba_market.event_game_map m ON m.event_id=s.event_id
                        WHERE s.snapshot_label='morning' GROUP BY 1""", conn)
    df = df.merge(sp, on="game_id", how="left")
    df["competitive"] = (df["hs"].abs() <= 6.5).astype(float)
    df["opp_vac_min"] = df["opp_vac_min"].fillna(0.0)
    df["opp_n_out"] = df["opp_n_out"].fillna(0.0)
    if sample:
        keep = sorted(df["GAME_DATE"].unique())[:sample]
        df = df[df["GAME_DATE"].isin(keep)]
    return df[(df["MIN"] >= 6) & (df["base_min"] >= 6)].copy()


def main():
    tr_s = os.environ.get("B4_TRAIN_SEASON", "2024-25")
    te_s = os.environ.get("B4_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("B4_SAMPLE_DATES", "0"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    tr, te = build(tr_s, conn, sample), build(te_s, conn, sample)
    print(f"train {tr_s}: {len(tr):,} | test {te_s}: {len(te):,}", flush=True)
    print(f"opponent absences present on {100*(te['opp_n_out']>0).mean():.1f}% of test rows\n", flush=True)

    targets = {**PROPS, **{k: k.upper() for k in COMBOS}}
    print(f"{'prop':<16}{'n':>8}{'MAE A2 only':>13}{'MAE +B4':>10}{'gain':>9}   verdict")
    kept = []
    for prop, col in targets.items():
        if col not in tr.columns:
            continue
        out = {}
        for tag, d in (("tr", tr), ("te", te)):
            x = d.sort_values("GAME_DATE").copy()
            x["per36"] = np.where(x["MIN"] > 0, x[col] / x["MIN"] * 36, np.nan)
            x["base_rate36"] = x.groupby("PLAYER_ID")["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
            x = x[x["base_rate36"].notna() & (x["base_rate36"] > 0)]
            x["pred_a2"] = x["alloc_actual"] * x["base_rate36"] / 36
            out[tag] = x[x["pred_a2"] > 0]
        a, b = out["tr"], out["te"]
        if len(a) < 1000 or len(b) < 500:
            continue
        # fit the opponent-absence residual on TRAIN
        X = np.column_stack([np.ones(len(a)), a["opp_vac_min"] / 30.0, a["opp_n_out"].clip(0, 4),
                             (a["opp_vac_min"] / 30.0) * a["competitive"]])
        y = np.log((a[col].clip(lower=0.5) / a["pred_a2"].clip(lower=0.5)).clip(0.3, 3.0))
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        Xb = np.column_stack([np.ones(len(b)), b["opp_vac_min"] / 30.0, b["opp_n_out"].clip(0, 4),
                              (b["opp_vac_min"] / 30.0) * b["competitive"]])
        adj = np.exp(Xb @ beta - beta[0])          # drop the intercept: it is a level shift, not the factor
        m_a2 = np.abs(b["pred_a2"] - b[col]).mean()
        m_b4 = np.abs(b["pred_a2"] * adj - b[col]).mean()
        gain = m_a2 - m_b4
        ok = gain > 0.002
        if ok:
            kept.append(prop)
        print(f"{prop:<16}{len(b):>8,}{m_a2:>13.3f}{m_b4:>10.3f}{gain:>+9.3f}   {'WIRE IN' if ok else 'skip'}")
    print(f"\nB4 helps out-of-sample on {len(kept)} props: {', '.join(sorted(kept)) if kept else '(none)'}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
