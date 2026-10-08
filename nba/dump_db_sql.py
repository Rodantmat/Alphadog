#!/usr/bin/env python3
"""
DUMP THE DATABASE-RESIDENT SQL INTO THE REPO (round-2 P3#16, 2026-10-08).

Critical-path SQL lived only in Postgres - nba_market.refresh_board_rung_keys, nba_market.pp_leg_price, nba_score.log_paper_picks,
paper_pick_candidates, paper_pick_slips, grade_paper_picks, the pp_* pricing functions, nba_ref.norm_name - so it could neither be
certified from source nor recovered from git. This writes, for the NBA schemas:
  nba/sql/db_functions.sql   every function (pg_get_functiondef), ordered by schema.name
  nba/sql/db_views.sql       every view (CREATE OR REPLACE VIEW ... AS <pg_get_viewdef>)
nba/sql/refresh_board_rung_keys.sql and nba/sql/regular_season_games.sql are the hand-maintained sources of record for those two;
the dump includes them as well so the two can be diffed. The database is the running copy; these files are the record.
Env: DATABASE_URL. Run by nba-db-sql-dump.yml (weekly + on demand), which commits the files.
"""
import os
from pathlib import Path

import psycopg

SCHEMAS = ("nba_market", "nba_ref", "nba_score", "nba_control", "nba_calendar", "nba_daily", "nba_stats", "nba_config", "nba_team", "nba_season")
OUT = Path("nba/sql")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = '120s'")
    fns = conn.execute("""SELECT n.nspname || '.' || p.proname, pg_get_functiondef(p.oid)
                          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = ANY(%s) ORDER BY 1, pg_get_function_identity_arguments(p.oid)""", (list(SCHEMAS),)).fetchall()
    views = conn.execute("""SELECT schemaname || '.' || viewname, definition FROM pg_views
                            WHERE schemaname = ANY(%s) ORDER BY 1""", (list(SCHEMAS),)).fetchall()
    stamp = conn.execute("SELECT now()::date").fetchone()[0]
    hdr = (f"-- DUMP OF THE NBA DATABASE {{what}} ({stamp}, nba/dump_db_sql.py). The database is the running copy; this file is the\n"
           f"-- record (round-2 P3#16: critical-path SQL must be certifiable from source and recoverable from git).\n"
           f"-- Do not hand-edit: change the database (or the hand-maintained source files in this folder), then re-dump.\n\n")
    (OUT / "db_functions.sql").write_text(hdr.format(what="FUNCTIONS") + "\n\n".join(d.rstrip() + ";" for _, d in fns) + "\n", encoding="utf-8")
    (OUT / "db_views.sql").write_text(hdr.format(what="VIEWS") + "\n\n".join(f"CREATE OR REPLACE VIEW {v} AS\n{d.rstrip()}" for v, d in views) + "\n", encoding="utf-8")
    print(f"dumped {len(fns)} functions, {len(views)} views into {OUT}/ ({stamp})")
    for n, _ in fns:
        print("  fn  ", n)
    for v, _ in views:
        print("  view", v)


if __name__ == "__main__":
    main()
