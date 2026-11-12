#!/usr/bin/env python3
"""FULL Fliff sweep with Max / Flex / SuperFlex (owner 2026-11-12 15:01 PT: "every single strategy from fliff, all proplines, all variations, compositions, factors, layers, structures").
Same grid as research_roi_slip_sweep_apps (SW_APP=fliff): 6 keys (score_cert, score_roi, score_roi65, roi, hp, rand-control) x lines (main / alt / all) x ROI filter (none / >0 / >5%)
x side (both / over / under) x props (all / no defensive) x top-N (2..30) x picks 2..6 x structure (Max, Flex, SuperFlex), per season (2024-25, 2025-26 modelled; 2026-27 real).
Fliff Flex / SuperFlex priced from Fliff's own web code (unverified live). READ-ONLY."""
import os, sys, math, inspect, textwrap
os.environ["SW_APP"] = "fliff"; os.environ["SW_CAL"] = "logit"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_roi_slip_sweep_apps as M


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


M.pay = fliff_pay
src = textwrap.dedent(inspect.getsource(M.main))
a = '(("max", "flex") if APP == "sleeper" else ("max",))'
b = 'not (m in ("flex",) and k < 3)'
assert a in src and b in src
src = src.replace(a, '("max", "flex", "superflex")').replace(b, 'not (m in ("flex", "superflex") and k < 3)')
src = src.replace("Ns = [3, 5, 10, 15, 20, 30]", "Ns = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30]")
exec(src, M.__dict__)
M.main()
