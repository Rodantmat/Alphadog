#!/usr/bin/env python3
"""Probe (no commit): find the public Sleeper endpoint that maps the lines' game_id to a start time, so the archiver can
date Sleeper legs by tip (round 2, P3#1). Prints status, size and a sample record per candidate; direct first, proxy second."""
import json
import os
from curl_cffi import requests

UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "Accept": "application/json"}
CANDS = ["https://api.sleeper.app/schedule/nba/regular/2026", "https://api.sleeper.app/schedule/nba/pre/2026",
         "https://api.sleeper.app/schedule/nba/regular/2025", "https://api.sleeper.app/games/nba",
         "https://api.sleeper.app/v1/state/nba", "https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true"]
proxy = (os.environ.get("PROXY_URL") or "").strip()
for url in CANDS:
    for label, px in (("direct", None), ("proxy", {"https": proxy, "http": proxy} if proxy else None)):
        if label == "proxy" and not px:
            continue
        try:
            r = requests.get(url, headers=UA, timeout=30, impersonate="chrome124", proxies=px)
            body = r.text
            sample = ""
            try:
                j = json.loads(body)
                if isinstance(j, list) and j:
                    sample = json.dumps(j[0])[:400]
                elif isinstance(j, dict):
                    sample = json.dumps(j)[:400]
            except Exception:  # noqa: BLE001
                sample = body[:200]
            print(f"{label:<6} {url}\n       HTTP {r.status_code} {len(body)} bytes  sample: {sample}")
            if r.status_code == 200:
                break
        except Exception as exc:  # noqa: BLE001
            print(f"{label:<6} {url}\n       ERROR {str(exc).replace(proxy, '<PROXY>')[:150]}")
