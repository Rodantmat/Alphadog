#!/usr/bin/env python3
"""DRY CHECK of the 2026-11-24 linear unit (owner 11:44 PT: $1, +$1 every 25 units earned, all apps; text Accumulated from 0). Everything rolled back.
1. real config: unit_for(app, 2026-11-24) must be $1 for every app; the text block for today must read 'Accumulated: $0'.
2. simulation: linear.from moved to 2026-10-20 inside the transaction, update() walked to 2026-11-23 - prints each day's units, the unit path and
   each app's accumulated dollars, to show raises / step-downs follow +$1 per 25 units."""
import datetime as dt
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import unit_per_app as UPA   # noqa: E402
import p3_text as PT         # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"])
day = dt.date(2026, 11, 24)
print("UL|unit for 2026-11-24: " + ", ".join(f"{a} ${UPA.unit_for(conn, a, day):g}" for a in UPA.APPS), flush=True)
print("UL|text block today: " + repr(PT._rb(conn, "rodo", "2026-11-24")), flush=True)
conn.execute("""UPDATE nba_config.classification_config SET config_json = jsonb_set(config_json::jsonb, '{per_app,linear,from}', '"2026-10-20"')
                WHERE config_key='stake_unit'""")
out = UPA.update(conn, dt.date(2026, 11, 23))
print("UL|simulated from 10-20: " + json.dumps(out), flush=True)
print("UL|text block 11-24 (simulated): " + repr(PT._rb(conn, "rodo", "2026-11-24")), flush=True)
conn.rollback()
print("UL|rolled back", flush=True)
