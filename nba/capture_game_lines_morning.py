#!/usr/bin/env python3
"""
LIVE MORNING GAME-LINE CAPTURE (2026-10-02, strategy doc §29z-c).

The baseline's blowout and matchup factors read the real market spread and total AS-OF the 08:00 PT 'morning'
snapshot (nba/export_market_spreads.py). nba_market.game_lines_snapshots holds it for every backtest day, but its
only writer was the manual historical backfill (nba/backfill_game_line_snapshots.py, no schedule) - so on a live day
nothing wrote it and the baseline silently fell back to its derived spread proxy (r=0.46). P2B runs this first.

PARITY WITH THE BACKFILL: the same Odds API historical sport-level endpoint, the same markets, the same row shape,
the same unique key, the same Pacific-date event filter and the same log table. The only differences:
  * label 'morning' ONLY - this never writes 'window' (14:45 PT does not exist yet at 08:05; the backfill would
    otherwise request a future timestamp and log it as done);
  * as-of min(08:00 PT, now - 2 min): on a normal day P2B runs at 08:05 and gets exactly the 08:00 snapshot the
    backtest used; on an early slate P2B runs earlier and gets the line as it stands then (logged in requested_ts).

Never fails the pipeline on a market outage: the baseline has a documented fallback (the derived proxy) and the
slate must still be built. A failure is printed as a GitHub ::warning:: and recorded in the log with status 'error'.

Env: DATABASE_URL, GL_DATE (default: today in Pacific time), ODDS_KEY_NAME (default odds_api_key_nba)
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import psycopg
import requests

BASE = "https://api.the-odds-api.com/v4"
PT = ZoneInfo("America/Los_Angeles")


def iso_z(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(session, url):
    """the Odds API through the system retry policy (nba/net_retry.py, 2026-10-09): 4 attempts, full-jitter backoff,
    Retry-After honoured, every 5xx retried (500 was final before), a final 4xx returned at once, no sleep after the
    last attempt."""
    from net_retry import RetryError, request
    try:
        r = request("GET", url, session=session, tries=4, base=5, cap=40, timeout=90, label="odds api")
    except RetryError as exc:
        return None, None, f"retries exhausted ({exc})"
    if r.status_code == 200:
        return r.json(), r.headers.get("x-requests-remaining"), None
    return None, r.headers.get("x-requests-remaining"), f"http {r.status_code}: {r.text[:200]}"


def main():
    d = date.fromisoformat(os.environ["GL_DATE"]) if os.environ.get("GL_DATE") else datetime.now(PT).date()
    now = datetime.now(timezone.utc)
    morning = datetime(d.year, d.month, d.day, 8, 0, tzinfo=PT).astimezone(timezone.utc)
    ts = min(morning, now - timedelta(minutes=2))
    label = "morning"
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s",
                           (os.environ.get("ODDS_KEY_NAME", "odds_api_key_nba"),)).fetchone()[0].strip()
        prev = conn.execute("SELECT status, requested_ts FROM nba_market.game_lines_snapshot_log WHERE game_date=%s AND snapshot_label=%s",
                            (d, label)).fetchone()
        if prev and prev[0] == "ok" and prev[1] == iso_z(morning):
            print(f"{d} morning line already captured as of 08:00 PT ({prev[1]}) - nothing to do")
            return
        url = (f"{BASE}/historical/sports/basketball_nba/odds?regions=us&markets=h2h,spreads,totals"
               f"&oddsFormat=american&date={iso_z(ts)}&apiKey={key}")
        data, remaining, err = get(requests.Session(), url)
        if err or not data:
            conn.execute("""INSERT INTO nba_market.game_lines_snapshot_log (game_date, snapshot_label, status, rows, events, requested_ts, error)
                            VALUES (%s,%s,'error',0,0,%s,%s) ON CONFLICT (game_date, snapshot_label)
                            DO UPDATE SET status='error', error=EXCLUDED.error, requested_ts=EXCLUDED.requested_ts, done_at=now()""",
                         (d, label, iso_z(ts), str(err)[:300]))
            print(f"::warning::{d} morning game lines NOT captured ({err}) - the baseline falls back to its derived spread proxy")
            return
        snap_ts = data.get("timestamp")
        rows = []
        for ev in data.get("data") or []:
            ct = datetime.fromisoformat(str(ev["commence_time"]).replace("Z", "+00:00"))
            if ct.astimezone(PT).date() != d:
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
                    DO UPDATE SET point=EXCLUDED.point, price=EXCLUDED.price, snapshot_ts=EXCLUDED.snapshot_ts, requested_ts=EXCLUDED.requested_ts, fetched_at=now()""", rows)
            cur.execute("""INSERT INTO nba_market.game_lines_snapshot_log (game_date, snapshot_label, status, rows, events, requested_ts)
                           VALUES (%s,%s,'ok',%s,%s,%s) ON CONFLICT (game_date, snapshot_label)
                           DO UPDATE SET status='ok', rows=EXCLUDED.rows, events=EXCLUDED.events, requested_ts=EXCLUDED.requested_ts, error=NULL, done_at=now()""",
                        (d, label, len(rows), len({r[4] for r in rows}), iso_z(ts)))
        events = len({r[4] for r in rows})
        as_of = "08:00 PT (the backtest's snapshot)" if ts == morning else f"{ts.astimezone(PT):%H:%M} PT (early slate: the line as it stands now)"
        print(f"{d} morning game lines: {len(rows)} rows, {events} games, as of {as_of}; snapshot {snap_ts}; credits remaining {remaining}")
        if not rows:
            print(f"::warning::{d}: the odds feed returned no games for this date at {iso_z(ts)}")


if __name__ == "__main__":
    main()
