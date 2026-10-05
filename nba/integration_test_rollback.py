#!/usr/bin/env python3
"""
END-TO-END INTEGRATION TEST, ROLLED BACK (strategy doc §31q). On one real historical slate, the PRODUCTION entry points in
sequence inside ONE transaction that is rolled back at the end (commit() suppressed):
  PrizePicks: pick() [board guard, stake_weight] -> grade() [box scores] -> edge_monitor() [reads the graded slips]
  Underdog:   pick() -> grade() [per-leg outcomes] -> ud_edge_monitor()
Asserts on what each step wrote (read inside the transaction), then rolls back and verifies the ledgers are empty again.
Env: DATABASE_URL, IT_DATE (default 2026-01-10).
"""
import datetime as dt
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('UD_EXCL_CENTER', '1')
import live_slip_engine as L  # noqa: E402
import ud_live_slip_engine as U  # noqa: E402


class NoCommit:
    def __init__(self, c): self._c = c
    def commit(self): pass
    def __getattr__(self, n): return getattr(self._c, n)


def main():
    day = dt.date.fromisoformat(os.environ.get('IT_DATE', '2026-01-10'))
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    nc = NoCommit(conn)
    ok = True
    def check(label, cond, detail=''):
        nonlocal ok
        ok &= bool(cond)
        print(f"  {'PASS' if cond else 'FAIL'}  {label} {detail}", flush=True)
    before = (conn.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0],
              conn.execute("SELECT count(*) FROM nba_score.ud_live_slips").fetchone()[0])
    print(f"INTEGRATION TEST on {day} (one transaction, rolled back). Ledgers before: PP {before[0]}, UD {before[1]}", flush=True)
    try:
        prev = day - dt.timedelta(days=1)
        print(f"\n-- prior slate {prev}: PrizePicks + Underdog pick and grade (so each monitor has 2 graded slates)", flush=True)
        L.pick(nc, prev, require_fresh=False); L.grade(nc, prev)
        U.pick(nc, prev); U.grade(nc, prev)
        print("\n-- PrizePicks pick", flush=True)
        L.pick(nc, day, require_fresh=False)
        rows = conn.execute("SELECT status, stake_weight, legs_json FROM nba_score.live_slips WHERE game_date=%s AND k < 100", (day,)).fetchall()
        check("slips placed", len(rows) > 0, f"({len(rows)})")
        check("every slip has a stake_weight in {1.0, 0.5}", all(r[1] in (1.0, 0.5) for r in rows))
        sw_ok = all(r[1] == L.star_under_weight(r[2]) for r in rows)
        check("stake_weight == star_under_weight(legs) on every slip", sw_ok,
              f"(halved: {sum(1 for r in rows if r[1] == 0.5)})")
        check("every leg carries cell/tier/side/factor", all(all(k in j for k in ('cell', 'tier', 'side', 'factor')) for r in rows for j in r[2]))
        print("\n-- PrizePicks grade", flush=True)
        L.grade(nc, day)
        g = conn.execute("""SELECT count(*) FILTER (WHERE status LIKE 'graded%%'), count(*) FILTER (WHERE status NOT LIKE 'graded%%' AND status <> 'dup'),
                                   count(*) FILTER (WHERE status = 'dup') FROM nba_score.live_slips WHERE game_date=%s AND k < 100""", (day,)).fetchone()
        check("every non-dup slip graded", g[1] == 0, f"(graded {g[0]}, ungraded {g[1]}, dup {g[2]})")
        statuses = [r[0] for r in conn.execute("SELECT DISTINCT status FROM nba_score.live_slips WHERE game_date=%s AND k < 100", (day,)).fetchall()]
        print(f"     statuses present: {sorted(statuses)}", flush=True)
        print("\n-- PrizePicks edge monitor", flush=True)
        L.edge_monitor(nc, day)
        run_row = conn.execute("SELECT slates, delta_star, decision FROM nba_score.edge_monitor WHERE look = 0").fetchone()
        check("edge monitor recorded its running row from BOTH graded slates", run_row is not None and run_row[0] == 2, f"{run_row}")
        check("edge monitor uses the fixed break-even", run_row is not None and abs(run_row[1] - L.EDGE_DELTA) < 1e-12)
        legs_counted = conn.execute("""SELECT count(*) FROM nba_score.live_slips s, jsonb_array_elements(s.legs_json) j
                                       WHERE s.game_date=%s AND s.k < 100 AND s.status LIKE 'graded%%' AND s.strategy = ANY(%s)
                                         AND (j->>'hit') IS NOT NULL""", (day, L.edge_daily_strategies())).fetchone()[0]
        print(f"     daily-strategy graded legs the monitor reads: {legs_counted}", flush=True)
        print("\n-- Underdog pick", flush=True)
        U.pick(nc, day)
        ud = conn.execute("SELECT portfolio, stake, status FROM nba_score.ud_live_slips WHERE game_date=%s", (day,)).fetchall()
        check("Underdog slips placed", len(ud) > 0, f"({len(ud)}; P5 staked {sum(1 for r in ud if r[0]=='P5' and r[1] > 0)})")
        print("\n-- Underdog grade", flush=True)
        U.grade(nc, day)
        lg = conn.execute("""SELECT count(*) FILTER (WHERE j ? 'hit'), count(*) FILTER (WHERE (j->>'hit') IS NULL AND j ? 'void'), count(*)
                             FROM nba_score.ud_live_slips s, jsonb_array_elements(s.legs_json) j WHERE s.game_date=%s""", (day,)).fetchone()
        check("every Underdog leg carries its outcome (hit, or void with reason)", lg[0] == lg[2], f"(legs {lg[2]}, with outcome {lg[0]}, voids {lg[1]})")
        pay = conn.execute("SELECT count(*) FROM nba_score.ud_live_slips WHERE game_date=%s AND graded_at IS NOT NULL", (day,)).fetchone()[0]
        check("every Underdog slip graded", pay == len(ud), f"({pay}/{len(ud)})")
        print("\n-- Underdog edge monitor", flush=True)
        U.ud_edge_monitor(nc, day)
        urow = conn.execute("SELECT slates, delta_star FROM nba_score.ud_edge_monitor WHERE look = 0").fetchone()
        check("Underdog edge monitor recorded its running row", urow is not None and urow[0] >= 1, f"{urow}")
    finally:
        conn.rollback()
        after = (conn.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0],
                 conn.execute("SELECT count(*) FROM nba_score.ud_live_slips").fetchone()[0],
                 conn.execute("SELECT count(*) FROM nba_score.edge_monitor").fetchone()[0],
                 conn.execute("SELECT count(*) FROM nba_score.ud_edge_monitor").fetchone()[0])
        print(f"\nROLLED BACK - ledgers after: PP {after[0]}, UD {after[1]}, edge_monitor {after[2]}, ud_edge_monitor {after[3]} "
              f"(must equal the state before: PP {before[0]}, UD {before[1]}, monitors 0, 0)", flush=True)
        ok &= after == (before[0], before[1], 0, 0)
    print("\nRESULT:", "ALL PASS" if ok else "FAILURES ABOVE", flush=True)
    conn.close()
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
