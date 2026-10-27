#!/usr/bin/env python3
"""PROBE - HOW LONG THE SLIPS SCREEN TAKES (2026-10-26; owner 18:31 PT: "The slips also take long to load, see if you can optimize
it"). Calls the UI worker's Slips route exactly as the browser does (POST /api/slips/high-hit, body {}) N times and prints the wall
time and the worker's own timing_ms breakdown (and whether the answer came from the precomputed snapshot). Read-only.
Env: UI_URL (default the NBA main UI worker), N (default 3), UI_QS (optional query string, e.g. date=2026-10-25)."""
import json
import os
import time
import urllib.request

URL = os.environ.get("UI_URL", "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev").rstrip("/")


def main():
    qs = os.environ.get("UI_QS", "").strip()
    for i in range(int(os.environ.get("N", "3"))):
        req = urllib.request.Request(f"{URL}/api/slips/high-hit{'?' + qs if qs else ''}", data=b"{}", method="POST",
                                     headers={"content-type": "application/json", "user-agent": "alphadog-timing-probe"})
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
        wall = time.time() - t0
        j = json.loads(body)
        print(f"call {i + 1}: {wall:.2f} s wall, {len(body) / 1024:.0f} KB, ok={j.get('ok')}, slate={(j.get('slate') or {}).get('date')}, "
              f"slips={len(j.get('generated_slips') or [])}, board_legs={j.get('board_legs')}, snapshot={j.get('snapshot')}, "
              f"timing_ms={j.get('timing_ms')}", flush=True)


if __name__ == "__main__":
    main()
