#!/usr/bin/env python3
"""
RESEARCH - THE CHAIN THAT GOES INTO final_hp ITSELF, WALK-FORWARD (2026-10-22 21:30 PT; owner 21:01 PT: "the final hit probability and
board hit probability should be the same thing ... board scoped, app board scoped"). READ-ONLY.

final_hp is app-agnostic: one row per (date, player, prop, line, side) whatever app offered the line, so PrizePicks' price (factor)
cannot be an input. Candidates, all on build_board_hp.py's training set and its L1 (board-centred ladder):
  A  L1 + L2 (line type x side) + L3 (prop x line type x side, anchored on PrizePicks' price q)  - the board_hp chain
  B  L1 + L2P (prop x line type x side, shrunk to line type x side by n / (n + K))              - no price input
  C  L1 + L2 (line type x side)                                                                 - simplest
Line type from the LINE alone (as final_hp must): R when line = L0, else G / D by side of L0, rung = min(max(|round(line - L0)|, 1), 3)
- checked against PrizePicks' own labels. Walk-forward: every month fitted on legs before its first day.
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_board_hp as B   # noqa: E402
import psycopg               # noqa: E402

LTS = B.LTS


def lt_from_line(line, L0):
    if abs(line - L0) < 1e-9:
        return "R"
    r = min(max(int(abs(round(line - L0))), 1), 3)
    return ("G" if line < L0 else "D") + str(r)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    T = B.load_training(conn)
    lines, L0s = T.get("line"), T.get("L0")
    if lines is None:
        sys.exit("load_training must expose line / L0 (build_board_hp.py v1.1)")
    LTL = np.array([lt_from_line(a, b) for a, b in zip(lines, L0s)])
    agree = float(np.mean(LTL == T["lt"]))
    print(f"line-derived type = PrizePicks' type on {agree:.1%} of legs; mismatches (PrizePicks -> line-derived):", flush=True)
    mm = defaultdict(int)
    for a, b in zip(T["lt"], LTL):
        if a != b:
            mm[(a, b)] += 1
    print("  " + ", ".join(f"{a}->{b} {n:,}" for (a, b), n in sorted(mm.items(), key=lambda kv: -kv[1])[:12]), flush=True)

    P, S, Y, Q, DAY = T["prop"], T["side"], T["y"], T["q"], T["day"]
    MO = np.array([f"{d.year}-{d.month:02d}" for d in DAY])

    def fit_w(tr):
        return {pr: (1.0 if (tr & (P == pr)).sum() < 300 else
                     float(min(B.WGRID, key=lambda x: B.ll(T["pw"][x][tr & (P == pr)], Y[tr & (P == pr)])))) for pr in B.PROPS}

    def l1(w):
        return np.choose(np.array([B.WGRID.index(w[pr]) for pr in P]), [T["pw"][x] for x in B.WGRID])

    def run(tr, te, LT):
        w = fit_w(tr)
        p1 = l1(w)
        out = {"L1": p1.copy()}
        # C: L2 per line type x side
        p2 = p1.copy()
        for lt in LTS:
            for sd in ("Over", "Under"):
                m = tr & (LT == lt) & (S == sd); mt = te & (LT == lt) & (S == sd)
                if m.sum() < 200:
                    continue
                b = B.fit_logistic(np.column_stack([np.ones(m.sum()), B.logit(p1[m])]), Y[m])
                p2[m | mt] = B.sig(b[0] + b[1] * B.logit(p1[m | mt]))
        out["C"] = p2.copy()
        # A: + L3 with q
        p3 = p2.copy()
        X = lambda m: np.column_stack([np.ones(m.sum()), B.logit(p2[m]), B.logit(Q[m])])   # noqa: E731
        for lt in LTS:
            for sd in ("Over", "Under"):
                m = tr & (LT == lt) & (S == sd)
                if m.sum() < 200:
                    continue
                bp = B.fit_logistic(X(m), Y[m])
                for pr in B.PROPS:
                    mc, mt = m & (P == pr), te & (LT == lt) & (S == sd) & (P == pr)
                    if not mt.any():
                        continue
                    nc = int(mc.sum())
                    beta = bp if nc < 30 else (nc / (nc + B.K)) * B.fit_logistic(X(mc), Y[mc]) + (1 - nc / (nc + B.K)) * bp
                    p3[mt] = B.sig(X(mt) @ beta)
        out["A"] = p3
        # B: L2P per prop x line type x side, shrunk to line type x side
        p4 = p1.copy()
        X1 = lambda m: np.column_stack([np.ones(m.sum()), B.logit(p1[m])])   # noqa: E731
        for lt in LTS:
            for sd in ("Over", "Under"):
                m = tr & (LT == lt) & (S == sd)
                if m.sum() < 200:
                    continue
                bp = B.fit_logistic(X1(m), Y[m])
                for pr in B.PROPS:
                    mc, mt = m & (P == pr), te & (LT == lt) & (S == sd) & (P == pr)
                    if not mt.any():
                        continue
                    nc = int(mc.sum())
                    beta = bp if nc < 30 else (nc / (nc + B.K)) * B.fit_logistic(X1(mc), Y[mc]) + (1 - nc / (nc + B.K)) * bp
                    p4[mt] = B.sig(X1(mt) @ beta)
        out["B"] = p4
        return out

    for tag, LT in (("PrizePicks' line type", T["lt"]), ("line-derived type", LTL)):
        print(f"\n=== WALK-FORWARD with {tag}")
        agg = defaultdict(lambda: [0.0, 0]); wins = defaultdict(int); months = 0
        pool = defaultdict(lambda: [0, 0])
        for mo in sorted(set(MO)):
            te = MO == mo
            tr = DAY < DAY[te].min()
            if te.sum() < 2000 or tr.sum() < 20000:
                continue
            months += 1
            out = run(tr, te, LT)
            parts = []
            for k in ("L1", "C", "B", "A"):
                v = B.ll(out[k][te], Y[te])
                agg[k][0] += v * te.sum(); agg[k][1] += te.sum()
                parts.append(f"{k} {v:.4f}")
            best = min(("C", "B", "A"), key=lambda k: B.ll(out[k][te], Y[te]))
            wins[best] += 1
            for lt in LTS:
                for sd in ("Over", "Under"):
                    m = te & (LT == lt) & (S == sd) & (out["B"] >= 0.58)
                    pool[(lt, sd)][0] += int(m.sum()); pool[(lt, sd)][1] += int(Y[m].sum())
            print(f"  {mo}: " + " | ".join(parts) + f"  best {best}", flush=True)
        print(f"  pooled ({months} months): " + ", ".join(f"{k} {s / n:.4f}" for k, (s, n) in agg.items())
              + "; best per month " + ", ".join(f"{k} {v}" for k, v in wins.items()))
        print("  chain B legs >= .58: " + ", ".join(f"{lt} {sd} {n:,} hit {h / n:.3f}" for (lt, sd), (n, h) in sorted(pool.items()) if n))


if __name__ == "__main__":
    main()
