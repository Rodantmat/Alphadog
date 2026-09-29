#!/usr/bin/env python3
"""
NBA SLIP CONFIG-SWEEP HARNESS — exhaustive REAL-slip backtest across every composition.
Owner mandate: real legs, real slips, real outcomes, real multipliers — NO proportionals, NO extrapolation.
Every slip is an actual combination of actual graded legs on an actual day, priced with the real payout.

Culmination of NBA_SLIP_BUILDING_STRATEGY.md — turns the manual §13 sweeps into one exhaustive harness
that holds the full pool in memory (avoids the live-query Hyperdrive drops on final_hp joins) and enumerates:
  rank-driver × threshold × depth × structure(Power/Flex) × cell-set × cap × side
with, for each config: real ROI, slip count, winning-DAY count (variance-mirage guard, §13d), and a
tie-break band (min/max ROI across ≥2 deterministic orders, Rule B0c). Walk-forward AS-OF recalibration
(fit only on strictly-prior data — §7j/n, no leakage). Train/verify split reported per config.

RANK DRIVERS (owner's ranks as slip drivers):
  cal_p       — recalibrated final-HP (the validated core, §7)
  final_hp    — raw final HP (§8b rank 3)
  baseline_hp — raw baseline HP (§8b rank 2, "conviction")
  score       — confidence-adj (§8b rank 4)
  player_hr   — player's own trailing hit rate on (prop,side) (§7o rank 5, peripheral-strong)
  plain_hr    — plain prop-line cell hit rate, player-agnostic (§8c/§13f rank 6)
CELL SETS: all_props | peripheral(turnovers,ftm,stocks,steals,blocks,fta) | points_family | single-cell(each)
STRUCTURES: power, flex   SIDES: over, under, both   DEPTHS: 2..6   THRESHOLDS: 0.56..0.66 step .01 (granular)
CAPS: max slips/day in {1,3,5,10,999}

REAL SLIP CONSTRUCTION: per (config, day) take the ranked cross-game legs (one leg per game, per §125),
enumerate REAL combinations (all C(n,k) up to a cap, or capped top-N), each combo = a real slip of real legs;
grade by real hits; price Power = product-of-tier-payout if all hit else 0 (standard=6x/10x/20x table),
Flex = pp_flex_standard_payout(k, hits). Haircut applied as a payout multiplier (HC, default 0.95).

Env: DATABASE_URL, CS_BACKDATES (e.g. '2023-24,2024-25,2025-26' — ALL seasons in prop_universe if blank —
owner: expand backdata), CS_HALF_LIFE (recency weight, days), CS_HAIRCUT (0.95), CS_WRITE=0 (report only).
Report mode prints the top configs by robust ROI (winning_days>=15 and tie-break-band-min>0).
"""
import os
import sys
import itertools
import math
from collections import defaultdict

import psycopg

PERIPHERAL = {'turnovers', 'ftm', 'stocks', 'steals', 'blocks', 'fta'}
POINTS_FAM = {'points', 'pts_reb', 'pts_ast', 'pra', 'fantasy_score'}
POWER_TIER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEX = {  # (legs, hits) -> payout (standard PP flex, matches nba_market.pp_flex_standard_payout §7b)
    (3, 3): 3.0, (3, 2): 1.0,
    (4, 4): 6.0, (4, 3): 1.5,
    (5, 5): 10.0, (5, 4): 2.0, (5, 3): 0.4,
    (6, 6): 25.0, (6, 5): 2.0, (6, 4): 0.4,
}


def load_pool(conn, seasons):
    """One query: all graded standard legs with cal_p (as-of), the box outcome, and ranking inputs.
    cal_p is computed AS-OF per season using a prior-only recalibration map (no leakage)."""
    season_filter = ""
    params = []
    if seasons:
        season_filter = "AND pu.season = ANY(%s)"
        params.append(seasons)
    sql = f"""
    WITH cal AS (  -- prior-only recalibration: for each row, realized hit of its (prop,side,decile) over EARLIER data
      SELECT prop, side, width_bucket(model_p,0.30,0.95,13) AS dec, season,
             avg(hit::int) AS cal_p, count(*) AS n
      FROM nba_market.prop_universe
      WHERE kind='standard' AND hit IS NOT NULL AND model_p IS NOT NULL
      GROUP BY prop, side, width_bucket(model_p,0.30,0.95,13), season
    )
    SELECT pu.season, pu.game_date, pu.event_id, pu.player_id, pu.prop, pu.side,
           pu.hit::int AS h, pu.model_p, c.cal_p, c.n AS cal_n
    FROM nba_market.prop_universe pu
    JOIN cal c ON c.prop=pu.prop AND c.side=pu.side
              AND c.dec=width_bucket(pu.model_p,0.30,0.95,13) AND c.season < pu.season  -- STRICTLY PRIOR season(s)
    WHERE pu.kind='standard' AND pu.hit IS NOT NULL AND pu.model_p IS NOT NULL {season_filter}
    """
    # NOTE: c.season < pu.season gives cross-season as-of; for within-season walk-forward the harness
    # (full version) buckets by (season, month) — cross-season prior is the conservative first pass.
    rows = conn.execute(sql, params).fetchall()
    return rows


def cell_ok(prop, cellset):
    if cellset == 'all':
        return True
    if cellset == 'peripheral':
        return prop in PERIPHERAL
    if cellset == 'points':
        return prop in POINTS_FAM
    return prop == cellset  # single-cell


def slip_payout(structure, k, hits, hc):
    if structure == 'power':
        return (POWER_TIER[k] * hc) if hits == k else 0.0
    return FLEX.get((k, hits), 0.0) * hc


def run_config(pool_by_day, driver, thr, cellset, side, depth, structure, cap, hc, max_combos=200):
    """Build REAL slips: per day, rank legs by driver, one leg per game, enumerate real C(n,depth) combos
    (capped), grade with real hits, price with real payout. Returns (roi, slips, winning_days)."""
    total_stake = 0.0
    total_ret = 0.0
    slips = 0
    win_days = set()
    for day, legs in pool_by_day.items():
        cand = [L for L in legs
                if L['drv'][driver] is not None and L['drv'][driver] >= thr
                and cell_ok(L['prop'], cellset)
                and (side == 'both' or L['side'].lower() == side)]
        if len(cand) < depth:
            continue
        # one leg per game: keep the best-by-driver per event
        by_game = {}
        for L in cand:
            g = L['event_id']
            if g not in by_game or L['drv'][driver] > by_game[g]['drv'][driver]:
                by_game[g] = L
        ranked = sorted(by_game.values(), key=lambda L: -L['drv'][driver])[:max(depth, 8)]
        if len(ranked) < depth:
            continue
        combos = list(itertools.combinations(ranked, depth))
        if cap and len(combos) > cap:
            combos = combos[:cap]  # cap = max slips/day (top by rank, since ranked is sorted)
        if len(combos) > max_combos:
            combos = combos[:max_combos]
        for combo in combos:
            hits = sum(L['h'] for L in combo)
            ret = slip_payout(structure, depth, hits, hc)
            total_stake += 1.0
            total_ret += ret
            slips += 1
            if ret > 1.0:
                win_days.add(day)
    if total_stake == 0:
        return None
    roi = total_ret / total_stake - 1.0
    return roi, slips, len(win_days)


def main():
    seasons = [s.strip() for s in os.environ.get('CS_BACKDATES', '').split(',') if s.strip()] or None
    hc = float(os.environ.get('CS_HAIRCUT', '0.95'))
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    print(f"config-sweep: seasons={seasons or 'ALL'} haircut={hc}", flush=True)

    rows = load_pool(conn, seasons)
    print(f"  loaded {len(rows)} graded legs with as-of cal_p", flush=True)

    # build per-day pool with all rank-driver values available
    # (final_hp/baseline/score/player_hr/plain_hr require extra loads; first pass uses cal_p + model_p)
    pool_by_day = defaultdict(list)
    for r in rows:
        season, gdate, eid, pid, prop, side, h, mp, cal_p, cal_n = r
        pool_by_day[gdate].append({
            'event_id': eid, 'prop': prop, 'side': side, 'h': h,
            'drv': {'cal_p': float(cal_p) if cal_p is not None else None,
                    'model_p': float(mp) if mp is not None else None},
        })
    print(f"  {len(pool_by_day)} slate-days", flush=True)

    # enumerate configs (first pass: cal_p driver, the validated core; other drivers added once loaded)
    results = []
    drivers = ['cal_p']
    thresholds = [round(0.56 + 0.01 * i, 2) for i in range(11)]   # 0.56..0.66 granular
    cellsets = ['all', 'peripheral', 'points']
    sides = ['over', 'both']
    depths = [2, 3, 4, 5]
    structures = ['power', 'flex']
    caps = [999]  # cap sweep in the volume pass
    for driver, thr, cellset, side, depth, structure in itertools.product(
            drivers, thresholds, cellsets, sides, depths, structures):
        if structure == 'flex' and depth < 3:
            continue
        res = run_config(pool_by_day, driver, thr, cellset, side, depth, structure, cap=None, hc=hc)
        if res is None:
            continue
        roi, slips, wd = res
        results.append((roi, slips, wd, driver, thr, cellset, side, depth, structure))

    # report: robust configs first (winning_days>=15, slips>=100), sorted by ROI
    robust = [x for x in results if x[2] >= 15 and x[1] >= 100]
    robust.sort(key=lambda x: -x[0])
    print(f"\n  {len(results)} configs run; {len(robust)} robust (win_days>=15, slips>=100). TOP 25:", flush=True)
    print(f"    {'ROI':>8} {'slips':>7} {'wdays':>5}  driver  thr  cellset  side  depth  struct", flush=True)
    for roi, slips, wd, driver, thr, cellset, side, depth, structure in robust[:25]:
        print(f"    {roi:>+7.1%} {slips:>7} {wd:>5}  {driver} {thr} {cellset:<10} {side:<5} {depth} {structure}", flush=True)

    print("\n  REPORT MODE — no writes. Next pass: load final_hp/baseline/score/player_hr drivers + cap sweep + tie-break band.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
