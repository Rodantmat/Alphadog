#!/usr/bin/env python3
"""
DAILY ROSTER SYNC (strategy doc §31r). P1 refreshes nba_ref.players weekly (Mondays); a trade on a Tuesday was invisible to the
live loader's roster fallback until the next Monday. P2B now scrapes commonallplayers (one request) every morning and this
script applies it to nba_ref.players BEFORE the name-map refresh and the model build:
  - existing player whose current team changed (or who was inactive and is now rostered) -> team_id / active updated
  - player not in the table (signing, two-way, rookie)                                    -> inserted (minimal row)
  - NEVER deactivates anyone (waivers remain P1's job; a missing row in one scrape must not erase a player)
Ids follow the table's own convention: player_id 'nba_<PERSON_ID>', team_id 'nba_<TEAM_ID>'. Every change is logged.
Refuses to run on an empty or failed scrape (the file's meta records the error).
Env: DATABASE_URL.
"""
import json
import os
import sys
from pathlib import Path

import psycopg

F = Path("nba/data/nba_players_current.json")
META = Path("nba/data/nba_players_current_meta.json")


def main():
    if not F.exists():
        sys.exit("roster sync: nba/data/nba_players_current.json missing - scrape did not run; nothing changed")
    meta = json.loads(META.read_text()) if META.exists() else {}
    players = json.loads(F.read_text()).get("players", [])
    if meta.get("error") or len(players) < 300:
        sys.exit(f"roster sync: REFUSED - scrape error {meta.get('error')!r}, {len(players)} players (a full league is ~450+); nothing changed")
    rostered = [p for p in players if p.get("team_id") and str(p.get("roster_status")) in ("1", "1.0", "True", "true")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    cur = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT nba_player_id, team_id, active FROM nba_ref.players").fetchall()}
    moved = inserted = reactivated = 0
    for p in rostered:
        pid = int(p["id"]); team = f"nba_{int(p['team_id'])}"
        if pid in cur:
            old_team, active = cur[pid]
            if old_team != team or active != 1:
                conn.execute("UPDATE nba_ref.players SET team_id=%s, active=1, updated_at=now() WHERE nba_player_id=%s", (team, pid))
                if old_team != team:
                    moved += 1
                    print(f"  moved: {p.get('full_name')} ({pid}) {old_team} -> {team}", flush=True)
                else:
                    reactivated += 1
        else:
            name = p.get("full_name") or ""
            first, _, last = name.partition(" ")
            conn.execute("""INSERT INTO nba_ref.players (player_id, nba_player_id, full_name, first_name, last_name, team_id, active, source_key,
                                                       raw_json, created_at, updated_at)
                            VALUES (%s,%s,%s,%s,%s,%s,1,'daily_roster_sync',%s,now(),now())""",
                         (f"nba_{pid}", pid, name, first, last, team, json.dumps(p)))
            inserted += 1
            print(f"  inserted: {name} ({pid}) -> {team}", flush=True)
    conn.commit()
    print(f"roster sync (§31r): {len(rostered)} rostered players in today's scrape; team changes {moved}, inserted {inserted}, "
          f"re-activated {reactivated}; none deactivated (P1's job)", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
