#!/usr/bin/env python3
"""
RESEARCH - THE FALLBACK'S BACKUP SLIPS ON HISTORY (2026-10-27). READ-ONLY. On every night the thin-night fallback triggers
(live_slip_engine.fallback_slips, classification_config['pp_fallback']), the engine builds 2 main slips + backups from the remaining
players. A backup is played only when a main slip fails PrizePicks' quote, so its own record matters: per slip rank k (1, 2 = main;
3, 4, 5 = backups) - slips, ROI, profit, slips won, per season. Env: DATABASE_URL.
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402
import research_pp_2pick as R2                       # noqa: E402
import live_slip_engine as L                         # noqa: E402

HIST = list(PC.HIST)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    fb = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='pp_fallback'").fetchone()[0]
    fb = fb if isinstance(fb, dict) else json.loads(fb)
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=R2.key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    res = defaultdict(lambda: defaultdict(list))   # k -> season -> multiplier - 1
    nights = defaultdict(int)
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        prep = PB.prepare(legs, tr.rates())
        tr.push(legs)
        built, sl = L.fallback_slips(prep, fb, extra=3)
        if built > int(fb.get("trigger", 1)):
            continue
        nights[k[0]] += 1
        for i, s in enumerate(sl, 1):
            res[i][k[0]].append(PC.grade(s, "power") - 1)
    print("THE FALLBACK BY SLIP RANK (1, 2 main; 3-5 backups) on trigger nights: " + ", ".join(f"{s} {nights[s]} nights" for s in HIST))
    for i in sorted(res):
        parts = []
        for s in HIST + ["BOTH"]:
            x = np.array([v for ss in HIST for v in res[i][ss]] if s == "BOTH" else res[i][s], float)
            parts.append(f"{s}: {len(x)} slips, ROI {100 * x.mean() if len(x) else 0:+.1f}%, profit {x.sum():+.1f}u, won "
                         f"{100 * np.mean(x > 0) if len(x) else 0:.0f}%")
        print(f"  k{i}{' (backup)' if i > int(fb.get('slips', 2)) else ''}: " + " | ".join(parts), flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
