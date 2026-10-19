#!/usr/bin/env python3
"""
RESEARCH - GRADER v3 PARITY: Python build_slip_engine.grade == the DB twin that regraded the tables (2026-10-18).  READ-ONLY.
Samples slips from every regraded table (ties / voids, Power / Flex, alternates, same-game all included) and recomputes each with
build_slip_engine.grade(legs, structure, same_game > 0); prints mismatches (must be 0) per table.
Env: DATABASE_URL, PAR_N (per table, default 20000).
"""
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as E  # noqa: E402

TABLES = ["slip_engine_slips", "slip_engine_slips_nosteals", "slip_engine_slips_wo", "slip_engine_slips_wo_nosteals",
          "slip_engine_slips_mf", "slip_engine_slips_post"]


def main():
    n = int(os.environ.get("PAR_N", "20000"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    for t in TABLES:
        rows = conn.execute(f"""SELECT legs_json, structure, same_game, payout, size FROM nba_score.{t} TABLESAMPLE SYSTEM (10) LIMIT %s""", (n,)).fetchall()
        bad, ties, alts, sg = [], 0, 0, 0
        for legs, structure, same_game, payout, size in rows:
            legs = legs if isinstance(legs, list) else json.loads(legs)
            ties += any(l.get("hit") is None for l in legs)
            alts += any(abs(float(l["factor"]) - 1) > 1e-9 for l in legs)
            sg += same_game > 0
            _, p = E.grade([{"hit": l.get("hit"), "factor": float(l["factor"])} for l in legs], structure, same_game=same_game > 0)
            if abs(p - float(payout)) > 1e-6:
                bad.append((structure, size, same_game, payout, p))
        print(f"PARITY|{t}|slips {len(rows)} (with a tie/void {ties}, alternates {alts}, same-game {sg})|mismatches {len(bad)}|{bad[:3]}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
