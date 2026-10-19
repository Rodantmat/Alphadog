#!/usr/bin/env python3
"""
SOCIAL DEMO ASSETS (2026-10-19). Fetches, from a GitHub runner, the imagery the AlphaDog social demo composes with:
  - NBA player headshots  cdn.nba.com/headshots/nba/latest/1040x760/<player_id>.png   (NBA property; used as every picks
                          account uses them - the owner accepts that risk; nothing is generated, nothing is AI)
  - NBA team logos        cdn.nba.com/logos/nba/<team_id>/global/L/logo.svg
  - Wikimedia Commons     openly licensed (CC / public domain) photos of the cities and arenas of the slate, found through
                          the Commons search API; the licence + author of every file is written to a manifest so captions
                          can credit them.
Nothing here touches the NBA system or its database. Output: social/demo_assets/** + manifest.json.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

OUT = "social/demo_assets"
os.makedirs(f"{OUT}/headshots", exist_ok=True); os.makedirs(f"{OUT}/logos", exist_ok=True); os.makedirs(f"{OUT}/scenes", exist_ok=True)
UA = {"User-Agent": "AlphaDogSocialDemo/1.0 (github actions; contact via repo)"}
manifest = {"headshots": {}, "logos": {}, "scenes": []}

PLAYERS = {"wembanyama": 1641705, "cunningham": 1630595, "brunson": 1628973, "lebron": 2544, "tatum": 1628369, "sga": 1628983,
           "embiid": 203954, "jaylen_brown": 1627759, "holmgren": 1631096, "castle": 1642264, "duren": 1631105, "kat": 1626157,
           "paul_george": 202331, "maxey": 1630178, "derrick_white": 1628401, "josh_hart": 1628404, "fox": 1628368,
           "jalen_williams": 1631114, "bridges": 1628969, "edwards": 1630162, "giannis": 203507, "curry": 201939}
TEAMS = {"DET": 1610612765, "BOS": 1610612738, "NYK": 1610612752, "PHI": 1610612755, "SAS": 1610612759, "OKC": 1610612760,
         "LAL": 1610612747, "GSW": 1610612744, "MIA": 1610612748, "MIN": 1610612750}
SCENES = [("detroit_skyline", "Detroit skyline night"), ("little_caesars_arena", "Little Caesars Arena exterior"),
          ("msg", "Madison Square Garden exterior night"), ("nyc_skyline", "Manhattan skyline night"),
          ("san_antonio_skyline", "San Antonio skyline night"), ("frost_bank_center", "Frost Bank Center San Antonio"),
          ("philadelphia_skyline", "Philadelphia skyline night"), ("oklahoma_city_skyline", "Oklahoma City skyline"),
          ("boston_skyline", "Boston skyline night"), ("basketball_court", "basketball court empty arena lights"),
          ("basketball_closeup", "basketball ball closeup"), ("arena_crowd", "basketball arena crowd lights")]


def get(url, binary=True, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
                return (data if binary else data.decode("utf-8")), r.status
        except Exception as exc:  # noqa: BLE001
            print(f"  retry {i+1} {url[:90]}: {str(exc)[:80]}"); time.sleep(2 + 2 * i)
    return None, None


for slug, pid in PLAYERS.items():
    data, st = get(f"https://cdn.nba.com/headshots/nba/latest/1040x760/{pid}.png")
    if data and data[:4] == b"\x89PNG":
        open(f"{OUT}/headshots/{slug}.png", "wb").write(data); manifest["headshots"][slug] = {"player_id": pid, "bytes": len(data)}
        print(f"headshot {slug}: {len(data)} bytes")
    else:
        print(f"headshot {slug}: FAILED ({st})")

for code, tid in TEAMS.items():
    data, st = get(f"https://cdn.nba.com/logos/nba/{tid}/global/L/logo.svg")
    if data and b"<svg" in data[:600].lower():
        open(f"{OUT}/logos/{code}.svg", "wb").write(data); manifest["logos"][code] = {"team_id": tid, "bytes": len(data)}
        print(f"logo {code}: {len(data)} bytes")
    else:
        print(f"logo {code}: FAILED ({st})")

API = "https://commons.wikimedia.org/w/api.php"
for slug, query in SCENES:
    q = urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrsearch": f"filetype:bitmap {query}",
                                "gsrnamespace": 6, "gsrlimit": 12, "prop": "imageinfo", "iiprop": "url|extmetadata|mime|size",
                                "iiurlwidth": 1800})
    txt, st = get(f"{API}?{q}", binary=False)
    if not txt:
        print(f"scene {slug}: search FAILED"); continue
    pages = (json.loads(txt).get("query") or {}).get("pages") or {}
    picked = None
    for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if (ii.get("width") or 0) < 1200 or (ii.get("width") or 0) < (ii.get("height") or 0) * 0.9:
            continue                       # landscape, big enough
        md = ii.get("extmetadata") or {}
        lic = (md.get("LicenseShortName") or {}).get("value", "")
        if not re.search(r"CC|Public domain|PDM|CC0", lic, re.I):
            continue
        picked = (p, ii, md, lic); break
    if not picked:
        print(f"scene {slug}: no suitable CC image"); continue
    p, ii, md, lic = picked
    data, st = get(ii.get("thumburl") or ii["url"])
    if not data:
        print(f"scene {slug}: download FAILED"); continue
    ext = ".jpg" if ii["mime"] == "image/jpeg" else ".png"
    open(f"{OUT}/scenes/{slug}{ext}", "wb").write(data)
    author = re.sub(r"<[^>]+>", "", (md.get("Artist") or {}).get("value", ""))[:120]
    manifest["scenes"].append({"slug": slug, "file": f"{slug}{ext}", "title": p.get("title"), "license": lic, "author": author,
                               "source": ii.get("descriptionurl"), "bytes": len(data)})
    print(f"scene {slug}: {p.get('title')} [{lic}] {len(data)} bytes")
    time.sleep(0.5)

json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
print("DONE", {k: len(v) for k, v in manifest.items()})
