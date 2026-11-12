#!/usr/bin/env python3
"""
PROBE - FLIFF PICK'EM FLEX MAP (owner 2026-11-12 14:38 PT: "Fliff also has flex ... map it definitely"). READ-ONLY: only the app's own QUOTE
request (FCM__Skipper_Get_Parlay_Plus_Quote__Request, mode 70002) is sent - never a Place_ / cashout class. No login.
For 2..6 picks of main-line NBA selections (different games first, then same-game) it prints the FULL answer fields: eu_coeff (Max),
eu_flex_play_coeff (Flex), us_*; the per-pick decimal multipliers; and any other payout fields the answer carries (flex tiers / super flex).
Several random pick sets per size so the Flex price can be fitted against the picks' own multipliers (Max = their product).
"""
import json, os, random, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fliff_pickem_quote as P
from fliff_client import FliffClient  # noqa: E402 (path set by the imported module)


def main():
    fc = FliffClient(proxy=P.PROXY)
    fc.ping()
    host = fc.ping_data.get("skipper_public_feed_endpoint")
    st, t = P.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetLeagues__Request"})
    nba = None
    for lg in json.loads(t)["result"]["response"]["collections"]["page"]:
        if str(lg.get("abbreviation")).upper() == "NBA" or str(lg.get("name")).upper() == "NBA":
            nba = lg["id"]
    st, t = P.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetGames__Request", "variables": {"filter": {"league": nba}}})
    games = list(dict.fromkeys(re.findall(r'"(fobj__conflict_event__\d+)"', t)))[:10]
    print("NBA", nba, "games", games, flush=True)
    sels = []
    for g in games:
        st, t = P.raw(fc, host, {"__object_class_name": "FCM__Skipper_GetCards__Request",
                                 "variables": {"filter": {"league": nba, "games": [g], "prop_categories": []}}})
        try:
            resp = json.loads(t)["result"]["response"]
        except Exception:  # noqa: BLE001
            continue
        for pk in resp.get("cards_packs") or []:
            for cd in pk.get("cards") or []:
                for o in ((cd.get("betting_options") or {}).get("options") or []):
                    if o.get("option_type") in (0, 1) and o.get("is_main_line") and o.get("proposal_fkey"):
                        sels.append({"game": g, "card": cd.get("card_name"), "o": o})
    print("selections", len(sels), flush=True)
    rng = random.Random(7)
    by_game = {}
    for s in sels:
        by_game.setdefault(s["game"], []).append(s)
    gl = [g for g in by_game if by_game[g]]
    first = True
    for n in (2, 3, 4, 5, 6):
        for trial in range(6):
            if len(gl) >= n:
                pick = [rng.choice(by_game[g]) for g in rng.sample(gl, n)]       # n different games
            else:
                pick = rng.sample(sels, min(n, len(sels)))
            if len({x["o"]["proposal_fkey"] for x in pick}) < n:
                continue
            obj = {"__object_class_name": "FCM__Skipper_Get_Parlay_Plus_Quote__Request",
                   "proposal_fkeys": [x["o"]["proposal_fkey"] for x in pick],
                   "proposal_fkey_to_conflict_fkey": {x["o"]["proposal_fkey"]: x["game"] for x in pick}, "mode": 70002}
            code, t = P.raw(fc, host, obj)
            dec = [x["o"].get("eu_odds") for x in pick]
            try:
                resp = json.loads(t)["result"]["response"]
                fields = {k: resp.get(k) for k in resp if k != "quotes" and k != "picks"}
                print(f"\nN={n} trial={trial} HTTP {code} picks' eu_odds={dec}\n  answer fields: {json.dumps(fields, default=str)[:1200]}", flush=True)
                if first:
                    print("  FULL FIRST ANSWER:", t[:4000], flush=True); first = False
            except Exception:  # noqa: BLE001
                print(f"\nN={n} trial={trial} HTTP {code} picks' eu_odds={dec}\n  RAW {t[:900]}", flush=True)
            time.sleep(0.5)


if __name__ == "__main__":
    main()
