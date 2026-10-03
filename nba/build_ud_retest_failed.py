#!/usr/bin/env python3
"""
UNDERDOG RE-TEST OF EVERYTHING PRIZEPICKS TRIED AND DROPPED (strategy doc §30p; owner: "try all tried and failed with PP,
because it can help"). The leg-level ideas the PrizePicks program rejected that the Underdog matrix (§30l) did not already
cover, re-measured on Underdog's certified candidate legs with the SAME machinery (stats / cuts / ranks / break-even of
build_ud_signal_matrix.py), depth 1 (each band separately), lift vs the cut's own base, both seasons.

New features (strictly prior data or pre-game information):
  form_gap    anchor-distance / stat-magnitude form (PP §8d, §7l): side-oriented (prior-10 mean - line) / max(sd10, 0.5)
              (> 0 = recent form favours the pick's side; PP's "cold reversion" = Over legs with form_gap <= -1)
  min_cv5     role stability (PP §29 passes 32-33): minutes CV over the prior 5 games
  game_total  game environment / pace (PP §11k): morning game total (Odds API morning snapshot, pre-window)
  abs_spread  blowout risk (PP §11k): |morning home spread|
  position    position (PP §29 pass 39): G / F / C (first letter)
  crew_pf     referee crew (PP §11g): mean total fouls in the three officials' PRIOR 50 games, as a season percentile
              (computed as-of; the precomputed official_tendency table uses all games and would leak)
  warm30      cell-level persistence (PP §20, one of its few history findings): the (prop, tier) cell's top-3 hit rate over
              the prior 30 days (final-HP rank), excluding the day
  cal         calendar states (PP §29o, §29u): week1 / week2 / week3 of the season, the pre-All-Star-break week, other
Output: nba_score.ud_cand_leg_features_x, nba_score.ud_failed_signal_matrix. Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ud_signal_matrix as M   # stats, in_cut, RANKS, CUTS, MIN_LEGS, BE - the same machinery

FEATURES_SQL = """
DROP TABLE IF EXISTS nba_score.ud_cand_leg_features_x;
CREATE TABLE nba_score.ud_cand_leg_features_x AS
WITH f AS (SELECT * FROM nba_score.ud_cand_leg_features),
pid AS (SELECT DISTINCT player, game_date, player_id FROM nba_score.ud_tier_map_legs),
pgl AS (SELECT nba_player_id::text pid, game_id, game_date, min, pts, reb, ast, fg3m, stl, blk, tov, pf FROM nba_stats.player_game_log),
roll AS (
  SELECT pid, game_id, game_date,
    avg(pts) OVER w m_points, stddev_samp(pts) OVER w s_points,
    avg(reb) OVER w m_rebounds, stddev_samp(reb) OVER w s_rebounds,
    avg(ast) OVER w m_assists, stddev_samp(ast) OVER w s_assists,
    avg(fg3m) OVER w m_threes_made, stddev_samp(fg3m) OVER w s_threes_made,
    avg(stl+blk) OVER w m_stocks, stddev_samp(stl+blk) OVER w s_stocks,
    avg(tov) OVER w m_turnovers, stddev_samp(tov) OVER w s_turnovers,
    avg(blk) OVER w m_blocks, stddev_samp(blk) OVER w s_blocks,
    avg(pts+reb) OVER w m_pts_reb, stddev_samp(pts+reb) OVER w s_pts_reb,
    avg(pts+ast) OVER w m_pts_ast, stddev_samp(pts+ast) OVER w s_pts_ast,
    avg(pts+reb+ast) OVER w m_pra, stddev_samp(pts+reb+ast) OVER w s_pra,
    avg(reb+ast) OVER w m_reb_ast, stddev_samp(reb+ast) OVER w s_reb_ast,
    count(*) OVER w n10,
    stddev_samp(min) OVER w5 / nullif(avg(min) OVER w5, 0) min_cv5, count(*) OVER w5 n5
  FROM pgl
  WINDOW w AS (PARTITION BY pid ORDER BY game_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING),
         w5 AS (PARTITION BY pid ORDER BY game_date ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING)
),
gpf AS (SELECT game_id, min(game_date) game_date, sum(pf) tpf FROM pgl GROUP BY 1),
offr AS (SELECT o.game_id, avg(g.tpf) OVER (PARTITION BY o.nba_official_id ORDER BY g.game_date ROWS BETWEEN 50 PRECEDING AND 1 PRECEDING) o_pf
         FROM nba_stats.game_officials o JOIN gpf g ON g.game_id=o.game_id),
crew AS (SELECT game_id, avg(o_pf) crew_pf FROM offr GROUP BY 1),
ev AS (SELECT game_date, pn, prop, side, line, min(event_id) event_id FROM nba_score.ud_window_legs GROUP BY 1,2,3,4,5),
gl AS (SELECT event_id, max(CASE WHEN market='spreads' AND outcome=home_team THEN point END) home_spread,
              avg(CASE WHEN market='totals' AND outcome='Over' THEN point END) total
       FROM nba_market.game_lines_snapshots WHERE snapshot_label='morning' GROUP BY 1),
cd AS (SELECT prop, tier, game_date, avg(hit) top3 FROM nba_score.ud_tier_map_legs WHERE rank_key='final_hp' AND n_rank<=3 GROUP BY 1,2,3),
cw AS (SELECT prop, tier, game_date,
         avg(top3) OVER (PARTITION BY prop, tier ORDER BY game_date RANGE BETWEEN INTERVAL '30 days' PRECEDING AND INTERVAL '1 day' PRECEDING) warm30,
         count(*) OVER (PARTITION BY prop, tier ORDER BY game_date RANGE BETWEEN INTERVAL '30 days' PRECEDING AND INTERVAL '1 day' PRECEDING) nd30
       FROM cd),
dates AS (SELECT DISTINCT season, game_date FROM nba_score.ud_tier_map_legs),
gaps AS (SELECT season, game_date d, lead(game_date) OVER (PARTITION BY season ORDER BY game_date) nxt FROM dates),
asb AS (SELECT DISTINCT ON (season) season, d last_before FROM gaps WHERE extract(month FROM d) = 2 ORDER BY season, (nxt - d) DESC),
s0 AS (SELECT season, min(game_date) d0 FROM dates GROUP BY 1)
SELECT f.*,
  CASE WHEN r.n10 >= 5 THEN
    (CASE WHEN f.side='Over' THEN 1 ELSE -1 END) *
    ((CASE f.prop WHEN 'points' THEN r.m_points WHEN 'rebounds' THEN r.m_rebounds WHEN 'assists' THEN r.m_assists WHEN 'threes_made' THEN r.m_threes_made
       WHEN 'stocks' THEN r.m_stocks WHEN 'turnovers' THEN r.m_turnovers WHEN 'blocks' THEN r.m_blocks WHEN 'pts_reb' THEN r.m_pts_reb
       WHEN 'pts_ast' THEN r.m_pts_ast WHEN 'pra' THEN r.m_pra WHEN 'reb_ast' THEN r.m_reb_ast END) - f.line)
    / greatest(coalesce(CASE f.prop WHEN 'points' THEN r.s_points WHEN 'rebounds' THEN r.s_rebounds WHEN 'assists' THEN r.s_assists WHEN 'threes_made' THEN r.s_threes_made
       WHEN 'stocks' THEN r.s_stocks WHEN 'turnovers' THEN r.s_turnovers WHEN 'blocks' THEN r.s_blocks WHEN 'pts_reb' THEN r.s_pts_reb
       WHEN 'pts_ast' THEN r.s_pts_ast WHEN 'pra' THEN r.s_pra WHEN 'reb_ast' THEN r.s_reb_ast END, 0.5), 0.5)
  END AS form_gap,
  CASE WHEN r.n5 >= 4 THEN r.min_cv5 END AS min_cv5,
  gl.total AS game_total, abs(gl.home_spread) AS abs_spread,
  left(pl.position, 1) AS position,
  percent_rank() OVER (PARTITION BY f.season ORDER BY c.crew_pf) AS crew_pct, c.crew_pf,
  CASE WHEN cw.nd30 >= 10 THEN cw.warm30 END AS warm30,
  CASE WHEN f.game_date BETWEEN asb.last_before - 6 AND asb.last_before THEN 'allstar_week'
       WHEN f.game_date - s0.d0 < 7 THEN 'week1' WHEN f.game_date - s0.d0 < 14 THEN 'week2' WHEN f.game_date - s0.d0 < 21 THEN 'week3'
       ELSE 'other' END AS cal
FROM f
JOIN pid ON pid.player=f.player AND pid.game_date=f.game_date
LEFT JOIN roll r ON r.pid=pid.player_id AND r.game_date=f.game_date
LEFT JOIN crew c ON c.game_id=r.game_id
LEFT JOIN ev ON ev.game_date=f.game_date AND ev.pn=f.player AND ev.prop=f.prop AND ev.side=f.side AND ev.line=f.line
LEFT JOIN gl ON gl.event_id=ev.event_id
LEFT JOIN nba_ref.players pl ON pl.nba_player_id::text=pid.player_id
LEFT JOIN cw ON cw.prop=f.prop AND cw.tier=f.tier AND cw.game_date=f.game_date
JOIN asb ON asb.season=f.season
JOIN s0 ON s0.season=f.season
"""


def bands():
    B = {}
    def rng(key, cuts, labels):
        out = []
        for (lo, hi), lab in zip(cuts, labels):
            out.append((lab, lambda r, lo=lo, hi=hi, k=key: r[k] is not None and (lo is None or float(r[k]) >= lo) and (hi is None or float(r[k]) < hi)))
        return out
    B['form_gap'] = rng('form_gap', [(None, -1), (-1, -0.25), (-0.25, 0.25), (0.25, 1), (1, None)],
                        ['form <=-1 (against side)', 'form -1..-0.25', 'form neutral', 'form +0.25..+1', 'form >=+1 (with side)'])
    B['min_cv5'] = rng('min_cv5', [(None, 0.10), (0.10, 0.20), (0.20, None)], ['minutes stable cv<0.10', 'cv 0.10-0.20', 'minutes volatile cv>=0.20'])
    B['game_total'] = rng('game_total', [(None, 220), (220, 234), (234, None)], ['total <220', 'total 220-234', 'total >=234'])
    B['abs_spread'] = rng('abs_spread', [(None, 4), (4, 9), (9, None)], ['spread <4', 'spread 4-9', 'spread >=9 (blowout risk)'])
    B['position'] = [(p, lambda r, p=p: r['position'] == p) for p in ('G', 'F', 'C')]
    B['crew'] = rng('crew_pct', [(None, 0.333), (0.333, 0.667), (0.667, None)], ['crew low-foul', 'crew mid', 'crew high-foul'])
    B['warm30'] = rng('warm30', [(None, 0.50), (0.50, 0.60), (0.60, None)], ['cell cold <0.50', 'cell mid', 'cell warm >=0.60'])
    B['cal'] = [(c, lambda r, c=c: r['cal'] == c) for c in ('week1', 'week2', 'week3', 'allstar_week', 'other')]
    return B


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(FEATURES_SQL)
    conn.commit()
    cov = conn.execute("""SELECT count(*), count(form_gap), count(min_cv5), count(game_total), count(position), count(crew_pf), count(warm30),
                          count(*) FILTER (WHERE cal='allstar_week'), count(*) FILTER (WHERE cal='week1') FROM nba_score.ud_cand_leg_features_x""").fetchone()
    print(f"  features: {cov[0]:,} legs | form {cov[1]:,} | min_cv {cov[2]:,} | game lines {cov[3]:,} | position {cov[4]:,} | crew {cov[5]:,} | warm30 {cov[6]:,} | all-star wk {cov[7]:,} | week1 {cov[8]:,}", flush=True)
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.ud_failed_signal_matrix (
        prop text, tier text, side text, rank_key text, cut_type text, cut int, signal text, band text,
        legs_s1 int, days_s1 int, pm_s1 double precision, hit_s1 double precision,
        legs_s2 int, days_s2 int, pm_s2 double precision, hit_s2 double precision,
        base_pm_s1 double precision, base_pm_s2 double precision, lift_s1 double precision, lift_s2 double precision,
        built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.ud_failed_signal_matrix")
    conn.commit()
    cols = [d.name for d in conn.execute("SELECT * FROM nba_score.ud_cand_leg_features_x LIMIT 0").description]
    rows = [dict(zip(cols, r)) for r in conn.execute("SELECT * FROM nba_score.ud_cand_leg_features_x").fetchall()]
    B = bands()
    seasons = sorted({r['season'] for r in rows}); s1, s2 = seasons[0], seasons[-1]
    out = []
    for prop, tier in sorted({(r['prop'], r['tier']) for r in rows}):
        cell_rows = [r for r in rows if r['prop'] == prop and r['tier'] == tier]
        for side in ('both', 'Over', 'Under'):
            side_rows = cell_rows if side == 'both' else [r for r in cell_rows if r['side'] == side]
            for rk, rkcol in M.RANKS.items():
                for ct, cut in M.CUTS:
                    inside = [r for r in side_rows if M.in_cut(r, rkcol, ct, cut)]
                    if len(inside) < M.MIN_LEGS:
                        continue
                    bst = M.stats(inside)
                    if s1 not in bst or s2 not in bst:
                        continue
                    base = (bst[s1][2], bst[s2][2])
                    for sig, blist in B.items():
                        for label, pred in blist:
                            sub = [r for r in inside if pred(r)]
                            if len(sub) < M.MIN_LEGS:
                                continue
                            st = M.stats(sub)
                            a, b = st.get(s1), st.get(s2)
                            if not a or not b:
                                continue
                            out.append((prop, tier, side, rk, ct, cut, sig, label, a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3],
                                        base[0], base[1], a[2] - base[0], b[2] - base[1]))
        print(f"  {prop} {tier}: {len(out):,} rows", flush=True)
    with conn.cursor() as c:
        c.executemany("""INSERT INTO nba_score.ud_failed_signal_matrix (prop, tier, side, rank_key, cut_type, cut, signal, band,
            legs_s1, days_s1, pm_s1, hit_s1, legs_s2, days_s2, pm_s2, hit_s2, base_pm_s1, base_pm_s2, lift_s1, lift_s2)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", out)
    conn.commit()
    print(f"DONE - {len(out):,} tests", flush=True)


if __name__ == "__main__":
    main()
