#!/usr/bin/env python3
"""
REDISTRIBUTION VIA THE ALLOCATOR — the counterfactual that produces the A2 multiplier.

The allocator (nba/fit_minutes_allocator.py) predicts how a team's 240 minutes divide among the
available roster, and conserves by construction (verified: mean ratio 0.9930). The redistribution
factor is then a DIFFERENCE OF TWO ALLOCATIONS, not an observational delta:

    alloc_full(P)  = allocation over {players who played} UNION {players ruled out pre-game}
    alloc_actual(P)= allocation over {players who played}
    minutes_multiplier(P | absences) = alloc_actual(P) / alloc_full(P)

Because both allocations sum to the same team minutes, the multipliers are conserving by definition:
what the absent players would have taken is exactly what the remaining players gain. This is why five
observational panels could not conserve and this can.

THE TEST THAT MATTERS (sample first, owner rule):
  On team-games WITH absences, does alloc_actual predict actual minutes better than
    (a) the player's as-of mean, and
    (b) alloc_full (i.e. ignoring the absences)?
  If (b) is not beaten, the redistribution logic adds nothing and must not ship.

Also emits the implied usage multiplier: usage follows minutes but not 1:1 - the vacated POSSESSIONS
are allocated with a separate weight vector (research: the player who inherits the minutes is often not
the one who inherits the shots).

Env: DATABASE_URL, ALLOC_SEASONS, ALLOC_SAMPLE_DATES, ALLOC_WRITE (1 = write nba_score.redistribution_factors)
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
BOUNDS = {"2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}
BENCH_PRIOR_MIN, BENCH_PRIOR_POSS = 8.0, 4.0


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def weights(base, recent, games, beta):
    lb = np.log(np.clip(base, 1, None))
    lr = np.log(np.clip(recent, 1, None))
    lg = np.log1p(games)
    return np.exp(beta[0] + beta[1] * lb + beta[2] * lr + beta[3] * lg)


def main():
    season = os.environ.get("ALLOC_SEASONS", "2025-26").split(",")[0].strip()
    sample = int(os.environ.get("ALLOC_SAMPLE_DATES", "60"))
    slug = season.replace("-", "_")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    nm_to_id = dict(pd.read_sql("SELECT norm_name, player_id FROM nba_ref.player_name_map", conn).values)

    logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
    logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
    logs["GAME_ID"] = logs["GAME_ID"].astype(str)
    logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
    logs["POSS"] = logs["FGA"].fillna(0) + 0.44 * logs["FTA"].fillna(0) + logs["TOV"].fillna(0)
    logs = logs.sort_values("GAME_DATE")

    idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
    irows = []
    for shard in idx.get("shards", []):
        try:
            irows.extend(fetch(f"nba_injury_report_{slug}_{shard}.json").get("rows") or [])
        except Exception as exc:  # noqa: BLE001
            print(f"  shard {shard}: {exc}", flush=True)
    inj = pd.DataFrame(irows)
    inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
    inj["nm"] = inj["player_name"].map(flip_last_first)
    inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()
    print(f"{season}: logs {len(logs):,} | injury {len(inj):,}", flush=True)

    BETA_MIN = np.array([0.2214, 0.3953, 0.5160, 0.0043])     # fitted by fit_minutes_allocator.py
    hist = defaultdict(lambda: [0.0, 0.0, 0])                  # pid -> [min, poss, games]
    recent_m, recent_p = defaultdict(list), defaultdict(list)
    last_team = {}

    lo, hi = BOUNDS[season]
    dates = [d for d in sorted(logs["GAME_DATE"].unique()) if str(lo) <= str(d) <= str(hi)]
    if sample:
        dates = dates[:sample]
    out = []
    for gd in dates:
        day = logs[logs["GAME_DATE"] == gd]
        played = set(day["PLAYER_ID"])
        rep = inj[inj["game_date"] == gd]
        ruled = {nm_to_id.get(r.nm) for r in rep.itertuples(index=False)
                 if r.status_u in ("OUT", "DOUBTFUL") and nm_to_id.get(r.nm)}
        for gid, gdf in day.groupby("GAME_ID"):
            for t, tdf in gdf.groupby("TEAM"):
                team_min = float(tdf["MIN"].sum())
                team_poss = float(tdf["POSS"].sum())
                if team_min < 200:
                    continue
                avail, absent = [], []
                for r in tdf.itertuples(index=False):
                    h = hist.get(r.PLAYER_ID, [0.0, 0.0, 0])
                    avail.append({"pid": r.PLAYER_ID, "act_min": float(r.MIN), "act_poss": float(r.POSS),
                                  "base": (h[0] / h[2]) if h[2] else BENCH_PRIOR_MIN,
                                  "bposs": (h[1] / h[2]) if h[2] else BENCH_PRIOR_POSS,
                                  "recent": np.mean(recent_m[r.PLAYER_ID][-5:]) if recent_m[r.PLAYER_ID] else (h[0] / h[2] if h[2] else BENCH_PRIOR_MIN),
                                  "games": h[2]})
                for pid in ruled:
                    if pid in played or last_team.get(pid) != t:
                        continue
                    h = hist.get(pid)
                    if not h or h[2] == 0 or h[0] / h[2] < 8:
                        continue
                    absent.append({"pid": pid, "base": h[0] / h[2], "bposs": h[1] / h[2],
                                   "recent": np.mean(recent_m[pid][-5:]) if recent_m[pid] else h[0] / h[2],
                                   "games": h[2]})
                if not avail:
                    continue
                a = pd.DataFrame(avail)
                w_a = weights(a["base"].values, a["recent"].values, a["games"].values, BETA_MIN)
                alloc_actual = w_a / w_a.sum() * team_min
                if absent:
                    full = pd.DataFrame(avail + absent)
                    w_f = weights(full["base"].values, full["recent"].values, full["games"].values, BETA_MIN)
                    alloc_full_all = w_f / w_f.sum() * team_min
                    alloc_full = alloc_full_all[: len(a)]
                else:
                    alloc_full = alloc_actual
                # usage: vacated possessions allocated on the players' own usage weight
                wp_a = np.clip(a["bposs"].values, 0.5, None)
                vac_poss = sum(x["bposs"] for x in absent)
                usage_mult = 1 + (vac_poss * wp_a / wp_a.sum()) / np.clip(a["bposs"].values, 0.5, None) if absent else np.ones(len(a))
                for i, r in a.iterrows():
                    out.append({"season": season, "game_date": gd, "game_id": gid, "team": t,
                                "player_id": r["pid"], "n_out": len(absent), "games": r["games"],
                                "act_min": r["act_min"], "act_poss": r["act_poss"],
                                "base": r["base"], "alloc_full": alloc_full[i], "alloc_actual": alloc_actual[i],
                                "min_mult": alloc_actual[i] / alloc_full[i] if alloc_full[i] else 1.0,
                                "usage_mult": float(usage_mult[i]) if absent else 1.0,
                                "vacated_min": sum(x["base"] for x in absent), "vacated_poss": vac_poss})
        for gid, gdf in day.groupby("GAME_ID"):
            for r in gdf.itertuples(index=False):
                last_team[r.PLAYER_ID] = r.TEAM
                h = hist[r.PLAYER_ID]
                h[0] += float(r.MIN); h[1] += float(r.POSS); h[2] += 1
                recent_m[r.PLAYER_ID].append(float(r.MIN))
                recent_p[r.PLAYER_ID].append(float(r.POSS))

    df = pd.DataFrame(out)
    df = df[df["games"] >= 1]
    abs_games = df[df["n_out"] >= 1]
    print(f"\nrows {len(df):,} | with absences {len(abs_games):,} | team-games {df.groupby(['game_id','team']).ngroups:,}", flush=True)

    def mae(x, y):
        return float(np.abs(x - y).mean())

    print("\nMINUTES PREDICTION ON TEAM-GAMES WITH ABSENCES (the case that matters)")
    print(f"  as-of mean            MAE {mae(abs_games['base'], abs_games['act_min']):6.3f}")
    print(f"  alloc IGNORING outs   MAE {mae(abs_games['alloc_full'], abs_games['act_min']):6.3f}")
    print(f"  alloc WITH outs       MAE {mae(abs_games['alloc_actual'], abs_games['act_min']):6.3f}   <- must be lowest")
    print(f"\nconservation: sum(alloc_actual)/team minutes = "
          f"{(df.groupby(['game_id','team'])['alloc_actual'].sum() / df.groupby(['game_id','team'])['act_min'].sum()).mean():.6f}")
    q = abs_games.groupby(pd.cut(abs_games["base"], [0, 10, 20, 28, 60]))["min_mult"].agg(["mean", "count"])
    print("\nimplied minutes multiplier by baseline-minutes band:")
    print(q.round(4).to_string())

    if os.environ.get("ALLOC_WRITE", "0") == "1" and len(df):
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.redistribution_factors (
                season text, game_date date, game_id text, team text, player_id text, n_out int,
                base_min numeric, alloc_full numeric, alloc_actual numeric,
                min_mult numeric, usage_mult numeric, vacated_min numeric, vacated_poss numeric,
                built_at timestamptz DEFAULT now())""")
            cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS redistribution_factors_uidx
                ON nba_score.redistribution_factors (game_id, player_id)""")
            cur.executemany("""INSERT INTO nba_score.redistribution_factors
                (season, game_date, game_id, team, player_id, n_out, base_min, alloc_full, alloc_actual,
                 min_mult, usage_mult, vacated_min, vacated_poss)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (game_id, player_id) DO UPDATE SET min_mult=EXCLUDED.min_mult,
                  usage_mult=EXCLUDED.usage_mult, alloc_full=EXCLUDED.alloc_full, alloc_actual=EXCLUDED.alloc_actual""",
                [(r["season"], r["game_date"], r["game_id"], r["team"], r["player_id"], int(r["n_out"]),
                  r["base"], r["alloc_full"], r["alloc_actual"], r["min_mult"], r["usage_mult"],
                  r["vacated_min"], r["vacated_poss"]) for _, r in df.iterrows()])
        conn.commit()
        print(f"\nwrote {len(df):,} rows to nba_score.redistribution_factors", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
