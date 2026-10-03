#!/usr/bin/env python3
"""
DAILY PLAYER NAME MAP REFRESH (strategy doc §31b; fix for blocker 2 of the 2026-10-03 wiring audit).
nba_ref.player_name_map is THE resolver for both apps (build_final_hp, score_board_legs, the PrizePicks and Underdog live
engines). It was built by check_baseline_board_coverage.py from nba/data/nba_all_players.json, a register that is only
refreshed manually - on 2026-10-03 it lacked every 2026-27 newcomer, and 44 of 629 active players did not resolve: every leg
on them would have been silently dropped on both apps. nba_ref.players IS current (refreshed weekly by P1).
Incremental and collision-safe, with the builder's own rule (one player per normalized name, current roster first):
  name absent                                  -> insert (player_id, norm_name, full_name)
  name mapped to an INACTIVE player            -> repoint to the active player (current roster wins)
  name mapped to a DIFFERENT ACTIVE player     -> no change, logged CONFLICT (true namesakes need a manual alias)
  nothing is ever deleted (alias rows stay). Normalizer: nba_ref.norm_name (mirrors the Python norm_name - verified).
Then verifies: active players that still do not resolve (must be 0 apart from logged conflicts).
Env: DATABASE_URL.
"""
import os

import psycopg

ACTIVE = "p.active::text IN ('1','true','t')"


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    rows = conn.execute(f"""
        SELECT p.nba_player_id::text pid, p.full_name, nba_ref.norm_name(p.full_name) cn, m.player_id mapped_pid,
               EXISTS (SELECT 1 FROM nba_ref.players q WHERE q.nba_player_id::text = m.player_id AND q.active::text IN ('1','true','t')) mapped_active
        FROM nba_ref.players p LEFT JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(p.full_name)
        WHERE {ACTIVE} AND coalesce(nba_ref.norm_name(p.full_name), '') <> ''""").fetchall()
    ins = rep = conf = 0
    for pid, name, cn, mapped, mapped_active in rows:
        if mapped is None:
            conn.execute("INSERT INTO nba_ref.player_name_map (player_id, norm_name, display_name) VALUES (%s,%s,%s) ON CONFLICT (norm_name) DO NOTHING",
                         (pid, cn, name)); ins += 1
            print(f"  + {name} -> {pid}", flush=True)
        elif mapped != pid and not mapped_active:
            conn.execute("UPDATE nba_ref.player_name_map SET player_id=%s, display_name=%s WHERE norm_name=%s", (pid, f"{name} (current roster)", cn)); rep += 1
            print(f"  ~ {name}: '{cn}' repointed {mapped} (inactive) -> {pid} (active)", flush=True)
        elif mapped != pid:
            conf += 1
            print(f"  ! CONFLICT {name} ({pid}): '{cn}' already maps to another ACTIVE player {mapped} - needs a manual alias", flush=True)
    conn.commit()
    unresolved = conn.execute(f"""SELECT count(*), string_agg(p.full_name, ', ') FROM nba_ref.players p
        WHERE {ACTIVE} AND NOT EXISTS (SELECT 1 FROM nba_ref.player_name_map m WHERE m.player_id = p.nba_player_id::text)""").fetchone()
    active = conn.execute(f"SELECT count(*) FROM nba_ref.players p WHERE {ACTIVE}").fetchone()[0]
    print(f"NAME MAP REFRESH: {ins} inserted, {rep} repointed, {conf} conflicts | active players {active}, "
          f"unresolved {unresolved[0]}{(' (' + unresolved[1] + ')') if unresolved[0] else ''}", flush=True)
    if unresolved[0] and unresolved[0] > conf:
        print("::warning::active players still unresolved beyond logged conflicts - investigate", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
