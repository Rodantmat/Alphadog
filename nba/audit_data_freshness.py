#!/usr/bin/env python3
"""
AUDIT - IS EVERY NBA TABLE STILL BEING FED? (2026-10-22 PT; owner 09:13 PT: "deep scrutiny to see if those pipelines are doing
everything that they should be doing. Mining everything that they should mine, consuming everything they should consume").
READ-ONLY.

For every table in the nba_* schemas: row count (planner estimate) and the newest value of its best time column (first found of
game_date, slate_date, as_of_date, run_date, snapshot_ts, captured_at, fetched_at, loaded_at, updated_at, created_at, built_at,
graded_at, placed_at). Flags:
  STALE    newest value older than AF_STALE_DAYS (default 3) days while the season is running (it was fed before, stopped since)
  EMPTY    0 rows
  NO-TIME  no recognised time column (listed, not judged)
Only reads catalog views and max() of one column per table (statement_timeout 20 s per table; a timeout is printed, not fatal).
Env: DATABASE_URL, AF_STALE_DAYS (3), AF_SCHEMAS (nba_calendar,nba_config,nba_control,nba_daily,nba_market,nba_ref,nba_score,nba_stats,nba_main_ui).
"""
import datetime as dt
import os

import psycopg

TIME_COLS = ("game_date", "slate_date", "as_of_date", "run_date", "snapshot_ts", "captured_at", "fetched_at", "loaded_at", "updated_at",
             "created_at", "built_at", "graded_at", "placed_at", "claimed_at", "saved_at", "game_datetime_utc")


def main():
    stale_days = int(os.environ.get("AF_STALE_DAYS") or "3")
    schemas = [s for s in (os.environ.get("AF_SCHEMAS") or
               "nba_calendar,nba_config,nba_control,nba_daily,nba_market,nba_ref,nba_score,nba_stats,nba_main_ui").split(",") if s]
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = '20s'")
    tabs = conn.execute("""SELECT c.relname, n.nspname, c.reltuples::bigint, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                           WHERE n.nspname = ANY(%s) AND c.relkind IN ('r', 'p', 'm') ORDER BY 2, 1""", (schemas,)).fetchall()
    cols = {}
    for sch, tab, col, typ in conn.execute("""SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
                                              WHERE table_schema = ANY(%s)""", (schemas,)).fetchall():
        cols.setdefault((sch, tab), {})[col] = typ
    today = dt.date.today()
    out = {"STALE": [], "EMPTY": [], "NO-TIME": [], "OK": [], "ERROR": []}
    for tab, sch, est, kind in tabs:
        c = cols.get((sch, tab), {})
        tc = next((x for x in TIME_COLS if x in c and ("date" in c[x] or "time" in c[x])), None)
        try:
            if est <= 0:
                n = conn.execute(f'SELECT count(*) FROM "{sch}"."{tab}"').fetchone()[0]
            else:
                n = est
            if n == 0:
                out["EMPTY"].append((sch, tab, 0, None, None))
                continue
            if tc is None:
                out["NO-TIME"].append((sch, tab, n, None, None))
                continue
            mx = conn.execute(f'SELECT max("{tc}") FROM "{sch}"."{tab}"').fetchone()[0]
        except Exception as exc:  # noqa: BLE001
            out["ERROR"].append((sch, tab, est, tc, type(exc).__name__))
            continue
        d = mx.date() if isinstance(mx, dt.datetime) else mx
        age = (today - d).days if isinstance(d, dt.date) else None
        key = "STALE" if age is not None and age > stale_days else "OK"
        out[key].append((sch, tab, n, tc, f"{mx} ({age} d)" if age is not None else str(mx)))
    for key in ("STALE", "EMPTY", "ERROR", "NO-TIME", "OK"):
        print(f"\n{key} ({len(out[key])})")
        for sch, tab, n, tc, v in out[key]:
            print(f"  {sch}.{tab:<55} rows~{n:>12,} {tc or '':<18} {v or ''}")


if __name__ == "__main__":
    main()
