#!/usr/bin/env python3
"""
Per-game DELTA for starter-status (boxscoretraditionalv3) and officials (boxscoresummaryv3).

The real gap this closes (2026-09-08): the daily-delta worker SURFACES which newly-logged games
lack starter-status/officials coverage, but nothing fetched them - the original per-game
scrapers hardcode "every game in the full-season JSON". On day 1 of the 2026-27 season that path
would have silently done nothing.

Derives the delta purely from committed files (no Postgres access needed on the Actions runner):
  logged games   = GAME_IDs in nba/data/nba_delta_player_game_log.json (written by the daily
                   delta scrape, which runs immediately before this in the same workflow)
  covered games  = GAME_IDs already in nba/data/nba_starter_status_{slug}.json /
                   nba/data/nba_game_officials_{slug}.json (created if the season is new)
  delta          = logged - covered - known_empty
Fetches only the delta (steady-state ~5-15 games/day = 10-30 calls), APPENDS to the season file
so the existing Postgres writers stay valid and idempotent.

known_empty_games: games the source itself returns with zero officials (a real, confirmed
source-side gap - 3 such games in 2025-26) are recorded in the meta and skipped thereafter, so
they are not re-fetched every single day forever.
"""
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

sys.path.insert(0, "nba")
from nba_season import active_stats_season

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


def get_json(url, proxies):
    last = None
    for attempt in range(1, 3):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            return resp.json(), None
        except Exception as exc:  # noqa: BLE001
            last = str(exc)
            if attempt < 2:
                time.sleep(3)
    return None, last


def fetch_starter_status(game_id, proxies):
    body, err = get_json(f"https://stats.nba.com/stats/boxscoretraditionalv3?GameID={game_id}&LeagueID=00&endPeriod=10&endRange=28800&rangeType=0&startPeriod=1&startRange=0", proxies)
    if body is None:
        return None, err
    box = body.get("boxScoreTraditional") or {}
    rows = []
    for side in ("homeTeam", "awayTeam"):
        for p in (box.get(side) or {}).get("players") or []:
            pid = p.get("personId")
            if not pid:
                continue
            pos = p.get("position")
            rows.append({"player_id": int(pid), "game_id": game_id, "start_position": pos or None, "is_starter": 1 if pos else 0, "comment": p.get("comment") or None})
    return rows, None


def fetch_officials(game_id, proxies):
    body, err = get_json(f"https://stats.nba.com/stats/boxscoresummaryv3?GameID={game_id}&LeagueID=00", proxies)
    if body is None:
        return None, err
    summary = body.get("boxScoreSummary") or {}
    rows = []
    for o in summary.get("officials") or []:
        pid = o.get("personId")
        if not pid:
            continue
        rows.append({"game_id": game_id, "official_id": int(pid), "full_name": o.get("name"), "jersey_num": (o.get("jerseyNum") or "").strip() or None, "assignment": o.get("assignment") or None})
    return rows, None


def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def run_delta(name, data_path, meta_path, logged_games, fetch_fn, proxies, fetched_at, season):
    data = load(data_path, {"rows": []})
    meta = load(meta_path, {})
    rows = data.get("rows", [])
    covered = {r["game_id"] for r in rows}
    known_empty = set(meta.get("known_empty_games", []))
    delta = sorted(logged_games - covered - known_empty)
    print(f"{name}: logged={len(logged_games)} covered={len(covered)} known_empty={len(known_empty)} -> delta={len(delta)}")

    new_rows, errors, newly_empty = [], [], []
    for gid in delta:
        got, err = fetch_fn(gid, proxies)
        if got is None:
            errors.append({"game_id": gid, "error": err})
        elif not got:
            newly_empty.append(gid)
        else:
            new_rows.extend(got)
        time.sleep(0.3)

    if new_rows:
        rows.extend(new_rows)
        data["rows"] = rows
        data_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    meta.update({
        "fetched_at": fetched_at, "season": season, "method": "delta",
        "row_count": len(rows), "games_covered": len({r["game_id"] for r in rows}),
        "last_delta": {"attempted": len(delta), "recovered_games": len({r["game_id"] for r in new_rows}), "errors": errors, "newly_empty": newly_empty},
        "known_empty_games": sorted(known_empty | set(newly_empty)),
    })
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"{name}: +{len(new_rows)} rows, {len(errors)} errors, {len(newly_empty)} newly-empty")
    return errors


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    season = active_stats_season()
    slug = season.replace("-", "_")

    logged = load(Path("nba/data/nba_delta_player_game_log.json"), {"records": []})
    if logged.get("season") and logged["season"] != season:
        print(f"delta game log is for {logged['season']}, expected {season} - aborting rather than mixing seasons", file=sys.stderr)
        sys.exit(1)
    logged_games = {r["GAME_ID"] for r in logged.get("records", []) if r.get("GAME_ID")}

    e1 = run_delta("starter_status", Path(f"nba/data/nba_starter_status_{slug}.json"), Path(f"nba/data/nba_starter_status_{slug}_meta.json"), logged_games, fetch_starter_status, proxies, fetched_at, season)
    e2 = run_delta("game_officials", Path(f"nba/data/nba_game_officials_{slug}.json"), Path(f"nba/data/nba_game_officials_{slug}_meta.json"), logged_games, fetch_officials, proxies, fetched_at, season)
    if len(e1) + len(e2) > max(3, len(logged_games) * 0.05):
        sys.exit(1)


if __name__ == "__main__":
    main()
