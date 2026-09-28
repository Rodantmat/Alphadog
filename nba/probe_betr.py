#!/usr/bin/env python3
"""
Betr probe v16 (2026-09-28). Board is anonymous; the only requirement is a US residential egress. Owner says
PROXY_URL is a US residential proxy. This checks:
  1. what IP/geo PROXY_URL actually presents as (ip-api) - is it US + residential/isp (not datacenter)?
  2. the anonymous Betr GraphQL through PROXY_URL - 200 = DONE.
  3. direct (no proxy) for contrast.
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
H = {"accept": "application/graphql-response+json, application/graphql+json, application/json",
     "content-type": "application/json", "channel": "MOBILE_WEB", "fantasy-api-version": "16.0",
     "fantasy-application-version": "3.42.9", "jurisdiction": "CA", "promotions-api-version": "6.0",
     "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
     "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}


def ipinfo(proxied):
    try:
        r = requests.get("http://ip-api.com/json/?fields=query,country,regionName,isp,org,mobile,proxy,hosting",
                         proxies=(PROXIES if proxied else None), timeout=25, impersonate="chrome124")
        return r.json()
    except Exception as exc:  # noqa: BLE001
        return {"err": str(exc)[:80]}


def board(proxied):
    try:
        r = requests.post(GQL, headers=H, data=json.dumps({"operationName": "LeagueUpcomingEvents",
                          "query": MINQ, "variables": {"league": "WNBA"}}),
                          proxies=(PROXIES if proxied else None), timeout=30, impersonate="chrome124")
        return r.status_code, (r.text or "")[:200]
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:80]


def main():
    print("PROXY_URL set:", bool(PROXIES))
    print("DIRECT  ip:", json.dumps(ipinfo(False)))
    if PROXIES:
        print("PROXY   ip:", json.dumps(ipinfo(True)))
    print("\nBetr board DIRECT:", board(False))
    if PROXIES:
        print("Betr board PROXY :", board(True))


if __name__ == "__main__":
    main()
