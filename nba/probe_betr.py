#!/usr/bin/env python3
"""
Betr discovery probe (2026-09-27). We have: Keycloak refresh token (offline, never expires), client betr-rn,
and the app's REST host api.betr.app plus an Ably realtime feed. This probe:
  1. refresh_token -> access_token (proves the offline token works headless, no MFA, no browser)
  2. GET candidate REST board endpoints on api.betr.app with that access token
  3. calls ws-token-request to see the Ably capability (the board channels)
Read-only. Secrets come from env (BETR_REFRESH_TOKEN, BETR_CLIENT_ID); nothing is printed in full.
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
    print("refresh:", r.status_code)
    if r.status_code != 200:
        print("  body:", r.text[:300]); return None
    j = r.json()
    print("  got access_token, expires_in:", j.get("expires_in"), "refresh_expires_in:", j.get("refresh_expires_in"))
    return j["access_token"]


def main():
    if not RT:
        print("BETR_REFRESH_TOKEN not set"); return
    tok = refresh()
    if not tok:
        return
    H = {"authorization": "Bearer " + tok, "accept": "application/json",
         "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
         "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}

    print("\nREST candidates (200 with JSON = a board or config endpoint):")
    paths = [
        "/api/v3/fixtures", "/api/v3/markets", "/api/v3/events", "/api/v3/leagues",
        "/api/v3/picks/markets", "/api/v3/picks/fixtures", "/api/v3/dfs/markets", "/api/v3/dfs/fixtures",
        "/api/v3/sports", "/api/v3/sports/nba", "/api/v3/nba/markets", "/api/v3/nba/fixtures",
        "/api/v3/props", "/api/v3/player-props", "/api/v3/board", "/api/v3/picks/board",
        "/api/v2/fixtures", "/api/v2/markets", "/api/v3/catalog", "/api/v3/picks/catalog",
        "/api/v3/config", "/api/v3/leagues/nba/fixtures", "/api/v3/leagues/nba/markets",
    ]
    for p in paths:
        try:
            r = requests.get(API + p, headers=H, timeout=20, impersonate="chrome124")
        except Exception as exc:  # noqa: BLE001
            print(f"  ERR  {p}  {str(exc)[:50]}"); continue
        if r.status_code != 404:
            note = (r.text or "")[:120].replace("\n", " ")
            print(f"  {r.status_code}  {len(r.text or ''):>8}b  {p}   {note}")

    print("\nws-token-request (reveals the Ably board channels):")
    try:
        r = requests.post(API + "/api/v3/auth/user/ws-token-request", headers={**H, "content-length": "0"},
                          timeout=20, impersonate="chrome124")
        print("  status:", r.status_code)
        if r.status_code < 300:
            j = r.json()
            # print channel names / capability only, not the token
            for k in ("capability", "channels", "clientId"):
                if k in j:
                    print(f"  {k}:", json.dumps(j[k])[:400])
            print("  keys:", list(j.keys()))
    except Exception as exc:  # noqa: BLE001
        print("  ERR", str(exc)[:80])


if __name__ == "__main__":
    main()
