#!/usr/bin/env python3
"""
AUDIT - UNDERDOG PORTFOLIO T THROUGH THE PRODUCTION ENTRY POINTS, ROLLED BACK (2026-10-25; owner chose T 20:01 PT). On real past
slates, inside ONE transaction that is rolled back (commit() suppressed, as integration_test_rollback.py):
  ud_live_slip_engine.pick(day) -> grade(day), with classification_config['ud_live_portfolio'].live = 'T' as stored.
Checks per slate: T rows = the shared builder's slips on the same legs (ud_portfolio_t on load_legs), status 'live' stake 1 (or
the T stand-down), P5 / P4 recorded 'shadow', every T slip graded with a payout; then the ledger is unchanged after rollback.
Env: DATABASE_URL, AT_DATES (comma list, default 2025-01-15,2026-01-10,2026-10-24).
"""
import datetime as dt
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('UD_EXCL_CENTER', '1')
os.environ['UDL_FORCE'] = '1'                  # a slate that already has rows is rebuilt INSIDE the rolled-back transaction
import ud_live_slip_engine as U  # noqa: E402
import ud_portfolio_t as UPT     # noqa: E402


class NoCommit:
    def __init__(self, c): self._c = c
    def commit(self): pass
    def __getattr__(self, n): return getattr(self._c, n)


def main():
    days = [dt.date.fromisoformat(x) for x in (os.environ.get('AT_DATES') or '2025-01-15,2026-01-10,2026-10-24').split(',')]
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    nc = NoCommit(conn)
    ok = True

    def check(label, cond, detail=''):
        nonlocal ok
        ok &= bool(cond)
        print(f"  {'PASS' if cond else 'FAIL'}  {label} {detail}", flush=True)
    before = conn.execute("SELECT count(*), coalesce(sum(stake), 0), count(graded_at) FROM nba_score.ud_live_slips").fetchone()
    print(f"live portfolio in force: {U.ud_live_portfolio(conn)} | ledger before: {before}", flush=True)
    try:
        for day in days:
            print(f"\n== {day}", flush=True)
            legs = U.load_legs(conn, day)
            raw = UPT.raw_legs(legs); pool = U.E.eligible_legs(legs)
            want = {}
            for uid in UPT.UNITS:
                s = UPT.unit_slip(uid, raw, pool, U.E)
                want[f"{uid} {UPT.LABEL[uid]}"] = None if s is None else sorted((l['player'], l['prop'], l['side'], float(l['line'])) for l in s)
            U.pick(nc, day)
            rows = conn.execute("SELECT portfolio, composition, stake, status, legs_json FROM nba_score.ud_live_slips WHERE game_date=%s", (day,)).fetchall()
            t = {r[1]: r for r in rows if r[0] == 'T'}
            sd = U.stand_down(conn, day)
            exp_stake = 0.0 if sd in ('final_week', 'postseason') else 1.0
            check("T rows == the shared builder's slips", {k: sorted((j['player'], j['prop'], j['side'], float(j['line'])) for j in (r[4] if isinstance(r[4], list) else json.loads(r[4])))
                                                          for k, r in t.items()} == {k: v for k, v in want.items() if v is not None},
                  f"({len(t)} T slips)")
            check("T stake / status", all(float(r[2]) == exp_stake and (r[3] == 'live' if exp_stake else r[3].startswith('stand_down')) for r in t.values()),
                  f"(stand-down: {sd or 'no'})")
            check("P5 / P4 recorded as shadow (or stand-down)", all(r[3] == 'shadow' or r[3].startswith('stand_down') for r in rows if r[0] in ('P5', 'P4')),
                  f"({sum(1 for r in rows if r[0] in ('P5', 'P4'))} rows)")
            for r in t.values():
                lj = r[4] if isinstance(r[4], list) else json.loads(r[4])
                print(f"     {r[1]:<44} stake {float(r[2]):.1f} {r[3]:<10} " + " | ".join(f"{j['player']} {j['prop']} {j['side']} {j['line']} x{j['factor']}" for j in lj), flush=True)
            U.grade(nc, day)
            g = conn.execute("SELECT composition, payout, profit, hits, remaining FROM nba_score.ud_live_slips WHERE game_date=%s AND portfolio='T'", (day,)).fetchall()
            check("every T slip graded", len(g) == len(t) and all(x[1] is not None or x[4] is not None for x in g) if day < dt.date(2026, 10, 25) else True,
                  "; ".join(f"{x[0].split()[0]} hits {x[3]}/{x[4]} payout {x[1]} profit {x[2]}" for x in g))
    finally:
        conn.rollback()
        after = conn.execute("SELECT count(*), coalesce(sum(stake), 0), count(graded_at) FROM nba_score.ud_live_slips").fetchone()
        print(f"\nROLLED BACK - ledger after: {after} (must equal before: {before})", flush=True)
        ok &= after == before
    print("\nRESULT:", "ALL PASS" if ok else "FAILURES ABOVE", flush=True)
    conn.close()
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
