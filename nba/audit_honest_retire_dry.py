#!/usr/bin/env python3
"""DRY proof of the 2026-11-24 fix: when the rules leave an app with no honest slip, write() still retires that app's old non-honest slips.
Inside one transaction (rolled back): today's old Fliff / Sleeper rows are put back to 'live' (as P3 left them), the honest engine builds and writes,
then the old rows still 'live' are counted per table - must be 0."""
import datetime as dt
import os
import sys
import psycopg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_live_slip_engine as HL   # noqa: E402
day = dt.date.fromisoformat(os.environ.get("HL_DATE") or "2026-11-24")
conn = psycopg.connect(os.environ["DATABASE_URL"])
for t in ("fliff_live_slips", "sleeper_live_slips"):
    n = conn.execute(f"UPDATE nba_score.{t} SET status='live', stake=1 WHERE game_date=%s AND strategy NOT LIKE 'H\\_%%' AND graded_at IS NULL", (day,)).rowcount
    print(f"RT|{t}: {n} old rows set back to live (as P3 left them)", flush=True)
plan, notes = HL.build(conn, day, HL.ALL_APPS)
print("RT|plan apps: " + ", ".join(f"{a} {len(v)}" for a, v in plan.items()), flush=True)
HL.write(conn, day, plan, commit=False)
for t in ("live_slips", "ud_live_slips", "sleeper_live_slips", "fliff_live_slips", "betr_live_slips"):
    col = "composition" if t == "ud_live_slips" else "strategy"
    q = (f"SELECT count(*) FROM nba_score.{t} WHERE game_date=%s AND portfolio <> 'H' AND status NOT LIKE 'shadow%%'" if t == "ud_live_slips" else
         f"SELECT count(*) FROM nba_score.{t} WHERE game_date=%s AND {col} NOT LIKE 'H\\_%%' AND status NOT LIKE '%%shadow%%' AND status <> 'dup'")
    print(f"RT|{t}: old (non-honest) slips still on the screen after write: {conn.execute(q, (day,)).fetchone()[0]}", flush=True)
conn.rollback()
print("RT|rolled back", flush=True)
