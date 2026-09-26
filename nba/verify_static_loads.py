#!/usr/bin/env python3
"""
VERIFY STATIC LOADS BY WHAT LANDED, NOT BY WHAT WAS ACKNOWLEDGED.

WHY. P1 triggers the writer Workers over public HTTPS. Measured 2026-09-24: the shot-quality worker
completed and wrote its rows TWICE (17:41 and 17:46), yet both curl attempts timed out after 300s
with 0 bytes received - the worker finishes, the edge never returns the response. Judging the load by
the HTTP reply would have marked a successful load as failed and painted P1 red for a data set that
was, in fact, fresh in Postgres.

An acknowledgement is not a row. This checks each table's max(updated_at) against the moment the load
step started. If a table moved after that moment, the load landed - regardless of what curl saw.

Two dictionary workers (teams, players) skip unchanged rows and so do NOT bump updated_at on a quiet
week; for those the HTTP result is the only signal, and they respond in seconds, so a genuine failure
there is a real one and is reported as such.

Env: DATABASE_URL, LOAD_STARTED_AT (ISO UTC), FAILED_WORKERS (space-separated worker suffixes)
"""
import os
import sys
from datetime import datetime, timezone

import psycopg

# worker suffix -> the table it rewrites in full every run (so updated_at is a truthful freshness signal)
TABLE_FOR = {
    "nba-static-player-bio": "nba_stats.player_season_profile",
    "nba-static-team-stats": "nba_team.season_profile",
    "nba-static-onoff": "nba_stats.player_onoff_profile",
    "nba-static-playtypes": "nba_stats.player_playtype_profile",
    "nba-static-tracking-detail": "nba_stats.player_tracking_detail",
    "nba-static-darko": "nba_stats.player_impact_rating",
    "nba-static-shotquality": "nba_stats.player_shot_quality",
    "nba-static-lineups": "nba_team.lineup_profile",
    # The two dictionary workers skip UNCHANGED rows in their main table, so players.updated_at and
    # teams.updated_at are silent on a quiet week - but both REWRITE THEIR ALIASES EVERY RUN (measured
    # 2026-09-24: aliases_written=1868 on a run with 3 changed players; team aliases 155 with 0 changed
    # teams). The alias table is therefore the truthful freshness signal for these two.
    "nba-static-players": "nba_ref.player_aliases",
    "nba-static-teams": "nba_ref.team_aliases",
    # DISPATCH CENSUS CLOSED (2026-09-26, T26-8): nine more workers now run on a schedule - five daily
    # in P2 after the mined data is committed, four weekly in P1. Each is judged by its table's
    # max(updated_at) exactly like the first ten.
    "nba-daily-delta": "nba_stats.player_game_log",
    "nba-static-starter-status": "nba_stats.player_game_starter_status",
    "nba-static-game-officials": "nba_stats.game_officials",
    "nba-static-schedule": "nba_calendar.games",
    "nba-static-measure-types": "nba_team.team_game_log_four_factors",
    "nba-static-player-tracking": "nba_stats.player_tracking_profile",
    "nba-weekly-differential": "nba_stats.player_roster_snapshot",
    "nba-static-officials": "nba_ref.officials",
    "nba-static-arenas": "nba_ref.arenas",
}
# Tables whose freshness column is not updated_at.
STAMP_COL = {"nba_stats.player_roster_snapshot": "snapshot_taken_at"}
DICTIONARY_WORKERS = set()  # every worker now has a freshness signal; kept for the reporting branch below


def main():
    started = datetime.fromisoformat(os.environ["LOAD_STARTED_AT"].replace("Z", "+00:00"))
    failed = [w for w in os.environ.get("FAILED_WORKERS", "").split() if w]
    if not failed:
        print("verify_static_loads: every worker acknowledged - nothing to verify by data.")
        return
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    still_failed = []
    for w in failed:
        if w in DICTIONARY_WORKERS:
            print(f"  {w}: no acknowledgement and no freshness signal possible (writes changed rows only) -> FAILED")
            still_failed.append(w)
            continue
        tbl = TABLE_FOR.get(w)
        if not tbl:
            print(f"  {w}: no table mapping -> FAILED (add it to TABLE_FOR)")
            still_failed.append(w)
            continue
        with conn.cursor() as cur:
            cur.execute(f"SELECT max(updated_at) FROM {tbl}")
            last = cur.fetchone()[0]
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if last is not None and last >= started:
            print(f"  {w}: HTTP reply was lost, but {tbl} was written at {last.isoformat()} "
                  f"(after step start {started.isoformat()}) -> LANDED")
        else:
            print(f"  {w}: {tbl} last write {last} is NOT after step start {started.isoformat()} -> FAILED")
            still_failed.append(w)
    conn.close()
    if still_failed:
        print(f"::error::Static loads genuinely FAILED: {' '.join(still_failed)}")
        sys.exit(1)
    print("verify_static_loads: every unacknowledged load is confirmed by data.")


if __name__ == "__main__":
    main()
