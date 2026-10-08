#!/usr/bin/env python3
"""
MLB LIVE MARKET CAPTURE (2026-10-08; owner: "be sure MLB keeps mining to the end of the season - the postseason").

Independent of the Odds API credit balance. At MLB's board times (09:00 / 13:00 / 17:00 PT) it stores, raw and lossless:
  1. OUR OWN live MLB boards - the files the existing scrapers already refresh every ~2 h and commit (prizepicks_mlb_current.json
     at the repo root from scrape.yml; boards/{underdog,sleeper,fliff,betr}_mlb_current.json). The MLB database archive of these
     stopped on 2026-09-27; this keeps a dated copy per board time. A file older than MLB_MAX_AGE_H (default 3 h) at capture
     time is recorded as status 'stale' (payload kept, flagged) so a dead scraper is visible, never silently re-labelled fresh.
  2. ParlayAPI live player props for baseball_mlb (all books + PrizePicks / Underdog / Sleeper / Betr / Pick6; 3 credits/call).
  -> market.mlb_live_market_captures (capture_date, label, source, captured_at, source_fetched_at, status, n_items, payload)
  3. mode=closing: ParlayAPI historical closing game lines (h2h / spreads / totals, every book; 10 credits/date) for a date
     range -> market.mlb_game_lines_closing (game_date, payload) - the match odds for the backfill and the daily keep-up.
Never touches MLB code or the MLB tables; only reads the board files and writes the two tables above.
Env: DATABASE_URL; MLB_MODE (capture | closing); MLB_LABEL (pt0900|pt1300|pt1700, default = nearest board time now);
     MLB_CLOSE_START / MLB_CLOSE_END (closing mode; default = yesterday PT); MLB_MAX_AGE_H.
"""
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg
import requests

PT = ZoneInfo("America/Los_Angeles")
PARLAY = "https://parlay-api.com/v1"
FILES = {"prizepicks": Path("prizepicks_mlb_current.json"), "underdog": Path("boards/underdog_mlb_current.json"),
         "sleeper": Path("boards/sleeper_mlb_current.json"), "fliff": Path("boards/fliff_mlb_current.json"),
         "betr": Path("boards/betr_mlb_current.json")}
DDL = [
    "CREATE SCHEMA IF NOT EXISTS market",
    """CREATE TABLE IF NOT EXISTS market.mlb_live_market_captures (
        capture_date date NOT NULL, label text NOT NULL, source text NOT NULL, captured_at timestamptz DEFAULT now(),
        source_fetched_at timestamptz, status text, n_items int, payload jsonb, PRIMARY KEY (capture_date, label, source))""",
    """CREATE TABLE IF NOT EXISTS market.mlb_game_lines_closing (
        game_date date PRIMARY KEY, n_rows int, credits_remaining int, payload jsonb, fetched_at timestamptz DEFAULT now())""",
]


def parlay_key(conn):
    return conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key'").fetchone()[0].strip()


def nearest_label(now_pt):
    h = now_pt.hour + now_pt.minute / 60
    return min(("pt0900", 9), ("pt1300", 13), ("pt1700", 17), key=lambda x: abs(x[1] - h))[0]


def count_items(doc):
    if isinstance(doc, list):
        return len(doc)
    if isinstance(doc, dict):
        for k in ("legs", "data", "props", "projections"):
            if isinstance(doc.get(k), list):
                return len(doc[k])
    return None


def file_fetched_at(path, doc):
    meta = Path(str(path).replace("_current.json", "_current_meta.json"))
    for src in (doc.get("meta") if isinstance(doc, dict) else None, json.loads(meta.read_text()) if meta.exists() else None):
        if isinstance(src, dict):
            for k in ("fetched_at", "finished_at", "generated_at", "started_at"):
                if src.get(k):
                    try:
                        return datetime.fromisoformat(str(src[k]).replace("Z", "+00:00"))
                    except ValueError:
                        pass
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)


def capture(conn):
    now_pt = datetime.now(PT)
    label = os.environ.get("MLB_LABEL") or nearest_label(now_pt)
    day = now_pt.date()
    max_age = float(os.environ.get("MLB_MAX_AGE_H", "3"))
    rows = []
    for app, path in FILES.items():
        if not path.exists():
            print(f"  {app}: no file", flush=True)
            continue
        doc = json.loads(path.read_text())
        fa = file_fetched_at(path, doc)
        age_h = (datetime.now(timezone.utc) - fa).total_seconds() / 3600
        status = "ok" if age_h <= max_age else "stale"
        rows.append((day, label, f"own_{app}", fa, status, count_items(doc), json.dumps(doc)))
        print(f"  own_{app}: {count_items(doc)} items, fetched {fa.isoformat()} ({age_h:.1f} h old) -> {status}", flush=True)
    try:
        # ParlayAPI answers 503 "props_temporarily_busy - retry in a couple of seconds" while its board rebuilds (seen 2026-10-08)
        for attempt in range(6):
            r = requests.get(f"{PARLAY}/sports/baseball_mlb/props", headers={"X-API-Key": parlay_key(conn), "accept": "application/json"}, timeout=120)
            if r.status_code not in (429, 500, 502, 503, 504):
                break
            import time
            time.sleep(5 + attempt * 10)
        doc = r.json() if r.status_code == 200 else {"http": r.status_code, "body": r.text[:500]}
        status = "ok" if r.status_code == 200 else "error"
        rows.append((day, label, "parlay_props", datetime.now(timezone.utc), status, count_items(doc), json.dumps(doc)))
        print(f"  parlay_props: http {r.status_code}, {count_items(doc)} items, credits remaining {r.headers.get('x-requests-remaining')}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"  parlay_props: FAILED {str(exc)[:160]}", flush=True)
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO market.mlb_live_market_captures (capture_date, label, source, source_fetched_at, status, n_items, payload)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT (capture_date, label, source) DO UPDATE SET captured_at=now(), source_fetched_at=EXCLUDED.source_fetched_at,
                           status=EXCLUDED.status, n_items=EXCLUDED.n_items, payload=EXCLUDED.payload""", rows)
    print(f"captured {len(rows)} sources for {day} {label}", flush=True)


def closing(conn):
    yday = datetime.now(PT).date() - timedelta(days=1)
    d0 = date.fromisoformat(os.environ.get("MLB_CLOSE_START") or yday.isoformat())
    d1 = date.fromisoformat(os.environ.get("MLB_CLOSE_END") or yday.isoformat())
    key = parlay_key(conn)
    s = requests.Session()
    d, n_dates, n_rows = d0, 0, 0
    while d <= d1:
        r = s.get(f"{PARLAY}/historical/sports/baseball_mlb/closing-odds", params={"markets": "spreads,totals,h2h", "date": d.isoformat()},
                  headers={"X-API-Key": key, "accept": "application/json"}, timeout=90)
        rows = r.json() if r.status_code == 200 else None
        if isinstance(rows, list) and rows:
            conn.execute("""INSERT INTO market.mlb_game_lines_closing (game_date, n_rows, credits_remaining, payload) VALUES (%s,%s,%s,%s)
                            ON CONFLICT (game_date) DO UPDATE SET n_rows=EXCLUDED.n_rows, credits_remaining=EXCLUDED.credits_remaining,
                            payload=EXCLUDED.payload, fetched_at=now()""",
                         (d, len(rows), int(r.headers.get("x-requests-remaining") or 0), json.dumps(rows)))
            n_dates += 1
            n_rows += len(rows)
        elif r.status_code != 200:
            print(f"  {d}: http {r.status_code} {r.text[:160]}", flush=True)
        d += timedelta(days=1)
    print(f"closing lines {d0}..{d1}: {n_dates} dates with rows, {n_rows} rows | parlay credits remaining {r.headers.get('x-requests-remaining')}", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    for stmt in DDL:
        conn.execute(stmt)
    if os.environ.get("MLB_MODE", "capture") == "closing":
        closing(conn)
    else:
        capture(conn)


if __name__ == "__main__":
    main()
