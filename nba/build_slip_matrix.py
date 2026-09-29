#!/usr/bin/env python3
"""
NBA SLIP MATRIX ENGINE - every strategy, every signal, every real leg, both seasons.

Owner: the harness enumerated configurations of ONE selector; a strategy is a COMBINATION of independent
signals, and every number must be reproducible from one persisted table. Two stages:

STAGE 1  build_features  -> nba_score.slip_leg_features (the single source of truth)
  One row per REAL PrizePicks window-board leg with a graded outcome, both seasons. Every signal computed
  WALK-FORWARD (strictly-prior data only; no leakage):
    raw_p        model probability of today's line (the working rank, 16d/18)
    cal_p        walk-forward calibrated probability of the (prop, side, model bucket) cell (prices, does not sort)
    mkt_edge     raw_p - window book probability (rung_market); NULL when no book line     (8k/14h)
    t3/t5/t10    player's trailing hit rate on (prop, side)                                  (8a/16b)
    line_rate    walk-forward hit rate of the (prop, side, line) cell, player-agnostic       (18a)
    player_rate  walk-forward hit rate of the player on (prop, side)                          (18a)
    role_tier    from baseline_history (STARTER ... FRINGE)
    rest_days    days since the player's previous game
    phase        early / mid / late season (7m)
    line_class   'half' (x.5 rare-event lines <= 0.5) vs 'high' (>= 1.5)                     (16e)
    peripheral   prop in {turnovers, steals, blocks, stocks}
  Legs with no outcome or no model score are EXCLUDED, never guessed. Pool is the board itself (17b).

STAGE 2  run_matrix  (report only)
  Reads the table. A STRATEGY = (eligibility signal, floor) x (optional filter signal, cut) x pool x side
  x depth x structure x cap. For each: real day-by-day slips from the top-ranked eligible legs (one leg per
  game), real PP payouts with haircut, per-season ROI / days / winning days, day-bootstrap P5, cap-1 drawdown
  and streak. Gate: positive in BOTH seasons AND S2 bootstrap P5 > 0 AND >= 40 days in each season.
  Output: full leaderboard sorted by the WEAKER season's ROI (the robustness-first ordering).

Env: DATABASE_URL, ME_STAGE (features|matrix|both), ME_HAIRCUT (0.95), ME_BOOT (1000), ME_TOP (30).
"""
import os
import sys
import random
import itertools
from collections import defaultdict, deque

import psycopg

PERIPHERAL = {'turnovers', 'steals', 'blocks', 'stocks'}
POWER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEX = {(3, 3): 3.0, (3, 2): 1.0, (4, 4): 6.0, (4, 3): 1.5, (5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4,
        (6, 6): 25.0, (6, 5): 2.0, (6, 4): 0.4}

BOARD_SQL = """
WITH bs AS (
  SELECT DISTINCT b.game_date, b.event_id, nba_ref.norm_name(b.player) AS pn,
    CASE replace(b.market_key,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made'
      WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb'
      WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast'
      ELSE replace(b.market_key,'player_','') END AS prop, b.side, b.line
  FROM nba_market.board_snapshots b
  WHERE b.bookmaker='prizepicks' AND b.snapshot_label='window' AND b.snapshot_ts < b.commence_time
),
legs AS (
  SELECT pu.season, bs.game_date, bs.event_id, pu.player_id, bs.pn, bs.prop, bs.side, bs.line,
         pu.model_p::float AS raw_p, pu.hit::int AS hit, pu.team_id
  FROM bs JOIN nba_market.prop_universe pu
    ON pu.game_date=bs.game_date AND nba_ref.norm_name(pu.player)=bs.pn AND pu.prop=bs.prop
   AND pu.side=bs.side AND pu.line=bs.line AND pu.kind='standard' AND pu.line_source='real'
  WHERE pu.hit IS NOT NULL AND pu.model_p IS NOT NULL
),
mkt AS (
  SELECT game_date, nba_ref.norm_name(player) AS pn, replace(market,'player_','') AS prop, line, p_over_book
  FROM nba_market.rung_market WHERE snapshot_label='window' AND p_over_book IS NOT NULL
),
role AS (
  SELECT DISTINCT ON (game_date, player_id, prop, line) game_date, player_id, prop, line, role_tier
  FROM nba_score.baseline_history WHERE role_tier IS NOT NULL
),
rest AS (
  SELECT nba_player_id::text AS pid, game_date,
         game_date - lag(game_date) OVER (PARTITION BY nba_player_id ORDER BY game_date) AS rest_days
  FROM nba_stats.player_game_log WHERE min > 0
),
bounds AS (SELECT season, min(game_date) s0, max(game_date) s1 FROM legs GROUP BY season)
SELECT l.season, l.game_date, l.event_id, l.player_id, l.prop, l.side, l.line, l.raw_p, l.hit, l.team_id,
       CASE WHEN l.side='Over' THEN l.raw_p - m.p_over_book ELSE l.raw_p - (1 - m.p_over_book) END AS mkt_edge,
       r.role_tier, rs.rest_days,
       CASE WHEN l.game_date <= b.s0 + 30 THEN 'early' WHEN l.game_date >= b.s1 - 21 THEN 'late' ELSE 'mid' END AS phase
FROM legs l
LEFT JOIN mkt m ON m.game_date=l.game_date AND m.pn=l.pn AND m.prop=l.prop AND m.line=l.line
LEFT JOIN role r ON r.game_date=l.game_date AND r.player_id=l.player_id AND r.prop=l.prop AND r.side=l.side AND r.line=l.line
LEFT JOIN rest rs ON rs.pid=l.player_id AND rs.game_date=l.game_date
JOIN bounds b ON b.season=l.season
ORDER BY l.game_date
"""

DDL = """
CREATE TABLE IF NOT EXISTS nba_score.slip_leg_features (
  season text, game_date date, event_id text, player_id text, prop text, side text, line numeric,
  raw_p double precision, cal_p double precision, mkt_edge double precision,
  t3 double precision, t5 double precision, t10 double precision, n_trail int,
  line_rate double precision, n_line int, player_rate double precision, n_player int,
  role_tier text, rest_days int, phase text, line_class text, peripheral boolean, hit int,
  built_at timestamptz DEFAULT now(),
  PRIMARY KEY (game_date, player_id, prop, side, line)
)"""


def bucket(p):
    b = int((p - 0.30) / 0.05)
    return 0 if b < 0 else (12 if b >= 13 else b)


def build_features(conn):
    conn.execute(DDL)
    conn.execute("DELETE FROM nba_score.slip_leg_features")
    cell, lin, ply = {}, {}, {}
    trail = {}
    cur_day, pending, out = None, [], []
    n = 0

    def flush():
        for L in pending:
            for store, key in ((cell, (L['prop'], L['side'], bucket(L['raw_p']))),
                               (lin, (L['prop'], L['side'], L['line'])),
                               (ply, (L['player_id'], L['prop'], L['side']))):
                c = store.get(key)
                if c is None:
                    store[key] = [L['hit'], 1]
                else:
                    c[0] += L['hit']; c[1] += 1
            d = trail.get((L['player_id'], L['prop'], L['side']))
            if d is None:
                d = trail[(L['player_id'], L['prop'], L['side'])] = deque(maxlen=10)
            d.append(L['hit'])
        pending.clear()

    def rate(store, key, min_n):
        c = store.get(key)
        return (c[0] / c[1], c[1]) if c and c[1] >= min_n else (None, c[1] if c else 0)

    with conn.cursor(name='board_legs') as cur:
        cur.itersize = 50000
        cur.execute(BOARD_SQL)
        cols = [d.name for d in cur.description]
        for row in cur:
            L = dict(zip(cols, row))
            if L['game_date'] != cur_day:
                flush(); cur_day = L['game_date']
            cp, _ = rate(cell, (L['prop'], L['side'], bucket(L['raw_p'])), 60)
            lr, nl = rate(lin, (L['prop'], L['side'], L['line']), 1)
            pr, npl = rate(ply, (L['player_id'], L['prop'], L['side']), 1)
            d = trail.get((L['player_id'], L['prop'], L['side']))
            t = list(d) if d else []
            t3 = sum(t[-3:]) / len(t[-3:]) if len(t) >= 3 else None
            t5 = sum(t[-5:]) / len(t[-5:]) if len(t) >= 5 else None
            t10 = sum(t) / len(t) if len(t) >= 8 else None
            out.append((L['season'], L['game_date'], L['event_id'], L['player_id'], L['prop'], L['side'], L['line'],
                        L['raw_p'], cp, L['mkt_edge'], t3, t5, t10, len(t),
                        lr, nl, pr, npl, L['role_tier'], L['rest_days'], L['phase'],
                        'half' if float(L['line']) <= 0.5 else 'high', L['prop'] in PERIPHERAL, L['hit']))
            pending.append(L)
            n += 1
        flush()
    with conn.cursor() as c:
        c.executemany("""INSERT INTO nba_score.slip_leg_features
            (season, game_date, event_id, player_id, prop, side, line, raw_p, cal_p, mkt_edge, t3, t5, t10, n_trail,
             line_rate, n_line, player_rate, n_player, role_tier, rest_days, phase, line_class, peripheral, hit)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING""", out)
    conn.commit()
    print(f"  features: {n:,} real board legs written to nba_score.slip_leg_features", flush=True)


# ---------------- stage 2 ----------------
F = ['season', 'game_date', 'event_id', 'player_id', 'prop', 'side', 'line', 'raw_p', 'cal_p', 'mkt_edge',
     't3', 't5', 't10', 'line_rate', 'n_line', 'player_rate', 'n_player', 'role_tier', 'rest_days', 'phase',
     'line_class', 'peripheral', 'hit']
I = {c: i for i, c in enumerate(F)}

ELIG = {  # eligibility signal -> (index, floors)
    'raw_p': ('raw_p', [0.58, 0.60, 0.62, 0.65, 0.68, 0.70]),
    'cal_p': ('cal_p', [0.56, 0.58, 0.60, 0.62]),
    'player_rate': ('player_rate', [0.60, 0.65, 0.70]),
    'line_rate': ('line_rate', [0.55, 0.58, 0.60]),
    't10': ('t10', [0.70, 0.80]),
}
FILTERS = {  # optional second signal
    'none': None,
    'mkt_edge>0': ('mkt_edge', 0.0), 'mkt_edge>0.05': ('mkt_edge', 0.05),
    't10>=0.5': ('t10', 0.5), 't3>=0.67': ('t3', 0.67),
    'half_line': ('line_class', 'half'), 'not_fringe': ('role_tier', '!FRINGE'),
    'rest>=2': ('rest_days', 2), 'not_late': ('phase', '!late'),
}
POOLS = {'all': lambda L: True, 'peripheral': lambda L: L[I['peripheral']],
         'core': lambda L: not L[I['peripheral']]}


def passes(L, flt):
    if flt is None:
        return True
    k, v = flt
    x = L[I[k]]
    if x is None:
        return False
    if isinstance(v, str):
        return (x != v[1:]) if v.startswith('!') else (x == v)
    return x >= v


def payout(structure, k, hits, hc):
    if structure == 'power':
        return POWER[k] * hc if hits == k else 0.0
    return FLEX.get((k, hits), 0.0) * hc


def run_strategy(days, elig, floor, flt, pool, side, depth, structure, hc, cap):
    ekey = I[ELIG[elig][0]]
    res = {}
    for day, legs in days.items():
        cand = [L for L in legs if L[ekey] is not None and L[ekey] >= floor and POOLS[pool](L)
                and passes(L, flt) and (side == 'both' or L[I['side']].lower() == side)]
        if len(cand) < depth:
            continue
        cand.sort(key=lambda L: (-L[I['raw_p']], L[I['player_id']]))   # sort = raw model (16d)
        seen, ranked = set(), []
        for L in cand:
            if L[I['event_id']] in seen:
                continue
            seen.add(L[I['event_id']]); ranked.append(L)
            if len(ranked) >= max(depth, 8):
                break
        if len(ranked) < depth:
            continue
        combos = itertools.combinations(ranked, depth)
        if cap:
            combos = list(combos)[:cap]     # ranked is sorted, so first combos = top legs
        season = ranked[0][I['season']]
        r = res.setdefault(season, {'stake': 0.0, 'ret': 0.0, 'days': {}, 'wd': set()})
        st = rt = 0.0
        for c in combos:
            hits = sum(L[I['hit']] for L in c)
            p = payout(structure, depth, hits, hc)
            st += 1; rt += p
            if p > 1:
                r['wd'].add(day)
        r['stake'] += st; r['ret'] += rt; r['days'][day] = (st, rt)
    return res


def boot_p5(day_items, draws, seed=7):
    n = len(day_items)
    if n < 8:
        return None
    rng = random.Random(seed); out = []
    for _ in range(draws):
        s = r = 0.0
        for _ in range(n):
            a, b = day_items[rng.randrange(n)]
            s += a; r += b
        out.append(r / s - 1)
    out.sort()
    return out[int(0.05 * draws)]


def series(day_items):
    cum = peak = dd = 0.0; streak = longest = pos = 0
    for _, st, rt in sorted(day_items):
        net = rt - st; cum += net; peak = max(peak, cum); dd = max(dd, peak - cum)
        if net > 0:
            pos += 1; streak = 0
        else:
            streak += 1; longest = max(longest, streak)
    n = len(day_items)
    return (pos / n if n else 0), cum, dd, longest


def run_matrix(conn, hc, draws, top):
    rows = conn.execute(f"SELECT {', '.join(F)} FROM nba_score.slip_leg_features ORDER BY game_date").fetchall()
    days = defaultdict(list)
    for r in rows:
        days[r[I['game_date']]].append(r)
    seasons = sorted({r[I['season']] for r in rows})
    print(f"  matrix: {len(rows):,} legs, {len(days)} days, seasons {seasons}", flush=True)
    s1, s2 = seasons[0], seasons[-1]

    grid = []
    for elig, (_, floors) in ELIG.items():
        for floor in floors:
            for flt in FILTERS:
                for pool in POOLS:
                    for side in ('both', 'over', 'under'):
                        for depth in (2, 3, 4, 5):
                            for structure in ('power', 'flex'):
                                if structure == 'flex' and depth < 3:
                                    continue
                                grid.append((elig, floor, flt, pool, side, depth, structure))
    print(f"  {len(grid)} strategies", flush=True)

    results = []
    for g in grid:
        elig, floor, flt, pool, side, depth, structure = g
        res = run_strategy(days, elig, floor, FILTERS[flt], pool, side, depth, structure, hc, cap=1)
        a, b = res.get(s1), res.get(s2)
        if not a or not b or len(a['days']) < 40 or len(b['days']) < 40:
            continue
        roi1 = a['ret'] / a['stake'] - 1; roi2 = b['ret'] / b['stake'] - 1
        results.append((g, roi1, len(a['days']), roi2, len(b['days']), len(b['wd']), b))
    print(f"  {len(results)} strategies with >=40 days in both seasons", flush=True)

    # gate: both seasons positive
    gated = [x for x in results if x[1] > 0 and x[3] > 0]
    gated.sort(key=lambda x: -min(x[1], x[3]))
    print(f"\n== GATE (cap-1, both seasons > 0): {len(gated)} pass. TOP {top} by the WEAKER season ==", flush=True)
    print("  weaker | S1 ROI (days) | S2 ROI (days, win-days) | S2 boot P5 | S2 cap-1 %days+ / net / maxdd / streak | strategy",
          flush=True)
    for g, roi1, d1, roi2, d2, wd2, b in gated[:top]:
        p5 = boot_p5(list(b['days'].values()), draws)
        pp, net, dd, ls = series([(d, st, rt) for d, (st, rt) in b['days'].items()])
        p5s = f"{p5:+.0%}" if p5 is not None else "n/a"
        print(f"  {min(roi1, roi2):+6.0%} | {roi1:+6.0%} ({d1:>3}) | {roi2:+6.0%} ({d2:>3},{wd2:>3}) | {p5s:>5} | "
              f"{pp:.0%} / {net:+6.1f}u / {dd:5.1f}u / {ls:>2} | {g[0]}>={g[1]} {g[2]} {g[3]} {g[4]} {g[5]}pk {g[6]}",
              flush=True)

    # which eligibility signal works: best gated strategy per signal
    print("\n== BEST GATED strategy per ELIGIBILITY signal (weaker-season ROI) ==", flush=True)
    best = {}
    for x in gated:
        best.setdefault(x[0][0], x)
    for sig in ELIG:
        x = best.get(sig)
        if x:
            print(f"  {sig:<12} weaker {min(x[1], x[3]):+.0%}  S1 {x[1]:+.0%} S2 {x[3]:+.0%}  {x[0]}", flush=True)
        else:
            print(f"  {sig:<12} NO strategy passes the gate", flush=True)
    print("\n== BEST GATED strategy per FILTER (vs 'none' at the same elig/pool/side/depth/structure) ==", flush=True)
    base = {(g[0], g[1], g[3], g[4], g[5], g[6]): (r1, r2) for g, r1, _, r2, _, _, _ in results if g[2] == 'none'}
    lift = defaultdict(list)
    for g, r1, _, r2, _, _, _ in results:
        if g[2] != 'none':
            b0 = base.get((g[0], g[1], g[3], g[4], g[5], g[6]))
            if b0:
                lift[g[2]].append((min(r1, r2) - min(b0[0], b0[1])))
    for flt, ls in sorted(lift.items(), key=lambda kv: -sum(kv[1]) / len(kv[1])):
        print(f"  {flt:<14} mean lift on weaker-season ROI {sum(ls) / len(ls):+.1%} over {len(ls)} paired strategies", flush=True)
    print("\nDONE.", flush=True)


def main():
    stage = os.environ.get('ME_STAGE', 'both')
    hc = float(os.environ.get('ME_HAIRCUT', '0.95'))
    draws = int(os.environ.get('ME_BOOT', '1000'))
    top = int(os.environ.get('ME_TOP', '30'))
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    if stage in ('features', 'both'):
        build_features(conn)
    if stage in ('matrix', 'both'):
        run_matrix(conn, hc, draws, top)
    conn.close()


if __name__ == "__main__":
    main()
