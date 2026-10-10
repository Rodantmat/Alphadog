#!/usr/bin/env python3
"""
REGRADE: PrizePicks Flex slips WITH goblins / demons, every PrizePicks backtest table, on PrizePicks' quote-derived tiers
(2026-10-10; nba/sql/pp_flex_alt_payout.sql, nba_config.pp_slip_rules['flex_alt_tiers'], build_slip_engine.flex_alt_payout).
The certified grader paid FLEX[(n, hits)] x prod(leg factors) on every Flex tier, which overpaid PrizePicks' nearly flat
partial tiers 2-5x (48 live quotes run 38020184454, 40 all-demon quotes probe 38021265189, the 2026-09 WNBA mining).
Per table: the old payout is KEPT in payout_grader_v1 (retain all data; set once, never overwritten), payout / profit are
recomputed for every Flex slip whose LIVE legs (hit not null) include an alternate and that still plays as Flex (>= 3 live
legs - a Flex reverting below 3 picks plays as Power and is unchanged; all-standard live legs keep the verified tables).
Idempotent: re-running recomputes from the same legs and tiers and touches only rows whose payout changes (so a tier
rebuild re-prices exactly the affected slips). Set-based through the view nba_market.pp_flex_alt_segments, one statement per
season. Runs in P5 before the certification pass, so the backtest always matches the current tiers.
Env: DATABASE_URL, REGRADE_TABLES (default: the six slip_engine_slips tables).
"""
import os
import sys
import time

import psycopg

TABLES = [t.strip() for t in (os.environ.get("REGRADE_TABLES") or
          "slip_engine_slips,slip_engine_slips_mf,slip_engine_slips_nosteals,slip_engine_slips_mf_nosteals,"
          "slip_engine_slips_post,slip_engine_slips_post_nosteals").split(",") if t.strip()]

SQL = """WITH s AS (
  SELECT ctid id, hits,
    (SELECT count(*) FILTER (WHERE (j->>'hit') IS NOT NULL) FROM jsonb_array_elements(legs_json) j)::int nlv,
    (SELECT exp(sum(ln((j->>'factor')::float)) FILTER (WHERE (j->>'hit') IS NOT NULL)) FROM jsonb_array_elements(legs_json) j) fprod,
    (SELECT bool_or(abs((j->>'factor')::float - 1) > 1e-9) FILTER (WHERE (j->>'hit') IS NOT NULL) FROM jsonb_array_elements(legs_json) j) live_alt
  FROM nba_score.{t} WHERE season = %s AND structure = 'flex'),
n AS (SELECT s.id, coalesce((SELECT CASE WHEN g.x1 = g.x0 OR g.y1 = g.y0 THEN least(g.y0, g.y1) WHEN g.x0 <= 0 THEN g.y0
                                         ELSE g.y0 + (g.y1 - g.y0) * (ln(s.fprod) - ln(g.x0)) / (ln(g.x1) - ln(g.x0)) END
                                  FROM nba_market.pp_flex_alt_segments g WHERE g.n = s.nlv AND g.misses = s.nlv - s.hits AND s.fprod >= g.x0 AND s.fprod <= g.x1
                                  ORDER BY g.x0 LIMIT 1), 0) np
      FROM s WHERE s.nlv >= 3 AND s.live_alt)
UPDATE nba_score.{t} x SET payout_grader_v1 = coalesce(x.payout_grader_v1, x.payout), payout = n.np, profit = n.np * x.stake - x.stake
FROM n WHERE x.ctid = n.id AND x.payout IS DISTINCT FROM n.np"""


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("SET statement_timeout = 0")
        for t in TABLES:
            t0 = time.time()
            c.execute(f"ALTER TABLE nba_score.{t} ADD COLUMN IF NOT EXISTS payout_grader_v1 double precision")
            days = [r[0] for r in c.execute(f"SELECT DISTINCT season FROM nba_score.{t} WHERE structure='flex' ORDER BY 1").fetchall()]
            n = 0
            for d in days:          # one set-based statement per season (segments view = the DB function, verified 190/190)
                n += c.execute(SQL.format(t=t), (d,)).rowcount
                c.commit()
            r = c.execute(f"""SELECT count(*) FILTER (WHERE payout_grader_v1 IS NOT NULL), sum(payout_grader_v1) FILTER (WHERE payout_grader_v1 IS NOT NULL),
                                     sum(payout) FILTER (WHERE payout_grader_v1 IS NOT NULL) FROM nba_score.{t}""").fetchone()
            print(f"REGRADE|{t}|seasons {len(days)}|rows updated {n}|regraded total {r[0]}|old payout sum {r[1] or 0:.1f}|new {r[2] or 0:.1f}"
                  f"|{time.time() - t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
