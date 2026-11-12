#!/usr/bin/env python3
"""CERTIFICATION - the owner's Underdog strategies through the deployed builders: portfolio T (ud_portfolio_t.unit_slip: T1 T2 T3, 2-pick Standard) and the Flex units
C3 C4 C5 C6 (ud_portfolio_c.flex_slips on the calibrated legs; history repriced to today's law exactly like audit_ud_flex_units_parity). Every slate research_app_final_strategies
.slate_days returns (2024-25, 2025-26 without each season's final 7 days, 2026-27 before today). READ-ONLY, flat 1u a slip."""
import collections
import os
import sys

import psycopg

os.environ["APP"] = "UD"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_app_final_strategies as AF   # noqa: E402
import research_deploy_proof_ud as P         # noqa: E402
import ud_portfolio_c as C                   # noqa: E402
import ud_portfolio_t as PT                  # noqa: E402
import research_cert_common as CC            # noqa: E402

E = AF.E
conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
days = AF.slate_days(conn)
rec = collections.defaultdict(list)
tpay = lambda sl, fk: (lambda p: (1.0 if p is None else p) - 1.0)(AF.UDL.payout("standard", [{"hit": l["hit"], "factor": float(l[fk])} for l in sl if l["hit"] is not None]))
for i, d in enumerate(days):
    st = AF.box(conn, d)
    if not st:
        continue
    legs, rows = AF.load_ud(conn, d, st)
    if not legs:
        continue
    s = AF.season_of(d)
    hits = {(l["player"], l["prop"], l["side"], l["line"]): l["hit"] for l in legs}
    sl_legs = PT.raw_legs(rows); pool = E.eligible_legs(rows)
    for u in PT.UNITS:
        sh = PT.unit_slip(u, sl_legs, pool, E)
        if sh:
            lg = [{**l, "hit": hits.get((l["player"], l["prop"], l["side"], l["line"]))} for l in sh]
            rec[u].append((s, d, tpay(lg, "factor"), sum(1 for l in lg if l["hit"] is not None) < 2))
    lg2 = [l for l in legs if l.get("hit") is not None]
    lg2.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"]))
    fair = C.consensus(conn, d)
    hist = s != "2026-27"
    if hist:
        keep = []
        for l in lg2:
            l["lv"] = C.lvl(l["tier"])
            if l["lv"] is None:
                continue
            nv, _src = C.nv_of(fair, l, fill=False)
            if nv is None:
                continue
            l["m"] = round(C.K.get((l["lv"], l["side"]), C.K_ALL) / nv, 2)
            keep.append(l)
        lg2 = keep
    cl = C.calibrate(lg2, fair, P.COEF[s], fill=not hist)
    for uid in ("C3", "C4", "C5", "C6"):
        for x in C.flex_slips(uid, cl):
            rec[uid].append((s, d, P.pay(x, "flex") - 1.0, sum(1 for l in x if l.get("hit") is not None) < 2))
    if i % 40 == 39:
        conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
print(f"slates: {len(days)}", flush=True)
print("\n=== owner Underdog units ===", flush=True)
for u in list(PT.UNITS) + ["C3", "C4", "C5", "C6"]:
    lab = PT.LABEL.get(u) if u in PT.UNITS else C.LABEL.get(u)
    CC.report(f"UD {u} {lab}"[:60], rec[u])
print("\n=== sets ===", flush=True)
for name, us in (("UD T set (T1 T2 T3)", ["T1", "T2", "T3"]), ("UD C set (C3 C4 C5 C6)", ["C3", "C4", "C5", "C6"]), ("UD ALL deployed", ["T1", "T2", "T3", "C3", "C4", "C5", "C6"])):
    items = [(s, d, p, v) for u in us for (s, d, p, v) in rec[u]]
    CC.report(name, items)
print("\n=== leave-one-out (ALL seasons, the 7 units) ===", flush=True)
us = ["T1", "T2", "T3", "C3", "C4", "C5", "C6"]
base = CC.stat([(d, p, v) for u in us for (s, d, p, v) in rec[u]])
for u in us:
    st_ = CC.stat([(d, p, v) for v_u in us if v_u != u for (s, d, p, v) in rec[v_u]])
    print(f"without {u}: ROI {100 * st_['roi']:+.1f}% net {st_['net']:+.1f} dd {st_['dd']:.1f} drought {st_['dry']} (set ROI {100 * base['roi']:+.1f}% net {base['net']:+.1f} dd {base['dd']:.1f})", flush=True)
