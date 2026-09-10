#!/usr/bin/env python3
"""Underdog probe 3: find the full-board / pagination variant of the search endpoint (page= is ignored)."""
import json
import os
import time
import uuid

from curl_cffi import requests

S = requests.Session()
H = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json", "Origin": "https://underdogfantasy.com", "Referer": "https://underdogfantasy.com/",
     "client-type": "web", "client-version": "20260901", "client-device-id": str(uuid.uuid4()), "referring-device": "web", "user-latitude": "32.7157", "user-longitude": "-117.1611"}
base = "https://api.underdogfantasy.com"
first_ids = None
variants = [
    "/v2/pickem_search/search_results?sport_id=MLB",
    "/v2/pickem_search/search_results?sport_id=MLB&page=2",
    "/v2/pickem_search/search_results?sport_id=MLB&page_number=2",
    "/v2/pickem_search/search_results?sport_id=MLB&offset=100",
    "/v2/pickem_search/search_results?sport_id=MLB&per_page=500",
    "/v2/pickem_search/search_results?sport_id=MLB&limit=500",
    "/v2/pickem_search/search_results?sport_id=MLB&live=false",
    "/v2/pickem_search/search_results?sport_id=MLB&pregame=true",
    "/v2/pickem_search/search_results?sport_id=MLB&status=pregame",
    "/v2/pickem_search/search_results?sport_id=MLB&match_type=pre_game",
    "/v2/pickem_search/search_results?sport_id=MLB&is_live_event=false",
    "/v3/over_under_lines?sport_id=MLB",
    "/v6/over_under_lines?sport_id=MLB",
    "/v6/over_under_lines?sport_id=MLB&page=1",
    "/beta/v6/over_under_lines?sport_id=MLB&page=1",
    "/beta/v7/over_under_lines?sport_id=MLB",
    "/v2/pickem_search/search_results?sport_id=NFL",
    "/v2/pickem_search/search_results",
    "/v2/pickem_search/filters?sport_id=MLB",
    "/v1/slates?sport_id=MLB",
    "/v3/slates?sport_id=MLB",
    "/beta/v3/slates?sport_id=MLB",
    "/v2/pickem_search/search_results?sport_id=MLB&slate_id=all",
]
for v in variants:
    try:
        r = S.get(base + v, headers=H, timeout=45, impersonate="chrome124")
        info = f"{r.status_code} {len(r.content)}B"
        if r.status_code == 200:
            try:
                j = r.json()
                if isinstance(j, dict):
                    oul = j.get("over_under_lines")
                    if oul is not None:
                        ids = [x.get("id") for x in oul]
                        if first_ids is None: first_ids = set(ids)
                        live = sum(1 for x in oul if x.get("live_event"))
                        info += f" lines={len(oul)} new_vs_first={len(set(ids) - first_ids)} live={live} keys={list(j.keys())[:8]}"
                        if "slates" in j: info += f" slates={json.dumps(j['slates'])[:300]}"
                    else:
                        info += f" keys={list(j.keys())[:12]} {json.dumps(j)[:300]}"
                else:
                    info += f" list n={len(j)} {json.dumps(j)[:300]}"
            except Exception as exc:  # noqa: BLE001
                info += f" nonjson {r.text[:120]!r}"
        else:
            info += " " + r.text[:120].replace("\n", " ")
        print(f"{v:70} {info}")
    except Exception as exc:  # noqa: BLE001
        print(f"{v:70} EXC {str(exc)[:100]}")
    time.sleep(0.7)
