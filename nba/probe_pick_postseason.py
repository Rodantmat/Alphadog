#!/usr/bin/env python3
"""
PROBE - the live engine's postseason pick path on past postseason slates, WITHOUT writing anything (§31w P-6 verification).

For each probe date (PROBE_DATES, default three 2025-26 postseason nights: a play-in night, a first-round night, a Finals night):
  1. confirms live_slip_engine.postseason_slate() says yes (and says no for a regular-season control date);
  2. loads the board exactly as the live pick does (load_board_legs - pp_leg_price + final_hp, team/event resolution through the
     slate predicate);
  3. runs pick_postseason() inside a transaction whose commit is disabled, prints what it would have staked / shadowed, and
     ROLLS BACK - nba_score.live_slips / live_pool are left exactly as they were (verified by row counts before and after).
Env: DATABASE_URL, PROBE_DATES (comma list), PROBE_CONTROL (a regular-season date).
"""
import datetime as dt
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as LS  # noqa: E402


class NoCommit:
    """psycopg connection proxy: commit() is a no-op, everything else passes through (the probe rolls back at the end)."""
    def __init__(self, conn):
        self._c = conn

    def commit(self):
        return None

    def __getattr__(self, name):
        return getattr(self._c, name)


def counts(conn):
    return (conn.execute("SELECT count(*) FROM nba_score.live_slips").fetchone()[0],
            conn.execute("SELECT count(*) FROM nba_score.live_pool").fetchone()[0])


def main():
    dates = [dt.date.fromisoformat(x.strip()) for x in os.environ.get("PROBE_DATES", "2026-04-15,2026-04-25,2026-06-10").split(",") if x.strip()]
    control = dt.date.fromisoformat(os.environ.get("PROBE_CONTROL", "2026-03-15"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    before = counts(conn)
    conn.commit()
    print(f"ledger before: live_slips {before[0]:,} rows, live_pool {before[1]:,} rows", flush=True)
    print(f"control {control}: postseason_slate = {LS.postseason_slate(conn, control)} (expected False)", flush=True)
    ok = not LS.postseason_slate(conn, control)
    for d in dates:
        is_post = LS.postseason_slate(conn, d)
        print(f"\n=== {d}: postseason_slate = {is_post}", flush=True)
        ok &= is_post
        legs = LS.load_board_legs(conn, d)
        n_board = len({(l['player_id'], l['prop'], l['tier'], l['side'], l['line']) for l in legs if not l.get('whole_number')})
        print(f"  board: {len(legs):,} rank-key rows, {n_board:,} unique scored legs, team resolved "
              f"{sum(1 for l in legs if l.get('team_id'))/max(len(legs), 1):.1%}, event resolved {sum(1 for l in legs if l.get('event_id'))/max(len(legs), 1):.1%}",
              flush=True)
        nc = NoCommit(conn)
        LS.pick_postseason(nc, d, legs)
        rows = conn.execute("""SELECT strategy, status, count(*), max(size) FROM nba_score.live_slips WHERE game_date=%s
                               AND status IN ('placed_post','placed_post_shadow') GROUP BY 1,2 ORDER BY 1""", (d,)).fetchall()
        for r in rows:
            print(f"    would record: {r[0]:<20} {r[1]:<20} {r[2]} slip(s)", flush=True)
        conn.rollback()
    after = counts(conn)
    print(f"\nledger after rollback: live_slips {after[0]:,}, live_pool {after[1]:,} -> {'UNCHANGED' if after == before else 'CHANGED (!)'}", flush=True)
    ok &= after == before
    conn.close()
    print("PROBE", "PASS" if ok else "FAIL", flush=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
