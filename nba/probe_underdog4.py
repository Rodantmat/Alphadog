#!/usr/bin/env python3
"""Underdog probe 4 (careful): proxy-only, spaced requests, ranked variants to reach the PRE-GAME board."""
import json
import os
import time
import uuid

from curl_cffi import requests

proxy = os.environ.get("PROXY_URL", "").strip()
proxies = {"https": proxy, "http": proxy} if proxy else None
S = requests.Session()
H = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9", "Origin": "https://underdogfantasy.com", "Referer": "https://underdogfantasy.com/pick-em/higher-lower/all/mlb",
     "client-type": "web", "client-version": "20260901", "client-device-id": str(uuid.uuid4()), "referring-device": "web", "user-latitude": "32.7157", "user-longitude": "-117.1611", "client-request-id": str(uuid.uuid4())}
base = "https://api.underdogfantasy.com"
variants = [
    "/v2/pickem_search/slates?sport_id=MLB",
    "/v2/pickem_search/search_results?sport_id=MLB&live=false&per_page=1000",
    "/v2/pickem_search/search_results?sport_id=MLB&pickem_search[is_live]=false&per_page=1000",
    "/v2/pickem_search/search_results?sport_id=MLB&sort=start_time&per_page=1000",
    "/v2/pickem_search/search_results?sport_id=MLB&page_number=2&page_size=100",
    "/v2/pickem_search/search_results?sport_id=MLB&pickem_search[page]=2",
    "/v2/pickem_search/search_results?sport_id=MLB&status=pregame",
    "/v2/pickem_search/search_results?sport_id=MLB&match_type=pregame",
    "/v2/pickem/featured_lines?sport_id=MLB",
    "/v3/pickem_events?sport_ids[]=MLB",
    "/v2/pickem_search/search_results?sport_id=MLB&pickem_search[sport_id]=MLB&pickem_search[live]=false",
    "/beta/v6/over_under_lines?sport_id=MLB&page=1&per_page=1000",
]
first = None
for v in variants:
    try:
        r = S.get(base + v, headers=H, timeout=45, impersonate="chrome124", proxies=proxies)
        info = f"{r.status_code} {len(r.content)}B"
        if r.status_code == 200:
            try:
                j = r.json()
                if isinstance(j, dict):
                    oul = j.get("over_under_lines")
                    if oul is not None:
                        ids = {x.get("id") for x in oul}
                        if first is None: first = ids
                        live = sum(1 for x in oul if x.get("live_event"))
                        info += f" lines={len(oul)} live={live} new_vs_first={len(ids - first)} opened={j.get('opened_lines_count')} keys={list(j.keys())[:9]}"
                    else:
                        info += f" keys={list(j.keys())[:12]} body={json.dumps(j)[:400]}"
                else:
                    info += f" list n={len(j)} {json.dumps(j)[:400]}"
            except Exception as exc:  # noqa: BLE001
                info += f" nonjson {r.text[:100]!r}"
        else:
            info += " " + r.text[:100].replace("\n", " ")
        print(f"{v:95} {info}")
    except Exception as exc:  # noqa: BLE001
        print(f"{v:95} EXC {str(exc)[:100]}")
    time.sleep(2.5)
