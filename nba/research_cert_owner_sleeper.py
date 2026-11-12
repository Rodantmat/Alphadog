#!/usr/bin/env python3
"""CERTIFICATION - the owner's original Sleeper rule S_ALL_5flex (evbl order, both sides, all lines incl. alternates, final_hp >= .50, hit x multiplier >= 1.12, 5-pick Flex,
two slips a slate, one leg a game, >= 2 teams) replayed with the harness the live engine was proven against (research_app_allegs via friend_engine.app_days: modelled
Sleeper boards for 2024-25 / 2025-26, the real window board for 2026-27). Graded on the box score with the Sleeper flex law. READ-ONLY, flat 1u a slip.
Also: the same slips with a 5% / 10% / 15% leg-drift haircut on every payout (a bound on the modelled-board optimism). FR_APP must be SLEEPER."""
import collections
import os
import sys

import psycopg

os.environ["FR_APP"] = "SLEEPER"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as FE            # noqa: E402
import research_cert_common as CC     # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
RULE = ("evbl", "any", "all", "all", 0.50, 1.12, 0, 5, 2)
rec = collections.defaultdict(list)
n_sl = 0
for season, d, legs in FE.app_days(conn):
    if len(legs) < 5:
        continue
    o, sd, pr, kd0, fl, g, sk, k, ns = RULE
    cand = FE.ranked(legs, (o, sd, pr, kd0, fl, g, sk))
    banned = set()
    for i in range(ns):
        s = FE.build(cand, k, 1, set(), frozenset(banned))
        if not s:
            break
        banned |= {FE.pid(l) for l in s}
        m = float(FE.pay_of(s, "flex"))
        live = sum(1 for l in s if l.get("hit") is not None)
        for tag, hc in (("raw", 1.0), ("h5", 0.95), ("h10", 0.90), ("h15", 0.85)):
            pm = (m * hc) if m > 1.0 else m      # haircut the payout only when the slip pays more than a refund
            rec[tag].append((season, d, pm - 1.0, live < 2))
    n_sl += 1
print(f"slates with a slip: {n_sl}", flush=True)
for tag in ("raw", "h5", "h10", "h15"):
    print(f"\n=== Sleeper S_ALL_5flex, payout x {dict(raw=1.0, h5=0.95, h10=0.90, h15=0.85)[tag]} ===", flush=True)
    CC.report("SLEEPER S_ALL_5flex", rec[tag])
