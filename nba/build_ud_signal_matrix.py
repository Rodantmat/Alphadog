#!/usr/bin/env python3
"""
UNDERDOG CANDIDATE x SIGNAL MATRIX (strategy doc §30l) - the PrizePicks matrix (build_cand_signal_matrix.py, §22)
re-run on Underdog's certified cells (§30k), nothing carried over. Only the inputs differ (diffable):
  legs = nba_score.ud_tier_map_legs (Underdog tiers R/F1-F3/B1-B3, factor = modifier, player_id carried);
  BE = 0.536 (6.5^(-1/3), 3-pick Standard); tables ud_cand_leg_features / ud_cand_signal_matrix;
  + one signal PrizePicks found later (§29r): the low-foul key, trailing-20 fouls (prior games only), step bands <1.8 / 1.8-2.5 / >=2.5.

ORIGINAL DESCRIPTION (PrizePicks):
NBA CANDIDATE x SIGNAL MATRIX — every candidate cell, every rank, every cut, every signal band,
tested SEPARATELY (owner: no summarizing across tiers, prop lines, ranks or layers), then stacked.

Stage A  build_leg_features -> nba_score.ud_cand_leg_features
  One row per candidate-cell leg (both seasons), from tier_map_legs (real PP window board, current
  per-line price, system tier), with every pre-window signal computed strictly from prior data:
    ranks:   n_rank under final_hp / baseline_hp / final_score (all three, per leg)
    trailing: t3, t5, t10 hit rate on (player, prop, tier, side), n_trail; consistency (sd of last 10)
    form:    cold_all (player all-time rate on the cell, per side), app_all
    minutes: min3 - min10 (prior games); usage: usg3 - usg10
    schedule: rest_days, is_b2b, phase (early/mid/late)
    line:    line_class (half / low / mid / high by prop-specific bands)
    market:  mkt_edge = score - book prob (side-aware), books (count)
    context: team_total (Vegas implied, when present), pace (both teams trailing), alpha_out (WOWY)
  Plus factor, hit, cell_size.

Stage B  run_matrix -> nba_score.ud_cand_signal_matrix
  For each (prop, tier, side) x rank x cut (n=1,2,3,5,8,10 and pct 5/10/20/33/50) the BASE p.m and hit,
  and then, for each signal x band, the p.m/hit of the legs INSIDE the cut that fall in that band, with
  legs, days, % days above break-even, both seasons. Lift = band p.m - base p.m. Every row persisted.
  Then STACKING: for each (cell, rank, cut) take every band with lift >= MIN_LIFT and >= MIN_LEGS in
  both seasons, and test pairs, then triples, of them (intersection of legs), persisting each.

Env: DATABASE_URL, CM_STAGE (features|matrix|both), CM_MIN_LIFT (0.02), CM_MIN_LEGS (60), CM_MAX_DEPTH (3).
"""
import os
import itertools
from collections import defaultdict

import psycopg

MIN_LIFT = float((os.environ.get('CM_MIN_LIFT') or '0.02'))
MIN_LEGS = int((os.environ.get('CM_MIN_LEGS') or '60'))
MAX_DEPTH = int((os.environ.get('CM_MAX_DEPTH') or '3'))
BE = 6.5 ** (-1 / 3)   # Underdog 3-pick Standard (§30j)

CANDIDATES = [   # the 14 Underdog cells certified from the raw board (§30k); steals R failed (0/21) and is excluded
    ('points', 'R'), ('pts_reb', 'R'), ('reb_ast', 'B1'), ('rebounds', 'F2'), ('rebounds', 'B1'), ('threes_made', 'R'),
    ('rebounds', 'R'), ('reb_ast', 'R'), ('pts_ast', 'R'), ('turnovers', 'R'), ('assists', 'R'), ('pra', 'R'),
    ('stocks', 'R'), ('blocks', 'R'),
]

FEATURES_SQL = """
DROP TABLE IF EXISTS nba_score.ud_cand_leg_features;
CREATE TABLE nba_score.ud_cand_leg_features AS
WITH cand AS (
  SELECT * FROM (VALUES %s) v(prop, tier)
),
base AS (
  SELECT l.season, l.game_date, l.player, l.player_id, l.prop, l.tier, l.side, l.line, l.factor, l.hit, l.cell_size,
    max(CASE WHEN l.rank_key='final_hp' THEN l.n_rank END) AS r_final,
    max(CASE WHEN l.rank_key='baseline_hp' THEN l.n_rank END) AS r_base,
    max(CASE WHEN l.rank_key='final_score' THEN l.n_rank END) AS r_score,
    max(CASE WHEN l.rank_key='final_hp' THEN l.score END) AS score
  FROM nba_score.ud_tier_map_legs l JOIN cand c ON c.prop=l.prop AND c.tier=l.tier
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11
),
trail AS (
  SELECT b.*,
    avg(hit) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) t3,
    avg(hit) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING) t5,
    avg(hit) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING) t10,
    stddev_samp(hit) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING) sd10,
    count(*) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING) n_trail,
    avg(hit) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) cold_all,
    count(*) OVER (PARTITION BY player, prop, tier, side ORDER BY game_date ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) app_all
  FROM base b
),
mins AS (
  SELECT nba_player_id::text pid, game_date,
    avg(min) OVER w3 - avg(min) OVER w10 AS min_trend,
    count(*) OVER w10 AS n_min,
    game_date - lag(game_date) OVER (PARTITION BY nba_player_id ORDER BY game_date) AS rest_days
  FROM nba_stats.player_game_log WHERE min IS NOT NULL
  WINDOW w3 AS (PARTITION BY nba_player_id ORDER BY game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING),
         w10 AS (PARTITION BY nba_player_id ORDER BY game_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING)
),
usg AS (
  SELECT g.nba_player_id::text pid, g.game_date,
    avg(a.usg_pct) OVER w3 - avg(a.usg_pct) OVER w10 AS usg_trend
  FROM nba_stats.player_game_log g
  JOIN nba_stats.player_game_log_advanced a ON a.player_id='nba_'||g.nba_player_id::text AND a.game_id=g.game_id
  WHERE a.usg_pct IS NOT NULL
  WINDOW w3 AS (PARTITION BY g.nba_player_id ORDER BY g.game_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING),
         w10 AS (PARTITION BY g.nba_player_id ORDER BY g.game_date ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING)
),
mkt AS (
  SELECT game_date, nba_ref.norm_name(player) nm, market, line, p_over_book, books
  FROM nba_market.rung_market WHERE snapshot_label='window' AND p_over_book IS NOT NULL
),
bounds AS (SELECT season, min(game_date) s0, max(game_date) s1 FROM base GROUP BY season)
SELECT t.season, t.game_date, t.player, t.prop, t.tier, t.side, t.line, t.factor, t.hit, t.cell_size,
  t.r_final, t.r_base, t.r_score, t.score,
  t.t3, t.t5, t.t10, t.sd10, t.n_trail, t.cold_all, t.app_all,
  m.min_trend, m.n_min, m.rest_days, u.usg_trend, pf.pf20,
  CASE WHEN t.game_date <= bo.s0 + 30 THEN 'early' WHEN t.game_date >= bo.s1 - 21 THEN 'late' ELSE 'mid' END phase,
  CASE WHEN t.line <= 0.5 THEN 'half'
       WHEN t.prop IN ('steals','stocks','turnovers','blocks') THEN (CASE WHEN t.line <= 1.5 THEN 'low' WHEN t.line <= 2.5 THEN 'mid' ELSE 'high' END)
       WHEN t.prop IN ('points','pra','pts_reb','pts_ast') THEN (CASE WHEN t.line < 12 THEN 'low' WHEN t.line < 22 THEN 'mid' ELSE 'high' END)
       ELSE (CASE WHEN t.line < 5 THEN 'low' WHEN t.line < 9 THEN 'mid' ELSE 'high' END) END line_class,
  CASE WHEN t.side='Over' THEN t.score - k.p_over_book ELSE t.score - (1 - k.p_over_book) END mkt_edge,
  k.books
FROM trail t
LEFT JOIN mins m ON m.pid=t.player_id AND m.game_date=t.game_date
LEFT JOIN usg u ON u.pid=t.player_id AND u.game_date=t.game_date
LEFT JOIN nba_score.player_pf20 pf ON pf.pid=t.player_id AND pf.game_date=t.game_date
LEFT JOIN mkt k ON k.game_date=t.game_date AND k.nm=t.player AND k.line=t.line   -- ud legs carry the normalized name
  AND k.market = CASE t.prop WHEN 'stocks' THEN 'player_blocks_steals' WHEN 'threes_made' THEN 'player_threes'
    WHEN 'pra' THEN 'player_points_rebounds_assists' WHEN 'pts_reb' THEN 'player_points_rebounds'
    WHEN 'pts_ast' THEN 'player_points_assists' WHEN 'reb_ast' THEN 'player_rebounds_assists' ELSE 'player_'||t.prop END
JOIN bounds bo ON bo.season=t.season
"""

# signal -> list of (band_label, predicate over the row dict); None-valued features fall in no band
def bands():
    B = {}
    B['side'] = [('Over', lambda r: r['side'] == 'Over'), ('Under', lambda r: r['side'] == 'Under')]
    for w in ('t3', 't5', 't10'):
        B[w] = [(f'{w}=1.0', lambda r, w=w: r[w] is not None and r['n_trail'] >= 3 and r[w] >= 0.999),
                (f'{w}>=0.67', lambda r, w=w: r[w] is not None and r['n_trail'] >= 3 and 0.67 <= r[w] < 0.999),
                (f'{w} 0.34-0.66', lambda r, w=w: r[w] is not None and r['n_trail'] >= 3 and 0.34 <= r[w] < 0.67),
                (f'{w}<=0.33', lambda r, w=w: r[w] is not None and r['n_trail'] >= 3 and r[w] < 0.34)]
    B['consistency'] = [('consistent sd<=0.42', lambda r: r['sd10'] is not None and r['n_trail'] >= 8 and r['sd10'] <= 0.42),
                        ('streaky sd>0.42', lambda r: r['sd10'] is not None and r['n_trail'] >= 8 and r['sd10'] > 0.42)]
    B['cold_all'] = [('cold <0.40', lambda r: r['cold_all'] is not None and r['app_all'] >= 10 and r['cold_all'] < 0.40),
                     ('mid 0.40-0.60', lambda r: r['cold_all'] is not None and r['app_all'] >= 10 and 0.40 <= r['cold_all'] < 0.60),
                     ('hot >=0.60', lambda r: r['cold_all'] is not None and r['app_all'] >= 10 and r['cold_all'] >= 0.60)]
    B['min_trend'] = [('min falling <=-4', lambda r: r['min_trend'] is not None and r['n_min'] >= 5 and r['min_trend'] <= -4),
                      ('min -4..-1.5', lambda r: r['min_trend'] is not None and r['n_min'] >= 5 and -4 < r['min_trend'] <= -1.5),
                      ('min stable', lambda r: r['min_trend'] is not None and r['n_min'] >= 5 and -1.5 < r['min_trend'] < 1.5),
                      ('min +1.5..+4', lambda r: r['min_trend'] is not None and r['n_min'] >= 5 and 1.5 <= r['min_trend'] < 4),
                      ('min rising >=+4', lambda r: r['min_trend'] is not None and r['n_min'] >= 5 and r['min_trend'] >= 4)]
    B['usg_trend'] = [('usg falling <=-3', lambda r: r['usg_trend'] is not None and r['usg_trend'] <= -3),
                      ('usg stable', lambda r: r['usg_trend'] is not None and -3 < r['usg_trend'] < 3),
                      ('usg rising >=+3', lambda r: r['usg_trend'] is not None and r['usg_trend'] >= 3)]
    B['rest'] = [('b2b', lambda r: r['rest_days'] == 1), ('1 day', lambda r: r['rest_days'] == 2),
                 ('2 days', lambda r: r['rest_days'] == 3), ('3+ days', lambda r: r['rest_days'] is not None and r['rest_days'] >= 4)]
    B['phase'] = [(p, lambda r, p=p: r['phase'] == p) for p in ('early', 'mid', 'late')]
    B['line_class'] = [(c, lambda r, c=c: r['line_class'] == c) for c in ('half', 'low', 'mid', 'high')]
    B['mkt_edge'] = [('edge<0', lambda r: r['mkt_edge'] is not None and r['mkt_edge'] < 0),
                     ('edge 0..0.05', lambda r: r['mkt_edge'] is not None and 0 <= r['mkt_edge'] < 0.05),
                     ('edge 0.05..0.15', lambda r: r['mkt_edge'] is not None and 0.05 <= r['mkt_edge'] < 0.15),
                     ('edge 0.15..0.25', lambda r: r['mkt_edge'] is not None and 0.15 <= r['mkt_edge'] < 0.25),
                     ('edge>=0.25', lambda r: r['mkt_edge'] is not None and r['mkt_edge'] >= 0.25),
                     ('no book line', lambda r: r['mkt_edge'] is None)]
    B['lowfoul'] = [('pf20<1.8', lambda r: r['pf20'] is not None and r['pf20'] < 1.8),
                    ('pf20 1.8-2.5', lambda r: r['pf20'] is not None and 1.8 <= r['pf20'] < 2.5),
                    ('pf20>=2.5', lambda r: r['pf20'] is not None and r['pf20'] >= 2.5)]
    B['books'] = [('books=1', lambda r: r['books'] == 1), ('books 2-3', lambda r: r['books'] in (2, 3)),
                  ('books>=4', lambda r: r['books'] is not None and r['books'] >= 4)]
    # the other two ranks as a second layer: is the leg ALSO top-N under the other rank
    for other, key in (('base', 'r_base'), ('score', 'r_score'), ('final', 'r_final')):
        B[f'rank_{other}'] = [(f'{other} top1', lambda r, k=key: r[k] is not None and r[k] <= 1),
                              (f'{other} top3', lambda r, k=key: r[k] is not None and r[k] <= 3),
                              (f'{other} top5', lambda r, k=key: r[k] is not None and r[k] <= 5),
                              (f'{other} top10', lambda r, k=key: r[k] is not None and r[k] <= 10),
                              (f'{other} beyond10', lambda r, k=key: r[k] is not None and r[k] > 10)]
    return B


RANKS = {'final_hp': 'r_final', 'baseline_hp': 'r_base', 'final_score': 'r_score'}
CUTS = [('n', 1), ('n', 2), ('n', 3), ('n', 5), ('n', 8), ('n', 10), ('pct', 5), ('pct', 10), ('pct', 20), ('pct', 33), ('pct', 50)]


def in_cut(r, rk, ct, cut):
    pos = r[rk]
    if pos is None:
        return False
    if ct == 'n':
        return pos <= cut
    k = max(1, -(-r['cell_size'] * cut // 100))
    return pos <= k


def stats(rows):
    """rows: list of dict. returns per-season (legs, days, pm, hit, pct_days_above_be)"""
    out = {}
    by = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by[r['season']][r['game_date']].append(r)
    for s, days in by.items():
        legs = sum(len(v) for v in days.values())
        pm_days = [sum(x['hit'] * x['factor'] for x in v) / len(v) for v in days.values()]
        hit = sum(x['hit'] for v in days.values() for x in v) / legs
        pm = sum(pm_days) / len(pm_days)
        above = sum(1 for p in pm_days if p > BE) / len(pm_days)
        out[s] = (legs, len(days), pm, hit, above)
    return out


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    stage = (os.environ.get('CM_STAGE') or 'both')
    if stage in ('features', 'both'):
        vals = ",".join(f"('{p}','{t}')" for p, t in CANDIDATES)
        conn.execute(FEATURES_SQL % vals)
        conn.commit()
        n = conn.execute("SELECT count(*) FROM nba_score.ud_cand_leg_features").fetchone()[0]
        print(f"  features: {n:,} candidate legs", flush=True)
    if stage not in ('matrix', 'both'):
        return

    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.ud_cand_signal_matrix (
        prop text, tier text, side text, rank_key text, cut_type text, cut int, depth int, signal text, band text,
        legs_s1 int, days_s1 int, pm_s1 double precision, hit_s1 double precision, above_s1 double precision,
        legs_s2 int, days_s2 int, pm_s2 double precision, hit_s2 double precision, above_s2 double precision,
        base_pm_s1 double precision, base_pm_s2 double precision, lift_s1 double precision, lift_s2 double precision,
        built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.ud_cand_signal_matrix")
    conn.commit()

    cols = [d.name for d in conn.execute("SELECT * FROM nba_score.ud_cand_leg_features LIMIT 0").description]
    rows = [dict(zip(cols, r)) for r in conn.execute("SELECT * FROM nba_score.ud_cand_leg_features").fetchall()]
    print(f"  matrix: {len(rows):,} legs loaded", flush=True)
    B = bands()
    seasons = sorted({r['season'] for r in rows})
    s1, s2 = seasons[0], seasons[-1]
    out = []

    def rec(prop, tier, side, rk, ct, cut, depth, signal, band, sub, base):
        st = stats(sub)
        a, b = st.get(s1), st.get(s2)
        if not a or not b:
            return None
        row = (prop, tier, side, rk, ct, cut, depth, signal, band,
               a[0], a[1], a[2], a[3], a[4], b[0], b[1], b[2], b[3], b[4],
               base[0], base[1], a[2] - base[0], b[2] - base[1])
        out.append(row)
        return row

    cells = sorted({(r['prop'], r['tier']) for r in rows})
    for prop, tier in cells:
        cell_rows = [r for r in rows if r['prop'] == prop and r['tier'] == tier]
        for side in ('both', 'Over', 'Under'):
            side_rows = cell_rows if side == 'both' else [r for r in cell_rows if r['side'] == side]
            for rk, rkcol in RANKS.items():
                for ct, cut in CUTS:
                    inside = [r for r in side_rows if in_cut(r, rkcol, ct, cut)]
                    if len(inside) < MIN_LEGS:
                        continue
                    bst = stats(inside)
                    if s1 not in bst or s2 not in bst:
                        continue
                    base = (bst[s1][2], bst[s2][2])
                    rec(prop, tier, side, rk, ct, cut, 0, 'BASE', 'all', inside, base)
                    # depth 1: every signal band, separately
                    good = []
                    for sig, blist in B.items():
                        if sig == 'side' and side != 'both':
                            continue
                        for label, pred in blist:
                            sub = [r for r in inside if pred(r)]
                            if len(sub) < MIN_LEGS:
                                continue
                            row = rec(prop, tier, side, rk, ct, cut, 1, sig, label, sub, base)
                            if row and row[-2] >= MIN_LIFT and row[-1] >= MIN_LIFT and row[9] >= MIN_LEGS and row[14] >= MIN_LEGS:
                                good.append((sig, label, pred))
                    # depth 2..MAX: stacks of the bands that lifted in BOTH seasons (different signals only)
                    for d in range(2, MAX_DEPTH + 1):
                        for combo in itertools.combinations(good, d):
                            if len({c[0] for c in combo}) < d:
                                continue
                            sub = [r for r in inside if all(c[2](r) for c in combo)]
                            if len(sub) < MIN_LEGS:
                                continue
                            rec(prop, tier, side, rk, ct, cut, d, ' + '.join(c[0] for c in combo), ' + '.join(c[1] for c in combo), sub, base)
        print(f"  {prop} {tier}: {len(out):,} rows so far", flush=True)

    with conn.cursor() as c:
        c.executemany("""INSERT INTO nba_score.ud_cand_signal_matrix
            (prop, tier, side, rank_key, cut_type, cut, depth, signal, band,
             legs_s1, days_s1, pm_s1, hit_s1, above_s1, legs_s2, days_s2, pm_s2, hit_s2, above_s2,
             base_pm_s1, base_pm_s2, lift_s1, lift_s2)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", out)
    conn.commit()
    print(f"  matrix: {len(out):,} rows persisted to nba_score.ud_cand_signal_matrix", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
