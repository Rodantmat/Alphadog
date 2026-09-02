#!/usr/bin/env python3
"""
DARKO Daily Plus-Minus (DPM) - a free, publicly accessible third-party player-impact metric
(darko.app, Kostya Medvedovsky). Independently confirmed 2026-09-01/02: rated by NBA analytics
experts as the best PREDICTIVE catch-all metric (beats even paid EPM/LEBRON on RMSE), and
crucially uses the exact same NBA person IDs already in our system (nba_id: 203999 = Jokic's
real stats.nba.com PERSON_ID) - a clean join, no name-matching.

Real, confirmed extraction method (2026-09-02, after two failed guesses at pagination): the site
is SvelteKit, and the ENTIRE leaderboard (all ~530 players, every stat column) is embedded
directly in the initial page load as part of the `kit.start(app, element, {...})` hydration call
- there is no pagination to fight at all; the visible "50 per page" table is a pure client-side
slice of data that's already fully present server-side. The embedded blob is JS object-literal
syntax (unquoted keys, bare leading-decimal numbers like `.534094`), not strict JSON - this
script extracts the `players:[...]` array and repairs it into valid JSON before parsing.

Writes nba/data/nba_darko_current.json + _meta.json.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

from curl_cffi import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,*/*;q=0.8",
}

BASE_URL = "https://www.darko.app/"
OUTPUT_PATH = Path("nba/data/nba_darko_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_darko_current_meta.json")
OUTPUT_DEBUG_PATH = Path("nba/data/nba_darko_debug_html_snippet.txt")


def extract_players(html):
    m = re.search(r'players:\[(.*?)\],seasons:', html, re.S)
    if not m:
        raise RuntimeError("players_array_not_found_in_page - real page structure may have changed")
    arr_text = "[" + m.group(1) + "]"
    # Quote bare JS object keys: {nba_id: -> {"nba_id":
    json_text = re.sub(r'(?<=[{,\[])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:', r'"\1":', arr_text)
    # Fix bare leading-decimal numbers JSON doesn't allow: :.534 -> :0.534, :-.844 -> :-0.844
    json_text = re.sub(r':(-?)\.(\d)', r':\g<1>0.\2', json_text)
    return json.loads(json_text)


def fetch(proxies):
    resp = requests.get(BASE_URL, headers=HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
    resp.raise_for_status()
    return resp.text


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    players = []
    error = None
    html = None
    try:
        html = fetch(proxies)
        raw_players = extract_players(html)
        for p in raw_players:
            pid = p.get("nba_id")
            if not pid:
                continue
            players.append({
                "player_id": int(pid),
                "team_id": int(p["tm_id"]) if p.get("tm_id") else None,
                "position": p.get("position"),
                "dpm": p.get("dpm"),
                "o_dpm": p.get("o_dpm"),
                "d_dpm": p.get("d_dpm"),
                "box_dpm": p.get("box_dpm"),
                "on_off_dpm": p.get("on_off_dpm"),
                "rank": p.get("_rank"),
            })
        if len(players) < 400:
            error = f"suspiciously_low_count: only {len(players)} players parsed, expected ~530"
            OUTPUT_DEBUG_PATH.write_text(html[:20000], encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        if html:
            OUTPUT_DEBUG_PATH.write_text(html[:20000], encoding="utf-8")

    OUTPUT_PATH.write_text(json.dumps({"players": players}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "source_url": BASE_URL,
        "method_used": "embedded_sveltekit_hydration_json",
        "player_count": len(players),
        "error": error,
    }, indent=2), encoding="utf-8")

    if error:
        print(f"DARKO scrape FAILED/WARN: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"DARKO scrape OK: {len(players)} players")


if __name__ == "__main__":
    main()
