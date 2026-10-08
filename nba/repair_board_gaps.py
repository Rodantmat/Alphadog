#!/usr/bin/env python3
"""
BOARD GAP REPAIR (2026-10-08, gap audit of the two-season + postseason Odds API board history).

The audit of nba_market.board_backfill_log against the schedule found six real holes (everything else = postponed games,
whose original event ids 404 and whose make-up games are covered on their new dates):
  * close 404 EVENT_NOT_FOUND on two NBA Cup games 2024-11-29 (the event id changed between the 09:00 PT list and tip)
  * window empty (0 rows) on three early-tip games (2024-11-10 DET-HOU, 2024-12-31 IND-MIL, 2025-04-13 ATL-ORL)
  * close empty (0 rows) on 2026-05-07 OKC-LAL (playoffs)
For each target: re-list the historical events AT the snapshot time, match the game by home/away team, request the event
odds; if the snapshot is empty try the next offset. Rows go to nba_market.board_snapshots exactly as the backfill writes
them (same columns, same conflict key, game_date = the Pacific game date); the log row is written under the event id that
answered, and the old failed/empty log row is marked 'superseded' (kept). Env: DATABASE_URL, ODDS_KEY_NAME.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_board_snapshots import NBA_MARKETS, get_json, iso_z  # noqa: E402

BASE = "https://api.the-odds-api.com/v4"
# (pacific game date, home, away, label, tip UTC, offsets in minutes before tip to try, in order)
TARGETS = [
    ("2024-11-29", "Los Angeles Lakers", "Oklahoma City Thunder", "close", "2024-11-30T03:10:00Z", [30, 25, 40, 60]),
    ("2024-11-29", "Portland Trail Blazers", "Sacramento Kings", "close", "2024-11-30T03:10:00Z", [30, 25, 40, 60]),
    ("2024-11-10", "Detroit Pistons", "Houston Rockets", "window", "2024-11-10T20:10:00Z", [120, 150, 180, 90]),
    ("2024-12-31", "Indiana Pacers", "Milwaukee Bucks", "window", "2024-12-31T20:10:00Z", [120, 150, 180, 90]),
    ("2025-04-13", "Atlanta Hawks", "Orlando Magic", "window", "2025-04-13T17:10:00Z", [90, 75, 60, 150, 180]),
    ("2026-05-07", "Oklahoma City Thunder", "Los Angeles Lakers", "close", "2026-05-08T01:40:00Z", [45, 40, 35, 25, 60]),
]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s",
                       (os.environ.get("ODDS_KEY_NAME", "odds_api_key_nba"),)).fetchone()[0].strip()
    s = requests.Session()
    n_markets = len(NBA_MARKETS.split(","))
    for gd, home, away, label, tip, offsets in TARGETS:
        tip_dt = datetime.fromisoformat(tip.replace("Z", "+00:00"))
        done = False
        for off in offsets:
            ts = iso_z(tip_dt - timedelta(minutes=off))
            j, rem, err = get_json(s, f"{BASE}/historical/sports/basketball_nba/events?date={ts}&apiKey={key}")
            ev = next((e for e in ((j or {}).get("data") or []) if e.get("home_team") == home and e.get("away_team") == away
                       and abs((datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00")) - tip_dt).total_seconds()) < 6 * 3600), None)
            if not ev:
                print(f"{gd} {home} v {away} {label} @ {ts}: event not listed ({err or 'no match'})", flush=True)
                continue
            data, rem, err = get_json(s, f"{BASE}/historical/sports/basketball_nba/events/{ev['id']}/odds?date={ts}&regions=us_dfs,us"
                                         f"&markets={NBA_MARKETS}&oddsFormat=american&includeMultipliers=true&apiKey={key}")
            bks = ((data or {}).get("data") or {}).get("bookmakers") or []
            rows = [(gd, ev["id"], label, data.get("timestamp"), bk.get("key"), mk.get("key"), oc.get("description") or oc.get("name"), oc.get("name"),
                     oc.get("point") if oc.get("point") is not None else -1, oc.get("price"), oc.get("multiplier"),
                     ev.get("home_team"), ev.get("away_team"), ev.get("commence_time"))
                    for bk in bks for mk in bk.get("markets") or [] for oc in mk.get("outcomes") or []]
            print(f"{gd} {home} v {away} {label} @ {ts} (tip-{off}m) event {ev['id'][:8]}…: {len(bks)} books, {len(rows)} rows | remaining {rem}", flush=True)
            if not rows:
                continue
            with conn.cursor() as cur:
                cur.executemany("""INSERT INTO nba_market.board_snapshots
                    (game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side, line, price, multiplier, home_team, away_team, commence_time)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT ((md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||coalesce(line::text,''))::uuid))
                    DO UPDATE SET price=EXCLUDED.price, multiplier=EXCLUDED.multiplier, snapshot_ts=EXCLUDED.snapshot_ts, fetched_at=now()""", rows)
                cur.execute("""UPDATE nba_market.board_backfill_log SET status='superseded', error=coalesce(error,'')||' | repaired by repair_board_gaps.py under '||%s
                               WHERE snapshot_label=%s AND event_id<>%s AND (status<>'ok' OR rows=0)
                                 AND (requested_ts AT TIME ZONE 'America/Los_Angeles')::date BETWEEN %s::date - 1 AND %s::date + 1
                                 AND event_id IN (SELECT DISTINCT event_id FROM nba_market.board_snapshots WHERE home_team=%s AND away_team=%s AND game_date=%s::date)
                                 OR (snapshot_label=%s AND status='error' AND (requested_ts AT TIME ZONE 'America/Los_Angeles')::date = %s::date AND event_id<>%s
                                     AND event_id IN (SELECT DISTINCT event_id FROM nba_market.board_snapshots WHERE home_team=%s AND away_team=%s))""",
                            (ev["id"], label, ev["id"], gd, gd, home, away, gd, label, gd, ev["id"], home, away))
                cur.execute("""INSERT INTO nba_market.board_backfill_log (event_id, snapshot_label, status, rows, credits_used, requested_ts, snapshot_ts, error)
                               VALUES (%s,%s,'ok',%s,%s,%s,%s,'repair_board_gaps.py')
                               ON CONFLICT (event_id, snapshot_label) DO UPDATE SET status='ok', rows=EXCLUDED.rows, requested_ts=EXCLUDED.requested_ts,
                               snapshot_ts=EXCLUDED.snapshot_ts, error=EXCLUDED.error, done_at=now()""",
                            (ev["id"], label, len(rows), 10 * n_markets * 2, ts, data.get("timestamp")))
            done = True
            break
        if not done:
            print(f"!! {gd} {home} v {away} {label}: NO non-empty snapshot at any offset {offsets} - recorded as a true source gap", flush=True)


if __name__ == "__main__":
    main()
