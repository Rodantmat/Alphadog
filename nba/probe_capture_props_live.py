#!/usr/bin/env python3
"""
PROBE (nba-probe.yml): the live market term end to end on TODAY's slate - capture_parlay_props in capture mode (sportsbook
rows into board_snapshots, label 'window', today's ET date), then build_rung_market for the current month, then read back how
many PrizePicks rungs of today got a book count and the books-per-rung distribution vs the certified history's window.
Writes exactly what P3's two steps write (idempotent upserts); nothing else. Env: DATABASE_URL.
"""
import os
import runpy
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
today = datetime.now(ZoneInfo("America/New_York")).date()
os.environ["CP_MODE"] = "capture"
os.environ["CP_LABEL"] = "window"
os.environ["CP_DATE"] = today.isoformat()
os.environ["CP_FORCE"] = "1"
print(f"== capture_parlay_props (capture) for {today} ==", flush=True)
runpy.run_path(os.path.join(HERE, "capture_parlay_props.py"), run_name="__main__")
print("== build_rung_market (current month) ==", flush=True)
runpy.run_path(os.path.join(HERE, "build_rung_market.py"), run_name="__main__")

conn = psycopg.connect(os.environ["DATABASE_URL"])
print("== read-back ==", flush=True)
for r in conn.execute("""SELECT bookmaker, count(*), count(DISTINCT player), count(DISTINCT market_key) FROM nba_market.board_snapshots
                         WHERE game_date=%s AND snapshot_label='window' AND bookmaker NOT IN ('prizepicks','underdog','sleeper','fliff','betr')
                         GROUP BY 1 ORDER BY 2 DESC""", (today,)).fetchall():
    print(f"  sportsbook rows today: {r[0]:<16} {r[1]:>6} rows, {r[2]} players, {r[3]} markets", flush=True)
r = conn.execute("SELECT count(*), round(avg(books),2), max(books) FROM nba_market.rung_market WHERE game_date=%s AND snapshot_label='window'", (today,)).fetchone()
print(f"  rung_market today (window): {r[0]} PrizePicks rungs with a book count, avg books {r[1]}, max {r[2]}", flush=True)
n_pp = conn.execute("SELECT count(DISTINCT (player, base_market, line)) FROM nba_market.board_tiers_v2 WHERE bookmaker='prizepicks' AND game_date=%s AND snapshot_label='window'", (today,)).fetchone()[0]
print(f"  PrizePicks window rungs today: {n_pp} -> covered {r[0]} ({(100.0*r[0]/n_pp if n_pp else 0):.1f}%)", flush=True)
print("  certified history, books per priced rung at the window (reference):", flush=True)
for row in conn.execute("""SELECT to_char(game_date,'YYYY-MM') m, count(*) rungs, round(avg(books),2) avg_books, round(100.0*sum((books>=4)::int)/count(*),1) pct_ge4
                           FROM nba_market.rung_market WHERE snapshot_label='window' AND game_date BETWEEN '2025-10-21' AND '2026-01-31' GROUP BY 1 ORDER BY 1""").fetchall():
    print(f"    {row[0]}: {row[1]:>7} rungs, avg books {row[2]}, >=4 books {row[3]}%", flush=True)
conn.close()
print("DONE", flush=True)
