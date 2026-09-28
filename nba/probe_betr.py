#!/usr/bin/env python3
"""
Betr probe v15 (2026-09-28). BREAKTHROUGH LEAD: a commercial scraper (Apify Crawloop) advertises Betr Picks
"via public GraphQL. No login, US residential proxy." So the board is ANONYMOUS - the Authorization header
may be what triggers the 401 (a token the fantasy gateway does not accept), while NO token + a US IP works.
Test the anonymous path, direct and via proxy, with and without the extra app headers.
Read-only. Secrets from env.
"""
import json
import os

from curl_cffi import requests

GQL = "https://api.fantasy.betr.app/graphql"
PROXY = os.environ.get("PROXY_URL", "").strip()
PROXIES = {"https": PROXY, "http": PROXY} if PROXY else None
MINQ = ('query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) '
        '{ ...on TeamVersusEvent { id __typename } __typename } }')


def call(tag, headers, proxied=False):
    try:
        r = requests.post(GQL, headers=headers, data=json.dumps(
            {"operationName": "LeagueUpcomingEvents", "query": MINQ, "variables": {"league": "WNBA"}}),
            impersonate="chrome124", timeout=30, proxies=(PROXIES if proxied else None))
        print(f"  {tag:<38} {r.status_code}  {(r.text or '')[:110].replace(chr(10),' ')}")
        return r
    except Exception as exc:  # noqa: BLE001
        print(f"  {tag:<38} ERR {str(exc)[:50]}")
        return None


def main():
    print("PROXY set:", bool(PROXIES))
    full = {"accept": "application/graphql-response+json, application/graphql+json, application/json",
            "content-type": "application/json", "channel": "MOBILE_WEB", "fantasy-api-version": "16.0",
            "fantasy-application-version": "3.42.9", "jurisdiction": "CA", "promotions-api-version": "6.0",
            "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}
    minimal = {"content-type": "application/json", "origin": "https://picks.betr.app",
               "referer": "https://picks.betr.app/", "user-agent": full["user-agent"]}

    print("ANON (no Authorization):")
    call("full headers, direct", full)
    call("full headers, proxy", full, proxied=True)
    call("minimal headers, direct", minimal)
    call("minimal headers, proxy", minimal, proxied=True)
    call("app headers no jurisdiction, direct", {k: v for k, v in full.items() if k != "jurisdiction"})
    # a couple of jurisdictions in case CA (California) is geo-gated; try a few common DFS-legal states
    for j in ("NY", "TX", "FL", "GA", "OH"):
        call(f"jurisdiction={j}, proxy", {**full, "jurisdiction": j}, proxied=True)


if __name__ == "__main__":
    main()
