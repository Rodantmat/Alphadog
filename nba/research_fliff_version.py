#!/usr/bin/env python3
"""
RESEARCH - which app version does Fliff accept now? (2026-10-22 PT)  READ-ONLY.

Why: since 2026-10-22 every Fliff call returns api error 30040 "This version of the app is no longer supported" for our
APP_VERSION 5.0.34.285 (P2B morning pull and the standalone Fliff Board Scraper both got no board).
What this does: loads the Fliff web app (sports.getfliff.com), lists its scripts, finds version-looking strings
(N.N.NN.NNN) in them, then pings m-c2 with each candidate (newest first) and prints which one the server accepts, plus the
ping's min_app_build / server_build. Nothing is written. The proxy URL is read from the credential store and never printed.
"""
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "curl_cffi"], check=True)
    import psycopg
    from curl_cffi import requests as cr
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        proxy = ((conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'proxy_url'").fetchone() or [""])[0] or "").strip()
    px = {"https": proxy, "http": proxy} if proxy else None
    s = cr.Session(impersonate="chrome124")

    def get(url):
        for route in (None, px):
            try:
                r = s.get(url, timeout=40, proxies=route)
                if r.status_code == 200:
                    return r.text
                print(f"  GET {url[:90]} -> HTTP {r.status_code} ({'proxy' if route else 'direct'})")
            except Exception as e:  # noqa: BLE001
                print(f"  GET {url[:90]} failed ({'proxy' if route else 'direct'}): {type(e).__name__}")
        return ""

    cands = {}
    for page in ("https://sports.getfliff.com/", "https://www.getfliff.com/"):
        html = get(page)
        print(f"{page}: {len(html):,} chars")
        srcs = re.findall(r"""<script[^>]+src=["']([^"']+)["']""", html)
        for v in re.findall(r"\b5\.\d{1,2}\.\d{1,3}\.\d{2,4}\b", html):
            cands[v] = cands.get(v, 0) + 1
        for src in srcs[:40]:
            url = src if src.startswith("http") else page.rstrip("/") + "/" + src.lstrip("/")
            js = get(url)
            found = re.findall(r"\b\d\.\d{1,2}\.\d{1,3}\.\d{2,4}\b", js)
            ctx = [m.start() for m in re.finditer(r"app_x_version|appVersion|APP_VERSION|app_version", js)]
            print(f"  script {url[:100]} | {len(js):,} chars | version-like {sorted(set(found))[:12]} | version keys {len(ctx)}")
            for i in ctx[:4]:
                print("    ...", re.sub(r"\s+", " ", js[max(0, i - 120):i + 160]))
            for v in found:
                cands[v] = cands.get(v, 0) + 1
    print("candidates:", cands)

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import scrape_fliff_board as F
    def key(v):
        return tuple(int(x) for x in v.split("."))
    tried = sorted({v for v in cands if v.startswith("5.")}, key=key, reverse=True)[:6]
    for v in tried + [F.APP_VERSION]:
        F.APP_VERSION = v
        hdr = F.header("web." + "0" * 32, "abcdefghij")
        try:
            ping = F.call(s, F.PING_HOST, hdr, {"__object_class_name": "FCM__Ping__Request", "message": f"ping {int(time.time()*1000)}"}, px)
            d = ping.get("result", {}).get("response", {}).get("data", {})
            print(f"VERSION {v}: ACCEPTED | min_app_build {d.get('min_app_build')} | server_build {d.get('server_build')} | feed {d.get('proposals_feed_endpoint')}")
            break
        except Exception as e:  # noqa: BLE001
            print(f"VERSION {v}: refused ({str(e)[:160]})")
        time.sleep(3)


if __name__ == "__main__":
    main()
