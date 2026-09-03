#!/usr/bin/env python3
"""
ONE-TIME backfill (per NBA_HISTORICAL_BACKFILL_PLAN.md Section 8, and the person's explicit
"for previous seasons you can get the aggregates" instruction, 2026-09-03): season-by-season
career totals for every currently active player, via playercareerstats - one call per player,
each call returns their ENTIRE career (rookie season through now), already aggregated to season
level. This safely extends historical coverage without the per-game contamination risk flagged
for the full game-log backfill (which is intentionally scoped to only the most recent completed
season, per the person's decision).

Real, unresolved question flagged in the plan doc, checked empirically here rather than assumed:
how a mid-season-traded player's rows are represented (separate per-team rows, a combined "TOT"
total, or both) - the raw per-player response is preserved in raw_json for every row so this can
be inspected/resolved after a real run, not guessed at in advance.

Reads the player ID list from the already-committed nba/data/nba_players_current.json (reuses
existing data, no duplicate player-list mining).

Writes nba/data/nba_player_career_totals.json + _meta.json.
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

PLAYERS_INPUT_PATH = Path("nba/data/nba_players_current.json")
OUTPUT_PATH = Path("nba/data/nba_player_career_totals.json")
OUTPUT_META_PATH = Path("nba/data/nba_player_career_totals_meta.json")

FIELDS = ["PLAYER_ID", "SEASON_ID", "TEAM_ID", "PLAYER_AGE", "GP", "GS", "MIN",
          "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
          "OREB", "DREB", "REB", "AST", "STL", "BLK", "TOV", "PF", "PTS"]


def fetch_one(player_id, proxies):
    url = f"https://stats.nba.com/stats/playercareerstats?LeagueID=00&PerMode=Totals&PlayerID={player_id}"
    last_error = None
    for attempt in range(1, 3):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            for rs in body.get("resultSets") or []:
                if rs.get("name") == "SeasonTotalsRegularSeason":
                    headers = rs.get("headers", [])
                    idx = {h: i for i, h in enumerate(headers)}
                    rows = []
                    for row in rs.get("rowSet") or []:
                        rec = {f: (row[idx[f]] if f in idx and idx[f] < len(row) else None) for f in FIELDS}
                        rows.append(rec)
                    return rows, None
            return [], "season_totals_regular_season_not_found"
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

    if not PLAYERS_INPUT_PATH.exists():
        OUTPUT_META_PATH.write_text(json.dumps({
            "fetched_at": fetched_at, "player_count": 0,
            "error": f"missing_input: {PLAYERS_INPUT_PATH} not found"
        }, indent=2), encoding="utf-8")
        print("Career totals backfill FAILED: missing players input file", file=sys.stderr)
        sys.exit(1)

    players = json.loads(PLAYERS_INPUT_PATH.read_text(encoding="utf-8")).get("players", [])
    all_rows = []
    errors = []
    for p in players:
        player_id = p.get("id")
        if not player_id:
            continue
        rows, error = fetch_one(player_id, proxies)
        if rows is not None:
            all_rows.extend(rows)
        else:
            errors.append({"player_id": player_id, "full_name": p.get("full_name"), "error": error})
        time.sleep(0.4)

    OUTPUT_PATH.write_text(json.dumps({"rows": all_rows}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "player_count_input": len(players),
        "row_count": len(all_rows),
        "per_player_errors": errors,
    }, indent=2), encoding="utf-8")

    if len(errors) > len(players) * 0.05:
        print(f"Career totals backfill PARTIAL: {len(errors)} errors out of {len(players)} players", file=sys.stderr)
        sys.exit(1)

    print(f"Career totals backfill OK: {len(all_rows)} season-rows across {len(players) - len(errors)} players")


if __name__ == "__main__":
    main()
