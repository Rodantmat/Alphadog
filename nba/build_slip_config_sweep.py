#!/usr/bin/env python3
"""
NBA SLIP CONFIG-SWEEP HARNESS v2 - exhaustive REAL-slip backtest.
Owner mandate: real legs, real slips, real outcomes, real payouts. NO proportionals, NO extrapolation.
Every slip is an actual combination of actual graded legs on an actual day; graded on actual hits;
priced with the actual PrizePicks payout table (Power tiers + Flex partial tiers), haircut applied.

WHAT CHANGED vs v1 (found by re-reading v1 before running it):
  * v1 calibrated from PRIOR SEASONS only -> every 2024-25 leg had no prior season and silently dropped out,
    so a run would have tested 2025-26 alone. v2 calibrates DAILY WALK-FORWARD: a leg on day D is priced with
    the realized hit rate of its (prop, side, model_p bucket) over ALL graded legs on days STRICTLY BEFORE D
    (both seasons, no leakage, warm-up legs with n < CS_MIN_N are skipped, never guessed).
  * two ranking drivers: cal_p, and blend = cal_p + 0.20*(trail10 - 0.5) (trail10 = player's own as-of hit rate
    on that prop+side over the last 10 graded legs; needs >=5).  Eligibility threshold always applies to cal_p.
  * S1->S2 SELECTION PROTOCOL: with ~1,500 configs the best ones are flattered by selection luck (winner's
    curse). Configs are RANKED ON season 1 and SCORED ON season 2; the report prints the S2 ROI of the top-S1
    configs against the mean S2 ROI of ALL configs - the honest overfit diagnostic.
  * per-config: winning-DAY count (variance-mirage guard, cf. the 6-pick +427% that rested on 3 days),
    per-month positivity share, tie-break band (two deterministic orders, Rule B0c), cap sweep on survivors.

Config space: driver x threshold(0.56..0.66 step .01) x cellset(all|peripheral|points) x side(over|under|both)
              x depth(2..6) x structure(power|flex, flex needs depth>=3).  One leg per game (cross-game).
Env: DATABASE_URL, CS_HAIRCUT (0.95), CS_MIN_N (60), CS_FLOOR (0.56), CS_SEASONS (blank=all).
REPORT ONLY: reads prop_universe, writes nothing.
"""
import os
import sys
import itertools
from collections import defaultdict, deque

import psycopg

# REAL-LINE props only (prop_universe.line_source='real', method='archive').
# ftm/fta/fga/fgm/fg3a (points-scaled), oreb/dreb (rebounds-share), fantasy_score (fs-reconstruction) are
# SIMULATED lines - never offered on a board - and are EXCLUDED (owner rule: real legs, no invented lines).
PERIPHERAL = {'turnovers', 'stocks', 'steals', 'blocks'}
POINTS_FAM = {'points', 'pts_reb', 'pts_ast', 'pra'}
OTHER_CORE = {'rebounds', 'assists', 'reb_ast', 'threes_made'}
POWER_TIER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEX = {  # matches nba_market.pp_flex_standard_payout (verified 7b)
    (3, 3): 3.0, (3, 2): 1.0,
    (4, 4): 6.0, (4, 3): 1.5,
    (5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4,
    (6, 6): 25.0, (6, 5): 2.0, (6, 4): 0.4,
}
NB = 13  # buckets over model_p 0.30..0.95, width 0.05 (same as width_bucket(model_p,0.30,0.95,13))

# leg tuple layout
EID, PID, PROP, SIDE, HIT, CAL, BLEND, SEASON = range(8)
DRIVERS = {'cal_p': CAL, 'blend': BLEND}


def bucket(p):
    b = int((p - 0.30) / 0.05)
    return 0 if b < 0 else (NB - 1 if b >= NB else b)


def build_pool(conn, seasons, min_n, floor):
    """Stream every graded standard leg in date order; price each with PRIOR-DAYS-ONLY calibration."""
    sql = """SELECT pu.season, pu.game_date, pu.event_id, pu.player_id, pu.prop, pu.side, pu.model_p, pu.hit::int
             FROM nba_market.prop_universe pu
             WHERE pu.kind='standard' AND pu.hit IS NOT NULL AND pu.model_p IS NOT NULL"""
    params = []
    if seasons:
        sql += " AND pu.season = ANY(%s)"
        params.append(seasons)
    sql += " ORDER BY pu.game_date"

    counts = {}                      # (prop,side,bucket) -> [hits, n]   (prior days only)
    recent = {}                      # (pid,prop,side) -> deque of last 10 hits (prior days only)
    pool = defaultdict(list)         # day -> [leg tuples]
    total = kept = 0
    cur_day = None
    day_updates = []                 # (ckey, rkey, h) applied AFTER the day is priced

    def flush():
        for ckey, rkey, h in day_updates:
            c = counts.get(ckey)
            if c is None:
                counts[ckey] = [h, 1]
            else:
                c[0] += h
                c[1] += 1
            d = recent.get(rkey)
            if d is None:
                d = recent[rkey] = deque(maxlen=10)
            d.append(h)
        day_updates.clear()

    with conn.cursor(name='sweep_legs') as cur:
        cur.itersize = 100000
        cur.execute(sql, params)
        for season, gdate, eid, pid, prop, side, mp, h in cur:
            if gdate != cur_day:
                flush()
                cur_day = gdate
            total += 1
            ckey = (prop, side, bucket(float(mp)))
            rkey = (pid, prop, side)
            c = counts.get(ckey)
            if c is not None and c[1] >= min_n:
                cal = c[0] / c[1]
                if cal >= floor:
                    d = recent.get(rkey)
                    if d is not None and len(d) >= 5:
                        blend = cal + 0.20 * (sum(d) / len(d) - 0.5)
                    else:
                        blend = cal
                    pool[gdate].append((eid, pid, prop, side, h, cal, blend, season))
                    kept += 1
            day_updates.append((ckey, rkey, h))
        flush()
    return pool, total, kept


def cell_ok(prop, cellset):
    if cellset == 'all':
        return True
    if cellset == 'peripheral':
        return prop in PERIPHERAL
    if cellset == 'points':
        return prop in POINTS_FAM
    return prop == cellset


def select_day(legs, thr, cellset, side, depth, drv, order):
    cand = [L for L in legs
            if L[CAL] >= thr and cell_ok(L[PROP], cellset) and (side == 'both' or L[SIDE].lower() == side)]
    if len(cand) < depth:
        return None
    cand.sort(key=lambda L: L[PID], reverse=(order == 'desc'))   # deterministic tie order
    cand.sort(key=lambda L: -L[drv])                              # stable: ties keep the order above
    seen, ranked = set(), []
    for L in cand:
        if L[EID] in seen:
            continue                                              # one leg per game = cross-game (fact 125)
        seen.add(L[EID])
        ranked.append(L)
        if len(ranked) >= max(depth, 8):
            break
    return ranked if len(ranked) >= depth else None


def payout(structure, k, hits, hc):
    if structure == 'power':
        return POWER_TIER[k] * hc if hits == k else 0.0
    return FLEX.get((k, hits), 0.0) * hc


def run_config(pool, thr, cellset, side, depth, structure, drv, order, hc, cap=None):
    stake = ret = 0.0
    slips = 0
    win_days = set()
    by_season = {}      # season -> [stake, ret, set(win days)]
    by_month = {}       # yyyy-mm -> [stake, ret]
    for day, legs in pool.items():
        ranked = select_day(legs, thr, cellset, side, depth, drv, order)
        if ranked is None:
            continue
        combos = itertools.combinations(ranked, depth)
        if cap:
            combos = sorted(combos, key=lambda c: -sum(L[drv] for L in c))[:cap]
        season = ranked[0][SEASON]
        ym = str(day)[:7]
        ss = by_season.setdefault(season, [0.0, 0.0, set()])
        mm = by_month.setdefault(ym, [0.0, 0.0])
        for combo in combos:
            hits = sum(L[HIT] for L in combo)
            r = payout(structure, depth, hits, hc)
            stake += 1.0; ret += r; slips += 1
            ss[0] += 1.0; ss[1] += r
            mm[0] += 1.0; mm[1] += r
            if r > 1.0:
                win_days.add(day); ss[2].add(day)
    if slips == 0:
        return None
    months_pos = sum(1 for s, r in by_month.values() if r / s - 1.0 > 0)
    return {
        'roi': ret / stake - 1.0, 'slips': slips, 'wd': len(win_days),
        'season': {k: (v[1] / v[0] - 1.0, int(v[0]), len(v[2])) for k, v in by_season.items()},
        'months_pos': months_pos, 'months': len(by_month),
    }


def main():
    seasons = [s.strip() for s in os.environ.get('CS_SEASONS', '').split(',') if s.strip()] or None
    hc = float(os.environ.get('CS_HAIRCUT', '0.95'))
    min_n = int(os.environ.get('CS_MIN_N', '60'))
    floor = float(os.environ.get('CS_FLOOR', '0.56'))
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    print(f"config-sweep v2: seasons={seasons or 'ALL'} haircut={hc} min_n={min_n} floor={floor}", flush=True)

    pool, total, kept = build_pool(conn, seasons, min_n, floor)
    conn.close()
    seasons_seen = sorted({L[SEASON] for legs in pool.values() for L in legs})
    print(f"  streamed {total:,} graded legs; {kept:,} priced (prior-days-only cal_p >= {floor}); "
          f"{len(pool)} slate-days; seasons={seasons_seen}", flush=True)
    if len(seasons_seen) < 2:
        print("  WARNING: <2 seasons priced - S1->S2 protocol unavailable", flush=True)
    s1, s2 = (seasons_seen[0], seasons_seen[-1]) if len(seasons_seen) >= 2 else (None, None)

    thresholds = [round(0.56 + 0.01 * i, 2) for i in range(11)]
    grid = list(itertools.product(DRIVERS.keys(), thresholds, ['all', 'peripheral', 'points'],
                                  ['over', 'under', 'both'], [2, 3, 4, 5, 6], ['power', 'flex']))
    results = []
    for drv_name, thr, cellset, side, depth, structure in grid:
        if structure == 'flex' and depth < 3:
            continue
        res = run_config(pool, thr, cellset, side, depth, structure, DRIVERS[drv_name], 'asc', hc)
        if res is None:
            continue
        results.append(((drv_name, thr, cellset, side, depth, structure), res))
    print(f"  {len(results)} configs produced slips (of {len(grid)} grid points)", flush=True)

    pos = [r for _, r in results if r['roi'] > 0]
    print(f"  ALL-config context: {len(pos)} of {len(results)} have ROI>0 pooled "
          f"(selection-bias context: the best of many is flattered)", flush=True)

    def fmt(cfg):
        d, t, c, s, k, st = cfg
        return f"{d:<5} thr{t:.2f} {c:<10} {s:<5} {k}pk {st}"

    # 1) pooled robust leaderboard
    robust = [(cfg, r) for cfg, r in results if r['wd'] >= 15 and r['slips'] >= 100]
    robust.sort(key=lambda x: -x[1]['roi'])
    print(f"\n== TOP 20 pooled (robust: >=15 winning days, >=100 slips; {len(robust)} qualify) ==", flush=True)
    for cfg, r in robust[:20]:
        print(f"  {r['roi']:>+7.1%} slips={r['slips']:>5} wdays={r['wd']:>3} "
              f"months+={r['months_pos']}/{r['months']}  {fmt(cfg)}", flush=True)

    # 2) S1 -> S2 selection protocol (the overfit diagnostic)
    if s1 and s2:
        def sroi(r, s):
            v = r['season'].get(s)
            return v if v else (None, 0, 0)
        cand = []
        for cfg, r in results:
            a = sroi(r, s1); b = sroi(r, s2)
            if a[0] is not None and b[0] is not None and a[1] >= 60 and a[2] >= 8 and b[1] >= 40:
                cand.append((cfg, a, b))
        cand.sort(key=lambda x: -x[1][0])
        all_s2 = [b[0] for _, _, b in cand]
        top = cand[:20]
        print(f"\n== S1->S2: rank on {s1}, score on {s2}  ({len(cand)} configs have data in both) ==", flush=True)
        print(f"  mean S2 ROI over ALL those configs : {sum(all_s2)/len(all_s2):+.1%}", flush=True)
        if top:
            print(f"  mean S2 ROI of the TOP-20 by S1     : {sum(b[0] for _, _, b in top)/len(top):+.1%}", flush=True)
            print(f"  share of TOP-20 with S2 ROI > 0     : {sum(1 for _, _, b in top if b[0] > 0)}/{len(top)}", flush=True)
        for cfg, a, b in top:
            print(f"  S1 {a[0]:>+7.1%} ({a[1]:>4} slips,{a[2]:>2}wd)  ->  S2 {b[0]:>+7.1%} ({b[1]:>4} slips,{b[2]:>2}wd)  {fmt(cfg)}",
                  flush=True)

    # 3) tie-break band + cap sweep on the survivors
    print("\n== SURVIVOR STRESS: tie-break band (asc/desc pid order) and cap sweep (max slips/day) ==", flush=True)
    for cfg, r in robust[:12]:
        d, t, c, s, k, st = cfg
        band = []
        for order in ('asc', 'desc'):
            rr = run_config(pool, t, c, s, k, st, DRIVERS[d], order, hc)
            band.append(rr['roi'] if rr else float('nan'))
        caps = []
        for cap in (1, 3, 5):
            rr = run_config(pool, t, c, s, k, st, DRIVERS[d], 'asc', hc, cap=cap)
            caps.append(f"cap{cap}:{rr['roi']:+.0%}" if rr else f"cap{cap}:n/a")
        print(f"  pooled {r['roi']:>+7.1%} | tie-break {min(band):+.1%}..{max(band):+.1%} | {' '.join(caps)} | {fmt(cfg)}",
              flush=True)

    # 4) best robust config per (depth, structure)
    print("\n== BEST ROBUST config per depth x structure ==", flush=True)
    seen = {}
    for cfg, r in robust:
        key = (cfg[4], cfg[5])
        if key not in seen:
            seen[key] = (cfg, r)
    for key in sorted(seen):
        cfg, r = seen[key]
        print(f"  {key[0]}pk {key[1]:<5} {r['roi']:>+7.1%} slips={r['slips']:>5} wdays={r['wd']:>3}  {fmt(cfg)}", flush=True)
    print("\nDONE (report only, nothing written).", flush=True)


if __name__ == "__main__":
    main()
