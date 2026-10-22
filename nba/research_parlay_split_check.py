#!/usr/bin/env python3
"""
RESEARCH - does ParlayAPI's ?markets= split recover a truncated sportsbook read? (2026-10-22 PT, before P3)  READ-ONLY.
Runs nba/capture_parlay_props.fetch exactly as P3 does (same tunables from classification_config['market_feed'], same key row)
and prints the per-book and per-market-split summary plus row counts per book / market. NOTHING is written to the database
(no capture row, no board rows). Costs ParlayAPI credits like one P3 read (~3 per page). The key is never printed.
"""
import os
import sys
from collections import Counter

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capture_parlay_props as C   # noqa: E402


def main():
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "requests"], check=True)   # net_retry's sender (P3 installs it)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        cfg = C.load_cfg(conn)
        key = C.api_key(conn, cfg["key_name"])
    status, remaining, items, meta = C.fetch(key, cfg)
    print(f"http {status} | items {len(items) if isinstance(items, list) else 0} | pages {meta['pages']} | credits remaining {remaining}")
    print("per book (rows read, new rows, truncated):", meta.get("per_book"))
    print("split:", meta.get("split"))
    print("narrowed_truncated:", meta.get("narrowed_truncated"))
    if isinstance(items, list):
        books = set(cfg["books"]) | set(cfg.get("book_aliases", {}))
        c = Counter((str(x.get("bookmaker")), str(x.get("market_key") or x.get("market"))) for x in items if str(x.get("bookmaker")) in books)
        for (b, m), n in sorted(c.items()):
            if m in cfg["market_map"] or m.replace("_alternate", "") in cfg["market_map"]:
                print(f"  {b:<14} {m:<45} {n:>6}")


if __name__ == "__main__":
    main()
