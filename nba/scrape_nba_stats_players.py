#!/usr/bin/env python3
"""
Same proven pattern as scrape_nba_stats_teams.py (see that file's docstring for why this runs
here and not in the Cloudflare Worker, and why curl_cffi instead of plain requests).

Writes nba/data/nba_players_current.json + nba/data/nba_players_current_meta.json.
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

# IsOnlyCurrentSeason=1 -> active-roster players only for the given season, per the real,
# documented commonallplayers contract (confirmed via nba_api project docs, 2026-08-31).
URL = "https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=1&LeagueID=00&Season=2025-26"
OUTPUT_PATH = Path("nba/data/nba_players_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_players_current_meta.json")


def fetch_players():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(URL, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"Attempt {attempt}/3 failed: {exc}", file=sys.stderr)
            if attempt < 3:
                time.sleep(5)
    else:
        raise last_error

    result_sets = body.get("resultSets") or []
    if not result_sets:
        raise RuntimeError("nba_stats_api_unexpected_shape: no resultSets")
    rs = result_sets[0]
    headers = rs["headers"]
    idx = {h: i for i, h in enumerate(headers)}

    def col(row, name, default=None):
        i = idx.get(name)
        return row[i] if i is not None else default

    players = []
    for row in rs["rowSet"]:
        person_id = col(row, "PERSON_ID")
        if person_id is None:
            continue
        team_id = col(row, "TEAM_ID")
        players.append({
            "id": int(person_id),
            "full_name": str(col(row, "DISPLAY_FIRST_LAST") or ""),
            "last_comma_first": str(col(row, "DISPLAY_LAST_COMMA_FIRST") or ""),
            "roster_status": col(row, "ROSTERSTATUS"),
            "from_year": col(row, "FROM_YEAR"),
            "to_year": col(row, "TO_YEAR"),
            "player_code": str(col(row, "PLAYERCODE") or ""),
            "team_id": int(team_id) if team_id not in (None, 0, "0", "") else None,
            "team_city": str(col(row, "TEAM_CITY") or ""),
            "team_name": str(col(row, "TEAM_NAME") or ""),
            "team_abbreviation": str(col(row, "TEAM_ABBREVIATION") or ""),
        })
    return players, resp.status_code


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        players, http_status = fetch_players()
        error = None
    except Exception as exc:  # noqa: BLE001
        players, http_status, error = [], None, str(exc)

    OUTPUT_PATH.write_text(json.dumps({"players": players}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "source_url": URL,
        "http_status": http_status,
        "player_count": len(players),
        "error": error,
    }, indent=2), encoding="utf-8")

    if error:
        print(f"NBA players scrape FAILED: {error}", file=sys.stderr)
        sys.exit(1)

    print(f"NBA players scrape OK: {len(players)} players, http_status={http_status}")


if __name__ == "__main__":
    main()
