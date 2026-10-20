#!/usr/bin/env python3
"""
AUDIT - the parallel injury-report scan equals the sequential one on the LIVE archive, and how much faster it is (2026-10-20, P3
speed-up). READ-ONLY: writes no file and no table.

For yesterday and today (PT), scan_day() runs twice through the same proxy P3 uses (credential store 'proxy_url', never printed):
INJURY_WORKERS=1 (the old sequential path) and INJURY_WORKERS=8. PASS = the same snapshots (timestamp, URL, content hash) in the
same order for both days. Prints the seconds of each.
Env: DATABASE_URL, AUDIT_WORKERS (default 8).
"""
import hashlib
import os
import sys
import time
from datetime import date, timedelta

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scrape_nba_injury_report as S   # noqa: E402


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        row = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'proxy_url'").fetchone()
    proxy = (row[0] if row else "") or ""
    try:
        from curl_cffi import requests
    except ImportError:                     # the research runner installs psycopg / numpy / scipy / pandas only
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "curl_cffi"])
        from curl_cffi import requests
    session = S.pick_session(requests, proxy)
    if session is None:
        print("AUDIT_FAIL no session reaches the archive")
        sys.exit(1)
    ok = True
    for d in (date.today() - timedelta(days=1), date.today()):
        res = {}
        for w in ("1", os.environ.get("AUDIT_WORKERS", "8")):
            os.environ["INJURY_WORKERS"] = w
            t0 = time.time()
            snaps = S.scan_day(session, d)
            res[w] = ([(ts, url.rsplit("/", 1)[-1], hashlib.md5(content).hexdigest()) for ts, url, content in snaps], time.time() - t0)
        (a, ta), (b, tb) = res.values()
        same = a == b
        ok = ok and same
        print(f"{d}: sequential {len(a)} snapshots in {ta:.1f}s | parallel {len(b)} snapshots in {tb:.1f}s | identical {same}", flush=True)
        if not same:
            print("   only sequential:", sorted(set(a) - set(b))[:5], "\n   only parallel:", sorted(set(b) - set(a))[:5])
    print(f"transient misses (network, after retries): {len(S._TRANSIENT_MISSES)}")
    print("AUDIT_PASS" if ok else "AUDIT_FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
