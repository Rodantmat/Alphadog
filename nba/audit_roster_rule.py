#!/usr/bin/env python3
"""
WHICH PLAYERS GET A ROW ON A SLATE - A RULE THAT WORKS THE SAME LIVE AND ON ANY PAST DATE. READ-ONLY. (owner 2026-11-20 20:58 PT: the same pipeline for
every date with that date's data)
The live builder takes today's roster file (nba_players_current.json) - no such file exists for past dates, so a replay cannot use it. Candidate rules,
built only from box scores strictly before the date:
  L3     players in the team's last 3 games of THIS season (the old rule; empty in opening week)
  AS{k}  every player whose most recent game before the date (any season) was for this team and who played in one of the team's last k games
         (this season or, early on, the end of last season)
  ASD{d} every player whose most recent game was for this team and was within d days
For every slate date of three seasons, per rule: share of the players who actually played that day that the rule includes (recall), share of
board players (nba_market.board_rung_keys) that played and are included, and rows for players who did not play (DNP rows, removed later by the
injury report or harmless).
Env: DATABASE_URL.
"""
import json
import os
from collections import defaultdict
from pathlib import Path

import pandas as pd
import psycopg

DATA = Path(__file__).resolve().parent / "data"


def main():
    P = []
    for f in sorted(DATA.glob("nba_player_game_log_20*_*.json")):
        if not f.name[len("nba_player_game_log_"):].replace(".json", "").replace("_", "").isdigit():
            continue
        r = json.loads(f.read_text())["records"]
        x = pd.DataFrame(r)[["PLAYER_ID", "TEAM_ID", "GAME_ID", "GAME_DATE", "MIN"]]
        sl = f.name[len("nba_player_game_log_"):].replace(".json", "")
        x["SEASON_YEAR"] = sl[:4] + "-" + sl[-2:]
        P.append(x)
    p = pd.concat(P, ignore_index=True)
    p["GAME_DATE"] = pd.to_datetime(p["GAME_DATE"]).dt.date
    p["PLAYER_ID"] = p["PLAYER_ID"].astype(str); p["TEAM_ID"] = p["TEAM_ID"].astype(str)
    p = p.sort_values("GAME_DATE")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    board = defaultdict(set)
    for d, pid in conn.execute("SELECT DISTINCT game_date, player_id::text FROM nba_market.board_rung_keys WHERE game_date >= '2024-10-22'"):
        board[d].add(pid)
    dates = sorted(d for d in p["GAME_DATE"].unique() if d >= pd.Timestamp("2024-10-22").date() and (d.month >= 10 or d.month <= 4))
    team_games = p.drop_duplicates(["TEAM_ID", "GAME_ID"])[["TEAM_ID", "GAME_ID", "GAME_DATE", "SEASON_YEAR"]]
    rules = ["L3", "AS3", "AS5", "AS10", "AS20", "ASD15", "ASD30", "ASD60"]
    tot = {r: defaultdict(float) for r in rules}
    for D in dates:
        day = p[p["GAME_DATE"] == D]
        if day.empty:
            continue
        season = day["SEASON_YEAR"].iloc[0]
        played = set(zip(day["TEAM_ID"], day["PLAYER_ID"]))
        teams = set(day["TEAM_ID"])
        past = p[p["GAME_DATE"] < D]
        last = past.groupby("PLAYER_ID").tail(1).set_index("PLAYER_ID")          # most recent game per player
        tg = team_games[team_games["GAME_DATE"] < D]
        bd = board.get(D, set())
        for r in rules:
            inc = set()
            for t in teams:
                g = tg[tg["TEAM_ID"] == t]
                if r == "L3":
                    ids = g[g["SEASON_YEAR"] == season]["GAME_ID"].tail(3)
                    inc |= {(t, x) for x in past[past["GAME_ID"].isin(set(ids)) & (past["TEAM_ID"] == t)]["PLAYER_ID"]}
                elif r.startswith("ASD"):
                    k = int(r[3:])
                    m = (last["TEAM_ID"] == t) & (last["GAME_DATE"].map(lambda x: (D - x).days) <= k)
                    inc |= {(t, x) for x in last.index[m]}
                else:
                    k = int(r[2:])
                    ids = set(g["GAME_ID"].tail(k))
                    m = (last["TEAM_ID"] == t) & last["GAME_ID"].isin(ids)
                    inc |= {(t, x) for x in last.index[m]}
            tp = len(inc & played)
            tot[r]["played"] += len(played); tot[r]["hit"] += tp; tot[r]["extra"] += len(inc - played)
            bp = {(t, x) for (t, x) in played if x in bd}
            tot[r]["board"] += len(bp); tot[r]["board_hit"] += len(bp & inc)
            tot[r]["s_" + season + "_board"] += len(bp); tot[r]["s_" + season + "_board_hit"] += len(bp & inc)
    print(f"RR|slate dates: {len(dates)}", flush=True)
    for r in rules:
        t = tot[r]
        seas = " | ".join(f"{s} {100*t['s_'+s+'_board_hit']/max(1,t['s_'+s+'_board']):.2f}%" for s in ("2024-25", "2025-26", "2026-27"))
        print(f"RR|{r:6s} players who played included {100*t['hit']/t['played']:.2f}% | board players who played included {100*t['board_hit']/max(1,t['board']):.2f}% ({seas}) | "
              f"rows for players who did not play {t['extra']/len(dates):.1f} a slate", flush=True)
    print("RR|DONE", flush=True)


if __name__ == "__main__":
    main()
