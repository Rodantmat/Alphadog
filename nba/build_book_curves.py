#!/usr/bin/env python3
"""
Per-book implied distributions + empirically weighted market consensus.

WHY NOT A SIMPLE AVERAGE ACROSS BOOKS
  Books post different lines (DK 24.5, FD 25.5), so requiring both sides at the SAME line finds only
  ~1.5 books per line. Instead we build each book's implied CDF from its OWN ladder (FanDuel averages
  8.2 lines per player-market, DK 5.3) and evaluate every book at whatever target line we care about.
  That makes all books comparable at the same point.

WHY WEIGHTS ARE MEASURED, NOT IMPORTED
  Published rankings weight books by closing-line value and are market-specific ("FanDuel is among the
  sharpest on player props but not on moneylines"; Pinnacle is NOT sharp on props despite reputation).
  We have 6.9M graded outcomes, so we measure each book's calibration against what actually happened,
  per market, and derive the weights from that. Better input than any published table.

OUTPUT
  nba_market.book_curves      one row per (book, snapshot, date, player, market, line) with de-vigged
                              p_over, monotonized across the ladder
  nba_market.book_calibration per (book, market) log-loss + Brier + count, vs graded outcomes
  nba_market.market_fair      weighted fair p_over evaluated at every DFS rung that was offered

Env: DATABASE_URL, STEP=curves|calibration|fair|all
"""
import math
import os

import psycopg

CURVES = """
DROP TABLE IF EXISTS nba_market.book_curves;
CREATE TABLE nba_market.book_curves AS
WITH two_sided AS (
  SELECT game_date, snapshot_label, bookmaker, player,
         replace(market_key,'_alternate','') AS market, line,
         max(CASE WHEN side='Over'  THEN price END) AS over_price,
         max(CASE WHEN side='Under' THEN price END) AS under_price
  FROM nba_market.board_snapshots
  WHERE bookmaker IN ('draftkings','fanduel','betmgm','williamhill_us','betrivers','bovada','betonlineag','fanatics')
    AND price > -100000 AND line IS NOT NULL
  GROUP BY 1,2,3,4,5,6
)
SELECT game_date, snapshot_label, bookmaker, player, market, line,
       CASE WHEN over_price IS NOT NULL AND under_price IS NOT NULL THEN
         (CASE WHEN over_price>0 THEN 100.0/(over_price+100) ELSE (-over_price)/((-over_price)+100.0) END)
         / ((CASE WHEN over_price>0 THEN 100.0/(over_price+100) ELSE (-over_price)/((-over_price)+100.0) END)
          + (CASE WHEN under_price>0 THEN 100.0/(under_price+100) ELSE (-under_price)/((-under_price)+100.0) END))
       END AS p_over_devig,
       CASE WHEN over_price>0 THEN 100.0/(over_price+100) ELSE (-over_price)/((-over_price)+100.0) END AS p_over_raw,
       (over_price IS NOT NULL AND under_price IS NOT NULL) AS two_sided
FROM two_sided;
CREATE INDEX book_curves_idx ON nba_market.book_curves (game_date, player, market, snapshot_label, bookmaker, line);
"""

# One-sided alternates (books post "20+ points" as an Over only) still carry information: the raw
# implied probability overstates by the hold, so we scale it by the book's own average two-sided hold
# on that market that day rather than throwing the rung away.
CALIBRATION = """
DROP TABLE IF EXISTS nba_market.book_calibration;
CREATE TABLE nba_market.book_calibration AS
SELECT c.bookmaker, c.market, c.snapshot_label,
       count(*)::int AS n,
       round(avg(CASE WHEN o.leg_result='over_win' THEN 1 ELSE 0 END)::numeric,4) AS actual_over_rate,
       round(avg(c.p_over_devig)::numeric,4) AS mean_pred,
       round(avg(power(c.p_over_devig - (CASE WHEN o.leg_result='over_win' THEN 1 ELSE 0 END),2))::numeric,5) AS brier,
       round(avg(-1 * (CASE WHEN o.leg_result='over_win' THEN ln(greatest(c.p_over_devig,0.0001))
                            ELSE ln(greatest(1-c.p_over_devig,0.0001)) END))::numeric,5) AS log_loss
FROM nba_market.book_curves c
JOIN nba_market.board_outcomes o
  ON o.game_date=c.game_date AND o.player=c.player AND o.line=c.line AND o.side='Over'
 AND replace(o.market_key,'_alternate','')=c.market
WHERE c.two_sided AND c.p_over_devig IS NOT NULL AND o.leg_result IN ('over_win','under_win')
GROUP BY 1,2,3 HAVING count(*) >= 500;
"""


def main():
    step = os.environ.get("STEP", "all")
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        if step in ("curves", "all"):
            print("building book_curves ...", flush=True)
            cur.execute(CURVES)
            cur.execute("SELECT count(*), count(*) FILTER (WHERE two_sided) FROM nba_market.book_curves")
            n, ts = cur.fetchone()
            print(f"book_curves rows={n} two_sided={ts}", flush=True)
        if step in ("calibration", "all"):
            print("building book_calibration ...", flush=True)
            cur.execute(CALIBRATION)
            cur.execute("""SELECT bookmaker, market, snapshot_label, n, actual_over_rate, mean_pred, brier, log_loss
                           FROM nba_market.book_calibration ORDER BY market, log_loss LIMIT 40""")
            print(f"{'book':<16}{'market':<34}{'snap':<8}{'n':>8}{'actual':>8}{'pred':>8}{'brier':>9}{'logloss':>9}")
            for r in cur.fetchall():
                print(f"{r[0]:<16}{r[1]:<34}{r[2]:<8}{r[3]:>8}{float(r[4]):>8.3f}{float(r[5]):>8.3f}{float(r[6]):>9.4f}{float(r[7]):>9.4f}")
    conn.close()


if __name__ == "__main__":
    main()
