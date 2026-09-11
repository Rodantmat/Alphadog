#!/usr/bin/env python3
"""
Market probability AT THE DFS RUNGS ONLY - built in monthly blocks.

WHY SCOPED: the engine only ever needs the book's opinion at lines the DFS apps actually offered.
Materializing implied curves for all 15.4M book rows cost 3 GB and nearly filled the disk; the
scoped version is ~2.2M rows because that is how many PrizePicks rungs exist across both seasons.

WHY CHUNKED: one month per transaction keeps WAL and temp spill small. A single CREATE TABLE AS over
27M rows ran 1h38m and pushed the disk to 91%. Monthly blocks finish in seconds each and can be
resumed - the table records which months are done.

De-vig is per book across the two sides of the SAME line, then averaged across books. Flat DFS
placeholder prices (-137 / +100) are excluded: they are nominal pricing, not odds.

Env: DATABASE_URL, RUNG_FROM=YYYY-MM, RUNG_TO=YYYY-MM (defaults cover both seasons).
"""
import os
from datetime import date

import psycopg

BOOKS = "('draftkings','fanduel','betmgm','williamhill_us','betrivers','bovada','betonlineag','fanatics')"

DDL = """
CREATE TABLE IF NOT EXISTS nba_market.rung_market (
  game_date date, snapshot_label text, player text, market text, line numeric,
  p_over_book numeric, p_over_sd numeric, books int,
  built_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS rung_market_idx ON nba_market.rung_market (game_date, player, market, line, snapshot_label);
"""

DELETE_BLOCK = "DELETE FROM nba_market.rung_market WHERE game_date >= %(d0)s AND game_date < %(d1)s;"

BLOCK = f"""
INSERT INTO nba_market.rung_market (game_date, snapshot_label, player, market, line, p_over_book, p_over_sd, books)
WITH rungs AS (
  SELECT DISTINCT game_date, snapshot_label, player, base_market AS market, line
  FROM nba_market.board_tiers
  WHERE game_date >= %(d0)s AND game_date < %(d1)s
), bk AS (
  SELECT game_date, snapshot_label, player, replace(market_key,'_alternate','') AS market, line, bookmaker,
         max(CASE WHEN side='Over'  THEN price END) AS op,
         max(CASE WHEN side='Under' THEN price END) AS up
  FROM nba_market.board_snapshots
  WHERE game_date >= %(d0)s AND game_date < %(d1)s
    AND bookmaker IN {BOOKS} AND price > -100000 AND price <> -137 AND price <> 100 AND line IS NOT NULL
  GROUP BY 1,2,3,4,5,6
), devig AS (
  SELECT game_date, snapshot_label, player, market, line, bookmaker,
         (CASE WHEN op>0 THEN 100.0/(op+100) ELSE (-op)/((-op)+100.0) END)
         / ((CASE WHEN op>0 THEN 100.0/(op+100) ELSE (-op)/((-op)+100.0) END)
          + (CASE WHEN up>0 THEN 100.0/(up+100) ELSE (-up)/((-up)+100.0) END)) AS p_over
  FROM bk WHERE op IS NOT NULL AND up IS NOT NULL
)
SELECT r.game_date, r.snapshot_label, r.player, r.market, r.line,
       round(avg(d.p_over)::numeric,5), round(coalesce(stddev_samp(d.p_over),0)::numeric,5), count(*)::int
FROM rungs r JOIN devig d
  ON d.game_date=r.game_date AND d.snapshot_label=r.snapshot_label AND d.player=r.player
 AND d.market=r.market AND d.line=r.line
GROUP BY 1,2,3,4,5;
"""


def months(a, b):
    y, m = int(a[:4]), int(a[5:7])
    ey, em = int(b[:4]), int(b[5:7])
    while (y, m) <= (ey, em):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        yield date(y, m, 1), date(ny, nm, 1)
        y, m = ny, nm


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute(DDL)
    total = 0
    for d0, d1 in months(os.environ.get("RUNG_FROM", "2024-10"), os.environ.get("RUNG_TO", "2026-04")):
        with conn.cursor() as cur:
            cur.execute(DELETE_BLOCK, {"d0": d0, "d1": d1})
            cur.execute(BLOCK, {"d0": d0, "d1": d1})
            cur.execute("SELECT count(*) FROM nba_market.rung_market WHERE game_date >= %s AND game_date < %s", (d0, d1))
            n = cur.fetchone()[0]
            cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
            size = cur.fetchone()[0]
        total += n
        print(f"{d0:%Y-%m}: {n} rungs priced | running total {total} | db {size}", flush=True)
    with conn.cursor() as cur:
        cur.execute("""SELECT count(*), round(avg(books),2), round(avg(p_over_book),4),
                              pg_size_pretty(pg_total_relation_size('nba_market.rung_market'))
                       FROM nba_market.rung_market""")
        print("FINAL rung_market:", cur.fetchone(), flush=True)
    conn.close()


if __name__ == "__main__":
    main()
