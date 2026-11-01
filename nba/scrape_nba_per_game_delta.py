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


CDN_HEADERS = {"User-Agent": STATS_HEADERS["User-Agent"], "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com"}
CDN_POS = {"PG": "G", "SG": "G", "G": "G", "SF": "F", "PF": "F", "F": "F", "C": "C"}


def get_json(url, proxies, headers=None):
    """stats.nba.com through the system retry policy (nba/net_retry.py, 2026-10-09): 4 attempts (was 2), full-jitter
    backoff (was a fixed 3 s), 429/5xx/connection errors retried, a final 4xx returned at once."""
    from net_retry import RetryError, request
    try:
        resp = request("GET", url, session=requests, proxies=proxies, routes=("proxy",), tries=4, base=2, cap=15,
                       timeout=30, label="stats boxscore", headers=headers or STATS_HEADERS, impersonate="chrome124")
    except RetryError as exc:
        return None, str(exc)
    if resp.status_code != 200:
        return None, f"http {resp.status_code}"
    try:
        return resp.json(), None
    except Exception as exc:  # noqa: BLE001
        return None, f"not json: {str(exc)[:80]}"


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


def fetch_starter_status_cdn(game_id, proxies):
    """FALLBACK (2026-11-01): P2A 11-01 lost game 0022600153's starters to one stats.nba.com HTTP 403 (a re-fetch an hour later
    answered 200). NBA's CDN live box score carries the same per-game starter flag: measured on 4 committed games
    (research_starter_cdn.py) it matched boxscoretraditionalv3 on the starter flag 108/108 and the position 108/108 (CDN
    PG/SG/SF/PF/C -> v3 G/F/C). It lacks v3's DNP comment and some inactive two-way players, so a game filled from here is
    recorded in meta.cdn_fallback_games and re-fetched from v3 on the next run (the v3 rows then replace these)."""
    body, err = get_json(f"https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{game_id}.json", proxies, CDN_HEADERS)
    if body is None:
        return None, err
    g = body.get("game") or {}
    if g.get("gameStatus") != 3:
        return None, f"cdn gameStatus {g.get('gameStatus')} (not final)"
    rows = []
    for side in ("homeTeam", "awayTeam"):
        for p in (g.get(side) or {}).get("players") or []:
            pid = p.get("personId")
            if not pid:
                continue
            st = 1 if str(p.get("starter")) == "1" else 0
            pos = CDN_POS.get(str(p.get("position") or "").upper()) if st else None
            if st and not pos:
                return None, f"cdn starter {pid} with unmapped position {p.get('position')!r}"
            rows.append({"player_id": int(pid), "game_id": game_id, "start_position": pos, "is_starter": st,
                         "comment": p.get("notPlayingDescription") or None})
    if sum(r["is_starter"] for r in rows) != 10:
        return None, f"cdn starters {sum(r['is_starter'] for r in rows)} != 10"
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


def run_delta(name, data_path, meta_path, logged_games, fetch_fn, proxies, fetched_at, season, fallback_fn=None):
    data = load(data_path, {"rows": []})
    meta = load(meta_path, {})
    rows = data.get("rows", [])
    fallback_games = set(meta.get("cdn_fallback_games", []))
    covered = {r["game_id"] for r in rows} - fallback_games      # a fallback-filled game is re-asked of the primary source
    known_empty = set(meta.get("known_empty_games", []))
    delta = sorted(logged_games - covered - known_empty)
    print(f"{name}: logged={len(logged_games)} covered={len(covered)} known_empty={len(known_empty)} fallback-filled={len(fallback_games)} -> delta={len(delta)}")

    new_rows, errors, newly_empty, via_fallback, upgraded = [], [], [], [], []
    for gid in delta:
        got, err = fetch_fn(gid, proxies)
        if got is not None and gid in fallback_games:
            if got:                     # the primary source answered: its rows replace the fallback rows
                rows = [r for r in rows if r["game_id"] != gid]
                fallback_games.discard(gid)
                upgraded.append(gid)
            else:                       # primary empty for a game the fallback filled - keep the fallback rows
                continue
        if got is None and fallback_fn is not None:
            if gid in fallback_games:   # already filled by the fallback; the primary is still failing - keep and retry next run
                print(f"{name}: {gid} primary still failing ({err}) - keeping the fallback rows")
                continue
            got2, err2 = fallback_fn(gid, proxies)
            if got2:
                print(f"{name}: {gid} primary failed ({err}) -> filled from the fallback source ({len(got2)} rows)")
                fallback_games.add(gid)
                via_fallback.append(gid)
                got, err = got2, None
            else:
                err = f"{err}; fallback: {err2}"
        if got is None:
            errors.append({"game_id": gid, "error": err})
        elif not got:
            newly_empty.append(gid)
        else:
            new_rows.extend(got)
        time.sleep(0.3)

    if new_rows or upgraded:
        rows.extend(new_rows)
        data["rows"] = rows
        data_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    meta.update({
        "fetched_at": fetched_at, "season": season, "method": "delta",
        "row_count": len(rows), "games_covered": len({r["game_id"] for r in rows}),
        "last_delta": {"attempted": len(delta), "recovered_games": len({r["game_id"] for r in new_rows}), "errors": errors, "newly_empty": newly_empty,
                       "via_fallback": via_fallback, "upgraded_from_fallback": upgraded},
        "known_empty_games": sorted(known_empty | set(newly_empty)),
        "cdn_fallback_games": sorted(fallback_games),
    })
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"{name}: +{len(new_rows)} rows, {len(errors)} errors, {len(newly_empty)} newly-empty, {len(via_fallback)} via fallback, {len(upgraded)} upgraded to the primary")
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

    e1 = run_delta("starter_status", Path(f"nba/data/nba_starter_status_{slug}.json"), Path(f"nba/data/nba_starter_status_{slug}_meta.json"), logged_games, fetch_starter_status, proxies, fetched_at, season,
                   fallback_fn=fetch_starter_status_cdn)
    e2 = run_delta("game_officials", Path(f"nba/data/nba_game_officials_{slug}.json"), Path(f"nba/data/nba_game_officials_{slug}_meta.json"), logged_games, fetch_officials, proxies, fetched_at, season)
    if len(e1) + len(e2) > max(3, len(logged_games) * 0.05):
        sys.exit(1)


if __name__ == "__main__":
    main()
