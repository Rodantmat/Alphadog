#!/usr/bin/env python3
"""RESEARCH (2026-11-02, owner 10:39 PT: "Underdog, let's go with your recommendation, whatever ones is the strongest, even multiple
strategies if it is worth it"). READ-ONLY.

Measures portfolio C (ud_portfolio_c - the SAME builder the live engine will call) on every slate of 2024-25, 2025-26 (final 7 days
out, history repriced to today's law m = round(K / nv, 2), legs without a books' no-vig dropped, p_hat with the out-of-sample
coefficients of research_ud_rebuild run 41409811739) and this season (Underdog's real multipliers; nv = K / m when no book prices
the line), against: each unit alone, slip-count and floor neighbours, and the live portfolio T's grid units (T2, T3: final_hp x m
ranks) on the same prices. Also checks that ud_portfolio_c.consensus == research_sleeper_transfer.consensus on every slate.
Env: DATABASE_URL, US_SMOKE (1 = every 6th history slate)."""
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import build_ud_slip_engine as E                     # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
import research_sleeper_transfer as ST               # noqa: E402
import ud_portfolio_c as C                           # noqa: E402
import ud_portfolio_t as UPT                         # noqa: E402

T0 = time.time()
SEASONS = ("2024-25", "2025-26", "2026-27")
COEF = {"2024-25": (-0.032, 0.631, 0.828, -0.056, 0.064, 0.067), "2025-26": (-0.018, 0.459, 0.954, -0.041, 0.039, 0.035),
        "2026-27": C.COEF}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def pay(slip):
    return E.grade([{"hit": l["hit"], "factor": l["m"]} for l in slip], "standard")[1]


def variants():
    v = {"C (C1 2 slips + C2 1 slip) LIVE CANDIDATE": None}
    for uid, prm in C.UNITS.items():
        v[f"{uid} alone"] = {uid: prm}
    lv, sd, pr, fl, sk, n, ns = C.UNITS["C1"]
    v["C1 1 slip"] = {"C1": (lv, sd, pr, fl, sk, n, 1)}
    lv2, sd2, pr2, fl2, sk2, n2, ns2 = C.UNITS["C2"]
    v["C2 2 slips"] = {"C2": (lv2, sd2, pr2, fl2, sk2, n2, 2)}
    v["C1 + C2 2 slips each"] = {"C1": C.UNITS["C1"], "C2": (lv2, sd2, pr2, fl2, sk2, n2, 2)}
    for f in (0.52, 0.55, 0.57):
        v[f"C at floor {f}"] = {"C1": (lv, sd, pr, f, sk, n, ns), "C2": (lv2, sd2, pr2, f, sk2, n2, ns2)}
    for s in (0,):
        v["C at skip 0"] = {"C1": (lv, sd, pr, fl, 0, n, ns), "C2": (lv2, sd2, pr2, fl2, 0, n2, ns2)}
    return v


def build(var, legs):
    if var is None:
        return [s for _u, _k, s in C.portfolio(legs)]
    seen, out = set(), []
    for uid, prm in var.items():
        for s in C.unit_slips(uid, legs, prm):
            key = tuple(sorted((l["player"], l["prop"], l["side"], float(l["line"])) for l in s))
            if key not in seen:
                seen.add(key); out.append(s)
    return out


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    by = defaultdict(list)
    for d in days:
        by[AF.season_of(d)].append(d)
    use = []
    for s in SEASONS:
        ds = sorted(by.get(s, []))
        if s != "2026-27":
            ds = ds[:-7]
            if os.environ.get("US_SMOKE") == "1":
                ds = ds[::6]
        use += [(s, d) for d in ds]
    log("slates: " + ", ".join(f"{s} {sum(1 for x in use if x[0] == s)}" for s in SEASONS))
    VARS = variants()
    res = {name: defaultdict(list) for name in list(VARS) + ["T2 + T3 (live T grid units, final_hp x m)"]}
    cons_bad = 0
    n_src = defaultdict(int)
    for i, (s, d) in enumerate(use):
        st = AF.box(conn, d)
        if not st:
            continue
        legs, _rows = AF.load_ud(conn, d, st)
        legs = [l for l in legs if l.get("hit") is not None]
        legs.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"]))
        fair = C.consensus(conn, d)
        f2, _m = ST.consensus(conn, d)
        if fair != f2:
            cons_bad += 1
        hist = s != "2026-27"
        if hist:
            keep = []
            for l in legs:
                l["lv"] = C.lvl(l["tier"])
                if l["lv"] is None:
                    continue
                nv, _src = C.nv_of(fair, l, fill=False)
                if nv is None:
                    continue
                l["m"] = round(C.K.get((l["lv"], l["side"]), C.K_ALL) / nv, 2)
                keep.append(l)
            legs = keep
        cl = C.calibrate(legs, fair, COEF[s], fill=not hist)
        for l in cl:
            n_src[(s, l["nv_src"])] += 1
        for name, var in VARS.items():
            res[name][s].append([pay(x) - 1 for x in build(var, cl)])
        tl = [dict(l) for l in cl]
        tsl = [x for x in (UPT.grid_slip(tl, UPT.UNITS[u][1], 2) for u in ("T2", "T3")) if x]
        res["T2 + T3 (live T grid units, final_hp x m)"][s].append([pay(x) - 1 for x in tsl])
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 50 == 0:
            log(f"{i + 1}/{len(use)} {d}: {len(cl)} calibrated legs")
    log(f"consensus helper parity: {len(use) - cons_bad} of {len(use)} slates identical")
    print("legs by nv source: " + ", ".join(f"{s} {src} {n:,}" for (s, src), n in sorted(n_src.items())))
    print("\n" + "=" * 170)
    print("1-unit stakes, 2-pick Standard on Underdog's table x multipliers; per season: slips | ROI | cash | max drawdown | losing days | profit")
    for name, per in res.items():
        parts = []
        for s in SEASONS:
            days_r = per.get(s, [])
            r = [x for dd in days_r for x in dd]
            if not r:
                parts.append(f"{s} none"); continue
            cum = np.cumsum([sum(dd) for dd in days_r if dd])
            dd = float(np.max(np.maximum.accumulate(np.r_[0, cum]) - np.r_[0, cum]))
            lose = np.mean([sum(x) < 0 for x in days_r if x])
            parts.append(f"{s} {len(r):4d} sl ROI {100 * np.mean(r):+6.1f}% cash {100 * np.mean([x > 0 for x in r]):4.1f}% dd {dd:5.1f}u "
                         f"lose-days {100 * lose:3.0f}% {sum(r):+6.1f}u")
        print(f"  {name:<46s} " + " | ".join(parts), flush=True)
    log("DONE")


if __name__ == "__main__":
    main()
