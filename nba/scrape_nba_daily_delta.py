#!/usr/bin/env python3
"""
Daily Delta Ingestion (2026-09-04, per the person's redirect back to the static/backfill/delta
layer - explicitly NOT the master run / baseline scoring logic). This is the real, concrete gap
flagged all the way back at the start of the NBA build and never closed: an ongoing worker that
pulls newly-completed games into the game-log tables, rather than the one-time historical
backfill that already exists.

Design (idempotent, safe to run daily once the season starts):
1. Auto-detect the "current" season: the season whose date range brackets today, per
   nba_calendar.games (already populated by the schedule worker for both 2025-26 and 2026-27).
2. Re-run the SAME bulk base+advanced game-log endpoints used by the one-time backfill
   (playergamelogs/teamgamelogs, MeasureType=Base and Advanced) for the current season only -
   cheap (4 calls total) and naturally idempotent via ON CONFLICT upsert in the Postgres worker,
   so newly-completed games simply appear without any incremental diffing logic needed.
3. Refresh career totals too (1 call all players) - keeps season-to-date totals current.

The Postgres writer worker (alphadog-v2-nba-daily-delta) does the completeness check (Final
games in nba_calendar vs distinct games actually present in player_game_log) and identifies
which specific game_ids are newly Final but not yet covered by starter-status/officials data,
so those expensive per-game endpoints only ever process the real daily delta, not the whole
season.
"""
import json
import os
import time
from pathlib import Path

from curl_cffi import requests

STATS_HEADERS = {
    "Host": "stats.nba.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://stats.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}


def fetch_bulk(url, result_set_name, proxies):
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=60, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = next((r for r in body.get("resultSets") or [] if r.get("name") == result_set_name), None)
            if not rs:
                return None, f"{result_set_name}_result_set_not_found"
            headers = rs.get("headers", [])
            rows = [dict(zip(headers, row)) for row in (rs.get("rowSet") or [])]
            return rows, None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(8)
    return None, last_error


def detect_current_season():
    """Determine the current NBA season string (e.g. '2026-27') from today's date.
    NBA seasons run Oct-June; a date in Jul-Sep counts toward the upcoming season."""
    from datetime import date
    today = date.today()
    if today.month >= 7:
        start_year = today.year
    else:
        start_year = today.year - 1
    return f"{start_year}-{str(start_year + 1)[2:]}"


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    season = os.environ.get("NBA_DELTA_SEASON", "").strip() or detect_current_season()
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    results = {}
    errors = []

    specs = [
        ("player_game_log", f"https://stats.nba.com/stats/playergamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season={season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=", "PlayerGameLogs"),
        ("player_game_log_advanced", f"https://stats.nba.com/stats/playergamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season={season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=", "PlayerGameLogs"),
        ("team_game_log", f"https://stats.nba.com/stats/teamgamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0&PlusMinus=N&Rank=N&Season={season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision=", "TeamGameLogs"),
        ("team_game_log_advanced", f"https://stats.nba.com/stats/teamgamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0&PlusMinus=N&Rank=N&Season={season}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision=", "TeamGameLogs"),
    ]

    for key, url, result_set_name in specs:
        rows, error = fetch_bulk(url, result_set_name, proxies)
        if rows is not None:
            Path(f"nba/data/nba_delta_{key}.json").write_text(json.dumps({"season": season, "records": rows}, indent=2), encoding="utf-8")
            results[key] = len(rows)
            print(f"{key}: {len(rows)} rows")
        else:
            errors.append({"key": key, "error": error})
            print(f"{key}: FAILED - {error}")
        time.sleep(1)

    meta = {
        "fetched_at": fetched_at, "season": season, "row_counts": results, "errors": errors,
    }
    Path("nba/data/nba_daily_delta_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
