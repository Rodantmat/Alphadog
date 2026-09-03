#!/usr/bin/env python3
"""Diagnostic: confirm boxscoresummaryv3's real JSON structure for Officials before committing to
a full ~1230-call scrape - same discipline as the starter-status v2->v3 lesson (v2 is documented
by nba_api as unreliable for games after 4/10/2025, so going straight to v3 this time)."""
import json
import os
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


def fetch(game_id, proxies):
    url = f"https://stats.nba.com/stats/boxscoresummaryv3?GameID={game_id}&LeagueID=00"
    resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
    return resp.status_code, resp.text


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    records = json.loads(Path("nba/data/nba_player_game_log_2025_26.json").read_text()).get("records", [])
    game_ids = sorted(set(r["GAME_ID"] for r in records if r.get("GAME_ID")))
    n = len(game_ids)
    sample_ids = [game_ids[0], game_ids[n // 4], game_ids[n // 2], game_ids[3 * n // 4], game_ids[-1]]

    results = {}
    for gid in sample_ids:
        entry = {}
        try:
            status, text = fetch(gid, proxies)
            entry["status"] = status
            try:
                body = json.loads(text)
                entry["top_level_keys"] = list(body.keys())
                summary = body.get("boxScoreSummary") or body
                entry["summary_keys"] = list(summary.keys()) if isinstance(summary, dict) else None
                officials = summary.get("officials") if isinstance(summary, dict) else None
                entry["officials_sample"] = officials[:3] if isinstance(officials, list) else officials
            except Exception as parse_exc:  # noqa: BLE001
                entry["parse_error"] = str(parse_exc)
                entry["raw_sample"] = text[:1500]
        except Exception as exc:  # noqa: BLE001
            entry["fetch_error"] = str(exc)
        time.sleep(0.5)
        results[gid] = entry

    Path("nba/data/nba_officials_diagnostic.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
