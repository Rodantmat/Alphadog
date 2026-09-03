#!/usr/bin/env python3
"""
ONE-TIME backfill (per the person's explicit go-ahead, 2026-09-03): per-game referee/official
assignments for the 2025-26 season - the real gap identified in the third double-check pass.
nba_ref.officials is only a career roster (who officials are, career games count); no table
anywhere records which officials worked which specific game, so referee tendency can't be
computed as a real enrichment factor without this.

Confirmed via nba_api's own release notes that boxscoresummaryv2 is documented as unreliable for
games after 4/10/2025 (same failure class as boxscoretraditionalv2 found earlier for starter
status) - went straight to boxscoresummaryv3 this time and verified it via a 5-game diagnostic
(old and new games alike, all real officials data) before committing to this full ~1230-call run.

v3's real, confirmed schema: {"boxScoreSummary": {"officials": [{"personId":..., "name":...,
"firstName":..., "familyName":..., "jerseyNum":..., "assignment":...}, ...], ...}}.

Real game IDs are read from the already-committed nba_player_game_log_2025_26.json (distinct
GAME_ID values) - reuses existing data, no duplicate schedule mining.

Writes nba/data/nba_game_officials_2025_26.json + _meta.json.
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

INPUT_PATH = Path("nba/data/nba_player_game_log_2025_26.json")
OUTPUT_PATH = Path("nba/data/nba_game_officials_2025_26.json")
OUTPUT_META_PATH = Path("nba/data/nba_game_officials_2025_26_meta.json")


def fetch_game(game_id, proxies):
    url = f"https://stats.nba.com/stats/boxscoresummaryv3?GameID={game_id}&LeagueID=00"
    last_error = None
    for attempt in range(1, 3):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            summary = body.get("boxScoreSummary") or {}
            officials = summary.get("officials") or []
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
                return [], "zero_officials_parsed_v3"
            return rows, None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 2:
                time.sleep(3)
    return None, last_error


def main():
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    Path("nba/data").mkdir(parents=True, exist_ok=True)

    if not INPUT_PATH.exists():
        OUTPUT_META_PATH.write_text(json.dumps({
            "fetched_at": fetched_at, "error": f"missing_input: {INPUT_PATH} not found"
        }, indent=2), encoding="utf-8")
        print("Game officials backfill FAILED: missing input game log file", file=sys.stderr)
        sys.exit(1)

    records = json.loads(INPUT_PATH.read_text(encoding="utf-8")).get("records", [])
    game_ids = sorted(set(r["GAME_ID"] for r in records if r.get("GAME_ID")))

    all_rows = []
    errors = []
    for i, game_id in enumerate(game_ids):
        rows, error = fetch_game(game_id, proxies)
        if rows is not None:
            all_rows.extend(rows)
        else:
            errors.append({"game_id": game_id, "error": error})
        if (i + 1) % 100 == 0:
            print(f"Progress: {i + 1}/{len(game_ids)} games processed, {len(errors)} errors so far, {len(all_rows)} rows so far")
        time.sleep(0.3)

    OUTPUT_PATH.write_text(json.dumps({"rows": all_rows}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "season": "2025-26",
        "method": "boxscoresummaryv3",
        "games_input": len(game_ids),
        "games_succeeded": len(game_ids) - len(errors),
        "row_count": len(all_rows),
        "per_game_errors": errors,
    }, indent=2), encoding="utf-8")

    print(f"Game officials backfill: {len(all_rows)} rows across {len(game_ids) - len(errors)}/{len(game_ids)} games, {len(errors)} errors")

    if len(errors) > len(game_ids) * 0.05:
        print("Game officials backfill FAILED: too many per-game errors", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
