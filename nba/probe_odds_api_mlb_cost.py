#!/usr/bin/env python3
"""Probe (no DB writes): the real cost and coverage of one MLB historical event-odds snapshot in the NBA backtest's shape
(us_dfs + us, every MLB player-prop market incl. alternates), on two dates (early 2025 regular season, 2025 postseason).
Prints x-requests-last (the credits that call actually cost), books and markets returned. Never prints the key."""
import os
from collections import Counter

import psycopg
from curl_cffi import requests

BASE = "https://api.the-odds-api.com/v4"
MARKETS = ("batter_home_runs,batter_first_home_run,batter_hits,batter_total_bases,batter_rbis,batter_runs_scored,batter_hits_runs_rbis,"
           "batter_singles,batter_doubles,batter_triples,batter_walks,batter_strikeouts,batter_stolen_bases,batter_fantasy_score,"
           "pitcher_strikeouts,pitcher_record_a_win,pitcher_hits_allowed,pitcher_walks,pitcher_earned_runs,pitcher_outs,"
           "batter_total_bases_alternate,batter_home_runs_alternate,batter_hits_alternate,batter_rbis_alternate,batter_walks_alternate,"
           "batter_strikeouts_alternate,batter_runs_scored_alternate,batter_hits_runs_rbis_alternate,batter_singles_alternate,"
           "batter_doubles_alternate,batter_triples_alternate,batter_fantasy_score_alternate,pitcher_hits_allowed_alternate,"
           "pitcher_walks_alternate,pitcher_earned_runs_alternate,pitcher_strikeouts_alternate,pitcher_outs_alternate")

conn = psycopg.connect(os.environ["DATABASE_URL"])
key = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='odds_api_key_nba'").fetchone()[0].strip()
for list_ts in ("2025-04-10T16:00:00Z", "2025-10-14T16:00:00Z"):
    r = requests.get(f"{BASE}/historical/sports/baseball_mlb/events", params={"apiKey": key, "date": list_ts}, timeout=60)
    evs = (r.json() or {}).get("data") or []
    print(f"events list {list_ts}: http {r.status_code} cost {r.headers.get('x-requests-last')} -> {len(evs)} events", flush=True)
    if not evs:
        continue
    ev = sorted(evs, key=lambda e: e["commence_time"])[0]
    from datetime import datetime, timedelta, timezone
    ct = datetime.fromisoformat(ev["commence_time"].replace("Z", "+00:00"))
    ts = (ct - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    r = requests.get(f"{BASE}/historical/sports/baseball_mlb/events/{ev['id']}/odds",
                     params={"apiKey": key, "date": ts, "regions": "us_dfs,us", "markets": MARKETS, "oddsFormat": "american", "includeMultipliers": "true"},
                     timeout=90)
    j = r.json() if r.status_code == 200 else {}
    bks = ((j.get("data") or {}).get("bookmakers")) or []
    mk = Counter(m["key"] for b in bks for m in b.get("markets") or [])
    rows = sum(len(m.get("outcomes") or []) for b in bks for m in b.get("markets") or [])
    print(f"  {ev['away_team']} @ {ev['home_team']} {ev['commence_time']} snapshot {j.get('timestamp')}: http {r.status_code} | "
          f"COST {r.headers.get('x-requests-last')} | remaining {r.headers.get('x-requests-remaining')} | books {sorted(b['key'] for b in bks)} | "
          f"{len(mk)} markets | {rows} outcomes", flush=True)
    print(f"  markets returned: {sorted(mk)}", flush=True)
    for b in bks:
        if b["key"] in ("prizepicks", "underdog", "pick6", "betr_us_dfs", "sleeper"):
            print(f"  {b['key']}: {len(b.get('markets') or [])} markets", flush=True)
