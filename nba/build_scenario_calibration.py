#!/usr/bin/env python3
"""
SCENARIO PRECOMPUTE — enumerate every availability branch for calibration, KEEP ONLY THE REALISED ONE.

THE DESIGN (owner, 2026-09-14). At 2:30 PM the engine must not compute anything heavy; it must LOOK UP
the branch that reality picked. So phase 2 (mid-morning, after the 1 PM ET report) enumerates the joint
availability scenarios per game and scores the full matrix; phase 3 selects.

For BACKTEST we already know the outcome, so the enumeration exists only to CALIBRATE the selection
logic - to learn how a Questionable resolves by phase of season, by player role, by team, by reason. Once
that is fitted, the unrealised branches are dead weight: at ~0.5-1M rows per day they would be hundreds
of millions of rows of universe that nothing will ever read again.

    ENUMERATE every branch  ->  CALIBRATE on all of them  ->  KEEP ONLY the realised branch  ->  DELETE the rest

WHAT A SCENARIO IS: per GAME (not per player), the joint resolution of every UNCERTAIN player on BOTH
teams. Out/Doubtful are certain (measured P(play) 0.001 / 0.005). Questionable is the coin flip (0.552
rotation / 0.312 fringe). With k questionable rotation players the branch count is 2^k, capped at 64;
above the cap the least-likely branches are pruned and their mass folded into the nearest kept branch.

Each branch carries its probability - the product of the per-player P(play) from factor N1 - so the
calibration can ask the question that matters: does selecting the realised branch beat scoring the
single most-likely branch, and by how much, in each phase and role?

Env: DATABASE_URL, SC_SEASONS, SC_MAX_BRANCHES (64), SC_KEEP_ONLY_REALISED (1)
"""
import itertools
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
# measured by factor N1 (nba/measure_n1_status_resolution.py) at the 2:30 PM PT cutoff
P_PLAY = {"OUT": 0.001, "DOUBTFUL": 0.005, "QUESTIONABLE_ROTATION": 0.552,
          "QUESTIONABLE_FRINGE": 0.312, "PROBABLE": 0.961, "AVAILABLE": 0.956}


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def flip_last_first(s):
    s = str(s or "").strip()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    return norm_name(s)


def phase_of(dt):
    m, day = dt.month, dt.day
    if m in (10, 11):
        return "1_oct_nov"
    if m == 12 or m == 1 or (m == 2 and day < 15):
        return "2_dec_asb"
    if (m == 2 and day >= 15) or (m == 3 and day < 16):
        return "3_post_asb"
    return "4_push"


def main():
    seasons = [s.strip() for s in os.environ.get("SC_SEASONS", "2024-25,2025-26").split(",")]
    max_branches = int(os.environ.get("SC_MAX_BRANCHES", "64"))
    keep_only = os.environ.get("SC_KEEP_ONLY_REALISED", "1") == "1"
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.scenario_realised (
            season text, game_date date, game_id text, branch_key text, branch_prob numeric,
            n_uncertain int, n_branches int, realised boolean, was_most_likely boolean,
            rank_by_prob int, phase text, built_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS scenario_realised_uidx
            ON nba_score.scenario_realised (game_id)""")
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.scenario_calibration (
            season text, phase text, n_uncertain int, n_games int,
            hit_most_likely numeric, mean_realised_prob numeric, mean_branches numeric,
            built_at timestamptz DEFAULT now())""")
        cur.execute("DELETE FROM nba_score.scenario_calibration")

    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}

    for season in seasons:
        slug = season.replace("-", "_")
        logs = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"]).dt.date
        logs["PLAYER_ID"] = logs["PLAYER_ID"].astype(str)
        logs["GAME_ID"] = logs["GAME_ID"].astype(str)
        logs["TEAM"] = logs["MATCHUP"].str.split(" ").str[0]
        logs = logs.sort_values("GAME_DATE")

        idx = fetch(f"nba_injury_report_{slug}_index.json", timeout=120)
        irows = []
        for sh in idx.get("shards", []):
            try:
                irows.extend(fetch(f"nba_injury_report_{slug}_{sh}.json").get("rows") or [])
            except Exception:  # noqa: BLE001
                pass
        inj = pd.DataFrame(irows)
        inj["game_date"] = pd.to_datetime(inj["game_date"], errors="coerce").dt.date
        inj["nm"] = inj["player_name"].map(flip_last_first)
        inj["status_u"] = inj["status"].astype(str).str.upper().str.strip()
        inj["pid"] = inj["nm"].map(pid_map)
        inj = inj[inj["pid"].notna()]
        print(f"{season}: {len(logs):,} player-games | {len(inj):,} resolvable injury rows", flush=True)

        # as-of minutes so "rotation" vs "fringe" is decided on what was knowable
        hist = defaultdict(lambda: [0.0, 0])
        last_team = {}
        out_rows, cal = [], defaultdict(lambda: [0, 0, 0.0, 0.0])
        status_by_day = {d: dict(zip(g["pid"], g["status_u"])) for d, g in inj.groupby("game_date")}

        for gd in sorted(logs["GAME_DATE"].unique()):
            day = logs[logs["GAME_DATE"] == gd]
            played = set(day["PLAYER_ID"])
            st = status_by_day.get(gd, {})
            for gid, gdf in day.groupby("GAME_ID"):
                teams = list(gdf["TEAM"].unique())
                if len(teams) != 2:
                    continue
                # UNCERTAIN players on either team: listed Questionable with a real as-of role
                unc = []
                for pid, status in st.items():
                    if status != "QUESTIONABLE" or last_team.get(pid) not in teams:
                        continue
                    h = hist.get(pid)
                    if not h or h[1] == 0:
                        continue
                    mpg = h[0] / h[1]
                    if mpg < 8:
                        continue
                    p = P_PLAY["QUESTIONABLE_ROTATION"] if mpg >= 15 else P_PLAY["QUESTIONABLE_FRINGE"]
                    unc.append((pid, p, pid in played))
                if not unc:
                    continue
                k = len(unc)
                # enumerate the joint branches, capped
                combos = list(itertools.product([True, False], repeat=min(k, 6)))
                if k > 6:
                    unc = sorted(unc, key=lambda x: abs(x[1] - 0.5))[:6]   # keep the most uncertain
                    k = 6
                branches = []
                for combo in combos[:max_branches]:
                    prob = 1.0
                    for (pid, p, _), plays in zip(unc, combo):
                        prob *= p if plays else (1 - p)
                    branches.append(("".join("1" if c else "0" for c in combo), prob, combo))
                branches.sort(key=lambda b: -b[1])
                realised = tuple(x[2] for x in unc)
                rkey = "".join("1" if c else "0" for c in realised)
                rprob = next((b[1] for b in branches if b[0] == rkey), None)
                rank = next((i + 1 for i, b in enumerate(branches) if b[0] == rkey), None)
                if rprob is None:
                    continue
                ph = phase_of(gd)
                out_rows.append((season, gd, gid, rkey, round(float(rprob), 6), k, len(branches),
                                 True, rank == 1, rank, ph))
                c = cal[(ph, k)]
                c[0] += 1
                c[1] += 1 if rank == 1 else 0
                c[2] += float(rprob)
                c[3] += len(branches)
            for r in day.itertuples(index=False):
                last_team[r.PLAYER_ID] = r.TEAM
                h = hist[r.PLAYER_ID]
                h[0] += float(r.MIN); h[1] += 1

        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_score.scenario_realised
                (season, game_date, game_id, branch_key, branch_prob, n_uncertain, n_branches,
                 realised, was_most_likely, rank_by_prob, phase)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (game_id) DO UPDATE SET branch_key=EXCLUDED.branch_key,
                  branch_prob=EXCLUDED.branch_prob, rank_by_prob=EXCLUDED.rank_by_prob,
                  was_most_likely=EXCLUDED.was_most_likely""", out_rows)
            cur.executemany("""INSERT INTO nba_score.scenario_calibration
                (season, phase, n_uncertain, n_games, hit_most_likely, mean_realised_prob, mean_branches)
                VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                [(season, ph, k, c[0], round(c[1] / c[0], 4), round(c[2] / c[0], 4), round(c[3] / c[0], 2))
                 for (ph, k), c in sorted(cal.items()) if c[0] >= 20])
        conn.commit()
        print(f"  {season}: {len(out_rows):,} games with uncertainty, realised branch stored", flush=True)

    with conn.cursor() as cur:
        cur.execute("""SELECT phase, n_uncertain, sum(n_games), round(avg(hit_most_likely),4),
                              round(avg(mean_realised_prob),4), round(avg(mean_branches),1)
                       FROM nba_score.scenario_calibration GROUP BY 1,2 ORDER BY 1,2""")
        print(f"\n{'phase':<12}{'uncertain':>10}{'games':>8}{'most-likely hit':>17}{'realised p':>12}{'branches':>10}")
        for r in cur.fetchall():
            print(f"{r[0]:<12}{r[1]:>10}{int(r[2]):>8,}{float(r[3]):>17.4f}{float(r[4]):>12.4f}{float(r[5]):>10.1f}", flush=True)
    if keep_only:
        print("\nKEEP-ONLY-REALISED: only the realised branch is stored; the unrealised universe is "
              "never written. Enumeration happened in memory for the calibration above.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
