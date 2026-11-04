#!/usr/bin/env python3
"""RESEARCH - SLEEPER over/under LINE ID PAIRING (2026-11-03). READ-ONLY.
Finding: Sleeper's lines API returns ONE RECORD PER SIDE ({outcome: over|under, line_id}), and the deep link entry_prefill takes line_ids where the
id itself carries the side (K. Williams under 8.5 pts = ...334, his over = ...333). This checks, on the live NBA data, how over/under ids pair up:
is under = over + 1 always? how many one-sided lines? how many exceptions? Also prints a few full pairs. Env: PROXY_URL (optional)."""
import json
import os
from collections import Counter, defaultdict

from curl_cffi import requests

PROXY = (os.getenv("PROXY_URL") or "").strip()
PX = {"http": PROXY, "https": PROXY} if PROXY else None
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}
URLS = {
    "available": "https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true",
    "alt": "https://api.sleeper.app/lines/available_alt?include_preseason=true",
}


def get(u):
    for px in (None, PX):
        try:
            r = requests.get(u, headers=UA, proxies=px, timeout=60, impersonate="chrome124")
            if r.status_code == 200:
                return r.json()
        except Exception as e:  # noqa: BLE001
            print(f"err {str(e)[:80]}", flush=True)
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
    for name, u in URLS.items():
        data = get(u)
        if data is None:
            print(f"SRC {name}: no data", flush=True)
            continue
        allr = []
        walk(data, allr)
        data = allr
        nba = [d for d in allr if d.get("sport") == "nba" and d.get("line_id") and d.get("outcome")]
        print(f"SRC {name}: {len(data)} records, nba {len(nba)}, outcomes {dict(Counter(d.get('outcome') for d in nba))}, sports {dict(Counter(str(d.get('sport')) for d in allr if d.get('line_id')).most_common(6))}", flush=True)
        g = defaultdict(dict)
        for d in nba:
            g[(d.get("game_id"), d.get("market_type"), d.get("outcome_value"), d.get("line_type"))][d.get("outcome")] = d
        deltas, one_sided, shown = Counter(), Counter(), 0
        for k, v in g.items():
            if "over" in v and "under" in v:
                deltas[int(v["under"]["line_id"]) - int(v["over"]["line_id"])] += 1
                if shown < 4 and name == "available":
                    shown += 1
                    print("PAIR", k, "over", v["over"]["line_id"], v["over"].get("payout_multiplier"), "under", v["under"]["line_id"], v["under"].get("payout_multiplier"), flush=True)
            else:
                one_sided[tuple(v.keys())] += 1
        print(f"SUM {name}: groups {len(g)} paired-delta(under-over) top {deltas.most_common(8)} one_sided {dict(one_sided)}", flush=True)
        print(f"SUM {name}: line_types {dict(Counter(d.get('line_type') for d in nba))} statuses {dict(Counter(d.get('status') for d in nba))}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
