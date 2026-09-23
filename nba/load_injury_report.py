#!/usr/bin/env python3
"""
INJURY REPORT LOADER -> nba_daily.injury_report_snapshots

WHY THIS EXISTS. `NBA_ENRICHMENT_MINING_AND_FALLBACKS.md` build item 1 specifies
"scrape_nba_injury_report.py (daily + backfill modes) + loader -> nba_daily.injury_report_snapshots".
The scraper was built; the loader never was. So the binding availability input - A1 own status, N1
P(plays|Questionable), N2 injury class, A6 late scratch, A9 suspension, and the day-before report the
baseline reads - lived ONLY as JSON in the repo (2025-26: 176 days, 919,949 rows across 7 monthly
shards; 2024-25: 174 days, 418,071 rows), and `nba_daily` held zero tables. Nothing could query it,
which is what "stored" has to mean for the factor that gates availability.

WHAT IT PRESERVES. One row per (game_date, snapshot_ts, team, player) - the SNAPSHOT semantics, not a
daily summary. That is the PARITY RULE (doc section 8): the backfill must be the same object the daily
run produces, so "what was known at 12:30 PM" stays distinguishable from "what was known at 7:45 PM".
Truth (box-score DNP) lives elsewhere and is never mixed in here.

Modes:
  current  (default) - load nba/data/nba_injury_report_current.json (what P2/P3 just scraped)
  archive            - INJURY_LOAD_SLUG=2025_26 loads every monthly shard for that season slug

Env: DATABASE_URL, INJURY_LOAD_MODE (current|archive), INJURY_LOAD_SLUG, INJURY_DATA_DIR (default nba/data)
"""
import glob
import json
import os
from pathlib import Path

import psycopg

DDL = """
CREATE SCHEMA IF NOT EXISTS nba_daily;
CREATE TABLE IF NOT EXISTS nba_daily.injury_report_snapshots (
    game_date date NOT NULL,
    snapshot_ts timestamptz NOT NULL,
    team text NOT NULL,
    player_name text,
    status text,
    reason text,
    reason_class text,
    game_time text,
    matchup text,
    source_url text,
    loaded_at timestamptz DEFAULT now())
"""

# NOT_YET_SUBMITTED rows carry player_name NULL and are meaningful (the team had not filed yet), so the
# key coalesces the name rather than dropping those rows.
IDX = """CREATE UNIQUE INDEX injury_report_snap_uidx ON nba_daily.injury_report_snapshots
         (game_date, snapshot_ts, team, coalesce(player_name, '__NOT_SUBMITTED__'))"""
LOOKUP = """CREATE INDEX injury_report_lookup ON nba_daily.injury_report_snapshots
            (game_date, team, snapshot_ts DESC)"""

INSERT = """INSERT INTO nba_daily.injury_report_snapshots
    (game_date, snapshot_ts, team, player_name, status, reason, reason_class, game_time, matchup, source_url)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (game_date, snapshot_ts, team, coalesce(player_name, '__NOT_SUBMITTED__')) DO UPDATE SET
      status = EXCLUDED.status, reason = EXCLUDED.reason, reason_class = EXCLUDED.reason_class,
      game_time = EXCLUDED.game_time, matchup = EXCLUDED.matchup, source_url = EXCLUDED.source_url,
      loaded_at = now()"""


def files_to_load():
    data = Path(os.environ.get("INJURY_DATA_DIR", "nba/data"))
    mode = os.environ.get("INJURY_LOAD_MODE", "current").lower()
    if mode == "archive":
        slug = os.environ["INJURY_LOAD_SLUG"]
        found = sorted(glob.glob(str(data / f"nba_injury_report_{slug}_[0-9][0-9][0-9][0-9]-[0-9][0-9].json")))
        if not found:
            raise SystemExit(f"ABORT: no monthly shards for slug {slug} in {data}")
        return found
    f = data / "nba_injury_report_current.json"
    if not f.exists():
        raise SystemExit(f"ABORT: {f} not found - run the scraper first")
    return [str(f)]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute(DDL)
        # DEADLOCK (NBA_SYSTEM_DESIGN section T23.5): `CREATE ... IF NOT EXISTS` takes a full table lock
        # before discovering the index exists, which deadlocks parallel runs. Check first.
        if cur.execute("SELECT to_regclass('nba_daily.injury_report_snap_uidx')").fetchone()[0] is None:
            cur.execute(IDX)
        if cur.execute("SELECT to_regclass('nba_daily.injury_report_lookup')").fetchone()[0] is None:
            cur.execute(LOOKUP)
    conn.commit()

    total = 0
    for path in files_to_load():
        rows = json.loads(Path(path).read_text()).get("rows", [])
        batch = [(r.get("game_date"), r.get("snapshot_ts"), r.get("team"), r.get("player_name"),
                  r.get("status"), r.get("reason"), r.get("reason_class"), r.get("game_time"),
                  r.get("matchup"), r.get("source_url")) for r in rows
                 if r.get("game_date") and r.get("snapshot_ts") and r.get("team")]
        skipped = len(rows) - len(batch)
        with conn.cursor() as cur:
            cur.executemany(INSERT, batch)
        conn.commit()
        total += len(batch)
        print(f"{Path(path).name}: {len(batch):,} rows loaded"
              + (f" ({skipped:,} skipped - missing date/snapshot/team)" if skipped else ""), flush=True)

    with conn.cursor() as cur:
        cur.execute("""SELECT count(*), count(DISTINCT game_date), count(DISTINCT snapshot_ts),
                              min(game_date), max(game_date) FROM nba_daily.injury_report_snapshots""")
        n, days, snaps, lo, hi = cur.fetchone()
    print(f"\nINJURY_LOADED|{total:,} this run | table: {n:,} rows, {days} dates, {snaps:,} snapshots, {lo} -> {hi}",
          flush=True)
    conn.close()


if __name__ == "__main__":
    main()
