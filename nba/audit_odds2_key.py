#!/usr/bin/env python3
"""THE ODDS API KEY CHECK (owner 2026-11-22 00:31 PT: new 100K key in GitHub secret ODDS2_API_KEY). Free call (/v4/sports costs 0 credits):
prints whether the key works and the credit headers - never the key."""
import os
import requests

k = (os.environ.get("ODDS2_API_KEY") or "").strip()
print(f"OK2|key present: {bool(k)} (length {len(k)})", flush=True)
if k:
    r = requests.get("https://api.the-odds-api.com/v4/sports", params={"apiKey": k}, timeout=60)
    print(f"OK2|http {r.status_code} | remaining {r.headers.get('x-requests-remaining')} | used {r.headers.get('x-requests-used')} | "
          f"basketball_nba listed: {any(s.get('key') == 'basketball_nba' for s in (r.json() if r.ok else []))}", flush=True)
