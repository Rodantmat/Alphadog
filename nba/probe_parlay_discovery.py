#!/usr/bin/env python3
"""PROBE (2026-10-19, owner 14:16 PT: "the prop lines ... we get from parlay API. So it should be there. Maybe you're not probing
right"). Read-only discovery of ParlayAPI for NBA: (1) the bookmaker registry and sport list; (2) the Odds-API-style endpoints
(/sports/{sport}/odds, /events, /events/{id}/odds with player markets) to see which books price NBA player props there;
(3) per-book props reads for EVERY sportsbook key in the registry (not only the history's spellings); (4) FanDuel by market.
Never prints a key or a URL query string. ~3 credits per data call."""
import json
import os
import sys
from collections import Counter

import psycopg
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
BASE = "https://parlay-api.com/v1"
with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    KEY = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key'").fetchone()[0].strip()
S = requests.Session()
H = {"X-API-Key": KEY, "accept": "application/json", "User-Agent": "alphadog"}


def get(path, params=None, label=None):
    """-> (status, json-or-None, headers). Header auth first; on 401/403 retry once with apiKey as a query parameter."""
    p = dict(params or {})
    try:
        r = S.get(f"{BASE}{path}", params=p, headers=H, timeout=90)
        if r.status_code in (401, 403):
            p["apiKey"] = KEY
            r = S.get(f"{BASE}{path}", params=p, headers={"accept": "application/json"}, timeout=90)
    except Exception as exc:  # noqa: BLE001
        print(f"[{label or path}] EXC {type(exc).__name__}", flush=True)
        return 0, None, {}
    try:
        j = r.json()
    except Exception:  # noqa: BLE001
        j = None
    hd = {k.lower(): v for k, v in r.headers.items() if k.lower().startswith("x-")}
    hd = {k: v for k, v in hd.items() if "key" not in k}
    shown = {k: v for k, v in hd.items() if k in ("x-requests-remaining", "x-requests-used", "x-requests-last", "x-result-truncated", "x-result-row-count", "x-result-has-more")}
    body = "" if r.status_code == 200 else (r.text or "")[:240].replace(KEY, "***")
    print(f"[{label or path}] http {r.status_code} {shown} {body}", flush=True)
    return r.status_code, j, hd


def summarize_props(items, title):
    if not isinstance(items, list):
        print(f"   {title}: not a list ({type(items).__name__}) {str(items)[:300]}", flush=True); return
    bk = Counter(x.get("bookmaker") for x in items)
    two = Counter(x.get("bookmaker") for x in items if x.get("under_price") not in (None, ""))
    mk = Counter((x.get("bookmaker"), x.get("market_key")) for x in items)
    print(f"   {title}: {len(items)} rows; by book {dict(bk)}; two-sided by book {dict(two)}", flush=True)
    for (b, m), n in sorted(mk.items(), key=lambda kv: -kv[1])[:40]:
        print(f"      {b:14s} {m:40s} {n}", flush=True)


# 1) registry
st, j, _ = get("/bookmakers", label="bookmakers")
books = []
if isinstance(j, (list, dict)):
    lst = j if isinstance(j, list) else (j.get("data") or j.get("bookmakers") or [])
    for b in lst:
        if isinstance(b, dict):
            books.append(b)
    print(f"   registry: {len(books)} entries", flush=True)
    for b in books:
        print("     ", json.dumps(b, sort_keys=True)[:300], flush=True)
st, j, _ = get("/sports", label="sports")
if isinstance(j, list):
    print("   sports:", [s.get("key") for s in j if "basketball" in str(s.get("key"))], flush=True)

# 2) Odds-API style endpoints
st, ev, _ = get("/sports/basketball_nba/events", label="events")
ev_ids = []
if isinstance(ev, list):
    for e in ev[:20]:
        print(f"   event {e.get('id')} {e.get('away_team')} @ {e.get('home_team')} {e.get('commence_time')}", flush=True)
    ev_ids = [e.get("id") for e in ev if str(e.get("commence_time", "")).startswith("2026-10-20") or str(e.get("commence_time", "")).startswith("2026-10-21T01")]
st, od, _ = get("/sports/basketball_nba/odds", {"regions": "us", "markets": "h2h,spreads,totals", "oddsFormat": "american"}, label="odds game lines")
if isinstance(od, list):
    print(f"   game-line events {len(od)}; books on first: {[b.get('key') for b in (od[0].get('bookmakers') or [])] if od else []}", flush=True)
st, od2, _ = get("/sports/basketball_nba/odds", {"regions": "us", "markets": "player_points", "oddsFormat": "american"}, label="odds player_points (sport level)")
for eid in ev_ids[:1]:
    st, eo, _ = get(f"/sports/basketball_nba/events/{eid}/odds",
                    {"regions": "us,us2,us_dfs", "markets": "player_points,player_points_alternate,player_rebounds,player_assists", "oddsFormat": "american"},
                    label="event odds player markets")
    if isinstance(eo, dict):
        for b in eo.get("bookmakers") or []:
            ms = {m.get("key"): len(m.get("outcomes") or []) for m in b.get("markets") or []}
            print(f"     {b.get('key'):16s} {ms}", flush=True)

# 3) per-book props for every registry sportsbook key
keys = sorted({str(b.get("key") or b.get("id") or b.get("name")) for b in books if b})
for k in keys:
    st, items, hd = get("/sports/basketball_nba/props", {"bookmakers": k, "limit": 10000}, label=f"props {k}")
    if st == 200 and isinstance(items, list) and items:
        two = sum(1 for x in items if x.get("under_price") not in (None, ""))
        mks = Counter(x.get("market_key") for x in items).most_common(8)
        print(f"   {k}: {len(items)} rows, two-sided {two}, top markets {mks}", flush=True)

# 4) FanDuel and DraftKings narrowed by market
for b in ("fanduel", "draftkings"):
    for m in ("player_points", "player_points_alternate", "player_points_over_under", "player_rebounds", "player_threes"):
        st, items, hd = get("/sports/basketball_nba/props", {"bookmakers": b, "markets": m, "limit": 10000}, label=f"props {b} markets={m}")
        if st == 200 and isinstance(items, list):
            two = sum(1 for x in items if x.get("under_price") not in (None, ""))
            ex = next((x for x in items if x.get("under_price") not in (None, "")), items[0] if items else None)
            print(f"   {len(items)} rows, two-sided {two}; example {json.dumps({k: ex.get(k) for k in ('market', 'market_key', 'player', 'line', 'over_price', 'under_price')}) if ex else None}", flush=True)
