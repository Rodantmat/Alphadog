#!/usr/bin/env python3
"""Probe (no commit): run the Underdog NBA scraper twice - (a) default (today ET: full pills for today's matches, base lines for the
rest) and (b) UNDERDOG_ALL_MATCHES=1 (every match swept fully) - and print timing, call counts, legs/ladders and any partial cut.
Round-2 P3#2 (2026-10-08)."""
import importlib
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, "nba")
for label, extra in (("today-only", {}), ("all-matches", {"UNDERDOG_ALL_MATCHES": "1"})):
    out = Path(f"/tmp/ud_{label}")
    os.environ.update({"UNDERDOG_SPORTS": "NBA", "UNDERDOG_OUT_DIR": str(out), "UNDERDOG_BUDGET_S": os.environ.get("UNDERDOG_BUDGET_S", "240")})
    for k in ("UNDERDOG_ALL_MATCHES",):
        os.environ.pop(k, None)
    os.environ.update(extra)
    mod = importlib.import_module("scrape_underdog_board")
    importlib.reload(mod)
    t0 = time.monotonic()
    mod.main()
    meta = json.loads((out / "underdog_nba_current_meta.json").read_text())
    doc = json.loads((out / "underdog_nba_current.json").read_text())
    calls = meta.get("calls", [])
    n_err = sum(1 for c in calls if "error" in str(c[0]))
    print(f"\n== {label}: {time.monotonic() - t0:.1f}s wall | elapsed_s={meta.get('elapsed_s')} partial={meta.get('partial')} "
          f"target={meta.get('target_date_et')} workers={meta.get('workers')}")
    print(f"   lines={meta.get('lines')} legs={meta.get('legs')} ladder_legs={meta.get('ladder_legs')} players={meta.get('players')} "
          f"calls={len(calls)} errors={n_err}")
    print("   matches:", [c for c in calls if c[0] == "matches"])
    from collections import Counter
    print("   game_start dates:", Counter(str(l.get("game_start") or "")[:10] for l in doc.get("legs", [])).most_common(8))
    print("   first errors:", [c for c in calls if "error" in str(c[0])][:5])
