#!/usr/bin/env python3
"""
Betr probe v12 (2026-09-28). Research + evidence converge: the fantasy GraphQL gateway almost certainly
authenticates via an HttpOnly cookie that DevTools "Copy as cURL" OMITS (browser 200 / server 401 with the
identical bearer; 401 in ~40ms before the query; no visible cookie). This probe:
  1. refreshes, capturing ANY Set-Cookie from the Keycloak token endpoint,
  2. GETs picks.betr.app/ and api.fantasy.betr.app root to see if a session cookie is set on page/app load,
  3. replays the GraphQL with cookies from a shared session jar (so any Set-Cookie is carried),
  4. prints all response Set-Cookie headers so we see the cookie name the gateway wants.
Read-only. Secrets from env.
"""
import json
import os

from curl_cffi import requests

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
GQL = "https://api.fantasy.betr.app/graphql"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")
CAP = os.environ.get("BETR_ACCESS_TOKEN", "")
MINQ = ('query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) '
        '{ ...on TeamVersusEvent { id __typename } __typename } }')


def show_cookies(r, tag):
    sc = [v for k, v in r.headers.multi_items()] if hasattr(r.headers, "multi_items") else []
    setc = r.headers.get("set-cookie")
    print(f"  [{tag}] status={r.status_code} set-cookie={'YES: ' + setc[:120] if setc else 'none'}")


def main():
    s = requests.Session()  # shared cookie jar
    # 1. refresh - does Keycloak set a cookie?
    r = s.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT,
                         "scope": "openid profile email offline_access"},
               headers={"content-type": "application/x-www-form-urlencoded"}, impersonate="chrome124", timeout=30)
    show_cookies(r, "kc token")
    tok = r.json().get("access_token") if r.status_code == 200 else None
    tok = CAP or tok
    print("  cookies in jar after token:", list(s.cookies.keys()) if hasattr(s, "cookies") else "n/a")

    base_h = {"origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
              "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}

    # 2. hit the SPA origin and the fantasy root WITH the bearer - maybe a session cookie is issued here
    for url in ("https://picks.betr.app/", "https://api.fantasy.betr.app/", "https://api.fantasy.betr.app/health"):
        try:
            rr = s.get(url, headers={**base_h, "authorization": "Bearer " + tok} if tok else base_h,
                       impersonate="chrome124", timeout=25)
            show_cookies(rr, "GET " + url)
        except Exception as exc:  # noqa: BLE001
            print("  GET", url, "ERR", str(exc)[:50])

    # 3. a Keycloak "userinfo" / session hit sometimes mints the app cookie
    try:
        ui = s.get("https://account.betr.app/realms/betr/protocol/openid-connect/userinfo",
                   headers={"authorization": "Bearer " + tok}, impersonate="chrome124", timeout=25)
        show_cookies(ui, "userinfo")
    except Exception as exc:  # noqa: BLE001
        print("  userinfo ERR", str(exc)[:50])

    # 4. now GraphQL with the SAME session (any cookie gathered above is carried)
    H = {**base_h, "authorization": "Bearer " + tok, "content-type": "application/json", "channel": "MOBILE_WEB",
         "accept": "application/graphql-response+json, application/graphql+json, application/json",
         "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9", "jurisdiction": "CA",
         "promotions-api-version": "6.0"}
    g = s.post(GQL, headers=H, data=json.dumps({"operationName": "LeagueUpcomingEvents", "query": MINQ,
               "variables": {"league": "WNBA"}}), impersonate="chrome124", timeout=30)
    print(f"\n  GraphQL WITH shared-session cookies: {g.status_code}  {(g.text or '')[:160]}")
    print("  final jar:", list(s.cookies.keys()) if hasattr(s, "cookies") else "n/a")


if __name__ == "__main__":
    main()
