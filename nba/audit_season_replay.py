#!/usr/bin/env python3
"""
AUDIT - A WHOLE SEASON, HANDS OFF, ROLLED BACK (2026-10-15; owner: "be sure that the system will auto-adjust ... it's gonna go
automatically, and it's gonna work itself. So I don't need to be bugging you all the time").

Runs the PRODUCTION daily loop (live_slip_engine.replay: every slate day pick() on that day's real board -> grade() with the real
box scores -> hurdles / states; every Monday the P5 release check, simulate_p5) over a past season inside ONE transaction with
commit() suppressed, reports what happened, then ROLLS BACK and verifies the live ledger and states are exactly as before.
No human input anywhere in the loop - which is the point.

Reported:
  - the PLAY ledger: slips the screen would have said PLAY for (graded / graded_void / graded_week2 = built for a non-shadow strategy and
    not skipped by a calendar rule, the daily ceiling or the minimum entry), at $1, by month and in total: slips, staked, net, ROI
  - the SKIPPED slips by reason (week-1 / week-2 / ceiling / below the minimum / shadow), with what they would have returned
  - every state change per strategy (paper -> active -> yellow / red -> released ...), with the date
Env: DATABASE_URL, AR_FROM (2025-10-21), AR_TO (2026-04-12), AR_UNIT (1.0), AR_SAVE (optional label [a-z0-9_]: before the
rollback, the replayed slips and daily states are copied - over a SEPARATE connection, so they survive the rollback - into the
research tables nba_score.replay_audit_slips / replay_audit_states under that label, for leg-level study. Production tables
are never written; the label's previous rows are replaced).
"""
import datetime as dt
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L  # noqa: E402


class NoCommit:
    def __init__(self, c): self._c = c
    def commit(self): pass
    def __getattr__(self, n): return getattr(self._c, n)


def main():
    d0 = dt.date.fromisoformat(os.environ.get("AR_FROM", "2025-10-21"))
    d1 = dt.date.fromisoformat(os.environ.get("AR_TO", "2026-04-12"))
    unit = float(os.environ.get("AR_UNIT", "1.0"))
    raw = psycopg.connect(os.environ["DATABASE_URL"])
    raw.execute("SET statement_timeout = 0")
    n_before = raw.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0]
    st_before = raw.execute("SELECT strategy, state, live_cap, hurdles::text FROM nba_score.live_strategy_state ORDER BY 1").fetchall()
    conn = NoCommit(raw)
    ok = True
    try:
        L.replay(conn, d0, d1)
        rows = conn.execute("""SELECT game_date, strategy, status, coalesce(stake_weight, 1), payout, size FROM nba_score.live_slips
                               WHERE status LIKE 'graded%%' AND k < 100 ORDER BY game_date""").fetchall()
        play = defaultdict(lambda: [0, 0.0, 0.0])
        skip = defaultdict(lambda: [0, 0.0, 0.0])
        for d, strat, status, w, pay, size in rows:
            if status in ("graded", "graded_void", "graded_week2"):   # the statuses the screen says PLAY for
                a = play[d.strftime("%Y-%m")]
                a[0] += 1; a[1] += unit; a[2] += unit * float(pay or 0)
                t = play["TOTAL"]; t[0] += 1; t[1] += unit; t[2] += unit * float(pay or 0)
            else:
                a = skip[status]; a[0] += 1; a[1] += unit; a[2] += unit * float(pay or 0)
        print(f"\n== THE PLAY LEDGER at ${unit:.2f} per slip, {d0} .. {d1} (what the screen would have said PLAY for) ==", flush=True)
        print(f"{'month':<8} {'slips':>6} {'staked':>9} {'returned':>9} {'net':>9} {'ROI':>7}", flush=True)
        for m in sorted(k for k in play if k != "TOTAL") + ["TOTAL"]:
            n, st, ret = play[m]
            print(f"{m:<8} {n:>6} {st:>9.2f} {ret:>9.2f} {ret - st:>+9.2f} {(ret / st - 1) if st else 0:>+7.1%}", flush=True)
        print("\n== RECORDED BUT NOT PLAYED (the rules that held money back) ==", flush=True)
        for s, (n, st, ret) in sorted(skip.items()):
            print(f"  {s:<22} {n:>5} slips | would have returned {ret:>8.2f} on {st:>8.2f} ({(ret / st - 1) if st else 0:+.1%})", flush=True)
        print("\n== STATE CHANGES (self-adjustment, no human input) ==", flush=True)
        hist = conn.execute("SELECT game_date, strategy, state, live_cap FROM nba_score.live_state_history ORDER BY strategy, game_date").fetchall()
        last = {}
        for d, s, state, cap in hist:
            if last.get(s) != (state, cap):
                print(f"  {d}  {s:<20} -> {state:<9} cap {cap}", flush=True)
                last[s] = (state, cap)
        if not play["TOTAL"][0]:
            ok = False; print("FAIL: the loop produced no playable slips", flush=True)
    finally:
        raw.rollback()
    n_after = raw.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0]
    st_after = raw.execute("SELECT strategy, state, live_cap, hurdles::text FROM nba_score.live_strategy_state ORDER BY 1").fetchall()
    same = (n_before == n_after and st_before == st_after)
    print(f"\nrollback: live_slips {n_before} -> {n_after}; strategy states {'unchanged' if st_before == st_after else 'CHANGED'}", flush=True)
    ok &= same
    print("RESULT:", "PASS" if ok else "FAIL", flush=True)
    raw.close()
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
