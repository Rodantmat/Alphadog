#!/usr/bin/env python3
"""
One-off maintenance: shrink nba_market.board_snapshots by replacing the 7-column primary key
(5.6 GB on 25.7M rows) with a compact unique expression index on an md5->uuid leg key (~1 GB).

Safety rules (nothing may be lost):
  1. Build the new UNIQUE index FIRST. If any duplicate row exists, the build FAILS and we stop -
     that doubles as a duplicate check. The old PK is untouched until the new index is valid.
  2. Only after the new index reports indisvalid do we drop the primary key constraint.
  3. Row count is captured before and after and must match exactly.
  4. Any orphaned invalid index from a previous attempt is dropped first.

After this, ON CONFLICT must target the expression (see backfill_board_snapshots.py), not the old
column list.
"""
import os
import sys

import psycopg

LEG_EXPR = ("(md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||"
            "coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||coalesce(line::text,''))::uuid)")


def size(cur, sql, *a):
    cur.execute(sql, a)
    r = cur.fetchone()
    return r[0] if r else None


def main():
    dsn = os.environ["DATABASE_URL"]
    conn = psycopg.connect(dsn, autocommit=True)
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        rows_before = size(cur, "SELECT count(*) FROM nba_market.board_snapshots")
        print("rows before:", rows_before, flush=True)
        print("db size before:", size(cur, "SELECT pg_size_pretty(pg_database_size(current_database()))"), flush=True)
        print("table total before:", size(cur, "SELECT pg_size_pretty(pg_total_relation_size('nba_market.board_snapshots'))"), flush=True)

        cur.execute("""SELECT i.indexrelid::regclass::text, i.indisvalid FROM pg_index i
                       JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                       WHERE n.nspname='nba_market' AND c.relname='board_snapshots'""")
        for name, valid in cur.fetchall():
            print("existing index:", name, "valid=", valid, flush=True)
            if name.endswith("leg_uidx") and not valid:
                print("dropping orphaned invalid index", name, flush=True)
                cur.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")

        print("building new unique index (fails loudly if duplicates exist)...", flush=True)
        cur.execute(f"CREATE UNIQUE INDEX CONCURRENTLY board_snapshots_leg_uidx ON nba_market.board_snapshots ({LEG_EXPR})")
        cur.execute("""SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                       WHERE c.relname='board_snapshots_leg_uidx'""")
        valid = cur.fetchone()[0]
        print("new index valid:", valid, "size:", size(cur, "SELECT pg_size_pretty(pg_relation_size('nba_market.board_snapshots_leg_uidx'))"), flush=True)
        if not valid:
            print("ABORT: new index is not valid; primary key left in place", file=sys.stderr)
            sys.exit(1)

        print("dropping the old 7-column primary key...", flush=True)
        cur.execute("ALTER TABLE nba_market.board_snapshots DROP CONSTRAINT IF EXISTS board_snapshots_pkey")

        rows_after = size(cur, "SELECT count(*) FROM nba_market.board_snapshots")
        print("rows after:", rows_after, flush=True)
        if rows_after != rows_before:
            print(f"ABORT: row count changed {rows_before} -> {rows_after}", file=sys.stderr)
            sys.exit(1)
        print("db size after:", size(cur, "SELECT pg_size_pretty(pg_database_size(current_database()))"), flush=True)
        print("table total after:", size(cur, "SELECT pg_size_pretty(pg_total_relation_size('nba_market.board_snapshots'))"), flush=True)
        print("DONE - uniqueness preserved by board_snapshots_leg_uidx, no rows lost", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
