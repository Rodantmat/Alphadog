#!/usr/bin/env python3
"""
AUDIT - THE PATH OUT OF RED, PROVEN ON REAL SLIPS, ROLLED BACK (2026-10-15). Nothing persists: one transaction, commit()
suppressed, rolled back at the end, then the ledger is checked unchanged.

1. backtest source: release_record on a strategy whose backtest table holds the season (A_wsteals_5flex, 2026-02-15) - the
   same statistic P5 used before.
2. live source: the real B_demon_5flex backtest slips (k = 1) of 2025-11-01 .. 2026-02-14 are copied into nba_score.live_slips
   one year LATER as graded shadows (a season the backtest table does not hold), the strategy is set red, and the replay's P5
   stand-in (simulate_p5) runs for 2027-02-15: the record must come from the live ledger, and the state must follow the
   lower bound (paper at RELEASE_CAP 1 with RELEASED when > 0; red otherwise).
3. the same with too few days (2026-12-10: < 40 days) - must hold red.
Env: DATABASE_URL.
"""
import datetime as dt
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402


class NoCommit:
    def __init__(self, c): self._c = c
    def commit(self): pass
    def __getattr__(self, n): return getattr(self._c, n)


def main():
    raw = psycopg.connect(os.environ['DATABASE_URL'])
    raw.execute("SET statement_timeout = 0")
    before = raw.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0]
    st0 = raw.execute("SELECT state, live_cap, hurdles::text FROM nba_score.live_strategy_state WHERE strategy='B_demon_5flex'").fetchone()
    conn = NoCommit(raw)
    ok = True
    try:
        lo, n, src = L.release_record(conn, 'A_wsteals_5flex', dt.date(2026, 2, 15))
        print(f"1. A_wsteals_5flex 2026-02-15: source {src}, {n} days, lower bound {lo if lo is None else f'{lo:+.1%}'}", flush=True)
        ok &= (src == 'backtest' and n >= 40 and lo is not None)

        tbl = L.bt_table(conn, 'B_demon_5flex')
        comp, size, structure, cap = L.STRATEGIES['B_demon_5flex'][:4]
        n_ins = conn.execute(f"""INSERT INTO nba_score.live_slips (game_date, strategy, k, legs_json, size, structure, status, hits, payout, profit)
                                 SELECT (game_date + interval '1 year')::date, 'B_demon_5flex', k, legs_json, size, structure, 'graded_shadow', hits, payout, profit
                                 FROM {tbl} WHERE composition=%s AND size=%s AND structure=%s AND k=1
                                   AND game_date BETWEEN '2025-11-01' AND '2026-02-14'
                                 ON CONFLICT DO NOTHING""", (comp, size, structure)).rowcount
        exp = conn.execute(f"""SELECT count(DISTINCT game_date), sum(profit) / count(*) FROM {tbl} WHERE composition=%s AND size=%s AND structure=%s AND k=1
                               AND game_date BETWEEN '2025-11-01' AND '2026-02-14'""", (comp, size, structure)).fetchone()
        print(f"2. copied {n_ins} real B_demon_5flex slips one year later ({exp[0]} days, backtest ROI {float(exp[1]):+.1%})", flush=True)
        lo2, n2, src2 = L.release_record(conn, 'B_demon_5flex', dt.date(2027, 2, 15))
        print(f"   release_record 2027-02-15: source {src2}, {n2} days, lower bound {lo2 if lo2 is None else f'{lo2:+.1%}'}", flush=True)
        ok &= (src2 == 'live' and n2 == exp[0])

        lo3, n3, src3 = L.release_record(conn, 'B_demon_5flex', dt.date(2026, 12, 10))
        print(f"3. too few days (2026-12-10): source {src3}, {n3} days, lower bound {lo3} -> must hold", flush=True)
        ok &= (lo3 is None)

        conn.execute("UPDATE nba_score.live_strategy_state SET state='red', live_cap=0, hurdles='{\"RED_STICKY\": \"1\"}' WHERE strategy='B_demon_5flex'")
        L.simulate_p5(conn, dt.date(2027, 2, 15))
        st = conn.execute("SELECT state, live_cap, hurdles FROM nba_score.live_strategy_state WHERE strategy='B_demon_5flex'").fetchone()
        print(f"   after simulate_p5: state {st[0]}, cap {st[1]}, hurdles {st[2]}", flush=True)
        if lo2 is not None and lo2 > 0:
            ok &= (st[0] == 'paper' and st[1] == L.RELEASE_CAP['B_demon_5flex'] and st[2].get('RELEASED') == '1')
        else:
            ok &= (st[0] == 'red')
    finally:
        raw.rollback()
    after = raw.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0]
    st1 = raw.execute("SELECT state, live_cap, hurdles::text FROM nba_score.live_strategy_state WHERE strategy='B_demon_5flex'").fetchone()
    print(f"rollback: live_slips {before} -> {after}; B_demon_5flex state {st0} -> {st1}", flush=True)
    ok &= (before == after and st0 == st1)
    print("RESULT:", "PASS" if ok else "FAIL", flush=True)
    raw.close()
    if not ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
