#!/usr/bin/env python3
"""
ONE-TIME backfill (per the person's "focus on still-needed backfills" instruction, 2026-09-03):
real splits identified in NBA_HISTORICAL_BACKFILL_PLAN.md Section 3 (DaysRest, Location,
StartingPosition, PrePostAllStar, WinsLosses, Month) but never actually built - confirmed via a
real Postgres audit that zero split tables existed before this script.

playerdashboardbygeneralsplits / teamdashboardbygeneralsplits: real, confirmed endpoints - ONE
call per player/team returns ALL 6 split groups together (per prior research), not 6 separate
calls. Scoped to the current season (2025-26, the one full-detail season already backfilled) -
per the plan's own guidance, splits are most valuable for the "hot" full-detail season, not
necessarily re-collected for the older 2 seasons at the same exhaustive level.

Writes nba/data/nba_player_splits.json, nba/data/nba_team_splits.json, plus _meta.json for each.
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
PLAYERS_INPUT_PATH = Path("nba/data/nba_players_current.json")
TEAMS_INPUT_PATH = Path("nba/data/nba_teams_current.json")

# Real result-set names confirmed via nba_api project docs for playerdashboardbygeneralsplits.
PLAYER_SPLIT_SETS = {
    "DaysRestPlayerDashboard": "days_rest",
    "LocationPlayerDashboard": "location",
    "MonthPlayerDashboard": "month",
    "PrePostAllStarPlayerDashboard": "pre_post_allstar",
    "WinsLossesPlayerDashboard": "wins_losses",
}
TEAM_SPLIT_SETS = {
    "DaysRestTeamDashboard": "days_rest",
    "LocationTeamDashboard": "location",
    "MonthTeamDashboard": "month",
    "PrePostAllStarTeamDashboard": "pre_post_allstar",
    "WinsLossesTeamDashboard": "wins_losses",
}

SPLIT_FIELDS = ["GROUP_SET", "GROUP_VALUE", "GP", "W", "L", "W_PCT", "MIN",
                "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
                "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "PF", "PTS", "PLUS_MINUS"]


def fetch_json(url, proxies, attempts=3):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            return resp.json(), None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < attempts:
                time.sleep(4)
    return None, last_error


def extract_splits(body, split_set_map):
    out = []
    for rs in body.get("resultSets") or []:
        split_type = split_set_map.get(rs.get("name"))
        if not split_type:
            continue
        headers = rs.get("headers", [])
        idx = {h: i for i, h in enumerate(headers)}
        for row in rs.get("rowSet") or []:
            rec = {"split_type": split_type}
            for f in SPLIT_FIELDS:
                i = idx.get(f)
                rec[f] = row[i] if i is not None and i < len(row) else None
            out.append(rec)
    return out


def fetch_player_splits(player_id, proxies):
    url = (f"https://stats.nba.com/stats/playerdashboardbygeneralsplits?DateFrom=&DateTo="
           f"&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0"
           f"&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0"
           f"&PlayerID={player_id}&PlusMinus=N&Rank=N&Season={SEASON}&SeasonSegment="
           f"&SeasonType=Regular+Season&ShotClockRange=&VsConference=&VsDivision=")
    body, error = fetch_json(url, proxies)
    if body is None:
        return None, error
    return extract_splits(body, PLAYER_SPLIT_SETS), None


def fetch_team_splits(team_id, proxies):
    url = (f"https://stats.nba.com/stats/teamdashboardbygeneralsplits?DateFrom=&DateTo="
           f"&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0"
           f"&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0"
           f"&PlusMinus=N&Rank=N&Season={SEASON}&SeasonSegment=&SeasonType=Regular+Season"
           f"&ShotClockRange=&TeamID={team_id}&VsConference=&VsDivision=")
    body, error = fetch_json(url, proxies)
    if body is None:
        return None, error
    return extract_splits(body, TEAM_SPLIT_SETS), None


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    if not PLAYERS_INPUT_PATH.exists() or not TEAMS_INPUT_PATH.exists():
        print("NBA splits backfill FAILED: missing players or teams input file", file=sys.stderr)
        sys.exit(1)

    players = json.loads(PLAYERS_INPUT_PATH.read_text(encoding="utf-8")).get("players", [])
    teams = json.loads(TEAMS_INPUT_PATH.read_text(encoding="utf-8")).get("teams", [])

    # --- Player splits ---
    all_player_splits = []
    player_errors = []
    for p in players:
        player_id = p.get("id")
        if not player_id:
            continue
        splits, error = fetch_player_splits(player_id, proxies)
        if splits is not None:
            for s in splits:
                s["player_id"] = player_id
            all_player_splits.extend(splits)
        else:
            player_errors.append({"player_id": player_id, "error": error})
        time.sleep(0.4)

    Path("nba/data/nba_player_splits.json").write_text(json.dumps({"rows": all_player_splits}, indent=2), encoding="utf-8")
    Path("nba/data/nba_player_splits_meta.json").write_text(json.dumps({
        "fetched_at": fetched_at, "season": SEASON, "player_count_input": len(players),
        "row_count": len(all_player_splits), "per_player_errors": player_errors,
    }, indent=2), encoding="utf-8")
    print(f"Player splits: {len(all_player_splits)} rows across {len(players) - len(player_errors)} players, {len(player_errors)} errors")

    # --- Team splits ---
    all_team_splits = []
    team_errors = []
    for t in teams:
        team_id = t.get("id")
        if not team_id:
            continue
        splits, error = fetch_team_splits(team_id, proxies)
        if splits is not None:
            for s in splits:
                s["team_id"] = team_id
            all_team_splits.extend(splits)
        else:
            team_errors.append({"team_id": team_id, "error": error})
        time.sleep(0.4)

    Path("nba/data/nba_team_splits.json").write_text(json.dumps({"rows": all_team_splits}, indent=2), encoding="utf-8")
    Path("nba/data/nba_team_splits_meta.json").write_text(json.dumps({
        "fetched_at": fetched_at, "season": SEASON, "team_count_input": len(teams),
        "row_count": len(all_team_splits), "per_team_errors": team_errors,
    }, indent=2), encoding="utf-8")
    print(f"Team splits: {len(all_team_splits)} rows across {len(teams) - len(team_errors)} teams, {len(team_errors)} errors")

    if len(player_errors) > len(players) * 0.05 or len(team_errors) > 0:
        print("NBA splits backfill PARTIAL - too many errors", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
