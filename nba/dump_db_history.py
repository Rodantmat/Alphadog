#!/usr/bin/env python3
"""
OFF-DATABASE ARCHIVE OF THE BIG INGREDIENT TABLES (retention audit 2026-10-08).

Owner principle (2026-09-25): the ingredients - the boards and market data above all - are extremely expensive and must
never be lost. The provider keeps SEVEN days of cluster backups; the two-season Odds API board history (27M rows, bought
on the paid plan) and everything graded against it exist nowhere else. This writes each listed table, per season, as
CSV.GZ into db_history/ (NOT the repo tree - the files are hundreds of MB) for nba-db-history-archive.yml to attach to a
GitHub Release (assets carry no repo bloat; 2 GB per file). Per-season files stay well under that limit.

Env: DATABASE_URL; HIST_SEASONS (comma list, default 2024-25,2025-26); HIST_TABLES (override the list below).
Season window: game_date in [Jul 1 of the first year, Jun 30 of the second].
"""
import gzip
import os
from pathlib import Path

import psycopg

OUT = Path("db_history")
# schema.table|date_column
TABLES = [
    "nba_market.board_snapshots|game_date", "nba_market.board_outcomes|game_date", "nba_market.game_lines_closing|game_date",
    "nba_market.game_lines_snapshots|game_date", "nba_daily.injury_report_snapshots|game_date", "nba_score.board_scored|game_date",
    "nba_score.baseline_history|game_date", "nba_score.final_hp|game_date", "nba_market.board_tiers_v2|game_date",
    # MLB Odds API / ParlayAPI mirror (2026-10-08, owner: retain everything mined): paid credits, DB-only - the per-event
    # board snapshots at 09:00 / 13:00 / 17:00 PT, the game lines, ParlayAPI closing lines and the live board captures
    "market.mlb_odds_event_snapshots|game_date", "market.mlb_odds_game_lines|game_date", "market.mlb_odds_backfill_log|game_date",
    "market.mlb_game_lines_closing|game_date", "market.mlb_live_market_captures|capture_date",
    # game_officials / player_game_starter_status are keyed by game_id (no date column) and their raw per-game JSON is
    # committed to the repo by P2A - covered there, not here
]


def season_window(season):
    y0 = int(season[:4])
    return f"{y0}-07-01", f"{y0 + 1}-06-30"


def main():
    seasons = [s.strip() for s in os.environ.get("HIST_SEASONS", "2024-25,2025-26").split(",") if s.strip()]
    tables = [t.strip() for t in (os.environ.get("HIST_TABLES") or ",".join(TABLES)).split(",") if t.strip()]   # empty env = default list
    OUT.mkdir(parents=True, exist_ok=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    for spec in tables:
        table, _, col = spec.partition("|")
        if conn.execute("SELECT to_regclass(%s)", (table,)).fetchone()[0] is None:
            print(f"  {table}: does not exist - skipped", flush=True)
            continue
        cols = [r[0] for r in conn.execute("""SELECT column_name FROM information_schema.columns
                                              WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position""", tuple(table.split("."))).fetchall()]
        if col not in cols:
            print(f"  {table}: no column {col} - skipped", flush=True)
            continue
        for season in seasons:
            d0, d1 = season_window(season)
            path = OUT / f"{table}.{season}.csv.gz"
            n = 0
            with conn.cursor() as cur, cur.copy(f"COPY (SELECT * FROM {table} WHERE {col} >= '{d0}' AND {col} <= '{d1}') TO STDOUT WITH (FORMAT csv, HEADER)") as cp, \
                    gzip.open(path, "wb", compresslevel=6) as f:
                for chunk in cp:
                    f.write(chunk)
                    n += bytes(chunk).count(b"\n")
            print(f"  {table} {season}: {max(n - 1, 0):,} rows -> {path} ({path.stat().st_size / 1e6:,.1f} MB)", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
