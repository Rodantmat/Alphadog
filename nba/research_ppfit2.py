#!/usr/bin/env python3
"""
PP FIT 2 - SLIP PRICING WITH ROUNDING. READ-ONLY. (owner 2026-11-20 15:45 PT "we need to get it today")
Fit 1 showed PrizePicks' Power payouts sit on a grid (0.1 steps below 3x, 0.25 from 3x, 0.5 higher ...), so a log-least-squares fit of
leg weights is blurred by rounding. Here each quote is an INTERVAL: true value base_k * prod g_i lies in the rounding cell of the shown
payout. Per quote window (run_file) an LP finds leg log-weights x_i that put every quote inside its cell (minimum total slack).
Conventions tested: nearest (cell = v +/- step/2), floor (cell = [v, v+step)), ceil (cell = (v-step, v]).
Exactness test (honest): 5-fold hold-out inside each window - fit on 80% of its quotes, predict the held-out quotes whose legs are all in
the training fold, round with the convention, and count exact matches to PrizePicks' payout.
Env: DATABASE_URL, PPFIT_SINCE (default 2026-10-19), PPFIT_SG (all | none: drop slips with two legs from one game).
"""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg
from scipy.optimize import linprog

BASE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}


def bands(vals):
    vals = sorted(set(round(v, 4) for v in vals))
    edges = [0, 3, 10, 20, 50, 100, 1e9]
    out = []
    for lo, hi in zip(edges, edges[1:]):
        b = [v for v in vals if lo <= v < hi]
        gaps = [round(b2 - b1, 4) for b1, b2 in zip(b, b[1:]) if b2 - b1 > 1e-6]
        st = min(gaps) if gaps else None
        out.append((lo, hi, st, len(b)))
    return out


def step_of(v, bd):
    for lo, hi, st, _ in bd:
        if lo <= v < hi:
            return st or 0.5
    return 1.0


def cell(v, st, conv):
    if conv == "nearest":
        return max(v - st / 2, 1e-6), v + st / 2
    if conv == "floor":
        return v, v + st
    return max(v - st, 1e-6), v


def fit(qs, idx, conv, bd):
    """LP: minimise total slack; returns x (log weights) and per-quote slack"""
    nq, nv = len(qs), len(idx)
    # variables: x (nv, free), s (nq, >=0)
    c = np.concatenate([np.zeros(nv), np.ones(nq)])
    A, b = [], []
    for i, q in enumerate(qs):
        lo, hi = cell(q["top"], step_of(q["top"], bd), conv)
        row = np.zeros(nv + nq)
        for k in q["keys"]:
            row[idx[k]] = 1
        r_hi = row.copy(); r_hi[nv + i] = -1
        A.append(r_hi); b.append(np.log(hi) - np.log(BASE[q["n"]]) - 1e-9)
        r_lo = -row.copy(); r_lo[nv + i] = -1
        A.append(r_lo); b.append(-(np.log(lo) - np.log(BASE[q["n"]])) - 1e-9)
    bounds = [(-3, 3)] * nv + [(0, None)] * nq
    r = linprog(c, A_ub=np.array(A), b_ub=np.array(b), bounds=bounds, method="highs")
    if not r.success:
        return None, None
    return r.x[:nv], r.x[nv:]


def round_to(v, st, conv):
    if conv == "nearest":
        return round(round(v / st) * st, 4)
    if conv == "floor":
        return round(np.floor(v / st + 1e-9) * st, 4)
    return round(np.ceil(v / st - 1e-9) * st, 4)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPFIT_SINCE", "2026-10-19")
    only = os.environ.get("PPFIT_SG", "all")
    rows = conn.execute("SELECT run_file, n, power, legs FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 2 AND 6 AND quoted_at >= %s", (since,)).fetchall()
    by = defaultdict(list)
    allv = []
    for rf, n, pw, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        nalt = sum(1 for l in legs if l.get("odds") != "standard")
        gs = [l.get("game") for l in legs]
        sg = sum(1 for i in range(len(gs)) for j in range(i + 1, len(gs)) if gs[i] and gs[i] == gs[j])
        if nalt == 0 or (only == "none" and sg):
            continue
        allv.append(top)
        by[(rf, n) if os.environ.get("PPFIT_PERSIZE") else rf].append(dict(n=n, top=top, nalt=nalt, sg=sg, keys=[f"{l.get('id')}|{l.get('odds')}|{l.get('side')}|{l.get('line')}" for l in legs]))
    bd = bands(allv)
    print(f"FIT2|quotes with alternates={len(allv)} windows={len(by)} | grid by band: " + " ; ".join(f"[{lo},{hi}) step {st} ({nb} values)" for lo, hi, st, nb in bd))
    rng = np.random.default_rng(7)
    for conv in (os.environ.get("PPFIT_CONV") or "nearest,floor,ceil").split(","):
        insample_ok = insample_n = 0
        ho = defaultdict(lambda: [0, 0])
        for rf, qs in by.items():
            if len(qs) < 6:
                continue
            idx = {}
            for q in qs:
                for k in q["keys"]:
                    idx.setdefault(k, len(idx))
            x, s = fit(qs, idx, conv, bd)
            if x is None:
                continue
            insample_n += len(qs); insample_ok += int((s < 1e-7).sum())
            fold = rng.integers(0, 5, len(qs))
            for f in range(5):
                tr = [q for q, fo in zip(qs, fold) if fo != f]
                te = [q for q, fo in zip(qs, fold) if fo == f]
                idx2 = {}
                for q in tr:
                    for k in q["keys"]:
                        idx2.setdefault(k, len(idx2))
                if not tr or not te:
                    continue
                x2, _ = fit(tr, idx2, conv, bd)
                if x2 is None:
                    continue
                for q in te:
                    if not all(k in idx2 for k in q["keys"]):
                        continue
                    v = BASE[q["n"]] * np.exp(sum(x2[idx2[k]] for k in q["keys"]))
                    pr = round_to(v, step_of(v, bd), conv)
                    key = (q["n"], min(q["nalt"], 3))
                    ho[key][0] += 1; ho[key][1] += int(abs(pr - q["top"]) < 1e-6)
        print(f"FIT2|{conv:7s}: in-sample quotes inside their cell with zero slack {insample_ok}/{insample_n} ({100*insample_ok/max(1,insample_n):.1f}%)")
        tot = [0, 0]
        for key in sorted(ho):
            n_, ok = ho[key]; tot[0] += n_; tot[1] += ok
            print(f"FIT2|{conv:7s}:   hold-out n={key[0]} alts={key[1]}{'+' if key[1]==3 else ''}: exact {ok}/{n_} ({100*ok/max(1,n_):.0f}%)")
        print(f"FIT2|{conv:7s}: hold-out exact total {tot[1]}/{tot[0]} ({100*tot[1]/max(1,tot[0]):.1f}%)")


if __name__ == "__main__":
    main()
