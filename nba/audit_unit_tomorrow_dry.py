#!/usr/bin/env python3
"""DRY: what tomorrow morning's P2A unit step will do (unit_per_app.update after grading LAST) and the unit every app gets for DAY - rolled back."""
import datetime as dt
import json
import os
import sys
import psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import unit_per_app as UPA   # noqa: E402
last = dt.date.fromisoformat(os.environ.get("LAST") or "2026-11-24"); day = dt.date.fromisoformat(os.environ.get("DAY") or "2026-11-25")
conn = psycopg.connect(os.environ["DATABASE_URL"])
out = UPA.update(conn, last)
print("UT|update(" + str(last) + ") -> " + json.dumps(out), flush=True)
print("UT|unit for " + str(day) + ": " + ", ".join(f"{a} ${UPA.unit_for(conn, a, day):g}" for a in UPA.APPS), flush=True)
conn.rollback()
print("UT|rolled back", flush=True)
