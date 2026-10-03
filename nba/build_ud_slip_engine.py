#!/usr/bin/env python3
"""
UNDERDOG SLIP ENGINE (strategy doc §30n) - real slips, day by day, from Underdog's certified cells, priced by
Underdog's formula. The skeleton of build_slip_engine.py (PrizePicks); everything Underdog-specific replaced.

SOURCES: nba_score.ud_tier_map_legs (Underdog window board, certified §30i/§30j: modifier, tier, three ranks, graded
outcome, DNP/push voided) + ud_window_legs (event_id: one pick per game) + ud_cand_leg_features (pre-window signals,
prior data only: min_trend, pf20). No other table.

PAYOUT (§30f, certified §30i; published tables, conservative - no 1.04, 4-pick Flex at the published 6):
  Standard (all must hit):        base(n) x prod(m)              base 2:3.5 3:6.5 4:12 5:20 6:35 7:65 8:120
  Flex, all correct:              F0(n) x prod(m)                F0   3:3.25 4:6 5:10 6:25 7:40 8:80
  Flex, j misses:                 Fj(n) x prod(m over the hits)  F1 3:1.09 4:1.4 5:2.5 6:2.6 7:2.75 8:3 ; F2 6:0.25 7:0.5 8:1
  sizes 2-8 (Flex 3-8; double-flex from 6). Voids are excluded upstream (graded legs only).
APP RULES: players from >= 2 teams; no player twice. ENGINE RULE: ONE PICK PER GAME, so Underdog's correlation factor
  is 1 and the formula is exact (§30f); cross-game legs are priced as independent.

CELLS: the 14 certified Underdog cells (§30k), each at its certified configuration (best by the WEAKER season on the
  raw-board grid) - rank, side, top-n band; edge = that config's weaker-season p.m (more conservative than PP's 2025-26).
COMPOSITIONS (Underdog's own families, §30k-m):
  single:<cell>   that cell's legs          all        all 14 cells, best legs by edge
  core            the 11 most robust cells  under      Under-side cells only
  points          points / pts_reb / pra / pts_ast    rebs   rebounds R/F2/B1, reb_ast R/B1
  weighted:<cell> 2 legs from <cell> + the rest from core
CANDIDATE SIGNAL RULES (§30l-m; each tested as its own side table against the base, never assumed):
  UD_MINRISE_OUT=1  drop legs whose minutes rose >= 4 (3g vs 10g)        (UD: rising minutes 43% wrong-way)
  UD_MINFALL_PREF=1 order slips by the count of legs whose minutes fell >= 4 (UD: 53% both-positive), then edge
Within a composition, slip k on a day = the k-th best distinct valid slip (cap 1..UD_CAP).

Output: nba_score.ud_slip_engine_slips{SUFFIX} (+ _legs). Report: leaderboard by weaker-season ROI (cap 1, phase final7 excluded).
Env: DATABASE_URL, UD_CAP (5), UD_SIZES (2,3,4,5,6,7,8), UD_TABLE_SUFFIX, UD_MAX_PER_CELL (2), UD_MINRISE_OUT, UD_MINFALL_PREF.
"""
import os
import json
import itertools
from collections import defaultdict

import psycopg

CAP = int(os.environ.get('UD_CAP') or '5')
SIZES = [int(x) for x in (os.environ.get('UD_SIZES') or '2,3,4,5,6,7,8').split(',')]
MAX_PER_CELL = int(os.environ.get('UD_MAX_PER_CELL') or '2')
MINRISE_OUT = (os.environ.get('UD_MINRISE_OUT') or '0') == '1'
MINFALL_PREF = (os.environ.get('UD_MINFALL_PREF') or '0') == '1'
EXCL_HOTFORM = (os.environ.get('UD_EXCL_HOTFORM') or '0') == '1'   # §30p: recent form >= +1 SD toward the pick: 61% wrong-way
EXCL_CENTER = (os.environ.get('UD_EXCL_CENTER') or '0') == '1'     # §30p: centers: 60% wrong-way
LEGS_TABLE = os.environ.get('UD_LEGS_TABLE') or 'nba_score.ud_tier_map_legs'   # §30r: '_curr' = repriced to Underdog's current logic
HC_MAIN = float(os.environ.get('UD_HC_MAIN') or '0')    # §30r confidence haircut on a main leg's payout factor (0.01 = 1%)
HC_ALT = float(os.environ.get('UD_HC_ALT') or '0')      # §30r confidence haircut on an alternate leg's payout factor
SUFFIX = os.environ.get('UD_TABLE_SUFFIX') or ''
T_SLIPS = f'nba_score.ud_slip_engine_slips{SUFFIX}'
T_LEGS = f'nba_score.ud_slip_engine_legs{SUFFIX}'

STD = {2: 3.5, 3: 6.5, 4: 12.0, 5: 20.0, 6: 35.0, 7: 65.0, 8: 120.0}
FLEX = {(3, 0): 3.25, (3, 1): 1.09, (4, 0): 6.0, (4, 1): 1.4, (5, 0): 10.0, (5, 1): 2.5,
        (6, 0): 25.0, (6, 1): 2.6, (6, 2): 0.25, (7, 0): 40.0, (7, 1): 2.75, (7, 2): 0.5,
        (8, 0): 80.0, (8, 1): 3.0, (8, 2): 1.0}

# name: (prop, tier, side, rank_key, n_band, edge = certified weaker-season p.m)   -- §30k, nba_score.ud_cand_certified
CELLS = {
    'turnovers_R':   ('turnovers', 'R', 'both', 'baseline_hp', 1, 0.638),
    'reb_ast_B1_U':  ('reb_ast', 'B1', 'Under', 'baseline_hp', 2, 0.612),
    'rebounds_F2_U': ('rebounds', 'F2', 'Under', 'final_score', 1, 0.594),
    'rebounds_R':    ('rebounds', 'R', 'both', 'final_score', 1, 0.593),
    'assists_R_U':   ('assists', 'R', 'Under', 'baseline_hp', 1, 0.592),
    'blocks_R':      ('blocks', 'R', 'both', 'final_score', 1, 0.591),
    'points_R_U':    ('points', 'R', 'Under', 'final_score', 2, 0.590),
    'reb_ast_R_O':   ('reb_ast', 'R', 'Over', 'final_hp', 1, 0.586),
    'threes_R':      ('threes_made', 'R', 'both', 'baseline_hp', 1, 0.578),
    'rebounds_B1_U': ('rebounds', 'B1', 'Under', 'baseline_hp', 3, 0.576),
    'stocks_R_U':    ('stocks', 'R', 'Under', 'final_hp', 2, 0.566),
    'pts_ast_R_O':   ('pts_ast', 'R', 'Over', 'baseline_hp', 2, 0.562),
    'pts_reb_R_U':   ('pts_reb', 'R', 'Under', 'final_score', 3, 0.561),
    'pra_R_U':       ('pra', 'R', 'Under', 'final_score', 2, 0.559),
}
CORE = ['points_R_U', 'pts_reb_R_U', 'reb_ast_B1_U', 'rebounds_F2_U', 'rebounds_B1_U', 'threes_R', 'rebounds_R',
        'reb_ast_R_O', 'pts_ast_R_O', 'turnovers_R', 'assists_R_U']          # grid-robust (>= 20/36), §30k
UNDER = [c for c, v in CELLS.items() if v[2] == 'Under']
POINTS = ['points_R_U', 'pts_reb_R_U', 'pra_R_U', 'pts_ast_R_O']
REBS = ['rebounds_R', 'rebounds_F2_U', 'rebounds_B1_U', 'reb_ast_R_O', 'reb_ast_B1_U']
if os.environ.get('UD_CELLS_JSON'):   # §30r: re-certified cells on the repriced build {name: [prop, tier, side, rank, n, edge], "_core": [...]}
    _cj = json.loads(os.environ['UD_CELLS_JSON'])
    _core = _cj.pop('_core', None)
    CELLS = {k: tuple(v) for k, v in _cj.items()}
    CORE = [c for c in (_core or (os.environ.get('UD_CORE') or ','.join(CELLS)).split(',')) if c in CELLS]
    UNDER = [c for c, v in CELLS.items() if v[2] == 'Under']
    POINTS = [c for c, v in CELLS.items() if v[0] in ('points', 'pts_reb', 'pra', 'pts_ast')]
    REBS = [c for c, v in CELLS.items() if v[0] in ('rebounds', 'reb_ast')]

LEG_SQL = """
SELECT l.rank_key, l.season, l.game_date, l.player, l.player_id, l.prop, l.tier, l.side, l.line, l.factor, l.hit, l.n_rank, l.score, l.kind,
       w.event_id, f.min_trend, f.pf20, f.form_gap, f.position
FROM {LEGS_TABLE} l
JOIN (SELECT game_date, pn, prop, side, line, min(event_id) event_id FROM nba_score.ud_window_legs GROUP BY 1,2,3,4,5) w
  ON w.game_date=l.game_date AND w.pn=l.player AND w.prop=l.prop AND w.side=l.side AND w.line=l.line
LEFT JOIN nba_score.ud_cand_leg_features_x f
  ON f.game_date=l.game_date AND f.player=l.player AND f.prop=l.prop AND f.side=l.side AND f.line=l.line
WHERE (l.prop, l.tier, l.rank_key) IN (%s)
"""


def phase_of(season, d, bounds):
    s0, s1 = bounds[season]
    if (s1 - d).days <= 7:
        return 'final7'
    if (d - s0).days <= 30:
        return 'early'
    if (s1 - d).days <= 21:
        return 'late'
    return 'mid'


def eligible_legs(day_rows):
    out = defaultdict(list)
    for name, (prop, tier, side, rank, nband, edge) in CELLS.items():
        legs = [r for r in day_rows if r['prop'] == prop and r['tier'] == tier and r['rank_key'] == rank
                and (side == 'both' or r['side'] == side)]
        if MINRISE_OUT:
            legs = [r for r in legs if not (r['min_trend'] is not None and float(r['min_trend']) >= 4)]
        if EXCL_HOTFORM:
            legs = [r for r in legs if not (r['form_gap'] is not None and float(r['form_gap']) >= 1)]
        if EXCL_CENTER:
            legs = [r for r in legs if r['position'] != 'C']
        legs.sort(key=lambda r: (-r['score'], r['player']))      # re-rank within the side by the cell's rank score, as certified
        for r in legs[:nband]:
            r2 = dict(r); r2['cell'] = name; r2['edge'] = edge
            hc = HC_MAIN if r.get('kind') == 'main' else HC_ALT
            if hc:
                r2['factor'] = float(r['factor']) * (1.0 - hc)   # §30r confidence haircut (payout only; the tier stays as priced)
            out[name].append(r2)
    return out


def valid(slip, single_cell=False):
    if len({l['player'] for l in slip}) < len(slip):
        return False
    if len({l['event_id'] for l in slip}) < len(slip):       # one pick per game (correlation factor 1)
        return False
    fam = defaultdict(int)
    for l in slip:
        fam[l['cell']] += 1
    if not single_cell and max(fam.values()) > MAX_PER_CELL:
        return False
    return True


def grade(slip, structure):
    k = len(slip)
    hits = sum(l['hit'] for l in slip)
    if structure == 'standard':
        if hits < k:
            return hits, 0.0
        p = STD[k]
        for l in slip:
            p *= l['factor']
        return hits, p
    base = FLEX.get((k, k - hits), 0.0)
    if base == 0.0:
        return hits, 0.0
    p = base
    for l in slip:
        if l['hit']:
            p *= l['factor']
    return hits, p


def candidates_for(comp, pool):
    def merged(cells):
        legs = []
        for c in cells:
            legs.extend(pool.get(c, []))
        return sorted(legs, key=lambda l: (-l['edge'], l['n_rank']))
    if comp.startswith('single:'):
        return pool.get(comp[7:], [])
    if comp == 'core':
        return merged(CORE)
    if comp == 'all':
        return merged(list(CELLS))
    if comp == 'under':
        return merged(UNDER)
    if comp == 'points':
        return merged(POINTS)
    if comp == 'rebs':
        return merged(REBS)
    if comp.startswith('weighted:'):
        c = comp[9:]
        return pool.get(c, [])[:2] + [l for l in merged(CORE) if l['cell'] != c]
    return []


def build_day_slips(pool, comp, size, cap):
    seen, legs = set(), []
    for l in candidates_for(comp, pool):
        if l['player'] in seen:
            continue
        seen.add(l['player']); legs.append(l)
    if len(legs) < size:
        return []
    legs = legs[:12]
    slips = []
    for combo in itertools.combinations(legs, size):
        s = list(combo)
        if not valid(s, single_cell=comp.startswith('single:')):
            continue
        mf = sum(1 for l in s if l['min_trend'] is not None and float(l['min_trend']) <= -4) if MINFALL_PREF else 0
        slips.append(((mf, sum(l['edge'] for l in s)), s))
    slips.sort(key=lambda x: (-x[0][0], -x[0][1]))
    return [s for _, s in slips[:cap]]


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS {T_SLIPS} (
        game_date date, season text, phase text, composition text, size int, structure text, k int,
        legs_json jsonb, hits int, payout double precision, stake double precision, profit double precision,
        built_at timestamptz DEFAULT now())""")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS {T_LEGS} (
        game_date date, composition text, size int, structure text, k int, cell text, player text, prop text, tier text,
        side text, line numeric, factor double precision, hit int, built_at timestamptz DEFAULT now())""")
    conn.execute(f"DELETE FROM {T_SLIPS}"); conn.execute(f"DELETE FROM {T_LEGS}")
    conn.commit()
    keys = ",".join(f"('{p}','{t}','{rk}')" for (p, t, s, rk, n, e) in CELLS.values())
    days = defaultdict(list)
    with conn.cursor(name='legs') as cur:
        cur.itersize = 50000
        cur.execute(LEG_SQL.replace('{LEGS_TABLE}', LEGS_TABLE) % keys)
        cols = [d.name for d in cur.description]
        for row in cur:
            r = dict(zip(cols, row))
            days[r['game_date']].append(r)
    print(f"  {sum(len(v) for v in days.values()):,} candidate legs over {len(days)} days; rules: minrise_out={MINRISE_OUT} minfall_pref={MINFALL_PREF}", flush=True)
    bounds = {}
    for d, rows in days.items():
        s = rows[0]['season']
        lo, hi = bounds.get(s, (d, d))
        bounds[s] = (min(lo, d), max(hi, d))
    comps = ['core', 'all', 'under', 'points', 'rebs'] + [f'single:{c}' for c in CELLS] + [f'weighted:{c}' for c in CORE]
    slip_rows, leg_rows = [], []
    for d in sorted(days):
        rows = days[d]
        season = rows[0]['season']
        ph = phase_of(season, d, bounds)
        pool = eligible_legs(rows)
        for comp in comps:
            for size in SIZES:
                built = build_day_slips(pool, comp, size, CAP)
                for structure in ('standard', 'flex'):
                    if structure == 'flex' and size < 3:
                        continue
                    for k, slip in enumerate(built, start=1):
                        hits, payout = grade(slip, structure)
                        slip_rows.append((d, season, ph, comp, size, structure, k,
                                          json.dumps([{'cell': l['cell'], 'player': l['player'], 'prop': l['prop'], 'tier': l['tier'], 'side': l['side'],
                                                       'line': float(l['line']), 'factor': l['factor'], 'hit': l['hit'],
                                                       'min_trend': (float(l['min_trend']) if l['min_trend'] is not None else None)} for l in slip]),
                                          hits, payout, 1.0, payout - 1.0))
                        for l in slip:
                            leg_rows.append((d, comp, size, structure, k, l['cell'], l['player'], l['prop'], l['tier'], l['side'], l['line'], l['factor'], l['hit']))
        if len(slip_rows) >= 200000:
            flush(conn, slip_rows, leg_rows); slip_rows, leg_rows = [], []
    flush(conn, slip_rows, leg_rows)
    n = conn.execute(f"SELECT count(*) FROM {T_SLIPS}").fetchone()[0]
    print(f"  {n:,} real slips persisted to {T_SLIPS}", flush=True)
    report(conn)
    conn.close()


def flush(conn, slip_rows, leg_rows):
    with conn.cursor() as c:
        c.executemany(f"""INSERT INTO {T_SLIPS} (game_date, season, phase, composition, size, structure, k, legs_json, hits, payout, stake, profit)
                         VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", slip_rows)
        c.executemany(f"""INSERT INTO {T_LEGS} (game_date, composition, size, structure, k, cell, player, prop, tier, side, line, factor, hit)
                         VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", leg_rows)
    conn.commit()


def report(conn):
    rows = conn.execute(f"""
        WITH s AS (SELECT composition, size, structure, season, profit, hits=size is_full FROM {T_SLIPS} WHERE k<=1 AND phase<>'final7')
        SELECT composition, size, structure,
          round(avg(profit) FILTER (WHERE season='2024-25')::numeric,3) roi_s1, round(avg(profit) FILTER (WHERE season='2025-26')::numeric,3) roi_s2,
          count(*) FILTER (WHERE season='2024-25') n1, count(*) FILTER (WHERE season='2025-26') n2,
          round(100.0*avg(CASE WHEN is_full THEN 1 ELSE 0 END)::numeric,0) full_pct
        FROM s GROUP BY 1,2,3
        HAVING count(*) FILTER (WHERE season='2024-25') >= 40 AND count(*) FILTER (WHERE season='2025-26') >= 40
        ORDER BY least(avg(profit) FILTER (WHERE season='2024-25'), avg(profit) FILTER (WHERE season='2025-26')) DESC NULLS LAST
        LIMIT 40""").fetchall()
    print("\n== TOP 40 (cap 1, final7 excluded) by WEAKER-season ROI: composition | size | structure | ROI 24-25 | ROI 25-26 | n1 | n2 | full% ==", flush=True)
    for r in rows:
        print("  " + " | ".join(str(x) for x in r), flush=True)


if __name__ == "__main__":
    main()
