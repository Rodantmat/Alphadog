#!/usr/bin/env python3
"""
A2 UNDER WINDOW-TIME INFORMATION — the factor's TRUE value, not its upper bound.

THE PROBLEM THIS CLOSES
  A2 was fitted and graded using WHO ACTUALLY PLAYED (post-game truth) and gained up to +0.347 MAE on
  PRA. At 2:30 PM PT the engine does not have that. It has the day-of report, where a rotation player
  listed Questionable plays 55.2% of the time. So the measured gain is an UPPER BOUND. This rebuilds the
  allocator's absence input from the report as-of the window and re-runs the same held-out per-prop gate.

EXPECTED-ABSENCE WEIGHTING (factor N1, measured in measure_n1_status_resolution.py):
  each listed player contributes p_out = 1 - P(plays | status, role) to the vacated pool, and keeps
  (1 - p_out) of his own expected minutes:
      OUT / DOUBTFUL          p_out = 1.00 / 0.995
      QUESTIONABLE rotation   p_out = 0.448      (plays 55.2%)
      QUESTIONABLE fringe     p_out = 0.688      (plays 31.2%)
      AVAILABLE / PROBABLE    p_out = 0.04       (rotation players; ~0.96 play)
  The allocation then runs over a roster with FRACTIONAL availability - a Questionable star removes
  roughly half his minutes from the pool, which is exactly what the engine should believe at 2:30.

THREE ARMS COMPARED, held out on the test season:
  A  no absence knowledge            (baseline minutes)
  B  PERFECT knowledge               (who actually played - the upper bound already measured)
  C  WINDOW knowledge                (report as-of 2:30 PM PT, N1-weighted)   <- the real number
  C should sit between A and B. The gap B - C is the cost of uncertainty; the gap C - A is what the
  factor is actually worth in production.

Env: DATABASE_URL, A2W_TRAIN_SEASON, A2W_TEST_SEASON, A2W_SAMPLE_DATES
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
BETA = np.array([0.2214, 0.3953, 0.5160, 0.0043])
COMBOS = {"pra": ("PTS", "REB", "AST"), "pts_reb": ("PTS", "REB"), "pts_ast": ("PTS", "AST"),
          "reb_ast": ("REB", "AST")}
PROPS = {"points": "PTS", "rebounds": "REB", "assists": "AST", "threes_made": "FG3M", "fga": "FGA"}
P_OUT = {"OUT": 1.00, "DOUBTFUL": 0.995, "AVAILABLE": 0.04, "PROBABLE": 0.04}
Q_ROT, Q_FRINGE = 0.448, 0.688


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def weights(base, recent, games):
    return np.exp(BETA[0] + BETA[1] * np.log(np.clip(base, 1, None))
                  + BETA[2] * np.log(np.clip(recent, 1, None)) + BETA[3] * np.log1p(games))


def build(season, sample):
    slug = season.replace("-", "_")
    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    for name, cols in COMBOS.items():
        logs[name.upper()] = sum(logs[c].fillna(0) for c in cols)
    logs = logs.sort_values("GAME_DATE")

    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    rows = []
    for shard in idx.get("shards", []):
        try:
            rows.extend(fetch(f"nba_injury_report_{slug}_{shard}.json").get("rows") or [])
        except Exception as exc:  # noqa: BLE001
            print(f"  shard {shard}: {exc}", flush=True)
    inj = pd.DataFrame(rows)
    inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
    inj["snapshot_ts"] = pd.to_datetime(inj["snapshot_ts"], errors="coerce", utc=True)
    inj["nm"] = inj["player_name"].map(flip_last_first)
    inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()
    inj["cutoff"] = pd.to_datetime(inj["game_date"].astype(str)).dt.tz_localize("UTC") + pd.Timedelta(hours=22, minutes=30)
    inj = inj[inj["snapshot_ts"] <= inj["cutoff"]].sort_values("snapshot_ts")

    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}
    inj["pid"] = inj["nm"].map(pid_map)
    inj = inj[inj["pid"].notna()]
    status_by_day = {d: dict(zip(g["pid"], g["status_u"])) for d, g in inj.groupby("game_date")}

    hist = defaultdict(lambda: [0.0, 0])
    recent = defaultdict(list)
    last_team = {}
    out = []
    dates = sorted(logs["GAME_DATE"].unique())
    if sample:
        dates = dates[:sample]
    for gd in dates:
        day = logs[logs["GAME_DATE"] == gd]
        played = set(day["PLAYER_ID"])
        st = status_by_day.get(gd, {})
        for gid, gdf in day.groupby("GAME_ID"):
            for t, tdf in gdf.groupby("TEAM"):
                team_min = float(tdf["MIN"].sum())
                if team_min < 200:
                    continue
                roster = []
                for r in tdf.itertuples(index=False):
                    h = hist.get(r.PLAYER_ID, [0.0, 0])
                    b = (h[0] / h[1]) if h[1] else 8.0
                    roster.append({"pid": r.PLAYER_ID, "base": b,
                                   "recent": np.mean(recent[r.PLAYER_ID][-5:]) if recent[r.PLAYER_ID] else b,
                                   "games": h[1], "played": True, "act": float(r.MIN)})
                # listed-but-absent players on this team, with their as-of level
                for pid, status in st.items():
                    if pid in played or last_team.get(pid) != t:
                        continue
                    h = hist.get(pid)
                    if not h or h[1] == 0 or h[0] / h[1] < 8:
                        continue
                    b = h[0] / h[1]
                    roster.append({"pid": pid, "base": b,
                                   "recent": np.mean(recent[pid][-5:]) if recent[pid] else b,
                                   "games": h[1], "played": False, "act": 0.0, "status": status})
                if not any(x["played"] for x in roster):
                    continue
                df = pd.DataFrame(roster)
                w = weights(df["base"].values, df["recent"].values, df["games"].values)
                # arm A: no absence knowledge -> everyone in the pool
                alloc_A = w / w.sum() * team_min
                # arm B: perfect knowledge -> only those who played
                mask_B = df["played"].values.astype(float)
                alloc_B = np.where(mask_B > 0, w * mask_B / max((w * mask_B).sum(), 1e-9) * team_min, 0.0)
                # arm C: window knowledge -> fractional availability from the report
                avail = np.ones(len(df))
                for i, row in df.iterrows():
                    s = row.get("status")
                    if not isinstance(s, str):
                        s = st.get(row["pid"], "")
                    if s in P_OUT:
                        avail[i] = 1 - P_OUT[s]
                    elif s == "QUESTIONABLE":
                        avail[i] = 1 - (Q_ROT if row["base"] >= 15 else Q_FRINGE)
                wc = w * avail
                alloc_C = wc / max(wc.sum(), 1e-9) * team_min
                for i, row in df.iterrows():
                    if not row["played"]:
                        continue
                    out.append({"GAME_DATE": gd, "GAME_ID": gid, "PLAYER_ID": row["pid"],
                                "base": row["base"], "A": alloc_A[i], "B": alloc_B[i], "C": alloc_C[i]})
        for r in day.itertuples(index=False):
            last_team[r.PLAYER_ID] = r.TEAM
            h = hist[r.PLAYER_ID]
            h[0] += float(r.MIN); h[1] += 1
            recent[r.PLAYER_ID].append(float(r.MIN))
    return logs, pd.DataFrame(out)


def main():
    te_s = os.environ.get("A2W_TEST_SEASON", "2025-26")
    sample = int(os.environ.get("A2W_SAMPLE_DATES", "0"))
    logs, alloc = build(te_s, sample)
    d = logs.merge(alloc, on=["GAME_DATE", "GAME_ID", "PLAYER_ID"], how="inner")
    d = d[(d["MIN"] >= 6) & (d["base"] >= 6)].sort_values("GAME_DATE")
    print(f"{te_s}: {len(d):,} player-games scored\n", flush=True)
    print(f"minutes MAE   A no-knowledge {np.abs(d['A']-d['MIN']).mean():.3f} | "
          f"C window {np.abs(d['C']-d['MIN']).mean():.3f} | B perfect {np.abs(d['B']-d['MIN']).mean():.3f}\n", flush=True)

    print(f"{'prop':<12}{'n':>8}{'A none':>9}{'C window':>10}{'B perfect':>11}{'C gain':>9}{'% of B':>8}")
    targets = {**PROPS, **{k: k.upper() for k in COMBOS}}
    for prop, col in targets.items():
        x = d.copy()
        x["per36"] = np.where(x["MIN"] > 0, x[col] / x["MIN"] * 36, np.nan)
        x["rate"] = x.groupby("PLAYER_ID")["per36"].transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
        x = x[x["rate"].notna()]
        if len(x) < 500:
            continue
        mA = np.abs(x["base"] * x["rate"] / 36 - x[col]).mean()
        mC = np.abs(x["C"] * x["rate"] / 36 - x[col]).mean()
        mB = np.abs(x["B"] * x["rate"] / 36 - x[col]).mean()
        gc, gb = mA - mC, mA - mB
        print(f"{prop:<12}{len(x):>8,}{mA:>9.3f}{mC:>10.3f}{mB:>11.3f}{gc:>+9.3f}{(100*gc/gb if gb > 0 else float('nan')):>7.0f}%")


if __name__ == "__main__":
    main()
