#!/usr/bin/env python3
"""
Season schedule/calendar (per NBA_ENRICHMENT_FACTORS_RESEARCH.md Section 8, 2026-09-02 - flagged
by Gemini as a missing FOUNDATION, not just another factor: "the central organizing entity for
your entire system"). Named as a needed static entity from day one but never actually built until
now.

stats.nba.com's scheduleleaguev2 - one call, whole season. Real, confirmed response shape (via
nba_api test fixtures and multiple independent client implementations, 2026-09-02):
  {"leagueSchedule": {"seasonYear": ..., "gameDates": [{"gameDate": "...", "games": [{...}]}]}}
Each game has nested homeTeam/awayTeam objects. Exact nested field names not 100% confirmed from
research alone (dumps used a flattened doc-generator format, not the raw nested shape) - this
script is written defensively (multiple key-name fallbacks) and dumps the real raw JSON on
low-confidence/failure so it can be fixed from real ground truth, same as every other scraper
this session.

Writes nba/data/nba_schedule_current.json + _meta.json.
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

URL_TEMPLATE = "https://stats.nba.com/stats/scheduleleaguev2?LeagueID=00&Season={season}"
# Both the just-completed season (real historical backfill value) and the upcoming season the
# person is actually preparing for (per the original brief: "NBA season is currently off...
# starts in about a month or so") - the schedule for next season may or may not be published yet
# this early; each season is fetched independently so one being unavailable doesn't block the
# other.
SEASONS = ["2025-26", "2026-27"]
OUTPUT_PATH = Path("nba/data/nba_schedule_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_schedule_current_meta.json")
OUTPUT_DEBUG_PATH = Path("nba/data/nba_schedule_debug_raw.json")


def get_any(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and k in d and d[k] is not None:
            return d[k]
    return default


def fetch(season):
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    url = URL_TEMPLATE.format(season=season)
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            return resp.json(), resp.status_code, url
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(5)
    raise RuntimeError(last_error)


def parse_games(body):
    league_schedule = body.get("leagueSchedule") or {}
    season_year = league_schedule.get("seasonYear")
    game_dates = league_schedule.get("gameDates") or []
    games = []
    for gd in game_dates:
        for g in gd.get("games") or []:
            home = g.get("homeTeam") or {}
            away = g.get("awayTeam") or {}
            games.append({
                "game_id": get_any(g, "gameId", "gameID"),
                "season": season_year,
                "game_date": get_any(g, "gameDateEst", "gameDate") or gd.get("gameDate"),
                "game_datetime_utc": get_any(g, "gameDateTimeUTC", "gameDateUTC"),
                "home_team_id": get_any(home, "teamId", "teamID"),
                "home_team_tricode": get_any(home, "teamTricode", "teamAbbreviation"),
                "away_team_id": get_any(away, "teamId", "teamID"),
                "away_team_tricode": get_any(away, "teamTricode", "teamAbbreviation"),
                "arena_name": g.get("arenaName"),
                "arena_city": g.get("arenaCity"),
                "game_status": get_any(g, "gameStatus"),
                "game_status_text": get_any(g, "gameStatusText"),
                "game_label": get_any(g, "gameLabel"),
            })
    return games


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    all_games = []
    per_season_meta = {}
    hard_error = None

    for season in SEASONS:
        try:
            body, http_status, url = fetch(season)
            games = parse_games(body)
            real_games = [g for g in games if g["game_id"] and g["home_team_id"] and g["away_team_id"]]
            per_season_meta[season] = {"http_status": http_status, "raw_count": len(games), "real_count": len(real_games), "error": None}
            if season == SEASONS[0] and len(real_games) < 1000:
                # Only the completed season is expected to have ~1230+ games - dump for
                # inspection if that one looks broken. The upcoming season may legitimately be
                # small/empty if the schedule hasn't been released yet - not treated as an error.
                per_season_meta[season]["error"] = f"suspiciously_low: {len(real_games)} games, expected ~1230+"
                OUTPUT_DEBUG_PATH.write_text(json.dumps(body)[:100000], encoding="utf-8")
            all_games.extend(real_games)
        except Exception as exc:  # noqa: BLE001
            per_season_meta[season] = {"http_status": None, "raw_count": 0, "real_count": 0, "error": str(exc)}

    # Only a hard failure if the COMPLETED season (real backfill value) failed outright - the
    # upcoming season not being published yet is expected/normal, not a scrape failure.
    if per_season_meta.get(SEASONS[0], {}).get("real_count", 0) == 0:
        hard_error = f"completed_season_scrape_failed: {per_season_meta.get(SEASONS[0], {}).get('error')}"

    OUTPUT_PATH.write_text(json.dumps({"games": all_games}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "seasons_attempted": SEASONS,
        "per_season": per_season_meta,
        "total_game_count": len(all_games),
        "error": hard_error,
    }, indent=2), encoding="utf-8")

    if hard_error:
        print(f"NBA schedule scrape FAILED: {hard_error}", file=sys.stderr)
        sys.exit(1)
    print(f"NBA schedule scrape OK: {len(all_games)} games across {len(SEASONS)} season(s) attempted")


if __name__ == "__main__":
    main()
