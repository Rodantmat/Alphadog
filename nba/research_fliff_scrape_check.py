#!/usr/bin/env python3
"""
RESEARCH - does the production Fliff scraper (nba/scrape_fliff_board.py) pull an NBA board again? (2026-10-22 PT)  READ-ONLY.
Runs the scraper exactly as P3 does (FLIFF_SPORTS=nba) into a temporary folder - nothing is archived or committed - and prints
its log tail, the app version it used and the board's size (legs, players, events, dates). The proxy URL comes from the
credential store into the child's environment and is never printed.
"""
import json
import os
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "curl_cffi"], check=True)
    import psycopg
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        proxy = ((conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'proxy_url'").fetchone() or [""])[0] or "").strip()
    out = Path(tempfile.mkdtemp())
    env = dict(os.environ, FLIFF_SPORTS="nba", FLIFF_OUT_DIR=str(out), PROXY_URL=proxy)
    r = subprocess.run([sys.executable, str(HERE / "scrape_fliff_board.py")], env=env, cwd=str(HERE.parent), capture_output=True, text=True, timeout=300)
    text = (r.stdout + r.stderr).replace(proxy, "<proxy>") if proxy else (r.stdout + r.stderr)
    print(f"exit {r.returncode}")
    print("\n".join(text.splitlines()[-25:]))
    f = out / "fliff_nba_current.json"
    if f.exists():
        doc = json.loads(f.read_text())
        legs = doc.get("legs") or []
        meta = doc.get("meta") or {}
        print(f"BOARD: legs {len(legs):,} | players {len({l.get('player') for l in legs}):,} | events {len(doc.get('events') or []):,} | "
              f"app_version {meta.get('app_version')} | min_app_build {meta.get('min_app_build')} | server_build {meta.get('server_build')}")
        print("markets:", Counter(l.get("market") for l in legs).most_common(12))
    else:
        print("BOARD: no output file")


if __name__ == "__main__":
    main()
