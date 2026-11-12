#!/usr/bin/env python3
"""UD THIN-BOARD FALLBACK STUDY (owner 2026-11-12 00:03 PT: "anything under 50% ROI this becomes fallback on thin boards"). Main = C5 + C6 (always); the five units under 50% ROI
(T1 T2 T3 C3 C4) play only on 'thin' days. Several definitions of thin are measured on the deployed builders (same replay as research_cert_owner_ud). READ-ONLY, flat 1u a slip."""
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
nb = {}
tpay = lambda sl, fk: (lambda p: (1.0 if p is None else p) - 1.0)(AF.UDL.payout("standard", [{"hit": l["hit"], "factor": float(l[fk])} for l in sl if l["hit"] is not None]))
for i, d in enumerate(days):
    st = AF.box(conn, d)
    if not st:
        continue
    legs, rows = AF.load_ud(conn, d, st)
    if not legs:
        continue
    s = AF.season_of(d)
    nb[d] = len({(l['player_id'], l['prop'], l['side'], l['line']) for l in rows})
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
ALLU = ["T1", "T2", "T3", "C3", "C4", "C5", "C6"]; FB = ["T1", "T2", "T3", "C3", "C4"]
byd = collections.defaultdict(lambda: collections.defaultdict(list))
for u in ALLU:
    for (s, d, p, v) in rec[u]:
        byd[d][u].append((s, d, p, v))
alld = sorted(set(d for u in ALLU for (s, d, p, v) in rec[u]))
print("board size quantiles p5 p10 p25 p50 p75", [sorted(nb.values())[int(q * (len(nb) - 1))] for q in (0.05, .1, .25, .5, .75)], flush=True)
print("days with C5 slip", sum(1 for d in alld if byd[d]["C5"]), "C6", sum(1 for d in alld if byd[d]["C6"]), "neither", sum(1 for d in alld if not byd[d]["C5"] and not byd[d]["C6"]), "of", len(alld), flush=True)


def run(label, thin):
    items = []; nthin = 0
    for d in alld:
        for u in ["C5", "C6"]:
            items += byd[d][u]
        if thin(d):
            nthin += 1
            for u in FB:
                items += byd[d][u]
    print(f"[{label}] thin days {nthin}/{len(alld)}", flush=True)
    CC.report(f"UD C5+C6 + fallback: {label}"[:60], items)
    return items


run("none (C5+C6 only)", lambda d: False)
run("A no C6 slip", lambda d: not byd[d]["C6"])
run("B no C5 slip", lambda d: not byd[d]["C5"])
run("C neither C5 nor C6", lambda d: not byd[d]["C5"] and not byd[d]["C6"])
run("D not both C5 and C6", lambda d: not (byd[d]["C5"] and byd[d]["C6"]))
for q in (10, 25, 50):
    cut = sorted(nb.values())[int(q / 100 * (len(nb) - 1))]
    run(f"E board<=p{q} ({cut} legs)", lambda d, c=cut: nb.get(d, 0) <= c)
for q in (25, 50):
    cut = sorted(nb.values())[int(q / 100 * (len(nb) - 1))]
    run(f"F no C6 or board<=p{q}", lambda d, c=cut: (not byd[d]["C6"]) or nb.get(d, 0) <= c)
run("G always (all 7)", lambda d: True)
print("\n=== fallback units alone on each thin kind ===", flush=True)
for label, thin in (("A no C6", lambda d: not byd[d]["C6"]), ("C neither", lambda d: not byd[d]["C5"] and not byd[d]["C6"]), ("B no C5", lambda d: not byd[d]["C5"])):
    for u in FB:
        CC.report(f"{label} {u}"[:60], [x for d in alld if thin(d) for x in byd[d][u]])
