#!/usr/bin/env python3
"""
NBA SLIP ENGINE — real slips, day by day, from the certified candidate cells.

Owner: sizes 2-6, Power and Flex; every candidate individually, mixed, best-of-best, weighted; daily caps;
app rules; correlation/game exposure; both seasons with phases; ROI + full hits, partial hits, profit, leg hits.

Sources (all certified, section 24): nba_score.tier_map_legs (real PP window board, current per-line price,
system tier, three ranks; deduped) + prop_universe for team/game. No other table.

APP RULES (PrizePicks live page 2026-09-30 + PP_PAYOUT_FINDINGS):
  - 2-6 picks; Power (all must hit) or Flex (partial tiers); 2-pick Flex exists (2x / 0.5x)
  - players on >= 2 separate teams; no player twice
  - payout = product of base multiplier x leg factors, then COMPRESSED: p <= 9.1 -> p ; p > 9.1 -> 9.1*(p/9.1)^0.857
  - a void/tie reverts to the next size down (not modelled: graded legs only, voids excluded upstream)
CORRELATION (section 15c, certified): cross-game and same-team legs independent to 3 decimals; only same-player
  correlates -> one leg per player enforced; same-game / same-team pairs are MEASURED (flag per slip), not banned.

CELLS: the certified ledger (24a), each with its rank and n-band. A leg is eligible on a day if it is within its
cell's band under its cell's rank. Legs carry an 'edge score' = the cell's certified 2025-26 p.m, used to order.

COMPOSITIONS (each a strategy; every one x every size x Power/Flex x every cap):
  single:<cell>       only that cell's legs (top of its band)
  core                the 6 both-season cells, best legs by edge score
  regular             all Regular cells, best legs
  best                all cells incl. demons, best legs by edge score
  weighted:<cell>     2 legs from <cell> + rest from core (more of one candidate)
  core+goblin         core legs + ONE top goblin (G1/G2 points-family, top-1 by final_hp) as the last leg
  core+demon          core legs + ONE demon (threes D1 / assists D1 top-2) as the last leg
  demon               demon cells only (threes D1, assists D1, rebounds D3 top-3)
  mixed_tier          one Regular defensive + one Regular points-family + one demon (+ fills from core)
Within a composition, slip k on a day = the k-th best distinct slip by summed edge score (cap 1..10).

Output: nba_score.slip_engine_slips (one row per slip: day, season, phase, composition, size, structure, k,
  legs_json, hits, payout, stake=1, profit, same_game, same_team, teams) and nba_score.slip_engine_legs
  (one row per leg in slip). Report: a printed leaderboard by weaker-season ROI.

Env: DATABASE_URL, SE_CAP (10), SE_SIZES (2,3,4,5,6).
"""
import os
import json
import itertools
from collections import defaultdict

import psycopg

CAP = int(os.environ.get('SE_CAP', '10'))
SIZES = [int(x) for x in os.environ.get('SE_SIZES', '2,3,4,5,6').split(',')]

POWER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEX = {(2, 2): 2.0, (2, 1): 0.5, (3, 3): 3.0, (3, 2): 1.0, (4, 4): 6.0, (4, 3): 1.5,
        (5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4, (6, 6): 25.0, (6, 5): 2.0, (6, 4): 0.4}


def compress(p):
    return p if p <= 9.1 else 9.1 * (p / 9.1) ** 0.857


# certified cells: (prop, tier, side, rank, n_band, edge = certified 2025-26 p.m)
CELLS = {
    'steals_R_U':    ('steals', 'R', 'Under', 'final_score', 2, 0.691),
    'steals_R':      ('steals', 'R', 'both', 'final_score', 3, 0.654),
    'turnovers_R':   ('turnovers', 'R', 'both', 'final_score', 3, 0.633),
    'stocks_R':      ('stocks', 'R', 'both', 'final_score', 5, 0.613),
    'pts_ast_R':     ('pts_ast', 'R', 'both', 'baseline_hp', 3, 0.611),
    'points_R':      ('points', 'R', 'both', 'final_score', 5, 0.608),
    'pra_R_U':       ('pra', 'R', 'Under', 'baseline_hp', 2, 0.640),
    'blocks_R':      ('blocks', 'R', 'both', 'final_score', 2, 0.595),
    'pts_reb_R':     ('pts_reb', 'R', 'both', 'final_score', 5, 0.576),
    'rebounds_R':    ('rebounds', 'R', 'both', 'baseline_hp', 5, 0.574),
    'threes_D1':     ('threes_made', 'D1', 'Over', 'final_score', 2, 0.631),
    'assists_D1':    ('assists', 'D1', 'Over', 'final_score', 2, 0.588),
    'rebounds_D3':   ('rebounds', 'D3', 'Over', 'final_score', 3, 0.606),
    'goblin':        (None, 'G', 'Over', 'final_hp', 1, 0.560),   # extender: points-family G1/G2 top-1
}
CORE = ['turnovers_R', 'stocks_R', 'steals_R', 'rebounds_R', 'threes_D1', 'assists_D1']
REGULAR = ['steals_R_U', 'steals_R', 'turnovers_R', 'stocks_R', 'pts_ast_R', 'points_R', 'pra_R_U', 'blocks_R', 'pts_reb_R', 'rebounds_R']
DEMONS = ['threes_D1', 'assists_D1', 'rebounds_D3']
DEFENSIVE = ['steals_R_U', 'steals_R', 'turnovers_R', 'stocks_R', 'blocks_R']
POINTSFAM = ['points_R', 'pts_ast_R', 'pra_R_U', 'pts_reb_R']

LEG_SQL = """
SELECT l.rank_key, l.season, l.game_date, l.player, l.prop, l.tier, l.side, l.line, l.factor, l.hit, l.n_rank, l.score,
       pu.team_id, pu.event_id
FROM nba_score.tier_map_legs l
JOIN nba_market.prop_universe pu ON pu.game_date=l.game_date AND pu.player=l.player AND pu.prop=l.prop AND pu.side=l.side AND pu.line=l.line AND pu.line_source='real'
WHERE (l.tier='R' AND l.prop IN ('steals','turnovers','stocks','pts_ast','points','pra','blocks','pts_reb','rebounds'))
   OR (l.tier='D1' AND l.prop IN ('threes_made','assists'))
   OR (l.tier='D3' AND l.prop='rebounds')
   OR (l.tier IN ('G1','G2') AND l.prop IN ('points','pra','pts_ast','pts_reb') AND l.rank_key='final_hp')
"""


def phase_of(season, d, bounds):
    s0, s1 = bounds[season]
    if (d - s0).days <= 30:
        return 'early'
    if (s1 - d).days <= 21:
        return 'late'
    return 'mid'


def eligible_legs(day_rows):
    """day_rows: all rows for one day. Returns {cell_name: [leg dict, ...]} ordered by cell rank."""
    out = defaultdict(list)
    for name, (prop, tier, side, rank, nband, edge) in CELLS.items():
        if name == 'goblin':
            cand = [r for r in day_rows if r['tier'] in ('G1', 'G2') and r['rank_key'] == 'final_hp']
            # top-1 per prop, then best score overall
            best = {}
            for r in cand:
                if r['n_rank'] == 1 and (r['prop'] not in best or r['score'] > best[r['prop']]['score']):
                    best[r['prop']] = r
            legs = sorted(best.values(), key=lambda r: -r['score'])
        else:
            legs = [r for r in day_rows if r['prop'] == prop and r['tier'] == tier and r['rank_key'] == rank
                    and (side == 'both' or r['side'] == side)]
            # n_rank was assigned across both sides; a side-only cell must be re-ranked within its side by score,
            # which is exactly how cand_certified ranked it
            legs.sort(key=lambda r: (-r['score'], r['player']))
            legs = legs[:nband]
        for r in legs:
            r2 = dict(r); r2['cell'] = name; r2['edge'] = edge
            out[name].append(r2)
    return out


def valid(slip):
    players = {l['player'] for l in slip}
    if len(players) < len(slip):
        return False
    teams = {l['team_id'] for l in slip}
    return len(teams) >= 2


def grade(slip, structure):
    k = len(slip)
    hits = sum(l['hit'] for l in slip)
    fprod = 1.0
    for l in slip:
        fprod *= l['factor']
    if structure == 'power':
        base = POWER[k] if hits == k else 0.0
    else:
        base = FLEX.get((k, hits), 0.0)
    payout = compress(base * fprod) if base > 0 else 0.0
    return hits, payout


def candidates_for(comp, pool):
    """Return the ordered candidate leg list for a composition (before size/validity)."""
    def merged(cells, per_cell=None):
        legs = []
        for c in cells:
            legs.extend(pool.get(c, [])[:per_cell] if per_cell else pool.get(c, []))
        return sorted(legs, key=lambda l: (-l['edge'], l['n_rank']))
    if comp.startswith('single:'):
        return pool.get(comp[7:], [])
    if comp == 'core':
        return merged(CORE)
    if comp == 'regular':
        return merged(REGULAR)
    if comp == 'best':
        return merged(REGULAR + DEMONS)
    if comp.startswith('weighted:'):
        c = comp[9:]
        return pool.get(c, [])[:2] + [l for l in merged(CORE) if l['cell'] != c]
    if comp == 'demon':
        return merged(DEMONS)
    if comp == 'mixed_tier':
        return merged(DEFENSIVE)[:2] + merged(POINTSFAM)[:2] + merged(DEMONS)[:1] + merged(CORE)
    if comp == 'core+goblin' or comp == 'core+demon':
        return merged(CORE)
    return []


def build_day_slips(pool, comp, size, structure, cap):
    """Enumerate valid slips of `size` for the composition, ranked by summed edge; return top `cap` distinct slips."""
    base_legs = candidates_for(comp, pool)
    extender = None
    if comp == 'core+goblin':
        g = pool.get('goblin', [])
        if not g:
            return []
        extender = g[0]
    if comp == 'core+demon':
        d = sorted(pool.get('threes_D1', []) + pool.get('assists_D1', []), key=lambda l: (-l['edge'], l['n_rank']))
        if not d:
            return []
        extender = d[0]
    # dedupe by player, keep best
    seen, legs = set(), []
    for l in base_legs:
        if l['player'] in seen or (extender and l['player'] == extender['player']):
            continue
        seen.add(l['player']); legs.append(l)
    need = size - (1 if extender else 0)
    if need < 1 or len(legs) < need:
        return []
    legs = legs[:min(len(legs), 12)]   # bound the combinatorics to the 12 best legs
    slips = []
    for combo in itertools.combinations(legs, need):
        s = list(combo) + ([extender] if extender else [])
        if not valid(s):
            continue
        slips.append((sum(l['edge'] for l in s), s))
    slips.sort(key=lambda x: -x[0])
    return [s for _, s in slips[:cap]]


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.slip_engine_slips (
        game_date date, season text, phase text, composition text, size int, structure text, k int,
        legs_json jsonb, hits int, payout double precision, stake double precision, profit double precision,
        same_game int, same_team int, teams int, built_at timestamptz DEFAULT now())""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.slip_engine_legs (
        game_date date, composition text, size int, structure text, k int, cell text, player text, prop text, tier text,
        side text, line numeric, factor double precision, hit int, built_at timestamptz DEFAULT now())""")
    conn.execute("DELETE FROM nba_score.slip_engine_slips")
    conn.execute("DELETE FROM nba_score.slip_engine_legs")
    conn.commit()

    cols = None
    days = defaultdict(list)
    with conn.cursor(name='legs') as cur:
        cur.itersize = 50000
        cur.execute(LEG_SQL)
        cols = [d.name for d in cur.description]
        for row in cur:
            r = dict(zip(cols, row))
            days[r['game_date']].append(r)
    print(f"  {sum(len(v) for v in days.values()):,} candidate legs over {len(days)} days", flush=True)
    bounds = {}
    for d, rows in days.items():
        s = rows[0]['season']
        lo, hi = bounds.get(s, (d, d))
        bounds[s] = (min(lo, d), max(hi, d))

    comps = (['core', 'regular', 'best', 'demon', 'mixed_tier', 'core+goblin', 'core+demon']
             + [f'single:{c}' for c in CELLS if c != 'goblin'] + [f'weighted:{c}' for c in CORE])
    slip_rows, leg_rows = [], []
    for d in sorted(days):
        rows = days[d]
        season = rows[0]['season']
        ph = phase_of(season, d, bounds)
        pool = eligible_legs(rows)
        for comp in comps:
            for size in SIZES:
                for structure in ('power', 'flex'):
                    for k, slip in enumerate(build_day_slips(pool, comp, size, structure, CAP), start=1):
                        hits, payout = grade(slip, structure)
                        games = [l['event_id'] for l in slip]
                        teams = [l['team_id'] for l in slip]
                        sg = len(games) - len(set(games))
                        st = len(teams) - len(set(teams))
                        slip_rows.append((d, season, ph, comp, size, structure, k,
                                          json.dumps([{'cell': l['cell'], 'player': l['player'], 'prop': l['prop'], 'tier': l['tier'],
                                                       'side': l['side'], 'line': float(l['line']), 'factor': l['factor'], 'hit': l['hit']} for l in slip]),
                                          hits, payout, 1.0, payout - 1.0, sg, st, len(set(teams))))
                        for l in slip:
                            leg_rows.append((d, comp, size, structure, k, l['cell'], l['player'], l['prop'], l['tier'], l['side'], l['line'], l['factor'], l['hit']))
        if len(slip_rows) >= 200000:
            flush(conn, slip_rows, leg_rows); slip_rows, leg_rows = [], []
    flush(conn, slip_rows, leg_rows)
    n = conn.execute("SELECT count(*) FROM nba_score.slip_engine_slips").fetchone()[0]
    print(f"  {n:,} real slips persisted", flush=True)
    report(conn)
    conn.close()


def flush(conn, slip_rows, leg_rows):
    with conn.cursor() as c:
        c.executemany("""INSERT INTO nba_score.slip_engine_slips (game_date, season, phase, composition, size, structure, k, legs_json, hits, payout, stake, profit, same_game, same_team, teams)
                         VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", slip_rows)
        c.executemany("""INSERT INTO nba_score.slip_engine_legs (game_date, composition, size, structure, k, cell, player, prop, tier, side, line, factor, hit)
                         VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", leg_rows)
    conn.commit()


def report(conn):
    rows = conn.execute("""
        WITH s AS (SELECT composition, size, structure, season, k<=1 AS cap1, profit, hits=size AS full, hits>0 AND hits<size AS partial, payout>1 AS won
                   FROM nba_score.slip_engine_slips WHERE k<=3)
        SELECT composition, size, structure,
          round(avg(profit) FILTER (WHERE season='2024-25' AND cap1)::numeric,3) roi_s1_cap1,
          round(avg(profit) FILTER (WHERE season='2025-26' AND cap1)::numeric,3) roi_s2_cap1,
          round(avg(profit) FILTER (WHERE season='2025-26')::numeric,3) roi_s2_cap3,
          count(*) FILTER (WHERE season='2025-26' AND cap1) slips_s2,
          round(100.0*count(*) FILTER (WHERE season='2025-26' AND cap1 AND full)/nullif(count(*) FILTER (WHERE season='2025-26' AND cap1),0),0) full_pct,
          round(100.0*count(*) FILTER (WHERE season='2025-26' AND cap1 AND won)/nullif(count(*) FILTER (WHERE season='2025-26' AND cap1),0),0) won_pct
        FROM s GROUP BY 1,2,3
        HAVING count(*) FILTER (WHERE season='2024-25' AND cap1) >= 40 AND count(*) FILTER (WHERE season='2025-26' AND cap1) >= 40
        ORDER BY least(avg(profit) FILTER (WHERE season='2024-25' AND cap1), avg(profit) FILTER (WHERE season='2025-26' AND cap1)) DESC NULLS LAST
        LIMIT 40""").fetchall()
    print("\n== TOP 40 (cap-1) by WEAKER-season ROI: composition | size | structure | ROI 24-25 | ROI 25-26 | ROI 25-26 cap3 | slips | full% | won% ==", flush=True)
    for r in rows:
        print("  " + " | ".join(str(x) for x in r), flush=True)


if __name__ == "__main__":
    main()
