#!/usr/bin/env python3
"""
LOSSLESS DATABASE COMPACTION (2026-10-13, owner: "without losing any data, no regression, no loss, no compromise, is there any
cleanup or data size improvement we can make?").

WHAT IT DOES. Rewrites tables whose files carry measured empty space (VACUUM FULL: same rows, same columns, same indexes, rebuilt
densely) and drops two secondary indexes of a frozen, reader-less legacy copy. NO ROW IS DELETED OR CHANGED - each table's row count
and a whole-content fingerprint (sum of a 64-bit hash of every row's full text) are taken before and after the rewrite and must be
identical, else the run stops and fails. Indexes are rebuilt by the rewrite with their exact definitions.

WHY THE SPACE IS THERE (measured 2026-10-13 with pgstattuple_approx / pgstatindex): the 10-10 Flex-with-alternates regrade
UPDATED the four PrizePicks slip tables (old row versions left ~25 % free); tier_map_legs (50 % free, PK leaf density 34 %),
board_rung_keys (30 % free, PK 50 %), injury_report_snapshots (40 % free, 51 %) and final_hp (13 % free) are rebuilt by
delete-then-insert loaders; board_scored's unique index sits at 65 % density. Plain VACUUM marks that space reusable but never
returns it; only a rewrite does.

SAFETY. Runs off-hours only (refuses while any slate pipeline holds a claim); lock_timeout so it never waits on a pipeline;
tables in ascending size so each rewrite frees room before the next needs temporary space (a rewrite needs about the table's own
size free - COMPASS fact 65, the 2026-09 read-only incident); MLB schemas are never touched.
Env: DATABASE_URL, COMPACT_TABLES (comma list override), COMPACT_DRY=1 (measure only), COMPACT_SKIP_LEGACY_IDX=1.
"""
import os
import sys
import time

import psycopg

TABLES = [
    "nba_daily.injury_report_snapshots",
    "nba_score.slip_engine_slips",
    "nba_score.slip_engine_slips_mf",
    "nba_score.slip_engine_slips_nosteals",
    "nba_score.slip_engine_slips_mf_nosteals",
    "nba_market.board_rung_keys",
    "nba_score.tier_map_legs",
    "nba_score.final_hp",
    "nba_score.board_scored",
]
# frozen copy kept for retention (renamed 2026-10-08, T44-4); no code reads it - its rows stay, only lookup indexes go
LEGACY_IDX = ["nba_market.board_tiers_join_idx", "nba_market.board_tiers_nm_idx"]
NBA_SCHEMAS = ("nba_score.", "nba_market.", "nba_daily.", "nba_stats.", "nba_team.", "nba_ref.", "nba_calendar.")


def size(c, rel):
    return c.execute("SELECT pg_total_relation_size(%s::regclass)", (rel,)).fetchone()[0]


def fingerprint(c, t):
    return c.execute(f"SELECT count(*), coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) FROM {t} x").fetchone()


def mb(b):
    return f"{b / 1048576:,.0f} MB"


def main():
    dry = os.environ.get("COMPACT_DRY") == "1"
    tables = [t.strip() for t in (os.environ.get("COMPACT_TABLES") or ",".join(TABLES)).split(",") if t.strip()]
    if any(not t.startswith(NBA_SCHEMAS) for t in tables):
        sys.exit("REFUSED: only NBA schemas may be compacted here")
    c = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    busy = c.execute("SELECT pipeline, run_key FROM nba_control.pipeline_runs WHERE status='claimed'").fetchall()
    if busy:
        sys.exit(f"REFUSED: a pipeline is running {busy} - compaction runs off-hours only")
    c.execute("SET lock_timeout = '60s'")
    c.execute("SET statement_timeout = 0")
    db0 = c.execute("SELECT pg_database_size(current_database())").fetchone()[0]
    print(f"database before: {mb(db0)} | {'DRY RUN' if dry else 'COMPACTING'} {len(tables)} tables", flush=True)
    tables.sort(key=lambda t: size(c, t))
    total_saved = 0
    for t in tables:
        s0 = size(c, t)
        t0 = time.time()
        fp0 = fingerprint(c, t)
        if dry:
            print(f"  {t:<42} {mb(s0):>10}  rows {fp0[0]:,}  fingerprint {time.time() - t0:.0f}s  (dry run)", flush=True)
            continue
        try:
            c.execute(f"VACUUM (FULL, ANALYZE) {t}")
        except psycopg.errors.LockNotAvailable:
            print(f"  {t:<42} SKIPPED - busy (lock not granted in 60 s)", flush=True)
            continue
        fp1 = fingerprint(c, t)
        s1 = size(c, t)
        if fp1 != fp0:
            sys.exit(f"STOP: {t} content fingerprint changed {fp0} -> {fp1} - investigate before anything else")
        total_saved += s0 - s1
        print(f"  {t:<42} {mb(s0):>10} -> {mb(s1):>10}  saved {mb(s0 - s1):>8}  rows {fp1[0]:,} identical, fingerprint identical"
              f"  ({time.time() - t0:.0f}s)", flush=True)
    if not dry and os.environ.get("COMPACT_SKIP_LEGACY_IDX") != "1":
        for ix in LEGACY_IDX:
            row = c.execute("SELECT pg_get_indexdef(%s::regclass), pg_relation_size(%s::regclass)", (ix, ix)).fetchone() \
                if c.execute("SELECT to_regclass(%s)", (ix,)).fetchone()[0] else None
            if not row:
                print(f"  {ix}: already absent", flush=True)
                continue
            c.execute(f"DROP INDEX {ix}")
            total_saved += row[1]
            print(f"  dropped {ix} ({mb(row[1])}) - recreate with: {row[0]};", flush=True)
    db1 = c.execute("SELECT pg_database_size(current_database())").fetchone()[0]
    print(f"database after: {mb(db1)} (was {mb(db0)}; compaction saved {mb(total_saved)})", flush=True)


if __name__ == "__main__":
    main()
