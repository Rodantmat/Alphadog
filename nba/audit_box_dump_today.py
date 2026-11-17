#!/usr/bin/env python3
"""AUDIT (read-only) - print today's live NBA box scores (same source as audit_live_grade_today.fetch_box) as pipe lines, so the
owner's placed slips on every app can be graded the same night. Writes nothing. Env: DATABASE_URL, LG_DATE (default today PT)."""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audit_live_grade_today as A  # noqa: E402


def main():
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as c:
        proxy = (c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone() or [""])[0]
        games = c.execute("""SELECT game_id, home_team_tricode, away_team_tricode FROM nba_calendar.slate_games
                             WHERE game_date = %s ORDER BY game_datetime_utc""", (A.D,)).fetchall()
    for gid, htc, atc in games:
        try:
            g = A.fetch_box(gid, proxy)
        except Exception as exc:  # noqa: BLE001
            print(f"GAME|{gid}|{atc}@{htc}|ERROR {type(exc).__name__}: {str(exc)[:100]}", flush=True)
            continue
        print(f"GAME|{gid}|{atc}@{htc}|{g['awayTeam']['score']}|{g['homeTeam']['score']}|{g.get('gameStatus')}|{g.get('gameStatusText')}", flush=True)
        for side in ("homeTeam", "awayTeam"):
            t = g[side]
            for p in t.get("players", []):
                s = p.get("statistics") or {}
                mins = A.minutes(s.get("minutesCalculated") or s.get("minutes"))
                print("BOX|" + "|".join(str(x) for x in (p["personId"], p.get("name"), t.get("teamTricode"), gid, round(mins, 1), s.get("points", 0),
                      s.get("reboundsTotal", 0), s.get("assists", 0), s.get("threePointersMade", 0), s.get("steals", 0), s.get("blocks", 0),
                      s.get("turnovers", 0), p.get("status"), (p.get("notPlayingReason") or ""))), flush=True)


if __name__ == "__main__":
    main()
