#!/usr/bin/env python3
"""
PHASE C - THE PER-LEG STORE (NBA_HONEST_REBUILD.md 8t). Owner D8: "run per leg, leg per leg, for all the back data we have. Each one of the legs, each one
of the days, each one of the boards, each one of the prop lines, each one of the players, all the variations, ladders, everything ... give them the correct
ROI, hit rate". Writes ONLY new objects beside production (nothing production reads):
  nba_score.v_legs_honest        VIEW, one row per board leg of the four apps, three seasons: app, season, date, player, prop, side, line, kind, tier,
                                 price source (real | derived | modelled), return multiplier, result, honest baseline chance, the walk-forward numbers
                                 (blend, small gbm, gbm; empty where no model existed yet), predicted return, realised return. No storage of its own.
  nba_score.honest_leg_cells     roll-up by app x season x price source x kind x prop x side x line band x predicted-return band (blend): legs, hit rate,
                                 realised ROI, mean predicted ROI
  nba_score.honest_leg_players   roll-up by app x season x player x side on REGULAR lines: legs, slates, hit rate, ROI
  nba_score.honest_leg_ladders   roll-up by app x season x kind x multiplier band x side: legs, hit rate, break-even, ROI   (the ladder / variation view)
Then prints the headline tables. Env: DATABASE_URL.
"""
import os

import psycopg

MM = "(CASE WHEN l.app = 'prizepicks' THEN l.m / 0.542 ELSE l.m END)"
SRC = "(CASE WHEN l.app = 'prizepicks' AND l.kind IN ('goblin', 'demon') THEN 'modelled' ELSE l.src END)"
KIND = "(CASE WHEN l.kind IN ('standard', 'R', 'main') THEN 'regular' WHEN l.kind IN ('goblin', 'F') THEN 'goblin' WHEN l.kind IN ('demon', 'B') THEN 'demon' ELSE 'alt' END)"
VIEW = f"""
CREATE OR REPLACE VIEW nba_score.v_legs_honest AS
SELECT l.app, l.season, l.game_date, l.player_id, l.prop, l.side, (lower(left(l.side, 1)) NOT IN ('o', 'm', 'h')) AS is_under, l.line, {KIND} AS kind, l.tier,
       {SRC} AS price_source, {MM}::float8 AS multiplier, (1.0 / {MM})::float8 AS break_even, l.hit, l.ph AS p_honest_baseline,
       p.p_blend, p.p_gbm_s AS p_small_gbm, p.p_gbm, (p.p_blend * {MM} - 1)::float8 AS predicted_return, (l.hit::int * {MM} - 1)::float8 AS realised_return
FROM nba_score._lr_legs_h l
LEFT JOIN nba_score._lr_legs_hp p ON p.app = l.app AND p.game_date = l.game_date AND p.player_id = l.player_id AND p.prop = l.prop AND p.side = l.side AND p.line = l.line
     AND p.kind = l.kind AND p.tier IS NOT DISTINCT FROM l.tier
WHERE l.hit IS NOT NULL AND l.m > 0 AND NOT (l.app = 'prizepicks' AND l.tier LIKE '%-u')"""
CELLS = """
CREATE TABLE nba_score.honest_leg_cells AS
SELECT app, season, price_source, kind, prop, CASE WHEN is_under THEN 'Under' ELSE 'Over' END side,
       CASE WHEN line < 1 THEN '0.5' WHEN line < 3 THEN '1-2.5' WHEN line < 6 THEN '3-5.5' WHEN line < 10 THEN '6-9.5' WHEN line < 15 THEN '10-14.5' WHEN line < 20 THEN '15-19.5'
            WHEN line < 26 THEN '20-25.5' ELSE '26+' END line_band,
       CASE WHEN predicted_return IS NULL THEN 'no model yet' WHEN predicted_return < -0.15 THEN 'below -15%' WHEN predicted_return < -0.05 THEN '-15..-5%' WHEN predicted_return < 0 THEN '-5..0%'
            WHEN predicted_return < 0.05 THEN '0..+5%' ELSE 'above +5%' END predicted_band,
       count(*) legs, count(DISTINCT game_date) slates, avg(hit::int)::float8 hit_rate, avg(break_even)::float8 break_even, avg(realised_return)::float8 roi, avg(predicted_return)::float8 predicted_roi
FROM nba_score.v_legs_honest GROUP BY 1, 2, 3, 4, 5, 6, 7, 8"""
PLAYERS = """
CREATE TABLE nba_score.honest_leg_players AS
SELECT app, season, player_id, CASE WHEN is_under THEN 'Under' ELSE 'Over' END side, count(*) legs, count(DISTINCT game_date) slates, avg(hit::int)::float8 hit_rate,
       avg(realised_return)::float8 roi, avg(predicted_return)::float8 predicted_roi
FROM nba_score.v_legs_honest WHERE kind = 'regular' GROUP BY 1, 2, 3, 4"""
LADDERS = """
CREATE TABLE nba_score.honest_leg_ladders AS
SELECT app, season, price_source, kind, CASE WHEN is_under THEN 'Under' ELSE 'Over' END side,
       CASE WHEN break_even >= .80 THEN 'chance needed 80%+' WHEN break_even >= .70 THEN '70-80%' WHEN break_even >= .60 THEN '60-70%' WHEN break_even >= .55 THEN '55-60%' WHEN break_even >= .50 THEN '50-55%'
            WHEN break_even >= .40 THEN '40-50%' WHEN break_even >= .30 THEN '30-40%' WHEN break_even >= .20 THEN '20-30%' ELSE 'below 20%' END rung,
       count(*) legs, avg(hit::int)::float8 hit_rate, avg(break_even)::float8 break_even, avg(realised_return)::float8 roi
FROM nba_score.v_legs_honest GROUP BY 1, 2, 3, 4, 5, 6"""


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    conn.execute(VIEW)
    for t, q in (("honest_leg_cells", CELLS), ("honest_leg_players", PLAYERS), ("honest_leg_ladders", LADDERS)):
        conn.execute(f"DROP TABLE IF EXISTS nba_score.{t}"); conn.execute(q); conn.commit()
        n = conn.execute(f"SELECT count(*), pg_size_pretty(pg_total_relation_size('nba_score.{t}')) FROM nba_score.{t}").fetchone()
        print(f"LS|nba_score.{t}: {n[0]:,} rows, {n[1]}", flush=True)
    tot = conn.execute("SELECT count(*), count(p_blend), count(DISTINCT game_date), count(DISTINCT player_id) FROM nba_score.v_legs_honest").fetchone()
    print(f"LS|nba_score.v_legs_honest: {tot[0]:,} legs ({tot[1]:,} with a walk-forward number) on {tot[2]} dates, {tot[3]:,} players", flush=True)
    print("\nLS|=== every leg on the board: app | season | price | kind | side | legs | hit | needed | ROI ===", flush=True)
    for r in conn.execute("""SELECT app, season, price_source, kind, side, sum(legs), sum(hit_rate * legs) / sum(legs), sum(break_even * legs) / sum(legs), sum(roi * legs) / sum(legs)
                             FROM nba_score.honest_leg_cells GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2, 4, 5""").fetchall():
        print(f"LS|  {r[0]:10s} {r[1]} {r[2]:8s} {r[3]:7s} {r[4]:5s} legs {int(r[5]):9,} hit {r[6]:.3f} needed {r[7]:.3f} ROI {100 * r[8]:+6.1f}%", flush=True)
    print("\nLS|=== by what the blend predicted (regular lines; real prices; all seasons with a number): app | season | predicted band | legs | hit | ROI ===", flush=True)
    for r in conn.execute("""SELECT app, season, predicted_band, sum(legs), sum(hit_rate * legs) / sum(legs), sum(roi * legs) / sum(legs) FROM nba_score.honest_leg_cells
                             WHERE kind = 'regular' AND price_source = 'real' AND predicted_band <> 'no model yet' GROUP BY 1, 2, 3
                             ORDER BY 1, 2, min(CASE predicted_band WHEN 'below -15%' THEN 1 WHEN '-15..-5%' THEN 2 WHEN '-5..0%' THEN 3 WHEN '0..+5%' THEN 4 ELSE 5 END)""").fetchall():
        print(f"LS|  {r[0]:10s} {r[1]} {r[2]:12s} legs {int(r[3]):9,} hit {r[4]:.3f} ROI {100 * r[5]:+6.1f}%", flush=True)
    print("\nLS|=== regular lines by prop and side (real prices, three seasons pooled): app | prop | side | legs | hit | ROI ===", flush=True)
    for r in conn.execute("""SELECT app, prop, side, sum(legs), sum(hit_rate * legs) / sum(legs), sum(roi * legs) / sum(legs) FROM nba_score.honest_leg_cells
                             WHERE kind = 'regular' AND price_source = 'real' GROUP BY 1, 2, 3 HAVING sum(legs) >= 500 ORDER BY 1, 6 DESC""").fetchall():
        print(f"LS|  {r[0]:10s} {r[1]:14s} {r[2]:5s} legs {int(r[3]):8,} hit {r[4]:.3f} ROI {100 * r[5]:+6.1f}%", flush=True)
    print("\nLS|=== the ladder: by the chance a rung needs (real prices only): app | kind | side | rung | legs | hit | needed | ROI ===", flush=True)
    for r in conn.execute("""SELECT app, kind, side, rung, sum(legs), sum(hit_rate * legs) / sum(legs), sum(break_even * legs) / sum(legs), sum(roi * legs) / sum(legs) FROM nba_score.honest_leg_ladders
                             WHERE price_source = 'real' AND kind <> 'regular' GROUP BY 1, 2, 3, 4 HAVING sum(legs) >= 300 ORDER BY 1, 2, 3, 7 DESC""").fetchall():
        print(f"LS|  {r[0]:10s} {r[1]:7s} {r[2]:5s} {r[3]:18s} legs {int(r[4]):8,} hit {r[5]:.3f} needed {r[6]:.3f} ROI {100 * r[7]:+6.1f}%", flush=True)
    pl = conn.execute("""SELECT count(*) FILTER (WHERE legs >= 60), count(*) FILTER (WHERE legs >= 60 AND roi > 0), count(*) FILTER (WHERE legs >= 60 AND roi > 0.05)
                         FROM nba_score.honest_leg_players WHERE season = '2025-26' AND app IN ('underdog', 'prizepicks')""").fetchone()
    rep = conn.execute("""SELECT count(*), avg((b.roi > 0)::int), corr(a.roi, b.roi) FROM nba_score.honest_leg_players a JOIN nba_score.honest_leg_players b USING (app, player_id, side)
                          WHERE a.season = '2024-25' AND b.season = '2025-26' AND a.legs >= 60 AND b.legs >= 60 AND a.roi > 0 AND a.app IN ('underdog', 'prizepicks')""").fetchone()
    allc = conn.execute("""SELECT count(*), avg((b.roi > 0)::int), corr(a.roi, b.roi) FROM nba_score.honest_leg_players a JOIN nba_score.honest_leg_players b USING (app, player_id, side)
                           WHERE a.season = '2024-25' AND b.season = '2025-26' AND a.legs >= 60 AND b.legs >= 60 AND a.app IN ('underdog', 'prizepicks')""").fetchone()
    print(f"\nLS|=== players (regular lines, Underdog + PrizePicks, player x side with 60+ legs in 2025-26): {pl[0]:,}; positive ROI {pl[1]:,}; above +5% {pl[2]:,}", flush=True)
    print(f"LS|    does a player's ROI repeat? player x side with 60+ legs in both 2024-25 and 2025-26: {allc[0]:,}, correlation of the two seasons' ROI {allc[2]:+.3f}, positive in 2025-26 {100 * allc[1]:.0f}%; "
          f"of the {rep[0]:,} that were positive in 2024-25, positive again {100 * (rep[1] or 0):.0f}% (correlation {rep[2] or 0:+.3f})", flush=True)
    conn.close(); print("LS|DONE", flush=True)


if __name__ == "__main__":
    main()
