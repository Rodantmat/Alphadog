#!/usr/bin/env python3
"""
PROBE - does the Odds API's Underdog feed report Underdog's REAL per-pick pricing? (strategy doc §30s)

The NBA history says Underdog mains were 1.00x in every month of both seasons - but that history is the Odds API feed
(price -137 = 1.00x). Underdog's own app fields TODAY price lopsided mains (MLB, §30r). If the Odds API shows 1.00x on mains
that the app prices at the same moment, then "mains always 1.00" is a FEED ARTIFACT, not Underdog's behaviour, and the
historical modifiers of mains cannot be taken at face value.

Method (same moment, same games): (1) Underdog's MLB board via our own scraper (nba/scrape_underdog_board.py) - per side
fantasy probability, sportsbook probability, Underdog's payout_multiplier; (2) the Odds API event odds for the same games,
regions=us_dfs, bookmakers=underdog, includeMultipliers=true - price and multiplier; matched on player / stat / line / side.
Reported per match: app modifier (0.5 / fantasy prob, and Underdog's own payout_multiplier) vs Odds API (multiplier field and
decimal(price) / sqrt(3)). Cost: ~10 credits x markets per event, PROBE_MAX_EVENTS events (default 3).
Env: DATABASE_URL, ODDS_KEY_NAME (odds_api_key_nba), PROBE_MAX_EVENTS (3).
"""
import json
import math
import os
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

import psycopg
import requests

BASE = "https://api.the-odds-api.com/v4"
MARKETS = {"pitcher_strikeouts": "strikeouts", "batter_hits": "hits", "batter_total_bases": "total bases"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


def app_board():
    out = Path(tempfile.mkdtemp())
    os.environ["UNDERDOG_SPORTS"] = "MLB"
    os.environ["UNDERDOG_OUT_DIR"] = str(out)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import scrape_underdog_board as S
    S.OUT = out
    S.main()
    doc = json.loads((out / "underdog_mlb_current.json").read_text())
    rows = {}
    for l in doc.get("ladder") or []:
        stat = (l.get("stat") or "").lower()
        mk = next((k for k, v in MARKETS.items() if stat == v), None)
        if not mk or l.get("line") is None:
            continue
        for side, pre in (("Over", "higher"), ("Under", "lower")):
            f = l.get(f"{pre}_prob_fantasy")
            if f in (None, ""):
                continue
            rows[(norm(l.get("player")), mk, float(l["line"]), side)] = {
                "is_main": l.get("is_main"), "fantasy": float(f), "sportsbook": l.get(f"{pre}_prob_sportsbook"),
                "ud_payout_multiplier": l.get(f"{pre}_multiplier_modifier_only"), "player": l.get("player")}
    return rows


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    key = str(conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key=%s",
                           (os.environ.get("ODDS_KEY_NAME") or "odds_api_key_nba",)).fetchone()[0]).strip()
    app = app_board()
    print(f"app board: {len(app)} sides on {len(MARKETS)} markets ({sum(1 for v in app.values() if v['is_main'])} on mains)", flush=True)
    evs = requests.get(f"{BASE}/sports/baseball_mlb/events?apiKey={key}", timeout=60).json()
    evs = sorted(evs, key=lambda e: e.get("commence_time", ""))[: int(os.environ.get("PROBE_MAX_EVENTS") or "3")]
    matches = []
    for ev in evs:
        r = requests.get(f"{BASE}/sports/baseball_mlb/events/{ev['id']}/odds?regions=us_dfs&bookmakers=underdog"
                         f"&markets={','.join(MARKETS)}&oddsFormat=american&includeMultipliers=true&apiKey={key}", timeout=60)
        print(f"  {ev.get('away_team')} @ {ev.get('home_team')} {ev.get('commence_time')} | credits remaining {r.headers.get('x-requests-remaining')}", flush=True)
        data = r.json()
        for bk in data.get("bookmakers") or []:
            for mk in bk.get("markets") or []:
                for oc in mk.get("outcomes") or []:
                    k = (norm(oc.get("description")), mk.get("key"), float(oc.get("point")), oc.get("name"))
                    a = app.get(k)
                    if not a:
                        continue
                    p = float(oc["price"]); dec = 1 + (p / 100 if p > 0 else 100 / -p)
                    matches.append({**a, "market": mk.get("key"), "line": k[2], "side": k[3], "oddsapi_price": p,
                                    "oddsapi_multiplier": oc.get("multiplier"), "oddsapi_m_from_price": round(dec / math.sqrt(3), 2),
                                    "app_m": round(0.5 / (a["fantasy"] / 100.0), 2)})
    print(f"\nmatched sides: {len(matches)}", flush=True)
    for grp, sel in (("MAINS priced by the app (fantasy != 50)", lambda m: m["is_main"] and m["fantasy"] != 50),
                     ("MAINS snapped by the app (fantasy = 50)", lambda m: m["is_main"] and m["fantasy"] == 50),
                     ("ALTERNATES", lambda m: not m["is_main"])):
        ms = [m for m in matches if sel(m)]
        if not ms:
            print(f"\n{grp}: none matched", flush=True); continue
        same = sum(1 for m in ms if abs((m["oddsapi_multiplier"] or m["oddsapi_m_from_price"]) - m["app_m"]) <= 0.02)
        feed_one = sum(1 for m in ms if abs((m["oddsapi_multiplier"] or m["oddsapi_m_from_price"]) - 1.0) <= 0.005)
        print(f"\n{grp}: {len(ms)} sides | Odds API agrees with the app within 0.02: {same} | Odds API shows 1.00x: {feed_one}", flush=True)
        for m in ms[:12]:
            print(f"   {m['player'][:22]:<22} {m['market']:<20} {m['line']:>4} {m['side']:<5} | app fantasy {m['fantasy']:>4.0f} -> m {m['app_m']:.2f} "
                  f"(UD payout_multiplier {m['ud_payout_multiplier']}) | Odds API price {m['oddsapi_price']:+.0f} mult {m['oddsapi_multiplier']} "
                  f"(price/sqrt3 {m['oddsapi_m_from_price']:.2f})", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
