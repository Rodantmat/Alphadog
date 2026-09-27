#!/usr/bin/env python3
"""
Chalkboard API probe (2026-09-27). The owner's mitmproxy capture gave us the app's whole HTTP surface on a
cold start EXCEPT the priced board - yet pre-validate, on the same host, answers unauthenticated. So the
host is NOT pinned and the board endpoint is simply one we have not seen. This walks the API's route space
from a real network and reports what answers.

Read-only. No credentials are sent - if an endpoint needs auth we want to SEE the 401; that is the finding.
"""
import json
import os

from curl_cffi import requests

BASE = "https://kube-prod.chalkboard.io"
CDN = "https://cdn.chalkboard.io"
UA = {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)", "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9", "Origin": "https://chalkboard.io"}
# THE GATEWAY BLOCKS DATACENTER IPs (2026-09-27): the first probe run got 403 with a 9-byte "Forbidden"
# on EVERY path, including endpoints the app calls successfully - so it is the edge refusing GitHub's
# runner, not a missing route. Same reason the board scrapers carry PROXY_URL. Each request is tried
# direct first, then through the proxy.
PROXY = os.environ.get("PROXY_URL", "").strip()
PROXIES = {"https": PROXY, "http": PROXY} if PROXY else None

KNOWN = [
    "/v2/sports-api/api/ppo-league-blocking-config",
    "/v2/dfs/users/allowed-market-types",
    "/v2/dfs/api/pool/types",
    "/v2/recommendation-api/recommendations",
    "/v2/sports-api/api/wnba-player-details/07bea9c1-80ca-47e0-9b19-26f1bbe8168f",
]

LEAGUES = ["wnba", "nba", "nfl"]
SPORTS_SUFFIX = ["markets", "picks", "board", "lines", "props", "player-props", "games", "matches",
                 "schedule", "events", "player-markets", "available-markets", "market-lines",
                 "players", "teams", "slate", "slates", "offerings"]
FLAT = [
    "/v2/dfs/markets", "/v2/dfs/api/markets", "/v2/dfs/picks", "/v2/dfs/board", "/v2/dfs/lines",
    "/v2/dfs/api/picks", "/v2/dfs/api/board", "/v2/dfs/api/lines", "/v2/dfs/offerings",
    "/v2/markets", "/v2/picks", "/v2/board", "/v2/lines",
    "/v2/sports-api/api/markets", "/v2/sports-api/api/leagues", "/v2/sports-api/api/sports",
    "/v2/sports-api/api/config", "/v2/sports-api/api/health", "/v2/sports-api/api",
    "/v2/recommendation-api/promo-card/area/all?mode=all",
    "/packs/packs?includeUngraded=true",
]
CDN_PATHS = ["/leagues/wnba/board.json", "/leagues/wnba/markets.json", "/leagues/wnba/picks.json",
             "/leagues/wnba/lines.json", "/leagues/wnba.json", "/config/leagues.json"]


def probe(s, url, method="GET", body=None):
    """Direct first, then through the residential proxy. Returns (code, size, note, route)."""
    last = (None, 0, "no attempt", "-")
    for route, px in (("direct", None), ("proxy", PROXIES)):
        if route == "proxy" and not PROXIES:
            continue
        try:
            r = (s.post(url, headers=UA, json=body, timeout=30, impersonate="chrome124", proxies=px) if method == "POST"
                 else s.get(url, headers=UA, timeout=30, impersonate="chrome124", proxies=px))
        except Exception as exc:  # noqa: BLE001
            last = (None, 0, f"ERROR {str(exc)[:60]}", route)
            continue
        txt = r.text or ""
        last = (r.status_code, len(txt), txt[:160].replace("\n", " "), route)
        if r.status_code == 200:
            return last
    return last


def main():
    s = requests.Session()
    print("=" * 100)
    print("KNOWN ENDPOINTS (does the probe reach the API the way the app does?)")
    for p in KNOWN:
        code, n, note = probe(s, BASE + p)
        print(f"  {str(code):>5}  {n:>7}b  {p}")
        if p.endswith("ppo-league-blocking-config") and code == 200:
            full = s.get(BASE + p, headers=UA, impersonate="chrome124").text
            print("      CONFIG HEAD:", full[:1800])

    print("\n" + "=" * 100)
    print("ROUTE WALK (200 = live endpoint; 401/403 = exists but needs auth; 404 = no route)")
    hits = []
    for lg in LEAGUES:
        for suf in SPORTS_SUFFIX:
            p = f"/v2/sports-api/api/{lg}-{suf}"
            code, n, note = probe(s, BASE + p)
            if code != 404:
                hits.append((code, n, p, note))
                print(f"  {str(code):>5}  {n:>7}b  {p}   {note[:90]}")
    for p in FLAT:
        code, n, note = probe(s, BASE + p)
        if code != 404:
            hits.append((code, n, p, note))
            print(f"  {str(code):>5}  {n:>7}b  {p}   {note[:90]}")

    print("\n" + "=" * 100)
    print("CDN (a board served as static JSON would live here)")
    for p in CDN_PATHS:
        code, n, note = probe(s, CDN + p)
        if code != 404:
            print(f"  {str(code):>5}  {n:>7}b  {p}   {note[:90]}")

    print("\n" + "=" * 100)
    print(f"NON-404 ROUTES FOUND: {len(hits)}")
    for code, n, p, _ in sorted(hits, key=lambda x: -x[1])[:25]:
        print(f"  {str(code):>5}  {n:>7}b  {p}")


if __name__ == "__main__":
    main()
