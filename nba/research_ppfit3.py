#!/usr/bin/env python3
"""
PP FIT 3 - ADJUSTED-BASE PRODUCT MODEL, LEAST SQUARES, HONEST HOLD-OUT. READ-ONLY. (owner 2026-11-20 15:45 PT)
Model: Power_k = R( B_k * prod_{alternates} f_i * prod_{standards} s_j )
  B_k   = the base PrizePicks uses once a lineup holds an alternate (adjusted lineups), one per size, per quote window
  f_i   = the alternate's own weight; s_j = a standard's weight (PPFIT3_STD=fixed -> 1, free -> fitted with a ridge to 1)
  R     = PrizePicks' rounding grid (0.1 < 3x, 0.25 < 10x, 0.5 < 50x, 1 above)
2-pick quotes at the grid ends (<= 1.9, >= 18) are clamped and are left out.
Hold-out: per window, 5 folds; a held-out quote is predicted only when every alternate in it was seen in the training fold.
Reports exact matches, within one grid step, median / p90 relative error, by size and alternate count; and the fitted bases.
Env: DATABASE_URL, PPFIT_SINCE (2026-10-19), PPFIT3_STD (fixed|free), PPFIT_SG (all|none).
"""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg

BASE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def rnd(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def design(qs, std_mode):
    idx = {}
    for k in (3, 4, 5, 6):
        idx[f"B{k}"] = len(idx)
    for q in qs:
        for key, is_alt in q["legs"]:
            if is_alt or std_mode == "free":
                idx.setdefault(key, len(idx))
    A = np.zeros((len(qs), len(idx))); y = np.zeros(len(qs))
    for i, q in enumerate(qs):
        if q["n"] > 2:
            A[i, idx[f"B{q['n']}"]] = 1
        for key, is_alt in q["legs"]:
            if key in idx:
                A[i, idx[key]] = 1
        y[i] = np.log(q["top"] / BASE[q["n"]])
    return idx, A, y


def solve(A, y, idx, std_mode):
    reg = np.zeros(A.shape[1])
    for k, j in idx.items():
        if k.startswith("B"):
            reg[j] = 1e-6
        elif "|standard|" in k:
            reg[j] = 0.5 if std_mode == "free" else 0
        else:
            reg[j] = 1e-4
    return np.linalg.solve(A.T @ A + np.diag(reg), A.T @ y)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPFIT_SINCE", "2026-10-19")
    std_mode = os.environ.get("PPFIT3_STD", "fixed")
    only = os.environ.get("PPFIT_SG", "none")
    rows = conn.execute("SELECT run_file, n, power, legs, extract(epoch FROM quoted_at::timestamptz)::bigint FROM nba_market.pp_quote WHERE status=200 AND n BETWEEN 2 AND 6 AND quoted_at >= %s", (since,)).fetchall()
    by = defaultdict(list)
    W = int(os.environ.get("PPFIT3_WIN", "0"))      # seconds; 0 = whole run_file
    for rf, n, pw, legs, ts in rows:
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
        if n == 2 and (top <= 1.9 + 1e-9 or top >= 18 - 1e-9):
            continue
        by[(rf, ts // W) if W else rf].append(dict(n=n, top=top, nalt=nalt, legs=[(f"{l.get('id')}|{l.get('odds')}|{l.get('side')}|{l.get('line')}", l.get("odds") != "standard") for l in legs]))
    rng = np.random.default_rng(11)
    stats = defaultdict(list)          # (n, nalt) -> list of (exact, within1, relerr)
    bases = []
    for rf, qs in by.items():
        if len(qs) < int(os.environ.get("PPFIT3_MINQ", "8")) or not any(q["n"] > 2 for q in qs):
            continue
        idx, A, y = design(qs, std_mode)
        x = solve(A, y, idx, std_mode)
        bases.append([np.exp(x[idx[f"B{k}"]]) * BASE[k] if A[:, idx[f"B{k}"]].sum() > 0 else np.nan for k in (3, 4, 5, 6)])
        fold = rng.integers(0, 5, len(qs))
        for f in range(5):
            tr = [q for q, fo in zip(qs, fold) if fo != f]
            te = [q for q, fo in zip(qs, fold) if fo == f]
            if len(tr) < 5 or not te:
                continue
            i2, A2, y2 = design(tr, std_mode)
            x2 = solve(A2, y2, i2, std_mode)
            seen_b = {k: A2[:, i2[f"B{k}"]].sum() > 0 for k in (3, 4, 5, 6)}
            for q in te:
                if not all(key in i2 for key, is_alt in q["legs"] if is_alt):
                    continue
                if q["n"] > 2 and not seen_b[q["n"]]:
                    continue
                lv = (x2[i2[f"B{q['n']}"]] if q["n"] > 2 else 0.0) + sum(x2[i2[key]] for key, _ in q["legs"] if key in i2)
                v = BASE[q["n"]] * np.exp(lv)
                pr = rnd(v)
                stats[(q["n"], min(q["nalt"], 3))].append((abs(pr - q["top"]) < 1e-6, abs(pr - q["top"]) <= step(q["top"]) + 1e-6, abs(v / q["top"] - 1)))
    b = np.array(bases)
    print(f"FIT3|std={std_mode} sg={only} window={os.environ.get('PPFIT3_WIN', 'run')}s windows={len(bases)}")
    print("FIT3|adjusted bases (median over windows, p10-p90): " + " | ".join(f"{k}-pick {np.nanmedian(b[:, j]):.3f} ({np.nanpercentile(b[:, j], 10):.3f}-{np.nanpercentile(b[:, j], 90):.3f})" for j, k in enumerate((3, 4, 5, 6))))
    tot = []
    for key in sorted(stats):
        v = stats[key]; tot += v
        e = np.array([t[2] for t in v])
        print(f"FIT3|  n={key[0]} alts={key[1]}{'+' if key[1] == 3 else ''}: {len(v):4d} | exact {100*np.mean([t[0] for t in v]):.0f}% | within 1 step {100*np.mean([t[1] for t in v]):.0f}% | rel err median {100*np.median(e):.2f}% p90 {100*np.percentile(e, 90):.2f}%")
    e = np.array([t[2] for t in tot])
    print(f"FIT3|TOTAL {len(tot)} | exact {100*np.mean([t[0] for t in tot]):.1f}% | within 1 step {100*np.mean([t[1] for t in tot]):.1f}% | rel err median {100*np.median(e):.2f}% p90 {100*np.percentile(e, 90):.2f}%")


if __name__ == "__main__":
    main()
