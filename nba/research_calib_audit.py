#!/usr/bin/env python3
"""RESEARCH - CALIBRATION AUDIT of final_hp on the live engine's own board (2026-11-10, owner: "is our hit probability and scoring
assertive or does it need calibration and sharpening ... find the root cause"). READ-ONLY.

Same board / grader as research_pp_deep_review PART A (live_slip_engine.load_board_legs_live, 12 calibrated props), no market part.
  A  per period x line type x side x EVERY prop: n, mean final_hp, hit, gap (hit - mean), slope
  B  standard lines by probability band per period x side (all props together)
  C  this season by calendar week (standard lines): mean, hit, slope per side - is it drifting / improving
  D  ranking power: top 10 / 25 / 100 standard legs a slate by final_hp, per period and side, vs the average standard leg
  E  residual scan on standard legs: hit - final_hp by player-level features known before the game (line size bucket, team home/away not
     available here -> line bucket, prop group, event position) per period
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
import live_slip_engine as L                         # noqa: E402
import portfolio_b as PB                             # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
from final_hp_board_cal import PROPS as CAL_PROPS    # noqa: E402

T0 = time.time()
PERIODS = ("2024-25", "2025-26", "2026-27")


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def lg(x):
    x = min(max(float(x), 1e-4), 1 - 1e-4)
    return math.log(x / (1 - x))


def fit(X, y, iters=50):
    X = np.column_stack([np.ones(len(y)), X])
    b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ b)))
        w = p * (1 - p) + 1e-9
        step = np.linalg.solve(X.T @ (X * w[:, None]) + 1e-6 * np.eye(X.shape[1]), X.T @ (y - p))
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return b


def kind(t):
    return "R" if t == "R" else "G" if str(t).startswith("G") else "D"


def load(conn):
    days = AF.slate_days(conn)
    use = [(AF.season_of(d), d) for d in days if AF.season_of(d) in PERIODS]
    out = []
    for i, (s, d) in enumerate(use):
        rows = L.load_board_legs_live(conn, d)
        legs = [l for l in rows if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None
                and l["prop"] in CAL_PROPS and l.get("team_id") is not None]
        if not legs:
            continue
        st = AF.box(conn, d)
        if not st:
            continue
        keep = []
        for l in legs:
            h = AF.outcome(st, l)
            keep.append({"player": l["player"], "prop": l["prop"], "k": kind(l["tier"]), "side": l["side"], "line": float(l["line"]),
                         "fh": float(l["score"]), "hit": h, "event_id": l["event_id"], "grp": PB.GRP.get(l["prop"])})
        out.append((s, d, keep))
        if i % 25 == 0:
            log(f"loaded {i + 1}/{len(use)} {d}: {len(keep)} legs")
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    return out


def line_stats(legs):
    g = [l for l in legs if l["hit"] is not None]
    if len(g) < 60:
        return None
    x = np.array([l["fh"] for l in g]); y = np.array([l["hit"] for l in g], float)
    b = fit(np.array([[lg(v)] for v in x]), y)
    return len(g), x.mean(), y.mean(), y.mean() - x.mean(), b[1]


def fmt(name, st):
    if st is None:
        return
    n, m, h, gap, sl = st
    print(f"    {name:<46} n {n:7,d} mean {m:.3f} hit {h:.3f} gap {100 * gap:+5.1f} pts slope {sl:.2f}", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slates = load(conn)
    conn.close()
    log("slates: " + ", ".join(f"{s} {sum(1 for x in slates if x[0] == s)}" for s in PERIODS))
    props = sorted({l["prop"] for _s, _d, ls in slates for l in ls})

    print("\n" + "=" * 150 + "\nPART A - per period x line type x side x prop (gap = hit - mean final_hp, negative = over-confident)")
    for s in PERIODS:
        g = [l for ss, _d, ls in slates if ss == s for l in ls]
        print(f"  {s}")
        for k in ("R", "G", "D"):
            for sd in ("Over", "Under"):
                fmt(f"{k} {sd} ALL", line_stats([l for l in g if l["k"] == k and l["side"] == sd]))
        for p in props:
            for sd in ("Over", "Under"):
                fmt(f"R {sd} {p}", line_stats([l for l in g if l["k"] == "R" and l["side"] == sd and l["prop"] == p]))

    print("\n" + "=" * 150 + "\nPART B - standard lines by band")
    bins = [0, .45, .50, .55, .60, .65, .70, .75, .80, 1.01]
    for s in PERIODS:
        for sd in ("Over", "Under"):
            g = [l for ss, _d, ls in slates if ss == s for l in ls if l["k"] == "R" and l["side"] == sd and l["hit"] is not None]
            parts = []
            for lo, hi in zip(bins, bins[1:]):
                m = [l for l in g if lo <= l["fh"] < hi]
                if len(m) >= 80:
                    parts.append(f"{lo:.2f}-{hi:.2f} n{len(m)} {np.mean([l['fh'] for l in m]):.3f}->{np.mean([l['hit'] for l in m]):.3f}")
            print(f"  {s} {sd}: " + " ; ".join(parts))

    print("\n" + "=" * 150 + "\nPART C - this season by calendar week, standard lines (all props)")
    import datetime as dt
    wk = defaultdict(list)
    for s, d, ls in slates:
        if s == "2026-27":
            dd = d if isinstance(d, dt.date) else dt.date.fromisoformat(str(d)[:10])
            wk[(dd - dt.date(2026, 10, 19)).days // 7].append(ls)
    for w in sorted(wk):
        for sd in ("Over", "Under"):
            fmt(f"week {w} {sd}", line_stats([l for ls in wk[w] for l in ls if l["k"] == "R" and l["side"] == sd]))

    print("\n" + "=" * 150 + "\nPART D - ranking power: top-N standard legs per slate by final_hp (hit) vs all standard legs")
    for s in PERIODS:
        for sd in ("Over", "Under", "Both"):
            row = []
            allh = []
            tops = {10: [], 25: [], 100: []}
            for ss, _d, ls in slates:
                if ss != s:
                    continue
                g = [l for l in ls if l["k"] == "R" and l["hit"] is not None and (sd == "Both" or l["side"] == sd)]
                allh += [l["hit"] for l in g]
                g.sort(key=lambda l: -l["fh"])
                for t in tops:
                    tops[t] += [l["hit"] for l in g[:t]]
            print(f"  {s} {sd}: all {np.mean(allh):.3f} (n {len(allh):,}) | " + " | ".join(f"top{t} {np.mean(v):.3f}" for t, v in tops.items() if v))

    print("\n" + "=" * 150 + "\nPART E - residual (hit - final_hp) of standard legs by line bucket / prop group / side")
    for s in PERIODS:
        g = [l for ss, _d, ls in slates if ss == s for l in ls if l["k"] == "R" and l["hit"] is not None]
        print(f"  {s}")
        for grp in ("lowvol", "main"):
            for sd in ("Over", "Under"):
                fmt(f"{grp} {sd}", line_stats([l for l in g if (l["grp"] == "lowvol") == (grp == "lowvol") and l["side"] == sd]))
        for lo, hi in ((0, 1), (1, 3), (3, 6), (6, 10), (10, 18), (18, 28), (28, 99)):
            for sd in ("Over", "Under"):
                fmt(f"line [{lo},{hi}) {sd}", line_stats([l for l in g if lo <= l["line"] < hi and l["side"] == sd]))
    log("DONE")


if __name__ == "__main__":
    main()
