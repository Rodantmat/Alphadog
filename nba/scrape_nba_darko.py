#!/usr/bin/env python3
"""
DARKO Daily Plus-Minus (DPM) - a free, publicly accessible third-party player-impact metric
(darko.app, Kostya Medvedovsky). Independently confirmed 2026-09-01: rated by NBA analytics
experts as the best PREDICTIVE catch-all metric (beats even paid EPM/LEBRON on RMSE), server-side
rendered (no JS wall), and crucially uses the exact same NBA person IDs already in our system
(e.g. /player/203999 = Jokic's real stats.nba.com PERSON_ID) - a clean join, no name-matching.

Unlike stats.nba.com, this site is not confirmed Cloudflare-blocked from anywhere - but this
scraper still runs on a GitHub Actions runner for consistency with the rest of the pipeline and
because its exact anti-bot posture (if any) is unknown until tested for real.

Real uncertainty, flagged rather than guessed around: darko.app's leaderboard is paginated
("1-50 of ~530 players") and the real pagination URL parameter has not been confirmed from
outside this script - it is discovered empirically here (try common patterns, verify the returned
rows actually differ from page 1, log exactly what worked or didn't). Also tries to find an
embedded __NEXT_DATA__/RSC JSON payload first, since that would be far more reliable than
regex/HTML-table scraping if present.

Writes nba/data/nba_darko_current.json + _meta.json.
"""
import json
import re
import sys
import time
from pathlib import Path

from curl_cffi import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
}

BASE_URL = "https://www.darko.app/"
OUTPUT_PATH = Path("nba/data/nba_darko_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_darko_current_meta.json")
OUTPUT_DEBUG_PATH = Path("nba/data/nba_darko_debug_html_snippet.txt")

PLAYER_ROW_RE = re.compile(
    r'/player/(\d+)"[^>]*>\s*(?:<[^>]+>\s*)*([A-Za-z\.\'\-\s]+?)\s*(?:<[^>]+>)*\s*</a>',
    re.S,
)
# Looks for a DPM-like decimal value (e.g. +6.8, -1.2) appearing near a player link in the raw
# row HTML - table cell structure will be confirmed/adjusted once real HTML is seen.
DPM_NEAR_RE = re.compile(r'([+-]\d+\.\d)')


def try_next_data(html):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:  # noqa: BLE001
        return None


def extract_players_from_html(html):
    """Best-effort real-HTML parse: find every /player/{id} link and the nearest DPM-looking
    decimal value in the same row. This is intentionally permissive on the first real run -
    if it produces obviously wrong results (e.g. zero rows, or fewer than expected), that's
    surfaced honestly in the meta file rather than silently accepted."""
    players = {}
    # Split on table row boundaries if present, else scan the whole doc for link+value pairs.
    for row in re.split(r'</tr>|\n(?=\|\s*\d+\s*\|)', html):
        id_match = re.search(r'/player/(\d+)', row)
        if not id_match:
            continue
        pid = int(id_match.group(1))
        values = DPM_NEAR_RE.findall(row)
        if not values:
            continue
        # First numeric decimal in the row is the DPM column per the observed table order
        # (# | Player | Team | DPM | Off | Def | ...).
        try:
            dpm = float(values[0])
        except ValueError:
            continue
        players[pid] = {"player_id": pid, "dpm": dpm, "dpm_off": float(values[1]) if len(values) > 1 else None,
                         "dpm_def": float(values[2]) if len(values) > 2 else None}
    return list(players.values())


def fetch_page(url, proxies):
    resp = requests.get(url, headers=HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
    resp.raise_for_status()
    return resp.text


def main():
    import os
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    error = None
    method_used = None
    all_players = {}
    try:
        html1 = fetch_page(BASE_URL, proxies)
        next_data = try_next_data(html1)
        if next_data:
            method_used = "next_data_json"
            OUTPUT_DEBUG_PATH.write_text(json.dumps(next_data)[:20000], encoding="utf-8")
            # Real shape unknown until inspected - record raw for a human/future-session to map,
            # don't guess a field path that could silently return zero rows.
            error = "next_data_found_but_shape_not_yet_mapped - see nba_darko_debug_html_snippet.txt (first 20k chars of the JSON) and update this script's parsing"
        else:
            method_used = "html_regex_scrape"
            page1_players = extract_players_from_html(html1)
            for p in page1_players:
                all_players[p["player_id"]] = p

            total_match = re.search(r'1[-–](\d+)\s+of\s+(\d+)', html1)
            total_expected = int(total_match.group(2)) if total_match else None

            # This is SvelteKit (confirmed 2026-09-02, svelte-* CSS classes / data-sveltekit-*
            # attrs, not Next.js). SvelteKit's client-side-nav data format is a sibling
            # __data.json endpoint per route, and/or a `<script type="application/json"
            # data-sveltekit-fetched ...>` block embedding each load()'s fetch results directly
            // in the page. Try both real SvelteKit patterns before falling back to guessed query
            # params, and always dump the FULL html (not truncated) plus every embedded
            # application/json script block on any failure, so the next attempt has full ground
            # truth instead of another guess.
            sveltekit_fetched_blocks = re.findall(
                r'<script type="application/json" data-sveltekit-fetched[^>]*>(.*?)</script>', html1, re.S
            )
            if sveltekit_fetched_blocks:
                method_used = "sveltekit_fetched_json"
                for block in sveltekit_fetched_blocks:
                    try:
                        parsed = json.loads(block)
                        body = parsed.get("body")
                        if isinstance(body, str):
                            body = json.loads(body)
                        # Shape genuinely unknown until seen for real - dump and stop rather than
                        # guess a field path that silently returns nothing.
                        OUTPUT_DEBUG_PATH.write_text(json.dumps(body)[:20000], encoding="utf-8")
                        error = "sveltekit_fetched_block_found_but_shape_not_yet_mapped - see nba_darko_debug_html_snippet.txt and update this script's parsing"
                        break
                    except Exception:  # noqa: BLE001
                        continue

            if not sveltekit_fetched_blocks:
                # Empirically try a handful of common pagination parameter names/values until one
                # actually returns NEW player IDs not already collected.
                if total_expected and len(all_players) < total_expected:
                    candidate_urls = [
                        f"{BASE_URL}?page=2", f"{BASE_URL}?p=2", f"{BASE_URL}?offset=50",
                        f"{BASE_URL}?pageSize=1000", f"{BASE_URL}?limit=1000", f"{BASE_URL}?per_page=1000",
                        f"{BASE_URL}__data.json",
                    ]
                    for url in candidate_urls:
                        try:
                            html_n = fetch_page(url, proxies)
                            new_players = extract_players_from_html(html_n)
                            new_ids = [p["player_id"] for p in new_players if p["player_id"] not in all_players]
                            if new_ids:
                                for p in new_players:
                                    all_players[p["player_id"]] = p
                                if len(all_players) >= total_expected:
                                    break
                        except Exception:  # noqa: BLE001
                            continue

                if total_expected and len(all_players) < total_expected * 0.9:
                    error = f"pagination_incomplete: got {len(all_players)} of expected ~{total_expected} - real pagination URL scheme not found by the candidates tried, needs manual inspection"
                    # Full, untruncated HTML this time (not just first 20k) so the next attempt
                    # has complete ground truth instead of a partial guess.
                    OUTPUT_DEBUG_PATH.write_text(html1, encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        error = str(exc)

    players = list(all_players.values())
    OUTPUT_PATH.write_text(json.dumps({"players": players}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "source_url": BASE_URL,
        "method_used": method_used,
        "player_count": len(players),
        "error": error,
    }, indent=2), encoding="utf-8")

    if error:
        print(f"DARKO scrape FAILED/WARN: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"DARKO scrape OK: {len(players)} players via {method_used}")


if __name__ == "__main__":
    main()
