#!/usr/bin/env python3
"""
REGRADE: every PrizePicks backtest slip on GRADER v3 (2026-10-18, owner: "Having the boards now, be sure we are using the proper
multipliers, prove, analyze and understand each of the available tables"; PP_PAYOUT_FINDINGS §0l).
Grader v3 = build_slip_engine.grade / pp_payout, DB twin nba_market.pp_slip_payout_v3 (nba/sql/pp_payout_v3.sql):
  all-standard Power / Flex pay the tables exactly (no compression); Power with goblins / demons (3-6 picks) = the conservative
  power_alt_v3 law; all-standard 3 / 4-Flex with a same-game pair = flex_same_game_v3; Flex with alternates unchanged
  (quote-derived tiers); ties / voids revert as before.
Per table: the payout before v3 is KEPT in payout_grader_v2 (retain all data; set once, never overwritten); payout / profit are
recomputed for every slip whose v3 payout differs. same_game = the table's own column (> 0). Idempotent (re-running touches only
rows whose payout changes - e.g. after a rule refresh). One set-based statement per season. Runs in P5 after the Flex-alternates
regrade and before certification, so the backtest always matches the current grader.
Env: DATABASE_URL, REGRADE_TABLES (default: the eight slip_engine_slips tables).
"""
import os
import sys
import time

import psycopg

TABLES = [t.strip() for t in (os.environ.get("REGRADE_TABLES") or
          "slip_engine_slips,slip_engine_slips_mf,slip_engine_slips_nosteals,slip_engine_slips_mf_nosteals,"
          "slip_engine_slips_post,slip_engine_slips_post_nosteals,slip_engine_slips_wo,slip_engine_slips_wo_nosteals").split(",") if t.strip()]

SQL = """WITH n AS (SELECT ctid id, nba_market.pp_slip_payout_v3(legs_json, structure, same_game > 0) np FROM nba_score.{t} WHERE season = %s)
UPDATE nba_score.{t} x SET payout_grader_v2 = coalesce(x.payout_grader_v2, x.payout), payout = n.np, profit = n.np * x.stake - x.stake
FROM n WHERE x.ctid = n.id AND (x.payout IS NULL OR abs(x.payout - n.np) > 1e-9)"""


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("SET statement_timeout = 0")
        for t in TABLES:
            t0 = time.time()
            c.execute(f"ALTER TABLE nba_score.{t} ADD COLUMN IF NOT EXISTS payout_grader_v2 double precision")
            c.commit()
            seasons = [r[0] for r in c.execute(f"SELECT DISTINCT season FROM nba_score.{t} ORDER BY 1").fetchall()]
            n = 0
            for s in seasons:
                n += c.execute(SQL.format(t=t), (s,)).rowcount
                c.commit()
            r = c.execute(f"""SELECT count(*), sum(payout_grader_v2), sum(payout) FROM nba_score.{t} WHERE payout_grader_v2 IS NOT NULL""").fetchone()
            print(f"REGRADE_V3|{t}|seasons {len(seasons)}|rows updated {n}|regraded total {r[0]}|old payout sum {r[1] or 0:.1f}|new {r[2] or 0:.1f}"
                  f"|{time.time() - t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
