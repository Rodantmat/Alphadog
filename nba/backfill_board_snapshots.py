#!/usr/bin/env python3
"""
NBA DFS + sportsbook prop-board backfill from The Odds API historical endpoints into Postgres
(nba_market.board_snapshots + board_backfill_log). Port of the bridge job `odds_api_board_backfill`
to GitHub Actions so the whole two-season run finishes in one job instead of hundreds of worker calls.

Per Pacific game date: list events as of 09:00 PT, then for each event pull two snapshots -
  window: 14:45 PT (the owner's pick window)
  close:  tip minus 30 minutes
across regions us_dfs,us (PrizePicks, Underdog, Pick6, Dabble + DraftKings, FanDuel, BetMGM, Caesars,
BetRivers, Bovada, BetOnline...) and 21 markets (13 base + 8 _alternate for Goblins/Demons).

Cost: 10 credits x markets x regions per event-snapshot (420 with the defaults).
Resumable: (event_id, snapshot_label) rows with status='ok' in board_backfill_log are skipped, so the
job can be re-run any number of times and only fetches what is missing.

Env:
  DATABASE_URL        required (repo secret)
  BOARD_START/BOARD_END  YYYY-MM-DD Pacific game dates (default: full 2024-25 + 2025-26 range)
  BOARD_MARKETS, BOARD_REGIONS, BOARD_SNAPSHOTS, BOARD_WINDOW_PT, BOARD_CLOSE_MINUS_MIN
  BOARD_MAX_EVENTS    optional test cap
  BOARD_CREDIT_FLOOR  stop when x-requests-remaining drops below this (default 250000, protects the
                      owner's MLB/hockey budget)
  ODDS_KEY_NAME       credential key in nba_config.external_credentials (default odds_api_key_nba)
"""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import psycopg
import requests

BASE = "https://api.the-odds-api.com/v4"
NBA_MARKETS = ("player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals,"
               "player_turnovers,player_points_rebounds_assists,player_points_rebounds,player_points_assists,"
               "player_rebounds_assists,player_blocks_steals,player_double_double,player_points_alternate,"
               "player_rebounds_alternate,player_assists_alternate,player_threes_alternate,"
               "player_points_rebounds_assists_alternate,player_points_rebounds_alternate,"
               "player_points_assists_alternate,player_rebounds_assists_alternate")


def pt_offset(d: date) -> int:
    """Pacific UTC offset: PDT (7) roughly Mar 9 - Nov 1, else PST (8)."""
    dst = (3 < d.month < 11) or (d.month == 3 and d.day >= 9) or (d.month == 11 and d.day < 2)
    return 7 if dst else 8


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_json(session, url, tries=4):
    last = None
    for attempt in range(tries):
        try:
            r = session.get(url, timeout=90)
            remaining = r.headers.get("x-requests-remaining")
            if r.status_code == 200:
                return r.json(), remaining, None
            if r.status_code in (429, 502, 503, 504):
                last = f"http {r.status_code}"
                time.sleep(5 + attempt * 10)
                continue
            return None, remaining, f"http {r.status_code}: {r.text[:300]}"
        except Exception as exc:  # noqa: BLE001
            last = str(exc)[:200]
            time.sleep(3 + attempt * 5)
    return None, None, last


def main():
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        print("DATABASE_URL missing", file=sys.stderr)
        sys.exit(1)
    start = os.environ.get("BOARD_START", "2024-10-22").strip()
    end = os.environ.get("BOARD_END", "2026-04-12").strip()
    markets = os.environ.get("BOARD_MARKETS", NBA_MARKETS).strip()
    regions = os.environ.get("BOARD_REGIONS", "us_dfs,us").strip()
    labels = [x.strip() for x in os.environ.get("BOARD_SNAPSHOTS", "window,close").split(",") if x.strip()]
    window_pt = os.environ.get("BOARD_WINDOW_PT", "14:45").strip()
    close_minus = int(os.environ.get("BOARD_CLOSE_MINUS_MIN", "30"))
    max_events = int(os.environ.get("BOARD_MAX_EVENTS", "0"))
    credit_floor = int(os.environ.get("BOARD_CREDIT_FLOOR", "250000"))
    key_name = os.environ.get("ODDS_KEY_NAME", "odds_api_key_nba").strip()
    n_markets = len([m for m in markets.split(",") if m])
    n_regions = len([r for r in regions.split(",") if r])
    per_snapshot = 10 * n_markets * n_regions

    conn = psycopg.connect(dsn, autocommit=True)
    with conn.cursor() as cur:
        cur.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = %s", (key_name,))
        row = cur.fetchone()
        if not row:
            print(f"no credential {key_name}", file=sys.stderr)
            sys.exit(1)
        key = str(row[0]).strip()
        cur.execute("SELECT event_id, snapshot_label FROM nba_market.board_backfill_log WHERE status = 'ok'")
        done = {(r[0], r[1]) for r in cur.fetchall()}
    print(f"already done: {len(done)} event-snapshots | {n_markets} markets x {n_regions} regions = {per_snapshot} credits/snapshot")

    session = requests.Session()
    session.headers.update({"accept": "application/json"})
    d0 = datetime.strptime(start, "%Y-%m-%d").date()
    d1 = datetime.strptime(end, "%Y-%m-%d").date()
    tot = {"dates": 0, "dates_with_games": 0, "events": 0, "snapshots": 0, "rows": 0, "credits": 0, "skipped": 0, "errors": 0}
    remaining = None
    t0 = time.time()
    d = d0
    while d <= d1:
        off = pt_offset(d)
        tot["dates"] += 1
        list_ts = iso_z(datetime(d.year, d.month, d.day, 9 + off, 0, tzinfo=timezone.utc))
        j, remaining, err = get_json(session, f"{BASE}/historical/sports/basketball_nba/events?date={list_ts}&apiKey={key}")
        if err or not j:
            if err and "422" not in str(err):
                print(f"{d} events error: {err}", file=sys.stderr)
                tot["errors"] += 1
            d += timedelta(days=1)
            continue
        events = []
        for e in j.get("data") or []:
            ct = datetime.fromisoformat(str(e["commence_time"]).replace("Z", "+00:00"))
            if (ct - timedelta(hours=off)).date() == d:
                events.append(e)
        if not events:
            d += timedelta(days=1)
            continue
        tot["dates_with_games"] += 1
        # WINDOW TIME PER SLATE (owner rule 2026-09-10): normally 14:45 PT, but on early slates (weekends/holidays,
        # first tip before 15:45 PT) the 2:45 snapshot would land at or after tip - use first_tip - 2h instead, which
        # still sits after the league's game-day injury report for those early games.
        first_tip = min(datetime.fromisoformat(str(e["commence_time"]).replace("Z", "+00:00")) for e in events)
        hh, mm = (int(x) for x in window_pt.split(":"))
        std_window = datetime(d.year, d.month, d.day, hh + off, mm, tzinfo=timezone.utc)
        early_cut = datetime(d.year, d.month, d.day, 15 + off, 45, tzinfo=timezone.utc)   # 15:45 PT
        window_dt = std_window if first_tip >= early_cut else (first_tip - timedelta(hours=2))
        if window_dt != std_window:
            print(f"{d}: EARLY SLATE first tip {first_tip.isoformat()} -> window {window_dt.isoformat()}", flush=True)
        for ev in events:
            if max_events and tot["events"] >= max_events:
                break
            tot["events"] += 1
            ct = datetime.fromisoformat(str(ev["commence_time"]).replace("Z", "+00:00"))
            for label in labels:
                if (ev["id"], label) in done:
                    tot["skipped"] += 1
                    continue
                if remaining is not None and int(remaining) < credit_floor:
                    print(f"STOP: credits remaining {remaining} below floor {credit_floor}")
                    print(json.dumps(tot))
                    return
                if label == "close":
                    req_ts = iso_z(ct - timedelta(minutes=close_minus))
                else:
                    req_ts = iso_z(window_dt)
                url = (f"{BASE}/historical/sports/basketball_nba/events/{ev['id']}/odds?date={req_ts}"
                       f"&regions={regions}&markets={markets}&oddsFormat=american&includeMultipliers=true&apiKey={key}")
                data, remaining, err = get_json(session, url)
                if err or not data:
                    tot["errors"] += 1
                    with conn.cursor() as cur:
                        cur.execute("""INSERT INTO nba_market.board_backfill_log (event_id, snapshot_label, status, rows, credits_used, requested_ts, error)
                                       VALUES (%s,%s,'error',0,0,%s,%s)
                                       ON CONFLICT (event_id, snapshot_label) DO UPDATE SET status='error', error=EXCLUDED.error, done_at=now()""",
                                    (ev["id"], label, req_ts, str(err)[:300]))
                    continue
                snap_ts = data.get("timestamp")
                rows = []
                for bk in ((data.get("data") or {}).get("bookmakers") or []):
                    for mk in bk.get("markets") or []:
                        for oc in mk.get("outcomes") or []:
                            rows.append((d.isoformat(), ev["id"], label, snap_ts, bk.get("key"), mk.get("key"),
                                         oc.get("description") or oc.get("name"), oc.get("name"),
                                         oc.get("point", -1) if oc.get("point") is not None else -1,
                                         oc.get("price"), oc.get("multiplier"),
                                         ev.get("home_team"), ev.get("away_team"), ev.get("commence_time")))
                with conn.cursor() as cur:
                    if rows:
                        cur.executemany("""INSERT INTO nba_market.board_snapshots
                            (game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side, line, price, multiplier, home_team, away_team, commence_time)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                            ON CONFLICT (event_id, snapshot_label, bookmaker, market_key, player, side, line)
                            DO UPDATE SET price=EXCLUDED.price, multiplier=EXCLUDED.multiplier, snapshot_ts=EXCLUDED.snapshot_ts, fetched_at=now()""", rows)
                    cur.execute("""INSERT INTO nba_market.board_backfill_log (event_id, snapshot_label, status, rows, credits_used, requested_ts, snapshot_ts)
                                   VALUES (%s,%s,'ok',%s,%s,%s,%s)
                                   ON CONFLICT (event_id, snapshot_label) DO UPDATE SET status='ok', rows=EXCLUDED.rows, credits_used=EXCLUDED.credits_used, snapshot_ts=EXCLUDED.snapshot_ts, error=NULL, done_at=now()""",
                                (ev["id"], label, len(rows), per_snapshot, req_ts, snap_ts))
                tot["snapshots"] += 1
                tot["rows"] += len(rows)
                tot["credits"] += per_snapshot
        if tot["dates_with_games"] % 10 == 0:
            print(f"{d} | events {tot['events']} snapshots {tot['snapshots']} rows {tot['rows']} "
                  f"credits {tot['credits']} skipped {tot['skipped']} errors {tot['errors']} | remaining {remaining} | {int(time.time()-t0)}s", flush=True)
        if max_events and tot["events"] >= max_events:
            break
        d += timedelta(days=1)
    print("DONE", json.dumps(tot), "| credits remaining:", remaining)
    conn.close()


if __name__ == "__main__":
    main()
