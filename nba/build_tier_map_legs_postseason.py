#!/usr/bin/env python3
"""
POSTSEASON TIER-MAP LEGS (strategy §31w P-5, 2026-10-08) -> nba_score.tier_map_legs_post.

The certified tier map (build_tier_map_bands.py REBUILD_LEGS) takes each real PrizePicks window leg, its current per-line price
(pp_leg_price), its graded outcome and the three rank scores, and ranks it inside its (day, prop, tier) cell. Its outcome and
team/game come from nba_market.prop_universe, which is regular-season-only by construction - so the postseason gets the SAME
construction with the outcome and context taken from postseason-aware sources:
  price / kind / tier   nba_market.pp_leg_price, window, exactly the certified expression (incl. the switch-point tier rule)
  rank scores           nba_score.final_hp, postseason rows only (game_id 004/005; phase 5_postseason)
  outcome               nba_market.board_outcomes (graded from the postseason box scores; book-agnostic, one row per leg)
  team                  the player's own postseason box-score row (nba_stats.player_game_log_postseason)
  game                  board_outcomes.event_id (the Odds API event - one per game)
  pf20                  trailing-20 personal fouls BEFORE the day over regular season + postseason games (the certified
                        nba_score.player_pf20 definition, with the postseason games the night has already seen)
Same columns as tier_map_legs (+ game_id, player_id, team_id, event_id, pf20) so build_slip_engine.py reads it self-contained
(SE_LEGS_SELF=1). Full rebuild every run (two postseasons are small). Env: DATABASE_URL.
"""
import os

import psycopg

STEPS = [
    "CREATE TABLE IF NOT EXISTS nba_score.tier_map_legs_post (LIKE nba_score.tier_map_legs INCLUDING DEFAULTS)",
    "ALTER TABLE nba_score.tier_map_legs_post ADD COLUMN IF NOT EXISTS game_id text",
    "ALTER TABLE nba_score.tier_map_legs_post ADD COLUMN IF NOT EXISTS player_id text",
    "ALTER TABLE nba_score.tier_map_legs_post ADD COLUMN IF NOT EXISTS team_id text",
    "ALTER TABLE nba_score.tier_map_legs_post ADD COLUMN IF NOT EXISTS event_id text",
    "ALTER TABLE nba_score.tier_map_legs_post ADD COLUMN IF NOT EXISTS pf20 double precision",
    "DELETE FROM nba_score.tier_map_legs_post",
    # final_score is the MARKET-FREE score - exactly how the live pipeline (no sportsbook feed) scores a leg and how the
    # certified live backtest (*_mf, nba/sql/build_tier_map_legs_sel_mf.sql) rescored the regular season: f_books = 0,
    # f_agree = 0.55, deductions read from nba_score.confidence_model. final_hp / baseline_hp are probabilities, untouched.
    """CREATE TEMP TABLE _fh AS
       SELECT f.season, f.game_date, f.game_id, f.player_id, f.prop, f.side, f.line,
              f.final_hp::float s_final, f.baseline_hp::float s_base,
              CASE WHEN f.c_market IS NULL OR f.confidence IS NULL THEN f.score::float ELSE
                round(least(100.0, greatest(0.0,
                  f.final_hp*100.0
                  + (100.0 - f.final_hp*100.0) * least(1.0, greatest(0.0, ((f.confidence - (k.d_books*f.c_market + CASE WHEN f.c_market > 0 THEN k.d_agree*0.30 ELSE 0 END)/100.0) - 0.85)/0.15)) * 0.5
                  - f.final_hp*100.0 * least(1.0, greatest(0.0, -(((f.confidence - (k.d_books*f.c_market + CASE WHEN f.c_market > 0 THEN k.d_agree*0.30 ELSE 0 END)/100.0) - 0.85)/0.15))) * 0.35
                ))::numeric, 2)::float END AS s_score
       FROM nba_score.final_hp f
       CROSS JOIN (SELECT max(deduction) FILTER (WHERE factor='f_books') d_books, max(deduction) FILTER (WHERE factor='f_agree') d_agree
                   FROM nba_score.confidence_model) k
       WHERE (f.game_id LIKE '004%' OR f.game_id LIKE '005%')
         AND f.final_hp IS NOT NULL AND f.baseline_hp IS NOT NULL AND f.score IS NOT NULL""",
    "CREATE INDEX ON _fh (game_date, player_id, prop, side, line)",
    """CREATE TEMP TABLE _priced AS
       SELECT p.game_date, p.nm,
         CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
           WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast'
           WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END AS prop,
         replace(p.base_market,'player_','') AS mk,
         p.side, p.line, p.kind,
         CASE WHEN p.tier IS NOT NULL AND p.tier <> 0 THEN p.tier
              WHEN p.kind IN ('goblin','demon') AND p.anchor_line IS NOT NULL THEN round(p.line - p.anchor_line)::int
              ELSE p.tier END AS sys_tier,
         p.factor::double precision AS price
       FROM nba_market.pp_leg_price p
       WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
         AND p.game_date IN (SELECT DISTINCT game_date FROM _fh)""",
    "CREATE INDEX ON _priced (game_date, nm, prop, side, line)",
    """CREATE TEMP TABLE _bo AS
       SELECT DISTINCT ON (game_date, pn, mk, side, line) game_date, pn, mk, side, line, event_id, h FROM (
         SELECT game_date, nba_ref.norm_name(player) pn, replace(replace(market_key,'_alternate',''),'player_','') mk,
                side, line, event_id,
                CASE WHEN leg_result = CASE side WHEN 'Over' THEN 'over_win' ELSE 'under_win' END THEN 1 ELSE 0 END h
         FROM nba_market.board_outcomes
         WHERE leg_result IN ('over_win','under_win') AND game_date IN (SELECT DISTINCT game_date FROM _fh)) x
       ORDER BY game_date, pn, mk, side, line""",
    "CREATE INDEX ON _bo (game_date, pn, mk, side, line)",
    """CREATE TEMP TABLE _pf AS
       SELECT pid, game_date, team_id, game_id, pf20 FROM (
         SELECT nba_player_id::text pid, game_date, team_id::text team_id, game_id::text game_id, post,
                avg(pf) OVER (PARTITION BY nba_player_id ORDER BY game_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) pf20
         FROM (SELECT nba_player_id, game_date, team_id, game_id, pf, false post FROM nba_stats.player_game_log
               UNION ALL
               SELECT nba_player_id, game_date, team_id, game_id, pf, true FROM nba_stats.player_game_log_postseason) u) w
       WHERE post""",
    "CREATE INDEX ON _pf (pid, game_date)",
    """INSERT INTO nba_score.tier_map_legs_post (rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score,
                                                hit, n_rank, cell_size, game_id, player_id, team_id, event_id, pf20)
       WITH legs AS (
         SELECT f.season, pr.game_date, coalesce(m.display_name, pr.nm) player, f.player_id, f.game_id, pr.prop, pr.side, pr.line,
                pr.kind, pr.sys_tier, pr.price, f.s_final, f.s_base, f.s_score, bo.h, bo.event_id, pf.team_id, pf.pf20
         FROM _priced pr
         JOIN nba_ref.player_name_map m ON m.norm_name = pr.nm
         JOIN _fh f ON f.game_date=pr.game_date AND f.player_id=m.player_id::text AND f.prop=pr.prop AND f.side=pr.side AND f.line=pr.line
         JOIN _bo bo ON bo.game_date=pr.game_date AND bo.pn=pr.nm AND bo.mk=pr.mk AND bo.side=pr.side AND bo.line=pr.line
         LEFT JOIN _pf pf ON pf.pid=f.player_id AND pf.game_date=pr.game_date
       ),
       tiered AS (
         SELECT *, CASE WHEN kind='standard' THEN 'R'
                        WHEN kind='goblin'   THEN 'G'||least(abs(sys_tier),3)
                        WHEN kind='demon'    THEN 'D'||least(abs(sys_tier),3) END AS tier
         FROM legs
       ),
       dedup AS (
         SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY game_date, player_id, prop, side, line ORDER BY price) dup FROM tiered) t
         WHERE dup=1 AND tier IS NOT NULL
       ),
       ranked AS (
         SELECT rk.rank_key, t.*,
           CASE rk.rank_key WHEN 'final_hp' THEN t.s_final WHEN 'baseline_hp' THEN t.s_base ELSE t.s_score END AS score
         FROM dedup t CROSS JOIN (VALUES ('final_hp'),('baseline_hp'),('final_score')) rk(rank_key)
       )
       SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, sys_tier, price, score, h,
         row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score DESC),
         count(*) OVER (PARTITION BY rank_key, game_date, prop, tier),
         game_id, player_id, team_id, event_id, pf20
       FROM ranked""",
]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    for st in STEPS:
        conn.execute(st)
    conn.commit()
    print(f"{'season':<9}{'rank':<13}{'days':>6}{'legs':>9}{'hit':>7}{'no team':>9}{'no event':>9}{'no pf20':>9}")
    for r in conn.execute("""SELECT season, rank_key, count(DISTINCT game_date), count(*), avg(hit),
                                    count(*) FILTER (WHERE team_id IS NULL), count(*) FILTER (WHERE event_id IS NULL),
                                    count(*) FILTER (WHERE pf20 IS NULL)
                             FROM nba_score.tier_map_legs_post GROUP BY 1,2 ORDER BY 1,2""").fetchall():
        print(f"{r[0]:<9}{r[1]:<13}{r[2]:>6}{r[3]:>9,}{float(r[4]):>7.3f}{r[5]:>9,}{r[6]:>9,}{r[7]:>9,}", flush=True)
    # coverage vs the priced postseason window board (how much of the board made it through the joins)
    tot = conn.execute("SELECT count(*) FROM _priced").fetchone()[0]
    got = conn.execute("SELECT count(*) FROM nba_score.tier_map_legs_post WHERE rank_key='final_hp'").fetchone()[0]
    print(f"coverage: {got:,} of {tot:,} priced postseason window legs ({100.0 * got / max(tot, 1):.1f}%) carry a postseason score and a graded outcome",
          flush=True)
    conn.close()


if __name__ == "__main__":
    main()
