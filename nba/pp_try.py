#!/usr/bin/env python3
"""Experiment: which PrizePicks read paths answer fast from a runner? Prints status + ms for each (no DB writes)."""
import os, sys, time, json
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg
from curl_cffi import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pp_payout_map as PP

px = PP.proxies()
H = PP.BOARD_HEADERS
con = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
j = con.execute("SELECT (payload#>>'{}')::jsonb FROM nba_score.ui_slips_snapshot ORDER BY built_at DESC LIMIT 1").fetchone()[0]
ids = []
for l in [x for s in j["generated_slips"] for x in s["legs"]] + j["backup_pool"]:
    if l.get("source_key") == "prizepicks":
        i = ((l.get("link") or {}).get("ids") or {}).get("projection_id")
        if i and i not in ids:
            ids.append(i)
print("ids", len(ids), ids[:3], flush=True)


def go(label, url, proxy=True, target="chrome124", warm=False):
    t = time.time()
    try:
        s = requests.Session(impersonate=target)
        if warm:
            s.get(PP.BOARD_URLS[0].replace("per_page=1000", "per_page=50"), headers=PP.app_headers(), proxies=px if proxy else None, timeout=20)
        r = s.get(url, headers=H, proxies=px if proxy else None, timeout=25)
        return label, r.status_code, len(r.content), int((time.time() - t) * 1000), r.text[:70].replace("\n", " ")
    except Exception as e:  # noqa: BLE001
        return label, "ERR", 0, int((time.time() - t) * 1000), type(e).__name__


B = PP.BOARD_URLS[0]
jobs = []
for k in range(4):
    jobs.append((f"board#{k}", B, True))
jobs.append(("board-direct", B, False))
jobs.append(("board-partner", PP.BOARD_URLS[1], True))
jobs.append(("board-small", f"{PP.API}/projections?league_id={PP.LEAGUE}&per_page=250&single_stat=true", True))
for i in ids[:3]:
    jobs.append((f"id {i}", f"{PP.API}/projections/{i}", True))
    jobs.append((f"id-direct {i}", f"{PP.API}/projections/{i}", False))
jobs.append(("ids-batch", f"{PP.API}/projections?filter[id]=" + ",".join(ids[:20]), True))
jobs.append(("board-warm", B, True, "chrome124", True))
jobs.append(("board-c131", B, True, "chrome131"))
t0 = time.time()
with ThreadPoolExecutor(len(jobs)) as ex:
    fs = [ex.submit(go, *jb) for jb in jobs]
    for f in as_completed(fs):
        print("RESULT", *f.result(), flush=True)
print("TOTAL_MS", int((time.time() - t0) * 1000), flush=True)
