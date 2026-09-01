#!/usr/bin/env python3
"""
Same proven pattern as scrape_nba_stats_teams.py / scrape_nba_stats_players.py.

Arena names change with sponsorships every 1-2 years, so rather than hand-typing a list that
goes stale, this calls stats.nba.com's teaminfocommon endpoint once per team (real, current
ARENA/ARENACAPACITY fields, confirmed via nba_api project docs) - 30 calls, reusing the team ID
list already committed by scrape_nba_stats_teams.py rather than duplicating it.

Writes nba/data/nba_arenas_current.json + nba/data/nba_arenas_current_meta.json.
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

TEAMS_INPUT_PATH = Path("nba/data/nba_teams_current.json")
OUTPUT_PATH = Path("nba/data/nba_arenas_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_arenas_current_meta.json")


def fetch_one(team_id, proxies):
    url = f"https://stats.nba.com/stats/teaminfocommon?LeagueID=00&Season=2025-26&SeasonType=Regular+Season&TeamID={team_id}"
    last_error = None
    for attempt in range(1, 3):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = (body.get("resultSets") or [{}])[0]
            headers = rs.get("headers", [])
            row = (rs.get("rowSet") or [[]])[0]
            idx = {h: i for i, h in enumerate(headers)}

            def col(name):
                i = idx.get(name)
                return row[i] if i is not None and i < len(row) else None

            return {
                "team_id": team_id,
                "arena_name": col("ARENA"),
                "arena_capacity": col("ARENACAPACITY"),
                "city": col("TEAM_CITY"),
            }, None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 2:
                time.sleep(3)
    return None, last_error


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    if not TEAMS_INPUT_PATH.exists():
        OUTPUT_META_PATH.write_text(json.dumps({
            "fetched_at": fetched_at, "arena_count": 0,
            "error": f"missing_input: {TEAMS_INPUT_PATH} not found - run the teams scrape first"
        }, indent=2), encoding="utf-8")
        print("NBA arenas scrape FAILED: missing teams input file", file=sys.stderr)
        sys.exit(1)

    teams = json.loads(TEAMS_INPUT_PATH.read_text(encoding="utf-8")).get("teams", [])
    arenas = []
    errors = []
    for t in teams:
        team_id = t.get("id")
        if not team_id:
            continue
        result, error = fetch_one(team_id, proxies)
        if result:
            arenas.append(result)
        else:
            errors.append({"team_id": team_id, "abbreviation": t.get("abbreviation"), "error": error})
        time.sleep(0.6)  # light pacing across 30 sequential calls

    OUTPUT_PATH.write_text(json.dumps({"arenas": arenas}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "arena_count": len(arenas),
        "team_count_input": len(teams),
        "per_team_errors": errors,
    }, indent=2), encoding="utf-8")

    if len(arenas) < len(teams):
        print(f"NBA arenas scrape PARTIAL: {len(arenas)}/{len(teams)} succeeded, {len(errors)} errors", file=sys.stderr)
        sys.exit(1)

    print(f"NBA arenas scrape OK: {len(arenas)} arenas")


if __name__ == "__main__":
    main()
