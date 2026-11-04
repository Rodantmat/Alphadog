#!/usr/bin/env python3
"""PROBE - HOW PRIZEPICKS' WEB APP READS A LINEUP LINK (2026-11-03, owner: "You need to find how to correctly pick the side").
Owner's phone test: app.prizepicks.com/entry?projections=ID,ID (or /board?projections=) opened the app with BOTH legs loaded, both Less,
toast "Lineup copied! Please review your selections before finalizing". This reads the web app's own JavaScript for the parser:
'projections' query handling, side tokens (more/less/over/under/over_under), the "Lineup copied" toast, shareEntry. Reports only.
HTML through the proxy (DataDome gates it), bundles direct from the CDN first. Env: PROXY_URL."""
import os
import re

from curl_cffi import requests

PROXY = (os.getenv("PROXY_URL") or "").strip()
PX = {"http": PROXY, "https": PROXY} if PROXY else None
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"}
KEYS = re.compile(r"Lineup copied|lineup copied|shareEntry|share_entry|copyLineup|copy_lineup|[\"'`]projections[\"'`]\s*\)|get(?:All)?\(\s*[\"'`]projections|"
                  r"searchParams|URLSearchParams\([^)]{0,80}projections|entryId|prefill|deeplink|deepLink", re.I)


def get(u, proxy=False, t=60):
    try:
        r = requests.get(u, headers=UA, proxies=PX if proxy else None, timeout=t, impersonate="chrome124")
        return r.status_code, r.text or ""
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:120]


def main():
    print(f"proxy configured: {bool(PX)}", flush=True)
    st, html = get("https://app.prizepicks.com/", proxy=True)
    print(f"HTML {st} {len(html):,}", flush=True)
    srcs = list(dict.fromkeys(re.findall(r'(?:src|href)=["\']([^"\']+\.js[^"\']*)["\']', html)))
    print(f"{len(srcs)} js refs", flush=True)
    shown = 0
    for s in srcs:
        u = s if s.startswith("http") else ("https:" + s if s.startswith("//") else "https://app.prizepicks.com" + (s if s.startswith("/") else "/" + s))
        st2, js = get(u)
        if st2 != 200:
            st2, js = get(u, proxy=True)
        if st2 != 200:
            print(f"skip {u[-60:]} {st2}", flush=True)
            continue
        hits = [m for m in KEYS.finditer(js)]
        print(f"bundle {u.rsplit('/', 1)[-1][:70]} {len(js):,} chars, {len(hits)} hits", flush=True)
        last = -10_000
        for m in hits:
            if shown >= 45 or m.start() - last < 700:
                continue
            last = m.start()
            a = max(0, m.start() - 500); b = min(len(js), m.end() + 900)
            print(f"\nHIT [{m.group(0)}] in {u.rsplit('/', 1)[-1][:50]}\n   {js[a:b]!r}\n", flush=True)
            shown += 1
    print(f"DONE hits shown {shown}", flush=True)


if __name__ == "__main__":
    main()
