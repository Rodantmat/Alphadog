#!/usr/bin/env python3
"""
RESEARCH - BETTER LEG ORDERING INSIDE THE CERTIFIED CELLS (2026-10-15; owner: "keep improving logics, looking at other models
to improve ROI").  READ-ONLY: rebuilds the live strategies' slips in memory with the certified engine (build_slip_engine:
eligible_legs, build_day_slips, grade - the same functions live calls) on the market-free selection table, and compares
ordering models. Nothing is written.

Why: the certified engine orders legs by a CONSTANT per-cell edge (the cell's certified p.m) and, inside a cell, by the cell's
rank (final_score). Measured 2026-10-15 on the legs the strategies pick (slip_engine_legs_mf, k <= 3): inside each cell the
market-anchored honest probability (nba_score.board_true_hp; history rows scored with the OTHER season's fit = out of sample)
separates hits from misses in BOTH seasons - lowest / middle / top tercile hit 0.499 / 0.540 / 0.558 (2024-25) and 0.550 /
0.576 / 0.596 (2025-26); the raw model's terciles separate less (0.508 / 0.531 / 0.558, 0.567 / 0.568 / 0.586).
Literature: combining a model with the market's price is the standard way to sharpen a probability (market-model blends);
the question here is only whether it improves the SLIPS the certified engine builds.

Variants (written before the run; no parameter is fitted, so there is nothing to overfit):
  V0  control            the certified engine exactly (must reproduce the backtest table - parity printed)
  V1  honest-in-cell     leg edge = cell edge + (honest_hp - mean honest_hp of that cell's eligible legs that day); the cell's
                         eligibility band is unchanged, only the ORDER inside and across cells moves with the market-anchored p
  V2  flex-demon-value   for Flex only: a demon leg's edge = cell p.m / factor x the leg's Flex value ratio - i.e. ranked by its
                         hit probability p (PrizePicks pays Flex partial tiers flat in the factor product, §31ad), Power unchanged
  V3  V1 + V2
Decision rule (pre-registered): a variant is adopted only if it raises the portfolio ROI in BOTH seasons and no daily strategy's
weaker-season ROI falls by more than 5 points; otherwise the certified ordering stays.
Env: DATABASE_URL, RL_LEGS_TABLE (nba_score.tier_map_legs_sel_mf).
"""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as ENG                                   # noqa: E402
from live_slip_engine import STRATEGIES, ROTATION_ONLY, ALLSTAR_ONLY, bt_table  # noqa: E402

LEGS_TABLE = os.environ.get('RL_LEGS_TABLE', 'nba_score.tier_map_legs_sel_mf')
STEALS_CELLS = ('steals_R', 'steals_R_U')
DEMON_CELLS = set(ENG.DEMONS)


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    strategies = {n: s for n, s in STRATEGIES.items() if s[3] > 0 and n not in ALLSTAR_ONLY}
    print(f"strategies: {', '.join(strategies)}", flush=True)

    print("loading names and the honest probability ...", flush=True)
    names = {}
    for d, player, pid in conn.execute("SELECT DISTINCT game_date, player, player_id FROM nba_score.board_scored WHERE app='prizepicks'"):
        names[(d, player)] = pid
    thp = {}
    for d, pid, prop, line, side, t in conn.execute("SELECT game_date, player_id, prop, line::float8, side, true_hp FROM nba_score.board_true_hp"):
        thp[(d, pid, prop, float(line), side)] = float(t)
    print(f"  {len(thp):,} honest probabilities", flush=True)

    days = defaultdict(list)
    with conn.cursor(name='legs') as cur:
        cur.itersize = 50000
        cur.execute(ENG.LEG_SQL.replace("FROM nba_score.tier_map_legs l", f"FROM {LEGS_TABLE} l", 1))
        cols = [c.name for c in cur.description]
        for row in cur:
            r = dict(zip(cols, row))
            pid = names.get((r['game_date'], r['player']))
            r['thp'] = thp.get((r['game_date'], pid, r['prop'], float(r['line']), r['side'])) if pid else None
            days[r['game_date']].append(r)
    print(f"  {sum(len(v) for v in days.values()):,} candidate legs, {len(days)} days; honest p matched "
          f"{sum(1 for v in days.values() for r in v if r['thp'] is not None) / max(1, sum(len(v) for v in days.values())):.1%}", flush=True)
    bounds = {}
    for d, rows in days.items():
        s = rows[0]['season']; lo, hi = bounds.get(s, (d, d)); bounds[s] = (min(lo, d), max(hi, d))
    cmap = ENG.load_corr(conn)

    def adjust(pool, structure, v1, v2):
        out = {}
        for c, legs in pool.items():
            mean_t = [l['thp'] for l in legs if l.get('thp') is not None]
            mt = sum(mean_t) / len(mean_t) if mean_t else None
            nl = []
            for l in legs:
                l2 = dict(l)
                e = l['edge']
                if v2 and structure == 'flex' and c in DEMON_CELLS and float(l['factor']) > 0:
                    e = e / float(l['factor'])
                if v1 and mt is not None and l.get('thp') is not None:
                    e = e + (l['thp'] - mt)
                l2['edge'] = e
                nl.append(l2)
            out[c] = sorted(nl, key=lambda x: (-x['edge'], x['n_rank'])) if v1 else nl
        return out

    variants = {'V0': (False, False), 'V1': (True, False), 'V2': (False, True), 'V3': (True, True)}
    res = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))   # (variant, strategy) -> season -> [slips, payout]
    for d in sorted(days):
        rows = days[d]; season = rows[0]['season']
        if ENG.phase_of(season, d, bounds) == 'final7':
            continue
        pool_full = ENG.eligible_legs(rows)
        pool_ns = {c: v for c, v in pool_full.items() if c not in STEALS_CELLS}
        for pool in (pool_full, pool_ns):
            fam = defaultdict(set)
            for c, legs in pool.items():
                for l in legs:
                    fam[c.replace('_U', '')].add(l['player'])
            pool['__broad'] = sum(1 for v in fam.values() if len(v) >= 2) >= 5
        for name, (comp, size, structure, cap, *_r) in strategies.items():
            base = pool_ns if name.startswith(('C_', 'D_', 'R_', 'W_')) else pool_full
            broad = base['__broad']
            p0 = {c: v for c, v in base.items() if c != '__broad'}
            for vname, (v1, v2) in variants.items():
                pool = adjust(p0, structure, v1, v2) if (v1 or v2) else p0
                for slip in ENG.build_day_slips(pool, comp, size, structure, cap, cmap, broad):
                    _h, pay = ENG.grade(slip, structure)
                    a = res[(vname, name)][season]; a[0] += 1; a[1] += pay

    seasons = sorted(bounds)
    print("\nparity V0 vs the backtest table (slips, payout):", flush=True)
    for name, (comp, size, structure, cap, *_r) in strategies.items():
        tbl = bt_table(conn, name)
        for s in seasons:
            n, p = conn.execute(f"""SELECT count(*), coalesce(sum(payout), 0) FROM {tbl} WHERE composition=%s AND size=%s AND structure=%s
                                    AND k<=%s AND season=%s AND phase<>'final7'""", (comp, size, structure, cap, s)).fetchone()
            a = res[('V0', name)][s]
            print(f"  {name:<20} {s}  table {n:>5} {float(p):>9.2f}   V0 {a[0]:>5} {a[1]:>9.2f}   {'OK' if n == a[0] and abs(float(p) - a[1]) < 0.01 else 'DIFF'}", flush=True)

    print("\nROI by variant (final-7 out):", flush=True)
    print(f"{'strategy':<20} " + " ".join(f"{v + ' ' + s:>14}" for v in variants for s in seasons), flush=True)
    tot = defaultdict(lambda: [0, 0.0])
    for name in strategies:
        cells = []
        for v in variants:
            for s in seasons:
                a = res[(v, name)][s]
                cells.append(f"{(a[1] / a[0] - 1) if a[0] else 0:>+14.1%}")
                if name not in ROTATION_ONLY:
                    t = tot[(v, s)]; t[0] += a[0]; t[1] += a[1]
        print(f"{name:<20} " + " ".join(cells), flush=True)
    print(f"{'PORTFOLIO (daily)':<20} " + " ".join(f"{(tot[(v, s)][1] / tot[(v, s)][0] - 1) if tot[(v, s)][0] else 0:>+14.1%}" for v in variants for s in seasons), flush=True)
    print(f"{'  net units':<20} " + " ".join(f"{tot[(v, s)][1] - tot[(v, s)][0]:>+14.1f}" for v in variants for s in seasons), flush=True)
    conn.close()


if __name__ == '__main__':
    main()
