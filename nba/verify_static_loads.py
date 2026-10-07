#!/usr/bin/env python3
"""
VERIFY STATIC LOADS BY WHAT LANDED, NOT BY WHAT WAS ACKNOWLEDGED - AND REPAIR WHAT DID NOT.

WHY. P1 / P2A trigger the writer Workers over public HTTPS with a short curl timeout. Measured 2026-09-24: the
shot-quality worker completed and wrote its rows while both curl attempts timed out with 0 bytes - the worker
finishes, the edge never returns the response. Judging the load by the HTTP reply would have marked a successful
load as failed. An acknowledgement is not a row: this checks each table's max(updated_at) against the moment the
load step started.

PARTIAL LOADS (found 2026-10-07, full-system certification pass C). A worker that writes SEVERAL tables writes them in
sequence; when the client has gone away (curl timed out) the invocation can end before the later tables are written.
Measured: P1 2026-10-05 and the 2026-10-07 recovery both landed nba_stats.player_shot_quality (the first table of
the shot-quality worker) while player_shot_quality_delta and player_shot_zone_profile stayed at 2026-09-28, and the
playtypes worker landed the player table while nba_team.playtype_profile stayed at 2026-09-24. The old check looked
at ONE table per worker and declared LANDED. Now: EVERY table a worker writes must have moved; a worker with any
table left behind is RE-INVOKED here, synchronously, with a long wait (the request is kept open so the worker is
never abandoned mid-write), and re-checked. Only a worker that still has not landed after that fails the step.

Two dictionary workers (teams, players) skip unchanged rows in their main table and so do NOT bump updated_at on a
quiet week; they REWRITE THEIR ALIASES EVERY RUN, so the alias table is their truthful freshness signal.

Env: DATABASE_URL, LOAD_STARTED_AT (ISO UTC), FAILED_WORKERS (space-separated worker suffixes),
     WORKER_HOST (default rodolfoaamattos.workers.dev), VERIFY_NO_REPAIR=1 to only report.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

import psycopg

# worker suffix -> EVERY table it writes each run (updated_at is bumped on every upsert in all of them)
TABLES_FOR = {
    "nba-static-player-bio": ["nba_stats.player_season_profile"],
    "nba-static-team-stats": ["nba_team.season_profile"],
    "nba-static-onoff": ["nba_stats.player_onoff_profile"],
    "nba-static-playtypes": ["nba_stats.player_playtype_profile", "nba_team.playtype_profile"],
    "nba-static-tracking-detail": ["nba_stats.player_tracking_detail"],
    "nba-static-darko": ["nba_stats.player_impact_rating"],
    "nba-static-shotquality": ["nba_stats.player_shot_quality", "nba_stats.player_shot_quality_delta", "nba_stats.player_shot_zone_profile"],
    "nba-static-lineups": ["nba_team.lineup_profile"],
    # dictionary workers: the alias tables are rewritten every run (measured 2026-09-24)
    "nba-static-players": ["nba_ref.player_aliases"],
    "nba-static-teams": ["nba_ref.team_aliases"],
    # P2A daily loads (dispatch census 2026-09-26)
    "nba-daily-delta": ["nba_stats.player_game_log", "nba_stats.player_game_log_advanced", "nba_team.team_game_log",
                        "nba_team.team_game_log_advanced", "nba_team.defense_vs_position"],
    "nba-static-starter-status": ["nba_stats.player_game_starter_status"],
    "nba-static-game-officials": ["nba_stats.game_officials"],
    "nba-static-schedule": ["nba_calendar.games"],
    "nba-static-measure-types": ["nba_stats.player_game_log_scoring", "nba_stats.player_game_log_usage",
                                 "nba_team.team_game_log_four_factors", "nba_team.team_game_log_scoring"],
    "nba-static-player-tracking": ["nba_stats.player_tracking_profile"],
    "nba-weekly-differential": ["nba_stats.player_roster_snapshot"],
    "nba-static-officials": ["nba_ref.officials"],
    "nba-static-arenas": ["nba_ref.arenas"],
}
# tables whose freshness column is not updated_at
STAMP_COL = {"nba_stats.player_roster_snapshot": "snapshot_taken_at"}
REPAIR_TIMEOUT_S = 900


def last_write(conn, tbl):
    with conn.cursor() as cur:
        cur.execute(f"SELECT max({STAMP_COL.get(tbl, 'updated_at')}) FROM {tbl}")
        last = cur.fetchone()[0]
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return last


def check(conn, worker, started):
    """-> (landed_tables, missing_tables) with their last write"""
    landed, missing = [], []
    for tbl in TABLES_FOR[worker]:
        last = last_write(conn, tbl)
        (landed if (last is not None and last >= started) else missing).append((tbl, last))
    return landed, missing


def reinvoke(worker):
    host = os.environ.get("WORKER_HOST") or "rodolfoaamattos.workers.dev"
    url = f"https://alphadog-v2-{worker}.{host}/run"
    req = urllib.request.Request(url, data=b"{}", headers={"content-type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=REPAIR_TIMEOUT_S) as r:
            body = r.read().decode("utf-8", "replace")
            try:
                j = json.loads(body)
                return f"HTTP {r.status} ok={j.get('ok')} errors={j.get('errors')}"
            except Exception:  # noqa: BLE001
                return f"HTTP {r.status} (non-JSON reply)"
    except Exception as exc:  # noqa: BLE001
        return f"re-invocation did not return ({str(exc)[:120]}) - judged by data below"


def main():
    started = datetime.fromisoformat(os.environ["LOAD_STARTED_AT"].replace("Z", "+00:00"))
    failed = [w for w in os.environ.get("FAILED_WORKERS", "").split() if w]
    if not failed:
        print("verify_static_loads: every worker acknowledged - nothing to verify by data.")
        return
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    still_failed = []
    for w in failed:
        if w not in TABLES_FOR:
            print(f"  {w}: no table mapping -> FAILED (add it to TABLES_FOR)")
            still_failed.append(w)
            continue
        landed, missing = check(conn, w, started)
        for tbl, last in landed:
            print(f"  {w}: HTTP reply was lost, but {tbl} was written at {last.isoformat()} (after step start {started.isoformat()}) -> LANDED")
        if not missing:
            continue
        for tbl, last in missing:
            print(f"  {w}: {tbl} last write {last} is NOT after step start {started.isoformat()} -> NOT LANDED")
        if os.environ.get("VERIFY_NO_REPAIR") == "1":
            still_failed.append(w)
            continue
        print(f"  {w}: PARTIAL/NO load - re-invoking synchronously (up to {REPAIR_TIMEOUT_S}s, request kept open) ...", flush=True)
        print(f"  {w}: {reinvoke(w)}")
        landed2, missing2 = check(conn, w, started)
        for tbl, last in missing2:
            print(f"  {w}: {tbl} STILL not written after re-invocation (last {last}) -> FAILED")
        if missing2:
            still_failed.append(w)
        else:
            print(f"  {w}: every table landed after the re-invocation -> LANDED (repaired)")
    conn.close()
    if still_failed:
        print(f"::error::Static loads genuinely FAILED: {' '.join(still_failed)}")
        sys.exit(1)
    print("verify_static_loads: every unacknowledged load is confirmed by data (all tables of every worker).")


if __name__ == "__main__":
    main()
