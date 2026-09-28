#!/usr/bin/env python3
"""
Chalkboard web-surface recheck (2026-09-28), applying the Betr playbook: the App-Attest wall we hit was on
the iOS mobile API. Chalkboard is now on iOS AND Android, and may have a web/PWA surface. This checks, from
the runner (direct + via residential proxy), which chalkboard hosts serve a real app vs a landing page vs a
hard 403 — to decide if a browser-driven harvest (like Betr) is even possible.

Read-only. No creds.
"""
import os
from curl_cffi import requests

PROXY = os.environ.get("PROXY_URL", "").strip()
PROXIES = None
if PROXY:
    raw = PROXY.split("://", 1)[-1].rstrip("/").split("/", 1)[0]
    PROXIES = {"https": "http://" + raw, "http": "http://" + raw}

HOSTS = [
    "https://chalkboard.io/",
    "https://www.chalkboard.io/",
    "https://play.chalkboard.io/",
    "https://app.chalkboard.io/",
    "https://web.chalkboard.io/",
    "https://picks.chalkboard.io/",
    "https://fantasy.chalkboard.io/",
    "https://sportsbook.chalkboard.io/",
    "https://kube-prod.chalkboard.io/",
    "https://cdn.chalkboard.io/",
]
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/json,*/*"}


def probe(url, proxied):
    try:
        r = requests.get(url, headers=UA, timeout=25, impersonate="chrome124",
                         proxies=(PROXIES if proxied else None), allow_redirects=True)
    except Exception as exc:  # noqa: BLE001
        return f"ERR {str(exc)[:60]}"
    body = (r.text or "")[:400].lower()
    hint = ""
    for w in ("get the app", "download", "app store", "google play", "react", "__next", "root",
              "turnstile", "verify you are human", "cloudflare", "picks", "lineup", "projection"):
        if w in body:
            hint += w + ","
    return f"{r.status_code} len={len(r.text or '')} final={r.url[:60]} hints=[{hint}]"


def main():
    print("proxy:", bool(PROXIES))
    for h in HOSTS:
        print(f"\n{h}")
        print("  direct:", probe(h, False))
        if PROXIES:
            print("  proxy :", probe(h, True))


if __name__ == "__main__":
    main()
