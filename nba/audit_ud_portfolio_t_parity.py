#!/usr/bin/env python3
"""
AUDIT - UNDERDOG PORTFOLIO T PARITY (2026-10-25; owner 20:01 PT chose T). READ-ONLY. Every slate the research used
(research_app_final_strategies.slate_days: 2024-25, 2025-26 without the final 7 days, 2026-27 before today):
  RESEARCH  the research's own selection: research_app_final_strategies.load_ud legs in its order, the day_matrix rule (pool, side,
            prop set, rank final_hp x m, floor, skip, one pick per game, distinct players) for T2 / T3; build_ud_slip_engine for T1
  SHARED    ud_portfolio_t.unit_slip - the code the live engine runs
  -> per unit: slates with a slip in each, identical slips, P/L of each (graded the research way), totals per season; and the
     whole T: slips a day, ROI, max drawdown, losing days. PASS when the shared builder reproduces the research's P/L (the
     research matrix: both seasons +381u on 874 slips, ROI +44%, drawdown 11.3u, losing days 24% - run 40260781540).
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["APP"] = "UD"
import research_app_final_strategies as AF   # noqa: E402
import ud_portfolio_t as PT                   # noqa: E402

E = AF.E


def research_slip(legs, uid, rows):
    kind, prm, size, _st = PT.UNITS[uid]
    if kind == "doc":
        sl = E.build_day_slips(E.eligible_legs(rows), prm, size, 1)
        return [(l["player"], l["prop"], l["side"], float(l["line"])) for l in sl[0]] if sl else None, (sl[0] if sl else None)
    pool, side, ps, fl, gc, sk = prm
    pset = AF.PROPSETS[ps]
    base = [l for l in legs if l["tier"] in AF.POOLS[pool] and l["side"] in AF.SIDES[side] and (pset is None or AF.GRP.get(l["prop"]) in pset)]
    cand = [l for l in sorted(base, key=lambda l: -l["p"] * l["m"]) if l["p"] >= fl][sk:]
    pick, players, games = [], set(), defaultdict(int)
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1
        if len(pick) == size:
            break
    if len(pick) < size:
        return None, None
    return [(l["player"], l["prop"], l["side"], float(l["line"])) for l in pick], pick


def pay(slip, factor_key):
    live = [l for l in slip if l["hit"] is not None]
    p = AF.UDL.payout("standard", [{"hit": l["hit"], "factor": float(l[factor_key])} for l in live])
    return (1.0 if p is None else p) - 1.0


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    res = {u: [] for u in PT.UNITS}      # (season, research pl or None, shared pl or None, identical)
    seas, dd_r, dd_s = [], [], []
    same_units = 0
    for i, d in enumerate(days):
        st = AF.box(conn, d)
        if not st:
            continue
        legs, rows = AF.load_ud(conn, d, st)
        if not legs:
            continue
        s = AF.season_of(d)
        seas.append(s)
        hits = {(l["player"], l["prop"], l["side"], l["line"]): l["hit"] for l in legs}
        sl_legs = PT.raw_legs(rows); pool = E.eligible_legs(rows)
        day_r = day_s = 0.0
        keys_today = []
        for u in PT.UNITS:
            kr, slr = research_slip(legs, u, rows)
            shared = PT.unit_slip(u, sl_legs, pool, E)
            ks = [(l["player"], l["prop"], l["side"], float(l["line"])) for l in shared] if shared else None
            plr = pls = None
            if slr is not None:
                plr = pay(slr, "factor" if PT.UNITS[u][0] == "doc" else "m")
            if shared is not None:
                pls = pay([{**l, "hit": hits.get((l["player"], l["prop"], l["side"], l["line"]))} for l in shared], "factor")
            res[u].append((s, plr, pls, kr == ks))
            day_r += plr or 0.0; day_s += pls or 0.0
            if ks:
                keys_today.append(tuple(sorted(ks)))
        same_units += len(keys_today) - len(set(keys_today))
        dd_r.append(day_r); dd_s.append(day_s)
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    seas = np.array(seas)
    print(f"slates: {len(seas)} ({', '.join(f'{s} {int((seas == s).sum())}' for s in sorted(set(seas)))})")
    ok = True
    for u, rr in res.items():
        n_r = sum(1 for x in rr if x[1] is not None); n_s = sum(1 for x in rr if x[2] is not None); same = sum(1 for x in rr if x[3])
        print(f"\n{u} {PT.LABEL[u]}: slates {len(rr)} | research slips {n_r} | shared slips {n_s} | identical {same} of {len(rr)}")
        for s in sorted(set(seas)):
            a = [x for x in rr if x[0] == s]
            pr = [x[1] for x in a if x[1] is not None]; ps = [x[2] for x in a if x[2] is not None]
            print(f"   {s}: research {len(pr)} slips {sum(pr):+.2f}u ({100 * sum(pr) / max(len(pr), 1):+.0f}%) | shared {len(ps)} slips "
                  f"{sum(ps):+.2f}u ({100 * sum(ps) / max(len(ps), 1):+.0f}%)")
        if same < len(rr):
            ok = ok and (len(rr) - same) <= max(2, 0.01 * len(rr))
            for k, x in enumerate(rr):
                if not x[3]:
                    print(f"   differs on slate #{k + 1} ({x[0]}): research {x[1]} shared {x[2]}")
    for lab, arr in (("RESEARCH", dd_r), ("SHARED", dd_s)):
        arr = np.array(arr)
        for per in [("history", np.isin(seas, ["2024-25", "2025-26"]))] + [(s, seas == s) for s in sorted(set(seas))]:
            name, m = per
            x = arr[m]
            n = sum(1 for u in res for j, r in enumerate(res[u]) if m[j] and (r[1] if lab == "RESEARCH" else r[2]) is not None)
            c = np.cumsum(x); dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(c) else 0.0
            act = np.array([any((res[u][j][1] if lab == "RESEARCH" else res[u][j][2]) is not None for u in res) for j in np.where(m)[0]])
            lose = float(np.mean(x[act] < 0)) if act.any() else float("nan")
            print(f"{lab:<8} {name:<8}: {n} slips ({n / max(m.sum(), 1):.2f} a day) | profit {x.sum():+.1f}u | ROI {100 * x.sum() / max(n, 1):+.0f}% | "
                  f"max drawdown {dd:.1f}u | losing days {100 * lose:.0f}%")
    print(f"\nidentical slips between units on the same slate: {same_units}")
    print("VERDICT:", "PASS" if ok else "CHECK")


if __name__ == "__main__":
    main()
