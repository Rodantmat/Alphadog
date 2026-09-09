#!/usr/bin/env python3
"""
Period-props data: bulk player game logs per QUARTER (Period=1..4) for the stats seasons.
Verified 2026-09-08 (diagnostic probe): stats.nba.com/stats/playergamelogs honors Period=1..4
(LeBron 9.6 min / 10 pts in a Q1 row; Dalton Knecht 12.0 min / 17 pts in a Q4 row). Four cheap bulk
calls per season instead of ~5,000 per-game calls.

Output: nba/data/nba_player_game_log_q{1,2,3,4}_{season_slug}.json  ({"meta":..., "records":[...]})
Slim columns only. Half props (1H = Q1+Q2, 2H = Q3+Q4) and OT are derived downstream: full-game minus
Q1..Q4 gives the OT contribution per player (PrizePicks/Underdog include OT in 2H/4Q; Sleeper quarter
markets do not). Run via the nba-scrape workflow (stats.nba.com is not reachable from the analysis sandbox).
"""
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

sys.path.insert(0, "nba")
from nba_season import stats_seasons

KEEP = ["PLAYER_ID", "TEAM_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "MIN", "PTS", "REB", "AST", "FG3M", "FG3A", "FGA", "FGM", "FTM", "FTA", "STL", "BLK", "TOV", "PF", "OREB", "DREB", "PLUS_MINUS"]
STATS_HEADERS = {
    "Host": "stats.nba.com", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br", "Connection": "keep-alive", "Referer": "https://stats.nba.com/",
    "x-nba-stats-origin": "stats", "x-nba-stats-token": "true",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}
OUT = Path("nba/data")


def fetch_period(season, period, proxies):
    url = (f"https://stats.nba.com/stats/playergamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00"
           f"&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals"
           f"&Period={period}&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season={season}&SeasonSegment="
           f"&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=")
    for attempt in range(4):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=90, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = next((r for r in body.get("resultSets") or [] if r.get("name") == "PlayerGameLogs"), None)
            if not rs:
                raise RuntimeError("PlayerGameLogs result set missing")
            hdr = rs.get("headers", []); rows = rs.get("rowSet") or []
            idx = [hdr.index(c) for c in KEEP if c in hdr]; cols = [hdr[i] for i in idx]
            recs = [dict(zip(cols, [r[i] for i in idx])) for r in rows]
            return recs, hdr
        except Exception as exc:  # noqa: BLE001
            print(f"  attempt {attempt + 1} failed for {season} Q{period}: {exc}")
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"period fetch failed: {season} Q{period}")


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    seasons = stats_seasons(int(os.environ.get("PERIODS_SEASONS", "3")))   # daily delta passes 1 (current season only)
    summary = {}
    for season in seasons:
        slug = season.replace("-", "_")
        for period in (1, 2, 3, 4):
            recs, hdr = fetch_period(season, period, proxies)
            path = OUT / f"nba_player_game_log_q{period}_{slug}.json"
            path.write_text(json.dumps({"meta": {"season": season, "period": period, "endpoint": "playergamelogs", "measure_type": "Base",
                                                 "row_count": len(recs), "source_headers": hdr}, "records": recs}))
            mins = [float(r.get("MIN") or 0) for r in recs[:2000]]
            summary[f"{season}_Q{period}"] = {"rows": len(recs), "sample_max_min_first2000": max(mins) if mins else None}
            print(f"{season} Q{period}: {len(recs)} rows -> {path} ({path.stat().st_size / 1e6:.1f} MB)")
            time.sleep(2.0)
    (OUT / "nba_player_game_log_periods_summary.json").write_text(json.dumps({"seasons": seasons, "summary": summary}, indent=2))
    bad = {k: v for k, v in summary.items() if v["sample_max_min_first2000"] and v["sample_max_min_first2000"] > 17}
    if bad:
        print("WARNING: quarter rows with >17 minutes (Period param may be ignored):", bad)
        sys.exit(2)


if __name__ == "__main__":
    main()
