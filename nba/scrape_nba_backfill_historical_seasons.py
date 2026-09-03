#!/usr/bin/env python3
"""
ONE-TIME backfill extension (per the person's explicit "focus on still-needed backfills"
instruction, 2026-09-03): the original backfill only covered 2025-26 (1 season), but
NBA_HISTORICAL_BACKFILL_PLAN.md Section 2 recommends 3-5 seasons of full per-game logs. This
script closes that real gap by mining 2023-24 and 2024-25 using the exact same proven bulk
endpoints/pattern as the 2025-26 backfill (scrape_nba_backfill_2025_26.py) - kept as a SEPARATE
script rather than modifying the already-verified 2025-26 script, to avoid any risk to that
already-working, already-checked pipeline.

Both seasons write to the SAME real Postgres tables as 2025-26 (nba_stats.player_game_log,
nba_team.team_game_log, plus their _advanced counterparts) - game_id is unique across seasons,
so this is purely additive rows, no risk of collision with the existing 2025-26 data.

Writes nba/data/nba_player_game_log_<season>.json, nba/data/nba_team_game_log_<season>.json,
nba/data/nba_player_game_log_advanced_<season>.json, nba/data/nba_team_game_log_advanced_<season>.json,
plus _meta.json for each, per season.
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

# Two additional seasons - brings total coverage to 3 seasons (2023-24, 2024-25, 2025-26),
# matching NBA_HISTORICAL_BACKFILL_PLAN.md's real recommendation, not the arbitrary "as much as
# possible" - per the plan's own reasoning, going further back risks mixing in stale
# player-context data (different team/role) without real added value for the core training set.
SEASONS = ["2023-24", "2024-25"]

PLAYER_FIELDS = ["PLAYER_ID", "TEAM_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "MIN",
                  "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
                  "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "BLKA", "PF", "PFD", "PTS",
                  "PLUS_MINUS", "NBA_FANTASY_PTS", "DD2", "TD3"]

TEAM_FIELDS = ["TEAM_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "MIN",
               "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
               "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "PF", "PTS", "PLUS_MINUS"]

PLAYER_ADVANCED_FIELDS = ["PLAYER_ID", "GAME_ID", "OFF_RATING", "DEF_RATING", "NET_RATING",
                           "USG_PCT", "PACE", "TS_PCT", "EFG_PCT", "AST_PCT", "OREB_PCT", "DREB_PCT", "REB_PCT"]
TEAM_ADVANCED_FIELDS = ["TEAM_ID", "GAME_ID", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE",
                         "TS_PCT", "EFG_PCT", "AST_PCT", "OREB_PCT", "DREB_PCT"]


def build_urls(season):
    player_base = (
        f"https://stats.nba.com/stats/playergamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0"
        f"&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0"
        f"&PaceAdjust=N&PerMode=Totals&Period=0&PlayerID=&PlusMinus=N&Rank=N&Season={season}"
        f"&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision="
    )
    team_base = (
        f"https://stats.nba.com/stats/teamgamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0"
        f"&LeagueID=00&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0"
        f"&PaceAdjust=N&PerMode=Totals&Period=0&PlusMinus=N&Rank=N&Season={season}"
        f"&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision="
    )
    return {
        "player": player_base,
        "team": team_base,
        "player_advanced": player_base.replace("MeasureType=Base", "MeasureType=Advanced").replace("PerMode=Totals", "PerMode=PerGame"),
        "team_advanced": team_base.replace("MeasureType=Base", "MeasureType=Advanced").replace("PerMode=Totals", "PerMode=PerGame"),
    }


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


def fetch_and_write(url, fields, out_path, meta_path, season, fetched_at, min_expected):
    body, error = fetch_json(url, PROXIES)
    if body is None:
        records, headers = [], []
        error = error or "no_body"
    else:
        records, headers = rows_to_records(body, fields)
        if not records:
            error = "zero_rows_parsed"
        elif len(records) < min_expected:
            error = f"suspiciously_low: {len(records)} rows, expected {min_expected}+"
        else:
            error = None
    out_path.write_text(json.dumps({"records": records}, indent=2), encoding="utf-8")
    meta_path.write_text(json.dumps({
        "fetched_at": fetched_at, "season": season, "record_count": len(records),
        "real_headers_seen": headers, "error": error,
    }, indent=2), encoding="utf-8")
    print(f"{out_path.name}: {len(records)} rows, error={error}")
    return error


PROXIES = None


def main():
    global PROXIES
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    PROXIES = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    all_errors = []
    for season in SEASONS:
        season_slug = season.replace("-", "_")
        urls = build_urls(season)

        e1 = fetch_and_write(urls["player"], PLAYER_FIELDS,
                              Path(f"nba/data/nba_player_game_log_{season_slug}.json"),
                              Path(f"nba/data/nba_player_game_log_{season_slug}_meta.json"),
                              season, fetched_at, min_expected=15000)
        e2 = fetch_and_write(urls["team"], TEAM_FIELDS,
                              Path(f"nba/data/nba_team_game_log_{season_slug}.json"),
                              Path(f"nba/data/nba_team_game_log_{season_slug}_meta.json"),
                              season, fetched_at, min_expected=2000)
        e3 = fetch_and_write(urls["player_advanced"], PLAYER_ADVANCED_FIELDS,
                              Path(f"nba/data/nba_player_game_log_advanced_{season_slug}.json"),
                              Path(f"nba/data/nba_player_game_log_advanced_{season_slug}_meta.json"),
                              season, fetched_at, min_expected=15000)
        e4 = fetch_and_write(urls["team_advanced"], TEAM_ADVANCED_FIELDS,
                              Path(f"nba/data/nba_team_game_log_advanced_{season_slug}.json"),
                              Path(f"nba/data/nba_team_game_log_advanced_{season_slug}_meta.json"),
                              season, fetched_at, min_expected=2000)

        for e in (e1, e2, e3, e4):
            if e:
                all_errors.append(f"{season}: {e}")

        time.sleep(1)

    if all_errors:
        print(f"NBA multi-season backfill FAILED/WARN: {all_errors}", file=sys.stderr)
        sys.exit(1)
    print(f"NBA multi-season backfill OK: {SEASONS}")


if __name__ == "__main__":
    main()
