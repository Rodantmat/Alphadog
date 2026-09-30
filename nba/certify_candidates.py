#!/usr/bin/env python3
"""
NBA CANDIDATE CERTIFIER - recompute every candidate's numbers from the RAW sources, no intermediate table.

Owner: certify the numbers across real data, real legs, real board snapshots.
Every derived table in the chain (tier_map_legs, cand_leg_features, cand_signal_matrix) is bypassed. For each
candidate configuration this script joins, per day:
  board_snapshots (prizepicks, window, snapshot_ts < commence_time)  -- the real board
  -> prop_universe (real line, graded outcome)                         -- the real outcome
  -> pp_leg_price (window, current per-line price)                    -- the real price
  -> nba_score.final_hp (final_hp / baseline_hp / score)              -- the real ranks
ranks the day's legs by the configured score, takes the top-n, and reports per season:
  days, hit, mean multiplier, p.m, % of days above break-even (0.55), profit per $100 3-pick Power.
Output: nba_score.cand_certified (one row per config x season) + printed table.
Discrepancies vs the matrix are the point: the certified number wins.
"""
import os
import psycopg

BE = 0.55
MKT = {'steals': 'player_steals', 'stocks': 'player_blocks_steals', 'turnovers': 'player_turnovers', 'blocks': 'player_blocks',
       'points': 'player_points', 'pts_ast': 'player_points_assists', 'pts_reb': 'player_points_rebounds',
       'pra': 'player_points_rebounds_assists', 'rebounds': 'player_rebounds', 'reb_ast': 'player_rebounds_assists',
       'assists': 'player_assists', 'threes_made': 'player_threes'}

# (prop, kind, tier|None, side|'both', n, rank)   tier: system |tier| capped at 3; None = standard
CONFIGS = [
    ('steals', 'standard', None, 'Under', 1, 'score'), ('steals', 'standard', None, 'both', 2, 'score'),
    ('turnovers', 'standard', None, 'both', 3, 'score'), ('stocks', 'standard', None, 'both', 5, 'score'),
    ('pts_ast', 'standard', None, 'both', 3, 'baseline_hp'), ('points', 'standard', None, 'both', 5, 'score'),
    ('blocks', 'standard', None, 'both', 1, 'score'), ('pts_reb', 'standard', None, 'both', 5, 'score'),
    ('rebounds', 'standard', None, 'both', 5, 'baseline_hp'), ('pra', 'standard', None, 'Under', 1, 'baseline_hp'),
    ('reb_ast', 'standard', None, 'both', 3, 'baseline_hp'),
    ('threes_made', 'demon', 1, 'both', 2, 'score'), ('assists', 'demon', 3, 'Over', 3, 'final_hp'),
    ('rebounds', 'demon', 3, 'both', 3, 'score'), ('rebounds', 'demon', 1, 'both', 2, 'score'),
    ('assists', 'demon', 1, 'Over', 2, 'score'), ('points', 'demon', 2, 'both', 2, 'score'), ('points', 'demon', 3, 'both', 2, 'score'),
    # goblins, re-examined: top-1 and top-2 under each rank, Over only (goblins are Over-only)
    ('pra', 'goblin', 2, 'Over', 1, 'final_hp'), ('pra', 'goblin', 3, 'Over', 1, 'final_hp'), ('points', 'goblin', 1, 'Over', 1, 'final_hp'),
    ('points', 'goblin', 1, 'Over', 2, 'baseline_hp'), ('pts_reb', 'goblin', 1, 'Over', 1, 'final_hp'), ('pts_ast', 'goblin', 2, 'Over', 1, 'final_hp'),
]

SQL = """
WITH legs AS (
  SELECT game_date, season, player, side, h, price, kind, tier3,
    CASE %(rank)s WHEN 'score' THEN s_score WHEN 'baseline_hp' THEN s_base ELSE s_final END AS s
  FROM _raw WHERE prop=%(prop)s AND kind=%(kind)s AND (%(side)s='both' OR side=%(side)s)
    AND (%(tier)s::int IS NULL OR tier3=%(tier)s::int)
),
ranked AS (SELECT *, row_number() OVER (PARTITION BY game_date ORDER BY s DESC NULLS LAST, player) rn FROM legs WHERE s IS NOT NULL),
daily AS (SELECT season, game_date, avg(h*price) pm, avg(h) hit, avg(price) mult, count(*) got FROM ranked WHERE rn<=%(n)s GROUP BY 1,2)
SELECT season, count(*) days, avg(hit) hit, avg(mult) mult, avg(pm) pm,
  avg(CASE WHEN pm>%(be)s THEN 1.0 ELSE 0 END) above
FROM daily WHERE got=%(n)s AND (season<>'2025-26' OR game_date>='2025-11-01')
GROUP BY season ORDER BY season
"""

RAW = """
CREATE TEMP TABLE _bd AS
  SELECT DISTINCT game_date, nba_ref.norm_name(player) pn, line, side,
    replace(replace(market_key,'_alternate',''),'player_','') AS mk
  FROM nba_market.board_snapshots
  WHERE bookmaker='prizepicks' AND snapshot_label='window' AND snapshot_ts<commence_time;
CREATE INDEX ON _bd (game_date, pn, side, line, mk);

CREATE TEMP TABLE _pu AS
  SELECT game_date, nba_ref.norm_name(player) pn, player, player_id, season, prop, side, line, kind, hit::int h
  FROM nba_market.prop_universe WHERE line_source='real' AND hit IS NOT NULL;
CREATE INDEX ON _pu (game_date, pn, side, line, prop, kind);

CREATE TEMP TABLE _pr AS
  SELECT game_date, nm, side, line, kind, factor::float price, replace(base_market,'player_','') mk,
    least(abs(COALESCE(NULLIF(tier,0), round(line-anchor_line)::int)),3) AS tier3
  FROM nba_market.pp_leg_price WHERE snapshot_label='window' AND factor IS NOT NULL AND NOT coalesce(kind_position_mismatch,false);
CREATE INDEX ON _pr (game_date, nm, side, line, mk);

CREATE TEMP TABLE _raw AS
SELECT bd.game_date, pu.season, pu.player, pu.prop, bd.side, bd.line, pu.h, pr.price, pr.kind, pr.tier3,
       f.score::float s_score, f.baseline_hp::float s_base, f.final_hp::float s_final
FROM _bd bd
JOIN _pr pr ON pr.game_date=bd.game_date AND pr.nm=bd.pn AND pr.side=bd.side AND pr.line=bd.line AND pr.mk=bd.mk
JOIN _pu pu ON pu.game_date=bd.game_date AND pu.pn=bd.pn AND pu.side=bd.side AND pu.line=bd.line AND pu.kind=pr.kind
  AND pu.prop=CASE bd.mk WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra'
    WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' ELSE bd.mk END
JOIN nba_score.final_hp f ON f.game_date=pu.game_date AND f.player_id=pu.player_id AND f.prop=pu.prop AND f.side=pu.side AND f.line=pu.line
"""


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.cand_certified (
        prop text, kind text, tier int, side text, n int, rank_key text, season text,
        days int, hit double precision, mult double precision, pm double precision, above double precision,
        profit_per_100 double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.cand_certified")
    conn.commit()
    for stmt in RAW.split(';'):
        if stmt.strip():
            conn.execute(stmt)
    conn.execute("CREATE INDEX ON _raw (prop, kind, tier3, side, game_date)")
    conn.execute("ANALYZE _raw")
    n_raw = conn.execute("SELECT count(*) FROM _raw").fetchone()[0]
    print(f"  raw priced+graded+ranked board materialized: {n_raw:,} legs", flush=True)
    print(f"{'cell':<26} {'season':<8} {'days':>4} {'hit':>6} {'mult':>6} {'p.m':>6} {'%days>BE':>9} {'$/100':>6}", flush=True)
    for prop, kind, tier, side, n, rank in CONFIGS:
        rows = conn.execute(SQL, {'kind': kind, 'tier': tier, 'side': side, 'n': n, 'rank': rank, 'prop': prop, 'be': BE}).fetchall()
        label = f"{prop} {kind[0].upper()}{tier or ''} {side} top{n} {rank}"
        for season, days, hit, mult, pm, above in rows:
            profit = 100 * (6 * 0.95 * pm ** 3 - 1)
            conn.execute("""INSERT INTO nba_score.cand_certified (prop, kind, tier, side, n, rank_key, season, days, hit, mult, pm, above, profit_per_100)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                         (prop, kind, tier, side, n, rank, season, days, hit, mult, pm, above, profit))
            print(f"{label:<26} {season:<8} {days:>4} {hit:>6.3f} {mult:>6.3f} {pm:>6.3f} {100*above:>8.0f}% {profit:>6.0f}", flush=True)
        conn.commit()
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
