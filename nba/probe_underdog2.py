#!/usr/bin/env python3
"""Underdog probe 2: through the residential proxy, vary HTTP version / client headers / endpoints to find a working combo."""
import json
import os
import time

from curl_cffi import requests
from curl_cffi.curl import CurlHttpVersion

proxy = os.environ.get("PROXY_URL", "").strip()
proxies = {"https": proxy, "http": proxy} if proxy else None
S = requests.Session()
BASE_H = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "application/json", "Origin": "https://underdogfantasy.com", "Referer": "https://underdogfantasy.com/", "Accept-Language": "en-US,en;q=0.9"}
APP_H = {"client-type": "web", "client-version": "20260901", "client-device-id": "9c5f3a3a-6a3e-4c3e-9b2e-3c2b7f2d8e11", "user-latitude": "32.7157", "user-longitude": "-117.1611", "referring-device": "web", "client-request-id": "1"}
ENDPOINTS = [
    "https://api.underdogfantasy.com/beta/v6/over_under_lines",
    "https://api.underdogfantasy.com/beta/v5/over_under_lines",
    "https://api.underdogfantasy.com/v2/pickem_search/search_results?sport_id=MLB",
    "https://api.underdogfantasy.com/v1/sports",
    "https://stats.underdogfantasy.com/v1/over_under_lines",
]
for url in ENDPOINTS:
    for label, hdrs in (("base", BASE_H), ("app", {**BASE_H, **APP_H})):
        for use_proxy in (True, False):
            for hv_label, hv in (("h2", CurlHttpVersion.V2TLS), ("h1", CurlHttpVersion.V1_1)):
                try:
                    r = S.get(url, headers=hdrs, timeout=45, impersonate="chrome124", proxies=proxies if use_proxy else None, http_version=hv)
                    body = r.text[:160].replace("\n", " ")
                    print(f"{url.split('.com')[-1][:48]:48} {label:4} {'proxy' if use_proxy else 'direct':6} {hv_label}: {r.status_code} {len(r.content)}B {body if r.status_code != 200 else ''}")
                    if r.status_code == 200:
                        try:
                            j = r.json(); print("   keys:", list(j.keys())[:10] if isinstance(j, dict) else type(j).__name__)
                            oul = j.get("over_under_lines") if isinstance(j, dict) else None
                            if oul: print("   over_under_lines:", len(oul), "| sample:", json.dumps(oul[0])[:700])
                        except Exception as exc:  # noqa: BLE001
                            print("   json parse:", exc)
                except Exception as exc:  # noqa: BLE001
                    print(f"{url.split('.com')[-1][:48]:48} {label:4} {'proxy' if use_proxy else 'direct':6} {hv_label}: EXC {str(exc)[:120]}")
                time.sleep(0.8)
