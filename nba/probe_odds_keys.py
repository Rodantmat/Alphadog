#!/usr/bin/env python3
"""PROBE (2026-10-19, opening-day readiness): why does odds_api_key_nba answer 401? Read-only: for each Odds API key row in
nba_config.external_credentials (values never printed) - /v4/sports (free, validates the key), the usage headers, the error body,
and one historical-odds call for the 10-20 morning (the P2B morning-line request) on the key that answers 200. Env: DATABASE_URL."""
import os

import psycopg
import requests

B = "https://api.the-odds-api.com/v4"
with psycopg.connect(os.environ["DATABASE_URL"]) as c:
    rows = c.execute("SELECT credential_key, credential_value_encrypted FROM nba_config.external_credentials "
                     "WHERE credential_key ILIKE 'odds%' ORDER BY 1").fetchall()
def main_key(name, key):
    r = requests.get(f"{B}/sports", params={"apiKey": key}, timeout=60)
    print(f"{name}: /sports HTTP {r.status_code} remaining {r.headers.get('x-requests-remaining')} used {r.headers.get('x-requests-used')} "
          f"last {r.headers.get('x-requests-last')} body {r.text[:300] if r.status_code != 200 else '(ok)'}", flush=True)
    if r.status_code == 200:
        h = requests.get(f"{B}/historical/sports/basketball_nba/odds", params={"apiKey": key, "regions": "us", "markets": "h2h,spreads,totals",
                         "oddsFormat": "american", "date": "2026-10-19T15:00:00Z"}, timeout=60)
        print(f"   historical odds: HTTP {h.status_code} remaining {h.headers.get('x-requests-remaining')} body {h.text[:200]}", flush=True)
        l = requests.get(f"{B}/sports/basketball_nba/odds", params={"apiKey": key, "regions": "us", "markets": "h2h,spreads,totals",
                         "oddsFormat": "american"}, timeout=60)
        try:
            ev = l.json()
            n = len(ev) if isinstance(ev, list) else 0
            first = (ev[0]["home_team"], ev[0]["away_team"], ev[0]["commence_time"], len(ev[0].get("bookmakers") or [])) if n else None
        except Exception:  # noqa: BLE001
            n, first = 0, l.text[:200]
        print(f"   live odds: HTTP {l.status_code} remaining {l.headers.get('x-requests-remaining')} last-cost {l.headers.get('x-requests-last')} "
              f"events {n} first {first}", flush=True)


for name, key in rows:
    try:
        main_key(name, (key or "").strip())
    except Exception as exc:  # noqa: BLE001  (never print the exception text: it can carry the request URL with the key)
        print(f"{name}: request failed ({type(exc).__name__})", flush=True)
