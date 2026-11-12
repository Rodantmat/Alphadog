#!/usr/bin/env python3
"""CERTIFICATION - the owner's Betr board rules B_BRD_4dyn (4-pick Dynamic, bl order, mix, 1 leg a game, final_hp >= .60, 2 slips) and the fallback B_BRD_3dyn_fb (3-pick, <= 2 a game),
through the harness the live engine was proven against (research_app_allegs.day on friend_engine.app_days legs: modelled Betr boards for 2025-26, the real board for 2026-27).
Cascade = 4-pick when it builds, else the 3-pick. History has no 2024-25 Betr board. READ-ONLY, flat 1u. FR_APP must be BETR."""
import collections
import os
import sys

import psycopg

os.environ["FR_APP"] = "BETR"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as FE            # noqa: E402
import research_app_allegs as A       # noqa: E402
import research_cert_common as CC     # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
K4 = ("bl", "mix", "all", "gc1", 0.60, 0.0, 99.0, 4, "flex", 2)
K3 = ("bl", "mix", "all", "gc2", 0.60, 0.0, 99.0, 3, "flex", 2)
rec = collections.defaultdict(list)
for season, d, legs in FE.app_days(conn):
    acc = A.Acc()
    A.day(acc, 0, legs)
    got = {}
    for name, key in (("B_BRD_4dyn", K4), ("B_BRD_3dyn_fb", K3)):
        a = acc.d.get(key)
        n, pl = (int(a[0][0]), float(a[0][1])) if a is not None else (0, 0.0)
        got[name] = (n, pl)
        for _ in range(n):
            rec[name].append((season, d, pl / n, False))
    casc = got["B_BRD_4dyn"] if got["B_BRD_4dyn"][0] else got["B_BRD_3dyn_fb"]
    for _ in range(casc[0]):
        rec["CASCADE"].append((season, d, casc[1] / casc[0], False))
for name in ("B_BRD_4dyn", "B_BRD_3dyn_fb", "CASCADE"):
    CC.report(f"BETR {name}", rec[name])
