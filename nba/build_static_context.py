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
    """In-season head-coach replacements.

    Two earlier attempts failed because I guessed at the structure. The real table is:
        caption "Coaching changes"
        headers: Team | <prev> season | <this> season      <- NO Incoming/Outgoing columns
        a colspan sub-header row splits "Off-season" from "In-season"
    So we parse the raw table and use the sub-header rows to know which section we are in; the
    in-season rows are the ones that matter (a mid-season replacement changes rotations).
    """
    out = {}
    for season, slug in SEASONS.items():
        html = get(f"https://en.wikipedia.org/wiki/{slug}", proxies)
        if not html:
            print(f"coach changes {season}: page fetch failed")
            continue
        m = re.search(r'<caption[^>]*>Coaching changes</caption>(.*?)</table>', html, re.S)
        if not m:
            print(f"coach changes {season}: no Coaching changes table found")
            continue
        section, rows = None, []
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', m.group(1), re.S):
            sub = re.search(r'<th[^>]*colspan="\d+"[^>]*>(.*?)</th>', tr, re.S)
            if sub:
                section = re.sub(r'<[^>]+>', '', sub.group(1)).strip()
                continue
            cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, re.S)
            if len(cells) < 3:
                continue
            txt = [re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', c)).strip() for c in cells]
            if txt[0].lower() == "team":
                continue
            rows.append({"team": txt[0], "outgoing": txt[1], "incoming": txt[2],
                         "section": section or "unknown",
                         "in_season": bool(section and "in-season" in section.lower())})
        out[season] = rows
        n_in = sum(1 for r in rows if r["in_season"])
        print(f"coach changes {season}: {len(rows)} entries ({n_in} in-season)")
    return out


def coach_change_dates(changes, proxies):
    """Pin the exact date each in-season change took effect.

    The season-page table gives names but no dates. The TEAM season pages do give them, in the infobox
    coach field: "Adrian Griffin (fired Jan. 23, 30-13 record) Joe Prunty (interim, 2-1) Doc Rivers (17-19)".
    Two independent signals there:
      - an explicit date ("fired Jan. 23")
      - a W-L record, which pins the change to a specific game in the team's log
    We take the date when present and keep the record so the as-of logic can verify it against the game
    log; a mismatch is worth knowing about rather than silently trusting one scrape.
    """
    slug_of = {"2023-24": "2023%E2%80%9324", "2024-25": "2024%E2%80%9325"}
    out = {}
    for season, rows in (changes or {}).items():
        dated = []
        for r in rows:
            if not r.get("in_season"):
                continue
            team = r["team"].replace(" ", "_")
            url = f"https://en.wikipedia.org/wiki/{slug_of[season]}_{team}_season"
            html = get(url, proxies)
            entry = dict(r)
            entry["source_page"] = url
            if html:
                # infobox coach line, e.g. "Adrian Griffin (fired Jan. 23, 30-13 record)"
                m = re.search(r'Head coach.{0,1200}?</td>', html, re.S)
                blob = re.sub(r'<[^>]+>', ' ', m.group(0)) if m else ""
                blob = re.sub(r'\s+', ' ', blob)
                entry["infobox"] = blob[:300]
                d = re.search(r'fired\s+([A-Z][a-z]+\.?\s+\d{1,2})', blob)
                entry["fired_date_text"] = d.group(1) if d else None
                recs = re.findall(r'(\d{1,3})[-\u2013](\d{1,3})\s*(?:record)?', blob)
                entry["records"] = [f"{a}-{b}" for a, b in recs][:4]
            dated.append(entry)
            time.sleep(0.5)
        out[season] = dated
        got = sum(1 for e in dated if e.get("fired_date_text"))
        print(f"coach change dates {season}: {got}/{len(dated)} with an explicit date")
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
