#!/usr/bin/env python3
"""
One-off probe (runs on the Actions runner, which has open egress): are there FREE historical archives of the pick'em
boards? (1) Internet Archive CDX index for the apps' own public JSON APIs, (2) vendor free tiers with claimed history.
Prints findings only; commits nothing.
"""
import json
import os
import sys
import time
import urllib.parse

from curl_cffi import requests

S = requests.Session()


def cdx(url_pattern, frm="2023", to="2026", limit=40):
    q = f"https://web.archive.org/cdx/search/cdx?url={urllib.parse.quote(url_pattern, safe='')}&from={frm}&to={to}&output=json&fl=timestamp,original,statuscode,length&limit={limit}"
    try:
        r = S.get(q, timeout=60, impersonate="chrome124")
        rows = r.json() if r.status_code == 200 and r.text.strip() else []
        return r.status_code, rows
    except Exception as exc:  # noqa: BLE001
        return "EXC", str(exc)


def count_cdx(url_pattern, frm="2023", to="2026"):
    q = f"https://web.archive.org/cdx/search/cdx?url={urllib.parse.quote(url_pattern, safe='')}&from={frm}&to={to}&output=json&fl=timestamp&showNumPages=false&limit=100000"
    try:
        r = S.get(q, timeout=120, impersonate="chrome124")
        rows = r.json() if r.status_code == 200 and r.text.strip() else []
        ts = [x[0] for x in rows[1:]] if rows else []
        by_month = {}
        for t in ts: by_month[t[:6]] = by_month.get(t[:6], 0) + 1
        return len(ts), dict(sorted(by_month.items()))
    except Exception as exc:  # noqa: BLE001
        return "EXC", str(exc)


print("=== INTERNET ARCHIVE (CDX) captures of the apps' public APIs ===")
for pat in ["api.prizepicks.com/projections*", "partner-api.prizepicks.com/projections*", "api.underdogfantasy.com/beta/v5/over_under_lines*",
            "api.underdogfantasy.com/beta/v6/over_under_lines*", "api.sleeper.app/lines*", "sleeper.app/picks*", "app.prizepicks.com/board*", "prizepicks.com/board*"]:
    n, bym = count_cdx(pat)
    print(f"{pat}: captures={n} by_month={bym}")
    time.sleep(1.0)

print("\n=== sample capture rows (prizepicks projections) ===")
st, rows = cdx("api.prizepicks.com/projections*", limit=15)
print(st, json.dumps(rows)[:2000])

print("\n=== vendor free tiers / docs (status only) ===")
for url in ["https://oddspapi.io/docs", "https://api.oddspapi.io/v4/docs", "https://sportsgameodds.com/docs/", "https://api.sportsgameodds.com/v2/sports/",
            "https://parse.bot/marketplace/6c00747c-a4fd-4e24-a949-016f887ff9e3/prizepicks-com-api"]:
    try:
        r = S.get(url, timeout=30, impersonate="chrome124"); print(url, r.status_code, len(r.text))
        low = r.text.lower()
        for kw in ("historical", "history", "backtest", "prizepicks", "underdog", "sleeper", "free"):
            if kw in low: print("   contains:", kw, "x", low.count(kw))
    except Exception as exc:  # noqa: BLE001
        print(url, "EXC", exc)
    time.sleep(0.5)
