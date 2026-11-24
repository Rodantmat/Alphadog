#!/usr/bin/env python3
"""
REST SKIP - EXACT THRESHOLDS (follow-up of research_filter_battery.py, 2026-11-24): the battery found, on PrizePicks AND Underdog, that skipping slips whose legs
are well rested (mean days since the last game in the top tail) raised ROI and units in all three seasons. READ-ONLY. Fixed thresholds on the slip's mean rest
(days since each leg's player's previous game; 1 = back-to-back) and on the share of back-to-back legs, as-built live sets (PrizePicks / Sleeper / Fliff with
the spread-8 skip), three seasons, ROI / slips / units and the luck test (random skips of as many as-built slips, 2000 draws).
Env: DATABASE_URL, UA_APP.
"""
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_universe as U                                     # noqa: E402
from research_spread_refine import market, SETS, pay              # noqa: E402

APP = U.APP
SKIP8 = APP in ("prizepicks", "sleeper", "fliff")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    d = U.load(conn)
    L = U.layers(d)
    mk = market(conn)
    mm = mk.reindex(pd.MultiIndex.from_arrays([d["gd"].values, d["player_id"].values]))
    d["asp"] = np.abs(mm["tsp"].values)
    reg = d["easy"].values == 0; und = d["under"].values
    rest = pd.to_numeric(d["rest"], errors="coerce").values
    masks = {}
    for code, rkr, filt, gcap, st, k, role in SETS:
        m = reg & und & np.isfinite(d[rkr].values.astype(float))
        for f in filt:
            m &= L[f]
        masks[code] = m
    by_gd = d.groupby("gd").indices
    pid = d["player_id"].values; gid = d["gid"].values; w = d["w"].values; lf = d["logf"].values; asp_ = d["asp"].values
    sl = defaultdict(list)
    for gd in sorted(by_gd):
        ix = by_gd[gd]; old = gd < "2026-07-01"; season = d["season"].values[ix[0]]
        for code, rkr, filt, gcap, st, k, role in SETS:
            j = ix[masks[code][ix]]
            j = j[np.argsort(-d[rkr].values[j].astype(float), kind="mergesort")]
            sel = []; up = set(); ug = defaultdict(int)
            for i in j:
                if pid[i] in up or ug[gid[i]] >= gcap:
                    continue
                sel.append(i); up.add(pid[i]); ug[gid[i]] += 1
                if len(sel) == k:
                    break
            if len(sel) < k:
                continue
            s = np.array(sel)
            if SKIP8 and np.isfinite(asp_[s]).any() and np.nanmean(asp_[s]) > 8:
                continue
            v = pay(st, k, int(w[s].sum()), float(lf[s].sum()), float(lf[s][w[s] == 1].sum()), old)
            if v is None:
                continue
            r = rest[s]; r = r[np.isfinite(r)]
            sl[season].append((v - 1, float(np.mean(np.minimum(r, 7))) if len(r) else np.nan, float(np.mean(r == 1)) if len(r) else np.nan))
    rng = np.random.default_rng(31)
    allr = np.array([x[1] for s in sl for x in sl[s]])
    print(f"RC|{APP}: slip mean rest (capped 7) percentiles 50/80/90: {np.nanpercentile(allr, [50, 80, 90]).round(2).tolist()}", flush=True)
    base = {s: np.array([x[0] for x in sl[s]]) for s in U.SEAS}
    print("RC|  as built: " + " | ".join(f"{s}: {100 * base[s].mean():+.1f}% ({len(base[s])}, {base[s].sum():+.1f} u)" for s in U.SEAS), flush=True)
    rules = [(f"skip mean rest >= {t}", lambda x, t=t: x[1] >= t) for t in (2.2, 2.4, 2.6, 2.8, 3.0, 3.3, 3.6)]
    rules += [(f"skip back-to-back share = 0", lambda x: x[2] == 0), ("skip back-to-back share < 0.2", lambda x: x[2] < 0.2)]
    for name, f in rules:
        parts = []; beats = 0; more = 0
        for s in U.SEAS:
            kept = np.array([x[0] for x in sl[s] if not (x[1] == x[1] and f(x))])
            b0 = base[s]
            if not len(kept):
                parts.append("-"); continue
            p = float((np.array([b0[rng.choice(len(b0), len(kept), replace=False)].mean() for _ in range(2000)]) >= kept.mean()).mean())
            beats += int(kept.mean() > b0.mean()); more += int(kept.sum() >= b0.sum())
            parts.append(f"{s}: {100 * kept.mean():+.1f}% ({len(kept)}, {kept.sum():+.1f} u, luck {p:.2f})")
        print(f"RC|  {name:30s} " + " | ".join(parts) + f"  -> ROI better {beats}/3, units >= {more}/3", flush=True)
    print("RC|DONE", flush=True)


if __name__ == "__main__":
    main()
