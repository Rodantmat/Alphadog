#!/usr/bin/env python3
"""
ONE FORMULA - THE FINAL NUMBERS. READ-ONLY. (owner 2026-11-20 20:58 PT: "a homogeneous formula throughout the whole dataset and back data")
For the store being checked (CR_STORE=v2 -> the replayed _v2 tables; prod -> the production tables):
  1. COVERAGE   per season: slate dates, final_hp legs, board-scored legs per app
  2. STABILITY  per date: mean confidence, mean score, mean final_hp; per season the largest day-to-day jump and the spread of the daily means
                (a formula that changes between days shows as steps; one formula shows only slate-to-slate noise)
  3. CALIBRATION per season, graded board legs (outcome joined on date / player / PROP / line / side): predicted vs hit by fifth, log-loss vs a coin
Env: DATABASE_URL, CR_STORE (v2 | prod).
"""
import os

import numpy as np
import pandas as pd
import psycopg

STORE = os.environ.get("CR_STORE") or "v2"
SUF = "_v2" if STORE == "v2" else ""
CASE = ("(CASE o.rk WHEN 'threes' THEN 'threes_made' WHEN 'points_rebounds_assists' THEN 'pra' WHEN 'points_rebounds' THEN 'pts_reb' "
        "WHEN 'points_assists' THEN 'pts_ast' WHEN 'rebounds_assists' THEN 'reb_ast' WHEN 'blocks_steals' THEN 'stocks' ELSE o.rk END)")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    print(f"CR|store: {STORE}", flush=True)
    daily = pd.read_sql(f"""SELECT season, game_date, count(*) n, avg(confidence)::float8 c, avg(score)::float8 s, avg(final_hp)::float8 p,
                                   avg((cal_chain = 'board')::int)::float8 bc
                            FROM nba_score.final_hp{SUF} WHERE game_date <= '2026-11-20' GROUP BY 1, 2 ORDER BY 2""", conn)
    bs = pd.read_sql(f"""SELECT season, app, count(*) n, count(DISTINCT game_date) d FROM nba_score.board_scored{SUF}
                         WHERE game_date <= '2026-11-20' GROUP BY 1, 2 ORDER BY 1, 3 DESC""", conn)
    print("CR|================ 1. COVERAGE ================", flush=True)
    for s, g in daily.groupby("season"):
        b = bs[bs["season"] == s]
        print(f"CR|  {s}: {len(g)} slate dates | final_hp legs {int(g['n'].sum()):,} | board-centred {100*np.average(g['bc'], weights=g['n']):.0f}% | board-scored: "
              + ", ".join(f"{a} {int(n):,}" for a, n in zip(b["app"], b["n"])), flush=True)
    print("CR|================ 2. STABILITY (daily means) ================", flush=True)
    for s, g in daily.groupby("season"):
        for col, lab, k in (("c", "confidence", 100), ("s", "score", 1), ("p", "final_hp", 100)):
            v = g[col].values * k; j = np.abs(np.diff(v))
            print(f"CR|  {s} {lab:10s}: mean {v.mean():6.2f} | spread of daily means (sd) {v.std():5.2f} | largest day-to-day jump {j.max() if len(j) else 0:5.2f} "
                  f"(on {g['game_date'].iloc[int(np.argmax(j)) + 1] if len(j) else '-'})", flush=True)
    print("CR|================ 3. CALIBRATION (graded board legs) ================", flush=True)
    d = pd.read_sql(f"""WITH o AS (SELECT DISTINCT ON (o.game_date, m.player_id, replace(replace(o.market_key,'player_',''),'_alternate',''), o.line, o.side)
                                   o.game_date, m.player_id::text pid, replace(replace(o.market_key,'player_',''),'_alternate','') rk, o.line::float8 line, o.side,
                                   ((o.leg_result = 'over_win') = (o.side = 'Over'))::int won
                            FROM nba_market.board_outcomes o JOIN nba_ref.player_name_map m ON m.norm_name = nba_ref.norm_name(o.player)
                            WHERE o.leg_result IN ('over_win','under_win') AND o.game_date >= '2024-10-01')
                         SELECT f.season, f.final_hp::float8 p, o.won FROM nba_score.final_hp{SUF} f
                         JOIN o ON o.game_date = f.game_date AND o.pid = f.player_id::text AND o.line = f.line::float8 AND o.side = f.side AND f.prop = {CASE}""", conn)
    for s, g in d.groupby("season"):
        q = pd.qcut(g["p"].rank(method="first"), 5, labels=False)
        p = np.clip(g["p"].values, 1e-4, 1 - 1e-4); y = g["won"].values
        ll = -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)); hr = y.mean()
        ll0 = -(hr * np.log(hr) + (1 - hr) * np.log(1 - hr))
        parts = []
        for k, h in g.groupby(q):
            parts.append(f"{100*h['p'].mean():.1f}->{100*h['won'].mean():.1f}")
        print(f"CR|  {s}: {len(g):,} graded legs | predicted->hit by fifth: {' | '.join(parts)} | log-loss {ll:.4f} (coin at the base rate {ll0:.4f})", flush=True)
    print("CR|DONE", flush=True)


if __name__ == "__main__":
    main()
