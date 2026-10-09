#!/usr/bin/env python3
"""
POSTSEASON STRATEGY PROGRAM - the regular season's whole method, applied to the play-in / playoffs, then stress-tested on the
regular season (strategy §31y; owner 2026-10-09: "sharpen it, different compositions, signals, layers, all we did for the main
season ... and do a stress test of the same strategies for the main season").

The regular season was built in this order (strategy §19-§28, §30): tier map -> granular top-n / top-% bands per cell and rank
(§19j-l) -> candidate cells on BOTH seasons (§19o, §24) -> candidate x signal matrix with the noise calibrated (§22) -> slip
engine: compositions x sizes x Power/Flex x caps, app rules, correlation (§25) -> walk-forward + day-blocked bootstrap +
empirical null + teammate ban (§28) -> gates, drawdowns, envelopes (§27, §30w). This script runs the same stages on the two
postseasons (2024-25, 2025-26: 50 + 47 slate nights), for PrizePicks AND Underdog, and then runs every postseason strategy it
selects on both REGULAR seasons (the stress test). Nothing certified is touched: every output is a new nba_score.psr_* table.

Sources (all already certified / built, §31w):
  PrizePicks postseason  nba_score.tier_map_legs_post        (window legs, current per-line price, board_outcomes grade,
                                                              postseason final_hp ranks, team / game / pf20)
  Underdog postseason    nba_score.ud_tier_map_legs_post     (+ ud_window_legs_post for the game; one pick per game)
  PrizePicks regular     nba_score.tier_map_legs_sel_mf      (the market-free twin = what live scores; prop_universe game/team)
  Underdog regular       nba_score.ud_tier_map_legs_curr     (balanced prices, §30s; ud_window_legs game)
  pre-game signals       player_game_log (+ _postseason): regular-season form (last 20), playoff-to-date form, in-series form,
                         round / game number, home, rest, low-foul pf20, model margin, role (minutes)
Grading: PrizePicks = build_slip_engine.grade (the certified payout, compression, void reversion); Underdog = the certified
Underdog formula (build_ud_slip_engine: base(n) x prod(m), Flex tiers), discount 0.5% on 1.00x legs / 1% on priced legs (§30t).

Stages (PSR_STAGE, comma list, default all): load, bands, cells, signals, engine, validate, stress.
Env: DATABASE_URL, PSR_STAGE, PSR_APPS (pp,ud), PSR_MIN_DAYS (20), PSR_NULL (20), PSR_ENGINE_NULL (10), PSR_TOPK (20),
     PSR_BOOT (5000), PSR_SEED (7).
"""
import datetime as dt
import itertools
import json
import math
import os
import random
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE      # noqa: E402  PrizePicks: grade(), compress(), load_corr(), pair_corrs(), phase_of()

STAGES = {s.strip() for s in (os.environ.get('PSR_STAGE') or 'load,bands,cells,signals,engine,validate,stress').split(',') if s.strip()}
APPS = [a.strip() for a in (os.environ.get('PSR_APPS') or 'pp,ud').split(',') if a.strip()]
MIN_DAYS = int(os.environ.get('PSR_MIN_DAYS') or '20')
NULLS = int(os.environ.get('PSR_NULL') or '20')
ENGINE_NULLS = int(os.environ.get('PSR_ENGINE_NULL') or '10')
TOPK = int(os.environ.get('PSR_TOPK') or '20')
BOOT = int(os.environ.get('PSR_BOOT') or '5000')
SEED = int(os.environ.get('PSR_SEED') or '7')
S1, S2 = '2024-25', '2025-26'
BE = {'pp': 0.55, 'ud': 0.536}            # per-leg break-even: PP 3-pick Power (§19i), UD 3-pick Standard 6.5^(-1/3) (§30j)
MAIN = ['points', 'rebounds', 'assists', 'threes_made', 'pts_reb', 'pts_ast', 'reb_ast', 'pra', 'steals', 'blocks', 'stocks', 'turnovers']
POOLS = {'ALL': ['points', 'rebounds', 'assists', 'threes_made', 'pts_reb', 'pts_ast', 'reb_ast', 'pra'],
         'PTSFAM': ['points', 'pra', 'pts_ast', 'pts_reb'], 'BOARD': ['rebounds', 'assists', 'reb_ast', 'threes_made'],
         'DEF': ['steals', 'blocks', 'stocks', 'turnovers']}
RANKS = ['s_final', 's_base', 's_score']
N_CUTS = list(range(1, 11))
PCT_CUTS = [10, 20, 33, 50]
UD_STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0}
UD_FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 6.0, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5, (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25}
random.seed(SEED)


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------------------------------------------------------ LOAD
PP_POST_SQL = """
SELECT 'pp' app, season, game_date, player, player_id, prop, tier, side, line, kind, max(factor) factor, max(hit) hit,
       max(team_id) team_id, max(event_id) event_id, max(game_id) game_id, max(pf20) pf20,
       max(score) FILTER (WHERE rank_key='final_hp') s_final, max(score) FILTER (WHERE rank_key='baseline_hp') s_base,
       max(score) FILTER (WHERE rank_key='final_score') s_score
FROM nba_score.tier_map_legs_post WHERE prop = ANY(%s)
GROUP BY season, game_date, player, player_id, prop, tier, side, line, kind"""

UD_POST_SQL = """
SELECT 'ud' app, l.season, l.game_date, l.player, l.player_id, l.prop, l.tier, l.side, l.line, l.kind, max(l.factor) factor, max(l.hit) hit,
       max(g.team_id) team_id, max(w.event_id) event_id, max(g.game_id) game_id, NULL::float pf20,
       max(l.score) FILTER (WHERE l.rank_key='final_hp') s_final, max(l.score) FILTER (WHERE l.rank_key='baseline_hp') s_base,
       max(l.score) FILTER (WHERE l.rank_key='final_score') s_score
FROM nba_score.ud_tier_map_legs_post l
LEFT JOIN (SELECT game_date, pn, prop, side, line, min(event_id) event_id FROM nba_score.ud_window_legs_post GROUP BY 1,2,3,4,5) w
  ON w.game_date=l.game_date AND w.pn=l.player AND w.prop=l.prop AND w.side=l.side AND w.line=l.line
LEFT JOIN nba_stats.player_game_log_postseason g ON g.player_id='nba_'||l.player_id AND g.game_date=l.game_date
WHERE l.prop = ANY(%s)
GROUP BY l.season, l.game_date, l.player, l.player_id, l.prop, l.tier, l.side, l.line, l.kind"""

PP_REG_SQL = """
SELECT 'pp' app, l.season, l.game_date, l.player, max(pu.player_id) player_id, l.prop, l.tier, l.side, l.line, l.kind,
       max(l.factor) factor, max(l.hit) hit, max(pu.team_id) team_id, max(pu.event_id) event_id, NULL::text game_id, max(pf.pf20) pf20,
       max(l.score) FILTER (WHERE l.rank_key='final_hp') s_final, max(l.score) FILTER (WHERE l.rank_key='baseline_hp') s_base,
       max(l.score) FILTER (WHERE l.rank_key='final_score') s_score
FROM nba_score.tier_map_legs_sel_mf l
JOIN nba_market.prop_universe pu ON pu.game_date=l.game_date AND pu.player=l.player AND pu.prop=l.prop AND pu.side=l.side
  AND pu.line=l.line AND pu.line_source='real'
LEFT JOIN nba_score.player_pf20 pf ON pf.pid=pu.player_id AND pf.game_date=l.game_date
WHERE l.prop = ANY(%s) AND (l.prop, l.tier) IN (SELECT * FROM unnest(%s::text[], %s::text[]))
GROUP BY l.season, l.game_date, l.player, l.prop, l.tier, l.side, l.line, l.kind"""

UD_REG_SQL = """
SELECT 'ud' app, l.season, l.game_date, l.player, l.player_id, l.prop, l.tier, l.side, l.line, l.kind, max(l.factor) factor, max(l.hit) hit,
       NULL::text team_id, max(w.event_id) event_id, NULL::text game_id, NULL::float pf20,
       max(l.score) FILTER (WHERE l.rank_key='final_hp') s_final, max(l.score) FILTER (WHERE l.rank_key='baseline_hp') s_base,
       max(l.score) FILTER (WHERE l.rank_key='final_score') s_score
FROM nba_score.ud_tier_map_legs_curr l
JOIN (SELECT game_date, pn, prop, side, line, min(event_id) event_id FROM nba_score.ud_window_legs GROUP BY 1,2,3,4,5) w
  ON w.game_date=l.game_date AND w.pn=l.player AND w.prop=l.prop AND w.side=l.side AND w.line=l.line
WHERE l.prop = ANY(%s) AND (l.prop, l.tier) IN (SELECT * FROM unnest(%s::text[], %s::text[]))
GROUP BY l.season, l.game_date, l.player, l.player_id, l.prop, l.tier, l.side, l.line, l.kind"""

COLS = ['app', 'season', 'game_date', 'player', 'player_id', 'prop', 'tier', 'side', 'line', 'kind', 'factor', 'hit',
        'team_id', 'event_id', 'game_id', 'pf20', 's_final', 's_base', 's_score']

# pre-game signals, keyed (player_id, game_date, prop). Postseason: regular-season form (last 20 of that season), playoff-to-date
# form, the in-series stat list, round / game number, home, rest. Regular (stress): the same regular form, the last-5 minutes as
# the analogue of the playoff-to-date minutes, home, rest (series / round do not exist).
FEAT_POST_SQL = """
SELECT k.player_id, k.game_date, k.prop, g.game_id, (g.matchup LIKE '%%vs.%%') home,
  r.reg_min, r.reg_stat, p.post_min, p.post_stat, p.post_n, s.ser_stats,
  (k.game_date - pv.prev_date) rest
FROM (SELECT DISTINCT player_id, game_date, prop, season FROM _keys) k
JOIN nba_stats.player_game_log_postseason g ON g.player_id='nba_'||k.player_id AND g.game_date=k.game_date
LEFT JOIN LATERAL (SELECT avg(x.min) reg_min, avg(nba_control.prop_stat(k.prop,x.pts,x.reb,x.ast,x.fg3m,x.stl,x.blk,x.tov)) reg_stat
  FROM (SELECT * FROM nba_stats.player_game_log l WHERE l.player_id='nba_'||k.player_id AND l.game_id LIKE '002%%' AND l.season=k.season
        AND l.game_date < k.game_date AND l.min > 0 ORDER BY l.game_date DESC LIMIT 20) x) r ON true
LEFT JOIN LATERAL (SELECT avg(x.min) post_min, avg(nba_control.prop_stat(k.prop,x.pts,x.reb,x.ast,x.fg3m,x.stl,x.blk,x.tov)) post_stat, count(*) post_n
  FROM nba_stats.player_game_log_postseason x WHERE x.player_id='nba_'||k.player_id AND x.season=k.season AND x.game_date < k.game_date AND x.min > 0) p ON true
LEFT JOIN LATERAL (SELECT array_agg(nba_control.prop_stat(k.prop,x.pts,x.reb,x.ast,x.fg3m,x.stl,x.blk,x.tov) ORDER BY x.game_date) ser_stats
  FROM nba_stats.player_game_log_postseason x WHERE x.player_id='nba_'||k.player_id AND substr(x.game_id,1,9)=substr(g.game_id,1,9)
   AND x.game_date < k.game_date AND x.min > 0 AND g.game_id LIKE '004%%') s ON true
LEFT JOIN LATERAL (SELECT max(d) prev_date FROM (
   SELECT max(game_date) d FROM nba_stats.player_game_log WHERE player_id='nba_'||k.player_id AND game_date < k.game_date
   UNION ALL SELECT max(game_date) FROM nba_stats.player_game_log_postseason WHERE player_id='nba_'||k.player_id AND game_date < k.game_date) u) pv ON true"""

FEAT_REG_SQL = """
SELECT k.player_id, k.game_date, k.prop, NULL::text game_id, (g.matchup LIKE '%%vs.%%') home,
  r.reg_min, r.reg_stat, r5.min5 post_min, NULL::numeric post_stat, 0 post_n, NULL::numeric[] ser_stats,
  (k.game_date - pv.prev_date) rest
FROM (SELECT DISTINCT player_id, game_date, prop, season FROM _keys) k
JOIN nba_stats.player_game_log g ON g.player_id='nba_'||k.player_id AND g.game_date=k.game_date AND g.game_id LIKE '002%%'
LEFT JOIN LATERAL (SELECT avg(x.min) reg_min, avg(nba_control.prop_stat(k.prop,x.pts,x.reb,x.ast,x.fg3m,x.stl,x.blk,x.tov)) reg_stat
  FROM (SELECT * FROM nba_stats.player_game_log l WHERE l.player_id='nba_'||k.player_id AND l.game_id LIKE '002%%' AND l.season=k.season
        AND l.game_date < k.game_date AND l.min > 0 ORDER BY l.game_date DESC LIMIT 20) x) r ON true
LEFT JOIN LATERAL (SELECT avg(x.min) min5 FROM (SELECT min FROM nba_stats.player_game_log l WHERE l.player_id='nba_'||k.player_id
        AND l.game_id LIKE '002%%' AND l.season=k.season AND l.game_date < k.game_date AND l.min > 0 ORDER BY l.game_date DESC LIMIT 5) x) r5 ON true
LEFT JOIN LATERAL (SELECT max(game_date) prev_date FROM nba_stats.player_game_log WHERE player_id='nba_'||k.player_id AND game_date < k.game_date) pv ON true"""


def fetch_legs(conn, sql, params):
    out = []
    with conn.cursor(name=f'c{random.randint(0, 10**9)}') as cur:
        cur.itersize = 50000
        cur.execute(sql, params)
        for row in cur:
            r = dict(zip(COLS, row))
            r['line'] = float(r['line'])
            r['factor'] = float(r['factor']) if r['factor'] is not None else None
            for k in RANKS:
                r[k] = float(r[k]) if r[k] is not None else None
            r['pf20'] = float(r['pf20']) if r['pf20'] is not None else None
            if r['app'] == 'ud' and r['factor'] is not None:   # §30t confidence discount: 0.5% on 1.00x legs, 1% on priced legs
                r['factor'] *= 0.995 if abs(r['factor'] - 1.0) < 1e-9 else 0.99
            out.append(r)
    return out


def attach_features(conn, legs, sql):
    keys = {(l['player_id'], l['game_date'], l['prop'], l['season']) for l in legs if l['player_id']}
    conn.execute("DROP TABLE IF EXISTS _keys")
    conn.execute("CREATE TEMP TABLE _keys (player_id text, game_date date, prop text, season text)")
    with conn.cursor() as cur:
        with cur.copy("COPY _keys (player_id, game_date, prop, season) FROM STDIN") as cp:
            for k in keys:
                cp.write_row(k)
    conn.execute("CREATE INDEX ON _keys (player_id, game_date)")
    feats = {}
    for row in conn.execute(sql).fetchall():
        pid, gd, prop, gid, home, reg_min, reg_stat, post_min, post_stat, post_n, ser, rest = row
        feats[(pid, gd, prop)] = dict(game_id=gid, home=home, reg_min=float(reg_min) if reg_min is not None else None,
                                      reg_stat=float(reg_stat) if reg_stat is not None else None,
                                      post_min=float(post_min) if post_min is not None else None,
                                      post_stat=float(post_stat) if post_stat is not None else None, post_n=int(post_n or 0),
                                      ser=[float(x) for x in ser] if ser else [], rest=int(rest) if rest is not None else None)
    for l in legs:
        f = feats.get((l['player_id'], l['game_date'], l['prop']), {})
        for k in ('home', 'reg_min', 'reg_stat', 'post_min', 'post_stat', 'post_n', 'ser', 'rest'):
            l[k] = f.get(k)
        if l.get('game_id') is None:
            l['game_id'] = f.get('game_id')
        gid = l.get('game_id') or ''
        l['rnd'] = (0 if gid.startswith('005') else int(gid[7])) if len(gid) == 10 else None
        l['game_no'] = int(gid[9]) if len(gid) == 10 and gid.startswith('004') else None
        if l['app'] == 'ud' and l['team_id'] is None:
            l['team_id'] = l['event_id']        # Underdog rule is one pick per game, so a game key is the binding constraint
    log(f"  features attached: {len(feats):,} player-games, {sum(1 for l in legs if l.get('reg_min') is not None):,} of {len(legs):,} legs with regular form")


# --------------------------------------------------------------------------------------------------------------- SIGNALS
def band(sig, l, s):
    """the leg's band for one signal (None = not defined for this leg). s = the cell's ranking score."""
    if sig == 'model':
        return None if s is None else ('a<.55' if s < .55 else 'b.55-.60' if s < .60 else 'c.60-.65' if s < .65 else 'd>=.65')
    if sig == 'min_trend':
        if l.get('post_min') is None or l.get('reg_min') is None or (l['app_src'] == 'post' and not l.get('post_n')):
            return None
        d = l['post_min'] - l['reg_min']
        return 'a<-3' if d < -3 else 'b-3..0' if d < 0 else 'c0..3' if d < 3 else 'd>=3'
    if sig == 'line_vs_reg':
        if l.get('reg_stat') is None:
            return None
        d = l['line'] - l['reg_stat']
        return 'a<-2' if d < -2 else 'b-2..0' if d < 0 else 'c0..2' if d < 2 else 'd>=2'
    if sig == 'line_vs_post':
        if not l.get('post_n') or l.get('post_stat') is None:
            return None
        d = l['line'] - l['post_stat']
        return 'a<-2' if d < -2 else 'b-2..0' if d < 0 else 'c0..2' if d < 2 else 'd>=2'
    if sig == 'series_form':
        ser = l.get('ser') or []
        if not ser:
            return None
        over = sum(1 for x in ser if x > l['line']) / len(ser)
        return 'a<=.33' if over <= .33 else 'b.34-.66' if over < .67 else 'c>=.67'
    if sig == 'round':
        r = l.get('rnd')
        return None if r is None else ('a_playin' if r == 0 else 'b_r1' if r == 1 else 'c_r2' if r == 2 else 'd_cf_finals')
    if sig == 'game_no':
        g = l.get('game_no')
        return None if g is None else ('a1-2' if g <= 2 else 'b3-4' if g <= 4 else 'c5-7')
    if sig == 'home':
        return None if l.get('home') is None else ('home' if l['home'] else 'away')
    if sig == 'rest':
        r = l.get('rest')
        return None if r is None else ('a1' if r <= 1 else 'b2' if r == 2 else 'c3+')
    if sig == 'lowfoul':
        return None if l.get('pf20') is None else ('low<1.8' if l['pf20'] < 1.8 else 'high')
    if sig == 'role':
        m = l.get('reg_min')
        return None if m is None else ('a<26' if m < 26 else 'b26-32' if m < 32 else 'c>=32')
    return None


SIGNALS = ['model', 'min_trend', 'line_vs_reg', 'line_vs_post', 'series_form', 'round', 'game_no', 'home', 'rest', 'lowfoul', 'role']
REG_SIGNALS = {'model', 'min_trend', 'line_vs_reg', 'home', 'rest', 'lowfoul', 'role'}   # defined in the regular season too


# ------------------------------------------------------------------------------------------------------------ CELL LOGIC
def cell_key_iter():
    for p in MAIN:
        yield (p, 'R', 'both'); yield (p, 'R', 'Over'); yield (p, 'R', 'Under')
    for pool in POOLS:
        yield (pool, 'R', 'Over'); yield (pool, 'R', 'Under')


def tiers_of(app):
    return ['R', 'D1', 'D2', 'D3', 'G1', 'G2', 'G3'] if app == 'pp' else ['R', 'F1', 'F2', 'F3', 'B1', 'B2', 'B3']


def all_cell_keys(app):
    keys = list(cell_key_iter())
    for p in MAIN:
        for t in tiers_of(app):
            if t != 'R':
                keys.append((p, t, 'Over'))
                if app == 'ud':
                    keys.append((p, t, 'Under'))   # Underdog's priced tiers carry both sides
    return keys


class DayLegs(list):
    """one night's legs, indexed by (prop, tier, side) so a cell's pool is a dictionary lookup, not a scan"""
    def __init__(self, *a):
        super().__init__(*a)
        self.idx = defaultdict(list)

    def add(self, l):
        self.append(l)
        self.idx[(l['prop'], l['tier'], l['side'])].append(l)


def by_day(legs):
    d = defaultdict(DayLegs)
    for l in legs:
        d[l['game_date']].add(l)
    return d


def cell_pool(day_legs, prop, tier, side):
    out = []
    for p in POOLS.get(prop, [prop]):
        for sd in (('Over', 'Under') if side == 'both' else (side,)):
            out.extend(day_legs.idx.get((p, tier, sd), ()))
    return out


def ranked(pool, rank, prop):
    xs = [l for l in pool if l[rank] is not None]
    xs.sort(key=lambda l: (-l[rank], l['player'], l['prop'], l['side'], l['line']))
    if prop in POOLS:   # a pooled cell: one leg per player (the best), as a slip may hold a player once
        seen, out = set(), []
        for l in xs:
            if l['player'] not in seen:
                seen.add(l['player']); out.append(l)
        return out
    return xs


def pm_of(legs):
    g = [l for l in legs if l['hit'] is not None and l['factor'] is not None]
    if not g:
        return None, None, 0
    return sum(l['hit'] * l['factor'] for l in g) / len(g), sum(l['hit'] for l in g) / len(g), len(g)


# ------------------------------------------------------------------------------------------------------------- STAGES
def stage_bands(conn, legs_post):
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_bands (app text, rank text, prop text, tier text, side text, cut_type text,
        cut int, season text, days int, legs int, hit double precision, pm double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_bands")
    rows = []
    for app in APPS:
        days = by_day([l for l in legs_post if l['app'] == app])
        for (prop, tier, side) in all_cell_keys(app):
            for rank in RANKS:
                acc = defaultdict(lambda: [0, 0, 0.0, 0.0])   # (cut_type, cut, season) -> days, legs, hit_sum(day-avg), pm_sum(day-avg)
                for d, dl in days.items():
                    r = ranked(cell_pool(dl, prop, tier, side), rank, prop)
                    if not r:
                        continue
                    season = r[0]['season']
                    for n in N_CUTS:
                        if len(r) < n:
                            break
                        pm, hit, g = pm_of(r[:n])
                        if pm is None:
                            continue
                        a = acc[('n', n, season)]; a[0] += 1; a[1] += g; a[2] += hit; a[3] += pm
                    for pc in PCT_CUTS:
                        k = max(1, math.ceil(len(r) * pc / 100))
                        pm, hit, g = pm_of(r[:k])
                        if pm is None:
                            continue
                        a = acc[('pct', pc, season)]; a[0] += 1; a[1] += g; a[2] += hit; a[3] += pm
                for (ct, cut, season), (nd, ng, hs, ps) in acc.items():
                    rows.append((app, rank, prop, tier, side, ct, cut, season, nd, ng, hs / nd, ps / nd))
    with conn.cursor() as c:
        c.executemany("INSERT INTO nba_score.psr_bands (app, rank, prop, tier, side, cut_type, cut, season, days, legs, hit, pm) "
                      "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()
    log(f"bands: {len(rows):,} rows (app x rank x cell x cut x season)")


def select_cells(legs_post, app, permute=False, train=None):
    """§19o/§24 rule, translated: per (cell, rank) the n maximizing the WEAKER postseason p.m (days >= MIN_DAYS in each);
    ABOVE if the weaker p.m >= break-even, NEAR within 0.02. permute=True shuffles hits within (day, prop, tier, side) first.
    train=<season>: discovery on THAT season only (the walk-forward's honest V1 - the scored season never chooses a cell)."""
    legs = [l for l in legs_post if l['app'] == app and (train is None or l['season'] == train)]
    if permute:
        grp = defaultdict(list)
        for l in legs:
            grp[(l['game_date'], l['prop'], l['tier'], l['side'])].append(l)
        legs = []
        for g in grp.values():
            hits = [l['hit'] for l in g]
            random.shuffle(hits)
            legs.extend(dict(l, hit=h) for l, h in zip(g, hits))
    days = by_day(legs)
    out = []
    for (prop, tier, side) in all_cell_keys(app):
        best = None
        for rank in RANKS:
            acc = defaultdict(lambda: defaultdict(list))   # n -> season -> [day pm]
            hits = defaultdict(lambda: defaultdict(list))
            for d, dl in days.items():
                r = ranked(cell_pool(dl, prop, tier, side), rank, prop)
                if not r:
                    continue
                season = r[0]['season']
                for n in N_CUTS:
                    if len(r) < n:
                        break
                    pm, hit, g = pm_of(r[:n])
                    if pm is not None:
                        acc[n][season].append(pm); hits[n][season].append(hit)
            for n in N_CUTS:
                a = acc.get(n, {})
                if train is not None:
                    if len(a.get(train, [])) < MIN_DAYS:
                        continue
                    pt = sum(a[train]) / len(a[train]); ht = sum(hits[n][train]) / len(hits[n][train])
                    cand = (pt, n, rank, pt, pt, len(a[train]), len(a[train]), ht, ht)
                    weak = pt
                    if best is None or (weak > best[0] + 1e-12) or (abs(weak - best[0]) <= 1e-12 and n > best[1]):
                        best = cand
                    continue
                if len(a.get(S1, [])) < MIN_DAYS or len(a.get(S2, [])) < MIN_DAYS:
                    continue
                p1, p2 = sum(a[S1]) / len(a[S1]), sum(a[S2]) / len(a[S2])
                weak = min(p1, p2)
                cand = (weak, n, rank, p1, p2, len(a[S1]), len(a[S2]),
                        sum(hits[n][S1]) / len(hits[n][S1]), sum(hits[n][S2]) / len(hits[n][S2]))
                if best is None or (weak > best[0] + 1e-12) or (abs(weak - best[0]) <= 1e-12 and n > best[1]):
                    best = cand
        if best is None:
            continue
        weak, n, rank, p1, p2, d1, d2, h1, h2 = best
        status = 'ABOVE' if weak >= BE[app] else ('NEAR' if weak >= BE[app] - 0.02 else 'below')
        side_tag = {'both': '', 'Over': '_O', 'Under': '_U'}[side]
        name = f"{prop}_{tier}{side_tag}"
        out.append(dict(app=app, cell=name, prop=prop, tier=tier, side=side, rank=rank, n=n, pm1=p1, pm2=p2, days1=d1, days2=d2,
                        hit1=h1, hit2=h2, weak=weak, status=status))
    return out


def stage_cells(conn, legs_post):
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_cells (app text, cell text, prop text, tier text, side text, rank text, n int,
        pm1 double precision, pm2 double precision, days1 int, days2 int, hit1 double precision, hit2 double precision,
        weak double precision, status text, built_at timestamptz DEFAULT now())""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_cell_null (app text, real_above int, null_mean double precision,
        null_p95 int, null_max int, nulls int, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_cells"); conn.execute("DELETE FROM nba_score.psr_cell_null")
    allcells = []
    for app in APPS:
        cells = select_cells(legs_post, app)
        allcells += cells
        real = sum(1 for c in cells if c['status'] == 'ABOVE')
        nulls = sorted(sum(1 for c in select_cells(legs_post, app, permute=True) if c['status'] == 'ABOVE') for _ in range(NULLS))
        p95 = nulls[min(len(nulls) - 1, int(0.95 * len(nulls)))] if nulls else 0
        conn.execute("INSERT INTO nba_score.psr_cell_null (app, real_above, null_mean, null_p95, null_max, nulls) VALUES (%s,%s,%s,%s,%s,%s)",
                     (app, real, sum(nulls) / max(len(nulls), 1), p95, max(nulls) if nulls else 0, len(nulls)))
        log(f"\n== {app.upper()} CELLS (weaker-postseason p.m, both postseasons >= {MIN_DAYS} days; BE {BE[app]}) ==")
        log(f"   ABOVE: {real} real vs permutation null mean {sum(nulls)/max(len(nulls),1):.1f} (95th {p95}, max {max(nulls) if nulls else 0}, {len(nulls)} nulls)")
        for c in sorted(cells, key=lambda c: -c['weak'])[:40]:
            log(f"   {c['status']:<6}{c['cell']:<22}{c['rank']:<9}n={c['n']:<3} p.m {c['pm1']:.3f} / {c['pm2']:.3f}  hit {c['hit1']:.3f} / {c['hit2']:.3f}  days {c['days1']}/{c['days2']}")
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.psr_cells (app, cell, prop, tier, side, rank, n, pm1, pm2, days1, days2, hit1, hit2, weak, status)
                           VALUES (%(app)s,%(cell)s,%(prop)s,%(tier)s,%(side)s,%(rank)s,%(n)s,%(pm1)s,%(pm2)s,%(days1)s,%(days2)s,%(hit1)s,%(hit2)s,%(weak)s,%(status)s)""",
                        allcells)
    conn.commit()
    return allcells


def cell_legs(legs_by_day, c):
    """the legs inside a cell's band (top n under its rank), per day"""
    out = {}
    for d, dl in legs_by_day.items():
        r = ranked(cell_pool(dl, c['prop'], c['tier'], c['side']), c['rank'], c['prop'])[:c['n']]
        if r:
            out[d] = r
    return out


def signal_table(c, legs_in, permute=False):
    """per signal band: legs and p.m per season inside the cell's band; lift = band p.m - cell p.m (both seasons)."""
    flat = [l for ls in legs_in.values() for l in ls if l['hit'] is not None]
    base = {s: pm_of([l for l in flat if l['season'] == s])[0] for s in (S1, S2)}
    res = []
    for sig in SIGNALS:
        labs = [band(sig, l, l[c['rank']]) for l in flat]
        if permute:
            for s in (S1, S2):
                idx = [i for i, l in enumerate(flat) if l['season'] == s]
                vals = [labs[i] for i in idx]
                random.shuffle(vals)
                for i, v in zip(idx, vals):
                    labs[i] = v
        grp = defaultdict(lambda: defaultdict(list))
        for l, b in zip(flat, labs):
            if b is not None:
                grp[b][l['season']].append(l)
        for b, ss in grp.items():
            r = dict(sig=sig, band=b)
            for s, tag in ((S1, '1'), (S2, '2')):
                pm, hit, g = pm_of(ss.get(s, []))
                r['pm' + tag], r['legs' + tag] = pm, g
                r['lift' + tag] = (pm - base[s]) if (pm is not None and base[s] is not None) else None
            res.append(r)
    return res, base


def survives(r, app, min_legs=25):
    return (r['legs1'] >= min_legs and r['legs2'] >= min_legs and r['lift1'] is not None and r['lift2'] is not None
            and r['lift1'] >= 0.02 and r['lift2'] >= 0.02 and r['pm1'] >= BE[app] and r['pm2'] >= BE[app])


def stage_signals(conn, legs_post, cells):
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_signals (app text, cell text, sig text, band text, legs1 int, legs2 int,
        pm1 double precision, pm2 double precision, lift1 double precision, lift2 double precision, survive boolean, depth int,
        built_at timestamptz DEFAULT now())""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_signal_null (app text, real_survivors int, null_mean double precision,
        null_p95 int, nulls int, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_signals"); conn.execute("DELETE FROM nba_score.psr_signal_null")
    gated = []
    for app in APPS:
        lbd = by_day([l for l in legs_post if l['app'] == app])
        work = [c for c in cells if c['app'] == app and c['status'] in ('ABOVE', 'NEAR')]
        rows, real = [], 0
        null_counts = [0] * NULLS
        for c in work:
            legs_in = cell_legs(lbd, c)
            res, base = signal_table(c, legs_in)
            surv = [r for r in res if survives(r, app)]
            real += len(surv)
            for r in res:
                rows.append((app, c['cell'], r['sig'], r['band'], r['legs1'], r['legs2'], r['pm1'], r['pm2'], r['lift1'], r['lift2'], survives(r, app), 1))
            for r in surv:
                gated.append(dict(c, cell=f"{c['cell']}|{r['sig']}={r['band']}", filt=[(r['sig'], r['band'])], weak=min(r['pm1'], r['pm2']),
                                  pm1=r['pm1'], pm2=r['pm2']))
            # pairs of surviving bands (different signals), as §22c stacks
            flat = [l for ls in legs_in.values() for l in ls if l['hit'] is not None]
            for a, b in itertools.combinations(surv, 2):
                if a['sig'] == b['sig']:
                    continue
                inter = [l for l in flat if band(a['sig'], l, l[c['rank']]) == a['band'] and band(b['sig'], l, l[c['rank']]) == b['band']]
                r = dict(sig=f"{a['sig']}&{b['sig']}", band=f"{a['band']}&{b['band']}")
                for s, tag in ((S1, '1'), (S2, '2')):
                    pm, hit, g = pm_of([l for l in inter if l['season'] == s])
                    r['pm' + tag], r['legs' + tag] = pm, g
                    r['lift' + tag] = (pm - base[s]) if (pm is not None and base[s] is not None) else None
                ok = survives(r, app, min_legs=20)
                rows.append((app, c['cell'], r['sig'], r['band'], r['legs1'], r['legs2'], r['pm1'], r['pm2'], r['lift1'], r['lift2'], ok, 2))
                if ok:
                    gated.append(dict(c, cell=f"{c['cell']}|{r['sig']}={r['band']}", filt=[(a['sig'], a['band']), (b['sig'], b['band'])],
                                      weak=min(r['pm1'], r['pm2']), pm1=r['pm1'], pm2=r['pm2']))
            for i in range(NULLS):
                res_n, _ = signal_table(c, legs_in, permute=True)
                null_counts[i] += sum(1 for r in res_n if survives(r, app))
        null_counts.sort()
        p95 = null_counts[min(len(null_counts) - 1, int(0.95 * len(null_counts)))] if null_counts else 0
        conn.execute("INSERT INTO nba_score.psr_signal_null (app, real_survivors, null_mean, null_p95, nulls) VALUES (%s,%s,%s,%s,%s)",
                     (app, real, sum(null_counts) / max(len(null_counts), 1), p95, len(null_counts)))
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO nba_score.psr_signals (app, cell, sig, band, legs1, legs2, pm1, pm2, lift1, lift2, survive, depth) "
                            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", rows)
        conn.commit()
        log(f"\n== {app.upper()} SIGNALS on {len(work)} cells: {real} single-band survivors (lift >= 0.02 and p.m >= BE in BOTH postseasons, "
            f">= 25 legs each) vs permutation null mean {sum(null_counts)/max(len(null_counts),1):.1f} (95th {p95})")
        for g in sorted([x for x in gated if x['app'] == app], key=lambda x: -x['weak'])[:30]:
            log(f"   {g['cell']:<60} p.m {g['pm1']:.3f} / {g['pm2']:.3f}")
    return gated


# ---------------------------------------------------------------------------------------------------------------- ENGINE
def engine_cells(cells, gated):
    """the cells the engine may use: ABOVE cells (+ signal-gated variants whose weaker p.m beats their parent's, only when
    PSR_GATED=1 - the signal matrix's survivors did not exceed its permutation null on the first run, so by default they stay out)"""
    ec = [dict(c, filt=[]) for c in cells if c['status'] == 'ABOVE']
    if os.environ.get('PSR_GATED', '0') != '1':
        gated = []
    parent = {(c['app'], c['cell']): c['weak'] for c in cells}
    for g in gated:
        base_name = g['cell'].split('|')[0]
        if g['weak'] > parent.get((g['app'], base_name), 0) + 0.02:
            ec.append(g)
    for c in ec:
        c['edge'] = (c['pm1'] + c['pm2']) / 2
    return ec


def day_pool(day_legs, ecs):
    pool = {}
    for c in ecs:
        r = ranked(cell_pool(day_legs, c['prop'], c['tier'], c['side']), c['rank'], c['prop'])[:c['n']]
        if c['filt']:
            r = [l for l in r if all(band(s, l, l[c['rank']]) == b for s, b in c['filt'])]
        if r:
            pool[c['cell']] = [dict(l, cell=c['cell'], edge=c['edge']) for l in r]
    return pool


def compositions(ecs):
    names = [c['cell'] for c in ecs]
    top = [c['cell'] for c in sorted(ecs, key=lambda c: -c['weak'])][:6]
    comps = {'all': names, 'unders': [c['cell'] for c in ecs if c['side'] == 'Under'],
             'overs': [c['cell'] for c in ecs if c['side'] == 'Over'],
             'plain': [c['cell'] for c in ecs if not c['filt']], 'gated': [c['cell'] for c in ecs if c['filt']],
             'pooled': [c['cell'] for c in ecs if c['prop'] in POOLS]}
    for n in names:
        comps[f'single:{n}'] = [n]
    for n in top:
        comps[f'weighted:{n}'] = ('W', n)
    return {k: v for k, v in comps.items() if v}


def comp_legs(comp_def, pool, all_names):
    def merged(cells):
        legs = [l for c in cells for l in pool.get(c, [])]
        return sorted(legs, key=lambda l: (-l['edge'], l['player']))
    if isinstance(comp_def, tuple):
        c = comp_def[1]
        return pool.get(c, [])[:2] + [l for l in merged(all_names) if l['cell'] != c]
    return merged(comp_def)


def family(cell):
    return cell.split('|')[0].replace('_U', '').replace('_O', '')


def valid_slip(app, slip, single):
    if len({l['player'] for l in slip}) < len(slip):
        return False
    if app == 'pp':
        if len({l['team_id'] for l in slip}) < 2:
            return False
    else:
        if len({l['event_id'] for l in slip}) < len(slip):      # Underdog: one pick per game (§30e/§30f, C = 1)
            return False
    if not single:
        fam = defaultdict(int)
        for l in slip:
            fam[family(l['cell'])] += 1
        if max(fam.values()) > 2:
            return False
    return True


def ud_grade(slip, structure):
    live = [l for l in slip if l['hit'] is not None]
    k = len(live)
    if k < 2:
        return (sum(l['hit'] for l in live), 1.0 if k == 0 else (live[0]['factor'] * 1.0 if live[0]['hit'] else 0.0))
    hits = sum(l['hit'] for l in live)
    if structure == 'standard':
        if hits < k:
            return hits, 0.0
        p = UD_STD[k]
        for l in live:
            p *= l['factor']
        return hits, p
    base = UD_FLEX.get((k, k - hits), 0.0)
    if base == 0.0:
        return hits, 0.0
    p = base
    for l in live:
        if l['hit']:
            p *= l['factor']
    return hits, p


def build_slips(app, pool, comp_def, all_names, size, structure, cap, cmap, single):
    legs, seen = [], set()
    for l in comp_legs(comp_def, pool, all_names):
        if l['player'] in seen:
            continue
        seen.add(l['player']); legs.append(l)
    if len(legs) < size:
        return []
    legs = legs[:10]
    cands = []
    for combo in itertools.combinations(legs, size):
        if not valid_slip(app, combo, single):
            continue
        if app == 'pp':
            cs = SE.pair_corrs(list(combo), cmap) if cmap else []
            if cs and min(cs) <= SE.NEG_CORR:
                continue
            sg = len(combo) - len({l['event_id'] for l in combo})
            tier = 2 if sg == 0 else (1 if cs and min(cs) >= 0.05 else 0)
        else:
            tier = 0
        cands.append(((tier, sum(l['edge'] for l in combo)), combo))
    cands.sort(key=lambda x: (-x[0][0], -x[0][1]))
    return [list(c) for _, c in cands[:cap]]


def run_engine(app, legs, ecs, cmap, src, comps_only=None, sizes=None, cap=3, phase_skip=None):
    """returns slip records: (season, day, comp, size, structure, k, hits, payout, profit, same_game, same_team, legs_json)"""
    lbd = by_day(legs)
    comps = compositions(ecs)
    if comps_only:
        comps = {k: v for k, v in comps.items() if k in comps_only}
    all_names = [c['cell'] for c in ecs]
    structures = ('power', 'flex') if app == 'pp' else ('standard', 'flex')
    sizes = sizes or [2, 3, 4, 5, 6]
    recs = []
    for d in sorted(lbd):
        if phase_skip and d in phase_skip:
            continue
        pool = day_pool(lbd[d], ecs)
        if not pool:
            continue
        season = lbd[d][0]['season']
        for comp, cdef in comps.items():
            single = comp.startswith('single:')
            for size in sizes:
                for st in structures:
                    if app == 'ud' and st == 'flex' and size < 3:
                        continue
                    for k, slip in enumerate(build_slips(app, pool, cdef, all_names, size, st, cap, cmap, single), start=1):
                        hits, payout = SE.grade(slip, st) if app == 'pp' else ud_grade(slip, st)
                        sg = len(slip) - len({l['event_id'] for l in slip})
                        stm = len(slip) - len({l['team_id'] for l in slip})
                        recs.append((app, src, season, d, comp, size, st, k, hits, payout, payout - 1.0, sg, stm,
                                     json.dumps([{'cell': l['cell'], 'player': l['player'], 'prop': l['prop'], 'tier': l['tier'],
                                                  'side': l['side'], 'line': l['line'], 'factor': l['factor'], 'hit': l['hit']} for l in slip])))
    return recs


def stage_engine(conn, legs_post, ecs_by_app, cmap):
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_slips (app text, src text, season text, game_date date, composition text,
        size int, structure text, k int, hits int, payout double precision, profit double precision, same_game int, same_team int,
        legs_json jsonb, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_slips WHERE src='post'")
    allrecs = []
    for app in APPS:
        recs = run_engine(app, [l for l in legs_post if l['app'] == app], ecs_by_app[app], cmap if app == 'pp' else None, 'post')
        allrecs += recs
        log(f"\n== {app.upper()} ENGINE (postseason): {len(recs):,} slips from {len(ecs_by_app[app])} cells, "
            f"{len(compositions(ecs_by_app[app]))} compositions")
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.psr_slips (app, src, season, game_date, composition, size, structure, k, hits, payout, profit,
                           same_game, same_team, legs_json) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", allrecs)
    conn.commit()
    return allrecs


# ------------------------------------------------------------------------------------------------------------ VALIDATION
def strat_days(recs, cap=1, ban_same_team=False):
    """(app, comp, size, structure) -> season -> {day: profit sum, stake}"""
    out = defaultdict(lambda: defaultdict(dict))
    for r in recs:
        app, src, season, d, comp, size, st, k, hits, payout, profit, sg, stm = r[:13]
        if k > cap or (ban_same_team and stm > 0):
            continue
        key = (app, comp, size, st)
        p, s = out[key][season].get(d, (0.0, 0))
        out[key][season][d] = (p + profit, s + 1)
    return out


def roi(daymap):
    stake = sum(s for _, s in daymap.values())
    return (sum(p for p, _ in daymap.values()) / stake) if stake else None


def concentration(daymap):
    prof = [p for p, _ in daymap.values()]
    tot = sum(prof)
    return (max(prof) / tot) if tot > 0 else 1.0


def boot_ci(daymap, n=None):
    n = n or BOOT
    days = list(daymap.values())
    if not days:
        return None, None
    vals = []
    for _ in range(n):
        smp = [random.choice(days) for _ in days]
        st = sum(s for _, s in smp)
        vals.append(sum(p for p, _ in smp) / st if st else 0.0)
    vals.sort()
    return vals[int(0.025 * n)], vals[int(0.975 * n)]


def walk_forward(recs, train, test, min_days=25):
    sd = strat_days(recs)
    sd_ban = strat_days(recs, ban_same_team=True)
    cand = []
    for key, ss in sd.items():
        tr = ss.get(train, {})
        if len(tr) < min_days or concentration(tr) > 0.5:
            continue
        r = roi(tr)
        if r is not None:
            cand.append((r, key))
    cand.sort(key=lambda x: -x[0])
    out = []
    for r_tr, key in cand[:TOPK]:
        te = sd[key].get(test, {})
        if len(te) < 15:
            continue
        lo, hi = boot_ci(te)
        ban = roi(sd_ban[key].get(test, {})) if key[0] == 'pp' else roi(te)
        r_te = roi(te)
        out.append(dict(key=key, train_roi=r_tr, train_days=len(sd[key][train]), test_roi=r_te, test_days=len(te), ci_lo=lo, ci_hi=hi,
                        banned_roi=ban, survive=(lo is not None and lo > 0 and ban is not None and ban > 0)))
    return out


def permute_day_hits(legs):
    # within (night, prop, tier, side): keeps every cell type's base rate (a goblin keeps a goblin's hit rate, a demon a demon's),
    # breaks only the rank -> outcome link. Permuting across the whole night (first run) handed demon prices goblin hit rates and
    # manufactured profitable null cells (null mean 8.8 survivors vs 0 real) - a null that is easier than reality is no null.
    grp = defaultdict(list)
    for l in legs:
        grp[(l['app'], l['game_date'], l['prop'], l['tier'], l['side'])].append(l)
    out = []
    for g in grp.values():
        hits = [l['hit'] for l in g]
        random.shuffle(hits)
        out.extend(dict(l, hit=h) for l, h in zip(g, hits))
    return out


def stage_validate(conn, recs, legs_post, ecs_by_app, cmap):
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_validation (app text, composition text, size int, structure text, direction text,
        train_roi double precision, train_days int, test_roi double precision, test_days int, ci_lo double precision, ci_hi double precision,
        banned_roi double precision, survive boolean, built_at timestamptz DEFAULT now())""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_validation_null (app text, direction text, real_survivors int,
        null_mean double precision, null_p95 int, nulls int, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_validation"); conn.execute("DELETE FROM nba_score.psr_validation_null")
    results = {}
    pct = lambda v: f"{v:+.0%}" if v is not None else "  n/a"
    for app in APPS:
        legs_app = [l for l in legs_post if l['app'] == app]
        for direction, (tr, te) in (('fwd', (S1, S2)), ('rev', (S2, S1))):
            # HONEST V1: the cells are discovered on the TRAINING postseason only (the scored postseason never chooses a cell, a
            # rank, a band or a strategy); the engine then builds slips on both, the strategy is chosen on the training season,
            # and the other season scores it. The empirical null repeats the WHOLE pipeline on hit-permuted nights.
            ecs_tr = engine_cells(select_cells(legs_app, app, train=tr), [])
            recs_tr = run_engine(app, legs_app, ecs_tr, cmap if app == 'pp' else None, 'wf')
            res = walk_forward(recs_tr, tr, te)
            results[(app, direction)] = res
            real = sum(1 for x in res if x['survive'])
            nulls = []
            for _ in range(ENGINE_NULLS):
                pl = permute_day_hits(legs_app)
                ecs_n = engine_cells(select_cells(pl, app, train=tr), [])
                nr = run_engine(app, pl, ecs_n, cmap if app == 'pp' else None, 'null')
                nulls.append(sum(1 for x in walk_forward(nr, tr, te) if x['survive']))
            nulls.sort()
            p95 = nulls[min(len(nulls) - 1, int(0.95 * len(nulls)))] if nulls else 0
            conn.execute("INSERT INTO nba_score.psr_validation_null (app, direction, real_survivors, null_mean, null_p95, nulls) VALUES (%s,%s,%s,%s,%s,%s)",
                         (app, direction, real, sum(nulls) / max(len(nulls), 1), p95, len(nulls)))
            with conn.cursor() as cur:
                cur.executemany("""INSERT INTO nba_score.psr_validation (app, composition, size, structure, direction, train_roi, train_days,
                    test_roi, test_days, ci_lo, ci_hi, banned_roi, survive) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    [(app, x['key'][1], x['key'][2], x['key'][3], direction, x['train_roi'], x['train_days'], x['test_roi'], x['test_days'],
                      x['ci_lo'], x['ci_hi'], x['banned_roi'], x['survive']) for x in res])
            conn.commit()
            log(f"\n== {app.upper()} WALK-FORWARD {direction}: cells discovered on {tr} only ({len(ecs_tr)} cells: "
                f"{', '.join(c['cell'] for c in sorted(ecs_tr, key=lambda c: -c['weak'])[:12])}{' ...' if len(ecs_tr) > 12 else ''}); "
                f"strategy chosen on {tr} (top {TOPK} by ROI at cap 1, >= 25 days, concentration <= 50%); scored on {te}: "
                f"{real} survivors vs full-pipeline null mean {sum(nulls)/max(len(nulls),1):.2f} (95th {p95}, {len(nulls)} nulls); "
                f"positive test-season lower bound before the teammate ban: {sum(1 for x in res if x['ci_lo'] is not None and x['ci_lo'] > 0)}")
            for x in res:
                log(f"   {'SURVIVE' if x['survive'] else '       '} {x['key'][1]:<44}{x['key'][2]} {x['key'][3]:<8} train {pct(x['train_roi'])} "
                    f"({x['train_days']}d)  test {pct(x['test_roi'])} ({x['test_days']}d)  CI [{pct(x['ci_lo'])}, {pct(x['ci_hi'])}]  no-teammate {pct(x['banned_roi'])}")
    return results


# ---------------------------------------------------------------------------------------------------------------- STRESS
def drawdown_streak(daymap):
    eq, peak, mdd, streak, mstreak = 0.0, 0.0, 0.0, 0, 0
    for d in sorted(daymap):
        p, _ = daymap[d]
        eq += p
        peak = max(peak, eq)
        mdd = max(mdd, peak - eq)
        streak = streak + 1 if p < 0 else 0
        mstreak = max(mstreak, streak)
    return mdd, mstreak


def envelope(daymap, n_days, sims=10000, block=1):
    days = [daymap[d] for d in sorted(daymap)]
    if not days:
        return None, None, None
    lose, dds = 0, []
    for _ in range(sims):
        smp = []
        while len(smp) < n_days:
            i = random.randrange(len(days))
            smp.extend(days[i:i + block])
        smp = smp[:n_days]
        st = sum(s for _, s in smp)
        if sum(p for p, _ in smp) < 0:
            lose += 1
        dd, _ = drawdown_streak({i: v for i, v in enumerate(smp)})
        dds.append(dd)
    dds.sort()
    return lose / sims, dds[sims // 2], dds[int(0.95 * sims)]


def implied_roi(p, app):
    """expected ROI of one slip of independent legs at leg hit p (factor 1.0 legs), per structure - the exact payout tables"""
    out = {}
    if app == 'pp':
        for k in (3, 4, 5, 6):
            out[f'{k}P'] = SE.POWER[k] * p ** k - 1
            out[f'{k}F'] = sum(SE.FLEX.get((k, h), 0.0) * math.comb(k, h) * p ** h * (1 - p) ** (k - h) for h in range(k + 1)) - 1
    else:
        for k in (2, 3, 4, 5):
            out[f'{k}S'] = UD_STD[k] * p ** k - 1
    return out


def stage_legwf(conn, legs_post):
    """LEG-LEVEL WALK-FORWARD: slips are 1 a night (~50 observations a postseason - too few to resolve an edge); legs are
    thousands. Cells (and their rank / band) are discovered on one postseason only; their legs are scored on the other, per night
    (day-averaged p.m, the certifier's unit) with a day-blocked bootstrap CI; then the whole train-chosen family pooled.
    The implied slip ROI at the pooled test hit rate (independent legs) translates the leg edge into slip terms."""
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_leg_wf (app text, direction text, cell text, side text, train_pm double precision,
        test_pm double precision, test_lo double precision, test_hi double precision, test_days int, test_legs int, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_leg_wf")
    rows = []
    for app in APPS:
        legs_app = [l for l in legs_post if l['app'] == app]
        lbd = by_day(legs_app)
        for direction, (tr, te) in (('fwd', (S1, S2)), ('rev', (S2, S1))):
            cells = [c for c in select_cells(legs_app, app, train=tr) if c['status'] == 'ABOVE']
            fam = defaultdict(lambda: defaultdict(list))     # family -> day -> [legs] (dedup by leg identity)
            log(f"\n== {app.upper()} LEG-LEVEL WALK-FORWARD {direction}: {len(cells)} cells ABOVE on {tr}; their legs on {te} ==")
            for c in sorted(cells, key=lambda c: -c['weak']):
                daypm = {}
                for d, dl in lbd.items():
                    if dl[0]['season'] != te:
                        continue
                    r = ranked(cell_pool(dl, c['prop'], c['tier'], c['side']), c['rank'], c['prop'])[:c['n']]
                    pm, hit, g = pm_of(r)
                    if pm is not None:
                        daypm[d] = (pm, g)
                        for l in r:
                            for f in ('ALL_cells', 'UNDER_cells' if c['side'] == 'Under' else ('OVER_cells' if c['side'] == 'Over' else 'BOTH_cells'),
                                      'R_tier' if c['tier'] == 'R' else 'priced_tier'):
                                fam[f][d].append(l)
                if not daypm:
                    continue
                vals = list(daypm.values())
                m = sum(v for v, _ in vals) / len(vals)
                bs = sorted(sum(random.choice(vals)[0] for _ in vals) / len(vals) for _ in range(2000))
                rows.append((app, direction, c['cell'], c['side'], c['weak'], m, bs[50], bs[1949], len(vals), sum(g for _, g in vals)))
                log(f"   {c['cell']:<20}{c['rank']:<9}n={c['n']:<3} train {c['weak']:.3f}  test {m:.3f} [{bs[50]:.3f}, {bs[1949]:.3f}]  {len(vals)} nights")
            for f, days in fam.items():
                per = []
                for d, ls in days.items():
                    seen, uniq = set(), []
                    for l in ls:
                        k = (l['player'], l['prop'], l['side'], l['line'], l['tier'])
                        if k not in seen:
                            seen.add(k); uniq.append(l)
                    pm, hit, g = pm_of(uniq)
                    if pm is not None:
                        per.append((pm, hit, g))
                if not per:
                    continue
                m = sum(p for p, _, _ in per) / len(per)
                h = sum(x for _, x, _ in per) / len(per)
                bs = sorted(sum(random.choice(per)[0] for _ in per) / len(per) for _ in range(2000))
                rows.append((app, direction, f'FAMILY:{f}', None, None, m, bs[50], bs[1949], len(per), sum(g for _, _, g in per)))
                imp = implied_roi(h, app) if f in ('UNDER_cells', 'R_tier') else {}
                log(f"   FAMILY {f:<14} test p.m {m:.3f} [{bs[50]:.3f}, {bs[1949]:.3f}] hit {h:.3f} over {len(per)} nights"
                    + (("   implied slip ROI at that hit (independent legs): " + ", ".join(f"{k} {v:+.0%}" for k, v in imp.items())) if imp else ""))
    with conn.cursor() as cur:
        cur.executemany("INSERT INTO nba_score.psr_leg_wf (app, direction, cell, side, train_pm, test_pm, test_lo, test_hi, test_days, test_legs) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", rows)
    conn.commit()


def stage_stress(conn, recs_post, results, ecs_by_app, cmap, reg_legs):
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.psr_stress (app text, composition text, size int, structure text, src text, season text,
        days int, slips int, roi double precision, ci_lo double precision, ci_hi double precision, max_dd double precision, max_losing_streak int,
        pct_days_pos double precision, p_losing_season double precision, dd_p50 double precision, dd_p95 double precision, note text,
        built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.psr_stress")
    rows = []
    for app in APPS:
        # the strategies under test: walk-forward survivors in either direction + the 12 best by pooled postseason ROI that are
        # positive in BOTH postseasons (the robustness view the regular season used, §25a: rank by the weaker season)
        sd = strat_days([r for r in recs_post if r[0] == app])
        pick = {x['key'] for d in ('fwd', 'rev') for x in results.get((app, d), []) if x['survive']}
        both = []
        for key, ss in sd.items():
            r1, r2 = roi(ss.get(S1, {})), roi(ss.get(S2, {}))
            if r1 is not None and r2 is not None and len(ss.get(S1, {})) >= 25 and len(ss.get(S2, {})) >= 25 and min(r1, r2) > 0:
                both.append((min(r1, r2), key))
        both.sort(key=lambda x: -x[0])
        pick |= {k for _, k in both[:12]}
        log(f"\n== {app.upper()} STRESS: {len(pick)} postseason strategies (survivors + best 12 positive in both postseasons) ==")
        if not pick:
            continue
        # postseason record + envelopes
        for key in sorted(pick):
            for s in (S1, S2):
                dm = sd[key].get(s, {})
                if not dm:
                    continue
                lo, hi = boot_ci(dm, 2000)
                mdd, ms = drawdown_streak(dm)
                pl, d50, d95 = envelope(dm, 50, sims=5000, block=7)
                rows.append((app, key[1], key[2], key[3], 'post', s, len(dm), sum(x for _, x in dm.values()), roi(dm), lo, hi, mdd, ms,
                             sum(1 for p, _ in dm.values() if p > 0) / len(dm), pl, d50, d95, '7-day block envelope, 50-night postseason'))
        # the same strategies on both REGULAR seasons (final week excluded, as the regular certification did)
        comps_only = {k[1] for k in pick}
        ecs = ecs_by_app[app]
        legs = [l for l in reg_legs if l['app'] == app]
        bounds = {}
        for l in legs:
            lo, hi = bounds.get(l['season'], (l['game_date'], l['game_date']))
            bounds[l['season']] = (min(lo, l['game_date']), max(hi, l['game_date']))
        skip = {l['game_date'] for l in legs if SE.phase_of(l['season'], l['game_date'], bounds) == 'final7'}
        reg_ecs = []
        for c in ecs:
            if any(s not in REG_SIGNALS for s, _ in c['filt']):
                continue        # a playoff-only signal (series, round, game number, playoff form) has no regular-season meaning
            reg_ecs.append(c)
        dropped = {c['cell'] for c in ecs} - {c['cell'] for c in reg_ecs}
        rr = run_engine(app, legs, reg_ecs, cmap if app == 'pp' else None, 'reg', comps_only=comps_only, cap=1)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM nba_score.psr_slips WHERE src='reg' AND app=%s", (app,))
            cur.executemany("""INSERT INTO nba_score.psr_slips (app, src, season, game_date, composition, size, structure, k, hits, payout, profit,
                               same_game, same_team, legs_json) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rr)
        conn.commit()
        sdr = strat_days(rr)
        log(f"   regular-season engine: {len(rr):,} slips; cells without a regular-season meaning dropped: {sorted(dropped) or 'none'}")
        log(f"   {'strategy':<60}{'post 24-25':>11}{'post 25-26':>11}{'reg 24-25':>11}{'reg 25-26':>11}{'reg DD':>8}{'streak':>7}")
        for key in sorted(pick, key=lambda k: -(min(roi(sd[k].get(S1, {})) or -9, roi(sd[k].get(S2, {})) or -9))):
            regs = []
            for s in (S1, S2):
                dm = sdr.get(key, {}).get(s, {})
                if not dm:
                    regs.append(None)
                    rows.append((app, key[1], key[2], key[3], 'reg', s, 0, 0, None, None, None, None, None, None, None, None, None,
                                 'no regular-season slips (cells absent or dropped)'))
                    continue
                lo, hi = boot_ci(dm, 2000)
                mdd, ms = drawdown_streak(dm)
                pl, d50, d95 = envelope(dm, len(dm), sims=2000, block=7)
                regs.append((roi(dm), mdd, ms))
                rows.append((app, key[1], key[2], key[3], 'reg', s, len(dm), sum(x for _, x in dm.values()), roi(dm), lo, hi, mdd, ms,
                             sum(1 for p, _ in dm.values() if p > 0) / len(dm), pl, d50, d95, 'regular season, final week excluded'))
            f = lambda v: f"{v:+.0%}" if v is not None else "   n/a"
            log(f"   {key[1][:42]:<44}{key[2]} {key[3]:<8}{f(roi(sd[key].get(S1, {}))):>11}{f(roi(sd[key].get(S2, {}))):>11}"
                f"{f(regs[0][0] if regs[0] else None):>11}{f(regs[1][0] if regs[1] else None):>11}"
                f"{(max(r[1] for r in regs if r) if any(regs) else 0):>8.1f}{(max(r[2] for r in regs if r) if any(regs) else 0):>7}")
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO nba_score.psr_stress (app, composition, size, structure, src, season, days, slips, roi, ci_lo, ci_hi,
            max_dd, max_losing_streak, pct_days_pos, p_losing_season, dd_p50, dd_p95, note) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rows)
    conn.commit()


# ------------------------------------------------------------------------------------------------------------------ MAIN
def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    legs_post = []
    for app in APPS:
        sql = PP_POST_SQL if app == 'pp' else UD_POST_SQL
        ls = fetch_legs(conn, sql, (MAIN,))
        attach_features(conn, ls, FEAT_POST_SQL)
        for l in ls:
            l['app_src'] = 'post'
        legs_post += ls
        log(f"{app.upper()} postseason legs: {len(ls):,} over {len({l['game_date'] for l in ls})} nights; "
            f"game key {sum(1 for l in ls if l['event_id'])/max(len(ls),1):.1%}, team {sum(1 for l in ls if l['team_id'])/max(len(ls),1):.1%}")
    if 'bands' in STAGES:
        stage_bands(conn, legs_post)
    cells = stage_cells(conn, legs_post) if ('cells' in STAGES or 'engine' in STAGES) else []
    gated = stage_signals(conn, legs_post, cells) if ('signals' in STAGES or 'engine' in STAGES) else []
    cmap = SE.load_corr(conn) if 'pp' in APPS else None
    ecs_by_app = {}
    for app in APPS:
        ecs_by_app[app] = engine_cells([c for c in cells if c['app'] == app], [g for g in gated if g['app'] == app])
        log(f"{app.upper()} engine cells: {len(ecs_by_app[app])} ({sum(1 for c in ecs_by_app[app] if c['filt'])} signal-gated)")
    recs = stage_engine(conn, legs_post, ecs_by_app, cmap) if 'engine' in STAGES else []
    results = stage_validate(conn, recs, legs_post, ecs_by_app, cmap) if 'validate' in STAGES else {}
    if 'stress' in STAGES:
        reg_legs = []
        for app in APPS:
            pt = sorted({(p, c['tier']) for c in ecs_by_app[app] for p in POOLS.get(c['prop'], [c['prop']])})
            if not pt:
                continue
            sql = PP_REG_SQL if app == 'pp' else UD_REG_SQL
            ls = fetch_legs(conn, sql, (MAIN, [p for p, _ in pt], [t for _, t in pt]))
            if app == 'ud':
                for l in ls:       # Underdog regular legs carry no team: the game key is the binding rule (one pick per game)
                    l['team_id'] = l['event_id']
            attach_features(conn, ls, FEAT_REG_SQL)
            for l in ls:
                l['app_src'] = 'reg'
            reg_legs += ls
            log(f"{app.upper()} regular-season legs for the stress test: {len(ls):,} over {len({l['game_date'] for l in ls})} days")
        stage_stress(conn, recs, results, ecs_by_app, cmap, reg_legs)
    conn.close()
    log("DONE")


if __name__ == "__main__":
    main()
