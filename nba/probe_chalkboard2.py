#!/usr/bin/env python3
"""
Chalkboard probe v2 (2026-09-27). v1 established: every route returns an identical 9-byte 403, direct AND
through the residential proxy, including paths the app calls successfully. So it is neither TLS pinning
nor IP reputation - something about the REQUEST is being refused. This identifies WHAT refuses it and
tests header hypotheses one at a time.

Read-only. No credentials.
"""
import json
import os

from curl_cffi import requests

BASE = "https://kube-prod.chalkboard.io"
CDN = "https://cdn.chalkboard.io"
# A path we KNOW the app fetched successfully, and a CDN asset we KNOW exists (both from the capture).
KNOWN_API = "/v2/sports-api/api/wnba-player-details/07bea9c1-80ca-47e0-9b19-26f1bbe8168f"
KNOWN_CDN = "/leagues/wnba/pickAssets/07bea9c1-80ca-47e0-9b19-26f1bbe8168f.png"

PROXY = os.environ.get("PROXY_URL", "").strip()
PROXIES = {"https": PROXY, "http": PROXY} if PROXY else None

VARIANTS = {
    "bare (no headers)": {},
    "curl-ish UA": {"User-Agent": "curl/8.4.0"},
    "iOS app UA": {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)"},
    "RN okhttp UA": {"User-Agent": "okhttp/4.9.2"},
    "iPhone Safari UA": {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"},
    "Safari UA + json accept": {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
                                 "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9"},
    "app UA + x-app-version": {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)", "x-app-version": "6.18.0",
                                "x-platform": "ios", "Accept": "application/json"},
    "app UA + origin": {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)", "Origin": "https://chalkboard.io",
                         "Referer": "https://chalkboard.io/", "Accept": "application/json"},
}


def show(tag, r):
    if r is None:
        print(f"  {tag:<28} ERROR")
        return
    interesting = {k.lower(): v for k, v in r.headers.items()
                   if k.lower() in ("server", "via", "www-authenticate", "x-cache", "cf-ray", "content-type",
                                    "x-envoy-upstream-service-time", "x-request-id", "alt-svc")}
    print(f"  {tag:<28} {r.status_code}  {len(r.text or ''):>6}b  body={ (r.text or '')[:60]!r}")
    print(f"       hdrs: {json.dumps(interesting)[:230]}")


def get(url, headers, proxies=None, impersonate="chrome124"):
    try:
        return requests.get(url, headers=headers, timeout=25, impersonate=impersonate, proxies=proxies)
    except Exception as exc:  # noqa: BLE001
        print("       EXC", str(exc)[:90])
        return None


def main():
    print("=" * 100)
    print("WHO IS REFUSING US - full response headers on a path the app fetches successfully")
    show("app UA, direct", get(BASE + KNOWN_API, {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)", "Accept": "application/json"}))
    if PROXIES:
        show("app UA, via proxy", get(BASE + KNOWN_API, {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)", "Accept": "application/json"}, PROXIES))

    print("\n" + "=" * 100)
    print("CDN CONTROL - an asset we know exists (if this 200s, the CDN is open and only the API refuses)")
    show("known pickAsset", get(CDN + KNOWN_CDN, {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)"}))
    if PROXIES:
        show("known pickAsset, proxy", get(CDN + KNOWN_CDN, {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)"}, PROXIES))

    print("\n" + "=" * 100)
    print("HEADER HYPOTHESES on the known API path")
    for tag, h in VARIANTS.items():
        show(tag, get(BASE + KNOWN_API, h))

    print("\n" + "=" * 100)
    print("TLS FINGERPRINT - curl_cffi impersonation targets (Cloud Armor / bot managers fingerprint the handshake)")
    for imp in ("chrome124", "safari17_0", "safari15_5", "chrome120", None):
        r = get(BASE + KNOWN_API, {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)", "Accept": "application/json"},
                None, imp)
        show(f"impersonate={imp}", r)

    print("\n" + "=" * 100)
    print("ROOT AND HEALTH - does anything on this host answer at all?")
    for p in ("/", "/health", "/healthz", "/v2", "/v2/sports-api", "/robots.txt"):
        show(p, get(BASE + p, {"User-Agent": "Chalkboard/6.18.0 (iPhone; iOS 26.6.2)"}))


if __name__ == "__main__":
    main()
