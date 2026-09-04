#!/usr/bin/env python3
"""
Real gap fill (2026-09-04, per the person's continued audit): multi-player lineup synergy data -
the last item from the second double-check pass. player_onoff_profile only covers single-player
on/off net rating; there was no 2/3/4/5-man combination data anywhere.

leaguedashlineups is a genuinely bulk, league-wide endpoint - confirmed via real documentation
(GROUP_ID = "dash-separated list of player IDs in group", GROUP_NAME = same for names). One call
per GroupQuantity (2,3,4,5) covers the WHOLE league for the season - 4 total calls, far cheaper
than the per-game backfills (starter status, officials) that came before this in the same audit.

Weekly-refresh cadence (like the rest of the static/weekly layer), not a one-time historical
backfill - lineups shift as rotations change during the season.
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

SEASON = "2025-26"
OUTPUT_PATH = Path("nba/data/nba_lineup_profile.json")
OUTPUT_META_PATH = Path("nba/data/nba_lineup_profile_meta.json")


def col(row, idx, name):
    return row[idx[name]] if name in idx else None


def fetch_group(group_quantity, proxies):
    url = (
        "https://stats.nba.com/stats/leaguedashlineups?Conference=&DateFrom=&DateTo=&Division="
        f"&GameSegment=&GroupQuantity={group_quantity}&LastNGames=0&LeagueID=00&Location="
        "&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=&PaceAdjust=N&PerMode=Totals"
        f"&Period=0&PlusMinus=N&Rank=N&Season={SEASON}&SeasonSegment=&SeasonType=Regular+Season"
        "&ShotClockRange=&TeamID=&VsConference=&VsDivision="
    )
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=60, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = next((r for r in body.get("resultSets") or [] if r.get("name") == "Lineups"), None)
            if not rs:
                return None, "lineups_result_set_not_found"
            headers = rs.get("headers", [])
            idx = {h: i for i, h in enumerate(headers)}
            rows = []
            for row in rs.get("rowSet") or []:
                group_id = col(row, idx, "GROUP_ID")
                if not group_id:
                    continue
                player_ids = [p for p in str(group_id).strip("-").split("-") if p]
                rows.append({
                    "group_quantity": group_quantity, "group_id": group_id, "player_ids": player_ids,
                    "group_name": col(row, idx, "GROUP_NAME"), "team_id": col(row, idx, "TEAM_ID"),
                    "gp": col(row, idx, "GP"), "w": col(row, idx, "W"), "l": col(row, idx, "L"),
                    "w_pct": col(row, idx, "W_PCT"), "min": col(row, idx, "MIN"),
                    "fgm": col(row, idx, "FGM"), "fga": col(row, idx, "FGA"), "fg_pct": col(row, idx, "FG_PCT"),
                    "fg3m": col(row, idx, "FG3M"), "fg3a": col(row, idx, "FG3A"), "fg3_pct": col(row, idx, "FG3_PCT"),
                    "ftm": col(row, idx, "FTM"), "fta": col(row, idx, "FTA"), "ft_pct": col(row, idx, "FT_PCT"),
                    "oreb": col(row, idx, "OREB"), "dreb": col(row, idx, "DREB"), "reb": col(row, idx, "REB"),
                    "ast": col(row, idx, "AST"), "tov": col(row, idx, "TOV"), "stl": col(row, idx, "STL"),
                    "blk": col(row, idx, "BLK"), "blka": col(row, idx, "BLKA"), "pf": col(row, idx, "PF"),
                    "pfd": col(row, idx, "PFD"), "pts": col(row, idx, "PTS"), "plus_minus": col(row, idx, "PLUS_MINUS"),
                })
            return rows, None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(8)
    return None, last_error


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    all_rows = []
    errors = []
    for gq in (2, 3, 4, 5):
        rows, error = fetch_group(gq, proxies)
        if rows is not None:
            all_rows.extend(rows)
            print(f"GroupQuantity={gq}: {len(rows)} lineups")
        else:
            errors.append({"group_quantity": gq, "error": error})
            print(f"GroupQuantity={gq}: FAILED - {error}")
        time.sleep(1)

    OUTPUT_PATH.write_text(json.dumps({"season": SEASON, "rows": all_rows}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at, "season": SEASON, "row_count": len(all_rows), "errors": errors,
    }, indent=2), encoding="utf-8")
    print(f"Lineup profile: {len(all_rows)} total rows, {len(errors)} group errors")


if __name__ == "__main__":
    main()
