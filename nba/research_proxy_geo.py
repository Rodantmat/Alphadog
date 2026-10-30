#!/usr/bin/env python3
"""
READ-ONLY probe (2026-10-30): which DataImpulse targeting string puts the board scrapers in the owner's location
(San Diego / Southern California)?  Owner: "always use a Southern California location so if there is anything board
difference it matches the legs from my location".

Reads the proxy URL from nba_config.external_credentials ('proxy_url'), derives each targeting variant by extending the
username's country tag, and asks ipinfo.io where each variant exits. Prints ONLY city / region / country / org / HTTP status -
never the proxy URL or any part of the credential. State / city targeting is billed at 2x by DataImpulse, so this makes a handful
of tiny GETs.
"""
import json
import os

import psycopg
import urllib.error
import urllib.request

VARIANTS = [
    ("base (today)", ""),
    ("state.california", ";state.california"),
    ("state.california;city.sandiego", ";state.california;city.sandiego"),
    ("city.sandiego", ";city.sandiego"),
    ("state.california;city.losangeles", ";state.california;city.losangeles"),
]


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        row = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone()
    base = (row[0] or "").strip()
    assert "__cr.us" in base, "stored proxy URL has no __cr.us tag - cannot extend it"
    for label, extra in VARIANTS:
        url = base.replace("__cr.us", "__cr.us" + extra, 1)
        ok = 0
        for k in range(3):
            try:
                op = urllib.request.build_opener(urllib.request.ProxyHandler({"http": url, "https": url}))
                with op.open(urllib.request.Request("https://ipinfo.io/json", headers={"User-Agent": "Mozilla/5.0"}), timeout=25) as r:
                    j = json.loads(r.read().decode())
                print(f"{label:38s} try{k + 1}: {j.get('city')}, {j.get('region')}, {j.get('country')} | {str(j.get('org'))[:40]} | tz {j.get('timezone')}", flush=True)
                ok += 1
            except urllib.error.HTTPError as exc:
                print(f"{label:38s} try{k + 1}: HTTP {exc.code}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"{label:38s} try{k + 1}: ERR {type(exc).__name__}: {str(exc)[:80].replace(url, '<proxy>')}", flush=True)
        print(f"  -> {label}: {ok}/3 answered", flush=True)


if __name__ == "__main__":
    main()
