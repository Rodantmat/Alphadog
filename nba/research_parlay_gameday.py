#!/usr/bin/env python3
"""RESEARCH (2026-11-01, owner: "Probe the parlay api, your access is pulling it wrong ... probe until figured out").

The 10-19 probes that concluded "ParlayAPI carries only DraftKings / FanDuel milestones / Bovada for NBA props" ran the DAY BEFORE
opening night, when most books had not posted props. Every live window since (10-21 .. 10-31) still shows only DK + Bovada + FD
milestones in the stored captures - but the capture only reads per book AFTER a truncated full read, and only the history's spellings.
This probe is READ-ONLY (no table writes) on a LIVE GAME DAY and asks every way the API offers:
  1. /bookmakers registry and /sports
  2. /sports/basketball_nba/props per book for every registry key + every spelling we know (betmgm, caesars, williamhill_us, ...)
  3. the same with include_live=false and with regions=us,us2
  4. event-level odds (Odds-API shape) for today's first events with player markets, all books and books named explicitly
  5. every FanDuel / DraftKings market key and how many are two-sided
Never prints the key. ~3 credits per data call (budget ~60 calls)."""
import json
import os
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo

import urllib.error
import urllib.parse
import urllib.request

import psycopg

BASE = "https://parlay-api.com/v1"
SPORT = "basketball_nba"
with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    KEY = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='parlay_api_key'").fetchone()[0].strip()
H = {"X-API-Key": KEY, "accept": "application/json", "User-Agent": "alphadog"}
TODAY = datetime.now(ZoneInfo("America/New_York")).date().isoformat()


def get(path, params=None, label=None, timeout=180):
    url = f"{BASE}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=timeout)
        status, body, hd = r.status, r.read(), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as exc:
        status, body, hd = exc.code, exc.read(), {k.lower(): v for k, v in exc.headers.items()}
    except Exception as exc:  # noqa: BLE001
        print(f"[{label or path}] EXC {type(exc).__name__}: {str(exc)[:120]}", flush=True)
        return 0, None, {}
    shown = {k: hd[k] for k in ("x-requests-remaining", "x-requests-last", "x-result-truncated", "x-result-has-more", "x-result-row-count") if k in hd}
    txt = body.decode("utf-8", "replace")
    print(f"[{label or path}] http {status} {shown} {'' if status == 200 else txt[:300].replace(KEY, '***')}", flush=True)
    try:
        return status, json.loads(txt), hd
    except Exception:  # noqa: BLE001
        return status, None, hd


def rows_of(doc):
    if isinstance(doc, list):
        return doc
    if isinstance(doc, dict):
        return doc.get("data") or doc.get("props") or []
    return []


def summarize(items, title):
    items = rows_of(items)
    if not items:
        print(f"   {title}: 0 rows", flush=True)
        return
    bk = Counter(str(x.get("bookmaker")) for x in items)
    two = Counter(str(x.get("bookmaker")) for x in items if x.get("under_price") not in (None, "") and x.get("over_price") not in (None, ""))
    pos = Counter(str(x.get("bookmaker")) for x in items if str(x.get("line")) not in ("0", "0.0", "None", ""))
    dates = Counter(str(x.get("commence_time"))[:10] for x in items)
    print(f"   {title}: {len(items)} rows | by book {dict(bk)} | two-sided {dict(two)} | line>0 {dict(pos)} | commence dates {dict(dates)}", flush=True)
    keys = Counter((str(x.get("bookmaker")), str(x.get("market_key"))) for x in items)
    print("      markets: " + ", ".join(f"{b}:{m} x{n}" for (b, m), n in keys.most_common(14)), flush=True)
    ex = next((x for x in items if x.get("under_price") not in (None, "")), items[0])
    print("      sample: " + json.dumps({k: ex.get(k) for k in ("bookmaker", "market", "market_key", "player", "line", "over_price", "under_price", "commence_time", "period", "is_dfs_flat_payout")}), flush=True)
    print("      fields: " + ", ".join(sorted(ex.keys())), flush=True)


print(f"== ParlayAPI game-day probe, slate {TODAY} ET ==", flush=True)
# 1) registry
st, reg, _ = get("/bookmakers", label="bookmakers")
reg_keys = []
for b in rows_of(reg) if not isinstance(reg, dict) or not reg.get("bookmakers") else reg["bookmakers"]:
    if isinstance(b, dict):
        reg_keys.append(str(b.get("key") or b.get("id") or b.get("name")))
        print("     " + json.dumps(b, sort_keys=True)[:260], flush=True)
    elif isinstance(b, str):
        reg_keys.append(b)
print(f"   registry keys ({len(reg_keys)}): {reg_keys}", flush=True)
get("/sports", label="sports")

# 2) per-book props
known = ["draftkings", "fanduel", "betmgm", "caesars", "williamhill_us", "williamhill", "betrivers", "bovada", "betonlineag", "betonline",
         "fanatics", "bet365", "hardrock", "hardrockbet", "espnbet", "ballybet", "betparx", "parx", "pinnacle", "novig", "prophetx", "circa",
         "fliff", "mybookieag", "lowvig", "betus", "kalshi", "polymarket"]
books = list(dict.fromkeys(known + [k for k in reg_keys if k not in known]))
for b in books:
    st, doc, hd = get(f"/sports/{SPORT}/props", {"bookmakers": b, "limit": 10000}, label=f"props {b}")
    if st == 200:
        summarize(doc, b)

# 3) the full read with the documented knobs
for extra, lab in ((({"include_live": "false"}), "include_live=false"), (({"regions": "us,us2"}), "regions=us,us2"),
                   (({"bookmakers": "betmgm,caesars,fanatics,betrivers", "include_live": "false"}), "4 missing books, pregame")):
    st, doc, hd = get(f"/sports/{SPORT}/props", {"limit": 10000, **extra}, label=f"props {lab}")
    if st == 200:
        summarize(doc, lab)

# 4) event-level odds (Odds API shape)
st, ev, _ = get(f"/sports/{SPORT}/events", label="events")
todays = [e for e in rows_of(ev) if isinstance(e, dict)]
todays = [e for e in todays if str(e.get("commence_time", ""))[:10] in (TODAY, (datetime.fromisoformat(TODAY).date().fromordinal(datetime.fromisoformat(TODAY).toordinal() + 1)).isoformat())][:3]
for e in todays:
    print(f"   event {e.get('id')} {e.get('away_team')} @ {e.get('home_team')} {e.get('commence_time')}", flush=True)
for e in todays[:2]:
    for params, lab in (({"regions": "us,us2", "markets": "player_points,player_rebounds,player_assists", "oddsFormat": "american"}, "regions us,us2"),
                        ({"bookmakers": "betmgm,williamhill_us,caesars,betrivers,fanatics,betonlineag,fanduel", "markets": "player_points", "oddsFormat": "american"}, "books named")):
        st, eo, _ = get(f"/sports/{SPORT}/events/{e.get('id')}/odds", params, label=f"event odds {lab}")
        if isinstance(eo, dict):
            for b in eo.get("bookmakers") or []:
                ms = {}
                for m in b.get("markets") or []:
                    outs = m.get("outcomes") or []
                    ms[m.get("key")] = (len(outs), sum(1 for o in outs if o.get("name") == "Under"))
                print(f"     {str(b.get('key')):16s} {ms}", flush=True)
        elif eo is not None:
            print("     " + str(eo)[:300], flush=True)

# 5) sport-level Odds-API shape with a player market
st, od, _ = get(f"/sports/{SPORT}/odds", {"regions": "us", "markets": "player_points", "oddsFormat": "american"}, label="sport odds player_points")
if isinstance(od, list):
    c = Counter(b.get("key") for e in od for b in (e.get("bookmakers") or []) for m in (b.get("markets") or []) if m.get("key") == "player_points")
    print(f"   sport-level player_points books: {dict(c)}", flush=True)

# 6) FanDuel market keys
st, doc, _ = get(f"/sports/{SPORT}/props", {"bookmakers": "fanduel", "limit": 10000, "include_live": "false"}, label="fanduel all keys")
it = rows_of(doc)
c = Counter((str(x.get("market_key")), str(x.get("market"))[:40], x.get("under_price") not in (None, "")) for x in it)
for (k, m, two), n in c.most_common(40):
    print(f"      fanduel {k:34s} {m:40s} two-sided={two} x{n}", flush=True)
print("DONE", flush=True)
