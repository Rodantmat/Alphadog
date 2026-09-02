#!/usr/bin/env python3
"""
Tier-1 player-tracking families (per NBA_ENRICHMENT_FACTORS_RESEARCH.md Section 8, third
research pass 2026-09-02, Gemini priority list): Passing (POTENTIAL_AST separates assist
opportunity from finishing), Rebounding (REB_CHANCES/CONTESTED_REB separates sustainable
rebounding from lucky bounces), Drives (DRIVE_PTS/DRIVE_AST - core scoring/playmaking driver),
CatchShoot/PullUpShot (how a player scores), and touches (ElbowTouch/PostTouch/PaintTouch - role
proxies). Same leaguedashptstats endpoint already proven for SpeedDistance - one call per
PtMeasureType, whole league, no per-player looping needed.

Unlike SpeedDistance (6 fixed columns), each measure type has a different, not-fully-predictable
column set - this script stores every real column returned as a generic metrics dict per player
per type rather than hand-picking fields, so nothing gets silently dropped.

Writes nba/data/nba_tracking_detail_current.json + _meta.json.
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

MEASURE_TYPES = ["Passing", "Rebounding", "Drives", "CatchShoot", "PullUpShot",
                 "ElbowTouch", "PostTouch", "PaintTouch"]

OUTPUT_PATH = Path("nba/data/nba_tracking_detail_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_tracking_detail_current_meta.json")


def build_url(measure_type):
    return ("https://stats.nba.com/stats/leaguedashptstats?LeagueID=00&Season=2025-26"
            f"&SeasonType=Regular+Season&PerMode=PerGame&PlayerOrTeam=Player"
            f"&PtMeasureType={measure_type}&LastNGames=0&Month=0&OpponentTeamID=0")


def fetch_one(measure_type, proxies):
    url = build_url(measure_type)
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = (body.get("resultSets") or [{}])[0]
            headers = rs.get("headers", [])
            rows = rs.get("rowSet") or []
            idx = {h: i for i, h in enumerate(headers)}
            players = []
            for row in rows:
                pid = row[idx["PLAYER_ID"]] if "PLAYER_ID" in idx else None
                if not pid:
                    continue
                metrics = {h: row[i] for h, i in idx.items() if h not in ("PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION")}
                players.append({"player_id": int(pid), "metrics": metrics})
            return players, None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 3:
                time.sleep(5)
    return None, last_error


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    all_records = []
    per_type_meta = {}
    for measure_type in MEASURE_TYPES:
        players, error = fetch_one(measure_type, proxies)
        if players is not None:
            for p in players:
                all_records.append({"player_id": p["player_id"], "measure_type": measure_type, "metrics": p["metrics"]})
            per_type_meta[measure_type] = {"count": len(players), "error": None}
        else:
            per_type_meta[measure_type] = {"count": 0, "error": error}
        time.sleep(0.5)

    OUTPUT_PATH.write_text(json.dumps({"records": all_records}, indent=2), encoding="utf-8")
    failed_types = [k for k, v in per_type_meta.items() if v["error"]]
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "per_type": per_type_meta,
        "total_record_count": len(all_records),
        "error": f"failed_types: {failed_types}" if failed_types else None,
    }, indent=2), encoding="utf-8")

    if failed_types:
        print(f"NBA tracking detail scrape PARTIAL: failed types {failed_types}", file=sys.stderr)
        sys.exit(1)
    print(f"NBA tracking detail scrape OK: {len(all_records)} records across {len(MEASURE_TYPES)} types")


if __name__ == "__main__":
    main()
