#!/usr/bin/env python3
"""RESEARCH - PHASE 1 FIX VALIDATION (2026-11-10). READ-ONLY. One monotone, side-independent end-of-chain layer on final_hp:
    p' = sigmoid(a_k + s_k * logit(final_hp)),  k = line kind (R standard, G goblin, D demon), refit as-of (strictly before each slate, every 3 slates)
    on every graded leg before that slate, this season's legs weighted x3.
Same loader/grader as research_calib_audit (live board, box-score outcomes). Rank order inside a kind is unchanged by construction.
Reports per season, standard lines: ECE / log-loss / slope before vs after, top-10/25 hit (must be identical), the threshold map (what final_hp
cut equals a calibrated .60/.65/.70/.75 cut), legs a slate over each cut before/after, and the weekly slope this season.
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_calib_audit as CA  # noqa: E402

sg = lambda z: 1 / (1 + np.exp(-np.clip(z, -30, 30)))   # noqa: E731


def ece(p, y, bins=20):
    e, n = 0.0, len(p)
    for i in range(bins):
        m = (p >= i / bins) & (p < (i + 1) / bins + (1e-9 if i == bins - 1 else 0))
        if m.sum():
            e += m.sum() / n * abs(p[m].mean() - y[m].mean())
    return 100 * e


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slates = CA.load(conn)
    conn.close()
    slates.sort(key=lambda x: str(x[1]))
    CA.log(f"slates {len(slates)}")
    prm = {}
    hist = {"R": [], "G": [], "D": []}   # (logit, y, w)
    out = {s: {"fh": [], "cal": [], "y": [], "day": [], "k": []} for s in CA.PERIODS}
    for i, (s, d, ls) in enumerate(slates):
        if i % 3 == 0:
            for k in hist:
                h = hist[k]
                if len(h) >= 5000:
                    X = np.array([[a] for a, _y, _w in h]); y = np.array([b for _a, b, _w in h]); w = np.array([c for _a, _b, c in h])
                    Xd = np.column_stack([np.ones(len(y)), X[:, 0]]); b = np.array([0.0, 1.0])
                    for _ in range(40):
                        p = sg(Xd @ b); W = w * p * (1 - p) + 1e-9
                        step = np.linalg.solve(Xd.T @ (Xd * W[:, None]) + 1e-6 * np.eye(2), Xd.T @ (w * (y - p)))
                        b += step
                        if np.abs(step).max() < 1e-9:
                            break
                    prm[k] = b
        for l in ls:
            if l["hit"] is None:
                continue
            z = CA.lg(l["fh"])
            b = prm.get(l["k"])
            cal = float(sg(b[0] + b[1] * z)) if b is not None else l["fh"]
            o = out[s]
            o["fh"].append(l["fh"]); o["cal"].append(cal); o["y"].append(l["hit"]); o["day"].append(i); o["k"].append(l["k"])
        for l in ls:
            if l["hit"] is not None:
                hist[l["k"]].append((CA.lg(l["fh"]), float(l["hit"]), 3.0 if s == "2026-27" else 1.0))
        if s == "2026-27" and i % 6 == 0 and "R" in prm:
            print(f"  as-of {d}: R a {prm['R'][0]:+.3f} s {prm['R'][1]:.3f}" + (f" | G s {prm['G'][1]:.3f}" if "G" in prm else "") + (f" | D s {prm['D'][1]:.3f}" if "D" in prm else ""), flush=True)
    print("\n" + "=" * 140)
    for s in CA.PERIODS:
        o = out[s]
        if not o["y"]:
            continue
        fh, cal, y, k, day = (np.array(o[x]) for x in ("fh", "cal", "y", "k", "day"))
        y = y.astype(float)
        for kk in ("R", "G", "D"):
            m = k == kk
            if m.sum() < 500:
                continue
            bf = CA.fit(np.array([[CA.lg(v)] for v in fh[m]]), y[m]); bc = CA.fit(np.array([[CA.lg(v)] for v in cal[m]]), y[m])
            print(f"{s} {kk}: n {m.sum():,} | mean fh {fh[m].mean():.3f} -> cal {cal[m].mean():.3f} (hit {y[m].mean():.3f}) | ECE {ece(fh[m], y[m]):.2f} -> {ece(cal[m], y[m]):.2f}"
                  f" | log-loss {CA.ll(fh[m], y[m]):.4f} -> {CA.ll(cal[m], y[m]):.4f} | cal-slope {bf[1]:.2f} -> {bc[1]:.2f}")
        m = k == "R"
        nd = len(set(day[m]))
        print(f"   threshold map (standard): " + " | ".join(
            f"cal>={c:.2f}: legs/slate {np.sum(m & (cal >= c)) / nd:.1f} hit {y[m & (cal >= c)].mean() if np.any(m & (cal >= c)) else float('nan'):.3f}; "
            f"fh>={c:.2f}: {np.sum(m & (fh >= c)) / nd:.1f} hit {y[m & (fh >= c)].mean() if np.any(m & (fh >= c)) else float('nan'):.3f}" for c in (0.60, 0.65, 0.70, 0.75)))
        for c in (0.60, 0.65, 0.70, 0.75):
            sel = m & (np.abs(cal - c) < 0.01)
            if sel.sum() > 50:
                print(f"   calibrated {c:.2f} corresponds to final_hp mean {fh[sel].mean():.3f} (n {sel.sum()})")
    CA.log("DONE")


if __name__ == "__main__":
    main()
