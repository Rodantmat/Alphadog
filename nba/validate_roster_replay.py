#!/usr/bin/env python3
"""
ROSTER RULE REPLAY VALIDATION (strategy doc §31r). Two modes:
  RV_MODE=proxy   write nba/data/nba_players_current.json for RV_DATE from a historical PROXY: each player's team at his next
                  appearance on/after RV_DATE (players appearing in the season from RV_DATE on). This uses later information and
                  exists ONLY to validate the builder's roster mechanics / coverage; live, the real morning scrape replaces it.
  RV_MODE=compare after build_baseline_ladder.py ran for RV_DATE (BT_REPLAY=1), compare the players it projected with the
                  PrizePicks window board players who actually PLAYED that day: coverage under the NEW rule (the builder's output)
                  vs the OLD last-3-games rule (computed here), and every board player still not projected, with the reason.
Env: DATABASE_URL, RV_DATE, RV_MODE.
"""
import glob
import json
import os
from collections import defaultdict
from datetime import date

import psycopg


def main():
    d = date.fromisoformat(os.environ['RV_DATE'])
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    if os.environ['RV_MODE'] == 'proxy':
        rows = conn.execute("""SELECT DISTINCT ON (nba_player_id) nba_player_id, team_id FROM nba_stats.player_game_log
                               WHERE game_date >= %s AND game_date < %s + 200 ORDER BY nba_player_id, game_date""", (d, d)).fetchall()
        players = [{"id": int(pid), "team_id": int(str(tid).replace('nba_', '')), "roster_status": 1} for pid, tid in rows]
        os.makedirs("nba/data", exist_ok=True)
        json.dump({"players": players}, open("nba/data/nba_players_current.json", "w"))
        print(f"PROXY roster for {d}: {len(players)} players (team at next appearance) - validation only", flush=True)
        return
    # compare
    files = [f for f in glob.glob(f"nba/data/nba_baseline_ladder_{d}_*.json")] or glob.glob(f"nba/data/nba_baseline_ladder_{d}.json")
    projected = set()
    for f in files:
        for r in json.load(open(f)).get("ladder", []):
            projected.add(int(r["player_id"]))
    board = {int(r[0]) for r in conn.execute("""WITH b AS (SELECT DISTINCT player FROM nba_market.board_snapshots WHERE bookmaker='prizepicks'
                                                  AND snapshot_label='window' AND game_date=%s)
                                                SELECT DISTINCT nm.player_id FROM b JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(b.player)""", (d,)).fetchall()}
    played = {int(r[0]): r[1] for r in conn.execute("""SELECT nba_player_id, team_id FROM nba_stats.player_game_log WHERE game_date=%s AND coalesce(min,0) > 0""", (d,)).fetchall()}
    target = {p for p in board if p in played}
    # OLD rule: last 3 games of the player's team this season, before d
    old = set()
    for p in target:
        tid = played[p]
        last3 = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM nba_stats.player_game_log WHERE team_id=%s AND game_date < %s
                    AND season = (SELECT season FROM nba_stats.player_game_log WHERE game_date=%s LIMIT 1) ORDER BY game_date DESC LIMIT 3""", (tid, d, d)).fetchall()]
        if last3 and conn.execute("""SELECT 1 FROM nba_stats.player_game_log WHERE nba_player_id=%s AND team_id=%s AND game_date = ANY(%s) LIMIT 1""",
                                  (p, tid, last3)).fetchone():
            old.add(p)
    new = target & projected
    print(f"\nRV {d}: board players who played {len(target)} | projected by OLD rule {len(old)} ({100*len(old)/max(len(target),1):.1f}%) | "
          f"projected by NEW builder {len(new)} ({100*len(new)/max(len(target),1):.1f}%) | ladder files {len(files)}", flush=True)
    for p in sorted(target - new):
        hist = conn.execute("SELECT count(*) FROM nba_stats.player_game_log WHERE nba_player_id=%s AND game_date < %s", (p, d)).fetchone()[0]
        print(f"   still not projected: {p} (team {played[p]}, prior games {hist})", flush=True)
    for p in sorted(new - old):
        print(f"   RECOVERED by the new rule: {p} (team {played[p]})", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
