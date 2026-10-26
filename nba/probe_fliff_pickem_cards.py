#!/usr/bin/env python3
"""
PROBE - FLIFF PICK'EM NBA BOARD STRUCTURE (2026-10-26; owner 14:22 PT: Fliff option 2 "deploy that"). Public feed only, no login:
prop categories (id -> name), games, and the full JSON of the first cards of one game - so the board capture can name each card's
player, stat, line and the Over / Under multipliers. Read-only. Env: PROXY_URL.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fliff_pickem_quote as Q  # noqa: E402


def main():
    fc = Q.FliffClient(proxy=Q.PROXY)
    fc.ping()
    host = fc.ping_data.get("skipper_public_feed_endpoint")
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetLeagues__Request"})
    nba = None
    for lg in json.loads(t)["result"]["response"]["collections"]["page"]:
        if str(lg.get("abbreviation")).upper() == "NBA" or str(lg.get("name")).upper() == "NBA":
            nba = lg["id"]
    print("NBA league:", nba, flush=True)
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetPropCategories__Request", "variables": {"filter": {"league": nba}}})
    print("\nPROP CATEGORIES:", t[:4000], flush=True)
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetGames__Request", "variables": {"filter": {"league": nba}}})
    print("\nGAMES:", t[:3000], flush=True)
    games = list(dict.fromkeys(re.findall(r'"(fobj__conflict_event__\d+)"', t)))
    st, t = Q.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetCards__Request",
                             "variables": {"filter": {"league": nba, "games": games[:1], "prop_categories": []}}})
    j = json.loads(t)["result"]["response"]
    print("\nCARDS response keys:", list(j.keys()), flush=True)
    packs = j.get("cards_packs") or []
    print("packs:", len(packs), "| pack keys:", list(packs[0].keys()) if packs else None, flush=True)
    n = 0
    for pk in packs:
        print("\nPACK (no cards):", json.dumps({k: v for k, v in pk.items() if k != "cards"}, default=str)[:1500], flush=True)
        for cd in pk.get("cards") or []:
            print("\nCARD:", json.dumps(cd, default=str)[:3000], flush=True)
            n += 1
            if n >= 3:
                break
        if n >= 3:
            break
    for k, v in j.items():
        if k != "cards_packs":
            print(f"\nOTHER {k}:", json.dumps(v, default=str)[:2500], flush=True)


if __name__ == "__main__":
    main()
