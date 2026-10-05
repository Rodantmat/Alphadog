#!/usr/bin/env python3
"""
GATE-2 TEST LEG TABLE - WHOLE-NUMBER LINES (strategy doc §31s, G1). Builds nba_score.tier_map_legs_wi = the certified
nba_score.tier_map_legs (copied, untouched) + every priced PrizePicks window leg at a WHOLE-NUMBER line, with:
  - the certified tier map's own recipe: pp_leg_price window legs, the anchor-distance tier rule, prop_universe for season and
    outcome, tier names R / G1-3 / D1-3, keep-first de-duplication, three rank keys;
  - prices derived from the model's adjacent half rungs (P(More | no tie) = Over(k+1/2) / (Over(k+1/2) + Under(k-1/2)), mirror
    for Less), then RECALIBRATED with logit(p) -> b*logit(p) using the slope fitted on the OTHER season (cross-fit: 2024-25 legs
    use b 0.328 fitted on 2025-26; 2025-26 legs use b 0.300 fitted on 2024-25) - the backtest stays out-of-sample;
  - final_hp / baseline_hp keys from their own adjacent rungs; final_score key from the PRODUCTION score formula
    (CONF_NEUTRAL 0.85, lift x0.50, drop x0.35) on the recalibrated final_hp and the lower adjacent-rung confidence;
  - TIES kept (the player played and the stat equalled the line): hit NULL, voided by the engine's tie-aware grade();
    DNPs excluded, exactly as the certified build does;
  - n_rank and cell_size RECOMPUTED over the union, so whole-number legs compete in the same cells.
Never writes the certified table. Env: DATABASE_URL.
"""
import os

import psycopg

B_BY_SEASON = {'2024-25': 0.328, '2025-26': 0.300}

STEPS = [
("drop", "DROP TABLE IF EXISTS nba_score.tier_map_legs_wi"),
("priced whole-number window legs", """
CREATE TEMP TABLE _pi AS
SELECT p.game_date, p.nm,
  CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
    WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
    WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END AS prop,
  p.side, p.line, p.kind,
  CASE WHEN p.tier IS NOT NULL AND p.tier <> 0 THEN p.tier
       WHEN p.kind IN ('goblin','demon') AND p.anchor_line IS NOT NULL THEN round(p.line - p.anchor_line)::int
       ELSE p.tier END AS sys_tier,
  p.factor::double precision AS price
FROM nba_market.pp_leg_price p
WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false) AND p.line = floor(p.line)"""),
("index", "CREATE INDEX ON _pi (game_date, nm, prop, side, line)"),
("derived + recalibrated whole-number legs", """
CREATE TEMP TABLE _wl AS
WITH j AS (
  SELECT pu.season, pi.game_date, pu.player, pi.prop, pi.side, pi.line, pi.kind, pi.sys_tier, pi.price, pu.hit,
         o.final_hp::float o_f, u.final_hp::float u_f, o.baseline_hp::float o_b, u.baseline_hp::float u_b,
         least(o.confidence, u.confidence)::float conf,
         g.min::float mins,
         CASE pi.prop WHEN 'points' THEN g.pts WHEN 'rebounds' THEN g.reb WHEN 'assists' THEN g.ast WHEN 'threes_made' THEN g.fg3m
           WHEN 'steals' THEN g.stl WHEN 'blocks' THEN g.blk WHEN 'turnovers' THEN g.tov WHEN 'pts_reb' THEN g.pts+g.reb
           WHEN 'pts_ast' THEN g.pts+g.ast WHEN 'reb_ast' THEN g.reb+g.ast WHEN 'pra' THEN g.pts+g.reb+g.ast WHEN 'stocks' THEN g.stl+g.blk END::float stat
  FROM _pi pi
  JOIN nba_market.prop_universe pu ON pu.game_date=pi.game_date AND nba_ref.norm_name(pu.player)=pi.nm AND pu.prop=pi.prop
       AND pu.side=pi.side AND pu.line=pi.line AND pu.line_source='real'
  JOIN nba_score.final_hp o ON o.game_date=pu.game_date AND o.player_id=pu.player_id AND o.prop=pu.prop AND o.side='Over'  AND o.line=pu.line+0.5
  JOIN nba_score.final_hp u ON u.game_date=pu.game_date AND u.player_id=pu.player_id AND u.prop=pu.prop AND u.side='Under' AND u.line=pu.line-0.5
  LEFT JOIN nba_stats.player_game_log g ON g.game_date=pu.game_date AND g.nba_player_id=pu.player_id::bigint
  WHERE o.final_hp IS NOT NULL AND u.final_hp IS NOT NULL AND o.baseline_hp IS NOT NULL AND u.baseline_hp IS NOT NULL
), k AS (
  SELECT *, CASE WHEN hit IS NOT NULL THEN hit::int WHEN coalesce(mins,0) > 0 AND stat = line THEN NULL END AS h,
         (hit IS NOT NULL OR (coalesce(mins,0) > 0 AND stat = line)) AS keep,
         CASE season WHEN '2024-25' THEN %(b2425)s ELSE %(b2526)s END AS b
  FROM j
), p AS (
  SELECT *, CASE side WHEN 'Over' THEN o_f/(o_f+u_f) ELSE u_f/(o_f+u_f) END pf, CASE side WHEN 'Over' THEN o_b/(o_b+u_b) ELSE u_b/(o_b+u_b) END pb
  FROM k WHERE keep AND o_f+u_f > 0 AND o_b+u_b > 0
), c AS (
  SELECT *, 1/(1+exp(-b*ln(greatest(least(pf,0.9999),0.0001)/(1-greatest(least(pf,0.9999),0.0001))))) pf_cal,
            1/(1+exp(-b*ln(greatest(least(pb,0.9999),0.0001)/(1-greatest(least(pb,0.9999),0.0001))))) pb_cal,
            (coalesce(conf,0.85) - 0.85)/0.15 cdev FROM p
)
SELECT season, game_date, player, prop, side, line, kind, sys_tier, price, h, pf_cal s_final, pb_cal s_base,
  round(greatest(0, least(100, pf_cal*100 + (100 - pf_cal*100)*greatest(0,least(cdev,1))*0.50 - pf_cal*100*greatest(0,least(-cdev,1))*0.35))::numeric, 2)::float s_score
FROM c"""),
("union with the certified legs, re-ranked", """
CREATE TABLE nba_score.tier_map_legs_wi AS
WITH tiered AS (
  SELECT *, CASE WHEN kind='standard' THEN 'R' WHEN kind='goblin' THEN 'G'||least(abs(sys_tier),3)
                 WHEN kind='demon' THEN 'D'||least(abs(sys_tier),3) END AS tier FROM _wl
), dedup AS (
  SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY game_date, player, prop, side, line ORDER BY price) dup FROM tiered) t WHERE dup=1
), wl AS (
  SELECT rk.rank_key, d.season, d.game_date, d.player, d.prop, d.side, d.line, d.kind, d.tier, d.sys_tier AS rung, d.price AS factor,
         CASE rk.rank_key WHEN 'final_hp' THEN d.s_final WHEN 'baseline_hp' THEN d.s_base ELSE d.s_score END AS score, d.h AS hit
  FROM dedup d CROSS JOIN (VALUES ('final_hp'),('baseline_hp'),('final_score')) rk(rank_key)
), u AS (
  SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit FROM nba_score.tier_map_legs
  UNION ALL SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit FROM wl
)
SELECT u.*, row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score DESC)::int AS n_rank,
       count(*) OVER (PARTITION BY rank_key, game_date, prop, tier)::int AS cell_size
FROM u"""),
("index", "CREATE INDEX ON nba_score.tier_map_legs_wi (rank_key, game_date, prop, tier)"),
]


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    for label, sql in STEPS:
        conn.execute(sql, {'b2425': B_BY_SEASON['2024-25'], 'b2526': B_BY_SEASON['2025-26']} if '%(' in sql else None)
        print(f"  done: {label}", flush=True)
    conn.commit()
    for q, lbl in (("SELECT count(*) FROM nba_score.tier_map_legs", "certified rows"),
                   ("SELECT count(*) FROM nba_score.tier_map_legs_wi", "test rows"),
                   ("SELECT count(*) FROM nba_score.tier_map_legs_wi WHERE line = floor(line)", "whole-number rows"),
                   ("SELECT count(*) FROM nba_score.tier_map_legs_wi WHERE line = floor(line) AND hit IS NULL", "  of which ties"),
                   ("SELECT round(avg(score)::numeric,4) FROM nba_score.tier_map_legs_wi WHERE line = floor(line) AND rank_key='final_hp'", "mean recalibrated final_hp")):
        print(f"  {lbl}: {conn.execute(q).fetchone()[0]}", flush=True)
    chk = conn.execute("""SELECT count(*) FROM nba_score.tier_map_legs c JOIN nba_score.tier_map_legs_wi w USING (rank_key, game_date, player, prop, side, line)
                          WHERE c.score IS DISTINCT FROM w.score OR c.hit IS DISTINCT FROM w.hit OR c.factor IS DISTINCT FROM w.factor""").fetchone()[0]
    print(f"  certified legs altered in the copy (must be 0): {chk}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
