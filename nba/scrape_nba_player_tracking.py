#!/usr/bin/env python3
"""
Player-tracking "archetype" data (per NBA_ENRICHMENT_FACTORS_RESEARCH.md, 2026-09-01):
leaguedashptstats with PtMeasureType=SpeedDistance - real, actual in-game speed/distance, the
source for the "speed" factor. One call, whole league. Weekly-appropriate: season-long average
speed/distance style doesn't flip overnight.

Writes nba/data/nba_player_tracking_current.json + _meta.json.
"""
import json
import os
import sys
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

URL = ("https://stats.nba.com/stats/leaguedashptstats?LeagueID=00&Season=2025-26&SeasonType=Regular+Season"
       "&PerMode=PerGame&PlayerOrTeam=Player&PtMeasureType=SpeedDistance&LastNGames=0&Month=0&OpponentTeamID=0")
OUTPUT_PATH = Path("nba/data/nba_player_tracking_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_player_tracking_current_meta.json")


def fetch():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(URL, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = (body.get("resultSets") or [{}])[0]
            headers = rs.get("headers", [])
            idx = {h: i for i, h in enumerate(headers)}

            def col(row, name):
                i = idx.get(name)
                return row[i] if i is not None and i < len(row) else None

            players = []
            for row in rs.get("rowSet") or []:
                pid = col(row, "PLAYER_ID")
                if not pid:
                    continue
                players.append({
                    "player_id": int(pid),
                    "avg_speed": col(row, "AVG_SPEED"),
                    "avg_speed_off": col(row, "AVG_SPEED_OFF"),
                    "avg_speed_def": col(row, "AVG_SPEED_DEF"),
                    "dist_miles": col(row, "DIST_MILES"),
                    "dist_miles_off": col(row, "DIST_MILES_OFF"),
                    "dist_miles_def": col(row, "DIST_MILES_DEF"),
                })
            return players, resp.status_code, headers
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(5)
    raise RuntimeError(last_error)


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        players, http_status, headers = fetch()
        error = None
        if not any(p.get("avg_speed") is not None for p in players):
            error = f"suspicious_all_null_avg_speed: real headers were {headers}"
    except Exception as exc:  # noqa: BLE001
        players, http_status, error, headers = [], None, str(exc), None

    OUTPUT_PATH.write_text(json.dumps({"players": players}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at, "source_url": URL, "http_status": http_status,
        "player_count": len(players), "error": error, "real_headers_seen": headers,
    }, indent=2), encoding="utf-8")

    if error:
        print(f"NBA player tracking scrape FAILED/WARN: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"NBA player tracking scrape OK: {len(players)} players, http_status={http_status}")


if __name__ == "__main__":
    main()
