#!/usr/bin/env python3
"""PROBE (2026-10-19, opening-day readiness): ParlayAPI flags x-result-truncated even on the sportsbook-narrowed read. Read-only:
for each of the history's sportsbooks, ONE read narrowed to that book alone (limit 10000), printing items, pages-left headers,
the truncated flag and the game dates; then two date-filter variants on DraftKings (commenceTimeFrom/To as on the Odds API, and
date=) to see whether ParlayAPI can narrow by slate. Nothing is written. ~3 credits per call."""
import os
import sys
from collections import Counter

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from capture_parlay_props import _page, et_date, load_cfg, api_key  # noqa: E402

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    cfg = load_cfg(conn)
    key = api_key(conn, cfg["key_name"])
books = sorted(set(cfg["books"]) | {k for k, v in cfg.get("book_aliases", {}).items() if v in set(cfg["books"])})


def show(label, query):
    st, rem, doc, hd = _page(key, query)
    items = doc if isinstance(doc, list) else []
    dates = Counter(str(et_date(x.get("commence_time"))) for x in items)
    bks = Counter(str(x.get("bookmaker")) for x in items)
    two = sum(1 for x in items if x.get("under_price") not in (None, ""))
    print(f"{label}: http {st}, items {len(items)} (two-sided {two}), truncated={hd.get('x-result-truncated')}, "
          f"has_more={hd.get('x-result-has-more')}, next={hd.get('x-next-offset')}, remaining {rem}, books {dict(bks)}, dates {dict(sorted(dates.items()))}"
          + ("" if st == 200 else f", error {str(doc)[:160]}"), flush=True)
    trunc_hdrs = {k: v for k, v in hd.items() if k.startswith("x-result") or k.startswith("x-trunc") or "cap" in k}
    if trunc_hdrs:
        print(f"   result headers: {trunc_hdrs}", flush=True)
    return items


for b in books:
    show(f"book {b}", f"limit=10000&offset=0&bookmakers={b}")
show("draftkings commenceTime 10-20 ET", "limit=10000&offset=0&bookmakers=draftkings&commenceTimeFrom=2026-10-20T04:00:00Z&commenceTimeTo=2026-10-21T03:59:59Z")
show("draftkings date=2026-10-20", "limit=10000&offset=0&bookmakers=draftkings&date=2026-10-20")
show("all books commenceTime 10-20 ET", "limit=10000&offset=0&commenceTimeFrom=2026-10-20T04:00:00Z&commenceTimeTo=2026-10-21T03:59:59Z")
