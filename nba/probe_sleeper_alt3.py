#!/usr/bin/env python3
"""PROBE - is Sleeper's NBA alt ladder hidden INSIDE the main lines feed? (2026-10-18). Read-only: one GET of lines/available
(the scraper's exact URL) - per NBA market: option count, distinct outcome_values, every key on the market and on an option, and
the full Embiid blocks / steals markets. Env: PROXY_URL."""
import json
import os
from collections import Counter

from curl_cffi import requests

P = os.environ.get("PROXY_URL", "").strip()
PX = {"https": P, "http": P} if P else None
H = {"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://sleeper.com/"}
URL = "https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true"
j = requests.get(URL, headers=H, proxies=PX, timeout=60, impersonate="chrome").json()
nba = [ln for ln in j if (ln.get("options") or [{}])[0].get("sport") == "nba"]
print("nba markets", len(nba))
print("market keys", Counter(k for ln in nba for k in ln))
print("option keys", Counter(k for ln in nba for o in ln.get("options") or [] for k in o).most_common(60))
print("options per market", Counter(len(ln.get("options") or []) for ln in nba))
print("distinct outcome_values per market", Counter(len({o.get("outcome_value") for o in ln.get("options") or []}) for ln in nba))
print("line_type", Counter(str(o.get("line_type")) for ln in nba for o in ln.get("options") or []))
for ln in nba:
    o0 = (ln.get("options") or [{}])[0]
    if str(o0.get("subject_id")) == "1511" and o0.get("wager_type") in ("blocks", "steals", "double_double"):
        print("EMBIID", json.dumps(ln)[:3000])
