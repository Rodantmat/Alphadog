#!/usr/bin/env python3
"""
AUDIT - nba_score.board_hp AFTER THE BACKFILL (2026-10-22 PT). READ-ONLY. Certifies what build_board_hp.py wrote:
  1 COVERAGE per season / live: days, board legs on the PrizePicks window board (12 props, standard / goblin / demon) vs legs scored;
    days on the board with no board_hp; the tunable set each day used (never a set dated after the day).
  2 AS-OF INTEGRITY: every tunable set's train_through < its as_of_date.
  3 CALIBRATION on graded legs (nba_score.tier_map_legs_sel_wo hit, joined by date x player x prop x side x line): per line type x
    side - n, mean board_hp vs hit, mean final_hp vs hit, log-loss of each, the >= .58 pool (n, mean p, hit); and per board_hp
    decile overall. Must reproduce the walk-forward research (run 39884286185) within noise.
  4 LIVE DAYS 2026-10-20 .. : per day and line type the board_hp distribution next to final_hp.
Env: DATABASE_URL.
"""
import os
from collections import defaultdict

import numpy as np
import psycopg

EPS = 1e-4


def ll(p, y):
    p = np.clip(np.asarray(p, float), EPS, 1 - EPS); y = np.asarray(y, float)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    print("1 COVERAGE")
    for lab, lo, hi in (("2024-25", "2024-10-01", "2025-07-01"), ("2025-26", "2025-10-01", "2026-07-01"), ("live", "2026-10-01", "2027-07-01")):
        board = conn.execute("""SELECT count(DISTINCT game_date), count(*) FROM nba_market.pp_leg_price WHERE snapshot_label = 'window'
                                AND game_date >= %s AND game_date < %s AND kind IN ('standard', 'goblin', 'demon') AND anchor_line IS NOT NULL
                                AND replace(base_market, 'player_', '') = ANY('{points,rebounds,assists,threes,steals,blocks,turnovers,
                                blocks_steals,points_rebounds_assists,points_rebounds,points_assists,rebounds_assists}'::text[])""", (lo, hi)).fetchone()
        bh = conn.execute("""SELECT count(DISTINCT game_date), count(*), count(*) FILTER (WHERE tunables_as_of > game_date),
                                    count(*) FILTER (WHERE final_hp IS NULL) FROM nba_score.board_hp WHERE game_date >= %s AND game_date < %s""",
                          (lo, hi)).fetchone()
        print(f"  {lab}: board days {board[0]}, board legs {board[1]:,} | board_hp days {bh[0]}, legs {bh[1]:,} "
              f"({bh[1] / max(1, board[1]):.1%}); rows using a set dated after the day {bh[2]}; rows without a final_hp twin {bh[3]:,}")
    miss = conn.execute("""SELECT array_agg(d ORDER BY d) FROM (SELECT DISTINCT game_date d FROM nba_market.pp_leg_price
                           WHERE snapshot_label = 'window' AND game_date >= '2024-11-13'
                           EXCEPT SELECT DISTINCT game_date FROM nba_score.board_hp) x""").fetchone()[0]
    print(f"  board days since the first tunable set with no board_hp: {len(miss or [])} {(miss or [])[:20]}")
    print("2 AS-OF INTEGRITY")
    bad = conn.execute("""SELECT count(*), min(as_of_date), max(as_of_date) FROM nba_score.board_hp_tunables
                          WHERE (params->>'train_through')::date >= as_of_date""").fetchone()
    tot = conn.execute("SELECT count(*), min(as_of_date), max(as_of_date) FROM nba_score.board_hp_tunables").fetchone()
    print(f"  tunable sets {tot[0]} ({tot[1]} .. {tot[2]}); sets trained on their own day or later: {bad[0]}")

    print("3 CALIBRATION on graded legs (history)")
    rows = conn.execute("""
        WITH t AS (SELECT DISTINCT ON (game_date, nm.player_id, prop, side, line) game_date, nm.player_id::text pid, prop, side,
                          line, hit
                   FROM nba_score.tier_map_legs_sel_wo tm JOIN nba_ref.player_name_map nm ON nm.norm_name = nba_ref.norm_name(tm.player)
                   WHERE tm.rank_key = 'final_hp' AND tm.hit IS NOT NULL)
        SELECT b.game_date, b.line_type, b.side, b.board_hp::float8, b.final_hp::float8, t.hit
        FROM nba_score.board_hp b JOIN t ON t.game_date = b.game_date AND t.pid = b.player_id AND t.prop = b.prop AND t.side = b.side
                                       AND t.line = b.line""").fetchall()
    print(f"  graded legs joined: {len(rows):,}")
    by = defaultdict(list)
    for d, lt, sd, p, f, h in rows:
        by[(lt, sd)].append((p, f, h))
    allp, ally, allf = [], [], []
    for (lt, sd), v in sorted(by.items()):
        p = np.array([x[0] for x in v]); f = np.array([np.nan if x[1] is None else x[1] for x in v]); y = np.array([x[2] for x in v], float)
        mf = ~np.isnan(f)
        top = p >= 0.58; topf = mf & (f >= 0.58)
        print(f"  {lt:<3} {sd:<5} n {len(v):>7}  board_hp {p.mean():.3f} hit {y.mean():.3f} ll {ll(p, y):.4f} | final_hp {f[mf].mean():.3f} "
              f"ll {ll(f[mf], y[mf]):.4f} | >=.58 board_hp n {int(top.sum()):>6} p {p[top].mean() if top.any() else float('nan'):.3f} "
              f"hit {y[top].mean() if top.any() else float('nan'):.3f}; final_hp n {int(topf.sum()):>6} hit {y[topf].mean() if topf.any() else float('nan'):.3f}")
        allp += list(p[mf]); ally += list(y[mf]); allf += list(f[mf])
    allp, ally, allf = np.array(allp), np.array(ally), np.array(allf)
    print(f"  ALL (legs with both): n {len(allp):,}  board_hp ll {ll(allp, ally):.4f}  final_hp ll {ll(allf, ally):.4f}")
    o = np.argsort(allp)
    for b in np.array_split(o, 10):
        print(f"    board_hp decile {allp[b].min():.3f}-{allp[b].max():.3f}: mean {allp[b].mean():.3f} hit {ally[b].mean():.3f}")

    print("4 LIVE DAYS")
    for d, lt, sd, n, mb, nb, mf, nf in conn.execute(
            """SELECT game_date, line_type, side, count(*), avg(board_hp)::float8, count(*) FILTER (WHERE board_hp >= .58),
                      avg(final_hp)::float8, count(*) FILTER (WHERE final_hp >= .58)
               FROM nba_score.board_hp WHERE game_date >= '2026-10-01' GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""").fetchall():
        print(f"  {d} {lt:<3} {sd:<5} n {n:>5}  board_hp mean {mb:.3f} >=.58 {nb:>4} | final_hp mean {mf if mf is not None else float('nan'):.3f} >=.58 {nf:>4}")


if __name__ == "__main__":
    main()
