#!/usr/bin/env python3
"""
DOES CONFIDENCE MEAN ANYTHING OUT OF SAMPLE? READ-ONLY. (owner 2026-11-20 20:58 PT: every layer sharp and proven before it runs on every date)
Confidence is meant to say how far to trust a leg's final_hp. On the replayed store (final_hp_v2, confidence from the model dated before each
slate) every graded board leg is bucketed by its confidence (fifths within its season) and per bucket we read: legs, mean final_hp, hit rate,
|hit - final_hp| (calibration gap), log-loss, and the log-loss of a perfectly calibrated coin at the bucket's own hit rate. A confidence that works
shows the gap and the excess log-loss falling from the low fifth to the high fifth, season after season. Also: the same table for score.
Env: DATABASE_URL, CO_TABLE (default nba_score.final_hp_v2).
"""
import os

import numpy as np
import pandas as pd
import psycopg

TABLE = os.environ.get("CO_TABLE") or "nba_score.final_hp_v2"
KEY = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes": "threes_made", "points_rebounds_assists": "pra",
       "points_rebounds": "pts_reb", "points_assists": "pts_ast", "rebounds_assists": "reb_ast", "blocks": "blocks", "steals": "steals",
       "turnovers": "turnovers", "blocks_steals": "stocks"}


def main():
    assert TABLE in ("nba_score.final_hp_v2", "nba_score.final_hp")
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql(f"""WITH o AS (SELECT DISTINCT ON (o.game_date, m.player_id, replace(replace(o.market_key,'player_',''),'_alternate',''), o.line, o.side)
                                  o.game_date, m.player_id::text pid, replace(replace(o.market_key,'player_',''),'_alternate','') rk, o.line::float8 line, o.side,
                                  ((o.leg_result = 'over_win') = (o.side = 'Over'))::int won
                           FROM nba_market.board_outcomes o JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(o.player)
                           WHERE o.leg_result IN ('over_win','under_win') AND o.game_date >= '2024-10-01')
                        SELECT f.season, f.game_date, f.prop, f.final_hp::float8 p, f.confidence::float8 c, f.score::float8 s, o.won
                        FROM {TABLE} f JOIN o ON o.game_date = f.game_date AND o.pid = f.player_id::text AND o.line = f.line::float8 AND o.side = f.side AND f.prop = (CASE o.rk WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE o.rk END)
                        WHERE f.final_hp IS NOT NULL""", conn)
    d = d[d["prop"] == d["prop"]]
    print(f"CO|graded legs: {len(d):,} | {d['season'].value_counts().to_dict()}", flush=True)
    for col, lab in (("p", "FINAL_HP"), ("c", "CONFIDENCE"), ("s", "SCORE")):
        print(f"CO|================ by {lab} fifth (within season) ================", flush=True)
        for s, g in d.groupby("season"):
            g = g.copy()
            g["q"] = pd.qcut(g[col].rank(method="first"), 5, labels=False)
            for q, h in g.groupby("q"):
                p = np.clip(h["p"].values, 1e-4, 1 - 1e-4); y = h["won"].values; hr = y.mean()
                ll = -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))
                ll0 = -(hr * np.log(max(hr, 1e-4)) + (1 - hr) * np.log(max(1 - hr, 1e-4)))
                print(f"CO|  {s} {lab.lower()} fifth {q + 1}: {len(h):8,} legs | {col} {h[col].mean():.3f} | mean final_hp {100*p.mean():5.1f} hit {100*hr:5.1f} gap {100*(hr - p.mean()):+5.2f} | "
                      f"log-loss {ll:.4f} vs coin {ll0:.4f} ({ll0 - ll:+.4f})", flush=True)
    print("CO|DONE", flush=True)


if __name__ == "__main__":
    main()
