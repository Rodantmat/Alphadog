#!/usr/bin/env python3
"""
STORAGE DIET — reclaim bloat without losing anything (config storage_diet_plan_2026_09_17).

WHY NOW. The engine is complete (60/60 season-props verified), so the tables are stable. Repeated
delete-and-rewrite cycles per prop left heavy dead-tuple bloat: nba_score.final_hp reached 13 GB and
baseline_history 12 GB on a 30 GiB disk. VACUUM FULL rewrites each table compactly and reclaims that
space. NOTHING is deleted - the row counts are asserted identical before and after.

ORDER MATTERS. VACUUM FULL takes an ACCESS EXCLUSIVE lock, so it runs here (a job with no request
timeout) rather than through the SQL bridge, one table at a time, and only when no build is writing.

Already done by hand before this script: the superseded A2 panels (absence_panel, _v2, _v3,
redistribution_panel) and the PASTED nba_score.ladder_calibration were dropped - their findings live in
COMPASS facts 91 and 100 and the tables are rebuildable from their scripts.

Env: DATABASE_URL, DIET_TABLES (comma-separated, default the big four)
"""
import os
import time

import psycopg

DEFAULT = ("nba_score.final_hp", "nba_market.board_snapshots",
           "nba_market.board_outcomes", "nba_score.baseline_history")


def main():
    tables = [t.strip() for t in os.environ.get("DIET_TABLES", ",".join(DEFAULT)).split(",") if t.strip()]
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)   # VACUUM cannot run in a txn
    conn.execute("SET statement_timeout = 0")
    conn.execute("SET lock_timeout = '10min'")

    print(f"{'table':<34}{'before':>12}{'rows before':>14}{'after':>12}{'rows after':>13}{'saved':>12}")
    total_saved = 0
    for t in tables:
        with conn.cursor() as cur:
            cur.execute(f"SELECT pg_total_relation_size('{t}'), pg_size_pretty(pg_total_relation_size('{t}'))")
            b_bytes, b_pretty = cur.fetchone()
            cur.execute(f"SELECT count(*) FROM {t}")
            b_rows = cur.fetchone()[0]
        started = time.time()
        try:
            with conn.cursor() as cur:
                cur.execute(f"VACUUM (FULL, ANALYZE) {t}")
        except Exception as exc:  # noqa: BLE001
            print(f"{t:<34}  SKIPPED ({str(exc)[:70]})", flush=True)
            continue
        with conn.cursor() as cur:
            cur.execute(f"SELECT pg_total_relation_size('{t}'), pg_size_pretty(pg_total_relation_size('{t}'))")
            a_bytes, a_pretty = cur.fetchone()
            cur.execute(f"SELECT count(*) FROM {t}")
            a_rows = cur.fetchone()[0]
        saved = b_bytes - a_bytes
        total_saved += max(saved, 0)
        # THE GUARD: a diet must not lose data. If the row count moved, say so loudly.
        flag = "" if a_rows == b_rows else "   <<< ROW COUNT CHANGED - INVESTIGATE"
        print(f"{t:<34}{b_pretty:>12}{b_rows:>14,}{a_pretty:>12}{a_rows:>13,}"
              f"{round(saved/1024/1024):>10} MB{flag}   ({time.time()-started:.0f}s)", flush=True)

    with conn.cursor() as cur:
        cur.execute("""SELECT pg_size_pretty(sum(pg_total_relation_size(relid)))
                       FROM pg_stat_user_tables WHERE schemaname LIKE 'nba%'""")
        print(f"\nnba_* total after diet: {cur.fetchone()[0]}   (reclaimed "
              f"{round(total_saved/1024/1024/1024, 2)} GB this run)", flush=True)

    # index audit - an unused index on a 38M-row table is pure cost
    print("\nINDEX USAGE (idx_scan = 0 means it has never been used since stats reset)", flush=True)
    with conn.cursor() as cur:
        cur.execute("""SELECT schemaname||'.'||relname, indexrelname, idx_scan,
                              pg_size_pretty(pg_relation_size(indexrelid))
                       FROM pg_stat_user_indexes
                       WHERE schemaname LIKE 'nba%' AND pg_relation_size(indexrelid) > 50*1024*1024
                       ORDER BY idx_scan, pg_relation_size(indexrelid) DESC""")
        for r in cur.fetchall():
            mark = "  <== never used" if r[2] == 0 else ""
            print(f"  {r[0]:<34}{r[1]:<36}scans {r[2]:>9,}  {r[3]:>10}{mark}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
