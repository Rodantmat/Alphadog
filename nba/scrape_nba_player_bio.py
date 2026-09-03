#!/usr/bin/env python3
"""
Weekly-appropriate player bio + season-profile data (per nba/NBA_ENRICHMENT_FACTORS_RESEARCH.md,
2026-09-01): one call, whole league. leaguedashplayerbiostats gives age/height/weight/draft
background (truly static) plus season usage/efficiency aggregates (semi-static, stable enough for
weekly refresh - a single game barely moves a season average after 20+ games played).

Writes nba/data/nba_player_bio_current.json + _meta.json.
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

URL = "https://stats.nba.com/stats/leaguedashplayerbiostats?LeagueID=00&Season=2025-26&SeasonType=Regular+Season&PerMode=Totals"
# playerindex: separate, confirmed-real bulk endpoint (one call, whole league) that includes an
# actual POSITION field (e.g. "F", "G", "C") - leaguedashplayerbiostats does NOT have this column
# despite PlayerPosition being a filter param there (confirmed the hard way: an earlier attempt
# to pull "PLAYER_POSITION" from that endpoint's rows would have silently returned null for
# every player, since it isn't a real output column - caught and reverted before it shipped).
POSITION_URL = "https://stats.nba.com/stats/playerindex?LeagueID=00&Season=2025-26&Historical=0"
OUTPUT_PATH = Path("nba/data/nba_player_bio_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_player_bio_current_meta.json")


def fetch_positions():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    for attempt in range(1, 4):
        try:
            resp = requests.get(POSITION_URL, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = (body.get("resultSets") or [{}])[0]
            headers = rs.get("headers", [])
            idx = {h: i for i, h in enumerate(headers)}
            pid_i, pos_i = idx.get("PERSON_ID"), idx.get("POSITION")
            out = {}
            if pid_i is not None and pos_i is not None:
                for row in rs.get("rowSet") or []:
                    if row[pid_i]:
                        out[int(row[pid_i])] = row[pos_i]
            return out
        except Exception:  # noqa: BLE001
            if attempt < 3:
                time.sleep(5)
    return {}


def fetch():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(URL, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = (body.get("resultSets") or [{}])[0]
            headers = rs.get("headers", [])
            idx = {h: i for i, h in enumerate(headers)}

            def col(row, name):
                i = idx.get(name)
                return row[i] if i is not None and i < len(row) else None

            players = []
            for row in rs.get("rowSet") or []:
                pid = col(row, "PLAYER_ID")
                if not pid:
                    continue
                players.append({
                    "player_id": int(pid),
                    "age": col(row, "AGE"),
                    "height_inches": col(row, "PLAYER_HEIGHT_INCHES"),
                    "weight": col(row, "PLAYER_WEIGHT"),
                    "college": col(row, "COLLEGE"),
                    "country": col(row, "COUNTRY"),
                    "draft_year": col(row, "DRAFT_YEAR"),
                    "draft_round": col(row, "DRAFT_ROUND"),
                    "draft_number": col(row, "DRAFT_NUMBER"),
                    "gp": col(row, "GP"),
                    "pts": col(row, "PTS"),
                    "reb": col(row, "REB"),
                    "ast": col(row, "AST"),
                    "net_rating": col(row, "NET_RATING"),
                    "oreb_pct": col(row, "OREB_PCT"),
                    "dreb_pct": col(row, "DREB_PCT"),
                    "usg_pct": col(row, "USG_PCT"),
                    "ts_pct": col(row, "TS_PCT"),
                    "ast_pct": col(row, "AST_PCT"),
                })
            return players, resp.status_code
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(5)
    raise RuntimeError(last_error)


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        players, http_status = fetch()
        error = None
    except Exception as exc:  # noqa: BLE001
        players, http_status, error = [], None, str(exc)

    positions = fetch_positions()
    matched = 0
    for p in players:
        pos = positions.get(p["player_id"])
        p["position"] = pos
        if pos:
            matched += 1
    position_note = f"positions_matched: {matched}/{len(players)} via playerindex" if players else None

    OUTPUT_PATH.write_text(json.dumps({"players": players}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at, "source_url": URL, "http_status": http_status,
        "player_count": len(players), "error": error, "position_note": position_note,
    }, indent=2), encoding="utf-8")

    if error:
        print(f"NBA player bio scrape FAILED: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"NBA player bio scrape OK: {len(players)} players, http_status={http_status}")


if __name__ == "__main__":
    main()
