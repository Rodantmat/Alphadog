#!/usr/bin/env python3
"""
Betr probe v3 (2026-09-27). events?league_ids=1 works (Pistons@Celtics etc). Markets endpoint shape is
the last unknown - flat /markets 500s. Try the event-scoped and category-scoped shapes, and check whether
the full board (markets inline) comes from events with an include/expand param.
Read-only. Secrets from env.
"""
import json
import os

from curl_cffi import requests

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
API = "https://api.betr.app"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")


def refresh():
    r = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT},
                      headers={"content-type": "application/x-www-form-urlencoded"}, timeout=30, impersonate="chrome124")
    return r.json()["access_token"] if r.status_code == 200 else None


def main():
    tok = refresh()
    if not tok:
        print("no token"); return
    H = {"authorization": "Bearer " + tok, "accept": "application/json",
         "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
         "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}

    ev = requests.get(API + "/api/v3/events?league_ids=1", headers=H, timeout=25, impersonate="chrome124").json()
    data = ev.get("data") if isinstance(ev, dict) else ev
    eid = str((data or [{}])[0].get("id"))
    print("event:", eid)

    cands = [
        f"/api/v3/events/{eid}/markets",
        f"/api/v3/events/{eid}/market-categories",
        f"/api/v3/events/{eid}/markets?category=player-props",
        f"/api/v3/events/{eid}?include=markets",
        f"/api/v3/events/{eid}?expand=markets",
        f"/api/v3/events/{eid}/sgp-markets",
        f"/api/v3/markets?event_id={eid}",
        f"/api/v3/market-categories?event_id={eid}",
        f"/api/v3/events/{eid}/player-props",
        f"/api/v3/picks/events/{eid}/markets",
        f"/api/v3/pickem/markets?event_id={eid}",
        f"/api/v3/pickem/events/{eid}/markets",
        f"/api/v3/dfs/events/{eid}/markets",
        f"/api/v3/events/{eid}/props",
        f"/api/v3/events/{eid}/selections",
        f"/api/v3/events?league_ids=1&include=markets",
    ]
    for p in cands:
        try:
            r = requests.get(API + p, headers=H, timeout=25, impersonate="chrome124")
        except Exception as exc:  # noqa: BLE001
            print(f"  ERR {p} {str(exc)[:50]}"); continue
        if r.status_code == 404:
            continue
        note = (r.text or "")[:130].replace("\n", " ")
        print(f"  {r.status_code}  {len(r.text or ''):>8}b  {p}   {note}")
        if r.status_code == 200 and len(r.text or "") > 500:
            try:
                j = r.json()
                d = j.get("data") if isinstance(j, dict) else j
                first = d[0] if isinstance(d, list) and d else d
                print("     KEYS:", list(first.keys()) if isinstance(first, dict) else type(first).__name__)
                print("     SAMPLE:", json.dumps(first)[:1400])
            except Exception:  # noqa: BLE001
                pass


if __name__ == "__main__":
    main()
