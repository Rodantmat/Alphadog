#!/usr/bin/env python3
"""
One-time backfill of the additional game-log MeasureTypes identified in the 2026-09-07 baseline
data-universe research pass, for the same 3 seasons already covered by Base+Advanced.

Real, verified scope (via nba/diagnostic_measure_types.py against live data, not assumed):
- playergamelogs  Usage        -> nba_stats.player_game_log_usage   (26,651 rows/season, exact match to Base)
- playergamelogs  Scoring      -> nba_stats.player_game_log_scoring (26,651 rows/season)
- teamgamelogs    Scoring      -> nba_team.team_game_log_scoring    (2,460 rows/season)
- teamgamelogs    Four Factors -> nba_team.team_game_log_four_factors (2,460 rows/season, incl. OPPONENT four factors)

Deliberately skipped, with real reasons:
- playergamelogs Four Factors: HTTP 500 from the endpoint itself, AND redundant - efg_pct/ts_pct
  are already in player_game_log_advanced and FTA rate derives from Base. No real loss.
- teamgamelogs Usage: HTTP 500, and semantically meaningless (a team's share of its own stats).
- Misc / Opponent / Defense: per Gemini's per-type assessment, single-game descriptive/matchup
  data rather than baseline talent signal - skipped for now, cheap to add later if ever needed.

Seasons come from the shared utility: the 3 most recent seasons with real game data
(active_stats_season + the 2 before it) - no hardcoded season strings.
"""
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

sys.path.insert(0, "nba")
from nba_season import stats_seasons

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

SPECS = [
    ("player_usage", "playergamelogs", "Usage", "PlayerGameLogs"),
    ("player_scoring", "playergamelogs", "Scoring", "PlayerGameLogs"),
    ("team_scoring", "teamgamelogs", "Scoring", "TeamGameLogs"),
    ("team_four_factors", "teamgamelogs", "Four Factors", "TeamGameLogs"),
]


def build_url(endpoint, measure_type, season):
    url = (f"https://stats.nba.com/stats/{endpoint}?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00"
           f"&Location=&MeasureType={measure_type.replace(' ', '+')}&Month=0&OpponentTeamID=0&Outcome=&PORound=0"
           f"&PaceAdjust=N&PerMode=Totals&Period=0&PlusMinus=N&Rank=N&Season={season}&SeasonSegment="
           f"&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision=")
    if endpoint == "playergamelogs":
        url += "&PlayerExperience=&PlayerPosition=&StarterBench="
    return url


def fetch(url, result_set_name, proxies):
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=90, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = next((r for r in body.get("resultSets") or [] if r.get("name") == result_set_name), None)
            if not rs:
                return None, f"{result_set_name}_result_set_not_found"
            headers = rs.get("headers", [])
            return [dict(zip(headers, row)) for row in (rs.get("rowSet") or [])], None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(10)
    return None, last_error


KEEP_COMMON = {"PLAYER_ID", "TEAM_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "MIN"}


def slim(row):
    """Keep only IDs, game context, and real metric columns. Drop the *_RANK columns (pure noise,
    ~half the bytes), NICKNAME/TEAM_NAME/PLAYER_NAME (already in nba_ref), and other padding.
    Real reason (2026-09-08): the 3-season combined player files hit 116-124 MB, over GitHub's
    hard 100 MB per-file limit - the push was rejected by the pre-receive hook."""
    return {k: v for k, v in row.items() if k in KEEP_COMMON or (k.startswith(("USG_", "PCT_", "EFG_", "FTA_", "TM_TOV", "OREB_", "OPP_")) and not k.endswith("_RANK"))}


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    seasons = stats_seasons(3)
    meta = {"fetched_at": fetched_at, "seasons": seasons, "results": {}, "errors": []}

    for key, endpoint, measure_type, rs_name in SPECS:
        for season in seasons:
            rows, error = fetch(build_url(endpoint, measure_type, season), rs_name, proxies)
            slug = season.replace("-", "_")
            if rows is None:
                meta["errors"].append({"key": key, "season": season, "error": error})
                print(f"{key} {season}: FAILED - {error}")
            else:
                slim_rows = [slim(r) for r in rows]
                # One file per (key, season) - never a combined multi-season file (100 MB limit).
                Path(f"nba/data/nba_backfill_{key}_{slug}.json").write_text(json.dumps({"season": season, "records": slim_rows}, separators=(",", ":")), encoding="utf-8")
                meta["results"][f"{key}_{slug}"] = len(slim_rows)
                print(f"{key} {season}: {len(slim_rows)} rows")
            time.sleep(2)

    Path("nba/data/nba_backfill_measure_types_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))
    if len(meta["errors"]) > 2:
        sys.exit(1)


if __name__ == "__main__":
    main()
