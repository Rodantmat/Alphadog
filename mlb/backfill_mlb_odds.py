#!/usr/bin/env python3
"""
MLB ODDS API HISTORY - the mirror of the NBA board history, at MLB's own board times (owner 2026-10-08).

WHAT IT MIRRORS. The NBA backtest holds, per game, every player-prop market (base + _alternate) from the DFS boards and the US
sportsbooks (regions us_dfs,us) at the pipeline's decision times. MLB's live system captures its boards three times a day -
09:00, 13:00 and 17:00 Pacific (measured on archive.board_leg_history, Aug-Sep 2026: PrizePicks / Underdog / Sleeper rows
cluster at those hours; 09:00 is the "morning produce" board slips are placed from, BACKTEST_LAYOUTS_AND_9AM_METHODOLOGY.md).
So each MLB game gets a snapshot at each of those times that falls BEFORE its first pitch (a 10:05 PT day game has only the
09:00 one), labelled pt0900 / pt1300 / pt1700, with all 37 MLB prop markets (20 base + 17 alternate) over us_dfs,us; plus the
game lines (h2h, spreads, totals; sport-level call, region us) at the same three times per date.

STORAGE - LOSSLESS AND COMPACT. One MLB snapshot returns ~4-5k outcomes; three a game over two seasons would be ~40M rows in
the NBA's long format. Each API response is stored WHOLE as jsonb (TOAST-compressed) in
    market.mlb_odds_event_snapshots (event_id, label, game_date, requested_ts, snapshot_ts, home_team, away_team, commence_time,
                                     n_books, n_markets, n_outcomes, credits, payload)
    market.mlb_odds_game_lines      (game_date, label, requested_ts, snapshot_ts, n_events, credits, payload)
and the view market.mlb_board_snapshots_v expands them to the NBA board_snapshots columns on demand. Nothing is lost; any
later normalisation reads the payload. Resumable: an (event_id, label) already stored is never fetched again.

COST (measured 2026-10-08): event odds cost 10 x markets RETURNED x regions -> 620-720 credits per MLB snapshot; the events
list costs 1; a game-lines call costs 30. MLB_CREDIT_FLOOR stops the run when x-requests-remaining falls below it.

PARALLEL. MLB_SHARD / MLB_SHARDS split the dates (date ordinal mod shards) so several runners pull at once.
Env: DATABASE_URL, MLB_START, MLB_END (Pacific dates), MLB_LABELS (default pt0900,pt1300,pt1700), MLB_PROPS (1/0),
     MLB_LINES (1/0), MLB_CREDIT_FLOOR (default 30000), MLB_SHARD, MLB_SHARDS, MLB_SKIP_RANGES ("a:b,c:d" dates to skip),
     ODDS_KEY_NAME (default odds_api_key_nba - the paid key).
"""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import psycopg
import requests

BASE = "https://api.the-odds-api.com/v4"
PT = ZoneInfo("America/Los_Angeles")
MARKETS = ("batter_home_runs,batter_first_home_run,batter_hits,batter_total_bases,batter_rbis,batter_runs_scored,batter_hits_runs_rbis,"
           "batter_singles,batter_doubles,batter_triples,batter_walks,batter_strikeouts,batter_stolen_bases,batter_fantasy_score,"
           "pitcher_strikeouts,pitcher_record_a_win,pitcher_hits_allowed,pitcher_walks,pitcher_earned_runs,pitcher_outs,"
           "batter_total_bases_alternate,batter_home_runs_alternate,batter_hits_alternate,batter_rbis_alternate,batter_walks_alternate,"
           "batter_strikeouts_alternate,batter_runs_scored_alternate,batter_hits_runs_rbis_alternate,batter_singles_alternate,"
           "batter_doubles_alternate,batter_triples_alternate,batter_fantasy_score_alternate,pitcher_hits_allowed_alternate,"
           "pitcher_walks_alternate,pitcher_earned_runs_alternate,pitcher_strikeouts_alternate,pitcher_outs_alternate")
LABEL_HOURS = {"pt0900": 9, "pt1300": 13, "pt1700": 17}

DDL = [
    "CREATE SCHEMA IF NOT EXISTS market",
    """CREATE TABLE IF NOT EXISTS market.mlb_odds_event_snapshots (
        event_id text NOT NULL, label text NOT NULL, game_date date NOT NULL, requested_ts timestamptz, snapshot_ts timestamptz,
        home_team text, away_team text, commence_time timestamptz, n_books int, n_markets int, n_outcomes int, credits int,
        payload jsonb, fetched_at timestamptz DEFAULT now(), PRIMARY KEY (event_id, label))""",
    "CREATE INDEX IF NOT EXISTS mlb_odds_event_snapshots_date ON market.mlb_odds_event_snapshots (game_date)",
    """CREATE TABLE IF NOT EXISTS market.mlb_odds_game_lines (
        game_date date NOT NULL, label text NOT NULL, requested_ts timestamptz, snapshot_ts timestamptz, n_events int, credits int,
        payload jsonb, fetched_at timestamptz DEFAULT now(), PRIMARY KEY (game_date, label))""",
    """CREATE TABLE IF NOT EXISTS market.mlb_odds_backfill_log (
        event_id text, label text, game_date date, status text, note text, logged_at timestamptz DEFAULT now(),
        PRIMARY KEY (event_id, label))""",
    """CREATE OR REPLACE VIEW market.mlb_board_snapshots_v AS
        SELECT s.game_date, s.event_id, s.label AS snapshot_label, s.snapshot_ts, b->>'key' AS bookmaker, m->>'key' AS market_key,
               coalesce(o->>'description', o->>'name') AS player, o->>'name' AS side,
               coalesce((o->>'point')::numeric, -1) AS line, (o->>'price')::numeric AS price, (o->>'multiplier')::numeric AS multiplier,
               s.home_team, s.away_team, s.commence_time
        FROM market.mlb_odds_event_snapshots s
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.payload->'data'->'bookmakers', '[]'::jsonb)) b
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(b->'markets', '[]'::jsonb)) m
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(m->'outcomes', '[]'::jsonb)) o""",
]


def get_json(session, url, tries=5):
    last = None
    for attempt in range(tries):
        try:
            r = session.get(url, timeout=120)
            rem = r.headers.get("x-requests-remaining")
            cost = r.headers.get("x-requests-last")
            if r.status_code == 200:
                return r.json(), rem, cost, None
            if r.status_code in (429, 500, 502, 503, 504):
                last = f"http {r.status_code}"
                time.sleep(4 + attempt * 6)
                continue
            return None, rem, cost, f"http {r.status_code}: {r.text[:200]}"
        except Exception as exc:  # noqa: BLE001
            last = str(exc)[:200]
            time.sleep(3 + attempt * 5)
    return None, None, None, last


def at_pt(d, hour):
    return datetime(d.year, d.month, d.day, hour, 0, tzinfo=PT).astimezone(timezone.utc)


def z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    start = date.fromisoformat(os.environ["MLB_START"])
    end = date.fromisoformat(os.environ["MLB_END"])
    labels = [l.strip() for l in os.environ.get("MLB_LABELS", "pt0900,pt1300,pt1700").split(",") if l.strip()]
    do_props = os.environ.get("MLB_PROPS", "1") == "1"
    do_lines = os.environ.get("MLB_LINES", "1") == "1"
    floor = int(os.environ.get("MLB_CREDIT_FLOOR", "30000"))
    shard, shards = int(os.environ.get("MLB_SHARD", "0")), int(os.environ.get("MLB_SHARDS", "1"))
    skips = []
    for rng in [r for r in os.environ.get("MLB_SKIP_RANGES", "").split(",") if r.strip()]:
        a, b = rng.split(":")
        skips.append((date.fromisoformat(a), date.fromisoformat(b)))
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    for stmt in DDL:
        conn.execute(stmt)
    key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s",
                       (os.environ.get("ODDS_KEY_NAME", "odds_api_key_nba"),)).fetchone()[0].strip()
    done = {(r[0], r[1]) for r in conn.execute("SELECT event_id, label FROM market.mlb_odds_event_snapshots").fetchall()}
    done |= {(r[0], r[1]) for r in conn.execute("SELECT event_id, label FROM market.mlb_odds_backfill_log WHERE status='empty'").fetchall()}
    lines_done = {(r[0], r[1]) for r in conn.execute("SELECT game_date, label FROM market.mlb_odds_game_lines").fetchall()}
    s = requests.Session()
    tot = {"dates": 0, "events": 0, "snapshots": 0, "empty": 0, "outcomes": 0, "credits": 0, "lines": 0, "errors": 0, "skipped": 0}
    remaining = None
    t0 = time.time()
    d = start
    while d <= end:
        if (d.toordinal() % shards) != shard or any(a <= d <= b for a, b in skips):
            d += timedelta(days=1)
            continue
        tot["dates"] += 1
        # the day's events, listed at 08:00 PT (before the first board time)
        j, remaining, _c, err = get_json(s, f"{BASE}/historical/sports/baseball_mlb/events?date={z(at_pt(d, 8))}&apiKey={key}")
        events = [e for e in ((j or {}).get("data") or [])
                  if datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00")).astimezone(PT).date() == d]
        for label in labels:
            ts = at_pt(d, LABEL_HOURS[label])
            if remaining is not None and int(remaining) < floor:
                print(f"STOP: credits remaining {remaining} below floor {floor}", flush=True)
                print("PARTIAL", json.dumps(tot), flush=True)
                return
            # game lines for the date at this board time (only when at least one game is still ahead)
            if do_lines and (d, label) not in lines_done and any(datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00")) > ts for e in events):
                gl, remaining, cost, err = get_json(s, f"{BASE}/historical/sports/baseball_mlb/odds?date={z(ts)}&regions=us&markets=h2h,spreads,totals"
                                                       f"&oddsFormat=american&apiKey={key}")
                if gl is not None:
                    conn.execute("""INSERT INTO market.mlb_odds_game_lines (game_date, label, requested_ts, snapshot_ts, n_events, credits, payload)
                                    VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (game_date, label) DO NOTHING""",
                                 (d, label, ts, gl.get("timestamp"), len(gl.get("data") or []), int(cost or 0), json.dumps(gl)))
                    tot["lines"] += 1
                    tot["credits"] += int(cost or 0)
                else:
                    tot["errors"] += 1
            if not do_props:
                continue
            for ev in events:
                ct = datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00"))
                if ts >= ct - timedelta(minutes=5):
                    continue                     # this board time is at/after first pitch for this game
                if (ev["id"], label) in done:
                    tot["skipped"] += 1
                    continue
                if remaining is not None and int(remaining) < floor:
                    print(f"STOP: credits remaining {remaining} below floor {floor}", flush=True)
                    print("PARTIAL", json.dumps(tot), flush=True)
                    return
                tot["events"] += 1
                data, remaining, cost, err = get_json(s, f"{BASE}/historical/sports/baseball_mlb/events/{ev['id']}/odds?date={z(ts)}"
                                                         f"&regions=us_dfs,us&markets={MARKETS}&oddsFormat=american&includeMultipliers=true&apiKey={key}")
                if data is None:
                    tot["errors"] += 1
                    conn.execute("""INSERT INTO market.mlb_odds_backfill_log (event_id, label, game_date, status, note) VALUES (%s,%s,%s,'error',%s)
                                    ON CONFLICT (event_id, label) DO UPDATE SET status='error', note=EXCLUDED.note, logged_at=now()""",
                                 (ev["id"], label, d, str(err)[:300]))
                    continue
                bks = ((data.get("data") or {}).get("bookmakers")) or []
                n_out = sum(len(m.get("outcomes") or []) for b in bks for m in b.get("markets") or [])
                if not bks:
                    tot["empty"] += 1
                    conn.execute("""INSERT INTO market.mlb_odds_backfill_log (event_id, label, game_date, status, note) VALUES (%s,%s,%s,'empty',%s)
                                    ON CONFLICT (event_id, label) DO UPDATE SET status='empty', note=EXCLUDED.note, logged_at=now()""",
                                 (ev["id"], label, d, f"no bookmakers at {z(ts)}"))
                    continue
                conn.execute("""INSERT INTO market.mlb_odds_event_snapshots (event_id, label, game_date, requested_ts, snapshot_ts, home_team, away_team,
                                commence_time, n_books, n_markets, n_outcomes, credits, payload)
                                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (event_id, label) DO NOTHING""",
                             (ev["id"], label, d, ts, data.get("timestamp"), ev.get("home_team"), ev.get("away_team"), ct, len(bks),
                              len({m["key"] for b in bks for m in b.get("markets") or []}), n_out, int(cost or 0), json.dumps(data)))
                conn.execute("""INSERT INTO market.mlb_odds_backfill_log (event_id, label, game_date, status, note) VALUES (%s,%s,%s,'ok',NULL)
                                ON CONFLICT (event_id, label) DO UPDATE SET status='ok', note=NULL, logged_at=now()""", (ev["id"], label, d))
                tot["snapshots"] += 1
                tot["outcomes"] += n_out
                tot["credits"] += int(cost or 0)
        if tot["dates"] % 10 == 0:
            print(f"{d} | {json.dumps(tot)} | remaining {remaining} | {int(time.time() - t0)}s", flush=True)
        d += timedelta(days=1)
    print("DONE", json.dumps(tot), "| remaining", remaining, flush=True)


if __name__ == "__main__":
    main()
