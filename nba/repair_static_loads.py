#!/usr/bin/env python3
"""
REPAIR a weekly static load that did not fully land, OUTSIDE a P1 run (no re-scrape, no requal - the scraped files are
already committed; this only re-invokes the writer worker and verifies by data). Runs nba/verify_static_loads.py with
its repair path: every table of each named worker must have been written after REPAIR_SINCE, else the worker is
re-invoked with curl (request kept open up to 900 s) and re-checked. Dispatch through nba-browser-probe.yml
(script=repair_static_loads.py) - a runner keeps the request open; the bridge gives up at 230 s and the worker is cut off.
Env: DATABASE_URL, REPAIR_WORKERS (default the two that failed on P1 2026-10-12), REPAIR_SINCE (default that P1's load start).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("FAILED_WORKERS", os.environ.get("REPAIR_WORKERS") or "nba-static-playtypes nba-static-shotquality")
os.environ.setdefault("LOAD_STARTED_AT", os.environ.get("REPAIR_SINCE") or "2026-10-12T19:10:45Z")

import verify_static_loads  # noqa: E402

if __name__ == "__main__":
    verify_static_loads.main()
