#!/usr/bin/env python3
"""One-off patch (2026-09-03): retry the 3 specific games that were silently dropped by a real
bug in scrape_nba_game_officials.py's error handling (an empty-but-non-None rows list was
treated as success). Merges results into the existing committed JSON rather than re-running the
full ~1230-game job again."""
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

MISSING_GAME_IDS = ["0022500259", "0022500260", "0022500261"]
OUTPUT_PATH = Path("nba/data/nba_game_officials_2025_26.json")
OUTPUT_META_PATH = Path("nba/data/nba_game_officials_2025_26_meta.json")


def fetch_game(game_id, proxies, debug=None):
    url = f"https://stats.nba.com/stats/boxscoresummaryv3?GameID={game_id}&LeagueID=00"
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            summary = body.get("boxScoreSummary") or {}
            officials = summary.get("officials") or []
            if debug is not None:
                debug[game_id] = {
                    "raw_officials_field": officials,
                    "summary_keys": list(summary.keys()),
                    "game_status_text": summary.get("gameStatusText"),
                }
            rows = []
            for o in officials:
                pid = o.get("personId")
                if not pid:
                    continue
                rows.append({
                    "game_id": game_id,
                    "official_id": int(pid),
                    "full_name": o.get("name"),
                    "jersey_num": (o.get("jerseyNum") or "").strip() or None,
                    "assignment": o.get("assignment") or None,
                })
            if not rows:
                last_error = "zero_officials_parsed_v3"
                time.sleep(5)
                continue
            return rows, None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            time.sleep(5)
    return None, last_error


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    existing_rows = existing.get("rows", [])
    existing_meta = json.loads(OUTPUT_META_PATH.read_text(encoding="utf-8"))

    new_rows = []
    still_failing = []
    for gid in MISSING_GAME_IDS:
        rows, error = fetch_game(gid, proxies)
        if rows:
            new_rows.extend(rows)
            print(f"{gid}: recovered {len(rows)} officials")
        else:
            still_failing.append({"game_id": gid, "error": error})
            print(f"{gid}: STILL FAILING - {error}")
        time.sleep(1)

    merged_rows = existing_rows + new_rows
    OUTPUT_PATH.write_text(json.dumps({"rows": merged_rows}, indent=2), encoding="utf-8")

    existing_meta["row_count"] = len(merged_rows)
    existing_meta["patch_applied"] = {
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "games_retried": MISSING_GAME_IDS,
        "games_recovered": len(MISSING_GAME_IDS) - len(still_failing),
        "still_failing": still_failing,
        "bug_fixed": "main loop checked 'rows is not None' instead of truthiness, silently dropping games with zero parsed officials",
    }
    OUTPUT_META_PATH.write_text(json.dumps(existing_meta, indent=2), encoding="utf-8")
    print(f"Merged: {len(merged_rows)} total rows, {len(still_failing)} still failing")


if __name__ == "__main__":
    main()
