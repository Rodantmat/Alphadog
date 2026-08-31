#!/usr/bin/env python3
"""
Runs on a GitHub Actions runner (NOT a Cloudflare Worker) specifically because stats.nba.com's
own Cloudflare-fronted WAF blocks Cloudflare Workers egress IPs (confirmed directly, 2026-08-31 -
every stats.nba.com/cdn.nba.com/core-api.nba.com/data.nba.net endpoint returned a 403/520/526 from
a Cloudflare Worker origin, headers notwithstanding). A GitHub Actions runner is a different,
non-Cloudflare network origin - the same reason MLB's own PrizePicks board scraper (main.py, via
.github/workflows/scrape.yml) runs here instead of inside a Worker.

Writes nba/data/nba_teams_current.json (committed to the repo by the workflow), which
alphadog-v2-nba-static-teams.js then reads via the GitHub Contents API - same read pattern
alphadog-v2-prizepicks-github-board.js already uses for prizepicks_mlb_current.json.
"""
import json
import os
import sys
import time
from pathlib import Path

# Plain `requests` has a recognizable TLS/JA3 fingerprint that bot-management systems flag and
# silently tarpit (connection accepts, response never comes - exactly what happened here 3x in a
# row, with and without a proxy, ruling out IP-based blocking). curl_cffi impersonates a real
# Chrome TLS handshake, which is why MLB's own PrizePicks scraper (main.py, via scrape.yml)
# installs and uses it instead of plain requests - same real fix, applied here for the same
# reason (confirmed via direct testing, not assumed - see NBA_PROJECT_LOG.md 2026-08-31).
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

URL = "https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=2025-26&SeasonType=Regular%20Season"
OUTPUT_PATH = Path("nba/data/nba_teams_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_teams_current_meta.json")


def fetch_teams():
    # PROXY_URL is the same repo secret MLB's PrizePicks scraper already uses (see scrape.yml) -
    # both direct nba.com fetch attempts from a plain GitHub Actions runner IP got a consistent
    # read-timeout on every attempt (2026-08-31, 3/3 tries at both 30s and 60s) - a tarpit-style
    # soft block, not a transient blip - so route through the same working proxy instead of
    # tuning timeouts further.
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    last_error = None
    for attempt in range(1, 4):
        try:
            resp = requests.get(URL, headers=STATS_HEADERS, timeout=30, proxies=proxies)
            resp.raise_for_status()
            body = resp.json()
            break
        except Exception as exc:  # noqa: BLE001 - retry a few times before giving up for real
            last_error = exc
            print(f"Attempt {attempt}/3 failed (proxy={'yes' if proxies else 'no'}): {exc}", file=sys.stderr)
            if attempt < 3:
                time.sleep(5)
    else:
        raise last_error
    result_sets = body.get("resultSets") or []
    if not result_sets:
        raise RuntimeError("nba_stats_api_unexpected_shape: no resultSets")
    rs = result_sets[0]
    headers = rs["headers"]
    idx = {h: i for i, h in enumerate(headers)}

    def col(row, name, default=None):
        i = idx.get(name)
        return row[i] if i is not None else default

    teams = []
    seen_ids = set()
    for row in rs["rowSet"]:
        team_id = col(row, "TeamID")
        if team_id is None or team_id in seen_ids:
            continue
        seen_ids.add(team_id)
        teams.append({
            "id": int(team_id),
            "abbreviation": str(col(row, "TeamAbbreviation") or col(row, "TeamCode") or "").upper(),
            "city": str(col(row, "TeamCity") or ""),
            "nickname": str(col(row, "TeamName") or ""),
            "conference": str(col(row, "Conference") or ""),
            "division": str(col(row, "Division") or ""),
        })
    return teams, resp.status_code


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        teams, http_status = fetch_teams()
        error = None
    except Exception as exc:  # noqa: BLE001 - real, top-level scrape failure, must not crash the workflow
        teams, http_status, error = [], None, str(exc)

    OUTPUT_PATH.write_text(json.dumps({"teams": teams}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "source_url": URL,
        "http_status": http_status,
        "team_count": len(teams),
        "error": error,
    }, indent=2), encoding="utf-8")

    if error:
        print(f"NBA teams scrape FAILED: {error}", file=sys.stderr)
        # Non-zero exit so the workflow run is visibly marked failed, but the meta file (with the
        # real error recorded) still gets committed - matches the honest-failure-recording
        # discipline established for this whole project rather than silently leaving stale data.
        sys.exit(1)

    print(f"NBA teams scrape OK: {len(teams)} teams, http_status={http_status}")


if __name__ == "__main__":
    main()
