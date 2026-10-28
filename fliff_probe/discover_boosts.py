#!/usr/bin/env python3
"""FLIFF PROBE - BOOSTED OFFER SCAN (read-only, public Pick'Em feed, no account; 2026-10-28).

Fliff's web bundle has boosted offers (is_boosted, boost_multiplier_in_percents, r_boosted_offer_limits, a "Boosted" tab) and
per-league / per-category has_boosted_offers flags. This walks every league -> games -> prop categories and pulls the cards of any
category flagged as boosted (plus categories whose name says Boost), keeping every option that carries a boost-like field.
Output: fliff_probe/out/discovery_boosts.json
"""
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fliff_client import FliffClient  # noqa: E402

OUT = HERE / "out"
MAX_CALLS = int(os.environ.get("BOOST_MAX_CALLS", "400"))


def boosty(o, path="", acc=None):
    acc = acc if acc is not None else []
    if isinstance(o, dict):
        if any(("boost" in k.lower() and v not in (None, False, 0, "", [], {})) for k, v in o.items()):
            acc.append({"path": path, "obj": {k: (v if not isinstance(v, (dict, list)) else "...") for k, v in o.items()}})
        for k, v in o.items():
            boosty(v, path + "/" + k, acc)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            boosty(v, path + f"[{i}]", acc)
    return acc


def main():
    fc = FliffClient(proxy=os.environ.get("PROXY_URL", "").strip() or None)
    fc.ping()
    host = fc.ping_data.get("skipper_public_feed_endpoint")
    calls = 0
    rep = {"leagues": [], "boosted_categories": [], "boost_objects": [], "errors": []}

    def req(cls, variables=None):
        nonlocal calls
        calls += 1
        obj = {"__object_class_name": cls}
        if variables is not None:
            obj["variables"] = variables
        j = fc._post(host, obj)
        time.sleep(0.25)
        return ((j.get("result") or {}).get("response")) or {}

    lg = req("FCM__Skipper_GetLeagues__Request")
    rep["boost_objects"] += [dict(b, where="leagues") for b in boosty(lg)][:50]
    leagues = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("kind") == "LEAGUE" and o.get("id"):
                leagues.append({k: o.get(k) for k in ("id", "display_name", "has_boosted_offers")})
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(lg)
    rep["leagues"] = leagues
    print("leagues:", json.dumps(leagues)[:3000], flush=True)
    for L in leagues:
        if calls > MAX_CALLS:
            break
        try:
            gm = req("FCM__Skipper_GetGames__Request", {"filter": {"league": L["id"]}})
        except Exception as e:  # noqa: BLE001
            rep["errors"].append(f"games {L['id']}: {e}"[:300]); continue
        games = []

        def gwalk(o):
            if isinstance(o, dict):
                if "id" in o and "home_team" in o:
                    games.append(o)
                for v in o.values():
                    gwalk(v)
            elif isinstance(o, list):
                for v in o:
                    gwalk(v)
        gwalk(gm)
        rep["boost_objects"] += [dict(b, where=f"games {L['display_name']}") for b in boosty(gm)][:30]
        for g in games[:12]:
            if calls > MAX_CALLS:
                break
            try:
                cats = req("FCM__Skipper_GetPropCategories__Request", {"filter": {"league": L["id"], "games": [g["id"]], "in_play": False}})
            except Exception as e:  # noqa: BLE001
                rep["errors"].append(f"cats {g['id']}: {e}"[:300]); continue
            clist = (((cats or {}).get("prop_categories") or {}).get("page")) or []
            for c in clist:
                name = str(c.get("name") or c.get("card_name") or "")
                if c.get("has_boosted_offers") or "boost" in name.lower():
                    rep["boosted_categories"].append({"league": L["display_name"], "game": g["id"], "category": c.get("id"), "name": name})
                    try:
                        cards = req("FCM__Skipper_GetCards__Request", {"filter": {"league": L["id"], "games": [g["id"]], "prop_categories": [c.get("id")]}})
                        rep["boost_objects"] += [dict(b, where=f"cards {L['display_name']} {g['id']} {name}") for b in boosty(cards)][:80]
                        rep.setdefault("boosted_cards_raw", []).append(json.dumps(cards)[:15000])
                    except Exception as e:  # noqa: BLE001
                        rep["errors"].append(f"cards {g['id']}: {e}"[:300])
    rep["calls"] = calls
    print("calls", calls, "| boosted categories:", len(rep["boosted_categories"]), "| boost objects:", len(rep["boost_objects"]), flush=True)
    print(json.dumps(rep["boosted_categories"][:40])[:3000], flush=True)
    (OUT / "discovery_boosts.json").write_text(json.dumps(rep, indent=1, default=str))


if __name__ == "__main__":
    main()
