#!/usr/bin/env python3
"""
MODEL-PARAMETER HISTORY (retention audit 2026-10-08; owner: "everything is retained for future calibration").

Several tables are rebuilt in place every day or week and keep only their LATEST rows: nba_score.blowout_model and
nba_score.confidence_model / confidence_verification (P2B refits, whole-table replace), the as-of ladder calibration
(rebuilt per season), the weekly validator verdicts (slip_validation*) and the candidate certifier (cand_certified).
The parameters that priced a PAST slate were therefore unrecoverable. This script copies the named tables' rows, as JSON,
into ONE append-only history keyed by the as-of date, so any day's fit can be read back exactly as it stood.

    nba_score.model_params_history (as_of_date, source_table, row_md5, row jsonb, captured_at)

Idempotent: the same row on the same date is never duplicated (ON CONFLICT DO NOTHING). A rerun of the day replaces
nothing - both versions stay, distinguishable by captured_at (the owner's "one set per day" rule applies to the PRODUCT
tables; this is the audit trail behind them).

Env: DATABASE_URL; SNAP_DATE (as-of date, default today PT); SNAP_TABLES = comma list of "schema.table" or
"schema.table|<where clause>" (the where clause may use {d} for the as-of date), e.g.
    SNAP_TABLES="nba_score.blowout_model,nba_score.confidence_model,nba_score.ladder_calibration_asof|as_of_date='{d}'"
"""
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

import psycopg

DDL = """CREATE TABLE IF NOT EXISTS nba_score.model_params_history (
    as_of_date date NOT NULL, source_table text NOT NULL, row_md5 text NOT NULL, row jsonb NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (as_of_date, source_table, row_md5))"""


def main():
    day = date.fromisoformat(os.environ.get('SNAP_DATE') or datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat())
    specs = [s.strip() for s in os.environ.get('SNAP_TABLES', '').split(',') if s.strip()]
    if not specs:
        raise SystemExit("SNAP_TABLES is empty - nothing to snapshot")
    conn = psycopg.connect(os.environ['DATABASE_URL'])
    conn.execute("SET statement_timeout = 0")
    conn.execute(DDL)
    conn.commit()
    for spec in specs:
        table, _, where = spec.partition('|')
        schema, _, name = table.partition('.')
        if not schema or not name or not all(p.replace('_', '').isalnum() for p in (schema, name)):
            raise SystemExit(f"bad table spec: {spec}")
        if conn.execute("SELECT to_regclass(%s)", (table,)).fetchone()[0] is None:
            print(f"  {table}: does not exist - skipped", flush=True)
            continue
        cond = (" WHERE " + where.format(d=day.isoformat())) if where else ""
        n = conn.execute(f"""INSERT INTO nba_score.model_params_history (as_of_date, source_table, row_md5, row)
                             SELECT %s, %s, md5(to_jsonb(t)::text), to_jsonb(t) FROM {schema}.{name} t{cond}
                             ON CONFLICT DO NOTHING""", (day, table)).rowcount
        total = conn.execute(f"SELECT count(*) FROM {schema}.{name} t{cond}").fetchone()[0]
        conn.commit()
        print(f"  {table}{' [' + where + ']' if where else ''}: {total} rows, {n} new in history for {day}", flush=True)


if __name__ == '__main__':
    main()
