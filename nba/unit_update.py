#!/usr/bin/env python3
"""
EARN THE RAISE, EVERY APP (2026-10-28, owner 13:00 PT: "I am placing at 2 now, and we will count from the last adjusted strategies,
so 4 days ago. I want it to show itself on the slip screen and give an alert message of unit amount change").

Runs in P2A AFTER every app is graded (PrizePicks, Underdog, Sleeper, Fliff, Betr). With classification_config['stake_unit'].auto
enabled, walks every slate from auto.count_from (else the season start) to the last graded slate, in order, and applies
live_slip_engine.auto_unit (the same rule: + step each time the profit reaches up_x x the next unit, - step when the drop from the
high reaches down_x x the unit, never below floor / above max). Idempotent: each slate's row is rebuilt from the rows before it.
The final unit is written to stake_unit.unit_usd; the Slips screen shows it and flags a change.
Env: DATABASE_URL, UNIT_DATE (last slate to apply, default yesterday PT), UNIT_DRY=1 (print, roll back).
"""
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L   # noqa: E402


def main():
    today = dt.datetime.now(ZoneInfo('America/Los_Angeles')).date()
    last = dt.date.fromisoformat(os.environ['UNIT_DATE']) if os.environ.get('UNIT_DATE') else today - dt.timedelta(days=1)
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    a = L.unit_auto_cfg(conn)
    if not a.get('enabled'):
        print("unit: earn the raise is off (a hand-set unit) - nothing to do", flush=True)
        return
    s0, _u, _h = L.unit_season_state(conn, last)
    days = [r[0] for r in conn.execute("""SELECT DISTINCT game_date FROM (
                SELECT game_date FROM nba_score.live_slips UNION SELECT game_date FROM nba_score.ud_live_slips
                UNION SELECT game_date FROM nba_score.sleeper_live_slips UNION SELECT game_date FROM nba_score.fliff_live_slips
                UNION SELECT game_date FROM nba_score.betr_live_slips) d WHERE game_date BETWEEN %s AND %s ORDER BY 1""", (s0, last)).fetchall()]
    print(f"unit: apps {a.get('apps')}, counting from {s0}, start {a['start']:g}, floor {a.get('floor')}, slates {len(days)} up to {last}", flush=True)
    for d in days:
        L.auto_unit(conn, d)
    row = conn.execute("""SELECT game_date, unit_from, unit_usd, season_profit, season_high, reason FROM nba_score.live_unit_history
                          WHERE season_start=%s ORDER BY game_date DESC LIMIT 1""", (s0,)).fetchone()
    if row:
        print(f"unit: NEXT SLATE ${float(row[2]):.2f} (after {row[0]}: profit {float(row[3]):+.2f}, high {float(row[4]):.2f}; {row[5]})", flush=True)
        if float(row[1]) != float(row[2]):
            print(f"::warning::UNIT CHANGE ${float(row[1]):.2f} -> ${float(row[2]):.2f} ({row[5]})", flush=True)
    if os.environ.get('UNIT_DRY') == '1':
        conn.rollback()
        print("unit: DRY RUN - rolled back", flush=True)
    else:
        conn.commit()


if __name__ == "__main__":
    main()
