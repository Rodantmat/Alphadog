#!/usr/bin/env python3
"""PARITY of roi_app_live_slip_engine.py with the research tables (read-only): builds every Sleeper / Fliff rule on each real 2026-27 slate before today
exactly as the live engine would (writes nothing), grades the slips on the box scores and prints slips / ROI per rule - compare with research_roi_final_candidates
(SL-C +41.8% 44 slips, SL-B +65.6% 27, SL-F +16.0% 53, SL-D +60.0% 50; FL-A +127.4% 31, FL-C +57.8% 45, FL-E +3.7% 54)."""
import datetime as dt
import math
import os
import sys
import collections
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roi_app_live_slip_engine as E       # noqa: E402
import research_app_final_strategies as AF  # noqa: E402
import research_app_sleeper_fliff as SF     # noqa: E402
import sleeper_live_slip_engine as SL      # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
pr = SL.pricing(conn)
today = dt.datetime.now(E.PT).date()
days = [d for d in SF.season_days(conn) if AF.season_of(d) == "2026-27" and d < today]
print("real slates:", len(days), flush=True)
acc = collections.defaultdict(lambda: [0, 0.0, 0, collections.defaultdict(float)])
for d in days:
    st = AF.box(conn, d)
    if not st:
        continue
    for app in ("sleeper", "fliff"):
        out, note = E.build(conn, d, app)
        for name, (rule, sl) in out.items():
            for s in sl:
                live = []
                for l in s:
                    h = AF.outcome(st, l)
                    if h is not None:
                        live.append((float(l["m"]), bool(h), l.get("team")))
                if len(live) < 2 or len({t for *_, t in live}) < 2:
                    pay = 1.0
                else:
                    hits = sum(1 for _, h, _ in live if h)
                    if rule[6] == "max":
                        pay = E.floor2(math.prod(m for m, _, _ in live)) if hits == len(live) else 0.0
                    else:
                        pay = float(SL.flex_tiers([m for m, _, _ in live], pr[1], pr[2]).get(hits, 0.0))
                a = acc[name]; a[0] += 1; a[1] += pay - 1.0; a[2] += 1 if pay > 0 else 0; a[3][d] += pay - 1.0
print("rule                 slips  win%   ROI%  profit  maxDD  slates", flush=True)
for name, (n, p, w, by) in acc.items():
    eq = 0.0; pk = 0.0; dd = 0.0
    for d in sorted(by):
        eq += by[d]; pk = max(pk, eq); dd = max(dd, pk - eq)
    print(f"{name:20s} {n:5d} {100 * w / max(n, 1):5.1f} {100 * p / max(n, 1):+7.1f} {p:+7.1f} {dd:6.1f} {len(by):6d}", flush=True)
