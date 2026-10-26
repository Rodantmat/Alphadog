#!/usr/bin/env python3
"""
FLIFF PICK'EM BOARD CAPTURE (owner 2026-10-26 14:22 PT: Fliff option 2 "deploy that"). Fliff's PUBLIC Pick'Em feed (no login, no
account; the same cards sports.getfliff.com shows): every NBA game's player cards in 11 stat categories, each MAIN line's two sides
with Fliff's own multiplier (eu_odds = the Selection Multiplier; a Max entry pays their product - Fliff Pick'Em contest rules v2.0).
Stored in nba_market.fliff_pickem_board (one capture per label per slate; snapshot_ts kept, older captures retained). option_type
is stored raw; 0 = Over is verified against the sportsbooks by the selection step every run (research_fliff_today / the engine).
Env: DATABASE_URL, PROXY_URL, FP_LABEL (default 'window').
"""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fliff_pickem_quote as Q                 # noqa: E402  (the public-feed client; nothing signed, nothing placed)

PT = ZoneInfo("America/Los_Angeles")
CAT = {"1060": "points", "1031": "rebounds", "1058": "assists", "1032": "threes_made", "1033": "pra", "1034": "reb_ast",
       "1035": "pts_reb", "1036": "pts_ast", "1037": "steals", "1059": "blocks", "1038": "stocks"}
DDL = """CREATE TABLE IF NOT EXISTS nba_market.fliff_pickem_board (
  game_date date NOT NULL, label text NOT NULL, snapshot_ts timestamptz NOT NULL, player text NOT NULL, prop text NOT NULL,
  line numeric NOT NULL, option_type int NOT NULL, multiplier numeric NOT NULL, fliff_game text NOT NULL, matchup text,
  tip_utc timestamptz, team text, proposal_fkey text, PRIMARY KEY (game_date, label, snapshot_ts, player, prop, line, option_type))"""


def main():
    label = os.environ.get("FP_LABEL") or "window"
    fc = Q.FliffClient(proxy=Q.PROXY)
    fc.ping()
    host = fc.ping_data.get("skipper_public_feed_endpoint")
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetLeagues__Request"})
    nba = [lg["id"] for lg in json.loads(t)["result"]["response"]["collections"]["page"] if str(lg.get("abbreviation")).upper() == "NBA"][0]
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetGames__Request", "variables": {"filter": {"league": nba}}})
    games = {}
    for g in json.loads(t)["result"]["response"]["games"]["page"]:
        r = g["game_render_data"]
        games[r["id"]] = (f"{r['away_team']['abbreviation']}@{r['home_team']['abbreviation']}", int(r["start_time_stamp_utc_millis"]))
    rows = []
    for gid, (match, tip) in games.items():
        for cid, prop in CAT.items():
            st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetCards__Request",
                                     "variables": {"filter": {"league": nba, "games": [gid], "prop_categories": [f"fkey__sk_prop_category__{cid}"]}}})
            try:
                packs = json.loads(t)["result"]["response"].get("cards_packs") or []
            except Exception:  # noqa: BLE001
                continue
            for pk in packs:
                for cd in pk.get("cards") or []:
                    pr = cd.get("player_prop_render_data") or {}
                    if not pr.get("name"):
                        continue
                    for o in (cd.get("betting_options") or {}).get("options") or []:
                        if o.get("is_main_line") and o.get("option_type") in (0, 1) and o.get("status") == 0 and o.get("eu_odds"):
                            rows.append((pr["name"], prop, float(o["line"]), int(o["option_type"]), float(o["eu_odds"]), gid, match,
                                         dt.datetime.fromtimestamp(tip / 1000, dt.timezone.utc), (pr.get("team") or {}).get("abbreviation"),
                                         o.get("proposal_fkey")))
    if not rows:
        print("FLIFF_PICKEM|no cards on the public feed")
        return
    now = dt.datetime.now(dt.timezone.utc)
    dated = [(r[7].astimezone(PT).date(),) for r in rows]          # each game's own slate date (PT), the feed lists tomorrow too
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        conn.execute(DDL)
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_market.fliff_pickem_board (game_date, label, snapshot_ts, player, prop, line, option_type,
                                 multiplier, fliff_game, matchup, tip_utc, team, proposal_fkey) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                               ON CONFLICT DO NOTHING""", [(d[0], label, now) + r for d, r in zip(dated, rows)])
        conn.commit()
    by = {}
    for d in dated:
        by[str(d[0])] = by.get(str(d[0]), 0) + 1
    print(f"FLIFF_PICKEM|{label}: {len(games)} games, {len(rows)} main-line sides stored, by slate {by}", flush=True)


if __name__ == "__main__":
    main()
