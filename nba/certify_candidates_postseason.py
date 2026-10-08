#!/usr/bin/env python3
"""
NBA CELL CERTIFIER - POSTSEASON (strategy §31w P-5, 2026-10-08).

The live engine stakes legs from the certified CELLS of build_slip_engine.py (prop x tier x side x rank x n-band, each with its
certified 2025-26 p.m). Those cells were certified on regular-season nights only. The postseason (play-in 005 + playoffs 004)
is a different regime - short benches, starters' minutes up, series-level game plans, 1-4 games a night - so every cell is
measured on postseason nights with EXACTLY the engine's own selection (build_slip_engine.eligible_legs, imported - never
re-implemented) over the postseason tier map (nba_score.tier_map_legs_post: real PrizePicks window legs, current per-line price,
board_outcomes grade, postseason final_hp ranks).

WEIGHING THE POSTSEASON AGAINST THE REGULAR SEASON (owner 2026-10-08: "weigh properly comparing to the regular season").
Two postseasons are ~110 slate days against ~330 regular-season days. Fitting on the postseason alone chases noise; ignoring
it assumes the regimes are equal. Each cell's postseason p.m (day-averaged, the certifier's unit) is SHRUNK toward the cell's
certified regular-season p.m (the prior), the prior worth K postseason days:
        pm_w = (days_post * pm_post + K * pm_reg) / (days_post + K)
A cell is POSTSEASON-ELIGIBLE only when  pm_w >= BE  AND  pm_post >= BE - floor_gap  (the postseason itself must not contradict
the prior) AND days_post >= min_days. K, floor_gap and min_days are tunables in
nba_config.classification_config['postseason_weighting'] (seeded once; never hardcoded after that). No postseason evidence ->
not eligible. The live engine reads nba_score.cell_postseason_eligibility on postseason slates: only eligible cells enter the pool.

Output: nba_score.cell_certified_post (cell x season incl. 'pooled'), nba_score.cell_postseason_eligibility (one row per cell).
Env: DATABASE_URL
"""
import json
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as ENG  # noqa: E402  (ONE cell definition and ONE selection - the engine's own)

BE = 0.55   # 3-pick Power break-even per leg (section 19i), the certifier's bar
DEFAULT_CFG = {"K_days": 50, "floor_gap": 0.02, "min_days": 20,
               "note": "§31w postseason weighting: the cell's certified regular-season p.m is the prior worth K_days postseason days; "
                       "eligible iff weighted p.m >= 0.55, postseason p.m >= 0.55 - floor_gap and >= min_days postseason days"}


def cfg(conn):
    r = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='postseason_weighting'").fetchone()
    if r:
        return r[0]
    conn.execute("INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('postseason_weighting', %s) "
                 "ON CONFLICT (config_key) DO NOTHING", (json.dumps(DEFAULT_CFG),))
    conn.commit()
    return DEFAULT_CFG


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    c = cfg(conn)
    K, gap, min_days = float(c.get('K_days', 50)), float(c.get('floor_gap', 0.02)), int(c.get('min_days', 20))
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.cell_certified_post (
        cell text, season text, days int, legs int, hit double precision, mult double precision, pm double precision,
        above double precision, built_at timestamptz DEFAULT now())""")
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.cell_postseason_eligibility (
        cell text PRIMARY KEY, pm_reg double precision, days_post int, legs_post int, hit_post double precision, pm_post double precision,
        k_days double precision, pm_weighted double precision, eligible boolean, reason text, built_at timestamptz DEFAULT now())""")
    days = defaultdict(list)
    with conn.cursor(name='legs') as cur:
        cur.itersize = 50000
        cur.execute(ENG.LEG_SQL_SELF.replace("FROM nba_score.tier_map_legs l", "FROM nba_score.tier_map_legs_post l", 1))
        cols = [d.name for d in cur.description]
        for row in cur:
            r = dict(zip(cols, row))
            r['factor'] = float(r['factor']); r['score'] = float(r['score'])
            days[r['game_date']].append(r)
    print(f"postseason tier map: {sum(len(v) for v in days.values()):,} candidate legs over {len(days)} days | "
          f"K={K:g} days, floor_gap={gap:g}, min_days={min_days}", flush=True)
    # per (cell, season): list of day aggregates (hit, mult, pm, n)
    acc = defaultdict(list)
    for d in sorted(days):
        rows = days[d]
        season = rows[0]['season']
        pool = ENG.eligible_legs(rows)
        for cell, legs in pool.items():
            legs = [l for l in legs if l['hit'] is not None]
            if not legs:
                continue
            n = len(legs)
            hit = sum(l['hit'] for l in legs) / n
            mult = sum(l['factor'] for l in legs) / n
            pm = sum(l['hit'] * l['factor'] for l in legs) / n
            acc[(cell, season)].append((hit, mult, pm, n))
            acc[(cell, 'pooled')].append((hit, mult, pm, n))
    conn.execute("DELETE FROM nba_score.cell_certified_post")
    conn.execute("DELETE FROM nba_score.cell_postseason_eligibility")
    print(f"{'cell':<14}{'season':<9}{'days':>5}{'legs':>6}{'hit':>7}{'mult':>7}{'p.m':>7}{'>BE':>6}", flush=True)
    for (cell, season), v in sorted(acc.items()):
        nd = len(v)
        hit = sum(x[0] for x in v) / nd; mult = sum(x[1] for x in v) / nd; pm = sum(x[2] for x in v) / nd
        above = sum(1 for x in v if x[2] > BE) / nd
        conn.execute("""INSERT INTO nba_score.cell_certified_post (cell, season, days, legs, hit, mult, pm, above)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""", (cell, season, nd, sum(x[3] for x in v), hit, mult, pm, above))
        print(f"{cell:<14}{season:<9}{nd:>5}{sum(x[3] for x in v):>6}{hit:>7.3f}{mult:>7.3f}{pm:>7.3f}{100 * above:>5.0f}%", flush=True)
    print(f"\n{'cell':<14}{'prior':>7}{'days':>6}{'post':>7}{'weighted':>10}   verdict", flush=True)
    for cell, (_prop, _tier, _side, _rank, _nband, edge) in ENG.CELLS.items():
        v = acc.get((cell, 'pooled'), [])
        nd = len(v)
        legs = sum(x[3] for x in v)
        if nd == 0:
            elig, w, pm_post, hit_post, reason = False, None, None, None, 'no postseason legs'
        else:
            pm_post = sum(x[2] for x in v) / nd
            hit_post = sum(x[0] for x in v) / nd
            w = (nd * pm_post + K * edge) / (nd + K)
            if nd < min_days:
                elig, reason = False, f'too few postseason days ({nd} < {min_days})'
            elif w < BE:
                elig, reason = False, 'weighted p.m below break-even'
            elif pm_post < BE - gap:
                elig, reason = False, 'postseason contradicts the regular-season prior'
            else:
                elig, reason = True, 'eligible'
        conn.execute("""INSERT INTO nba_score.cell_postseason_eligibility (cell, pm_reg, days_post, legs_post, hit_post, pm_post, k_days,
                        pm_weighted, eligible, reason) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                     (cell, edge, nd, legs, hit_post, pm_post, K, w, elig, reason))
        print(f"{cell:<14}{edge:>7.3f}{nd:>6}{'' if pm_post is None else f'{pm_post:.3f}':>7}{'' if w is None else f'{w:.3f}':>10}   {reason}",
              flush=True)
    conn.commit()
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
