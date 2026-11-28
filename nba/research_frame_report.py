"""Per-strategy (standalone) and per-app (merged) numbers of a set run on the shared frame (nba_score.frame_slips, written by research_frame_replay.py).
ROI per season, ROI from 2026-11-08, units, drawdown, longest losing-day run, longest losing-slip run, void-leg slips. Prefix FRS| (strategy) / FRA| (app). Read-only.
Env: DATABASE_URL, FR_TAG (default final)."""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg

TAG = os.environ.get("FR_TAG") or "final"
N8 = "2026-11-08"


def per(g):
    return "24" if g < "2025-07-01" else "25" if g < "2026-07-01" else "26"


def stats(rows):
    """rows: [(date, profit, nvoid)] graded only"""
    out = {}
    for lab in ("24", "25", "26", "N8"):
        r = [x for x in rows if (x[0] >= N8 if lab == "N8" else per(x[0]) == lab)]
        if not r:
            out[lab] = None; continue
        byd = defaultdict(float)
        for g, p, _ in r:
            byd[g] += p
        ds = sorted(byd); u = [byd[g] for g in ds]; cum = np.cumsum(u)
        dd = float(np.max(np.maximum.accumulate(np.r_[0, cum])[1:] - cum))
        run = best = 0
        for z in u:
            run = run + 1 if z < 0 else 0; best = max(best, run)
        out[lab] = dict(days=len(ds), n=len(r), u=round(float(sum(x[1] for x in r)), 1), roi=round(100 * float(np.mean([x[1] for x in r])), 1), dd=round(dd, 1), lrun=best,
                        void=sum(1 for x in r if x[2] > 0))
    return out


def slip_run(rows):
    run = best = 0
    for g, p, _ in sorted(rows, key=lambda x: x[0]):
        run = run + 1 if p < 0 else 0; best = max(best, run)
    return best


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    data = defaultdict(list); merged = defaultdict(list); ungr = defaultdict(int)
    for app, g, code, mg, j, profit, nv in conn.execute("SELECT app, game_date::text, code, merged, j, profit, nvoid FROM nba_score.frame_slips WHERE tag = %s ORDER BY game_date, code, j", (TAG,)).fetchall():
        if profit is None:
            ungr[(app, code)] += 1; continue
        data[(app, code)].append((g, float(profit), nv))
        if mg:
            merged[app].append((g, float(profit), nv))
    for (app, code), rows in sorted(data.items()):
        print("FRS|" + json.dumps(dict(app=app, code=code, s=stats(rows), slipRun=slip_run(rows), ungraded=ungr.get((app, code), 0))), flush=True)
    for app, rows in merged.items():
        n = sum(1 for _ in rows)
        print("FRA|" + json.dumps(dict(app=app, s=stats(rows), slipRun=slip_run(rows), perday=round(n / max(1, len({r[0] for r in rows})), 1))), flush=True)
    conn.close()


main()
