#!/usr/bin/env python3
"""RESEARCH - CAN A SLOPE + MARKET RECALIBRATION FIX THE STANDARD-LINE OVER-DISPERSION? (2026-11-11; follows research_calib_audit).
READ-ONLY. Same board / grader as research_calib_audit (live_slip_engine.load_board_legs_live, standard lines only).

The audit showed: standard-line final_hp is right in level (the .45-.55 middle) but over-dispersed in the tails (slope 0.4-0.8 in history,
~0.1 this season; high bins hit 5-20 pts below the number, low bins 2-15 above). The existing layers (ladder shift, board centre) are
level shifts, there is no slope term, and the books' no-vig (explains more than final_hp on its own) is blended only on Underdog.

Models (logistic on the graded standard legs, fitted OUT OF SAMPLE):
  M0 raw final_hp
  M1 slope:   y ~ 1 + logit(fh) + Under + logit(fh) x Under
  M2 slope + market: legs with a books no-vig: y ~ 1 + logit(fh) + logit(nv) + Under; legs without: M1
Training: 2024-25 <- 2025-26, 2025-26 <- 2024-25, 2026-27 <- both history seasons (static) and  <- history + this season's PRIOR days (expanding,
refit every 3 slates, this season's legs weighted x3).
Reported per test period and model: n, log-loss, Brier, calibration slope, ECE (2-pt bins), 1-point-bin gap table for p >= .54 and p <= .46,
top-10 / 25 / 100 legs a slate hit. Plus PART G (players, Over legs only so the two sides cannot cancel).
Env: DATABASE_URL.
"""
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import research_calib_audit as CA                    # noqa: E402

T0 = time.time()
PERIODS = ("2024-25", "2025-26", "2026-27")
lg, fit, ll = CA.lg, CA.fit, CA.ll


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def X1(l):
    u = 1.0 if l["side"] == "Under" else 0.0
    x = lg(l["fh"])
    return [x, u, x * u]


def X2(l):
    u = 1.0 if l["side"] == "Under" else 0.0
    return [lg(l["fh"]), lg(l["nv"]), u]


def fit_w(X, y, w, iters=50):
    X = np.column_stack([np.ones(len(y)), X])
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ b)))
        ww = w * (p * (1 - p) + 1e-9)
        step = np.linalg.solve(X.T @ (X * ww[:, None]) + 1e-6 * np.eye(X.shape[1]), X.T @ (w * (y - p)))
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return b


def train(legs, wts):
    g = [(l, w) for l, w in zip(legs, wts) if l["hit"] is not None]
    y = np.array([l["hit"] for l, _ in g], float); w = np.array([w for _, w in g], float)
    b1 = fit_w(np.array([X1(l) for l, _ in g]), y, w)
    gm = [(l, ww) for l, ww in g if l["nv"] is not None]
    b2 = fit_w(np.array([X2(l) for l, _ in gm]), np.array([l["hit"] for l, _ in gm], float), np.array([ww for _, ww in gm], float)) if len(gm) > 3000 else None
    return b1, b2


def predict(b, l):
    b1, b2 = b
    if l["nv"] is not None and b2 is not None:
        z = b2[0] + float(np.dot(b2[1:], X2(l)))
    else:
        z = b1[0] + float(np.dot(b1[1:], X1(l)))
    return 1 / (1 + math.exp(-z))


def report(name, legs, ps, slates_idx):
    y = np.array([l["hit"] for l in legs], float); p = np.array(ps)
    b = fit(np.array([[lg(v)] for v in p]), y)
    ece = 0.0
    for lo in np.arange(0.0, 1.0, 0.02):
        m = (p >= lo) & (p < lo + 0.02)
        if m.sum():
            ece += m.sum() * abs(p[m].mean() - y[m].mean())
    ece /= len(p)
    # top-N a slate
    tops = {10: [], 25: [], 100: []}
    by = defaultdict(list)
    for i, l in enumerate(legs):
        by[slates_idx[i]].append(i)
    for _d, ix in by.items():
        ix = sorted(ix, key=lambda i: -p[i])
        for t in tops:
            tops[t] += [y[i] for i in ix[:t]]
    print(f"    {name:<26} n {len(p):7,d} log-loss {ll(p, y):.4f} Brier {np.mean((p - y) ** 2):.4f} cal-slope {b[1]:.2f} ECE {100 * ece:.2f} pts | "
          + " | ".join(f"top{t} {np.mean(v):.3f}" for t, v in tops.items()), flush=True)
    hi = [(lo, [i for i in range(len(p)) if lo <= p[i] < lo + 0.01]) for lo in np.arange(0.54, 0.80, 0.01)]
    parts = [f"{lo:.2f}:{len(ix)}:{np.mean([y[i] for i in ix]) - np.mean([p[i] for i in ix]):+.3f}" for lo, ix in hi if len(ix) >= 40]
    lo_ = [(lo, [i for i in range(len(p)) if lo <= p[i] < lo + 0.01]) for lo in np.arange(0.30, 0.47, 0.01)]
    parts2 = [f"{lo:.2f}:{len(ix)}:{np.mean([y[i] for i in ix]) - np.mean([p[i] for i in ix]):+.3f}" for lo, ix in lo_ if len(ix) >= 40]
    print("        high bins p:n:gap " + " ".join(parts), flush=True)
    print("        low  bins p:n:gap " + " ".join(parts2), flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slates = CA.load(conn)
    conn.close()
    log("slates: " + ", ".join(f"{s} {sum(1 for x in slates if x[0] == s)}" for s in PERIODS))
    std = {s: [(d, [l for l in ls if l["k"] == "R" and l["hit"] is not None]) for ss, d, ls in slates if ss == s] for s in PERIODS}
    flat = {s: [(di, l) for di, (d, ls) in enumerate(std[s]) for l in ls] for s in PERIODS}

    print("\n" + "=" * 150 + "\nRECALIBRATION OUT OF SAMPLE (standard lines)")
    for test, trn in (("2024-25", ("2025-26",)), ("2025-26", ("2024-25",)), ("2026-27", ("2024-25", "2025-26"))):
        tl = [l for t in trn for _d, l in flat[t]]
        b = train(tl, [1.0] * len(tl))
        legs = [l for _d, l in flat[test]]; sidx = [d for d, _l in flat[test]]
        print(f"\n  TEST {test} (trained on {'+'.join(trn)}): M1 coef {np.round(b[0], 3).tolist()} | M2 coef {None if b[1] is None else np.round(b[1], 3).tolist()}")
        report("M0 raw final_hp", legs, [l["fh"] for l in legs], sidx)
        report("M1 slope", legs, [1 / (1 + math.exp(-(b[0][0] + float(np.dot(b[0][1:], X1(l)))))) for l in legs], sidx)
        report("M2 slope + market", legs, [predict(b, l) for l in legs], sidx)
        if test == "2026-27":
            # expanding: history + this season's prior days, this season x3, refit every 3 slates
            days = std[test]
            hist = [l for t in PERIODS[:2] for _d, l in flat[t]]
            ps, ys, ix = [], [], []
            cur = []
            bb = None
            for di, (d, ls) in enumerate(days):
                if bb is None or di % 3 == 0:
                    L_ = hist + cur
                    bb = train(L_, [1.0] * len(hist) + [3.0] * len(cur))
                for l in ls:
                    ps.append(predict(bb, l)); ys.append(l); ix.append(di)
                cur += ls
            print(f"\n  TEST 2026-27 EXPANDING (history + this season's prior days x3, refit every 3 slates)")
            report("M2 expanding", ys, ps, ix)
            ps1 = []
            cur = []
            bb = None
            for di, (d, ls) in enumerate(days):
                if bb is None or di % 3 == 0:
                    bb = train(hist + cur, [1.0] * len(hist) + [3.0] * len(cur))
                for l in ls:
                    ps1.append(1 / (1 + math.exp(-(bb[0][0] + float(np.dot(bb[0][1:], X1(l)))))))
                cur += ls
            report("M1 expanding (no market)", ys, ps1, ix)

    print("\n" + "=" * 150 + "\nPART G (fixed) - players, OVER legs only (the two sides of a leg cancel otherwise)")
    pg = {}
    for s in PERIODS:
        by = defaultdict(list)
        for _d, l in flat[s]:
            if l["side"] == "Over":
                by[l["pid"]].append(l)
        zs, gaps = [], {}
        for pid, ls in by.items():
            if len(ls) < 25:
                continue
            p = np.array([l["fh"] for l in ls]); y = np.array([l["hit"] for l in ls], float)
            se = math.sqrt(float(np.sum(p * (1 - p)))) / len(ls)
            zs.append((y.mean() - p.mean()) / se)
            gaps[pid] = (y.mean() - p.mean(), len(ls), ls[0]["player"])
        pg[s] = gaps
        if zs:
            print(f"  {s}: players >= 25 Over legs {len(zs)}; z of gap mean {np.mean(zs):+.2f} sd {np.std(zs):.2f} (1.00 = no player effect); |z|>2: {100 * np.mean([abs(z) > 2 for z in zs]):.1f}% (4.6% expected)")
    for a, b in (("2024-25", "2025-26"), ("2025-26", "2026-27"), ("2024-25", "2026-27")):
        common = [p for p in pg[a] if p in pg[b] and pg[a][p][1] >= 30 and pg[b][p][1] >= 15]
        if len(common) > 20:
            print(f"  persistence {a} -> {b}: {len(common)} players, corr of gaps {np.corrcoef([pg[a][p][0] for p in common], [pg[b][p][0] for p in common])[0, 1]:+.3f}")
    gs = sorted([(v[0], v[1], v[2]) for v in pg["2026-27"].values() if v[1] >= 15])
    print("  this season, most over-rated:  " + "; ".join(f"{n} {g * 100:+.1f}pts n{k}" for g, k, n in gs[:12]))
    print("  this season, most under-rated: " + "; ".join(f"{n} {g * 100:+.1f}pts n{k}" for g, k, n in gs[-12:]))
    log("DONE")


if __name__ == "__main__":
    main()
