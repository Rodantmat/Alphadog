#!/usr/bin/env python3
"""
PROVE AN OFF-DATABASE ARCHIVE BEFORE ANYTHING IS REMOVED (2026-10-13, owner: "if it is useless it can go, but you need to be sure").
For every table listed: download its per-season CSV.GZ assets from the db-archive release, load them into a TEMP copy of the
table (CREATE TEMP TABLE ... (LIKE source)), and compare the row count and a whole-content fingerprint (sum of a 64-bit hash of
every row's full text) against the live table. A table is RESTORABLE only when both match exactly; nothing is ever dropped here.
Env: DATABASE_URL, GH_TOKEN, VERIFY_TAG (release tag), VERIFY_TABLES (comma list schema.table), VERIFY_SEASONS.
"""
import gzip
import os
import subprocess
import sys
from pathlib import Path

import psycopg


def fp(c, t):
    return c.execute(f"SELECT count(*), coalesce(sum(hashtextextended(x::text, 0)::numeric), 0) FROM {t} x").fetchone()


def main():
    tag = os.environ["VERIFY_TAG"]
    tables = [t.strip() for t in os.environ["VERIFY_TABLES"].split(",") if t.strip()]
    seasons = [s.strip() for s in os.environ.get("VERIFY_SEASONS", "2024-25,2025-26").split(",") if s.strip()]
    d = Path("restore_check"); d.mkdir(exist_ok=True)
    c = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    c.execute("SET statement_timeout = 0")
    bad = []
    for t in tables:
        tmp = "_rv_" + t.split(".")[1]
        c.execute(f"DROP TABLE IF EXISTS pg_temp.{tmp}")
        c.execute(f"CREATE TEMP TABLE {tmp} (LIKE {t})")
        files = 0
        for s in seasons:
            name = f"{t}.{s}.csv.gz"
            r = subprocess.run(["gh", "release", "download", tag, "-p", name, "-D", str(d), "--clobber"], capture_output=True, text=True)
            if r.returncode != 0 or not (d / name).exists():
                continue
            files += 1
            with gzip.open(d / name, "rb") as fh, c.cursor() as cur, cur.copy(f"COPY {tmp} FROM STDIN WITH (FORMAT csv, HEADER)") as cp:
                while True:
                    chunk = fh.read(1 << 20)
                    if not chunk:
                        break
                    cp.write(chunk)
            (d / name).unlink()
        live, arch = fp(c, t), fp(c, tmp)
        ok = files > 0 and live == arch
        print(f"  {'RESTORABLE' if ok else 'NOT PROVEN'}  {t:<52} live {live[0]:>9,} rows | archive {arch[0]:>9,} rows from {files} file(s)"
              f" | fingerprint {'identical' if live[1] == arch[1] else 'DIFFERENT'}", flush=True)
        if not ok:
            bad.append(t)
        c.execute(f"DROP TABLE {tmp}")
    if bad:
        print(f"::error::not proven restorable: {' '.join(bad)}")
        sys.exit(1)
    print(f"ALL {len(tables)} TABLES PROVEN RESTORABLE from release {tag} (row count and full-content fingerprint identical)")


if __name__ == "__main__":
    main()
