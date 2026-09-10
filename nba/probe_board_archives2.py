#!/usr/bin/env python3
"""Probe 2: do Wayback captures of app.prizepicks.com/board contain the board data (lines), or only the SPA shell?"""
import json
import re
import time
import urllib.parse

from curl_cffi import requests

S = requests.Session()


def cdx(url_pattern, frm, to, limit=8):
    q = f"https://web.archive.org/cdx/search/cdx?url={urllib.parse.quote(url_pattern, safe='')}&from={frm}&to={to}&output=json&fl=timestamp,original,statuscode,mimetype,length&limit={limit}&filter=statuscode:200"
    r = S.get(q, timeout=60, impersonate="chrome124")
    return r.json()[1:] if r.status_code == 200 and r.text.strip() else []


for frm, to in (("20250310", "20250312"), ("20251105", "20251107"), ("20260115", "20260117")):
    rows = cdx("app.prizepicks.com/board*", frm, to)
    print(f"\n=== window {frm}-{to}: {len(rows)} sample captures ===")
    for ts, orig, sc, mt, ln in rows[:8]:
        print(" ", ts, orig, sc, mt, ln)
    for ts, orig, sc, mt, ln in rows[:3]:
        url = f"https://web.archive.org/web/{ts}id_/{orig}"
        try:
            r = S.get(url, timeout=60, impersonate="chrome124")
            body = r.text
            hits = {k: body.count(k) for k in ("line_score", "projection", "stat_type", "attributes", "league_id", "Points", "player", "__NEXT_DATA__", "window.__", "api.prizepicks.com")}
            print("  fetched", ts, r.status_code, len(body), "chars; hits:", hits)
            m = re.search(r'"line_score":\s*"?([\d.]+)', body)
            if m: print("   FIRST line_score:", m.group(1), "| context:", body[max(0, m.start() - 200):m.start() + 100].replace("\n", " ")[:300])
        except Exception as exc:  # noqa: BLE001
            print("  fetch EXC", ts, exc)
        time.sleep(1.5)

# also: does the archive hold the JSON API responses that the board page loads (with query strings)?
for pat in ("api.prizepicks.com/projections?league_id=7*", "api.prizepicks.com/projections?*"):
    rows = cdx(pat, "2024", "2026", limit=30)
    print(f"\n{pat}: {len(rows)} 200-captures")
    for r_ in rows[:30]: print(" ", r_[0], r_[1][:120], r_[4])
