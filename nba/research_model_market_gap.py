#!/usr/bin/env python3
"""
MODEL vs MARKET GAP - does a leg the model rates far above the market hit at the model's number? (2026-10-20, owner 20:37 PT: "analyze
the outcomes from today ... understand what went wrong and what needs to be improved"). READ-ONLY.

Today (live grade, run 39544749657): Victor Wembanyama stocks Under 4.5 - model 0.956, market-anchored 0.673, actual 7 - sat in three
slips; Ausar Thompson stocks Under 3.5 model 0.962 / 0.673; Derrick White stocks Under 2.5 0.866 / 0.673; Daniss Jenkins assists Over
3.5 0.82 / 0.653. The certified cells select on the MODEL's ranking; the market-anchored number is display-only.

QUESTION, on every graded PrizePicks leg of both seasons (board_scored + board_true_hp + the leg's real outcome in prop_universe):
per gap bucket g = model final_hp - market-anchored true_hp, the realized hit rate vs the mean model and the mean anchored number, per
side and per prop family; and the same restricted to the legs the certified cells can pick (tier R / G / D of the cell props, model >= 0.6).
If the realized rate follows the ANCHORED number when the gap is large, the selector should not trust the model there (a gap cap or
the anchored number as the ranking key) - to be backtested through the slip engine before anything changes.
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import psycopg

SQL = """
SELECT b.game_date, b.season, b.prop, b.side, b.final_hp::float8 m, th.true_hp::float8 a, pu.hit::int h
FROM nba_score.board_scored b
JOIN nba_score.board_true_hp th ON th.game_date = b.game_date AND th.player_id = b.player_id AND th.prop = b.prop AND th.line = b.line AND th.side = b.side
JOIN nba_market.prop_universe pu ON pu.game_date = b.game_date AND pu.player_id = b.player_id AND pu.prop = b.prop AND pu.line = b.line
 AND pu.side = b.side AND pu.line_source = 'real'
WHERE b.app = 'prizepicks' AND pu.hit IS NOT NULL AND b.season IN ('2024-25', '2025-26')
"""
FAM = {"steals": "defense", "blocks": "defense", "stocks": "defense", "turnovers": "defense", "points": "points", "pra": "points",
       "pts_reb": "points", "pts_ast": "points", "rebounds": "boards", "reb_ast": "boards", "assists": "assists", "threes_made": "threes"}
BUCKETS = [(-1, 0.0), (0.0, 0.05), (0.05, 0.10), (0.10, 0.15), (0.15, 0.20), (0.20, 0.30), (0.30, 1.0)]


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("SET statement_timeout = 0")
        c.execute("SET jit = off")
        rows = c.execute(SQL).fetchall()
    print(f"graded PrizePicks legs with a market-anchored number: {len(rows):,}", flush=True)
    for label, filt in (("ALL legs", lambda r: True), ("model >= 0.60", lambda r: r[4] >= 0.60), ("model >= 0.80", lambda r: r[4] >= 0.80)):
        print(f"\n=== {label}: per gap bucket (model - anchored) -> n | mean model | mean anchored | REALIZED, per season", flush=True)
        for s in ("2024-25", "2025-26"):
            acc = defaultdict(lambda: [0, 0.0, 0.0, 0])
            for d, se, prop, side, m, a, h in rows:
                if se != s or not filt((d, se, prop, side, m, a, h)):
                    continue
                g = m - a
                for lo, hi in BUCKETS:
                    if lo <= g < hi:
                        x = acc[(lo, hi)]
                        x[0] += 1; x[1] += m; x[2] += a; x[3] += h
                        break
            print(f"  {s}: " + " | ".join(f"[{lo:+.2f},{hi:+.2f}) n {v[0]:,} m {v[1] / v[0]:.3f} a {v[2] / v[0]:.3f} hit {v[3] / v[0]:.3f}"
                                          for (lo, hi), v in sorted(acc.items()) if v[0]), flush=True)
    print("\n=== model >= 0.60, gap >= 0.15, by side x family: n | model | anchored | realized (both seasons)", flush=True)
    acc = defaultdict(lambda: [0, 0.0, 0.0, 0])
    for d, se, prop, side, m, a, h in rows:
        if m >= 0.60 and m - a >= 0.15:
            x = acc[(side, FAM.get(prop, "other"))]
            x[0] += 1; x[1] += m; x[2] += a; x[3] += h
    for k, v in sorted(acc.items()):
        print(f"  {k[0]:<5} {k[1]:<8} n {v[0]:>6,} model {v[1] / v[0]:.3f} anchored {v[2] / v[0]:.3f} realized {v[3] / v[0]:.3f}", flush=True)


if __name__ == "__main__":
    main()
