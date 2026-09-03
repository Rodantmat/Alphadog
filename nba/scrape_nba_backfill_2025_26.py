#!/usr/bin/env python3
"""
ONE-TIME backfill (per the person's explicit instruction, 2026-09-03): full per-game box-score
logs for the most recent COMPLETED season (2025-26). This is historical/frozen data - once
mined, it does not need weekly re-mining like the static/enrichment layer does. This script is
not part of nba-scrape.yml's weekly cycle; it's meant to be run once (and re-run only if a real
gap/bug is found, not on a schedule).

playergamelogs / teamgamelogs: real, confirmed bulk endpoints - one call can return an entire
season, whole league (per NBA_HISTORICAL_BACKFILL_PLAN.md, Section 1). Real row counts are large
(a full season is ~450+ active players x up to 82 games = tens of thousands of player-game rows),
so response size is untested at this scale from this session - handled defensively with a dump on
any parsing issue, same as every other scraper this session.

Writes nba/data/nba_player_game_log_2025_26.json, nba/data/nba_team_game_log_2025_26.json,
plus _meta.json for each.
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

SEASON = "2025-26"
PLAYER_URL = (
    f"https://stats.nba.com/stats/playergamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0"
    f"&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0"
    f"&PaceAdjust=N&PerMode=Totals&Period=0&PlayerID=&PlusMinus=N&Rank=N&Season={SEASON}"
    f"&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision="
)
TEAM_URL = (
    f"https://stats.nba.com/stats/teamgamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0"
    f"&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0"
    f"&PaceAdjust=N&PerMode=Totals&Period=0&PlusMinus=N&Rank=N&Season={SEASON}"
    f"&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision="
)


def get_any(d, *keys, default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def fetch_json(url, proxies, attempts=4):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=60, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            return resp.json(), None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < attempts:
                time.sleep(8)
    return None, last_error


def rows_to_records(body, extra_fields):
    rs = (body.get("resultSets") or [{}])[0]
    headers = rs.get("headers", [])
    idx = {h: i for i, h in enumerate(headers)}
    records = []
    for row in rs.get("rowSet") or []:
        rec = {}
        for field in extra_fields:
            i = idx.get(field)
            rec[field] = row[i] if i is not None and i < len(row) else None
        records.append(rec)
    return records, headers


PLAYER_FIELDS = ["PLAYER_ID", "TEAM_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "MIN",
                  "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
                  "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "BLKA", "PF", "PFD", "PTS",
                  "PLUS_MINUS", "NBA_FANTASY_PTS", "DD2", "TD3"]

TEAM_FIELDS = ["TEAM_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "MIN",
               "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
               "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "PF", "PTS", "PLUS_MINUS"]


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    overall_error = None

    # --- Player game logs ---
    body, error = fetch_json(PLAYER_URL, proxies)
    if body is None:
        records, headers = [], []
        error = error or "no_body"
    else:
        records, headers = rows_to_records(body, PLAYER_FIELDS)
        error = None if records else "zero_rows_parsed"

    Path("nba/data/nba_player_game_log_2025_26.json").write_text(json.dumps({"records": records}, indent=2), encoding="utf-8")
    if error:
        Path("nba/data/nba_player_game_log_2025_26_debug_raw.json").write_text(json.dumps(body if body else {"fetch_error": error})[:100000], encoding="utf-8")
        overall_error = f"player_log_error: {error}"
    Path("nba/data/nba_player_game_log_2025_26_meta.json").write_text(json.dumps({
        "fetched_at": fetched_at, "season": SEASON, "record_count": len(records),
        "real_headers_seen": headers, "error": error,
    }, indent=2), encoding="utf-8")
    print(f"Player game logs: {len(records)} rows, error={error}")

    # --- Team game logs ---
    body2, error2 = fetch_json(TEAM_URL, proxies)
    if body2 is None:
        team_records, team_headers = [], []
        error2 = error2 or "no_body"
    else:
        team_records, team_headers = rows_to_records(body2, TEAM_FIELDS)
        error2 = None if team_records else "zero_rows_parsed"

    Path("nba/data/nba_team_game_log_2025_26.json").write_text(json.dumps({"records": team_records}, indent=2), encoding="utf-8")
    if error2:
        Path("nba/data/nba_team_game_log_2025_26_debug_raw.json").write_text(json.dumps(body2 if body2 else {"fetch_error": error2})[:100000], encoding="utf-8")
        overall_error = (overall_error + " | " if overall_error else "") + f"team_log_error: {error2}"
    Path("nba/data/nba_team_game_log_2025_26_meta.json").write_text(json.dumps({
        "fetched_at": fetched_at, "season": SEASON, "record_count": len(team_records),
        "real_headers_seen": team_headers, "error": error2,
    }, indent=2), encoding="utf-8")
    print(f"Team game logs: {len(team_records)} rows, error={error2}")

    if overall_error:
        print(f"NBA backfill FAILED/WARN: {overall_error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
