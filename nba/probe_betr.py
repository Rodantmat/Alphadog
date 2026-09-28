#!/usr/bin/env python3
"""
Betr probe v5 (2026-09-27): LIVE Ably subscribe. History was empty because markets are pushed on
subscribe/attach, not stored. This opens a real Ably realtime connection with the app's own token flow,
attaches to candidate channels for one event, and prints whatever the server pushes - so we learn the
real channel name AND the market/prop message shape (including alternate lines).
Read-only. Secrets from env.
"""
import asyncio
import json
import os

from curl_cffi import requests
from ably import AblyRealtime

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
API = "https://api.betr.app"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")


def refresh():
    r = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT},
                      headers={"content-type": "application/x-www-form-urlencoded"}, timeout=30, impersonate="chrome124")
    return r.json()["access_token"] if r.status_code == 200 else None


def ably_token(access):
    H = {"authorization": "Bearer " + access, "accept": "application/json",
         "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/", "content-length": "0"}
    ws = requests.post(API + "/api/v3/auth/user/ws-token-request", headers=H, timeout=25, impersonate="chrome124").json()
    body = {k: ws[k] for k in ("ttl", "capability", "clientId", "timestamp", "keyName", "nonce", "mac") if k in ws}
    tr = requests.post(f"https://main.realtime.ably.net/keys/{ws['keyName']}/requestToken",
                       headers={"content-type": "application/json"}, data=json.dumps(body), timeout=25, impersonate="chrome124")
    return tr.json().get("token"), ws.get("clientId")


async def run():
    access = refresh()
    if not access:
        print("no access token"); return
    ev = requests.get(API + "/api/v3/events?league_ids=1",
                      headers={"authorization": "Bearer " + access, "accept": "application/json",
                               "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/"},
                      timeout=25, impersonate="chrome124").json()
    events = ev.get("data") if isinstance(ev, dict) else ev
    eids = [str(e.get("id")) for e in (events or []) if isinstance(e, dict)]
    print("events:", len(eids), eids[:6])

    token, client_id = ably_token(access)
    if not token:
        print("no ably token"); return
    print("ably token OK, clientId", client_id)

    seen = {}
    def on_msg(ch):
        def _cb(m):
            seen.setdefault(ch, 0)
            seen[ch] += 1
            if seen[ch] <= 2:
                data = m.data
                s = json.dumps(data) if not isinstance(data, str) else data
                print(f"\n>>> {ch}  name={m.name}  ({len(s)}b)\n{s[:1600]}", flush=True)
        return _cb

    rt = AblyRealtime(token=token)
    await rt.connection.once_async("connected")
    print("connected to Ably")

    e0 = eids[0]
    channels = [f"event:{e0}", f"market:{e0}", f"fixture:{e0}", f"event:{e0}:markets",
                "market:*", f"public:event:{e0}", "league:1", "public:*"]
    for ch in channels:
        try:
            c = rt.channels.get(ch)
            await c.subscribe(on_msg(ch))
            print("subscribed:", ch)
        except Exception as exc:  # noqa: BLE001
            print("subscribe failed:", ch, str(exc)[:60])

    # also try attaching (some feeds push a snapshot on attach, not as a message)
    await asyncio.sleep(25)
    print("\nMESSAGE COUNTS BY CHANNEL:", seen)
    await rt.close()


if __name__ == "__main__":
    asyncio.run(run())
