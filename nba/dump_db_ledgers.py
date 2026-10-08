#!/usr/bin/env python3
"""
WEEKLY GIT ARCHIVE OF THE DATABASE-ONLY LEDGERS (retention audit 2026-10-08).

The provider keeps daily backups of the Postgres cluster for SEVEN days (DigitalOcean managed PostgreSQL; restore = a new
cluster). Everything else the system mines has a second copy in git already (board files, injury PDFs parsed to JSON, the
dated ladder .json.gz, the season stat files) - EXCEPT the live ledgers and the parameter history, which exist only in
Postgres: live slips and strategy states, the Underdog paper slips, the weekly verdicts, the certification log, the price-
shopping ledger, the model-parameter history, the referee crews, the morning game lines, the pipeline run records and the
tunables. A mistaken DELETE older than seven days would be unrecoverable. This writes each of those tables, whole (or the
live-season rows for the one large table), as CSV.GZ under nba/data/db_archive/ and the workflow commits them weekly.
They are small (kilobytes to a few MB); the big ingredient tables are NOT dumped here (their copies are the raw files).

Env: DATABASE_URL; DUMP_SINCE (date floor for tables listed with a date column; default 2026-07-01 = the 2026-27 season).
Never dumps nba_config.external_credentials.
"""
import gzip
import os
from pathlib import Path

import psycopg

OUT = Path("nba/data/db_archive")
# "schema.table" or "schema.table|date_column" (rows with date_column >= DUMP_SINCE only)
TABLES = [
    "nba_score.live_slips", "nba_score.live_pool", "nba_score.live_strategy_state", "nba_score.live_state_history",
    "nba_score.live_strategy_calib", "nba_score.weekly_requal", "nba_score.certification_log", "nba_score.paper_picks",
    "nba_score.price_shop_ledger", "nba_score.model_params_history", "nba_score.edge_monitor", "nba_score.edge_monitor_ref",
    "nba_score.ud_live_slips", "nba_score.ud_edge_monitor", "nba_score.ud_edge_monitor_ref",
    "nba_score.baseline_prune_log", "nba_score.baseline_ladder_runs", "nba_score.availability_delta|game_date",
    "nba_ref.referee_assignments", "nba_ref.referee_assignments_log",
    "nba_market.game_lines_snapshots|game_date", "nba_market.game_lines_snapshot_log",
    "nba_control.pipeline_runs", "nba_control.scheduler_log", "nba_config.classification_config",
    # postseason certification (§31w, 2026-10-08): the cell eligibility and the per-strategy verdict the live engine reads
    "nba_score.cell_certified_post", "nba_score.cell_postseason_eligibility", "nba_score.postseason_strategy_verdict",
]


def main():
    since = os.environ.get("DUMP_SINCE", "2026-07-01")
    OUT.mkdir(parents=True, exist_ok=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = '600s'")
    written = 0
    for spec in TABLES:
        table, _, col = spec.partition("|")
        if table == "nba_config.external_credentials":
            raise SystemExit("refusing to dump credentials")
        if conn.execute("SELECT to_regclass(%s)", (table,)).fetchone()[0] is None:
            print(f"  {table}: does not exist yet - skipped", flush=True)
            continue
        where = f" WHERE {col} >= '{since}'" if col else ""
        path = OUT / f"{table}.csv.gz"
        n = 0
        with conn.cursor() as cur, cur.copy(f"COPY (SELECT * FROM {table}{where} ORDER BY 1) TO STDOUT WITH (FORMAT csv, HEADER)") as cp, \
                gzip.open(path, "wb", compresslevel=9) as f:
            for chunk in cp:
                f.write(chunk)
                n += bytes(chunk).count(b"\n")
        print(f"  {table}{' [' + col + ' >= ' + since + ']' if col else ''}: {max(n - 1, 0):,} rows -> {path} ({path.stat().st_size:,} bytes)", flush=True)
        written += 1
    print(f"archived {written} tables into {OUT}/", flush=True)


if __name__ == "__main__":
    main()
