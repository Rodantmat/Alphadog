#!/usr/bin/env python3
"""
Betr discovery probe v2 (2026-09-27). v1 proved: refresh_token -> access_token headless (no MFA), and
/api/v3/leagues returns nba = league id "1" with live events; /api/v3/events demands league_ids. This
finds the board: events for league 1, then the markets (player props with lines) for an event.
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
    if r.status_code != 200:
        print("refresh failed", r.status_code, r.text[:200]); return None
    return r.json()["access_token"]


def get(H, p):
    try:
        r = requests.get(API + p, headers=H, timeout=25, impersonate="chrome124")
        return r
    except Exception as exc:  # noqa: BLE001
        print(f"  ERR {p} {str(exc)[:60]}"); return None


def main():
    tok = refresh()
    if not tok:
        return
    H = {"authorization": "Bearer " + tok, "accept": "application/json",
         "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
         "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}

    # 1) events for nba (league 1)
    print("EVENTS for league 1 (nba):")
    variants = ["/api/v3/events?league_ids=1", "/api/v3/events?league_ids[]=1",
                "/api/v3/events?league_ids=1&status=upcoming", "/api/v3/events?leagueIds=1"]
    ev_doc = None
    for p in variants:
        r = get(H, p)
        if r is None:
            continue
        print(f"  {r.status_code}  {len(r.text or ''):>8}b  {p}   {(r.text or '')[:100].replace(chr(10),' ')}")
        if r.status_code == 200 and ev_doc is None:
            try:
                ev_doc = r.json()
            except Exception:  # noqa: BLE001
                pass

    # pull a few event ids
    eids = []
    if ev_doc:
        data = ev_doc.get("data") if isinstance(ev_doc, dict) else ev_doc
        for e in (data or [])[:3]:
            if isinstance(e, dict):
                eids.append(str(e.get("id")))
                print("   event:", e.get("id"), "|", e.get("name") or e.get("title") or "",
                      "| keys:", list(e.keys())[:14])

    # 2) markets for the first event - the player props with lines
    if eids:
        eid = eids[0]
        print(f"\nMARKETS for event {eid}:")
        mvariants = [f"/api/v3/events/{eid}/markets", f"/api/v3/markets?event_ids={eid}",
                     f"/api/v3/markets?event_ids[]={eid}", f"/api/v3/events/{eid}",
                     f"/api/v3/fixtures?event_ids={eid}", f"/api/v3/picks/markets?event_ids={eid}"]
        for p in mvariants:
            r = get(H, p)
            if r is None:
                continue
            print(f"  {r.status_code}  {len(r.text or ''):>8}b  {p}")
            if r.status_code == 200 and len(r.text or "") > 200:
                try:
                    j = r.json()
                    d = j.get("data") if isinstance(j, dict) else j
                    print("     sample:", json.dumps(d[0] if isinstance(d, list) and d else j)[:1000])
                except Exception:  # noqa: BLE001
                    print("     (non-json or empty)")


if __name__ == "__main__":
    main()
