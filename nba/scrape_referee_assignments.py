#!/usr/bin/env python3
"""
D1 REFEREE ASSIGNMENTS — daily capture.

WHY A CAPTURE AND NOT A BACKFILL: assignments are published the MORNING of the game (~6-7 AM PT /
9-10 AM ET) and are NOT archived afterwards. Historically we have the crew that WORKED each game from
the box scores, and per COMPASS fact 58 that is a faithful reconstruction of what was knowable at the
2:30 PM window - officials post before it, so using them for a past day is simulation, not leakage.
Going forward the ASSIGNMENT (as published, before tip) only exists if we store it, so the archive
starts the day this runs.

Stage: PHASE 1 / baseline (fact 68) - a morning fact, not a window fact.
Source: official.nba.com (public, no auth). Landed in nba_ref.referee_assignments with the capture
timestamp so a later audit can answer "what was known at the cutoff".

Env: DATABASE_URL, REF_DATE (YYYY-MM-DD, default today Pacific), PROXY_URL
"""
import json
import os
import re
from datetime import datetime, timedelta, timezone

import psycopg
from curl_cffi import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*", "Referer": "https://official.nba.com/"}


def pacific_today():
    now = datetime.now(timezone.utc)
    return (now - timedelta(hours=7 if 3 < now.month < 11 else 8)).date()


def fetch_assignments(d, proxies):
    urls = [
        f"https://official.nba.com/wp-json/api/v1/get-game-officials?date={d:%m/%d/%Y}",
        f"https://official.nba.com/referee-assignments/?date={d:%m/%d/%Y}",
    ]
    for u in urls:
        for use_proxy in (False, True):
            try:
                r = requests.get(u, headers=UA, timeout=45, impersonate="chrome124",
                                 proxies=proxies if use_proxy else None)
                if r.status_code != 200:
                    continue
                try:
                    return u, r.json()
                except Exception:  # noqa: BLE001
                    return u, {"_html": r.text[:400000]}
            except Exception as exc:  # noqa: BLE001
                print(f"  {u[:62]}: {str(exc)[:70]}", flush=True)
            if not proxies:
                break
    return None, None


def parse(doc):
    """[(matchup, slot, official_name, number)] - shapes vary, handle JSON and the rendered table."""
    out = []
    if not isinstance(doc, dict):
        return out
    table = doc.get("nba") or doc.get("data") or doc.get("results") or []
    if isinstance(table, dict):
        table = table.get("games") or table.get("officials") or []
    for g in table if isinstance(table, list) else []:
        if not isinstance(g, dict):
            continue
        matchup = g.get("game") or g.get("matchup") or f"{g.get('away_team','')}@{g.get('home_team','')}"
        for i in (1, 2, 3):
            nm = g.get(f"official{i}") or g.get(f"referee{i}") or g.get(f"official_{i}")
            if nm:
                out.append((str(matchup), i, str(nm), g.get(f"official{i}_num")))
    if not out and "_html" in doc:
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", doc["_html"], re.S):
            cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).strip()
                     for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
            if len(cells) >= 4 and ("@" in cells[0] or " vs" in cells[0].lower()):
                for i, nm in enumerate(cells[1:4], start=1):
                    if nm and nm.lower() not in ("tbd", "-", ""):
                        out.append((cells[0], i, nm, None))
    return out


def main():
    d = datetime.strptime(os.environ["REF_DATE"], "%Y-%m-%d").date() if os.environ.get("REF_DATE") else pacific_today()
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    src, doc = fetch_assignments(d, proxies)
    rows = parse(doc) if doc else []
    print(f"{d}: source {src} -> {len(rows)} official assignments", flush=True)

    conn = psycopg.connect(os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        cur.execute("""CREATE SCHEMA IF NOT EXISTS nba_ref;
            CREATE TABLE IF NOT EXISTS nba_ref.referee_assignments (
                game_date date, matchup text, slot int, official_name text, official_number text,
                source text, captured_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS referee_assignments_uidx
            ON nba_ref.referee_assignments (game_date, matchup, slot)""")
        if rows:
            cur.executemany("""INSERT INTO nba_ref.referee_assignments
                (game_date, matchup, slot, official_name, official_number, source)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (game_date, matchup, slot) DO UPDATE
                  SET official_name=EXCLUDED.official_name, captured_at=now()""",
                [(d, m, s, n, str(num) if num else None, src) for m, s, n, num in rows])
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT count(*), count(DISTINCT game_date) FROM nba_ref.referee_assignments")
        print(f"referee_assignments total: {cur.fetchone()}", flush=True)
    conn.close()
    if not rows:
        print("NOTE: no assignments parsed. Off-season: expected. In season: the page shape changed "
              "and the parser needs a look.", flush=True)


if __name__ == "__main__":
    main()
