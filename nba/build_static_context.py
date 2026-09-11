#!/usr/bin/env python3
"""
Static context files still missing from the enrichment set:

  1. Coach changes for 2023-24 and 2024-25 (2025-26 already has dated entries in
     nba/data/nba_coach_changes.json). Source: the NBA season pages on Wikipedia, which list
     in-season head-coach replacements with dates.
  2. All-Star and All-NBA selections per season - used as a role/status prior.
  3. National TV flag per game (ESPN / TNT / ABC / NBA TV) - a documented minutes and pace factor.

Everything is written as JSON under nba/data/ with a `sources` note, so a later run can tell what was
scraped versus hand-entered. Failures are reported and the file is left untouched rather than
overwritten with partial data.

Env: PROXY_URL (optional)
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from curl_cffi import requests

OUT = Path("nba/data")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36"}
SEASONS = {"2023-24": "2023%E2%80%9324_NBA_season", "2024-25": "2024%E2%80%9325_NBA_season"}


def get(url, proxies):
    for use_proxy in (False, True):
        try:
            r = requests.get(url, headers=UA, timeout=60, impersonate="chrome124", proxies=proxies if use_proxy else None)
            if r.status_code == 200:
                return r.text
        except Exception as exc:  # noqa: BLE001
            print(f"  {url}: {exc}")
        if not proxies:
            break
    return None


def coach_changes(proxies):
    """In-season head-coach replacements with dates, from the season page 'Coaching changes' table."""
    out = {}
    for season, slug in SEASONS.items():
        html = get(f"https://en.wikipedia.org/wiki/{slug}", proxies)
        if not html:
            print(f"coach changes {season}: page fetch failed")
            continue
        rows = []
        # the in-season section lists: Team | Outgoing | Reason | Date | Incoming
        sec = re.split(r"[Ii]n-season", html)
        if len(sec) > 1:
            block = sec[1][:20000]
            for m in re.finditer(r'title="([^"]{3,40})">\1</a>\s*</th>.{0,2000}?(\w+ \d{1,2}, \d{4})', block, re.S):
                rows.append({"team": m.group(1), "date": m.group(2)})
        out[season] = rows
        print(f"coach changes {season}: {len(rows)} in-season entries parsed")
    return out


def main():
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    OUT.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    changes = coach_changes(proxies)
    if any(changes.values()):
        p = OUT / "nba_coach_changes_backfill.json"
        p.write_text(json.dumps({"meta": {"built_at": now, "source": "wikipedia season pages",
                                          "note": "in-season head coach changes for 2023-24 / 2024-25; merge into nba_coach_changes.json after review"},
                                 "seasons": changes}, indent=1))
        print("wrote", p)
    else:
        print("coach changes: nothing parsed, file left untouched", file=sys.stderr)

    # All-Star / All-NBA and national TV need per-season sources that vary in structure; record what is
    # missing explicitly rather than writing an empty file that looks complete.
    todo = OUT / "nba_static_context_todo.json"
    todo.write_text(json.dumps({"built_at": now, "still_missing": [
        "all_star_selections per season (role/status prior)",
        "all_nba_selections per season",
        "national_tv flag per game (ESPN/TNT/ABC/NBA TV) - minutes and pace factor",
        "referee assignments daily scraper (game-day officials before tip)"]}, indent=1))
    print("wrote", todo)


if __name__ == "__main__":
    main()
