#!/usr/bin/env python3
"""
Team-level pace/rating data (per NBA_ENRICHMENT_FACTORS_RESEARCH.md, 2026-09-01):
leaguedashteamstats, Advanced measure type, one call, all 30 teams. Weekly-appropriate: a team's
overall pace/offensive/defensive identity is a slow-moving season-long trend.

Writes nba/data/nba_team_stats_current.json + _meta.json.
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

URL = ("https://stats.nba.com/stats/leaguedashteamstats?LeagueID=00&Season=2025-26&SeasonType=Regular+Season"
       "&PerMode=PerGame&MeasureType=Advanced&Month=0&OpponentTeamID=0&PaceAdjust=N&Rank=N&PlusMinus=N")
OUTPUT_PATH = Path("nba/data/nba_team_stats_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_team_stats_current_meta.json")


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

            teams = []
            for row in rs.get("rowSet") or []:
                tid = col(row, "TEAM_ID")
                if not tid:
                    continue
                teams.append({
                    "team_id": int(tid),
                    "gp": col(row, "GP"),
                    "w": col(row, "W"),
                    "l": col(row, "L"),
                    "pace": col(row, "PACE"),
                    "off_rating": col(row, "OFF_RATING"),
                    "def_rating": col(row, "DEF_RATING"),
                    "net_rating": col(row, "NET_RATING"),
                })
            return teams, resp.status_code, headers
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(5)
    raise RuntimeError(last_error)


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        teams, http_status, headers = fetch()
        error = None
        if len(teams) < 25:
            error = f"suspiciously_low_count: only {len(teams)} teams, headers were {headers}"
    except Exception as exc:  # noqa: BLE001
        teams, http_status, error, headers = [], None, str(exc), None

    OUTPUT_PATH.write_text(json.dumps({"teams": teams}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at, "source_url": URL, "http_status": http_status,
        "team_count": len(teams), "error": error, "real_headers_seen": headers,
    }, indent=2), encoding="utf-8")

    if error:
        print(f"NBA team stats scrape FAILED/WARN: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"NBA team stats scrape OK: {len(teams)} teams, http_status={http_status}")


if __name__ == "__main__":
    main()
