#!/usr/bin/env python3
"""
Betr probe v7 (2026-09-27): the auth+subscribe chain works but idle channels push nothing in 25s. The
board state is hydrated on ATTACH via rewind (Ably replays the last message to a new subscriber). This
attaches each candidate channel with rewind and also reads REST channel state, to capture the current
board snapshot and its shape (markets + alternate lines).
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
ACCESS = None


def refresh():
    r = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT},
                      headers={"content-type": "application/x-www-form-urlencoded"}, timeout=30, impersonate="chrome124")
    return r.json()["access_token"] if r.status_code == 200 else None


def ws_token_request(params=None):
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
    e0 = eids[0]
    print("events:", len(eids), "using", e0)

    async def auth_cb(params):
        return ws_token_request()

    rt = AblyRealtime(auth_callback=auth_cb)
    await rt.connection.once_async("connected")
    print("connected")

    got = {}

    def make_cb(ch):
        def _cb(m):
            got.setdefault(ch, [])
            if len(got[ch]) < 2:
                s = m.data if isinstance(m.data, str) else json.dumps(m.data)
                got[ch].append(s)
                print(f"\n>>> {ch}  name={m.name}  ({len(s)}b)\n{s[:2000]}", flush=True)
        return _cb

    # attach WITH REWIND so Ably replays the current state to us
    for ch in [f"event:{e0}", f"market:{e0}", f"fixture:{e0}", f"event:{e0}:markets", f"public:event:{e0}"]:
        try:
            c = rt.channels.get(ch, {"params": {"rewind": "1"}})
            await c.subscribe(make_cb(ch))
            print("subscribed(rewind):", ch)
        except Exception as exc:  # noqa: BLE001
            print("sub failed:", ch, str(exc)[:80])

    await asyncio.sleep(20)
    print("\nGOT:", {k: len(v) for k, v in got.items()})
    await rt.close()


if __name__ == "__main__":
    asyncio.run(run())
