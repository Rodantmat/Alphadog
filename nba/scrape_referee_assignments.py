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
    from zoneinfo import ZoneInfo   # real DST rule (round 2 P2B#16, 2026-10-08: the month test was wrong around the Mar/Nov switches)
    return datetime.now(ZoneInfo("America/Los_Angeles")).date()


def fetch_assignments(d, proxies):
    # VERIFIED 2026-10-07 (full-system certification, pass B) against the site's own JS (nba-official.min.js): the form posts
    # `date` as the <input type=date> value, i.e. ISO YYYY-MM-DD. The MM/DD/YYYY form this scraper used until today returns
    # HTTP 200 with EMPTY rows for every date - the capture would have stayed silent all season and P2B would have polled
    # until its deadline every game day. ISO first; the old form and the rendered page remain as fallbacks.
    urls = [
        f"https://official.nba.com/wp-json/api/v1/get-game-officials?date={d:%Y-%m-%d}",
        f"https://official.nba.com/wp-json/api/v1/get-game-officials?date={d:%m/%d/%Y}",
        f"https://official.nba.com/referee-assignments/?date={d:%Y-%m-%d}",
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
    """[(matchup, slot, official_name, number, game_id, official_code)].
    REAL SHAPE (verified 2026-10-07 on the live 2026-10-06 preseason payload and the site's own renderer):
      {"nba": {"Table": {"rows": [{"game_id": "0012600010", "game_date": "10/06/2026", "home_team": "Golden State",
        "home_team_abbr": "GSW", "away_team": "L.A. Lakers", "away_team_abbr": "LAL", "official1": "James Capers",
        "official1_code": 1148, "official1_JNum": "19", ... "official4": null (the alternate) }, ...]}}, "gl": ..., "wnba": ...}
    The earlier parser looked for nba.games / nba.officials and would have returned [] on every real payload."""
    out = []
    if not isinstance(doc, dict):
        return out
    nba = doc.get("nba")
    rows = []
    if isinstance(nba, dict):
        t = nba.get("Table")
        rows = (t.get("rows") if isinstance(t, dict) else None) or nba.get("games") or nba.get("officials") or []
    elif isinstance(nba, list):
        rows = nba
    for g in rows if isinstance(rows, list) else []:
        if not isinstance(g, dict):
            continue
        away = g.get("away_team_abbr") or g.get("away_team") or ""
        home = g.get("home_team_abbr") or g.get("home_team") or ""
        matchup = g.get("game") or g.get("matchup") or f"{away} @ {home}"
        for i in (1, 2, 3, 4):      # 4 = the alternate
            nm = g.get(f"official{i}") or g.get(f"referee{i}") or g.get(f"official_{i}")
            if nm:
                out.append((str(matchup), i, str(nm), g.get(f"official{i}_JNum") or g.get(f"official{i}_num"),
                            str(g.get("game_id")) if g.get("game_id") else None, g.get(f"official{i}_code")))
    if not out and "_html" in doc:
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", doc["_html"], re.S):
            cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).strip()
                     for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
            if len(cells) >= 4 and ("@" in cells[0] or " vs" in cells[0].lower()):
                for i, nm in enumerate(cells[1:4], start=1):
                    if nm and nm.lower() not in ("tbd", "-", ""):
                        out.append((cells[0], i, re.sub(r"\s*\(#\d+\)$", "", nm), None, None, None))
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
        # DEADLOCK (§T23.5, fixed 2026-09-23). This is the dangerous shape: the index DDL sits in the
        # SAME transaction as the INSERT below, so `IF NOT EXISTS` holds a full table lock for the whole
        # write. Two parallel runs deadlock. Checking first means no lock after the first run.
        cur.execute("ALTER TABLE nba_ref.referee_assignments ADD COLUMN IF NOT EXISTS game_id text")
        cur.execute("ALTER TABLE nba_ref.referee_assignments ADD COLUMN IF NOT EXISTS official_code bigint")
        if cur.execute("SELECT to_regclass('nba_ref.referee_assignments_uidx')").fetchone()[0] is None:
            cur.execute("""CREATE UNIQUE INDEX referee_assignments_uidx
                ON nba_ref.referee_assignments (game_date, matchup, slot)""")
        if rows:
            cur.executemany("""INSERT INTO nba_ref.referee_assignments
                (game_date, matchup, slot, official_name, official_number, source, game_id, official_code)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (game_date, matchup, slot) DO UPDATE
                  SET official_name=EXCLUDED.official_name, official_number=EXCLUDED.official_number,
                      game_id=EXCLUDED.game_id, official_code=EXCLUDED.official_code, captured_at=now()""",
                [(d, m, s, n, str(num) if num else None, src, gid, code) for m, s, n, num, gid, code in rows])
            # CREW HISTORY (retention audit 2026-10-08): the upsert keeps the LATEST crew only, so a crew change between
            # the morning poll and tip (a referee swap, a late scratch) overwrote the earlier capture. Every capture is
            # also appended, unchanged, to a log keyed by capture time; the live table stays the one consumers read.
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_ref.referee_assignments_log (
                game_date date, matchup text, slot int, official_name text, official_number text, source text,
                game_id text, official_code bigint, captured_at timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (game_date, matchup, slot, captured_at))""")
            cur.executemany("""INSERT INTO nba_ref.referee_assignments_log
                (game_date, matchup, slot, official_name, official_number, source, game_id, official_code)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                [(d, m, s, n, str(num) if num else None, src, gid, code) for m, s, n, num, gid, code in rows])
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
