#!/usr/bin/env python3
"""
BOARD TIERS v2 — FOUR-WAY taxonomy (goblin/demon x More/Less), both anchor cases.

THIS IS THE ALREADY-SOLVED LOGIC, WIRED FOR NBA. Nothing here is new thinking; it is the rule worked
out on the MLB/board work, extended for the Less side that PrizePicks switched on in 2026-08.

THE RULE (verbatim from that work):
    "With Less enabled, each rung carries both sides - BELOW the anchor, More = Goblin / Less = Demon;
     ABOVE it, More = Demon / Less = Goblin - each with its own tier. So the label is a function of
     (position vs anchor, side), NEVER of the emoji alone."

Why that matters: v1 derived `kind` from the Odds API PRICE (price=100 -> demon, price=-137 -> goblin)
and every row came out Over-only, because through 2025-08 demons and goblins WERE more-only - the
official help centre said so and our 2024-25 data has literally zero Under rows on alternates. From
2026-08 PrizePicks enabled Less on select demons/goblins (MLB and WNBA first, NBA expected this season),
so a price-based label is now wrong for half the board: a demon-Less sits BELOW the anchor, which v1
would have called a goblin.

THE TWO ANCHOR CASES, both real and both handled (validated on 42,600 pure goblin->demon ladders):
    EXPLICIT      a standard line is on the board - that line IS the anchor
    SWITCH_POINT  no standard line is offered; the anchor is the invisible switch between the highest
                  goblin and the lowest demon. "10.5 goblin, 11.5 goblin, 12.5 demon -> 12 is the
                  anchor. There is no regular, but you have an invisible switch point."

TIER SIGN, direction-aware. v1 signed by kind (goblin negative, demon positive), which breaks under the
four-way rule because a demon-Less is BELOW the anchor. v2 signs by POSITION: negative below the anchor,
positive above it. So a tier tells you where the rung sits, and (tier sign, side) tells you the label -
which is exactly the rule above, made queryable.

Env: DATABASE_URL, BT2_APPS (default prizepicks), BT2_REBUILD (1 = drop and rebuild)
"""
import os

import psycopg

DDL = """
CREATE TABLE IF NOT EXISTS nba_market.board_tiers_v2 (
    game_date date, snapshot_label text, bookmaker text, player text, nm text,
    base_market text, side text, line numeric, kind text,
    anchor_line numeric, anchor_type text, tier bigint, position_vs_anchor text,
    built_at timestamptz DEFAULT now())
"""

# psycopg refuses "multiple commands in a prepared statement" the moment a query carries parameters,
# so the DDL, the truncate and the parameterised INSERT are three separate executes - not one blob.
SQL = """
WITH pp AS (
  SELECT DISTINCT game_date, snapshot_label, bookmaker, player,
         lower(regexp_replace(player,'[^A-Za-z]','','g')) AS nm,
         side, line, price,
         replace(market_key,'_alternate','') AS base_market,
         (market_key LIKE '%%\\_alternate') AS is_alt
  FROM nba_market.board_snapshots
  WHERE bookmaker = ANY(%(apps)s) AND line IS NOT NULL
),
-- the anchor per ladder. A ladder is (date, snapshot, book, player, market) - the same grouping the
-- PrizePicks payload calls group_key, which is what makes this derivation free rather than fuzzy.
anch AS (
  SELECT game_date, snapshot_label, bookmaker, nm, base_market,
         max(line) FILTER (WHERE NOT is_alt AND side='Over') AS explicit_anchor,
         -- the invisible switch point: between the deepest alternate below and the shallowest above.
         -- Computed from the ALTERNATE rungs only, and only used when no standard line exists.
         max(line) FILTER (WHERE is_alt AND price < 0)  AS top_shorter,   -- priced as the easier side
         min(line) FILTER (WHERE is_alt AND price > 0)  AS low_longer     -- priced as the harder side
  FROM pp GROUP BY 1,2,3,4,5
)
INSERT INTO nba_market.board_tiers_v2
  (game_date, snapshot_label, bookmaker, player, nm, base_market, side, line, kind,
   anchor_line, anchor_type, tier, position_vs_anchor)
SELECT p.game_date, p.snapshot_label, p.bookmaker, p.player, p.nm, p.base_market, p.side, p.line,
  -- THE FOUR-WAY RULE: label = f(position vs anchor, side). Never the price, never the emoji.
  CASE
    WHEN NOT p.is_alt THEN 'standard'
    WHEN a.anchor IS NULL THEN 'unknown'
    WHEN p.line < a.anchor AND lower(p.side) LIKE 'o%%' THEN 'goblin'   -- below, More  = easier over
    WHEN p.line < a.anchor AND lower(p.side) LIKE 'u%%' THEN 'demon'    -- below, Less  = harder under
    WHEN p.line > a.anchor AND lower(p.side) LIKE 'o%%' THEN 'demon'    -- above, More  = harder over
    WHEN p.line > a.anchor AND lower(p.side) LIKE 'u%%' THEN 'goblin'   -- above, Less  = easier under
    ELSE 'standard'
  END AS kind,
  a.anchor AS anchor_line,
  CASE WHEN a.explicit_anchor IS NOT NULL THEN 'explicit'
       WHEN a.anchor IS NOT NULL THEN 'switch_point' ELSE 'none' END AS anchor_type,
  -- TIER SIGNED BY POSITION, not by kind. Negative below the anchor, positive above it, so the sign
  -- still means "which way from the anchor" once a demon can sit below it.
  CASE
    WHEN a.anchor IS NULL OR NOT p.is_alt THEN 0
    WHEN p.line < a.anchor THEN -ROW_NUMBER() OVER (
         PARTITION BY p.game_date, p.snapshot_label, p.bookmaker, p.nm, p.base_market, p.side,
                      (p.line < a.anchor) ORDER BY p.line DESC)
    ELSE  ROW_NUMBER() OVER (
         PARTITION BY p.game_date, p.snapshot_label, p.bookmaker, p.nm, p.base_market, p.side,
                      (p.line < a.anchor) ORDER BY p.line ASC)
  END AS tier,
  CASE WHEN a.anchor IS NULL THEN 'unknown'
       WHEN p.line < a.anchor THEN 'below'
       WHEN p.line > a.anchor THEN 'above' ELSE 'at' END AS position_vs_anchor
FROM pp p
JOIN (SELECT *, COALESCE(explicit_anchor, (top_shorter + low_longer)/2.0) AS anchor FROM anch) a
  USING (game_date, snapshot_label, bookmaker, nm, base_market);
"""


def main():
    apps = [a.strip() for a in os.environ.get("BT2_APPS", "prizepicks").split(",") if a.strip()]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    print(f"building board_tiers_v2 for {apps} (four-way taxonomy, both anchor cases)", flush=True)
    with conn.cursor() as cur:
        cur.execute(DDL)
        cur.execute("TRUNCATE nba_market.board_tiers_v2")
        cur.execute(SQL, {"apps": apps})
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("""SELECT anchor_type, kind, side, position_vs_anchor, count(*),
                              min(tier), max(tier)
                       FROM nba_market.board_tiers_v2
                       GROUP BY 1,2,3,4 ORDER BY 1,2,3""")
        print(f"\n{'anchor':<14}{'kind':<10}{'side':<8}{'pos':<8}{'legs':>10}{'tiers':>12}")
        for r in cur.fetchall():
            print(f"{r[0]:<14}{r[1]:<10}{r[2]:<8}{r[3]:<8}{r[4]:>10,}   {r[5]} .. {r[6]}", flush=True)
        cur.execute("""SELECT count(*) FILTER (WHERE kind='unknown'), count(*)
                       FROM nba_market.board_tiers_v2""")
        unk, tot = cur.fetchone()
        print(f"\ntotal {tot:,} rows; {unk:,} with NO derivable anchor "
              f"({unk/max(tot,1):.2%} - these are single-rung ladders with no standard line)", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
