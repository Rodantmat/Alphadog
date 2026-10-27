#!/usr/bin/env python3
"""RESEARCH - DRY RUN OF THE BETR LIVE ENGINE (betr_live_slip_engine.build) on one slate: prints the slips it WOULD build and why legs
fell out, writes nothing (read-only). Env: DATABASE_URL, BT_DATE (default today PT), BT_MAX_AGE_H (stale-board guard, default 999)."""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_live_slip_engine as B  # noqa: E402
import sleeper_live_slip_engine as SL  # noqa: E402


def main():
    day = dt.date.fromisoformat(os.environ["BT_DATE"]) if os.environ.get("BT_DATE") else dt.datetime.now(B.PT).date()
    with SL.connect() as conn:
        cfg = dict(SL.cfg(conn, "betr_live") or {}, max_board_age_h=float(os.environ.get("BT_MAX_AGE_H", "999")))
        rj = B.rules(conn)
        slips, last, note = B.build(conn, day, cfg)
        print(f"DRY {day}: {note}")
        for i, s in enumerate(slips, 1):
            print(f"  slip {i}: Dynamic top x{B.top_multiplier(len(s), s, rj)}")
            for l in s:
                print(f"     {l['player']:<24} {l['prop']:<11} {l['side']:<5} {l['line']:>5}  hp {100 * l['p']:.1f}%  books {100 * l['pf']:.1f}%  "
                      f"team {l['team']} game {l['game']}")
        if not slips:
            print("  no slip")


if __name__ == "__main__":
    main()
