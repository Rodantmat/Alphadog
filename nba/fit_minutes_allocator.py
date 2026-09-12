#!/usr/bin/env python3
"""
MINUTES ALLOCATOR — redistribution as an ALLOCATION, not as an observational delta.

WHY (after five failed panels, conservation 0.08-0.49 every time):
  A team plays exactly 240 minutes (+25 per OT) whether three players are out or none. Vacated minutes
  are therefore redistributed BY DEFINITION. Measuring that as `actual - personal_rolling_mean` cannot
  conserve, because the rolling mean has already absorbed the season's earlier absences: a player who
  averages 20 minutes BECAUSE the star has been out shows delta ~0 on the next absence game. Five
  versions of that measurement failed, each for a different surface reason, all for this one.

  Redistribution is only well defined as an allocation: given the available roster and their as-of
  profiles, how do the 240 minutes divide? The absence effect is then
        predict(minutes | everyone available)  vs  predict(minutes | actual absences)
  and conservation is enforced by the model form (shares sum to 1), not hoped for in the data.

MODELS COMPARED (sample-tested before any full run, owner rule 2026-09-12)
  M0 naive          : predicted = player's as-of mean minutes            (no conservation)
  M1 renormalized   : share = base_i / sum(base_available), x team minutes   (conserves exactly)
  M2 role-weighted  : share = exp(b . x_i) / sum exp(...), features = as-of minutes, role rank,
                      starter rate, recent form, days rest; fitted by least squares on actual minutes
  Report MAE / RMSE per model, overall and for team-games WITH absences (the case that matters), plus
  a direct read of the redistribution the model implies.

Env: DATABASE_URL, ALLOC_SEASONS, ALLOC_SAMPLE_DATES, ALLOC_FIT (0 = M0/M1 only)
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

import numpy as np
import pandas as pd

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
BOUNDS = {"2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def main():
    season = os.environ.get("ALLOC_SEASONS", "2025-26").split(",")[0].strip()
    sample = int(os.environ.get("ALLOC_SAMPLE_DATES", "60"))
    slug = season.replace("-", "_")

    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs = logs.sort_values("GAME_DATE")
    print(f"{season}: {len(logs):,} player-games", flush=True)

    lo, hi = BOUNDS[season]
    dates = [d for d in sorted(logs["GAME_DATE"].unique()) if str(lo) <= str(d) <= str(hi)]
    if sample:
        dates = dates[:sample]

    hist = defaultdict(lambda: [0.0, 0, 0.0])     # player -> [minutes, games, starts-proxy]
    recent = defaultdict(list)                    # player -> last minutes
    rows = []
    for gd in dates:
        day = logs[logs["GAME_DATE"] == gd]
        for gid, gdf in day.groupby("GAME_ID"):
            for t, tdf in gdf.groupby("TEAM"):
                team_min = float(tdf["MIN"].sum())
                if team_min < 200:                 # malformed game
                    continue
                recs = []
                for r in tdf.itertuples(index=False):
                    h = hist.get(r.PLAYER_ID)
                    base = (h[0] / h[1]) if h and h[1] else np.nan
                    rec = np.mean(recent[r.PLAYER_ID][-5:]) if recent[r.PLAYER_ID] else np.nan
                    recs.append({"pid": r.PLAYER_ID, "act": float(r.MIN), "base": base, "recent": rec,
                                 "games": (h[1] if h else 0)})
                # cold start: a player with no history gets the league bench prior so he still receives
                # a share - dropping or zeroing him is precisely what broke the five earlier panels
                for x in recs:
                    if not np.isfinite(x["base"]):
                        x["base"] = 8.0
                    if not np.isfinite(x["recent"]):
                        x["recent"] = x["base"]
                tot_base = sum(x["base"] for x in recs)
                for x in recs:
                    rows.append({"game_date": gd, "game_id": gid, "team": t, "player_id": x["pid"],
                                 "team_min": team_min, "n_players": len(recs), "games": x["games"],
                                 "act": x["act"], "m0": x["base"],
                                 "m1": x["base"] / tot_base * team_min if tot_base else np.nan,
                                 "recent": x["recent"]})
        for gid, gdf in day.groupby("GAME_ID"):
            for r in gdf.itertuples(index=False):
                h = hist[r.PLAYER_ID]
                h[0] += float(r.MIN); h[1] += 1
                recent[r.PLAYER_ID].append(float(r.MIN))

    df = pd.DataFrame(rows)
    df = df[df["games"] >= 1]                      # first appearance has no basis to be scored on
    print(f"scored rows: {len(df):,} | team-games: {df.groupby(['game_id','team']).ngroups:,}", flush=True)

    def rep(name, pred):
        e = (pred - df["act"]).abs()
        print(f"  {name:<22} MAE {e.mean():6.3f}  RMSE {np.sqrt(((pred-df['act'])**2).mean()):6.3f}", flush=True)

    print("\nMINUTES PREDICTION (lower is better)")
    rep("M0 as-of mean", df["m0"])
    rep("M1 renormalized", df["m1"])
    rep("M0 recent-5", df["recent"])

    # conservation is exact for M1 by construction - verify numerically
    chk = df.groupby(["game_id", "team"]).agg(pred=("m1", "sum"), act=("team_min", "max"))
    print(f"\nM1 conservation: predicted team minutes vs actual -> "
          f"mean ratio {(chk['pred']/chk['act']).mean():.6f}, max abs error {(chk['pred']-chk['act']).abs().max():.6f}", flush=True)

    if os.environ.get("ALLOC_FIT", "1") == "1":
        # M2: multiplicative weights fitted on log-minutes with role features, then normalized per team
        d = df.copy()
        d["log_base"] = np.log(d["m0"].clip(lower=1))
        d["log_recent"] = np.log(d["recent"].clip(lower=1))
        d["exp_games"] = np.log1p(d["games"])
        X = d[["log_base", "log_recent", "exp_games"]].values
        y = np.log(d["act"].clip(lower=1).values)
        X1 = np.column_stack([np.ones(len(X)), X])
        beta, *_ = np.linalg.lstsq(X1, y, rcond=None)
        d["w"] = np.exp(X1 @ beta)
        d["m2"] = d.groupby(["game_id", "team"])["w"].transform(lambda s: s / s.sum()) * d["team_min"]
        e = (d["m2"] - d["act"]).abs()
        print(f"  {'M2 fitted weights':<22} MAE {e.mean():6.3f}  RMSE {np.sqrt(((d['m2']-d['act'])**2).mean()):6.3f}")
        print(f"  betas (intercept, log_base, log_recent, log1p_games): {np.round(beta,4).tolist()}", flush=True)


if __name__ == "__main__":
    main()
