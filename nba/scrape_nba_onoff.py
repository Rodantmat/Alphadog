#!/usr/bin/env python3
"""
On/off-court "with or without you" splits (per NBA_ENRICHMENT_FACTORS_RESEARCH.md, 2026-09-01 -
flagged by Gemini as very high predictive signal, not yet source-verified until now).

teamplayeronoffdetails is a real, per-TEAM endpoint (confirmed via nba_api/hoopR docs) - one call
per team, 30 calls total (same shape as the arenas scrape). Returns three result sets:
OverallTeamPlayerOnOffDetails, PlayersOnCourtTeamPlayerOnOffDetails,
PlayersOffCourtTeamPlayerOnOffDetails. This script matches each player's ON row to their OFF row
by VS_PLAYER_ID and computes the real net-rating differential (team net rating with the player on
the floor minus with them off) - the actual "with/without you" signal.

Writes nba/data/nba_onoff_current.json + _meta.json.
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
OUTPUT_PATH = Path("nba/data/nba_onoff_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_onoff_current_meta.json")


def result_set_rows(body, name):
    for rs in body.get("resultSets") or []:
        if rs.get("name") == name:
            headers = rs.get("headers", [])
            idx = {h: i for i, h in enumerate(headers)}
            return [{h: row[i] for h, i in idx.items()} for row in rs.get("rowSet") or []]
    return []


def fetch_one_team(team_id, proxies):
    url = (
        "https://stats.nba.com/stats/teamplayeronoffdetails?DateFrom=&DateTo=&GameSegment=&LastNGames=0"
        "&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0"
        "&PaceAdjust=N&PerMode=PerGame&Period=0&PlusMinus=N&Rank=N&Season=2025-26&SeasonSegment="
        f"&SeasonType=Regular+Season&ShotClockRange=&TeamID={team_id}&VsConference=&VsDivision="
    )
    last_error = None
    for attempt in range(1, 3):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            on_rows = result_set_rows(body, "PlayersOnCourtTeamPlayerOnOffDetails")
            off_rows = result_set_rows(body, "PlayersOffCourtTeamPlayerOnOffDetails")
            off_by_player = {r.get("VS_PLAYER_ID"): r for r in off_rows}
            players = []
            for on in on_rows:
                pid = on.get("VS_PLAYER_ID")
                off = off_by_player.get(pid)
                if not pid or not off:
                    continue
                net_on = on.get("NET_RATING")
                net_off = off.get("NET_RATING")
                players.append({
                    "player_id": int(pid),
                    "team_id": team_id,
                    "net_rating_on": net_on,
                    "net_rating_off": net_off,
                    "net_rating_diff": (net_on - net_off) if isinstance(net_on, (int, float)) and isinstance(net_off, (int, float)) else None,
                    "off_rating_on": on.get("OFF_RATING"),
                    "off_rating_off": off.get("OFF_RATING"),
                    "def_rating_on": on.get("DEF_RATING"),
                    "def_rating_off": off.get("DEF_RATING"),
                })
            return players, None
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
            "fetched_at": fetched_at, "player_count": 0,
            "error": f"missing_input: {TEAMS_INPUT_PATH} not found - run the teams scrape first"
        }, indent=2), encoding="utf-8")
        print("NBA on/off scrape FAILED: missing teams input file", file=sys.stderr)
        sys.exit(1)

    teams = json.loads(TEAMS_INPUT_PATH.read_text(encoding="utf-8")).get("teams", [])
    all_players = []
    errors = []
    for t in teams:
        team_id = t.get("id")
        if not team_id:
            continue
        players, error = fetch_one_team(team_id, proxies)
        if players is not None:
            all_players.extend(players)
        else:
            errors.append({"team_id": team_id, "abbreviation": t.get("abbreviation"), "error": error})
        time.sleep(0.6)

    OUTPUT_PATH.write_text(json.dumps({"players": all_players}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "player_count": len(all_players),
        "team_count_input": len(teams),
        "per_team_errors": errors,
    }, indent=2), encoding="utf-8")

    if len(errors) > 3:
        print(f"NBA on/off scrape PARTIAL: {len(errors)} team errors out of {len(teams)}", file=sys.stderr)
        sys.exit(1)

    print(f"NBA on/off scrape OK: {len(all_players)} player on/off rows across {len(teams) - len(errors)} teams")


if __name__ == "__main__":
    main()
