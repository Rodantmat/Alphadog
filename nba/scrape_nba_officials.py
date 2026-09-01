#!/usr/bin/env python3
"""
Officials/referees are a real, current, roster-style static list after all (not something that
has to be derived from game-level box scores) - Wikipedia's "List of NBA referees" page
maintains a real, current "Staff officials" table (74 staff + 7 non-staff for 2025-26 per the
page itself), citing the NBA's own official numbers. This is the MLB-"umpire" analog the person
asked about (2026-08-31 log entry).

Uses the MediaWiki Action API (prop=wikitext) rather than scraping rendered HTML - the raw
wikitext table markup is far more reliable to parse than HTML table extraction (confirmed
messy/unreliable for the arenas research this session). No curl_cffi/TLS-impersonation needed -
Wikipedia's API is built for programmatic access and only requires a descriptive User-Agent.

Writes nba/data/nba_officials_current.json + nba/data/nba_officials_current_meta.json.

Known, honest limitation: this gives jersey number + name only - no numeric stats.nba.com
official ID exists in this source. A real official_id crosswalk to stats.nba.com's own IDs would
need to come from box-score "Officials" data in the delta/game-log layer later, which naturally
resolves by name. Until then, officials are keyed by a normalized-name-derived ID.
"""
import json
import re
import sys
import time
from pathlib import Path

import requests

API_URL = "https://en.wikipedia.org/w/api.php"
PAGE_TITLE = "List_of_NBA_referees"
HEADERS = {"User-Agent": "AlphaDog-NBA-StaticOfficials/0.1 (research/backfill use; contact: repo owner)"}

OUTPUT_PATH = Path("nba/data/nba_officials_current.json")
OUTPUT_META_PATH = Path("nba/data/nba_officials_current_meta.json")


def normalize_id(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def clean_cell(cell):
    cell = cell.strip()
    cell = re.sub(r"^!+\s*", "", cell)              # header markers
    cell = re.sub(r"'''(.*?)'''", r"\1", cell)       # bold
    cell = re.sub(r"''(.*?)''", r"\1", cell)         # italics
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cell)  # [[Target|Display]] or [[Name]]
    if m:
        cell = m.group(2) if m.group(2) else m.group(1)
    cell = re.sub(r"<[^>]+>", "", cell)              # stray HTML tags (e.g. <br>)
    cell = re.sub(r"\{\{[^}]*\}\}", "", cell)        # templates
    return cell.strip()


def parse_officials(wikitext):
    officials = []
    seen = set()
    # Split into wikitable blocks, then rows within each (rows separated by "|-").
    for table in re.findall(r"\{\|.*?\n\|\}", wikitext, flags=re.S):
        if "wikitable" not in table.lower():
            continue
        rows = table.split("|-")
        for row in rows:
            # Cells can be on their own lines starting with "|" or "!", or joined with "||".
            raw_cells = []
            for line in row.split("\n"):
                line = line.strip()
                if not line or line.startswith("{|") or line.startswith("|}"):
                    continue
                if line.startswith("|") or line.startswith("!"):
                    line = line[1:]
                    raw_cells.extend(line.split("||"))
            cells = [clean_cell(c) for c in raw_cells if clean_cell(c)]
            if len(cells) < 2:
                continue
            number_raw, name = cells[0], cells[1]
            if not re.fullmatch(r"\d{1,3}", number_raw):
                continue
            if not re.match(r"^[A-Z][A-Za-z.'\-]+( [A-Z][A-Za-z.'\-]+){1,3}$", name):
                continue
            key = normalize_id(name)
            if key in seen:
                continue
            seen.add(key)
            officials.append({"jersey_number": int(number_raw), "full_name": name})
    return officials


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        resp = requests.get(API_URL, params={
            "action": "parse", "page": PAGE_TITLE, "prop": "wikitext", "format": "json"
        }, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        wikitext = body["parse"]["wikitext"]["*"]
        officials = parse_officials(wikitext)
        error = None
        if len(officials) < 50:
            error = f"suspiciously_low_count: only parsed {len(officials)} officials, expected ~80 - wikitext table format may have changed"
    except Exception as exc:  # noqa: BLE001
        officials, error = [], str(exc)

    OUTPUT_PATH.write_text(json.dumps({"officials": officials}, indent=2), encoding="utf-8")
    OUTPUT_META_PATH.write_text(json.dumps({
        "fetched_at": fetched_at,
        "source_url": f"https://en.wikipedia.org/wiki/{PAGE_TITLE}",
        "official_count": len(officials),
        "error": error,
        "known_limitation": "jersey number + name only, no stats.nba.com official ID in this source",
    }, indent=2), encoding="utf-8")

    if error:
        print(f"NBA officials scrape FAILED/WARN: {error}", file=sys.stderr)
        sys.exit(1)

    print(f"NBA officials scrape OK: {len(officials)} officials")


if __name__ == "__main__":
    main()
