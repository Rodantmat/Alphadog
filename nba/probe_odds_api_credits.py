#!/usr/bin/env python3
"""Probe (no writes): The Odds API credits remaining on both keys (the /sports call is free) and whether ParlayAPI's
historical closing-odds still answers for a 2025 playoff date on the current tier. Prints headers only, never keys."""
import os

import psycopg
from curl_cffi import requests   # the probe image ships curl_cffi, not requests

conn = psycopg.connect(os.environ["DATABASE_URL"])
keys = dict(conn.execute("SELECT credential_key, credential_value_encrypted FROM nba_config.external_credentials "
                         "WHERE credential_key IN ('odds_api_key','odds_api_key_nba','parlay_api_key')").fetchall())
for name in ("odds_api_key_nba", "odds_api_key"):
    r = requests.get("https://api.the-odds-api.com/v4/sports", params={"apiKey": keys[name]}, timeout=60)
    print(f"{name}: http {r.status_code} | remaining {r.headers.get('x-requests-remaining')} | used {r.headers.get('x-requests-used')} "
          f"| last {r.headers.get('x-requests-last')}", flush=True)
    if r.status_code == 200:
        active = [s["key"] for s in r.json() if s.get("active")]
        print("   active sports incl:", [k for k in active if k in ("basketball_nba", "baseball_mlb", "icehockey_nhl", "basketball_wnba")], flush=True)
# ParlayAPI historical closing odds for a 2025 playoff date (10 credits if it answers)
for d in ("2025-04-19",):
    r = requests.get("https://parlay-api.com/v1/historical/sports/basketball_nba/closing-odds",
                     params={"markets": "spreads,totals,h2h", "date": d}, headers={"X-API-Key": keys["parlay_api_key"], "accept": "application/json"}, timeout=60)
    print(f"parlayapi closing-odds {d}: http {r.status_code} | remaining {r.headers.get('x-requests-remaining')} | {r.text[:300]}", flush=True)
