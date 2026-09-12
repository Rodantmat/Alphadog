#!/usr/bin/env python3
"""
Game-line snapshots (h2h / spread / total) at the two pipeline moments, for both seasons - the inputs
for B1/B2 market_spread_delta / market_total_delta and C3 game_line_movement.

WHY: ParlayAPI's archive holds CLOSING lines only (nba_market.game_lines_closing) and its opening /
intraday snapshots start ~May 2026. The engine needs the line as it stood at:
  morning  = 08:00 PT (the phase-1 / baseline snapshot)
  window   = 14:45 PT, or first tip - 2h on early slates (same rule as the board pull)
The Odds API historical SPORT-level endpoint returns every game on a date in one call:
  /v4/historical/sports/basketball_nba/odds?regions=us&markets=h2h,spreads,totals&date=<ts>
Cost: 10 credits x 3 markets x 1 region = 30 credits per snapshot -> ~20k credits for two seasons.

Resumable via nba_market.game_lines_snapshot_log (game_date, snapshot_label, status). Monthly blocks.
Env: DATABASE_URL, GL_START, GL_END, GL_CREDIT_FLOOR (default 250000), ODDS_KEY_NAME (odds_api_key_nba)
"""
import json
import os
import time
from datetime import date, datetime, timedelta, timezone

import psycopg
import requests

BASE = "https://api.the-odds-api.com/v4"


def pt_offset(d):
    dst = (3 < d.month < 11) or (d.month == 3 and d.day >= 9) or (d.month == 11 and d.day < 2)
    return 7 if dst else 8


def iso_z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(session, url):
    for attempt in range(4):
        r = session.get(url, timeout=90)
        rem = r.headers.get("x-requests-remaining")
        if r.status_code == 200:
            return r.json(), rem, None
        if r.status_code in (429, 502, 503, 504):
            time.sleep(5 + attempt * 10)
            continue
        return None, rem, f"http {r.status_code}: {r.text[:200]}"
    return None, None, "retries exhausted"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    key_name = os.environ.get("ODDS_KEY_NAME", "odds_api_key_nba")
    floor = int(os.environ.get("GL_CREDIT_FLOOR", "250000"))
    with conn.cursor() as cur:
        cur.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s", (key_name,))
        key = cur.fetchone()[0].strip()
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_market.game_lines_snapshots (
            game_date date, snapshot_label text, requested_ts text, snapshot_ts text, event_id text,
            home_team text, away_team text, commence_time text, bookmaker text, market text,
            outcome text, point numeric, price numeric, fetched_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS game_lines_snapshots_uidx ON nba_market.game_lines_snapshots
            (game_date, snapshot_label, event_id, bookmaker, market, outcome)""")
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_market.game_lines_snapshot_log (
            game_date date, snapshot_label text, status text, rows int, events int, requested_ts text,
            error text, done_at timestamptz DEFAULT now(), PRIMARY KEY (game_date, snapshot_label))""")
        cur.execute("SELECT game_date, snapshot_label FROM nba_market.game_lines_snapshot_log WHERE status='ok'")
        done = {(r[0], r[1]) for r in cur.fetchall()}
    print("already done:", len(done), flush=True)

    s = requests.Session()
    d = datetime.strptime(os.environ.get("GL_START", "2024-10-22"), "%Y-%m-%d").date()
    end = datetime.strptime(os.environ.get("GL_END", "2026-04-12"), "%Y-%m-%d").date()
    tot = {"dates": 0, "snapshots": 0, "rows": 0, "skipped": 0, "errors": 0, "credits": 0}
    remaining = None
    while d <= end:
        # skip the off-season gap between the two seasons
        if date(2025, 4, 14) <= d <= date(2025, 10, 20):
            d += timedelta(days=1)
            continue
        off = pt_offset(d)
        # first tip on the date (from the board table - already keyed by Pacific game date)
        with conn.cursor() as cur:
            cur.execute("SELECT min(commence_time) FROM nba_market.board_snapshots WHERE game_date=%s", (d,))
            first = cur.fetchone()[0]
        if not first:
            d += timedelta(days=1)
            continue
        first_tip = datetime.fromisoformat(str(first).replace("Z", "+00:00"))
        morning = datetime(d.year, d.month, d.day, 8 + off, 0, tzinfo=timezone.utc)
        std_window = datetime(d.year, d.month, d.day, 14 + off, 45, tzinfo=timezone.utc)
        early_cut = datetime(d.year, d.month, d.day, 15 + off, 45, tzinfo=timezone.utc)
        window = std_window if first_tip >= early_cut else first_tip - timedelta(hours=2)
        tot["dates"] += 1
        for label, ts in (("morning", morning), ("window", window)):
            if (d, label) in done:
                tot["skipped"] += 1
                continue
            if remaining is not None and int(remaining) < floor:
                print(f"STOP: credits {remaining} below floor {floor}", flush=True)
                print(json.dumps(tot))
                return
            url = (f"{BASE}/historical/sports/basketball_nba/odds?regions=us&markets=h2h,spreads,totals"
                   f"&oddsFormat=american&date={iso_z(ts)}&apiKey={key}")
            data, remaining, err = get(s, url)
            if err or not data:
                tot["errors"] += 1
                with conn.cursor() as cur:
                    cur.execute("""INSERT INTO nba_market.game_lines_snapshot_log (game_date, snapshot_label, status, rows, events, requested_ts, error)
                                   VALUES (%s,%s,'error',0,0,%s,%s) ON CONFLICT (game_date, snapshot_label) DO UPDATE SET status='error', error=EXCLUDED.error, done_at=now()""",
                                (d, label, iso_z(ts), str(err)[:300]))
                continue
            snap_ts = data.get("timestamp")
            rows = []
            events = data.get("data") or []
            for ev in events:
                ct = datetime.fromisoformat(str(ev["commence_time"]).replace("Z", "+00:00"))
                if (ct - timedelta(hours=off)).date() != d:
                    continue
                for bk in ev.get("bookmakers") or []:
                    for mk in bk.get("markets") or []:
                        for oc in mk.get("outcomes") or []:
                            rows.append((d, label, iso_z(ts), snap_ts, ev["id"], ev.get("home_team"), ev.get("away_team"),
                                         ev.get("commence_time"), bk.get("key"), mk.get("key"), oc.get("name"), oc.get("point"), oc.get("price")))
            with conn.cursor() as cur:
                if rows:
                    cur.executemany("""INSERT INTO nba_market.game_lines_snapshots
                        (game_date, snapshot_label, requested_ts, snapshot_ts, event_id, home_team, away_team, commence_time, bookmaker, market, outcome, point, price)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (game_date, snapshot_label, event_id, bookmaker, market, outcome)
                        DO UPDATE SET point=EXCLUDED.point, price=EXCLUDED.price, snapshot_ts=EXCLUDED.snapshot_ts, fetched_at=now()""", rows)
                cur.execute("""INSERT INTO nba_market.game_lines_snapshot_log (game_date, snapshot_label, status, rows, events, requested_ts)
                               VALUES (%s,%s,'ok',%s,%s,%s) ON CONFLICT (game_date, snapshot_label) DO UPDATE SET status='ok', rows=EXCLUDED.rows, events=EXCLUDED.events, error=NULL, done_at=now()""",
                            (d, label, len(rows), len({r[4] for r in rows}), iso_z(ts)))
            tot["snapshots"] += 1
            tot["rows"] += len(rows)
            tot["credits"] += 30
        if tot["dates"] % 20 == 0:
            print(f"{d} {json.dumps(tot)} remaining={remaining}", flush=True)
        d += timedelta(days=1)
    print("DONE", json.dumps(tot), "remaining:", remaining, flush=True)


if __name__ == "__main__":
    main()
