#!/usr/bin/env python3
"""
AUDIT - IS final_hp ON EVERY HISTORY LEG HONEST? (2026-10-28; the all-legs research gave Betr 6-pick Perfect +500-700% ROI in history
with 80% cashed, but -65% (median) on this season's real Betr board). READ-ONLY.
For the legs the all-legs research uses (research_sleeper_hist.hist_day: the books' consensus main line both sides, and the Over-only
alternate rungs), per season and final_hp bucket: legs, mean final_hp, hit rate, the books' de-vigged chance - and the same on this
season's real Sleeper window board (research_sleeper_hist.live_day). A model that is honest hits about its own chance; a hit rate far
above final_hp (and above the books) says the history final_hp carries information the model could not have had before the game.
Also splits history legs by whether the leg's line was one of the lines the model was originally run on (final_hp row from the scoring
run) - final_hp rows exist only where the pipeline scored that line. Env: DATABASE_URL, CAL_STEP (every Nth history slate, 4).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "sleeper")
import research_app_final_strategies as AF          # noqa: E402
import research_sleeper_hist as RSH                 # noqa: E402

BUCKETS = ((0, .45), (.45, .50), (.50, .55), (.55, .60), (.60, .65), (.65, .70), (.70, .80), (.80, 1.01))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    step = int(os.environ.get("CAL_STEP") or 4)
    days = AF.slate_days(conn)
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    hist = [d for d in days if AF.season_of(d) != "2026-27"][::step]
    ovr, kt = RSH.law(conn, live)
    acc = defaultdict(list)                      # (season, kind, bucket) -> [(p, hit, pf)]
    for i, d in enumerate(hist + live):
        st = AF.box(conn, d)
        if not st:
            continue
        s = AF.season_of(d)
        legs = RSH.hist_day(conn, d, st, ovr, kt) if s != "2026-27" else RSH.live_day(conn, d, st)
        for l in legs:
            if l.get("hit") is None or l.get("p") is None:
                continue
            p = float(l["p"])
            b = next(k for k, (lo, hi) in enumerate(BUCKETS) if lo <= p < hi)
            acc[(s, l.get("kind", "main"), b)].append((p, l["hit"], l.get("pf")))
        if i % 20 == 0:
            print(f"slate {i + 1}/{len(hist) + len(live)} {d}", flush=True)
    print("=" * 130)
    print("season   kind  final_hp bucket |   legs | mean final_hp | HIT RATE | books' chance (where known) | hit - final_hp")
    for key in sorted(acc):
        s, k, b = key
        a = acc[key]
        p = np.array([x[0] for x in a]); h = np.array([x[1] for x in a], float)
        pf = [x[2] for x in a if x[2] is not None]
        print(f"{s}  {k:<4}  {BUCKETS[b][0]:.2f}-{BUCKETS[b][1]:.2f}      | {len(a):6d} | {p.mean():.3f}         | {h.mean():.3f}    | "
              f"{np.mean(pf) if pf else float('nan'):.3f} ({len(pf)})                 | {h.mean() - p.mean():+.3f}")
    print("done", flush=True)


if __name__ == "__main__":
    main()
