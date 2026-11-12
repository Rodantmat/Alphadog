#!/usr/bin/env python3
"""PROBE - Fliff web bundle: print the Flex price code (calcFlexPlayCoeffs / _priceInsuredParlay callers). READ-ONLY, bundle files only, no API calls."""
import os, re, sys, time
from urllib.parse import urljoin
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fliff_pickem_quote as P
from fliff_client import FliffClient

KEYS = ["calcFlexPlayCoeffs(", "_priceInsuredParlay(", "_poissonBinomialAtMostK(", "getFlexPlayMultipliers", "estimatedPrizing", "FlexPlayUtils"]


def main():
    fc = FliffClient(proxy=P.PROXY)
    s = fc.s
    def get(u):
        for px in (None, P.PROXY):
            try:
                r = s.get(u, timeout=60, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
                if r.status_code == 200:
                    return r.text
            except Exception:  # noqa: BLE001
                pass
        return None
    root = "https://sports.getfliff.com/"
    h = get(root) or ""
    q = [urljoin(root, x) for x in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", h)]
    q += [urljoin(root, x) for x in re.findall(r"""["']([^"']*static/js/[^"']+\.js)["']""", h)]
    seen = set(); shown = set()
    while q and len(seen) < 200:
        u = q.pop(0)
        if u in seen or not u.endswith(".js"):
            continue
        seen.add(u)
        js = get(u)
        if not js:
            continue
        base = u.split("/static/")[0] + "/"
        for m in re.findall(r"""["']((?:static/js/)?[0-9a-zA-Z_.\-]+\.chunk\.js)["']""", js):
            q.append(urljoin(base, m if m.startswith("static/") else "static/js/" + m))
        for k in KEYS:
            for m in re.finditer(re.escape(k), js):
                key = (k, js[m.start():m.start() + 120])
                if key in shown:
                    continue
                shown.add(key)
                print(f"\n=== [{u.rsplit('/', 1)[-1]}] {k} @ {m.start()}\n{js[max(0, m.start() - 300):m.start() + 3500]}", flush=True)
                break
        time.sleep(0.1)
    print("chunks scanned:", len(seen))


if __name__ == "__main__":
    main()
