#!/usr/bin/env python3
"""Dry test of nba/capture_odds_props.py (2026-11-22): the same code with OP_LABEL='probe', so nothing touches a slate's 'window' rows; then
counts what it wrote per book and market type, and deletes the probe rows again."""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["OP_LABEL"] = "probe"
import capture_odds_props as C

try:
    C.main()
except SystemExit as e:
    print(f"OPT|capture exit {e.code}", flush=True)
conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
for b, alt, n, pl in conn.execute("""SELECT bookmaker, market_key LIKE '%%alternate' alt, count(*), count(DISTINCT player) FROM nba_market.board_snapshots
                                      WHERE snapshot_label = 'probe' GROUP BY 1, 2 ORDER BY 3 DESC""").fetchall():
    print(f"OPT|{b:16s} {'alternate' if alt else 'main':9s} rows {n:6,} players {pl}", flush=True)
n_del = conn.execute("DELETE FROM nba_market.board_snapshots WHERE snapshot_label = 'probe'").rowcount
print(f"OPT|deleted probe rows: {n_del:,}", flush=True)
