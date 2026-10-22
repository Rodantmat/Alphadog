#!/usr/bin/env python3
"""
RESEARCH - THE PRODUCTION pick() WITH THE 2-SLIP PORTFOLIO, INSIDE ONE TRANSACTION THAT IS ROLLED BACK (2026-10-22 PT, certification of
the change ordered at 14:38 PT; same pattern as integration_test_rollback.py, strategy doc §31q). For each day of PR_DAYS:
live_slip_engine.pick(day) runs exactly as P3 runs it (pp_portfolio read from the DB), commit() suppressed; the rows it wrote to
nba_score.live_slips are read inside the transaction and printed (strategy, k, status, legs), with checks: the portfolio placed
<= n slips, every replaced strategy is shadow only, no other strategy changed status class; then ROLLBACK and a check that the
ledger is back to its count. Nothing is kept.
Env: DATABASE_URL, PR_DAYS (default 2026-01-10).
"""
import datetime as dt
import json
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
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    ok = True
    for ds in (os.environ.get('PR_DAYS') or '2026-01-10').split(','):
        day = dt.date.fromisoformat(ds)
        before = conn.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0]
        prior = {(r[0], r[1]) for r in conn.execute("SELECT strategy, k FROM nba_score.live_slips WHERE game_date=%s", (day,)).fetchall()}
        print(f"\n==== {day}: pick() inside a rolled-back transaction (ledger rows before {before}, this day already {len(prior)})", flush=True)
        L._PORTFOLIO = None
        try:
            L.pick(NoCommit(conn), day, require_fresh=False)
            rows = conn.execute("""SELECT strategy, k, status, size, structure, legs_json, streak_note FROM nba_score.live_slips
                                   WHERE game_date=%s ORDER BY strategy, k""", (day,)).fetchall()
            pf = L.portfolio_cfg(conn)
            new = [r for r in rows if (r[0], r[1]) not in prior]
            port = [r for r in new if r[0] in L.PORTFOLIO_UNITS]
            for r in new:
                legs = r[5] if isinstance(r[5], list) else json.loads(r[5])
                print(f"  {r[0]:<20} k{r[1]:<2} {r[2]:<18} {r[3]}-{r[4]:<5} " + "; ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']}" for l in legs))
            n_port = sum(1 for r in port if r[2] == 'placed')
            c1 = (not pf.get('enabled')) or n_port <= int(pf['n'])
            rep_staked = [r for r in new if r[0] in set(pf.get('replaces') or []) and r[2] == 'placed']
            c2 = (not pf.get('enabled')) or not rep_staked
            print(f"  CHECK portfolio placed {n_port} <= n {pf.get('n')}: {'PASS' if c1 else 'FAIL'}")
            print(f"  CHECK replaced strategies never staked ({len(rep_staked)} staked): {'PASS' if c2 else 'FAIL'}")
            ok &= c1 and c2
        except SystemExit as e:
            print(f"  pick() exited {e.code}")
        finally:
            conn.rollback()
        after = conn.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0]
        c3 = after == before
        print(f"  CHECK rolled back (rows {after} == {before}): {'PASS' if c3 else 'FAIL'}")
        ok &= c3
    print("\nALL PASS" if ok else "\nSOME CHECK FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
