#!/usr/bin/env python3
"""
AUDIT - Postgres JIT on vs off for the P3 critical-path READ queries (2026-10-20, P3 speed-up). READ-ONLY (SELECTs only; the JIT
setting is per-session SET - nothing database-wide changes, MLB shares the database).

Today: build_price_shop_ledger's cell rates took 48-87 s with JIT on vs 4 s off (fixed in that script with SET jit = off). Before
proposing PGOPTIONS='-c jit=off' for the NBA workflows, measure the other heavy P3 reads: each query twice per setting (the first
warms the cache), alternating order, row counts compared (the setting must not change a result).
Env: DATABASE_URL, JB_DATE (default 2026-10-20).
"""
import os
import sys
import time

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as LS          # noqa: E402
import paper_altless_tracker as T      # noqa: E402

D = os.environ.get("JB_DATE", "2026-10-20")

QUERIES = {
    "pp_leg_price window (P3 certify / pick gate)":
        ("SELECT count(*), sum(factor) FROM nba_market.pp_leg_price WHERE snapshot_label = 'window' AND game_date = %s", (D,)),
    "live pick board (BOARD_SQL, half-point)":
        (LS.BOARD_SQL.format(price_cols="f.final_hp::float, f.baseline_hp::float, f.score::float", price_src="nba_score.final_hp f",
                             price_where="f.final_hp IS NOT NULL AND f.score IS NOT NULL"),
         ("window", D, D, D, "window", D, D)),
    "scorer board load (score_board_legs)":
        ("""SELECT count(*) FROM nba_market.board_snapshots b LEFT JOIN nba_ref.player_name_map m
            ON m.norm_name = nba_ref.norm_name(b.player) WHERE b.game_date = %s""", (D,)),
    "paper tracker alt legs (LEG_SQL)": (T.LEG_SQL, {"d": D, "mk": list(T.PROPS)}),
    "paper tracker standard legs (STD_SQL)": (T.STD_SQL, {"d": D, "props": list(T.STAT)}),
    "final_hp slate read":
        ("SELECT count(*), avg(final_hp) FROM nba_score.final_hp WHERE game_date = %s", (D,)),
    "board_scored slate read":
        ("SELECT app, count(*) FROM nba_score.board_scored WHERE game_date = %s GROUP BY 1", (D,)),
}


def run(conn, q, p):
    t0 = time.time()
    rows = conn.execute(q, p).fetchall()
    return time.time() - t0, len(rows), rows[:1]


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SET statement_timeout = 0")
        print(f"server jit default: {conn.execute('SHOW jit').fetchone()[0]} | jit_above_cost {conn.execute('SHOW jit_above_cost').fetchone()[0]}",
              flush=True)
        tot = {"on": 0.0, "off": 0.0}
        for name, (q, p) in QUERIES.items():
            res = {}
            for order in (("on", "off"), ("off", "on")):
                for s in order:
                    conn.execute(f"SET jit = {s}")
                    dt, n, first = run(conn, q, p)
                    res.setdefault(s, []).append((dt, n, first))
            same = len({(r[1], str(r[2])) for v in res.values() for r in v}) == 1
            best = {s: min(r[0] for r in v) for s, v in res.items()}
            tot["on"] += best["on"]
            tot["off"] += best["off"]
            print(f"{name:<46} jit on {best['on']:7.2f}s | off {best['off']:7.2f}s | rows {res['on'][0][1]} | same result {same}",
                  flush=True)
        conn.execute("RESET jit")
        print(f"TOTAL (best of 2 each): jit on {tot['on']:.1f}s | off {tot['off']:.1f}s")


if __name__ == "__main__":
    main()
