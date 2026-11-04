#!/usr/bin/env python3
"""RESEARCH - SLEEPER LINE IDS vs SIDES (2026-11-03). READ-ONLY.
Owner's phone test: sleeper.onelink.me/GF91?deep_link_value=entry_prefill&deep_link_sub1=<4 ids> (no pid) opened Picks Entry with MIXED sides
(Gobert O, Williams U, Cunningham U, Sengun O) and $1.00. Those 4 ids are NOT on our 1:20 PM board. Question: are sides built into the ids
(separate id per side / one-sided lines) or remembered by the app? Fetches Sleeper's public lines API fresh and prints the raw record for each id,
plus every sibling record for the same player + stat. Env: PROXY_URL (optional)."""
import json
import os

from curl_cffi import requests

PROXY = (os.getenv("PROXY_URL") or "").strip()
PX = {"http": PROXY, "https": PROXY} if PROXY else None
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}
URLS = {
    "available": "https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true",
    "alt": "https://api.sleeper.app/lines/available_alt?include_preseason=true",
    "plain": "https://api.sleeper.app/lines/available",
}
IDS = {"1423534000932237334": "Gobert OVER?", "1423554122690445345": "Williams UNDER?", "1423558547685359660": "Cunningham UNDER?",
       "1423560428788744201": "Sengun OVER?", "1423455475168542720": "Maxey(test)", "1423455475210485774": "Collins(test)"}


def get(u):
    for px in (None, PX):
        try:
            r = requests.get(u, headers=UA, proxies=px, timeout=60, impersonate="chrome124")
            if r.status_code == 200:
                return r.json()
            print(f"  {u[-40:]} -> {r.status_code}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"  {u[-40:]} err {str(e)[:80]}", flush=True)
    return None


def walk(o, out, depth=0):
    if depth > 6:
        return
    if isinstance(o, dict):
        out.append(o)
        for v in o.values():
            walk(v, out, depth + 1)
    elif isinstance(o, list):
        for v in o:
            walk(v, out, depth + 1)


def main():
    seen_ids = set()
    for name, u in URLS.items():
        data = get(u)
        if data is None:
            print(f"SRC {name}: no data", flush=True)
            continue
        dicts = []
        walk(data, dicts)
        recs = [d for d in dicts if "line_id" in d or "id" in d and ("wager_type" in d or "market_type" in d)]
        print(f"SRC {name}: {len(dicts)} dicts, {len(recs)} line-ish records; top type {type(data).__name__}", flush=True)
        if recs and name == "available":
            print("SAMPLE keys:", sorted(recs[0].keys()), flush=True)
            print("SAMPLE raw:", json.dumps(recs[0])[:1200], flush=True)
        for d in recs:
            lid = str(d.get("line_id") or d.get("id"))
            if lid in IDS:
                seen_ids.add(lid)
                print(f"\nFOUND {IDS[lid]} in {name}: {json.dumps(d)[:1500]}", flush=True)
                sub, wt = d.get("subject_id"), d.get("wager_type")
                for s in recs:
                    if s is not d and s.get("subject_id") == sub and s.get("wager_type") == wt and sub:
                        print(f"   SIBLING line_id={s.get('line_id')} line={s.get('line')} type={s.get('line_type')} over={s.get('over_multiplier')} under={s.get('under_multiplier')} "
                              f"os={s.get('over_status')} us={s.get('under_status')} alt={s.get('alt')}", flush=True)
    print("\nIDS found:", sorted(seen_ids), "missing:", sorted(set(IDS) - seen_ids), "\nDONE", flush=True)


if __name__ == "__main__":
    main()
