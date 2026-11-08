#!/usr/bin/env python3
"""Does The Odds API return deep links for Underdog (owner 2026-11-07)? One event, one market, regions=us_dfs, includeLinks + includeSids. READ-ONLY, ~2 credits. The key is never printed."""
import os, json, urllib.request, urllib.parse
KEY = os.environ.get("ODDS_API_KEY", "")
if not KEY: raise SystemExit("no ODDS_API_KEY in this run")
B = "https://api.the-odds-api.com/v4"
def get(path, **q):
    q["apiKey"] = KEY
    r = urllib.request.urlopen(f"{B}{path}?{urllib.parse.urlencode(q)}", timeout=40)
    return json.loads(r.read()), {k: v for k, v in r.headers.items() if k.lower().startswith("x-requests")}
ev, h = get("/sports/basketball_nba/events"); print("events", len(ev), h)
ev.sort(key=lambda e: e["commence_time"])
e = ev[0]; print("event", e["id"], e["away_team"], "@", e["home_team"], e["commence_time"])
for books, mk in (("underdog", "player_points"), ("underdog", "player_points_alternate")):
    try:
        d, h = get(f"/sports/basketball_nba/events/{e['id']}/odds", regions="us_dfs", bookmakers=books, markets=mk, oddsFormat="american", includeLinks="true", includeSids="true")
    except Exception as ex:
        print(books, mk, "ERROR", ex); continue
    print("\n==", books, mk, h, "bookmakers", [b["key"] for b in d.get("bookmakers", [])])
    for b in d.get("bookmakers", []):
        print(" bookmaker keys", sorted(b.keys()), "link:", b.get("link"), "sid:", b.get("sid"))
        for m in b.get("markets", [])[:1]:
            print(" market keys", sorted(m.keys()), "link:", m.get("link"), "sid:", m.get("sid"))
            for o in m.get("outcomes", [])[:4]:
                print("  outcome", json.dumps(o)[:420])
