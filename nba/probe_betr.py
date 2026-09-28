#!/usr/bin/env python3
"""
Betr probe v14 (2026-09-28). Wall = fantasy gateway validates live session, and the browser keeps stealing
the shared session's live token. FIX ATTEMPT with no capture: the offline refresh token can bootstrap a
BRAND-NEW session the browser never touches. Try, in order, to obtain a token in an independent session and
hit the board:
  1. plain refresh (baseline)
  2. refresh, then immediately hit the board within the same second (minimise the window the browser can win)
  3. two chained refreshes (a refresh often rotates the session; use the LATEST token)
  4. device/auth login via Keycloak Direct Access is blocked by MFA, skip.
Also: try the board on the api.betr.app host prefix in case the fantasy op is proxied there too, and try
the GraphQL GET form (Apollo persisted-query style) which some gateways treat differently.
Read-only. Secrets from env.
"""
import base64
import json
import os
import time

from curl_cffi import requests

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
GQL = "https://api.fantasy.betr.app/graphql"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")
MINQ = ('query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) '
        '{ ...on TeamVersusEvent { id __typename } __typename } }')
H_BASE = {"accept": "application/graphql-response+json, application/graphql+json, application/json",
          "content-type": "application/json", "channel": "MOBILE_WEB", "fantasy-api-version": "16.0",
          "fantasy-application-version": "3.42.9", "jurisdiction": "CA", "promotions-api-version": "6.0",
          "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}


def refresh(rt):
    r = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": rt},
                      headers={"content-type": "application/x-www-form-urlencoded"}, impersonate="chrome124", timeout=30)
    if r.status_code != 200:
        return None, None
    j = r.json()
    return j.get("access_token"), j.get("refresh_token", rt)


def sid(tok):
    p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
    return json.loads(base64.urlsafe_b64decode(p)).get("sid")


def board(tok, proxied=False):
    r = requests.post(GQL, headers={**H_BASE, "authorization": "Bearer " + tok},
                      data=json.dumps({"operationName": "LeagueUpcomingEvents", "query": MINQ,
                                       "variables": {"league": "WNBA"}}), impersonate="chrome124", timeout=30)
    return r.status_code, (r.text or "")[:120]


def main():
    # 1. baseline
    t1, r1 = refresh(RT)
    print("refresh1 sid:", sid(t1) if t1 else None, "| board:", board(t1) if t1 else "no token")

    # 2. refresh then hit instantly
    t2, r2 = refresh(r1 or RT)
    print("refresh2 sid:", sid(t2) if t2 else None, "| board immediately:", board(t2) if t2 else "no token")

    # 3. chain a few refreshes, always use the newest (rotation may spawn a session the browser isn't on)
    rt = r2 or RT
    for i in range(3):
        t, rt = refresh(rt)
        if not t:
            print(f"chain {i}: refresh failed"); break
        st, body = board(t)
        print(f"chain {i}: sid={sid(t)} board={st} {body[:70]}")
        if st == 200:
            print("   *** SUCCESS ***", body); return
        time.sleep(1)

    # 4. the fantasy op via the api.betr.app host (some gateways proxy graphql there)
    for host in ("https://api.betr.app/graphql", "https://api.betr.app/fantasy/graphql",
                 "https://picks.betr.app/graphql"):
        try:
            r = requests.post(host, headers={**H_BASE, "authorization": "Bearer " + (t2 or t1)},
                              data=json.dumps({"operationName": "LeagueUpcomingEvents", "query": MINQ,
                                               "variables": {"league": "WNBA"}}), impersonate="chrome124", timeout=25)
            print(f"host {host}: {r.status_code} {(r.text or '')[:70]}")
        except Exception as exc:  # noqa: BLE001
            print(f"host {host}: ERR {str(exc)[:40]}")


if __name__ == "__main__":
    main()
