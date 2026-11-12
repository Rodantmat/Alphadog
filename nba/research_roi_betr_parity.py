#!/usr/bin/env python3
"""PARITY of the Betr ROI rule (betr_live_slip_engine.attach_roi + select, rule B_ROI_4dyn) with research_roi_final_candidates BT-B (2026-27: 9 slips, win 66.7%, ROI +86.1%).
Read-only: builds the slip on every real Betr slate before today with the live code path (guard off - past slates), grades it on the box scores with the live payout."""
import datetime as dt
import os
import sys
import collections
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_live_slip_engine as E            # noqa: E402
import research_app_final_strategies as AF   # noqa: E402

RULE = {"k": 4, "name": "B_ROI_4dyn", "add": True, "side": "any", "floor": 0, "order": "roi", "slips": 1, "pool": 5, "game_cap": 1}
conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
rj = E.rules(conn)
today = dt.datetime.now(E.PT).date()
days = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_market.board_snapshots WHERE bookmaker='betr' AND game_date >= '2026-10-20' AND game_date < %s ORDER BY 1", (today,)).fetchall()]
print("betr slates:", len(days), flush=True)
n = 0; prof = 0.0; wins = 0; by = collections.defaultdict(float)
for d in days:
    st = AF.box(conn, d)
    if not st:
        continue
    legs, last, why = E.board_legs(conn, d, guard=False)
    if not legs:
        print(d, "no legs", dict(why), flush=True); continue
    E.attach_roi(conn, legs)
    for s in E.select(legs, RULE):
        for l in s:
            h = AF.outcome(st, l); l["hit"] = None if h is None else bool(h)
        pay = E.payout(s, rj, "dynamic")
        n += 1; prof += pay - 1; wins += 1 if pay > 0 else 0; by[d] += pay - 1
        print(d, f"pay {pay:.2f}x", " + ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']:g} (hp {l['p']:.2f} roi {l['score_roi']:.1f})" for l in s), flush=True)
eq = pk = dd = 0.0
for d in sorted(by):
    eq += by[d]; pk = max(pk, eq); dd = max(dd, pk - eq)
print(f"B_ROI_4dyn real slates: slips {n}, win {100 * wins / max(n, 1):.1f}%, ROI {100 * prof / max(n, 1):+.1f}%, profit {prof:+.1f}u, max dd {dd:.1f}u", flush=True)
