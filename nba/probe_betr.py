#!/usr/bin/env python3
"""
Betr probe v6 (2026-09-27): live Ably subscribe, letting the SDK do the token exchange. v5 failed because
requestToken's MAC is bound to the exact ws-token-request body; re-posting it by hand is rejected. Instead
we give the Ably SDK an auth_callback that calls ws-token-request fresh each time and returns the TokenRequest
dict - the SDK then completes the handshake the way the app does. Prints whatever the channels push.
Read-only. Secrets from env.
"""
import asyncio
import json
import os

from curl_cffi import requests
from ably import AblyRealtime
from ably.types.tokendetails import TokenDetails

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
API = "https://api.betr.app"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")


def refresh():
    r = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT},
                      headers={"content-type": "application/x-www-form-urlencoded"}, timeout=30, impersonate="chrome124")
    return r.json()["access_token"] if r.status_code == 200 else None


ACCESS = None


def ws_token_request():
    """Return Betr's ws-token-request payload as an Ably TokenRequest dict (SDK feeds it to requestToken)."""
    global ACCESS
    H = {"authorization": "Bearer " + ACCESS, "accept": "application/json",
         "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/", "content-length": "0"}
    ws = requests.post(API + "/api/v3/auth/user/ws-token-request", headers=H, timeout=25, impersonate="chrome124").json()
    return {k: ws[k] for k in ("ttl", "capability", "clientId", "timestamp", "keyName", "nonce", "mac") if k in ws}


async def run():
    global ACCESS
    ACCESS = refresh()
    if not ACCESS:
        print("no access token"); return
    ev = requests.get(API + "/api/v3/events?league_ids=1",
                      headers={"authorization": "Bearer " + ACCESS, "accept": "application/json",
                               "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/"},
                      timeout=25, impersonate="chrome124").json()
    events = ev.get("data") if isinstance(ev, dict) else ev
    eids = [str(e.get("id")) for e in (events or []) if isinstance(e, dict)]
    print("events:", len(eids), eids[:6])

    async def auth_cb(params):
        # Ably calls this and expects a TokenRequest (dict) or TokenDetails; we return Betr's signed request.
        return ws_token_request()

    rt = AblyRealtime(auth_callback=auth_cb, client_id=None)
    await rt.connection.once_async("connected")
    print("connected to Ably")

    seen = {}

    def make_cb(ch):
        def _cb(m):
            seen[ch] = seen.get(ch, 0) + 1
            if seen[ch] <= 3:
                s = m.data if isinstance(m.data, str) else json.dumps(m.data)
                print(f"\n>>> {ch}  name={m.name}  ({len(s)}b)\n{s[:1800]}", flush=True)
        return _cb

    e0 = eids[0]
    for ch in [f"event:{e0}", f"market:{e0}", f"fixture:{e0}", f"event:{e0}:markets",
               f"public:event:{e0}", "league:1"]:
        try:
            c = rt.channels.get(ch)
            await c.subscribe(make_cb(ch))
            print("subscribed:", ch)
        except Exception as exc:  # noqa: BLE001
            print("subscribe failed:", ch, str(exc)[:80])

    await asyncio.sleep(25)
    print("\nMESSAGE COUNTS:", seen)
    await rt.close()


if __name__ == "__main__":
    asyncio.run(run())
