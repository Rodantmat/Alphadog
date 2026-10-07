#!/usr/bin/env python3
"""
G2 GATE 2 TEST LEG TABLE - DEEP COMBO RUNGS (strategy doc §31s G2). Builds nba_score.tier_map_legs_dp = the certified
nba_score.tier_map_legs (copied, untouched) + every priced PrizePicks window leg on a PRA / pts_reb / pts_ast rung BEYOND the
old ladder (10 < |offset| <= the new per-prop depth), scored by the PRODUCTION price of those rungs (the research copy of
build_final_hp.py over the staged deep history -> nba_score._g2_deep_der, nba/g2_deep_stage.py) - the SAME raw currency as every
certified leg, so no conversion is needed.
The leg pool, tiering, keep-first de-duplication and the three rank keys are the CERTIFIED recipe itself
(build_tier_map_bands.REBUILD_LEGS and its _priced step, reused verbatim; only the score source and the target table differ,
each substitution asserted). n_rank / cell_size recomputed over the union. Env: DATABASE_URL.
"""
import inspect
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_tier_map_bands as TM  # noqa: E402

DEEP_SRC = "(SELECT * FROM nba_score._g2_deep_der WHERE derivation = 'beyond_certified_depth')"


def priced_sql():
    src = inspect.getsource(TM.rebuild_legs)
    i = src.index('CREATE TEMP TABLE _priced AS'); j = src.index('"""', i)
    return src[i:j]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    conn.execute(priced_sql())
    conn.execute("CREATE INDEX ON _priced (game_date, nm, prop, side, line)")
    conn.execute("ANALYZE _priced")
    q = TM.REBUILD_LEGS
    for old, new in (("INSERT INTO nba_score.tier_map_legs (", "INSERT INTO _deep ("), ("JOIN nba_score.final_hp f", f"JOIN {DEEP_SRC} f")):
        assert q.count(old) == 1, f"certified recipe anchor not found once: {old!r}"
        q = q.replace(old, new)
    conn.execute("""CREATE TEMP TABLE _deep (rank_key text, season text, game_date date, player text, prop text, side text, line numeric,
                    kind text, tier text, rung int, factor double precision, score double precision, hit int, n_rank int, cell_size int)""")
    conn.execute(q)
    n = conn.execute("SELECT count(*) FROM _deep").fetchone()[0]
    print(f"deep-rung legs (3 rank keys): {n:,}", flush=True)
    for r in conn.execute("""SELECT season, prop, tier, count(*)/3, round(avg(hit)::numeric, 3) FROM _deep GROUP BY 1,2,3 ORDER BY 1,2,3""").fetchall():
        print("  ", r, flush=True)
    conn.execute("DROP TABLE IF EXISTS nba_score.tier_map_legs_dp")
    conn.execute("""CREATE TABLE nba_score.tier_map_legs_dp AS
        WITH u AS (SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit FROM nba_score.tier_map_legs
                   UNION ALL
                   SELECT d.rank_key, d.season, d.game_date, d.player, d.prop, d.side, d.line, d.kind, d.tier, d.rung, d.factor, d.score, d.hit
                   FROM _deep d WHERE NOT EXISTS (SELECT 1 FROM nba_score.tier_map_legs c WHERE c.rank_key = d.rank_key AND c.game_date = d.game_date
                                                  AND c.player = d.player AND c.prop = d.prop AND c.side = d.side AND c.line = d.line))
        SELECT u.*, row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score DESC)::int AS n_rank,
               count(*) OVER (PARTITION BY rank_key, game_date, prop, tier)::int AS cell_size FROM u""")
    conn.execute("CREATE INDEX ON nba_score.tier_map_legs_dp (rank_key, game_date, prop, tier)")
    # keys for the comparison's "slips that used a new leg" share (player/prop/side/line; date-free, so an upper bound)
    conn.execute("DROP TABLE IF EXISTS nba_score._g2_deep_keys")
    conn.execute("CREATE TABLE nba_score._g2_deep_keys AS SELECT DISTINCT player, prop, side, line FROM _deep")
    conn.commit()
    chk = conn.execute("""SELECT count(*) FROM nba_score.tier_map_legs c JOIN nba_score.tier_map_legs_dp w USING (rank_key, game_date, player, prop, side, line)
                          WHERE c.score IS DISTINCT FROM w.score OR c.hit IS DISTINCT FROM w.hit OR c.factor IS DISTINCT FROM w.factor""").fetchone()[0]
    tot = conn.execute("SELECT (SELECT count(*) FROM nba_score.tier_map_legs), (SELECT count(*) FROM nba_score.tier_map_legs_dp)").fetchone()
    print(f"certified rows {tot[0]:,} | test rows {tot[1]:,} | certified legs altered (must be 0): {chk}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
