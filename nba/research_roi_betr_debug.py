#!/usr/bin/env python3
"""Prints research_roi_final_candidates BT-B (4-pick Dynamic, top 5, new score) slip by slip on this season's real Betr slates - to compare with research_roi_betr_parity.py (live code path). Read-only."""
import os
os.environ["FC_APP"] = "betr"
import json
import numpy as np
import psycopg
import research_roi_final_candidates as C

M = C.M
conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
C.patch_betr()
r = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
M.BR = r if isinstance(r, dict) else json.loads(r)
raw = M.build_betr(conn)
conn.close()
conn = psycopg.connect(os.environ["DATABASE_URL"]); T = M.pp_tables(conn)
tot = 0.0; n = 0
for d, legs in raw.get("2026-27", []):
    df = M.score_day(legs, T["all"])
    top = M.tops(df, "score_roi", "all", "none", "both", "all")
    for s in M.groups(top, 5, 4):
        p = M.pay(s, "dynamic"); n += 1; tot += p - 1
        print(d, f"pay {p:.2f}x", " + ".join(f"{l[0]} {l[4]} hit={l[2]}" for l in s), flush=True)
print(f"research path: slips {n}, ROI {100 * tot / max(n, 1):+.1f}%", flush=True)
