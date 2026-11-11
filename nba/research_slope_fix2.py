#!/usr/bin/env python3
"""RESEARCH - PHASE 1 FIX v2 (2026-11-10). READ-ONLY. v1 (slope fitted on all prior seasons) over-corrected 2025-26 (ECE .34 -> 1.34) because calibration
slope is SEASON-SPECIFIC (.78 in 25-26, .15 in 26-27). v2: p' = sigmoid(a + s*logit(final_hp)) per line kind, fitted ONLY on the current season's own
graded legs strictly before the slate (refit every 3 slates), shrunk toward identity by n/(n+K): (a, s) = (a_hat, s_hat) * w + (0, 1) * (1 - w).
K in {2000, 5000, 20000}; also standard-line (R) only variant. Reports per season/kind ECE, log-loss, cal-slope before/after for each K, top-N hit unchanged.
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_calib_audit as CA  # noqa: E402

sg = lambda z: 1 / (1 + np.exp(-np.clip(z, -30, 30)))   # noqa: E731
KS = (2000, 5000, 20000)


def ece(p, y, bins=20):
    e, n = 0.0, len(p)
    for i in range(bins):
        m = (p >= i / bins) & (p < (i + 1) / bins + (1e-9 if i == bins - 1 else 0))
        if m.sum():
            e += m.sum() / n * abs(p[m].mean() - y[m].mean())
    return 100 * e


def fit2(z, y):
    X = np.column_stack([np.ones(len(y)), z]); b = np.array([0.0, 1.0])
    for _ in range(40):
        p = sg(X @ b); W = p * (1 - p) + 1e-9
        step = np.linalg.solve(X.T @ (X * W[:, None]) + 1e-6 * np.eye(2), X.T @ (y - p))
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return b


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slates = CA.load(conn)
    conn.close()
    slates.sort(key=lambda x: str(x[1]))
    res = {s: {K: {"fh": [], "cal": [], "y": [], "k": [], "day": []} for K in KS} for s in CA.PERIODS}
    seen = {s: {"R": ([], []), "G": ([], []), "D": ([], [])} for s in CA.PERIODS}
    prm = {s: {K: {} for K in KS} for s in CA.PERIODS}
    for i, (s, d, ls) in enumerate(slates):
        if i % 3 == 0:
            for k in "RGD":
                z, y = seen[s][k]
                if len(y) >= 300:
                    bh = fit2(np.array(z), np.array(y))
                    for K in KS:
                        w = len(y) / (len(y) + K)
                        prm[s][K][k] = (w * bh[0], w * bh[1] + (1 - w))
        for l in ls:
            if l["hit"] is None:
                continue
            z = CA.lg(l["fh"])
            for K in KS:
                b = prm[s][K].get(l["k"])
                cal = float(sg(b[0] + b[1] * z)) if b else l["fh"]
                r = res[s][K]
                r["fh"].append(l["fh"]); r["cal"].append(cal); r["y"].append(l["hit"]); r["k"].append(l["k"]); r["day"].append(i)
        for l in ls:
            if l["hit"] is not None:
                seen[s][l["k"]][0].append(CA.lg(l["fh"])); seen[s][l["k"]][1].append(float(l["hit"]))
    print("\n" + "=" * 140)
    for s in CA.PERIODS:
        for K in KS:
            r = res[s][K]
            if not r["y"]:
                continue
            fh, cal, y, k, day = (np.array(r[x]) for x in ("fh", "cal", "y", "k", "day")); y = y.astype(float)
            for kk in "RGD":
                m = k == kk
                if m.sum() < 500:
                    continue
                bf = CA.fit(np.array([[CA.lg(v)] for v in fh[m]]), y[m]); bc = CA.fit(np.array([[CA.lg(v)] for v in cal[m]]), y[m])
                print(f"{s} K={K:<6} {kk}: n {m.sum():,} | ECE {ece(fh[m], y[m]):.2f} -> {ece(cal[m], y[m]):.2f} | log-loss {CA.ll(fh[m], y[m]):.4f} -> {CA.ll(cal[m], y[m]):.4f}"
                      f" | cal-slope {bf[1]:.2f} -> {bc[1]:.2f} | mean fh {fh[m].mean():.3f} cal {cal[m].mean():.3f} hit {y[m].mean():.3f}")
        r = res[s][5000]
        fh, cal, y, k = (np.array(r[x]) for x in ("fh", "cal", "y", "k")); y = y.astype(float)
        m = k == "R"
        nd = max(1, len(set(np.array(r["day"])[m])))
        print(f"   {s} K=5000 standard cuts (legs/slate, hit): " + " | ".join(
            f"cal>={c:.2f}: {np.sum(m & (cal >= c)) / nd:.1f} {y[m & (cal >= c)].mean() if np.any(m & (cal >= c)) else float('nan'):.3f}; fh>={c:.2f}: {np.sum(m & (fh >= c)) / nd:.1f} {y[m & (fh >= c)].mean() if np.any(m & (fh >= c)) else float('nan'):.3f}" for c in (0.60, 0.65, 0.70)))
    CA.log("DONE")


if __name__ == "__main__":
    main()
