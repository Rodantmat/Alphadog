#!/usr/bin/env python3
"""
Betr probe v9 (2026-09-28): the fantasy GraphQL 401s the refreshed token though api.betr.app accepts it.
Test WHY, in order of likelihood:
  A. replay the CAPTURED browser token (acr:1, mfa) verbatim -> if it 200s, the refreshed acr:0 token is the problem
  B. token exchange for a fantasy audience (grant_type=urn:...:token-exchange) -> the standard way an app
     gets a service-specific token without redoing MFA
  C. refresh with audience / different scopes
Read-only. Secrets: BETR_REFRESH_TOKEN, BETR_CLIENT_ID, BETR_ACCESS_TOKEN (the captured browser token).
"""
import json
import os

from curl_cffi import requests

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
GQL = "https://api.fantasy.betr.app/graphql"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")
CAPTURED = os.environ.get("BETR_ACCESS_TOKEN", "")
PROXY = os.environ.get("PROXY_URL", "").strip()
PROXIES = {"https": PROXY, "http": PROXY} if PROXY else None

MINQ = ('query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) '
        '{ ...on TeamVersusEvent { id __typename } __typename } }')


def gql(tok, league="WNBA", proxied=False):
    H = {"authorization": "Bearer " + tok,
         "accept": "application/graphql-response+json, application/graphql+json, application/json, text/event-stream",
         "accept-language": "en-US,en;q=0.9", "content-type": "application/json", "channel": "MOBILE_WEB",
         "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9", "jurisdiction": "CA",
         "promotions-api-version": "6.0", "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
         "priority": "u=1, i", "sec-ch-ua": '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
         "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"', "sec-fetch-dest": "empty",
         "sec-fetch-mode": "cors", "sec-fetch-site": "same-site",
         "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}
    r = requests.post(GQL, headers=H, data=json.dumps({"operationName": "LeagueUpcomingEvents",
                      "query": MINQ, "variables": {"league": league}}), timeout=40, impersonate="chrome124",
                      proxies=(PROXIES if proxied else None))
    return r.status_code, (r.text or "")[:150]


def acr_of(tok):
    import base64
    p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
    d = json.loads(base64.urlsafe_b64decode(p))
    return d.get("acr"), d.get("mfa"), d.get("aud")


def post_token(data):
    r = requests.post(KC, data=data, headers={"content-type": "application/x-www-form-urlencoded"},
                      timeout=30, impersonate="chrome124")
    return r.status_code, r


def main():
    print("PROXY set:", bool(PROXIES))
    tok = CAPTURED or None
    if not tok:
        st, r = post_token({"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT,
                            "scope": "openid profile email offline_access"})
        tok = r.json()["access_token"] if st == 200 else None
    if not tok:
        print("no token"); return
    print("token acr/aud:", acr_of(tok))
    H = {"authorization": "Bearer " + tok,
         "accept": "application/graphql-response+json, application/graphql+json, application/json, text/event-stream",
         "accept-language": "en-US,en;q=0.9", "content-type": "application/json", "channel": "MOBILE_WEB",
         "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9", "jurisdiction": "CA",
         "promotions-api-version": "6.0", "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
         "priority": "u=1, i", "sec-ch-ua": '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
         "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"', "sec-fetch-dest": "empty",
         "sec-fetch-mode": "cors", "sec-fetch-site": "same-site",
         "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}
    body = json.dumps({"operationName": "LeagueUpcomingEvents", "query": MINQ, "variables": {"league": "WNBA"}})
    for imp in ("chrome124", "chrome120", "chrome116", "chrome110", "chrome131", "chrome133a",
                "safari17_0", "safari18_0", "edge101", "edge99"):
        for proxied in (False, True) if PROXIES else (False,):
            try:
                r = requests.post(GQL, headers=H, data=body, timeout=30, impersonate=imp,
                                  proxies=(PROXIES if proxied else None))
                tag = f"{imp}{'+proxy' if proxied else ''}"
                print(f"  {tag:<20} {r.status_code}  {(r.text or '')[:70]}")
                if r.status_code == 200:
                    print("   *** SUCCESS ***", (r.text or "")[:200])
            except Exception as exc:  # noqa: BLE001
                print(f"  {imp}{'+proxy' if proxied else ''}: ERR {str(exc)[:50]}")


if __name__ == "__main__":
    main()
