#!/usr/bin/env python3
"""
Betr probe v4 (2026-09-27). REST gives events but the markets/props arrive over Ably (every /markets REST
path 500s "no session"; the ws capability is market:* event:* fixture:*). This mints the Ably token the way
the web app does (ws-token-request) and then uses Ably's SSE endpoint to SUBSCRIBE briefly to candidate
channels for one event, printing the first messages so we learn the real channel name and the prop shape.
Read-only. Secrets from env.
"""
import json
import os
import time

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
    events = ev.get("data") if isinstance(ev, dict) else ev
    eid = str((events or [{}])[0].get("id"))
    print("event:", eid, "events on board:", len(events or []))

    # Mint the Ably token request payload exactly as the app does.
    ws = requests.post(API + "/api/v3/auth/user/ws-token-request", headers={**H, "content-length": "0"},
                       timeout=25, impersonate="chrome124").json()
    key_name = ws.get("keyName"); client_id = ws.get("clientId")
    print("ably keyName:", key_name, "clientId:", client_id)

    # Exchange for an Ably token via requestToken (the app hits main.realtime.ably.net/keys/<keyName>/requestToken).
    tr = requests.post(f"https://main.realtime.ably.net/keys/{key_name}/requestToken",
                       headers={"content-type": "application/json", "accept": "application/json"},
                       data=json.dumps({k: ws[k] for k in ("ttl", "capability", "clientId", "timestamp", "keyName", "nonce", "mac") if k in ws}),
                       timeout=25, impersonate="chrome124")
    print("requestToken:", tr.status_code, tr.text[:120].replace("\n", " "))
    if tr.status_code >= 300:
        return
    ably_token = tr.json().get("token")

    # Ably REST: read channel history / presence to discover the live channels and the message shape.
    AH = {"authorization": "Bearer " + ably_token, "accept": "application/json"}
    for ch in [f"event:{eid}", f"market:{eid}", f"fixture:{eid}",
               f"event:{eid}:markets", f"public:event:{eid}", f"market:nba", "public:nba"]:
        # history returns recently published messages on the channel
        u = f"https://main.realtime.ably.net/channels/{requests.utils.quote(ch, safe='')}/messages?limit=3"
        try:
            r = requests.get(u, headers=AH, timeout=20, impersonate="chrome124")
        except Exception as exc:  # noqa: BLE001
            print(f"  ERR {ch} {str(exc)[:50]}"); continue
        note = (r.text or "")[:400].replace("\n", " ")
        print(f"  {r.status_code}  {len(r.text or ''):>7}b  {ch}   {note}")


if __name__ == "__main__":
    main()
