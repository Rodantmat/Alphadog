#!/usr/bin/env python3
"""Fliff DEPLOYED strategies re-run with Flex / SuperFlex alternatives (owner 2026-11-12 14:52 PT). READ-ONLY.
Deployed Fliff ROI rules (roi_live): F_A_5max_R15 = FL-A (5-pick, top15, score_roi, main, both sides), F_C_5max_U20 = FL-C (5-pick, top20, score_cert, Unders).
Each is re-priced as Max (as deployed), Flex (min n-1 correct) and SuperFlex (min n-2 correct) on the SAME legs/slips, plus 3/4/6-pick siblings.
Fliff pricing from Fliff's own web code (unverified live). The 2-pick UD-T1 Max has no Flex (Flex needs n>=3)."""
import os, sys, math
os.environ["FC_APP"] = "fliff"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_roi_final_candidates as R


def fliff_pay(slip, mode):
    live = [l for l in slip if l[2] is not None and l[2] == l[2]]
    n = len(live)
    if n < 2:
        return 1.0
    hits = sum(1 for l in live if l[2]); ms = [float(l[3]) for l in live]
    mx = math.floor(math.prod(ms) * 100 + 1e-6) / 100
    if mode == "flex" and n >= 3:
        c = round(math.prod(ms) / (1 + sum(m - 1 for m in ms)), 2)
        if c >= 1.01:
            return c if hits >= n - 1 else 0.0
    if mode == "superflex" and n >= 3:
        p = [1 / m / 1.0909 for m in ms]; r = [1.0, 0.0, 0.0]
        for a in p:
            r = [r[0] * a, r[1] * a + r[0] * (1 - a), r[2] * a + r[1] * (1 - a)]
        f = sum(r) * 1.0909 ** n
        if 0 < f < 1:
            c = round(1 / f, 2)
            if c >= 1.01:
                return c if hits >= n - 2 else 0.0
    return mx if hits == n else 0.0


R.M.pay = fliff_pay
C = []
for tag, key, side, N in (("A", "score_roi", "both", 15), ("C", "score_cert", "under", 20)):
    for k in (5, 3, 4, 6):
        for mode in ("max", "flex", "superflex"):
            C.append((f"FL-{tag} {k}-pick {mode.upper()} top{N} {key} {side} main" + ("  <== DEPLOYED" if (k == 5 and mode == "max") else ""), key, "main", "none", side, "all", N, k, mode))
R.CANDS = C
R.main()
