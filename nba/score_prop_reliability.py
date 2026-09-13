#!/usr/bin/env python3
"""
PROP RELIABILITY SCORE — sets the confidence penalty by MEASUREMENT, not by fiat.

"Penalized" is meaningless until it is a number. This scores every prop on the same scale, so a prop's
penalty follows from how much worse it actually is than the certified set - fair to the prop, and
reusable for every prop we add later.

METRICS, all computed leg-level against the box scores (same source as check_prop_calibration):
  ECE   n-weighted mean |predicted - actual| across confidence bands  <- the honest "how far off"
  worst the worst single band gap (what the certification gate uses)
  Brier mean (p - outcome)^2                                          <- accuracy, not just calibration
  LL    log loss
  lift  Brier vs a naive always-predict-base-rate model               <- is the prop worth modelling

PENALTY RULE (derived, not assumed):
  a prop's stated confidence is discounted so that its DELIVERED hit rate matches what it claims.
  penalty_pp = the prop's ECE minus the median ECE of the certified set. A prop that is 1.5 pp less
  reliable than the certified median has its confidence read 1.5 pp lower - no more, no less.

Env: DATABASE_URL, REL_SEASONS, REL_PROPS (blank = all in baseline_history)
"""
import json
import os
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
# DERIVED props the box-score columns do not carry directly. Ten props (5.4M rows - a THIRD of
# baseline_history) were silently skipped by the first version of this scorer because it only looked for
# a matching column: the 7 period props, fantasy_score, double_double and stocks. Unverified is not the
# same as fine, so they are graded here.
FANTASY_W = {"PTS": 1.0, "REB": 1.2, "AST": 1.5, "STL": 3.0, "BLK": 3.0, "TOV": -1.0}   # PrizePicks AND Underdog
PERIOD_PROPS = {"points_q1": ("PTS", "q1"), "points_h1": ("PTS", "h1"), "points_h2": ("PTS", "h2"),
                "points_q4": ("PTS", "q4"), "points_q4_otx": ("PTS", "q4"),
                "rebounds_q1": ("REB", "q1"), "assists_q1": ("AST", "q1"), "threes_made_q1": ("FG3M", "q1")}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    seasons = [s.strip() for s in os.environ.get("REL_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    want = [p.strip() for p in os.environ.get("REL_PROPS", "").split(",") if p.strip()]

    rows = []
    for season in seasons:
        slug = season.replace("-", "_")
        logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
        logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
        for name, cols in COMBO.items():
            logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)
        # fantasy score - identical formula for PrizePicks and Underdog (verified 2026-09-11)
        logs["FANTASY_SCORE"] = sum(logs[c].fillna(0) * w for c, w in FANTASY_W.items())
        # double-double: two or more of PTS/REB/AST/STL/BLK at 10+
        logs["DOUBLE_DOUBLE"] = (sum((logs[c].fillna(0) >= 10).astype(int)
                                     for c in ("PTS", "REB", "AST", "STL", "BLK")) >= 2).astype(int)
        # period props: quarter box scores exist as nba_player_game_log_q{1..4}_{season}.json
        # (scrape_nba_periods.py). Without them these 7 props (~3.8M rows) sit in the table with NO
        # independent verdict - built from a certified recipe, but never re-checked from stored data.
        period_avail = False
        try:
            q = {}
            for qq in (1, 2, 3, 4):
                qd = pd.DataFrame(fetch(f"nba_player_game_log_q{qq}_{slug}.json")["records"])
                qd["GAME_DATE"] = pd.to_datetime(qd["GAME_DATE"]).dt.date
                qd["PLAYER_ID"] = qd["PLAYER_ID"].astype(str)
                q[qq] = qd.set_index(["GAME_DATE", "PLAYER_ID"])
            idx = logs.set_index(["GAME_DATE", "PLAYER_ID"]).index
            for stat in ("PTS", "REB", "AST", "FG3M"):
                for tag, parts in (("q1", [1]), ("h1", [1, 2]), ("h2", [3, 4]), ("q4", [4])):
                    s = None
                    for part in parts:
                        col = q[part][stat].reindex(idx).fillna(0) if stat in q[part].columns else None
                        if col is None:
                            s = None
                            break
                        s = col if s is None else s + col
                    if s is not None:
                        logs[f"{stat}_{tag.upper()}"] = s.values
            period_avail = True
            print(f"  {season}: quarter logs loaded - period props will be graded", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  {season}: quarter logs unavailable ({str(exc)[:70]}) - period props UNVERIFIED", flush=True)
        props = want or [r[0] for r in conn.execute(
            "SELECT DISTINCT prop FROM nba_score.baseline_history WHERE season=%s ORDER BY 1", (season,)).fetchall()]
        for prop in props:
            if prop in PERIOD_PROPS and not period_avail:
                print(f"  {season} {prop}: SKIPPED - needs quarter-level data (period box scores), "
                      f"not derivable from season totals. UNVERIFIED, not certified.", flush=True)
                continue
            col = "DOUBLE_DOUBLE" if prop == "double_double" else (
                "FANTASY_SCORE" if prop == "fantasy_score" else (
                    f"{PERIOD_PROPS[prop][0]}_{PERIOD_PROPS[prop][1].upper()}" if prop in PERIOD_PROPS
                    else COL.get(prop, prop.upper())))
            if col not in logs.columns:
                print(f"  {season} {prop}: no box-score basis ({col}) - UNVERIFIED", flush=True)
                continue
            h = pd.read_sql("""SELECT game_date, player_id, line, p_more FROM nba_score.baseline_history
                               WHERE season=%s AND prop=%s""", conn, params=(season, prop))
            if h.empty:
                continue
            h["game_date"] = pd.to_datetime(h["game_date"]).dt.date
            h["player_id"] = h["player_id"].astype(str)
            d = h.merge(logs[["GAME_DATE", "PLAYER_ID", col]], left_on=["game_date", "player_id"],
                        right_on=["GAME_DATE", "PLAYER_ID"], how="inner")
            if len(d) < 5000:
                continue
            hit = (d[col] > d["line"]).astype(int).values if prop != "double_double" \
                else (d[col] >= 1).astype(int).values     # Yes/No market: the 0.5 line means "did it happen"
            p = d["p_more"].astype(float).values
            # score the SIDE the model favours, which is how a leg is actually offered
            p_side = np.where(p >= 0.5, p, 1 - p)
            hit_side = np.where(p >= 0.5, hit, 1 - hit)
            band = pd.cut(p_side, [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1.01], right=False)
            t = pd.DataFrame({"band": band, "p": p_side, "h": hit_side}).groupby("band", observed=True).agg(
                n=("h", "size"), pred=("p", "mean"), act=("h", "mean"))
            t = t[t["n"] >= 200]
            if t.empty:
                continue
            gap = (t["act"] - t["pred"]).abs()
            ece = float((gap * t["n"]).sum() / t["n"].sum()) * 100
            worst = float(gap.max()) * 100
            brier = float(np.mean((p_side - hit_side) ** 2))
            base = float(hit_side.mean())
            brier_base = float(np.mean((base - hit_side) ** 2))
            ll = float(-np.mean(hit_side * np.log(np.clip(p_side, 1e-6, 1)) +
                                (1 - hit_side) * np.log(np.clip(1 - p_side, 1e-6, 1))))
            rows.append({"season": season, "prop": prop, "n": len(d), "ECE_pp": ece, "worst_pp": worst,
                         "brier": brier, "lift_%": 100 * (brier_base - brier) / brier_base, "logloss": ll})
    conn.close()

    df = pd.DataFrame(rows)
    if df.empty:
        print("no props scored")
        return
    agg = df.groupby("prop").agg(seasons=("season", "nunique"), n=("n", "sum"), ECE_pp=("ECE_pp", "mean"),
                                 worst_pp=("worst_pp", "max"), brier=("brier", "mean"),
                                 lift=("lift_%", "mean")).sort_values("ECE_pp")
    certified = agg[(agg["worst_pp"] <= 2.5) & (agg["seasons"] == len(seasons))]
    med = float(certified["ECE_pp"].median()) if not certified.empty else float(agg["ECE_pp"].median())
    print(f"certified set: {len(certified)} props | median ECE {med:.2f} pp\n")
    print(f"{'prop':<15}{'n':>10}{'ECE pp':>9}{'worst pp':>10}{'brier':>8}{'lift %':>8}   penalty")
    for prop, r in agg.iterrows():
        pen = max(0.0, r["ECE_pp"] - med)
        tag = "certified" if (r["worst_pp"] <= 2.5 and r["seasons"] == len(seasons)) else f"-{pen:.1f} pp"
        print(f"{prop:<15}{int(r['n']):>10,}{r['ECE_pp']:>9.2f}{r['worst_pp']:>10.2f}"
              f"{r['brier']:>8.4f}{r['lift']:>8.1f}   {tag}")


if __name__ == "__main__":
    main()
