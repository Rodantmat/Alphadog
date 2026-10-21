#!/usr/bin/env python3
"""FLIFF PROBE - PICK'EM (SKIPPER) API DISCOVERY (read-only; 2026-10-21 00:10 PT).

Request classes and variables read from Fliff's own web bundle (discovery_bundle.json, chunk 12s8vparda3ah.js):
  FCM__Skipper_GetLeagues__Request        (no variables)
  FCM__Skipper_GetGames__Request          variables {filter:{league:<league id>}}
  FCM__Skipper_GetPropCategories__Request variables {filter:{league, games:[gameId], in_play:false}}
  FCM__Skipper_GetCards__Request          variables {filter:{league, games:[gameId], prop_categories:[statId] or []}}
  FCM__Skipper_GetAltCards__Request       variables {skipper_area_key:<key>}   <- the ladder
  FCM__Skipper_GetChefChoices__Request    (no variables)
All sent to the ping's skipper_public_feed_endpoint (the herald feed answers them 30503 'unknown invocation').
Writes fliff_probe/out/discovery_skipper.json with trimmed samples of every reply.
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
OUT.mkdir(parents=True, exist_ok=True)


def trim(o, depth=0, n=4):
    if depth > 7:
        return "..."
    if isinstance(o, dict):
        return {k: trim(v, depth + 1, n) for k, v in list(o.items())[:50]}
    if isinstance(o, list):
        return [trim(v, depth + 1, n) for v in o[:n]] + ([f"... +{len(o) - n}"] if len(o) > n else [])
    if isinstance(o, str) and len(o) > 300:
        return o[:300] + "..."
    return o


def find_keys(o, want, acc=None, path=""):
    acc = acc if acc is not None else {}
    if isinstance(o, dict):
        for k, v in o.items():
            if k in want and not isinstance(v, (dict, list)):
                acc.setdefault(k, []).append((path + "/" + k, v))
            find_keys(v, want, acc, path + "/" + k)
    elif isinstance(o, list):
        for i, v in enumerate(o[:200]):
            find_keys(v, want, acc, path + f"[{i}]")
    return acc


def main():
    fc = FliffClient(proxy=os.environ.get("PROXY_URL", "").strip() or None)
    fc.ping()
    host = fc.ping_data.get("skipper_public_feed_endpoint")
    rep = {"skipper_host": host}
    print("skipper host:", host, flush=True)

    def call(obj, label):
        try:
            j = fc._post(host, obj)
        except Exception as exc:  # noqa: BLE001
            rep[label] = {"error": str(exc)[:400]}
            print(label, "ERROR", str(exc)[:300], flush=True)
            return None
        resp = ((j.get("result") or {}).get("response")) or j
        rep[label] = trim(resp)
        print(label, "OK top keys:", list(resp.keys())[:20] if isinstance(resp, dict) else type(resp).__name__, flush=True)
        return resp

    lg = call({"__object_class_name": "FCM__Skipper_GetLeagues__Request"}, "leagues")
    nba_id = None
    if lg:
        hits = find_keys(lg, {"id", "name", "short_name", "code", "slug", "title", "abbreviation"})
        rep["league_fields"] = {k: v[:40] for k, v in hits.items()}
        txt = json.dumps(lg)
        # find a league object whose any text field says NBA
        def walk(o):
            nonlocal nba_id
            if isinstance(o, dict):
                vals = " ".join(str(v) for v in o.values() if isinstance(v, (str, int)))
                if nba_id is None and "id" in o and ("NBA" in vals.split() or '"NBA"' in json.dumps(o)[:400]) and "WNBA" not in vals:
                    nba_id = o["id"]
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(lg)
        rep["nba_league_id"] = nba_id
        print("NBA league id:", nba_id, "| leagues text sample:", txt[:600], flush=True)
    if nba_id is None:
        (OUT / "discovery_skipper.json").write_text(json.dumps(rep, indent=1, default=str))
        return
    gm = call({"__object_class_name": "FCM__Skipper_GetGames__Request", "variables": {"filter": {"league": nba_id}}}, "games")
    game_id = None
    if gm:
        ids = find_keys(gm, {"id", "game_id", "start_time", "starts_at", "home", "away", "name", "title"})
        rep["game_fields"] = {k: v[:20] for k, v in ids.items()}
        def first_game(o):
            if isinstance(o, dict):
                if "id" in o and any(k in o for k in ("start_time", "starts_at", "scheduled", "home_team", "home", "teams", "away_team")):
                    return o["id"]
                for v in o.values():
                    r = first_game(v)
                    if r is not None:
                        return r
            elif isinstance(o, list):
                for v in o:
                    r = first_game(v)
                    if r is not None:
                        return r
            return None
        game_id = first_game(gm)
        rep["game_id_used"] = game_id
        print("game id:", game_id, flush=True)
    cats = call({"__object_class_name": "FCM__Skipper_GetPropCategories__Request",
                 "variables": {"filter": {"league": nba_id, "games": [game_id] if game_id else [], "in_play": False}}}, "prop_categories")
    cards = call({"__object_class_name": "FCM__Skipper_GetCards__Request",
                  "variables": {"filter": {"league": nba_id, "games": [game_id] if game_id else [], "prop_categories": []}}}, "cards")
    area = None
    if cards:
        hits = find_keys(cards, {"skipper_area_key", "area_key", "eu_odds", "eu_coeff", "line", "value", "player_name", "name",
                                 "stat", "prop_category", "multiplier", "has_alts", "has_alt", "alt_count", "proposal_fkey"})
        rep["card_fields"] = {k: v[:25] for k, v in hits.items()}
        if hits.get("skipper_area_key"):
            area = hits["skipper_area_key"][0][1]
        rep["cards_raw_sample"] = json.dumps(cards)[:20000]
    rep["area_key_used"] = area
    if area:
        alt = call({"__object_class_name": "FCM__Skipper_GetAltCards__Request", "variables": {"skipper_area_key": area}}, "alt_cards")
        if alt:
            rep["alt_raw_sample"] = json.dumps(alt)[:20000]
    call({"__object_class_name": "FCM__Skipper_GetChefChoices__Request"}, "chef_choices")
    (OUT / "discovery_skipper.json").write_text(json.dumps(rep, indent=1, default=str))
    print("wrote discovery_skipper.json", flush=True)


if __name__ == "__main__":
    main()
