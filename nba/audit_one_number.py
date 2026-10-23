#!/usr/bin/env python3
"""
AUDIT - ONE NUMBER ON EVERY APP BOARD LEG (2026-10-23; owner 21:01 PT). READ-ONLY.
For each slate in AO_DATES, every leg of nba_score.board_scored (every app) goes through final_hp_board_cal.board_legs - what
score_board_legs.py step 4b applies when classification_config['final_hp_board_centre'] is on:
  1 COVERAGE - legs taking final_hp's own row / the chain on the day's ladder / keeping the as-of number, per app and prop group;
  2 PARITY   - the chain recomputed on the day's ladder (use_stored=False) vs final_hp's own board-chain rows for the same legs
               (must agree within rounding where final_hp was built with the chain);
  3 SHIFT    - mean |new - board_scored.final_hp| per app (how far the boards move from the scorer's as-of number).
Env: DATABASE_URL, AO_DATES (comma list), AO_TABLE (tunable table; default nba_score.final_hp_board_cal).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import final_hp_board_cal as BC   # noqa: E402

TABLE = os.environ.get("AO_TABLE") or "nba_score.final_hp_board_cal"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    for day in [x for x in (os.environ.get("AO_DATES") or "").split(",") if x]:
        rows = conn.execute("""SELECT app, player_id::text, prop, line::float8, side, baseline_hp::float8, final_hp::float8
                               FROM nba_score.board_scored WHERE game_date = %s""", (day,)).fetchall()
        if not rows:
            print(f"{day}: no board_scored rows"); continue
        side = ["Over" if str(r[4]).lower().startswith("o") else "Under" for r in rows]
        legs = [(r[1], r[2], r[3], sd, r[5]) for r, sd in zip(rows, side)]
        res = BC.board_legs(conn, day, legs, TABLE)
        chain = BC.board_legs(conn, day, legs, TABLE, use_stored=False)
        cov = defaultdict(lambda: defaultdict(int))
        shift = defaultdict(list)
        par = []
        for r, (p, ch, src), (q, _c2, src2) in zip(rows, res, chain):
            grp = "12 props" if r[2] in BC.PROPS else "other"
            cov[(r[0], grp)][src or "as-of kept"] += 1
            if p is not None and r[6] is not None:
                shift[r[0]].append(abs(p - r[6]))
            if src == "final_hp" and ch == "board" and q is not None:
                par.append(abs(p - q))
        print(f"\n{day}: {len(rows):,} board legs")
        for (app, grp), c in sorted(cov.items()):
            print(f"  {app:<12} {grp:<9} " + ", ".join(f"{k} {v:,}" for k, v in sorted(c.items())))
        for app, v in sorted(shift.items()):
            print(f"  shift vs board_scored.final_hp {app:<12} mean {np.mean(v):.4f} p90 {np.percentile(v, 90):.4f} (n {len(v):,})")
        if os.environ.get("AO_DIAG") == "1":
            std = BC.std_lines(conn, date=day)
            mat = {(p, pr): (ln, src) for p, pr, ln, src in conn.execute(
                "SELECT player_id, prop, line::float8, src FROM nba_score.board_std_line WHERE game_date = %s", (day,))}
            worst = sorted(((abs(p - q), r, p, q) for r, (p, ch, src), (q, _c, _s) in zip(rows, res, chain)
                            if src == "final_hp" and ch == "board" and q is not None), key=lambda x: -x[0])[:12]
            dd = BC.dt.date.fromisoformat(day)
            for gap, r, p, q in worst:
                nr = conn.execute("""SELECT count(*) FROM nba_score.final_hp WHERE game_date = %s AND player_id::text = %s AND prop = %s
                                     AND side = 'Over'""", (day, r[1], r[2])).fetchone()[0]
                print(f"    DIAG gap {gap:.3f} {r[0]} pid {r[1]} {r[2]} {r[3]} {r[4]} stored {p:.4f} chain {q:.4f} | L0 live "
                      f"{std.get((dd, r[1], r[2]))} materialized {mat.get((r[1], r[2]))} | Over rungs in final_hp {nr}")
        if par:
            a = np.array(par)
            print(f"  PARITY chain-on-ladder vs final_hp's board rows: n {len(a):,} max {a.max():.5f} mean {a.mean():.6f} "
                  f"> 0.01: {int((a > 0.01).sum()):,}")
        else:
            print("  PARITY: no final_hp board-chain row on this slate (final_hp built with the as-of chain)")


if __name__ == "__main__":
    main()
