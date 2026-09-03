#!/usr/bin/env python3
"""Quick diagnostic: test boxscoretraditionalv2 on a small sample of games spread across the
season (early/mid/late) to understand why only the last ~30 games of a 1230-game run returned
real data while the rest silently returned empty PlayerStats rowSets, before committing to
another full ~40-minute re-run."""
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


def fetch_raw(game_id, proxies):
    url = f"https://stats.nba.com/stats/boxscoretraditionalv2?EndPeriod=10&EndRange=28800&GameID={game_id}&RangeType=0&Season=2025-26&SeasonType=Regular+Season&StartPeriod=1&StartRange=0"
    resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
    return resp.status_code, resp.text


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    records = json.loads(Path("nba/data/nba_player_game_log_2025_26.json").read_text()).get("records", [])
    game_ids = sorted(set(r["GAME_ID"] for r in records if r.get("GAME_ID")))
    # Sample: first, 25%, 50%, 75%, last, and a couple known-good ones from the earlier run.
    n = len(game_ids)
    sample_indices = sorted(set([0, 1, n // 4, n // 2, 3 * n // 4, n - 31, n - 1]))
    sample_ids = [game_ids[i] for i in sample_indices]

    results = {}
    for gid in sample_ids:
        try:
            status, text = fetch_raw(gid, proxies)
            try:
                body = json.loads(text)
                rs_names = [rs.get("name") for rs in body.get("resultSets") or []]
                player_rs = next((rs for rs in body.get("resultSets") or [] if rs.get("name") == "PlayerStats"), None)
                row_count = len(player_rs.get("rowSet") or []) if player_rs else None
                results[gid] = {"status": status, "result_set_names": rs_names, "player_stats_row_count": row_count}
            except Exception as parse_exc:  # noqa: BLE001
                results[gid] = {"status": status, "parse_error": str(parse_exc), "raw_sample": text[:1000]}
        except Exception as exc:  # noqa: BLE001
            results[gid] = {"fetch_error": str(exc)}
        time.sleep(0.5)

    Path("nba/data/nba_starter_status_diagnostic.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
