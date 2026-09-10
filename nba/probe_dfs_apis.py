#!/usr/bin/env python3
"""Probe the public pick'em APIs (Underdog, Sleeper, Fliff) from the Actions runner: status, size, structure, odds-type/multiplier
fields, ladder depth - to design our own scrapers (like the PrizePicks producer). Prints only; commits nothing."""
import json
import os
import time
from collections import Counter

from curl_cffi import requests

proxy = os.environ.get("PROXY_URL", "").strip()
proxies = {"https": proxy, "http": proxy} if proxy else None
S = requests.Session()
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}


def get(url, headers=None, label=""):
    for use_proxy in (False, True):
        try:
            r = S.get(url, headers={**UA, **(headers or {})}, timeout=40, impersonate="chrome124", proxies=proxies if use_proxy else None)
            print(f"{label} {'proxy' if use_proxy else 'direct'}: {r.status_code} {len(r.content)} bytes")
            if r.status_code == 200:
                return r
        except Exception as exc:  # noqa: BLE001
            print(f"{label} {'proxy' if use_proxy else 'direct'}: EXC {exc}")
        if not proxy: break
    return None


print("=== UNDERDOG ===")
for url in ["https://api.underdogfantasy.com/beta/v6/over_under_lines", "https://api.underdogfantasy.com/beta/v5/over_under_lines", "https://api.underdogfantasy.com/v2/pickem_search/search_results?sport_id=MLB"]:
    r = get(url, {"client-type": "web", "client-version": "2026.09.01", "referer": "https://underdogfantasy.com/"}, "UD " + url.split("/")[-1][:40])
    if r:
        j = r.json(); print("  keys:", list(j.keys())[:12])
        oul = j.get("over_under_lines") or []
        print("  over_under_lines:", len(oul))
        if oul:
            x = oul[0]; print("  sample:", json.dumps(x)[:900])
            print("  status counts:", Counter(o.get("status") for o in oul).most_common(5))
            print("  options per line:", Counter(len(o.get("options", [])) for o in oul).most_common(5))
            mults = Counter(str(opt.get("payout_multiplier")) for o in oul for opt in o.get("options", []))
            print("  payout_multiplier values:", mults.most_common(12))
            sports = Counter((o.get("over_under") or {}).get("appearance_stat", {}).get("display_stat") for o in oul); print("  stats:", sports.most_common(15))
        for k in ("players", "appearances", "games", "solo_games"):
            if k in j: print(f"  {k}: {len(j[k])}")
        break
    time.sleep(1)

print("\n=== SLEEPER ===")
for url in ["https://api.sleeper.app/lines/available?dynamic=true", "https://api.sleeper.app/lines/available", "https://api.sleeper.app/v1/players/mlb"]:
    r = get(url, {"referer": "https://sleeper.com/"}, "SL " + url.split("app/")[-1][:40])
    if r:
        j = r.json()
        if isinstance(j, list):
            print("  lines:", len(j)); 
            if j: print("  sample:", json.dumps(j[0])[:900]); print("  sports:", Counter(x.get("sport") for x in j).most_common(8)); print("  wager_types:", Counter(x.get("wager_type") for x in j).most_common(8)); print("  options per line:", Counter(len(x.get("options", [])) for x in j).most_common(5)); print("  multipliers:", Counter(str(o.get("payout_multiplier")) for x in j for o in x.get("options", [])).most_common(12)); print("  status:", Counter(x.get("status") for x in j).most_common(5))
        else:
            print("  dict keys:", list(j.keys())[:10], "n=", len(j))
        if "players" in url: break
    time.sleep(1)

print("\n=== FLIFF (expect auth wall) ===")
for url in ["https://api.getfliff.com/v3/sports", "https://api.getfliff.com/v3/picks", "https://www.getfliff.com/api/sports"]:
    get(url, {"referer": "https://www.getfliff.com/"}, "FL " + url[-28:])
    time.sleep(1)
