#!/usr/bin/env python3
"""RESEARCH - DEEP LINK SURFACE PER APP (2026-11-03, owner: "Lineup Deep Links on the slips ... auto fill the legs"). READ-ONLY.
Step 1 of the work: what does each app actually accept? Reports only, writes nothing, no proxy (CDN / well-known files are not DataDome-gated).
  1. well-known association files (iOS apple-app-site-association, Android assetlinks.json) per app domain: which URL paths open the app
  2. custom URL schemes found in the sites' HTML / JS bundles
  3. bundle route literals mentioning entry / slip / lineup / pick / share / cart / prefill / selection
Env: none."""
import json
import re
import sys

import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9"}
APPS = {
    "prizepicks": ["app.prizepicks.com", "www.prizepicks.com", "prizepicks.com"],
    "underdog": ["underdogfantasy.com", "play.underdogfantasy.com", "app.underdogfantasy.com", "www.underdogfantasy.com"],
    "sleeper": ["sleeper.com", "sleeper.app", "www.sleeper.com"],
    "betr": ["betr.app", "www.betr.app", "picks.betr.app", "app.betr.app"],
    "fliff": ["getfliff.com", "www.getfliff.com", "fliff.com", "app.getfliff.com"],
}
ROUTE = re.compile(r"[\"'`]((?:/[A-Za-z0-9_\-:{}$.\[\]]+){1,6}/?(?:\?[A-Za-z0-9_=&\-{}$.\[\],%]+)?)[\"'`]")
WORDS = re.compile(r"(entry|entries|slip|lineup|line-up|pick|share|cart|prefill|selection|betslip|parlay|invite|deeplink|deep_link|deepLink)", re.I)
SCHEME = re.compile(r"\b([a-z][a-z0-9+.\-]{2,24})://[A-Za-z0-9_\-/{}$.?=&%]{0,80}", re.I)
SKIP = {"http", "https", "ws", "wss", "data", "blob", "file", "chrome-extension", "about"}


def get(url, timeout=40):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
            return r.status, r.read(3_000_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:120]


def main():
    for app, hosts in APPS.items():
        print(f"\n################ {app}", flush=True)
        seen_bundles = set()
        for h in hosts:
            for wk in ("/.well-known/apple-app-site-association", "/apple-app-site-association", "/.well-known/assetlinks.json"):
                st, body = get(f"https://{h}{wk}")
                if st == 200 and body.strip()[:1] in "{[":
                    print(f"\n[{h}{wk}] 200\n{body[:1800]}", flush=True)
                else:
                    print(f"[{h}{wk}] {st}", flush=True)
            st, html = get(f"https://{h}/")
            print(f"\n[{h}/] {st} {len(html):,} bytes", flush=True)
            if st != 200:
                continue
            for m in sorted({m.group(0) for m in SCHEME.finditer(html) if m.group(1).lower() not in SKIP})[:15]:
                print(f"   scheme in html: {m}", flush=True)
            for tag in re.findall(r'<meta[^>]+(?:al:|apple-itunes-app|smartbanner)[^>]*>', html, re.I)[:10]:
                print(f"   meta: {tag[:220]}", flush=True)
            srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
            urls = []
            for s in srcs:
                u = s if s.startswith("http") else ("https:" + s if s.startswith("//") else f"https://{h}{s if s.startswith('/') else '/' + s}")
                if u not in seen_bundles:
                    seen_bundles.add(u); urls.append(u)
            print(f"   {len(urls)} bundles", flush=True)
            hits, schemes = {}, set()
            for u in urls[:40]:
                st, js = get(u, 60)
                if st != 200:
                    continue
                for m in ROUTE.finditer(js):
                    r = m.group(1)
                    if WORDS.search(r) and 3 < len(r) < 90:
                        hits[r] = hits.get(r, 0) + 1
                for m in SCHEME.finditer(js):
                    if m.group(1).lower() not in SKIP and len(m.group(0)) < 90:
                        schemes.add(m.group(0))
            print(f"   route literals with entry/slip/lineup/pick/share words ({len(hits)}):", flush=True)
            for r in sorted(hits)[:60]:
                print(f"     {r}", flush=True)
            print(f"   url schemes in bundles ({len(schemes)}): {sorted(schemes)[:25]}", flush=True)
    print("\nDONE", flush=True)


if __name__ == "__main__":
    sys.exit(main())
