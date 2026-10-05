#!/usr/bin/env python3
"""
LADDER DEPTH AUDIT (strategy doc §31s, G2) - read-only. For every priced PrizePicks window leg at a HALF-POINT line that the model
did not score although it modelled that player's prop that day, how far beyond the modelled ladder edge it sits (in line units),
by kind and season - and how many of those legs a certified cell could ever use (tiers G1-G3 / D1-D3 are what cells read).
Sizes the ladder extension needed to cover >= 99% of the board.
Env: DATABASE_URL.
"""
import os
from collections import Counter, defaultdict

import psycopg

SQL = """
WITH pr AS MATERIALIZED (SELECT p.game_date, nba_ref.norm_name(p.player) cn, p.side, p.line, p.kind, coalesce(p.tier, 0) sys_tier,
     CASE replace(p.base_market,'player_','') WHEN 'blocks_steals' THEN 'stocks' WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra'
       WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' ELSE replace(p.base_market,'player_','') END prop
   FROM nba_market.pp_leg_price p WHERE p.snapshot_label='window' AND p.factor IS NOT NULL AND NOT coalesce(p.kind_position_mismatch,false)
     AND p.line <> floor(p.line) AND p.game_date BETWEEN '2024-10-22' AND '2026-04-12'),
r AS MATERIALIZED (SELECT DISTINCT pr.game_date, pr.prop, pr.side, pr.line, pr.kind, pr.sys_tier, nm.player_id FROM pr JOIN nba_ref.player_name_map nm ON nm.norm_name=pr.cn),
rng AS MATERIALIZED (SELECT game_date, player_id, prop, min(line) lo, max(line) hi FROM nba_score.final_hp
                     WHERE game_date BETWEEN '2024-10-22' AND '2026-04-12' GROUP BY 1,2,3),
sc AS MATERIALIZED (SELECT DISTINCT game_date, player_id, prop, side, line FROM nba_score.final_hp WHERE game_date BETWEEN '2024-10-22' AND '2026-04-12')
SELECT r.game_date, r.kind, r.sys_tier, r.line, g.lo, g.hi, (s.line IS NOT NULL) scored, r.prop
FROM r JOIN rng g USING (game_date, player_id, prop) LEFT JOIN sc s USING (game_date, player_id, prop, side, line)
"""


def main():
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    tot = Counter(); miss = defaultdict(Counter); cell_usable = Counter()
    import datetime as _dt
    months = []
    d0 = _dt.date(2024, 10, 1)
    while d0 <= _dt.date(2026, 4, 1):
        d1 = (d0.replace(day=28) + _dt.timedelta(days=4)).replace(day=1)
        months.append((d0, d1)); d0 = d1
    rows = []
    for a, b in months:
        q = SQL.replace("'2024-10-22' AND '2026-04-12'", f"'{max(a, _dt.date(2024, 10, 22))}' AND '{min(b - _dt.timedelta(days=1), _dt.date(2026, 4, 12))}'")
        part = conn.execute(q).fetchall()
        rows.extend(part)
        print(f"  month {a:%Y-%m}: {len(part):,} legs", flush=True)
    per_prop = defaultdict(list)
    for d, kind, tier, line, lo, hi, scored, prop in rows:
        sea = '2024-25' if d.year == 2024 or (d.year == 2025 and d.month < 7) else '2025-26'
        tot[(sea, kind)] += 1
        if scored:
            continue
        beyond = max(float(line) - float(hi), float(lo) - float(line))
        b = 'inside range' if beyond <= 0 else '<= 2' if beyond <= 2 else '<= 5' if beyond <= 5 else '<= 10' if beyond <= 10 else '> 10'
        miss[(sea, kind)][b] += 1
        if kind in ('goblin', 'demon') and 1 <= abs(int(tier or 0)) <= 3:
            cell_usable[(sea, kind)] += 1
            per_prop[(prop, kind)].append(beyond)
    print("LADDER DEPTH AUDIT - priced half-point window legs the model did not score (player/prop modelled that day)", flush=True)
    for k in sorted(tot):
        m = sum(miss[k].values())
        print(f"  {k[0]} {k[1]:<9} priced {tot[k]:>7,} | unscored {m:>6,} ({100*m/tot[k]:5.2f}%) | beyond the ladder edge: "
              + ", ".join(f"{b} {miss[k][b]}" for b in ('inside range', '<= 2', '<= 5', '<= 10', '> 10'))
              + f" | in a cell-usable tier (|tier| 1-3): {cell_usable[k]}", flush=True)
    print("\nPER PROP - unscored cell-usable (|tier| 1-3) legs, both seasons: distance beyond the ladder edge (line units)", flush=True)
    for (prop, kind), v in sorted(per_prop.items(), key=lambda x: -len(x[1])):
        v = sorted(v); q = lambda f: v[min(int(f * len(v)), len(v) - 1)]
        print(f"   {prop:<12} {kind:<7} n {len(v):>6} | p50 {q(0.5):5.1f} p90 {q(0.9):5.1f} p99 {q(0.99):5.1f} max {v[-1]:5.1f}", flush=True)
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
