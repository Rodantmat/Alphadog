#!/usr/bin/env python3
"""THE ODDS API KEY CHECK (owner 2026-11-22 00:31 PT: new 100K key in GitHub secret ODDS2_API_KEY). Free call (/v4/sports costs 0 credits):
prints whether the key works and the credit headers - never the key."""
import json
import os
import urllib.request

k = (os.environ.get("ODDS2_API_KEY") or "").strip()
print(f"OK2|key present: {bool(k)} (length {len(k)})", flush=True)
if k:
    try:
        with urllib.request.urlopen(f"https://api.the-odds-api.com/v4/sports?apiKey={k}", timeout=60) as r:
            body = json.loads(r.read())
            print(f"OK2|http {r.status} | remaining {r.headers.get('x-requests-remaining')} | used {r.headers.get('x-requests-used')} | "
                  f"basketball_nba listed: {any(s.get('key') == 'basketball_nba' for s in body)}", flush=True)
    except urllib.error.HTTPError as e:
        print(f"OK2|http {e.code} {e.read()[:200]!r}", flush=True)
