#!/usr/bin/env python3
"""Does The Odds API return deep links for Underdog (owner 2026-11-07)? One event, one market, regions=us_dfs, includeLinks + includeSids. READ-ONLY, ~2 credits. The key is never printed."""
import os, json, urllib.request, urllib.parse, urllib.error
import psycopg
_c = psycopg.connect(os.environ["DATABASE_URL"])
KEYS = {n: (_c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s", (n,)).fetchone() or [""])[0].strip() for n in ("odds_api_key_nba", "odds_api_key")}
KEY = ""
for _n, _k in KEYS.items():
    try:
        urllib.request.urlopen("https://api.the-odds-api.com/v4/sports/?" + urllib.parse.urlencode({"apiKey": _k}), timeout=30).read()
        print("key", _n, "WORKS"); KEY = _k; break
    except urllib.error.HTTPError as _e:
        print("key", _n, "HTTP", _e.code, _e.read()[:120].decode("utf8", "replace"))
if not KEY: raise SystemExit("no working Odds API key")
B = "https://api.the-odds-api.com/v4"
def get(path, **q):
    q["apiKey"] = KEY
    try:
        r = urllib.request.urlopen(f"{B}{path}?{urllib.parse.urlencode(q)}", timeout=40)
    except urllib.error.HTTPError as ex:
        print('HTTP', ex.code, ex.read()[:300].decode('utf8', 'replace'), {k: v for k, v in ex.headers.items() if k.lower().startswith('x-requests')}); raise SystemExit(1)
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
