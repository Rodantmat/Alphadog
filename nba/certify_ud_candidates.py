#!/usr/bin/env python3
"""
UNDERDOG CANDIDATE CERTIFIER (strategy doc §30k) - recompute every Underdog candidate from the RAW sources.
Mirror of certify_candidates.py (PrizePicks, §23a): the derived tables (ud_window_legs, ud_stat_actual,
ud_tier_map_legs) are BYPASSED; per day this joins
  board_snapshots (underdog, window, snapshot_ts < commence_time, regular season)   -- the real board
    modifier m = round(decimal(price) / sqrt(3), 2)  (certified exact, §30i); tier = the side's modifier band
  -> board_outcomes (actual stat per player-market-day; DNP and push = void, Underdog's rule)  -- the real outcome
  -> nba_score.final_hp (final_hp / baseline_hp / score)                                     -- the real ranks
ranks the day's legs in the cell by the configured score, takes the top-n (days where the cell has n legs), and
reports per season: days, hit, mean modifier, p.m, % of days above break-even, profit per $100 3-pick Standard.

To avoid choosing one configuration per cell after the fact, every candidate cell is evaluated on a GRID:
rank in {final_hp, baseline_hp, score} x n in {1, 2, 3, 5} x side in {both, Over, Under}. All rows are kept.

Break-even BE = 6.5^(-1/3) = 0.536 (3-pick Standard pays 6.5 x prod(m); no 1.04 - conservative, §30h).
Profit per $100 3-pick Standard = 100 x (6.5 x pm^3 - 1) (legs independent; Underdog prices same-game picks
separately and the engine builds one pick per game).
Output: nba_score.ud_cand_certified. Env: DATABASE_URL.
"""
import os
import psycopg

BE = 6.5 ** (-1 / 3)
MKT = {'steals': 'steals', 'blocks_steals': 'stocks', 'turnovers': 'turnovers', 'blocks': 'blocks', 'points': 'points',
       'points_assists': 'pts_ast', 'points_rebounds': 'pts_reb', 'points_rebounds_assists': 'pra', 'rebounds': 'rebounds',
       'rebounds_assists': 'reb_ast', 'assists': 'assists', 'threes': 'threes_made'}

# the cells that passed the tier-map sweep AND constancy in both seasons (§30j-k); tiers: R / F1-F3 / B1-B3
CELLS = [('rebounds', 'F2'), ('rebounds', 'R'), ('turnovers', 'R'), ('reb_ast', 'R'), ('points', 'R'), ('assists', 'R'),
         ('reb_ast', 'B1'), ('rebounds', 'B1'), ('stocks', 'R'), ('pts_reb', 'R'), ('pra', 'R'), ('pts_ast', 'R'),
         ('threes_made', 'R'), ('steals', 'R'), ('blocks', 'R')]
RANKS = ['final_hp', 'baseline_hp', 'score']
NS = [1, 2, 3, 5]
SIDES = ['both', 'Over', 'Under']

RAW = """
CREATE TEMP TABLE _bd AS
  SELECT DISTINCT b.game_date, nba_ref.norm_name(b.player) pn, b.side, b.line,
    replace(replace(b.market_key,'_alternate',''),'player_','') AS mk,
    round(((CASE WHEN b.price < 0 THEN 1 + 100.0/abs(b.price) ELSE 1 + b.price/100.0 END)/sqrt(3))::numeric, 2)::float AS m
  FROM nba_market.board_snapshots b
  WHERE b.bookmaker='underdog' AND b.snapshot_label='window' AND b.snapshot_ts::timestamptz < b.commence_time::timestamptz
    AND (b.game_date BETWEEN '2024-10-22' AND '2025-04-13' OR b.game_date BETWEEN '2025-10-21' AND '2026-04-12')
    AND NOT (b.game_date = '2025-01-07' AND b.price IN (100, -10000));
CREATE INDEX ON _bd (game_date, pn, mk);

CREATE TEMP TABLE _oc AS
  SELECT game_date, nba_ref.norm_name(player) pn, replace(replace(market_key,'_alternate',''),'player_','') AS mk,
         max(stat_actual) stat, bool_or(played) played
  FROM nba_market.board_outcomes WHERE stat_actual IS NOT NULL AND game_date >= '2024-10-22'
  GROUP BY 1,2,3;
CREATE INDEX ON _oc (game_date, pn, mk);

CREATE TEMP TABLE _raw AS
SELECT bd.game_date, CASE WHEN bd.game_date < '2025-07-01' THEN '2024-25' ELSE '2025-26' END AS season,
       bd.pn AS player, p.prop, bd.side, bd.line, bd.m,
       CASE WHEN bd.m > 1.0 AND bd.m < 1.15 THEN 'B1' WHEN bd.m >= 1.15 AND bd.m < 1.40 THEN 'B2' WHEN bd.m >= 1.40 THEN 'B3'
            WHEN bd.m = 1.0 THEN 'R' WHEN bd.m >= 0.90 THEN 'F1' WHEN bd.m >= 0.80 THEN 'F2' ELSE 'F3' END AS tier,
       CASE WHEN bd.side='Over' AND oc.stat > bd.line THEN 1 WHEN bd.side='Under' AND oc.stat < bd.line THEN 1 ELSE 0 END AS h,
       f.score::float s_score, f.baseline_hp::float s_base, f.final_hp::float s_final
FROM _bd bd
JOIN (VALUES """ + ",".join(f"('{k}','{v}')" for k, v in MKT.items()) + """) p(mk, prop) ON p.mk = bd.mk
JOIN _oc oc ON oc.game_date=bd.game_date AND oc.pn=bd.pn AND oc.mk=bd.mk
JOIN nba_ref.player_name_map nm ON nm.norm_name = bd.pn
JOIN nba_score.final_hp f ON f.game_date=bd.game_date AND f.player_id=nm.player_id AND f.prop=p.prop AND f.side=bd.side AND f.line=bd.line
WHERE oc.played AND oc.stat <> bd.line
"""

SQL = """
WITH legs AS (
  SELECT game_date, season, player, side, h, m,
    CASE %(rank)s WHEN 'score' THEN s_score WHEN 'baseline_hp' THEN s_base ELSE s_final END AS s
  FROM _raw WHERE prop=%(prop)s AND tier=%(tier)s AND (%(side)s='both' OR side=%(side)s)
),
ranked AS (SELECT *, row_number() OVER (PARTITION BY game_date ORDER BY s DESC NULLS LAST, player, side) rn FROM legs WHERE s IS NOT NULL),
daily AS (SELECT season, game_date, avg(h*m) pm, avg(h) hit, avg(m) mult, count(*) got FROM ranked WHERE rn<=%(n)s GROUP BY 1,2)
SELECT season, count(*) days, avg(hit) hit, avg(mult) mult, avg(pm) pm, avg(CASE WHEN pm>=%(be)s THEN 1.0 ELSE 0 END) above
FROM daily WHERE got=%(n)s AND (season<>'2025-26' OR game_date>='2025-11-01')
GROUP BY season ORDER BY season
"""


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.ud_cand_certified (
        prop text, tier text, side text, n int, rank_key text, season text,
        days int, hit double precision, mult double precision, pm double precision, above double precision,
        profit_per_100 double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.ud_cand_certified")
    conn.commit()
    for stmt in RAW.split(';'):
        if stmt.strip():
            conn.execute(stmt)
    conn.execute("CREATE INDEX ON _raw (prop, tier, side, game_date)")
    conn.execute("ANALYZE _raw")
    n_raw = conn.execute("SELECT count(*), count(DISTINCT game_date) FROM _raw").fetchone()
    print(f"  raw board (pre-tip, priced, graded, ranked): {n_raw[0]:,} legs over {n_raw[1]} days; BE = {BE:.4f}", flush=True)
    for r in conn.execute("SELECT season, tier, count(*), round(avg(h)::numeric,3), round(avg(h*m)::numeric,3) FROM _raw GROUP BY 1,2 ORDER BY 1,2").fetchall():
        print(f"    {r[0]} {r[1]:<3} {r[2]:>7,} legs  hit {r[3]}  pm {r[4]}", flush=True)
    print(f"{'cell':<34} {'season':<8} {'days':>4} {'hit':>6} {'mult':>6} {'p.m':>6} {'%days>BE':>9} {'$/100':>6}", flush=True)
    rows_out = 0
    for prop, tier in CELLS:
        for rank in RANKS:
            for side in SIDES:
                for n in NS:
                    rows = conn.execute(SQL, {'prop': prop, 'tier': tier, 'side': side, 'n': n, 'rank': rank, 'be': BE}).fetchall()
                    for season, days, hit, mult, pm, above in rows:
                        profit = 100 * (6.5 * pm ** 3 - 1)
                        conn.execute("""INSERT INTO nba_score.ud_cand_certified (prop, tier, side, n, rank_key, season, days, hit, mult, pm, above, profit_per_100)
                                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                                     (prop, tier, side, n, rank, season, days, hit, mult, pm, above, profit))
                        rows_out += 1
                        if n in (1, 3) and side == 'both':
                            print(f"{prop+' '+tier+' '+side+' top'+str(n)+' '+rank:<34} {season:<8} {days:>4} {hit:>6.3f} {mult:>6.3f} {pm:>6.3f} {100*above:>8.0f}% {profit:>6.0f}", flush=True)
            conn.commit()
    conn.close()
    print(f"DONE - {rows_out} certified rows", flush=True)


if __name__ == "__main__":
    main()
