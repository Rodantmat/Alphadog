#!/usr/bin/env python3
"""
AUDIT - the injury-report daily path, sequential vs parallel, on the LIVE archive (2026-10-20, P3 speed-up). READ-ONLY: writes no
file and no table.

1  FETCH: scan_day() for yesterday and today (PT) through the proxy P3 uses (credential store 'proxy_url', never printed), with
   INJURY_WORKERS=1 and =AUDIT_WORKERS (default 8). PASS = the same snapshots (timestamp, URL, content hash) in the same order.
   (Run 39516066685: identical; 11.8 / 11.2 s sequential vs 31.5 / 2.4 s with 8 threads - the default is back to sequential.)
2  EXTRACTION: the daily mode's rows built from those snapshots with PDF text extraction one at a time vs in one process per
   core (INJURY_EXTRACT_PROCS). PASS = the parsed rows are identical, in the same order.
Env: DATABASE_URL, AUDIT_WORKERS (default 8).
"""
import hashlib
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import date, timedelta

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _need(mod, pkg):
    try:
        __import__(mod)
    except ImportError:                     # the research runner installs psycopg / numpy / scipy / pandas only
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])


_need("curl_cffi", "curl_cffi")
_need("pdfplumber", "pdfplumber")
import scrape_nba_injury_report as S   # noqa: E402


def rows_from(snaps, texts):
    out = []
    for (ts, url, content), txt in zip(snaps, texts):
        ts2 = S.header_ts(txt) or ts
        out += [{**r, "source_url": url} for r in S.parse_report(txt, ts2)]
    return out


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        row = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'proxy_url'").fetchone()
    proxy = (row[0] if row else "") or ""
    from curl_cffi import requests
    session = S.pick_session(requests, proxy)
    if session is None:
        print("AUDIT_FAIL no session reaches the archive")
        sys.exit(1)
    ok = True
    all_snaps = []
    for d in (date.today() - timedelta(days=1), date.today()):
        res = {}
        for w in ("1", os.environ.get("AUDIT_WORKERS", "8")):
            os.environ["INJURY_WORKERS"] = w
            t0 = time.time()
            snaps = S.scan_day(session, d)
            res[w] = (snaps, time.time() - t0)
        (a, ta), (b, tb) = res.values()
        ka = [(ts, u.rsplit("/", 1)[-1], hashlib.md5(c).hexdigest()) for ts, u, c in a]
        kb = [(ts, u.rsplit("/", 1)[-1], hashlib.md5(c).hexdigest()) for ts, u, c in b]
        same = ka == kb
        ok = ok and same
        all_snaps += a
        print(f"FETCH {d}: sequential {len(a)} snapshots in {ta:.1f}s | parallel {len(b)} in {tb:.1f}s | identical {same}", flush=True)
    t0 = time.time()
    seq = rows_from(all_snaps, [S.extract_text(c) for _, _, c in all_snaps])
    t_seq = time.time() - t0
    procs = os.cpu_count() or 1
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=procs) as ex:
        texts = list(ex.map(S.extract_text, [c for _, _, c in all_snaps]))
    par = rows_from(all_snaps, texts)
    t_par = time.time() - t0
    same = seq == par
    ok = ok and same
    print(f"EXTRACT {len(all_snaps)} PDFs: sequential {len(seq)} rows in {t_seq:.1f}s | {procs} processes {len(par)} rows in {t_par:.1f}s | "
          f"identical {same} | old per-snapshot sleep removed: {0.3 * len(all_snaps):.1f}s", flush=True)
    print(f"transient misses (network, after retries): {len(S._TRANSIENT_MISSES)}")
    print("AUDIT_PASS" if ok else "AUDIT_FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
