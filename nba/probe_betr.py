#!/usr/bin/env python3
"""
Betr probe v17 (2026-09-28). PROXY_URL confirmed US RESIDENTIAL (Comcast, California, hosting:false).
Still 401. So it's residential-IP PLUS something. Test, all THROUGH the residential proxy:
  A. jurisdiction matched to the proxy's actual state (California) - CA/US
  B. add the header set the app sends that we may have under-mirrored (x-tenant, x-client, apollographql
     operation headers, betr-* variants) - discovery by trying plausible ones and reading the 401 body deltas
  C. GET with Apollo persisted-query extensions (some gateways only accept the persisted hash, reject ad-hoc)
  D. hit the SAME query the Apify actor implies is public - try the operation with NO extra app headers at all
Read-only. Secrets from env.
"""
import json
import os

from curl_cffi import requests

GQL = "https://api.fantasy.betr.app/graphql"
PROXY = os.environ.get("PROXY_URL", "").strip()
PROXIES = {"https": PROXY, "http": PROXY} if PROXY else None
MINQ = ('query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) '
        '{ ...on TeamVersusEvent { id date __typename } __typename } }')
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"


def post(tag, headers, body=None):
    b = body or json.dumps({"operationName": "LeagueUpcomingEvents", "query": MINQ, "variables": {"league": "WNBA"}})
    try:
        r = requests.post(GQL, headers=headers, data=b, proxies=PROXIES, timeout=30, impersonate="chrome124")
        print(f"  {tag:<40} {r.status_code}  {(r.text or '')[:130].replace(chr(10),' ')}")
        return r
    except Exception as exc:  # noqa: BLE001
        print(f"  {tag:<40} ERR {str(exc)[:50]}")
        return None


def getq(tag, headers):
    try:
        r = requests.get(GQL, headers=headers, params={"query": MINQ, "operationName": "LeagueUpcomingEvents",
                         "variables": json.dumps({"league": "WNBA"})}, proxies=PROXIES, timeout=30, impersonate="chrome124")
        print(f"  {tag:<40} {r.status_code}  {(r.text or '')[:130].replace(chr(10),' ')}")
    except Exception as exc:  # noqa: BLE001
        print(f"  {tag:<40} ERR {str(exc)[:50]}")


base = {"accept": "application/graphql-response+json, application/graphql+json, application/json",
        "content-type": "application/json", "origin": "https://picks.betr.app",
        "referer": "https://picks.betr.app/", "user-agent": UA}
app = {**base, "channel": "MOBILE_WEB", "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9",
       "promotions-api-version": "6.0"}


def main():
    print("via residential proxy (Comcast/CA):")
    post("A jurisdiction=CA", {**app, "jurisdiction": "CA"})
    post("A jurisdiction=US", {**app, "jurisdiction": "US"})
    post("A no jurisdiction", app)
    post("D minimal (no app headers)", base)
    getq("C GET jurisdiction=CA", {**app, "jurisdiction": "CA"})
    # B: try extra headers the JS bundle might send
    for extra in ({"apollographql-client-name": "betr-web"}, {"x-tenant": "betr"}, {"x-client": "picks"},
                  {"betr-platform": "web"}, {"x-betr-jurisdiction": "CA"}, {"graphql-require-preflight": "true"}):
        post("B " + ",".join(extra), {**app, "jurisdiction": "CA", **extra})


if __name__ == "__main__":
    main()
