#!/usr/bin/env python3
"""
LIVE SPORTSBOOK PLAYER PROPS FROM THE ODDS API - the market read of every pick'em leg, at the P3 window (owner 2026-11-22 00:31 PT: "Backfill the
market for this year and wire it to be used daily"; ParlayAPI is being deactivated by the owner).

WHY. Each leg's hit rate pools the model with the sportsbooks' de-vigged price of the same line (research_leg_hitrate.py). In 2026-27 the live
feed (ParlayAPI) carried FanDuel on 9 of 32 slates and almost no alternate ladders, so only ~29% of legs had a market read (2024-26, from the
Odds API: ~90%). This step reads the same source the history was built from, in the SAME shape as nba/backfill_board_snapshots.py: the same 21
markets (13 base + 8 alternates), region 'us' (DraftKings, FanDuel, BetMGM, Caesars, BetRivers, Bovada, BetOnline, Fanatics ...), American odds,
written to nba_market.board_snapshots with snapshot_label 'window' and the moment it was read - so a live slate and a backfilled slate are one
dataset.
Cost: 21 credits per game (live event odds = markets x regions), ~170 credits on an 8-game slate.
Soft in P3: a failure is printed and the pick goes on.
Env: DATABASE_URL, ODDS2_API_KEY, OP_DATE (Pacific slate date, default today), OP_LABEL (window), OP_MARKETS, OP_REGIONS (us),
     OP_CREDIT_FLOOR (stop below this many credits, default 2000).
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zoneinfo

import psycopg

BASE = "https://api.the-odds-api.com/v4"
MARKETS = ("player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals,"
           "player_turnovers,player_points_rebounds_assists,player_points_rebounds,player_points_assists,"
           "player_rebounds_assists,player_blocks_steals,player_double_double,player_points_alternate,"
           "player_rebounds_alternate,player_assists_alternate,player_threes_alternate,"
           "player_points_rebounds_assists_alternate,player_points_rebounds_alternate,"
           "player_points_assists_alternate,player_rebounds_assists_alternate")
PT = zoneinfo.ZoneInfo("America/Los_Angeles")


def get(url, tries=4):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read()), r.headers.get("x-requests-remaining"), None
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                last = f"http {e.code}"; time.sleep(4 + 6 * a); continue
            return None, e.headers.get("x-requests-remaining") if e.headers else None, f"http {e.code}: {e.read()[:200]!r}"
        except Exception as e:  # noqa: BLE001
            last = str(e)[:200]; time.sleep(3 + 4 * a)
    return None, None, last


def main():
    key = (os.environ.get("ODDS2_API_KEY") or "").strip()
    if not key:
        print("::error::ODDS2_API_KEY missing - no sportsbook props captured", flush=True)
        sys.exit(1)
    day = dt.date.fromisoformat(os.environ.get("OP_DATE") or dt.datetime.now(PT).date().isoformat())
    label = os.environ.get("OP_LABEL") or "window"
    markets = os.environ.get("OP_MARKETS") or MARKETS
    regions = os.environ.get("OP_REGIONS") or "us"
    floor = int(os.environ.get("OP_CREDIT_FLOOR") or 2000)
    evs, rem, err = get(f"{BASE}/sports/basketball_nba/events?apiKey={key}")     # free call
    if err:
        print(f"::error::events list failed: {err}", flush=True)
        sys.exit(1)
    now = dt.datetime.now(dt.timezone.utc)
    todays = []
    for e in evs or []:
        ct = dt.datetime.fromisoformat(str(e["commence_time"]).replace("Z", "+00:00"))
        if ct.astimezone(PT).date() == day and ct > now:            # games of the slate not yet started
            todays.append(e)
    print(f"OP|{day} {label}: {len(todays)} games not yet started | credits remaining {rem}", flush=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    tot_rows, tot_games, books = 0, 0, set()
    for e in todays:
        if rem is not None and int(rem) < floor:
            print(f"OP|STOP: credits {rem} below floor {floor}", flush=True)
            break
        data, rem, err = get(f"{BASE}/sports/basketball_nba/events/{e['id']}/odds?regions={regions}&markets={markets}"
                             f"&oddsFormat=american&includeMultipliers=true&apiKey={key}")
        if err or not data:
            print(f"OP|{e.get('away_team')} @ {e.get('home_team')}: {err}", flush=True)
            continue
        snap = dt.datetime.now(dt.timezone.utc).isoformat()
        rows = []
        for bk in data.get("bookmakers") or []:
            books.add(bk.get("key"))
            for mk in bk.get("markets") or []:
                for oc in mk.get("outcomes") or []:
                    rows.append((day.isoformat(), e["id"], label, snap, bk.get("key"), mk.get("key"),
                                 oc.get("description") or oc.get("name"), oc.get("name"),
                                 oc.get("point") if oc.get("point") is not None else -1,
                                 oc.get("price"), oc.get("multiplier"), e.get("home_team"), e.get("away_team"), e.get("commence_time")))
        if rows:
            with conn.cursor() as cur:
                cur.executemany("""INSERT INTO nba_market.board_snapshots
                    (game_date, event_id, snapshot_label, snapshot_ts, bookmaker, market_key, player, side, line, price, multiplier, home_team, away_team, commence_time)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT ((md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||coalesce(line::text,''))::uuid))
                    DO UPDATE SET price=EXCLUDED.price, multiplier=EXCLUDED.multiplier, snapshot_ts=EXCLUDED.snapshot_ts, fetched_at=now()""", rows)
        tot_rows += len(rows); tot_games += 1
        print(f"OP|{e.get('away_team')} @ {e.get('home_team')}: {len(rows):,} rows", flush=True)
    print(f"OP|DONE {tot_games} games, {tot_rows:,} sportsbook rows, books {sorted(books)} | credits remaining {rem}", flush=True)
    if todays and tot_rows == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
